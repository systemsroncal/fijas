'use client';

import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { IconChartLine, IconCoin, IconShield, IconTrendingUp } from '@tabler/icons-react';
import { formatReadablePick } from '@/lib/match-display';
import AnalysisDisclaimer from '@/components/analysis/results/AnalysisDisclaimer';

export type AccumulatorResultView = {
  riskScore: string | number | null;
  evScore: string | number | null;
  recommendedStake: string | number | null;
  provider: string;
  summary?: string;
  response?: string;
  name?: string | null;
  rationale?: string;
  legs?: Array<{
    kickoff?: string | null;
    homeTeam: string;
    awayTeam: string;
    league: string;
    betChoice: string;
    odds: string;
  }>;
};

type ParsedAi = {
  rationale?: string;
  risk_score?: number;
  ev_score?: number;
  recommended_stake?: number;
  raw?: string;
};

type LegLine = {
  text: string;
  kickoff?: string;
  homeTeam?: string;
  awayTeam?: string;
  matchLabel?: string;
  pick?: string;
  odds?: string;
};

function tryParseAiJson(response: string | undefined): ParsedAi | null {
  if (!response) return null;
  const trimmed = response.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    return {
      rationale: typeof obj.rationale === 'string' ? obj.rationale : undefined,
      risk_score: typeof obj.risk_score === 'number' ? obj.risk_score : undefined,
      ev_score: typeof obj.ev_score === 'number' ? obj.ev_score : undefined,
      recommended_stake:
        typeof obj.recommended_stake === 'number' ? obj.recommended_stake : undefined,
    };
  } catch {
    return { raw: trimmed.slice(0, 1500) };
  }
}

function parseLegs(summary: string | undefined): LegLine[] {
  if (!summary) return [];
  return summary
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => {
      const text = l.replace(/^-\s*/, '');
      const m = text.match(
        /^(?:(\d{1,2}:\d{2})\s+)?(.+?)\s+vs\s+(.+?)\s*\(([^)]+)\)\s*\|\s*(.+?)\s*@\s*([^\s]+)$/i
      );
      if (m) {
        return {
          text,
          kickoff: m[1],
          homeTeam: m[2].trim(),
          awayTeam: m[3].trim(),
          matchLabel: `${m[2].trim()} vs ${m[3].trim()}`,
          pick: m[5].trim(),
          odds: m[6].trim(),
        };
      }
      return { text };
    });
}

function MetricHero({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 100,
        p: 2,
        borderRadius: 2.5,
        bgcolor: `${color}10`,
        border: '1px solid',
        borderColor: `${color}40`,
        textAlign: 'center',
      }}
    >
      <Box sx={{ color, mb: 0.5, display: 'flex', justifyContent: 'center' }}>{icon}</Box>
      <Typography variant="h4" fontWeight={900} color={color} lineHeight={1}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Resultado visual de combinada — métricas arriba, piernas en tarjetas, texto al final.
 */
export default function AccumulatorAnalysisCard({ result }: { result: AccumulatorResultView }) {
  const ai = tryParseAiJson(result.response);
  const legsFromPayload =
    result.legs?.map((leg) => ({
      text: `${leg.homeTeam} vs ${leg.awayTeam}`,
      kickoff: leg.kickoff ?? undefined,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      matchLabel: `${leg.homeTeam} vs ${leg.awayTeam}`,
      pick: leg.betChoice,
      odds: leg.odds,
    })) ?? [];
  const legs = legsFromPayload.length > 0 ? legsFromPayload : parseLegs(result.summary);
  const rationale =
    result.rationale ??
    ai?.rationale ??
    (result.response && !result.response.trim().startsWith('{')
      ? result.response.slice(0, 2000)
      : null);

  const risk = result.riskScore ?? ai?.risk_score ?? '—';
  const ev = result.evScore ?? ai?.ev_score ?? '—';
  const stake = result.recommendedStake ?? ai?.recommended_stake ?? '—';

  return (
    <Card sx={{ mb: 3, borderRadius: 3, overflow: 'hidden' }}>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5" fontWeight={900}>
              {result.name ?? 'Combinada'}
            </Typography>
            <Chip label={result.provider} color="primary" sx={{ fontWeight: 700 }} />
          </Stack>

          <Stack direction="row" flexWrap="wrap" gap={1.5}>
            <MetricHero
              icon={<IconShield size={22} />}
              label="Riesgo"
              value={risk}
              color="#ed6c02"
            />
            <MetricHero
              icon={<IconTrendingUp size={22} />}
              label="Valor esp."
              value={ev}
              color="#2e7d32"
            />
            <MetricHero
              icon={<IconCoin size={22} />}
              label="Stake sugerido"
              value={stake}
              color="#0288d1"
            />
            <MetricHero
              icon={<IconChartLine size={22} />}
              label="Piernas"
              value={legs.length}
              color="#7b1fa2"
            />
          </Stack>

          {legs.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
              }}
            >
              {legs.map((leg, i) => {
                const pickLabel = formatReadablePick(leg.pick, leg.homeTeam, leg.awayTeam);
                return (
                  <Box
                    key={i}
                    sx={{
                      p: 1.75,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderLeft: '4px solid',
                      borderLeftColor: 'primary.main',
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Stack direction="row" spacing={0.75} alignItems="center" mb={0.75}>
                      {leg.kickoff && (
                        <Chip size="small" label={leg.kickoff} variant="outlined" sx={{ height: 22 }} />
                      )}
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        Pierna {i + 1}
                      </Typography>
                    </Stack>
                    <Typography fontWeight={800} variant="body1" lineHeight={1.25}>
                      {leg.matchLabel ?? leg.text}
                    </Typography>
                    {leg.pick && (
                      <Stack direction="row" spacing={1} alignItems="baseline" mt={1}>
                        <Typography variant="body2" fontWeight={600} color="text.secondary">
                          {pickLabel}
                        </Typography>
                        {leg.odds && (
                          <Typography variant="h6" fontWeight={900} color="primary.main">
                            @{leg.odds}
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}

          {rationale && (
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: 'grey.50',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="overline" color="text.secondary" fontWeight={700}>
                Por qué esta combinada
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.7, color: 'text.secondary' }}>
                {rationale}
              </Typography>
            </Box>
          )}

          {!rationale && ai?.raw && (
            <Typography variant="body2" color="text.secondary">
              No se pudo estructurar la respuesta del modelo.
            </Typography>
          )}

          <AnalysisDisclaimer />
        </Stack>
      </CardContent>
    </Card>
  );
}
