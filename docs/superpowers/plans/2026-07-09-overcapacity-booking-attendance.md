# Over-capacity Booking & Attendance (warning-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students book a route even after its bus is full, and let overflow passengers complete boarding attendance — turning the two hard seat-count blocks into non-blocking over-capacity warnings.

**Architecture:** "Over capacity" is a *derived* value (booked count / seats-remaining vs capacity), computed per request — no schema change. A tiny pure helper (`isOverCapacity`) is extracted and unit-tested; the two API routes stop returning their seat-count 409s and instead pass an `overCapacity` boolean back to their pages, which show an amber warning. Route Optimization is untouched.

**Tech Stack:** Next.js 16 (App Router, route handlers), React 19 client components, `@tanstack/react-query`, `react-hot-toast`, Supabase (service-role client), Vitest (pure-logic tests only).

## Global Constraints

- **No database migration.** Over-capacity is derived at request time; do not add columns to `tms_booking` or `tms_attendance`.
- **Scope is global** — all routes, all dates. No per-route toggle.
- **Do NOT change:** Route Optimization (`lib/route-optimization/*`), roster (`app/api/boarding/routes/[routeId]/roster/route.ts`), admin summary (`app/api/admin/bookings/summary/route.ts`), or the window / holiday / Sunday / 8 PM-cutoff gates. Only the two **seat-count** blocks change.
- **Type-check command (ESLint is broken in this repo — do not use `npm run lint`):** `npx tsc --noEmit` and confirm no errors in the changed files.
- **Tests run pure logic only:** `npx vitest run` (config `include: ['lib/**/*.test.ts']`).
- **Response shapes are the project convention:** booking route returns `{ success, data }` / `{ error }`; scan route returns `{ ok, ... }`.
- **Live-render verification requires the USER's authenticated browser** — the agent's Chrome is unauthenticated (proxy.ts gates every route). Automated verification is `tsc` + `vitest`; behavioural verification is the manual checklist in the final task.

---

### Task 1: Pure `isOverCapacity` helper (TDD)

Extract the seat-count decision into one pure, testable function that both routes will reuse. Follows the repo's "pure + unit-tested" pattern (`lib/booking/calendar.ts`, `window.ts`).

**Files:**
- Create: `lib/booking/capacity.ts`
- Test: `lib/booking/capacity.test.ts`

**Interfaces:**
- Produces: `isOverCapacity(booked: number, capacity: number): boolean` — true when `capacity > 0 && booked >= capacity`. A non-positive capacity (0 / unknown) is treated as "no limit" → never over capacity (matches the existing `cap > 0` guard).

- [ ] **Step 1: Write the failing test**

```ts
// lib/booking/capacity.test.ts
import { describe, it, expect } from 'vitest';
import { isOverCapacity } from './capacity';

describe('isOverCapacity', () => {
  it('is false when booked is below capacity', () => {
    expect(isOverCapacity(59, 60)).toBe(false);
  });
  it('is true when booked equals capacity (the next seat overflows)', () => {
    expect(isOverCapacity(60, 60)).toBe(true);
  });
  it('is true when booked exceeds capacity', () => {
    expect(isOverCapacity(61, 60)).toBe(true);
  });
  it('treats capacity 0 / unknown as no limit (never over capacity)', () => {
    expect(isOverCapacity(100, 0)).toBe(false);
  });
  it('treats negative capacity as no limit', () => {
    expect(isOverCapacity(5, -1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/booking/capacity.test.ts`
Expected: FAIL — cannot resolve `./capacity` / `isOverCapacity is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/booking/capacity.ts
/**
 * Pure seat-count decision shared by the booking + scan routes. Capacity is
 * ADVISORY: an over-capacity booking/boarding is allowed and only flagged, never
 * blocked. A non-positive capacity means "no known limit" → never over capacity
 * (mirrors the historical `cap > 0` guard).
 */
export function isOverCapacity(booked: number, capacity: number): boolean {
  return capacity > 0 && booked >= capacity;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/booking/capacity.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add lib/booking/capacity.ts lib/booking/capacity.test.ts
git commit -m "feat(booking): add pure isOverCapacity helper"
```

---

### Task 2: Booking API returns a warning instead of a 409

Remove the "fully booked" hard block; always upsert the booking; return the derived `overCapacity` flag.

**Files:**
- Modify: `app/api/student/bookings/route.ts` (imports; the `mutate()` "book" branch, currently lines ~174-200)

