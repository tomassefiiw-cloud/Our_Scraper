/**
 * SQLite schema — initialized client-side via sql.js.
 * Mirrors the §5 SQL spec but simplified for SQLite (no JSONB, no arrays —
 * we store arrays as JSON text columns).
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS channels (
  username TEXT PRIMARY KEY,
  display_name TEXT,
  channel_type TEXT,
  is_active INTEGER DEFAULT 1,
  last_scraped_at TEXT,
  config_json TEXT
);

CREATE TABLE IF NOT EXISTS raw_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_username TEXT NOT NULL,
  telegram_msg_id INTEGER NOT NULL,
  message_text TEXT,
  message_html TEXT,
  posted_at TEXT,
  views INTEGER DEFAULT 0,
  extracted_links_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_username, telegram_msg_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  raw_message_id INTEGER,
  channel_username TEXT,
  title TEXT,
  title_amharic TEXT,
  company_name TEXT,
  company_name_amharic TEXT,
  job_category TEXT,
  job_categories_json TEXT DEFAULT '[]',
  employment_type TEXT,
  work_type TEXT,
  min_experience_years INTEGER,
  max_experience_years INTEGER,
  experience_text TEXT,
  location TEXT,
  location_city TEXT,
  location_area TEXT,
  is_remote INTEGER DEFAULT 0,
  salary_text TEXT,
  salary_min_etb INTEGER,
  salary_max_etb INTEGER,
  description TEXT,
  requirements_json TEXT DEFAULT '[]',
  responsibilities_json TEXT DEFAULT '[]',
  how_to_apply TEXT,
  application_link TEXT,
  application_email TEXT,
  deadline TEXT,
  is_closed INTEGER DEFAULT 0,
  is_vague INTEGER DEFAULT 0,
  source_url TEXT,
  ai_provider_used TEXT,
  ai_confidence REAL DEFAULT 0.5,
  extraction_method TEXT DEFAULT 'telegram_only',
  duplicate_group_id TEXT,
  is_primary INTEGER DEFAULT 1,
  posted_at TEXT,
  scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(job_category);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location_city);
CREATE INDEX IF NOT EXISTS idx_jobs_closed ON jobs(is_closed);
CREATE INDEX IF NOT EXISTS idx_jobs_channel ON jobs(channel_username);

CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1,
  min_experience_years INTEGER DEFAULT 0,
  max_experience_years INTEGER DEFAULT 50,
  job_categories_json TEXT DEFAULT '[]',
  locations_json TEXT DEFAULT '[]',
  addis_ababa_areas_json TEXT DEFAULT '[]',
  work_types_json TEXT DEFAULT '[]',
  employment_types_json TEXT DEFAULT '[]',
  exclude_keywords_json TEXT DEFAULT '[]',
  min_salary_etb INTEGER,
  max_salary_etb INTEGER,
  notify_push INTEGER DEFAULT 1,
  purge_after_days INTEGER DEFAULT 30
);

CREATE TABLE IF NOT EXISTS user_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, action)
);

CREATE INDEX IF NOT EXISTS idx_interactions_action ON user_interactions(action);

-- Seed default preferences row
INSERT OR IGNORE INTO user_preferences (id) VALUES (1);
`;

export interface JobRow {
  id: string;
  raw_message_id: number | null;
  channel_username: string | null;
  title: string | null;
  title_amharic: string | null;
  company_name: string | null;
  company_name_amharic: string | null;
  job_category: string | null;
  job_categories_json: string;
  employment_type: string | null;
  work_type: string | null;
  min_experience_years: number | null;
  max_experience_years: number | null;
  experience_text: string | null;
  location: string | null;
  location_city: string | null;
  location_area: string | null;
  is_remote: number;
  salary_text: string | null;
  salary_min_etb: number | null;
  salary_max_etb: number | null;
  description: string | null;
  requirements_json: string;
  responsibilities_json: string;
  how_to_apply: string | null;
  application_link: string | null;
  application_email: string | null;
  deadline: string | null;
  is_closed: number;
  is_vague: number;
  source_url: string | null;
  ai_provider_used: string | null;
  ai_confidence: number;
  extraction_method: string;
  duplicate_group_id: string | null;
  is_primary: number;
  posted_at: string | null;
  scraped_at: string;
}

export interface UserPreferencesRow {
  min_experience_years: number;
  max_experience_years: number;
  job_categories_json: string;
  locations_json: string;
  addis_ababa_areas_json: string;
  work_types_json: string;
  employment_types_json: string;
  exclude_keywords_json: string;
  min_salary_etb: number | null;
  max_salary_etb: number | null;
  notify_push: number;
  purge_after_days: number;
}

export interface RawMessageRow {
  id: number;
  channel_username: string;
  telegram_msg_id: number;
  message_text: string | null;
  message_html: string | null;
  posted_at: string | null;
  views: number;
  extracted_links_json: string;
  status: string;
}
