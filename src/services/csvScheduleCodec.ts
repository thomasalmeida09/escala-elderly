import {
  ALLOWED_STATUSES,
  type Cuidador,
  MAX_BATCH_SIZE,
  MAX_PHONE_LENGTH,
  MAX_REST_HOURS,
  MAX_SAFE_JS_ID,
  MAX_TEXT_LENGTH,
  type StatusCuidador,
  parseCuidadorList,
} from '../types/caregiver';
import { normalizeWhatsAppPhone } from './coverageEngine';
import { projectCaregiverForLgpd } from './lgpdPrivacyEngine';

export const MAX_CSV_BYTES = 1_048_576;

export const CSV_CANONICAL_HEADERS = [
  'id',
  'nome',
  'status',
  'turno',
  'quarto',
  'telefone',
  'horasDescanso',
  'substituto',
] as const;

export type CanonicalCsvField = (typeof CSV_CANONICAL_HEADERS)[number];

export type CsvDelimiter = ';' | '\t' | ',';

export type SpreadsheetEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export type CsvErrorCode =
  | 'EMPTY_INPUT'
  | 'MAX_SIZE_EXCEEDED'
  | 'EXCEL_BINARY_WORKBOOK'
  | 'UNSUPPORTED_BINARY_FILE'
  | 'UNCLOSED_QUOTE'
  | 'MALFORMED_CSV_ROW'
  | 'HEADERLESS_SINGLE_COLUMN'
  | 'MISSING_REQUIRED_COLUMN'
  | 'DUPLICATE_COLUMN'
  | 'CSV_FORMULA_INJECTION'
  | 'EXCEL_SCIENTIFIC_NOTATION'
  | 'INVALID_FIELD_VALUE'
  | 'DUPLICATE_ID'
  | 'MAX_BATCH_EXCEEDED';

export interface CsvScheduleErrorContext {
  readonly line?: number;
  readonly column?: string;
}

export class CsvScheduleError extends Error {
  readonly code: CsvErrorCode;
  readonly line: number | undefined;
  readonly column: string | undefined;

  constructor(code: CsvErrorCode, message: string, context?: CsvScheduleErrorContext) {
    super(message);
    this.name = 'CsvScheduleError';
    this.code = code;
    this.line = context?.line;
    this.column = context?.column;
    Object.setPrototypeOf(this, CsvScheduleError.prototype);
  }
}

export interface DecodedSpreadsheetText {
  readonly text: string;
  readonly encoding: SpreadsheetEncoding;
}

export interface ParsedCsvScheduleResult {
  readonly cuidadores: Cuidador[];
  readonly delimiter: CsvDelimiter;
  readonly encoding: SpreadsheetEncoding;
  readonly rowCount: number;
  readonly hasHeader: boolean;
}

export interface SerializeScheduleCsvOptions {
  readonly delimiter?: CsvDelimiter;
  readonly includeBom?: boolean;
  readonly privacyMode?: boolean;
}

interface TokenizedCsvRow {
  readonly sourceLine: number;
  readonly cells: readonly string[];
}

interface PendingCsvRow {
  readonly id: number | null;
  readonly nome: string;
  readonly status: StatusCuidador;
  readonly turno: string | undefined;
  readonly quarto: string | undefined;
  readonly telefone: string | undefined;
  readonly horasDescanso: number | undefined;
  readonly substituto: string | undefined;
}

const OWASP_FORMULA_TRIGGERS: ReadonlySet<string> = new Set(['=', '+', '-', '@', '\t', '\r']);

const HEADER_ALIAS_MAP: Readonly<Record<string, CanonicalCsvField>> = {
  id: 'id',
  codigo: 'id',
  cod: 'id',
  matricula: 'id',
  identificador: 'id',
  registro: 'id',

  nome: 'nome',
  nomecompleto: 'nome',
  cuidador: 'nome',
  cuidadora: 'nome',
  profissional: 'nome',
  funcionario: 'nome',
  funcionaria: 'nome',
  colaborador: 'nome',
  colaboradora: 'nome',
  plantonista: 'nome',

  status: 'status',
  situacao: 'status',
  estado: 'status',
  presenca: 'status',
  condicao: 'status',

  turno: 'turno',
  plantao: 'turno',
  horario: 'turno',
  periodo: 'turno',
  jornada: 'turno',
  escala: 'turno',

  quarto: 'quarto',
  posto: 'quarto',
  ala: 'quarto',
  setor: 'quarto',
  leito: 'quarto',
  unidade: 'quarto',
  aposento: 'quarto',
  sala: 'quarto',

  telefone: 'telefone',
  tel: 'telefone',
  fone: 'telefone',
  whatsapp: 'telefone',
  zap: 'telefone',
  celular: 'telefone',
  contato: 'telefone',
  ddicelular: 'telefone',

  horasdescanso: 'horasDescanso',
  descanso: 'horasDescanso',
  horasdedescanso: 'horasDescanso',
  clt: 'horasDescanso',
  descansoclt: 'horasDescanso',
  interjornada: 'horasDescanso',
  horasfolga: 'horasDescanso',

  substituto: 'substituto',
  substituta: 'substituto',
  coberturapor: 'substituto',
  cobertopor: 'substituto',
  cobridor: 'substituto',
  suplente: 'substituto',
  folguistasubstituto: 'substituto',
};

const STATUS_ALIAS_MAP: Readonly<Record<string, StatusCuidador>> = {
  presente: 'Presente',
  ativo: 'Presente',
  ativa: 'Presente',
  emturno: 'Presente',
  trabalhando: 'Presente',
  ok: 'Presente',

  faltou: 'Faltou',
  falta: 'Faltou',
  ausente: 'Faltou',
  ausencia: 'Faltou',
  furo: 'Faltou',

  folga: 'Folga',
  folguista: 'Folga',
  descanso: 'Folga',
  emfolga: 'Folga',
  livre: 'Folga',

  cobertura: 'Cobertura',
  coberto: 'Cobertura',
  coberta: 'Cobertura',
  substituido: 'Cobertura',
  substituida: 'Cobertura',
};

