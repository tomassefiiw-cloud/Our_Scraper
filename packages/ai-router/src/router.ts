/**
 * AIProviderRouter (doc §7.1).
 *
 * - Providers sorted by priority (lower = tried first).
 * - Skips providers that are rate-limited.
 * - On provider failure, logs and tries next provider.
 * - Throws aggregated error if all providers fail.
 */
import type {
  AICompletionParams,
  AICompletionResult,
  AIProviderConfig,
  AIProviderName,
} from '@tja/shared';
import { BaseProvider } from './providers/base.js';
import { GeminiProvider } from './providers/gemini.js';
import { DeepSeekProvider } from './providers/deepseek.js';
import { ClaudeProvider } from './providers/claude.js';
import { OpenAIProvider } from './providers/openai.js';
import { GroqProvider } from './providers/groq.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { KimiProvider } from './providers/kimi.js';
import { OllamaProvider } from './providers/ollama.js';

const PROVIDER_CLASSES: Record<AIProviderName, typeof BaseProvider> = {
  gemini: GeminiProvider,
  deepseek: DeepSeekProvider,
  claude: ClaudeProvider,
  openai: OpenAIProvider,
  groq: GroqProvider,
  openrouter: OpenRouterProvider,
  kimi: KimiProvider,
  ollama: OllamaProvider,
};

export class AIProviderRouter {
  private providers: BaseProvider[] = [];

  constructor(configs: AIProviderConfig[]) {
    this.configure(configs);
  }

  /**
   * Re-configure providers at runtime (e.g. after admin updates config).
   */
  configure(configs: AIProviderConfig[]): void {
    const active = configs.filter((c) => c.is_active);
    const byProvider = new Map<AIProviderName, AIProviderConfig[]>();
    for (const cfg of active) {
      if (!byProvider.has(cfg.provider_name)) byProvider.set(cfg.provider_name, []);
      byProvider.get(cfg.provider_name)!.push(cfg);
    }

    // Compute aggregate priority per provider = min priority among its configs
    this.providers = Array.from(byProvider.entries())
      .map(([name, cfgs]) => {
        const aggregatePriority = Math.min(...cfgs.map((c) => c.priority));
        const ProviderClass = PROVIDER_CLASSES[name];
        const instance = new ProviderClass(cfgs);
        // Attach aggregate priority for sorting
        (instance as unknown as { _priority: number })._priority = aggregatePriority;
        return instance;
      })
      .sort(
        (a, b) =>
          (a as unknown as { _priority: number })._priority -
          (b as unknown as { _priority: number })._priority,
      );
  }

  /**
   * Try providers in priority order. Returns first success.
   */
  async complete(params: AICompletionParams): Promise<AICompletionResult> {
    if (this.providers.length === 0) {
      throw new Error('No AI providers configured');
    }

    const errors: { provider: AIProviderName; error: string }[] = [];

    for (const provider of this.providers) {
      try {
        if (await provider.isRateLimited()) {
          console.warn(`[ai-router] ${provider.name} rate limited, skipping`);
          continue;
        }

        const result = await provider.complete(params);
        provider.trackUsage(result.usage);
        return result;
      } catch (err) {
        const msg = (err as Error).message;
        errors.push({ provider: provider.name, error: msg });
        console.error(`[ai-router] ${provider.name} failed: ${msg}`);
      }
    }

    throw new Error(
      `All AI providers failed: ${JSON.stringify(errors)}`,
    );
  }

  /**
   * Convenience: parse JSON response (strip markdown fences, validate).
   */
  async completeJson<T = unknown>(params: AICompletionParams): Promise<T> {
    const result = await this.complete({
      ...params,
      responseFormat: { type: 'json_object' },
    });
    return parseJsonLoose<T>(result.content);
  }

  listProviders(): AIProviderName[] {
    return this.providers.map((p) => p.name);
  }
}

/**
 * Parse LLM JSON output, tolerating markdown code fences and trailing prose.
 */
export function parseJsonLoose<T = unknown>(raw: string): T {
  let text = raw.trim();

  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Find first { or [ and last } or ]
  const firstBrace = text.search(/[{\[]/);
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text) as T;
}
