'use client';

import { useState } from 'react';
import { syncChannel, type SyncResult } from '@/lib/sync';
import { CHANNEL_CONFIGS } from '@/lib/channels';

export default function SyncPanel() {
  const [results, setResults] = useState<SyncResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const syncOne = async (username: string) => {
    setRunning(true);
    setProgress(`Syncing ${username}…`);
    try {
      const result = await syncChannel(username, {
        lookbackHours: CHANNEL_CONFIGS.find((c) => c.telegram_username === username)?.lookbackHours,
        skipPatterns: CHANNEL_CONFIGS.find((c) => c.telegram_username === username)?.skipPatterns,
      });
      setResults((prev) => [result, ...prev]);
      setProgress(`Done ${username}: ${result.jobsExtracted} jobs, ${result.jobsDuplicates} dupes`);
    } catch (err) {
      setProgress(`Error: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const syncAll = async () => {
    setRunning(true);
    setResults([]);
    for (const c of CHANNEL_CONFIGS) {
      setProgress(`Syncing ${c.telegram_username}…`);
      try {
        const result = await syncChannel(c.telegram_username, {
          lookbackHours: c.lookbackHours,
          skipPatterns: c.skipPatterns,
        });
        setResults((prev) => [...prev, result]);
      } catch (err) {
        setResults((prev) => [
          ...prev,
          {
            channel: c.telegram_username,
            messagesFound: 0,
            messagesNew: 0,
            jobsExtracted: 0,
            jobsDuplicates: 0,
            errors: [(err as Error).message],
          },
        ]);
      }
    }
    setProgress('All channels synced');
    setRunning(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={syncAll}
          disabled={running}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 text-sm"
        >
          {running ? 'Syncing…' : 'Sync all 12 channels'}
        </button>
        {progress && <span className="text-sm text-gray-600">{progress}</span>}
      </div>

      {/* Per-channel buttons */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-sm">Sync individual channel</h3>
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
          <h3 className="font-semibold text-sm">Recent sync results</h3>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Channel</th>
                <th className="text-left p-2">Found</th>
                <th className="text-left p-2">New</th>
                <th className="text-left p-2">Jobs</th>
                <th className="text-left p-2">Dupes</th>
                <th className="text-left p-2">Errors</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="p-2">{r.channel}</td>
                  <td className="p-2">{r.messagesFound}</td>
                  <td className="p-2">{r.messagesNew}</td>
                  <td className="p-2">{r.jobsExtracted}</td>
                  <td className="p-2">{r.jobsDuplicates}</td>
                  <td className="p-2 text-red-600">
                    {r.errors.length > 0 ? `${r.errors.length} err` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
