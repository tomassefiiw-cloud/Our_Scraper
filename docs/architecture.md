# TELEGRAM JOB AGGREGATOR — ARCHITECTURE & REQUIREMENTS DOCUMENT
## AI-Assisted Job Scraping, Extraction & Filtering Webapp with PWA

---

**Version:** 1.0 | **Date:** June 15, 2026 | **Status:** Ready for Development

---

## TABLE OF CONTENTS

1. Executive Summary
2. Channel Analysis & Profiles
3. System Architecture Overview
4. Technology Stack
5. Data Models
6. Core Modules
7. AI Provider Router
8. Scraping Pipeline
9. Deep Link Extraction
10. Duplicate Detection
11. User Preferences & Filtering
12. Notification System
13. PWA Implementation
14. Deployment Strategy
15. Phase Roadmap
16. Channel Config Schema
17. Appendix: Scraping Notes per Channel

---

## 1. EXECUTIVE SUMMARY

### 1.1 Problem Statement
You and your friends are becoming lazy checking 12+ Telegram job channels because:
- Too many channels to monitor manually
- Most posts are irrelevant (wrong field, experience level, location)
- Posts have inconsistent formats — some full details, some just links
- Deep links require clicking through company websites with job listings
- No unified filtering system exists

### 1.2 Solution
A web application + PWA that:
1. Scrapes public Telegram channels every 30 minutes via t.me/s/channel_name
2. AI-extracts structured job data from messy, inconsistent message formats
3. Follows deep links to company career pages when needed
4. Filters jobs based on each user's preferences (experience, field, location, remote)
5. Notifies users when matching jobs are found
6. Deduplicates across channels using semantic + heuristic matching

### 1.3 Key Design Principles
- AI-first extraction: Don't rely on regex — use LLMs to parse unstructured text
- Multi-provider AI: Support Gemini, DeepSeek, Claude, OpenAI, Ollama, etc. with failover
- Graceful degradation: If deep extraction fails, store what we have + the link
- Incremental build: Phase 1 = basic scraper + 1 AI provider, Phase 2 = full system
- Free-tier friendly: Design around free API limits, with local model fallback

---

## 2. CHANNEL ANALYSIS & PROFILES

> CRITICAL DIRECTIVE: Before adding ANY new channel, the AI or human operator MUST research the previous N=100 messages to build an accurate profile. This document contains profiles for the initial 12 channels only.

### 2.1 Channel Taxonomy

| Channel | Type | Format | Link Style | Deep Link Complexity | Language Mix |
|---------|------|--------|-----------|---------------------|-------------|
| elelanajobs | Job Board | Highlights + link | Inline URL | Low (direct job page) | English |
| freelance_ethio | Job Board | Structured highlights + link | Inline URL | Low-Med (afriworket.com) | English + Amharic |
| geezjobs_ethiopia | Recruiter | Full details in message | Inline URL + buttons | Low (geezjobs.com) | English |
| harmeejobs | Aggregator | Highlights + link | Inline URL | HIGH (company page -> job list -> individual job) | English + Amharic |
| Maroset | Freelance Board | FULL details in message | NONE | N/A | English |
| ethiojobs_official | Aggregator | Company name only | Hyperlinked "LINK" | HIGH (company page -> stack of jobs) | English |
| ethio_job_vacancy1 | Aggregator | Highlights + link | Inline URL | Low (ethiojobshub.com) | English + Amharic |
| Ethiojobshubs | Reposter | Reposts from elelanajobs + others | Inline URL | Low (elelanjobs.com) | English + Amharic |
| hahujobs | Structured | Almost full details + buttons | Button links (Details/Apply) | Med (dynamic site) | English + Amharic |
| josad_it | Curator | Reposts with source tags | Inline URL (varies) | Varies by source | English |
| josad_software | Curator | Reposts with source tags | Inline URL (varies) | Varies by source | English |
| effoyjobs | Job Board | Highlights + link | Inline URL | Low-Med (effoysira.com) | English + Amharic |

### 2.2 Critical Observations from Live Data

#### elelanajobs
- Pattern: Company Name -> Position list -> "Find More Details here" -> URL -> Deadline
- Multi-job messages: One message can contain 5+ positions (e.g., Kerchanshe Trading)
- Mixed detail levels: Some have full requirements in message, some just titles
- Special posts: "Call For Pre-Employment Process" (not a job posting, skip or tag differently)
- Link domains: kebenajobs.com, elelanajobs.com, application.eecproducts.com

#### freelance_ethio (Afriwork)
- Pattern: Highly structured — Job Title, Job Type, Work Location, Applicants Needed, Salary/Compensation, Deadline, Description
- Description truncation: "... [view details below]" — truncated, link needed for full details
- Company footer: Company name + "Verified Company" + job count + source attribution
- Closed jobs: Marked with "CLOSED"
- Amharic posts: Some job titles/descriptions in Amharic (e.g., "የሁለገብ ጥገና ባለሙያ")
- Link: Usually links to afriworket.com

#### geezjobs_ethiopia
- Pattern: Job Title -> Company -> Employment -> Place of Work -> Deadline Date -> Job Summary -> Requirements -> Related Jobs -> From: geezjobs.com
- Full details in message: Most info is in the Telegram message itself
- Link: Usually geezjobs.com/... but message contains enough data
- Hashtags: #fulltime, #permanent, #parttime, #contract
- Salary sometimes included: e.g., "Salary: 10k - 18k Net"

#### harmeejobs
- Pattern: Company intro -> Position list -> "Read Detail" -> https://harmeejobs.com/company/.../
- Deep link nightmare: Link goes to company page on harmeejobs.com -> lists ALL open positions for that company -> must find relevant one
- Multiple positions per message: e.g., IOM has 4 positions in one message
- Amharic text: Heavy Amharic usage in message framing
- Secondary links: Also promotes www.harmeejobs.com and their Telegram

#### Maroset
- Pattern: "Closed/Hired" header -> Job Title -> Company -> View Rate -> Salary -> Deadline -> Description -> Requirements -> Role & Responsibilities -> How to Apply
- NO LINKS: All data is in the message. This is the easiest channel to scrape.
- Closed marker: Header clearly marks closed jobs — easy to filter out
- Salary always present: Even if "Attractive and negotiable"
- View rate indicator: 80%-100% Excellent, 60%-79% Good, Below 40% Low

#### ethiojobs_official
- Pattern: "Company Name is hiring for various positions. Click through their latest postings and see if you are a fit." -> "Click here to Apply: LINK" (hyperlinked, not raw URL)
- MINIMAL info in message: Just company name + "various positions"
- Deep link complexity: LINK goes to company page on ethiojobs.net -> shows stack of ALL jobs (open + expired) -> must identify open ones -> click "Read More" (not "Job Expired") -> get full details
- Category posts: Sometimes posts like "New IT, Computer Science and Software Engineering Jobs" with generic link
- Link is HYPERLINKED: The word "LINK" is a clickable <a> tag, not a raw URL in text

#### ethio_job_vacancy1
- Pattern: Amharic header -> Deadline -> Position 1, Position 2 -> Qualification -> Experience -> Location -> "How to Apply Online??" -> https://ethiojobshub.com/...
- Structured but inconsistent: Uses emoji markers heavily
- Amharic headers: e.g., "ኢቲ ስዊች አዲስ የስራ ማስታወቂያ"
- Multiple positions per message: Common
- Links to ethiojobshub.com: WordPress site, usually no bot protection

