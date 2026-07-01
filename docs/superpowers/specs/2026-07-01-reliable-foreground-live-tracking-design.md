# Reliable Foreground Live Tracking (pure web) — Design

**Date:** 2026-07-01
**Status:** Approved (design). Next step: implementation plan (writing-plans).
**Author:** Brainstorming session with the user (4-agent investigation + external research).
**Scope decision:** **Pure web only** — no native wrapper. (True background tracking is
explicitly deferred; see "Out of scope".)

## Problem

A driver opens the web app on a phone and taps to share live location. The UI shows
"Active", but the bus marker on every portal **stops at the place where sharing started and
never moves** — and closing the app or locking the phone makes it worse. A 4-agent
investigation (driver capture / backend ingest / map render / external platform research)
found this is **one dominant cause plus three independent bugs**, not a single failure.

### ① Primary cause — capture is foreground-only and the phone suspends it (platform limit)
Capture uses `navigator.geolocation.watchPosition` and POSTs the latest fix on a timer. This
works **only while the page is the visible foreground tab with the screen on**. The instant the
driver locks the phone, switches apps, or backgrounds the tab, the mobile browser **suspends
`watchPosition` and freezes/throttles timers** — iOS Safari suspends within seconds and runs no
JS; Android Chrome disables background geolocation (Chromium #506435) and freezes timers after
~5 min. No new fixes are sent → `tms_vehicle.current_*` stops advancing → every reader faithfully
renders the last coordinate. **This is a browser platform constraint, not a code bug.** The map,
5 s polling, and smooth glide are all correct — they can only animate coordinates that change.
The existing Screen Wake Lock is auto-released the instant the page is hidden and does **not**
survive a manual power-button lock, so today it only prevents auto-dim while the app stays open.

### ② Bug — the "Active" badge is faked (this is the visible "active but frozen")
- Driver's own green "Sharing live" banner is a local `onDuty` toggle; stays green after fixes
  freeze (`app/driver/location/page.tsx:334-342`).
- Admin "Active Tracking" count and "Last Update: Just now" are driven by the sticky
  `location_sharing_enabled` flag and the **poll** time, not GPS freshness
  (`app/(admin)/track-all/page.tsx:61,213-216,240-245`). An admin sees "Active / Just now" with a
  colored marker while the real position is minutes stale.
- A correct freshness helper already exists (`lib/gps/freshness.ts`, online ≤2 min / recent ≤5 min
  / offline) — it just does not drive the reassuring "active" chrome.

### ③ Bug — the phone's OS location being OFF is misreported
No Permissions API check anywhere. When the phone's **OS location switch is off**, the browser
returns `POSITION_UNAVAILABLE`, which `lib/driver/geo.ts:38` classifies as a *transient*
"GPS signal dropped momentarily — will resume automatically". It will **not** resume until the
driver enables OS location, but the app never says so.

### ④ Bug — trusting the phone's clock can freeze a foreground bus
The server monotonic guard stamps `last_gps_update` with the phone's `capturedAt` (up to +60 s
future accepted). A fast phone clock poisons the baseline into the near-future; every genuinely
newer fix is then rejected until wall-clock catches up — a self-inflicted freeze of up to ~60 s,
**even in perfect foreground conditions** (`lib/driver/tracking.ts`,
`app/api/driver/location/route.ts:144-164`). It also skews reader freshness.

## What is already correct (do NOT change)
- **Maps are free & mobile-only:** Leaflet 1.9.4 + OpenStreetMap tiles. No Google Maps, Mapbox,
  MapLibre, or paid GPS/telematics. The "free map, phone-GPS-only" constraint is already met.
- 5 s polling (admin/student/boarding), marker diffing, and `requestAnimationFrame` glide
  (`lib/gps/interpolate.ts`) all work as designed.
- Ingest resolves driver → route → vehicle and writes `tms_vehicle.current_*` +
  `gps_location_history`; the monotonic guard correctly rejects equal/older re-sends.

## Goal
Make foreground live tracking **robust and, above all, truthful**: never show "Active" for a bus
that is not actually sending fresh fixes; tell the driver exactly what to do (keep screen on,
turn on OS location, grant permission); and remove the one bug that can freeze a bus even in the
foreground. Accept and clearly communicate the platform limit: capture runs only while the app is
open with the screen on.

## Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Platform | **Pure web only.** No Capacitor/native. Background tracking deferred. |
| Offline gaps | **Basic retry** (retry the latest fix 2-3× on POST failure). No offline buffer/replay store. |
| Dropout handling | **Heartbeat watchdog + loud driver alert** when fresh fixes stop; readers flip to offline promptly. |
| Installability | **Installable PWA** (manifest + minimal scoped service worker + install prompt). |
| Send cadence | **~6 s** (down from 12 s) to match the 5 s poll + 4.5 s glide. |
| Heartbeat threshold | **~25 s** with no fresh fix while on-duty → "paused" state + alert. |
| PWA `start_url` | `/driver/location`. |
| Architecture | **Extract a pure capture controller** (`lib/driver/tracking-controller.ts`, vitest-tested) + a thin `useLiveTracking` hook; the page becomes mostly presentation. |
| Transport | **Polling** unchanged (no Realtime/SSE). |
| Maps | **Unchanged** (Leaflet/OSM). |

## Architecture

The data transport is unchanged. Three surfaces change: capture robustness on the phone, status
honesty on every viewer, and the server clock-trust fix.

```
DRIVER PHONE (app open, screen on)                 SERVER                       VIEWERS
 useLiveTracking(hook)                                                          
  └ trackingController (pure state machine) ─POST /api/driver/location(~6s)─► clock-trust FIX
     idle→starting→LIVE⇄PAUSED                        (server-receipt time =    → honest freshness
       →os_location_off / permission_denied            monotonic baseline)         badges everywhere
     • watchPosition (highAccuracy, small maxAge)                               (admin/student/boarding
     • send latest fix ~6s; basic retry 2-3×                                     driven by real fix age,
     • wakeLock + re-acquire on visibilitychange→visible                         not sticky flags or
     • heartbeat watchdog → loud "paused" alert                                  poll time)
     • Permissions API pre-check + OS-off classification
```

## Components (by phase)

### Phase 0 — Server clock-trust correctness fix (independent, ship-able alone)
Two distinct goals in `lib/driver/tracking.ts` + `app/api/driver/location/route.ts`. They pull in
different directions, so keep them separate:
1. **Freshness must not depend on the phone clock.** Base reader freshness on a **server-receipt
   timestamp** (`now()` at the moment a ping is *accepted*), not the client `capturedAt`. Refresh
   it **only when a ping is genuinely accepted** (a new fix) — a frozen re-send must never refresh
   it, or a stale bus would look "online" again.
2. **The anti-regression guard must not be poisonable by a fast client clock.** Keep rejecting
   stale / out-of-order / duplicate re-sends by ordering on device capture time, but **clamp the
   incoming `capturedAt` to `min(capturedAt, serverNow)`** before it becomes the new ordering
   baseline, so a phone clock running up to +60 s fast can no longer lock out subsequent real
   fixes. (This subsumes the existing future-skew clamp.)
- The exact column/mechanism is finalized in the plan: reuse `last_gps_update` as the
  server-receipt/freshness field and order on the clamped capture value — **no schema change** if
  that works; otherwise add a dedicated `last_capture_at` column for the ordering baseline.
- Update `lib/driver/tracking.test.ts`: add "fast client clock does not freeze subsequent fixes"
  and "frozen re-send does not refresh freshness".

### Phase 1 — Capture controller + `useLiveTracking` hook (the core)
- **`lib/driver/tracking-controller.ts` (new, pure, no DOM):** a `reduce(state, event) → state`
  state machine. States: `idle`, `starting`, `live`, `paused`, `os_location_off`,
  `permission_denied`, `stopped`. Events: `fix`, `geoError(code)`, `visibility(hidden|visible)`,
  `heartbeatTick`, `postResult(ok|fail)`, `start`, `stop`. Outputs the current `status`, whether
  the session stays alive, and the banner/message to show. Fully vitest-tested.
- **`useLiveTracking` hook (new):** the impure wiring — one long-lived
  `watchPosition({ enableHighAccuracy:true, maximumAge:2000, timeout:15000 })`; a ~6 s
  send-latest interval; `navigator.wakeLock.request('screen')` on start and re-acquire on
  `visibilitychange`→visible; a heartbeat timer feeding `heartbeatTick`; basic POST retry (2-3×
  with short backoff). Exposes `{ status, lastFixAt, lastSentAt, accuracy, banner, start, stop }`.
