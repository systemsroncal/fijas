import React from 'react';
import { Box, AppBar, Toolbar, styled, Stack, IconButton, Badge } from '@mui/material';
import Profile from './Profile';
import { IconBellRinging, IconMenu2 } from '@tabler/icons-react';

interface ItemType {
  /** Abre/cierra sidebar (móvil y escritorio) */
  toggleSidebar: (event: React.MouseEvent<HTMLElement>) => void;
}

const Header = ({ toggleSidebar }: ItemType) => {
  const AppBarStyled = styled(AppBar)(({ theme }) => ({
    boxShadow: 'none',
    background: theme.palette.background.paper,
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    [theme.breakpoints.up('lg')]: {
      minHeight: '70px',
    },
  }));
  const ToolbarStyled = styled(Toolbar)(({ theme }) => ({
    width: '100%',
    color: theme.palette.text.secondary,
  }));

  return (
    <AppBarStyled position="sticky" color="default">
      <ToolbarStyled>
        <IconButton
          color="inherit"
          aria-label="Abrir o cerrar menú"
          onClick={toggleSidebar}
          edge="start"
          sx={{ mr: 1 }}
        >
          <IconMenu2 width="22" height="22" />
        </IconButton>

        <IconButton
          size="large"
          aria-label="notificaciones"
          color="inherit"
          aria-controls="msgs-menu"
          aria-haspopup="true"
        >
          <Badge variant="dot" color="primary">
            <IconBellRinging size="21" stroke="1.5" />
          </Badge>
        </IconButton>
        <Box flexGrow={1} />
        <Stack spacing={1} direction="row" alignItems="center">
          <Profile />
        </Stack>
      </ToolbarStyled>
    </AppBarStyled>
  );
};

export default Header;
