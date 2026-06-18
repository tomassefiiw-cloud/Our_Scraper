/**
 * Sync orchestration — runs client-side.
 *
 * Flow:
 *   1. For each active channel: call /api/scrape/[channel] -> RawMessage[]
 *   2. Store raw_messages locally, skip already-seen (UNIQUE constraint)
 *   3. For each new raw message: call /api/extract -> ExtractedJob[]
 *   4. Dedup against existing jobs in local SQLite
 *   5. Insert non-duplicate jobs
 *
 * Every step has console.log — open browser dev tools (F12) → Console to watch.
 */

import { run, runWithChanges, queryAll, persistDb } from './db';
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

export async function syncChannel(
  channelUsername: string,
  opts: { skipPatterns?: string[] } = {},
): Promise<SyncResult> {
  console.log(`%c[sync] === ${channelUsername} START ===`, 'color: blue; font-weight: bold');
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
      console.warn(`[sync] ${channelUsername}: no messages found, skipping`);
      return result;
    }

    // 2. Filter by skip patterns only (no lookback — UNIQUE handles dedup)
    const skipPatterns = opts.skipPatterns ?? [];
    const fresh = messages.filter((m) => {
      const text = m.message_text ?? '';
      if (skipPatterns.some((p) => text.toLowerCase().includes(p.toLowerCase()))) {
        console.log(`[sync] ${channelUsername}: skipping msg ${m.telegram_msg_id} (matched skip pattern)`);
        return false;
      }
      return true;
    });
    console.log(`[sync] ${channelUsername}: ${fresh.length} messages passed skip filter`);

    if (fresh.length === 0) {
      console.warn(`[sync] ${channelUsername}: all messages filtered out by skip patterns`);
      return result;
    }

    // 3. Insert raw_messages (skip duplicates via UNIQUE constraint)
    console.log(`[sync] ${channelUsername}: inserting raw_messages`);
    for (const msg of fresh) {
      try {
        const changes = await runWithChanges(
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
        if (changes > 0) {
          result.messagesNew++;
        } else {
          console.log(`[sync] ${channelUsername}: msg ${msg.telegram_msg_id} already in DB (skipped)`);
        }
      } catch (err) {
        const msg = `raw_message insert failed: ${(err as Error).message}`;
        console.error(`[sync] ${channelUsername}: ${msg}`);
        result.errors.push(msg);
      }
    }
    console.log(`[sync] ${channelUsername}: ${result.messagesNew} new messages inserted`);

    if (result.messagesNew === 0) {
      console.log(`[sync] ${channelUsername}: no new messages, skipping extraction`);
      return result;
    }

    // 4. Fetch pending raw messages for this channel
    const pending = await queryAll<RawMessageRow>(
      `SELECT * FROM raw_messages WHERE channel_username = ? AND status = 'pending' ORDER BY posted_at ASC`,
      [channelUsername],
    );
    console.log(`[sync] ${channelUsername}: ${pending.length} pending messages to extract`);

    // 5. For each pending message: call extract API
    let msgIndex = 0;
    for (const raw of pending) {
      msgIndex++;
      console.log(`[sync] ${channelUsername}: extracting msg ${msgIndex}/${pending.length} (id=${raw.id})`);
      try {
        const links = JSON.parse(raw.extracted_links_json || '[]') as { url: string }[];
        console.log(`[sync] ${channelUsername}: msg ${raw.id} has ${links.length} links, text length=${(raw.message_text ?? '').length}`);

        const extractRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channelUsername,
            message_text: raw.message_text ?? '',
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
        };
        const extractedJobs = extractData.jobs ?? [];
        console.log(`[sync] ${channelUsername}: msg ${raw.id} → ${extractedJobs.length} jobs extracted (provider: ${extractData.provider})`);

        // Mark raw message as extracted
        await run(`UPDATE raw_messages SET status = 'extracted' WHERE id = ?`, [raw.id]);

        if (extractedJobs.length === 0) {
          console.log(`[sync] ${channelUsername}: msg ${raw.id} yielded no jobs (likely spam/non-job)`);
          continue;
        }

        // 6. Deduplicate against existing jobs (recent only)
        const recentJobs = await queryAll<JobRow>(
          `SELECT id, title, company_name, description, source_url, posted_at FROM jobs LIMIT 500`,
        );
        const existingMapped: ExistingJob[] = recentJobs.map((j) => ({
          id: j.id,
          title: j.title,
          company_name: j.company_name,
          description: j.description,
          source_url: j.source_url,
          posted_at: j.posted_at,
        }));

        const sourceUrl = links[0]?.url ?? null;

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
            console.log(`[sync] ${channelUsername}: inserted job "${job.title}" at ${job.company_name}`);
          } catch (insertErr) {
            const msg = `job insert failed: ${(insertErr as Error).message}`;
            console.error(`[sync] ${channelUsername}: ${msg}`, insertErr);
            result.errors.push(msg);
          }
        }
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error(`[sync] ${channelUsername}: extract failed for msg ${raw.id}:`, errMsg);
        result.errors.push(`extract raw ${raw.id}: ${errMsg}`);
        await run(`UPDATE raw_messages SET status = 'failed' WHERE id = ?`, [raw.id]).catch(
          () => undefined,
        );
      }
    }

    await persistDb();
    console.log(`%c[sync] === ${channelUsername} DONE: new=${result.messagesNew} jobs=${result.jobsExtracted} dupes=${result.jobsDuplicates} errors=${result.errors.length} ===`, 'color: green; font-weight: bold');
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`%c[sync] === ${channelUsername} FAILED: ${errMsg} ===`, 'color: red; font-weight: bold');
    result.errors.push(errMsg);
  }

  return result;
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
