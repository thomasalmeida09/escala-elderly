import type { Cuidador, StatusCuidador } from '../types/caregiver';
import { hydrateCanonicalCaregiverMetadata } from './coverageEngine';
import { maskPersonNameLgpd } from './lgpdPrivacyEngine';
import {
  type ParsedVectorSignature,
  parseSigV1,
  signatureToPdfPathOperators,
} from './vectorSignatureProtocol';

export { maskPersonNameLgpd } from './lgpdPrivacyEngine';

export const PT_PER_MM = 72 / 25.4;
export const PX_PER_MM = 96 / 25.4;
export const MIN_AUTOFIT_FONT_PT = 6.5;
export const MAX_AUTOFIT_ITERATIONS = 12;
export const AUTOFIT_WIDTH_SAFETY_FACTOR = 0.94;
export const MIN_OPTICAL_SHEET_SCALE = 0.24;
export const MAX_OPTICAL_SHEET_SCALE = 1.0;

export type PageOrientation = 'portrait' | 'landscape';
export type PdfStandardFont = 'Helvetica' | 'Helvetica-Bold' | 'Courier';

export interface A4PageDimensions {
  readonly orientation: PageOrientation;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly heightBudgetPx: number;
}

export interface OpticalSheetScaleResult {
  readonly scale: number;
  readonly pageWidthPx: number;
  readonly pageHeightPx: number;
  readonly scaledWidthPx: number;
  readonly scaledHeightPx: number;
}

export interface AutoFitTextOptions {
  readonly maxFontPt?: number;
  readonly minFontPt?: number;
  readonly lineHeightFactor?: number;
  readonly font?: PdfStandardFont;
  readonly maxLinesOverride?: number;
}

export interface AutoFitTextResult {
  readonly fontSizePt: number;
  readonly lines: readonly string[];
  readonly lineHeightMm: number;
  readonly totalTextHeightMm: number;
  readonly iterations: number;
  readonly truncated: boolean;
}

export interface ScheduleSummaryCounts {
  readonly total: number;
  readonly presentes: number;
  readonly coberturas: number;
  readonly faltas: number;
  readonly folgas: number;
}

export interface A4ColumnSpec {
  readonly key: 'id' | 'nome' | 'turno' | 'quarto' | 'status' | 'contato';
  readonly label: string;
  readonly xMm: number;
  readonly widthMm: number;
  readonly align: 'left' | 'center';
}

export interface A4FormattedScheduleRow {
  readonly index: number;
  readonly idText: string;
  readonly status: StatusCuidador;
  readonly statusLabel: string;
  readonly nomeFit: AutoFitTextResult;
  readonly turnoFit: AutoFitTextResult;
  readonly quartoFit: AutoFitTextResult;
  readonly contatoFit: AutoFitTextResult;
  readonly heightMm: number;
}

export interface A4PlacedScheduleRow extends A4FormattedScheduleRow {
  readonly yMm: number;
}

export interface A4PageDisplayList {
  readonly pageNumber: number;
  readonly totalPages: number;
  readonly isContinuation: boolean;
  readonly headerYmm: number;
  readonly headerHeightMm: number;
  readonly tableHeaderYmm: number;
  readonly tableHeaderHeightMm: number;
  readonly rowsStartYmm: number;
  readonly availableRowsHeightMm: number;
  readonly footerYmm: number;
  readonly footerHeightMm: number;
  readonly rows: readonly A4PlacedScheduleRow[];
}

export interface A4ScheduleBuildOptions {
  readonly orientation?: PageOrientation;
  readonly privacyMode?: boolean;
  readonly signaturePayload?: string | null;
  readonly signerLabel?: string;
  readonly unitTitle?: string;
  readonly emittedAtIso?: string;
}

export interface A4ScheduleDocumentModel {
  readonly unitTitle: string;
  readonly subtitle: string;
  readonly orientation: PageOrientation;
  readonly privacyMode: boolean;
  readonly emittedAtIso: string;
  readonly emittedDisplayBr: string;
  readonly dimensions: A4PageDimensions;
  readonly marginXMm: number;
  readonly marginTopMm: number;
  readonly marginBottomMm: number;
  readonly contentWidthMm: number;
  readonly columns: readonly A4ColumnSpec[];
  readonly summary: ScheduleSummaryCounts;
  readonly signature: ParsedVectorSignature | null;
  readonly signerLabel: string;
  readonly sha256Hex: string;
  readonly pages: readonly A4PageDisplayList[];
}

/**
 * Mapa bidirecional dos 27 codepoints imprimiveis da faixa 0x80..0x9F da codificacao
 * Windows-1252 (/WinAnsiEncoding no ISO 32000-1 Tabela D.1) (M1.2 / S04).
 */
const UNICODE_TO_CP1252_EXT: ReadonlyMap<number, number> = new Map<number, number>([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f], // Ÿ
]);

const CP1252_EXT_TO_UNICODE: ReadonlyMap<number, number> = new Map<number, number>(
  Array.from(UNICODE_TO_CP1252_EXT.entries()).map(([unicode, cpByte]) => [cpByte, unicode])
);

/**
 * Tabelas compactas de largura de glifos AFM (unidades por 1000 em) para /Helvetica e /Helvetica-Bold
 * em ASCII 0x20..0x7E e extensoes CP1252 comuns em Portugues.
 */
const HELVETICA_ASCII_WIDTHS: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD_ASCII_WIDTHS: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

function getWinAnsiGlyphWidthUnits(byte: number, font: PdfStandardFont): number {
  if (font === 'Courier') {
    return 600;
  }
  const isBold = font === 'Helvetica-Bold';
  if (byte >= 0x20 && byte <= 0x7e) {
    const idx = byte - 0x20;
    return (isBold ? HELVETICA_BOLD_ASCII_WIDTHS[idx] : HELVETICA_ASCII_WIDTHS[idx]) ?? 556;
  }
  // Mapeamento preciso para glifos acentuados Latin-1/CP1252 em PT-BR
  if (byte === 0x85) return 1000; // …
  if (byte === 0x95) return 350; // •
  if (byte === 0x96) return 556; // –
  if (byte === 0x97) return 1000; // —
  if (byte === 0xaa) return 370; // ª
  if (byte === 0xba) return 365; // º
  if (byte >= 0xc0 && byte <= 0xc5) return isBold ? 722 : 667; // À..Å
  if (byte === 0xc7) return 722; // Ç
  if (byte >= 0xc8 && byte <= 0xcb) return 667; // È..Ë
  if (byte >= 0xcc && byte <= 0xcf) return 278; // Ì..Ï
  if (byte === 0xd1) return 722; // Ñ
  if (byte >= 0xd2 && byte <= 0xd6) return 778; // Ò..Ö
  if (byte >= 0xd9 && byte <= 0xdc) return 722; // Ù..Ü
  if (byte >= 0xe0 && byte <= 0xe5) return 556; // à..å
  if (byte === 0xe7) return isBold ? 556 : 500; // ç
  if (byte >= 0xe8 && byte <= 0xeb) return 556; // è..ë
  if (byte >= 0xec && byte <= 0xef) return isBold ? 278 : 278; // ì..ï
  if (byte === 0xf1) return isBold ? 611 : 556; // ñ
  if (byte >= 0xf2 && byte <= 0xf6) return isBold ? 611 : 556; // ò..ö
  if (byte >= 0xf9 && byte <= 0xfc) return isBold ? 611 : 556; // ù..ü
  return isBold ? 611 : 556;
}

export function getA4PageDimensions(orientation: PageOrientation = 'portrait'): A4PageDimensions {
  const widthMm = orientation === 'landscape' ? 297 : 210;
  const heightMm = orientation === 'landscape' ? 210 : 297;
  const widthPt = Number((widthMm * PT_PER_MM).toFixed(2));
  const heightPt = Number((heightMm * PT_PER_MM).toFixed(2));
  const widthPx = Number((widthMm * PX_PER_MM).toFixed(2));
  const heightPx = Number((heightMm * PX_PER_MM).toFixed(2));
  const heightBudgetPx = Number((widthMm > 0 ? heightMm * PX_PER_MM - 0.5 : 0).toFixed(2));

  return Object.freeze({
    orientation,
    widthMm,
    heightMm,
    widthPt,
    heightPt,
    widthPx,
    heightPx,
    heightBudgetPx,
  });
}

