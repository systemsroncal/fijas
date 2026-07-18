'use client';

import { Box, Stack, Typography } from '@mui/material';
import {
  IconChartBar,
  IconFlag,
  IconBallFootball,
  IconTarget,
} from '@tabler/icons-react';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import type { ModelProbs } from '@/lib/ai/football-model';

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Box
      sx={{
        flex: '1 1 120px',
        p: 1.5,
        borderRadius: 2,
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 1.5,
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'primary.main',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography variant="caption" color="text.secondary" display="block" noWrap>
          {label}
        </Typography>
        <Typography variant="subtitle1" fontWeight={800} noWrap>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

export default function AnalysisMetricStrip({ payload }: { payload: StructuredMatchPayload }) {
  const xg =
    payload.expected.xgHome != null && payload.expected.xgAway != null
      ? `${payload.expected.xgHome} · ${payload.expected.xgAway}`
      : '—';
  const corners =
    payload.expected.cornersHome != null
      ? `${payload.expected.cornersHome} · ${payload.expected.cornersAway ?? '—'}`
      : '—';
  const cards =
    payload.expected.cardsHome != null
      ? `${payload.expected.cardsHome} · ${payload.expected.cardsAway ?? '—'}`
      : payload.form?.avgCards != null
        ? `~${payload.form.avgCards}`
        : '—';
  const avgGoals =
    payload.form?.avgGoalsTotal != null ? String(payload.form.avgGoalsTotal) : '—';

  const model = payload.model as ModelProbs | undefined;
  const over25 = model?.over25 != null ? `${Math.round(model.over25 * 100)}%` : null;
  const btts = model?.bttsYes != null ? `${Math.round(model.bttsYes * 100)}%` : null;

  return (
    <Stack spacing={1}>
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricTile icon={<IconTarget size={20} />} label="xG local · visit." value={xg} />
        <MetricTile icon={<IconBallFootball size={20} />} label="Córners esp." value={corners} />
        <MetricTile icon={<IconFlag size={20} />} label="Tarjetas esp." value={cards} />
        <MetricTile icon={<IconChartBar size={20} />} label="Goles medios" value={avgGoals} />
        {over25 && (
          <MetricTile icon={<IconChartBar size={20} />} label="+2.5 goles" value={over25} />
        )}
        {btts && <MetricTile icon={<IconChartBar size={20} />} label="Ambos marcan" value={btts} />}
      </Stack>
    </Stack>
  );
}
