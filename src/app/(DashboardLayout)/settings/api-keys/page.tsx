'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import { AI_HELP, AI_PROVIDERS } from '@/lib/ai/providers-client';

type SavedKey = {
  provider: string;
  isActive: boolean;
  lastUsed: string | null;
};

/**
 * Configuración de claves API por proveedor (encriptadas en servidor).
 */
export default function ApiKeysSettingsPage() {
  const [saved, setSaved] = useState<SavedKey[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [helpProvider, setHelpProvider] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch(apiUrl('/api/api-keys'));
    if (res.ok) {
      const data = await res.json();
      setSaved(data.keys ?? []);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async (provider: string) => {
    setBusy(provider);
    setMessage(null);
    setError(null);
    const res = await fetch(apiUrl('/api/api-keys'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey: values[provider] }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Error al guardar');
      return;
    }
    setMessage(`${provider} guardada`);
    setValues((v) => ({ ...v, [provider]: '' }));
    refresh();
  };

  const test = async (provider: string) => {
    setBusy(`test-${provider}`);
    setMessage(null);
    setError(null);
    const res = await fetch(apiUrl('/api/api-keys/test'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        apiKey: values[provider] || undefined,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok || !data.ok) {
      setError(data.message ?? data.error ?? 'Conexión fallida');
      return;
    }
    setMessage(`${provider}: ${data.message}`);
  };

  return (
    <PageContainer title="API Keys" description="Configura tus claves de IA">
      <Typography variant="h4" fontWeight={700} mb={2}>
        Claves API
      </Typography>
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

      <Stack spacing={2}>
        {AI_PROVIDERS.map((p) => {
          const existing = saved.find((s) => s.provider === p.id);
          return (
            <Card key={p.id}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <Typography fontWeight={600}>{p.label}</Typography>
                  {existing && (
                    <Typography variant="caption" color="success.main">
                      Configurada
                    </Typography>
                  )}
                  <IconButton size="small" onClick={() => setHelpProvider(p.id)}>
                    <HelpOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    type="password"
                    size="small"
                    fullWidth
                    placeholder={existing ? '•••••••• (dejar vacío para probar la guardada)' : 'Pega tu API key'}
                    value={values[p.id] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <Button
                    variant="contained"
                    disabled={!values[p.id] || busy === p.id}
                    onClick={() => save(p.id)}
                  >
                    {busy === p.id ? <CircularProgress size={18} /> : 'Guardar'}
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={busy === `test-${p.id}` || (!values[p.id] && !existing)}
                    onClick={() => test(p.id)}
                  >
                    {busy === `test-${p.id}` ? <CircularProgress size={18} /> : 'Probar'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Dialog open={!!helpProvider} onClose={() => setHelpProvider(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Cómo obtener la clave — {helpProvider}</DialogTitle>
        <DialogContent>
          <Box component="ol" sx={{ pl: 2 }}>
            {(helpProvider ? AI_HELP[helpProvider] ?? [] : []).map((step) => (
              <li key={step}>
                <Typography variant="body2">{step}</Typography>
              </li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpProvider(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
