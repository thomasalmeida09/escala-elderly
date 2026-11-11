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

export const styles = {
  pageWrapper: {
    bgcolor: 'background.default',
    minHeight: '100vh',
    py: 6,
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.3s ease',
  } as SxProps<Theme>,

  headerBox: {
    textAlign: 'left',
    mb: 4,
    pl: 1,
    borderBottom: '1px dashed',
    borderColor: 'divider',
    pb: 2,
  } as SxProps<Theme>,

  headerDivider: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 1,
    columnGap: 1.5,
    mt: 1,
  } as SxProps<Theme>,

  connectionBadge: (status: ConnectionStatus) => {
    const token = CONNECTION_BADGE_TOKENS[status];
    return {
      display: 'inline-flex',
      alignItems: 'center',
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
};
