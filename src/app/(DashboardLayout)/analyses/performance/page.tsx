'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import { apiUrl } from '@/lib/paths';

type Summary = {
  totalAnalyses: number;
  settledAnalyses: number;
  pendingAnalyses: number;
  totalHits: number;
  totalMisses: number;
  totalPushes: number;
  overallHitRate: number | null;
  overallHitPct: number | null;
};

type PickRow = {
  label: string;
  market: string;
  status: string;
  reason: string;
};

type AccRow = {
  analysisId: string;
  mode: string;
  createdAt: string;
  matchLabel: string;
  league: string;
  phase: string | null;
  score: string | null;
  provider: string;
  picks: PickRow[];
  hitRate: number | null;
  hits: number;
  misses: number;
  pending: boolean;
};

type ComboIdea = {
  analysisId: string;
  matchLabel: string;
  title: string;
  riskTier: string;
  totalOdds: number;
  legs: string[];
};

function statusChip(status: string) {
  const map: Record<
    string,
    { label: string; color: 'success' | 'error' | 'warning' | 'default' | 'info' }
  > = {
    hit: { label: 'Acierto', color: 'success' },
    miss: { label: 'Fallo', color: 'error' },
    push: { label: 'Push', color: 'warning' },
    pending: { label: 'Pendiente', color: 'info' },
    unknown: { label: 'N/D', color: 'default' },
  };
  const m = map[status] ?? map.unknown;
  return <Chip size="small" label={m.label} color={m.color} variant="outlined" />;
}

/**
 * Panel de rendimiento: totales, % aciertos y más combinadas sugeridas.
 */
export default function AnalysesPerformancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<AccRow[]>([]);
  const [combos, setCombos] = useState<ComboIdea[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/analyses/performance'));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : `Error ${res.status}`);
        return;
      }
      setSummary(data.summary ?? null);
      setRows(data.rows ?? []);
      setCombos(data.comboIdeas ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hitPct = summary?.overallHitPct;

  return (
    <PageContainer
      title="Rendimiento de análisis"
      description="Aciertos vs partidos finalizados y más combinadas"
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Rendimiento y aciertos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Compara picks de análisis previos con marcadores finales. Los mercados de stats
            (córners, remates, etc.) requieren box-score y se marcan N/D si solo hay goles.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && !summary ? (
        <Stack alignItems="center" py={6}>
          <CircularProgress />
        </Stack>
      ) : (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={3}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Análisis totales
                </Typography>
                <Typography variant="h3" fontWeight={700}>
                  {summary?.totalAnalyses ?? 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Liquidados: {summary?.settledAnalyses ?? 0} · Pendientes:{' '}
                  {summary?.pendingAnalyses ?? 0}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  % aciertos (picks evaluables)
                </Typography>
                <Typography variant="h3" fontWeight={700} color="success.main">
                  {hitPct != null ? `${hitPct}%` : '—'}
                </Typography>
                {hitPct != null && (
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, hitPct)}
                    sx={{ mt: 1, height: 8, borderRadius: 1 }}
                    color="success"
                  />
                )}
                <Typography variant="body2" color="text.secondary" mt={1}>
                  {summary?.totalHits ?? 0} aciertos · {summary?.totalMisses ?? 0} fallos
                  {summary?.totalPushes ? ` · ${summary.totalPushes} push` : ''}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Ideas de combinada
                </Typography>
                <Typography variant="h3" fontWeight={700}>
                  {combos.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Extraídas de análisis recientes (huecos multi-mercado)
                </Typography>
              </CardContent>
            </Card>
          </Stack>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Historial de análisis vs resultado
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Partido</TableCell>
                      <TableCell>Marcador</TableCell>
                      <TableCell>Picks</TableCell>
                      <TableCell align="right">Aciertos</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <Typography color="text.secondary">
                            Aún no hay análisis. Genera algunos en Análisis IA.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((r) => (
                      <TableRow key={r.analysisId} hover>
                        <TableCell>
                          <Typography variant="caption" display="block">
                            {new Date(r.createdAt).toLocaleString()}
                          </Typography>
                          <Chip size="small" label={r.mode} sx={{ mt: 0.5 }} />
                        </TableCell>
                        <TableCell>
                          <Typography fontWeight={600}>{r.matchLabel}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {r.league} · {r.provider}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {r.score ? (
                            <Chip label={r.score} color="primary" size="small" />
                          ) : r.pending ? (
                            <Chip label="Pendiente" size="small" variant="outlined" />
                          ) : (
                            '—'
                          )}
                          {r.phase && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              {r.phase}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            {r.picks.length === 0 && (
                              <Typography variant="caption" color="text.secondary">
                                Sin picks estructurados
                              </Typography>
                            )}
                            {r.picks.map((p, i) => (
                              <Stack
                                key={`${r.analysisId}-${i}`}
                                direction="row"
                                spacing={1}
                                alignItems="center"
                              >
                                {statusChip(p.status)}
                                <Typography variant="caption">
                                  {p.label} · {p.reason}
                                </Typography>
                              </Stack>
                            ))}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          {r.hitRate != null ? (
                            <Typography fontWeight={700} color="success.main">
                              {Math.round(r.hitRate * 100)}%
                            </Typography>
                          ) : (
                            <Typography color="text.secondary">—</Typography>
                          )}
                          <Typography variant="caption" display="block">
                            {r.hits}/{r.hits + r.misses}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Más combinaciones posibles
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Incluye huecos same-game (resultado + córners/remates/BTTS/O-U) de análisis
                recientes. Reanaliza partidos para refrescar con los nuevos mercados por deporte.
              </Typography>
              <Stack spacing={1.5}>
                {combos.length === 0 && (
                  <Alert severity="info">
                    No hay combinadas en el historial aún. Analiza partidos para generarlas.
                  </Alert>
                )}
                {combos.map((c, idx) => (
                  <Box
                    key={`${c.analysisId}-${idx}`}
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      spacing={1}
                    >
                      <Box>
                        <Typography fontWeight={700}>{c.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.matchLabel}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={c.riskTier} />
                        <Chip size="small" color="primary" label={`@${c.totalOdds}`} />
                      </Stack>
                    </Stack>
                    <Stack spacing={0.25} mt={1}>
                      {c.legs.map((leg, i) => (
                        <Typography key={i} variant="body2">
                          · {leg}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
