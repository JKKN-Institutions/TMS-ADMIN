# Track-All Google Maps Embed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-bus "Google Maps" button to the admin Track-All page that opens a modal with a free, keyless Google Maps directions iframe (bus → campus), leaving the Leaflet map unchanged.

**Architecture:** A pure URL helper builds the keyless embed + official deep-link. A Radix Dialog modal renders the iframe (snapshot at open-time + manual Refresh + "Open in Google Maps" link). The Track-All page gains a per-row button and the modal's open state; the bus coordinates come from the page's existing `driverLocations` state (no backend).

**Tech Stack:** Next.js 15 App Router, TypeScript, React, `@radix-ui/react-dialog` (via `components/ui/dialog.tsx`), lucide-react, vitest.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-07-13-track-all-google-embed-design.md` (authority).
- **No new npm dependencies** (`@radix-ui/react-dialog`, `lucide-react` already installed).
- **Additive only:** do NOT modify `components/live-tracking-map.tsx`, `components/live-position-map.tsx`, or any Leaflet behavior. Scope = Track-All page + 3 new/edited files.
- **No key / no billing / no CSP change:** the keyless embed needs none. The app has no active `frame-src` CSP (verified). Do not add env vars or headers.
- **Campus constant:** `CAMPUS` from `lib/gps/campus.ts` = `{ lat: 11.4444567, lng: 77.730258 }`.
- **Vitest:** tests live at `lib/**/*.test.ts`, node env, `@/` alias does NOT resolve — use **relative imports** in `lib/**` and their tests.
- **SHARED branch** (`feat/driver-mobile-supply`): a parallel session commits here. Implementers COMMIT per task with explicit `git add <exact paths>` — NEVER `-A`. NEVER `git commit --amend`/`rebase`/`reset`/`push`. Review each task in isolation as `<commit>^..<commit>`.
- **tsc gate:** `npx tsc --noEmit 2>&1 | grep <file>` must show ZERO lines for touched files (project has ~559 pre-existing unrelated errors; touched files add none).
- **Commit trailer:** end each commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- `lib/geo/google-embed.ts` (**new**) — pure URL builders `googleDirectionsEmbedUrl`, `googleDirectionsLinkUrl` + type `LL`.
- `lib/geo/google-embed.test.ts` (**new**) — unit tests.
- `components/track-all/google-map-panel.tsx` (**new**) — the Dialog modal + `GoogleMapBus` type.
- `app/(admin)/track-all/page.tsx` (**modify**) — per-row button + modal state + live-bus lookup.

---

## Task 1: URL helpers (`lib/geo/google-embed.ts`)

**Files:**
- Create: `lib/geo/google-embed.ts`
- Test: `lib/geo/google-embed.test.ts`

**Interfaces:**
- Produces:
  - `interface LL { lat: number; lng: number }`
  - `googleDirectionsEmbedUrl(from: LL, to: LL): string`
  - `googleDirectionsLinkUrl(from: LL, to: LL): string`

- [ ] **Step 1: Write the failing test**

Create `lib/geo/google-embed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { googleDirectionsEmbedUrl, googleDirectionsLinkUrl } from './google-embed';

const bus = { lat: 11.5, lng: 77.8 };
const campus = { lat: 11.4444567, lng: 77.730258 };

describe('googleDirectionsEmbedUrl', () => {
  it('builds a keyless directions embed (saddr -> daddr, output=embed)', () => {
    expect(googleDirectionsEmbedUrl(bus, campus)).toBe(
      'https://maps.google.com/maps?saddr=11.5,77.8&daddr=11.4444567,77.730258&output=embed',
    );
  });
  it('contains no API key', () => {
    expect(googleDirectionsEmbedUrl(bus, campus)).not.toMatch(/key=/);
  });
});

describe('googleDirectionsLinkUrl', () => {
  it('builds the official directions deep-link (api=1, origin/destination)', () => {
    expect(googleDirectionsLinkUrl(bus, campus)).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=11.5,77.8&destination=11.4444567,77.730258',
    );
  });
  it('contains no API key', () => {
    expect(googleDirectionsLinkUrl(bus, campus)).not.toMatch(/key=/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/geo/google-embed.test.ts`
Expected: FAIL — `Failed to resolve import "./google-embed"`.

- [ ] **Step 3: Write the implementation**

Create `lib/geo/google-embed.ts`:

```ts
/**
 * Keyless Google Maps URL builders for the admin Track-All per-bus view.
 *
 * The embed form (`maps.google.com/maps?...&output=embed`) renders Google's
 * directions route in an <iframe> with NO API key — free, no billing. It is an
 * unofficial form, so it is isolated here: switching to the official Maps Embed
 * API (`google.com/maps/embed/v1/directions?key=...`, needs a free key) later is
 * a one-function change, and `googleDirectionsLinkUrl` is a fully official
 * fallback that always works.
 */