const STRICT_PHONE_SYNTAX_PATTERN =
  /^\+?(?:[0-9]|\([0-9])[0-9()\s.-]{7,30}(?:\s*(?:ramal|ext\.?|#)\s*\d{1,6})?$/i;

const EXCEL_SCIENTIFIC_PATTERN = /\d[.,]\d+e[+-]?\d+/i;

const LEADING_ZERO_OR_LONG_DIGITS_PATTERN = /^(?:0\d+|\d{10,})$/;

const ESCAPED_LEADING_ZERO_OR_LONG_DIGITS_PATTERN = /^'(?:0\d+|\d{10,})$/;

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

function normalizeAsciiToken(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function collapseMultilineWhitespace(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOptionalPlaceholder(raw: string): boolean {
  if (raw.includes('\r') || raw.includes('\n')) {
    return false;
  }
  const trimmed = raw.trim();
  return /^(?:-|--|—|–|n\/a|na|s\/n|nenhum)$/i.test(trimmed);
}

/**
 * Decodifica bytes brutos de planilha (.csv / .tsv / .txt) aplicando:
 * - Limite estrito anti-DoS (1 MiB) antes de alocar strings;
 * - Rejeicao didatica de arquivos binarios (.xlsx ZIP, .xls OLE2, %PDF-, UTF-32, NUL bytes);
 * - Suporte a UTF-8 BOM, UTF-16LE/BE BOM e auto-cura UTF-8 -> Windows-1252 (Excel PT-BR ANSI).
 */
export function decodeSpreadsheetBytes(bytes: Uint8Array): DecodedSpreadsheetText {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new CsvScheduleError('EMPTY_INPUT', 'A planilha selecionada está vazia.');
  }

  if (bytes.byteLength > MAX_CSV_BYTES) {
    throw new CsvScheduleError(
      'MAX_SIZE_EXCEEDED',
      `O arquivo excede o limite máximo seguro de 1 MiB (${MAX_CSV_BYTES} bytes).`
    );
  }

  // (a) Assinaturas binarias de pastas de trabalho Excel (.xlsx ZIP e .xls OLE2)
  if (
    startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08]) ||
    startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    throw new CsvScheduleError(
      'EXCEL_BINARY_WORKBOOK',
      "Arquivo Excel binário (.xlsx/.xls) detectado. No Excel, salve como 'CSV UTF-8 (.csv)' ou selecione as células (Ctrl+C) e cole no painel (Ctrl+V)."
    );
  }

  // (b) Assinatura binaria %PDF-
  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new CsvScheduleError(
      'UNSUPPORTED_BINARY_FILE',
      'Arquivo PDF binário detectado. Selecione uma planilha .csv/.tsv ou cole as células do Excel (Ctrl+V).'
    );
  }

  // (c) UTF-32LE (FF FE 00 00) e UTF-32BE (00 00 FE FF) ANTES de UTF-16LE (FF FE)
  if (
    startsWithBytes(bytes, [0xff, 0xfe, 0x00, 0x00]) ||
    startsWithBytes(bytes, [0x00, 0x00, 0xfe, 0xff])
  ) {
    throw new CsvScheduleError(
      'UNSUPPORTED_BINARY_FILE',
      "Codificação UTF-32 não suportada. No Excel, salve como 'CSV UTF-8 (.csv)'."
    );
  }

  let text: string;
  let encoding: SpreadsheetEncoding;

  // (d) UTF-8 BOM (EF BB BF)
  if (startsWithBytes(bytes, [0xef, 0xbb, 0xbf])) {
    const payload = bytes.subarray(3);
    if (payload.byteLength === 0) {
      throw new CsvScheduleError('EMPTY_INPUT', 'A planilha selecionada está vazia.');
    }
    if (payload.includes(0x00)) {
      throw new CsvScheduleError(
        'UNSUPPORTED_BINARY_FILE',
        'Arquivo binário inválido detectado (contém bytes nulos).'
      );
    }
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
      encoding = 'utf-8-bom';
    } catch (utf8Error) {
      void utf8Error;
      text = new TextDecoder('windows-1252').decode(payload);
      encoding = 'windows-1252';
    }
  } else if (startsWithBytes(bytes, [0xff, 0xfe])) {
    // (e) UTF-16LE BOM (FF FE)
    const payload = bytes.subarray(2);
    if (payload.byteLength === 0) {
      throw new CsvScheduleError('EMPTY_INPUT', 'A planilha selecionada está vazia.');
    }
    if (payload.byteLength % 2 !== 0) {
      throw new CsvScheduleError(
        'UNSUPPORTED_BINARY_FILE',
        'Fluxo UTF-16LE truncado ou corrompido (tamanho ímpar de bytes).'
      );
    }
    try {
      text = new TextDecoder('utf-16le', { fatal: true }).decode(payload);
    } catch (utf16LeError) {
      void utf16LeError;
      throw new CsvScheduleError(
        'UNSUPPORTED_BINARY_FILE',
        'Fluxo UTF-16LE inválido ou corrompido (sequência surrogate órfã).'
      );
    }
    encoding = 'utf-16le';
  } else if (startsWithBytes(bytes, [0xfe, 0xff])) {
    // (f) UTF-16BE BOM (FE FF)
    const payload = bytes.subarray(2);
    if (payload.byteLength === 0) {
      throw new CsvScheduleError('EMPTY_INPUT', 'A planilha selecionada está vazia.');
    }
    if (payload.byteLength % 2 !== 0) {
      throw new CsvScheduleError(
        'UNSUPPORTED_BINARY_FILE',
        'Fluxo UTF-16BE truncado ou corrompido (tamanho ímpar de bytes).'
      );
    }
    try {
      text = new TextDecoder('utf-16be', { fatal: true }).decode(payload);
    } catch (utf16BeError) {
      void utf16BeError;
      throw new CsvScheduleError(
        'UNSUPPORTED_BINARY_FILE',
        'Fluxo UTF-16BE inválido ou corrompido (sequência surrogate órfã).'
      );
    }
    encoding = 'utf-16be';
  } else {
    // (g) Fluxo sem BOM: rejeita bytes nulos e auto-cura UTF-8 -> Windows-1252 (ANSI PT-BR)
    if (bytes.includes(0x00)) {
      throw new CsvScheduleError(
        'UNSUPPORTED_BINARY_FILE',
        'Arquivo binário inválido detectado (contém bytes nulos).'
      );
    }
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      encoding = 'utf-8';
    } catch (utf8Error) {
      void utf8Error;
      text = new TextDecoder('windows-1252').decode(bytes);
      encoding = 'windows-1252';
    }
  }

  if (text.includes('\0')) {
    throw new CsvScheduleError(
      'UNSUPPORTED_BINARY_FILE',
      'A planilha contém caracteres de controle nulos proibidos.'
    );
  }

  if (text.trim().length === 0) {
    throw new CsvScheduleError('EMPTY_INPUT', 'A planilha selecionada está vazia.');
  }

  return { text, encoding };
}

