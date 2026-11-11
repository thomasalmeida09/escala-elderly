import { describe, expect, it } from 'vitest';
import { createCaregiverApiClient } from '../src/services/caregiverApi';
import { createCaregiverScheduleController } from '../src/services/caregiverSyncController';
import {
  CsvScheduleError,
  MAX_CSV_BYTES,
  buildCsvBackupFilename,
  decodeSpreadsheetBytes,
  detectCsvDelimiter,
  escapeCsvCellForExport,
  parseCsvSchedule,
  serializeScheduleToCsv,
} from '../src/services/csvScheduleCodec';
import {
  SCHEDULE_STORAGE_KEY,
  type StorageAdapter,
  UNDO_IMPORT_STORAGE_KEY,
  createLocalFirstStore,
  getCanonicalSeed,
} from '../src/services/localFirstStore';
import { ContractValidationError, type Cuidador, parseCuidador } from '../src/types/caregiver';

function createMemoryStorage(): {
  readonly adapter: StorageAdapter;
  readonly map: Map<string, string>;
} {
  const map = new Map<string, string>();
  const adapter: StorageAdapter = {
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
  return { adapter, map };
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const bom = littleEndian ? [0xff, 0xfe] : [0xfe, 0xff];
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = bom[0]!;
  out[1] = bom[1]!;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (littleEndian) {
      out[2 + i * 2] = code & 0xff;
      out[2 + i * 2 + 1] = (code >> 8) & 0xff;
    } else {
      out[2 + i * 2] = (code >> 8) & 0xff;
      out[2 + i * 2 + 1] = code & 0xff;
    }
  }
  return out;
}

