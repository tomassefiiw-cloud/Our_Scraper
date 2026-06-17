/**
 * Claude (Anthropic) provider.
 * Free tier very restrictive: 5 RPM, 100 req/day (doc §7.2).
 */
import type { AICompletionParams, AICompletionResult } from '@tja/shared';
import { BaseProvider } from './base.js';

export class ClaudeProvider extends BaseProvider {
  readonly name = 'claude' as const;
  protected baseUrl = 'https://api.anthropic.com/v1';

  async complete(params: AICompletionParams): Promise<AICompletionResult> {
    const cfg = this.nextConfig();
    if (!cfg.api_key) throw new Error('Claude: no API key configured');

    const url = `${cfg.api_base_url ?? this.baseUrl}/messages`;
    const body = {
      model: cfg.model_name || 'claude-3-haiku-20240307',
      max_tokens: params.maxTokens ?? 4000,
      temperature: params.temperature ?? 0.1,
      system: params.systemPrompt ?? undefined,
      messages: [{ role: 'user', content: params.prompt }],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      content: data.content?.[0]?.text ?? '',
      provider: this.name,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
      },
    };
  }
}