**Interfaces:**
- Consumes: `isOverCapacity` from Task 1; existing `hasBookingForDate`, `routeCapacity`, `bookedCount` from `@/lib/booking/repo`.
- Produces: `POST /api/student/bookings` `book` success payload `{ success: true, data: { travel_date, status: 'booked', overCapacity: boolean, booked?: number, capacity?: number } }`. `booked`/`capacity` are present only when `overCapacity` is true.

- [ ] **Step 1: Add the import**

At the top of `app/api/student/bookings/route.ts`, directly under the existing
`import { bookedCount, routeCapacity, hasBookingForDate } from '@/lib/booking/repo';` line, add:

```ts
import { isOverCapacity } from '@/lib/booking/capacity';
```

- [ ] **Step 2: Replace the capacity gate with a non-blocking flag**

Find this block (the "capacity gate" in the `action === 'book'` path):

```ts
      // capacity gate — only blocks when the learner is taking a NEW seat
      const holdsSeat = await hasBookingForDate(svc, learner.id, travelDate);
      if (!holdsSeat) {
        const cap = winMap.get(travelDate)?.capacityOverride ?? (await routeCapacity(svc, learner.transport_route_id));
        if (cap > 0 && (await bookedCount(svc, learner.transport_route_id, travelDate)) >= cap) {
          return NextResponse.json({ error: 'This bus is fully booked for that date' }, { status: 409 });
        }
      }
```

Replace it with:

```ts
      // Capacity is advisory: an over-capacity booking is ALLOWED and only flagged
      // (warning), never blocked. Overflow is intentional. Compute the flag only
      // when the learner takes a NEW seat — a rebooking never counts as over capacity.
      let overCapacity = false;
      let bookedNow = 0;
      let cap = 0;
      const holdsSeat = await hasBookingForDate(svc, learner.id, travelDate);
      if (!holdsSeat) {
        cap = winMap.get(travelDate)?.capacityOverride ?? (await routeCapacity(svc, learner.transport_route_id));
        bookedNow = await bookedCount(svc, learner.transport_route_id, travelDate);
        overCapacity = isOverCapacity(bookedNow, cap);
      }
```

- [ ] **Step 3: Return the flag on success**

Immediately below, find the success return of the `book` branch:

```ts
      return NextResponse.json({ success: true, data: { travel_date: travelDate, status: 'booked' } });
```

Replace it with:

```ts
      return NextResponse.json({
        success: true,
        data: {
          travel_date: travelDate,
          status: 'booked',
          overCapacity,
          // this learner is the (bookedNow + 1)th seat; only sent when over capacity
          booked: overCapacity ? bookedNow + 1 : undefined,
          capacity: overCapacity ? cap : undefined,
        },
      });
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "app/api/student/bookings/route.ts"`
Expected: no output (no type errors in this file).

- [ ] **Step 5: Confirm the block is gone**

Run: `grep -n "fully booked" app/api/student/bookings/route.ts`
Expected: no output (the 409 string is removed).

- [ ] **Step 6: Commit**

```bash
git add app/api/student/bookings/route.ts
git commit -m "feat(booking): allow over-capacity bookings, flag instead of blocking"
```

---

### Task 3: Booking page shows the over-capacity warning toast

**Files:**
- Modify: `app/student/bookings/page.tsx` (the `mutateBooking` return type ~line 36; the mutation `onSuccess` ~lines 54-59)

**Interfaces:**
- Consumes: the Task 2 payload `{ overCapacity?, booked?, capacity? }`.

- [ ] **Step 1: Widen the mutation return type**

Find:

```ts
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Action failed');
  return json.data as { travel_date: string; status: string };
}
```

Replace the last line's cast with:

```ts
  return json.data as { travel_date: string; status: string; overCapacity?: boolean; booked?: number; capacity?: number };
}
```

- [ ] **Step 2: Branch the success toast**

Find the mutation `onSuccess`:

```ts
    onSuccess: (d) => {
      setConfirm(null); // close the dialog; on error it stays open so the user can retry
      toast.success(d.status === 'booked' ? 'Bus booked' : 'Booking cancelled');
      qc.invalidateQueries({ queryKey: ['student-bookings'] });
      qc.invalidateQueries({ queryKey: ['student-pass'] });
    },
```

Replace with:

