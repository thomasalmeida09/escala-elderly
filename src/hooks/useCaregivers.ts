import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  type CaregiverScheduleControllerOptions,
  createCaregiverScheduleController,
} from '../services/caregiverSyncController';
import type { ConnectionStatus, Cuidador, StatusCuidador } from '../types/caregiver';

export type { ConnectionStatus, Cuidador, StatusCuidador };

export interface UseCaregiversResult {
  readonly cuidadores: Cuidador[];
  readonly connectionStatus: ConnectionStatus;
  readonly pendingRemoteSync: boolean;
  readonly canUndoImport: boolean;
  readonly loading: boolean;
  readonly simularFaltaDoCarlos: () => void;
  readonly alternarStatusCuidador: (id: number) => void;
  readonly confirmarCobertura: (absentCaregiverId: number, substitutoNome: string) => void;
  readonly importarEscala: (cuidadores: readonly Cuidador[]) => Promise<void>;
  readonly desfazerImportacao: () => Promise<boolean>;
  readonly restaurarEscala: () => void;
}

export function useCaregivers(options?: CaregiverScheduleControllerOptions): UseCaregiversResult {
  const [controller] = useState(() => createCaregiverScheduleController(options));

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  useEffect(() => {
    controller.start();
    return () => {
      controller.dispose();
    };
  }, [controller]);

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

  return {
    cuidadores: snapshot.cuidadores,
    connectionStatus: snapshot.connectionStatus,
    pendingRemoteSync: snapshot.pendingRemoteSync,
    canUndoImport: snapshot.canUndoImport,
    loading: false,
    simularFaltaDoCarlos,
    alternarStatusCuidador,
    confirmarCobertura,
    importarEscala,
    desfazerImportacao,
    restaurarEscala,
  };
}
