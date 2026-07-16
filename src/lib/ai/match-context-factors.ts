/**
 * Árbitro, bajas y escenarios what-if para el análisis de mercados.
 * Sin inventar nombres: si no hay dato, style=unknown y listas vacías.
 */

import type {
  AnalysisAbsence,
  AnalysisMarket,
  AnalysisReferee,
  AnalysisScenario,
  StructuredMatchPayload,
  TeamFormBlock,
} from '@/lib/ai/analysis-types';

export type RefereeStyle = AnalysisReferee['style'];

/** Multiplicadores sobre medias proxy de tarjetas/faltas/goles. */
export type ContextMultipliers = {
  cards: number;
  fouls: number;
  goals: number;
  note: string;
};

const STYLE_MULT: Record<RefereeStyle, { cards: number; fouls: number }> = {
  strict: { cards: 1.28, fouls: 1.18 },
  lenient: { cards: 0.78, fouls: 0.88 },
  balanced: { cards: 1, fouls: 1 },
  unknown: { cards: 1, fouls: 1 },
};

export function multipliersFromReferee(
  referee: AnalysisReferee | null | undefined,
  absences: { home: AnalysisAbsence[]; away: AnalysisAbsence[] } | null | undefined
): ContextMultipliers {
  const style = referee?.style ?? 'unknown';
  const base = STYLE_MULT[style] ?? STYLE_MULT.unknown;
  let cards = base.cards;
  let fouls = base.fouls;
  let goals = 1;

  if (referee?.cardsTendency === 'high') cards *= 1.1;
  if (referee?.cardsTendency === 'low') cards *= 0.9;

  const impactWeight = (list: AnalysisAbsence[]) =>
    list.reduce((acc, a) => {
      if (a.impact === 'high') return acc + 0.08;
      if (a.impact === 'medium') return acc + 0.04;
      return acc + 0.015;
    }, 0);

  const homeHit = impactWeight(absences?.home ?? []);
  const awayHit = impactWeight(absences?.away ?? []);
  // Bajas ofensivas/clave → menos goles esperados en aggregate; disciplina similar
  goals = Math.max(0.82, 1 - (homeHit + awayHit) * 0.55);
  if (homeHit + awayHit > 0.12) {
    cards *= 1.05; // partidos rotos / suplentes → algo más de faltas/tarjetas
    fouls *= 1.06;
  }

  const bits: string[] = [];
  if (style !== 'unknown') bits.push(`árbitro ${style}`);
  if (referee?.cardsTendency && referee.cardsTendency !== 'unknown') {
    bits.push(`tarjetas ${referee.cardsTendency}`);
  }
  if (homeHit + awayHit > 0) bits.push('ajuste por bajas');

  return {
    cards: Math.round(cards * 100) / 100,
    fouls: Math.round(fouls * 100) / 100,
    goals: Math.round(goals * 100) / 100,
    note: bits.length ? bits.join(' · ') : 'sin ajuste contextual',
  };
}

/** Heurística pre-LLM a partir de forma / tip / notas. */
export function inferRefereeFromSignals(input: {
  form?: TeamFormBlock | null;
  tip?: string | null;
  edgeNotes?: string[];
  refereeName?: string | null;
}): AnalysisReferee {
  const text = [
    input.tip ?? '',
    input.form?.message ?? '',
    ...(input.edgeNotes ?? []),
  ]
    .join(' ')
    .toLowerCase();

  let style: RefereeStyle = 'unknown';
  let cardsTendency: AnalysisReferee['cardsTendency'] = 'unknown';
  const notes: string[] = [];

  if (
    /estricto|strict|carta[s]? f[aá]cil|saca muchas|muchas tarjetas|whistle|pitido/.test(
      text
    )
  ) {
    style = 'strict';
    cardsTendency = 'high';
    notes.push('Señal textual: tendencia a cobrar fuerte / muchas tarjetas.');
  } else if (
    /deja jugar|lenient|permisiv|pocas tarjetas|poco pitido|lets them play/.test(text)
  ) {
    style = 'lenient';
    cardsTendency = 'low';
    notes.push('Señal textual: árbitro permisivo / deja jugar.');
  }

  const avg = input.form?.avgCards;
  if (avg != null && avg >= 5) {
    cardsTendency = 'high';
    if (style === 'unknown') style = 'strict';
    notes.push(`Media de tarjetas en muestra (${avg}) alta → sesgo disciplina.`);
  } else if (avg != null && avg > 0 && avg <= 3) {
    cardsTendency = 'low';
    if (style === 'unknown') style = 'lenient';
    notes.push(`Media de tarjetas en muestra (${avg}) baja → sesgo permisivo.`);
  } else if (avg != null && avg > 3 && avg < 5 && style === 'unknown') {
    style = 'balanced';
    cardsTendency = 'avg';
  }

  if (input.refereeName) {
    notes.push(`Nombre reportado: ${input.refereeName}.`);
  }

  return {
    name: input.refereeName?.trim() || null,
    style,
    cardsTendency,
    notes: notes.join(' ') || 'Sin historial de árbitro confirmado; se usan proxies.',
    source: input.refereeName ? 'api' : notes.length ? 'inferred' : 'none',
  };
}

