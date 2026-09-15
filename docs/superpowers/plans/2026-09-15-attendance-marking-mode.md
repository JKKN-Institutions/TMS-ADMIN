# Attendance Marking Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings choice — Scan only / Manual only / Scan + manual — that the server enforces and the boarding Attendance page follows live.

**Architecture:** The mode is one `admin_settings` row (`setting_type='attendance'`). A pure module decides what each caller may use (transport head / super admin always both). The two write endpoints refuse a disallowed method with a named reason the offline outbox understands; the boarding settings GET tells the page what to show, and the existing Settings save broadcast refreshes open screens.

**Tech Stack:** Next.js 16 route handlers, React + TanStack Query/Table, Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-attendance-marking-mode-design.md`

## Global Constraints

- Branch `feat/attendance-auto-absent`, worktree `.worktrees/attendance-auto-absent`; ships together with auto-absent.
- Modes exactly `'scan_only' | 'manual_only' | 'both'`; default and unreadable/missing = `'both'`.
- Exempt = `auth.isSuperAdmin || tms.attendance.override`; exempt callers may always scan AND mark manually.
- Undo (`DELETE /api/boarding/attendance`) is never gated by the mode.
- New reject reasons: `manual_off`, `scan_off`.
- No DB migration.
- Verify with vitest + tsc filtered to touched files + `set -a; . ../../.env; set +a; node node_modules/next/dist/bin/next build`.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Marking-mode domain module

**Files:**
- Create: `lib/boarding/marking-mode.ts`
- Test: `lib/boarding/marking-mode.test.ts`

**Interfaces — Produces:** `MarkingMode`, `MARKING_MODES`, `DEFAULT_MARKING_MODE`, `MARKING_MODE_LABEL`, `MARKING_MODE_HINT`, `ATTENDANCE_SETTING_TYPE`, `isMarkingMode(v)`, `parseMarkingMode(raw)`, `allowedMethods(mode, exempt): { manual; scan }`, `AllowedMarking = { mode; manual; scan }`, `ALL_METHODS_ALLOWED`, `readMarkingMode(svc): Promise<MarkingMode|null>`, `loadMarkingMode(svc): Promise<MarkingMode>`.

- [ ] **Step 1: Failing test**

```ts
// lib/boarding/marking-mode.test.ts
import { describe, it, expect } from 'vitest';
import { allowedMethods, parseMarkingMode, isMarkingMode, MARKING_MODES } from './marking-mode';

describe('parseMarkingMode', () => {
  it('reads a stored mode', () => {
    expect(parseMarkingMode({ markingMode: 'scan_only' })).toBe('scan_only');
    expect(parseMarkingMode({ markingMode: 'manual_only' })).toBe('manual_only');
  });
  it('falls back to both for missing or unknown values', () => {
    expect(parseMarkingMode(null)).toBe('both');
    expect(parseMarkingMode({})).toBe('both');
    expect(parseMarkingMode({ markingMode: 'SCAN' })).toBe('both');
  });
  it('knows exactly the three modes', () => {
    expect([...MARKING_MODES].sort()).toEqual(['both', 'manual_only', 'scan_only']);
    expect(isMarkingMode('both')).toBe(true);
    expect(isMarkingMode('auto')).toBe(false);
  });
});

