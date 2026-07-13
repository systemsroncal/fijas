'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
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
import { isJunkMatch, normalizeTip, resolveOdds } from '@/lib/match-display';

type MatchRow = {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string | null;
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
 * Creador de combinadas: seleccionar partidos y calcular cuota total.
 * Permite tip scrapeado aunque la fuente no traiga cuotas de casa.
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
        const rows = (data.matches ?? []) as MatchRow[];
        setMatches(rows.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam)));
      }
      setLoading(false);
    };
    load();
  }, []);

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
          {hasEstimated && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Algunas cuotas son estimadas (1.50) porque la fuente solo trae tip, no odds de casa.
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
            <Typography color="textSecondary">No hay partidos para hoy.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Partido</TableCell>
                  <TableCell>Tip</TableCell>
                  <TableCell>1</TableCell>
                  <TableCell>X</TableCell>
                  <TableCell>2</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.map((m) => {
                  const p = m.predictions[0];
                  const tip = normalizeTip(p?.betChoice);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        {m.homeTeam} vs {m.awayTeam}
                        <Typography variant="caption" display="block" color="textSecondary">
                          {m.league} {m.kickoff ?? ''}
                          {p?.source?.name ? ` · ${p.source.name}` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {tip ? (
                          <Chip size="small" color="primary" label={tip} variant="outlined" />
                        ) : p?.betChoice ? (
                          <Chip size="small" label={p.betChoice} variant="outlined" />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      {(['1', 'X', '2'] as const).map((c) => {
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
