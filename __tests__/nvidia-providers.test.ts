import { buildNvidiaChatBody, NVIDIA_MODEL_PARAMS } from '@/lib/ai/providers';

const messages = [{ role: 'user' as const, content: 'test' }];

describe('buildNvidiaChatBody', () => {
  it('aplica parámetros de llama-3.1-8b-instruct', () => {
    const body = buildNvidiaChatBody('meta/llama-3.1-8b-instruct', messages);
    expect(body).toMatchObject({
      model: 'meta/llama-3.1-8b-instruct',
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 1024,
      stream: false,
    });
  });

  it('aplica thinking tokens para nemotron', () => {
    const body = buildNvidiaChatBody('nvidia/nvidia-nemotron-nano-9b-v2', messages);
    expect(body).toMatchObject({
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 2048,
      min_thinking_tokens: 1024,
      max_thinking_tokens: 2048,
    });
  });

  it('aplica seed en glm-5.2 fuera de cascada', () => {
    const body = buildNvidiaChatBody('z-ai/glm-5.2', messages);
    expect(body.seed).toBe(42);
    expect(body.max_tokens).toBe(16384);
  });

  it('en cascada omite seed y thinking y limita max_tokens', () => {
    const body = buildNvidiaChatBody('z-ai/glm-5.2', messages, { cascade: true });
    expect(body.seed).toBeUndefined();
    expect(body.max_tokens).toBe(2048);
    const nemotron = buildNvidiaChatBody('nvidia/nvidia-nemotron-nano-9b-v2', messages, {
      cascade: true,
    });
    expect(nemotron.min_thinking_tokens).toBeUndefined();
    expect(nemotron.max_thinking_tokens).toBeUndefined();
  });

  it('tiene config para modelos documentados en build.nvidia.com', () => {
    expect(NVIDIA_MODEL_PARAMS['moonshotai/kimi-k2.6']).toMatchObject({
      temperature: 1,
      top_p: 1,
      max_tokens: 16384,
      seed: 0,
    });
    expect(NVIDIA_MODEL_PARAMS['thinkingmachines/inkling']).toMatchObject({
      temperature: 1,
      top_p: 0.95,
      max_tokens: 8192,
    });
  });
});
