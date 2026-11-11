import { ThemeProvider } from '@mui/material';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BarraPlanilha from '../src/components/BarraPlanilha/BarraPlanilha';
import { BARRA_PLANILHA_TOKENS } from '../src/components/BarraPlanilha/BarraPlanilha.styles';
import CardCuidador from '../src/components/CardCuidador/CardCuidador';
import { CARD_STATUS_TOKENS } from '../src/components/CardCuidador/CardCuidador.styles';
import PainelCobertura from '../src/components/PainelCobertura/PainelCobertura';
import { PAINEL_COBERTURA_TOKENS } from '../src/components/PainelCobertura/PainelCobertura.styles';
import { SIMULADOR_BUTTON_TOKENS } from '../src/components/SimuladorPainel/SimuladorPainel.styles';
import Dashboard from '../src/pages/Dashboard';
import { CONNECTION_BADGE_TOKENS } from '../src/pages/Dashboard.styles';
import { createCaregiverApiClient } from '../src/services/caregiverApi';
import {
  CARLOS_ROCHA_ID,
  type ConnectivityEventTarget,
  createCaregiverScheduleController,
} from '../src/services/caregiverSyncController';
import {
  SCHEDULE_STORAGE_KEY,
  type StorageAdapter,
  UNDO_IMPORT_STORAGE_KEY,
  createLocalFirstStore,
  getCanonicalSeed,
} from '../src/services/localFirstStore';
import { warmCareTheme } from '../src/theme/theme';
import { applyStatusChange, parseCuidador } from '../src/types/caregiver';

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

    // Decorative emojis inside BarraPlanilha buttons are aria-hidden="true" (WCAG 2.5.3)
    const allButtons = [...hydratedUndoHtml.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
    for (const [, inner] of allButtons) {
      expect(inner).not.toMatch(/<(button|a|input)\b/i);
    }
  });
});
