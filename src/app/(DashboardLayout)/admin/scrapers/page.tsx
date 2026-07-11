'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
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

type Source = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  scrapingStatus: string;
  lastScraped: string | null;
  lastError: string | null;
  selectorsConfig: Record<string, unknown> | null;
};

/**
 * Gestión de scrapers y disparo manual vía GitHub Actions.
 */
export default function AdminScrapersPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = async () => {
    const res = await fetch(apiUrl('/api/admin/scrapers'));
    if (res.ok) {
      const data = await res.json();
      setSources(data.sources ?? []);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runManual = async (sourceSlug?: string) => {
    setMessage(null);
    setError(null);
    const res = await fetch(apiUrl('/api/admin/scrapers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceSlug }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'No se pudo disparar');
      return;
    }
    setMessage('Workflow de scraping disparado');
  };

  const saveSelectors = async (id: string) => {
    try {
      const selectorsConfig = JSON.parse(editing[id] || '{}');
      await fetch(apiUrl('/api/admin/scrapers'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, selectorsConfig }),
      });
      setMessage('Selectores guardados');
      load();
    } catch {
      setError('JSON de selectores inválido');
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await fetch(apiUrl('/api/admin/scrapers'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    });
    load();
  };

  return (
    <PageContainer title="Scrapers" description="Fuentes de scraping">
      <Stack direction="row" justifyContent="space-between" mb={2}>
        <Typography variant="h4" fontWeight={700}>
          Scrapers
        </Typography>
        <Button variant="contained" onClick={() => runManual()}>
          Ejecutar todos
        </Button>
      </Stack>
      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card>
        <CardContent sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Sitio</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Última ejecución</TableCell>
                <TableCell>Activo</TableCell>
                <TableCell>Selectores</TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    <Chip size="small" label={s.scrapingStatus} />
                  </TableCell>
                  <TableCell>
                    {s.lastScraped ? new Date(s.lastScraped).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => toggleActive(s.id, !s.isActive)}>
                      {s.isActive ? 'On' : 'Off'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      multiline
                      minRows={2}
                      placeholder='{"row":"..."}'
                      value={
                        editing[s.id] ??
                        (s.selectorsConfig ? JSON.stringify(s.selectorsConfig) : '')
                      }
                      onChange={(e) =>
                        setEditing((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      sx={{ minWidth: 180 }}
                    />
                    <Button size="small" onClick={() => saveSelectors(s.id)}>
                      Guardar
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => runManual(s.slug)}>
                      Run
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
