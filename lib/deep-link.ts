/**
 * Deep Link Navigator — v1
 *
 * Visits job source websites to extract ACTUAL job descriptions, requirements,
 * and full details instead of just relying on Telegram message text.
 *
 * Supports Ethiopian job sites:
 *   - ethiojobs.net
 *   - harmeejobs.com
 *   - geezjobs.com
 *   - elelanjobs.com / kebenajobs.com
 *   - effoysira.com
 *   - afriworket.com
 *   - hahujobs.com
 *   - ethiojobshub.com
 *
 * Always runs server-side via the API route.
 */

export interface DeepExtractedJob {
  title: string | null;
  description: string | null;
  requirements: string[];
  how_to_apply: string | null;
  application_email: string | null;
  deadline: string | null;
  salary_text: string | null;
  location: string | null;
  company_name: string | null;
  categories: string[];
  employment_type: string | null;
  work_type: string | null;
  experience_text: string | null;
  success: boolean;
  error?: string;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIMEOUT_MS = 12000;

/**
 * Extract job details by following a deep link to the source site.
 * Returns whatever we can parse, with success=false if it fails.
 */
export async function followDeepLink(url: string): Promise<DeepExtractedJob> {
  const domain = extractDomain(url);
  console.log(`[deep-link] following ${domain}: ${url.slice(0, 80)}...`);

  try {
    const html = await fetchPage(url);
    if (!html) {
      return { success: false, error: 'Page fetch returned empty', title: null, description: null, requirements: [], how_to_apply: null, application_email: null, deadline: null, salary_text: null, location: null, company_name: null, categories: [], employment_type: null, work_type: null, experience_text: null };
    }

    // Route to domain-specific parser
    const parser = getParser(domain);
    const result = parser(html, url);
    console.log(`[deep-link] ${domain}: extracted title="${result.title?.slice(0, 50)}", desc=${result.description?.length ?? 0}chars`);
    return result;
  } catch (err) {
    console.warn(`[deep-link] failed for ${url}:`, (err as Error).message);
    return { success: false, error: (err as Error).message, title: null, description: null, requirements: [], how_to_apply: null, application_email: null, deadline: null, salary_text: null, location: null, company_name: null, categories: [], employment_type: null, work_type: null, experience_text: null };
  }
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    return host;
  } catch {
    return 'unknown';
  }
}

type PageParser = (html: string, url: string) => DeepExtractedJob;

function getParser(domain: string): PageParser {
  const parsers: Record<string, PageParser> = {
    'ethiojobs.net': parseEthiojobs,
    'harmeejobs.com': parseHarmeejobs,
    'geezjobs.com': parseGeezjobs,
    'elelanjobs.com': parseGenericJobSite,
    'kebenajobs.com': parseGenericJobSite,
    'effoysira.com': parseGenericJobSite,
    'afriworket.com': parseGenericJobSite,
    'hahujobs.com': parseGenericJobSite,
    'ethiojobshub.com': parseGenericJobSite,
  };
  return parsers[domain] || parseGenericJobSite;
}

/**
 * ethiojobs.net — structured job pages with clear sections
 */
function parseEthiojobs(html: string, url: string): DeepExtractedJob {
  const result = emptyResult();

  // Try to extract JSON-LD structured data first (most reliable)
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd[1]);
      result.title = data.title || null;
      result.description = data.description || data.baseSalary?.description || null;
      result.company_name = data.hiringOrganization?.name || null;
      result.location = data.jobLocation?.address?.addressLocality || data.jobLocation?.address?.streetAddress || null;
      result.deadline = data.datePosted || data.validThrough || null;
      result.employment_type = data.employmentType || null;
      if (data.baseSalary?.value) {
        const val = data.baseSalary.value;
        result.salary_text = `${val.minValue || ''}${val.minValue && val.maxValue ? ' - ' : ''}${val.maxValue || ''} ${data.baseSalary.currency || ''}`.trim() || null;
      }
    } catch { /* ignore */ }
  }

  // Parse description from page content
  if (!result.description) {
    const descEl = extractBySelectors(html, [
      '.job-description', '.description', '#description',
      '.job-detail', '.vacancy-detail', '[class*="content"]',
      'article', 'main',
    ]);
    if (descEl) result.description = cleanText(descEl);
  }

  // Parse requirements from bullet lists
  const reqSection = extractBySelectors(html, [
    '.requirements', '.qualifications', '#requirements',
    '[class*="requirement"]', '[class*="qualification"]',
  ]);
  if (reqSection) {
    result.requirements = extractBullets(reqSection);
  }

  // If no requirements found, try extracting from description
  if (result.requirements.length === 0 && result.description) {
    result.requirements = extractBullets(result.description);
  }

  // Try to detect categories from content
  result.categories = detectCategories(html + (result.title || '') + (result.description || ''));

  // Deadline
  if (!result.deadline) {
    const deadlineMatch = html.match(/deadline[:\s]*([^<.]{5,40})/i);
    if (deadlineMatch) result.deadline = deadlineMatch[1].trim();
  }

  result.success = !!(result.title || result.description);
  return result;
}

