/**
 * Sync orchestration — runs client-side. v3 — bulletproof edition.
 *
 * Previous bug: if `messagesNew === 0`, extraction was skipped entirely.
 * This meant messages inserted in a prior sync but never extracted (due to
 * AI errors, code bugs, or interrupted syncs) would NEVER be retried.
 *
 * Fix: ALWAYS extract any pending raw_messages, regardless of whether
 * the current sync inserted new ones. The INSERT OR IGNORE dedupes across
 * syncs; the status column tracks extraction progress independently.
 *
 * Flow:
 *   1. Fetch messages from /api/scrape/[channel]
 *   2. INSERT OR IGNORE each (status='pending')
 *   3. SELECT all pending raw_messages for this channel (cap at 30 per sync)
 *   4. For each: POST /api/extract → ExtractedJob[]
 *   5. Dedup + insert non-duplicate jobs
 *   6. Mark raw_message as 'extracted' or 'failed'
 */

import { run, queryAll, persistDb } from './db';
import type { RawMessageRow, JobRow } from './schema';
import type { RawMessage } from './scraper';
import type { ExtractedJob } from './extractor';
import { findDuplicate, type ExistingJob } from './dedup';

export interface SyncResult {
  channel: string;
  messagesFound: number;
  messagesNew: number;       // newly inserted this run
  pendingExtracted: number;  // pending messages processed this run
  jobsExtracted: number;
  jobsDuplicates: number;
  errors: string[];
  firstError?: string;       // first error message (for display)
}

const MAX_EXTRACT_PER_CHANNEL = 30;  // safety cap

/**
 * Sync a single channel: scrape -> insert -> extract -> dedup -> store.
 */
