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

## Out of scope

- Latitude/longitude for the new stops — route 24's own copies have none, so there is
  nothing to copy. Stops will have NULL coords, same as route 24.
- Re-allocating the existing learner to a different stop — they land on stop 1
  automatically and stay there.
- `distance` / `fare` on the route 01 header — left as-is (55.00 / 0.00), matching how
  route 24 is maintained.
