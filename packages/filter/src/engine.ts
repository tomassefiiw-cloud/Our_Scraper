/**
 * FilterEngine (doc §11).
 *
 * Returns true if `job` matches the user's `prefs`.
 *
 * Note on exclude_keywords (doc §11.1):
 *   This is distinct from the experience filter. Experience catches structured
 *   "3 years"; exclude_keywords catches phrases like "5+ years required" hidden
 *   in the description even when the title says "Junior".
 */
import type { Job, UserPreferences } from '@tja/shared';

export class FilterEngine {
  matches(job: Job, prefs: UserPreferences): boolean {
    // -----------------------------------------------------------------------
    // Experience range
    // -----------------------------------------------------------------------
    if (
      prefs.max_experience_years != null &&
      job.minExperienceYears != null &&
      job.minExperienceYears > prefs.max_experience_years
    ) {
      return false;
    }
    if (
      prefs.min_experience_years != null &&
      job.maxExperienceYears != null &&
      job.maxExperienceYears < prefs.min_experience_years
    ) {
      return false;
    }

    // -----------------------------------------------------------------------
    // Job category
    // -----------------------------------------------------------------------
    if (prefs.job_categories.length > 0 && job.jobCategory) {
      if (!prefs.job_categories.includes(job.jobCategory as never)) return false;
    }

    // -----------------------------------------------------------------------
    // Location
    // -----------------------------------------------------------------------
    if (prefs.locations.length > 0 && job.locationCity) {
      const locationMatch = prefs.locations.some(
        (loc) =>
          job.locationCity?.toLowerCase().includes(loc.toLowerCase()) ||
          (job.isRemote && loc.toLowerCase() === 'remote'),
      );
      if (!locationMatch) return false;
    }

    // Addis Ababa sub-area (only when location is Addis Ababa)
    if (job.locationCity === 'Addis Ababa' && prefs.addis_ababa_areas.length > 0) {
      const areaMatch = prefs.addis_ababa_areas.some(
        (area) =>
          job.location?.toLowerCase().includes(area.toLowerCase()) ||
          job.locationArea?.toLowerCase().includes(area.toLowerCase()),
      );
      if (!areaMatch) return false;
    }

    // -----------------------------------------------------------------------
    // Work type
    // -----------------------------------------------------------------------
    if (prefs.work_types.length > 0 && job.workType) {
      if (!prefs.work_types.includes(job.workType as never)) return false;
    }

    // -----------------------------------------------------------------------
    // Employment type
    // -----------------------------------------------------------------------
    if (prefs.employment_types.length > 0 && job.employmentType) {
      if (!prefs.employment_types.includes(job.employmentType as never)) return false;
    }

    // -----------------------------------------------------------------------
    // Exclude keywords (case-insensitive substring over title+desc+requirements)
    // -----------------------------------------------------------------------
    if (prefs.exclude_keywords.length > 0) {
      const haystack = [
        job.title ?? '',
        job.titleAmharic ?? '',
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

    // -----------------------------------------------------------------------
    // Salary (optional, low priority — only filter when both sides present)
    // -----------------------------------------------------------------------
    if (prefs.min_salary_etb != null && job.salaryMaxEtb != null && job.salaryMaxEtb < prefs.min_salary_etb) {
      return false;
    }
    if (prefs.max_salary_etb != null && job.salaryMinEtb != null && job.salaryMinEtb > prefs.max_salary_etb) {
      return false;
    }

    // -----------------------------------------------------------------------
    // Exclude closed/expired jobs from feed
    // -----------------------------------------------------------------------
    if (job.isClosed) return false;

    return true;
  }

  /**
   * Apply filter to a batch of jobs, returning only matches.
   */
  filterAll(jobs: Job[], prefs: UserPreferences): Job[] {
    return jobs.filter((j) => this.matches(j, prefs));
  }
}
