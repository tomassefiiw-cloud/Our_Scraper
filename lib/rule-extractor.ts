/**
 * Rule-based job extractor — zero-cost fallback when no AI provider is configured.
 *
 * Uses regex + heuristics to parse Ethiopian Telegram job messages. Less accurate
 * than LLM extraction (no Amharic translation, no semantic understanding), but:
 *   - 100% free, no API key needed
 *   - Works offline
 *   - Fast (microseconds vs seconds)
 *   - Handles the common patterns in the 12 configured channels
 *
 * Patterns supported (from doc §17):
 *   - "Job Title at Company" / "Company Job Vacancy"
 *   - Deadline: <date>
 *   - Location: <city> / Place of Work: <city>
 *   - Experience: <N>+ years / <N>-<N> years
 *   - Salary: <amount> ETB / Birr
 *   - Employment: full-time, part-time, contract, freelance, internship
 *   - Work type: remote, onsite, hybrid (from hashtags + keywords)
 *   - Apply: <url> / <email>
 *   - Requirements: bullet lists with -, •, *, ✅, ◆ markers
 *   - Hashtags: #fulltime, #remote, #Addis_Ababa, #tech, etc.
 *
 * Returns the same ExtractedJob shape as the AI extractor.
 */

import type { ExtractedJob } from './extractor';
import { JOB_CATEGORIES, ETHIOPIAN_CITIES, ADDIS_ABABA_AREAS } from './channels';

// Common Ethiopian company suffixes — helps detect company name in message
const COMPANY_SUFFIXES = /\b(?:PLC|P\.L\.C\.|SC|S\.C\.|LLC|L\.L\.C\.|Inc|Ltd|Corp|Corporation|Group|Holdings?|Trading|Enterprises?|Industries?|Technologies?|Solutions?|Services?)\b/i;

// Channel-specific known company name patterns
const CHANNEL_COMPANY_HINTS: Record<string, RegExp> = {
  elelanajobs: /^(.+?)\s+(?:is hiring|Job Vacancy|Vacancy|vacancies)/i,
  freelance_ethio: /Verified Company\s*[:\s]*\s*(.+)/i,
  geezjobs_ethiopia: /^Company:\s*(.+?)$/im,
  harmeejobs: /^Company\s*[:\s]\s*(.+?)$/im,
  Maroset: /^Company\s*[:\s]\s*(.+?)$/im,
  effoyjobs: /^Company\s*[:\s]\s*(.+?)$/im,
};

/**
 * Extract structured job data from a raw Telegram message using rules.
 * Returns an empty array if no job detected (e.g. spam, ads).
 */
export function extractJobsRuleBased(
  messageText: string,
  links: string[],
  channelUsername: string,
): ExtractedJob[] {
  if (!messageText || messageText.trim().length < 30) return [];

  // Quick spam/non-job filter — these patterns indicate the message is not a job posting
  const spamPatterns = [
    /\b(giveaway|gift|ስጦታ|promotion|discount|coupon|refer|referral|mec\.me|bit\.ly\/)\b/i,
    /^https?:\/\/\S+$/m, // message is just a URL
  ];
  if (spamPatterns.some((p) => p.test(messageText))) return [];

  const text = messageText.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Detect if this is a multi-job message (numbered position list)
  const numberedPositions = lines.filter((l) => /^\d+[\.\)]\s+\S/.test(l));
  const isMultiJob = numberedPositions.length >= 2;

  if (isMultiJob) {
    return extractMultiJobs(text, lines, links, channelUsername);
  }
  return [extractSingleJob(text, lines, links, channelUsername)].filter(
    (j): j is ExtractedJob => j !== null,
  );
}

