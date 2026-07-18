'use client';

import dynamic from 'next/dynamic';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useMemo } from 'react';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { translateVerdict } from '@/lib/ai/labels-es';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export default function AnalysisMarketChart({ markets }: { markets: StructuredMatchPayload['markets'] }) {
  const theme = useTheme();

  const edgeMarkets = useMemo(() => {
    const rank = (m: string) => {
      const l = m.toLowerCase();
      if (/gana|empate|1x2|local|visitante/.test(l) && !/hándic|handicap|ah /.test(l)) return 0;
      if (/goles|btts|ambos/.test(l)) return 1;
      if (/tarjeta|card/.test(l)) return 2;
      if (/falta|foul/.test(l)) return 3;
      if (/c[oó]rner|remate/.test(l)) return 4;
      return 5;
    };
    return [...markets]
      .sort((a, b) => rank(a.market) - rank(b.market) || b.aiProb - a.aiProb)
      .slice(0, 12);
  }, [markets]);

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
        bar: { horizontal: true, borderRadius: 6, barHeight: '72%', distributed: true },
      },
      xaxis: {
        categories: edgeMarkets.map((r) =>
          r.market.length > 32 ? `${r.market.slice(0, 30)}…` : r.market
        ),
        max: 100,
        labels: { formatter: (v: string) => `${v}%` },
      },
      colors,
      legend: { show: false },
      dataLabels: {
        enabled: true,
        formatter: (v: number) => `${Number(v).toFixed(0)}%`,
        style: { fontSize: '11px', fontWeight: 800 },
      },
      tooltip: {
        y: {
          formatter: (v: number, opts: { dataPointIndex: number }) => {
            const row = edgeMarkets[opts.dataPointIndex];
            if (!row) return `${Number(v).toFixed(1)}%`;
            return `${row.aiProb.toFixed(1)}% · @${row.odds.toFixed(2)} · ${translateVerdict(row.verdict)}`;
          },
        },
      },
    };
  }, [edgeMarkets, theme]);

  if (!edgeMarkets.length) return null;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
        <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1}>
          Mapa de mercados
        </Typography>
        <Chip size="small" variant="outlined" label="verde valor" sx={{ height: 22 }} />
        <Chip size="small" variant="outlined" label="azul seguro" sx={{ height: 22 }} />
        <Chip size="small" variant="outlined" label="ámbar riesgo" sx={{ height: 22 }} />
      </Stack>
      <Box data-export-ignore="1">
        <Chart
          options={barOptions}
          series={[{ name: 'Prob.', data: edgeMarkets.map((r) => Math.round(r.aiProb * 10) / 10) }]}
          type="bar"
          height={Math.max(240, edgeMarkets.length * 32)}
          width="100%"
        />
      </Box>
    </Box>
  );
}
