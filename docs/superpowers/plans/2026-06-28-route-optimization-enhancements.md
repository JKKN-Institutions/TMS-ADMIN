# Route Optimization Enhancements — Implementation Plan

> **For agentic workers:** implement phase-by-phase. Each phase is independently shippable, type-checks clean, and has its own tests. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make route optimization meaningfully smarter and demand-driven — (1) **combine under-utilized buses** (route merge), (2) match transfers by **stop name + pickup time** (and **proximity** once stops are geocoded), (3) **right-size vehicles** to actual daily demand, all available across **two horizons**: a Daily operational view (single travel date) and a Planning view (date-range avg/peak), via a toggle. Reuse the existing pure-engine + thin-executor + apply/rollback/audit architecture.

**Why (data-grounded):** Today the engine relocates individual passengers to *healthy* routes that serve the **same stop name** — but only **19 of 435** stop names appear on more than one route, so feasible transfers are rare. `latitude`/`longitude` are **empty (0/479)** so proximity matching can't run yet, while `stop_time`/`evening_time` are **fully populated (479/476)** — time is the matching signal we actually have. The fleet has **5 vehicle sizes (42–61)**, making right-sizing viable. The high-leverage change is to optimize at the **route level (merge whole buses)**, not just shuffle individuals.

**Tech Stack:** Next.js 15 (App Router) API routes, Supabase (service-role client), TypeScript, vitest, Tailwind, lucide-react, react-hot-toast.

**Spec basis:** this plan (no separate spec doc); supersedes the matching limitations noted in `2026-06-25-manual-bus-allocation.md`.

## Global Constraints

- Modern `tms_` plane only. Capacity = `COALESCE(vehicle.capacity, route.total_capacity, 60)`.
- `tms_booking` PK is `(learner_id, travel_date)`, no status column; a passenger move = `UPDATE route_id, stop_id`. Permanent allocation lives on `learners_profiles.transport_route_id/transport_stop_id`.
- All API routes use `withAuth` + server-side `user_has_permission`. **View** = `tms.routes.view`; **Apply/rollback/geocode** = `tms.routes.edit`. Data access via `createServiceRoleClient()`.
- Activity-log module `'route-optimization'` already exists. Use `logActivity(auth, request, {...})`.
- Chunk any `.in(ids)` list to ≤ 150 ids.
- **Migrations are tracked as files** in `supabase/migrations/` (timestamped) AND applied via the Supabase MCP `apply_migration`. Keep both in sync.
- Verify each phase with `npm run type-check` (tsc) and `npm test` (vitest). Do **not** run `npm run lint` (ESLint config is broken in this repo).
- Repo is on `main`; parallel sessions may commit mid-task. Before each commit: `git status`, stage ONLY changed files (never `git add -A`).
- Keep the pure engine **Supabase-agnostic**; only `data.ts` / `apply.ts` touch the DB.

## Architecture overview

```
                         ┌── match.ts (pure): name + time(+geo) stop matching
 engine.ts (pure) ───────┤── merge.ts (pure): route-pair corridor overlap + pack
   occupancy/classify     └── rightsize.ts (pure): demand → best-fit vehicle
        │
 data.ts ── loadDailyAnalysis(date)            ─┐  both feed the same engine/merge/
        └─ loadPlanningAnalysis(from,to)        │  rightsize; planning aggregates
                                                │  peak/avg demand per route
 apply.ts ── passenger moves (exists) + NEW vehicle-swap apply/rollback
 geo/geocode.ts ── batch geocode missing stop lat/long (Phase 5)
```

## File Structure (all phases)

- `lib/geo/distance.ts` — **new**: haversine km between two lat/long.
- `lib/geo/geocode.ts` — **new (P5)**: provider-agnostic batch geocoder.
- `lib/route-optimization/match.ts` — **new (P1)**: pure stop-match scoring (name + time window + optional proximity).
- `lib/route-optimization/match.test.ts` — **new (P1)**.
- `lib/route-optimization/merge.ts` (+ `.test.ts`) — **new (P2)**: route-merge analysis.
- `lib/route-optimization/rightsize.ts` (+ `.test.ts`) — **new (P3)**: vehicle right-sizing.
- `lib/route-optimization/types.ts` — **modify**: add time/geo fields, `MergeSuggestion`, `RightsizeSuggestion`, planning fields, new `AnalysisOptions`.
- `lib/route-optimization/engine.ts` — **modify**: use `match.ts`; configurable target classes; emit merges/right-size hooks.
- `lib/route-optimization/data.ts` — **modify**: load `stop_time`/`evening_time`/`lat`/`long`, fleet vehicles; add `loadPlanningAnalysis`.
- `lib/route-optimization/apply.ts` — **modify**: vehicle-swap apply; extend `rollbackRun` for new item kinds; merge-apply helper.
- `app/api/admin/route-optimization/route.ts` — **modify**: accept `from`/`to` (planning) in addition to `date`.
- `app/api/admin/route-optimization/execute-transfers/route.ts` — **modify**: accept merge + vehicle-swap selections.
- `app/api/admin/route-optimization/geocode-stops/route.ts` — **new (P5)**.
- `supabase/migrations/2026XXXX_route_opt_item_kind.sql` — **new (P3)**: add `kind`/`from_vehicle_id`/`to_vehicle_id` to `tms_route_optimization_item`.
- `app/(admin)/route-optimization/page.tsx` — **modify**: Daily/Planning toggle, Combine-buses section, Right-size section, Geocode action.

