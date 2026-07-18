'use client';

import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  IconBallAmericanFootball,
  IconBallBasketball,
  IconBallFootball,
  IconBallTennis,
  IconBallVolleyball,
  IconDeviceGamepad2,
  IconQuestionMark,
} from '@tabler/icons-react';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { sportLabel, teamMonogram, type SportKind } from '@/lib/match-display';
import { translateAnalysisMode } from '@/lib/ai/labels-es';
import { proxiedMediaUrl } from '@/lib/media-proxy';

function SportIcon({ sport }: { sport?: string }) {
  const s = (sport ?? 'football') as SportKind;
  const props = { size: 20, stroke: 1.75 };
  if (s === 'basketball') return <IconBallBasketball {...props} />;
  if (s === 'american_football') return <IconBallAmericanFootball {...props} />;
  if (s === 'volleyball') return <IconBallVolleyball {...props} />;
  if (s === 'tennis') return <IconBallTennis {...props} />;
  if (s === 'esports') return <IconDeviceGamepad2 {...props} />;
  if (s !== 'football') return <IconQuestionMark {...props} />;
  return <IconBallFootball {...props} />;
}

function TeamBlock({
  name,
  crestUrl,
  align,
}: {
  name: string;
  crestUrl?: string | null;
  align: 'left' | 'right';
}) {
  const src = proxiedMediaUrl(crestUrl);
  return (
    <Stack
      direction={align === 'right' ? 'row-reverse' : 'row'}
      spacing={1.5}
      alignItems="center"
      sx={{ flex: 1, minWidth: 0 }}
    >
      <Avatar
        src={src}
        alt={name}
        sx={{ width: 52, height: 52, fontSize: 15, fontWeight: 800, bgcolor: 'primary.main' }}
        slotProps={{
          img: {
            onError: (e) => {
              e.currentTarget.removeAttribute('src');
            },
          },
        }}
      >
        {teamMonogram(name)}
      </Avatar>
      <Typography
        fontWeight={800}
        variant="h6"
        textAlign={align}
        sx={{ lineHeight: 1.2, wordBreak: 'break-word' }}
      >
        {name}
      </Typography>
    </Stack>
  );
}

function ProbPill({
  label,
  value,
  color,
  active,
}: {
  label: string;
  value: number;
  color: string;
  active?: boolean;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: 'center',
        py: 1.25,
        px: 0.5,
        borderRadius: 2,
        border: '2px solid',
        borderColor: active ? color : 'divider',
        bgcolor: active ? `${color}14` : 'action.hover',
        transition: 'border-color 0.2s, background-color 0.2s',
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={900} sx={{ color: active ? color : 'text.primary' }}>
        {value}%
      </Typography>
    </Box>
  );
}

export default function AnalysisResultsHero({
  payload,
  homeTeam,
  awayTeam,
  sport,
  league,
  homeCrestUrl,
  awayCrestUrl,
}: {
  payload: StructuredMatchPayload;
  homeTeam: string;
  awayTeam: string;
  sport?: string;
  league?: string;
  homeCrestUrl?: string | null;
  awayCrestUrl?: string | null;
}) {
  const theme = useTheme();
  const fav = payload.favoriteSide ?? 'draw';
  const neural =
    payload.aiCascade?.neuralOnly || (!payload.llmUsed && Boolean(payload.aiCascade));
  const scoreAlts = payload.scoreline.alternatives.slice(0, 3);

  return (
    <Box
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        background: `linear-gradient(145deg, ${theme.palette.primary.main}12 0%, ${theme.palette.background.paper} 45%, ${theme.palette.success.main}08 100%)`,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" flexWrap="wrap" gap={1} mb={2} alignItems="center">
        <Chip size="small" icon={<SportIcon sport={sport} />} label={sportLabel((sport as SportKind) ?? 'football')} />
        {league && <Chip size="small" variant="outlined" label={league} />}
        <Chip size="small" variant="outlined" label={translateAnalysisMode(payload.mode)} />
        {neural ? (
          <Chip size="small" color="warning" variant="outlined" label="Red neuronal" />
        ) : payload.llmUsed ? (
          <Chip size="small" color="success" label={`IA · ${payload.llmProvider ?? 'OK'}`} />
        ) : (
          <Chip size="small" color="warning" variant="outlined" label="Solo modelo" />
        )}
      </Stack>

      {homeTeam !== 'N/A' ? (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems="center"
          spacing={{ xs: 2, sm: 3 }}
          mb={2.5}
        >
          <TeamBlock name={homeTeam} crestUrl={homeCrestUrl} align="left" />
          <Stack alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={700}>
              vs
            </Typography>
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress
                variant="determinate"
                value={Math.min(100, payload.confidence)}
                size={72}
                thickness={4}
                sx={{ color: 'primary.main' }}
              />
              <Box
                sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
              >
                <Typography variant="h6" fontWeight={900} lineHeight={1}>
                  {payload.confidence}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontSize={10}>
                  conf.
                </Typography>
              </Box>
            </Box>
          </Stack>
          <TeamBlock name={awayTeam} crestUrl={awayCrestUrl} align="right" />
        </Stack>
      ) : (
        <Typography variant="h5" fontWeight={800} mb={2}>
          Scanner de huecos
        </Typography>
      )}

      <Stack alignItems="center" spacing={1} mb={2}>
        <Typography variant="overline" color="text.secondary" letterSpacing={1.5}>
          Marcador estimado
        </Typography>
        <Typography
          variant="h2"
          fontWeight={900}
          lineHeight={1}
          sx={{
            fontSize: { xs: '2.75rem', md: '3.25rem' },
            letterSpacing: '-0.02em',
          }}
        >
          {payload.scoreline.mostLikely}
        </Typography>
        {scoreAlts.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={0.75} justifyContent="center">
            {scoreAlts.map((s) => (
              <Chip key={s} size="small" variant="outlined" label={s} />
            ))}
          </Stack>
        )}
      </Stack>

      <Stack direction="row" spacing={1}>
        <ProbPill
          label="1"
          value={payload.probs.home}
          color={theme.palette.primary.main}
          active={fav === 'home'}
        />
        <ProbPill
          label="X"
          value={payload.probs.draw}
          color={theme.palette.warning.main}
          active={fav === 'draw'}
        />
        <ProbPill
          label="2"
          value={payload.probs.away}
          color={theme.palette.success.main}
          active={fav === 'away'}
        />
      </Stack>

      {payload.mode === 'ACCUMULATOR' && payload.accumulatorMeta && (
        <Stack direction="row" flexWrap="wrap" gap={0.75} mt={2}>
          <Chip
            color="secondary"
            label={`Combinada @${payload.accumulatorMeta.totalOdds}`}
            sx={{ fontWeight: 700 }}
          />
          {payload.accumulatorMeta.resolvedLegs.map((leg, i) => (
            <Chip
              key={i}
              size="small"
              variant="outlined"
              label={`${leg.market} @${leg.odds.toFixed(2)}`}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
