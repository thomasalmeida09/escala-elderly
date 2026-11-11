export const SIGV1_PREFIX = 'sigv1:';
export const SIGV1_DEFAULT_WIDTH = 1000;
export const SIGV1_DEFAULT_HEIGHT = 300;
export const MAX_SIGV1_LENGTH = 4096;
export const MAX_SIGV1_STROKES = 32;
export const MAX_SIGV1_VERTICES = 512;
export const DEFAULT_RDP_EPSILON = 2.2;

const PT_PER_MM = 72 / 25.4;

export interface SignaturePoint {
  readonly x: number;
  readonly y: number;
}

export type SignaturePolyline = readonly SignaturePoint[];

export interface SignatureBoundingBox {
  readonly width: number;
  readonly height: number;
}

export interface PdfSignatureBoxMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface ParsedVectorSignature {
  readonly width: number;
  readonly height: number;
  readonly strokes: readonly SignaturePolyline[];
  readonly vertexCount: number;
  readonly serialized: string;
}

export class VectorSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorSignatureError';
    Object.setPrototypeOf(this, VectorSignatureError.prototype);
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return Math.round(value);
}

function perpendicularDistance(
  point: SignaturePoint,
  lineStart: SignaturePoint,
  lineEnd: SignaturePoint
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }
  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  return numerator / Math.hypot(dx, dy);
}

/**
 * Simplifica uma polilinha planar via algoritmo Ramer-Douglas-Peucker iterativo
 * (sem risco de estouro de pilha em traços longos).
 */
export function ramerDouglasPeucker(
  points: readonly SignaturePoint[],
  epsilon: number = DEFAULT_RDP_EPSILON
): SignaturePolyline {
  if (!Number.isFinite(epsilon) || epsilon < 0) {
    throw new VectorSignatureError('Epsilon RDP deve ser um numero finito nao-negativo.');
  }
  if (points.length <= 2) {
    return points.slice();
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<readonly [number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const startIdx = current[0];
    const endIdx = current[1];
    if (endIdx - startIdx <= 1) {
      continue;
    }

    const startPt = points[startIdx]!;
    const endPt = points[endIdx]!;
    let maxDist = -1;
    let splitIdx = -1;

    for (let idx = startIdx + 1; idx < endIdx; idx += 1) {
      const dist = perpendicularDistance(points[idx]!, startPt, endPt);
      if (dist > maxDist) {
        maxDist = dist;
        splitIdx = idx;
      }
    }

    if (maxDist > epsilon && splitIdx !== -1) {
      keep[splitIdx] = 1;
      stack.push([startIdx, splitIdx]);
      stack.push([splitIdx, endIdx]);
    }
  }

  const simplified: SignaturePoint[] = [];
  for (let idx = 0; idx < points.length; idx += 1) {
    if (keep[idx] === 1) {
      simplified.push(points[idx]!);
    }
  }
  return simplified;
}

export function serializeSigV1(
  width: number,
  height: number,
  strokes: readonly SignaturePolyline[]
): string {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 10 ||
    width > 4000 ||
    height < 10 ||
    height > 4000
  ) {
    throw new VectorSignatureError(
      'Caixa sigv1 invalida: dimensoes devem ser inteiras entre 10 e 4000.'
    );
  }
  if (strokes.length === 0) {
    throw new VectorSignatureError('Assinatura vetorial sigv1 deve conter ao menos um traco.');
  }
  if (strokes.length > MAX_SIGV1_STROKES) {
    throw new VectorSignatureError(
      `Assinatura vetorial excede o limite de ${MAX_SIGV1_STROKES} tracos.`
    );
  }

  let totalVertices = 0;
  const serializedStrokes: string[] = [];

  for (const stroke of strokes) {
    if (stroke.length < 2) {
      throw new VectorSignatureError('Cada traco sigv1 deve possuir ao menos 2 vertices.');
    }
    totalVertices += stroke.length;
    if (totalVertices > MAX_SIGV1_VERTICES) {
      throw new VectorSignatureError(
        `Assinatura vetorial excede o limite maximo de ${MAX_SIGV1_VERTICES} vertices.`
      );
    }

    const encodedPoints: string[] = [];
    for (const pt of stroke) {
      if (
        !Number.isSafeInteger(pt.x) ||
        !Number.isSafeInteger(pt.y) ||
        pt.x < 0 ||
        pt.x > width ||
        pt.y < 0 ||
        pt.y > height
      ) {
        throw new VectorSignatureError(
          'Coordenada sigv1 fora dos limites inteiros da caixa vetorial.'
        );
      }
      encodedPoints.push(`${pt.x},${pt.y}`);
    }
    serializedStrokes.push(encodedPoints.join(';'));
  }

  const result = `${SIGV1_PREFIX}${width}x${height}:${serializedStrokes.join('|')}`;
  if (result.length > MAX_SIGV1_LENGTH) {
    throw new VectorSignatureError(
      `Payload sigv1 excede o tamanho maximo seguro de ${MAX_SIGV1_LENGTH} caracteres.`
    );
  }
  return result;
}

