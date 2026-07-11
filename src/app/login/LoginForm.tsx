'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
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
 * Formulario de login (URL: /wps-admin/login).
 */
export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'SessionInvalid'
      ? 'Tu sesión ya no es válida. Inicia sesión de nuevo.'
      : null
  );
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <PageContainer title="Login" description="WPS Admin Login">
      <Box
        sx={{
          position: 'relative',
          '&:before': {
            content: '""',
            background: 'radial-gradient(#d2f1df, #d3d7fa, #bad8f4)',
            backgroundSize: '400% 400%',
            animation: 'gradient 15s ease infinite',
            position: 'absolute',
            height: '100%',
            width: '100%',
            opacity: 0.3,
          },
        }}
      >
        <Grid container spacing={0} justifyContent="center" sx={{ height: '100vh' }}>
          <Grid
            display="flex"
            justifyContent="center"
            alignItems="center"
            size={{ xs: 12, sm: 12, lg: 4, xl: 3 }}
          >
            <Card elevation={9} sx={{ p: 4, zIndex: 1, width: '100%', maxWidth: 500 }}>
              <Typography variant="h3" textAlign="center" mb={1} fontWeight={700}>
                WPS Admin
              </Typography>
              <Typography variant="subtitle1" textAlign="center" color="textSecondary" mb={3}>
                Dashboard de apuestas deportivas
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={onSubmit}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} mb="5px">
                      Email
                    </Typography>
                    <CustomTextField
                      type="email"
                      fullWidth
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setEmail(e.target.value)
                      }
                      required
                    />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} mb="5px">
                      Contraseña
                    </Typography>
                    <CustomTextField
                      type="password"
                      fullWidth
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setPassword(e.target.value)
                      }
                      required
                    />
                  </Box>
                  <Button
                    color="primary"
                    variant="contained"
                    size="large"
                    fullWidth
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? <CircularProgress size={22} color="inherit" /> : 'Iniciar sesión'}
                  </Button>
                </Stack>
              </form>

              <Stack direction="row" spacing={1} justifyContent="center" mt={3}>
                <Typography color="textSecondary" variant="h6" fontWeight={500}>
                  ¿Nuevo usuario?
                </Typography>
                <Typography
                  component={Link}
                  href="/register"
                  fontWeight={500}
                  sx={{ textDecoration: 'none', color: 'primary.main' }}
                >
                  Crear cuenta
                </Typography>
              </Stack>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </PageContainer>
  );
}
