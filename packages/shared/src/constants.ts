import type { JobCategory, EmploymentType, WorkType } from './types.js';

export const JOB_CATEGORIES: JobCategory[] = [
  'tech',
  'health',
  'finance',
  'engineering',
  'marketing',
  'sales',
  'admin',
  'creative',
  'ngo',
  'education',
  'logistics',
  'hospitality',
  'other',
];

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  'full-time',
  'part-time',
  'contract',
  'freelance',
  'internship',
];

export const WORK_TYPES: WorkType[] = ['remote', 'onsite', 'hybrid'];

export const ETHIOPIAN_CITIES = [
  'Addis Ababa',
  'Jimma',
  'Hawassa',
  'Bahir Dar',
  'Mekelle',
  'Adama',
  'Gondar',
  'Dire Dawa',
  'Dessie',
  'Jigjiga',
  'Remote',
] as const;

export const ADDIS_ABABA_AREAS = [
  'Bole',
  'Kazanchis',
  'CMC',
  'Ayat',
  'Gerji',
  'Hayahulet',
  'Jemo',
  'Sarbet',
  'Megenagna',
  'Piazza',
  'Merkato',
  'Lideta',
  'Kirkos',
  'Akaki',
  'Yeka',
  'Kolfe',
  'Gulele',
  'Addis Ketema',
  'Arada',
  'Nifas Silk',
  'Lafto',
  'Summit',
  'Lamberet',
] as const;

// Telegram public webview base
export const TELEGRAM_WEB_BASE = 'https://t.me/s/';

// Default scrape interval (matches doc §14.3)
export const DEFAULT_SCRAPE_INTERVAL_MINUTES = 30;

// Deduplication thresholds (doc §10)
export const DEDUP_HEURISTIC_THRESHOLD = 0.85;
export const DEDUP_SEMANTIC_THRESHOLD = 0.92;
export const DEDUP_LOOKBACK_DAYS = 7;

// Filtered AI limits (doc §7.2)
export const AI_FREE_TIER_LIMITS = {
  gemini: { rpm: 15, daily: 1500 },
  deepseek: { rpm: 10, daily: 10000 },
  claude: { rpm: 5, daily: 100 },
  openai: { rpm: 3, daily: 200 },
  groq: { rpm: 20, daily: 14400 },
  openrouter: { rpm: 20, daily: 1000 },
  kimi: { rpm: 10, daily: 1000 },
  ollama: { rpm: 9999, daily: 9999 },
} as const;

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const PWA = {
  name: 'EthioJob Hunter',
  short_name: 'JobHunter',
  description: 'AI-powered job aggregator for Ethiopian Telegram channels',
  theme_color: '#2563eb',
  background_color: '#ffffff',
} as const;
