import { type Cuidador, MAX_TEXT_LENGTH } from '../types/caregiver';

/**
 * Conjunto canonico de preposicoes/conjuncoes de sobrenomes em portugues brasileiro
 * ignoradas ao extrair a inicial substantiva do sobrenome (paridade 1:1 com
 * LgpdPrivacyMasker.PARTICULAS_NOME_PT_BR do Backend Java).
 */
export const PT_BR_NAME_PARTICLES: ReadonlySet<string> = new Set([
  'da',
  'de',
  'do',
  'das',
  'dos',
  'e',
]);

/**
 * Mascara padrao sem digitos para exibicao textual de telefone sob LGPD
 * (paridade 1:1 com LgpdPrivacyMasker.MASCARA_TELEFONE_LGPD).
 */
export const LGPD_PHONE_MASK = '(••) •••••-••••';

/**
 * Rotulo informativo nao-interativo usado nos selos de interface quando links
 * diretos de WhatsApp (wa.me/<telefone>) sao suprimidos no Modo Privacidade LGPD.
 */
export const LGPD_MASKED_PHONE_LABEL = '🔒 Contato oculto (LGPD)';

function sanitizeUnpairedSurrogatesAndNull(input: string): string {
  let out = '';
  for (let i = 0; i < input.length;) {
    const code = input.charCodeAt(i);
    if (code === 0x0000) {
      i += 1;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : -1;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input.slice(i, i + 2);
        i += 2;
      } else {
        out += '\uFFFD';
        i += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += '\uFFFD';
      i += 1;
      continue;
    }
    out += input[i]!;
    i += 1;
  }
  return out;
}

/**
 * Trunca texto respeitando o limite de code units UTF-16 sem jamais partir um par
 * surrogate ao meio (paridade 1:1 com LgpdPrivacyMasker.truncarUtf16Seguro).
 */
export function truncateUtf16Safe(text: string, maxUnits: number): string {
  if (maxUnits <= 0 || text.length === 0) {
    return '';
  }
  if (text.length <= maxUnits) {
    return text;
  }
  let end = maxUnits;
  const lastUnit = text.charCodeAt(end - 1);
  if (end > 0 && lastUnit >= 0xd800 && lastUnit <= 0xdbff) {
    end -= 1;
  }
  return text.slice(0, end);
}

/**
 * Pseudonimiza nomes civis em paridade algebrica 1:1 com LgpdPrivacyMasker.mascararNomePessoa:
 * - "Carlos Rocha" -> "Carlos R."
 * - "João da Conceição" -> "João C." (ignora particulas PT-BR da/de/do/das/dos/e)
 * - "Maria da de e" -> "Maria E." (fallback deterministico quando so ha particulas)
 * - "Ana" -> "Ana"
 * - "" / "   " -> ""
 * - Preserva planos suplementares Unicode (\uD835\uDC01), normaliza NFD -> NFC,
 *   garante comprimento <= MAX_TEXT_LENGTH (120 UTF-16 code units) e idempotencia f(f(x)) === f(x).
 */
export function maskPersonNameLgpd(rawName?: string | null): string {
  if (typeof rawName !== 'string') {
    return '';
  }

  const normalized = sanitizeUnpairedSurrogatesAndNull(rawName)
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return '';
  }

  const tokens = normalized.split(' ');
  if (tokens.length === 1) {
    return truncateUtf16Safe(tokens[0]!, MAX_TEXT_LENGTH);
  }

  const firstName = tokens[0]!;
  const surnameCandidate =
    tokens.slice(1).find((token) => !PT_BR_NAME_PARTICLES.has(token.toLowerCase())) ??
    tokens[tokens.length - 1]!;

  const firstCodePoint = Array.from(surnameCandidate)[0] ?? '';
  const initial = Array.from(firstCodePoint.toUpperCase())[0] ?? '';
  if (initial.length === 0) {
    return truncateUtf16Safe(firstName, MAX_TEXT_LENGTH);
  }

  const suffix = ` ${initial}.`;
  const maxFirstNameUnits = Math.max(1, MAX_TEXT_LENGTH - suffix.length);
  const safeFirstName = truncateUtf16Safe(firstName, maxFirstNameUnits).trim();

  return safeFirstName.length === 0 ? `${initial}.` : `${safeFirstName}${suffix}`;
}

/**
 * Mascara numero telefonico nao-vazio com zero digitos expostos.
 */
export function maskPhoneLgpd(rawPhone?: string | null): string | undefined {
  if (typeof rawPhone !== 'string' || rawPhone.trim().length === 0) {
    return undefined;
  }
  return LGPD_PHONE_MASK;
}

/**
 * Redige integralmente celulas telefonicas para exportacao de planilha CSV sob LGPD,
 * preservando reimportabilidade limpa sem violar PHONE_SAFE_PATTERN.
 */
export function maskPhoneForCsvLgpd(rawPhone?: string | null): string {
  void rawPhone;
  return '';
}

/**
 * Projeta de forma pura e imutavel um Cuidador para exibicao/exportacao sob LGPD,
 * sem jamais mutar o objeto original e omitindo integralmente a propriedade `telefone`
 * quando `privacyMode === true`.
 */
export function projectCaregiverForLgpd(cuidador: Cuidador, privacyMode: boolean): Cuidador {
  if (!privacyMode) {
    return cuidador;
  }

  const maskedNome = maskPersonNameLgpd(cuidador.nome) || '—';
  const hasCoverageSub =
    cuidador.status === 'Cobertura' &&
    cuidador.substituto !== undefined &&
    cuidador.substituto.trim().length > 0;
  const maskedSubstituto = hasCoverageSub
    ? maskPersonNameLgpd(cuidador.substituto) || '—'
    : undefined;

  const projected: Cuidador = {
    id: cuidador.id,
    nome: maskedNome,
    status: cuidador.status,
    ...(cuidador.turno !== undefined ? { turno: cuidador.turno } : {}),
    ...(cuidador.quarto !== undefined ? { quarto: cuidador.quarto } : {}),
    ...(cuidador.horasDescanso !== undefined ? { horasDescanso: cuidador.horasDescanso } : {}),
    ...(maskedSubstituto !== undefined ? { substituto: maskedSubstituto } : {}),
  };

  return Object.freeze(projected);
}

/**
 * Projeta uma lista completa de cuidadores de modo imutavel quando `privacyMode === true`.
 */
export function projectCaregiverListForLgpd(
  cuidadores: readonly Cuidador[],
  privacyMode: boolean
): readonly Cuidador[] {
  if (!privacyMode) {
    return cuidadores;
  }
  return Object.freeze(cuidadores.map((item) => projectCaregiverForLgpd(item, true)));
}
