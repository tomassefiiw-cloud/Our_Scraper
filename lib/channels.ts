/**
 * 12 Ethiopian Telegram job channels (doc §2.1, §8.2, §17).
 * Each config tells the scraper + extractor how to handle the channel.
 */

export type ChannelType =
  | 'job_board' | 'recruiter' | 'aggregator' | 'curator' | 'freelance_board';

export type DeepLinkStrategy =
  | 'none' | 'direct_job_page' | 'job_board_page' | 'company_page_to_jobs'
  | 'stack_navigation' | 'dynamic_spa' | 'curator_redirect';

export interface ChannelConfig {
  telegram_username: string;
  display_name: string;
  channel_type: ChannelType;
  fetchLimit: number;
  lookbackHours: number;
  deepLinkStrategy: DeepLinkStrategy;
  multiJobPerMessage: boolean;
  skipPatterns: string[];
  priority: 'high' | 'medium' | 'low';
  languageMix: 'english' | 'english_amharic';
  domains: string[];
  notes?: string;
}

export const CHANNEL_CONFIGS: ChannelConfig[] = [
  {
    telegram_username: 'elelanajobs',
    display_name: 'Elelana Jobs',
    channel_type: 'job_board',
    fetchLimit: 30, lookbackHours: 2,
    deepLinkStrategy: 'direct_job_page',
    multiJobPerMessage: true,
    skipPatterns: ['Call For Pre-Employment Process', 'Employment Process'],
    priority: 'high', languageMix: 'english',
    domains: ['kebenajobs.com', 'elelanajobs.com', 'application.eecproducts.com'],
    notes: 'Company -> Position list -> "Find More Details here" -> URL -> Deadline. Multi-job messages common.',
  },
  {
    telegram_username: 'freelance_ethio',
    display_name: 'Freelance Ethio (Afriwork)',
    channel_type: 'freelance_board',
    fetchLimit: 30, lookbackHours: 2,
    deepLinkStrategy: 'direct_job_page',
    multiJobPerMessage: false,
    skipPatterns: ['CLOSED'],
    priority: 'high', languageMix: 'english_amharic',
    domains: ['afriworket.com'],
    notes: 'Highly structured. Description truncated with "... [view details below]". Verified Company badge.',
  },
  {
    telegram_username: 'geezjobs_ethiopia',
    display_name: 'GeezJobs Ethiopia',
    channel_type: 'recruiter',
    fetchLimit: 30, lookbackHours: 2,
    deepLinkStrategy: 'direct_job_page',
    multiJobPerMessage: false,
    skipPatterns: [],
    priority: 'medium', languageMix: 'english',
    domains: ['geezjobs.com'],
    notes: 'Job Title -> Company -> Employment -> Place of Work -> Deadline -> Job Summary -> Requirements. Full details usually in message. Hashtags: #fulltime, #permanent.',
  },
  {
    telegram_username: 'harmeejobs',
    display_name: 'Harmee Jobs',
    channel_type: 'aggregator',
    fetchLimit: 20, lookbackHours: 2,
    deepLinkStrategy: 'company_page_to_jobs',
    multiJobPerMessage: true,
    skipPatterns: [],
    priority: 'high', languageMix: 'english_amharic',
    domains: ['harmeejobs.com'],
    notes: 'Company intro -> Position list -> "Read Detail" -> https://harmeejobs.com/company/.../ Deep link nightmare: company page lists ALL open positions.',
  },
  {
    telegram_username: 'Maroset',
    display_name: 'Maroset',
    channel_type: 'freelance_board',
    fetchLimit: 30, lookbackHours: 4,
    deepLinkStrategy: 'none',
    multiJobPerMessage: false,
    skipPatterns: ['Closed/Hired'],
    priority: 'medium', languageMix: 'english',
    domains: [],
    notes: 'Easiest channel — NO LINKS, all data in message. "Closed/Hired" header marks closed jobs. Salary always present. View Rate indicator.',
  },
  {
    telegram_username: 'ethiojobs_official',
    display_name: 'Ethio Jobs Official',
    channel_type: 'aggregator',
    fetchLimit: 30, lookbackHours: 2,
    deepLinkStrategy: 'stack_navigation',
    multiJobPerMessage: true,
    skipPatterns: [],
    priority: 'high', languageMix: 'english',
    domains: ['ethiojobs.net'],
    notes: 'Minimal info in message — just company + "various positions". LINK word is a clickable <a> tag. Company page shows stack of ALL jobs (open + expired).',
  },
  {
    telegram_username: 'ethio_job_vacancy1',
    display_name: 'Ethio Job Vacancy',
    channel_type: 'aggregator',
    fetchLimit: 30, lookbackHours: 2,
    deepLinkStrategy: 'direct_job_page',
    multiJobPerMessage: true,
    skipPatterns: [],
    priority: 'medium', languageMix: 'english_amharic',
    domains: ['ethiojobshub.com'],
    notes: 'Amharic header -> Deadline -> Position list -> Qualification -> Experience -> Location -> "How to Apply Online??" -> URL. Emoji-heavy formatting.',
  },
  {
    telegram_username: 'Ethiojobshubs',
    display_name: 'EthioJobs Hubs',
    channel_type: 'aggregator',
    fetchLimit: 20, lookbackHours: 2,
    deepLinkStrategy: 'direct_job_page',
    multiJobPerMessage: true,
    skipPatterns: ['Mec.me', 'i.mec.me', 'Register', 'Verification'],
    priority: 'low', languageMix: 'english_amharic',
    domains: ['elelanjobs.com'],
    notes: 'Reposter — mostly reposts from elelanajobs. Skip Mec.me referral spam. HIGH duplication expected.',
  },
  {
    telegram_username: 'hahujobs',
    display_name: 'HahuJobs',
    channel_type: 'job_board',
    fetchLimit: 30, lookbackHours: 2,
    deepLinkStrategy: 'dynamic_spa',
    multiJobPerMessage: false,
    skipPatterns: [],
    priority: 'high', languageMix: 'english_amharic',
    domains: ['hahujobs.com'],
    notes: 'Job Title -> #company_hashtag -> #field_hashtag -> #location_hashtag -> Amharic description -> Quantity -> Min/Max Years -> Deadline -> "Click the apply button below". Inline Telegram buttons.',
  },
  {
    telegram_username: 'josad_it',
    display_name: 'Josad IT',
    channel_type: 'curator',
    fetchLimit: 20, lookbackHours: 2,
    deepLinkStrategy: 'curator_redirect',
    multiJobPerMessage: false,
    skipPatterns: [],
    priority: 'medium', languageMix: 'english',
    domains: [],
    notes: 'Curator — reposts from effoyjobs, harmeejobs, freelance_ethio, geezjobs, LinkedIn. Source hashtags (#effoyjobs etc.) identify original. IT/tech focus.',
  },
  {
    telegram_username: 'josad_software',
    display_name: 'Josad Software',
    channel_type: 'curator',
    fetchLimit: 20, lookbackHours: 2,
    deepLinkStrategy: 'curator_redirect',
    multiJobPerMessage: false,
    skipPatterns: [],
    priority: 'medium', languageMix: 'english',
    domains: [],
    notes: 'Curator — same format as josad_it but software-dev focused.',
  },
  {
    telegram_username: 'effoyjobs',
    display_name: 'Effoy Jobs',
    channel_type: 'job_board',
    fetchLimit: 30, lookbackHours: 2,
    deepLinkStrategy: 'job_board_page',
    multiJobPerMessage: false,
    skipPatterns: ['BMK Crafts', 'gift', 'ስጦታ'],
    priority: 'medium', languageMix: 'english_amharic',
    domains: ['effoysira.com'],
    notes: 'Highly structured with box characters (■, □) as markers. Some posts entirely Amharic. Skip BMK Crafts gift ads.',
  },
];