#### Ethiojobshubs
- Pattern: Reposts from elelanajobs and others. Two formats:
  1. "jobs by [Company] check the website" (minimal)
  2. "[New] Jobs by [Company] | Jobs Opportunity [Date] | 2026" -> numbered list -> "How to Apply ?" -> link -> Deadline -> promotional text in Amharic
- Mixed content: Includes non-job spam (e.g., Mec.me referral links)
- Links to elelanjobs.com: Same domain as elelanajobs
- High duplication: Mostly reposts — expect heavy deduplication needed

#### hahujobs
- Pattern: Job Title -> #company_hashtag -> #field_hashtag -> #location_hashtag -> Amharic description -> Quanitity Required -> Minimum Years Of Experience -> Maximum Years Of Experience -> Deadline -> How To Apply -> "Click the apply button below"
- Structured hashtags: #ethiopian_engineering_corporation, #engineering, #Addis_Ababa
- Amharic descriptions: Job duties often in Amharic
- Apply buttons: Telegram inline buttons (not raw links) — text says "Click the apply button below" but actual button may link to hahujobs.com or external form
- Salary sometimes present: e.g., "Salary: 25000.00"
- Experience range: Both min and max years given

#### josad_it & josad_software
- Pattern: Job Title -> Company: [Name] -> Deadline: [Date] -> truncated description with "... view detail" -> source hashtags -> "View on source" -> @josad_it or @josad_software
- Curator channels: Repost from effoyjobs, harmeejobs, freelance_ethio, geezjobs, LinkedIn, remotejobshg, etc.
- Source hashtags: #effoyjobs, #harmeejobs, #freelance_ethio, #Linkedin, etc.
- Links: May link to original source or to josad's own site
- Truncated descriptions: "... view detail" indicates content cut off
- josad_it: IT/tech focused
- josad_software: Software dev focused

#### effoyjobs
- Pattern: Job Title -> Category -> Employment Type -> Overview -> Key Responsibilities -> Strict Requirements -> Skills Needed -> How to Apply -> Email
- Highly structured: Uses box characters as markers
- Full details often in message: Sometimes no external link needed
- Amharic posts: Some entirely in Amharic (e.g., HANDS MIDDLE EAST TRADING PLC post)
- Links to effoysira.com: WordPress site, may have bot protection
- Mixed content: Includes non-job posts (e.g., BMK Crafts gift advertisement)

---

## 3. SYSTEM ARCHITECTURE OVERVIEW

```
FRONTEND (PWA)
  Job Feed (Infinite Scroll)
  Filters (Experience, Location, Job Type, Remote)
  Settings (AI Provider, Preferences, Account)
  Notifications (Push + In-app)
  |
  Service Worker (PWA)
    - Background sync
    - Push notifications
    - Offline caching

HTTPS/JSON
  |
  v
BACKEND (Node.js)
  API Layer (Express/Fastify)
    /jobs, /feed, /auth, /users, /filters, /prefs, /channels, /scrape, /settings, /admin
  |
  Core Services
    Scraper Engine (Cheerio)
    AI Extractor Service (Multi-provider)
    Deep Link Navigator (Puppeteer)
    Deduplicator Engine (Semantic + Heuristic)
  |
  Background Jobs (BullMQ/Agenda)
    30-min Scrape Cron
    AI Extraction Queue (Throttled)
    Deep Link Follow Queue (Throttled)
    Notification Queue (Push + Email)
  |
  v
DATA LAYER
  PostgreSQL (Primary DB)
    - jobs, users, channels, raw_messages, scrape_logs
  Redis (Queue + Cache)
    - BullMQ queues, Rate limiting, Session cache, AI response cache (TTL)
  Local Storage (Optional)
    - Ollama models, temp files
```

---

## 4. TECHNOLOGY STACK

### 4.1 Recommended Stack (Based on Your Preferences)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14+ (App Router) | Best PWA support via next-pwa, SSR for SEO, easy deployment to Vercel |
| Backend | Node.js + Express | Your preference, huge ecosystem, easy AI SDK integration |
| Database | PostgreSQL (Supabase) | Your preference. Free tier generous. Built-in auth. SQLite is NOT enough — you'll have thousands of jobs, multiple users, complex queries |
| Queue | BullMQ + Redis | Robust job queuing for AI calls and deep link extraction. Redis free tier on Upstash |
| Scraping | Cheerio (Telegram) + Puppeteer (Deep links) | Cheerio for fast static HTML parsing, Puppeteer for JS-rendered job cards |
| AI SDK | Vercel AI SDK | Universal interface for multiple providers (OpenAI, Anthropic, Google, etc.) |
| PWA | next-pwa + Workbox | Service worker, offline support, push notifications |
| Hosting | Vercel (Frontend) + Render/Railway (Backend) | Vercel free tier is generous. Render has 15-min sleep — use cron to keep alive OR just use Vercel for everything |
| Local AI | Ollama (optional self-host) | Fallback when APIs are down/rate-limited. Models: Phi-4, Qwen 2.5, Llama 3.1 |

### 4.2 Why NOT SQLite

You asked if SQLite is enough. No, for these reasons:

1. Concurrent writes: 30-min scraper + multiple users reading = write conflicts
2. Full-text search: You need to search job descriptions, titles, companies. PostgreSQL has tsvector / tsquery built-in
3. Scaling: Even for "simple" use, you'll have 1000+ jobs within weeks
4. Supabase free tier: 500MB database, unlimited API requests, built-in auth, Row Level Security
5. JSON support: PostgreSQL's JSONB is perfect for storing AI-extracted structured data with schema evolution

### 4.3 Why Next.js for PWA

- Built-in PWA support: next-pwa handles service worker, manifest, offline caching
- App Router: Server Components reduce client JS bundle
- API Routes: Can colocate backend logic if you want monorepo
- Vercel deployment: One-click deploy, automatic HTTPS (required for PWA push notifications)
- Image optimization: next/image handles channel avatar/logo caching

---

## 5. DATA MODELS

### 5.1 Core Entities

