/**
 * Deep Link Navigator — extracts job data from source websites via HTML parsing.
 * Visits job listing URLs and extracts company name, positions, qualifications.
 */

export interface DeepLinkResult {
  success: boolean;
  fullText: string;
  company: string | null;
  positions: string[];
  experience: string | null;
  qualifications: string[];
  deadline: string | null;
  salary: string | null;
  location: string | null;
  howToApply: string | null;
  error?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Extract job details from a URL by parsing its HTML content.
 */
export async function extractFromUrl(url: string): Promise<DeepLinkResult> {
  console.log(`[deep-link] Extracting from: ${url.slice(0, 80)}...`);

  const html = await fetchPage(url);
  if (!html || html.length < 100) {
    return { success: false, fullText: '', company: null, positions: [], experience: null, qualifications: [], deadline: null, salary: null, location: null, howToApply: null, error: 'Page empty or blocked' };
  }

  const result = extractFromHtml(html, url);
  console.log(`[deep-link] Result: company="${result.company}", ${result.positions.length} positions, ${result.fullText.length} chars`);
  return result;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,am;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractFromHtml(html: string, url: string): DeepLinkResult {
  const text = cleanHtml(html);
  const result: DeepLinkResult = {
    success: true, fullText: text, company: null, positions: [], experience: null,
    qualifications: [], deadline: null, salary: null, location: null, howToApply: null,
  };

  // 1. JSON-LD structured data (most reliable)
  try {
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLd) {
      const data = JSON.parse(jsonLd[1]);
      result.company = data.hiringOrganization?.name || null;
      if (data.title) result.positions.push(data.title);
      result.deadline = data.validThrough || null;
      result.location = data.jobLocation?.address?.addressLocality || null;
      if (data.baseSalary?.value) {
        const v = data.baseSalary.value;
        result.salary = `${v.minValue || ''}${v.minValue && v.maxValue ? ' - ' : ''}${v.maxValue || ''} ${data.baseSalary.currency || ''}`.trim() || null;
      }
    }
  } catch {}

  // 2. Open Graph meta tags
  if (!result.company) {
    const ogSite = html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/);
    if (ogSite) result.company = ogSite[1];
  }
  
  // 3. Page title
  if (!result.company) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
      const title = titleMatch[1].replace(/ – .*$/, '').replace(/ \| .*$/, '').replace(/ - .*$/, '').trim();
      if (title.length > 2 && title.length < 80) result.company = title;
    }
  }

  // 4. Company from page content
  if (!result.company) {
    const companyLabels = text.match(/(?:Company|Organization|Employer|Hiring Organization)\s*[:–\-]\s*([A-Z][A-Za-z0-9\s&.]+?)(?:\n|,|$)/i);
    if (companyLabels) result.company = companyLabels[1].trim();
  }
  
  // 5. Extract company from URL domain if still missing
  if (!result.company) {
    try {
      const host = new URL(url).hostname.replace('www.', '');
      const knownSites = ['ethiojobs.net', 'geezjobs.com', 'elelanjobs.com', 'harmeejobs.com', 'effoysira.com', 'hahujobs.com'];
      if (!knownSites.some(s => host.includes(s))) {
        const parts = host.split('.');
        if (parts.length >= 2) {
          result.company = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).replace(/[-_]/g, ' ');
        }
      }
    } catch {}
  }

  // Extract positions
  result.positions = extractPositions(text, html);

  // Extract experience
  const expMatch = text.match(/(\d+)\s*[-–]?\s*(\d*)\s*years?\s+(?:of\s+)?(?:experience|exp)/i);
  if (expMatch) result.experience = expMatch[0].trim();

  // Extract qualifications
  result.qualifications = extractQualifications(text);

  // Extract deadline
  const deadlineMatch = text.match(/(?:Deadline|Closing Date|Apply by|Due Date)\s*[:–\-]?\s*([A-Za-z]+\s+\d+[th,]*\s*\d{4})/i);
  if (deadlineMatch) result.deadline = deadlineMatch[1].trim().replace(/[th,]+/g, '').trim();

  // Extract salary
  const salaryMatch = text.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)\s*(?:ETB|Birr)/i) || text.match(/(\d[\d,]*)\s*(?:ETB|Birr)/i);
  if (salaryMatch) result.salary = salaryMatch[0].trim();

  // Extract location
  const locMatch = text.match(/(?:Location|Place of Work|Work Location|Workplace)\s*[:–\-]\s*([A-Za-z\s]+?)(?:\n|,|$)/i);
  if (locMatch) result.location = locMatch[1].trim();

  // Extract how to apply
  const applySection = text.match(/How to Apply\s*[:–\-]?\s*\n((?:.+\n?){1,10})/i);
  if (applySection) result.howToApply = applySection[1].trim().slice(0, 500);

  return result;
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function extractPositions(text: string, html: string): string[] {
  const positions: string[] = [];

  // 1. Try h1 tag (usually the job title)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const title = cleanHtml(h1Match[1]).trim();
    if (title.length > 3 && title.length < 200 && !/deadline|apply/i.test(title)) {
      positions.push(title);
    }
  }

  // 2. Labeled positions in text
  const labeled = text.matchAll(/(?:Job\s*)?(?:Position|Vacancy|Role|Title)\s*[:–\-]\s*(.+?)(?:\n|$)/gi);
  for (const m of labeled) {
    const pos = m[1].trim();
    if (pos.length > 3 && pos.length < 150 && !positions.includes(pos)) positions.push(pos);
  }

  // 3. Numbered list
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const numMatch = trimmed.match(/^\d+[\.\)]\s+(.+)$/);
    if (numMatch) {
      const pos = numMatch[1].trim();
      if (pos.length > 3 && !positions.includes(pos)) positions.push(pos);
    }
  }

  return positions;
}

function extractQualifications(text: string): string[] {
  const q: string[] = [];
  const lines = text.split('\n');
  let inReqSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { inReqSection = false; continue; }
    if (/(?:Requirements?|Qualifications?|Qualification Criteria|Key Requirements)\s*[:–\-]?$/i.test(trimmed)) {
      inReqSection = true; continue;
    }
    if (inReqSection) {
      if (/^(?:How to Apply|Responsibilities?|Deadline|Salary|Benefits|About|Job Summary)\s*[:–\-]?$/i.test(trimmed)) break;
      const clean = trimmed.replace(/^[•\-*●◆➤▪️\d\.\)\s]+/, '').trim();
      if (clean.length > 5) q.push(clean);
    }
  }

  if (q.length === 0) {
    const eduMatches = text.match(/(?:BA|BSc|MSc|MA|Degree|Diploma|Certificate)\s+in\s+[A-Za-z\s]+/g);
    if (eduMatches) q.push(...eduMatches.map(m => m.trim()));
  }

  return q.slice(0, 15);
}
