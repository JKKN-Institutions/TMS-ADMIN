# Boarding Attendance (unified) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the boarding portal's split attendance/scan UX with one Attendance page — Marked/Unmarked/Total tiles, an active-leg toggle, a booked-students `DataTable`, per-row manual mark, and a Scan button that opens the scanner in a modal — then delete the standalone `/boarding/scan` module.

**Architecture:** A new pure `buildRosterRows` helper flattens booked riders + per-leg attendance into table rows; a new route-scoped `GET /api/boarding/attendance/roster` serves rows + server-computed counts; the page composes the shared `DataTable`, a new `ScanDialog` (extracted from the old scan page's html5-qrcode logic), and the existing `POST /api/boarding/attendance` (manual mark) + `POST /api/boarding/scan` (QR). The old scan page, `TodaysBookings`, and `bookings-today` are deleted and 8 `/boarding/scan` references repointed to `/boarding/attendance`.

**Tech Stack:** Next.js 15 (App Router), React 19, TanStack Table + React Query, Supabase (service-role), html5-qrcode, Tailwind, vitest.

## Global Constraints

- **No schema changes.** Reuse `tms_booking`, `tms_attendance` (upsert key `learner_id,trip_date,direction`), `tms_route_stop` (`stop_time` onward / `evening_time` return), `tms_attendance_window`.
- **Modern API pattern:** `withAuth` + `createServiceRoleClient` + inline `requirePerm(auth, 'tms.attendance.scan')`; JSON shape `{ success, data }` / `{ error }`; route-scoped via `getAssignedRouteIdsForUser(auth)` (super-admin with no assignment → all routes).
- **Perms:** viewing/scan = `TMS_PERMISSIONS.ATTENDANCE_SCAN` (`tms.attendance.scan`); manual mark = `ATTENDANCE_MANAGE` (`tms.attendance.manage`, enforced by the existing POST).
- **vitest imports are relative** (`./roster`), never the `@/` alias (the alias breaks vitest in this repo). Test runner: `npm test` (= `vitest run`).
- **No new dependencies.** Use this branch's `html5-qrcode` and the existing `components/ui/dialog.tsx`, `Button`, `Input`, `DataTable`.
- **tsc gate:** the repo has ~pre-existing errors elsewhere; a task passes if **none of its changed files** appear in `npx tsc --noEmit` output (not a zero-error repo).
- **Commit trailer:** end every commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/booking/roster.ts` | Add `RosterRow` type + pure `buildRosterRows` next to `groupRosterByStop` | Modify |
| `lib/booking/roster.test.ts` | Unit tests for `buildRosterRows` | Modify |
| `app/api/boarding/attendance/roster/route.ts` | `GET` flat roster + counts for a date+leg | Create |
| `components/boarding/scan-dialog.tsx` | Scanner modal (camera + manual code + walk-up) | Create |
| `app/boarding/attendance/columns.tsx` | `getRosterColumns` for `RosterRow` (status, marked, action) | Rewrite |
| `app/boarding/attendance/page.tsx` | Tiles + leg toggle + date picker + DataTable + ScanDialog + mark | Rewrite |
| `app/boarding/scan/page.tsx` | old standalone scanner | **Delete** |
| `components/boarding/todays-bookings.tsx` | old checklist | **Delete** |
| `app/api/boarding/bookings-today/route.ts` | old nested endpoint (sole consumer deleted) | **Delete** |
| `proxy.ts`, `app/auth/callback/route.ts`, `app/boarding/select-route/page.tsx`, `app/boarding/routes/page.tsx`, `app/boarding/routes/[routeId]/page.tsx`, `app/boarding/dashboard/page.tsx`, `lib/boarding/navigation.ts`, `components/boarding-bottom-nav.tsx` | repoint `/boarding/scan` → `/boarding/attendance` | Modify |

---

### Task 1: Pure `buildRosterRows` helper + `RosterRow` type

**Files:**
- Modify: `lib/booking/roster.ts` (add exports after `groupRosterByStop`)
- Test: `lib/booking/roster.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: existing `RosterRider` (`{ learner_id, name, roll, stop_id }`), `OrderedStop` (`{ id, name, time, order }`) from this file.
- Produces:
  ```ts
  export interface RosterRow {
    learner_id: string; name: string; roll: string | null;
    route_id: string; route_number: string | null;
    stop_id: string | null; stop_name: string; stop_time: string | null;
    status: 'present' | 'unmarked'; method: string | null; scanned_at: string | null;
  }
  export function buildRosterRows(
    riders: RosterRider[],
    route: { id: string; route_number: string | null },
    orderedStops: OrderedStop[],          // .time already leg-resolved by the caller
    attendanceByLearner: Map<string, { status: string; method: string | null; scanned_at: string | null }>,
  ): RosterRow[]
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/booking/roster.test.ts`:
```ts
import { buildRosterRows, type RosterRow } from './roster';

describe('buildRosterRows', () => {
  const stops: OrderedStop[] = [
    { id: 's2', name: 'Second', time: '07:20', order: 2 },
    { id: 's1', name: 'First', time: '07:00', order: 1 },
  ];
  const route = { id: 'r1', route_number: '05' };
  const r = (learner_id: string, roll: string | null, stop_id: string | null, name = 'X'): RosterRider =>
    ({ learner_id, roll, stop_id, name });

  it('marks a rider present when an attendance row exists for the leg', () => {
    const att = new Map([['a', { status: 'present', method: 'qr_scan', scanned_at: '2026-07-11T02:00:00Z' }]]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, att);
    expect(rows[0].status).toBe('present');
    expect(rows[0].method).toBe('qr_scan');
    expect(rows[0].scanned_at).toBe('2026-07-11T02:00:00Z');
    expect(rows[0].route_number).toBe('05');
  });

  it('leaves a rider unmarked (null method/time) when no present row exists', () => {
    const att = new Map([['a', { status: 'absent', method: 'manual', scanned_at: 'x' }]]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's2')], route, stops, att);
    const a = rows.find((x) => x.learner_id === 'a')!;
    const b = rows.find((x) => x.learner_id === 'b')!;
    expect(a.status).toBe('unmarked'); // 'absent' counts as unmarked in the two-state model
    expect(a.method).toBeNull();
    expect(b.status).toBe('unmarked');
    expect(b.method).toBeNull();
  });

  it('resolves the leg-appropriate stop name + time and sorts by stop order then roll', () => {
    const rows = buildRosterRows([r('a', '30', 's2'), r('b', '10', 's1'), r('c', '20', 's1')], route, stops, new Map());
    expect(rows.map((x) => x.learner_id)).toEqual(['b', 'c', 'a']); // s1(order1): roll10,20 ; then s2
    expect(rows[0].stop_name).toBe('First');
    expect(rows[0].stop_time).toBe('07:00');
  });

  it('buckets riders with null/unknown stops as "Stop not set" and trails them', () => {
    const rows = buildRosterRows([r('a', '10', null), r('b', '20', 's1'), r('c', '30', 'ghost')], route, stops, new Map());
    expect(rows[0].learner_id).toBe('b');
    const trailing = rows.slice(1);
    expect(trailing.every((x) => x.stop_name === 'Stop not set' && x.stop_time === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- roster`
Expected: FAIL — `buildRosterRows is not a function` / no export.

- [ ] **Step 3: Implement `buildRosterRows` + `RosterRow`**

Append to `lib/booking/roster.ts` (after `groupRosterByStop`):
```ts
export interface RosterRow {
  learner_id: string;
  name: string;
  roll: string | null;
  route_id: string;
  route_number: string | null;
  stop_id: string | null;
  stop_name: string;
  stop_time: string | null;
  status: 'present' | 'unmarked';
  method: string | null;
  scanned_at: string | null;
}

/**
 * Pure: flatten one route's booked riders into attendance rows for a single leg.
 * The caller must pass `orderedStops` with `.time` already resolved to the leg
 * (stop_time onward / evening_time return) and `attendanceByLearner` already
 * filtered to that leg. Riders sort by stop order then roll/name (numeric-aware);
 * riders with a null/unknown stop fall into a trailing "Stop not set" bucket.
 */
export function buildRosterRows(
  riders: RosterRider[],
  route: { id: string; route_number: string | null },
  orderedStops: OrderedStop[],
  attendanceByLearner: Map<string, { status: string; method: string | null; scanned_at: string | null }>,
): RosterRow[] {
  const byId = new Map(orderedStops.map((s) => [s.id, s] as const));
  const orderOf = (stopId: string | null) =>
    stopId && byId.has(stopId) ? (byId.get(stopId)!.order ?? 0) : Number.MAX_SAFE_INTEGER;

  const rows: RosterRow[] = riders.map((rider) => {
    const stop = rider.stop_id && byId.has(rider.stop_id) ? byId.get(rider.stop_id)! : null;
    const att = attendanceByLearner.get(rider.learner_id);
    const present = att?.status === 'present';
    return {
      learner_id: rider.learner_id,
      name: rider.name,
      roll: rider.roll,
      route_id: route.id,
      route_number: route.route_number,
      stop_id: stop ? stop.id : null,
      stop_name: stop ? stop.name : 'Stop not set',
      stop_time: stop ? stop.time : null,
      status: present ? 'present' : 'unmarked',
      method: present ? att!.method : null,
      scanned_at: present ? att!.scanned_at : null,
    };
  });

  rows.sort((a, b) => {
    const byStop = orderOf(a.stop_id) - orderOf(b.stop_id);
    if (byStop !== 0) return byStop;
    return (a.roll ?? a.name).localeCompare(b.roll ?? b.name, undefined, { numeric: true });
  });
  return rows;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- roster`
Expected: PASS (existing `groupRosterByStop` tests + the 4 new `buildRosterRows` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/booking/roster.ts lib/booking/roster.test.ts
git commit -m "$(cat <<'EOF'
feat(boarding): pure buildRosterRows helper for the attendance roster

Flattens booked riders + per-leg attendance into flat RosterRow list, sorted by
stop order then roll. Pure + unit-tested alongside groupRosterByStop.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `GET /api/boarding/attendance/roster` endpoint

**Files:**
- Create: `app/api/boarding/attendance/roster/route.ts`

**Interfaces:**
- Consumes: `buildRosterRows`, `loadBookedRoster`, `OrderedStop`, `RosterRow` (Task 1); `getAssignedRouteIdsForUser`; `istToday`; `TMS_PERMISSIONS`.
- Produces: `GET /api/boarding/attendance/roster?date=YYYY-MM-DD&direction=onward|return` → `{ success: true, data: { date, direction, rows: RosterRow[], counts: { total, marked, unmarked } } }`. Consumed by the page (Task 4).

- [ ] **Step 1: Create the route**

Create `app/api/boarding/attendance/roster/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { loadBookedRoster, buildRosterRows, type OrderedStop, type RosterRow } from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteRow { id: string; route_number: string | null }
interface StopRow { id: string; route_id: string; stop_name: string; stop_time: string | null; evening_time: string | null; sequence_order: number | null }
interface AttRow { learner_id: string; status: string | null; method: string | null; scanned_at: string | null }

/**
 * GET /api/boarding/attendance/roster?date=&direction= — today's (or any day's)
 * booked students across the staff's assigned routes, each joined to their
 * attendance for the selected leg. Route-scoped like bookings-today. Counts are
 * derived from the produced rows so Marked + Unmarked === Total always holds.
 */
async function getRoster(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    let date = istToday();
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
      }
      date = dateParam;
    }
    const direction: 'onward' | 'return' = url.searchParams.get('direction') === 'return' ? 'return' : 'onward';

    const svc = createServiceRoleClient();

    let routeIds = await getAssignedRouteIdsForUser(auth);
    if (routeIds.length === 0 && auth.isSuperAdmin) {
      const { data } = await svc.from('tms_route').select('id');
      routeIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }
    const empty = { success: true, data: { date, direction, rows: [] as RosterRow[], counts: { total: 0, marked: 0, unmarked: 0 } } };
    if (routeIds.length === 0) return NextResponse.json(empty);

    const { data: routeData } = await svc
      .from('tms_route').select('id, route_number').in('id', routeIds).order('route_number', { ascending: true });
    const routes = (routeData ?? []) as RouteRow[];

    const { data: stopData } = await svc
      .from('tms_route_stop')
      .select('id, route_id, stop_name, stop_time, evening_time, sequence_order')
      .in('route_id', routeIds)
      .order('sequence_order', { ascending: true });
    // Resolve each stop's time to the selected leg BEFORE handing to the pure helper.
    const stopsByRoute = new Map<string, OrderedStop[]>();
    for (const s of (stopData ?? []) as StopRow[]) {
      const arr = stopsByRoute.get(s.route_id) ?? [];
      arr.push({ id: s.id, name: s.stop_name, time: direction === 'return' ? s.evening_time : s.stop_time, order: s.sequence_order });
      stopsByRoute.set(s.route_id, arr);
    }

    const { data: attData } = await svc
      .from('tms_attendance')
      .select('learner_id, status, method, scanned_at')
      .in('route_id', routeIds)
      .eq('trip_date', date)
      .eq('direction', direction);
    const attByLearner = new Map<string, { status: string; method: string | null; scanned_at: string | null }>();
    for (const a of (attData ?? []) as AttRow[]) {
      if (a.status) attByLearner.set(a.learner_id, { status: a.status, method: a.method, scanned_at: a.scanned_at });
    }

    const rows: RosterRow[] = [];
    for (const rt of routes) {
      const { riders } = await loadBookedRoster(svc, rt.id, date);
      rows.push(...buildRosterRows(riders, { id: rt.id, route_number: rt.route_number }, stopsByRoute.get(rt.id) ?? [], attByLearner));
    }

    const marked = rows.filter((r) => r.status === 'present').length;
    return NextResponse.json({
      success: true,
      data: { date, direction, rows, counts: { total: rows.length, marked, unmarked: rows.length - marked } },
    });
  } catch (e) {
    console.error('boarding attendance roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRoster(request, auth));
```

- [ ] **Step 2: Typecheck the new file**

Run: `npx tsc --noEmit 2>&1 | grep "attendance/roster/route" || echo "clean"`
Expected: `clean` (no type errors in the new file).

- [ ] **Step 3: Probe the route unauthenticated (dev server running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/boarding/attendance/roster?date=2026-07-11&direction=onward"`
Expected: `401` (withAuth rejects unauthenticated). If the dev server isn't running, skip and rely on the manual smoke test in Task 4.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/attendance/roster/route.ts
git commit -m "$(cat <<'EOF'
feat(boarding): roster API — booked students + per-leg attendance + counts

GET /api/boarding/attendance/roster?date=&direction= returns flat RosterRows for
the staff's assigned routes and server-computed Marked/Unmarked/Total counts.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `ScanDialog` scanner modal

**Files:**
- Create: `components/boarding/scan-dialog.tsx`

**Interfaces:**
- Consumes: `components/ui/dialog` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`), `Button`, `Input`, html5-qrcode, `isDirectionOpen`/`formatHM`/`AttendanceWindows`/`AttDirection` from `@/lib/boarding/attendance-window`, `POST /api/boarding/scan`.
- Produces: default export `ScanDialog` with props `{ open: boolean; onOpenChange: (v: boolean) => void; direction: AttDirection; windows: AttendanceWindows; onMarked: () => void }`. Consumed by the page (Task 4).

- [ ] **Step 1: Create the component**

Create `components/boarding/scan-dialog.tsx`:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isDirectionOpen, formatHM, type AttendanceWindows, type AttDirection } from '@/lib/boarding/attendance-window';

type ScanResult = {
  ok: boolean;
  learner?: { name: string; rollNumber: string | null };
  direction?: string;
  walkUp?: boolean;
  reason?: 'not_booked' | 'window_closed';
  seatsRemaining?: number;
  overCapacity?: boolean;
  error?: string;
};

const READER_ID = 'scan-dialog-reader';

/**
 * Scanner-in-a-modal. Marks the passed-in leg (the page owns the toggle). Reuses
 * the old scan page's html5-qrcode + 6-digit + walk-up flow. Fires onMarked after
 * a successful scan so the page can refresh the roster. Camera runs only while the
 * dialog is open and the leg's window is open.
 */
export default function ScanDialog({
  open,
  onOpenChange,
  direction,
  windows,
  onMarked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: AttDirection;
  windows: AttendanceWindows;
  onMarked: () => void;
}) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const lastTokenRef = useRef('');

  const win = windows[direction];
  const legOpen = isDirectionOpen(win);

  async function submit(token: string, walkUp = false) {
    if (!token) return;
    if (!isDirectionOpen(windows[direction])) {
      setResult({
        ok: false,
        reason: 'window_closed',
        error: `${direction === 'onward' ? 'Onward (morning)' : 'Return (evening)'} scanning is open ${formatHM(win.start)}–${formatHM(win.end)} only.`,
      });
      return;
    }
    if (busyRef.current && !walkUp) return;
    busyRef.current = true;
    lastTokenRef.current = token;
    try {
      const res = await fetch('/api/boarding/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, direction, walkUp }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult(json);
        setManual('');
        onMarked();
      } else {
        setResult({ ok: false, ...json, error: json.error || json.reason || 'Scan failed' });
      }
    } catch {
      setResult({ ok: false, error: 'Network error' });
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 1500);
    }
  }

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

  async function startCamera() {
    if (scannerRef.current) return;
    if (!document.getElementById(READER_ID)) return;
    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (decoded) => submit(decoded), () => {});
      setScanning(true);
    } catch {
      setResult({ ok: false, error: 'Could not start camera — use manual entry below.' });
      scannerRef.current = null;
    }
  }

  // Run the camera only while the dialog is open and the leg is open.
  useEffect(() => {
    if (open && legOpen) void startCamera();
    return () => {
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, legOpen]);

  // Clear transient state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setResult(null);
      setManual('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan boarding pass · {direction === 'onward' ? 'Onward' : 'Return'}</DialogTitle>
        </DialogHeader>

        {!legOpen && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {direction === 'onward' ? 'Onward' : 'Return'} scanning is open {formatHM(win.start)}–{formatHM(win.end)} only.
            </span>
          </div>
        )}

        <div id={READER_ID} className="w-full overflow-hidden rounded-md" />

        <div className="flex gap-2">
          {!scanning ? (
            <Button className="flex-1" onClick={startCamera} disabled={!legOpen}>
              {legOpen ? 'Start camera' : 'Scanning closed'}
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={stopCamera}>
              Stop
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Or enter the 6-digit code:</p>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="6-digit code"
              disabled={!legOpen}
            />
            <Button onClick={() => submit(manual)} disabled={!manual || !legOpen}>
              Mark
            </Button>
          </div>
        </div>

        {result && (
          <div className={`rounded-lg border p-3 text-sm ${result.ok ? 'border-green-400' : 'border-red-400'}`}>
            {result.ok ? (
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">
                  ✓ Marked present ({result.direction}){result.walkUp ? ' · walk-up' : ''}
                </p>
                <p>
                  {result.learner?.name}
                  {result.learner?.rollNumber ? ` · ${result.learner.rollNumber}` : ''}
                </p>
                {result.overCapacity && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">⚠ Bus over capacity — boarded as overflow.</p>
                )}
              </div>
            ) : result.reason === 'not_booked' ? (
              <div className="space-y-2">
                <p className="text-amber-700 dark:text-amber-300">⚠ {result.learner?.name ?? 'Learner'} has no booking for today.</p>
                <p className="text-xs text-muted-foreground">Seats remaining: {result.seatsRemaining ?? 0}</p>
                <Button className="w-full" onClick={() => submit(lastTokenRef.current, true)}>
                  {(result.seatsRemaining ?? 0) > 0 ? 'Add as walk-up' : 'Add as walk-up (over capacity)'}
                </Button>
              </div>
            ) : (
              <p className="text-red-700 dark:text-red-300">✗ {result.error}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `npx tsc --noEmit 2>&1 | grep "scan-dialog" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add components/boarding/scan-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(boarding): ScanDialog — scanner in a modal

Extracts the scan page's html5-qrcode camera + 6-digit code + walk-up flow into a
reusable dialog that marks the caller's leg and fires onMarked on success.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Attendance page + columns rewrite (integration)

**Files:**
- Rewrite: `app/boarding/attendance/columns.tsx`
- Rewrite: `app/boarding/attendance/page.tsx`

> Both are rewritten in one task so `tsc` stays green at the boundary — the page imports `getRosterColumns`, and the old page imports the old `getAttendanceColumns`, so they can't be split.

**Interfaces:**
- Consumes: `RosterRow` + `buildRosterRows` types (Task 1), `GET /api/boarding/attendance/roster` (Task 2), `ScanDialog` (Task 3), `DataTable`, `POST /api/boarding/attendance`, `GET /api/boarding/attendance-window`.
- Produces: the finished `/boarding/attendance` page. `columns.tsx` exports `getRosterColumns(opts)`.

- [ ] **Step 1: Rewrite `columns.tsx`**

Replace the entire contents of `app/boarding/attendance/columns.tsx`:
```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { QrCode, Pencil, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { RosterRow } from '@/lib/booking/roster';

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

function StatusBadge({ status }: { status: RosterRow['status'] }) {
  if (status === 'present')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        <Check className="h-3 w-3" /> Present
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      Unmarked
    </span>
  );
}

/**
 * Booked-students columns for the Attendance page. Route/Status are filterable.
 * The Action column shows a "Mark present" button for unmarked rows only when
 * `canMark` (today) — a manual override that POSTs to /api/boarding/attendance.
 */
export function getRosterColumns(opts: {
  canMark: boolean;
  markingId: string | null;
  onMark: (row: RosterRow) => void;
}): ColumnDef<RosterRow>[] {
  const selectColumn: ColumnDef<RosterRow> = {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    size: 40,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v)} aria-label="Select row" />
    ),
  };

  return [
    selectColumn,
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.name}</span>,
    },
    {
      accessorKey: 'roll',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll No." />,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.roll || '—'}</span>,
    },
    {
      id: 'route_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (r) => r.route_number ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 90,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.route_number || '—'}</span>,
    },
    {
      id: 'stop',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      accessorFn: (r) => r.stop_name,
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">
          {row.original.stop_name}
          {row.original.stop_time ? <span className="text-gray-400"> · {row.original.stop_time.slice(0, 5)}</span> : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => r.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'scanned_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marked" />,
      size: 110,
      cell: ({ row }) =>
        row.original.status === 'present' ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500">
            {row.original.method === 'manual' ? <Pencil className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
            {fmtTime(row.original.scanned_at)}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      id: 'action',
      enableHiding: false,
      enableSorting: false,
      size: 120,
      header: () => null,
      cell: ({ row }) => {
        if (!opts.canMark || row.original.status === 'present') return null;
        const busy = opts.markingId === row.original.learner_id;
        return (
          <button
            type="button"
            onClick={() => opts.onMark(row.original)}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> {busy ? 'Marking…' : 'Mark present'}
          </button>
        );
      },
    },
  ];
}
```

- [ ] **Step 2: Rewrite `page.tsx`**

Replace the entire contents of `app/boarding/attendance/page.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ListChecks, Download, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import ScanDialog from '@/components/boarding/scan-dialog';
import { getRosterColumns } from './columns';
import type { RosterRow } from '@/lib/booking/roster';
import { DEFAULT_WINDOWS, isDirectionOpen, formatHM, type AttendanceWindows, type AttDirection } from '@/lib/boarding/attendance-window';

const todayStr = () => new Date().toISOString().slice(0, 10);

interface RosterResponse {
  date: string;
  direction: AttDirection;
  rows: RosterRow[];
  counts: { total: number; marked: number; unmarked: number };
}

async function fetchRoster(date: string, direction: AttDirection): Promise<RosterResponse> {
  const res = await fetch(`/api/boarding/attendance/roster?date=${date}&direction=${direction}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load roster');
  return json.data as RosterResponse;
}

async function fetchWindows(): Promise<{ windows: AttendanceWindows; activeDirection: AttDirection | null }> {
  const res = await fetch('/api/boarding/attendance-window', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json?.success) return { windows: DEFAULT_WINDOWS, activeDirection: null };
  return { windows: json.data.windows as AttendanceWindows, activeDirection: (json.data.activeDirection ?? null) as AttDirection | null };
}

export default function BoardingAttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [direction, setDirection] = useState<AttDirection>('onward');
  const [scanOpen, setScanOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const dirSeeded = useRef(false);

  const isToday = date === todayStr();

  const { data: winData } = useQuery({ queryKey: ['boarding-attendance-window'], queryFn: fetchWindows });
  const windows = winData?.windows ?? DEFAULT_WINDOWS;
  // Seed the leg once from the server-computed active direction (device clock may be wrong).
  useEffect(() => {
    if (!dirSeeded.current && winData?.activeDirection) {
      setDirection(winData.activeDirection);
      dirSeeded.current = true;
    }
  }, [winData]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['boarding-roster', date, direction],
    queryFn: () => fetchRoster(date, direction),
  });
  useEffect(() => {
    if (isError) toast.error(error instanceof Error ? error.message : 'Failed to load roster');
  }, [isError, error]);

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? { total: 0, marked: 0, unmarked: 0 };

  const markPresent = useCallback(
    async (row: RosterRow) => {
      setMarkingId(row.learner_id);
      try {
        const res = await fetch('/api/boarding/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ routeId: row.route_id, direction, marks: [{ learnerId: row.learner_id, status: 'present' }] }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to mark present');
        toast.success(`Marked ${row.name} present`);
        qc.invalidateQueries({ queryKey: ['boarding-roster'] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to mark present');
      } finally {
        setMarkingId(null);
      }
    },
    [direction, qc]
  );

  const columns = useMemo(
    () => getRosterColumns({ canMark: isToday, markingId, onMark: markPresent }),
    [isToday, markingId, markPresent]
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Status', options: [{ label: 'Present', value: 'present' }, { label: 'Unmarked', value: 'unmarked' }] },
  ];

  const exportCsv = (rowsToExport: RosterRow[]) => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Learner', 'Roll No.', 'Route', 'Stop', 'Status', 'Method', 'Marked At'];
    const lines = [header.map(esc).join(',')];
    for (const r of rowsToExport) {
      lines.push([r.name, r.roll, r.route_number, r.stop_name, r.status, r.method, r.scanned_at].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${date}-${direction}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const legOpen = isDirectionOpen(windows[direction]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-600 mt-1 text-sm">Today&apos;s booked students — scan or mark them present for the selected leg.</p>
        </div>
        {/* Leg toggle */}
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
          {(['onward', 'return'] as AttDirection[]).map((d) => {
            const active = direction === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300'}`}
              >
                {d === 'onward' ? 'Onward' : 'Return'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Analytics tiles + day picker */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Tile label="Marked" value={counts.marked} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
          <Tile label="Unmarked" value={counts.unmarked} tone="gray" icon={<Circle className="h-4 w-4" />} />
          <Tile label="Total bookings" value={counts.total} tone="slate" icon={<ListChecks className="h-4 w-4" />} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Day</label>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="h-[38px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {isToday && !legOpen && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {direction === 'onward' ? 'Onward' : 'Return'} scan window is {formatHM(windows[direction].start)}–{formatHM(windows[direction].end)}; camera scanning is closed, but you can still mark manually.
        </p>
      )}

      <DataTable
        columns={columns}
        data={rows}
        entityName="students"
        isLoading={isLoading}
        searchPlaceholder="Search learner, roll #..."
        pageSize={20}
        filters={filters}
        enableRowSelection
        getRowId={(r) => r.learner_id}
        toolbarActions={({ selectedRows }) => (
          <>
            {isToday && (
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <QrCode className="h-4 w-4" /> Scan
              </button>
            )}
            {selectedRows.length > 0 && (
              <button
                type="button"
                onClick={() => exportCsv(selectedRows)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Download className="h-4 w-4" /> Export ({selectedRows.length})
              </button>
            )}
          </>
        )}
      />

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        direction={direction}
        windows={windows}
        onMarked={() => qc.invalidateQueries({ queryKey: ['boarding-roster'] })}
      />
    </div>
  );
}

function Tile({ label, value, tone, icon }: { label: string; value: number; tone: 'green' | 'gray' | 'slate'; icon: React.ReactNode }) {
  const toneCls =
    tone === 'green'
      ? 'text-green-700 dark:text-green-300'
      : tone === 'gray'
      ? 'text-gray-600 dark:text-gray-300'
      : 'text-slate-700 dark:text-slate-300';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${toneCls}`}>
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck both files**

Run: `npx tsc --noEmit 2>&1 | grep -E "boarding/attendance/(page|columns)" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Manual smoke test (user, logged-in browser)**

The boarding portal is behind the auth proxy — the agent's browser can't sign in, so the user runs this:
1. Open `/boarding/attendance`. Confirm three tiles (Marked/Unmarked/Total), the Onward/Return toggle (defaulting to the active leg), the day picker, and the booked-students table.
2. Click **Mark present** on an unmarked row → it flips to Present, tiles update.
3. Click **Scan** → the modal opens; scan a QR / type a 6-digit code → the row flips to Present behind the modal, tiles update; close the modal.
4. Toggle **Return** → table + tiles reflect the evening leg (boarding time shows evening_time).
5. Pick a **past date** → Mark buttons and the Scan button disappear (read-only).

- [ ] **Step 5: Commit**

```bash
git add app/boarding/attendance/page.tsx app/boarding/attendance/columns.tsx
git commit -m "$(cat <<'EOF'
feat(boarding): unified Attendance page — tiles, leg toggle, table, scan modal

Booked-students DataTable with Marked/Unmarked/Total tiles, an active-leg toggle,
per-row manual mark, a Scan button that opens ScanDialog, and a date picker
(today markable, past days read-only). Replaces the checklist + records split.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Delete the scan module + repoint references + nav

**Files:**
- Delete: `app/boarding/scan/page.tsx`, `components/boarding/todays-bookings.tsx`, `app/api/boarding/bookings-today/route.ts`
- Modify: `proxy.ts`, `app/auth/callback/route.ts`, `app/boarding/select-route/page.tsx`, `app/boarding/routes/page.tsx`, `app/boarding/routes/[routeId]/page.tsx`, `app/boarding/dashboard/page.tsx`, `lib/boarding/navigation.ts`, `components/boarding-bottom-nav.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: no `/boarding/scan` route or references remain.

- [ ] **Step 1: Delete the three dead files**

```bash
git rm app/boarding/scan/page.tsx components/boarding/todays-bookings.tsx app/api/boarding/bookings-today/route.ts
```

- [ ] **Step 2: Repoint the two landing redirects**

In `proxy.ts` (~line 188), change:
```ts
        if (canScan) home = '/boarding/scan';
```
to:
```ts
        if (canScan) home = '/boarding/attendance';
```

In `app/auth/callback/route.ts` (~line 125), change:
```ts
      if (canScan) home = '/boarding/scan';
```
to:
```ts
      if (canScan) home = '/boarding/attendance';
```

- [ ] **Step 3: Repoint select-route (×2)**

In `app/boarding/select-route/page.tsx` change `window.location.assign('/boarding/scan');` → `window.location.assign('/boarding/attendance');` and `router.replace('/boarding/scan')` → `router.replace('/boarding/attendance')`.

- [ ] **Step 4: Repoint the two route pages**

In `app/boarding/routes/page.tsx`, change the Scan link:
```tsx
            <Link
              href="/boarding/attendance"
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/40 backdrop-blur transition-colors hover:bg-white/30"
            >
              <ListChecks className="h-4 w-4" /> Attendance
            </Link>
```
(Replace the `<QrCode …/> Scan` link. `ListChecks` is already imported in this file; if not, add it to the `lucide-react` import and drop `QrCode` if it becomes unused.)

In `app/boarding/routes/[routeId]/page.tsx` (~line 160), change:
```tsx
        <Link href="/boarding/attendance" className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
          <ListChecks className="h-4 w-4" /> Attendance &amp; Scan
        </Link>
```
(Add `ListChecks` to this file's `lucide-react` import; remove `QrCode` if it becomes unused.)

- [ ] **Step 5: Repoint the dashboard (remove redundant Scan card + fix the header button)**

In `app/boarding/dashboard/page.tsx`, delete the redundant quick-action (the `Attendance` card already exists):
```ts
    { title: 'Scan Boarding Pass', desc: "Scan a learner's QR to mark present", icon: ScanLine, color: 'bg-gradient-to-br from-green-500 to-emerald-600', href: '/boarding/scan' },
```
Change the header button's target + label:
```tsx
          <button
            onClick={() => router.push('/boarding/attendance')}
            className="inline-flex flex-1 justify-center sm:flex-none items-center whitespace-nowrap px-4 py-2 border border-transparent rounded-lg shadow-sm bg-green-600 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            <QrCode className="w-4 h-4 mr-2" />
            <span className="sm:hidden">Attendance</span>
            <span className="hidden sm:inline">Mark Attendance</span>
          </button>
```
(If `ScanLine` becomes unused after removing the card, drop it from the `lucide-react` import. `QrCode` stays — still used on the button.)

- [ ] **Step 6: Remove the Scan nav entry**

In `lib/boarding/navigation.ts`: delete the `{ name: 'Scan', href: '/boarding/scan', icon: ScanLine }` item and the `'/boarding/scan': 'Scan Boarding Pass',` TITLES line, and remove `ScanLine` from the `lucide-react` import.

- [ ] **Step 7: Promote My Route into the bottom-nav primary slot**

In `components/boarding-bottom-nav.tsx`, change `PRIMARY_HREFS` and the doc comment:
```ts
/**
 * Mobile-only bottom navigation for the boarding-staff portal (lg:hidden).
 * Four primary destinations (Dashboard, My Route, Passengers, Attendance) plus a
 * three-dot "More" menu for the rest (Live Location, Grievances, Notifications).
 */
const PRIMARY_HREFS = [
  '/boarding/dashboard',
  '/boarding/routes',
  '/boarding/passengers',
  '/boarding/attendance',
];
```

- [ ] **Step 8: Verify no references remain + typecheck**

Run: `grep -rn "boarding/scan" app components lib proxy.ts && echo "FOUND — fix above" || echo "clean"`
Expected: `clean`.
Run: `npx tsc --noEmit 2>&1 | grep -E "boarding|proxy|auth/callback" || echo "clean"`
Expected: `clean` (no type errors from the repointed files — watch for now-unused `ScanLine`/`QrCode` imports and remove them).

- [ ] **Step 9: Commit**

```bash
git add -A -- app/boarding components/boarding-bottom-nav.tsx lib/boarding/navigation.ts proxy.ts app/auth/callback/route.ts app/api/boarding
git commit -m "$(cat <<'EOF'
feat(boarding): remove standalone scan module; fold scanning into Attendance

Delete /boarding/scan, TodaysBookings, and the now-unused bookings-today endpoint.
Repoint every remaining /boarding/scan reference (incl. the proxy + auth-callback
landing) to /boarding/attendance and promote My Route into the freed bottom-nav slot.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Marked/Unmarked/Total tiles (server-computed) | 2 (counts) + 4 (tiles) |
| Booked-students DataTable | 1 (rows) + 4 (columns/page) |
| Active-leg toggle, seeded from `activeDirection` | 4 |
| Scan button on the table → scanner modal | 3 + 4 |
| Per-row manual Mark (override, today-only) | 4 |
| Date picker, today default, past = read-only | 4 |
| Booked-only (walk-ups excluded from table/counts) | 1 (`buildRosterRows` over booked riders only) |
| Per-leg boarding time (`stop_time`/`evening_time`) | 2 (leg-resolve) + 1 (carry) |
| New `GET …/attendance/roster` | 2 |
| Delete scan page / TodaysBookings / bookings-today | 5 |
| Repoint 10 refs (incl. proxy + callback landing) | 5 |
| Promote My Route into bottom nav | 5 |
| Keep `POST /scan`, `POST /attendance`, `GET /attendance-window` | untouched (used by 3 + 4) |
| Tests: pure helper via vitest; route probe; tsc; manual | 1 / 2 / all / 4 |

All spec sections map to a task. ✔

**2. Placeholder scan:** No TBD/TODO; every code step carries complete code; commands have expected output. ✔

**3. Type consistency:** `RosterRow` (Task 1) is imported unchanged by the endpoint (Task 2), columns + page (Task 4). `getRosterColumns({ canMark, markingId, onMark })` — same names produced in Task 4's columns and consumed in Task 4's page. `ScanDialog` props `{ open, onOpenChange, direction, windows, onMarked }` — defined Task 3, consumed Task 4. `AttDirection`/`AttendanceWindows`/`isDirectionOpen`/`formatHM`/`DEFAULT_WINDOWS` all sourced from `@/lib/boarding/attendance-window`. ✔

**Note (carried from the spec):** deleting `app/boarding/scan/page.tsx` in Task 5 will merge-conflict with the parallel `feat/boarding-scan-faster-qr` branch (QR-library swap on the same file). Reconcile at merge time by porting that swap into `ScanDialog`.
