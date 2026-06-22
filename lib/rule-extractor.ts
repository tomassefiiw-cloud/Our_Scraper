/**
 * Rule-based job extractor — v2, much more lenient and reliable.
 * Returns jobs for ANY message that looks like a job posting.
 */

import type { ExtractedJob } from './extractor';
import { ETHIOPIAN_CITIES, ADDIS_ABABA_AREAS } from './channels';

const COMPANY_SUFFIX = /\b(?:PLC|P\.L\.C\.|SC|S\.C\.|LLC|L\.L\.C\.|Inc|Ltd|Corp|SA|Group|Holding|Trading|Enterprise|Enterprises|Technologies?)\b/i;
const JOB_KEYWORDS = /\b(hiring|vacancy|vacancies|job|career|position|cv|resume|applicant|recruit|deadline|salary|experience|qualification|requirement|apply|ስራ|ቅጥር|ምልመላ|ክፍት|ቦታ)\b/i;
const TITLE_KEYWORDS = /\b(officer|manager|director|supervisor|coordinator|specialist|analyst|assistant|associate|engineer|technician|representative|consultant|admin|secretary|clerk|cashier|accountant|auditor|developer|designer|nurse|doctor|teacher|driver|operator|agent|advisor|trainer|instructor|chief|lead|head|senior|junior|intern)\b/i;

export function extractJobsRuleBased(
  messageText: string,
  links: string[],
  channelUsername: string,
): ExtractedJob[] {
  if (!messageText || messageText.trim().length < 10) return [];
  const text = messageText.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasJobKeywords = JOB_KEYWORDS.test(text);
  const hasTitleKeyword = TITLE_KEYWORDS.test(text);
  const hasNumberedPositions = lines.filter((l) => /^\d+[\.\)]\s+\S/.test(l)).length >= 2;
  if (!hasJobKeywords && !hasTitleKeyword && !hasNumberedPositions && text.length < 100) return [];
  if (hasNumberedPositions) return extractMultiJobs(text, lines, links, channelUsername);
  const job = extractSingleJob(text, lines, links, channelUsername);
  return job ? [job] : [];
}

function extractSingleJob(text: string, lines: string[], links: string[], channelUsername: string): ExtractedJob | null {
  let company = extractCompany(text, lines, channelUsername);
  let title = extractTitle(text, lines, company);
  if (!title) title = extractFallbackTitle(lines);
  if (!title && !company && text.length < 30) return null;
  // Never use channel name as company - leave null so company_name stays null
  const hashtags = extractHashtags(text);
  const deadline = extractDeadline(text);
  const location = extractLocation(text, hashtags);
  const experience = extractExperience(text);
  const salary = extractSalary(text);
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
  // Strip common field labels to avoid false categories
  const cleanText = (text + ' ' + (title ?? '')).replace(/(?:^|\n)\s*(?:Education|Qualification|Experience|Requirement|Responsibility|Deadline|Location|Salary|Company|Employment|Work Type)\s*[:–\-]\s*/gi, '');
  const cats = detectCategories(cleanText);
  return {
    title, title_amharic: extractAmharic(title ?? '') || null,
    company_name: company || extractCompanyFromUrls(links),
    company_name_amharic: null,
    job_category: category,
    job_categories: cats.length > 0 ? cats : [category],
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
    description, requirements, responsibilities,
    how_to_apply: howToApply,
    application_link: url, application_email: email,
    deadline: deadline ? formatDate(deadline) : null,
    is_closed: isClosed, is_vague: !title || !company,
    confidence: 0.55,
    employment_type: null,
  };
}

