import type { SxProps, Theme } from '@mui/material';
import type { KpiCardTone, ThermometerTone } from '../../services/financialKpiEngine';

export interface KpiSurfaceToken {
  readonly fg: string;
  readonly bg: string;
  readonly border: string;
}

export interface ThermometerFillToken {
  readonly fill: string;
  readonly trackBg: string;
  readonly textOnSurface: string;
}

/**
 * Paleta pré-certificada matematicamente em luminância relativa sRGB para WCAG 2.2 AA:
 * - Texto (WCAG 1.4.3 >= 4.5:1):
 *   - surface:      #1A1D1A / #FFFFFF = 17.01:1
 *   - sectionTitle: #005C5A / #FFFFFF =  7.84:1
 *   - mutedText:    #4B5563 / #FFFFFF =  7.56:1
 *   - kpiOptimal:   #065F46 / #ECFDF5 =  7.29:1
 *   - kpiCovered:   #1E3A8A / #EFF6FF =  9.52:1
 *   - kpiWarning:   #92400E / #FEF3C7 =  6.37:1
 *   - kpiAlert:     #991B1B / #FEF2F2 =  7.60:1
 *   - kpiNeutral:   #334155 / #F8FAFC =  9.90:1
 * - Contraste Gráfico Não-Textual (WCAG 1.4.11 >= 3.0:1):
 *   - kpiOptimal.border (#059669 vs #ECFDF5)        = 3.58:1
 *   - kpiCovered.border (#2563EB vs #EFF6FF)        = 4.75:1
 *   - kpiWarning.border (#B45309 vs #FEF3C7)        = 4.51:1
 *   - kpiAlert.border   (#DC2626 vs #FEF2F2)        = 4.41:1
 *   - kpiNeutral.border (#64748B vs #F8FAFC)        = 4.55:1
 *   - thermometerTrack.border (#64748B vs #FFFFFF)  = 4.76:1
 *   - thermometerFill.optimal (#007A78 vs #F1F5F9)  = 4.73:1
 *   - thermometerFill.covered (#1D4ED8 vs #F1F5F9)  = 6.12:1
 *   - thermometerFill.alert   (#DC2626 vs #F1F5F9)  = 4.41:1
 *   - thermometerFill.neutral (#475569 vs #F1F5F9)  = 6.92:1
 */
export const BARRA_INDICADORES_TOKENS = {
  surface: {
    fg: '#1A1D1A',
    bg: '#FFFFFF',
    border: '#EBE9E5',
  },
  sectionTitle: {
    fg: '#005C5A',
    bg: '#FFFFFF',
  },
  mutedText: {
    fg: '#4B5563',
    bg: '#FFFFFF',
  },
  kpiCards: {
    optimal: {
      fg: '#065F46',
      bg: '#ECFDF5',
      border: '#059669',
    },
    covered: {
      fg: '#1E3A8A',
      bg: '#EFF6FF',
      border: '#2563EB',
    },
    warning: {
      fg: '#92400E',
      bg: '#FEF3C7',
      border: '#B45309',
    },
    alert: {
      fg: '#991B1B',
      bg: '#FEF2F2',
      border: '#DC2626',
    },
    neutral: {
      fg: '#334155',
      bg: '#F8FAFC',
      border: '#64748B',
    },
  } satisfies Readonly<Record<KpiCardTone, KpiSurfaceToken>>,
  thermometerTrack: {
    bg: '#F1F5F9',
    border: '#64748B',
  },
  thermometerFill: {
    optimal: {
      fill: '#007A78',
      trackBg: '#F1F5F9',
      textOnSurface: '#005C5A',
    },
    covered: {
      fill: '#1D4ED8',
      trackBg: '#F1F5F9',
      textOnSurface: '#1E3A8A',
    },
    alert: {
      fill: '#DC2626',
      trackBg: '#F1F5F9',
      textOnSurface: '#991B1B',
    },
    neutral: {
      fill: '#475569',
      trackBg: '#F1F5F9',
      textOnSurface: '#4B5563',
    },
  } satisfies Readonly<Record<ThermometerTone, ThermometerFillToken>>,
} as const;

