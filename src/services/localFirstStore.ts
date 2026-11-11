import caregiversSeedRaw from '../mocks/Caregive.json';
import { type Cuidador, parseCuidadorList } from '../types/caregiver';

export const SCHEDULE_STORAGE_KEY = 'escala_elderly:schedule:v1';
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

export type HydrationSource = 'storage' | 'seed' | 'purged-corrupt';

export interface HydratedScheduleState {
  readonly cuidadores: Cuidador[];
  readonly pendingRemoteSync: boolean;
  readonly source: HydrationSource;
}

export interface LocalFirstStoreOptions {
  readonly storage?: StorageAdapter | null;
  readonly storageKey?: string;
  readonly nowIso?: () => string;
}

export interface LocalFirstStore {
  readInitialState(): HydratedScheduleState;
  writeSnapshot(
    cuidadores: readonly Cuidador[],
    pendingRemoteSync: boolean
  ): PersistedScheduleEnvelope;
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
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const fallbackMemory = new Map<string, string>();
  const resolveStorage = (): StorageAdapter | null =>
    options.storage !== undefined ? options.storage : resolveDefaultStorage();

  function safeRemoveRaw(): void {
    fallbackMemory.delete(storageKey);
    const activeStorage = resolveStorage();
    if (!activeStorage) {
      return;
    }
    try {
      activeStorage.removeItem(storageKey);
    } catch (removeError) {
      fallbackMemory.delete(storageKey);
      void removeError;
    }
  }

  function safeReadRaw(): string | null {
    const activeStorage = resolveStorage();
    if (activeStorage) {
      try {
        const persisted = activeStorage.getItem(storageKey);
        if (persisted !== null) {
          return persisted;
        }
      } catch (readError) {
        void readError;
        return fallbackMemory.get(storageKey) ?? null;
      }
    }
    return fallbackMemory.get(storageKey) ?? null;
  }

  function safeWriteRaw(serialized: string): void {
    fallbackMemory.set(storageKey, serialized);
    const activeStorage = resolveStorage();
    if (!activeStorage) {
      return;
    }
    try {
      activeStorage.setItem(storageKey, serialized);
    } catch (writeError) {
      fallbackMemory.set(storageKey, serialized);
      void writeError;
    }
  }

  function readInitialState(): HydratedScheduleState {
    const raw = safeReadRaw();
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
        safeRemoveRaw();
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
      safeRemoveRaw();
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
    safeWriteRaw(JSON.stringify(envelope));
    return envelope;
  }

  function clear(): void {
    safeRemoveRaw();
  }

  return {
    readInitialState,
    writeSnapshot,
    clear,
  };
}

export const defaultLocalFirstStore: LocalFirstStore = createLocalFirstStore();
