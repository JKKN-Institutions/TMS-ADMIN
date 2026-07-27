# Route 01 JALAKANDAPURAM — build out stops from Route 24

**Date:** 2026-07-27
**Status:** Approved, pending implementation

## Problem

Route 01 `JALAKANDAPURAM` (`87217217-1cea-408b-a786-941778bf54ef`) is an unfinished stub:

- Only 2 stops — `MECHERI` (06:00) and `JALAKANDAPURAM` (07:50)
- `end_location` is `Kumarapalayam`, not `COLLEGE`
- `evening_time` is NULL on both rows, so there is no return leg — a learner on this
  route cannot book an evening trip at all
- `status = 'inactive'`, 1 learner attached

Route 24 `MECHERI (VIA NANGAVALLI)` (`79f0ff06-b3d4-4373-b27c-debb69502ba4`) already
runs the correct Jalakandapuram-to-college corridor as its stops 13–22, fully timed in
both directions and fully priced.

## Goal

Give route 01 the corridor from `JALAKANDAPURAM SANTHAPETTAI` through to `COLLEGE`,
copied from route 24, so route 01 becomes a real, bookable Jalakandapuram → college
route. **Route 24's stop list is not changed** (one spelling correction only — see below).

## Key constraint: the MECHERI stop cannot be deleted

`tms_route_stop` is referenced by three tables with three different delete rules:

| Referencing table | Column | Delete rule |
|---|---|---|
| `tms_booking` | `stop_id` | **NO ACTION** (restrict) |
| `learners_profiles` | `transport_stop_id` | SET NULL |
| `staff` | `transport_stop_id` | SET NULL |
| `tms_attendance` | `stop_id` | SET NULL |
| `tms_fee_structure_stop_rate` | `stop_id` | **CASCADE** |

Route 01's `MECHERI` row (`bb2fb601-4e5c-4149-be07-3631f1623791`) is referenced by:

- **2 bookings** dated 2026-06-25 → `NO ACTION` makes any `DELETE` fail with an FK violation
- **2 fee-rate rows** @ ₹20,900/yr → `CASCADE` would silently destroy them
- **1 learner** (`a739f21d-5e8c-43d1-9de3-30b7005921b5`) boarding point → would be orphaned

The `JALAKANDAPURAM` row (`4d257853-9a70-4fb4-b73e-733edd5ae8a8`) has **zero** references
and can be deleted safely.

## Approach: repurpose, don't delete

Rewrite the `MECHERI` row **in place** into `JALAKANDAPURAM SANTHAPETTAI` at sequence 1.
Keeping the UUID means:

- the 2 historical bookings keep resolving — no FK abort
- both ₹20,900 fee-rate rows stay attached, and ₹20,900 is *already* the correct
  SANTHAPETTAI amount on route 24, so no fee edit is needed
- the learner's `transport_stop_id` follows automatically

Accepted trade-off: the 2 past bookings will retroactively display
`JALAKANDAPURAM SANTHAPETTAI` instead of `MECHERI`. Confirmed acceptable — it is the
trade that makes the change possible at all.

## Target state — Route 01 (10 stops)

| # | Stop | `stop_time` | `evening_time` | Annual fare | Origin |
|---|------|---|---|---|---|
| 1 | JALAKANDAPURAM SANTHAPETTAI | 07:42 | 17:42 | ₹20,900 | repurposed MECHERI row |
| 2 | JALAKANDAPURAM MUNIYAPPAN KOVIL | 07:45 | 17:40 | ₹7,150 | new |
| 3 | KATTINAYAKKAN PATTI | 07:47 | 17:37 | ₹20,000 | new |
| 4 | KATTINAYAKKAN PATTI EARIE | 07:50 | 17:35 | ₹20,000 | new |
| 5 | COLLOUR PATTI | 07:55 | 17:30 | ₹20,000 | new |
| 6 | IRUPPALI MOOLAKARAI | 08:00 | 17:25 | ₹20,000 | new |
| 7 | VELAMMA VALASU | 08:10 | 17:20 | ₹20,000 | new |
| 8 | KALLUKADAI | 08:20 | 17:15 | ₹20,000 | new |
| 9 | KUPPANOOR | 08:40 | 17:00 | ₹7,150 | new |
| 10 | COLLEGE | 08:55 | 16:45 | — | new |

`is_major_stop = true` on stop 1 (origin) and stop 10 (COLLEGE); false elsewhere,
matching route 24's convention. `COLLEGE` carries no fee rate, matching route 24.

### Route header changes

| Column | From | To |
|---|---|---|
| `start_location` | `Jalakantapuram` | `JALAKANDAPURAM SANTHAPETTAI` |
| `end_location` | `Kumarapalayam` | `COLLEGE` |
| `departure_time` | 07:50 | 07:42 |
| `arrival_time` | 09:00 | 08:55 |
| `status` | `inactive` | `active` |

