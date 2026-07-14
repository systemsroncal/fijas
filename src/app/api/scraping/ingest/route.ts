import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { validateApiSecret } from '@/lib/api-guard';
import { buildMatchKey } from '@/lib/match-key';
import { isJunkMatch, repairMisparsedMatch } from '@/lib/match-display';
import { LogCategory, Prisma } from '@prisma/client';

const predictionSchema = z.object({
  externalId: z.string().nullish(),
  matchDate: z.string(),
  // Scrapers envían null cuando no hay hora (optional solo admite undefined)
  kickoff: z.string().nullish(),
  league: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  betType: z.string().default('1X2'),
  betChoice: z.string().nullish(),
  odds: z.number().nullish(),
  oddsHome: z.number().nullish(),
  oddsDraw: z.number().nullish(),
  oddsAway: z.number().nullish(),
  oddsOver: z.number().nullish(),
  oddsUnder: z.number().nullish(),
  oddsBttsYes: z.number().nullish(),
  oddsBttsNo: z.number().nullish(),
  statsNote: z.string().nullish(),
  isLive: z.boolean().nullish(),
});

const bodySchema = z.object({
  sourceSlug: z.string(),
  predictions: z.array(predictionSchema).default([]),
  suggestedAccumulators: z
    .array(
      z.object({
        title: z.string(),
        totalOdds: z.number(),
        matchDate: z.string(),
        legs: z.array(z.record(z.unknown())),
      })
    )
    .optional(),
});

/**
 * Ingesta de datos del scraper (protegido con API_SECRET).
 */
export async function POST(request: Request) {
  if (!validateApiSecret(request)) {
    return NextResponse.json({ error: 'Invalid API secret' }, { status: 401 });
  }

  try {
    const json = await request.json();
    const data = bodySchema.parse(json);

    const source = await prisma.scrapingSource.findUnique({
      where: { slug: data.sourceSlug },
    });
    if (!source) {
      return NextResponse.json({ error: `Unknown source: ${data.sourceSlug}` }, { status: 404 });
    }

    await prisma.scrapingSource.update({
      where: { id: source.id },
      data: { scrapingStatus: 'RUNNING' },
    });

    let inserted = 0;

    for (const pred of data.predictions) {
      const fixed = repairMisparsedMatch({
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        kickoff: pred.kickoff,
        league: pred.league,
      });
      const homeTeam = fixed.homeTeam;
      const awayTeam = fixed.awayTeam;
      const kickoffRaw = fixed.kickoff ?? pred.kickoff ?? null;
      const kickoff = kickoffRaw?.trim() ? kickoffRaw.trim() : null;

      // No persistir basura tipo "14/07" vs "France Vs Spain"
      if (isJunkMatch(homeTeam, awayTeam)) {
        continue;
      }

      const matchDate = new Date(pred.matchDate);
      const matchKey = buildMatchKey(matchDate, homeTeam, awayTeam, pred.league);

      const match = await prisma.match.upsert({
        where: { matchKey },
        create: {
          matchKey,
          matchDate,
          kickoff,
          league: pred.league,
          homeTeam,
          awayTeam,
          isLive: pred.isLive ?? false,
        },
        update: {
          kickoff,
          homeTeam,
          awayTeam,
          isLive: pred.isLive ?? false,
        },
      });

      await prisma.scrapedPrediction.create({
        data: {
          sourceId: source.id,
          matchId: match.id,
          externalId: pred.externalId,
          betType: pred.betType,
          betChoice: pred.betChoice ?? 'N/A',
          odds: pred.odds != null ? new Prisma.Decimal(pred.odds) : null,
          oddsHome: pred.oddsHome != null ? new Prisma.Decimal(pred.oddsHome) : null,
          oddsDraw: pred.oddsDraw != null ? new Prisma.Decimal(pred.oddsDraw) : null,
          oddsAway: pred.oddsAway != null ? new Prisma.Decimal(pred.oddsAway) : null,
          oddsOver: pred.oddsOver != null ? new Prisma.Decimal(pred.oddsOver) : null,
          oddsUnder: pred.oddsUnder != null ? new Prisma.Decimal(pred.oddsUnder) : null,
          oddsBttsYes: pred.oddsBttsYes != null ? new Prisma.Decimal(pred.oddsBttsYes) : null,
          oddsBttsNo: pred.oddsBttsNo != null ? new Prisma.Decimal(pred.oddsBttsNo) : null,
          statsNote: pred.statsNote,
          isLive: pred.isLive ?? false,
        },
      });
      inserted += 1;
    }

    if (data.suggestedAccumulators?.length) {
      for (const acc of data.suggestedAccumulators) {
        await prisma.suggestedAccumulator.create({
          data: {
            sourceSlug: data.sourceSlug,
            title: acc.title,
            totalOdds: new Prisma.Decimal(acc.totalOdds),
            matchDate: new Date(acc.matchDate),
            legsJson: acc.legs as Prisma.InputJsonValue,
          },
        });
      }
    }

    await prisma.scrapingSource.update({
      where: { id: source.id },
      data: {
        scrapingStatus: 'SUCCESS',
        lastScraped: new Date(),
        lastError: null,
      },
    });

    await prisma.systemLog.create({
      data: {
        category: LogCategory.SCRAPING,
        message: `Ingest ${data.sourceSlug}: ${inserted} predictions`,
        meta: { inserted, sourceSlug: data.sourceSlug },
      },
    });

    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Ingest failed';
    await prisma.systemLog.create({
      data: {
        category: LogCategory.SCRAPING,
        level: 'error',
        message,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
