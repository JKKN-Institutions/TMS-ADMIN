# Boarding scan — faster QR decode (replace html5-qrcode)

**Date:** 2026-07-10
**Branch:** feat/weekly-booking-window
**Status:** Design approved — pending implementation plan

## Problem

Boarding staff report that the boarding-pass scanner (`/boarding/scan`) is slow to
**recognise** a student's QR pass — i.e. the camera takes too long to lock onto and
decode the code once the scanner is open. (The clarified complaint is decode speed,
not the server round-trip that follows; and not queue throughput.)

## Root-cause findings (verified against the installed library)

The scan UI (`app/boarding/scan/page.tsx`) uses `html5-qrcode@2.3.8` with a minimal
config: `new Html5Qrcode('reader')` + `start({ fps: 10, qrbox: 250 })`.

Verified in `node_modules/html5-qrcode`:

- **Native `BarcodeDetector` is already ON by default** in 2.3.8
  (`getUseBarCodeDetectorIfSupported(undefined) === true`, `cjs/html5-qrcode.js:420-422`).
  So on Android Chrome the app is *already* on the fastest available decoder — the
  original hypothesis that this flag was "off" was wrong.
- **Mirror-flip double-decode**: `disableFlip` defaults to `false`
  (`cjs/core.js:62`); every non-matching frame is decoded twice — normal then
  horizontally mirrored — before the next frame (`cjs/html5-qrcode.js:581-592`).
  Boarding passes are never mirrored, so ~half the decode work is wasted.
- **Fixed `qrbox: 250`**: only that cropped region is decoded, forcing precise
  alignment.
- **No focus/resolution constraints**: autofocus can hunt on a close-held pass.
- On **iOS Safari**, `BarcodeDetector` is unsupported, so html5-qrcode falls back to
  a slower main-thread WASM decoder.

## Decision

Replace `html5-qrcode` with **`@yudiel/react-qr-scanner@2.6.0`**.

Why this library:
- Peer deps `react ^17 || ^18 || ^19` → compatible with this app's React 19.2 / Next 16.
- Depends on `barcode-detector@^3.1.3`, which uses the **native BarcodeDetector on
  Android** (keeps the fast path) and a **zxing-wasm fallback on iOS/others**.
- React-first `<Scanner>` component → replaces the imperative
  `start()/stop()/clear()` lifecycle with mount/unmount, removing the
  camera-teardown/Strict-Mode leak class of bug.
- Built-in `torch`, `finder`, format restriction, typed errors, and beep feedback.

### Honest expected impact
On **Android** the app is already at the native-decoder ceiling; the concrete gains
are: no wasted mirror-flip pass, continuous autofocus, a torch for dim
morning/evening scans, a framing finder, and a scan beep. On **iOS** the modern
zxing-wasm fallback plus a leaner loop should be on-par-or-better. This is a
"noticeably snappier + better UX" change, not a 10× decode change.

## Scope

- **One file changed:** `app/boarding/scan/page.tsx` — only the camera/decode block.
- **One dependency added:** `@yudiel/react-qr-scanner` (pulls `barcode-detector`,
  `webrtc-adapter`).
- **One dependency removed:** `html5-qrcode` (imported nowhere else — grep-confirmed).
- **No changes** to: the server route `app/api/boarding/scan/route.ts`, pass
  signing/verification (`lib/boarding/pass.ts`), attendance windows, the direction
  toggle, the 6-digit manual entry, `submit()`, or the result Card.

## Detailed design

### Remove
- `import { Html5Qrcode } from 'html5-qrcode'`
- `scannerRef`, `startCamera()`, `stopCamera()` internals, and `<div id="reader">`

### Add
Lazily-loaded scanner (matches repo convention of dynamic-importing heavy client
libs; `ssr:false` avoids browser-API-at-import SSR crashes):

```tsx
const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then((m) => m.Scanner),
  { ssr: false }
);
```

Rendered only while scanning is active and the window is open:

```tsx
{scanning && canScan && (
  <Scanner
    formats={['qr_code']}
    scanDelay={250}
    allowMultiple={false}
    sound={true}
    constraints={{
      facingMode: 'environment',
      advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
    }}
    components={{ torch: true, finder: true }}
    onScan={(codes) => { const v = codes[0]?.rawValue; if (v) submit(v); }}
    onError={(e) => setResult({ ok: false, error: cameraErrorMessage(e) })}
  />
)}
```

Window-gating is handled by the conditional mount (`scanning && canScan`): when the
window closes, `<Scanner>` unmounts and the camera stream is fully released — no
separate `paused` prop needed. Repeat-decodes of the same code are suppressed by
`allowMultiple={false}` + `scanDelay`, layered on top of the existing `busyRef`
dedup in `submit()`.

`cameraErrorMessage(e)` maps `e.kind`
(`permission-denied` | `no-camera` | `in-use` | `insecure-context` | `unsupported` |
…) to a specific message, always steering the user to the manual 6-digit fallback.

### Start/Stop lifecycle
Keep the existing `scanning` state and Start/Stop buttons. **Start** sets
`scanning=true` (mounts `<Scanner>` → camera on); **Stop** sets `scanning=false`
(unmounts → camera released). The existing effect that halts on window-close sets
`scanning=false`. React owns teardown.

### Data flow (unchanged downstream)
`onScan → submit(rawValue)`. `submit()` is untouched: client window guard →
`busyRef` 1500 ms dedup → POST `/api/boarding/scan` `{ token, direction, walkUp }` →
result render. `rawValue` is the identical QR token string the server already
verifies via `verifyPass`. No re-pairing of passes, no server change.

## Risks & mitigations

- **Dependency install (ERESOLVE history in this repo)** — run
  `npm install @yudiel/react-qr-scanner` and confirm no peer conflict / no change to
  the load-bearing `lucide-react` override *before* editing code.
- **SSR safety** — `next/dynamic` with `ssr:false`.
- **`focusMode` not in standard `MediaTrackConstraints` DOM type** — cast the
  advanced entry (`as MediaTrackConstraintSet`); unsupported advanced constraints are
  ignored per spec, so it degrades gracefully.
- **Beep before server confirmation** — the beep fires on *decode*, not on
  "marked present". Acceptable audible feedback; the on-screen card remains the
  source of truth.

## Verification

- Automated: clean `npm install`; `tsc` (filtered to the changed file) passes;
  `npm run lint` is known-broken in this repo, so skip it.
- Manual (camera can't be driven headlessly; boarding route needs auth): on a real
  phone during an open attendance window, open `/boarding/scan`, confirm the camera
  opens, the finder shows, a real pass locks/decodes quickly, the beep fires, and
  "Marked present" appears. Test the torch in dim light and the manual 6-digit
  fallback.

## Out of scope

- Server-side scan latency (parallelising round-trips, deferring `logActivity`) —
  a separate, already-analysed opportunity; not requested now.
- The 1500 ms between-scan lockout / queue throughput.
- Any change to pass generation, attendance windows, or booking gates.

## Commit hygiene

Parallel sessions commit to `main` mid-task. Verify HEAD, commit only the specific
files touched (never `git add -A`, never stash the unrelated modified
`components/pwa/pwa-provider.tsx`).