describe('allowedMethods', () => {
  it('limits ordinary staff to the chosen method', () => {
    expect(allowedMethods('scan_only', false)).toEqual({ manual: false, scan: true });
    expect(allowedMethods('manual_only', false)).toEqual({ manual: true, scan: false });
    expect(allowedMethods('both', false)).toEqual({ manual: true, scan: true });
  });
  it('never limits the transport office', () => {
    for (const m of MARKING_MODES) expect(allowedMethods(m, true)).toEqual({ manual: true, scan: true });
  });
});
```

- [ ] **Step 2:** `npx vitest run lib/boarding/marking-mode.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// lib/boarding/marking-mode.ts
/**
 * Settings → Marking method: which ways boarding staff may record attendance.
 * One setting for both trips, stored in admin_settings ('attendance').
 *
 * The SERVER enforces it (POST /api/boarding/attendance refuses manual marks,
 * POST /api/boarding/scan refuses scans); the pages only hide what would be
 * refused. The transport office (super admin, tms.attendance.override) is never
 * limited — they are the correction path. Undo is never limited.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type MarkingMode = 'scan_only' | 'manual_only' | 'both';

export const MARKING_MODES: readonly MarkingMode[] = ['scan_only', 'manual_only', 'both'];
export const DEFAULT_MARKING_MODE: MarkingMode = 'both';
export const ATTENDANCE_SETTING_TYPE = 'attendance';

export const MARKING_MODE_LABEL: Record<MarkingMode, string> = {
  scan_only: 'Scan only',
  manual_only: 'Manual only',
  both: 'Scan + manual',
};

export const MARKING_MODE_HINT: Record<MarkingMode, string> = {
  scan_only: 'Staff scan ID cards. P / A / B buttons are hidden; students not scanned are marked absent when attendance closes.',
  manual_only: 'Staff tap P / A / B. The Scan button is hidden.',
  both: 'Staff can scan ID cards or tap P / A / B.',
};

export interface AllowedMarking { mode: MarkingMode; manual: boolean; scan: boolean }

/** What a page assumes when it cannot learn the setting: today's behaviour. */
export const ALL_METHODS_ALLOWED: AllowedMarking = { mode: 'both', manual: true, scan: true };

export function isMarkingMode(v: unknown): v is MarkingMode {
  return v === 'scan_only' || v === 'manual_only' || v === 'both';
}

export function parseMarkingMode(raw: unknown): MarkingMode {
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).markingMode : undefined;
  return isMarkingMode(v) ? v : DEFAULT_MARKING_MODE;
}

export function allowedMethods(mode: MarkingMode, exempt: boolean): { manual: boolean; scan: boolean } {
  if (exempt) return { manual: true, scan: true };
  return { manual: mode !== 'scan_only', scan: mode !== 'manual_only' };
}

/** null on a read error, so a Settings save can refuse instead of guessing. */
export async function readMarkingMode(svc: SupabaseClient): Promise<MarkingMode | null> {
  const { data, error } = await svc
    .from('admin_settings')
    .select('settings_data')
    .eq('setting_type', ATTENDANCE_SETTING_TYPE)
    .maybeSingle();
  if (error) return null;
  return parseMarkingMode((data as { settings_data: unknown } | null)?.settings_data);
}

/**
 * For the enforcement paths. A failed read falls back to 'both' — today's
 * behaviour — rather than locking every staffer out of one method.
 */
export async function loadMarkingMode(svc: SupabaseClient): Promise<MarkingMode> {
  return (await readMarkingMode(svc)) ?? DEFAULT_MARKING_MODE;
}
```

- [ ] **Step 4:** `npx vitest run lib/boarding/marking-mode.test.ts` → PASS.
- [ ] **Step 5: Commit** `git add lib/boarding/marking-mode.ts lib/boarding/marking-mode.test.ts && git commit -m "feat(attendance): marking-mode domain (scan only / manual only / both)"`

---

### Task 2: Offline protocol + sync understand the refusals

**Files:**
- Modify: `lib/boarding/offline/protocol.ts:19-55`
- Modify: `lib/boarding/offline/sync.ts:140-144`, `:158-164`
- Test: `lib/boarding/offline/sync.test.ts` (append inside `describe('syncOnce')`, before its closing `});` at line 176)

- [ ] **Step 1: Failing tests**

```ts
  it('refuses a mark batch with manual_off, without retrying', async () => {
    const kv = await setup(2);
    await syncOnce(deps(kv, { postMarks: async () => ({ status: 409, json: { reason: 'manual_off', error: 'Manual marking is switched off.' } }) }));
    expect((await listProblems(kv, 'u1')).map((p) => p.reason)).toEqual(['manual_off', 'manual_off']);
    expect(await listOutbox(kv, 'u1')).toEqual([]);
  });

  it('refuses a queued scan with scan_off', async () => {
    const kv = memoryKv();
    await enqueueScan(kv, { userId: 'u1', learnerId: 's1', token: 't-s1', walkUp: false, name: 's1', verified: true, direction: 'onward' }, T0, ids());
    await syncOnce(deps(kv, { postScan: async () => ({ status: 409, json: { ok: false, reason: 'scan_off', error: 'Scanning is switched off.' } }) }));
    expect((await listProblems(kv, 'u1')).map((p) => p.reason)).toEqual(['scan_off']);
  });
