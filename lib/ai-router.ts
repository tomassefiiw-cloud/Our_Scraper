/**
 * Multi-provider AI router — v3, Gemini-free.
 *
 * Supports only providers that work globally (no region blocks):
 *   - DeepSeek (deepseek-chat) — generous free credit, works everywhere
 *   - Mistral (mistral-small-latest) — free tier, works everywhere
 *   - OpenRouter (nvidia/nemotron-3-nano-30b-a3b:free) — aggregator, but
 *     free tier limited to 50 req/day (use DeepSeek/Mistral instead)
 *   - Kimi (moonshot-v1-8k) — Chinese provider, may work in some regions
 *   - Ollama (local) — unlimited but requires local install
 *
 * NOT supported (region-blocked in many areas):
 *   - Gemini  (returns 429 limit:0 in blocked regions)
 *   - Groq    (returns 403 Forbidden via Cloudflare edge)
 *   - OpenAI  (returns 403 Forbidden via Cloudflare edge)
 *   - Claude  (returns 403 Forbidden via Cloudflare edge)
 *
 * Provider priority order (first tried first):
 *   DeepSeek → Mistral → OpenRouter → Kimi → Ollama
 *
 * Circuit breaker: providers that fail with hard errors (403/401/quota exhausted)
 * get auto-disabled for the session, so we don't waste time retrying them.
 */

export type AIProviderName =
  | 'deepseek' | 'mistral' | 'openrouter' | 'kimi' | 'ollama';

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

// Circuit breaker — providers that fail with hard errors get disabled for the session
const disabledProviders = new Set<AIProviderName>();

// --- Provider factories ----------------------------------------------------

/**
 * Generic factory for OpenAI-compatible APIs (DeepSeek, Mistral, OpenRouter, Kimi).
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
    name: 'ollama',
    priority,
    rpm: 9999,
    async call(params) {
      const body = {
        model,
        messages: [
          ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
          { role: 'user', content: params.prompt },
        ],
        stream: false,
        options: {
          temperature: params.temperature ?? 0.1,
          num_predict: params.maxTokens ?? 4000,
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
        message?: { content?: string };
        error?: string;
      };
      if (data.error) throw new Error(`Ollama: ${data.error}`);
      return {
        content: data.message?.content ?? '',
        provider: 'ollama',
      };
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

  // ===== DEEPSEEK (primary — generous free tier, works globally) =====
  // Sign up at https://platform.deepseek.com — get $5.50 free credit (6 months).
  // 'deepseek-chat' is the general-purpose model, ~$0.14/M tokens.
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

  // ===== MISTRAL (secondary — free tier, works globally) =====
  // Sign up at https://console.mistral.ai — free tier with rate limits.
  // 'mistral-small-latest' is fast and cheap.
  if (env.MISTRAL_API_KEY) {
    console.log(`[ai-router] mistral: key loaded (model: ${env.MISTRAL_MODEL || 'mistral-small-latest'})`);
    providers.push(
      makeOpenAICompatible(
        'mistral', priority++, env.MISTRAL_API_KEY,
        env.MISTRAL_MODEL || 'mistral-small-latest',
        'https://api.mistral.ai/v1', 50,
      ),
    );
  }

  // ===== OPENROUTER (tertiary — aggregator, free tier limited to 50/day) =====
  // Sign up at https://openrouter.ai — works globally but free tier is restrictive.
  if (env.OPENROUTER_API_KEY) {
    const defaultOpenRouterModel = 'nvidia/nemotron-3-nano-30b-a3b:free';
    console.log(`[ai-router] openrouter: key loaded (model: ${env.OPENROUTER_MODEL || defaultOpenRouterModel})`);
    providers.push(
      makeOpenAICompatible(
        'openrouter', priority++, env.OPENROUTER_API_KEY,
        env.OPENROUTER_MODEL || defaultOpenRouterModel,
        'https://openrouter.ai/api/v1', 20,
        { 'HTTP-Referer': 'https://tja.local', 'X-Title': 'Telegram Job Aggregator' },
      ),
    );
  }

  // ===== KIMI (quaternary — Chinese provider) =====
  if (env.KIMI_API_KEY) {
    console.log(`[ai-router] kimi: key loaded (model: ${env.KIMI_MODEL || 'moonshot-v1-8k'})`);
    providers.push(
      makeOpenAICompatible(
        'kimi', priority++, env.KIMI_API_KEY,
        env.KIMI_MODEL || 'moonshot-v1-8k',
        'https://api.moonshot.cn/v1', 10,
      ),
    );
  }

  // ===== OLLAMA (local fallback — unlimited, requires local install) =====
  if (env.OLLAMA_URL || env.OLLAMA_MODEL) {
    console.log(`[ai-router] ollama: configured (model: ${env.OLLAMA_MODEL || 'phi4:latest'}, url: ${env.OLLAMA_URL || 'http://localhost:11434'})`);
    providers.push(makeOllama(priority++, env.OLLAMA_MODEL || 'phi4:latest', env.OLLAMA_URL || 'http://localhost:11434'));
  }

  if (providers.length === 0) {
    console.warn('[ai-router] ⚠️  No AI providers configured!');
    console.warn('[ai-router]    Set at least one of: DEEPSEEK_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, KIMI_API_KEY');
    console.warn('[ai-router]    Recommended: DEEPSEEK_API_KEY (free $5.50 credit at https://platform.deepseek.com)');
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
      'No AI providers configured. Set at least one of: DEEPSEEK_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, KIMI_API_KEY, or OLLAMA_URL. ' +
        'Recommended: DEEPSEEK_API_KEY (free $5.50 credit at https://platform.deepseek.com).',
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

      // Circuit breaker: disable for session on hard errors
      const isHardError =
        msg.includes(' 403:') ||
        msg.includes(' 401:') ||
        msg.includes('Forbidden') ||
        msg.includes('Unauthorized') ||
        msg.includes('limit: 0') ||
        /all \d+ keys have exhausted/.test(msg) ||
        msg.includes('free-models-per-day'); // OpenRouter daily limit
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

/**
 * Convenience: complete + parse as JSON (tolerant of markdown fences).
 */
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
