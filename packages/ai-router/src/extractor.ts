/**
 * AIExtractor (doc §6.2).
 *
 * Wraps the AIProviderRouter with the job-extraction prompt and validates
 * the model's JSON output against the expected schema.
 */
import type {
  AIProviderConfig,
  ChannelConfig,
  ExtractedJob,
  RawTelegramMessage,
} from '@tja/shared';
import { AIProviderRouter } from './router.js';
import { buildExtractionPrompt, SYSTEM_PROMPT } from './prompts.js';

export interface ExtractionResult {
  jobs: ExtractedJob[];
  provider: string;
  rawResponse: string;
}

export class AIExtractor {
  private router: AIProviderRouter;

  constructor(providerConfigs: AIProviderConfig[]) {
    this.router = new AIProviderRouter(providerConfigs);
  }

  configure(providerConfigs: AIProviderConfig[]): void {
    this.router.configure(providerConfigs);
  }

  /**
   * Extract structured jobs from a raw Telegram message.
   * Returns an empty array if no jobs found, on spam, or on parse failure.
   */
  async extractJobs(
    rawMessage: Pick<RawTelegramMessage, 'message_text' | 'extracted_links'>,
    channelConfig: ChannelConfig,
  ): Promise<ExtractionResult> {
    const prompt = buildExtractionPrompt({
      messageText: rawMessage.message_text,
      links: rawMessage.extracted_links.map((l) => l.url),
      channelConfig,
    });

    const result = await this.router.complete({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.1,
      maxTokens: 4000,
      responseFormat: { type: 'json_object' },
    });

    const parsed = safeParseJobs(result.content);

    return {
      jobs: parsed,
      provider: result.provider,
      rawResponse: result.content,
    };
  }

  /**
   * Raw completion (for testing prompts).
   */
  async raw(prompt: string, systemPrompt?: string): Promise<string> {
    const r = await this.router.complete({ prompt, systemPrompt, temperature: 0.1, maxTokens: 4000 });
    return r.content;
  }

  getRouter(): AIProviderRouter {
    return this.router;
  }
}

/**
 * Parse the model's output as an ExtractedJob[].
 * Tolerates: markdown fences, leading/trailing prose, object-wrapped arrays.
 * Validates and coerces types; drops unparseable entries.
 */
function safeParseJobs(raw: string): ExtractedJob[] {
  let text = raw.trim();

  // Strip markdown code fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  // Find the outermost JSON
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

  // Model may return either an array or { jobs: [...] } or { results: [...] }
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
    job_category: asString(r.job_category) as ExtractedJob['job_category'],
    employment_type: asString(r.employment_type) as ExtractedJob['employment_type'],
    work_type: asString(r.work_type) as ExtractedJob['work_type'],
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
    salary_currency: asString(r.salary_currency) ?? 'ETB',
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
