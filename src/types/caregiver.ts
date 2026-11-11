export const ALLOWED_STATUSES = ['Presente', 'Faltou', 'Folga', 'Cobertura'] as const;

export type StatusCuidador = (typeof ALLOWED_STATUSES)[number];

export type ConnectionStatus = 'checking' | 'online' | 'local-first';

export const MAX_SAFE_JS_ID = 9_007_199_254_740_991;
export const MAX_BATCH_SIZE = 500;
export const MAX_TEXT_LENGTH = 120;
export const MAX_PHONE_LENGTH = 32;
export const MAX_REST_HOURS = 720;

export interface Cuidador {
  readonly id: number;
  readonly nome: string;
  readonly status: StatusCuidador;
  readonly turno?: string;
  readonly quarto?: string;
  readonly telefone?: string;
  readonly horasDescanso?: number;
  readonly substituto?: string;
}

export interface StatusUpdatePayload {
  readonly status: StatusCuidador;
  readonly substituto?: string;
}

export class ContractValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ContractValidationError';
    this.field = field;
    Object.setPrototypeOf(this, ContractValidationError.prototype);
  }
}

const ALLOWED_STATUS_SET: ReadonlySet<string> = new Set<string>(ALLOWED_STATUSES);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectNullCharacter(value: string, field: string): void {
  if (value.includes('\0')) {
    throw new ContractValidationError(
      field,
      `Campo '${field}' contem caractere de controle nulo proibido.`
    );
  }
}

function parsePositiveId(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_SAFE_JS_ID
  ) {
    throw new ContractValidationError(
      field,
      `Campo '${field}' deve ser um inteiro seguro entre 1 e ${MAX_SAFE_JS_ID}.`
    );
  }
  return value;
}

function parseRequiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ContractValidationError(field, `Campo obrigatorio '${field}' deve ser texto valido.`);
  }
  rejectNullCharacter(value, field);
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new ContractValidationError(
      field,
      `Campo '${field}' deve conter entre 1 e ${maxLength} caracteres validos.`
    );
  }
  return trimmed;
}

function parseOptionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ContractValidationError(field, `Campo opcional '${field}' deve ser texto.`);
  }
  rejectNullCharacter(value, field);
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ContractValidationError(
      field,
      `Campo opcional '${field}' excede o limite de ${maxLength} caracteres.`
    );
  }
  return trimmed;
}

function parseOptionalRestHours(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_REST_HOURS
  ) {
    throw new ContractValidationError(
      field,
      `Campo '${field}' deve ser um inteiro entre 0 e ${MAX_REST_HOURS} horas.`
    );
  }
  return value;
}

export function isValidStatusCuidador(value: unknown): value is StatusCuidador {
  return typeof value === 'string' && ALLOWED_STATUS_SET.has(value);
}

export function parseStatusCuidador(value: unknown, field = 'status'): StatusCuidador {
  if (typeof value !== 'string') {
    throw new ContractValidationError(
      field,
      `Campo '${field}' e obrigatorio e deve ser um dentre: ${ALLOWED_STATUSES.join(', ')}.`
    );
  }
  rejectNullCharacter(value, field);
  const trimmed = value.trim();
  if (!isValidStatusCuidador(trimmed)) {
    throw new ContractValidationError(
      field,
      `Status invalido em '${field}'. Valores permitidos: ${ALLOWED_STATUSES.join(', ')}.`
    );
  }
  return trimmed;
}

export function parseCuidador(raw: unknown, pathPrefix = 'cuidador'): Cuidador {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(pathPrefix, `Objeto '${pathPrefix}' invalido.`);
  }

  const id = parsePositiveId(raw.id, `${pathPrefix}.id`);
  const nome = parseRequiredText(raw.nome, `${pathPrefix}.nome`, MAX_TEXT_LENGTH);
  const status = parseStatusCuidador(raw.status, `${pathPrefix}.status`);
  const turno = parseOptionalText(raw.turno, `${pathPrefix}.turno`, MAX_TEXT_LENGTH);
  const quarto = parseOptionalText(raw.quarto, `${pathPrefix}.quarto`, MAX_TEXT_LENGTH);
  const telefone = parseOptionalText(raw.telefone, `${pathPrefix}.telefone`, MAX_PHONE_LENGTH);
  const horasDescanso = parseOptionalRestHours(raw.horasDescanso, `${pathPrefix}.horasDescanso`);
  const rawSubstituto = parseOptionalText(
    raw.substituto,
    `${pathPrefix}.substituto`,
    MAX_TEXT_LENGTH
  );
  const substituto = status === 'Cobertura' ? rawSubstituto : undefined;

  const clean: Cuidador = {
    id,
    nome,
    status,
    ...(turno !== undefined ? { turno } : {}),
    ...(quarto !== undefined ? { quarto } : {}),
    ...(telefone !== undefined ? { telefone } : {}),
    ...(horasDescanso !== undefined ? { horasDescanso } : {}),
    ...(substituto !== undefined ? { substituto } : {}),
  };

  return Object.freeze(clean);
}

export function parseCuidadorList(raw: unknown, pathPrefix = 'cuidadores'): Cuidador[] {
  if (!Array.isArray(raw)) {
    throw new ContractValidationError(pathPrefix, `Lista '${pathPrefix}' deve ser um array.`);
  }
  if (raw.length === 0) {
    throw new ContractValidationError(pathPrefix, `Lista '${pathPrefix}' nao pode estar vazia.`);
  }
  if (raw.length > MAX_BATCH_SIZE) {
    throw new ContractValidationError(
      pathPrefix,
      `Lista '${pathPrefix}' excede o limite maximo de ${MAX_BATCH_SIZE} cuidadores.`
    );
  }

  const seenIds = new Set<number>();
  const parsed: Cuidador[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const item = parseCuidador(raw[index], `${pathPrefix}[${index}]`);
    if (seenIds.has(item.id)) {
      throw new ContractValidationError(
        `${pathPrefix}[${index}].id`,
        `ID duplicado detectado na escala: ${item.id}.`
      );
    }
    seenIds.add(item.id);
    parsed.push(item);
  }

  parsed.sort((a, b) => a.id - b.id);
  return parsed;
}

export function nextOperationalStatus(current: StatusCuidador): StatusCuidador {
  switch (current) {
    case 'Presente':
      return 'Faltou';
    case 'Faltou':
      return 'Folga';
    case 'Folga':
      return 'Presente';
    case 'Cobertura':
      return 'Presente';
  }
}

export function applyStatusChange(
  cuidador: Cuidador,
  nextStatus: StatusCuidador,
  substituto?: string
): Cuidador {
  return parseCuidador({
    ...cuidador,
    status: nextStatus,
    substituto: nextStatus === 'Cobertura' ? substituto : undefined,
  });
}

export function toStatusUpdatePayload(
  status: StatusCuidador,
  substituto?: string
): StatusUpdatePayload {
  const validatedStatus = parseStatusCuidador(status, 'status');
  const validatedSubstituto = parseOptionalText(substituto, 'substituto', MAX_TEXT_LENGTH);
  const normalizedSubstituto = validatedStatus === 'Cobertura' ? validatedSubstituto : undefined;

  return Object.freeze({
    status: validatedStatus,
    ...(normalizedSubstituto !== undefined ? { substituto: normalizedSubstituto } : {}),
  });
}

export function toBatchPayload(cuidadores: readonly Cuidador[]): Cuidador[] {
  return parseCuidadorList(cuidadores, 'batch');
}
