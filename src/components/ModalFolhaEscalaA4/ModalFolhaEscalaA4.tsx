import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, Dialog } from '@mui/material';
import {
  type A4ScheduleDocumentModel,
  type PageOrientation,
  applyRuntimePageGeometry,
  buildA4ScheduleDocumentModel,
  buildPdfFilename,
  compileSchedulePdfBytes,
  computeOpticalSheetScale,
} from '../../services/a4PdfScheduleEngine';
import {
  type SignaturePoint,
  signatureToSvgPathData,
  simplifySignatureStrokes,
  synthesizeKeyboardVectorSignature,
} from '../../services/vectorSignatureProtocol';
import type { Cuidador } from '../../types/caregiver';
import Text from '../common/Text';
import {
  MODAL_FOLHA_A4_TOKENS,
  getSheetStatusBadgeToken,
  styles,
} from './ModalFolhaEscalaA4.styles';

export interface FolhaEscalaA4DocumentProps {
  readonly model: A4ScheduleDocumentModel;
}

export function FolhaEscalaA4Document({ model }: FolhaEscalaA4DocumentProps) {
  const signatureSvgPath = useMemo(
    () => (model.signature ? signatureToSvgPathData(model.signature) : ''),
    [model.signature]
  );

  return (
    <div data-testid="folha-escala-a4-document">
      {model.pages.map((page) => {
        const pageLabel = `Página ${page.pageNumber}/${page.totalPages}`;

        return (
          <article
            key={page.pageNumber}
            className="a4-sheet-page"
            data-orientation={model.orientation}
            aria-label={`Folha A4 da Escala — ${pageLabel}`}
            style={{
              width: `${model.dimensions.widthMm}mm`,
              height: `calc(${model.dimensions.heightMm}mm - 0.5px)`,
              maxHeight: `calc(${model.dimensions.heightMm}mm - 0.5px)`,
              position: 'relative',
              boxSizing: 'border-box',
              overflow: 'hidden',
              backgroundColor: MODAL_FOLHA_A4_TOKENS.sheetPaper.bg,
              color: MODAL_FOLHA_A4_TOKENS.sheetPaper.fg,
              border: `1px solid ${MODAL_FOLHA_A4_TOKENS.sheetPaper.border}`,
              padding: `${model.marginTopMm}mm ${model.marginXMm}mm ${model.marginBottomMm}mm`,
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            }}
          >
            {/* 1. Cabecalho Institucional A4 (repetido em 1..N) */}
            <header
              style={{
                height: `${page.headerHeightMm}mm`,
                backgroundColor: MODAL_FOLHA_A4_TOKENS.sheetHeaderBand.bg,
                color: MODAL_FOLHA_A4_TOKENS.sheetHeaderBand.fg,
                borderLeft: '2.2mm solid #007A78',
                padding: page.isContinuation ? '2.2mm 4mm' : '2.8mm 4mm',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                marginBottom: '2mm',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '3mm',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: page.isContinuation ? '9.8pt' : '11.2pt',
                      fontWeight: 800,
                      letterSpacing: '0.02em',
                      lineHeight: 1.2,
                    }}
                  >
                    {page.isContinuation
                      ? `${model.unitTitle} — FOLHA DE CONTINUAÇÃO`
                      : model.unitTitle}
                  </div>
                  {!page.isContinuation ? (
                    <div
                      style={{
                        fontSize: '7.6pt',
                        color: MODAL_FOLHA_A4_TOKENS.sheetSubtitleOnDark.fg,
                        marginTop: '0.8mm',
                      }}
                    >
                      {model.subtitle}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    textAlign: 'right',
                    fontSize: '7.3pt',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '1.2mm',
                  }}
                >
                  <span>
                    Emissão: {model.emittedDisplayBr} • {pageLabel}
                  </span>
                  {model.privacyMode ? (
                    <span
                      style={{
                        backgroundColor: MODAL_FOLHA_A4_TOKENS.lgpdActiveBadge.bg,
                        color: MODAL_FOLHA_A4_TOKENS.lgpdActiveBadge.fg,
                        border: `1px solid ${MODAL_FOLHA_A4_TOKENS.lgpdActiveBadge.border}`,
                        borderRadius: '3px',
                        padding: '0.5mm 2mm',
                        fontSize: '6.6pt',
                        fontWeight: 700,
                      }}
                    >
                      MODO MURAL PÚBLICO LGPD
                    </span>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  fontSize: '7.6pt',
                  fontWeight: 700,
                  color: MODAL_FOLHA_A4_TOKENS.sheetHeaderBand.fg,
                }}
              >
                Total: {model.summary.total} &nbsp;|&nbsp; Presentes: {model.summary.presentes}{' '}
                &nbsp;|&nbsp; Coberturas: {model.summary.coberturas} &nbsp;|&nbsp; Faltas:{' '}
                {model.summary.faltas} &nbsp;|&nbsp; Folgas: {model.summary.folgas}
              </div>
            </header>

            {/* 2. Grade Tabular Semantica HTML5 1:1 com o PDF Vetorial */}
            <table
              aria-label={`Escala de plantão — ${pageLabel}`}
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                {model.columns.map((col) => (
                  <col key={col.key} style={{ width: `${col.widthMm}mm` }} />
                ))}
              </colgroup>
              <thead>
                <tr
                  style={{
                    height: `${page.tableHeaderHeightMm}mm`,
                    backgroundColor: MODAL_FOLHA_A4_TOKENS.tableHeader.bg,
                    color: MODAL_FOLHA_A4_TOKENS.tableHeader.fg,
                    borderTop: `1px solid ${MODAL_FOLHA_A4_TOKENS.tableHeader.border}`,
                    borderBottom: `1px solid ${MODAL_FOLHA_A4_TOKENS.tableHeader.border}`,
                  }}
                >
                  {model.columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      style={{
                        textAlign: col.align,
                        fontSize: '7.2pt',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '0 1.6mm',
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.length === 0 ? (
                  <tr style={{ height: '12mm', backgroundColor: '#F8FAFC' }}>
                    <td
                      colSpan={6}
                      style={{
                        padding: '2mm 4mm',
                        fontSize: '8.5pt',
                        color: '#374151',
                        borderBottom: '1px solid #CBD5E1',
                      }}
                    >
                      Nenhum profissional registrado na escala atual.
                    </td>
                  </tr>
                ) : (
                  page.rows.map((row) => {
                    const badgeTok = getSheetStatusBadgeToken(row.status);
                    return (
                      <tr
                        key={`${page.pageNumber}-${row.index}`}
                        style={{
                          height: `${row.heightMm}mm`,
                          backgroundColor: row.index % 2 === 1 ? '#F8FAFC' : '#FFFFFF',
                          borderBottom: '1px solid #CBD5E1',
                        }}
                      >
                        <td
                          style={{
                            textAlign: 'center',
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: '7.6pt',
                            color: '#374151',
                            padding: '0 1mm',
                          }}
                        >
                          {row.idText}
                        </td>
                        <td
                          style={{
                            fontSize: `${row.nomeFit.fontSizePt}pt`,
                            fontWeight: 700,
                            lineHeight: 1.22,
                            padding: '0.4mm 1.6mm',
                            color: MODAL_FOLHA_A4_TOKENS.sheetPaper.fg,
                            overflow: 'hidden',
                          }}
                        >
                          {row.nomeFit.lines.join(' ')}
                        </td>
                        <td
                          style={{
                            fontSize: `${row.turnoFit.fontSizePt}pt`,
                            lineHeight: 1.22,
                            padding: '0.4mm 1.6mm',
                            color: '#374151',
                            overflow: 'hidden',
                          }}
                        >
                          {row.turnoFit.lines.join(' ')}
                        </td>
                        <td
                          style={{
                            fontSize: `${row.quartoFit.fontSizePt}pt`,
                            lineHeight: 1.22,
                            padding: '0.4mm 1.6mm',
                            color: MODAL_FOLHA_A4_TOKENS.sheetPaper.fg,
                            overflow: 'hidden',
                          }}
                        >
                          {row.quartoFit.lines.join(' ')}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0 1.4mm' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '100%',
                              backgroundColor: badgeTok.bg,
                              color: badgeTok.fg,
                              border: `1px solid ${badgeTok.border}`,
                              borderRadius: '3px',
                              fontSize: '6.8pt',
                              fontWeight: 700,
                              lineHeight: '4.6mm',
                              textAlign: 'center',
                            }}
                          >
                            {row.statusLabel}
                          </span>
                        </td>
                        <td
                          style={{
                            fontSize: `${row.contatoFit.fontSizePt}pt`,
                            lineHeight: 1.22,
                            padding: '0.4mm 1.6mm',
                            color: '#374151',
                            overflow: 'hidden',
                          }}
                        >
                          {row.contatoFit.lines.join(' ')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* 3. Rodape Institucional: Rubrica Vetorial sigv1 + Selo SHA-256 */}
            <footer
              style={{
                position: 'absolute',
                left: `${model.marginXMm}mm`,
                right: `${model.marginXMm}mm`,
                top: `${page.footerYmm}mm`,
                height: `${page.footerHeightMm}mm`,
                backgroundColor: '#F8FAFC',
                border: `1px solid ${MODAL_FOLHA_A4_TOKENS.tableHeader.border}`,
                padding: '1.8mm 3.5mm',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: '5mm',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  width: `${Math.min(78, model.contentWidthMm * 0.42)}mm`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                }}
              >
                <div style={{ height: '11.2mm', display: 'flex', alignItems: 'flex-end' }}>
                  {model.signature !== null ? (
                    <svg
                      viewBox={`0 0 ${model.signature.width} ${model.signature.height}`}
                      aria-label="Rubrica vetorial da coordenação"
                      style={{ width: '100%', height: '100%', display: 'block' }}
                    >
                      <path
                        d={signatureSvgPath}
                        fill="none"
                        stroke={MODAL_FOLHA_A4_TOKENS.signaturePad.fg}
                        strokeWidth={9}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </div>
                <div
                  style={{
                    borderTop: `1px solid ${MODAL_FOLHA_A4_TOKENS.signaturePad.border}`,
                    paddingTop: '0.8mm',
                    fontSize: '6.8pt',
                    fontWeight: 700,
                    color: MODAL_FOLHA_A4_TOKENS.sheetPaper.fg,
                  }}
                >
                  {model.signerLabel.length > 0
                    ? `Coordenação / Responsável: ${model.signerLabel}`
                    : 'Assinatura / Carimbo da Coordenação de Enfermagem'}
                </div>
                <div style={{ fontSize: '6.5pt', color: '#374151' }}>
                  {model.signature !== null
                    ? 'Rubrica vetorial sigv1 registrada'
                    : 'Espaço para rubrica física'}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8mm',
                }}
              >
                <div
                  style={{
                    fontSize: '6.8pt',
                    fontWeight: 700,
                    color: MODAL_FOLHA_A4_TOKENS.sheetPaper.fg,
                  }}
                >
                  SELO DE INTEGRIDADE SHA-256 • {pageLabel}
                </div>
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '6.5pt',
                    color: '#374151',
                    wordBreak: 'break-all',
                  }}
                >
                  {model.sha256Hex}
                </div>
                <div style={{ fontSize: '6.5pt', color: '#374151' }}>
                  Emitido em {model.emittedDisplayBr} • PDF 1.4 Vetorial ISO 32000-1 (100%
                  Local-First)
                </div>
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

export interface ModalFolhaEscalaA4Props {
  readonly open: boolean;
  readonly cuidadores: readonly Cuidador[];
  readonly onClose: () => void;
  readonly initialPrivacyMode?: boolean;
}

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 108;

export default function ModalFolhaEscalaA4({
  open,
  cuidadores,
  onClose,
  initialPrivacyMode = false,
}: ModalFolhaEscalaA4Props) {
  const [orientation, setOrientation] = useState<PageOrientation>('portrait');
  const [privacyMode, setPrivacyMode] = useState<boolean>(initialPrivacyMode);
  const [signerLabel, setSignerLabel] = useState<string>('');
  const [signaturePayload, setSignaturePayload] = useState<string | null>(null);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [availableWidthPx, setAvailableWidthPx] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.max(240, window.innerWidth - 64) : 794
  );

  const previewDeskRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rawStrokesRef = useRef<SignaturePoint[][]>([]);
  const activeStrokeRef = useRef<SignaturePoint[] | null>(null);

  const documentModel = useMemo(
    () =>
      buildA4ScheduleDocumentModel(cuidadores, {
        orientation,
        privacyMode,
        signaturePayload,
        signerLabel,
      }),
    [cuidadores, orientation, privacyMode, signaturePayload, signerLabel]
  );

  const scaleInfo = useMemo(
    () => computeOpticalSheetScale(availableWidthPx, orientation),
    [availableWidthPx, orientation]
  );

  // Injetar @page literal em mm + body[data-a4-sheet-print="active"] com limpeza LIFO garantida
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }
    return applyRuntimePageGeometry(document, orientation);
  }, [open, orientation]);

  // Medicao responsiva do container de preview para zoom optico 375x667 -> Desktop
  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return undefined;
    }
    const target = previewDeskRef.current;
    if (!target || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const contentWidth = Math.floor(entry.contentRect.width - 24);
      if (contentWidth > 120) {
        setAvailableWidthPx(contentWidth);
      }
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [open]);

  const redrawCanvasFromModel = useCallback((sigModel: A4ScheduleDocumentModel['signature']) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!sigModel) return;

    ctx.strokeStyle = MODAL_FOLHA_A4_TOKENS.signaturePad.fg;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const scaleX = canvas.width / sigModel.width;
    const scaleY = canvas.height / sigModel.height;

    for (const stroke of sigModel.strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x * scaleX, stroke[0]!.y * scaleY);
      for (let i = 1; i < stroke.length; i += 1) {
        ctx.lineTo(stroke[i]!.x * scaleX, stroke[i]!.y * scaleY);
      }
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    if (open) {
      redrawCanvasFromModel(documentModel.signature);
    }
  }, [open, documentModel.signature, redrawCanvasFromModel]);

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): SignaturePoint => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const pt = getCanvasPoint(event);
    activeStrokeRef.current = [pt];
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    event.preventDefault();
    const pt = getCanvasPoint(event);
    const prev = stroke[stroke.length - 1]!;
    stroke.push(pt);

    const ctx = event.currentTarget.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = MODAL_FOLHA_A4_TOKENS.signaturePad.fg;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  };

  const finalizePointerStroke = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    rawStrokesRef.current = [...rawStrokesRef.current, stroke];
    const simplified = simplifySignatureStrokes(rawStrokesRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });
    setSignaturePayload(simplified ? simplified.serialized : null);
  };

  const handleClearSignature = useCallback(() => {
    rawStrokesRef.current = [];
    activeStrokeRef.current = null;
    setSignaturePayload(null);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const handleGenerateKeyboardSignature = useCallback(() => {
    const synthesized = synthesizeKeyboardVectorSignature(
      signerLabel.trim().length > 0 ? signerLabel : 'Coordenação Enfermagem'
    );
    rawStrokesRef.current = [];
    setSignaturePayload(synthesized ? synthesized.serialized : null);
  }, [signerLabel]);

  const handleSignerInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSignerLabel(event.target.value);
  }, []);

  const handleDownloadVectorPdf = useCallback(() => {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return;
    }

    const t0 = performance.now();
    const pdfBytes = compileSchedulePdfBytes(documentModel);
    const elapsedMs = (performance.now() - t0).toFixed(1);

    const safeBuffer = new Uint8Array(pdfBytes.byteLength);
    safeBuffer.set(pdfBytes);
    const blob = new Blob([safeBuffer], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(blob);
    const filename = buildPdfFilename(new Date(), orientation, privacyMode);

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 150);

    setExportStatusMessage(
      `PDF vetorial gerado (${(pdfBytes.byteLength / 1024).toFixed(1)} KiB em ${elapsedMs}ms) • Selo SHA-256: ${documentModel.sha256Hex.slice(0, 16)}...`
    );
  }, [documentModel, orientation, privacyMode]);

  const handlePrintSheet = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    applyRuntimePageGeometry(document, orientation);
    window.print();
  }, [orientation]);

  if (!open) {
    return null;
  }

  const printPortal =
    typeof document !== 'undefined'
      ? createPortal(
          <div id="a4-print-sheet-host" aria-hidden="true">
            <FolhaEscalaA4Document model={documentModel} />
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        aria-labelledby="modal-folha-a4-title"
        slotProps={{
          paper: {
            sx: styles.dialogPaper,
          },
        }}
      >
        <Box sx={styles.topBar}>
          <Box sx={styles.titleGroup}>
            <Text id="modal-folha-a4-title" variant="subtitle1" sx={{ fontWeight: 800 }}>
              ESTÚDIO DE IMPRESSÃO &amp; PDF A4 VETORIAL
            </Text>
            <Text variant="caption" sx={{ color: '#475569' }}>
              ISO 32000-1 (%PDF-1.4) 100% vetorial • Paginação {documentModel.pages.length}{' '}
              {documentModel.pages.length === 1 ? 'folha' : 'folhas'} • Selo SHA-256
            </Text>
          </Box>

          <Box sx={styles.primaryActionsGroup}>
            <Button
              type="button"
              variant="contained"
              onClick={handleDownloadVectorPdf}
              sx={styles.downloadPrimaryButton}
            >
              <Box component="span" aria-hidden="true">
                {'⬇️'}
              </Box>
              Baixar PDF Vetorial (.pdf)
            </Button>

            <Button
              type="button"
              variant="outlined"
              onClick={handlePrintSheet}
              sx={styles.printSecondaryButton}
            >
              <Box component="span" aria-hidden="true">
                {'🖨️'}
              </Box>
              Imprimir para Mural
            </Button>

            <Button
              type="button"
              variant="outlined"
              onClick={onClose}
              sx={styles.toggleChipButton(false)}
            >
              Fechar
            </Button>
          </Box>
        </Box>

        <Box sx={styles.controlsStrip}>
          <Box sx={styles.controlsRow}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
              <Button
                type="button"
                variant="outlined"
                aria-pressed={orientation === 'portrait'}
                onClick={() => setOrientation('portrait')}
                sx={styles.toggleChipButton(orientation === 'portrait')}
              >
                Retrato (210×297mm)
              </Button>

              <Button
                type="button"
                variant="outlined"
                aria-pressed={orientation === 'landscape'}
                onClick={() => setOrientation('landscape')}
                sx={styles.toggleChipButton(orientation === 'landscape')}
              >
                Paisagem (297×210mm)
              </Button>
            </Box>

            <Button
              type="button"
              variant="outlined"
              aria-pressed={privacyMode}
              onClick={() => setPrivacyMode((prev) => !prev)}
              sx={styles.toggleChipButton(privacyMode)}
            >
              <Box component="span" aria-hidden="true">
                {privacyMode ? '🔒' : '🔓'}
              </Box>
              Modo Mural Público LGPD: {privacyMode ? 'Ativo' : 'Inativo'}
            </Button>
          </Box>

          <Box sx={styles.signatureToolbar}>
            <Box sx={styles.signatureCanvasWrap}>
              <Text variant="caption" sx={{ fontWeight: 700, color: '#1E293B' }}>
                Rubrica Manual da Coordenação (Mouse / Caneta / Toque)
              </Text>
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                aria-label="Quadro de rubrica manual da coordenação (alternativa por teclado ao lado)"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finalizePointerStroke}
                onPointerCancel={finalizePointerStroke}
                style={{
                  width: '100%',
                  maxWidth: `${CANVAS_WIDTH}px`,
                  height: '76px',
                  backgroundColor: MODAL_FOLHA_A4_TOKENS.signaturePad.bg,
                  border: `1.5px dashed ${MODAL_FOLHA_A4_TOKENS.signaturePad.border}`,
                  borderRadius: '6px',
                  touchAction: 'none',
                  cursor: 'crosshair',
                }}
              />
            </Box>

            <Box sx={styles.keyboardSigColumn}>
              <label
                htmlFor="a4-signer-input"
                style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E293B' }}
              >
                Responsável / COREN (opcional — acessível por teclado)
              </label>
              <input
                id="a4-signer-input"
                type="text"
                maxLength={80}
                value={signerLabel}
                onChange={handleSignerInputChange}
                placeholder="Ex.: Dra. Helena Prado — COREN-SP 000100"
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${MODAL_FOLHA_A4_TOKENS.signaturePad.border}`,
                  fontSize: '0.82rem',
                  color: MODAL_FOLHA_A4_TOKENS.signaturePad.fg,
                  backgroundColor: '#FFFFFF',
                }}
              />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                <Button
                  type="button"
                  variant="outlined"
                  onClick={handleGenerateKeyboardSignature}
                  sx={styles.toggleChipButton(false)}
                >
                  Gerar Rubrica por Teclado
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  onClick={handleClearSignature}
                  sx={styles.toggleChipButton(false)}
                >
                  Limpar Rubrica
                </Button>
              </Box>
            </Box>
          </Box>

          {exportStatusMessage !== null ? (
            <Box role="status" aria-live="polite" aria-atomic="true" sx={styles.statusBanner}>
              {exportStatusMessage}
            </Box>
          ) : null}
        </Box>

        <Box ref={previewDeskRef} sx={styles.previewDesk}>
          {documentModel.pages.map((page) => {
            const singlePageModel: A4ScheduleDocumentModel = {
              ...documentModel,
              pages: [page],
            };
            return (
              <Box
                key={page.pageNumber}
                sx={{
                  width: `${scaleInfo.scaledWidthPx}px`,
                  height: `${scaleInfo.scaledHeightPx}px`,
                  mx: 'auto',
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
                }}
              >
                <Box
                  sx={{
                    width: `${scaleInfo.pageWidthPx}px`,
                    height: `${scaleInfo.pageHeightPx}px`,
                    transform: `scale(${scaleInfo.scale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <FolhaEscalaA4Document model={singlePageModel} />
                </Box>
              </Box>
            );
          })}
        </Box>
      </Dialog>

      {printPortal}
    </>
  );
}
