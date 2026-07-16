'use client';

import Link from 'next/link';
import { apiUrl, getBasePath } from '@/lib/paths';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import { AI_PROVIDERS } from '@/lib/ai/providers-client';
import MatchAnalysisDashboard from '@/components/analysis/MatchAnalysisDashboard';
import AnalysisProgressDialog from '@/components/analysis/AnalysisProgressDialog';
import type { AnalysisProgressEvent, StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { detectSport, isJunkMatch, type SportKind } from '@/lib/match-display';
import { localDateISO } from '@/lib/local-date';

type Accumulator = {
  id: string;
  name: string | null;
  totalOdds: string;
  isAnalyzed: boolean;
};

type Suggested = {
  id: string;
  sourceSlug: string;
  title: string;
  totalOdds: string;
};

type MatchOpt = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
};

type Analysis = {
  id: string;
  mode?: string;
  iaProvider: string;
  riskScore: string | null;
  evScore: string | null;
  recommendedStake: string | null;
  response: string;
  payload?: unknown;
  createdAt: string;
  accumulator: Accumulator | null;
  match?: MatchOpt | null;
};

type Mode = 'MATCH' | 'ACCUMULATOR' | 'RANDOM' | 'SUGGESTED';
type SubTab = 'current' | 'history';

function isMatchDashboardPayload(value: unknown): value is StructuredMatchPayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  const probs = p.probs as Record<string, unknown> | undefined;
  return (
    Array.isArray(p.markets) &&
    !!probs &&
    typeof probs.home === 'number' &&
    !!p.scoreline &&
    (p.mode === 'MATCH' || p.mode === 'RANDOM' || p.mode === 'ACCUMULATOR')
  );
}

function historyModeFor(mode: Mode): string[] {
  if (mode === 'MATCH') return ['MATCH'];
  if (mode === 'RANDOM') return ['RANDOM'];
  if (mode === 'ACCUMULATOR' || mode === 'SUGGESTED') return ['ACCUMULATOR'];
  return [];
}

/**
 * Análisis IA: cada modo tiene pestaña Actual + Historial.
 */
