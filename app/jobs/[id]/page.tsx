'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { queryOne, run } from '@/lib/db';
import type { JobRow } from '@/lib/schema';

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<JobRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const row = await queryOne<JobRow>('SELECT * FROM jobs WHERE id = ?', [params.id]);
        if (!row) {
          setError('Job not found');
          return;
        }
        setJob(row);
        // Record view interaction
        await run(
          `INSERT OR IGNORE INTO user_interactions (job_id, action) VALUES (?, 'viewed')`,
          [params.id],
        );
        // Check if already saved
        const saveRow = await queryOne<{ id: number }>(
          `SELECT id FROM user_interactions WHERE job_id = ? AND action = 'saved'`,
          [params.id],
        );
        setSaved(!!saveRow);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return (
    <div className="space-y-4">
      <p className="text-red-600">{error}</p>
      <Link href="/" className="text-brand-600 hover:underline">← Back to feed</Link>
    </div>
  );
  if (!job) return null;

  const deadline = job.deadline ? new Date(job.deadline) : null;
  const daysLeft = deadline
    ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const requirements: string[] = JSON.parse(job.requirements_json || '[]');
  const responsibilities: string[] = JSON.parse(job.responsibilities_json || '[]');

  const save = async () => {
    if (saved) {
      await run(`DELETE FROM user_interactions WHERE job_id = ? AND action = 'saved'`, [params.id]);
      setSaved(false);
    } else {
      await run(
        `INSERT OR IGNORE INTO user_interactions (job_id, action) VALUES (?, 'saved')`,
        [params.id],
      );
      setSaved(true);
    }
  };

  return (
    <article className="space-y-6">
      <Link href="/" className="text-sm text-brand-600 hover:underline">← Back to feed</Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{job.title ?? 'Untitled Position'}</h1>
        {job.title_amharic && (
          <p className="text-lg text-gray-600" lang="am">{job.title_amharic}</p>
        )}
        <p className="text-lg text-gray-700">{job.company_name ?? 'Unknown company'}</p>
        {job.channel_username && (
          <p className="text-xs text-gray-400">via {job.channel_username}</p>
        )}
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        {job.location_city && <Chip>📍 {job.location_city}</Chip>}
        {job.is_remote === 1 && <Chip>🌐 Remote</Chip>}
        {job.employment_type && <Chip>💼 {job.employment_type}</Chip>}
        {job.work_type && <Chip>🏢 {job.work_type}</Chip>}
        {job.job_category && <Chip>🏷️ {job.job_category}</Chip>}
        {job.min_experience_years !== null && (
          <Chip>
            ⏳ {job.min_experience_years}
            {job.max_experience_years !== null ? `-${job.max_experience_years}` : '+'} years
          </Chip>
        )}
        {job.salary_text && <Chip>💰 {job.salary_text}</Chip>}
        {deadline && (
          <Chip>
            ⌛ Deadline {deadline.toLocaleDateString()}
            {daysLeft !== null && daysLeft >= 0 && ` (${daysLeft}d left)`}
          </Chip>
        )}
      </div>

      {job.description && (
        <section>
          <h2 className="font-semibold mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{job.description}</p>
        </section>
      )}

      {requirements.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Requirements</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {requirements.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </section>
      )}

      {responsibilities.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Responsibilities</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {responsibilities.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </section>
      )}

      {job.how_to_apply && (
        <section>
          <h2 className="font-semibold mb-2">How to Apply</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{job.how_to_apply}</p>
        </section>
      )}

      <section className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
        {job.application_link && (
          <a
            href={job.application_link}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700"
          >
            Apply on website ↗
          </a>
        )}
        {job.application_email && (
          <a
            href={`mailto:${job.application_email}`}
            className="px-4 py-2 border border-brand-600 text-brand-600 rounded-lg font-medium hover:bg-brand-50"
          >
            Email application ✉
          </a>
        )}
        <button
          onClick={save}
          className={`px-4 py-2 border rounded-lg font-medium ${
            saved
              ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
              : 'border-gray-300 hover:bg-gray-50'
          }`}
        >
          {saved ? '★ Saved' : '☆ Save'}
        </button>
      </section>

      <p className="text-xs text-gray-400 pt-4">
        Extracted via {job.extraction_method} · AI confidence: {job.ai_confidence ? `${Math.round(job.ai_confidence * 100)}%` : 'n/a'}
        {job.ai_provider_used ? ` · provider: ${job.ai_provider_used}` : ''}
      </p>
    </article>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="bg-gray-100 px-3 py-1 rounded-full text-xs">{children}</span>;
}
