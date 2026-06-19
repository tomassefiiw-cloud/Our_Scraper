/**
 * Rule-based job extractor — v2, much more lenient and reliable.
 *
 * Returns jobs for ANY message that looks like a job posting, even with
 * minimal structure. Much more forgiving than v1.
 *
 * Key improvements:
 * - No minimum text length (prevents false empty returns)
 * - Lenient title detection — any line that isn't a label/section header
 * - Aggressive company name extraction from many patterns
 * - Extracts from Amharic messages too
 * - Always extracts something from any message with job-like keywords
 */

import type { ExtractedJob } from './extractor';
import { ETHIOPIAN_CITIES, ADDIS_ABABA_AREAS } from './channels';

// Common Ethiopian company suffixes
const COMPANY_SUFFIX = /\b(?:PLC|P\.L\.C\.|SC|S\.C\.|LLC|L\.L\.C\.|Inc|Ltd|Corp|SA|Group|Holding|Trading|Enterprise|Enterprises|Industries|Technologies?)\b/i;

// Job keywords that suggest this is a job posting
const JOB_KEYWORDS = /\b(hiring|vacancy|vacancies|job|career|position|cv|resume|applicant|recruit|deadline|salary|experience|qualification|requirement|apply|ስራ|ቅጥር|ምልመላ|ክፍት|ቦታ)\b/i;

// Job title keywords - words that commonly start job titles
const TITLE_KEYWORDS = /\b(officer|manager|director|supervisor|coordinator|specialist|analyst|assistant|associate|engineer|technician|representative|consultant|admin|secretary|clerk|cashier|accountant|auditor|developer|designer|nurse|doctor|teacher|driver|operator|agent|advisor|trainer|instructor|chief|lead|head|senior|junior|intern)\b/i;

export function extractJobsRuleBased(
  messageText: string,
  links: string[],
  channelUsername: string,
): ExtractedJob[] {
  if (!messageText || messageText.trim().length < 10) return [];

  const text = messageText.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Check if this looks like a job posting at all
  const hasJobKeywords = JOB_KEYWORDS.test(text);
  const hasTitleKeyword = TITLE_KEYWORDS.test(text);
  const hasNumberedPositions = lines.filter((l) => /^\d+[\.\)]\s+\S/.test(l)).length >= 2;

  // If it doesn't look like a job at all, still try to extract something
  // (being too strict is worse than extracting noise)
  if (!hasJobKeywords && !hasTitleKeyword && !hasNumberedPositions && text.length < 100) {
    return [];
  }

  // Detect multi-job messages (numbered position list)
  if (hasNumberedPositions) {
    return extractMultiJobs(text, lines, links, channelUsername);
  }

  const job = extractSingleJob(text, lines, links, channelUsername);
  return job ? [job] : [];
}