export function getChannelConfig(username: string): ChannelConfig | undefined {
  const u = username.toLowerCase();
  return CHANNEL_CONFIGS.find((c) => c.telegram_username.toLowerCase() === u);
}

// Shared constants
export const JOB_CATEGORIES = [
  'tech', 'health', 'finance', 'engineering', 'marketing', 'sales',
  'admin', 'creative', 'ngo', 'education', 'logistics', 'hospitality', 'other',
] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'freelance', 'internship'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_TYPES = ['remote', 'onsite', 'hybrid'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const ETHIOPIAN_CITIES = [
  'Addis Ababa', 'Jimma', 'Hawassa', 'Bahir Dar', 'Mekelle', 'Adama',
  'Gondar', 'Dire Dawa', 'Dessie', 'Jigjiga', 'Remote',
] as const;

export const ADDIS_ABABA_AREAS = [
  'Bole', 'Kazanchis', 'CMC', 'Ayat', 'Gerji', 'Hayahulet', 'Jemo',
  'Sarbet', 'Megenagna', 'Piazza', 'Merkato', 'Lideta', 'Kirkos', 'Akaki',
  'Yeka', 'Kolfe', 'Gulele', 'Addis Ketema', 'Arada', 'Nifas Silk', 'Lafto',
  'Summit', 'Lamberet',
] as const;

export const TELEGRAM_WEB_BASE = 'https://t.me/s/';
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
