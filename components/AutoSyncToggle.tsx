'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CHANNEL_CONFIGS } from '@/lib/channels';
import { syncChannel } from '@/lib/sync';

const INTERVAL_MS = 30 * 60 * 1000;

export default function AutoSyncToggle() {
  const [autoSync, setAutoSync] = useState(false);
  const [status, setStatus] = useState('');
  const [totalJobs, setTotalJobs] = useState(0);
  const [syncedChannels, setSyncedChannels] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [countdown, setCountdown] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncingRef = useRef(false);
  const autoSyncActive = useRef(false);

  const notifyRefresh = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jobs-synced'));
    }
  }, []);

  const syncAllChannels = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    
    window.dispatchEvent(new CustomEvent('jobs-syncing'));
    
    let runningTotal = 0;
    for (let i = 0; i < CHANNEL_CONFIGS.length; i++) {
      const cfg = CHANNEL_CONFIGS[i];
      setStatus(`⏳ [${i + 1}/${CHANNEL_CONFIGS.length}] ${cfg.telegram_username}...`);
      try {
        const result = await syncChannel(cfg.telegram_username, { skipPatterns: cfg.skipPatterns });
        runningTotal += result.jobsExtracted;
        setTotalJobs(runningTotal);
        setSyncedChannels(i + 1);
        if (result.jobsExtracted > 0) notifyRefresh();
      } catch { /* continue */ }
    }
    
    setLastSyncTime(new Date().toLocaleString());
    setStatus(runningTotal > 0
      ? `✅ ${runningTotal} new jobs found across ${CHANNEL_CONFIGS.length} channels`
      : '✅ All channels synced - no new jobs found');
    
    notifyRefresh();
    syncingRef.current = false;
  }, [notifyRefresh]);

  const toggleAutoSync = () => {
    if (autoSyncActive.current) {
      autoSyncActive.current = false;
      setAutoSync(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown('');
      setStatus('⏹ Auto-scraper stopped');
    } else {
      autoSyncActive.current = true;
      setAutoSync(true);
      syncAllChannels();
      
      intervalRef.current = setInterval(() => {
        syncAllChannels();
      }, INTERVAL_MS);
      
      setStatus('▶️ Auto-scraper running - every 30 minutes');
    }
  };

  useEffect(() => {
    if (!autoSync || !lastSyncTime) return;
    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - new Date(lastSyncTime).getTime();
      const remaining = Math.max(0, INTERVAL_MS - elapsed);
      if (remaining <= 0) { setCountdown('🔃 Syncing now...'); return; }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`⏱ Next sync in ${mins}m ${secs}s`);
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [autoSync, lastSyncTime]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 text-base">🤖 Auto-Scraper</h3>
          <p className="text-xs text-gray-500 mt-0.5">Automatically scrapes all 12 channels every 30 minutes</p>
        </div>
        <button
          onClick={toggleAutoSync}
          className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${
            autoSync
              ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {autoSync ? '⏹ STOP' : '▶️ START'}
        </button>
      </div>

      {autoSync && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            <span className="font-bold text-green-800">Auto-Scraper ACTIVE</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500">Status</p>
              <p className="font-semibold text-gray-800">{status || 'Ready'}</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500">Last sync</p>
              <p className="font-semibold text-gray-800">{lastSyncTime || 'Not yet'}</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500">New jobs found</p>
              <p className="font-semibold text-gray-800">{totalJobs}</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500">Channels done</p>
              <p className="font-semibold text-gray-800">{syncedChannels}/{CHANNEL_CONFIGS.length}</p>
            </div>
          </div>
          {countdown && (
            <div className="text-center font-bold text-green-800 bg-green-100 rounded-lg p-2">
              {countdown}
            </div>
          )}
        </div>
      )}

      {!autoSync && (
        <button
          onClick={syncAllChannels}
          disabled={syncingRef.current}
          className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {syncingRef.current ? '⏳ Syncing...' : '⚡ Sync All Channels Now'}
        </button>
      )}

      <p className="text-[10px] text-gray-400">
        Expired jobs are hidden automatically. New jobs from auto-sync appear in your feed immediately.
        The green badge next to the logo in the header shows sync status.
      </p>
    </div>
  );
}
