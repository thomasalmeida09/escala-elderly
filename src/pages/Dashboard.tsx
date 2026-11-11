import { Box, Container } from '@mui/material';
import CardCuidador from '../components/CardCuidador/CardCuidador';
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
    simularFaltaDoCarlos,
    alternarStatusCuidador,
    restaurarEscala,
  } = useCaregivers(controllerOptions);

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

        {/* Simulador e Restauração da Escala */}
        <SimuladorPainel onSimulate={simularFaltaDoCarlos} onReset={restaurarEscala} />

        {/* Lista de Cards com Hidratação Local-First 0ms */}
        <Box sx={styles.cardsContainer}>
          {cuidadores.map((cuidador) => (
            <CardCuidador
              key={cuidador.id}
              cuidador={cuidador}
              onToggleStatus={alternarStatusCuidador}
            />
          ))}
        </Box>
      </Container>
    </Box>
  );
}
