# Over-capacity booking & attendance (warning-only)

- **Date:** 2026-07-09
- **Branch:** feat/weekly-booking-window
- **Status:** Approved (design). Ready for implementation plan.

## Problem

A student on `/student/bookings` could not book **Route 24 · MECHERI (VIA
NANGAVALLI)** for Fri 10 Jul 2026: the assigned 60-seat bus was full, so the
"book" action returned a hard `409 "This bus is fully booked for that date"`.

The operational need is the opposite of what the hard cap assumes. The transport
office wants **every** passenger to be able to book the bus for a date even after
the seat count is reached (an intentional over-capacity / overflow), and wants
those overflow passengers to also complete the **boarding attendance** process on
travel day. Route Optimization is explicitly **not** part of this change.

## Goal

Turn the two hard **seat-count** blocks into **non-blocking warnings**:

1. **Booking** — always accept the booking; when it pushes the route past its
   seat count, return success plus an `overCapacity` flag and show an amber
   warning toast instead of the red error.
2. **Attendance** — never hard-block an overflow passenger from being marked
   present. Booked passengers already bypass the capacity check; the only path
   that blocks is an *unbooked walk-up* on a full bus, which becomes an allowed
   walk-up with an over-capacity warning.

## Non-goals (explicitly out of scope)

- **Route Optimization** — no changes. (No redistribute/consolidate step this
  time.)
- **No schema change.** "Over capacity" is a *derived* fact (booked count /
  seats-remaining vs capacity), computed per request. No new column, no
  migration, no backfill.
- Window / holiday / Sunday / 8 PM-cutoff gates stay enforced. Only the
  **seat-count** blocks change.
- Roster (`/api/boarding/routes/[routeId]/roster`) and admin bookings summary
  (`/api/admin/bookings/summary`) are read-only booked-vs-capacity displays; they
  will now naturally show e.g. `61/60`, which is the desired signal. No change.

## Scope

**Global** — all routes, all dates. No per-route toggle. The warning keeps it
transparent, so nobody is silently overbooked.

## Design

### Change 1 — Booking becomes a warning (student side)

**File:** `app/api/student/bookings/route.ts` — the `mutate()` "book" branch.

Current gate (lines ~174-181):

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

New behaviour:

- Do **not** return early. Compute the capacity/booked counts (only when the
  learner does not already hold a seat — a rebooking is not a new seat, so it is
  never "over capacity"), derive `overCapacity`, then proceed to the existing
  upsert.
- Success response carries the derived signal:

```ts
let overCapacity = false;
let booked = 0;
let capacity = 0;
const holdsSeat = await hasBookingForDate(svc, learner.id, travelDate);
if (!holdsSeat) {
  capacity = winMap.get(travelDate)?.capacityOverride ?? (await routeCapacity(svc, learner.transport_route_id));
  booked = await bookedCount(svc, learner.transport_route_id, travelDate);
  overCapacity = capacity > 0 && booked >= capacity;
}
// ...existing upsert unchanged...
return NextResponse.json({
  success: true,
  data: {
    travel_date: travelDate,
    status: 'booked',
    overCapacity,
    booked: overCapacity ? booked + 1 : undefined,   // this passenger is the (booked+1)th
    capacity: overCapacity ? capacity : undefined,
  },
});
```

**File:** `app/student/bookings/page.tsx`.

- Extend `mutateBooking`'s return type: `{ travel_date; status; overCapacity?: boolean; booked?: number; capacity?: number }`.
- In the mutation `onSuccess`, branch the toast:
  - `d.overCapacity` → **warning toast** (amber), e.g.
    `"Booked — bus is over capacity (${d.booked}/${d.capacity}). Seat confirmed on board."`
    (react-hot-toast: `toast(msg, { icon: '⚠️' })` or a custom warning style — match
    the existing toast usage in the file).
  - otherwise → the existing `toast.success('Bus booked')`.
- Cancel path and the confirm dialog are unchanged.

### Change 2 — Attendance never blocks overflow (boarding side)

**File:** `app/api/boarding/scan/route.ts` — the booking gate (lines ~139-156).

