'use client';

import { Box, Chip, Stack, Typography } from '@mui/material';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { translateVerdict, type VerdictKind } from '@/lib/ai/labels-es';

const tierMeta: Record<
  VerdictKind,
  { title: string; bg: string; border: string; accent: string }
> = {
  value: { title: 'Valor', bg: 'success.50', border: 'success.main', accent: 'success.main' },
  safe: { title: 'Seguro', bg: 'info.50', border: 'info.main', accent: 'info.main' },
  risky: { title: 'Arriesgado', bg: 'warning.50', border: 'warning.main', accent: 'warning.main' },
  avoid: { title: 'Evitar', bg: 'error.50', border: 'error.main', accent: 'error.main' },
  neutral: { title: 'Neutral', bg: 'grey.50', border: 'divider', accent: 'grey.600' },
};

function PickTile({
  title,
  pick,
  tier,
}: {
  title: string;
  pick: StructuredMatchPayload['picks']['value'];
  tier: VerdictKind;
}) {
  const meta = tierMeta[tier];
  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 2.5,
        bgcolor: meta.bg,
        border: '2px solid',
        borderColor: meta.border,
        borderLeftWidth: 5,
        minHeight: 108,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Typography variant="caption" fontWeight={800} color={meta.accent} letterSpacing={0.6}>
        {title.toUpperCase()}
      </Typography>
      {pick ? (
        <>
          <Typography variant="body1" fontWeight={800} lineHeight={1.25} sx={{ mt: 0.5 }}>
            {pick.market}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="baseline" mt={1}>
            <Typography variant="h4" fontWeight={900} color={meta.accent} lineHeight={1}>
              {Math.round(pick.aiProb)}%
            </Typography>
            <Chip size="small" label={`@${pick.odds.toFixed(2)}`} sx={{ fontWeight: 700 }} />
          </Stack>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" mt={1}>
          Sin pick claro
        </Typography>
      )}
    </Box>
  );
}

function TopMarketCard({
  market,
  aiProb,
  odds,
  verdict,
}: {
  market: string;
  aiProb: number;
  odds: number;
  verdict: string;
}) {
  const tier = (verdict as VerdictKind) in tierMeta ? (verdict as VerdictKind) : 'neutral';
  const meta = tierMeta[tier];
  const parts = market.split(' · ');
  const headline = parts.length > 1 ? parts.slice(1).join(' · ') : market;

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2.5,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderTop: `4px solid`,
        borderTopColor: meta.border,
        height: '100%',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={700}
        sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
      >
        {headline.length > 48 ? `${headline.slice(0, 46)}…` : headline}
      </Typography>
      <Stack direction="row" alignItems="baseline" spacing={1} mt={1}>
        <Typography variant="h3" fontWeight={900} color="primary.main" lineHeight={1}>
          {Math.round(aiProb)}%
        </Typography>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          @{odds.toFixed(2)}
        </Typography>
      </Stack>
      <Chip
        size="small"
        sx={{ mt: 1.25 }}
        label={translateVerdict(verdict)}
        color={
          tier === 'value'
            ? 'success'
            : tier === 'safe'
              ? 'info'
              : tier === 'risky'
                ? 'warning'
                : tier === 'avoid'
                  ? 'error'
                  : 'default'
        }
      />
    </Box>
  );
}

export default function AnalysisPickGrid({ payload }: { payload: StructuredMatchPayload }) {
  const topMarkets = [...payload.markets]
    .sort((a, b) => b.aiProb - a.aiProb || b.edge - a.edge)
    .slice(0, 4);

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: 1.5,
        }}
      >
        <PickTile title="Valor" pick={payload.picks.value} tier="value" />
        <PickTile title="Seguro" pick={payload.picks.safe} tier="safe" />
        <PickTile title="Arriesgado" pick={payload.picks.risky} tier="risky" />
        <PickTile title="Evitar" pick={payload.picks.avoid} tier="avoid" />
      </Box>

      {topMarkets.length > 0 && (
        <Box>
          <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1}>
            Mercados destacados
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: 1.5,
              mt: 1,
            }}
          >
            {topMarkets.map((row) => (
              <TopMarketCard
                key={`${row.market}-${row.odds}`}
                market={row.market}
                aiProb={row.aiProb}
                odds={row.odds}
                verdict={row.verdict}
              />
            ))}
          </Box>
        </Box>
      )}
    </Stack>
  );
}
