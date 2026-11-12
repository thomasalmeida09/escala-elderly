import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button } from '@mui/material';
import { isModalDialogOpen } from '../../services/a4PdfScheduleEngine';
import {
  CsvScheduleError,
  MAX_CSV_BYTES,
  buildCsvBackupFilename,
  parseCsvSchedule,
  serializeScheduleToCsv,
} from '../../services/csvScheduleCodec';
import { ContractValidationError, type Cuidador } from '../../types/caregiver';
import ModalFolhaEscalaA4 from '../ModalFolhaEscalaA4/ModalFolhaEscalaA4';
import Text from '../common/Text';
import { styles } from './BarraPlanilha.styles';

export interface BarraPlanilhaProps {
  readonly cuidadores: readonly Cuidador[];
  readonly canUndoImport: boolean;
  readonly privacyMode?: boolean;
  readonly onImportSchedule: (cuidadores: readonly Cuidador[]) => Promise<void>;
  readonly onUndoImport: () => Promise<boolean>;
}

interface SpreadsheetFeedbackState {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

const EDITABLE_PASTE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="combobox"], [role="searchbox"]';

function isEditableEventTarget(node: EventTarget | Element | null): boolean {
  if (!node || typeof (node as Element).closest !== 'function') {
    return false;
  }
  return (node as Element).closest(EDITABLE_PASTE_SELECTOR) !== null;
}

function formatImportErrorMessage(error: unknown): string {
  if (error instanceof CsvScheduleError || error instanceof ContractValidationError) {
    return error.message;
  }
  return 'Não foi possível ler a planilha selecionada. Verifique o formato CSV/Excel e tente novamente.';
}

