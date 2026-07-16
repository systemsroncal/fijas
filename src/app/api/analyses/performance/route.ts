import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import {
  evaluateAnalysisPayload,
  resolveFinishedScore,
  summarizeHits,
  type AnalysisAccuracyRow,
} from '@/lib/ai/accuracy';

/**
 * GET /api/analyses/performance
 * Lista análisis del usuario + % aciertos vs partidos finalizados.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const analyses = await prisma.analysis.findMany({
      where: { userId: auth.user.id },
      include: {
        match: {
          include: {
            predictions: { orderBy: { scrapedAt: 'desc' }, take: 1 },
          },
        },
        accumulator: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const rows: AnalysisAccuracyRow[] = [];
    let totalHits = 0;
    let totalMisses = 0;
    let totalPushes = 0;
    let settledAnalyses = 0;
    let pendingAnalyses = 0;

    for (const a of analyses) {
      const payload = (a.payload ?? null) as StructuredMatchPayload | null;
      const note = a.match?.predictions?.[0]?.statsNote ?? null;
      const { score, finished } = resolveFinishedScore({
        phase: a.match?.phase,
        payload,
        statsNote: note,
        kickoff: a.match?.kickoff,
      });

      // Si el partido está marcado finished pero sin score en payload, aún pending parcial
      const isFinished = a.match?.phase === 'finished' || finished;
      const picks = evaluateAnalysisPayload(
        payload,
        score,
        Boolean(isFinished && score)
      );
      const summary = summarizeHits(picks);

      if (summary.hitRate != null) settledAnalyses += 1;
      else if (picks.some((p) => p.status === 'pending') || !isFinished) pendingAnalyses += 1;

      totalHits += summary.hits;
      totalMisses += summary.misses;
      totalPushes += summary.pushes;

      const matchLabel =
        a.match != null
          ? `${a.match.homeTeam} vs ${a.match.awayTeam}`
          : payload?.match
            ? `${payload.match.homeTeam} vs ${payload.match.awayTeam}`
            : a.accumulator?.name ?? 'Análisis';

      rows.push({
        analysisId: a.id,
        mode: a.mode,
        createdAt: a.createdAt.toISOString(),
        matchId: a.matchId,
        matchLabel,
        league: a.match?.league ?? payload?.match?.league ?? '—',
        phase: a.match?.phase ?? (isFinished ? 'finished' : null),
        score,
        provider: a.iaProvider,
        picks,
        hitRate: summary.hitRate,
        hits: summary.hits,
        misses: summary.misses,
        pending: summary.pending > 0 || (!isFinished && Boolean(a.matchId)),
      });
    }

    const decided = totalHits + totalMisses;
    const overallHitRate = decided > 0 ? totalHits / decided : null;

    // Combinadas propuestas recientes (más opciones) desde últimos payloads
    const comboIdeas: Array<{
      analysisId: string;
      matchLabel: string;
      title: string;
      riskTier: string;
      totalOdds: number;
      legs: string[];
    }> = [];
    for (const a of analyses.slice(0, 40)) {
      const payload = a.payload as StructuredMatchPayload | null;
      if (!payload?.proposedAccumulators?.length) continue;
      const label =
        payload.match != null
          ? `${payload.match.homeTeam} vs ${payload.match.awayTeam}`
          : 'Scanner';
      for (const acc of payload.proposedAccumulators.slice(0, 6)) {
        comboIdeas.push({
          analysisId: a.id,
          matchLabel: label,
          title: acc.title,
          riskTier: acc.riskTier,
          totalOdds: acc.totalOdds,
          legs: acc.legs.map((l) => `${l.matchLabel}: ${l.betChoice} @${l.odds}`),
        });
      }
    }

    return NextResponse.json({
      summary: {
        totalAnalyses: analyses.length,
        settledAnalyses,
        pendingAnalyses,
        totalHits,
        totalMisses,
        totalPushes,
        overallHitRate,
        overallHitPct:
          overallHitRate != null ? Math.round(overallHitRate * 1000) / 10 : null,
      },
      rows,
      comboIdeas: comboIdeas.slice(0, 40),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Performance failed' },
      { status: 500 }
    );
  }
}
