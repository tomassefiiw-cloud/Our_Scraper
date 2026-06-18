'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  JOB_CATEGORIES,
  WORK_TYPES,
  EMPLOYMENT_TYPES,
  ETHIOPIAN_CITIES,
  ADDIS_ABABA_AREAS,
} from '@tja/shared';

interface Prefs {
  min_experience_years: number;
  max_experience_years: number;
  job_categories: string[];
  locations: string[];
  addis_ababa_areas: string[];
  work_types: string[];
  employment_types: string[];
  exclude_keywords: string[];
  min_salary_etb: number | null;
  max_salary_etb: number | null;
  notify_push: boolean;
  notify_email: boolean;
  purge_after_days: number;
}

const DEFAULT_PREFS: Prefs = {
  min_experience_years: 0,
  max_experience_years: 50,
  job_categories: [],
  locations: [],
  addis_ababa_areas: [],
  work_types: [],
  employment_types: [],
  exclude_keywords: [],
  min_salary_etb: null,
  max_salary_etb: null,
  notify_push: true,
  notify_email: false,
  purge_after_days: 30,
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');

  useEffect(() => {
    apiClient
      .prefs()
      .then((r) => setPrefs({ ...DEFAULT_PREFS, ...(r.prefs as Prefs) }))
      .catch((e) => setMsg(`Load failed: ${(e as Error).message}`))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiClient.updatePrefs(prefs);
      setMsg('Saved!');
    } catch (e) {
      setMsg(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof Prefs, value: string) => {
    setPrefs((p) => {
      const arr = p[key] as string[];
      return {
        ...p,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  };

  if (loading) return <p className="text-gray-500">Loading preferences…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Preferences</h1>

      {/* Experience */}
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

      {/* Job categories */}
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

      {/* Locations */}
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

      {/* Addis Ababa areas */}
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

      {/* Work types */}
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

      {/* Employment types */}
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

      {/* Exclude keywords */}
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
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Notifications</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.notify_push}
            onChange={(e) => setPrefs({ ...prefs, notify_push: e.target.checked })}
          />
          Push notifications (new matching jobs)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.notify_email}
            onChange={(e) => setPrefs({ ...prefs, notify_email: e.target.checked })}
          />
          Email notifications
        </label>
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

      <PushSubscribeSection />
    </div>
  );
}

function PushSubscribeSection() {
  const [status, setStatus] = useState<string>('');

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('Push notifications not supported in this browser');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      const json = sub.toJSON() as PushSubscriptionJSON;
      await apiClient.subscribePush(json);
      setStatus('Subscribed! You will be notified of new matching jobs.');
    } catch (e) {
      setStatus(`Subscription failed: ${(e as Error).message}`);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <h2 className="font-semibold">Enable push notifications</h2>
      <p className="text-xs text-gray-500">
        Click below to allow this device to receive push notifications when new matching jobs are scraped.
      </p>
      <button
        onClick={subscribe}
        className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 text-sm"
      >
        Enable notifications on this device
      </button>
      {status && <p className="text-sm text-gray-600">{status}</p>}
    </section>
  );
}