```ts
    onSuccess: (d) => {
      setConfirm(null); // close the dialog; on error it stays open so the user can retry
      if (d.status === 'booked' && d.overCapacity) {
        const count = d.booked && d.capacity ? ` (${d.booked}/${d.capacity})` : '';
        toast(`Booked — bus is over capacity${count}. Your seat is confirmed on board.`, {
          icon: '⚠️',
          style: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
        });
      } else {
        toast.success(d.status === 'booked' ? 'Bus booked' : 'Booking cancelled');
      }
      qc.invalidateQueries({ queryKey: ['student-bookings'] });
      qc.invalidateQueries({ queryKey: ['student-pass'] });
    },
```

(`toast` — the base react-hot-toast function — is already imported at the top of the file as `import toast from 'react-hot-toast';`, so no new import is needed.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "app/student/bookings/page.tsx"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/student/bookings/page.tsx
git commit -m "feat(booking): amber over-capacity warning toast on the booking board"
```

---

### Task 4: Scan API allows over-capacity walk-ups

A booked learner is already marked present without a capacity check — no change needed there. Only the *unbooked walk-up* path hard-blocks on a full bus; make it allow the walk-up and flag `overCapacity`.

**Files:**
- Modify: `app/api/boarding/scan/route.ts` (the booking gate ~lines 137-156; the `ok: true` response ~lines 192-197)

**Interfaces:**
- Produces: `POST /api/boarding/scan` success payload gains `overCapacity?: boolean` (present/true only for an over-capacity walk-up). The `not_booked` path is unchanged.

- [ ] **Step 1: Allow the over-capacity walk-up**

Find:

```ts
    // Booking gate: a learner must have booked today, unless staff explicitly add
    // them as a walk-up (seats permitting).
    const booked = await hasBookingForDate(svc, learner.id, today);
    let isWalkUp = false;
    if (!booked) {
      if (!body.walkUp) {
        const seats = await seatsRemaining(svc, learner.transport_route_id, today);
        return NextResponse.json({
          ok: false,
          reason: 'not_booked',
          seatsRemaining: seats,
          learner: { name, rollNumber: learner.roll_number },
        });
      }
      const seats = await seatsRemaining(svc, learner.transport_route_id, today);
      if (seats <= 0) {
        return NextResponse.json({ ok: false, reason: 'bus_full', error: 'Bus is full' }, { status: 409 });
      }
      isWalkUp = true;
    }
```

Replace with:

```ts
    // Booking gate: a learner must have booked today, unless staff explicitly add
    // them as a walk-up. Over-capacity walk-ups are ALLOWED (warning-only) — the
    // seat count is advisory, not a hard block. Booked learners skip this entirely.
    const booked = await hasBookingForDate(svc, learner.id, today);
    let isWalkUp = false;
    let overCapacity = false;
    if (!booked) {
      const seats = await seatsRemaining(svc, learner.transport_route_id, today);
      if (!body.walkUp) {
        return NextResponse.json({
          ok: false,
          reason: 'not_booked',
          seatsRemaining: seats,
          learner: { name, rollNumber: learner.roll_number },
        });
      }
      isWalkUp = true;
      overCapacity = seats <= 0;
    }
```

- [ ] **Step 2: Surface the flag on the success response**

Find:

```ts
    return NextResponse.json({
      ok: true,
      learner: { name, rollNumber: learner.roll_number },
      direction,
      walkUp: isWalkUp,
    });
```

Replace with:

```ts
    return NextResponse.json({
      ok: true,
      learner: { name, rollNumber: learner.roll_number },
      direction,
      walkUp: isWalkUp,
      overCapacity: overCapacity || undefined,
    });
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "app/api/boarding/scan/route.ts"`
Expected: no output.

- [ ] **Step 4: Confirm the block is gone**

Run: `grep -n "bus_full" app/api/boarding/scan/route.ts`
Expected: no output (the `bus_full` 409 is removed).

- [ ] **Step 5: Commit**

```bash
git add app/api/boarding/scan/route.ts
git commit -m "feat(boarding): allow over-capacity walk-up scans, flag instead of blocking"
```

---

### Task 5: Scan page enables the over-capacity walk-up and shows the warning

**Files:**
- Modify: `app/boarding/scan/page.tsx` (the `ScanResult` type ~lines 18-26; the success card ~lines 255-264; the `not_booked` walk-up button ~lines 273-279)

**Interfaces:**
- Consumes: the Task 4 payload field `overCapacity?: boolean`.

- [ ] **Step 1: Add `overCapacity` to the result type**

Find:

```ts
type ScanResult = {
  ok: boolean;
  learner?: { name: string; rollNumber: string | null };
  direction?: string;
  walkUp?: boolean;
  reason?: 'not_booked' | 'bus_full' | 'window_closed';
  seatsRemaining?: number;
  error?: string;
};
```

Replace with (adds one field; leaves `bus_full` in the union for back-compat even though the server no longer sends it):

```ts
type ScanResult = {
  ok: boolean;
  learner?: { name: string; rollNumber: string | null };
  direction?: string;
  walkUp?: boolean;
  reason?: 'not_booked' | 'bus_full' | 'window_closed';
  seatsRemaining?: number;
  overCapacity?: boolean;
  error?: string;
};
```

- [ ] **Step 2: Show the amber over-capacity note on the success card**

Find:

```tsx
            {result.ok ? (
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">
                  ✓ Marked present ({result.direction}){result.walkUp ? ' · walk-up' : ''}
                </p>
                <p>
                  {result.learner?.name}
                  {result.learner?.rollNumber ? ` · ${result.learner.rollNumber}` : ''}
                </p>
              </div>
```

Replace with:

```tsx
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
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    ⚠ Bus is over capacity — boarded as overflow.
                  </p>
                )}
              </div>
```

- [ ] **Step 3: Always allow the walk-up button (relabel when over capacity)**

Find:

```tsx
                <Button
                  className="w-full"
                  disabled={(result.seatsRemaining ?? 0) <= 0}
                  onClick={() => submit(lastTokenRef.current, true)}
                >
                  {(result.seatsRemaining ?? 0) > 0 ? 'Add as walk-up' : 'Bus full'}
                </Button>
```

Replace with:

```tsx
                <Button
                  className="w-full"
                  onClick={() => submit(lastTokenRef.current, true)}
                >
                  {(result.seatsRemaining ?? 0) > 0 ? 'Add as walk-up' : 'Add as walk-up (over capacity)'}
                </Button>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "app/boarding/scan/page.tsx"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/boarding/scan/page.tsx
git commit -m "feat(boarding): enable over-capacity walk-up + warning on scan screen"
```

---

### Task 6: Full verification (automated + manual)

**Files:** none (verification only).

- [ ] **Step 1: Run the full pure-logic test suite**

Run: `npx vitest run`
Expected: all tests pass, including `lib/booking/capacity.test.ts`.

- [ ] **Step 2: Full type-check, no regressions in changed files**

Run: `npx tsc --noEmit 2>&1 | grep -E "booking/capacity|student/bookings|boarding/scan"`
Expected: no output.

- [ ] **Step 3: Manual behavioural checks (USER's authenticated browser — agent Chrome can't log in)**

Provide this checklist to the user to run against the dev server (`npm run dev`):

1. As a student assigned to a full route (e.g. Route 24, 60/60 for a bookable date): open `/student/bookings`, tap the date, confirm → **amber over-capacity warning toast** appears and the day shows as **booked** on the calendar (no red "fully booked" error).
2. As admin: `/api/admin/bookings/summary?date=<that date>` (or the bookings summary UI) shows that route with `booked > capacity` (e.g. 61/60).
3. As boarding staff on `/boarding/scan`: scan a **booked** overflow learner → **✓ Marked present** (not blocked).
4. Scan an **unbooked** overflow learner → card shows **Add as walk-up (over capacity)** (enabled) → tap → **✓ Marked present** with the amber "over capacity" note.

- [ ] **Step 4: Final commit (if any doc/checklist tweaks were made)**

```bash
git add -A docs/superpowers
git commit -m "docs(booking): over-capacity plan verification notes"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-09-overcapacity-booking-attendance-design.md`):
- Change 1 (booking → warning): Tasks 2 (API) + 3 (toast). ✅
- Change 2 (attendance never blocks): Task 4 (API walk-up) + 5 (scan UI); booked-learner path unchanged by design. ✅
- Non-goals (no migration, no route-optimization/roster/summary/gate changes): enforced by Global Constraints; no task touches them. ✅
- Global scope: no per-route toggle introduced. ✅
- Verification (tsc + vitest + manual): Task 6. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete, real code copied against the current source. ✅

**3. Type consistency:** `isOverCapacity(booked, capacity)` defined in Task 1 is imported and called with the same argument order in Task 2. The `overCapacity`/`booked`/`capacity` fields produced in Task 2 are exactly the ones consumed in Task 3; `overCapacity` produced in Task 4 is the field consumed in Task 5. ✅
