'use client';

import { apiUrl } from '@/lib/paths';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import {
  formatReadablePick,
  isJunkMatch,
  normalizeTip,
  resolveOdds,
  sportLabel,
  SPORT_OPTIONS,
  type SportKind,
} from '@/lib/match-display';
import { localDateISO } from '@/lib/local-date';

type MatchRow = {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string | null;
  sport?: SportKind;
  predictions: Array<{
    betChoice?: string | null;
    odds?: string | null;
    oddsHome: string | null;
    oddsDraw: string | null;
    oddsAway: string | null;
    source?: { name: string };
  }>;
};

type Leg = {
  matchId: string;
  label: string;
  betChoice: string;
  odds: number;
  estimated: boolean;
};

/**
 * Creador de combinadas: filtros por fecha/deporte + más partidos.
 */
export default function AccumulatorBuilderPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [legs, setLegs] = useState<Record<string, Leg>>({});
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => localDateISO());
  const [league, setLeague] = useState('');
  const [sport, setSport] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date, limit: '1000' });
    if (league.trim()) params.set('league', league.trim());
    if (sport) params.set('sport', sport);
    if (source) params.set('source', source);
    const res = await fetch(apiUrl(`/api/matches?${params}`));
    if (res.ok) {
      const data = await res.json();
      const rows = (data.matches ?? []) as MatchRow[];
      setMatches(rows.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam)));
    } else {
      setMatches([]);
    }
    setLoading(false);
  }, [date, league, sport, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalOdds = useMemo(
    () => Object.values(legs).reduce((acc, leg) => acc * leg.odds, 1),
    [legs]
  );

  const hasEstimated = Object.values(legs).some((l) => l.estimated);

  const toggleLeg = (match: MatchRow, choice: '1' | 'X' | '2') => {
    const p = match.predictions[0];
    const odds = resolveOdds(choice, p, 1.5);
    const book =
      choice === '1'
        ? Number(p?.oddsHome ?? 0) > 1
        : choice === 'X'
          ? Number(p?.oddsDraw ?? 0) > 1
          : Number(p?.oddsAway ?? 0) > 1;
    const tipMatches = normalizeTip(p?.betChoice) === choice && Number(p?.odds ?? 0) > 1;
    const estimated = !book && !tipMatches;

    setLegs((prev) => {
      const key = match.id;
      if (prev[key]?.betChoice === choice) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: {
          matchId: match.id,
          label: `${match.homeTeam} vs ${match.awayTeam}`,
          betChoice: choice,
          odds,
          estimated,
        },
      };
    });
  };

  const save = async () => {
    setMessage(null);
    setError(null);
    const selected = Object.values(legs);
    if (selected.length === 0) {
      setError('Selecciona al menos un partido');
      return;
    }
    const res = await fetch(apiUrl('/api/accumulators'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name || undefined,
        legs: selected.map((l) => ({
          matchId: l.matchId,
          betType: '1X2',
          betChoice: l.betChoice,
          odds: l.odds,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Error al guardar');
      return;
    }
    setMessage(`Combinada guardada. Cuota total: ${data.accumulator.totalOdds}`);
    setLegs({});
  };

  return (
    <PageContainer title="Creador de combinadas" description="Arma tu acumulada">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h4" fontWeight={700}>
          Creador de combinadas
        </Typography>
        <Chip
          label={`${matches.length} partidos`}
          color={matches.length > 0 ? 'primary' : 'default'}
          variant="outlined"
        />
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
            <TextField
              type="date"
              label="Fecha"
              InputLabelProps={{ shrink: true }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              size="small"
            />
            <TextField
              label="Liga / torneo"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              size="small"
              placeholder="Ej. NBA, ATP, Premier…"
            />
            <TextField
              select
              label="Deporte"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              size="small"
              sx={{ minWidth: 180 }}
            >
              {SPORT_OPTIONS.map((o) => (
                <MenuItem key={o.id || 'all'} value={o.id}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Fuente"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              size="small"
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="safertip">SaferTip</MenuItem>
              <MenuItem value="stakegains">StakeGains</MenuItem>
              <MenuItem value="predictz">Predictz</MenuItem>
              <MenuItem value="windrawwin">WinDrawWin</MenuItem>
              <MenuItem value="forebet">Forebet</MenuItem>
              <MenuItem value="scores24">Scores24</MenuItem>
              <MenuItem value="oddsportal">OddsPortal</MenuItem>
              <MenuItem value="betway">Betway</MenuItem>
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <TextField
              label="Nombre (opcional)"
              size="small"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />
            <Typography fontWeight={700} whiteSpace="nowrap">
              Cuota total: {Object.keys(legs).length ? totalOdds.toFixed(3) : '—'}
            </Typography>
            <Button variant="contained" onClick={save}>
              Guardar
            </Button>
          </Stack>
          {hasEstimated && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Algunas cuotas son estimadas (1.50) porque la fuente solo trae tip, no odds de casa.
              En tenis/golf el empate suele no aplicar.
            </Alert>
          )}
          {message && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {message}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ overflowX: 'auto' }}>
          {loading ? (
            <Box textAlign="center" py={4}>
              <CircularProgress />
            </Box>
          ) : matches.length === 0 ? (
            <Typography color="textSecondary">
              No hay partidos para esta fecha/filtro. Cambia la fecha, el deporte o ejecuta scrapers
              multi-deporte (Forebet, Scores24, OddsPortal).
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Deporte</TableCell>
                  <TableCell>Partido</TableCell>
                  <TableCell>Tip</TableCell>
                  <TableCell>Local / P1 gana</TableCell>
                  <TableCell>Empate</TableCell>
                  <TableCell>Visita / P2 gana</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.map((m) => {
                  const p = m.predictions[0];
                  const tip = normalizeTip(p?.betChoice);
                  const sportId = (m.sport ?? 'football') as SportKind;
                  const allowDraw = sportId === 'football' || sportId === 'hockey' || sportId === 'handball';
                  return (
                    <TableRow key={m.id} hover>
                      <TableCell>
                        <Chip size="small" label={sportLabel(sportId)} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={800} variant="body2">
                          {m.homeTeam} vs {m.awayTeam}
                        </Typography>
                        <Typography variant="caption" display="block" color="textSecondary">
                          {m.league} {m.kickoff ?? ''}
                          {p?.source?.name ? ` · ${p.source.name}` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {tip ? (
                          <Chip
                            size="small"
                            color="primary"
                            label={formatReadablePick(tip, m.homeTeam, m.awayTeam)}
                            variant="outlined"
                          />
                        ) : p?.betChoice ? (
                          <Chip
                            size="small"
                            label={formatReadablePick(p.betChoice, m.homeTeam, m.awayTeam)}
                            variant="outlined"
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      {(['1', 'X', '2'] as const).map((c) => {
                        if (c === 'X' && !allowDraw) {
                          return (
                            <TableCell key={c}>
                              <Typography variant="caption" color="text.disabled">
                                N/A
                              </Typography>
                            </TableCell>
                          );
                        }
                        const odds = resolveOdds(c, p, 1.5);
                        const book =
                          c === '1'
                            ? Number(p?.oddsHome ?? 0) > 1
                            : c === 'X'
                              ? Number(p?.oddsDraw ?? 0) > 1
                              : Number(p?.oddsAway ?? 0) > 1;
                        return (
                          <TableCell key={c}>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Checkbox
                                size="small"
                                checked={legs[m.id]?.betChoice === c}
                                onChange={() => toggleLeg(m, c)}
                              />
                              <span>
                                {book
                                  ? String(
                                      c === '1'
                                        ? p?.oddsHome
                                        : c === 'X'
                                          ? p?.oddsDraw
                                          : p?.oddsAway
                                    )
                                  : tip === c
                                    ? `~${odds.toFixed(2)}`
                                    : '—'}
                              </span>
                            </Stack>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
