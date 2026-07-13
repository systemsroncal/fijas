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

type Accumulator = {
  id: string;
  name: string | null;
  totalOdds: string;
  isAnalyzed: boolean;
  matches?: Array<{
    betChoice: string | null;
    odds: string | null;
    match: { homeTeam: string; awayTeam: string; league: string };
  }>;
};

type Suggested = {
  id: string;
  sourceSlug: string;
  title: string;
  totalOdds: string;
  matchDate: string;
  legsJson: unknown;
};

type Analysis = {
  id: string;
  iaProvider: string;
  riskScore: string | null;
  evScore: string | null;
  recommendedStake: string | null;
  response: string;
  createdAt: string;
  accumulator: Accumulator;
};

type Mode = 'mine' | 'suggested';

/**
 * Análisis IA: combinadas propias (creador) y sugeridas por scrapers.
 */
export default function AnalysesPage() {
  const [mode, setMode] = useState<Mode>('mine');
  const [accumulators, setAccumulators] = useState<Accumulator[]>([]);
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [accumulatorId, setAccumulatorId] = useState('');
  const [suggestedId, setSuggestedId] = useState('');
  const [provider, setProvider] = useState('OPENAI');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  const refresh = async () => {
    setLoading(true);
    const [aRes, sRes, anRes] = await Promise.all([
      fetch(apiUrl('/api/accumulators')),
      fetch(apiUrl('/api/accumulators/suggested')),
      fetch(apiUrl('/api/analyses')),
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
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const run = async () => {
    setError(null);
    setResult(null);
    if (mode === 'mine' && !accumulatorId) {
      setError('Selecciona una combinada creada');
      return;
    }
    if (mode === 'suggested' && !suggestedId) {
      setError('Selecciona una combinada sugerida');
      return;
    }
    setRunning(true);
    const res = await fetch(apiUrl('/api/analyses'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        mode === 'mine'
          ? { accumulatorId, provider }
          : { suggestedId, provider }
      ),
    });
    const data = await res.json();
    setRunning(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Análisis fallido');
      return;
    }
    setResult(data.analysis);
    refresh();
  };

  return (
    <PageContainer title="Análisis IA" description="Riesgo, EV y stake recomendado">
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
              <ToggleButton value="mine">Mis combinadas</ToggleButton>
              <ToggleButton value="suggested">Sugeridas (scraper/IA fuente)</ToggleButton>
            </ToggleButtonGroup>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              {mode === 'mine' ? (
                <TextField
                  select
                  label="Combinada del creador"
                  size="small"
                  fullWidth
                  value={accumulatorId}
                  onChange={(e) => setAccumulatorId(e.target.value)}
                  helperText={
                    accumulators.length === 0
                      ? 'Crea una en Creador de combinadas'
                      : `${accumulators.length} guardadas`
                  }
                >
                  {accumulators.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.name ?? a.id} (@{a.totalOdds})
                      {a.isAnalyzed ? ' · analizada' : ''}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  select
                  label="Combinada sugerida"
                  size="small"
                  fullWidth
                  value={suggestedId}
                  onChange={(e) => setSuggestedId(e.target.value)}
                  helperText={
                    suggested.length === 0
                      ? 'Aún no hay sugeridas (Predictz / WinDrawWin / Scores24)'
                      : `${suggested.length} disponibles`
                  }
                >
                  {suggested.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      [{s.sourceSlug}] {s.title} (@{s.totalOdds})
                    </MenuItem>
                  ))}
                </TextField>
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
              <Button variant="contained" onClick={run} disabled={running}>
                {running ? <CircularProgress size={22} /> : 'Analizar'}
              </Button>
            </Stack>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {result && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Riesgo: {result.riskScore} | EV: {result.evScore} | Stake: {result.recommendedStake} |
              Proveedor: {result.iaProvider}
            </Alert>
          )}
        </CardContent>
      </Card>

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
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <Typography fontWeight={600}>
                    {a.accumulator.name ?? 'Combinada'}
                  </Typography>
                  <Chip size="small" label={a.iaProvider} />
                  <Chip size="small" variant="outlined" label={`@ ${a.accumulator.totalOdds}`} />
                </Stack>
                <Typography variant="body2" color="textSecondary">
                  Riesgo {a.riskScore} · EV {a.evScore} · Stake {a.recommendedStake}
                </Typography>
                <Typography variant="body2" mt={1} component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                  {a.response}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </PageContainer>
  );
}