function extractSingleJob(
  text: string,
  lines: string[],
  links: string[],
  channelUsername: string,
): ExtractedJob | null {
  // Try to find company name from various patterns
  let company = extractCompany(text, lines, channelUsername);

  // Try to find job title
  let title = extractTitle(text, lines, company);

  // Last resort: use the first substantive line as the title
  if (!title) {
    title = extractFallbackTitle(lines);
  }

  // If we truly can't find anything meaningful, return null
  if (!title && !company && text.length < 30) return null;

  // Use channel as company name if nothing else found
  if (!company) {
    company = channelUsername.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

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
  const url = links.find((l) => !l.includes('t.me') && !l.includes('tg://')) ?? null;

  const requirements = extractBulletList(text, ['requirement', 'qualification', 'skill', 'qualifications', 'requirements']);
  const responsibilities = extractBulletList(text, ['responsibilit', 'duty', 'duties', 'role', 'responsibilities']);
  const description = text.length > 200 ? text.slice(0, 1500) : text;
  const howToApply = extractHowToApply(text, links);

  const category = guessCategory(text + ' ' + hashtags.join(' '), title ?? '');

  return {
    title,
    title_amharic: extractAmharic(title ?? '') || null,
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
    confidence: 0.55,
  };
}

function extractMultiJobs(
  text: string,
  lines: string[],
  links: string[],
  channelUsername: string,
): ExtractedJob[] {
  const company = extractCompany(text, lines, channelUsername) || channelUsername.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const jobs: ExtractedJob[] = [];
  const hashtags = extractHashtags(text);
  const commonDeadline = extractDeadline(text);
  const commonLocation = extractLocation(text, hashtags);
  const email = extractEmail(text);
  const url = links.find((l) => !l.includes('t.me') && !l.includes('tg://')) ?? null;

  for (const line of lines) {
    const match = line.match(/^\d+[\.\)]\s+(.+)$/);
    if (!match) continue;
    const title = match[1].trim().replace(/[-–—:]\s*$/, '').replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '');
    if (title.length < 3) continue;

    jobs.push({
      title,
      title_amharic: extractAmharic(title) || null,
      company_name: company,
      company_name_amharic: null,
      job_category: guessCategory(text + ' ' + hashtags.join(' '), title),
      employment_type: extractEmploymentType(text, hashtags),
      work_type: extractWorkType(text, hashtags),
      min_experience_years: null,
      max_experience_years: null,
      experience_text: null,
      location: commonLocation?.raw ?? null,
      location_city: commonLocation?.city ?? null,
      location_area: commonLocation?.area ?? null,
      is_remote: /\bremote\b/i.test(text),
      salary_text: null,
      salary_min_etb: null,
      salary_max_etb: null,
      description: text,
      requirements: [],
      responsibilities: [],
      how_to_apply: null,
      application_link: url,
      application_email: email,
      deadline: commonDeadline ? formatDate(commonDeadline) : null,
      is_closed: false,
      is_vague: false,
      confidence: 0.5,
    });
  }
  return jobs;
}

// --- Field extractors ---

function extractTitle(text: string, lines: string[], company: string | null): string | null {
  // Labeled title patterns
  const labeled = text.match(/(?:^|\n)\s*(?:Position|Job\s*Title|Title|Vacancy|Role|Position Title)\s*[:–\-]\s*(.+?)$/im);
  if (labeled) return cleanTitle(labeled[1]);

  // "Title at Company" pattern
  if (company) {
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const atPattern = text.match(new RegExp(`(.+?)\\s+(?:at|@|-|–|—)\\s+${escaped}`, 'i'));
    if (atPattern) {
      return cleanTitle(atPattern[1].split(/\n/).pop()!.trim());
    }
  }

  // Try each line as potential title
  for (const line of lines) {
    const cleaned = line.replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '');
    if (cleaned.length < 3 || cleaned.length > 150) continue;
    
    // Skip lines that are labels, dates, URLs, or hashtag-only
    if (/^(deadline|company|location|how to|requirements?|qualification|salary|experience|employment|job summary|overview|about|responsibilit|job category|work type|apply|note|ማሳሰቢያ|ቀነ|ቦታ|ድርጅት|ደሞዝ|ልምድ|መመዘኛ|ኃላፊነት)/i.test(cleaned)) continue;
    if (/^\d+[\s\-]*(days|months|years)/i.test(cleaned)) continue;
    if (/^https?:\/\//i.test(cleaned)) continue;
    if (/^#\w+/.test(cleaned) && !TITLE_KEYWORDS.test(cleaned)) continue;
    if (/^\d+[\.\)]\s+\S/.test(cleaned)) continue;

    // Looks like a job title
    if (TITLE_KEYWORDS.test(cleaned) || /\b(job|vacancy|position|hiring|opportunity)\b/i.test(cleaned) || cleaned.length < 100) {
      return cleanTitle(cleaned);
    }
  }

  return null;
}

function extractFallbackTitle(lines: string[]): string | null {
  for (const line of lines) {
    const cleaned = line.replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '');
    if (cleaned.length > 5 && cleaned.length < 150 && !/^https?:\/\//.test(cleaned)) {
      return cleanTitle(cleaned);
    }
  }
  return lines[0]?.replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '').slice(0, 150) ?? null;
}

