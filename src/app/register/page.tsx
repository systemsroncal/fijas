'use client';

import { apiUrl } from '@/lib/paths';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Grid,
  Box,
  Card,
  Stack,
  Typography,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import CustomTextField from '@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField';

/**
 * Registro de suscriptores.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Registro fallido');
        setLoading(false);
        return;
      }
      router.push('/login');
    } catch {
      setError('Error de red');
      setLoading(false);
    }
  };

  return (
    <PageContainer title="Registro" description="Crear cuenta WPS Admin">
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Card elevation={9} sx={{ p: 4, width: '100%', maxWidth: 480 }}>
          <Typography variant="h4" mb={2} fontWeight={700}>
            Crear cuenta
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <form onSubmit={onSubmit}>
            <Stack spacing={2}>
              {(['name', 'username', 'email', 'password'] as const).map((field) => (
                <Box key={field}>
                  <Typography variant="subtitle1" fontWeight={600} mb="5px" textTransform="capitalize">
                    {field === 'name' ? 'Nombre' : field === 'username' ? 'Usuario' : field === 'email' ? 'Email' : 'Contraseña'}
                  </Typography>
                  <CustomTextField
                    type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                    fullWidth
                    required={field === 'email' || field === 'password'}
                    value={form[field]}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm((f) => ({ ...f, [field]: e.target.value }))
                    }
                  />
                </Box>
              ))}
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? <CircularProgress size={22} /> : 'Registrarse'}
              </Button>
            </Stack>
          </form>
          <Typography mt={2} textAlign="center">
            <Link href="/login">Volver al login</Link>
          </Typography>
        </Card>
      </Box>
    </PageContainer>
  );
}