function extractSingleJob(
  text: string,
  lines: string[],
  links: string[],
  channelUsername: string,
): ExtractedJob | null {
  const company = extractCompany(text, lines, channelUsername);
  const title = extractTitle(text, lines, company);
  if (!title && !company) return null; // probably not a job posting

  const hashtags = extractHashtags(text);
  const deadline = extractDeadline(text);
  const location = extractLocation(text, hashtags);
  const experience = extractExperience(text);
  const salary = extractSalary(text);
  const employmentType = extractEmploymentType(text, hashtags);
  const workType = extractWorkType(text, hashtags);
  const isRemote = workType === 'remote' || /\bremote\b/i.test(text);
  const isClosed = /\b(closed|hired|expired|filled|deadline passed)\b/i.test(text);
  const email = extractEmail(text);
  const url = links.find((l) => !l.includes('t.me')) ?? null;

  // Requirements — collect bullet-point lines until we hit another section header
  const requirements = extractBulletList(text, ['requirement', 'qualification', 'skill']);
  const responsibilities = extractBulletList(text, ['responsibility', 'duty', 'duties']);
  const description = extractDescription(text);
  const howToApply = extractHowToApply(text);

  const category = guessCategory(text + ' ' + hashtags.join(' '), title ?? '');

  return {
    title,
    title_amharic: extractAmharic(title ?? ''),
    company_name: company,
    company_name_amharic: null,
    job_category: category,
    employment_type: employmentType,
    work_type: workType,
    min_experience_years: experience?.min ?? null,
    max_experience_years: experience?.max ?? null,
    experience_text: experience?.text ?? null,
    location: location?.raw ?? null,
    location_city: location?.city ?? null,
    location_area: location?.area ?? null,
    is_remote: isRemote,
    salary_text: salary?.text ?? null,
    salary_min_etb: salary?.min ?? null,
    salary_max_etb: salary?.max ?? null,
    description,
    requirements,
    responsibilities,
    how_to_apply: howToApply,
    application_link: url,
    application_email: email,
    deadline: deadline ? formatDate(deadline) : null,
    is_closed: isClosed,
    is_vague: !title || !company,
    confidence: 0.6, // rule-based confidence is moderate
  };
}

function extractMultiJobs(
  text: string,
  lines: string[],
  links: string[],
  channelUsername: string,
): ExtractedJob[] {
  const company = extractCompany(text, lines, channelUsername);
  // Each numbered line becomes a separate job (with same company)
  const jobs: ExtractedJob[] = [];
  for (const line of lines) {
    const match = line.match(/^\d+[\.\)]\s+(.+)$/);
    if (!match) continue;
    const title = match[1].trim().replace(/[-–—:]\s*$/, '');
    if (title.length < 3) continue;
    const hashtags = extractHashtags(text);
    const deadline = extractDeadline(text);
    const location = extractLocation(text, hashtags);
    const employmentType = extractEmploymentType(text, hashtags);
    const workType = extractWorkType(text, hashtags);
    const category = guessCategory(text + ' ' + hashtags.join(' '), title);
    const email = extractEmail(text);
    const url = links.find((l) => !l.includes('t.me')) ?? null;
    jobs.push({
      title,
      title_amharic: extractAmharic(title),
      company_name: company,
      company_name_amharic: null,
      job_category: category,
      employment_type: employmentType,
      work_type: workType,
      min_experience_years: null,
      max_experience_years: null,
      experience_text: null,
      location: location?.raw ?? null,
      location_city: location?.city ?? null,
      location_area: location?.area ?? null,
      is_remote: workType === 'remote' || /\bremote\b/i.test(text),
      salary_text: null,
      salary_min_etb: null,
      salary_max_etb: null,
      description: text,
      requirements: [],
      responsibilities: [],
      how_to_apply: null,
      application_link: url,
      application_email: email,
      deadline: deadline ? formatDate(deadline) : null,
      is_closed: false,
      is_vague: false,
      confidence: 0.55,
    });
  }
  return jobs;
}

// --- Field extractors -----------------------------------------------------

function extractTitle(text: string, lines: string[], company: string | null): string | null {
  // Try common patterns:
  // 1. First non-empty line if it looks like a title (no label, short)
  // 2. "Position: X" / "Job Title: X" / "Title: X"
  // 3. "X at Company" / "X - Company"

  const labeled = text.match(/(?:^|\n)\s*(?:Position|Job\s*Title|Title|Vacancy|Role)\s*[:\-]\s*(.+?)$/im);
  if (labeled) {
    return cleanTitle(labeled[1]);
  }

  // "Title at Company" pattern
  if (company) {
    const atPattern = text.match(new RegExp(`(.+?)\\s+(?:at|@|-|–|—)\\s+${escapeRegex(company)}`, 'i'));
    if (atPattern) {
      return cleanTitle(atPattern[1].split(/\n/).pop()!.trim());
    }
  }

  // Try first line as title (often works for elelanajobs, Maroset)
  const firstLine = lines[0] ?? '';
  // Skip lines that are obviously labels or section headers
  const skipPatterns = /^(deadline|company|location|place of work|requirements?|how to apply|employment|salary|experience|position|job title|title|vacancy)/i;
  if (firstLine && !skipPatterns.test(firstLine) && firstLine.length < 200 && !firstLine.endsWith(':')) {
    // Strip leading emojis/markers
    return cleanTitle(firstLine.replace(/^[★🌟✅♦◆■□●•\-\*\s]+/, ''));
  }
  return null;
}