function extractMultiJobs(text: string, lines: string[], links: string[], channelUsername: string): ExtractedJob[] {
  const company = extractCompany(text, lines, channelUsername) || null;
  const jobs: ExtractedJob[] = [];
  const hashtags = extractHashtags(text);
  const commonDeadline = extractDeadline(text);
  const commonLocation = extractLocation(text, hashtags);
  const email = extractEmail(text);
  const url = links.find((l) => !l.includes('t.me') && !l.includes('tg://')) ?? null;
  for (const line of lines) {
    const match = line.match(/^\d+[\.\)]\s+(.+)$/);
    if (!match) continue;
    let title = match[1].trim().replace(/[-–—:]\s*$/, '').replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '');
    if (title.length < 3) continue;
    const cats = detectCategories(text + ' ' + title);
    jobs.push({
      title, title_amharic: extractAmharic(title) || null,
      company_name: company || extractCompanyFromUrls(links),
      company_name_amharic: null,
      job_category: cats[0] || 'other',
      job_categories: cats.length > 0 ? cats : ['other'],
      employment_type: null, work_type: null,
      min_experience_years: null, max_experience_years: null, experience_text: null,
      location: commonLocation?.raw ?? null,
      location_city: commonLocation?.city ?? null,
      location_area: commonLocation?.area ?? null,
      is_remote: /\bremote\b/i.test(text),
      salary_text: null, salary_min_etb: null, salary_max_etb: null,
      description: text, requirements: [], responsibilities: [],
      how_to_apply: null, application_link: url, application_email: email,
      deadline: commonDeadline ? formatDate(commonDeadline) : null,
      is_closed: false, is_vague: false, confidence: 0.5,
    });
  }
  return jobs;
}

// --- Field extractors ---

function extractTitle(text: string, lines: string[], company: string | null): string | null {
  const labeled = text.match(/(?:^|\n)\s*(?:Position|Job\s*Title|Title|Vacancy|Role|Position Title)\s*[:–\-]\s*(.+?)$/im);
  if (labeled) return cleanTitle(labeled[1]);
  if (company) {
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const atPattern = text.match(new RegExp(`(.+?)\\s+(?:at|@|-|–|—)\\s+${escaped}`, 'i'));
    if (atPattern) return cleanTitle(atPattern[1].split(/\n/).pop()!.trim());
  }
  for (const line of lines) {
    const cleaned = line.replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '');
    if (cleaned.length < 3 || cleaned.length > 150) continue;
    if (/^(deadline|company|location|how to|requirements?|qualification|salary|experience|employment|job summary|overview|about|responsibilit|work type|apply|note|ማሳሰቢያ|ቀነ|ቦታ|ድርጅት|ደሞዝ|ልምድ|መመዘኛ|ኃላፊነት)/i.test(cleaned)) continue;
    if (/^\d+[\s\-]*(days|months|years)/i.test(cleaned)) continue;
    if (/^https?:\/\//i.test(cleaned)) continue;
    if (/^#\w+/.test(cleaned) && !TITLE_KEYWORDS.test(cleaned)) continue;
    if (/^\d+[\.\)]\s+\S/.test(cleaned)) continue;
    if (TITLE_KEYWORDS.test(cleaned) || /\b(job|vacancy|position|hiring|opportunity)\b/i.test(cleaned) || cleaned.length < 100) {
      return cleanTitle(cleaned);
    }
  }
  return null;
}

function extractFallbackTitle(lines: string[]): string | null {
  for (const line of lines) {
    const cleaned = line.replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '');
    if (cleaned.length > 5 && cleaned.length < 150 && !/^https?:\/\//.test(cleaned)) return cleanTitle(cleaned);
  }
  return lines[0]?.replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '').slice(0, 150) ?? null;
}