export interface LL {
  lat: number;
  lng: number;
}

/** Keyless directions iframe URL (from → to), for embedding in a modal. */
export function googleDirectionsEmbedUrl(from: LL, to: LL): string {
  return `https://maps.google.com/maps?saddr=${from.lat},${from.lng}&daddr=${to.lat},${to.lng}&output=embed`;
}

/** Official keyless Google Maps deep-link (from → to), for an "Open in Google Maps" new-tab link. */
export function googleDirectionsLinkUrl(from: LL, to: LL): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/geo/google-embed.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "lib/geo/google-embed" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 6: Commit**

```bash
git add lib/geo/google-embed.ts lib/geo/google-embed.test.ts
git commit -m "$(printf 'feat(track-all): keyless Google Maps directions URL helpers\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: Modal component (`components/track-all/google-map-panel.tsx`)

**Files:**
- Create: `components/track-all/google-map-panel.tsx`

**Interfaces:**
- Consumes: `googleDirectionsEmbedUrl`, `googleDirectionsLinkUrl` (Task 1); `CAMPUS` (`@/lib/gps/campus`); `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` (`@/components/ui/dialog`).
- Produces:
  - `interface GoogleMapBus { id: string; name: string; routeLabel: string | null; lat: number; lng: number }`
  - `export default function GoogleMapPanel({ bus, onClose }: { bus: GoogleMapBus | null; onClose: () => void })`

- [ ] **Step 1: Create the component**

Create `components/track-all/google-map-panel.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { CAMPUS } from '@/lib/gps/campus';
import { googleDirectionsEmbedUrl, googleDirectionsLinkUrl } from '@/lib/geo/google-embed';

export interface GoogleMapBus {
  id: string;
  name: string;
  routeLabel: string | null;
  lat: number;
  lng: number;
}

/**
 * Per-bus Google Maps directions modal for the admin Track-All page. Shows a free,
 * keyless Google directions iframe (bus → campus). The position is a SNAPSHOT taken
 * when the modal opens (so the parent's 5s poll doesn't reload/flicker the iframe);
 * Refresh copies the bus's latest position into the snapshot. The Leaflet map behind
 * the modal remains the live all-buses view.
 */
