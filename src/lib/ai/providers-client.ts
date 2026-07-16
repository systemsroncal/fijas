/** Metadatos de proveedores de IA seguros para el cliente (sin lógica de API). */
export const AI_PROVIDERS = [
  { id: 'OPENAI', label: 'OpenAI' },
  { id: 'GEMINI', label: 'Google Gemini' },
  { id: 'GROK', label: 'Grok (xAI)' },
  { id: 'DEEPSEEK', label: 'DeepSeek' },
  { id: 'OPENROUTER', label: 'OpenRouter' },
  { id: 'NVIDIA', label: 'NVIDIA' },
  { id: 'CLAUDE', label: 'Claude (Anthropic)' },
  { id: 'MISTRAL', label: 'Mistral' },
  { id: 'COHERE', label: 'Cohere' },
] as const;

/** Opción especial: solo modelo Poisson + datos (sin LLM externo). */
export const NEURAL_PROVIDER_ID = 'NEURAL' as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]['id'];
export type AnalysisProviderId = AiProviderId | typeof NEURAL_PROVIDER_ID;

/** Opciones del selector de análisis (IAs + red neuronal). */
export const ANALYSIS_PROVIDER_OPTIONS = [
  ...AI_PROVIDERS,
  { id: NEURAL_PROVIDER_ID, label: 'Red neuronal (sin IA externa)' },
] as const;

export const AI_HELP: Record<string, string[]> = {
  OPENAI: [
    'Ve a https://platform.openai.com/api-keys',
    'Crea una nueva API key',
    'Copia la clave (sk-...) y pégala aquí',
  ],
  GEMINI: [
    'Ve a https://aistudio.google.com/apikey',
    'Crea una API key (nivel gratuito: pocos RPM/RPD)',
    'Si ves 429: espera 1–2 min, cambia de proveedor, o activa facturación en AI Studio',
    'Copia y guarda la clave',
  ],
  GROK: [
    'Ve a https://console.x.ai/',
    'Crea una API key en la consola de xAI',
    'Copia la clave y guárdala',
  ],
  DEEPSEEK: [
    'Ve a https://platform.deepseek.com/api_keys',
    'Genera una nueva clave',
    'Copia y pega la clave aquí',
  ],
  OPENROUTER: [
    'Ve a https://openrouter.ai/keys',
    'Crea una clave de API',
    'Copia la clave (sk-or-...)',
  ],
  NVIDIA: [
    'Ve a https://build.nvidia.com/',
    'Genera una API key de NVIDIA NIM (Free Endpoint)',
    'Cada modelo NIM usa sus parámetros (temp, top_p, max_tokens) según build.nvidia.com',
    'Cascada: deepseek-v4-flash → llama-3.1-8b → gemma → glm/kimi → nemotron…',
    'Copia y guarda la clave',
  ],
  CLAUDE: [
    'Ve a https://console.anthropic.com/settings/keys',
    'Crea una API key',
    'Copia la clave (sk-ant-...)',
  ],
  MISTRAL: [
    'Ve a https://console.mistral.ai/api-keys/',
    'Crea una nueva clave',
    'Copia y pega aquí',
  ],
  COHERE: [
    'Ve a https://dashboard.cohere.com/api-keys',
    'Crea o copia tu key',
    'Pégala en el campo correspondiente',
  ],
};
