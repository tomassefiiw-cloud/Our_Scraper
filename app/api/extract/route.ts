/**
 * POST /api/extract — extract jobs from a raw Telegram message.
 * v4 - Follows ALL deep links, extracts company from URLs, handles OCR
 */

import { NextResponse } from 'next/server';
import { extractJobs } from '@/lib/extractor';
import { extractJobsRuleBased } from '@/lib/rule-extractor';
import { getChannelConfig } from '@/lib/channels';
import { extractFromUrl } from '@/lib/deep-link-ocr';
import { followDeepLink, enrichJobWithDeepLink, detectCategories } from '@/lib/deep-link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hasAiProvider(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY ||
    process.env.MISTRAL_API_KEY || process.env.GROQ_API_KEY ||
    process.env.CEREBRAS_API_KEY || process.env.OPENROUTER_API_KEY ||
    process.env.KIMI_API_KEY || process.env.OLLAMA_URL);
}

function extractCompanyFromUrl(urls: string[]): string | null {
  for (const url of urls) {
    try {
      const host = new URL(url).hostname.replace('www.', '');
      if (host.includes('t.me') || host.includes('facebook') || host.includes('linkedin') || host.includes('twitter')) continue;
      // Known job domains - extract company from subdomain or path
      const knownDomains = ['ethiojobs.net', 'geezjobs.com', 'harmeejobs.com', 'elelanjobs.com', 
        'kebenajobs.com', 'effoysira.com', 'afriworket.com', 'hahujobs.com', 'ethiojobshub.com'];
      
      // For known job sites, the company is often in the URL path or subdomain
      if (knownDomains.some(d => host.includes(d))) {
        // Try to extract from path
        const pathParts = url.split('/');
        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          if (part && part.length > 2 && part.length < 50 && !part.includes('.') && !part.includes('?')) {
            const company = part.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            // Filter out generic terms
            if (!['Job', 'Jobs', 'Vacancy', 'Apply', 'Details', 'View', 'Index', 'Default'].includes(company)) {
              return company;
            }
          }
        }
      }
      
      // Generic: extract from domain
      const parts = host.split('.');
      if (parts.length >= 2) {
        const name = parts[0];
        return name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' ');
      }
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  let body: { channel?: string; message_text?: string; links?: string[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { channel, message_text, links } = body;
  if (!channel || typeof message_text !== 'string') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const config = getChannelConfig(channel);
  if (!config) return NextResponse.json({ error: `Unknown channel: ${channel}` }, { status: 404 });

  console.log(`[api/extract] channel=${channel}, text_len=${message_text.length}, links=${links?.length ?? 0}`);

  // Step 1: Try AI extraction
  let aiJobs: Record<string, unknown>[] = [];
  if (hasAiProvider()) {
    try {
      const result = await extractJobs(message_text, links ?? [], config);
      if (result.jobs.length > 0) {
        aiJobs = result.jobs.map((j) => {
          const catsResult = detectCategories(message_text + ' ' + (j.title ?? ''));
          return { ...j, job_categories: catsResult, _provider: result.provider } as unknown as Record<string, unknown>;
        });
      }
    } catch {}
  }

  // Step 2: Always run rule-based extractor
  let ruleJobs: Record<string, unknown>[] = [];
  try {
    const rj = extractJobsRuleBased(message_text, links ?? [], channel);
    ruleJobs = rj.map((j) => {
      const catsResult = detectCategories(message_text + ' ' + (j.title ?? ''));
      
      // Extract company from URL if missing
      let company = j.company_name;
      if (!company && links && links.length > 0) {
        company = extractCompanyFromUrl(links);
      }

      return { ...j, company_name: company, job_categories: catsResult, _provider: 'rule-based' } as unknown as Record<string, unknown>;
    });
  } catch {}

  // Step 3: Merge AI + Rule-based jobs (dedup by title)
  const titleMap = new Map<string, Record<string, unknown>>();
  for (const job of [...aiJobs, ...ruleJobs]) {
    const key = String(job.title ?? '').toLowerCase().trim();
    const existing = titleMap.get(key);
    if (existing) {
      const existingCats = (existing.job_categories as string[]) ?? [];
      const newCats = (job.job_categories as string[]) ?? [];
      existing.job_categories = [...new Set([...existingCats, ...newCats])];
      // Prefer non-null company
      if (!existing.company_name && job.company_name) existing.company_name = job.company_name;
    } else {
      titleMap.set(key, { ...job });
    }
  }
  const mergedJobs = Array.from(titleMap.values());

  // Step 4: FOLLOW ALL DEEP LINKS — visit each URL to get full details
  const jobUrls = (links ?? []).filter((url: string) => {
    try {
      const host = new URL(url).hostname;
      return !host.includes('t.me') && !host.includes('tg://');
    } catch { return false; }
  });

  if (jobUrls.length > 0) {
    console.log(`[api/extract] Following ${jobUrls.length} deep links for REAL job data...`);
    
    for (const deepUrl of jobUrls.slice(0, 3)) { // Follow up to 3 links
      try {
        // Try OCR-powered extraction first (handles all sites)
        const ocrResult = await extractFromUrl(deepUrl);
        
        if (ocrResult.success) {
          console.log(`[api/extract] Deep link OK: company="${ocrResult.company}", ${ocrResult.positions.length} positions`);
          
          // If OCR/Site found REAL company, update all jobs (only if message didn't have one)
          if (ocrResult.company) {
            const knownSites = ['Ethiojobs', 'Elelana', 'Harmee', 'Geezjobs', 'Effoysira', 'Hahujobs', 'Afriwork', 'Josad'];
            // Only override if it's a real company name, not a generic job site domain
            if (!knownSites.some(site => ocrResult.company?.includes(site))) {
              const msgHasCompany = mergedJobs.some(j => j.company_name && !knownSites.some(s => String(j.company_name).includes(s)));
              if (!msgHasCompany) {
                for (const job of mergedJobs) {
                  job.company_name = ocrResult.company;
                }
              }
            }
          }
          
          // If OCR found positions, add them as separate jobs
          if (ocrResult.positions.length > 0) {
            for (const pos of ocrResult.positions) {
              const key = pos.toLowerCase().trim();
              if (!titleMap.has(key)) {
                const cats = detectCategories(pos + ' ' + (ocrResult.fullText || ''));
                const newJob = {
                  title: pos,
                  company_name: ocrResult.company || mergedJobs[0]?.company_name || extractCompanyFromUrl([deepUrl]),
                  description: ocrResult.fullText?.slice(0, 2000) || '',
                  job_categories: cats,
                  deadline: ocrResult.deadline,
                  salary_text: ocrResult.salary,
                  location: ocrResult.location,
                  requirements: ocrResult.qualifications,
                  how_to_apply: ocrResult.howToApply,
                  source_url: deepUrl,
                  extraction_method: 'deep_link',
                  _provider: 'deep-link',
                  job_category: cats[0] || 'other',
                } as Record<string, unknown>;
                mergedJobs.push(newJob);
                titleMap.set(key, newJob);
              }
            }
          }
          
          // Update first job with full description
          if (mergedJobs.length > 0 && ocrResult.fullText) {
            mergedJobs[0].description = ocrResult.fullText.slice(0, 3000);
            mergedJobs[0].source_url = deepUrl;
            if (ocrResult.qualifications.length > 0) {
              mergedJobs[0].requirements = ocrResult.qualifications;
            }
          }
        }
      } catch (err) {
        console.warn(`[api/extract] Deep link failed for ${deepUrl}:`, (err as Error).message);
      }
    }
  }

  // Ensure every job has a company name (never channel name)
  for (const job of mergedJobs) {
    if (!job.company_name && links && links.length > 0) {
      job.company_name = extractCompanyFromUrl(links);
    }
    if (!job.company_name) {
      job.company_name = null; // Keep null - feed will show "Company not specified"
    }
    // Ensure job_categories exists
    if (!job.job_categories) {
      const cats = detectCategories(String(job.title ?? '') + ' ' + String(job.description ?? ''));
      job.job_categories = cats;
    }
  }

  const provider = aiJobs.length > 0 ? 'ai+rule+deep-link' : 'rule+deep-link';
  console.log(`[api/extract] → ${mergedJobs.length} total jobs`);

  return NextResponse.json({ jobs: mergedJobs, provider, extraction_method: 'deep_link_enhanced' });
}
