# Portal Route / Booking Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix route travel-time/distance/fare display across portals, add a boarding-dashboard today's-bookings list that opens the scanner per student, add a driver "Boardings" (booked-students) view, and show boarding-staff names on the student route page.

**Architecture:** Reuse existing tables (`tms_booking`, `tms_attendance`, `tms_staff_route_assignment`) and existing marking APIs. One shared, unit-tested helper (`lib/booking/roster.ts`) powers both the boarding today-list and the driver view. All display fixes are localized to the route-view components; the fare shown to students comes from `learners_profiles.transport_fee`, everyone else keeps `tms_route.fare`.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Supabase (service-role) · TanStack Table · Tailwind v4 · lucide-react · Vitest · react-hot-toast

**Design doc:** `docs/superpowers/specs/2026-07-10-portal-route-booking-improvements-design.md`

## Global Constraints

- **No database migration and no new permissions.** Reuse `tms.attendance.scan`, `tms.attendance.manage`, `tms.driver.self.view`, `tms.passenger.self.view` from `lib/constants/tms-permissions.ts` (`TMS_PERMISSIONS`).
- **`tms_route.duration` is TEXT** (e.g. `"1h 25m"`) — never do minutes math on it; render the raw string.
- **`tms_route.distance` / `tms_route.fare` are `0` for ~23 of 24 routes** — show `—` when `<= 0`, never `"0 km"` / `"₹0"`.
- **Student fare = `learners_profiles.transport_fee`.** Driver / boarding / admin fare = `tms_route.fare`.
- **`@/` path alias breaks Vitest** — use RELATIVE imports inside `*.test.ts` files (per project memory).
- **ESLint is broken** in this repo — verify with `npx tsc --noEmit` (confirm no NEW errors in changed files) and, where a dev server is available, curl route probes (auth-gated routes return 307/401/403 headless).
- **Chunk large `.in()` lists to ≤150 ids** (API-gateway limit).
- **"Today" = `istToday()`** from `lib/booking/window.ts` (IST +05:30), for all new code.
- Commit after each task with the exact message shown. Add only the files named in the task (`git add <paths>`), never `git add -A` (parallel sessions share this tree).

---

## File Structure

**New files**
- `lib/booking/roster.ts` — shared: `loadBookedRoster()` (DB) + `groupRosterByStop()` (pure).
- `lib/booking/roster.test.ts` — Vitest for `groupRosterByStop`.
- `lib/routes/boarding-staff.ts` — `getBoardingStaffForRoute()` resolver (route → supervisor names).
- `app/api/driver/roster/route.ts` — `GET /api/driver/roster?date=` (driver booked students).
- `app/api/boarding/bookings-today/route.ts` — `GET /api/boarding/bookings-today?date=` (assigned-routes bookings).
- `app/driver/boardings/page.tsx` — driver "Boardings" page.
- `components/boarding/todays-bookings.tsx` — dashboard "Today's Bookings" section.

**Modified files**
- `lib/routes/detail.ts` — `duration` type → `string`.
- `components/routes/route-ticket.tsx` — duration text + distance/fare zero-guard.
- `components/driver/route-card.tsx` — distance/fare zero-guard.
- `app/api/student/route/route.ts` — `duration` type → string; add `transportFee` + `boardingStaff`.
- `app/student/routes/page.tsx` — duration text, distance/fare zero-guard, fare = transport fee, boarding-staff card.
- `app/(admin)/routes/columns.tsx` — Distance / Travel time / Fare columns.
- `app/boarding/dashboard/page.tsx` — render `<TodaysBookings/>`.
- `app/boarding/scan/page.tsx` — pre-selected-learner mode.
- `lib/driver/navigation.ts` — "Boardings" nav entry.

---

## Task 1: Shared route views — duration as text + distance/fare zero-guard

Fixes the boarding "My Route" (`RouteTicket`) and driver route card so travel time renders the raw `duration` text and distance/fare show `—` when empty.

**Files:**
- Modify: `lib/routes/detail.ts:36` and `:53`
- Modify: `components/routes/route-ticket.tsx:24-31,34,167,168`
- Modify: `components/driver/route-card.tsx:123,124`

**Interfaces:**
- Produces: `RouteDetail.duration: string | null` (was `number | null`) — consumed by `components/routes/route-ticket.tsx` only.

- [ ] **Step 1: Retype `duration` in the detail lib**

In `lib/routes/detail.ts`, change the two `duration` field types from `number | null` to `string | null`.

Line 36 (inside `interface RouteDetail`):
```ts
  distance: number | null;
  duration: string | null;
  fare: number | null;
```
Line 53 (inside `interface RouteRow`):
```ts
  distance: number | null;
  duration: string | null;
  fare: number | null;
```
(No other change — the mapping `duration: r.duration` at line 160 already passes it through.)

- [ ] **Step 2: Render duration as text + guard distance/fare in `RouteTicket`**

In `components/routes/route-ticket.tsx`, replace the `fmtDuration` and `fmtDistance` helpers (lines 24-35):
```ts
function fmtDuration(d: string | null): string {
  return d?.trim() || '—';
}

function fmtDistance(km: number | null): string {
  return km == null || km <= 0 ? '—' : `${km} km`;
}
```
Then update the Fare stat (line 167) to guard zero:
```tsx
          <Stat icon={IndianRupee} label="Fare" value={route.fare != null && route.fare > 0 ? `₹${route.fare}` : '—'} tone="bg-gradient-to-br from-orange-500 to-amber-600" />
```
(The Distance stat at line 168 and both Travel-time usages already call `fmtDistance` / `fmtDuration`, so they inherit the fix.)

