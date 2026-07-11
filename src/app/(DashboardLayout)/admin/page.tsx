'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, Grid, Stack, Typography, Button } from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';

/**
 * Hub del panel SuperAdmin.
 */
export default function AdminHomePage() {
  const links = [
    { href: '/admin/users', title: 'Usuarios', desc: 'Roles y max_sessions' },
    { href: '/admin/sessions', title: 'Sesiones', desc: 'Límites por rol y force logout' },
    { href: '/admin/scrapers', title: 'Scrapers', desc: 'Estado y ejecución manual' },
    { href: '/admin/logs', title: 'Logs', desc: 'Auth, scraping y API keys' },
  ];

  return (
    <PageContainer title="Admin" description="Panel SuperAdmin">
      <Typography variant="h4" fontWeight={700} mb={3}>
        Panel SuperAdmin
      </Typography>
      <Grid container spacing={2}>
        {links.map((l) => (
          <Grid key={l.href} size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="h5">{l.title}</Typography>
                  <Typography color="textSecondary">{l.desc}</Typography>
                  <Button component={Link} href={l.href} variant="contained" sx={{ alignSelf: 'flex-start' }}>
                    Abrir
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </PageContainer>
  );
}
