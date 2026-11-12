import type { SxProps, Theme } from '@mui/material';
import type { ConnectionStatus } from '../types/caregiver';

export interface ConnectionBadgeToken {
  readonly label: string;
  readonly bg: string;
  readonly fg: string;
  readonly border: string;
}

export const CONNECTION_BADGE_TOKENS: Readonly<Record<ConnectionStatus, ConnectionBadgeToken>> = {
  online: {
    label: 'ONLINE (API CONECTADA)',
    bg: '#E6F2F2',
    fg: '#005C5A',
    border: '#B8DCDC',
  },
  'local-first': {
    label: 'MODO LOCAL-FIRST (SALVO NO DISPOSITIVO)',
    bg: '#FEF3C7',
    fg: '#92400E',
    border: '#FCD34D',
  },
  checking: {
    label: 'SINCRONIZANDO...',
    bg: '#F3F4F6',
    fg: '#374151',
    border: '#D1D5DB',
  },
};

export const DASHBOARD_PRIVACY_TOKENS = {
  inactive: {
    fg: '#1E293B',
    bg: '#FFFFFF',
    hoverBg: '#F1F5F9',
    border: '#64748B',
  },
  active: {
    fg: '#FFFFFF',
    bg: '#005C5A',
    hoverBg: '#004746',
    border: '#005C5A',
  },
} as const;

export const styles = {
  pageWrapper: {
    bgcolor: 'background.default',
    minHeight: '100vh',
    py: { xs: 1, sm: 4 },
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.3s ease',
  } as SxProps<Theme>,

  headerBox: {
    textAlign: 'left',
    mb: { xs: 0.75, sm: 2.5 },
    pl: { xs: 0, sm: 1 },
    borderBottom: '1px dashed',
    borderColor: 'divider',
    pb: { xs: 0.75, sm: 1.5 },
  } as SxProps<Theme>,

  headerTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 1,
    minWidth: 0,
  } as SxProps<Theme>,

  headerTitle: {
    fontSize: { xs: '1.25rem', sm: '1.5rem' },
    lineHeight: 1.2,
  } as SxProps<Theme>,

  privacyToggleButton: (active: boolean): SxProps<Theme> => {
    const token = active ? DASHBOARD_PRIVACY_TOKENS.active : DASHBOARD_PRIVACY_TOKENS.inactive;
    return {
      minHeight: { xs: '44px', sm: '36px' },
      px: 1.25,
      py: 0.5,
      gap: 0.5,
      minWidth: 0,
      maxWidth: '100%',
      bgcolor: token.bg,
      color: token.fg,
      border: `1px solid ${token.border}`,
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 700,
      lineHeight: 1.2,
      whiteSpace: 'normal',
      textAlign: 'center',
      boxShadow: 'none',
      transition: 'box-shadow 0.15s ease-in-out, border-color 0.15s ease-in-out',
      '&:hover': {
        bgcolor: token.hoverBg,
        borderColor: token.border,
        boxShadow: 'none',
      },
      '&:focus-visible, &.Mui-focusVisible': {
        outline: '2px solid #005C5A',
        outlineOffset: '2px',
      },
      '@media (prefers-reduced-motion: reduce)': {
        transition: 'none',
      },
    };
  },

  headerDivider: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 0.75,
    columnGap: 1.5,
    mt: { xs: 0.5, sm: 1 },
  } as SxProps<Theme>,

  connectionBadge: (status: ConnectionStatus) => {
    const token = CONNECTION_BADGE_TOKENS[status];
    return {
      display: 'inline-flex',
      alignItems: 'center',
      columnGap: 0.5,
      maxWidth: '100%',
      bgcolor: token.bg,
      color: token.fg,
      border: `1px solid ${token.border}`,
      px: 1.25,
      py: 0.4,
      borderRadius: '6px',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '0.68rem',
      fontWeight: 700,
      letterSpacing: '0.05em',
      lineHeight: 1.35,
    } as SxProps<Theme>;
  },

  cardsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  } as SxProps<Theme>,

  cardSlot: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0.75,
    minWidth: 0,
  } as SxProps<Theme>,
};
