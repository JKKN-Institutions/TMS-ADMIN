# Bus In-Charge Monthly Verdict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the bus in-charge scheme its missing reinstatement half — a month-end verdict that cancels a staff transport bill when the route was marked and makes it payable when it was not, plus a pledge screen that lets an already-billed staffer earn their way back.

**Architecture:** All rules that decide money or roles live in pure, unit-tested functions under `lib/`; routes gather facts and apply them. A new month-end cron becomes the sole authority over bills and role removal, and the existing daily cron is demoted to warnings only. A new gate function decides which of four screens a staffer sees in the boarding portal.

**Tech Stack:** Next.js 15 App Router (route handlers), Supabase (service-role client), TypeScript, vitest, Tailwind v4, pg_cron + pg_net for scheduling.

**Spec:** `docs/superpowers/specs/2026-08-18-incharge-monthly-verdict-design.md`

## Global Constraints

- **Modern route pattern only.** New API routes use `withAuth` + `AuthContext` + `createServiceRoleClient` + `requirePerm`. Never `DatabaseService`, never an unprefixed table — that half of the codebase is dead and queries dropped tables.
- **Never resolve a staffer by `staff.email` alone.** Always `resolveStaffId(svc, { email, profileId })` from `lib/identity/staff-lookup.ts`. Matching one column lost 34 of 114 in-charges in the 2026-08-14 run.
- **Bills are cancelled, never deleted.** `status='cancelled'` on `tms_fee_bill`. This follows the Vacate module's precedent.
- **Check the error on every Supabase write and every count.** A swallowed error in this feature reads as "nobody marked attendance" and bills a real person for an infrastructure failure.
- **Tests live under `lib/`**, colocated as `<name>.test.ts`. `@/*` resolves under vitest only for files under `lib/`.
- **Do not run `npm run lint`** — the ESLint config is circular and crashes. Verify with path-scoped `tsc` and `npx vitest run`.
- **`tsc` is already red on `main`** (~540 chronic errors from an untyped Supabase `Database` type). It is NOT a build gate (`ignoreBuildErrors: true`). Judge only errors in files this plan touches; a red `tsc` overall is not a regression.
- **`proxy.test.ts` matches on raw source text.** Writing the string `/api/cron/` as a quoted literal anywhere in `proxy.ts`, even inside a comment, fails the guard test. Add only the exact full path.
- **`lib/activity/log.ts` module and action unions are CLOSED.** Extend the union first or the route will not compile.
- **Dates are IST 'YYYY-MM-DD' strings, compared as strings.** ISO dates sort correctly lexically. Never construct a local `Date` for comparison — the host timezone is not IST.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260818100000_tms_incharge_probation_and_verdict.sql` | Both new tables and their indexes |
| `supabase/migrations/20260818110000_revoke_billed_incharge_reassignments.sql` | One-time cleanup of the 26 leaked assignments |
| `supabase/migrations/20260818120000_tms_incharge_month_verdict_cron.sql` | pg_cron schedule for the month-end job |
| `lib/fees/staff-bill-state.ts` | Is this staffer carrying an unpaid, uncancelled staff bill, and for how much |
| `lib/fees/cancel-staff-bill.ts` | Cancel bills on a pass; make them payable on a fail |
| `lib/boarding/incharge-month.ts` | Pure month rules: service days, the verdict, the probation window |
| `lib/boarding/incharge-gate.ts` | Pure state machine: which screen does this staffer see |
| `app/api/boarding/self-assign/route.ts` | **Modify** — close the `PHASE 2 SEAM` |
| `app/api/boarding/access/route.ts` | **Modify** — publish the gate state and the amount at stake |
| `app/api/boarding/incharge-pledge/route.ts` | Accept the deal: probation row, assignment, role |
| `app/api/cron/incharge-month-verdict/route.ts` | The month-end job |
| `app/api/admin/staff-bills/[id]/mark-paid/route.ts` | Admin records a payment |
| `app/boarding/in-charge/page.tsx` | **Modify** — pledge and must-pay screens |
| `app/boarding/layout.tsx` | **Modify** — route the new gate states |
| `app/(admin)/staff-route-assignments/enforcement/page.tsx` | **Modify** — Monthly tab |
| `app/api/cron/incharge-attendance/route.ts` | **Modify** — warnings only |
| `proxy.ts` | **Modify** — allowlist the new cron path |

---

# Phase 1 — Stop the leak

## Task 1: Migrations for the probation and verdict tables

**Files:**
- Create: `supabase/migrations/20260818100000_tms_incharge_probation_and_verdict.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `tms_incharge_probation` and `tms_incharge_month_verdict`, relied on by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- Bus in-charge monthly verdict: the two tables the reinstatement half needs.
--
-- tms_incharge_probation is the PLEDGE: a billed staffer accepts "mark every
-- service day until month end and this bill is cancelled". Accepting is what
-- reassigns them, which is what reopens the portal so they can actually mark.
--
-- tms_incharge_month_verdict is the AUDIT TRAIL: one row per person per month
-- recording exactly which days were required, which were marked, and what
-- happened to the bill. Every cancellation and every bill must be explainable
-- from this table alone.

create table if not exists tms_incharge_probation (
  id uuid primary key default gen_random_uuid(),
  staff_email text not null,
  person_id uuid,
  route_id uuid,
  assignment_id uuid,
  accepted_at timestamptz not null default now(),
  window_start date not null,
  window_end date not null,
  status text not null default 'active'
    check (status in ('active', 'passed', 'failed')),
  created_at timestamptz not null default now()
);

-- At most ONE live probation per person. This partial index -- not a
-- check-then-act guard in the route -- is what settles a double-submit race,
-- following the precedent of the active (staff_email, route_id) index on
-- tms_staff_route_assignment.
create unique index if not exists tms_incharge_probation_one_active
  on tms_incharge_probation (lower(staff_email))
  where status = 'active';

create index if not exists tms_incharge_probation_email_idx
  on tms_incharge_probation (lower(staff_email));

create table if not exists tms_incharge_month_verdict (
  id uuid primary key default gen_random_uuid(),
  staff_email text not null,
  person_id uuid,
  route_id uuid,
  month date not null,
  window_start date not null,
  window_end date not null,
  required_days int not null default 0,
  marked_days int not null default 0,
  missed_dates date[] not null default '{}',
  outcome text not null check (outcome in ('passed', 'failed')),
  bill_action text check (bill_action in ('cancelled', 'generated', 'none')),
  was_probation boolean not null default false,
  mode text not null check (mode in ('shadow', 'enforce')),
  decided_at timestamptz not null default now()
);

-- One verdict per person per month makes a re-run idempotent via upsert.
create unique index if not exists tms_incharge_month_verdict_person_month
  on tms_incharge_month_verdict (lower(staff_email), month);
```

- [ ] **Step 2: Apply the migration**

Apply with the Supabase MCP `apply_migration` tool (the agent has real access to project `kvizhngldtiuufknvehv`), using name `tms_incharge_probation_and_verdict` and the SQL above.

- [ ] **Step 3: Verify both tables exist with the right constraints**

Run via `execute_sql`:

```sql
select table_name, count(*) as columns
from information_schema.columns
where table_name in ('tms_incharge_probation','tms_incharge_month_verdict')
group by 1;
```

Expected: two rows, `tms_incharge_probation` with 10 columns and `tms_incharge_month_verdict` with 14.

- [ ] **Step 4: Verify the partial unique index actually blocks a second active probation**

```sql
do $$
begin
  insert into tms_incharge_probation (staff_email, window_start, window_end)
  values ('probe@example.test', '2026-08-18', '2026-08-31');
  begin
    insert into tms_incharge_probation (staff_email, window_start, window_end)
    values ('PROBE@example.test', '2026-08-18', '2026-08-31');
    raise exception 'FAIL: duplicate active probation was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate active probation rejected';
  end;
  delete from tms_incharge_probation where staff_email ilike 'probe@example.test';
end $$;
```

Expected: `NOTICE: PASS: duplicate active probation rejected`. Note the deliberate case difference — the index is on `lower(staff_email)`, so it must catch it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818100000_tms_incharge_probation_and_verdict.sql
git commit -m "feat(incharge): add probation and month-verdict tables"
```

---

## Task 2: Staff bill state — is this person carrying an unpaid bill

**Files:**
- Create: `lib/fees/staff-bill-state.ts`
- Test: `lib/fees/staff-bill-state.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `summarizeStaffBills(rows: StaffBillRow[]): StaffBillState`
  - `loadStaffBillState(svc, opts: { personId: string; transportYearId: string }): Promise<StaffBillState>`
  - `interface StaffBillRow { id: string; amount: number; status: string; paid_at: string | null }`
  - `interface StaffBillState { hasOutstanding: boolean; outstandingAmount: number; billIds: string[] }`

- [ ] **Step 1: Write the failing test**

Create `lib/fees/staff-bill-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summarizeStaffBills } from './staff-bill-state';