```sql
-- USERS & AUTHENTICATION
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,  -- bcrypt
    display_name    VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);

-- USER PREFERENCES (Job Filters)
CREATE TABLE user_preferences (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Experience Range
    min_experience_years INT DEFAULT 0,
    max_experience_years INT DEFAULT 50,  -- 50 = "any"

    -- Job Categories (multi-select stored as array)
    job_categories      TEXT[] DEFAULT '{}',
    -- ['tech', 'health', 'finance', 'engineering', 'marketing', 'sales', 'admin', 'creative', 'ngo', 'education', 'other']

    -- Location
    locations           TEXT[] DEFAULT '{}',
    -- ['Addis Ababa', 'Remote', 'Jimma', 'Hawassa', ...]
    addis_ababa_areas   TEXT[] DEFAULT '{}',
    -- ['Bole', 'Kazanchis', 'CMC', 'Ayat', 'Gerji', 'Hayahulet', 'Jemo', ...]

    -- Work Type
    work_types          TEXT[] DEFAULT '{}',  -- ['remote', 'onsite', 'hybrid']

    -- Employment Type
    employment_types    TEXT[] DEFAULT '{}',
    -- ['full-time', 'part-time', 'contract', 'freelance', 'internship']

    -- Exclude Keywords (your question about this)
    exclude_keywords    TEXT[] DEFAULT '{}',
    -- e.g., ['5+ years', 'senior only', '10+ years experience']

    -- Salary (optional, low priority)
    min_salary_etb      INT,
    max_salary_etb      INT,

    -- Notification settings
    notify_push         BOOLEAN DEFAULT TRUE,
    notify_email        BOOLEAN DEFAULT FALSE,

    -- Data retention
    purge_after_days    INT DEFAULT 30,  -- purge expired jobs after X days

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id)
);

-- CHANNELS
CREATE TABLE channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_username VARCHAR(100) UNIQUE NOT NULL,  -- e.g., 'elelanajobs'
    display_name    VARCHAR(200),
    channel_type    VARCHAR(50) NOT NULL,
    -- 'job_board', 'recruiter', 'aggregator', 'curator', 'freelance_board'

    -- Scraping config (JSONB for flexibility)
    scrape_config   JSONB NOT NULL DEFAULT '{}',

    -- AI extraction profile
    extraction_profile VARCHAR(50) DEFAULT 'default',

    -- Status
    is_active       BOOLEAN DEFAULT TRUE,
    last_scraped_at TIMESTAMPTZ,
    last_error      TEXT,
    error_count     INT DEFAULT 0,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RAW MESSAGES (from Telegram)
CREATE TABLE raw_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id      UUID REFERENCES channels(id) ON DELETE CASCADE,
    telegram_msg_id BIGINT NOT NULL,  -- Telegram's message ID

    -- Raw content
    message_text    TEXT,
    message_html    TEXT,  -- Full HTML from t.me/s/channel

    -- Metadata
    posted_at       TIMESTAMPTZ,
    views           INT,
    reactions       JSONB DEFAULT '{}',  -- {heart: 10, thumbs_up: 5}

    -- Links found in message
    extracted_links TEXT[] DEFAULT '{}',

    -- Processing status
    status          VARCHAR(20) DEFAULT 'pending',
    -- pending, extracted, failed, skipped

    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(channel_id, telegram_msg_id)
);

-- EXTRACTED JOBS (AI output)
CREATE TABLE jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_message_id      UUID REFERENCES raw_messages(id) ON DELETE CASCADE,
    channel_id          UUID REFERENCES channels(id),

    -- Core job info (AI extracted)
    title               VARCHAR(500),
    title_amharic       VARCHAR(500),  -- If title was in Amharic
    company_name        VARCHAR(200),
    company_name_amharic VARCHAR(200),

    -- Structured data
    job_category        VARCHAR(50),  -- normalized: tech, health, finance, etc.
    employment_type     VARCHAR(50),  -- full-time, part-time, contract, freelance, internship
    work_type           VARCHAR(50),  -- remote, onsite, hybrid

    -- Experience
    min_experience_years INT,
    max_experience_years INT,
    experience_text     VARCHAR(200),  -- raw text like "0-2 years"

    -- Location
    location            VARCHAR(200),
    location_city       VARCHAR(100),  -- normalized: Addis Ababa, Jimma, etc.
    location_area       VARCHAR(100),  -- Bole, Kazanchis, etc.
    is_remote           BOOLEAN DEFAULT FALSE,

    -- Salary
    salary_text         VARCHAR(200),  -- raw text
    salary_min_etb      INT,
    salary_max_etb      INT,
    salary_currency     VARCHAR(10) DEFAULT 'ETB',

    -- Description & Requirements
    description         TEXT,
    requirements        TEXT[],
    responsibilities    TEXT[],

    -- Application info
    how_to_apply        TEXT,
    application_link    VARCHAR(1000),
    application_email   VARCHAR(255),
    deadline            DATE,

    -- Status
    is_closed           BOOLEAN DEFAULT FALSE,
    is_expired          BOOLEAN DEFAULT FALSE,  -- deadline passed

    -- Source tracking
    source_url          VARCHAR(1000),  -- Original link from Telegram
    deep_extracted_url  VARCHAR(1000),  -- URL after following deep links

    -- AI metadata
    ai_provider_used    VARCHAR(50),  -- gemini, deepseek, claude, etc.
    ai_confidence       DECIMAL(3,2),  -- 0.00 to 1.00
    extraction_method   VARCHAR(50),  -- 'telegram_only', 'deep_link', 'deep_link_failed_fallback'

    -- Deduplication
    duplicate_group_id  UUID,  -- Links duplicates together
    is_primary          BOOLEAN DEFAULT TRUE,  -- True if this is the first seen copy

    -- Timestamps
    posted_at           TIMESTAMPTZ,  -- When originally posted on Telegram
    scraped_at          TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,  -- For cache/purge logic

    -- Full-text search
    search_vector       TSVECTOR
);

-- DUPLICATE GROUPS
CREATE TABLE duplicate_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_job_id UUID REFERENCES jobs(id),
    detection_method VARCHAR(50),  -- 'exact_link', 'semantic_similarity', 'company_title_match'
    similarity_score DECIMAL(4,3),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- USER JOB INTERACTIONS (views, saves, hides)
CREATE TABLE user_job_interactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
    action      VARCHAR(20) NOT NULL,  -- viewed, saved, hidden, applied, dismissed
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, job_id, action)
);

-- AI PROVIDER CONFIG
CREATE TABLE ai_provider_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system default
    provider_name   VARCHAR(50) NOT NULL,
    -- gemini, deepseek, claude, openai, ollama, openrouter, groq, kimi
    api_key         VARCHAR(500),  -- encrypted
    api_base_url    VARCHAR(500),  -- for custom/OpenRouter endpoints
    model_name      VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    priority        INT DEFAULT 0,  -- Lower = tried first
    rate_limit_rpm  INT DEFAULT 15,  -- Requests per minute (free tier)
    daily_quota     INT DEFAULT 1500,  -- Tokens or requests per day
    current_usage   INT DEFAULT 0,
    last_reset_at   TIMESTAMPTZ DEFAULT NOW(),
    is_local        BOOLEAN DEFAULT FALSE,  -- True for Ollama
    ollama_url      VARCHAR(500),  -- e.g., http://localhost:11434
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SCRAPE LOGS (for debugging)
CREATE TABLE scrape_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id      UUID REFERENCES channels(id),
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    messages_found  INT DEFAULT 0,
    messages_new    INT DEFAULT 0,
    jobs_extracted  INT DEFAULT 0,
    jobs_duplicates INT DEFAULT 0,
    errors          TEXT[],
    status          VARCHAR(20) DEFAULT 'running'  -- running, completed, failed
);

-- INDEXES
CREATE INDEX idx_jobs_channel ON jobs(channel_id);
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at DESC);
CREATE INDEX idx_jobs_deadline ON jobs(deadline);
CREATE INDEX idx_jobs_category ON jobs(job_category);
CREATE INDEX idx_jobs_location ON jobs(location_city);
CREATE INDEX idx_jobs_is_closed ON jobs(is_closed) WHERE is_closed = FALSE;
CREATE INDEX idx_jobs_search ON jobs USING GIN(search_vector);
CREATE INDEX idx_raw_messages_channel_msg ON raw_messages(channel_id, telegram_msg_id);
CREATE INDEX idx_user_prefs_user ON user_preferences(user_id);
CREATE INDEX idx_interactions_user ON user_job_interactions(user_id, created_at DESC);
```

---

## 6. CORE MODULES

### 6.1 Module: Telegram Scraper (services/scraper.js)