function extractExcelSepDirective(text: string): {
  readonly body: string;
  readonly forcedDelimiter: CsvDelimiter | null;
  readonly initialLine: number;
} {
  let firstBreakIndex = -1;
  let breakLength = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\r') {
      firstBreakIndex = i;
      breakLength = text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    if (ch === '\n') {
      firstBreakIndex = i;
      breakLength = 1;
      break;
    }
  }

  const firstLine = firstBreakIndex === -1 ? text : text.slice(0, firstBreakIndex);
  const sepMatch = firstLine.trim().match(/^"?sep=([;,\t])"?$/i);
  if (!sepMatch) {
    return { body: text, forcedDelimiter: null, initialLine: 1 };
  }

  const forcedDelimiter = sepMatch[1] as CsvDelimiter;
  const remaining = firstBreakIndex === -1 ? '' : text.slice(firstBreakIndex + breakLength);
  return {
    body: remaining,
    forcedDelimiter,
    initialLine: 2,
  };
}

/**
 * Detecta automaticamente o delimitador (';', '\t' ou ',') inspecionando ate 10 registros logicos
 * nao vazios fora de aspas RFC 4180, com prioridade de desempate PT-BR (';' > '\t' > ',').
 */
export function detectCsvDelimiter(text: string): CsvDelimiter {
  const candidates: readonly CsvDelimiter[] = [';', '\t', ','];
  const perRecordCounts: Array<Record<CsvDelimiter, number>> = [];

  let inQuotes = false;
  let hasContentInRecord = false;
  let currentCounts: Record<CsvDelimiter, number> = { ';': 0, '\t': 0, ',': 0 };

  const flushRecord = (): void => {
    if (hasContentInRecord) {
      perRecordCounts.push(currentCounts);
    }
    hasContentInRecord = false;
    currentCounts = { ';': 0, '\t': 0, ',': 0 };
  };

  for (let i = 0; i < text.length && perRecordCounts.length < 10; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = false;
        }
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      hasContentInRecord = true;
      continue;
    }

    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i += 1;
      }
      flushRecord();
      continue;
    }

    if (ch === '\n') {
      flushRecord();
      continue;
    }

    if (ch === ';' || ch === '\t' || ch === ',') {
      currentCounts[ch] += 1;
      hasContentInRecord = true;
      continue;
    }

    if (ch.trim().length > 0) {
      hasContentInRecord = true;
    }
  }

  if (hasContentInRecord && perRecordCounts.length < 10) {
    flushRecord();
  }

  if (perRecordCounts.length === 0) {
    return ';';
  }

  let bestDelimiter: CsvDelimiter = ';';
  let bestAllPositive = -1;
  let bestConsistent = -1;
  let bestTotalColumns = -1;

  for (const candidate of candidates) {
    const counts = perRecordCounts.map((row) => row[candidate]);
    const maxCount = Math.max(...counts);
    if (maxCount === 0) {
      continue;
    }
    const minCount = Math.min(...counts);
    const allPositive = minCount > 0 ? 1 : 0;
    const isConsistent = minCount === maxCount ? 1 : 0;
    const totalCount = counts.reduce((acc, value) => acc + value, 0);

    if (
      allPositive > bestAllPositive ||
      (allPositive === bestAllPositive && isConsistent > bestConsistent) ||
      (allPositive === bestAllPositive &&
        isConsistent === bestConsistent &&
        totalCount > bestTotalColumns)
    ) {
      bestDelimiter = candidate;
      bestAllPositive = allPositive;
      bestConsistent = isConsistent;
      bestTotalColumns = totalCount;
    }
  }

  return bestDelimiter;
}

