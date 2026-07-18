'use client';

import { Box, Chip, Stack, Typography } from '@mui/material';
import type { AnalysisBrief } from '@/lib/ai/analysis-types';

export default function AnalysisSummarySection({
  brief,
  edgeSummary,
}: {
  brief?: AnalysisBrief;
  edgeSummary?: string | null;
}) {
  if (!brief && !edgeSummary) return null;

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2.5,
        bgcolor: 'grey.50',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1}>
        Por qué estos resultados
      </Typography>
      <Typography variant="h6" fontWeight={800} mt={0.5} mb={1.5}>
        {brief?.headline ?? 'Resumen del análisis'}
      </Typography>

      {edgeSummary && (
        <Typography variant="body2" color="text.secondary" lineHeight={1.7} mb={2}>
          {edgeSummary}
        </Typography>
      )}

      {brief?.bullets && brief.bullets.length > 0 && (
        <Stack spacing={0.75}>
          {brief.bullets.slice(0, 6).map((b, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  mt: 0.9,
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" color="text.secondary" lineHeight={1.65}>
                {b}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}

      {brief?.dataSources && brief.dataSources.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.75} mt={2}>
          {brief.dataSources.map((s) => (
            <Chip key={s} size="small" variant="outlined" label={s} />
          ))}
        </Stack>
      )}

      {brief?.limitations && brief.limitations.length > 0 && (
        <Typography variant="caption" color="text.secondary" display="block" mt={2} lineHeight={1.6}>
          {brief.limitations.slice(0, 3).join(' · ')}
        </Typography>
      )}
    </Box>
  );
}
