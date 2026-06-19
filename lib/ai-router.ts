/**
 * Multi-provider AI router — v4, with Gemini now supported.
 *
 * Providers (in priority order):
 *   Gemini   → DeepSeek → Mistral → OpenRouter → Kimi → Ollama
 *
 * Gemini uses the Google AI API (generativelanguage.googleapis.com).
 * Set GEMINI_API_KEY in .env.local — works globally, generous free tier.
 *
 * Circuit breaker: providers that fail with hard errors (403/401/quota exhausted)
 * get auto-disabled for the session, so we don't waste time retrying them.
 */

export type AIProviderName =
  | 'gemini' | 'deepseek' | 'mistral' | 'openrouter' | 'kimi' | 'ollama';

export interface AICompletionParams {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface AICompletionResult {
  content: string;
  provider: AIProviderName;
}

interface ProviderRuntime {
  name: AIProviderName;
  priority: number;
  rpm: number;
  call: (params: AICompletionParams) => Promise<AICompletionResult>;
}

// In-memory rate tracking
const requestTimestamps = new Map<AIProviderName, number[]>();
function recordRequest(name: AIProviderName): void {
  const now = Date.now();
  const arr = (requestTimestamps.get(name) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  requestTimestamps.set(name, arr);
}
function isRateLimited(name: AIProviderName, rpm: number): boolean {
  const arr = requestTimestamps.get(name) ?? [];
  return arr.length >= rpm;
}

// Circuit breaker
const disabledProviders = new Set<AIProviderName>();

// --- Provider factories ----------------------------------------------------

/**
 * Gemini provider using the Google AI API.
 * Uses gemini-2.0-flash-lite as default (fast, cheap, generous free tier).
 */
function makeGemini(
  priority: number,
  apiKey: string,
  model: string,
): ProviderRuntime {
  return {
    name: 'gemini',
    priority,
    rpm: 60,
    async call(params) {
      const contents: { role: string; parts: { text: string }[] }[] = [];
      if (params.systemPrompt) {
        contents.push({ role: 'user', parts: [{ text: params.systemPrompt + '\n\n' + params.prompt }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: params.prompt }] });
      }

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: params.temperature ?? 0.1,
          maxOutputTokens: params.maxTokens ?? 4000,
          ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini API ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        promptFeedback?: { blockReason?: string };
      };

      if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { content: text, provider: 'gemini' };
    },
  };
}

/**
 * Generic factory for OpenAI-compatible APIs.
 */
function makeOpenAICompatible(
  name: AIProviderName,
  priority: number,
  apiKey: string,
  model: string,
  baseUrl: string,
  rpm: number,
  extraHeaders: Record<string, string> = {},
): ProviderRuntime {
  return {
    name,
    priority,
    rpm,
    async call(params) {
      const body = {
        model,
        messages: [
          ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
          { role: 'user', content: params.prompt },
        ],
        temperature: params.temperature ?? 0.1,
        max_tokens: params.maxTokens ?? 4000,
        ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      };
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${name} API ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return {
        content: data.choices?.[0]?.message?.content ?? '',
        provider: name,
      };
    },
  };
}

function makeOllama(priority: number, model: string, ollamaUrl: string): ProviderRuntime {
  return {
    name: 'ollama', priority, rpm: 9999,
    async call(params) {
      // Speed optimization: use tiny context for job extraction
      const body = {
        model,
        messages: [
          ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
          { role: 'user', content: params.prompt },
        ],
        stream: false,
        options: {
          temperature: params.temperature ?? 0.1,
          num_predict: Math.min(params.maxTokens ?? 1500, 1500), // Cap at 1500 for speed
          num_ctx: 4096, // Small context = fast processing
        },
        ...(params.jsonMode ? { format: 'json' } : {}),
      };
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama API ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        message?: { content?: string }; error?: string;
      };
      if (data.error) throw new Error(`Ollama: ${data.error}`);
      return { content: data.message?.content ?? '', provider: 'ollama' };
    },
  };
}

// --- Provider registration from env --------------------------------------

let providersCache: ProviderRuntime[] | null = null;

