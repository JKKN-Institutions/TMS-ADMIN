# Manual Bus Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin manually pick the destination bus for each transferable passenger in the route-optimization Apply flow, with a per-Apply choice of moving today's booking or the learner's permanent allocation.

**Architecture:** A PURE move planner (`planManualMoves`) validates requested moves against route capacity + current allocations and resolves target stops — unit-tested with vitest. A thin DB executor (`applyManualMoves`) gathers inputs per mode, runs the planner, executes guarded UPDATEs, and records a reversible run. The UI adds a per-passenger target dropdown and a Today/Permanent toggle.

**Tech Stack:** Next.js 15 (App Router) API routes, Supabase (service-role client), TypeScript, vitest, Tailwind, lucide-react, react-hot-toast.

**Spec:** `docs/superpowers/specs/2026-06-25-manual-bus-allocation-design.md`

## Global Constraints

- Modern `tms_` plane only. Capacity = `COALESCE(vehicle.capacity, total_capacity, 60)`.
- `tms_booking` PK is `(learner_id, travel_date)`, no status column; a move = `UPDATE route_id, stop_id`.
- Permanent allocation lives on `learners_profiles.transport_route_id` / `transport_stop_id`.
- All API routes use `withAuth` + server-side `user_has_permission`. Apply + rollback require `tms.routes.edit`. Data access via `createServiceRoleClient()`.
- Activity log module `'route-optimization'` already exists (added in Phase 2). Use `logActivity(auth, request, {...})`.
- Chunk any `.in(ids)` list to ≤ 150 ids.
- Verify with `npm run type-check` (tsc) and `npm test` (vitest). Do NOT use `npm run lint` (ESLint config is broken in this repo).
- Repo is on `main`; parallel sessions may commit to `main` mid-task. Before each commit: `git status` to verify HEAD, stage ONLY the files you changed (never `git add -A`, never `git stash`).
- Mode separation: `today_booking` touches only `tms_booking` for the date; `permanent` touches only `learners_profiles` and does NOT rewrite an existing booking for that date.

## File Structure

- `supabase/migrations/20260625130000_add_mode_to_tms_route_optimization.sql` — **new**: add `mode` column.
- `lib/route-optimization/allocate.ts` — **new**: pure `planManualMoves()` + its types.
- `lib/route-optimization/allocate.test.ts` — **new**: vitest unit tests for the planner.
- `lib/route-optimization/apply.ts` — **modify**: add `applyManualMoves()`; extend `rollbackRun()` for `mode`.
- `app/api/admin/route-optimization/execute-transfers/route.ts` — **modify**: accept `{date, mode, moves}`.
- `app/api/admin/route-optimization/route.ts` — **modify**: include `mode` in the `appliedRuns` select.
- `app/(admin)/route-optimization/page.tsx` — **modify**: per-row target dropdown + mode toggle + moves payload.

---

### Task 1: Migration — add `mode` to the run header

**Files:**
- Create: `supabase/migrations/20260625130000_add_mode_to_tms_route_optimization.sql`

**Interfaces:**
- Produces: column `tms_route_optimization.mode text` (`'today_booking'` | `'permanent'`, default `'today_booking'`).

- [ ] **Step 1: Write the migration**

```sql
-- Add apply-mode to optimization runs: 'today_booking' mutates tms_booking for the
-- date; 'permanent' mutates learners_profiles standing allocation. Existing rows are
-- today_booking (Phase 2 behavior). Additive, idempotent.
alter table public.tms_route_optimization
  add column if not exists mode text not null default 'today_booking'
  check (mode in ('today_booking','permanent'));
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` (name `add_mode_to_tms_route_optimization`, the SQL above).

- [ ] **Step 3: Verify the column exists**

