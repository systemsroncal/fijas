'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { IconRefresh } from '@tabler/icons-react';
import { apiUrl } from '@/lib/paths';
import type { APIHealthStatus } from '@/lib/analysis/contracts';

type StatusResponse = {
  ok: boolean;
  at: string;
  env: { footballData: boolean; rapidApi: boolean };
  summary: { up: number; degraded: number; down: number };
  providers: APIHealthStatus[];
};

const stateColor: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  UP: 'success',
  DEGRADED: 'warning',
  DOWN: 'error',
};

const circuitColor: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  closed: 'success',
  open: 'error',
  'half-open': 'warning',
};

function isRapidProvider(id: string): boolean {
  return id.startsWith('rapidapi_');
}

export default function ApiStatusPanel({ compact }: { compact?: boolean }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/system/status'), { cache: 'no-store' });
      const json = (await res.json()) as StatusResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar estado');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <Stack alignItems="center" py={4}>
        <CircularProgress size={28} />
        <Typography variant="body2" color="text.secondary" mt={1}>
          Consultando estado de APIs…
        </Typography>
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void load()}>
            Reintentar
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (!data) return null;

  const rapidProviders = data.providers.filter((p) => p.kind === 'data' && isRapidProvider(p.providerId));
  const otherData = data.providers.filter((p) => p.kind === 'data' && !isRapidProvider(p.providerId));
  const llmProviders = data.providers.filter((p) => p.kind === 'llm');

  const renderTable = (rows: APIHealthStatus[], title: string) => (
    <Box mb={compact ? 2 : 3}>
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>
        {title}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Proveedor</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Circuito</TableCell>
              <TableCell align="right">Latencia</TableCell>
              <TableCell>Último error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.providerId} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {p.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.providerId}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" label={p.state} color={stateColor[p.state] ?? 'default'} />
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={p.circuit}
                    color={circuitColor[p.circuit] ?? 'default'}
                  />
                </TableCell>
                <TableCell align="right">
                  {p.latencyMs != null ? `${p.latencyMs} ms` : '—'}
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" noWrap title={p.lastError ?? ''}>
                    {p.lastError?.slice(0, 48) ?? '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label={data.env.rapidApi ? 'RAPIDAPI_KEY ✓' : 'RAPIDAPI_KEY ausente'}
            color={data.env.rapidApi ? 'success' : 'warning'}
            variant="outlined"
          />
          <Chip
            label={data.env.footballData ? 'FOOTBALL_DATA ✓' : 'FOOTBALL_DATA ausente'}
            color={data.env.footballData ? 'success' : 'default'}
            variant="outlined"
          />
          <Chip label={`UP ${data.summary.up}`} color="success" size="small" />
          <Chip label={`Degradado ${data.summary.degraded}`} color="warning" size="small" />
          <Chip label={`DOWN ${data.summary.down}`} color="error" size="small" />
        </Stack>
        <Button
          size="small"
          variant="outlined"
          startIcon={<IconRefresh size={16} />}
          onClick={() => void load()}
          disabled={loading}
        >
          Actualizar
        </Button>
      </Stack>

      {!data.env.rapidApi && (
        <Alert severity="warning">
          Configura <strong>RAPIDAPI_KEY</strong> en el servidor (.env / Vercel) para activar Football
          Prediction, SportScore, odds live y API-Football stats.
        </Alert>
      )}

      {renderTable(rapidProviders, 'RapidAPI')}
      {!compact && renderTable(otherData, 'Otras fuentes de datos')}
      {!compact && renderTable(llmProviders, 'Proveedores IA (cascada)')}

      <Typography variant="caption" color="text.secondary">
        Actualizado: {new Date(data.at).toLocaleString('es-PE')}
      </Typography>
    </Stack>
  );
}
