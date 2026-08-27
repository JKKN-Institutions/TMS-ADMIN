# Bulk Staff Route Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin assign many bus-required staff to their own routes in one action, instead of running the single-staff `Assign Route` form once per person.

**Architecture:** One new API file exposing `GET` (picker candidates) and `POST` (bulk create) at `/api/admin/staff-route-assignments/bulk`, backed by pure helpers in `lib/staff-assignments/bulk.ts`, plus one new page at `/staff-route-assignments/bulk-assign`. The `POST` body carries **only** `staffIds` — each staffer's route is resolved server-side from `staff.transport_route_id`, mirroring `/api/boarding/self-assign` so nobody can be assigned to a bus they don't ride. Purely additive: no migration, no new permission, no change to the existing single-assign form.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Supabase (service-role client), TanStack Query, Tailwind v4, vitest, lucide-react, react-hot-toast.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-25-bulk-staff-route-assignment-design.md`. Read it before Task 1.
- **Branch:** `feat/bulk-staff-route-assignment` (already cut from `origin/main`, spec committed at `40e3d94`).
- **Assignments are written under `lower(profiles.email)`**, resolved via `staff.profile_id`, falling back to `lower(staff.email)` only when no profile row exists. Never write `staff.email` when a profile email exists.
- **"Already assigned" is matched against BOTH addresses** (`staff.email` and `profiles.email`). Matching one address alone is a defect — 28 of 94 live assignments are recorded under the profile address only.
- **`source` must be `'admin'`** — the table has `CHECK (source IN ('admin','self'))`. Do not invent a new value; it would violate the constraint.
- **Every `.in()` over ids must be chunked to ≤150 and its `error` checked.** A larger `.in()` overflows the Supabase gateway with HTTP 400, and an unchecked `{data:null}` reads as EMPTY — here that would silently mark every staffer "unassigned".
- **`logActivity` unions are CLOSED** and already contain `module: 'staff-route-assignments'` and `action: 'assign'`. Do not add values.
- **Verification reality:** `npm run lint` crashes (circular config) and full `tsc --noEmit` is chronically red project-wide without gating `next build`. Neither is a regression gate. Use `npx vitest run` and **path-scoped** tsc.
- **Dev server:** already running on port **3000** (Next refuses a second instance per directory). Probe with `127.0.0.1`, never `localhost` — `localhost` returns `000` in this shell even when the server is up.

## File Structure

| File | Responsibility |
|---|---|
| `lib/staff-assignments/bulk.ts` (create) | Pure helpers: email normalisation/resolution, the candidate predicate, route grouping, result summarising. No Supabase import — unit-testable in isolation. |
| `lib/staff-assignments/bulk.test.ts` (create) | vitest coverage for every helper above. |
| `lib/staff-assignments/permissions.ts` (create) | `requireAssign(auth)` — extracted so both assignment routes share one copy. |
| `app/api/admin/staff-route-assignments/bulk/route.ts` (create) | `GET` candidates + `POST` bulk assign. All Supabase I/O and per-staffer outcome logic. |
| `app/api/admin/staff-route-assignments/route.ts` (modify) | Replace its local `requireAssign` with the shared import. No behaviour change. |
| `app/(admin)/staff-route-assignments/bulk-assign/page.tsx` (create) | The grouped picker UI + submit + result summary. |
| `app/(admin)/staff-route-assignments/page.tsx` (modify) | Add the "Bulk Assign" entry button beside "Assign Route". |

---

### Task 1: Pure helpers for candidacy, email resolution and grouping

**Files:**
- Create: `lib/staff-assignments/bulk.ts`
- Test: `lib/staff-assignments/bulk.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `normalizeEmail(v) -> string|null`, `resolveAssignmentEmail(staffEmail, profileEmail) -> string|null`, `isBulkCandidate(c: CandidateInput, assignedEmails: Set<string>) -> boolean`, `groupCandidatesByRoute(c: Candidate[]) -> RouteGroup[]`, `summarizeBulkResults(r: BulkResult[]) -> BulkSummary`, and the types `BulkOutcome`, `BulkResult`, `BulkSummary`, `Candidate`, `CandidateInput`, `RouteGroup`.

- [ ] **Step 1: Write the failing test**

