/**
 * Kimi (Moonshot AI) provider — OpenAI-compatible.
 */
import type { AICompletionParams, AICompletionResult } from '@tja/shared';
import { BaseProvider } from './base.js';

export class KimiProvider extends BaseProvider {
  readonly name = 'kimi' as const;
  protected baseUrl = 'https://api.moonshot.cn/v1';

  async complete(params: AICompletionParams): Promise<AICompletionResult> {
    const cfg = this.nextConfig();
    if (!cfg.api_key) throw new Error('Kimi: no API key configured');

    const url = `${cfg.api_base_url ?? this.baseUrl}/chat/completions`;
    const body = {
      model: cfg.model_name || 'moonshot-v1-8k',
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
      throw new Error(`Kimi API ${response.status}: ${errText.slice(0, 200)}`);
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