---

## Phase 1 — Smarter matching foundation (name + time, geo-ready)

Replaces name-only equality with a scored match: same normalized name **and** `stop_time` within ±`timeWindowMin`; when both stops have coordinates, also accept within `proximityKm` (haversine). Allow **under-utilized** routes as transfer targets, not just healthy (configurable). This alone makes far more transfers feasible and is the base for Phases 2–4.

**Files:** `lib/geo/distance.ts`, `lib/route-optimization/match.ts` (+test), `types.ts`, `engine.ts`, `data.ts`.

**Interfaces:**
- `haversineKm(a, b): number`.
- `bestStopMatch(passengerStop, candidateStops, opts): {stopId, score} | null` — pure, deterministic.
- `AnalysisOptions` gains `timeWindowMin` (default 15), `proximityKm` (default 1.5), `allowUnderUtilizedTargets` (default true).
- `RawStop` gains `stop_time`, `evening_time`, `lat`, `long`; `RawBooking` carries the booking stop's time/coords.

- [ ] Add `lib/geo/distance.ts` + unit test (known city distances).
- [ ] Add `match.ts` with `bestStopMatch` (name+time, geo fallback) + tests (matches within window, rejects outside, geo path, no-coords path).
- [ ] Extend `types.ts` (options + Raw* fields).
- [ ] Update `data.ts` to select `stop_time, evening_time, latitude, longitude` from `tms_route_stop` and resolve them onto bookings/stops.
- [ ] Update `engine.ts` to use `bestStopMatch` and the `allowUnderUtilizedTargets` option (targets = healthy ∪ optionally under-utilized with spare).
- [ ] `npm run type-check` + `npm test`; commit.

**Verification:** existing GET still returns; suggestions now include time-compatible targets; no UI change required.

---

## Phase 2 — Combine buses (route merge) ★ core ask

Detect groups of under-utilized routes whose **combined demand ≤ one route's capacity** and whose stops **substantially overlap** (via `match.ts`), then suggest cancelling the extra bus(es) and merging everyone onto one surviving route.

**Files:** `lib/route-optimization/merge.ts` (+test), `types.ts`, `engine.ts`/`data.ts` (emit), `apply.ts` (merge→moves), `execute-transfers/route.ts`, `page.tsx`.

**Algorithm (pure, greedy + explainable):**
- Candidate routes = active, non-healthy-overloaded; sort by occupancy asc.
- For each unmerged source, find the best **survivor** route where: `overlapStops(source, survivor) ≥ minOverlap` (count or %), `survivorOccupancy + sourceDemand ≤ survivorCapacity`, and every source passenger has a `bestStopMatch` on the survivor. Prefer the survivor with the most overlap then most spare.
- Emit `MergeSuggestion { survivorRouteId, mergedRouteIds[], combinedPassengers, capacity, perPassengerTargetStop[], busesFreed, estimatedSavings }`.
- Conservative: a route already chosen as a survivor can't also be merged away (no chains).

- [ ] `merge.ts` + tests (clean merge, capacity-blocked, low-overlap rejected, no double-merge).
- [ ] Extend `OptimizationAnalysis` with `merges: MergeSuggestion[]`; wire through `data.ts`.
- [ ] `apply.ts`: `expandMergeToMoves()` → reuse `applyManualMoves` mechanics (one run, snapshot each move; `routes_cancelled` = buses freed).
- [ ] `execute-transfers/route.ts`: accept `{ merges: [{survivorRouteId, mergedRouteIds}] }` and expand server-side (never trust client move list).
- [ ] `page.tsx`: "Combine buses" section — each card shows source+survivor, overlap, combined load, buses freed, Apply (Daily/Permanent honored by existing mode toggle). Rollback via existing Applied-runs list.
- [ ] type-check + test; commit.

---

## Phase 3 — Right-size vehicles to demand

