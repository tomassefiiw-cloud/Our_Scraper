/**
 * Base AI provider interface (doc §7).
 *
 * Each provider implementation:
 * - Tracks rate-limit and daily-quota usage in-memory.
 * - On rate-limit hit, signals via isRateLimited() so the router can skip.
 * - Round-robins across multiple API keys for the same provider.
 */
import type { AICompletionParams, AICompletionResult, AIProviderConfig, AIProviderName } from '@tja/shared';

export abstract class BaseProvider {
  abstract readonly name: AIProviderName;
  protected configs: AIProviderConfig[];
  protected currentKeyIndex = 0;

  // In-memory rate tracking
  protected requestTimestamps: number[] = [];
  protected dailyUsage = 0;
  protected lastResetDay: number = new Date().getDate();

  constructor(configs: AIProviderConfig[]) {
    if (configs.length === 0) {
      throw new Error(`Provider ${this.name} requires at least one config`);
    }
    this.configs = configs.sort((a, b) => a.priority - b.priority);
  }

  /** Round-robin next key/config. */
  protected nextConfig(): AIProviderConfig {
    const cfg = this.configs[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.configs.length;
    return cfg;
  }

  /** Check rate-limit window + daily quota. */
  async isRateLimited(): Promise<boolean> {
    this.maybeResetDaily();
    const now = Date.now();
    const windowMs = 60_000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < windowMs);

    const rpmLimit = this.configs[0]?.rate_limit_rpm ?? 15;
    const dailyLimit = this.configs[0]?.daily_quota ?? 1500;

    if (this.requestTimestamps.length >= rpmLimit) return true;
    if (this.dailyUsage >= dailyLimit) return true;
    return false;
  }

  /** Track usage after a successful call. */
  trackUsage(usage: { promptTokens?: number; completionTokens?: number } | undefined): void {
    this.requestTimestamps.push(Date.now());
    const tokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);
    this.dailyUsage += Math.max(1, Math.ceil(tokens / 1000)); // count in ~1k-token units
  }

  private maybeResetDaily(): void {
    const today = new Date().getDate();
    if (today !== this.lastResetDay) {
      this.dailyUsage = 0;
      this.lastResetDay = today;
    }
  }

  abstract complete(params: AICompletionParams): Promise<AICompletionResult>;
}
