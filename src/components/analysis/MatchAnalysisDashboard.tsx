'use client';

import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';

const verdictColor: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  value: 'success',
  safe: 'info',
  risky: 'warning',
  avoid: 'error',
  neutral: 'default',
};

/**
 * Dashboard de análisis por partido / scanner (exportable a PNG).
 */
export default function MatchAnalysisDashboard({
  payload,
}: {
  payload: StructuredMatchPayload;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportPng = async () => {
    if (!ref.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0b1220',
      });
      const a = document.createElement('a');
      const name = payload.match
        ? `${payload.match.homeTeam}-vs-${payload.match.awayTeam}`
        : 'analisis';
      a.download = `${name.replace(/\s+/g, '_')}-analisis.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const m = payload.match;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="outlined" onClick={exportPng} disabled={exporting}>
          {exporting ? 'Exportando…' : 'Exportar PNG'}
        </Button>
      </Stack>

      <Box
        ref={ref}
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: '#0b1220',
          color: '#e8eef7',
          border: '1px solid #1e2a3f',
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography variant="overline" sx={{ opacity: 0.7 }}>
                {m?.league ?? 'Scanner'} · {payload.mode}
              </Typography>
              <Typography variant="h5" fontWeight={800}>
                {m ? `${m.homeTeam} vs ${m.awayTeam}` : 'Análisis aleatorio'}
              </Typography>
              {m?.tip && (
                <Chip size="small" label={`Tip scrapeado: ${m.tip}`} sx={{ mt: 1 }} color="primary" />
              )}
            </Box>
            <Box textAlign="center">
              <Typography variant="caption" display="block">
                Confianza
              </Typography>
              <Typography variant="h4" fontWeight={800} color="primary.light">
                {payload.confidence}
              </Typography>
              <Typography variant="caption">/ 100</Typography>
            </Box>
          </Stack>

          <Card sx={{ bgcolor: '#121a2b' }}>
            <CardContent>
              <Typography fontWeight={700} gutterBottom>
                Probabilidades IA (modelo)
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
                      sx={{ height: 8, borderRadius: 1 }}
                    />
                  </Box>
                ))}
              </Stack>
              <Typography mt={2} variant="body2">
                Marcador más probable:{' '}
                <strong>{payload.scoreline.mostLikely}</strong>
                {payload.scoreline.alternatives.length > 0 &&
                  ` · Alt: ${payload.scoreline.alternatives.join(', ')}`}
              </Typography>
            </CardContent>
          </Card>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            {[
              ['xG', `${payload.expected.xgHome} | ${payload.expected.xgAway}`],
              ['Córners', `${payload.expected.cornersHome} | ${payload.expected.cornersAway}`],
              ['Tarjetas', `${payload.expected.cardsHome} | ${payload.expected.cardsAway}`],
            ].map(([k, v]) => (
              <Card key={k} sx={{ flex: 1, bgcolor: '#121a2b' }}>
                <CardContent>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    {k} esp.
                  </Typography>
                  <Typography fontWeight={700}>{v}</Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Card sx={{ bgcolor: '#121a2b' }}>
            <CardContent sx={{ overflowX: 'auto' }}>
              <Typography fontWeight={700} gutterBottom>
                Mercados principales
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#9fb0c9' }}>Mercado</TableCell>
                    <TableCell sx={{ color: '#9fb0c9' }}>Cuota</TableCell>
                    <TableCell sx={{ color: '#9fb0c9' }}>Prob IA</TableCell>
                    <TableCell sx={{ color: '#9fb0c9' }}>Edge</TableCell>
                    <TableCell sx={{ color: '#9fb0c9' }}>Veredicto</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payload.markets.slice(0, 16).map((row, i) => (
                    <TableRow key={`${row.market}-${i}`}>
                      <TableCell sx={{ color: '#e8eef7' }}>
                        {row.market}
                        {row.line ? ` (${row.line})` : ''}
                        {row.source === 'estimated' ? ' *' : ''}
                      </TableCell>
                      <TableCell sx={{ color: '#e8eef7' }}>{row.odds.toFixed(2)}</TableCell>
                      <TableCell sx={{ color: '#e8eef7' }}>{row.aiProb}%</TableCell>
                      <TableCell sx={{ color: '#e8eef7' }}>
                        {(row.edge * 100).toFixed(1)}%
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
            </CardContent>
          </Card>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            {(
              [
                ['Value', payload.picks.value, 'success'],
                ['Seguro', payload.picks.safe, 'info'],
                ['Arriesgado', payload.picks.risky, 'warning'],
                ['Evitar', payload.picks.avoid, 'error'],
              ] as const
            ).map(([title, pick, color]) => (
              <Card key={title} sx={{ flex: 1, bgcolor: '#121a2b' }}>
                <CardContent>
                  <Chip size="small" label={title} color={color} sx={{ mb: 1 }} />
                  {pick ? (
                    <>
                      <Typography fontWeight={700}>{pick.market}</Typography>
                      <Typography variant="body2">
                        @{pick.odds.toFixed(2)} · {pick.aiProb}%
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ opacity: 0.75, mt: 1 }}>
                        {pick.rationale}
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" sx={{ opacity: 0.5 }}>
                      —
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Stack>

          {payload.proposedAccumulators.length > 0 && (
            <Card sx={{ bgcolor: '#121a2b' }}>
              <CardContent>
                <Typography fontWeight={700} gutterBottom>
                  Combinadas propuestas
                </Typography>
                <Stack spacing={1}>
                  {payload.proposedAccumulators.map((acc, i) => (
                    <Box key={i} sx={{ p: 1.5, borderRadius: 1, bgcolor: '#0b1220' }}>
                      <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                        <Typography fontWeight={600}>{acc.title}</Typography>
                        <Chip size="small" label={acc.riskTier} />
                        <Chip size="small" variant="outlined" label={`@ ${acc.totalOdds}`} />
                      </Stack>
                      {acc.legs.map((leg, j) => (
                        <Typography key={j} variant="body2" sx={{ opacity: 0.85 }}>
                          · {leg.matchLabel}: {leg.market} @{leg.odds}
                        </Typography>
                      ))}
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}

          <Alert severity="info" sx={{ bgcolor: '#152238', color: '#c5d4ea' }}>
            {payload.edgeSummary}
            <br />
            {payload.disclaimer}
          </Alert>
        </Stack>
      </Box>
    </Stack>
  );
}
