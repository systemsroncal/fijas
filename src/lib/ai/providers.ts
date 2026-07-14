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
      'Crea una API key de Google AI Studio',
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
      'Genera una API key de NVIDIA NIM',
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

type ProviderConfig = {
  url: string;
  model: string;
  buildHeaders: (apiKey: string) => Record<string, string>;
  buildBody: (messages: ChatMessage[]) => unknown;
  extractText: (json: unknown) => string;
};

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
    model: 'meta/llama-3.1-8b-instruct',
    buildBody: (messages) => ({
      model: 'meta/llama-3.1-8b-instruct',
      messages,
      temperature: 0.3,
    }),
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
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    model: 'gemini-2.0-flash',
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

/**
 * Llama al proveedor de IA con mensajes chat.
 */
export async function callProvider(
  provider: AiProvider,
  apiKey: string,
  messages: ChatMessage[]
): Promise<string> {
  const config = PROVIDER_CONFIG[provider];
  let url = config.url;
  if (provider === 'GEMINI') {
    url = `${config.url}?key=${encodeURIComponent(apiKey)}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: config.buildHeaders(apiKey),
    body: JSON.stringify(config.buildBody(messages)),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${provider} error ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  return config.extractText(json);
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
