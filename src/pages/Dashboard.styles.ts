import type { SxProps, Theme } from '@mui/material';

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
    mt: 1,
  } as SxProps<Theme>,

  cardsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  } as SxProps<Theme>,
};
