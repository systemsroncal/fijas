'use client';

import { Alert, Box, Typography } from '@mui/material';
import { IconAlertTriangle } from '@tabler/icons-react';
import { APP_BRAND_TITLE } from '@/lib/brand';

/**
 * Aviso legal / juego responsable — siempre al final del resultado de análisis.
 */
export default function AnalysisDisclaimer() {
  return (
    <Alert
      severity="warning"
      variant="outlined"
      icon={<IconAlertTriangle size={22} stroke={1.75} />}
      sx={{
        borderRadius: 2,
        alignItems: 'flex-start',
        '& .MuiAlert-message': { width: '100%' },
      }}
    >
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>
        Análisis probabilístico · juego responsable
      </Typography>
      <Typography variant="body2" color="text.secondary" lineHeight={1.65}>
        Las probabilidades, cuotas y picks que ves aquí son <strong>estimaciones</strong>, no
        predicciones certeza. El deporte tiene varianza: un modelo puede acertar la tendencia y
        fallar el resultado concreto. Las cuotas de las casas cambian en tiempo real.
      </Typography>
      <Typography variant="body2" color="text.secondary" lineHeight={1.65} mt={1}>
        Si decides apostar, hazlo solo con dinero que puedas permitirte perder, dentro de tus
        límites y bajo <strong>tu propio criterio</strong>. {APP_BRAND_TITLE} no sustituye tu
        juicio ni asume responsabilidad por pérdidas derivadas del uso de estas herramientas.
      </Typography>
    </Alert>
  );
}
