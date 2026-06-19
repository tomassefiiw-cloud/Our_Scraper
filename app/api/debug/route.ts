/**
 * GET /api/debug — verify AI providers are configured and reachable.
 *
 * Response:
 *   { providers: string[], envStatus: {...}, test?: { ok, provider, response, error } }
 *
 * If ?test=1 is passed, also runs a tiny test extraction to confirm the AI
 * provider actually works.
 */

import { NextResponse } from 'next/server';
import { complete, listConfiguredProviders, listDisabledProviders } from '@/lib/ai-router';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shouldTest = url.searchParams.get('test') === '1';

  const providers = listConfiguredProviders();
  const disabled = listDisabledProviders();

  const envStatus: Record<string, boolean> = {
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
    MISTRAL_API_KEY: !!process.env.MISTRAL_API_KEY,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
    KIMI_API_KEY: !!process.env.KIMI_API_KEY,
    OLLAMA_URL: !!process.env.OLLAMA_URL,
  };

  const result: {
    providers: string[];
    disabledProviders: string[];
    envStatus: Record<string, boolean>;
    test?: { ok: boolean; provider?: string; response?: string; error?: string };
  } = {
    providers,
    disabledProviders: disabled,
    envStatus,
  };

  if (shouldTest) {
    try {
      const testResponse = await complete({
        prompt: 'Return JSON: {"test": true, "message": "hello"}',
        systemPrompt: 'You are a test bot. Always respond with valid JSON.',
        temperature: 0,
        maxTokens: 100,
        jsonMode: true,
      });
      result.test = {
        ok: true,
        provider: testResponse.provider,
        response: testResponse.content.slice(0, 300),
      };
    } catch (err) {
      result.test = {
        ok: false,
        error: (err as Error).message,
      };
    }
  }

  return NextResponse.json(result);
}
