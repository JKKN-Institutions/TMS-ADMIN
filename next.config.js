/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },

  output: 'standalone',
  compress: true,

  // Strip console.* from the production client bundle (keep error/warn for real
  // diagnostics). Removes dozens of debug logs from shipped JS — smaller bundles,
  // no leaked internals. Dev keeps every log.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },

  images: {
    formats: ['image/webp', 'image/avif'],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  experimental: {
    // Off: on Windows this persistent dev cache intermittently corrupts and takes
    // the dev server with it — 404s on routes that exist, 500s on every path, and a
    // stale lock left holding the port while nothing serves HTTP. It assumes a
    // single writer, so two dev servers sharing one .next/cache (a worktree plus the
    // main checkout) are enough to trigger it. Recovery is a full `.next` wipe, so
    // the cache costs more than the cold starts it saves.
    turbopackFileSystemCacheForDev: false,
    // Tree-shake barrel imports so a single `import { Icon } from 'lucide-react'`
    // (etc.) pulls only what's used instead of the whole package into shared JS.
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      'date-fns',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-tooltip',
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/auth/login',
        permanent: false,
      },
      {
        source: '/login',
        destination: '/auth/login',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
