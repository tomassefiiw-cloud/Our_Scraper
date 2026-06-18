'use client';

import { useEffect, useState } from 'react';
import { queryOne, run, resetDb } from '@/lib/db';
import {
  JOB_CATEGORIES, WORK_TYPES, EMPLOYMENT_TYPES,
  ETHIOPIAN_CITIES, ADDIS_ABABA_AREAS,
} from '@/lib/channels';
import type { UserPreferencesRow } from '@/lib/schema';
import type { UserPreferences } from '@/lib/filter';
import { DEFAULT_PREFS } from '@/lib/filter';

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const row = await queryOne<UserPreferencesRow>('SELECT * FROM user_preferences WHERE id = 1');
        if (row) {
          setPrefs({
            min_experience_years: row.min_experience_years,
            max_experience_years: row.max_experience_years,
            job_categories: JSON.parse(row.job_categories_json || '[]'),
            locations: JSON.parse(row.locations_json || '[]'),
            addis_ababa_areas: JSON.parse(row.addis_ababa_areas_json || '[]'),
            work_types: JSON.parse(row.work_types_json || '[]'),
            employment_types: JSON.parse(row.employment_types_json || '[]'),
            exclude_keywords: JSON.parse(row.exclude_keywords_json || '[]'),
            min_salary_etb: row.min_salary_etb,
            max_salary_etb: row.max_salary_etb,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await run(
        `UPDATE user_preferences SET
           min_experience_years = ?,
           max_experience_years = ?,
           job_categories_json = ?,
           locations_json = ?,
           addis_ababa_areas_json = ?,
           work_types_json = ?,
           employment_types_json = ?,
           exclude_keywords_json = ?,
           min_salary_etb = ?,
           max_salary_etb = ?
         WHERE id = 1`,
        [
          prefs.min_experience_years,
          prefs.max_experience_years,
          JSON.stringify(prefs.job_categories),
          JSON.stringify(prefs.locations),
          JSON.stringify(prefs.addis_ababa_areas),
          JSON.stringify(prefs.work_types),
          JSON.stringify(prefs.employment_types),
          JSON.stringify(prefs.exclude_keywords),
          prefs.min_salary_etb,
          prefs.max_salary_etb,
        ],
      );
      setMsg('✓ Saved');
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof UserPreferences, value: string) => {
    setPrefs((p) => {
      const arr = p[key] as string[];
      return {
        ...p,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  };

  const clearAllData = async () => {
    if (!confirm('This will delete ALL local data (jobs, prefs, interactions). Continue?')) return;
    await resetDb();
    setPrefs(DEFAULT_PREFS);
    setMsg('All local data cleared');
  };

  if (loading) return <p className="text-gray-500">Loading preferences…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Preferences</h1>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Experience range (years)</h2>
        <div className="flex gap-3 items-center">
          <label className="text-sm">Min
            <input
              type="number" min={0} max={50}
              value={prefs.min_experience_years}
              onChange={(e) => setPrefs({ ...prefs, min_experience_years: +e.target.value })}
              className="ml-2 w-16 px-2 py-1 border border-gray-300 rounded"
            />
          </label>
          <label className="text-sm">Max
            <input
              type="number" min={0} max={50}
              value={prefs.max_experience_years}
              onChange={(e) => setPrefs({ ...prefs, max_experience_years: +e.target.value })}
              className="ml-2 w-16 px-2 py-1 border border-gray-300 rounded"
            />
          </label>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Job categories</h2>
        <div className="flex flex-wrap gap-2">
          {JOB_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => toggle('job_categories', c)}
              className={`px-3 py-1 rounded-full text-xs border ${
                prefs.job_categories.includes(c)
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white border-gray-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Locations</h2>
        <div className="flex flex-wrap gap-2">
          {ETHIOPIAN_CITIES.map((c) => (
            <button
              key={c}
              onClick={() => toggle('locations', c)}
              className={`px-3 py-1 rounded-full text-xs border ${
                prefs.locations.includes(c)
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white border-gray-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {prefs.locations.includes('Addis Ababa') && (
        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <h2 className="font-semibold">Addis Ababa areas</h2>
          <div className="flex flex-wrap gap-2">
            {ADDIS_ABABA_AREAS.map((a) => (
              <button
                key={a}
                onClick={() => toggle('addis_ababa_areas', a)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  prefs.addis_ababa_areas.includes(a)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white border-gray-300'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Work type</h2>
        <div className="flex flex-wrap gap-2">
          {WORK_TYPES.map((w) => (
            <button
              key={w}
              onClick={() => toggle('work_types', w)}
              className={`px-3 py-1 rounded-full text-xs border ${
                prefs.work_types.includes(w)
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white border-gray-300'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Employment type</h2>
        <div className="flex flex-wrap gap-2">
          {EMPLOYMENT_TYPES.map((e) => (
            <button
              key={e}
              onClick={() => toggle('employment_types', e)}
              className={`px-3 py-1 rounded-full text-xs border ${
                prefs.employment_types.includes(e)
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white border-gray-300'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Exclude keywords</h2>
        <p className="text-xs text-gray-500">
          Jobs whose title, description, or requirements contain any of these phrases will be hidden.
          e.g. &quot;5+ years required&quot;, &quot;senior only&quot;.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newKeyword.trim()) {
                setPrefs({ ...prefs, exclude_keywords: [...prefs.exclude_keywords, newKeyword.trim()] });
                setNewKeyword('');
              }
            }}
            placeholder="Add a phrase and press Enter"
            className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {prefs.exclude_keywords.map((kw) => (
            <span key={kw} className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
              {kw}
              <button
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    exclude_keywords: prefs.exclude_keywords.filter((k) => k !== kw),
                  })
                }
                className="text-red-900 hover:text-red-950"
              >×</button>
            </span>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>

      <section className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold text-red-900">Danger zone</h2>
        <p className="text-xs text-red-700">
          Clears all jobs, preferences, and interactions from this device. Cannot be undone.
        </p>
        <button
          onClick={clearAllData}
          className="px-3 py-1.5 border border-red-500 text-red-700 rounded text-sm font-medium hover:bg-red-100"
        >
          Clear all local data
        </button>
      </section>
    </div>
  );
}
