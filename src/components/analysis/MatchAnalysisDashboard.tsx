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
import MatchPredictionPanel from '@/components/analysis/MatchPredictionPanel';
import { proxiedMediaUrl } from '@/lib/media-proxy';
import { exportNodeToPng } from '@/lib/export-png';
import { translateAnalysisMode, translateVerdict } from '@/lib/ai/labels-es';
import { RECENT_MATCHES_MAX, RECENT_MATCHES_MIN } from '@/lib/ai/form-stats';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const verdictColor: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  value: 'success',
  safe: 'info',
  risky: 'warning',
  avoid: 'error',
  neutral: 'default',
};

const accRiskBorder: Record<string, string> = {
  safe: 'info.main',
  value: 'success.main',
  risky: 'warning.main',
};

function isSameMatchLeg(
  leg: { matchId?: string; matchLabel: string },
  matchId: string | undefined,
  homeTeam: string | undefined,
  awayTeam: string | undefined
): boolean {
  if (matchId && leg.matchId) return leg.matchId === matchId;
  if (homeTeam && awayTeam) {
    const label = `${homeTeam} vs ${awayTeam}`;
    return leg.matchLabel === label || leg.matchLabel.includes(homeTeam);
  }
  return false;
}

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
  const edgeMarkets = useMemo(() => {
    if (!valid) return [];
    // Prioriza 1X2, goles, BTTS, tarjetas, faltas, córners/remates
    const rank = (m: string) => {
      const l = m.toLowerCase();
      if (/gana|empate|1x2|local|visitante/.test(l) && !/hándic|handicap|ah /.test(l)) return 0;
      if (/goles|btts|ambos/.test(l)) return 1;
      if (/tarjeta|card/.test(l)) return 2;
      if (/falta|foul/.test(l)) return 3;
      if (/c[oó]rner|remate/.test(l)) return 4;
      return 5;
    };
    return [...payload.markets]
      .sort((a, b) => rank(a.market) - rank(b.market) || b.aiProb - a.aiProb)
      .slice(0, 14);
  }, [valid, payload.markets]);

  const tableMarkets = useMemo(() => {
    if (!valid) return [];
    return [...payload.markets]
      .sort((a, b) => b.aiProb - a.aiProb || b.edge - a.edge)
      .slice(0, 20);
  }, [valid, payload.markets]);

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

  const barOptions = useMemo(() => {
    const colors = edgeMarkets.map((r) => {
      if (r.verdict === 'value') return theme.palette.success.main;
      if (r.verdict === 'safe') return theme.palette.info.main;
      if (r.verdict === 'risky') return theme.palette.warning.main;
      if (r.verdict === 'avoid') return theme.palette.error.main;
      return theme.palette.grey[500];
    });
    return {
      chart: { type: 'bar' as const, fontFamily: 'inherit', toolbar: { show: false } },
      plotOptions: {
        bar: { horizontal: true, borderRadius: 4, barHeight: '68%', distributed: true },
      },
      xaxis: {
        categories: edgeMarkets.map((r) =>
          r.market.length > 36 ? `${r.market.slice(0, 34)}…` : r.market
        ),
        max: 100,
        labels: { formatter: (v: string) => `${v}%` },
      },
      colors,
      legend: { show: false },
      dataLabels: {
        enabled: true,
        formatter: (v: number) => `${Number(v).toFixed(0)}%`,
        style: { fontSize: '11px', fontWeight: 700 },
      },
      tooltip: {
        y: {
          formatter: (v: number, opts: { dataPointIndex: number }) => {
            const row = edgeMarkets[opts.dataPointIndex];
            if (!row) return `${Number(v).toFixed(1)}%`;
            return `Prob. ${row.aiProb.toFixed(1)}% · cuota ${row.odds.toFixed(2)} · ventaja ${
              row.edge >= 0 ? '+' : ''
            }${row.edge.toFixed(1)} · ${translateVerdict(row.verdict)}`;
          },
        },
      },
    };
  }, [edgeMarkets, theme]);
  const barSeries = [
    { name: 'Prob. modelo', data: edgeMarkets.map((r) => Math.round(r.aiProb * 10) / 10) },
  ];

  const styleLabel = (s?: string) => {
    if (s === 'strict') return 'Estricto (cobra mucho)';
    if (s === 'lenient') return 'Permisivo (deja jugar)';
    if (s === 'balanced') return 'Equilibrado';
    return 'Desconocido';
  };

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
          date={payload.match?.matchDate ?? payload.sportsDb?.matchedEvent?.date}
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
                  {translateAnalysisMode(payload.mode)}
                </Typography>
                {payload.aiCascade?.neuralOnly || (!payload.llmUsed && payload.aiCascade) ? (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label="Red Neuronal"
                  />
                ) : payload.llmUsed ? (
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
              Probabilidades (Poisson + mercado)
            </Typography>
            <MatchPredictionPanel
              payload={payload}
              homeTeam={m?.homeTeam ?? 'Local'}
              awayTeam={m?.awayTeam ?? 'Visitante'}
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch" mt={2}>
              <Box sx={{ flex: 1, minHeight: 220 }} data-export-ignore="1">
                <Chart options={donutOptions} series={donutSeries} type="donut" height={220} width="100%" />
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
                {payload.scoreline.alternatives.length > 0 && (
                  <Typography mt={1.5} variant="body2" color="text.secondary">
                    Alternativas: {payload.scoreline.alternatives.join(', ')}
                  </Typography>
                )}
              </Box>
            </Stack>
          </Box>

          {edgeMarkets.length > 0 && (
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={0.5} flexWrap="wrap">
                <Typography fontWeight={700}>Gráfica de mercados (probabilidad modelo)</Typography>
                <Chip size="small" label="color = veredicto" variant="outlined" />
                {payload.contextMultipliers &&
                  payload.contextMultipliers.note !== 'sin ajuste contextual' && (
                    <Chip
                      size="small"
                      color="warning"
                      label={`Ajuste: ${payload.contextMultipliers.note}`}
                    />
                  )}
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Verde valor · azul seguro · ámbar arriesgado · rojo evitar. Tooltip: cuota + ventaja.
              </Typography>
              <Box data-export-ignore="1">
                <Chart
                  options={barOptions}
                  series={barSeries}
                  type="bar"
                  height={Math.max(280, edgeMarkets.length * 28)}
                  width="100%"
                />
              </Box>

              <Typography fontWeight={700} mt={2} mb={1}>
                Mercados principales
              </Typography>
              <Table size="small" sx={{ mb: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Mercado</TableCell>
                    <TableCell align="right">Cuota</TableCell>
                    <TableCell align="right">Prob. IA</TableCell>
                    <TableCell align="right">Ventaja</TableCell>
                    <TableCell align="center">Veredicto</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableMarkets.map((row) => (
                    <TableRow key={`${row.market}-${row.line ?? ''}-${row.odds}`} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {row.market}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.source === 'book'
                            ? 'cuota casa'
                            : row.source === 'model'
                              ? 'modelo'
                              : 'implícita modelo'}
                          {row.line ? ` · línea ${row.line}` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={row.odds.toFixed(2)} color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">{row.aiProb.toFixed(1)}%</TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color={row.edge >= 2 ? 'success.main' : row.edge <= -4 ? 'error.main' : 'text.primary'}
                          fontWeight={600}
                        >
                          {row.edge >= 0 ? '+' : ''}
                          {row.edge.toFixed(1)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={translateVerdict(row.verdict)}
                          color={verdictColor[row.verdict] ?? 'default'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            {[
              ['xG modelo', `${payload.expected.xgHome ?? '—'} | ${payload.expected.xgAway ?? '—'}`],
              [
                'Córners esp.',
                payload.expected.cornersHome != null
                  ? `${payload.expected.cornersHome} | ${payload.expected.cornersAway ?? '—'}`
                  : '—',
              ],
              [
                'Tarjetas esp.',
                payload.expected.cardsHome != null
                  ? `${payload.expected.cardsHome} | ${payload.expected.cardsAway ?? '—'}`
                  : payload.form?.avgCards != null
                    ? `hist. ${payload.form.avgCards}`
                    : '—',
              ],
              [
                'Goles medios (hist.)',
                payload.form?.avgGoalsTotal != null ? String(payload.form.avgGoalsTotal) : '—',
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

          {(payload.referee || payload.absences) && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              {payload.referee && (
                <Box
                  sx={{
                    flex: 1,
                    p: 1.5,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor:
                      payload.referee.style === 'strict'
                        ? 'warning.50'
                        : payload.referee.style === 'lenient'
                          ? 'success.50'
                          : 'grey.50',
                  }}
                >
                  <Typography fontWeight={700} gutterBottom>
                    Árbitro / disciplina
                  </Typography>
                  <Typography variant="body2">
                    <strong>{payload.referee.name ?? 'Sin nombre confirmado'}</strong>
                    {' · '}
                    {styleLabel(payload.referee.style)}
                  </Typography>
                  <Stack direction="row" spacing={0.75} mt={0.75} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={`Fuente: ${payload.referee.source}`} />
                    <Chip
                      size="small"
                      color={
                        payload.referee.cardsTendency === 'high'
                          ? 'warning'
                          : payload.referee.cardsTendency === 'low'
                            ? 'success'
                            : 'default'
                      }
                      label={`Tarjetas: ${payload.referee.cardsTendency}`}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
                    {payload.referee.notes}
                  </Typography>
                </Box>
              )}
              {payload.absences && (
                <Box
                  sx={{
                    flex: 1,
                    p: 1.5,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'grey.50',
                  }}
                >
                  <Typography fontWeight={700} gutterBottom>
                    Bajas / dudas
                  </Typography>
                  {[
                    ['Local', payload.absences.home, m?.homeTeam],
                    ['Visitante', payload.absences.away, m?.awayTeam],
                  ].map(([side, list, team]) => {
                    const rows = list as NonNullable<typeof payload.absences>['home'];
                    return (
                      <Box key={String(side)} mb={0.75}>
                        <Typography variant="caption" color="text.secondary">
                          {String(team ?? side)}
                        </Typography>
                        {rows.length === 0 ? (
                          <Typography variant="body2">Sin bajas listadas</Typography>
                        ) : (
                          <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.25}>
                            {rows.map((a) => (
                              <Chip
                                key={`${a.player}-${a.reason}`}
                                size="small"
                                color={
                                  a.impact === 'high'
                                    ? 'error'
                                    : a.impact === 'medium'
                                      ? 'warning'
                                      : 'default'
                                }
                                label={`${a.player}${a.reason ? ` (${a.reason})` : ''}`}
                              />
                            ))}
                          </Stack>
                        )}
                      </Box>
                    );
                  })}
                  <Typography variant="caption" color="text.secondary">
                    {payload.absences.notes}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}

          {payload.scenarios && payload.scenarios.length > 0 && (
            <Box>
              <Typography fontWeight={700} gutterBottom>
                Escenarios (what-if)
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                {payload.scenarios.map((sc) => {
                  const h = Math.round(payload.probs.home + sc.probShifts.home);
                  const d = Math.round(payload.probs.draw + sc.probShifts.draw);
                  const a = Math.round(payload.probs.away + sc.probShifts.away);
                  return (
                    <Box
                      key={sc.id}
                      sx={{
                        flex: '1 1 220px',
                        p: 1.5,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: sc.id === 'base' ? 'primary.main' : 'divider',
                        bgcolor: 'background.paper',
                      }}
                    >
                      <Typography fontWeight={700} variant="body2">
                        {sc.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                        {sc.assumptions}
                      </Typography>
                      <Typography variant="body2" mt={0.75}>
                        1X2 esc.: <strong>{h}%</strong> / <strong>{d}%</strong> / <strong>{a}%</strong>
                      </Typography>
                      <Typography variant="caption" display="block" mt={0.5}>
                        {sc.impactSummary}
                      </Typography>
                      {sc.focusMarkets.length > 0 && (
                        <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.75}>
                          {sc.focusMarkets.slice(0, 4).map((fm) => (
                            <Chip key={fm} size="small" variant="outlined" label={fm} />
                          ))}
                        </Stack>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

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
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Misma categoría del partido analizado (sin mezclar femenino/juvenil). Alias de club
              deduplicados (p. ej. Astana ≈ FC Astana). Objetivo: al menos {RECENT_MATCHES_MIN}{' '}
              partidos recientes por equipo (hasta {RECENT_MATCHES_MAX}).
            </Typography>
            {payload.form?.available && formDisplayRows.length > 0 ? (
              <Stack spacing={1}>
                {(formSampleCounts.home < RECENT_MATCHES_MIN ||
                  formSampleCounts.away < RECENT_MATCHES_MIN) && (
                  <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                    Muestra limitada: {m?.homeTeam ?? 'Local'} {formSampleCounts.home} ·{' '}
                    {m?.awayTeam ?? 'Visitante'} {formSampleCounts.away} (objetivo ≥
                    {RECENT_MATCHES_MIN} c/u). Se usa todo lo disponible en scrape + APIs.
                  </Alert>
                )}
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
                    {formDisplayRows.map((r) => (
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

          {(payload.form?.homeForm || payload.form?.awayForm) && (
            <Box>
              <Typography fontWeight={700} gutterBottom>
                Comparativa forma reciente (prioridad del modelo)
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Últimos partidos sin contar H2H directo. Pesa más que enfrentamientos históricos entre ambos.
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                {[
                  {
                    label: m?.homeTeam ?? 'Local',
                    stats: payload.form?.homeForm,
                  },
                  {
                    label: m?.awayTeam ?? 'Visitante',
                    stats: payload.form?.awayForm,
                  },
                ].map(({ label, stats }) =>
                  stats ? (
                    <Box
                      key={label}
                      sx={{
                        flex: 1,
                        p: 1.5,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="subtitle2" gutterBottom>
                        {label}
                      </Typography>
                      <Stack spacing={0.5}>
                        <Typography variant="body2">
                          GF {stats.avgGoalsFor} · GA {stats.avgGoalsAgainst}
                        </Typography>
                        <Typography variant="body2">
                          V/E/D: {Math.round(stats.winRate * 100)}% /{' '}
                          {Math.round(stats.drawRate * 100)}% /{' '}
                          {Math.round(stats.lossRate * 100)}%
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Muestra ponderada: {stats.sampleSize} partidos
                        </Typography>
                      </Stack>
                    </Box>
                  ) : null
                )}
              </Stack>
            </Box>
          )}

          {(payload.form?.h2h?.length ||
            payload.form?.homeSeason?.length ||
            payload.form?.awaySeason?.length) && (
            <Box>
              <Typography fontWeight={700} gutterBottom>
                H2H y forma de temporada/torneo
              </Typography>
              <Stack spacing={1.5}>
                {payload.form?.h2h && payload.form.h2h.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Enfrentamientos previos (H2H)
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.75}>
                      {payload.form.h2h.map((r) => (
                        <Chip
                          key={`h2h-${r.matchId}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          label={`${r.date}: ${r.label} ${r.score ?? ''}`}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
                {payload.form?.homeSeason && payload.form.homeSeason.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Forma reciente · {m?.homeTeam ?? 'Local'}
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.75}>
                      {payload.form.homeSeason.map((r) => (
                        <Chip
                          key={`hs-${r.matchId}`}
                          size="small"
                          label={`${r.score ?? '—'} (${r.date})`}
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
                {payload.form?.awaySeason && payload.form.awaySeason.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Forma reciente · {m?.awayTeam ?? 'Visitante'}
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.75}>
                      {payload.form.awaySeason.map((r) => (
                        <Chip
                          key={`as-${r.matchId}`}
                          size="small"
                          label={`${r.score ?? '—'} (${r.date})`}
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </Box>
          )}

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
                        label={translateVerdict(row.verdict)}
                        color={verdictColor[row.verdict] ?? 'default'}
                      />
                    </Box>
                  );
                })}
            </Box>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: 1,
            }}
          >
            {(
              [
                ['Valor', payload.picks.value, 'success.light'],
                ['Seguro', payload.picks.safe, 'info.light'],
                ['Arriesgado', payload.picks.risky, 'warning.light'],
                ['Evitar', payload.picks.avoid, 'error.light'],
              ] as const
            ).map(([title, pick, bg]) => (
              <Box
                key={title}
                sx={{
                  p: { xs: 1, sm: 1.5 },
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
                    <Typography variant="body2" fontWeight={700} sx={{ mt: 0.25, lineHeight: 1.35 }}>
                      {pick.market}
                    </Typography>
                    <Typography variant="caption" display="block">
                      @{pick.odds.toFixed(2)} · {pick.aiProb}%
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    —
                  </Typography>
                )}
              </Box>
            ))}
          </Box>

          {payload.proposedAccumulators.length > 0 && (
            <Box>
              <Typography fontWeight={700} gutterBottom>
                Combinadas propuestas
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    lg: 'repeat(3, 1fr)',
                  },
                  gap: 1,
                }}
              >
                {payload.proposedAccumulators.map((acc, i) => {
                  const singleMatchContext =
                    payload.mode === 'MATCH' ||
                    acc.legs.every((leg) =>
                      isSameMatchLeg(leg, m?.id, m?.homeTeam, m?.awayTeam)
                    );

                  return (
                    <Box
                      key={i}
                      sx={{
                        p: 1.25,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: accRiskBorder[acc.riskTier] ?? 'divider',
                        bgcolor: 'grey.50',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.75,
                      }}
                    >
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                        <Typography variant="body2" fontWeight={700}>
                          {acc.title}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`@${acc.totalOdds.toFixed(2)}`}
                          sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' } }}
                        />
                      </Stack>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns:
                            acc.legs.length > 1 ? { xs: '1fr', sm: '1fr 1fr' } : '1fr',
                          gap: 0.5,
                        }}
                      >
                        {acc.legs.map((leg, j) => {
                          const showMatchLabel =
                            !singleMatchContext &&
                            !isSameMatchLeg(leg, m?.id, m?.homeTeam, m?.awayTeam);
                          const showNavigate =
                            onAnalyzeMatch &&
                            leg.matchId &&
                            leg.matchId !== m?.id;

                          return (
                            <Box
                              key={j}
                              sx={{
                                px: 0.75,
                                py: 0.5,
                                borderRadius: 1,
                                bgcolor: 'background.paper',
                                border: '1px solid',
                                borderColor: 'divider',
                              }}
                            >
                              {showMatchLabel && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  display="block"
                                  noWrap
                                  title={leg.matchLabel}
                                >
                                  {leg.matchLabel}
                                </Typography>
                              )}
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="baseline"
                                spacing={0.5}
                              >
                                <Typography
                                  variant="body2"
                                  fontWeight={600}
                                  sx={{ lineHeight: 1.3, minWidth: 0 }}
                                >
                                  {leg.market}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  fontWeight={800}
                                  color="primary.main"
                                  sx={{ flexShrink: 0 }}
                                >
                                  @{leg.odds.toFixed(2)}
                                </Typography>
                              </Stack>
                              {showNavigate && (
                                <Button
                                  size="small"
                                  variant="text"
                                  sx={{ mt: 0.25, p: 0, minWidth: 0, fontSize: '0.7rem' }}
                                  onClick={() => onAnalyzeMatch!(leg.matchId!)}
                                >
                                  Ver partido
                                </Button>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
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