/**
 * harmeejobs.com — company page with job listings
 */
function parseHarmeejobs(html: string, url: string): DeepExtractedJob {
  const result = emptyResult();

  // Company name from page title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    result.company_name = titleMatch[1].replace(/ - .*$/, '').replace(/ Jobs.*$/, '').trim();
  }

  // Job listings from the company page
  const jobItems = html.matchAll(/<[^>]*class="[^"]*job[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi);
  const jobs: string[] = [];
  for (const item of jobItems) {
    const text = cleanText(item[1]);
    if (text.length > 5 && text.length < 200) jobs.push(text);
  }

  if (jobs.length > 0) {
    result.title = jobs[0];
    result.description = jobs.join('\n');
  }

  // Detect categories
  result.categories = detectCategories(html + (result.title || '') + (result.description || ''));
  result.success = !!result.title;
  return result;
}

/**
 * geezjobs.com — full job details in clean structure
 */
function parseGeezjobs(html: string, url: string): DeepExtractedJob {
  const result = emptyResult();

  // JSON-LD
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd[1]);
      result.title = data.title || null;
      result.description = data.description || null;
      result.company_name = data.hiringOrganization?.name || null;
      result.location = data.jobLocation?.address?.addressLocality || null;
      result.deadline = data.validThrough || null;
    } catch { /* ignore */ }
  }

  // Fallback: page content
  const content = extractBySelectors(html, [
    '.job-detail', '.job-description', '.single-job',
    '[class*="job"]', 'article', 'main',
  ]);
  if (content) {
    if (!result.description) result.description = cleanText(content);
    result.requirements = extractBullets(content);
  }

  result.categories = detectCategories(html + (result.title || '') + (result.description || ''));
  result.success = !!(result.title || result.description);
  return result;
}

/**
 * Generic parser for any job site — tries common patterns
 */
function parseGenericJobSite(html: string, url: string): DeepExtractedJob {
  const result = emptyResult();

  // Try JSON-LD
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd[1]);
      result.title = data.title || null;
      result.description = data.description || result.description;
      result.company_name = data.hiringOrganization?.name || null;
      result.location = data.jobLocation?.address?.addressLocality || null;
    } catch { /* ignore */ }
  }

  // Try Open Graph / meta tags
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
  if (ogTitle && !result.title) result.title = ogTitle[1];

  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/);
  if (ogDesc && !result.description) result.description = ogDesc[1];

  // Page content
  const content = extractBySelectors(html, [
    '.post-content', '.entry-content', '.content', 'article',
    '[class*="job"]', '[class*="vacancy"]', 'main',
  ]);
  if (content) {
    if (!result.description) result.description = cleanText(content).slice(0, 3000);
    const bullets = extractBullets(content);
    if (bullets.length > 0) result.requirements = bullets;
  }

  // Title from <h1> if missing
  if (!result.title) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) result.title = cleanText(h1[1]);
  }

  result.categories = detectCategories(html + (result.title || '') + (result.description || ''));
  result.success = !!(result.title || result.description);
  return result;
}

// --- Helpers ---

function emptyResult(): DeepExtractedJob {
  return {
    title: null, description: null, requirements: [],
    how_to_apply: null, application_email: null,
    deadline: null, salary_text: null, location: null,
    company_name: null, categories: [],
    employment_type: null, work_type: null,
    experience_text: null, success: false,
  };
}