describe('FE #3 — Auto-Healing CSV/TSV Codec, OWASP Formula Guard & Local-First Undo Backup', () => {
  it('1. auto-heals UTF-8, UTF-8 BOM, UTF-16LE, UTF-16BE, and Brazilian Excel Windows-1252 (ANSI + 0x96 en-dash) without mojibake', () => {
    // Bytes reais Windows-1252: "nome;status;turno;quarto\r\nJoão Conceição;Folga;Plantão 07h–19h;Refeitório São José\r\n"
    // ã=0xE3, ç=0xE7, –=0x96 (WHATWG CP1252 en-dash), ó=0xF3, é=0xE9
    const cp1252Header = Array.from(new TextEncoder().encode('nome;status;turno;quarto\r\n'));
    const cp1252Row = [
      0x4a,
      0x6f,
      0xe3,
      0x6f,
      0x20,
      0x43,
      0x6f,
      0x6e,
      0x63,
      0x65,
      0x69,
      0xe7,
      0xe3,
      0x6f,
      0x3b, // João Conceição;
      0x46,
      0x6f,
      0x6c,
      0x67,
      0x61,
      0x3b, // Folga;
      0x50,
      0x6c,
      0x61,
      0x6e,
      0x74,
      0xe3,
      0x6f,
      0x20,
      0x30,
      0x37,
      0x68,
      0x96,
      0x31,
      0x39,
      0x68,
      0x3b, // Plantão 07h–19h;
      0x52,
      0x65,
      0x66,
      0x65,
      0x69,
      0x74,
      0xf3,
      0x72,
      0x69,
      0x6f,
      0x20,
      0x53,
      0xe3,
      0x6f,
      0x20,
      0x4a,
      0x6f,
      0x73,
      0xe9, // Refeitório São José
      0x0d,
      0x0a,
    ];
    const cp1252Bytes = new Uint8Array([...cp1252Header, ...cp1252Row]);

    const parsedCp1252 = parseCsvSchedule(cp1252Bytes);
    expect(parsedCp1252.encoding).toBe('windows-1252');
    expect(parsedCp1252.delimiter).toBe(';');
    expect(parsedCp1252.cuidadores).toEqual([
      {
        id: 1,
        nome: 'João Conceição',
        status: 'Folga',
        turno: 'Plantão 07h–19h',
        quarto: 'Refeitório São José',
      },
    ]);
    expect(parsedCp1252.cuidadores[0]?.nome).not.toContain('\uFFFD');

    // UTF-8 com BOM (EF BB BF)
    const utf8Body = 'nome;status;quarto\r\nCláudia Araújo;Presente;Quarto 08\r\n';
    const utf8BomBytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(utf8Body)]);
    const parsedUtf8Bom = parseCsvSchedule(utf8BomBytes);
    expect(parsedUtf8Bom.encoding).toBe('utf-8-bom');
    expect(parsedUtf8Bom.cuidadores[0]?.nome).toBe('Cláudia Araújo');

    // UTF-16LE e UTF-16BE (Excel "Texto Unicode *.txt")
    const utf16Tsv = 'nome\tstatus\tquarto\r\nSônia Guimarães\tPresente\tAla Sul\r\n';
    const parsedUtf16Le = parseCsvSchedule(encodeUtf16(utf16Tsv, true));
    expect(parsedUtf16Le.encoding).toBe('utf-16le');
    expect(parsedUtf16Le.delimiter).toBe('\t');
    expect(parsedUtf16Le.cuidadores[0]?.nome).toBe('Sônia Guimarães');

    const parsedUtf16Be = parseCsvSchedule(encodeUtf16(utf16Tsv, false));
    expect(parsedUtf16Be.encoding).toBe('utf-16be');
    expect(parsedUtf16Be.cuidadores[0]?.nome).toBe('Sônia Guimarães');
  });

  it('2. blocks binary workbooks (.xlsx/.xls), PDFs, UTF-32 collisions, NUL bytes, >1 MiB DoS payloads, and >500 batch rows (M1)', () => {
    // .xlsx ZIP magic PK\x03\x04
    expect(() =>
      decodeSpreadsheetBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))
    ).toThrowError(CsvScheduleError);
    try {
      decodeSpreadsheetBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));
    } catch (err) {
      expect(err).toBeInstanceOf(CsvScheduleError);
      expect((err as CsvScheduleError).code).toBe('EXCEL_BINARY_WORKBOOK');
      expect((err as CsvScheduleError).message).toContain('CSV UTF-8');
    }

    // .xls OLE2 magic D0 CF 11 E0 A1 B1 1A E1
    try {
      decodeSpreadsheetBytes(
        new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00])
      );
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('EXCEL_BINARY_WORKBOOK');
    }

    // %PDF- magic
    try {
      decodeSpreadsheetBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]));
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('UNSUPPORTED_BINARY_FILE');
    }

    // UTF-32LE (FF FE 00 00) MUST NOT be misclassified as UTF-16LE (FF FE)!
    try {
      decodeSpreadsheetBytes(new Uint8Array([0xff, 0xfe, 0x00, 0x00, 0x6e, 0x00, 0x00, 0x00]));
      expect.unreachable('UTF-32LE should have been rejected');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('UNSUPPORTED_BINARY_FILE');
      expect((err as CsvScheduleError).message).toContain('UTF-32');
    }

    // NUL byte in stream & string
    expect(() =>
      decodeSpreadsheetBytes(new Uint8Array([0x6e, 0x6f, 0x6d, 0x65, 0x00, 0x3b]))
    ).toThrowError(/nulos/i);
    expect(() => parseCsvSchedule('nome;status\nAna\0Souza;Presente')).toThrowError(/nulos/i);

    // Pre-parse 1 MiB ceiling on both Uint8Array AND string (Ctrl+V protection)
    const oversizedBytes = new Uint8Array(MAX_CSV_BYTES + 1);
    oversizedBytes.fill(0x61);
    try {
      parseCsvSchedule(oversizedBytes);
      expect.unreachable('Oversized Uint8Array must fail');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('MAX_SIZE_EXCEEDED');
    }

    const oversizedString = 'a'.repeat(MAX_CSV_BYTES + 1);
    try {
      parseCsvSchedule(oversizedString);
      expect.unreachable('Oversized string must fail');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('MAX_SIZE_EXCEEDED');
    }

    // Multi-byte UTF-8 string whose char length <= MAX_CSV_BYTES but UTF-8 byte length > MAX_CSV_BYTES
    const multiByteOversized = 'ã'.repeat(Math.floor(MAX_CSV_BYTES / 2) + 10);
    expect(multiByteOversized.length).toBeLessThan(MAX_CSV_BYTES);
    try {
      parseCsvSchedule(multiByteOversized);
      expect.unreachable('Multi-byte string exceeding 1 MiB in UTF-8 bytes must fail');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('MAX_SIZE_EXCEEDED');
    }

    // > 500 rows batch ceiling
    const lines501 = ['nome;status'];
    for (let idx = 1; idx <= 501; idx += 1) {
      lines501.push(`Profissional ${idx};Presente`);
    }
    try {
      parseCsvSchedule(lines501.join('\n'));
      expect.unreachable('501 rows must exceed MAX_BATCH_SIZE');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('MAX_BATCH_EXCEEDED');
      expect((err as CsvScheduleError).line).toBe(502);
    }
  });

  it('3. parses RFC 4180 quotes, inner delimiters, sep= directives, Alt+Enter headers, blank Excel rows, and blocks 1-column headerless paste (M1.3)', () => {
    // Inner commas inside quotes must NOT fool delimiter detection when ';' separates columns
    const validQuotedCsv = [
      'sep=;',
      'Código;"Profissional\n(Nome Completo)";"Situação";"Plantão";"Posto / Ala";"Horas\nDescanso";"Cuidador Substituto"',
      '#003;"Ana ""Bia"" Souza";Ativo;"Diurno, Ala Norte, Bloco B";"Quarto 01, Leito A";14h;--',
      ';;;;;;',
      '   ;   ;   ;   ;   ;   ;   ',
      '#007;Carlos Rocha;Coberto;"Noturno, Ala Sul";--;0 horas;Beatriz Alves',
    ].join('\r\n');

    expect(
      detectCsvDelimiter('"Ana, Bia";Presente;"Diurno, Ala B"\nLucas;Folga;"Noturno, Ala C"')
    ).toBe(';');
    expect(detectCsvDelimiter('nome,status,turno\n"Ana; Bia",Presente,"Diurno; Ala B"')).toBe(',');

    const parsed = parseCsvSchedule(validQuotedCsv);
    expect(parsed.delimiter).toBe(';');
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.rowCount).toBe(2);
    expect(parsed.cuidadores).toEqual([
      {
        id: 3,
        nome: 'Ana "Bia" Souza',
        status: 'Presente',
        turno: 'Diurno, Ala Norte, Bloco B',
        quarto: 'Quarto 01, Leito A',
        horasDescanso: 14,
      },
      {
        id: 7,
        nome: 'Carlos Rocha',
        status: 'Cobertura',
        turno: 'Noturno, Ala Sul',
        horasDescanso: 0,
        substituto: 'Beatriz Alves',
      },
    ]);

    // Header row missing 'nome' must fail with MISSING_REQUIRED_COLUMN
    try {
      parseCsvSchedule('status;turno\nPresente;Diurno (07h-19h)');
      expect.unreachable('Header without nome must fail');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('MISSING_REQUIRED_COLUMN');
      expect((err as CsvScheduleError).column).toBe('nome');
    }

    // Unclosed quote reports exact opening physical line across sep= and multiline cells
    const unclosedCsv = 'sep=;\r\nnome;status;turno\r\nAna;Presente;"Diurno\r\nsem fechar aspas';
    try {
      parseCsvSchedule(unclosedCsv);
      expect.unreachable('Unclosed quote must fail');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('UNCLOSED_QUOTE');
      expect((err as CsvScheduleError).line).toBe(3);
    }

    // Duplicate/ambiguous column headers (Telefone + WhatsApp) must fail
    try {
      parseCsvSchedule('nome;telefone;whatsapp\nAna;+55 11 90000-0101;+55 11 90000-0102');
      expect.unreachable('Duplicate mapped column must fail');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('DUPLICATE_COLUMN');
      expect((err as CsvScheduleError).column).toBe('telefone');
    }

    // Headerless TSV paste (>= 2 columns) from Excel selection works in <1ms, including shift in col 2 without status!
    const excelClipboardShiftRows = [
      'Beatriz Alves\tDiurno (07h-19h)\tQuarto 05\t+55 11 90000-0105\t18',
      'Helena Prado\tNoturno (19h-07h)\tQuarto 06\t(11) 3000-0106\t24',
    ].join('\r\n');
    const pasted = parseCsvSchedule(excelClipboardShiftRows);
    expect(pasted.hasHeader).toBe(false);
    expect(pasted.delimiter).toBe('\t');
    expect(pasted.cuidadores).toEqual([
      {
        id: 1,
        nome: 'Beatriz Alves',
        status: 'Presente',
        turno: 'Diurno (07h-19h)',
        quarto: 'Quarto 05',
        telefone: '+55 11 90000-0105',
        horasDescanso: 18,
      },
      {
        id: 2,
        nome: 'Helena Prado',
        status: 'Presente',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 06',
        telefone: '(11) 3000-0106',
        horasDescanso: 24,
      },
    ]);

    // Single-column plain text accidental Ctrl+V (URL / WhatsApp note) MUST be blocked!
    for (const accidentalPaste of [
      'https://wa.me/5511900000105',
      'Lembrar de conferir estoque da farmácia\nSegunda linha de recado',
    ]) {
      try {
        parseCsvSchedule(accidentalPaste);
        expect.unreachable(`Single-column paste "${accidentalPaste}" must be rejected`);
      } catch (err) {
        expect((err as CsvScheduleError).code).toBe('HEADERLESS_SINGLE_COLUMN');
      }
    }
  });

  it('4. enforces triple OWASP CSV Formula Injection defense, phone grammar allowlist, scientific-notation diagnostics, and 1:1 round-trip backup idempotency (M2)', () => {
    const formulaPayloads: ReadonlyArray<{ readonly csv: string; readonly expectedCol: string }> = [
      { csv: "nome;status\n=CMD|' /C calc'!A0;Presente", expectedCol: 'nome' },
      { csv: 'nome;status\n" =HYPERLINK(""http://evil.test"")";Presente', expectedCol: 'nome' },
      { csv: "nome;status\n'=SUM(A1:A2);Presente", expectedCol: 'nome' },
      { csv: 'nome;status;quarto\nAna;Presente;"Quarto 01\n=CMD|calc"', expectedCol: 'quarto' },
      { csv: 'nome;status;turno\nAna;Presente;+SUM(1,2)', expectedCol: 'turno' },
      { csv: 'nome;status;substituto\nAna;Cobertura;@SUM(1,2)', expectedCol: 'substituto' },
      { csv: 'nome;status;quarto\nAna;Presente;-2+3+cmd', expectedCol: 'quarto' },
      { csv: "nome;status;telefone\nAna;Presente;+cmd|' /C calc'!A0", expectedCol: 'telefone' },
      { csv: 'nome;status;telefone\nAna;Presente;=1+1', expectedCol: 'telefone' },
      { csv: 'nome;status;telefone\nAna;Presente;-55 11 90000-0101', expectedCol: 'telefone' },
      { csv: "nome;status;telefone\nAna;Presente;'=1+1", expectedCol: 'telefone' },
    ];

    for (const sample of formulaPayloads) {
      try {
        parseCsvSchedule(sample.csv);
        expect.unreachable(`OWASP payload should have been blocked: ${sample.csv}`);
      } catch (err) {
        expect(err).toBeInstanceOf(CsvScheduleError);
        expect((err as CsvScheduleError).code).toBe('CSV_FORMULA_INJECTION');
        expect((err as CsvScheduleError).column).toBe(sample.expectedCol);
      }
    }

    // Excel scientific notation corruption on phone numbers produces dedicated diagnostic code
    try {
      parseCsvSchedule('nome;status;telefone\nAna Souza;Presente;5,5119E+12');
      expect.unreachable('Scientific notation phone must fail');
    } catch (err) {
      expect((err as CsvScheduleError).code).toBe('EXCEL_SCIENTIFIC_NOTATION');
      expect((err as CsvScheduleError).column).toBe('telefone');
    }

    // Canonical export order: OWASP single-quote prefix FIRST, RFC 4180 double-quotes SECOND
    expect(escapeCsvCellForExport('+55 11 90000-0101', ';')).toBe("'+55 11 90000-0101");
    expect(escapeCsvCellForExport('11900000101', ';')).toBe("'11900000101");
    expect(escapeCsvCellForExport('011900000101', ';')).toBe("'011900000101");
    expect(escapeCsvCellForExport('+55 11 90000-0101; ramal 2', ';')).toBe(
      '"\'+55 11 90000-0101; ramal 2"'
    );
    expect(escapeCsvCellForExport('=CMD()', ';')).toBe("'=CMD()");

    // Lossless mathematical round-trip idempotency across all 4 statuses, phones, quotes, leading zeros, and rest hours
    const complexRoster: Cuidador[] = [
      parseCuidador({
        id: 1,
        nome: "Beatriz D'Ávila",
        status: 'Presente',
        turno: 'Diurno (07h-19h)',
        quarto: '0102',
        telefone: '+55 11 90000-0101',
        horasDescanso: 12,
      }),
      parseCuidador({
        id: 2,
        nome: 'Lucas "Líder" Lima',
        status: 'Cobertura',
        turno: 'Diurno, Ala Sul; Bloco B',
        quarto: 'Quarto 02',
        telefone: '11900000102',
        horasDescanso: 36,
        substituto: 'Helena Prado',
      }),
      parseCuidador({
        id: 3,
        nome: 'Carlos Rocha',
        status: 'Faltou',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 03',
        telefone: '011900000103',
        horasDescanso: 0,
      }),
      parseCuidador({
        id: 4,
        nome: 'Mariana Costa',
        status: 'Folga',
      }),
    ];

    const exportedWithBom = serializeScheduleToCsv(complexRoster);
    expect(exportedWithBom.startsWith('\uFEFF')).toBe(true);
    expect(exportedWithBom).toContain('\r\n');
    expect(exportedWithBom).toContain("'+55 11 90000-0101");
    expect(exportedWithBom).toContain("'11900000102");
    expect(exportedWithBom).toContain("'011900000103");
    expect(exportedWithBom).toContain("'0102");

    // Re-importing both string AND UTF-8 BOM bytes produces exact 1:1 deepEqual Cuidador[]
    const roundTripFromString = parseCsvSchedule(exportedWithBom);
    expect(roundTripFromString.encoding).toBe('utf-8-bom');
    expect(roundTripFromString.cuidadores).toEqual(complexRoster);

    const roundTripFromBytes = parseCsvSchedule(new TextEncoder().encode(exportedWithBom));
    expect(roundTripFromBytes.encoding).toBe('utf-8-bom');
    expect(roundTripFromBytes.cuidadores).toEqual(complexRoster);

    expect(buildCsvBackupFilename(new Date(2026, 10, 10, 23, 30, 0))).toBe(
      'escala-cuidadores-2026-11-10.csv'
    );
  });

  it('5. enforces Write-Audit-Publish atomicity, anti-double-Ctrl+V guard, post-F5 reconcile() survival, POST /batch sync, and reset cleanup (M3)', async () => {
    // Error on the very last row of CSV leaves nothing partially parsed
    const tornCsv = [
      'nome;status;horasDescanso',
      'Ana Souza;Presente;12',
      'Carlos Rocha;StatusInexistente;24',
    ].join('\n');
    expect(() => parseCsvSchedule(tornCsv)).toThrowError(/linha 3/i);

    const { adapter, map } = createMemoryStorage();
    const store = createLocalFirstStore({
      storage: adapter,
      nowIso: () => '2026-11-10T23:30:00.000Z',
    });

    // Simulate backend :8080 in-memory state across GET, POST /batch, and POST /reset
    let remoteServerRoster: Cuidador[] = getCanonicalSeed();
    let batchCalls = 0;

    const api = createCaregiverApiClient({
      fetchImpl: async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (method === 'GET' && url.endsWith('/api/cuidadores')) {
          return new Response(JSON.stringify(remoteServerRoster), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (method === 'POST' && url.endsWith('/api/cuidadores/batch')) {
          batchCalls += 1;
          const body = JSON.parse(String(init?.body)) as Cuidador[];
          remoteServerRoster = body;
          return new Response(JSON.stringify(remoteServerRoster), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (method === 'POST' && url.endsWith('/api/cuidadores/reset')) {
          remoteServerRoster = getCanonicalSeed();
          return new Response(JSON.stringify(remoteServerRoster), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    const controller = createCaregiverScheduleController({
      store,
      api,
      eventTarget: null,
    });
    await controller.reconcile();
    expect(controller.getSnapshot().connectionStatus).toBe('online');
    expect(controller.getSnapshot().canUndoImport).toBe(false);

    // Invalid batch rejected BEFORE mutating schedule:v1 or undo_backup:v1
    await expect(controller.importCaregiversBatch([])).rejects.toThrowError(
      ContractValidationError
    );
    expect(store.readUndoBackup()).toBeNull();
    expect(controller.getSnapshot().cuidadores).toHaveLength(4);

    // Import valid 2-caregiver CSV
    const importedBatch = parseCsvSchedule(
      'nome;status;turno;quarto;telefone;horasDescanso\nFernanda Melo;Presente;Diurno (07h-19h);Quarto 10;+55 11 90000-0110;24\nGustavo Dias;Folga;Noturno (19h-07h);Quarto 11;+55 11 90000-0111;16'
    ).cuidadores;

    await controller.importCaregiversBatch(importedBatch);
    expect(batchCalls).toBe(1);
    expect(controller.getSnapshot().cuidadores.map((c) => c.nome)).toEqual([
      'Fernanda Melo',
      'Gustavo Dias',
    ]);
    expect(controller.getSnapshot().canUndoImport).toBe(true);
    expect(store.readUndoBackup()?.cuidadores).toHaveLength(4);

    // M3.2 Anti-double-Ctrl+V guard: importing the EXACT same batch again does NOT overwrite the 4-caregiver original undo backup!
    await controller.importCaregiversBatch(importedBatch);
    expect(batchCalls).toBe(2);
    expect(store.readUndoBackup()?.cuidadores).toHaveLength(4);
    expect(store.readUndoBackup()?.cuidadores[2]?.nome).toBe('Carlos Rocha');

    // M3.3 Simulate browser F5 reload: new controller hydrates in 0ms AND survives reconcile() GET /api/cuidadores with canUndoImport === true!
    controller.dispose();
    const reloadedController = createCaregiverScheduleController({
      store: createLocalFirstStore({ storage: adapter }),
      api,
      eventTarget: null,
    });
    expect(reloadedController.getSnapshot().canUndoImport).toBe(true);
    expect(reloadedController.getSnapshot().cuidadores).toHaveLength(2);

    await reloadedController.reconcile();
    expect(reloadedController.getSnapshot().connectionStatus).toBe('online');
    expect(reloadedController.getSnapshot().canUndoImport).toBe(true);

    // Undo restores all 4 original caregivers, clears undo_backup:v1, and pushes POST /api/cuidadores/batch to :8080!
    const undone = await reloadedController.undoLastImport();
    expect(undone).toBe(true);
    expect(batchCalls).toBe(3);
    expect(reloadedController.getSnapshot().canUndoImport).toBe(false);
    expect(reloadedController.getSnapshot().cuidadores).toHaveLength(4);
    expect(remoteServerRoster).toHaveLength(4);
    expect(map.has(UNDO_IMPORT_STORAGE_KEY)).toBe(false);
    expect(map.has(SCHEDULE_STORAGE_KEY)).toBe(true);

    // Second undo when empty is a safe no-op returning false
    expect(await reloadedController.undoLastImport()).toBe(false);

    // Import again, then click "Restaurar Escala" -> clears undo_backup:v1 atomically
    await reloadedController.importCaregiversBatch(importedBatch);
    expect(reloadedController.getSnapshot().canUndoImport).toBe(true);
    await reloadedController.resetSchedule();
    expect(reloadedController.getSnapshot().canUndoImport).toBe(false);
    expect(map.has(UNDO_IMPORT_STORAGE_KEY)).toBe(false);

    reloadedController.dispose();
  });

  it('6. purges corrupt undo_backup:v1 envelopes safely and preserves offline local-first fallback during import and undo', async () => {
    const { adapter, map } = createMemoryStorage();
    map.set(UNDO_IMPORT_STORAGE_KEY, '{"schemaVersion":999,"savedAtIso":"2026","cuidadores":[]}');

    const store = createLocalFirstStore({ storage: adapter });
    expect(store.readUndoBackup()).toBeNull();
    expect(map.has(UNDO_IMPORT_STORAGE_KEY)).toBe(false);

    // Offline API (network error)
    const offlineApi = createCaregiverApiClient({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    // Also verify storage: null fallbackMemory isolation between scheduleKey and undoKey
    const memoryOnlyStore = createLocalFirstStore({ storage: null });
    const controller = createCaregiverScheduleController({
      store: memoryOnlyStore,
      api: offlineApi,
      eventTarget: null,
    });

    const singleImported = parseCsvSchedule('nome;status\nPatrícia Lima;Presente').cuidadores;
    await controller.importCaregiversBatch(singleImported);

    expect(controller.getSnapshot().connectionStatus).toBe('local-first');
    expect(controller.getSnapshot().pendingRemoteSync).toBe(true);
    expect(controller.getSnapshot().canUndoImport).toBe(true);
    expect(controller.getSnapshot().cuidadores[0]?.nome).toBe('Patrícia Lima');

    await controller.undoLastImport();
    expect(controller.getSnapshot().connectionStatus).toBe('local-first');
    expect(controller.getSnapshot().pendingRemoteSync).toBe(true);
    expect(controller.getSnapshot().canUndoImport).toBe(false);
    expect(controller.getSnapshot().cuidadores).toHaveLength(4);

    controller.dispose();
  });
});
