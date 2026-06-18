/**
 * Deduplication engine (doc §10).
 *
 * 3 layers:
 *   1. Exact link match
 *   2. Company + Title Jaccard similarity > 0.85
 *   3. Semantic-ish Jaccard over title+company+description > 0.92
 *
 * 7-day lookback — reposts after that are NOT duplicates.
 *
 * All operations happen client-side against the local SQLite DB.
 */

import type { ExtractedJob } from './extractor';

const HEURISTIC_THRESHOLD = 0.85;
const SEMANTIC_THRESHOLD = 0.92;
const LOOKBACK_DAYS = 7;

export interface ExistingJob {
  id: string;
  title: string | null;
  company_name: string | null;
  description: string | null;
  source_url: string | null;
  posted_at: string | null;
}

export interface DuplicateMatch {
  newJob: ExtractedJob & { _temp_id: string };
  matchedJob: ExistingJob;
  method: 'exact_link' | 'company_title_match' | 'semantic_similarity';
  similarityScore: number;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Check if `newJob` is a duplicate of any job in `existingJobs`.
 * Returns the match (with method + score) or null.
 */
export function findDuplicate(
  newJob: ExtractedJob & { _temp_id: string; _source_url?: string | null; _posted_at?: string | null },
  existingJobs: ExistingJob[],
): DuplicateMatch | null {
  const sourceUrl = newJob._source_url ?? null;
  const postedAt = newJob._posted_at ? new Date(newJob._posted_at).getTime() : Date.now();
  const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  // Layer 1: exact link match
  if (sourceUrl) {
    const exact = existingJobs.find(
      (ej) => ej.source_url === sourceUrl,
    );
    if (exact) {
      return { newJob, matchedJob: exact, method: 'exact_link', similarityScore: 1.0 };
    }
  }

  // Layer 2: company + title heuristic
  if (newJob.company_name && newJob.title) {
    const normNewCompany = normalizeText(newJob.company_name);
    const normNewTitle = normalizeText(newJob.title);
    const candidate = existingJobs.find((ej) => {
      if (!ej.company_name || !ej.title) return false;
      if (ej.posted_at) {
        const ejTime = new Date(ej.posted_at).getTime();
        if (Math.abs(ejTime - postedAt) > lookbackMs) return false;
      }
      if (normalizeText(ej.company_name) !== normNewCompany) return false;
      return jaccard(normNewTitle, normalizeText(ej.title)) > HEURISTIC_THRESHOLD;
    });
    if (candidate) {
      return {
        newJob,
        matchedJob: candidate,
        method: 'company_title_match',
        similarityScore: jaccard(normNewTitle, normalizeText(candidate.title ?? '')),
      };
    }
  }

  // Layer 3: semantic-ish (higher-threshold Jaccard over title+company+desc)
  if (newJob.title && newJob.company_name) {
    const newBlob = normalizeText(
      `${newJob.title} ${newJob.company_name} ${(newJob.description ?? '').slice(0, 300)}`,
    );
    for (const ej of existingJobs) {
      if (!ej.title || !ej.company_name) continue;
      if (ej.posted_at) {
        const ejTime = new Date(ej.posted_at).getTime();
        if (Math.abs(ejTime - postedAt) > lookbackMs) continue;
      }
      const ejBlob = normalizeText(
        `${ej.title} ${ej.company_name} ${(ej.description ?? '').slice(0, 300)}`,
      );
      const sim = jaccard(newBlob, ejBlob);
      if (sim > SEMANTIC_THRESHOLD) {
        return { newJob, matchedJob: ej, method: 'semantic_similarity', similarityScore: sim };
      }
    }
  }

  return null;
}
