'use client';

import { apiUrl } from '@/lib/paths';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
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
import {
  hasBookOdds,
  isJunkMatch,
  normalizeTip,
  formatReadablePick,
  SPORT_OPTIONS,
  sportLabel,
  type SportKind,
} from '@/lib/match-display';
import { addDaysYmd, peruDateISO } from '@/lib/timezone';

type MatchRow = {
  id: string;
  kickoff: string | null;
  league: string;
  homeTeam: string;
  awayTeam: string;
  sport?: SportKind;
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
  const todayPeru = peruDateISO();
  const tomorrowPeru = addDaysYmd(todayPeru, 1);
  const [date, setDate] = useState(() => peruDateISO());
  const [league, setLeague] = useState('');
  const [sport, setSport] = useState('');
  const [source, setSource] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const dayLabel =
    date === todayPeru ? 'hoy' : date === tomorrowPeru ? 'mañana' : date;

  const fetchMatches = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      const params = new URLSearchParams({ date, limit: '1000' });
      if (league) params.set('league', league);
      if (sport) params.set('sport', sport);
      if (source) params.set('source', source);
      const res = await fetch(apiUrl(`/api/matches?${params}`));
      let missingKickoff = 0;
      if (res.ok) {
        const data = await res.json();
        const rows = (data.matches ?? []) as MatchRow[];
        setMatches(rows.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam)));
        missingKickoff = Number(data.missingKickoff ?? 0);
      }
      if (!opts?.silent) setLoading(false);
      return missingKickoff;
    },
    [date, league, sport, source]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchMatches();
      if (cancelled) return;
      // TheSportsDB: horas + marcar FT (limpia partidos ya jugados)
      const enrichRes = await fetch(apiUrl('/api/matches/enrich-kickoffs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (cancelled || !enrichRes.ok) return;
      const enrichData = await enrichRes.json().catch(() => null);
      if (
        !cancelled &&
        enrichData &&
        (enrichData.updated > 0 || enrichData.markedFinished > 0)
      ) {
        await fetchMatches({ silent: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMatches, date]);

  const silentReload = useCallback(() => {
    void fetchMatches({ silent: true });
  }, [fetchMatches]);

  return (
    <PageContainer title={`Partidos de ${dayLabel}`} description="Resumen de partidos scrapeados">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Partidos de {dayLabel}
          </Typography>
          <Typography color="textSecondary">
            Horarios en hora Perú (America/Lima). Fuentes scrapeadas suelen publicar hora UK.
          </Typography>
        </Box>
        <LiveMatchesPoller onUpdate={silentReload} />
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <ButtonGroup size="small" variant="outlined">
              <Button
                variant={date === todayPeru ? 'contained' : 'outlined'}
                onClick={() => setDate(todayPeru)}
              >
                Hoy
              </Button>
              <Button
                variant={date === tomorrowPeru ? 'contained' : 'outlined'}
                onClick={() => setDate(tomorrowPeru)}
              >
                Mañana
              </Button>
            </ButtonGroup>
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
                  <TableCell>Hora (PE)</TableCell>
                  <TableCell>Deporte</TableCell>
                  <TableCell>Liga</TableCell>
                  <TableCell>Local</TableCell>
                  <TableCell>Visitante</TableCell>
                  <TableCell>Tip</TableCell>
                  <TableCell align="center">1</TableCell>
                  <TableCell align="center">X</TableCell>
                  <TableCell align="center">2</TableCell>
                  <TableCell>O/U</TableCell>
                  <TableCell>BTTS</TableCell>
                  <TableCell>Fuente</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} align="center">
                      Sin partidos pendientes para esta fecha. Ejecuta el scraper o espera la próxima
                      corrida.
                    </TableCell>
                  </TableRow>
                )}
                {matches.map((m) => {
                  const p = m.predictions[0];
                  const tipRaw = p?.betChoice ?? null;
                  const tipCode = normalizeTip(tipRaw);
                  const tipLabel = tipRaw
                    ? formatReadablePick(tipRaw, m.homeTeam, m.awayTeam)
                    : null;
                  const book = hasBookOdds(p);
                  return (
                    <TableRow key={m.id} hover>
                      <TableCell>{m.kickoff ?? '—'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={sportLabel((m.sport ?? 'football') as SportKind)}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{m.league}</TableCell>
                      <TableCell>
                        <Typography fontWeight={700} variant="body2" component="span">
                          {m.homeTeam}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={700} variant="body2" component="span">
                          {m.awayTeam}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {tipLabel ? (
                          <Chip
                            size="small"
                            label={tipLabel}
                            color="primary"
                            variant="outlined"
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {book && p?.oddsHome ? String(p.oddsHome) : tipCode === '1' ? 'tip' : '—'}
                      </TableCell>
                      <TableCell align="center">
                        {book && p?.oddsDraw ? String(p.oddsDraw) : tipCode === 'X' ? 'tip' : '—'}
                      </TableCell>
                      <TableCell align="center">
                        {book && p?.oddsAway ? String(p.oddsAway) : tipCode === '2' ? 'tip' : '—'}
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
