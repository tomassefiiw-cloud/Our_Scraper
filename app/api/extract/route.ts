/**
 * POST /api/extract — extract jobs from a raw Telegram message.
 *
 * Body: { channel, message_text, links }
 * Response: { jobs: ExtractedJob[], provider: string }
 *
 * Strategy:
 *   1. Try AI provider (DeepSeek/Mistral/etc.) if configured — best quality
 *   2. Fall back to rule-based extractor (regex + heuristics) — zero cost, no API key
 *
 * The rule-based extractor handles the common Ethiopian Telegram job patterns
 * documented in §17 of the architecture doc. It's less accurate than an LLM
 * but 100% free and works offline.
 */

import { NextResponse } from 'next/server';
import { extractJobs } from '@/lib/extractor';
import { extractJobsRuleBased } from '@/lib/rule-extractor';
import { getChannelConfig } from '@/lib/channels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Check if any AI provider is configured
function hasAiProvider(): boolean {
  return !!(
    process.env.DEEPSEEK_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.KIMI_API_KEY ||
    process.env.OLLAMA_URL
  );
}

export async function POST(req: Request) {
  let body: { channel?: string; message_text?: string; links?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { channel, message_text, links } = body;
  if (!channel || typeof message_text !== 'string') {
    return NextResponse.json(
      { error: 'Missing required fields: channel, message_text' },
      { status: 400 },
    );
  }

  const config = getChannelConfig(channel);
  if (!config) {
    return NextResponse.json({ error: `Unknown channel: ${channel}` }, { status: 404 });
  }

  console.log(`[api/extract] channel=${channel}, text_len=${message_text.length}, links=${links?.length ?? 0}, ai_available=${hasAiProvider()}`);

  // Strategy 1: Try AI if a provider is configured
  if (hasAiProvider()) {
    try {
      const result = await extractJobs(message_text, links ?? [], config);
      console.log(`[api/extract] ✓ AI extracted ${result.jobs.length} jobs via ${result.provider}`);
      return NextResponse.json({
        jobs: result.jobs.map((j) => ({ ...j, _provider: result.provider })),
        provider: result.provider,
        extraction_method: 'ai',
      });
    } catch (err) {
      console.warn(`[api/extract] AI failed, falling back to rule-based: ${(err as Error).message}`);
      // Fall through to rule-based
    }
  }

  // Strategy 2: Rule-based extraction (zero cost, always works)
  try {
    const jobs = extractJobsRuleBased(message_text, links ?? [], channel);
    console.log(`[api/extract] ✓ rule-based extracted ${jobs.length} jobs`);
    return NextResponse.json({
      jobs: jobs.map((j) => ({ ...j, _provider: 'rule-based' })),
      provider: 'rule-based',
      extraction_method: 'rule-based',
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[api/extract] ✗ rule-based failed for channel=${channel}:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
