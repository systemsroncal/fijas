'use client';

import { Card, CardContent } from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import ApiStatusPanel from '@/components/system/ApiStatusPanel';

export default function ApiStatusPage() {
  return (
    <PageContainer
      title="Estado de APIs"
      description="Salud de RapidAPI, football-data.org, TheSportsDB y circuit breakers"
    >
      <Card>
        <CardContent>
          <ApiStatusPanel />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
