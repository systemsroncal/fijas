'use client';

import { useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Stack } from '@mui/material';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { withBrief } from '@/lib/ai/analysis-brief';
import { repairMisparsedMatch } from '@/lib/match-display';
import MatchResultStatsPanel from '@/components/analysis/MatchResultStatsPanel';
import AnalysisResultsHero from '@/components/analysis/results/AnalysisResultsHero';
import AnalysisPickGrid from '@/components/analysis/results/AnalysisPickGrid';
import AnalysisMarketChart from '@/components/analysis/results/AnalysisMarketChart';
import AnalysisMetricStrip from '@/components/analysis/results/AnalysisMetricStrip';
import AnalysisDetailsAccordion from '@/components/analysis/results/AnalysisDetailsAccordion';
import AnalysisSummarySection from '@/components/analysis/results/AnalysisSummarySection';
import AnalysisDisclaimer from '@/components/analysis/results/AnalysisDisclaimer';
import { exportNodeToPng } from '@/lib/export-png';
import { RECENT_MATCHES_MAX } from '@/lib/ai/form-stats';

/**
 * Resultados de análisis — layout visual-first; texto explicativo al final.
 */
export default function MatchAnalysisDashboard({
  payload,
  onAnalyzeMatch,
  onReanalyze,
  reanalyzing,
}: {
  payload: StructuredMatchPayload;
  onAnalyzeMatch?: (matchId: string) => void;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const valid = Boolean(
    payload?.probs && Array.isArray(payload.markets) && payload.scoreline
  );

  const rawMatch = valid ? payload.match : undefined;
  const m = useMemo(() => {
    if (!rawMatch?.homeTeam || !rawMatch?.awayTeam) return rawMatch;
    const fixed = repairMisparsedMatch({
      homeTeam: rawMatch.homeTeam,
      awayTeam: rawMatch.awayTeam,
      league: rawMatch.league,
    });
    return { ...rawMatch, homeTeam: fixed.homeTeam, awayTeam: fixed.awayTeam };
  }, [rawMatch]);

  const brief = valid ? payload.brief ?? withBrief(payload).brief : undefined;

  const formDisplayRows = useMemo(() => {
    const home = payload.form?.homeSeason?.filter((r) => r.score) ?? [];
    const away = payload.form?.awaySeason?.filter((r) => r.score) ?? [];
    const combined = [...home, ...away];
    if (combined.length > 0) {
      const seen = new Set<string>();
      return combined
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .filter((r) => {
          const key = `${r.date}|${r.label}|${r.score}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, RECENT_MATCHES_MAX * 2);
    }
    return (payload.form?.rows ?? []).filter((r) => r.score).slice(0, RECENT_MATCHES_MAX * 2);
  }, [payload.form?.awaySeason, payload.form?.homeSeason, payload.form?.rows]);

  const formSampleCounts = useMemo(
    () => ({
      home: payload.form?.homeSeason?.filter((r) => r.score).length ?? 0,
      away: payload.form?.awaySeason?.filter((r) => r.score).length ?? 0,
    }),
    [payload.form?.awaySeason, payload.form?.homeSeason]
  );

  const exportPng = async () => {
    if (!ref.current) return;
    setExporting(true);
    setExportError(null);
    try {
      const dataUrl = await exportNodeToPng(ref.current);
      const a = document.createElement('a');
      const fileName = m ? `${m.homeTeam}-vs-${m.awayTeam}` : 'analisis';
      a.download = `${fileName.replace(/\s+/g, '_')}-analisis.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error(err);
      setExportError(
        'No se pudo exportar el PNG. Si persiste, recarga la página e inténtalo de nuevo.'
      );
    } finally {
      setExporting(false);
    }
  };

  if (!valid) {
    return (
      <Alert severity="warning" variant="outlined">
        Este resultado no es un análisis de partido completo. Usa «Por partido» o «Aleatorio /
        huecos», o pulsa «Ver resultado» en historial de combinadas.
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end" spacing={1} flexWrap="wrap">
        {onReanalyze && (
          <Button variant="contained" size="small" onClick={onReanalyze} disabled={reanalyzing}>
            {reanalyzing ? 'Reanalizando…' : 'Reanalizar'}
          </Button>
        )}
        <Button variant="outlined" size="small" onClick={() => void exportPng()} disabled={exporting}>
          {exporting ? 'Exportando…' : 'Exportar PNG'}
        </Button>
      </Stack>

      {exportError && (
        <Alert severity="error" onClose={() => setExportError(null)}>
          {exportError}
        </Alert>
      )}

      <Box data-export-ignore="1">
        <MatchResultStatsPanel
          matchId={m?.id}
          eventId={payload.sportsDb?.matchedEvent?.id}
          homeTeam={m?.homeTeam}
          awayTeam={m?.awayTeam}
          sport={m?.sport}
          date={payload.match?.matchDate ?? payload.sportsDb?.matchedEvent?.date}
        />
      </Box>

      <Box
        ref={ref}
        sx={{
          p: { xs: 2, md: 3 },
          borderRadius: 3,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={3}>
          <AnalysisResultsHero
            payload={payload}
            homeTeam={m?.homeTeam ?? 'Local'}
            awayTeam={m?.awayTeam ?? 'Visitante'}
            sport={m?.sport}
            league={m?.league}
            homeCrestUrl={m?.homeCrestUrl}
            awayCrestUrl={m?.awayCrestUrl}
          />

          <AnalysisPickGrid payload={payload} />

          <AnalysisMarketChart markets={payload.markets} />

          <AnalysisMetricStrip payload={payload} />

          <AnalysisDetailsAccordion
            payload={payload}
            homeTeam={m?.homeTeam ?? 'Local'}
            awayTeam={m?.awayTeam ?? 'Visitante'}
            formDisplayRows={formDisplayRows}
            formSampleCounts={formSampleCounts}
            onAnalyzeMatch={onAnalyzeMatch}
          />

          <AnalysisSummarySection brief={brief} edgeSummary={payload.edgeSummary} />

          <AnalysisDisclaimer />
        </Stack>
      </Box>
    </Stack>
  );
}
