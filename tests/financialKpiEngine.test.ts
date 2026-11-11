import { describe, expect, it } from 'vitest';
import { buildA4ScheduleDocumentModel } from '../src/services/a4PdfScheduleEngine';
import {
  DEFAULT_SHIFT_COST_MODEL,
  FinancialModelValidationError,
  MASKED_BRL_VALUE,
  buildOperationalKpiPresentation,
  computeOperationalFinancialKpis,
  formatCentavosToBrl,
} from '../src/services/financialKpiEngine';
import { getCanonicalSeed } from '../src/services/localFirstStore';
import {
  ContractValidationError,
  MAX_BATCH_SIZE,
  type Cuidador,
  applyStatusChange,
  parseCuidador,
} from '../src/types/caregiver';

function buildCaregiver(id: number, status: Cuidador['status'], substituto?: string): Cuidador {
  return parseCuidador({
    id,
    nome: `Profissional ${id}`,
    status,
    turno: id % 2 === 0 ? 'Noturno (19h-07h)' : 'Diurno (07h-19h)',
    quarto: `Ala ${(id % 10) + 1}`,
    telefone: `+55 11 90000-01${String(id % 100).padStart(2, '0')}`,
    horasDescanso: 24,
    ...(substituto !== undefined ? { substituto } : {}),
  });
}