```javascript
/**
 * Scrapes public Telegram channels via t.me/s/channel_name
 * No API key needed — uses public web view
 */
class TelegramScraper {
  async scrapeChannel(channelUsername, limit = 50) {
    const url = `https://t.me/s/${channelUsername}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    return this.parseMessages(html, channelUsername);
  }

  parseMessages(html, channelUsername) {
    const $ = cheerio.load(html);
    const messages = [];

    $('.tgme_widget_message').each((_, el) => {
      const $msg = $(el);
      const msgId = $msg.attr('data-post')?.split('/')[1];
      const text = $msg.find('.tgme_widget_message_text').text().trim();
      const html_content = $msg.find('.tgme_widget_message_text').html();
      const views = parseInt($msg.find('.tgme_widget_message_views')?.text() || '0');
      const datetime = $msg.find('time')?.attr('datetime');

      const links = [];
      $msg.find('a').each((_, a) => {
        const href = $(a).attr('href');
        const linkText = $(a).text().trim();
        if (href && !href.startsWith('/')) {
          links.push({ url: href, text: linkText });
        }
      });

      messages.push({
        telegram_msg_id: parseInt(msgId),
        channel_username: channelUsername,
        message_text: text,
        message_html: html_content,
        posted_at: datetime ? new Date(datetime) : new Date(),
        views,
        extracted_links: links.map(l => l.url)
      });
    });

    return messages;
  }
}
```

### 6.2 Module: AI Extractor (services/ai-extractor.js)

```javascript
class AIExtractor {
  constructor(providerRouter) {
    this.router = providerRouter;
  }

  async extractJobs(rawMessage, channelConfig) {
    const prompt = this.buildExtractionPrompt(rawMessage, channelConfig);

    const response = await this.router.complete({
      prompt,
      systemPrompt: this.getSystemPrompt(),
      temperature: 0.1,
      maxTokens: 4000,
      responseFormat: { type: 'json_object' }
    });

    return this.validateAndParse(response, rawMessage);
  }

  buildExtractionPrompt(rawMessage, config) {
    return `You are an expert job data extractor. Extract ALL job postings from the following Telegram message.

CHANNEL CONTEXT:
- Channel: ${config.name}
- Type: ${config.type}
- Known patterns: ${config.patterns.join(', ')}

RAW MESSAGE:
${rawMessage.message_text}

LINKS IN MESSAGE:
${rawMessage.extracted_links.map(l => `- ${l}`).join('\n')}

INSTRUCTIONS:
1. Extract EVERY job position mentioned in this message (some messages have multiple jobs)
2. If the message is in Amharic or mixed Amharic/English, extract both languages
3. If a field is missing, use null — DO NOT guess
4. For "experience", extract as min_years and max_years. "0-2 years" -> min: 0, max: 2. "5+ years" -> min: 5, max: null
5. For "deadline", parse to YYYY-MM-DD format. Ethiopian calendar dates: convert to Gregorian
6. For "location", normalize to: "Addis Ababa", "Jimma", "Hawassa", "Remote", etc.
7. If the message mentions "Closed/Hired" or similar, mark is_closed: true
8. For "job_category", classify into ONE of: tech, health, finance, engineering, marketing, sales, admin, creative, ngo, education, logistics, hospitality, other
9. If salary is mentioned, extract numeric value in ETB
10. If the message says "various positions" with no details, set is_vague: true

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
- Return ONLY valid JSON, no markdown code blocks
- If NO jobs found, return empty array: []
- If message is an ad, spam, or non-job content, return empty array`;
  }

  getSystemPrompt() {
    return `You are JobExtract Pro, an AI specialized in parsing unstructured job postings from Telegram channels in Ethiopia. You understand both English and Amharic job postings. You are precise, conservative in guessing, and always return structured data.`;
  }
}
```

### 6.3 Module: Deep Link Navigator (services/deep-link-navigator.js)

```javascript
class DeepLinkNavigator {
  constructor(browserPool) {
    this.browser = browserPool;
  }

  async extractFromDeepLink(url, config) {
    const result = {
      success: false,
      jobs: [],
      fallback: false,
      error: null
    };

    try {
      const page = await this.browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      );

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const isBlocked = await this.detectBlocking(page);
      if (isBlocked) {
        result.error = 'Bot detection triggered';
        result.fallback = true;
        await page.close();
        return result;
      }

      const strategy = this.getStrategy(config, url);
      const extractedData = await strategy.extract(page, url);

      result.success = true;
      result.jobs = extractedData;

      await page.close();
    } catch (error) {
      result.error = error.message;
      result.fallback = true;
    }

    return result;
  }

  getStrategy(config, url) {
    const domain = new URL(url).hostname;

    const strategies = {
      'harmeejobs.com': new HarmeeJobsStrategy(),
      'ethiojobs.net': new EthiojobsStrategy(),
      'geezjobs.com': new GeezJobsStrategy(),
      'elelanjobs.com': new ElelanJobsStrategy(),
      'kebenajobs.com': new KebenaJobsStrategy(),
      'ethiojobshub.com': new EthioJobsHubStrategy(),
      'effoysira.com': new EffoySiraStrategy(),
      'afriworket.com': new AfriworkStrategy(),
      'hahujobs.com': new HahuJobsStrategy(),
      'linkedin.com': new LinkedInStrategy(),
    };

    return strategies[domain] || new GenericStrategy();
  }
}

// Strategy: harmeejobs.com — Company page -> List of jobs -> Click each for details
class HarmeeJobsStrategy {
  async extract(page, url) {
    await page.waitForSelector('.job-listing, .job-item, [class*="job"]', { timeout: 10000 });

    const jobs = await page.evaluate(() => {
      const jobCards = document.querySelectorAll('.job-listing, .job-item');
      return Array.from(jobCards).map(card => ({
        title: card.querySelector('h2, h3, .job-title')?.textContent?.trim(),
        company: document.querySelector('.company-name, h1')?.textContent?.trim(),
        location: card.querySelector('.location, [class*="location"]')?.textContent?.trim(),
        deadline: card.querySelector('.deadline, [class*="deadline"]')?.textContent?.trim(),
        link: card.querySelector('a')?.href,
        isExpired: card.textContent.toLowerCase().includes('expired')
      }));
    });

    const openJobs = jobs.filter(j => !j.isExpired && j.title);

    const detailedJobs = [];
    for (const job of openJobs.slice(0, 5)) {
      if (job.link) {
        try {
          await page.goto(job.link, { waitUntil: 'networkidle2', timeout: 20000 });
          const details = await page.evaluate(() => ({
            description: document.querySelector('.job-description, [class*="description"]')?.textContent?.trim(),
            requirements: Array.from(document.querySelectorAll('.requirements li, [class*="requirement"]')).map(li => li.textContent.trim()),
            salary: document.querySelector('.salary, [class*="salary"]')?.textContent?.trim(),
            howToApply: document.querySelector('.apply, [class*="apply"]')?.textContent?.trim()
          }));
          detailedJobs.push({ ...job, ...details });
        } catch (e) {
          detailedJobs.push(job);
        }
      }
    }

    return detailedJobs;
  }
}

