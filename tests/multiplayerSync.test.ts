import { describe, expect, it } from 'vitest';
import {
  PRIVACY_MODE_STORAGE_KEY,
  SCHEDULE_STORAGE_KEY,
  type StorageAdapter,
  UNDO_IMPORT_STORAGE_KEY,
  createLocalFirstStore,
  getCanonicalSeed,
} from '../src/services/localFirstStore';
import {
  type BroadcastChannelFactory,
  type BroadcastChannelLike,
  type BroadcastMessageEventLike,
  DEFAULT_SSE_INITIAL_DELAY_MS,
  DEFAULT_SSE_MAX_DELAY_MS,
  type EventSourceLike,
  MAX_SEEN_MESSAGE_IDS,
  MULTIPLAYER_CHANNEL_NAME,
  MULTIPLAYER_CHANNEL_VERSION,
  SSE_SCHEDULE_UPDATED_EVENT,
  type SseDisconnectInfo,
  type SseMessageEventLike,
  type StorageEventTarget,
  type TimerAdapter,
  buildCaregiverStreamUrl,
  computeSseBackoffDelayMs,
  createCrossTabChannelBridge,
  createSseStreamClient,
  createUniqueId,
  parseCrossTabMessage,
} from '../src/services/multiplayerSyncEngine';
import { applyStatusChange, type Cuidador, MAX_BATCH_SIZE } from '../src/types/caregiver';

function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function createInMemoryBroadcastHub(options: { echoToSender?: boolean } = {}): {
  readonly factory: BroadcastChannelFactory;
  readonly activeChannelCount: () => number;
  readonly postMessageLog: unknown[];
  readonly emitRawToAll: (channelName: string, data: unknown) => void;
} {
  interface PeerEntry {
    readonly channelName: string;
    readonly listeners: Set<(event: BroadcastMessageEventLike) => void>;
    getOnMessage: () => ((event: BroadcastMessageEventLike) => void) | null | undefined;
    closed: boolean;
  }

  const peers = new Set<PeerEntry>();
  const postMessageLog: unknown[] = [];

  const deliver = (peer: PeerEntry, data: unknown): void => {
    if (peer.closed) {
      return;
    }
    const event: BroadcastMessageEventLike = { data };
    for (const listener of peer.listeners) {
      listener(event);
    }
    const onMessage = peer.getOnMessage();
    if (typeof onMessage === 'function') {
      onMessage(event);
    }
  };

  const factory: BroadcastChannelFactory = (channelName: string): BroadcastChannelLike => {
    const listeners = new Set<(event: BroadcastMessageEventLike) => void>();
    const channel: BroadcastChannelLike = {
      onmessage: null,
      postMessage(message: unknown) {
        if (entry.closed) {
          throw new Error('InvalidStateError: BroadcastChannel is closed');
        }
        postMessageLog.push(message);
        for (const peer of peers) {
          if (peer.channelName !== channelName || peer.closed) {
            continue;
          }
          if (!options.echoToSender && peer === entry) {
            continue;
          }
          deliver(peer, structuredClone(message));
        }
      },
      addEventListener(type, listener) {
        if (type === 'message') {
          listeners.add(listener);
        }
      },
      removeEventListener(type, listener) {
        if (type === 'message') {
          listeners.delete(listener);
        }
      },
      close() {
        entry.closed = true;
        peers.delete(entry);
      },
    };

    const entry: PeerEntry = {
      channelName,
      listeners,
      getOnMessage: () => channel.onmessage,
      closed: false,
    };
    peers.add(entry);
    return channel;
  };

  return {
    factory,
    activeChannelCount: () => peers.size,
    postMessageLog,
    emitRawToAll: (channelName, data) => {
      for (const peer of peers) {
        if (peer.channelName === channelName && !peer.closed) {
          deliver(peer, data);
        }
      }
    },
  };
}

interface FakeStorageBus {
  readonly target: StorageEventTarget;
  readonly dispatchStorage: (key: string | null, newValue: string | null) => void;
  readonly listenerCount: () => number;
}

