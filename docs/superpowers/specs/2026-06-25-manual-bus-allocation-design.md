# Manual Bus Allocation for Transferable Passengers — Design

**Date:** 2026-06-25
**Module:** Route Optimization (extends Phase 1 read-only analysis + Phase 2 apply/rollback)
**Status:** Approved design — pending implementation plan (writing-plans)

## Overview

The route-optimization "Apply" flow currently lets the engine auto-pick each
transferable passenger's target route (greedy by spare seats). This feature
hands that choice to the admin: a per-passenger target-route dropdown, plus a
per-Apply choice between moving **today's booking** or making a **permanent
reallocation**.

## Goals

- Admin manually allocates the destination bus for each transferable passenger.
- Admin may override the engine — pick **any active route**, not only the
  engine-feasible ones (the engine's exact-stop-name match found only ~15 of 391
  under-utilized passengers feasible on real geography).
- Keep a seat guardrail: a bus already at capacity cannot be selected.
- Support two apply modes: **Today only** (`tms_booking` for the date) and
  **Permanent** (`learners_profiles` standing allocation).
- Reuse the Phase-2 run + per-move snapshot so every apply remains undoable.

## Non-goals (YAGNI)

- No draft/commit two-step flow, no new draft tables.
- No per-passenger mode (mode is one toggle for the whole Apply action).
- No separate "auto" apply path — the unified moves path covers it (dropdowns
  pre-filled with engine picks = today's auto behavior).
- No geo-based stop matching (Phase 3).

## Current state (recap)

- `tms_booking` (PK `learner_id, travel_date`): presence = booked, cancel =
  delete. A move = `UPDATE route_id, stop_id`.
- `learners_profiles.transport_route_id` / `transport_stop_id`: standing
  allocation (560 of 582 bus-required learners allocated across 24 routes).
- Phase 2 apply: `applyConsolidations({date,threshold,routeIds})` re-runs the
  engine and applies engine targets; writes `tms_route_optimization` (run) +
  `tms_route_optimization_item` (from→to snapshot); `rollbackRun` restores.
- Engine relocations already carry `fromStopId` and `toStopId`.

## Design

### Data model

- `tms_route_optimization`: **add** column
  `mode text not null default 'today_booking' check (mode in ('today_booking','permanent'))`.
  Migration `20260625130000_add_mode_to_tms_route_optimization.sql`.
- `tms_route_optimization_item`: **unchanged**. `from_*`/`to_*` hold the prior
  and new route/stop for either the booking (today) or the allocation
  (permanent); the run's `mode` says which table they describe.

### Apply contract

`POST /api/admin/route-optimization/execute-transfers`
```json
{ "date": "YYYY-MM-DD", "mode": "today_booking" | "permanent",
  "moves": [ { "learnerId": "...", "fromRouteId": "...", "toRouteId": "..." } ] }
```
This replaces the Phase-2 `{date, threshold, routeIds}` payload (only this module
used it; not yet committed to prod use). Requires `tms.routes.edit`.

The client builds `moves` from the selected source routes: each transferable row
contributes `{learnerId, fromRouteId, chosenTargetId}` where the target is the
engine suggestion or a manual override; rows left unset ("— pick a bus —") are
omitted.

### Apply algorithm — `applyManualMoves(supabase, {date, mode, moves, actorId})`

1. Load active routes (`id, capacity` via COALESCE(vehicle.capacity,
   total_capacity, 60)) and current occupancy:
   - `today_booking`: per-route `tms_booking` count for `date`.
   - `permanent`: per-route `learners_profiles` allocation count.
   Compute `spare = capacity - occupancy` per route.
2. Resolve each learner's CURRENT route/stop (the snapshot source):
   - today: their `tms_booking` row for `date`.
   - permanent: their `learners_profiles.transport_route_id/stop`.
3. For each move (validate; skip+report on failure):
   - learner's current route must equal `fromRouteId` (else skip: "changed since
     load").
   - `toRouteId` must be active and `spare > 0` (else skip: "target full");
     decrement that target's spare on success (batch-aware overfill block).
   - resolve `toStopId` = a stop on `toRouteId` whose normalized name matches the
     learner's current boarding-stop name, else `null`.
   - apply guarded:
     - today: `UPDATE tms_booking SET route_id=toRoute, stop_id=toStop
       WHERE learner_id=L AND travel_date=date AND route_id=fromRoute`.
     - permanent: `UPDATE learners_profiles SET transport_route_id=toRoute,
       transport_stop_id=toStop WHERE id=L AND transport_route_id=fromRoute`.
   - on a row actually updated, record an item snapshot (from = pre-update
     route/stop, to = chosen route/resolved stop).
4. Insert run header, then items, then patch counts. `applyManualMoves` does NOT
   re-run the engine analysis (it validates explicit moves directly), so the
   header is filled from the apply itself:
   - `mode`, `travel_date`, `threshold_percent` (carried through for reference);
   - `total_moves` = rows actually updated;
   - `routes_cancelled` = distinct source routes that reach 0 bookings after the
     moves (today mode only; 0 for permanent — standing allocation has no
     per-date "bus runs" notion);
   - `estimated_savings` = `routes_cancelled × default daily bus cost` (labeled
     estimate; today mode only);
   - `summary` = a small JSON of `{ mode, requested, applied, skipped }` (not an
     engine OptimizationSummary).
5. `logActivity({ module:'route-optimization', action:'assign',
   entityType: mode==='permanent' ? 'learners_profiles' : 'tms_booking',
   metadata:{ mode, ... } })`.

**Mode separation (confirmed):** `today_booking` touches only the day's booking;
`permanent` touches only the standing allocation and does NOT rewrite an existing
booking for `date`. The confirm modal states this. Each rollback restores exactly
one table.

### Rollback — extend `rollbackRun`

Branch on `run.mode`:
- `today_booking`: `UPDATE tms_booking SET route_id=from_route, stop_id=from_stop
  WHERE learner_id, travel_date, route_id=to_route` (existing behavior).
- `permanent`: `UPDATE learners_profiles SET transport_route_id=from_route,
  transport_stop_id=from_stop WHERE id=learner_id AND transport_route_id=to_route`.
Both guarded by current route == `to_route` (won't clobber a later manual change).
Mark run `rolled_back`. Requires `tms.routes.edit`.

### Dropdown & UI behavior (`route-optimization/page.tsx`)

- The GET analysis already returns `analysis.routes` (every active route with
  `currentPassengers` + `capacity`); the client derives `spare` for the dropdown.
- Each transferable relocation row gains a `<select>`:
  - options = all active routes, each labelled with spare seats;
  - routes with `spare <= 0` are **disabled** ("full");
  - the engine's suggested route is annotated "(suggested)" and pre-selected when
    feasible; otherwise the row defaults to "— pick a bus —".
- Engine-infeasible passengers are now allocatable (any route with spare).
- Source-route checkbox stays the include control; dropdowns set targets.
- Confirm modal adds the **Today only / Permanent** radio with mode-specific copy.
- After apply, re-run analysis (refreshes occupancy + applied-runs list).

### Error handling & edge cases

- Per-move validation failures are skipped and counted; the result reports
  `{ applied, skipped, reasons[] }` and the toast summarizes (e.g. "7 moved, 1
  skipped: target full"). One bad move never fails the batch.
- Override target without a matching stop → `stop_id = null`; UI hints "no
  matching stop — boards without a fixed stop".
- Guarded UPDATEs keep apply + rollback idempotent / race-safe.
- Permissions: both modes and rollback gated by `tms.routes.edit`.

## Testing

- `tsc` on changed files (ESLint is broken in this repo).
- Reversible SQL-cycle on seeded 2026-06-25 data:
  - today mode: apply one feasible + one manual-override (engine-infeasible) move;
    verify `tms_booking` changed; rollback restores exactly.
  - permanent mode: apply a move; verify `learners_profiles` changed; rollback
    restores exactly; confirm the date's `tms_booking` is untouched.
  - capacity guardrail: a move into a full route is skipped server-side.
- Clean up any test audit rows.

## File change list

- `supabase/migrations/20260625130000_add_mode_to_tms_route_optimization.sql` (new)
- `lib/route-optimization/apply.ts` (add `applyManualMoves`, extend `rollbackRun`)
- `lib/route-optimization/types.ts` (move/result types as needed)
- `app/api/admin/route-optimization/execute-transfers/route.ts` (new payload)
- `app/(admin)/route-optimization/page.tsx` (per-row dropdown + mode toggle)

## Future (Phase 3)

Geo-based stop matching (lat/long columns exist but unpopulated), ₹ cost model
from `tms_vehicle.operating_cost_per_km × tms_route.distance`, CSV export of an
allocation plan.
