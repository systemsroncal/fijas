'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  IconBallAmericanFootball,
  IconBallBasketball,
  IconBallFootball,
  IconBallVolleyball,
  IconBallTennis,
  IconDeviceGamepad2,
  IconQuestionMark,
} from '@tabler/icons-react';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { withBrief } from '@/lib/ai/analysis-brief';
import {
  repairMisparsedMatch,
  sportLabel,
  teamMonogram,
  type SportKind,
} from '@/lib/match-display';
import MatchResultStatsPanel from '@/components/analysis/MatchResultStatsPanel';
import { proxiedMediaUrl } from '@/lib/media-proxy';
import { exportNodeToPng } from '@/lib/export-png';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const verdictColor: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  value: 'success',
  safe: 'info',
  risky: 'warning',
  avoid: 'error',
  neutral: 'default',
};

function SportIcon({ sport }: { sport?: string }) {
  const s = (sport ?? 'football') as SportKind;
  const props = { size: 18, stroke: 1.75 };
  if (s === 'basketball') return <IconBallBasketball {...props} />;
  if (s === 'american_football') return <IconBallAmericanFootball {...props} />;
  if (s === 'volleyball') return <IconBallVolleyball {...props} />;
  if (s === 'tennis') return <IconBallTennis {...props} />;
  if (s === 'esports') return <IconDeviceGamepad2 {...props} />;
  if (
    s === 'other' ||
    s === 'rugby' ||
    s === 'cricket' ||
    s === 'golf' ||
    s === 'hockey' ||
    s === 'baseball' ||
    s === 'handball' ||
    s === 'mma'
  ) {
    return <IconQuestionMark {...props} />;
  }
  return <IconBallFootball {...props} />;
}

function TeamBadge({
  name,
  crestUrl,
}: {
  name: string;
  crestUrl?: string | null;
}) {
  const src = proxiedMediaUrl(crestUrl);
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Avatar
        src={src}
        alt={name}
        sx={{ width: 36, height: 36, fontSize: 13, bgcolor: 'primary.main', fontWeight: 700 }}
        slotProps={{
          img: {
            // Escudo sigue en UI; si falla la URL, muestra monograma sin romper export
            onError: (e) => {
              e.currentTarget.removeAttribute('src');
            },
          },
        }}
      >
        {teamMonogram(name)}
      </Avatar>
      <Typography fontWeight={700}>{name}</Typography>
    </Stack>
  );
}

