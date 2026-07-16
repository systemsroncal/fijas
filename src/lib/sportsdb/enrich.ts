/**
 * Enrich profundo de un partido: scrapers (ya en BD) + TheSportsDB (solo análisis).
 * Minimiza requests: eventsday cacheado + eventslast con idTeam del evento.
 * Docs: https://www.thesportsdb.com/documentation
 */

import { summarizeTeamForm } from '@/lib/ai/form-stats';
import type {
  FormMatchRow,
  StructuredMatchPayload,
  TeamFormBlock,
} from '@/lib/ai/analysis-types';
import {
  eventsOnDay,
  findEventInDayList,
  lastEventsForTeam,
  lookupTeam,
  searchEvent,
  searchTeam,
  sportApiLabel,
  type SportsDbEvent,
  type SportsDbTeam,
} from '@/lib/sportsdb/client';
import { localDateISO } from '@/lib/local-date';
import {
  detectTeamCategory,
  isOutlierFootballScore,
  sanitizeFormRows,
} from '@/lib/team-identity';

export type SportsDbDeepContext = {
  source: 'thesportsdb';
  usedRequestsEstimate: number;
  matchedEvent: {
    id?: string;
    label?: string;
    league?: string;
    date?: string;
    score?: string | null;
  } | null;
  home: {
    id?: string;
    name?: string;
    badge?: string | null;
    recent: Array<{ label: string; score: string | null; date?: string }>;
  };
  away: {
    id?: string;
    name?: string;
    badge?: string | null;
    recent: Array<{ label: string; score: string | null; date?: string }>;
  };
  notes: string[];
};

function eventScore(ev: SportsDbEvent): string | null {
  if (ev.intHomeScore == null || ev.intAwayScore == null) return null;
  if (ev.intHomeScore === '' || ev.intAwayScore === '') return null;
  return `${ev.intHomeScore}-${ev.intAwayScore}`;
}

function mapLastEvents(
  events: SportsDbEvent[],
  opts?: { league?: string | null; targetCategory?: ReturnType<typeof detectTeamCategory> }
) {
  const target = opts?.targetCategory ?? 'senior_men';
  return events
    .filter((ev) => {
      const league = ev.strLeague ?? opts?.league ?? '';
      const home = ev.strHomeTeam ?? '';
      const away = ev.strAwayTeam ?? '';
      const cat = detectTeamCategory(`${home} ${away}`, league);
      if (target === 'senior_men' && (cat === 'senior_women' || cat === 'youth' || cat === 'reserve')) {
        return false;
      }
      if (target !== 'senior_men' && cat !== target && cat !== 'unknown') return false;
      const score = eventScore(ev);
      if (isOutlierFootballScore(score)) return false;
      return true;
    })
    .slice(0, 5)
    .map((ev) => ({
      label: ev.strEvent ?? `${ev.strHomeTeam ?? '?'} vs ${ev.strAwayTeam ?? '?'}`,
      score: eventScore(ev),
      date: ev.dateEvent,
    }));
}

function fallbackForm(): TeamFormBlock {
  return {
    available: false,
    message:
      'Sin marcadores históricos en la base. No se inventan resultados de los últimos partidos.',
    recentScores: [],
    avgGoalsFor: null,
    avgGoalsAgainst: null,
    avgGoalsTotal: null,
    cardsTotal: null,
    avgCards: null,
    sampleSize: 0,
    rows: [],
    h2h: [],
    homeSeason: [],
    awaySeason: [],
  };
}

/**
 * Análisis profundo de contexto externo (TheSportsDB).
 * Preferencia: 1) eventsday (1 req/día cacheado) 2) ids del evento 3) eventslast ×2.
 * Evita searchteams en free (casi inutilizable) salvo que no haya match.
 */