/**
 * Calcula o zoom optico responsivo da folha A4 sem piso fixo 0.40 nem divisor hardcoded 794,
 * garantindo 0px de overflow horizontal em 375x667 tanto em Retrato quanto em Paisagem (M5.1 / S17).
 */
export function computeOpticalSheetScale(
  availableWidthPx: number,
  orientation: PageOrientation = 'portrait'
): OpticalSheetScaleResult {
  const dim = getA4PageDimensions(orientation);
  if (!Number.isFinite(availableWidthPx) || availableWidthPx <= 0) {
    return Object.freeze({
      scale: 1,
      pageWidthPx: dim.widthPx,
      pageHeightPx: dim.heightPx,
      scaledWidthPx: Math.round(dim.widthPx),
      scaledHeightPx: Math.round(dim.heightPx),
    });
  }

  const rawRatio = availableWidthPx / dim.widthPx;
  const clampedScale = Math.min(
    MAX_OPTICAL_SHEET_SCALE,
    Math.max(MIN_OPTICAL_SHEET_SCALE, rawRatio)
  );
  const scale = Number(clampedScale.toFixed(4));
  const rawScaledWidth = Math.round(dim.widthPx * scale);
  const scaledWidthPx =
    availableWidthPx < dim.widthPx && rawRatio >= MIN_OPTICAL_SHEET_SCALE
      ? Math.min(Math.floor(availableWidthPx), rawScaledWidth)
      : rawScaledWidth;
  const scaledHeightPx = Math.round(dim.heightPx * scale);

  return Object.freeze({
    scale,
    pageWidthPx: dim.widthPx,
    pageHeightPx: dim.heightPx,
    scaledWidthPx,
    scaledHeightPx,
  });
}

/**
 * Detecta se existe qualquer modal acessivel `[aria-modal="true"]` aberto no DOM,
 * permitindo que listeners globais de `window` (paste/dragover/drop) fiquem inertes (M6.2 / S20).
 */
export function isModalDialogOpen(
  doc: Pick<Document, 'querySelector'> | null | undefined = typeof document !== 'undefined'
    ? document
    : null
): boolean {
  if (!doc || typeof doc.querySelector !== 'function') {
    return false;
  }
  return doc.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Injeta <style id="runtime-page-geometry"> com dimensoes literais em mm (zero CSS variables em @page)
 * e marca body[data-a4-sheet-print="active"], devolvendo destrutor LIFO idempotente (M2 / S18).
 */
export function applyRuntimePageGeometry(
  doc: Document,
  orientation: PageOrientation = 'portrait'
): () => void {
  const dim = getA4PageDimensions(orientation);
  let styleEl = doc.getElementById('runtime-page-geometry') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = 'runtime-page-geometry';
    doc.head.appendChild(styleEl);
  }

  styleEl.textContent = [
    `@page { size: ${dim.widthMm}mm ${dim.heightMm}mm; margin: 0; }`,
    `.a4-sheet-page { width: ${dim.widthMm}mm; height: calc(${dim.heightMm}mm - 0.5px); max-height: calc(${dim.heightMm}mm - 0.5px); box-sizing: border-box; overflow: hidden; }`,
  ].join('\n');

  doc.body.setAttribute('data-a4-sheet-print', 'active');

  let cleaned = false;
  return () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    doc.body.removeAttribute('data-a4-sheet-print');
    const existing = doc.getElementById('runtime-page-geometry');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  };
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Implementacao pura e sincrona do padrao FIPS 180-4 SHA-256 (0 dependencias externas,
 * imune a ausencia de crypto.subtle em redes locais HTTP de clinicas) (RT-03 / M1.5 / S06).
 */
export function sha256HexSync(input: string | Uint8Array): string {
  const message = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const bitLength = message.byteLength * 8;
  const paddedLength = Math.ceil((message.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message, 0);
  padded[message.byteLength] = 0x80;

  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  view.setUint32(paddedLength - 8, highBits, false);
  view.setUint32(paddedLength - 4, lowBits, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

function stripLoneSurrogates(value: string): string {
  let clean = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        clean += value.slice(i, i + 2);
        i += 1;
      }
    } else if (code < 0xdc00 || code > 0xdfff) {
      clean += value[i]!;
    }
  }
  return clean;
}

const UNICODE_ASCII_FALLBACKS: Readonly<Record<number, string>> = {
  0x2192: '->', // →
  0x2190: '<-', // ←
  0x2265: '>=', // ≥
  0x2264: '<=', // ≤
  0x2260: '!=', // ≠
  0x0141: 'L', // Ł
  0x0142: 'l', // ł
};

/**
 * Normaliza texto arbitrario para o repertorio /WinAnsiEncoding (CP1252):
 * - Normaliza NFC primeiro (recompondo acentos NFD do macOS/iOS);
 * - Remove controles C0/C1 e marcadores bidi invisiveis;
 * - Preserva 100% dos acentos PT-BR e simbolos CP1252 (–, —, •, …, º, ª) (M1.2 / M1.3 / S04).
 */
export function sanitizeWinAnsiText(raw: string): string {
  const nfc = stripLoneSurrogates(raw).normalize('NFC');
  let out = '';

  for (const ch of nfc) {
    const cp = ch.codePointAt(0)!;

    // Espacos de controle convertidos para espaco simples
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0xa0) {
      out += ' ';
      continue;
    }

    // Remove controles C0 (0x00..0x1F), DEL/C1 (0x7F..0x9F) e invisiveis/bidi Unicode
    if (
      cp < 0x20 ||
      (cp >= 0x7f && cp <= 0x9f) ||
      (cp >= 0x200b && cp <= 0x200f) ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2060 && cp <= 0x206f) ||
      cp === 0xfeff
    ) {
      continue;
    }

    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa1 && cp <= 0xff) || UNICODE_TO_CP1252_EXT.has(cp)) {
      out += ch;
      continue;
    }

    const mappedFallback = UNICODE_ASCII_FALLBACKS[cp];
    if (mappedFallback !== undefined) {
      out += mappedFallback;
      continue;
    }

    // Fallback transliterado para letras latinas estendidas (ex.: ā -> a)
    const decomposed = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const baseCh of decomposed) {
      const baseCp = baseCh.codePointAt(0)!;
      if (baseCp >= 0x20 && baseCp <= 0x7e) {
        out += baseCh;
      }
    }
  }

  return out.replace(/\s+/g, ' ').trim();
}

