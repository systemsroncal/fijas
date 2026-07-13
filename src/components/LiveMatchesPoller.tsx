'use client';

import { apiUrl } from '@/lib/paths';

import { useEffect, useRef, useState } from 'react';
import { Chip } from '@mui/material';

/**
 * Polling cada 30s a /api/matches/latest con indicador visual.
 * Solo notifica al padre cuando hay predicciones nuevas (evita re-fetch en bucle).
 */
export default function LiveMatchesPoller({
  onUpdate,
}: {
  onUpdate?: () => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    let cancelled = false;
    let since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const tick = async () => {
      setUpdating(true);
      try {
        const res = await fetch(
          apiUrl(`/api/matches/latest?since=${encodeURIComponent(since)}`)
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setLastSync(data.serverTime);
        since = data.serverTime;
        if ((data.count ?? 0) > 0) {
          onUpdateRef.current?.();
        }
      } catch {
        // silencioso: reintento en el siguiente ciclo
      } finally {
        if (!cancelled) setUpdating(false);
      }
    };

    // Primer sync solo actualiza el chip; no fuerza reload de la tabla
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Chip
      size="small"
      color={updating ? 'warning' : 'success'}
      label={
        updating
          ? 'Actualizando...'
          : lastSync
            ? `Sync ${new Date(lastSync).toLocaleTimeString()}`
            : 'En vivo'
      }
      variant="outlined"
    />
  );
}
