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

## Out of scope

- Latitude/longitude for the new stops — route 24's own copies have none, so there is
  nothing to copy. Stops will have NULL coords, same as route 24.
- Re-allocating the existing learner to a different stop — they land on stop 1
  automatically and stay there.
- `distance` / `fare` on the route 01 header — left as-is (55.00 / 0.00), matching how
  route 24 is maintained.
