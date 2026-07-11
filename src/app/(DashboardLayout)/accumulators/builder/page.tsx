'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';

type MatchRow = {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string | null;
  predictions: Array<{
    oddsHome: string | null;
    oddsDraw: string | null;
    oddsAway: string | null;
  }>;
};

type Leg = {
  matchId: string;
  label: string;
  betChoice: string;
  odds: number;
};

/**
 * Creador de combinadas: seleccionar partidos y calcular cuota total.
 */
export default function AccumulatorBuilderPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [legs, setLegs] = useState<Record<string, Leg>>({});
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const date = new Date().toISOString().slice(0, 10);
      const res = await fetch(apiUrl(`/api/matches?date=${date}`));
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches ?? []);
      }
      setLoading(false);
    };
    load();
  }, []);

  const totalOdds = useMemo(
    () => Object.values(legs).reduce((acc, leg) => acc * leg.odds, 1),
    [legs]
  );

  const toggleLeg = (match: MatchRow, choice: '1' | 'X' | '2') => {
    const p = match.predictions[0];
    const oddsMap = {
      '1': Number(p?.oddsHome ?? 0),
      X: Number(p?.oddsDraw ?? 0),
      '2': Number(p?.oddsAway ?? 0),
    };
    const odds = oddsMap[choice];
    if (!odds) return;

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
      <Typography variant="h4" fontWeight={700} mb={2}>
        Creador de combinadas
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
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
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Partido</TableCell>
                  <TableCell>1</TableCell>
                  <TableCell>X</TableCell>
                  <TableCell>2</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.map((m) => {
                  const p = m.predictions[0];
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        {m.homeTeam} vs {m.awayTeam}
                        <Typography variant="caption" display="block" color="textSecondary">
                          {m.league} {m.kickoff ?? ''}
                        </Typography>
                      </TableCell>
                      {(['1', 'X', '2'] as const).map((c) => {
                        const odds =
                          c === '1'
                            ? p?.oddsHome
                            : c === 'X'
                              ? p?.oddsDraw
                              : p?.oddsAway;
                        return (
                          <TableCell key={c}>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Checkbox
                                size="small"
                                checked={legs[m.id]?.betChoice === c}
                                disabled={!odds}
                                onChange={() => toggleLeg(m, c)}
                              />
                              <span>{odds ?? '—'}</span>
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
