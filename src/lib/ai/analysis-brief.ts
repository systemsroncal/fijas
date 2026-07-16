/**
 * Resumen de análisis en español (seguro para cliente y servidor).
 */

import type { AnalysisBrief, StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { formatReadablePick } from '@/lib/match-display';

/** Elimina JSON / props inventados / mezcla EN del texto libre. */
export function sanitizeNarrative(text: string | null | undefined, fallback: string): string {
  if (!text?.trim()) return fallback;
  const t = text.trim();
  if (/Tiros est\.|totalHome|onTarget|props LLM|Híbrido:|estimated|extraMarkets|playerProps/i.test(t)) {
    return fallback;
  }
  if (/\{[\s\S]*"\w+"\s*:/.test(t)) return fallback;
  return t.slice(0, 500);
}

/**
 * Resumen detallado en español a partir de datos reales + modelo (sin invención).
 */
export function buildAnalysisBrief(payload: StructuredMatchPayload): AnalysisBrief {
  const m = payload.match;
  const form = payload.form;
  const markets = Array.isArray(payload.markets) ? payload.markets : [];
  const bookMarkets = markets.filter((x) => x.source === 'book');
  const impliedMarkets = markets.filter((x) => x.source === 'implied');
  const best = [...markets].sort((a, b) => b.edge - a.edge)[0];
  const tipLabel =
    m?.tip != null
      ? formatReadablePick(m.tip, m.homeTeam, m.awayTeam)
      : null;

  const bullets: string[] = [];
  if (m && m.homeTeam !== 'N/A') {
    bullets.push(
      `Partido: ${m.homeTeam} vs ${m.awayTeam} (${m.league}).` +
        (tipLabel && tipLabel !== '—'
          ? ` Tip scrapeado: ${tipLabel}.`
          : ' Sin tip scrapeado.')
    );
  }
  if (payload.probs && m) {
    bullets.push(
      `Probabilidades modelo — ${m.homeTeam} GANA ${payload.probs.home}%, EMPATE ${payload.probs.draw}%, ${m.awayTeam} GANA ${payload.probs.away}%.`
    );
  }
  if (payload.scoreline?.mostLikely) {
    bullets.push(
      `Marcador más probable según el modelo: ${payload.scoreline.mostLikely}` +
        (payload.scoreline.alternatives?.length
          ? ` (alternativas: ${payload.scoreline.alternatives.join(', ')}).`
          : '.')
    );
  }
  if (payload.expected?.xgHome != null && payload.expected?.xgAway != null) {
    bullets.push(
      `Goles esperados del modelo (λ/xG): ${payload.expected.xgHome} – ${payload.expected.xgAway}.`
    );
  }

  if (form?.available && form.recentScores.length > 0) {
    bullets.push(
      `Historial scrapeado (${form.sampleSize} marcadores): ${form.recentScores.join(', ')}.`
    );
    if (form.avgGoalsTotal != null) {
      bullets.push(`Media de goles por partido en la muestra: ${form.avgGoalsTotal}.`);
    }
    if (form.avgCards != null) {
      bullets.push(
        `Media de tarjetas en la muestra: ${form.avgCards} (total muestra: ${form.cardsTotal}).`
      );
    } else {
      bullets.push('No hay conteo de tarjetas scrapeado en el historial; no se estima.');
    }
  } else {
    bullets.push(
      form?.message ??
        'Sin marcadores históricos en base de datos: no se muestran tiros, córners ni tarjetas inventados.'
    );
  }

  const h2h = form?.h2h?.filter((r) => r.score) ?? [];
  if (h2h.length > 0) {
    bullets.push(
      `H2H previos: ${h2h
        .slice(0, 5)
        .map((r) => `${r.label} ${r.score}${r.date ? ` (${r.date})` : ''}`)
        .join(' · ')}.`
    );
  } else {
    bullets.push('Sin enfrentamientos directos (H2H) con marcador en la base.');
  }

  const homeS = form?.homeSeason?.filter((r) => r.score) ?? [];
  const awayS = form?.awaySeason?.filter((r) => r.score) ?? [];
  if (homeS.length > 0 && m) {
    bullets.push(
      `Forma temporada ${m.homeTeam}: ${homeS
        .slice(0, 5)
        .map((r) => r.score)
        .join(', ')}.`
    );
  }
  if (awayS.length > 0 && m) {
    bullets.push(
      `Forma temporada ${m.awayTeam}: ${awayS
        .slice(0, 5)
        .map((r) => r.score)
        .join(', ')}.`
    );
  }

  if (payload.aiCascade?.neuralOnly) {
    bullets.push(
      'Motor: Red Neuronal — ninguna IA externa respondió o no hay keys.'
    );
  } else if (payload.llmUsed && payload.llmProvider) {
    bullets.push(`Motor: IA ${payload.llmProvider} (enriquecimiento narrativo).`);
  }

  const fd = payload.footballData;
  if (fd) {
    if (fd.standingsHome || fd.standingsAway) {
      bullets.push(
        `Clasificación football-data.org: local #${fd.standingsHome?.position ?? '?'} (${fd.standingsHome?.points ?? '?'} pts) · visitante #${fd.standingsAway?.position ?? '?'} (${fd.standingsAway?.points ?? '?'} pts).`
      );
    }
    if (fd.score) bullets.push(`Marcador API football-data.org: ${fd.score} (${fd.status}).`);
  }

  bullets.push(
    `Mercados: ${bookMarkets.length} con cuota de casa, ${impliedMarkets.length} con cuota implícita del modelo.`
  );
  if (best) {
    bullets.push(
      `Mejor edge: ${best.market} @ ${best.odds.toFixed(2)} (prob ${best.aiProb}%, edge ${(best.edge * 100).toFixed(1)}%, origen ${best.source === 'book' ? 'casa' : best.source === 'implied' ? 'implícita' : best.source}).`
    );
  }
  if (payload.picks?.value) {
    bullets.push(
      `Pick value: ${payload.picks.value.market} @ ${payload.picks.value.odds.toFixed(2)}.`
    );
  }
  if (payload.picks?.safe) {
    bullets.push(
      `Pick seguro: ${payload.picks.safe.market} @ ${payload.picks.safe.odds.toFixed(2)}.`
    );
  }
  const sameMatchGaps = (payload.proposedAccumulators ?? []).filter((a) => a.legs.length >= 2);
  if (sameMatchGaps.length > 0) {
    bullets.push(
      `Huecos multi-mercado detectados: ${sameMatchGaps.length} combinada(s) con varias selecciones del mismo partido.`
    );
  }

  return {
    headline:
      m && m.homeTeam !== 'N/A'
        ? `Resumen · ${m.homeTeam} vs ${m.awayTeam}`
        : 'Resumen del scanner de huecos',
    bullets,
    dataSources: [
      'Modelo Poisson (probabilidades resultado / O-U / BTTS)',
      bookMarkets.length > 0 ? 'Cuotas scrapeadas de casa' : 'Sin cuotas de casa en este partido',
      form?.available ? 'Marcadores históricos scrapeados en BD' : 'Sin historial de marcadores en BD',
      h2h.length > 0 ? `H2H (${h2h.length} encuentros)` : 'Sin H2H en BD',
      homeS.length || awayS.length
        ? 'Forma de temporada/torneo (marcadores scrapeados)'
        : 'Sin forma de temporada en BD',
      payload.footballData
        ? 'football-data.org (tabla/fixtures)'
        : 'Sin football-data.org en este análisis',
      tipLabel && tipLabel !== '—' ? 'Tip de fuente de scraping' : 'Sin tip de scraping',
      payload.llmUsed
        ? `IA ${payload.llmProvider}`
        : 'Red Neuronal',
    ],
    limitations: [
      'No se inventan tiros a puerta, goleadores ni props de jugador.',
      'xG mostrado es λ del modelo, no Opta/xG de proveedor externo.',
      'Si no hay historial scrapeado, las medias de goles/tarjetas quedan vacías.',
      'Esto no es consejo financiero.',
    ],
  };
}

/** Asegura brief en payloads antiguos del historial. */
export function withBrief(payload: StructuredMatchPayload): StructuredMatchPayload {
  if (!payload?.probs || !Array.isArray(payload.markets)) {
    return {
      ...payload,
      brief: {
        headline: 'Resultado de combinada',
        bullets: ['Este payload no incluye dashboard de partido.'],
        dataSources: ['Análisis de acumulada'],
        limitations: ['Usa Ver resultado en historial de combinadas.'],
      },
    };
  }
  const edgeSummary = sanitizeNarrative(
    payload.edgeSummary,
    'Análisis basado en modelo Poisson y datos scrapeados disponibles.'
  );
  const next = {
    ...payload,
    edgeSummary,
    disclaimer:
      payload.disclaimer?.includes('props LLM') || payload.disclaimer?.includes('Híbrido')
        ? 'Solo datos scrapeados + modelo Poisson. No se inventan marcadores, tiros ni props.'
        : payload.disclaimer,
  };
  return { ...next, brief: buildAnalysisBrief(next) };
}
