'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Header() {
  const [syncing, setSyncing] = useState(false);
  const [showBadge, setShowBadge] = useState(false);

  useEffect(() => {
    const start = () => { setSyncing(true); setShowBadge(true); };
    const end = () => { setSyncing(false); setTimeout(() => setShowBadge(false), 6000); };
    window.addEventListener('jobs-syncing', start);
    window.addEventListener('jobs-synced', end);
    return () => {
      window.removeEventListener('jobs-syncing', start);
      window.removeEventListener('jobs-synced', end);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-brand-600 text-lg flex items-center gap-2">
          EthioJob<span className="text-gray-900">Hunter</span>
          {showBadge && (
            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
              syncing ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${syncing ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></span>
              {syncing ? 'Syncing...' : 'Updated'}
            </span>
          )}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:text-brand-600">Feed</Link>
          <Link href="/saved" className="hover:text-brand-600">Saved</Link>
          <Link href="/settings" className="hover:text-brand-600">Settings</Link>
          <Link href="/admin" className="hover:text-brand-600">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