function cleanTitle(s: string): string {
  return s.replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function extractCompany(text: string, lines: string[], channelUsername: string): string | null {
  // "Company: X"
  const labeled = text.match(/(?:^|\n)\s*(?:Company\s*Name|Company|Organization|Organisation|Employer|Firm)\s*[:–\-]\s*(.+?)$/im);
  if (labeled) return cleanName(labeled[1]);

  // "X is hiring" / "X Job Vacancy"
  const hiring = text.match(/(.+?)\s+(?:is hiring|Job Vacancy|Vacancy|vacancies|hiring for|would like to invite)\s*/i);
  if (hiring) return cleanName(hiring[1].split(/\n/).pop()!.trim());

  // "at X" pattern
  const atMatch = text.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*\(|,|\s*–|\s*-|\s*Deadline|\s*$)/i);
  if (atMatch) return cleanName(atMatch[1]);

  // Line ending with company suffix
  for (const line of lines.slice(0, 8)) {
    if (COMPANY_SUFFIX.test(line) && line.length < 120 && line.length > 5) {
      return cleanName(line);
    }
  }

  // "Verified Company" pattern (freelance_ethio)
  const verified = text.match(/Verified Company\s*[:–\s]*\s*(.+?)(?:\n|$)/i);
  if (verified) return cleanName(verified[1]);

  // Try to find capitalized multi-word line that looks like a company
  for (const line of lines.slice(0, 5)) {
    if (/^[A-Z][a-zA-Z\s&.]{3,60}$/.test(line.trim()) && !TITLE_KEYWORDS.test(line) && !/^(deadline|location|company|how|job|vacancy|position)/i.test(line)) {
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
    /Deadline\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /Apply\s*by\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /Closes?\s*(?:on|by)?\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /Last\s*(?:date|day)\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /Closing\s*(?:Date|Day)\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /Due\s*(?:Date)?\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /ቀነ[:\s]*ግዜ\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /緿ጫሪያ\s*(?:ቀን)\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().replace(/[.,;]+$/, '').slice(0, 50);
  }
  return null;
}

function extractLocation(text: string, hashtags: string[]): { raw: string; city: string | null; area: string | null } | null {
  const patterns = [
    /(?:^|\n)\s*(?:Location|Place of Work|Work Location|Job Location|Address|Workplace)\s*[:–\-]\s*(.+?)$/im,
    /📍\s*(.+?)$/m,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const raw = m[1].trim().slice(0, 200);
      const city = ETHIOPIAN_CITIES.find((c) => raw.toLowerCase().includes(c.toLowerCase())) || null;
      const area = city === 'Addis Ababa' ? ADDIS_ABABA_AREAS.find((a) => raw.toLowerCase().includes(a.toLowerCase())) || null : null;
      return { raw, city, area };
    }
  }

  // Try hashtags
  for (const tag of hashtags) {
    const cleaned = tag.replace(/_/g, ' ');
    const city = ETHIOPIAN_CITIES.find((c) => c.toLowerCase() === cleaned.toLowerCase());
    if (city) return { raw: city, city, area: null };
    const area = ADDIS_ABABA_AREAS.find((a) => a.toLowerCase() === cleaned.toLowerCase());
    if (area) return { raw: `Addis Ababa, ${area}`, city: 'Addis Ababa', area };
  }

  // Look for city names in text
  for (const city of ETHIOPIAN_CITIES) {
    if (text.toLowerCase().includes(city.toLowerCase())) {
      return { raw: city, city, area: null };
    }
  }

  return null;
}

