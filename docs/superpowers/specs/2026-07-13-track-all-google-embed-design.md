# Track-All — per-bus Google Maps embed (free, keyless)

- **Date:** 2026-07-13
- **Status:** Approved design (pre-implementation)
- **Scope:** Admin **Track-All** page only (`app/(admin)/track-all/page.tsx`). Purely ADDITIVE — the existing Leaflet map is unchanged.
- **Builds on:** the Track-All exact-geolocation feature (Leaflet map + directions; branch `feat/track-all-geolocation`).

## 1. Problem

The admin wants a genuine **Google Maps** view of a bus's route on the Track-All page, "like Google Maps." The full dynamic Google map needs a billing-enabled key (rejected — stay free). The free Google **Embed iframe** can only show ONE place/route at a time, so it cannot be the multi-bus map. Resolution: keep the Leaflet map as the live all-buses overview, and add an on-demand **per-bus** Google Maps *directions* view (bus → campus) using the **keyless** embed — free, no key, no billing.

## 2. Goals

1. From the Track-All page, open a real Google Maps **directions** view (selected bus → JKKN campus) on demand.
2. **Free**: no API key, no billing, no new dependency, no backend.
3. **Non-destructive**: the Leaflet map and its behavior are untouched; this is a supplement.

### Non-goals / out of scope

- Google Maps JavaScript SDK / any billing key.
- Multi-bus Google map (impossible with the free iframe).
- Auto-moving/live Google marker (the Leaflet map is the live view; the iframe is a snapshot + manual refresh).
- A trigger button inside the Leaflet map's selected-bus banner (`live-tracking-map.tsx`) — deferred to avoid touching that component; the table-row button is the trigger.
- Other portals; changes to the position pipeline.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Google integration | Free **keyless Embed iframe**, directions mode |
| Surface | Admin Track-All only |
| Relationship to Leaflet | Keep Leaflet; ADD per-bus Google view (not replace) |
| Trigger | A "Google Maps" button per bus row in the Driver Details table (rows with a GPS fix only) |
| View container | Modal (`components/ui/dialog.tsx`) |
| Freshness | Snapshot at open-time + manual **Refresh**; no auto-reload (no flicker) |

## 4. Technical findings (verified)

- **No active CSP.** `next.config.js` `headers()` sets only `X-Frame-Options: DENY` (inbound-only — stops others framing us, does NOT stop us embedding Google), `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy: strict-origin-when-cross-origin`. The CSP in `lib/security-enhancements.ts` is **imported nowhere** (dead config). ⇒ the Google iframe embeds with **no config change**.
- **Keyless embed works without a key:** `https://maps.google.com/maps?saddr=<lat,lng>&daddr=<lat,lng>&output=embed` renders Google's directions route in an iframe with no API key. (Unofficial but long-standing; see risk below.)
- **Bus coordinates are already on the page** — `driverLocations` state in `track-all/page.tsx` carries `current_latitude`/`current_longitude` per bus. No new fetch.
- **Campus** = `CAMPUS` from `lib/gps/campus.ts` (11.4444567, 77.730258).
- `components/ui/dialog.tsx` (Radix Dialog) is the house modal primitive.

## 5. Design

### 5.1 URL helper — `lib/geo/google-embed.ts` (new, pure, unit-tested)

```ts
export interface LL { lat: number; lng: number }
// Keyless directions iframe (bus -> campus). Renders Google's road route, no key.
export function googleDirectionsEmbedUrl(from: LL, to: LL): string;
// Official keyless deep-link for "Open in Google Maps" (new tab).
export function googleDirectionsLinkUrl(from: LL, to: LL): string;
```
- Embed: `https://maps.google.com/maps?saddr=${from.lat},${from.lng}&daddr=${to.lat},${to.lng}&output=embed`
- Link: `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}` (official Maps URL scheme, no key).
- Coordinates are numbers formatted directly (no user free-text → no injection surface). This single file isolates the URL format so switching to the official Maps Embed API (needs a free key) later is a one-function change.

### 5.2 Modal — `components/track-all/google-map-panel.tsx` (new)