`driver_id`, `vehicle_id` and `total_capacity` (60) are already set — no change needed.

## Fee rates

Route 24 prices every stop except `COLLEGE`, across two fee structures, both on the
current transport year 2026-2027:

- `9f8f5153-d45a-4fbf-85f2-c399292c201b` — Transport Fees 2026-2027 (Arts Aided)
- `1cff2da9-565b-4618-9c21-68fb66c52aad` — Transport Fees 2026-2027 (Staff - All Colleges)

Stop 1 already has both rows (inherited from MECHERI, correct amount). The 8 remaining
priced stops (2–9) each need a row in both structures: **16 new
`tms_fee_structure_stop_rate` rows**. Amounts are copied from route 24's matching stop.

Without these rows a learner allotted to one of the new stops has no fare and cannot be
billed.

## Spelling correction

Route 24 stop 14 is spelled `JALAKANDAPIRSM MUNIYAPPAN KOVIL` — a typo for
`JALAKANDAPURAM`. Corrected to `JALAKANDAPURAM MUNIYAPPAN KOVIL` on **both** routes.
This is a single-word `UPDATE` on route 24: no stop added or removed, no time changed,
no sequence changed, no fee changed.

## Implementation

A single idempotent migration under `supabase/migrations/`, applied to the live
database. Ordering within one transaction:

1. `UPDATE` route 01's `MECHERI` row → `JALAKANDAPURAM SANTHAPETTAI`, seq 1, 07:42/17:42,
   `is_major_stop = true`
2. `DELETE` route 01's `JALAKANDAPURAM` row (verified unreferenced)
3. `INSERT` route 01 stops at sequences 2–10
4. `INSERT` 16 `tms_fee_structure_stop_rate` rows for the new priced stops
5. `UPDATE` route 01 header (locations, times, status)
6. `UPDATE` route 24 stop 14 spelling

Step 2 is guarded so it only deletes when no booking/attendance/learner/staff row
references that id — if a reference appeared since this spec was written, the migration
fails loudly rather than orphaning data.

## Verification

- Route 01 returns exactly 10 stops in sequence 1–10 with no gaps and monotonically
  increasing `stop_time` / decreasing `evening_time`
- Route 24 still returns exactly 22 stops, and its stop 14 is the only row changed
- Every route 01 stop except `COLLEGE` has exactly 2 fee-rate rows
- The 2 historical bookings still join to a valid stop row
- Learner `a739f21d` still has a non-null `transport_stop_id` pointing at route 01 stop 1
- Route 01 renders correctly on `/routes/87217217-1cea-408b-a786-941778bf54ef`

## Phase 2 — rebalance passengers off route 24

Added 2026-07-27, after phase 1 landed.

Route 24 was carrying **90 learners on a 60-seat bus** (TN34MB5991) while route 01,
now running the same corridor on TN30BH1040 (also 60 seats), carried 1. Phase 2 moves
the corridor learners across.

`JALAKANDAPURAM BUS STOP` (route 24 seq 12, 12 learners) was not part of the phase 1
corridor but is a Jalakandapuram stop, and including it is what actually gets route 24
under capacity. It joins route 01 as the **new stop 1** (07:40 / 17:48, ₹20,900 copied
from route 24) and becomes the route origin, so `JALAKANDAPURAM SANTHAPETTAI` drops from
`is_major_stop` to an ordinary stop and route 01 grows to 11 stops. Route header
`start_location` → `JALAKANDAPURAM BUS STOP`, `departure_time` → 07:40.

| | Before | After | Seats |
|---|---|---|---|
| Route 24 | 90 | **49** | 60 |
| Route 01 | 1 | **42** | 60 |

**41 learners** move (12+8+6+1+4+4+3+3). Each lands on route 01's stop of the *same
name*, so no one's physical boarding point changes — only which bus collects them.

**107 upcoming bookings** (2026-07-27 → 2026-10-08) are re-pointed to route 01 so the
booked seat follows the learner. All 107 belong to moving learners; none belong to
anyone else. **242 past bookings** (2026-06-25 → 2026-07-25) stay on route 24 — they
record travel that actually happened. The cutover date is a literal (`2026-07-27`)
rather than `current_date`, so a replay reproduces exactly this split.

Two things deliberately left alone:

- **Route 24 keeps all 22 stops.** This is a reallocation of passengers, not a
  withdrawal of service; route 24 still serves the whole corridor.
- **The 3 staff** who board at corridor stops stay on route 24, for the same reason.