export function parseSigV1(payload: string): ParsedVectorSignature {
  if (typeof payload !== 'string') {
    throw new VectorSignatureError('Payload sigv1 deve ser uma string valida.');
  }
  const trimmed = payload.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SIGV1_LENGTH) {
    throw new VectorSignatureError(
      `Payload sigv1 vazio ou acima do limite seguro de ${MAX_SIGV1_LENGTH} caracteres.`
    );
  }

  const headerMatch = /^sigv1:(\d{2,4})x(\d{2,4}):([0-9,;|]+)$/.exec(trimmed);
  if (!headerMatch) {
    throw new VectorSignatureError('Formato sigv1 invalido ou corrompido.');
  }

  const width = Number.parseInt(headerMatch[1]!, 10);
  const height = Number.parseInt(headerMatch[2]!, 10);
  if (width < 10 || width > 4000 || height < 10 || height > 4000) {
    throw new VectorSignatureError('Dimensoes da caixa sigv1 fora da faixa permitida (10..4000).');
  }

  const rawStrokes = headerMatch[3]!.split('|');
  if (rawStrokes.length === 0 || rawStrokes.length > MAX_SIGV1_STROKES) {
    throw new VectorSignatureError(
      `Quantidade de tracos sigv1 invalida (maximo ${MAX_SIGV1_STROKES}).`
    );
  }

  const parsedStrokes: SignaturePolyline[] = [];
  let vertexCount = 0;

  for (const rawStroke of rawStrokes) {
    if (rawStroke.length === 0) {
      throw new VectorSignatureError('Traco sigv1 vazio detectado.');
    }
    const rawPoints = rawStroke.split(';');
    if (rawPoints.length < 2) {
      throw new VectorSignatureError('Cada traco sigv1 deve conter no minimo 2 pontos.');
    }

    const points: SignaturePoint[] = [];
    for (const rawPoint of rawPoints) {
      const parts = rawPoint.split(',');
      if (parts.length !== 2 || parts[0]!.length === 0 || parts[1]!.length === 0) {
        throw new VectorSignatureError('Ponto sigv1 malformado.');
      }
      const x = Number.parseInt(parts[0]!, 10);
      const y = Number.parseInt(parts[1]!, 10);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        throw new VectorSignatureError('Coordenada sigv1 nao numerica.');
      }
      if (x < 0 || x > width || y < 0 || y > height) {
        throw new VectorSignatureError('Coordenada sigv1 excede a caixa declarada.');
      }
      vertexCount += 1;
      if (vertexCount > MAX_SIGV1_VERTICES) {
        throw new VectorSignatureError(
          `Assinatura sigv1 excede o limite de ${MAX_SIGV1_VERTICES} vertices.`
        );
      }
      points.push(Object.freeze({ x, y }));
    }
    parsedStrokes.push(Object.freeze(points));
  }

  const canonical = serializeSigV1(width, height, parsedStrokes);
  return Object.freeze({
    width,
    height,
    strokes: Object.freeze(parsedStrokes),
    vertexCount,
    serialized: canonical,
  });
}

