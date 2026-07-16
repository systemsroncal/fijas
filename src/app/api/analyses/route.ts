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
  refreshModelWithForm,
  StructuredMatchPayload,
} from '@/lib/ai/structured-analysis';
import { MatchContext } from '@/lib/ai/football-model';
import {
  extractScoreFromText,
  isJunkMatch,
  repairMisparsedMatch,
} from '@/lib/match-display';
import { localDateISO } from '@/lib/local-date';
import { isMatchStillOpenPeru, peruDateISO } from '@/lib/timezone';
import type { FormMatchRow, TeamFormBlock } from '@/lib/ai/analysis-types';
import { applySportsDbToPayload } from '@/lib/sportsdb/enrich';
import { applyFootballDataToPayload } from '@/lib/football-data/enrich';
import { isFootballDataConfigured } from '@/lib/football-data/client';
import { fetchMatchStatus } from '@/lib/sportsdb/match-status';
import { buildMatchDiagnostics } from '@/lib/sportsdb/player-diagnostics';
import { ANALYSIS_EXTERNAL_SOURCES } from '@/lib/ai/external-sources';
import { mqPublish } from '@/lib/mq/bus';
import {
  isH2HPair,
  isImplausibleSeniorScore,
  isOutlierFootballScore,
  matchInvolvesTeam,
  sanitizeFormRows,
  teamNameSearchVariants,
} from '@/lib/team-identity';
import { summarizeTeamForm } from '@/lib/ai/form-stats';

function attachSources(
  payload: StructuredMatchPayload,
  extras?: { sportsDbOk?: boolean; formOk?: boolean; footballDataOk?: boolean }
): StructuredMatchPayload {
  return {
    ...payload,
    externalSources: ANALYSIS_EXTERNAL_SOURCES.map((s) => {
      if (s.id === 'sportsdb') {
        return {
          name: s.name,
          status: extras?.sportsDbOk ? 'ok' : 'skip',
          detail: extras?.sportsDbOk ? 'TheSportsDB OK' : 'Sin match / timeout',
        };
      }
      if (s.id === 'football_data') {
        return {
          name: s.name,
          status: !isFootballDataConfigured()
            ? 'skip'
            : extras?.footballDataOk
              ? 'ok'
              : 'fail',
          detail: !isFootballDataConfigured()
            ? 'Sin FOOTBALL_DATA_API_TOKEN'
            : extras?.footballDataOk
              ? 'football-data.org OK'
              : 'Sin match / error',
        };
      }
      if (s.id === 'h2h') {
        return {
          name: s.name,
          status: extras?.formOk ? 'ok' : 'skip',
          detail: extras?.formOk ? 'H2H/forma cargados' : 'Sin marcadores',
        };
      }
      return { name: s.name, status: 'ok' as const, detail: 'Consultado / en cola' };
    }),
  };
}

function requireLlmKey(
  enrich: boolean | undefined,
  _provider: AiProvider,
  keysByProvider: Partial<Record<AiProvider, string>>
): NextResponse | null {
  // enrich=true: si no hay ninguna key, se permite (cascada → neuronal)
  if (enrich === false) return null;
  void _provider;
  void keysByProvider;
  return null;
}

function cornersFromDiagnostics(
  diagnostics: ReturnType<typeof buildMatchDiagnostics> | null
): { home: number | null; away: number | null } {
  if (!diagnostics) return { home: null, away: null };
  const row = diagnostics.teamStats.find((s) => /c[oó]rner|corner/i.test(s.name));
  if (!row) return { home: null, away: null };
  const m = row.value.match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
  if (!m) return { home: null, away: null };
  return { home: Number(m[1]), away: Number(m[2]) };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

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
  matchDate?: Date | null;
  phase?: string | null;
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
  const matchDateYmd = m.matchDate ? localDateISO(new Date(m.matchDate)) : null;
  const note = m.predictions?.map((x) => x.statsNote).filter(Boolean).join(' ') ?? '';
  const dbScore =
    extractScoreFromText(note) ?? extractScoreFromText(fixed.kickoff ?? m.kickoff);
  const finished = m.phase === 'finished';
  let liveHomeScore: number | null = null;
  let liveAwayScore: number | null = null;
  if (dbScore && finished) {
    const [h, a] = dbScore.split('-').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(a)) {
      liveHomeScore = h;
      liveAwayScore = a;
    }
  }
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
    matchDateYmd,
    livePhase: finished ? 'finished' : null,
    liveHomeScore,
    liveAwayScore,
  };
}

