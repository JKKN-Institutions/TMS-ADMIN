# PWA — Phase 1: Installable TMS App + Offline Shell

**Date:** 2026-07-03
**Status:** Approved (design) — pending implementation plan
**Skill origin:** `.claude/skills/nextjs-pwa-skill`

## Context

TMS-ADMIN is a single Next.js 16 / React 19 App-Router app (Turbopack, CommonJS
`next.config.js`) hosting four portals: **Admin** (un-prefixed, `(admin)` route
group at root), **Student** (`/student`), **Driver** (`/driver`), **Boarding**
(`/boarding`). Route/area gating lives in `proxy.ts` (Next 16 renamed
middleware) using `lib/auth/areas.ts`.

A partial **driver-only** PWA already exists and will be superseded:
- `public/driver.webmanifest` (`scope: /driver`, `start_url: /driver/location`)
- `public/sw-driver.js` (no-op fetch handler, no caching)
- `components/driver/pwa.tsx` (`DriverPwa`, injects manifest/meta, registers SW,
  install button + iOS hint) — mounted in `app/driver/layout.tsx`

All four portal layouts are `'use client'`; the **root `app/layout.tsx` is a
server component** exporting `metadata`.

## Goal

Deliver **one installable TMS PWA** covering all four portals under scope `/`,
with an **offline app shell** (runtime-cached static assets + graceful offline
fallback). This is Phase 1 of a phased rollout.

### Non-goals (later phases)
- **Phase 2** — Web push (VAPID, `tms_push_subscription`, wire into
  `tms_notification` dispatch). `web-push` is already a dependency, unused.
- **Phase 3** — Offline data reads + queued writes (IndexedDB / background sync),
  scoped to explicitly named flows.

## Decisions

1. **Scope model:** One installable app, `scope: "/"`, `start_url: "/"`. The
   proxy routes an authenticated launch to the user's portal home
   (`resolveHomeForRole`). Un-prefixed admin + prefixed portals all fall under
   `/`, so a single root SW/manifest is correct.
2. **SW engine:** **Hand-rolled `public/sw.js`** (not `@serwist/next`). Rationale:
   Next 16 + Turbopack + CJS config makes the ESM/webpack Serwist plugin a real
   integration risk; a plain SW matches the existing `sw-driver.js` precedent,
   needs zero build-config change, and still delivers runtime offline caching.
   Trade-off: no automatic precache of the hashed build manifest — routes become
   offline-capable after first visit via runtime caching.
3. **Retire the driver-only PWA** into the unified one (per the one-app decision).

## Design

### 1. Manifest — `app/manifest.ts`
Served at `/manifest.webmanifest`; Next auto-injects `<link rel="manifest">`.
- `name: "JKKN TMS"`, `short_name: "JKKN TMS"`, `id: "/"`
- `start_url: "/"`, `scope: "/"`, `display: "standalone"`
- `theme_color: "#16a34a"` (brand green), `background_color: "#ffffff"`
- No `orientation` lock
- `icons`: 192 + 512 (`purpose: "any"`), 192 + 512 (`purpose: "maskable"`)

### 2. Icons — `scripts/generate-pwa-icons.js` (+ generated PNGs)
Source: existing `app/icon.png` (JKKN logo). Uses `sharp`. Outputs to
`public/icons/`:
- `icon-192.png`, `icon-512.png` (any)
- `icon-maskable-192.png`, `icon-maskable-512.png` (logo padded into the ~80%
  safe zone on a `#16a34a` field)
- `apple-touch-icon.png` (180×180)
If `sharp` is not installed, add it as a devDependency for the script only.

### 3. Root layout — `app/layout.tsx`
- Add `export const viewport: Viewport` — `width: 'device-width'`,
  `initialScale: 1`, `viewportFit: 'cover'`, `themeColor` light/dark
  (`#16a34a` / dark green).
- Add Apple web-app meta via `metadata` (`appleWebApp`:
  `capable`, `statusBarStyle: 'default'`, `title: 'JKKN TMS'`) and
  `apple-touch-icon` link.
- Mount `<PwaProvider />` (client) inside `<body>`.

### 4. Client provider — `components/pwa/pwa-provider.tsx`
`'use client'`. Responsibilities:
- Register `/sw.js` on `load` (guarded by `'serviceWorker' in navigator`).
- Listen for `updatefound` → prompt/auto-reload when a new SW takes control.
- Handle `beforeinstallprompt` → expose an "Install app" affordance
  (button/banner), mirroring the retired `DriverPwa` behavior.
- iOS "Add to Home Screen" hint (no `beforeinstallprompt` on iOS Safari).
Replaces `DriverPwa` for all portals.

### 5. Service worker — `public/sw.js` (hand-rolled)
Versioned cache name (e.g. `tms-shell-v1`) for clean invalidation.
- **install:** `skipWaiting`; pre-cache `/offline.html` + core icons.
- **activate:** `clients.claim`; delete caches not matching the current version.
- **fetch:**
  - navigations (`request.mode === 'navigate'`) → **NetworkFirst**; on failure
    serve cached page, then `/offline.html`.
  - `/_next/static/*`, `/icons/*` → **StaleWhileRevalidate**.
  - everything else (API, auth, Supabase) → **network only**, never cached.
- Handle `message` `{type:'SKIP_WAITING'}` to support the update flow.

### 6. Offline fallback — `public/offline.html`
Static, self-contained (inline CSS, brand green, "You're offline" copy + retry).
Framework-independent so it renders with zero cached route chunks.

### 7. Proxy — `proxy.ts`
Ensure pre-auth (public) fetchability of `/manifest.webmanifest`, `/sw.js`,
`/offline.html`, `/icons/`. Existing prefixes `/manifest`, `/sw.`, `/icons/`
already cover most; **add** `/offline.html`. **Remove** the now-dead
`/sw-driver.js` and `/driver.webmanifest` entries.

### 8. Retire driver PWA
Delete `public/driver.webmanifest`, `public/sw-driver.js`,
`components/driver/pwa.tsx`; remove `<DriverPwa/>` import/usage from
`app/driver/layout.tsx`.

## Files

**Create**
- `app/manifest.ts`
- `public/sw.js`
- `public/offline.html`
- `components/pwa/pwa-provider.tsx`
- `scripts/generate-pwa-icons.js`
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`

**Modify**
- `app/layout.tsx` (viewport, themeColor, appleWebApp, mount `<PwaProvider/>`)
- `proxy.ts` (whitelist `/offline.html`; drop driver-only entries)
- `app/driver/layout.tsx` (remove `DriverPwa`)

**Delete**
- `public/driver.webmanifest`, `public/sw-driver.js`,
  `components/driver/pwa.tsx`

## Verification

- `tsc` on changed files (ESLint is broken in this repo).
- Dev-server probes: `/manifest.webmanifest`, `/sw.js`, `/offline.html` return
  **200 pre-auth** (not 307/401).
- Manual (user's authenticated Chrome): install prompt appears; app installs and
  launches standalone; Lighthouse "Installable" passes; offline reload of a
  visited route shows cached shell / offline page.

## Risks

- **Turbopack + `public/` SW:** plain static SW in `public/` is served as-is by
  Next — no build integration needed; low risk.
- **`sharp` availability:** icon script needs it; add as devDependency if absent.
- **Maskable safe zone:** verify the logo isn't clipped on Android adaptive
  icons (padding in the generator).
- **start_url `/` redirect:** `/` → `/auth/login`; acceptable — installed app
  opens, authenticates, routes to portal home.
