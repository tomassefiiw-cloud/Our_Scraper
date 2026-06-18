/**
 * Multi-provider AI router (doc §7).
 *
 * - Providers configured via env vars (server-side only — keys never reach browser)
 * - Priority order tried first; rate-limited providers skipped
 * - Throws aggregated error if all providers fail
 *
 * Runs server-side in the /api/extract route.
 */

export type AIProviderName =
  | 'gemini' | 'deepseek' | 'claude' | 'openai'
  | 'groq' | 'openrouter' | 'kimi' | 'ollama';

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
  isLocal: boolean;
  rpm: number;
  call: (params: AICompletionParams) => Promise<AICompletionResult>;
}

// In-memory rate tracking (resets when serverless instance cold-starts)
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

// --- Provider factories ----------------------------------------------------

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
    isLocal: false,
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

function makeGemini(priority: number, apiKey: string, model: string): ProviderRuntime {
  // Fallback chain — if the primary model 404s (deprecated), try alternatives.
  // Google has renamed/deprecated models multiple times; this makes us resilient.
  // De-duplicate in case the user's configured model is already in the fallback list.
  const fallbacks = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];
  const modelFallbacks = [model, ...fallbacks.filter((m) => m !== model)];

  return {
    name: 'gemini',
    priority,
    isLocal: false,
    rpm: 15,
    async call(params) {
      const body: Record<string, unknown> = {
        contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
        generationConfig: {
          temperature: params.temperature ?? 0.1,
          maxOutputTokens: params.maxTokens ?? 4000,
          ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      };
      if (params.systemPrompt) {
        body.systemInstruction = { parts: [{ text: params.systemPrompt }] };
      }

      let lastError: Error | null = null;
      for (const m of modelFallbacks) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
            error?: { message?: string };
          };
          if (data.error) {
            lastError = new Error(`Gemini ${m}: ${data.error.message}`);
            continue;
          }
          console.log(`[ai-router] gemini success with model: ${m}`);
          return {
            content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
            provider: 'gemini',
          };
        }
        // 404 = model not found, try next fallback
        // 400 = bad request (often model-specific), try next fallback
        // Other errors (401/429/500) = real failures, throw immediately
        if (res.status === 404 || res.status === 400) {
          const text = await res.text();
          console.warn(`[ai-router] gemini model ${m} failed ${res.status}, trying next fallback`);
          lastError = new Error(`Gemini ${m} ${res.status}: ${text.slice(0, 100)}`);
          continue;
        }
        const text = await res.text();
        throw new Error(`Gemini ${m} API ${res.status}: ${text.slice(0, 200)}`);
      }
      throw lastError ?? new Error('Gemini: all model fallbacks exhausted');
    },
  };
}

function makeClaude(priority: number, apiKey: string, model: string): ProviderRuntime {
  return {
    name: 'claude',
    priority,
    isLocal: false,
    rpm: 5,
    async call(params) {
      const body = {
        model,
        max_tokens: params.maxTokens ?? 4000,
        temperature: params.temperature ?? 0.1,
        system: params.systemPrompt,
        messages: [{ role: 'user', content: params.prompt }],
      };
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Claude API ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        content?: { text?: string }[];
      };
      return {
        content: data.content?.[0]?.text ?? '',
        provider: 'claude',
      };
    },
  };
}

function makeOllama(priority: number, model: string, ollamaUrl: string): ProviderRuntime {
  return {
    name: 'ollama',
    priority,
    isLocal: true,
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

  // Each provider can have multiple keys (GEMINI_API_KEY, GEMINI_API_KEY_2, ...)
  // For simplicity v2: one key per provider; multi-key can be added later.
  const env = process.env;
  let priority = 0;

  if (env.GEMINI_API_KEY) {
    // Default to gemini-2.0-flash (current free-tier model as of 2026).
    // The old 'gemini-1.5-flash-latest' was deprecated and returns 404.
    providers.push(makeGemini(priority++, env.GEMINI_API_KEY, env.GEMINI_MODEL || 'gemini-2.0-flash'));
  }
  if (env.GROQ_API_KEY) {
    providers.push(
      makeOpenAICompatible(
        'groq', priority++, env.GROQ_API_KEY,
        env.GROQ_MODEL || 'llama-3.1-8b-instant',
        'https://api.groq.com/openai/v1', 20,
      ),
    );
  }
  if (env.DEEPSEEK_API_KEY) {
    providers.push(
      makeOpenAICompatible(
        'deepseek', priority++, env.DEEPSEEK_API_KEY,
        env.DEEPSEEK_MODEL || 'deepseek-chat',
        'https://api.deepseek.com/v1', 10,
      ),
    );
  }
  if (env.OPENROUTER_API_KEY) {
    providers.push(
      makeOpenAICompatible(
        'openrouter', priority++, env.OPENROUTER_API_KEY,
        env.OPENROUTER_MODEL || 'google/gemini-flash-1.5',
        'https://openrouter.ai/api/v1', 20,
        { 'HTTP-Referer': 'https://tja.local', 'X-Title': 'Telegram Job Aggregator' },
      ),
    );
  }
  if (env.KIMI_API_KEY) {
    providers.push(
      makeOpenAICompatible(
        'kimi', priority++, env.KIMI_API_KEY,
        env.KIMI_MODEL || 'moonshot-v1-8k',
        'https://api.moonshot.cn/v1', 10,
      ),
    );
  }
  if (env.OPENAI_API_KEY) {
    providers.push(
      makeOpenAICompatible(
        'openai', priority++, env.OPENAI_API_KEY,
        env.OPENAI_MODEL || 'gpt-3.5-turbo',
        'https://api.openai.com/v1', 3,
      ),
    );
  }
  if (env.CLAUDE_API_KEY) {
    providers.push(makeClaude(priority++, env.CLAUDE_API_KEY, env.CLAUDE_MODEL || 'claude-3-haiku-20240307'));
  }
  // Ollama is always last (local fallback, no key needed)
  if (env.OLLAMA_URL || env.OLLAMA_MODEL) {
    providers.push(makeOllama(priority++, env.OLLAMA_MODEL || 'phi4:latest', env.OLLAMA_URL || 'http://localhost:11434'));
  }

  providersCache = providers;
  return providers;
}

/**
 * Try providers in priority order. Returns first success.
 */
export async function complete(params: AICompletionParams): Promise<AICompletionResult> {
  const providers = loadProviders();
  if (providers.length === 0) {
    throw new Error(
      'No AI providers configured. Set at least one of: GEMINI_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY, KIMI_API_KEY, OPENAI_API_KEY, CLAUDE_API_KEY, or OLLAMA_URL.',
    );
  }

  const errors: { provider: AIProviderName; error: string }[] = [];
  for (const p of providers) {
    if (isRateLimited(p.name, p.rpm)) {
      console.warn(`[ai-router] ${p.name} rate limited, skipping`);
      continue;
    }
    try {
      recordRequest(p.name);
      const result = await p.call(params);
      return result;
    } catch (err) {
      errors.push({ provider: p.name, error: (err as Error).message });
      console.error(`[ai-router] ${p.name} failed:`, (err as Error).message);
    }
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
  // Strip markdown code fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Find outermost JSON
  const firstBrace = text.search(/[{\[]/);
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text) as T;
}

export function listConfiguredProviders(): AIProviderName[] {
  return loadProviders().map((p) => p.name);
}
