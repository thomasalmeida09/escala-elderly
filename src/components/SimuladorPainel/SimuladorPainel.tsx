import { Box, Button } from '@mui/material';
import Text from '../common/Text';
import { styles } from './SimuladorPainel.styles';

export interface SimuladorPainelProps {
  readonly onSimulate: () => void;
  readonly onReset?: () => void;
}

export default function SimuladorPainel({ onSimulate, onReset }: SimuladorPainelProps) {
  return (
    <Box className="no-print" sx={styles.controlPanel}>
      <Text variant="caption" sx={styles.panelLabel}>
        SIMULAR ALERTA
      </Text>
      <Box sx={styles.actionsGroup}>
        <Button type="button" variant="contained" onClick={onSimulate} sx={styles.simulateButton}>
          Falta de Carlos
        </Button>
        <Button type="button" variant="outlined" onClick={onReset} sx={styles.resetButton}>
          Restaurar Escala
        </Button>
      </Box>
    </Box>
  );
}
