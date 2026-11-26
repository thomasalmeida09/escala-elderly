import { Container, Box, CircularProgress } from '@mui/material';
import CardCuidador from '../components/CardCuidador/CardCuidador';
import SimuladorPainel from '../components/SimuladorPainel/SimuladorPainel';
import Text from '../components/common/Text';
import { styles } from './Dashboard.styles'; 
import { useCaregivers } from '../hooks/useCaregivers';

export default function Dashboard() {
  const { cuidadores, loading, simularFaltaDoCarlos } = useCaregivers();

  return (
    <Box sx={styles.pageWrapper}>
      <Container maxWidth="xs">
        
        {/* Cabeçalho Tech Industrial */}
        <Box sx={styles.headerBox}>
          <Text variant="h5">DASHBOARD</Text>
          <Box sx={styles.headerDivider}>
            <Text variant="caption">PAINEL DO GERENTE // MONITOR</Text>
            <Text variant="caption" sx={{ color: 'primary.main' }}>● ONLINE</Text>
          </Box>
        </Box>

        {/* Simulador */}
        <SimuladorPainel onSimulate={simularFaltaDoCarlos} />

        {/* Lista de Cards com Tratamento de Loading */}
        <Box sx={styles.cardsContainer}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress color="primary" size={28} />
            </Box>
          ) : (
            cuidadores.map((cuidador) => (
              <CardCuidador key={cuidador.id} cuidador={cuidador} />
            ))
          )}
        </Box>

      </Container>
    </Box>
  );
}