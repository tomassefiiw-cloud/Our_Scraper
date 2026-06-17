/**
 * DeduplicationEngine (doc §10).
 *
 * Three-layer detection:
 *   1. Exact link match (fastest)
 *   2. Company + Title match (heuristic Jaccard similarity)
 *   3. Semantic similarity (AI embeddings, slower — Phase 3)
 *
 * Rules (doc §10.2):
 *   - Same link, same channel → skip entirely
 *   - Same link, different channel → mark duplicate, first seen = primary
 *   - Same company + similar title → duplicate (repost with different URL)
 *   - Same company + different title → NOT duplicate
 *   - Reposted after 30 days → NOT duplicate (refresh)
 */
import {
  DEDUP_HEURISTIC_THRESHOLD,
  DEDUP_LOOKBACK_DAYS,
  DEDUP_SEMANTIC_THRESHOLD,
} from '@tja/shared';
import type { Job } from '@tja/shared';

export interface DuplicateMatch {
  newJob: Job;
  matchedJob: Job;
  method: 'exact_link' | 'company_title_match' | 'semantic_similarity';
  similarityScore: number;
}

export class DeduplicationEngine {
  /**
   * Find duplicates of `newJobs` within `existingJobs`.
   * Returns the subset of `newJobs` that are duplicates, with their match info.
   * Non-duplicates are silently passed through (caller keeps them).
   */
  async deduplicate(newJobs: Job[], existingJobs: Job[]): Promise<DuplicateMatch[]> {
    const matches: DuplicateMatch[] = [];

    for (const newJob of newJobs) {
      const match = await this.findMatch(newJob, existingJobs);
      if (match) matches.push(match);
    }
    return matches;
  }

  async findMatch(newJob: Job, existingJobs: Job[]): Promise<DuplicateMatch | null> {
    // Layer 1: exact link match
    if (newJob.source_url) {
      const exact = existingJobs.find(
        (ej) =>
          (ej.source_url && ej.source_url === newJob.source_url) ||
          (ej.deepExtractedUrl && ej.deepExtractedUrl === newJob.source_url) ||
          (newJob.deepExtractedUrl &&
            (ej.source_url === newJob.deepExtractedUrl || ej.deepExtractedUrl === newJob.deepExtractedUrl)),
      );
      if (exact) {
        return {
          newJob,
          matchedJob: exact,
          method: 'exact_link',
          similarityScore: 1.0,
        };
      }
    }

    // Layer 2: company + title heuristic
    if (newJob.companyName && newJob.title) {
      const normNewCompany = this.normalize(newJob.companyName);
      const normNewTitle = this.normalize(newJob.title);
      const lookbackMs = DEDUP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

      const candidate = existingJobs.find((ej) => {
        if (!ej.companyName || !ej.title) return false;
        // Skip if older than lookback (repost after 30 days = NOT duplicate)
        if (ej.postedAt && newJob.postedAt) {
          if (Math.abs(ej.postedAt.getTime() - newJob.postedAt.getTime()) > lookbackMs) return false;
        }
        if (this.normalize(ej.companyName) !== normNewCompany) return false;
        const titleSim = this.jaccard(normNewTitle, this.normalize(ej.title));
        return titleSim > DEDUP_HEURISTIC_THRESHOLD;
      });

      if (candidate) {
        return {
          newJob,
          matchedJob: candidate,
          method: 'company_title_match',
          similarityScore: this.jaccard(normNewTitle, this.normalize(candidate.title)),
        };
      }
    }

    // Layer 3: semantic similarity (stub for Phase 3 — would use embeddings)
    // For now, fall back to a higher-threshold Jaccard over title+description.
    if (newJob.title && newJob.companyName) {
      const lookbackMs = DEDUP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
      const newBlob = this.normalize(
        `${newJob.title} ${newJob.companyName} ${(newJob.description ?? '').slice(0, 300)}`,
      );
      for (const ej of existingJobs) {
        if (!ej.title || !ej.companyName) continue;
        if (ej.postedAt && newJob.postedAt) {
          if (Math.abs(ej.postedAt.getTime() - newJob.postedAt.getTime()) > lookbackMs) continue;
        }
        const ejBlob = this.normalize(
          `${ej.title} ${ej.companyName} ${(ej.description ?? '').slice(0, 300)}`,
        );
        const sim = this.jaccard(newBlob, ejBlob);
        if (sim > DEDUP_SEMANTIC_THRESHOLD) {
          return {
            newJob,
            matchedJob: ej,
            method: 'semantic_similarity',
            similarityScore: sim,
          };
        }
      }
    }

    return null;
  }

  /**
   * Normalize text for comparison: lowercase, strip non-alphanumeric, collapse spaces.
   */
  normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Jaccard similarity over word sets.
   */
  jaccard(a: string, b: string): number {
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
   * Cosine similarity over numeric vectors — used for Phase 3 embeddings.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
