import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AUTOFIT_WIDTH_SAFETY_FACTOR,
  MAX_AUTOFIT_ITERATIONS,
  MIN_AUTOFIT_FONT_PT,
  PT_PER_MM,
  applyRuntimePageGeometry,
  buildA4ScheduleDocumentModel,
  buildPdfFilename,
  compileSchedulePdfBytes,
  computeOpticalSheetScale,
  decodePdfWinAnsiLiteral,
  encodePdfWinAnsiLiteral,
  formatCaregiverForSchedule,
  getA4PageDimensions,
  maskPersonNameLgpd,
  measureAfmWidthMm,
  rectMmToPdfPt,
  sanitizeWinAnsiText,
  sha256HexSync,
  solveTextBoxAutoFit,
} from '../src/services/a4PdfScheduleEngine';
import { getCanonicalSeed } from '../src/services/localFirstStore';
import {
  MAX_SIGV1_LENGTH,
  MAX_SIGV1_STROKES,
  MAX_SIGV1_VERTICES,
  VectorSignatureError,
  parseSigV1,
  ramerDouglasPeucker,
  serializeSigV1,
  signatureToPdfPathOperators,
  signatureToSvgPathData,
  simplifySignatureStrokes,
  synthesizeKeyboardVectorSignature,
} from '../src/services/vectorSignatureProtocol';
import { type Cuidador, type StatusCuidador, parseCuidador } from '../src/types/caregiver';

function asciiSlice(bytes: Uint8Array, start: number, end?: number): string {
  const sub = bytes.subarray(start, end);
  let out = '';
  for (let i = 0; i < sub.length; i += 1) {
    out += String.fromCharCode(sub[i]!);
  }
  return out;
}

function extractAllDecodedPdfTextStrings(pdfBytes: Uint8Array): string[] {
  const latin1 = asciiSlice(pdfBytes, 0);
  const decoded: string[] = [];
  let idx = 0;

  while (idx < latin1.length) {
    if (latin1[idx] !== '(') {
      idx += 1;
      continue;
    }
    const start = idx;
    let depth = 0;
    let escaped = false;
    while (idx < latin1.length) {
      const ch = latin1[idx]!;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          idx += 1;
          break;
        }
      }
      idx += 1;
    }
    expect(depth, 'Unbalanced parenthesis detected in PDF literal string').toBe(0);
    const literal = latin1.slice(start, idx);
    decoded.push(decodePdfWinAnsiLiteral(literal));
  }

  return decoded;
}

function buildSyntheticRoster(count: number): Cuidador[] {
  const statuses: readonly StatusCuidador[] = ['Presente', 'Cobertura', 'Faltou', 'Folga'];
  const names = [
    'Ana Souza',
    'João da Conceição',
    'Carlos Rocha',
    'Mariana das Dores',
    'Beatriz Alves',
    'Lucas de Oliveira',
    'Helena Prado',
    'Rafael dos Santos',
  ];

  const rows: Cuidador[] = [];
  for (let i = 0; i < count; i += 1) {
    const status = statuses[i % statuses.length]!;
    const suffix = String((i % 89) + 10).padStart(2, '0');
    rows.push(
      parseCuidador({
        id: i + 1,
        nome: `${names[i % names.length]!} ${i + 1}`,
        status,
        turno: i % 2 === 0 ? 'Diurno (07h–19h)' : 'Noturno (19h–07h)',
        quarto: `Quarto ${String((i % 24) + 1).padStart(2, '0')} • Ala Sul`,
        telefone: `+55 11 90000-01${suffix}`,
        horasDescanso: 12 + (i % 16),
        ...(status === 'Cobertura' ? { substituto: 'Beatriz Alves' } : {}),
      })
    );
  }
  return rows;
}

