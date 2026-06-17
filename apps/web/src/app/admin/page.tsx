'use client';

import { useEffect, useState } from 'react';
import { apiClient, type Job } from '@/lib/api';

export default function AdminPage() {
  const [stats, setStats] = useState<{ totals: Record<string, number>; extractionMethods: Record<string, number>; aiProviders: Record<string, number> } | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [channels, setChannels] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.adminStats().catch((e) => { setError(e.message); return null; }),
      apiClient.adminRecentJobs().catch(() => ({ jobs: [] })),
      apiClient.scrapeLogs().catch(() => ({ logs: [] })),
      apiClient.adminChannelsHealth().catch(() => ({ channels: [] })),
    ]).then(([s, r, l, c]) => {
      if (s) setStats(s);
      setRecentJobs((r as { jobs: Job[] }).jobs);
      setLogs((l as { logs: unknown[] }).logs);
      setChannels((c as { channels: unknown[] }).channels);
    });
  }, []);

  const triggerScrape = async (channel?: string) => {
    try {
      const r = await apiClient.triggerScrape(channel);
      setTriggerMsg(`✓ ${r.status}${r.count ? ` (${r.count} channels)` : ''}`);
    } catch (e) {
      setTriggerMsg(`✗ ${(e as Error).message}`);
    }
  };

  if (error) return <p className="text-red-600">{error} (admin access required — log in as displayName=Admin)</p>;
  if (!stats) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Object.entries(stats.totals).map(([k, v]) => (
          <div key={k} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs uppercase text-gray-500">{k.replace(/([A-Z])/g, ' $1')}</p>
            <p className="text-2xl font-bold mt-1">{v}</p>
          </div>
        ))}
      </section>

      {/* Breakdowns */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold mb-2">Extraction methods</h2>
          <ul className="text-sm space-y-1">
            {Object.entries(stats.extractionMethods).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span><span className="font-mono">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold mb-2">AI providers used</h2>
          <ul className="text-sm space-y-1">
            {Object.entries(stats.aiProviders).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span><span className="font-mono">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Scrape controls */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Scrape controls</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => triggerScrape()}
            className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium hover:bg-brand-700"
          >
            Trigger all channels
          </button>
          {triggerMsg && <span className="text-sm text-gray-600 self-center">{triggerMsg}</span>}
        </div>
      </section>

      {/* Channels health */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Channels ({channels.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Channel</th>
                <th className="text-left p-2">Active</th>
                <th className="text-left p-2">Jobs</th>
                <th className="text-left p-2">Raw msgs</th>
                <th className="text-left p-2">Last scrape</th>
                <th className="text-left p-2">Errors</th>
                <th className="text-left p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => {
                const ch = c as {
                  id: string;
                  username: string;
                  displayName: string | null;
                  isActive: boolean;
                  jobsCount: number;
                  rawMessagesCount: number;
                  lastScrapedAt: string | null;
                  lastError: string | null;
                  errorCount: number;
                };
                return (
                  <tr key={ch.id} className="border-t border-gray-100">
                    <td className="p-2">{ch.displayName ?? ch.username}</td>
                    <td className="p-2">{ch.isActive ? '✅' : '⛔'}</td>
                    <td className="p-2">{ch.jobsCount}</td>
                    <td className="p-2">{ch.rawMessagesCount}</td>
                    <td className="p-2">{ch.lastScrapedAt ? new Date(ch.lastScrapedAt).toLocaleString() : '—'}</td>
                    <td className="p-2 text-red-600">{ch.errorCount || ''}</td>
                    <td className="p-2">
                      <button
                        onClick={() => triggerScrape(ch.username)}
                        className="text-brand-600 hover:underline"
                      >
                        Scrape now
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent jobs */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Recently scraped ({recentJobs.length})</h2>
        <div className="space-y-1">
          {recentJobs.slice(0, 20).map((j) => (
            <div key={j.id} className="text-xs flex justify-between border-b border-gray-100 py-1">
              <span className="truncate">{j.title ?? '—'} @ {j.companyName ?? '—'}</span>
              <span className="text-gray-400 ml-2">{j.extractionMethod}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent scrape logs */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Scrape logs ({logs.length})</h2>
        <div className="space-y-1">
          {logs.slice(0, 20).map((l, i) => {
            const log = l as {
              id: string;
              status: string;
              startedAt: string;
              messagesFound: number;
              messagesNew: number;
              jobsExtracted: number;
              jobsDuplicates: number;
              channel?: { telegramUsername: string };
            };
            return (
              <div key={log.id ?? i} className="text-xs flex justify-between border-b border-gray-100 py-1">
                <span>{log.channel?.telegramUsername ?? '—'} — {log.status}</span>
                <span className="text-gray-400">
                  new: {log.messagesNew} · jobs: {log.jobsExtracted} · dupes: {log.jobsDuplicates}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