export function emptyAbsences(): {
  home: AnalysisAbsence[];
  away: AnalysisAbsence[];
  notes: string;
  source: 'api' | 'llm' | 'inferred' | 'none';
} {
  return {
    home: [],
    away: [],
    notes: 'Sin listado de bajas confirmado en fuentes free.',
    source: 'none',
  };
}

export function buildDefaultScenarios(
  payload: Pick<StructuredMatchPayload, 'probs' | 'match' | 'referee' | 'absences'>
): AnalysisScenario[] {
  const home = payload.match?.homeTeam ?? 'Local';
  const away = payload.match?.awayTeam ?? 'Visitante';
  const ref = payload.referee;
  const abs = payload.absences;
  const mult = multipliersFromReferee(ref, abs);

  const base: AnalysisScenario = {
    id: 'base',
    label: 'Escenario base',
    assumptions: 'Poisson + cuotas/tip scrapeados; sin forzar sesgo de árbitro.',
    impactSummary: 'Probabilidades 1X2 y mercados tal como el modelo neuronal.',
    probShifts: { home: 0, draw: 0, away: 0 },
    focusMarkets: ['1X2', 'goles', 'BTTS'],
  };

  const strictCards: AnalysisScenario = {
    id: 'strict-ref',
    label: 'Árbitro estricto',
    assumptions:
      ref?.style === 'strict'
        ? `Árbitro ${ref.name ?? 'asignado'} con perfil estricto / muchas tarjetas.`
        : 'What-if: el colegiado cobra todas las faltas y saca bastantes tarjetas.',
    impactSummary: `Tarjetas/faltas ×${mult.cards.toFixed(2)} / ×${mult.fouls.toFixed(2)}. Más valor en overs de disciplina; juego más fragmentado.`,
    probShifts: {
      home: -1.5,
      draw: 2.5,
      away: -1,
    },
    focusMarkets: ['Tarjetas totales +3.5', 'Tarjetas totales +4.5', 'Faltas totales +21.5'],
  };

  const lenient: AnalysisScenario = {
    id: 'lenient-ref',
    label: 'Árbitro permisivo',
    assumptions: 'What-if: deja jugar, pocas interrupciones y menos cartulinas.',
    impactSummary: 'Unders de tarjetas/faltas ganan peso; más continuidad → leve alza de goles.',
    probShifts: { home: 1, draw: -1.5, away: 0.5 },
    focusMarkets: ['Tarjetas totales +3.5', '+2.5 goles', 'Ambos marcan'],
  };

  const absenceScenario: AnalysisScenario = {
    id: 'key-absences',
    label: 'Impacto de bajas',
    assumptions:
      (abs?.home.length || abs?.away.length)
        ? `Bajas: ${[
            ...abs!.home.map((a) => `${home}: ${a.player}`),
            ...abs!.away.map((a) => `${away}: ${a.player}`),
          ].join('; ')}`
        : `What-if: baja de un titular clave en ${home} o ${away} (sin listado confirmado).`,
    impactSummary:
      mult.goals < 0.98
        ? `Goles esperados ×${mult.goals}; más incertidumbre en 1X2.`
        : 'Sin bajas confirmadas: escenario ilustrativo (−goles / +varianza).',
    probShifts: { home: -2, draw: 3, away: -1 },
    focusMarkets: ['+2.5 goles', 'EMPATE', 'Ambos marcan'],
  };

  return [base, strictCards, lenient, absenceScenario];
}

