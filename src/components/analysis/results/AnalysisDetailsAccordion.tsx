'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { IconChevronDown } from '@tabler/icons-react';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { RECENT_MATCHES_MAX, RECENT_MATCHES_MIN } from '@/lib/ai/form-stats';
import { proxiedMediaUrl } from '@/lib/media-proxy';
import MatchPredictionPanel from '@/components/analysis/MatchPredictionPanel';

type FormRow = NonNullable<StructuredMatchPayload['form']>['rows'][number];

function SectionAccordion({
  title,
  badge,
  defaultExpanded,
  children,
}: {
  title: string;
  badge?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '12px !important',
        '&:before': { display: 'none' },
        overflow: 'hidden',
      }}
    >
      <AccordionSummary expandIcon={<IconChevronDown size={18} />}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography fontWeight={700}>{title}</Typography>
          {badge && <Chip size="small" label={badge} variant="outlined" />}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

export default function AnalysisDetailsAccordion({
  payload,
  homeTeam,
  awayTeam,
  formDisplayRows,
  formSampleCounts,
  onAnalyzeMatch,
}: {
  payload: StructuredMatchPayload;
  homeTeam: string;
  awayTeam: string;
  formDisplayRows: FormRow[];
  formSampleCounts: { home: number; away: number };
  onAnalyzeMatch?: (matchId: string) => void;
}) {
  const hasForm =
    payload.form?.available ||
    (payload.form?.h2h?.length ?? 0) > 0 ||
    (payload.form?.homeSeason?.length ?? 0) > 0;

  const hasSportsDb = Boolean(payload.sportsDb);
  const hasContext =
    Boolean(payload.referee || payload.absences || (payload.scenarios?.length ?? 0) > 0);
  const hasDiagnostics =
    Boolean(payload.matchDiagnostics?.teamStats.length || payload.matchDiagnostics?.players.length);
  const hasRelated = (payload.relatedMatches?.length ?? 0) > 0;
  const hasAccs = (payload.proposedAccumulators?.length ?? 0) > 0;

  if (!hasForm && !hasSportsDb && !hasContext && !hasDiagnostics && !hasRelated && !hasAccs) {
    return (
      <SectionAccordion title="Detalle técnico" badge="modelo">
        <MatchPredictionPanel payload={payload} homeTeam={homeTeam} awayTeam={awayTeam} />
      </SectionAccordion>
    );
  }

  return (
    <Stack spacing={1.5}>
      <SectionAccordion title="Modelo vs mercado y forma" badge="Poisson">
        <MatchPredictionPanel payload={payload} homeTeam={homeTeam} awayTeam={awayTeam} />
      </SectionAccordion>

      {hasForm && (
        <SectionAccordion title="Historial y forma reciente" badge={`${formDisplayRows.length} partidos`}>
          {(formSampleCounts.home < RECENT_MATCHES_MIN ||
            formSampleCounts.away < RECENT_MATCHES_MIN) && (
            <Alert severity="info" variant="outlined" sx={{ mb: 1.5, py: 0.5 }}>
              Muestra: {homeTeam} {formSampleCounts.home} · {awayTeam} {formSampleCounts.away}{' '}
              (objetivo ≥{RECENT_MATCHES_MIN})
            </Alert>
          )}
          {payload.form?.recentScores && payload.form.recentScores.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={0.75} mb={1.5}>
              {payload.form.recentScores.map((s, i) => (
                <Chip key={`${s}-${i}`} label={s} size="small" variant="outlined" />
              ))}
            </Stack>
          )}
          {formDisplayRows.length > 0 ? (
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
                {formDisplayRows.slice(0, RECENT_MATCHES_MAX * 2).map((r) => (
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
          ) : (
            <Typography variant="body2" color="text.secondary">
              {payload.form?.message ?? 'Sin historial disponible.'}
            </Typography>
          )}
          {(payload.form?.homeForm || payload.form?.awayForm) && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} mt={2}>
              {[
                { label: homeTeam, stats: payload.form?.homeForm },
                { label: awayTeam, stats: payload.form?.awayForm },
              ].map(({ label, stats }) =>
                stats ? (
                  <Box
                    key={label}
                    sx={{
                      flex: 1,
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                      {label}
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.75}>
                      <Chip size="small" label={`GF ${stats.avgGoalsFor}`} />
                      <Chip size="small" label={`GA ${stats.avgGoalsAgainst}`} />
                      <Chip
                        size="small"
                        label={`V ${Math.round(stats.winRate * 100)}%`}
                        color="success"
                        variant="outlined"
                      />
                      <Chip size="small" label={`n=${stats.sampleSize}`} variant="outlined" />
                    </Stack>
                  </Box>
                ) : null
              )}
            </Stack>
          )}
          {payload.form?.h2h && payload.form.h2h.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={0.75} mt={1.5}>
              {payload.form.h2h.map((r) => (
                <Chip
                  key={`h2h-${r.matchId}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={`${r.date}: ${r.score ?? '—'}`}
                />
              ))}
            </Stack>
          )}
        </SectionAccordion>
      )}

      {hasSportsDb && payload.sportsDb && (
        <SectionAccordion title="TheSportsDB" badge="API">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            {[
              ['Local', payload.sportsDb.home],
              ['Visitante', payload.sportsDb.away],
            ].map(([side, block]) => {
              const b = block as NonNullable<typeof payload.sportsDb>['home'];
              return (
                <Box key={String(side)} sx={{ flex: 1, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                    <Avatar src={proxiedMediaUrl(b.badge)} sx={{ width: 28, height: 28 }}>
                      {(b.name ?? String(side)).slice(0, 2)}
                    </Avatar>
                    <Typography fontWeight={700}>{b.name ?? String(side)}</Typography>
                  </Stack>
                  <Stack direction="row" flexWrap="wrap" gap={0.5}>
                    {b.recent.slice(0, 6).map((r, i) => (
                      <Chip key={i} size="small" variant="outlined" label={r.score ?? '—'} />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </SectionAccordion>
      )}

      {hasContext && (
        <SectionAccordion title="Contexto del partido">
          <Stack spacing={1.5}>
            {payload.referee && (
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                <Chip label={payload.referee.name ?? 'Árbitro TBD'} />
                <Chip label={`Tarjetas: ${payload.referee.cardsTendency}`} variant="outlined" />
              </Stack>
            )}
            {payload.absences && (
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                {[...payload.absences.home, ...payload.absences.away].map((a) => (
                  <Chip
                    key={`${a.player}-${a.reason}`}
                    size="small"
                    color={a.impact === 'high' ? 'error' : a.impact === 'medium' ? 'warning' : 'default'}
                    label={a.player}
                  />
                ))}
              </Stack>
            )}
            {payload.scenarios?.map((sc) => (
              <Box key={sc.id} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                <Typography fontWeight={700} variant="body2">
                  {sc.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {sc.impactSummary}
                </Typography>
              </Box>
            ))}
          </Stack>
        </SectionAccordion>
      )}

      {hasAccs && (
        <SectionAccordion title="Combinadas propuestas" badge={`${payload.proposedAccumulators.length}`}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
              gap: 1,
            }}
          >
            {payload.proposedAccumulators.map((acc, i) => (
              <Box
                key={i}
                sx={{
                  p: 1.25,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'grey.50',
                }}
              >
                <Typography variant="body2" fontWeight={700}>
                  {acc.title} @{acc.totalOdds.toFixed(2)}
                </Typography>
                <Stack spacing={0.5} mt={0.75}>
                  {acc.legs.map((leg, j) => (
                    <Typography key={j} variant="caption" display="block">
                      {leg.market} @{leg.odds.toFixed(2)}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </SectionAccordion>
      )}

      {hasDiagnostics && payload.matchDiagnostics && (
        <SectionAccordion title="Diagnósticos en vivo">
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {payload.matchDiagnostics.teamStats.map((s) => (
              <Chip key={s.name} label={`${s.name}: ${s.value}`} variant="outlined" />
            ))}
          </Stack>
        </SectionAccordion>
      )}

      {hasRelated && (
        <SectionAccordion title="Partidos del scanner">
          <Stack spacing={0.75}>
            {payload.relatedMatches!
              .filter((rm) => rm.id)
              .map((rm) => (
                <Stack
                  key={rm.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    cursor: onAnalyzeMatch ? 'pointer' : 'default',
                  }}
                  onClick={() => onAnalyzeMatch?.(rm.id)}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {rm.homeTeam} vs {rm.awayTeam}
                  </Typography>
                  {onAnalyzeMatch && (
                    <Button size="small" variant="text">
                      Analizar
                    </Button>
                  )}
                </Stack>
              ))}
          </Stack>
        </SectionAccordion>
      )}
    </Stack>
  );
}
