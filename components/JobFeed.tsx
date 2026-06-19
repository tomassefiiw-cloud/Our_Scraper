'use client';

import { useCallback, useEffect, useState } from 'react';
import JobCard, { type Job } from './JobCard';
import { queryAll } from '@/lib/db';
import { JOB_CATEGORIES } from '@/lib/channels';
import type { UserPreferences } from '@/lib/filter';
import { DEFAULT_PREFS, matches } from '@/lib/filter';
import type { JobRow, UserPreferencesRow } from '@/lib/schema';

export default function JobFeed() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filtered, setFiltered] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeCats, setActiveCats] = useState<string[]>([]);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Load preferences + jobs from local SQLite
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load prefs
      const prefRows = await queryAll<UserPreferencesRow>('SELECT * FROM user_preferences WHERE id = 1');
      if (prefRows[0]) {
        const r = prefRows[0];
        setPrefs({
          min_experience_years: r.min_experience_years,
          max_experience_years: r.max_experience_years,
          job_categories: JSON.parse(r.job_categories_json || '[]'),
          locations: JSON.parse(r.locations_json || '[]'),
          addis_ababa_areas: JSON.parse(r.addis_ababa_areas_json || '[]'),
          work_types: JSON.parse(r.work_types_json || '[]'),
          employment_types: JSON.parse(r.employment_types_json || '[]'),
          exclude_keywords: JSON.parse(r.exclude_keywords_json || '[]'),
          min_salary_etb: r.min_salary_etb,
          max_salary_etb: r.max_salary_etb,
        });
        setPrefsLoaded(true);
      } else {
        setPrefsLoaded(true);
      }

      // Load all open jobs
      const rows = await queryAll<JobRow>(
        `SELECT * FROM jobs WHERE is_closed = 0 ORDER BY posted_at DESC LIMIT 200`,
      );
      const mapped: Job[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        titleAmharic: r.title_amharic,
        companyName: r.company_name,
        jobCategory: r.job_category,
        employmentType: r.employment_type,
        workType: r.work_type,
        minExperienceYears: r.min_experience_years,
        maxExperienceYears: r.max_experience_years,
        location: r.location,
        locationCity: r.location_city,
        isRemote: r.is_remote,
        salaryText: r.salary_text,
        deadline: r.deadline,
        postedAt: r.posted_at,
        channelUsername: r.channel_username,
      }));
      setJobs(mapped);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for sync completion events
  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener('jobs-synced', handler);
    return () => window.removeEventListener('jobs-synced', handler);
  }, [refresh]);

  // Initial load
  useEffect(() => {
    void refresh();
  }, []);

  // Apply filters + prefs client-side
  useEffect(() => {
    let result = jobs;

    // User preferences (category, location, etc.)
    if (prefsLoaded) {
      result = result.filter((j) => {
        const ej = {
          title: j.title,
          title_amharic: j.titleAmharic,
          company_name: j.companyName,
          company_name_amharic: null,
          job_category: j.jobCategory,
          employment_type: j.employmentType,
          work_type: j.workType,
          min_experience_years: j.minExperienceYears,
          max_experience_years: j.maxExperienceYears,
          experience_text: null,
          location: j.location,
          location_city: j.locationCity,
          location_area: null,
          is_remote: j.isRemote === 1,
          salary_text: j.salaryText,
          salary_min_etb: null,
          salary_max_etb: null,
          description: null,
          requirements: [],
          responsibilities: [],
          how_to_apply: null,
          application_link: null,
          application_email: null,
          deadline: j.deadline,
          is_closed: false,
          is_vague: false,
          confidence: 1,
        };
        return matches(ej, prefs);
      });
    }

    // UI filters (category chips + remote toggle + search)
    if (activeCats.length > 0) {
      result = result.filter((j) => j.jobCategory && activeCats.includes(j.jobCategory));
    }
    if (remoteOnly) {
      result = result.filter((j) => j.isRemote === 1);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (j) =>
          j.title?.toLowerCase().includes(q) ||
          j.companyName?.toLowerCase().includes(q) ||
          j.location?.toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [jobs, activeCats, remoteOnly, query, prefs, prefsLoaded]);

  const toggleCat = (c: string) => {
    setActiveCats((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  if (loading) {
    return <p className="text-gray-500">Loading jobs from local database…</p>;
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="search"
        placeholder="Search jobs, companies, keywords..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setRemoteOnly((v) => !v)}
          className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border ${
            remoteOnly
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          🌐 Remote
        </button>
        {JOB_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => toggleCat(c)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border ${
              activeCats.includes(c)
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Job count */}
      <p className="text-xs text-gray-500">
        {filtered.length} {filtered.length === 1 ? 'job' : 'jobs'} {prefsLoaded ? '(filtered by your preferences)' : ''}
      </p>

      {/* Jobs list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No jobs found</p>
          <p className="text-sm mt-1">
            Try adjusting filters, or{' '}
            <a href="/admin" className="text-brand-600 hover:underline">trigger a scrape</a>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((j) => <JobCard key={j.id} job={j} />)}
        </div>
      )}
    </div>
  );
}
