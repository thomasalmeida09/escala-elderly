import type { SxProps, Theme } from '@mui/material';

export const SIMULADOR_BUTTON_TOKENS = {
  primaryBg: '#007A78',
  primaryFg: '#FFFFFF',
  secondaryBg: '#FFFFFF',
  secondaryFg: '#005C5A',
  secondaryBorder: '#005C5A',
} as const;

export const styles = {
  controlPanel: {
    bgcolor: 'background.paper',
    p: { xs: '8px 12px', sm: '16px 20px' },
    mb: { xs: 1, sm: 2 },
    borderRadius: '8px',
    boxShadow: '0px 4px 20px rgba(45, 49, 46, 0.03)',
    border: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: { xs: 0.75, sm: 1.5 },
  } as SxProps<Theme>,

  panelLabel: {
    color: '#005C5A',
    fontWeight: 700,
  } as SxProps<Theme>,

  actionsGroup: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 1,
  } as SxProps<Theme>,

  simulateButton: {
    bgcolor: SIMULADOR_BUTTON_TOKENS.primaryBg,
    color: SIMULADOR_BUTTON_TOKENS.primaryFg,
    fontSize: '13px',
    minHeight: '36px',
    px: 2.25,
    py: 0.85,
    '&:hover': {
      bgcolor: 'primary.dark',
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
  } as SxProps<Theme>,

  resetButton: {
    bgcolor: SIMULADOR_BUTTON_TOKENS.secondaryBg,
    color: SIMULADOR_BUTTON_TOKENS.secondaryFg,
    borderColor: SIMULADOR_BUTTON_TOKENS.secondaryBorder,
    fontSize: '13px',
    minHeight: '36px',
    px: 2,
    py: 0.85,
    boxShadow: 'none',
    '&:hover': {
      bgcolor: '#E6F2F2',
      borderColor: 'primary.dark',
      boxShadow: 'none',
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
  } as SxProps<Theme>,
};