export default function GoogleMapPanel({
  bus,
  onClose,
}: {
  bus: GoogleMapBus | null;
  onClose: () => void;
}) {
  const [snapshot, setSnapshot] = useState<{ lat: number; lng: number } | null>(null);
  const [nonce, setNonce] = useState(0);

  // Capture the position only when a DIFFERENT bus opens — not on every live poll.
  useEffect(() => {
    if (bus) {
      setSnapshot({ lat: bus.lat, lng: bus.lng });
      setNonce(0);
    } else {
      setSnapshot(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.id]);

  const campus = { lat: CAMPUS.lat, lng: CAMPUS.lng };

  return (
    <Dialog
      open={!!bus}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{bus?.name ?? 'Bus location'}</DialogTitle>
          <DialogDescription>
            {bus?.routeLabel ? `${bus.routeLabel} · ` : ''}Route to campus — snapshot; the live
            map above updates automatically.
          </DialogDescription>
        </DialogHeader>

        {snapshot && (
          <iframe
            key={`${snapshot.lat},${snapshot.lng},${nonce}`}
            title="Google Maps route to campus"
            src={googleDirectionsEmbedUrl(snapshot, campus)}
            style={{ width: '100%', height: 450, border: 0, borderRadius: 8 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}

        <DialogFooter className="sm:justify-between">
          <button
            type="button"
            onClick={() => {
              if (bus) {
                setSnapshot({ lat: bus.lat, lng: bus.lng });
                setNonce((n) => n + 1);
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <a
            href={snapshot ? googleDirectionsLinkUrl(snapshot, campus) : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4" /> Open in Google Maps
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "google-map-panel" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 3: Manual sanity (optional, dev server if already running)**

There is no unit test for this presentational component; it is verified by tsc + the Task 3 wiring + your manual check. Do NOT stand up a dev server for this task.

- [ ] **Step 4: Commit**

```bash
git add components/track-all/google-map-panel.tsx
git commit -m "$(printf 'feat(track-all): per-bus Google Maps directions modal (keyless embed)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Wire into the Track-All page (`app/(admin)/track-all/page.tsx`)

**Files:**
- Modify: `app/(admin)/track-all/page.tsx`

**Interfaces:**
- Consumes: `GoogleMapPanel` (default export) + `GoogleMapBus` type (Task 2).

- [ ] **Step 1: Import the modal**

At the top of `app/(admin)/track-all/page.tsx`, after the existing `import toast from 'react-hot-toast';` line, add:

```tsx
import GoogleMapPanel, { type GoogleMapBus } from '@/components/track-all/google-map-panel';
```

- [ ] **Step 2: Add the selected-bus state**

Find the existing state block ending with:

```tsx
  const [freshestUpdate, setFreshestUpdate] = useState<string | null>(null);
```

Add immediately after it:

```tsx
  const [googleBusId, setGoogleBusId] = useState<string | null>(null);
```

- [ ] **Step 3: Compute the live bus for the modal**

Find:

```tsx
  const filteredDrivers = filterEnabled 
    ? driverLocations.filter(driver => driver.location_sharing_enabled)
    : driverLocations;
```

Add immediately after it:

```tsx
  // Look the selected bus up in the LIVE list each render, so the modal's Refresh
  // always reads the latest position (the modal itself only snapshots on open).
  const googleDriver = googleBusId
    ? filteredDrivers.find((d) => d.id === googleBusId) ?? null
    : null;
  const googleBus: GoogleMapBus | null =
    googleDriver && googleDriver.current_latitude != null && googleDriver.current_longitude != null
      ? {
          id: googleDriver.id,
          name: googleDriver.name,
          routeLabel: googleDriver.route_name
            ? `Route ${googleDriver.route_number ?? ''} · ${googleDriver.route_name}`.trim()
            : null,
          lat: googleDriver.current_latitude,
          lng: googleDriver.current_longitude,
        }
      : null;
```

- [ ] **Step 4: Add the per-row "Google Maps" button in the Location cell**

Find this block inside the Location `<td>` (the has-coordinates branch):

```tsx
                        {driver.status_message && (
                          <div className="text-xs text-blue-600 mt-1">
                            {driver.status_message}
                          </div>
                        )}
                      </div>
```

Replace it with (adds the button just before the closing `</div>`):

```tsx
                        {driver.status_message && (
                          <div className="text-xs text-blue-600 mt-1">
                            {driver.status_message}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setGoogleBusId(driver.id)}
                          className="mt-1 inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          <MapPin className="h-3 w-3" /> Google Maps
                        </button>
                      </div>
```

(`MapPin` is already imported at the top of this file.)

- [ ] **Step 5: Render the modal**

Find the end of the component's returned JSX — the final two closing lines:

```tsx
      </div>
    </div>
  );
}
```

Replace with (adds the panel before the outermost `</div>`):

```tsx
      </div>

      <GoogleMapPanel bus={googleBus} onClose={() => setGoogleBusId(null)} />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "track-all/page" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 7: Manual verification (user, authenticated browser)**

Open `/track-all`. For a bus with a GPS fix, a "Google Maps" button appears under its coordinates in the Location column. Click it → a modal opens with Google's road route from that bus to campus; **Refresh** re-centers on the bus's latest position; **Open in Google Maps** opens a new tab; the X / clicking outside closes it. The Leaflet map above is unchanged. (Agent Chrome is unauthenticated — user does this.)

- [ ] **Step 8: Commit**

```bash
git add "app/(admin)/track-all/page.tsx"
git commit -m "$(printf 'feat(track-all): per-row Google Maps button + modal wiring\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Final verification

- [ ] **Unit suite:** `npx vitest run lib/geo/google-embed.test.ts` → 4/4 green.
- [ ] **Typecheck touched files:** `npx tsc --noEmit 2>&1 | grep -E "google-embed|google-map-panel|track-all/page" ; echo "clean if no lines"` → no lines.
- [ ] **User smoke test** (authenticated browser): per-row button → modal → Google route bus→campus, Refresh, Open-in-Google-Maps, close; Leaflet map unaffected.

## Notes / risks (from the spec)

- Keyless `output=embed` is unofficial; if Google drops it, switch `googleDirectionsEmbedUrl` to the official Maps Embed API (free key). The "Open in Google Maps" link is fully official.
- Iframe is a snapshot + manual Refresh by design (no flicker); the Leaflet map remains the live all-buses view.
