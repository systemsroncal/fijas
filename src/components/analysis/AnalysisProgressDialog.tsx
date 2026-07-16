'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Dialog, DialogContent, LinearProgress, Typography } from '@mui/material';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { ANALYSIS_EXTERNAL_SOURCES } from '@/lib/ai/external-sources';
import type { AnalysisProgressEvent } from '@/lib/ai/analysis-types';

type Line = {
  id: string;
  text: string;
  tone: 'cmd' | 'ok' | 'fail' | 'info' | 'ai' | 'matrix';
};

type Props = {
  open: boolean;
  provider: string;
  events: AnalysisProgressEvent[];
  /** true mientras el fetch sigue en curso */
  running: boolean;
};

function MatrixRain({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!active || reduce) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = (canvas.width = canvas.offsetWidth || 480);
    let h = (canvas.height = canvas.offsetHeight || 320);
    const cols = Math.floor(w / 14);
    const drops = Array.from({ length: cols }, () => Math.random() * h);
    const chars = '01アイウエオｶｷｸｹｺﾊﾞｲﾅﾘｰ<>_/$#@*';

    const draw = () => {
      ctx.fillStyle = 'rgba(4, 10, 8, 0.18)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = i % 7 === 0 ? '#7CFFB2' : '#1FAF6B';
        ctx.fillText(ch, i * 14, drops[i] * 14);
        if (drops[i] * 14 > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const onResize = () => {
      w = canvas.width = canvas.offsetWidth || 480;
      h = canvas.height = canvas.offsetHeight || 320;
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [active, reduce]);

  if (reduce) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0.35,
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * Popup tipo terminal / matrix mientras corre el análisis.
 */
export default function AnalysisProgressDialog({ open, provider, events, running }: Props) {
  const reduce = useReducedMotion();
  const [lines, setLines] = useState<Line[]>([]);
  const [sourceIdx, setSourceIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bootRef = useRef(false);

  const pct = useMemo(() => {
    const last = [...events].reverse().find((e) => typeof e.pct === 'number');
    if (last?.pct != null) return last.pct;
    if (!running && events.some((e) => e.type === 'done')) return 100;
    const base = Math.min(55, sourceIdx * 3.2);
    return Math.min(92, base + events.length * 4);
  }, [events, running, sourceIdx]);

  useEffect(() => {
    if (!open) {
      setLines([]);
      setSourceIdx(0);
      bootRef.current = false;
      return;
    }
    if (bootRef.current) return;
    bootRef.current = true;
    setLines([
      {
        id: 'boot',
        text: `$ wps-analyze --provider ${provider} --deep --live`,
        tone: 'cmd',
      },
      {
        id: 'boot2',
        text: '› Inicializando canal seguro… obteniendo información de fuentes externas',
        tone: 'info',
      },
    ]);
  }, [open, provider]);

  // Simula tipeo de fuentes mientras corre
  useEffect(() => {
    if (!open || !running) return;
    if (sourceIdx >= ANALYSIS_EXTERNAL_SOURCES.length) return;
    const src = ANALYSIS_EXTERNAL_SOURCES[sourceIdx];
    const t = window.setTimeout(() => {
      setLines((prev) => [
        ...prev,
        {
          id: `src-${src.id}-${sourceIdx}`,
          text: `$ ${src.cmd}`,
          tone: 'cmd',
        },
        {
          id: `src-ok-${src.id}-${sourceIdx}`,
          text: `✔ ${src.name} — datos en cola / cruzando…`,
          tone: 'ok',
        },
      ]);
      setSourceIdx((i) => i + 1);
    }, reduce ? 40 : 280 + Math.random() * 220);
    return () => window.clearTimeout(t);
  }, [open, running, sourceIdx, reduce]);

  // Eventos reales del servidor (IA failover, etc.)
  useEffect(() => {
    if (!open || events.length === 0) return;
    const e = events[events.length - 1];
    const tone: Line['tone'] =
      e.type === 'error' || e.ok === false
        ? 'fail'
        : e.provider || e.step === 'ai'
          ? 'ai'
          : e.ok === true
            ? 'ok'
            : 'info';
    setLines((prev) => {
      const id = `evt-${events.length}-${e.message.slice(0, 24)}`;
      if (prev.some((l) => l.id === id)) return prev;
      return [
        ...prev,
        {
          id,
          text:
            e.provider != null
              ? `◉ IA ${e.provider}: ${e.message}`
              : `◉ ${e.message}`,
          tone,
        },
      ];
    });
  }, [events, open]);

  useEffect(() => {
    if (!open || running) return;
    setLines((prev) => {
      if (prev.some((l) => l.id === 'done')) return prev;
      return [
        ...prev,
        {
          id: 'done',
          text: '✔ Pipeline completo — entregando informe (H2H + forma + modelo/IA)',
          tone: 'ok',
        },
      ];
    });
  }, [open, running]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }, [lines, reduce]);

  const colorFor = (tone: Line['tone']) => {
    switch (tone) {
      case 'cmd':
        return '#7CFFB2';
      case 'ok':
        return '#5EEAD4';
      case 'fail':
        return '#FB7185';
      case 'ai':
        return '#A5B4FC';
      case 'matrix':
        return '#22C55E';
      default:
        return '#94A3B8';
    }
  };

  return (
    <Dialog
      open={open}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#040A08',
          color: '#E2E8F0',
          border: '1px solid rgba(34,197,94,0.35)',
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: '0 0 40px rgba(16,185,129,0.18)',
        },
      }}
    >
      <DialogContent sx={{ p: 0, position: 'relative', minHeight: 380 }}>
        <MatrixRain active={open && running} />
        <Box sx={{ position: 'relative', zIndex: 1, p: 2.5 }}>
          <LazyMotion features={domAnimation}>
            <m.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Typography
                variant="overline"
                sx={{ letterSpacing: 2, color: '#34D399', fontFamily: 'ui-monospace, monospace' }}
              >
                WPS · DEEP SCAN
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1, fontFamily: 'ui-monospace, monospace' }}>
                {running ? 'Obteniendo información de fuentes externas…' : 'Análisis listo'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ color: '#94A3B8', display: 'block', mb: 1.5 }}>
                Preferida: {provider} → si no responde, siguiente IA disponible → neuronal (solo modelo)
              </Typography>
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{
                  mb: 2,
                  height: 6,
                  borderRadius: 1,
                  bgcolor: 'rgba(255,255,255,0.06)',
                  '& .MuiLinearProgress-bar': { bgcolor: '#22C55E' },
                }}
              />
              <Box
                sx={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 13,
                  lineHeight: 1.55,
                  maxHeight: 280,
                  overflow: 'auto',
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: 'rgba(0,0,0,0.45)',
                  border: '1px solid rgba(34,197,94,0.2)',
                }}
              >
                {lines.map((l) => (
                  <m.div
                    key={l.id}
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ color: colorFor(l.tone), whiteSpace: 'pre-wrap' }}
                  >
                    {l.text}
                  </m.div>
                ))}
                {running && (
                  <Box component="span" sx={{ color: '#7CFFB2', animation: 'blink 1s step-end infinite' }}>
                    ▌
                  </Box>
                )}
                <div ref={bottomRef} />
              </Box>
            </m.div>
          </LazyMotion>
        </Box>
        <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
      </DialogContent>
    </Dialog>
  );
}