function createFakeStorageBus(): FakeStorageBus {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  return {
    target: {
      addEventListener(type, listener) {
        if (type === 'storage') {
          listeners.add(listener);
        }
      },
      removeEventListener(type, listener) {
        if (type === 'storage') {
          listeners.delete(listener);
        }
      },
    },
    dispatchStorage(key, newValue) {
      const syntheticEvent = Object.assign(new Event('storage'), { key, newValue });
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener(syntheticEvent);
        } else {
          listener.handleEvent(syntheticEvent);
        }
      }
    },
    listenerCount: () => listeners.size,
  };
}

interface ControlledSseSocket extends EventSourceLike {
  readonly url: string;
  closed: boolean;
  readonly lifecycleOps: string[];
  triggerOpen(): void;
  triggerError(): void;
  emitNamedEvent(eventName: string, data: unknown, lastEventId?: unknown): void;
}

function createControlledSseHub(): {
  readonly factory: (url: string) => ControlledSseSocket;
  readonly sockets: ControlledSseSocket[];
  readonly activeSockets: () => ControlledSseSocket[];
} {
  const sockets: ControlledSseSocket[] = [];

  const factory = (url: string): ControlledSseSocket => {
    const namedListeners = new Map<string, Set<(event: SseMessageEventLike) => void>>();
    const lifecycleOps: string[] = [];

    const socket: ControlledSseSocket = {
      url,
      closed: false,
      lifecycleOps,
      onopen: null,
      onerror: null,
      addEventListener(type, listener) {
        lifecycleOps.push(`add:${type}`);
        let group = namedListeners.get(type);
        if (!group) {
          group = new Set();
          namedListeners.set(type, group);
        }
        group.add(listener);
      },
      removeEventListener(type, listener) {
        lifecycleOps.push(`remove:${type}`);
        namedListeners.get(type)?.delete(listener);
      },
      close() {
        lifecycleOps.push('close');
        socket.closed = true;
      },
      triggerOpen() {
        if (!socket.closed) {
          socket.onopen?.({ type: 'open' });
        }
      },
      triggerError() {
        if (!socket.closed) {
          socket.onerror?.({ type: 'error' });
        }
      },
      emitNamedEvent(eventName, data, lastEventId = '') {
        if (socket.closed) {
          return;
        }
        const group = namedListeners.get(eventName);
        if (!group) {
          return;
        }
        for (const listener of group) {
          listener({ data, lastEventId });
        }
      },
    };

    sockets.push(socket);
    return socket;
  };

  return {
    factory,
    sockets,
    activeSockets: () => sockets.filter((s) => !s.closed),
  };
}

function createDeterministicTimerQueue(): {
  readonly timers: TimerAdapter;
  readonly pendingDelays: () => number[];
  readonly activeCount: () => number;
  readonly flushNext: () => number | null;
} {
  interface ScheduledEntry {
    readonly id: ReturnType<typeof setTimeout>;
    readonly delayMs: number;
    readonly callback: () => void;
  }

  let nextId = 1;
  const entries = new Map<ReturnType<typeof setTimeout>, ScheduledEntry>();

  return {
    timers: {
      setTimeout(callback, delayMs) {
        const id = nextId as unknown as ReturnType<typeof setTimeout>;
        nextId += 1;
        entries.set(id, { id, delayMs, callback });
        return id;
      },
      clearTimeout(handle) {
        entries.delete(handle);
      },
    },
    pendingDelays: () => Array.from(entries.values(), (entry) => entry.delayMs),
    activeCount: () => entries.size,
    flushNext: () => {
      const first = entries.values().next().value;
      if (!first) {
        return null;
      }
      entries.delete(first.id);
      first.callback();
      return first.delayMs;
    },
  };
}

