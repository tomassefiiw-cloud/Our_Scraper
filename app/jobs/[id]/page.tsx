'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { queryOne, run } from '@/lib/db';

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expired, setExpired] = useState(false);

  const loadJob = useCallback(async () => {
    setLoading(true);
    try {
      const row = await queryOne<Record<string, unknown>>(
        'SELECT * FROM jobs WHERE id = ?', [params.id]
      );
      if (!row) { setError('Job not found'); setLoading(false); return; }
      setJob(row);

      // Check if expired
      const deadline = String(row.deadline ?? '');
      if (deadline) {
        const d = new Date(deadline);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (d < today) setExpired(true);
      }

      await run(`INSERT OR IGNORE INTO user_interactions (job_id, action) VALUES (?, 'viewed')`, [params.id]);
      const saveRow = await queryOne<{ id: number }>(
        `SELECT id FROM user_interactions WHERE job_id = ? AND action = 'saved'`, [params.id]);
      setSaved(!!saveRow);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
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
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full"></div>
    </div>
  );

  if (error || !job) return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-center">
      <p className="text-red-600">{error || 'Job not found'}</p>
      <Link href="/" className="text-brand-600 hover:underline text-sm mt-4 inline-block">← Back</Link>
    </div>
  );

  const title = String(job.title ?? '');
  const company = job.company_name ? String(job.company_name) : '';
  const channel = String(job.channel_username ?? '');
  const deadline = String(job.deadline ?? '');
  const location = String(job.location_city ?? job.location ?? '');
  const desc = String(job.description ?? '');
  const salary = String(job.salary_text ?? '');
  const link = String(job.application_link ?? '');
  const email = String(job.application_email ?? '');
  const requirements_raw = JSON.parse(String(job.requirements_json ?? '[]')) as string[];
  const categories = JSON.parse(String(job.job_categories_json ?? '[]')) as string[];
  const minExp = job.min_experience_years;
  const maxExp = job.max_experience_years;
  const posted = String(job.posted_at ?? '');

  const deadlineDate = deadline ? new Date(deadline) : null;
  const daysLeft = deadlineDate ? Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000) : null;

  // Parse description into structured format
  // Extract experience years
  let expText = '';
  if (minExp !== null && minExp !== undefined) {
    expText = `${minExp}${maxExp ? ` - ${maxExp}` : '+'} years`;
  } else {
    const expMatch = desc.match(/(\d+)\s*[-–]?\s*(\d*)\s*years?\s+(?:of\s+)?(?:experience|exp)/i);
    if (expMatch) expText = `${expMatch[1]}${expMatch[2] ? ` - ${expMatch[2]}` : '+'} years`;
  }

  // Extract qualifications from requirements or description
  const qualifications = requirements_raw.length > 0 
    ? requirements_raw 
    : extractQualifications(desc);

  // Extract positions list
  const positions = extractPositions(desc, title);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-brand-600 mb-6">
        ← Back to job listings
      </Link>

      {/* EXPIRED BANNER */}
      {expired && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-6 text-center">
          <p className="text-red-700 font-bold text-lg">⚠️ DEADLINE PASSED</p>
          <p className="text-red-600 text-sm">This job listing expired on {deadlineDate?.toLocaleDateString()}</p>
        </div>
      )}

      {/* COMPANY NAME - Big and Bold */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Company</p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{company || <span className="text-gray-400 italic">Company not specified</span>}</h1>
            {channel && <p className="text-xs text-gray-400 mt-1">Source: @{channel}</p>}
          </div>
          <button onClick={toggleSave}
            className={`shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              saved ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>{saved ? '★ Saved' : '☆ Save'}</button>
        </div>

        {/* Info tags */}
        {(location || salary || deadlineDate) && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
            {location && <span className="bg-gray-100 px-3 py-1 rounded-full text-xs">📍 {location}</span>}
            {salary && <span className="bg-gray-100 px-3 py-1 rounded-full text-xs">💰 {salary}</span>}
            {deadlineDate && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                daysLeft !== null && daysLeft <= 3 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
              }`}>
                ⌛ {deadlineDate.toLocaleDateString()} {daysLeft !== null && daysLeft >= 0 ? `(${daysLeft}d left)` : expired ? '(Expired)' : ''}
              </span>
            )}
          </div>
        )}

        {/* Category tags */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {categories.map(cat => (
              <span key={cat} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">
                {cat}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* LIST OF POSITIONS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Position(s)</p>
        {positions.length > 0 ? (
          <ul className="space-y-2">
            {positions.map((pos, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-800">
                <span className="w-2 h-2 rounded-full bg-brand-500 mt-2 flex-shrink-0"></span>
                <span className="font-medium">{pos}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg font-semibold text-gray-900">{title}</p>
        )}
      </div>

      {/* YEARS OF EXPERIENCE */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Experience Required</p>
        {expText ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl">⏳</span>
            <div>
              <p className="text-xl font-bold text-gray-900">{expText}</p>
              <p className="text-sm text-gray-500">of professional experience</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 italic">Not specified — check with employer</p>
        )}
      </div>

      {/* QUALIFICATION CRITERIA */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Qualification Criteria</p>
        {qualifications.length > 0 ? (
          <ul className="space-y-2.5">
            {qualifications.map((q, i) => (
              <li key={i} className="flex items-start gap-3 text-gray-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0"></span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-gray-500 text-sm">
              {desc ? desc.slice(0, 500) : 'Visit the application link for full qualification details.'}
            </p>
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div className="flex flex-wrap gap-3">
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="flex-1 text-center px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-colors">
            Apply on Website ↗
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`}
            className="flex-1 text-center px-6 py-3 border-2 border-brand-600 text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition-colors">
            📧 Email Application
          </a>
        )}
        {!link && !email && channel && (
          <a href={`https://t.me/${channel}`} target="_blank" rel="noopener noreferrer"
            className="flex-1 text-center px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors">
            View on Telegram ↗
          </a>
        )}
      </div>

      {posted && <p className="text-xs text-gray-400 text-center mt-6">Posted: {new Date(posted).toLocaleDateString()}</p>}
    </div>
  );
}

function extractPositions(desc: string, title: string): string[] {
  const positions: string[] = [];
  
  // Add title as first position
  if (title && title.length > 0) positions.push(title);

  // Look for numbered/bullet position lists
  const lines = desc.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Numbered: "1. Finance Officer"
    const numMatch = trimmed.match(/^\d+[\.\)]\s+(.+)$/);
    if (numMatch) {
      const pos = numMatch[1].trim();
      if (pos.length > 2 && !positions.includes(pos)) positions.push(pos);
      continue;
    }
    // Bullet: "• Position: X" or "- Position: X"
    const bulletPos = trimmed.match(/^[•\-*]\s*(?:Job\s*)?(?:Position|Vacancy|Role)\s*[:–\-]?\s*(.+)$/i);
    if (bulletPos) {
      const pos = bulletPos[1].trim();
      if (pos.length > 2 && !positions.includes(pos)) positions.push(pos);
    }
  }

  return positions.length > 0 ? positions : (title ? [title] : []);
}

function extractQualifications(desc: string): string[] {
  const q: string[] = [];
  const lines = desc.split('\n');

  // Look for Requirements/Qualifications section
  let inReqSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { inReqSection = false; continue; }

    if (/(?:Requirements?|Qualifications?|Qualification Criteria|Key Requirements)\s*[:–\-]?$/i.test(trimmed)) {
      inReqSection = true;
      continue;
    }

    if (inReqSection) {
      // Stop at next section header
      if (/^(?:How to Apply|Responsibilities?|Deadline|Salary|Benefits|About|Job Summary)\s*[:–\-]?$/i.test(trimmed)) break;
      // Remove bullet markers
      const clean = trimmed.replace(/^[•\-*●◆➤▪️\d\.\)\s]+/, '').trim();
      if (clean.length > 5) q.push(clean);
    }
  }

  // If no section found, try to extract from requirement-like lines
  if (q.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[•\-*]\s+(?:BA|BSc|MSc|MA|Degree|Diploma|Certificate|Qualification|Experience|Skill)/i.test(trimmed)) {
        q.push(trimmed.replace(/^[•\-*]\s+/, '').trim());
      }
    }
  }

  return q.slice(0, 15);
}
