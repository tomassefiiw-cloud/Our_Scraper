import type { ChannelConfig } from './types.js';

/**
 * All 12 initial Telegram channels (doc §2.1, §8.2, §17).
 *
 * CRITICAL DIRECTIVE (doc §2): before adding any new channel beyond these 12,
 * the operator MUST research the previous N=100 messages to build an accurate
 * profile. See `addChannel()` helper below for the required fields.
 */
export const CHANNEL_CONFIGS: ChannelConfig[] = [
  // ----- elelanajobs ----------------------------------------------------
  {
    telegram_username: 'elelanajobs',
    display_name: 'Elelana Jobs',
    channel_type: 'job_board',
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: true,
    deepLinkStrategy: 'direct_job_page',
    deepLinkFollow: 'required',
    linkSelector: 'inline_url',
    multiJobPerMessage: true,
    skipPatterns: ['Call For Pre-Employment Process', 'Employment Process'],
    deduplicationWeight: 'low',
    priority: 'high',
    languageMix: 'english',
    domains: ['kebenajobs.com', 'elelanajobs.com', 'application.eecproducts.com'],
    notes:
      'Company -> Position list -> "Find More Details here" -> URL -> Deadline. Multi-job messages common.',
  },

  // ----- freelance_ethio ------------------------------------------------
  {
    telegram_username: 'freelance_ethio',
    display_name: 'Freelance Ethio (Afriwork)',
    channel_type: 'freelance_board',
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: true,
    deepLinkStrategy: 'direct_job_page',
    deepLinkFollow: 'required',
    linkSelector: 'inline_url',
    multiJobPerMessage: false,
    skipPatterns: ['CLOSED'],
    deduplicationWeight: 'low',
    priority: 'high',
    languageMix: 'english_amharic',
    domains: ['afriworket.com'],
    notes:
      'Highly structured: Title, Job Type, Work Location, Applicants, Salary, Deadline, Description. Description truncated with "... [view details below]". Verified Company badge.',
  },

  // ----- geezjobs_ethiopia ----------------------------------------------
  {
    telegram_username: 'geezjobs_ethiopia',
    display_name: 'GeezJobs Ethiopia',
    channel_type: 'recruiter',
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: false,
    deepLinkStrategy: 'direct_job_page',
    deepLinkFollow: 'optional',
    linkSelector: 'inline_url',
    multiJobPerMessage: false,
    skipPatterns: [],
    deduplicationWeight: 'low',
    priority: 'medium',
    languageMix: 'english',
    domains: ['geezjobs.com'],
    notes:
      'Job Title -> Company -> Employment -> Place of Work -> Deadline -> Job Summary -> Requirements -> Related Jobs. Full details usually in message. Hashtags: #fulltime, #permanent, etc. Salary sometimes included.',
  },

  // ----- harmeejobs -----------------------------------------------------
  {
    telegram_username: 'harmeejobs',
    display_name: 'Harmee Jobs',
    channel_type: 'aggregator',
    fetchLimit: 20,
    lookbackHours: 2,
    extractionStrategy: 'ai_partial',
    deepLinkRequired: true,
    deepLinkStrategy: 'company_page_to_jobs',
    deepLinkFollow: 'required',
    linkSelector: 'inline_url',
    multiJobPerMessage: true,
    skipPatterns: [],
    deduplicationWeight: 'medium',
    priority: 'high',
    languageMix: 'english_amharic',
    domains: ['harmeejobs.com'],
    notes:
      'Company intro -> Position list -> "Read Detail" -> https://harmeejobs.com/company/.../ Deep link nightmare: company page lists ALL open positions, must find the relevant one.',
  },

  // ----- Maroset --------------------------------------------------------
  {
    telegram_username: 'Maroset',
    display_name: 'Maroset',
    channel_type: 'freelance_board',
    fetchLimit: 30,
    lookbackHours: 4,
    extractionStrategy: 'ai_full',
    deepLinkRequired: false,
    deepLinkStrategy: 'none',
    deepLinkFollow: 'none',
    linkSelector: 'inline_url',
    multiJobPerMessage: false,
    skipPatterns: ['Closed/Hired'],
    deduplicationWeight: 'low',
    priority: 'medium',
    languageMix: 'english',
    domains: [],
    notes:
      'Easiest channel — NO LINKS, all data in message. "Closed/Hired" header marks closed jobs. Salary always present. View Rate indicator: 80-100% Excellent, 60-79% Good, <40% Low.',
  },

  // ----- ethiojobs_official ---------------------------------------------
  {
    telegram_username: 'ethiojobs_official',
    display_name: 'Ethio Jobs Official',
    channel_type: 'aggregator',
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_minimal',
    deepLinkRequired: true,
    deepLinkStrategy: 'stack_navigation',
    deepLinkFollow: 'required',
    linkSelector: 'hyperlink',
    multiJobPerMessage: true,
    skipPatterns: [],
    deduplicationWeight: 'medium',
    priority: 'high',
    languageMix: 'english',
    domains: ['ethiojobs.net'],
    notes:
      'Minimal info in message — just company + "various positions". LINK word is a clickable <a> tag. Company page shows stack of ALL jobs (open + expired); must click "Read More" and skip "Job Expired".',
  },

  // ----- ethio_job_vacancy1 ---------------------------------------------
  {
    telegram_username: 'ethio_job_vacancy1',
    display_name: 'Ethio Job Vacancy',
    channel_type: 'aggregator',
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: true,
    deepLinkStrategy: 'direct_job_page',
    deepLinkFollow: 'required',
    linkSelector: 'inline_url',
    multiJobPerMessage: true,
    skipPatterns: [],
    deduplicationWeight: 'medium',
    priority: 'medium',
    languageMix: 'english_amharic',
    domains: ['ethiojobshub.com'],
    notes:
      'Amharic header -> Deadline -> Position list -> Qualification -> Experience -> Location -> "How to Apply Online??" -> URL. Emoji-heavy formatting. WordPress backend — usually no bot protection.',
  },

  // ----- Ethiojobshubs --------------------------------------------------
  {
    telegram_username: 'Ethiojobshubs',
    display_name: 'EthioJobs Hubs',
    channel_type: 'aggregator',
    fetchLimit: 20,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: true,
    deepLinkStrategy: 'direct_job_page',
    deepLinkFollow: 'required',
    linkSelector: 'inline_url',
    multiJobPerMessage: true,
    skipPatterns: ['Mec.me', 'i.mec.me', 'Register', 'Verification'],
    deduplicationWeight: 'high',
    priority: 'low',
    languageMix: 'english_amharic',
    domains: ['elelanjobs.com'],
    notes:
      'Reposter — mostly reposts from elelanajobs. Two variants: minimal "jobs by [Company]" or numbered list with "How to Apply?". Skip Mec.me referral spam. HIGH duplication expected.',
  },

  // ----- hahujobs -------------------------------------------------------
  {
    telegram_username: 'hahujobs',
    display_name: 'HahuJobs',
    channel_type: 'job_board',
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: false,
    deepLinkStrategy: 'dynamic_spa',
    deepLinkFollow: 'optional',
    linkSelector: 'button',
    buttonLinks: true,
    multiJobPerMessage: false,
    skipPatterns: [],
    deduplicationWeight: 'low',
    priority: 'high',
    languageMix: 'english_amharic',
    domains: ['hahujobs.com'],
    notes:
      'Job Title -> #company_hashtag -> #field_hashtag -> #location_hashtag -> Amharic description -> Quantity -> Min/Max Years -> Deadline -> "Click the apply button below". Inline Telegram buttons, not raw URLs.',
  },

  // ----- josad_it -------------------------------------------------------
  {
    telegram_username: 'josad_it',
    display_name: 'Josad IT',
    channel_type: 'curator',
    fetchLimit: 20,
    lookbackHours: 2,
    extractionStrategy: 'ai_partial',
    deepLinkRequired: true,
    deepLinkStrategy: 'curator_redirect',
    deepLinkFollow: 'required',
    linkSelector: 'inline_url',
    multiJobPerMessage: false,
    skipPatterns: [],
    deduplicationWeight: 'high',
    priority: 'medium',
    languageMix: 'english',
    domains: [],
    notes:
      'Curator — reposts from effoyjobs, harmeejobs, freelance_ethio, geezjobs, LinkedIn. Source hashtags (#effoyjobs etc.) identify original. Descriptions truncated with "... view detail". IT/tech focus.',
  },

  // ----- josad_software -------------------------------------------------
  {
    telegram_username: 'josad_software',
    display_name: 'Josad Software',
    channel_type: 'curator',
    fetchLimit: 20,
    lookbackHours: 2,
    extractionStrategy: 'ai_partial',
    deepLinkRequired: true,
    deepLinkStrategy: 'curator_redirect',
    deepLinkFollow: 'required',
    linkSelector: 'inline_url',
    multiJobPerMessage: false,
    skipPatterns: [],
    deduplicationWeight: 'high',
    priority: 'medium',
    languageMix: 'english',
    domains: [],
    notes:
      'Curator — same format as josad_it but software-dev focused. Reposts from same set of sources.',
  },

  // ----- effoyjobs ------------------------------------------------------
  {
    telegram_username: 'effoyjobs',
    display_name: 'Effoy Jobs',
    channel_type: 'job_board',
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: false,
    deepLinkStrategy: 'job_board_page',
    deepLinkFollow: 'optional',
    linkSelector: 'inline_url',
    multiJobPerMessage: false,
    skipPatterns: ['BMK Crafts', 'gift', 'ስጦታ'],
    deduplicationWeight: 'low',
    priority: 'medium',
    languageMix: 'english_amharic',
    domains: ['effoysira.com'],
    notes:
      'Highly structured with box characters (■, □) as markers. Title -> Category -> Employment -> Overview -> Responsibilities -> Requirements -> Skills -> How to Apply -> Email. Some posts entirely Amharic. Skip BMK Crafts gift ads.',
  },
];

/**
 * Lookup by telegram username (case-insensitive).
 */
export function getChannelConfig(username: string): ChannelConfig | undefined {
  const u = username.toLowerCase();
  return CHANNEL_CONFIGS.find((c) => c.telegram_username.toLowerCase() === u);
}

/**
 * Helper to validate a new channel config (doc §16).
 * Use this when adding new channels beyond the initial 12.
 */
export function addChannel(config: ChannelConfig): ChannelConfig {
  const required: (keyof ChannelConfig)[] = [
    'telegram_username',
    'display_name',
    'channel_type',
    'fetchLimit',
    'lookbackHours',
    'extractionStrategy',
    'deepLinkRequired',
    'deepLinkStrategy',
    'deepLinkFollow',
    'linkSelector',
    'multiJobPerMessage',
    'skipPatterns',
    'deduplicationWeight',
    'priority',
  ];
  for (const key of required) {
    if (config[key] === undefined || config[key] === null) {
      throw new Error(`Channel config missing required field: ${key}`);
    }
  }
  return config;
}
