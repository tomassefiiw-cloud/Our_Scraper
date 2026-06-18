import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'EthioJob Hunter',
  description: 'AI-powered job aggregator for Ethiopian Telegram channels',
  manifest: '/manifest.json',
  applicationName: 'EthioJob Hunter',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'JobHunter' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(console.error);
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