export default function BarraPlanilha({
  cuidadores,
  canUndoImport,
  privacyMode = false,
  onImportSchedule,
  onUndoImport,
}: BarraPlanilhaProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isPdfStudioOpen, setIsPdfStudioOpen] = useState(false);
  const [feedback, setFeedback] = useState<SpreadsheetFeedbackState | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importButtonRef = useRef<HTMLButtonElement | null>(null);
  const pdfButtonRef = useRef<HTMLButtonElement | null>(null);

  const processImportedPayload = useCallback(
    async (rawInput: string | Uint8Array, sourceDescription: string) => {
      try {
        const parsed = parseCsvSchedule(rawInput);
        await onImportSchedule(parsed.cuidadores);
        const countLabel =
          parsed.rowCount === 1
            ? '1 profissional carregado'
            : `${parsed.rowCount} profissionais carregados`;
        setFeedback({
          kind: 'success',
          message: `Escala importada (${sourceDescription}): ${countLabel}.`,
        });
      } catch (importError) {
        setFeedback({
          kind: 'error',
          message: formatImportErrorMessage(importError),
        });
      }
    },
    [onImportSchedule]
  );

  const processSpreadsheetFile = useCallback(
    async (file: File, sourceDescription: string) => {
      if (file.size > MAX_CSV_BYTES) {
        setFeedback({
          kind: 'error',
          message: `O arquivo '${file.name}' excede o limite máximo seguro de 1 MiB (${MAX_CSV_BYTES} bytes).`,
        });
        return;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        await processImportedPayload(new Uint8Array(arrayBuffer), sourceDescription);
      } catch (fileReadError) {
        setFeedback({
          kind: 'error',
          message: formatImportErrorMessage(fileReadError),
        });
      }
    },
    [processImportedPayload]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleWindowPaste = (event: ClipboardEvent): void => {
      if (
        event.defaultPrevented ||
        isModalDialogOpen() ||
        isEditableEventTarget(event.target) ||
        (typeof document !== 'undefined' && isEditableEventTarget(document.activeElement))
      ) {
        return;
      }

      const clipboard = event.clipboardData;
      if (!clipboard) {
        return;
      }

      const pastedFile = clipboard.files?.[0];
      if (pastedFile) {
        event.preventDefault();
        void processSpreadsheetFile(pastedFile, pastedFile.name || 'arquivo colado');
        return;
      }

      const pastedText = clipboard.getData('text/plain');
      if (pastedText.trim().length === 0) {
        return;
      }

      event.preventDefault();
      void processImportedPayload(pastedText, 'colagem do Excel');
    };

    const handleWindowDragOver = (event: globalThis.DragEvent): void => {
      if (isModalDialogOpen()) {
        return;
      }
      if (event.dataTransfer?.types?.includes('Files')) {
        event.preventDefault();
      }
    };

    const handleWindowDrop = (event: globalThis.DragEvent): void => {
      if (event.defaultPrevented || isModalDialogOpen()) {
        return;
      }
      const droppedFile = event.dataTransfer?.files?.[0];
      if (droppedFile) {
        event.preventDefault();
        setIsDragActive(false);
        void processSpreadsheetFile(droppedFile, droppedFile.name || 'arquivo arrastado');
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, [processImportedPayload, processSpreadsheetFile]);

  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      try {
        if (selectedFile) {
          await processSpreadsheetFile(selectedFile, selectedFile.name);
        }
      } finally {
        event.target.value = '';
      }
    },
    [processSpreadsheetFile]
  );

  const handleDragEnterOrOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (isPdfStudioOpen || isModalDialogOpen()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(true);
    },
    [isPdfStudioOpen]
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (isPdfStudioOpen || isModalDialogOpen()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const related = event.relatedTarget as Node | null;
      if (!event.currentTarget.contains(related)) {
        setIsDragActive(false);
      }
    },
    [isPdfStudioOpen]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (isPdfStudioOpen || isModalDialogOpen()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);

      const droppedFile = event.dataTransfer.files?.[0];
      if (droppedFile) {
        void processSpreadsheetFile(droppedFile, droppedFile.name || 'arquivo arrastado');
        return;
      }

      const droppedText = event.dataTransfer.getData('text/plain');
      if (droppedText.trim().length > 0) {
        void processImportedPayload(droppedText, 'texto arrastado');
      }
    },
    [isPdfStudioOpen, processImportedPayload, processSpreadsheetFile]
  );

  const handleExportCsv = useCallback(() => {
    try {
      const csvWithBom = serializeScheduleToCsv(cuidadores, { privacyMode });
      if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return;
      }

      const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
      const objectUrl = URL.createObjectURL(blob);
      const filename = buildCsvBackupFilename(new Date(), privacyMode);

      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 100);

      setFeedback({
        kind: 'success',
        message: privacyMode
          ? `Planilha CSV LGPD exportada (${cuidadores.length} profissionais, contatos ocultos e nomes abreviados).`
          : `Backup CSV exportado (${cuidadores.length} profissionais) com acentuação pronta para Excel.`,
      });
    } catch (exportError) {
      setFeedback({
        kind: 'error',
        message: formatImportErrorMessage(exportError),
      });
    }
  }, [cuidadores, privacyMode]);

  const handleOpenPdfStudio = useCallback(() => {
    setIsPdfStudioOpen(true);
  }, []);

  const handleClosePdfStudio = useCallback(() => {
    setIsPdfStudioOpen(false);
    const focusPdfTrigger = (): void => {
      const trigger = pdfButtonRef.current;
      if (trigger && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    };
    focusPdfTrigger();
    queueMicrotask(focusPdfTrigger);
  }, []);

  const handleUndoClick = useCallback(async () => {
    const focusImportButton = (): void => {
      const target = importButtonRef.current;
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    };

    const pendingUndo = onUndoImport();
    if (canUndoImport) {
      queueMicrotask(focusImportButton);
    }

    const restored = await pendingUndo;
    if (restored) {
      setFeedback({
        kind: 'success',
        message: 'Importação desfeita. A escala anterior foi restaurada com segurança.',
      });
    }
    if (typeof document !== 'undefined' && document.activeElement === document.body) {
      queueMicrotask(focusImportButton);
    }
  }, [canUndoImport, onUndoImport]);

  return (
    <>
      <Box
        className="no-print"
        role="region"
        aria-labelledby="barra-planilha-heading"
        onDragEnter={handleDragEnterOrOver}
        onDragOver={handleDragEnterOrOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={styles.container(isDragActive)}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          tabIndex={-1}
          aria-hidden="true"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <Box sx={styles.headerRow}>
          <Text id="barra-planilha-heading" variant="caption" sx={styles.sectionLabel}>
            PLANILHA &amp; BACKUP LOCAL-FIRST
          </Text>
          <Box component="span" sx={styles.dropHintBadge(isDragActive)}>
            {isDragActive
              ? 'Solte a planilha .CSV para preencher agora'
              : 'Arraste .CSV ou cole do Excel (Ctrl+V)'}
          </Box>
        </Box>

        <Box sx={styles.actionsRow}>
          <Button
            ref={importButtonRef}
            type="button"
            variant="contained"
            onClick={handleOpenFilePicker}
            sx={styles.importButton}
          >
            <Box component="span" aria-hidden="true">
              {'📥'}
            </Box>
            Importar CSV
          </Button>

          <Button
            type="button"
            variant="outlined"
            onClick={handleExportCsv}
            sx={styles.exportButton}
          >
            <Box component="span" aria-hidden="true">
              {'📤'}
            </Box>
            {privacyMode ? 'Exportar CSV (LGPD)' : 'Exportar CSV / Backup'}
          </Button>

          <Button
            ref={pdfButtonRef}
            type="button"
            variant="outlined"
            onClick={handleOpenPdfStudio}
            sx={styles.pdfButton}
          >
            <Box component="span" aria-hidden="true">
              {'🖨️'}
            </Box>
            Exportar PDF A4
          </Button>

          {canUndoImport ? (
            <Button
              type="button"
              variant="outlined"
              onClick={handleUndoClick}
              sx={styles.undoButton}
            >
              <Box component="span" aria-hidden="true">
                {'↩'}
              </Box>
              Desfazer Importação
            </Button>
          ) : null}
        </Box>

        {feedback !== null ? (
          feedback.kind === 'error' ? (
            <Box role="alert" sx={styles.feedbackBanner('error')}>
              {feedback.message}
            </Box>
          ) : (
            <Box
              role="status"
              aria-live="polite"
              aria-atomic="true"
              sx={styles.feedbackBanner('success')}
            >
              {feedback.message}
            </Box>
          )
        ) : null}
      </Box>

      {isPdfStudioOpen ? (
        <ModalFolhaEscalaA4
          open={isPdfStudioOpen}
          cuidadores={cuidadores}
          initialPrivacyMode={privacyMode}
          onClose={handleClosePdfStudio}
        />
      ) : null}
    </>
  );
}