function loadProviders(): ProviderRuntime[] {
  if (providersCache) return providersCache;
  const providers: ProviderRuntime[] = [];
  let priority = 0;
  const env = process.env;

  // ===== GEMINI (primary — generous free tier, works globally) =====
  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || 'gemini-2.0-flash-lite-001';
    console.log(`[ai-router] gemini: key loaded (model: ${model})`);
    providers.push(makeGemini(priority++, env.GEMINI_API_KEY, model));
  }

  // ===== DEEPSEEK =====
  if (env.DEEPSEEK_API_KEY) {
    console.log(`[ai-router] deepseek: key loaded (model: ${env.DEEPSEEK_MODEL || 'deepseek-chat'})`);
    providers.push(
      makeOpenAICompatible(
        'deepseek', priority++, env.DEEPSEEK_API_KEY,
        env.DEEPSEEK_MODEL || 'deepseek-chat',
        'https://api.deepseek.com/v1', 60,
      ),
    );
  }

  // ===== MISTRAL =====
  if (env.MISTRAL_API_KEY) {
    console.log(`[ai-router] mistral: key loaded`);
    providers.push(
      makeOpenAICompatible(
        'mistral', priority++, env.MISTRAL_API_KEY,
        env.MISTRAL_MODEL || 'mistral-small-latest',
        'https://api.mistral.ai/v1', 50,
      ),
    );
  }

  // ===== OPENROUTER =====
  if (env.OPENROUTER_API_KEY) {
    providers.push(
      makeOpenAICompatible(
        'openrouter', priority++, env.OPENROUTER_API_KEY,
        env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-30b-a3b:free',
        'https://openrouter.ai/api/v1', 20,
        { 'HTTP-Referer': 'https://tja.local', 'X-Title': 'Telegram Job Aggregator' },
      ),
    );
  }

  // ===== KIMI =====
  if (env.KIMI_API_KEY) {
    providers.push(
      makeOpenAICompatible(
        'kimi', priority++, env.KIMI_API_KEY,
        env.KIMI_MODEL || 'moonshot-v1-8k',
        'https://api.moonshot.cn/v1', 10,
      ),
    );
  }

  // ===== OLLAMA =====
  if (env.OLLAMA_URL || env.OLLAMA_MODEL) {
    providers.push(makeOllama(priority++, env.OLLAMA_MODEL || 'phi4:latest', env.OLLAMA_URL || 'http://localhost:11434'));
  }

  if (providers.length === 0) {
    console.warn('[ai-router] ⚠️  No AI providers configured!');
    console.warn('[ai-router]    Set GEMINI_API_KEY in .env.local for AI-powered extraction.');
    console.warn('[ai-router]    (Alternatively: DEEPSEEK_API_KEY, MISTRAL_API_KEY, etc.)');
  } else {
    console.log(`[ai-router] ${providers.length} provider(s) loaded: ${providers.map((p) => p.name).join(', ')}`);
  }

  providersCache = providers;
  return providers;
}

export async function complete(params: AICompletionParams): Promise<AICompletionResult> {
  const providers = loadProviders();
  if (providers.length === 0) {
    throw new Error(
      'No AI providers configured. Set GEMINI_API_KEY in .env.local for AI-powered extraction.',
    );
  }

  const errors: { provider: AIProviderName; error: string }[] = [];
  for (const p of providers) {
    if (disabledProviders.has(p.name)) continue;
    if (isRateLimited(p.name, p.rpm)) {
      console.warn(`[ai-router] ${p.name} rate limited, skipping`);
      continue;
    }
    try {
      recordRequest(p.name);
      const result = await p.call(params);
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      errors.push({ provider: p.name, error: msg });
      console.error(`[ai-router] ${p.name} failed:`, msg);

      // Circuit breaker
      const isHardError =
        msg.includes(' 429:') ||
    msg.includes(' 403:') ||
        msg.includes(' 401:') ||
        msg.includes('Forbidden') ||
        msg.includes('Unauthorized') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('API key not valid') ||
        msg.includes('limit: 0') ||
        /all \d+ keys have exhausted/.test(msg) ||
        msg.includes('free-models-per-day') ||
        msg.includes('API_KEY_EXPIRED') ||
        msg.includes('not found for API');

      if (isHardError) {
        console.warn(`[ai-router] ${p.name} disabled for this session (circuit breaker)`);
        disabledProviders.add(p.name);
      }
    }
  }

  const activeProviders = providers.filter((p) => !disabledProviders.has(p.name));
  if (activeProviders.length === 0) {
    throw new Error(
      `All AI providers failed and disabled. Errors: ${JSON.stringify(errors)}. ` +
        `Restart the dev server to reset the circuit breaker.`,
    );
  }
  throw new Error(`All AI providers failed: ${JSON.stringify(errors)}`);
}

export async function completeJson<T = unknown>(params: AICompletionParams): Promise<T> {
  const result = await complete({ ...params, jsonMode: true });
  return parseJsonLoose<T>(result.content);
}

export function parseJsonLoose<T = unknown>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const firstBrace = text.search(/[{\[]/);
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text) as T;
}

export function listConfiguredProviders(): AIProviderName[] {
  return loadProviders()
    .filter((p) => !disabledProviders.has(p.name))
    .map((p) => p.name);
}

export function listDisabledProviders(): AIProviderName[] {
  return Array.from(disabledProviders);
}
