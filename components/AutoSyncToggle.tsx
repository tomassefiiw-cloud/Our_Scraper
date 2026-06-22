'use client';

import { useState, useEffect, useRef } from 'react';
import { CHANNEL_CONFIGS } from '@/lib/channels';
import { syncChannel, type SyncResult } from '@/lib/sync';

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export default function AutoSyncToggle() {
  const [autoSync, setAutoSync] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [nextSync, setNextSync] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [channelIndex, setChannelIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncingRef = useRef(false);

  // Notify feed to refresh
  const notifyRefresh = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jobs-synced'));
    }
  };

  // Sync one channel at a time (round-robin)
  const syncNextChannel = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    
    try {
      const idx = channelIndex % CHANNEL_CONFIGS.length;
      const cfg = CHANNEL_CONFIGS[idx];
      setStatus(`⏳ Syncing ${cfg.telegram_username} (${idx + 1}/${CHANNEL_CONFIGS.length})...`);
      
      const result = await syncChannel(cfg.telegram_username, {
        skipPatterns: cfg.skipPatterns,
      });
      
      setChannelIndex(prev => prev + 1);
      setLastSync(new Date().toLocaleTimeString());
      
      if (result.jobsExtracted > 0) {
        setStatus(`✅ ${cfg.telegram_username}: ${result.jobsExtracted} new jobs`);
        notifyRefresh();
      } else if (result.errors.length > 0) {
        setStatus(`⚠️ ${cfg.telegram_username}: ${result.errors[0].slice(0, 60)}`);
      }
    } catch (err) {
      setStatus(`❌ Error: ${(err as Error).message}`);
    } finally {
      syncingRef.current = false;
    }
  };

  // Full sync all channels
  const syncAllChannels = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    
    let totalJobs = 0;
    for (let i = 0; i < CHANNEL_CONFIGS.length; i++) {
      const cfg = CHANNEL_CONFIGS[i];
      setStatus(`⏳ [${i + 1}/${CHANNEL_CONFIGS.length}] ${cfg.telegram_username}...`);
      try {
        const result = await syncChannel(cfg.telegram_username, {
          skipPatterns: cfg.skipPatterns,
        });
        totalJobs += result.jobsExtracted;
      } catch (err) {
        setStatus(`❌ ${cfg.telegram_username}: ${(err as Error).message}`);
      }
    }
    setStatus(`✅ All channels synced! ${totalJobs} total jobs`);
    setLastSync(new Date().toLocaleTimeString());
    notifyRefresh();
    syncingRef.current = false;
  };

  // Toggle auto-sync
  const toggleAutoSync = () => {
    if (autoSync) {
      // Stop
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setAutoSync(false);
      setNextSync(null);
      setStatus('⏹ Auto-scraping stopped');
    } else {
      // Start - immediately scrape then set interval
      setAutoSync(true);
      syncAllChannels();
      const next = new Date(Date.now() + INTERVAL_MS);
      setNextSync(next.toLocaleTimeString());
      
      intervalRef.current = setInterval(() => {
        syncAllChannels();
        const n = new Date(Date.now() + INTERVAL_MS);
        setNextSync(n.toLocaleTimeString());
      }, INTERVAL_MS);
      
      setStatus('▶️ Auto-scraping started (every 30 min)');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">🤖 Auto-Sync (Every 30 min)</h3>
        <button
          onClick={toggleAutoSync}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            autoSync
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          {autoSync ? '⏹ Stop' : '▶️ Start'}
        </button>
      </div>

      {status && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">{status}</div>
      )}

      {lastSync && (
        <div className="text-xs text-gray-400 flex justify-between">
          <span>Last sync: {lastSync}</span>
          {nextSync && <span>Next: ~{nextSync}</span>}
        </div>
      )}

      {!autoSync && (
        <button
          onClick={syncAllChannels}
          disabled={syncingRef.current}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {syncingRef.current ? '⏳ Syncing...' : '⚡ Sync Now (One-time)'}
        </button>
      )}

      <p className="text-[10px] text-gray-400">
        Auto-scrapes all 12 Telegram channels every 30 minutes. New jobs are added automatically.
      </p>
    </div>
  );
}
