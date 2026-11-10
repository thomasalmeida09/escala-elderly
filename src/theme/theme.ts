import { createTheme } from '@mui/material/styles';

export const warmCareTheme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#F9F8F6',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A1D1A',
      secondary: '#6B706C',
    },
    primary: {
      main: '#007A78',
      light: '#E6F2F2',
      dark: '#005C5A',
    },
    warning: {
      main: '#D97706',
      light: '#FEF3C7',
    },
    divider: '#EBE9E5',
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", sans-serif',
    h5: {
      fontWeight: 800,
      letterSpacing: '-0.03em',
    },
    caption: {
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      letterSpacing: '0.08em',
      fontSize: '0.7rem',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          textTransform: 'none',
          fontWeight: 600,
          boxShadow: '0px 2px 4px rgba(0, 122, 120, 0.08)',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: '0px 4px 12px rgba(0, 122, 120, 0.15)',
          },
        },
      },
    },
  },
});
