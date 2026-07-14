'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { apiUrl } from '@/lib/paths';
import type { MatchStatusPayload } from '@/lib/sportsdb/match-status';

const phaseLabel: Record<MatchStatusPayload['phase'], string> = {
  scheduled: 'Programado',
  live: 'EN VIVO',
  finished: 'Finalizado',
  unknown: '—',
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

/** Solo estas métricas (orden), estilo infografía — no la tabla completa. */
const FOCUS_STATS = [
  /posesi[oó]n|possession/i,
  /tiros a puerta|shots on/i,
  /tiros totales|total shots/i,
  /tiros fuera|shots off/i,
  /c[oó]rners|corner/i,
  /faltas|fouls/i,
  /amarillas|yellow/i,
  /rojas|red card/i,
  /ataques peligros|dangerous/i,
  /paradas|saves/i,
  /xG|goles esperados|expected goals/i,
];

function pickFocusStats(stats: MatchStatusPayload['stats']) {
  const out: MatchStatusPayload['stats'] = [];
  for (const re of FOCUS_STATS) {
    const hit = stats.find((s) => re.test(s.name) || (s.key ? re.test(s.key) : false));
    if (hit && !out.some((x) => x.name === hit.name)) out.push(hit);
  }
  // Si faltan, rellenar con las primeras no vacías
  if (out.length < 4) {
    for (const s of stats) {
      if (out.length >= 6) break;
      if (out.some((x) => x.name === s.name)) continue;
      if (s.home === '' && s.away === '') continue;
      out.push(s);
    }
  }
  return out.slice(0, 6);
}

function parseStatNum(v: string): number {
  const n = Number(String(v).replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

function StatCompareRow({
  label,
  home,
  away,
}: {
  label: string;
  home: string;
  away: string;
}) {
  const h = parseStatNum(home);
  const a = parseStatNum(away);
  const max = Math.max(h, a, 1);
  const homePct = Math.round((h / max) * 100);
  const awayPct = Math.round((a / max) * 100);
  const isPct = String(home).includes('%') || String(away).includes('%');

  return (
    <Box py={0.75}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
        <Typography
          variant="body2"
          fontWeight={700}
          color="primary.main"
          sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 40 }}
        >
          {home || '—'}
          {isPct && home && !String(home).includes('%') ? '%' : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textAlign="center">
          {label}
        </Typography>
        <Typography
          variant="body2"
          fontWeight={700}
          color="error.main"
          textAlign="right"
          sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 40 }}
        >
          {away || '—'}
          {isPct && away && !String(away).includes('%') ? '%' : ''}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Box
            sx={{
              height: 8,
              width: `${homePct}%`,
              minWidth: h > 0 ? 6 : 0,
              maxWidth: '100%',
              borderRadius: 1,
              bgcolor: 'primary.main',
              opacity: 0.85,
            }}
          />
        </Box>
        <Box sx={{ width: 4 }} />
        <Box sx={{ flex: 1 }}>
          <Box
            sx={{
              height: 8,
              width: `${awayPct}%`,
              minWidth: a > 0 ? 6 : 0,
              maxWidth: '100%',
              borderRadius: 1,
              bgcolor: 'error.main',
              opacity: 0.85,
            }}
          />
        </Box>
      </Stack>
    </Box>
  );
}