Create `lib/staff-assignments/bulk.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  resolveAssignmentEmail,
  isBulkCandidate,
  groupCandidatesByRoute,
  summarizeBulkResults,
  type Candidate,
  type CandidateInput,
  type BulkResult,
} from './bulk';

const cand = (over: Partial<CandidateInput> = {}): CandidateInput => ({
  staffId: 's1',
  name: 'Kamali',
  staffEmail: 'kamali@jkkn.ac.in',
  profileEmail: 'kamali@jkkn.ac.in',
  routeId: 'r29',
  routeActive: true,
  ...over,
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Kamali@JKKN.ac.in ')).toBe('kamali@jkkn.ac.in');
  });

  it('returns null for null, undefined and blank', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });
});

describe('resolveAssignmentEmail', () => {
  // The eligibility RPC counts assignments by profiles.email. Writing
  // staff.email for a divergent staffer lets them self-assign a second time
  // past the unique index -> two active rows for one human.
  it('prefers the profile email over the staff email', () => {
    expect(resolveAssignmentEmail('personal@gmail.com', 'k@jkkn.ac.in')).toBe('k@jkkn.ac.in');
  });

  it('falls back to the staff email when there is no profile email', () => {
    expect(resolveAssignmentEmail('k@jkkn.ac.in', null)).toBe('k@jkkn.ac.in');
  });

  it('treats a blank profile email as absent', () => {
    expect(resolveAssignmentEmail('k@jkkn.ac.in', '  ')).toBe('k@jkkn.ac.in');
  });

  it('returns null when neither address exists', () => {
    expect(resolveAssignmentEmail(null, null)).toBeNull();
  });

  it('lowercases whichever address it picks', () => {
    expect(resolveAssignmentEmail(null, 'K@JKKN.ac.in')).toBe('k@jkkn.ac.in');
  });
});

describe('isBulkCandidate', () => {
  it('accepts an unassigned staffer with an active master route', () => {
    expect(isBulkCandidate(cand(), new Set())).toBe(true);
  });

  it('rejects someone already assigned under their STAFF email', () => {
    expect(isBulkCandidate(cand(), new Set(['kamali@jkkn.ac.in']))).toBe(false);
  });

  // The divergent case: assigned under the profile address only. Matching on
  // staff.email alone would offer them as a candidate and duplicate them.
  it('rejects someone already assigned under their PROFILE email only', () => {
    const c = cand({ staffEmail: 'personal@gmail.com', profileEmail: 'k@jkkn.ac.in' });
    expect(isBulkCandidate(c, new Set(['k@jkkn.ac.in']))).toBe(false);
  });

  it('rejects someone already assigned under their STAFF email only', () => {
    const c = cand({ staffEmail: 'personal@gmail.com', profileEmail: 'k@jkkn.ac.in' });
    expect(isBulkCandidate(c, new Set(['personal@gmail.com']))).toBe(false);
  });

  it('matches the assigned set case-insensitively', () => {
    const c = cand({ staffEmail: 'Kamali@JKKN.ac.in', profileEmail: null });
    expect(isBulkCandidate(c, new Set(['kamali@jkkn.ac.in']))).toBe(false);
  });

  it('rejects a staffer with no master route', () => {
    expect(isBulkCandidate(cand({ routeId: null }), new Set())).toBe(false);
  });

  it('rejects a staffer whose master route is inactive', () => {
    expect(isBulkCandidate(cand({ routeActive: false }), new Set())).toBe(false);
  });

  it('rejects a staffer with no usable email at all', () => {
    expect(isBulkCandidate(cand({ staffEmail: null, profileEmail: null }), new Set())).toBe(false);
  });
});

describe('groupCandidatesByRoute', () => {
  const c = (staffId: string, routeId: string, routeNumber: string): Candidate => ({
    staffId,
    name: staffId,
    email: `${staffId}@jkkn.ac.in`,
    staffCode: null,
    routeId,
    routeNumber,
    routeName: `Route ${routeNumber}`,
  });

  it('groups staff under their route', () => {
    const g = groupCandidatesByRoute([c('a', 'r1', '29'), c('b', 'r1', '29'), c('d', 'r2', '07')]);
    expect(g).toHaveLength(2);
    expect(g[0].routeId).toBe('r1');
    expect(g[0].staff.map((s) => s.staffId)).toEqual(['a', 'b']);
  });

  it('sorts groups by staff count descending', () => {
    const g = groupCandidatesByRoute([c('a', 'r2', '07'), c('b', 'r1', '29'), c('d', 'r1', '29')]);
    expect(g.map((x) => x.routeId)).toEqual(['r1', 'r2']);
  });

  it('breaks ties on route number ascending', () => {
    const g = groupCandidatesByRoute([c('a', 'r2', '29'), c('b', 'r1', '07')]);
    expect(g.map((x) => x.routeNumber)).toEqual(['07', '29']);
  });

  it('returns an empty array for no candidates', () => {
    expect(groupCandidatesByRoute([])).toEqual([]);
  });
});

describe('summarizeBulkResults', () => {
  const r = (outcome: BulkResult['outcome']): BulkResult => ({
    staffId: 'x', name: 'X', email: 'x@y', routeId: 'r', routeLabel: '29', outcome,
  });

  it('counts assigned, skipped and errors separately', () => {
    const s = summarizeBulkResults([
      r('assigned'), r('assigned'),
      r('skipped_already_assigned'), r('skipped_no_route'),
      r('error'),
    ]);
    expect(s).toEqual({ assigned: 2, skipped: 2, errors: 1 });
  });

  it('counts every skipped_* variant as skipped', () => {
    const s = summarizeBulkResults([
      r('skipped_already_assigned'), r('skipped_not_eligible'),
      r('skipped_no_email'), r('skipped_no_route'), r('skipped_route_inactive'),
    ]);
    expect(s).toEqual({ assigned: 0, skipped: 5, errors: 0 });
  });

  it('returns zeroes for an empty batch', () => {
    expect(summarizeBulkResults([])).toEqual({ assigned: 0, skipped: 0, errors: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/staff-assignments/bulk.test.ts`
