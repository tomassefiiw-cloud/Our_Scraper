/**
 * AI Job Formatter — uses local Ollama to fix, format, and beautify job descriptions
 * before displaying them to the user.
 * Falls back gracefully if the AI call fails (uses simple HTML formatting).
 */

import { complete } from './ai-router';

export interface FormattedJob {
  title: string | null;
  title_amharic: string | null;
  company_name: string | null;
  description_html: string;
  requirements_html: string;
  responsibilities_html: string;
  how_to_apply_html: string | null;
  summary: string | null;
  key_qualifications: string[];
  nice_to_have: string[];
}

const FORMAT_SYSTEM_PROMPT = `You are JobFormat Pro, an AI specialized in cleaning and beautifying job descriptions for display. You take raw, messy job data extracted from Telegram channels and transform it into clean, well-structured HTML for a modern job board.

Rules:
- Fix grammar and spelling issues
- Organize content into clear sections
- Format as clean HTML (<p>, <ul>, <li>, <strong> only — no <style>, no classes)
- Extract key qualifications and nice-to-have skills
- Create a concise one-line summary
- Preserve ALL factual information — never add fake details
- Handle Amharic text gracefully alongside English
- NEVER make up job details that weren't in the original
- Return valid JSON only`;

function buildFormatPrompt(jobData: Record<string, unknown>): string {
  return `Format and beautify the following job data for display on a modern job board.

JOB DATA:
${JSON.stringify(jobData, null, 2)}

Return JSON with this structure:
{
  "title": "string or null — cleaned title",
  "title_amharic": "string or null — cleaned Amharic title",
  "company_name": "string or null",
  "description_html": "string — clean HTML formatted description",
  "requirements_html": "string — clean HTML bullet list using <ul><li>",
  "responsibilities_html": "string — clean HTML bullet list using <ul><li>",
  "how_to_apply_html": "string or null — clean application instructions in HTML",
  "summary": "string or null — 1 sentence summary of the role",
  "key_qualifications": ["list of extracted key qualifications"],
  "nice_to_have": ["list of nice-to-have qualifications"]
}

IMPORTANT: Return ONLY valid JSON, no markdown code blocks`;
}

export async function formatJobDescription(
  jobData: Record<string, unknown>,
): Promise<FormattedJob> {
  try {
    const prompt = buildFormatPrompt(jobData);
    const result = await complete({
      prompt,
      systemPrompt: FORMAT_SYSTEM_PROMPT,
      temperature: 0.15,
      maxTokens: 2000,
      jsonMode: true,
    });
    const parsed = safeParseFormatted(result.content);
    if (parsed) return parsed;
  } catch (err) {
    console.warn('[formatter] AI failed, using simple format:', (err as Error).message);
  }
  return simpleFormat(jobData);
}

function safeParseFormatted(raw: string): FormattedJob | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  text = text.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      title: (parsed.title as string) ?? null,
      title_amharic: (parsed.title_amharic as string) ?? null,
      company_name: (parsed.company_name as string) ?? null,
      description_html: (parsed.description_html as string) ?? '',
      requirements_html: (parsed.requirements_html as string) ?? '',
      responsibilities_html: (parsed.responsibilities_html as string) ?? '',
      how_to_apply_html: (parsed.how_to_apply_html as string) ?? null,
      summary: (parsed.summary as string) ?? null,
      key_qualifications: Array.isArray(parsed.key_qualifications) ? (parsed.key_qualifications as string[]).filter(Boolean) : [],
      nice_to_have: Array.isArray(parsed.nice_to_have) ? (parsed.nice_to_have as string[]).filter(Boolean) : [],
    };
  } catch { return null; }
}

function simpleFormat(jobData: Record<string, unknown>): FormattedJob {
  const desc = (jobData.description as string) ?? '';
  const descHtml = desc.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
  const requirements = (jobData.requirements as string[]) ?? [];
  const responsibilities = (jobData.responsibilities as string[]) ?? [];
  
  return {
    title: (jobData.title as string) ?? null,
    title_amharic: (jobData.title_amharic as string) ?? null,
    company_name: (jobData.company_name as string) ?? null,
    description_html: descHtml || '<p>No description provided.</p>',
    requirements_html: requirements.length ? '<ul>\n' + requirements.map((r) => `  <li>${escapeHtml(r)}</li>`).join('\n') + '\n</ul>' : '',
    responsibilities_html: responsibilities.length ? '<ul>\n' + responsibilities.map((r) => `  <li>${escapeHtml(r)}</li>`).join('\n') + '\n</ul>' : '',
    how_to_apply_html: (jobData.how_to_apply as string) ? `<p>${escapeHtml(jobData.how_to_apply as string)}</p>` : null,
    summary: (jobData.title && jobData.company_name) ? `${jobData.title} at ${jobData.company_name}` : null,
    key_qualifications: requirements.slice(0, 5),
    nice_to_have: [],
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
