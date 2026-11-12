import { useId } from 'react';
import { Box, Button } from '@mui/material';
import { getCoverageSuggestions } from '../../services/coverageEngine';
import { maskPersonNameLgpd } from '../../services/lgpdPrivacyEngine';
import type { Cuidador } from '../../types/caregiver';
import Text from '../common/Text';
import { styles } from './PainelCobertura.styles';

export interface PainelCoberturaProps {
  readonly absentCaregiver: Cuidador;
  readonly cuidadores: readonly Cuidador[];
  readonly reservePool?: readonly Cuidador[];
  readonly privacyMode?: boolean;
  readonly onConfirmCoverage: (absentCaregiverId: number, substituteName: string) => void;
}

function buildFilterSummary(
  blockedByCltCount: number,
  alreadyAllocatedCount: number
): string | null {
  const parts: string[] = [];
  if (blockedByCltCount > 0) {
    parts.push(
      `${blockedByCltCount} ${blockedByCltCount === 1 ? 'folguista ocultado' : 'folguistas ocultados'} por descanso < 11h (CLT)`
    );
  }
  if (alreadyAllocatedCount > 0) {
    parts.push(
      `${alreadyAllocatedCount} ${alreadyAllocatedCount === 1 ? 'já alocado' : 'já alocados'} em outra cobertura`
    );
  }
  return parts.length > 0 ? `Filtro trabalhista ativo: ${parts.join(' • ')}.` : null;
}

export default function PainelCobertura({
  absentCaregiver,
  cuidadores,
  reservePool,
  privacyMode = false,
  onConfirmCoverage,
}: PainelCoberturaProps) {
  const headingId = useId();

  if (absentCaregiver.status !== 'Faltou') {
    return null;
  }

  const suggestions = getCoverageSuggestions(absentCaregiver, cuidadores, reservePool);
  const filterSummary = buildFilterSummary(
    suggestions.blockedByCltCount,
    suggestions.alreadyAllocatedCount
  );
  const displayAbsentName = privacyMode
    ? maskPersonNameLgpd(absentCaregiver.nome) || '—'
    : absentCaregiver.nome;
  const postContext = absentCaregiver.quarto ? ` (${absentCaregiver.quarto})` : '';
  const whatsAppPostTarget = absentCaregiver.quarto
    ? `para ${absentCaregiver.quarto}`
    : `no posto de ${displayAbsentName}`;

  return (
    <Box
      component="section"
      className="no-print"
      aria-labelledby={headingId}
      sx={styles.panelContainer}
    >
      <Box sx={styles.headerBand}>
        <Text id={headingId} variant="caption" component="h2" sx={styles.headerTitle}>
          {`QUEM PODE COBRIR? — ${displayAbsentName}${postContext}`}
        </Text>
      </Box>

      {filterSummary !== null ? (
        <Text variant="caption" component="p" sx={styles.complianceNote}>
          {filterSummary}
        </Text>
      ) : null}

      {suggestions.eligible.length > 0 ? (
        <Box component="ul" sx={styles.candidatesList}>
          {suggestions.eligible.map((candidate) => {
            const originLabel =
              candidate.source === 'escala' ? 'Folga na Escala' : 'Banco de Reserva';
            const shiftText = candidate.cuidador.turno ?? 'Turno flexível';
            const displayCandidateName = privacyMode
              ? maskPersonNameLgpd(candidate.cuidador.nome) || '—'
              : candidate.cuidador.nome;
            const whatsAppLabel = `Acionar no WhatsApp — ${displayCandidateName} ${whatsAppPostTarget} (abre em nova aba)`;
            const confirmLabel = `Confirmar Cobertura — ${displayCandidateName} no plantão de ${displayAbsentName}`;

            return (
              <Box component="li" key={candidate.cuidador.id} sx={styles.candidateCard}>
                <Box sx={styles.candidateTopRow}>
                  <Box sx={styles.candidateInfo}>
                    <Text variant="body2" component="span" sx={styles.candidateName}>
                      {displayCandidateName}
                    </Text>
                    <Text variant="caption" component="span" sx={styles.candidateMeta}>
                      {`${shiftText} • ${candidate.shiftMatchLabel} • ${originLabel}`}
                    </Text>
                  </Box>

                  <Box component="span" sx={styles.restBadge}>
                    {`${candidate.effectiveRestHours}h descanso • CLT OK`}
                  </Box>
                </Box>

                <Box sx={styles.actionsRow}>
                  {privacyMode ? (
                    <Box component="span" sx={styles.privacyPhoneBadge}>
                      <Box component="span" aria-hidden="true" sx={styles.buttonIcon}>
                        🔒
                      </Box>
                      Contato oculto (LGPD)
                    </Box>
                  ) : (
                    <Button
                      component="a"
                      variant="outlined"
                      href={candidate.whatsAppUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={whatsAppLabel}
                      sx={styles.whatsAppButton}
                    >
                      <Box component="span" aria-hidden="true" sx={styles.buttonIcon}>
                        📲
                      </Box>
                      Acionar no WhatsApp
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="contained"
                    onClick={() => onConfirmCoverage(absentCaregiver.id, candidate.cuidador.nome)}
                    aria-label={confirmLabel}
                    sx={styles.confirmButton}
                  >
                    <Box component="span" aria-hidden="true" sx={styles.buttonIcon}>
                      ⚡
                    </Box>
                    Confirmar Cobertura
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box sx={styles.exhaustedBanner}>
          <Text variant="body2" component="p" sx={styles.exhaustedText}>
            Nenhum folguista elegível livre no momento (regra de 11h da CLT e sem conflito de
            plantão).
          </Text>
          <Box sx={styles.actionsRow}>
            {privacyMode ? (
              <Box component="span" sx={styles.privacyPhoneBadge}>
                <Box component="span" aria-hidden="true" sx={styles.buttonIcon}>
                  🔒
                </Box>
                Contato oculto (LGPD)
              </Box>
            ) : (
              <Button
                component="a"
                variant="outlined"
                href={suggestions.groupFallbackWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Convocar grupo no WhatsApp ${whatsAppPostTarget} (abre em nova aba)`}
                sx={styles.whatsAppButton}
              >
                <Box component="span" aria-hidden="true" sx={styles.buttonIcon}>
                  📲
                </Box>
                Convocar grupo no WhatsApp
              </Button>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
