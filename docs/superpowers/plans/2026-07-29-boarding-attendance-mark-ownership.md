# Boarding Attendance — Shared Roster, Owned Marks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep boarding attendance shared across a route's many staff, but make every mark owned — attributed to its marker, protected from silent overwrite, and visible to the transport office.

**Architecture:** `tms_attendance` keeps exactly one row per `(learner_id, trip_date, direction)` — unchanged. A new **pure** module `lib/boarding/attendance-ownership.ts` decides who may write to a row that already exists; every route calls it instead of upserting blind. The roster gains marker names + a server-computed `can_edit` flag and polls every 15s. A new `tms.attendance.override` permission, pinned to `transport_head`, is the correction path.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role writes, `withAuth` + `user_has_permission` RPC for authority), TanStack Query, TailwindCSS, vitest, Recharts.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-29-boarding-attendance-mark-ownership-design.md`. Read it before Task 1.
- **Branch:** `feat/boarding-attendance-mark-ownership` (already created off `main` at `173cdbe`).
- **The unique key `(learner_id, trip_date, direction)` is NEVER changed.** Attendance stays shared. Any task that adds a staff dimension to that key is wrong.
- **Authority is decided server-side.** `can_edit` on a roster row is a *rendering hint*. A client that ignores it and POSTs anyway must still be denied by the route.
- **Never treat a failed Supabase read as an empty result.** Every `.select()` added by this plan checks `error` explicitly. An unchecked `{ data }` on the existing-marks read would report "nothing is marked" and overwrite every colleague's mark — the exact bug being closed.
- **`.in()` filters chunk to ≤150 ids.** The API gateway 400s above roughly 500 and the failure is silent.
- **Test command:** `npx vitest run <path>` for one file, `npm test` for all. `npm run lint` is broken (circular config) — do not run it. `npm run type-check` is chronically red on `main` for unrelated reasons and is **not** a gate; verify with `npx next build`.
- **Commit trailer** on every commit:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Migrations** are applied with the `mcp__supabase__apply_migration` MCP tool against project `kvizhngldtiuufknvehv` **and** committed as a `.sql` file under `supabase/migrations/`.

## File Structure

| File | Responsibility |
|---|---|
| `lib/boarding/attendance-ownership.ts` | **Create.** Pure decision logic: may this actor write this mark? No I/O. |
| `lib/boarding/attendance-ownership.test.ts` | **Create.** Unit tests for every branch. |
| `supabase/migrations/20260729120000_tms_attendance_previous_mark.sql` | **Create.** Three `previous_*` columns. |
| `supabase/migrations/20260729120100_seed_tms_attendance_override_permission.sql` | **Create.** Pin `tms.attendance.override` to `transport_head`. |
| `lib/constants/tms-permissions.ts` | **Modify.** Add `ATTENDANCE_OVERRIDE`. |
| `lib/boarding/identity.ts` | **Modify.** Add `loadMarkerNames()` — shared by three routes. |
| `lib/booking/roster.ts` | **Modify.** `RosterRow` + `buildRosterRows` carry marker/lock/history. |
| `lib/booking/roster.test.ts` | **Modify.** Cover the new fields; update the 4 existing call sites for the new param. |
| `app/api/boarding/attendance/roster/route.ts` | **Modify.** Select + resolve marker names, pass the viewer. |
| `app/boarding/attendance/columns.tsx` | **Modify.** "by <name>" line, lock badge, override history line. |
| `app/boarding/attendance/page.tsx` | **Modify.** 15s polling, focus refetch, locked-toast, CSV column. |
| `app/api/boarding/attendance/route.ts` | **Modify.** POST + DELETE enforce ownership. |
| `app/api/boarding/scan/route.ts` | **Modify.** Idempotent re-scan; absent→present override. |
| `components/boarding/scan-dialog.tsx` | **Modify.** Render `alreadyMarked` / `overrode`. |
| `lib/booking/analytics-types.ts` | **Modify.** `scanned_by` on the row, staff label map, new block fields. |
| `lib/booking/analytics-attendance.ts` | **Modify.** Per-staff tally + "marked nothing" count. |
| `lib/booking/analytics-attendance.test.ts` | **Modify.** Cover the new aggregation. |
| `app/api/admin/bookings/analytics/route.ts` | **Modify.** Load `scanned_by`, staff labels, assignment emails. |
| `app/(admin)/bookings/analytics/attendance-tab.tsx` | **Modify.** "Who marked" table. |

---

### Task 1: The ownership decision function

The foundation. Pure, no I/O, no Supabase — every later task imports it. Written test-first.

**Files:**
- Create: `lib/boarding/attendance-ownership.ts`
- Test: `lib/boarding/attendance-ownership.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type MarkStatus = 'present' | 'absent'`
  - `interface ExistingMark { status: MarkStatus; scannedBy: string | null }`
  - `type MarkDecision = { action: 'write' } | { action: 'override'; from: MarkStatus; previousBy: string | null } | { action: 'noop'; reason: 'already_that_status' } | { action: 'deny'; reason: 'locked' }`
  - `function decideMark(f: MarkInputFacts): MarkDecision`
  - `function canClearMark(f: { existing: ExistingMark | null; actorId: string; isOverrideHolder: boolean; isSuperAdmin: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/attendance-ownership.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideMark, canClearMark, type MarkInputFacts } from './attendance-ownership';

const ME = 'staff-a';
const OTHER = 'staff-b';

const facts = (over: Partial<MarkInputFacts> = {}): MarkInputFacts => ({
  existing: null,
  requestedStatus: 'present',
  actorId: ME,
  isOverrideHolder: false,
  isSuperAdmin: false,
  viaScan: false,
  ...over,
});

describe('decideMark', () => {
  it('writes when no row exists yet', () => {
    expect(decideMark(facts())).toEqual({ action: 'write' });
  });

  it('lets the original marker change their own mark', () => {
    expect(
      decideMark(facts({ existing: { status: 'absent', scannedBy: ME }, requestedStatus: 'present' })),
    ).toEqual({ action: 'write' });
  });

  it('no-ops when the marker re-asserts the status already on their own row', () => {
    expect(
      decideMark(facts({ existing: { status: 'present', scannedBy: ME }, requestedStatus: 'present' })),
    ).toEqual({ action: 'noop', reason: 'already_that_status' });
  });

  // The stale-screen case. Staff B's roster still reads "unmarked" and they tap
  // Present, but Staff A marked Present 40s ago. Denying would punish someone who
  // did nothing wrong and never saw a lock icon.
  it('no-ops rather than denying when another staff asks for the status already there', () => {
    expect(
      decideMark(facts({ existing: { status: 'present', scannedBy: OTHER }, requestedStatus: 'present' })),
    ).toEqual({ action: 'noop', reason: 'already_that_status' });
  });

  it("denies a plain staff member changing someone else's mark by hand", () => {
    expect(
      decideMark(facts({ existing: { status: 'present', scannedBy: OTHER }, requestedStatus: 'absent' })),
    ).toEqual({ action: 'deny', reason: 'locked' });
  });

  it("lets a QR scan override someone else's absent mark", () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'absent', scannedBy: OTHER },
          requestedStatus: 'present',
          viaScan: true,
        }),
      ),
    ).toEqual({ action: 'override', from: 'absent', previousBy: OTHER });
  });

  it("lets an override holder change someone else's mark", () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'present', scannedBy: OTHER },
          requestedStatus: 'absent',
          isOverrideHolder: true,
        }),
      ),
    ).toEqual({ action: 'override', from: 'present', previousBy: OTHER });
  });

  it("lets a super admin change someone else's mark", () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'present', scannedBy: OTHER },
          requestedStatus: 'absent',
          isSuperAdmin: true,
        }),
      ),
    ).toEqual({ action: 'override', from: 'present', previousBy: OTHER });
  });

  // scanned_by is `on delete set null`, so deleting a staff profile orphans every
  // row they marked. Without this branch those rows freeze, editable by nobody.
  it('treats a row whose marker profile was deleted as unowned, not frozen', () => {
    expect(
      decideMark(facts({ existing: { status: 'present', scannedBy: null }, requestedStatus: 'absent' })),
    ).toEqual({ action: 'write' });
  });

  it('reads viaScan as a property of THIS write, not of the existing row', () => {
    expect(
      decideMark(
        facts({
          existing: { status: 'present', scannedBy: OTHER },
          requestedStatus: 'absent',
          viaScan: false,
        }),
      ),
    ).toEqual({ action: 'deny', reason: 'locked' });
  });
});

