/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // next-pwa compatibility — see install note in README
    typedRoutes: false,
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    return [
      { source: '/api/:path*', destination: `${apiBase}/:path*` },
    ];
  },
};

// PWA via next-pwa (optional — installed at runtime, falls back gracefully)
try {
  const withPWA = (await import('next-pwa')).default;
  return withPWA({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
  })(nextConfig);
} catch {
  // next-pwa not installed yet — still a valid Next.js app
  return nextConfig;
}