- **Booked learner** (`hasBookingForDate = true`): unchanged — already skips the
  capacity check and is marked present. This covers the primary overflow flow.
- **Walk-up** (`!booked && body.walkUp`): today returns
  `409 { reason: 'bus_full' }` when `seatsRemaining <= 0`. New behaviour: do not
  block — set `isWalkUp = true` and proceed to the attendance upsert. Surface the
  derived over-capacity signal in the success response so the UI can warn:

```ts
if (!booked) {
  const seats = await seatsRemaining(svc, learner.transport_route_id, today);
  if (!body.walkUp) {
    return NextResponse.json({ ok: false, reason: 'not_booked', seatsRemaining: seats, learner: { name, rollNumber: learner.roll_number } });
  }
  // over-capacity walk-ups are allowed (warning-only), not blocked
  isWalkUp = true;
  overCapacity = seats <= 0;   // include in the ok:true response below
}
```

- Add `overCapacity` (and keep `seatsRemaining`) on the `ok: true` scan response.

**File:** `app/boarding/scan/page.tsx`.

- Extend `ScanResult` with `overCapacity?: boolean`.
- In the `not_booked` result card, **enable** the "Add as walk-up" button even
  when `seatsRemaining <= 0`; relabel it to `"Add as walk-up (over capacity)"`
  in that case (instead of the disabled `"Bus full"`).
- In the `ok: true` success card, when `result.overCapacity`, show an amber
  over-capacity note beneath "Marked present" (reuse the existing amber styling).

## Data flow

```
Student books date ──> POST /api/student/bookings {action:'book'}
  route.ts: compute overCapacity (derived) ──> upsert tms_booking (always)
        └─> 200 {success, data:{overCapacity, booked, capacity}}
  page.tsx onSuccess: overCapacity ? amber warning toast : green success toast

Travel day scan ──> POST /api/boarding/scan {token, direction, walkUp?}
  booked?  ──yes──> mark present (unchanged)
           ──no & walkUp──> mark present as walk-up (was: block if full)
                            └─> 200 {ok:true, overCapacity}
  scan/page.tsx: success card shows amber over-capacity note when overCapacity
```

## Error handling

- All existing non-capacity guards remain and still return their current errors:
  Sunday (409), booking closed / window (409), holiday / no-service (409), invalid
  date (400), no route allocated (409), attendance window closed (window_closed),
  route-authority (403), unknown / ambiguous code (409), permission (403).
- Only the two seat-count 409s (`fully booked`, `bus_full`) are removed and
  replaced by the derived `overCapacity` warning path.
- The 42P01 (missing-table) guards in `lib/booking/repo.ts` are untouched.

## Testing / verification

- **Type-check:** `npx tsc --noEmit` scoped to the 4 changed files (ESLint is
  known-broken in this repo; use tsc).
- **Pure-logic unit tests:** none required — `lib/booking/window.ts`,
  `calendar.ts`, and the route-optimization engine are unchanged. `repo.ts`
  helpers keep their signatures.
- **Manual (must run in the user's authenticated browser — the agent's Chrome is
  unauthenticated):**
  1. Book Route 24 up to 60/60, then book once more → amber over-capacity warning
     toast; the booking appears on the calendar (status `booked`).
  2. Admin bookings summary for that route/date shows `booked > capacity`
     (e.g. 61/60).
  3. Scan a **booked** overflow learner → "Marked present" (no block).
  4. Scan an **unbooked** overflow learner → "Add as walk-up (over capacity)"
     enabled → marks present with the amber over-capacity note.

## Files touched

| File | Change |
|------|--------|
| `app/api/student/bookings/route.ts` | Remove the "fully booked" 409; return derived `overCapacity` on success. |
| `app/student/bookings/page.tsx` | Warning toast when `overCapacity`, else success toast. |
| `app/api/boarding/scan/route.ts` | Allow over-capacity walk-ups; return `overCapacity`. |
| `app/boarding/scan/page.tsx` | Enable over-capacity walk-up button; amber note on success. |

No migrations. No changes to route optimization, roster, admin summary, or the
window/holiday/cutoff gates.