/** Reajusta probs de mercados de tarjetas/faltas/goles según multiplicadores. */
export function adjustMarketsForContext(
  markets: AnalysisMarket[],
  mult: ContextMultipliers
): AnalysisMarket[] {
  return markets.map((m) => {
    const name = m.market.toLowerCase();
    let factor = 1;
    if (/tarjeta|card/.test(name)) factor = mult.cards;
    else if (/falta|foul/.test(name)) factor = mult.fouls;
    else if (
      /\+2\.5|\+1\.5|\+3\.5|goles|btts|ambos marcan|over|under|-2\.5/.test(name)
    ) {
      // overs suben si goals>1; unders bajan
      const isUnder = /^-|\bunder\b|menos|-2\.5|-1\.5/.test(name) || name.includes('−');
      if (isUnder) factor = 2 - mult.goals;
      else factor = mult.goals;
    } else {
      return m;
    }

    if (Math.abs(factor - 1) < 0.02) return m;

    const raw = m.aiProb / 100;
    // Acercar o alejar de 0.5 según factor
    const shifted = Math.min(0.92, Math.max(0.08, 0.5 + (raw - 0.5) * factor + (factor - 1) * 0.12));
    const aiProb = Math.round(shifted * 1000) / 10;
    const implied = m.odds > 1 ? 100 / m.odds : 50;
    const edge = Math.round((aiProb - implied) * 10) / 10;
    let verdict = m.verdict;
    if (edge >= 4 && aiProb >= 45) verdict = 'value';
    else if (aiProb >= 55 && edge >= -2) verdict = 'safe';
    else if (edge <= -6) verdict = 'avoid';
    else if (m.odds >= 2.2 && aiProb >= 22 && aiProb < 45) verdict = 'risky';
    else if (Math.abs(edge) < 3) verdict = 'neutral';

    return { ...m, aiProb, edge, verdict };
  });
}

export function applyContextFactorsToPayload(
  payload: StructuredMatchPayload,
  opts?: { refereeName?: string | null; edgeNotes?: string[] }
): StructuredMatchPayload {
  const inferred = inferRefereeFromSignals({
    form: payload.form,
    tip: payload.match?.tip,
    edgeNotes: opts?.edgeNotes ?? payload.footballData?.notes,
    refereeName: opts?.refereeName ?? payload.referee?.name,
  });

  const referee: AnalysisReferee = payload.referee
    ? {
        ...payload.referee,
        name: opts?.refereeName?.trim() || payload.referee.name,
        source: opts?.refereeName?.trim()
          ? 'api'
          : payload.referee.source === 'none'
            ? inferred.source
            : payload.referee.source,
        style:
          payload.referee.style === 'unknown' && inferred.style !== 'unknown'
            ? inferred.style
            : payload.referee.style,
        cardsTendency:
          payload.referee.cardsTendency === 'unknown' &&
          inferred.cardsTendency !== 'unknown'
            ? inferred.cardsTendency
            : payload.referee.cardsTendency,
        notes:
          payload.referee.notes && payload.referee.source !== 'none'
            ? payload.referee.notes
            : inferred.notes,
      }
    : inferred;

  const absences = payload.absences ?? emptyAbsences();
  const mult = multipliersFromReferee(referee, absences);
  const marketsBase = payload.marketsBase ?? payload.markets;
  const markets = adjustMarketsForContext(marketsBase, mult);
  const scenarios =
    payload.scenarios && payload.scenarios.length > 0
      ? payload.scenarios
      : buildDefaultScenarios({ ...payload, referee, absences });

  const intensity =
    ((payload.expected.xgHome ?? 1.3) + (payload.expected.xgAway ?? 1.1)) / 2.5;
  const cornersMean = (9 + intensity * 2.5) * mult.goals;
  const cardsMean = (3.8 + intensity * 0.4) * mult.cards;

  return {
    ...payload,
    referee,
    absences,
    scenarios,
    contextMultipliers: mult,
    marketsBase,
    markets,
    expected: {
      ...payload.expected,
      cornersHome: Math.round(cornersMean * 0.55 * 10) / 10,
      cornersAway: Math.round(cornersMean * 0.45 * 10) / 10,
      cardsHome: Math.round((cardsMean / 2) * 10) / 10,
      cardsAway: Math.round((cardsMean / 2) * 10) / 10,
      note: `${payload.expected.note
        .replace(/\s· Contexto:[\s\S]*$/, '')
        .trim()} · Contexto: ${mult.note}. Córners/tarjetas esperados = proxy (no Opta).`,
    },
  };
}
