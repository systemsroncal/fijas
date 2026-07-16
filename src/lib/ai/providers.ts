import { AiProvider } from '@prisma/client';

export const AI_PROVIDERS: {
  id: AiProvider;
  label: string;
  helpSteps: string[];
}[] = [
  {
    id: 'OPENAI',
    label: 'OpenAI',
    helpSteps: [
      'Ve a https://platform.openai.com/api-keys',
      'Inicia sesión y crea una nueva API key',
      'Copia la clave (sk-...) y pégala aquí',
    ],
  },
  {
    id: 'GEMINI',
    label: 'Google Gemini',
    helpSteps: [
      'Ve a https://aistudio.google.com/apikey',
      'Crea una API key de Google AI Studio (nivel gratuito tiene pocos RPM/RPD)',
      'Si ves error 429: espera 1–2 min, cambia de proveedor, o activa facturación en AI Studio',
      'Copia y guarda la clave',
    ],
  },
  {
    id: 'GROK',
    label: 'Grok (xAI)',
    helpSteps: [
      'Ve a https://console.x.ai/',
      'Crea una API key en la consola de xAI',
      'Copia la clave y guárdala',
    ],
  },
  {
    id: 'DEEPSEEK',
    label: 'DeepSeek',
    helpSteps: [
      'Ve a https://platform.deepseek.com/api_keys',
      'Genera una nueva clave',
      'Copia y pega la clave aquí',
    ],
  },
  {
    id: 'OPENROUTER',
    label: 'OpenRouter',
    helpSteps: [
      'Ve a https://openrouter.ai/keys',
      'Crea una clave de API',
      'Copia la clave (sk-or-...)',
    ],
  },
  {
    id: 'NVIDIA',
    label: 'NVIDIA',
    helpSteps: [
      'Ve a https://build.nvidia.com/',
      'Genera una API key de NVIDIA NIM (Free Endpoint)',
      'Base URL: integrate.api.nvidia.com/v1 — cada modelo usa temp/top_p/max_tokens de build.nvidia.com',
      'Cascada: deepseek-v4-flash → llama-3.1-8b → gemma → glm/kimi → nemotron…',
      'Copia y guarda la clave',
    ],
  },
  {
    id: 'CLAUDE',
    label: 'Claude (Anthropic)',
    helpSteps: [
      'Ve a https://console.anthropic.com/settings/keys',
      'Crea una API key',
      'Copia la clave (sk-ant-...)',
    ],
  },
  {
    id: 'MISTRAL',
    label: 'Mistral',
    helpSteps: [
      'Ve a https://console.mistral.ai/api-keys/',
      'Crea una nueva clave',
      'Copia y pega aquí',
    ],
  },
  {
    id: 'COHERE',
    label: 'Cohere',
    helpSteps: [
      'Ve a https://dashboard.cohere.com/api-keys',
      'Crea o copia tu Trial/Production key',
      'Pégala en el campo correspondiente',
    ],
  },
];

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type CallProviderOptions = {
  /** Modo cascada de análisis: fallar rápido para pasar a la siguiente IA */
  cascade?: boolean;
  /** Timeout HTTP por llamada (ms) */
  timeoutMs?: number;
};

type ProviderConfig = {
  url: string;
  model: string;
  buildHeaders: (apiKey: string) => Record<string, string>;
  buildBody: (messages: ChatMessage[]) => unknown;
  extractText: (json: unknown) => string;
};

/**
 * Cascada NVIDIA NIM Free Endpoint (misma API key).
 * Parámetros por modelo según build.nvidia.com (OpenAI-compatible).
 * Docs: https://build.nvidia.com / https://docs.api.nvidia.com/nim/reference/llm-apis
 */
export type NvidiaModelParams = {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  /** Nemotron y similares: min/max thinking tokens en el body JSON */
  thinkingTokens?: { min: number; max: number };
};

const NVIDIA_DEFAULT_PARAMS: NvidiaModelParams = {
  temperature: 0.3,
  top_p: 0.9,
  max_tokens: 2048,
};

