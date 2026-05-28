import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable Cache Components for Next.js 16
  cacheComponents: true,

  // Production-grade cache profiles (based on data volatility)
  // Customize these based on your application's needs
  cacheLife: {
    // Default profile
    default: {
      stale: 300,       // 5 minutes - Client considers data stale
      revalidate: 900,  // 15 minutes - Server background refresh
      expire: 3600      // 1 hour - Hard expiration
    },

    // Hot data (1 minute) - Real-time data
    // Use for: payment status, active sessions, real-time notifications
    hot: {
      stale: 60,        // 1 minute
      revalidate: 300,  // 5 minutes
      expire: 600       // 10 minutes
    },

    // Warm data (5 minutes) - Moderate freshness
    // Use for: invoices, bills, receipts, student profiles, staff records
    warm: {
      stale: 300,       // 5 minutes
      revalidate: 900,  // 15 minutes
      expire: 1800      // 30 minutes
    },

    // Cold data (1 hour) - Master data
    // Use for: institutions, departments, programs, degrees, courses
    cold: {
      stale: 3600,      // 1 hour
      revalidate: 7200, // 2 hours
      expire: 14400     // 4 hours
    },

    // Static data (1 day) - Configuration data
    // Use for: academic years, semesters, regulations, system config
    static: {
      stale: 86400,     // 1 day
      revalidate: 172800, // 2 days
      expire: 604800    // 7 days
    },

    // Short-hand profiles (for simple cases)
    seconds: { stale: 5, revalidate: 15, expire: 30 },
    minutes: { stale: 60, revalidate: 180, expire: 300 },
    hours: { stale: 3600, revalidate: 7200, expire: 14400 },
    days: { stale: 86400, revalidate: 172800, expire: 604800 },
    weeks: { stale: 604800, revalidate: 1209600, expire: 2592000 },
    max: {
      stale: Number.MAX_SAFE_INTEGER,
      revalidate: Number.MAX_SAFE_INTEGER,
      expire: Number.MAX_SAFE_INTEGER
    },
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/**'
      },
      // Add other remote image sources here
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Turbopack configuration (optional)
  // Uncomment if using Turbopack
  // experimental: {
  //   turbo: {
  //     rules: {
  //       '*.svg': {
  //         loaders: ['@svgr/webpack'],
  //         as: '*.js',
  //       },
  //     },
  //   },
  // },

  // Compiler options
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  },
}

export default nextConfig