function matchYmdFromDate(d: Date | null | undefined): string {
  return d ? localDateISO(new Date(d)) : localDateISO();
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
 * Forma reciente + H2H + forma por equipo en temporada (solo marcadores reales).
 * Alias-aware (FC Astana ≈ Astana) y misma categoría (sin mezclar mujeres/juveniles).
 */
async function loadTeamForm(
  homeTeam: string,
  awayTeam: string,
  league?: string | null
): Promise<TeamFormBlock> {
  const variants = Array.from(
    new Set([...teamNameSearchVariants(homeTeam), ...teamNameSearchVariants(awayTeam)])
  );
  const history = await prisma.match.findMany({
    where: {
      OR: variants.flatMap((v) => [
        { homeTeam: { contains: v.slice(0, 32) } },
        { awayTeam: { contains: v.slice(0, 32) } },
      ]),
    },
    include: {
      predictions: { orderBy: { scrapedAt: 'desc' }, take: 2 },
    },
    orderBy: { matchDate: 'desc' },
    take: 120,
  });

  const rowsRaw: FormMatchRow[] = [];
  const goalSamples: number[] = [];
  let cardsTotal = 0;
  let cardsSamples = 0;

  for (const m of history) {
    if (isJunkMatch(m.homeTeam, m.awayTeam)) continue;
    const note = m.predictions.map((p) => p.statsNote).filter(Boolean).join(' ');
    const score = extractScoreFromText(note) ?? extractScoreFromText(m.kickoff);
    if (isOutlierFootballScore(score)) continue;
    if (isImplausibleSeniorScore(score)) continue;
    const tip = m.predictions[0]?.betChoice ?? null;
    const row: FormMatchRow = {
      matchId: m.id,
      label: `${m.homeTeam} vs ${m.awayTeam}`,
      date: m.matchDate.toISOString().slice(0, 10),
      score,
      tip,
      league: m.league,
    };
    rowsRaw.push(row);

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

  const cleaned = sanitizeFormRows(rowsRaw, homeTeam, awayTeam, league).sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );
  const withScore = cleaned.filter((r) => r.score).slice(0, 10);

  const h2hScored = cleaned
    .filter((r) => {
      if (!r.score) return false;
      const parts = r.label.split(/\s+vs\.?\s+/i);
      if (parts.length !== 2) return false;
      return isH2HPair(homeTeam, awayTeam, parts[0].trim(), parts[1].trim());
    })
    .slice(0, 8);

  const homeScored = cleaned
    .filter((r) => {
      if (!r.score) return false;
      const parts = r.label.split(/\s+vs\.?\s+/i);
      if (parts.length !== 2) return false;
      return matchInvolvesTeam(homeTeam, parts[0].trim(), parts[1].trim());
    })
    .slice(0, 8);

  const awayScored = cleaned
    .filter((r) => {
      if (!r.score) return false;
      const parts = r.label.split(/\s+vs\.?\s+/i);
      if (parts.length !== 2) return false;
      return matchInvolvesTeam(awayTeam, parts[0].trim(), parts[1].trim());
    })
    .slice(0, 8);

  if (withScore.length === 0 && h2hScored.length === 0) {
    return emptyForm(
      rowsRaw.length > 0
        ? `Hay ${rowsRaw.length} partidos cercanos en nombre, pero tras filtrar alias/categoría/duplicados no quedan marcadores usables.`
        : undefined
    );
  }

  const cleanGoalSamples = withScore
    .map((r) => {
      const [a, b] = (r.score ?? '').split('-').map(Number);
      return Number.isNaN(a) || Number.isNaN(b) ? null : a + b;
    })
    .filter((n): n is number => n != null);

  const avgGoalsTotal =
    cleanGoalSamples.length > 0
      ? Math.round(
          (cleanGoalSamples.reduce((s, n) => s + n, 0) / cleanGoalSamples.length) * 100
        ) / 100
      : null;

  const parts: string[] = [];
  if (withScore.length) parts.push(`${withScore.length} marcadores`);
  if (h2hScored.length) parts.push(`${h2hScored.length} H2H`);
  if (homeScored.length || awayScored.length) {
    parts.push('forma temporada (misma categoría)');
  }
  if (rowsRaw.length > cleaned.length) {
    parts.push(`filtrados ${rowsRaw.length - cleaned.length} dup/categoría/outlier`);
  }

  const homeForm = summarizeTeamForm(homeScored, homeTeam, {
    maxRows: 8,
    leagueHint: league,
    excludeOpponent: awayTeam,
  });
  const awayForm = summarizeTeamForm(awayScored, awayTeam, {
    maxRows: 8,
    leagueHint: league,
    excludeOpponent: homeTeam,
  });

  return {
    available: true,
    message: `Historial real: ${parts.join(', ')} (máx. muestra). Forma reciente pesa más que H2H.`,
    recentScores: withScore.map((r) => r.score!).slice(0, 10),
    avgGoalsFor: homeForm?.avgGoalsFor ?? null,
    avgGoalsAgainst: homeForm?.avgGoalsAgainst ?? null,
    avgGoalsTotal,
    cardsTotal: cardsSamples > 0 ? cardsTotal : null,
    avgCards:
      cardsSamples > 0 ? Math.round((cardsTotal / cardsSamples) * 100) / 100 : null,
    sampleSize: withScore.length,
    rows: withScore,
    h2h: h2hScored,
    homeSeason: homeScored,
    awaySeason: awayScored,
    homeForm,
    awayForm,
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

    // enrich=true → LLM profundo con failover a otras IAs / neuronal
    const earlyKeyErr = requireLlmKey(body.enrich, body.provider, keysByProvider);
    if (earlyKeyErr) return earlyKeyErr;

    const progressLog: Array<{
      type: 'progress';
      step?: string;
      message: string;
      provider?: string;
      ok?: boolean;
      pct?: number;
      source?: string;
    }> = [];
    const emit = (e: (typeof progressLog)[number]) => {
      progressLog.push(e);
    };

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

      const form = await loadTeamForm(
        matchForAi.homeTeam,
        matchForAi.awayTeam,
        matchForAi.league
      );
      emit({
        type: 'progress',
        step: 'h2h',
        source: 'h2h',
        message: form.available
          ? `Historial: ${form.message}`
          : 'Sin historial H2H/forma scrapeado',
        ok: form.available,
        pct: 18,
      });
      let ctx = toCtx(matchForAi);
      let matchDiagnostics: ReturnType<typeof buildMatchDiagnostics> | null = null;
      const analysisDateYmd = matchYmdFromDate(match.matchDate);
      // Live/FT con stats (tope 18s: no bloquear la IA si SportsDB va lento)
      emit({
        type: 'progress',
        step: 'sportsdb',
        source: 'sportsdb',
        message: 'Consultando TheSportsDB (live/forma)…',
        pct: 28,
      });
      try {
        const st = await withTimeout(
          fetchMatchStatus({
            homeTeam: ctx.homeTeam,
            awayTeam: ctx.awayTeam,
            matchDateYmd: analysisDateYmd,
            scrapeIsLive: Boolean(match.isLive),
            includeDetails: true,
            bypassCache: false,
          }),
          18_000,
          'match-status'
        );
        matchDiagnostics = buildMatchDiagnostics(st);
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
        emit({
          type: 'progress',
          step: 'sportsdb',
          source: 'sportsdb',
          message: `TheSportsDB OK · fase ${st.phase}${st.score ? ` · ${st.score}` : ''}`,
          ok: true,
          pct: 40,
        });
      } catch {
        emit({
          type: 'progress',
          step: 'sportsdb',
          source: 'sportsdb',
          message: 'TheSportsDB timeout/skip — continuo con modelo',
          ok: false,
          pct: 40,
        });
      }
      emit({
        type: 'progress',
        step: 'poisson',
        message: 'Ejecutando Red Neuronal (Poisson)…',
        pct: 52,
      });
      let payload = buildModelPayload(ctx, 'MATCH', { form });
      const cornerPair = cornersFromDiagnostics(matchDiagnostics);
      payload = {
        ...payload,
        matchDiagnostics,
        expected: {
          ...payload.expected,
          cornersHome: cornerPair.home ?? payload.expected.cornersHome,
          cornersAway: cornerPair.away ?? payload.expected.cornersAway,
          note:
            matchDiagnostics?.teamStats.length
              ? `${payload.expected.note} Stats live/FT incluidas para la IA.`
              : payload.expected.note,
        },
        llmUsed: false,
        llmProvider: null,
      };
      // TheSportsDB solo en análisis (no en scrapers): forma/calendario profundos
      payload = await applySportsDbToPayload(payload, {
        matchDateYmd: analysisDateYmd,
        fetchBadges: true,
      });
      emit({
        type: 'progress',
        step: 'football_data',
        source: 'football_data',
        message: isFootballDataConfigured()
          ? 'Consultando football-data.org (tabla/forma)…'
          : 'football-data.org omitido (sin token)',
        pct: 58,
      });
      payload = await applyFootballDataToPayload(payload);
      if (payload.form?.available) {
        payload = refreshModelWithForm(ctx, payload);
      }
      if (payload.footballData) {
        emit({
          type: 'progress',
          step: 'football_data',
          source: 'football_data',
          message: `football-data.org · ${payload.footballData.notes.slice(0, 2).join(' · ') || 'OK'}`,
          ok: Boolean(payload.footballData.matchId || payload.footballData.standingsHome),
          pct: 62,
        });
      }
      payload = attachSources(payload, {
        sportsDbOk: Boolean(payload.sportsDb?.matchedEvent || matchDiagnostics),
        formOk: form.available,
        footballDataOk: Boolean(
          payload.footballData?.matchId || payload.footballData?.standingsHome
        ),
      });
      let raw = JSON.stringify(payload);
      let providerUsed: AiProvider = body.provider;
      let promptUsed = 'deep-poisson+sportsdb';

      if (body.enrich !== false) {
        emit({
          type: 'progress',
          step: 'ai',
          provider: body.provider,
          message: `Probando IA preferida: ${body.provider}`,
          pct: 68,
        });
        const enriched = await enrichPayloadWithLlm(
          body.provider,
          keysByProvider,
          payload,
          (ev) =>
            emit({
              type: 'progress',
              step: ev.step,
              message: ev.message,
              provider: ev.provider,
              ok: ev.ok,
              pct: ev.pct,
            })
        );
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

      if (keysByProvider[providerUsed] && payload.llmUsed) {
        await prisma.apiKey.updateMany({
          where: { userId: auth.user.id, provider: providerUsed },
          data: { lastUsed: new Date() },
        });
      }

      void mqPublish({
        routingKey: 'analysis.completed',
        key: analysis.id,
        payload: { analysisId: analysis.id, mode: 'MATCH', provider: providerUsed },
      });

      return NextResponse.json({ analysis, payload, progressLog });
    }

    if (body.mode === 'RANDOM') {
      const date = peruDateISO();
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
        where: {
          matchDate: { gte: dayStart, lt: dayEnd },
          OR: [{ phase: null }, { phase: { not: 'finished' } }],
        },
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
        .filter((m) => {
          if (isJunkMatch(m.homeTeam, m.awayTeam)) return false;
          if (m.phase === 'finished') return false;
          const baseYmd = m.matchDate
            ? `${m.matchDate.getUTCFullYear()}-${String(m.matchDate.getUTCMonth() + 1).padStart(2, '0')}-${String(m.matchDate.getUTCDate()).padStart(2, '0')}`
            : date;
          return isMatchStillOpenPeru({
            matchDateYmd: baseYmd,
            kickoff: m.kickoff,
            now,
            isLive: m.isLive || m.phase === 'live',
          });
        });
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
      payload = await applyFootballDataToPayload(payload);
      // Stats live del partido elegido (si hay)
      if (payload.match?.homeTeam && payload.match?.awayTeam) {
        try {
          const st = await withTimeout(
            fetchMatchStatus({
              homeTeam: payload.match.homeTeam,
              awayTeam: payload.match.awayTeam,
              matchDateYmd: date,
              includeDetails: true,
              bypassCache: false,
            }),
            18_000,
            'match-status-random'
          );
          const diag = buildMatchDiagnostics(st);
          const cornerPair = cornersFromDiagnostics(diag);
          payload = {
            ...payload,
            matchDiagnostics: diag,
            expected: {
              ...payload.expected,
              cornersHome: cornerPair.home ?? payload.expected.cornersHome,
              cornersAway: cornerPair.away ?? payload.expected.cornersAway,
            },
            llmUsed: false,
            llmProvider: null,
          };
        } catch {
          payload = { ...payload, llmUsed: false, llmProvider: null };
        }
      } else {
        payload = { ...payload, llmUsed: false, llmProvider: null };
      }
      let raw = JSON.stringify(payload);
      let providerUsed: AiProvider = body.provider;
      let promptUsed = 'deep-random+sportsdb';

      if (body.enrich !== false) {
        const enriched = await enrichPayloadWithLlm(
          body.provider,
          keysByProvider,
          payload,
          (ev) =>
            emit({
              type: 'progress',
              step: ev.step,
              message: ev.message,
              provider: ev.provider,
              ok: ev.ok,
              pct: ev.pct,
            })
        );
        payload = enriched.payload;
        raw = enriched.raw;
        providerUsed = enriched.providerUsed;
        promptUsed = enriched.promptUsed;
      }

      const scores = scoresFromPayload(payload);
      const primaryMatchId =
        payload.match?.id && payload.match.id !== 'N/A' ? payload.match.id : null;

      payload = attachSources(payload, {
        sportsDbOk: Boolean(payload.sportsDb?.matchedEvent || payload.matchDiagnostics),
        formOk: Boolean(payload.form?.available),
        footballDataOk: Boolean(
          payload.footballData?.matchId || payload.footballData?.standingsHome
        ),
      });

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

      void mqPublish({
        routingKey: 'analysis.completed',
        key: analysis.id,
        payload: { analysisId: analysis.id, mode: 'RANDOM', provider: providerUsed },
      });

      return NextResponse.json({ analysis, payload, progressLog });
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

      if (i < 3) {
        try {
          const st = await withTimeout(
            fetchMatchStatus({
              homeTeam: c.homeTeam,
              awayTeam: c.awayTeam,
              matchDateYmd: c.matchDateYmd,
              scrapeIsLive: c.scrapeIsLive,
              includeDetails: false,
              bypassCache: false,
            }),
            10_000,
            'match-status-leg'
          );
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
    let payload: StructuredMatchPayload = {
      ...built,
      llmUsed: false,
      llmProvider: null,
    };
    // TheSportsDB en la pierna ancla (máx. 1 partido) para no quemar 30 req/min
    payload = await applySportsDbToPayload(payload, {
      matchDateYmd: localDateISO(),
      fetchBadges: false,
    });
    payload = await applyFootballDataToPayload(payload);
    let raw = JSON.stringify(payload);
    let providerUsed: AiProvider = body.provider;
    let promptUsed = 'deep-accumulator+sportsdb+fd';

    if (body.enrich !== false) {
      const enriched = await enrichPayloadWithLlm(
        body.provider,
        keysByProvider,
        payload,
        (ev) =>
          emit({
            type: 'progress',
            step: ev.step,
            message: ev.message,
            provider: ev.provider,
            ok: ev.ok,
            pct: ev.pct,
          })
      );
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

    payload = attachSources(payload, {
      sportsDbOk: Boolean(payload.sportsDb?.matchedEvent),
      formOk: Boolean(payload.form?.available),
      footballDataOk: Boolean(
        payload.footballData?.matchId || payload.footballData?.standingsHome
      ),
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

    if (keysByProvider[providerUsed] && payload.llmUsed) {
      await prisma.apiKey.updateMany({
        where: { userId: auth.user.id, provider: providerUsed },
        data: { lastUsed: new Date() },
      });
    }

    void mqPublish({
      routingKey: 'analysis.completed',
      key: analysis.id,
      payload: {
        analysisId: analysis.id,
        mode: 'ACCUMULATOR',
        provider: providerUsed,
      },
    });

    return NextResponse.json({ analysis, payload, progressLog });
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