/** Parámetros recomendados por modelo (build.nvidia.com). */
export const NVIDIA_MODEL_PARAMS: Record<string, NvidiaModelParams> = {
  'deepseek-ai/deepseek-v4-flash': { temperature: 0.3, top_p: 0.9, max_tokens: 4096 },
  'deepseek-ai/deepseek-v4-pro': { temperature: 0.4, top_p: 0.9, max_tokens: 4096 },
  'meta/llama-3.1-8b-instruct': { temperature: 0.2, top_p: 0.7, max_tokens: 1024 },
  'meta/llama-3.1-70b-instruct': { temperature: 0.2, top_p: 0.7, max_tokens: 2048 },
  'meta/llama-3.2-3b-instruct': { temperature: 0.2, top_p: 0.7, max_tokens: 1024 },
  'meta/llama-3.3-70b-instruct': { temperature: 0.2, top_p: 0.7, max_tokens: 2048 },
  'z-ai/glm-5.2': { temperature: 1, top_p: 1, max_tokens: 16384, seed: 42 },
  'moonshotai/kimi-k2.6': { temperature: 1, top_p: 1, max_tokens: 16384, seed: 0 },
  'thinkingmachines/inkling': { temperature: 1, top_p: 0.95, max_tokens: 8192 },
  'nvidia/nvidia-nemotron-nano-9b-v2': {
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 2048,
    frequency_penalty: 0,
    presence_penalty: 0,
    thinkingTokens: { min: 1024, max: 2048 },
  },
  'nvidia/llama-3.1-nemotron-nano-8b-v1': {
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 2048,
    frequency_penalty: 0,
    presence_penalty: 0,
    thinkingTokens: { min: 512, max: 1024 },
  },
  'google/gemma-4-31b-it': { temperature: 0.4, top_p: 0.9, max_tokens: 4096 },
  'google/gemma-3-27b-it': { temperature: 0.4, top_p: 0.9, max_tokens: 4096 },
  'google/gemma-2-27b-it': { temperature: 0.4, top_p: 0.9, max_tokens: 4096 },
  'google/gemma-2-9b-it': { temperature: 0.3, top_p: 0.9, max_tokens: 2048 },
  'google/gemma-2-2b-it': { temperature: 0.3, top_p: 0.9, max_tokens: 1024 },
  'mistralai/mistral-small-3.1-24b-instruct-2503': {
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 4096,
  },
  'mistralai/mistral-medium-3.1-24b-instruct-2503': {
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 4096,
  },
  'microsoft/phi-4-mini-instruct': { temperature: 0.2, top_p: 0.8, max_tokens: 2048 },
};

const NVIDIA_MODEL_FALLBACKS = [
  'deepseek-ai/deepseek-v4-flash',
  'meta/llama-3.1-8b-instruct',
  'google/gemma-2-9b-it',
  'z-ai/glm-5.2',
  'moonshotai/kimi-k2.6',
  'google/gemma-4-31b-it',
  'google/gemma-3-27b-it',
  'google/gemma-2-9b-it',
  'nvidia/nvidia-nemotron-nano-9b-v2',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'mistralai/mistral-small-3.1-24b-instruct-2503',
  'mistralai/mistral-medium-3.1-24b-instruct-2503',
  'thinkingmachines/inkling',
  'microsoft/phi-4-mini-instruct',
  'deepseek-ai/deepseek-v4-pro',
  'google/gemma-2-27b-it',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.2-3b-instruct',
  'google/gemma-2-2b-it',
] as const;

/** Modelos rápidos para cascada / failover (sin thinking largo). */
const NVIDIA_CASCADE_MODELS = [
  'deepseek-ai/deepseek-v4-flash',
  'meta/llama-3.1-8b-instruct',
  'google/gemma-2-9b-it',
] as const;