```

- [ ] **Step 2:** `npx vitest run lib/boarding/offline/sync.test.ts` → FAIL (reasons become `invalid` / `scan_refused`).

- [ ] **Step 3: Implement**

`protocol.ts` — union and text:
```ts
  | 'not_booked'
  | 'scan_refused'
  | 'manual_off'
  | 'scan_off';
```
```ts
  scan_refused: 'The scan was refused.',
  manual_off: "Manual marking is switched off in Settings. Scan the student's ID card instead.",
  scan_off: 'Scanning is switched off in Settings. Mark the student with P, A or B instead.',
```

`sync.ts` mark batch:
```ts
    : res.status === 409 && res.json?.reason === 'window_closed' ? 'outside_window'
    : res.status === 409 && res.json?.reason === 'manual_off' ? 'manual_off'
```
`sync.ts` scan:
```ts
    j.reason === 'not_booked' ? 'not_booked'
    : j.reason === 'scan_off' ? 'scan_off'
```

- [ ] **Step 4:** `npx vitest run lib/boarding/offline` → PASS.
- [ ] **Step 5: Commit** `git add lib/boarding/offline/protocol.ts lib/boarding/offline/sync.ts lib/boarding/offline/sync.test.ts && git commit -m "feat(attendance): outbox understands manual_off / scan_off refusals"`

---

### Task 3: Phone keeps the marking setting for offline starts

**Files:**
- Modify: `lib/boarding/offline/snapshot.ts`
- Test: `lib/boarding/offline/snapshot-marking.test.ts`

- [ ] **Step 1: Failing test**

```ts
// lib/boarding/offline/snapshot-marking.test.ts
import { describe, it, expect } from 'vitest';
import { memoryKv } from './kv';
import { saveMarking, loadMarking } from './snapshot';