function extractBySelectors(html: string, selectors: string[]): string | null {
  for (const sel of selectors) {
    // Simple class-based extraction without cheerio
    const className = sel.replace('.', '');
    const regex = new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:div|section|article|main)>`, 'i');
    const match = html.match(regex);
    if (match) return match[1];
  }
  return null;
}

function extractBullets(html: string): string[] {
  const items: string[] = [];
  // Match list items
  const liMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  for (const m of liMatches) {
    const text = cleanText(m[1]);
    if (text.length > 3 && text.length < 500) items.push(text);
  }
  // If no list items, try bullet-like lines
  if (items.length === 0) {
    const text = cleanText(html);
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[•\-*●◆➤]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) {
        const clean = trimmed.replace(/^[•\-*●◆➤\d\.\)\s]+/, '').trim();
        if (clean.length > 5) items.push(clean);
      }
    }
  }
  return items.slice(0, 30);
}

function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect ALL job categories from text content - returns MULTIPLE
 */
export function detectCategories(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  
  const checks: [string, string[]][] = [
    ['tech', ['developer', 'software', 'programmer', 'it ', 'information technology', 'computer', 'data', 'ai', 'ml', 'backend', 'frontend', 'fullstack', 'devops', 'sysadmin', 'network', 'cybersecurity', 'programming', 'coding', 'javascript', 'python', 'java', 'react', 'node', 'database', 'sql']],
    ['health', ['nurse', 'doctor', 'medical', 'health', 'pharma', 'clinic', 'hospital', 'patient', 'pharmacist', 'midwife', 'lab technician', 'radiologist']],
    ['finance', ['accountant', 'finance', 'financial', 'audit', 'banking', 'tax', 'bookkeeper', 'controller', 'budget', 'treasury', 'investment', 'loan', 'credit']],
    ['engineering', ['engineer', 'engineering', 'civil', 'mechanical', 'electrical', 'construction', 'architect', 'surveyor', 'structural']],
    ['marketing', ['marketing', 'social media', 'content', 'seo', 'brand', 'advertis', 'digital marketing', 'communication officer']],
    ['sales', ['sales', 'salesperson', 'account manager', 'business development', 'sales representative', 'merchandiser']],
    ['admin', ['admin', 'assistant', 'secretary', 'receptionist', 'office', 'clerk', 'administrative', 'executive assistant']],
    ['creative', ['designer', 'graphic', 'ui', 'ux', 'creative', 'artist', 'photographer', 'videographer', 'multimedia']],
    ['ngo', ['ngo', 'non-profit', 'humanitarian', 'un ', 'unicef', 'usaid', 'project officer', 'program officer', 'community']],
    ['education', ['teacher', 'instructor', 'professor', 'education', 'trainer', 'academic', 'lecturer', 'school']],
    ['logistics', ['logistics', 'warehouse', 'supply chain', 'driver', 'delivery', 'fleet', 'procurement', 'transport']],
    ['hospitality', ['hotel', 'restaurant', 'chef', 'cook', 'waiter', 'housekeeping', 'hospitality', 'lodge', 'guest house']],
    ['legal', ['lawyer', 'legal', 'attorney', 'compliance', 'regulation']],
    ['hr', ['hr', 'human resource', 'recruitment', 'personnel', 'talent']],
    ['management', ['manager', 'director', 'lead', 'head of', 'chief', 'supervisor', 'coordinator']],
  ];

  for (const [category, keywords] of checks) {
    if (keywords.some(kw => lower.includes(kw))) {
      found.push(category);
    }
  }

  return found.length > 0 ? found : ['other'];
}

/**
 * Enrich a job with deep link data
 */
export function enrichJobWithDeepLink(
  job: Record<string, unknown>,
  deepData: DeepExtractedJob,
): Record<string, unknown> {
  if (!deepData.success) return job;

  return {
    ...job,
    title: (deepData.title && !job.title) ? deepData.title : job.title,
    company_name: (deepData.company_name && !job.company_name) ? deepData.company_name : job.company_name,
    description: deepData.description || job.description,
    requirements: deepData.requirements.length > 0 ? deepData.requirements : (job.requirements ?? []),
    how_to_apply: deepData.how_to_apply || job.how_to_apply,
    application_email: deepData.application_email || job.application_email,
    deadline: deepData.deadline || job.deadline,
    salary_text: deepData.salary_text || job.salary_text,
    location: deepData.location || job.location,
    employment_type: deepData.employment_type || job.employment_type,
    work_type: deepData.work_type || job.work_type,
    experience_text: deepData.experience_text || job.experience_text,
    // Merge categories - union of both
    categories: [...new Set([
      ...(Array.isArray(job.categories) ? job.categories as string[] : []),
      ...deepData.categories,
    ])],
  };
}