export function toWinAnsiBytes(raw: string): Uint8Array {
  const clean = sanitizeWinAnsiText(raw);
  const bytes: number[] = [];

  for (const ch of clean) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x20 && cp <= 0x7e) {
      bytes.push(cp);
    } else if (cp >= 0xa0 && cp <= 0xff) {
      bytes.push(cp);
    } else {
      const extByte = UNICODE_TO_CP1252_EXT.get(cp);
      if (extByte !== undefined) {
        bytes.push(extByte);
      }
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Codifica texto em literal string PDF 1.4 seguro `( ... )` 100% ASCII de 7 bits:
 * - Escapa `\`, `(`, `)`;
 * - Codifica todo byte WinAnsi >= 0x80 como escape octal de 3 digitos `\ddd` (M1.2 / M1.3 / S04 / S05).
 */
export function encodePdfWinAnsiLiteral(raw: string): string {
  const bytes = toWinAnsiBytes(raw);
  let escaped = '(';

  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]!;
    if (byte === 0x5c) {
      escaped += '\\\\';
    } else if (byte === 0x28) {
      escaped += '\\(';
    } else if (byte === 0x29) {
      escaped += '\\)';
    } else if (byte >= 0x20 && byte <= 0x7e) {
      escaped += String.fromCharCode(byte);
    } else {
      escaped += `\\${byte.toString(8).padStart(3, '0')}`;
    }
  }

  escaped += ')';
  return escaped;
}

/**
 * Decodifica literal `( ... )` gerado por encodePdfWinAnsiLiteral de volta para UTF-16 JS,
 * permitindo auditoria de round-trip sem perda de acentuacao PT-BR nos testes (S04).
 */
export function decodePdfWinAnsiLiteral(pdfLiteral: string): string {
  if (!pdfLiteral.startsWith('(') || !pdfLiteral.endsWith(')')) {
    throw new Error('Literal PDF invalido: deve iniciar com "(" e terminar com ")".');
  }
  const inner = pdfLiteral.slice(1, -1);
  const bytes: number[] = [];

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]!;
    if (ch !== '\\') {
      bytes.push(ch.charCodeAt(0) & 0xff);
      continue;
    }

    const next = inner[i + 1];
    if (next === undefined) {
      break;
    }
    if (next >= '0' && next <= '7') {
      let octal = next;
      if (i + 2 < inner.length && inner[i + 2]! >= '0' && inner[i + 2]! <= '7') {
        octal += inner[i + 2]!;
        if (i + 3 < inner.length && inner[i + 3]! >= '0' && inner[i + 3]! <= '7') {
          octal += inner[i + 3]!;
        }
      }
      bytes.push(Number.parseInt(octal, 8) & 0xff);
      i += octal.length;
    } else if (next === 'n') {
      bytes.push(0x0a);
      i += 1;
    } else if (next === 'r') {
      bytes.push(0x0d);
      i += 1;
    } else if (next === 't') {
      bytes.push(0x09);
      i += 1;
    } else {
      bytes.push(next.charCodeAt(0) & 0xff);
      i += 1;
    }
  }

  let decoded = '';
  for (const byte of bytes) {
    const mappedUnicode = CP1252_EXT_TO_UNICODE.get(byte);
    if (mappedUnicode !== undefined) {
      decoded += String.fromCodePoint(mappedUnicode);
    } else {
      decoded += String.fromCharCode(byte);
    }
  }
  return decoded;
}

export function measureAfmWidthMm(
  text: string,
  fontSizePt: number,
  font: PdfStandardFont = 'Helvetica'
): number {
  const bytes = toWinAnsiBytes(text);
  let totalUnits = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    totalUnits += getWinAnsiGlyphWidthUnits(bytes[i]!, font);
  }
  const widthPt = (totalUnits / 1000) * fontSizePt;
  return widthPt / PT_PER_MM;
}

function wrapTextAtFontSize(
  cleanText: string,
  maxWidthMm: number,
  fontSizePt: number,
  font: PdfStandardFont
): string[] {
  if (cleanText.length === 0) {
    return ['—'];
  }

  const words = cleanText.split(' ').filter((w) => w.length > 0);
  const lines: string[] = [];
  let currentLine = '';

  const sliceLongToken = (token: string): string[] => {
    const slices: string[] = [];
    let chunk = '';
    for (const ch of token) {
      const candidate = chunk + ch;
      if (chunk.length > 0 && measureAfmWidthMm(candidate, fontSizePt, font) > maxWidthMm) {
        slices.push(chunk);
        chunk = ch;
      } else {
        chunk = candidate;
      }
    }
    if (chunk.length > 0) {
      slices.push(chunk);
    }
    return slices;
  };

  for (const word of words) {
    if (measureAfmWidthMm(word, fontSizePt, font) > maxWidthMm) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      const brokenSlices = sliceLongToken(word);
      for (let sIdx = 0; sIdx < brokenSlices.length - 1; sIdx += 1) {
        lines.push(brokenSlices[sIdx]!);
      }
      currentLine = brokenSlices[brokenSlices.length - 1] ?? '';
      continue;
    }

    const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    if (measureAfmWidthMm(candidate, fontSizePt, font) <= maxWidthMm) {
      currentLine = candidate;
    } else {
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : ['—'];
}

function truncateLineWithEllipsis(
  line: string,
  maxWidthMm: number,
  fontSizePt: number,
  font: PdfStandardFont
): string {
  const ellipsis = '...';
  if (measureAfmWidthMm(`${line}${ellipsis}`, fontSizePt, font) <= maxWidthMm) {
    return `${line}${ellipsis}`;
  }

  let trimmed = line;
  while (
    trimmed.length > 1 &&
    measureAfmWidthMm(`${trimmed}${ellipsis}`, fontSizePt, font) > maxWidthMm
  ) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }
  return `${trimmed}${ellipsis}`;
}

/**
 * Resolve o tamanho tipografico ideal em caixa euclidiana via fast-path em maxFontPt
 * seguido de busca binaria AFM limitada a 12 iteracoes e piso 6.5pt (M3.2 / S07 / S08).
 */
export function solveTextBoxAutoFit(
  rawText: string,
  widthMm: number,
  heightMm: number,
  options: AutoFitTextOptions = {}
): AutoFitTextResult {
  const minFontPt = Math.max(MIN_AUTOFIT_FONT_PT, options.minFontPt ?? MIN_AUTOFIT_FONT_PT);
  const maxFontPt = Math.max(minFontPt, options.maxFontPt ?? 8.5);
  const lineHeightFactor = options.lineHeightFactor ?? 1.24;
  const font = options.font ?? 'Helvetica';
  const effectiveWidthMm = Math.max(2, widthMm * AUTOFIT_WIDTH_SAFETY_FACTOR);
  const cleanText = sanitizeWinAnsiText(rawText);

  const evaluateAtFont = (
    fontSizePt: number
  ): {
    readonly fits: boolean;
    readonly lines: string[];
    readonly lineHeightMm: number;
    readonly maxAllowedLines: number;
  } => {
    const lineHeightMm = (fontSizePt * lineHeightFactor) / PT_PER_MM;
    const computedMaxLines = Math.max(1, Math.floor(heightMm / lineHeightMm));
    const maxAllowedLines =
      options.maxLinesOverride !== undefined
        ? Math.max(1, Math.min(options.maxLinesOverride, computedMaxLines))
        : computedMaxLines;
    const lines = wrapTextAtFontSize(cleanText, effectiveWidthMm, fontSizePt, font);
    return {
      fits: lines.length <= maxAllowedLines && lines.length * lineHeightMm <= heightMm + 0.01,
      lines,
      lineHeightMm,
      maxAllowedLines,
    };
  };

  // Fast-path: 99% das celulas normais cabem direto em maxFontPt sem bisseccao
  const fastAttempt = evaluateAtFont(maxFontPt);
  if (fastAttempt.fits) {
    return Object.freeze({
      fontSizePt: Number(maxFontPt.toFixed(2)),
      lines: Object.freeze(fastAttempt.lines),
      lineHeightMm: Number(fastAttempt.lineHeightMm.toFixed(3)),
      totalTextHeightMm: Number((fastAttempt.lines.length * fastAttempt.lineHeightMm).toFixed(3)),
      iterations: 0,
      truncated: false,
    });
  }

  let low = minFontPt;
  let high = maxFontPt;
  let bestFontPt: number | null = null;
  let iterations = 0;

  while (iterations < MAX_AUTOFIT_ITERATIONS) {
    iterations += 1;
    const mid = (low + high) / 2;
    const check = evaluateAtFont(mid);
    if (check.fits) {
      bestFontPt = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  if (bestFontPt !== null) {
    const settledPt = Math.max(minFontPt, Number(bestFontPt.toFixed(2)));
    const settled = evaluateAtFont(settledPt);
    if (settled.fits) {
      return Object.freeze({
        fontSizePt: settledPt,
        lines: Object.freeze(settled.lines),
        lineHeightMm: Number(settled.lineHeightMm.toFixed(3)),
        totalTextHeightMm: Number((settled.lines.length * settled.lineHeightMm).toFixed(3)),
        iterations,
        truncated: false,
      });
    }
  }

  // Piso de legibilidade 6.5pt atingido: aplica reticencias na ultima linha permitida
  const floorEval = evaluateAtFont(minFontPt);
  if (floorEval.fits) {
    return Object.freeze({
      fontSizePt: minFontPt,
      lines: Object.freeze(floorEval.lines),
      lineHeightMm: Number(floorEval.lineHeightMm.toFixed(3)),
      totalTextHeightMm: Number((floorEval.lines.length * floorEval.lineHeightMm).toFixed(3)),
      iterations,
      truncated: false,
    });
  }

  const keptLines = floorEval.lines.slice(0, floorEval.maxAllowedLines);
  const lastIdx = keptLines.length - 1;
  keptLines[lastIdx] = truncateLineWithEllipsis(
    keptLines[lastIdx]!,
    effectiveWidthMm,
    minFontPt,
    font
  );

  return Object.freeze({
    fontSizePt: minFontPt,
    lines: Object.freeze(keptLines),
    lineHeightMm: Number(floorEval.lineHeightMm.toFixed(3)),
    totalTextHeightMm: Number((keptLines.length * floorEval.lineHeightMm).toFixed(3)),
    iterations,
    truncated: true,
  });
}

export interface ProjectedScheduleCaregiver {
  readonly id: number;
  readonly displayName: string;
  readonly turnoText: string;
  readonly quartoText: string;
  readonly status: StatusCuidador;
  readonly statusLabel: string;
  readonly contactOrCoverageText: string;
}

export function formatCaregiverForSchedule(
  cuidador: Cuidador,
  privacyMode: boolean
): ProjectedScheduleCaregiver {
  const hydrated = privacyMode ? cuidador : hydrateCanonicalCaregiverMetadata(cuidador);
  const displayName = privacyMode
    ? sanitizeWinAnsiText(maskPersonNameLgpd(hydrated.nome)) || '—'
    : sanitizeWinAnsiText(hydrated.nome);
  const turnoText = hydrated.turno ? sanitizeWinAnsiText(hydrated.turno) : 'Turno padrão';
  const quartoText = hydrated.quarto ? sanitizeWinAnsiText(hydrated.quarto) : 'Posto geral';

  const statusLabelMap: Readonly<Record<StatusCuidador, string>> = {
    Presente: 'PRESENTE',
    Cobertura: 'COBERTURA',
    Faltou: 'FALTOU',
    Folga: 'FOLGA',
  };

  let contactOrCoverageText: string;
  if (hydrated.status === 'Cobertura' && hydrated.substituto) {
    const displaySub = privacyMode
      ? sanitizeWinAnsiText(maskPersonNameLgpd(hydrated.substituto)) || '—'
      : sanitizeWinAnsiText(hydrated.substituto);
    if (privacyMode) {
      contactOrCoverageText = `Cob.: ${displaySub} • Tel: Restrito (LGPD)`;
    } else {
      const phonePart = hydrated.telefone ? ` • ${sanitizeWinAnsiText(hydrated.telefone)}` : '';
      contactOrCoverageText = `Cob.: ${displaySub}${phonePart}`;
    }
  } else if (privacyMode) {
    contactOrCoverageText = 'Restrito (LGPD)';
  } else {
    contactOrCoverageText = hydrated.telefone ? sanitizeWinAnsiText(hydrated.telefone) : '—';
  }

  return Object.freeze({
    id: hydrated.id,
    displayName,
    turnoText,
    quartoText,
    status: hydrated.status,
    statusLabel: statusLabelMap[hydrated.status],
    contactOrCoverageText,
  });
}

function buildColumnsForOrientation(
  orientation: PageOrientation,
  marginXMm: number
): readonly A4ColumnSpec[] {
  const widths =
    orientation === 'landscape'
      ? ([
          { key: 'id', label: 'ID', widthMm: 14, align: 'center' },
          { key: 'nome', label: 'Profissional', widthMm: 68, align: 'left' },
          { key: 'turno', label: 'Turno / Horário', widthMm: 48, align: 'left' },
          { key: 'quarto', label: 'Quarto / Posto', widthMm: 38, align: 'left' },
          { key: 'status', label: 'Situação', widthMm: 34, align: 'center' },
          { key: 'contato', label: 'Contato / Cobertura', widthMm: 75, align: 'left' },
        ] as const)
      : ([
          { key: 'id', label: 'ID', widthMm: 11, align: 'center' },
          { key: 'nome', label: 'Profissional', widthMm: 46, align: 'left' },
          { key: 'turno', label: 'Turno / Horário', widthMm: 34, align: 'left' },
          { key: 'quarto', label: 'Quarto / Posto', widthMm: 26, align: 'left' },
          { key: 'status', label: 'Situação', widthMm: 26, align: 'center' },
          { key: 'contato', label: 'Contato / Cobertura', widthMm: 47, align: 'left' },
        ] as const);

  let cursorX = marginXMm;
  return Object.freeze(
    widths.map((col) => {
      const spec: A4ColumnSpec = Object.freeze({
        key: col.key,
        label: col.label,
        xMm: Number(cursorX.toFixed(2)),
        widthMm: col.widthMm,
        align: col.align,
      });
      cursorX += col.widthMm;
      return spec;
    })
  );
}

function formatIsoToPtBrDisplay(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return sanitizeWinAnsiText(iso);
  }
  const pad2 = (n: number): string => String(n).padStart(2, '0');
  const day = pad2(parsed.getUTCDate());
  const month = pad2(parsed.getUTCMonth() + 1);
  const year = parsed.getUTCFullYear();
  const hours = pad2(parsed.getUTCHours());
  const minutes = pad2(parsed.getUTCMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes} UTC`;
}

