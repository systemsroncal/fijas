'use client';

import { Box, Chip, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { FormMatchRow, StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { formResultLabelEs } from '@/lib/ai/labels-es';
import type { ModelProbs } from '@/lib/ai/football-model';
import { goalsForTeamInRow } from '@/lib/ai/form-stats';

const RESULT_COLORS = {
  W: '#2e7d32',
  D: '#ed6c02',
  L: '#d32f2f',
} as const;

function formStrip(rows: FormMatchRow[] | undefined, teamName: string, max = 6) {
  if (!rows?.length) return [];
  return rows
    .slice(0, max)
    .map((row) => {
      const g = goalsForTeamInRow(row, teamName);
      if (!g) return null;
      return {
        key: row.matchId,
        result: g.result,
        score: row.score ?? '—',
        date: row.date?.slice(5) ?? '',
        league: row.league ?? '',
      };
    })
    .filter(Boolean) as Array<{
    key: string;
    result: 'W' | 'D' | 'L';
    score: string;
    date: string;
    league: string;
  }>;
}

function ProbCell({
  label,
  value,
  highlight,
  color,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  color: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: 'center',
        py: 1.25,
        px: 1,
        borderRadius: 1.5,
        border: '2px solid',
        borderColor: highlight ? color : 'divider',
        bgcolor: highlight ? `${color}18` : 'action.hover',
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={800} sx={{ color: highlight ? color : 'text.primary' }}>
        {value}%
      </Typography>
    </Box>
  );
}

export default function MatchPredictionPanel({
  payload,
  homeTeam,
  awayTeam,
}: {
  payload: StructuredMatchPayload;
  homeTeam: string;
  awayTeam: string;
}) {
  const theme = useTheme();
  const fav = payload.favoriteSide ?? 'draw';
  const homeStrip = formStrip(payload.form?.homeSeason, homeTeam);
  const awayStrip = formStrip(payload.form?.awaySeason, awayTeam);
  const topScore = payload.scorePredictions?.[0];
  const modelStats = payload.model as ModelProbs | undefined;

  return (
    <Stack spacing={2}>
      {/* Hero estilo Forebet */}
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          background: `linear-gradient(135deg, ${theme.palette.primary.main}14 0%, ${theme.palette.success.main}10 100%)`,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
        >
          <Box textAlign={{ xs: 'center', sm: 'left' }}>
            <Typography variant="overline" color="text.secondary">
              Predicción combinada (forma + Poisson + cuotas)
            </Typography>
            <Typography variant="h3" fontWeight={900} lineHeight={1.1}>
              {payload.scoreline.mostLikely}
            </Typography>
            {topScore && topScore.score !== payload.scoreline.mostLikely && (
              <Typography variant="body2" color="text.secondary">
                Poisson principal: {topScore.score} ({topScore.prob}%)
              </Typography>
            )}
          </Box>
          <Chip
            label={
              fav === 'home'
                ? `Favorito: ${homeTeam}`
                : fav === 'away'
                  ? `Favorito: ${awayTeam}`
                  : 'Favorito: EMPATE'
            }
            color={fav === 'home' ? 'primary' : fav === 'away' ? 'success' : 'warning'}
            sx={{ fontWeight: 700, fontSize: '0.85rem', py: 2.5, px: 1 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} mt={2}>
          <ProbCell
            label="1 · Local"
            value={payload.probs.home}
            highlight={fav === 'home'}
            color={theme.palette.primary.main}
          />
          <ProbCell
            label="X · Empate"
            value={payload.probs.draw}
            highlight={fav === 'draw'}
            color={theme.palette.warning.main}
          />
          <ProbCell
            label="2 · Visitante"
            value={payload.probs.away}
            highlight={fav === 'away'}
            color={theme.palette.success.main}
          />
        </Stack>
      </Box>

      {/* Modelo vs mercado */}
      {(payload.marketImplied || payload.poissonProbs) && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Modelo vs mercado (cuotas scrapeadas)
          </Typography>
          <Stack spacing={0.75}>
            {payload.poissonProbs && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" variant="outlined" label="Poisson puro" />
                <Chip size="small" label={`1 ${payload.poissonProbs.home}%`} />
                <Chip size="small" label={`X ${payload.poissonProbs.draw}%`} />
                <Chip size="small" label={`2 ${payload.poissonProbs.away}%`} />
              </Stack>
            )}
            {payload.marketImplied && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" variant="outlined" color="secondary" label="Mercado" />
                <Chip size="small" color="secondary" label={`1 ${payload.marketImplied.home}%`} />
                <Chip size="small" color="secondary" label={`X ${payload.marketImplied.draw}%`} />
                <Chip size="small" color="secondary" label={`2 ${payload.marketImplied.away}%`} />
              </Stack>
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" variant="filled" color="primary" label="Final mezclada" />
              <Chip size="small" color="primary" label={`1 ${payload.probs.home}%`} />
              <Chip size="small" color="primary" label={`X ${payload.probs.draw}%`} />
              <Chip size="small" color="primary" label={`2 ${payload.probs.away}%`} />
            </Stack>
          </Stack>
        </Box>
      )}

      {/* Marcadores probables */}
      {payload.scorePredictions && payload.scorePredictions.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Marcadores probables
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {payload.scorePredictions.slice(0, 8).map((s) => (
              <Chip
                key={s.score}
                label={`${s.score} · ${s.prob}%`}
                size="small"
                variant={s.score === payload.scoreline.mostLikely ? 'filled' : 'outlined'}
                color={s.score === payload.scoreline.mostLikely ? 'primary' : 'default'}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Mercados derivados rápidos */}
      {modelStats?.over25 != null && (
        <Stack direction="row" flexWrap="wrap" gap={1}>
          <Chip size="small" label={`+2.5 goles ${Math.round(modelStats.over25 * 100)}%`} />
          <Chip size="small" label={`Ambos marcan ${Math.round(modelStats.bttsYes * 100)}%`} />
        </Stack>
      )}

      {/* Forma reciente estilo Forebet */}
      {(homeStrip.length > 0 || awayStrip.length > 0) && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          {[
            { team: homeTeam, strip: homeStrip },
            { team: awayTeam, strip: awayStrip },
          ]
            .filter(({ strip }) => strip.length > 0)
            .map(({ team, strip }) => (
              <Box key={team} sx={{ flex: 1 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Últimos · {team}
                </Typography>
                <Stack spacing={0.75}>
                  {strip.map((m) => (
                    <Stack
                      key={m.key}
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{
                        py: 0.5,
                        px: 1,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                      }}
                    >
                      <Box
                        title={
                          m.result === 'W'
                            ? 'Victoria'
                            : m.result === 'D'
                              ? 'Empate'
                              : 'Derrota'
                        }
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: 0.75,
                          bgcolor: RESULT_COLORS[m.result],
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        {formResultLabelEs[m.result]}
                      </Box>
                      <Typography variant="body2" fontWeight={600} sx={{ minWidth: 36 }}>
                        {m.score}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
                        {m.date}
                        {m.league ? ` · ${m.league}` : ''}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            ))}
        </Stack>
      )}
    </Stack>
  );
}