export async function enrichMatchFromSportsDb(input: {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  matchDateYmd?: string;
  sportKind?: string;
  /** Si false, no hace lookupteam (ahorra 2 req en combinadas). */
  fetchBadges?: boolean;
}): Promise<{
  sportsDb: SportsDbDeepContext;
  formPatch: Partial<TeamFormBlock>;
  homeCrestUrl: string | null;
  awayCrestUrl: string | null;
}> {
  const notes: string[] = [
    'Análisis profundo: scraping (tips/cuotas) + TheSportsDB (calendario/forma) + modelo Poisson.',
  ];
  let used = 0;
  const date = input.matchDateYmd ?? localDateISO();
  const sport = sportApiLabel(input.sportKind);
  const fetchBadges = input.fetchBadges !== false;
  const targetCategory = detectTeamCategory(
    `${input.homeTeam} ${input.awayTeam}`,
    input.league
  );
  const mapOpts = { league: input.league, targetCategory };

  // 1) Eventos del día (cacheados → casi gratis en análisis sucesivos)
  used += 1;
  let dayEvents = await eventsOnDay(date, sport);
  if (!dayEvents.length && sport) {
    used += 1;
    dayEvents = await eventsOnDay(date);
  }

  let matched = findEventInDayList(dayEvents, input.homeTeam, input.awayTeam);
  if (!matched) {
    used += 1;
    matched = await searchEvent(input.homeTeam, input.awayTeam);
    if (matched) notes.push('Evento cruzado vía searchevents (TheSportsDB).');
    else notes.push('Sin evento TheSportsDB para este par (nombres o límite free).');
  } else {
    notes.push('Evento cruzado con calendario del día (TheSportsDB eventsday).');
  }

  const homeId = matched?.idHomeTeam;
  const awayId = matched?.idAwayTeam;

  let homeTeam: SportsDbTeam | null = null;
  let awayTeam: SportsDbTeam | null = null;
  let homeRecent: ReturnType<typeof mapLastEvents> = [];
  let awayRecent: ReturnType<typeof mapLastEvents> = [];

  // Free V1: searchteams.php?t=Name funciona con key 123 (ej. Arsenal)
  if (homeId) {
    used += 1;
    homeRecent = mapLastEvents(await lastEventsForTeam(homeId), mapOpts);
    if (fetchBadges) {
      used += 1;
      homeTeam = await lookupTeam(homeId);
    }
  } else {
    used += 1;
    homeTeam = await searchTeam(input.homeTeam);
    if (homeTeam?.idTeam) {
      used += 1;
      homeRecent = mapLastEvents(await lastEventsForTeam(homeTeam.idTeam), mapOpts);
      notes.push(`Local resuelto vía searchteams free («${homeTeam.strTeam}»).`);
    } else {
      notes.push(`Sin equipo TheSportsDB free para local «${input.homeTeam}».`);
    }
  }

  if (awayId) {
    used += 1;
    awayRecent = mapLastEvents(await lastEventsForTeam(awayId), mapOpts);
    if (fetchBadges) {
      used += 1;
      awayTeam = await lookupTeam(awayId);
    }
  } else {
    used += 1;
    awayTeam = await searchTeam(input.awayTeam);
    if (awayTeam?.idTeam) {
      used += 1;
      awayRecent = mapLastEvents(await lastEventsForTeam(awayTeam.idTeam), mapOpts);
      notes.push(`Visitante resuelto vía searchteams free («${awayTeam.strTeam}»).`);
    } else {
      notes.push(`Sin equipo TheSportsDB free para visitante «${input.awayTeam}».`);
    }
  }

  const scoredHome = homeRecent.filter((r) => r.score);
  const scoredAway = awayRecent.filter((r) => r.score);
  const allScores = [...scoredHome, ...scoredAway].map((r) => r.score!);

  let avgGoalsTotal: number | null = null;
  if (allScores.length) {
    const totals = allScores.map((s) => {
      const [a, b] = s.split('-').map(Number);
      return (a || 0) + (b || 0);
    });
    avgGoalsTotal =
      Math.round((totals.reduce((x, y) => x + y, 0) / totals.length) * 100) / 100;
  }

  const rows: FormMatchRow[] = sanitizeFormRows(
    [...homeRecent, ...awayRecent]
      .filter((r) => r.score)
      .map((r, i) => ({
        matchId: `sportsdb-${i}-${r.date ?? i}`,
        label: r.label,
        date: r.date ?? date,
        score: r.score,
        tip: null,
      })),
    input.homeTeam,
    input.awayTeam,
    input.league
  ).slice(0, 10);

  const formPatch: Partial<TeamFormBlock> =
    rows.length > 0
      ? {
          available: true,
          message: `Forma reciente TheSportsDB (${rows.length} marcadores reales). Combinado con tips scrapeados.`,
          recentScores: rows.map((r) => r.score!).filter(Boolean),
          avgGoalsTotal,
          sampleSize: rows.length,
          rows,
        }
      : {
          available: false,
          message:
            'TheSportsDB no devolvió marcadores recientes (límite free o sin match). Se mantiene scraping + modelo.',
        };

  const sportsDb: SportsDbDeepContext = {
    source: 'thesportsdb',
    usedRequestsEstimate: used,
    matchedEvent: matched
      ? {
          id: matched.idEvent,
          label: matched.strEvent,
          league: matched.strLeague,
          date: matched.dateEvent,
          score: eventScore(matched),
        }
      : null,
    home: {
      id: homeTeam?.idTeam ?? homeId,
      name: homeTeam?.strTeam ?? matched?.strHomeTeam,
      badge: homeTeam?.strBadge ?? null,
      recent: homeRecent,
    },
    away: {
      id: awayTeam?.idTeam ?? awayId,
      name: awayTeam?.strTeam ?? matched?.strAwayTeam,
      badge: awayTeam?.strBadge ?? null,
      recent: awayRecent,
    },
    notes,
  };

  return {
    sportsDb,
    formPatch,
    homeCrestUrl: homeTeam?.strBadge ?? null,
    awayCrestUrl: awayTeam?.strBadge ?? null,
  };
}