export function simplifySignatureStrokes(
  rawStrokes: readonly SignaturePolyline[],
  sourceBox: SignatureBoundingBox,
  targetBox: SignatureBoundingBox = {
    width: SIGV1_DEFAULT_WIDTH,
    height: SIGV1_DEFAULT_HEIGHT,
  },
  epsilon: number = DEFAULT_RDP_EPSILON
): ParsedVectorSignature | null {
  if (
    !Number.isFinite(sourceBox.width) ||
    !Number.isFinite(sourceBox.height) ||
    sourceBox.width <= 0 ||
    sourceBox.height <= 0
  ) {
    throw new VectorSignatureError('sourceBox deve ter largura e altura positivas finitas.');
  }

  const targetWidth = Math.round(targetBox.width);
  const targetHeight = Math.round(targetBox.height);
  const scaleX = targetWidth / sourceBox.width;
  const scaleY = targetHeight / sourceBox.height;

  const normalizedStrokes: SignaturePolyline[] = [];
  let totalVertices = 0;

  for (const stroke of rawStrokes) {
    if (normalizedStrokes.length >= MAX_SIGV1_STROKES) {
      break;
    }
    const projected: SignaturePoint[] = [];
    for (const pt of stroke) {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        throw new VectorSignatureError('Coordenadas de entrada da assinatura devem ser finitas.');
      }
      const nx = clampInt(pt.x * scaleX, 0, targetWidth);
      const ny = clampInt(pt.y * scaleY, 0, targetHeight);
      const prev = projected[projected.length - 1];
      if (!prev || prev.x !== nx || prev.y !== ny) {
        projected.push({ x: nx, y: ny });
      }
    }

    if (projected.length === 0) {
      continue;
    }

    let simplified: SignaturePoint[];
    if (projected.length === 1) {
      const dot = projected[0]!;
      const dotEnd: SignaturePoint = {
        x: dot.x < targetWidth ? dot.x + 1 : dot.x - 1,
        y: dot.y,
      };
      simplified = [dot, dotEnd];
    } else {
      simplified = [...ramerDouglasPeucker(projected, epsilon)];
    }

    if (totalVertices + simplified.length > MAX_SIGV1_VERTICES) {
      const remaining = MAX_SIGV1_VERTICES - totalVertices;
      if (remaining < 2) {
        break;
      }
      simplified = simplified.slice(0, remaining);
    }

    const frozenStroke = Object.freeze(simplified.map((pt) => Object.freeze({ x: pt.x, y: pt.y })));
    normalizedStrokes.push(frozenStroke);
    totalVertices += frozenStroke.length;
  }

  if (normalizedStrokes.length === 0) {
    return null;
  }

  const serialized = serializeSigV1(targetWidth, targetHeight, normalizedStrokes);
  return Object.freeze({
    width: targetWidth,
    height: targetHeight,
    strokes: Object.freeze(normalizedStrokes),
    vertexCount: totalVertices,
    serialized,
  });
}

export function signatureToSvgPathData(signature: ParsedVectorSignature): string {
  const commands: string[] = [];
  for (const stroke of signature.strokes) {
    if (stroke.length < 2) {
      continue;
    }
    const first = stroke[0]!;
    commands.push(`M ${first.x} ${first.y}`);
    for (let idx = 1; idx < stroke.length; idx += 1) {
      const pt = stroke[idx]!;
      commands.push(`L ${pt.x} ${pt.y}`);
    }
  }
  return commands.join(' ');
}

function fmtPdfCoord(value: number): string {
  return value.toFixed(2);
}

/**
 * Converte polilinhas sigv1 (origem top-left py=0 no topo da caixa) em operadores
 * vetoriais PDF 1.4 (m, l, S) no espaco bottom-left da folha sem espelhar a rubrica (M1.4 / S15).
 */
