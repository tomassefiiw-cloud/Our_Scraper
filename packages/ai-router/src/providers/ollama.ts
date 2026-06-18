/**
 * Ollama provider — local fallback, unlimited rate (doc §7.2).
 *
 * URL: http://localhost:11434 by default.
 * Recommended models: phi4:latest, qwen2.5:latest, llama3.1:latest.
 */
import type { AICompletionParams, AICompletionResult } from '@tja/shared';
import { BaseProvider } from './base.js';

interface OllamaResponse {
  model: string;
  message?: { role: string; content: string };
  response?: string; // for /generate endpoint
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export class OllamaProvider extends BaseProvider {
  readonly name = 'ollama' as const;

  async complete(params: AICompletionParams): Promise<AICompletionResult> {
    const cfg = this.nextConfig();
    const baseUrl = cfg.ollama_url || process.env.OLLAMA_URL || 'http://localhost:11434';

    const body = {
      model: cfg.model_name || 'phi4:latest',
      messages: [
        ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
        { role: 'user', content: params.prompt },
      ],
      stream: false,
      options: {
        temperature: params.temperature ?? 0.1,
        num_predict: params.maxTokens ?? 4000,
      },
      ...(params.responseFormat?.type === 'json_object'
        ? { format: 'json' }
        : {}),
    };

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as OllamaResponse;
    if (data.error) throw new Error(`Ollama: ${data.error}`);

    return {
      content: data.message?.content ?? data.response ?? '',
      provider: this.name,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
      },
    };
  }
}