function cleanTitle(s: string): string {
  return s
    .replace(/^[★🌟✅♦◆■□●•\-\*\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function extractCompany(text: string, lines: string[], channelUsername: string): string | null {
  // 1. Channel-specific hint
  const hintRegex = CHANNEL_COMPANY_HINTS[channelUsername];
  if (hintRegex) {
    const m = text.match(hintRegex);
    if (m) return cleanName(m[1]);
  }

  // 2. "Company: X" or "Company Name: X"
  const labeled = text.match(/(?:^|\n)\s*(?:Company\s*Name|Company|Organization|Organisation|Employer)\s*[:\-]\s*(.+?)$/im);
  if (labeled) return cleanName(labeled[1]);

  // 3. "X is hiring" / "X Job Vacancy"
  const hiring = text.match(/(.+?)\s+(?:is hiring|Job Vacancy|Vacancy|vacancies|hiring for)/i);
  if (hiring) return cleanName(hiring[1].split(/\n/).pop()!.trim());

  // 4. Look for a line ending with a company suffix (PLC, SC, etc.)
  for (const line of lines.slice(0, 5)) {
    if (COMPANY_SUFFIXES.test(line) && line.length < 100) {
      return cleanName(line);
    }
  }
  return null;
}

function cleanName(s: string): string {
  return s.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function extractDeadline(text: string): string | null {
  const patterns = [
    /Deadline\s*[:\-]?\s*(.+?)(?:\n|$)/i,
    /Apply\s*by\s*[:\-]?\s*(.+?)(?:\n|$)/i,
    /Closes?\s*(?:on|by)?\s*[:\-]?\s*(.+?)(?:\n|$)/i,
    /Last\s*(?:date|day)\s*[:\-]?\s*(.+?)(?:\n|$)/i,
    /የመጨረሻ\s*ቀን\s*[:\-]?\s*(.+?)(?:\n|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extractLocation(text: string, hashtags: string[]): { raw: string; city: string | null; area: string | null } | null {
  const patterns = [
    /(?:^|\n)\s*(?:Location|Place of Work|Work Location|Job Location|Address)\s*[:\-]\s*(.+?)$/im,
    /📍\s*(.+?)$/m,
  ];
  let raw: string | null = null;
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      raw = m[1].trim();
      break;
    }
  }

  // Try hashtags like #Addis_Ababa, #Bole
  if (!raw) {
    for (const tag of hashtags) {
      const cleaned = tag.replace(/_/g, ' ');
      const city = ETHIOPIAN_CITIES.find((c) => c.toLowerCase() === cleaned.toLowerCase());
      if (city) {
        return { raw: city, city, area: null };
      }
      const area = ADDIS_ABABA_AREAS.find((a) => a.toLowerCase() === cleaned.toLowerCase());
      if (area) {
        return { raw: `Addis Ababa, ${area}`, city: 'Addis Ababa', area };
      }
    }
  }

  if (!raw) return null;

  // Try to match city + area from the raw string
  let city: string | null = null;
  let area: string | null = null;
  for (const c of ETHIOPIAN_CITIES) {
    if (raw.toLowerCase().includes(c.toLowerCase())) {
      city = c;
      break;
    }
  }
  if (city === 'Addis Ababa') {
    for (const a of ADDIS_ABABA_AREAS) {
      if (raw.toLowerCase().includes(a.toLowerCase())) {
        area = a;
        break;
      }
    }
  }
  return { raw: raw.slice(0, 200), city, area };
}

function extractExperience(text: string): { min: number | null; max: number | null; text: string } | null {
  const patterns = [
    /(\d+)\s*[-–]\s*(\d+)\s+years?\s+(?:of\s+)?(?:experience|exp)/i,
    /(\d+)\+?\s+years?\s+(?:of\s+)?(?:experience|exp)/i,
    /experience\s*[:\-]?\s*(\d+)\s*[-–]?\s*(\d*)\s*years?/i,
    /minimum\s+(?:of\s+)?(\d+)\s+years?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const min = m[1] ? parseInt(m[1], 10) : null;
      const max = m[2] ? parseInt(m[2], 10) : null;
      return { min, max, text: m[0].trim() };
    }
  }
  return null;
}

function extractSalary(text: string): { min: number | null; max: number | null; text: string } | null {
  const patterns = [
    /(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)\s*(?:ETB|Birr|br\.?)\b/i,
    /(?:ETB|Birr|br\.?)\s*(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/i,
    /salary\s*[:\-]?\s*(\d[\d,]*)\s*[-–]?\s*(\d[\d,]*)/i,
    /(\d[\d,]*)\s*(?:ETB|Birr)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const min = m[1] ? parseInt(m[1].replace(/,/g, ''), 10) : null;
      const max = m[2] ? parseInt(m[2].replace(/,/g, ''), 10) : null;
      return { min, max, text: m[0].trim() };
    }
  }
  // "Salary: 10k - 18k"
  const kPattern = text.match(/salary\s*[:\-]?\s*(\d+)k?\s*[-–]\s*(\d+)k\b/i);
  if (kPattern) {
    return {
      min: parseInt(kPattern[1], 10) * 1000,
      max: parseInt(kPattern[2], 10) * 1000,
      text: kPattern[0].trim(),
    };
  }
  return null;
}

function extractEmploymentType(text: string, hashtags: string[]): string | null {
  const lower = text.toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ['full-time', /\b(full[\s-]?time|permanent)\b/i],
    ['part-time', /\bpart[\s-]?time\b/i],
    ['contract', /\bcontract(?:ual)?\b/i],
    ['freelance', /\bfreelance\b/i],
    ['internship', /\bintern(ship)?\b/i],
  ];
  for (const [type, regex] of checks) {
    if (regex.test(text)) return type;
  }
  // Check hashtags like #fulltime, #permanent, #contract
  for (const tag of hashtags) {
    const t = tag.toLowerCase();
    if (t === 'fulltime' || t === 'permanent') return 'full-time';
    if (t === 'parttime') return 'part-time';
    if (t === 'contract') return 'contract';
    if (t === 'freelance') return 'freelance';
    if (t === 'internship' || t === 'intern') return 'internship';
  }
  return null;
}

function extractWorkType(text: string, hashtags: string[]): string | null {
  if (/\bremote\b/i.test(text) || hashtags.map((h) => h.toLowerCase()).includes('remote')) {
    return 'remote';
  }
  if (/\bhybrid\b/i.test(text) || hashtags.map((h) => h.toLowerCase()).includes('hybrid')) {
    return 'hybrid';
  }
  if (/\bonsite|on[\s-]?site\b/i.test(text)) {
    return 'onsite';
  }
  return null;
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#([a-zA-Z0-9_]+)/g) ?? [];
  return matches.map((m) => m.slice(1));
}

function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : null;
}

function extractBulletList(text: string, sectionKeywords: string[]): string[] {
  // Find a section header matching one of the keywords, then collect bullet lines
  const keywordPattern = sectionKeywords.join('|');
  const sectionRegex = new RegExp(`(?:^|\\n)\\s*(?:${keywordPattern})s?\\s*[:\\-]?\\s*\\n`, 'i');
  const match = text.match(sectionRegex);
  if (!match?.index) return [];

  const startIdx = match.index + match[0].length;
  const rest = text.slice(startIdx);
  // Stop at the next section header (any "Word:" pattern at start of line)
  const lines = rest.split(/\r?\n/);
  const items: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Stop at next section header
    if (/^[A-Z][a-zA-Z\s]{2,30}:\s*$/.test(trimmed)) break;
    // Strip bullet markers
    const bullet = trimmed.match(/^(?:[-•*●○◆■□✅▶▷➤»>]+)\s*(.+)$/);
    if (bullet) {
      items.push(bullet[1].trim());
    } else if (/^[a-z]\)/i.test(trimmed) || /^\d+[\.\)]/.test(trimmed)) {
      // Numbered or lettered list
      items.push(trimmed.replace(/^[a-z\d][\.\)]\s*/i, '').trim());
    } else if (items.length > 0 && trimmed.length < 200) {
      // Continuation of previous item
      items[items.length - 1] += ' ' + trimmed;
    }
  }
  return items.slice(0, 20);
}

