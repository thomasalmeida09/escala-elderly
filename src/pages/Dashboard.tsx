import { useCallback, useRef, useState } from 'react';
import { Box, Container } from '@mui/material';
import BarraIndicadores from '../components/BarraIndicadores/BarraIndicadores';
import BarraPlanilha from '../components/BarraPlanilha/BarraPlanilha';
import CardCuidador from '../components/CardCuidador/CardCuidador';
import PainelCobertura from '../components/PainelCobertura/PainelCobertura';
import SimuladorPainel from '../components/SimuladorPainel/SimuladorPainel';
import Text from '../components/common/Text';
import { useCaregivers } from '../hooks/useCaregivers';
import type { CaregiverScheduleControllerOptions } from '../services/caregiverSyncController';
import { CONNECTION_BADGE_TOKENS, styles } from './Dashboard.styles';

export interface DashboardProps {
  readonly controllerOptions?: CaregiverScheduleControllerOptions;
}

export default function Dashboard({ controllerOptions }: DashboardProps = {}) {
  const {
    cuidadores,
    connectionStatus,
    canUndoImport,
    simularFaltaDoCarlos,
    alternarStatusCuidador,
    confirmarCobertura,
    importarEscala,
    desfazerImportacao,
    restaurarEscala,
  } = useCaregivers(controllerOptions);

  const [resetBannerEpoch, setResetBannerEpoch] = useState(0);
  const cardButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const handleConfirmCoverage = useCallback(
    (absentCaregiverId: number, substitutoNome: string) => {
      confirmarCobertura(absentCaregiverId, substitutoNome);
      queueMicrotask(() => {
        const targetButton = cardButtonRefs.current.get(absentCaregiverId);
        if (targetButton && typeof targetButton.focus === 'function') {
          targetButton.focus();
        }
      });
    },
    [confirmarCobertura]
  );

  const handleResetSchedule = useCallback(() => {
    setResetBannerEpoch((prev) => prev + 1);
    restaurarEscala();
  }, [restaurarEscala]);

  const badgeToken = CONNECTION_BADGE_TOKENS[connectionStatus];

  return (
    <Box sx={styles.pageWrapper}>
      <Container maxWidth="xs">
        {/* Cabeçalho Tech Industrial */}
        <Box sx={styles.headerBox}>
          <Text variant="h5" component="h1">
            DASHBOARD
          </Text>
          <Box sx={styles.headerDivider}>
            <Text variant="caption">PAINEL DO GERENTE // MONITOR</Text>
            <Box
              component="span"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              sx={styles.connectionBadge(connectionStatus)}
            >
              <Box component="span" aria-hidden="true">
                {'● '}
              </Box>
              {badgeToken.label}
            </Box>
          </Box>
        </Box>

        {/* Resumo Executivo Operacional (KPIs) e Termômetro de Economia Financeira */}
        <BarraIndicadores cuidadores={cuidadores} />

        {/* Simulador e Restauração da Escala */}
        <SimuladorPainel onSimulate={simularFaltaDoCarlos} onReset={handleResetSchedule} />

        {/* Importação / Exportação Rápida CSV/Excel e Backup Local-First */}
        <BarraPlanilha
          key={resetBannerEpoch}
          cuidadores={cuidadores}
          canUndoImport={canUndoImport}
          onImportSchedule={importarEscala}
          onUndoImport={desfazerImportacao}
        />

        {/* Lista de Cards com Hidratação Local-First 0ms e Triagem CLT Irmã */}
        <Box sx={styles.cardsContainer}>
          {cuidadores.map((cuidador) => (
            <Box key={cuidador.id} sx={styles.cardSlot}>
              <CardCuidador
                cuidador={cuidador}
                onToggleStatus={alternarStatusCuidador}
                buttonRef={(node) => {
                  if (node !== null) {
                    cardButtonRefs.current.set(cuidador.id, node);
                  } else {
                    cardButtonRefs.current.delete(cuidador.id);
                  }
                }}
              />
              {cuidador.status === 'Faltou' ? (
                <PainelCobertura
                  absentCaregiver={cuidador}
                  cuidadores={cuidadores}
                  onConfirmCoverage={handleConfirmCoverage}
                />
              ) : null}
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
