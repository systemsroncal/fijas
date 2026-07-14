import Link from 'next/link';
import { Box, Typography } from '@mui/material';

const Logo = () => {
  return (
    <Box
      component={Link}
      href="/"
      sx={{
        height: 70,
        minWidth: 160,
        display: 'flex',
        alignItems: 'center',
        textDecoration: 'none',
        color: 'inherit',
        px: 1,
      }}
    >
      <Typography
        component="span"
        sx={{
          fontWeight: 800,
          fontSize: '1.35rem',
          letterSpacing: '0.04em',
          color: 'primary.main',
          lineHeight: 1.1,
        }}
      >
        LAS FIJAS
      </Typography>
    </Box>
  );
};

export default Logo;