function cleanTitle(s: string): string {
  return s.replace(/^[★🌟✅♦◆■□●•\-*\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function extractCompany(text: string, lines: string[], channelUsername: string): string | null {
  const labeled = text.match(/(?:^|\n)\s*(?:Company\s*Name|Company|Organization|Organisation|Employer|Firm)\s*[:–\-]\s*(.+?)$/im);
  if (labeled) return cleanName(labeled[1]);
  const hiring = text.match(/([A-Z][A-Za-z0-9\s&.]+?)\s+(?:is hiring|Job Vacancy|Vacancy|vacancies|hiring for|would like to invite)\s*/i);
  if (hiring) {
    const name = cleanName(hiring[1].split(/\n/).pop()!.trim());
    const genericWords = ['Job', 'Jobs', 'Vacancy', 'Vacancies', 'Position', 'Positions', 'Career', 'Careers'];
    if (!genericWords.some(w => name.toLowerCase() === w.toLowerCase() || name.toLowerCase().startsWith(w.toLowerCase() + ' '))) {
      return name;
    }
  }
  const atMatch = text.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*\(|,|\s*–|\s*-|\s*Deadline|\s*$)/i);
  if (atMatch) return cleanName(atMatch[1]);
  for (const line of lines.slice(0, 8)) {
    if (COMPANY_SUFFIX.test(line) && line.length < 120 && line.length > 5) return cleanName(line);
  }
  const verified = text.match(/Verified Company\s*[:–\s]*\s*(.+?)(?:\n|$)/i);
  if (verified) return cleanName(verified[1]);
  for (const line of lines.slice(0, 5)) {
    if (/^[A-Z][a-zA-Z\s&.]{3,60}$/.test(line.trim()) && !TITLE_KEYWORDS.test(line) && !/^(deadline|location|company|how|job|vacancy|position)/i.test(line)) return cleanName(line);
  }
  return null;
}

function cleanName(s: string): string { return s.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100); }

function extractDeadline(text: string): string | null {
  const patterns = [
    /Deadline\s*[:–\-]?\s*(.+?)(?:\n|$)/i, /Apply\s*by\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /Closes?\s*(?:on|by)?\s*[:–\-]?\s*(.+?)(?:\n|$)/i, /Last\s*(?:date|day)\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /Closing\s*(?:Date|Day)\s*[:–\-]?\s*(.+?)(?:\n|$)/i, /Due\s*(?:Date)?\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
    /ቀነ[:\s]*ግዜ\s*[:–\-]?\s*(.+?)(?:\n|$)/i,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1].trim().replace(/[.,;]+$/, '').slice(0, 50); }
  return null;
}

function extractLocation(text: string, hashtags: string[]): { raw: string; city: string | null; area: string | null } | null {
  const patterns = [/(?:^|\n)\s*(?:Location|Place of Work|Work Location|Job Location|Address|Workplace)\s*[:–\-]\s*(.+?)$/im, /📍\s*(.+?)$/m];
  for (const p of patterns) { const m = text.match(p); if (m) { const raw=m[1].trim().slice(0,200); const city=ETHIOPIAN_CITIES.find((c)=>raw.toLowerCase().includes(c.toLowerCase()))||null; const area=city==='Addis Ababa'?ADDIS_ABABA_AREAS.find((a)=>raw.toLowerCase().includes(a.toLowerCase()))||null:null; return {raw,city,area}; } }
  for (const tag of hashtags) { const cleaned=tag.replace(/_/g,' '); const city=ETHIOPIAN_CITIES.find((c)=>c.toLowerCase()===cleaned.toLowerCase()); if(city) return {raw:city,city,area:null}; const area=ADDIS_ABABA_AREAS.find((a)=>a.toLowerCase()===cleaned.toLowerCase()); if(area) return {raw:`Addis Ababa, ${area}`,city:'Addis Ababa',area}; }
  for (const city of ETHIOPIAN_CITIES) { if(text.toLowerCase().includes(city.toLowerCase())) return {raw:city,city,area:null}; }
  return null;
}

function extractExperience(text: string): { min: number | null; max: number | null; text: string } | null {
  const patterns = [/(\d+)\s*[-–]\s*(\d+)\s+years?\s+(?:of\s+)?(?:experience|exp)/i, /(\d+)\+?\s+years?\s+(?:of\s+)?(?:experience|exp)/i, /experience\s*[:–\-]?\s*(\d+)\s*[-–]?\s*(\d*)\s*years?/i, /minimum\s+(?:of\s+)?(\d+)\s+years?/i, /(\d+)[\s-]*years?\s+(?:of\s+)?(?:experience|exp)/i];
  for (const p of patterns) { const m=text.match(p); if(m) { const min=m[1]?parseInt(m[1],10):null; const max=m[2]?parseInt(m[2],10):null; return {min,max,text:m[0].trim()}; } }
  return null;
}