export function buildPdfFilename(
  referenceDate: Date = new Date(),
  orientation: PageOrientation = 'portrait',
  privacyMode: boolean = false
): string {
  const pad2 = (n: number): string => String(n).padStart(2, '0');
  const yyyy = referenceDate.getFullYear();
  const mm = pad2(referenceDate.getMonth() + 1);
  const dd = pad2(referenceDate.getDate());
  const orientSlug = orientation === 'landscape' ? '-paisagem' : '';
  const lgpdSlug = privacyMode ? '-mural-lgpd' : '';
  return `escala-elderly-a4-${yyyy}-${mm}-${dd}${orientSlug}${lgpdSlug}.pdf`;
}

/**
 * Constroi o modelo geometrico unificado (AST / DisplayList em mm) compartilhado 1:1
 * entre o preview SheetCanvas e o compilador binario ISO 32000-1 %PDF-1.4.
 */
export function buildA4ScheduleDocumentModel(
  cuidadores: readonly Cuidador[],
  options: A4ScheduleBuildOptions = {}
): A4ScheduleDocumentModel {
  const orientation: PageOrientation = options.orientation ?? 'portrait';
  const privacyMode = options.privacyMode ?? false;
  const emittedAtIso = options.emittedAtIso ?? new Date().toISOString();
  const emittedDisplayBr = formatIsoToPtBrDisplay(emittedAtIso);
  const unitTitle = sanitizeWinAnsiText(
    options.unitTitle ?? 'ESCALA OFICIAL DE PLANTÃO ASSISTENCIAL'
  );
  const subtitle = privacyMode
    ? 'Mural Público LGPD (Sobrenomes Abreviados & Contatos Restritos) • ILPI & Home Care'
    : 'Documento Operacional Completo • Gestão de Plantão ILPI & Home Care';
  const signerLabel = options.signerLabel ? sanitizeWinAnsiText(options.signerLabel) : '';

  const signature =
    options.signaturePayload && options.signaturePayload.trim().length > 0
      ? parseSigV1(options.signaturePayload)
      : null;

  const dimensions = getA4PageDimensions(orientation);
  const marginXMm = 10;
  const marginTopMm = 10;
  const marginBottomMm = 10;
  const contentWidthMm = dimensions.widthMm - marginXMm * 2;
  const columns = buildColumnsForOrientation(orientation, marginXMm);

  let presentes = 0;
  let coberturas = 0;
  let faltas = 0;
  let folgas = 0;

  for (const item of cuidadores) {
    if (item.status === 'Presente') presentes += 1;
    else if (item.status === 'Cobertura') coberturas += 1;
    else if (item.status === 'Faltou') faltas += 1;
    else if (item.status === 'Folga') folgas += 1;
  }

  const summary: ScheduleSummaryCounts = Object.freeze({
    total: cuidadores.length,
    presentes,
    coberturas,
    faltas,
    folgas,
  });

  const colNome = columns[1]!;
  const colTurno = columns[2]!;
  const colQuarto = columns[3]!;
  const colContato = columns[5]!;

  const projectedList = cuidadores.map((c) => formatCaregiverForSchedule(c, privacyMode));

  const formattedRows: A4FormattedScheduleRow[] = projectedList.map((proj, index) => {
    const cellBoxHeightMm = 9.2;
    const horizontalPadMm = 3.2;

    const nomeFit = solveTextBoxAutoFit(
      proj.displayName,
      colNome.widthMm - horizontalPadMm,
      cellBoxHeightMm,
      {
        maxFontPt: 8.5,
        font: 'Helvetica-Bold',
        maxLinesOverride: 2,
      }
    );
    const turnoFit = solveTextBoxAutoFit(
      proj.turnoText,
      colTurno.widthMm - horizontalPadMm,
      cellBoxHeightMm,
      {
        maxFontPt: 8.0,
        font: 'Helvetica',
        maxLinesOverride: 2,
      }
    );
    const quartoFit = solveTextBoxAutoFit(
      proj.quartoText,
      colQuarto.widthMm - horizontalPadMm,
      cellBoxHeightMm,
      {
        maxFontPt: 8.0,
        font: 'Helvetica',
        maxLinesOverride: 2,
      }
    );
    const contatoFit = solveTextBoxAutoFit(
      proj.contactOrCoverageText,
      colContato.widthMm - horizontalPadMm,
      cellBoxHeightMm,
      {
        maxFontPt: 7.8,
        font: 'Helvetica',
        maxLinesOverride: 2,
      }
    );

    const tallestTextMm = Math.max(
      nomeFit.totalTextHeightMm,
      turnoFit.totalTextHeightMm,
      quartoFit.totalTextHeightMm,
      contatoFit.totalTextHeightMm
    );
    const rowHeightMm = Number(Math.max(7.2, Math.min(12.0, tallestTextMm + 3.0)).toFixed(2));

    return Object.freeze({
      index,
      idText: String(proj.id).padStart(2, '0'),
      status: proj.status,
      statusLabel: proj.statusLabel,
      nomeFit,
      turnoFit,
      quartoFit,
      contatoFit,
      heightMm: rowHeightMm,
    });
  });

  // Paginacao euclidiana dinamica em mm (M3.1 / S09 / S10 / S11): zero paginas fantasmas!
  const firstPageHeaderHeightMm = 24.0;
  const contPageHeaderHeightMm = 18.5;
  const headerGapMm = 2.0;
  const tableHeaderHeightMm = 7.2;
  const footerHeightMm = 23.5;
  const footerGapMm = 2.0;
  const footerYmm = Number((dimensions.heightMm - marginBottomMm - footerHeightMm).toFixed(2));

  const getPageGeometrySlots = (isContinuation: boolean) => {
    const headerHeightMm = isContinuation ? contPageHeaderHeightMm : firstPageHeaderHeightMm;
    const headerYmm = marginTopMm;
    const tableHeaderYmm = Number((headerYmm + headerHeightMm + headerGapMm).toFixed(2));
    const rowsStartYmm = Number((tableHeaderYmm + tableHeaderHeightMm).toFixed(2));
    const availableRowsHeightMm = Number((footerYmm - footerGapMm - rowsStartYmm).toFixed(2));
    return {
      headerYmm,
      headerHeightMm,
      tableHeaderYmm,
      rowsStartYmm,
      availableRowsHeightMm,
    };
  };

  const rawPages: Array<{
    readonly isContinuation: boolean;
    readonly rows: A4PlacedScheduleRow[];
  }> = [];

  if (formattedRows.length === 0) {
    rawPages.push({ isContinuation: false, rows: [] });
  } else {
    let currentIsCont = false;
    let currentSlots = getPageGeometrySlots(false);
    let cursorY = currentSlots.rowsStartYmm;
    let currentRows: A4PlacedScheduleRow[] = [];

    for (const row of formattedRows) {
      const usedMm = cursorY - currentSlots.rowsStartYmm;
      if (currentRows.length > 0 && usedMm + row.heightMm > currentSlots.availableRowsHeightMm) {
        rawPages.push({ isContinuation: currentIsCont, rows: currentRows });
        currentIsCont = true;
        currentSlots = getPageGeometrySlots(true);
        cursorY = currentSlots.rowsStartYmm;
        currentRows = [];
      }

      currentRows.push(
        Object.freeze({
          ...row,
          yMm: Number(cursorY.toFixed(2)),
        })
      );
      cursorY = Number((cursorY + row.heightMm).toFixed(2));
    }

    if (currentRows.length > 0) {
      rawPages.push({ isContinuation: currentIsCont, rows: currentRows });
    }
  }

  const totalPages = rawPages.length;
  const pages: A4PageDisplayList[] = rawPages.map((rawPage, idx) => {
    const slots = getPageGeometrySlots(rawPage.isContinuation);
    return Object.freeze({
      pageNumber: idx + 1,
      totalPages,
      isContinuation: rawPage.isContinuation,
      headerYmm: slots.headerYmm,
      headerHeightMm: slots.headerHeightMm,
      tableHeaderYmm: slots.tableHeaderYmm,
      tableHeaderHeightMm,
      rowsStartYmm: slots.rowsStartYmm,
      availableRowsHeightMm: slots.availableRowsHeightMm,
      footerYmm,
      footerHeightMm,
      rows: Object.freeze(rawPage.rows),
    });
  });

  // Selo SHA-256 calculado estritamente sobre a projecao ja sanitizada/pseudonimizada (M1.5 / M4)
  const canonicalAuditPayload = JSON.stringify({
    v: 1,
    unitTitle,
    orientation,
    privacyMode,
    emittedAtIso,
    summary,
    signerLabel,
    signature: signature?.serialized ?? null,
    rows: projectedList,
  });
  const sha256Hex = sha256HexSync(canonicalAuditPayload);

  return Object.freeze({
    unitTitle,
    subtitle,
    orientation,
    privacyMode,
    emittedAtIso,
    emittedDisplayBr,
    dimensions,
    marginXMm,
    marginTopMm,
    marginBottomMm,
    contentWidthMm,
    columns,
    summary,
    signature,
    signerLabel,
    sha256Hex,
    pages: Object.freeze(pages),
  });
}

