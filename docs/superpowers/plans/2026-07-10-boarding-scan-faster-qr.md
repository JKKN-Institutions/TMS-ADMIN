# Faster Boarding QR Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slow `html5-qrcode` scanner on `/boarding/scan` with `@yudiel/react-qr-scanner` so a student pass is recognised faster, with torch, continuous autofocus, a framing finder, and a decode beep.

**Architecture:** Swap only the camera/decode block of `app/boarding/scan/page.tsx`. The imperative `Html5Qrcode` start/stop lifecycle becomes a declaratively mounted `<Scanner>` component (mount = camera on, unmount = camera off). A new pure helper maps the library's typed error `kind` to a user message. Everything downstream — `submit()`, the POST to `/api/boarding/scan`, pass verification, attendance windows, the direction toggle, the 6-digit manual entry, and the result Card — is unchanged.

**Tech Stack:** Next.js 16, React 19.2, TypeScript 5, `@yudiel/react-qr-scanner@^2.6.0` (deps: `barcode-detector`, `webrtc-adapter`), Vitest.

## Global Constraints

- **React 19.2 / Next 16.2** — the added dependency must allow `react ^19` (`@yudiel/react-qr-scanner@2.6.0` does).
- **Blast radius:** only `app/boarding/scan/page.tsx` (modified) + `lib/boarding/scan-errors.ts` + `lib/boarding/scan-errors.test.ts` (new) + `package.json`/`package-lock.json`. Do **not** change `app/api/boarding/scan/route.ts`, `lib/boarding/pass.ts`, `lib/boarding/attendance-window.ts`, or any booking code.
- **The QR token string is unchanged** — `rawValue` from `<Scanner>` is the same string html5-qrcode produced; the server still verifies it via `verifyPass`. No pass re-pairing.
- **Commit hygiene:** parallel sessions commit to this branch mid-task. Before each commit run `git status`, stage **only** the files listed in that task (never `git add -A`), and never stage the unrelated pre-existing modified files (`components/pwa/pwa-provider.tsx`, `app/globals.css`, etc.).
- **Vitest imports are relative** — no `@/` alias in test files (it breaks vitest in this repo). App code (page.tsx) may use `@/`.
- **ESLint is broken** in this repo (`npm run lint` crashes) — verify with `npm run type-check` (tsc) filtered to changed files, not lint.
- **Camera cannot be tested headlessly** (boarding route needs auth; agent Chrome is unauthenticated). Automated gates are vitest + tsc + clean install; the final acceptance is a human device test (Task 5).

---

### Task 1: Add the `@yudiel/react-qr-scanner` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: the `@yudiel/react-qr-scanner` package with the `Scanner` component and `IDetectedBarcode` / `IScannerError` / `BarcodeFormat` types, available to Task 3.

- [ ] **Step 1: Install the package**

Run: `npm install @yudiel/react-qr-scanner@^2.6.0`
Expected: installs `@yudiel/react-qr-scanner`, `barcode-detector`, `webrtc-adapter`; exits 0 with no `ERESOLVE` error.

- [ ] **Step 2: Verify the install is clean and the lucide override survived**

Run: `npm ls @yudiel/react-qr-scanner`
Expected: prints `@yudiel/react-qr-scanner@2.6.x` (no `UNMET`/`invalid`).

Run: `node -e "const p=require('./package.json'); console.log('override:', p.overrides && p.overrides['lucide-react']); console.log('dep:', p.dependencies['@yudiel/react-qr-scanner'])"`
Expected: the load-bearing `lucide-react` override still prints a value, and the new dep prints `^2.6.0`.

- [ ] **Step 3: Confirm the project still type-checks (html5-qrcode still present — that's fine)**

Run: `npm run type-check 2>&1 | grep -E "boarding/scan|scan-errors|yudiel" || echo "no new type errors in touched areas"`
Expected: `no new type errors in touched areas`.

- [ ] **Step 4: Commit**

```bash
git status
git add package.json package-lock.json
git commit -m "chore(boarding): add @yudiel/react-qr-scanner for faster pass scan"
```

---

### Task 2: Pure camera-error message helper (TDD)

**Files:**
- Create: `lib/boarding/scan-errors.ts`
- Test: `lib/boarding/scan-errors.test.ts`

**Interfaces:**
- Produces: `cameraErrorMessage(kind: string | undefined): string` — maps a `@yudiel/react-qr-scanner` `IScannerError.kind` to a user-facing message that always ends by steering the user to manual entry. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/scan-errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cameraErrorMessage } from './scan-errors';