function extractExperience(text: string): { min: number | null; max: number | null; text: string } | null {
  const patterns = [
    /(\d+)\s*[-–]\s*(\d+)\s+years?\s+(?:of\s+)?(?:experience|exp)/i,
    /(\d+)\+?\s+years?\s+(?:of\s+)?(?:experience|exp)/i,
    /experience\s*[:–\-]?\s*(\d+)\s*[-–]?\s*(\d*)\s*years?/i,
    /minimum\s+(?:of\s+)?(\d+)\s+years?/i,
    /(\d+)[\s-]*years?\s+(?:of\s+)?(?:experience|exp)/i,
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
    /salary\s*[:–\-]?\s*(\d[\d,]*)\s*[-–]?\s*(\d[\d,]*)/i,
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
  const kPattern = text.match(/salary\s*[:–\-]?\s*(\d+)k?\s*[-–]\s*(\d+)k\b/i);
  if (kPattern) {
    return { min: parseInt(kPattern[1], 10) * 1000, max: parseInt(kPattern[2], 10) * 1000, text: kPattern[0].trim() };
  }
  return null;
}

function extractEmploymentType(text: string, hashtags: string[]): string | null {
  if (/\b(full[-\s]?time|permanent)\b/i.test(text)) return 'full-time';
  if (/\bpart[-\s]?time\b/i.test(text)) return 'part-time';
  if (/\bcontract(?:ual)?\b/i.test(text)) return 'contract';
  if (/\bfreelance\b/i.test(text)) return 'freelance';
  if (/\bintern(ship)?\b/i.test(text)) return 'internship';
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
  if (/\bhybrid\b/i.test(text) || hashtags.includes('hybrid')) return 'hybrid';
  if (/\bonsite|on[-\s]?site\b/i.test(text)) return 'onsite';
  if (/\bremote\b/i.test(text) || hashtags.includes('remote')) return 'remote';
  return null;
}

function extractHashtags(text: string): string[] {
  return (text.match(/#([a-zA-Z0-9_]+)/g) ?? []).map((m) => m.slice(1));
}

function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : null;
}

function extractBulletList(text: string, sectionKeywords: string[]): string[] {
  const keywordPattern = sectionKeywords.join('|');
  const sectionRegex = new RegExp(`(?:^|\\n)\\s*(?:${keywordPattern})\\s*[:–\\-]?\\s*\\n`, 'i');
  const match = text.match(sectionRegex);
  if (match?.index === undefined) return [];

  const rest = text.slice(match.index + match[0].length);
  const lines = rest.split(/\r?\n/);
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[A-Z][a-zA-Z\s]{2,30}:\s*$/.test(trimmed)) break;
    const bullet = trimmed.match(/^(?:[-•*●○◆■□✅▶▷➤»>]+)\s*(.+)$/);
    if (bullet) {
      items.push(bullet[1].trim());
    } else if (/^[a-z]\)/i.test(trimmed) || /^\d+[\.\)]/.test(trimmed)) {
      items.push(trimmed.replace(/^[a-z\d][\.\)]\s*/i, '').trim());
    } else if (items.length > 0 && trimmed.length < 200) {
      items[items.length - 1] += ' ' + trimmed;
    }
  }
  return items.slice(0, 20);
}

function extractHowToApply(text: string, links: string[]): string | null {
  const m = text.match(/How\s+to\s+Apply\s*[:–\-]?\s*\n((?:.+\n?){1,5})/i);
  return m ? m[1].trim().slice(0, 500) : null;
}

function guessCategory(text: string, title: string): string {
  const combined = (text + ' ' + title).toLowerCase();
  const categories: Record<string, string[]> = {
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
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some((kw) => combined.includes(kw))) return cat;
  }
  return 'other';
}

function extractAmharic(text: string): string | null {
  const amharic = text.match(/[\u1200-\u137F]+[\s\u1200-\u137F]*[\u1200-\u137F]+/);
  return amharic ? amharic[0].trim().slice(0, 200) : null;
}

function formatDate(dateStr: string): string | null {
  const s = dateStr.trim().replace(/[.,]/g, '');
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december','jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  let m = s.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const idx = months.findIndex((mo) => mo.toLowerCase() === m![1].toLowerCase());
    if (idx >= 0) {
      const mn = (idx % 12) + 1;
      return `${m[3]}-${String(mn).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    }
  }
  m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (m) {
    const idx = months.findIndex((mo) => mo.toLowerCase() === m![2].toLowerCase());
    if (idx >= 0) {
      const mn = (idx % 12) + 1;
      return `${m[3]}-${String(mn).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
  }
  m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  return null;
}
