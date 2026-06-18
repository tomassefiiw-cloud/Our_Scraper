/**
 * DeepSeek provider — OpenAI-compatible REST API.
 * Free tier: 10 RPM, 10K tokens/day (doc §7.2).
 */
import type { AICompletionParams, AICompletionResult } from '@tja/shared';
import { BaseProvider } from './base.js';

export class DeepSeekProvider extends BaseProvider {
  readonly name = 'deepseek' as const;
  protected baseUrl = 'https://api.deepseek.com/v1';

  async complete(params: AICompletionParams): Promise<AICompletionResult> {
    const cfg = this.nextConfig();
    if (!cfg.api_key) throw new Error('DeepSeek: no API key configured');

    const url = `${cfg.api_base_url ?? this.baseUrl}/chat/completions`;
    const body = {
      model: cfg.model_name || 'deepseek-chat',
      messages: [
        ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
        { role: 'user', content: params.prompt },
      ],
      temperature: params.temperature ?? 0.1,
      max_tokens: params.maxTokens ?? 4000,
      ...(params.responseFormat?.type === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.api_key}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      provider: this.name,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }
}
