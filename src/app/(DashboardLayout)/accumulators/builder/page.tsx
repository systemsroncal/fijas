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

type SelectedMatch = {
  matchId: string;
  label: string;
};

/**
 * Creador de combinadas: solo elige partidos (el pick lo resuelve el análisis IA).
 */
export default function AccumulatorBuilderPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selected, setSelected] = useState<Record<string, SelectedMatch>>({});
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

  const selectedCount = useMemo(() => Object.keys(selected).length, [selected]);

  const toggleMatch = (match: MatchRow) => {
    setSelected((prev) => {
      if (prev[match.id]) {
        const next = { ...prev };
        delete next[match.id];
        return next;
      }
      return {
        ...prev,
        [match.id]: {
          matchId: match.id,
          label: `${match.homeTeam} vs ${match.awayTeam}`,
        },
      };
    });
  };

  const save = async () => {
    setMessage(null);
    setError(null);
    const legs = Object.values(selected);
    if (legs.length === 0) {
      setError('Selecciona al menos un partido');
      return;
    }
    const res = await fetch(apiUrl('/api/accumulators'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name || undefined,
        legs: legs.map((l) => ({
          matchId: l.matchId,
          betType: 'AUTO',
          betChoice: 'AUTO',
          odds: 1.5, // placeholder; el análisis IA asigna el pick y cuota real
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Error al guardar');
      return;
    }
    setMessage(
      `Combinada guardada con ${legs.length} partidos. Analízala en Análisis IA → Mis combinadas (el modelo elegirá los resultados).`
    );
    setSelected({});
  };

  return (
    <PageContainer title="Creador de combinadas" description="Arma tu acumulada">
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
        flexWrap="wrap"
        gap={1}
      >
        <Typography variant="h4" fontWeight={700}>
          Creador de combinadas
        </Typography>
        <Stack direction="row" spacing={1}>
          <Chip
            label={`${matches.length} partidos`}
            color={matches.length > 0 ? 'primary' : 'default'}
            variant="outlined"
          />
          <Chip
            label={`${selectedCount} seleccionados`}
            color={selectedCount > 0 ? 'success' : 'default'}
          />
        </Stack>
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
            <Button variant="contained" onClick={save} disabled={selectedCount === 0}>
              Guardar combinada
            </Button>
          </Stack>
          <Alert severity="info" sx={{ mt: 2 }}>
            Solo seleccionas partidos. No eliges si gana local, empate o visitante: eso lo resuelve
            el análisis IA al analizar la combinada.
          </Alert>
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
              No hay partidos para esta fecha/filtro. Cambia la fecha, el deporte o ejecuta scrapers.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">Elegir</TableCell>
                  <TableCell>Deporte</TableCell>
                  <TableCell>Partido</TableCell>
                  <TableCell>Tip (referencia)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.map((m) => {
                  const p = m.predictions[0];
                  const tip = normalizeTip(p?.betChoice);
                  const sportId = (m.sport ?? 'football') as SportKind;
                  const checked = Boolean(selected[m.id]);
                  return (
                    <TableRow
                      key={m.id}
                      hover
                      selected={checked}
                      onClick={() => toggleMatch(m)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          size="small"
                          checked={checked}
                          onChange={() => toggleMatch(m)}
                        />
                      </TableCell>
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
