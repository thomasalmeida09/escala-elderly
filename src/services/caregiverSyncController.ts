import {
  type ConnectionStatus,
  type Cuidador,
  applyStatusChange,
  nextOperationalStatus,
} from '../types/caregiver';
import {
  CaregiverApiError,
  type CaregiverApiClient,
  defaultCaregiverApiClient,
  isAbortedApiError,
} from './caregiverApi';
import { validateCoverageAssignment } from './coverageEngine';
import { type LocalFirstStore, defaultLocalFirstStore, getCanonicalSeed } from './localFirstStore';

export const CARLOS_ROCHA_ID = 3;

export interface ConnectivityEventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export interface CaregiverScheduleSnapshot {
  readonly cuidadores: Cuidador[];
  readonly connectionStatus: ConnectionStatus;
  readonly pendingRemoteSync: boolean;
}

export interface CaregiverScheduleControllerOptions {
  readonly store?: LocalFirstStore;
  readonly api?: CaregiverApiClient;
  readonly eventTarget?: ConnectivityEventTarget | null;
}

export interface CaregiverScheduleController {
  getSnapshot(): CaregiverScheduleSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  dispose(): void;
  reconcile(): Promise<void>;
  toggleCaregiverStatus(id: number): Promise<void>;
  simulateCarlosAbsence(): Promise<void>;
  confirmCaregiverCoverage(absentCaregiverId: number, substituteName: string): Promise<void>;
  resetSchedule(): Promise<void>;
}

function resolveDefaultEventTarget(): ConnectivityEventTarget | null {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    return window;
  }
  return null;
}

function createFrozenSnapshot(
  cuidadores: readonly Cuidador[],
  connectionStatus: ConnectionStatus,
  pendingRemoteSync: boolean
): CaregiverScheduleSnapshot {
  return Object.freeze({
    cuidadores: [...cuidadores],
    connectionStatus,
    pendingRemoteSync,
  });
}