Expected: FAIL — `Failed to resolve import "./bulk"`.

- [ ] **Step 3: Write the implementation**

Create `lib/staff-assignments/bulk.ts`:

```ts
// lib/staff-assignments/bulk.ts
// Pure helpers for bulk in-charge assignment. No Supabase import — every
// function here is a plain data transform so it can be unit-tested without a
// client, and so the identity rule below lives in exactly one place.

/** Every terminal state a single staffer can reach in a bulk run. */
export type BulkOutcome =
  | 'assigned'
  | 'skipped_already_assigned'
  | 'skipped_not_eligible'
  | 'skipped_no_email'
  | 'skipped_no_route'
  | 'skipped_route_inactive'
  | 'error';

export interface BulkResult {
  staffId: string;
  name: string;
  email: string | null;
  routeId: string | null;
  routeLabel: string | null;
  outcome: BulkOutcome;
  message?: string;
}

export interface BulkSummary {
  assigned: number;
  skipped: number;
  errors: number;
}

/** A picker row: one assignable staffer plus the route they will land on. */
export interface Candidate {
  staffId: string;
  name: string;
  email: string;
  staffCode: string | null;
  routeId: string;
  routeNumber: string;
  routeName: string;
}

/** Raw shape the candidate predicate judges, before it becomes a Candidate. */
export interface CandidateInput {
  staffId: string;
  name: string;
  staffEmail: string | null;
  profileEmail: string | null;
  routeId: string | null;
  routeActive: boolean;
}

export interface RouteGroup {
  routeId: string;
  routeNumber: string;
  routeName: string;
  staff: Candidate[];
}

export function normalizeEmail(v: string | null | undefined): string | null {
  const s = (v ?? '').trim().toLowerCase();
  return s.length ? s : null;
}

/**
 * The address an assignment is WRITTEN under.
 *
 * Must prefer profiles.email: tms_staff_boarding_eligibility resolves identity
 * as lower(profiles.email) and counts existing assignments against it. Writing
 * staff.email for a staffer whose two addresses diverge leaves that guard
 * reading zero, lets them self-assign afterwards, and slips past the
 * (staff_email, route_id) unique index — two active rows for one human.
 */
export function resolveAssignmentEmail(
  staffEmail: string | null | undefined,
  profileEmail: string | null | undefined
): string | null {
  return normalizeEmail(profileEmail) ?? normalizeEmail(staffEmail);
}

/**
 * Whether a staffer may be offered in the picker.
 *
 * `assignedEmails` must hold EVERY active assignment address, lowercased. The
 * check tests both of the staffer's addresses against it: 28 of 94 live
 * assignments are recorded under the profile address only, so testing
 * staff.email alone would offer already-assigned people and duplicate them.
 */
export function isBulkCandidate(c: CandidateInput, assignedEmails: Set<string>): boolean {
  const staff = normalizeEmail(c.staffEmail);
  const profile = normalizeEmail(c.profileEmail);
  if (!staff && !profile) return false;
  if (staff && assignedEmails.has(staff)) return false;
  if (profile && assignedEmails.has(profile)) return false;
  if (!c.routeId || !c.routeActive) return false;
  return true;
}

/** Groups candidates under their master route: biggest group first, then route number. */
export function groupCandidatesByRoute(candidates: Candidate[]): RouteGroup[] {
  const byRoute = new Map<string, RouteGroup>();
  for (const c of candidates) {
    let g = byRoute.get(c.routeId);
    if (!g) {
      g = { routeId: c.routeId, routeNumber: c.routeNumber, routeName: c.routeName, staff: [] };
      byRoute.set(c.routeId, g);
    }
    g.staff.push(c);
  }
  return [...byRoute.values()].sort(
    (a, b) => b.staff.length - a.staff.length || a.routeNumber.localeCompare(b.routeNumber)
  );
}

export function summarizeBulkResults(results: BulkResult[]): BulkSummary {
  let assigned = 0;
  let skipped = 0;
  let errors = 0;
  for (const r of results) {
    if (r.outcome === 'assigned') assigned++;
    else if (r.outcome === 'error') errors++;
    else skipped++;
  }
  return { assigned, skipped, errors };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/staff-assignments/bulk.test.ts`
