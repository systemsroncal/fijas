'use client';
import { styled, Container, Box, useMediaQuery, Theme } from '@mui/material';
import React, { useState } from 'react';
import Header from '@/app/(DashboardLayout)/layout/header/Header';
import Sidebar from '@/app/(DashboardLayout)/layout/sidebar/Sidebar';

const MainWrapper = styled('div')(() => ({
  display: 'flex',
  minHeight: '100vh',
  width: '100%',
}));

const PageWrapper = styled('div')(() => ({
  display: 'flex',
  flexGrow: 1,
  paddingBottom: '60px',
  flexDirection: 'column',
  zIndex: 1,
  backgroundColor: 'transparent',
  minWidth: 0,
}));

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lgUp = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    if (lgUp) {
      setSidebarOpen((v) => !v);
    } else {
      setMobileSidebarOpen((v) => !v);
    }
  };

  return (
    <MainWrapper className="mainwrapper">
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onSidebarClose={() => setMobileSidebarOpen(false)}
        onToggleDesktopSidebar={() => setSidebarOpen((v) => !v)}
      />

      <PageWrapper className="page-wrapper">
        <Header toggleSidebar={toggleSidebar} />
        <Container
          sx={{
            paddingTop: '20px',
            maxWidth: '1200px',
          }}
        >
          <Box sx={{ minHeight: 'calc(100vh - 170px)' }}>{children}</Box>
        </Container>
      </PageWrapper>
    </MainWrapper>
  );
}