class PdfByteWriter {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  get byteLength(): number {
    return this.length;
  }

  writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.byteLength;
  }

  writeAscii(ascii: string): void {
    const buf = new Uint8Array(ascii.length);
    for (let i = 0; i < ascii.length; i += 1) {
      const code = ascii.charCodeAt(i);
      if (code > 0x7f) {
        throw new Error(
          `Violacao interna PdfByteWriter: caractere nao-ASCII (0x${code.toString(16)}) fora de escape octal.`
        );
      }
      buf[i] = code;
    }
    this.writeBytes(buf);
  }

  toUint8Array(): Uint8Array {
    const merged = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }
}

type RgbTriplet = readonly [number, number, number];

const PDF_COLORS = {
  headerBg: [0.059, 0.09, 0.165] as RgbTriplet, // #0F172A
  white: [1.0, 1.0, 1.0] as RgbTriplet, // #FFFFFF
  paperZebra: [0.976, 0.98, 0.988] as RgbTriplet, // #F8FAFC
  tableHeaderBg: [0.945, 0.961, 0.976] as RgbTriplet, // #F1F5F9
  slateBorder: [0.392, 0.455, 0.545] as RgbTriplet, // #64748B
  rowRule: [0.886, 0.91, 0.941] as RgbTriplet, // #E2E8F0
  inkDark: [0.059, 0.09, 0.165] as RgbTriplet, // #0F172A
  inkMuted: [0.216, 0.255, 0.318] as RgbTriplet, // #374151
  tealAccent: [0.0, 0.478, 0.471] as RgbTriplet, // #007A78
  lgpdBg: [0.937, 0.965, 1.0] as RgbTriplet, // #EFF6FF
  lgpdFg: [0.118, 0.227, 0.541] as RgbTriplet, // #1E3A8A
  status: {
    Presente: {
      bg: [0.82, 0.98, 0.898] as RgbTriplet, // #D1FAE5
      fg: [0.024, 0.373, 0.275] as RgbTriplet, // #065F46
      border: [0.02, 0.588, 0.412] as RgbTriplet, // #059669
    },
    Cobertura: {
      bg: [0.996, 0.953, 0.78] as RgbTriplet, // #FEF3C7
      fg: [0.573, 0.251, 0.055] as RgbTriplet, // #92400E
      border: [0.851, 0.467, 0.024] as RgbTriplet, // #D97706
    },
    Faltou: {
      bg: [0.996, 0.886, 0.886] as RgbTriplet, // #FEE2E2
      fg: [0.6, 0.106, 0.106] as RgbTriplet, // #991B1B
      border: [0.863, 0.149, 0.149] as RgbTriplet, // #DC2626
    },
    Folga: {
      bg: [0.945, 0.961, 0.976] as RgbTriplet, // #F1F5F9
      fg: [0.118, 0.161, 0.231] as RgbTriplet, // #1E293B
      border: [0.392, 0.455, 0.545] as RgbTriplet, // #64748B
    },
  },
} as const;

