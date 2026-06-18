/**
 * GET /api/debug — verify AI providers are configured and reachable.
 *
 * Response:
 *   { providers: string[], hasGemini: boolean, testExtraction?: { ok, jobs, error } }
 *
 * If ?test=1 is passed, also runs a tiny test extraction to confirm the AI
 * provider actually works.
 */

import { NextResponse } from 'next/server';
import { complete, listConfiguredProviders } from '@/lib/ai-router';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shouldTest = url.searchParams.get('test') === '1';

  const providers = listConfiguredProviders();

  // Count Gemini keys (GEMINI_API_KEY + GEMINI_API_KEY_2..10)
  const geminiKeyCount = [
    process.env.GEMINI_API_KEY,
    ...Array.from({ length: 9 }, (_, i) => process.env[`GEMINI_API_KEY_${i + 2}`]),
  ].filter(Boolean).length;

  const envStatus: Record<string, boolean | number> = {
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GEMINI_KEY_COUNT: geminiKeyCount,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
    KIMI_API_KEY: !!process.env.KIMI_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    CLAUDE_API_KEY: !!process.env.CLAUDE_API_KEY,
    OLLAMA_URL: !!process.env.OLLAMA_URL,
  };

  const result: {
    providers: string[];
    envStatus: Record<string, boolean | number>;
    test?: { ok: boolean; provider?: string; response?: string; error?: string };
  } = {
    providers,
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
