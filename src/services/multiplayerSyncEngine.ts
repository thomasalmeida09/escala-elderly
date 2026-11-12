import { type Cuidador, parseCuidadorList } from '../types/caregiver';
import { normalizeApiBaseUrl } from './caregiverApi';
import {
  type LocalFirstStore,
  PRIVACY_MODE_STORAGE_KEY,
  SCHEDULE_SCHEMA_VERSION,
  SCHEDULE_STORAGE_KEY,
  UNDO_IMPORT_STORAGE_KEY,
} from './localFirstStore';

export const MULTIPLAYER_CHANNEL_NAME = 'escala_elderly:multiplayer:v1';
export const MULTIPLAYER_CHANNEL_VERSION = 1 as const;
export const SSE_SCHEDULE_UPDATED_EVENT = 'SCHEDULE_UPDATED';
export const MAX_SEEN_MESSAGE_IDS = 128;
export const MAX_ENVELOPE_ID_LENGTH = 64;
export const DEFAULT_SSE_INITIAL_DELAY_MS = 1000;
export const DEFAULT_SSE_MAX_DELAY_MS = 30_000;

export interface CryptoIdProvider {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

export interface BroadcastMessageEventLike {
  readonly data?: unknown;
}

export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  addEventListener?(type: 'message', listener: (event: BroadcastMessageEventLike) => void): void;
  removeEventListener?(type: 'message', listener: (event: BroadcastMessageEventLike) => void): void;
  onmessage?: ((event: BroadcastMessageEventLike) => void) | null;
}

export type BroadcastChannelFactory = (channelName: string) => BroadcastChannelLike | null;

export interface StorageEventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export interface CrossTabScheduleSyncMessage {
  readonly channelVersion: typeof MULTIPLAYER_CHANNEL_VERSION;
  readonly type: 'SCHEDULE_SYNC';
  readonly originInstanceId: string;
  readonly messageId: string;
  readonly cuidadores: Cuidador[];
  readonly pendingRemoteSync: boolean;
  readonly canUndoImport: boolean;
  readonly undoBackup?: Cuidador[] | null;
}

export interface CrossTabPrivacySyncMessage {
  readonly channelVersion: typeof MULTIPLAYER_CHANNEL_VERSION;
  readonly type: 'PRIVACY_SYNC';
  readonly originInstanceId: string;
  readonly messageId: string;
  readonly enabled: boolean;
}

export type CrossTabMessageV1 = CrossTabScheduleSyncMessage | CrossTabPrivacySyncMessage;

export interface CrossTabSchedulePayload {
  readonly cuidadores: Cuidador[];
  readonly pendingRemoteSync: boolean;
  readonly canUndoImport: boolean;
  readonly undoBackup?: Cuidador[] | null;
  readonly source: 'broadcast-channel' | 'storage';
}

export interface PublishScheduleSyncInput {
  readonly cuidadores: readonly Cuidador[];
  readonly pendingRemoteSync: boolean;
  readonly canUndoImport: boolean;
  readonly undoBackup?: readonly Cuidador[] | null;
}

export interface CrossTabBridgeDiagnostics {
  readonly instanceId: string;
  readonly seenMessageIdsCount: number;
  readonly ignoredMessagesCount: number;
  readonly publishedMessagesCount: number;
}

export interface CrossTabChannelBridgeOptions {
  readonly channelName?: string;
  readonly instanceId?: string;
  readonly crypto?: CryptoIdProvider | null;
  readonly broadcastChannelFactory?: BroadcastChannelFactory | null;
  readonly storageEventTarget?: StorageEventTarget | null;
  readonly scheduleStorageKey?: string;
  readonly undoStorageKey?: string;
  readonly privacyStorageKey?: string;
  readonly fallbackStore?: Pick<
    LocalFirstStore,
    'readInitialState' | 'readUndoBackup' | 'readPrivacyMode'
  > | null;
  readonly onScheduleSync?: (payload: CrossTabSchedulePayload) => void;
  readonly onPrivacySync?: (enabled: boolean) => void;
}

