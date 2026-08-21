# In-charge Attendance Shares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split each bus route's allocated learners into count-balanced shares — one per in-charge — so every in-charge must mark their own students, can hand their share over when absent, and is billed at month end for a share they leave unmarked.

**Architecture:** Two pure libraries carry all the logic (`share-split.ts` decides who owns whom, `share-coverage.ts` decides whether a share was covered on a date). A repository module is their only DB companion. Two new tables store ownership and absence. Both cron jobs swap their route-level attendance probe for a per-share one, gated behind a new `admin_settings` flag that ships **off**.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role clients), TanStack Query, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-incharge-share-attendance-design.md`

## Global Constraints

- **Modern route pattern only.** Every new API route uses `withAuth` + `AuthContext` from `@/lib/api/with-auth`, `createServiceRoleClient` from `@/lib/supabase/server`, and an explicit permission check. Never `DatabaseService`, never an unprefixed table.
- **Response shape:** `{ success: true, data }` on success, `{ error: string }` with an HTTP status on failure. Boarding routes already vary between `{ success, data }` and `{ success, assignments }` — match the file you are editing.
- **Staff identity:** resolve staff through `resolveStaffId` (`lib/identity/staff-lookup.ts`) and match emails with `emailIlikePattern` (`lib/identity/email-match.ts`). Never a raw `.eq('email', …)`. Only 75 of 109 in-charges resolve via `staff.email`; 108 resolve via `institution_email`.
- **`.in()` chunking:** at most 150 ids per call, following `chunk()` in `lib/booking/roster.ts`. A larger list returns HTTP 400 and an unchecked `{ data }` silently reads as empty.
- **Never let a failed query read as "nobody marked".** Throw. Billing someone for an infrastructure failure is the worst available outcome. Both crons already follow this rule.
- **Tests live under `lib/`.** `vitest.config.ts` includes only `lib/**/*.test.ts` and `proxy.test.ts`. A test placed anywhere else will not run.
- **Verification is `npx vitest run` + `npm run build`.** `npm run lint` crashes (circular config) and `tsc` is chronically red on main for unrelated reasons — neither is a regression signal. Localhost API probes prove nothing because `proxy.ts` 401s before routing.
- **Migrations** are named `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql` and must be committed even when applied through the Supabase MCP tool.
- **New setting flag:** `inchargeShareScoringEnabled`, default `false`. It must be off in every code path until Task 12.
- **Table names:** `tms_incharge_roster_allocation`, `tms_incharge_absence`.
- **Activity logging:** every admin mutation calls `logActivity` from `@/lib/activity/log`. Its `module` and `action` unions are CLOSED — extend the union in that file or the route will not compile.

---

## Phase 1 — Ownership (ships dormant, no behaviour change)

### Task 1: The split algorithm

**Files:**
- Create: `lib/boarding/share-split.ts`
- Test: `lib/boarding/share-split.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ShareStudent { learner_id: string; stop_sequence: number | null; roll: string | null }`
  - `interface ShareInCharge { assignment_id: string; staff_email: string; stop_sequence: number | null }`
  - `interface SharePin { learner_id: string; assignment_id: string }`
  - `interface Share { assignment_id: string; learner_ids: string[] }`
  - `splitRouteShare(input: { students: ShareStudent[]; inCharges: ShareInCharge[]; pinned?: SharePin[] }): Share[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/boarding/share-split.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitRouteShare, type ShareStudent, type ShareInCharge } from './share-split';

/** n students spread evenly across `stops` stops, roll numbers R001.. */
function students(n: number, stops: number): ShareStudent[] {
  return Array.from({ length: n }, (_, i) => ({
    learner_id: `L${String(i + 1).padStart(3, '0')}`,
    stop_sequence: (i % stops) + 1,
    roll: `R${String(i + 1).padStart(3, '0')}`,
  }));
}

function inCharges(n: number, stopSequences: number[]): ShareInCharge[] {
  return Array.from({ length: n }, (_, i) => ({
    assignment_id: `A${String(i + 1).padStart(2, '0')}`,
    staff_email: `staff${String(i + 1).padStart(2, '0')}@jkkn.ac.in`,
    stop_sequence: stopSequences[i % stopSequences.length],
  }));
}

