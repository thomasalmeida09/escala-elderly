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
  PRIVACY_MODE_STORAGE_KEY,
  SCHEDULE_STORAGE_KEY,
  type StorageAdapter,
  createLocalFirstStore,
  getCanonicalSeed,
} from '../src/services/localFirstStore';
import {
  type BroadcastChannelLike,
  type BroadcastMessageEventLike,
  type EventSourceLike,
  SSE_SCHEDULE_UPDATED_EVENT,
  type SseMessageEventLike,
} from '../src/services/multiplayerSyncEngine';
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

  describe('5. FE #5 — Dual-Layer Multiplayer Controller Orchestration (BroadcastChannel + SSE + Anti-Clobber)', () => {
    function createInMemoryBroadcastHub(hubOptions?: { readonly asyncDelivery?: boolean }) {
      const peersByChannel = new Map<string, Set<MockPeer>>();
      let totalCreated = 0;

      interface MockPeer extends BroadcastChannelLike {
        readonly isClosed: () => boolean;
      }

      const factory = (channelName: string): BroadcastChannelLike => {
        totalCreated += 1;
        let closed = false;
        const listeners = new Set<(event: BroadcastMessageEventLike) => void>();

        let channelSet = peersByChannel.get(channelName);
        if (!channelSet) {
          channelSet = new Set<MockPeer>();
          peersByChannel.set(channelName, channelSet);
        }

        const peer: MockPeer = {
          onmessage: null,
          isClosed: () => closed,
          addEventListener(_type: 'message', listener: (event: BroadcastMessageEventLike) => void) {
            listeners.add(listener);
          },
          removeEventListener(
            _type: 'message',
            listener: (event: BroadcastMessageEventLike) => void
          ) {
            listeners.delete(listener);
          },
          postMessage(rawMessage: unknown) {
            if (closed) {
              throw new DOMException('Channel is closed', 'InvalidStateError');
            }
            const cloned = structuredClone(rawMessage);
            const dispatchToPeers = (): void => {
              for (const other of channelSet!) {
                if (other === peer || other.isClosed()) {
                  continue;
                }
                const evt: BroadcastMessageEventLike = { data: structuredClone(cloned) };
                for (const fn of otherListenersMap.get(other) ?? []) {
                  fn(evt);
                }
                other.onmessage?.(evt);
              }
            };
            if (hubOptions?.asyncDelivery) {
              queueMicrotask(dispatchToPeers);
              return;
            }
            dispatchToPeers();
          },
          close() {
            if (closed) {
              return;
            }
            closed = true;
            listeners.clear();
            peer.onmessage = null;
            channelSet?.delete(peer);
          },
        };

        otherListenersMap.set(peer, listeners);
        channelSet.add(peer);
        return peer;
      };

      const otherListenersMap = new WeakMap<
        MockPeer,
        Set<(event: BroadcastMessageEventLike) => void>
      >();

      return {
        factory,
        getActiveChannelCount(channelName = 'escala_elderly:multiplayer:v1'): number {
          return peersByChannel.get(channelName)?.size ?? 0;
        },
        getTotalCreatedCount(): number {
          return totalCreated;
        },
      };
    }

    interface ControllableSseHandle {
      readonly url: string;
      readonly isClosed: () => boolean;
      emitOpen(): void;
      emitScheduleUpdated(cuidadores: readonly Cuidador[], lastEventId?: string): void;
      emitError(): void;
    }

    function createControllableEventSourceHub() {
      const sockets: ControllableSseHandle[] = [];
      let activeCount = 0;

      const factory = (url: string): EventSourceLike => {
        let closed = false;
        activeCount += 1;
        const listeners = new Map<string, Set<(event: SseMessageEventLike) => void>>();

        const source: EventSourceLike = {
          onopen: null,
          onerror: null,
          addEventListener(type: string, listener: (event: SseMessageEventLike) => void) {
            let bucket = listeners.get(type);
            if (!bucket) {
              bucket = new Set();
              listeners.set(type, bucket);
            }
            bucket.add(listener);
          },
          removeEventListener(type: string, listener: (event: SseMessageEventLike) => void) {
            listeners.get(type)?.delete(listener);
          },
          close() {
            if (closed) {
              return;
            }
            closed = true;
            activeCount -= 1;
            listeners.clear();
            source.onopen = null;
            source.onerror = null;
          },
        };

        const handle: ControllableSseHandle = {
          url,
          isClosed: () => closed,
          emitOpen() {
            if (!closed) {
              source.onopen?.({});
            }
          },
          emitScheduleUpdated(cuidadores: readonly Cuidador[], lastEventId = '1') {
            if (closed) {
              return;
            }
            const payload: SseMessageEventLike = {
              data: JSON.stringify(cuidadores),
              lastEventId,
            };
            for (const fn of listeners.get(SSE_SCHEDULE_UPDATED_EVENT) ?? []) {
              fn(payload);
            }
          },
          emitError() {
            if (!closed) {
              source.onerror?.({});
            }
          },
        };

        sockets.push(handle);
        return source;
      };

      return {
        factory,
        sockets,
        getActiveSocketCount: () => activeCount,
      };
    }

    it('5.1 synchronizes 2 offline tabs (< 5ms) across toggle, absence, CLT coverage, CSV import + honest undoBackup (M2.2), and reset with 0 HTTP calls on Tab B (S01, S02, S03)', async () => {
      const hub = createInMemoryBroadcastHub();
      let tabAFetchCount = 0;
      let tabBFetchCount = 0;

      const offlineApiA = createCaregiverApiClient({
        fetchImpl: async () => {
          tabAFetchCount += 1;
          throw new TypeError('Offline');
        },
      });
      const offlineApiB = createCaregiverApiClient({
        fetchImpl: async () => {
          tabBFetchCount += 1;
          throw new TypeError('Offline');
        },
      });

      // M2.2: Both tabs run with isolated volatile stores (storage: null) to prove undoBackup travels inside SCHEDULE_SYNC!
      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api: offlineApiA,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
      });
      const tabB = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api: offlineApiB,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
      });

      tabA.start();
      tabB.start();

      await vi.waitFor(() => {
        expect(tabA.getSnapshot().connectionStatus).toBe('local-first');
        expect(tabB.getSnapshot().connectionStatus).toBe('local-first');
      });

      const baselineTabBFetches = tabBFetchCount;
      expect(baselineTabBFetches).toBe(1); // Only initial boot reconcile

      // 1. Toggle Ana Souza on Tab A -> Tab B updates synchronously via BroadcastChannel
      await tabA.toggleCaregiverStatus(1);
      expect(tabB.getSnapshot().cuidadores.find((c) => c.id === 1)?.status).toBe('Faltou');
      expect(tabB.getSnapshot().pendingRemoteSync).toBe(true);

      // 2. Simulate Carlos absence on Tab A -> Tab B updates
      await tabA.simulateCarlosAbsence();
      expect(tabB.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );

      // 3. Confirm CLT coverage on Tab B -> Tab A updates!
      await tabB.confirmCaregiverCoverage(CARLOS_ROCHA_ID, 'Beatriz Alves');
      expect(tabA.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)).toMatchObject({
        status: 'Cobertura',
        substituto: 'Beatriz Alves',
      });

      // 4. Import CSV batch on Tab A -> Tab B receives roster + canUndoImport: true + undoBackup in volatile store (M2.2)!
      const importedRoster = [
        parseCuidador({
          id: 10,
          nome: 'Fernanda Melo',
          status: 'Presente',
          turno: 'Diurno (07h-19h)',
          quarto: 'Quarto 10',
        }),
      ];
      const beforeImportOnA = tabA.getSnapshot().cuidadores;
      await tabA.importCaregiversBatch(importedRoster);

      expect(tabB.getSnapshot().cuidadores).toEqual(importedRoster);
      expect(tabB.getSnapshot().canUndoImport).toBe(true);

      // 5. Undo import directly FROM Tab B (proving M2.2 cross-tab undoBackup works even with storage: null!)
      const undoneByTabB = await tabB.undoLastImport();
      expect(undoneByTabB).toBe(true);
      expect(tabB.getSnapshot().canUndoImport).toBe(false);
      expect(tabA.getSnapshot().canUndoImport).toBe(false);
      expect(tabA.getSnapshot().cuidadores).toEqual(beforeImportOnA);

      // 6. Reset schedule on Tab A -> Tab B returns all 4 caregivers to 'Presente'
      await tabA.resetSchedule();
      expect(tabB.getSnapshot().cuidadores).toEqual(getCanonicalSeed());
      expect(tabB.getSnapshot().canUndoImport).toBe(false);

      // S03: Incoming BroadcastChannel messages on Tab B triggered 0 extra HTTP requests
      // (Tab B only performed 1 boot fetch + 2 explicit mutations initiated directly on Tab B: coverage & undo)
      expect(tabBFetchCount).toBe(baselineTabBFetches + 2);
      expect(tabAFetchCount).toBeGreaterThanOrEqual(4);

      tabA.dispose();
      tabB.dispose();
      expect(hub.getActiveChannelCount()).toBe(0);
    });

    it('5.2 enforces conditional persistence (M2.1 / S05: 0 redundant setItem writes across 3 shared-storage tabs) and strict referential idempotence (M1.3 / S06)', async () => {
      const hub = createInMemoryBroadcastHub();
      const sseHub = createControllableEventSourceHub();

      let scheduleSetItemCount = 0;
      const backing = new Map<string, string>();
      const sharedAdapter: StorageAdapter = {
        getItem: (key) => backing.get(key) ?? null,
        setItem: (key, value) => {
          if (key === SCHEDULE_STORAGE_KEY) {
            scheduleSetItemCount += 1;
          }
          backing.set(key, value);
        },
        removeItem: (key) => {
          backing.delete(key);
        },
      };

      let serverRoster = getCanonicalSeed();
      const onlineApi = createCaregiverApiClient({
        fetchImpl: async (_input, init) => {
          if (init?.method === 'PATCH') {
            const payload = JSON.parse(String(init.body)) as { status: Cuidador['status'] };
            serverRoster = serverRoster.map((c) =>
              c.id === CARLOS_ROCHA_ID ? applyStatusChange(c, payload.status) : c
            );
            return jsonResponse(serverRoster.find((c) => c.id === CARLOS_ROCHA_ID));
          }
          return jsonResponse(serverRoster);
        },
      });

      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: sharedAdapter }),
        api: onlineApi,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });
      const tabB = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: sharedAdapter }),
        api: onlineApi,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });
      const tabC = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: sharedAdapter }),
        api: onlineApi,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });

      tabA.start();
      tabB.start();
      tabC.start();

      await vi.waitFor(() => {
        expect(tabA.getSnapshot().connectionStatus).toBe('online');
        expect(tabB.getSnapshot().connectionStatus).toBe('online');
        expect(tabC.getSnapshot().connectionStatus).toBe('online');
      });

      // Reset write counter after initial cold-storage seed hydration
      scheduleSetItemCount = 0;

      // Mutate Carlos on Tab A:
      // 1 optimistic write (pendingRemoteSync: true) + 1 confirmed write (pendingRemoteSync: false) on Tab A = 2 writes total.
      // Tab B and Tab C MUST perform 0 redundant setItem writes because sharedAdapter already holds the exact state!
      await tabA.simulateCarlosAbsence();
      expect(tabB.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );
      expect(tabC.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );
      expect(scheduleSetItemCount).toBe(2);

      // S06 (M1.3): Emitting an identical SSE snapshot preserves Object.is(prev, next) and fires 0 listener notifications!
      const prevSnapB = tabB.getSnapshot();
      let tabBNotifications = 0;
      const unsubB = tabB.subscribe(() => {
        tabBNotifications += 1;
      });

      sseHub.sockets[1]!.emitOpen();
      sseHub.sockets[1]!.emitScheduleUpdated(serverRoster, '10');

      expect(tabBNotifications).toBe(0);
      expect(Object.is(prevSnapB, tabB.getSnapshot())).toBe(true);
      expect(scheduleSetItemCount).toBe(2);

      unsubB();
      tabA.dispose();
      tabB.dispose();
      tabC.dispose();
    });

    it('5.3 protects offline edits against stale SSE initial snapshots on reconnect and auto-pushes via POST /batch (S08)', async () => {
      const hub = createInMemoryBroadcastHub();
      const sseHub = createControllableEventSourceHub();

      let serverOnline = false;
      let serverRoster = getCanonicalSeed();
      const httpCalls: string[] = [];

      const api = createCaregiverApiClient({
        fetchImpl: async (input, init) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          httpCalls.push(`${method} ${url}`);
          if (!serverOnline) {
            throw new TypeError('Offline');
          }
          if (method === 'POST' && url.endsWith('/api/cuidadores/batch')) {
            serverRoster = parseCuidadorList(JSON.parse(String(init?.body)));
            return jsonResponse(serverRoster);
          }
          return jsonResponse(serverRoster);
        },
      });

      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });
      const tabB = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });

      tabA.start();
      tabB.start();

      await vi.waitFor(() => {
        expect(tabA.getSnapshot().connectionStatus).toBe('local-first');
        expect(tabB.getSnapshot().connectionStatus).toBe('local-first');
      });

      // Operator marks Carlos absent while offline -> both tabs hold pendingRemoteSync: true
      await tabA.simulateCarlosAbsence();
      expect(tabA.getSnapshot().pendingRemoteSync).toBe(true);
      expect(tabB.getSnapshot().pendingRemoteSync).toBe(true);
      expect(tabB.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );

      // Backend comes back online and SSE delivers stale server seed (Carlos = Presente) BEFORE POST /batch finishes!
      serverOnline = true;
      sseHub.sockets[0]!.emitScheduleUpdated(getCanonicalSeed(), '1');
      // Anti-Clobber invariant: stale SSE snapshot MUST NOT overwrite Carlos = Faltou!
      expect(tabA.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );

      // SSE onopen triggers reconcile() -> pushes dirty batch via POST /api/cuidadores/batch!
      sseHub.sockets[0]!.emitOpen();

      await vi.waitFor(() => {
        expect(tabA.getSnapshot().connectionStatus).toBe('online');
        expect(tabA.getSnapshot().pendingRemoteSync).toBe(false);
        expect(tabB.getSnapshot().connectionStatus).toBe('online');
        expect(tabB.getSnapshot().pendingRemoteSync).toBe(false);
      });

      expect(serverRoster.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe('Faltou');
      expect(tabA.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );
      expect(tabB.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );
      expect(httpCalls.some((c) => c.startsWith('POST ') && c.endsWith('/batch'))).toBe(true);

      tabA.dispose();
      tabB.dispose();
    });

    it('5.4 converges sub-ms distinct-card races in 0ms with 0 extra GETs (S09) and resolves same-card LWW races via GET reconcile (S10 / M1.1)', async () => {
      const hub = createInMemoryBroadcastHub();
      const sseHub = createControllableEventSourceHub();

      let serverRoster = getCanonicalSeed();
      let getCount = 0;
      let pendingPatchResolver: ((item: Cuidador) => void) | null = null;

      const api: ReturnType<typeof createCaregiverApiClient> = {
        baseUrl: DEFAULT_API_BASE_URL,
        fetchCaregivers: async () => {
          getCount += 1;
          return serverRoster;
        },
        syncCaregiversBatch: async (items) => [...items],
        resetCaregiversSchedule: async () => getCanonicalSeed(),
        patchCaregiverStatus: () =>
          new Promise<Cuidador>((resolve) => {
            pendingPatchResolver = resolve;
          }),
      };

      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });
      const tabB = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });

      tabA.start();
      tabB.start();
      sseHub.sockets[0]!.emitOpen();
      sseHub.sockets[1]!.emitOpen();

      await vi.waitFor(() => {
        expect(tabA.getSnapshot().connectionStatus).toBe('online');
        expect(tabB.getSnapshot().connectionStatus).toBe('online');
      });

      const baselineGets = getCount;

      // === SCENARIO S09: Distinct-card race (Tab A patches Carlos -> Faltou; Device C patches Ana -> Folga) ===
      const patchPromiseS09 = tabA.simulateCarlosAbsence();
      const s09ServerState = getCanonicalSeed().map((c) => {
        if (c.id === 1) return applyStatusChange(c, 'Folga');
        if (c.id === CARLOS_ROCHA_ID) return applyStatusChange(c, 'Faltou');
        return c;
      });
      serverRoster = s09ServerState;

      // SSE v3 arrives on Tab A WHILE Tab A's PATCH /3 response is still in flight!
      sseHub.sockets[0]!.emitScheduleUpdated(s09ServerState, '2');

      // Resolve Tab A's PATCH /3 HTTP response (singlePatchedItem = Carlos Faltou)
      pendingPatchResolver!(s09ServerState.find((c) => c.id === CARLOS_ROCHA_ID)!);
      await patchPromiseS09;

      // Both Tab A AND sibling Tab B converge to [Ana=Folga, Carlos=Faltou] in 0ms with ZERO extra GET calls!
      expect(getCount).toBe(baselineGets);
      expect(tabA.getSnapshot().cuidadores.find((c) => c.id === 1)?.status).toBe('Folga');
      expect(tabA.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );
      expect(tabB.getSnapshot().cuidadores.find((c) => c.id === 1)?.status).toBe('Folga');
      expect(tabB.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );

      // === SCENARIO S10 (M1.1): Same-card LWW race (Tab A patches Carlos -> Folga [v2]; Device C wins LWW with Carlos -> Cobertura [v3]) ===
      const patchPromiseS10 = tabA.toggleCaregiverStatus(CARLOS_ROCHA_ID); // Carlos Faltou -> Folga (v2)
      const s10ServerWinner = s09ServerState.map((c) =>
        c.id === CARLOS_ROCHA_ID ? applyStatusChange(c, 'Cobertura', 'Beatriz Alves') : c
      );
      serverRoster = s10ServerWinner;

      // SSE v3 (Carlos = Cobertura) arrives BEFORE Tab A's stale HTTP v2 response (Carlos = Folga)!
      sseHub.sockets[0]!.emitScheduleUpdated(s10ServerWinner, '3');

      // Now Tab A's HTTP v2 response resolves with Carlos = Folga (superseded on server by v3!)
      const staleV2Carlos = applyStatusChange(
        getCanonicalSeed().find((c) => c.id === CARLOS_ROCHA_ID)!,
        'Folga'
      );
      pendingPatchResolver!(staleV2Carlos);
      await patchPromiseS10;

      // M1.1: Controller detects matchingInSse (Cobertura) !== singlePatchedItem (Folga), triggers GET reconcile,
      // and converges BOTH Tab A and sibling Tab B to Cobertura (Beatriz Alves)!
      await vi.waitFor(() => {
        expect(tabA.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)).toMatchObject({
          status: 'Cobertura',
          substituto: 'Beatriz Alves',
        });
        expect(tabB.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)).toMatchObject({
          status: 'Cobertura',
          substituto: 'Beatriz Alves',
        });
      });
      expect(getCount).toBe(baselineGets + 1);

      tabA.dispose();
      tabB.dispose();
    });

    it('5.5 aborts slow boot GET on fresher SSE/BroadcastChannel arrival (M1.2 / S11) and guards in-flight sibling mutations (M2.3)', async () => {
      const hub = createInMemoryBroadcastHub();
      const sseHub = createControllableEventSourceHub();

      let capturedBootSignal: AbortSignal | undefined;
      let resolveSlowBootGet: (items: Cuidador[]) => void = () => undefined;
      let serverRoster = getCanonicalSeed();

      const api: ReturnType<typeof createCaregiverApiClient> = {
        baseUrl: DEFAULT_API_BASE_URL,
        fetchCaregivers: (signal) => {
          if (!capturedBootSignal) {
            capturedBootSignal = signal;
            return new Promise<Cuidador[]>((resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new CaregiverApiError('Aborted stale GET', 'aborted'));
              });
              resolveSlowBootGet = resolve;
            });
          }
          return Promise.resolve(serverRoster);
        },
        syncCaregiversBatch: async (items) => {
          serverRoster = [...items];
          return serverRoster;
        },
        resetCaregiversSchedule: async () => getCanonicalSeed(),
        patchCaregiverStatus: async (id, status) => {
          serverRoster = serverRoster.map((c) => (c.id === id ? applyStatusChange(c, status) : c));
          return serverRoster.find((c) => c.id === id)!;
        },
      };

      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });

      tabA.start();
      expect(capturedBootSignal).toBeDefined();
      expect(capturedBootSignal!.aborted).toBe(false);

      // Fresher SSE v2 arrives while slow boot GET v1 is still hanging!
      const v2Roster = getCanonicalSeed().map((c) =>
        c.id === CARLOS_ROCHA_ID ? applyStatusChange(c, 'Faltou') : c
      );
      serverRoster = v2Roster;
      sseHub.sockets[0]!.emitOpen();
      sseHub.sockets[0]!.emitScheduleUpdated(v2Roster, '5');

      // M1.2 / S11: Slow boot GET AbortSignal was deterministically aborted and v2 is active!
      expect(capturedBootSignal!.aborted).toBe(true);
      expect(tabA.getSnapshot().connectionStatus).toBe('online');
      expect(tabA.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );

      // Even if resolveSlowBootGet were invoked late, v1 CANNOT overwrite v2
      resolveSlowBootGet(getCanonicalSeed());
      await Promise.resolve();
      expect(tabA.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
        'Faltou'
      );

      // M2.3: Sibling SCHEDULE_SYNC arriving while Tab B has an in-flight PATCH does NOT wipe Tab B's dirty state
      let resolveTabBPatch: ((item: Cuidador) => void) | null = null;
      let tabBFetchCount = 0;
      const tabBApi: ReturnType<typeof createCaregiverApiClient> = {
        baseUrl: DEFAULT_API_BASE_URL,
        fetchCaregivers: async () => {
          tabBFetchCount += 1;
          return serverRoster;
        },
        syncCaregiversBatch: async (items) => {
          serverRoster = [...items];
          return serverRoster;
        },
        resetCaregiversSchedule: async () => getCanonicalSeed(),
        patchCaregiverStatus: (id, status) =>
          new Promise<Cuidador>((resolve) => {
            resolveTabBPatch = (item) => {
              serverRoster = serverRoster.map((c) =>
                c.id === id ? applyStatusChange(c, status) : c
              );
              resolve(item);
            };
          }),
      };

      const tabB = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api: tabBApi,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
      });
      tabB.start();
      await vi.waitFor(() => {
        expect(tabB.getSnapshot().connectionStatus).toBe('online');
      });

      // Tab B starts an in-flight PATCH on Mariana (id=4 -> Faltou)
      const tabBMutation = tabB.toggleCaregiverStatus(4);
      // Simultaneously Tab A toggles Ana (id=1 -> Faltou), broadcasting SCHEDULE_SYNC to Tab B mid-flight!
      await tabA.toggleCaregiverStatus(1);

      // Tab B MUST still show Mariana = Faltou while its PATCH /4 is in-flight!
      expect(tabB.getSnapshot().cuidadores.find((c) => c.id === 4)?.status).toBe('Faltou');

      const marianaPatched = applyStatusChange(
        getCanonicalSeed().find((c) => c.id === 4)!,
        'Faltou'
      );
      resolveTabBPatch!(marianaPatched);
      await tabBMutation;

      // After Tab B's PATCH finishes, deferredCrossTabPayload triggers reconcile() and both Tab A & Tab B converge to Ana=Faltou + Mariana=Faltou!
      await vi.waitFor(() => {
        expect(tabB.getSnapshot().cuidadores.find((c) => c.id === 1)?.status).toBe('Faltou');
        expect(tabB.getSnapshot().cuidadores.find((c) => c.id === 4)?.status).toBe('Faltou');
        expect(tabA.getSnapshot().cuidadores.find((c) => c.id === 4)?.status).toBe('Faltou');
      });
      expect(tabBFetchCount).toBeGreaterThanOrEqual(2);

      tabA.dispose();
      tabB.dispose();
    });

    it('5.6 enforces M3.1 / S16 connection badge stability (proxy-blocked SSE vs real drop after onopen) and online reconnectNow (S17)', async () => {
      vi.useFakeTimers();
      const sseHub = createControllableEventSourceHub();
      const innerTarget = new EventTarget();
      const observedStatuses: string[] = [];

      const api = createCaregiverApiClient({
        fetchImpl: async () => jsonResponse(getCanonicalSeed()),
      });

      const controller = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: innerTarget,
        eventSourceFactory: sseHub.factory,
        sseRandom: () => 0.5,
      });

      controller.subscribe(() => {
        observedStatuses.push(controller.getSnapshot().connectionStatus);
      });

      controller.start();
      await vi.waitFor(() => {
        expect(controller.getSnapshot().connectionStatus).toBe('online');
      });
      expect(sseHub.sockets).toHaveLength(1);

      // Case 1 (M3.1): Corporate proxy blocks text/event-stream BEFORE onopen (hadOpenStream = false)
      // REST GET succeeded -> badge MUST remain 'online' and NEVER flicker to 'local-first' or 'checking'!
      observedStatuses.length = 0;
      sseHub.sockets[0]!.emitError();
      expect(controller.getSnapshot().connectionStatus).toBe('online');
      expect(observedStatuses).toEqual([]);

      // Advance timer to let background SSE retry connect (socket #2)
      await vi.advanceTimersByTimeAsync(2000);
      expect(sseHub.sockets).toHaveLength(2);
      expect(observedStatuses).toEqual([]);

      // Case 2 (S16): Socket #2 opens cleanly (hadOpenStream = true), then backend crashes (emitError)!
      sseHub.sockets[1]!.emitOpen();
      sseHub.sockets[1]!.emitError();
      expect(controller.getSnapshot().connectionStatus).toBe('local-first');
      expect(observedStatuses).toEqual(['local-first']);

      // Subsequent background retry failures MUST NOT spam 'checking' into aria-live!
      await vi.advanceTimersByTimeAsync(2000);
      expect(sseHub.sockets).toHaveLength(3);
      sseHub.sockets[2]!.emitError();
      expect(observedStatuses).toEqual(['local-first']);

      // Case 3 (S17): Browser 'online' event triggers immediate sseClient.reconnectNow() (socket #4) + reconcile()!
      innerTarget.dispatchEvent(new Event('online'));
      expect(sseHub.sockets).toHaveLength(4);
      sseHub.sockets[3]!.emitOpen();
      await vi.waitFor(() => {
        expect(controller.getSnapshot().connectionStatus).toBe('online');
      });

      controller.dispose();
      expect(sseHub.getActiveSocketCount()).toBe(0);
    });

    it('5.7 survives React 19 <StrictMode> double-effect lifecycle with 0 socket/channel leaks and syncs LGPD privacyMode without touching canonical schedule (S18, S19, M4.2)', async () => {
      const hub = createInMemoryBroadcastHub();
      const sseHub = createControllableEventSourceHub();

      const registered: string[] = [];
      const removed: string[] = [];
      const trackedTarget: ConnectivityEventTarget = {
        addEventListener(type) {
          registered.push(type);
        },
        removeEventListener(type) {
          removed.push(type);
        },
      };

      const memA = createMemoryStorage();
      const memB = createMemoryStorage();
      const storeA = createLocalFirstStore({ storage: memA.adapter });
      const storeB = createLocalFirstStore({ storage: memB.adapter });

      // Pre-seed unredacted schedule in both stores
      storeA.writeSnapshot(getCanonicalSeed(), false);
      storeB.writeSnapshot(getCanonicalSeed(), false);
      const rawScheduleBefore = memB.data.get(SCHEDULE_STORAGE_KEY);

      const api = createCaregiverApiClient({
        fetchImpl: async () => jsonResponse(getCanonicalSeed()),
      });

      const tabA = createCaregiverScheduleController({
        store: storeA,
        api,
        eventTarget: trackedTarget,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });
      const tabB = createCaregiverScheduleController({
        store: storeB,
        api,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
        eventSourceFactory: sseHub.factory,
      });

      // Subscribe privacy listener BEFORE StrictMode cycle (as useCaregivers useEffect does on remount)
      const receivedPrivacyOnB: boolean[] = [];
      const unsubPrivacyB = tabB.subscribePrivacyMode((enabled) => {
        receivedPrivacyOnB.push(enabled);
      });

      // Simulate React 19 <StrictMode> mount -> cleanup -> remount on both tabs!
      tabA.start();
      tabA.dispose();
      tabA.start();

      tabB.start();
      tabB.dispose();
      tabB.start();

      // Exactly 2 active BroadcastChannels (1 per tab) and 2 active EventSources (1 per tab) — ZERO orphans!
      expect(hub.getActiveChannelCount()).toBe(2);
      expect(sseHub.getActiveSocketCount()).toBe(2);

      // S19 & M4.2: Toggling privacyMode on Tab A propagates via PRIVACY_SYNC to Tab B (< 5ms)
      tabA.publishPrivacyMode(true);
      expect(receivedPrivacyOnB).toEqual([true]);
      expect(storeB.readPrivacyMode()).toBe(true);
      expect(memB.data.has(PRIVACY_MODE_STORAGE_KEY)).toBe(true);

      // Canonical schedule storage in Tab B remains 100% unredacted (Carlos Rocha + full phone preserved!)
      expect(memB.data.get(SCHEDULE_STORAGE_KEY)).toBe(rawScheduleBefore);
      expect(memB.data.get(SCHEDULE_STORAGE_KEY)).toContain('Carlos Rocha');
      expect(memB.data.get(SCHEDULE_STORAGE_KEY)).toContain('+55 11 90000-0103');

      tabA.publishPrivacyMode(false);
      expect(receivedPrivacyOnB).toEqual([true, false]);
      expect(storeB.readPrivacyMode()).toBe(false);

      unsubPrivacyB();
      tabA.dispose();
      tabB.dispose();

      expect(hub.getActiveChannelCount()).toBe(0);
      expect(sseHub.getActiveSocketCount()).toBe(0);
      expect(registered).toEqual(['online', 'offline', 'online', 'offline']);
      expect(removed).toEqual(['offline', 'online', 'offline', 'online']);
    });

    it('5.8 prevents POST /batch server clobber on simultaneous in-flight cross-tab clicks, protects in-flight CSV undoBackup, and avoids cold-boot checking deadlock', async () => {
      const hub = createInMemoryBroadcastHub({ asyncDelivery: true });
      let serverRoster = getCanonicalSeed();
      let batchCalls = 0;
      let holdNextBatchImport = false;

      let resolvePatch1: (() => void) | null = null;
      let resolvePatch4: (() => void) | null = null;
      let resolveBatchImport: (() => void) | null = null;

      const sharedOnlineApi: ReturnType<typeof createCaregiverApiClient> = {
        baseUrl: DEFAULT_API_BASE_URL,
        fetchCaregivers: async () => serverRoster,
        syncCaregiversBatch: async (items) => {
          batchCalls += 1;
          if (holdNextBatchImport) {
            holdNextBatchImport = false;
            await new Promise<void>((resolve) => {
              resolveBatchImport = resolve;
            });
            resolveBatchImport = null;
          }
          serverRoster = [...items];
          return serverRoster;
        },
        resetCaregiversSchedule: async () => {
          serverRoster = getCanonicalSeed();
          return serverRoster;
        },
        patchCaregiverStatus: (id, status, substituto) =>
          new Promise<Cuidador>((resolve) => {
            const completePatch = (): void => {
              serverRoster = serverRoster.map((c) =>
                c.id === id ? applyStatusChange(c, status, substituto) : c
              );
              resolve(serverRoster.find((c) => c.id === id)!);
            };
            if (id === 1) {
              resolvePatch1 = completePatch;
            } else if (id === 4) {
              resolvePatch4 = completePatch;
            } else {
              completePatch();
            }
          }),
      };

      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api: sharedOnlineApi,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
      });
      const tabB = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api: sharedOnlineApi,
        eventTarget: null,
        broadcastChannelFactory: hub.factory,
      });

      tabA.start();
      tabB.start();
      await vi.waitFor(() => {
        expect(tabA.getSnapshot().connectionStatus).toBe('online');
        expect(tabB.getSnapshot().connectionStatus).toBe('online');
      });

      // 1. Both tabs click simultaneously (same tick before W3C BroadcastChannel async task delivery)
      // while BOTH HTTP PATCH requests remain in-flight!
      const p1 = tabA.toggleCaregiverStatus(1); // Ana -> Faltou
      const p4 = tabB.toggleCaregiverStatus(4); // Mariana -> Faltou

      // Flush BroadcastChannel microtasks so both tabs buffer the sibling's optimistic SCHEDULE_SYNC in deferredCrossTabPayload
      await Promise.resolve();

      resolvePatch1!();
      await p1;
      resolvePatch4!();
      await p4;

      // Neither tab may issue POST /batch to clobber the sibling's confirmed server PATCH!
      expect(batchCalls).toBe(0);
      await vi.waitFor(() => {
        expect(serverRoster.find((c) => c.id === 1)?.status).toBe('Faltou');
        expect(serverRoster.find((c) => c.id === 4)?.status).toBe('Faltou');
        expect(tabA.getSnapshot().cuidadores.find((c) => c.id === 1)?.status).toBe('Faltou');
        expect(tabA.getSnapshot().cuidadores.find((c) => c.id === 4)?.status).toBe('Faltou');
        expect(tabB.getSnapshot().cuidadores.find((c) => c.id === 1)?.status).toBe('Faltou');
        expect(tabB.getSnapshot().cuidadores.find((c) => c.id === 4)?.status).toBe('Faltou');
        expect(tabA.getSnapshot().pendingRemoteSync).toBe(false);
        expect(tabB.getSnapshot().pendingRemoteSync).toBe(false);
      });

      // 2. While Tab B is mid-flight in importCaregiversBatch (POST /batch), a concurrent pre-import SCHEDULE_SYNC
      // with canUndoImport: false from Tab A MUST NOT wipe Tab B's newly created undoBackup!
      const importedList = [
        parseCuidador({
          id: 99,
          nome: 'Helena Costa',
          status: 'Presente',
          turno: 'Diurno (07h-19h)',
          quarto: 'Quarto 12',
        }),
      ];
      holdNextBatchImport = true;
      const p3 = tabA.simulateCarlosAbsence(); // Queues pre-import SCHEDULE_SYNC(canUndoImport: false) on microtask!
      const importPromise = tabB.importCaregiversBatch(importedList); // Starts POST /batch before microtask arrives!
      await vi.waitFor(() => {
        expect(resolveBatchImport).not.toBeNull();
      });

      resolveBatchImport!();
      await importPromise;
      await p3;

      await vi.waitFor(() => {
        expect(tabB.getSnapshot().canUndoImport).toBe(true);
      });

      tabA.dispose();
      tabB.dispose();

      // 3. Cold-boot multi-tab StorageEvent & offline cross-tab edit never strand passive tab in 'checking'
      const storageTarget = new EventTarget();
      const sharedMem = createMemoryStorage();
      let resolveColdBootTab2: ((items: Cuidador[]) => void) | null = null;
      let coldBootTab2Signal: AbortSignal | undefined;

      const coldTab2 = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: sharedMem.adapter }),
        api: {
          baseUrl: DEFAULT_API_BASE_URL,
          fetchCaregivers: (signal) => {
            coldBootTab2Signal = signal;
            return new Promise<Cuidador[]>((resolve) => {
              resolveColdBootTab2 = resolve;
            });
          },
          syncCaregiversBatch: async (items) => [...items],
          resetCaregiversSchedule: async () => getCanonicalSeed(),
          patchCaregiverStatus: async (id, status) =>
            applyStatusChange(
              getCanonicalSeed().find((c) => c.id === id)!,
              status
            ),
        },
        eventTarget: null,
        broadcastChannelFactory: null,
        storageEventTarget: storageTarget,
      });

      coldTab2.start();
      expect(coldTab2.getSnapshot().connectionStatus).toBe('checking');

      // Tab 1 finishes boot GET first and writes identical canonical seed to shared localStorage -> fires StorageEvent
      const tab1Store = createLocalFirstStore({ storage: sharedMem.adapter });
      const writtenSeed = tab1Store.writeSnapshot(getCanonicalSeed(), false);
      storageTarget.dispatchEvent(
        Object.assign(new Event('storage'), {
          key: SCHEDULE_STORAGE_KEY,
          newValue: JSON.stringify(writtenSeed),
        })
      );

      // Cold-boot guard keeps Tab 2's boot GET alive so Tab 2 resolves cleanly to 'online'
      expect(coldBootTab2Signal?.aborted).toBe(false);
      resolveColdBootTab2!(getCanonicalSeed());
      await vi.waitFor(() => {
        expect(coldTab2.getSnapshot().connectionStatus).toBe('online');
      });
      coldTab2.dispose();

      // Offline boot: Tab 3's boot GET hangs while offline Tab 4 broadcasts an edit -> Tab 3 exits 'checking' -> 'local-first'
      const offlineHub = createInMemoryBroadcastHub();
      const offlineTab3 = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api: {
          baseUrl: DEFAULT_API_BASE_URL,
          fetchCaregivers: (signal) =>
            new Promise<Cuidador[]>((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new CaregiverApiError('Aborted', 'aborted'));
              });
            }),
          syncCaregiversBatch: async (items) => [...items],
          resetCaregiversSchedule: async () => getCanonicalSeed(),
          patchCaregiverStatus: async () => {
            throw new CaregiverApiError('Offline', 'network');
          },
        },
        eventTarget: null,
        broadcastChannelFactory: offlineHub.factory,
      });
      const offlineTab4 = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api: createCaregiverApiClient({
          fetchImpl: async () => {
            throw new TypeError('Offline');
          },
        }),
        eventTarget: null,
        broadcastChannelFactory: offlineHub.factory,
      });

      offlineTab3.start();
      offlineTab4.start();
      expect(offlineTab3.getSnapshot().connectionStatus).toBe('checking');

      await offlineTab4.simulateCarlosAbsence();
      expect(
        offlineTab3.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status
      ).toBe('Faltou');
      expect(offlineTab3.getSnapshot().connectionStatus).toBe('local-first');

      offlineTab3.dispose();
      offlineTab4.dispose();
    });

    // ---------------------------------------------------------------------------------------------
    // Hotfix FE #5 (plano 15): o clique que promove PATCH -> POST /batch não pode apagar uma edição
    // já confirmada pelo servidor para OUTRO dispositivo (frame SSE retido em deferredSseSchedule).
    // Cenário comum (5.9, 5.10, 5.12): A online, SSE aberto, PATCH do card 1 em voo.
    // ---------------------------------------------------------------------------------------------
    function createRetainedFrameScenario(options?: {
      readonly failFirstBatchWith?: CaregiverApiError;
      readonly holdBatch?: boolean;
    }) {
      const sseHub = createControllableEventSourceHub();
      let serverRoster = getCanonicalSeed();
      let getCount = 0;
      const batchBodies: Cuidador[][] = [];
      let releaseBatch: () => void = () => undefined;
      const batchGate = new Promise<void>((resolve) => {
        releaseBatch = resolve;
      });
      let failuresLeft = options?.failFirstBatchWith ? 1 : 0;

      const api: ReturnType<typeof createCaregiverApiClient> = {
        baseUrl: DEFAULT_API_BASE_URL,
        fetchCaregivers: async () => {
          getCount += 1;
          return serverRoster;
        },
        syncCaregiversBatch: async (items) => {
          batchBodies.push([...items]);
          if (options?.holdBatch) {
            await batchGate;
          }
          if (failuresLeft > 0 && options?.failFirstBatchWith) {
            failuresLeft -= 1;
            throw options.failFirstBatchWith;
          }
          serverRoster = [...items];
          return [...items];
        },
        resetCaregiversSchedule: async () => getCanonicalSeed(),
        // O PATCH nunca resolve sozinho: só termina quando o controlador o aborta (promoção a batch).
        patchCaregiverStatus: (_id, _status, _substituto, signal) =>
          new Promise<Cuidador>((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new CaregiverApiError('Aborted', 'aborted'))
            );
          }),
      };

      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: null,
        eventSourceFactory: sseHub.factory,
      });

      return {
        tabA,
        sseHub,
        batchBodies,
        releaseBatch: () => releaseBatch(),
        getCount: () => getCount,
        getServerRoster: () => serverRoster,
        setServerRoster: (next: Cuidador[]) => {
          serverRoster = next;
        },
        async startOnline() {
          tabA.start();
          sseHub.sockets[0]!.emitOpen();
          await vi.waitFor(() => {
            expect(tabA.getSnapshot().connectionStatus).toBe('online');
          });
        },
      };
    }

    const statusOf = (list: readonly Cuidador[], id: number) =>
      list.find((c) => c.id === id)?.status;

    it('5.9 merges the retained SSE frame into the promoted POST /batch so a confirmed edit from another device survives (J1)', async () => {
      const scenario = createRetainedFrameScenario({ holdBatch: true });
      const { tabA, sseHub, batchBodies } = scenario;
      try {
        await scenario.startOnline();
        const baselineGets = scenario.getCount();

        // 1) A clica o card 1 (Ana): PATCH /1 fica em voo, dirtyCardIds = {1}.
        const p1 = tabA.toggleCaregiverStatus(1);

        // 2) Outro dispositivo marca Lucas (id 2) Faltou; o frame SSE chega a A e fica retido.
        const rosterFromC = getCanonicalSeed().map((c) =>
          c.id === 2 ? applyStatusChange(c, 'Faltou') : c
        );
        scenario.setServerRoster(rosterFromC);
        sseHub.sockets[0]!.emitScheduleUpdated(rosterFromC, '2');

        // 3) Antes do PATCH voltar, A clica o card 3 (Carlos): promove a POST /batch (POST retido).
        const p3 = tabA.toggleCaregiverStatus(3);

        // Estado otimista ANTES do POST terminar: a edição de C já está no estado local (variante M2).
        const optimistic = tabA.getSnapshot().cuidadores;
        expect(statusOf(optimistic, 1)).toBe('Faltou');
        expect(statusOf(optimistic, 2)).toBe('Faltou');
        expect(statusOf(optimistic, 3)).toBe('Faltou');
        expect(statusOf(optimistic, 4)).toBe('Presente');
        expect(batchBodies).toHaveLength(1);
        expect(statusOf(batchBodies[0]!, 2)).toBe('Faltou');

        scenario.releaseBatch();
        await Promise.all([p1, p3]);

        // O servidor simulado termina com a edição de C preservada; nenhuma releitura extra (opção A).
        expect(batchBodies).toHaveLength(1);
        expect(statusOf(scenario.getServerRoster(), 2)).toBe('Faltou');
        expect(scenario.getCount()).toBe(baselineGets);
        const finalSnapshot = tabA.getSnapshot();
        expect(statusOf(finalSnapshot.cuidadores, 1)).toBe('Faltou');
        expect(statusOf(finalSnapshot.cuidadores, 2)).toBe('Faltou');
        expect(statusOf(finalSnapshot.cuidadores, 3)).toBe('Faltou');
        expect(statusOf(finalSnapshot.cuidadores, 4)).toBe('Presente');
        expect(finalSnapshot.pendingRemoteSync).toBe(false);
        expect(finalSnapshot.connectionStatus).toBe('online');
      } finally {
        tabA.dispose();
      }
    });

    it('5.10 keeps the merged edit of another device when the promoted POST /batch fails, so the retry does not erase it', async () => {
      const scenario = createRetainedFrameScenario({
        failFirstBatchWith: new CaregiverApiError('timeout', 'timeout'),
      });
      const { tabA, sseHub, batchBodies } = scenario;
      try {
        await scenario.startOnline();

        const p1 = tabA.toggleCaregiverStatus(1);
        const rosterFromC = getCanonicalSeed().map((c) =>
          c.id === 2 ? applyStatusChange(c, 'Faltou') : c
        );
        scenario.setServerRoster(rosterFromC);
        sseHub.sockets[0]!.emitScheduleUpdated(rosterFromC, '2');

        await Promise.all([p1, tabA.toggleCaregiverStatus(3)]);

        // O 1º POST falhou: A fica local-first e sujo, MAS a edição de C já está no estado local.
        expect(batchBodies).toHaveLength(1);
        expect(tabA.getSnapshot().connectionStatus).toBe('local-first');
        expect(tabA.getSnapshot().pendingRemoteSync).toBe(true);
        expect(statusOf(tabA.getSnapshot().cuidadores, 2)).toBe('Faltou');

        // O retry (reconcile sujo reenvia o roster LOCAL) não pode apagar a edição de C de novo.
        await tabA.reconcile();
        expect(batchBodies).toHaveLength(2);
        expect(statusOf(batchBodies[1]!, 2)).toBe('Faltou');
        expect(statusOf(scenario.getServerRoster(), 2)).toBe('Faltou');
      } finally {
        tabA.dispose();
      }
    });

    it("5.11 keeps the operator's offline edits when a retained SSE frame exists and a further click promotes to POST /batch (V2 / S26)", async () => {
      const sseHub = createControllableEventSourceHub();
      let serverOnline = false;
      let serverRoster = getCanonicalSeed();
      const batchBodies: Cuidador[][] = [];

      const api = createCaregiverApiClient({
        fetchImpl: async (input, init) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          if (!serverOnline) {
            throw new TypeError('Offline');
          }
          if (method === 'POST' && url.endsWith('/api/cuidadores/batch')) {
            serverRoster = parseCuidadorList(JSON.parse(String(init?.body)));
            batchBodies.push(serverRoster);
            return jsonResponse(serverRoster);
          }
          return jsonResponse(serverRoster);
        },
      });

      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: null,
        eventSourceFactory: sseHub.factory,
      });

      try {
        tabA.start();
        await vi.waitFor(() => {
          expect(tabA.getSnapshot().connectionStatus).toBe('local-first');
        });

        // Offline: o operador edita Ana e Carlos (sujeira desconhecida => fullBatchDirty = true).
        await tabA.toggleCaregiverStatus(1);
        await tabA.toggleCaregiverStatus(3);
        expect(statusOf(tabA.getSnapshot().cuidadores, 1)).toBe('Faltou');
        expect(statusOf(tabA.getSnapshot().cuidadores, 3)).toBe('Faltou');

        // O servidor volta com Lucas Faltou (edição de outro dispositivo) e um frame ANTIGO sobre Ana/Carlos.
        serverOnline = true;
        const frameFromServer = getCanonicalSeed().map((c) =>
          c.id === 2 ? applyStatusChange(c, 'Faltou') : c
        );
        serverRoster = frameFromServer;
        sseHub.sockets[0]!.emitScheduleUpdated(frameFromServer, '2');

        // Mais um clique, ainda sem onopen: o roster LOCAL vence (P2: sujeira global, não há como mesclar).
        await tabA.toggleCaregiverStatus(4);

        expect(batchBodies).toHaveLength(1);
        expect(statusOf(batchBodies[0]!, 1)).toBe('Faltou');
        expect(statusOf(batchBodies[0]!, 3)).toBe('Faltou');
        expect(statusOf(batchBodies[0]!, 4)).toBe('Faltou');
        // Documentação do limite aceito: Lucas Faltou do servidor NÃO entra, porque fullBatchDirty === true.
        expect(statusOf(batchBodies[0]!, 2)).toBe('Presente');
      } finally {
        tabA.dispose();
      }
    });

    it('5.12 characterizes the stale retained frame limit (V3): the merge adopts the frame value for a card this tab already confirmed', async () => {
      const sseHub = createControllableEventSourceHub();
      let serverRoster = getCanonicalSeed();
      const batchBodies: Cuidador[][] = [];
      let patchesResolved = 0;

      const api: ReturnType<typeof createCaregiverApiClient> = {
        baseUrl: DEFAULT_API_BASE_URL,
        fetchCaregivers: async () => serverRoster,
        syncCaregiversBatch: async (items) => {
          batchBodies.push([...items]);
          serverRoster = [...items];
          return [...items];
        },
        resetCaregiversSchedule: async () => getCanonicalSeed(),
        patchCaregiverStatus: (id, status, substituto, signal) => {
          // Mariana (id 4) é confirmada na hora; os demais PATCHs ficam em voo até o aborto da promoção.
          if (id === 4) {
            patchesResolved += 1;
            const base = getCanonicalSeed().find((c) => c.id === 4)!;
            return Promise.resolve(applyStatusChange(base, status, substituto));
          }
          return new Promise<Cuidador>((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new CaregiverApiError('Aborted', 'aborted'))
            );
          });
        },
      };

      const tabA = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: null,
        eventSourceFactory: sseHub.factory,
      });

      try {
        tabA.start();
        sseHub.sockets[0]!.emitOpen();
        await vi.waitFor(() => {
          expect(tabA.getSnapshot().connectionStatus).toBe('online');
        });

        // A confirma Mariana (id 4) Faltou no servidor: nenhum card sujo, A sabe que Mariana é Faltou.
        await tabA.toggleCaregiverStatus(4);
        expect(patchesResolved).toBe(1);
        expect(statusOf(tabA.getSnapshot().cuidadores, 4)).toBe('Faltou');

        const p1 = tabA.toggleCaregiverStatus(1);
        // Frame emitido ANTES da escrita de A sobre Mariana, mas entregue DEPOIS do 200 do PATCH (reordenação).
        const staleFrame = getCanonicalSeed().map((c) =>
          c.id === 2 ? applyStatusChange(c, 'Faltou') : c
        );
        sseHub.sockets[0]!.emitScheduleUpdated(staleFrame, '2');
        const p3 = tabA.toggleCaregiverStatus(3);
        await Promise.all([p1, p3]);

        expect(batchBodies).toHaveLength(1);
        // Edição de C preservada (objetivo do hotfix)...
        expect(statusOf(batchBodies[0]!, 2)).toBe('Faltou');
        // ...mas o frame VELHO sobrescreve Mariana, que a própria aba já tinha confirmado como Faltou.
        // LIMITE CONHECIDO V3 (plano 15): só uma versão base no backend (opção C) ou a variante A+ o fecham.
        // Se este comportamento mudar, atualize a ressalva do ADR-FE-017.
        expect(statusOf(batchBodies[0]!, 4)).toBe('Presente');
      } finally {
        tabA.dispose();
      }
    });

    it('5.13 wires api.baseUrl and ssePrivacyRedacted into the EventSource stream URL', async () => {
      const lanBase = 'http://192.168.1.50:8080';
      const roster = getCanonicalSeed();
      const api = createCaregiverApiClient({
        baseUrl: lanBase,
        fetchImpl: async () => jsonResponse(roster),
      });

      const urlsOpened: string[] = [];
      const recordingFactory = (url: string): EventSourceLike | null => {
        urlsOpened.push(url);
        return null;
      };

      // Base different from the default, otherwise a controller that forgot to pass api.baseUrl would
      // still build the same URL and this wiring could never be observed.
      const defaultPrivacy = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: null,
        eventSourceFactory: recordingFactory,
      });
      const redactedStream = createCaregiverScheduleController({
        store: createLocalFirstStore({ storage: null }),
        api,
        eventTarget: null,
        broadcastChannelFactory: null,
        eventSourceFactory: recordingFactory,
        ssePrivacyRedacted: true,
      });

      try {
        defaultPrivacy.start();
        redactedStream.start();
        expect(urlsOpened).toEqual([
          `${lanBase}/api/cuidadores/stream`,
          `${lanBase}/api/cuidadores/stream?privacy=true`,
        ]);
      } finally {
        defaultPrivacy.dispose();
        redactedStream.dispose();
      }
    });
  });
});