function tokenizeCsvRecords(
  text: string,
  delimiter: CsvDelimiter,
  initialLine: number
): TokenizedCsvRow[] {
  type LexerState = 'START_FIELD' | 'UNQUOTED' | 'IN_QUOTES' | 'AFTER_QUOTE';

  const rows: TokenizedCsvRow[] = [];
  let state: LexerState = 'START_FIELD';
  let physicalLine = initialLine;
  let recordStartLine = initialLine;
  let quoteOpenLine = initialLine;
  let currentField = '';
  let currentCells: string[] = [];

  const finalizeRow = (): void => {
    const isCompletelyBlank = currentCells.every((cell) => cell.trim().length === 0);
    if (!isCompletelyBlank) {
      rows.push({
        sourceLine: recordStartLine,
        cells: currentCells,
      });
    }
    currentCells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;

    if (state === 'START_FIELD') {
      if (currentCells.length === 0) {
        recordStartLine = physicalLine;
      }

      if (ch === '"') {
        state = 'IN_QUOTES';
        quoteOpenLine = physicalLine;
        continue;
      }

      if (ch === delimiter) {
        currentCells.push('');
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') {
          i += 1;
        }
        if (currentCells.length > 0) {
          currentCells.push('');
          finalizeRow();
        }
        physicalLine += 1;
        recordStartLine = physicalLine;
        continue;
      }

      currentField = ch;
      state = 'UNQUOTED';
      continue;
    }

    if (state === 'UNQUOTED') {
      if (ch === delimiter) {
        currentCells.push(currentField);
        currentField = '';
        state = 'START_FIELD';
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') {
          i += 1;
        }
        currentCells.push(currentField);
        currentField = '';
        state = 'START_FIELD';
        finalizeRow();
        physicalLine += 1;
        recordStartLine = physicalLine;
        continue;
      }

      currentField += ch;
      continue;
    }

    if (state === 'IN_QUOTES') {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          state = 'AFTER_QUOTE';
        }
        continue;
      }

      if (ch === '\r') {
        if (text[i + 1] === '\n') {
          currentField += '\n';
          i += 1;
        } else {
          currentField += '\n';
        }
        physicalLine += 1;
        continue;
      }

      if (ch === '\n') {
        currentField += '\n';
        physicalLine += 1;
        continue;
      }

      currentField += ch;
      continue;
    }

    // state === 'AFTER_QUOTE'
    if (ch === delimiter) {
      currentCells.push(currentField);
      currentField = '';
      state = 'START_FIELD';
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      currentCells.push(currentField);
      currentField = '';
      state = 'START_FIELD';
      finalizeRow();
      physicalLine += 1;
      recordStartLine = physicalLine;
      continue;
    }

    if (ch === ' ') {
      continue;
    }

    throw new CsvScheduleError(
      'MALFORMED_CSV_ROW',
      `Caractere inesperado após fechamento de aspas na linha ${physicalLine}.`,
      { line: physicalLine }
    );
  }

  if (state === 'IN_QUOTES') {
    throw new CsvScheduleError(
      'UNCLOSED_QUOTE',
      `Aspas duplas não fechadas abertas na linha ${quoteOpenLine}.`,
      { line: quoteOpenLine }
    );
  }

  if (state === 'UNQUOTED' || state === 'AFTER_QUOTE' || currentCells.length > 0) {
    currentCells.push(currentField);
    finalizeRow();
  }

  return rows;
}

/**
 * Inspecao tripla OWASP contra CSV Formula Injection / DDE:
 * (a) 1o caractere bruto;
 * (b) 1o caractere apos remocao de espacos/invisiveis ou apostrofo seguido de gatilho;
 * (c) 1o caractere (bruto ou trimmed) de qualquer linha interna em celulas multilinhas (Alt+Enter).
 */
function assertNoOwaspFormulaInjection(rawCell: string, line: number, column: string): void {
  const segments = rawCell.split(/\r\n|\n|\r/);

  for (const segment of segments) {
    if (segment.length > 0 && OWASP_FORMULA_TRIGGERS.has(segment[0]!)) {
      throw new CsvScheduleError(
        'CSV_FORMULA_INJECTION',
        `Fórmula ou comando bloqueado por segurança na linha ${line}, coluna '${column}'.`,
        { line, column }
      );
    }

    const trimmedStart = segment.replace(/^[\s\u00A0\uFEFF]+/, '');
    if (trimmedStart.length === 0) {
      continue;
    }

    if (OWASP_FORMULA_TRIGGERS.has(trimmedStart[0]!)) {
      throw new CsvScheduleError(
        'CSV_FORMULA_INJECTION',
        `Fórmula ou comando bloqueado por segurança na linha ${line}, coluna '${column}'.`,
        { line, column }
      );
    }

    if (trimmedStart.startsWith("'")) {
      const afterQuote = trimmedStart.slice(1).replace(/^[\s\u00A0\uFEFF]+/, '');
      if (afterQuote.length > 0 && OWASP_FORMULA_TRIGGERS.has(afterQuote[0]!)) {
        throw new CsvScheduleError(
          'CSV_FORMULA_INJECTION',
          `Fórmula escapada bloqueada por segurança na linha ${line}, coluna '${column}'.`,
          { line, column }
        );
      }
    }
  }
}

function unescapeExcelNumericTextPrefix(value: string): string {
  return ESCAPED_LEADING_ZERO_OR_LONG_DIGITS_PATTERN.test(value) ? value.slice(1) : value;
}

function parseCsvIdCell(raw: string | undefined, line: number): number | null {
  if (raw === undefined || raw.trim().length === 0 || isOptionalPlaceholder(raw)) {
    return null;
  }

  assertNoOwaspFormulaInjection(raw, line, 'id');
  const trimmed = unescapeExcelNumericTextPrefix(raw.trim());
  const match = trimmed.match(/^#?0*([1-9]\d*)$/);
  if (!match) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `ID inválido ('${trimmed}') na linha ${line}, coluna 'id'. Informe um inteiro positivo.`,
      { line, column: 'id' }
    );
  }

  const numericId = Number(match[1]);
  if (!Number.isSafeInteger(numericId) || numericId < 1 || numericId > MAX_SAFE_JS_ID) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `ID fora do intervalo seguro na linha ${line}, coluna 'id'.`,
      { line, column: 'id' }
    );
  }

  return numericId;
}

function parseCsvRequiredName(raw: string | undefined, line: number): string {
  if (raw === undefined || raw.trim().length === 0 || isOptionalPlaceholder(raw)) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Campo obrigatório 'nome' vazio na linha ${line}.`,
      { line, column: 'nome' }
    );
  }

  assertNoOwaspFormulaInjection(raw, line, 'nome');
  const normalized = unescapeExcelNumericTextPrefix(collapseMultilineWhitespace(raw));
  if (normalized.length === 0 || normalized.length > MAX_TEXT_LENGTH) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Nome excede o limite de ${MAX_TEXT_LENGTH} caracteres na linha ${line}, coluna 'nome'.`,
      { line, column: 'nome' }
    );
  }

  return normalized;
}

