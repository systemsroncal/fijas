import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import {
  formatFemeninoLabel,
  isJunkMatch,
  repairMisparsedMatch,
} from '@/lib/match-display';
import { addDaysYmd, hasKickoffTime, peruDateISO } from '@/lib/timezone';
import {
  eventsOnDay,
  findEventInDayList,
  type SportsDbEvent,
} from '@/lib/sportsdb/client';
import {
  eventKickoffAt,
  resolveEventKickoffPeru,
  shouldPreferSportsDbKickoff,
} from '@/lib/sportsdb/kickoff';
import { resolveEventId } from '@/lib/sportsdb/match-status';

/**
 * Enriquecimiento opcional (background): rellena horas faltantes / FIFA
 * desde TheSportsDB sin bloquear el listado principal.
 * Guarda kickoff como ISO UTC para no doble-convertir.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const date = body.date?.trim() || peruDateISO();
  const fromYmd = addDaysYmd(date, -1);
  const toYmd = addDaysYmd(date, 1);
  const dayStart = new Date(`${fromYmd}T00:00:00.000Z`);
  const dayEnd = new Date(`${toYmd}T23:59:59.999Z`);

  const matches = await prisma.match.findMany({
    where: { matchDate: { gte: dayStart, lte: dayEnd } },
    select: {
      id: true,
      matchDate: true,
      kickoff: true,
      homeTeam: true,
      awayTeam: true,
      league: true,
    },
    take: 400,
  });

  const dayEvents: SportsDbEvent[] = [];
  for (const ymd of [fromYmd, date, toYmd]) {
    const [soccer, any] = await Promise.all([
      eventsOnDay(ymd, 'Soccer'),
      eventsOnDay(ymd),
    ]);
    dayEvents.push(...soccer, ...any);
  }

  let updated = 0;
  let lookups = 0;
  const MAX_LOOKUPS = 8;

  for (const m of matches) {
    const fixed = repairMisparsedMatch({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoff: m.kickoff,
      league: m.league,
    });
    const home = formatFemeninoLabel(fixed.homeTeam);
    const away = formatFemeninoLabel(fixed.awayTeam);
    if (isJunkMatch(home, away)) continue;

    const alreadyIso = /^\d{4}-\d{2}-\d{2}T/.test(m.kickoff?.trim() || '');
    const needs =
      !alreadyIso &&
      (!hasKickoffTime(fixed.kickoff ?? m.kickoff) ||
        shouldPreferSportsDbKickoff(m.league));
    if (!needs) continue;

    let event = findEventInDayList(dayEvents, home, away);
    if (!event && lookups < MAX_LOOKUPS) {
      lookups += 1;
      const baseYmd = `${m.matchDate.getUTCFullYear()}-${String(m.matchDate.getUTCMonth() + 1).padStart(2, '0')}-${String(m.matchDate.getUTCDate()).padStart(2, '0')}`;
      const resolved = await resolveEventId({
        homeTeam: home,
        awayTeam: away,
        matchDateYmd: baseYmd,
        sportKind: 'football',
      });
      event = resolved.event;
      if (event) dayEvents.push(event);
    }
    if (!event) continue;

    const at = eventKickoffAt(event) ?? resolveEventKickoffPeru(event).kickoffAt;
    if (!at) continue;

    await prisma.match.update({
      where: { id: m.id },
      data: { kickoff: at.toISOString() },
    });
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated, lookups, date });
}
