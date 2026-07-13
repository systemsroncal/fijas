'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import { AI_PROVIDERS } from '@/lib/ai/providers-client';
import MatchAnalysisDashboard from '@/components/analysis/MatchAnalysisDashboard';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { isJunkMatch } from '@/lib/match-display';

type Accumulator = {
  id: string;
  name: string | null;
  totalOdds: string;
  isAnalyzed: boolean;
};

type Suggested = {
  id: string;
  sourceSlug: string;
  title: string;
  totalOdds: string;
};

type MatchOpt = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
};

type Analysis = {
  id: string;
  mode?: string;
  iaProvider: string;
  riskScore: string | null;
  evScore: string | null;
  recommendedStake: string | null;
  response: string;
  payload?: StructuredMatchPayload | null;
  createdAt: string;
  accumulator: Accumulator | null;
  match?: MatchOpt | null;
};

type Mode = 'MATCH' | 'ACCUMULATOR' | 'RANDOM' | 'SUGGESTED';

/**
 * Análisis IA: partido, combinada, sugeridas y scanner aleatorio.
 */
export default function AnalysesPage() {
  const [mode, setMode] = useState<Mode>('MATCH');
  const [accumulators, setAccumulators] = useState<Accumulator[]>([]);
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [matches, setMatches] = useState<MatchOpt[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [accumulatorId, setAccumulatorId] = useState('');
  const [suggestedId, setSuggestedId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [provider, setProvider] = useState('OPENAI');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<StructuredMatchPayload | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const date = new Date().toISOString().slice(0, 10);
    const [aRes, sRes, anRes, mRes] = await Promise.all([
      fetch(apiUrl('/api/accumulators')),
      fetch(apiUrl('/api/accumulators/suggested')),
      fetch(apiUrl('/api/analyses')),
      fetch(apiUrl(`/api/matches?date=${date}`)),
    ]);
    if (aRes.ok) {
      const data = await aRes.json();
      setAccumulators(data.accumulators ?? []);
    }
    if (sRes.ok) {
      const data = await sRes.json();
      setSuggested(data.items ?? []);
    }
    if (anRes.ok) {
      const data = await anRes.json();
      setAnalyses(data.analyses ?? []);
    }
    if (mRes.ok) {
      const data = await mRes.json();
      const rows = (data.matches ?? []) as MatchOpt[];
      setMatches(rows.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam)));
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const run = async (override?: { mode?: Mode; matchId?: string }) => {
    setError(null);
    setResultMsg(null);
    setPayload(null);

    const activeMode = override?.mode ?? mode;
    const activeMatchId = override?.matchId ?? matchId;

    if (activeMode === 'MATCH' && !activeMatchId) {
      setError('Selecciona un partido');
      return;
    }
    if (activeMode === 'ACCUMULATOR' && !accumulatorId) {
      setError('Selecciona una combinada creada');
      return;
    }
    if (activeMode === 'SUGGESTED' && !suggestedId) {
      setError('Selecciona una combinada sugerida');
      return;
    }

    setRunning(true);
    if (override?.matchId) {
      setMode('MATCH');
      setMatchId(override.matchId);
    }

    const body =
      activeMode === 'MATCH'
        ? { mode: 'MATCH', matchId: activeMatchId, provider, enrich: false }
        : activeMode === 'RANDOM'
          ? { mode: 'RANDOM', provider, enrich: false }
          : activeMode === 'SUGGESTED'
            ? { mode: 'ACCUMULATOR', suggestedId, provider }
            : { mode: 'ACCUMULATOR', accumulatorId, provider };

    const res = await fetch(apiUrl('/api/analyses'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setRunning(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Análisis fallido');
      return;
    }

    if (data.payload) {
      setPayload(data.payload as StructuredMatchPayload);
    } else if (data.analysis?.payload) {
      setPayload(data.analysis.payload as StructuredMatchPayload);
    }

    if (data.result || data.analysis) {
      const a = data.analysis;
      setResultMsg(
        `Riesgo: ${a?.riskScore ?? data.result?.riskScore} | EV: ${a?.evScore ?? data.result?.evScore} | Stake: ${a?.recommendedStake ?? data.result?.recommendedStake} | ${a?.iaProvider ?? data.result?.providerUsed}`
      );
    }
    refresh();
  };

  const analyzeMatchById = (id: string) => {
    void run({ mode: 'MATCH', matchId: id });
  };

  return (
    <PageContainer title="Análisis IA" description="Partido, combinada y scanner de huecos">
      <Typography variant="h4" fontWeight={700} mb={2}>
        Análisis con IA
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={mode}
              onChange={(_, v) => {
                if (v) setMode(v);
              }}
            >
              <ToggleButton value="MATCH">Por partido</ToggleButton>
              <ToggleButton value="ACCUMULATOR">Mis combinadas</ToggleButton>
              <ToggleButton value="SUGGESTED">Sugeridas</ToggleButton>
              <ToggleButton value="RANDOM">Aleatorio / huecos</ToggleButton>
            </ToggleButtonGroup>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              {mode === 'MATCH' && (
                <TextField
                  select
                  label="Partido de hoy"
                  size="small"
                  fullWidth
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  helperText={
                    matches.length === 0 ? 'Sin partidos hoy — ejecuta scrapers' : `${matches.length} partidos`
                  }
                >
                  {matches.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.homeTeam} vs {m.awayTeam} ({m.league})
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {mode === 'ACCUMULATOR' && (
                <TextField
                  select
                  label="Combinada del creador"
                  size="small"
                  fullWidth
                  value={accumulatorId}
                  onChange={(e) => setAccumulatorId(e.target.value)}
                >
                  {accumulators.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.name ?? a.id} (@{a.totalOdds})
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {mode === 'SUGGESTED' && (
                <TextField
                  select
                  label="Combinada sugerida"
                  size="small"
                  fullWidth
                  value={suggestedId}
                  onChange={(e) => setSuggestedId(e.target.value)}
                >
                  {suggested.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      [{s.sourceSlug}] {s.title} (@{s.totalOdds})
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {mode === 'RANDOM' && (
                <Alert severity="info" sx={{ flex: 1 }}>
                  Escanea partidos de hoy con Poisson + edge, propone combinadas segura / value /
                  arriesgada. Opcionalmente enriquece props con tu API key.
                </Alert>
              )}
              <TextField
                select
                label="Proveedor IA"
                size="small"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                {AI_PROVIDERS.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.label}
                  </MenuItem>
                ))}
              </TextField>
            <Button variant="contained" onClick={() => run()} disabled={running}>
              {running ? <CircularProgress size={22} /> : 'Analizar'}
            </Button>
            </Stack>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {resultMsg && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {resultMsg}
            </Alert>
          )}
        </CardContent>
      </Card>

      {payload && (
        <Box mb={3}>
          <MatchAnalysisDashboard payload={payload} onAnalyzeMatch={analyzeMatchById} />
        </Box>
      )}

      {loading ? (
        <Box textAlign="center">
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          <Typography variant="h6">Historial</Typography>
          {analyses.length === 0 && (
            <Typography color="textSecondary">Aún no hay análisis.</Typography>
          )}
          {analyses.map((a) => (
            <Card key={a.id}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap">
                  <Chip size="small" label={a.mode ?? 'ACCUMULATOR'} />
                  <Typography fontWeight={600}>
                    {a.match
                      ? `${a.match.homeTeam} vs ${a.match.awayTeam}`
                      : a.accumulator?.name ?? 'Análisis'}
                  </Typography>
                  <Chip size="small" label={a.iaProvider} />
                  {a.payload && (
                    <Button
                      size="small"
                      onClick={() => setPayload(a.payload as StructuredMatchPayload)}
                    >
                      Ver dashboard
                    </Button>
                  )}
                </Stack>
                <Typography variant="body2" color="textSecondary">
                  Riesgo {a.riskScore} · EV {a.evScore} · Stake {a.recommendedStake}
                </Typography>
                {!a.payload && (
                  <Typography variant="body2" mt={1} component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                    {a.response.slice(0, 800)}
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </PageContainer>
  );
}
