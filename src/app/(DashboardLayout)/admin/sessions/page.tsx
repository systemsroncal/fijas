'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';

type Control = {
  role: 'SUPERADMIN' | 'SUBSCRIBER';
  maxSessions: number;
  enforceSingleDevice: boolean;
};

/**
 * Configuración de sesiones simultáneas por rol.
 */
export default function AdminSessionsPage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(apiUrl('/api/admin/sessions'));
    if (res.ok) {
      const data = await res.json();
      setControls(data.controls ?? []);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (control: Control) => {
    const res = await fetch(apiUrl('/api/admin/sessions'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(control),
    });
    if (res.ok) {
      setMessage(`Actualizado ${control.role}`);
      load();
    }
  };

  const forceLogout = async (role: Control['role']) => {
    const res = await fetch(apiUrl('/api/admin/sessions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (res.ok) setMessage(`Cerradas ${data.deleted} sesiones de ${role}`);
  };

  return (
    <PageContainer title="Sesiones" description="Límites por rol">
      <Typography variant="h4" fontWeight={700} mb={2}>
        Control de sesiones
      </Typography>
      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      <Stack spacing={2}>
        {controls.map((c) => (
          <Card key={c.role}>
            <CardContent>
              <Typography fontWeight={700} mb={2}>
                {c.role}
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
                <TextField
                  type="number"
                  label="Max sesiones"
                  size="small"
                  value={c.maxSessions}
                  onChange={(e) =>
                    setControls((prev) =>
                      prev.map((x) =>
                        x.role === c.role
                          ? { ...x, maxSessions: Number(e.target.value) }
                          : x
                      )
                    )
                  }
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={c.enforceSingleDevice}
                      onChange={(e) =>
                        setControls((prev) =>
                          prev.map((x) =>
                            x.role === c.role
                              ? { ...x, enforceSingleDevice: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                  }
                  label="Dispositivo único"
                />
                <Button variant="contained" onClick={() => save(c)}>
                  Guardar
                </Button>
                <Button color="error" variant="outlined" onClick={() => forceLogout(c.role)}>
                  Forzar logout
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </PageContainer>
  );
}
