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
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import { AI_PROVIDERS } from '@/lib/ai/providers-client';

type Accumulator = {
  id: string;
  name: string | null;
  totalOdds: string;
  isAnalyzed: boolean;
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

/**
 * Página de análisis con IA múltiple.
 */
export default function AnalysesPage() {
  const [accumulators, setAccumulators] = useState<Accumulator[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [accumulatorId, setAccumulatorId] = useState('');
  const [provider, setProvider] = useState('OPENAI');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  const refresh = async () => {
    setLoading(true);
    const [aRes, anRes] = await Promise.all([
      fetch(apiUrl('/api/accumulators')),
      fetch(apiUrl('/api/analyses')),
    ]);
    if (aRes.ok) {
      const data = await aRes.json();
      setAccumulators(data.accumulators ?? []);
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
    if (!accumulatorId) {
      setError('Selecciona una combinada');
      return;
    }
    setRunning(true);
    const res = await fetch(apiUrl('/api/analyses'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accumulatorId, provider }),
    });
    const data = await res.json();
    setRunning(false);
    if (!res.ok) {
      setError(data.error ?? 'Análisis fallido');
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
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              select
              label="Combinada"
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
          {analyses.map((a) => (
            <Card key={a.id}>
              <CardContent>
                <Typography fontWeight={600}>
                  {a.accumulator.name} — {a.iaProvider}
                </Typography>
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
