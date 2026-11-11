import type { SxProps, Theme } from '@mui/material';

export const PAINEL_COBERTURA_TOKENS = {
  header: {
    bg: '#FEF3C7',
    fg: '#92400E',
    border: '#FCD34D',
  },
  surface: {
    bg: '#FFFFFF',
    fg: '#1A1D1A',
    border: '#FCD34D',
    accentBorder: '#D97706',
  },
  meta: {
    bg: '#FFFFFF',
    fg: '#4B5563',
    border: '#E5E7EB',
  },
  restBadge: {
    bg: '#E6F2F2',
    fg: '#005C5A',
    border: '#B8DCDC',
  },
  whatsAppButton: {
    bg: '#FFFFFF',
    hoverBg: '#ECFDF5',
    fg: '#065F46',
    border: '#065F46',
  },
  confirmButton: {
    bg: '#007A78',
    hoverBg: '#005C5A',
    fg: '#FFFFFF',
    border: '#007A78',
  },
  exhaustedAlert: {
    bg: '#FEF3C7',
    fg: '#92400E',
    border: '#FCD34D',
  },
} as const;

export const styles = {
  panelContainer: {
    bgcolor: PAINEL_COBERTURA_TOKENS.surface.bg,
    border: `1px solid ${PAINEL_COBERTURA_TOKENS.surface.border}`,
    borderLeft: `4px solid ${PAINEL_COBERTURA_TOKENS.surface.accentBorder}`,
    borderRadius: '8px',
    p: 2,
    boxShadow: '0px 6px 20px rgba(45, 49, 46, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: 1.5,
    minWidth: 0,
  } as SxProps<Theme>,

  headerBand: {
    bgcolor: PAINEL_COBERTURA_TOKENS.header.bg,
    color: PAINEL_COBERTURA_TOKENS.header.fg,
    border: `1px solid ${PAINEL_COBERTURA_TOKENS.header.border}`,
    borderRadius: '6px',
    px: 1.25,
    py: 0.75,
    display: 'flex',
    flexDirection: 'column',
    gap: 0.25,
    minWidth: 0,
  } as SxProps<Theme>,

  headerTitle: {
    color: PAINEL_COBERTURA_TOKENS.header.fg,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  } as SxProps<Theme>,

  complianceNote: {
    color: PAINEL_COBERTURA_TOKENS.meta.fg,
    fontSize: '0.72rem',
    lineHeight: 1.4,
    letterSpacing: '0.01em',
    textTransform: 'none',
    overflowWrap: 'anywhere',
  } as SxProps<Theme>,

  candidatesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1.25,
    m: 0,
    p: 0,
    listStyle: 'none',
    minWidth: 0,
  } as SxProps<Theme>,

  candidateCard: {
    bgcolor: PAINEL_COBERTURA_TOKENS.surface.bg,
    border: `1px solid ${PAINEL_COBERTURA_TOKENS.meta.border}`,
    borderRadius: '6px',
    p: 1.5,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.25,
    minWidth: 0,
  } as SxProps<Theme>,

  candidateTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 0.75,
    minWidth: 0,
  } as SxProps<Theme>,

  candidateInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0.25,
    minWidth: 0,
    flex: '1 1 160px',
  } as SxProps<Theme>,

  candidateName: {
    color: PAINEL_COBERTURA_TOKENS.surface.fg,
    fontWeight: 600,
    fontSize: '0.92rem',
    lineHeight: 1.3,
    overflowWrap: 'anywhere',
  } as SxProps<Theme>,

  candidateMeta: {
    color: PAINEL_COBERTURA_TOKENS.meta.fg,
    fontSize: '0.72rem',
    lineHeight: 1.35,
    letterSpacing: '0.01em',
    textTransform: 'none',
    overflowWrap: 'anywhere',
  } as SxProps<Theme>,

  restBadge: {
    bgcolor: PAINEL_COBERTURA_TOKENS.restBadge.bg,
    color: PAINEL_COBERTURA_TOKENS.restBadge.fg,
    border: `1px solid ${PAINEL_COBERTURA_TOKENS.restBadge.border}`,
    borderRadius: '6px',
    px: 1,
    py: 0.35,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '0.66rem',
    fontWeight: 700,
    letterSpacing: '0.03em',
    lineHeight: 1.3,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  } as SxProps<Theme>,

  actionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    width: '100%',
    minWidth: 0,
  } as SxProps<Theme>,

  buttonIcon: {
    mr: 0.65,
    display: 'inline-block',
  } as SxProps<Theme>,

  whatsAppButton: {
    flex: '1 1 156px',
    minHeight: '38px',
    px: 1.5,
    py: 0.75,
    bgcolor: PAINEL_COBERTURA_TOKENS.whatsAppButton.bg,
    color: PAINEL_COBERTURA_TOKENS.whatsAppButton.fg,
    borderColor: PAINEL_COBERTURA_TOKENS.whatsAppButton.border,
    fontSize: '0.78rem',
    fontWeight: 600,
    lineHeight: 1.25,
    whiteSpace: 'normal',
    textAlign: 'center',
    boxShadow: 'none',
    '&:hover': {
      bgcolor: PAINEL_COBERTURA_TOKENS.whatsAppButton.hoverBg,
      borderColor: PAINEL_COBERTURA_TOKENS.whatsAppButton.border,
      boxShadow: 'none',
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  } as SxProps<Theme>,

  confirmButton: {
    flex: '1 1 156px',
    minHeight: '38px',
    px: 1.5,
    py: 0.75,
    bgcolor: PAINEL_COBERTURA_TOKENS.confirmButton.bg,
    color: PAINEL_COBERTURA_TOKENS.confirmButton.fg,
    fontSize: '0.78rem',
    fontWeight: 600,
    lineHeight: 1.25,
    whiteSpace: 'normal',
    textAlign: 'center',
    '&:hover': {
      bgcolor: PAINEL_COBERTURA_TOKENS.confirmButton.hoverBg,
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  } as SxProps<Theme>,

  exhaustedBanner: {
    bgcolor: PAINEL_COBERTURA_TOKENS.exhaustedAlert.bg,
    color: PAINEL_COBERTURA_TOKENS.exhaustedAlert.fg,
    border: `1px solid ${PAINEL_COBERTURA_TOKENS.exhaustedAlert.border}`,
    borderRadius: '6px',
    p: 1.5,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.25,
    minWidth: 0,
  } as SxProps<Theme>,

  exhaustedText: {
    color: PAINEL_COBERTURA_TOKENS.exhaustedAlert.fg,
    fontSize: '0.78rem',
    fontWeight: 600,
    lineHeight: 1.4,
    textTransform: 'none',
    overflowWrap: 'anywhere',
  } as SxProps<Theme>,
};
