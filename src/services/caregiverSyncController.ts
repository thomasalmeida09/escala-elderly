import {
  type ConnectionStatus,
  type Cuidador,
  applyStatusChange,
  nextOperationalStatus,
  toBatchPayload,
} from '../types/caregiver';
import {
  CaregiverApiError,
  type CaregiverApiClient,
  defaultCaregiverApiClient,
  isAbortedApiError,
} from './caregiverApi';
import { validateCoverageAssignment } from './coverageEngine';
import { type LocalFirstStore, defaultLocalFirstStore, getCanonicalSeed } from './localFirstStore';
import {
  type BroadcastChannelFactory,
  type BroadcastChannelLike,
  type BroadcastMessageEventLike,
  type CrossTabChannelBridge,
  type CrossTabSchedulePayload,
  type CryptoIdProvider,
  type EventSourceFactory,
  type EventSourceLike,
  type SseDisconnectInfo,
  type SseMessageEventLike,
  type SseScheduleUpdateEvent,
  type SseStreamClient,
  type StorageEventTarget,
  type TimerAdapter,
  createCrossTabChannelBridge,
  createSseStreamClient,
} from './multiplayerSyncEngine';

export const CARLOS_ROCHA_ID = 3;

export interface ConnectivityEventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export interface CaregiverScheduleSnapshot {
  readonly cuidadores: Cuidador[];
  readonly connectionStatus: ConnectionStatus;
  readonly pendingRemoteSync: boolean;
  readonly canUndoImport: boolean;
}

export interface CaregiverScheduleControllerOptions {
  readonly store?: LocalFirstStore;
  readonly api?: CaregiverApiClient;
  readonly eventTarget?: ConnectivityEventTarget | null;
  readonly broadcastChannelFactory?: BroadcastChannelFactory | null;
  readonly storageEventTarget?: StorageEventTarget | null;
  readonly eventSourceFactory?: EventSourceFactory | null;
  readonly sseTimers?: TimerAdapter;
  readonly sseRandom?: () => number;
  readonly sseInitialDelayMs?: number;
  readonly sseMaxDelayMs?: number;
  readonly ssePrivacyRedacted?: boolean;
  readonly crypto?: CryptoIdProvider | null;
  readonly instanceId?: string;
}

export interface CaregiverScheduleController {
  getSnapshot(): CaregiverScheduleSnapshot;
  subscribe(listener: () => void): () => void;
  publishPrivacyMode(enabled: boolean): void;
  subscribePrivacyMode(listener: (enabled: boolean) => void): () => void;
  start(): void;
  dispose(): void;
  reconcile(): Promise<void>;
  toggleCaregiverStatus(id: number): Promise<void>;
  simulateCarlosAbsence(): Promise<void>;
  confirmCaregiverCoverage(absentCaregiverId: number, substituteName: string): Promise<void>;
  importCaregiversBatch(cuidadores: readonly Cuidador[]): Promise<void>;
  undoLastImport(): Promise<boolean>;
  resetSchedule(): Promise<void>;
}

interface ReconcileInternalOptions {
  readonly publishToSiblingsOnCleanFetch?: boolean;
}

function resolveDefaultEventTarget(): ConnectivityEventTarget | null {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    return window;
  }
  return null;
}

function areCaregiversEqual(a: Cuidador, b: Cuidador): boolean {
  return (
    a.id === b.id &&
    a.nome === b.nome &&
    a.status === b.status &&
    a.turno === b.turno &&
    a.quarto === b.quarto &&
    a.telefone === b.telefone &&
    a.horasDescanso === b.horasDescanso &&
    a.substituto === b.substituto
  );
}

function areCaregiverListsEqual(first: readonly Cuidador[], second: readonly Cuidador[]): boolean {
  if (first.length !== second.length) {
    return false;
  }
  for (let i = 0; i < first.length; i += 1) {
    if (!areCaregiversEqual(first[i]!, second[i]!)) {
      return false;
    }
  }
  return true;
}

function createFrozenSnapshot(
  cuidadores: readonly Cuidador[],
  connectionStatus: ConnectionStatus,
  pendingRemoteSync: boolean,
  canUndoImport: boolean
): CaregiverScheduleSnapshot {
  return Object.freeze({
    cuidadores: [...cuidadores],
    connectionStatus,
    pendingRemoteSync,
    canUndoImport,
  });
}