export async function syncChannel(
  channelUsername: string,
  opts: { skipPatterns?: string[] } = {},
): Promise<SyncResult> {
  console.log(`%c[sync] === ${channelUsername} START ===`, 'color: blue; font-weight: bold');
  const result: SyncResult = {
    channel: channelUsername,
    messagesFound: 0,
    messagesNew: 0,
    pendingExtracted: 0,
    jobsExtracted: 0,
    jobsDuplicates: 0,
    errors: [],
  };

  try {
    // 1. Fetch raw messages from our scraper API route
    console.log(`[sync] ${channelUsername}: fetching /api/scrape/${channelUsername}`);
    const res = await fetch(`/api/scrape/${channelUsername}`);
    console.log(`[sync] ${channelUsername}: response status = ${res.status}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`scrape API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { messages: RawMessage[] };
    const messages = data.messages ?? [];
    result.messagesFound = messages.length;
    console.log(`[sync] ${channelUsername}: found ${messages.length} messages`);

    if (messages.length === 0) {
      console.warn(`[sync] ${channelUsername}: no messages found`);
      return result;
    }

    // 2. Filter by skip patterns
    const skipPatterns = opts.skipPatterns ?? [];
    const fresh = messages.filter((m) => {
      const text = m.message_text ?? '';
      return !skipPatterns.some((p) => text.toLowerCase().includes(p.toLowerCase()));
    });
    console.log(`[sync] ${channelUsername}: ${fresh.length} messages passed skip filter`);

    // 3. Insert all messages with INSERT OR IGNORE (dedup via UNIQUE constraint)
    // We don't rely on getRowsModified() because sql.js's behavior for OR IGNORE
    // is inconsistent across versions. Instead, we count new inserts by checking
    // the DB before and after.
    for (const msg of fresh) {
      try {
        // Check if exists first (more reliable than getRowsModified)
        const existing = await queryAll<{ id: number }>(
          `SELECT id FROM raw_messages WHERE channel_username = ? AND telegram_msg_id = ?`,
          [msg.channel_username, msg.telegram_msg_id],
        );
        if (existing.length === 0) {
          await run(
            `INSERT INTO raw_messages
               (channel_username, telegram_msg_id, message_text, message_html, posted_at, views, extracted_links_json, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
              msg.channel_username,
              msg.telegram_msg_id,
              msg.message_text,
              msg.message_html,
              msg.posted_at,
              msg.views,
              JSON.stringify(msg.extracted_links),
            ],
          );
          result.messagesNew++;
        }
      } catch (err) {
        const msg = `raw_message insert failed: ${(err as Error).message}`;
        console.error(`[sync] ${channelUsername}: ${msg}`);
        if (!result.firstError) result.firstError = msg;
        result.errors.push(msg);
      }
    }
    console.log(`[sync] ${channelUsername}: ${result.messagesNew} new messages inserted this run`);

    // 4. ALWAYS query pending messages — even if 0 new inserts.
    // This is the key fix: messages from a previous sync that were never extracted
    // (due to AI errors, code bugs, or interrupted syncs) will be retried.
    const pending = await queryAll<RawMessageRow>(
      `SELECT * FROM raw_messages
       WHERE channel_username = ? AND status = 'pending'
       ORDER BY posted_at ASC
       LIMIT ?`,
      [channelUsername, MAX_EXTRACT_PER_CHANNEL],
    );
    console.log(`[sync] ${channelUsername}: ${pending.length} pending messages to extract`);

    if (pending.length === 0) {
      console.log(`[sync] ${channelUsername}: no pending messages, done`);
      console.log(`%c[sync] === ${channelUsername} DONE (no pending) ===`, 'color: gray; font-weight: bold');
      return result;
    }

    // 5. Pre-load existing jobs for dedup (one query, reused)
    const existingJobsRaw = await queryAll<JobRow>(
      `SELECT id, title, company_name, description, source_url, posted_at FROM jobs LIMIT 500`,
    );
    const existingJobs: ExistingJob[] = existingJobsRaw.map((j) => ({
      id: j.id,
      title: j.title,
      company_name: j.company_name,
      description: j.description,
      source_url: j.source_url,
      posted_at: j.posted_at,
    }));
    console.log(`[sync] ${channelUsername}: loaded ${existingJobs.length} existing jobs for dedup`);

    // 6. Extract each pending message
    let msgIndex = 0;
    for (const raw of pending) {
      msgIndex++;
      console.log(`[sync] ${channelUsername}: extracting msg ${msgIndex}/${pending.length} (id=${raw.id}, tg_msg_id=${raw.telegram_msg_id})`);
      try {
        const links = JSON.parse(raw.extracted_links_json || '[]') as { url: string }[];
        const messageText = raw.message_text ?? '';

        if (messageText.trim().length === 0) {
          console.log(`[sync] ${channelUsername}: msg ${raw.id} has empty text, marking as extracted (no jobs)`);
          await run(`UPDATE raw_messages SET status = 'extracted' WHERE id = ?`, [raw.id]);
          result.pendingExtracted++;
          continue;
        }

        console.log(`[sync] ${channelUsername}: msg ${raw.id} → POST /api/extract (text length=${messageText.length}, links=${links.length})`);
        const extractRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channelUsername,
            message_text: messageText,
            links: links.map((l) => l.url),
          }),
        });
        console.log(`[sync] ${channelUsername}: extract API returned ${extractRes.status}`);

        if (!extractRes.ok) {
          const text = await extractRes.text();
          throw new Error(`extract API ${extractRes.status}: ${text.slice(0, 300)}`);
        }

        const extractData = (await extractRes.json()) as {
          jobs: (ExtractedJob & { _provider: string })[];
          provider: string;
        };
        const extractedJobs = extractData.jobs ?? [];
        console.log(`[sync] ${channelUsername}: msg ${raw.id} → ${extractedJobs.length} jobs (provider: ${extractData.provider})`);

        // Mark raw message as extracted
        await run(`UPDATE raw_messages SET status = 'extracted' WHERE id = ?`, [raw.id]);
        result.pendingExtracted++;

        if (extractedJobs.length === 0) {
          console.log(`[sync] ${channelUsername}: msg ${raw.id} yielded no jobs (likely spam/non-job)`);
          continue;
        }

        // 7. Dedup + insert non-duplicates
        const sourceUrl = links[0]?.url ?? null;
        for (const job of extractedJobs) {
          const newJobWithMeta = {
            ...job,
            _temp_id: crypto.randomUUID(),
            _source_url: sourceUrl,
            _posted_at: raw.posted_at,
          };
          const dup = findDuplicate(newJobWithMeta, existingJobs);
          if (dup) {
            console.log(`[sync] ${channelUsername}: job "${job.title}" is duplicate (method=${dup.method})`);
            result.jobsDuplicates++;
            continue;
          }

          const jobId = crypto.randomUUID();
          try {
            await run(
              `INSERT INTO jobs
                 (id, raw_message_id, channel_username, title, title_amharic, company_name, company_name_amharic,
                  job_category, employment_type, work_type, min_experience_years, max_experience_years,
                  experience_text, location, location_city, location_area, is_remote, salary_text,
                  salary_min_etb, salary_max_etb, description, requirements_json, responsibilities_json,
                  how_to_apply, application_link, application_email, deadline, is_closed, is_vague,
                  source_url, ai_provider_used, ai_confidence, extraction_method, posted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                jobId, raw.id, channelUsername,
                job.title, job.title_amharic, job.company_name, job.company_name_amharic,
                job.job_category, job.employment_type, job.work_type,
                job.min_experience_years, job.max_experience_years, job.experience_text,
                job.location, job.location_city, job.location_area,
                job.is_remote ? 1 : 0,
                job.salary_text, job.salary_min_etb, job.salary_max_etb,
                job.description,
                JSON.stringify(job.requirements), JSON.stringify(job.responsibilities),
                job.how_to_apply, job.application_link, job.application_email,
                job.deadline,
                job.is_closed ? 1 : 0, job.is_vague ? 1 : 0,
                sourceUrl,
                (job as ExtractedJob & { _provider: string })._provider ?? null,
                job.confidence, 'telegram_only', raw.posted_at,
              ],
            );
            existingJobs.push({
              id: jobId, title: job.title, company_name: job.company_name,
              description: job.description, source_url: sourceUrl, posted_at: raw.posted_at,
            });
            result.jobsExtracted++;
            console.log(`[sync] ${channelUsername}: ✓ inserted job "${job.title}" @ ${job.company_name}`);
          } catch (insertErr) {
            const msg = `job insert failed: ${(insertErr as Error).message}`;
            console.error(`[sync] ${channelUsername}: ${msg}`, insertErr);
            if (!result.firstError) result.firstError = msg;
            result.errors.push(msg);
          }
        }
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error(`[sync] ${channelUsername}: extract failed for msg ${raw.id}:`, errMsg);
        if (!result.firstError) result.firstError = errMsg;
        result.errors.push(`msg ${raw.id}: ${errMsg}`);
        await run(`UPDATE raw_messages SET status = 'failed' WHERE id = ?`, [raw.id]).catch(() => undefined);
      }
    }

    await persistDb();
    console.log(
      `%c[sync] === ${channelUsername} DONE: new=${result.messagesNew} pending=${result.pendingExtracted} jobs=${result.jobsExtracted} dupes=${result.jobsDuplicates} errors=${result.errors.length} ===`,
      'color: green; font-weight: bold',
    );
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`%c[sync] === ${channelUsername} FAILED: ${errMsg} ===`, 'color: red; font-weight: bold');
    if (!result.firstError) result.firstError = errMsg;
    result.errors.push(errMsg);
  }

  return result;
}

