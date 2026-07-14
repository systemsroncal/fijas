'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
import { apiUrl } from '@/lib/paths';
import type { MatchStatusPayload } from '@/lib/sportsdb/match-status';

const phaseLabel: Record<MatchStatusPayload['phase'], string> = {
  scheduled: 'Programado',
  live: 'EN VIVO',
  finished: 'Finalizado',
  unknown: 'Estado desconocido',
};

const phaseColor: Record<
  MatchStatusPayload['phase'],
  'default' | 'success' | 'warning' | 'error' | 'info'
> = {
  scheduled: 'default',
  live: 'error',
  finished: 'success',
  unknown: 'warning',
};

/**
 * Marcador + estadísticas (live o FT) vía TheSportsDB free.
 * Auto-refresh cada 25s si está en vivo.
 */
export default function MatchResultStatsPanel({
  matchId,
  eventId,
  homeTeam,
  awayTeam,
  sport,
  date,
}: {
  matchId?: string;
  eventId?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  sport?: string;
  date?: string;
}) {
  const [status, setStatus] = useState<MatchStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (matchId) params.set('matchId', matchId);
    if (eventId) params.set('eventId', eventId);
    if (homeTeam) params.set('homeTeam', homeTeam);
    if (awayTeam) params.set('awayTeam', awayTeam);
    if (sport) params.set('sport', sport);
    if (date) params.set('date', date);
    params.set('details', '1');
    params.set('_ts', String(Date.now())); // evitar caché del navegador

    try {
      const res = await fetch(apiUrl(`/api/match-status?${params.toString()}`), {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'No se pudo cargar el estado');
        return;
      }
      setStatus(data.status as MatchStatusPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, [matchId, eventId, homeTeam, awayTeam, sport, date]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (status?.phase !== 'live') return;
    const id = window.setInterval(() => void load(), 25_000);
    return () => window.clearInterval(id);
  }, [status?.phase, load]);

  if (loading && !status) {
    return (
      <Box py={2} textAlign="center">
        <CircularProgress size={28} />
        <Typography variant="caption" display="block" color="text.secondary" mt={1}>
          Cargando marcador y estadísticas…
        </Typography>
      </Box>
    );
  }

  if (error && !status) {
    return (
      <Alert
        severity="warning"
        action={
          <Button size="small" onClick={() => void load()}>
            Reintentar
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (!status) return null;

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: status.phase === 'live' ? 'error.light' : 'divider',
        bgcolor: status.phase === 'live' ? 'action.hover' : 'grey.50',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" mb={1.5}>
        <Typography fontWeight={700}>
          {status.phase === 'live' ? 'Resultado en vivo' : 'Resultado y estadísticas'}
        </Typography>
        <Chip size="small" color={phaseColor[status.phase]} label={phaseLabel[status.phase]} />
        {(status.statusLabel || status.status) && (
          <Chip size="small" variant="outlined" label={status.statusLabel || status.status} />
        )}
        {status.progress && <Chip size="small" variant="outlined" label={status.progress} />}
        {status.kickoffPeru && (
          <Chip
            size="small"
            variant="outlined"
            label={`Saque ${status.kickoffPeru} (PE)`}
          />
        )}
        {status.scoreFromTimeline && (
          <Chip size="small" color="info" variant="outlined" label="Marcador desde goles" />
        )}
        <Button size="small" onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      </Stack>

      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="center"
        mb={2}
        flexWrap="wrap"
      >
        <Typography fontWeight={700} textAlign="right" sx={{ minWidth: 100 }}>
          {status.homeTeam ?? homeTeam ?? 'Local'}
        </Typography>
        <Typography
          variant="h4"
          fontWeight={800}
          sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'center' }}
        >
          {status.score ? status.score.replace('-', ' - ') : '— : —'}
        </Typography>
        <Typography fontWeight={700} sx={{ minWidth: 100 }}>
          {status.awayTeam ?? awayTeam ?? 'Visitante'}
        </Typography>
      </Stack>

      {status.phase === 'live' && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {status.label && (
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          {status.label}
          {status.league ? ` · ${status.league}` : ''}
          {status.venue ? ` · ${status.venue}` : ''}
        </Typography>
      )}

      {status.stats.length > 0 && (
        <Box mb={2}>
          <Typography fontWeight={700} gutterBottom variant="body2">
            Estadísticas
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Local</TableCell>
                <TableCell align="center">Métrica</TableCell>
                <TableCell align="right">Visitante</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {status.stats.slice(0, 18).map((s) => (
                <TableRow key={s.key ?? s.name} hover>
                  <TableCell>{s.home}</TableCell>
                  <TableCell align="center">{s.name}</TableCell>
                  <TableCell align="right">{s.away}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {status.timeline.length > 0 && (
        <Box>
          <Typography fontWeight={700} gutterBottom variant="body2">
            Cronología en tiempo real
          </Typography>
          <Stack spacing={0.75}>
            {status.timeline.slice(0, 24).map((t, i) => (
              <Typography key={`${t.minute}-${t.player}-${i}`} variant="body2">
                <strong>{t.minute}&apos;</strong> {t.type}
                {t.detail ? ` · ${t.detail}` : ''}
                {t.player ? ` — ${t.player}` : ''}
                {t.assist ? ` (asist. ${t.assist})` : ''}
                {t.team ? ` [${t.team}]` : ''}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

      {status.phase === 'scheduled' && (
        <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
          Aún no hay marcador. Cuando pase a live o final, se actualizará solo (o pulsa Actualizar).
        </Alert>
      )}

      {status.notes.length > 0 && status.phase !== 'scheduled' && (
        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
          {status.notes.slice(0, 3).join(' · ')} · TheSportsDB free ·{' '}
          {new Date(status.fetchedAt).toLocaleTimeString()}
        </Typography>
      )}
    </Box>
  );
}
