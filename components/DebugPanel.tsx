'use client';

import { useEffect, useState } from 'react';
import { getDbStats, resetDb, queryAll } from '@/lib/db';
import { resetExtractionStatus, extractPendingOnly, type SyncResult } from '@/lib/sync';

interface Stats {
  channels?: number;
  raw_messages?: number;
  jobs?: number;
  user_preferences?: number;
  user_interactions?: number;
  error?: string;
  [k: string]: number | string | undefined;
}

interface RawMessageDebug {
  id: number;
  channel_username: string;
  telegram_msg_id: number;
  status: string;
  text_preview: string;
}

interface AiTestResult {
  ok: boolean;
  provider?: string;
  response?: string;
  error?: string;
}

export default function DebugPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [aiTest, setAiTest] = useState<AiTestResult | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [recentMessages, setRecentMessages] = useState<RawMessageDebug[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractResults, setExtractResults] = useState<SyncResult[] | null>(null);

  const refresh = async () => {
    setLoading(true);
    const s = await getDbStats();
    setStats(s);
    // Also fetch recent raw_messages with their status
    try {
      const msgs = await queryAll<RawMessageDebug>(
        `SELECT id, channel_username, telegram_msg_id, status,
                SUBSTR(message_text, 1, 80) as text_preview
         FROM raw_messages
         ORDER BY id DESC
         LIMIT 5`,
      );
      setRecentMessages(msgs);
    } catch (err) {
      console.error('Failed to load recent messages:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const wipe = async () => {
    if (!confirm('This will delete ALL local data (raw_messages, jobs, prefs). Continue?')) return;
    setMsg('Wiping…');
    await resetDb();
    setMsg('Wiped. Refreshing…');
    await refresh();
    setMsg('✓ DB reset. Click "Sync all" to fetch fresh data.');
  };

  const testAi = async () => {
    setAiTesting(true);
    setAiTest(null);
    setMsg('Testing AI provider…');
    try {
      const res = await fetch('/api/debug?test=1');
      const data = await res.json();
      setAiTest({
        ok: data.test?.ok ?? false,
        provider: data.test?.provider,
        response: data.test?.response,
        error: data.test?.error,
      });
      setMsg(data.test?.ok ? `✓ AI works (${data.test.provider})` : `✗ AI failed: ${data.test?.error ?? 'unknown'}`);
    } catch (err) {
      setAiTest({ ok: false, error: (err as Error).message });
      setMsg(`✗ AI test failed: ${(err as Error).message}`);
    } finally {
      setAiTesting(false);
    }
  };

  const resetExtraction = async () => {
    if (!confirm('This will reset all raw_messages back to status=pending so they can be re-extracted. Continue?')) return;
    setMsg('Resetting extraction status…');
    await resetExtractionStatus();
    await refresh();
    setMsg('✓ All raw_messages reset to pending. Click "Extract pending" to retry.');
  };

  const extractPending = async () => {
    setExtracting(true);
    setExtractResults(null);
    setMsg('Extracting pending messages (no re-scrape)…');
    try {
      const results = await extractPendingOnly();
      setExtractResults(results);
      const totalJobs = results.reduce((sum, r) => sum + r.jobsExtracted, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      setMsg(`✓ Extracted ${totalJobs} jobs, ${totalErrors} errors`);
      await refresh();
    } catch (err) {
      setMsg(`✗ Extraction failed: ${(err as Error).message}`);
    } finally {
      setExtracting(false);
    }
  };

  if (loading) return <p className="text-xs text-gray-500">Loading DB stats…</p>;

  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">🔧 Debug panel</h3>
        <button onClick={refresh} className="text-xs text-brand-600 hover:underline">
          ↻ Refresh
        </button>
      </div>

      {msg && (
        <div className={`text-xs p-2 rounded ${
          msg.startsWith('✓') ? 'bg-green-100 text-green-800' :
          msg.startsWith('✗') ? 'bg-red-100 text-red-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {msg}
        </div>
      )}

      {stats?.error && (
        <p className="text-xs text-red-700 bg-red-100 p-2 rounded">
          DB error: {stats.error}
        </p>
      )}

      {/* DB Stats */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-gray-600 mb-1">DB Stats</h4>
        <table className="w-full text-xs">
          <tbody>
            {stats && Object.entries(stats).filter(([k]) => k !== 'error').map(([k, v]) => (
              <tr key={k} className="border-b border-yellow-200">
                <td className="p-2 font-mono">{k}</td>
                <td className={`p-2 text-right font-mono ${k === 'jobs' && Number(v) === 0 && Number(stats.raw_messages) > 0 ? 'text-red-600 font-bold' : ''}`}>
                  {String(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stats && stats.raw_messages !== undefined && stats.raw_messages > 0 && stats.jobs === 0 && (
        <p className="text-xs text-red-700 bg-red-100 p-2 rounded">
          ⚠️ raw_messages &gt; 0 but jobs = 0 — extraction failed or never ran.
          Try the buttons below.
        </p>
      )}

      {/* AI Test */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-gray-600 mb-1">AI Provider Test</h4>
        <button
          onClick={testAi}
          disabled={aiTesting}
          className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {aiTesting ? 'Testing…' : 'Test AI provider'}
        </button>
        {aiTest && (
          <div className={`mt-2 text-xs p-2 rounded ${aiTest.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {aiTest.ok ? (
              <>
                <p><strong>✓ Works</strong> (provider: {aiTest.provider})</p>
                <p className="font-mono text-[10px] mt-1 break-all">Response: {aiTest.response}</p>
              </>
            ) : (
              <p><strong>✗ Failed:</strong> {aiTest.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Extraction Controls */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-gray-600 mb-1">Extraction Controls</h4>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={extractPending}
            disabled={extracting}
            className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {extracting ? 'Extracting…' : '⚡ Extract pending (no re-scrape)'}
          </button>
          <button
            onClick={resetExtraction}
            className="px-3 py-1 border border-orange-500 text-orange-700 rounded text-xs font-medium hover:bg-orange-100"
          >
            ↺ Reset extraction status
          </button>
        </div>

        {extractResults && (
          <div className="mt-2 text-xs">
            <table className="w-full">
              <thead className="bg-orange-100">
                <tr>
                  <th className="text-left p-1">Channel</th>
                  <th className="text-right p-1">Pending</th>
                  <th className="text-right p-1">Jobs</th>
                  <th className="text-right p-1">Err</th>
                </tr>
              </thead>
              <tbody>
                {extractResults.map((r, i) => (
                  <tr key={i} className="border-b border-orange-200">
                    <td className="p-1">{r.channel}</td>
                    <td className="p-1 text-right">{r.pendingExtracted}</td>
                    <td className="p-1 text-right">{r.jobsExtracted}</td>
                    <td className="p-1 text-right text-red-600">{r.errors.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {extractResults.some((r) => r.firstError) && (
              <div className="mt-2 p-2 bg-red-100 text-red-800 rounded text-[11px]">
                <strong>First error:</strong> {extractResults.find((r) => r.firstError)?.firstError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent raw_messages */}
      {recentMessages.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-gray-600 mb-1">
            Recent raw_messages (last 5)
          </h4>
          <div className="space-y-1">
            {recentMessages.map((m) => (
              <div key={m.id} className="text-[11px] bg-white p-2 rounded border border-yellow-200">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-mono text-gray-500">#{m.id}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    m.status === 'pending' ? 'bg-yellow-200 text-yellow-800' :
                    m.status === 'extracted' ? 'bg-green-200 text-green-800' :
                    m.status === 'failed' ? 'bg-red-200 text-red-800' :
                    'bg-gray-200 text-gray-800'
                  }`}>{m.status}</span>
                </div>
                <div className="text-gray-700 mt-1 truncate">{m.channel_username} / {m.telegram_msg_id}</div>
                <div className="text-gray-500 mt-0.5 truncate">{m.text_preview || '(empty text)'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-gray-600 mb-1">Danger Zone</h4>
        <button
          onClick={wipe}
          className="px-3 py-1 border border-red-500 text-red-700 rounded text-xs font-medium hover:bg-red-100"
        >
          🗑 Wipe local DB
        </button>
      </div>
    </div>
  );
}
