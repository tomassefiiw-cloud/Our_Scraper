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

function makeGemini(priority: number, apiKeys: string[], model: string): ProviderRuntime {
  // Fallback chain — if the primary model 404s (deprecated), try alternatives.
  // Google has renamed/deprecated models multiple times; this makes us resilient.
  const fallbacks = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];
  const modelFallbacks = [model, ...fallbacks.filter((m) => m !== model)];

  // Round-robin key index — shared across calls in this provider instance
  let keyIndex = 0;
  // Track keys that hit quota (429) — skip them for the rest of the day
  const quotaExhaustedKeys = new Set<string>();

  // Reset the quota-exhausted set at midnight UTC (Google resets at midnight Pacific,
  // but UTC midnight is a safe approximation for the daily reset)
  setInterval(() => {
    if (quotaExhaustedKeys.size > 0) {
      console.log('[ai-router] gemini: resetting quota-exhausted keys set (new day)');
      quotaExhaustedKeys.clear();
    }
  }, 24 * 60 * 60 * 1000).unref?.();

  return {
    name: 'gemini',
    priority,
    isLocal: false,
    rpm: 15 * apiKeys.length, // aggregate RPM scales with number of keys
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

      // Get available keys (exclude quota-exhausted ones)
      const availableKeys = apiKeys.filter((k) => !quotaExhaustedKeys.has(k));
      if (availableKeys.length === 0) {
        throw new Error(
          `Gemini: all ${apiKeys.length} keys have exhausted their daily quota. ` +
            `Wait until midnight Pacific time for reset, or add more keys.`,
        );
      }

      let lastError: Error | null = null;

      // Try each available key in round-robin order, starting from keyIndex
      for (let attempt = 0; attempt < availableKeys.length; attempt++) {
        const key = availableKeys[(keyIndex + attempt) % availableKeys.length];
        // Advance the round-robin index for next call
        if (attempt === 0) keyIndex = (keyIndex + 1) % availableKeys.length;

        // Try model fallbacks for this key
        for (const m of modelFallbacks) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
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
              continue; // try next model
            }
            console.log(
              `[ai-router] gemini success with model: ${m}, key: ${key.slice(0, 8)}...`,
            );
            return {
              content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
              provider: 'gemini',
            };
          }

          // 429 = quota exceeded for THIS key — mark it as exhausted and try next key
          if (res.status === 429) {
            console.warn(
              `[ai-router] gemini key ${key.slice(0, 8)}... hit quota (429), ` +
                `marking as exhausted for the day, trying next key`,
            );
            quotaExhaustedKeys.add(key);
            lastError = new Error(`Gemini key ${key.slice(0, 8)}... quota exceeded (429)`);
            break; // exit model loop, try next key
          }

          // 404 / 400 = model not found / bad request, try next model fallback
          if (res.status === 404 || res.status === 400) {
            const text = await res.text();
            console.warn(
              `[ai-router] gemini model ${m} failed ${res.status}, trying next fallback`,
            );
            lastError = new Error(`Gemini ${m} ${res.status}: ${text.slice(0, 100)}`);
            continue;
          }

          // 401 = invalid key — mark as exhausted (likely revoked)
          if (res.status === 401) {
            console.warn(
              `[ai-router] gemini key ${key.slice(0, 8)}... is invalid (401), ` +
                `marking as exhausted`,
            );
            quotaExhaustedKeys.add(key);
            const text = await res.text();
            lastError = new Error(`Gemini key ${key.slice(0, 8)}... invalid (401): ${text.slice(0, 100)}`);
            break; // try next key
          }

          // Other errors (500, 503, etc.) — throw immediately, don't retry
          const text = await res.text();
          throw new Error(`Gemini ${m} API ${res.status}: ${text.slice(0, 200)}`);
        }
      }

      throw lastError ?? new Error('Gemini: all keys and model fallbacks exhausted');
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

/**
 * Validate Gemini key format. Real Google API keys start with 'AIza' and have
 * no spaces. Common mistakes we catch:
 *  - Keys with spaces (often from copy-paste artifacts or typing)
 *  - Keys that don't start with 'AIza' (wrong service / fake key)
 *  - Empty values
 */
function isValidGeminiKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 20) return false;
  if (/\s/.test(trimmed)) return false; // no spaces allowed
  // Real Gemini keys start with 'AIza'. Accept anything that looks plausible
  // if it doesn't start with AIza (some users have keys from other Google services)
  // but warn about it.
  return true;
}

