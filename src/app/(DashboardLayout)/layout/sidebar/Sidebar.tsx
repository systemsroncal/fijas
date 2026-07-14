import { useMediaQuery, Box, Drawer, IconButton } from '@mui/material';
import { IconX } from '@tabler/icons-react';
import SidebarItems from './SidebarItems';

interface ItemType {
  isMobileSidebarOpen: boolean;
  onSidebarClose: (event: React.MouseEvent<HTMLElement>) => void;
  isSidebarOpen: boolean;
  onToggleDesktopSidebar?: () => void;
}

const MSidebar = ({
  isMobileSidebarOpen,
  onSidebarClose,
  isSidebarOpen,
  onToggleDesktopSidebar,
}: ItemType) => {
  const lgUp = useMediaQuery((theme: any) => theme.breakpoints.up('lg'));
  const sidebarWidth = 270;

  const scrollbarStyles = {
    '&::-webkit-scrollbar': { width: '7px' },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#eff2f7',
      borderRadius: '15px',
    },
  };

  if (lgUp) {
    return (
      <Box
        sx={{
          width: isSidebarOpen ? sidebarWidth : 0,
          flexShrink: 0,
          transition: 'width 0.2s ease',
        }}
      >
        <Drawer
          anchor="left"
          open={isSidebarOpen}
          variant="persistent"
          slotProps={{
            paper: {
              sx: {
                boxSizing: 'border-box',
                ...scrollbarStyles,
                width: sidebarWidth,
                borderRight: '1px solid',
                borderColor: 'divider',
              },
            },
          }}
        >
          <Box sx={{ position: 'relative', height: '100%' }}>
            {onToggleDesktopSidebar && (
              <IconButton
                size="small"
                aria-label="Cerrar menú"
                onClick={onToggleDesktopSidebar}
                sx={{ position: 'absolute', right: 8, top: 18, zIndex: 2 }}
              >
                <IconX size={18} />
              </IconButton>
            )}
            <SidebarItems />
          </Box>
        </Drawer>
      </Box>
    );
  }

  return (
    <Drawer
      anchor="left"
      open={isMobileSidebarOpen}
      onClose={onSidebarClose}
      variant="temporary"
      slotProps={{
        paper: {
          sx: {
            boxShadow: (theme) => theme.shadows[8],
            ...scrollbarStyles,
            width: sidebarWidth,
          },
        },
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <IconButton
          size="small"
          aria-label="Cerrar menú"
          onClick={onSidebarClose}
          sx={{ position: 'absolute', right: 8, top: 18, zIndex: 2 }}
        >
          <IconX size={18} />
        </IconButton>
        <SidebarItems />
      </Box>
    </Drawer>
  );
};

export default MSidebar;