Run this SQL (Supabase MCP `execute_sql`):
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='tms_route_optimization' and column_name='mode';
```
Expected: one row, `mode`, `text`, default `'today_booking'::text`.

- [ ] **Step 4: Commit**

```bash
git status
git add supabase/migrations/20260625130000_add_mode_to_tms_route_optimization.sql
git commit -m "feat(route-opt): add mode column to tms_route_optimization"
```

---

### Task 2: Pure move planner + unit tests

**Files:**
- Create: `lib/route-optimization/allocate.ts`
- Test: `lib/route-optimization/allocate.test.ts`

**Interfaces:**
- Consumes: `normalizeStopName` from `lib/route-optimization/engine.ts`.
- Produces:
  - `interface MoveRequest { learnerId: string; fromRouteId: string; toRouteId: string }`
  - `interface RouteCapacity { routeId: string; active: boolean; capacity: number; occupancy: number }`
  - `interface CurrentAllocation { routeId: string | null; stopId: string | null; stopName: string | null; learnerName: string; learnerRoll: string | null }`
  - `interface PlannedMove { learnerId: string; learnerLabel: string; fromRouteId: string; fromStopId: string | null; toRouteId: string; toStopId: string | null }`
  - `interface SkippedMove { learnerId: string; reason: string }`
  - `interface PlanResult { moves: PlannedMove[]; skipped: SkippedMove[] }`
  - `function planManualMoves(requests: MoveRequest[], routes: Map<string, RouteCapacity>, current: Map<string, CurrentAllocation>, stopNameToIdByRoute: Map<string, Map<string, string>>): PlanResult`

- [ ] **Step 1: Write the failing test**

Create `lib/route-optimization/allocate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { planManualMoves, type MoveRequest, type RouteCapacity, type CurrentAllocation } from './allocate';

const routes = new Map<string, RouteCapacity>([
  ['U', { routeId: 'U', active: true, capacity: 60, occupancy: 6 }],
  ['H', { routeId: 'H', active: true, capacity: 60, occupancy: 59 }], // 1 spare
  ['X', { routeId: 'X', active: false, capacity: 60, occupancy: 0 }],
]);
const current = new Map<string, CurrentAllocation>([
  ['l1', { routeId: 'U', stopId: 's-u-pp', stopName: 'Pallipalayam', learnerName: 'A Kumar', learnerRoll: '21CS01' }],
  ['l2', { routeId: 'U', stopId: 's-u-gobi', stopName: 'Gobi', learnerName: 'R Devi', learnerRoll: '21CS02' }],
  ['l3', { routeId: 'V', stopId: null, stopName: null, learnerName: 'Stale', learnerRoll: null }],
]);
const stopMap = new Map<string, Map<string, string>>([
  ['H', new Map([['pallipalayam', 's-h-pp']])], // H serves Pallipalayam (id s-h-pp), not Gobi
]);

