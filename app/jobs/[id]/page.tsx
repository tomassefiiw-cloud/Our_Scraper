'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { queryOne, run } from '@/lib/db';
import type { JobRow } from '@/lib/schema';
import { formatJobDescription, type FormattedJob } from '@/lib/formatter';

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<JobRow | null>(null);
  const [formatted, setFormatted] = useState<FormattedJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [formatting, setFormatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const loadJob = useCallback(async () => {
    setLoading(true);
    try {
      const row = await queryOne<JobRow>('SELECT * FROM jobs WHERE id = ?', [params.id]);
      if (!row) {
        setError('Job not found');
        setLoading(false);
        return;
      }
      setJob(row);

      // Record view interaction
      await run(`INSERT OR IGNORE INTO user_interactions (job_id, action) VALUES (?, 'viewed')`, [params.id]);

      // Check if saved
      const saveRow = await queryOne<{ id: number }>(
        `SELECT id FROM user_interactions WHERE job_id = ? AND action = 'saved'`, [params.id],
      );
      setSaved(!!saveRow);
      setLoading(false);

      // Format with AI
      setFormatting(true);
      try {
        const requirements: string[] = JSON.parse(row.requirements_json || '[]');
        const responsibilities: string[] = JSON.parse(row.responsibilities_json || '[]');
        const formattedJob = await formatJobDescription({
          title: row.title,
          title_amharic: row.title_amharic,
          company_name: row.company_name,
          description: row.description,
          requirements,
          responsibilities,
          how_to_apply: row.how_to_apply,
          location: row.location,
          salary_text: row.salary_text,
          deadline: row.deadline,
          employment_type: row.employment_type,
          work_type: row.work_type,
          job_category: row.job_category,
          location_city: row.location_city,
          is_remote: row.is_remote,
        });
        setFormatted(formattedJob);
      } catch (err) {
        console.warn('[job-detail] formatting failed:', err);
      } finally {
        setFormatting(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { loadJob(); }, [loadJob]);

  const save = async () => {
    if (saved) {
      await run(`DELETE FROM user_interactions WHERE job_id = ? AND action = 'saved'`, [params.id]);
      setSaved(false);
    } else {
      await run(`INSERT OR IGNORE INTO user_interactions (job_id, action) VALUES (?, 'saved')`, [params.id]);
      setSaved(true);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500">Loading job details…</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="space-y-4 py-8">
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
        <p className="font-medium">Error</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
      <Link href="/" className="text-brand-600 hover:underline">← Back to feed</Link>
    </div>
  );
  if (!job) return null;

  const deadline = job.deadline ? new Date(job.deadline) : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const requirements: string[] = JSON.parse(job.requirements_json || '[]');
  const responsibilities: string[] = JSON.parse(job.responsibilities_json || '[]');

  // Get formatted content or fall back to raw
  const descHtml = formatted?.description_html ?? (job.description ? `<p>${escapeHtml(job.description)}</p>` : '<p class="text-gray-400 italic">No description provided.</p>');
  const reqHtml = formatted?.requirements_html ?? (requirements.length ? '<ul>\n' + requirements.map(r => `  <li>${escapeHtml(r)}</li>`).join('\n') + '\n</ul>' : '');
  const respHtml = formatted?.responsibilities_html ?? (responsibilities.length ? '<ul>\n' + responsibilities.map(r => `  <li>${escapeHtml(r)}</li>`).join('\n') + '\n</ul>' : '');

  return (
    <article className="space-y-6 pb-12">
      <Link href="/" className="inline-flex items-center text-sm text-brand-600 hover:text-brand-700 font-medium">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to feed
      </Link>

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-800 rounded-2xl p-6 sm:p-8 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              {formatted?.title ?? job.title ?? 'Untitled Position'}
            </h1>
            {formatted?.title_amharic && (
              <p className="text-brand-100 text-lg mt-1" lang="am">{formatted.title_amharic}</p>
            )}
            <p className="text-xl text-brand-100 mt-2">
              {formatted?.company_name ?? job.company_name ?? 'Unknown company'}
            </p>
            {formatted?.summary && (
              <p className="text-brand-200 text-sm mt-3 italic">{formatted.summary}</p>
            )}
          </div>
          <button onClick={save} className={`shrink-0 px-4 py-2 rounded-xl font-medium text-sm backdrop-blur-sm transition-all ${saved ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-300' : 'bg-white/20 text-white hover:bg-white/30'}`}>
            {saved ? '★ Saved' : '☆ Save'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          {job.location_city && <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 rounded-full text-xs font-medium">📍 {job.location_city}</span>}
          {job.is_remote === 1 && <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/30 rounded-full text-xs font-medium">🌐 Remote</span>}
          {job.employment_type && <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 rounded-full text-xs font-medium">💼 {job.employment_type}</span>}
          {job.work_type && <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 rounded-full text-xs font-medium">🏢 {job.work_type}</span>}
          {job.job_category && <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 rounded-full text-xs font-medium">🏷️ {job.job_category}</span>}
          {job.min_experience_years !== null && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 rounded-full text-xs font-medium">⏳ {job.min_experience_years}{job.max_experience_years !== null ? `-${job.max_experience_years}` : '+'} years</span>
          )}
          {job.salary_text && <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 rounded-full text-xs font-medium">💰 {job.salary_text}</span>}
          {deadline && (
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${daysLeft !== null && daysLeft <= 3 ? 'bg-red-500/40' : 'bg-white/15'}`}>
              ⌛ Deadline {deadline.toLocaleDateString()}{daysLeft !== null && daysLeft >= 0 ? ` (${daysLeft}d left)` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Formatting indicator */}
      {formatting && (
        <div className="flex items-center gap-2 text-sm text-brand-600 bg-brand-50 rounded-lg px-4 py-2">
          <div className="animate-spin h-4 w-4 border-2 border-brand-600 border-t-transparent rounded-full"></div>
          Enhancing with local AI (Ollama)…
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              About the Role
            </h2>
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: descHtml }} />
          </section>

          {/* Requirements */}
          {reqHtml && (
            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                Requirements
              </h2>
              {formatted?.key_qualifications && formatted.key_qualifications.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {formatted.key_qualifications.map((q, i) => (
                    <span key={i} className="text-xs bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-200">{q}</span>
                  ))}
                </div>
              )}
              <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: reqHtml }} />
              {formatted?.nice_to_have && formatted.nice_to_have.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-gray-500 mt-4 mb-2">Nice to have</h3>
                  <ul className="space-y-1">
                    {formatted.nice_to_have.map((n, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600"><span className="text-gray-400 mt-0.5">○</span><span>{n}</span></li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {/* Responsibilities */}
          {respHtml && (
            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Responsibilities
              </h2>
              <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: respHtml }} />
            </section>
          )}

          {/* How to Apply */}
          {(formatted?.how_to_apply_html || job.how_to_apply) && (
            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                How to Apply
              </h2>
              {formatted?.how_to_apply_html ? (
                <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: formatted.how_to_apply_html }} />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.how_to_apply}</p>
              )}
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Quick Info</h3>
            <div className="space-y-2.5 text-sm">
              {job.company_name && <div className="flex justify-between"><span className="text-gray-500">Company</span><span className="font-medium text-gray-900">{job.company_name}</span></div>}
              {job.location_city && <div className="flex justify-between"><span className="text-gray-500">Location</span><span className="font-medium text-gray-900">{job.location_city}</span></div>}
              {job.employment_type && <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium text-gray-900 capitalize">{job.employment_type}</span></div>}
              {job.work_type && <div className="flex justify-between"><span className="text-gray-500">Work Mode</span><span className="font-medium text-gray-900 capitalize">{job.work_type}</span></div>}
              {job.min_experience_years !== null && <div className="flex justify-between"><span className="text-gray-500">Experience</span><span className="font-medium text-gray-900">{job.min_experience_years}{job.max_experience_years !== null ? `-${job.max_experience_years}` : '+'} years</span></div>}
              {job.salary_text && <div className="flex justify-between"><span className="text-gray-500">Salary</span><span className="font-medium text-gray-900">{job.salary_text}</span></div>}
              {deadline && <div className="flex justify-between"><span className="text-gray-500">Deadline</span><span className={`font-medium ${daysLeft !== null && daysLeft <= 3 ? 'text-red-600' : 'text-gray-900'}`}>{deadline.toLocaleDateString()}{daysLeft !== null && daysLeft >= 0 ? ` (${daysLeft}d)` : ''}</span></div>}
              {job.channel_username && <div className="flex justify-between"><span className="text-gray-500">Source</span><span className="font-medium text-gray-900">@{job.channel_username}</span></div>}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Actions</h3>
            <div className="space-y-2">
              {job.application_link && (
                <a href={job.application_link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-brand-600 text-white rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors">
                  Apply on Website <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
              {job.application_email && (
                <a href={`mailto:${job.application_email}?subject=Application%20for%20${encodeURIComponent(job.title ?? 'Position')}`} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-brand-600 text-brand-600 rounded-lg font-medium text-sm hover:bg-brand-50 transition-colors">
                  Email Application <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </a>
              )}
              <button onClick={save} className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${saved ? 'bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {saved ? '★ Saved' : '☆ Save for later'}
              </button>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <button onClick={() => setShowRaw(!showRaw)} className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {showRaw ? 'Hide' : 'Show'} extraction metadata
            </button>
            {showRaw && (
              <div className="mt-2 text-xs text-gray-400 space-y-1">
                <p>Method: {job.extraction_method}</p>
                {job.ai_provider_used && <p>Provider: {job.ai_provider_used}</p>}
                {job.ai_confidence && <p>Confidence: {Math.round(job.ai_confidence * 100)}%</p>}
                <p>Scraped: {new Date(job.scraped_at).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