export interface CrossTabChannelBridge {
  readonly instanceId: string;
  publishScheduleSync(input: PublishScheduleSyncInput): boolean;
  publishPrivacySync(enabled: boolean): boolean;
  getDiagnostics(): CrossTabBridgeDiagnostics;
  close(): void;
}

export interface SseMessageEventLike {
  readonly data?: unknown;
  readonly lastEventId?: unknown;
}

export interface EventSourceLike {
  close(): void;
  onopen?: ((event: unknown) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  addEventListener(type: string, listener: (event: SseMessageEventLike) => void): void;
  removeEventListener(type: string, listener: (event: SseMessageEventLike) => void): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike | null;

export interface TimerAdapter {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface SseDisconnectInfo {
  readonly hadOpenStream: boolean;
  readonly reconnectDelayMs: number;
  readonly attempt: number;
}

export interface SseScheduleUpdateEvent {
  readonly cuidadores: Cuidador[];
  readonly lastEventSeq: number | null;
}

export interface SseStreamDiagnostics {
  readonly streamUrl: string;
  readonly isOpen: boolean;
  readonly hasActiveSocket: boolean;
  readonly hasReconnectTimer: boolean;
  readonly sessionLastEventSeq: number;
  readonly openCount: number;
  readonly disconnectCount: number;
  readonly deliveredFramesCount: number;
  readonly ignoredFramesCount: number;
  readonly lastReconnectDelayMs: number | null;
}

export interface SseStreamClientOptions {
  readonly baseUrl?: string;
  readonly privacyRedacted?: boolean;
  readonly eventSourceFactory?: EventSourceFactory | null;
  readonly timers?: TimerAdapter;
  readonly random?: () => number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly onOpen?: () => void;
  readonly onDisconnect?: (info: SseDisconnectInfo) => void;
  readonly onScheduleUpdated?: (event: SseScheduleUpdateEvent) => void;
}

export interface SseStreamClient {
  readonly streamUrl: string;
  connect(): void;
  reconnectNow(): void;
  getDiagnostics(): SseStreamDiagnostics;
  close(): void;
}

let monotonicFallbackCounter = 0;

const SCHEDULE_SYNC_ALLOWED_KEYS: ReadonlySet<string> = new Set<string>([
  'channelVersion',
  'type',
  'originInstanceId',
  'messageId',
  'cuidadores',
  'pendingRemoteSync',
  'canUndoImport',
  'undoBackup',
]);

const PRIVACY_SYNC_ALLOWED_KEYS: ReadonlySet<string> = new Set<string>([
  'channelVersion',
  'type',
  'originInstanceId',
  'messageId',
  'enabled',
]);

const defaultTimerAdapter: TimerAdapter = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

function isStrictPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  return !Object.prototype.hasOwnProperty.call(value, '__proto__');
}

function isValidEnvelopeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_ENVELOPE_ID_LENGTH &&
    /^[\x21-\x7E]+$/.test(value)
  );
}

function normalizeIdPrefix(rawPrefix: string): string {
  const sanitized = rawPrefix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
  return sanitized.length > 0 ? sanitized : 'id';
}

function resolveDefaultCryptoProvider(): CryptoIdProvider | null {
  if (typeof globalThis !== 'undefined' && 'crypto' in globalThis) {
    const candidate = globalThis.crypto as CryptoIdProvider | undefined;
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }
  return null;
}

/**
 * Generates collision-resistant ASCII identifiers (`<= 64` chars) across HTTPS,
 * localhost, and non-secure clinic LAN HTTP contexts (`http://192.168.x.x:5173`)
 * where WebIDL `[SecureContext]` leaves `crypto.randomUUID` undefined.
 */