export function buildNvidiaChatBody(
  model: string,
  messages: ChatMessage[],
  opts?: { cascade?: boolean }
): Record<string, unknown> {
  const cascade = opts?.cascade ?? false;
  const cfg = NVIDIA_MODEL_PARAMS[model] ?? NVIDIA_DEFAULT_PARAMS;
  const maxTokens = cascade
    ? Math.min(cfg.max_tokens ?? NVIDIA_DEFAULT_PARAMS.max_tokens!, 2048)
    : (cfg.max_tokens ?? NVIDIA_DEFAULT_PARAMS.max_tokens);

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    temperature: cfg.temperature ?? NVIDIA_DEFAULT_PARAMS.temperature,
    max_tokens: maxTokens,
  };

  if (cfg.top_p != null) body.top_p = cfg.top_p;
  if (cfg.frequency_penalty != null) body.frequency_penalty = cfg.frequency_penalty;
  if (cfg.presence_penalty != null) body.presence_penalty = cfg.presence_penalty;
  if (cfg.seed != null && !cascade) body.seed = cfg.seed;

  if (!cascade && cfg.thinkingTokens) {
    body.min_thinking_tokens = cfg.thinkingTokens.min;
    body.max_thinking_tokens = cfg.thinkingTokens.max;
  }

  return body;
}

function extractNvidiaText(json: unknown): string {
  const data = json as {
    choices?: {
      message?: { content?: string | null; reasoning_content?: string | null };
    }[];
  };
  const msg = data.choices?.[0]?.message;
  const content = msg?.content?.trim();
  if (content) return content;
  const reasoning = msg?.reasoning_content?.trim();
  return reasoning ?? '';
}

const OPENAI_COMPAT: Omit<ProviderConfig, 'url' | 'model'> = {
  buildHeaders: (apiKey) => ({
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }),
  buildBody: (messages) => ({
    messages,
    temperature: 0.3,
  }),
  extractText: (json) => {
    const data = json as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  },
};

const PROVIDER_CONFIG: Record<AiProvider, ProviderConfig> = {
  OPENAI: {
    ...OPENAI_COMPAT,
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    buildBody: (messages) => ({ model: 'gpt-4o-mini', messages, temperature: 0.3 }),
  },
  GROK: {
    ...OPENAI_COMPAT,
    url: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-2-latest',
    buildBody: (messages) => ({ model: 'grok-2-latest', messages, temperature: 0.3 }),
  },
  DEEPSEEK: {
    ...OPENAI_COMPAT,
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    buildBody: (messages) => ({ model: 'deepseek-chat', messages, temperature: 0.3 }),
  },
  OPENROUTER: {
    ...OPENAI_COMPAT,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openrouter/auto',
    buildBody: (messages) => ({ model: 'openrouter/auto', messages, temperature: 0.3 }),
  },
  NVIDIA: {
    ...OPENAI_COMPAT,
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: NVIDIA_CASCADE_MODELS[0],
    buildBody: (messages) =>
      buildNvidiaChatBody(NVIDIA_CASCADE_MODELS[0], messages, { cascade: false }),
    extractText: extractNvidiaText,
  },
  MISTRAL: {
    ...OPENAI_COMPAT,
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    buildBody: (messages) => ({
      model: 'mistral-small-latest',
      messages,
      temperature: 0.3,
    }),
  },
  GEMINI: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    model: 'gemini-2.5-flash',
    buildHeaders: () => ({ 'Content-Type': 'application/json' }),
    buildBody: (messages) => ({
      contents: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      systemInstruction: {
        parts: [{ text: messages.find((m) => m.role === 'system')?.content ?? '' }],
      },
    }),
    extractText: (json) => {
      const data = json as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    },
  },
  CLAUDE: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-haiku-latest',
    buildHeaders: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }),
    buildBody: (messages) => ({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1024,
      system: messages.find((m) => m.role === 'system')?.content,
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
    }),
    extractText: (json) => {
      const data = json as { content?: { text?: string }[] };
      return data.content?.[0]?.text ?? '';
    },
  },
  COHERE: {
    url: 'https://api.cohere.com/v2/chat',
    model: 'command-r-plus',
    buildHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
    buildBody: (messages) => ({
      model: 'command-r-plus',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    extractText: (json) => {
      const data = json as { message?: { content?: { text?: string }[] } };
      return data.message?.content?.[0]?.text ?? '';
    },
  },
};

function isNvidiaRetryableError(status: number, body: string, message: string): boolean {
  if (isNvidiaDegradedError(status, body)) return true;
  if (status === 404 || status === 408 || status === 429 || status === 502 || status === 503) {
    return true;
  }
  if (/model.*(not found|does not exist|unavailable)|DEGRADED|timeout|abort|no respondió|Too Many|rate.?limit/i.test(
    `${body} ${message}`
  )) {
    return true;
  }
  return false;
}

/** Modelos Gemini con cuota a veces separada (mismo API key). */
const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
] as const;

