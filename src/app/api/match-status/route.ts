import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { fetchMatchStatus } from '@/lib/sportsdb/match-status';
import { localDateISO } from '@/lib/local-date';
import { repairMisparsedMatch } from '@/lib/match-display';
import { hasKickoffTime } from '@/lib/timezone';

const querySchema = z.object({
  matchId: z.string().optional(),
  eventId: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  date: z.string().optional(),
  sport: z.string().optional(),
  details: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v !== '0' && v !== 'false'),
});

/**
 * GET /api/match-status
 * Marcador + stats + timeline (TheSportsDB free V1). Para live y finalizados.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const q = querySchema.parse(raw);

    let homeTeam = q.homeTeam;
    let awayTeam = q.awayTeam;
    let matchDateYmd = q.date;
    let sportKind = q.sport;
    let scrapeIsLive = false;
    let eventId = q.eventId;
    let matchId: string | null = q.matchId ?? null;
    let storedKickoff: string | null = null;

    if (q.matchId) {
      const match = await prisma.match.findUnique({
        where: { id: q.matchId },
      });
      if (!match) {
        return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
      }
      const fixed = repairMisparsedMatch({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoff: match.kickoff,
        league: match.league,
      });
      homeTeam = fixed.homeTeam;
      awayTeam = fixed.awayTeam;
      storedKickoff = fixed.kickoff ?? match.kickoff;
      matchDateYmd =
        matchDateYmd ??
        (match.matchDate ? localDateISO(new Date(match.matchDate)) : localDateISO());
      scrapeIsLive = Boolean(match.isLive);
    }

    if (!eventId && !homeTeam && !awayTeam) {
      return NextResponse.json(
        { error: 'matchId, eventId o homeTeam+awayTeam requerido' },
        { status: 400 }
      );
    }

    const status = await fetchMatchStatus({
      eventId,
      homeTeam,
      awayTeam,
      matchDateYmd,
      sportKind,
      scrapeIsLive,
      includeDetails: q.details !== false,
    });

    // Si el scrape no trajo hora, persistir la de TheSportsDB (misma fuente que stats en vivo)
    if (
      matchId &&
      status.kickoffPeru &&
      !hasKickoffTime(storedKickoff)
    ) {
      await prisma.match.update({
        where: { id: matchId },
        data: { kickoff: status.kickoffPeru },
      });
    }

    return NextResponse.json({ status });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al obtener estado' },
      { status: 500 }
    );
  }
}