export function createUniqueId(prefix = 'id', cryptoOverride?: CryptoIdProvider | null): string {
  const safePrefix = normalizeIdPrefix(prefix);
  const cryptoSource =
    cryptoOverride !== undefined ? cryptoOverride : resolveDefaultCryptoProvider();

  if (cryptoSource !== null && typeof cryptoSource.randomUUID === 'function') {
    try {
      const uuid = cryptoSource.randomUUID();
      if (typeof uuid === 'string' && /^[\x21-\x7E]{8,44}$/.test(uuid)) {
        return `${safePrefix}-${uuid}`;
      }
    } catch (randomUuidError) {
      void randomUuidError;
    }
  }

  if (cryptoSource !== null && typeof cryptoSource.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      cryptoSource.getRandomValues(bytes);
      let hex = '';
      for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i]!.toString(16).padStart(2, '0');
      }
      return `${safePrefix}-${hex}`;
    } catch (randomBytesError) {
      void randomBytesError;
    }
  }

  monotonicFallbackCounter = (monotonicFallbackCounter + 1) % 2_147_483_647;
  const timestampToken = Date.now().toString(36);
  const sequenceToken = monotonicFallbackCounter.toString(36);
  return `${safePrefix}-${timestampToken}-${sequenceToken}`;
}

/**
 * Builds the canonical W3C SSE URL without duplicate slashes or HTTP Parameter
 * Pollution (`?privacy=a&privacy=b` rejected with HTTP 400 by Spring Boot).
 */
