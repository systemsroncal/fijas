/**
 * Traducciones ES para TheSportsDB (stats, timeline, status).
 */

const STAT_LABELS: Record<string, string> = {
  'ball possession': 'Posesión del balón',
  possession: 'Posesión del balón',
  'shots on goal': 'Tiros a puerta',
  'shots on target': 'Tiros a puerta',
  'shot on goal': 'Tiros a puerta',
  'shots off goal': 'Tiros fuera',
  'total shots': 'Tiros totales',
  'blocked shots': 'Tiros bloqueados',
  'shots insidebox': 'Tiros dentro del área',
  'shots inside box': 'Tiros dentro del área',
  'shots outsidebox': 'Tiros fuera del área',
  'shots outside box': 'Tiros fuera del área',
  'corner kicks': 'Córners',
  corners: 'Córners',
  'goalkeeper saves': 'Paradas del portero',
  saves: 'Paradas del portero',
  'total passes': 'Pases totales',
  'passes accurate': 'Pases precisos',
  'accurate passes': 'Pases precisos',
  'pass accuracy': 'Precisión de pases',
  fouls: 'Faltas',
  'yellow cards': 'Tarjetas amarillas',
  'red cards': 'Tarjetas rojas',
  'yellow card': 'Tarjetas amarillas',
  'red card': 'Tarjetas rojas',
  offsides: 'Fuera de juego',
  'expected goals': 'Goles esperados (xG)',
  xg: 'Goles esperados (xG)',
  attacks: 'Ataques',
  'dangerous attacks': 'Ataques peligrosos',
  'goal attempts': 'Intentos de gol',
  'free kicks': 'Tiros libres',
  'throw ins': 'Saques de banda',
  'goal kicks': 'Saques de meta',
};

/** Stats que siempre mostramos (aunque vengan vacías). */
export const PRIORITY_STAT_KEYS = [
  'shots on goal',
  'ball possession',
  'yellow cards',
  'red cards',
  'total shots',
  'corner kicks',
] as const;

export function translateStatName(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (STAT_LABELS[key]) return STAT_LABELS[key];
  for (const [en, es] of Object.entries(STAT_LABELS)) {
    if (key.includes(en) || en.includes(key)) return es;
  }
  return raw;
}

export function isPriorityStat(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  return PRIORITY_STAT_KEYS.some((p) => key === p || key.includes(p));
}

const TIMELINE_TYPE: Record<string, string> = {
  goal: 'Gol',
  card: 'Tarjeta',
  subst: 'Cambio',
  substitution: 'Cambio',
  var: 'VAR',
  pen: 'Penalti',
  penalty: 'Penalti',
};

const TIMELINE_DETAIL: Record<string, string> = {
  'normal goal': 'Gol',
  'own goal': 'Autogol',
  'penalty': 'Penalti',
  'missed penalty': 'Penalti fallado',
  'yellow card': 'Tarjeta amarilla',
  'red card': 'Tarjeta roja',
  'second yellow card': 'Doble amarilla',
  'substitution 1': 'Cambio',
  'substitution 2': 'Cambio',
  'substitution 3': 'Cambio',
  'substitution 4': 'Cambio',
  'substitution 5': 'Cambio',
};

export function translateTimelineType(raw: string): string {
  const key = raw.trim().toLowerCase();
  return TIMELINE_TYPE[key] ?? raw;
}

export function translateTimelineDetail(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (TIMELINE_DETAIL[key]) return TIMELINE_DETAIL[key];
  if (key.includes('yellow')) return 'Tarjeta amarilla';
  if (key.includes('red')) return 'Tarjeta roja';
  if (key.includes('own')) return 'Autogol';
  if (key.includes('penalty') && key.includes('miss')) return 'Penalti fallado';
  if (key.includes('penalty')) return 'Penalti';
  if (key.includes('goal')) return 'Gol';
  if (key.includes('subst')) return 'Cambio';
  return raw;
}

export function translateMatchStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  const map: Record<string, string> = {
    NS: 'No iniciado',
    TBD: 'Por definir',
    SCHEDULED: 'Programado',
    'NOT STARTED': 'No iniciado',
    LIVE: 'En vivo',
    '1H': '1ª parte',
    HT: 'Descanso',
    '2H': '2ª parte',
    ET: 'Prórroga',
    BT: 'Descanso prórroga',
    P: 'Penaltis',
    PEN: 'Penaltis',
    FT: 'Final',
    AET: 'Final (prórroga)',
    'AFTER PEN.': 'Final (penaltis)',
    FINISHED: 'Finalizado',
    POSTPONED: 'Aplazado',
    CANCELLED: 'Cancelado',
    SUSPENDED: 'Suspendido',
    AWARDED: 'Adjudicado',
  };
  return map[s] ?? raw;
}