describe('planManualMoves', () => {
  it('moves a learner and resolves the target stop by name', () => {
    const reqs: MoveRequest[] = [{ learnerId: 'l1', fromRouteId: 'U', toRouteId: 'H' }];
    const { moves, skipped } = planManualMoves(reqs, routes, current, stopMap);
    expect(skipped).toHaveLength(0);
    expect(moves[0]).toMatchObject({ learnerId: 'l1', fromRouteId: 'U', fromStopId: 's-u-pp', toRouteId: 'H', toStopId: 's-h-pp', learnerLabel: 'A Kumar (21CS01)' });
  });

  it('sets toStopId null when the target does not serve the stop', () => {
    const reqs: MoveRequest[] = [{ learnerId: 'l2', fromRouteId: 'U', toRouteId: 'H' }];
    const { moves } = planManualMoves(reqs, routes, current, stopMap);
    expect(moves[0].toStopId).toBeNull();
  });

  it('blocks overfill across the batch (H has 1 spare)', () => {
    const reqs: MoveRequest[] = [
      { learnerId: 'l1', fromRouteId: 'U', toRouteId: 'H' },
      { learnerId: 'l2', fromRouteId: 'U', toRouteId: 'H' },
    ];
    const { moves, skipped } = planManualMoves(reqs, routes, current, stopMap);
    expect(moves).toHaveLength(1);
    expect(skipped).toEqual([{ learnerId: 'l2', reason: 'Target route is full' }]);
  });

  it('skips when the source route changed since load', () => {
    const reqs: MoveRequest[] = [{ learnerId: 'l3', fromRouteId: 'U', toRouteId: 'H' }];
    const { skipped } = planManualMoves(reqs, routes, current, stopMap);
    expect(skipped[0].reason).toBe('Source route changed since load');
  });

  it('skips an inactive target route', () => {
    const reqs: MoveRequest[] = [{ learnerId: 'l1', fromRouteId: 'U', toRouteId: 'X' }];
    const { skipped } = planManualMoves(reqs, routes, current, stopMap);
    expect(skipped[0].reason).toBe('Target route not active');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/route-optimization/allocate.test.ts`
Expected: FAIL — cannot import `./allocate` (module not found).

- [ ] **Step 3: Write the planner**

Create `lib/route-optimization/allocate.ts`:
```ts
/**
 * Route Optimization — pure manual-move planner.
 *
 * Validates admin-chosen moves against current allocations and route capacity,
 * resolves each target stop by name, and reports skips with reasons. No Supabase:
 * the DB executor (apply.ts) gathers inputs and runs the resulting UPDATEs.
 */
import { normalizeStopName } from './engine';

export interface MoveRequest {
  learnerId: string;
  fromRouteId: string;
  toRouteId: string;
}
export interface RouteCapacity {
  routeId: string;
  active: boolean;
  capacity: number;
  occupancy: number;
}
export interface CurrentAllocation {
  routeId: string | null;
  stopId: string | null;
  stopName: string | null;
  learnerName: string;
  learnerRoll: string | null;
}
export interface PlannedMove {
  learnerId: string;
  learnerLabel: string;
  fromRouteId: string;
  fromStopId: string | null;
  toRouteId: string;
  toStopId: string | null;
}
export interface SkippedMove {
  learnerId: string;
  reason: string;
}
export interface PlanResult {
  moves: PlannedMove[];
  skipped: SkippedMove[];
}

export function planManualMoves(
  requests: MoveRequest[],
  routes: Map<string, RouteCapacity>,
  current: Map<string, CurrentAllocation>,
  stopNameToIdByRoute: Map<string, Map<string, string>>
): PlanResult {
  const moves: PlannedMove[] = [];
  const skipped: SkippedMove[] = [];

  const spare = new Map<string, number>();
  for (const [id, r] of routes) spare.set(id, Math.max(0, r.capacity - r.occupancy));

  for (const req of requests) {
    const cur = current.get(req.learnerId);
    if (!cur) {
      skipped.push({ learnerId: req.learnerId, reason: 'No current booking/allocation found' });
      continue;
    }
    if (cur.routeId !== req.fromRouteId) {
      skipped.push({ learnerId: req.learnerId, reason: 'Source route changed since load' });
      continue;
    }
    if (req.toRouteId === req.fromRouteId) {
      skipped.push({ learnerId: req.learnerId, reason: 'Target equals source' });
      continue;
    }
    const target = routes.get(req.toRouteId);
    if (!target || !target.active) {
      skipped.push({ learnerId: req.learnerId, reason: 'Target route not active' });
      continue;
    }
    const s = spare.get(req.toRouteId) ?? 0;
    if (s <= 0) {
      skipped.push({ learnerId: req.learnerId, reason: 'Target route is full' });
      continue;
    }
    spare.set(req.toRouteId, s - 1);

    const norm = normalizeStopName(cur.stopName);
    const toStopId = norm ? stopNameToIdByRoute.get(req.toRouteId)?.get(norm) ?? null : null;

    moves.push({
      learnerId: req.learnerId,
      learnerLabel: cur.learnerRoll ? `${cur.learnerName} (${cur.learnerRoll})` : cur.learnerName,
      fromRouteId: req.fromRouteId,
      fromStopId: cur.stopId,
      toRouteId: req.toRouteId,
      toStopId,
    });
  }

  return { moves, skipped };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/route-optimization/allocate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -i "route-optimization/allocate"`
Expected: no output (no new errors).

- [ ] **Step 6: Commit**

```bash
git status
git add lib/route-optimization/allocate.ts lib/route-optimization/allocate.test.ts
git commit -m "feat(route-opt): pure manual-move planner with capacity + stop validation"
```

---

### Task 3: DB executor `applyManualMoves` + mode-aware rollback

**Files:**
- Modify: `lib/route-optimization/apply.ts`

**Interfaces:**
- Consumes: `planManualMoves` and its types from `./allocate`; `normalizeStopName` from `./engine`; `loadOptimizationAnalysis` stays for the existing GET path (not used here).
- Produces:
  - `type ApplyMode = 'today_booking' | 'permanent'`
  - `interface ManualApplyParams { date: string; mode: ApplyMode; threshold: number; moves: { learnerId: string; fromRouteId: string; toRouteId: string }[]; actorId: string | null }`
  - `interface ManualApplyResult { runId: string; mode: ApplyMode; date: string; applied: number; skipped: { learnerId: string; reason: string }[]; routesCancelled: number; estimatedSavings: number }`
  - `function applyManualMoves(supabase, params: ManualApplyParams): Promise<ManualApplyResult>`
  - `rollbackRun` updated to branch on the run's `mode`.

- [ ] **Step 1: Add the manual executor**

Append to `lib/route-optimization/apply.ts` (keep existing `applyConsolidations`/`rollbackRun`, but `rollbackRun` is replaced in Step 2):
```ts
import {
  planManualMoves,
  type MoveRequest,
  type RouteCapacity,
  type CurrentAllocation,
} from './allocate';
import { normalizeStopName } from './engine';

const CHUNK = 150;
const DEFAULT_DAILY_BUS_COST = 2500;

export type ApplyMode = 'today_booking' | 'permanent';

export interface ManualApplyParams {
  date: string;
  mode: ApplyMode;
  threshold: number;
  moves: MoveRequest[];
  actorId: string | null;
}
export interface ManualApplyResult {
  runId: string;
  mode: ApplyMode;
  date: string;
  applied: number;
  skipped: { learnerId: string; reason: string }[];
  routesCancelled: number;
  estimatedSavings: number;
}

export async function applyManualMoves(
  supabase: SupabaseClient,
  { date, mode, threshold, moves, actorId }: ManualApplyParams
): Promise<ManualApplyResult> {
  // 1) Routes + capacity.
  const { data: routeRows, error: routeErr } = await supabase
    .from('tms_route')
    .select('id, status, total_capacity, vehicle_id');
  if (routeErr) throw new Error(`routes: ${routeErr.message}`);
  const routeList = routeRows ?? [];

  const vehicleIds = Array.from(new Set(routeList.map((r) => r.vehicle_id).filter((v): v is string => !!v)));
  const vehCap = new Map<string, number | null>();
  for (let i = 0; i < vehicleIds.length; i += CHUNK) {
    const { data: vrows, error } = await supabase
      .from('tms_vehicle').select('id, capacity').in('id', vehicleIds.slice(i, i + CHUNK));
    if (error) throw new Error(`vehicles: ${error.message}`);
    for (const v of vrows ?? []) vehCap.set(v.id, v.capacity);
  }
  const capacityOf = (r: { vehicle_id: string | null; total_capacity: number | null }) => {
    const vc = r.vehicle_id ? vehCap.get(r.vehicle_id) : null;
    if (vc && vc > 0) return vc;
    if (r.total_capacity && r.total_capacity > 0) return r.total_capacity;
    return 60;
  };

  // 2) Occupancy per mode.
  const occupancy = new Map<string, number>();
  if (mode === 'today_booking') {
    const { data, error } = await supabase.from('tms_booking').select('route_id').eq('travel_date', date);
    if (error) throw new Error(`bookings: ${error.message}`);
    for (const b of data ?? []) occupancy.set(b.route_id, (occupancy.get(b.route_id) ?? 0) + 1);
  } else {
    const { data, error } = await supabase
      .from('learners_profiles').select('transport_route_id').not('transport_route_id', 'is', null);
    if (error) throw new Error(`allocations: ${error.message}`);
    for (const l of data ?? []) occupancy.set(l.transport_route_id, (occupancy.get(l.transport_route_id) ?? 0) + 1);
  }

  const routes = new Map<string, RouteCapacity>();
  for (const r of routeList) {
    routes.set(r.id, {
      routeId: r.id,
      active: (r.status ?? 'active') === 'active',
      capacity: capacityOf(r),
      occupancy: occupancy.get(r.id) ?? 0,
    });
  }

  // 3) Stop name → id per route.
  const { data: stopRows, error: stopErr } = await supabase
    .from('tms_route_stop').select('id, route_id, stop_name');
  if (stopErr) throw new Error(`stops: ${stopErr.message}`);
  const stops = stopRows ?? [];
  const stopNameById = new Map<string, string | null>(stops.map((s) => [s.id, s.stop_name]));
  const stopNameToIdByRoute = new Map<string, Map<string, string>>();
  for (const s of stops) {
    const key = normalizeStopName(s.stop_name);
    if (!key) continue;
    let m = stopNameToIdByRoute.get(s.route_id);
    if (!m) { m = new Map(); stopNameToIdByRoute.set(s.route_id, m); }
    if (!m.has(key)) m.set(key, s.id);
  }

  // 4) Current allocation for the requested learners.
  const learnerIds = Array.from(new Set(moves.map((m) => m.learnerId)));
  const current = new Map<string, CurrentAllocation>();
  const nameById = new Map<string, { name: string; roll: string | null }>();
  for (let i = 0; i < learnerIds.length; i += CHUNK) {
    const slice = learnerIds.slice(i, i + CHUNK);
    const { data: prof, error } = await supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, register_number, transport_route_id, transport_stop_id')
      .in('id', slice);
    if (error) throw new Error(`learners: ${error.message}`);
    for (const l of prof ?? []) {
      const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || 'Unknown learner';
      nameById.set(l.id, { name, roll: l.roll_number || l.register_number || null });
      if (mode === 'permanent') {
        current.set(l.id, {
          routeId: l.transport_route_id,
          stopId: l.transport_stop_id,
          stopName: l.transport_stop_id ? stopNameById.get(l.transport_stop_id) ?? null : null,
          learnerName: name,
          learnerRoll: l.roll_number || l.register_number || null,
        });
      }
    }
  }
  if (mode === 'today_booking') {
    for (let i = 0; i < learnerIds.length; i += CHUNK) {
      const slice = learnerIds.slice(i, i + CHUNK);
      const { data: bk, error } = await supabase
        .from('tms_booking').select('learner_id, route_id, stop_id')
        .eq('travel_date', date).in('learner_id', slice);
      if (error) throw new Error(`current bookings: ${error.message}`);
      for (const b of bk ?? []) {
        const nm = nameById.get(b.learner_id);
        current.set(b.learner_id, {
          routeId: b.route_id,
          stopId: b.stop_id,
          stopName: b.stop_id ? stopNameById.get(b.stop_id) ?? null : null,
          learnerName: nm?.name ?? 'Unknown learner',
          learnerRoll: nm?.roll ?? null,
        });
      }
    }
  }

  // 5) Plan.
  const plan = planManualMoves(moves, routes, current, stopNameToIdByRoute);

  // 6) Run header.
  const { data: run, error: runErr } = await supabase
    .from('tms_route_optimization')
    .insert({
      travel_date: date, mode, threshold_percent: threshold,
      total_moves: 0, routes_cancelled: 0, estimated_savings: 0,
      summary: { mode, requested: moves.length, applied: 0, skipped: plan.skipped.length },
      status: 'applied', created_by: actorId,
    })
    .select('id').single();
  if (runErr || !run) throw new Error(`create run: ${runErr?.message ?? 'no row'}`);
  const runId = run.id as string;

  // 7) Execute guarded moves.
  let applied = 0;
  const extraSkips: { learnerId: string; reason: string }[] = [];
  const items: Record<string, unknown>[] = [];
  const fromLabel = (id: string) => routeList.find((r) => r.id === id)?.id ?? id;
  for (const mv of plan.moves) {
    let ok = false;
    if (mode === 'today_booking') {
      const { data: u, error } = await supabase
        .from('tms_booking').update({ route_id: mv.toRouteId, stop_id: mv.toStopId })
        .eq('learner_id', mv.learnerId).eq('travel_date', date).eq('route_id', mv.fromRouteId)
        .select('learner_id');
      ok = !error && !!u && u.length > 0;
    } else {
      const { data: u, error } = await supabase
        .from('learners_profiles').update({ transport_route_id: mv.toRouteId, transport_stop_id: mv.toStopId })
        .eq('id', mv.learnerId).eq('transport_route_id', mv.fromRouteId)
        .select('id');
      ok = !error && !!u && u.length > 0;
    }
    if (!ok) { extraSkips.push({ learnerId: mv.learnerId, reason: 'Changed during apply' }); continue; }
    applied++;
    items.push({
      optimization_id: runId, learner_id: mv.learnerId, travel_date: date,
      learner_label: mv.learnerLabel,
      from_route_id: mv.fromRouteId, from_route_label: fromLabel(mv.fromRouteId), from_stop_id: mv.fromStopId,
      to_route_id: mv.toRouteId, to_route_label: fromLabel(mv.toRouteId), to_stop_id: mv.toStopId,
    });
  }
  if (items.length) {
    const { error } = await supabase.from('tms_route_optimization_item').insert(items);
    if (error) throw new Error(`insert items: ${error.message}`);
  }

  // 8) routes_cancelled + savings (today mode only).
  let routesCancelled = 0;
  let estimatedSavings = 0;
  if (mode === 'today_booking') {
    const sourceIds = Array.from(new Set(plan.moves.map((m) => m.fromRouteId)));
    for (const rid of sourceIds) {
      const { count } = await supabase
        .from('tms_booking').select('learner_id', { count: 'exact', head: true })
        .eq('travel_date', date).eq('route_id', rid);
      if ((count ?? 0) === 0) { routesCancelled++; estimatedSavings += DEFAULT_DAILY_BUS_COST; }
    }
  }

  await supabase.from('tms_route_optimization')
    .update({ total_moves: applied, routes_cancelled: routesCancelled, estimated_savings: estimatedSavings,
      summary: { mode, requested: moves.length, applied, skipped: plan.skipped.length + extraSkips.length } })
    .eq('id', runId);

  return { runId, mode, date, applied, skipped: [...plan.skipped, ...extraSkips], routesCancelled, estimatedSavings };
}
```

- [ ] **Step 2: Make `rollbackRun` mode-aware**

Replace the body of the existing `rollbackRun` so it reads `mode` and restores the right table. Change the run select to include `mode`, and branch the per-item UPDATE:
```ts
  const { data: run, error: runErr } = await supabase
    .from('tms_route_optimization')
    .select('id, status, mode')
    .eq('id', runId)
    .single();
  if (runErr || !run) throw new Error('Optimization run not found');
  if (run.status === 'rolled_back') {
    return { restored: 0, skipped: 0, alreadyRolledBack: true };
  }
  const mode = (run.mode ?? 'today_booking') as ApplyMode;

  const { data: itemRows, error: itemErr } = await supabase
    .from('tms_route_optimization_item')
    .select('learner_id, travel_date, from_route_id, from_stop_id, to_route_id')
    .eq('optimization_id', runId);
  if (itemErr) throw new Error(`items: ${itemErr.message}`);

  let restored = 0;
  let skipped = 0;
  for (const it of itemRows ?? []) {
    if (!it.from_route_id) { skipped++; continue; }
    let ok = false;
    if (mode === 'today_booking') {
      const { data, error } = await supabase
        .from('tms_booking').update({ route_id: it.from_route_id, stop_id: it.from_stop_id })
        .eq('learner_id', it.learner_id).eq('travel_date', it.travel_date).eq('route_id', it.to_route_id)
        .select('learner_id');
      ok = !error && !!data && data.length > 0;
    } else {
      const { data, error } = await supabase
        .from('learners_profiles').update({ transport_route_id: it.from_route_id, transport_stop_id: it.from_stop_id })
        .eq('id', it.learner_id).eq('transport_route_id', it.to_route_id)
        .select('id');
      ok = !error && !!data && data.length > 0;
    }
    if (!ok) { skipped++; continue; }
    restored++;
  }

  await supabase
    .from('tms_route_optimization')
    .update({ status: 'rolled_back', rolled_back_at: new Date().toISOString(), rolled_back_by: actorId })
    .eq('id', runId);

  return { restored, skipped, alreadyRolledBack: false };
```
(The `rollbackRun` signature — `(supabase, { runId, actorId })` → `RollbackResult` — is unchanged from Phase 2.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -i "route-optimization/apply"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git status
git add lib/route-optimization/apply.ts
git commit -m "feat(route-opt): manual-move DB executor + mode-aware rollback"
```

---

### Task 4: API — apply endpoint takes explicit moves; GET returns mode

**Files:**
- Modify: `app/api/admin/route-optimization/execute-transfers/route.ts`
- Modify: `app/api/admin/route-optimization/route.ts`

**Interfaces:**
- Consumes: `applyManualMoves`, `type ApplyMode` from `@/lib/route-optimization/apply`.

- [ ] **Step 1: Rewrite the apply handler**

Replace the body of `handlePost` in `execute-transfers/route.ts` (keep the `canEdit` helper + `withAuth` export):
```ts
  const body = await request.json().catch(() => ({}));
  const date: unknown = body?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date (YYYY-MM-DD) is required' }, { status: 400 });
  }
  const mode = body?.mode === 'permanent' ? 'permanent' : 'today_booking';
  const thresholdRaw = Number(body?.threshold);
  const threshold = Number.isFinite(thresholdRaw) && thresholdRaw >= 1 && thresholdRaw <= 100 ? Math.round(thresholdRaw) : 50;
  const rawMoves = Array.isArray(body?.moves) ? body.moves : [];
  const moves = rawMoves
    .filter((m: unknown): m is { learnerId: string; fromRouteId: string; toRouteId: string } =>
      !!m && typeof (m as Record<string, unknown>).learnerId === 'string'
          && typeof (m as Record<string, unknown>).fromRouteId === 'string'
          && typeof (m as Record<string, unknown>).toRouteId === 'string');
  if (moves.length === 0) {
    return NextResponse.json({ error: 'Select at least one passenger move to apply' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await applyManualMoves(supabase, { date, mode, threshold, moves, actorId: auth.userId });
    await logActivity(auth, request, {
      module: 'route-optimization',
      action: 'assign',
      entityType: mode === 'permanent' ? 'learners_profiles' : 'tms_booking',
      entityId: result.runId,
      entityLabel: `${result.applied} move(s) · ${date}`,
      description: `Applied ${mode === 'permanent' ? 'permanent ' : ''}route allocation for ${date}: ${result.applied} moved, ${result.skipped.length} skipped, ${result.routesCancelled} bus(es) freed`,
      metadata: { mode, ...result },
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('route-optimization: apply failed', error);
    return NextResponse.json({ error: 'Failed to apply allocation' }, { status: 500 });
  }
```
Update the import line to `import { applyManualMoves } from '@/lib/route-optimization/apply';` (drop `DEFAULT_OPTIONS`/`applyConsolidations` if unused).

- [ ] **Step 2: Include `mode` in the GET appliedRuns select**

In `app/api/admin/route-optimization/route.ts`, add `mode` to the `appliedRuns` select string:
```ts
      .select('id, travel_date, mode, threshold_percent, total_moves, routes_cancelled, estimated_savings, status, created_at, created_by, rolled_back_at')
```

- [ ] **Step 3: Type-check + route probe**

Run: `npx tsc --noEmit 2>&1 | grep -iE "route-optimization/(route|execute-transfers)"`
Expected: no output.
Run (dev server up): `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/admin/route-optimization/execute-transfers -H 'Content-Type: application/json' -d '{}'`
Expected: `401` (unauthenticated — withAuth gate works).

- [ ] **Step 4: Commit**

```bash
git status
git add app/api/admin/route-optimization/execute-transfers/route.ts app/api/admin/route-optimization/route.ts
git commit -m "feat(route-opt): apply endpoint takes explicit moves + mode; GET returns mode"
```

---

### Task 5: UI — per-passenger target dropdown + mode toggle

**Files:**
- Modify: `app/(admin)/route-optimization/page.tsx`

**Interfaces:**
- Consumes: GET `analysis.routes` (each `{ routeId, routeName, routeNumber, currentPassengers, capacity }`), `analysis.suggestions[].relocations[]` (each `{ learnerId, learnerName, learnerRoll, boardingStop, feasible, targetRouteId, ... }`).

- [ ] **Step 1: Build the active-route option list with spare**

Inside the component, after `analysis` is set, derive a memoized list used by every dropdown:
```tsx
const routeOptions = useMemo(() => {
  const rs = analysis?.routes ?? [];
  return rs.map((r) => ({
    id: r.routeId,
    label: `${r.routeName}${r.routeNumber ? ` #${r.routeNumber}` : ''}`,
    spare: Math.max(0, r.capacity - r.currentPassengers),
  }));
}, [analysis]);
```

- [ ] **Step 2: Track per-learner target choices**

Add state and a setter, pre-filled from the engine suggestion when the analysis loads:
```tsx
const [targets, setTargets] = useState<Record<string, string>>({}); // learnerId -> toRouteId ('' = unset)

useEffect(() => {
  if (!analysis) return;
  const init: Record<string, string> = {};
  for (const s of analysis.suggestions)
    for (const r of s.relocations)
      init[r.learnerId] = r.feasible && r.targetRouteId ? r.targetRouteId : '';
  setTargets(init);
}, [analysis]);
```

- [ ] **Step 3: Render a dropdown in each relocation row**

In `SuggestionRow`, pass `routeOptions`, `targets`, `onTarget(learnerId, routeId)` down, and replace the "Moves to" cell's content with a `<select>`:
```tsx
<td className="px-3 py-2">
  <select
    value={targets[r.learnerId] ?? ''}
    onChange={(e) => onTarget(r.learnerId, e.target.value)}
    className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900"
  >
    <option value="">— pick a bus —</option>
    {routeOptions
      .filter((o) => o.id !== s.routeId)
      .map((o) => (
        <option key={o.id} value={o.id} disabled={o.spare <= 0 && o.id !== (r.feasible ? r.targetRouteId : '')}>
          {o.label} ({o.spare} free){r.feasible && o.id === r.targetRouteId ? ' · suggested' : ''}
        </option>
      ))}
  </select>
  {targets[r.learnerId] && !r.feasible && (
    <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">manual override</span>
  )}
</td>
```

- [ ] **Step 4: Build the moves payload from selected sources**

Replace `applySelected`'s body to gather moves and send the new payload, plus a `mode` arg:
```tsx
const applySelected = useCallback(async (mode: 'today_booking' | 'permanent') => {
  setApplying(true);
  try {
    const moves: { learnerId: string; fromRouteId: string; toRouteId: string }[] = [];
    for (const s of (analysis?.suggestions ?? []).filter((x) => selected.has(x.routeId)))
      for (const r of s.relocations) {
        const to = targets[r.learnerId];
        if (to) moves.push({ learnerId: r.learnerId, fromRouteId: s.routeId, toRouteId: to });
      }
    if (moves.length === 0) { toast.error('No targets chosen for the selected routes'); return; }
    const res = await fetch('/api/admin/route-optimization/execute-transfers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, threshold, mode, moves }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to apply');
    const r = json.result;
    toast.success(`Applied ${r.applied} move(s)${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`);
    setConfirmOpen(false);
    await runAnalysis();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Failed to apply');
  } finally {
    setApplying(false);
  }
}, [analysis, selected, targets, date, threshold, runAnalysis]);
```

- [ ] **Step 5: Add the mode toggle to the confirm modal**

Add `const [mode, setMode] = useState<'today_booking' | 'permanent'>('today_booking');` and, inside the confirm modal, before the buttons:
```tsx
<fieldset className="mt-4 space-y-2">
  <label className="flex items-center gap-2 text-sm text-gray-700">
    <input type="radio" name="mode" checked={mode === 'today_booking'} onChange={() => setMode('today_booking')} />
    Today only — move this date&apos;s bookings
  </label>
  <label className="flex items-center gap-2 text-sm text-gray-700">
    <input type="radio" name="mode" checked={mode === 'permanent'} onChange={() => setMode('permanent')} />
    Permanent — change the learners&apos; standing route (does not alter this date&apos;s booking)
  </label>
</fieldset>
```
Change the modal confirm button to call `applySelected(mode)`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -i "route-optimization/page"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git status
git add "app/(admin)/route-optimization/page.tsx"
git commit -m "feat(route-opt): manual per-passenger bus allocation UI + Today/Permanent toggle"
```

---

### Task 6: End-to-end verification on seeded data

**Files:** none (verification only).

- [ ] **Step 1: Full type-check + unit tests**

Run: `npx tsc --noEmit 2>&1 | grep -iE "route-optimization|activity"` → expect no output.
Run: `npx vitest run lib/route-optimization/allocate.test.ts` → expect PASS.

- [ ] **Step 2: Today-mode apply + rollback (SQL cycle)**

Using the Supabase MCP, find one feasible move on `2026-06-25` (an under-utilized route booking whose stop name exists on a healthy route), then mirror the executor: insert a run (`mode='today_booking'`) + item snapshot, run the guarded `tms_booking` UPDATE, `SELECT` to confirm the booking moved, run the guarded restore UPDATE, `SELECT` to confirm it returned to the source route + stop, then `DELETE` the test run (cascades the item). Confirm `tms_booking` count for `2026-06-25` is back to 560.

- [ ] **Step 3: Permanent-mode apply + rollback (SQL cycle)**

Pick a learner with a `transport_route_id`; insert a run (`mode='permanent'`) + item snapshot of their current `transport_route_id/stop`; UPDATE `learners_profiles` to a different active route guarded by `transport_route_id = <from>`; `SELECT` to confirm the allocation changed; confirm the learner's `tms_booking` for `2026-06-25` is UNCHANGED (mode separation); restore guarded by `transport_route_id = <to>`; `SELECT` to confirm restoration; `DELETE` the test run.

- [ ] **Step 4: Capacity guardrail (unit-level)**

Already covered by `allocate.test.ts` "blocks overfill across the batch". Confirm it still passes.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git status
# stage only files you changed during fixups, then:
git commit -m "test(route-opt): verify manual allocation apply/rollback (today + permanent)"
```

---

## Notes for the executor

- The seeded demo bookings live on `travel_date = '2026-06-25'`; remove them anytime with `DELETE FROM tms_booking WHERE travel_date = '2026-06-25';`.
- `applyConsolidations` (Phase 2 auto-apply) is superseded by `applyManualMoves` but may remain in `apply.ts` unused; removing it is optional cleanup, not required.
- Do not write to the dropped legacy tables (`routes`, `bookings`, `students`, etc.) — modern `tms_` plane only.