function parseCsvOptionalTextField(
  raw: string | undefined,
  line: number,
  column: 'turno' | 'quarto' | 'substituto'
): string | undefined {
  if (raw === undefined || raw.trim().length === 0 || isOptionalPlaceholder(raw)) {
    return undefined;
  }

  assertNoOwaspFormulaInjection(raw, line, column);
  const normalized = unescapeExcelNumericTextPrefix(collapseMultilineWhitespace(raw));
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Valor excede o limite de ${MAX_TEXT_LENGTH} caracteres na linha ${line}, coluna '${column}'.`,
      { line, column }
    );
  }

  return normalized;
}

function parseCsvStatusField(raw: string | undefined, line: number): StatusCuidador {
  if (raw === undefined || raw.trim().length === 0 || isOptionalPlaceholder(raw)) {
    return 'Presente';
  }

  assertNoOwaspFormulaInjection(raw, line, 'status');
  const key = normalizeAsciiToken(raw);
  const mapped = STATUS_ALIAS_MAP[key];
  if (!mapped) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Status inválido ('${collapseMultilineWhitespace(raw)}') na linha ${line}, coluna 'status'. Use: ${ALLOWED_STATUSES.join(', ')}.`,
      { line, column: 'status' }
    );
  }

  return mapped;
}

function parseCsvRestHoursField(raw: string | undefined, line: number): number | undefined {
  if (raw === undefined || raw.trim().length === 0 || isOptionalPlaceholder(raw)) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (/^-\d+(\.\d+)?\s*(?:h|hrs?|horas?)?$/i.test(trimmed)) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Horas de descanso não podem ser negativas ('${trimmed}') na linha ${line}, coluna 'horasDescanso'.`,
      { line, column: 'horasDescanso' }
    );
  }

  assertNoOwaspFormulaInjection(raw, line, 'horasDescanso');
  const unescaped = unescapeExcelNumericTextPrefix(trimmed);
  const match = unescaped.match(/^(\d+)\s*(?:h|hrs?|horas?)?$/i);
  if (!match) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Horas de descanso inválidas ('${unescaped}') na linha ${line}, coluna 'horasDescanso'. Informe inteiro entre 0 e ${MAX_REST_HOURS}.`,
      { line, column: 'horasDescanso' }
    );
  }

  const hours = Number(match[1]);
  if (!Number.isSafeInteger(hours) || hours < 0 || hours > MAX_REST_HOURS) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Horas de descanso ('${hours}') fora do limite permitido (0 a ${MAX_REST_HOURS}) na linha ${line}, coluna 'horasDescanso'.`,
      { line, column: 'horasDescanso' }
    );
  }

  return hours;
}

function parseCsvPhoneField(raw: string | undefined, line: number): string | undefined {
  if (raw === undefined || raw.trim().length === 0 || isOptionalPlaceholder(raw)) {
    return undefined;
  }

  if (raw.includes('\r') || raw.includes('\n') || raw.includes('\t')) {
    if (raw.startsWith('\t') || raw.startsWith('\r')) {
      throw new CsvScheduleError(
        'CSV_FORMULA_INJECTION',
        `Caractere de controle bloqueado na linha ${line}, coluna 'telefone'.`,
        { line, column: 'telefone' }
      );
    }
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Telefone não pode conter quebras de linha na linha ${line}, coluna 'telefone'.`,
      { line, column: 'telefone' }
    );
  }

  const rawFirst = raw[0]!;
  if (rawFirst === '=' || rawFirst === '-' || rawFirst === '@') {
    throw new CsvScheduleError(
      'CSV_FORMULA_INJECTION',
      `Fórmula bloqueada por segurança na linha ${line}, coluna 'telefone'.`,
      { line, column: 'telefone' }
    );
  }

  const trimmed = raw.replace(/^[\s\u00A0\uFEFF]+/, '').trimEnd();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@') ||
    (trimmed.startsWith("'") &&
      (trimmed.slice(1).startsWith('=') ||
        trimmed.slice(1).startsWith('-') ||
        trimmed.slice(1).startsWith('@') ||
        trimmed.slice(1).startsWith("'") ||
        trimmed.slice(1).startsWith(' ')))
  ) {
    throw new CsvScheduleError(
      'CSV_FORMULA_INJECTION',
      `Fórmula bloqueada por segurança na linha ${line}, coluna 'telefone'.`,
      { line, column: 'telefone' }
    );
  }

  // Remove no maximo 1 apostrofo inicial de escape de texto do Excel ('+55... / '11...)
  const cleaned = trimmed.startsWith("'") ? trimmed.slice(1) : trimmed;

  if (/^\+[^0-9]/.test(cleaned) || cleaned === '+') {
    throw new CsvScheduleError(
      'CSV_FORMULA_INJECTION',
      `Expressão iniciada por '+' inválida ou insegura na linha ${line}, coluna 'telefone'.`,
      { line, column: 'telefone' }
    );
  }

  if (EXCEL_SCIENTIFIC_PATTERN.test(cleaned)) {
    throw new CsvScheduleError(
      'EXCEL_SCIENTIFIC_NOTATION',
      `Telefone corrompido por notação científica do Excel ('${cleaned}') na linha ${line}, coluna 'telefone'. Formate a coluna como Texto antes de exportar.`,
      { line, column: 'telefone' }
    );
  }

  if (
    cleaned.length > MAX_PHONE_LENGTH ||
    !STRICT_PHONE_SYNTAX_PATTERN.test(cleaned) ||
    normalizeWhatsAppPhone(cleaned) === null
  ) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      `Telefone inválido ('${cleaned}') na linha ${line}, coluna 'telefone'. Informe DDD + número válido (ex.: +55 11 90000-0101).`,
      { line, column: 'telefone' }
    );
  }

  return cleaned;
}