export function createCaregiverScheduleController(
  options: CaregiverScheduleControllerOptions = {}
): CaregiverScheduleController {
  const store = options.store ?? defaultLocalFirstStore;
  const api = options.api ?? defaultCaregiverApiClient;
  const eventTarget =
    options.eventTarget !== undefined ? options.eventTarget : resolveDefaultEventTarget();

  // M5.3: Only auto-resolve browser multiplayer transports when running in a real window
  // with default/window connectivity target (preserves strict Node 24 / SSR test isolation).
  const canAutoUseBrowserGlobals =
    typeof window !== 'undefined' &&
    (options.eventTarget === undefined || options.eventTarget === window);

  const resolveBroadcastChannelFactory = (): BroadcastChannelFactory | null => {
    if (options.broadcastChannelFactory !== undefined) {
      return options.broadcastChannelFactory;
    }
    if (canAutoUseBrowserGlobals && typeof window.BroadcastChannel === 'function') {
      return (channelName: string): BroadcastChannelLike => {
        const nativeChannel = new window.BroadcastChannel(channelName);
        const listenerMap = new Map<
          (event: BroadcastMessageEventLike) => void,
          (ev: MessageEvent) => void
        >();
        return {
          postMessage(message: unknown): void {
            nativeChannel.postMessage(message);
          },
          addEventListener(
            _type: 'message',
            listener: (event: BroadcastMessageEventLike) => void
          ): void {
            const wrapped = (ev: MessageEvent): void => {
              listener({ data: ev.data });
            };
            listenerMap.set(listener, wrapped);
            nativeChannel.addEventListener('message', wrapped);
          },
          removeEventListener(
            _type: 'message',
            listener: (event: BroadcastMessageEventLike) => void
          ): void {
            const wrapped = listenerMap.get(listener);
            if (wrapped !== undefined) {
              listenerMap.delete(listener);
              nativeChannel.removeEventListener('message', wrapped);
            }
          },
          close(): void {
            listenerMap.clear();
            nativeChannel.close();
          },
        };
      };
    }
    return null;
  };

  const resolveStorageEventTarget = (): StorageEventTarget | null => {
    if (options.storageEventTarget !== undefined) {
      return options.storageEventTarget;
    }
    if (canAutoUseBrowserGlobals && typeof window.addEventListener === 'function') {
      return window;
    }
    return null;
  };

  const resolveEventSourceFactory = (): EventSourceFactory | null => {
    if (options.eventSourceFactory !== undefined) {
      return options.eventSourceFactory;
    }
    if (canAutoUseBrowserGlobals && typeof window.EventSource === 'function') {
      return (url: string): EventSourceLike => {
        const nativeSource = new window.EventSource(url);
        const listenerMap = new Map<
          string,
          Map<(event: SseMessageEventLike) => void, EventListener>
        >();
        const adapter: EventSourceLike = {
          onopen: null,
          onerror: null,
          addEventListener(type: string, listener: (event: SseMessageEventLike) => void): void {
            const wrapped: EventListener = (evt: Event): void => {
              if (evt instanceof MessageEvent) {
                listener({ data: evt.data, lastEventId: evt.lastEventId });
              } else {
                listener({});
              }
            };
            let bucket = listenerMap.get(type);
            if (bucket === undefined) {
              bucket = new Map();
              listenerMap.set(type, bucket);
            }
            bucket.set(listener, wrapped);
            nativeSource.addEventListener(type, wrapped);
          },
          removeEventListener(type: string, listener: (event: SseMessageEventLike) => void): void {
            const bucket = listenerMap.get(type);
            const wrapped = bucket?.get(listener);
            if (wrapped !== undefined) {
              bucket?.delete(listener);
              nativeSource.removeEventListener(type, wrapped);
            }
          },
          close(): void {
            for (const [type, bucket] of listenerMap.entries()) {
              for (const wrapped of bucket.values()) {
                nativeSource.removeEventListener(type, wrapped);
              }
            }
            listenerMap.clear();
            nativeSource.onopen = null;
            nativeSource.onerror = null;
            nativeSource.close();
          },
        };
        nativeSource.onopen = (ev: Event): void => {
          adapter.onopen?.(ev);
        };
        nativeSource.onerror = (ev: Event): void => {
          adapter.onerror?.(ev);
        };
        return adapter;
      };
    }
    return null;
  };

  const hasUndoBackup = (): boolean => store.readUndoBackup() !== null;

  // Synchronous 0ms hydration on construction (zero artificial delay, zero CLS)
  const hydrated = store.readInitialState();
  let snapshot: CaregiverScheduleSnapshot = createFrozenSnapshot(
    hydrated.cuidadores,
    'checking',
    hydrated.pendingRemoteSync,
    hasUndoBackup()
  );

  let fullBatchDirty = hydrated.pendingRemoteSync;
  const dirtyCardIds = new Set<number>();

  let started = false;
  let disposed = false;
  let revision = 0;

  let reconcileAbort: AbortController | null = null;
  let reconcilePushingDirtyBatch = false;
  let mutationBatchAbort: AbortController | null = null;
  const itemMutationAborts = new Map<number, AbortController>();

  let crossTabBridge: CrossTabChannelBridge | null = null;
  let sseClient: SseStreamClient | null = null;
  let deferredSseSchedule: Cuidador[] | null = null;
  let deferredCrossTabPayload: CrossTabSchedulePayload | null = null;

  const listeners = new Set<() => void>();
  const privacyListeners = new Set<(enabled: boolean) => void>();

  function hasActiveHttpMutations(): boolean {
    return mutationBatchAbort !== null || itemMutationAborts.size > 0 || reconcilePushingDirtyBatch;
  }

  function isLocallyDirty(): boolean {
    return snapshot.pendingRemoteSync || fullBatchDirty || dirtyCardIds.size > 0;
  }

  function readDeferredSseSchedule(): Cuidador[] | null {
    return deferredSseSchedule;
  }

  function readDeferredCrossTabPayload(): CrossTabSchedulePayload | null {
    return deferredCrossTabPayload;
  }

  // M1.3: Strict referential idempotence for useSyncExternalStore (0 redundant renders / focus loss)
  function emitIfChanged(next: CaregiverScheduleSnapshot): void {
    if (disposed) {
      return;
    }
    if (
      next.connectionStatus === snapshot.connectionStatus &&
      next.pendingRemoteSync === snapshot.pendingRemoteSync &&
      next.canUndoImport === snapshot.canUndoImport &&
      areCaregiverListsEqual(next.cuidadores, snapshot.cuidadores)
    ) {
      return;
    }
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  }

  // M2.1: Conditional persistence prevents O(N^2) StorageEvent amplification across N open tabs
  function persistSnapshotIfNeeded(nextList: readonly Cuidador[], nextPending: boolean): void {
    const current = store.readInitialState();
    if (
      current.source !== 'storage' ||
      current.pendingRemoteSync !== nextPending ||
      !areCaregiverListsEqual(current.cuidadores, nextList)
    ) {
      store.writeSnapshot(nextList, nextPending);
    }
  }

  function publishLocalSchedule(nextList: readonly Cuidador[], pendingRemoteSync: boolean): void {
    if (disposed || crossTabBridge === null) {
      return;
    }
    const undoEnvelope = store.readUndoBackup();
    crossTabBridge.publishScheduleSync({
      cuidadores: nextList,
      pendingRemoteSync,
      canUndoImport: undoEnvelope !== null,
      undoBackup: undoEnvelope ? undoEnvelope.cuidadores : null,
    });
  }

  function synchronizeUndoBackupFromCrossTab(payload: CrossTabSchedulePayload): void {
    if (payload.canUndoImport) {
      const currentUndo = store.readUndoBackup();
      if (Array.isArray(payload.undoBackup)) {
        if (
          currentUndo === null ||
          !areCaregiverListsEqual(currentUndo.cuidadores, payload.undoBackup)
        ) {
          store.writeUndoBackup(payload.undoBackup);
        }
      }
      return;
    }

    if (hasUndoBackup()) {
      store.clearUndoBackup();
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

  function applyExternalSchedule(
    externalList: readonly Cuidador[],
    meta: {
      readonly source: 'broadcast-channel' | 'storage' | 'sse';
      readonly pendingRemoteSync: boolean;
    }
  ): void {
    if (disposed) {
      return;
    }

    // M1.2 / S11: Increment revision and cancel any clean in-flight GET reconcile so stale v1 cannot clobber v2
    revision += 1;
    if (!reconcilePushingDirtyBatch) {
      abortReconcileRequest();
    }

    fullBatchDirty = meta.pendingRemoteSync;
    if (!meta.pendingRemoteSync) {
      dirtyCardIds.clear();
      deferredSseSchedule = null;
    }

    persistSnapshotIfNeeded(externalList, meta.pendingRemoteSync);

    let nextConnectionStatus = snapshot.connectionStatus;
    if (meta.source === 'sse') {
      nextConnectionStatus = 'online';
    } else if (!meta.pendingRemoteSync && meta.source === 'broadcast-channel') {
      nextConnectionStatus = 'online';
    }

    emitIfChanged(
      createFrozenSnapshot(
        externalList,
        nextConnectionStatus,
        meta.pendingRemoteSync,
        hasUndoBackup()
      )
    );
  }

  // M1.1: Linearizable convergence across all 4 HTTP mutation paths (including LWW race on same card)
  function flushDeferredAfterCleanMutation(
    confirmedList: readonly Cuidador[],
    singlePatchedItem?: Cuidador
  ): void {
    if (disposed || isLocallyDirty() || hasActiveHttpMutations()) {
      return;
    }

    if (deferredCrossTabPayload !== null) {
      const pendingCrossTab = deferredCrossTabPayload;
      deferredCrossTabPayload = null;
      synchronizeUndoBackupFromCrossTab(pendingCrossTab);

      if (pendingCrossTab.pendingRemoteSync) {
        applyExternalSchedule(pendingCrossTab.cuidadores, {
          source: pendingCrossTab.source,
          pendingRemoteSync: true,
        });
        void reconcileInternal({ publishToSiblingsOnCleanFetch: true });
        return;
      }

      if (!areCaregiverListsEqual(pendingCrossTab.cuidadores, confirmedList)) {
        void reconcileInternal({ publishToSiblingsOnCleanFetch: true });
        return;
      }
    }

    if (deferredSseSchedule === null) {
      return;
    }

    const pendingSse = deferredSseSchedule;
    deferredSseSchedule = null;

    if (areCaregiverListsEqual(pendingSse, confirmedList)) {
      return;
    }

    if (singlePatchedItem !== undefined) {
      const matchingInSse = pendingSse.find((item) => item.id === singlePatchedItem.id);
      if (matchingInSse !== undefined && areCaregiversEqual(matchingInSse, singlePatchedItem)) {
        applyExternalSchedule(pendingSse, {
          source: 'sse',
          pendingRemoteSync: false,
        });
        publishLocalSchedule(pendingSse, false);
        return;
      }
    }

    // LWW race on the same card (v3 > v2) or divergence against POST /batch or POST /reset -> fetch server truth!
    void reconcileInternal({ publishToSiblingsOnCleanFetch: true });
  }

  function handleCrossTabScheduleSync(payload: CrossTabSchedulePayload): void {
    if (disposed) {
      return;
    }

    synchronizeUndoBackupFromCrossTab(payload);

    // M2.3: Preserve in-flight local HTTP mutations on this tab rather than wiping dirtyCardIds mid-flight
    if (hasActiveHttpMutations()) {
      deferredCrossTabPayload = payload;
      return;
    }

    applyExternalSchedule(payload.cuidadores, {
      source: payload.source,
      pendingRemoteSync: payload.pendingRemoteSync,
    });
  }

  function handleCrossTabPrivacySync(enabled: boolean): void {
    if (disposed) {
      return;
    }
    if (store.readPrivacyMode() !== enabled) {
      store.writePrivacyMode(enabled);
    }
    for (const listener of privacyListeners) {
      listener(enabled);
    }
  }

  function handleSseOpen(): void {
    if (disposed) {
      return;
    }
    if (isLocallyDirty() && !hasActiveHttpMutations()) {
      void reconcileInternal();
      return;
    }
    if (!isLocallyDirty() && snapshot.connectionStatus !== 'online') {
      emitIfChanged(createFrozenSnapshot(snapshot.cuidadores, 'online', false, hasUndoBackup()));
    }
  }

  // M3.1 / S16: Only downgrade 'online' -> 'local-first' if an open SSE stream actually dropped
  function handleSseDisconnect(info: SseDisconnectInfo): void {
    if (disposed || !info.hadOpenStream) {
      return;
    }
    if (snapshot.connectionStatus === 'online') {
      emitIfChanged(
        createFrozenSnapshot(
          snapshot.cuidadores,
          'local-first',
          snapshot.pendingRemoteSync,
          hasUndoBackup()
        )
      );
    }
  }

  function handleSseScheduleUpdated(event: SseScheduleUpdateEvent): void {
    if (disposed) {
      return;
    }
    if (isLocallyDirty() || hasActiveHttpMutations()) {
      deferredSseSchedule = event.cuidadores;
      return;
    }
    deferredSseSchedule = null;
    applyExternalSchedule(event.cuidadores, {
      source: 'sse',
      pendingRemoteSync: false,
    });
  }

  async function syncFullRosterBatch(
    nextList: readonly Cuidador[],
    myRevision: number
  ): Promise<void> {
    const batchController = new AbortController();
    mutationBatchAbort = batchController;

    try {
      const syncedList = await api.syncCaregiversBatch(nextList, batchController.signal);
      if (disposed || batchController.signal.aborted || revision !== myRevision) {
        return;
      }
      fullBatchDirty = false;
      dirtyCardIds.clear();
      if (mutationBatchAbort === batchController) {
        mutationBatchAbort = null;
      }
      store.writeSnapshot(syncedList, false);
      publishLocalSchedule(syncedList, false);
      emitIfChanged(createFrozenSnapshot(syncedList, 'online', false, hasUndoBackup()));
      flushDeferredAfterCleanMutation(syncedList);
    } catch (error) {
      if (disposed || isAbortedApiError(error) || batchController.signal.aborted) {
        return;
      }
      fullBatchDirty = true;
      store.writeSnapshot(snapshot.cuidadores, true);
      publishLocalSchedule(snapshot.cuidadores, true);
      emitIfChanged(
        createFrozenSnapshot(snapshot.cuidadores, 'local-first', true, hasUndoBackup())
      );
    } finally {
      if (mutationBatchAbort === batchController) {
        mutationBatchAbort = null;
      }
    }
  }

  async function reconcileInternal(internalOptions: ReconcileInternalOptions = {}): Promise<void> {
    if (disposed) {
      return;
    }

    abortReconcileRequest();
    const startRevision = revision;
    const localState = snapshot;

    if (localState.connectionStatus === 'local-first') {
      emitIfChanged(
        createFrozenSnapshot(
          localState.cuidadores,
          'checking',
          localState.pendingRemoteSync,
          hasUndoBackup()
        )
      );
    }

    const controller = new AbortController();
    reconcileAbort = controller;

    try {
      if (localState.pendingRemoteSync || fullBatchDirty || dirtyCardIds.size > 0) {
        reconcilePushingDirtyBatch = true;
        try {
          const remoteList = await api.syncCaregiversBatch(
            localState.cuidadores,
            controller.signal
          );
          if (disposed || controller.signal.aborted || revision !== startRevision) {
            return;
          }
          fullBatchDirty = false;
          dirtyCardIds.clear();
          reconcilePushingDirtyBatch = false;
          store.writeSnapshot(remoteList, false);
          publishLocalSchedule(remoteList, false);
          emitIfChanged(createFrozenSnapshot(remoteList, 'online', false, hasUndoBackup()));
          flushDeferredAfterCleanMutation(remoteList);
          return;
        } finally {
          reconcilePushingDirtyBatch = false;
        }
      }

      const remoteList = await api.fetchCaregivers(controller.signal);
      if (disposed || controller.signal.aborted || revision !== startRevision) {
        return;
      }
      fullBatchDirty = false;
      dirtyCardIds.clear();
      persistSnapshotIfNeeded(remoteList, false);
      if (internalOptions.publishToSiblingsOnCleanFetch) {
        publishLocalSchedule(remoteList, false);
      }
      emitIfChanged(createFrozenSnapshot(remoteList, 'online', false, hasUndoBackup()));
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
          publishLocalSchedule(recovered, false);
          emitIfChanged(createFrozenSnapshot(recovered, 'online', false, hasUndoBackup()));
          return;
        } catch (recoveryError) {
          if (disposed || isAbortedApiError(recoveryError) || controller.signal.aborted) {
            return;
          }
        }
      }

      emitIfChanged(
        createFrozenSnapshot(
          snapshot.cuidadores,
          'local-first',
          snapshot.pendingRemoteSync,
          hasUndoBackup()
        )
      );
    } finally {
      if (reconcileAbort === controller) {
        reconcileAbort = null;
      }
    }
  }

  async function reconcile(): Promise<void> {
    await reconcileInternal();
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

    // Cancel any boot/reconnect clean GET so stale remote state cannot clobber user action
    if (!reconcilePushingDirtyBatch) {
      abortReconcileRequest();
    }
    deferredSseSchedule = null;

    const updatedItem = computeUpdated(existing);
    const nextList = snapshot.cuidadores.map((item) => (item.id === targetId ? updatedItem : item));

    dirtyCardIds.add(targetId);
    const myRevision = ++revision;

    // Keep 'online' badge steady during rapid clicks when already online (WCAG aria-live stability)
    const optimisticConnection: ConnectionStatus =
      snapshot.connectionStatus === 'online' ? 'online' : snapshot.connectionStatus;

    store.writeSnapshot(nextList, true);
    publishLocalSchedule(nextList, true);
    emitIfChanged(createFrozenSnapshot(nextList, optimisticConnection, true, hasUndoBackup()));

    const requiresFullBatchSync = fullBatchDirty || dirtyCardIds.size > 1;

    if (requiresFullBatchSync) {
      // M2.1 Anti-Clobbering: other cards or pre-reload edits are also unsynced -> push full snapshot!
      abortAllMutationRequests();
      await syncFullRosterBatch(nextList, myRevision);
      return;
    }

    // Single dirty card path -> PATCH /api/cuidadores/{id}/status (with 404 auto-heal via POST /batch)
    itemMutationAborts.get(targetId)?.abort();
    const itemController = new AbortController();
    itemMutationAborts.set(targetId, itemController);

    try {
      let canonicalList: Cuidador[];
      let singlePatchedItem: Cuidador | undefined;
      try {
        const patched = await api.patchCaregiverStatus(
          targetId,
          updatedItem.status,
          updatedItem.substituto,
          itemController.signal
        );
        singlePatchedItem = patched;
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
      if (itemMutationAborts.get(targetId) === itemController) {
        itemMutationAborts.delete(targetId);
      }

      const stillDirty = fullBatchDirty || dirtyCardIds.size > 0;
      let hasDivergentDeferredSync = false;

      if (!stillDirty) {
        const currentDeferredCrossTab = readDeferredCrossTabPayload();
        const currentDeferredSse = readDeferredSseSchedule();
        if (currentDeferredCrossTab !== null) {
          hasDivergentDeferredSync =
            currentDeferredCrossTab.pendingRemoteSync ||
            !areCaregiverListsEqual(currentDeferredCrossTab.cuidadores, canonicalList);
        } else if (currentDeferredSse !== null) {
          if (areCaregiverListsEqual(currentDeferredSse, canonicalList)) {
            deferredSseSchedule = null;
          } else if (singlePatchedItem !== undefined) {
            const matchingInSse = currentDeferredSse.find(
              (item) => item.id === singlePatchedItem.id
            );
            if (
              matchingInSse !== undefined &&
              areCaregiversEqual(matchingInSse, singlePatchedItem)
            ) {
              canonicalList = currentDeferredSse;
              deferredSseSchedule = null;
            } else {
              hasDivergentDeferredSync = true;
            }
          } else {
            hasDivergentDeferredSync = true;
          }
        }
      }

      store.writeSnapshot(canonicalList, stillDirty);
      if (!hasDivergentDeferredSync) {
        publishLocalSchedule(canonicalList, stillDirty);
      }
      emitIfChanged(createFrozenSnapshot(canonicalList, 'online', stillDirty, hasUndoBackup()));

      if (!stillDirty) {
        flushDeferredAfterCleanMutation(canonicalList, singlePatchedItem);
      }
    } catch (error) {
      if (disposed || isAbortedApiError(error) || itemController.signal.aborted) {
        return;
      }
      // M2.2: Even if another card later incremented revision, never swallow a real failure
      dirtyCardIds.add(targetId);
      fullBatchDirty = true;
      store.writeSnapshot(snapshot.cuidadores, true);
      publishLocalSchedule(snapshot.cuidadores, true);
      emitIfChanged(
        createFrozenSnapshot(snapshot.cuidadores, 'local-first', true, hasUndoBackup())
      );
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

  async function importCaregiversBatch(cuidadores: readonly Cuidador[]): Promise<void> {
    if (disposed) {
      return;
    }

    // Write-Audit-Publish (M3.2): valida 100% do lote ANTES de tocar AbortControllers ou storage
    const nextList = toBatchPayload(cuidadores);
    const previousList = snapshot.cuidadores;

    abortReconcileRequest();
    abortAllMutationRequests();
    deferredSseSchedule = null;

    // Guarda anti-duplo-Ctrl+V (M3.2): preserva o backup original se a mesma planilha for colada 2x
    if (!areCaregiverListsEqual(previousList, nextList)) {
      store.writeUndoBackup(previousList);
    }

    fullBatchDirty = true;
    dirtyCardIds.clear();
    const myRevision = ++revision;

    const optimisticConnection: ConnectionStatus =
      snapshot.connectionStatus === 'online' ? 'online' : snapshot.connectionStatus;

    store.writeSnapshot(nextList, true);
    publishLocalSchedule(nextList, true);
    emitIfChanged(createFrozenSnapshot(nextList, optimisticConnection, true, hasUndoBackup()));

    await syncFullRosterBatch(nextList, myRevision);
  }

  async function undoLastImport(): Promise<boolean> {
    if (disposed) {
      return false;
    }

    const backup = store.readUndoBackup();
    if (backup === null) {
      if (snapshot.canUndoImport) {
        emitIfChanged(
          createFrozenSnapshot(
            snapshot.cuidadores,
            snapshot.connectionStatus,
            snapshot.pendingRemoteSync,
            false
          )
        );
      }
      return false;
    }

    abortReconcileRequest();
    abortAllMutationRequests();
    deferredSseSchedule = null;

    fullBatchDirty = true;
    dirtyCardIds.clear();
    const myRevision = ++revision;

    const optimisticConnection: ConnectionStatus =
      snapshot.connectionStatus === 'online' ? 'online' : snapshot.connectionStatus;

    // Ordem crash-safe (M3.2): restaura schedule:v1 antes de remover undo_backup:v1
    store.writeSnapshot(backup.cuidadores, true);
    store.clearUndoBackup();
    publishLocalSchedule(backup.cuidadores, true);
    emitIfChanged(createFrozenSnapshot(backup.cuidadores, optimisticConnection, true, false));

    await syncFullRosterBatch(backup.cuidadores, myRevision);
    return true;
  }

  async function resetSchedule(): Promise<void> {
    if (disposed) {
      return;
    }

    abortReconcileRequest();
    abortAllMutationRequests();
    deferredSseSchedule = null;

    const seed = getCanonicalSeed();
    fullBatchDirty = true;
    dirtyCardIds.clear();
    const myRevision = ++revision;

    const optimisticConnection: ConnectionStatus =
      snapshot.connectionStatus === 'online' ? 'online' : snapshot.connectionStatus;

    store.writeSnapshot(seed, true);
    store.clearUndoBackup();
    publishLocalSchedule(seed, true);
    emitIfChanged(createFrozenSnapshot(seed, optimisticConnection, true, false));

    const resetController = new AbortController();
    mutationBatchAbort = resetController;

    try {
      const remoteSeed = await api.resetCaregiversSchedule(resetController.signal);
      if (disposed || resetController.signal.aborted || revision !== myRevision) {
        return;
      }
      fullBatchDirty = false;
      dirtyCardIds.clear();
      if (mutationBatchAbort === resetController) {
        mutationBatchAbort = null;
      }
      store.writeSnapshot(remoteSeed, false);
      publishLocalSchedule(remoteSeed, false);
      emitIfChanged(createFrozenSnapshot(remoteSeed, 'online', false, false));
      flushDeferredAfterCleanMutation(remoteSeed);
    } catch (error) {
      if (disposed || isAbortedApiError(error) || resetController.signal.aborted) {
        return;
      }
      fullBatchDirty = true;
      store.writeSnapshot(snapshot.cuidadores, true);
      publishLocalSchedule(snapshot.cuidadores, true);
      emitIfChanged(createFrozenSnapshot(snapshot.cuidadores, 'local-first', true, false));
    } finally {
      if (mutationBatchAbort === resetController) {
        mutationBatchAbort = null;
      }
    }
  }

  function publishPrivacyMode(enabled: boolean): void {
    if (disposed) {
      return;
    }
    const normalized = Boolean(enabled);
    if (store.readPrivacyMode() !== normalized) {
      store.writePrivacyMode(normalized);
    }
    crossTabBridge?.publishPrivacySync(normalized);
  }

  function subscribePrivacyMode(listener: (enabled: boolean) => void): () => void {
    privacyListeners.add(listener);
    return () => {
      privacyListeners.delete(listener);
    };
  }

  const handleOnline = (): void => {
    sseClient?.reconnectNow();
    void reconcileInternal();
  };

  const handleOffline = (): void => {
    if (!reconcilePushingDirtyBatch) {
      abortReconcileRequest();
    }
    emitIfChanged(
      createFrozenSnapshot(
        snapshot.cuidadores,
        'local-first',
        snapshot.pendingRemoteSync,
        hasUndoBackup()
      )
    );
  };

  function start(): void {
    if (started) {
      return;
    }
    disposed = false;
    started = true;

    eventTarget?.addEventListener('online', handleOnline);
    eventTarget?.addEventListener('offline', handleOffline);

    const resolvedBroadcastFactory = resolveBroadcastChannelFactory();
    const resolvedStorageTarget = resolveStorageEventTarget();
    if (resolvedBroadcastFactory !== null || resolvedStorageTarget !== null) {
      crossTabBridge = createCrossTabChannelBridge({
        instanceId: options.instanceId,
        crypto: options.crypto,
        broadcastChannelFactory: resolvedBroadcastFactory,
        storageEventTarget: resolvedStorageTarget,
        fallbackStore: store,
        onScheduleSync: handleCrossTabScheduleSync,
        onPrivacySync: handleCrossTabPrivacySync,
      });
    }

    const resolvedEventSourceFactory = resolveEventSourceFactory();
    if (resolvedEventSourceFactory !== null) {
      sseClient = createSseStreamClient({
        baseUrl: api.baseUrl,
        privacyRedacted: options.ssePrivacyRedacted ?? false,
        eventSourceFactory: resolvedEventSourceFactory,
        timers: options.sseTimers,
        random: options.sseRandom,
        initialDelayMs: options.sseInitialDelayMs,
        maxDelayMs: options.sseMaxDelayMs,
        onOpen: handleSseOpen,
        onDisconnect: handleSseDisconnect,
        onScheduleUpdated: handleSseScheduleUpdated,
      });
      sseClient.connect();
    }

    void reconcileInternal();
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    deferredSseSchedule = null;
    deferredCrossTabPayload = null;
    // LIFO resource teardown: sseClient -> crossTabBridge -> offline/online listeners -> in-flight AbortControllers.
    // Preserves external store & privacy subscribers so React 19 <StrictMode> remount (start -> dispose -> start) converges cleanly.
    if (started) {
      started = false;
      if (sseClient !== null) {
        const activeSse = sseClient;
        sseClient = null;
        activeSse.close();
      }
      if (crossTabBridge !== null) {
        const activeBridge = crossTabBridge;
        crossTabBridge = null;
        activeBridge.close();
      }
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
    publishPrivacyMode,
    subscribePrivacyMode,
    start,
    dispose,
    reconcile,
    toggleCaregiverStatus,
    simulateCarlosAbsence,
    confirmCaregiverCoverage,
    importCaregiversBatch,
    undoLastImport,
    resetSchedule,
  };
}
