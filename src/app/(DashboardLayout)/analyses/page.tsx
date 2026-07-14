'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useMemo, useState } from 'react';
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
import { localDateISO } from '@/lib/local-date';

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
  payload?: unknown;
  createdAt: string;
  accumulator: Accumulator | null;
  match?: MatchOpt | null;
};

type Mode = 'MATCH' | 'ACCUMULATOR' | 'RANDOM' | 'SUGGESTED';

function isMatchDashboardPayload(value: unknown): value is StructuredMatchPayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  const probs = p.probs as Record<string, unknown> | undefined;
  return (
    Array.isArray(p.markets) &&
    !!probs &&
    typeof probs.home === 'number' &&
    !!p.scoreline &&
    (p.mode === 'MATCH' || p.mode === 'RANDOM' || p.mode === 'ACCUMULATOR')
  );
}

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

  const pendingAccumulators = useMemo(
    () => accumulators.filter((a) => !a.isAnalyzed),
    [accumulators]
  );

  const analyzedMatchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of analyses) {
      if (a.match?.id) ids.add(a.match.id);
    }
    return ids;
  }, [analyses]);

  const availableMatches = useMemo(
    () => matches.filter((m) => !analyzedMatchIds.has(m.id)),
    [matches, analyzedMatchIds]
  );

  const refresh = async () => {
    setLoading(true);
    const date = localDateISO();
    const [aRes, sRes, anRes, mRes] = await Promise.all([
      fetch(apiUrl('/api/accumulators')),
      fetch(apiUrl('/api/accumulators/suggested')),
      fetch(apiUrl('/api/analyses')),
      fetch(apiUrl(`/api/matches?date=${date}&limit=1000`)),
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

    const activeMode = override?.mode ?? mode;
    const activeMatchId = override?.matchId ?? matchId;

    if (activeMode === 'MATCH' && !activeMatchId) {
      setError('Selecciona un partido');
      return;
    }
    if (activeMode === 'ACCUMULATOR' && !accumulatorId) {
      setError('Selecciona una combinada pendiente de analizar');
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
            ? { mode: 'ACCUMULATOR', suggestedId, provider, enrich: false }
            : { mode: 'ACCUMULATOR', accumulatorId, provider, enrich: false };

    try {
      const res = await fetch(apiUrl('/api/analyses'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Análisis fallido');
        return;
      }

      const candidate = data.payload ?? data.analysis?.payload;
      if (isMatchDashboardPayload(candidate)) {
        setPayload(candidate);
      } else {
        setError('El análisis no devolvió un dashboard estructurado.');
        setPayload(null);
      }

      const a = data.analysis;
      setResultMsg(
        `Riesgo: ${a?.riskScore ?? data.result?.riskScore} | EV: ${a?.evScore ?? data.result?.evScore} | Stake: ${a?.recommendedStake ?? data.result?.recommendedStake} | ${a?.iaProvider ?? data.result?.providerUsed}`
      );

      // Limpiar selección de combinada ya analizada
      if (activeMode === 'ACCUMULATOR') setAccumulatorId('');
      if (activeMode === 'MATCH' && activeMatchId) setMatchId('');

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red al analizar');
    } finally {
      setRunning(false);
    }
  };

  const analyzeMatchById = (id: string) => {
    void run({ mode: 'MATCH', matchId: id });
  };

  const openHistory = (a: Analysis) => {
    setError(null);
    setResultMsg(null);
    if (isMatchDashboardPayload(a.payload)) {
      setPayload(a.payload);
      return;
    }
    setError('Este análisis antiguo no tiene dashboard. Genera uno nuevo.');
  };

  const analyzeLabel =
    mode === 'RANDOM'
      ? 'Analizar aleatorio'
      : mode === 'ACCUMULATOR'
        ? 'Analizar combinada'
        : mode === 'SUGGESTED'
          ? 'Analizar sugerida'
          : 'Analizar partido';

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

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
              {mode === 'MATCH' && (
                <TextField
                  select
                  label="Partido pendiente"
                  size="small"
                  fullWidth
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  helperText={
                    availableMatches.length === 0
                      ? 'Sin partidos nuevos (ya analizados o sin scrapers)'
                      : `${availableMatches.length} sin analizar · ${matches.length} totales`
                  }
                >
                  {availableMatches.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.homeTeam} vs {m.awayTeam} ({m.league})
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {mode === 'ACCUMULATOR' && (
                <TextField
                  select
                  label="Combinada pendiente"
                  size="small"
                  fullWidth
                  value={accumulatorId}
                  onChange={(e) => setAccumulatorId(e.target.value)}
                  helperText={
                    pendingAccumulators.length === 0
                      ? 'No hay combinadas sin analizar — créalas en el Creador'
                      : `${pendingAccumulators.length} pendientes`
                  }
                >
                  {pendingAccumulators.map((a) => (
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
                  Elige un partido al azar entre los pendientes (no reutiliza los ya analizados).
                  También propone combinadas/huecos nuevos. Pulsa el botón para lanzar otro
                  análisis distinto.
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
              <Button
                variant="contained"
                size="large"
                onClick={() => run()}
                disabled={running}
                sx={{ minWidth: 200, whiteSpace: 'nowrap' }}
              >
                {running ? <CircularProgress size={22} color="inherit" /> : analyzeLabel}
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
          {mode === 'RANDOM' && (
            <Stack direction="row" spacing={1} mt={2} flexWrap="wrap">
              <Button variant="outlined" onClick={() => run({ mode: 'RANDOM' })} disabled={running}>
                Analizar otro aleatorio
              </Button>
            </Stack>
          )}
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
          {analyses.map((a) => {
            const canDashboard = isMatchDashboardPayload(a.payload);
            return (
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
                    <Button size="small" onClick={() => openHistory(a)} disabled={!canDashboard}>
                      Ver dashboard
                    </Button>
                  </Stack>
                  <Typography variant="body2" color="textSecondary">
                    Riesgo {a.riskScore} · EV {a.evScore} · Stake {a.recommendedStake}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </PageContainer>
  );
}
