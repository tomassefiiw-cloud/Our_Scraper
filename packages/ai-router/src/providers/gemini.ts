/**
 * Gemini provider — uses Google Generative AI REST API.
 * Free tier: 15 RPM, 1500 req/day (doc §7.2).
 *
 * Supports multiple API keys for load balancing (doc §7.3).
 */
import type { AICompletionParams, AICompletionResult, AIProviderConfig } from '@tja/shared';
import { BaseProvider } from './base.js';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini' as const;

  async complete(params: AICompletionParams): Promise<AICompletionResult> {
    const cfg = this.nextConfig();
    if (!cfg.api_key) throw new Error('Gemini: no API key configured');

    const model = cfg.model_name || 'gemini-1.5-flash-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.api_key}`;

    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [{ text: params.prompt }],
        },
      ],
      generationConfig: {
        temperature: params.temperature ?? 0.1,
        maxOutputTokens: params.maxTokens ?? 4000,
        ...(params.responseFormat?.type === 'json_object'
          ? { responseMimeType: 'application/json' }
          : {}),
      },
    };

    if (params.systemPrompt) {
      body.systemInstruction = { parts: [{ text: params.systemPrompt }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as GeminiResponse;
    if (data.error) throw new Error(`Gemini: ${data.error.message}`);

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return {
      content,
      provider: this.name,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}