Billing needs no work: `billing_student_bills` has no `route_id` or `stop_id` — bills
key off learner + `transport_year_id` with the amount snapshotted — and phase 1 gave
route 01 fares identical to route 24's, so future generation matches too.

Implemented in `supabase/migrations/20260727140000_move_jalakandapuram_learners_to_route_01.sql`.

### Phase 2 verification results

| Check | Result |
|---|---|
| Route 24 learners | 90 → 49, 11 spare seats ✅ |
| Route 01 learners | 1 → 42, 18 spare seats ✅ |
| Upcoming bookings moved | 107 on route 01, 0 left in route 24's corridor ✅ |
| Past bookings preserved | 242 still on route 24 (25 Jun – 25 Jul) ✅ |
| Bookings whose stop belongs to another route | 0 ✅ |
| Dangling `stop_id` references | 0 ✅ |
| Learners whose stop is not on their route | 0 on both routes ✅ |

## Phase 3 — JALAKANDAPURAM BUS STOP reverts to route 24

Added 2026-07-27, same day, reversing part of phase 2.

The 12 learners boarding at `JALAKANDAPURAM BUS STOP` are to stay on route 24 after
all. That stop is removed from route 01 entirely and its learners and bookings go back.

| | Phase 2 | Phase 3 | Seats |
|---|---|---|---|
| Route 24 | 49 | **61** | 60 |
| Route 01 | 42 | **30** | 60 |

**Route 24 is 1 learner over its 60 seats.** Accepted — it started the day at 90, so
this is still a 29-seat improvement. Flagged rather than silently absorbed; resolving it
needs either a larger vehicle or moving one more learner, which is a separate decision.

Route 01 reverts to exactly the phase 1 shape: 10 stops beginning at
`JALAKANDAPURAM SANTHAPETTAI` 07:42, which regains `is_major_stop` as the origin.
Route 24 is unchanged and still calls at the bus stop at 07:40, so no learner's physical
boarding point moved in either direction.

Deleting route 01's copy of the stop `CASCADE`s to its 2 `tms_fee_structure_stop_rate`
rows. That is correct here — route 01 no longer calls there and route 24 keeps its own
rows — but the delete is guarded so it only runs once no learner, booking, attendance or
staff row still points at the stop, making the cascade the only side effect.

The other 29 learners from phase 2 stay on route 01. Implemented in
`supabase/migrations/20260727160000_return_jalakandapuram_bus_stop_to_route_24.sql`.

### Notifications sent

| Notification | Recipients | Purpose |
|---|---|---|
| `eff3340f…` "Your bus has changed - now Route 01" | 42 | Phase 2 move |
| `593cda9b…` "Correction - you stay on Route 24" | 12 | Phase 3 revert |

The 12 phase-3 learners received the phase-2 message before the revert, so the
correction was required rather than optional. Both carry an `idempotency_key`, so
neither can be re-sent by accident.

### Phase 3 verification results

| Check | Result |
|---|---|
| Learners back on route 24's bus stop | 12 ✅ |
| Route 01 stop row removed | gone, 0 orphan fee rows ✅ |
| Route 24's own bus-stop fee rows | 2, intact ✅ |
| Route 01 shape | 10 stops, origin SANTHAPETTAI 07:42 ✅ |
| Bookings whose stop belongs to another route | 0 ✅ |
| Real dangling `stop_id` references | 0 ✅ |
| Learners whose stop is not on their route | 0 ✅ |

## Phase 4 — route 24 stops serving the corridor

Added 2026-07-27. Goal: route 24 should no longer serve stops 13–21, which route 01
now covers.

**A hard delete is impossible and was rejected.** Route 24's stops 13–21 are referenced
by **172 historical bookings** (25 Jun – 25 Jul, none in the future) under a `NO ACTION`
foreign key, so `DELETE` aborts. Even if it did not, it would `SET NULL` on 62
attendance rows and `CASCADE` away 18 fee-rate rows. Those bookings and attendance rows
are the record that students really did board there; a timetable edit must not rewrite
them.

`tms_route_stop` has **no `is_active` or `deleted_at` column**, so "route serves this
stop" versus "route no longer serves it" is not expressible in the schema today. Adding
one was considered and deferred — it would require updating every consumer that lists
route stops (booking window, roster, boarding scan, route detail, exports), which is a
larger change than this need justifies.

**What was done instead:** the 3 staff still bound to those stops moved to route 01's
same-named stops.

| Staff | Stop |
|---|---|
| buvaneswari.g@jkkn.ac.in | COLLOUR PATTI |
| faculty@jkkn.ac.in | COLLOUR PATTI |
| vignesh_sasikumar@jkkn.a.c.in | KUPPANOOR |

