import type { SxProps, Theme } from '@mui/material';

/**
 * Paleta homologada matematicamente em luminancia sRGB para WCAG 2.2 AA (>= 4.5:1 texto, >= 3:1 bordas):
 * - surface:        #1A1D1A / #FFFFFF = 17.01:1
 * - sectionTitle:   #005C5A / #FFFFFF =  7.84:1
 * - dropzoneIdle:   #4B5563 / #F9F8F6 =  7.12:1 (borda #6B706C = 4.79:1)
 * - dropzoneActive: #005C5A / #E6F2F2 =  6.85:1 (borda #005C5A = 6.85:1)
 * - importButton:   #FFFFFF / #007A78 =  5.18:1 (hover #005C5A = 7.84:1)
 * - exportButton:   #005C5A / #FFFFFF =  7.84:1 (hover #E6F2F2 = 6.85:1)
 * - pdfButton:      #1E293B / #FFFFFF = 14.63:1 (hover #F1F5F9 = 13.08:1, borda #64748B = 4.76:1)
 * - undoButton:     #92400E / #FEF3C7 =  6.37:1 (hover #FDE68A = 5.69:1)
 * - successBanner:  #065F46 / #ECFDF5 =  7.29:1
 * - errorBanner:    #991B1B / #FEF2F2 =  7.60:1
 */
export const BARRA_PLANILHA_TOKENS = {
  surface: {
    fg: '#1A1D1A',
    bg: '#FFFFFF',
    border: '#EBE9E5',
  },
  sectionTitle: {
    fg: '#005C5A',
    bg: '#FFFFFF',
  },
  dropzoneIdle: {
    fg: '#4B5563',
    bg: '#F9F8F6',
    border: '#6B706C',
  },
  dropzoneActive: {
    fg: '#005C5A',
    bg: '#E6F2F2',
    border: '#005C5A',
  },
  importButton: {
    fg: '#FFFFFF',
    bg: '#007A78',
    hoverBg: '#005C5A',
    border: '#007A78',
  },
  exportButton: {
    fg: '#005C5A',
    bg: '#FFFFFF',
    hoverBg: '#E6F2F2',
    border: '#005C5A',
  },
  pdfButton: {
    fg: '#1E293B',
    bg: '#FFFFFF',
    hoverBg: '#F1F5F9',
    border: '#64748B',
  },
  undoButton: {
    fg: '#92400E',
    bg: '#FEF3C7',
    hoverBg: '#FDE68A',
    border: '#D97706',
  },
  successBanner: {
    fg: '#065F46',
    bg: '#ECFDF5',
    border: '#6EE7B7',
  },
  errorBanner: {
    fg: '#991B1B',
    bg: '#FEF2F2',
    border: '#FCA5A5',
  },
} as const;

