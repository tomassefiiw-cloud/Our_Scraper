'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { queryOne, run } from '@/lib/db';
import { formatJobForDisplay, type DisplayJob } from '@/lib/formatted-description';

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [displayJob, setDisplayJob] = useState<DisplayJob | null>(null);
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadJob = useCallback(async () => {
    setLoading(true);
    try {
      const row = await queryOne<Record<string, unknown>>('SELECT * FROM jobs WHERE id = ?', [params.id]);
      if (!row) {
        setError('Job not found');
        setLoading(false);
        return;
      }
      setRaw(row);
      const formatted = formatJobForDisplay(row);
      setDisplayJob(formatted);

      await run(`INSERT OR IGNORE INTO user_interactions (job_id, action) VALUES (?, 'viewed')`, [params.id]);
      const saveRow = await queryOne<{ id: number }>(
        `SELECT id FROM user_interactions WHERE job_id = ? AND action = 'saved'`, [params.id],
      );
      setSaved(!!saveRow);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { loadJob(); }, [loadJob]);

  const toggleSave = async () => {
    if (saved) {
      await run(`DELETE FROM user_interactions WHERE job_id = ? AND action = 'saved'`, [params.id]);
      setSaved(false);
    } else {
      await run(`INSERT OR IGNORE INTO user_interactions (job_id, action) VALUES (?, 'saved')`, [params.id]);
      setSaved(true);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500 text-sm">Loading job details…</p>
      </div>
    </div>
  );

  if (error || !displayJob) return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700 font-medium">{error || 'Job not found'}</p>
        <Link href="/" className="inline-block mt-4 text-brand-600 hover:underline text-sm">← Back to feed</Link>
      </div>
    </div>
  );

  const j = displayJob;
  const deadline = j.deadline ? new Date(j.deadline) : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / 86400000) : null;
  const postedDate = j.posted_at ? new Date(j.posted_at).toLocaleDateString() : null;

  // Category colors
  const catColors: Record<string, string> = {
    tech: 'bg-blue-100 text-blue-800',
    health: 'bg-red-100 text-red-800',
    finance: 'bg-green-100 text-green-800',
    engineering: 'bg-orange-100 text-orange-800',
    marketing: 'bg-purple-100 text-purple-800',
    sales: 'bg-yellow-100 text-yellow-800',
    admin: 'bg-gray-100 text-gray-800',
    creative: 'bg-pink-100 text-pink-800',
    ngo: 'bg-teal-100 text-teal-800',
    education: 'bg-indigo-100 text-indigo-800',
    logistics: 'bg-amber-100 text-amber-800',
    hospitality: 'bg-rose-100 text-rose-800',
    legal: 'bg-violet-100 text-violet-800',
    hr: 'bg-cyan-100 text-cyan-800',
    management: 'bg-slate-100 text-slate-800',
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-brand-600 transition-colors mb-6">
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to job listings
      </Link>

      {/* Hero Section */}
      <div className="gradient-brand rounded-2xl p-6 md:p-8 text-white shadow-lg mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">{j.title}</h1>
            {j.title_amharic && (
              <p className="text-white/80 text-lg mt-1" lang="am">{j.title_amharic}</p>
            )}
            <p className="text-xl text-white/90 mt-2 font-medium">{j.company_name}</p>
            {j.channel && (
              <p className="text-white/60 text-xs mt-2">via @{j.channel}</p>
            )}
          </div>
          <button
            onClick={toggleSave}
            className={`shrink-0 px-4 py-2.5 rounded-xl font-medium text-sm backdrop-blur-sm transition-all ${
              saved ? 'bg-yellow-400 text-yellow-900' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            {saved ? '★ Saved' : '☆ Save'}
          </button>
        </div>

        {/* Meta Tags Row */}
        <div className="flex flex-wrap gap-2 mt-5">
          {j.location_city && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-medium">
              📍 {j.location_city}
            </span>
          )}
          {j.is_remote && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-400/30 backdrop-blur-sm rounded-full text-xs font-medium">
              🌐 Remote
            </span>
          )}
          {j.work_type && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-medium">
              🏢 {j.work_type}
            </span>
          )}
          {j.employment_type && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-medium">
              💼 {j.employment_type}
            </span>
          )}
          {j.salary_text && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-medium">
              💰 {j.salary_text}
            </span>
          )}
          {deadline && (
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${
              daysLeft !== null && daysLeft <= 7 ? 'bg-red-400/40' : 'bg-white/15'
            }`}>
              ⌛ {deadline.toLocaleDateString()}
              {daysLeft !== null && daysLeft >= 0 && ` (${daysLeft}d)`}
            </span>
          )}
          {j.min_experience !== null && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-medium">
              ⏳ {j.min_experience}{j.max_experience ? `-${j.max_experience}` : '+'} yrs
            </span>
          )}
        </div>

        {/* Category Tags */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {j.categories.map(cat => (
            <span key={cat} className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${catColors[cat] || 'bg-gray-100 text-gray-800'}`}>
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Description */}
        <div className="lg:col-span-2 space-y-6">
          {/* About the Role */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-brand-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              About the Role
            </h2>
            <div className="prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: j.description_html }} />
            {j.source_url && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <a href={j.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline">
                  📎 View original source ↗
                </a>
              </div>
            )}
          </div>

          {/* Requirements */}
          {j.requirements.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Requirements & Qualifications
              </h2>
              <ul className="space-y-2">
                {j.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 flex-shrink-0"></span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Responsibilities */}
          {j.responsibilities.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Responsibilities
              </h2>
              <ul className="space-y-2">
                {j.responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 flex-shrink-0"></span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* How to Apply */}
          {j.how_to_apply && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                How to Apply
              </h2>
              <div className="prose-sm max-w-none">{j.how_to_apply}</div>
            </div>
          )}

          {/* Posted date */}
          {postedDate && (
            <p className="text-xs text-gray-400 text-center">Posted on {postedDate}</p>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Quick Info Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 text-sm mb-4">Quick Info</h3>
            <div className="space-y-3 text-sm">
              {j.company_name && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-500">Company</span>
                  <span className="font-medium text-gray-900 text-right">{j.company_name}</span>
                </div>
              )}
              {j.location_city && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-500">Location</span>
                  <span className="font-medium text-gray-900">{j.location_city}</span>
                </div>
              )}
              {j.employment_type && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium text-gray-900 capitalize">{j.employment_type}</span>
                </div>
              )}
              {j.work_type && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-500">Work Mode</span>
                  <span className="font-medium text-gray-900 capitalize">{j.work_type}</span>
                </div>
              )}
              {j.min_experience !== null && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-500">Experience</span>
                  <span className="font-medium text-gray-900">{j.min_experience}{j.max_experience ? `-${j.max_experience}` : '+'} years</span>
                </div>
              )}
              {j.salary_text && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-500">Salary</span>
                  <span className="font-medium text-gray-900">{j.salary_text}</span>
                </div>
              )}
              {deadline && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-500">Deadline</span>
                  <span className={`font-medium ${daysLeft !== null && daysLeft <= 7 ? 'text-red-600' : 'text-gray-900'}`}>
                    {deadline.toLocaleDateString()}
                    {daysLeft !== null && daysLeft >= 0 && ` (${daysLeft}d)`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 text-sm mb-4">Actions</h3>
            <div className="space-y-2.5">
              {j.application_link && (
                <a
                  href={j.application_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-brand-600 text-white rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors"
                >
                  Apply on Website
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              {j.application_email && (
                <a
                  href={`mailto:${j.application_email}?subject=Application for ${encodeURIComponent(j.title)}`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-brand-600 text-brand-600 rounded-lg font-medium text-sm hover:bg-brand-50 transition-colors"
                >
                  Email Application
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </a>
              )}
              <button
                onClick={toggleSave}
                className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  saved ? 'bg-yellow-50 text-yellow-800 border border-yellow-300' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {saved ? '★ Saved' : '☆ Save for later'}
              </button>
            </div>
          </div>

          {/* Extraction Info */}
          {j.extraction_method && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <details className="text-xs">
                <summary className="text-gray-500 hover:text-gray-700 cursor-pointer font-medium flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Extraction info
                </summary>
                <div className="mt-2 text-gray-400 space-y-1">
                  <p>Method: {j.extraction_method}</p>
                  {j.source_url && <p className="truncate">Source: {j.source_url}</p>}
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
