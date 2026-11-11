import { ContractValidationError, type Cuidador } from '../types/caregiver';

export type ThermometerTone = 'optimal' | 'covered' | 'alert' | 'neutral';

export type KpiCardTone = 'optimal' | 'covered' | 'warning' | 'alert' | 'neutral';

export type ThermometerSymbol = '●' | '◆' | '▲' | '○';

/**
 * Modelo unitário de custo de plantão 12h expresso exclusivamente em centavos inteiros (Safe Integer).
 *
 * Premissas auditáveis extraídas da pesquisa de domínio (DEEP-RESEARCH-06):
 * - Plantão 12h planejado / folguista interno elegível (Art. 66 da CLT, descanso >= 11h):
 *   faixa operacional R$ 180,00–R$ 200,00 -> ponto médio canônico R$ 190,00 (19_000 centavos).
 * - Cobertura emergencial de última hora (agência externa / diarista avulso ou dobra CLT 100%
 *   acrescida de indenização de intrajornada suprimida — Art. 71, § 4º da CLT):
 *   faixa real R$ 300,00–R$ 350,00 -> benchmark conservador R$ 315,00 (31_500 centavos).
 * - Economia líquida unitária por falta coberta com reserva interna planejada:
 *   31_500 - 19_000 = 12_500 centavos (R$ 125,00).
 */
export interface ShiftCostModel {
  readonly plannedShiftCentavos: number;
  readonly emergencyBenchmarkCentavos: number;
}

export interface OperationalFinancialKpis {
  readonly totalRosterCount: number;
  readonly presentesCount: number;
  readonly coberturasCount: number;
  readonly faltasCount: number;
  readonly folgasCount: number;
  readonly activePostsCount: number;
  readonly openGapsCount: number;
  readonly requiredPostsCount: number;
  readonly coverageRatePct: number;
  readonly unitSavingsCentavos: number;
  readonly plannedPayrollCentavos: number;
  readonly realizedSavingsCentavos: number;
  readonly avoidableEmergencyExposureCentavos: number;
  readonly emergencyBenchmarkExposureCentavos: number;
  readonly thermometerTone: ThermometerTone;
}

export interface FormatBrlOptions {
  readonly privacyMode?: boolean;
  readonly showPlusSign?: boolean;
}

export interface OperationalKpiPresentationOptions {
  readonly privacyMode?: boolean;
}

export interface OperationalKpiCardView {
  readonly label: string;
  readonly valueText: string;
  readonly subLabel: string;
  readonly tone: KpiCardTone;
}

export interface OperationalKpiPresentation {
  readonly presentesCard: OperationalKpiCardView;
  readonly faltasCard: OperationalKpiCardView;
  readonly economiaCard: OperationalKpiCardView;
  readonly coverageBadgeText: string;
  readonly thermometerTone: ThermometerTone;
  readonly thermometerSymbol: ThermometerSymbol;
  readonly statusMessage: string;
  readonly progressbarAriaValueText: string;
}

export class FinancialModelValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'FinancialModelValidationError';
    this.field = field;
    Object.setPrototypeOf(this, FinancialModelValidationError.prototype);
  }
}

export const MASKED_BRL_VALUE = 'R$ •••,••';

export const DEFAULT_SHIFT_COST_MODEL: Readonly<ShiftCostModel> = Object.freeze({
  plannedShiftCentavos: 19_000,
  emergencyBenchmarkCentavos: 31_500,
});

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatIntegerWithDotThousands(nonNegativeSafeInt: number): string {
  const digits = String(nonNegativeSafeInt);
  if (digits.length <= 3) {
    return digits;
  }

  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    const start = Math.max(0, end - 3);
    groups.push(digits.slice(start, end));
  }
  groups.reverse();
  return groups.join('.');
}

