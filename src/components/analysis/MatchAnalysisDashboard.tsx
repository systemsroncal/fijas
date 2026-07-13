'use client';

import { useRef, useState } from 'react';
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
import { sportLabel, teamMonogram, type SportKind } from '@/lib/match-display';

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
  if (s === 'other') return <IconQuestionMark {...props} />;
  return <IconBallFootball {...props} />;
}

function TeamBadge({
  name,
  crestUrl,
}: {
  name: string;
  crestUrl?: string | null;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Avatar
        src={crestUrl || undefined}
        alt={name}
        sx={{ width: 36, height: 36, fontSize: 13, bgcolor: 'primary.main', fontWeight: 700 }}
      >
        {!crestUrl ? teamMonogram(name) : null}
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
}: {
  payload: StructuredMatchPayload;
  onAnalyzeMatch?: (matchId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  if (!payload?.probs || !Array.isArray(payload.markets) || !payload.scoreline) {
    return (
      <Alert severity="warning" variant="outlined">
        Este resultado no es un análisis de partido completo. Usa «Por partido» o «Aleatorio /
        huecos», o pulsa «Ver resultado» en historial de combinadas.
      </Alert>
    );
  }

  const m = payload.match;
  const brief = payload.brief ?? withBrief(payload).brief;

  const exportPng = async () => {
    if (!ref.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const a = document.createElement('a');
      const name = m ? `${m.homeTeam}-vs-${m.awayTeam}` : 'analisis';
      a.download = `${name.replace(/\s+/g, '_')}-analisis.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="outlined" size="small" onClick={exportPng} disabled={exporting}>
          {exporting ? 'Exportando…' : 'Exportar PNG'}
        </Button>
      </Stack>

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
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <SportIcon sport={m?.sport} />
                <Typography variant="overline" color="text.secondary">
                  {sportLabel((m?.sport as SportKind) ?? 'football')} · {m?.league ?? 'Scanner'} ·{' '}
                  {payload.mode}
                </Typography>
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
              {m?.tip && (
                <Chip size="small" label={`Tip scrapeado: ${m.tip}`} sx={{ mt: 1.5 }} color="primary" />
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
            <Stack spacing={1}>
              {(
                [
                  ['Local', payload.probs.home],
                  ['Empate', payload.probs.draw],
                  ['Visitante', payload.probs.away],
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

          <Box>
            <Typography fontWeight={700} gutterBottom>
              Últimos partidos (solo scrapados)
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

          <Box sx={{ overflowX: 'auto' }}>
            <Typography fontWeight={700} gutterBottom>
              Mercados
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Mercado</TableCell>
                  <TableCell>Cuota</TableCell>
                  <TableCell>Prob</TableCell>
                  <TableCell>Edge</TableCell>
                  <TableCell>Origen</TableCell>
                  <TableCell>Veredicto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payload.markets.slice(0, 16).map((row, i) => (
                  <TableRow key={`${row.market}-${i}`}>
                    <TableCell>{row.market}</TableCell>
                    <TableCell>{row.odds.toFixed(2)}</TableCell>
                    <TableCell>{row.aiProb}%</TableCell>
                    <TableCell>{(row.edge * 100).toFixed(1)}%</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={
                          row.source === 'book'
                            ? 'casa'
                            : row.source === 'implied'
                              ? 'implícita'
                              : row.source
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.verdict}
                        color={verdictColor[row.verdict] ?? 'default'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                      >
                        <Typography variant="body2" color="text.secondary">
                          {leg.matchLabel}: {leg.market} @{leg.odds}
                        </Typography>
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
            <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
              {(brief?.bullets ?? []).map((b, i) => (
                <Typography key={i} component="li" variant="body2">
                  {b}
                </Typography>
              ))}
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