Expected: PASS — 22 tests.

- [ ] **Step 5: Path-scoped typecheck**

Run: `npx tsc --noEmit lib/staff-assignments/bulk.ts 2>&1 | grep "staff-assignments" || echo "clean"`
Expected: `clean`. (Full-project `tsc` is chronically red — only lines naming these files matter.)

- [ ] **Step 6: Commit**

```bash
git add lib/staff-assignments/bulk.ts lib/staff-assignments/bulk.test.ts
git commit -m "feat(staff-assignments): pure helpers for bulk in-charge assignment

Candidate predicate matches BOTH staff.email and profiles.email, and
resolveAssignmentEmail prefers the profile address -- the eligibility RPC
counts assignments by profiles.email, so writing staff.email for a divergent
staffer would let them self-assign a second time past the unique index."
```

---

### Task 2: Bulk API endpoint

**Files:**
- Create: `lib/staff-assignments/permissions.ts`
- Create: `app/api/admin/staff-route-assignments/bulk/route.ts`
- Modify: `app/api/admin/staff-route-assignments/route.ts:11-17` (replace the local `requireAssign` with the shared import)

**Interfaces:**
- Consumes: from Task 1 — `resolveAssignmentEmail`, `isBulkCandidate`, `summarizeBulkResults`, and the types `Candidate`, `CandidateInput`, `BulkResult`, `BulkOutcome`.
- Produces: `GET /api/admin/staff-route-assignments/bulk` → `{ success: true, candidates: Candidate[] }`; `POST` same path, body `{ staffIds: string[] }` → `{ success: true, summary: BulkSummary, results: BulkResult[] }`. Task 3 consumes both.

- [ ] **Step 1: Extract the shared permission helper**

Create `lib/staff-assignments/permissions.ts`:

```ts
import type { AuthContext } from '@/lib/api/with-auth';

/**
 * Service-role clients bypass RLS, so both assignment routes gate writes on an
 * explicit permission check. Super admins bypass. Kept here rather than in a
 * route.ts so the single-assign and bulk routes cannot drift apart.
 */
export async function requireAssign(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: 'tms.drivers.assign',
  });
  return !!data;
}
```

- [ ] **Step 2: Point the existing route at it**

In `app/api/admin/staff-route-assignments/route.ts`, delete the local `requireAssign` function (lines 9-17, including its two comment lines) and add to the import block at the top:

```ts
import { requireAssign } from '@/lib/staff-assignments/permissions';
```

Leave every call site (`await requireAssign(auth)`) unchanged. This is a pure move — no behaviour change.

- [ ] **Step 3: Write the bulk route**

Create `app/api/admin/staff-route-assignments/bulk/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { grantBoardingRole } from '@/lib/boarding/roles';
import { requireAssign } from '@/lib/staff-assignments/permissions';
import {
  resolveAssignmentEmail,
  isBulkCandidate,
  summarizeBulkResults,
  normalizeEmail,
  type Candidate,
  type BulkResult,
} from '@/lib/staff-assignments/bulk';
import type { SupabaseClient } from '@supabase/supabase-js';

// A few hundred UUIDs in a single .in() overflow the Supabase gateway with HTTP
// 400, which supabase-js surfaces as { data: null, error }. Left unchecked that
// reads as EMPTY — here it would mark every staffer unassigned. Chunk and check.
const IN_CHUNK = 150;
const MAX_BATCH = 100;

type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  staff_id: string | null;
  profile_id: string | null;
  transport_route_id: string | null;
};

type RouteRow = { id: string; route_number: string | null; route_name: string | null; status: string | null };

const fullName = (s: StaffRow) =>
  `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || (s.email ?? '—');

async function selectIn<T>(
  svc: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
  idColumn = 'id'
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await svc
      .from(table)
      .select(columns)
      .in(idColumn, ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** Every active assignment address, lowercased. Fails loud — see IN_CHUNK note. */
async function loadAssignedEmails(svc: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await svc
    .from('tms_staff_route_assignment')
    .select('staff_email')
    .eq('is_active', true);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ staff_email: string | null }>) {
    const e = normalizeEmail(r.staff_email);
    if (e) set.add(e);
  }
  return set;
}

const STAFF_COLS = 'id, first_name, last_name, email, staff_id, profile_id, transport_route_id';

