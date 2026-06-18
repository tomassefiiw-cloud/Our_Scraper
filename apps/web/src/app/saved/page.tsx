'use client';

import { useEffect, useState } from 'react';
import { apiClient, type Job } from '@/lib/api';
import JobCard from '@/components/JobCard';

export default function SavedPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .saved()
      .then((r) => setJobs(r.items))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading saved jobs…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (jobs.length === 0)
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No saved jobs yet</p>
        <p className="text-sm">Tap ★ on any job to save it for later.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Saved Jobs ({jobs.length})</h1>
      <div className="space-y-3">
        {jobs.map((j) => <JobCard key={j.id} job={j} />)}
      </div>
    </div>
  );
}
