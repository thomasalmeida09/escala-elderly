import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  type CaregiverScheduleControllerOptions,
  createCaregiverScheduleController,
} from '../services/caregiverSyncController';
import {
  type LocalFirstStore,
  PRIVACY_MODE_STORAGE_KEY,
  defaultLocalFirstStore,
} from '../services/localFirstStore';
import type { ConnectionStatus, Cuidador, StatusCuidador } from '../types/caregiver';

export type { ConnectionStatus, Cuidador, StatusCuidador };

export interface UseCaregiversResult {
  readonly cuidadores: Cuidador[];
  readonly connectionStatus: ConnectionStatus;
  readonly pendingRemoteSync: boolean;
  readonly canUndoImport: boolean;
  readonly privacyMode: boolean;
  readonly loading: boolean;
  readonly simularFaltaDoCarlos: () => void;
  readonly alternarStatusCuidador: (id: number) => void;
  readonly confirmarCobertura: (absentCaregiverId: number, substitutoNome: string) => void;
  readonly importarEscala: (cuidadores: readonly Cuidador[]) => Promise<void>;
  readonly desfazerImportacao: () => Promise<boolean>;
  readonly restaurarEscala: () => void;
  readonly alternarModoPrivacidade: () => void;
}

export function syncPrivacyModeFromStorageEvent(
  eventKey: string | null,
  store: LocalFirstStore,
  expectedKey: string = PRIVACY_MODE_STORAGE_KEY
): boolean | null {
  if (eventKey === null || eventKey === expectedKey) {
    return store.readPrivacyMode();
  }
  return null;
}

export function useCaregivers(options?: CaregiverScheduleControllerOptions): UseCaregiversResult {
  const store = options?.store ?? defaultLocalFirstStore;
  const [controller] = useState(() => createCaregiverScheduleController(options));
  const [privacyMode, setPrivacyMode] = useState<boolean>(() => store.readPrivacyMode());

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  useEffect(() => {
    const unsubscribePrivacy = controller.subscribePrivacyMode((enabled) => {
      setPrivacyMode((prev) => (prev === enabled ? prev : enabled));
    });
    controller.start();
    return () => {
      unsubscribePrivacy();
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    if (
      options?.eventTarget === null ||
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function'
    ) {
      return undefined;
    }

    const handleStorageChange = (event: StorageEvent): void => {
      const synced = syncPrivacyModeFromStorageEvent(event.key, store);
      if (synced !== null) {
        setPrivacyMode((prev) => (prev === synced ? prev : synced));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [options?.eventTarget, store]);

  const simularFaltaDoCarlos = useCallback(() => {
    void controller.simulateCarlosAbsence();
  }, [controller]);

  const alternarStatusCuidador = useCallback(
    (id: number) => {
      void controller.toggleCaregiverStatus(id);
    },
    [controller]
  );

  const confirmarCobertura = useCallback(
    (absentCaregiverId: number, substitutoNome: string) => {
      void controller.confirmCaregiverCoverage(absentCaregiverId, substitutoNome);
    },
    [controller]
  );

  const importarEscala = useCallback(
    async (cuidadores: readonly Cuidador[]) => {
      await controller.importCaregiversBatch(cuidadores);
    },
    [controller]
  );

  const desfazerImportacao = useCallback(async () => {
    return controller.undoLastImport();
  }, [controller]);

  const restaurarEscala = useCallback(() => {
    void controller.resetSchedule();
  }, [controller]);

  // M4.1 / S19: Pure state transition outside setPrivacyMode updater prevents double broadcast in React 19 <StrictMode>
  const alternarModoPrivacidade = useCallback(() => {
    const next = !store.readPrivacyMode();
    store.writePrivacyMode(next);
    setPrivacyMode(next);
    controller.publishPrivacyMode(next);
  }, [controller, store]);

  return {
    cuidadores: snapshot.cuidadores,
    connectionStatus: snapshot.connectionStatus,
    pendingRemoteSync: snapshot.pendingRemoteSync,
    canUndoImport: snapshot.canUndoImport,
    privacyMode,
    loading: false,
    simularFaltaDoCarlos,
    alternarStatusCuidador,
    confirmarCobertura,
    importarEscala,
    desfazerImportacao,
    restaurarEscala,
    alternarModoPrivacidade,
  };
}
