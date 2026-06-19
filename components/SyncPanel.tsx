'use client';

import { useState } from 'react';
import { syncChannel, type SyncResult } from '@/lib/sync';
import { CHANNEL_CONFIGS } from '@/lib/channels';

export default function SyncPanel({ onSyncComplete }: { onSyncComplete?: () => void }) {
  const [results, setResults] = useState<SyncResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [totalJobs, setTotalJobs] = useState(0);

  // Signal the feed to refresh
  const notifyRefresh = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jobs-synced'));
    }
    onSyncComplete?.();
  };

  const syncOne = async (username: string) => {
    setRunning(true);
    setProgress(`Syncing ${username}…`);
    try {
      const cfg = CHANNEL_CONFIGS.find((c) => c.telegram_username === username);
      const result = await syncChannel(username, { skipPatterns: cfg?.skipPatterns });
      setResults((prev) => [result, ...prev]);
      setTotalJobs((prev) => prev + result.jobsExtracted);
      setProgress(`Done ${username}: ${result.jobsExtracted} jobs`);
      notifyRefresh();
    } catch (err) {
      setProgress(`Error: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const syncAll = async () => {
    setRunning(true);
    setResults([]);
    setTotalJobs(0);
    let cumulative = 0;

    for (const c of CHANNEL_CONFIGS) {
      setProgress(`Syncing ${c.telegram_username}… (${cumulative} jobs so far)`);
      try {
        const result = await syncChannel(c.telegram_username, { skipPatterns: c.skipPatterns });
        setResults((prev) => [...prev, result]);
        cumulative += result.jobsExtracted;
        setTotalJobs(cumulative);
        setProgress(`✓ ${c.telegram_username}: ${result.jobsExtracted} jobs (${cumulative} total)`);
      } catch (err) {
        setResults((prev) => [...prev, {
          channel: c.telegram_username, messagesFound: 0, messagesNew: 0,
          pendingExtracted: 0, jobsExtracted: 0, jobsDuplicates: 0,
          errors: [(err as Error).message], firstError: (err as Error).message,
        }]);
      }
    }
    setProgress(`✅ All channels synced! ${cumulative} total jobs extracted`);
    setRunning(false);
    notifyRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={syncAll}
          disabled={running}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 text-sm"
        >
          {running ? '⏳ Syncing…' : '⚡ Sync all 12 channels'}
        </button>
        {progress && <span className="text-sm text-gray-600">{progress}</span>}
      </div>

      {/* Per-channel buttons */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-sm">Or sync individual channel</h3>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_CONFIGS.map((c) => (
            <button
              key={c.telegram_username}
              onClick={() => syncOne(c.telegram_username)}
              disabled={running}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {c.telegram_username}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-sm">
            Results — <span className="text-brand-600">{totalJobs} jobs total</span>
          </h3>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Channel</th>
                <th className="text-left p-2">Found</th>
                <th className="text-left p-2">Jobs</th>
                <th className="text-left p-2">Dupes</th>
                <th className="text-left p-2">Errors</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className={`border-t border-gray-100 ${r.errors.length > 0 ? 'bg-red-50' : r.jobsExtracted > 0 ? 'bg-green-50' : ''}`}>
                  <td className="p-2 font-mono">{r.channel}</td>
                  <td className="p-2 text-right">{r.messagesFound}</td>
                  <td className="p-2 text-right font-semibold">{r.jobsExtracted}</td>
                  <td className="p-2 text-right">{r.jobsDuplicates}</td>
                  <td className={`p-2 text-right ${r.errors.length > 0 ? 'text-red-600 font-bold' : ''}`}>
                    {r.errors.length > 0 ? r.errors.length : '✓'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {results.some((r) => r.firstError) && (
            <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-800">
              <strong>First error:</strong> {results.find((r) => r.firstError)?.firstError}
            </div>
          )}

          {totalJobs > 0 && (
            <div className="mt-2 p-2 bg-green-100 border border-green-300 rounded text-xs text-green-800">
              ✅ <strong>{totalJobs} jobs</strong> ready! <a href="/" className="underline">View in Feed →</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
