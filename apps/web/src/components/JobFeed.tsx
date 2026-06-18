'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, type Job } from '@/lib/api';
import JobCard from './JobCard';

const CATEGORIES = [
  'tech', 'health', 'finance', 'engineering', 'marketing', 'sales',
  'admin', 'creative', 'ngo', 'education', 'logistics', 'hospitality', 'other',
];

export default function JobFeed() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState('');
  const [activeCats, setActiveCats] = useState<string[]>([]);
  const [remoteOnly, setRemoteOnly] = useState(false);

  const fetchPage = useCallback(async (cur: string | null, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: '20' };
      if (cur) params.cursor = cur;
      if (query.trim()) params.q = query.trim();
      if (activeCats.length) params.category = activeCats.join(',');
      if (remoteOnly) params.remote = 'true';
      const res = await apiClient.feed(params);
      setJobs((prev) => (replace ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, activeCats, remoteOnly]);

  // Initial load
  useEffect(() => {
    void fetchPage(null, true);
  }, [fetchPage]);

  const toggleCat = (c: string) => {
    setActiveCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

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
        {CATEGORIES.map((c) => (
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

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Jobs list */}
      {jobs.length === 0 && !loading ? (
        <div className="text-center py-12 text-gray-500">
          No jobs found. Try adjusting filters.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => void fetchPage(cursor, false)}
          disabled={loading}
          className="w-full py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
