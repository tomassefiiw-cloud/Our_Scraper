/**
 * POST /api/extract — extract jobs from a raw Telegram message.
 *
 * Body: { channel, message_text, links }
 * Response: { jobs: ExtractedJob[], provider: string }
 *
 * CRITICAL FIX: Always fall back to rule-based when AI returns 0 jobs
 * or fails. The tiny Ollama model often returns empty arrays.
 */

import { NextResponse } from 'next/server';
import { extractJobs } from '@/lib/extractor';
import { extractJobsRuleBased } from '@/lib/rule-extractor';
import { getChannelConfig } from '@/lib/channels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hasAiProvider(): boolean {
  return !!(
    process.env.GEMINI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.CEREBRAS_API_KEY ||
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

  console.log(`[api/extract] channel=${channel}, text_len=${message_text.length}, links=${links?.length ?? 0}`);

  // Step 1: Try AI
  let aiJobs: unknown[] = [];
  let aiProvider = '';
  if (hasAiProvider()) {
    try {
      const result = await extractJobs(message_text, links ?? [], config);
      console.log(`[api/extract] AI: ${result.jobs.length} jobs via ${result.provider}`);
      if (result.jobs.length > 0) {
        aiJobs = result.jobs.map((j) => ({ ...j, _provider: result.provider }));
        aiProvider = result.provider;
      }
    } catch (err) {
      console.warn(`[api/extract] AI failed: ${(err as Error).message}`);
    }
  }

  // Step 2: ALWAYS also run rule-based (it catches everything AI misses)
  let ruleJobs: unknown[] = [];
  try {
    const rj = extractJobsRuleBased(message_text, links ?? [], channel);
    ruleJobs = rj.map((j) => ({ ...j, _provider: 'rule-based' }));
    console.log(`[api/extract] Rule-based: ${ruleJobs.length} jobs`);
  } catch (err) {
    console.warn(`[api/extract] Rule-based failed:`, err);
  }

  // Step 3: Merge — AI jobs first, then rule-based if title doesn't match
  const aiTitles = new Set(aiJobs.map((j: unknown) => String((j as Record<string, unknown>).title ?? '').toLowerCase()));
  const merged = [...aiJobs];
  for (const rj of ruleJobs) {
    const title = String((rj as Record<string, unknown>).title ?? '').toLowerCase();
    if (title && !aiTitles.has(title)) {
      merged.push(rj);
    }
  }

  const provider = aiProvider ? (ruleJobs.length > 0 ? `${aiProvider}+rule` : aiProvider) : 'rule-based';

  console.log(`[api/extract] → ${merged.length} total jobs (AI: ${aiJobs.length}, rule: ${ruleJobs.length})`);

  return NextResponse.json({
    jobs: merged,
    provider,
    extraction_method: provider,
  });
}
