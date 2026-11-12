import { describe, expect, it } from 'vitest';
import {
  buildPdfFilename,
  formatCaregiverForSchedule,
  maskPersonNameLgpd as pdfMaskPersonNameLgpd,
} from '../src/services/a4PdfScheduleEngine';
import type { CaregiverApiClient } from '../src/services/caregiverApi';
import { createCaregiverScheduleController } from '../src/services/caregiverSyncController';
import {
  buildCsvBackupFilename,
  parseCsvSchedule,
  serializeScheduleToCsv,
} from '../src/services/csvScheduleCodec';
import {
  LGPD_MASKED_PHONE_LABEL,
  LGPD_PHONE_MASK,
  PT_BR_NAME_PARTICLES,
  maskPersonNameLgpd,
  maskPhoneForCsvLgpd,
  maskPhoneLgpd,
  projectCaregiverForLgpd,
  projectCaregiverListForLgpd,
  truncateUtf16Safe,
} from '../src/services/lgpdPrivacyEngine';
import {
  PRIVACY_MODE_STORAGE_KEY,
  type StorageAdapter,
  createLocalFirstStore,
  getCanonicalSeed,
} from '../src/services/localFirstStore';
import {
  type Cuidador,
  MAX_TEXT_LENGTH,
  parseCuidador,
  parseCuidadorList,
} from '../src/types/caregiver';

function createMemoryStorage(): {
  storage: StorageAdapter;
  backing: Map<string, string>;
} {
  const backing = new Map<string, string>();
  return {
    backing,
    storage: {
      getItem: (key) => backing.get(key) ?? null,
      setItem: (key, value) => {
        backing.set(key, value);
      },
      removeItem: (key) => {
        backing.delete(key);
      },
    },
  };
}

