import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { warmCareTheme } from './theme/theme';
import Dashboard from './pages/Dashboard';
export default function App() {
  return (
    <ThemeProvider theme={warmCareTheme}>
      <CssBaseline />
      <Dashboard />
    </ThemeProvider>
  );
}
