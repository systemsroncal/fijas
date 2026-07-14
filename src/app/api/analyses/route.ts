import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AiProvider, AnalysisMode, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { decryptSecret } from '@/lib/encryption';
import {
  buildAccumulatorStructuredPayload,
  buildModelPayload,
  buildRandomScannerPayload,
  emptyForm,
  enrichPayloadWithLlm,
  StructuredMatchPayload,
} from '@/lib/ai/structured-analysis';
import { MatchContext } from '@/lib/ai/football-model';
import {
  extractScoreFromText,
  isJunkMatch,
  repairMisparsedMatch,
} from '@/lib/match-display';
import { isMatchStillOpen, localDateISO } from '@/lib/local-date';
import type { FormMatchRow, TeamFormBlock } from '@/lib/ai/analysis-types';
import { applySportsDbToPayload } from '@/lib/sportsdb/enrich';
import { fetchMatchStatus } from '@/lib/sportsdb/match-status';

const schema = z
  .object({
    mode: z.enum(['MATCH', 'ACCUMULATOR', 'RANDOM']).default('ACCUMULATOR'),
    accumulatorId: z.string().optional(),
    suggestedId: z.string().optional(),
    matchId: z.string().optional(),
    provider: z.nativeEnum(AiProvider),
    enrich: z.boolean().optional().default(true),
    /** Permite reanalizar una combinada ya marcada isAnalyzed */
    force: z.boolean().optional().default(false),
  })
  .refine(
    (b) =>
      b.mode === 'RANDOM' ||
      Boolean(b.accumulatorId || b.suggestedId || b.matchId),
    { message: 'matchId, accumulatorId o suggestedId requerido (salvo RANDOM)' }
  );

type LegJson = {
  home?: string;
  away?: string;
  league?: string;
  betChoice?: string;
  odds?: number;
  label?: string;
};

function toCtx(m: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff?: string | null;
  predictions?: Array<{
    betChoice?: string | null;
    oddsHome?: Prisma.Decimal | null;
    oddsDraw?: Prisma.Decimal | null;
    oddsAway?: Prisma.Decimal | null;
    oddsOver?: Prisma.Decimal | null;
    oddsUnder?: Prisma.Decimal | null;
    statsNote?: string | null;
  }>;
}): MatchContext & { id: string } {
  const fixed = repairMisparsedMatch({
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    kickoff: m.kickoff,
    league: m.league,
  });
  const p = m.predictions?.[0];
  return {
    id: m.id,
    homeTeam: fixed.homeTeam,
    awayTeam: fixed.awayTeam,
    league: m.league,
    tip: p?.betChoice,
    oddsHome: p?.oddsHome != null ? Number(p.oddsHome) : null,
    oddsDraw: p?.oddsDraw != null ? Number(p.oddsDraw) : null,
    oddsAway: p?.oddsAway != null ? Number(p.oddsAway) : null,
    oddsOver: p?.oddsOver != null ? Number(p.oddsOver) : null,
    oddsUnder: p?.oddsUnder != null ? Number(p.oddsUnder) : null,
  };
}

function scoresFromPayload(payload: StructuredMatchPayload) {
  const bestEdge = Math.max(...payload.markets.map((m) => m.edge), 0);
  return {
    riskScore: Math.round((10 - payload.confidence / 10) * 10) / 10,
    evScore: Math.round(bestEdge * 1000) / 1000,
    recommendedStake: Math.min(10, Math.max(1, Math.round(payload.confidence / 12))),
  };
}

/**
 * Forma reciente SOLO con marcadores reales extraídos de statsNote / historial BD.
 */