Per route, compare demand (Daily: that date; Planning: peak over range) to assigned vehicle capacity and recommend the **smallest fleet vehicle that fits with headroom**, or flag **under capacity**. Applying swaps `tms_route.vehicle_id` and is reversible.

**Files:** `lib/route-optimization/rightsize.ts` (+test), `types.ts`, `data.ts` (fleet load), migration, `apply.ts` (vehicle-swap + rollback), `execute-transfers` (or `apply-vehicle`), `page.tsx`.

**Migration** `supabase/migrations/2026XXXX_route_opt_item_kind.sql` (+ MCP apply):
```sql
alter table public.tms_route_optimization_item
  add column if not exists kind text not null default 'passenger_move'
    check (kind in ('passenger_move','vehicle_swap')),
  add column if not exists from_vehicle_id uuid,
  add column if not exists to_vehicle_id uuid;
```

- [ ] `rightsize.ts` + tests (over-provisioned → smaller, under-capacity → flag/upsize, no-fit → none, headroom respected).
- [ ] `data.ts`: load full fleet (assigned + spare vehicles, capacities).
- [ ] Migration file + apply + verify.
- [ ] `apply.ts`: `applyVehicleSwaps()` (UPDATE `tms_route.vehicle_id`, snapshot `from/to_vehicle_id`, `kind='vehicle_swap'`); extend `rollbackRun` to restore vehicle on `vehicle_swap` items.
- [ ] Endpoint accepts `{ vehicleSwaps: [{routeId, toVehicleId}] }`.
- [ ] `page.tsx`: "Right-size vehicles" section + apply; Applied-runs Undo restores vehicle.
- [ ] type-check + test; commit.

---

## Phase 4 — Planning horizon (date range + toggle)

Add a Planning view that aggregates demand across a date range (avg + **peak** per route) and feeds the same engine/merge/right-size on **peak** demand, so merges/swaps are safe for the busiest day. Planning applies in **permanent** mode.

**Files:** `data.ts` (`loadPlanningAnalysis`), `route.ts` (accept `from`/`to`), `page.tsx` (toggle).

- [ ] `loadPlanningAnalysis(from,to)`: per-route avg & peak booking counts over the range; build engine inputs from peak; reuse `analyzeOptimization`, `merge`, `rightsize`.
- [ ] GET: if `from`&`to` present → planning; else single `date` (unchanged). Return `horizon` + `peak/avg` in payload.
- [ ] `page.tsx`: `[Daily] [Planning]` toggle; planning shows range pickers + avg/peak columns; Apply defaults to Permanent in planning.
- [ ] type-check + test; commit.

---

## Phase 5 — Geocoding (enables proximity matching)

Populate the empty `latitude`/`longitude` on `tms_route_stop` so `match.ts`'s proximity path (already built in P1) activates. **Decision needed:** geocoding provider (see Open Questions).

**Files:** `lib/geo/geocode.ts`, `app/api/admin/route-optimization/geocode-stops/route.ts`, `page.tsx` (action).

- [ ] `geocode.ts`: provider-agnostic `geocodeAddress(name)` behind an env-configured key; batch with rate-limit + retry; returns `{lat,long}|null`.
- [ ] `POST /geocode-stops` (`tms.routes.edit`): geocode stops where lat/long is null (chunked, rate-limited), write back; return counts. Idempotent (skips already-geocoded).
- [ ] `page.tsx`: "Geocode N stops" button (shows missing count) + progress/result toast.
- [ ] Document the env var in `.env.example`; type-check; commit.

---

## Open questions (please decide before/at Phase 5; Phases 1–4 don't need them)

1. **Geocoding provider** — Google Maps Geocoding (needs paid API key, accurate) vs OpenStreetMap **Nominatim** (free, strict 1 req/sec, attribution). Recommendation: Nominatim for cost-free start; swap provider behind the same interface later.
2. **Merge "cancel bus" semantics** — Daily: move all passengers off → bus idle for the date (no route deactivation). Permanent: reassign learners' standing route; **do not** auto-deactivate the route record (admin decides separately). Confirm this is acceptable.
3. **Right-size scope** — only suggest swaps among **currently spare** vehicles, or allow reshuffling assigned ones too? Recommendation: spare vehicles only in v1 (simpler, no cascade).

## Out of scope (v1)
- Automatic schedule re-timing of stops; full VRP/path re-routing; cross-day rebalancing; auto-applying suggestions without admin confirmation.

## Cleanup note
The `tms_attendance_window` table (from the attendance-windows feature) was created via MCP without a tracked migration file. Add `supabase/migrations/2026XXXX_create_tms_attendance_window.sql` to keep environments in sync (separate small task).