// Strategy: ethiojobs.net — Company page -> Stack of ALL jobs (open + expired) -> "Read More" vs "Job Expired"
class EthiojobsStrategy {
  async extract(page, url) {
    await page.waitForSelector('.job-card, .vacancy-card, [class*="job"]', { timeout: 10000 });

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll('.job-card, .vacancy-card');
      return Array.from(cards).map(card => {
        const isExpired = card.querySelector('.expired, [class*="expired"]');
        const readMoreBtn = card.querySelector('.read-more, [class*="read-more"]');

        return {
          title: card.querySelector('h3, h4, .job-title')?.textContent?.trim(),
          isExpired: !!isExpired,
          readMoreLink: readMoreBtn?.href,
          postedDate: card.querySelector('.date, [class*="date"]')?.textContent?.trim(),
          location: card.querySelector('.location, [class*="location"]')?.textContent?.trim()
        };
      });
    });

    const openJobs = jobs.filter(j => !j.isExpired && j.readMoreLink && j.title);

    const detailedJobs = [];
    for (const job of openJobs.slice(0, 3)) {
      try {
        await page.goto(job.readMoreLink, { waitUntil: 'networkidle2', timeout: 20000 });
        const details = await page.evaluate(() => ({
          description: document.querySelector('.job-details, [class*="detail"]')?.innerText?.trim(),
          requirements: document.querySelector('.requirements, [class*="requirement"]')?.innerText?.trim(),
          deadline: document.querySelector('.deadline, [class*="deadline"]')?.textContent?.trim(),
          salary: document.querySelector('.salary, [class*="salary"]')?.textContent?.trim()
        }));
        detailedJobs.push({ ...job, ...details });
      } catch (e) {
        detailedJobs.push(job);
      }
    }

    return detailedJobs;
  }
}
```

---

## 7. AI PROVIDER ROUTER

### 7.1 Multi-Provider Configuration

```javascript
class AIProviderRouter {
  constructor(configs) {
    this.providers = this.initializeProviders(configs);
    this.currentIndex = 0;
  }

  initializeProviders(configs) {
    const providerMap = {
      'gemini': GeminiProvider,
      'deepseek': DeepSeekProvider,
      'claude': ClaudeProvider,
      'openai': OpenAIProvider,
      'ollama': OllamaProvider,
      'openrouter': OpenRouterProvider,
      'groq': GroqProvider,
      'kimi': KimiProvider
    };

    return configs
      .filter(c => c.is_active)
      .sort((a, b) => a.priority - b.priority)
      .map(c => new providerMap[c.provider_name](c));
  }

  async complete(params) {
    const errors = [];

    for (const provider of this.providers) {
      try {
        if (await provider.isRateLimited()) {
          console.log(`${provider.name} rate limited, skipping...`);
          continue;
        }

        const result = await provider.complete(params);
        await provider.trackUsage(result.usage);
        return { ...result, provider: provider.name };

      } catch (error) {
        errors.push({ provider: provider.name, error: error.message });
        console.error(`Provider ${provider.name} failed:`, error.message);
      }
    }

    throw new Error(`All AI providers failed: ${JSON.stringify(errors)}`);
  }
}
```

### 7.2 Free Tier Limits (as of June 2026)

| Provider | RPM | Daily Limit | Recommended Model | Notes |
|----------|-----|-------------|-------------------|-------|
| Gemini | 15 | 1500 req/day | gemini-1.5-flash-latest | Best free tier for extraction |
| DeepSeek | 10 | 10K tokens/day | deepseek-chat | Good for structured output |
| Claude | 5 | 100 req/day | claude-3-haiku-20240307 | Very restrictive free tier |
| OpenAI | 3 | 200 req/day | gpt-3.5-turbo | Only as last resort |
| Groq | 20 | 14,400 req/day | llama-3.1-8b-instant | Fastest, generous limits |
| OpenRouter | 20 | Varies | google/gemini-flash-1.5 | Aggregator, good fallback |
| Ollama | Unlimited | Unlimited | phi4:latest | Local, no limits but slower |

### 7.3 Load Balancing: Multiple Keys of Same Provider

```javascript
class GeminiProvider {
  constructor(configs) {
    this.keys = configs;  // Array of { apiKey, priority }
    this.currentKeyIndex = 0;
    this.name = 'gemini';
  }

  getNextKey() {
    const key = this.keys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    return key;
  }

  async complete(params) {
    const keyConfig = this.getNextKey();
    const genAI = new GoogleGenerativeAI(keyConfig.apiKey);
    const model = genAI.getGenerativeModel({ model: keyConfig.model });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
      generationConfig: {
        temperature: params.temperature || 0.1,
        maxOutputTokens: params.maxTokens || 4000,
        responseMimeType: 'application/json'
      }
    });

    return {
      content: result.response.text(),
      usage: { promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens }
    };
  }
}
```

---

## 8. SCRAPING PIPELINE

### 8.1 30-Minute Cron Job Flow

```
[CRON Trigger every 30 min]
    |
    v
Fetch Active Channels from DB
    |
    v
For each channel:
    |
    +---> Scrape t.me/s/channel (Cheerio)
    |         |
    |         +---> Parse HTML -> Extract messages
    |         |
    |         +---> Filter: Skip already scraped (by msg_id)
    |         |
    |         +---> Store raw_messages (status: pending)
    |
    +---> Queue: AI Extraction (BullMQ)
    |         |
    |         +---> AI parses message text -> JSON jobs
    |         |
    |         +---> Store extracted jobs (status: extracted)
    |
    +---> Queue: Deep Link Extraction (if links found)
    |         |
    |         +---> Puppeteer navigates to link
    |         |
    |         +---> Extract full job details from webpage
    |         |
    |         +---> Merge with AI-extracted data
    |         |
    |         +---> Fallback: If blocked, keep telegram-only data
    |
    +---> Deduplicate
    |         |
    |         +---> Exact link match
    |         |
    |         +---> Company + Title match
    |         |
    |         +---> Semantic similarity (if needed)
    |
    +---> Match against User Preferences
    |         |
    |         +---> Filter: Experience, Location, Category, etc.
    |         |
    |         +---> Exclude keywords check
    |
    +---> Queue: Push Notifications
              |
              +---> Send push to matching users
              |
              +---> Update user notification log
