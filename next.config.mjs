/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sql.js needs to load its WASM file; we serve it from /public/sql-wasm.wasm
  // (downloaded on first install via postinstall script — see package.json)
  async headers() {
    return [
      {
        source: '/sql-wasm.wasm',
        headers: [
          { key: 'Content-Type', value: 'application/wasm' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
