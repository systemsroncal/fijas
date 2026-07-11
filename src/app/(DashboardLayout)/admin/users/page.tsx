'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
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

type UserRow = {
  id: string;
  email: string;
  username: string | null;
  role: 'SUPERADMIN' | 'SUBSCRIBER';
  maxSessions: number | null;
  isActive: boolean;
  _count: { sessions: number };
};

/**
 * Gestión de usuarios (SuperAdmin).
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(apiUrl('/api/admin/users'));
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users ?? []);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const patch = async (userId: string, payload: Record<string, unknown>) => {
    const res = await fetch(apiUrl('/api/admin/users'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...payload }),
    });
    if (res.ok) {
      setMessage('Usuario actualizado');
      load();
    }
  };

  return (
    <PageContainer title="Usuarios" description="Gestión de usuarios">
      <Typography variant="h4" fontWeight={700} mb={2}>
        Usuarios
      </Typography>
      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      <Card>
        <CardContent sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>Max sesiones</TableCell>
                <TableCell>Activas</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={u.role}
                      onChange={(e) => patch(u.id, { role: e.target.value })}
                    >
                      <MenuItem value="SUBSCRIBER">SUBSCRIBER</MenuItem>
                      <MenuItem value="SUPERADMIN">SUPERADMIN</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={u.maxSessions ?? ''}
                      placeholder="rol default"
                      onBlur={(e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value);
                        patch(u.id, { maxSessions: val });
                      }}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell>{u._count.sessions}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      color={u.isActive ? 'warning' : 'success'}
                      onClick={() => patch(u.id, { isActive: !u.isActive })}
                    >
                      {u.isActive ? 'Desactivar' : 'Activar'}
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
