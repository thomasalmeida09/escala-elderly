import { Box, ButtonBase } from '@mui/material';
import Text from '../common/Text';
import { styles } from './CardCuidador.styles';
import type { Cuidador } from '../../hooks/useCaregivers';

export interface CardCuidadorProps {
  readonly cuidador: Cuidador;
  readonly onToggleStatus?: (id: number) => void;
}

function buildAccessibleCardLabel(cuidador: Cuidador, interactive: boolean): string {
  const formattedId = `ID #${cuidador.id.toString().padStart(3, '0')}`;
  const details = [formattedId, cuidador.quarto, cuidador.turno].filter(Boolean).join(' • ');
  const statusSegment =
    cuidador.status === 'Cobertura' && cuidador.substituto
      ? `Status: Cobertura (Substituto: ${cuidador.substituto})`
      : `Status: ${cuidador.status}`;
  const actionHint = interactive ? '. Pressione para alternar status' : '';

  return `${cuidador.nome} — ${details} — ${statusSegment}${actionHint}`;
}

export default function CardCuidador({ cuidador, onToggleStatus }: CardCuidadorProps) {
  const formattedId = `ID: #${cuidador.id.toString().padStart(3, '0')}`;
  const metaParts = [formattedId, cuidador.quarto, cuidador.turno].filter(Boolean);
  const accessibleLabel = buildAccessibleCardLabel(cuidador, Boolean(onToggleStatus));

  return (
    <ButtonBase
      component="button"
      type="button"
      disableRipple
      className="print-avoid-break"
      aria-label={accessibleLabel}
      onClick={() => onToggleStatus?.(cuidador.id)}
      sx={styles.cardItem}
    >
      <Box component="span" sx={styles.infoGroup}>
        <Text variant="body1" component="span" sx={styles.caregiverName}>
          {cuidador.nome}
        </Text>
        <Text variant="caption" component="span" sx={styles.metaLine}>
          {metaParts.join(' • ')}
        </Text>
        {cuidador.status === 'Cobertura' && cuidador.substituto ? (
          <Text variant="caption" component="span" sx={styles.coverageNote}>
            Cobertura: {cuidador.substituto}
          </Text>
        ) : null}
      </Box>

      <Box component="span" sx={styles.badge(cuidador.status)}>
        {cuidador.status}
      </Box>
    </ButtonBase>
  );
}