describe('FE #8 — Operational & Financial KPI Engine (Integer Centavos, Anti-Simpson & LGPD Masking)', () => {
  it('1. computes nominal 4-Presente seed KPIs with 100% coverage, zero gaps, zero savings, and frozen snapshots (S08)', () => {
    const seed = getCanonicalSeed();
    const seedSnapshotBefore = JSON.stringify(seed);

    const kpis = computeOperationalFinancialKpis(seed);

    expect(JSON.stringify(seed)).toBe(seedSnapshotBefore);
    expect(Object.isFrozen(DEFAULT_SHIFT_COST_MODEL)).toBe(true);
    expect(Object.isFrozen(kpis)).toBe(true);

    expect(kpis).toEqual({
      totalRosterCount: 4,
      presentesCount: 4,
      coberturasCount: 0,
      faltasCount: 0,
      folgasCount: 0,
      activePostsCount: 4,
      openGapsCount: 0,
      requiredPostsCount: 4,
      coverageRatePct: 100,
      unitSavingsCentavos: 12_500,
      plannedPayrollCentavos: 76_000,
      realizedSavingsCentavos: 0,
      avoidableEmergencyExposureCentavos: 0,
      emergencyBenchmarkExposureCentavos: 0,
      thermometerTone: 'optimal',
    });

    const view = buildOperationalKpiPresentation(kpis);
    expect(Object.isFrozen(view)).toBe(true);
    expect(view.presentesCard.valueText).toBe('4 Ativos');
    expect(view.presentesCard.subLabel).toBe('4 titulares');
    expect(view.faltasCard.valueText).toBe('0 Pendentes');
    expect(view.economiaCard.valueText).toBe('R$ 0,00');
    expect(view.thermometerSymbol).toBe('●');
    expect(view.statusMessage).toContain('Escala nominal sem sobrecusto');
  });

  it('2. excludes Folga from requiredPostsCount denominator to defeat Simpson Paradox distortion (S01)', () => {
    const rosterWithFolgas: readonly Cuidador[] = [
      buildCaregiver(1, 'Presente'),
      buildCaregiver(2, 'Presente'),
      buildCaregiver(3, 'Presente'),
      buildCaregiver(4, 'Presente'),
      buildCaregiver(5, 'Folga'),
      buildCaregiver(6, 'Folga'),
    ];

    const kpis = computeOperationalFinancialKpis(rosterWithFolgas);

    expect(kpis.totalRosterCount).toBe(6);
    expect(kpis.presentesCount).toBe(4);
    expect(kpis.folgasCount).toBe(2);
    expect(kpis.activePostsCount).toBe(4);
    expect(kpis.requiredPostsCount).toBe(4);
    expect(kpis.coverageRatePct).toBe(100);
    expect(kpis.thermometerTone).toBe('optimal');

    const view = buildOperationalKpiPresentation(kpis);
    expect(view.presentesCard.subLabel).toBe('4 tit. • 2 folga');
  });

  it('3. handles empty roster [] and 100%-Folga roster safely without NaN or division by zero (S02)', () => {
    const emptyKpis = computeOperationalFinancialKpis([]);
    expect(Number.isInteger(emptyKpis.coverageRatePct)).toBe(true);
    expect(emptyKpis.coverageRatePct).toBe(100);
    expect(emptyKpis.requiredPostsCount).toBe(0);
    expect(emptyKpis.thermometerTone).toBe('neutral');

    const emptyView = buildOperationalKpiPresentation(emptyKpis);
    expect(emptyView.thermometerSymbol).toBe('○');
    expect(emptyView.coverageBadgeText).toBe('SEM TURNO ATIVO');
    expect(emptyView.presentesCard.subLabel).toBe('Escala vazia');
    expect(emptyView.economiaCard.subLabel).toBe('Sem turno ativo');

    const allFolgaKpis = computeOperationalFinancialKpis([
      buildCaregiver(1, 'Folga'),
      buildCaregiver(2, 'Folga'),
    ]);
    expect(allFolgaKpis.requiredPostsCount).toBe(0);
    expect(allFolgaKpis.folgasCount).toBe(2);
    expect(allFolgaKpis.coverageRatePct).toBe(100);
    expect(allFolgaKpis.thermometerTone).toBe('neutral');

    const allFolgaView = buildOperationalKpiPresentation(allFolgaKpis);
    expect(allFolgaView.presentesCard.subLabel).toBe('2 em folga');
  });

  it('4. tracks Carlos absence (75% alert, R$ 125,00 avoidable exposure) -> Beatriz coverage (100% covered, +R$ 125,00 realized savings)', () => {
    const seed = getCanonicalSeed();
    const withCarlosAbsent = seed.map((c) => (c.id === 3 ? applyStatusChange(c, 'Faltou') : c));

    const alertKpis = computeOperationalFinancialKpis(withCarlosAbsent);
    expect(alertKpis.activePostsCount).toBe(3);
    expect(alertKpis.openGapsCount).toBe(1);
    expect(alertKpis.coverageRatePct).toBe(75);
    expect(alertKpis.realizedSavingsCentavos).toBe(0);
    expect(alertKpis.avoidableEmergencyExposureCentavos).toBe(12_500);
    expect(alertKpis.emergencyBenchmarkExposureCentavos).toBe(31_500);
    expect(alertKpis.thermometerTone).toBe('alert');

    const alertView = buildOperationalKpiPresentation(alertKpis);
    expect(alertView.presentesCard.valueText).toBe('3 Ativos');
    expect(alertView.faltasCard.valueText).toBe('1 Pendente');
    expect(alertView.economiaCard.valueText).toBe('R$ 0,00');
    expect(alertView.economiaCard.subLabel).toBe('Risco: R$ 125,00');
    expect(alertView.thermometerSymbol).toBe('▲');
    expect(alertView.statusMessage).toContain('evita +R$ 125,00 urg.');

    const withBeatrizCovered = withCarlosAbsent.map((c) =>
      c.id === 3 ? applyStatusChange(c, 'Cobertura', 'Beatriz Alves') : c
    );
    const coveredKpis = computeOperationalFinancialKpis(withBeatrizCovered);
    expect(coveredKpis.activePostsCount).toBe(4);
    expect(coveredKpis.presentesCount).toBe(3);
    expect(coveredKpis.coberturasCount).toBe(1);
    expect(coveredKpis.openGapsCount).toBe(0);
    expect(coveredKpis.coverageRatePct).toBe(100);
    expect(coveredKpis.realizedSavingsCentavos).toBe(12_500);
    expect(coveredKpis.avoidableEmergencyExposureCentavos).toBe(0);
    expect(coveredKpis.thermometerTone).toBe('covered');

    const coveredView = buildOperationalKpiPresentation(coveredKpis);
    expect(coveredView.presentesCard.valueText).toBe('4 Ativos');
    expect(coveredView.presentesCard.subLabel).toBe('3 tit. + 1 cob.');
    expect(coveredView.faltasCard.valueText).toBe('0 Pendentes');
    expect(coveredView.economiaCard.valueText).toBe('+R$ 125,00');
    expect(coveredView.economiaCard.subLabel).toBe('1 cob. interna');
    expect(coveredView.thermometerSymbol).toBe('◆');
    expect(coveredView.statusMessage).toContain('+R$ 125,00 economizados');
  });

  it('5. preserves realizedSavingsCentavos (+R$ 125,00) alongside open emergency exposure when Cobertura and Faltou coexist (M1.2 / S06)', () => {
    const mixedRoster: readonly Cuidador[] = [
      buildCaregiver(1, 'Presente'),
      buildCaregiver(2, 'Presente'),
      buildCaregiver(3, 'Cobertura', 'Beatriz Alves'),
      buildCaregiver(4, 'Faltou'),
    ];

    const mixedKpis = computeOperationalFinancialKpis(mixedRoster);
    expect(mixedKpis.activePostsCount).toBe(3);
    expect(mixedKpis.coberturasCount).toBe(1);
    expect(mixedKpis.openGapsCount).toBe(1);
    expect(mixedKpis.coverageRatePct).toBe(75);
    expect(mixedKpis.realizedSavingsCentavos).toBe(12_500);
    expect(mixedKpis.avoidableEmergencyExposureCentavos).toBe(12_500);
    expect(mixedKpis.thermometerTone).toBe('alert');

    const mixedView = buildOperationalKpiPresentation(mixedKpis);
    expect(mixedView.economiaCard.valueText).toBe('+R$ 125,00');
    expect(mixedView.economiaCard.subLabel).toBe('Risco: R$ 125,00');
    expect(mixedView.economiaCard.tone).toBe('warning');
  });

  it('6. clamps coverageRatePct to [1..99] whenever both active posts and open gaps exist, preventing false 100% or false 0% (M1.3 / S03)', () => {
    const almostFullRoster: Cuidador[] = [];
    for (let i = 1; i <= 199; i += 1) {
      almostFullRoster.push(buildCaregiver(i, 'Presente'));
    }
    almostFullRoster.push(buildCaregiver(200, 'Faltou'));

    const highKpis = computeOperationalFinancialKpis(almostFullRoster);
    expect(highKpis.coverageRatePct).toBe(99);
    expect(highKpis.thermometerTone).toBe('alert');

    const almostEmptyRoster: Cuidador[] = [buildCaregiver(1, 'Presente')];
    for (let i = 2; i <= 201; i += 1) {
      almostEmptyRoster.push(buildCaregiver(i, 'Faltou'));
    }

    const lowKpis = computeOperationalFinancialKpis(almostEmptyRoster);
    expect(lowKpis.coverageRatePct).toBe(1);
    expect(lowKpis.thermometerTone).toBe('alert');

    const totalCollapseKpis = computeOperationalFinancialKpis([
      buildCaregiver(1, 'Faltou'),
      buildCaregiver(2, 'Faltou'),
    ]);
    expect(totalCollapseKpis.coverageRatePct).toBe(0);
    expect(totalCollapseKpis.activePostsCount).toBe(0);
    expect(buildOperationalKpiPresentation(totalCollapseKpis).presentesCard.subLabel).toBe(
      'Postos vazios'
    );
  });

  it('7. formats integer centavos deterministically with ASCII spaces, zero-sign discipline, thousands grouping, and full LGPD masking (S04, S05, S09)', () => {
    expect(formatCentavosToBrl(0)).toBe('R$ 0,00');
    expect(formatCentavosToBrl(-0)).toBe('R$ 0,00');
    expect(formatCentavosToBrl(0, { showPlusSign: true })).toBe('R$ 0,00');
    expect(formatCentavosToBrl(-0, { showPlusSign: true })).toBe('R$ 0,00');

    expect(formatCentavosToBrl(12_500)).toBe('R$ 125,00');
    expect(formatCentavosToBrl(12_500, { showPlusSign: true })).toBe('+R$ 125,00');
    expect(formatCentavosToBrl(-12_500, { showPlusSign: true })).toBe('-R$ 125,00');
    expect(formatCentavosToBrl(125_000, { showPlusSign: true })).toBe('+R$ 1.250,00');
    expect(formatCentavosToBrl(125_000_005)).toBe('R$ 1.250.000,05');

    // Never emits non-breaking space \u00A0 from Intl.NumberFormat (S04)
    expect(formatCentavosToBrl(12_500)).not.toContain('\u00A0');

    // Full privacyMode suppression including sign suppression (M3 / S09)
    expect(formatCentavosToBrl(0, { privacyMode: true, showPlusSign: true })).toBe(
      MASKED_BRL_VALUE
    );
    expect(formatCentavosToBrl(12_500, { privacyMode: true, showPlusSign: true })).toBe(
      MASKED_BRL_VALUE
    );
    expect(formatCentavosToBrl(-12_500, { privacyMode: true })).toBe(MASKED_BRL_VALUE);

    // Zero financial digits leaked across visual & ARIA strings under privacyMode (M3 / S09)
    const mixedKpis = computeOperationalFinancialKpis([
      buildCaregiver(1, 'Presente'),
      buildCaregiver(2, 'Cobertura', 'Beatriz Alves'),
      buildCaregiver(3, 'Faltou'),
    ]);
    const maskedAlertView = buildOperationalKpiPresentation(mixedKpis, { privacyMode: true });
    expect(maskedAlertView.economiaCard.valueText).toBe('R$ •••,••');
    expect(maskedAlertView.economiaCard.subLabel).toBe('Valores ocultos');
    expect(maskedAlertView.statusMessage).not.toMatch(/125|190|315|R\$/);
    expect(maskedAlertView.progressbarAriaValueText).toContain('valores financeiros ocultos');
    expect(maskedAlertView.progressbarAriaValueText).not.toMatch(/125|190|315|R\$/);

    const coveredOnlyKpis = computeOperationalFinancialKpis([
      buildCaregiver(1, 'Presente'),
      buildCaregiver(2, 'Cobertura', 'Beatriz Alves'),
    ]);
    const maskedCoveredView = buildOperationalKpiPresentation(coveredOnlyKpis, {
      privacyMode: true,
    });
    expect(maskedCoveredView.economiaCard.valueText).toBe('R$ •••,••');
    expect(maskedCoveredView.statusMessage).not.toMatch(/125|190|315|R\$/);
    expect(maskedCoveredView.progressbarAriaValueText).not.toMatch(/125|190|315|R\$/);
  });

  it('8. rejects invalid ShiftCostModel, non-integer centavos, overflow, and corrupted runtime caregiver statuses (M1.4 / S07)', () => {
    expect(() => formatCentavosToBrl(190.5)).toThrow(FinancialModelValidationError);
    expect(() => formatCentavosToBrl(Number.NaN)).toThrow(FinancialModelValidationError);
    expect(() => formatCentavosToBrl(Number.POSITIVE_INFINITY)).toThrow(
      FinancialModelValidationError
    );

    const seed = getCanonicalSeed();
    expect(() =>
      computeOperationalFinancialKpis(seed, {
        plannedShiftCentavos: -1,
        emergencyBenchmarkCentavos: 31_500,
      })
    ).toThrow(FinancialModelValidationError);

    expect(() =>
      computeOperationalFinancialKpis(seed, {
        plannedShiftCentavos: 35_000,
        emergencyBenchmarkCentavos: 31_500,
      })
    ).toThrow(FinancialModelValidationError);

    expect(() =>
      computeOperationalFinancialKpis(seed, {
        plannedShiftCentavos: 190.25,
        emergencyBenchmarkCentavos: 31_500,
      })
    ).toThrow(FinancialModelValidationError);

    expect(() =>
      computeOperationalFinancialKpis(seed, {
        plannedShiftCentavos: 19_000,
        emergencyBenchmarkCentavos: Math.floor(Number.MAX_SAFE_INTEGER / 2),
      })
    ).toThrow(FinancialModelValidationError);

    const corruptedItem = { ...seed[0], status: 'Atrasado' } as unknown as Cuidador;
    expect(() => computeOperationalFinancialKpis([corruptedItem])).toThrow(ContractValidationError);
    expect(() => computeOperationalFinancialKpis(null as unknown as readonly Cuidador[])).toThrow(
      ContractValidationError
    );
  });

  it('9. guarantees 1:1 counter reconciliation with buildA4ScheduleDocumentModel and executes 500-row batch in < 10ms (M5 / S16)', () => {
    const batch500: Cuidador[] = [];
    const statuses: readonly Cuidador['status'][] = ['Presente', 'Cobertura', 'Faltou', 'Folga'];

    for (let i = 1; i <= MAX_BATCH_SIZE; i += 1) {
      const status = statuses[i % statuses.length];
      batch500.push(buildCaregiver(i, status, status === 'Cobertura' ? 'Diana Costa' : undefined));
    }

    const t0 = performance.now();
    const kpis500 = computeOperationalFinancialKpis(batch500);
    const elapsedMs = performance.now() - t0;

    expect(kpis500.totalRosterCount).toBe(MAX_BATCH_SIZE);
    expect(elapsedMs).toBeLessThan(10);

    for (const sample of [[], getCanonicalSeed(), batch500] as const) {
      const kpis = computeOperationalFinancialKpis(sample);
      const pdfModel = buildA4ScheduleDocumentModel(sample, {
        emittedAtIso: '2026-11-11T12:00:00.000Z',
      });

      expect(kpis.totalRosterCount).toBe(pdfModel.summary.total);
      expect(kpis.presentesCount).toBe(pdfModel.summary.presentes);
      expect(kpis.coberturasCount).toBe(pdfModel.summary.coberturas);
      expect(kpis.faltasCount).toBe(pdfModel.summary.faltas);
      expect(kpis.folgasCount).toBe(pdfModel.summary.folgas);
      expect(kpis.presentesCount + kpis.coberturasCount + kpis.faltasCount + kpis.folgasCount).toBe(
        kpis.totalRosterCount
      );
    }
  });
});
