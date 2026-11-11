import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CaregiverApiError,
  DEFAULT_API_BASE_URL,
  createCaregiverApiClient,
  normalizeApiBaseUrl,
} from '../src/services/caregiverApi';
import {
  CARLOS_ROCHA_ID,
  type ConnectivityEventTarget,
  createCaregiverScheduleController,
} from '../src/services/caregiverSyncController';
import {
  SCHEDULE_STORAGE_KEY,
  type StorageAdapter,
  createLocalFirstStore,
  getCanonicalSeed,
} from '../src/services/localFirstStore';
import {
  ContractValidationError,
  type Cuidador,
  MAX_BATCH_SIZE,
  MAX_SAFE_JS_ID,
  applyStatusChange,
  nextOperationalStatus,
  parseCuidador,
  parseCuidadorList,
  toStatusUpdatePayload,
} from '../src/types/caregiver';

function createMemoryStorage(initialEntries: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initialEntries));
  const removedKeys: string[] = [];

  const adapter: StorageAdapter = {
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
    removeItem(key: string): void {
      removedKeys.push(key);
      data.delete(key);
    },
  };

  return { adapter, data, removedKeys };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FE #2 — Canonical Caregiver Contract, Local-First Store & Hybrid Sync Suite', () => {
  describe('1. Canonical 8-Field Caregiver Contract (BE #2 cacbc81 Parity)', () => {
    it('parses all 8 fields, sorts ascending by id, and omits null/undefined keys in JSON', () => {
      const parsed = parseCuidadorList([
        {
          id: 4,
          nome: '  Mariana Costa  ',
          status: 'Cobertura',
          turno: ' Noturno (19h-07h) ',
          quarto: ' Quarto 04 ',
          telefone: ' 5511999990004 ',
          horasDescanso: 24,
          substituto: ' Folguista Turno A ',
        },
        {
          id: 1,
          nome: 'Ana Souza',
          status: 'Presente',
          turno: null,
          quarto: '   ',
          substituto: 'Ignorado Porque Nao Cobertura',
        },
      ]);

      expect(parsed.map((c) => c.id)).toEqual([1, 4]);
      expect(parsed[0]).toEqual({
        id: 1,
        nome: 'Ana Souza',
        status: 'Presente',
      });
      expect(Object.keys(parsed[0])).toEqual(['id', 'nome', 'status']);
      expect(JSON.stringify(parsed)).not.toContain('null');

      expect(parsed[1]).toEqual({
        id: 4,
        nome: 'Mariana Costa',
        status: 'Cobertura',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 04',
        telefone: '5511999990004',
        horasDescanso: 24,
        substituto: 'Folguista Turno A',
      });
    });

    it('rejects scalar type coercions, null-bytes, out-of-range limits, and duplicate IDs', () => {
      expect(() => parseCuidadorList([])).toThrow(ContractValidationError);

      const oversized = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => ({
        id: i + 1,
        nome: `Profissional ${i + 1}`,
        status: 'Presente',
      }));
      expect(() => parseCuidadorList(oversized)).toThrow(ContractValidationError);

      expect(() =>
        parseCuidadorList([
          { id: 2, nome: 'Ana Souza', status: 'Presente' },
          { id: 2, nome: 'Lucas Lima', status: 'Presente' },
        ])
      ).toThrow(ContractValidationError);

      const invalidPayloads: unknown[] = [
        null,
        [],
        { id: 0, nome: 'Ana', status: 'Presente' },
        { id: -3, nome: 'Ana', status: 'Presente' },
        { id: 1.5, nome: 'Ana', status: 'Presente' },
        { id: '1', nome: 'Ana', status: 'Presente' },
        { id: MAX_SAFE_JS_ID + 1, nome: 'Ana', status: 'Presente' },
        { id: 1, nome: '   ', status: 'Presente' },
        { id: 1, nome: 12345, status: 'Presente' },
        { id: 1, nome: 'Ana\0Souza', status: 'Presente' },
        { id: 1, nome: 'A'.repeat(121), status: 'Presente' },
        { id: 1, nome: 'Ana', status: 'Ausente' },
        { id: 1, nome: 'Ana', status: 'Presente', turno: true },
        { id: 1, nome: 'Ana', status: 'Presente', quarto: 'Q'.repeat(121) },
        { id: 1, nome: 'Ana', status: 'Presente', telefone: '9'.repeat(33) },
        { id: 1, nome: 'Ana', status: 'Presente', horasDescanso: -1 },
        { id: 1, nome: 'Ana', status: 'Presente', horasDescanso: 721 },
        { id: 1, nome: 'Ana', status: 'Presente', horasDescanso: 11.5 },
        { id: 1, nome: 'Ana', status: 'Presente', horasDescanso: '12' },
        { id: 1, nome: 'Ana', status: 'Cobertura', substituto: 'S'.repeat(121) },
      ];

      for (const bad of invalidPayloads) {
        expect(() => parseCuidador(bad)).toThrow(ContractValidationError);
      }
    });

    it('cycles operational status deterministically and strips substituto outside Cobertura', () => {
      expect(nextOperationalStatus('Presente')).toBe('Faltou');
      expect(nextOperationalStatus('Faltou')).toBe('Folga');
      expect(nextOperationalStatus('Folga')).toBe('Presente');
      expect(nextOperationalStatus('Cobertura')).toBe('Presente');

      const covered = parseCuidador({
        id: 3,
        nome: 'Carlos Rocha',
        status: 'Cobertura',
        substituto: 'Folguista Turno A',
      });
      const backToPresent = applyStatusChange(covered, nextOperationalStatus(covered.status));
      expect(backToPresent.status).toBe('Presente');
      expect('substituto' in backToPresent).toBe(false);

      const patchPayload = toStatusUpdatePayload('Faltou', 'DeveSerOmitido');
      expect(JSON.stringify(patchPayload)).toBe('{"status":"Faltou"}');
    });
  });

  describe('2. Local-First Store (0ms Hydration, F5 Survival, Corrupt Purge & Quota Fallback)', () => {
    it('hydrates canonical 4-item seed in 0ms and survives F5 reloads with pendingRemoteSync', () => {
      const { adapter } = createMemoryStorage();
      const storeSession1 = createLocalFirstStore({
        storage: adapter,
        nowIso: () => '2026-11-10T07:00:00.000Z',
      });

      const cold = storeSession1.readInitialState();
      expect(cold.source).toBe('seed');
      expect(cold.pendingRemoteSync).toBe(false);
      expect(cold.cuidadores).toHaveLength(4);
      expect(cold.cuidadores[2]).toEqual({
        id: 3,
        nome: 'Carlos Rocha',
        status: 'Presente',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 03',
        telefone: '+55 11 90000-0103',
        horasDescanso: 24,
      });

      const mutated = cold.cuidadores.map((c) =>
        c.id === CARLOS_ROCHA_ID ? applyStatusChange(c, 'Faltou') : c
      );
      storeSession1.writeSnapshot(mutated, true);

      // Simulate browser F5 reload with a brand-new store instance reading same storage
      const storeAfterF5 = createLocalFirstStore({ storage: adapter });
      const rehydrated = storeAfterF5.readInitialState();
      expect(rehydrated.source).toBe('storage');
      expect(rehydrated.pendingRemoteSync).toBe(true);
      expect(rehydrated.cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe('Faltou');
    });

    it('purges corrupt JSON, outdated schemaVersion, or poisoned caregiver statuses automatically', () => {
      const corruptCases = [
        '{corrupt-json',
        JSON.stringify({
          schemaVersion: 99,
          updatedAtIso: '2026-11-10T07:00:00Z',
          pendingRemoteSync: false,
          cuidadores: getCanonicalSeed(),
        }),
        JSON.stringify({
          schemaVersion: 1,
          updatedAtIso: '2026-11-10T07:00:00Z',
          pendingRemoteSync: 'yes',
          cuidadores: getCanonicalSeed(),
        }),
        JSON.stringify({
          schemaVersion: 1,
          updatedAtIso: '2026-11-10T07:00:00Z',
          pendingRemoteSync: true,
          cuidadores: [{ id: 3, nome: 'Carlos Rocha', status: 'StatusCorrompido' }],
        }),
      ];

      for (const payload of corruptCases) {
        const { adapter, data, removedKeys } = createMemoryStorage({
          [SCHEDULE_STORAGE_KEY]: payload,
        });
        const store = createLocalFirstStore({ storage: adapter });
        const recovered = store.readInitialState();

        expect(recovered.source).toBe('purged-corrupt');
        expect(recovered.pendingRemoteSync).toBe(false);
        expect(recovered.cuidadores).toEqual(getCanonicalSeed());
        expect(removedKeys).toContain(SCHEDULE_STORAGE_KEY);
        expect(data.has(SCHEDULE_STORAGE_KEY)).toBe(false);
      }
    });

    it('degrades gracefully to in-memory storage when localStorage throws SecurityError or QuotaExceededError', () => {
      const hostileStorage: StorageAdapter = {
        getItem() {
          throw new DOMException('Blocked in private iframe', 'SecurityError');
        },
        setItem() {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        },
        removeItem() {
          throw new DOMException('Blocked', 'SecurityError');
        },
      };

      const store = createLocalFirstStore({ storage: hostileStorage });
      const initial = store.readInitialState();
      expect(initial.cuidadores).toHaveLength(4);

      const updated = initial.cuidadores.map((c) =>
        c.id === 1 ? applyStatusChange(c, 'Folga') : c
      );
      expect(() => store.writeSnapshot(updated, true)).not.toThrow();

      const fromFallback = store.readInitialState();
      expect(fromFallback.cuidadores.find((c) => c.id === 1)?.status).toBe('Folga');
      expect(fromFallback.pendingRemoteSync).toBe(true);
    });
  });

  describe('3. API Client (URL Normalization, Timeout vs Caller Abort & LIFO Listener Cleanup)', () => {
    it('normalizes VITE_API_BASE_URL stripping trailing slashes and defaulting to localhost:8080', () => {
      expect(normalizeApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
      expect(normalizeApiBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL);
      expect(normalizeApiBaseUrl('http://localhost:8080///')).toBe('http://localhost:8080');
      expect(normalizeApiBaseUrl('https://api.elderly.example.com/v1//')).toBe(
        'https://api.elderly.example.com/v1'
      );
    });

    it('distinguishes 2500ms timeout (kind=timeout) from caller abort (kind=aborted) and cleans listeners', async () => {
      vi.useFakeTimers();

      const hangingFetch: typeof fetch = (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });

      const api = createCaregiverApiClient({
        baseUrl: 'http://localhost:8080/',
        fetchImpl: hangingFetch,
        timeoutMs: 2500,
      });

      // 1. Genuine 2500ms timeout -> kind === 'timeout'
      const callerForTimeout = new AbortController();
      const removeSpy = vi.spyOn(callerForTimeout.signal, 'removeEventListener');
      const timeoutPromise = api.fetchCaregivers(callerForTimeout.signal);
      const timeoutRejection = expect(timeoutPromise).rejects.toMatchObject({
        name: 'CaregiverApiError',
        kind: 'timeout',
      });
      await vi.advanceTimersByTimeAsync(2500);
      await timeoutRejection;
      expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));

      // 2. Explicit caller cancellation before timeout -> kind === 'aborted'
      const callerForCancel = new AbortController();
      const cancelPromise = api.fetchCaregivers(callerForCancel.signal);
      callerForCancel.abort();
      await expect(cancelPromise).rejects.toMatchObject({
        name: 'CaregiverApiError',
        kind: 'aborted',
      });
    });

    it('surfaces structured HTTP error codes and rejects malformed or contract-breaking responses', async () => {
      const api404 = createCaregiverApiClient({
        fetchImpl: async () =>
          jsonResponse({ code: 'CUIDADOR_NOT_FOUND', message: 'Cuidador 99 nao encontrado.' }, 404),
      });

      await expect(api404.patchCaregiverStatus(99, 'Faltou')).rejects.toMatchObject({
        kind: 'http',
        status: 404,
        errorCode: 'CUIDADOR_NOT_FOUND',
      });

      const apiBrokenContract = createCaregiverApiClient({
        fetchImpl: async () => jsonResponse([{ id: 3, nome: 'Carlos', status: 'StatusInvalido' }]),
      });

      await expect(apiBrokenContract.fetchCaregivers()).rejects.toMatchObject({
        kind: 'contract',
      });
    });
  });

  describe('4. Hybrid Sync Controller (Anti-Clobbering M2.1, 404 Auto-Heal, 3-Click Race & Offline/Online)', () => {
    it('prevents offline-then-online clobbering without F5 by promoting dirty state to POST /batch (M2.1)', async () => {
      const { adapter } = createMemoryStorage();
      const store = createLocalFirstStore({ storage: adapter });

      let serverOnline = false;
      let serverState: Cuidador[] = getCanonicalSeed();
      const calls: string[] = [];

      const fetchMock: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        calls.push(`${method} ${url}`);

        if (!serverOnline) {
          throw new TypeError('Failed to fetch');
        }

        if (method === 'GET' && url.endsWith('/api/cuidadores')) {
          return jsonResponse(serverState);
        }
        if (method === 'POST' && url.endsWith('/api/cuidadores/batch')) {
          serverState = parseCuidadorList(JSON.parse(String(init?.body)));
          return jsonResponse(serverState);
        }
        if (method === 'PATCH' && url.includes('/status')) {
          const id = Number(url.split('/').at(-2));
          const payload = JSON.parse(String(init?.body)) as { status: Cuidador['status'] };
          serverState = serverState.map((c) =>
            c.id === id ? applyStatusChange(c, payload.status) : c
          );
          return jsonResponse(serverState.find((c) => c.id === id));
        }
        return jsonResponse({ message: 'Not found' }, 404);
      };

      const api = createCaregiverApiClient({ fetchImpl: fetchMock });
      const controller = createCaregiverScheduleController({ store, api, eventTarget: null });

      // 0ms synchronous hydration before network settles
      expect(controller.getSnapshot().cuidadores).toHaveLength(4);
      expect(controller.getSnapshot().connectionStatus).toBe('checking');

      // Boot while backend :8080 is offline -> falls back to 'local-first'
      await controller.reconcile();
      expect(controller.getSnapshot().connectionStatus).toBe('local-first');

      // 1. Operator clicks "Falta de Carlos" while offline
      await controller.simulateCarlosAbsence();
      expect(controller.getSnapshot().connectionStatus).toBe('local-first');
      expect(controller.getSnapshot().pendingRemoteSync).toBe(true);
      expect(
        controller.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status
      ).toBe('Faltou');

      // 2. Backend :8080 starts up locally (NO window 'online' event fired!)
      serverOnline = true;

      // 3. Operator clicks Ana Souza (id: 1) WITHOUT pressing F5 first
      await controller.toggleCaregiverStatus(1);

      // Controller MUST have promoted sync to POST /api/cuidadores/batch so Carlos is NOT lost!
      expect(calls.at(-1)).toContain('POST http://localhost:8080/api/cuidadores/batch');
      expect(controller.getSnapshot().connectionStatus).toBe('online');
      expect(controller.getSnapshot().pendingRemoteSync).toBe(false);
      expect(serverState.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe('Faltou');
      expect(serverState.find((c) => c.id === 1)?.status).toBe('Faltou');

      // 4. Subsequent F5 reload against live server preserves BOTH Carlos and Ana as 'Faltou'
      const afterF5 = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: adapter }),
        api,
        eventTarget: null,
      });
      await afterF5.reconcile();
      expect(afterF5.getSnapshot().connectionStatus).toBe('online');
      expect(afterF5.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );
      expect(afterF5.getSnapshot().cuidadores.find((c) => c.id === 1)?.status).toBe('Faltou');
    });

    it('pushes pendingRemoteSync snapshot via POST /batch on F5 reload and auto-heals PATCH 404', async () => {
      const { adapter } = createMemoryStorage();
      const store = createLocalFirstStore({ storage: adapter });

      // Pre-populate dirty offline state before F5
      const dirtyInitial = getCanonicalSeed().map((c) =>
        c.id === CARLOS_ROCHA_ID ? applyStatusChange(c, 'Faltou') : c
      );
      store.writeSnapshot(dirtyInitial, true);

      let serverState = getCanonicalSeed();
      let forceNextPatch404 = true;
      const calls: string[] = [];

      const api = createCaregiverApiClient({
        fetchImpl: async (input, init) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          calls.push(`${method} ${url}`);

          if (method === 'POST' && url.endsWith('/api/cuidadores/batch')) {
            serverState = parseCuidadorList(JSON.parse(String(init?.body)));
            return jsonResponse(serverState);
          }
          if (method === 'PATCH' && forceNextPatch404) {
            forceNextPatch404 = false;
            return jsonResponse(
              { code: 'CUIDADOR_NOT_FOUND', message: 'Cuidador ausente apos restart.' },
              404
            );
          }
          return jsonResponse(serverState);
        },
      });

      const controller = createCaregiverScheduleController({ store, api, eventTarget: null });
      await controller.reconcile();

      // Reconcile pushed dirty state via POST /batch (not GET!)
      expect(calls[0]).toBe('POST http://localhost:8080/api/cuidadores/batch');
      expect(serverState.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe('Faltou');
      expect(controller.getSnapshot().connectionStatus).toBe('online');
      expect(controller.getSnapshot().pendingRemoteSync).toBe(false);

      // Now trigger single PATCH that receives 404 -> auto-heals via POST /batch!
      await controller.toggleCaregiverStatus(CARLOS_ROCHA_ID);
      expect(calls.slice(-2)).toEqual([
        'PATCH http://localhost:8080/api/cuidadores/3/status',
        'POST http://localhost:8080/api/cuidadores/batch',
      ]);
      expect(controller.getSnapshot().connectionStatus).toBe('online');
      expect(
        controller.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status
      ).toBe('Folga');
    });

    it('protects 3 rapid clicks against out-of-order responses without flickering online badge', async () => {
      const { adapter } = createMemoryStorage();
      const store = createLocalFirstStore({ storage: adapter });

      const pendingResolvers: Array<() => void> = [];
      const observedStatuses: string[] = [];

      const api: ReturnType<typeof createCaregiverApiClient> = {
        baseUrl: DEFAULT_API_BASE_URL,
        fetchCaregivers: async () => getCanonicalSeed(),
        syncCaregiversBatch: async (items) => [...items],
        resetCaregiversSchedule: async () => getCanonicalSeed(),
        patchCaregiverStatus: (id, status, _substituto, signal) =>
          new Promise<Cuidador>((resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new CaregiverApiError('Aborted', 'aborted'));
            });
            pendingResolvers.push(() => {
              const base = getCanonicalSeed().find((c) => c.id === id)!;
              resolve(applyStatusChange(base, status));
            });
          }),
      };

      const controller = createCaregiverScheduleController({ store, api, eventTarget: null });
      await controller.reconcile();
      expect(controller.getSnapshot().connectionStatus).toBe('online');

      controller.subscribe(() => {
        observedStatuses.push(controller.getSnapshot().connectionStatus);
      });

      // Rapid 3 clicks on Carlos: Presente -> Faltou -> Folga -> Presente
      const p1 = controller.toggleCaregiverStatus(CARLOS_ROCHA_ID);
      const p2 = controller.toggleCaregiverStatus(CARLOS_ROCHA_ID);
      const p3 = controller.toggleCaregiverStatus(CARLOS_ROCHA_ID);

      expect(
        controller.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status
      ).toBe('Presente');

      // Resolve in reverse / out-of-order sequence
      for (const resolveFn of pendingResolvers.reverse()) {
        resolveFn();
      }
      await Promise.all([p1, p2, p3]);

      expect(
        controller.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status
      ).toBe('Presente');
      expect(controller.getSnapshot().pendingRemoteSync).toBe(false);
      // Zero flicker back to 'checking' while already 'online' (M4.3)
      expect(observedStatuses.every((s) => s === 'online')).toBe(true);
    });

    it('handles window online/offline events, resetSchedule, and LIFO listener teardown', async () => {
      const { adapter } = createMemoryStorage();
      const store = createLocalFirstStore({ storage: adapter });

      const registered: string[] = [];
      const removed: string[] = [];
      const innerTarget = new EventTarget();
      const trackedTarget: ConnectivityEventTarget = {
        addEventListener(type, listener) {
          registered.push(type);
          innerTarget.addEventListener(type, listener);
        },
        removeEventListener(type, listener) {
          removed.push(type);
          innerTarget.removeEventListener(type, listener);
        },
      };

      let online = true;
      const api = createCaregiverApiClient({
        fetchImpl: async (input, init) => {
          if (!online) {
            throw new TypeError('Network down');
          }
          const url = typeof input === 'string' ? input : input.toString();
          if (init?.method === 'POST' && url.endsWith('/api/cuidadores/reset')) {
            return jsonResponse(getCanonicalSeed());
          }
          if (init?.method === 'POST' && url.endsWith('/api/cuidadores/batch')) {
            return jsonResponse(JSON.parse(String(init.body)));
          }
          return jsonResponse(getCanonicalSeed());
        },
      });

      const controller = createCaregiverScheduleController({
        store,
        api,
        eventTarget: trackedTarget,
      });
      controller.start();
      await vi.waitFor(() => {
        expect(controller.getSnapshot().connectionStatus).toBe('online');
      });

      // Simulate offline drop + absence mutation
      online = false;
      innerTarget.dispatchEvent(new Event('offline'));
      expect(controller.getSnapshot().connectionStatus).toBe('local-first');

      await controller.simulateCarlosAbsence();
      expect(controller.getSnapshot().pendingRemoteSync).toBe(true);

      // Network comes back -> 'online' event triggers reconcile() via POST /batch
      online = true;
      innerTarget.dispatchEvent(new Event('online'));
      await vi.waitFor(() => {
        expect(controller.getSnapshot().connectionStatus).toBe('online');
        expect(controller.getSnapshot().pendingRemoteSync).toBe(false);
      });

      // Reset schedule -> restores all 4 caregivers to Presente
      await controller.resetSchedule();
      expect(controller.getSnapshot().cuidadores.every((c) => c.status === 'Presente')).toBe(true);
      expect(controller.getSnapshot().pendingRemoteSync).toBe(false);

      // Dispose -> LIFO listener removal ('offline' removed before 'online')
      controller.dispose();
      expect(registered).toEqual(['online', 'offline']);
      expect(removed).toEqual(['offline', 'online']);
    });
  });
});
