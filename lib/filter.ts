/**
 * User preference filter (doc §11).
 *
 * Returns true if `job` matches `prefs`. Distinct from experience filter:
 * exclude_keywords catches phrases like "5+ years required" hidden in
 * the description even when the title says "Junior".
 */

import type { ExtractedJob } from './extractor';

export interface UserPreferences {
  min_experience_years: number;
  max_experience_years: number;
  job_categories: string[];
  locations: string[];
  addis_ababa_areas: string[];
  work_types: string[];
  employment_types: string[];
  exclude_keywords: string[];
  min_salary_etb: number | null;
  max_salary_etb: number | null;
}

export const DEFAULT_PREFS: UserPreferences = {
  min_experience_years: 0,
  max_experience_years: 50,
  job_categories: [],
  locations: [],
  addis_ababa_areas: [],
  work_types: [],
  employment_types: [],
  exclude_keywords: [],
  min_salary_etb: null,
  max_salary_etb: null,
};

export function matches(job: ExtractedJob, prefs: UserPreferences): boolean {
  // Experience range
  if (
    prefs.max_experience_years != null &&
    job.min_experience_years != null &&
    job.min_experience_years > prefs.max_experience_years
  ) {
    return false;
  }
  if (
    prefs.min_experience_years != null &&
    job.max_experience_years != null &&
    job.max_experience_years < prefs.min_experience_years
  ) {
    return false;
  }

  // Job category — check ANY of the job's categories against user preferences
  if (prefs.job_categories.length > 0) {
    const jobCats = (job as unknown as Record<string, unknown>).job_categories as string[] 
      ?? (job.job_category ? [job.job_category] : []);
    const matchesAny = jobCats.some((cat: string) => prefs.job_categories.includes(cat));
    if (!matchesAny) return false;
  }

  // Location
  if (prefs.locations.length > 0 && job.location_city) {
    const locationMatch = prefs.locations.some(
      (loc) =>
        job.location_city?.toLowerCase().includes(loc.toLowerCase()) ||
        (job.is_remote && loc.toLowerCase() === 'remote'),
    );
    if (!locationMatch) return false;
  }

  // Addis Ababa sub-area
  if (job.location_city === 'Addis Ababa' && prefs.addis_ababa_areas.length > 0) {
    const areaMatch = prefs.addis_ababa_areas.some(
      (area) =>
        job.location?.toLowerCase().includes(area.toLowerCase()) ||
        job.location_area?.toLowerCase().includes(area.toLowerCase()),
    );
    if (!areaMatch) return false;
  }

  // Work type
  if (prefs.work_types.length > 0 && job.work_type) {
    if (!prefs.work_types.includes(job.work_type)) return false;
  }

  // Employment type
  if (prefs.employment_types.length > 0 && job.employment_type) {
    if (!prefs.employment_types.includes(job.employment_type)) return false;
  }

  // Exclude keywords
  if (prefs.exclude_keywords.length > 0) {
    const haystack = [
      job.title ?? '',
      job.title_amharic ?? '',
      job.description ?? '',
      ...(job.requirements ?? []),
      ...(job.responsibilities ?? []),
    ]
      .join(' ')
      .toLowerCase();
    const hasExcluded = prefs.exclude_keywords.some((kw) =>
      haystack.includes(kw.toLowerCase()),
    );
    if (hasExcluded) return false;
  }

  // Salary
  if (prefs.min_salary_etb != null && job.salary_max_etb != null && job.salary_max_etb < prefs.min_salary_etb) {
    return false;
  }
  if (prefs.max_salary_etb != null && job.salary_min_etb != null && job.salary_min_etb > prefs.max_salary_etb) {
    return false;
  }

  // Closed jobs always filtered out
  if (job.is_closed) return false;

  // Expired deadline filter
  if (job.deadline) {
    const deadlineDate = new Date(job.deadline);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (deadlineDate < today) return false;
  }

  return true;
}
