'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  Box,
  MenuItem,
  TextField,
} from '@mui/material';
import Link from 'next/link';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';

type Suggested = {
  id: string;
  sourceSlug: string;
  title: string;
  totalOdds: string;
  matchDate: string;
  legsJson: unknown;
};

/**
 * Acumuladas prearmadas de Predictz, WinDrawWin y Scores24.
 */
export default function SuggestedAccumulatorsPage() {
  const [items, setItems] = useState<Suggested[]>([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const params = source ? `?source=${source}` : '';
      const res = await fetch(apiUrl(`/api/accumulators/suggested${params}`));
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
      setLoading(false);
    };
    load();
  }, [source]);

  return (
    <PageContainer title="Acumuladas sugeridas" description="Combinadas prearmadas">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight={700}>
          Acumuladas sugeridas
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button component={Link} href="/analyses" variant="outlined" size="small">
            Ir a Análisis IA
          </Button>
          <TextField
            select
            size="small"
            label="Fuente"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="predictz">Predictz</MenuItem>
            <MenuItem value="windrawwin">WinDrawWin</MenuItem>
            <MenuItem value="scores24">Scores24</MenuItem>
          </TextField>
        </Stack>
      </Stack>

      {loading ? (
        <Box textAlign="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          {items.length === 0 && (
            <Typography color="textSecondary">
              Aún no hay combinadas sugeridas. Se generan al scrapear Predictz, WinDrawWin y Scores24.
            </Typography>
          )}
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap">
                  <Chip label={item.sourceSlug} size="small" color="primary" />
                  <Typography fontWeight={600}>{item.title}</Typography>
                  <Chip label={`@ ${item.totalOdds}`} size="small" />
                  <Button
                    component={Link}
                    href="/analyses"
                    size="small"
                    variant="contained"
                    sx={{ ml: 'auto' }}
                  >
                    Analizar con IA
                  </Button>
                </Stack>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  component="pre"
                  sx={{ whiteSpace: 'pre-wrap' }}
                >
                  {JSON.stringify(item.legsJson, null, 2)}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </PageContainer>
  );
}
