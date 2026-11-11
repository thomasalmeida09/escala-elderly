import { describe, expect, it } from 'vitest';
import { createCaregiverApiClient } from '../src/services/caregiverApi';
import {
  CARLOS_ROCHA_ID,
  createCaregiverScheduleController,
} from '../src/services/caregiverSyncController';
import {
  DEFAULT_FOLGA_REST_HOURS,
  FOLGUISTAS_RESERVA_PADRAO,
  MIN_CLT_REST_HOURS,
  buildCoverageSummonsMessage,
  buildWhatsAppCoverageUrl,
  classifyShiftKind,
  getCoverageSuggestions,
  normalizeWhatsAppPhone,
  validateCoverageAssignment,
} from '../src/services/coverageEngine';
import {
  SCHEDULE_STORAGE_KEY,
  type StorageAdapter,
  createLocalFirstStore,
  getCanonicalSeed,
} from '../src/services/localFirstStore';
import { type Cuidador, applyStatusChange, parseCuidador } from '../src/types/caregiver';

function createMemoryStorage(): {
  readonly adapter: StorageAdapter;
  readonly map: Map<string, string>;
} {
  const map = new Map<string, string>();
  const adapter: StorageAdapter = {
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
  return { adapter, map };
}

describe('FE #7 — Smart Shift Coverage Engine (CLT Art. 66), WhatsApp Summons & Sync Controller', () => {
  it('1. enforces exact CLT Art. 66 boundary (0h, 8h, 10h blocked vs 11h, 14h, 24h, undefined approved)', () => {
    expect(MIN_CLT_REST_HOURS).toBe(11);
    expect(DEFAULT_FOLGA_REST_HOURS).toBe(24);

    const absentCarlos = parseCuidador({
      id: 3,
      nome: 'Carlos Rocha',
      status: 'Faltou',
      turno: 'Noturno (19h-07h)',
      quarto: 'Quarto 03',
    });

    const boundaryPool: Cuidador[] = [
      parseCuidador({ id: 9100, nome: 'Zero Horas', status: 'Folga', horasDescanso: 0 }),
      parseCuidador({ id: 9101, nome: 'Oito Horas', status: 'Folga', horasDescanso: 8 }),
      parseCuidador({ id: 9102, nome: 'Dez Horas', status: 'Folga', horasDescanso: 10 }),
      parseCuidador({
        id: 9103,
        nome: 'Onze Horas Limite',
        status: 'Folga',
        turno: 'Noturno (19h-07h)',
        horasDescanso: 11,
      }),
      parseCuidador({
        id: 9104,
        nome: 'Sem Hora Explicita',
        status: 'Folga',
        turno: 'Diurno (07h-19h)',
      }),
    ];

    const result = getCoverageSuggestions(absentCarlos, [absentCarlos], boundaryPool);

    expect(result.blockedByCltCount).toBe(3);
    expect(result.alreadyAllocatedCount).toBe(0);
    expect(result.eligible.map((item) => item.cuidador.nome)).toEqual([
      'Onze Horas Limite',
      'Sem Hora Explicita',
    ]);
    expect(result.eligible[0]?.effectiveRestHours).toBe(11);
    expect(result.eligible[1]?.effectiveRestHours).toBe(24);

    // Non-absent caregivers never produce suggestions
    const presentCarlos = applyStatusChange(absentCarlos, 'Presente');
    const nonAbsentResult = getCoverageSuggestions(presentCarlos, [presentCarlos], boundaryPool);
    expect(nonAbsentResult.eligible).toHaveLength(0);
    expect(nonAbsentResult.blockedByCltCount).toBe(0);
  });

  it('2. classifies shift kinds accurately and ranks by shift affinity -> rest hours -> source -> id', () => {
    expect(classifyShiftKind('Noturno (19h-07h)')).toBe('noturno');
    expect(classifyShiftKind('Diurno (07h-19h)')).toBe('diurno');
    expect(classifyShiftKind('Plantonista Flex (Diurno/Noturno)')).toBe('flex');
    expect(classifyShiftKind('Diurno/Noturno')).toBe('flex');
    expect(classifyShiftKind('19h-07h')).toBe('noturno');
    expect(classifyShiftKind('07h-19h')).toBe('diurno');
    expect(classifyShiftKind(undefined)).toBe('flex');
    expect(classifyShiftKind('   ')).toBe('flex');

    const seed = getCanonicalSeed();
    const rosterWithCarlosAbsent = seed.map((item) =>
      item.id === CARLOS_ROCHA_ID ? applyStatusChange(item, 'Faltou') : item
    );
    const carlos = rosterWithCarlosAbsent.find((item) => item.id === CARLOS_ROCHA_ID)!;

    const suggestions = getCoverageSuggestions(carlos, rosterWithCarlosAbsent);
    expect(suggestions.blockedByCltCount).toBe(1); // Rafael Mendes (8h < 11h)
    expect(suggestions.eligible.map((item) => item.cuidador.nome)).toEqual([
      'Beatriz Alves',
      'Helena Prado',
    ]);
    expect(suggestions.eligible[0]?.shiftMatchLabel).toBe('Mesmo turno');
    expect(suggestions.eligible[0]?.shiftAffinityScore).toBe(2);
    expect(suggestions.eligible[1]?.shiftMatchLabel).toBe('Turno flexível');
    expect(suggestions.eligible[1]?.shiftAffinityScore).toBe(1);

    // M3.3: When absent caregiver has undefined shift ('flex'), shift weight is neutral (0) and rest hours win
    const shiftlessAbsent = parseCuidador({
      id: 20,
      nome: 'Plantonista Sem Turno',
      status: 'Faltou',
      quarto: 'Quarto 09',
    });
    const shiftlessSuggestions = getCoverageSuggestions(shiftlessAbsent, [shiftlessAbsent]);
    expect(shiftlessSuggestions.eligible.map((item) => item.cuidador.nome)).toEqual([
      'Helena Prado',
      'Beatriz Alves',
    ]);
    expect(shiftlessSuggestions.eligible[0]?.shiftMatchLabel).toBe('Turno flexível');
    expect(shiftlessSuggestions.eligible[1]?.shiftMatchLabel).toBe('Turno compatível');
  });

  it('3. enforces authoritative activeRoster shadowing over reservePool (anti-CLT-bypass M2.1)', () => {
    expect(FOLGUISTAS_RESERVA_PADRAO.map((item) => item.id)).toEqual([9001, 9002, 9003]);

    // Case A: Beatriz Alves is already working ('Presente') in activeRoster and Helena Prado is in 'Folga' with only 6h rest!
    const csvImportedRoster: Cuidador[] = [
      parseCuidador({
        id: 3,
        nome: 'Carlos Rocha',
        status: 'Faltou',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 03',
      }),
      parseCuidador({
        id: 5,
        nome: 'Beatriz Alves',
        status: 'Presente',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 05',
      }),
      parseCuidador({
        id: 6,
        nome: 'Helena Prado',
        status: 'Folga',
        turno: 'Plantonista Flex (Diurno/Noturno)',
        horasDescanso: 6,
      }),
    ];

    const result = getCoverageSuggestions(csvImportedRoster[0]!, csvImportedRoster);

    // Neither Beatriz (working) nor Helena (6h < 11h in activeRoster) nor Rafael (8h < 11h in reserve) may leak!
    expect(result.eligible).toHaveLength(0);
    expect(result.blockedByCltCount).toBe(2); // Helena (6h) + Rafael (8h)
  });

  it('4. guarantees 100% Online (5-field :8080) vs Offline (7-field Caregive.json) parity without false ID inheritance (M1.2)', () => {
    const offlineRoster = getCanonicalSeed().map((item) => {
      if (item.id === 3) return applyStatusChange(item, 'Faltou');
      if (item.id === 4) return applyStatusChange(item, 'Folga'); // Mariana Costa on Folga
      return item;
    });

    // Simulate exact 5-field payload returned by Spring Boot CuidadorService.criarEscalaInicialPadrao()
    const onlineBackendRoster: Cuidador[] = [
      parseCuidador({
        id: 1,
        nome: 'Ana Souza',
        status: 'Presente',
        turno: 'Diurno (07h-19h)',
        quarto: 'Quarto 01',
      }),
      parseCuidador({
        id: 2,
        nome: 'Lucas Lima',
        status: 'Presente',
        turno: 'Diurno (07h-19h)',
        quarto: 'Quarto 02',
      }),
      parseCuidador({
        id: 3,
        nome: 'Carlos Rocha',
        status: 'Faltou',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 03',
      }),
      parseCuidador({
        id: 4,
        nome: 'Mariana Costa',
        status: 'Folga',
        turno: 'Noturno (19h-07h)',
        quarto: 'Quarto 04',
      }),
    ];

    const offlineSuggestions = getCoverageSuggestions(offlineRoster[2]!, offlineRoster);
    const onlineSuggestions = getCoverageSuggestions(onlineBackendRoster[2]!, onlineBackendRoster);

    expect(onlineSuggestions.eligible.map((c) => c.cuidador.nome)).toEqual(
      offlineSuggestions.eligible.map((c) => c.cuidador.nome)
    );
    expect(onlineSuggestions.eligible[0]?.cuidador.nome).toBe('Mariana Costa');
    expect(onlineSuggestions.eligible[0]?.effectiveRestHours).toBe(24);
    expect(onlineSuggestions.eligible[0]?.whatsAppUrl).toBe(
      offlineSuggestions.eligible[0]?.whatsAppUrl
    );
    expect(onlineSuggestions.eligible[0]?.whatsAppUrl).toContain('wa.me/5511900000104?text=');

    // Guard against false ID inheritance when CSV assigns a different person to id=4 without phone
    const customCsvPersonAtId4: Cuidador[] = [
      onlineBackendRoster[2]!,
      parseCuidador({
        id: 4,
        nome: 'Outra Profissional Sem Telefone',
        status: 'Folga',
        turno: 'Noturno (19h-07h)',
      }),
    ];
    const csvSuggestions = getCoverageSuggestions(customCsvPersonAtId4[0]!, customCsvPersonAtId4);
    const customCandidate = csvSuggestions.eligible.find(
      (c) => c.cuidador.nome === 'Outra Profissional Sem Telefone'
    );
    expect(customCandidate?.whatsAppUrl.startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('5. prevents double-booking across simultaneous absences, handles pool exhaustion, and releases substitute on Presente', () => {
    const base = getCanonicalSeed();
    // Both Carlos (id=3) and Mariana (id=4) are absent; Carlos gets covered by Beatriz Alves
    const afterCarlosCovered = base.map((item) => {
      if (item.id === 3) return applyStatusChange(item, 'Cobertura', 'Beatriz Alves');
      if (item.id === 4) return applyStatusChange(item, 'Faltou');
      return item;
    });

    const marianaSuggestions = getCoverageSuggestions(afterCarlosCovered[3]!, afterCarlosCovered);
    expect(marianaSuggestions.alreadyAllocatedCount).toBe(1);
    expect(marianaSuggestions.eligible.map((c) => c.cuidador.nome)).toEqual(['Helena Prado']);

    // Cover Mariana with Helena Prado, and now Ana Souza (id=1) also calls in absent -> pool exhausted!
    const exhaustedRoster = afterCarlosCovered.map((item) => {
      if (item.id === 4) return applyStatusChange(item, 'Cobertura', 'Helena Prado');
      if (item.id === 1) return applyStatusChange(item, 'Faltou');
      return item;
    });

    const anaSuggestions = getCoverageSuggestions(exhaustedRoster[0]!, exhaustedRoster);
    expect(anaSuggestions.eligible).toHaveLength(0);
    expect(anaSuggestions.alreadyAllocatedCount).toBe(2);
    expect(anaSuggestions.blockedByCltCount).toBe(1);
    expect(anaSuggestions.groupFallbackWhatsAppUrl.startsWith('https://wa.me/?text=')).toBe(true);

    // Toggling Carlos from Cobertura -> Presente clears substituto and releases Beatriz Alves back to eligible!
    const releasedRoster = exhaustedRoster.map((item) =>
      item.id === 3 ? applyStatusChange(item, 'Presente') : item
    );
    const afterReleaseSuggestions = getCoverageSuggestions(releasedRoster[0]!, releasedRoster);
    expect(afterReleaseSuggestions.eligible.map((c) => c.cuidador.nome)).toEqual(['Beatriz Alves']);
  });

  it('6. normalizes Brazilian/E.164 WhatsApp numbers safely and enforces LGPD data minimization on wa.me URLs (M3)', () => {
    expect(normalizeWhatsAppPhone('+55 (11) 90000-0106')).toBe('5511900000106');
    expect(normalizeWhatsAppPhone('(11) 90000-0106')).toBe('5511900000106');
    expect(normalizeWhatsAppPhone('(11) 3000-0106')).toBe('551130000106');
    expect(normalizeWhatsAppPhone('(011) 90000-0106')).toBe('5511900000106');
    expect(normalizeWhatsAppPhone('+55 (011) 90000-0106')).toBe('5511900000106');
    expect(normalizeWhatsAppPhone('005511900000106')).toBe('5511900000106');
    expect(normalizeWhatsAppPhone('+55 11 90000-0106 ramal 12')).toBe('5511900000106');
    expect(normalizeWhatsAppPhone('+55 11 90000-0106 #204')).toBe('5511900000106');

    // Reject short local numbers without DDD (prevents misrouting to +998 Uzbekistan) & invalid zeroes
    expect(normalizeWhatsAppPhone('99888-7766')).toBeNull();
    expect(normalizeWhatsAppPhone('3000-0106')).toBeNull();
    expect(normalizeWhatsAppPhone('00000000000')).toBeNull();
    expect(normalizeWhatsAppPhone('+55 11 00000-0000')).toBeNull();
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone(undefined)).toBeNull();

    const absentCarlos = parseCuidador({
      id: 3,
      nome: 'Carlos Rocha',
      status: 'Faltou',
      turno: 'Noturno (19h-07h)',
      quarto: 'Quarto 03',
    });
    const beatriz = FOLGUISTAS_RESERVA_PADRAO[0]!;

    const message = buildCoverageSummonsMessage(absentCarlos, beatriz);
    expect(message).toContain('Beatriz Alves');
    expect(message).toContain('Noturno (19h-07h)');
    expect(message).toContain('Quarto 03');
    // LGPD Art. 6 III: never leak the absent colleague's personal name in external wa.me text
    expect(message).not.toContain('Carlos Rocha');
    expect(message).not.toContain('undefined');
    expect(message).not.toContain('null');

    const url = buildWhatsAppCoverageUrl(absentCarlos, beatriz);
    expect(url).toBe(`https://wa.me/5511900000105?text=${encodeURIComponent(message)}`);

    // Partial/missing turno & quarto never interpolate "undefined"
    const minimalAbsent = parseCuidador({ id: 9, nome: 'Sem Meta', status: 'Faltou' });
    const fallbackUrl = buildWhatsAppCoverageUrl(minimalAbsent);
    const decodedFallback = decodeURIComponent(fallbackUrl.replace('https://wa.me/?text=', ''));
    expect(fallbackUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodedFallback).toContain('Olá equipe!');
    expect(decodedFallback).not.toContain('Sem Meta');
    expect(decodedFallback).not.toContain('undefined');
  });

  it('7. synchronizes confirmCaregiverCoverage via PATCH, promotes POST /batch, auto-heals 404, and enforces DbC guards', async () => {
    const calls: Array<{ readonly method: string; readonly url: string; readonly body?: string }> =
      [];

    const { adapter, map } = createMemoryStorage();
    const api = createCaregiverApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? init.body : undefined;
        calls.push({ method, url, body });

        if (method === 'PATCH' && url.endsWith('/api/cuidadores/3/status')) {
          const parsedBody = JSON.parse(body!) as { status: string; substituto?: string };
          return new Response(
            JSON.stringify({
              id: 3,
              nome: 'Carlos Rocha',
              status: parsedBody.status,
              turno: 'Noturno (19h-07h)',
              quarto: 'Quarto 03',
              ...(parsedBody.substituto ? { substituto: parsedBody.substituto } : {}),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify(getCanonicalSeed()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const controller = createCaregiverScheduleController({
      store: createLocalFirstStore({ storage: adapter }),
      api,
      eventTarget: null,
    });

    // Guard 1: Cannot confirm coverage while Carlos is still 'Presente'
    await controller.confirmCaregiverCoverage(CARLOS_ROCHA_ID, 'Beatriz Alves');
    expect(calls).toHaveLength(0);
    expect(controller.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.status).toBe(
      'Presente'
    );

    // Simulate Carlos absence -> PATCH /3/status {"status":"Faltou"}
    await controller.simulateCarlosAbsence();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toBe('{"status":"Faltou"}');

    // Guard 2: Reject self-coverage, active 'Presente' colleague, and CLT < 11h reserve member ('Rafael Mendes' 8h)
    expect(
      validateCoverageAssignment(
        CARLOS_ROCHA_ID,
        'Carlos Rocha',
        controller.getSnapshot().cuidadores
      )
    ).toBeNull();
    expect(
      validateCoverageAssignment(CARLOS_ROCHA_ID, 'Ana Souza', controller.getSnapshot().cuidadores)
    ).toBeNull();
    expect(
      validateCoverageAssignment(
        CARLOS_ROCHA_ID,
        'Rafael Mendes',
        controller.getSnapshot().cuidadores
      )
    ).toBeNull();
    expect(
      validateCoverageAssignment(CARLOS_ROCHA_ID, '   ', controller.getSnapshot().cuidadores)
    ).toBeNull();

    await controller.confirmCaregiverCoverage(CARLOS_ROCHA_ID, 'Rafael Mendes');
    expect(calls).toHaveLength(1); // Blocked by CLT < 11h!

    // Valid confirmation -> 0ms localStorage write + PATCH /3/status {"status":"Cobertura","substituto":"Beatriz Alves"}
    await controller.confirmCaregiverCoverage(CARLOS_ROCHA_ID, '  Beatriz Alves  ');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.method).toBe('PATCH');
    expect(calls[1]?.body).toBe('{"status":"Cobertura","substituto":"Beatriz Alves"}');
    expect(calls[1]?.body).not.toContain('null');

    const coveredCarlos = controller
      .getSnapshot()
      .cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)!;
    expect(coveredCarlos.status).toBe('Cobertura');
    expect(coveredCarlos.substituto).toBe('Beatriz Alves');
    expect(controller.getSnapshot().connectionStatus).toBe('online');
    expect(controller.getSnapshot().pendingRemoteSync).toBe(false);

    const persistedRaw = map.get(SCHEDULE_STORAGE_KEY)!;
    expect(persistedRaw).toContain('"substituto":"Beatriz Alves"');
    controller.dispose();
  });

  it('8. auto-heals 404 on confirmCaregiverCoverage via POST /batch and promotes multi-dirty snapshots', async () => {
    const methodsCalled: string[] = [];
    const { adapter } = createMemoryStorage();

    const api = createCaregiverApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        methodsCalled.push(`${method} ${new URL(url).pathname}`);

        if (method === 'PATCH') {
          return new Response(
            JSON.stringify({ code: 'CUIDADOR_NOT_FOUND', message: 'Posto ausente na RAM' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (method === 'POST' && url.endsWith('/api/cuidadores/batch')) {
          return new Response(typeof init?.body === 'string' ? init.body : '[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(getCanonicalSeed()), { status: 200 });
      },
    });

    const controller = createCaregiverScheduleController({
      store: createLocalFirstStore({ storage: adapter }),
      api,
      eventTarget: null,
    });

    await controller.simulateCarlosAbsence();
    await controller.confirmCaregiverCoverage(CARLOS_ROCHA_ID, 'Helena Prado');

    expect(methodsCalled).toEqual([
      'PATCH /api/cuidadores/3/status',
      'POST /api/cuidadores/batch',
      'PATCH /api/cuidadores/3/status',
      'POST /api/cuidadores/batch',
    ]);
    expect(
      controller.getSnapshot().cuidadores.find((c) => c.id === CARLOS_ROCHA_ID)?.substituto
    ).toBe('Helena Prado');
    expect(controller.getSnapshot().pendingRemoteSync).toBe(false);
    controller.dispose();
  });
});