export const styles = {
  container: {
    bgcolor: BARRA_INDICADORES_TOKENS.surface.bg,
    color: BARRA_INDICADORES_TOKENS.surface.fg,
    p: '6px 10px',
    mb: 1,
    borderRadius: '8px',
    border: `1px solid ${BARRA_INDICADORES_TOKENS.surface.border}`,
    boxShadow: '0px 4px 20px rgba(45, 49, 46, 0.03)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  } as SxProps<Theme>,

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 0.75,
    minWidth: 0,
  } as SxProps<Theme>,

  sectionLabel: {
    color: BARRA_INDICADORES_TOKENS.sectionTitle.fg,
    fontWeight: 700,
    fontSize: '0.625rem',
    lineHeight: 1.15,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  } as SxProps<Theme>,

  coverageBadge: (tone: ThermometerTone): SxProps<Theme> => ({
    color: BARRA_INDICADORES_TOKENS.thermometerFill[tone].textOnSurface,
    fontFamily: '"JetBrains Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
    fontSize: '0.62rem',
    lineHeight: 1.15,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
  }),

  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '6px',
    minWidth: 0,
    '@media (max-width: 359.95px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  } as SxProps<Theme>,

  kpiCard: (tone: KpiCardTone, spanFullOnTinyViewport = false): SxProps<Theme> => {
    const token = BARRA_INDICADORES_TOKENS.kpiCards[tone];
    return {
      bgcolor: token.bg,
      color: token.fg,
      border: `1px solid ${token.border}`,
      borderRadius: '6px',
      p: '4px 6px',
      display: 'flex',
      flexDirection: 'column',
      gap: '1px',
      minWidth: 0,
      overflow: 'hidden',
      ...(spanFullOnTinyViewport
        ? {
            '@media (max-width: 359.95px)': {
              gridColumn: '1 / -1',
            },
          }
        : {}),
    };
  },

  kpiLabel: {
    color: 'inherit',
    fontSize: '0.575rem',
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  } as SxProps<Theme>,

  kpiValue: {
    color: 'inherit',
    fontFamily: '"JetBrains Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
    fontSize: { xs: '0.72rem', sm: '0.82rem' },
    fontWeight: 800,
    lineHeight: 1.2,
    letterSpacing: '-0.03em',
    whiteSpace: 'nowrap',
    textTransform: 'none',
  } as SxProps<Theme>,

  kpiSubLabel: {
    color: 'inherit',
    fontSize: '0.575rem',
    fontWeight: 600,
    lineHeight: 1.15,
    textTransform: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as SxProps<Theme>,

  thermometerTrack: {
    width: '100%',
    height: '6px',
    borderRadius: '999px',
    bgcolor: BARRA_INDICADORES_TOKENS.thermometerTrack.bg,
    border: `1px solid ${BARRA_INDICADORES_TOKENS.thermometerTrack.border}`,
    overflow: 'hidden',
    boxSizing: 'border-box',
  } as SxProps<Theme>,

  thermometerFill: (coverageRatePct: number, tone: ThermometerTone): SxProps<Theme> => ({
    width: `${coverageRatePct}%`,
    height: '100%',
    bgcolor: BARRA_INDICADORES_TOKENS.thermometerFill[tone].fill,
    borderRadius: '999px',
    transition: 'width 0.2s ease-out',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  }),

  statusRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    minWidth: 0,
  } as SxProps<Theme>,

  statusSymbol: (tone: ThermometerTone): SxProps<Theme> => ({
    color: BARRA_INDICADORES_TOKENS.thermometerFill[tone].textOnSurface,
    fontSize: '0.62rem',
    lineHeight: 1.15,
    fontWeight: 800,
    flexShrink: 0,
  }),

  statusText: (tone: ThermometerTone): SxProps<Theme> => ({
    color: BARRA_INDICADORES_TOKENS.thermometerFill[tone].textOnSurface,
    fontSize: '0.61rem',
    fontWeight: 600,
    lineHeight: 1.2,
    textTransform: 'none',
    minWidth: 0,
    overflowWrap: 'break-word',
  }),
};
