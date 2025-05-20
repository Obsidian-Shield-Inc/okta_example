import { createTheme } from '@mui/material/styles';

export const getTheme = (mode) => createTheme({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          // Light mode
          primary: {
            main: '#3498db',
            light: '#5dade2',
            dark: '#2980b9',
          },
          secondary: {
            main: '#2ecc71',
            light: '#52be80',
            dark: '#27ae60',
          },
          background: {
            default: '#f5f6fa',
            paper: '#ffffff',
          },
        }
      : {
          // Dark mode
          primary: {
            main: '#3498db',
            light: '#5dade2',
            dark: '#2980b9',
          },
          secondary: {
            main: '#2ecc71',
            light: '#52be80',
            dark: '#27ae60',
          },
          background: {
            default: '#1a1d2b',
            paper: '#222736',
          },
        }),
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          borderBottom: '1px solid',
          borderColor: mode === 'light' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid',
          borderColor: mode === 'light' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)',
        },
      },
    },
  },
}); 