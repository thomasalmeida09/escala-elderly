import caregiversSeedRaw from '../mocks/Caregive.json';
import { type Cuidador, parseCuidadorList } from '../types/caregiver';

export const SCHEDULE_STORAGE_KEY = 'escala_elderly:schedule:v1';
export const UNDO_IMPORT_STORAGE_KEY = 'escala_elderly:undo_backup:v1';
export const PRIVACY_MODE_STORAGE_KEY = 'escala_elderly:privacy_mode:v1';
export const SCHEDULE_SCHEMA_VERSION = 1;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedScheduleEnvelope {
  readonly schemaVersion: typeof SCHEDULE_SCHEMA_VERSION;
  readonly updatedAtIso: string;
  readonly pendingRemoteSync: boolean;
  readonly cuidadores: Cuidador[];
}

export interface PersistedUndoBackupEnvelope {
  readonly schemaVersion: typeof SCHEDULE_SCHEMA_VERSION;
  readonly savedAtIso: string;
  readonly cuidadores: Cuidador[];
}

export interface PersistedPrivacyModeEnvelope {
  readonly schemaVersion: typeof SCHEDULE_SCHEMA_VERSION;
  readonly enabled: boolean;
  readonly updatedAtIso: string;
}

export type HydrationSource = 'storage' | 'seed' | 'purged-corrupt';

export interface HydratedScheduleState {
  readonly cuidadores: Cuidador[];
  readonly pendingRemoteSync: boolean;
  readonly source: HydrationSource;
}

export interface LocalFirstStoreOptions {
  readonly storage?: StorageAdapter | null;
  readonly storageKey?: string;
  readonly undoStorageKey?: string;
  readonly privacyStorageKey?: string;
  readonly nowIso?: () => string;
}

export interface LocalFirstStore {
  readInitialState(): HydratedScheduleState;
  writeSnapshot(
    cuidadores: readonly Cuidador[],
    pendingRemoteSync: boolean
  ): PersistedScheduleEnvelope;
  readUndoBackup(): PersistedUndoBackupEnvelope | null;
  writeUndoBackup(cuidadores: readonly Cuidador[]): PersistedUndoBackupEnvelope;
  clearUndoBackup(): void;
  readPrivacyMode(): boolean;
  writePrivacyMode(enabled: boolean): boolean;
  clear(): void;
}

const CANONICAL_SEED: readonly Cuidador[] = Object.freeze(
  parseCuidadorList(caregiversSeedRaw, 'seed')
);

export function getCanonicalSeed(): Cuidador[] {
  return [...CANONICAL_SEED];
}

function resolveDefaultStorage(): StorageAdapter | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const candidate = globalThis.localStorage;
      if (candidate !== undefined && candidate !== null) {
        return candidate;
      }
    }
    return null;
  } catch (storageAccessError) {
    void storageAccessError;
    return null;
  }
}

