/**
 * OpenAI provider — only used as last resort (3 RPM, 200 req/day).
 */
import type { AICompletionParams, AICompletionResult } from '@tja/shared';
import { BaseProvider } from './base.js';

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai' as const;
  protected baseUrl = 'https://api.openai.com/v1';

  async complete(params: AICompletionParams): Promise<AICompletionResult> {
    const cfg = this.nextConfig();
    if (!cfg.api_key) throw new Error('OpenAI: no API key configured');

    const url = `${cfg.api_base_url ?? this.baseUrl}/chat/completions`;
    const body = {
      model: cfg.model_name || 'gpt-3.5-turbo',
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
      throw new Error(`OpenAI API ${response.status}: ${errText.slice(0, 200)}`);
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