function extractDescription(text: string): string | null {
  // Try to find "Job Summary" or "Overview" or "Description" section
  const patterns = [
    /(?:Job\s*Summary|Overview|Description|About\s+the\s+(?:Role|Job|Position))\s*[:\-]?\s*\n((?:.+\n?){1,10})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, 2000);
  }
  // Fallback: first 500 chars of the message (minus any labeled first line)
  return text.slice(0, 1000);
}

function extractHowToApply(text: string): string | null {
  const m = text.match(/How\s+to\s+Apply\s*[:\-]?\s*\n((?:.+\n?){1,5})/i);
  return m ? m[1].trim().slice(0, 500) : null;
}

function guessCategory(text: string, title: string): string {
  const combined = (text + ' ' + title).toLowerCase();
  const categoryKeywords: Record<string, string[]> = {
    tech: ['developer', 'software', 'programmer', 'it ', 'information technology', 'computer', 'data', 'ai', 'ml', 'backend', 'frontend', 'fullstack', 'devops', 'sysadmin', 'network', 'cybersecurity', 'tech'],
    health: ['nurse', 'doctor', 'medical', 'health', 'pharma', 'clinic', 'hospital', 'patient'],
    finance: ['accountant', 'finance', 'financial', 'audit', 'banking', 'tax', 'bookkeeper'],
    engineering: ['engineer', 'engineering', 'civil', 'mechanical', 'electrical', 'construction'],
    marketing: ['marketing', 'social media', 'content', 'seo', 'brand', 'advertis'],
    sales: ['sales', 'salesperson', 'account manager', 'business development'],
    admin: ['admin', 'assistant', 'secretary', 'receptionist', 'office', 'clerk'],
    creative: ['designer', 'graphic', 'ui', 'ux', 'creative', 'artist', 'photographer'],
    ngo: ['ngo', 'non-profit', 'humanitarian', 'un ', 'unicef', 'usaid', 'project officer'],
    education: ['teacher', 'instructor', 'professor', 'education', 'trainer', 'academic'],
    logistics: ['logistics', 'warehouse', 'supply chain', 'driver', 'delivery', 'fleet'],
    hospitality: ['hotel', 'restaurant', 'chef', 'cook', 'waiter', 'housekeeping', 'hospitality'],
  };
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => combined.includes(kw))) return cat;
  }
  return 'other';
}