function extractSalary(text: string): { min: number | null; max: number | null; text: string } | null {
  // 1. Try range: X - Y ETB (MUST be first to avoid partial match)
  let m = text.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)\s*(?:ETB|Birr|br\.?)\b/i);
  if (m) return { min: parseInt(m[1].replace(/,/g,''),10), max: parseInt(m[2].replace(/,/g,''),10), text: m[0].trim() };
  // 2. Range: ETB X - Y  
  m = text.match(/(?:ETB|Birr|br\.?)\s*(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/i);
  if (m) return { min: parseInt(m[1].replace(/,/g,''),10), max: parseInt(m[2].replace(/,/g,''),10), text: m[0].trim() };
  // 3. salary: X - Y
  m = text.match(/salary\s*[:–\-]?\s*(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/i);
  if (m) return { min: parseInt(m[1].replace(/,/g,''),10), max: parseInt(m[2].replace(/,/g,''),10), text: m[0].trim() };
  // 4. Single: X ETB
  m = text.match(/(\d[\d,]*)\s*(?:ETB|Birr|br\.?)\b/i);
  if (m) return { min: parseInt(m[1].replace(/,/g,''),10), max: null, text: m[0].trim() };
  // 5. salary: X
  m = text.match(/salary\s*[:–\-]?\s*(\d[\d,]*?)(?:\s*(?:ETB|Birr))?(?:\n|$)/i);
  if (m) return { min: parseInt(m[1].replace(/,/g,''),10), max: null, text: m[0].trim() };
  // 6. K-format: 10k - 18k
  m = text.match(/(\d+)k?\s*[-–]\s*(\d+)k\b/i);
  if (m) return { min: parseInt(m[1],10)*1000, max: parseInt(m[2],10)*1000, text: m[0].trim() };
  return null;
}function extractWorkType(text: string, hashtags: string[]): string | null {
  if (/\bhybrid\b/i.test(text) || hashtags.includes('hybrid')) return 'hybrid';
  if (/\bonsite|on[-\s]?site\b/i.test(text)) return 'onsite';
  if (/\bremote\b/i.test(text) || hashtags.includes('remote')) return 'remote';
  return null;
}

function extractHashtags(text: string): string[] { return (text.match(/#([a-zA-Z0-9_]+)/g) ?? []).map((m) => m.slice(1)); }

function extractEmail(text: string): string | null { const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); return m ? m[0] : null; }

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
    if (bullet) { items.push(bullet[1].trim()); }
    else if (/^[a-z]\)/i.test(trimmed) || /^\d+[\.\)]/.test(trimmed)) { items.push(trimmed.replace(/^[a-z\d][\.\)]\s*/i, '').trim()); }
    else if (items.length > 0 && trimmed.length < 200) { items[items.length - 1] += ' ' + trimmed; }
  }
  return items.slice(0, 20);
}

function extractHowToApply(text: string, links: string[]): string | null {
  const m = text.match(/How\s+to\s+Apply\s*[:–\-]?\s*\n((?:.+\n?){1,5})/i);
  return m ? m[1].trim().slice(0, 500) : null;
}

function guessCategory(text: string, title: string): string {
  // Use detectCategories with the FULL text (returns array of all matching)
  const allCats = detectCategories(text + ' ' + title);
  
  // If only one category, that's our answer
  if (allCats.length === 1) return allCats[0];
  if (allCats.length === 0) return 'other';
  
  // Multiple categories: prefer the one that matches more keywords in the TITLE
  const titleLower = (title || '').toLowerCase();
  const textLower = (text || '').toLowerCase();
  
  // Category priority based on TITLE match (primary focus)
  const catPriority = [
    { cat: 'finance', keywords: ['accountant','finance','audit','banking','tax','budget','treasury','credit','loan'] },
    { cat: 'tech', keywords: ['developer','software','programmer','engineer','data','system','network','cyber'] },
    { cat: 'health', keywords: ['nurse','doctor','medical','health','pharma','clinic','hospital'] },
    { cat: 'engineering', keywords: ['civil','mechanical','electrical','construction','architect'] },
    { cat: 'marketing', keywords: ['marketing','social media','brand','advertising','communication'] },
    { cat: 'sales', keywords: ['sales','salesperson','merchandiser'] },
    { cat: 'admin', keywords: ['admin','assistant','secretary','receptionist','clerk','office'] },
    { cat: 'creative', keywords: ['designer','graphic','creative','artist','photographer'] },
    { cat: 'ngo', keywords: ['ngo','humanitarian','community','project officer'] },
    { cat: 'education', keywords: ['teacher','instructor','professor','education','trainer'] },
    { cat: 'logistics', keywords: ['logistics','warehouse','supply chain','driver','delivery'] },
    { cat: 'hospitality', keywords: ['hotel','restaurant','chef','hospitality'] },
    { cat: 'legal', keywords: ['lawyer','legal','attorney','compliance'] },
    { cat: 'hr', keywords: ['hr','human resource','recruitment'] },
    { cat: 'management', keywords: ['manager','director','lead','chief','supervisor'] },
  ];
  
  // Check title first
  for (const {cat, keywords} of catPriority) {
    if (allCats.includes(cat) && keywords.some(kw => titleLower.includes(kw))) {
      return cat;
    }
  }
  
  // Check company/org name second (avoid "Tech" in company name taking priority)
  for (const {cat, keywords} of catPriority) {
    if (allCats.includes(cat) && keywords.some(kw => titleLower.includes(kw))) {
      return cat;
    }
  }
  
  // Return the first valid category
  return allCats[0];
}