export function signatureToPdfPathOperators(
  signature: ParsedVectorSignature,
  boxMm: PdfSignatureBoxMm,
  pageHeightMm: number,
  strokeRgb: readonly [number, number, number] = [0.059, 0.09, 0.165],
  lineWidthPt: number = 1.15
): string {
  const lines: string[] = [
    `q ${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG ${lineWidthPt.toFixed(2)} w 1 J 1 j`,
  ];

  for (const stroke of signature.strokes) {
    if (stroke.length < 2) {
      continue;
    }
    const first = stroke[0]!;
    const firstXMm = boxMm.xMm + (first.x / signature.width) * boxMm.widthMm;
    const firstYMm = boxMm.yMm + (first.y / signature.height) * boxMm.heightMm;
    const firstXPt = firstXMm * PT_PER_MM;
    const firstYPt = (pageHeightMm - firstYMm) * PT_PER_MM;
    lines.push(`${fmtPdfCoord(firstXPt)} ${fmtPdfCoord(firstYPt)} m`);

    for (let idx = 1; idx < stroke.length; idx += 1) {
      const pt = stroke[idx]!;
      const xMm = boxMm.xMm + (pt.x / signature.width) * boxMm.widthMm;
      const yMm = boxMm.yMm + (pt.y / signature.height) * boxMm.heightMm;
      const xPt = xMm * PT_PER_MM;
      const yPt = (pageHeightMm - yMm) * PT_PER_MM;
      lines.push(`${fmtPdfCoord(xPt)} ${fmtPdfCoord(yPt)} l`);
    }
  }

  lines.push('S Q');
  return lines.join('\n');
}

const CALLIGRAPHIC_GLYPHS: Readonly<Record<string, readonly (readonly [number, number])[][]>> = {
  A: [
    [
      [0, 100],
      [42, 6],
      [78, 100],
    ],
    [
      [14, 62],
      [72, 54],
    ],
  ],
  B: [
    [
      [8, 8],
      [8, 100],
    ],
    [
      [8, 10],
      [62, 12],
      [68, 34],
      [54, 52],
      [10, 52],
      [66, 56],
      [74, 80],
      [56, 98],
      [8, 98],
    ],
  ],
  C: [
    [
      [74, 22],
      [52, 6],
      [20, 18],
      [8, 54],
      [22, 90],
      [56, 98],
      [78, 84],
    ],
  ],
  D: [
    [
      [10, 8],
      [10, 98],
    ],
    [
      [10, 8],
      [56, 14],
      [76, 52],
      [54, 92],
      [10, 98],
    ],
  ],
  E: [
    [
      [70, 10],
      [12, 12],
      [10, 96],
      [72, 94],
    ],
    [
      [12, 52],
      [56, 50],
    ],
  ],
  F: [
    [
      [70, 10],
      [12, 12],
      [10, 98],
    ],
    [
      [12, 52],
      [56, 50],
    ],
  ],
  G: [
    [
      [72, 20],
      [46, 6],
      [16, 22],
      [8, 56],
      [22, 92],
      [60, 96],
      [74, 64],
      [44, 62],
    ],
  ],
  H: [
    [
      [10, 8],
      [8, 98],
    ],
    [
      [70, 8],
      [68, 98],
    ],
    [
      [10, 52],
      [68, 50],
    ],
  ],
  I: [
    [
      [22, 10],
      [58, 10],
    ],
    [
      [40, 10],
      [38, 98],
    ],
    [
      [20, 98],
      [58, 98],
    ],
  ],
  J: [
    [
      [24, 10],
      [70, 10],
    ],
    [
      [52, 10],
      [50, 78],
      [34, 98],
      [12, 86],
    ],
  ],
  K: [
    [
      [12, 8],
      [10, 98],
    ],
    [
      [68, 10],
      [12, 54],
      [72, 98],
    ],
  ],
  L: [
    [
      [14, 8],
      [10, 96],
      [72, 94],
    ],
  ],
  M: [
    [
      [6, 98],
      [16, 10],
      [42, 62],
      [70, 10],
      [78, 98],
    ],
  ],
  N: [
    [
      [10, 98],
      [14, 10],
      [68, 96],
      [72, 8],
    ],
  ],
  O: [
    [
      [42, 8],
      [14, 24],
      [8, 56],
      [20, 90],
      [52, 96],
      [74, 72],
      [70, 30],
      [42, 8],
    ],
  ],
  P: [
    [
      [12, 98],
      [14, 10],
      [60, 12],
      [72, 34],
      [56, 54],
      [14, 54],
    ],
  ],
  Q: [
    [
      [42, 8],
      [14, 24],
      [8, 56],
      [20, 90],
      [52, 96],
      [74, 72],
      [70, 30],
      [42, 8],
    ],
    [
      [48, 72],
      [78, 100],
    ],
  ],
  R: [
    [
      [12, 98],
      [14, 10],
      [60, 12],
      [72, 34],
      [54, 52],
      [14, 52],
      [72, 98],
    ],
  ],
  S: [
    [
      [70, 20],
      [44, 8],
      [16, 20],
      [18, 42],
      [64, 60],
      [68, 84],
      [40, 98],
      [10, 86],
    ],
  ],
  T: [
    [
      [8, 12],
      [76, 10],
    ],
    [
      [42, 12],
      [38, 98],
    ],
  ],
  U: [
    [
      [12, 10],
      [14, 76],
      [38, 96],
      [64, 78],
      [68, 10],
    ],
  ],
  V: [
    [
      [8, 10],
      [40, 98],
      [74, 10],
    ],
  ],
  W: [
    [
      [6, 10],
      [22, 96],
      [42, 42],
      [60, 96],
      [78, 10],
    ],
  ],
  X: [
    [
      [10, 10],
      [72, 98],
    ],
    [
      [72, 10],
      [10, 98],
    ],
  ],
  Y: [
    [
      [10, 10],
      [42, 52],
      [74, 10],
    ],
    [
      [42, 52],
      [40, 98],
    ],
  ],
  Z: [
    [
      [10, 12],
      [72, 10],
      [12, 96],
      [74, 94],
    ],
  ],
};

