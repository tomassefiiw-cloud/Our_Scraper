/**
 * Sync orchestration — runs client-side.
 *
 * Flow:
 *   1. For each active channel: call /api/scrape/[channel] -> RawMessage[]
 *   2. Store raw_messages locally, skip already-seen (UNIQUE constraint)
 *   3. For each new raw message: call /api/extract with message text + channel config
 *      -> ExtractedJob[]
 *   4. Dedup against existing jobs in local SQLite
 *   5. Insert non-duplicate jobs
 *   6. Update channel.last_scraped_at
 *
 * The /api/extract route keeps AI keys server-side; the PWA just sends
 * the raw message text and channel name, gets back structured jobs.
 */

import { run, queryAll, queryOne, persistDb } from './db';
import type { RawMessageRow, JobRow } from './schema';
import type { RawMessage } from './scraper';
import type { ExtractedJob } from './extractor';
import { findDuplicate, type ExistingJob } from './dedup';

export interface SyncResult {
  channel: string;
  messagesFound: number;
  messagesNew: number;
  jobsExtracted: number;
  jobsDuplicates: number;
  errors: string[];
}

/**
 * Sync a single channel: scrape -> extract -> dedup -> store.
 */
export async function syncChannel(
  channelUsername: string,
  opts: { lookbackHours?: number; skipPatterns?: string[] } = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    channel: channelUsername,
    messagesFound: 0,
    messagesNew: 0,
    jobsExtracted: 0,
    jobsDuplicates: 0,
    errors: [],
  };

  try {
    // 1. Fetch raw messages from our scraper API route
    const res = await fetch(`/api/scrape/${channelUsername}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`scrape API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { messages: RawMessage[] };
    const messages = data.messages ?? [];
    result.messagesFound = messages.length;

    // 2. Filter by lookback + skip patterns
    const lookbackMs = (opts.lookbackHours ?? 2) * 60 * 60 * 1000;
    const cutoff = Date.now() - lookbackMs;
    const skipPatterns = opts.skipPatterns ?? [];
    const fresh = messages.filter((m) => {
      if (new Date(m.posted_at).getTime() < cutoff) return false;
      const text = m.message_text ?? '';
      if (skipPatterns.some((p) => text.toLowerCase().includes(p.toLowerCase()))) return false;
      return true;
    });

    // 3. Insert raw_messages (skip duplicates via UNIQUE constraint)
    for (const msg of fresh) {
      try {
        await run(
          `INSERT OR IGNORE INTO raw_messages
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
        // Check if it was actually inserted (not a duplicate)
        const inserted = await queryOne<{ id: number }>(
          `SELECT id FROM raw_messages WHERE channel_username = ? AND telegram_msg_id = ? AND status = 'pending'`,
          [msg.channel_username, msg.telegram_msg_id],
        );
        if (inserted) {
          result.messagesNew++;
        }
      } catch (err) {
        result.errors.push(`raw_message insert: ${(err as Error).message}`);
      }
    }

    if (result.messagesNew === 0) {
      // Nothing new — just update last_scraped_at
      await run(
        `UPDATE channels SET last_scraped_at = ? WHERE username = ?`,
        [new Date().toISOString(), channelUsername],
      );
      return result;
    }

    // 4. Fetch pending raw messages for this channel
    const pending = await queryAll<RawMessageRow>(
      `SELECT * FROM raw_messages WHERE channel_username = ? AND status = 'pending' ORDER BY posted_at ASC`,
      [channelUsername],
    );

    // 5. For each pending message: call extract API
    for (const raw of pending) {
      try {
        const extractRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channelUsername,
            message_text: raw.message_text ?? '',
            links: JSON.parse(raw.extracted_links_json || '[]').map(
              (l: { url: string }) => l.url,
            ),
          }),
        });
        if (!extractRes.ok) {
          const text = await extractRes.text();
          throw new Error(`extract API ${extractRes.status}: ${text.slice(0, 200)}`);
        }
        const extractData = (await extractRes.json()) as {
          jobs: (ExtractedJob & { _provider: string })[];
        };
        const extractedJobs = extractData.jobs ?? [];

        // Mark raw message as extracted
        await run(`UPDATE raw_messages SET status = 'extracted' WHERE id = ?`, [raw.id]);

        if (extractedJobs.length === 0) continue;

        // 6. Deduplicate against existing jobs (recent only)
        const recentJobs = await queryAll<JobRow>(
          `SELECT id, title, company_name, description, source_url, posted_at
           FROM jobs
           WHERE posted_at > datetime('now', '-7 days')
              OR posted_at IS NULL
           LIMIT 500`,
        );
        const existingMapped: ExistingJob[] = recentJobs.map((j) => ({
          id: j.id,
          title: j.title,
          company_name: j.company_name,
          description: j.description,
          source_url: j.source_url,
          posted_at: j.posted_at,
        }));

        const sourceUrl = JSON.parse(raw.extracted_links_json || '[]')[0]?.url ?? null;

        // 7. Insert non-duplicates
        for (const job of extractedJobs) {
          const newJobWithMeta = {
            ...job,
            _temp_id: crypto.randomUUID(),
            _source_url: sourceUrl,
            _posted_at: raw.posted_at,
          };
          const dup = findDuplicate(newJobWithMeta, existingMapped);
          if (dup) {
            result.jobsDuplicates++;
            continue;
          }

          const jobId = crypto.randomUUID();
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
              jobId,
              raw.id,
              channelUsername,
              job.title,
              job.title_amharic,
              job.company_name,
              job.company_name_amharic,
              job.job_category,
              job.employment_type,
              job.work_type,
              job.min_experience_years,
              job.max_experience_years,
              job.experience_text,
              job.location,
              job.location_city,
              job.location_area,
              job.is_remote ? 1 : 0,
              job.salary_text,
              job.salary_min_etb,
              job.salary_max_etb,
              job.description,
              JSON.stringify(job.requirements),
              JSON.stringify(job.responsibilities),
              job.how_to_apply,
              job.application_link,
              job.application_email,
              job.deadline,
              job.is_closed ? 1 : 0,
              job.is_vague ? 1 : 0,
              sourceUrl,
              (job as ExtractedJob & { _provider: string })._provider ?? null,
              job.confidence,
              'telegram_only',
              raw.posted_at,
            ],
          );
          existingMapped.push({
            id: jobId,
            title: job.title,
            company_name: job.company_name,
            description: job.description,
            source_url: sourceUrl,
            posted_at: raw.posted_at,
          });
          result.jobsExtracted++;
        }
      } catch (err) {
        result.errors.push(`extract raw ${raw.id}: ${(err as Error).message}`);
        await run(`UPDATE raw_messages SET status = 'failed' WHERE id = ?`, [raw.id]).catch(
          () => undefined,
        );
      }
    }

    // 8. Update channel last_scraped_at
    await run(
      `UPDATE channels SET last_scraped_at = ? WHERE username = ?`,
      [new Date().toISOString(), channelUsername],
    );

    await persistDb();
  } catch (err) {
    result.errors.push((err as Error).message);
  }

  return result;
}

/**
 * Sync all active channels. Returns aggregated results.
 */
export async function syncAllChannels(
  channels: Array<{ username: string; lookbackHours?: number; skipPatterns?: string[] }>,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  // Sequential to avoid hammering the AI providers
  for (const c of channels) {
    const r = await syncChannel(c.username, {
      lookbackHours: c.lookbackHours,
      skipPatterns: c.skipPatterns,
    });
    results.push(r);
  }
  return results;
}