describe('splitRouteShare', () => {
  it('gives every in-charge a non-empty share on route 29s shape', () => {
    // Route 29 measured 2026-08-21: 14 in-charges sharing only 4 distinct
    // boarding stops, 48 students over 21 stops. A stop-based split would
    // leave 10 of the 14 owning nothing; this is the case that decided the
    // algorithm.
    const shares = splitRouteShare({
      students: students(48, 21),
      inCharges: inCharges(14, [3, 3, 3, 7, 7, 12, 12, 12, 18, 18, 18, 18, 21, 21]),
    });
    expect(shares).toHaveLength(14);
    for (const s of shares) expect(s.learner_ids.length).toBeGreaterThan(0);
  });

  it('balances counts to within one student', () => {
    const shares = splitRouteShare({ students: students(48, 21), inCharges: inCharges(14, [1]) });
    const sizes = shares.map((s) => s.learner_ids.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('assigns every student exactly once', () => {
    const shares = splitRouteShare({ students: students(48, 21), inCharges: inCharges(14, [1]) });
    const all = shares.flatMap((s) => s.learner_ids);
    expect(all).toHaveLength(48);
    expect(new Set(all).size).toBe(48);
  });

  it('gives each in-charge a contiguous band in stop order', () => {
    // 12 students at stops 1..12, 3 in-charges -> stops 1-4, 5-8, 9-12.
    const shares = splitRouteShare({ students: students(12, 12), inCharges: inCharges(3, [1, 5, 9]) });
    expect(shares[0].learner_ids).toEqual(['L001', 'L002', 'L003', 'L004']);
    expect(shares[1].learner_ids).toEqual(['L005', 'L006', 'L007', 'L008']);
    expect(shares[2].learner_ids).toEqual(['L009', 'L010', 'L011', 'L012']);
  });

  it('handles fewer stops than in-charges', () => {
    const shares = splitRouteShare({ students: students(20, 2), inCharges: inCharges(5, [1, 1, 2, 2, 2]) });
    expect(shares).toHaveLength(5);
    expect(shares.every((s) => s.learner_ids.length === 4)).toBe(true);
  });

  it('leaves trailing shares empty when there are fewer students than in-charges', () => {
    const shares = splitRouteShare({ students: students(2, 2), inCharges: inCharges(5, [1]) });
    expect(shares).toHaveLength(5);
    expect(shares.filter((s) => s.learner_ids.length > 0)).toHaveLength(2);
  });

  it('returns no shares when the route has no in-charges', () => {
    // Routes 37, 13 and 10 carry 150 students between them and have zero
    // in-charges. Nobody owns them and nobody is billed.
    expect(splitRouteShare({ students: students(74, 12), inCharges: [] })).toEqual([]);
  });

  it('gives stop-less students to the least-loaded in-charge', () => {
    const withNoStop: ShareStudent[] = [
      ...students(4, 2),
      { learner_id: 'LX', stop_sequence: null, roll: 'R999' },
    ];
    // 4 placed students over 3 in-charges -> sizes 2,1,1; LX must go to the
    // first in-charge holding only 1, i.e. A02.
    const shares = splitRouteShare({ students: withNoStop, inCharges: inCharges(3, [1, 2, 3]) });
    const owner = shares.find((s) => s.learner_ids.includes('LX'));
    expect(owner?.assignment_id).toBe('A02');
  });

  it('honours pinned learners and excludes them from the balanced pool', () => {
    const shares = splitRouteShare({
      students: students(12, 12),
      inCharges: inCharges(3, [1, 5, 9]),
      pinned: [{ learner_id: 'L001', assignment_id: 'A03' }],
    });
    expect(shares.find((s) => s.assignment_id === 'A03')?.learner_ids).toContain('L001');
    expect(shares.find((s) => s.assignment_id === 'A01')?.learner_ids).not.toContain('L001');
    expect(shares.flatMap((s) => s.learner_ids).filter((id) => id === 'L001')).toHaveLength(1);
  });

  it('ignores a pin that names an in-charge who is no longer on the route', () => {
    const shares = splitRouteShare({
      students: students(6, 6),
      inCharges: inCharges(2, [1, 4]),
      pinned: [{ learner_id: 'L001', assignment_id: 'A99' }],
    });
    expect(shares.flatMap((s) => s.learner_ids)).toContain('L001');
  });

  it('is deterministic regardless of input order', () => {
    const s = students(30, 10);
    const ic = inCharges(4, [2, 2, 6, 9]);
    const a = splitRouteShare({ students: s, inCharges: ic });
    const b = splitRouteShare({ students: [...s].reverse(), inCharges: [...ic].reverse() });
    expect(b).toEqual(a);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/share-split.test.ts`
Expected: FAIL — `Failed to resolve import "./share-split"`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/share-split.ts`:

```ts
/**
 * Pure allocation of a route's students to its in-charges.
 *
 * Every in-charge must be answerable for a share of the bus, so the route's
 * students are cut into contiguous, count-balanced bands — one per in-charge.
 *
 * The load-bearing choice is that the cut is made over the ORDERED STUDENT
 * LIST, not over the stop list. Measured on route 29 (2026-08-21): fourteen
 * in-charges share only FOUR distinct boarding stops, so handing each person
 * "the students at your own stop" would leave ten of them owning nothing. It
 * also breaks on any route with fewer stops than in-charges. Cutting students
 * keeps the bands contiguous in stop order — you mark the people boarding
 * around you — while guaranteeing the counts stay within one of each other.
 *
 * A band boundary may fall inside a single busy stop. That is accepted: an
 * even share matters more than a whole stop.
 *
 * No I/O — lib/boarding/allocation-repo.ts gathers the facts, this decides.
 */

export interface ShareStudent {
  learner_id: string;
  /** tms_route_stop.sequence_order for the student's stop; null when unset. */
  stop_sequence: number | null;
  roll: string | null;
}

export interface ShareInCharge {
  assignment_id: string;
  staff_email: string;
  /** sequence_order of the in-charge's OWN boarding stop on this route. */
  stop_sequence: number | null;
}

export interface SharePin {
  learner_id: string;
  assignment_id: string;
}

export interface Share {
  assignment_id: string;
  learner_ids: string[];
}

/**
 * Sorts last. Used for both a student with no stop and an in-charge whose own
 * stop is not on this route (2 of 109 measured).
 */
const NO_STOP = Number.MAX_SAFE_INTEGER;

const byRoll = (a: ShareStudent, b: ShareStudent) =>
  (a.roll ?? a.learner_id).localeCompare(b.roll ?? b.learner_id, undefined, { numeric: true });

export function splitRouteShare(input: {
  students: ShareStudent[];
  inCharges: ShareInCharge[];
  pinned?: SharePin[];
}): Share[] {
  // Order the in-charges by their own boarding stop, tie-broken by email.
  //
  // The tie-break is not cosmetic. Fourteen in-charges on four stops means
  // most comparisons ARE ties, and an unstable order would reshuffle every
  // student's owner on each recompute — the one thing a stable share exists
  // to prevent.
  const ordered = [...input.inCharges].sort((a, b) => {
    const sa = a.stop_sequence ?? NO_STOP;
    const sb = b.stop_sequence ?? NO_STOP;
    if (sa !== sb) return sa - sb;
    return a.staff_email.localeCompare(b.staff_email);
  });
  // No in-charge means nobody owns anyone. Three routes are in this state and
  // the coverage board, not this function, is where that becomes visible.
  if (ordered.length === 0) return [];

  const shares = new Map<string, string[]>();
  for (const ic of ordered) shares.set(ic.assignment_id, []);

  // Manual pins win over the balanced split and survive every recompute. A pin
  // naming an in-charge who has since left the route is silently dropped, and
  // the learner rejoins the pool rather than vanishing.
  const pinnedTo = new Map<string, string>();
  for (const p of input.pinned ?? []) {
    if (shares.has(p.assignment_id)) pinnedTo.set(p.learner_id, p.assignment_id);
  }

  const pool: ShareStudent[] = [];
  const stopless: ShareStudent[] = [];
  for (const s of input.students) {
    const pin = pinnedTo.get(s.learner_id);
    if (pin) {
      shares.get(pin)!.push(s.learner_id);
    } else if (s.stop_sequence === null) {
      stopless.push(s);
    } else {
      pool.push(s);
    }
  }

  pool.sort((a, b) => {
    const d = (a.stop_sequence ?? NO_STOP) - (b.stop_sequence ?? NO_STOP);
    return d !== 0 ? d : byRoll(a, b);
  });

  // Contiguous chunks: base size each, remainder spread one at a time across
  // the earliest bands so no two shares differ by more than one student.
  const n = ordered.length;
  const base = Math.floor(pool.length / n);
  const extra = pool.length % n;
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    const size = base + (i < extra ? 1 : 0);
    for (const s of pool.slice(cursor, cursor + size)) {
      shares.get(ordered[i].assignment_id)!.push(s.learner_id);
    }
    cursor += size;
  }

  // Students with no stop cannot sit in any band, so they go to whoever is
  // carrying least — 9 learners system-wide, but the rule must be defined.
  for (const s of [...stopless].sort(byRoll)) {
    let best = ordered[0].assignment_id;
    for (const ic of ordered) {
      if (shares.get(ic.assignment_id)!.length < shares.get(best)!.length) best = ic.assignment_id;
    }
    shares.get(best)!.push(s.learner_id);
  }

  return ordered.map((ic) => ({ assignment_id: ic.assignment_id, learner_ids: shares.get(ic.assignment_id)! }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/share-split.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/share-split.ts lib/boarding/share-split.test.ts
git commit -m "feat(boarding): count-balanced share split for route in-charges"
```

---

### Task 2: Migration for the two new tables

**Files:**
- Create: `supabase/migrations/20260821100000_tms_incharge_shares.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `tms_incharge_roster_allocation` and `tms_incharge_absence`, both read by Task 3 onward.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260821100000_tms_incharge_shares.sql`:

```sql
-- Per-in-charge attendance shares.
--
-- Attendance coverage used to be scored per ROUTE: one mark by one person
-- credited every in-charge on that route. These two tables give each in-charge
-- a share of the bus they are personally answerable for, and a way to hand it
-- over for a day.
--
-- Both ship dormant. Nothing reads them for scoring until the
-- inchargeShareScoringEnabled setting is turned on.

create table if not exists tms_incharge_roster_allocation (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references tms_route(id) on delete cascade,
  assignment_id uuid not null references tms_staff_route_assignment(id) on delete cascade,
  staff_email   text not null,
  learner_id    uuid not null references learners_profiles(id) on delete cascade,
  -- Pinned by an admin. Survives every recompute and is excluded from the
  -- balanced pool.
  is_manual     boolean not null default false,
  allocated_at  timestamptz not null default now(),
  allocated_by  uuid,
  -- One owner per learner, enforced by the database rather than by application
  -- care. A learner belongs to exactly one route, so a UNIQUE on (route_id,
  -- learner_id) would be weaker and would let a stale row on an old route
  -- double-own a student -- i.e. double-bill against two shares.
  constraint tms_incharge_roster_allocation_learner_key unique (learner_id)
);

create index if not exists tms_incharge_roster_allocation_assignment_idx
  on tms_incharge_roster_allocation (assignment_id);
create index if not exists tms_incharge_roster_allocation_route_idx
  on tms_incharge_roster_allocation (route_id);

comment on table tms_incharge_roster_allocation is
  'Which in-charge owns which learner''s attendance. Recomputed on change, never on a schedule -- a stable share is what lets an in-charge learn who their students are.';

create table if not exists tms_incharge_absence (
  id                     uuid primary key default gen_random_uuid(),
  assignment_id          uuid not null references tms_staff_route_assignment(id) on delete cascade,
  staff_email            text not null,
  route_id               uuid not null references tms_route(id) on delete cascade,
  absence_date           date not null,
  reason                 text,
  covering_assignment_id uuid references tms_staff_route_assignment(id) on delete set null,
  cover_status           text not null default 'pending'
                         check (cover_status in ('pending', 'accepted', 'declined', 'uncovered')),
  declared_at            timestamptz not null default now(),
  responded_at           timestamptz,
  -- One declaration per person per day. A second POST updates the first.
  constraint tms_incharge_absence_day_key unique (assignment_id, absence_date)
);

create index if not exists tms_incharge_absence_date_idx
  on tms_incharge_absence (absence_date);
create index if not exists tms_incharge_absence_covering_idx
  on tms_incharge_absence (covering_assignment_id, absence_date);

comment on table tms_incharge_absence is
  'A declared absence excuses the in-charge for that date. An accepted cover moves the duty to the covering in-charge for that date only.';

-- Service-role only, matching tms_incharge_attendance_strike. Every read and
-- write goes through an API route that has already checked authority; leaving
-- RLS enabled with no policy means a stray anon client sees nothing.
alter table tms_incharge_roster_allocation enable row level security;
alter table tms_incharge_absence enable row level security;
```

- [ ] **Step 2: Apply it to the live database**

Use the Supabase MCP `apply_migration` tool with name `tms_incharge_shares` and the SQL above. This project's agent applies migrations against the real app database (project `kvizhngldtiuufknvehv`) and commits the `.sql` alongside.

- [ ] **Step 3: Verify both tables exist and are empty**

Run this through the Supabase MCP `execute_sql` tool:

```sql
select
  (select count(*) from tms_incharge_roster_allocation) as allocations,
  (select count(*) from tms_incharge_absence) as absences;
```

Expected: `allocations = 0`, `absences = 0` — no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821100000_tms_incharge_shares.sql
git commit -m "feat(boarding): tables for in-charge attendance shares and absences"
```

---

### Task 3: The allocation repository

**Files:**
- Create: `lib/boarding/allocation-repo.ts`

**Interfaces:**
- Consumes: `splitRouteShare`, `ShareStudent`, `ShareInCharge`, `SharePin`, `Share` from `./share-split`.
- Produces:
  - `recomputeRouteAllocation(svc: SupabaseClient, routeId: string, actorId: string | null): Promise<{ routeId: string; inCharges: number; allocated: number; unowned: number }>`
  - `loadRouteAllocation(svc: SupabaseClient, routeId: string): Promise<Map<string, { assignment_id: string; staff_email: string }>>` — keyed by `learner_id`
  - `loadShareLearnerIds(svc: SupabaseClient, assignmentId: string): Promise<string[]>`
  - `loadSharesForRoutes(svc: SupabaseClient, routeIds: string[]): Promise<Map<string, string[]>>` — keyed by `assignment_id`

- [ ] **Step 1: Write the implementation**

Create `lib/boarding/allocation-repo.ts`:

```ts
/**
 * DB companion to lib/boarding/share-split.ts.
 *
 * Gathers a route's students, its in-charges and their own boarding stops,
 * hands them to the pure splitter, and replaces the route's allocation rows.
 *
 * Recompute is EXPLICIT, never scheduled. Callers are the staff-route
 * assignment API, the enrollment-request approve/reject path, the admin
 * Rebalance button and the nightly reconcile. A stable share is what lets an
 * in-charge learn who their students are, so a nightly rebalance would defeat
 * the feature.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { splitRouteShare, type ShareInCharge, type SharePin, type ShareStudent } from './share-split';

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

/** Split an id list into <=150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface StopRow { id: string; sequence_order: number | null }
interface LearnerRow { id: string; transport_stop_id: string | null; roll_number: string | null }
interface AssignmentRow { id: string; staff_email: string }
interface StaffStopRow { email: string | null; institution_email: string | null; transport_stop_id: string | null }

/**
 * Rebuild one route's allocation from scratch.
 *
 * Returns counts rather than the shares themselves: the caller is always a
 * mutation handler that wants a log line, not the roster.
 */
export async function recomputeRouteAllocation(
  svc: SupabaseClient,
  routeId: string,
  actorId: string | null,
): Promise<{ routeId: string; inCharges: number; allocated: number; unowned: number }> {
  // 1. The route's stops, so both students and in-charges can be placed in
  //    pickup order.
  const { data: stopData, error: stopErr } = await svc
    .from('tms_route_stop')
    .select('id, sequence_order')
    .eq('route_id', routeId)
    .eq('is_active', true);
  if (stopErr && !isMissingTable(stopErr)) throw stopErr;
  const seqByStop = new Map<string, number | null>(
    ((stopData ?? []) as StopRow[]).map((s) => [s.id, s.sequence_order]),
  );

  // 2. The route's allocated learners.
  const { data: learnerData, error: lErr } = await svc
    .from('learners_profiles')
    .select('id, transport_stop_id, roll_number')
    .eq('transport_route_id', routeId);
  if (lErr) throw lErr;
  const students: ShareStudent[] = ((learnerData ?? []) as LearnerRow[]).map((l) => ({
    learner_id: l.id,
    stop_sequence: l.transport_stop_id ? seqByStop.get(l.transport_stop_id) ?? null : null,
    roll: l.roll_number,
  }));

  // 3. The route's active in-charges.
  const { data: aData, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('id, staff_email')
    .eq('route_id', routeId)
    .eq('is_active', true);
  if (aErr && !isMissingTable(aErr)) throw aErr;
  const assignments = (aData ?? []) as AssignmentRow[];

  // 4. Each in-charge's OWN boarding stop. Staff carry three addresses and the
  //    assignment stores whichever one the admin typed: 108 of 109 resolve via
  //    institution_email but only 75 via staff.email, so BOTH columns are read
  //    and intersected in memory. profiles.email is not all-lowercase, so the
  //    comparison is done on lowered values on our side rather than in the
  //    filter.
  const emails = [...new Set(assignments.map((a) => a.staff_email.toLowerCase()))];
  const stopByEmail = new Map<string, string | null>();
  for (const c of chunk(emails)) {
    for (const column of ['email', 'institution_email'] as const) {
      const { data } = await svc
        .from('staff')
        .select('email, institution_email, transport_stop_id')
        .in(column, c);
      for (const s of (data ?? []) as StaffStopRow[]) {
        for (const addr of [s.email, s.institution_email]) {
          const key = addr?.toLowerCase();
          if (key && !stopByEmail.has(key) && s.transport_stop_id) stopByEmail.set(key, s.transport_stop_id);
        }
      }
    }
  }
  const inCharges: ShareInCharge[] = assignments.map((a) => {
    const stopId = stopByEmail.get(a.staff_email.toLowerCase()) ?? null;
    return {
      assignment_id: a.id,
      staff_email: a.staff_email.toLowerCase(),
      // A stop on a DIFFERENT route is as useless as no stop for ordering
      // this route's band, so it resolves to null and sorts last.
      stop_sequence: stopId && seqByStop.has(stopId) ? seqByStop.get(stopId) ?? null : null,
    };
  });

  // 5. Existing manual pins survive the recompute.
  const { data: pinData, error: pinErr } = await svc
    .from('tms_incharge_roster_allocation')
    .select('learner_id, assignment_id')
    .eq('route_id', routeId)
    .eq('is_manual', true);
  if (pinErr && !isMissingTable(pinErr)) throw pinErr;
  const pinned = (pinData ?? []) as SharePin[];

  const shares = splitRouteShare({ students, inCharges, pinned });

  // 6. Replace the route's rows. Delete-then-insert rather than a diff: the
  //    split is deterministic, so a full replace is the simplest operation
  //    that cannot leave a learner owned by two people.
  const { error: delErr } = await svc
    .from('tms_incharge_roster_allocation')
    .delete()
    .eq('route_id', routeId);
  if (delErr) throw delErr;

  const emailByAssignment = new Map(assignments.map((a) => [a.id, a.staff_email.toLowerCase()]));
  const pinnedSet = new Set(pinned.map((p) => p.learner_id));
  const rows = shares.flatMap((share) =>
    share.learner_ids.map((learnerId) => ({
      route_id: routeId,
      assignment_id: share.assignment_id,
      staff_email: emailByAssignment.get(share.assignment_id) ?? '',
      learner_id: learnerId,
      is_manual: pinnedSet.has(learnerId),
      allocated_by: actorId,
    })),
  );
  for (const c of chunk(rows, 500)) {
    const { error } = await svc.from('tms_incharge_roster_allocation').insert(c);
    if (error) throw error;
  }

  const allocated = rows.length;
  return {
    routeId,
    inCharges: inCharges.length,
    allocated,
    // Students on a route with no in-charge. Not an error -- a coverage gap
    // the admin board reports.
    unowned: students.length - allocated,
  };
}

/** learner_id -> its owner, for one route. Empty map when the table is absent. */
export async function loadRouteAllocation(
  svc: SupabaseClient,
  routeId: string,
): Promise<Map<string, { assignment_id: string; staff_email: string }>> {
  const { data, error } = await svc
    .from('tms_incharge_roster_allocation')
    .select('learner_id, assignment_id, staff_email')
    .eq('route_id', routeId);
  if (error) {
    if (isMissingTable(error)) return new Map();
    throw error;
  }
  const out = new Map<string, { assignment_id: string; staff_email: string }>();
  for (const r of (data ?? []) as Array<{ learner_id: string; assignment_id: string; staff_email: string }>) {
    out.set(r.learner_id, { assignment_id: r.assignment_id, staff_email: r.staff_email });
  }
  return out;
}

/** The learner ids one in-charge owns. */
export async function loadShareLearnerIds(svc: SupabaseClient, assignmentId: string): Promise<string[]> {
  const { data, error } = await svc
    .from('tms_incharge_roster_allocation')
    .select('learner_id')
    .eq('assignment_id', assignmentId);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return ((data ?? []) as { learner_id: string }[]).map((r) => r.learner_id);
}

/** assignment_id -> learner ids, for many routes at once (the cron path). */
export async function loadSharesForRoutes(
  svc: SupabaseClient,
  routeIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const c of chunk(routeIds)) {
    const { data, error } = await svc
      .from('tms_incharge_roster_allocation')
      .select('assignment_id, learner_id')
      .in('route_id', c);
    if (error) {
      if (isMissingTable(error)) return out;
      throw error;
    }
    for (const r of (data ?? []) as { assignment_id: string; learner_id: string }[]) {
      const arr = out.get(r.assignment_id) ?? [];
      arr.push(r.learner_id);
      out.set(r.assignment_id, arr);
    }
  }
  return out;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck lib/boarding/allocation-repo.ts lib/boarding/share-split.ts`
Expected: no errors from these two files. (Project-wide `tsc` is chronically red for unrelated reasons — scope it to these paths.)

- [ ] **Step 3: Commit**

```bash
git add lib/boarding/allocation-repo.ts
git commit -m "feat(boarding): allocation repository for in-charge shares"
```

---

### Task 4: Recompute hooks, backfill and nightly reconcile

**Files:**
- Modify: `app/api/admin/staff-route-assignments/route.ts` (after the insert at the `grantBoardingRole` call, and in `deleteAssignment` after the soft-delete)
- Modify: `app/api/admin/enrollment-requests/route.ts:137` and `:175`
- Create: `app/api/cron/incharge-allocation-reconcile/route.ts`

**Interfaces:**
- Consumes: `recomputeRouteAllocation` from `@/lib/boarding/allocation-repo`.
- Produces: populated `tms_incharge_roster_allocation` rows for all 22 staffed routes.

- [ ] **Step 1: Hook the staff-route assignment API**

In `app/api/admin/staff-route-assignments/route.ts`, add the import:

```ts
import { recomputeRouteAllocation } from '@/lib/boarding/allocation-repo';
```

In `postAssignment`, immediately after `await grantBoardingRole(supabase, staffEmail, auth.userId);` insert:

```ts
    // The route gained an in-charge, so every share on it shrinks. Best-effort:
    // a failed recompute must not undo an assignment that already succeeded —
    // the nightly reconcile repairs it.
    try {
      await recomputeRouteAllocation(supabase, routeId, auth.userId);
    } catch (e) {
      console.error('recomputeRouteAllocation after assign (non-fatal):', e);
    }
```

In `deleteAssignment`, after the row is soft-deleted and `maybeRevokeBoardingRole` is called, add the same block using the deleted row's `route_id`. Read the assignment's `route_id` before the update if the handler does not already have it.

- [ ] **Step 2: Hook the enrollment-request path**

In `app/api/admin/enrollment-requests/route.ts`, add the same import. After the `.update({ transport_route_id: null, transport_stop_id: null })` at line 137, and after the `.update({ transport_route_id: body.routeId, transport_stop_id: body.stopId })` at line 175, recompute the affected route(s):

```ts
      // Both the route the learner LEFT and the one they joined change shape.
      for (const rid of [...new Set([previousRouteId, body.routeId].filter(Boolean))] as string[]) {
        try {
          await recomputeRouteAllocation(supabase, rid, auth.userId);
        } catch (e) {
          console.error('recomputeRouteAllocation after enrollment change (non-fatal):', e);
        }
      }
```

Capture `previousRouteId` from the learner row before the update. For the line-137 clear path there is no new route, so the list holds one id.

- [ ] **Step 3: Write the reconcile cron**

Create `app/api/cron/incharge-allocation-reconcile/route.ts`:

```ts
/**
 * Nightly repair of in-charge share allocation.
 *
 * The explicit recompute hooks cover the paths an admin actually uses, but
 * learner route changes also happen through route optimization
 * (lib/route-optimization/apply.ts) and through direct database edits. This
 * job is the safety net: it recomputes every route whose allocation no longer
 * matches its roster.
 *
 * It is NOT a rebalance. A route whose allocation is already correct is left
 * untouched, because splitRouteShare is deterministic — recomputing an
 * unchanged route produces the identical result, and reshuffling shares for
 * no reason is the thing this design exists to avoid.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recomputeRouteAllocation } from '@/lib/boarding/allocation-repo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Recompute every route regardless of drift. Use for the initial backfill.
  const force = request.nextUrl.searchParams.get('force') === '1';

  const svc = createServiceRoleClient();
  const summary = {
    routes: 0,
    recomputed: 0,
    skipped: 0,
    errors: 0,
    unownedLearners: 0,
    failures: [] as Array<{ routeId: string; message: string }>,
    details: [] as Array<{ routeId: string; inCharges: number; allocated: number; unowned: number }>,
  };

  const { data: routes, error } = await svc.from('tms_route').select('id');
  if (error) return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });

  for (const r of (routes ?? []) as { id: string }[]) {
    summary.routes += 1;
    try {
      if (!force) {
        // Drift check: allocation row count vs allocated-learner count. Cheap,
        // and catches the cases that matter (a learner added, moved or removed).
        const [{ count: allocCount }, { count: learnerCount }] = await Promise.all([
          svc.from('tms_incharge_roster_allocation').select('id', { count: 'exact', head: true }).eq('route_id', r.id),
          svc.from('learners_profiles').select('id', { count: 'exact', head: true }).eq('transport_route_id', r.id),
        ]);
        const { count: icCount } = await svc
          .from('tms_staff_route_assignment')
          .select('id', { count: 'exact', head: true })
          .eq('route_id', r.id)
          .eq('is_active', true);
        // A route with no in-charge legitimately holds zero allocations.
        const expected = (icCount ?? 0) === 0 ? 0 : learnerCount ?? 0;
        if ((allocCount ?? 0) === expected) {
          summary.skipped += 1;
          continue;
        }
      }
      const result = await recomputeRouteAllocation(svc, r.id, null);
      summary.recomputed += 1;
      summary.unownedLearners += result.unowned;
      summary.details.push(result);
    } catch (e) {
      summary.errors += 1;
      summary.failures.push({ routeId: r.id, message: e instanceof Error ? e.message : String(e) });
      console.error('[incharge-allocation-reconcile] failed for route', r.id, e);
    }
  }

  return NextResponse.json({ success: true, data: summary });
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds. If it fails with "could not find bin metadata file", run `bun install` first — that message means a stale `bun.lock`, not a code error.

- [ ] **Step 5: Backfill the live allocation**

Call the reconcile route once with `?force=1` and the `CRON_SECRET` bearer token against the deployed environment (localhost probes are useless — `proxy.ts` 401s before routing). Then verify through Supabase MCP `execute_sql`:

```sql
select r.route_number,
       count(distinct a.assignment_id) as shares,
       count(*) as allocated,
       min(cnt) as smallest_share, max(cnt) as largest_share
from (
  select route_id, assignment_id, learner_id, count(*) over (partition by assignment_id) cnt
  from tms_incharge_roster_allocation
) a
join tms_route r on r.id = a.route_id
group by r.route_number
order by shares desc;
```

Expected: route 29 shows 14 shares with `largest_share - smallest_share <= 1`; routes 37, 13 and 10 do not appear at all.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/staff-route-assignments/route.ts app/api/admin/enrollment-requests/route.ts app/api/cron/incharge-allocation-reconcile/route.ts
git commit -m "feat(boarding): recompute in-charge shares on change, with nightly reconcile"
```

---

## Phase 2 — Share-scoped roster and marking (flag-gated)

### Task 5: Coverage and delegation rules

**Files:**
- Create: `lib/boarding/share-coverage.ts`
- Test: `lib/boarding/share-coverage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface AbsenceRow { assignment_id: string; absence_date: string; covering_assignment_id: string | null; cover_status: 'pending' | 'accepted' | 'declined' | 'uncovered' }`
  - `interface ShareCoverage { required: number; marked: number; missing: string[]; covered: boolean }`
  - `shareDuty(input: { shareLearnerIds: string[]; bookedLearnerIds: string[] }): string[]`
  - `shareCovered(input: { duty: string[]; markedLearnerIds: string[] }): ShareCoverage`
  - `isExcused(assignmentId: string, date: string, absences: AbsenceRow[]): boolean`
  - `delegatedTo(assignmentId: string, date: string, absences: AbsenceRow[]): string[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/boarding/share-coverage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shareDuty, shareCovered, isExcused, delegatedTo, type AbsenceRow } from './share-coverage';

describe('shareDuty', () => {
  it('is the intersection of the share with the days bookings', () => {
    // The attendance roster lists every ALLOCATED learner, including
    // "Without ticket" ones the mark API refuses. Scoring an in-charge on
    // students they are not permitted to mark makes the rule unsatisfiable.
    expect(shareDuty({ shareLearnerIds: ['a', 'b', 'c'], bookedLearnerIds: ['b', 'c', 'z'] })).toEqual(['b', 'c']);
  });

  it('is empty when nobody in the share booked', () => {
    expect(shareDuty({ shareLearnerIds: ['a', 'b'], bookedLearnerIds: ['x'] })).toEqual([]);
  });

  it('preserves the share order', () => {
    expect(shareDuty({ shareLearnerIds: ['c', 'a', 'b'], bookedLearnerIds: ['a', 'b', 'c'] })).toEqual(['c', 'a', 'b']);
  });
});

describe('shareCovered', () => {
  it('is covered when every duty learner has a mark', () => {
    expect(shareCovered({ duty: ['a', 'b'], markedLearnerIds: ['a', 'b', 'c'] })).toEqual({
      required: 2, marked: 2, missing: [], covered: true,
    });
  });

  it('names the learners that are missing', () => {
    expect(shareCovered({ duty: ['a', 'b', 'c'], markedLearnerIds: ['b'] })).toEqual({
      required: 3, marked: 1, missing: ['a', 'c'], covered: false,
    });
  });

  it('treats an empty duty as covered', () => {
    // No duty means no possible failure -- the day is neither credit nor
    // blame, matching the existing no_travel_day outcome.
    expect(shareCovered({ duty: [], markedLearnerIds: [] })).toEqual({
      required: 0, marked: 0, missing: [], covered: true,
    });
  });
});

const absence = (over: Partial<AbsenceRow> = {}): AbsenceRow => ({
  assignment_id: 'A1',
  absence_date: '2026-08-21',
  covering_assignment_id: null,
  cover_status: 'pending',
  ...over,
});

describe('isExcused', () => {
  it('excuses the absentee on the declared date', () => {
    expect(isExcused('A1', '2026-08-21', [absence()])).toBe(true);
  });

  it('excuses them even when nobody accepted the cover', () => {
    // A declared absence excuses regardless of cover: the share simply goes
    // unmarked and shows on the coverage board.
    expect(isExcused('A1', '2026-08-21', [absence({ cover_status: 'declined' })])).toBe(true);
  });

  it('does not excuse a different date', () => {
    expect(isExcused('A1', '2026-08-22', [absence()])).toBe(false);
  });

  it('does not excuse a different assignment', () => {
    expect(isExcused('A2', '2026-08-21', [absence()])).toBe(false);
  });
});

describe('delegatedTo', () => {
  it('returns the shares this in-charge accepted cover for', () => {
    expect(delegatedTo('A2', '2026-08-21', [
      absence({ assignment_id: 'A1', covering_assignment_id: 'A2', cover_status: 'accepted' }),
    ])).toEqual(['A1']);
  });

  it('ignores a pending or declined cover', () => {
    expect(delegatedTo('A2', '2026-08-21', [
      absence({ assignment_id: 'A1', covering_assignment_id: 'A2', cover_status: 'pending' }),
      absence({ assignment_id: 'A3', covering_assignment_id: 'A2', cover_status: 'declined' }),
    ])).toEqual([]);
  });

  it('is scoped to the date', () => {
    expect(delegatedTo('A2', '2026-08-22', [
      absence({ assignment_id: 'A1', covering_assignment_id: 'A2', cover_status: 'accepted' }),
    ])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/share-coverage.test.ts`
Expected: FAIL — `Failed to resolve import "./share-coverage"`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/share-coverage.ts`:

```ts
/**
 * Pure rules for "did this in-charge do their job on this date?".
 *
 * lib/boarding/incharge-attendance.ts answers the ROUTE-level question the old
 * design asked. These answer the per-person question that replaces it.
 *
 * DUTY is deliberately narrower than the share. The attendance roster lists
 * every learner allocated to the bus, including the ones holding no ticket for
 * the day, and POST /api/boarding/attendance refuses to mark those. Scoring an
 * in-charge on students the API will not let them mark would make the rule
 * impossible to satisfy, so duty is the share intersected with the day's
 * bookings.
 *
 * No I/O — the callers gather the facts, these decide.
 */

export interface AbsenceRow {
  assignment_id: string;
  /** 'YYYY-MM-DD' in IST. */
  absence_date: string;
  covering_assignment_id: string | null;
  cover_status: 'pending' | 'accepted' | 'declined' | 'uncovered';
}

export interface ShareCoverage {
  required: number;
  marked: number;
  missing: string[];
  covered: boolean;
}

/** The learners in this share who actually booked a seat for the date. */
export function shareDuty(input: { shareLearnerIds: string[]; bookedLearnerIds: string[] }): string[] {
  const booked = new Set(input.bookedLearnerIds);
  return input.shareLearnerIds.filter((id) => booked.has(id));
}

/**
 * Was the duty discharged? Present and absent both count — absent IS a mark,
 * and an in-charge who records an empty seat has done exactly their job.
 *
 * An empty duty is covered: no duty was possible, so the day is neither credit
 * nor blame. This mirrors the existing `no_travel_day` skip.
 */
export function shareCovered(input: { duty: string[]; markedLearnerIds: string[] }): ShareCoverage {
  const marked = new Set(input.markedLearnerIds);
  const missing = input.duty.filter((id) => !marked.has(id));
  return {
    required: input.duty.length,
    marked: input.duty.length - missing.length,
    missing,
    covered: missing.length === 0,
  };
}

/**
 * A declared absence excuses the absentee for that date, whether or not anyone
 * accepted the cover. Responsibility for finding cover is not placed on someone
 * who is off sick; the uncovered share shows on the admin coverage board
 * instead.
 */
export function isExcused(assignmentId: string, date: string, absences: AbsenceRow[]): boolean {
  return absences.some((a) => a.assignment_id === assignmentId && a.absence_date === date);
}

/**
 * The OTHER assignments whose shares this in-charge must also mark on this
 * date. Only an ACCEPTED cover transfers duty: a pending request has not been
 * agreed to, and making someone answerable for a share they never accepted is
 * the same unfairness the route-level rule had, pointed the other way.
 */
export function delegatedTo(assignmentId: string, date: string, absences: AbsenceRow[]): string[] {
  return absences
    .filter(
      (a) =>
        a.absence_date === date &&
        a.cover_status === 'accepted' &&
        a.covering_assignment_id === assignmentId,
    )
    .map((a) => a.assignment_id);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/share-coverage.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/share-coverage.ts lib/boarding/share-coverage.test.ts
git commit -m "feat(boarding): per-share duty and coverage rules"
```

---

### Task 6: The rollout flag

**Files:**
- Modify: `lib/settings/scheduling.ts`
- Test: `lib/settings/scheduling.test.ts` (create if absent)

**Interfaces:**
- Consumes: nothing.
- Produces: `SchedulingConfig.inchargeShareScoringEnabled: boolean`, default `false`, read via the existing `loadSchedulingConfig(svc)`.

- [ ] **Step 1: Write the failing test**

Create or append to `lib/settings/scheduling.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSchedulingConfig, DEFAULT_SCHEDULING_CONFIG } from './scheduling';

describe('inchargeShareScoringEnabled', () => {
  it('defaults to false', () => {
    // Per-share scoring changes WHO is billed, not merely how many: it
    // narrows credit to your own students but also narrows your denominator
    // to the days they travelled (measured on production it fails FEWER
    // people -- July 104 vs 112, August 109 vs 112). Either way it must never
    // arrive by default; see the field's doc comment in ./scheduling.ts.
    expect(DEFAULT_SCHEDULING_CONFIG.inchargeShareScoringEnabled).toBe(false);
    expect(parseSchedulingConfig({}).inchargeShareScoringEnabled).toBe(false);
  });

  it('reads a stored true', () => {
    expect(parseSchedulingConfig({ inchargeShareScoringEnabled: true }).inchargeShareScoringEnabled).toBe(true);
  });

  it('falls back to false for a non-boolean value', () => {
    expect(parseSchedulingConfig({ inchargeShareScoringEnabled: 'yes' }).inchargeShareScoringEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/settings/scheduling.test.ts`
Expected: FAIL — `inchargeShareScoringEnabled` is `undefined`.

- [ ] **Step 3: Add the field**

In `lib/settings/scheduling.ts`, add to the `SchedulingConfig` interface after `inchargeEnforcementMode`:

```ts
  /**
   * Score in-charge attendance against each staffer's OWN share rather than
   * the route as a whole. Ships OFF.
   *
   * Per-share is NOT uniformly stricter. It narrows CREDIT to marks on your
   * own students, but the same move narrows the DENOMINATOR to the days your
   * own students actually travelled, and an empty duty counts as covered.
   * Measured by dry run against production it fails FEWER people, not more:
   * July 104 vs 112 under the route rule, August 109 vs 112. It still ships
   * OFF -- two independent flags must both be on before any money moves,
   * because "fewer in aggregate" is not "nobody new".
   */
  inchargeShareScoringEnabled: boolean;
```

Add to `DEFAULT_SCHEDULING_CONFIG`:

```ts
  inchargeShareScoringEnabled: false,
```

Add to the object returned by `parseSchedulingConfig`:

```ts
    inchargeShareScoringEnabled: boolOr(
      b.inchargeShareScoringEnabled,
      DEFAULT_SCHEDULING_CONFIG.inchargeShareScoringEnabled,
    ),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/settings/scheduling.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/scheduling.ts lib/settings/scheduling.test.ts
git commit -m "feat(settings): inchargeShareScoringEnabled flag, default off"
```

---

### Task 7: Share fields on the roster API

**Files:**
- Modify: `lib/booking/roster.ts` (the `RosterRow` interface and `buildRosterRows`)
- Modify: `app/api/boarding/attendance/roster/route.ts`

**Interfaces:**
- Consumes: `loadRouteAllocation` from `@/lib/boarding/allocation-repo`; `getBoardingStaffForRoute` from `@/lib/routes/boarding-staff`.
- Produces: `RosterRow` gains `owner_email: string | null`, `owner_name: string | null`, `is_mine: boolean`; the response `data` gains `share: { total: number; marked: number; remaining: number }`.

- [ ] **Step 1: Extend `RosterRow` and `buildRosterRows`**

In `lib/booking/roster.ts`, add to the `RosterRow` interface after `booked`:

```ts
  /**
   * The in-charge who owns this learner's attendance, or null when the route
   * has no in-charges (three routes) or the allocation has not been computed.
   * Ownership is INDEPENDENT of ticket state and attendance state.
   */
  owner_email: string | null;
  owner_name: string | null;
  /** True when the requesting staff owns this learner, or covers their owner today. */
  is_mine: boolean;
```

Change the `buildRosterRows` signature to take an optional fifth argument:

```ts
export function buildRosterRows(
  riders: RosterRider[],
  route: { id: string; route_number: string | null },
  orderedStops: OrderedStop[],
  attendanceByLearner: Map<string, { status: string; method: string | null; scanned_at: string | null }>,
  ownership?: {
    /** learner_id -> owning in-charge. */
    ownerByLearner: Map<string, { staff_email: string; name: string }>;
    /** Emails whose learners belong to the caller (their own + any covered today). */
    mine: Set<string>;
  },
): RosterRow[] {
```

Inside the `riders.map` callback, before the returned object, add:

```ts
    const owner = ownership?.ownerByLearner.get(rider.learner_id) ?? null;
```

and add these three properties to the returned object:

```ts
      owner_email: owner?.staff_email ?? null,
      owner_name: owner?.name ?? null,
      // No ownership data at all (flag off, or the table is empty) means the
      // old behaviour: everything is markable. The mark API is the authority
      // that enforces the restriction; this flag only drives the UI.
      is_mine: ownership ? Boolean(owner && ownership.mine.has(owner.staff_email)) : true,
```

- [ ] **Step 2: Feed ownership from the roster route**

In `app/api/boarding/attendance/roster/route.ts`, add the imports:

```ts
import { loadRouteAllocation } from '@/lib/boarding/allocation-repo';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { delegatedTo, type AbsenceRow } from '@/lib/boarding/share-coverage';
```

After `const svc = createServiceRoleClient();`, load the flag and the caller's own email:

```ts
    const cfg = await loadSchedulingConfig(svc);
    const { data: callerProfile } = await auth.supabase
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const callerEmail = (callerProfile?.email as string | undefined)?.toLowerCase() ?? null;
```

Inside the `for (const rt of routes)` loop, replace the single `rows.push(...)` call with:

```ts
      const riders = await loadRouteAttendanceRoster(svc, rt.id, date);

      let ownership: Parameters<typeof buildRosterRows>[4];
      if (cfg.inchargeShareScoringEnabled) {
        const [allocation, staff] = await Promise.all([
          loadRouteAllocation(svc, rt.id),
          getBoardingStaffForRoute(svc, rt.id),
        ]);
        const nameByEmail = new Map(staff.map((s) => [s.email, s.name] as const));
        const ownerByLearner = new Map<string, { staff_email: string; name: string }>();
        for (const [learnerId, owner] of allocation) {
          ownerByLearner.set(learnerId, {
            staff_email: owner.staff_email,
            name: nameByEmail.get(owner.staff_email) ?? owner.staff_email,
          });
        }

        // "Mine" is my own share plus any share I accepted cover for today.
        const mine = new Set<string>();
        if (callerEmail) {
          mine.add(callerEmail);
          const { data: myAssignment } = await svc
            .from('tms_staff_route_assignment')
            .select('id').eq('route_id', rt.id).eq('staff_email', callerEmail).eq('is_active', true).maybeSingle();
          const myAssignmentId = (myAssignment as { id: string } | null)?.id ?? null;
          if (myAssignmentId) {
            const { data: absData } = await svc
              .from('tms_incharge_absence')
              .select('assignment_id, absence_date, covering_assignment_id, cover_status')
              .eq('route_id', rt.id).eq('absence_date', date);
            const covered = delegatedTo(myAssignmentId, date, (absData ?? []) as AbsenceRow[]);
            if (covered.length) {
              const { data: coveredRows } = await svc
                .from('tms_staff_route_assignment').select('staff_email').in('id', covered);
              for (const c of (coveredRows ?? []) as { staff_email: string }[]) mine.add(c.staff_email.toLowerCase());
            }
          }
        }
        ownership = { ownerByLearner, mine };
      }

      rows.push(...buildRosterRows(
        riders,
        { id: rt.id, route_number: rt.route_number },
        stopsByRoute.get(rt.id) ?? [],
        attByLearner,
        ownership,
      ));
```

- [ ] **Step 3: Add share counts to the response**

Replace the counts block at the end of `getRoster` with:

```ts
    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const booked = rows.filter((r) => r.booked).length;
    // Share counts are over the caller's OWN markable learners only: a share
    // that reads "12 of 12 marked" while the bus still has 30 unmarked riders
    // is the correct answer to "am I done?".
    const mineRows = rows.filter((r) => r.is_mine && r.booked);
    const mineMarked = mineRows.filter((r) => r.status !== 'unmarked').length;
    return NextResponse.json({
      success: true,
      data: {
        date,
        direction,
        rows,
        counts: {
          total: rows.length,
          present,
          absent,
          unmarked: rows.length - present - absent,
          booked,
          withoutTicket: rows.length - booked,
        },
        share: {
          total: mineRows.length,
          marked: mineMarked,
          remaining: mineRows.length - mineMarked,
        },
      },
    });
```

Also add `share: { total: 0, marked: 0, remaining: 0 }` to the `empty` object's `data`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds. Any other `buildRosterRows` caller keeps compiling because the fifth argument is optional.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/roster.ts app/api/boarding/attendance/roster/route.ts
git commit -m "feat(boarding): surface share ownership on the attendance roster"
```

---

### Task 8: Mark authority

**Files:**
- Modify: `app/api/boarding/attendance/route.ts` (the `mark` handler and the `clearMarks` handler)

**Interfaces:**
- Consumes: `loadShareLearnerIds` from `@/lib/boarding/allocation-repo`; `delegatedTo`, `AbsenceRow` from `@/lib/boarding/share-coverage`; `loadSchedulingConfig`.
- Produces: a `not_your_share` rejection reason on `POST /api/boarding/attendance`.

- [ ] **Step 1: Add a shared authority helper**

In `app/api/boarding/attendance/route.ts`, add the imports:

```ts
import { loadShareLearnerIds } from '@/lib/boarding/allocation-repo';
import { delegatedTo, type AbsenceRow } from '@/lib/boarding/share-coverage';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import type { SupabaseClient } from '@supabase/supabase-js';
```

Add this helper above `mark`:

```ts
/**
 * The learner ids this caller may mark on this route and date: their own share
 * plus any share they accepted cover for.
 *
 * Returns null when the share restriction does not apply — the flag is off, or
 * the caller is a super admin, or the route has no allocation at all. A null
 * means "no restriction", which is the pre-share behaviour and the safe
 * default while the feature ships dormant.
 */
async function markableLearnerIds(
  svc: SupabaseClient,
  opts: { callerEmail: string | null; routeId: string; date: string; isSuperAdmin: boolean; enabled: boolean },
): Promise<Set<string> | null> {
  if (!opts.enabled || opts.isSuperAdmin || !opts.callerEmail) return null;

  const { data: myAssignment } = await svc
    .from('tms_staff_route_assignment')
    .select('id')
    .eq('route_id', opts.routeId)
    .eq('staff_email', opts.callerEmail)
    .eq('is_active', true)
    .maybeSingle();
  const myAssignmentId = (myAssignment as { id: string } | null)?.id ?? null;
  if (!myAssignmentId) return null; // Not an in-charge here; the route check already passed.

  const ids = new Set(await loadShareLearnerIds(svc, myAssignmentId));

  const { data: absData } = await svc
    .from('tms_incharge_absence')
    .select('assignment_id, absence_date, covering_assignment_id, cover_status')
    .eq('route_id', opts.routeId)
    .eq('absence_date', opts.date);
  for (const covered of delegatedTo(myAssignmentId, opts.date, (absData ?? []) as AbsenceRow[])) {
    for (const id of await loadShareLearnerIds(svc, covered)) ids.add(id);
  }

  // An allocation that produced nothing for this person is a coverage gap, not
  // a lockout. Restricting them to an empty set would make the route
  // unmarkable, which is worse than the problem this feature solves.
  return ids.size > 0 ? ids : null;
}
```

- [ ] **Step 2: Apply it in `mark`**

In `mark`, after the time-window gate and before the learner-belongs-to-route check, add:

```ts
    const cfg = await loadSchedulingConfig(svc);
    const { data: callerProfile } = await auth.supabase
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const callerEmail = (callerProfile?.email as string | undefined)?.toLowerCase() ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const markable = await markableLearnerIds(svc, {
      callerEmail, routeId, date: today, isSuperAdmin: auth.isSuperAdmin,
      enabled: cfg.inchargeShareScoringEnabled,
    });

    if (markable) {
      const outside = marks.filter((m) => !markable.has(m.learnerId)).map((m) => m.learnerId);
      if (outside.length > 0) {
        // Name the owner. A bare 403 tells the in-charge nothing they can act
        // on, and "ask Priya, they own this student" is the whole point of
        // having an owner.
        const { data: owners } = await svc
          .from('tms_incharge_roster_allocation')
          .select('learner_id, staff_email')
          .in('learner_id', outside.slice(0, 150));
        return NextResponse.json({
          error: 'Some of these students belong to another in-charge on this route.',
          reason: 'not_your_share',
          learners: (owners ?? []) as Array<{ learner_id: string; staff_email: string }>,
        }, { status: 403 });
      }
    }
```

Remove the now-duplicated `const today = new Date().toISOString().slice(0, 10);` further down the handler.

- [ ] **Step 3: Apply the same check in `clearMarks`**

In `clearMarks`, after the assigned-route check and before the delete, add the identical `cfg` / `callerEmail` / `markable` block, then:

```ts
    if (markable) {
      const outside = learnerIds.filter((id) => !markable.has(id));
      if (outside.length > 0) {
        return NextResponse.json({
          error: 'Some of these students belong to another in-charge on this route.',
          reason: 'not_your_share',
        }, { status: 403 });
      }
    }
```

Undoing someone else's mark is at least as consequential as making one, so it carries the same authority.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/api/boarding/attendance/route.ts
git commit -m "feat(boarding): restrict marking to the in-charge's own share"
```

---

### Task 9: Attendance screen shows the share

**Files:**
- Modify: `app/boarding/attendance/columns.tsx`
- Modify: `app/boarding/attendance/page.tsx`

**Interfaces:**
- Consumes: `RosterRow.owner_name`, `RosterRow.is_mine`, and the response's `share` counts from Task 7.
- Produces: no exports other than the existing `getRosterColumns`, which gains an `Owner` column and gates the mark buttons on `row.is_mine`.

- [ ] **Step 1: Add the Owner column and gate the buttons**

In `app/boarding/attendance/columns.tsx`, add a column between `stop_name` and `status`:

```tsx
  {
    accessorKey: 'owner_name',
    id: 'owner',
    header: 'In-charge',
    cell: ({ row }) => {
      const r = row.original;
      if (!r.owner_name) return <span className="text-xs text-gray-400">Unassigned</span>;
      return (
        <span className={r.is_mine ? 'text-xs font-medium text-gray-900 dark:text-gray-100' : 'text-xs text-gray-500'}>
          {r.is_mine ? 'You' : r.owner_name}
        </span>
      );
    },
    filterFn: (row, _id, value: string[]) =>
      value.length === 0 || value.includes(row.original.is_mine ? 'mine' : 'others'),
  },
```

In the actions cell, change the mark buttons' disabled condition from `!canMark || busyId === row.original.learner_id` to:

```tsx
        disabled={!canMark || !row.original.is_mine || busyId === row.original.learner_id}
```

and add a title attribute so the reason is visible:

```tsx
        title={!row.original.is_mine ? `${row.original.owner_name ?? 'Another in-charge'} marks this student` : undefined}
```

- [ ] **Step 2: Default the page to the share and retitle the tiles**

In `app/boarding/attendance/page.tsx`:

Extend `RosterResponse`:

```ts
  share: { total: number; marked: number; remaining: number };
```

Default the counts fallback to include it:

```ts
  const share = data?.share ?? { total: 0, marked: 0, remaining: 0 };
```

Replace the tile row with:

```tsx
          <Tile label="My share" value={share.total} tone="slate" icon={<ListChecks className="h-4 w-4" />} />
          <Tile label="Marked" value={share.marked} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
          <Tile label="Remaining" value={share.remaining} tone="amber" icon={<XCircle className="h-4 w-4" />} />
          <Tile label="On bus" value={counts.total} tone="gray" icon={<TicketX className="h-4 w-4" />} />
```

Add the ownership filter to the `filters` array, first:

```ts
    { columnId: 'owner', title: 'In-charge', options: [{ label: 'My share', value: 'mine' }, { label: 'Others', value: 'others' }] },
```

Update the page description:

```tsx
        <p className="text-gray-600 mt-1 text-sm">
          The whole bus is listed so you can see it is covered, but you mark only
          your own share. Students owned by another in-charge show their name.
        </p>
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Browser smoke test**

The agent's Chrome is unauthenticated, so this needs the USER's browser. Ask them to open `/boarding/attendance` while signed in as an in-charge on route 29 and confirm: the In-charge column shows "You" on roughly 3–4 rows and colleagues' names on the rest; Present/Absent are disabled with a tooltip on the others; the "My share" filter narrows to their own students.

- [ ] **Step 5: Commit**

```bash
git add app/boarding/attendance/columns.tsx app/boarding/attendance/page.tsx
git commit -m "feat(boarding): attendance screen shows and defaults to the in-charge's share"
```

---

## Phase 3 — Absence and cover

### Task 10: Absence API

**Files:**
- Create: `app/api/boarding/absence/route.ts`
- Create: `app/api/boarding/absence/[absenceId]/respond/route.ts`

**Interfaces:**
- Consumes: `getAssignedRouteIdsForUser` from `@/lib/boarding/identity`; `getBoardingStaffForRoute` from `@/lib/routes/boarding-staff`; `notifyProfile` from `@/lib/notifications/notify`; `emailIlikePattern` from `@/lib/identity/email-match`.
- Produces:
  - `GET /api/boarding/absence` → `{ success: true, data: { mine: AbsenceRecord[]; requests: AbsenceRecord[] } }`
  - `POST /api/boarding/absence` body `{ routeId, date, reason?, coveringStaffEmail? }` → `{ success: true, data: { id } }`
  - `POST /api/boarding/absence/[absenceId]/respond` body `{ accept: boolean }` → `{ success: true, data: { cover_status } }`
  - `AbsenceRecord = { id, route_id, route_number, absence_date, reason, cover_status, covering_staff_email, covering_staff_name, staff_email, staff_name }`

- [ ] **Step 1: Write the collection route**

Create `app/api/boarding/absence/route.ts`:

```ts
/**
 * In-charge absence declarations and cover handover.
 *
 * A declared absence excuses the in-charge for that date. Nominating a
 * colleague creates a PENDING cover request; only when that colleague accepts
 * does the duty — and the right to mark the share — transfer for that date.
 *
 * Gated on tms.attendance.scan: declaring you will not be on the bus is a
 * weaker act than marking attendance, and every in-charge already holds .scan.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
import { notifyProfile } from '@/lib/notifications/notify';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function callerEmailOf(auth: AuthContext): Promise<string | null> {
  const { data } = await auth.supabase.from('profiles').select('email').eq('id', auth.userId).maybeSingle();
  return (data?.email as string | undefined)?.toLowerCase() ?? null;
}

interface AbsenceDbRow {
  id: string; assignment_id: string; staff_email: string; route_id: string;
  absence_date: string; reason: string | null;
  covering_assignment_id: string | null; cover_status: string;
}

/** Decorate raw rows with route numbers and staff display names. */
async function decorate(svc: ReturnType<typeof createServiceRoleClient>, rows: AbsenceDbRow[]) {
  if (rows.length === 0) return [];
  const routeIds = [...new Set(rows.map((r) => r.route_id))];
  const { data: routes } = await svc.from('tms_route').select('id, route_number').in('id', routeIds);
  const numById = new Map(((routes ?? []) as { id: string; route_number: string | null }[]).map((r) => [r.id, r.route_number]));

  const coveringIds = [...new Set(rows.map((r) => r.covering_assignment_id).filter(Boolean))] as string[];
  const emailByAssignment = new Map<string, string>();
  if (coveringIds.length) {
    const { data } = await svc.from('tms_staff_route_assignment').select('id, staff_email').in('id', coveringIds);
    for (const a of (data ?? []) as { id: string; staff_email: string }[]) emailByAssignment.set(a.id, a.staff_email.toLowerCase());
  }

  const nameByEmail = new Map<string, string>();
  for (const routeId of routeIds) {
    for (const s of await getBoardingStaffForRoute(svc, routeId)) nameByEmail.set(s.email, s.name);
  }

  return rows.map((r) => {
    const coveringEmail = r.covering_assignment_id ? emailByAssignment.get(r.covering_assignment_id) ?? null : null;
    return {
      id: r.id,
      route_id: r.route_id,
      route_number: numById.get(r.route_id) ?? null,
      absence_date: r.absence_date,
      reason: r.reason,
      cover_status: r.cover_status,
      staff_email: r.staff_email,
      staff_name: nameByEmail.get(r.staff_email.toLowerCase()) ?? r.staff_email,
      covering_staff_email: coveringEmail,
      covering_staff_name: coveringEmail ? nameByEmail.get(coveringEmail) ?? coveringEmail : null,
    };
  });
}

/** GET: my upcoming absences, and the cover requests addressed to me. */
async function getAbsences(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const email = await callerEmailOf(auth);
    if (!email) return NextResponse.json({ success: true, data: { mine: [], requests: [] } });

    const svc = createServiceRoleClient();
    const today = istToday();

    const { data: myAssignments } = await svc
      .from('tms_staff_route_assignment').select('id').eq('staff_email', email).eq('is_active', true);
    const myIds = ((myAssignments ?? []) as { id: string }[]).map((a) => a.id);

    const { data: mineRows } = await svc
      .from('tms_incharge_absence').select('*')
      .ilike('staff_email', emailIlikePattern(email))
      .gte('absence_date', today)
      .order('absence_date', { ascending: true });

    const { data: reqRows } = myIds.length
      ? await svc.from('tms_incharge_absence').select('*')
          .in('covering_assignment_id', myIds)
          .gte('absence_date', today)
          .order('absence_date', { ascending: true })
      : { data: [] as AbsenceDbRow[] };

    return NextResponse.json({
      success: true,
      data: {
        mine: await decorate(svc, (mineRows ?? []) as AbsenceDbRow[]),
        requests: await decorate(svc, (reqRows ?? []) as AbsenceDbRow[]),
      },
    });
  } catch (e) {
    console.error('boarding absence list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST: declare an absence, optionally nominating a covering colleague. */
async function declareAbsence(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      routeId?: string; date?: string; reason?: string; coveringStaffEmail?: string;
    };
    const routeId = String(body.routeId ?? '');
    const date = String(body.date ?? '');
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    // A past absence cannot be declared: the day is already scored, and
    // back-dating an excuse would let anyone erase a miss after the fact.
    if (date < istToday()) {
      return NextResponse.json({ error: 'Absence can only be declared for today or a future day' }, { status: 400 });
    }

    const email = await callerEmailOf(auth);
    if (!email) return NextResponse.json({ error: 'Your profile has no email' }, { status: 400 });

    const assigned = await getAssignedRouteIdsForUser(auth);
    if (!assigned.includes(routeId)) {
      return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const { data: mine } = await svc
      .from('tms_staff_route_assignment').select('id')
      .eq('route_id', routeId).eq('staff_email', email).eq('is_active', true).maybeSingle();
    const assignmentId = (mine as { id: string } | null)?.id;
    if (!assignmentId) return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });

    let coveringAssignmentId: string | null = null;
    const coveringEmail = body.coveringStaffEmail?.toLowerCase().trim() || null;
    if (coveringEmail) {
      if (coveringEmail === email) {
        return NextResponse.json({ error: 'You cannot nominate yourself as cover' }, { status: 400 });
      }
      const { data: cover } = await svc
        .from('tms_staff_route_assignment').select('id')
        .eq('route_id', routeId).eq('staff_email', coveringEmail).eq('is_active', true).maybeSingle();
      coveringAssignmentId = (cover as { id: string } | null)?.id ?? null;
      if (!coveringAssignmentId) {
        return NextResponse.json({ error: 'That colleague is not an in-charge on this route' }, { status: 400 });
      }
    }

    const { data: row, error } = await svc
      .from('tms_incharge_absence')
      .upsert({
        assignment_id: assignmentId,
        staff_email: email,
        route_id: routeId,
        absence_date: date,
        reason: body.reason?.trim() || null,
        covering_assignment_id: coveringAssignmentId,
        // Re-declaring resets the request: a new nominee has not agreed yet,
        // and no nominee at all means nobody is being asked.
        cover_status: coveringAssignmentId ? 'pending' : 'uncovered',
        responded_at: null,
      }, { onConflict: 'assignment_id,absence_date' })
      .select('id')
      .single();
    if (error) {
      console.error('absence upsert error:', error);
      return NextResponse.json({ error: 'Failed to record absence' }, { status: 500 });
    }

    if (coveringEmail) {
      const { data: prof } = await svc.from('profiles').select('id').ilike('email', emailIlikePattern(coveringEmail)).maybeSingle();
      const profileId = (prof as { id: string } | null)?.id;
      if (profileId) {
        await notifyProfile(svc, {
          profileId,
          actorId: auth.userId,
          title: 'Cover requested for bus attendance',
          body: `A colleague on your bus will be absent on ${date} and has asked you to mark their students that day. Open the in-charge page to accept or decline.`,
          url: '/boarding/in-charge',
        });
      }
    }

    await logActivity(auth, request, {
      module: 'boarding',
      action: 'mark',
      entityType: 'tms_incharge_absence',
      entityId: row?.id,
      description: `Declared in-charge absence on ${date} for route ${routeId}`,
      metadata: { routeId, date, coveringEmail },
    });
    return NextResponse.json({ success: true, data: { id: row?.id } }, { status: 201 });
  } catch (e) {
    console.error('boarding absence create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAbsences(request, auth));
export const POST = withAuth((request, auth) => declareAbsence(request, auth));
```

If `logActivity`'s `action` union does not accept `'mark'` for this entity, extend the union in `lib/activity/log.ts` — it is closed and the route will not compile otherwise.

- [ ] **Step 2: Write the respond route**

Create `app/api/boarding/absence/[absenceId]/respond/route.ts`:

```ts
/**
 * Accept or decline a cover request.
 *
 * Only an ACCEPTED cover transfers duty. Declining leaves the absentee excused
 * and the share unmarked — responsibility is never forced onto someone who did
 * not agree to it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyProfile } from '@/lib/notifications/notify';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function respond(
  request: NextRequest,
  auth: AuthContext,
  absenceId: string,
) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { accept?: boolean };
    if (typeof body.accept !== 'boolean') {
      return NextResponse.json({ error: 'accept must be true or false' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const { data: absence } = await svc
      .from('tms_incharge_absence')
      .select('id, staff_email, covering_assignment_id, absence_date, cover_status')
      .eq('id', absenceId)
      .maybeSingle();
    if (!absence) return NextResponse.json({ error: 'Absence not found' }, { status: 404 });

    const { data: prof } = await auth.supabase.from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = (prof?.email as string | undefined)?.toLowerCase();
    if (!email) return NextResponse.json({ error: 'Your profile has no email' }, { status: 400 });

    // Only the nominated colleague may answer. Anyone else answering would be
    // taking on — or refusing — a duty that was never offered to them.
    const { data: coverAssignment } = absence.covering_assignment_id
      ? await svc.from('tms_staff_route_assignment').select('staff_email').eq('id', absence.covering_assignment_id).maybeSingle()
      : { data: null };
    const nominatedEmail = (coverAssignment as { staff_email: string } | null)?.staff_email?.toLowerCase() ?? null;
    if (!nominatedEmail || nominatedEmail !== email) {
      return NextResponse.json({ error: 'This cover request was not addressed to you' }, { status: 403 });
    }

    const { error } = await svc
      .from('tms_incharge_absence')
      .update({
        cover_status: body.accept ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', absenceId);
    if (error) {
      console.error('absence respond error:', error);
      return NextResponse.json({ error: 'Failed to record your response' }, { status: 500 });
    }

    const { data: absenteeProfile } = await svc
      .from('profiles').select('id').ilike('email', emailIlikePattern(absence.staff_email)).maybeSingle();
    const absenteeId = (absenteeProfile as { id: string } | null)?.id;
    if (absenteeId) {
      await notifyProfile(svc, {
        profileId: absenteeId,
        actorId: auth.userId,
        title: body.accept ? 'Your cover request was accepted' : 'Your cover request was declined',
        body: body.accept
          ? `A colleague will mark your students on ${absence.absence_date}.`
          : `Nobody has accepted cover for ${absence.absence_date}. You are still excused for that day, but your students will go unmarked.`,
        url: '/boarding/in-charge',
      });
    }

    return NextResponse.json({ success: true, data: { cover_status: body.accept ? 'accepted' : 'declined' } });
  } catch (e) {
    console.error('boarding absence respond error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth(async (request, auth) => {
  // Next 15 hands params as a Promise; read the id off the URL instead so the
  // handler keeps the plain withAuth signature the rest of the module uses.
  const segments = new URL(request.url).pathname.split('/');
  const absenceId = segments[segments.indexOf('absence') + 1] ?? '';
  if (!absenceId) return NextResponse.json({ error: 'absenceId is required' }, { status: 400 });
  return respond(request, auth, absenceId);
});
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/absence
git commit -m "feat(boarding): in-charge absence declaration and cover handover"
```

---

### Task 11: Absence UI

**Files:**
- Create: `components/boarding/absence-dialog.tsx`
- Modify: `app/boarding/attendance/page.tsx` (add the "I am absent today" action)
- Modify: `app/boarding/in-charge/page.tsx` (add the absences + requests panel)

**Interfaces:**
- Consumes: the three endpoints from Task 10.
- Produces: `<AbsenceDialog open onOpenChange routeId date onDeclared />`, default-exported from `components/boarding/absence-dialog.tsx`.

- [ ] **Step 1: Build the dialog**

Create `components/boarding/absence-dialog.tsx`. Open `components/boarding/scan-dialog.tsx` first and copy its dialog primitive import and wrapper markup verbatim — this folder has one dialog convention and the new file must match it.

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface Colleague { email: string; name: string }

/**
 * Declare that you will not be on the bus on a given day, and optionally ask a
 * colleague to mark your share.
 *
 * The helper text is load-bearing: an in-charge must not believe that failing
 * to find cover is what gets them billed. A declared absence excuses them
 * either way; the uncovered share becomes the transport office's problem, not
 * a sick person's.
 */
export default function AbsenceDialog({
  open,
  onOpenChange,
  routeId,
  date,
  onDeclared,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  routeId: string;
  date: string;
  onDeclared: () => void;
}) {
  const [reason, setReason] = useState('');
  const [covering, setCovering] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: colleagues = [] } = useQuery({
    queryKey: ['route-incharges', routeId],
    enabled: open && Boolean(routeId),
    queryFn: async (): Promise<Colleague[]> => {
      const res = await fetch(`/api/boarding/routes/${routeId}/roster`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json?.success) return [];
      return (json.data?.staff ?? []) as Colleague[];
    },
  });

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/boarding/absence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          routeId,
          date,
          reason: reason.trim() || undefined,
          coveringStaffEmail: covering || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to record absence');
      toast.success(covering ? 'Absence recorded and cover requested' : 'Absence recorded');
      onDeclared();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record absence');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Absent on {date}</h2>

        <label className="mt-4 block text-xs font-medium text-gray-500">Reason (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Sick leave, on duty elsewhere..."
          className="mt-1 h-[38px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <label className="mt-4 block text-xs font-medium text-gray-500">
          Ask a colleague to cover (optional)
        </label>
        <select
          value={covering}
          onChange={(e) => setCovering(e.target.value)}
          className="mt-1 h-[38px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Nobody — leave my share unmarked</option>
          {colleagues.map((c) => (
            <option key={c.email} value={c.email}>{c.name}</option>
          ))}
        </select>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          You are excused for this day either way. If nobody covers, your students
          will go unmarked and the transport office will see the gap.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-[38px] rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-[38px] rounded-lg bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Record absence'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

If `GET /api/boarding/routes/[routeId]/roster` does not return a `staff` array, add one to that route's response using `getBoardingStaffForRoute(svc, routeId)` from `@/lib/routes/boarding-staff`, which already returns exactly `{ name, email }[]`, and filter out the caller's own email.

- [ ] **Step 2: Wire the action into the attendance page**

In `app/boarding/attendance/page.tsx`, add `const [absenceOpen, setAbsenceOpen] = useState(false);`, render `<AbsenceDialog ... />` beside `<ScanDialog ... />`, and add a toolbar button next to Scan:

```tsx
            {isToday && rows.length > 0 && (
              <button
                type="button"
                onClick={() => setAbsenceOpen(true)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                I am absent today
              </button>
            )}
```

Pass `routeId={rows[0]?.route_id ?? ''}` — an in-charge assigned to more than one route picks the route inside the dialog.

- [ ] **Step 3: Add the panel to the in-charge page**

In `app/boarding/in-charge/page.tsx`, add a React Query fetch of `/api/boarding/absence` keyed `['incharge-absence']` and render two lists:

- **My absences** — date, route, cover status badge (`pending` amber, `accepted` green, `declined`/`uncovered` gray)
- **Cover requests for you** — the colleague's name, date, route, and Accept / Decline buttons posting to `/api/boarding/absence/${id}/respond` with `{ accept }`, invalidating `['incharge-absence']` and `['boarding-roster']` on success

Invalidate the derived `['boarding-roster']` key too — this project has a documented class of bug where a save succeeds but the screen still shows stale data because only the primary key was invalidated.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Browser smoke test**

Needs the USER's browser (the agent's Chrome is unauthenticated). Have two in-charges on the same route: one declares absence nominating the other; the second sees the request on `/boarding/in-charge`, accepts; the second's `/boarding/attendance` now shows the first's students as markable ("You"), and the first's roster shows them as no longer theirs.

- [ ] **Step 6: Commit**

```bash
git add components/boarding/absence-dialog.tsx app/boarding/attendance/page.tsx app/boarding/in-charge/page.tsx
git commit -m "feat(boarding): absence declaration and cover UI"
```

---

## Phase 4 — Per-share scoring (flag-gated)

### Task 12: Daily loop scores the share

**Files:**
- Modify: `app/api/cron/incharge-attendance/route.ts`

**Interfaces:**
- Consumes: `loadShareLearnerIds` from `@/lib/boarding/allocation-repo`; `shareDuty`, `shareCovered`, `isExcused`, `delegatedTo`, `AbsenceRow` from `@/lib/boarding/share-coverage`; `cfg.inchargeShareScoringEnabled`.
- Produces: `summary` gains `shareScored: number` and each `plan` entry gains `dutyRequired` / `dutyMarked`.

- [ ] **Step 1: Replace the route-level probe**

Add the imports, then replace the `attendanceMarked` block (currently the `.select('id', { count: 'exact', head: true })` on `tms_attendance` around line 170) with:

```ts
      // Route-level coverage: ANY mark on this route today, either leg, counts.
      // This is the ORIGINAL rule and stays in force until the share flag is
      // on — one mark by one person credits every in-charge on the route.
      let attendanceMarked = false;
      let dutyRequired = 0;
      let dutyMarked = 0;

      if (a.route_id && cfg.inchargeShareScoringEnabled) {
        // Per-share coverage. A declared absence excuses the day outright.
        const { data: absData, error: absErr } = await svc
          .from('tms_incharge_absence')
          .select('assignment_id, absence_date, covering_assignment_id, cover_status')
          .eq('route_id', a.route_id)
          .eq('absence_date', date);
        if (absErr) throw new Error(`absence load failed: ${absErr.message}`);
        const absences = (absData ?? []) as AbsenceRow[];

        if (isExcused(a.id, date, absences)) {
          summary.skipped++;
          continue;
        }

        // My share, plus any share I accepted cover for today.
        const shareIds = new Set(await loadShareLearnerIds(svc, a.id));
        for (const covered of delegatedTo(a.id, date, absences)) {
          for (const id of await loadShareLearnerIds(svc, covered)) shareIds.add(id);
        }

        const duty = shareDuty({
          shareLearnerIds: [...shareIds],
          bookedLearnerIds: roster.riders.map((r) => r.learner_id),
        });

        // Only fetch marks when there is a duty to check.
        let markedIds: string[] = [];
        if (duty.length > 0) {
          const { data: att, error: attErr } = await svc
            .from('tms_attendance')
            .select('learner_id')
            .eq('route_id', a.route_id)
            .eq('trip_date', date)
            .in('learner_id', duty.slice(0, 150));
          // NEVER let a failed query read as "nobody marked" — that strikes,
          // and eventually BILLS, a staffer for an infrastructure failure.
          if (attErr) throw new Error(`attendance load failed: ${attErr.message}`);
          markedIds = ((att ?? []) as { learner_id: string }[]).map((r) => r.learner_id);
        }

        const coverage = shareCovered({ duty, markedLearnerIds: markedIds });
        dutyRequired = coverage.required;
        dutyMarked = coverage.marked;
        // An EMPTY duty must not read as a miss. shareCovered already returns
        // covered:true for it, and evaluateDay's hasBookedRiders check is the
        // second guard.
        attendanceMarked = coverage.covered;
        summary.shareScored += 1;
      } else if (a.route_id) {
        const { count, error: attErr } = await svc
          .from('tms_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('route_id', a.route_id)
          .eq('trip_date', date);
        if (attErr) throw new Error(`attendance count failed: ${attErr.message}`);
        attendanceMarked = (count ?? 0) > 0;
      }
```

A share larger than 150 would be truncated by the `.in()` limit, so guard it: if `duty.length > 150`, loop the chunks and concatenate `markedIds`, using the same `chunk` shape as `lib/booking/roster.ts`. The largest measured share is 67 (route 24), but the guard must exist because a route losing its in-charges collapses every student onto one share.

- [ ] **Step 2: Add the summary fields**

In the `summary` object literal add `shareScored: 0,` and extend the `plan` entry type with `dutyRequired: number; dutyMarked: number;`, populating both wherever `summary.plan.push` is called.

- [ ] **Step 3: Verify with a dry run**

Call the cron with `?dryRun=1` and the `CRON_SECRET` bearer against the deployed environment while the flag is still **off**. Confirm `shareScored: 0` and that the `plan` matches the pre-change behaviour exactly — the old path must be untouched.

Then set `inchargeShareScoringEnabled: true` in the `admin_settings` scheduling blob **temporarily**, re-run with `?dryRun=1`, and confirm `shareScored` equals the number of evaluated assignments and that `dutyRequired` is small and plausible (3–4 on route 29, up to 67 on route 24). **Set the flag back to false immediately** — `dryRun` writes nothing, but leaving the flag on changes the mark API's behaviour for live users.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/incharge-attendance/route.ts
git commit -m "feat(boarding): daily loop scores each in-charge's own share"
```

---

### Task 13: Month verdict scores the share

**Files:**
- Modify: `app/api/cron/incharge-month-verdict/route.ts`

**Interfaces:**
- Consumes: the same imports as Task 12.
- Produces: `summary.plan` entries gain `scoredBy: 'route' | 'share'`.

- [ ] **Step 1: Add a per-share marked-dates path**

The existing `routeDates(routeId)` helper caches booking and attendance dates per route and the verdict intersects them. Under per-share scoring the *marked* set becomes per assignment, so add alongside it:

```ts
  /**
   * Dates in the window on which THIS assignment's duty was fully covered.
   *
   * The route-level cache above cannot answer this: two in-charges on the same
   * route now have different answers for the same day. The bookings are still
   * shared, so only the attendance side is recomputed per person.
   */
  async function shareMarkedDates(
    assignmentId: string,
    routeId: string,
    from: string,
    to: string,
  ): Promise<{ marked: string[]; excused: string[] }> {
    const shareIds = await loadShareLearnerIds(svc, assignmentId);
    if (shareIds.length === 0) return { marked: [], excused: [] };

    const { data: absData, error: absErr } = await svc
      .from('tms_incharge_absence')
      .select('assignment_id, absence_date, covering_assignment_id, cover_status')
      .eq('route_id', routeId)
      .gte('absence_date', from)
      .lte('absence_date', to);
    if (absErr) throw new Error(`absence load failed: ${absErr.message}`);
    const absences = (absData ?? []) as AbsenceRow[];

    // Bookings per learner per date, so duty can be computed for each date.
    const { data: bookings, error: bErr } = await svc
      .from('tms_booking')
      .select('travel_date, learner_id')
      .eq('route_id', routeId)
      .gte('travel_date', from)
      .lte('travel_date', to);
    if (bErr) throw new Error(`booking load failed: ${bErr.message}`);
    const bookedByDate = new Map<string, string[]>();
    for (const b of (bookings ?? []) as { travel_date: string; learner_id: string }[]) {
      const arr = bookedByDate.get(b.travel_date) ?? [];
      arr.push(b.learner_id);
      bookedByDate.set(b.travel_date, arr);
    }

    const { data: att, error: attErr } = await svc
      .from('tms_attendance')
      .select('trip_date, learner_id')
      .eq('route_id', routeId)
      .gte('trip_date', from)
      .lte('trip_date', to);
    // Never let THIS read as "nobody marked" — that fails everyone and bills
    // them for an infrastructure failure.
    if (attErr) throw new Error(`attendance load failed: ${attErr.message}`);
    const markedByDate = new Map<string, string[]>();
    for (const r of (att ?? []) as { trip_date: string; learner_id: string }[]) {
      const arr = markedByDate.get(r.trip_date) ?? [];
      arr.push(r.learner_id);
      markedByDate.set(r.trip_date, arr);
    }

    const marked: string[] = [];
    const excused: string[] = [];
    for (const date of bookedByDate.keys()) {
      if (isExcused(assignmentId, date, absences)) {
        excused.push(date);
        continue;
      }
      const ids = new Set(shareIds);
      for (const covered of delegatedTo(assignmentId, date, absences)) {
        for (const id of await loadShareLearnerIds(svc, covered)) ids.add(id);
      }
      const duty = shareDuty({ shareLearnerIds: [...ids], bookedLearnerIds: bookedByDate.get(date) ?? [] });
      if (shareCovered({ duty, markedLearnerIds: markedByDate.get(date) ?? [] }).covered) marked.push(date);
    }
    return { marked, excused };
  }
```

- [ ] **Step 2: Use it in the verdict loop**

Inside the per-person loop, replace the route-union block that builds `serviceDaySet` and `markedSet` with:

```ts
      const serviceDaySet = new Set<string>();
      const markedSet = new Set<string>();
      const excusedSet = new Set<string>();
      for (const row of group.rows) {
        const routeId = row.route_id;
        if (!routeId) continue;
        const { booked, marked } = await routeDates(routeId);
        for (const d of serviceDays(booked, from, to)) serviceDaySet.add(d);
        if (cfg.inchargeShareScoringEnabled) {
          const share = await shareMarkedDates(row.id, routeId, from, to);
          for (const d of share.marked) markedSet.add(d);
          for (const d of share.excused) excusedSet.add(d);
        } else {
          // Route-level credit: a mark by anyone on the route counts. This is
          // the original rule and stays in force until the flag is on.
          for (const d of marked) markedSet.add(d);
        }
      }
      // An excused day is neither credit nor blame, exactly like a holiday.
      // It leaves the denominator rather than joining the numerator, so a
      // month spent entirely on sick leave PASSES with zero required days.
      const requiredDays = [...serviceDaySet].filter((d) => !excusedSet.has(d)).sort();
      const verdict = evaluateMonth({ serviceDays: requiredDays, markedDates: [...markedSet] });
```

Note this changes the loop from iterating `routeIds` to iterating `group.rows`, because a share is keyed by *assignment*, not by route. The `Assignment` interface at the top of the file already carries `id`, so no query changes.

- [ ] **Step 3: Record which rule was applied**

Add `scoredBy: cfg.inchargeShareScoringEnabled ? 'share' : 'route'` to each `summary.plan.push` and to the `tms_incharge_month_verdict` insert's metadata if the table has a suitable column; otherwise include it in the notification body only. The verdict row is the audit substitute for this cron (it has no `AuthContext` and cannot call `logActivity`), so which rule decided a bill must be recoverable from it.

- [ ] **Step 4: Verify with a dry run**

Run with `?dryRun=1&month=2026-07` while the flag is off, record the summary. Turn the flag on, re-run the same command, and compare. **Turn the flag back off.**

Expect `failed` to fall slightly, not rise. Per-share narrows credit to your own students but also narrows your denominator to the days those students actually travelled, and an empty duty counts as covered — the looser denominator dominates. The measured figures on production are July **104 failed under per-share vs 112 under the route rule**, and August **109 vs 112**. A run in that neighbourhood is CORRECT; a large jump in either direction is the signal to stop. (An earlier draft of this step told the operator to expect `failed` to rise, which would have read a correct run as a bug.)

Report both numbers to the user before anything is enabled for real. The file header records that a live run under the route-level zero-miss rule bills all 102 in-charges roughly ₹13 lakh; the per-share total is slightly smaller but falls on a *different* set of people, and that is the decision the transport office has to make.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/incharge-month-verdict/route.ts
git commit -m "feat(boarding): month verdict scores each in-charge's own share"
```

---

### Task 14: Admin allocation view, rebalance and pin

**Files:**
- Create: `app/api/admin/routes/[routeId]/allocation/route.ts`

**Interfaces:**
- Consumes: `recomputeRouteAllocation`, `loadRouteAllocation` from `@/lib/boarding/allocation-repo`; `getBoardingStaffForRoute`.
- Produces:
  - `GET /api/admin/routes/[routeId]/allocation` → `{ success: true, data: { shares: Array<{ assignment_id, staff_email, staff_name, learners: Array<{ learner_id, name, roll, stop_name, is_manual }> }>, unowned: Array<{ learner_id, name, roll }> } }`
  - `POST` body `{ action: 'rebalance' }` → `{ success: true, data: { inCharges, allocated, unowned } }`
  - `POST` body `{ action: 'pin', learnerId, assignmentId }` → `{ success: true }`

- [ ] **Step 1: Write the route**

Create `app/api/admin/routes/[routeId]/allocation/route.ts`:

```ts
/**
 * Admin view of how one route's students are split across its in-charges,
 * with a Rebalance button and a per-learner pin.
 *
 * Pinning exists because the balanced split cannot know local facts — a
 * sibling pair, a student an in-charge personally escorts. A pinned learner
 * survives every recompute and is excluded from the balanced pool.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { recomputeRouteAllocation, loadRouteAllocation } from '@/lib/boarding/allocation-repo';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Next 15 hands params as a Promise; read the id off the path instead. */
function routeIdFrom(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  return segments[segments.indexOf('routes') + 1] ?? '';
}

interface LearnerLite { id: string; first_name: string | null; last_name: string | null; roll_number: string | null; transport_stop_id: string | null }

async function getAllocation(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const routeId = routeIdFrom(request);
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });

    const svc = createServiceRoleClient();

    const { data: learnerData, error: lErr } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, transport_stop_id')
      .eq('transport_route_id', routeId);
    if (lErr) return NextResponse.json({ error: 'Failed to load learners' }, { status: 500 });
    const learners = (learnerData ?? []) as LearnerLite[];

    const { data: stopData } = await svc
      .from('tms_route_stop').select('id, stop_name').eq('route_id', routeId);
    const stopName = new Map(((stopData ?? []) as { id: string; stop_name: string }[]).map((s) => [s.id, s.stop_name]));

    const { data: rows, error: rErr } = await svc
      .from('tms_incharge_roster_allocation')
      .select('learner_id, assignment_id, staff_email, is_manual')
      .eq('route_id', routeId);
    // An unchecked {data} here would render an empty split as "nobody is
    // allocated", which reads identically to a route with no in-charges.
    if (rErr && rErr.code !== '42P01') {
      return NextResponse.json({ error: 'Failed to load allocation' }, { status: 500 });
    }
    const allocation = (rows ?? []) as Array<{ learner_id: string; assignment_id: string; staff_email: string; is_manual: boolean }>;

    const staff = await getBoardingStaffForRoute(svc, routeId);
    const nameByEmail = new Map(staff.map((s) => [s.email, s.name] as const));
    const learnerById = new Map(learners.map((l) => [l.id, l] as const));

    const byAssignment = new Map<string, { assignment_id: string; staff_email: string; staff_name: string; learners: unknown[] }>();
    const owned = new Set<string>();
    for (const a of allocation) {
      owned.add(a.learner_id);
      const l = learnerById.get(a.learner_id);
      const bucket = byAssignment.get(a.assignment_id) ?? {
        assignment_id: a.assignment_id,
        staff_email: a.staff_email,
        staff_name: nameByEmail.get(a.staff_email) ?? a.staff_email,
        learners: [],
      };
      bucket.learners.push({
        learner_id: a.learner_id,
        name: l ? `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner' : 'Learner',
        roll: l?.roll_number ?? null,
        stop_name: l?.transport_stop_id ? stopName.get(l.transport_stop_id) ?? 'Stop not set' : 'Stop not set',
        is_manual: a.is_manual,
      });
      byAssignment.set(a.assignment_id, bucket);
    }

    return NextResponse.json({
      success: true,
      data: {
        shares: [...byAssignment.values()],
        unowned: learners
          .filter((l) => !owned.has(l.id))
          .map((l) => ({
            learner_id: l.id,
            name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner',
            roll: l.roll_number,
          })),
      },
    });
  } catch (e) {
    console.error('admin allocation get error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postAllocation(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const routeId = routeIdFrom(request);
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      action?: string; learnerId?: string; assignmentId?: string;
    };
    const svc = createServiceRoleClient();

    if (body.action === 'rebalance') {
      const result = await recomputeRouteAllocation(svc, routeId, auth.userId);
      await logActivity(auth, request, {
        module: 'boarding',
        action: 'update',
        entityType: 'tms_incharge_roster_allocation',
        entityId: routeId,
        description: `Rebalanced in-charge shares for route ${routeId}`,
        metadata: result,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === 'pin') {
      const learnerId = String(body.learnerId ?? '');
      const assignmentId = String(body.assignmentId ?? '');
      if (!learnerId || !assignmentId) {
        return NextResponse.json({ error: 'learnerId and assignmentId are required' }, { status: 400 });
      }
      const { data: assignment } = await svc
        .from('tms_staff_route_assignment')
        .select('id, staff_email').eq('id', assignmentId).eq('route_id', routeId).eq('is_active', true).maybeSingle();
      const target = assignment as { id: string; staff_email: string } | null;
      if (!target) {
        return NextResponse.json({ error: 'That in-charge is not assigned to this route' }, { status: 400 });
      }

      // Upsert on learner_id: the unique constraint guarantees the pin REPLACES
      // any existing owner rather than creating a second one.
      const { error } = await svc
        .from('tms_incharge_roster_allocation')
        .upsert({
          route_id: routeId,
          assignment_id: assignmentId,
          staff_email: target.staff_email.toLowerCase(),
          learner_id: learnerId,
          is_manual: true,
          allocated_by: auth.userId,
        }, { onConflict: 'learner_id' });
      if (error) {
        console.error('allocation pin error:', error);
        return NextResponse.json({ error: 'Failed to pin learner' }, { status: 500 });
      }
      await logActivity(auth, request, {
        module: 'boarding',
        action: 'update',
        entityType: 'tms_incharge_roster_allocation',
        entityId: learnerId,
        description: `Pinned learner to in-charge ${target.staff_email} on route ${routeId}`,
        metadata: { routeId, learnerId, assignmentId },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "action must be 'rebalance' or 'pin'" }, { status: 400 });
  } catch (e) {
    console.error('admin allocation post error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAllocation(request, auth));
export const POST = withAuth((request, auth) => postAllocation(request, auth));
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds. If `logActivity` rejects `action: 'update'` for this module, extend the closed union in `lib/activity/log.ts`.

- [ ] **Step 3: Verify a pin survives a rebalance**

Through the Supabase MCP `execute_sql` tool, pin one learner manually, run the reconcile with `?force=1`, and confirm the pin held:

```sql
select learner_id, assignment_id, is_manual
from tms_incharge_roster_allocation
where is_manual = true;
```

Expected: the pinned row still names the same `assignment_id` after the recompute.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/routes/\[routeId\]/allocation
git commit -m "feat(admin): view, rebalance and pin in-charge share allocation"
```

---

### Task 15: Admin coverage board

**Files:**
- Create: `app/api/admin/incharge-coverage/route.ts`
- Create: `app/(admin)/incharge-coverage/page.tsx`
- Create: `app/(admin)/incharge-coverage/columns.tsx`
- Modify: the admin sidebar navigation source (search for the file listing `/staff-route-assignments`) to add the entry

**Interfaces:**
- Consumes: `loadSharesForRoutes` from `@/lib/boarding/allocation-repo`; `getBoardingStaffForRoute`; `shareDuty`, `shareCovered`, `isExcused` from `@/lib/boarding/share-coverage`.
- Produces: `GET /api/admin/incharge-coverage?date=YYYY-MM-DD` → `{ success: true, data: { routes: RouteCoverage[]; totals: { routes: number; unowned: number; emptyShares: number; unmarkedShares: number } } }` where `RouteCoverage = { route_id, route_number, route_name, students, inCharges, unowned, emptyShares, unmarked: Array<{ staff_email, staff_name, required, marked }> }`.

- [ ] **Step 1: Write the API**

Create `app/api/admin/incharge-coverage/route.ts`:

```ts
/**
 * Where attendance coverage is broken, as one board.
 *
 * Three distinct failures share this screen because they all mean "somebody's
 * attendance has no owner", and the transport office fixes all three the same
 * way — by assigning an in-charge:
 *   - routes carrying students with NO in-charge (3 routes, 150 students as of
 *     2026-08-21)
 *   - in-charges holding an EMPTY share (more in-charges than students)
 *   - shares left unmarked on the selected day
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadSharesForRoutes } from '@/lib/boarding/allocation-repo';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
import { shareDuty, shareCovered, isExcused, type AbsenceRow } from '@/lib/boarding/share-coverage';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Split an id list into <=150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getCoverage(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const dateParam = new URL(request.url).searchParams.get('date');
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const date = dateParam ?? istToday();

    const svc = createServiceRoleClient();

    const { data: routeData, error: rErr } = await svc
      .from('tms_route').select('id, route_number, route_name').order('route_number');
    if (rErr) return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });
    const routes = (routeData ?? []) as Array<{ id: string; route_number: string | null; route_name: string | null }>;
    const routeIds = routes.map((r) => r.id);

    // Student counts per route, in one pass rather than a query per route.
    const studentsByRoute = new Map<string, number>();
    for (const c of chunk(routeIds)) {
      const { data, error } = await svc
        .from('learners_profiles').select('id, transport_route_id').in('transport_route_id', c);
      if (error) return NextResponse.json({ error: 'Failed to load learners' }, { status: 500 });
      for (const l of (data ?? []) as { transport_route_id: string }[]) {
        studentsByRoute.set(l.transport_route_id, (studentsByRoute.get(l.transport_route_id) ?? 0) + 1);
      }
    }

    const { data: aData, error: aErr } = await svc
      .from('tms_staff_route_assignment').select('id, staff_email, route_id').eq('is_active', true);
    if (aErr && aErr.code !== '42P01') {
      return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
    }
    const assignments = (aData ?? []) as Array<{ id: string; staff_email: string; route_id: string }>;
    const assignmentsByRoute = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const arr = assignmentsByRoute.get(a.route_id) ?? [];
      arr.push(a);
      assignmentsByRoute.set(a.route_id, arr);
    }

    const sharesByAssignment = await loadSharesForRoutes(svc, routeIds);

    // The day's bookings and marks, per route.
    const bookedByRoute = new Map<string, string[]>();
    const markedByRoute = new Map<string, string[]>();
    for (const c of chunk(routeIds)) {
      const [{ data: bk, error: bErr }, { data: at, error: atErr }] = await Promise.all([
        svc.from('tms_booking').select('route_id, learner_id').in('route_id', c).eq('travel_date', date),
        svc.from('tms_attendance').select('route_id, learner_id').in('route_id', c).eq('trip_date', date),
      ]);
      // Never let either failure read as "the bus never ran" or "nobody
      // marked" — this board is what the office acts on.
      if (bErr) return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
      if (atErr) return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
      for (const b of (bk ?? []) as { route_id: string; learner_id: string }[]) {
        bookedByRoute.set(b.route_id, [...(bookedByRoute.get(b.route_id) ?? []), b.learner_id]);
      }
      for (const m of (at ?? []) as { route_id: string; learner_id: string }[]) {
        markedByRoute.set(m.route_id, [...(markedByRoute.get(m.route_id) ?? []), m.learner_id]);
      }
    }

    const { data: absData } = await svc
      .from('tms_incharge_absence')
      .select('assignment_id, absence_date, covering_assignment_id, cover_status')
      .eq('absence_date', date);
    const absences = (absData ?? []) as AbsenceRow[];

    const totals = { routes: routes.length, unowned: 0, emptyShares: 0, unmarkedShares: 0 };
    const out = [];
    for (const r of routes) {
      const rowAssignments = assignmentsByRoute.get(r.id) ?? [];
      const staff = await getBoardingStaffForRoute(svc, r.id);
      const nameByEmail = new Map(staff.map((s) => [s.email, s.name] as const));

      let allocated = 0;
      let emptyShares = 0;
      const unmarked: Array<{ staff_email: string; staff_name: string; required: number; marked: number }> = [];
      for (const a of rowAssignments) {
        const share = sharesByAssignment.get(a.id) ?? [];
        allocated += share.length;
        if (share.length === 0) emptyShares += 1;
        if (isExcused(a.id, date, absences)) continue;
        const duty = shareDuty({
          shareLearnerIds: share,
          bookedLearnerIds: bookedByRoute.get(r.id) ?? [],
        });
        const coverage = shareCovered({ duty, markedLearnerIds: markedByRoute.get(r.id) ?? [] });
        if (!coverage.covered) {
          unmarked.push({
            staff_email: a.staff_email,
            staff_name: nameByEmail.get(a.staff_email.toLowerCase()) ?? a.staff_email,
            required: coverage.required,
            marked: coverage.marked,
          });
        }
      }

      const students = studentsByRoute.get(r.id) ?? 0;
      const unowned = students - allocated;
      totals.unowned += Math.max(0, unowned);
      totals.emptyShares += emptyShares;
      totals.unmarkedShares += unmarked.length;
      out.push({
        route_id: r.id,
        route_number: r.route_number,
        route_name: r.route_name,
        students,
        inCharges: rowAssignments.length,
        unowned: Math.max(0, unowned),
        emptyShares,
        unmarked,
      });
    }

    return NextResponse.json({ success: true, data: { date, routes: out, totals } });
  } catch (e) {
    console.error('admin incharge coverage error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getCoverage(request, auth));
```

- [ ] **Step 2: Write the page**

Create `app/(admin)/incharge-coverage/columns.tsx` and `app/(admin)/incharge-coverage/page.tsx` using the project's shared `DataTable` engine (`components/ui/data-table.tsx`) with a `columns.tsx` factory — the same shape every other admin list page uses. Read one existing admin list page first and match it.

`columns.tsx` exports `getCoverageColumns(): ColumnDef<RouteCoverage>[]` with these columns:

| Column | `accessorKey` / `id` | Cell |
| --- | --- | --- |
| Route | `route_number` | `#{route_number} — {route_name}` |
| Students | `students` | plain count |
| In-charges | `inCharges` | count; render `0` as a red badge |
| Unowned | `unowned` | count; render `> 0` as a red badge |
| Empty shares | `emptyShares` | count; render `> 0` as an amber badge |
| Unmarked today | `unmarked` | `{unmarked.length}` with the owner names in a `title` attribute |

Add a `status` filter column whose `filterFn` classifies each route into exactly one of the three actionable states, because these are what the transport office acts on:

```ts
  {
    id: 'status',
    accessorFn: (r) =>
      r.inCharges === 0 && r.students > 0 ? 'no_incharge'
        : r.emptyShares > 0 ? 'empty_share'
        : r.unmarked.length > 0 ? 'unmarked'
        : 'ok',
    filterFn: (row, id, value: string[]) => value.length === 0 || value.includes(row.getValue(id) as string),
  },
```

`page.tsx` fetches `/api/admin/incharge-coverage?date=${date}` with React Query keyed `['incharge-coverage', date]`, renders a date picker defaulting to today, four `Tile` summary cards from `data.totals` (Routes / Unowned students / Empty shares / Unmarked shares), and the `DataTable` with a `status` filter offering **No in-charge**, **Empty share**, **Unmarked today** and **OK**.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Verify against the live data**

Load the page (USER's browser) and confirm routes 37, 13 and 10 appear in the "no in-charge" group with 74, 63 and 13 students, and that route 29 shows 14 shares with none empty.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/incharge-coverage app/\(admin\)/incharge-coverage
git commit -m "feat(admin): in-charge coverage board"
```

---

## Rollout checklist (do NOT skip)

- [ ] `inchargeShareScoringEnabled` is `false` in `admin_settings` after every dry run
- [ ] Backfill (Task 4 Step 5) shows balanced shares on all 22 staffed routes
- [ ] Both crons dry-run identically to their pre-change behaviour with the flag off
- [ ] The per-share failed/billed count from Task 13 Step 4 has been reported to the user and accepted **before** the flag is enabled
- [ ] `inchargeEnforcementMode` remains `shadow` until the transport office decides otherwise — two independent flags must both be on before money moves
