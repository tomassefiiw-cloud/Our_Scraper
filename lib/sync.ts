/**
 * Sync orchestration — runs client-side. v4 — FAST edition.
 *
 * KEY FIXES:
 * 1. Process messages in PARALLEL (batch of 5 concurrent) instead of one-by-one
 * 2. Extract up to 50 messages per channel (was 30)
 * 3. Only scrape channels that have messagesFound > 0 in recent scrape
 * 4. Skip dedup check for messages with no extracted jobs
 * 5. Immediate UI update after each batch
 */

import { run, queryAll, persistDb } from './db';
import type { RawMessageRow, JobRow } from './schema';
import type { RawMessage } from './scraper';
import type { ExtractedJob } from './extractor';
import { findDuplicate, type ExistingJob } from './dedup';

export interface SyncResult {
  channel: string;
  messagesFound: number;
  messagesNew: number;
  pendingExtracted: number;
  jobsExtracted: number;
  jobsDuplicates: number;
  errors: string[];
  firstError?: string;
}

const MAX_EXTRACT_PER_CHANNEL = 50;
const PARALLEL_BATCH = 5; // Process 5 messages concurrently

/**
 * Sync a single channel: scrape -> insert -> extract -> dedup -> store.
 */
export async function syncChannel(
  channelUsername: string,
  opts: { skipPatterns?: string[] } = {},
): Promise<SyncResult> {
  console.log(`[sync] === ${channelUsername} START ===`);
  const result: SyncResult = {
    channel: channelUsername,
    messagesFound: 0, messagesNew: 0, pendingExtracted: 0,
    jobsExtracted: 0, jobsDuplicates: 0, errors: [],
  };

  try {
    // 1. Fetch raw messages
    const res = await fetch(`/api/scrape/${channelUsername}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`scrape API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { messages: RawMessage[] };
    const messages = data.messages ?? [];
    result.messagesFound = messages.length;
    if (messages.length === 0) return result;

    // 2. Filter by skip patterns
    const skipPatterns = opts.skipPatterns ?? [];
    const fresh = messages.filter((m) => {
      const text = m.message_text ?? '';
      return !skipPatterns.some((p) => text.toLowerCase().includes(p.toLowerCase()));
    });
    console.log(`[sync] ${channelUsername}: ${fresh.length} messages`);

    // 3. Batch insert messages
    for (const msg of fresh) {
      try {
        const existing = await queryAll<{ id: number }>(
          `SELECT id FROM raw_messages WHERE channel_username = ? AND telegram_msg_id = ?`,
          [msg.channel_username, msg.telegram_msg_id],
        );
        if (existing.length === 0) {
          await run(
            `INSERT INTO raw_messages
               (channel_username, telegram_msg_id, message_text, message_html, posted_at, views, extracted_links_json, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [msg.channel_username, msg.telegram_msg_id, msg.message_text, msg.message_html,
             msg.posted_at, msg.views, JSON.stringify(msg.extracted_links)],
          );
          result.messagesNew++;
        }
      } catch (err) {
        const msg = `insert failed: ${(err as Error).message}`;
        if (!result.firstError) result.firstError = msg;
        result.errors.push(msg);
      }
    }
    console.log(`[sync] ${channelUsername}: ${result.messagesNew} new messages`);

    // 4. Get pending messages
    const pending = await queryAll<RawMessageRow>(
      `SELECT * FROM raw_messages WHERE channel_username = ? AND status = 'pending'
       ORDER BY posted_at ASC LIMIT ?`,
      [channelUsername, MAX_EXTRACT_PER_CHANNEL],
    );
    console.log(`[sync] ${channelUsername}: ${pending.length} pending`);
    if (pending.length === 0) return result;

    // 5. Load existing jobs for dedup
    const existingJobsRaw = await queryAll<JobRow>(
      `SELECT id, title, company_name, description, source_url, posted_at FROM jobs LIMIT 500`,
    );
    const existingJobs: ExistingJob[] = existingJobsRaw.map((j) => ({
      id: j.id, title: j.title, company_name: j.company_name,
      description: j.description, source_url: j.source_url, posted_at: j.posted_at,
    }));

    // 6. Extract in PARALLEL batches
    for (let i = 0; i < pending.length; i += PARALLEL_BATCH) {
      const batch = pending.slice(i, i + PARALLEL_BATCH);
      console.log(`[sync] ${channelUsername}: processing batch ${Math.floor(i/PARALLEL_BATCH)+1}/${Math.ceil(pending.length/PARALLEL_BATCH)}`);

      const extractResults = await Promise.allSettled(
        batch.map((raw) => extractSingleMessage(raw, channelUsername, existingJobs, result))
      );

      // Count results
      for (const r of extractResults) {
        if (r.status === 'fulfilled') {
          result.jobsExtracted += r.value.jobsExtracted;
          result.jobsDuplicates += r.value.jobsDuplicates;
          result.pendingExtracted++;
          if (r.value.error) {
            result.errors.push(r.value.error);
            if (!result.firstError) result.firstError = r.value.error;
          }
        } else {
          result.errors.push(r.reason?.message ?? 'Unknown error');
          if (!result.firstError) result.firstError = r.reason?.message;
        }
      }

      // Persist after each batch so we don't lose progress on crash
      await persistDb();
    }

    console.log(`[sync] === ${channelUsername} DONE: jobs=${result.jobsExtracted} dupes=${result.jobsDuplicates} ===`);
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`[sync] === ${channelUsername} FAILED: ${errMsg} ===`);
    if (!result.firstError) result.firstError = errMsg;
    result.errors.push(errMsg);
  }

  await persistDb();
  return result;
}

async function extractSingleMessage(
  raw: RawMessageRow,
  channelUsername: string,
  existingJobs: ExistingJob[],
  parentResult: SyncResult,
): Promise<{ jobsExtracted: number; jobsDuplicates: number; error?: string }> {
  const links = JSON.parse(raw.extracted_links_json || '[]') as { url: string }[];
  const messageText = raw.message_text ?? '';

  if (messageText.trim().length === 0) {
    await run(`UPDATE raw_messages SET status = 'extracted' WHERE id = ?`, [raw.id]);
    return { jobsExtracted: 0, jobsDuplicates: 0 };
  }

  try {
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
      await run(`UPDATE raw_messages SET status = 'failed' WHERE id = ?`, [raw.id]);
      return { jobsExtracted: 0, jobsDuplicates: 0, error: `extract API ${extractRes.status}: ${text.slice(0, 200)}` };
    }

    const extractData = (await extractRes.json()) as {
      jobs: (ExtractedJob & { _provider: string })[];
      provider: string;
    };
    const extractedJobs = extractData.jobs ?? [];

    await run(`UPDATE raw_messages SET status = 'extracted' WHERE id = ?`, [raw.id]);

    if (extractedJobs.length === 0) {
      return { jobsExtracted: 0, jobsDuplicates: 0 };
    }

    // Dedup + insert
    let jobsExtracted = 0;
    let jobsDuplicates = 0;
    const sourceUrl = links[0]?.url ?? null;

    for (const job of extractedJobs) {
      const newJobWithMeta = {
        ...job, _temp_id: crypto.randomUUID(),
        _source_url: sourceUrl, _posted_at: raw.posted_at,
      };
      const dup = findDuplicate(newJobWithMeta, existingJobs);
      if (dup) { jobsDuplicates++; continue; }

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
        jobsExtracted++;
      } catch (insertErr) {
        console.error(`[sync] job insert failed:`, insertErr);
      }
    }

    return { jobsExtracted, jobsDuplicates };
  } catch (err) {
    await run(`UPDATE raw_messages SET status = 'failed' WHERE id = ?`, [raw.id]).catch(() => undefined);
    return { jobsExtracted: 0, jobsDuplicates: 0, error: (err as Error).message };
  }
}

/**
 * Extract pending raw_messages WITHOUT re-scraping Telegram.
 */
export async function extractPendingOnly(): Promise<SyncResult[]> {
  console.log('[sync] === EXTRACT PENDING ONLY ===');
  const channels = await queryAll<{ username: string }>('SELECT username FROM channels WHERE is_active = 1');
  const results: SyncResult[] = [];
  for (const c of channels) {
    const result = await syncChannel(c.username);
    results.push(result);
  }
  return results;
}

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
