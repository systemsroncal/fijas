/** Etiquetas en español para la UI de análisis (veredictos, modos, métricas). */

export type VerdictKind = 'value' | 'safe' | 'risky' | 'avoid' | 'neutral';

export const verdictLabelEs: Record<VerdictKind, string> = {
  value: 'Valor',
  safe: 'Seguro',
  risky: 'Arriesgado',
  avoid: 'Evitar',
  neutral: 'Neutral',
};

export const analysisModeLabelEs: Record<string, string> = {
  MATCH: 'Por partido',
  ACCUMULATOR: 'Combinada',
  RANDOM: 'Aleatorio',
  SUGGESTED: 'Sugerida',
};

export const formResultLabelEs: Record<'W' | 'D' | 'L', string> = {
  W: 'V',
  D: 'E',
  L: 'D',
};

export function translateVerdict(value: string | null | undefined): string {
  if (!value) return '—';
  return verdictLabelEs[value as VerdictKind] ?? value;
}

export function translateAnalysisMode(mode: string | null | undefined): string {
  if (!mode) return '—';
  return analysisModeLabelEs[mode] ?? mode;
}

export const matchPhaseLabelEs: Record<string, string> = {
  scheduled: 'Programado',
  live: 'En vivo',
  finished: 'Finalizado',
  unknown: 'Desconocido',
};

export function translateMatchPhase(phase: string | null | undefined): string {
  if (!phase) return '—';
  return matchPhaseLabelEs[phase] ?? phase;
}