function isNvidiaDegradedError(status: number, body: string): boolean {
  return status === 400 && /DEGRADED function cannot be invoked/i.test(body);
}

function isQuotaError(status: number, body: string): boolean {
  return (
    status === 429 ||
    /RESOURCE_EXHAUSTED|exceeded your current quota|TooManyRequests|rate.?limit/i.test(
      body
    )
  );
}

function geminiQuotaMessage(): string {
  return (
    'GEMINI: cuota gratuita agotada (429). Espera 1–2 minutos e inténtalo de nuevo, ' +
    'usa otro proveedor (p. ej. NVIDIA), o activa facturación en Google AI Studio → Facturación.'
  );
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function geminiGenerateUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/**
 * Prueba la conexión con un proveedor de IA.
 */
export async function testProviderConnection(
  provider: AiProvider,
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const text = await callProvider(provider, apiKey, [
      { role: 'user', content: 'Reply with OK only.' },
    ]);
    return { ok: true, message: text.slice(0, 120) || 'Connection OK' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

async function callOpenAiCompatOnce(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: AiProvider,
  extractText: (json: unknown) => string,
  timeoutMs = 35_000
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) {
      throw new Error(
        `${provider} no respondió en ${Math.round(timeoutMs / 1000)}s. Revisa la key, el modelo o inténtalo de nuevo.`
      );
    }
    throw err;
  }

  if (!res.ok) {
    const errBody = await res.text();
    const error = new Error(
      `${provider} error ${res.status}: ${errBody.slice(0, 200)}`
    ) as Error & { status?: number; body?: string };
    error.status = res.status;
    error.body = errBody;
    throw error;
  }

  const json = await res.json();
  const text = extractText(json);
  if (!text?.trim()) {
    throw new Error(`${provider} devolvió respuesta vacía. Revisa modelo/cuota de la API.`);
  }
  return text;
}

/**
 * Llama al proveedor de IA con mensajes chat.
 * NVIDIA: fallback si DEGRADED. Gemini: reintento corto + otros modelos si 429.
 */
export async function callProvider(
  provider: AiProvider,
  apiKey: string,
  messages: ChatMessage[],
  opts?: CallProviderOptions
): Promise<string> {
  const cascade = opts?.cascade ?? false;
  const timeoutMs = opts?.timeoutMs ?? (cascade ? 18_000 : 35_000);
  const config = PROVIDER_CONFIG[provider];

  if (provider === 'NVIDIA') {
    let lastErr: Error | null = null;
    const models = cascade ? NVIDIA_CASCADE_MODELS : NVIDIA_MODEL_FALLBACKS;
    for (const model of models) {
      try {
        return await callOpenAiCompatOnce(
          config.url,
          config.buildHeaders(apiKey),
          buildNvidiaChatBody(model, messages, { cascade }),
          provider,
          config.extractText,
          timeoutMs
        );
      } catch (err) {
        const e = err as Error & { status?: number; body?: string };
        lastErr = e;
        const status = e.status ?? 0;
        const body = e.body ?? '';
        if (isNvidiaRetryableError(status, body, e.message)) {
          console.warn(`[NVIDIA] ${model} falló → siguiente:`, e.message.slice(0, 120));
          continue;
        }
        throw e;
      }
    }
    throw new Error(
      lastErr?.message ??
        'NVIDIA: todos los Free Endpoints NIM fallaron. Prueba OpenRouter/Gemini u otro proveedor, o reintenta más tarde.'
    );
  }

  if (provider === 'GEMINI') {
    const body = config.buildBody(messages);
    let sawQuota = false;
    let lastErr: Error | null = null;
    const models = cascade
      ? GEMINI_MODEL_FALLBACKS.slice(0, 1)
      : GEMINI_MODEL_FALLBACKS;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const url = geminiGenerateUrl(model, apiKey);
      try {
        return await callOpenAiCompatOnce(
          url,
          config.buildHeaders(apiKey),
          body,
          provider,
          config.extractText,
          timeoutMs
        );
      } catch (err) {
        const e = err as Error & { status?: number; body?: string };
        lastErr = e;
        const status = e.status ?? 0;
        const errBody = e.body ?? e.message;

        if (isQuotaError(status, errBody)) {
          sawQuota = true;
          if (!cascade && i === 0) {
            await wait(8_000);
            try {
              return await callOpenAiCompatOnce(
                url,
                config.buildHeaders(apiKey),
                body,
                provider,
                config.extractText,
                timeoutMs
              );
            } catch (retryErr) {
              lastErr = retryErr as Error & { status?: number; body?: string };
            }
          }
          continue;
        }

        if (
          status === 404 ||
          /not found|NOT_FOUND|is not found for API version/i.test(errBody)
        ) {
          continue;
        }
        throw e;
      }
    }

    if (sawQuota) throw new Error(geminiQuotaMessage());
    throw lastErr ?? new Error(geminiQuotaMessage());
  }

  return callOpenAiCompatOnce(
    config.url,
    config.buildHeaders(apiKey),
    config.buildBody(messages),
    provider,
    config.extractText,
    timeoutMs
  );
}

