/**
 * Resumen de análisis en español (seguro para cliente y servidor).
 */

import type { AnalysisBrief, StructuredMatchPayload } from '@/lib/ai/analysis-types';

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
  const bookMarkets = payload.markets.filter((x) => x.source === 'book');
  const impliedMarkets = payload.markets.filter((x) => x.source === 'implied');
  const best = [...payload.markets].sort((a, b) => b.edge - a.edge)[0];

  const bullets: string[] = [];
  if (m && m.homeTeam !== 'N/A') {
    bullets.push(
      `Partido: ${m.homeTeam} vs ${m.awayTeam} (${m.league}).` +
        (m.tip ? ` Tip scrapeado: ${m.tip}.` : ' Sin tip scrapeado.')
    );
  }
  bullets.push(
    `Probabilidades modelo Poisson — Local ${payload.probs.home}%, Empate ${payload.probs.draw}%, Visitante ${payload.probs.away}%.`
  );
  bullets.push(
    `Marcador más probable según el modelo: ${payload.scoreline.mostLikely}` +
      (payload.scoreline.alternatives?.length
        ? ` (alternativas: ${payload.scoreline.alternatives.join(', ')}).`
        : '.')
  );
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

  return {
    headline:
      m && m.homeTeam !== 'N/A'
        ? `Resumen · ${m.homeTeam} vs ${m.awayTeam}`
        : 'Resumen del scanner de huecos',
    bullets,
    dataSources: [
      'Modelo Poisson (probabilidades 1X2 / O-U / BTTS)',
      bookMarkets.length > 0 ? 'Cuotas scrapeadas de casa' : 'Sin cuotas de casa en este partido',
      form?.available ? 'Marcadores históricos scrapeados en BD' : 'Sin historial de marcadores en BD',
      m?.tip ? 'Tip de fuente de scraping' : 'Sin tip de scraping',
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
