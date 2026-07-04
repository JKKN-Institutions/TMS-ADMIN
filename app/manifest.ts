import type { MetadataRoute } from 'next';

// Single installable app covering ALL four TMS portals (Admin at root, plus
// /student, /driver, /boarding). scope "/" + start_url "/" means one manifest
// serves every portal; proxy.ts routes an authenticated launch to the user's
// portal home. Served at /manifest.webmanifest (Next auto-links it).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'JKKN TMS',
    short_name: 'JKKN TMS',
    description: 'JKKN Transport Management System — routes, bookings, live tracking, and more.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#16a34a',
    background_color: '#ffffff',
    categories: ['productivity', 'travel'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Share Location',
        short_name: 'Share Location',
        description: 'Drivers: start sharing your live bus location.',
        url: '/driver/location',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
