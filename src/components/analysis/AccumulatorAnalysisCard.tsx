'use client';

import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { formatReadablePick } from '@/lib/match-display';

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

/**
 * Resultado de análisis de combinada: partido en negrita + pick legible.
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
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          Resultado · {result.name ?? 'Combinada'}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={2}>
          <Chip label={`Riesgo ${risk}`} color="warning" variant="outlined" />
          <Chip label={`EV ${ev}`} color="success" variant="outlined" />
          <Chip label={`Stake ${stake}`} color="info" variant="outlined" />
          <Chip label={result.provider} color="primary" />
        </Stack>

        {legs.length > 0 && (
          <Box mb={2}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Piernas de la combinada
            </Typography>
            <List dense disablePadding>
              {legs.map((leg, i) => {
                const pickLabel = formatReadablePick(
                  leg.pick,
                  leg.homeTeam,
                  leg.awayTeam
                );
                return (
                  <ListItem key={i} sx={{ px: 0, alignItems: 'flex-start' }}>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          {leg.kickoff && (
                            <Chip size="small" label={leg.kickoff} variant="outlined" />
                          )}
                          <Typography component="span" fontWeight={800}>
                            {leg.matchLabel ?? leg.text}
                          </Typography>
                        </Stack>
                      }
                      secondary={
                        leg.pick ? (
                          <Typography variant="body2" color="text.secondary" component="span">
                            Posible resultado: <strong>{pickLabel}</strong>
                            {leg.odds ? ` · Cuota ${leg.odds}` : ''}
                          </Typography>
                        ) : undefined
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          </Box>
        )}

        {rationale && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Análisis
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {rationale}
            </Typography>
          </>
        )}

        {!rationale && ai?.raw && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="body2" color="text.secondary">
              No se pudo estructurar la respuesta del modelo.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