/** Staff rows + their profile email + their route, for a given id filter (or all). */
async function loadStaffContext(svc: SupabaseClient, staffIds?: string[]) {
  // BOTH paths apply the same eligibility filter (bus_required + active), so a
  // submitted id that is not eligible simply never comes back — and the POST
  // loop reports it as skipped_not_eligible when staffById.get(id) is undefined.
  // Never trust the client's ids to be eligible.
  let staff: StaffRow[] = [];
  if (staffIds) {
    for (let i = 0; i < staffIds.length; i += IN_CHUNK) {
      const { data, error } = await svc
        .from('staff')
        .select(STAFF_COLS)
        .eq('bus_required', true)
        .eq('is_active', true)
        .in('id', staffIds.slice(i, i + IN_CHUNK));
      if (error) throw error;
      staff.push(...((data ?? []) as StaffRow[]));
    }
  } else {
    const { data, error } = await svc
      .from('staff')
      .select(STAFF_COLS)
      .eq('bus_required', true)
      .eq('is_active', true);
    if (error) throw error;
    staff = (data ?? []) as StaffRow[];
  }

  const profileIds = [...new Set(staff.map((s) => s.profile_id).filter(Boolean))] as string[];
  const profileEmailById = new Map<string, string | null>();
  if (profileIds.length) {
    const rows = await selectIn<{ id: string; email: string | null }>(
      svc, 'profiles', 'id, email', profileIds
    );
    for (const p of rows) profileEmailById.set(p.id, p.email);
  }

  const routeIds = [...new Set(staff.map((s) => s.transport_route_id).filter(Boolean))] as string[];
  const routeById = new Map<string, RouteRow>();
  if (routeIds.length) {
    const rows = await selectIn<RouteRow>(
      svc, 'tms_route', 'id, route_number, route_name, status', routeIds
    );
    for (const r of rows) routeById.set(r.id, r);
  }

  return { staff, profileEmailById, routeById };
}

// GET: assignable candidates for the picker.
async function getCandidates() {
  try {
    const svc = createServiceRoleClient();
    const [{ staff, profileEmailById, routeById }, assignedEmails] = await Promise.all([
      loadStaffContext(svc),
      loadAssignedEmails(svc),
    ]);

    const candidates: Candidate[] = [];
    for (const s of staff) {
      const profileEmail = s.profile_id ? profileEmailById.get(s.profile_id) ?? null : null;
      const route = s.transport_route_id ? routeById.get(s.transport_route_id) : undefined;
      const ok = isBulkCandidate(
        {
          staffId: s.id,
          name: fullName(s),
          staffEmail: s.email,
          profileEmail,
          routeId: s.transport_route_id,
          routeActive: route?.status === 'active',
        },
        assignedEmails
      );
      if (!ok || !route) continue;
      candidates.push({
        staffId: s.id,
        name: fullName(s),
        email: resolveAssignmentEmail(s.email, profileEmail) as string,
        staffCode: s.staff_id ?? null,
        routeId: route.id,
        routeNumber: route.route_number ?? '—',
        routeName: route.route_name ?? '—',
      });
    }
    return NextResponse.json({ success: true, candidates, count: candidates.length });
  } catch (e) {
    console.error('Bulk candidates error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load candidates' }, { status: 500 });
  }
}

