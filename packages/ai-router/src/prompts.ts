/**
 * Extraction prompts (doc §6.2).
 *
 * The system prompt primes the model as "JobExtract Pro".
 * The user prompt template is filled in at runtime with channel context,
 * raw message text, and the message's extracted links.
 */
import type { ChannelConfig } from '@tja/shared';

export const SYSTEM_PROMPT = `You are JobExtract Pro, an AI specialized in parsing unstructured job postings from Telegram channels in Ethiopia. You understand both English and Amharic job postings. You are precise, conservative in guessing, and always return structured data.`;

export function buildExtractionPrompt(args: {
  messageText: string;
  links: string[];
  channelConfig: ChannelConfig;
}): string {
  return `You are an expert job data extractor. Extract ALL job postings from the following Telegram message.

CHANNEL CONTEXT:
- Channel: ${args.channelConfig.display_name}
- Type: ${args.channelConfig.channel_type}
- Multi-job per message: ${args.channelConfig.multiJobPerMessage ? 'yes' : 'no'}
- Notes: ${args.channelConfig.notes ?? 'n/a'}

RAW MESSAGE:
${args.messageText}

LINKS IN MESSAGE:
${args.links.length > 0 ? args.links.map((l) => `- ${l}`).join('\n') : '(none)'}

INSTRUCTIONS:
1. Extract EVERY job position mentioned in this message (some messages have multiple jobs).
2. If the message is in Amharic or mixed Amharic/English, extract both languages.
3. If a field is missing, use null — DO NOT guess.
4. For "experience", extract as min_years and max_years. "0-2 years" -> min: 0, max: 2. "5+ years" -> min: 5, max: null.
5. For "deadline", parse to YYYY-MM-DD format. Ethiopian calendar dates: convert to Gregorian.
6. For "location", normalize to: "Addis Ababa", "Jimma", "Hawassa", "Remote", etc.
7. If the message mentions "Closed/Hired" or similar, mark is_closed: true.
8. For "job_category", classify into ONE of: tech, health, finance, engineering, marketing, sales, admin, creative, ngo, education, logistics, hospitality, other.
9. If salary is mentioned, extract numeric value in ETB.
10. If the message says "various positions" with no details, set is_vague: true.

OUTPUT FORMAT — JSON array of jobs:
[
  {
    "title": "string",
    "title_amharic": "string or null",
    "company_name": "string",
    "company_name_amharic": "string or null",
    "job_category": "string",
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

/**
 * Prompt used when merging deep-link-extracted data with Telegram-extracted data.
 * We ask the model to reconcile conflicts (deep-link data wins for fields it has).
 */
export function buildMergePrompt(args: {
  telegramJob: object;
  deepLinkJobs: object[];
}): string {
  return `You are merging data extracted from a Telegram message with data scraped from a company's career page.
The deep-link data is more authoritative but may be partial. The Telegram data may have Amharic titles the career page lacks.

TELEGRAM-EXTRACTED JOB:
${JSON.stringify(args.telegramJob, null, 2)}

DEEP-LINK-EXTRACTED JOBS (one per position on the career page):
${JSON.stringify(args.deepLinkJobs, null, 2)}

INSTRUCTIONS:
1. If deep-link has multiple jobs, return ALL of them, each merged with the telegram job's company info.
2. Prefer deep-link values for: description, requirements, responsibilities, deadline, salary, application_link.
3. Prefer telegram values for: title_amharic, company_name_amharic (if deep-link doesn't have Amharic).
4. Set "confidence" higher (closer to 1.0) when deep-link data is available.
5. Set "extraction_method_hint" to "deep_link" for all merged jobs.

Return the same JSON array shape as the extraction prompt.`;
}
