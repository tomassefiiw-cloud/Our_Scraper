'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-brand-600 text-lg">
          EthioJob<span className="text-gray-900">Hunter</span>
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
