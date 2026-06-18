'use client';

import { useEffect, useState } from 'react';
import { getDbStats, resetDb } from '@/lib/db';

interface Stats {
  channels?: number;
  raw_messages?: number;
  jobs?: number;
  user_preferences?: number;
  user_interactions?: number;
  error?: string;
  [k: string]: number | string | undefined;
}

export default function DebugPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const s = await getDbStats();
    setStats(s);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const wipe = async () => {
    if (!confirm('This will delete ALL local data. Continue?')) return;
    setMsg('Wiping…');
    await resetDb();
    setMsg('Wiped. Refreshing stats…');
    await refresh();
    setMsg('Done — DB reset. You can sync again now.');
  };

  if (loading) return <p className="text-xs text-gray-500">Loading DB stats…</p>;

  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">🔧 Debug panel</h3>
        <button onClick={refresh} className="text-xs text-brand-600 hover:underline">
          ↻ Refresh
        </button>
      </div>

      {stats?.error && (
        <p className="text-xs text-red-700 bg-red-100 p-2 rounded">
          DB error: {stats.error}
        </p>
      )}

      <table className="w-full text-xs">
        <tbody>
          {stats && Object.entries(stats).filter(([k]) => k !== 'error').map(([k, v]) => (
            <tr key={k} className="border-b border-yellow-200">
              <td className="p-2 font-mono">{k}</td>
              <td className="p-2 text-right font-mono">{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {stats && stats.raw_messages !== undefined && stats.raw_messages > 0 && (
        <p className="text-xs text-gray-600">
          If <code>raw_messages &gt; 0</code> but <code>jobs = 0</code>, the AI extraction step is failing.
          Check the browser console (F12) for <code>[sync]</code> log lines.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={wipe}
          className="px-3 py-1 border border-red-500 text-red-700 rounded text-xs font-medium hover:bg-red-100"
        >
          Wipe local DB
        </button>
        {msg && <span className="text-xs text-gray-600 self-center">{msg}</span>}
      </div>
    </div>
  );
}