export function validateShiftCostModel(
  costModel: unknown,
  rosterLength = 1
): Readonly<ShiftCostModel> {
  if (!isPlainRecord(costModel)) {
    throw new FinancialModelValidationError(
      'costModel',
      'Modelo de custo de plantão inválido: esperado objeto estruturado.'
    );
  }

  const { plannedShiftCentavos, emergencyBenchmarkCentavos } = costModel;

  if (
    typeof plannedShiftCentavos !== 'number' ||
    !Number.isSafeInteger(plannedShiftCentavos) ||
    plannedShiftCentavos < 0
  ) {
    throw new FinancialModelValidationError(
      'costModel.plannedShiftCentavos',
      'plannedShiftCentavos deve ser um inteiro seguro não-negativo em centavos.'
    );
  }

  if (
    typeof emergencyBenchmarkCentavos !== 'number' ||
    !Number.isSafeInteger(emergencyBenchmarkCentavos) ||
    emergencyBenchmarkCentavos < plannedShiftCentavos
  ) {
    throw new FinancialModelValidationError(
      'costModel.emergencyBenchmarkCentavos',
      'emergencyBenchmarkCentavos deve ser um inteiro seguro maior ou igual a plannedShiftCentavos.'
    );
  }

  const safeScaleMultiplier = Math.max(1, rosterLength);
  const maxProjectedCentavos = safeScaleMultiplier * emergencyBenchmarkCentavos;
  if (!Number.isSafeInteger(maxProjectedCentavos)) {
    throw new FinancialModelValidationError(
      'costModel.emergencyBenchmarkCentavos',
      'Projeção contábil excede Number.MAX_SAFE_INTEGER para o tamanho da escala informada.'
    );
  }

  return Object.freeze({
    plannedShiftCentavos,
    emergencyBenchmarkCentavos,
  });
}

export function formatCentavosToBrl(centavos: number, options: FormatBrlOptions = {}): string {
  if (typeof centavos !== 'number' || !Number.isSafeInteger(centavos)) {
    throw new FinancialModelValidationError(
      'centavos',
      'O valor monetário deve ser um inteiro seguro em centavos (Safe Integer).'
    );
  }

  if (options.privacyMode === true) {
    return MASKED_BRL_VALUE;
  }

  const normalized = centavos === 0 ? 0 : centavos;
  const signPrefix =
    normalized < 0 ? '-' : normalized > 0 && options.showPlusSign === true ? '+' : '';

  const absCentavos = Math.abs(normalized);
  const reaisInt = Math.trunc(absCentavos / 100);
  const centsRem = absCentavos % 100;

  const reaisFormatted = formatIntegerWithDotThousands(reaisInt);
  const centsFormatted = String(centsRem).padStart(2, '0');

  return `${signPrefix}R$ ${reaisFormatted},${centsFormatted}`;
}

export function computeOperationalFinancialKpis(
  cuidadores: readonly Cuidador[],
  costModel: ShiftCostModel = DEFAULT_SHIFT_COST_MODEL
): Readonly<OperationalFinancialKpis> {
  if (!Array.isArray(cuidadores)) {
    throw new ContractValidationError(
      'cuidadores',
      'Lista de cuidadores deve ser um array válido para cálculo de KPIs.'
    );
  }

  const validatedModel = validateShiftCostModel(costModel, cuidadores.length);

  let presentesCount = 0;
  let coberturasCount = 0;
  let faltasCount = 0;
  let folgasCount = 0;

  for (let index = 0; index < cuidadores.length; index += 1) {
    const item = cuidadores[index] as unknown;
    if (!isPlainRecord(item)) {
      throw new ContractValidationError(
        `cuidadores[${index}]`,
        `Registro inválido na posição ${index} da escala.`
      );
    }

    switch (item.status) {
      case 'Presente':
        presentesCount += 1;
        break;
      case 'Cobertura':
        coberturasCount += 1;
        break;
      case 'Faltou':
        faltasCount += 1;
        break;
      case 'Folga':
        folgasCount += 1;
        break;
      default:
        throw new ContractValidationError(
          `cuidadores[${index}].status`,
          `Status operacional desconhecido em cuidadores[${index}].status: "${String(item.status)}".`
        );
    }
  }

  const totalRosterCount = cuidadores.length;
  const activePostsCount = presentesCount + coberturasCount;
  const openGapsCount = faltasCount;
  const requiredPostsCount = activePostsCount + openGapsCount;

  let coverageRatePct: number;
  if (requiredPostsCount === 0 || openGapsCount === 0) {
    coverageRatePct = 100;
  } else if (activePostsCount === 0) {
    coverageRatePct = 0;
  } else {
    coverageRatePct = Math.min(
      99,
      Math.max(1, Math.round((activePostsCount * 100) / requiredPostsCount))
    );
  }

  const unitSavingsCentavos =
    validatedModel.emergencyBenchmarkCentavos - validatedModel.plannedShiftCentavos;
  const plannedPayrollCentavos = activePostsCount * validatedModel.plannedShiftCentavos;
  const realizedSavingsCentavos = coberturasCount * unitSavingsCentavos;
  const avoidableEmergencyExposureCentavos = openGapsCount * unitSavingsCentavos;
  const emergencyBenchmarkExposureCentavos =
    openGapsCount * validatedModel.emergencyBenchmarkCentavos;

  let thermometerTone: ThermometerTone;
  if (openGapsCount > 0) {
    thermometerTone = 'alert';
  } else if (requiredPostsCount === 0) {
    thermometerTone = 'neutral';
  } else if (coberturasCount > 0) {
    thermometerTone = 'covered';
  } else {
    thermometerTone = 'optimal';
  }

  return Object.freeze({
    totalRosterCount,
    presentesCount,
    coberturasCount,
    faltasCount,
    folgasCount,
    activePostsCount,
    openGapsCount,
    requiredPostsCount,
    coverageRatePct,
    unitSavingsCentavos,
    plannedPayrollCentavos,
    realizedSavingsCentavos,
    avoidableEmergencyExposureCentavos,
    emergencyBenchmarkExposureCentavos,
    thermometerTone,
  });
}

