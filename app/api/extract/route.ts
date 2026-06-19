/**
 * POST /api/extract — extract jobs from a raw Telegram message.
 *
 * Body: { channel, message_text, links }
 * Response: { jobs: ExtractedJob[], provider: string }
 *
 * v3 - Multi-category + Deep link following
 */

import { NextResponse } from 'next/server';
import { extractJobs } from '@/lib/extractor';
import { extractJobsRuleBased } from '@/lib/rule-extractor';
import { getChannelConfig } from '@/lib/channels';
import { followDeepLink, enrichJobWithDeepLink, detectCategories } from '@/lib/deep-link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hasAiProvider(): boolean {
  return !!(
    process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY ||
    process.env.MISTRAL_API_KEY || process.env.GROQ_API_KEY ||
    process.env.CEREBRAS_API_KEY || process.env.OPENROUTER_API_KEY ||
    process.env.KIMI_API_KEY || process.env.OLLAMA_URL
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

  // Step 1: Try AI extraction
  let aiJobs: Record<string, unknown>[] = [];
  let aiProvider = '';
  if (hasAiProvider()) {
    try {
      const result = await extractJobs(message_text, links ?? [], config);
      if (result.jobs.length > 0) {
        aiJobs = result.jobs.map((j) => {
          // Merge categories from AI into job_categories
          const cat = j.job_category;
          const cats = (j as unknown as Record<string, unknown>).job_categories as string[] ?? [];
          const allCats = new Set<string>(cats);
          if (cat && !allCats.has(cat)) allCats.add(cat);
          return {
            ...j,
            job_categories: Array.from(allCats),
            _provider: result.provider,
          } as unknown as Record<string, unknown>;
        });
        aiProvider = result.provider;
      }
    } catch (err) {
      console.warn(`[api/extract] AI failed: ${(err as Error).message}`);
    }
  }

  // Step 2: Always run rule-based extractor
  let ruleJobs: Record<string, unknown>[] = [];
  try {
    const rj = extractJobsRuleBased(message_text, links ?? [], channel);
    ruleJobs = rj.map((j) => {
      // Detect multiple categories from message text + title
      const cats = detectCategories(message_text + ' ' + (j.title ?? ''));
      return {
        ...j,
        job_categories: cats.length > 0 ? cats : [j.job_category || 'other'],
        _provider: 'rule-based',
      } as unknown as Record<string, unknown>;
    });
  } catch (err) {
    console.warn(`[api/extract] Rule-based failed:`, err);
  }

  // Step 3: Merge AI + Rule-based jobs (dedup by title)
  const titleMap = new Map<string, Record<string, unknown>>();
  
  for (const job of [...aiJobs, ...ruleJobs]) {
    const title = String(job.title ?? '').toLowerCase().trim();
    const company = String(job.company_name ?? '').toLowerCase().trim();
    const key = `${title}|${company}`;
    
    if (titleMap.has(key)) {
      // Merge categories from duplicate
      const existing = titleMap.get(key)!;
      const existingCats = (existing.job_categories as string[]) ?? [];
      const newCats = (job.job_categories as string[]) ?? [];
      existing.job_categories = [...new Set([...existingCats, ...newCats])];
      // Prefer longer description
      const existingDesc = String(existing.description ?? '').length;
      const newDesc = String(job.description ?? '').length;
      if (newDesc > existingDesc) {
        existing.description = job.description;
      }
    } else {
      titleMap.set(key, { ...job });
    }
  }

  const mergedJobs = Array.from(titleMap.values());

  // Step 4: Try deep link following for URLs found in message
  // Only follow links that look like job listing pages (not Telegram/internal links)
  const jobUrls = (links ?? []).filter((url: string) => {
    try {
      const host = new URL(url).hostname;
      return !host.includes('t.me') && !host.includes('tg://') &&
             !host.includes('facebook.com') && !host.includes('twitter.com') &&
             !host.includes('instagram.com');
    } catch {
      return false;
    }
  });

  if (jobUrls.length > 0 && mergedJobs.length > 0) {
    console.log(`[api/extract] Following ${jobUrls.length} deep link(s) for more detail...`);
    
    for (const deepUrl of jobUrls.slice(0, 2)) { // Max 2 deep links per message
      try {
        const deepData = await followDeepLink(deepUrl);
        if (deepData.success) {
          // Enrich the first job with deep link data
          mergedJobs[0] = {
            ...enrichJobWithDeepLink(mergedJobs[0], deepData),
            source_url: deepUrl,
            extraction_method: 'deep_link',
          };
          
          // If the deep link found multiple positions, add them
          if (deepData.title && deepData.title !== mergedJobs[0].title) {
            const cats = detectCategories(deepData.title + ' ' + (deepData.description || ''));
            mergedJobs.push({
              ...mergedJobs[0],
              title: deepData.title,
              job_categories: cats,
              _provider: mergedJobs[0]._provider,
            });
          }
          console.log(`[api/extract] Deep link enriched job with ${deepData.description?.length ?? 0} chars of detail`);
        }
      } catch (err) {
        console.warn(`[api/extract] Deep link follow failed: ${(err as Error).message}`);
      }
    }
  }

  const provider = aiProvider ? (ruleJobs.length > 0 ? `${aiProvider}+rule` : aiProvider) : 'rule-based';
  
  // Set job_category to primary (first) category for backward compatibility
  for (const job of mergedJobs) {
    const cats = (job.job_categories as string[]) ?? [];
    if (!job.job_category && cats.length > 0) {
      job.job_category = cats[0];
    }
  }

  console.log(`[api/extract] → ${mergedJobs.length} total jobs (AI: ${aiJobs.length}, rule: ${ruleJobs.length})`);

  return NextResponse.json({
    jobs: mergedJobs,
    provider,
    extraction_method: provider,
  });
}
