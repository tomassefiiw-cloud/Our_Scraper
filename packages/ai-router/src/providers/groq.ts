/**
 * Groq provider — fastest, generous limits (20 RPM, 14400 req/day).
 * OpenAI-compatible API.
 */
import type { AICompletionParams, AICompletionResult } from '@tja/shared';
import { BaseProvider } from './base.js';

export class GroqProvider extends BaseProvider {
  readonly name = 'groq' as const;
  protected baseUrl = 'https://api.groq.com/openai/v1';

  async complete(params: AICompletionParams): Promise<AICompletionResult> {
    const cfg = this.nextConfig();
    if (!cfg.api_key) throw new Error('Groq: no API key configured');

    const url = `${cfg.api_base_url ?? this.baseUrl}/chat/completions`;
    const body = {
      model: cfg.model_name || 'llama-3.1-8b-instant',
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
      throw new Error(`Groq API ${response.status}: ${errText.slice(0, 200)}`);
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
