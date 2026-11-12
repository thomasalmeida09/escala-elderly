import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ThemeProvider } from '@mui/material';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BarraIndicadores from '../src/components/BarraIndicadores/BarraIndicadores';
import {
  BARRA_INDICADORES_TOKENS,
  styles as barraIndicadoresStyles,
} from '../src/components/BarraIndicadores/BarraIndicadores.styles';
import BarraPlanilha from '../src/components/BarraPlanilha/BarraPlanilha';
import {
  BARRA_PLANILHA_TOKENS,
  styles as barraPlanilhaStyles,
} from '../src/components/BarraPlanilha/BarraPlanilha.styles';
import CardCuidador from '../src/components/CardCuidador/CardCuidador';
import {
  CARD_STATUS_TOKENS,
  styles as cardCuidadorStyles,
} from '../src/components/CardCuidador/CardCuidador.styles';
import ModalFolhaEscalaA4, {
  FolhaEscalaA4Document,
} from '../src/components/ModalFolhaEscalaA4/ModalFolhaEscalaA4';
import {
  MODAL_FOLHA_A4_TOKENS,
  styles as modalFolhaA4Styles,
} from '../src/components/ModalFolhaEscalaA4/ModalFolhaEscalaA4.styles';
import PainelCobertura from '../src/components/PainelCobertura/PainelCobertura';
import { PAINEL_COBERTURA_TOKENS } from '../src/components/PainelCobertura/PainelCobertura.styles';
import { SIMULADOR_BUTTON_TOKENS } from '../src/components/SimuladorPainel/SimuladorPainel.styles';
import { syncPrivacyModeFromStorageEvent } from '../src/hooks/useCaregivers';
import Dashboard from '../src/pages/Dashboard';
import {
  CONNECTION_BADGE_TOKENS,
  DASHBOARD_PRIVACY_TOKENS,
  styles as dashboardStyles,
} from '../src/pages/Dashboard.styles';
import {
  buildA4ScheduleDocumentModel,
  isModalDialogOpen,
} from '../src/services/a4PdfScheduleEngine';
import { createCaregiverApiClient } from '../src/services/caregiverApi';
import {
  CARLOS_ROCHA_ID,
  type ConnectivityEventTarget,
  createCaregiverScheduleController,
} from '../src/services/caregiverSyncController';
import {
  PRIVACY_MODE_STORAGE_KEY,
  SCHEDULE_STORAGE_KEY,
  type StorageAdapter,
  UNDO_IMPORT_STORAGE_KEY,
  createLocalFirstStore,
  getCanonicalSeed,
} from '../src/services/localFirstStore';
import { synthesizeKeyboardVectorSignature } from '../src/services/vectorSignatureProtocol';
import { warmCareTheme } from '../src/theme/theme';
import { applyStatusChange, parseCuidador } from '../src/types/caregiver';

const currentTestDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(currentTestDir, '..');