```

### 8.2 Scraping Configuration per Channel

```javascript
const CHANNEL_SCRAPE_CONFIGS = {
  'elelanajobs': {
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: true,
    linkSelector: 'inline_url',
    multiJobPerMessage: true,
    skipPatterns: ['Call For Pre-Employment Process', 'Employment Process'],
    priority: 'high'
  },

  'freelance_ethio': {
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: true,
    linkSelector: 'inline_url',
    skipPatterns: ['CLOSED'],
    priority: 'high'
  },

  'geezjobs_ethiopia': {
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: false,
    deepLinkFollow: 'optional',
    priority: 'medium'
  },

  'harmeejobs': {
    fetchLimit: 20,
    lookbackHours: 2,
    extractionStrategy: 'ai_partial',
    deepLinkRequired: true,
    deepLinkStrategy: 'company_page_to_jobs',
    linkSelector: 'inline_url',
    multiJobPerMessage: true,
    priority: 'high'
  },

  'Maroset': {
    fetchLimit: 30,
    lookbackHours: 4,
    extractionStrategy: 'ai_full',
    deepLinkRequired: false,
    skipPatterns: ['Closed/Hired'],
    priority: 'medium'
  },

  'ethiojobs_official': {
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_minimal',
    deepLinkRequired: true,
    deepLinkStrategy: 'stack_navigation',
    linkSelector: 'hyperlink',
    multiJobPerMessage: true,
    priority: 'high'
  },

  'ethio_job_vacancy1': {
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: true,
    linkSelector: 'inline_url',
    multiJobPerMessage: true,
    priority: 'medium'
  },

  'Ethiojobshubs': {
    fetchLimit: 20,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: true,
    skipPatterns: ['Mec.me', 'i.mec.me', 'Register', 'Verification'],
    deduplicationWeight: 'high',
    priority: 'low'
  },

  'hahujobs': {
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: false,
    deepLinkFollow: 'optional',
    buttonLinks: true,
    priority: 'high'
  },

  'josad_it': {
    fetchLimit: 20,
    lookbackHours: 2,
    extractionStrategy: 'ai_partial',
    deepLinkRequired: true,
    linkSelector: 'inline_url',
    sourceTracking: true,
    priority: 'medium'
  },

  'josad_software': {
    fetchLimit: 20,
    lookbackHours: 2,
    extractionStrategy: 'ai_partial',
    deepLinkRequired: true,
    linkSelector: 'inline_url',
    sourceTracking: true,
    priority: 'medium'
  },

  'effoyjobs': {
    fetchLimit: 30,
    lookbackHours: 2,
    extractionStrategy: 'ai_full',
    deepLinkRequired: false,
    deepLinkFollow: 'optional',
    skipPatterns: ['BMK Crafts', 'gift', 'ስጦታ'],
    priority: 'medium'
  }
};
```

---

## 9. DEEP LINK EXTRACTION

### 9.1 Extraction Depth Levels

| Level | Description | Example | Fallback |
|-------|-------------|---------|----------|
| L0 | No link needed | Maroset | N/A |
| L1 | Direct job page | elelanajobs.com/job/... | Store link + basic info |
| L2 | Job board page | ethiojobshub.com/... | Store link + message highlights |
| L3 | Company page -> job list | harmeejobs.com/company/... | Extract job list, skip details |
| L4 | Company page -> stack (open+expired) | ethiojobs.net/company/... | Find "Read More" buttons, skip expired |
| L5 | Dynamic JS-rendered | hahujobs.com (SPA) | Puppeteer + wait for hydration |
| L6 | Anti-bot protected | Some LinkedIn, Indeed | Mark for manual review, store link |

### 9.2 Fallback Chain

```
Deep Link Request
    |
    +---> Try Puppeteer with stealth plugin
    |         |
    |         +---> Success -> Extract structured data
    |         |
    |         +---> Bot detected / Timeout
    |                   |
    |                   +---> Try with different User-Agent + proxy
    |                             |
    |                             +---> Success -> Extract
    |                             |
    |                             +---> Still blocked
    |                                       |
    |                                       +---> Fallback: Store link + AI-extracted data from Telegram message
    |                                               (Mark as "extraction_method: telegram_only")
    |
    +---> No link in message
              |
              +---> Use AI extraction from message text only
                      (Mark as "extraction_method: telegram_only")
```

### 9.3 Button Link Handling (hahujobs, geezjobs)

```javascript
function extractButtonLinks(messageHtml) {
  const $ = cheerio.load(messageHtml);
  const buttons = [];

  $('.tgme_widget_message_inline_button, .reply_markup_button').each((_, btn) => {
    const text = $(btn).text().trim();
    const href = $(btn).attr('href');

    if (text.toLowerCase().includes('detail') || 
        text.toLowerCase().includes('apply') ||
        text.toLowerCase().includes('read more')) {
      buttons.push({ text, url: href });
    }
  });

  return buttons;
}
```

---

## 10. DUPLICATE DETECTION

### 10.1 Multi-Layer Deduplication

```javascript
class DeduplicationEngine {
  async deduplicate(newJobs, existingJobs) {
    const duplicates = [];

    for (const newJob of newJobs) {
      let isDuplicate = false;
      let matchedJob = null;
      let method = null;

      // Layer 1: Exact link match (fastest)
      if (newJob.source_url) {
        const exactMatch = existingJobs.find(ej => 
          ej.source_url === newJob.source_url ||
          ej.deep_extracted_url === newJob.source_url
        );
        if (exactMatch) {
          isDuplicate = true;
          matchedJob = exactMatch;
          method = 'exact_link';
        }
      }

      // Layer 2: Company + Title match (heuristic)
      if (!isDuplicate && newJob.company_name && newJob.title) {
        const normalizedTitle = this.normalizeText(newJob.title);
        const normalizedCompany = this.normalizeText(newJob.company_name);

        const titleMatch = existingJobs.find(ej => {
          const ejTitle = this.normalizeText(ej.title);
          const ejCompany = this.normalizeText(ej.company_name);
          return ejCompany === normalizedCompany && 
                 this.similarity(ejTitle, normalizedTitle) > 0.85;
        });

        if (titleMatch) {
          isDuplicate = true;
          matchedJob = titleMatch;
          method = 'company_title_match';
        }
      }

      // Layer 3: Semantic similarity (AI-powered, slower)
      if (!isDuplicate) {
        const candidates = existingJobs.filter(ej => 
          Math.abs(new Date(ej.posted_at) - new Date(newJob.posted_at)) < 7 * 24 * 60 * 60 * 1000
        );

        for (const candidate of candidates) {
          const similarity = await this.semanticSimilarity(newJob, candidate);
          if (similarity > 0.92) {
            isDuplicate = true;
            matchedJob = candidate;
            method = 'semantic_similarity';
            break;
          }
        }
      }

      if (isDuplicate) {
        duplicates.push({
          newJob,
          matchedJob,
          method,
          groupId: matchedJob.duplicate_group_id
        });
      }
    }

    return duplicates;
  }

