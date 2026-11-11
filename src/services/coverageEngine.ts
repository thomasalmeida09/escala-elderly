import {
  type Cuidador,
  MAX_TEXT_LENGTH,
  parseCuidador,
  parseCuidadorList,
} from '../types/caregiver';
import { getCanonicalSeed } from './localFirstStore';

/**
 * Intervalo minimo interjornada obrigatorio (Art. 66 da CLT — Decreto-Lei n. 5.452/1943):
 * "Entre 2 (duas) jornadas de trabalho havera um periodo minimo de 11 (onze) horas consecutivas para descanso."
 */
export const MIN_CLT_REST_HOURS = 11;

/**
 * Descanso padrao considerado quando um cuidador em 'Folga' nao traz horasDescanso explicito
 * (ex.: card alternado manualmente para 'Folga' ou linha CSV minima sem coluna de horas).
 * Qualquer valor numerico explicito (incluindo 0) prevalece sobre este padrao.
 */
export const DEFAULT_FOLGA_REST_HOURS = 24;

export type CoverageCandidateSource = 'escala' | 'reserva';

export type ShiftKind = 'diurno' | 'noturno' | 'flex';

export type ShiftMatchLabel = 'Mesmo turno' | 'Turno compatível' | 'Turno flexível' | 'Outro turno';

export interface CoverageCandidate {
  readonly cuidador: Cuidador;
  readonly source: CoverageCandidateSource;
  readonly effectiveRestHours: number;
  readonly shiftAffinityScore: number;
  readonly shiftMatchLabel: ShiftMatchLabel;
  readonly whatsAppUrl: string;
}

export interface CoverageSuggestionsResult {
  readonly eligible: readonly CoverageCandidate[];
  readonly blockedByCltCount: number;
  readonly alreadyAllocatedCount: number;
  readonly groupFallbackWhatsAppUrl: string;
}

/**
 * Banco canonico Clean-Room de folguistas de reserva da instituicao (namespace 9001..9003
 * para evitar colisao numerica com escalas ativas e planilhas CSV).
 * Inclui caso de controle estrito (< 11h CLT) em Rafael Mendes (8h).
 */
export const FOLGUISTAS_RESERVA_PADRAO: readonly Cuidador[] = Object.freeze(
  parseCuidadorList(
    [
      {
        id: 9001,
        nome: 'Beatriz Alves',
        status: 'Folga',
        turno: 'Noturno (19h-07h)',
        telefone: '+55 11 90000-0105',
        horasDescanso: 14,
      },
      {
        id: 9002,
        nome: 'Helena Prado',
        status: 'Folga',
        turno: 'Plantonista Flex (Diurno/Noturno)',
        telefone: '+55 11 90000-0106',
        horasDescanso: 24,
      },
      {
        id: 9003,
        nome: 'Rafael Mendes',
        status: 'Folga',
        turno: 'Noturno (19h-07h)',
        telefone: '+55 11 90000-0107',
        horasDescanso: 8,
      },
    ],
    'folguistasReserva'
  )
);

export function normalizePersonKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveEffectiveRestHours(horasDescanso?: number): number {
  return horasDescanso !== undefined ? horasDescanso : DEFAULT_FOLGA_REST_HOURS;
}