function hasOrphanUtf16Surrogate(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) {
        return true;
      }
      i += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('LGPD Privacy Engine, Local-First Persistence & CSV/PDF Redaction Parity', () => {
  it('1. enforces NFC normalization and full PT-BR particle filtering with deterministic fallback (S01, S02, S03)', () => {
    expect(maskPersonNameLgpd).toBe(pdfMaskPersonNameLgpd);
    expect([...PT_BR_NAME_PARTICLES]).toEqual(['da', 'de', 'do', 'das', 'dos', 'e']);

    // S01: NFD macOS decomposed strings normalize identically to NFC byte-for-byte
    const nfdJoao = 'Jo\u0061\u0303o da Concei\u0063\u0327\u0061\u0303o';
    const nfcJoao = 'João da Conceição';
    expect(maskPersonNameLgpd(nfdJoao)).toBe('João C.');
    expect(maskPersonNameLgpd(nfdJoao)).toBe(maskPersonNameLgpd(nfcJoao));

    const nfdClaudia = 'Cl\u0061\u0301udia \u0041\u0301vila';
    expect(maskPersonNameLgpd(nfdClaudia)).toBe('Cláudia Á.');

    // S02: All 6 PT-BR particles skipped across mixed casing
    expect(maskPersonNameLgpd('Carlos Rocha')).toBe('Carlos R.');
    expect(maskPersonNameLgpd('João da Conceição')).toBe('João C.');
    expect(maskPersonNameLgpd('Lucas DE Oliveira')).toBe('Lucas O.');
    expect(maskPersonNameLgpd('Antônio Do Nascimento')).toBe('Antônio N.');
    expect(maskPersonNameLgpd('Mariana DAS Dores Silva')).toBe('Mariana D.');
    expect(maskPersonNameLgpd('Maria de Lurdes DOS Santos')).toBe('Maria L.');
    expect(maskPersonNameLgpd('Pedro E Castro')).toBe('Pedro C.');

    // S03: Particle-only trailing tokens, single names, nullish, and blank inputs
    expect(maskPersonNameLgpd('Maria da de e')).toBe('Maria E.');
    expect(maskPersonNameLgpd('João da')).toBe('João D.');
    expect(maskPersonNameLgpd('Ana')).toBe('Ana');
    expect(maskPersonNameLgpd('   Ana   ')).toBe('Ana');
    expect(maskPersonNameLgpd('')).toBe('');
    expect(maskPersonNameLgpd('    \t\n  ')).toBe('');
    expect(maskPersonNameLgpd(null)).toBe('');
    expect(maskPersonNameLgpd(undefined)).toBe('');
  });

  it('2. preserves astral Unicode code points in Unicode space while sanitizing WinAnsi only at PDF boundary (S04)', () => {
    const astralBoldB = '\uD835\uDC01'; // Mathematical Bold Capital B (2 UTF-16 code units)
    const masked = maskPersonNameLgpd(`Ana ${astralBoldB}runo`);
    expect(masked).toBe(`Ana ${astralBoldB}.`);
    expect(hasOrphanUtf16Surrogate(masked)).toBe(false);

    // Lone/unpaired surrogates and NUL bytes are healed without throwing or leaving orphans
    const repaired = maskPersonNameLgpd('Bruno\u0000 \uD800Silva \uDC00');
    expect(repaired).toBe('Bruno \uFFFD.');
    expect(hasOrphanUtf16Surrogate(repaired)).toBe(false);

    // PDF boundary strips non-WinAnsi astral chars cleanly without crashing ISO 32000-1 compilation
    const caregiverAstral = parseCuidador({
      id: 77,
      nome: `Ana ${astralBoldB}runo`,
      status: 'Presente',
      turno: 'Diurno (07h-19h)',
      quarto: 'Quarto 01',
      telefone: '+55 11 90000-0177',
    });
    const pdfProjected = formatCaregiverForSchedule(caregiverAstral, true);
    expect(pdfProjected.displayName).toBe('Ana .');
    expect(pdfProjected.contactOrCoverageText).toBe('Restrito (LGPD)');
  });

  it('3. enforces strict <= 120 UTF-16 code unit ceiling, surrogate-safe truncation, and algebraic idempotency f(f(x)) === f(x) (S05, S06)', () => {
    // S05: 118-char first name + " B" (120 chars input) must NOT expand to 121 chars
    const maxInput = `${'A'.repeat(118)} B`;
    expect(maxInput.length).toBe(MAX_TEXT_LENGTH);

    const maskedMax = maskPersonNameLgpd(maxInput);
    expect(maskedMax).toBe(`${'A'.repeat(117)} B.`);
    expect(maskedMax.length).toBe(MAX_TEXT_LENGTH);
    expect(hasOrphanUtf16Surrogate(maskedMax)).toBe(false);

    // Surrogate pair straddling cut boundary (index 116..117 when suffix is " B." = 3 units -> maxFirstNameUnits = 117)
    const astralPair = '\uD835\uDC01';
    const boundaryFirstName = `${'A'.repeat(116)}${astralPair}`; // 118 UTF-16 units; index 116 is high surrogate
    expect(truncateUtf16Safe(boundaryFirstName, 117)).toBe('A'.repeat(116));
    expect(hasOrphanUtf16Surrogate(truncateUtf16Safe(boundaryFirstName, 117))).toBe(false);

    const maskedBoundary = maskPersonNameLgpd(`${boundaryFirstName} Rocha`);
    expect(maskedBoundary).toBe(`${'A'.repeat(116)} R.`);
    expect(maskedBoundary.length).toBe(119);
    expect(hasOrphanUtf16Surrogate(maskedBoundary)).toBe(false);

    // Projected 120-char caregiver passes strict parseCuidador contract validation without error
    const nearLimitCaregiver = parseCuidador({
      id: 88,
      nome: maxInput,
      status: 'Cobertura',
      substituto: `${'B'.repeat(118)} C`,
      telefone: '+55 11 90000-0188',
    });
    const projectedNearLimit = projectCaregiverForLgpd(nearLimitCaregiver, true);
    expect(() => parseCuidador(projectedNearLimit)).not.toThrow();
    expect(projectedNearLimit.nome.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    expect(projectedNearLimit.substituto?.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);

    // S06: Algebraic idempotency f(f(x)) === f(x) across full adversarial corpus
    const corpus = [
      'Carlos Rocha',
      'Maria Esteves',
      'João Dantas',
      'Maria da de e',
      'João da Conceição',
      'Ana',
      `Ana ${astralPair}runo`,
      maxInput,
      `${boundaryFirstName} Silva`,
      'Hans ßchmidt',
      '',
    ];
    for (const sample of corpus) {
      const once = maskPersonNameLgpd(sample);
      const twice = maskPersonNameLgpd(once);
      expect(twice).toBe(once);
    }
  });

  it('4. projects caregivers immutably without mutating canonical records or leaking phone properties (S07)', () => {
    const original: Cuidador = parseCuidador({
      id: 3,
      nome: 'Carlos Rocha',
      status: 'Cobertura',
      turno: 'Noturno (19h-07h)',
      quarto: 'Quarto 03',
      telefone: '+55 11 90000-0103',
      horasDescanso: 14,
      substituto: 'Beatriz Alves',
    });

    expect(projectCaregiverForLgpd(original, false)).toBe(original);
    expect(maskPhoneLgpd(original.telefone)).toBe(LGPD_PHONE_MASK);
    expect(maskPhoneLgpd('')).toBeUndefined();
    expect(maskPhoneForCsvLgpd(original.telefone)).toBe('');
    expect(LGPD_MASKED_PHONE_LABEL).toBe('🔒 Contato oculto (LGPD)');

    const projected = projectCaregiverForLgpd(original, true);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(projected.nome).toBe('Carlos R.');
    expect(projected.substituto).toBe('Beatriz A.');
    expect(projected.horasDescanso).toBe(14);
    expect('telefone' in projected).toBe(false);
    expect(projected.telefone).toBeUndefined();

    // Original canonical object stays 100% untouched
    expect(original.nome).toBe('Carlos Rocha');
    expect(original.substituto).toBe('Beatriz Alves');
    expect(original.telefone).toBe('+55 11 90000-0103');

    const listProjected = projectCaregiverListForLgpd([original], true);
    expect(Object.isFrozen(listProjected)).toBe(true);
    expect(listProjected[0]?.nome).toBe('Carlos R.');
    expect('telefone' in listProjected[0]!).toBe(false);
  });

  it('5. exports LGPD-redacted CSV (-lgpd.csv) with zero phone digits/surnames and clean round-trip re-import + preserves PDF -mural-lgpd.pdf filename (S13, S14)', () => {
    const refDate = new Date(2026, 10, 11, 12, 0, 0);
    expect(buildCsvBackupFilename(refDate, false)).toBe('escala-cuidadores-2026-11-11.csv');
    expect(buildCsvBackupFilename(refDate, true)).toBe('escala-cuidadores-2026-11-11-lgpd.csv');
    expect(buildPdfFilename(refDate, 'portrait', true)).toBe(
      'escala-elderly-a4-2026-11-11-mural-lgpd.pdf'
    );
    expect(buildPdfFilename(refDate, 'landscape', true)).toBe(
      'escala-elderly-a4-2026-11-11-paisagem-mural-lgpd.pdf'
    );

    const seedWithCoverage = getCanonicalSeed().map((item) =>
      item.id === 3
        ? parseCuidador({ ...item, status: 'Cobertura', substituto: 'Beatriz Alves' })
        : item
    );

    const redactedCsv = serializeScheduleToCsv(seedWithCoverage, { privacyMode: true });
    expect(
      redactedCsv.startsWith(
        '\uFEFFid;nome;status;turno;quarto;telefone;horasDescanso;substituto\r\n'
      )
    ).toBe(true);
    expect(redactedCsv).toContain('1;Ana S.;Presente;Diurno (07h-19h);Quarto 01;;24;');
    expect(redactedCsv).toContain(
      '3;Carlos R.;Cobertura;Noturno (19h-07h);Quarto 03;;24;Beatriz A.'
    );

    for (const forbiddenLeak of [
      'Souza',
      'Lima',
      'Rocha',
      'Costa',
      'Alves',
      '90000',
      '+55',
      '🔒',
    ]) {
      expect(redactedCsv).not.toContain(forbiddenLeak);
    }

    // Round-trip re-import via parseCsvSchedule succeeds with 0 errors
    const reimported = parseCsvSchedule(redactedCsv);
    expect(reimported.cuidadores).toHaveLength(4);
    expect(reimported.cuidadores[0]?.nome).toBe('Ana S.');
    expect(reimported.cuidadores[0]?.telefone).toBeUndefined();
    expect(reimported.cuidadores[2]?.substituto).toBe('Beatriz A.');
    expect(() => parseCuidadorList(reimported.cuidadores)).not.toThrow();
  });

  it('6. persists escala_elderly:privacy_mode:v1 across F5, heals corrupt JSON, degrades under QuotaExceededError, and survives Reset/Import/Undo (S15, S16)', async () => {
    const { storage, backing } = createMemoryStorage();
    const store = createLocalFirstStore({
      storage,
      nowIso: () => '2026-11-11T15:00:00.000Z',
    });

    // Default when absent is false
    expect(store.readPrivacyMode()).toBe(false);

    // Persists true and rehydrates on fresh store instance (simulating F5 reload)
    expect(store.writePrivacyMode(true)).toBe(true);
    expect(backing.has(PRIVACY_MODE_STORAGE_KEY)).toBe(true);

    const reloadedStore = createLocalFirstStore({ storage });
    expect(reloadedStore.readPrivacyMode()).toBe(true);

    // S16: Reset, CSV Import, and Undo NEVER disable or delete escala_elderly:privacy_mode:v1
    const offlineApi: CaregiverApiClient = {
      baseUrl: 'http://localhost:8080',
      fetchCaregivers: () => Promise.reject(new Error('offline')),
      patchCaregiverStatus: () => Promise.reject(new Error('offline')),
      syncCaregiversBatch: () => Promise.reject(new Error('offline')),
      resetCaregiversSchedule: () => Promise.reject(new Error('offline')),
    };
    const controller = createCaregiverScheduleController({
      api: offlineApi,
      store: reloadedStore,
      eventTarget: null,
    });

    const importedBatch = getCanonicalSeed().map((item) =>
      item.id === 1 ? parseCuidador({ ...item, status: 'Folga' }) : item
    );
    await controller.importCaregiversBatch(importedBatch);
    expect(reloadedStore.readPrivacyMode()).toBe(true);

    await controller.undoLastImport();
    expect(reloadedStore.readPrivacyMode()).toBe(true);

    await controller.resetSchedule();
    expect(reloadedStore.readPrivacyMode()).toBe(true);
    controller.dispose();

    // S15: Corrupt JSON and wrong schemaVersion self-heal by purging key and returning false
    backing.set(PRIVACY_MODE_STORAGE_KEY, '{broken-json');
    expect(reloadedStore.readPrivacyMode()).toBe(false);
    expect(backing.has(PRIVACY_MODE_STORAGE_KEY)).toBe(false);

    backing.set(
      PRIVACY_MODE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 99, enabled: true, updatedAtIso: '2026-11-11T15:00:00Z' })
    );
    expect(reloadedStore.readPrivacyMode()).toBe(false);
    expect(backing.has(PRIVACY_MODE_STORAGE_KEY)).toBe(false);

    // S15: QuotaExceededError / SecurityError degrades gracefully to in-memory fallback without throwing
    const throwingStorage: StorageAdapter = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const resilientStore = createLocalFirstStore({ storage: throwingStorage });
    expect(() => resilientStore.writePrivacyMode(true)).not.toThrow();
    expect(resilientStore.readPrivacyMode()).toBe(true);

    resilientStore.clear();
    expect(resilientStore.readPrivacyMode()).toBe(false);

    store.clear();
    expect(backing.size).toBe(0);
  });
});
