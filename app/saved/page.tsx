'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { queryAll } from '@/lib/db';
import JobCard from '@/components/JobCard';
import type { JobRow } from '@/lib/schema';

export default function SavedPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const rows = await queryAll<JobRow>(
          `SELECT j.* FROM jobs j
           INNER JOIN user_interactions ui ON ui.job_id = j.id
           WHERE ui.action = 'saved'
           ORDER BY ui.created_at DESC`,
        );
        setJobs(rows);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-gray-500">Loading saved jobs…</p>;
  if (jobs.length === 0)
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No saved jobs yet</p>
        <p className="text-sm mt-1">
          Tap ★ on any job to save it for later.{' '}
          <Link href="/" className="text-brand-600 hover:underline">Browse jobs</Link>
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Saved Jobs ({jobs.length})</h1>
      <div className="space-y-3">
        {jobs.map((j) => (
          <JobCard
            key={j.id}
            job={{
              id: j.id,
              title: j.title,
              titleAmharic: j.title_amharic,
              companyName: j.company_name,
              jobCategory: j.job_category,
              employmentType: j.employment_type,
              workType: j.work_type,
              minExperienceYears: j.min_experience_years,
              maxExperienceYears: j.max_experience_years,
              location: j.location,
              locationCity: j.location_city,
              isRemote: j.is_remote,
              salaryText: j.salary_text,
              deadline: j.deadline,
              postedAt: j.posted_at,
              channelUsername: j.channel_username,
            }}
          />
        ))}
      </div>
    </div>
  );
}