export default function AnalysesPage() {
  const [mode, setMode] = useState<Mode>('MATCH');
  const [subTab, setSubTab] = useState<SubTab>('current');
  const [accumulators, setAccumulators] = useState<Accumulator[]>([]);
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [matches, setMatches] = useState<MatchOpt[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [accumulatorId, setAccumulatorId] = useState('');
  const [suggestedId, setSuggestedId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [provider, setProvider] = useState('OPENAI');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<StructuredMatchPayload | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  /** Contexto del análisis abierto (para Reanalizar) */
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressEvents, setProgressEvents] = useState<AnalysisProgressEvent[]>([]);
  const [progressFailed, setProgressFailed] = useState(false);

  const pendingAccumulators = useMemo(
    () => accumulators.filter((a) => !a.isAnalyzed),
    [accumulators]
  );

  const analyzedMatchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of analyses) {
      if (a.match?.id && (a.mode === 'MATCH' || a.mode === 'RANDOM')) ids.add(a.match.id);
    }
    return ids;
  }, [analyses]);

  const availableMatches = useMemo(
    () => matches.filter((m) => !analyzedMatchIds.has(m.id)),
    [matches, analyzedMatchIds]
  );

  const modeHistory = useMemo(() => {
    const allowed = new Set(historyModeFor(mode));
    return analyses.filter((a) => allowed.has(a.mode ?? ''));
  }, [analyses, mode]);

  const progressSport = useMemo((): SportKind => {
    if (mode === 'MATCH' && matchId) {
      const m = matches.find((x) => x.id === matchId);
      if (m?.league) return detectSport(m.league);
    }
    if (activeAnalysis?.match?.league) return detectSport(activeAnalysis.match.league);
    if (payload?.match?.sport) return payload.match.sport as SportKind;
    if (payload?.match?.league) return detectSport(payload.match.league);
    return 'football';
  }, [mode, matchId, matches, activeAnalysis?.match?.league, payload?.match?.sport, payload?.match?.league]);

  const refresh = async () => {
    setLoading(true);
    const date = localDateISO();
    const [aRes, sRes, anRes, mRes] = await Promise.all([
      fetch(apiUrl('/api/accumulators')),
      fetch(apiUrl('/api/accumulators/suggested')),
      fetch(apiUrl('/api/analyses')),
      fetch(apiUrl(`/api/matches?date=${date}&limit=1000`)),
    ]);
    if (aRes.ok) {
      const data = await aRes.json();
      setAccumulators(data.accumulators ?? []);
    }
    if (sRes.ok) {
      const data = await sRes.json();
      setSuggested(data.items ?? []);
    }
    if (anRes.ok) {
      const data = await anRes.json();
      setAnalyses(data.analyses ?? []);
    }
    if (mRes.ok) {
      const data = await mRes.json();
      const rows = (data.matches ?? []) as MatchOpt[];
      setMatches(rows.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam)));
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const run = async (override?: {
    mode?: Mode;
    matchId?: string;
    accumulatorId?: string;
    force?: boolean;
  }) => {
    setError(null);
    setResultMsg(null);
    setSubTab('current');

    const activeMode = override?.mode ?? mode;
    const activeMatchId = override?.matchId ?? matchId;
    const activeAccId = override?.accumulatorId ?? accumulatorId;
    const force = Boolean(override?.force);

    if (activeMode === 'MATCH' && !activeMatchId) {
      setError('Selecciona un partido');
      return;
    }
    if (activeMode === 'ACCUMULATOR' && !activeAccId && !force) {
      setError('Selecciona una combinada pendiente de analizar');
      return;
    }
    if (activeMode === 'ACCUMULATOR' && !activeAccId) {
      setError('Combinada no disponible para reanalizar');
      return;
    }
    if (activeMode === 'SUGGESTED' && !suggestedId) {
      setError('Selecciona una combinada sugerida');
      return;
    }

    setRunning(true);
    setProgressEvents([
      {
        type: 'progress',
        step: 'boot',
        message: `Iniciando deep scan · proveedor ${provider}`,
        provider,
        pct: 5,
      },
    ]);
    setProgressFailed(false);
    setProgressOpen(true);
    if (override?.matchId) {
      setMode('MATCH');
      setMatchId(override.matchId);
    }

    // enrich=true → LLM profundo con failover. force=true → reanalizar combinada ya analizada.
    const body =
      activeMode === 'MATCH'
        ? { mode: 'MATCH', matchId: activeMatchId, provider, enrich: true }
        : activeMode === 'RANDOM'
          ? { mode: 'RANDOM', provider, enrich: true }
          : activeMode === 'SUGGESTED'
            ? { mode: 'ACCUMULATOR', suggestedId, provider, enrich: true, force }
            : {
                mode: 'ACCUMULATOR',
                accumulatorId: activeAccId,
                provider,
                enrich: true,
                force,
              };

    let failed = false;
    try {
      const res = await fetch(apiUrl('/api/analyses'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        failed = true;
        const errMsg =
          typeof data.error === 'string'
            ? data.error
            : `Análisis fallido (${res.status})`;
        setProgressEvents((prev) => [
          ...prev,
          { type: 'error', message: errMsg, provider, pct: 100 },
        ]);
        setProgressFailed(true);
        setError(
          errMsg.includes('45s') || /no respondió/i.test(errMsg)
            ? `${errMsg} — Si sigue fallando, prueba otro proveedor o deja que el failover llegue al modelo neuronal (redeploy con la rama actualizada).`
            : errMsg
        );
        return;
      }

      const serverProgress = Array.isArray(data.progressLog)
        ? (data.progressLog as AnalysisProgressEvent[])
        : [];
      const cascade = (data.payload as StructuredMatchPayload | undefined)?.aiCascade;
      const cascadeEvents: AnalysisProgressEvent[] =
        cascade?.attempts?.map((a) => ({
          type: 'progress' as const,
          step: 'ai',
          provider: a.provider,
          ok: a.status === 'ok',
          message:
            a.status === 'ok'
              ? `${a.provider} respondió`
              : a.status === 'fail'
                ? `${a.provider} falló: ${a.detail ?? ''}`
                : `${a.provider}: ${a.detail ?? a.status}`,
          pct: a.status === 'ok' ? 92 : undefined,
        })) ?? [];
      if (cascade?.neuralOnly) {
        cascadeEvents.push({
          type: 'progress',
          step: 'ai',
          message: 'Fallback → Red Neuronal',
          pct: 95,
        });
      }
      setProgressEvents([
        ...serverProgress,
        ...cascadeEvents,
        { type: 'done', message: 'Informe listo', pct: 100, payload: data.payload },
      ]);
      setProgressFailed(false);

      const candidate = data.payload ?? data.analysis?.payload;
      if (isMatchDashboardPayload(candidate)) {
        setPayload(candidate);
      } else {
        failed = true;
        setProgressFailed(true);
        setError('El análisis no devolvió un dashboard estructurado.');
        setPayload(null);
      }

      const a = data.analysis as Analysis | undefined;
      if (a) setActiveAnalysis(a);
      const engine =
        cascade?.neuralOnly
          ? 'Red Neuronal'
          : cascade?.used || a?.iaProvider || provider;
      setResultMsg(
        `${force || override?.matchId ? 'Reanálisis' : 'Análisis'}: Riesgo ${a?.riskScore} · EV ${a?.evScore} · Stake ${a?.recommendedStake} · ${engine}`
      );

      if (activeMode === 'ACCUMULATOR' && !force) setAccumulatorId('');
      if (activeMode === 'MATCH' && activeMatchId && !force) setMatchId('');

      await refresh();
    } catch (err) {
      failed = true;
      const msg = err instanceof Error ? err.message : 'Error de red al analizar';
      setProgressEvents((prev) => [...prev, { type: 'error', message: msg, pct: 100 }]);
      setProgressFailed(true);
      if (/abort|timeout/i.test(msg)) {
        setError(
          'El análisis tardó más de 180s y se canceló. Prueba otro proveedor o reintenta.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setRunning(false);
      // Éxito: cierra solo; error: el usuario cierra el popup
      if (!failed) {
        window.setTimeout(() => setProgressOpen(false), 1400);
      }
    }
  };

  const analyzeMatchById = (id: string) => {
    void run({ mode: 'MATCH', matchId: id });
  };

  const reanalyzeFromHistory = (a: Analysis) => {
    setActiveAnalysis(a);
    if (a.match?.id && (a.mode === 'MATCH' || a.mode === 'RANDOM')) {
      void run({ mode: 'MATCH', matchId: a.match.id, force: true });
      return;
    }
    if (a.accumulator?.id) {
      setMode('ACCUMULATOR');
      setAccumulatorId(a.accumulator.id);
      void run({ mode: 'ACCUMULATOR', accumulatorId: a.accumulator.id, force: true });
      return;
    }
    setError('Este análisis no tiene partido/combinada para reanalizar.');
  };

  const reanalyzeCurrent = () => {
    if (activeAnalysis) {
      reanalyzeFromHistory(activeAnalysis);
      return;
    }
    if (payload?.match?.id) {
      void run({ mode: 'MATCH', matchId: payload.match.id, force: true });
      return;
    }
    setError('No hay análisis activo para reanalizar.');
  };

  const openHistory = (a: Analysis) => {
    setError(null);
    setResultMsg(null);
    setActiveAnalysis(a);
    if (isMatchDashboardPayload(a.payload)) {
      setPayload(a.payload);
      setSubTab('current');
      return;
    }
    setError('Este análisis antiguo no tiene dashboard. Usa «Reanalizar».');
  };

  const analyzeLabel =
    mode === 'RANDOM'
      ? 'Analizar aleatorio'
      : mode === 'ACCUMULATOR'
        ? 'Analizar combinada'
        : mode === 'SUGGESTED'
          ? 'Analizar sugerida'
          : 'Analizar partido';

  return (
    <PageContainer title="Análisis IA" description="Partido, combinada y scanner de huecos">
      <Typography variant="h4" fontWeight={700} mb={2}>
        Análisis profundo con IA
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Scraping (tips/cuotas de +20 fuentes) + TheSportsDB (calendario/forma/H2H) + modelo. Si la IA
        elegida no responde, se prueba la siguiente key activa; si ninguna responde, análisis neuronal
        (solo modelo). Consulta{' '}
        <Link href={`${getBasePath()}/analyses/performance`}>Rendimiento / aciertos</Link> para el %
        de acierto vs partidos finalizados.
      </Typography>

      <AnalysisProgressDialog
        open={progressOpen}
        provider={provider}
        sportKind={progressSport}
        events={progressEvents}
        running={running}
        failed={progressFailed}
        onClose={() => {
          setProgressOpen(false);
          setProgressFailed(false);
        }}
      />

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_, v) => {
              if (!v) return;
              setMode(v);
              setSubTab('current');
              setError(null);
            }}
            sx={{ mb: 2, flexWrap: 'wrap' }}
          >
            <ToggleButton value="MATCH">Por partido</ToggleButton>
            <ToggleButton value="ACCUMULATOR">Mis combinadas</ToggleButton>
            <ToggleButton value="SUGGESTED">Sugeridas</ToggleButton>
            <ToggleButton value="RANDOM">Aleatorio / huecos</ToggleButton>
          </ToggleButtonGroup>

          <Tabs
            value={subTab}
            onChange={(_, v: SubTab) => setSubTab(v)}
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
          >
            <Tab value="current" label="Actual" />
            <Tab value="history" label={`Historial (${modeHistory.length})`} />
          </Tabs>

          {subTab === 'current' && (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
                {mode === 'MATCH' && (
                  <TextField
                    select
                    label="Partido pendiente"
                    size="small"
                    fullWidth
                    value={matchId}
                    onChange={(e) => setMatchId(e.target.value)}
                    helperText={
                      availableMatches.length === 0
                        ? 'Sin partidos nuevos (ya analizados o sin scrapers)'
                        : `${availableMatches.length} sin analizar · ${matches.length} totales`
                    }
                  >
                    {availableMatches.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.homeTeam} vs {m.awayTeam} ({m.league})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {mode === 'ACCUMULATOR' && (
                  <TextField
                    select
                    label="Combinada pendiente"
                    size="small"
                    fullWidth
                    value={accumulatorId}
                    onChange={(e) => setAccumulatorId(e.target.value)}
                    helperText={
                      pendingAccumulators.length === 0
                        ? 'No hay combinadas sin analizar — créalas en el Creador'
                        : `${pendingAccumulators.length} pendientes`
                    }
                  >
                    {pendingAccumulators.map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.name ?? a.id} (@{a.totalOdds})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {mode === 'SUGGESTED' && (
                  <TextField
                    select
                    label="Combinada sugerida"
                    size="small"
                    fullWidth
                    value={suggestedId}
                    onChange={(e) => setSuggestedId(e.target.value)}
                  >
                    {suggested.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        [{s.sourceSlug}] {s.title} (@{s.totalOdds})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {mode === 'RANDOM' && (
                  <Alert severity="info" sx={{ flex: 1 }}>
                    Elige un partido al azar entre los pendientes y propone combinadas con mercados
                    diversos (no solo +1.5). Cada clic analiza otro partido distinto.
                  </Alert>
                )}
                <TextField
                  select
                  label="Proveedor IA"
                  size="small"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  sx={{ minWidth: 200 }}
                >
                  {AI_PROVIDERS.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.label}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => run()}
                  disabled={running}
                  sx={{ minWidth: 200, whiteSpace: 'nowrap' }}
                >
                  {running ? <CircularProgress size={22} color="inherit" /> : analyzeLabel}
                </Button>
              </Stack>

              {error && <Alert severity="error">{error}</Alert>}
              {resultMsg && <Alert severity="success">{resultMsg}</Alert>}

              {payload && (
                <Box>
                  <MatchAnalysisDashboard
                    payload={payload}
                    onAnalyzeMatch={analyzeMatchById}
                    onReanalyze={reanalyzeCurrent}
                    reanalyzing={running}
                  />
                  {mode === 'RANDOM' && (
                    <Button
                      sx={{ mt: 2 }}
                      variant="outlined"
                      onClick={() => run({ mode: 'RANDOM' })}
                      disabled={running}
                    >
                      Analizar otro aleatorio
                    </Button>
                  )}
                </Box>
              )}

              {!payload && !running && (
                <Typography color="text.secondary">
                  Configura el filtro y pulsa «{analyzeLabel}» para ver el dashboard aquí.
                </Typography>
              )}
            </Stack>
          )}

          {subTab === 'history' && (
            <Stack spacing={2}>
              {loading ? (
                <Box textAlign="center" py={3}>
                  <CircularProgress />
                </Box>
              ) : modeHistory.length === 0 ? (
                <Typography color="text.secondary">
                  Aún no hay historial para este modo.
                </Typography>
              ) : (
                modeHistory.map((a) => {
                  const canDashboard = isMatchDashboardPayload(a.payload);
                  return (
                    <Card key={a.id} variant="outlined">
                      <CardContent>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          mb={1}
                          flexWrap="wrap"
                        >
                          <Chip size="small" label={a.mode ?? 'ACCUMULATOR'} />
                          <Typography fontWeight={600}>
                            {a.match
                              ? `${a.match.homeTeam} vs ${a.match.awayTeam}`
                              : a.accumulator?.name ?? 'Análisis'}
                          </Typography>
                          <Chip size="small" label={a.iaProvider} />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={new Date(a.createdAt).toLocaleString()}
                          />
                          <Button
                            size="small"
                            onClick={() => openHistory(a)}
                            disabled={!canDashboard}
                          >
                            Ver resultado
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => reanalyzeFromHistory(a)}
                            disabled={running || (!a.match?.id && !a.accumulator?.id)}
                          >
                            {running ? '…' : 'Reanalizar'}
                          </Button>
                        </Stack>
                        <Typography variant="body2" color="textSecondary">
                          Riesgo {a.riskScore} · EV {a.evScore} · Stake {a.recommendedStake}
                          {' · '}Al abrir verás marcador/stats (live o FT) + predicción guardada.
                        </Typography>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </Stack>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