describe('Multiplayer Dual-Layer Sync Engine (BroadcastChannel + W3C SSE)', () => {
  it('S20: buildCaregiverStreamUrl normalizes slashes and prevents HPP duplicate ?privacy= parameters', () => {
    expect(buildCaregiverStreamUrl('http://localhost:8080/', false)).toBe(
      'http://localhost:8080/api/cuidadores/stream'
    );
    expect(buildCaregiverStreamUrl('http://localhost:8080///', true)).toBe(
      'http://localhost:8080/api/cuidadores/stream?privacy=true'
    );
    expect(buildCaregiverStreamUrl('http://localhost:8080/?privacy=false#frag', true)).toBe(
      'http://localhost:8080/api/cuidadores/stream?privacy=true'
    );
    expect(buildCaregiverStreamUrl('   ', false)).toBe(
      'http://localhost:8080/api/cuidadores/stream'
    );
  });

  it('S14: createUniqueId and CrossTabChannelBridge work cleanly on non-HTTPS clinic LAN without crypto.randomUUID', () => {
    // Tier 1: standard crypto.randomUUID
    const uuidId = createUniqueId('tab', {
      randomUUID: () => '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(uuidId).toBe('tab-123e4567-e89b-12d3-a456-426614174000');

    // Tier 2: HTTP LAN context (http://192.168.1.50:5173) where randomUUID is undefined
    let counter = 0;
    const lanCrypto = {
      randomUUID: undefined,
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i += 1) {
          arr[i] = (i + counter) & 0xff;
        }
        counter += 1;
        return arr;
      },
    };
    const lanIdA = createUniqueId('tab', lanCrypto);
    const lanIdB = createUniqueId('tab', lanCrypto);
    expect(lanIdA).toMatch(/^tab-[0-9a-f]{32}$/);
    expect(lanIdB).toMatch(/^tab-[0-9a-f]{32}$/);
    expect(lanIdA).not.toBe(lanIdB);

    // Tier 3: Totally restricted environment (crypto === null or throwing randomUUID)
    const fallbackA = createUniqueId('msg', null);
    const fallbackB = createUniqueId('msg', {
      randomUUID: () => {
        throw new Error('SecurityError');
      },
    });
    expect(fallbackA).toMatch(/^msg-[a-z0-9]+-[a-z0-9]+$/);
    expect(fallbackB).toMatch(/^msg-[a-z0-9]+-[a-z0-9]+$/);
    expect(fallbackA).not.toBe(fallbackB);
    expect(fallbackA.length).toBeLessThanOrEqual(64);

    // Bridge boots and exchanges messages cleanly with crypto.randomUUID === undefined
    const hub = createInMemoryBroadcastHub();
    const receivedByB: boolean[] = [];
    const bridgeA = createCrossTabChannelBridge({
      crypto: lanCrypto,
      broadcastChannelFactory: hub.factory,
    });
    const bridgeB = createCrossTabChannelBridge({
      crypto: lanCrypto,
      broadcastChannelFactory: hub.factory,
      onPrivacySync: (enabled) => receivedByB.push(enabled),
    });

    expect(bridgeA.publishPrivacySync(true)).toBe(true);
    expect(receivedByB).toEqual([true]);

    bridgeB.close();
    bridgeA.close();
  });

  it('S03: enforces strict anti-echo (originInstanceId) and 1x postMessage per mutation across sibling tabs', () => {
    const hub = createInMemoryBroadcastHub({ echoToSender: true });
    const receivedOnA: Cuidador[][] = [];
    const receivedOnB: Cuidador[][] = [];

    const bridgeA = createCrossTabChannelBridge({
      broadcastChannelFactory: hub.factory,
      onScheduleSync: (payload) => receivedOnA.push(payload.cuidadores),
    });
    const bridgeB = createCrossTabChannelBridge({
      broadcastChannelFactory: hub.factory,
      onScheduleSync: (payload) => receivedOnB.push(payload.cuidadores),
    });

    const updatedSeed = getCanonicalSeed().map((c) =>
      c.id === 3 ? applyStatusChange(c, 'Faltou') : c
    );

    expect(
      bridgeA.publishScheduleSync({
        cuidadores: updatedSeed,
        pendingRemoteSync: true,
        canUndoImport: false,
      })
    ).toBe(true);

    expect(hub.postMessageLog).toHaveLength(1);
    expect(receivedOnA).toHaveLength(0);
    expect(receivedOnB).toHaveLength(1);
    expect(receivedOnB[0]?.find((c) => c.id === 3)?.status).toBe('Faltou');
    expect(bridgeA.getDiagnostics().ignoredMessagesCount).toBeGreaterThanOrEqual(1);

    bridgeB.close();
    bridgeA.close();
    expect(hub.activeChannelCount()).toBe(0);
  });

  it('S04: bounds seenMessageIds FIFO/LRU window to <= 128 and deduplicates identical messageId across BroadcastChannel + storage', () => {
    const hub = createInMemoryBroadcastHub();
    const storageBus = createFakeStorageBus();
    const receivedPrivacy: boolean[] = [];
    const receivedSchedules: number[] = [];

    const bridge = createCrossTabChannelBridge({
      instanceId: 'tab-receiver',
      broadcastChannelFactory: hub.factory,
      storageEventTarget: storageBus.target,
      onPrivacySync: (enabled) => receivedPrivacy.push(enabled),
      onScheduleSync: (payload) => receivedSchedules.push(payload.cuidadores.length),
    });

    // Deliver the exact same messageId over BroadcastChannel AND StorageEvent -> callback runs ONCE
    const duplicateEnvelope = {
      channelVersion: MULTIPLAYER_CHANNEL_VERSION,
      type: 'SCHEDULE_SYNC',
      originInstanceId: 'tab-remote',
      messageId: 'msg-shared-001',
      cuidadores: getCanonicalSeed(),
      pendingRemoteSync: false,
      canUndoImport: false,
    };

    hub.emitRawToAll(MULTIPLAYER_CHANNEL_NAME, duplicateEnvelope);
    storageBus.dispatchStorage(MULTIPLAYER_CHANNEL_NAME, JSON.stringify(duplicateEnvelope));
    hub.emitRawToAll(MULTIPLAYER_CHANNEL_NAME, duplicateEnvelope);

    expect(receivedSchedules).toEqual([4]);

    // Flood 200 distinct envelopes -> seenMessageIds stays strictly <= MAX_SEEN_MESSAGE_IDS (128)
    for (let i = 0; i < 200; i += 1) {
      hub.emitRawToAll(MULTIPLAYER_CHANNEL_NAME, {
        channelVersion: MULTIPLAYER_CHANNEL_VERSION,
        type: 'PRIVACY_SYNC',
        originInstanceId: 'tab-remote',
        messageId: `msg-flood-${i}`,
        enabled: i % 2 === 0,
      });
    }

    expect(receivedPrivacy).toHaveLength(200);
    expect(bridge.getDiagnostics().seenMessageIdsCount).toBe(MAX_SEEN_MESSAGE_IDS);

    // Recent message #199 is still inside the 128-entry window -> deduplicated
    hub.emitRawToAll(MULTIPLAYER_CHANNEL_NAME, {
      channelVersion: MULTIPLAYER_CHANNEL_VERSION,
      type: 'PRIVACY_SYNC',
      originInstanceId: 'tab-remote',
      messageId: 'msg-flood-199',
      enabled: true,
    });
    expect(receivedPrivacy).toHaveLength(200);

    bridge.close();
    expect(storageBus.listenerCount()).toBe(0);
  });

  it('S15: rejects hostile/corrupted BroadcastChannel and storage payloads without crashing or polluting Object.prototype', () => {
    const hub = createInMemoryBroadcastHub();
    const storageBus = createFakeStorageBus();
    const sharedStorage = createMemoryStorage();
    const store = createLocalFirstStore({ storage: sharedStorage });

    const validCallbacks: string[] = [];
    const bridge = createCrossTabChannelBridge({
      instanceId: 'tab-defender',
      broadcastChannelFactory: hub.factory,
      storageEventTarget: storageBus.target,
      fallbackStore: store,
      onScheduleSync: (payload) => validCallbacks.push(`schedule:${payload.canUndoImport}`),
      onPrivacySync: (enabled) => validCallbacks.push(`privacy:${enabled}`),
    });

    const oversizedBatch = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, index) => ({
      id: index + 1,
      nome: `Participante ${index + 1}`,
      status: 'Presente',
    }));

    const protoPolluted = JSON.parse(
      '{"channelVersion":1,"type":"PRIVACY_SYNC","originInstanceId":"evil","messageId":"m1","enabled":true,"__proto__":{"polluted":true}}'
    ) as unknown;

    const hostileEnvelopes: unknown[] = [
      null,
      undefined,
      'raw-string',
      [],
      protoPolluted,
      {
        channelVersion: 2,
        type: 'PRIVACY_SYNC',
        originInstanceId: 'tab-2',
        messageId: 'm2',
        enabled: true,
      },
      {
        channelVersion: 1,
        type: 'PRIVACY_SYNC',
        originInstanceId: 'tab-2',
        messageId: 'm3',
        enabled: 'yes',
      },
      {
        channelVersion: 1,
        type: 'PRIVACY_SYNC',
        originInstanceId: 'tab-2',
        messageId: 'm4',
        enabled: true,
        unexpectedKey: 1,
      },
      {
        channelVersion: 1,
        type: 'SCHEDULE_SYNC',
        originInstanceId: 'tab-2',
        messageId: 'm5',
        cuidadores: [],
        pendingRemoteSync: false,
        canUndoImport: false,
      },
      {
        channelVersion: 1,
        type: 'SCHEDULE_SYNC',
        originInstanceId: 'tab-2',
        messageId: 'm6',
        cuidadores: oversizedBatch,
        pendingRemoteSync: false,
        canUndoImport: false,
      },
      {
        channelVersion: 1,
        type: 'SCHEDULE_SYNC',
        originInstanceId: 'tab-2',
        messageId: 'm7',
        cuidadores: [{ id: 1, nome: 'Bad\0Null', status: 'Presente' }],
        pendingRemoteSync: false,
        canUndoImport: false,
      },
      {
        channelVersion: 1,
        type: 'SCHEDULE_SYNC',
        originInstanceId: 'tab-2',
        messageId: 'm8',
        cuidadores: [{ id: 1, nome: 'A'.repeat(121), status: 'Presente' }],
        pendingRemoteSync: false,
        canUndoImport: false,
      },
    ];

    for (const hostile of hostileEnvelopes) {
      expect(parseCrossTabMessage(hostile)).toBeNull();
      hub.emitRawToAll(MULTIPLAYER_CHANNEL_NAME, hostile);
    }

    // Hostile StorageEvents across all tracked keys
    storageBus.dispatchStorage(MULTIPLAYER_CHANNEL_NAME, '{bad-json');
    storageBus.dispatchStorage(SCHEDULE_STORAGE_KEY, '{bad-json');
    storageBus.dispatchStorage(UNDO_IMPORT_STORAGE_KEY, '{"schemaVersion":1,"cuidadores":[]}');
    storageBus.dispatchStorage(PRIVACY_MODE_STORAGE_KEY, '{"schemaVersion":1,"enabled":"nope"}');

    expect(validCallbacks).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(bridge.getDiagnostics().ignoredMessagesCount).toBeGreaterThanOrEqual(
      hostileEnvelopes.length + 4
    );

    // Valid StorageEvents for schedule, undo backup (M2.2), and privacy mode still work afterward
    const persisted = store.writeSnapshot(getCanonicalSeed(), true);
    storageBus.dispatchStorage(SCHEDULE_STORAGE_KEY, JSON.stringify(persisted));
    const undoEnv = store.writeUndoBackup(getCanonicalSeed());
    storageBus.dispatchStorage(UNDO_IMPORT_STORAGE_KEY, JSON.stringify(undoEnv));
    store.writePrivacyMode(true);
    storageBus.dispatchStorage(
      PRIVACY_MODE_STORAGE_KEY,
      sharedStorage.getItem(PRIVACY_MODE_STORAGE_KEY)
    );

    expect(validCallbacks).toEqual(['schedule:false', 'schedule:true', 'privacy:true']);

    bridge.close();
  });

  it('S07, S12 & S13: SseStreamClient listens to SCHEDULE_UPDATED, advances lastEventSeq only post-validation, and resets seq across server restarts', () => {
    const sseHub = createControlledSseHub();
    const timerQueue = createDeterministicTimerQueue();
    const receivedUpdates: Array<{ seq: number | null; carlosStatus: string }> = [];

    const client = createSseStreamClient({
      baseUrl: 'http://localhost:8080/',
      eventSourceFactory: sseHub.factory,
      timers: timerQueue.timers,
      random: () => 0,
      onScheduleUpdated: (event) => {
        const carlos = event.cuidadores.find((c) => c.id === 3);
        receivedUpdates.push({
          seq: event.lastEventSeq,
          carlosStatus: carlos?.status ?? 'missing',
        });
      },
    });

    client.connect();
    expect(sseHub.activeSockets()).toHaveLength(1);
    const socket1 = sseHub.sockets[0]!;
    expect(socket1.url).toBe('http://localhost:8080/api/cuidadores/stream');
    socket1.triggerOpen();

    // Generic unnamed message event is ignored (S07)
    socket1.emitNamedEvent('message', JSON.stringify(getCanonicalSeed()), '1');
    expect(receivedUpdates).toHaveLength(0);

    // Valid SCHEDULE_UPDATED id: 5 -> delivered
    const listFaltou = getCanonicalSeed().map((c) =>
      c.id === 3 ? applyStatusChange(c, 'Faltou') : c
    );
    socket1.emitNamedEvent(SSE_SCHEDULE_UPDATED_EVENT, JSON.stringify(listFaltou), '5');
    expect(receivedUpdates).toEqual([{ seq: 5, carlosStatus: 'Faltou' }]);

    // Duplicate id: 5 and regressive id: 4 on same socket -> discarded in O(1) (S12)
    socket1.emitNamedEvent(SSE_SCHEDULE_UPDATED_EVENT, JSON.stringify(getCanonicalSeed()), '5');
    socket1.emitNamedEvent(SSE_SCHEDULE_UPDATED_EVENT, JSON.stringify(getCanonicalSeed()), '4');
    expect(receivedUpdates).toHaveLength(1);

    // S13: Frame id: 10 with malformed JSON or empty array MUST NOT advance sessionLastEventSeq!
    socket1.emitNamedEvent(SSE_SCHEDULE_UPDATED_EVENT, '{truncated', '10');
    socket1.emitNamedEvent(SSE_SCHEDULE_UPDATED_EVENT, '[]', '10');
    expect(client.getDiagnostics().sessionLastEventSeq).toBe(5);

    // Replaying valid id: 10 succeeds because seq stayed at 5!
    const listCobertura = getCanonicalSeed().map((c) =>
      c.id === 3 ? applyStatusChange(c, 'Cobertura', 'Lucas Ferreira') : c
    );
    socket1.emitNamedEvent(SSE_SCHEDULE_UPDATED_EVENT, JSON.stringify(listCobertura), '10');
    expect(receivedUpdates).toHaveLength(2);
    expect(receivedUpdates[1]).toEqual({ seq: 10, carlosStatus: 'Cobertura' });

    // Empty lastEventId ("") with valid JSON is accepted without corrupting sessionLastEventSeq
    socket1.emitNamedEvent(SSE_SCHEDULE_UPDATED_EVENT, JSON.stringify(getCanonicalSeed()), '');
    expect(receivedUpdates).toHaveLength(3);
    expect(client.getDiagnostics().sessionLastEventSeq).toBe(10);

    // S12: Server restarts in memory -> connection drops and new EventSource emits id: 1 (42 -> 1)
    socket1.triggerError();
    expect(socket1.closed).toBe(true);
    expect(timerQueue.flushNext()).toBe(500);

    const socket2 = sseHub.sockets[1]!;
    socket2.triggerOpen();
    expect(client.getDiagnostics().sessionLastEventSeq).toBe(0);

    socket2.emitNamedEvent(SSE_SCHEDULE_UPDATED_EVENT, JSON.stringify(listFaltou), '1');
    expect(receivedUpdates).toHaveLength(4);
    expect(receivedUpdates[3]).toEqual({ seq: 1, carlosStatus: 'Faltou' });

    client.close();
    expect(sseHub.activeSockets()).toHaveLength(0);
    expect(timerQueue.activeCount()).toBe(0);
    expect(socket2.lifecycleOps).toEqual([
      `add:${SSE_SCHEDULE_UPDATED_EVENT}`,
      `remove:${SSE_SCHEDULE_UPDATED_EVENT}`,
      'close',
    ]);
  });

  it('S16 & S17: tracks hadOpenStream accurately, enforces [500ms..30000ms] Equal Jitter backoff, and reconnects in 0ms on reconnectNow()', () => {
    const sseHub = createControlledSseHub();
    const timerQueue = createDeterministicTimerQueue();
    const disconnects: SseDisconnectInfo[] = [];

    // Verify pure Equal Jitter bounds across extreme RNG values
    expect(computeSseBackoffDelayMs(0, 1000, 30_000, () => -10)).toBe(500);
    expect(computeSseBackoffDelayMs(0, 1000, 30_000, () => 1)).toBe(1000);
    expect(computeSseBackoffDelayMs(1, 1000, 30_000, () => 0)).toBe(1000);
    expect(computeSseBackoffDelayMs(5, 1000, 30_000, () => 0)).toBe(15_000);
    expect(computeSseBackoffDelayMs(8, 1000, 30_000, () => 99)).toBe(30_000);
    expect(
      computeSseBackoffDelayMs(
        0,
        DEFAULT_SSE_INITIAL_DELAY_MS,
        DEFAULT_SSE_MAX_DELAY_MS,
        () => Number.NaN
      )
    ).toBe(750);

    const client = createSseStreamClient({
      eventSourceFactory: sseHub.factory,
      timers: timerQueue.timers,
      random: () => 0.5,
      onDisconnect: (info) => disconnects.push(info),
    });

    // Attempt 0 fails BEFORE onopen (e.g., corporate proxy blocking SSE) -> hadOpenStream === false
    client.connect();
    sseHub.sockets[0]!.triggerError();
    expect(disconnects).toHaveLength(1);
    expect(disconnects[0]).toEqual({
      hadOpenStream: false,
      reconnectDelayMs: 750,
      attempt: 0,
    });

    // Attempt 1 fails BEFORE onopen -> hadOpenStream === false, backoff doubles (2000 * 0.75 = 1500ms)
    timerQueue.flushNext();
    sseHub.sockets[1]!.triggerError();
    expect(disconnects[1]).toEqual({
      hadOpenStream: false,
      reconnectDelayMs: 1500,
      attempt: 1,
    });

    // Browser fires 'online' -> reconnectNow() cancels pending 1500ms timer and opens immediately!
    expect(timerQueue.activeCount()).toBe(1);
    client.reconnectNow();
    expect(timerQueue.activeCount()).toBe(0);
    expect(sseHub.activeSockets()).toHaveLength(1);

    // Socket #3 opens, then later drops -> hadOpenStream === true and attempt reset to 0 (750ms)
    const socket3 = sseHub.sockets[2]!;
    socket3.triggerOpen();
    socket3.triggerError();
    expect(disconnects[2]).toEqual({
      hadOpenStream: true,
      reconnectDelayMs: 750,
      attempt: 0,
    });

    // After close(), reconnectNow() is a strict no-op (never resurrects zombie sockets)
    client.close();
    expect(timerQueue.activeCount()).toBe(0);
    client.reconnectNow();
    expect(sseHub.activeSockets()).toHaveLength(0);
  });
});
