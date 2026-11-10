import type { SxProps, Theme } from '@mui/material';

export const styles = {
  cardItem: {
    bgcolor: 'background.paper',
    p: 3,
    borderRadius: '8px',
    boxShadow: '0px 6px 24px rgba(45, 49, 46, 0.04)',
    border: '1px solid rgba(235, 233, 229, 0.6)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.22s ease',
    '&:hover': {
      transform: 'translateY(-3px)',
      boxShadow: '0px 12px 30px rgba(45, 49, 46, 0.08)',
    },
  } as SxProps<Theme>,

  badge: (isFaltou: boolean) =>
    ({
      bgcolor: isFaltou ? 'warning.light' : 'primary.light',
      color: isFaltou ? 'warning.main' : 'primary.main',
      px: 1.5,
      py: 0.5,
      borderRadius: '6px',
      fontWeight: 700,
      fontSize: '11px',
      fontFamily: '"JetBrains Mono", monospace',
      textTransform: 'uppercase',
    }) as SxProps<Theme>,
};