function extractAmharic(text: string): string | null {
  // Detect Amharic characters (Unicode range U+1200-U+137F)
  const amharic = text.match(/[\u1200-\u137F]+[\s\u1200-\u137F]*[\u1200-\u137F]+/);
  return amharic ? amharic[0].trim().slice(0, 200) : null;
}

function formatDate(dateStr: string): string | null {
  // Try to parse common date formats and return YYYY-MM-DD
  const s = dateStr.trim().replace(/[.,]/g, '');

  // "July 30, 2026" / "30 July 2026" / "Jul 30 2026"
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthsShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const allMonths = [...months, ...monthsShort];

  // "Month DD, YYYY"
  let m = s.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const monthIdx = allMonths.findIndex((mo) => mo.toLowerCase() === m![1].toLowerCase());
    if (monthIdx >= 0) {
      const monthNum = monthIdx % 12 + 1;
      return `${m[3]}-${String(monthNum).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    }
  }
  // "DD Month YYYY"
  m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (m) {
    const monthIdx = allMonths.findIndex((mo) => mo.toLowerCase() === m![2].toLowerCase());
    if (monthIdx >= 0) {
      const monthNum = monthIdx % 12 + 1;
      return `${m[3]}-${String(monthNum).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    }
  }
  // "YYYY-MM-DD" or "YYYY/MM/DD"
  m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  // "DD/MM/YYYY" or "DD-MM-YYYY"
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