- **Permission & OS-location detection (in hook + controller):**
  - Pre-check `navigator.permissions.query({ name:'geolocation' })` where available; if `denied`,
    surface "enable location for this site" before starting.
  - Reclassify `POSITION_UNAVAILABLE`: repeated + **no fix has ever arrived** (or none for a
    sustained window) → `os_location_off` with an actionable "Turn on Location in your phone
    settings, then Retry" prompt (+ short Android/iOS hint). A genuine transient drop (had fixes,
    brief gap) → `paused, will resume`. `PERMISSION_DENIED` stays terminal, and now **also sends
    the off-duty DELETE** so the DB does not stay stuck "live".
- **`app/driver/location/page.tsx`:** refactor to consume the hook; becomes mostly presentation.

### Phase 2 — Honest status across all viewers (kills "active but frozen")
Single source of truth = age of the **actual last fix** via `lib/gps/freshness.ts`.
- **Driver page:** replace the sticky green `onDuty` banner with `LIVE` (fresh) / `PAUSED`
  (~25 s no fix → "keep screen on / unlock phone / check location") / `OFFLINE`. On-duty +
  heartbeat says stalled → loud red banner + optional `navigator.vibrate`.
- **Admin Track-All (`app/(admin)/track-all/page.tsx` + `.../track-all/drivers/route.ts`):** stop
  showing "Last Update: Just now" from the poll time — show the real `last_gps_update` age; drive
  the "Active Tracking" count and status badges from **freshness**, not `location_sharing_enabled`.
- **Student/boarding (`app/student/live-track`, `app/boarding/live-track`):** already
  freshness-based; tighten so a frozen bus flips to paused/offline promptly and honestly.

### Phase 3 — Installable PWA
- **Web app manifest:** name, icons, `display: standalone`, `start_url: /driver/location`, theme.
- **Minimal, tightly-scoped service worker** for installability only (app-shell cache) —
  explicitly **NOT** for background geolocation (impossible). Scope narrowly to avoid caching
  regressions across the larger admin app.
- **Install prompt:** Android `beforeinstallprompt` button; iOS "Add to Home Screen" instructions.
  On iOS 18.4+ this makes Wake Lock reliable and gives a less-backgroundable fullscreen surface.

### Cross-cutting
- Audit on/off-duty transitions via `lib/activity/log.ts` (already wired; keep it).
- HTTPS required for geolocation (production is HTTPS; `localhost` is exempt).
- Privacy unchanged: capture is opt-in and only while on-duty; off-duty stops writes.

## Testing
- **vitest:** the pure `trackingController` (permission / OS-off / heartbeat / visibility
  transitions) + updated `tracking.ts` clock logic (fast-client-clock case).
- **tsc --noEmit** on changed files (ESLint is broken project-wide).
- **Dev-server route probes** (auth-gated 307/401 = compiles clean, no 500).
- **Live phone test by the user** (the agent browser is unauthenticated), checklist:
  OS-location-off → prompt; screen-lock → "paused" alert; foreground resume → live; admin shows
  honest last-update age and active count.

## Constraints (documented, not hidden)
- **Foreground-only:** capture stops when the phone is locked, the app is switched, or the tab is
  backgrounded. This design maximizes foreground uptime (wake lock + visibility-resume) and makes
  the pause **loud**, but cannot defeat the platform suspend. Drivers must keep the app open with
  the screen on (a dashboard cradle + charger workflow).
- **HTTPS required** for `geolocation`.
- **No offline replay:** basic retry only; fixes captured during a network gap that never POST are
  not stored/replayed (the live map only needs the newest position).

## Out of scope (this spec)
- **Native/background tracking** (Capacitor + background-geolocation plugin) — the only reliable
  locked-screen path; deferred by the pure-web scope decision, gets its own spec if pursued.
- Supabase Realtime / SSE (stay on polling).
- Full offline buffer + replay (basic retry chosen instead).
- Route line / stop pins / ETA (needs the stop-geocoding sub-project).
- Mercyda/hardware GPS path and its hardcoded credentials (tracked separately).

## Build order
Phase 0 (clock fix — independent correctness) → Phase 1 (capture controller — the core) →
Phase 2 (status honesty) → Phase 3 (installable PWA). Each phase is independently testable.
