import type { SxProps, Theme } from '@mui/material';
import type { StatusCuidador } from '../../types/caregiver';

/**
 * Paleta homologada matematicamente em luminancia sRGB para WCAG 2.2 AA
 * (>= 4.5:1 para todo texto normal/hover; >= 3.0:1 para toda borda estrutural/interativa — M6 / S19):
 * - dialogHeader:          #0F172A / #FFFFFF = 17.43:1 (borda #64748B = 4.76:1)
 * - downloadPrimaryButton: #FFFFFF / #007A78 =  5.18:1 (hover #005C5A = 7.84:1, borda #005C5A = 7.84:1)
 * - printSecondaryButton:  #1E3A8A / #EFF6FF =  9.40:1 (hover #DBEAFE = 8.21:1, borda #1E40AF = 7.59:1)
 * - toggleActive:          #FFFFFF / #005C5A =  7.84:1 (hover #004746 = 10.35:1, borda #005C5A = 7.84:1)
 * - toggleIdle:            #1E293B / #FFFFFF = 14.63:1 (hover #F1F5F9 = 13.08:1, borda #64748B = 4.76:1)
 * - deskBackdrop:          #0F172A / #E2E8F0 = 13.86:1 (borda #64748B sobre #E2E8F0 = 3.67:1)
 * - sheetPaper:            #0F172A / #FFFFFF = 17.43:1 (borda #64748B = 4.76:1)
 * - sheetHeaderBand:       #FFFFFF / #0F172A = 17.43:1 (borda #94A3B8 sobre #0F172A = 7.21:1)
 * - sheetSubtitleOnDark:   #E2E8F0 / #0F172A = 13.86:1
 * - tableHeader:           #0F172A / #F1F5F9 = 15.58:1 (borda #64748B sobre #F1F5F9 = 4.25:1)
 * - statusPresente:        #065F46 / #D1FAE5 =  6.63:1 (borda #047857 sobre #D1FAE5 = 4.86:1)
 * - statusFolga:           #1E293B / #F1F5F9 = 13.08:1 (borda #64748B sobre #F1F5F9 = 4.25:1)
 * - statusCobertura:       #92400E / #FEF3C7 =  6.37:1 (borda #B45309 sobre #FEF3C7 = 4.64:1)
 * - statusFaltou:          #991B1B / #FEE2E2 =  6.85:1 (borda #B91C1C sobre #FEE2E2 = 5.45:1)
 * - lgpdActiveBadge:       #1E3A8A / #EFF6FF =  9.40:1 (borda #1D4ED8 sobre #EFF6FF = 6.27:1)
 * - signaturePad:          #0F172A / #FFFFFF = 17.43:1 (borda #64748B = 4.76:1)
 * - statusBanner:          #065F46 / #ECFDF5 =  7.29:1 (borda #047857 sobre #ECFDF5 = 5.34:1)
 */
export const MODAL_FOLHA_A4_TOKENS = {
  dialogHeader: {
    fg: '#0F172A',
    bg: '#FFFFFF',
    border: '#64748B',
  },
  downloadPrimaryButton: {
    fg: '#FFFFFF',
    bg: '#007A78',
    hoverBg: '#005C5A',
    border: '#005C5A',
  },
  printSecondaryButton: {
    fg: '#1E3A8A',
    bg: '#EFF6FF',
    hoverBg: '#DBEAFE',
    border: '#1E40AF',
  },
  toggleActive: {
    fg: '#FFFFFF',
    bg: '#005C5A',
    hoverBg: '#004746',
    border: '#005C5A',
  },
  toggleIdle: {
    fg: '#1E293B',
    bg: '#FFFFFF',
    hoverBg: '#F1F5F9',
    border: '#64748B',
  },
  deskBackdrop: {
    fg: '#0F172A',
    bg: '#E2E8F0',
    border: '#64748B',
  },
  sheetPaper: {
    fg: '#0F172A',
    bg: '#FFFFFF',
    border: '#64748B',
  },
  sheetHeaderBand: {
    fg: '#FFFFFF',
    bg: '#0F172A',
    border: '#94A3B8',
  },
  sheetSubtitleOnDark: {
    fg: '#E2E8F0',
    bg: '#0F172A',
  },
  tableHeader: {
    fg: '#0F172A',
    bg: '#F1F5F9',
    border: '#64748B',
  },
  statusPresente: {
    fg: '#065F46',
    bg: '#D1FAE5',
    border: '#047857',
  },
  statusFolga: {
    fg: '#1E293B',
    bg: '#F1F5F9',
    border: '#64748B',
  },
  statusCobertura: {
    fg: '#92400E',
    bg: '#FEF3C7',
    border: '#B45309',
  },
  statusFaltou: {
    fg: '#991B1B',
    bg: '#FEE2E2',
    border: '#B91C1C',
  },
  lgpdActiveBadge: {
    fg: '#1E3A8A',
    bg: '#EFF6FF',
    border: '#1D4ED8',
  },
  signaturePad: {
    fg: '#0F172A',
    bg: '#FFFFFF',
    border: '#64748B',
  },
  statusBanner: {
    fg: '#065F46',
    bg: '#ECFDF5',
    border: '#047857',
  },
  errorBanner: {
    fg: '#991B1B',
    bg: '#FEF2F2',
    border: '#DC2626',
  },
} as const;

export function getSheetStatusBadgeToken(status: StatusCuidador) {
  if (status === 'Presente') return MODAL_FOLHA_A4_TOKENS.statusPresente;
  if (status === 'Cobertura') return MODAL_FOLHA_A4_TOKENS.statusCobertura;
  if (status === 'Faltou') return MODAL_FOLHA_A4_TOKENS.statusFaltou;
  return MODAL_FOLHA_A4_TOKENS.statusFolga;
}

