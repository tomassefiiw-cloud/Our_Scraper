/**
 * @tja/shared — core domain types shared across api, worker, web, and packages.
 */

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export type ChannelType =
  | 'job_board'
  | 'recruiter'
  | 'aggregator'
  | 'curator'
  | 'freelance_board';

export type ExtractionStrategy = 'ai_full' | 'ai_partial' | 'ai_minimal';

export type DeepLinkStrategy =
  | 'none'
  | 'direct_job_page'
  | 'job_board_page'
  | 'company_page_to_jobs'
  | 'stack_navigation'
  | 'dynamic_spa'
  | 'curator_redirect';

export type DeepLinkFollow = 'required' | 'optional' | 'none';

export type LinkSelector = 'inline_url' | 'hyperlink' | 'button' | 'mixed';

export type Priority = 'high' | 'medium' | 'low';

export type DeduplicationWeight = 'low' | 'medium' | 'high';

export interface ChannelConfig {
  telegram_username: string;
  display_name: string;
  channel_type: ChannelType;

  // Scraping
  fetchLimit: number;
  lookbackHours: number;

  // Extraction
  extractionStrategy: ExtractionStrategy;

  // Deep links
  deepLinkRequired: boolean;
  deepLinkStrategy: DeepLinkStrategy;
  deepLinkFollow: DeepLinkFollow;

  // Link detection
  linkSelector: LinkSelector;
  buttonLinks?: boolean;

  // Multi-job
  multiJobPerMessage: boolean;

  // Filtering
  skipPatterns: string[];

  // Dedup
  deduplicationWeight: DeduplicationWeight;

  // Priority
  priority: Priority;

  // Misc
  notes?: string;
  languageMix?: 'english' | 'english_amharic';
  domains?: string[];
}

// ---------------------------------------------------------------------------
// Raw Telegram message
// ---------------------------------------------------------------------------

export interface ExtractedLink {
  url: string;
  text: string;
  isButton?: boolean;
}

export interface RawTelegramMessage {
  telegram_msg_id: number;
  channel_username: string;
  message_text: string;
  message_html: string;
  posted_at: Date;
  views: number;
  extracted_links: ExtractedLink[];
}

// ---------------------------------------------------------------------------
// AI-extracted job
// ---------------------------------------------------------------------------

export type JobCategory =
  | 'tech'
  | 'health'
  | 'finance'
  | 'engineering'
  | 'marketing'
  | 'sales'
  | 'admin'
  | 'creative'
  | 'ngo'
  | 'education'
  | 'logistics'
  | 'hospitality'
  | 'other';

export type EmploymentType =
  | 'full-time'
  | 'part-time'
  | 'contract'
  | 'freelance'
  | 'internship';

export type WorkType = 'remote' | 'onsite' | 'hybrid';

export interface ExtractedJob {
  title: string | null;
  title_amharic: string | null;
  company_name: string | null;
  company_name_amharic: string | null;
  job_category: JobCategory | null;
  employment_type: EmploymentType | null;
  work_type: WorkType | null;
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
  salary_currency?: string;
  description: string | null;
  requirements: string[];
  responsibilities: string[];
  how_to_apply: string | null;
  application_link: string | null;
  application_email: string | null;
  deadline: string | null; // YYYY-MM-DD
  is_closed: boolean;
  is_vague: boolean;
  confidence: number; // 0..1
}

// ---------------------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------------------

export interface UserPreferences {
  min_experience_years: number;
  max_experience_years: number;
  job_categories: JobCategory[];
  locations: string[];
  addis_ababa_areas: string[];
  work_types: WorkType[];
  employment_types: EmploymentType[];
  exclude_keywords: string[];
  min_salary_etb?: number | null;
  max_salary_etb?: number | null;
  notify_push: boolean;
  notify_email: boolean;
  purge_after_days: number;
}

// ---------------------------------------------------------------------------
// AI providers
// ---------------------------------------------------------------------------

export type AIProviderName =
  | 'gemini'
  | 'deepseek'
  | 'claude'
  | 'openai'
  | 'ollama'
  | 'openrouter'
  | 'groq'
  | 'kimi';

export interface AIProviderConfig {
  id?: string;
  user_id?: string | null;
  provider_name: AIProviderName;
  api_key?: string;
  api_base_url?: string;
  model_name: string;
  is_active: boolean;
  priority: number;
  rate_limit_rpm: number;
  daily_quota: number;
  current_usage: number;
  last_reset_at?: Date;
  is_local: boolean;
  ollama_url?: string;
}

export interface AICompletionParams {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
}

export interface AICompletionResult {
  content: string;
  provider: AIProviderName;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

// ---------------------------------------------------------------------------
// Jobs (DB shape)
// ---------------------------------------------------------------------------

export interface Job extends Omit<ExtractedJob, 'deadline'> {
  id: string;
  raw_message_id: string;
  channel_id: string;
  source_url: string | null;
  deep_extracted_url: string | null;
  ai_provider_used: AIProviderName | null;
  ai_confidence: number;
  extraction_method: 'telegram_only' | 'deep_link' | 'deep_link_failed_fallback';
  duplicate_group_id: string | null;
  is_primary: boolean;
  posted_at: Date;
  scraped_at: Date;
  expires_at: Date | null;
  deadline: Date | null;
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface JobFeedFilters {
  q?: string;
  job_categories?: JobCategory[];
  locations?: string[];
  work_types?: WorkType[];
  employment_types?: EmploymentType[];
  min_experience_years?: number;
  max_experience_years?: number;
  is_remote?: boolean;
  exclude_keywords?: string[];
  cursor?: string; // ISO date for infinite scroll
  limit?: number;
}
