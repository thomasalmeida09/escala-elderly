import type { SxProps, Theme } from '@mui/material';

export const styles = {
  controlPanel: {
    bgcolor: 'background.paper',
    p: '20px',
    mb: 4,
    borderRadius: '8px',
    boxShadow: '0px 4px 20px rgba(45, 49, 46, 0.03)',
    border: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as SxProps<Theme>,

  panelLabel: {
    color: 'primary.main',
    fontWeight: 700,
  } as SxProps<Theme>,

  simulateButton: {
    bgcolor: 'primary.main',
    color: '#FFFFFF',
    fontSize: '13px',
    px: 3,
    py: 1,
    '&:hover': {
      bgcolor: 'primary.dark',
    },
  } as SxProps<Theme>,
};