describe('summarizeStaffBills', () => {
  it('reports no outstanding bill for an empty list', () => {
    expect(summarizeStaffBills([])).toEqual({
      hasOutstanding: false, outstandingAmount: 0, billIds: [],
    });
  });

  it('counts a staff_deferred, unpaid bill as outstanding', () => {
    expect(summarizeStaffBills([
      { id: 'a', amount: 13310, status: 'staff_deferred', paid_at: null },
    ])).toEqual({ hasOutstanding: true, outstandingAmount: 13310, billIds: ['a'] });
  });

  it('counts a generated, unpaid bill as outstanding', () => {
    expect(summarizeStaffBills([
      { id: 'a', amount: 500, status: 'generated', paid_at: null },
    ])).toEqual({ hasOutstanding: true, outstandingAmount: 500, billIds: ['a'] });
  });

  it('ignores a cancelled bill', () => {
    expect(summarizeStaffBills([
      { id: 'a', amount: 13310, status: 'cancelled', paid_at: null },
    ])).toEqual({ hasOutstanding: false, outstandingAmount: 0, billIds: [] });
  });

  it('ignores a paid bill even when its status is still generated', () => {
    // paid_at is the authority on settlement, not status -- the admin
    // mark-paid path writes paid_at and leaves status alone.
    expect(summarizeStaffBills([
      { id: 'a', amount: 13310, status: 'generated', paid_at: '2026-08-20T05:00:00Z' },
    ])).toEqual({ hasOutstanding: false, outstandingAmount: 0, billIds: [] });
  });

  it('sums several outstanding terms and keeps every id', () => {
    expect(summarizeStaffBills([
      { id: 'a', amount: 1000, status: 'staff_deferred', paid_at: null },
      { id: 'b', amount: 2000, status: 'staff_deferred', paid_at: null },
      { id: 'c', amount: 9999, status: 'cancelled', paid_at: null },
    ])).toEqual({ hasOutstanding: true, outstandingAmount: 3000, billIds: ['a', 'b'] });
  });

  it('coerces a string amount from the numeric column', () => {
    // Supabase returns `numeric` as a string. Adding it unconverted yields
    // '01000' rather than 1000 and silently understates every total.
    expect(summarizeStaffBills([
      { id: 'a', amount: '1000' as unknown as number, status: 'generated', paid_at: null },
      { id: 'b', amount: '250.50' as unknown as number, status: 'generated', paid_at: null },
    ]).outstandingAmount).toBe(1250.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fees/staff-bill-state.test.ts`
Expected: FAIL — `Failed to resolve import "./staff-bill-state"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/staff-bill-state.ts`:

```ts
/**
 * Does this staffer owe transport fees right now?
 *
 * The whole fee gate hangs off this one question: it decides whether the
 * boarding portal opens, whether the willingness toggle is offered, and whether
 * the pledge screen appears. So the rule lives in a pure function with tests
 * rather than being re-expressed as a filter at each call site, where the three
 * copies would eventually disagree.
 *
 * A bill is OUTSTANDING when it is not cancelled and not paid. `paid_at` is the
 * authority on settlement, not `status` -- the admin mark-paid path writes
 * paid_at and leaves the status as the historical record of how the bill arose.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StaffBillRow {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
}

export interface StaffBillState {
  hasOutstanding: boolean;
  outstandingAmount: number;
  billIds: string[];
}

export function summarizeStaffBills(rows: StaffBillRow[]): StaffBillState {
  const outstanding = rows.filter((r) => r.status !== 'cancelled' && r.paid_at === null);
  // `amount` is a Postgres numeric, which supabase-js hands back as a STRING.
  // Number() here is not defensive noise -- summing the raw values concatenates.
  const outstandingAmount = outstanding.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  return {
    hasOutstanding: outstanding.length > 0,
    outstandingAmount,
    billIds: outstanding.map((r) => r.id),
  };
}

/**
 * The staffer's current-year staff bills, summarized.
 *
 * Throws on a query error rather than returning "nothing outstanding". A
 * swallowed error here opens the portal to someone who owes money, which is the
 * exact leak this feature exists to close -- failing loudly is the safe default.
 */
export async function loadStaffBillState(
  svc: SupabaseClient,
  opts: { personId: string; transportYearId: string },
): Promise<StaffBillState> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .select('id, amount, status, paid_at')
    .eq('person_id', opts.personId)
    .eq('person_type', 'staff')
    .eq('transport_year_id', opts.transportYearId);
  if (error) throw new Error(`loadStaffBillState failed: ${error.message}`);
  return summarizeStaffBills((data ?? []) as StaffBillRow[]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/fees/staff-bill-state.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck the new file**

Run: `npx tsc --noEmit --skipLibCheck lib/fees/staff-bill-state.ts`
Expected: no errors mentioning `staff-bill-state.ts`. Errors in other files are the chronic pre-existing debt described in Global Constraints — ignore them.

- [ ] **Step 6: Commit**

```bash
git add lib/fees/staff-bill-state.ts lib/fees/staff-bill-state.test.ts
git commit -m "feat(fees): add staff outstanding-bill state helper"
```

---

## Task 3: Close the PHASE 2 SEAM in self-assign

This is the hole the 26 walked through. It is the highest-value change in the plan.

**Files:**
- Create: `lib/boarding/self-assign-guard.ts`
- Test: `lib/boarding/self-assign-guard.test.ts`
- Modify: `app/api/boarding/self-assign/route.ts`

**Interfaces:**
- Consumes: `StaffBillState` from Task 2.
- Produces: `maySelfAssign(input: SelfAssignInput): SelfAssignVerdict`
  - `interface SelfAssignInput { hasOutstandingBill: boolean; hasActiveProbation: boolean }`
  - `type SelfAssignVerdict = { allowed: true } | { allowed: false; reason: 'outstanding_bill' }`

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/self-assign-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { maySelfAssign } from './self-assign-guard';

describe('maySelfAssign', () => {
  it('allows a staffer with no outstanding bill', () => {
    expect(maySelfAssign({ hasOutstandingBill: false, hasActiveProbation: false }))
      .toEqual({ allowed: true });
  });

  it('blocks a staffer carrying an outstanding bill', () => {
    // This is the leak: 26 staff were removed and billed on 2026-08-14, then
    // re-granted themselves the fee exemption through the willingness toggle
    // on 08-17 and 08-18 because this check did not exist.
    expect(maySelfAssign({ hasOutstandingBill: true, hasActiveProbation: false }))
      .toEqual({ allowed: false, reason: 'outstanding_bill' });
  });

  it('allows a billed staffer who has an ACTIVE probation', () => {
    // The pledge route creates the probation and then assigns. Without this
    // branch, accepting the deal would be rejected by the very guard that
    // makes the deal necessary.
    expect(maySelfAssign({ hasOutstandingBill: true, hasActiveProbation: true }))
      .toEqual({ allowed: true });
  });

  it('allows an unbilled staffer with a stale active probation', () => {
    expect(maySelfAssign({ hasOutstandingBill: false, hasActiveProbation: true }))
      .toEqual({ allowed: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/boarding/self-assign-guard.test.ts`
Expected: FAIL — `Failed to resolve import "./self-assign-guard"`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/self-assign-guard.ts`:

```ts
/**
 * May this staffer take the bus in-charge duty right now?
 *
 * The in-charge duty carries a transport fee exemption. Someone who already
 * owes transport fees must not be able to hand themselves that exemption --
 * doing so cancels, in effect, a bill the transport office raised.
 *
 * This existed as a comment for weeks:
 *
 *   -- PHASE 2 SEAM (staff fees) --
 *   When staff transport fees exist, block here if this staffer is not cleared.
 *   No-op in Phase 1.
 *
 * Staff fees now exist. Between 2026-08-17 and 2026-08-18, twenty-six staff who
 * had been removed and billed on 08-14 walked back through the willingness
 * toggle and re-granted themselves the exemption. This function is that seam,
 * closed.
 *
 * The probation exception is load-bearing, not a loophole: accepting the pledge
 * is precisely how a billed staffer is meant to return, and the pledge route
 * creates the probation row before it assigns. Without this branch the guard
 * would reject the one path back that the design promises.
 */
export interface SelfAssignInput {
  hasOutstandingBill: boolean;
  hasActiveProbation: boolean;
}

export type SelfAssignVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'outstanding_bill' };

export function maySelfAssign(input: SelfAssignInput): SelfAssignVerdict {
  if (input.hasOutstandingBill && !input.hasActiveProbation) {
    return { allowed: false, reason: 'outstanding_bill' };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/boarding/self-assign-guard.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the guard into the route**

In `app/api/boarding/self-assign/route.ts`, add these imports beside the existing ones:

```ts
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { loadStaffBillState } from '@/lib/fees/staff-bill-state';
import { maySelfAssign } from '@/lib/boarding/self-assign-guard';
```

Then replace this entire comment block:

```ts
    // ── PHASE 2 SEAM (staff fees) ──────────────────────────────────────────────
    // When staff transport fees exist, block here if this staffer is not cleared
    // (mirror the learner tms_student_transport_access gate). No-op in Phase 1.
```

with:

```ts
    // ── Fee gate ───────────────────────────────────────────────────────────────
    // The in-charge duty carries a fee exemption, so a staffer who already owes
    // transport fees cannot hand themselves that exemption. An ACTIVE probation
    // is the sanctioned way back (see /api/boarding/incharge-pledge), so it
    // passes through here.
    const { data: currentYear } = await svc
      .from('tms_transport_year')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();

    if (currentYear?.id) {
      const staffId = await resolveStaffId(svc, { email, profileId: auth.userId });
      if (staffId) {
        const billState = await loadStaffBillState(svc, {
          personId: staffId,
          transportYearId: currentYear.id as string,
        });
        const { data: probation } = await svc
          .from('tms_incharge_probation')
          .select('id')
          .ilike('staff_email', email)
          .eq('status', 'active')
          .maybeSingle();

        const verdict = maySelfAssign({
          hasOutstandingBill: billState.hasOutstanding,
          hasActiveProbation: Boolean(probation?.id),
        });
        if (!verdict.allowed) {
          return NextResponse.json(
            {
              error:
                'Transport fees are outstanding on your account. Accept the attendance ' +
                'commitment or settle the fees to continue as bus in-charge.',
              reason: verdict.reason,
            },
            { status: 403 },
          );
        }
      }
    }
```

- [ ] **Step 6: Typecheck the touched files**

Run: `npx tsc --noEmit --skipLibCheck lib/boarding/self-assign-guard.ts`
Expected: no errors naming `self-assign-guard.ts`.

- [ ] **Step 7: Verify the guard blocks a real billed staffer**

Run via `execute_sql` — confirm one of the 26 would now be rejected:

```sql
select s.id as staff_id,
       (select count(*) from tms_fee_bill b
         where b.person_id = s.id and b.person_type='staff'
           and b.status <> 'cancelled' and b.paid_at is null) as outstanding_bills,
       (select count(*) from tms_incharge_probation p
         where lower(p.staff_email) = lower(s.institution_email) and p.status='active') as active_probation
from staff s
where lower(s.institution_email) = 'drrajkumar@jkkn.ac.in';
```

Expected: `outstanding_bills` ≥ 1 and `active_probation` = 0 — so `maySelfAssign` returns `allowed:false` for this person.

- [ ] **Step 8: Commit**

```bash
git add lib/boarding/self-assign-guard.ts lib/boarding/self-assign-guard.test.ts app/api/boarding/self-assign/route.ts
git commit -m "fix(boarding): block self-assign while transport fees are outstanding"
```

---

## Task 4: One-time cleanup of the 26 leaked assignments

**Files:**
- Create: `supabase/migrations/20260818110000_revoke_billed_incharge_reassignments.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a backup table `tms_staff_route_assignment_backup_20260818`.

- [ ] **Step 1: Write the migration**

```sql
-- Revoke the in-charge assignments that billed staff re-granted themselves.
--
-- On 2026-08-14 the enforcement run removed and billed 35 in-charges. Between
-- 08-17 and 08-18, twenty-six of them re-opened /boarding/in-charge, flipped the
-- willingness toggle and self-assigned again -- restoring the fee exemption that
-- their bill had just replaced. The guard that now prevents this shipped in the
-- same change as this migration; the guard is forward-looking, so the rows
-- already created must be reversed here.
--
-- Fully reversible: every affected row is copied out first.

create table if not exists tms_staff_route_assignment_backup_20260818 as
select a.*, now() as backed_up_at
from tms_staff_route_assignment a
where false;

with billed as (
  select distinct b.person_id
  from tms_fee_bill b
  where b.person_type = 'staff'
    and b.status <> 'cancelled'
    and b.paid_at is null
),
leaked as (
  select a.id
  from tms_staff_route_assignment a
  join staff s
    on lower(trim(a.staff_email)) in (
         lower(trim(coalesce(s.email, ''))),
         lower(trim(coalesce(s.institution_email, '')))
       )
  join billed b on b.person_id = s.id
  where a.is_active
    and a.source = 'self'
    -- Only re-grants made AFTER the enforcement run. An assignment predating it
    -- was not a re-entry and is not this migration's business.
    and a.assigned_at >= '2026-08-15'
)
insert into tms_staff_route_assignment_backup_20260818
select a.*, now()
from tms_staff_route_assignment a
join leaked l on l.id = a.id;

update tms_staff_route_assignment a
set is_active = false
where a.id in (select id from tms_staff_route_assignment_backup_20260818);

-- ── Verification (run separately after applying) ─────────────────────────────
--   select count(*) from tms_staff_route_assignment_backup_20260818;   -- expect 26
--   -- and zero billed-and-active staff should remain:
--   -- (see the Step 3 query in the plan)
--
-- ── Rollback ─────────────────────────────────────────────────────────────────
--   update tms_staff_route_assignment a set is_active = true
--   from tms_staff_route_assignment_backup_20260818 b where b.id = a.id;
```

- [ ] **Step 2: Count the affected rows BEFORE applying**

Run via `execute_sql` — this is the same predicate the migration uses, as a `select`:

```sql
with billed as (
  select distinct b.person_id from tms_fee_bill b
  where b.person_type='staff' and b.status <> 'cancelled' and b.paid_at is null
)
select count(*) from tms_staff_route_assignment a
join staff s on lower(trim(a.staff_email)) in
  (lower(trim(coalesce(s.email,''))), lower(trim(coalesce(s.institution_email,''))))
join billed b on b.person_id = s.id
where a.is_active and a.source='self' and a.assigned_at >= '2026-08-15';
```

Expected: **26**. If it is not 26, STOP and report the number — the population changed since the plan was written, and revoking the wrong people's roles is not recoverable from a user's perspective even though the rows are.

- [ ] **Step 3: Apply the migration and verify**

Apply via `apply_migration` with name `revoke_billed_incharge_reassignments`. Then:

```sql
select (select count(*) from tms_staff_route_assignment_backup_20260818) as backed_up,
       (select count(*) from tms_staff_route_assignment a
          join staff s on lower(trim(a.staff_email)) in
            (lower(trim(coalesce(s.email,''))), lower(trim(coalesce(s.institution_email,''))))
          join tms_fee_bill b on b.person_id = s.id and b.person_type='staff'
            and b.status <> 'cancelled' and b.paid_at is null
        where a.is_active) as still_leaking;
```

Expected: `backed_up` = 26, `still_leaking` = 0.

- [ ] **Step 4: Revoke the boarding role for the 26**

The migration deactivates the assignment; the role grant is separate. Run:

```sql
-- maybeRevokeBoardingRole drops the role only when the person has no OTHER
-- active assignment, which SQL can express directly.
select b.staff_email
from tms_staff_route_assignment_backup_20260818 b
where not exists (
  select 1 from tms_staff_route_assignment a
  where lower(a.staff_email) = lower(b.staff_email) and a.is_active
);
```

Report the list. Roles are revoked through `maybeRevokeBoardingRole` in application code, so for the cleanup run these are revoked by calling the enforcement board's existing unassign action, or left to the next login (the access route recomputes from assignments, so a stale role grants nothing on its own). Record which choice was made in the commit message.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818110000_revoke_billed_incharge_reassignments.sql
git commit -m "fix(incharge): revoke the 26 self-regranted in-charge assignments"
```

---

# Phase 2 — The rules

## Task 5: Pure month rules

**Files:**
- Create: `lib/boarding/incharge-month.ts`
- Test: `lib/boarding/incharge-month.test.ts`

**Interfaces:**
- Consumes: `isServiceWeekday` from `lib/boarding/incharge-attendance.ts`.
- Produces:
  - `serviceDays(bookedDates: string[], from: string, to: string): string[]`
  - `evaluateMonth(input: { serviceDays: string[]; markedDates: string[] }): MonthVerdict`
  - `monthWindow(date: string): { start: string; end: string }`
  - `probationWindow(acceptDate: string): { start: string; end: string }`
  - `interface MonthVerdict { outcome: 'passed' | 'failed'; requiredDays: number; markedDays: number; missedDates: string[] }`

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/incharge-month.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serviceDays, evaluateMonth, monthWindow, probationWindow } from './incharge-month';

describe('serviceDays', () => {
  it('keeps only weekdays inside the window that carried bookings', () => {
    // 2026-08-15 is a Saturday, 2026-08-16 a Sunday.
    expect(serviceDays(
      ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'],
      '2026-08-13', '2026-08-17',
    )).toEqual(['2026-08-13', '2026-08-14', '2026-08-17']);
  });

  it('excludes dates outside the window', () => {
    expect(serviceDays(
      ['2026-08-10', '2026-08-13', '2026-08-20'],
      '2026-08-12', '2026-08-18',
    )).toEqual(['2026-08-13']);
  });

  it('deduplicates repeated booking dates', () => {
    // tms_booking has one row per rider, so a 40-seat bus yields 40 rows
    // for the same date. Counting them as 40 service days would make the
    // denominator meaningless.
    expect(serviceDays(
      ['2026-08-13', '2026-08-13', '2026-08-13'],
      '2026-08-01', '2026-08-31',
    )).toEqual(['2026-08-13']);
  });

  it('returns a sorted list regardless of input order', () => {
    expect(serviceDays(
      ['2026-08-17', '2026-08-13', '2026-08-14'],
      '2026-08-01', '2026-08-31',
    )).toEqual(['2026-08-13', '2026-08-14', '2026-08-17']);
  });

  it('returns nothing when the route never ran', () => {
    expect(serviceDays([], '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('evaluateMonth', () => {
  it('passes when every service day was marked', () => {
    expect(evaluateMonth({
      serviceDays: ['2026-08-13', '2026-08-14'],
      markedDates: ['2026-08-13', '2026-08-14'],
    })).toEqual({ outcome: 'passed', requiredDays: 2, markedDays: 2, missedDates: [] });
  });

  it('fails on a single missed service day (zero-miss rule)', () => {
    expect(evaluateMonth({
      serviceDays: ['2026-08-13', '2026-08-14', '2026-08-17'],
      markedDates: ['2026-08-13', '2026-08-17'],
    })).toEqual({
      outcome: 'failed', requiredDays: 3, markedDays: 2, missedDates: ['2026-08-14'],
    });
  });

  it('ignores marks on days that were not service days', () => {
    // A mark on a Saturday is real work but cannot create credit that the
    // denominator does not contain, or markedDays would exceed requiredDays.
    expect(evaluateMonth({
      serviceDays: ['2026-08-13'],
      markedDates: ['2026-08-13', '2026-08-15'],
    })).toEqual({ outcome: 'passed', requiredDays: 1, markedDays: 1, missedDates: [] });
  });

  it('passes a route that never ran', () => {
    // No service days means no duty was possible, so there is nothing to
    // punish. Deliberate: the alternative bills someone for a bus that the
    // college did not run.
    expect(evaluateMonth({ serviceDays: [], markedDates: [] })).toEqual({
      outcome: 'passed', requiredDays: 0, markedDays: 0, missedDates: [],
    });
  });

  it('reports every missed date, in order', () => {
    const v = evaluateMonth({
      serviceDays: ['2026-08-13', '2026-08-14', '2026-08-17', '2026-08-18'],
      markedDates: ['2026-08-17'],
    });
    expect(v.missedDates).toEqual(['2026-08-13', '2026-08-14', '2026-08-18']);
    expect(v.outcome).toBe('failed');
  });
});

describe('monthWindow', () => {
  it('spans a 31-day month', () => {
    expect(monthWindow('2026-08-18')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('spans a 30-day month', () => {
    expect(monthWindow('2026-09-05')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('spans February in a non-leap year', () => {
    expect(monthWindow('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('spans February in a leap year', () => {
    expect(monthWindow('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
});

describe('probationWindow', () => {
  it('runs from the accept date to the end of that month', () => {
    expect(probationWindow('2026-08-18')).toEqual({ start: '2026-08-18', end: '2026-08-31' });
  });

  it('is a single day when accepted on the last day of the month', () => {
    expect(probationWindow('2026-08-31')).toEqual({ start: '2026-08-31', end: '2026-08-31' });
  });

  it('rejects a malformed date rather than guessing', () => {
    expect(() => probationWindow('18-08-2026')).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/boarding/incharge-month.test.ts`
Expected: FAIL — `Failed to resolve import "./incharge-month"`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/incharge-month.ts`:

```ts
/**
 * Pure month rules for the bus in-charge verdict.
 *
 * The daily loop in incharge-attendance.ts answers "did they miss today?". This
 * answers the different question the fee gate needs: "over this whole window,
 * was the duty performed?" -- which decides whether a transport fee bill is
 * cancelled or becomes payable.
 *
 * No I/O. The cron gathers booking dates and attendance dates; this decides.
 *
 * Two definitions carry the fairness of the whole feature:
 *
 *   SERVICE DAY -- a weekday on which the route actually carried booked riders.
 *   If nobody booked, there was nothing to mark, so the day is neither credit
 *   nor blame. Counting raw weekdays instead would punish in-charges for
 *   holidays and for buses the college did not run.
 *
 *   MARKED -- any attendance row for the route that day, either leg, by anyone
 *   assigned to it. Attendance is one shared roster per route per day and the
 *   first mark wins, so crediting only the person who marked would fail the
 *   colleagues who opened the app second. On one route nine in-charges share a
 *   single roster.
 */
import { isServiceWeekday } from './incharge-attendance';

export interface MonthVerdict {
  outcome: 'passed' | 'failed';
  requiredDays: number;
  markedDays: number;
  missedDates: string[];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The days in [from, to] on which this route actually ran.
 *
 * `bookedDates` comes straight from tms_booking, which holds ONE ROW PER RIDER
 * -- a full bus yields forty rows for the same date. Deduplication is therefore
 * not tidiness but correctness: without it a popular route's denominator would
 * be forty times its real size.
 */
export function serviceDays(bookedDates: string[], from: string, to: string): string[] {
  const days = new Set<string>();
  for (const d of bookedDates) {
    if (d >= from && d <= to && isServiceWeekday(d)) days.add(d);
  }
  // ISO 'YYYY-MM-DD' sorts correctly as plain strings, so no Date parsing is
  // needed -- and none is wanted, since the host timezone is not IST.
  return [...days].sort();
}

/**
 * Zero-miss rule: every service day in the window must be marked.
 *
 * An empty window PASSES. No service days means no duty was possible, and
 * billing someone for a bus that never ran is indefensible.
 *
 * `markedDates` is intersected with `serviceDays` rather than counted directly,
 * so a mark on a non-service day cannot push markedDays above requiredDays.
 */
export function evaluateMonth(input: {
  serviceDays: string[];
  markedDates: string[];
}): MonthVerdict {
  const marked = new Set(input.markedDates);
  const missedDates = input.serviceDays.filter((d) => !marked.has(d));
  return {
    outcome: missedDates.length === 0 ? 'passed' : 'failed',
    requiredDays: input.serviceDays.length,
    markedDays: input.serviceDays.length - missedDates.length,
    missedDates,
  };
}

/** Last calendar day of the month containing `date`, as 'YYYY-MM-DD'. */
function lastDayOfMonth(year: number, month1to12: number): string {
  // Day 0 of the NEXT month is the last day of this one. UTC throughout so the
  // host timezone cannot shift the answer across a month boundary.
  const d = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parts(date: string): { y: number; m: number } {
  const m = DATE_RE.exec(date);
  // Throwing beats defaulting: every caller passes a date that decides a bill,
  // and a silently-wrong window would cancel or raise the wrong one.
  if (!m) throw new Error(`expected YYYY-MM-DD, received "${date}"`);
  return { y: Number(m[1]), m: Number(m[2]) };
}

/** The whole calendar month containing `date` — the ordinary verdict window. */
export function monthWindow(date: string): { start: string; end: string } {
  const { y, m } = parts(date);
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: lastDayOfMonth(y, m) };
}

/**
 * The probation window: from the day the staffer accepted the pledge to the end
 * of that month. Their words: "up to today date to this month last".
 */
export function probationWindow(acceptDate: string): { start: string; end: string } {
  const { y, m } = parts(acceptDate);
  return { start: acceptDate, end: lastDayOfMonth(y, m) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/boarding/incharge-month.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Confirm the existing daily-loop tests still pass**

Run: `npx vitest run lib/boarding/incharge-attendance.test.ts`
Expected: PASS — this task imports from that module but changes nothing in it.

- [ ] **Step 6: Commit**

```bash
git add lib/boarding/incharge-month.ts lib/boarding/incharge-month.test.ts
git commit -m "feat(incharge): add pure month verdict rules"
```

---

## Task 6: The gate state machine

**Files:**
- Create: `lib/boarding/incharge-gate.ts`
- Test: `lib/boarding/incharge-gate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `deriveInChargeGate(input: InChargeGateInput): InChargeGate`
  - `type InChargeGate = 'in_duty' | 'choose' | 'pledge' | 'must_pay' | 'denied'`
  - `interface InChargeGateInput { allowed: boolean; eligible: boolean; assignedRouteCount: number; hasRoute: boolean; hasOutstandingBill: boolean; probationThisMonth: 'none' | 'active' | 'failed'; remainingServiceDays: number }`

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/incharge-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveInChargeGate, type InChargeGateInput } from './incharge-gate';

const base: InChargeGateInput = {
  allowed: false,
  eligible: true,
  assignedRouteCount: 0,
  hasRoute: true,
  hasOutstandingBill: false,
  probationThisMonth: 'none',
  remainingServiceDays: 5,
};

describe('deriveInChargeGate', () => {
  it('opens the portal for an assigned, permitted staffer', () => {
    expect(deriveInChargeGate({ ...base, allowed: true, assignedRouteCount: 1 }))
      .toBe('in_duty');
  });

  it('opens the portal during an active probation', () => {
    // Accepting the pledge reassigns them, so `allowed` is already true. This
    // is the whole reason the promise "mark daily and the bill is cancelled"
    // is keepable -- marking requires the portal.
    expect(deriveInChargeGate({
      ...base, allowed: true, assignedRouteCount: 1,
      hasOutstandingBill: true, probationThisMonth: 'active',
    })).toBe('in_duty');
  });

  it('offers the pledge to a billed, unassigned staffer', () => {
    expect(deriveInChargeGate({ ...base, hasOutstandingBill: true })).toBe('pledge');
  });

  it('demands payment when the probation already failed this month', () => {
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, probationThisMonth: 'failed',
    })).toBe('must_pay');
  });

  it('demands payment when no service days remain in the month', () => {
    // Offering a commitment that cannot be honoured -- there are no days left
    // to mark -- would be a promise the system knows it will break.
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, remainingServiceDays: 0,
    })).toBe('must_pay');
  });

  it('demands payment when the staffer has no allocated route', () => {
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, hasRoute: false,
    })).toBe('must_pay');
  });

  it('demands payment when the staffer is no longer eligible', () => {
    expect(deriveInChargeGate({
      ...base, hasOutstandingBill: true, eligible: false,
    })).toBe('must_pay');
  });

  it('offers the willingness toggle to an eligible, unbilled, unassigned staffer', () => {
    expect(deriveInChargeGate(base)).toBe('choose');
  });

  it('denies an unbilled staffer whose route is not allocated', () => {
    expect(deriveInChargeGate({ ...base, hasRoute: false })).toBe('denied');
  });

  it('denies a non-eligible user', () => {
    expect(deriveInChargeGate({ ...base, eligible: false })).toBe('denied');
  });

  it('denies an assigned staffer whose role grant failed', () => {
    // Not 'choose': they already have an assignment, so the toggle would
    // invite a confirm the server rejects with 409.
    expect(deriveInChargeGate({ ...base, assignedRouteCount: 1 })).toBe('denied');
  });

  it('puts the bill ahead of the toggle', () => {
    // An eligible, unassigned staffer who owes money must see the pledge, not
    // the willingness toggle -- the toggle would re-grant the exemption.
    expect(deriveInChargeGate({ ...base, hasOutstandingBill: true }))
      .not.toBe('choose');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/boarding/incharge-gate.test.ts`
Expected: FAIL — `Failed to resolve import "./incharge-gate"`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/incharge-gate.ts`:

```ts
/**
 * Which screen does this staffer see in the boarding portal?
 *
 * Extends deriveBoardingAccess in access-state.ts with the fee dimension. The
 * two are kept separate rather than merged: access-state answers "may you use
 * the portal", which the layout has always asked, while this answers "and what
 * do we show you if not" -- a question that only exists now that a bill can
 * stand between a staffer and their duty.
 *
 * States:
 *   'in_duty'  -- the full portal. Includes anyone on an ACTIVE probation,
 *                 because accepting the pledge reassigns them.
 *   'choose'   -- the willingness toggle: eligible, unbilled, not yet assigned.
 *   'pledge'   -- billed, and a commitment is still achievable this month.
 *   'must_pay' -- billed, and no commitment is available. Only payment reopens.
 *   'denied'   -- the blocked screen.
 *
 * ORDER IS THE DESIGN. The bill is checked BEFORE the willingness toggle,
 * because a billed staffer who reached the toggle would re-grant themselves the
 * fee exemption -- which is precisely how twenty-six people escaped their bills
 * between 2026-08-17 and 08-18.
 */
export type InChargeGate = 'in_duty' | 'choose' | 'pledge' | 'must_pay' | 'denied';

export interface InChargeGateInput {
  /** Holds tms.attendance.scan AND is assigned to at least one active route. */
  allowed: boolean;
  /** Active bus_required staff (the eligibility RPC's verdict). */
  eligible: boolean;
  /** Active tms_staff_route_assignment rows for this staffer. */
  assignedRouteCount: number;
  /** staff.transport_route_id resolves to an ACTIVE route. */
  hasRoute: boolean;
  /** An uncancelled, unpaid current-year staff transport bill exists. */
  hasOutstandingBill: boolean;
  /** This person's probation for the CURRENT month. */
  probationThisMonth: 'none' | 'active' | 'failed';
  /** Service days left between today and month end, on their route. */
  remainingServiceDays: number;
}

export function deriveInChargeGate(input: InChargeGateInput): InChargeGate {
  // Already in the portal -- including everyone mid-probation, who was
  // reassigned the moment they accepted.
  if (input.allowed) return 'in_duty';

  if (input.hasOutstandingBill) {
    // The pledge may only be offered when it is actually honourable: the
    // staffer must be eligible, have a route to mark, not have already failed
    // this month, and have at least one service day left to mark on.
    const canCommit =
      input.probationThisMonth === 'none' &&
      input.remainingServiceDays > 0 &&
      input.eligible &&
      input.hasRoute;
    return canCommit ? 'pledge' : 'must_pay';
  }

  if (input.eligible && input.assignedRouteCount === 0 && input.hasRoute) return 'choose';
  return 'denied';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/boarding/incharge-gate.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/incharge-gate.ts lib/boarding/incharge-gate.test.ts
git commit -m "feat(boarding): add the in-charge fee gate state machine"
```

---

## Task 7: Cancel and generate staff bills

**Files:**
- Create: `lib/fees/cancel-staff-bill.ts`
- Test: `lib/fees/cancel-staff-bill.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cancelStaffBills(svc, opts: { personId: string; transportYearId: string }): Promise<{ cancelled: number }>`
  - `makeStaffBillsPayable(svc, opts: { personId: string; transportYearId: string }): Promise<{ generated: number }>`

- [ ] **Step 1: Write the failing test**

Create `lib/fees/cancel-staff-bill.test.ts`. This uses a hand-rolled fake rather than a mocking library, matching how the codebase tests I/O boundaries:

```ts
import { describe, it, expect } from 'vitest';
import { cancelStaffBills, makeStaffBillsPayable } from './cancel-staff-bill';

/** Minimal stand-in for the supabase query builder chain these functions use. */
function fakeSvc(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<Record<string, unknown>> = [];
  const builder: Record<string, unknown> = {
    update(payload: unknown) { calls.push({ op: 'update', payload }); return builder; },
    eq(col: string, val: unknown) { calls.push({ op: 'eq', col, val }); return builder; },
    in(col: string, val: unknown) { calls.push({ op: 'in', col, val }); return builder; },
    is(col: string, val: unknown) { calls.push({ op: 'is', col, val }); return builder; },
    select() { return Promise.resolve(result); },
  };
  return {
    calls,
    svc: { from(table: string) { calls.push({ op: 'from', table }); return builder; } },
  };
}

describe('cancelStaffBills', () => {
  it('cancels the uncancelled, unpaid current-year staff bills', async () => {
    const { svc, calls } = fakeSvc({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    const res = await cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    });
    expect(res).toEqual({ cancelled: 2 });
    expect(calls).toContainEqual({ op: 'from', table: 'tms_fee_bill' });
    expect(calls.some((c) => c.op === 'update'
      && (c.payload as { status: string }).status === 'cancelled')).toBe(true);
    // A paid bill must never be cancelled -- that would erase a payment.
    expect(calls).toContainEqual({ op: 'is', col: 'paid_at', val: null });
  });

  it('throws when the update fails rather than reporting success', async () => {
    // A silently failed cancellation leaves a staffer billed for a month they
    // passed, and the verdict row would claim otherwise.
    const { svc } = fakeSvc({ data: null, error: { message: 'boom' } });
    await expect(cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    })).rejects.toThrow(/boom/);
  });

  it('reports zero when there was nothing to cancel', async () => {
    const { svc } = fakeSvc({ data: [], error: null });
    expect(await cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    })).toEqual({ cancelled: 0 });
  });
});

describe('makeStaffBillsPayable', () => {
  it('promotes staff_deferred bills to generated', async () => {
    const { svc, calls } = fakeSvc({ data: [{ id: 'a' }], error: null });
    const res = await makeStaffBillsPayable(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    });
    expect(res).toEqual({ generated: 1 });
    expect(calls.some((c) => c.op === 'update'
      && (c.payload as { status: string }).status === 'generated')).toBe(true);
    expect(calls).toContainEqual({ op: 'eq', col: 'status', val: 'staff_deferred' });
  });

  it('throws when the update fails', async () => {
    const { svc } = fakeSvc({ data: null, error: { message: 'nope' } });
    await expect(makeStaffBillsPayable(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    })).rejects.toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fees/cancel-staff-bill.test.ts`
Expected: FAIL — `Failed to resolve import "./cancel-staff-bill"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/cancel-staff-bill.ts`:

```ts
/**
 * The two things a month-end verdict can do to a staff transport bill.
 *
 * Bills are CANCELLED, never deleted -- the Vacate module set this precedent and
 * it matters here for the same reason: a cancelled bill is evidence that duty
 * was performed, and a deleted one is evidence of nothing.
 *
 * Both functions THROW on a query error rather than returning a count of zero.
 * A swallowed failure here is the worst outcome the feature can produce: the
 * verdict row would record "bill cancelled" while the staffer still owes money,
 * and nobody would find out until they were locked out of the portal.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cancel this staffer's outstanding current-year transport bills.
 *
 * `paid_at is null` is not optional. Cancelling a bill someone already paid
 * would erase the record of their payment and hand back a fee they settled.
 */
export async function cancelStaffBills(
  svc: SupabaseClient,
  opts: { personId: string; transportYearId: string },
): Promise<{ cancelled: number }> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .update({ status: 'cancelled' })
    .eq('person_id', opts.personId)
    .eq('person_type', 'staff')
    .eq('transport_year_id', opts.transportYearId)
    .neq('status', 'cancelled')
    .is('paid_at', null)
    .select('id');
  if (error) throw new Error(`cancelStaffBills failed: ${error.message}`);
  return { cancelled: (data ?? []).length };
}

/**
 * Promote held bills to payable ones.
 *
 * 'staff_deferred' means "raised, but not yet something the office will collect".
 * 'generated' is the payable state the rest of the fees module recognises, and
 * the state the admin mark-paid path expects to find.
 */
export async function makeStaffBillsPayable(
  svc: SupabaseClient,
  opts: { personId: string; transportYearId: string },
): Promise<{ generated: number }> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .update({ status: 'generated' })
    .eq('person_id', opts.personId)
    .eq('person_type', 'staff')
    .eq('transport_year_id', opts.transportYearId)
    .eq('status', 'staff_deferred')
    .is('paid_at', null)
    .select('id');
  if (error) throw new Error(`makeStaffBillsPayable failed: ${error.message}`);
  return { generated: (data ?? []).length };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/fees/cancel-staff-bill.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole suite to confirm nothing regressed**

Run: `npx vitest run`
Expected: PASS. Record the total count — later tasks compare against it.

- [ ] **Step 6: Commit**

```bash
git add lib/fees/cancel-staff-bill.ts lib/fees/cancel-staff-bill.test.ts
git commit -m "feat(fees): add staff bill cancel and promote helpers"
```

---

# Phase 3 — The month-end job

## Task 8: The month-end verdict cron

**Files:**
- Create: `app/api/cron/incharge-month-verdict/route.ts`
- Modify: `proxy.ts` (the `PUBLIC_PATHS` set, around line 30)

**Interfaces:**
- Consumes: `serviceDays`, `evaluateMonth`, `monthWindow` (Task 5); `cancelStaffBills`, `makeStaffBillsPayable` (Task 7); `resolveStaffId`; `generateStaffBill`, `resolveStaffBillPlan`; `loadSchedulingConfig`; `maybeRevokeBoardingRole`; `notifyProfile`.
- Produces: `GET /api/cron/incharge-month-verdict` with `?dryRun=1` and `?month=YYYY-MM`.

- [ ] **Step 1: Allowlist the path in proxy.ts**

In `proxy.ts`, inside the `PUBLIC_PATHS` set, add this line directly below the existing `'/api/cron/incharge-attendance',` entry:

```ts
  '/api/cron/incharge-month-verdict',
```

**Do not add an explanatory comment containing the cron path prefix.** `proxy.test.ts` matches raw source text and will fail on a quoted occurrence of that prefix anywhere in the file, comments included.

- [ ] **Step 2: Verify the proxy guard test still passes**

Run: `npx vitest run proxy.test.ts`
Expected: PASS. If it fails with a message about the cron prefix, a comment or string was added that the guard forbids — remove it.

- [ ] **Step 3: Write the route**

Create `app/api/cron/incharge-month-verdict/route.ts`:

```ts
/**
 * Month-end bus in-charge verdict.
 *
 * The counterpart to the daily loop, and the sole authority over money and
 * roles. For each active in-charge: was the route marked on EVERY service day of
 * the window? Pass cancels their transport bill; fail makes it payable, revokes
 * the assignment and locks them out until they pay or accept a new commitment.
 *
 * The daily job warns; this decides. Splitting it that way means nobody is
 * punished twice for the same missed days.
 *
 * Two gates stand in front of any action:
 *   - `inchargeEnforcementMode` (admin_settings). Ships as 'shadow', which
 *     records verdicts but cancels, bills, revokes and notifies nobody.
 *   - `dryRun=1`, which writes nothing at all.
 *
 * Blast radius, measured 2026-08-18: under the zero-miss rule NO route was
 * marked on every day it carried riders, so a live run bills all 102 in-charges
 * about Rs 13 lakh. That consequence was chosen deliberately and is recorded in
 * the design doc -- but it is why the first live run must be a human pressing a
 * button, never this job waking up on its own.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { istToday } from '@/lib/booking/window';
import { notifyProfile } from '@/lib/notifications/notify';
import { maybeRevokeBoardingRole } from '@/lib/boarding/roles';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { generateStaffBill } from '@/lib/fees/staff-bill';
import { cancelStaffBills, makeStaffBillsPayable } from '@/lib/fees/cancel-staff-bill';
import { serviceDays, evaluateMonth, monthWindow } from '@/lib/boarding/incharge-month';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const monthParam = request.nextUrl.searchParams.get('month');
  if (monthParam !== null && !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  const today = istToday();
  const anchor = monthParam ? `${monthParam}-01` : today;
  const window = monthWindow(anchor);

  const cfg = await loadSchedulingConfig(svc);
  const mode = cfg.inchargeEnforcementMode;
  const act = mode === 'enforce' && !dryRun;

  if (mode === 'off') {
    return NextResponse.json({ success: true, data: { month: window, mode, skipped: 'mode_off' } });
  }

  const summary = {
    month: monthParam ?? anchor.slice(0, 7),
    window,
    mode,
    dryRun,
    evaluated: 0,
    passed: 0,
    failed: 0,
    cancelled: 0,
    billed: 0,
    removed: 0,
    errors: 0,
    failures: [] as Array<{ staffEmail: string; message: string }>,
    plan: [] as Array<{
      staffEmail: string;
      outcome: string;
      requiredDays: number;
      markedDays: number;
      missedDates: string[];
      billAction: string;
    }>,
  };

  const { data: assignments, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('id, staff_email, route_id')
    .eq('is_active', true);
  if (aErr) {
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }

  const { data: currentYear } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  // Booking and attendance dates are per-route, and many in-charges share a
  // route -- nine on one of them. Fetching per assignment would repeat the same
  // two queries nine times, so they are cached by route for the whole run.
  const bookedByRoute = new Map<string, string[]>();
  const markedByRoute = new Map<string, string[]>();

  async function routeDates(routeId: string) {
    if (!bookedByRoute.has(routeId)) {
      const { data, error } = await svc
        .from('tms_booking')
        .select('travel_date')
        .eq('route_id', routeId)
        .gte('travel_date', window.start)
        .lte('travel_date', window.end);
      // NEVER let a failed query read as "the bus never ran" -- that empties the
      // denominator and passes everyone, cancelling bills that should stand.
      if (error) throw new Error(`booking load failed: ${error.message}`);
      bookedByRoute.set(routeId, (data ?? []).map((r) => (r as { travel_date: string }).travel_date));

      const { data: att, error: attErr } = await svc
        .from('tms_attendance')
        .select('trip_date')
        .eq('route_id', routeId)
        .gte('trip_date', window.start)
        .lte('trip_date', window.end);
      // And never let THIS one read as "nobody marked" -- that fails everyone
      // and bills them for an infrastructure failure.
      if (attErr) throw new Error(`attendance load failed: ${attErr.message}`);
      markedByRoute.set(routeId, (att ?? []).map((r) => (r as { trip_date: string }).trip_date));
    }
    return {
      booked: bookedByRoute.get(routeId) ?? [],
      marked: markedByRoute.get(routeId) ?? [],
    };
  }

  for (const a of assignments ?? []) {
    try {
      summary.evaluated++;
      if (!a.route_id) {
        summary.skippedNoRoute = (summary.skippedNoRoute ?? 0) + 1;
        continue;
      }

      // An ACTIVE probation narrows the window: the staffer committed from the
      // day they accepted, not from the 1st, and holding them to days that
      // preceded their promise would make the promise unwinnable.
      const { data: probation } = await svc
        .from('tms_incharge_probation')
        .select('id, window_start, window_end')
        .ilike('staff_email', emailIlikePattern(a.staff_email))
        .eq('status', 'active')
        .maybeSingle();
      const prob = probation as { id: string; window_start: string; window_end: string } | null;
      const from = prob?.window_start ?? window.start;
      const to = prob?.window_end ?? window.end;

      const { booked, marked } = await routeDates(a.route_id as string);
      const days = serviceDays(booked, from, to);
      const verdict = evaluateMonth({ serviceDays: days, markedDates: marked });

      const { data: profile } = await svc
        .from('profiles')
        .select('id')
        .ilike('email', emailIlikePattern(a.staff_email))
        .maybeSingle();
      const profileId = (profile as { id: string } | null)?.id ?? null;
      const staffId = await resolveStaffId(svc, { email: a.staff_email, profileId });

      let billAction: 'cancelled' | 'generated' | 'none' = 'none';

      if (verdict.outcome === 'passed') {
        summary.passed++;
        if (act && staffId && currentYear?.id) {
          const res = await cancelStaffBills(svc, {
            personId: staffId,
            transportYearId: currentYear.id as string,
          });
          if (res.cancelled > 0) {
            billAction = 'cancelled';
            summary.cancelled += res.cancelled;
          }
        } else if (staffId) {
          billAction = 'cancelled';
        }
      } else {
        summary.failed++;
        if (act && staffId && currentYear?.id) {
          // Held bills become payable; a staffer with no bill row yet has one
          // raised now. Both paths end in a payable bill, which is what the
          // lockout screen and the admin mark-paid action both expect.
          const promoted = await makeStaffBillsPayable(svc, {
            personId: staffId,
            transportYearId: currentYear.id as string,
          });
          if (promoted.generated === 0) {
            await generateStaffBill(svc, {
              staffId,
              transportYearId: currentYear.id as string,
            });
          }
          billAction = 'generated';
          summary.billed++;

          await svc.from('tms_staff_route_assignment')
            .update({ is_active: false }).eq('id', a.id);
          await maybeRevokeBoardingRole(svc, a.id);
          summary.removed++;
        } else {
          billAction = 'generated';
        }
      }

      if (prob && act) {
        await svc.from('tms_incharge_probation')
          .update({ status: verdict.outcome === 'passed' ? 'passed' : 'failed' })
          .eq('id', prob.id);
      }

      summary.plan.push({
        staffEmail: a.staff_email,
        outcome: verdict.outcome,
        requiredDays: verdict.requiredDays,
        markedDays: verdict.markedDays,
        missedDates: verdict.missedDates,
        billAction,
      });

      // Shadow mode still RECORDS the verdict -- that is the entire point of
      // shadow, it builds the admin board from real decisions. Only dryRun
      // writes nothing.
      if (!dryRun) {
        await svc.from('tms_incharge_month_verdict').upsert(
          {
            staff_email: a.staff_email,
            person_id: staffId,
            route_id: a.route_id,
            month: `${anchor.slice(0, 7)}-01`,
            window_start: from,
            window_end: to,
            required_days: verdict.requiredDays,
            marked_days: verdict.markedDays,
            missed_dates: verdict.missedDates,
            outcome: verdict.outcome,
            bill_action: billAction,
            was_probation: Boolean(prob),
            mode,
            decided_at: new Date().toISOString(),
          },
          { onConflict: 'staff_email,month' },
        );
      }

      if (act && profileId) {
        await notifyProfile(svc, {
          profileId,
          actorId: profileId,
          title: verdict.outcome === 'passed'
            ? 'Transport fee cancelled'
            : 'Transport fee is now payable',
          body: verdict.outcome === 'passed'
            ? `Your bus was marked on every service day this month, so your transport fee bill has been cancelled. Thank you for keeping the attendance up to date.`
            : `Attendance was not marked on ${verdict.missedDates.join(', ')}. Your bus in-charge role has been removed and your transport fee is now payable. Once you pay the fees you can continue the transport service.`,
          url: '/boarding/in-charge',
        });
      }
    } catch (e) {
      // One staffer's failure must never abort the run for the others.
      summary.errors++;
      summary.failures.push({
        staffEmail: a.staff_email,
        message: e instanceof Error ? e.message : String(e),
      });
      console.error('[incharge-month-verdict] failed for', a.staff_email, e);
    }
  }

  return NextResponse.json({ success: true, data: summary });
}
```

- [ ] **Step 4: Fix the summary type**

`summary.skippedNoRoute` is assigned but not declared. Add it to the summary object literal beside `evaluated`:

```ts
    skippedNoRoute: 0,
```

and change the increment to:

```ts
        summary.skippedNoRoute++;
```

- [ ] **Step 5: Typecheck the route**

Run: `npx tsc --noEmit --skipLibCheck app/api/cron/incharge-month-verdict/route.ts`
Expected: no errors naming `incharge-month-verdict/route.ts`.

- [ ] **Step 6: Verify the build compiles the new route**

Run: `npx next build`
Expected: build succeeds and the route list includes `/api/cron/incharge-month-verdict`. This is the real gate — `next build` has `ignoreBuildErrors: true` for types but still fails on genuine syntax and import errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/incharge-month-verdict/route.ts proxy.ts
git commit -m "feat(incharge): add the month-end verdict cron"
```

---

## Task 9: Schedule the month-end job

**Files:**
- Create: `supabase/migrations/20260818120000_tms_incharge_month_verdict_cron.sql`

**Interfaces:**
- Consumes: the route from Task 8.
- Produces: pg_cron job `tms-incharge-month-verdict`.

- [ ] **Step 1: Write the migration**

```sql
-- Schedule the bus in-charge month-end verdict.
--
-- Vercel crons have never fired on this project, so scheduling goes through
-- pg_cron + pg_net exactly like tms-auto-generate-bills and
-- tms-incharge-attendance. Both vault secrets already exist.
--
-- '0 16 28-31 * *' UTC = 21:30 IST on the 28th-31st. The job itself only acts
-- on the day it is run for, and its upsert on (staff_email, month) makes a
-- repeat run on the 29th, 30th and 31st idempotent -- which is exactly why the
-- schedule can be this crude rather than computing the true month end in cron
-- syntax, which cron cannot express.
--
-- The job records verdicts but cancels, bills, revokes and notifies NOBODY
-- until inchargeEnforcementMode is switched from 'shadow' to 'enforce' on
-- Settings -> Scheduling.

do $$
begin
  perform cron.unschedule('tms-incharge-month-verdict');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-incharge-month-verdict',
  '0 16 28-31 * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/incharge-month-verdict',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 180000
  );
  $$
);

-- ── Verification (run separately after applying) ─────────────────────────────
--   select jobname, schedule, active from cron.job
--    where jobname = 'tms-incharge-month-verdict';
```

- [ ] **Step 2: Apply and verify**

Apply via `apply_migration` with name `tms_incharge_month_verdict_cron`, then:

```sql
select jobname, schedule, active from cron.job where jobname = 'tms-incharge-month-verdict';
```

Expected: one row, `active = true`, schedule `0 16 28-31 * *`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260818120000_tms_incharge_month_verdict_cron.sql
git commit -m "feat(incharge): schedule the month-end verdict via pg_cron"
```

---

# Phase 4 — The surfaces

## Task 10: Publish the gate state from the access route

**Files:**
- Modify: `app/api/boarding/access/route.ts`

**Interfaces:**
- Consumes: `deriveInChargeGate` (Task 6), `loadStaffBillState` (Task 2), `serviceDays`/`monthWindow` (Task 5).
- Produces: `GET /api/boarding/access` response gains `gate`, `outstandingAmount`, `probationThisMonth`.

- [ ] **Step 1: Add the imports**

At the top of `app/api/boarding/access/route.ts`, beside the existing imports:

```ts
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { loadStaffBillState } from '@/lib/fees/staff-bill-state';
import { deriveInChargeGate } from '@/lib/boarding/incharge-gate';
import { serviceDays, monthWindow } from '@/lib/boarding/incharge-month';
import { istToday } from '@/lib/booking/window';
import { emailIlikePattern } from '@/lib/identity/email-match';
```

- [ ] **Step 2: Compute the fee dimension before the response**

In `getAccess`, replace the final `return NextResponse.json({ ... })` for the non-super-admin path with:

```ts
    // ── Fee dimension ──────────────────────────────────────────────────────────
    // Computed with the service-role client because a blocked staffer has no
    // read access to their own bills through RLS -- the whole point is that they
    // are locked out. Failures here fall through to the outer catch, which fails
    // closed.
    const svc = createServiceRoleClient();
    const allowed = routeIds.length > 0;

    let hasOutstandingBill = false;
    let outstandingAmount = 0;
    let probationThisMonth: 'none' | 'active' | 'failed' = 'none';
    let remainingServiceDays = 0;

    const { data: prof } = await svc
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = ((prof as { email: string | null } | null)?.email ?? '').toLowerCase().trim();

    const { data: currentYear } = await svc
      .from('tms_transport_year').select('id').eq('is_current', true).maybeSingle();

    const staffId = await resolveStaffId(svc, { email, profileId: auth.userId });
    if (staffId && currentYear?.id) {
      const billState = await loadStaffBillState(svc, {
        personId: staffId, transportYearId: currentYear.id as string,
      });
      hasOutstandingBill = billState.hasOutstanding;
      outstandingAmount = billState.outstandingAmount;
    }

    if (hasOutstandingBill && email) {
      const today = istToday();
      const win = monthWindow(today);

      const { data: probRows } = await svc
        .from('tms_incharge_probation')
        .select('status')
        .ilike('staff_email', emailIlikePattern(email))
        .gte('window_end', win.start);
      const statuses = ((probRows ?? []) as Array<{ status: string }>).map((r) => r.status);
      if (statuses.includes('active')) probationThisMonth = 'active';
      else if (statuses.includes('failed')) probationThisMonth = 'failed';

      // Days left to mark on THEIR route. If the pledge cannot be honoured
      // there is no point offering it, so this decides pledge vs must_pay.
      if (elig.routeId) {
        const { data: booked } = await svc
          .from('tms_booking')
          .select('travel_date')
          .eq('route_id', elig.routeId)
          .gte('travel_date', today)
          .lte('travel_date', win.end);
        remainingServiceDays = serviceDays(
          ((booked ?? []) as Array<{ travel_date: string }>).map((b) => b.travel_date),
          today, win.end,
        ).length;
      }
    }

    const gate = deriveInChargeGate({
      allowed,
      eligible: elig.eligible,
      assignedRouteCount: elig.assignedRouteCount,
      hasRoute: elig.hasRoute,
      hasOutstandingBill,
      probationThisMonth,
      remainingServiceDays,
    });

    return NextResponse.json({
      success: true,
      data: {
        allowed,
        assignedRouteCount: elig.assignedRouteCount,
        eligible: elig.eligible,
        hasRoute: elig.hasRoute,
        gate,
        outstandingAmount,
        probationThisMonth,
      },
    });
```

- [ ] **Step 3: Extend the fail-closed catch**

In the `catch`, add the new fields so the client always receives a complete shape:

```ts
    return NextResponse.json({ success: true, data: {
      allowed: false, assignedRouteCount: 0, eligible: false, hasRoute: false,
      gate: 'denied', outstandingAmount: 0, probationThisMonth: 'none',
    } });
```

- [ ] **Step 4: Extend the super-admin early return the same way**

```ts
      return NextResponse.json({ success: true, data: {
        allowed: true, assignedRouteCount: 0, eligible: false, hasRoute: false,
        superAdmin: true, gate: 'in_duty', outstandingAmount: 0,
        probationThisMonth: 'none',
      } });
```

- [ ] **Step 5: Build**

Run: `npx next build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add app/api/boarding/access/route.ts
git commit -m "feat(boarding): publish the in-charge fee gate from the access route"
```

---

## Task 11: The pledge route

**Files:**
- Create: `app/api/boarding/incharge-pledge/route.ts`

**Interfaces:**
- Consumes: `probationWindow` (Task 5), `getStaffBoardingEligibility`, `grantBoardingRole`, `logActivity`.
- Produces: `POST /api/boarding/incharge-pledge`.

- [ ] **Step 1: Write the route**

Create `app/api/boarding/incharge-pledge/route.ts`:

```ts
/**
 * A billed staffer accepts the attendance commitment.
 *
 * "Mark attendance every service day from today to the end of this month and
 * your transport fee bill will be cancelled."
 *
 * ORDER IS LOAD-BEARING: probation row FIRST, then the assignment, then the
 * role. The self-assign fee guard passes anyone with an ACTIVE probation, so
 * the probation must exist before the assignment is attempted. And the
 * assignment must exist before the role, because being assigned is what
 * reopens the portal -- without it the staffer would be promised a screen they
 * cannot reach, and a commitment they cannot honour.
 *
 * The route is never accepted from the client; it is resolved server-side from
 * the staff master, so a staffer can only ever commit to the bus they ride.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { grantBoardingRole } from '@/lib/boarding/roles';
import { logActivity } from '@/lib/activity/log';
import { probationWindow } from '@/lib/boarding/incharge-month';
import { istToday } from '@/lib/booking/window';

async function postPledge(request: NextRequest, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();

    const { data: prof } = await svc
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = ((prof as { email: string | null } | null)?.email ?? '').toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: 'Your profile has no email on file' }, { status: 400 });
    }

    const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
    if (!elig.eligible) {
      return NextResponse.json({ error: 'You are not eligible to be a bus in-charge' }, { status: 403 });
    }
    if (!elig.routeId) {
      return NextResponse.json(
        { error: 'Your route has not been allocated yet. Please contact an admin.' },
        { status: 400 },
      );
    }

    const window = probationWindow(istToday());

    const { data: probation, error: pErr } = await svc
      .from('tms_incharge_probation')
      .insert({
        staff_email: email,
        route_id: elig.routeId,
        window_start: window.start,
        window_end: window.end,
        status: 'active',
      })
      .select('id')
      .single();
    if (pErr) {
      // 23505 = the partial unique index on an active probation. A second
      // submit is not an error worth surfacing -- they already accepted.
      if (pErr.code === '23505') {
        return NextResponse.json(
          { error: 'You have already accepted this commitment.' },
          { status: 409 },
        );
      }
      console.error('pledge insert error:', pErr);
      return NextResponse.json({ error: 'Failed to record your commitment' }, { status: 500 });
    }

    const probationId = (probation as { id: string }).id;

    const { data: assignment, error: aErr } = await svc
      .from('tms_staff_route_assignment')
      .insert({
        staff_email: email,
        route_id: elig.routeId,
        assigned_by: auth.userId,
        source: 'self',
        is_active: true,
      })
      .select('id')
      .single();
    if (aErr && aErr.code !== '23505') {
      // Roll the probation back. A probation without an assignment is the one
      // state the design must never produce: the staffer would owe a daily
      // duty while locked out of the only screen that performs it.
      await svc.from('tms_incharge_probation').delete().eq('id', probationId);
      console.error('pledge assignment error:', aErr);
      return NextResponse.json({ error: 'Failed to reassign you as bus in-charge' }, { status: 500 });
    }

    const assignmentId = (assignment as { id: string } | null)?.id ?? null;
    if (assignmentId) {
      await svc.from('tms_incharge_probation')
        .update({ assignment_id: assignmentId }).eq('id', probationId);
    }

    await grantBoardingRole(svc, email, auth.userId);

    await logActivity(auth, request, {
      module: 'staff-route-assignments',
      action: 'assign',
      entityType: 'tms_staff_route_assignment',
      entityId: assignmentId ?? undefined,
      entityLabel: email,
      description: `${email} accepted the attendance commitment for route ${elig.routeId}`,
      metadata: {
        staffEmail: email,
        routeId: elig.routeId,
        source: 'self',
        probation: { id: probationId, ...window },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Commitment accepted. You are the bus in-charge again.',
        window,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('pledge error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => postPledge(request, auth));
```

- [ ] **Step 2: Verify the activity log unions accept this call**

Run: `npx tsc --noEmit --skipLibCheck app/api/boarding/incharge-pledge/route.ts 2>&1 | grep -i "activity\|module\|action"`
Expected: no output. If the union rejects `'staff-route-assignments'` or `'assign'`, they are already used by `self-assign/route.ts`, so the error is elsewhere — read it before changing `lib/activity/log.ts`.

- [ ] **Step 3: Build**

Run: `npx next build`
Expected: success, route list includes `/api/boarding/incharge-pledge`.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/incharge-pledge/route.ts
git commit -m "feat(boarding): add the in-charge attendance pledge route"
```

---

## Task 12: The pledge and must-pay screens

**Files:**
- Modify: `app/boarding/in-charge/page.tsx`
- Modify: `app/boarding/layout.tsx`

**Interfaces:**
- Consumes: `gate`, `outstandingAmount` from `/api/boarding/access` (Task 10); `POST /api/boarding/incharge-pledge` (Task 11).

- [ ] **Step 1: Widen the layout's access state**

In `app/boarding/layout.tsx`, change the state declaration at line 121 from:

```ts
  const [access, setAccess] = useState<'checking' | 'allowed' | 'choose' | 'denied'>('checking');
```

to:

```ts
  const [access, setAccess] = useState<
    'checking' | 'allowed' | 'choose' | 'pledge' | 'must_pay' | 'denied'
  >('checking');
```

- [ ] **Step 2: Read the server's gate instead of re-deriving it**

Replace the `setAccess(deriveBoardingAccess({ ... }))` call around line 152 with:

```ts
        // The server now owns this decision -- it is the only side that can see
        // the staffer's bills. deriveBoardingAccess remains for the fee-free
        // dimensions and is still unit-tested, but the gate wins.
        const gate = json?.data?.gate as
          | 'in_duty' | 'choose' | 'pledge' | 'must_pay' | 'denied' | undefined;
        setAccess(gate === 'in_duty' ? 'allowed' : (gate ?? 'denied'));
        setOutstandingAmount(Number(json?.data?.outstandingAmount ?? 0));
```

Add beside the other state declarations:

```ts
  const [outstandingAmount, setOutstandingAmount] = useState(0);
```

- [ ] **Step 3: Route the new states to the in-charge page**

Change the redirect effect at line 168 so all three fee states land on the same page:

```ts
    if ((access === 'choose' || access === 'pledge' || access === 'must_pay')
        && pathname !== '/boarding/in-charge') {
```

And the reverse redirect at line 180 stays as-is (`access === 'allowed'`).

Then change the render branch at line 198 from `if (access === 'choose')` to:

```ts
  if (access === 'choose' || access === 'pledge' || access === 'must_pay') {
```

and pass the gate down to the page through a context or a query-free prop. The simplest change consistent with this codebase: the page re-fetches `/api/boarding/access` itself. Add to the branch body, unchanged except that the page now decides which screen to show.

- [ ] **Step 4: Add the pledge screen to the in-charge page**

In `app/boarding/in-charge/page.tsx`, add at the top of the component:

```ts
  const [gate, setGate] = useState<'choose' | 'pledge' | 'must_pay' | null>(null);
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/boarding/access', {
        cache: 'no-store', credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      const g = json?.data?.gate;
      setGate(g === 'pledge' || g === 'must_pay' ? g : 'choose');
      setAmount(Number(json?.data?.outstandingAmount ?? 0));
    })();
    return () => { cancelled = true; };
  }, []);
```

with `useEffect` added to the React import.

Then add the pledge handler beside `handleConfirm`:

```ts
  const handleAcceptPledge = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/boarding/incharge-pledge', {
        method: 'POST', credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to accept the commitment');
      toast.success('Commitment accepted — you are the bus in-charge again');
      // Hard nav: the layout caches its gate decision in state, so a soft
      // router.replace() would bounce off the stale 'pledge' redirect.
      window.location.assign('/boarding/attendance');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to accept the commitment');
      setSaving(false);
    }
  };
```

And render the two new screens before the existing `declined` branch:

```tsx
  if (gate === 'must_pay' || (gate === 'pledge' && declined)) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
            <Bus className="h-6 w-6 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
            Transport fees are due
          </h1>
          {amount > 0 && (
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              ₹{amount.toLocaleString('en-IN')}
            </p>
          )}
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            Once you pay the fees you can continue the transport service.
            Please contact the transport office.
          </p>
          <button
            onClick={() => signOut()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto sm:px-5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (gate === 'pledge') {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-7">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 sm:h-14 sm:w-14">
              <Bus className="h-6 w-6 text-white sm:h-7 sm:w-7" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
              Transport fee bill
            </h1>
            {amount > 0 && (
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                ₹{amount.toLocaleString('en-IN')}
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-green-300 bg-green-50 p-4 dark:border-green-500/40 dark:bg-green-500/10">
            <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-100">
              If you mark attendance for your bus <strong>every service day</strong> from
              today until the end of this month, this bill will be{' '}
              <strong>cancelled</strong> and you continue as bus in-charge.
            </p>
          </div>

          <button
            onClick={handleAcceptPledge}
            disabled={saving}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Accepting…' : 'OK, I accept'}
          </button>
          <button
            onClick={() => setDeclined(true)}
            disabled={saving}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Not OK
          </button>
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: Build**

Run: `npx next build`
Expected: success.

- [ ] **Step 6: Manual verification (needs the USER's browser)**

The agent's Chrome is unauthenticated, so this step must be handed to the user. Ask them to sign in as one of the 26 (e.g. the holder of `drrajkumar@jkkn.ac.in`) and confirm:
- they land on `/boarding/in-charge`
- the pledge screen shows with the bill amount
- **Not OK** shows the "Once you pay the fees" screen
- **OK, I accept** reassigns them and lands on `/boarding/attendance`

- [ ] **Step 7: Commit**

```bash
git add app/boarding/in-charge/page.tsx app/boarding/layout.tsx
git commit -m "feat(boarding): add the pledge and fees-due screens"
```

---

## Task 13: Admin mark-paid and the Monthly tab

**Files:**
- Create: `app/api/admin/staff-bills/by-person/[email]/mark-paid/route.ts`
- Create: `app/api/admin/incharge-month-verdict/route.ts`
- Create: `app/(admin)/staff-route-assignments/enforcement/monthly/columns.tsx`
- Create: `app/(admin)/staff-route-assignments/enforcement/monthly/page.tsx`

**Interfaces:**
- Consumes: `loadStaffBillState` (Task 2), `resolveStaffId`.
- Produces: `POST /api/admin/staff-bills/by-person/[email]/mark-paid`, `GET /api/admin/incharge-month-verdict`.

> **Why by-person and not by bill id:** a stop-wise fee structure raises several
> instalments, so marking one bill paid would leave the staffer's fee gate shut
> after they had paid in full. The board also knows the person, not the bill ids.
> A by-id variant is deliberately NOT built — nothing would call it.

- [ ] **Step 1: Write the mark-paid route**

Create `app/api/admin/staff-bills/by-person/[email]/mark-paid/route.ts`:
```ts
/**
 * Record payment of ALL of one staffer's outstanding transport bills.
 *
 * The monthly board knows the person, not the bill ids -- and a stop-wise
 * structure can raise several instalments, so "mark paid" has to mean the whole
 * outstanding set or the fee gate would stay shut after a full payment.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { loadStaffBillState } from '@/lib/fees/staff-bill-state';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handler(request: NextRequest, auth: AuthContext, rawEmail: string) {
  if (!(await requirePerm(auth, 'tms.drivers.assign'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const email = decodeURIComponent(rawEmail).toLowerCase().trim();
  const svc = createServiceRoleClient();

  const { data: prof } = await svc
    .from('profiles').select('id').ilike('email', email).maybeSingle();
  const staffId = await resolveStaffId(svc, {
    email,
    profileId: (prof as { id: string } | null)?.id ?? null,
  });
  if (!staffId) {
    return NextResponse.json({ error: 'Could not resolve this staff member' }, { status: 404 });
  }

  const { data: year } = await svc
    .from('tms_transport_year').select('id').eq('is_current', true).maybeSingle();
  if (!year?.id) {
    return NextResponse.json({ error: 'No current transport year' }, { status: 409 });
  }

  const state = await loadStaffBillState(svc, {
    personId: staffId, transportYearId: year.id as string,
  });
  if (!state.hasOutstanding) {
    return NextResponse.json({ error: 'Nothing outstanding for this staff member' }, { status: 409 });
  }

  const { error } = await svc
    .from('tms_fee_bill')
    .update({
      paid_at: new Date().toISOString(),
      marked_paid_by: auth.userId,
    })
    .in('id', state.billIds)
    .is('paid_at', null);
  if (error) {
    return NextResponse.json({ error: 'Failed to record the payment' }, { status: 500 });
  }

  await logActivity(auth, request, {
    module: 'staff-route-assignments',
    action: 'update',
    entityType: 'tms_fee_bill',
    entityLabel: email,
    description: `Recorded payment of ₹${state.outstandingAmount} across ${state.billIds.length} transport bill(s)`,
    metadata: { email, staffId, billIds: state.billIds, amount: state.outstandingAmount },
  });

  return NextResponse.json({
    success: true,
    message: `Recorded payment of ₹${state.outstandingAmount}`,
  });
}

export const POST = withAuth(
  async (request, auth, ctx: { params: Promise<{ email: string }> }) => {
    const { email } = await ctx.params;
    return handler(request, auth, email);
  },
);
```

- [ ] **Step 2: Verify withAuth's params signature**

Run: `grep -rn "await ctx.params\|{ params }" app/api/admin --include=route.ts | head -5`

Match the exact shape the codebase already uses for dynamic-segment routes — if existing routes take `{ params }` synchronously rather than as a `Promise`, change the export above to match. Next.js 15 uses a Promise, but follow what already compiles here.

- [ ] **Step 3: Build**

Run: `npx next build`
Expected: success; route list includes `/api/admin/staff-bills/by-person/[email]/mark-paid`.

- [ ] **Step 4: Add the admin read route for recorded verdicts**

The board must never be able to CAUSE a verdict as a side effect of being
looked at, so it does not proxy the cron route (which holds the `CRON_SECRET`
and mutates). It reads what the job already recorded.

Create `app/api/admin/incharge-month-verdict/route.ts`:

```ts
/**
 * Admin-facing read of the recorded month verdicts.
 *
 * Deliberately NOT a proxy to the cron route: that one holds the CRON_SECRET
 * and can mutate. This reads what the job already recorded, so the board can
 * never cause a verdict as a side effect of being looked at.
 */
import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

export const GET = withAuth(async (request, auth) => {
  if (!(await requirePerm(auth, 'tms.drivers.assign'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const month = new URL(request.url).searchParams.get('month');
  const svc = createServiceRoleClient();
  let q = svc
    .from('tms_incharge_month_verdict')
    .select('*')
    .order('decided_at', { ascending: false });
  if (month && /^\d{4}-\d{2}$/.test(month)) q = q.eq('month', `${month}-01`);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: 'Failed to load verdicts' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
});
```

- [ ] **Step 5: Write the verdict columns**

The existing board is a single-table page, so the Monthly view ships as a
sibling route rather than as a restructure of it. Create
`app/(admin)/staff-route-assignments/enforcement/monthly/columns.tsx`, following
the factory pattern of the sibling `columns.tsx`:

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

/** One row of /api/admin/incharge-month-verdict. */
export interface VerdictRow {
  id: string;
  staff_email: string;
  route_id: string | null;
  month: string;
  window_start: string;
  window_end: string;
  required_days: number;
  marked_days: number;
  missed_dates: string[];
  outcome: 'passed' | 'failed';
  bill_action: 'cancelled' | 'generated' | 'none' | null;
  was_probation: boolean;
  mode: 'shadow' | 'enforce';
  decided_at: string;
}

export const OUTCOME_LABEL: Record<'passed' | 'failed', string> = {
  passed: 'Passed',
  failed: 'Failed',
};

const OUTCOME_CLASS: Record<'passed' | 'failed', string> = {
  passed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const BILL_LABEL: Record<string, string> = {
  cancelled: 'Bill cancelled',
  generated: 'Bill payable',
  none: 'No bill',
};

export function getVerdictColumns(
  onMarkPaid: (row: VerdictRow) => void,
): ColumnDef<VerdictRow>[] {
  return [
    {
      accessorKey: 'staff_email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.staff_email}</div>
          {row.original.was_probation && (
            <div className="truncate text-xs text-muted-foreground">
              On commitment from {row.original.window_start}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'outcome',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Outcome" />,
      cell: ({ row }) => (
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            OUTCOME_CLASS[row.original.outcome]
          }`}
        >
          {OUTCOME_LABEL[row.original.outcome]}
        </span>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: 'coverage',
      header: 'Marked / required',
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.marked_days} / {row.original.required_days}
        </span>
      ),
    },
    {
      accessorKey: 'missed_dates',
      header: 'Missed dates',
      cell: ({ row }) => (
        <span className="text-xs">{row.original.missed_dates.join(', ') || '—'}</span>
      ),
    },
    {
      accessorKey: 'bill_action',
      header: 'Bill',
      cell: ({ row }) => {
        const b = row.original.bill_action;
        return <span className="text-xs">{b ? BILL_LABEL[b] ?? b : '—'}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.bill_action === 'generated' ? (
          <button
            onClick={() => onMarkPaid(row.original)}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Mark bill paid
          </button>
        ) : null,
    },
  ];
}
```

- [ ] **Step 6: Write the Monthly page**

Create `app/(admin)/staff-route-assignments/enforcement/monthly/page.tsx`:

```tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getVerdictColumns, OUTCOME_LABEL, type VerdictRow } from './columns';

async function fetchVerdicts(month: string): Promise<VerdictRow[]> {
  const res = await fetch(`/api/admin/incharge-month-verdict?month=${month}`, {
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load verdicts');
  return json.data as VerdictRow[];
}

export default function MonthlyVerdictPage() {
  // Default to the current month in IST. The board is read-only, so an
  // approximate month boundary here costs nothing.
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['incharge-month-verdict', month],
    queryFn: () => fetchVerdicts(month),
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load monthly verdicts');
  }, [isError]);

  const rows = useMemo(() => data ?? [], [data]);

  const markPaid = async (row: VerdictRow) => {
    // The verdict row names the person, not the bill, so the bill ids are
    // fetched at click time rather than carried in every row of the table.
    const res = await fetch(`/api/admin/staff-bills/by-person/${row.staff_email}/mark-paid`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Failed to record the payment');
      return;
    }
    toast.success('Payment recorded');
    // Invalidate the DERIVED key too, or the row keeps its stale bill state.
    qc.invalidateQueries({ queryKey: ['incharge-month-verdict', month] });
    qc.invalidateQueries({ queryKey: ['incharge-strikes'] });
  };

  const columns = useMemo(() => getVerdictColumns(markPaid), [month]);

  const passed = rows.filter((r) => r.outcome === 'passed').length;
  const failed = rows.filter((r) => r.outcome === 'failed').length;

  const filters = useMemo(
    () => [
      {
        columnId: 'outcome',
        title: 'Outcome',
        options: (['passed', 'failed'] as const).map((s) => ({
          label: OUTCOME_LABEL[s],
          value: s,
        })),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">Monthly attendance verdict</h1>
        <p className="text-sm text-muted-foreground">
          At month end, a route marked on every service day cancels its in-charges&rsquo;
          transport fee bills. A single missed service day makes the bill payable and
          removes the role.{' '}
          <Link href="/staff-route-assignments/enforcement" className="underline">
            Daily strikes
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="month" className="text-sm font-medium">Month</label>
        <input
          id="month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UniversalStatCard title="Passed — bill cancelled" value={passed} icon={CheckCircle2} color="green" />
        <UniversalStatCard title="Failed — bill payable" value={failed} icon={XCircle} color="red" />
      </div>

      <div className="min-w-0 overflow-x-auto">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          globalSearch
          searchPlaceholder="Search staff…"
          filters={filters}
          entityName="verdicts"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Build and commit**

Run: `npx next build`
Expected: success; route list includes `/staff-route-assignments/enforcement/monthly`, `/api/admin/incharge-month-verdict` and both mark-paid routes.

```bash
git add app/api/admin/staff-bills app/api/admin/incharge-month-verdict "app/(admin)/staff-route-assignments/enforcement/monthly"
git commit -m "feat(incharge): add the monthly verdict board and mark-paid action"
```

---

## Task 14: Demote the daily job to warnings only

**Files:**
- Modify: `app/api/cron/incharge-attendance/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no removal or billing from the daily path.

- [ ] **Step 1: Remove the punitive branch**

In `app/api/cron/incharge-attendance/route.ts`, replace the whole `if (outcome.action === 'remove') { ... }` block with:

```ts
      if (outcome.action === 'remove') {
        // The daily loop no longer removes or bills. The month-end verdict is
        // the sole authority over money and roles, so a staffer cannot be
        // punished twice for the same missed days. The strike still advances
        // and still escalates the warning copy, which is what actually changes
        // behaviour during the month.
        summary.atThreshold = (summary.atThreshold ?? 0) + 1;
      }
```

Add `atThreshold: 0,` to the summary literal and drop `removed`, `blocked` and `billed` from it, along with the now-unused imports: `performRemoval`, `generateStaffBill`, `resolveStaffBillPlan`, `StaffUnbillableReason`, `maybeRevokeBoardingRole`, `resolveStaffId`, `logActivityFromHeaders`, and the `UNBILLABLE_LABEL` constant.

- [ ] **Step 2: Send a threshold warning instead of a removal notice**

Replace the `else if (outcome.action === 'remove' && notify && ...)` notification block with:

```ts
      } else if (outcome.action === 'remove' && notify && reachable && profileId && actorId) {
        await notifyProfile(svc, {
          profileId,
          actorId,
          title: 'Attendance still not marked',
          body:
            `Your bus was not marked on ${outcome.state.missedDates.join(', ')}. ` +
            `At the end of this month, any service day left unmarked will make your ` +
            `transport fee payable and remove your bus in-charge role.`,
          url: '/boarding/attendance',
        });
      }
```

- [ ] **Step 3: Simplify the strike upsert**

`removed_at` and `billing_status` are no longer written by this route. Replace those two fields in the upsert with:

```ts
            removed_at: strike?.removed_at ?? null,
            billing_status: strike?.billing_status ?? null,
```

so historical rows keep their values and the daily job stops producing new ones.

- [ ] **Step 4: Run the existing daily-loop tests**

Run: `npx vitest run lib/boarding/incharge-attendance.test.ts lib/boarding/incharge-removal-copy.test.ts`
Expected: PASS. The pure module is untouched — `performRemoval` and `removalCopy` remain exported and tested even though the daily route no longer calls them; the month-end verdict is their future caller.

- [ ] **Step 5: Build**

Run: `npx next build`
Expected: success, with no unused-import errors in the daily route.

- [ ] **Step 6: Full suite**

Run: `npx vitest run`
Expected: PASS, count ≥ the Task 7 Step 5 baseline plus the tests added since.

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/incharge-attendance/route.ts
git commit -m "refactor(incharge): daily job warns only, month-end verdict decides"
```

---

## Task 15: End-to-end dry run against production data

**Files:** none — verification only.

- [ ] **Step 1: Confirm the mode is still shadow**

```sql
select value from admin_settings where key = 'scheduling';
```

Expected: either no `inchargeEnforcementMode` key (the default `shadow` applies) or the value `shadow`. **If it reads `enforce`, STOP** and tell the user before running anything.

- [ ] **Step 2: Dry-run the month verdict against the deployed app**

Ask the user to run, or run with the deployed URL and secret:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "$TMS_APP_URL/api/cron/incharge-month-verdict?dryRun=1&month=2026-08" | head -c 4000
```

Expected: `success: true`, `dryRun: true`, `evaluated` ≈ the current active assignment count, and a `plan` array with per-person `requiredDays` / `markedDays` / `missedDates`.

- [ ] **Step 3: Confirm nothing was written**

```sql
select count(*) as verdicts from tms_incharge_month_verdict;
select count(*) as cancelled from tms_fee_bill
 where person_type='staff' and status='cancelled';
```

Expected: both `0`. A dry run must leave no trace.

- [ ] **Step 4: Report the blast radius to the user before any live run**

Summarise from the dry-run output: how many pass, how many fail, and the total that would become payable. **Do not flip to `enforce`.** That is the user's decision, taken with these numbers in front of them, exactly as the 2026-08-14 run was.

- [ ] **Step 5: Final commit and push**

```bash
git push -u origin feat/incharge-monthly-verdict
```

Note: pushing to `JKKN-Institutions/TMS-ADMIN` requires `gh auth switch --user sangeethav-byte` first — the other account 403s.

---

## Self-Review Notes

**Spec coverage:** every spec section maps to a task — state machine → Tasks 6, 10, 12; definitions → Task 5; lazy bill creation → Task 8 Step 3 (`makeStaffBillsPayable` then `generateStaffBill` fallback); both migrations → Tasks 1, 9; the leak → Tasks 3, 4; daily-job demotion → Task 14; admin payment → Task 13; rollout rails → Task 15.

**Placeholder scan:** clean. The one described-not-shown step (the Monthly board) was replaced with real JSX after reading `enforcement/columns.tsx` and `enforcement/page.tsx`, and follows their `get*Columns()` factory + `DataTable` + `UniversalStatCard` pattern.

**Type consistency:** `StaffBillState` (Task 2) is consumed by Tasks 3, 10 and 13 under the same name and shape. `MonthVerdict` (Task 5) is consumed by Task 8. `InChargeGate`'s five values are matched exactly by the layout union in Task 12 Step 1 and the page's narrowed `'choose' | 'pledge' | 'must_pay'` in Step 4 — the layout maps `'in_duty'` to its pre-existing `'allowed'` rather than renaming it, so the existing redirect effects keep working untouched.

**Deliberate scope decisions recorded here so a reviewer does not read them as omissions:**
- The Monthly board is a **sibling route** (`enforcement/monthly`), not a tab inside the existing page. The existing page is a single-table layout; adding tabs would restructure working code for no functional gain. The two pages cross-link.
- **No by-bill-id mark-paid route.** A stop-wise structure raises several instalments, so per-bill payment would leave the fee gate shut after a full payment.
- `performRemoval` and `removalCopy` stay exported and tested after Task 14 even though the daily route stops calling them. They are not dead: the month-end verdict is their next caller, and deleting a tested safety-ordering helper to satisfy an unused-export check would be a poor trade.
