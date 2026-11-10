import { Box, Button } from '@mui/material';
import Text from '../common/Text';
import { styles } from './SimuladorPainel.styles';

interface SimuladorPainelProps {
  onSimulate: () => void;
}

export default function SimuladorPainel({ onSimulate }: SimuladorPainelProps) {
  return (
    <Box sx={styles.controlPanel}>
      <Text variant="caption" sx={styles.panelLabel}>
        SIMULAR ALERTA
      </Text>
      <Button variant="contained" onClick={onSimulate} sx={styles.simulateButton}>
        Falta de Carlos
      </Button>
    </Box>
  );
}