function parseHexChannel(hexPair: string): number {
  const srgb = Number.parseInt(hexPair, 16) / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hexColor: string): number {
  const normalized = hexColor.replace(/^#/, '');
  if (normalized.length !== 6) {
    throw new Error(`Expected 6-digit hex color, got "${hexColor}"`);
  }
  const r = parseHexChannel(normalized.slice(0, 2));
  const g = parseHexChannel(normalized.slice(2, 4));
  const b = parseHexChannel(normalized.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function wcagContrastRatio(fgHex: string, bgHex: string): number {
  const lumA = relativeLuminance(fgHex);
  const lumB = relativeLuminance(bgHex);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function createPreloadedStorage(cuidadores: ReturnType<typeof getCanonicalSeed>): StorageAdapter {
  const map = new Map<string, string>([
    [
      SCHEDULE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        updatedAtIso: '2026-11-10T18:50:00.000Z',
        pendingRemoteSync: false,
        cuidadores,
      }),
    ],
  ]);
  return {
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

describe('FE #2 & FE #7 — Dashboard, CardCuidador & PainelCobertura SSR Semantics, WCAG 2.2 AA & StrictMode', () => {
  it('1. renders Dashboard in 0ms with <h1>, polite status badge, dual simulator buttons, 4 caregivers, and zero open coverage panels when all Presente', () => {
    const store = createLocalFirstStore({ storage: null });
    const html = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <Dashboard controllerOptions={{ store, eventTarget: null }} />
      </ThemeProvider>
    );

    expect(html).toMatch(/<h1[^>]*>DASHBOARD<\/h1>/);
    expect(html).not.toContain('MuiCircularProgress');
    expect(html).not.toContain('QUEM PODE COBRIR?');

    // Live region with decorative dot hidden from assistive tech (M4.3)
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>● <\/span>/);
    expect(html).toContain('SINCRONIZANDO...');

    // SimuladorPainel print-exclusion & dual button hierarchy (M5)
    expect(html).toContain('no-print');
    expect(html).toContain('Falta de Carlos');
    expect(html).toContain('Restaurar Escala');

    // All 4 canonical caregivers + rooms + shifts visible in 0ms
    for (const expectedText of [
      'Ana Souza',
      'Lucas Lima',
      'Carlos Rocha',
      'Mariana Costa',
      'Quarto 01',
      'Quarto 03',
      'Diurno (07h-19h)',
      'Noturno (19h-07h)',
    ]) {
      expect(html).toContain(expectedText);
    }
  });

  it('2. enforces valid HTML5 <button> phrasing content (zero nested div/p/button/a) and WCAG 2.5.3 Label-in-Name', () => {
    const coveredCaregiver = parseCuidador({
      id: 3,
      nome: 'Carlos Rocha',
      status: 'Cobertura',
      turno: 'Noturno (19h-07h)',
      quarto: 'Quarto 03',
      substituto: 'Folguista Turno A',
    });

    const html = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <CardCuidador cuidador={coveredCaregiver} onToggleStatus={() => undefined} />
      </ThemeProvider>
    );

    const buttonBlocks = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
    expect(buttonBlocks).toHaveLength(1);

    const fullButtonTag = buttonBlocks[0]![0];
    const innerHtml = buttonBlocks[0]![1]!;

    expect(fullButtonTag).toContain('type="button"');
    expect(fullButtonTag).toContain('print-avoid-break');

    // Zero block-level <div>/<p> or interactive <button>/<a> tags inside <button>
    expect(innerHtml).not.toMatch(/<(div|p|button|a)\b/i);

    // WCAG 2.5.3 Label-in-Name: accessible name begins with visible caregiver name and preserves room/shift/substitute
    const ariaLabelMatch = fullButtonTag.match(/aria-label="([^"]+)"/);
    expect(ariaLabelMatch).not.toBeNull();
    const ariaLabel = ariaLabelMatch![1]!;
    expect(ariaLabel.startsWith('Carlos Rocha')).toBe(true);
    expect(ariaLabel).toContain('Quarto 03');
    expect(ariaLabel).toContain('Noturno (19h-07h)');
    expect(ariaLabel).toContain('Cobertura (Substituto: Folguista Turno A)');
    expect(ariaLabel).toContain('Pressione para alternar status');

    expect(innerHtml).toContain('Cobertura: Folguista Turno A');
  });

  it('3. guarantees WCAG 2.2 Level AA (>= 4.5:1) sRGB contrast across all status badges, header states, buttons, and 100% of PAINEL_COBERTURA_TOKENS', () => {
    for (const [statusName, token] of Object.entries(CARD_STATUS_TOKENS)) {
      const ratio = wcagContrastRatio(token.fg, token.bg);
      expect(
        ratio,
        `Card badge "${statusName}" (${token.fg} on ${token.bg}) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);
    }

    for (const [connState, token] of Object.entries(CONNECTION_BADGE_TOKENS)) {
      const ratio = wcagContrastRatio(token.fg, token.bg);
      expect(
        ratio,
        `Header badge "${connState}" (${token.fg} on ${token.bg}) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(
      wcagContrastRatio(SIMULADOR_BUTTON_TOKENS.primaryFg, SIMULADOR_BUTTON_TOKENS.primaryBg)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      wcagContrastRatio(SIMULADOR_BUTTON_TOKENS.secondaryFg, SIMULADOR_BUTTON_TOKENS.secondaryBg)
    ).toBeGreaterThanOrEqual(4.5);

    // Exhaustive WCAG 1.4.3 verification across 100% of PAINEL_COBERTURA_TOKENS (including hoverBg & exhaustedAlert)
    for (const [tokenKey, tokenValue] of Object.entries(PAINEL_COBERTURA_TOKENS)) {
      const baseRatio = wcagContrastRatio(tokenValue.fg, tokenValue.bg);
      expect(
        baseRatio,
        `PainelCobertura token "${tokenKey}" (${tokenValue.fg} on ${tokenValue.bg}) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);

      if ('hoverBg' in tokenValue) {
        const hoverRatio = wcagContrastRatio(tokenValue.fg, tokenValue.hoverBg);
        expect(
          hoverRatio,
          `PainelCobertura hover token "${tokenKey}" (${tokenValue.fg} on ${tokenValue.hoverBg}) must exceed 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    // Exhaustive WCAG 1.4.3 verification across 100% of BARRA_PLANILHA_TOKENS (including hoverBg & dropzone borders)
    for (const [tokenKey, tokenValue] of Object.entries(BARRA_PLANILHA_TOKENS)) {
      const baseRatio = wcagContrastRatio(tokenValue.fg, tokenValue.bg);
      expect(
        baseRatio,
        `BarraPlanilha token "${tokenKey}" (${tokenValue.fg} on ${tokenValue.bg}) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);

      if ('hoverBg' in tokenValue) {
        const hoverRatio = wcagContrastRatio(tokenValue.fg, tokenValue.hoverBg);
        expect(
          hoverRatio,
          `BarraPlanilha hover token "${tokenKey}" (${tokenValue.fg} on ${tokenValue.hoverBg}) must exceed 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    expect(
      wcagContrastRatio(
        BARRA_PLANILHA_TOKENS.dropzoneIdle.border,
        BARRA_PLANILHA_TOKENS.dropzoneIdle.bg
      )
    ).toBeGreaterThanOrEqual(3.0);
    expect(
      wcagContrastRatio(
        BARRA_PLANILHA_TOKENS.dropzoneActive.border,
        BARRA_PLANILHA_TOKENS.dropzoneActive.bg
      )
    ).toBeGreaterThanOrEqual(3.0);
    expect(
      wcagContrastRatio(BARRA_PLANILHA_TOKENS.pdfButton.border, BARRA_PLANILHA_TOKENS.pdfButton.bg)
    ).toBeGreaterThanOrEqual(3.0);

    // S19: Exhaustive WCAG 2.2 AA verification across 100% of MODAL_FOLHA_A4_TOKENS (text >= 4.5:1, hover >= 4.5:1, border >= 3.0:1)
    for (const [tokenKey, tokenValue] of Object.entries(MODAL_FOLHA_A4_TOKENS)) {
      const baseRatio = wcagContrastRatio(tokenValue.fg, tokenValue.bg);
      expect(
        baseRatio,
        `ModalFolhaEscalaA4 token "${tokenKey}" (${tokenValue.fg} on ${tokenValue.bg}) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);

      if ('hoverBg' in tokenValue) {
        const hoverRatio = wcagContrastRatio(tokenValue.fg, tokenValue.hoverBg);
        expect(
          hoverRatio,
          `ModalFolhaEscalaA4 hover token "${tokenKey}" (${tokenValue.fg} on ${tokenValue.hoverBg}) must exceed 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
      }

      if ('border' in tokenValue) {
        const borderVsInner = wcagContrastRatio(tokenValue.border, tokenValue.bg);
        const borderVsCanvas = wcagContrastRatio(tokenValue.border, '#FFFFFF');
        const effectiveBoundaryRatio = Math.max(borderVsInner, borderVsCanvas);
        expect(
          effectiveBoundaryRatio,
          `ModalFolhaEscalaA4 boundary token "${tokenKey}" (${tokenValue.border}) must exceed 3.0:1`
        ).toBeGreaterThanOrEqual(3.0);
      }
    }

    // Explicit WCAG 1.4.11 inner border >= 3.0:1 check on all light-surface & backdrop tokens (S19)
    for (const lightSurfaceKey of [
      'dialogHeader',
      'printSecondaryButton',
      'toggleIdle',
      'deskBackdrop',
      'sheetPaper',
      'tableHeader',
      'statusPresente',
      'statusFolga',
      'statusCobertura',
      'statusFaltou',
      'lgpdActiveBadge',
      'signaturePad',
      'statusBanner',
      'errorBanner',
    ] as const) {
      const tok = MODAL_FOLHA_A4_TOKENS[lightSurfaceKey];
      expect(
        wcagContrastRatio(tok.border, tok.bg),
        `Light-surface border "${lightSurfaceKey}" (${tok.border} on ${tok.bg}) must exceed 3.0:1`
      ).toBeGreaterThanOrEqual(3.0);
    }

    // FE07 Nit 1 closure: MuiButton transition never uses 'all' (prevents 200ms focus-visible outline lag)
    const buttonRootStyle = warmCareTheme.components?.MuiButton?.styleOverrides?.root as Record<
      string,
      unknown
    >;
    expect(buttonRootStyle.transition).toBe(
      'background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, border-color 0.2s ease-in-out'
    );
    expect(String(buttonRootStyle.transition)).not.toContain('all');

    // Focus-visible outline (#005C5A) against Warm Care canvas (#F9F8F6) & card paper (#FFFFFF) >= 3:1 (WCAG 1.4.11)
    expect(wcagContrastRatio('#005C5A', '#F9F8F6')).toBeGreaterThanOrEqual(7.0);
    expect(wcagContrastRatio('#005C5A', '#FFFFFF')).toBeGreaterThanOrEqual(7.0);

    // S14: Exhaustive WCAG 2.2 AA verification across 100% of BARRA_INDICADORES_TOKENS (1.4.3 >= 4.5:1 & 1.4.11 >= 3.0:1)
    expect(
      wcagContrastRatio(BARRA_INDICADORES_TOKENS.surface.fg, BARRA_INDICADORES_TOKENS.surface.bg)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      wcagContrastRatio(
        BARRA_INDICADORES_TOKENS.sectionTitle.fg,
        BARRA_INDICADORES_TOKENS.sectionTitle.bg
      )
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      wcagContrastRatio(
        BARRA_INDICADORES_TOKENS.mutedText.fg,
        BARRA_INDICADORES_TOKENS.mutedText.bg
      )
    ).toBeGreaterThanOrEqual(4.5);

    for (const [toneKey, cardTok] of Object.entries(BARRA_INDICADORES_TOKENS.kpiCards)) {
      expect(
        wcagContrastRatio(cardTok.fg, cardTok.bg),
        `BarraIndicadores kpiCards.${toneKey} text (${cardTok.fg} on ${cardTok.bg}) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrastRatio(cardTok.border, cardTok.bg),
        `BarraIndicadores kpiCards.${toneKey} border (${cardTok.border} on ${cardTok.bg}) must exceed 3.0:1`
      ).toBeGreaterThanOrEqual(3.0);
    }

    expect(
      wcagContrastRatio(
        BARRA_INDICADORES_TOKENS.thermometerTrack.border,
        BARRA_INDICADORES_TOKENS.surface.bg
      )
    ).toBeGreaterThanOrEqual(3.0);

    for (const [fillKey, fillTok] of Object.entries(BARRA_INDICADORES_TOKENS.thermometerFill)) {
      expect(
        wcagContrastRatio(fillTok.fill, fillTok.trackBg),
        `BarraIndicadores thermometerFill.${fillKey} (${fillTok.fill} on ${fillTok.trackBg}) must exceed 3.0:1`
      ).toBeGreaterThanOrEqual(3.0);
      expect(
        wcagContrastRatio(fillTok.textOnSurface, BARRA_INDICADORES_TOKENS.surface.bg),
        `BarraIndicadores thermometerFill.${fillKey} status text (${fillTok.textOnSurface} on #FFFFFF) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('4. renders sibling PainelCobertura (.no-print) on absence with valid HTML5 links, noopener noreferrer, WCAG 2.5.3 labels, and CLT filter note', () => {
    const rosterWithTwoAbsences = getCanonicalSeed().map((item) =>
      item.id === CARLOS_ROCHA_ID || item.id === 4 ? applyStatusChange(item, 'Faltou') : item
    );
    const store = createLocalFirstStore({
      storage: createPreloadedStorage(rosterWithTwoAbsences),
    });

    const html = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <Dashboard controllerOptions={{ store, eventTarget: null }} />
      </ThemeProvider>
    );

    // Distinct accessible headings for simultaneous absences (WCAG 2.4.6)
    expect(html).toContain('QUEM PODE COBRIR? — Carlos Rocha (Quarto 03)');
    expect(html).toContain('QUEM PODE COBRIR? — Mariana Costa (Quarto 04)');

    // PainelCobertura is rendered as <section class="... no-print" aria-labelledby="...">
    const sections = [...html.matchAll(/<section\b[^>]*>/gi)].map((m) => m[0]);
    expect(sections).toHaveLength(2);
    for (const sectionOpenTag of sections) {
      expect(sectionOpenTag).toContain('no-print');
      expect(sectionOpenTag).toMatch(/aria-labelledby="[^"]+"/);
    }

    // Zero interactive descendants nested inside any <button> (RT-2)
    const allButtons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
    expect(allButtons.length).toBeGreaterThanOrEqual(10);
    for (const [, inner] of allButtons) {
      expect(inner).not.toMatch(/<(button|a)\b/i);
    }

    // Eligible candidates displayed; CLT < 11h Rafael Mendes (8h) excluded from action buttons
    expect(html).toContain('Beatriz Alves');
    expect(html).toContain('14h descanso • CLT OK');
    expect(html).toContain('Helena Prado');
    expect(html).toContain('24h descanso • CLT OK');
    expect(html).not.toContain('Rafael Mendes');
    expect(html).toContain('1 folguista ocultado por descanso &lt; 11h (CLT)');

    // Validate all WhatsApp <a> links: target="_blank", rel="noopener noreferrer", NO type="button", LGPD-clean href, WCAG 2.5.3
    const anchorTags = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => m[0]);
    expect(anchorTags).toHaveLength(4);
    for (const anchor of anchorTags) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
      expect(anchor).not.toContain('type="button"');
      expect(anchor).toMatch(/href="https:\/\/wa\.me\/551190000010[56]\?text=/);
      expect(anchor).not.toContain('Carlos%20Rocha');
      expect(anchor).not.toContain('Mariana%20Costa');

      const labelMatch = anchor.match(/aria-label="([^"]+)"/);
      expect(labelMatch).not.toBeNull();
      expect(labelMatch![1]!.startsWith('Acionar no WhatsApp')).toBe(true);
    }

    // Validate Confirm buttons WCAG 2.5.3 Label-in-Name
    const confirmLabels = [
      ...html.matchAll(/<button\b[^>]*aria-label="(Confirmar Cobertura[^"]+)"/gi),
    ].map((m) => m[1]!);
    expect(confirmLabels).toHaveLength(4);
    expect(confirmLabels).toContain(
      'Confirmar Cobertura — Beatriz Alves no plantão de Carlos Rocha'
    );
  });

  it('5. renders accessible exhaustion banner and group WhatsApp fallback when zero eligible substitutes remain', () => {
    const absentCarlos = parseCuidador({
      id: 3,
      nome: 'Carlos Rocha',
      status: 'Faltou',
      turno: 'Noturno (19h-07h)',
      quarto: 'Quarto 03',
    });
    const exhaustedPool = [
      parseCuidador({ id: 9003, nome: 'Rafael Mendes', status: 'Folga', horasDescanso: 8 }),
    ];

    const html = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <PainelCobertura
          absentCaregiver={absentCarlos}
          cuidadores={[absentCarlos]}
          reservePool={exhaustedPool}
          onConfirmCoverage={() => undefined}
        />
      </ThemeProvider>
    );

    expect(html).toContain('Nenhum folguista elegível livre no momento');
    expect(html).toContain('Convocar grupo no WhatsApp');

    const anchorMatch = html.match(/<a\b[^>]*>/i);
    expect(anchorMatch).not.toBeNull();
    const anchorTag = anchorMatch![0];
    expect(anchorTag).toContain('href="https://wa.me/?text=');
    expect(anchorTag).toContain('target="_blank"');
    expect(anchorTag).toContain('rel="noopener noreferrer"');
    expect(anchorTag).not.toContain('type="button"');
    expect(anchorTag).toContain(
      'aria-label="Convocar grupo no WhatsApp para Quarto 03 (abre em nova aba)"'
    );
  });

  it('6. survives React 19 <StrictMode> double-effect lifecycle (start -> dispose -> start) without wedging', async () => {
    const added: string[] = [];
    const removed: string[] = [];
    const target: ConnectivityEventTarget = {
      addEventListener(type) {
        added.push(type);
      },
      removeEventListener(type) {
        removed.push(type);
      },
    };

    const api = createCaregiverApiClient({
      fetchImpl: async () =>
        new Response(JSON.stringify(getCanonicalSeed()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const controller = createCaregiverScheduleController({
      store: createLocalFirstStore({ storage: null }),
      api,
      eventTarget: target,
    });

    // Simulate React 19 StrictMode mount -> cleanup -> remount
    controller.start();
    controller.dispose();
    controller.start();

    await new Promise<void>((resolve) => {
      if (controller.getSnapshot().connectionStatus === 'online') {
        resolve();
        return;
      }
      const unsub = controller.subscribe(() => {
        if (controller.getSnapshot().connectionStatus === 'online') {
          unsub();
          resolve();
        }
      });
    });

    expect(controller.getSnapshot().connectionStatus).toBe('online');
    controller.dispose();

    expect(added).toEqual(['online', 'offline', 'online', 'offline']);
    expect(removed).toEqual(['offline', 'online', 'offline', 'online']);
  });

  it('7. renders BarraPlanilha (.no-print) with hidden file input (tabindex=-1, aria-hidden), WCAG 2.5.3 labels, and conditional Undo button on F5 hydration', () => {
    const cleanHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <BarraPlanilha
          cuidadores={getCanonicalSeed()}
          canUndoImport={false}
          onImportSchedule={async () => undefined}
          onUndoImport={async () => false}
        />
      </ThemeProvider>
    );

    expect(cleanHtml).toContain('no-print');
    expect(cleanHtml).toContain('role="region"');
    expect(cleanHtml).toContain('aria-labelledby="barra-planilha-heading"');
    expect(cleanHtml).toContain('PLANILHA &amp; BACKUP LOCAL-FIRST');
    expect(cleanHtml).toContain('Importar CSV');
    expect(cleanHtml).toContain('Exportar CSV / Backup');
    expect(cleanHtml).toContain('Exportar PDF A4');
    expect(cleanHtml).not.toContain('Desfazer Importação');

    // Hidden <input type="file"> excluded from Tab order and assistive tree (M4.2)
    const fileInputMatch = cleanHtml.match(/<input\b[^>]*type="file"[^>]*>/i);
    expect(fileInputMatch).not.toBeNull();
    expect(fileInputMatch![0]).toContain('tabindex="-1"');
    expect(fileInputMatch![0]).toContain('aria-hidden="true"');
    expect(fileInputMatch![0]).toContain('accept=".csv,.tsv,.txt');

    // Preloaded storage with undo_backup:v1 renders [Desfazer Importação] in 0ms on Dashboard boot (M3.3)
    const backingMap = new Map<string, string>([
      [
        SCHEDULE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          updatedAtIso: '2026-11-10T23:35:00.000Z',
          pendingRemoteSync: false,
          cuidadores: [parseCuidador({ id: 1, nome: 'Fernanda Melo', status: 'Presente' })],
        }),
      ],
      [
        UNDO_IMPORT_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          savedAtIso: '2026-11-10T23:34:50.000Z',
          cuidadores: getCanonicalSeed(),
        }),
      ],
    ]);
    const undoStore = createLocalFirstStore({
      storage: {
        getItem: (k) => backingMap.get(k) ?? null,
        setItem: (k, v) => {
          backingMap.set(k, v);
        },
        removeItem: (k) => {
          backingMap.delete(k);
        },
      },
    });

    const hydratedUndoHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <Dashboard controllerOptions={{ store: undoStore, eventTarget: null }} />
      </ThemeProvider>
    );

    expect(hydratedUndoHtml).toContain('Fernanda Melo');
    expect(hydratedUndoHtml).toContain('Desfazer Importação');

    // Decorative emojis inside BarraPlanilha buttons are aria-hidden="true" and spaced via Flexbox gap: 0.75,
    // and all 4 buttons enforce flex: '1 1 136px' (2x2 mobile grid keeping Card 1 above 667px fold — M5.2)
    for (const btnStyle of [
      barraPlanilhaStyles.importButton,
      barraPlanilhaStyles.exportButton,
      barraPlanilhaStyles.pdfButton,
      barraPlanilhaStyles.undoButton,
    ]) {
      const record = btnStyle as Record<string, unknown>;
      expect(record.gap).toBe(0.75);
      expect(record.flex).toBe('1 1 136px');
    }

    const allButtons = [...hydratedUndoHtml.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
    for (const [, inner] of allButtons) {
      expect(inner).not.toMatch(/<(button|a|input)\b/i);
    }
  });

  it('8. renders FolhaEscalaA4Document 1:1 with semantic tables, multi-page headers, LGPD mural masking, SVG sigv1 rubric, @media print CSS isolation, and [aria-modal="true"] paste/drop guard (S18, S20)', () => {
    const signature = synthesizeKeyboardVectorSignature('Dra. Helena Prado');
    expect(signature).not.toBeNull();

    const roster35 = Array.from({ length: 35 }, (_, idx) =>
      parseCuidador({
        id: idx + 1,
        nome: idx === 0 ? 'João da Conceição' : `Carlos Rocha ${idx + 1}`,
        status: idx === 1 ? 'Cobertura' : 'Presente',
        turno: idx % 2 === 0 ? 'Diurno (07h-19h)' : 'Noturno (19h-07h)',
        quarto: `Quarto ${String((idx % 12) + 1).padStart(2, '0')}`,
        telefone: `+55 11 90000-01${String((idx % 80) + 10).padStart(2, '0')}`,
        ...(idx === 1 ? { substituto: 'Beatriz Alves' } : {}),
      })
    );

    const lgpdMultiPageModel = buildA4ScheduleDocumentModel(roster35, {
      orientation: 'portrait',
      privacyMode: true,
      emittedAtIso: '2026-11-11T03:00:00.000Z',
      signaturePayload: signature!.serialized,
      signerLabel: 'Dra. Helena Prado — COREN-SP 000100',
    });
    expect(lgpdMultiPageModel.pages).toHaveLength(2);

    const sheetHtml = renderToStaticMarkup(<FolhaEscalaA4Document model={lgpdMultiPageModel} />);

    // 2 <article class="a4-sheet-page"> elements with semantic <table> and repeated <thead>
    const pageArticles = [...sheetHtml.matchAll(/<article\b[^>]*class="a4-sheet-page"[^>]*>/gi)];
    expect(pageArticles).toHaveLength(2);
    expect(sheetHtml).toContain('calc(297mm - 0.5px)');
    expect(sheetHtml).not.toContain('min-height:297mm');

    const tables = [...sheetHtml.matchAll(/<table\b[^>]*>/gi)];
    const theads = [...sheetHtml.matchAll(/<thead\b[^>]*>/gi)];
    expect(tables).toHaveLength(2);
    expect(theads).toHaveLength(2);
    expect(sheetHtml).toContain('Página 1/2');
    expect(sheetHtml).toContain('Página 2/2');
    expect(sheetHtml).toContain('FOLHA DE CONTINUAÇÃO');

    // LGPD Public Mural verification: masked titular & substituto, zero phone digits
    expect(sheetHtml).toContain('João C.');
    expect(sheetHtml).toContain('Carlos R.');
    expect(sheetHtml).toContain('Beatriz A.');
    expect(sheetHtml).toContain('MODO MURAL PÚBLICO LGPD');
    expect(sheetHtml).not.toContain('Conceição');
    expect(sheetHtml).not.toContain('Alves');
    expect(sheetHtml).not.toContain('90000');

    // Vector SVG signature + SHA-256 integrity seal rendered on sheet
    expect(sheetHtml).toContain('aria-label="Rubrica vetorial da coordenação"');
    expect(sheetHtml).toContain(lgpdMultiPageModel.sha256Hex);

    // S18: Verify index.css @media print isolation against MUI ModalManager overflow:hidden & Skia rasterization
    const indexCss = fs.readFileSync(path.join(frontendRoot, 'src/index.css'), 'utf8');
    expect(indexCss).toContain('#a4-print-sheet-host {\n  display: none !important;\n}');
    expect(indexCss).toContain('overflow: visible !important;');
    expect(indexCss).toContain('filter: none !important;');
    expect(indexCss).toContain('backdrop-filter: none !important;');
    expect(indexCss).toContain('box-shadow: none !important;');
    expect(indexCss).toContain("body[data-a4-sheet-print='active'] > #root");
    expect(indexCss).toContain("body[data-a4-sheet-print='active'] > #a4-print-sheet-host");
    expect(indexCss).toContain('height: calc(297mm - 0.5px);');
    expect(indexCss).toContain('height: calc(210mm - 0.5px);');
    expect(indexCss).toContain('.a4-sheet-page:not(:last-child)');
    expect(indexCss).not.toMatch(/min-height:\s*297mm/i);
    expect(indexCss).not.toMatch(/min-height:\s*210mm/i);

    // S20 & S20b: Verify isModalDialogOpen() across ALL 6 BarraPlanilha entrypoints (3 window + 3 local React drag/drop)
    // and sibling isolation of <ModalFolhaEscalaA4> outside the CSV dropzone <Box>
    expect(isModalDialogOpen(null)).toBe(false);
    expect(
      isModalDialogOpen({
        querySelector: (sel: string) => (sel === '[aria-modal="true"]' ? ({} as Element) : null),
      })
    ).toBe(true);
    expect(
      isModalDialogOpen({
        querySelector: () => null,
      })
    ).toBe(false);

    const barraSource = fs.readFileSync(
      path.join(frontendRoot, 'src/components/BarraPlanilha/BarraPlanilha.tsx'),
      'utf8'
    );
    const modalGuardMatches = [...barraSource.matchAll(/isModalDialogOpen\(\)/g)];
    expect(modalGuardMatches.length).toBeGreaterThanOrEqual(6);
    expect(barraSource).toMatch(/<\/Box>\s*\{isPdfStudioOpen \?\s*\(?\s*<ModalFolhaEscalaA4/);

    // S21: Verify full ModalFolhaEscalaA4 studio controls (role="dialog", aria-modal="true", WCAG 2.1.1 keyboard rubric)
    const studioHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <ModalFolhaEscalaA4
          open
          disablePortal
          initialPrivacyMode
          cuidadores={roster35}
          onClose={() => undefined}
        />
      </ThemeProvider>
    );
    expect(studioHtml).toContain('role="dialog"');
    expect(studioHtml).toContain('aria-modal="true"');
    expect(studioHtml).toContain('Baixar PDF Vetorial (.pdf)');
    expect(studioHtml).toContain('Imprimir para Mural');
    expect(studioHtml).toContain('Retrato (210×297mm)');
    expect(studioHtml).toContain('Paisagem (297×210mm)');
    expect(studioHtml).toContain('Modo Mural Público LGPD: Ativo');
    expect(studioHtml).toContain('Gerar Rubrica por Teclado');
    expect(studioHtml).toContain('Limpar Rubrica');
    expect(studioHtml).toContain('id="a4-signer-input"');

    const studioButtons = [...studioHtml.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
    expect(studioButtons.length).toBeGreaterThanOrEqual(7);
    for (const [, inner] of studioButtons) {
      expect(inner).not.toMatch(/<(button|a|input|div|p)\b/i);
    }

    // MAJ-03 & IMP-05: Zero background-color transition flash on toggleChipButton + 44px mobile touch targets
    const activeChipStyle = modalFolhaA4Styles.toggleChipButton(true) as Record<string, unknown>;
    expect(activeChipStyle.transition).toBeDefined();
    expect(String(activeChipStyle.transition)).not.toContain('background-color');
    expect((activeChipStyle.minHeight as { xs?: string })?.xs).toBe('44px');
    expect(
      (
        (modalFolhaA4Styles.downloadPrimaryButton as Record<string, unknown>).minHeight as {
          xs?: string;
        }
      )?.xs
    ).toBe('44px');
  });

  it('9. renders BarraIndicadores (.no-print) above SimuladorPainel with WAI-ARIA progressbar, tabular nowrap numbers, mixed-state accounting, and zero LGPD ARIA leaks (FE #8)', () => {
    const store = createLocalFirstStore({ storage: null });
    const dashboardHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <Dashboard controllerOptions={{ store, eventTarget: null }} />
      </ThemeProvider>
    );

    // Hierarchy: DASHBOARD header -> BarraIndicadores -> SimuladorPainel ("Falta de Carlos")
    const headerIdx = dashboardHtml.indexOf('DASHBOARD');
    const kpiHeadingIdx = dashboardHtml.indexOf('barra-indicadores-heading');
    const simuladorIdx = dashboardHtml.indexOf('Falta de Carlos');
    expect(headerIdx).toBeGreaterThan(-1);
    expect(kpiHeadingIdx).toBeGreaterThan(headerIdx);
    expect(simuladorIdx).toBeGreaterThan(kpiHeadingIdx);

    // Standalone BarraIndicadores SSR contract: .no-print, role="region", zero <section>, zero <a>, zero assertive live (S10, S11, S15)
    const coveredAndAlertMixedRoster = getCanonicalSeed().map((item) => {
      if (item.id === 2) {
        return applyStatusChange(item, 'Cobertura', 'Beatriz Alves');
      }
      if (item.id === CARLOS_ROCHA_ID) {
        return applyStatusChange(item, 'Faltou');
      }
      return item;
    });

    const mixedHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <BarraIndicadores cuidadores={coveredAndAlertMixedRoster} />
      </ThemeProvider>
    );

    expect(mixedHtml).toContain('no-print');
    expect(mixedHtml).toContain('role="region"');
    expect(mixedHtml).toContain('aria-labelledby="barra-indicadores-heading"');
    expect(mixedHtml).not.toMatch(/<section\b/i);
    expect(mixedHtml).not.toMatch(/<a\b/i);
    expect(mixedHtml).not.toContain('aria-live="assertive"');

    // WAI-ARIA 1.2 progressbar attributes + named polite status region (M4.3 / S15)
    expect(mixedHtml).toContain('role="progressbar"');
    expect(mixedHtml).toContain('aria-valuemin="0"');
    expect(mixedHtml).toContain('aria-valuemax="100"');
    expect(mixedHtml).toContain('aria-valuenow="75"');
    expect(mixedHtml).toContain('aria-valuetext="75% dos postos assistidos');
    expect(mixedHtml).toContain('aria-label="Resumo operacional do turno"');

    // Mixed-state accounting truth (M1.2 / S06): preserves +R$ 125,00 realized savings AND surfaces Risco R$ 125,00
    expect(mixedHtml).toContain('3 Ativos');
    expect(mixedHtml).toContain('2 tit + 1 cob');
    expect(mixedHtml).toContain('1 Pendente');
    expect(mixedHtml).toContain('+R$ 125,00');
    expect(mixedHtml).toContain('Risco R$ 125,00');

    // BLK-03 / IMP-04: Atomic <span style="white-space:nowrap"> wrapping on currency tokens in statusRow (both alert and covered)
    expect(mixedHtml).toMatch(
      /\(evita (?:<style[^>]*>[^<]*white-space:nowrap[^<]*<\/style>)?<span[^>]*>\+R\$ 125,00<\/span> urg\.\)/
    );

    const coveredOnlyRoster = getCanonicalSeed().map((item) =>
      item.id === CARLOS_ROCHA_ID ? applyStatusChange(item, 'Cobertura', 'Beatriz Alves') : item
    );
    const coveredHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <BarraIndicadores cuidadores={coveredOnlyRoster} />
      </ThemeProvider>
    );
    expect(coveredHtml).toMatch(
      /100% assistido • (?:<style[^>]*>[^<]*white-space:nowrap[^<]*<\/style>)?<span[^>]*>\+R\$ 125,00<\/span> economizados c\/ reserva/
    );

    // Full LGPD privacyMode masking across DOM + ARIA tree (M3 / S09)
    const maskedHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <BarraIndicadores cuidadores={coveredAndAlertMixedRoster} privacyMode />
      </ThemeProvider>
    );
    expect(maskedHtml).toContain('R$ •••,••');
    expect(maskedHtml).toContain('Valores ocultos');
    expect(maskedHtml).toContain('valores financeiros ocultos');
    expect(maskedHtml).not.toContain('+R$');
    expect(maskedHtml).not.toMatch(/125|190|315/);

    // Style invariants: tabular-nums, nowrap, zero ellipsis on kpiSubLabel, proportional Inter override, 320px 2-column fallback, reduced-motion (S12, S13, S18, BLK-01..03)
    const kpiValueStyle = barraIndicadoresStyles.kpiValue as Record<string, unknown>;
    expect(kpiValueStyle.fontFamily).toContain('JetBrains Mono');
    expect(kpiValueStyle.fontVariantNumeric).toBe('tabular-nums');
    expect(kpiValueStyle.whiteSpace).toBe('nowrap');
    expect(kpiValueStyle.overflowWrap).toBeUndefined();

    const kpiSubLabelStyle = barraIndicadoresStyles.kpiSubLabel as Record<string, unknown>;
    expect(String(kpiSubLabelStyle.fontFamily)).toContain('Inter');
    expect(kpiSubLabelStyle.fontVariantNumeric).toBe('tabular-nums');
    expect(kpiSubLabelStyle.whiteSpace).toBe('nowrap');
    expect(kpiSubLabelStyle.textOverflow).toBeUndefined();

    const statusTextStyle = barraIndicadoresStyles.statusText('alert') as Record<string, unknown>;
    expect(String(statusTextStyle.fontFamily)).toContain('Inter');
    expect(statusTextStyle.fontVariantNumeric).toBe('tabular-nums');

    const nowrapCurrencyStyle = barraIndicadoresStyles.nowrapCurrency as Record<string, unknown>;
    expect(nowrapCurrencyStyle.whiteSpace).toBe('nowrap');
    expect(nowrapCurrencyStyle.fontVariantNumeric).toBe('tabular-nums');

    const kpiGridStyle = barraIndicadoresStyles.kpiGrid as Record<string, unknown>;
    expect(kpiGridStyle['@media (max-width: 359.95px)']).toEqual({
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    });

    const economiaCardStyle = barraIndicadoresStyles.kpiCard('optimal', true) as Record<
      string,
      unknown
    >;
    expect(economiaCardStyle['@media (max-width: 359.95px)']).toEqual({
      gridColumn: '1 / -1',
    });

    const fillStyle = barraIndicadoresStyles.thermometerFill(75, 'alert') as Record<
      string,
      unknown
    >;
    expect(fillStyle.width).toBe('75%');
    expect(fillStyle['@media (prefers-reduced-motion: reduce)']).toEqual({
      transition: 'none',
    });

    // Unused-import guard check on barraPlanilhaStyles existing import
    expect(barraPlanilhaStyles.actionsRow).toBeDefined();
  });

  it('10. enforces FE #6 end-to-end LGPD Privacy Mode across Dashboard, CardCuidador, PainelCobertura (eligible & exhausted), BarraPlanilha, and ModalFolhaEscalaA4 with zero side-channel leaks (S08..S12, S14, S17..S19)', () => {
    // S18: WCAG 2.2 AA sRGB contrast across DASHBOARD_PRIVACY_TOKENS & PAINEL_COBERTURA_TOKENS.privacyPhoneBadge
    for (const [stateKey, tok] of Object.entries(DASHBOARD_PRIVACY_TOKENS)) {
      expect(
        wcagContrastRatio(tok.fg, tok.bg),
        `Dashboard privacy "${stateKey}" text (${tok.fg} on ${tok.bg}) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrastRatio(tok.fg, tok.hoverBg),
        `Dashboard privacy "${stateKey}" hover (${tok.fg} on ${tok.hoverBg}) must exceed 4.5:1`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrastRatio(tok.border, '#F9F8F6'),
        `Dashboard privacy "${stateKey}" border (${tok.border} on #F9F8F6) must exceed 3.0:1`
      ).toBeGreaterThanOrEqual(3.0);
    }
    expect(
      wcagContrastRatio(
        DASHBOARD_PRIVACY_TOKENS.inactive.border,
        DASHBOARD_PRIVACY_TOKENS.inactive.bg
      )
    ).toBeGreaterThanOrEqual(3.0);

    const phoneBadgeTok = PAINEL_COBERTURA_TOKENS.privacyPhoneBadge;
    expect(wcagContrastRatio(phoneBadgeTok.fg, phoneBadgeTok.bg)).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrastRatio(phoneBadgeTok.border, phoneBadgeTok.bg)).toBeGreaterThanOrEqual(3.0);
    expect(wcagContrastRatio(phoneBadgeTok.border, '#FFFFFF')).toBeGreaterThanOrEqual(3.0);
    expect(
      wcagContrastRatio(phoneBadgeTok.border, PAINEL_COBERTURA_TOKENS.exhaustedAlert.bg)
    ).toBeGreaterThanOrEqual(3.0);

    // S18 & S19: Zero white-on-white background-color transition flash + 44px mobile touch target + CardCuidador overflowWrap
    for (const activeState of [false, true]) {
      const btnStyle = dashboardStyles.privacyToggleButton(activeState) as Record<string, unknown>;
      expect(btnStyle.minHeight).toEqual({ xs: '44px', sm: '36px' });
      expect(String(btnStyle.transition)).not.toContain('background-color');
      expect(String(btnStyle.transition)).not.toContain('all');
      expect(btnStyle['@media (prefers-reduced-motion: reduce)']).toEqual({ transition: 'none' });
    }

    const infoGroupStyle = cardCuidadorStyles.infoGroup as Record<string, unknown>;
    expect(infoGroupStyle.minWidth).toBe(0);
    expect(infoGroupStyle.maxWidth).toBe('100%');
    for (const textKey of ['caregiverName', 'metaLine', 'coverageNote'] as const) {
      const textStyle = cardCuidadorStyles[textKey] as Record<string, unknown>;
      expect(textStyle.overflowWrap).toBe('anywhere');
      expect(textStyle.maxWidth).toBe('100%');
    }

    // S08: CardCuidador masks titular, substituto, AND aria-label (WCAG 2.5.3 Label-in-Name)
    const coveredCarlos = parseCuidador({
      id: 3,
      nome: 'Carlos Rocha',
      status: 'Cobertura',
      turno: 'Noturno (19h-07h)',
      quarto: 'Quarto 03',
      telefone: '+55 11 90000-0103',
      substituto: 'Beatriz Alves',
    });
    const cardLgpdHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <CardCuidador cuidador={coveredCarlos} privacyMode onToggleStatus={() => undefined} />
      </ThemeProvider>
    );
    expect(cardLgpdHtml).toContain('Carlos R.');
    expect(cardLgpdHtml).toContain('Cobertura: Beatriz A.');
    expect(cardLgpdHtml).toMatch(/aria-label="Carlos R\. — .*?Substituto: Beatriz A\./);
    expect(cardLgpdHtml).not.toContain('Rocha');
    expect(cardLgpdHtml).not.toContain('Alves');
    expect(cardLgpdHtml).not.toContain('90000');

    // Default Dashboard boot (privacyMode = false) renders aria-pressed="false" and "Privacidade LGPD: Inativa"
    const defaultStore = createLocalFirstStore({ storage: null });
    const defaultDashHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <Dashboard controllerOptions={{ store: defaultStore, eventTarget: null }} />
      </ThemeProvider>
    );
    expect(defaultDashHtml).toContain('aria-pressed="false"');
    expect(defaultDashHtml).toContain('Privacidade LGPD: Inativa');

    // S10, S11, S12, S15: Preloaded escala_elderly:privacy_mode:v1=true + mixed coverage & absence state
    const mixedRoster = getCanonicalSeed().map((item) => {
      if (item.id === 2) {
        return applyStatusChange(item, 'Cobertura', 'Beatriz Alves');
      }
      if (item.id === CARLOS_ROCHA_ID) {
        return applyStatusChange(item, 'Faltou');
      }
      return item;
    });
    const backing = new Map<string, string>([
      [
        SCHEDULE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          updatedAtIso: '2026-11-11T16:00:00.000Z',
          pendingRemoteSync: false,
          cuidadores: mixedRoster,
        }),
      ],
      [
        PRIVACY_MODE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          enabled: true,
          updatedAtIso: '2026-11-11T16:00:00.000Z',
        }),
      ],
    ]);
    const privacyStorage: StorageAdapter = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
      removeItem: (k) => {
        backing.delete(k);
      },
    };
    const lgpdStore = createLocalFirstStore({ storage: privacyStorage });

    const lgpdDashHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <Dashboard controllerOptions={{ store: lgpdStore, eventTarget: null }} />
      </ThemeProvider>
    );

    expect(lgpdDashHtml).toContain('aria-pressed="true"');
    expect(lgpdDashHtml).toContain('Privacidade LGPD: Ativa');
    expect(lgpdDashHtml).toContain('Exportar CSV (LGPD)');
    expect(lgpdDashHtml).toContain('R$ •••,••');
    expect(lgpdDashHtml).toContain('Valores ocultos');
    expect(lgpdDashHtml).toContain('Ana S.');
    expect(lgpdDashHtml).toContain('Lucas L.');
    expect(lgpdDashHtml).toContain('Cobertura: Beatriz A.');
    expect(lgpdDashHtml).toContain('QUEM PODE COBRIR? — Carlos R. (Quarto 03)');
    expect(lgpdDashHtml).toContain('Helena P.');
    expect(lgpdDashHtml).toContain('Confirmar Cobertura — Helena P. no plantão de Carlos R.');
    expect(lgpdDashHtml).toContain('Contato oculto (LGPD)');
    // S12: Canonical cuidadores prop preserved allocation shadowing of Beatriz Alves (id=2) -> "1 já alocado em outra cobertura"
    expect(lgpdDashHtml).toContain('1 já alocado em outra cobertura');

    // Zero <a> tags, zero wa.me URLs, zero phone digits, zero surnames, and zero financial figures anywhere in HTML/ARIA
    expect([...lgpdDashHtml.matchAll(/<a\b[^>]*>/gi)]).toHaveLength(0);
    expect(lgpdDashHtml).not.toContain('wa.me');
    for (const forbiddenPiiOrMoney of [
      'Souza',
      'Lima',
      'Rocha',
      'Costa',
      'Alves',
      'Prado',
      'Mendes',
      '90000',
      '55119',
      '+R$',
      '125',
      '190',
      '315',
    ]) {
      expect(lgpdDashHtml).not.toContain(forbiddenPiiOrMoney);
    }

    // S11: Exhausted reserve pool WITHOUT quarto under privacyMode=true suppresses group wa.me <a> and masks absentCaregiver.nome
    const absentWithoutRoom = parseCuidador({
      id: 3,
      nome: 'Carlos Rocha',
      status: 'Faltou',
      turno: 'Noturno (19h-07h)',
    });
    const exhaustedPool = [
      parseCuidador({ id: 9003, nome: 'Rafael Mendes', status: 'Folga', horasDescanso: 8 }),
    ];
    const exhaustedLgpdHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <PainelCobertura
          absentCaregiver={absentWithoutRoom}
          cuidadores={[absentWithoutRoom]}
          reservePool={exhaustedPool}
          privacyMode
          onConfirmCoverage={() => undefined}
        />
      </ThemeProvider>
    );
    expect(exhaustedLgpdHtml).toContain('QUEM PODE COBRIR? — Carlos R.');
    expect(exhaustedLgpdHtml).toContain('Contato oculto (LGPD)');
    expect(exhaustedLgpdHtml).not.toMatch(/<a\b/i);
    expect(exhaustedLgpdHtml).not.toContain('wa.me');
    expect(exhaustedLgpdHtml).not.toContain('Rocha');
    expect(exhaustedLgpdHtml).not.toContain('Convocar grupo no WhatsApp');

    // S14: ModalFolhaEscalaA4 opens directly in Active LGPD Mural Mode when initialPrivacyMode=true
    const modalLgpdHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <ModalFolhaEscalaA4
          open
          cuidadores={mixedRoster}
          initialPrivacyMode
          disablePortal
          onClose={() => undefined}
        />
      </ThemeProvider>
    );
    expect(modalLgpdHtml).toContain('Modo Mural Público LGPD: Ativo');
    expect(modalLgpdHtml).toContain('MODO MURAL PÚBLICO LGPD');
    expect(modalLgpdHtml).toContain('Restrito (LGPD)');
    expect(modalLgpdHtml).toContain('Carlos R.');
    expect(modalLgpdHtml).not.toContain('Rocha');
    expect(modalLgpdHtml).not.toContain('Souza');
    expect(modalLgpdHtml).not.toContain('90000');

    // S17: Cross-tab storage synchronization helper filters strictly by PRIVACY_MODE_STORAGE_KEY or null (clear)
    expect(syncPrivacyModeFromStorageEvent('unrelated:key', lgpdStore)).toBeNull();
    expect(syncPrivacyModeFromStorageEvent(PRIVACY_MODE_STORAGE_KEY, lgpdStore)).toBe(true);
    lgpdStore.writePrivacyMode(false);
    expect(syncPrivacyModeFromStorageEvent(PRIVACY_MODE_STORAGE_KEY, lgpdStore)).toBe(false);
    expect(syncPrivacyModeFromStorageEvent(null, lgpdStore)).toBe(false);
  });

  it('11. enforces FE #5 multiplayer hook purity (M4.1), SSR zero-socket construction safety (M5.3), and StrictMode privacy subscription survival (S18..S20)', () => {
    let broadcastConstructedDuringSsr = 0;
    let sseConstructedDuringSsr = 0;

    const ssrHtml = renderToStaticMarkup(
      <ThemeProvider theme={warmCareTheme}>
        <Dashboard
          controllerOptions={{
            store: createLocalFirstStore({ storage: null }),
            eventTarget: null,
            broadcastChannelFactory: () => {
              broadcastConstructedDuringSsr += 1;
              return null;
            },
            eventSourceFactory: () => {
              sseConstructedDuringSsr += 1;
              return null;
            },
          }}
        />
      </ThemeProvider>
    );

    // M5.3 / S18: Synchronous SSR render MUST NEVER allocate BroadcastChannel or EventSource sockets!
    expect(broadcastConstructedDuringSsr).toBe(0);
    expect(sseConstructedDuringSsr).toBe(0);
    expect(ssrHtml).toMatch(/<h1[^>]*>DASHBOARD<\/h1>/);
    expect(ssrHtml).toContain('role="status"');
    expect(ssrHtml).toContain('aria-live="polite"');
    expect(ssrHtml).toContain('SINCRONIZANDO...');

    // M4.1 / S19: Verify useCaregivers.ts keeps side effects (writePrivacyMode + publishPrivacyMode)
    // strictly OUTSIDE setPrivacyMode(...) state updater so React 19 <StrictMode> never double-broadcasts!
    const useCaregiversSource = fs.readFileSync(
      path.join(frontendRoot, 'src/hooks/useCaregivers.ts'),
      'utf8'
    );
    expect(useCaregiversSource).toContain('controller.subscribePrivacyMode');
    expect(useCaregiversSource).toContain('controller.publishPrivacyMode(next)');
    expect(useCaregiversSource).not.toMatch(
      /setPrivacyMode\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?(?:writePrivacyMode|publishPrivacyMode)/
    );
  });
});