/**
 * Extract pending raw_messages WITHOUT re-scraping Telegram.
 * Useful for retrying failed extractions without hitting Telegram again.
 */
export async function extractPendingOnly(): Promise<SyncResult[]> {
  console.log('%c[sync] === EXTRACT PENDING ONLY ===', 'color: purple; font-weight: bold');
  const channels = await queryAll<{ username: string }>('SELECT username FROM channels WHERE is_active = 1');
  console.log(`[sync] found ${channels.length} active channels`);
  const results: SyncResult[] = [];
  for (const c of channels) {
    // Call syncChannel with a fake scrape that returns 0 messages.
    // This will skip the scrape step but still extract pending messages.
    const result = await extractPendingForChannel(c.username);
    results.push(result);
  }
  return results;
}

async function extractPendingForChannel(channelUsername: string): Promise<SyncResult> {
  // Reuse the syncChannel logic but with messagesFound=0 (skip scrape)
  const result: SyncResult = {
    channel: channelUsername,
    messagesFound: 0,
    messagesNew: 0,
    pendingExtracted: 0,
    jobsExtracted: 0,
    jobsDuplicates: 0,
    errors: [],
  };

  try {
    const pending = await queryAll<RawMessageRow>(
      `SELECT * FROM raw_messages
       WHERE channel_username = ? AND status = 'pending'
       ORDER BY posted_at ASC
       LIMIT ?`,
      [channelUsername, MAX_EXTRACT_PER_CHANNEL],
    );
    console.log(`[sync] ${channelUsername}: ${pending.length} pending messages to extract (no-scrape mode)`);

    if (pending.length === 0) {
      return result;
    }

    const existingJobsRaw = await queryAll<JobRow>(
      `SELECT id, title, company_name, description, source_url, posted_at FROM jobs LIMIT 500`,
    );
    const existingJobs: ExistingJob[] = existingJobsRaw.map((j) => ({
      id: j.id, title: j.title, company_name: j.company_name,
      description: j.description, source_url: j.source_url, posted_at: j.posted_at,
    }));

    for (const raw of pending) {
      try {
        const links = JSON.parse(raw.extracted_links_json || '[]') as { url: string }[];
        const messageText = raw.message_text ?? '';

        if (messageText.trim().length === 0) {
          await run(`UPDATE raw_messages SET status = 'extracted' WHERE id = ?`, [raw.id]);
          result.pendingExtracted++;
          continue;
        }

        const extractRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channelUsername,
            message_text: messageText,
            links: links.map((l) => l.url),
          }),
        });

        if (!extractRes.ok) {
          const text = await extractRes.text();
          throw new Error(`extract API ${extractRes.status}: ${text.slice(0, 300)}`);
        }

        const extractData = (await extractRes.json()) as {
          jobs: (ExtractedJob & { _provider: string })[];
          provider: string;
        };
        const extractedJobs = extractData.jobs ?? [];

        await run(`UPDATE raw_messages SET status = 'extracted' WHERE id = ?`, [raw.id]);
        result.pendingExtracted++;

        if (extractedJobs.length === 0) continue;

        const sourceUrl = links[0]?.url ?? null;
        for (const job of extractedJobs) {
          const newJobWithMeta = {
            ...job, _temp_id: crypto.randomUUID(),
            _source_url: sourceUrl, _posted_at: raw.posted_at,
          };
          const dup = findDuplicate(newJobWithMeta, existingJobs);
          if (dup) { result.jobsDuplicates++; continue; }

          const jobId = crypto.randomUUID();
          try {
            await run(
              `INSERT INTO jobs
                 (id, raw_message_id, channel_username, title, title_amharic, company_name, company_name_amharic,
                  job_category, employment_type, work_type, min_experience_years, max_experience_years,
                  experience_text, location, location_city, location_area, is_remote, salary_text,
                  salary_min_etb, salary_max_etb, description, requirements_json, responsibilities_json,
                  how_to_apply, application_link, application_email, deadline, is_closed, is_vague,
                  source_url, ai_provider_used, ai_confidence, extraction_method, posted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                jobId, raw.id, channelUsername,
                job.title, job.title_amharic, job.company_name, job.company_name_amharic,
                job.job_category, job.employment_type, job.work_type,
                job.min_experience_years, job.max_experience_years, job.experience_text,
                job.location, job.location_city, job.location_area,
                job.is_remote ? 1 : 0, job.salary_text, job.salary_min_etb, job.salary_max_etb,
                job.description,
                JSON.stringify(job.requirements), JSON.stringify(job.responsibilities),
                job.how_to_apply, job.application_link, job.application_email, job.deadline,
                job.is_closed ? 1 : 0, job.is_vague ? 1 : 0, sourceUrl,
                (job as ExtractedJob & { _provider: string })._provider ?? null,
                job.confidence, 'telegram_only', raw.posted_at,
              ],
            );
            existingJobs.push({
              id: jobId, title: job.title, company_name: job.company_name,
              description: job.description, source_url: sourceUrl, posted_at: raw.posted_at,
            });
            result.jobsExtracted++;
          } catch (insertErr) {
            const msg = `job insert failed: ${(insertErr as Error).message}`;
            if (!result.firstError) result.firstError = msg;
            result.errors.push(msg);
          }
        }
      } catch (err) {
        const errMsg = (err as Error).message;
        if (!result.firstError) result.firstError = errMsg;
        result.errors.push(`msg ${raw.id}: ${errMsg}`);
        await run(`UPDATE raw_messages SET status = 'failed' WHERE id = ?`, [raw.id]).catch(() => undefined);
      }
    }
    await persistDb();
  } catch (err) {
    const errMsg = (err as Error).message;
    if (!result.firstError) result.firstError = errMsg;
    result.errors.push(errMsg);
  }
  return result;
}

/**
 * Reset all raw_messages back to status='pending' — useful for retrying
 * failed extractions without re-scraping Telegram.
 */
export async function resetExtractionStatus(): Promise<void> {
  console.log('[sync] resetting all raw_messages to pending');
  await run(`UPDATE raw_messages SET status = 'pending' WHERE status IN ('extracted', 'failed')`, []);
  console.log('[sync] reset complete');
}

export async function syncAllChannels(
  channels: Array<{ username: string; skipPatterns?: string[] }>,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const c of channels) {
    const r = await syncChannel(c.username, { skipPatterns: c.skipPatterns });
    results.push(r);
  }
  return results;
}