export type AnalysisResult = {
  riskScore: number;
  evScore: number;
  recommendedStake: number;
  rawResponse: string;
  providerUsed: AiProvider;
  promptUsed: string;
};

/**
 * Analiza una acumulada SOLO con el proveedor elegido (sin fallback a otra IA).
 */
export async function analyzeAccumulatorWithFallback(
  preferred: AiProvider,
  keysByProvider: Partial<Record<AiProvider, string>>,
  accumulatorSummary: string
): Promise<AnalysisResult> {
  const key = keysByProvider[preferred];
  if (!key) {
    throw new Error(
      `No hay API key activa para ${preferred}. Configúrala en Ajustes → API keys.`
    );
  }

  const prompt = `Eres un analista profesional de apuestas. Debes TOMARTE EL TIEMPO y analizar EN PROFUNDIDAD la acumulada.

Obligatorio:
1) Evalúa correlación entre piernas, riesgo de same-game, cuotas scrapeadas y huecos del modelo.
2) No inventes partidos, mercados ni estadísticas ausentes.
3) Si hay contexto TheSportsDB / forma, úsalo; si falta, dilo y apoya en scraping+modelo.
4) Responde SOLO JSON válido:
{"risk_score": <1-10>, "ev_score": <número>, "recommended_stake": <1-10>, "rationale": "<análisis profundo en español, 4-8 frases>"}

Datos de la acumulada:
${accumulatorSummary}`;

  const raw = await callProvider(preferred, key, [
    {
      role: 'system',
      content:
        'Analista senior. Piensa con calma y profundidad. Responde únicamente JSON válido sin markdown. Español claro. Cero invención.',
    },
    { role: 'user', content: prompt },
  ]);
  const parsed = parseAnalysisJson(raw);
  return {
    ...parsed,
    rawResponse: raw,
    providerUsed: preferred,
    promptUsed: prompt,
  };
}

function parseAnalysisJson(raw: string): {
  riskScore: number;
  evScore: number;
  recommendedStake: number;
} {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No se pudo parsear JSON de la IA');
  }
  const data = JSON.parse(match[0]) as {
    risk_score?: number;
    ev_score?: number;
    recommended_stake?: number;
  };
  return {
    riskScore: Number(data.risk_score ?? 5),
    evScore: Number(data.ev_score ?? 0),
    recommendedStake: Number(data.recommended_stake ?? 1),
  };
}