export const styles = {
  container: (isDragActive: boolean): SxProps<Theme> => ({
    bgcolor: isDragActive
      ? BARRA_PLANILHA_TOKENS.dropzoneActive.bg
      : BARRA_PLANILHA_TOKENS.surface.bg,
    color: BARRA_PLANILHA_TOKENS.surface.fg,
    p: { xs: '8px 10px', sm: '14px 16px' },
    mb: { xs: 1, sm: 2.5 },
    borderRadius: '8px',
    border: isDragActive
      ? `2px dashed ${BARRA_PLANILHA_TOKENS.dropzoneActive.border}`
      : `1px solid ${BARRA_PLANILHA_TOKENS.surface.border}`,
    boxShadow: '0px 4px 20px rgba(45, 49, 46, 0.03)',
    display: 'flex',
    flexDirection: 'column',
    gap: { xs: 0.75, sm: 1.25 },
    minWidth: 0,
    transition: 'background-color 0.15s ease-in-out, border-color 0.15s ease-in-out',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  }),

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0.75,
    minWidth: 0,
  } as SxProps<Theme>,

  sectionLabel: {
    color: BARRA_PLANILHA_TOKENS.sectionTitle.fg,
    fontWeight: 700,
  } as SxProps<Theme>,

  dropHintBadge: (isDragActive: boolean): SxProps<Theme> => ({
    bgcolor: isDragActive
      ? BARRA_PLANILHA_TOKENS.dropzoneActive.bg
      : BARRA_PLANILHA_TOKENS.dropzoneIdle.bg,
    color: isDragActive
      ? BARRA_PLANILHA_TOKENS.dropzoneActive.fg
      : BARRA_PLANILHA_TOKENS.dropzoneIdle.fg,
    border: `1px dashed ${
      isDragActive
        ? BARRA_PLANILHA_TOKENS.dropzoneActive.border
        : BARRA_PLANILHA_TOKENS.dropzoneIdle.border
    }`,
    borderRadius: '6px',
    px: 1,
    py: { xs: 0.2, sm: 0.35 },
    fontSize: '0.72rem',
    fontWeight: 600,
    lineHeight: 1.35,
    minWidth: 0,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  }),

  actionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    minWidth: 0,
  } as SxProps<Theme>,

  importButton: {
    flex: '1 1 136px',
    gap: 0.75,
    minWidth: 0,
    minHeight: '44px',
    px: 1.5,
    py: 0.75,
    fontSize: '12.5px',
    lineHeight: 1.25,
    whiteSpace: 'normal',
    bgcolor: BARRA_PLANILHA_TOKENS.importButton.bg,
    color: BARRA_PLANILHA_TOKENS.importButton.fg,
    '&:hover': {
      bgcolor: BARRA_PLANILHA_TOKENS.importButton.hoverBg,
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
  } as SxProps<Theme>,

  exportButton: {
    flex: '1 1 136px',
    gap: 0.75,
    minWidth: 0,
    minHeight: '44px',
    px: 1.5,
    py: 0.75,
    fontSize: '12.5px',
    lineHeight: 1.25,
    whiteSpace: 'normal',
    boxShadow: 'none',
    bgcolor: BARRA_PLANILHA_TOKENS.exportButton.bg,
    color: BARRA_PLANILHA_TOKENS.exportButton.fg,
    borderColor: BARRA_PLANILHA_TOKENS.exportButton.border,
    '&:hover': {
      bgcolor: BARRA_PLANILHA_TOKENS.exportButton.hoverBg,
      borderColor: BARRA_PLANILHA_TOKENS.exportButton.border,
      boxShadow: 'none',
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
  } as SxProps<Theme>,

  pdfButton: {
    flex: '1 1 136px',
    gap: 0.75,
    minWidth: 0,
    minHeight: '44px',
    px: 1.5,
    py: 0.75,
    fontSize: '12.5px',
    lineHeight: 1.25,
    whiteSpace: 'normal',
    boxShadow: 'none',
    bgcolor: BARRA_PLANILHA_TOKENS.pdfButton.bg,
    color: BARRA_PLANILHA_TOKENS.pdfButton.fg,
    borderColor: BARRA_PLANILHA_TOKENS.pdfButton.border,
    '&:hover': {
      bgcolor: BARRA_PLANILHA_TOKENS.pdfButton.hoverBg,
      borderColor: BARRA_PLANILHA_TOKENS.pdfButton.border,
      boxShadow: 'none',
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
  } as SxProps<Theme>,

  undoButton: {
    flex: '1 1 136px',
    gap: 0.75,
    minWidth: 0,
    minHeight: '44px',
    px: 1.5,
    py: 0.75,
    fontSize: '12.5px',
    lineHeight: 1.25,
    whiteSpace: 'normal',
    boxShadow: 'none',
    bgcolor: BARRA_PLANILHA_TOKENS.undoButton.bg,
    color: BARRA_PLANILHA_TOKENS.undoButton.fg,
    borderColor: BARRA_PLANILHA_TOKENS.undoButton.border,
    '&:hover': {
      bgcolor: BARRA_PLANILHA_TOKENS.undoButton.hoverBg,
      borderColor: BARRA_PLANILHA_TOKENS.undoButton.border,
      boxShadow: 'none',
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
  } as SxProps<Theme>,

  feedbackBanner: (kind: 'success' | 'error'): SxProps<Theme> => {
    const token =
      kind === 'success' ? BARRA_PLANILHA_TOKENS.successBanner : BARRA_PLANILHA_TOKENS.errorBanner;
    return {
      bgcolor: token.bg,
      color: token.fg,
      border: `1px solid ${token.border}`,
      borderRadius: '6px',
      px: 1.25,
      py: 0.75,
      fontSize: '0.76rem',
      fontWeight: 600,
      lineHeight: 1.4,
      minWidth: 0,
      maxWidth: '100%',
      overflowWrap: 'anywhere',
    };
  },
};