describe('canClearMark', () => {
  const clear = (over: Partial<Parameters<typeof canClearMark>[0]> = {}) =>
    canClearMark({
      existing: null,
      actorId: ME,
      isOverrideHolder: false,
      isSuperAdmin: false,
      ...over,
    });

  it('allows clearing when there is nothing to clear', () => {
    expect(clear()).toBe(true);
  });

  it('allows the original marker to clear their own mark', () => {
    expect(clear({ existing: { status: 'present', scannedBy: ME } })).toBe(true);
  });

  it("refuses a plain staff member clearing someone else's mark", () => {
    expect(clear({ existing: { status: 'present', scannedBy: OTHER } })).toBe(false);
  });

  it('allows an override holder or a super admin to clear any mark', () => {
    expect(clear({ existing: { status: 'present', scannedBy: OTHER }, isOverrideHolder: true })).toBe(true);
    expect(clear({ existing: { status: 'present', scannedBy: OTHER }, isSuperAdmin: true })).toBe(true);
  });

  it('treats an orphaned mark as clearable by anyone', () => {
    expect(clear({ existing: { status: 'present', scannedBy: null } })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/boarding/attendance-ownership.test.ts`
Expected: FAIL — `Failed to resolve import "./attendance-ownership"`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/attendance-ownership.ts`:

```ts
/**
 * Pure decision logic for who may write an attendance mark.
 *
 * A route can have a dozen boarding staff and they share ONE roster:
 * tms_attendance holds exactly one row per (learner_id, trip_date, direction).
 * Splitting the marking between staff is the INTENDED workflow — on route 16
 * four of twelve staff marked 31 learners between them on 2026-07-29, and all
 * twelve see the result. None of that changes here.
 *
 * What this guards is the SECOND write to an already-marked row. The upsert it
 * sits in front of is `onConflict: 'learner_id,trip_date,direction'` with no
 * guard at all, so without this any of those twelve could silently flip a
 * colleague's mark, and nothing would record that the first mark ever existed.
 *
 * No I/O here on purpose — the routes gather the facts, this decides. Same shape
 * as lib/boarding/incharge-attendance.ts.
 */

export type MarkStatus = 'present' | 'absent';

export interface ExistingMark {
  status: MarkStatus;
  /** tms_attendance.scanned_by. NULL when the marker's profile was deleted. */
  scannedBy: string | null;
}

export type MarkDecision =
  | { action: 'write' }
  | { action: 'override'; from: MarkStatus; previousBy: string | null }
  | { action: 'noop'; reason: 'already_that_status' }
  | { action: 'deny'; reason: 'locked' };

export interface MarkInputFacts {
  existing: ExistingMark | null;
  requestedStatus: MarkStatus;
  actorId: string;
  /** Holds tms.attendance.override — transport_head, and nobody else. */
  isOverrideHolder: boolean;
  isSuperAdmin: boolean;
  /** TRUE for a QR/6-digit scan, FALSE for the manual Present/Absent button. */
  viaScan: boolean;
}

export function decideMark(f: MarkInputFacts): MarkDecision {
  const { existing } = f;

  // Nothing recorded yet — any staff assigned to the route may create the mark.
  // That is the shared-roster behaviour and it is deliberately unrestricted.
  if (!existing) return { action: 'write' };

  // Re-asserting the status already on the row changes nothing, so it can never
  // be a conflict — check this BEFORE ownership.
  //
  // This is the stale-screen case: the roster polls every 15s, so Staff B's
  // screen can still read "unmarked" when they tap Present even though Staff A
  // marked Present forty seconds ago. Returning a lock error there would punish
  // someone who did nothing wrong and never even saw a lock icon.
  if (existing.status === f.requestedStatus) {
    return { action: 'noop', reason: 'already_that_status' };
  }

  // An orphaned row belongs to nobody. scanned_by is `references profiles(id) on
  // delete set null`, so deleting a staff profile nulls the marker on every row
  // they ever created. Without this branch those rows would be locked against
  // everyone, permanently, with no correction path.
  if (existing.scannedBy === null) return { action: 'write' };

  // Your own mark is always yours to correct — that stays a single tap.
  if (existing.scannedBy === f.actorId) return { action: 'write' };

  // Someone else's mark. Three keys open it:
  //  • transport_head / super admin — the designated correction path;
  //  • a QR scan — a scanned pass is physical proof the learner boarded. A scan
  //    only ever requests 'present', so this branch is strictly absent → present.
  //    It cannot flip a present learner to absent, because a scan is evidence of
  //    boarding and of nothing else.
  if (f.isOverrideHolder || f.isSuperAdmin || f.viaScan) {
    return { action: 'override', from: existing.status, previousBy: existing.scannedBy };
  }

  return { action: 'deny', reason: 'locked' };
}

/**
 * Whether the actor may DELETE a mark outright (the clear/undo endpoint).
 *
 * Deleting is not a status change, so it does not go through decideMark — but it
 * carries the same ownership rule, and the endpoint is currently unreachable from
 * the UI yet still lets any assigned staff wipe any mark on the route.
 */
export function canClearMark(f: {
  existing: ExistingMark | null;
  actorId: string;
  isOverrideHolder: boolean;
  isSuperAdmin: boolean;
}): boolean {
  if (!f.existing) return true;
  if (f.existing.scannedBy === null) return true;
  if (f.existing.scannedBy === f.actorId) return true;
  return f.isOverrideHolder || f.isSuperAdmin;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/boarding/attendance-ownership.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/attendance-ownership.ts lib/boarding/attendance-ownership.test.ts
git commit -m "$(cat <<'EOF'
feat(boarding): pure ownership rules for an attendance mark

Boarding staff share one tms_attendance row per learner-day, and the upsert
behind it has no guard -- any of route 16's twelve staff can silently flip a
colleague's mark. decideMark() is the single authority: first mark wins, the
marker may always correct their own, a QR scan may still fix absent -> present,
and transport_head/super_admin unlock the rest.

Orphaned rows (scanned_by nulled by a profile delete) stay writable, and
re-asserting the status already present is a no-op rather than a lock error --
that is what a stale roster produces, not a conflict.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrations and the permission constant

**Files:**
- Create: `supabase/migrations/20260729120000_tms_attendance_previous_mark.sql`
- Create: `supabase/migrations/20260729120100_seed_tms_attendance_override_permission.sql`
- Modify: `lib/constants/tms-permissions.ts:35-37`

**Interfaces:**
- Consumes: nothing.
- Produces: `TMS_PERMISSIONS.ATTENDANCE_OVERRIDE === 'tms.attendance.override'`; columns `tms_attendance.previous_status`, `.previous_scanned_by`, `.previous_scanned_at`.

- [ ] **Step 1: Write the column migration**

Create `supabase/migrations/20260729120000_tms_attendance_previous_mark.sql`:

```sql
-- One level of mark history on tms_attendance.
--
-- Boarding staff share ONE roster row per learner-day and first mark wins
-- (lib/boarding/attendance-ownership.ts). Two paths may still overwrite an
-- existing mark: a transport-head correction, and a QR scan — which is physical
-- proof of boarding and so may flip absent -> present.
--
-- When that happens the roster must be able to show WHAT it overwrote,
-- "(was Absent · Saranya G · 7:30 AM)", without walking the activity log on every
-- render. One level is enough for that; the activity log keeps the full trail.
--
-- Additive only: nothing is dropped, no existing constraint changes, and the
-- unique (learner_id, trip_date, direction) key is deliberately untouched —
-- attendance stays shared across the route's staff.
alter table public.tms_attendance
  add column if not exists previous_status     text,
  add column if not exists previous_scanned_by uuid references public.profiles(id) on delete set null,
  add column if not exists previous_scanned_at timestamptz;

-- Mirrors the existing status check. Guarded so the migration is re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tms_attendance_previous_status_check'
  ) then
    alter table public.tms_attendance
      add constraint tms_attendance_previous_status_check
      check (previous_status is null or previous_status in ('present', 'absent'));
  end if;
end $$;

-- ── Verification (run separately after applying) ─────────────────────────────
--   select column_name from information_schema.columns
--   where table_name = 'tms_attendance' and column_name like 'previous_%';
--   -- Expect exactly 3 rows.
```

- [ ] **Step 2: Write the permission migration**

Create `supabase/migrations/20260729120100_seed_tms_attendance_override_permission.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Pin the attendance-override power to EXACTLY two identities:
--   • super_admin    — bypasses permission checks in code (requirePerm's
--                      `if (auth.isSuperAdmin) return true`). Super admins hold
--                      NO custom_role, so they need — and must not be given — a
--                      grant here.
--   • transport_head — the designated corrector, granted below.
-- Nobody else may change another staff member's attendance mark.
--
-- WHY A NEW KEY: tms.attendance.manage cannot express this. Measured 2026-07-29,
-- BOTH roles hold it —
--     transport_boarding : scan ✓  manage ✓   (the 98 boarding staff)
--     transport_head     : view ✓  scan ✓  manage ✓
-- and transport_boarding is exactly the population the lock exists to constrain.
-- Gating the override on .manage would hand it straight back to all 98.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Idempotent and
-- self-healing: re-running re-asserts transport_head's key and strips any drift.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. transport_head holds the override key.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.attendance.override": true}'::jsonb,
    updated_at = now()
where role_key = 'transport_head';

-- 2. Strip it from every OTHER role, so the two-identity rule is ENFORCED rather
--    than incidental. A no-op on 2026-07-29 (the key is brand new), but it makes
--    a future accidental grant self-heal on the next migration run.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) - 'tms.attendance.override',
    updated_at = now()
where role_key <> 'transport_head'
  and permissions ? 'tms.attendance.override';

-- ── Verification (run separately after applying) ─────────────────────────────
--   -- Expect EXACTLY one row: transport_head / true
--   select role_key, permissions ? 'tms.attendance.override' as can_override
--   from public.custom_roles
--   where permissions ? 'tms.attendance.override'
--   order by role_key;
```

- [ ] **Step 3: Apply both migrations**

Use the `mcp__supabase__apply_migration` MCP tool twice, passing each file's SQL body:
- name `tms_attendance_previous_mark`
- name `seed_tms_attendance_override_permission`

- [ ] **Step 4: Verify against the live database**

Run via `mcp__supabase__execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
     where table_name = 'tms_attendance' and column_name like 'previous_%') as new_columns,
  (select count(*) from public.custom_roles
     where permissions ? 'tms.attendance.override') as roles_with_override,
  (select string_agg(role_key, ',') from public.custom_roles
     where permissions ? 'tms.attendance.override') as which_roles;
```

Expected: `new_columns = 3`, `roles_with_override = 1`, `which_roles = 'transport_head'`.

- [ ] **Step 5: Add the permission constant**

In `lib/constants/tms-permissions.ts`, replace lines 35-37:

```ts
  ATTENDANCE_VIEW: 'tms.attendance.view',
  ATTENDANCE_SCAN: 'tms.attendance.scan',
  ATTENDANCE_MANAGE: 'tms.attendance.manage',
```

with:

```ts
  ATTENDANCE_VIEW: 'tms.attendance.view',
  ATTENDANCE_SCAN: 'tms.attendance.scan',
  ATTENDANCE_MANAGE: 'tms.attendance.manage',
  // Change a mark made by ANOTHER staff member. Separate from .manage because
  // transport_boarding (all 98 boarding staff) and transport_head both hold
  // .manage — gating the override on it would grant it to the very population it
  // constrains. Pinned to transport_head in
  // 20260729120100_seed_tms_attendance_override_permission.sql.
  ATTENDANCE_OVERRIDE: 'tms.attendance.override',
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260729120000_tms_attendance_previous_mark.sql \
        supabase/migrations/20260729120100_seed_tms_attendance_override_permission.sql \
        lib/constants/tms-permissions.ts
git commit -m "$(cat <<'EOF'
feat(boarding): previous-mark columns + tms.attendance.override permission

Adds one level of mark history (previous_status/_scanned_by/_scanned_at) so an
overridden row can show what it replaced without walking the activity log.
Additive only -- the unique (learner_id, trip_date, direction) key is untouched
and attendance stays shared.

tms.attendance.override is pinned to transport_head, mirroring the vacate
precedent. It needs its own key because transport_boarding (98 staff) and
transport_head BOTH hold tms.attendance.manage, so reusing .manage would hand
the override back to the population the lock constrains.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The roster carries ownership

**Files:**
- Modify: `lib/boarding/identity.ts` (append `loadMarkerNames`)
- Modify: `lib/booking/roster.ts:131-190`
- Modify: `lib/booking/roster.test.ts:46-90`
- Modify: `app/api/boarding/attendance/roster/route.ts`

**Interfaces:**
- Consumes: `decideMark`, `ExistingMark`, `MarkStatus` from Task 1; `TMS_PERMISSIONS.ATTENDANCE_OVERRIDE` from Task 2.
- Produces:
  - `loadMarkerNames(svc: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>>`
  - `interface RosterAttendance { status: string; method: string | null; scanned_at: string | null; scanned_by: string | null; marked_by_name: string | null; previous_status: string | null; previous_by_name: string | null; previous_at: string | null }`
  - `interface RosterViewer { actorId: string; isOverrideHolder: boolean; isSuperAdmin: boolean }`
  - `buildRosterRows(riders, route, orderedStops, attendanceByLearner: Map<string, RosterAttendance>, viewer: RosterViewer): RosterRow[]` — **`viewer` is a new, REQUIRED 5th parameter**
  - `RosterRow` gains `marked_by_id`, `marked_by_name`, `can_edit`, `previous_status`, `previous_by_name`, `previous_at`

- [ ] **Step 1: Add `loadMarkerNames` to `lib/boarding/identity.ts`**

Replace the import line at the top of `lib/boarding/identity.ts`:

```ts
import type { AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
```

with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
```

Then append to the end of the file:

```ts
interface MarkerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

/**
 * Display names for attendance markers, keyed by profile id.
 *
 * Boarding staff share a roster — a dozen of them on route 16 — so every marked
 * row has to name who marked it, or the split work is unattributable. Nulls and
 * unresolvable ids are simply absent from the map; the caller renders a dash.
 */
export async function loadMarkerNames(
  svc: SupabaseClient,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  // ≤150 per .in() — the API gateway 400s on large filters and the failure is
  // silent, so an unchecked `{ data }` here would render EVERY marked row as
  // unattributed, which is precisely the information this feature adds.
  for (let i = 0; i < unique.length; i += 150) {
    const { data, error } = await svc
      .from('profiles')
      .select('id, full_name, email')
      .in('id', unique.slice(i, i + 150));
    if (error) {
      console.error('loadMarkerNames error:', error);
      continue;
    }
    for (const p of (data ?? []) as MarkerProfile[]) {
      out.set(p.id, (p.full_name ?? '').trim() || p.email || 'Staff');
    }
  }
  return out;
}
```

- [ ] **Step 2: Write the failing roster test**

In `lib/booking/roster.test.ts`, replace the whole `describe('buildRosterRows', ...)` block (lines 46-90) with:

```ts
describe('buildRosterRows', () => {
  const stops: OrderedStop[] = [
    { id: 's2', name: 'Second', time: '07:20', order: 2 },
    { id: 's1', name: 'First', time: '07:00', order: 1 },
  ];
  const route = { id: 'r1', route_number: '05' };
  const r = (learner_id: string, roll: string | null, stop_id: string | null, name = 'X'): RosterRider =>
    ({ learner_id, roll, stop_id, name });

  const ME = 'staff-a';
  const OTHER = 'staff-b';
  const viewer: RosterViewer = { actorId: ME, isOverrideHolder: false, isSuperAdmin: false };

  // Full RosterAttendance with sensible defaults, so each test states only what it means.
  const att = (over: Partial<RosterAttendance> & { status: string }): RosterAttendance => ({
    method: 'manual',
    scanned_at: null,
    scanned_by: ME,
    marked_by_name: 'Saranya G',
    previous_status: null,
    previous_by_name: null,
    previous_at: null,
    ...over,
  });

  it('marks a rider present when an attendance row exists for the leg', () => {
    const map = new Map([
      ['a', att({ status: 'present', method: 'qr_scan', scanned_at: '2026-07-11T02:00:00Z' })],
    ]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, map, viewer);
    expect(rows[0].status).toBe('present');
    expect(rows[0].method).toBe('qr_scan');
    expect(rows[0].scanned_at).toBe('2026-07-11T02:00:00Z');
    expect(rows[0].route_number).toBe('05');
  });

  it('marks a rider absent (carrying method/time) when an absent row exists; no row → unmarked', () => {
    const map = new Map([['a', att({ status: 'absent', scanned_at: 'x' })]]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's2')], route, stops, map, viewer);
    const a = rows.find((x) => x.learner_id === 'a')!;
    const b = rows.find((x) => x.learner_id === 'b')!;
    expect(a.status).toBe('absent');
    expect(a.method).toBe('manual');
    expect(a.scanned_at).toBe('x');
    expect(b.status).toBe('unmarked');
    expect(b.method).toBeNull();
    expect(b.scanned_at).toBeNull();
  });

  it('resolves the leg-appropriate stop name + time and sorts by stop order then roll', () => {
    const rows = buildRosterRows(
      [r('a', '30', 's2'), r('b', '10', 's1'), r('c', '20', 's1')], route, stops, new Map(), viewer,
    );
    expect(rows.map((x) => x.learner_id)).toEqual(['b', 'c', 'a']);
    expect(rows[0].stop_name).toBe('First');
    expect(rows[0].stop_time).toBe('07:00');
  });

  it('buckets riders with null/unknown stops as "Stop not set" and trails them', () => {
    const rows = buildRosterRows(
      [r('a', '10', null), r('b', '20', 's1'), r('c', '30', 'ghost')], route, stops, new Map(), viewer,
    );
    expect(rows[0].learner_id).toBe('b');
    const trailing = rows.slice(1);
    expect(trailing.every((x) => x.stop_name === 'Stop not set' && x.stop_time === null)).toBe(true);
  });

  it('carries the marker id and name onto a marked row, and leaves them null when unmarked', () => {
    const map = new Map([['a', att({ status: 'present', marked_by_name: 'Saranya G' })]]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's1')], route, stops, map, viewer);
    const a = rows.find((x) => x.learner_id === 'a')!;
    const b = rows.find((x) => x.learner_id === 'b')!;
    expect(a.marked_by_id).toBe(ME);
    expect(a.marked_by_name).toBe('Saranya G');
    expect(b.marked_by_id).toBeNull();
    expect(b.marked_by_name).toBeNull();
  });

  it('leaves an unmarked row editable by anyone', () => {
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, new Map(), viewer);
    expect(rows[0].can_edit).toBe(true);
  });

  it('keeps my own mark editable but locks a colleague\'s', () => {
    const map = new Map([
      ['a', att({ status: 'present', scanned_by: ME })],
      ['b', att({ status: 'present', scanned_by: OTHER })],
    ]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's1')], route, stops, map, viewer);
    expect(rows.find((x) => x.learner_id === 'a')!.can_edit).toBe(true);
    expect(rows.find((x) => x.learner_id === 'b')!.can_edit).toBe(false);
  });

  it("unlocks a colleague's mark for an override holder and for a super admin", () => {
    const map = new Map([['b', att({ status: 'present', scanned_by: OTHER })]]);
    const head = buildRosterRows([r('b', '20', 's1')], route, stops, map,
      { actorId: ME, isOverrideHolder: true, isSuperAdmin: false });
    const su = buildRosterRows([r('b', '20', 's1')], route, stops, map,
      { actorId: ME, isOverrideHolder: false, isSuperAdmin: true });
    expect(head[0].can_edit).toBe(true);
    expect(su[0].can_edit).toBe(true);
  });

  it('treats an orphaned mark (marker profile deleted) as editable, not frozen', () => {
    const map = new Map([['a', att({ status: 'present', scanned_by: null, marked_by_name: null })]]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, map, viewer);
    expect(rows[0].can_edit).toBe(true);
    expect(rows[0].marked_by_name).toBeNull();
  });

  it('carries the override history onto a row that replaced an earlier mark', () => {
    const map = new Map([
      ['a', att({
        status: 'present',
        method: 'qr_scan',
        previous_status: 'absent',
        previous_by_name: 'Saranya G',
        previous_at: '2026-07-29T02:00:00Z',
      })],
    ]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, map, viewer);
    expect(rows[0].previous_status).toBe('absent');
    expect(rows[0].previous_by_name).toBe('Saranya G');
    expect(rows[0].previous_at).toBe('2026-07-29T02:00:00Z');
  });
});
```

Also update the import on line 2 of that file to pull the new types:

```ts
import {
  groupRosterByStop, buildRosterRows,
  type RosterRider, type OrderedStop, type RosterRow,
  type RosterAttendance, type RosterViewer,
} from './roster';
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/booking/roster.test.ts`
Expected: FAIL — `RosterAttendance`/`RosterViewer` are not exported, and `can_edit` is undefined.

- [ ] **Step 4: Implement in `lib/booking/roster.ts`**

Add to the imports at the top of the file (after the existing `import { bookedCount, routeCapacity } from './repo';`):

```ts
// The ownership rule lives with the boarding domain that enforces it, so the
// roster's `can_edit` flag and the API routes' write gate can never disagree.
import { decideMark, type MarkStatus } from '@/lib/boarding/attendance-ownership';
```

Replace `RosterRow` (lines 131-143) and `buildRosterRows` (lines 145-190) with:

```ts
export interface RosterRow {
  learner_id: string;
  name: string;
  roll: string | null;
  route_id: string;
  route_number: string | null;
  stop_id: string | null;
  stop_name: string;
  stop_time: string | null;
  status: 'present' | 'absent' | 'unmarked';
  method: string | null;
  scanned_at: string | null;
  /** Who marked this row (tms_attendance.scanned_by); null when unmarked or orphaned. */
  marked_by_id: string | null;
  marked_by_name: string | null;
  /**
   * Whether THIS viewer may change the row. A rendering hint only — the write
   * routes re-decide server-side, so a client that ignores it is still denied.
   */
  can_edit: boolean;
  /** Set only when this mark replaced an earlier one (scan or transport-head override). */
  previous_status: 'present' | 'absent' | null;
  previous_by_name: string | null;
  previous_at: string | null;
}

/** One learner's attendance for the leg, with marker names already resolved. */
export interface RosterAttendance {
  status: string;
  method: string | null;
  scanned_at: string | null;
  scanned_by: string | null;
  marked_by_name: string | null;
  previous_status: string | null;
  previous_by_name: string | null;
  previous_at: string | null;
}

/** The signed-in staff member the rows are being rendered for. */
export interface RosterViewer {
  actorId: string;
  isOverrideHolder: boolean;
  isSuperAdmin: boolean;
}

/**
 * Pure: flatten one route's booked riders into attendance rows for a single leg.
 * The caller must pass `orderedStops` with `.time` already resolved to the leg
 * (stop_time onward / evening_time return) and `attendanceByLearner` already
 * filtered to that leg. Riders sort by stop order then roll/name (numeric-aware);
 * riders with a null/unknown stop fall into a trailing "Stop not set" bucket.
 *
 * `viewer` is REQUIRED rather than optional on purpose: an omitted viewer would
 * have to default to something, and any default that unlocks rows silently
 * disables the lock for every caller that forgets it.
 */
export function buildRosterRows(
  riders: RosterRider[],
  route: { id: string; route_number: string | null },
  orderedStops: OrderedStop[],
  attendanceByLearner: Map<string, RosterAttendance>,
  viewer: RosterViewer,
): RosterRow[] {
  const byId = new Map(orderedStops.map((s) => [s.id, s] as const));
  const orderOf = (stopId: string | null) =>
    stopId && byId.has(stopId) ? (byId.get(stopId)!.order ?? 0) : Number.MAX_SAFE_INTEGER;

  const rows: RosterRow[] = riders.map((rider) => {
    const stop = rider.stop_id && byId.has(rider.stop_id) ? byId.get(rider.stop_id)! : null;
    const att = attendanceByLearner.get(rider.learner_id);
    // Three-state: an attendance row is either 'present' or 'absent'; no row → 'unmarked'.
    const status: RosterRow['status'] =
      att?.status === 'present' ? 'present' : att?.status === 'absent' ? 'absent' : 'unmarked';
    const marked = status !== 'unmarked';

    // The row's toggle offers the OPPOSITE status, so that is the write whose
    // permission decides whether a control renders at all.
    const canEdit = !marked
      ? true
      : decideMark({
          existing: { status: status as MarkStatus, scannedBy: att!.scanned_by },
          requestedStatus: status === 'present' ? 'absent' : 'present',
          actorId: viewer.actorId,
          isOverrideHolder: viewer.isOverrideHolder,
          isSuperAdmin: viewer.isSuperAdmin,
          viaScan: false,
        }).action !== 'deny';

    const prev = marked && (att!.previous_status === 'present' || att!.previous_status === 'absent')
      ? (att!.previous_status as 'present' | 'absent')
      : null;

    return {
      learner_id: rider.learner_id,
      name: rider.name,
      roll: rider.roll,
      route_id: route.id,
      route_number: route.route_number,
      stop_id: stop ? stop.id : null,
      stop_name: stop ? stop.name : 'Stop not set',
      stop_time: stop ? stop.time : null,
      status,
      method: marked ? att!.method : null,
      scanned_at: marked ? att!.scanned_at : null,
      marked_by_id: marked ? att!.scanned_by : null,
      marked_by_name: marked ? att!.marked_by_name : null,
      can_edit: canEdit,
      previous_status: prev,
      previous_by_name: prev ? att!.previous_by_name : null,
      previous_at: prev ? att!.previous_at : null,
    };
  });

  rows.sort((a, b) => {
    const byStop = orderOf(a.stop_id) - orderOf(b.stop_id);
    if (byStop !== 0) return byStop;
    return (a.roll ?? a.name).localeCompare(b.roll ?? b.name, undefined, { numeric: true });
  });
  return rows;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/booking/roster.test.ts`
Expected: PASS — 15 tests (5 `groupRosterByStop` + 10 `buildRosterRows`).

- [ ] **Step 6: Wire the roster API route**

In `app/api/boarding/attendance/roster/route.ts`:

Replace the imports at lines 4-7:

```ts
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { loadBookedRoster, buildRosterRows, type OrderedStop, type RosterRow } from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
```

with:

```ts
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import {
  loadBookedRoster, buildRosterRows,
  type OrderedStop, type RosterRow, type RosterAttendance,
} from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
```

Replace the `AttRow` interface (line 17):

```ts
interface AttRow { learner_id: string; status: string | null; method: string | null; scanned_at: string | null }
```

with:

```ts
interface AttRow {
  learner_id: string;
  status: string | null;
  method: string | null;
  scanned_at: string | null;
  scanned_by: string | null;
  previous_status: string | null;
  previous_scanned_by: string | null;
  previous_scanned_at: string | null;
}
```

Replace the attendance block (lines 71-80):

```ts
    const { data: attData } = await svc
      .from('tms_attendance')
      .select('learner_id, status, method, scanned_at')
      .in('route_id', routeIds)
      .eq('trip_date', date)
      .eq('direction', direction);
    const attByLearner = new Map<string, { status: string; method: string | null; scanned_at: string | null }>();
    for (const a of (attData ?? []) as AttRow[]) {
      if (a.status) attByLearner.set(a.learner_id, { status: a.status, method: a.method, scanned_at: a.scanned_at });
    }
```

with:

```ts
    const { data: attData, error: attErr } = await svc
      .from('tms_attendance')
      .select(
        'learner_id, status, method, scanned_at, scanned_by, previous_status, previous_scanned_by, previous_scanned_at',
      )
      .in('route_id', routeIds)
      .eq('trip_date', date)
      .eq('direction', direction);
    // A failed read must not render as "nobody is marked" — on this screen that
    // reads as an empty roster inviting staff to re-mark everyone.
    if (attErr) {
      console.error('boarding attendance roster attendance error:', attErr);
      return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
    }
    const attRows = (attData ?? []) as AttRow[];

    // Marker names for both the current and the replaced mark, in one lookup.
    const markerNames = await loadMarkerNames(svc, [
      ...attRows.map((a) => a.scanned_by),
      ...attRows.map((a) => a.previous_scanned_by),
    ]);

    const attByLearner = new Map<string, RosterAttendance>();
    for (const a of attRows) {
      if (!a.status) continue;
      attByLearner.set(a.learner_id, {
        status: a.status,
        method: a.method,
        scanned_at: a.scanned_at,
        scanned_by: a.scanned_by,
        marked_by_name: a.scanned_by ? markerNames.get(a.scanned_by) ?? null : null,
        previous_status: a.previous_status,
        previous_by_name: a.previous_scanned_by ? markerNames.get(a.previous_scanned_by) ?? null : null,
        previous_at: a.previous_scanned_at,
      });
    }

    // Authority for the lock, resolved ONCE for the whole roster. requirePerm
    // already returns true for super admins, so isSuperAdmin is passed separately
    // only to keep decideMark's inputs explicit.
    const viewer = {
      actorId: auth.userId,
      isOverrideHolder: await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE),
      isSuperAdmin: auth.isSuperAdmin,
    };
```

Then replace the row-building loop (lines 82-86):

```ts
    const rows: RosterRow[] = [];
    for (const rt of routes) {
      const { riders } = await loadBookedRoster(svc, rt.id, date);
      rows.push(...buildRosterRows(riders, { id: rt.id, route_number: rt.route_number }, stopsByRoute.get(rt.id) ?? [], attByLearner));
    }
```

with:

```ts
    const rows: RosterRow[] = [];
    for (const rt of routes) {
      const { riders } = await loadBookedRoster(svc, rt.id, date);
      rows.push(
        ...buildRosterRows(
          riders,
          { id: rt.id, route_number: rt.route_number },
          stopsByRoute.get(rt.id) ?? [],
          attByLearner,
          viewer,
        ),
      );
    }
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "boarding/identity|booking/roster|attendance/roster" || echo "no errors in touched files"`
Expected: `no errors in touched files`. (The project-wide `tsc` is chronically red — only the touched files matter.)

- [ ] **Step 8: Commit**

```bash
git add lib/boarding/identity.ts lib/booking/roster.ts lib/booking/roster.test.ts \
        app/api/boarding/attendance/roster/route.ts
git commit -m "$(cat <<'EOF'
feat(boarding): roster carries marker identity and a server-decided edit flag

scanned_by has been written since the scanner shipped and read nowhere, so a
route where four of twelve staff did all the marking looked identical to one
where everybody did. The roster now resolves marker names (current and
replaced) in one batched lookup and returns can_edit per row, decided on the
server from decideMark -- the client never judges authority.

buildRosterRows takes viewer as a REQUIRED 5th parameter; an optional one would
have to default to something, and any unlocking default silently disables the
lock for a caller that forgets it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Roster UI — attribution, lock badge, live refresh

**Files:**
- Modify: `app/boarding/attendance/columns.tsx`
- Modify: `app/boarding/attendance/page.tsx`

**Interfaces:**
- Consumes: `RosterRow` with `marked_by_name`, `can_edit`, `previous_status`, `previous_by_name`, `previous_at` from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the lock badge and attribution to `columns.tsx`**

Replace the icon import on line 4:

```ts
import { QrCode, Pencil, Check, X } from 'lucide-react';
```

with:

```ts
import { QrCode, Pencil, Check, X, Lock } from 'lucide-react';
```

Replace the `scanned_at` column and the `action` column (lines 101-148) with:

```ts
    {
      accessorKey: 'scanned_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marked" />,
      size: 170,
      cell: ({ row }) => {
        const r = row.original;
        if (r.status === 'unmarked') return <span className="text-gray-400">—</span>;
        return (
          <div className="leading-tight">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500">
              {r.method === 'manual' ? <Pencil className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
              {fmtTime(r.scanned_at)}
            </span>
            {/* A route can have a dozen staff splitting one roster, so an
                unattributed mark tells nobody who actually did the work. */}
            <span className="block text-xs text-gray-400">by {r.marked_by_name ?? '—'}</span>
            {r.previous_status && (
              <span className="block text-xs text-amber-600 dark:text-amber-400">
                was {r.previous_status === 'present' ? 'Present' : 'Absent'}
                {r.previous_by_name ? ` · ${r.previous_by_name}` : ''}
                {r.previous_at ? ` · ${fmtTime(r.previous_at)}` : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'action',
      enableHiding: false,
      enableSorting: false,
      size: 120,
      header: () => null,
      cell: ({ row }) => {
        // Marking is gated to the travel day AND an open attendance window; outside
        // that no control shows at all (present and absent are both disabled by timing).
        if (!opts.canMark) return null;
        const r = row.original;

        // Somebody else's mark. First mark wins, so there is no button — only a
        // statement of who owns it. `can_edit` comes from the server; this is
        // presentation, and the write route re-decides regardless.
        if (!r.can_edit) {
          return (
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              title={`Marked ${r.status === 'present' ? 'Present' : 'Absent'} by ${
                r.marked_by_name ?? 'another staff member'
              }${r.scanned_at ? ` at ${fmtTime(r.scanned_at)}` : ''}. Only they or the transport office can change it.`}
            >
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          );
        }

        const busy = opts.busyId === r.learner_id;
        // Single toggle showing the NEXT action: present → mark Absent, else → mark Present.
        const next: 'present' | 'absent' = r.status === 'present' ? 'absent' : 'present';
        return next === 'present' ? (
          <button
            type="button"
            onClick={() => opts.onMark(r, 'present')}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Present'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => opts.onMark(r, 'absent')}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Absent'}
          </button>
        );
      },
    },
```

- [ ] **Step 2: Add polling, the locked toast, and the CSV column to `page.tsx`**

Replace the roster query (lines 55-58):

```ts
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['boarding-roster', date, direction],
    queryFn: () => fetchRoster(date, direction),
  });
```

with:

```ts
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['boarding-roster', date, direction],
    queryFn: () => fetchRoster(date, direction),
    // A route can have a dozen staff splitting this roster, and the global
    // defaults (staleTime 60s, refetchOnWindowFocus false, no interval) mean a
    // page held open on a moving bus never shows a colleague's marks at all.
    // Poll only while marking is actually possible — a historical day cannot
    // change, so polling it is pure load.
    refetchInterval: canMark ? 15_000 : false,
    refetchOnWindowFocus: true,
  });
```

**Note:** `canMark` is declared at line 77, *after* this query. Move the two lines

```ts
  const legOpen = isDirectionOpen(windows.onward);
  const canMark = isToday && legOpen;
```

to sit immediately after `const windows = winData?.windows ?? DEFAULT_WINDOWS;` (line 53) and delete them from their old position, so `canMark` is in scope for the query options.

Replace the `mark` callback (lines 79-100) with:

```ts
  const mark = useCallback(
    async (row: RosterRow, status: 'present' | 'absent') => {
      setBusyId(row.learner_id);
      try {
        const res = await fetch('/api/boarding/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ routeId: row.route_id, direction, marks: [{ learnerId: row.learner_id, status }] }),
        });
        const json = await res.json();
        // 409 = a colleague owns this mark. The roster is polled, not live, so
        // this is reachable from a stale screen even though the button was
        // rendered — refetch so the row redraws as Locked.
        if (res.status === 409 && json?.reason === 'locked') {
          toast.error(json.error || 'Another staff member has already marked this student.');
          qc.invalidateQueries({ queryKey: ['boarding-roster'] });
          return;
        }
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to mark attendance');
        toast.success(
          json.updated === 0 ? `${row.name} was already marked ${status}` : `Marked ${row.name} ${status}`,
        );
        qc.invalidateQueries({ queryKey: ['boarding-roster'] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to mark attendance');
      } finally {
        setBusyId(null);
      }
    },
    [direction, qc]
  );
```

In `exportCsv` (lines 111-125), replace the header and row lines:

```ts
    const header = ['Learner', 'Roll No.', 'Route', 'Stop', 'Status', 'Method', 'Marked At'];
    const lines = [header.map(esc).join(',')];
    for (const r of rowsToExport) {
      lines.push([r.name, r.roll, r.route_number, r.stop_name, r.status, r.method, r.scanned_at].map(esc).join(','));
    }
```

with:

```ts
    const header = ['Learner', 'Roll No.', 'Route', 'Stop', 'Status', 'Method', 'Marked At', 'Marked By'];
    const lines = [header.map(esc).join(',')];
    for (const r of rowsToExport) {
      lines.push(
        [r.name, r.roll, r.route_number, r.stop_name, r.status, r.method, r.scanned_at, r.marked_by_name]
          .map(esc)
          .join(','),
      );
    }
```

Finally, update the page subtitle on line 131 from:

```tsx
        <p className="text-gray-600 mt-1 text-sm">Today&apos;s booked students — scan or mark them present.</p>
```

to:

```tsx
        <p className="text-gray-600 mt-1 text-sm">
          Today&apos;s booked students — scan or mark them present. Your route&apos;s other in-charges
          share this list, so you only need to mark the students they haven&apos;t.
        </p>
```

- [ ] **Step 3: Verify it compiles**

Run: `npx next build 2>&1 | tail -30`
Expected: build completes; no error mentioning `app/boarding/attendance`.

- [ ] **Step 4: Commit**

```bash
git add app/boarding/attendance/columns.tsx app/boarding/attendance/page.tsx
git commit -m "$(cat <<'EOF'
feat(boarding): show who marked, lock colleagues' marks, refresh every 15s

The roster is shared by up to twelve in-charges but the page never refetched
(staleTime 60s, no interval, focus refetch off globally), so a phone held open
on the bus showed a snapshot from boarding time and staff re-marked students a
colleague had already done. It now polls every 15s while marking is possible --
and never on a historical day, which cannot change.

Marked rows name their marker, an overridden row shows what it replaced, and a
colleague's mark renders as a Locked badge instead of a button. A 409 from a
stale screen toasts the owner's name and refetches.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Enforce ownership on manual mark and clear

**Files:**
- Modify: `app/api/boarding/attendance/route.ts:69-120` (POST) and `:256-284` (DELETE)

**Interfaces:**
- Consumes: `decideMark`, `canClearMark`, `MarkStatus` (Task 1); `TMS_PERMISSIONS.ATTENDANCE_OVERRIDE` (Task 2); `loadMarkerNames` (Task 3).
- Produces: POST responds `{ success: true, updated: number, skipped: number, locked: LockedMark[] }` on success, or `409 { error, reason: 'locked', locked }` when nothing could be written. `LockedMark = { learnerId: string; status: MarkStatus; markedBy: string | null; markedByName: string; markedAt: string | null }`.

- [ ] **Step 1: Add the imports**

In `app/api/boarding/attendance/route.ts`, replace line 5:

```ts
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
```

with:

```ts
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import { decideMark, canClearMark, type MarkStatus } from '@/lib/boarding/attendance-ownership';
```

- [ ] **Step 2: Replace the POST body-building block**

Replace lines 69-115 (from the `// Verify each learner...` comment through the `return NextResponse.json({ success: true, updated: rows.length });`) with:

```ts
    // Verify each learner actually belongs to this route; grab their stop id.
    const learnerIds = [...new Set(marks.map((m) => m.learnerId).filter(Boolean))];
    const { data: studs } = await svc
      .from('learners_profiles')
      .select('id, transport_route_id, transport_stop_id')
      .in('id', learnerIds);
    const stopByLearner = new Map<string, string | null>();
    for (const s of (studs ?? []) as StudentLite[]) {
      if (s.transport_route_id === routeId) stopByLearner.set(s.id, s.transport_stop_id ?? null);
    }

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // What is ALREADY marked. This route's upsert has no guard of its own, so
    // without reading first, any of route 16's twelve in-charges silently flips a
    // colleague's mark. A failed read must NEVER be treated as "nothing is
    // marked" — that is the overwrite this whole change exists to stop.
    const { data: existingRows, error: exErr } = await svc
      .from('tms_attendance')
      .select('learner_id, status, scanned_by, scanned_at')
      .eq('trip_date', today)
      .eq('direction', direction)
      .in('learner_id', learnerIds);
    if (exErr) {
      console.error('boarding manual mark existing-read error:', exErr);
      return NextResponse.json({ error: 'Could not verify existing marks' }, { status: 500 });
    }
    const existingByLearner = new Map<
      string,
      { status: MarkStatus; scannedBy: string | null; scannedAt: string | null }
    >();
    for (const r of (existingRows ?? []) as ExistingRow[]) {
      if (r.status === 'present' || r.status === 'absent') {
        existingByLearner.set(r.learner_id, {
          status: r.status,
          scannedBy: r.scanned_by,
          scannedAt: r.scanned_at,
        });
      }
    }

    // requirePerm already returns true for super admins; isSuperAdmin is passed
    // to decideMark separately only to keep its inputs explicit.
    const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);

    const rows: AttendanceUpsert[] = [];
    const locked: LockedMark[] = [];
    let skipped = 0;
    let overrides = 0;

    for (const m of marks) {
      if (!stopByLearner.has(m.learnerId)) continue;
      if (m.status !== 'present' && m.status !== 'absent') continue;

      const existing = existingByLearner.get(m.learnerId) ?? null;
      const decision = decideMark({
        existing: existing ? { status: existing.status, scannedBy: existing.scannedBy } : null,
        requestedStatus: m.status,
        actorId: auth.userId,
        isOverrideHolder,
        isSuperAdmin: auth.isSuperAdmin,
        viaScan: false,
      });

      if (decision.action === 'noop') {
        skipped += 1;
        continue;
      }
      if (decision.action === 'deny') {
        locked.push({
          learnerId: m.learnerId,
          status: existing!.status,
          markedBy: existing!.scannedBy,
          markedByName: 'another staff member',
          markedAt: existing!.scannedAt,
        });
        continue;
      }

      if (decision.action === 'override') overrides += 1;
      rows.push({
        learner_id: m.learnerId,
        route_id: routeId,
        stop_id: stopByLearner.get(m.learnerId) ?? null,
        trip_date: today,
        direction,
        status: m.status,
        method: 'manual',
        scanned_by: auth.userId,
        scanned_at: now,
        previous_status: decision.action === 'override' ? decision.from : null,
        previous_scanned_by: decision.action === 'override' ? decision.previousBy : null,
        previous_scanned_at: decision.action === 'override' ? existing!.scannedAt : null,
      });
    }

    // Name the owners so the client can say WHO holds the mark, not just that
    // something is locked.
    if (locked.length > 0) {
      const names = await loadMarkerNames(svc, locked.map((l) => l.markedBy));
      for (const l of locked) {
        l.markedByName = (l.markedBy && names.get(l.markedBy)) || 'another staff member';
      }
    }

    if (rows.length === 0) {
      // A single locked mark is the common case (one tap on a stale screen) and
      // deserves a 409 the client can turn into a named message. 403 would be
      // wrong: this staffer MAY use the endpoint, this one row is taken.
      if (locked.length > 0) {
        const first = locked[0];
        return NextResponse.json(
          {
            error: `Already marked ${first.status} by ${first.markedByName}. Only they or the transport office can change it.`,
            reason: 'locked',
            locked,
          },
          { status: 409 },
        );
      }
      // Everything requested was already true. Nothing to do, nothing wrong.
      if (skipped > 0) {
        return NextResponse.json({ success: true, updated: 0, skipped, locked: [] });
      }
      return NextResponse.json({ error: 'No valid learners for this route' }, { status: 400 });
    }

    const { error } = await svc
      .from('tms_attendance')
      .upsert(rows, { onConflict: 'learner_id,trip_date,direction' });
    if (error) {
      console.error('boarding manual mark error:', error);
      return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'boarding',
      action: 'mark',
      entityType: 'tms_attendance',
      description:
        `Manually marked attendance for ${rows.length} learner(s) on route ${routeId} (${direction})` +
        (overrides > 0 ? ` — ${overrides} overrode an earlier mark` : ''),
      metadata: {
        routeId,
        direction,
        count: rows.length,
        overrides,
        skipped,
        locked: locked.length,
        ...(overrides > 0 ? { reason: 'override' } : {}),
      },
    });
    // A partially locked batch still succeeds: one taken row must not fail the
    // other nineteen. `locked` tells the client which ones to redraw.
    return NextResponse.json({ success: true, updated: rows.length, skipped, locked });
```

- [ ] **Step 3: Add the supporting types**

Immediately after the existing `interface StudentLite` (line 24), add:

```ts
interface ExistingRow {
  learner_id: string;
  status: string | null;
  scanned_by: string | null;
  scanned_at: string | null;
}

interface AttendanceUpsert {
  learner_id: string;
  route_id: string;
  stop_id: string | null;
  trip_date: string;
  direction: AttDirection;
  status: MarkStatus;
  method: 'manual';
  scanned_by: string;
  scanned_at: string;
  previous_status: MarkStatus | null;
  previous_scanned_by: string | null;
  previous_scanned_at: string | null;
}

/** A mark this request could not write because a colleague owns it. */
interface LockedMark {
  learnerId: string;
  status: MarkStatus;
  markedBy: string | null;
  markedByName: string;
  markedAt: string | null;
}
```

- [ ] **Step 4: Gate the DELETE handler**

In `clearMarks`, replace lines 256-270 (from `const svc = createServiceRoleClient();` through `const cleared = (data ?? []).length;`) with:

```ts
    const svc = createServiceRoleClient();
    const today = new Date().toISOString().slice(0, 10);

    // Same ownership rule as marking. This endpoint is currently unreachable from
    // the UI (row-level Undo was removed in PR #9) but it is still exposed, and
    // today it lets ANY assigned staff wipe ANY mark on the route.
    const { data: existingRows, error: exErr } = await svc
      .from('tms_attendance')
      .select('learner_id, status, scanned_by')
      .eq('route_id', routeId)
      .eq('trip_date', today)
      .eq('direction', direction)
      .in('learner_id', learnerIds);
    if (exErr) {
      console.error('boarding clear mark existing-read error:', exErr);
      return NextResponse.json({ error: 'Could not verify existing marks' }, { status: 500 });
    }
    const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);

    const clearable: string[] = [];
    let blocked = 0;
    for (const r of (existingRows ?? []) as ExistingRow[]) {
      const existing =
        r.status === 'present' || r.status === 'absent'
          ? { status: r.status as MarkStatus, scannedBy: r.scanned_by }
          : null;
      if (canClearMark({ existing, actorId: auth.userId, isOverrideHolder, isSuperAdmin: auth.isSuperAdmin })) {
        clearable.push(r.learner_id);
      } else {
        blocked += 1;
      }
    }

    if (clearable.length === 0) {
      return NextResponse.json(
        {
          error: blocked > 0
            ? 'Those marks belong to another staff member. Only they or the transport office can clear them.'
            : 'Nothing to clear',
          reason: blocked > 0 ? 'locked' : 'not_found',
        },
        { status: blocked > 0 ? 409 : 404 },
      );
    }

    const { data, error } = await svc
      .from('tms_attendance')
      .delete()
      .eq('route_id', routeId)
      .eq('trip_date', today)
      .eq('direction', direction)
      .in('learner_id', clearable)
      .select('learner_id');
    if (error) {
      console.error('boarding clear mark error:', error);
      return NextResponse.json({ error: 'Failed to clear attendance' }, { status: 500 });
    }
    const cleared = (data ?? []).length;
```

The replaced range already contained the original `const today = ...`, so nothing is left duplicated. Update the two lines that follow it to carry `blocked`:

```ts
    await logActivity(auth, request, {
      module: 'boarding',
      action: 'unmark',
      entityType: 'tms_attendance',
      description: `Cleared attendance for ${cleared} learner(s) on route ${routeId} (${direction})`,
      metadata: { routeId, direction, count: cleared, blocked },
    });
    return NextResponse.json({ success: true, cleared, blocked });
```

- [ ] **Step 5: Verify it compiles**

Run: `npx next build 2>&1 | tail -30`
Expected: build completes; no error mentioning `app/api/boarding/attendance`.

- [ ] **Step 6: Commit**

```bash
git add app/api/boarding/attendance/route.ts
git commit -m "$(cat <<'EOF'
feat(boarding): enforce mark ownership on manual mark and clear

POST now reads the existing marks before upserting and runs each through
decideMark. Writes and overrides go through, a request for the status already
recorded is a silent no-op (what a stale roster produces), and a colleague's
mark is refused with 409 + the owner's name. A partially locked batch still
writes the rest -- one taken row must not fail the other nineteen.

The existing-marks read fails the request rather than degrading to an empty
map: reading "nothing is marked" would overwrite every colleague's mark, which
is the exact bug being closed.

DELETE gains the same gate. It is unreachable from the UI today but still lets
any assigned staff wipe any mark on the route.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Scanner — idempotent re-scan, absent→present override

**Files:**
- Modify: `app/api/boarding/scan/route.ts:141-204`
- Modify: `components/boarding/scan-dialog.tsx:11-20, 231-258`

**Interfaces:**
- Consumes: `decideMark` (Task 1), `loadMarkerNames` (Task 3).
- Produces: the scan response gains optional `alreadyMarked: { by: string; at: string | null }` and `overrode: { from: 'absent'; by: string; at: string | null }`.

- [ ] **Step 1: Add the imports to the scan route**

Replace line 6 of `app/api/boarding/scan/route.ts`:

```ts
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
```

with:

```ts
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import { decideMark } from '@/lib/boarding/attendance-ownership';
```

- [ ] **Step 2: Read the existing mark before the booking gate**

After line 142 (`const name = \`${learner.first_name ?? ''} ...\`;`) and **before** the `// Booking gate:` comment on line 144, insert:

```ts
    // What is already recorded for this learner today. This is read BEFORE the
    // booking gate on purpose: a learner already marked present has, by
    // definition, boarded, so the walk-up prompt must not fire for them — they
    // may well have been added as a walk-up on the first scan.
    const { data: existingRow, error: exErr } = await svc
      .from('tms_attendance')
      .select('status, scanned_by, scanned_at')
      .eq('learner_id', learner.id)
      .eq('trip_date', today)
      .eq('direction', direction)
      .maybeSingle();
    if (exErr) {
      console.error('boarding scan existing-read error:', exErr);
      return NextResponse.json({ ok: false, error: 'Could not verify existing attendance' }, { status: 500 });
    }
    const existingStatus =
      existingRow?.status === 'present' || existingRow?.status === 'absent' ? existingRow.status : null;

    // viaScan: a scanned pass is physical proof of boarding, so it opens a
    // colleague's lock. It only ever requests 'present', so this can only ever be
    // absent → present — a scan can never mark someone absent.
    const decision = decideMark({
      existing: existingStatus ? { status: existingStatus, scannedBy: existingRow!.scanned_by } : null,
      requestedStatus: 'present',
      actorId: auth.userId,
      isOverrideHolder: false,
      isSuperAdmin: auth.isSuperAdmin,
      viaScan: true,
    });

    // Already present. Write nothing: a re-scan must not reassign credit for the
    // mark to whoever happened to scan last.
    if (decision.action === 'noop') {
      const names = await loadMarkerNames(svc, [existingRow!.scanned_by]);
      return NextResponse.json({
        ok: true,
        learner: { name, rollNumber: learner.roll_number },
        direction,
        alreadyMarked: {
          by: (existingRow!.scanned_by && names.get(existingRow!.scanned_by)) || 'another staff member',
          at: existingRow!.scanned_at,
        },
      });
    }
```

- [ ] **Step 3: Carry the override into the upsert and the response**

Replace the upsert object (lines 164-182) with:

```ts
    const overrode =
      decision.action === 'override'
        ? {
            from: decision.from,
            by:
              (decision.previousBy &&
                (await loadMarkerNames(svc, [decision.previousBy])).get(decision.previousBy)) ||
              'another staff member',
            at: existingRow?.scanned_at ?? null,
          }
        : null;

    const up = await svc
      .from('tms_attendance')
      .upsert(
        {
          learner_id: learner.id,
          route_id: learner.transport_route_id,
          stop_id: learner.transport_stop_id,
          trip_date: today,
          direction,
          status: 'present',
          method: 'qr_scan',
          is_walk_up: isWalkUp,
          scanned_by: auth.userId,
          scanned_at: new Date().toISOString(),
          previous_status: decision.action === 'override' ? decision.from : null,
          previous_scanned_by: decision.action === 'override' ? decision.previousBy : null,
          previous_scanned_at: decision.action === 'override' ? existingRow?.scanned_at ?? null : null,
        },
        { onConflict: 'learner_id,trip_date,direction' }
      )
      .select('id')
      .maybeSingle();
```

Then replace the activity log and success response (lines 189-204) with:

```ts
    await logActivity(auth, request, {
      module: 'boarding',
      action: 'scan',
      entityType: 'tms_attendance',
      entityId: learner.id,
      entityLabel: learner.roll_number ?? name,
      description:
        `Scanned boarding pass for ${name} (${direction})${isWalkUp ? ' [walk-up]' : ''}` +
        (overrode ? ` — corrected an earlier "${overrode.from}" mark` : ''),
      metadata: {
        learnerId: learner.id,
        direction,
        rollNumber: learner.roll_number,
        walkUp: isWalkUp,
        ...(overrode ? { reason: 'override', overrodeFrom: overrode.from, overrodePreviousBy: decision.action === 'override' ? decision.previousBy : null } : {}),
      },
    });
    return NextResponse.json({
      ok: true,
      learner: { name, rollNumber: learner.roll_number },
      direction,
      walkUp: isWalkUp,
      overCapacity: overCapacity || undefined,
      overrode: overrode ?? undefined,
    });
```

- [ ] **Step 4: Render both outcomes in the scan dialog**

In `components/boarding/scan-dialog.tsx`, replace the `ScanResult` type (lines 11-20) with:

```ts
type ScanResult = {
  ok: boolean;
  learner?: { name: string; rollNumber: string | null };
  direction?: string;
  walkUp?: boolean;
  reason?: 'not_booked' | 'window_closed';
  seatsRemaining?: number;
  overCapacity?: boolean;
  /** The learner was already marked present — nothing was written this time. */
  alreadyMarked?: { by: string; at: string | null };
  /** This scan corrected an earlier absent mark made by someone else. */
  overrode?: { from: 'present' | 'absent'; by: string; at: string | null };
  error?: string;
};
```

Replace the success branch of the result panel (lines 233-245) with:

```ts
            {result.ok ? (
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">
                  {result.alreadyMarked
                    ? '✓ Already marked present'
                    : `✓ Marked present (${result.direction})`}
                  {result.walkUp ? ' · walk-up' : ''}
                </p>
                <p>
                  {result.learner?.name}
                  {result.learner?.rollNumber ? ` · ${result.learner.rollNumber}` : ''}
                </p>
                {/* A dozen in-charges can share this route. Naming who marked
                    first stops the second scanner wondering if the scan failed. */}
                {result.alreadyMarked && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Marked by {result.alreadyMarked.by}
                    {result.alreadyMarked.at
                      ? ` at ${new Date(result.alreadyMarked.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                    . Nothing changed.
                  </p>
                )}
                {result.overrode && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    ⚠ Was marked {result.overrode.from} by {result.overrode.by} — corrected to present.
                  </p>
                )}
                {result.overCapacity && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">⚠ Bus over capacity — boarded as overflow.</p>
                )}
              </div>
            ) : result.reason === 'not_booked' ? (
```

- [ ] **Step 5: Verify it compiles**

Run: `npx next build 2>&1 | tail -30`
Expected: build completes; no error mentioning `boarding/scan` or `scan-dialog`.

- [ ] **Step 6: Commit**

```bash
git add app/api/boarding/scan/route.ts components/boarding/scan-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(boarding): make a re-scan idempotent and let a scan correct an absent mark

A scanned pass is physical proof the learner boarded, so it is the one write
that may open a colleague's lock -- but only absent -> present. It can never
mark someone absent.

Re-scanning an already-present learner now writes nothing and names the first
marker, instead of quietly reassigning credit for the mark to whoever scanned
last. That check runs BEFORE the booking gate: someone already recorded present
has boarded, so the walk-up prompt must not fire for them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Admin reporting — who marked, and who did not

**Files:**
- Modify: `lib/booking/analytics-types.ts:17-27, 40-46, 122-156`
- Modify: `lib/booking/analytics-attendance.ts:75-84, 166-239`
- Modify: `lib/booking/analytics-attendance.test.ts`
- Modify: `app/api/admin/bookings/analytics/route.ts:155-169, 197-204, 260-270, 297-310`
- Modify: `app/(admin)/bookings/analytics/attendance-tab.tsx`

**Interfaces:**
- Consumes: `tms_attendance.scanned_by` (already existed); nothing from Tasks 1-6.
- Produces: `AttendanceBlock.markedByStaff: MarkerRow[]`, `.staffWithNoMarks: number`, `.assignedStaffTotal: number` where `MarkerRow = { id: string; label: string; marks: number; present: number; absent: number }`.

**Why the "marked nothing" join works the way it does:** matching assignment emails to profile ids with `.in('email', ...)` is **wrong here**. Measured 2026-07-29: all 98 `staff_email` values are lowercase, but **6 `profiles.email` values contain uppercase**, so a lowercase `.in()` silently drops those staff and reports working in-charges as having marked nothing. The join therefore runs the other way — marker profile ids → their emails → lowercased → intersected with the assignment email set, entirely in memory.

- [ ] **Step 1: Extend the types**

In `lib/booking/analytics-types.ts`, replace `AttendanceRow` (lines 17-27):

```ts
/** A tms_attendance row. The date column is `trip_date`, NOT `travel_date`. */
export interface AttendanceRow {
  learner_id: string;
  trip_date: string; // 'YYYY-MM-DD'
  route_id: string | null;
  stop_id: string | null;
  direction: 'onward' | 'return';
  status: 'present' | 'absent';
  method: 'qr_scan' | 'manual';
  is_walk_up: boolean;
  /** profiles.id of the staff member who marked it. Nullable: `on delete set null`. */
  scanned_by: string | null;
}
```

Replace `Labels` (lines 40-46):

```ts
export interface Labels {
  routes: LabelMap;
  stops: LabelMap;
  institutions: LabelMap;
  departments: LabelMap;
  programs: LabelMap;
  /** Attendance markers, by profiles.id. */
  staff: LabelMap;
}
```

Add above `AttendanceBlock` (before line 122):

```ts
/** One boarding staff member's marking output over the filtered range. */
export interface MarkerRow extends FacetOption {
  marks: number;
  present: number;
  absent: number;
}
```

And inside `AttendanceBlock`, after `byDepartment: ShowRow[];` (line 155), add:

```ts
  /**
   * Who did the marking, busiest first. Routes commonly have 4-12 in-charges
   * sharing one roster (route 16 has 12), so this is the only place the office
   * can see how few of them actually mark.
   */
  markedByStaff: MarkerRow[];
  /** Assigned in-charges on the in-scope routes with zero marks in the range. */
  staffWithNoMarks: number;
  assignedStaffTotal: number;
```

- [ ] **Step 2: Write the failing aggregation test**

Append to `lib/booking/analytics-attendance.test.ts`:

```ts
describe('aggregateAttendance — who marked', () => {
  // Minimal builders: this block only exercises the marker tally, so bookings and
  // the join population stay empty.
  const att = (learner: string, scanned_by: string | null, status: 'present' | 'absent' = 'present') =>
    ({
      learner_id: learner,
      trip_date: '2026-07-29',
      route_id: 'r16',
      stop_id: null,
      direction: 'onward' as const,
      status,
      method: 'manual' as const,
      is_walk_up: false,
      scanned_by,
    });

  const labels = {
    routes: new Map(), stops: new Map(), institutions: new Map(),
    departments: new Map(), programs: new Map(),
    staff: new Map([['p1', 'Saranya G'], ['p2', 'Govindharaj S']]),
  };

  const run = (rows: ReturnType<typeof att>[], assignedStaffEmails: string[], markerEmailById: Map<string, string>) =>
    aggregateAttendance({
      bookings: [],
      bookingsForWalkUp: [],
      attendanceAll: rows,
      attendanceForJoin: rows,
      attendanceForComposition: rows,
      learners: new Map(),
      labels,
      assignedStaffEmails,
      markerEmailById,
    });

  it('tallies marks per staff member, busiest first, with present/absent split', () => {
    const out = run(
      [att('l1', 'p1'), att('l2', 'p1'), att('l3', 'p1', 'absent'), att('l4', 'p2')],
      [],
      new Map(),
    );
    expect(out.markedByStaff).toEqual([
      { id: 'p1', label: 'Saranya G', marks: 3, present: 2, absent: 1 },
      { id: 'p2', label: 'Govindharaj S', marks: 1, present: 1, absent: 0 },
    ]);
  });

  it('ignores rows with no marker rather than inventing an "unknown" staff member', () => {
    const out = run([att('l1', null), att('l2', 'p1')], [], new Map());
    expect(out.markedByStaff.map((s) => s.id)).toEqual(['p1']);
  });

  it('counts assigned staff who marked nothing', () => {
    // 3 assigned in-charges; only p1 (saranya@x) marked.
    const out = run(
      [att('l1', 'p1')],
      ['saranya@x', 'govind@x', 'sathya@x'],
      new Map([['p1', 'saranya@x']]),
    );
    expect(out.assignedStaffTotal).toBe(3);
    expect(out.staffWithNoMarks).toBe(2);
  });

  // A super admin can mark without holding a route assignment. They belong in the
  // per-staff tally but must not make the assigned-staff arithmetic go negative.
  it('does not let a marker outside the assignment list distort the no-marks count', () => {
    const out = run(
      [att('l1', 'p1'), att('l2', 'p2')],
      ['saranya@x'],
      new Map([['p1', 'saranya@x'], ['p2', 'superadmin@x']]),
    );
    expect(out.assignedStaffTotal).toBe(1);
    expect(out.staffWithNoMarks).toBe(0);
    expect(out.markedByStaff).toHaveLength(2);
  });

  it('falls back to the raw id when a marker has no resolved label', () => {
    const out = run([att('l1', 'p9')], [], new Map());
    expect(out.markedByStaff[0].label).toBe('p9');
  });
});
```

Then make the existing suite compile again. There are exactly **two** places to touch, because the file funnels everything through one factory and one label object:

1. `lib/booking/analytics-attendance.test.ts:12-18` — the module-level `labels` object. `localLabels` (line ~295) spreads it, so this one edit covers both. Add a `staff` line:

```ts
const labels: Labels = {
  routes: new Map([['R1', '05 · Sankari']]),
  stops: new Map(),
  institutions: new Map([['I1', 'Engineering']]),
  departments: new Map([['D1', 'CSE'], ['D2', 'ECE']]),
  programs: new Map(),
  staff: new Map(),
};
```

2. `lib/booking/analytics-attendance.test.ts:26-29` — the `at()` `AttendanceRow` factory. Every attendance literal in the file goes through it, so adding the default here fixes them all:

```ts
  direction: 'onward', status: 'present', method: 'qr_scan', is_walk_up: false, scanned_by: null, ...over,
```

The five **existing** `aggregateAttendance({...})` calls need no edit — `assignedStaffEmails` and `markerEmailById` are optional with empty defaults (Step 4). That is safe in a way the roster's `viewer` was not: an empty assignment list cannot unlock anything, it just reports "0 of 0 assigned in-charges", and the route always passes both.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/booking/analytics-attendance.test.ts`
Expected: FAIL — `assignedStaffEmails` is not a known property, `out.markedByStaff` is undefined.

- [ ] **Step 4: Implement the aggregation**

In `lib/booking/analytics-attendance.ts`, add to the type import at line 16-18:

```ts
import type {
  AttendanceBlock, AttendanceRow, BookingRow, LabelMap, Labels, LearnerDim, MarkerRow, ShowRow,
} from './analytics-types';
```

Add to `AttendanceInput` (after `unavailable?: boolean;` on line 83):

```ts
  /**
   * Lowercased emails of the ACTIVE in-charges on the in-scope routes — the
   * population "marked nothing" is measured against.
   *
   * OPTIONAL, unlike buildRosterRows' `viewer`, and for the opposite reason: an
   * empty list cannot unlock anything. It degrades to an honest "0 of 0 assigned
   * in-charges" rather than fabricating absentees, and the route always passes it.
   */
  assignedStaffEmails?: string[];
  /** Marker profiles.id → their lowercased email, for the intersection below. */
  markerEmailById?: Map<string, string>;
```

Add both to the destructured parameter list, **with defaults** (after `unavailable = false,` on line 94):

```ts
  assignedStaffEmails = [],
  markerEmailById = new Map(),
```

Insert before the `return {` on line 170:

```ts
  // Who did the marking. Routes commonly have 4-12 in-charges sharing one roster,
  // and scanned_by has been recorded since the scanner shipped without ever being
  // read — so a route where four of twelve staff did everything has looked
  // identical to one where all twelve did.
  //
  // Measured over the COMPOSITION population, like byStatus/byDirection/byMethod.
  // The join population is deliberately un-narrowed and would ignore the tab's
  // filters entirely.
  const staffTally = new Map<string, { marks: number; present: number; absent: number }>();
  for (const a of attendanceForComposition) {
    if (!a.scanned_by) continue;
    const t = staffTally.get(a.scanned_by) ?? { marks: 0, present: 0, absent: 0 };
    t.marks += 1;
    if (a.status === 'present') t.present += 1;
    else t.absent += 1;
    staffTally.set(a.scanned_by, t);
  }
  const markedByStaff: MarkerRow[] = [...staffTally.entries()]
    .map(([id, t]) => ({ id, label: labels.staff.get(id) ?? id, ...t }))
    .sort((a, b) => b.marks - a.marks || a.label.localeCompare(b.label));

  // Intersect on EMAIL, not on profile id. tms_staff_route_assignment.staff_email
  // is a raw string (all lowercase in prod) while 6 profiles.email values carry
  // uppercase, so an id-side or exact-string join silently drops those staff and
  // reports working in-charges as having marked nothing.
  //
  // Intersecting rather than subtracting also keeps this correct when a marker
  // holds no assignment at all — a super admin marking a route would otherwise
  // drive the count negative.
  const assigned = new Set(assignedStaffEmails);
  const assignedWhoMarked = new Set(
    [...staffTally.keys()]
      .map((id) => markerEmailById.get(id) ?? '')
      .filter((email) => assigned.has(email)),
  );
```

Then add to the returned object, after `byDepartment: showRows(deptMap, labels.departments),`:

```ts
    markedByStaff,
    staffWithNoMarks: assigned.size - assignedWhoMarked.size,
    assignedStaffTotal: assigned.size,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/booking/analytics-attendance.test.ts`
Expected: PASS, including the 5 new tests.

- [ ] **Step 6: Feed the route**

In `app/api/admin/bookings/analytics/route.ts`:

Add `scanned_by` to **both** attendance selects (lines 157 and 168) — change

```ts
        .select('learner_id, trip_date, route_id, stop_id, direction, status, method, is_walk_up')
```

to

```ts
        .select('learner_id, trip_date, route_id, stop_id, direction, status, method, is_walk_up, scanned_by')
```

in both places.

After the `learners` map is built (after line 219's closing `}`), insert:

```ts
    // Marker identities: their labels for the per-staff table, and their emails
    // for the "who marked nothing" intersection. fetchByIds keys on `id`, which is
    // exactly what we have — no email-side .in() is involved, which matters
    // because 6 profiles carry uppercase emails while every staff_email is
    // lowercase, so an email .in() would silently drop those staff.
    const markerIds = [
      ...new Set(
        [...attendance, ...todayAttendance]
          .map((a) => a.scanned_by)
          .filter((v): v is string => !!v),
      ),
    ];
    const markerRows = await fetchByIds<{ id: string; full_name: string | null; email: string | null }>(
      svc, 'profiles', 'id, full_name, email', markerIds,
    );
    const staffLabels: LabelMap = new Map(
      markerRows.map((p) => [p.id, (p.full_name ?? '').trim() || p.email || 'Staff']),
    );
    const markerEmailById = new Map(
      markerRows.map((p) => [p.id, (p.email ?? '').toLowerCase()]),
    );

    // Active in-charges on the in-scope routes — the denominator for "marked
    // nothing". Degrades to an empty list on failure: the tab then reports 0 of 0
    // rather than fabricating absentees.
    let assignedStaffEmails: string[] = [];
    const { data: asgRows, error: asgErr } = await svc
      .from('tms_staff_route_assignment')
      .select('staff_email, route_id')
      .eq('is_active', true);
    if (asgErr) {
      console.error('admin/bookings/analytics assignment error:', asgErr);
    } else {
      const scopedRoutes = filters.routeIds.length ? new Set(filters.routeIds) : null;
      assignedStaffEmails = [
        ...new Set(
          ((asgRows ?? []) as { staff_email: string; route_id: string | null }[])
            .filter((a) => !scopedRoutes || (a.route_id !== null && scopedRoutes.has(a.route_id)))
            .map((a) => a.staff_email.toLowerCase()),
        ),
      ];
    }
```

Add `staff: staffLabels,` to the `labels` object (after `programs: refs.programs,` on line 269).

Add both new inputs to the `aggregateAttendance({...})` call (after `labels,` on line 308):

```ts
        assignedStaffEmails,
        markerEmailById,
```

Finally, confirm `LabelMap` is imported — the type import block at line 12 already pulls `type Labels`; extend it to `type LabelMap, type Labels,`.

- [ ] **Step 7: Render the table**

In `app/(admin)/bookings/analytics/attendance-tab.tsx`, add `Users` to the lucide import (line 17):

```ts
import {
  AlertTriangle, CheckCircle2, QrCode, ScanLine, UserX, Users, XCircle,
} from 'lucide-react';
```

Insert this section immediately before the closing `</div>` of the outer `<div className="space-y-6">` (after the `xl:grid-cols-2` grid closes on line 206):

```tsx
      <section className={`${card} p-5`}>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Who marked attendance
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.assignedStaffTotal > 0
              ? `${num(data.assignedStaffTotal - data.staffWithNoMarks)} of ${num(data.assignedStaffTotal)} assigned in-charges marked at least once in this range.`
              : 'Marks in this range, by the staff member who recorded them.'}
          </p>
        </div>
        {data.markedByStaff.length === 0 ? (
          <EmptyState message="No attendance recorded in this range." />
        ) : (
          <>
            <VizTable
              head={['Staff', 'Marks', 'Present', 'Absent']}
              rows={data.markedByStaff.map((s) => [s.label, num(s.marks), num(s.present), num(s.absent)])}
            />
            {/* Routes carry 4-12 in-charges each, so silence from most of them is
                the finding — state it rather than leaving it to be inferred from
                a short table. */}
            {data.staffWithNoMarks > 0 && (
              <p className="mt-3 text-xs text-muted-foreground" role="note">
                <span className="font-medium text-foreground">
                  {num(data.staffWithNoMarks)} of {num(data.assignedStaffTotal)} assigned in-charges
                </span>{' '}
                marked nothing in this range.
              </p>
            )}
          </>
        )}
      </section>
```

- [ ] **Step 8: Verify the whole thing builds and all tests pass**

Run: `npm test`
Expected: PASS, all files.

Run: `npx next build 2>&1 | tail -30`
Expected: build completes with no errors.

- [ ] **Step 9: Commit**

```bash
git add lib/booking/analytics-types.ts lib/booking/analytics-attendance.ts \
        lib/booking/analytics-attendance.test.ts \
        app/api/admin/bookings/analytics/route.ts \
        "app/(admin)/bookings/analytics/attendance-tab.tsx"
git commit -m "$(cat <<'EOF'
feat(bookings): report which boarding staff actually marked attendance

98 in-charges are spread over 22 routes -- route 16 alone has 12 -- and
scanned_by was recorded but never read, so the office could not see that four
of those twelve carried the whole day. The attendance tab now lists marks per
staff member and names how many assigned in-charges marked nothing.

The "marked nothing" join intersects on lowercased EMAIL, in memory, rather
than filtering profiles by email: all 98 staff_email values are lowercase but 6
profiles.email values carry uppercase, so an email-side .in() would silently
drop those staff and report working in-charges as absentees. Intersecting
rather than subtracting also keeps the count non-negative when a super admin
marks a route they hold no assignment on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all vitest suites pass.
- [ ] `npx next build` — completes with no errors.
- [ ] Re-run the Task 2 Step 4 database verification query; confirm 3 columns and exactly `transport_head`.
- [ ] Confirm the shared roster is intact — this query must still show multiple markers on one route-day:
  ```sql
  select a.trip_date, r.route_number, count(*) as marks, count(distinct a.scanned_by) as markers
  from tms_attendance a join tms_route r on r.id = a.route_id
  where a.trip_date >= current_date - 7
  group by a.trip_date, r.route_number having count(distinct a.scanned_by) > 1;
  ```
- [ ] **Live smoke test — needs the user's authenticated browser.** The agent's Chrome is unauthenticated and cannot reach `/boarding/*`. Ask the user to verify, on a route with several in-charges, inside the 7:00–9:30 window:
  1. Staff A marks a student → the row shows **by <Staff A>**.
  2. Staff B's open tab shows that mark **within ~15 seconds**, without reloading.
  3. Staff B sees a **Locked** badge on that row, not a button.
  4. Staff A can still toggle their own mark.
  5. Staff A marks someone **Absent**; Staff B scans that student's QR → flips to **Present** with the "was absent" note.
  6. Scanning an already-present student says **"Already marked present by <name>"** and changes nothing.
  7. Admin → Bookings → Analytics → Attendance shows the **Who marked attendance** table.

## Rollback

Both migrations are additive and the code degrades safely, so a revert is code-only:

```bash
git revert --no-commit <first>..<last> && git commit
```

The `previous_*` columns and the `tms.attendance.override` grant may be left in place — nothing reads them once the code is reverted. To remove them anyway:

```sql
alter table public.tms_attendance
  drop column if exists previous_status,
  drop column if exists previous_scanned_by,
  drop column if exists previous_scanned_at;
update public.custom_roles
set permissions = permissions - 'tms.attendance.override'
where permissions ? 'tms.attendance.override';
```
