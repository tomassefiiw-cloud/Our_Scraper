/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${apiBase}/:path*` }];
  },
};

// PWA via next-pwa (optional — falls back to manual SW if not installed)
let finalConfig = baseConfig;
try {
  const { default: withPWA } = await import('next-pwa');
  finalConfig = withPWA({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
  })(baseConfig);
} catch {
  // next-pwa not installed — use the manual service worker in public/sw.js
  console.log('[next.config] next-pwa not installed, using manual service worker');
}

export default finalConfig;
