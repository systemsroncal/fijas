import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import {
  detectSport,
  formatFemeninoLabel,
  isJunkMatch,
  repairMisparsedMatch,
  type SportKind,
} from '@/lib/match-display';
import {
  addDaysYmd,
  isMatchStillOpenPeru,
  peruDateISO,
  resolveKickoffPeru,
} from '@/lib/timezone';

/**
 * Lista partidos con predicciones.
 * Horas convertidas a America/Lima (fuente scrape ≈ Europe/London).
 * Filtros: date, league, source, sport, limit, hideFinished.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const todayPeru = peruDateISO();
  const date = searchParams.get('date') ?? todayPeru;
  const league = searchParams.get('league');
  const source = searchParams.get('source');
  const sportFilter = (searchParams.get('sport') ?? '').trim().toLowerCase() as SportKind | '';
  const hideFinished = searchParams.get('hideFinished') !== '0';
  const limitRaw = Number(searchParams.get('limit') ?? 800);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 800, 50), 1500);

  // Ventana ±1 día: un kickoff UK puede caer en otro día calendario en Perú
  const fromYmd = addDaysYmd(date, -1);
  const toYmd = addDaysYmd(date, 1);
  const dayStart = new Date(`${fromYmd}T00:00:00.000Z`);
  const dayEnd = new Date(`${toYmd}T23:59:59.999Z`);

  const matches = await prisma.match.findMany({
    where: {
      matchDate: { gte: dayStart, lte: dayEnd },
      ...(league ? { league: { contains: league } } : {}),
      ...(source
        ? { predictions: { some: { source: { slug: source } } } }
        : {}),
    },
    include: {
      predictions: {
        include: { source: { select: { name: true, slug: true } } },
        orderBy: { scrapedAt: 'desc' },
        take: 5,
      },
    },
    orderBy: [{ matchDate: 'asc' }, { kickoff: 'asc' }, { league: 'asc' }],
    take: Math.min(limit * 2, 2000),
  });

  const now = new Date();
  const repaired = matches.map((m) => {
    const note = m.predictions.map((p) => p.statsNote).filter(Boolean).join(' ');
    const fixed = repairMisparsedMatch({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoff: m.kickoff,
      league: m.league,
    });
    const storedYmd = peruDateISO(new Date(m.matchDate));
    // matchDate en DB a menudo es medianoche UTC del día scrapeado
    const baseYmd = m.matchDate
      ? `${m.matchDate.getUTCFullYear()}-${String(m.matchDate.getUTCMonth() + 1).padStart(2, '0')}-${String(m.matchDate.getUTCDate()).padStart(2, '0')}`
      : storedYmd;
    const resolved = resolveKickoffPeru({
      matchDateYmd: baseYmd,
      kickoff: fixed.kickoff ?? m.kickoff,
    });

    return {
      ...m,
      homeTeam: formatFemeninoLabel(fixed.homeTeam),
      awayTeam: formatFemeninoLabel(fixed.awayTeam),
      league: formatFemeninoLabel(m.league),
      kickoff: resolved.kickoffPeru ?? fixed.kickoff ?? m.kickoff,
      kickoffSource: fixed.kickoff ?? m.kickoff,
      kickoffTz: 'America/Lima',
      matchDatePeru: resolved.matchDatePeru,
      sport: detectSport(m.league, note),
      _baseYmd: baseYmd,
    };
  });

  const seen = new Set<string>();
  const filtered = repaired.filter((m) => {
    if (isJunkMatch(m.homeTeam, m.awayTeam)) return false;
    // Solo partidos cuyo día (en Perú) coincide con el filtro
    if (m.matchDatePeru !== date) return false;

    if (
      hideFinished &&
      date === todayPeru &&
      !isMatchStillOpenPeru({
        matchDateYmd: m._baseYmd,
        kickoff: m.kickoffSource,
        now,
        isLive: m.isLive,
      })
    ) {
      return false;
    }
    if (sportFilter && m.sport !== sportFilter) return false;
    const key = `${m.homeTeam}|${m.awayTeam}|${m.league}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Ordenar por hora Perú
  filtered.sort((a, b) => (a.kickoff ?? '99').localeCompare(b.kickoff ?? '99'));

  const sports = Array.from(new Set(filtered.map((m) => m.sport))).sort();

  return NextResponse.json({
    matches: filtered.map(({ _baseYmd, kickoffSource, ...rest }) => rest),
    total: filtered.length,
    sports,
    timezone: 'America/Lima',
    today: todayPeru,
    updating: false,
  });
}