export function classifyShiftKind(turno?: string): ShiftKind {
  const normalized = (turno ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (normalized.length === 0 || /\b(flex|flexivel|integral)\b/.test(normalized)) {
    return 'flex';
  }

  const hasDayWord = /\b(diurno|manha|tarde|matutino|vespertino)\b/.test(normalized);
  const hasNightWord = /\b(noturno|noite)\b/.test(normalized);

  if (hasDayWord && hasNightWord) {
    return 'flex';
  }
  if (hasNightWord) {
    return 'noturno';
  }
  if (hasDayWord) {
    return 'diurno';
  }

  if (/(?:^|\D)(19|20|21|22)h\s*[-a]/.test(normalized) || /^(19|20|21|22)h\b/.test(normalized)) {
    return 'noturno';
  }
  if (/(?:^|\D)(06|07|08)h\s*[-a]/.test(normalized) || /^(06|07|08)h\b/.test(normalized)) {
    return 'diurno';
  }

  return 'flex';
}

function evaluateShiftAffinity(
  absentShift: ShiftKind,
  candidateShift: ShiftKind
): { readonly score: number; readonly label: ShiftMatchLabel } {
  if (absentShift === 'flex') {
    return {
      score: 0,
      label: candidateShift === 'flex' ? 'Turno flexível' : 'Turno compatível',
    };
  }
  if (candidateShift === absentShift) {
    return { score: 2, label: 'Mesmo turno' };
  }
  if (candidateShift === 'flex') {
    return { score: 1, label: 'Turno flexível' };
  }
  return { score: 0, label: 'Outro turno' };
}

/**
 * Normaliza telefone para formato digitos ITU-T E.164 exigido pelo https://wa.me/<digitos>.
 * - Remove sufixos de ramal ('ramal 12', 'ext. 4', '#200');
 * - Remove tronco nacional '0' em numeros brasileiros '(011) ...' ou '+55 (011) ...';
 * - Prefixa DDI '55' apenas para numeros nacionais BR validos de 10 ou 11 digitos com DDD [1-9][1-9];
 * - Rejeita numeros curtos sem DDD (< 10 digitos) para evitar roteamento acidental a DDIs estrangeiros.
 */
export function normalizeWhatsAppPhone(rawPhone?: string): string | null {
  if (typeof rawPhone !== 'string') {
    return null;
  }

  const withoutExtension = (rawPhone.split(/(?:\b(?:ramal|ext\.?)\b|#)/i)[0] ?? '').trim();
  if (withoutExtension.length === 0) {
    return null;
  }

  const hasLeadingPlus = withoutExtension.startsWith('+');
  let digits = withoutExtension.replace(/\D/g, '');
  if (digits.length === 0) {
    return null;
  }

  const hasDoubleZeroPrefix = !hasLeadingPlus && digits.startsWith('00');
  if (hasDoubleZeroPrefix) {
    digits = digits.slice(2);
  }
  const hasExplicitIntl = hasLeadingPlus || hasDoubleZeroPrefix;

  // Normaliza '+55 (011) 90000-0106' / '0055011900000106' / '55011900000106' -> '5511900000106'
  if (digits.startsWith('550') && (digits.length === 13 || digits.length === 14)) {
    digits = `55${digits.slice(3)}`;
  }

  // Normaliza tronco nacional '(011) 90000-0106' (12 digitos) ou '(011) 3000-0106' (11 digitos)
  if (
    !hasExplicitIntl &&
    digits.startsWith('0') &&
    !digits.startsWith('00') &&
    (digits.length === 11 || digits.length === 12)
  ) {
    digits = digits.slice(1);
  }

  if (!hasExplicitIntl) {
    if (digits.length === 10 || digits.length === 11) {
      if (!/^[1-9][1-9]\d{8,9}$/.test(digits)) {
        return null;
      }
      digits = `55${digits}`;
    } else if (!((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))) {
      return null;
    }
  }

  if (!/^[1-9]\d{9,14}$/.test(digits)) {
    return null;
  }

  if (digits.startsWith('55')) {
    if (!/^55[1-9][1-9]\d{8,9}$/.test(digits)) {
      return null;
    }
    const subscriber = digits.slice(4);
    if (/^0+$/.test(subscriber)) {
      return null;
    }
  }

  return digits;
}

/**
 * Constroi mensagem operacional de convocacao aplicando Minimizacao de Dados LGPD (Art. 6, III):
 * nao expoe o nome pessoal do profissional ausente na URL externa, informando apenas turno e quarto
 * do posto descoberto sem jamais interpolar 'undefined' ou 'null'.
 */
export function buildCoverageSummonsMessage(
  absentCaregiver: Pick<Cuidador, 'turno' | 'quarto'>,
  candidate?: Pick<Cuidador, 'nome'>
): string {
  const greeting = candidate?.nome ? `Olá ${candidate.nome.trim()}!` : 'Olá equipe!';
  const turno = absentCaregiver.turno?.trim();
  const quarto = absentCaregiver.quarto?.trim();

  let postContext: string;
  if (turno && quarto) {
    postContext = `Precisamos de cobertura para o plantão ${turno} no ${quarto}.`;
  } else if (turno) {
    postContext = `Precisamos de cobertura para o plantão ${turno}.`;
  } else if (quarto) {
    postContext = `Precisamos de cobertura para o plantão no ${quarto}.`;
  } else {
    postContext = 'Precisamos de cobertura imediata de plantão na escala.';
  }

  const question = candidate?.nome
    ? 'Você está disponível para assumir este posto?'
    : 'Quem estiver de folga com descanso mínimo de 11h (CLT) pode assumir este posto?';

  return `${greeting} ${postContext} ${question}`;
}

export function buildWhatsAppCoverageUrl(
  absentCaregiver: Pick<Cuidador, 'turno' | 'quarto'>,
  candidate?: Pick<Cuidador, 'nome' | 'telefone'>
): string {
  const message = buildCoverageSummonsMessage(absentCaregiver, candidate);
  const encodedText = encodeURIComponent(message);
  const normalizedDigits = normalizeWhatsAppPhone(candidate?.telefone);

  if (normalizedDigits !== null) {
    return `https://wa.me/${normalizedDigits}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Complementa telefone/horasDescanso dos 4 titulares canonicos quando o snapshot vem de
 * GET /api/cuidadores ou POST /api/cuidadores/reset do Backend (que omite campos opcionais nulos),
 * exigindo correspondencia simultanea de id E nome normalizado (M1.2).
 */
export function hydrateCanonicalCaregiverMetadata(cuidador: Cuidador): Cuidador {
  if (cuidador.telefone !== undefined && cuidador.horasDescanso !== undefined) {
    return cuidador;
  }

  const canonicalSeed = getCanonicalSeed();
  const matchingSeed = canonicalSeed.find(
    (seedItem) =>
      seedItem.id === cuidador.id &&
      normalizePersonKey(seedItem.nome) === normalizePersonKey(cuidador.nome)
  );

  if (!matchingSeed) {
    return cuidador;
  }

  return parseCuidador({
    ...cuidador,
    telefone: cuidador.telefone ?? matchingSeed.telefone,
    horasDescanso: cuidador.horasDescanso ?? matchingSeed.horasDescanso,
  });
}

function collectAllocatedSubstituteKeys(roster: readonly Cuidador[]): ReadonlySet<string> {
  const allocated = new Set<string>();
  for (const item of roster) {
    if (item.status === 'Cobertura' && item.substituto !== undefined) {
      allocated.add(normalizePersonKey(item.substituto));
    }
  }
  return allocated;
}

export function getCoverageSuggestions(
  absentCaregiver: Cuidador,
  activeRoster: readonly Cuidador[],
  reservePool: readonly Cuidador[] = FOLGUISTAS_RESERVA_PADRAO
): CoverageSuggestionsResult {
  const groupFallbackWhatsAppUrl = buildWhatsAppCoverageUrl(absentCaregiver);

  if (absentCaregiver.status !== 'Faltou') {
    return Object.freeze({
      eligible: Object.freeze([]),
      blockedByCltCount: 0,
      alreadyAllocatedCount: 0,
      groupFallbackWhatsAppUrl,
    });
  }

  const hydratedRoster = activeRoster.map(hydrateCanonicalCaregiverMetadata);
  const absentKey = normalizePersonKey(absentCaregiver.nome);
  const absentShiftKind = classifyShiftKind(absentCaregiver.turno);
  const allocatedKeys = collectAllocatedSubstituteKeys(hydratedRoster);

  // M2.1 Sombra autoritativa: qualquer profissional presente em activeRoster (em qualquer status)
  // sombreia sua eventual contraparte estatica em reservePool por ID, nome ou telefone E.164.
  const allRosterIds = new Set<number>();
  const allRosterNameKeys = new Set<string>();
  const allRosterPhones = new Set<string>();

  for (const item of hydratedRoster) {
    allRosterIds.add(item.id);
    allRosterNameKeys.add(normalizePersonKey(item.nome));
    const normalizedPhone = normalizeWhatsAppPhone(item.telefone);
    if (normalizedPhone !== null) {
      allRosterPhones.add(normalizedPhone);
    }
  }

  const candidatePool: Array<{
    readonly cuidador: Cuidador;
    readonly source: CoverageCandidateSource;
  }> = [];
  const seenCandidateKeys = new Set<string>();

  for (const rosterItem of hydratedRoster) {
    const key = normalizePersonKey(rosterItem.nome);
    if (rosterItem.id === absentCaregiver.id || key === absentKey) {
      continue;
    }
    if (rosterItem.status !== 'Folga' || seenCandidateKeys.has(key)) {
      continue;
    }
    seenCandidateKeys.add(key);
    candidatePool.push({ cuidador: rosterItem, source: 'escala' });
  }

  for (const reserveItem of reservePool) {
    const key = normalizePersonKey(reserveItem.nome);
    const reservePhone = normalizeWhatsAppPhone(reserveItem.telefone);
    const isShadowedByRoster =
      allRosterIds.has(reserveItem.id) ||
      allRosterNameKeys.has(key) ||
      (reservePhone !== null && allRosterPhones.has(reservePhone));

    if (
      isShadowedByRoster ||
      reserveItem.id === absentCaregiver.id ||
      key === absentKey ||
      reserveItem.status !== 'Folga' ||
      seenCandidateKeys.has(key)
    ) {
      continue;
    }
    seenCandidateKeys.add(key);
    candidatePool.push({ cuidador: reserveItem, source: 'reserva' });
  }

  const eligible: CoverageCandidate[] = [];
  let blockedByCltCount = 0;
  let alreadyAllocatedCount = 0;

  for (const entry of candidatePool) {
    const candidateKey = normalizePersonKey(entry.cuidador.nome);
    if (allocatedKeys.has(candidateKey)) {
      alreadyAllocatedCount += 1;
      continue;
    }

    const effectiveRestHours = resolveEffectiveRestHours(entry.cuidador.horasDescanso);
    if (effectiveRestHours < MIN_CLT_REST_HOURS) {
      blockedByCltCount += 1;
      continue;
    }

    const candidateShiftKind = classifyShiftKind(entry.cuidador.turno);
    const affinity = evaluateShiftAffinity(absentShiftKind, candidateShiftKind);

    eligible.push(
      Object.freeze({
        cuidador: entry.cuidador,
        source: entry.source,
        effectiveRestHours,
        shiftAffinityScore: affinity.score,
        shiftMatchLabel: affinity.label,
        whatsAppUrl: buildWhatsAppCoverageUrl(absentCaregiver, entry.cuidador),
      })
    );
  }

  eligible.sort((a, b) => {
    if (b.shiftAffinityScore !== a.shiftAffinityScore) {
      return b.shiftAffinityScore - a.shiftAffinityScore;
    }
    if (b.effectiveRestHours !== a.effectiveRestHours) {
      return b.effectiveRestHours - a.effectiveRestHours;
    }
    const sourceOrderA = a.source === 'escala' ? 0 : 1;
    const sourceOrderB = b.source === 'escala' ? 0 : 1;
    if (sourceOrderA !== sourceOrderB) {
      return sourceOrderA - sourceOrderB;
    }
    return a.cuidador.id - b.cuidador.id;
  });

  return Object.freeze({
    eligible: Object.freeze(eligible),
    blockedByCltCount,
    alreadyAllocatedCount,
    groupFallbackWhatsAppUrl,
  });
}

/**
 * Valida todas as pre-condicoes DbC (M2.3) antes de confirmar cobertura em um posto 'Faltou'.
 * Retorna o nome higienizado do substituto ou null caso qualquer invariante seja violado.
 */
export function validateCoverageAssignment(
  absentCaregiverId: number,
  rawSubstituteName: string,
  activeRoster: readonly Cuidador[],
  reservePool: readonly Cuidador[] = FOLGUISTAS_RESERVA_PADRAO
): string | null {
  if (typeof rawSubstituteName !== 'string' || rawSubstituteName.includes('\0')) {
    return null;
  }
  const trimmedName = rawSubstituteName.trim();
  if (trimmedName.length === 0 || trimmedName.length > MAX_TEXT_LENGTH) {
    return null;
  }

  const hydratedRoster = activeRoster.map(hydrateCanonicalCaregiverMetadata);
  const target = hydratedRoster.find((item) => item.id === absentCaregiverId);
  if (!target || target.status !== 'Faltou') {
    return null;
  }

  const substituteKey = normalizePersonKey(trimmedName);
  if (substituteKey.length === 0 || substituteKey === normalizePersonKey(target.nome)) {
    return null;
  }

  const allocatedKeys = collectAllocatedSubstituteKeys(hydratedRoster);
  if (allocatedKeys.has(substituteKey)) {
    return null;
  }

  const rosterMatches = hydratedRoster.filter(
    (item) => normalizePersonKey(item.nome) === substituteKey
  );
  if (rosterMatches.length > 0) {
    const eligibleInRoster = rosterMatches.some(
      (item) =>
        item.id !== absentCaregiverId &&
        item.status === 'Folga' &&
        resolveEffectiveRestHours(item.horasDescanso) >= MIN_CLT_REST_HOURS
    );
    return eligibleInRoster ? trimmedName : null;
  }

  const reserveMatch = reservePool.find((item) => normalizePersonKey(item.nome) === substituteKey);
  if (reserveMatch) {
    if (
      reserveMatch.status !== 'Folga' ||
      resolveEffectiveRestHours(reserveMatch.horasDescanso) < MIN_CLT_REST_HOURS
    ) {
      return null;
    }
  }

  return trimmedName;
}
