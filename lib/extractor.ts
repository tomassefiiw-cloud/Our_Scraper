/**
 * Job extractor — uses the AI router to parse raw Telegram messages
 * into structured ExtractedJob[] (doc §6.2).
 */

import { complete } from './ai-router';
import type { ChannelConfig } from './channels';

export interface ExtractedJob {
  title: string | null;
  title_amharic: string | null;
  company_name: string | null;
  company_name_amharic: string | null;
  job_category: string | null;
  job_categories: string[];
  employment_type: string | null;
  work_type: string | null;
  min_experience_years: number | null;
  max_experience_years: number | null;
  experience_text: string | null;
  location: string | null;
  location_city: string | null;
  location_area: string | null;
  is_remote: boolean;
  salary_text: string | null;
  salary_min_etb: number | null;
  salary_max_etb: number | null;
  description: string | null;
  requirements: string[];
  responsibilities: string[];
  how_to_apply: string | null;
  application_link: string | null;
  application_email: string | null;
  deadline: string | null; // YYYY-MM-DD
  is_closed: boolean;
  is_vague: boolean;
  confidence: number;
}

const SYSTEM_PROMPT = `You are JobExtract Pro, an AI specialized in parsing unstructured job postings from Telegram channels in Ethiopia. You understand both English and Amharic job postings. You are precise, conservative in guessing, and always return structured data.`;

function buildPrompt(
  messageText: string,
  links: string[],
  channelConfig: ChannelConfig,
): string {
  return `You are an expert job data extractor. Extract ALL job postings from the following Telegram message.

CHANNEL CONTEXT:
- Channel: ${channelConfig.display_name}
- Type: ${channelConfig.channel_type}
- Multi-job per message: ${channelConfig.multiJobPerMessage ? 'yes' : 'no'}
- Notes: ${channelConfig.notes ?? 'n/a'}

RAW MESSAGE:
${messageText}

LINKS IN MESSAGE:
${links.length > 0 ? links.map((l) => `- ${l}`).join('\n') : '(none)'}

INSTRUCTIONS:
1. Extract EVERY job position mentioned in this message (some messages have multiple jobs).
2. If the message is in Amharic or mixed Amharic/English, extract both languages.
3. If a field is missing, use null — DO NOT guess.
4. For "experience", extract as min_years and max_years. "0-2 years" -> min: 0, max: 2. "5+ years" -> min: 5, max: null.
5. For "deadline", parse to YYYY-MM-DD format. Ethiopian calendar dates: convert to Gregorian.
6. For "location", normalize to: "Addis Ababa", "Jimma", "Hawassa", "Remote", etc.
7. If the message mentions "Closed/Hired" or similar, mark is_closed: true.
8. For "job_category", classify into the PRIMARY category (one of: tech, health, finance, engineering, marketing, sales, admin, creative, ngo, education, logistics, hospitality, legal, hr, management, other).
9. For "job_categories", list ALL applicable categories that apply to this job as an array.
10. If salary is mentioned, extract numeric value in ETB.
11. If the message says "various positions" with no details, set is_vague: true.

OUTPUT FORMAT — JSON array of jobs:
[
  {
    "title": "string",
    "title_amharic": "string or null",
    "company_name": "string",
    "company_name_amharic": "string or null",
    "job_category": "string",
    "job_categories": ["string", "string", ...],
    "employment_type": "full-time|part-time|contract|freelance|internship|null",
    "work_type": "remote|onsite|hybrid|null",
    "min_experience_years": number or null,
    "max_experience_years": number or null,
    "experience_text": "raw text or null",
    "location": "string or null",
    "location_city": "string or null",
    "location_area": "string or null",
    "is_remote": boolean,
    "salary_text": "string or null",
    "salary_min_etb": number or null,
    "salary_max_etb": number or null,
    "description": "string or null",
    "requirements": ["string"],
    "responsibilities": ["string"],
    "how_to_apply": "string or null",
    "application_link": "string or null",
    "application_email": "string or null",
    "deadline": "YYYY-MM-DD or null",
    "is_closed": boolean,
    "is_vague": boolean,
    "confidence": 0.0-1.0
  }
]

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks.
- If NO jobs found, return empty array: [].
- If message is an ad, spam, or non-job content, return empty array.`;
}

export interface ExtractionResult {
  jobs: ExtractedJob[];
  provider: string;
  rawResponse: string;
}

/**
 * Extract structured jobs from a raw Telegram message.
 * Returns an empty array if no jobs found, on spam, or on parse failure.
 */
export async function extractJobs(
  messageText: string,
  links: string[],
  channelConfig: ChannelConfig,
): Promise<ExtractionResult> {
  const prompt = buildPrompt(messageText, links, channelConfig);

  const result = await complete({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.1,
    maxTokens: 4000,
    jsonMode: true,
  });

  const jobs = safeParseJobs(result.content);
  return {
    jobs,
    provider: result.provider,
    rawResponse: result.content,
  };
}

function safeParseJobs(raw: string): ExtractedJob[] {
  let text = raw.trim();
  // Strip markdown fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  // Find outermost JSON
  const firstBrace = text.search(/[[{]/);
  const lastBrace = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (firstBrace < 0 || lastBrace <= firstBrace) return [];
  text = text.slice(firstBrace, lastBrace + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  let arr: unknown[];
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    arr = (obj.jobs ?? obj.results ?? obj.data ?? []) as unknown[];
    if (!Array.isArray(arr)) return [];
  } else {
    return [];
  }

  return arr.map(coerceJob).filter((j): j is ExtractedJob => j !== null);
}

function coerceJob(raw: unknown): ExtractedJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    title: asString(r.title),
    title_amharic: asString(r.title_amharic),
    company_name: asString(r.company_name),
    company_name_amharic: asString(r.company_name_amharic),
    job_category: asString(r.job_category),
    job_categories: asStringArray(r.job_categories ?? r.categories ?? []),
    employment_type: asString(r.employment_type),
    work_type: asString(r.work_type),
    min_experience_years: asNumber(r.min_experience_years),
    max_experience_years: asNumber(r.max_experience_years),
    experience_text: asString(r.experience_text),
    location: asString(r.location),
    location_city: asString(r.location_city),
    location_area: asString(r.location_area),
    is_remote: asBool(r.is_remote),
    salary_text: asString(r.salary_text),
    salary_min_etb: asNumber(r.salary_min_etb),
    salary_max_etb: asNumber(r.salary_max_etb),
    description: asString(r.description),
    requirements: asStringArray(r.requirements),
    responsibilities: asStringArray(r.responsibilities),
    how_to_apply: asString(r.how_to_apply),
    application_link: asString(r.application_link),
    application_email: asString(r.application_email),
    deadline: asString(r.deadline),
    is_closed: asBool(r.is_closed),
    is_vague: asBool(r.is_vague),
    confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
  };
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}
function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function asBool(v: unknown): boolean {
  return Boolean(v);
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter((s) => s.length > 0);
}
