'use client';

import { useEffect, useState } from 'react';
import SyncPanel from '@/components/SyncPanel';
import DebugPanel from '@/components/DebugPanel';
import { queryAll } from '@/lib/db';
import { CHANNEL_CONFIGS } from '@/lib/channels';
import type { JobRow } from '@/lib/schema';

interface ChannelStat {
  username: string;
  displayName: string;
  jobCount: number;
  lastScrapedAt: string | null;
}

export default function AdminPage() {
  const [stats, setStats] = useState<{ total: number; closed: number; channels: ChannelStat[] }>({
    total: 0,
    closed: 0,
    channels: [],
  });
  const [recentJobs, setRecentJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const totalRow = await queryAll<{ c: number }>('SELECT COUNT(*) as c FROM jobs');
      const closedRow = await queryAll<{ c: number }>('SELECT COUNT(*) as c FROM jobs WHERE is_closed = 1');
      const channelStats: ChannelStat[] = [];
      for (const c of CHANNEL_CONFIGS) {
        const row = await queryAll<{ c: number }>(
          'SELECT COUNT(*) as c FROM jobs WHERE channel_username = ?',
          [c.telegram_username],
        );
        channelStats.push({
          username: c.telegram_username,
          displayName: c.display_name,
          jobCount: row[0]?.c ?? 0,
          lastScrapedAt: null,
        });
      }
      setStats({
        total: totalRow[0]?.c ?? 0,
        closed: closedRow[0]?.c ?? 0,
        channels: channelStats,
      });
      const recent = await queryAll<JobRow>(
        'SELECT * FROM jobs ORDER BY scraped_at DESC LIMIT 20',
      );
      setRecentJobs(recent);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) return <p className="text-gray-500">Loading admin dashboard…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Total jobs" value={stats.total} />
        <Stat label="Open jobs" value={stats.total - stats.closed} />
        <Stat label="Channels" value={stats.channels.length} />
      </section>

      {/* Sync */}
      <section className="space-y-2">
        <h2 className="font-semibold">Sync now</h2>
        <p className="text-xs text-gray-500">
          Fetches latest messages from each Telegram channel, runs AI extraction, deduplicates,
          and stores in local SQLite. Uses server-side AI providers (keys never exposed to browser).
        </p>
        <SyncPanel />
      </section>

      {/* Debug */}
      <section className="space-y-2">
        <DebugPanel />
      </section>

      {/* Channel health */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Channels</h2>
          <button onClick={refresh} className="text-xs text-brand-600 hover:underline">
            ↻ Refresh
          </button>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Channel</th>
              <th className="text-left p-2">Jobs in DB</th>
            </tr>
          </thead>
          <tbody>
            {stats.channels.map((c) => (
              <tr key={c.username} className="border-t border-gray-100">
                <td className="p-2">{c.displayName}</td>
                <td className="p-2">{c.jobCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Recent jobs */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Recently scraped ({recentJobs.length})</h2>
        <div className="space-y-1">
          {recentJobs.map((j) => (
            <div key={j.id} className="text-xs flex justify-between border-b border-gray-100 py-1">
              <span className="truncate">
                {j.title ?? '—'} @ {j.company_name ?? '—'}
              </span>
              <span className="text-gray-400 ml-2">{j.extraction_method}</span>
            </div>
          ))}
          {recentJobs.length === 0 && (
            <p className="text-xs text-gray-500 italic">No jobs yet — click "Sync all" above.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