describe('FE #4 — ISO 32000-1 Deterministic A4 Vector PDF Engine & sigv1 Signature Protocol', () => {
  it('1. compiles a 100% vector %PDF-1.4 binary with exact 15-byte header, /WinAnsiEncoding on all 3 Type1 fonts, exact 20-byte xref entries, and zero UTF-8 offset drift (S01, S02, S03)', () => {
    const roster = getCanonicalSeed();
    const signature = synthesizeKeyboardVectorSignature('Dra. Helena Prado');
    expect(signature).not.toBeNull();

    const portraitModel = buildA4ScheduleDocumentModel(roster, {
      orientation: 'portrait',
      emittedAtIso: '2026-11-11T03:00:00.000Z',
      signaturePayload: signature!.serialized,
      signerLabel: 'Dra. Helena Prado — COREN-SP 000100',
    });
    const pdfBytes = compileSchedulePdfBytes(portraitModel);

    // Exact 15-byte binary header (%PDF-1.4\n%âãÏÓ\n)
    expect(Array.from(pdfBytes.subarray(0, 15))).toEqual([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
    ]);
    // Every byte after byte 14 MUST be pure 7-bit ASCII (<= 0x7F)
    for (let i = 15; i < pdfBytes.length; i += 1) {
      expect(pdfBytes[i]!).toBeLessThanOrEqual(0x7f);
    }

    const rawPdfAscii = asciiSlice(pdfBytes, 15);
    expect(rawPdfAscii.endsWith('%%EOF\n')).toBe(true);
    expect(rawPdfAscii).not.toContain('/Subtype /Image');
    expect(rawPdfAscii).not.toContain('/DCTDecode');
    expect(rawPdfAscii).not.toContain('/FlateDecode');
    expect(rawPdfAscii).toContain('/MediaBox [ 0 0 595.28 841.89 ]');

    // S03: All 3 font dictionaries explicitly declare /Encoding /WinAnsiEncoding
    const fontObjects = [...rawPdfAscii.matchAll(/<<\s*\/Type\s+\/Font[\s\S]*?>>/g)].map(
      (m) => m[0]
    );
    expect(fontObjects).toHaveLength(3);
    for (const fontDict of fontObjects) {
      expect(fontDict).toContain('/Encoding /WinAnsiEncoding');
    }

    // S01 & S02: Parse startxref, verify exact byte offset of "xref\n", verify every xref row is 20 bytes,
    // and verify every in-use object offset points to the exact "<id> 0 obj\n" byte in Uint8Array!
    const fullLatin1 = asciiSlice(pdfBytes, 0);
    const startXrefMatch = /startxref\n(\d+)\n%%EOF\n$/.exec(fullLatin1);
    expect(startXrefMatch).not.toBeNull();
    const xrefStartByte = Number.parseInt(startXrefMatch![1]!, 10);
    expect(asciiSlice(pdfBytes, xrefStartByte, xrefStartByte + 5)).toBe('xref\n');

    const xrefSection = asciiSlice(pdfBytes, xrefStartByte);
    const trailerSplit = xrefSection.split('trailer\n');
    expect(trailerSplit.length).toBe(2);

    const xrefLines = trailerSplit[0]!.split('\n').slice(2, -1);
    expect(xrefLines.length).toBe(9); // 0 (free) + 6 fixed + 2 page/stream objects

    // Entry 0: free head entry must be exact 20 bytes including '\n'
    expect(`${xrefLines[0]!}\n`.length).toBe(20);
    expect(xrefLines[0]).toBe('0000000000 65535 f ');

    for (let objId = 1; objId < xrefLines.length; objId += 1) {
      const entryWithLf = `${xrefLines[objId]!}\n`;
      expect(entryWithLf.length).toBe(20);
      expect(entryWithLf).toMatch(/^\d{10} 00000 n \n$/);

      const byteOffset = Number.parseInt(entryWithLf.slice(0, 10), 10);
      const expectedHeader = `${objId} 0 obj\n`;
      expect(asciiSlice(pdfBytes, byteOffset, byteOffset + expectedHeader.length)).toBe(
        expectedHeader
      );
    }

    // Landscape MediaBox check (841.89 x 595.28 pt)
    const landscapeModel = buildA4ScheduleDocumentModel(roster, {
      orientation: 'landscape',
      emittedAtIso: '2026-11-11T03:00:00.000Z',
    });
    const landscapeAscii = asciiSlice(compileSchedulePdfBytes(landscapeModel), 15);
    expect(landscapeAscii).toContain('/MediaBox [ 0 0 841.89 595.28 ]');
  });

  it('2. preserves 100% lossless PT-BR diacritics & CP1252 0x80..0x9F typography across NFC/NFD and neutralizes PostScript operator injection in /Contents & /Info (S04, S05)', () => {
    const canonicalPtBr =
      'João da Conceição – Noturno (19h—07h) • 1º Plantão • € 150 … “Água & Ânimo”';
    const macOsNfd = canonicalPtBr.normalize('NFD');
    expect(macOsNfd).not.toBe(canonicalPtBr);

    const encodedFromNfc = encodePdfWinAnsiLiteral(canonicalPtBr);
    const encodedFromNfd = encodePdfWinAnsiLiteral(macOsNfd);
    expect(encodedFromNfd).toBe(encodedFromNfc);

    // Every byte >= 0x80 must be encoded as 3-digit octal \ddd
    expect(encodedFromNfc).toContain('\\343'); // ã (0xE3)
    expect(encodedFromNfc).toContain('\\347'); // ç (0xE7)
    expect(encodedFromNfc).toContain('\\226'); // – en-dash (0x96)
    expect(encodedFromNfc).toContain('\\227'); // — em-dash (0x97)
    expect(encodedFromNfc).toContain('\\225'); // • bullet (0x95)
    expect(encodedFromNfc).toContain('\\272'); // º masculine ordinal (0xBA)
    expect(decodePdfWinAnsiLiteral(encodedFromNfc)).toBe(canonicalPtBr);

    // S05: Malicious PostScript operator injection in caregiver fields AND unitTitle / signerLabel (/Info)
    const hostileCaregiver = parseCuidador({
      id: 1,
      nome: 'Ana ) ET q 0 0 0 rg 0 0 595 842 re f ( \u202E🏥',
      status: 'Cobertura',
      turno: 'Noturno \\(19h-07h\\)\r\nBT',
      quarto: 'Quarto (03) \\ Ala "B"',
      telefone: '+55 11 90000-0101',
      substituto: 'Beatriz ) Tj ET ( Alves',
    });

    const hostileModel = buildA4ScheduleDocumentModel([hostileCaregiver], {
      unitTitle: 'Unidade ) >> endobj ( Central 👩‍⚕️',
      signerLabel: 'Coord. ) >> trailer ( Silva \\ COREN',
      emittedAtIso: '2026-11-11T03:00:00.000Z',
    });
    const pdfBytes = compileSchedulePdfBytes(hostileModel);
    const decodedStrings = extractAllDecodedPdfTextStrings(pdfBytes);

    // Bidi override (\u202E) and unsupported SMP emojis stripped cleanly; parens & backslashes escaped without breaking syntax
    expect(sanitizeWinAnsiText('Ana \u202E🏥 Souza')).toBe('Ana Souza');
    expect(decodedStrings.some((s) => s.includes('Unidade ) >> endobj ( Central'))).toBe(true);
    expect(decodedStrings.some((s) => s.includes('Coord. ) >> trailer ( Silva \\ COREN'))).toBe(
      true
    );
  });

  it('3. guarantees bit-for-bit FIPS 180-4 sha256HexSync parity with node:crypto and deterministic PDF repeatability (S06)', () => {
    const vectors = [
      '',
      'abc',
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      'Escala Elderly — João da Conceição • Plantão 12x36 • Quarto 03 (2026-11-11)'.repeat(4),
    ];

    for (const vector of vectors) {
      const expected = createHash('sha256').update(vector, 'utf8').digest('hex');
      expect(sha256HexSync(vector)).toBe(expected);
    }

    const roster = getCanonicalSeed();
    const fixedIso = '2026-11-11T04:15:00.000Z';
    const modelA = buildA4ScheduleDocumentModel(roster, { emittedAtIso: fixedIso });
    const modelB = buildA4ScheduleDocumentModel(roster, { emittedAtIso: fixedIso });

    expect(modelA.sha256Hex).toHaveLength(64);
    expect(modelA.sha256Hex).toBe(modelB.sha256Hex);
    expect(compileSchedulePdfBytes(modelA)).toEqual(compileSchedulePdfBytes(modelB));

    // Mutating a single status changes the cryptographic SHA-256 seal
    const mutatedRoster = roster.map((c) => (c.id === 3 ? { ...c, status: 'Faltou' as const } : c));
    const modelMutated = buildA4ScheduleDocumentModel(mutatedRoster, { emittedAtIso: fixedIso });
    expect(modelMutated.sha256Hex).not.toBe(modelA.sha256Hex);
  });

  it('4. enforces AFM text auto-fit fast-path, <= 12 binary search iterations, 6.5pt floor, and 0.94 width safety on 180-char unbroken tokens (S07, S08)', () => {
    // Fast-path: normal name fits at maxFontPt with 0 binary search iterations
    const fast = solveTextBoxAutoFit('Ana Souza', 42, 9.2, {
      maxFontPt: 8.5,
      font: 'Helvetica-Bold',
      maxLinesOverride: 2,
    });
    expect(fast.iterations).toBe(0);
    expect(fast.fontSizePt).toBe(8.5);
    expect(fast.truncated).toBe(false);

    // Medium-long name triggers bounded binary search above 6.5pt floor
    const medium = solveTextBoxAutoFit(
      'Maria Auxiliadora Albuquerque de Bragança e Bourbon',
      32,
      9.2,
      {
        maxFontPt: 9.0,
        font: 'Helvetica-Bold',
        maxLinesOverride: 2,
      }
    );
    expect(medium.iterations).toBeLessThanOrEqual(MAX_AUTOFIT_ITERATIONS);
    expect(medium.fontSizePt).toBeGreaterThanOrEqual(MIN_AUTOFIT_FONT_PT);

    // S07 & S08: Pathological 180-char unbroken string hits 6.5pt floor in <= 12 iterations,
    // wraps/truncates cleanly with ellipsis, and every line obeys widthMm * 0.94
    const unbroken180 = 'SupercalifragilisticexpialidociousPlantaoGeriatrico'
      .repeat(4)
      .slice(0, 180);
    const boxWidthMm = 38;
    const clamped = solveTextBoxAutoFit(unbroken180, boxWidthMm, 9.2, {
      maxFontPt: 8.5,
      font: 'Helvetica',
      maxLinesOverride: 2,
    });

    expect(clamped.iterations).toBeLessThanOrEqual(MAX_AUTOFIT_ITERATIONS);
    expect(clamped.fontSizePt).toBe(MIN_AUTOFIT_FONT_PT);
    expect(clamped.truncated).toBe(true);
    expect(clamped.lines.length).toBeLessThanOrEqual(2);
    expect(clamped.lines[clamped.lines.length - 1]!.endsWith('...')).toBe(true);

    for (const line of clamped.lines) {
      const lineWidthMm = measureAfmWidthMm(line, clamped.fontSizePt, 'Helvetica');
      expect(lineWidthMm).toBeLessThanOrEqual(boxWidthMm * AUTOFIT_WIDTH_SAFETY_FACTOR + 0.01);
      expect(lineWidthMm).toBeLessThan(boxWidthMm);
    }
  });

  it('5. guarantees dynamic Euclidean pagination across 0..100 caregivers in Portrait & Landscape with 0 phantom pages, repeated headers, and < 25ms compile SLA (S09, S10, S11)', () => {
    const testCounts = [0, 1, 4, 17, 26, 35, 52, 100];

    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const count of testCounts) {
        const roster = buildSyntheticRoster(count);
        const model = buildA4ScheduleDocumentModel(roster, {
          orientation,
          emittedAtIso: '2026-11-11T03:00:00.000Z',
        });

        expect(model.pages.length).toBeGreaterThanOrEqual(1);
        expect(model.summary.total).toBe(count);
        expect(
          model.summary.presentes +
            model.summary.coberturas +
            model.summary.faltas +
            model.summary.folgas
        ).toBe(count);

        let placedRowsTotal = 0;
        for (let pIdx = 0; pIdx < model.pages.length; pIdx += 1) {
          const page = model.pages[pIdx]!;
          expect(page.pageNumber).toBe(pIdx + 1);
          expect(page.totalPages).toBe(model.pages.length);
          expect(page.isContinuation).toBe(pIdx > 0);

          if (count === 0) {
            expect(model.pages).toHaveLength(1);
            expect(page.rows).toHaveLength(0);
          } else {
            // S09: ZERO empty trailing phantom pages when count > 0
            expect(page.rows.length).toBeGreaterThan(0);

            // S10: Last row on page never invades footerYmm (minimum 2mm safety gap)
            const lastRow = page.rows[page.rows.length - 1]!;
            expect(lastRow.yMm + lastRow.heightMm).toBeLessThanOrEqual(page.footerYmm - 1.95);
          }
          placedRowsTotal += page.rows.length;
        }
        expect(placedRowsTotal).toBe(count);

        // S11: Multi-page PDF streams repeat header, column headers, and "Página k/N" on every page
        if (model.pages.length > 1) {
          const pdfBytes = compileSchedulePdfBytes(model);
          const allStrings = extractAllDecodedPdfTextStrings(pdfBytes);
          for (let pageNo = 1; pageNo <= model.pages.length; pageNo += 1) {
            const token = `Página ${pageNo}/${model.pages.length}`;
            expect(allStrings.some((s) => s.includes(token))).toBe(true);
          }
          expect(allStrings.some((s) => s.includes('FOLHA DE CONTINUAÇÃO'))).toBe(true);
        }
      }
    }

    // Landscape has shorter vertical availableRowsHeightMm than Portrait, fitting fewer rows on Page 1
    // and requiring strictly more pages on larger schedules (e.g., 100 rows)
    const roster35 = buildSyntheticRoster(35);
    const portrait35 = buildA4ScheduleDocumentModel(roster35, {
      orientation: 'portrait',
      emittedAtIso: '2026-11-11T03:00:00.000Z',
    });
    const landscape35 = buildA4ScheduleDocumentModel(roster35, {
      orientation: 'landscape',
      emittedAtIso: '2026-11-11T03:00:00.000Z',
    });
    expect(portrait35.pages[0]!.rows.length).toBeGreaterThan(landscape35.pages[0]!.rows.length);

    const roster100 = buildSyntheticRoster(100);
    const portrait100 = buildA4ScheduleDocumentModel(roster100, {
      orientation: 'portrait',
      emittedAtIso: '2026-11-11T03:00:00.000Z',
    });
    const landscape100 = buildA4ScheduleDocumentModel(roster100, {
      orientation: 'landscape',
      emittedAtIso: '2026-11-11T03:00:00.000Z',
    });
    expect(landscape100.pages.length).toBeGreaterThan(portrait100.pages.length);

    // Warm up JIT once, then verify < 25ms median SLA for 35 caregivers end-to-end
    compileSchedulePdfBytes(buildA4ScheduleDocumentModel(roster35));
    const samplesMs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const t0 = performance.now();
      const bytes = compileSchedulePdfBytes(
        buildA4ScheduleDocumentModel(roster35, {
          orientation: 'portrait',
          emittedAtIso: '2026-11-11T03:00:00.000Z',
        })
      );
      samplesMs.push(performance.now() - t0);
      expect(bytes.byteLength).toBeGreaterThan(2000);
    }
    samplesMs.sort((a, b) => a - b);
    expect(samplesMs[2]!).toBeLessThan(25);
  });

  it('6. enforces LGPD Public Mural Mode pseudonymization across BOTH titular & substituto, skips PT-BR particles, and suppresses 100% of phone digits (S12, S13)', () => {
    expect(maskPersonNameLgpd('Carlos Rocha')).toBe('Carlos R.');
    expect(maskPersonNameLgpd('João da Conceição')).toBe('João C.');
    expect(maskPersonNameLgpd('Mariana das Dores Silva')).toBe('Mariana D.');
    expect(maskPersonNameLgpd('Lucas de Oliveira')).toBe('Lucas O.');
    expect(maskPersonNameLgpd('Pedro e Castro')).toBe('Pedro C.');
    expect(maskPersonNameLgpd('Ana')).toBe('Ana');

    const muralRoster: Cuidador[] = [
      parseCuidador({
        id: 1,
        nome: 'João da Conceição',
        status: 'Presente',
        turno: 'Diurno (07h-19h)',
        quarto: 'Quarto 01',
        telefone: '+55 11 90000-0101',
      }),
      parseCuidador({
        id: 3,
        nome: 'Carlos Rocha',
        status: 'Cobertura',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 03',
        telefone: '+55 11 90000-0103',
        substituto: 'Beatriz Alves',
      }),
    ];

    const projCovered = formatCaregiverForSchedule(muralRoster[1]!, true);
    expect(projCovered.displayName).toBe('Carlos R.');
    expect(projCovered.contactOrCoverageText).toBe('Cob.: Beatriz A. • Tel: Restrito (LGPD)');

    const lgpdModel = buildA4ScheduleDocumentModel(muralRoster, {
      privacyMode: true,
      emittedAtIso: '2026-11-11T03:00:00.000Z',
    });
    const lgpdPdfBytes = compileSchedulePdfBytes(lgpdModel);
    const decodedText = extractAllDecodedPdfTextStrings(lgpdPdfBytes).join(' | ');

    expect(decodedText).toContain('João C.');
    expect(decodedText).toContain('Carlos R.');
    expect(decodedText).toContain('Beatriz A.');
    expect(decodedText).toContain('MODO MURAL PÚBLICO LGPD');

    // Zero leakage of full surnames or ANY phone digits in PDF streams or metadata
    expect(decodedText).not.toContain('Conceição');
    expect(decodedText).not.toContain('Rocha');
    expect(decodedText).not.toContain('Alves');
    expect(decodedText).not.toContain('90000');
    expect(decodedText).not.toContain('0101');
    expect(decodedText).not.toContain('0103');

    // Multi-page LGPD parity: continuation pages (2..N) also emit MODO MURAL PÚBLICO LGPD badge 1:1 with SheetCanvas
    const lgpdMultiModel = buildA4ScheduleDocumentModel(buildSyntheticRoster(35), {
      privacyMode: true,
      emittedAtIso: '2026-11-11T03:00:00.000Z',
    });
    expect(lgpdMultiModel.pages).toHaveLength(2);
    const lgpdMultiStrings = extractAllDecodedPdfTextStrings(
      compileSchedulePdfBytes(lgpdMultiModel)
    );
    const lgpdBadgeCount = lgpdMultiStrings.filter((s) => s === 'MODO MURAL PÚBLICO LGPD').length;
    expect(lgpdBadgeCount).toBe(2);
  });

  it('7. validates Ramer-Douglas-Peucker sigv1 compression, < 5ms anti-DoS bounds, upright PDF yPt orientation, and exact bottom-left rectangle math (S14, S15, S16)', () => {
    // 300-point synthetic sine/flourish stroke compresses cleanly into < 600 bytes sigv1
    const denseStroke = Array.from({ length: 300 }, (_, idx) => ({
      x: idx * 3,
      y: 150 + Math.sin(idx / 12) * 75,
    }));
    const rdp = ramerDouglasPeucker(denseStroke, 2.2);
    expect(rdp.length).toBeGreaterThanOrEqual(4);
    expect(rdp.length).toBeLessThan(60);

    const simplified = simplifySignatureStrokes([denseStroke], { width: 900, height: 300 });
    expect(simplified).not.toBeNull();
    expect(simplified!.serialized.startsWith('sigv1:1000x300:')).toBe(true);
    expect(simplified!.serialized.length).toBeLessThan(600);

    const reparsed = parseSigV1(simplified!.serialized);
    expect(reparsed.serialized).toBe(simplified!.serialized);
    expect(signatureToSvgPathData(reparsed)).toMatch(/^M \d+ \d+ L \d+ \d+/);

    // S14: Reject 50,000-char payload, NaN/malformed tokens, >32 strokes, and >512 vertices in < 5ms
    const giantPayload = `sigv1:1000x300:${'10,20;30,40;'.repeat(4500)}50,60`;
    expect(giantPayload.length).toBeGreaterThan(50000);
    const t0 = performance.now();
    expect(() => parseSigV1(giantPayload)).toThrow(VectorSignatureError);
    expect(performance.now() - t0).toBeLessThan(5);

    expect(() => parseSigV1('sigv1:1000x300:10,NaN;20,30')).toThrow(VectorSignatureError);
    expect(() => parseSigV1('sigv1:1000x300:10,20;1005,30')).toThrow(VectorSignatureError);
    expect(() =>
      serializeSigV1(
        1000,
        300,
        Array.from({ length: MAX_SIGV1_STROKES + 1 }, () => [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ])
      )
    ).toThrow(VectorSignatureError);

    const tooManyVerticesPayload = `sigv1:1000x300:${Array.from(
      { length: MAX_SIGV1_VERTICES + 5 },
      (_, i) => `${i % 900},${i % 250}`
    ).join(';')}`;
    expect(tooManyVerticesPayload.length).toBeLessThanOrEqual(MAX_SIGV1_LENGTH * 2);
    expect(() => parseSigV1(tooManyVerticesPayload)).toThrow(VectorSignatureError);

    // S15: Top-to-bottom stroke (py=0 -> py=300) MUST map to topYPt > bottomYPt in PDF bottom-left space (never upside-down!)
    const verticalSig = parseSigV1('sigv1:1000x300:100,0;100,300');
    const pdfPathOps = signatureToPdfPathOperators(
      verticalSig,
      { xMm: 14, yMm: 265, widthMm: 78, heightMm: 11.5 },
      297
    );
    const moveMatch = /(\d+\.\d+) (\d+\.\d+) m/.exec(pdfPathOps);
    const lineMatch = /(\d+\.\d+) (\d+\.\d+) l/.exec(pdfPathOps);
    expect(moveMatch).not.toBeNull();
    expect(lineMatch).not.toBeNull();
    const topYPt = Number.parseFloat(moveMatch![2]!);
    const bottomYPt = Number.parseFloat(lineMatch![2]!);
    expect(topYPt).toBeGreaterThan(bottomYPt);
    expect(topYPt - bottomYPt).toBeCloseTo(11.5 * PT_PER_MM, 1);

    // S16: Rectangle conversion MUST subtract BOTH yMm AND heightMm from pageHeightMm
    const headerRect = rectMmToPdfPt(10, 10, 190, 24, 297);
    expect(headerRect.yPt).toBeCloseTo((297 - 10 - 24) * PT_PER_MM, 2);
    expect(headerRect.yPt).toBeLessThan((297 - 10) * PT_PER_MM - 60);
  });

  it('8. guarantees 0px horizontal overflow on 375x667 mobile preview in both Portrait & Landscape and LIFO @page DOM cleanup (S17)', () => {
    const portraitDim = getA4PageDimensions('portrait');
    const landscapeDim = getA4PageDimensions('landscape');
    expect(portraitDim.widthMm).toBe(210);
    expect(portraitDim.heightMm).toBe(297);
    expect(landscapeDim.widthMm).toBe(297);
    expect(landscapeDim.heightMm).toBe(210);

    // S17: Mobile 375px viewport with modal padding leaves ~311px available width
    const mobilePortrait = computeOpticalSheetScale(311, 'portrait');
    expect(mobilePortrait.scaledWidthPx).toBeLessThanOrEqual(311);
    expect(mobilePortrait.scale).toBeGreaterThan(0.35);

    const mobileLandscape = computeOpticalSheetScale(311, 'landscape');
    expect(mobileLandscape.scaledWidthPx).toBeLessThanOrEqual(311);
    expect(mobileLandscape.scale).toBeCloseTo(311 / landscapeDim.widthPx, 3);
    expect(mobileLandscape.scale).toBeLessThan(0.3); // Proves 0.40 floor saboteur is dead!

    // Desktop wide container caps optical zoom at 1.0
    const desktopScale = computeOpticalSheetScale(1280, 'portrait');
    expect(desktopScale.scale).toBe(1);

    // Deterministic filename helper
    expect(buildPdfFilename(new Date(2026, 10, 11, 12, 0, 0), 'portrait', false)).toBe(
      'escala-elderly-a4-2026-11-11.pdf'
    );
    expect(buildPdfFilename(new Date(2026, 10, 11, 12, 0, 0), 'landscape', true)).toBe(
      'escala-elderly-a4-2026-11-11-paisagem-mural-lgpd.pdf'
    );

    // Runtime @page literal mm injection + LIFO idempotent cleanup
    const attrs = new Map<string, string>();
    const elements = new Map<string, { id: string; textContent: string; parentNode: unknown }>();
    const fakeHead = {
      appendChild(el: { id: string; textContent: string; parentNode: unknown }) {
        el.parentNode = fakeHead;
        elements.set(el.id, el);
      },
      removeChild(el: { id: string; parentNode: unknown }) {
        el.parentNode = null;
        elements.delete(el.id);
      },
    };
    const fakeDoc = {
      head: fakeHead,
      body: {
        setAttribute(k: string, v: string) {
          attrs.set(k, v);
        },
        removeAttribute(k: string) {
          attrs.delete(k);
        },
      },
      getElementById(id: string) {
        return elements.get(id) ?? null;
      },
      createElement() {
        return { id: '', textContent: '', parentNode: null };
      },
    } as unknown as Document;

    const cleanup = applyRuntimePageGeometry(fakeDoc, 'landscape');
    expect(attrs.get('data-a4-sheet-print')).toBe('active');
    const injectedCss = elements.get('runtime-page-geometry')?.textContent ?? '';
    expect(injectedCss).toContain('@page { size: 297mm 210mm; margin: 0; }');
    expect(injectedCss).not.toContain('var(--');

    cleanup();
    cleanup(); // Idempotent second call
    expect(attrs.has('data-a4-sheet-print')).toBe(false);
    expect(elements.has('runtime-page-geometry')).toBe(false);
  });
});