describe('marking snapshot', () => {
  it('round-trips per user', async () => {
    const kv = memoryKv();
    const now = new Date('2026-09-15T03:00:00Z');
    await saveMarking(kv, 'u1', { mode: 'scan_only', manual: false, scan: true }, now);
    expect((await loadMarking(kv, 'u1'))?.value).toEqual({ mode: 'scan_only', manual: false, scan: true });
    expect(await loadMarking(kv, 'u2')).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run lib/boarding/offline/snapshot-marking.test.ts` → FAIL.

- [ ] **Step 3: Implement** (below `windowsKey` and after `loadWindows`)

```ts
const markingKey = (userId: string) => `marking:${userId}`;
```
```ts
export async function saveMarking<T>(kv: Kv, userId: string, marking: T, now: Date): Promise<void> {
  await kv.set<Saved<T>>(markingKey(userId), { savedAt: now.toISOString(), value: marking });
}

export async function loadMarking<T>(kv: Kv, userId: string): Promise<Saved<T> | null> {
  return (await kv.get<Saved<T>>(markingKey(userId))) ?? null;
}
```

- [ ] **Step 4:** → PASS. **Step 5: Commit** `git add lib/boarding/offline/snapshot.ts lib/boarding/offline/snapshot-marking.test.ts && git commit -m "feat(attendance): cache the marking setting on the phone"`

---

### Task 4: Settings — save and edit the mode

**Files:**
- Modify: `app/api/admin/attendance-windows/route.ts`
- Modify: `components/admin/attendance-window-settings.tsx`

- [ ] **Step 1: API** — imports:
```ts
import {
  readMarkingMode, loadMarkingMode, isMarkingMode, MARKING_MODE_LABEL, ATTENDANCE_SETTING_TYPE,
  type MarkingMode,
} from '@/lib/boarding/marking-mode';
```
GET:
```ts
    const [windows, markingMode] = await Promise.all([loadAttendanceWindows(svc), loadMarkingMode(svc)]);
    return NextResponse.json({ success: true, data: { windows, markingMode } });
```
PUT body type: `onward?: WindowInput; return?: WindowInput; markingMode?: unknown;`

After `if (invalid) return …` add:
```ts
    // Marking method. An older Settings screen sends no key: keep what is stored.
    const touchesMode = body.markingMode !== undefined;
    if (touchesMode && !isMarkingMode(body.markingMode)) {
      return NextResponse.json({ error: 'Choose Scan only, Manual only or Scan + manual.' }, { status: 400 });
    }
    const storedMode = await readMarkingMode(svc);
    if (storedMode === null) {
      return NextResponse.json(
        { error: 'Could not read the current marking method. Nothing was saved; try again.' },
        { status: 500 },
      );
    }
    const markingMode: MarkingMode = touchesMode ? (body.markingMode as MarkingMode) : storedMode;
```
After the windows upsert error check:
```ts
    if (touchesMode) {
      const { error: modeError } = await svc.from('admin_settings').upsert(
        { setting_type: ATTENDANCE_SETTING_TYPE, settings_data: { markingMode }, updated_at: now, updated_by: auth.userId },
        { onConflict: 'setting_type' },
      );
      if (modeError) {
        console.error('admin attendance-windows PUT marking mode error:', modeError);
        return NextResponse.json({ error: 'Failed to save the marking method' }, { status: 500 });
      }
    }
```
Activity log: description ends `… evening ${ret.active ? leg(ret) : 'off'}; marking ${MARKING_MODE_LABEL[markingMode]}`, `metadata: { windows, markingMode }`. Response `data: { windows, markingMode }`.

- [ ] **Step 2: Settings UI** — imports add `MARKING_MODES, MARKING_MODE_LABEL, MARKING_MODE_HINT, DEFAULT_MARKING_MODE, type MarkingMode` from `@/lib/boarding/marking-mode`; state `const [markingMode, setMarkingMode] = useState<MarkingMode>(DEFAULT_MARKING_MODE);`; in the load success branch `if (json.data.markingMode) setMarkingMode(json.data.markingMode as MarkingMode);`; PUT body `JSON.stringify({ onward, return: evening, markingMode })`; success toast `'Attendance settings saved. Open boarding screens update now.'`; button text `Save attendance settings`. Insert before `<div className="grid grid-cols-1 gap-4 md:grid-cols-2">`:

```tsx
      <fieldset className="rounded-lg border border-gray-200 bg-white p-5">
        <legend className="px-1 font-medium text-gray-900">Marking method</legend>
        <p className="mb-3 text-xs text-gray-600">
          How boarding staff record attendance, for both trips. The transport head and super admins can always use both.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MARKING_MODES.map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                markingMode === m ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="marking-mode"
                value={m}
                checked={markingMode === m}
                onChange={() => setMarkingMode(m)}
                className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block font-medium text-gray-900">{MARKING_MODE_LABEL[m]}</span>
                <span className="block text-xs text-gray-600">{MARKING_MODE_HINT[m]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
```

- [ ] **Step 3: Verify** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "attendance-windows/route|attendance-window-settings"` → no output.
- [ ] **Step 4: Commit** `git add app/api/admin/attendance-windows/route.ts components/admin/attendance-window-settings.tsx && git commit -m "feat(settings): choose the attendance marking method"`

---

### Task 5: Server enforcement + boarding read

**Files:**
- Modify: `app/api/boarding/attendance-window/route.ts`
- Modify: `app/api/boarding/attendance/route.ts` (after `const exempt = …`, line 156)
- Modify: `app/api/boarding/scan/route.ts` (after `const svc = createServiceRoleClient();`, line 123)

- [ ] **Step 1: Boarding GET**
```ts
import { loadMarkingMode, allowedMethods } from '@/lib/boarding/marking-mode';
```
```ts
    const svc = createServiceRoleClient();
    const [windows, mode, isOverrideHolder] = await Promise.all([
      loadAttendanceWindows(svc),
      loadMarkingMode(svc),
      requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE),
    ]);
    // Computed for THIS caller: the transport office keeps both methods.
    const marking = { mode, ...allowedMethods(mode, auth.isSuperAdmin || isOverrideHolder) };
    return NextResponse.json({
      success: true,
      data: { windows, activeDirection: activeDirection(windows), serverNowMinutes: istMinutesOfDay(), marking },
    });
```

- [ ] **Step 2: Manual POST** — change the protocol import to `import { REJECT_REASON_TEXT, type MarkRejectReason } from '@/lib/boarding/offline/protocol';`, add `import { loadMarkingMode, allowedMethods } from '@/lib/boarding/marking-mode';`, then after `const exempt = auth.isSuperAdmin || isOverrideHolder;`:
```ts
    // Settings → Marking method. Refused before timing or ownership is judged:
    // in Scan only mode a manual mark is not accepted at any time. Queued
    // (offline-aware) batches get per-mark results so the outbox settles them.
    if (!allowedMethods(await loadMarkingMode(svc), exempt).manual) {
      const error = REJECT_REASON_TEXT.manual_off;
      if (marks.every((m) => !m.tappedAt)) {
        return NextResponse.json({ error, reason: 'manual_off' }, { status: 409 });
      }
      return NextResponse.json({
        success: true, updated: 0, skipped: 0, locked: [], dropped: marks.length, walkUps: 0,
        results: buildMarkResults({
          rejected: marks.map((m) => ({ clientId: m.clientId, reason: 'manual_off' as const })),
          sent: [], outcomes: [], markerName: () => '',
        }),
      });
    }
```

- [ ] **Step 3: Scan POST** — add `import { loadMarkingMode, allowedMethods } from '@/lib/boarding/marking-mode';`, then after `const svc = createServiceRoleClient();`:
```ts
    // Settings → Marking method. Manual only switches scanning off for ordinary
    // staff; the transport office keeps it.
    const scanExempt = auth.isSuperAdmin || (await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE));
    if (!allowedMethods(await loadMarkingMode(svc), scanExempt).scan) {
      return NextResponse.json(
        { ok: false, clientId: body.clientId ?? null, reason: 'scan_off', error: REJECT_REASON_TEXT.scan_off },
        { status: 409 },
      );
    }
```

- [ ] **Step 4: Verify** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "boarding/attendance-window/route|boarding/attendance/route|boarding/scan/route"` → no output; `npx vitest run lib/boarding` → PASS.
- [ ] **Step 5: Commit** `git add app/api/boarding/attendance-window/route.ts app/api/boarding/attendance/route.ts app/api/boarding/scan/route.ts && git commit -m "feat(attendance): enforce the marking method on manual marks and scans"`

---

### Task 6: Attendance page, columns and route page follow the mode

**Files:**
- Modify: `app/boarding/attendance/page.tsx`
- Modify: `app/boarding/attendance/columns.tsx:177-191`, `:329-333`
- Modify: `app/boarding/routes/[routeId]/page.tsx:35-45`

- [ ] **Step 1: Columns** — add to the `opts` type:
```ts
  /** Settings → Marking method allows P / A / B for this viewer. */
  manualAllowed: boolean;
```
After `const busy = opts.busyId === row.original.learner_id;`:
```tsx
        // Scan only: no P / A / B. The one control left is Undo on a SCAN this
        // viewer may clear, so a mis-scan can be taken back. Never on manual or
        // auto rows -- those are not a scan.
        if (!opts.manualAllowed) {
          const r = row.original;
          const isScan = r.method === 'id_card' || r.method === 'qr_scan';
          if (!isScan || !r.can_clear) return null;
          return (
            <button
              type="button"
              onClick={() => opts.onUndo(r)}
              disabled={busy}
              title="Undo this scan"
              aria-label="Undo this scan"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          );
        }
```

- [ ] **Step 2: Attendance page**
  - Imports: `import { ALL_METHODS_ALLOWED, type AllowedMarking } from '@/lib/boarding/marking-mode';` and add `loadMarking, saveMarking` to the snapshot import.
  - `fetchWindows` return type `{ windows: AttendanceWindows; activeDirection: AttDirection | null; marking: AllowedMarking }`. Offline branch:
```ts
    const savedMarking = userId ? await loadMarking<AllowedMarking>(offlineKv(), userId).catch(() => null) : null;
    return { windows, activeDirection: activeDirection(windows), marking: savedMarking?.value ?? ALL_METHODS_ALLOWED };
```
  Failure branch: `return { windows: DEFAULT_WINDOWS, activeDirection: null, marking: ALL_METHODS_ALLOWED };`. Success:
```ts
  const marking = (json.data.marking as AllowedMarking | undefined) ?? ALL_METHODS_ALLOWED;
  if (userId) void saveMarking(offlineKv(), userId, marking, new Date()).catch(() => {});
```
  and add `marking` to the returned object.
  - After `const windows = …`: `const marking = winData?.marking ?? ALL_METHODS_ALLOWED;`
  - Columns: `getRosterColumns({ canMark, busyId, onMark: mark, onUndo: undo, hasOwners, pending, manualAllowed: marking.manual })`, deps add `marking.manual`.
  - Wrap the amber P/A/B legend `<div className="mt-3 rounded-lg border border-amber-200 …">…</div>` in `{marking.manual && ( … )}` and add after it:
```tsx
        {marking.mode !== 'both' && (
          <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
            {marking.mode === 'scan_only'
              ? "Scan only: scan each student's ID card. Students not scanned are marked absent when attendance closes."
              : 'Manual only: mark each student with P, A or B. Scanning is switched off.'}
            {marking.manual && marking.scan && ' As transport office you can still use both.'}
          </p>
        )}
```
  - Scan button condition `{isToday && marking.scan && (`.

- [ ] **Step 3: Route page** — add import `import { ALL_METHODS_ALLOWED, type AllowedMarking } from '@/lib/boarding/marking-mode';` and replace `const editable = canManage && isToday;` with:
```tsx
  // Settings → Marking method. In Scan only mode this page offers no manual
  // control; the server refuses manual marks either way.
  const { data: marking } = useQuery({
    queryKey: ['boarding-marking'],
    queryFn: async (): Promise<AllowedMarking> => {
      const res = await fetch('/api/boarding/attendance-window', { cache: 'no-store', credentials: 'same-origin' });
      const json = await res.json().catch(() => null);
      return (json?.data?.marking as AllowedMarking | undefined) ?? ALL_METHODS_ALLOWED;
    },
    refetchOnWindowFocus: true,
  });
  const editable = canManage && isToday && (marking?.manual ?? true);
```

- [ ] **Step 4: Verify** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "boarding/attendance/(page|columns)|routes/\[routeId\]/page"` → no output.
- [ ] **Step 5: Commit** `git add app/boarding/attendance/page.tsx app/boarding/attendance/columns.tsx "app/boarding/routes/[routeId]/page.tsx" && git commit -m "feat(attendance): boarding screens follow the marking method"`

---

### Task 7: Verify and ship with auto-absent

- [ ] `npx vitest run` → all green (report count).
- [ ] `set -a; . ../../.env; set +a; node node_modules/next/dist/bin/next build` → exit 0.
- [ ] Live read: `select * from admin_settings where setting_type='attendance'` → no row = `both` (unchanged behaviour on deploy).
- [ ] **Ask the user**, then `git fetch && git log origin/main..HEAD && git merge-base --is-ancestor origin/main HEAD` and `git push origin HEAD:main` (auto-absent + marking mode together).
- [ ] After deploy: apply the auto-absent schedule migration (before 07:00 IST), then the user sets the mode in Settings.
- [ ] User browser smoke test: Settings → Scan only → open Attendance page updates without reload (no P/A/B, Scan visible, Undo on own scan); a manual POST from the route page is refused with the Settings message; Manual only hides Scan; transport head still sees both.