  normalizeText(text) {
    return text
      ?.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  similarity(a, b) {
    const setA = new Set(a.split(' '));
    const setB = new Set(b.split(' '));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return intersection.size / (setA.size + setB.size - intersection.size);
  }

  async semanticSimilarity(jobA, jobB) {
    const cacheKey = `embed:${jobA.id}:${jobB.id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return parseFloat(cached);

    const textA = `${jobA.title} ${jobA.company_name} ${jobA.description?.slice(0, 500)}`;
    const textB = `${jobB.title} ${jobB.company_name} ${jobB.description?.slice(0, 500)}`;

    const embeddingA = await this.getEmbedding(textA);
    const embeddingB = await this.getEmbedding(textB);

    const similarity = this.cosineSimilarity(embeddingA, embeddingB);
    await redis.setex(cacheKey, 86400, similarity.toString());

    return similarity;
  }

  cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
```

### 10.2 Deduplication Rules

| Scenario | Action | Example |
|----------|--------|---------|
| Same link, same channel | Skip entirely | Ethiojobshubs reposts elelanajobs |
| Same link, different channel | Mark as duplicate, keep first seen as primary | josad_it reposts from harmeejobs |
| Same company + similar title, different link | Mark as duplicate (repost with different URL) | Same job on company site vs job board |
| Same company + different title | NOT duplicate | Company hiring for multiple positions |
| Similar description, different company | NOT duplicate | Different companies, similar role |
| Reposted after 30 days | NOT duplicate (refresh) | Job reposted after initial posting expired |

---

## 11. USER PREFERENCES & FILTERING

### 11.1 Preference Schema (Revisited)

You asked about "exclude keywords" vs "experience filter" — here's the distinction:

| Filter | What It Does | Example |
|--------|-------------|---------|
| Experience Range | Numeric range filter | "0-2 years" -> matches jobs requiring 0-2 years |
| Exclude Keywords | Text-based rejection | If job description contains "5+ years required" -> filter out even if title doesn't say "senior" |

Why both are needed:
- A job might say "Junior Developer" (title) but require "3+ years experience" (description)
- The experience filter catches the structured "3 years" part
- The exclude keyword catches phrases like "senior only", "extensive experience", "proven track record of 5+ years"

### 11.2 Filter Engine

```javascript
class FilterEngine {
  matches(job, prefs) {
    // Experience check
    if (prefs.min_experience_years !== null && 
        job.min_experience_years !== null &&
        job.min_experience_years > prefs.max_experience_years) {
      return false;
    }

    if (prefs.max_experience_years !== null &&
        job.max_experience_years !== null &&
        job.max_experience_years < prefs.min_experience_years) {
      return false;
    }

    // Job category check
    if (prefs.job_categories.length > 0 && job.job_category) {
      if (!prefs.job_categories.includes(job.job_category)) {
        return false;
      }
    }

    // Location check
    if (prefs.locations.length > 0 && job.location_city) {
      const locationMatch = prefs.locations.some(loc => 
        job.location_city.toLowerCase().includes(loc.toLowerCase()) ||
        (job.is_remote && loc.toLowerCase() === 'remote')
      );
      if (!locationMatch) return false;
    }

    // Addis Ababa area check (only if location is Addis Ababa)
    if (job.location_city === 'Addis Ababa' && prefs.addis_ababa_areas.length > 0) {
      const areaMatch = prefs.addis_ababa_areas.some(area =>
        job.location?.toLowerCase().includes(area.toLowerCase()) ||
        job.location_area?.toLowerCase().includes(area.toLowerCase())
      );
      if (!areaMatch) return false;
    }

    // Work type check
    if (prefs.work_types.length > 0 && job.work_type) {
      if (!prefs.work_types.includes(job.work_type)) {
        return false;
      }
    }

    // Employment type check
    if (prefs.employment_types.length > 0 && job.employment_type) {
      if (!prefs.employment_types.includes(job.employment_type)) {
        return false;
      }
    }

    // Exclude keywords check
    if (prefs.exclude_keywords.length > 0) {
      const jobText = `${job.title} ${job.description} ${job.requirements?.join(' ')}`.toLowerCase();
      const hasExcludedKeyword = prefs.exclude_keywords.some(kw => 
        jobText.includes(kw.toLowerCase())
      );
      if (hasExcludedKeyword) return false;
    }

    // Salary check (optional, low priority)
    if (prefs.min_salary_etb && job.salary_max_etb && job.salary_max_etb < prefs.min_salary_etb) {
      return false;
    }

    return true;
  }
}
```

---

## 12. NOTIFICATION SYSTEM

### 12.1 Push Notification (PWA)

```javascript
// Service Worker (sw.js)
self.addEventListener('push', event => {
  const data = event.data.json();

  const options = {
    body: `${data.company} - ${data.title}`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: `job-${data.jobId}`,
    requireInteraction: true,
    actions: [
      { action: 'view', title: 'View Job' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: { jobId: data.jobId, url: data.url }
  };

  event.waitUntil(
    self.registration.showNotification('New Job Match!', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow(`/jobs/${event.notification.data.jobId}`)
    );
  }
});
```

### 12.2 Notification Triggers

| Trigger | When | Who |
|---------|------|-----|
| New matching job | Job scraped + passes user filters | User who matches |
| Job expiring soon | Deadline < 3 days away | Users who saved the job |
| Daily digest | Daily at 9 AM | All users (optional) |
| Weekly summary | Weekly on Monday | All users (optional) |

---

## 13. PWA IMPLEMENTATION

### 13.1 next-pwa Configuration

```javascript
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/your-api\.com\/api\/jobs/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'jobs-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 86400 }
      }
    },
    {
      urlPattern: /^https:\/\/t\.me\/s\//,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'telegram-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 3600 }
      }
    }
  ]
});

module.exports = withPWA({
  // your Next.js config
});
```

### 13.2 Manifest

```json
{
  "name": "EthioJob Hunter",
  "short_name": "JobHunter",
  "description": "AI-powered job aggregator for Ethiopian Telegram channels",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 14. DEPLOYMENT STRATEGY

### 14.1 Free Tier Architecture

```
Vercel (Frontend + API Routes)
    |
    +---> Next.js app (PWA)
    |
    +---> API Routes (if using Next.js API routes for backend)

Render/Railway (Backend — if separate)
    |
    +---> Node.js + Express
    |
    +---> BullMQ worker processes

Supabase (Database)
    |
    +---> PostgreSQL (500MB free)
    |
    +---> Auth (built-in)
    |
    +---> Storage (for avatars, etc.)

Upstash (Redis)
    |
    +---> Redis (30MB free — enough for queues)
    |
    +---> Rate limiting
```

### 14.2 Keeping Render Alive (if using Render)

```javascript
// Add a health check endpoint that a cron job pings every 10 minutes
// Using a free cron service like cron-job.org or UptimeRobot

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### 14.3 Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# AI Providers (add as many as you have)
GEMINI_API_KEY=...
GEMINI_API_KEY_2=...  # Second key for load balancing
DEEPSEEK_API_KEY=...
CLAUDE_API_KEY=...
OPENAI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
KIMI_API_KEY=...

# Ollama (local fallback)
OLLAMA_URL=http://localhost:11434

# App
NODE_ENV=production
SCRAPE_INTERVAL_MINUTES=30
MAX_DEEP_LINK_DEPTH=3
PUPPETEER_TIMEOUT=30000

# Push Notifications (VAPID keys)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-email@example.com
```

---

## 15. PHASE ROADMAP

### Phase 1: MVP (Weeks 1-2)
- [ ] Set up Next.js + Supabase project
- [ ] Implement Telegram scraper (Cheerio) for 3 channels (elelanajobs, Maroset, geezjobs)
- [ ] Integrate 1 AI provider (Gemini free tier)
- [ ] Basic job extraction from message text only (no deep links)
- [ ] Simple job feed with basic filtering
- [ ] Single user (no auth yet)

### Phase 2: Core Features (Weeks 3-4)
- [ ] Add all 12 channels
- [ ] Implement deep link extraction (Puppeteer) for L1-L2
- [ ] Multi-provider AI router (Gemini + Groq + Ollama fallback)
- [ ] User authentication (Supabase Auth)
- [ ] User preferences + filtering
- [ ] Deduplication (exact link + company/title match)
- [ ] PWA setup (next-pwa)

### Phase 3: Polish (Weeks 5-6)
- [ ] Deep link extraction for L3-L4 (harmeejobs, ethiojobs_official)
- [ ] Semantic deduplication
- [ ] Push notifications
- [ ] Data retention (purge after X days)
- [ ] Admin dashboard (channel health, scrape logs)
- [ ] Performance optimization (caching, query optimization)

### Phase 4: Advanced (Weeks 7-8)
- [ ] Anti-bot evasion strategies
- [ ] Salary extraction and filtering
- [ ] Job application tracking
- [ ] Export to CSV/Excel
- [ ] Mobile app (Capacitor wrapper around PWA)

---

## 16. CHANNEL CONFIG SCHEMA

### 16.1 Adding a New Channel — Required Steps

> CRITICAL: Before adding ANY channel, you MUST:
> 1. Visit t.me/s/channel_name and scroll through the last 100 messages
> 2. Document the posting pattern (format, links, buttons, language)
> 3. Identify skip patterns (ads, spam, non-job content)
> 4. Determine deep link complexity
> 5. Test scrape with Cheerio to confirm HTML structure

### 16.2 Channel Config Object

```javascript
const newChannelConfig = {
  // REQUIRED
  telegram_username: 'channel_name',  // Without @
  display_name: 'Human-readable name',
  channel_type: 'job_board',  // job_board | recruiter | aggregator | curator | freelance_board

  // SCRAPING
  fetchLimit: 30,  // Messages per scrape
  lookbackHours: 2,  // Only process messages newer than this

  // EXTRACTION
  extractionStrategy: 'ai_full',  // ai_full | ai_partial | ai_minimal

  // DEEP LINKS
  deepLinkRequired: true,  // Must follow link for full details?
  deepLinkStrategy: 'direct_job_page',  // See strategies below
  deepLinkFollow: 'required',  // required | optional | none

  // LINK DETECTION
  linkSelector: 'inline_url',  // inline_url | hyperlink | button | mixed
  buttonLinks: false,  // Has Telegram inline buttons?

  // MULTI-JOB
  multiJobPerMessage: true,  // One message can have multiple jobs?

  // FILTERING
  skipPatterns: ['spam_keyword', 'ad_keyword'],  // Skip messages containing these

  // DEDUPLICATION
  deduplicationWeight: 'medium',  // low | medium | high (reposters = high)

  // PRIORITY
  priority: 'high',  // high | medium | low

  // NOTES (for documentation)
  notes: 'Any special observations about this channel'
};
```

### 16.3 Deep Link Strategies

| Strategy | Description | Channels |
|----------|-------------|----------|
| `none` | No links in message | Maroset |
| `direct_job_page` | Link goes directly to job details | elelanajobs, freelance_ethio, ethio_job_vacancy1 |
| `job_board_page` | Link goes to job board with this job | effoyjobs |
| `company_page_to_jobs` | Link goes to company page with job list | harmeejobs |
| `stack_navigation` | Company page with stack of all jobs (open + expired) | ethiojobs_official |
| `dynamic_spa` | JavaScript-rendered single page app | hahujobs |
| `curator_redirect` | Link redirects to original source | josad_it, josad_software |

---

## 17. APPENDIX: SCRAPING NOTES PER CHANNEL

### elelanajobs
- **HTML Structure**: Messages wrapped in `.tgme_widget_message`
- **Text Selector**: `.tgme_widget_message_text`
- **Link Pattern**: Raw URLs in text, usually after "Find More Details here"
- **Multi-job**: Yes — company header followed by numbered positions
- **Special Handling**: Skip "Call For Pre-Employment Process" posts
- **Domains**: kebenajobs.com, elelanajobs.com, application.eecproducts.com

### freelance_ethio (Afriwork)
- **HTML Structure**: Highly structured with bold labels
- **Link Pattern**: Usually single link at bottom to afriworket.com
- **Closed Marker**: "- - - - - - - - CLOSED - - - - - - - -"
- **Amharic**: Some posts entirely in Amharic
- **Special Handling**: Extract "Verified Company" status

### geezjobs_ethiopia
- **HTML Structure**: Markdown-style formatting in Telegram
- **Link Pattern**: Usually geezjobs.com/... in message
- **Full Details**: Most info in message — deep link optional
- **Hashtags**: #fulltime, #permanent, #parttime, #contract
- **Salary**: Sometimes included as "Salary: Xk - Yk Net"

### harmeejobs
- **HTML Structure**: Amharic framing text + position list
- **Link Pattern**: "Read Detail:- https://harmeejobs.com/company/.../"
- **Deep Link**: Company page -> job list -> individual jobs
- **Multi-job**: Yes — multiple positions per company
- **Amharic**: Heavy Amharic usage

### Maroset
- **HTML Structure**: Plain text with "Closed/Hired" header
- **Link Pattern**: NONE — all data in message
- **Easiest Channel**: No deep links needed
- **View Rate**: Extract the colored indicator (green/yellow/red)
- **Salary**: Always present, even if "Attractive and negotiable"

### ethiojobs_official
- **HTML Structure**: Minimal text, hyperlinked "LINK"
- **Link Pattern**: "Click here to Apply: LINK" — LINK is <a> tag
- **Deep Link Nightmare**: Company page -> stack of ALL jobs -> find open ones
- **Minimal Info**: Only company name in message
- **Category Posts**: Sometimes generic "IT Jobs" with broad link

### ethio_job_vacancy1
- **HTML Structure**: Emoji-heavy formatting
- **Link Pattern**: Raw URL at bottom
- **Amharic Headers**: "★ [Amharic text]" at top
- **Multi-job**: Yes — multiple positions per message
- **Domain**: ethiojobshub.com (WordPress, usually no bot protection)

### Ethiojobshubs
- **HTML Structure**: Repost format, two variants
- **Link Pattern**: Links to elelanjobs.com or other sources
- **Spam Filter**: Must skip Mec.me referral links
- **High Duplication**: Mostly reposts from other channels
- **Priority**: Low — only scrape if not found elsewhere

### hahujobs
- **HTML Structure**: Hashtags + structured fields
- **Link Pattern**: Inline buttons (Details/Apply) — not raw URLs
- **Amharic**: Job duties often in Amharic
- **Experience Range**: Both min and max years given
- **Dynamic Site**: hahujobs.com may be SPA

### josad_it & josad_software
- **HTML Structure**: Curator format with source hashtags
- **Link Pattern**: Varies — may link to original or josad site
- **Truncated**: "... view detail" indicates cut-off content
- **Source Tracking**: Extract #hashtag to know original source
- **Focus**: josad_it = IT, josad_software = Software dev

### effoyjobs
- **HTML Structure**: Box characters (■, □) as markers
- **Link Pattern**: Sometimes no link, sometimes effoysira.com
- **Amharic**: Some posts entirely in Amharic
- **Non-job Filter**: Skip BMK Crafts and gift advertisements
- **Structured**: Very consistent format

---

## 18. RISK MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Telegram blocks scraping | Medium | High | Rotate User-Agents, add delays, use proxy pool |
| AI API rate limits | High | Medium | Multi-provider router, Ollama fallback, queue throttling |
| Deep link sites block bots | High | Medium | Stealth Puppeteer, fallback to message-only extraction |
| Job sites change structure | Medium | High | Domain-specific strategies, monitoring, alerts |
| Data volume exceeds free tier | Medium | Medium | Purge old data, optimize queries, upgrade if needed |
| Amharic text breaks extraction | Low | Medium | Test with mixed-language prompts, fallback to English |
| Duplicate false positives | Medium | Low | Tweak similarity thresholds, manual review for edge cases |

---

## 19. SUCCESS METRICS

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Jobs scraped per day | 50-100 | Count from scrape_logs |
| AI extraction accuracy | >85% | Manual spot-check of 20 random jobs |
| Deep link success rate | >60% | Count successful vs fallback extractions |
| Deduplication accuracy | >95% | Manual review of flagged duplicates |
| User engagement | Daily active users | Track logins and job views |
| Notification relevance | >80% click-through | Track push notification opens |
| System uptime | >99% | Uptime monitoring |

---

*End of Document*
*Generated: June 15, 2026*
*Next Review: After Phase 1 completion*
