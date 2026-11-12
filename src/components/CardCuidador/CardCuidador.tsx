import type { Ref } from 'react';
import { Box, ButtonBase } from '@mui/material';
import type { Cuidador } from '../../hooks/useCaregivers';
import { projectCaregiverForLgpd } from '../../services/lgpdPrivacyEngine';
import Text from '../common/Text';
import { styles } from './CardCuidador.styles';

export interface CardCuidadorProps {
  readonly cuidador: Cuidador;
  readonly privacyMode?: boolean;
  readonly onToggleStatus?: (id: number) => void;
  readonly buttonRef?: Ref<HTMLButtonElement>;
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

export default function CardCuidador({
  cuidador,
  privacyMode = false,
  onToggleStatus,
  buttonRef,
}: CardCuidadorProps) {
  const view = projectCaregiverForLgpd(cuidador, privacyMode);
  const formattedId = `ID: #${view.id.toString().padStart(3, '0')}`;
  const metaParts = [formattedId, view.quarto, view.turno].filter(Boolean);
  const accessibleLabel = buildAccessibleCardLabel(view, Boolean(onToggleStatus));

  return (
    <ButtonBase
      ref={buttonRef}
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
          {view.nome}
        </Text>
        <Text variant="caption" component="span" sx={styles.metaLine}>
          {metaParts.join(' • ')}
        </Text>
        {view.status === 'Cobertura' && view.substituto ? (
          <Text variant="caption" component="span" sx={styles.coverageNote}>
            Cobertura: {view.substituto}
          </Text>
        ) : null}
      </Box>

      <Box component="span" sx={styles.badge(view.status)}>
        {view.status}
      </Box>
    </ButtonBase>
  );
}