// POST: assign each submitted staffer to their OWN master route.
async function postBulk(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireAssign(auth))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const staffIds: unknown = body?.staffIds;
    if (!Array.isArray(staffIds) || staffIds.length === 0) {
      return NextResponse.json({ success: false, error: 'staffIds is required' }, { status: 400 });
    }
    if (staffIds.length > MAX_BATCH) {
      return NextResponse.json(
        { success: false, error: `Assign at most ${MAX_BATCH} staff at a time` },
        { status: 400 }
      );
    }
    const ids = [...new Set(staffIds.map(String))];

    const svc = createServiceRoleClient();
    const [{ staff, profileEmailById, routeById }, assignedEmails] = await Promise.all([
      loadStaffContext(svc, ids),
      loadAssignedEmails(svc),
    ]);
    const staffById = new Map(staff.map((s) => [s.id, s]));

    const results: BulkResult[] = [];
    for (const id of ids) {
      const s = staffById.get(id);
      if (!s) {
        results.push({ staffId: id, name: '—', email: null, routeId: null, routeLabel: null,
          outcome: 'skipped_not_eligible', message: 'Not a bus-required active staff member' });
        continue;
      }
      const name = fullName(s);
      const profileEmail = s.profile_id ? profileEmailById.get(s.profile_id) ?? null : null;
      const email = resolveAssignmentEmail(s.email, profileEmail);
      const route = s.transport_route_id ? routeById.get(s.transport_route_id) : undefined;
      const routeLabel = route ? `${route.route_number ?? '—'} - ${route.route_name ?? '—'}` : null;

      if (!email) {
        results.push({ staffId: id, name, email: null, routeId: null, routeLabel: null,
          outcome: 'skipped_no_email', message: 'No email on file' });
        continue;
      }
      if (!s.transport_route_id || !route) {
        results.push({ staffId: id, name, email, routeId: null, routeLabel: null,
          outcome: 'skipped_no_route', message: 'No route on the staff record' });
        continue;
      }
      if (route.status !== 'active') {
        results.push({ staffId: id, name, email, routeId: route.id, routeLabel,
          outcome: 'skipped_route_inactive', message: 'Their route is not active' });
        continue;
      }
      if (assignedEmails.has(email)) {
        results.push({ staffId: id, name, email, routeId: route.id, routeLabel,
          outcome: 'skipped_already_assigned', message: 'Already an active in-charge' });
        continue;
      }

      const { data: created, error } = await svc
        .from('tms_staff_route_assignment')
        .insert({
          staff_email: email,
          route_id: route.id,
          assigned_by: auth.userId,
          source: 'admin',
          is_active: true,
        })
        .select('id')
        .single();

      if (error) {
        // 23505 = the active (staff_email, route_id) unique index. A staffer who
        // self-assigned between GET and POST lands here — a skip, not an error.
        if (error.code === '23505') {
          results.push({ staffId: id, name, email, routeId: route.id, routeLabel,
            outcome: 'skipped_already_assigned', message: 'Already an active in-charge' });
          continue;
        }
        console.error('Bulk assign insert error:', error);
        results.push({ staffId: id, name, email, routeId: route.id, routeLabel,
          outcome: 'error', message: 'Failed to create the assignment' });
        continue;
      }

      assignedEmails.add(email); // guards a duplicate id inside the same batch
      await grantBoardingRole(svc, email, auth.userId);
      await logActivity(auth, request, {
        module: 'staff-route-assignments',
        action: 'assign',
        entityType: 'tms_staff_route_assignment',
        entityId: (created as { id: string } | null)?.id,
        entityLabel: email,
        description: `Bulk-assigned ${email} to route ${routeLabel ?? route.id}`,
        metadata: { staffEmail: email, routeId: route.id, source: 'admin_bulk' },
      });
      results.push({ staffId: id, name, email, routeId: route.id, routeLabel, outcome: 'assigned' });
    }

    return NextResponse.json({ success: true, summary: summarizeBulkResults(results), results });
  } catch (e) {
    console.error('Bulk assign error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getCandidates());
export const POST = withAuth((request, auth) => postBulk(request, auth));
```

- [ ] **Step 4: Verify the existing suite still passes**

Run: `npx vitest run`
Expected: PASS — Task 1's 22 tests plus every pre-existing suite. Nothing should newly fail.

- [ ] **Step 5: Path-scoped typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "staff-assignments|staff-route-assignments" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Probe the route is mounted and gated**

The dev server is already running on port 3000. Run:

```bash
curl -s -w "\nstatus=%{http_code}\n" --max-time 20 http://127.0.0.1:3000/api/admin/staff-route-assignments/bulk
```

Expected: `{"error":"Unauthorized"}` and `status=401` — proves the route compiled and `withAuth` gates it. A `404` means the file is in the wrong place.

- [ ] **Step 7: Commit**

```bash
git add lib/staff-assignments/permissions.ts \
        app/api/admin/staff-route-assignments/bulk/route.ts \
        app/api/admin/staff-route-assignments/route.ts
git commit -m "feat(staff-assignments): bulk assign endpoint

POST takes staffIds only -- each route is resolved server-side from
staff.transport_route_id, mirroring self-assign so nobody can be put on a bus
they do not ride. Per-staffer outcomes; one bad row never fails the batch.
requireAssign extracted so both assignment routes share one copy."
```

---

### Task 3: Bulk assign page and entry point

**Files:**
- Create: `app/(admin)/staff-route-assignments/bulk-assign/page.tsx`
- Modify: `app/(admin)/staff-route-assignments/page.tsx:62-69` (add the entry button)

**Interfaces:**
- Consumes: from Task 1 — `groupCandidatesByRoute`, types `Candidate`, `BulkResult`, `BulkSummary`. From Task 2 — `GET`/`POST /api/admin/staff-route-assignments/bulk`.
- Produces: the `/staff-route-assignments/bulk-assign` route. Nothing downstream consumes it.

- [ ] **Step 1: Create the page**

Create `app/(admin)/staff-route-assignments/bulk-assign/page.tsx`:

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Search, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import {
  groupCandidatesByRoute,
  type Candidate,
  type BulkResult,
  type BulkSummary,
} from '@/lib/staff-assignments/bulk';

const crumbs = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Staff Assignments', href: '/staff-route-assignments' },
  { label: 'Bulk Assign' },
];

async function fetchCandidates(): Promise<Candidate[]> {
  const res = await fetch('/api/admin/staff-route-assignments/bulk');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load candidates');
  return (json.candidates || []) as Candidate[];
}

export default function BulkAssignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<{ summary: BulkSummary; results: BulkResult[] } | null>(null);

  const { data: candidates = [], isLoading, refetch } = useQuery({
    queryKey: ['bulk-assign-candidates'],
    queryFn: fetchCandidates,
  });

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? candidates.filter((c) =>
          [c.name, c.email, c.staffCode ?? '', c.routeNumber, c.routeName]
            .some((v) => v.toLowerCase().includes(q))
        )
      : candidates;
    return groupCandidatesByRoute(filtered);
  }, [candidates, query]);

  const toggle = (staffId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });

  const toggleGroup = (staff: Candidate[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = staff.every((s) => next.has(s.staffId));
      for (const s of staff) {
        if (allOn) next.delete(s.staffId);
        else next.add(s.staffId);
      }
      return next;
    });

  const selectedRouteCount = useMemo(
    () => new Set(candidates.filter((c) => selected.has(c.staffId)).map((c) => c.routeId)).size,
    [candidates, selected]
  );

  const handleSubmit = async () => {
    if (selected.size === 0) return toast.error('Select at least one staff member');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/staff-route-assignments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffIds: [...selected] }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to assign');

      setResults({ summary: json.summary, results: json.results });
      setSelected(new Set());
      toast.success(`Assigned ${json.summary.assigned} staff`);
      // The list page's KPI cards and table both read this key.
      await queryClient.invalidateQueries({ queryKey: ['staff-route-assignments'] });
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs}
        backHref="/staff-route-assignments"
        title="Bulk Assign In-Charges"
        subtitle="Assign bus-required staff to their own route. The route comes from the staff record — it is shown, not chosen."
      />

      {results && (
        <SectionCard title="Result">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Assigned <strong>{results.summary.assigned}</strong>, skipped{' '}
            <strong>{results.summary.skipped}</strong>, errors{' '}
            <strong>{results.summary.errors}</strong>.
          </p>
          <ul className="mt-3 space-y-1">
            {results.results
              .filter((r) => r.outcome !== 'assigned')
              .map((r) => (
                <li key={r.staffId} className="text-sm text-gray-500 dark:text-gray-400">
                  {r.name} — {r.message ?? r.outcome.replace(/_/g, ' ')}
                </li>
              ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title={`Unassigned bus-required staff (${candidates.length})`}>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-10!"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or route…"
          />
        </div>

        {isLoading && <p className="text-sm text-gray-500">Loading candidates…</p>}
        {!isLoading && groups.length === 0 && (
          <p className="text-sm text-gray-500">
            No unassigned bus-required staff. Everyone eligible already has a route.
          </p>
        )}

        <div className="space-y-3">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.routeId);
            const allOn = g.staff.every((s) => selected.has(s.staffId));
            return (
              <div key={g.routeId} className="rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    aria-label={isCollapsed ? `Expand route ${g.routeNumber}` : `Collapse route ${g.routeNumber}`}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.routeId)) next.delete(g.routeId);
                        else next.add(g.routeId);
                        return next;
                      })
                    }
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {g.routeNumber} - {g.routeName}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">{g.staff.length}</span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.staff)}
                    className="shrink-0 text-xs font-medium text-green-600 hover:underline"
                  >
                    {allOn ? 'Clear' : 'Select all'}
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="grid grid-cols-1 gap-1 border-t border-gray-100 px-3 py-2 sm:grid-cols-2 dark:border-gray-700">
                    {g.staff.map((s) => (
                      <label key={s.staffId} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-gray-300 text-green-600"
                          checked={selected.has(s.staffId)}
                          onChange={() => toggle(s.staffId)}
                        />
                        <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-gray-100">{s.name}</span>
                        <span className="shrink-0 truncate text-xs text-gray-400">{s.email}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-500">
          {selected.size} selected across {selectedRouteCount} route{selectedRouteCount === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={saving}
            onClick={() => router.push('/staff-route-assignments')}>
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || selected.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {saving ? 'Assigning…' : 'Assign all'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the entry button**

In `app/(admin)/staff-route-assignments/page.tsx`, replace the `{canManage && (...)}` block (lines 62-69) with:

```tsx
        {canManage && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={() => router.push('/staff-route-assignments/bulk-assign')}
              className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border border-green-600 px-3 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10"
            >
              <Users className="h-4 w-4" /> Bulk Assign
            </button>
            <button
              onClick={() => router.push('/staff-route-assignments/assign')}
              className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Assign Route
            </button>
          </div>
        )}
```

`Users` and `Plus` are both already imported on line 6 — no import change needed.

- [ ] **Step 3: Verify the suite still passes**

Run: `npx vitest run`
Expected: PASS, no new failures.

- [ ] **Step 4: Path-scoped typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "bulk-assign|staff-assignments|staff-route-assignments" || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Verify the page compiles and is auth-gated**

```bash
curl -s -o /dev/null -w "status=%{http_code} redirect=%{redirect_url}\n" --max-time 25 \
  http://127.0.0.1:3000/staff-route-assignments/bulk-assign
```

Expected: `status=307` redirecting to `/auth/login?redirect=%2Fstaff-route-assignments%2Fbulk-assign`. A `500` means a compile error — check the dev server log.

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/staff-route-assignments/bulk-assign/page.tsx \
        app/\(admin\)/staff-route-assignments/page.tsx
git commit -m "feat(staff-assignments): bulk assign page grouped by route

Candidates are grouped under their master route with a per-route select-all;
the route is displayed, never chosen. Invalidates the staff-route-assignments
query key on success so the KPI cards and table refresh."
```

---

### Task 4: Live verification

**Files:** none — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing.

- [ ] **Step 1: Confirm the candidate count matches the database**

Run this against the project DB (Supabase MCP `execute_sql`) and note the number:

```sql
with s as (
  select st.id, lower(st.email) as staff_email, lower(p.email) as profile_email, st.transport_route_id
  from staff st left join profiles p on p.id = st.profile_id
  where st.bus_required = true and coalesce(st.is_active,false) = true
)
select count(*) as expected_candidates
from s
join tms_route r on r.id = s.transport_route_id and r.status = 'active'
where not exists (
  select 1 from tms_staff_route_assignment a
  where a.is_active and lower(a.staff_email) in (s.staff_email, s.profile_email));
```

Expected at time of writing: **31**. The page header must show the same number.

- [ ] **Step 2: Human browser check (auth-gated — cannot be done headlessly)**

Ask the user to open `http://localhost:3000/staff-route-assignments/bulk-assign` while logged in and confirm:
- the count in the section title matches Step 1;
- groups are ordered biggest first (Route 29 THIRUPPUR with 5 at the top);
- "Select all" on one group ticks exactly that group;
- the footer reads "N selected across M routes".

- [ ] **Step 3: Assign one small group and verify**

Have the user select **one** route's staff and submit. Then confirm in SQL:

```sql
select staff_email, route_id, source, is_active, assigned_at
from tms_staff_route_assignment
where source = 'admin' and is_active
order by assigned_at desc limit 10;
```

Expected: one row per selected staffer, `source='admin'`, and each `staff_email` equal to that person's `profiles.email`.

- [ ] **Step 4: Verify idempotency**

Have the user re-select the same people (they should no longer appear in the picker — the list refetches after submit). If the API is called again with the same ids, every result must be `skipped_already_assigned` and no new rows created. Confirm the count is unchanged:

```sql
select count(*) from tms_staff_route_assignment where is_active;
```

- [ ] **Step 5: Inspect the strike cron before it next fires**

**This is the operationally important one.** Newly assigned in-charges immediately fall under `/api/cron/incharge-attendance`, which at threshold removes the role *and* bills them. Run the dry run (needs `CRON_SECRET`) and confirm the plan looks sane:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/incharge-attendance?dryRun=1" | head -40
```

Expected: a `plan[]` listing the new assignees with `warn`, not `remove`, on their first unmarked day. Writes nothing.

- [ ] **Step 6: Final commit and push**

```bash
git status --porcelain          # expect clean
git log --oneline origin/main..HEAD
git push -u origin feat/bulk-staff-route-assignment
```

Note: pushing to `JKKN-Institutions/TMS-ADMIN` requires `gh auth switch --user sangeethav-byte`.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Assignments written under `profiles.email` | 1 (`resolveAssignmentEmail`), 2 (used at insert) |
| Candidates matched on either address | 1 (`isBulkCandidate`), 2 (`loadAssignedEmails`) |
| `GET` returns candidates with route | 2 |
| `POST` body is `staffIds` only, route resolved server-side | 2 |
| Auth via existing `requireAssign` | 2 |
| Batch cap 100 | 2 (`MAX_BATCH`) |
| Skip reasons per staffer, one bad row never fails the batch | 1 (`BulkOutcome`), 2 (loop) |
| `source='admin'` (CHECK constraint) | 2 |
| `23505` → skipped, not error | 2 |
| `grantBoardingRole` + `logActivity` best-effort | 2 |
| One active route per staffer | 2 (`assignedEmails.has(email)` guard) |
| Grouped picker, select-all per group, search | 3 |
| Entry button gated by `canManage` | 3 |
| Invalidate `['staff-route-assignments']` | 3 |
| Empty state | 3 |
| Idempotency test | 4 Step 4 |
| Chunked `.in()` with error checks | 2 (`selectIn`) |

No gaps.

**Placeholder scan:** No TBD/TODO. Every code step carries complete code; every "add error handling" is spelled out as a concrete branch.

**Type consistency:** `Candidate`, `CandidateInput`, `BulkResult`, `BulkSummary`, `BulkOutcome`, `RouteGroup` are defined once in Task 1 and imported by name in Tasks 2-3. `resolveAssignmentEmail`, `isBulkCandidate`, `groupCandidatesByRoute`, `summarizeBulkResults`, `normalizeEmail` keep identical signatures across all three tasks. `requireAssign(auth: AuthContext): Promise<boolean>` matches the function being replaced in the existing route.