/**
 * Dashboard de análisis — estilo producto Modernize (sin panel “IA oscuro”).
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
  const theme = useTheme();
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
    return {
      ...rawMatch,
      homeTeam: fixed.homeTeam,
      awayTeam: fixed.awayTeam,
    };
  }, [rawMatch]);
  const brief = valid ? payload.brief ?? withBrief(payload).brief : undefined;
  const homeLabel = `${m?.homeTeam ?? 'Local'} GANA`;
  const awayLabel = `${m?.awayTeam ?? 'Visitante'} GANA`;
  const edgeMarkets = valid ? payload.markets.slice(0, 8) : [];

  const donutOptions = useMemo(
    () => ({
      chart: { type: 'donut' as const, fontFamily: 'inherit', toolbar: { show: false } },
      labels: [homeLabel, 'EMPATE', awayLabel],
      colors: [theme.palette.primary.main, theme.palette.warning.main, theme.palette.success.main],
      legend: { position: 'bottom' as const },
      dataLabels: { enabled: true, formatter: (v: number) => `${Math.round(v)}%` },
      plotOptions: { pie: { donut: { size: '62%' } } },
      tooltip: { y: { formatter: (v: number) => `${v.toFixed(1)}%` } },
    }),
    [homeLabel, awayLabel, theme]
  );
  const donutSeries = valid
    ? [payload.probs.home, payload.probs.draw, payload.probs.away]
    : [0, 0, 0];

  const barOptions = useMemo(
    () => ({
      chart: { type: 'bar' as const, fontFamily: 'inherit', toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '70%' } },
      xaxis: {
        categories: edgeMarkets.map((r) =>
          r.market.length > 42 ? `${r.market.slice(0, 40)}…` : r.market
        ),
      },
      colors: [theme.palette.info.main],
      dataLabels: { enabled: true, formatter: (v: number) => `${Number(v).toFixed(0)}%` },
      tooltip: { y: { formatter: (v: number) => `Prob ${Number(v).toFixed(1)}%` } },
    }),
    [edgeMarkets, theme]
  );
  const barSeries = [
    { name: 'Prob. modelo', data: edgeMarkets.map((r) => Math.round(r.aiProb * 10) / 10) },
  ];

  const exportPng = async () => {
    if (!ref.current) return;
    setExporting(true);
    setExportError(null);
    try {
      // Escudos se mantienen en UI; para el PNG se incrustan como data URL (sin CORS)
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
          <Button
            variant="contained"
            size="small"
            onClick={onReanalyze}
            disabled={reanalyzing}
          >
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

      {/* Fuera del ref de export: no entra en el PNG */}
      <Box data-export-ignore="1">
        <MatchResultStatsPanel
          matchId={m?.id}
          eventId={payload.sportsDb?.matchedEvent?.id}
          homeTeam={m?.homeTeam}
          awayTeam={m?.awayTeam}
          sport={m?.sport}
          date={payload.sportsDb?.matchedEvent?.date}
        />
      </Box>

      <Box
        ref={ref}
        sx={{
          p: { xs: 2, md: 3 },
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={2.5}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ sm: 'flex-start' }}
            spacing={2}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap">
                <SportIcon sport={m?.sport} />
                <Typography variant="overline" color="text.secondary">
                  {sportLabel((m?.sport as SportKind) ?? 'football')} · {m?.league ?? 'Scanner'} ·{' '}
                  {payload.mode}
                </Typography>
                {payload.llmUsed ? (
                  <Chip
                    size="small"
                    color="success"
                    label={`IA ${payload.llmProvider ?? 'OK'}`}
                  />
                ) : (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label="Sin IA (solo modelo)"
                  />
                )}
              </Stack>
              {m && m.homeTeam !== 'N/A' ? (
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  alignItems={{ md: 'center' }}
                >
                  <TeamBadge name={m.homeTeam} crestUrl={m.homeCrestUrl} />
                  <Typography color="text.secondary" fontWeight={600}>
                    vs
                  </Typography>
                  <TeamBadge name={m.awayTeam} crestUrl={m.awayCrestUrl} />
                </Stack>
              ) : (
                <Typography variant="h5" fontWeight={700}>
                  Scanner de huecos
                </Typography>
              )}
              {payload.mode === 'ACCUMULATOR' && payload.accumulatorMeta && (
                <Box mt={1.5}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Combinada · {payload.accumulatorMeta.name} (@
                    {payload.accumulatorMeta.totalOdds})
                  </Typography>
                  <Stack spacing={0.5} mt={1}>
                    {payload.accumulatorMeta.resolvedLegs.map((leg, i) => (
                      <Typography key={i} variant="body2">
                        <strong>{leg.matchLabel}</strong> → {leg.market} @{leg.odds.toFixed(2)}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              )}
              {payload.mode === 'RANDOM' && (
                <Chip size="small" label="Partido elegido al azar" sx={{ mt: 1.5 }} color="info" />
              )}
              {m?.tip &&
                !/^(view\s*tips?|n\/?a|tbd|-)$/i.test(m.tip.trim()) && (
                  <Chip
                    size="small"
                    label={`Tip scrapeado: ${m.tip}`}
                    sx={{ mt: 1.5 }}
                    color="primary"
                  />
                )}
            </Box>
            <Box
              sx={{
                minWidth: 88,
                textAlign: 'center',
                px: 1.5,
                py: 1,
                borderRadius: 2,
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Confianza
              </Typography>
              <Typography variant="h4" fontWeight={800} color="primary.main" lineHeight={1.1}>
                {payload.confidence}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                / 100
              </Typography>
            </Box>
          </Stack>

          <Divider />

          <Box>
            <Typography fontWeight={700} gutterBottom>
              Probabilidades (modelo Poisson)
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
              {/* Charts Apex fuera del PNG (data-export-ignore); las barras sí se exportan */}
              <Box sx={{ flex: 1, minHeight: 260 }} data-export-ignore="1">
                <Chart options={donutOptions} series={donutSeries} type="donut" height={260} width="100%" />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Stack spacing={1}>
                  {(
                    [
                      [homeLabel, payload.probs.home],
                      ['EMPATE', payload.probs.draw],
                      [awayLabel, payload.probs.away],
                    ] as const
                  ).map(([label, v]) => (
                    <Box key={label}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2">{label}</Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {v}%
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, v)}
                        sx={{ height: 7, borderRadius: 1 }}
                      />
                    </Box>
                  ))}
                </Stack>
                <Typography mt={1.5} variant="body2" color="text.secondary">
                  Marcador modelo más probable: <strong>{payload.scoreline.mostLikely}</strong>
                  {payload.scoreline.alternatives.length > 0 &&
                    ` · Alt: ${payload.scoreline.alternatives.join(', ')}`}
                  <Chip size="small" label="modelo" sx={{ ml: 1 }} />
                </Typography>
              </Box>
            </Stack>
          </Box>

          {edgeMarkets.length > 0 && (
            <Box data-export-ignore="1">
              <Typography fontWeight={700} gutterBottom>
                Gráfica de mercados (probabilidad modelo)
              </Typography>
              <Chart options={barOptions} series={barSeries} type="bar" height={280} width="100%" />
            </Box>
          )}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            {[
              ['xG modelo', `${payload.expected.xgHome ?? '—'} | ${payload.expected.xgAway ?? '—'}`],
              [
                'Goles medios (hist.)',
                payload.form?.avgGoalsTotal != null ? String(payload.form.avgGoalsTotal) : '—',
              ],
              [
                'Tarjetas medias',
                payload.form?.avgCards != null ? String(payload.form.avgCards) : '—',
              ],
            ].map(([k, v]) => (
              <Box
                key={k}
                sx={{
                  flex: 1,
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'grey.50',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {k}
                </Typography>
                <Typography fontWeight={700}>{v}</Typography>
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {payload.expected.note}
          </Typography>

          {payload.sportsDb && (
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <Typography fontWeight={700}>TheSportsDB (análisis profundo)</Typography>
                <Chip size="small" label="API free" variant="outlined" />
                {payload.deepAnalysis && <Chip size="small" color="info" label="deep" />}
              </Stack>
              {payload.sportsDb.matchedEvent?.label ? (
                <Typography variant="body2" mb={1}>
                  Evento: <strong>{payload.sportsDb.matchedEvent.label}</strong>
                  {payload.sportsDb.matchedEvent.league
                    ? ` · ${payload.sportsDb.matchedEvent.league}`
                    : ''}
                  {payload.sportsDb.matchedEvent.date
                    ? ` · ${payload.sportsDb.matchedEvent.date}`
                    : ''}
                </Typography>
              ) : (
                <Alert severity="info" variant="outlined" sx={{ mb: 1 }}>
                  Sin match exacto en TheSportsDB; el análisis sigue con scraping + modelo.
                </Alert>
              )}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} mb={1}>
                {[
                  ['Local', payload.sportsDb.home],
                  ['Visitante', payload.sportsDb.away],
                ].map(([side, block]) => {
                  const b = block as NonNullable<typeof payload.sportsDb>['home'];
                  return (
                    <Box
                      key={String(side)}
                      sx={{
                        flex: 1,
                        p: 1.5,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'grey.50',
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" mb={0.75}>
                        <Avatar
                          src={proxiedMediaUrl(b.badge)}
                          sx={{ width: 28, height: 28, fontSize: 11 }}
                          slotProps={{
                            img: {
                              onError: (e) => {
                                e.currentTarget.removeAttribute('src');
                              },
                            },
                          }}
                        >
                          {(b.name ?? String(side)).slice(0, 2)}
                        </Avatar>
                        <Typography fontWeight={700} variant="body2">
                          {b.name ?? String(side)}
                        </Typography>
                      </Stack>
                      {b.recent.length > 0 ? (
                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
                          {b.recent.slice(0, 5).map((r, i) => (
                            <Chip
                              key={`${r.label}-${i}`}
                              size="small"
                              variant="outlined"
                              label={r.score ? `${r.score}` : '—'}
                              title={r.label}
                            />
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Sin últimos resultados API
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
              {payload.sportsDb.notes.length > 0 && (
                <Typography variant="caption" color="text.secondary" display="block">
                  {payload.sportsDb.notes.slice(0, 4).join(' · ')}
                  {` · ~${payload.sportsDb.usedRequestsEstimate} req API`}
                </Typography>
              )}
            </Box>
          )}

          <Box>
            <Typography fontWeight={700} gutterBottom>
              Últimos partidos (scrape + TheSportsDB)
            </Typography>
            {payload.form?.available && payload.form.recentScores.length > 0 ? (
              <Stack spacing={1}>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {payload.form.recentScores.map((s, i) => (
                    <Chip key={`${s}-${i}`} label={s} size="small" variant="outlined" />
                  ))}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {payload.form.message}
                  {payload.form.avgGoalsTotal != null &&
                    ` · Media goles/partido: ${payload.form.avgGoalsTotal}`}
                  {payload.form.cardsTotal != null &&
                    ` · Tarjetas totales muestra: ${payload.form.cardsTotal}`}
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Partido</TableCell>
                      <TableCell>Marcador</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payload.form.rows.slice(0, 10).map((r) => (
                      <TableRow key={r.matchId} hover>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.label}</TableCell>
                        <TableCell>{r.score ?? '—'}</TableCell>
                        <TableCell align="right">
                          {onAnalyzeMatch && (
                            <Button size="small" onClick={() => onAnalyzeMatch(r.matchId)}>
                              Analizar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Stack>
            ) : (
              <Alert severity="warning" variant="outlined">
                {payload.form?.message ??
                  'Sin historial de marcadores. No se muestran datos inventados.'}
              </Alert>
            )}
          </Box>

          {payload.relatedMatches && payload.relatedMatches.length > 0 && (
            <Box>
              <Typography fontWeight={700} gutterBottom>
                Partidos del scanner (clic para analizar)
              </Typography>
              <Stack spacing={0.75}>
                {payload.relatedMatches
                  .filter((rm) => rm.id)
                  .map((rm) => (
                    <Stack
                      key={rm.id}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        cursor: onAnalyzeMatch ? 'pointer' : 'default',
                        '&:hover': onAnalyzeMatch ? { bgcolor: 'action.hover' } : undefined,
                      }}
                      onClick={() => onAnalyzeMatch?.(rm.id)}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <SportIcon sport={m?.sport} />
                        <Box>
                          <Typography fontWeight={600} variant="body2">
                            {rm.homeTeam} vs {rm.awayTeam}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {rm.league}
                            {rm.tip ? ` · tip ${rm.tip}` : ''}
                          </Typography>
                        </Box>
                      </Stack>
                      {onAnalyzeMatch && (
                        <Button size="small" variant="text">
                          Analizar
                        </Button>
                      )}
                    </Stack>
                  ))}
              </Stack>
            </Box>
          )}

          <Box>
            <Typography fontWeight={700} gutterBottom>
              Mejores apuestas
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: '1fr 1fr',
                },
                gap: 1.5,
              }}
            >
              {[...payload.markets]
                .sort((a, b) => b.aiProb - a.aiProb || b.edge - a.edge)
                .slice(0, 4)
                .map((row, i) => {
                  const parts = row.market.split(' · ');
                  const pickPart = parts.length > 1 ? parts.slice(1).join(' · ') : row.market;
                  return (
                    <Box
                      key={`${row.market}-${i}`}
                      sx={{
                        p: 1.75,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'grey.50',
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        color="text.secondary"
                        sx={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
                      >
                        {pickPart}
                      </Typography>
                      <Stack direction="row" alignItems="baseline" spacing={1} mt={0.5}>
                        <Typography variant="h4" fontWeight={800} color="primary.main">
                          {Math.round(row.aiProb)}%
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          cuota {row.odds.toFixed(2)}
                        </Typography>
                      </Stack>
                      <Chip
                        size="small"
                        sx={{ mt: 1 }}
                        label={row.verdict}
                        color={verdictColor[row.verdict] ?? 'default'}
                      />
                    </Box>
                  );
                })}
            </Box>
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            {(
              [
                ['Value', payload.picks.value, 'success.light'],
                ['Seguro', payload.picks.safe, 'info.light'],
                ['Arriesgado', payload.picks.risky, 'warning.light'],
                ['Evitar', payload.picks.avoid, 'error.light'],
              ] as const
            ).map(([title, pick, bg]) => (
              <Box
                key={title}
                sx={{
                  flex: 1,
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: bg,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" fontWeight={700}>
                  {title}
                </Typography>
                {pick ? (
                  <>
                    <Typography fontWeight={700}>{pick.market}</Typography>
                    <Typography variant="body2">
                      @{pick.odds.toFixed(2)} · {pick.aiProb}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                      {pick.rationale}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    —
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>

          {payload.proposedAccumulators.length > 0 && (
            <Box>
              <Typography fontWeight={700} gutterBottom>
                Combinadas propuestas
              </Typography>
              <Stack spacing={1}>
                {payload.proposedAccumulators.map((acc, i) => (
                  <Box
                    key={i}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'grey.50',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5} flexWrap="wrap">
                      <Typography fontWeight={600}>{acc.title}</Typography>
                      <Chip size="small" label={acc.riskTier} />
                      <Chip size="small" variant="outlined" label={`@ ${acc.totalOdds}`} />
                    </Stack>
                    {acc.legs.map((leg, j) => (
                      <Stack
                        key={j}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ py: 0.35 }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={800} component="span">
                            {leg.matchLabel}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" component="div">
                            Posible resultado: <strong>{leg.market}</strong> @{leg.odds}
                          </Typography>
                        </Box>
                        {leg.matchId && onAnalyzeMatch && (
                          <Button size="small" onClick={() => onAnalyzeMatch(leg.matchId!)}>
                            Ver partido
                          </Button>
                        )}
                      </Stack>
                    ))}
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {payload.matchDiagnostics &&
            (payload.matchDiagnostics.teamStats.length > 0 ||
              payload.matchDiagnostics.players.length > 0) && (
              <Box>
                <Typography fontWeight={700} gutterBottom>
                  Diagnósticos del partido
                </Typography>
                {payload.matchDiagnostics.teamStats.length > 0 && (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' },
                      gap: 1,
                      mb: 2,
                    }}
                  >
                    {payload.matchDiagnostics.teamStats.map((s) => (
                      <Box
                        key={s.name}
                        sx={{
                          p: 1.25,
                          borderRadius: 1.5,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'grey.50',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          {s.name}
                        </Typography>
                        <Typography fontWeight={700} variant="body2">
                          {s.value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                {payload.matchDiagnostics.players.length > 0 && (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      Jugadores (cronología · tiros a puerta = mín. por gol)
                    </Typography>
                    <Table size="small" sx={{ mt: 0.5 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Jugador</TableCell>
                          <TableCell>Equipo</TableCell>
                          <TableCell align="center">Goles</TableCell>
                          <TableCell align="center">Asist.</TableCell>
                          <TableCell align="center">TA</TableCell>
                          <TableCell align="center">TR</TableCell>
                          <TableCell align="center">Tiros puerta*</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {payload.matchDiagnostics.players.slice(0, 12).map((p) => (
                          <TableRow key={`${p.player}-${p.team}`} hover>
                            <TableCell>{p.player}</TableCell>
                            <TableCell>{p.team}</TableCell>
                            <TableCell align="center">{p.goals}</TableCell>
                            <TableCell align="center">{p.assists}</TableCell>
                            <TableCell align="center">{p.yellowCards}</TableCell>
                            <TableCell align="center">{p.redCards}</TableCell>
                            <TableCell align="center">{p.shotsOnTargetMin}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                      * TheSportsDB free no publica tackles ni tiros Opta por jugador. La IA usa
                      estos mínimos + stats de equipo.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

          <Box
            sx={{
              p: 2,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'grey.50',
            }}
          >
            <Typography fontWeight={700} gutterBottom>
              {brief?.headline ?? 'Resumen del análisis'}
            </Typography>
            {payload.edgeSummary && (
              <Typography variant="body2" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>
                {payload.edgeSummary}
              </Typography>
            )}
            <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
              {(brief?.bullets ?? []).map((b, i) => {
                const partido = b.match(/^Partido:\s*(.+?)\s*\(/);
                if (partido) {
                  const rest = b.slice('Partido: '.length);
                  const vsIdx = rest.search(/\s*\(/);
                  const matchName = vsIdx > 0 ? rest.slice(0, vsIdx) : rest;
                  const after = vsIdx > 0 ? rest.slice(vsIdx) : '';
                  return (
                    <Typography key={i} component="li" variant="body2">
                      Partido: <strong>{matchName.trim()}</strong>
                      {after}
                    </Typography>
                  );
                }
                return (
                  <Typography key={i} component="li" variant="body2">
                    {b}
                  </Typography>
                );
              })}
            </Stack>
            {brief?.dataSources && (
              <Box mt={2}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  Fuentes usadas
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.75} mt={0.5}>
                  {brief.dataSources.map((s) => (
                    <Chip key={s} size="small" variant="outlined" label={s} />
                  ))}
                </Stack>
              </Box>
            )}
            {brief?.limitations && (
              <Box mt={1.5}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  Limitaciones
                </Typography>
                <Stack component="ul" sx={{ m: 0, pl: 2.5 }} spacing={0.25}>
                  {brief.limitations.map((l, i) => (
                    <Typography key={i} component="li" variant="caption" color="text.secondary">
                      {l}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