export function buildCaregiverStreamUrl(baseUrl?: string, privacyRedacted = false): string {
  const withoutQueryOrFragment = (baseUrl ?? '').split(/[?#]/, 1)[0];
  const normalizedBase = normalizeApiBaseUrl(withoutQueryOrFragment);
  return privacyRedacted
    ? `${normalizedBase}/api/cuidadores/stream?privacy=true`
    : `${normalizedBase}/api/cuidadores/stream`;
}

/**
 * Computes Equal Jitter exponential backoff (`[0.5 * base, 1.0 * base]`) bounded
 * to `[500ms..30_000ms]` by default so clients never enter a `0ms` spin loop or
 * cause a reconnect thundering herd.
 */
export function computeSseBackoffDelayMs(
  attempt: number,
  initialDelayMs = DEFAULT_SSE_INITIAL_DELAY_MS,
  maxDelayMs = DEFAULT_SSE_MAX_DELAY_MS,
  random: () => number = Math.random
): number {
  const safeInitial = Math.max(100, Math.trunc(initialDelayMs));
  const safeMax = Math.max(safeInitial, Math.trunc(maxDelayMs));
  const safeAttempt = Math.max(0, Math.min(10, Math.trunc(attempt)));
  const base = Math.min(safeMax, safeInitial * 2 ** safeAttempt);
  const rawRandom = random();
  const clampedRandom = Number.isFinite(rawRandom) ? Math.min(1, Math.max(0, rawRandom)) : 0.5;
  return Math.round(base * (0.5 + 0.5 * clampedRandom));
}

function hasOnlyAllowedKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>
): boolean {
  const keys = Object.keys(record);
  for (let i = 0; i < keys.length; i += 1) {
    if (!allowedKeys.has(keys[i]!)) {
      return false;
    }
  }
  return true;
}

export function parseCrossTabMessage(raw: unknown): CrossTabMessageV1 | null {
  if (!isStrictPlainObject(raw)) {
    return null;
  }
  if (
    raw.channelVersion !== MULTIPLAYER_CHANNEL_VERSION ||
    !isValidEnvelopeId(raw.originInstanceId) ||
    !isValidEnvelopeId(raw.messageId)
  ) {
    return null;
  }

  if (raw.type === 'SCHEDULE_SYNC') {
    if (
      !hasOnlyAllowedKeys(raw, SCHEDULE_SYNC_ALLOWED_KEYS) ||
      typeof raw.pendingRemoteSync !== 'boolean' ||
      typeof raw.canUndoImport !== 'boolean'
    ) {
      return null;
    }

    try {
      const cuidadores = parseCuidadorList(raw.cuidadores, 'multiplayer.cuidadores');
      let undoBackup: Cuidador[] | null | undefined;
      if (raw.undoBackup === null) {
        undoBackup = null;
      } else if (raw.undoBackup !== undefined) {
        undoBackup = parseCuidadorList(raw.undoBackup, 'multiplayer.undoBackup');
      }

      return Object.freeze({
        channelVersion: MULTIPLAYER_CHANNEL_VERSION,
        type: 'SCHEDULE_SYNC',
        originInstanceId: raw.originInstanceId,
        messageId: raw.messageId,
        cuidadores,
        pendingRemoteSync: raw.pendingRemoteSync,
        canUndoImport: raw.canUndoImport,
        ...(undoBackup !== undefined ? { undoBackup } : {}),
      });
    } catch (validationError) {
      void validationError;
      return null;
    }
  }

  if (raw.type === 'PRIVACY_SYNC') {
    if (!hasOnlyAllowedKeys(raw, PRIVACY_SYNC_ALLOWED_KEYS) || typeof raw.enabled !== 'boolean') {
      return null;
    }
    return Object.freeze({
      channelVersion: MULTIPLAYER_CHANNEL_VERSION,
      type: 'PRIVACY_SYNC',
      originInstanceId: raw.originInstanceId,
      messageId: raw.messageId,
      enabled: raw.enabled,
    });
  }

  return null;
}

export function createCrossTabChannelBridge(
  options: CrossTabChannelBridgeOptions = {}
): CrossTabChannelBridge {
  const channelName =
    typeof options.channelName === 'string' && options.channelName.trim().length > 0
      ? options.channelName.trim()
      : MULTIPLAYER_CHANNEL_NAME;

  const instanceId = isValidEnvelopeId(options.instanceId)
    ? options.instanceId
    : createUniqueId('tab', options.crypto);

  const scheduleStorageKey = options.scheduleStorageKey ?? SCHEDULE_STORAGE_KEY;
  const undoStorageKey = options.undoStorageKey ?? UNDO_IMPORT_STORAGE_KEY;
  const privacyStorageKey = options.privacyStorageKey ?? PRIVACY_MODE_STORAGE_KEY;

  const seenMessageIds = new Set<string>();
  let ignoredMessagesCount = 0;
  let publishedMessagesCount = 0;
  let closed = false;

  function rememberMessageId(messageId: string): boolean {
    if (seenMessageIds.has(messageId)) {
      seenMessageIds.delete(messageId);
      seenMessageIds.add(messageId);
      return false;
    }
    if (seenMessageIds.size >= MAX_SEEN_MESSAGE_IDS) {
      const oldest = seenMessageIds.values().next().value;
      if (oldest !== undefined) {
        seenMessageIds.delete(oldest);
      }
    }
    seenMessageIds.add(messageId);
    return true;
  }

  function dispatchValidatedEnvelope(
    envelope: CrossTabMessageV1,
    source: 'broadcast-channel' | 'storage'
  ): void {
    if (closed) {
      return;
    }
    if (envelope.originInstanceId === instanceId) {
      ignoredMessagesCount += 1;
      return;
    }
    if (!rememberMessageId(envelope.messageId)) {
      ignoredMessagesCount += 1;
      return;
    }

    if (envelope.type === 'SCHEDULE_SYNC') {
      options.onScheduleSync?.({
        cuidadores: envelope.cuidadores,
        pendingRemoteSync: envelope.pendingRemoteSync,
        canUndoImport: envelope.canUndoImport,
        ...(envelope.undoBackup !== undefined ? { undoBackup: envelope.undoBackup } : {}),
        source,
      });
      return;
    }

    options.onPrivacySync?.(envelope.enabled);
  }

  const handleBroadcastMessage = (event: BroadcastMessageEventLike): void => {
    if (closed) {
      return;
    }
    const parsed = parseCrossTabMessage(event?.data);
    if (parsed === null) {
      ignoredMessagesCount += 1;
      return;
    }
    dispatchValidatedEnvelope(parsed, 'broadcast-channel');
  };

  let activeChannel: BroadcastChannelLike | null = null;
  let usesChannelEventListener = false;

  if (typeof options.broadcastChannelFactory === 'function') {
    try {
      activeChannel = options.broadcastChannelFactory(channelName);
    } catch (channelFactoryError) {
      ignoredMessagesCount += 1;
      void channelFactoryError;
      activeChannel = null;
    }
  }

  if (activeChannel !== null) {
    if (
      typeof activeChannel.addEventListener === 'function' &&
      typeof activeChannel.removeEventListener === 'function'
    ) {
      activeChannel.addEventListener('message', handleBroadcastMessage);
      usesChannelEventListener = true;
    } else {
      activeChannel.onmessage = handleBroadcastMessage;
    }
  }

  const handleStorageEvent: EventListener = (rawEvent: Event): void => {
    if (closed) {
      return;
    }
    const candidate = rawEvent as unknown as {
      readonly key?: unknown;
      readonly newValue?: unknown;
    };
    const key =
      typeof candidate.key === 'string' || candidate.key === null ? candidate.key : undefined;
    if (key === undefined) {
      ignoredMessagesCount += 1;
      return;
    }
    const newValue =
      typeof candidate.newValue === 'string' || candidate.newValue === null
        ? candidate.newValue
        : undefined;

    // 1. Serialized CrossTabMessageV1 envelope delivered over storage bus
    if (key === channelName) {
      if (typeof newValue !== 'string' || newValue.trim().length === 0) {
        return;
      }
      try {
        const decoded: unknown = JSON.parse(newValue);
        const parsed = parseCrossTabMessage(decoded);
        if (parsed === null) {
          ignoredMessagesCount += 1;
          return;
        }
        dispatchValidatedEnvelope(parsed, 'storage');
      } catch (storageJsonError) {
        ignoredMessagesCount += 1;
        void storageJsonError;
      }
      return;
    }

    // 2. Direct schedule snapshot key mutation in shared localStorage
    if (key === scheduleStorageKey) {
      if (typeof newValue === 'string') {
        try {
          const decoded: unknown = JSON.parse(newValue);
          if (
            !isStrictPlainObject(decoded) ||
            decoded.schemaVersion !== SCHEDULE_SCHEMA_VERSION ||
            typeof decoded.pendingRemoteSync !== 'boolean'
          ) {
            ignoredMessagesCount += 1;
            return;
          }
          const cuidadores = parseCuidadorList(decoded.cuidadores, 'storageEvent.cuidadores');
          const undoEnvelope = options.fallbackStore?.readUndoBackup() ?? null;
          options.onScheduleSync?.({
            cuidadores,
            pendingRemoteSync: decoded.pendingRemoteSync,
            canUndoImport: undoEnvelope !== null,
            undoBackup: undoEnvelope ? undoEnvelope.cuidadores : null,
            source: 'storage',
          });
        } catch (invalidScheduleStorageError) {
          ignoredMessagesCount += 1;
          void invalidScheduleStorageError;
        }
        return;
      }

      if (newValue === null && options.fallbackStore) {
        const hydrated = options.fallbackStore.readInitialState();
        const undoEnvelope = options.fallbackStore.readUndoBackup();
        options.onScheduleSync?.({
          cuidadores: hydrated.cuidadores,
          pendingRemoteSync: hydrated.pendingRemoteSync,
          canUndoImport: undoEnvelope !== null,
          undoBackup: undoEnvelope ? undoEnvelope.cuidadores : null,
          source: 'storage',
        });
      }
      return;
    }

    // 3. Direct undo backup key mutation in shared localStorage (M2.2)
    if (key === undoStorageKey) {
      if (typeof newValue === 'string') {
        try {
          const decoded: unknown = JSON.parse(newValue);
          if (!isStrictPlainObject(decoded) || decoded.schemaVersion !== SCHEDULE_SCHEMA_VERSION) {
            ignoredMessagesCount += 1;
            return;
          }
          const parsedUndo = parseCuidadorList(decoded.cuidadores, 'storageEvent.undo');
          if (options.fallbackStore) {
            const hydrated = options.fallbackStore.readInitialState();
            options.onScheduleSync?.({
              cuidadores: hydrated.cuidadores,
              pendingRemoteSync: hydrated.pendingRemoteSync,
              canUndoImport: true,
              undoBackup: parsedUndo,
              source: 'storage',
            });
          }
        } catch (invalidUndoStorageError) {
          ignoredMessagesCount += 1;
          void invalidUndoStorageError;
        }
        return;
      }

      if (newValue === null && options.fallbackStore) {
        const hydrated = options.fallbackStore.readInitialState();
        options.onScheduleSync?.({
          cuidadores: hydrated.cuidadores,
          pendingRemoteSync: hydrated.pendingRemoteSync,
          canUndoImport: false,
          undoBackup: null,
          source: 'storage',
        });
      }
      return;
    }

    // 4. Direct LGPD privacy mode key mutation in shared localStorage
    if (key === privacyStorageKey) {
      if (typeof newValue === 'string') {
        try {
          const decoded: unknown = JSON.parse(newValue);
          if (
            !isStrictPlainObject(decoded) ||
            decoded.schemaVersion !== SCHEDULE_SCHEMA_VERSION ||
            typeof decoded.enabled !== 'boolean'
          ) {
            ignoredMessagesCount += 1;
            return;
          }
          options.onPrivacySync?.(decoded.enabled);
        } catch (invalidPrivacyStorageError) {
          ignoredMessagesCount += 1;
          void invalidPrivacyStorageError;
        }
        return;
      }

      if (newValue === null) {
        const currentPrivacy = options.fallbackStore?.readPrivacyMode() ?? false;
        options.onPrivacySync?.(currentPrivacy);
      }
      return;
    }

    // 5. Storage.clear() (key === null)
    if (key === null && options.fallbackStore) {
      const hydrated = options.fallbackStore.readInitialState();
      const undoEnvelope = options.fallbackStore.readUndoBackup();
      options.onScheduleSync?.({
        cuidadores: hydrated.cuidadores,
        pendingRemoteSync: hydrated.pendingRemoteSync,
        canUndoImport: undoEnvelope !== null,
        undoBackup: undoEnvelope ? undoEnvelope.cuidadores : null,
        source: 'storage',
      });
      options.onPrivacySync?.(options.fallbackStore.readPrivacyMode());
    }
  };

  const storageTarget = options.storageEventTarget ?? null;
  if (storageTarget !== null) {
    storageTarget.addEventListener('storage', handleStorageEvent);
  }

  function publishEnvelope(envelope: CrossTabMessageV1): boolean {
    if (closed || activeChannel === null) {
      return false;
    }
    rememberMessageId(envelope.messageId);
    try {
      activeChannel.postMessage(envelope);
      publishedMessagesCount += 1;
      return true;
    } catch (postMessageError) {
      ignoredMessagesCount += 1;
      void postMessageError;
      return false;
    }
  }

  function publishScheduleSync(input: PublishScheduleSyncInput): boolean {
    if (closed || activeChannel === null) {
      return false;
    }
    try {
      const validatedCuidadores = parseCuidadorList(input.cuidadores, 'publish.cuidadores');
      let validatedUndo: Cuidador[] | null | undefined;
      if (input.undoBackup === null) {
        validatedUndo = null;
      } else if (input.undoBackup !== undefined) {
        validatedUndo = parseCuidadorList(input.undoBackup, 'publish.undoBackup');
      }

      const messageId = createUniqueId('msg', options.crypto);
      const envelope: CrossTabScheduleSyncMessage = Object.freeze({
        channelVersion: MULTIPLAYER_CHANNEL_VERSION,
        type: 'SCHEDULE_SYNC',
        originInstanceId: instanceId,
        messageId,
        cuidadores: validatedCuidadores,
        pendingRemoteSync: Boolean(input.pendingRemoteSync),
        canUndoImport: Boolean(input.canUndoImport),
        ...(validatedUndo !== undefined ? { undoBackup: validatedUndo } : {}),
      });
      return publishEnvelope(envelope);
    } catch (invalidPublishInputError) {
      ignoredMessagesCount += 1;
      void invalidPublishInputError;
      return false;
    }
  }

  function publishPrivacySync(enabled: boolean): boolean {
    if (closed || activeChannel === null) {
      return false;
    }
    const messageId = createUniqueId('priv', options.crypto);
    const envelope: CrossTabPrivacySyncMessage = Object.freeze({
      channelVersion: MULTIPLAYER_CHANNEL_VERSION,
      type: 'PRIVACY_SYNC',
      originInstanceId: instanceId,
      messageId,
      enabled: Boolean(enabled),
    });
    return publishEnvelope(envelope);
  }

  function getDiagnostics(): CrossTabBridgeDiagnostics {
    return Object.freeze({
      instanceId,
      seenMessageIdsCount: seenMessageIds.size,
      ignoredMessagesCount,
      publishedMessagesCount,
    });
  }

  function close(): void {
    if (closed) {
      return;
    }
    closed = true;

    // LIFO teardown: storage listener removed first, then BroadcastChannel listener & handle
    if (storageTarget !== null) {
      storageTarget.removeEventListener('storage', handleStorageEvent);
    }

    if (activeChannel !== null) {
      const channelToClose = activeChannel;
      activeChannel = null;
      if (usesChannelEventListener && typeof channelToClose.removeEventListener === 'function') {
        channelToClose.removeEventListener('message', handleBroadcastMessage);
      } else if ('onmessage' in channelToClose) {
        channelToClose.onmessage = null;
      }
      try {
        channelToClose.close();
      } catch (closeError) {
        ignoredMessagesCount += 1;
        void closeError;
      }
    }
  }

  return {
    instanceId,
    publishScheduleSync,
    publishPrivacySync,
    getDiagnostics,
    close,
  };
}

export function createSseStreamClient(options: SseStreamClientOptions = {}): SseStreamClient {
  const streamUrl = buildCaregiverStreamUrl(options.baseUrl, options.privacyRedacted ?? false);
  const timers = options.timers ?? defaultTimerAdapter;
  const random = options.random ?? Math.random;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_SSE_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_SSE_MAX_DELAY_MS;

  let activeSource: EventSourceLike | null = null;
  let activeScheduleListener: ((event: SseMessageEventLike) => void) | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = true;
  let attempt = 0;
  let sessionLastEventSeq = 0;
  let openedInCurrentAttempt = false;

  let openCount = 0;
  let disconnectCount = 0;
  let deliveredFramesCount = 0;
  let ignoredFramesCount = 0;
  let lastReconnectDelayMs: number | null = null;

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      timers.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function teardownActiveSource(): void {
    if (activeSource === null) {
      return;
    }
    const sourceToClose = activeSource;
    const listenerToRemove = activeScheduleListener;
    activeSource = null;
    activeScheduleListener = null;

    // LIFO cleanup on socket listeners before closing handle
    if (listenerToRemove !== null) {
      sourceToClose.removeEventListener(SSE_SCHEDULE_UPDATED_EVENT, listenerToRemove);
    }
    sourceToClose.onerror = null;
    sourceToClose.onopen = null;
    try {
      sourceToClose.close();
    } catch (closeError) {
      ignoredFramesCount += 1;
      void closeError;
    }
  }

  function scheduleReconnectAfterFailure(hadOpenStream: boolean): void {
    if (closed) {
      return;
    }
    clearReconnectTimer();
    const currentAttempt = attempt;
    const delayMs = computeSseBackoffDelayMs(currentAttempt, initialDelayMs, maxDelayMs, random);
    attempt = Math.min(currentAttempt + 1, 10);
    disconnectCount += 1;
    lastReconnectDelayMs = delayMs;

    options.onDisconnect?.({
      hadOpenStream,
      reconnectDelayMs: delayMs,
      attempt: currentAttempt,
    });

    if (closed) {
      return;
    }

    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      if (!closed) {
        openStreamAttempt();
      }
    }, delayMs);
  }

  function openStreamAttempt(): void {
    if (closed || activeSource !== null) {
      return;
    }
    clearReconnectTimer();
    sessionLastEventSeq = 0;
    openedInCurrentAttempt = false;

    const factory = options.eventSourceFactory ?? null;
    if (typeof factory !== 'function') {
      return;
    }

    let createdSource: EventSourceLike | null;
    try {
      createdSource = factory(streamUrl);
    } catch (factoryError) {
      ignoredFramesCount += 1;
      void factoryError;
      scheduleReconnectAfterFailure(false);
      return;
    }

    if (createdSource === null) {
      return;
    }

    const currentSource = createdSource;
    activeSource = currentSource;

    const handleScheduleUpdated = (event: SseMessageEventLike): void => {
      if (closed || activeSource !== currentSource) {
        return;
      }

      let parsedSeq: number | null = null;
      if (typeof event.lastEventId === 'string') {
        const trimmedId = event.lastEventId.trim();
        if (trimmedId.length > 0) {
          if (!/^[1-9]\d*$/.test(trimmedId)) {
            ignoredFramesCount += 1;
            return;
          }
          const numericId = Number(trimmedId);
          if (!Number.isSafeInteger(numericId) || numericId < 1) {
            ignoredFramesCount += 1;
            return;
          }
          if (numericId <= sessionLastEventSeq) {
            ignoredFramesCount += 1;
            return;
          }
          parsedSeq = numericId;
        }
      }

      if (typeof event.data !== 'string' || event.data.trim().length === 0) {
        ignoredFramesCount += 1;
        return;
      }

      let validatedList: Cuidador[];
      try {
        const decoded: unknown = JSON.parse(event.data);
        validatedList = parseCuidadorList(decoded, 'sse.cuidadores');
      } catch (invalidFrameError) {
        // M3.2 / S13: Never advance sessionLastEventSeq when JSON or contract validation fails
        ignoredFramesCount += 1;
        void invalidFrameError;
        return;
      }

      if (parsedSeq !== null) {
        sessionLastEventSeq = parsedSeq;
      }
      if (!openedInCurrentAttempt) {
        openedInCurrentAttempt = true;
        attempt = 0;
      }

      deliveredFramesCount += 1;
      options.onScheduleUpdated?.({
        cuidadores: validatedList,
        lastEventSeq: parsedSeq,
      });
    };

    currentSource.onopen = () => {
      if (closed || activeSource !== currentSource) {
        return;
      }
      openedInCurrentAttempt = true;
      attempt = 0;
      openCount += 1;
      options.onOpen?.();
    };

    currentSource.onerror = () => {
      if (closed || activeSource !== currentSource) {
        return;
      }
      const hadOpenStream = openedInCurrentAttempt;
      openedInCurrentAttempt = false;
      teardownActiveSource();
      scheduleReconnectAfterFailure(hadOpenStream);
    };

    activeScheduleListener = handleScheduleUpdated;
    currentSource.addEventListener(SSE_SCHEDULE_UPDATED_EVENT, handleScheduleUpdated);
  }

  function connect(): void {
    if (!closed && (activeSource !== null || reconnectTimer !== null)) {
      return;
    }
    closed = false;
    attempt = 0;
    openStreamAttempt();
  }

  function reconnectNow(): void {
    if (closed) {
      return;
    }
    clearReconnectTimer();
    teardownActiveSource();
    openedInCurrentAttempt = false;
    attempt = 0;
    openStreamAttempt();
  }

  function getDiagnostics(): SseStreamDiagnostics {
    return Object.freeze({
      streamUrl,
      isOpen: !closed && activeSource !== null && openedInCurrentAttempt,
      hasActiveSocket: activeSource !== null,
      hasReconnectTimer: reconnectTimer !== null,
      sessionLastEventSeq,
      openCount,
      disconnectCount,
      deliveredFramesCount,
      ignoredFramesCount,
      lastReconnectDelayMs,
    });
  }

  function close(): void {
    if (closed) {
      return;
    }
    closed = true;
    openedInCurrentAttempt = false;
    clearReconnectTimer();
    teardownActiveSource();
  }

  return {
    streamUrl,
    connect,
    reconnectNow,
    getDiagnostics,
    close,
  };
}
