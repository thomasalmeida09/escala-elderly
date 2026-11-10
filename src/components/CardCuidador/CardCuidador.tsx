import { Box } from '@mui/material';
import Text from '../common/Text';
import { styles } from './CardCuidador.styles';
import type { Cuidador } from '../../hooks/useCaregivers';

interface CardCuidadorProps {
  cuidador: Cuidador;
}

export default function CardCuidador({ cuidador }: CardCuidadorProps) {
  const isFaltou = cuidador.status === 'Faltou';

  return (
    <Box sx={styles.cardItem}>
      <Box>
        <Text variant="body1" sx={{ fontWeight: 600 }}>
          {cuidador.nome}
        </Text>
        <Text variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
          ID: #{cuidador.id.toString().padStart(3, '0')}
        </Text>
      </Box>

      <Box sx={styles.badge(isFaltou)}>{cuidador.status}</Box>
    </Box>
  );
}