function fmtPt(val: number): string {
  return val.toFixed(2);
}

function fmtRgb(rgb: RgbTriplet): string {
  return `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)}`;
}

export interface PdfRectPt {
  readonly xPt: number;
  readonly yPt: number;
  readonly widthPt: number;
  readonly heightPt: number;
}

/**
 * Converte caixa top-left em milimetros para o operador retangular bottom-left `re`
 * do PDF 1.4 sem desvio vertical de +hMm (M1.4 / S16).
 */
export function rectMmToPdfPt(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  pageHeightMm: number
): PdfRectPt {
  return Object.freeze({
    xPt: Number((xMm * PT_PER_MM).toFixed(2)),
    yPt: Number(((pageHeightMm - yMm - heightMm) * PT_PER_MM).toFixed(2)),
    widthPt: Number((widthMm * PT_PER_MM).toFixed(2)),
    heightPt: Number((heightMm * PT_PER_MM).toFixed(2)),
  });
}

function renderPageContentStream(model: A4ScheduleDocumentModel, page: A4PageDisplayList): string {
  const pageH = model.dimensions.heightMm;
  const x0 = model.marginXMm;
  const w = model.contentWidthMm;
  const ops: string[] = [];

  const fillRectMm = (
    xMm: number,
    yMm: number,
    wMm: number,
    hMm: number,
    rgb: RgbTriplet
  ): void => {
    const r = rectMmToPdfPt(xMm, yMm, wMm, hMm, pageH);
    ops.push(
      `q ${fmtRgb(rgb)} rg ${fmtPt(r.xPt)} ${fmtPt(r.yPt)} ${fmtPt(r.widthPt)} ${fmtPt(r.heightPt)} re f Q`
    );
  };

  const strokeAndFillRectMm = (
    xMm: number,
    yMm: number,
    wMm: number,
    hMm: number,
    fillRgb: RgbTriplet,
    strokeRgb: RgbTriplet,
    lineWidthPt: number = 0.6
  ): void => {
    const r = rectMmToPdfPt(xMm, yMm, wMm, hMm, pageH);
    ops.push(
      `q ${fmtRgb(fillRgb)} rg ${fmtRgb(strokeRgb)} RG ${lineWidthPt.toFixed(2)} w ${fmtPt(r.xPt)} ${fmtPt(r.yPt)} ${fmtPt(r.widthPt)} ${fmtPt(r.heightPt)} re B Q`
    );
  };

  const drawHLineMm = (
    xStartMm: number,
    xEndMm: number,
    yMm: number,
    rgb: RgbTriplet,
    lineWidthPt: number = 0.5
  ): void => {
    const yPt = (pageH - yMm) * PT_PER_MM;
    ops.push(
      `q ${fmtRgb(rgb)} RG ${lineWidthPt.toFixed(2)} w ${fmtPt(xStartMm * PT_PER_MM)} ${fmtPt(yPt)} m ${fmtPt(xEndMm * PT_PER_MM)} ${fmtPt(yPt)} l S Q`
    );
  };

  const drawTextMm = (
    text: string,
    xMm: number,
    yBaselineMm: number,
    fontAlias: 'F1' | 'F2' | 'F3',
    fontSizePt: number,
    rgb: RgbTriplet
  ): void => {
    const xPt = xMm * PT_PER_MM;
    const yPt = (pageH - yBaselineMm) * PT_PER_MM;
    ops.push(
      `BT /${fontAlias} ${fmtPt(fontSizePt)} Tf ${fmtRgb(rgb)} rg 1 0 0 1 ${fmtPt(xPt)} ${fmtPt(yPt)} Tm ${encodePdfWinAnsiLiteral(text)} Tj ET`
    );
  };

  // 1. Cabecalho Institucional A4 (repetido em todas as paginas 1..N — S11)
  fillRectMm(x0, page.headerYmm, w, page.headerHeightMm, PDF_COLORS.headerBg);
  fillRectMm(x0, page.headerYmm, 2.2, page.headerHeightMm, PDF_COLORS.tealAccent);

  const pageIndicatorText = `Página ${page.pageNumber}/${page.totalPages}`;
  const headerLeftXMm = x0 + 5.0;
  const headerRightEdgeMm = x0 + w - 4.0;
  const lgpdBadgeW = 54.0;
  const lgpdBadgeX = headerRightEdgeMm - lgpdBadgeW;

  if (!page.isContinuation) {
    const emissionText = `Emissão: ${model.emittedDisplayBr}  •  ${pageIndicatorText}`;
    const emissionFontPt = 7.4;
    const emissionWidthMm = measureAfmWidthMm(emissionText, emissionFontPt, 'Helvetica');
    const emissionXMm = Math.max(x0 + w * 0.52, headerRightEdgeMm - emissionWidthMm);
    const titleMaxWidthMm = Math.max(40, emissionXMm - headerLeftXMm - 3.5);
    const titleFit = solveTextBoxAutoFit(model.unitTitle, titleMaxWidthMm, 5.2, {
      maxFontPt: 11.5,
      minFontPt: 6.5,
      font: 'Helvetica-Bold',
      maxLinesOverride: 1,
    });
    drawTextMm(
      titleFit.lines[0] ?? model.unitTitle,
      headerLeftXMm,
      page.headerYmm + 7.2,
      'F2',
      titleFit.fontSizePt,
      PDF_COLORS.white
    );
    drawTextMm(
      emissionText,
      emissionXMm,
      page.headerYmm + 7.2,
      'F1',
      emissionFontPt,
      PDF_COLORS.white
    );

    const subMaxWidthMm = Math.max(
      40,
      (model.privacyMode ? lgpdBadgeX - 3.5 : headerRightEdgeMm) - headerLeftXMm
    );
    const subtitleFit = solveTextBoxAutoFit(model.subtitle, subMaxWidthMm, 4.5, {
      maxFontPt: 7.8,
      minFontPt: 6.5,
      font: 'Helvetica',
      maxLinesOverride: 1,
    });
    drawTextMm(
      subtitleFit.lines[0] ?? model.subtitle,
      headerLeftXMm,
      page.headerYmm + 12.2,
      'F1',
      subtitleFit.fontSizePt,
      [0.82, 0.87, 0.93]
    );

    const kpiLine = `Total: ${model.summary.total}  |  Presentes: ${model.summary.presentes}  |  Coberturas: ${model.summary.coberturas}  |  Faltas: ${model.summary.faltas}  |  Folgas: ${model.summary.folgas}`;
    const kpiFit = solveTextBoxAutoFit(kpiLine, subMaxWidthMm, 4.5, {
      maxFontPt: 8.0,
      minFontPt: 6.5,
      font: 'Helvetica-Bold',
      maxLinesOverride: 1,
    });
    drawTextMm(
      kpiFit.lines[0] ?? kpiLine,
      headerLeftXMm,
      page.headerYmm + 18.8,
      'F2',
      kpiFit.fontSizePt,
      PDF_COLORS.white
    );

    if (model.privacyMode) {
      strokeAndFillRectMm(
        lgpdBadgeX,
        page.headerYmm + 13.6,
        lgpdBadgeW,
        6.8,
        PDF_COLORS.lgpdBg,
        PDF_COLORS.lgpdFg,
        0.6
      );
      const lgpdText = 'MODO MURAL PÚBLICO LGPD';
      const lgpdTextW = measureAfmWidthMm(lgpdText, 6.8, 'Helvetica-Bold');
      const lgpdTextX = lgpdBadgeX + Math.max(1.5, (lgpdBadgeW - lgpdTextW) / 2);
      drawTextMm(lgpdText, lgpdTextX, page.headerYmm + 18.2, 'F2', 6.8, PDF_COLORS.lgpdFg);
    }
  } else {
    const emissionText = `Emissão: ${model.emittedDisplayBr}  •  ${pageIndicatorText}`;
    const emissionFontPt = 7.2;
    const emissionWidthMm = measureAfmWidthMm(emissionText, emissionFontPt, 'Helvetica');
    const emissionXMm = Math.max(x0 + w * 0.52, headerRightEdgeMm - emissionWidthMm);
    const contTitleRaw = `${model.unitTitle} — FOLHA DE CONTINUAÇÃO`;
    const contTitleMaxWidthMm = Math.max(40, emissionXMm - headerLeftXMm - 3.5);
    const contTitleFit = solveTextBoxAutoFit(contTitleRaw, contTitleMaxWidthMm, 5.0, {
      maxFontPt: 9.0,
      minFontPt: 6.5,
      font: 'Helvetica-Bold',
      maxLinesOverride: 1,
    });
    drawTextMm(
      contTitleFit.lines[0] ?? contTitleRaw,
      headerLeftXMm,
      page.headerYmm + 6.8,
      'F2',
      contTitleFit.fontSizePt,
      PDF_COLORS.white
    );
    drawTextMm(
      emissionText,
      emissionXMm,
      page.headerYmm + 6.8,
      'F1',
      emissionFontPt,
      PDF_COLORS.white
    );

    const contSummaryRaw = `Total: ${model.summary.total} (Pres.: ${model.summary.presentes} | Cob.: ${model.summary.coberturas} | Faltas: ${model.summary.faltas} | Folgas: ${model.summary.folgas})`;
    const contSummaryMaxWidthMm = Math.max(
      40,
      (model.privacyMode ? lgpdBadgeX - 3.5 : headerRightEdgeMm) - headerLeftXMm
    );
    const contSummaryFit = solveTextBoxAutoFit(contSummaryRaw, contSummaryMaxWidthMm, 4.5, {
      maxFontPt: 7.5,
      minFontPt: 6.5,
      font: 'Helvetica',
      maxLinesOverride: 1,
    });
    drawTextMm(
      contSummaryFit.lines[0] ?? contSummaryRaw,
      headerLeftXMm,
      page.headerYmm + 14.6,
      'F1',
      contSummaryFit.fontSizePt,
      [0.85, 0.9, 0.95]
    );

    if (model.privacyMode) {
      strokeAndFillRectMm(
        lgpdBadgeX,
        page.headerYmm + 9.8,
        lgpdBadgeW,
        6.4,
        PDF_COLORS.lgpdBg,
        PDF_COLORS.lgpdFg,
        0.6
      );
      const lgpdText = 'MODO MURAL PÚBLICO LGPD';
      const lgpdTextW = measureAfmWidthMm(lgpdText, 6.6, 'Helvetica-Bold');
      const lgpdTextX = lgpdBadgeX + Math.max(1.5, (lgpdBadgeW - lgpdTextW) / 2);
      drawTextMm(lgpdText, lgpdTextX, page.headerYmm + 14.2, 'F2', 6.6, PDF_COLORS.lgpdFg);
    }
  }

  // 2. Cabecalho de colunas da tabela (repetido em 1..N — S11)
  strokeAndFillRectMm(
    x0,
    page.tableHeaderYmm,
    w,
    page.tableHeaderHeightMm,
    PDF_COLORS.tableHeaderBg,
    PDF_COLORS.slateBorder,
    0.6
  );

  for (const col of model.columns) {
    const colLabelFit = solveTextBoxAutoFit(col.label.toUpperCase(), col.widthMm - 2.4, 4.5, {
      maxFontPt: 7.2,
      minFontPt: 6.5,
      font: 'Helvetica-Bold',
      maxLinesOverride: 1,
    });
    drawTextMm(
      colLabelFit.lines[0] ?? col.label.toUpperCase(),
      col.xMm + 1.4,
      page.tableHeaderYmm + 4.9,
      'F2',
      colLabelFit.fontSizePt,
      PDF_COLORS.inkDark
    );
  }

  // 3. Linhas de Cuidadores (ou aviso explicito de escala vazia na Pagina 1/1)
  if (page.rows.length === 0) {
    strokeAndFillRectMm(
      x0,
      page.rowsStartYmm,
      w,
      12.0,
      PDF_COLORS.paperZebra,
      PDF_COLORS.rowRule,
      0.5
    );
    drawTextMm(
      'Nenhum profissional registrado na escala atual.',
      x0 + 5,
      page.rowsStartYmm + 7.2,
      'F1',
      8.5,
      PDF_COLORS.inkMuted
    );
  } else {
    const colId = model.columns[0]!;
    const colNome = model.columns[1]!;
    const colTurno = model.columns[2]!;
    const colQuarto = model.columns[3]!;
    const colStatus = model.columns[4]!;
    const colContato = model.columns[5]!;

    for (const row of page.rows) {
      if (row.index % 2 === 1) {
        fillRectMm(x0, row.yMm, w, row.heightMm, PDF_COLORS.paperZebra);
      }
      drawHLineMm(x0, x0 + w, row.yMm + row.heightMm, PDF_COLORS.rowRule, 0.45);

      const idBaseline = row.yMm + row.heightMm / 2 + 1.0;
      drawTextMm(row.idText, colId.xMm + 2.2, idBaseline, 'F3', 7.6, PDF_COLORS.inkMuted);

      const renderCellFit = (
        fit: AutoFitTextResult,
        cellXMm: number,
        fontAlias: 'F1' | 'F2',
        rgb: RgbTriplet
      ): void => {
        const blockTop = row.yMm + (row.heightMm - fit.totalTextHeightMm) / 2;
        for (let lineIdx = 0; lineIdx < fit.lines.length; lineIdx += 1) {
          const baselineMm = blockTop + (lineIdx + 0.82) * fit.lineHeightMm;
          drawTextMm(
            fit.lines[lineIdx]!,
            cellXMm + 1.6,
            baselineMm,
            fontAlias,
            fit.fontSizePt,
            rgb
          );
        }
      };

      renderCellFit(row.nomeFit, colNome.xMm, 'F2', PDF_COLORS.inkDark);
      renderCellFit(row.turnoFit, colTurno.xMm, 'F1', PDF_COLORS.inkMuted);
      renderCellFit(row.quartoFit, colQuarto.xMm, 'F1', PDF_COLORS.inkDark);
      renderCellFit(row.contatoFit, colContato.xMm, 'F1', PDF_COLORS.inkMuted);

      // Insignia vetorial de Situacao (WCAG 2.2 AA — M1 / S19)
      const statusPalette = PDF_COLORS.status[row.status];
      const badgeW = colStatus.widthMm - 3.6;
      const badgeH = 5.0;
      const badgeX = colStatus.xMm + 1.8;
      const badgeY = row.yMm + (row.heightMm - badgeH) / 2;
      strokeAndFillRectMm(
        badgeX,
        badgeY,
        badgeW,
        badgeH,
        statusPalette.bg,
        statusPalette.border,
        0.55
      );
      const labelWidthMm = measureAfmWidthMm(row.statusLabel, 6.8, 'Helvetica-Bold');
      const labelX = badgeX + Math.max(1.2, (badgeW - labelWidthMm) / 2);
      drawTextMm(row.statusLabel, labelX, badgeY + 3.55, 'F2', 6.8, statusPalette.fg);
    }
  }

  // 4. Rodape Institucional: Linha Fisica / Rubrica Vetorial sigv1 + Selo Criptografico SHA-256
  strokeAndFillRectMm(
    x0,
    page.footerYmm,
    w,
    page.footerHeightMm,
    PDF_COLORS.paperZebra,
    PDF_COLORS.slateBorder,
    0.55
  );

  const sigBoxWidthMm = Math.min(78, w * 0.42);
  const sigBoxXMm = x0 + 4;
  const sigBoxYMm = page.footerYmm + 1.8;
  const sigBoxHeightMm = 10.0;

  if (model.signature !== null) {
    ops.push(
      signatureToPdfPathOperators(
        model.signature,
        {
          xMm: sigBoxXMm,
          yMm: sigBoxYMm,
          widthMm: sigBoxWidthMm,
          heightMm: sigBoxHeightMm,
        },
        pageH,
        PDF_COLORS.inkDark,
        1.15
      )
    );
  }

  const sigLineY = page.footerYmm + 12.5;
  drawHLineMm(sigBoxXMm, sigBoxXMm + sigBoxWidthMm, sigLineY, PDF_COLORS.slateBorder, 0.65);
  const caption =
    model.signerLabel.length > 0
      ? `Coordenação / Responsável: ${model.signerLabel}`
      : 'Assinatura / Carimbo da Coordenação de Enfermagem';
  const captionFit = solveTextBoxAutoFit(caption, sigBoxWidthMm, 6.2, {
    maxFontPt: 6.8,
    minFontPt: 6.5,
    font: 'Helvetica-Bold',
    maxLinesOverride: 2,
  });
  for (let lineIdx = 0; lineIdx < captionFit.lines.length; lineIdx += 1) {
    drawTextMm(
      captionFit.lines[lineIdx]!,
      sigBoxXMm,
      page.footerYmm + 15.5 + lineIdx * 2.8,
      'F2',
      captionFit.fontSizePt,
      PDF_COLORS.inkDark
    );
  }
  drawTextMm(
    model.signature !== null ? 'Rubrica vetorial sigv1 registrada' : 'Espaço para rubrica física',
    sigBoxXMm,
    page.footerYmm + 21.5,
    'F1',
    6.5,
    PDF_COLORS.inkMuted
  );

  const auditX = sigBoxXMm + sigBoxWidthMm + 6;
  const auditMaxWidthMm = Math.max(40, x0 + w - auditX - 3.5);
  const auditHeadingFit = solveTextBoxAutoFit(
    `SELO DE INTEGRIDADE SHA-256 • ${pageIndicatorText}`,
    auditMaxWidthMm,
    4.2,
    {
      maxFontPt: 6.8,
      minFontPt: 6.5,
      font: 'Helvetica-Bold',
      maxLinesOverride: 1,
    }
  );
  drawTextMm(
    auditHeadingFit.lines[0] ?? `SELO DE INTEGRIDADE SHA-256 • ${pageIndicatorText}`,
    auditX,
    page.footerYmm + 6.4,
    'F2',
    auditHeadingFit.fontSizePt,
    PDF_COLORS.inkDark
  );
  drawTextMm(model.sha256Hex, auditX, page.footerYmm + 11.4, 'F3', 6.5, PDF_COLORS.inkMuted);
  const auditMetaRaw = `Emitido em ${model.emittedDisplayBr} • PDF 1.4 Vetorial ISO 32000-1 (100% Local-First)`;
  const auditMetaFit = solveTextBoxAutoFit(auditMetaRaw, auditMaxWidthMm, 4.2, {
    maxFontPt: 6.5,
    minFontPt: 6.5,
    font: 'Helvetica',
    maxLinesOverride: 1,
  });
  drawTextMm(
    auditMetaFit.lines[0] ?? auditMetaRaw,
    auditX,
    page.footerYmm + 16.6,
    'F1',
    auditMetaFit.fontSizePt,
    PDF_COLORS.inkMuted
  );

  return `${ops.join('\n')}\n`;
}