- [ ] **Step 3: Guard distance/fare zero in the driver route card**

In `components/driver/route-card.tsx`, update the Fare and Distance stats (lines 123-124):
```tsx
        <Stat icon={IndianRupee} label="Fare" value={route.fare != null && route.fare > 0 ? `₹${route.fare}` : '—'} tone="orange" />
        <Stat icon={Milestone} label="Distance" value={route.distance != null && route.distance > 0 ? `${route.distance} km` : '—'} tone="blue" />
```
(Duration at line 125 already renders `route.duration ?? '—'` raw — no change.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/routes/detail.ts`, `components/routes/route-ticket.tsx`, `components/driver/route-card.tsx`.

- [ ] **Step 5: Commit**

```bash
git add lib/routes/detail.ts components/routes/route-ticket.tsx components/driver/route-card.tsx
git commit -m "fix(routes): render duration text + hide 0 distance/fare in shared route views"
```

---

## Task 2: Student route view — duration text, distance/fare guard, fare = transport fee

The student route page uses its own local types (not `RouteDetail`), so it is fixed here. The fare shown becomes the learner's `transport_fee`.

**Files:**
- Modify: `app/api/student/route/route.ts:21,108-136`
- Modify: `app/student/routes/page.tsx:28,35-38,61-73,274,280,286`

**Interfaces:**
- Consumes: `getLearnerRowForUser(auth)` returns `LearnerRow` which already includes `transport_fee: number | null` (from `LEARNER_SELECT`).
- Produces: `GET /api/student/route` response `data.transportFee: number | null`.

- [ ] **Step 1: API — retype duration + return `transportFee`**

In `app/api/student/route/route.ts`:

Change `interface RouteRow` `duration` (line 21) from `number | null` to:
```ts
  duration: string | null;
```
Add `transportFee` to the success response. Replace the final `return NextResponse.json({...})` `data` object (lines 108-136) so the top-level `data` also carries `transportFee` (from the learner row resolved at line 48):
```ts
    return NextResponse.json({
      success: true,
      data: {
        boardingStopId,
        transportFee: learner.transport_fee,
        route: {
          id: route.id,
          routeNumber: route.route_number,
          routeName: route.route_name,
          startLocation: route.start_location,
          endLocation: route.end_location,
          departureTime: route.departure_time,
          arrivalTime: route.arrival_time,
          distance: route.distance,
          duration: route.duration,
          fare: route.fare,
          status: route.status,
          driverName,
          vehicle,
          stops: stops.map((s) => ({
            id: s.id,
            name: s.stop_name,
            time: s.stop_time,
            eveningTime: s.evening_time,
            order: s.sequence_order,
            isMajor: s.is_major_stop,
          })),
        },
      },
    });
```

- [ ] **Step 2: Page — retype duration + thread `transportFee`**

In `app/student/routes/page.tsx`:

Change `RouteData.duration` (line 28) to:
```ts
  duration: string | null;
```
Change the `RouteResp` type (lines 35-38) to include `transportFee`:
```ts
type RouteResp = {
  data?: { route: RouteData | null; boardingStopId: string | null; transportFee: number | null };
  notFound?: boolean;
};
```
Replace the `fmtDuration` and `fmtDistance` helpers (lines 61-73):
```ts
function fmtDuration(d: string | null): string {
  return d?.trim() || '—';
}

function fmtDistance(km: number | null): string {
  if (km == null || km <= 0) return '—';
  return `${km} km`;
}
```

- [ ] **Step 3: Page — fare stat uses transport fee**

Still in `app/student/routes/page.tsx`, after `const boardingStopId = data?.data?.boardingStopId ?? null;` (line 182) add:
```ts
  const transportFee = data?.data?.transportFee ?? null;
```
Then change the Fare `Stat` (line 274) from `route.fare` to the transport fee:
```tsx
          <Stat
            icon={IndianRupee}
            label="Fare"
            value={transportFee != null && transportFee > 0 ? `₹${transportFee}` : '—'}
            tone="bg-gradient-to-br from-orange-500 to-amber-600"
          />
```
(Distance stat at line 280 and Travel-time at 286 already call the fixed helpers.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/api/student/route/route.ts`, `app/student/routes/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/api/student/route/route.ts app/student/routes/page.tsx
git commit -m "feat(student): route shows transport fee, text travel time, guarded distance"
```

---

## Task 3: Admin routes list — Distance / Travel time / Fare columns

**Files:**
- Modify: `app/(admin)/routes/columns.tsx:128` (insert three columns after the `timing` column)

**Interfaces:**
- Consumes: `RouteRow` already has `distance?: number | string`, `duration?: string`, `fare?: number | string` (lines 26-32); the list API selects `*`.

- [ ] **Step 1: Add the three columns**

In `app/(admin)/routes/columns.tsx`, immediately after the `timing` column object closes (the `},` on line 128, before the `stops` column at line 129), insert:
```tsx
    {
      id: 'distance',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Distance" />,
      accessorFn: (r) => Number(r.distance) || 0,
      size: 100,
      cell: ({ row }) => {
        const d = Number(row.original.distance);
        return (
          <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">
            {d > 0 ? `${d} km` : '—'}
          </span>
        );
      },
    },
    {
      id: 'duration',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Travel time" />,
      accessorFn: (r) => r.duration ?? '',
      enableSorting: false,
      size: 110,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
          {row.original.duration?.trim() || '—'}
        </span>
      ),
    },
    {
      id: 'fare',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fare" />,
      accessorFn: (r) => Number(r.fare) || 0,
      size: 100,
      cell: ({ row }) => {
        const f = Number(row.original.fare);
        return (
          <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">
            {f > 0 ? `₹${f}` : '—'}
          </span>
        );
      },
    },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/(admin)/routes/columns.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/routes/columns.tsx"
git commit -m "feat(admin): show distance, travel time, fare columns in routes list"
```

---

## Task 4: Shared roster helper `lib/booking/roster.ts` (TDD)

The pure `groupRosterByStop` is unit-tested first; `loadBookedRoster` is the DB companion.

**Files:**
- Create: `lib/booking/roster.ts`
- Test: `lib/booking/roster.test.ts`

**Interfaces:**
- Produces:
  - `interface RosterRider { learner_id: string; name: string; roll: string | null; stop_id: string | null }`
  - `interface OrderedStop { id: string; name: string; time: string | null; order: number | null }`
  - `interface RosterStopGroup { stop_id: string | null; stop_name: string; stop_time: string | null; count: number; riders: RosterRider[] }`
  - `loadBookedRoster(svc, routeId, date): Promise<{ counts: { booked: number; capacity: number }; riders: RosterRider[] }>`
  - `groupRosterByStop(riders: RosterRider[], orderedStops: OrderedStop[]): RosterStopGroup[]`

- [ ] **Step 1: Write the failing test**

Create `lib/booking/roster.test.ts` (RELATIVE import — `@/` breaks vitest):
```ts
import { describe, it, expect } from 'vitest';
import { groupRosterByStop, type RosterRider, type OrderedStop } from './roster';

const stops: OrderedStop[] = [
  { id: 's2', name: 'Second', time: '07:20', order: 2 },
  { id: 's1', name: 'First', time: '07:00', order: 1 },
];
const rider = (learner_id: string, roll: string | null, stop_id: string | null, name = 'X'): RosterRider =>
  ({ learner_id, roll, stop_id, name });

describe('groupRosterByStop', () => {
  it('orders groups by stop sequence, not input order', () => {
    const groups = groupRosterByStop([rider('a', '10', 's2'), rider('b', '20', 's1')], stops);
    expect(groups.map((g) => g.stop_id)).toEqual(['s1', 's2']);
  });

  it('skips stops that have no riders', () => {
    const groups = groupRosterByStop([rider('a', '10', 's1')], stops);
    expect(groups.map((g) => g.stop_id)).toEqual(['s1']);
  });

  it('places the "Stop not set" bucket last for null/unknown stop ids', () => {
    const groups = groupRosterByStop(
      [rider('a', '10', 's1'), rider('b', '20', null), rider('c', '30', 'ghost')],
      stops
    );
    expect(groups.map((g) => g.stop_id)).toEqual(['s1', null]);
    const last = groups[groups.length - 1];
    expect(last.stop_name).toBe('Stop not set');
    expect(last.count).toBe(2);
  });

  it('sorts riders within a stop by roll then name (numeric-aware)', () => {
    const groups = groupRosterByStop(
      [rider('a', '100', 's1', 'Zoe'), rider('b', '20', 's1', 'Ann'), rider('c', null, 's1', 'Bob')],
      stops
    );
    expect(groups[0].riders.map((r) => r.learner_id)).toEqual(['b', 'a', 'c']);
  });

  it('returns an empty array for empty input', () => {
    expect(groupRosterByStop([], stops)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx vitest run lib/booking/roster.test.ts`
Expected: FAIL — cannot find module `./roster` / `groupRosterByStop is not a function`.

- [ ] **Step 3: Implement `lib/booking/roster.ts`**

Create `lib/booking/roster.ts`:
```ts
/**
 * Shared "who booked today" roster helper. Powers the boarding dashboard's
 * today's-bookings list and the driver Boardings view. `groupRosterByStop` is a
 * pure, unit-tested transform; `loadBookedRoster` is its DB companion.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { bookedCount, routeCapacity } from '@/lib/booking/repo';

export interface RosterRider {
  learner_id: string;
  name: string;
  roll: string | null;
  stop_id: string | null;
}

export interface OrderedStop {
  id: string;
  name: string;
  time: string | null;
  order: number | null;
}

export interface RosterStopGroup {
  stop_id: string | null;
  stop_name: string;
  stop_time: string | null;
  count: number;
  riders: RosterRider[];
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

/** Split an id list into ≤150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Today's booked riders for one route: reads tms_booking by route_id + travel_date,
 * denormalizes learner name/roll (chunked .in()), plus booked/capacity counts.
 * 42P01-safe: empty roster + zero counts if tms_booking is absent.
 */
export async function loadBookedRoster(
  svc: SupabaseClient,
  routeId: string,
  date: string
): Promise<{ counts: { booked: number; capacity: number }; riders: RosterRider[] }> {
  const { data: bookings, error } = await svc
    .from('tms_booking')
    .select('learner_id, stop_id')
    .eq('route_id', routeId)
    .eq('travel_date', date);
  if (error) {
    if (isMissingTable(error)) return { counts: { booked: 0, capacity: 0 }, riders: [] };
    throw error;
  }

  const stopByLearner = new Map<string, string | null>();
  for (const b of (bookings ?? []) as { learner_id: string; stop_id: string | null }[]) {
    stopByLearner.set(b.learner_id, b.stop_id ?? null);
  }
  const ids = [...stopByLearner.keys()];

  const info = new Map<string, { name: string; roll: string | null }>();
  for (const c of chunk(ids)) {
    const { data } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .in('id', c);
    for (const l of (data ?? []) as Array<{
      id: string; first_name: string | null; last_name: string | null; roll_number: string | null;
    }>) {
      info.set(l.id, {
        name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner',
        roll: l.roll_number,
      });
    }
  }

  const riders: RosterRider[] = ids.map((id) => ({
    learner_id: id,
    name: info.get(id)?.name ?? 'Learner',
    roll: info.get(id)?.roll ?? null,
    stop_id: stopByLearner.get(id) ?? null,
  }));

  const [booked, capacity] = await Promise.all([
    bookedCount(svc, routeId, date),
    routeCapacity(svc, routeId),
  ]);
  return { counts: { booked, capacity }, riders };
}

/**
 * Pure: group riders by stop in the route's pickup order. Stops with no riders are
 * skipped; riders whose stop_id is null or not in `orderedStops` fall into a trailing
 * "Stop not set" bucket. Riders within a stop are sorted by roll then name.
 */
export function groupRosterByStop(
  riders: RosterRider[],
  orderedStops: OrderedStop[]
): RosterStopGroup[] {
  const UNSET = '__unset__';
  const known = new Set(orderedStops.map((s) => s.id));
  const byStop = new Map<string, RosterRider[]>();
  for (const r of riders) {
    const key = r.stop_id && known.has(r.stop_id) ? r.stop_id : UNSET;
    const arr = byStop.get(key) ?? [];
    arr.push(r);
    byStop.set(key, arr);
  }

  const sortRiders = (a: RosterRider, b: RosterRider) =>
    (a.roll ?? a.name).localeCompare(b.roll ?? b.name, undefined, { numeric: true });

  const groups: RosterStopGroup[] = [];
  for (const s of [...orderedStops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const rs = byStop.get(s.id);
    if (!rs || rs.length === 0) continue;
    groups.push({ stop_id: s.id, stop_name: s.name, stop_time: s.time, count: rs.length, riders: rs.sort(sortRiders) });
  }
  const unset = byStop.get(UNSET);
  if (unset && unset.length > 0) {
    groups.push({ stop_id: null, stop_name: 'Stop not set', stop_time: null, count: unset.length, riders: unset.sort(sortRiders) });
  }
  return groups;
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx vitest run lib/booking/roster.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → no errors in the new files.
```bash
git add lib/booking/roster.ts lib/booking/roster.test.ts
git commit -m "feat(booking): shared booked-roster helper (loadBookedRoster + groupRosterByStop)"
```

---

## Task 5: Driver roster API `GET /api/driver/roster`

**Files:**
- Create: `app/api/driver/roster/route.ts`

**Interfaces:**
- Consumes: `getDriverForUser` (`lib/driver/identity.ts`), `getDriverRoutes` (`lib/driver/routes.ts`, each route has `.id`, `.label`, `.stops: [{id,name,time,order,...}]`), `loadBookedRoster` + `groupRosterByStop` + `OrderedStop` (Task 4), `istToday` (`lib/booking/window.ts`), `TMS_PERMISSIONS.DRIVER_SELF_VIEW`.
- Produces: `{ success, data: { date, routes: [{ id, label, counts:{booked,capacity}, stops: RosterStopGroup[] }] } }`.

- [ ] **Step 1: Create the route**

Create `app/api/driver/roster/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { loadBookedRoster, groupRosterByStop, type OrderedStop } from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * GET /api/driver/roster?date=YYYY-MM-DD — the students who BOOKED today (or the
 * given date) on the signed-in driver's route(s), grouped by boarding stop in
 * pickup order. Authority boundary: routes derive from the driver's identity via
 * getDriverRoutes, never from input, so a driver only ever sees their own routes.
 */
async function getRoster(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
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

    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);
    const svc = createServiceRoleClient();

    const out: Array<{
      id: string; label: string; counts: { booked: number; capacity: number };
      stops: ReturnType<typeof groupRosterByStop>;
    }> = [];
    for (const rt of routes) {
      const { counts, riders } = await loadBookedRoster(svc, rt.id, date);
      const orderedStops: OrderedStop[] = rt.stops.map((s) => ({ id: s.id, name: s.name, time: s.time, order: s.order }));
      out.push({ id: rt.id, label: rt.label, counts, stops: groupRosterByStop(riders, orderedStops) });
    }

    return NextResponse.json({ success: true, data: { date, routes: out } });
  } catch (e) {
    console.error('driver/roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRoster(request, auth));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/api/driver/roster/route.ts`.

- [ ] **Step 3: Route probe (if a dev server is running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/driver/roster"`
Expected: `307` (redirect to login) or `401`/`403` — NOT `404`/`500`. (Full behavior is verified on a real driver login by the user.)

- [ ] **Step 4: Commit**

```bash
git add app/api/driver/roster/route.ts
git commit -m "feat(driver): GET /api/driver/roster — today's booked students by stop"
```

---

## Task 6: Driver "Boardings" page + nav entry

**Files:**
- Create: `app/driver/boardings/page.tsx`
- Modify: `lib/driver/navigation.ts:1,18`

**Interfaces:**
- Consumes: `GET /api/driver/roster?date=` (Task 5); `istToday`, `addDays` (`lib/booking/window.ts`).

- [ ] **Step 1: Create the page**

Create `app/driver/boardings/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { istToday, addDays } from '@/lib/booking/window';

interface Rider { learner_id: string; name: string; roll: string | null }
interface StopGroup { stop_id: string | null; stop_name: string; stop_time: string | null; count: number; riders: Rider[] }
interface RouteBlock { id: string; label: string; counts: { booked: number; capacity: number }; stops: StopGroup[] }

const fmtDateLong = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export default function DriverBoardingsPage() {
  const today = istToday();
  const [date, setDate] = useState<string>(() => today);
  const [routes, setRoutes] = useState<RouteBlock[] | null>(null);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/driver/roster?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load boardings');
        const rs = json.data.routes as RouteBlock[];
        setRoutes(rs);
        setActiveRoute((prev) => (prev && rs.some((r) => r.id === prev) ? prev : rs[0]?.id ?? null));
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load boardings';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  const isToday = date === today;
  const current = routes?.find((r) => r.id === activeRoute) ?? routes?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Date controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
          <button type="button" aria-label="Previous day" onClick={() => setDate((d) => addDays(d, -1))} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || today)} aria-label="Boardings date" className="cursor-pointer border-0 bg-transparent px-1 text-sm font-medium text-gray-900 focus:outline-none dark:text-gray-100" />
          <button type="button" aria-label="Next day" onClick={() => setDate((d) => addDays(d, 1))} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {!isToday && (
          <button type="button" onClick={() => setDate(today)} className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-300">
            Today
          </button>
        )}
        <span className="text-sm text-gray-500">{fmtDateLong(date)}</span>
      </div>

      {/* Route selector (multi-route drivers) */}
      {routes && routes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {routes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveRoute(r.id)}
              className={[
                'rounded-full px-3 py-1 text-sm font-medium',
                activeRoute === r.id ? 'bg-green-600 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{error}</div>
      ) : !current ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">No route assigned to you.</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="min-w-0 truncate text-base font-semibold text-gray-900 dark:text-white">{current.label}</p>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
              <Users className="h-4 w-4" /> {current.counts.booked} booked / {current.counts.capacity} seats
            </span>
          </div>

          {current.stops.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              No students have booked for this day yet.
            </div>
          ) : (
            current.stops.map((st) => (
              <div key={st.stop_id ?? 'unset'} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {st.stop_name}{st.stop_time ? ` · ${st.stop_time.slice(0, 5)}` : ''}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">{st.count} boarding</span>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {st.riders.map((r) => (
                    <li key={r.learner_id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate text-gray-900 dark:text-gray-100">{r.name}</span>
                      {r.roll && <span className="shrink-0 text-gray-400">· {r.roll}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the nav entry**

In `lib/driver/navigation.ts`, add `ClipboardList` to the lucide import (line 1):
```ts
import { LayoutDashboard, Route, Users, MapPin, MessageCircle, User, Bell, ClipboardList } from 'lucide-react';
```
Then insert a "Boardings" item after the Passengers item (line 18):
```ts
  { name: 'Passengers', shortName: 'Riders', href: '/driver/passengers', icon: Users },
  { name: 'Boardings', shortName: 'Boarding', href: '/driver/boardings', icon: ClipboardList },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/driver/boardings/page.tsx`, `lib/driver/navigation.ts`.

- [ ] **Step 4: Route probe (if a dev server is running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/driver/boardings"`
Expected: `200` (client shell) or `307` — NOT `404`/`500`.

- [ ] **Step 5: Commit**

```bash
git add app/driver/boardings/page.tsx lib/driver/navigation.ts
git commit -m "feat(driver): Boardings page — today's booked students, with nav entry"
```

---

## Task 7: Boarding today's-bookings API `GET /api/boarding/bookings-today`

**Files:**
- Create: `app/api/boarding/bookings-today/route.ts`

**Interfaces:**
- Consumes: `getAssignedRouteIdsForUser` (`lib/boarding/identity.ts`), `loadBookedRoster` + `groupRosterByStop` + `OrderedStop` (Task 4), `istToday`, `TMS_PERMISSIONS.ATTENDANCE_SCAN`.
- Produces: `{ success, data: { date, routes: [{ id, label, counts, stops: RosterStopGroup[] }] } }`.

- [ ] **Step 1: Create the route**

Create `app/api/boarding/bookings-today/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { loadBookedRoster, groupRosterByStop, type OrderedStop } from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteRow { id: string; route_number: string | null; route_name: string | null }
interface StopRow { id: string; route_id: string; stop_name: string; stop_time: string | null; sequence_order: number | null }

/**
 * GET /api/boarding/bookings-today?date=YYYY-MM-DD — students who booked today
 * across the signed-in staff's assigned route(s), grouped by boarding stop. Same
 * authority boundary as the roster route (assigned routes only; super admins see all).
 */
async function getBookingsToday(request: NextRequest, auth: AuthContext) {
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

    const svc = createServiceRoleClient();

    let routeIds = await getAssignedRouteIdsForUser(auth);
    if (routeIds.length === 0 && auth.isSuperAdmin) {
      const { data } = await svc.from('tms_route').select('id');
      routeIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }
    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, data: { date, routes: [] } });
    }

    const { data: routeData } = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .in('id', routeIds)
      .order('route_number', { ascending: true });
    const routes = (routeData ?? []) as RouteRow[];

    const { data: stopData } = await svc
      .from('tms_route_stop')
      .select('id, route_id, stop_name, stop_time, sequence_order')
      .in('route_id', routeIds)
      .order('sequence_order', { ascending: true });
    const stopsByRoute = new Map<string, OrderedStop[]>();
    for (const s of (stopData ?? []) as StopRow[]) {
      const arr = stopsByRoute.get(s.route_id) ?? [];
      arr.push({ id: s.id, name: s.stop_name, time: s.stop_time, order: s.sequence_order });
      stopsByRoute.set(s.route_id, arr);
    }

    const out: Array<{
      id: string; label: string; counts: { booked: number; capacity: number };
      stops: ReturnType<typeof groupRosterByStop>;
    }> = [];
    for (const rt of routes) {
      const { counts, riders } = await loadBookedRoster(svc, rt.id, date);
      out.push({
        id: rt.id,
        label: `${rt.route_number ?? '?'} · ${rt.route_name ?? ''}`.trim(),
        counts,
        stops: groupRosterByStop(riders, stopsByRoute.get(rt.id) ?? []),
      });
    }

    return NextResponse.json({ success: true, data: { date, routes: out } });
  } catch (e) {
    console.error('boarding bookings-today error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getBookingsToday(request, auth));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/api/boarding/bookings-today/route.ts`.

- [ ] **Step 3: Route probe (if a dev server is running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/boarding/bookings-today"`
Expected: `307`/`401`/`403` — NOT `404`/`500`.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/bookings-today/route.ts
git commit -m "feat(boarding): GET /api/boarding/bookings-today — assigned-route bookings by stop"
```

---

## Task 8: Boarding dashboard "Today's Bookings" section

Adds a self-fetching component and renders it on the dashboard. Each student row links to the scanner (`/boarding/scan?...`) — consumed by Task 9.

**Files:**
- Create: `components/boarding/todays-bookings.tsx`
- Modify: `app/boarding/dashboard/page.tsx:10,296`

**Interfaces:**
- Consumes: `GET /api/boarding/bookings-today` (Task 7).
- Produces: student rows link to `/boarding/scan?learner=<id>&route=<routeId>&name=<name>&roll=<roll>&stop=<stopName>` (URL-encoded). Task 9 reads these params.

- [ ] **Step 1: Create the component**

Create `components/boarding/todays-bookings.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ChevronRight, Users } from 'lucide-react';

interface Rider { learner_id: string; name: string; roll: string | null }
interface StopGroup { stop_id: string | null; stop_name: string; stop_time: string | null; count: number; riders: Rider[] }
interface RouteBlock { id: string; label: string; counts: { booked: number; capacity: number }; stops: StopGroup[] }

/** Deep-link a booked student to the scanner, pre-selected for a one-tap mark. */
function scanHref(routeId: string, r: Rider, stopName: string): string {
  const p = new URLSearchParams({ learner: r.learner_id, route: routeId, name: r.name });
  if (r.roll) p.set('roll', r.roll);
  if (stopName) p.set('stop', stopName);
  return `/boarding/scan?${p.toString()}`;
}

export default function TodaysBookings() {
  const [routes, setRoutes] = useState<RouteBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/boarding/bookings-today', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load bookings');
        setRoutes(json.data.routes as RouteBlock[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load bookings');
      }
    })();
  }, []);

  const totalBooked = (routes ?? []).reduce((n, r) => n + r.counts.booked, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
            <CalendarCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Today&apos;s Bookings</h3>
        </div>
        <span className="text-sm text-gray-500">{totalBooked} booked</span>
      </div>
      <div className="space-y-6 p-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !routes ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : totalBooked === 0 ? (
          <p className="text-sm text-gray-500">No students have booked for today yet.</p>
        ) : (
          routes
            .filter((r) => r.stops.length > 0)
            .map((rt) => (
              <div key={rt.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{rt.label}</p>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3.5 w-3.5" /> {rt.counts.booked}/{rt.counts.capacity}
                  </span>
                </div>
                {rt.stops.map((st) => (
                  <div key={st.stop_id ?? 'unset'} className="rounded-lg border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
                      <span className="min-w-0 truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                        {st.stop_name}{st.stop_time ? ` · ${st.stop_time.slice(0, 5)}` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">{st.count}</span>
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {st.riders.map((r) => (
                        <li key={r.learner_id}>
                          <Link href={scanHref(rt.id, r, st.stop_name)} className="flex items-center justify-between px-3 py-2 hover:bg-green-50 dark:hover:bg-green-950/20">
                            <span className="min-w-0 truncate text-sm text-gray-900 dark:text-gray-100">
                              {r.name}{r.roll ? <span className="text-gray-500"> · {r.roll}</span> : null}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it on the dashboard**

In `app/boarding/dashboard/page.tsx`, add the import after line 10 (`import UniversalStatCard ...`):
```tsx
import TodaysBookings from '@/components/boarding/todays-bookings';
```
Then render it just before the final closing `</div>` of the page — i.e. immediately after the "3-panel row" block closes (after line 296, the `</div>` that closes `grid ... lg:grid-cols-3`, and before the outer container's closing `</div>` on line 297):
```tsx
      {/* Today's bookings → tap a student to open the scanner */}
      <TodaysBookings />
    </div>
  );
}
```
(Replace the existing closing `</div>\n  );\n}` at lines 296-299 with the block above — the `<TodaysBookings />` sits inside the outer `space-y-8` container so it stacks below the 3-panel row.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/boarding/todays-bookings.tsx`, `app/boarding/dashboard/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/boarding/todays-bookings.tsx app/boarding/dashboard/page.tsx
git commit -m "feat(boarding): dashboard Today's Bookings list, tap a student to scan"
```

---

## Task 9: Scan page pre-selected-learner mode

When `/boarding/scan` is opened with `?learner=&route=` (from Task 8), show a confirm card that marks that student present via the existing manual-mark API. The camera scanner stays intact.

**Files:**
- Modify: `app/boarding/scan/page.tsx:29-45,174-176`

**Interfaces:**
- Consumes: `POST /api/boarding/attendance` with `{ routeId, direction, marks: [{ learnerId, status: 'present' }] }` (existing; gated on `tms.attendance.manage`, re-verifies staff↔route assignment + learner-on-route server-side).

- [ ] **Step 1: Read the query params + add the mark handler**

In `app/boarding/scan/page.tsx`, inside the `BoardingScanPage` component, after the existing state declarations (after line 35, `const [, setTick] = useState(0);`), add:
```tsx
  const [preselect, setPreselect] = useState<
    { learner: string; route: string; name: string; roll: string | null; stop: string | null } | null
  >(null);

  // Read a deep-linked learner from the URL (from the dashboard's Today's Bookings
  // list). Client-only (window.location) so the page needs no Suspense boundary.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const learner = p.get('learner');
    const route = p.get('route');
    if (learner && route) {
      setPreselect({ learner, route, name: p.get('name') ?? 'Learner', roll: p.get('roll'), stop: p.get('stop') });
    }
  }, []);

  async function markPreselected(dir: AttDirection) {
    if (!preselect) return;
    try {
      const res = await fetch('/api/boarding/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ routeId: preselect.route, direction: dir, marks: [{ learnerId: preselect.learner, status: 'present' }] }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to mark present');
      setResult({ ok: true, learner: { name: preselect.name, rollNumber: preselect.roll }, direction: dir });
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'Failed to mark present' });
    }
  }
```

- [ ] **Step 2: Render the confirm card**

Still in `app/boarding/scan/page.tsx`, immediately after the opening `<div className="max-w-md mx-auto space-y-4">` and the `<h1>` (after line 176), insert the pre-selected card:
```tsx
      {preselect && (
        <Card className="border-green-400">
          <CardContent className="space-y-3 py-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Selected learner</p>
              <p className="text-base font-semibold">
                {preselect.name}{preselect.roll ? ` · ${preselect.roll}` : ''}
              </p>
              {preselect.stop && <p className="text-xs text-gray-500">Stop: {preselect.stop}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => markPreselected('onward')} disabled={!onwardOpen}>
                Mark present · Onward
              </Button>
              <Button onClick={() => markPreselected('return')} disabled={!returnOpen}>
                Mark present · Return
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Or scan the learner&apos;s QR pass below to verify identity.
            </p>
          </CardContent>
        </Card>
      )}
```
(`onwardOpen` / `returnOpen` are already computed at lines 70-71; `AttDirection` is already imported at line 15.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/boarding/scan/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/boarding/scan/page.tsx
git commit -m "feat(boarding): scan page pre-selected-learner mode (one-tap mark present)"
```

---

## Task 10: Boarding-staff resolver `lib/routes/boarding-staff.ts`

**Files:**
- Create: `lib/routes/boarding-staff.ts`

**Interfaces:**
- Produces: `interface BoardingStaffMember { name: string; email: string }` and `getBoardingStaffForRoute(svc, routeId): Promise<BoardingStaffMember[]>`.

- [ ] **Step 1: Create the resolver**

Create `lib/routes/boarding-staff.ts`:
```ts
/**
 * Boarding supervisors assigned to a route. The link is tms_staff_route_assignment
 * (keyed by lowercase staff_email; see lib/boarding/identity.ts). Each email is
 * resolved to a display name via `staff` (first+last), falling back to
 * `profiles.full_name`, then the email itself. 42P01-safe.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BoardingStaffMember {
  name: string;
  email: string;
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

export async function getBoardingStaffForRoute(
  svc: SupabaseClient,
  routeId: string
): Promise<BoardingStaffMember[]> {
  const { data, error } = await svc
    .from('tms_staff_route_assignment')
    .select('staff_email')
    .eq('route_id', routeId)
    .eq('is_active', true);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  const emails = [
    ...new Set(
      ((data ?? []) as { staff_email: string | null }[])
        .map((r) => r.staff_email?.toLowerCase())
        .filter((e): e is string => !!e)
    ),
  ];
  if (emails.length === 0) return [];

  const nameByEmail = new Map<string, string>();

  const { data: staff } = await svc
    .from('staff')
    .select('email, first_name, last_name')
    .in('email', emails);
  for (const s of (staff ?? []) as Array<{ email: string | null; first_name: string | null; last_name: string | null }>) {
    const key = s.email?.toLowerCase();
    if (!key) continue;
    const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
    if (name) nameByEmail.set(key, name);
  }

  const unresolved = emails.filter((e) => !nameByEmail.has(e));
  if (unresolved.length > 0) {
    const { data: profs } = await svc.from('profiles').select('email, full_name').in('email', unresolved);
    for (const p of (profs ?? []) as Array<{ email: string | null; full_name: string | null }>) {
      const key = p.email?.toLowerCase();
      if (key && p.full_name) nameByEmail.set(key, p.full_name);
    }
  }

  return emails.map((email) => ({ name: nameByEmail.get(email) ?? email, email }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/routes/boarding-staff.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/routes/boarding-staff.ts
git commit -m "feat(routes): resolver for a route's boarding-staff names"
```

---

## Task 11: Student route — boarding-staff card

Builds on Task 2's version of the two student files.

**Files:**
- Modify: `app/api/student/route/route.ts:1-5,108-136` (add resolver call + `boardingStaff` field)
- Modify: `app/student/routes/page.tsx:19-34,440` (add `boardingStaff` type + sidebar card)

**Interfaces:**
- Consumes: `getBoardingStaffForRoute` (Task 10).

- [ ] **Step 1: API — resolve + return `boardingStaff`**

In `app/api/student/route/route.ts`, add the import near the top (after line 4):
```ts
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
```
After the `driverName` resolution block ends (line 106, before the final `return NextResponse.json`), add:
```ts
    const boardingStaff = await getBoardingStaffForRoute(svc, route.id);
```
Then add `boardingStaff` into the returned `route` object (inside the `data.route` object created in Task 2, e.g. after `driverName,`):
```ts
          driverName,
          boardingStaff,
          vehicle,
```

- [ ] **Step 2: Page — type + sidebar card**

In `app/student/routes/page.tsx`, add `boardingStaff` to the `RouteData` interface (after `driverName` on line 31):
```ts
  driverName: string | null;
  boardingStaff: { name: string; email: string }[];
```
Then add a "Boarding staff" card immediately after the Driver card closes (after line 440, before the Vehicle card at line 442):
```tsx
          <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-lg">
              <Users className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Boarding staff
              </p>
              {route.boardingStaff && route.boardingStaff.length > 0 ? (
                <ul className="mt-0.5 space-y-0.5">
                  {route.boardingStaff.map((s) => (
                    <li key={s.email} className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {s.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base font-semibold text-gray-900 dark:text-white">Not assigned</p>
              )}
            </div>
          </div>
```
(`Users` is already imported on line 6.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/api/student/route/route.ts`, `app/student/routes/page.tsx`.

- [ ] **Step 4: Route probe (if a dev server is running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/student/route"`
Expected: `307`/`401`/`403` — NOT `500`.

- [ ] **Step 5: Commit**

```bash
git add app/api/student/route/route.ts app/student/routes/page.tsx
git commit -m "feat(student): show route boarding-staff names in the sidebar"
```

---

## Final verification (after all tasks)

- [ ] Run the full unit suite for the new helper: `npx vitest run lib/booking/roster.test.ts` → PASS.
- [ ] `npx tsc --noEmit` → no NEW errors across all changed files.
- [ ] **Live verification by the user** (agent Chrome is unauthenticated — cannot self-verify auth-gated portals):
  - **Student** `/student/routes`: Travel time reads e.g. "1h 25m", Distance shows `—` for zero-distance routes, Fare shows the learner's transport fee, "Boarding staff" card lists the route's supervisors.
  - **Boarding** `/boarding/dashboard`: "Today's Bookings" lists today's booked students grouped by stop; tapping one opens `/boarding/scan` with a "Selected learner" card; "Mark present · Onward/Return" records attendance (verify a new `tms_attendance` row).
  - **Driver** `/driver/boardings`: shows today's booked students grouped by stop with a working date picker; "Passengers" still shows the static allocation.
  - **Admin** `/routes`: the list table shows Distance / Travel time / Fare columns (mostly `—` until data is entered).

---

## Self-Review

**Spec coverage:**
- Feature 1 (route fare/distance/time all portals) → Tasks 1 (boarding+driver shared views), 2 (student), 3 (admin list). Admin **detail** page already guards `0` via falsy checks (`route.distance ? … : ''`) and renders `duration` raw — no change needed, intentionally omitted.
- Feature 2 (boarding today-list → scan) → Tasks 7 (API), 8 (dashboard list), 9 (scan pre-select).
- Feature 3 (driver booked students) → Tasks 4 (helper), 5 (API), 6 (page+nav).
- Feature 4 (student boarding-staff names) → Tasks 10 (resolver), 11 (API+UI).
- Shared helper (design §0) → Task 4.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `RosterRider` / `OrderedStop` / `RosterStopGroup` defined in Task 4 are consumed with identical field names in Tasks 5, 7, 8, 6. `duration: string | null` retyped consistently in `lib/routes/detail.ts` (Task 1), `app/api/student/route/route.ts` + `app/student/routes/page.tsx` (Task 2). `groupRosterByStop` / `loadBookedRoster` names match across producer (Task 4) and consumers (5, 7). `getBoardingStaffForRoute` return type `{ name; email }[]` matches the `RouteData.boardingStaff` type (Task 11). `POST /api/boarding/attendance` body shape in Task 9 matches the existing endpoint (`{ routeId, direction, marks:[{learnerId,status}] }`).

**Ambiguity:** "today" pinned to `istToday()` in all new code; empty-data handling pinned to `<= 0 → —`.
