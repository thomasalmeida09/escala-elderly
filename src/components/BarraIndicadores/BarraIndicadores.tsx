import { useMemo } from 'react';
import { Box } from '@mui/material';
import {
  type ShiftCostModel,
  buildOperationalKpiPresentation,
  computeOperationalFinancialKpis,
} from '../../services/financialKpiEngine';
import type { Cuidador } from '../../types/caregiver';
import Text from '../common/Text';
import { styles } from './BarraIndicadores.styles';

export interface BarraIndicadoresProps {
  readonly cuidadores: readonly Cuidador[];
  readonly privacyMode?: boolean;
  readonly costModel?: ShiftCostModel;
}

export default function BarraIndicadores({
  cuidadores,
  privacyMode = false,
  costModel,
}: BarraIndicadoresProps) {
  const kpis = useMemo(
    () => computeOperationalFinancialKpis(cuidadores, costModel),
    [cuidadores, costModel]
  );

  const presentation = useMemo(
    () => buildOperationalKpiPresentation(kpis, { privacyMode }),
    [kpis, privacyMode]
  );

  return (
    <Box
      className="no-print"
      role="region"
      aria-labelledby="barra-indicadores-heading"
      sx={styles.container}
    >
      <Box sx={styles.headerRow}>
        <Text id="barra-indicadores-heading" variant="caption" sx={styles.sectionLabel}>
          INDICADORES &amp; ECONOMIA
        </Text>
        <Text
          component="span"
          variant="caption"
          sx={styles.coverageBadge(presentation.thermometerTone)}
        >
          {presentation.coverageBadgeText}
        </Text>
      </Box>

      <Box sx={styles.kpiGrid}>
        <Box sx={styles.kpiCard(presentation.presentesCard.tone)}>
          <Text component="span" variant="caption" sx={styles.kpiLabel}>
            {presentation.presentesCard.label}
          </Text>
          <Text component="span" variant="body2" sx={styles.kpiValue}>
            {presentation.presentesCard.valueText}
          </Text>
          <Text component="span" variant="caption" sx={styles.kpiSubLabel}>
            {presentation.presentesCard.subLabel}
          </Text>
        </Box>

        <Box sx={styles.kpiCard(presentation.faltasCard.tone)}>
          <Text component="span" variant="caption" sx={styles.kpiLabel}>
            {presentation.faltasCard.label}
          </Text>
          <Text component="span" variant="body2" sx={styles.kpiValue}>
            {presentation.faltasCard.valueText}
          </Text>
          <Text component="span" variant="caption" sx={styles.kpiSubLabel}>
            {presentation.faltasCard.subLabel}
          </Text>
        </Box>

        <Box sx={styles.kpiCard(presentation.economiaCard.tone, true)}>
          <Text component="span" variant="caption" sx={styles.kpiLabel}>
            {presentation.economiaCard.label}
          </Text>
          <Text component="span" variant="body2" sx={styles.kpiValue}>
            {presentation.economiaCard.valueText}
          </Text>
          <Text component="span" variant="caption" sx={styles.kpiSubLabel}>
            {presentation.economiaCard.subLabel}
          </Text>
        </Box>
      </Box>

      <Box
        role="progressbar"
        aria-labelledby="barra-indicadores-heading"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={kpis.coverageRatePct}
        aria-valuetext={presentation.progressbarAriaValueText}
        sx={styles.thermometerTrack}
      >
        <Box sx={styles.thermometerFill(kpis.coverageRatePct, presentation.thermometerTone)} />
      </Box>

      <Box
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Resumo operacional do turno"
        sx={styles.statusRow}
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={styles.statusSymbol(presentation.thermometerTone)}
        >
          {presentation.thermometerSymbol}
        </Box>
        <Text
          component="span"
          variant="caption"
          sx={styles.statusText(presentation.thermometerTone)}
        >
          {presentation.statusMessage}
        </Text>
      </Box>
    </Box>
  );
}