async function loadTeamForm(homeTeam: string, awayTeam: string): Promise<TeamFormBlock> {
  const history = await prisma.match.findMany({
    where: {
      OR: [
        { homeTeam },
        { awayTeam },
        { homeTeam: homeTeam },
        { awayTeam: awayTeam },
        { homeTeam: { equals: homeTeam } },
        { awayTeam: { equals: awayTeam } },
      ],
    },
    include: {
      predictions: { orderBy: { scrapedAt: 'desc' }, take: 2 },
    },
    orderBy: { matchDate: 'desc' },
    take: 40,
  });

  const rows: FormMatchRow[] = [];
  const goalSamples: number[] = [];
  let cardsTotal = 0;
  let cardsSamples = 0;

  for (const m of history) {
    if (isJunkMatch(m.homeTeam, m.awayTeam)) continue;
    const note = m.predictions.map((p) => p.statsNote).filter(Boolean).join(' ');
    const score = extractScoreFromText(note) ?? extractScoreFromText(m.kickoff);
    const tip = m.predictions[0]?.betChoice ?? null;
    rows.push({
      matchId: m.id,
      label: `${m.homeTeam} vs ${m.awayTeam}`,
      date: m.matchDate.toISOString().slice(0, 10),
      score,
      tip,
    });
    if (score) {
      const [a, b] = score.split('-').map(Number);
      if (!Number.isNaN(a) && !Number.isNaN(b)) goalSamples.push(a + b);
    }
    const cardMatch = note.match(/(\d+)\s*( tarjetas|cards)/i);
    if (cardMatch) {
      cardsTotal += Number(cardMatch[1]);
      cardsSamples += 1;
    }
  }

  const withScore = rows.filter((r) => r.score).slice(0, 10);
  if (withScore.length === 0) {
    return emptyForm(
      rows.length > 0
        ? `Hay ${rows.length} partidos registrados de estos equipos, pero sin marcador scrapeado. No se inventan resultados.`
        : undefined
    );
  }

  const avgGoalsTotal =
    goalSamples.length > 0
      ? Math.round((goalSamples.reduce((s, n) => s + n, 0) / goalSamples.length) * 100) / 100
      : null;

  return {
    available: true,
    message: `Historial real: ${withScore.length} marcadores scrapeados (máx. 10).`,
    recentScores: withScore.map((r) => r.score!).slice(0, 10),
    avgGoalsFor: null,
    avgGoalsAgainst: null,
    avgGoalsTotal,
    cardsTotal: cardsSamples > 0 ? cardsTotal : null,
    avgCards:
      cardsSamples > 0 ? Math.round((cardsTotal / cardsSamples) * 100) / 100 : null,
    sampleSize: withScore.length,
    rows: withScore,
  };
}