export function detectCategories(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const checks: [string, string[]][] = [
    ['tech', ['developer','software','programmer','software engineer','information technology','computer science','data analyst','machine learning','backend developer','frontend developer','fullstack','devops','sysadmin','network engineer','cybersecurity','system administrator','coding','javascript','python','java','sql']],
    ['health', ['nurse','doctor','medical','health','pharma','clinic','hospital','patient','pharmacist','midwife','lab technician']],
    ['finance', ['accountant','finance','financial','audit','banking','tax','bookkeeper','controller','budget','treasury','investment','loan','credit']],
    ['engineering', ['engineer','engineering','civil','mechanical','electrical','construction','architect','surveyor','structural']],
    ['marketing', ['marketing','social media','content','seo','brand','advertis','digital marketing','communication officer']],
    ['sales', ['sales','salesperson','account manager','business development','sales representative','merchandiser']],
    ['admin', ['admin','assistant','secretary','receptionist','office','clerk','administrative','executive assistant']],
    ['creative', ['designer','graphic','ui','ux','creative','artist','photographer','videographer','multimedia']],
    ['ngo', ['ngo','non-profit','humanitarian','un ','unicef','usaid','project officer','program officer','community']],
    ['education', ['teacher','instructor','professor','education','trainer','academic','lecturer','school']],
    ['logistics', ['logistics','warehouse','supply chain','driver','delivery','fleet','procurement','transport']],
    ['hospitality', ['hotel','restaurant','chef','cook','waiter','housekeeping','hospitality','lodge']],
    ['legal', ['lawyer','legal','attorney','compliance','regulation']],
    ['hr', ['hr','human resource','recruitment','personnel','talent']],
    ['management', ['manager','director','lead','head of','chief','supervisor','coordinator']],
  ];
  for (const [category, keywords] of checks) {
    if (keywords.some(kw => { const esc = kw.replace(/\//g, "\\/"); const matched = kw.length <= 3 ? new RegExp("\\b" + esc + "\\b", "i").test(lower) : lower.includes(kw); if (matched && kw === 'education') { return !lower.includes('education:') || lower.includes('education officer') || lower.includes('education sector'); } return matched; })) found.push(category);
  }
  return found.length > 0 ? found : ['other'];
}

function extractAmharic(text: string): string | null {
  const amharic = text.match(/[\u1200-\u137F]+[\s\u1200-\u137F]*[\u1200-\u137F]+/);
  return amharic ? amharic[0].trim().slice(0, 200) : null;
}

/**
 * Extract company name from URLs by looking at domain patterns
 */
function extractCompanyFromUrls(links: string[]): string | null {
  if (!links || links.length === 0) return null;
  for (const url of links) {
    try {
      const host = new URL(url).hostname.replace('www.', '');
      // Skip social media and Telegram
      if (host.includes('t.me') || host.includes('facebook') || host.includes('linkedin')) continue;
      // Extract company from domain
      const parts = host.split('.');
      if (parts.length >= 2) {
        const name = parts[parts.length - 2];
        // Capitalize properly
        return name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' ');
      }
    } catch {}
  }
  return null;
}

function formatDate(dateStr: string): string | null {
  const s = dateStr.trim().replace(/[.,]/g, '');
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december','jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  let m = s.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) { const idx=months.findIndex((mo)=>mo.toLowerCase()===m![1].toLowerCase()); if(idx>=0) { const mn=(idx%12)+1; return `${m[3]}-${String(mn).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`; } }
  m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (m) { const idx=months.findIndex((mo)=>mo.toLowerCase()===m![2].toLowerCase()); if(idx>=0) { const mn=(idx%12)+1; return `${m[3]}-${String(mn).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; } }
  m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  return null;
}
