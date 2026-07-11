'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useState } from 'react';
import { Chip } from '@mui/material';

/**
 * Polling cada 30s a /api/matches/latest con indicador visual.
 */
export default function LiveMatchesPoller({
  onUpdate,
}: {
  onUpdate?: (data: unknown) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const tick = async () => {
      setUpdating(true);
      try {
        const res = await fetch(
          apiUrl(`/api/matches/latest?since=${encodeURIComponent(since)}`)
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setLastSync(data.serverTime);
            since = data.serverTime;
            onUpdate?.(data);
          }
        }
      } catch {
        // silencioso: reintento en el siguiente ciclo
      } finally {
        if (!cancelled) setUpdating(false);
      }
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [onUpdate]);

  return (
    <Chip
      size="small"
      color={updating ? 'warning' : 'success'}
      label={updating ? 'Actualizando...' : lastSync ? `Sync ${new Date(lastSync).toLocaleTimeString()}` : 'En vivo'}
      variant="outlined"
    />
  );
}