/**
 * Compila o A4ScheduleDocumentModel em bytes binarios %PDF-1.4 100% vetoriais (0 imagens raster,
 * /Encoding /WinAnsiEncoding explicito, offsets xref exatos de 20 bytes sem desvio UTF-8) (M1 / S01..S05).
 */
export function compileSchedulePdfBytes(model: A4ScheduleDocumentModel): Uint8Array {
  const writer = new PdfByteWriter();

  // Cabecalho PDF 1.4 + comentario binario de 4 bytes >= 0x80 (exatos 15 bytes em Uint8Array — M1.1 / S02)
  writer.writeBytes(
    new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
    ])
  );

  // Objetos fixos:
  // 1 = Catalog, 2 = Pages, 3 = Font Helvetica, 4 = Font Helvetica-Bold, 5 = Font Courier, 6 = Info
  // Para cada pagina idx (0..P-1): pageObjId = 7 + idx * 2, contentObjId = 8 + idx * 2
  const pageCount = model.pages.length;
  const totalObjects = 6 + pageCount * 2;
  const offsets = new Array<number>(totalObjects + 1).fill(0);

  const startObj = (id: number): void => {
    offsets[id] = writer.byteLength;
    writer.writeAscii(`${id} 0 obj\n`);
  };

  const endObj = (): void => {
    writer.writeAscii('endobj\n');
  };

  // 1: Catalog
  startObj(1);
  writer.writeAscii('<< /Type /Catalog /Pages 2 0 R /Lang (pt-BR) >>\n');
  endObj();

  // 2: Pages
  const kidsRefs = model.pages.map((_, idx) => `${7 + idx * 2} 0 R`).join(' ');
  startObj(2);
  writer.writeAscii(`<< /Type /Pages /Count ${pageCount} /Kids [ ${kidsRefs} ] >>\n`);
  endObj();

  // 3, 4, 5: Standard 14 Type1 Fonts com /Encoding /WinAnsiEncoding explicito (M1.2 / S03)
  startObj(3);
  writer.writeAscii(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n'
  );
  endObj();

  startObj(4);
  writer.writeAscii(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n'
  );
  endObj();

  startObj(5);
  writer.writeAscii(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\n'
  );
  endObj();

  // 6: Dicionario /Info blindado via encodePdfWinAnsiLiteral (M1.3 / S05)
  startObj(6);
  writer.writeAscii(
    [
      '<<',
      `  /Title ${encodePdfWinAnsiLiteral(model.unitTitle)}`,
      `  /Author ${encodePdfWinAnsiLiteral(model.signerLabel || 'Escala Elderly — Painel do Gerente')}`,
      `  /Subject ${encodePdfWinAnsiLiteral(`Escala A4 (${model.orientation}) SHA-256 ${model.sha256Hex.slice(0, 16)}`)}`,
      `  /Producer ${encodePdfWinAnsiLiteral('Escala Elderly ISO 32000-1 Vector Engine')}`,
      `  /CreationDate ${encodePdfWinAnsiLiteral(model.emittedAtIso)}`,
      '>>\n',
    ].join('\n')
  );
  endObj();

  // 7..N: Paginas e Streams Vetoriais
  const mediaBox = `[ 0 0 ${fmtPt(model.dimensions.widthPt)} ${fmtPt(model.dimensions.heightPt)} ]`;

  model.pages.forEach((page, idx) => {
    const pageObjId = 7 + idx * 2;
    const contentObjId = 8 + idx * 2;
    const streamAscii = renderPageContentStream(model, page);

    startObj(pageObjId);
    writer.writeAscii(
      [
        '<<',
        '  /Type /Page',
        '  /Parent 2 0 R',
        `  /MediaBox ${mediaBox}`,
        '  /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>',
        `  /Contents ${contentObjId} 0 R`,
        '>>\n',
      ].join('\n')
    );
    endObj();

    startObj(contentObjId);
    writer.writeAscii(`<< /Length ${streamAscii.length} >>\nstream\n`);
    writer.writeAscii(streamAscii);
    writer.writeAscii('endstream\n');
    endObj();
  });

  // Tabela xref com entradas estritas de 20 bytes ASCII ("nnnnnnnnnn 00000 n \n") (M1.1 / S01 / S02)
  const xrefOffset = writer.byteLength;
  writer.writeAscii(`xref\n0 ${totalObjects + 1}\n`);
  writer.writeAscii('0000000000 65535 f \n');
  for (let objId = 1; objId <= totalObjects; objId += 1) {
    const paddedOffset = String(offsets[objId]!).padStart(10, '0');
    writer.writeAscii(`${paddedOffset} 00000 n \n`);
  }

  writer.writeAscii(
    [
      'trailer',
      `<< /Size ${totalObjects + 1} /Root 1 0 R /Info 6 0 R >>`,
      'startxref',
      String(xrefOffset),
      '%%EOF\n',
    ].join('\n')
  );

  return writer.toUint8Array();
}