function getThermometerSymbol(tone: ThermometerTone): ThermometerSymbol {
  switch (tone) {
    case 'optimal':
      return '●';
    case 'covered':
      return '◆';
    case 'alert':
      return '▲';
    case 'neutral':
      return '○';
  }
}

export function buildOperationalKpiPresentation(
  kpis: OperationalFinancialKpis,
  options: OperationalKpiPresentationOptions = {}
): Readonly<OperationalKpiPresentation> {
  const privacyMode = options.privacyMode === true;

  let presentesSubLabel: string;
  let presentesCardTone: KpiCardTone;

  if (kpis.requiredPostsCount === 0) {
    presentesSubLabel = kpis.folgasCount > 0 ? `${kpis.folgasCount} em folga` : 'Escala vazia';
    presentesCardTone = 'neutral';
  } else if (kpis.activePostsCount === 0) {
    presentesSubLabel = 'Postos vazios';
    presentesCardTone = 'alert';
  } else if (kpis.coberturasCount > 0) {
    presentesSubLabel = `${kpis.presentesCount} tit. + ${kpis.coberturasCount} cob.`;
    presentesCardTone = 'covered';
  } else if (kpis.folgasCount > 0) {
    presentesSubLabel = `${kpis.presentesCount} tit. • ${kpis.folgasCount} folga`;
    presentesCardTone = 'optimal';
  } else {
    presentesSubLabel = `${kpis.presentesCount} ${kpis.presentesCount === 1 ? 'titular' : 'titulares'}`;
    presentesCardTone = 'optimal';
  }

  const presentesCard: OperationalKpiCardView = Object.freeze({
    label: 'PRESENTES',
    valueText: `${kpis.activePostsCount} ${kpis.activePostsCount === 1 ? 'Ativo' : 'Ativos'}`,
    subLabel: presentesSubLabel,
    tone: presentesCardTone,
  });

  const faltasCard: OperationalKpiCardView = Object.freeze({
    label: 'FALTAS',
    valueText: `${kpis.openGapsCount} ${kpis.openGapsCount === 1 ? 'Pendente' : 'Pendentes'}`,
    subLabel: kpis.openGapsCount > 0 ? 'Acionar reserva' : 'Sem furos',
    tone: kpis.openGapsCount > 0 ? 'alert' : 'neutral',
  });

  let economiaSubLabel: string;
  let economiaCardTone: KpiCardTone;

  if (privacyMode) {
    economiaSubLabel = 'Valores ocultos';
    economiaCardTone = 'neutral';
  } else if (kpis.openGapsCount > 0) {
    economiaSubLabel = `Risco: ${formatCentavosToBrl(kpis.avoidableEmergencyExposureCentavos)}`;
    economiaCardTone = 'warning';
  } else if (kpis.coberturasCount > 0) {
    economiaSubLabel = `${kpis.coberturasCount} cob. interna${kpis.coberturasCount === 1 ? '' : 's'}`;
    economiaCardTone = 'optimal';
  } else if (kpis.requiredPostsCount === 0) {
    economiaSubLabel = 'Sem turno ativo';
    economiaCardTone = 'neutral';
  } else {
    economiaSubLabel = 'Custo nominal';
    economiaCardTone = 'neutral';
  }

  const economiaCard: OperationalKpiCardView = Object.freeze({
    label: 'ECONOMIA',
    valueText: formatCentavosToBrl(kpis.realizedSavingsCentavos, {
      privacyMode,
      showPlusSign: true,
    }),
    subLabel: economiaSubLabel,
    tone: economiaCardTone,
  });

  let statusMessage: string;
  let progressbarAriaValueText: string;

  switch (kpis.thermometerTone) {
    case 'neutral': {
      statusMessage = 'Sem postos ativos exigidos na escala atual';
      progressbarAriaValueText = '100% — sem postos ativos exigidos na escala atual';
      break;
    }
    case 'alert': {
      const faltaLabel =
        kpis.openGapsCount === 1 ? '1 falta pendente' : `${kpis.openGapsCount} faltas pendentes`;
      if (privacyMode) {
        statusMessage = `${faltaLabel} — acione reserva elegível abaixo`;
        progressbarAriaValueText = `${kpis.coverageRatePct}% dos postos assistidos (${kpis.activePostsCount} ativos, ${faltaLabel}; valores financeiros ocultos)`;
      } else {
        const exposureFormatted = formatCentavosToBrl(kpis.avoidableEmergencyExposureCentavos);
        statusMessage = `${faltaLabel} — acione reserva (evita +${exposureFormatted} urg.)`;
        progressbarAriaValueText = `${kpis.coverageRatePct}% dos postos assistidos (${kpis.activePostsCount} ativos, ${faltaLabel}; exposição emergencial evitável de ${exposureFormatted})`;
      }
      break;
    }
    case 'covered': {
      if (privacyMode) {
        statusMessage = '100% assistido • Cobertura interna ativa';
        progressbarAriaValueText = `100% dos postos assistidos (${kpis.presentesCount} titulares e ${kpis.coberturasCount} cobertura${kpis.coberturasCount === 1 ? '' : 's'}; valores financeiros ocultos)`;
      } else {
        const savingsFormatted = formatCentavosToBrl(kpis.realizedSavingsCentavos, {
          showPlusSign: true,
        });
        statusMessage = `100% assistido • ${savingsFormatted} economizados c/ reserva`;
        progressbarAriaValueText = `100% dos postos assistidos (${kpis.presentesCount} titulares e ${kpis.coberturasCount} cobertura${kpis.coberturasCount === 1 ? '' : 's'}; economia realizada de ${savingsFormatted})`;
      }
      break;
    }
    case 'optimal': {
      statusMessage = '100% dos postos assistidos • Escala nominal sem sobrecusto';
      progressbarAriaValueText = `100% dos postos assistidos (${kpis.presentesCount} ${kpis.presentesCount === 1 ? 'titular ativo' : 'titulares ativos'} sem sobrecusto)`;
      break;
    }
  }

  const coverageBadgeText =
    kpis.requiredPostsCount === 0
      ? 'SEM TURNO ATIVO'
      : kpis.openGapsCount > 0
        ? `${kpis.coverageRatePct}% ASSISTIDO`
        : '100% ASSISTIDO';

  return Object.freeze({
    presentesCard,
    faltasCard,
    economiaCard,
    coverageBadgeText,
    thermometerTone: kpis.thermometerTone,
    thermometerSymbol: getThermometerSymbol(kpis.thermometerTone),
    statusMessage,
    progressbarAriaValueText,
  });
}