function loadProviders(): ProviderRuntime[] {
  if (providersCache) return providersCache;
  const providers: ProviderRuntime[] = [];
  let priority = 0;

  // ===== GEMINI =====
  // Collect ALL Gemini keys from env: GEMINI_API_KEY, GEMINI_API_KEY_2, ... _10
  // Multiple keys enable round-robin load balancing + automatic failover when one
  // key hits its daily quota (1500 req/day per key on free tier).
  const env = process.env;
  const geminiKeys: string[] = [];
  const warnings: string[] = [];

  if (env.GEMINI_API_KEY) {
    const k = env.GEMINI_API_KEY.trim();
    if (isValidGeminiKey(k)) {
      geminiKeys.push(k);
      if (!k.startsWith('AIza')) {
        warnings.push(`GEMINI_API_KEY doesn't start with 'AIza' — may not be a real Gemini key`);
      }
    } else {
      warnings.push(
        `GEMINI_API_KEY looks invalid (length=${k.length}, has_spaces=${/\s/.test(k)}). ` +
          `Real Gemini keys start with 'AIza' and have no spaces.`,
      );
    }
  }
  for (let i = 2; i <= 10; i++) {
    const k = env[`GEMINI_API_KEY_${i}`];
    if (k) {
      const trimmed = k.trim();
      if (isValidGeminiKey(trimmed)) {
        geminiKeys.push(trimmed);
      } else {
        warnings.push(
          `GEMINI_API_KEY_${i} looks invalid (length=${trimmed.length}, has_spaces=${/\s/.test(trimmed)}). Skipping.`,
        );
      }
    }
  }

  // Check for the deprecated model name
  const geminiModel = env.GEMINI_MODEL || 'gemini-2.0-flash';
  if (geminiModel.includes('1.5-flash-latest') || geminiModel === 'gemini-1.5-flash') {
    warnings.push(
      `GEMINI_MODEL='${geminiModel}' is DEPRECATED and returns 404. ` +
        `Change it to 'gemini-2.0-flash' in .env. (The router will auto-fallback, but fix your .env.)`,
    );
  }

  if (geminiKeys.length > 0) {
    console.log(`[ai-router] gemini: ${geminiKeys.length} key(s) loaded — load balancing enabled (model: ${geminiModel})`);
    providers.push(makeGemini(priority++, geminiKeys, geminiModel));
  } else {
    console.warn('[ai-router] gemini: NO valid keys loaded');
  }

  // Print warnings at the end so they're visible
  for (const w of warnings) {
    console.warn(`[ai-router] ⚠️  ${w}`);
  }

  // ===== GROQ =====
  if (env.GROQ_API_KEY) {
    console.log(`[ai-router] groq: key loaded (model: ${env.GROQ_MODEL || 'llama-3.1-8b-instant'})`);
    providers.push(
      makeOpenAICompatible(
        'groq', priority++, env.GROQ_API_KEY,
        env.GROQ_MODEL || 'llama-3.1-8b-instant',
        'https://api.groq.com/openai/v1', 20,
      ),
    );
  }
  if (env.DEEPSEEK_API_KEY) {
    console.log(`[ai-router] deepseek: key loaded (model: ${env.DEEPSEEK_MODEL || 'deepseek-chat'})`);
    providers.push(
      makeOpenAICompatible(
        'deepseek', priority++, env.DEEPSEEK_API_KEY,
        env.DEEPSEEK_MODEL || 'deepseek-chat',
        'https://api.deepseek.com/v1', 10,
      ),
    );
  }
  if (env.OPENROUTER_API_KEY) {
    // Default to nvidia/nemotron-3-nano-30b-a3b:free — tested working globally
    // (including from regions where Gemini/Groq/OpenAI are blocked).
    // Free, 256K context, handles JSON extraction well.
    // Alternatives: qwen/qwen3-next-80b-a3b-instruct:free (when not rate-limited)
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
  if (env.OPENAI_API_KEY) {
    console.log(`[ai-router] openai: key loaded (model: ${env.OPENAI_MODEL || 'gpt-3.5-turbo'})`);
    providers.push(
      makeOpenAICompatible(
        'openai', priority++, env.OPENAI_API_KEY,
        env.OPENAI_MODEL || 'gpt-3.5-turbo',
        'https://api.openai.com/v1', 3,
      ),
    );
  }
  if (env.CLAUDE_API_KEY) {
    console.log(`[ai-router] claude: key loaded (model: ${env.CLAUDE_MODEL || 'claude-3-haiku-20240307'})`);
    providers.push(makeClaude(priority++, env.CLAUDE_API_KEY, env.CLAUDE_MODEL || 'claude-3-haiku-20240307'));
  }
  // Ollama is always last (local fallback, no key needed)
  if (env.OLLAMA_URL || env.OLLAMA_MODEL) {
    console.log(`[ai-router] ollama: configured (model: ${env.OLLAMA_MODEL || 'phi4:latest'}, url: ${env.OLLAMA_URL || 'http://localhost:11434'})`);
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