/**
 * Alternativa 100% acessivel por teclado (WCAG 2.1.1 / M6.1): sintetiza uma rubrica
 * caligrafica vetorial deterministica no protocolo sigv1 a partir das iniciais do responsavel.
 */
export function synthesizeKeyboardVectorSignature(
  signerName: string
): ParsedVectorSignature | null {
  const cleaned = signerName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  const words = cleaned
    .split(/[^A-Z]+/)
    .filter((token) => token.length > 0 && !['DA', 'DE', 'DO', 'DAS', 'DOS', 'E'].includes(token));

  if (words.length === 0) {
    return null;
  }

  const initials = words.slice(0, 3).map((word) => word[0]!);
  const rawStrokes: SignaturePoint[][] = [];
  const startX = 150;
  const glyphAdvance = 135;
  const topY = 48;
  const glyphScaleY = 1.45;
  const slant = -0.18;

  initials.forEach((letter, letterIdx) => {
    const template = CALLIGRAPHIC_GLYPHS[letter] ?? CALLIGRAPHIC_GLYPHS.A!;
    const offsetX = startX + letterIdx * glyphAdvance;

    for (const seg of template) {
      const stroke: SignaturePoint[] = seg.map(([gx, gy]) => ({
        x: offsetX + gx * 1.15 + (100 - gy) * slant,
        y: topY + gy * glyphScaleY,
      }));
      rawStrokes.push(stroke);
    }
  });

  const flourishEndX = startX + initials.length * glyphAdvance + 180;
  rawStrokes.push([
    { x: startX - 36, y: 232 },
    { x: startX + 90, y: 214 },
    { x: flourishEndX - 80, y: 206 },
    { x: flourishEndX, y: 220 },
    { x: flourishEndX - 42, y: 242 },
  ]);

  return simplifySignatureStrokes(
    rawStrokes,
    { width: SIGV1_DEFAULT_WIDTH, height: SIGV1_DEFAULT_HEIGHT },
    { width: SIGV1_DEFAULT_WIDTH, height: SIGV1_DEFAULT_HEIGHT },
    1.0
  );
}
