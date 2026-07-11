'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  MenuItem,
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

type Log = {
  id: string;
  category: string;
  level: string;
  message: string;
  createdAt: string;
};

/**
 * Logs del sistema.
 */
export default function AdminLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [category, setCategory] = useState('');

  useEffect(() => {
    const load = async () => {
      const params = category ? `?category=${category}` : '';
      const res = await fetch(apiUrl(`/api/admin/logs${params}`));
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    };
    load();
  }, [category]);

  return (
    <PageContainer title="Logs" description="Logs del sistema">
      <Stack direction="row" justifyContent="space-between" mb={2}>
        <Typography variant="h4" fontWeight={700}>
          Logs
        </Typography>
        <TextField
          select
          size="small"
          label="Categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Todas</MenuItem>
          <MenuItem value="SCRAPING">SCRAPING</MenuItem>
          <MenuItem value="AUTH">AUTH</MenuItem>
          <MenuItem value="API_KEY">API_KEY</MenuItem>
          <MenuItem value="ADMIN">ADMIN</MenuItem>
          <MenuItem value="SYSTEM">SYSTEM</MenuItem>
        </TextField>
      </Stack>
      <Card>
        <CardContent sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Cat</TableCell>
                <TableCell>Nivel</TableCell>
                <TableCell>Mensaje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{new Date(l.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{l.category}</TableCell>
                  <TableCell>{l.level}</TableCell>
                  <TableCell>{l.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
