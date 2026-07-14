/**
 * Diagnósticos por jugador / equipo a partir de timeline + stats TheSportsDB.
 * Free V1 no trae tackles/tiros por jugador Opta; se deriva lo posible.
 */

import type { MatchStatusPayload } from '@/lib/sportsdb/match-status';

export type PlayerDiagnostic = {
  player: string;
  team: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  /** Mínimo de tiros a puerta inferidos (1 por gol) */
  shotsOnTargetMin: number;
};

export type TeamDiagnostic = {
  name: string;
  value: string;
};

export type MatchDiagnostics = {
  phase: string;
  score: string | null;
  statusLabel: string | null;
  venue: string | null;
  kickoffPeru: string | null;
  teamStats: TeamDiagnostic[];
  players: PlayerDiagnostic[];
  notes: string[];
};

function parseNum(v: string): number | null {
  const n = Number(String(v).replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

/** Extrae métricas de equipo útiles para la IA y la UI. */
export function teamStatsFromStatus(status: MatchStatusPayload): TeamDiagnostic[] {
  const want = [
    /posesi|possession/i,
    /tiros a puerta|shots on/i,
    /tiros totales|total shots/i,
    /tiros fuera|shots off/i,
    /c[oó]rner|corner/i,
    /faltas|fouls/i,
    /amarillas|yellow/i,
    /rojas|red card/i,
    /ataques peligros|dangerous attack/i,
    /ataques$|attacks$/i,
    /paradas|saves/i,
    /xG|goles esperados|expected goals/i,
    /pases|passes/i,
    /fuera de juego|offside/i,
  ];
  const out: TeamDiagnostic[] = [];
  for (const re of want) {
    const hit = status.stats.find((s) => re.test(s.name) || (s.key ? re.test(s.key) : false));
    if (!hit) continue;
    if (out.some((x) => x.name === hit.name)) continue;
    out.push({
      name: hit.name,
      value: `${hit.home} – ${hit.away}`,
    });
  }
  return out;
}

/** Agrega goles / asistencias / tarjetas por jugador desde la cronología. */
export function playerDiagnosticsFromTimeline(
  status: MatchStatusPayload
): PlayerDiagnostic[] {
  const map = new Map<string, PlayerDiagnostic>();

  const upsert = (player: string, team: string) => {
    const key = `${player.toLowerCase()}|${team.toLowerCase()}`;
    let row = map.get(key);
    if (!row) {
      row = {
        player,
        team,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        shotsOnTargetMin: 0,
      };
      map.set(key, row);
    }
    return row;
  };

  for (const t of status.timeline) {
    const type = `${t.type} ${t.detail}`.toLowerCase();
    const player = (t.player || '').trim();
    const team = (t.team || '').trim() || '—';
    if (!player) continue;

    const row = upsert(player, team);
    const isGoal =
      /\bgol\b|goal|penalti|penalty/.test(type) &&
      !/fallad|missed|own|autogol/.test(type);
    const isOwn = /autogol|own goal/.test(type);
    if (isGoal && !isOwn) {
      row.goals += 1;
      row.shotsOnTargetMin += 1;
    }
    if (t.assist?.trim()) {
      const a = upsert(t.assist.trim(), team);
      a.assists += 1;
    }
    if (/amarilla|yellow/.test(type) && !/segunda|second/.test(type)) {
      row.yellowCards += 1;
    }
    if (/roja|red card|second yellow|segunda amarilla/.test(type)) {
      row.redCards += 1;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      b.goals - a.goals ||
      b.assists - a.assists ||
      b.yellowCards - a.yellowCards ||
      a.player.localeCompare(b.player)
  );
}

export function buildMatchDiagnostics(status: MatchStatusPayload): MatchDiagnostics {
  const teamStats = teamStatsFromStatus(status);
  const players = playerDiagnosticsFromTimeline(status);
  const notes: string[] = [
    'Stats de equipo: TheSportsDB lookupeventstats (free).',
    'Por jugador: goles/asistencias/tarjetas desde cronología; tiros a puerta = mínimo 1 por gol (API free no da Opta por jugador).',
    'Tackles por jugador no están disponibles en TheSportsDB free V1.',
  ];
  if (!teamStats.length) {
    notes.push('Sin estadísticas de equipo para este partido (aún no iniciada o no indexada).');
  }

  // Validar números de córners/tiros para notas
  const corners = status.stats.find((s) => /corner|córner/i.test(s.name));
  if (corners) {
    const h = parseNum(corners.home);
    const a = parseNum(corners.away);
    if (h != null && a != null) {
      notes.push(`Córners totales partido: ${h + a} (${corners.home}-${corners.away}).`);
    }
  }

  return {
    phase: status.phase,
    score: status.score,
    statusLabel: status.statusLabel ?? status.status,
    venue: status.venue,
    kickoffPeru: status.kickoffPeru,
    teamStats,
    players,
    notes,
  };
}