- Props: `bus: { id: string; name: string; routeLabel: string | null; lat: number; lng: number } | null`, `onClose: () => void`. Open when `bus` is non-null.
- On open, **capture a snapshot** of `{lat,lng}` into local state (so the live 5 s poll re-rendering the parent does NOT reload the iframe).
- Renders (inside `Dialog`): header (bus name + route), an `<iframe>` `src={googleDirectionsEmbedUrl(snapshot, CAMPUS)}` (100% width, ~450px tall, `loading="lazy"`, `title="Google Maps route to campus"`, `border:0`), a **Refresh** button (copies the bus's current live coords → snapshot, reloading the iframe), and an **"Open in Google Maps ↗"** anchor (`googleDirectionsLinkUrl`, `target="_blank" rel="noopener noreferrer"`).
- A one-line note: "Snapshot — the live map above updates automatically."

### 5.3 Page wiring — `app/(admin)/track-all/page.tsx` (edit)

- New state `googleBusId: string | null`.
- Each render: `const googleBus = filteredDrivers.find(d => d.id === googleBusId && d.current_latitude != null && d.current_longitude != null)` → mapped to the modal's `bus` prop (id, name, `Route <n> · <name>` label, lat, lng). Looking it up from the live list each render means **Refresh** always gets the latest position.
- In the Driver Details table's **Location cell**, beneath the lat/lng, for rows with a GPS fix (`current_latitude && current_longitude`), add a compact **"Google Maps"** button → `setGoogleBusId(driver.id)`. (Rows without a fix keep the existing "no location" message, no button.)
- Render `<GoogleMapPanel bus={googleBus} onClose={() => setGoogleBusId(null)} />` once at page level.

### Data flow

```
driverLocations (existing 5s poll) ──> Driver Details table
                                          │ click "Google Maps" on a row
                                          ▼
   setGoogleBusId(id) ──> googleBus = live lookup by id ──> <GoogleMapPanel>
                                          │ snapshot {lat,lng} on open
                                          ▼
   <iframe src=googleDirectionsEmbedUrl(snapshot, CAMPUS)>  + Refresh (live→snapshot) + Open-in-GMaps link
```

## 6. Risks & mitigations

- **Keyless embed is unofficial.** `maps.google.com/maps?...&output=embed` is not a documented API; Google could change it. Mitigation: the URL lives only in `lib/geo/google-embed.ts`; if it breaks, swap to the official Maps Embed API (`https://www.google.com/maps/embed/v1/directions?key=...`) — a one-function change once a (free) key exists. The **"Open in Google Maps" link** is fully official and always works as a fallback.
- **Referrer-Policy** `strict-origin-when-cross-origin` sends only our origin to Google — fine for the embed.
- **No live movement in the iframe** — by design; the Leaflet map above is the live view. Documented in the modal note.

## 7. Testing

- **vitest** (`lib/geo/google-embed.test.ts`, relative import — `@/` breaks vitest): assert `googleDirectionsEmbedUrl`/`googleDirectionsLinkUrl` produce the exact expected strings for known coords (bus + campus), including the `output=embed` / `api=1` markers and `lat,lng` ordering.
- **tsc**: `npx tsc --noEmit` clean for the touched files.
- **Manual (user, authenticated browser):** open `/track-all`, click a bus's "Google Maps" button → the modal shows Google's road route bus→campus; Refresh updates the position; "Open in Google Maps" opens a new tab; close works. (Agent Chrome is unauthenticated — user does this.)

## 8. Files touched

- **New:** `lib/geo/google-embed.ts`, `lib/geo/google-embed.test.ts`, `components/track-all/google-map-panel.tsx`.
- **Edit:** `app/(admin)/track-all/page.tsx` (button + modal state).
- **Unchanged:** `components/live-tracking-map.tsx` and everything from the Leaflet feature.

## 9. Open questions

None — provider (free keyless embed), surface (Track-All only), relationship (keep Leaflet, add per-bus), trigger (table-row button), and freshness (snapshot + refresh) are all resolved.