export function mergeFormWithSportsDb(
  scraped: TeamFormBlock | undefined,
  patch: Partial<TeamFormBlock>,
  ctx?: { homeTeam?: string; awayTeam?: string; league?: string | null }
): TeamFormBlock {
  const base = scraped ?? fallbackForm();
  if (!patch.available && !base.available) {
    return {
      ...base,
      message: patch.message ?? base.message,
    };
  }

  const mergedRows = sanitizeFormRows(
    [...(patch.rows ?? []), ...(base.rows ?? [])],
    ctx?.homeTeam ?? '',
    ctx?.awayTeam ?? '',
    ctx?.league
  ).slice(0, 12);

  const recentScores = mergedRows.map((r) => r.score!).filter(Boolean).slice(0, 12);

  const h2h =
    ctx?.homeTeam && ctx?.awayTeam
      ? sanitizeFormRows(
          [...(base.h2h ?? []), ...(patch.h2h ?? [])],
          ctx.homeTeam,
          ctx.awayTeam,
          ctx.league
        ).slice(0, 8)
      : [...(base.h2h ?? []), ...(patch.h2h ?? [])].slice(0, 8);

  const homeSeason =
    ctx?.homeTeam && ctx?.awayTeam
      ? sanitizeFormRows(
          [...(base.homeSeason ?? []), ...(patch.homeSeason ?? [])],
          ctx.homeTeam,
          ctx.awayTeam,
          ctx.league
        ).slice(0, 8)
      : [...(base.homeSeason ?? []), ...(patch.homeSeason ?? [])].slice(0, 8);

  const awaySeason =
    ctx?.homeTeam && ctx?.awayTeam
      ? sanitizeFormRows(
          [...(base.awaySeason ?? []), ...(patch.awaySeason ?? [])],
          ctx.homeTeam,
          ctx.awayTeam,
          ctx.league
        ).slice(0, 8)
      : [...(base.awaySeason ?? []), ...(patch.awaySeason ?? [])].slice(0, 8);

  return {
    ...base,
    available: Boolean(recentScores.length || base.available),
    message:
      patch.available && base.available
        ? 'Historia TheSportsDB + marcadores scrapeados. Forma reciente pesa más que H2H.'
        : patch.message ?? base.message,
    recentScores,
    avgGoalsTotal: patch.avgGoalsTotal ?? base.avgGoalsTotal,
    sampleSize: Math.max(recentScores.length, base.sampleSize),
    rows: mergedRows,
    h2h,
    homeSeason,
    awaySeason,
    homeForm:
      ctx?.homeTeam && homeSeason.length
        ? summarizeTeamForm(homeSeason, ctx.homeTeam, {
            maxRows: 8,
            leagueHint: ctx.league,
            excludeOpponent: ctx.awayTeam,
          })
        : base.homeForm ?? null,
    awayForm:
      ctx?.awayTeam && awaySeason.length
        ? summarizeTeamForm(awaySeason, ctx.awayTeam, {
            maxRows: 8,
            leagueHint: ctx.league,
            excludeOpponent: ctx.homeTeam,
          })
        : base.awayForm ?? null,
  };
}

/** Aplica TheSportsDB a un payload de análisis (partido / aleatorio / pierna). */
export async function applySportsDbToPayload(
  payload: StructuredMatchPayload,
  opts?: {
    matchDateYmd?: string;
    fetchBadges?: boolean;
  }
): Promise<StructuredMatchPayload> {
  const match = payload.match;
  if (!match?.homeTeam || !match?.awayTeam) {
    return { ...payload, deepAnalysis: true };
  }

  try {
    const enriched = await enrichMatchFromSportsDb({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      sportKind: match.sport,
      matchDateYmd: opts?.matchDateYmd,
      fetchBadges: opts?.fetchBadges,
    });
    return {
      ...payload,
      deepAnalysis: true,
      sportsDb: enriched.sportsDb,
      form: mergeFormWithSportsDb(payload.form, enriched.formPatch, {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.league,
      }),
      match: {
        ...match,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.league ?? '',
        homeCrestUrl: enriched.homeCrestUrl ?? match.homeCrestUrl,
        awayCrestUrl: enriched.awayCrestUrl ?? match.awayCrestUrl,
      },
      edgeSummary: `${payload.edgeSummary} · Contexto TheSportsDB: ${
        enriched.sportsDb.matchedEvent?.label ?? 'sin evento exacto'
      } (${enriched.sportsDb.usedRequestsEstimate} req est.).`,
    };
  } catch {
    return {
      ...payload,
      deepAnalysis: true,
      sportsDb: {
        source: 'thesportsdb',
        usedRequestsEstimate: 0,
        matchedEvent: null,
        home: { recent: [] },
        away: { recent: [] },
        notes: [
          'TheSportsDB no disponible en este momento. Análisis profundo solo con scraping + modelo.',
        ],
      },
    };
  }
}