export const styles = {
  dialogPaper: {
    borderRadius: '10px',
    bgcolor: '#FFFFFF',
    color: MODAL_FOLHA_A4_TOKENS.dialogHeader.fg,
    maxHeight: '94dvh',
    m: { xs: 1, sm: 2 },
    width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' },
  } as SxProps<Theme>,

  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    flexShrink: 0,
    gap: 1.25,
    px: { xs: 1.75, sm: 2.5 },
    py: 1.25,
    borderBottom: `1px solid ${MODAL_FOLHA_A4_TOKENS.dialogHeader.border}`,
    bgcolor: MODAL_FOLHA_A4_TOKENS.dialogHeader.bg,
  } as SxProps<Theme>,

  scrollableStudioBody: {
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
  } as SxProps<Theme>,

  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0.25,
    minWidth: 0,
  } as SxProps<Theme>,

  primaryActionsGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    alignItems: 'center',
  } as SxProps<Theme>,

  downloadPrimaryButton: {
    gap: 0.75,
    minHeight: { xs: '44px', sm: '38px' },
    px: 1.75,
    py: 0.75,
    fontSize: '12.5px',
    fontWeight: 700,
    bgcolor: MODAL_FOLHA_A4_TOKENS.downloadPrimaryButton.bg,
    color: MODAL_FOLHA_A4_TOKENS.downloadPrimaryButton.fg,
    '&:hover': {
      bgcolor: MODAL_FOLHA_A4_TOKENS.downloadPrimaryButton.hoverBg,
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #005C5A',
      outlineOffset: '2px',
    },
  } as SxProps<Theme>,

  printSecondaryButton: {
    gap: 0.75,
    minHeight: { xs: '44px', sm: '38px' },
    px: 1.5,
    py: 0.75,
    fontSize: '12.5px',
    fontWeight: 700,
    boxShadow: 'none',
    bgcolor: MODAL_FOLHA_A4_TOKENS.printSecondaryButton.bg,
    color: MODAL_FOLHA_A4_TOKENS.printSecondaryButton.fg,
    borderColor: MODAL_FOLHA_A4_TOKENS.printSecondaryButton.border,
    '&:hover': {
      bgcolor: MODAL_FOLHA_A4_TOKENS.printSecondaryButton.hoverBg,
      borderColor: MODAL_FOLHA_A4_TOKENS.printSecondaryButton.border,
      boxShadow: 'none',
    },
    '&:focus-visible, &.Mui-focusVisible': {
      outline: '2px solid #1E40AF',
      outlineOffset: '2px',
    },
  } as SxProps<Theme>,

  toggleChipButton: (active: boolean): SxProps<Theme> => {
    const tok = active ? MODAL_FOLHA_A4_TOKENS.toggleActive : MODAL_FOLHA_A4_TOKENS.toggleIdle;
    return {
      gap: 0.65,
      minHeight: { xs: '44px', sm: '36px' },
      px: 1.25,
      py: 0.5,
      fontSize: '12px',
      fontWeight: 600,
      boxShadow: 'none',
      transition: 'box-shadow 0.15s ease-in-out',
      '@media (prefers-reduced-motion: reduce)': {
        transition: 'none',
      },
      bgcolor: tok.bg,
      color: tok.fg,
      borderColor: tok.border,
      '&:hover': {
        bgcolor: tok.hoverBg,
        borderColor: tok.border,
        boxShadow: 'none',
      },
      '&:focus-visible, &.Mui-focusVisible': {
        outline: '2px solid #005C5A',
        outlineOffset: '2px',
      },
    };
  },

  controlsStrip: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1.25,
    px: { xs: 1.75, sm: 2.5 },
    py: 1.5,
    bgcolor: '#F8FAFC',
    borderBottom: `1px solid ${MODAL_FOLHA_A4_TOKENS.dialogHeader.border}`,
  } as SxProps<Theme>,

  controlsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  } as SxProps<Theme>,

  signatureToolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1.5,
    alignItems: 'flex-start',
  } as SxProps<Theme>,

  signatureCanvasWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0.5,
    minWidth: 0,
    maxWidth: '100%',
  } as SxProps<Theme>,

  keyboardSigColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0.75,
    flex: '1 1 220px',
    minWidth: 0,
  } as SxProps<Theme>,

  statusBanner: {
    bgcolor: MODAL_FOLHA_A4_TOKENS.statusBanner.bg,
    color: MODAL_FOLHA_A4_TOKENS.statusBanner.fg,
    border: `1px solid ${MODAL_FOLHA_A4_TOKENS.statusBanner.border}`,
    borderRadius: '6px',
    px: 1.25,
    py: 0.65,
    fontSize: '0.76rem',
    fontWeight: 600,
  } as SxProps<Theme>,

  errorBanner: {
    bgcolor: MODAL_FOLHA_A4_TOKENS.errorBanner.bg,
    color: MODAL_FOLHA_A4_TOKENS.errorBanner.fg,
    border: `1px solid ${MODAL_FOLHA_A4_TOKENS.errorBanner.border}`,
    borderRadius: '6px',
    px: 1.25,
    py: 0.65,
    fontSize: '0.76rem',
    fontWeight: 600,
  } as SxProps<Theme>,

  previewDesk: {
    bgcolor: MODAL_FOLHA_A4_TOKENS.deskBackdrop.bg,
    color: MODAL_FOLHA_A4_TOKENS.deskBackdrop.fg,
    borderTop: `1px solid ${MODAL_FOLHA_A4_TOKENS.deskBackdrop.border}`,
    px: { xs: 1.25, sm: 2.5 },
    py: { xs: 1.5, sm: 2.5 },
    overflowY: 'visible',
    overflowX: 'hidden',
    flex: '1 0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  } as SxProps<Theme>,
};
