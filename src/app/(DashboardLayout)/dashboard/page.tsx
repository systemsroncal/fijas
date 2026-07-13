'use client';

import { apiUrl } from '@/lib/paths';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  TextField,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Chip,
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import LiveMatchesPoller from '@/components/LiveMatchesPoller';
import { hasBookOdds, isJunkMatch, normalizeTip } from '@/lib/match-display';

type MatchRow = {
  id: string;
  kickoff: string | null;
  league: string;
  homeTeam: string;
  awayTeam: string;
  predictions: Array<{
    betType?: string;
    betChoice?: string | null;
    odds?: string | null;
    oddsHome: string | null;
    oddsDraw: string | null;
    oddsAway: string | null;
    oddsOver: string | null;
    oddsUnder: string | null;
    oddsBttsYes: string | null;
    oddsBttsNo: string | null;
    statsNote?: string | null;
    source: { name: string; slug: string };
  }>;
};

/**
 * Dashboard principal: partidos de hoy con filtros y polling.
 */
export default function DashboardPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [league, setLeague] = useState('');
  const [source, setSource] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      const params = new URLSearchParams({ date });
      if (league) params.set('league', league);
      if (source) params.set('source', source);
      const res = await fetch(apiUrl(`/api/matches?${params}`));
      if (res.ok) {
        const data = await res.json();
        const rows = (data.matches ?? []) as MatchRow[];
        setMatches(rows.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam)));
      }
      if (!opts?.silent) setLoading(false);
    },
    [date, league, source]
  );

  useEffect(() => {
    load();
  }, [load]);

  const silentReload = useCallback(() => {
    load({ silent: true });
  }, [load]);

  return (
    <PageContainer title="Partidos de hoy" description="Resumen de partidos scrapeados">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Partidos de hoy
          </Typography>
          <Typography color="textSecondary">Filtros por liga, fecha y fuente</Typography>
        </Box>
        <LiveMatchesPoller onUpdate={silentReload} />
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              type="date"
              label="Fecha"
              InputLabelProps={{ shrink: true }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              size="small"
            />
            <TextField
              label="Liga"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              size="small"
            />
            <TextField
              select
              label="Fuente"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              size="small"
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="safertip">SaferTip</MenuItem>
              <MenuItem value="predictz">Predictz</MenuItem>
              <MenuItem value="windrawwin">WinDrawWin</MenuItem>
              <MenuItem value="scores24">Scores24</MenuItem>
              <MenuItem value="forebet">Forebet</MenuItem>
              <MenuItem value="betway">Betway</MenuItem>
            </TextField>
          </Stack>
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
                  <TableCell>Hora</TableCell>
                  <TableCell>Liga</TableCell>
                  <TableCell>Local</TableCell>
                  <TableCell>Visitante</TableCell>
                  <TableCell>Tip</TableCell>
                  <TableCell>1X2</TableCell>
                  <TableCell>O/U</TableCell>
                  <TableCell>BTTS</TableCell>
                  <TableCell>Fuente</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      Sin partidos para esta fecha. Ejecuta el scraper o espera la próxima corrida.
                    </TableCell>
                  </TableRow>
                )}
                {matches.map((m) => {
                  const p = m.predictions[0];
                  const tip = normalizeTip(p?.betChoice) ?? p?.betChoice ?? null;
                  const book = hasBookOdds(p);
                  return (
                    <TableRow key={m.id} hover>
                      <TableCell>{m.kickoff ?? '—'}</TableCell>
                      <TableCell>{m.league}</TableCell>
                      <TableCell>{m.homeTeam}</TableCell>
                      <TableCell>{m.awayTeam}</TableCell>
                      <TableCell>
                        {tip ? (
                          <Chip size="small" label={String(tip)} color="primary" variant="outlined" />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {book && p
                          ? `${p.oddsHome ?? '-'} / ${p.oddsDraw ?? '-'} / ${p.oddsAway ?? '-'}`
                          : p?.odds
                            ? String(p.odds)
                            : '—'}
                      </TableCell>
                      <TableCell>
                        {p && (p.oddsOver || p.oddsUnder)
                          ? `${p.oddsOver ?? '-'} / ${p.oddsUnder ?? '-'}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {p && (p.oddsBttsYes || p.oddsBttsNo)
                          ? `${p.oddsBttsYes ?? '-'} / ${p.oddsBttsNo ?? '-'}`
                          : '—'}
                      </TableCell>
                      <TableCell>{p?.source.name ?? '—'}</TableCell>
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
