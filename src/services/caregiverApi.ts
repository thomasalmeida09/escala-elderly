import {
  ContractValidationError,
  type Cuidador,
  type StatusCuidador,
  parseCuidador,
  parseCuidadorList,
  toBatchPayload,
  toStatusUpdatePayload,
} from '../types/caregiver';

export const DEFAULT_API_BASE_URL = 'http://localhost:8080';
export const DEFAULT_REQUEST_TIMEOUT_MS = 2500;

export type CaregiverApiErrorKind = 'timeout' | 'aborted' | 'network' | 'http' | 'contract';

export class CaregiverApiError extends Error {
  readonly kind: CaregiverApiErrorKind;
  readonly status?: number;
  readonly errorCode?: string;

  constructor(message: string, kind: CaregiverApiErrorKind, status?: number, errorCode?: string) {
    super(message);
    this.name = 'CaregiverApiError';
    this.kind = kind;
    this.status = status;
    this.errorCode = errorCode;
    Object.setPrototypeOf(this, CaregiverApiError.prototype);
  }
}

export interface CaregiverApiClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface CaregiverApiClient {
  readonly baseUrl: string;
  fetchCaregivers(signal?: AbortSignal): Promise<Cuidador[]>;
  patchCaregiverStatus(
    id: number,
    status: StatusCuidador,
    substituto?: string,
    signal?: AbortSignal
  ): Promise<Cuidador>;
  syncCaregiversBatch(cuidadores: readonly Cuidador[], signal?: AbortSignal): Promise<Cuidador[]>;
  resetCaregiversSchedule(signal?: AbortSignal): Promise<Cuidador[]>;
}

export function normalizeApiBaseUrl(raw?: string): string {
  const cleaned = (raw ?? '').trim().replace(/\/+$/, '');
  return cleaned.length > 0 ? cleaned : DEFAULT_API_BASE_URL;
}

function readConfiguredBaseUrl(): string {
  const envBaseUrl = import.meta.env?.VITE_API_BASE_URL;
  return normalizeApiBaseUrl(typeof envBaseUrl === 'string' ? envBaseUrl : undefined);
}

interface BackendErrorBody {
  readonly code?: unknown;
  readonly message?: unknown;
}

async function parseHttpError(response: Response): Promise<CaregiverApiError> {
  let serverMessage = `Erro HTTP ${response.status} ao comunicar com a API de cuidadores.`;
  let serverCode: string | undefined;

  try {
    const rawText = await response.text();
    if (rawText.trim().length > 0) {
      const parsed = JSON.parse(rawText) as BackendErrorBody;
      if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
        serverMessage = parsed.message.trim();
      }
      if (typeof parsed.code === 'string' && parsed.code.trim().length > 0) {
        serverCode = parsed.code.trim();
      }
    }
  } catch (parseError) {
    void parseError;
  }

  return new CaregiverApiError(serverMessage, 'http', response.status, serverCode);
}

export function isAbortedApiError(error: unknown): boolean {
  return error instanceof CaregiverApiError && error.kind === 'aborted';
}

export function createCaregiverApiClient(
  options: CaregiverApiClientOptions = {}
): CaregiverApiClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl ?? readConfiguredBaseUrl());
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const resolveFetch = (): typeof fetch => options.fetchImpl ?? globalThis.fetch;

  async function requestJson(
    path: string,
    init: RequestInit,
    callerSignal?: AbortSignal
  ): Promise<unknown> {
    if (callerSignal?.aborted) {
      throw new CaregiverApiError('Requisicao cancelada por operacao mais recente.', 'aborted');
    }

    const fetchFn = resolveFetch();
    if (typeof fetchFn !== 'function') {
      throw new CaregiverApiError('Fetch API indisponivel neste ambiente.', 'network');
    }

    const internalController = new AbortController();
    let didTimeout = false;

    const forwardAbort = () => {
      internalController.abort();
    };

    callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      internalController.abort();
    }, timeoutMs);

    try {
      const response = await fetchFn(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
        signal: internalController.signal,
      });

      if (!response.ok) {
        throw await parseHttpError(response);
      }

      const rawText = await response.text();
      try {
        return JSON.parse(rawText) as unknown;
      } catch (invalidJsonError) {
        void invalidJsonError;
        throw new CaregiverApiError(
          'Resposta da API nao contem JSON valido.',
          'contract',
          response.status
        );
      }
    } catch (error) {
      if (error instanceof CaregiverApiError) {
        throw error;
      }
      if (error instanceof ContractValidationError) {
        throw new CaregiverApiError(error.message, 'contract');
      }
      if (didTimeout) {
        throw new CaregiverApiError(
          `Tempo limite de ${timeoutMs}ms excedido ao contatar API.`,
          'timeout'
        );
      }
      if (callerSignal?.aborted) {
        throw new CaregiverApiError('Requisicao cancelada por operacao mais recente.', 'aborted');
      }
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Falha de rede ao contatar API.';
      throw new CaregiverApiError(message, 'network');
    } finally {
      // LIFO cleanup: timer released first, then caller AbortSignal listener
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', forwardAbort);
    }
  }

  async function fetchCaregivers(signal?: AbortSignal): Promise<Cuidador[]> {
    const body = await requestJson('/api/cuidadores', { method: 'GET' }, signal);
    try {
      return parseCuidadorList(body, 'api.cuidadores');
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'Contrato invalido em GET /api/cuidadores.';
      throw new CaregiverApiError(message, 'contract');
    }
  }

  async function patchCaregiverStatus(
    id: number,
    status: StatusCuidador,
    substituto?: string,
    signal?: AbortSignal
  ): Promise<Cuidador> {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new CaregiverApiError(`ID de cuidador invalido para PATCH: ${id}.`, 'contract');
    }
    const payload = toStatusUpdatePayload(status, substituto);
    const body = await requestJson(
      `/api/cuidadores/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      signal
    );
    try {
      return parseCuidador(body, 'api.cuidador');
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'Contrato invalido em PATCH /api/cuidadores/{id}/status.';
      throw new CaregiverApiError(message, 'contract');
    }
  }

  async function syncCaregiversBatch(
    cuidadores: readonly Cuidador[],
    signal?: AbortSignal
  ): Promise<Cuidador[]> {
    const batchPayload = toBatchPayload(cuidadores);
    const body = await requestJson(
      '/api/cuidadores/batch',
      {
        method: 'POST',
        body: JSON.stringify(batchPayload),
      },
      signal
    );
    try {
      return parseCuidadorList(body, 'api.batch');
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'Contrato invalido em POST /api/cuidadores/batch.';
      throw new CaregiverApiError(message, 'contract');
    }
  }

  async function resetCaregiversSchedule(signal?: AbortSignal): Promise<Cuidador[]> {
    const body = await requestJson('/api/cuidadores/reset', { method: 'POST' }, signal);
    try {
      return parseCuidadorList(body, 'api.reset');
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'Contrato invalido em POST /api/cuidadores/reset.';
      throw new CaregiverApiError(message, 'contract');
    }
  }

  return {
    baseUrl,
    fetchCaregivers,
    patchCaregiverStatus,
    syncCaregiversBatch,
    resetCaregiversSchedule,
  };
}

export const defaultCaregiverApiClient: CaregiverApiClient = createCaregiverApiClient();