const HEADER_PREPOSITION_WORDS: ReadonlySet<string> = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'pelo',
  'pela',
  'pelos',
  'pelas',
  'para',
]);

const COMPOUND_HEADER_STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'o',
  'os',
  'as',
  ...HEADER_PREPOSITION_WORDS,
  'ou',
  'e',
  'completo',
  'completa',
  'atual',
  'minimo',
  'h',
  'hr',
  'hrs',
  'horas',
]);

const SPECIFIC_HEADER_FIELDS: ReadonlySet<CanonicalCsvField> = new Set([
  'substituto',
  'horasDescanso',
  'telefone',
  'quarto',
  'status',
  'id',
]);

const CONTEXT_HEADER_FIELDS: ReadonlySet<CanonicalCsvField> = new Set(['nome', 'turno']);

function resolveCanonicalHeaderField(rawHeaderCell: string): CanonicalCsvField | undefined {
  const exactToken = normalizeAsciiToken(rawHeaderCell);
  if (exactToken.length === 0) {
    return undefined;
  }

  const directMatch = HEADER_ALIAS_MAP[exactToken];
  if (directMatch !== undefined) {
    return directMatch;
  }

  // Cabecalhos compostos reais (ex.: "Profissional\n(Nome Completo)", "Situação\nno Plantão", "ID da\nEscala")
  // nunca contem digitos de dados ("Quarto 05", "07h-19h") e todas as palavras pertencem ao vocabulario de cabecalho.
  if (/\d/.test(rawHeaderCell)) {
    return undefined;
  }

  const words =
    rawHeaderCell
      .replace(/[\r\n\t]+/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .match(/[a-z]+/g) ?? [];

  if (words.length === 0) {
    return undefined;
  }

  const matchedFields = new Set<CanonicalCsvField>();
  for (const word of words) {
    if (COMPOUND_HEADER_STOPWORDS.has(word)) {
      continue;
    }
    const wordField = HEADER_ALIAS_MAP[word];
    if (wordField === undefined) {
      return undefined;
    }
    matchedFields.add(wordField);
  }

  if (matchedFields.size === 1) {
    return [...matchedFields][0];
  }

  const specificMatches = [...matchedFields].filter((field) => SPECIFIC_HEADER_FIELDS.has(field));
  const contextMatches = [...matchedFields].filter((field) => CONTEXT_HEADER_FIELDS.has(field));

  // Atributo especifico qualificado por substantivo contextual da escala/profissional
  // Ex.: "Situação no Plantão" -> 'status', "ID da Escala" -> 'id', "WhatsApp do Cuidador" -> 'telefone',
  // "Quarto do Plantão" -> 'quarto', "Horas de Descanso da Escala" -> 'horasDescanso', "Cuidador Substituto" -> 'substituto'.
  // Pares genuinamente ambiguos entre 2 atributos especificos ("Telefone / Quarto", "ID / Status") continuam undefined.
  if (
    specificMatches.length === 1 &&
    specificMatches.length + contextMatches.length === matchedFields.size
  ) {
    return specificMatches[0];
  }

  // Par contextual {'nome', 'turno'} desambiguado pelo nucleo nominal anterior a preposicao:
  // Ex.: "Turno do Cuidador" -> 'turno'; "Profissional do Plantão" -> 'nome'; "Nome / Turno" (sem preposicao) -> undefined.
  if (specificMatches.length === 0 && contextMatches.length === 2) {
    let headField: CanonicalCsvField | undefined;
    let sawPrepositionAfterHead = false;

    for (const word of words) {
      if (HEADER_PREPOSITION_WORDS.has(word)) {
        if (headField !== undefined) {
          sawPrepositionAfterHead = true;
        }
        continue;
      }
      if (COMPOUND_HEADER_STOPWORDS.has(word)) {
        continue;
      }
      const wordField = HEADER_ALIAS_MAP[word];
      if (headField === undefined) {
        headField = wordField;
      } else if (sawPrepositionAfterHead && wordField !== undefined && wordField !== headField) {
        return headField;
      }
    }
  }

  return undefined;
}

function buildColumnMap(rows: readonly TokenizedCsvRow[]): {
  readonly columnMap: ReadonlyMap<CanonicalCsvField, number>;
  readonly hasHeader: boolean;
  readonly dataRows: readonly TokenizedCsvRow[];
} {
  const firstRow = rows[0]!;
  const headerMatches = new Map<CanonicalCsvField, number>();
  let recognizedCount = 0;

  for (let colIdx = 0; colIdx < firstRow.cells.length; colIdx += 1) {
    const canonicalField = resolveCanonicalHeaderField(firstRow.cells[colIdx]!);
    if (canonicalField !== undefined) {
      if (headerMatches.has(canonicalField)) {
        throw new CsvScheduleError(
          'DUPLICATE_COLUMN',
          `Coluna duplicada ou ambígua para '${canonicalField}' no cabeçalho (linha ${firstRow.sourceLine}).`,
          { line: firstRow.sourceLine, column: canonicalField }
        );
      }
      headerMatches.set(canonicalField, colIdx);
      recognizedCount += 1;
    }
  }

  if (recognizedCount > 0) {
    if (!headerMatches.has('nome')) {
      throw new CsvScheduleError(
        'MISSING_REQUIRED_COLUMN',
        `Cabeçalho na linha ${firstRow.sourceLine} não contém a coluna obrigatória 'nome' (ou 'cuidador'/'profissional').`,
        { line: firstRow.sourceLine, column: 'nome' }
      );
    }

    const dataRows = rows.slice(1);
    if (dataRows.length === 0) {
      throw new CsvScheduleError(
        'EMPTY_INPUT',
        'A planilha contém apenas o cabeçalho e nenhum profissional cadastrado.',
        { line: firstRow.sourceLine }
      );
    }

    return {
      columnMap: headerMatches,
      hasHeader: true,
      dataRows,
    };
  }

  // Modo sem cabecalho (ex.: selecao direta de celulas no Excel Ctrl+C -> Ctrl+V):
  // exige >= 2 colunas para bloquear colagem acidental de frases/URLs comuns da area de transferencia.
  if (firstRow.cells.length < 2) {
    throw new CsvScheduleError(
      'HEADERLESS_SINGLE_COLUMN',
      'Texto sem colunas tabulares detectado. Copie ao menos 2 colunas da planilha (ex.: Nome e Status/Turno) ou inclua cabeçalho.',
      { line: firstRow.sourceLine }
    );
  }

  const positionalMap = new Map<CanonicalCsvField, number>();
  const allCol0NumericId =
    firstRow.cells.length >= 2 &&
    rows.every((row) => {
      const col0 = (row.cells[0] ?? '').trim();
      const col1 = (row.cells[1] ?? '').trim();
      return /^#?0*[1-9]\d*$/.test(col0) && col1.length > 0 && !/^#?0*[1-9]\d*$/.test(col1);
    });

  let cursor = 0;
  if (allCol0NumericId) {
    positionalMap.set('id', 0);
    cursor = 1;
  }

  positionalMap.set('nome', cursor);
  cursor += 1;

  if (cursor < firstRow.cells.length) {
    const looksLikeStatusColumn = rows.every((row) => {
      const candidate = row.cells[cursor];
      if (
        candidate === undefined ||
        candidate.trim().length === 0 ||
        isOptionalPlaceholder(candidate)
      ) {
        return true;
      }
      return STATUS_ALIAS_MAP[normalizeAsciiToken(candidate)] !== undefined;
    });

    if (looksLikeStatusColumn) {
      positionalMap.set('status', cursor);
      cursor += 1;
    }
  }

  const remainingFields: readonly CanonicalCsvField[] = [
    'turno',
    'quarto',
    'telefone',
    'horasDescanso',
    'substituto',
  ];

  for (const field of remainingFields) {
    if (cursor >= firstRow.cells.length) {
      break;
    }
    positionalMap.set(field, cursor);
    cursor += 1;
  }

  return {
    columnMap: positionalMap,
    hasHeader: false,
    dataRows: rows,
  };
}

/**
 * Pipeline Write-Audit-Publish completo para importacao de escala CSV/TSV/Excel:
 * valida 100% das linhas, encodings, limites e regras OWASP em memoria antes de retornar Cuidador[].
 */
export function parseCsvSchedule(input: string | Uint8Array): ParsedCsvScheduleResult {
  let rawText: string;
  let encoding: SpreadsheetEncoding;

  if (typeof input === 'string') {
    if (input.length === 0) {
      throw new CsvScheduleError('EMPTY_INPUT', 'Nenhum conteúdo foi informado para importação.');
    }
    if (input.length > MAX_CSV_BYTES) {
      throw new CsvScheduleError(
        'MAX_SIZE_EXCEEDED',
        `O conteúdo colado excede o limite máximo seguro de 1 MiB (${MAX_CSV_BYTES} bytes).`
      );
    }
    const utf8ByteLength = new TextEncoder().encode(input).byteLength;
    if (utf8ByteLength > MAX_CSV_BYTES) {
      throw new CsvScheduleError(
        'MAX_SIZE_EXCEEDED',
        `O conteúdo colado excede o limite máximo seguro de 1 MiB (${MAX_CSV_BYTES} bytes).`
      );
    }
    if (input.includes('\0')) {
      throw new CsvScheduleError(
        'UNSUPPORTED_BINARY_FILE',
        'O conteúdo informado possui caracteres binários nulos inválidos.'
      );
    }

    const hasLeadingBom = input.startsWith('\uFEFF');
    rawText = hasLeadingBom ? input.slice(1) : input;
    encoding = hasLeadingBom ? 'utf-8-bom' : 'utf-8';

    if (rawText.trim().length === 0) {
      throw new CsvScheduleError(
        'EMPTY_INPUT',
        'Nenhum conteúdo válido foi encontrado na planilha.'
      );
    }
  } else {
    const decoded = decodeSpreadsheetBytes(input);
    rawText = decoded.text;
    encoding = decoded.encoding;
  }

  const { body, forcedDelimiter, initialLine } = extractExcelSepDirective(rawText);
  if (body.trim().length === 0) {
    throw new CsvScheduleError('EMPTY_INPUT', 'A planilha não contém linhas de dados.');
  }

  const delimiter = forcedDelimiter ?? detectCsvDelimiter(body);
  const tokenizedRows = tokenizeCsvRecords(body, delimiter, initialLine);
  if (tokenizedRows.length === 0) {
    throw new CsvScheduleError(
      'EMPTY_INPUT',
      'Nenhum registro preenchido foi encontrado na planilha.'
    );
  }

  const { columnMap, hasHeader, dataRows } = buildColumnMap(tokenizedRows);

  if (dataRows.length > MAX_BATCH_SIZE) {
    const overflowLine = dataRows[MAX_BATCH_SIZE]?.sourceLine;
    throw new CsvScheduleError(
      'MAX_BATCH_EXCEEDED',
      `A planilha contém ${dataRows.length} profissionais, excedendo o limite máximo de ${MAX_BATCH_SIZE}.`,
      { line: overflowLine }
    );
  }

  const explicitIds = new Set<number>();
  let maxExplicitId = 0;
  let missingIdCount = 0;
  const pendingRows: PendingCsvRow[] = [];

  const getCell = (row: TokenizedCsvRow, field: CanonicalCsvField): string | undefined => {
    const idx = columnMap.get(field);
    return idx !== undefined ? row.cells[idx] : undefined;
  };

  for (const row of dataRows) {
    const line = row.sourceLine;
    const explicitId = parseCsvIdCell(getCell(row, 'id'), line);

    if (explicitId !== null) {
      if (explicitIds.has(explicitId)) {
        throw new CsvScheduleError(
          'DUPLICATE_ID',
          `ID duplicado (${explicitId}) encontrado na linha ${line}, coluna 'id'.`,
          { line, column: 'id' }
        );
      }
      explicitIds.add(explicitId);
      if (explicitId > maxExplicitId) {
        maxExplicitId = explicitId;
      }
    } else {
      missingIdCount += 1;
    }

    const nome = parseCsvRequiredName(getCell(row, 'nome'), line);
    const status = parseCsvStatusField(getCell(row, 'status'), line);
    const turno = parseCsvOptionalTextField(getCell(row, 'turno'), line, 'turno');
    const quarto = parseCsvOptionalTextField(getCell(row, 'quarto'), line, 'quarto');
    const telefone = parseCsvPhoneField(getCell(row, 'telefone'), line);
    const horasDescanso = parseCsvRestHoursField(getCell(row, 'horasDescanso'), line);
    const rawSubstituto = parseCsvOptionalTextField(getCell(row, 'substituto'), line, 'substituto');
    const substituto = status === 'Cobertura' ? rawSubstituto : undefined;

    pendingRows.push({
      id: explicitId,
      nome,
      status,
      turno,
      quarto,
      telefone,
      horasDescanso,
      substituto,
    });
  }

  if (maxExplicitId > MAX_SAFE_JS_ID - missingIdCount) {
    throw new CsvScheduleError(
      'INVALID_FIELD_VALUE',
      'A geração automática de IDs ultrapassaria o limite numérico seguro MAX_SAFE_JS_ID.'
    );
  }

  let nextAutoId = maxExplicitId + 1;
  const rawCuidadores = pendingRows.map((item) => ({
    id: item.id !== null ? item.id : nextAutoId++,
    nome: item.nome,
    status: item.status,
    ...(item.turno !== undefined ? { turno: item.turno } : {}),
    ...(item.quarto !== undefined ? { quarto: item.quarto } : {}),
    ...(item.telefone !== undefined ? { telefone: item.telefone } : {}),
    ...(item.horasDescanso !== undefined ? { horasDescanso: item.horasDescanso } : {}),
    ...(item.substituto !== undefined ? { substituto: item.substituto } : {}),
  }));

  const cuidadores = parseCuidadorList(rawCuidadores, 'csv.cuidadores');

  return Object.freeze({
    cuidadores,
    delimiter,
    encoding,
    rowCount: cuidadores.length,
    hasHeader,
  });
}

/**
 * Escapa uma celula na ordem canonica (M2.3):
 * 1o Prefixo OWASP "'" se iniciar por gatilho ('=', '+', '-', '@', '\t', '\r') ou digitos sujeitos
 *    a truncamento/perda de zero a esquerda no Excel (0\d+ ou \d{10,});
 * 2o Envelopamento entre aspas duplas RFC 4180 se contiver delimitador, '"', '\r', '\n' ou espacos externos.
 */
export function escapeCsvCellForExport(
  rawValue: string | number | undefined,
  delimiter: CsvDelimiter = ';'
): string {
  if (rawValue === undefined) {
    return '';
  }

  if (typeof rawValue === 'number') {
    return String(rawValue);
  }

  const trimmedStart = rawValue.replace(/^[\s\u00A0\uFEFF]+/, '');
  const trimmed = rawValue.trim();

  const needsSingleQuotePrefix =
    (rawValue.length > 0 && OWASP_FORMULA_TRIGGERS.has(rawValue[0]!)) ||
    (trimmedStart.length > 0 && OWASP_FORMULA_TRIGGERS.has(trimmedStart[0]!)) ||
    LEADING_ZERO_OR_LONG_DIGITS_PATTERN.test(trimmed);

  const safeText = needsSingleQuotePrefix ? `'${rawValue}` : rawValue;

  const needsRfc4180Quotes =
    safeText.includes(delimiter) ||
    safeText.includes('"') ||
    safeText.includes('\r') ||
    safeText.includes('\n') ||
    safeText !== safeText.trim();

  return needsRfc4180Quotes ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

export function serializeScheduleToCsv(
  cuidadores: readonly Cuidador[],
  options: SerializeScheduleCsvOptions = {}
): string {
  const delimiter = options.delimiter ?? ';';
  const includeBom = options.includeBom ?? true;
  const privacyMode = options.privacyMode ?? false;
  const validated = parseCuidadorList(cuidadores, 'export.cuidadores');
  const rowsToExport = privacyMode
    ? validated.map((cuidador) => projectCaregiverForLgpd(cuidador, true))
    : validated;

  const lines: string[] = [CSV_CANONICAL_HEADERS.join(delimiter)];

  for (const cuidador of rowsToExport) {
    const rowCells = [
      escapeCsvCellForExport(cuidador.id, delimiter),
      escapeCsvCellForExport(cuidador.nome, delimiter),
      escapeCsvCellForExport(cuidador.status, delimiter),
      escapeCsvCellForExport(cuidador.turno, delimiter),
      escapeCsvCellForExport(cuidador.quarto, delimiter),
      escapeCsvCellForExport(cuidador.telefone, delimiter),
      escapeCsvCellForExport(cuidador.horasDescanso, delimiter),
      escapeCsvCellForExport(
        cuidador.status === 'Cobertura' ? cuidador.substituto : undefined,
        delimiter
      ),
    ];
    lines.push(rowCells.join(delimiter));
  }

  const csvBody = `${lines.join('\r\n')}\r\n`;
  return includeBom ? `\uFEFF${csvBody}` : csvBody;
}

export function buildCsvBackupFilename(
  referenceDate: Date = new Date(),
  privacyMode: boolean = false
): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  const lgpdSuffix = privacyMode ? '-lgpd' : '';
  return `escala-cuidadores-${year}-${month}-${day}${lgpdSuffix}.csv`;
}