Route 24's stops 13–21 now carry **0 learners and 0 staff**, so the driver skips that
stretch in practice. The rows remain purely as anchors for past bookings. This is the
honest representation given the schema: nobody is assigned there, and history still
resolves.

Implemented in `supabase/migrations/20260727180000_move_corridor_staff_to_route_01.sql`.

### Final state, end of 2026-07-27

| Route | Bus | Seats | Learners | Staff | Total riders |
|---|---|---|---|---|---|
| 24 | TN34MB5991 | 60 | 61 | 1 | **62** (2 over) |
| 01 | TN30BH1040 | 60 | 30 | 3 | **33** |

Route 24 began the day at 90 learners, so this is a 28-rider improvement, but it is
**still 2 over its 60 seats**. Closing that gap needs either a larger vehicle on route
24 or moving 2 more riders to route 01, which has 27 spare seats. Left open
deliberately rather than absorbed silently.

### Phase 4 verification results

| Check | Result |
|---|---|
| Route 24 stops 13–21 learners | 0 on all 9 ✅ |
| Route 24 stops 13–21 staff | 0 on all 9 ✅ |
| Historical bookings preserved | 172 still resolve ✅ |
| Attendance rows preserved | 62 still resolve ✅ |
| Fee-rate rows preserved | 18 intact ✅ |

## Phase 5 — route 24 stops listing the corridor (`is_active`)

Added 2026-07-27. Phase 4 emptied route 24's stops 13–21 of riders but left them on the
timetable. This removes them from it.

The stops still cannot be deleted, for the reasons in phase 4 — 172 historical bookings
hold them under a `NO ACTION` foreign key. The deferred soft-delete flag was therefore
built rather than deferred again.

### Schema

```sql
ALTER TABLE tms_route_stop ADD COLUMN is_active boolean NOT NULL DEFAULT true;
CREATE INDEX idx_tms_route_stop_route_active
  ON tms_route_stop (route_id, sequence_order) WHERE is_active;
```

Route 24's stops **13–21** are set `is_active = false`. Stop 12
(`JALAKANDAPURAM BUS STOP`) stays active — its 12 learners ride route 24. Stop 22
(`COLLEGE`) stays active — it is the destination. Route 24 goes from 22 listed stops to
**13**.

The migration ends with a guard that raises if any retired stop still has a learner or
staff member allocated, so retiring a stop can never silently strand someone.

### The consumer rule

Every `tms_route_stop` read falls into one of two categories, and getting this wrong in
either direction is a bug:

| | Filter `is_active`? | Why |
|---|---|---|
| **Listing a route's itinerary** | **Yes** | the retired stop is not part of the journey |
| **Resolving a known stop id** | **No** | the id came from a booking or allocation; filtering makes history render blank |

Filtered (6 sites):

- `app/api/admin/routes/[routeId]/stops/route.ts` — admin timetable
- `lib/routes/detail.ts` — route list + detail
- `app/api/student/route/route.ts` — student route view
- `app/api/boarding/attendance/roster/route.ts` — boarding roster
- `lib/driver/routes.ts` — driver route view
- `app/api/admin/routes/search-stops/route.ts` — stop picker (must not offer a retired stop)

Deliberately **not** filtered:

- `app/api/student/transport-context/route.ts` — `.eq('id', stopId)` single lookup
- `app/api/admin/schedules/manifest/route.ts` — resolves names for existing bookings
- `app/api/boarding/passengers/route.ts` — builds a sequence map for sorting; filtering
  would lose ordering for retired stops
- `app/api/admin/fees/[id]/stop-rates/*` — retired stops keep their fare rows
- `lib/route-optimization/*`, `app/api/admin/bookings/route.ts` — analysis and history

### Phase 5 verification results

| Check | Result |
|---|---|
| Route 24 listed stops | 22 → **13** ✅ |
| Route 24 retired stops | 9 ✅ |
| Retired stops elsewhere in the system | 0 — nothing else affected ✅ |
| Historical bookings on retired stops still resolving | 172 ✅ |
| Attendance rows on retired stops still resolving | 62 ✅ |
| Fee-rate rows on retired stops | 18, intact ✅ |
| Retired stops with a learner or staff still allocated | **0** ✅ |
| New TypeScript errors from the 6 edits | **0** (the one error in search-stops predates the change — confirmed by stashing) ✅ |
| `npm run build` | passes ✅ |

## Out of scope

- Latitude/longitude for the new stops — route 24's own copies have none, so there is
  nothing to copy. Stops will have NULL coords, same as route 24.
- Re-allocating the existing learner to a different stop — they land on stop 1
  automatically and stay there.
- `distance` / `fare` on the route 01 header — left as-is (55.00 / 0.00), matching how
  route 24 is maintained.