describe('cameraErrorMessage', () => {
  it('maps permission-denied to a permission message', () => {
    expect(cameraErrorMessage('permission-denied')).toMatch(/permission/i);
  });

  it('maps no-camera to a no-camera message', () => {
    expect(cameraErrorMessage('no-camera')).toMatch(/no camera/i);
  });

  it('maps in-use to an in-use message', () => {
    expect(cameraErrorMessage('in-use')).toMatch(/in use/i);
  });

  it('maps insecure-context to a secure/HTTPS message', () => {
    expect(cameraErrorMessage('insecure-context')).toMatch(/https|secure/i);
  });

  it('falls back to a generic message for an unknown kind', () => {
    expect(cameraErrorMessage('unknown')).toMatch(/could not start camera/i);
  });

  it('falls back to a generic message when kind is undefined', () => {
    expect(cameraErrorMessage(undefined)).toMatch(/could not start camera/i);
  });

  it('always steers the user to manual entry', () => {
    const kinds: Array<string | undefined> = [
      'permission-denied', 'no-camera', 'in-use', 'insecure-context',
      'unsupported', 'overconstrained', 'unknown', undefined,
    ];
    for (const kind of kinds) {
      expect(cameraErrorMessage(kind)).toMatch(/manual entry/i);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/boarding/scan-errors.test.ts`
Expected: FAIL — cannot resolve `./scan-errors` (module not found).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/boarding/scan-errors.ts`:

```ts
/**
 * Human-readable message for a camera/scanner failure surfaced by
 * @yudiel/react-qr-scanner's onError (its IScannerError.kind). Every message
 * steers the user to the manual 6-digit fallback so a broken camera never
 * blocks boarding.
 */
export function cameraErrorMessage(kind: string | undefined): string {
  switch (kind) {
    case 'permission-denied':
      return 'Camera permission denied — allow camera access or use manual entry below.';
    case 'no-camera':
      return 'No camera found — use manual entry below.';
    case 'in-use':
      return 'Camera is in use by another app — close it or use manual entry below.';
    case 'insecure-context':
      return 'Camera needs a secure (HTTPS) connection — use manual entry below.';
    case 'unsupported':
      return "This browser can't access the camera — use manual entry below.";
    case 'overconstrained':
      return "Camera couldn't match the requested settings — use manual entry below.";
    default:
      return 'Could not start camera — use manual entry below.';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/boarding/scan-errors.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git status
git add lib/boarding/scan-errors.ts lib/boarding/scan-errors.test.ts
git commit -m "feat(boarding): camera error-message helper for the QR scanner"
```

---

### Task 3: Swap the scan page to `<Scanner>`

**Files:**
- Modify: `app/boarding/scan/page.tsx`

**Interfaces:**
- Consumes: `cameraErrorMessage` (Task 2); `Scanner`, `IDetectedBarcode`, `IScannerError` (Task 1).
- Produces: nothing downstream — this is the top-level page.

- [ ] **Step 1: Re-read the file to confirm a parallel session hasn't changed it**

Run: `git status --short app/boarding/scan/page.tsx`
Expected: no output (file unmodified since last pull). Then open `app/boarding/scan/page.tsx` and confirm the regions below still match before editing.

- [ ] **Step 2: Replace the imports**

Change the top imports. Replace:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Clock } from 'lucide-react';
```

with:

```tsx
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { IDetectedBarcode, IScannerError } from '@yudiel/react-qr-scanner';
import { Clock } from 'lucide-react';
```

Then add the helper import right after the `Input` import. Replace:

```tsx
import { Input } from '@/components/ui/input';
import {
  isDirectionOpen,
```

with:

```tsx
import { Input } from '@/components/ui/input';
import { cameraErrorMessage } from '@/lib/boarding/scan-errors';
import {
  isDirectionOpen,
```

- [ ] **Step 3: Add the lazily-loaded Scanner above `type ScanResult`**

Replace:

```tsx
} from '@/lib/boarding/attendance-window';

type ScanResult = {
```

with:

```tsx
} from '@/lib/boarding/attendance-window';

// Loaded only in the browser: the scanner touches camera/WebRTC APIs, and lazy
// loading keeps its wasm fallback out of the initial route bundle.
const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then((m) => m.Scanner),
  { ssr: false }
);

type ScanResult = {
```

- [ ] **Step 4: Remove the `scannerRef`**

Replace:

```tsx
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
```

with:

```tsx
  const busyRef = useRef(false);
```

- [ ] **Step 5: Replace the `stopCamera` function + its `!canScan` effect**

Replace:

```tsx
  async function stopCamera() {
    const s = scannerRef.current;
    if (s) {
      try {
        await s.stop();
        await s.clear();
      } catch {
        /* ignore */
      }
      scannerRef.current = null;
      setScanning(false);
    }
  }

  // Stop the camera if scanning becomes disallowed (window just closed).
  useEffect(() => {
    if (!canScan && scannerRef.current) void stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScan]);
```

with:

```tsx
  // Stop scanning if the window just closed (unmounting <Scanner> releases the camera).
  useEffect(() => {
    if (!canScan) setScanning(false);
  }, [canScan]);
```

- [ ] **Step 6: Remove `startCamera` and the unmount cleanup effect**

Replace:

```tsx
  async function startCamera() {
    if (scannerRef.current) return;
    if (!document.getElementById('reader')) return;
    const scanner = new Html5Qrcode('reader');
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decoded) => submit(decoded),
        () => {}
      );
      setScanning(true);
    } catch {
      setResult({ ok: false, error: 'Could not start camera — use manual entry below.' });
      scannerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const winLabel = (d: AttDirection) => {
```

with:

```tsx
  const winLabel = (d: AttDirection) => {
```

- [ ] **Step 7: Replace the camera Card JSX**

Replace:

```tsx
      <Card>
        <CardContent className="p-3">
          <div id="reader" className="w-full overflow-hidden rounded-md" />
          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <Button className="flex-1" onClick={startCamera} disabled={!canScan}>
                {canScan ? 'Start camera' : 'Scanning closed'}
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={stopCamera}>
                Stop
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
```

with:

```tsx
      <Card>
        <CardContent className="p-3">
          {scanning && canScan ? (
            <div className="w-full overflow-hidden rounded-md">
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
                onScan={(codes: IDetectedBarcode[]) => {
                  const v = codes[0]?.rawValue;
                  if (v) void submit(v);
                }}
                onError={(e: IScannerError) =>
                  setResult({ ok: false, error: cameraErrorMessage(e?.kind) })
                }
              />
            </div>
          ) : null}
          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <Button className="flex-1" onClick={() => setScanning(true)} disabled={!canScan}>
                {canScan ? 'Start camera' : 'Scanning closed'}
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={() => setScanning(false)}>
                Stop
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 8: Type-check the changed file**

Run: `npm run type-check 2>&1 | grep -E "app/boarding/scan/page" || echo "page.tsx type-clean"`
Expected: `page.tsx type-clean`.

If instead you see an error on `formats={['qr_code']}` (TS won't widen the literal to `BarcodeFormat[]`), add `import { type BarcodeFormat } from '@yudiel/react-qr-scanner';` to Step 2's type import and change the prop to `formats={['qr_code'] as BarcodeFormat[]}`, then re-run.

- [ ] **Step 9: Confirm the route compiles in the dev server**

Run (in a second shell): `npm run dev`
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/boarding/scan`
Expected: a `307`/`308`/`401` auth redirect (NOT `500`) — a redirect proves the route compiled without a build/runtime error. Stop the dev server afterward.

- [ ] **Step 10: Commit**

```bash
git status
git add app/boarding/scan/page.tsx
git commit -m "feat(boarding): scan passes with @yudiel/react-qr-scanner (torch, autofocus, finder, beep)"
```

---

### Task 4: Remove the now-unused `html5-qrcode` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:** none.

- [ ] **Step 1: Confirm nothing imports html5-qrcode anymore**

Run: `grep -rn "html5-qrcode" app lib components`
Expected: no output (the only importer was the page, now migrated).

- [ ] **Step 2: Uninstall it**

Run: `npm uninstall html5-qrcode`
Expected: exits 0; `package.json` no longer lists `html5-qrcode`.

- [ ] **Step 3: Verify type-check and a production build still pass**

Run: `npm run type-check 2>&1 | grep -E "boarding/scan|scan-errors" || echo "touched files type-clean"`
Expected: `touched files type-clean`.

Run: `npm run build`
Expected: build completes and compiles the `/boarding/scan` route. (If the build fails only on files unrelated to this change — e.g. a parallel session's in-flight edit — note it and confirm the failure does not reference `boarding/scan`, `scan-errors`, or `@yudiel`.)

- [ ] **Step 4: Commit**

```bash
git status
git add package.json package-lock.json
git commit -m "chore(boarding): remove unused html5-qrcode dependency"
```

---

### Task 5: Human device acceptance test (no code)

**Files:** none — this is the acceptance gate that automated checks cannot cover.

- [ ] **Step 1: Open the scanner on a real phone during an open attendance window**

On an Android phone (Chrome) and, if available, an iPhone (Safari), sign in as boarding staff and open `/boarding/scan`. Tap **Start camera**; grant the permission prompt.

- [ ] **Step 2: Verify fast recognition + feedback**

Point at a real student boarding pass. Confirm: the camera opens quickly, the **finder** overlay shows, the QR **locks/decodes noticeably faster** than before, a **beep** sounds on decode, and the green **"Marked present"** card appears.

- [ ] **Step 3: Verify the extras**

Toggle the **torch** button in dim light and confirm it helps. Then tap **Stop** and confirm the camera light goes off (stream released). Finally, test the **manual 6-digit** fallback still marks a learner present.

- [ ] **Step 4: Verify error handling**

Deny the camera permission (or open on a non-HTTPS origin) and confirm a specific message appears steering you to manual entry (not a blank/broken camera).
