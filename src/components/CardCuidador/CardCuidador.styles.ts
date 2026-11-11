import type { SxProps, Theme } from '@mui/material';
import type { StatusCuidador } from '../../types/caregiver';

export interface StatusColorToken {
  readonly bg: string;
  readonly fg: string;
  readonly border: string;
}

export const CARD_STATUS_TOKENS: Readonly<Record<StatusCuidador, StatusColorToken>> = {
  Presente: {
    bg: '#E6F2F2',
    fg: '#005C5A',
    border: '#B8DCDC',
  },
  Faltou: {
    bg: '#FEF3C7',
    fg: '#92400E',
    border: '#FCD34D',
  },
  Folga: {
    bg: '#F3F4F6',
    fg: '#374151',
    border: '#D1D5DB',
  },
  Cobertura: {
    bg: '#DBEAFE',
    fg: '#1E40AF',
    border: '#93C5FD',
  },
};

export const styles = {
  cardItem: {
    width: '100%',
    textAlign: 'left',
    fontFamily: 'inherit',
    bgcolor: 'background.paper',
    p: 3,
    borderRadius: '8px',
    boxShadow: '0px 6px 24px rgba(45, 49, 46, 0.04)',
    border: '1px solid rgba(235, 233, 229, 0.85)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 1.5,
    cursor: 'pointer',
    transition: 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.22s ease',
    '&:hover': {
      transform: 'translateY(-3px)',
      boxShadow: '0px 12px 30px rgba(45, 49, 46, 0.08)',
    },
    '&:focus-visible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
      '&:hover': {
        transform: 'none',
      },
    },
  } as SxProps<Theme>,

  infoGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    minWidth: 0,
  } as SxProps<Theme>,

  caregiverName: {
    fontWeight: 600,
    display: 'block',
  } as SxProps<Theme>,

  metaLine: {
    color: 'text.secondary',
    display: 'block',
    mt: 0.5,
    textTransform: 'none',
    letterSpacing: '0.02em',
  } as SxProps<Theme>,

  coverageNote: {
    color: '#1E40AF',
    display: 'block',
    mt: 0.5,
    fontWeight: 700,
    textTransform: 'none',
    letterSpacing: '0.02em',
  } as SxProps<Theme>,

  badge: (status: StatusCuidador) => {
    const token = CARD_STATUS_TOKENS[status];
    return {
      bgcolor: token.bg,
      color: token.fg,
      border: `1px solid ${token.border}`,
      px: 1.5,
      py: 0.5,
      borderRadius: '6px',
      fontWeight: 700,
      fontSize: '11px',
      lineHeight: 1.4,
      fontFamily: '"JetBrains Mono", monospace',
      textTransform: 'uppercase',
      flexShrink: 0,
    } as SxProps<Theme>;
  },
};