/**
 * Analiza partido, combinada o scanner aleatorio.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const body = schema.parse(await request.json());

    const keys = await prisma.apiKey.findMany({
      where: { userId: auth.user.id, isActive: true },
    });
    const keysByProvider: Partial<Record<AiProvider, string>> = {};
    for (const k of keys) {
      keysByProvider[k.provider] = decryptSecret(k.encryptedKey);
    }

    if (body.mode === 'MATCH') {
      if (!body.matchId) {
        return NextResponse.json({ error: 'matchId requerido' }, { status: 400 });
      }
      const match = await prisma.match.findUnique({
        where: { id: body.matchId },
        include: { predictions: { orderBy: { scrapedAt: 'desc' }, take: 3 } },
      });
      if (!match) {
        return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
      }
      const fixedTeams = repairMisparsedMatch({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoff: match.kickoff,
        league: match.league,
      });
      const matchForAi = {
        ...match,
        homeTeam: fixedTeams.homeTeam,
        awayTeam: fixedTeams.awayTeam,
        kickoff: fixedTeams.kickoff ?? match.kickoff,
      };
      if (isJunkMatch(matchForAi.homeTeam, matchForAi.awayTeam)) {
        return NextResponse.json(
          {
            error:
              'Este registro parece una cabecera de tabla (p.ej. Time vs Match), no un partido real. Ejecuta scrapers mejores o elige otro partido.',
          },
          { status: 400 }
        );
      }

      const form = await loadTeamForm(matchForAi.homeTeam, matchForAi.awayTeam);
      let ctx = toCtx(matchForAi);
      // Condicionar Poisson al marcador live/FT (timeline sincroniza goles)
      try {
        const st = await fetchMatchStatus({
          homeTeam: ctx.homeTeam,
          awayTeam: ctx.awayTeam,
          matchDateYmd: localDateISO(),
          scrapeIsLive: Boolean(match.isLive),
          includeDetails: false,
        });
        const lastMin = [...st.timeline]
          .map((t) => Number(t.minute))
          .filter((n) => !Number.isNaN(n))
          .pop();
        ctx = {
          ...ctx,
          liveHomeScore: st.homeScore,
          liveAwayScore: st.awayScore,
          livePhase: st.phase,
          liveMinute: lastMin ?? null,
        };
      } catch {
        /* sin live: modelo pre-partido */
      }
      let payload = buildModelPayload(ctx, 'MATCH', { form });
      // TheSportsDB solo en análisis (no en scrapers): forma/calendario profundos
      payload = await applySportsDbToPayload(payload, {
        matchDateYmd: localDateISO(),
        fetchBadges: true,
      });
      let raw = JSON.stringify(payload);
      let providerUsed: AiProvider = body.provider;
      let promptUsed = 'deep-poisson+sportsdb';

      if (body.enrich !== false && Object.keys(keysByProvider).length > 0) {
        const enriched = await enrichPayloadWithLlm(body.provider, keysByProvider, payload);
        payload = enriched.payload;
        raw = enriched.raw;
        providerUsed = enriched.providerUsed;
        promptUsed = enriched.promptUsed;
      }

      const scores = scoresFromPayload(payload);
      const analysis = await prisma.analysis.create({
        data: {
          mode: AnalysisMode.MATCH,
          matchId: match.id,
          userId: auth.user.id,
          iaProvider: providerUsed,
          promptUsed,
          response: raw,
          payload: payload as unknown as Prisma.InputJsonValue,
          riskScore: new Prisma.Decimal(scores.riskScore),
          evScore: new Prisma.Decimal(scores.evScore),
          recommendedStake: new Prisma.Decimal(scores.recommendedStake),
        },
        include: { match: true, accumulator: true },
      });

      if (keysByProvider[providerUsed]) {
        await prisma.apiKey.updateMany({
          where: { userId: auth.user.id, provider: providerUsed },
          data: { lastUsed: new Date() },
        });
      }

      return NextResponse.json({ analysis, payload });
    }

    if (body.mode === 'RANDOM') {
      const date = localDateISO();
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const now = new Date();

      const prevAnalyses = await prisma.analysis.findMany({
        where: {
          userId: auth.user.id,
          matchId: { not: null },
          mode: { in: [AnalysisMode.MATCH, AnalysisMode.RANDOM] },
        },
        select: { matchId: true },
        take: 300,
      });
      const excludeMatchIds = new Set(
        prevAnalyses.map((a) => a.matchId).filter((id): id is string => Boolean(id))
      );

      const matches = await prisma.match.findMany({
        where: { matchDate: { gte: dayStart, lt: dayEnd } },
        include: { predictions: { orderBy: { scrapedAt: 'desc' }, take: 1 } },
        take: 200,
      });
      const valid = matches
        .map((m) => {
          const fixed = repairMisparsedMatch({
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            kickoff: m.kickoff,
            league: m.league,
          });
          return {
            ...m,
            homeTeam: fixed.homeTeam,
            awayTeam: fixed.awayTeam,
            kickoff: fixed.kickoff ?? m.kickoff,
          };
        })
        .filter(
          (m) =>
            !isJunkMatch(m.homeTeam, m.awayTeam) && isMatchStillOpen(date, m.kickoff, now)
        );
      if (valid.length === 0) {
        return NextResponse.json(
          {
            error:
              'No hay partidos válidos pendientes hoy. Re-ejecuta scrapers o prueba más tarde.',
          },
          { status: 400 }
        );
      }

      let payload = buildRandomScannerPayload(valid.map(toCtx), { excludeMatchIds });
      // Profundidad TheSportsDB solo sobre el partido primario (ahorra cuota API)
      payload = await applySportsDbToPayload(payload, {
        matchDateYmd: date,
        fetchBadges: true,
      });
      let raw = JSON.stringify(payload);
      let providerUsed: AiProvider = body.provider;
      let promptUsed = 'deep-random+sportsdb';

      if (body.enrich !== false && Object.keys(keysByProvider).length > 0) {
        const enriched = await enrichPayloadWithLlm(body.provider, keysByProvider, payload);
        payload = enriched.payload;
        raw = enriched.raw;
        providerUsed = enriched.providerUsed;
        promptUsed = enriched.promptUsed;
      }

      const scores = scoresFromPayload(payload);
      const primaryMatchId =
        payload.match?.id && payload.match.id !== 'N/A' ? payload.match.id : null;

      const analysis = await prisma.analysis.create({
        data: {
          mode: AnalysisMode.RANDOM,
          matchId: primaryMatchId,
          userId: auth.user.id,
          iaProvider: providerUsed,
          promptUsed,
          response: raw,
          payload: payload as unknown as Prisma.InputJsonValue,
          riskScore: new Prisma.Decimal(scores.riskScore),
          evScore: new Prisma.Decimal(scores.evScore),
          recommendedStake: new Prisma.Decimal(scores.recommendedStake),
        },
        include: { match: true, accumulator: true },
      });

      return NextResponse.json({ analysis, payload });
    }

    let accumulator = body.accumulatorId
      ? await prisma.accumulator.findFirst({
          where: { id: body.accumulatorId, userId: auth.user.id },
          include: { matches: { include: { match: true } } },
        })
      : null;

    if (!accumulator && body.suggestedId) {
      const suggested = await prisma.suggestedAccumulator.findUnique({
        where: { id: body.suggestedId },
      });
      if (!suggested) {
        return NextResponse.json({ error: 'Combinada sugerida no encontrada' }, { status: 404 });
      }

      const legs = (Array.isArray(suggested.legsJson) ? suggested.legsJson : []) as LegJson[];
      const totalOdds = Number(suggested.totalOdds) || 1;

      accumulator = await prisma.accumulator.create({
        data: {
          userId: auth.user.id,
          name: suggested.title || `Sugerida ${suggested.sourceSlug}`,
          totalOdds: new Prisma.Decimal(totalOdds.toFixed(3)),
        },
        include: { matches: { include: { match: true } } },
      });

      for (const leg of legs.slice(0, 12)) {
        let home = String(leg.home ?? leg.label?.split(/\s+vs\s+/i)[0] ?? 'TBD').trim();
        let away = String(leg.away ?? leg.label?.split(/\s+vs\s+/i)[1] ?? 'TBD').trim();
        const repaired = repairMisparsedMatch({ homeTeam: home, awayTeam: away, league: String(leg.league ?? '') });
        home = repaired.homeTeam;
        away = repaired.awayTeam;
        if (isJunkMatch(home, away)) continue;
        const league = String(leg.league ?? suggested.sourceSlug);
        const matchKey = `suggested|${suggested.id}|${home}|${away}|${league}`.slice(0, 190);

        const match = await prisma.match.upsert({
          where: { matchKey },
          create: {
            matchKey,
            matchDate: suggested.matchDate,
            kickoff: repaired.kickoff ?? undefined,
            league,
            homeTeam: home,
            awayTeam: away,
          },
          update: {
            homeTeam: home,
            awayTeam: away,
            kickoff: repaired.kickoff ?? undefined,
          },
        });

        await prisma.accumulatorMatch.create({
          data: {
            accumulatorId: accumulator.id,
            matchId: match.id,
            betType: '1X2',
            betChoice: String(leg.betChoice ?? 'N/A'),
            odds:
              leg.odds != null && Number(leg.odds) > 0
                ? new Prisma.Decimal(Number(leg.odds))
                : null,
          },
        });
      }

      accumulator = await prisma.accumulator.findFirstOrThrow({
        where: { id: accumulator.id },
        include: { matches: { include: { match: true } } },
      });
    }

    if (!accumulator) {
      return NextResponse.json({ error: 'Accumulator not found' }, { status: 404 });
    }

    if (accumulator.isAnalyzed && !body.force) {
      return NextResponse.json(
        {
          error:
            'Esta combinada ya fue analizada. Usa «Reanalizar» o crea una nueva en el Creador.',
        },
        { status: 400 }
      );
    }

    // Recargar predicciones por partido para cuotas/tips
    const matchIds = accumulator.matches.map((m) => m.matchId);
    const withPreds = await prisma.match.findMany({
      where: { id: { in: matchIds } },
      include: { predictions: { orderBy: { scrapedAt: 'desc' }, take: 1 } },
    });
    const predMap = new Map(withPreds.map((m) => [m.id, m]));
    const baseContexts = accumulator.matches.map((am) => {
      const full = predMap.get(am.matchId);
      const fixed = repairMisparsedMatch({
        homeTeam: am.match.homeTeam,
        awayTeam: am.match.awayTeam,
        kickoff: am.match.kickoff,
        league: am.match.league,
      });
      return {
        ...toCtx({
          id: am.match.id,
          homeTeam: fixed.homeTeam,
          awayTeam: fixed.awayTeam,
          league: am.match.league,
          kickoff: fixed.kickoff ?? am.match.kickoff,
          predictions: full?.predictions,
        }),
        scrapeIsLive: Boolean(full?.isLive ?? am.match.isLive),
        matchDateYmd: am.match.matchDate
          ? localDateISO(new Date(am.match.matchDate))
          : localDateISO(),
      };
    });

    // Live/FT por pierna (máx. 5) para condicionar Poisson al marcador actual
    const liveContext: Array<{
      matchId?: string;
      label: string;
      score: string | null;
      phase: string;
      statusLabel?: string | null;
      note?: string;
    }> = [];
    const contexts: Array<MatchContext & { id: string }> = [];
    for (let i = 0; i < baseContexts.length; i++) {
      const c = baseContexts[i];
      let liveHomeScore: number | null = null;
      let liveAwayScore: number | null = null;
      let livePhase: 'scheduled' | 'live' | 'finished' | 'unknown' | null = null;
      let liveMinute: number | null = null;

      if (i < 5) {
        try {
          const st = await fetchMatchStatus({
            homeTeam: c.homeTeam,
            awayTeam: c.awayTeam,
            matchDateYmd: c.matchDateYmd,
            scrapeIsLive: c.scrapeIsLive,
            includeDetails: false,
          });
          liveHomeScore = st.homeScore;
          liveAwayScore = st.awayScore;
          livePhase = st.phase;
          const lastMin = st.timeline
            .map((t) => Number(t.minute))
            .filter((n) => !Number.isNaN(n))
            .pop();
          liveMinute = lastMin ?? null;
          liveContext.push({
            matchId: c.id,
            label: `${c.homeTeam} vs ${c.awayTeam}`,
            score: st.score,
            phase: st.phase,
            statusLabel: st.statusLabel,
            note: st.scoreFromTimeline
              ? 'Marcador desde cronología'
              : st.phase === 'live'
                ? 'En vivo'
                : st.phase === 'finished'
                  ? 'Finalizado'
                  : undefined,
          });
        } catch {
          liveContext.push({
            matchId: c.id,
            label: `${c.homeTeam} vs ${c.awayTeam}`,
            score: null,
            phase: 'unknown',
            note: 'Sin estado TheSportsDB',
          });
        }
      }

      contexts.push({
        id: c.id,
        homeTeam: c.homeTeam,
        awayTeam: c.awayTeam,
        league: c.league,
        tip: c.tip,
        oddsHome: c.oddsHome,
        oddsDraw: c.oddsDraw,
        oddsAway: c.oddsAway,
        oddsOver: c.oddsOver,
        oddsUnder: c.oddsUnder,
        liveHomeScore,
        liveAwayScore,
        livePhase,
        liveMinute,
      });
    }

    const built = buildAccumulatorStructuredPayload(
      contexts,
      accumulator.name ?? 'Combinada',
      { liveContext }
    );
    let payload: StructuredMatchPayload = built;
    // TheSportsDB en la pierna ancla (máx. 1 partido) para no quemar 30 req/min
    payload = await applySportsDbToPayload(payload, {
      matchDateYmd: localDateISO(),
      fetchBadges: false,
    });
    let raw = JSON.stringify(payload);
    let providerUsed: AiProvider = body.provider;
    let promptUsed = 'deep-accumulator+sportsdb';

    if (body.enrich !== false && Object.keys(keysByProvider).length > 0) {
      const enriched = await enrichPayloadWithLlm(body.provider, keysByProvider, payload);
      payload = enriched.payload;
      raw = enriched.raw;
      providerUsed = enriched.providerUsed;
      promptUsed = enriched.promptUsed;
    }

    // Persistir picks elegidos por el modelo en cada pierna
    for (const leg of built.resolvedLegs) {
      if (!leg.matchId) continue;
      const am = accumulator.matches.find((x) => x.matchId === leg.matchId);
      if (!am) continue;
      await prisma.accumulatorMatch.update({
        where: { id: am.id },
        data: {
          betChoice: leg.market,
          odds: new Prisma.Decimal(leg.odds.toFixed(3)),
        },
      });
    }

    const scores = scoresFromPayload(payload);
    const totalOdds = built.accumulatorMeta?.totalOdds ?? Number(accumulator.totalOdds);

    await prisma.accumulator.update({
      where: { id: accumulator.id },
      data: {
        isAnalyzed: true,
        totalOdds: new Prisma.Decimal(totalOdds.toFixed(3)),
      },
    });

    const analysis = await prisma.analysis.create({
      data: {
        mode: AnalysisMode.ACCUMULATOR,
        accumulatorId: accumulator.id,
        matchId: payload.match?.id && payload.match.id !== 'N/A' ? payload.match.id : null,
        userId: auth.user.id,
        iaProvider: providerUsed,
        promptUsed,
        response: raw,
        payload: payload as unknown as Prisma.InputJsonValue,
        riskScore: new Prisma.Decimal(scores.riskScore),
        evScore: new Prisma.Decimal(scores.evScore),
        recommendedStake: new Prisma.Decimal(scores.recommendedStake),
      },
      include: { accumulator: true, match: true },
    });

    if (keysByProvider[providerUsed]) {
      await prisma.apiKey.updateMany({
        where: { userId: auth.user.id, provider: providerUsed },
        data: { lastUsed: new Date() },
      });
    }

    return NextResponse.json({ analysis, payload });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const analyses = await prisma.analysis.findMany({
    where: { userId: auth.user.id },
    include: { accumulator: true, match: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ analyses });
}