export function createCaregiverScheduleController(
  options: CaregiverScheduleControllerOptions = {}
): CaregiverScheduleController {
  const store = options.store ?? defaultLocalFirstStore;
  const api = options.api ?? defaultCaregiverApiClient;
  const eventTarget =
    options.eventTarget !== undefined ? options.eventTarget : resolveDefaultEventTarget();

  // Synchronous 0ms hydration on construction (zero artificial delay, zero CLS)
  const hydrated = store.readInitialState();
  let snapshot: CaregiverScheduleSnapshot = createFrozenSnapshot(
    hydrated.cuidadores,
    'checking',
    hydrated.pendingRemoteSync
  );

  let fullBatchDirty = hydrated.pendingRemoteSync;
  const dirtyCardIds = new Set<number>();

  let started = false;
  let disposed = false;
  let revision = 0;

  let reconcileAbort: AbortController | null = null;
  let mutationBatchAbort: AbortController | null = null;
  const itemMutationAborts = new Map<number, AbortController>();

  const listeners = new Set<() => void>();

  function emit(next: CaregiverScheduleSnapshot): void {
    if (disposed) {
      return;
    }
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function abortAllMutationRequests(): void {
    mutationBatchAbort?.abort();
    mutationBatchAbort = null;
    for (const controller of itemMutationAborts.values()) {
      controller.abort();
    }
    itemMutationAborts.clear();
  }

  function abortReconcileRequest(): void {
    reconcileAbort?.abort();
    reconcileAbort = null;
  }

  async function reconcile(): Promise<void> {
    if (disposed) {
      return;
    }

    abortReconcileRequest();
    const startRevision = revision;
    const localState = snapshot;

    if (localState.connectionStatus === 'local-first') {
      emit(createFrozenSnapshot(localState.cuidadores, 'checking', localState.pendingRemoteSync));
    }

    const controller = new AbortController();
    reconcileAbort = controller;

    try {
      if (localState.pendingRemoteSync || fullBatchDirty || dirtyCardIds.size > 0) {
        const remoteList = await api.syncCaregiversBatch(localState.cuidadores, controller.signal);
        if (disposed || controller.signal.aborted || revision !== startRevision) {
          return;
        }
        fullBatchDirty = false;
        dirtyCardIds.clear();
        store.writeSnapshot(remoteList, false);
        emit(createFrozenSnapshot(remoteList, 'online', false));
        return;
      }

      const remoteList = await api.fetchCaregivers(controller.signal);
      if (disposed || controller.signal.aborted || revision !== startRevision) {
        return;
      }
      fullBatchDirty = false;
      dirtyCardIds.clear();
      store.writeSnapshot(remoteList, false);
      emit(createFrozenSnapshot(remoteList, 'online', false));
    } catch (error) {
      if (disposed || isAbortedApiError(error) || controller.signal.aborted) {
        return;
      }

      // If local dirty batch was rejected with HTTP 400, attempt clean recovery via GET
      if (
        error instanceof CaregiverApiError &&
        error.kind === 'http' &&
        error.status === 400 &&
        revision === startRevision
      ) {
        try {
          const recovered = await api.fetchCaregivers(controller.signal);
          if (disposed || controller.signal.aborted || revision !== startRevision) {
            return;
          }
          fullBatchDirty = false;
          dirtyCardIds.clear();
          store.writeSnapshot(recovered, false);
          emit(createFrozenSnapshot(recovered, 'online', false));
          return;
        } catch (recoveryError) {
          if (disposed || isAbortedApiError(recoveryError) || controller.signal.aborted) {
            return;
          }
        }
      }

      emit(createFrozenSnapshot(snapshot.cuidadores, 'local-first', snapshot.pendingRemoteSync));
    } finally {
      if (reconcileAbort === controller) {
        reconcileAbort = null;
      }
    }
  }

  async function mutateSingleOrPromoteBatch(
    targetId: number,
    computeUpdated: (current: Cuidador) => Cuidador
  ): Promise<void> {
    if (disposed) {
      return;
    }

    const existing = snapshot.cuidadores.find((item) => item.id === targetId);
    if (!existing) {
      return;
    }

    // Cancel any boot/reconnect GET so stale remote state cannot clobber user action
    abortReconcileRequest();

    const updatedItem = computeUpdated(existing);
    const nextList = snapshot.cuidadores.map((item) => (item.id === targetId ? updatedItem : item));

    dirtyCardIds.add(targetId);
    const myRevision = ++revision;

    // Keep 'online' badge steady during rapid clicks when already online (WCAG aria-live stability)
    const optimisticConnection: ConnectionStatus =
      snapshot.connectionStatus === 'online' ? 'online' : snapshot.connectionStatus;

    store.writeSnapshot(nextList, true);
    emit(createFrozenSnapshot(nextList, optimisticConnection, true));

    const requiresFullBatchSync = fullBatchDirty || dirtyCardIds.size > 1;

    if (requiresFullBatchSync) {
      // M2.1 Anti-Clobbering: other cards or pre-reload edits are also unsynced -> push full snapshot!
      abortAllMutationRequests();
      const batchController = new AbortController();
      mutationBatchAbort = batchController;

      try {
        const syncedList = await api.syncCaregiversBatch(nextList, batchController.signal);
        if (disposed || batchController.signal.aborted || revision !== myRevision) {
          return;
        }
        fullBatchDirty = false;
        dirtyCardIds.clear();
        store.writeSnapshot(syncedList, false);
        emit(createFrozenSnapshot(syncedList, 'online', false));
      } catch (error) {
        if (disposed || isAbortedApiError(error) || batchController.signal.aborted) {
          return;
        }
        // M2.2: Any real network/timeout/5xx failure keeps pendingRemoteSync=true & flips to local-first
        fullBatchDirty = true;
        store.writeSnapshot(snapshot.cuidadores, true);
        emit(createFrozenSnapshot(snapshot.cuidadores, 'local-first', true));
      } finally {
        if (mutationBatchAbort === batchController) {
          mutationBatchAbort = null;
        }
      }
      return;
    }

    // Single dirty card path -> PATCH /api/cuidadores/{id}/status (with 404 auto-heal via POST /batch)
    itemMutationAborts.get(targetId)?.abort();
    const itemController = new AbortController();
    itemMutationAborts.set(targetId, itemController);

    try {
      let canonicalList: Cuidador[];
      try {
        const patched = await api.patchCaregiverStatus(
          targetId,
          updatedItem.status,
          updatedItem.substituto,
          itemController.signal
        );
        canonicalList = nextList.map((item) => (item.id === targetId ? patched : item));
      } catch (patchError) {
        if (
          patchError instanceof CaregiverApiError &&
          patchError.kind === 'http' &&
          patchError.status === 404 &&
          !itemController.signal.aborted
        ) {
          // M2.1 Auto-heal if backend restarted in memory and lost a custom caregiver ID
          canonicalList = await api.syncCaregiversBatch(nextList, itemController.signal);
        } else {
          throw patchError;
        }
      }

      if (disposed || itemController.signal.aborted || revision !== myRevision) {
        return;
      }

      dirtyCardIds.delete(targetId);
      const stillDirty = fullBatchDirty || dirtyCardIds.size > 0;
      store.writeSnapshot(canonicalList, stillDirty);
      emit(createFrozenSnapshot(canonicalList, 'online', stillDirty));
    } catch (error) {
      if (disposed || isAbortedApiError(error) || itemController.signal.aborted) {
        return;
      }
      // M2.2: Even if another card later incremented revision, never swallow a real failure
      dirtyCardIds.add(targetId);
      fullBatchDirty = true;
      store.writeSnapshot(snapshot.cuidadores, true);
      emit(createFrozenSnapshot(snapshot.cuidadores, 'local-first', true));
    } finally {
      if (itemMutationAborts.get(targetId) === itemController) {
        itemMutationAborts.delete(targetId);
      }
    }
  }

  async function toggleCaregiverStatus(id: number): Promise<void> {
    await mutateSingleOrPromoteBatch(id, (current) =>
      applyStatusChange(current, nextOperationalStatus(current.status))
    );
  }

  async function simulateCarlosAbsence(): Promise<void> {
    await mutateSingleOrPromoteBatch(CARLOS_ROCHA_ID, (current) =>
      applyStatusChange(current, 'Faltou')
    );
  }

  async function confirmCaregiverCoverage(
    absentCaregiverId: number,
    substituteName: string
  ): Promise<void> {
    if (disposed) {
      return;
    }

    const validatedSubstitute = validateCoverageAssignment(
      absentCaregiverId,
      substituteName,
      snapshot.cuidadores
    );
    if (validatedSubstitute === null) {
      return;
    }

    await mutateSingleOrPromoteBatch(absentCaregiverId, (current) =>
      applyStatusChange(current, 'Cobertura', validatedSubstitute)
    );
  }

  async function resetSchedule(): Promise<void> {
    if (disposed) {
      return;
    }

    abortReconcileRequest();
    abortAllMutationRequests();

    const seed = getCanonicalSeed();
    fullBatchDirty = true;
    dirtyCardIds.clear();
    const myRevision = ++revision;

    const optimisticConnection: ConnectionStatus =
      snapshot.connectionStatus === 'online' ? 'online' : snapshot.connectionStatus;

    store.writeSnapshot(seed, true);
    emit(createFrozenSnapshot(seed, optimisticConnection, true));

    const resetController = new AbortController();
    mutationBatchAbort = resetController;

    try {
      const remoteSeed = await api.resetCaregiversSchedule(resetController.signal);
      if (disposed || resetController.signal.aborted || revision !== myRevision) {
        return;
      }
      fullBatchDirty = false;
      dirtyCardIds.clear();
      store.writeSnapshot(remoteSeed, false);
      emit(createFrozenSnapshot(remoteSeed, 'online', false));
    } catch (error) {
      if (disposed || isAbortedApiError(error) || resetController.signal.aborted) {
        return;
      }
      fullBatchDirty = true;
      store.writeSnapshot(snapshot.cuidadores, true);
      emit(createFrozenSnapshot(snapshot.cuidadores, 'local-first', true));
    } finally {
      if (mutationBatchAbort === resetController) {
        mutationBatchAbort = null;
      }
    }
  }

  const handleOnline = (): void => {
    void reconcile();
  };

  const handleOffline = (): void => {
    abortReconcileRequest();
    emit(createFrozenSnapshot(snapshot.cuidadores, 'local-first', snapshot.pendingRemoteSync));
  };

  function start(): void {
    if (started) {
      return;
    }
    disposed = false;
    started = true;
    eventTarget?.addEventListener('online', handleOnline);
    eventTarget?.addEventListener('offline', handleOffline);
    void reconcile();
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    // LIFO resource teardown: listeners in reverse registration order, then in-flight AbortControllers.
    // Preserves external store subscribers so React 19 <StrictMode> effect remount (start -> dispose -> start) converges cleanly.
    if (started) {
      started = false;
      eventTarget?.removeEventListener('offline', handleOffline);
      eventTarget?.removeEventListener('online', handleOnline);
    }
    abortAllMutationRequests();
    abortReconcileRequest();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot(): CaregiverScheduleSnapshot {
    return snapshot;
  }

  return {
    getSnapshot,
    subscribe,
    start,
    dispose,
    reconcile,
    toggleCaregiverStatus,
    simulateCarlosAbsence,
    confirmCaregiverCoverage,
    resetSchedule,
  };
}