/**
 * Marcador + estadísticas simplificadas (estilo infografía).
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
    params.set('_ts', String(Date.now()));

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

  const focusStats = useMemo(
    () => (status ? pickFocusStats(status.stats) : []),
    [status]
  );

  const keyEvents = useMemo(() => {
    if (!status) return [];
    return status.timeline
      .filter((t) => /gol|tarjeta|penalti|var/i.test(`${t.type} ${t.detail}`))
      .slice(0, 8);
  }, [status]);

  if (loading && !status) {
    return (
      <Box py={2} textAlign="center">
        <CircularProgress size={28} />
        <Typography variant="caption" display="block" color="text.secondary" mt={1}>
          Cargando estadísticas…
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

  const home = status.homeTeam ?? homeTeam ?? 'Local';
  const away = status.awayTeam ?? awayTeam ?? 'Visitante';

  return (
    <Box
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: status.phase === 'live' ? 'error.light' : 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Cabecera tipo infografía */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        mb={2}
        flexWrap="wrap"
        gap={1}
      >
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ letterSpacing: '0.06em', fontWeight: 700 }}
          >
            {status.league || 'Partido'}
            {status.phase === 'live' ? ' · EN VIVO' : ''}
          </Typography>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            flexWrap="wrap"
            useFlexGap
          >
            <Typography variant="h6" fontWeight={800} sx={{ textWrap: 'balance' }}>
              {home}
            </Typography>
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}
            >
              {status.score ? status.score.replace('-', ' – ') : 'vs'}
            </Typography>
            <Typography variant="h6" fontWeight={800} sx={{ textWrap: 'balance' }}>
              {away}
            </Typography>
          </Stack>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" color={phaseColor[status.phase]} label={phaseLabel[status.phase]} />
          {status.progress && (
            <Chip size="small" variant="outlined" label={status.progress} />
          )}
          <Button size="small" onClick={() => void load()} disabled={loading}>
            Actualizar
          </Button>
        </Stack>
      </Stack>

      {/* Meta: hora / sede */}
      <Stack
        direction="row"
        flexWrap="wrap"
        useFlexGap
        spacing={1}
        sx={{
          mb: 2,
          px: 1.5,
          py: 1,
          borderRadius: 1.5,
          bgcolor: 'grey.100',
        }}
      >
        {status.kickoffPeru && (
          <Typography variant="caption" fontWeight={600}>
            Saque {status.kickoffPeru} (PE)
          </Typography>
        )}
        {status.date && (
          <Typography variant="caption" color="text.secondary">
            {status.date}
          </Typography>
        )}
        {status.venue && (
          <Typography variant="caption" color="text.secondary">
            {status.venue}
          </Typography>
        )}
        {(status.statusLabel || status.status) && status.phase !== 'scheduled' && (
          <Typography variant="caption" color="text.secondary">
            {status.statusLabel || status.status}
          </Typography>
        )}
      </Stack>

      {status.phase === 'live' && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {/* Comparativa simplificada */}
      {focusStats.length > 0 ? (
        <Box mb={2}>
          <Stack direction="row" justifyContent="space-between" mb={1}>
            <Typography variant="caption" fontWeight={800} color="primary.main">
              {home.length > 18 ? `${home.slice(0, 16)}…` : home}
            </Typography>
            <Typography variant="caption" fontWeight={700} color="text.secondary">
              ESTADÍSTICAS
            </Typography>
            <Typography variant="caption" fontWeight={800} color="error.main">
              {away.length > 18 ? `${away.slice(0, 16)}…` : away}
            </Typography>
          </Stack>
          {focusStats.map((s) => (
            <StatCompareRow
              key={s.key ?? s.name}
              label={s.name}
              home={s.home}
              away={s.away}
            />
          ))}
        </Box>
      ) : status.phase === 'scheduled' ? (
        <Alert severity="info" variant="outlined" sx={{ mb: 1 }}>
          Aún no hay estadísticas. Se actualizarán en vivo o al finalizar.
        </Alert>
      ) : (
        <Typography variant="body2" color="text.secondary" mb={2}>
          Sin estadísticas detalladas en TheSportsDB para este partido.
        </Typography>
      )}

      {/* Cronología corta: solo goles / tarjetas */}
      {keyEvents.length > 0 && (
        <Box>
          <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>
            MOMENTOS CLAVE
          </Typography>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
            {keyEvents.map((t, i) => (
              <Chip
                key={`${t.minute}-${t.player}-${i}`}
                size="small"
                variant="outlined"
                label={`${t.minute}' ${t.type}${t.player ? ` · ${t.player}` : ''}`}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