function isEnvelopeCandidate(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createLocalFirstStore(options: LocalFirstStoreOptions = {}): LocalFirstStore {
  const storageKey = options.storageKey ?? SCHEDULE_STORAGE_KEY;
  const undoStorageKey = options.undoStorageKey ?? UNDO_IMPORT_STORAGE_KEY;
  const privacyStorageKey = options.privacyStorageKey ?? PRIVACY_MODE_STORAGE_KEY;
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const fallbackMemory = new Map<string, string>();
  const resolveStorage = (): StorageAdapter | null =>
    options.storage !== undefined ? options.storage : resolveDefaultStorage();

  function safeRemoveRaw(key: string): void {
    fallbackMemory.delete(key);
    const activeStorage = resolveStorage();
    if (!activeStorage) {
      return;
    }
    try {
      activeStorage.removeItem(key);
    } catch (removeError) {
      fallbackMemory.delete(key);
      void removeError;
    }
  }

  function safeReadRaw(key: string): string | null {
    const activeStorage = resolveStorage();
    if (activeStorage) {
      try {
        const persisted = activeStorage.getItem(key);
        if (persisted !== null) {
          return persisted;
        }
      } catch (readError) {
        void readError;
        return fallbackMemory.get(key) ?? null;
      }
    }
    return fallbackMemory.get(key) ?? null;
  }

  function safeWriteRaw(key: string, serialized: string): void {
    fallbackMemory.set(key, serialized);
    const activeStorage = resolveStorage();
    if (!activeStorage) {
      return;
    }
    try {
      activeStorage.setItem(key, serialized);
    } catch (writeError) {
      fallbackMemory.set(key, serialized);
      void writeError;
    }
  }

  function readInitialState(): HydratedScheduleState {
    const raw = safeReadRaw(storageKey);
    if (raw === null) {
      return {
        cuidadores: getCanonicalSeed(),
        pendingRemoteSync: false,
        source: 'seed',
      };
    }

    try {
      const decoded: unknown = JSON.parse(raw);
      if (
        !isEnvelopeCandidate(decoded) ||
        decoded.schemaVersion !== SCHEDULE_SCHEMA_VERSION ||
        typeof decoded.pendingRemoteSync !== 'boolean' ||
        typeof decoded.updatedAtIso !== 'string' ||
        decoded.updatedAtIso.trim().length === 0
      ) {
        safeRemoveRaw(storageKey);
        return {
          cuidadores: getCanonicalSeed(),
          pendingRemoteSync: false,
          source: 'purged-corrupt',
        };
      }

      const validatedList = parseCuidadorList(decoded.cuidadores, 'storage.cuidadores');
      return {
        cuidadores: validatedList,
        pendingRemoteSync: decoded.pendingRemoteSync,
        source: 'storage',
      };
    } catch (corruptEnvelopeError) {
      void corruptEnvelopeError;
      safeRemoveRaw(storageKey);
      return {
        cuidadores: getCanonicalSeed(),
        pendingRemoteSync: false,
        source: 'purged-corrupt',
      };
    }
  }

  function writeSnapshot(
    cuidadores: readonly Cuidador[],
    pendingRemoteSync: boolean
  ): PersistedScheduleEnvelope {
    const validatedList = parseCuidadorList(cuidadores, 'snapshot.cuidadores');
    const envelope: PersistedScheduleEnvelope = Object.freeze({
      schemaVersion: SCHEDULE_SCHEMA_VERSION,
      updatedAtIso: nowIso(),
      pendingRemoteSync,
      cuidadores: validatedList,
    });
    safeWriteRaw(storageKey, JSON.stringify(envelope));
    return envelope;
  }

  function readUndoBackup(): PersistedUndoBackupEnvelope | null {
    const raw = safeReadRaw(undoStorageKey);
    if (raw === null) {
      return null;
    }

    try {
      const decoded: unknown = JSON.parse(raw);
      if (
        !isEnvelopeCandidate(decoded) ||
        decoded.schemaVersion !== SCHEDULE_SCHEMA_VERSION ||
        typeof decoded.savedAtIso !== 'string' ||
        decoded.savedAtIso.trim().length === 0
      ) {
        safeRemoveRaw(undoStorageKey);
        return null;
      }

      const validatedList = parseCuidadorList(decoded.cuidadores, 'undo.cuidadores');
      return Object.freeze({
        schemaVersion: SCHEDULE_SCHEMA_VERSION,
        savedAtIso: decoded.savedAtIso,
        cuidadores: validatedList,
      });
    } catch (corruptUndoError) {
      void corruptUndoError;
      safeRemoveRaw(undoStorageKey);
      return null;
    }
  }

  function writeUndoBackup(cuidadores: readonly Cuidador[]): PersistedUndoBackupEnvelope {
    const validatedList = parseCuidadorList(cuidadores, 'undoSnapshot.cuidadores');
    const envelope: PersistedUndoBackupEnvelope = Object.freeze({
      schemaVersion: SCHEDULE_SCHEMA_VERSION,
      savedAtIso: nowIso(),
      cuidadores: validatedList,
    });
    safeWriteRaw(undoStorageKey, JSON.stringify(envelope));
    return envelope;
  }

  function clearUndoBackup(): void {
    safeRemoveRaw(undoStorageKey);
  }

  function readPrivacyMode(): boolean {
    const raw = safeReadRaw(privacyStorageKey);
    if (raw === null) {
      return false;
    }

    try {
      const decoded: unknown = JSON.parse(raw);
      if (
        !isEnvelopeCandidate(decoded) ||
        decoded.schemaVersion !== SCHEDULE_SCHEMA_VERSION ||
        typeof decoded.enabled !== 'boolean' ||
        typeof decoded.updatedAtIso !== 'string' ||
        decoded.updatedAtIso.trim().length === 0
      ) {
        safeRemoveRaw(privacyStorageKey);
        return false;
      }

      return decoded.enabled;
    } catch (corruptPrivacyError) {
      void corruptPrivacyError;
      safeRemoveRaw(privacyStorageKey);
      return false;
    }
  }

  function writePrivacyMode(enabled: boolean): boolean {
    const normalized = Boolean(enabled);
    const envelope: PersistedPrivacyModeEnvelope = Object.freeze({
      schemaVersion: SCHEDULE_SCHEMA_VERSION,
      enabled: normalized,
      updatedAtIso: nowIso(),
    });
    safeWriteRaw(privacyStorageKey, JSON.stringify(envelope));
    return normalized;
  }

  function clear(): void {
    safeRemoveRaw(storageKey);
    safeRemoveRaw(undoStorageKey);
    safeRemoveRaw(privacyStorageKey);
  }

  return {
    readInitialState,
    writeSnapshot,
    readUndoBackup,
    writeUndoBackup,
    clearUndoBackup,
    readPrivacyMode,
    writePrivacyMode,
    clear,
  };
}

export const defaultLocalFirstStore: LocalFirstStore = createLocalFirstStore();
