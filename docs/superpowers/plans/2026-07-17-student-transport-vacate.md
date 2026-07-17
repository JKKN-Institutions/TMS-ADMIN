# Student Transport Vacate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner request to vacate the bus; on transport-head approval, atomically cancel (never delete) their not-yet-paid current-transport-year bills and clear their route/stop assignment.

**Architecture:** A dedicated TMS-owned request table (`tms_transport_vacate_request`) mirroring the Grievances module — student self-service card on `/student/fees`, admin approval queue at `/vacate-requests`. The money-cancel is one `SECURITY DEFINER` Postgres function that flips `status='cancelled'` on both the `tms_fee_bill` ledger row and the MyJKKN `billing_student_bills` money row inside a single transaction. Approve/reject are gated by new `tms.vacate.*` permissions.

**Tech Stack:** Next.js 15 App Router (route handlers via `withAuth`), Supabase (service-role client + a plpgsql RPC), React Query + TanStack Table + `react-hot-toast` on the client, vitest for pure logic.

## Global Constraints

- **Cancel, never delete.** Every cancellation is `status='cancelled'` on `billing_student_bills` AND `tms_fee_bill`. No `DELETE` of any bill row, ever.
- **MyJKKN-owned tables are write-restricted.** TMS may set `billing_student_bills.status` and clear `learners_profiles.transport_route_id` / `transport_stop_id`, but must NEVER write `learners_profiles.bus_required` (MyJKKN owns it).
- **The ledger person token is `'learner'`** (not `'student'`): `tms_fee_bill.person_type = 'learner'`.
- **Paid terms are skipped.** A term is cancellable only when `lower(billing_student_bills.status) <> 'paid'` AND `coalesce(balance_amount, final_amount) > 0`.
- **Current transport year only.** Scope every cancellation to the `tms_transport_year` row with `is_current = true`.
- **Permission constants, never raw strings** — reference `TMS_PERMISSIONS.VACATE_VIEW` / `.VACATE_MANAGE`.
- **Auth pattern:** MODERN routes use `withAuth` + `createServiceRoleClient()` + a `requirePerm(auth, key)` helper (super-admin bypass via `auth.isSuperAdmin`).
- **`withAuth` drops Next's route `params`** — in an `[id]` route, parse the id from `request.nextUrl.pathname.split('/').filter(Boolean)`.
- **Migrations are applied to the live shared DB** (project ref `kvizhngldtiuufknvehv`) via the Supabase MCP `apply_migration`, and the `.sql` file is ALSO committed under `supabase/migrations/`.
- **Verification reality:** `npm run lint` is broken (circular config) — do NOT run it. Verify types with `npx tsc --noEmit` filtered to changed files (the repo has pre-existing errors + `ignoreBuildErrors`). The `@/` path alias breaks vitest — in test files, import with relative paths.
- **Notify helpers never throw** into the caller; a notify failure must never roll back a decision.

## File Structure

**New files**
- `supabase/migrations/20260717120000_create_tms_transport_vacate_request.sql` — the table.
- `supabase/migrations/20260717120100_seed_tms_vacate_permissions.sql` — the permission grant.
- `supabase/migrations/20260717120200_fn_approve_transport_vacate.sql` — the approve RPC.
- `lib/vacate/types.ts` — DTOs, status type, and the three PURE functions (no server imports).
- `lib/vacate/types.test.ts` — vitest over the pure functions.
- `lib/vacate/requests.ts` — I/O read/write helpers (service-role).
- `app/api/student/vacate-request/route.ts` — student GET (state) + POST (submit).
- `app/api/admin/vacate-requests/route.ts` — admin GET (queue list).
- `app/api/admin/vacate-requests/[id]/route.ts` — admin PATCH (approve/reject).
- `app/(admin)/vacate-requests/columns.tsx` — table columns + `VacateStatusBadge`.
- `app/(admin)/vacate-requests/page.tsx` — the admin queue page (list + inline decision panel).
- `components/student/vacate-transport-card.tsx` — the student self-service card.

**Modified files**
- `lib/constants/tms-permissions.ts` — add `VACATE_VIEW`, `VACATE_MANAGE`.
- `lib/activity/log.ts` — extend `ActivityModule` + `ActivityAction` unions.
- `app/(admin)/activity-log/columns.tsx` — register the module label + action badges.
- `app/student/fees/page.tsx` — render `<VacateTransportCard/>`.
- `lib/navigation.ts` — add the `/vacate-requests` admin-sidebar entry.

---

### Task 1: Migration — create `tms_transport_vacate_request`

**Files:**
- Create: `supabase/migrations/20260717120000_create_tms_transport_vacate_request.sql`

**Interfaces:**
- Produces: table `public.tms_transport_vacate_request` with columns `id, learner_id, profile_id, transport_year_id, route_id, stop_id, status, reason, decision_note, decided_by, decided_at, cancelled_bill_count, created_at, updated_at`; a partial unique index on `(learner_id) where status='pending'`.

- [ ] **Step 1: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- tms_transport_vacate_request: a learner's request to leave the bus.
--
-- One row = one vacate request. On approval, tms_approve_transport_vacate (a
-- later migration) cancels the learner's not-yet-paid current-transport-year
-- bills and clears their route/stop. TMS-owned; MyJKKN never reads this.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Additive. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Shared updated_at trigger fn (already created by earlier migrations; re-assert
-- so this migration is self-contained).
create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.tms_transport_vacate_request (
  id                   uuid primary key default gen_random_uuid(),
  learner_id           uuid not null,
  profile_id           uuid,
  transport_year_id    uuid not null,
  route_id             uuid,
  stop_id              uuid,
  status               text not null default 'pending'
    check (status in ('pending','approved','rejected','withdrawn')),
  reason               text,
  decision_note        text,
  decided_by           uuid,
  decided_at           timestamptz,
  cancelled_bill_count integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_tms_vacate_req_learner on public.tms_transport_vacate_request(learner_id);
create index if not exists idx_tms_vacate_req_status  on public.tms_transport_vacate_request(status);

-- Guard: at most ONE open request per learner. The DB — not the app — is the
-- authority that defeats a double-submit race.
create unique index if not exists uq_tms_vacate_req_one_pending
  on public.tms_transport_vacate_request(learner_id) where status = 'pending';

drop trigger if exists trg_tms_vacate_req_updated_at on public.tms_transport_vacate_request;
create trigger trg_tms_vacate_req_updated_at
  before update on public.tms_transport_vacate_request
  for each row execute function public.tms_set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Admin/student routes use the service-role key (bypasses RLS). These policies
-- gate any direct PostgREST access: an admin with the view permission, OR the
-- owning learner reading their own request row.
alter table public.tms_transport_vacate_request enable row level security;

drop policy if exists tms_vacate_req_select on public.tms_transport_vacate_request;
create policy tms_vacate_req_select on public.tms_transport_vacate_request
  for select using (
    public.is_super_admin()
    or public.user_has_permission('tms.vacate.view')
    or profile_id = auth.uid()
  );
```

- [ ] **Step 2: Apply the migration to the live DB**

Use the Supabase MCP tool `apply_migration` with name `create_tms_transport_vacate_request` and the SQL above.
Expected: success, no error.

- [ ] **Step 3: Verify the table exists with the guard index**

Run via Supabase MCP `execute_sql`:
```sql
select
  (select count(*) from information_schema.columns
     where table_name='tms_transport_vacate_request') as col_count,
  (select indexdef from pg_indexes
     where indexname='uq_tms_vacate_req_one_pending') as guard_index;
```
Expected: `col_count = 14`, and `guard_index` contains `WHERE (status = 'pending'::text)`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717120000_create_tms_transport_vacate_request.sql
git commit -m "feat(vacate): migration — tms_transport_vacate_request table"
```

---

### Task 2: Migration — seed `tms.vacate.*` permissions

**Files:**
- Create: `supabase/migrations/20260717120100_seed_tms_vacate_permissions.sql`

**Interfaces:**
- Produces: `tms.vacate.view` on every role holding `tms.dashboard.view`; `tms.vacate.manage` on every role holding `tms.settings.manage` (the `transport_head` role holds both parents, so it gets both keys).

- [ ] **Step 1: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the two TMS vacate permission keys into the custom_roles catalog.
--
--   tms.vacate.view    — see the admin vacate-requests queue
--   tms.vacate.manage  — approve / reject a vacate (cancels the bill)
--
-- Data-driven (no hardcoded role_keys), matching the notification/driver-mobile
-- seed migrations:
--   • VIEW   → every role that can enter the admin dashboard (tms.dashboard.view).
--   • MANAGE → every role that can manage transport settings (tms.settings.manage).
-- transport_head holds BOTH parents (see 20260602000000), so it is the intended
-- approver and gains both keys. Super admins bypass permission checks entirely.
--
-- Learners need NO permission to submit — the student route is self-scoped.
-- Additive jsonb `||` merge; idempotent. Target: kvizhngldtiuufknvehv.
-- ─────────────────────────────────────────────────────────────────────────────

-- VIEW → admin-dashboard roles
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.vacate.view": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.dashboard.view')::boolean, false) = true;

-- MANAGE → transport-settings-managing roles (incl. transport_head)
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.vacate.manage": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.settings.manage')::boolean, false) = true;
```

- [ ] **Step 2: Apply the migration to the live DB**

Use Supabase MCP `apply_migration`, name `seed_tms_vacate_permissions`, SQL above.
Expected: success.

- [ ] **Step 3: Verify transport_head holds both keys**

Run via Supabase MCP `execute_sql`:
```sql
select role_key,
       permissions ? 'tms.vacate.view'   as can_view,
       permissions ? 'tms.vacate.manage' as can_manage
from public.custom_roles
where role_key = 'transport_head';
```
Expected: one row, `can_view = true`, `can_manage = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717120100_seed_tms_vacate_permissions.sql
git commit -m "feat(vacate): migration — seed tms.vacate.view/manage permissions"
```

---

### Task 3: Migration — the `tms_approve_transport_vacate` RPC

**Files:**
- Create: `supabase/migrations/20260717120200_fn_approve_transport_vacate.sql`

**Interfaces:**
- Produces: `public.tms_approve_transport_vacate(p_request_id uuid, p_approver uuid) returns jsonb`. Returns `{"ok": true, "cancelled_bill_count": N}`. Raises `vacate_request_not_found` (errcode `P0002`) or `vacate_request_not_pending` (errcode `P0001`).

- [ ] **Step 1: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- tms_approve_transport_vacate(request_id, approver) — the atomic approve.
--
-- In ONE transaction: locks the pending request (idempotency guard), cancels the
-- learner's not-yet-paid CURRENT-transport-year term bills on BOTH planes
-- (billing_student_bills + tms_fee_bill → status='cancelled', never deleted),
-- clears the learner's route/stop, and flips the request to 'approved'.
--
-- bus_required is deliberately NOT touched — MyJKKN owns it.
-- SECURITY DEFINER so it can write the MyJKKN-owned money + learner rows; the
-- calling route is the security boundary (it checks tms.vacate.manage first).
-- Target: kvizhngldtiuufknvehv. Idempotent (create or replace).
-- ─────────────────────────────────────────────────────────────────────────────

-- The ledger's status CHECK originally admitted only generated/staff_deferred/
-- error. An approved vacate must flip the term bill to 'cancelled' (which also
-- drops it out of the fb.status='generated' overdue gate). Widen additively.
alter table public.tms_fee_bill drop constraint if exists tms_fee_bill_status_check;
alter table public.tms_fee_bill add constraint tms_fee_bill_status_check
  check (status = any (array['generated','staff_deferred','error','cancelled']));

create or replace function public.tms_approve_transport_vacate(
  p_request_id uuid,
  p_approver   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status      text;
  v_learner_id  uuid;
  v_year_id     uuid;
  v_ledger_ids  uuid[];
  v_money_ids   uuid[];
  v_count       int := 0;
begin
  -- 1. Lock the request row; guard idempotency.
  select status, learner_id, transport_year_id
    into v_status, v_learner_id, v_year_id
  from public.tms_transport_vacate_request
  where id = p_request_id
  for update;

  if not found then
    raise exception 'vacate_request_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'vacate_request_not_pending' using errcode = 'P0001';
  end if;

  -- 2. Collect the not-fully-paid current-year term bills (both ids).
  select array_agg(fb.id), array_agg(fb.billing_student_bill_id)
    into v_ledger_ids, v_money_ids
  from public.tms_fee_bill fb
  join public.billing_student_bills bsb on bsb.id = fb.billing_student_bill_id
  where fb.person_id           = v_learner_id
    and fb.person_type         = 'learner'
    and fb.transport_year_id   = v_year_id
    and fb.status <> 'cancelled'
    and coalesce(lower(bsb.status), '') <> 'paid'
    and coalesce(bsb.balance_amount, bsb.final_amount) > 0;

  v_count := coalesce(array_length(v_ledger_ids, 1), 0);

  -- 3 + 4. Cancel the money rows and the ledger rows (status flip, never delete).
  if v_count > 0 then
    update public.billing_student_bills set status = 'cancelled' where id = any(v_money_ids);
    update public.tms_fee_bill          set status = 'cancelled' where id = any(v_ledger_ids);
  end if;

  -- 5. Clear the learner's route/stop assignment (bus_required untouched).
  update public.learners_profiles
     set transport_route_id = null,
         transport_stop_id  = null
   where id = v_learner_id;

  -- 6. Flip the request to approved.
  update public.tms_transport_vacate_request
     set status = 'approved',
         decided_by = p_approver,
         decided_at = now(),
         cancelled_bill_count = v_count,
         updated_at = now()
   where id = p_request_id;

  return jsonb_build_object('ok', true, 'cancelled_bill_count', v_count);
end;
$$;

grant execute on function public.tms_approve_transport_vacate(uuid, uuid) to authenticated, service_role;
```

- [ ] **Step 2: Apply the migration to the live DB**

Use Supabase MCP `apply_migration`, name `fn_approve_transport_vacate`, SQL above.
Expected: success.

- [ ] **Step 3: Dry-run the RPC against a rolled-back transaction**

Run via Supabase MCP `execute_sql` (this inserts a throwaway request for a real learner who has current-year bills, approves it, inspects the effect, then rolls everything back so NOTHING persists):
```sql
do $$
declare
  v_learner uuid;
  v_year    uuid;
  v_req     uuid;
  v_res     jsonb;
begin
  select id into v_year from public.tms_transport_year where is_current = true limit 1;
  -- a learner with at least one non-cancelled current-year bill
  select fb.person_id into v_learner
  from public.tms_fee_bill fb
  where fb.person_type='learner' and fb.transport_year_id = v_year and fb.status <> 'cancelled'
  limit 1;

  insert into public.tms_transport_vacate_request (learner_id, transport_year_id, status)
  values (v_learner, v_year, 'pending') returning id into v_req;

  v_res := public.tms_approve_transport_vacate(v_req, v_learner);
  raise notice 'RESULT: %', v_res;
  raise notice 'ledger cancelled now: %', (
    select count(*) from public.tms_fee_bill
    where person_id=v_learner and transport_year_id=v_year and status='cancelled');

  raise exception 'rollback_dry_run';  -- undo everything
exception when others then
  if sqlerrm <> 'rollback_dry_run' then raise; end if;
  raise notice 'rolled back cleanly';
end $$;
```
Expected: notices show `RESULT: {"ok": true, "cancelled_bill_count": N}` with `N >= 0`, a matching ledger-cancelled count, then `rolled back cleanly`. A follow-up `select count(*) from public.tms_transport_vacate_request` confirms 0 rows persisted.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717120200_fn_approve_transport_vacate.sql
git commit -m "feat(vacate): migration — atomic tms_approve_transport_vacate RPC"
```

---

### Task 3B: Bill Management shows cancelled bills correctly

**Why (controller-discovered gap):** `loadTransportBills` fetches `tms_fee_bill.select('*')` with no status filter and has no `'cancelled'` branch, so after a vacate approval a cancelled bill would render as **"overdue"** and inflate the overdue KPIs. `BillStatus` must gain `'cancelled'`, which — because `STATUS_STYLE` is a `Record<BillStatus,string>` — forces a matching badge entry (else tsc breaks).

**Files:**
- Modify: `lib/fees/bills.ts`
- Modify: `app/(admin)/bill-management/columns.tsx`
- Modify: `app/(admin)/bill-management/page.tsx`

**Interfaces:**
- Produces: `BillStatus` includes `'cancelled'`; a cancelled ledger row (`tms_fee_bill.status='cancelled'`) maps to `status:'cancelled'`, `pending_amount:0`.

- [ ] **Step 1: Add `'cancelled'` to the `BillStatus` union**

In `lib/fees/bills.ts`, change the type (line ~12):
```ts
export type BillStatus =
  | 'paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'staff_deferred' | 'cancelled' | 'unknown';
```

- [ ] **Step 2: Add the `'cancelled'` branch in `loadTransportBills`**

In `lib/fees/bills.ts`, in the status compute, add a branch immediately AFTER the `staff_deferred` check and BEFORE the `!bill` check:
```ts
    if (personType === 'staff' || r.status === 'staff_deferred') {
      status = 'staff_deferred';
    } else if (r.status === 'cancelled') {
      // Vacated: the ledger row was cancelled. It owes nothing and is not overdue.
      status = 'cancelled';
      pending = 0;
    } else if (!bill) {
```
(Leave the rest of the chain unchanged. `pending` stays 0 so cancelled bills never enter `pendingAmount`/`overdueAmount`, and `status='cancelled'` keeps them out of `overdueRows`.)

- [ ] **Step 3: Add the badge style (required by the exhaustive Record)**

In `app/(admin)/bill-management/columns.tsx`, add to `STATUS_STYLE` (after `staff_deferred`):
```ts
  cancelled: 'bg-slate-100 text-slate-600 line-through dark:bg-slate-500/15 dark:text-slate-400',
```

- [ ] **Step 4: Add the status-filter option**

In `app/(admin)/bill-management/page.tsx`, add to the `status` filter options (after the `Staff deferred` option):
```ts
                { label: 'Cancelled', value: 'cancelled' },
```

- [ ] **Step 5: Type-check the changed files**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/fees/bills|bill-management" || echo "clean"`
Expected: `clean` (the exhaustive `Record<BillStatus>` now has all keys).

- [ ] **Step 6: Commit**

```bash
git add lib/fees/bills.ts "app/(admin)/bill-management/columns.tsx" "app/(admin)/bill-management/page.tsx"
git commit -m "feat(vacate): surface cancelled bills in Bill Management (not overdue)"
```

---

### Task 4: Constants & registrations

**Files:**
- Modify: `lib/constants/tms-permissions.ts`
- Modify: `lib/activity/log.ts`
- Modify: `app/(admin)/activity-log/columns.tsx`

**Interfaces:**
- Produces: `TMS_PERMISSIONS.VACATE_VIEW = 'tms.vacate.view'`, `TMS_PERMISSIONS.VACATE_MANAGE = 'tms.vacate.manage'`; `ActivityModule` includes `'transport-vacate'`; `ActivityAction` includes `'submit' | 'approve' | 'reject'`.

- [ ] **Step 1: Add the permission constants**

In `lib/constants/tms-permissions.ts`, insert after the `DRIVER_MOBILES_*` block (before the closing `} as const;`):
```ts
  // Student transport vacate — request to leave the bus + transport-head approval
  // that cancels the current-year bill.
  VACATE_VIEW: 'tms.vacate.view',
  VACATE_MANAGE: 'tms.vacate.manage',
```

- [ ] **Step 2: Extend the activity-log unions**

In `lib/activity/log.ts`, change the `ActivityAction` union to add the three verbs:
```ts
export type ActivityAction =
  | 'create' | 'update' | 'delete' | 'import' | 'assign' | 'unassign'
  | 'upload' | 'activate' | 'deactivate' | 'scan' | 'mark' | 'unmark' | 'generate'
  | 'submit' | 'approve' | 'reject';
```
And add `'transport-vacate'` to the `ActivityModule` union:
```ts
export type ActivityModule =
  | 'drivers' | 'vehicles' | 'routes' | 'route-optimization' | 'gps-devices'
  | 'passengers' | 'staff-route-assignments' | 'boarding' | 'enrollment'
  | 'grievances' | 'settings' | 'transport-years' | 'fees' | 'notifications'
  | 'driver-mobiles' | 'transport-vacate';
```

- [ ] **Step 3: Register the module label + action badges in the activity-log table**

In `app/(admin)/activity-log/columns.tsx`, add to `ACTION_BADGE` (after `generate`):
```ts
  submit: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  approve: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  reject: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
```
And add to `MODULE_LABEL` (after `driver-mobiles`):
```ts
  'transport-vacate': 'Transport Vacate',
```

- [ ] **Step 4: Type-check the changed files**

Run: `npx tsc --noEmit 2>&1 | grep -E "tms-permissions|activity" || echo "no new errors in changed files"`
Expected: `no new errors in changed files`.

- [ ] **Step 5: Commit**

```bash
git add lib/constants/tms-permissions.ts lib/activity/log.ts "app/(admin)/activity-log/columns.tsx"
git commit -m "feat(vacate): register tms.vacate.* perms + transport-vacate activity module"
```

---

### Task 5: Pure logic — `lib/vacate/types.ts` (+ tests)

**Files:**
- Create: `lib/vacate/types.ts`
- Test: `lib/vacate/types.test.ts`

**Interfaces:**
- Produces:
  - types `VacateStatus`, `VacateRequestRow`, `CancellableTerm`, `VacateRequestDTO`, `LearnerVacateState`, `LearnerVacateFacts`.
  - `isTermCancellable(t: { moneyStatus: string | null; balance: number | null; amount: number }): boolean`
  - `isVacateEligible(f: LearnerVacateFacts): boolean`
  - `sumAmountToCancel(terms: CancellableTerm[]): number`

- [ ] **Step 1: Write the failing tests**

Create `lib/vacate/types.test.ts` (relative imports — the `@/` alias breaks vitest):
```ts
import { describe, it, expect } from 'vitest';
import { isTermCancellable, isVacateEligible, sumAmountToCancel } from './types';

describe('isTermCancellable', () => {
  it('cancels an unpaid term with a positive balance', () => {
    expect(isTermCancellable({ moneyStatus: 'unpaid', balance: 5000, amount: 5000 })).toBe(true);
  });
  it('cancels an overdue/partial term (balance from balance_amount)', () => {
    expect(isTermCancellable({ moneyStatus: 'partially_paid', balance: 2000, amount: 5000 })).toBe(true);
  });
  it('skips a fully-paid term (status paid)', () => {
    expect(isTermCancellable({ moneyStatus: 'paid', balance: 0, amount: 5000 })).toBe(false);
  });
  it('skips a term whose balance is already 0 even if not marked paid', () => {
    expect(isTermCancellable({ moneyStatus: 'unpaid', balance: 0, amount: 5000 })).toBe(false);
  });
  it('falls back to amount when balance is null', () => {
    expect(isTermCancellable({ moneyStatus: 'unpaid', balance: null, amount: 5000 })).toBe(true);
  });
  it('is case-insensitive on the paid token', () => {
    expect(isTermCancellable({ moneyStatus: 'PAID', balance: 100, amount: 5000 })).toBe(false);
  });
});

describe('isVacateEligible', () => {
  it('eligible: bus-required, active, has a current-year bill', () => {
    expect(isVacateEligible({ busRequired: true, lifecycleStatus: 'active', hasCurrentYearBill: true })).toBe(true);
  });
  it('not eligible without a current-year bill', () => {
    expect(isVacateEligible({ busRequired: true, lifecycleStatus: 'active', hasCurrentYearBill: false })).toBe(false);
  });
  it('not eligible when not bus-required', () => {
    expect(isVacateEligible({ busRequired: false, lifecycleStatus: 'active', hasCurrentYearBill: true })).toBe(false);
  });
  it('not eligible for a non-active lifecycle', () => {
    expect(isVacateEligible({ busRequired: true, lifecycleStatus: 'reserved', hasCurrentYearBill: true })).toBe(false);
  });
});

describe('sumAmountToCancel', () => {
  it('sums the amounts of the given cancellable terms', () => {
    expect(sumAmountToCancel([
      { ledgerId: 'a', moneyId: 'm1', termNo: 1, amount: 5000, moneyStatus: 'unpaid', balance: 5000 },
      { ledgerId: 'b', moneyId: 'm2', termNo: 2, amount: 4000, moneyStatus: 'overdue', balance: 4000 },
    ])).toBe(9000);
  });
  it('is 0 for an empty list', () => {
    expect(sumAmountToCancel([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/vacate/types.test.ts`
Expected: FAIL — cannot resolve `./types` / functions not defined.

- [ ] **Step 3: Write `lib/vacate/types.ts`**

```ts
/**
 * Shared types + PURE helpers for the transport-vacate feature.
 *
 * This file has NO server-only imports (no supabase client) so the client card /
 * columns can import the DTO types safely, and vitest can unit-test the pure
 * functions. I/O lives in lib/vacate/requests.ts.
 */
import { ACTIVE_LIFECYCLE_STATUSES } from '../passengers/types';

export type VacateStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** Raw DB row from tms_transport_vacate_request. */
export interface VacateRequestRow {
  id: string;
  learner_id: string;
  profile_id: string | null;
  transport_year_id: string;
  route_id: string | null;
  stop_id: string | null;
  status: VacateStatus;
  reason: string | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  cancelled_bill_count: number;
  created_at: string;
  updated_at: string;
}

/** One current-year term bill considered for cancellation. */
export interface CancellableTerm {
  ledgerId: string;
  moneyId: string | null;
  termNo: number;
  amount: number;
  moneyStatus: string | null;
  balance: number | null;
}

/** Admin queue row. */
export interface VacateRequestDTO {
  id: string;
  learnerId: string;
  learnerName: string;
  rollNumber: string | null;
  routeLabel: string | null;
  status: VacateStatus;
  reason: string | null;
  decisionNote: string | null;
  amountToCancel: number;
  cancelledBillCount: number;
  createdAt: string;
  decidedAt: string | null;
}

/** Student self-service state (GET /api/student/vacate-request). */
export interface LearnerVacateState {
  eligible: boolean;
  request: {
    status: VacateStatus;
    reason: string | null;
    decisionNote: string | null;
    createdAt: string;
    cancelledBillCount: number;
  } | null;
}

export interface LearnerVacateFacts {
  busRequired: boolean;
  lifecycleStatus: string;
  hasCurrentYearBill: boolean;
}

/**
 * A term is cancellable when it is NOT fully settled: its money-row status is not
 * 'paid' (case-insensitive) AND it still owes money (balance_amount, falling back
 * to final_amount, is > 0).
 */
export function isTermCancellable(t: {
  moneyStatus: string | null;
  balance: number | null;
  amount: number;
}): boolean {
  const settled = (t.moneyStatus ?? '').toLowerCase() === 'paid';
  const owed = (t.balance ?? t.amount) > 0;
  return !settled && owed;
}

/** Eligible = bus-required + an active lifecycle + has a current-year bill. */
export function isVacateEligible(f: LearnerVacateFacts): boolean {
  const active = (ACTIVE_LIFECYCLE_STATUSES as readonly string[]).includes(f.lifecycleStatus);
  return f.busRequired && active && f.hasCurrentYearBill;
}

/** Preview total the approval would cancel. */
export function sumAmountToCancel(terms: CancellableTerm[]): number {
  return terms.reduce((sum, t) => sum + (t.amount || 0), 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/vacate/types.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/vacate/types.ts lib/vacate/types.test.ts
git commit -m "feat(vacate): pure eligibility + cancellable-term logic with tests"
```

---

### Task 6: I/O helpers — `lib/vacate/requests.ts`

**Files:**
- Create: `lib/vacate/requests.ts`

**Interfaces:**
- Consumes: types + pure fns from `./types`; `createServiceRoleClient` return type as the `Svc` param.
- Produces:
  - `getCurrentTransportYearId(svc): Promise<string | null>`
  - `resolveLearnerByProfile(svc, profileId): Promise<{ id: string; busRequired: boolean; lifecycleStatus: string; routeId: string | null; stopId: string | null } | null>`
  - `hasCurrentYearBill(svc, learnerId, yearId): Promise<boolean>`
  - `loadCancellableTerms(svc, learnerId, yearId): Promise<CancellableTerm[]>`
  - `getLearnerVacateState(svc, learnerId, yearId): Promise<LearnerVacateState>`
  - `loadVacateRequests(svc): Promise<VacateRequestDTO[]>`
  - `rejectVacateRequest(svc, args: { id: string; approverId: string; note: string }): Promise<'ok' | 'not_found' | 'not_pending'>`

- [ ] **Step 1: Write the file**

```ts
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  isTermCancellable,
  sumAmountToCancel,
  type CancellableTerm,
  type LearnerVacateState,
  type VacateRequestDTO,
  type VacateRequestRow,
  type VacateStatus,
} from './types';

type Svc = ReturnType<typeof createServiceRoleClient>;

const IN_CHUNK = 150; // keep .in() lists under the API-gateway limit (see lib/fees/bills.ts)
function chunk<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function getCurrentTransportYearId(svc: Svc): Promise<string | null> {
  const { data } = await svc.from('tms_transport_year').select('id').eq('is_current', true).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function resolveLearnerByProfile(
  svc: Svc,
  profileId: string,
): Promise<{ id: string; busRequired: boolean; lifecycleStatus: string; routeId: string | null; stopId: string | null } | null> {
  const { data } = await svc
    .from('learners_profiles')
    .select('id, bus_required, lifecycle_status, transport_route_id, transport_stop_id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    id: string; bus_required: boolean | null; lifecycle_status: string;
    transport_route_id: string | null; transport_stop_id: string | null;
  };
  return {
    id: r.id,
    busRequired: !!r.bus_required,
    lifecycleStatus: r.lifecycle_status,
    routeId: r.transport_route_id,
    stopId: r.transport_stop_id,
  };
}

export async function hasCurrentYearBill(svc: Svc, learnerId: string, yearId: string): Promise<boolean> {
  const { count } = await svc
    .from('tms_fee_bill')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', learnerId)
    .eq('person_type', 'learner')
    .eq('transport_year_id', yearId)
    .neq('status', 'cancelled');
  return (count ?? 0) > 0;
}

/** The learner's not-fully-paid current-year term bills (ledger + money joined). */
export async function loadCancellableTerms(svc: Svc, learnerId: string, yearId: string): Promise<CancellableTerm[]> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .select('id, term_no, amount, billing_student_bill_id, billing_student_bills(id, status, balance_amount, final_amount)')
    .eq('person_id', learnerId)
    .eq('person_type', 'learner')
    .eq('transport_year_id', yearId)
    .neq('status', 'cancelled');
  if (error || !data) return [];
  const rows = data as unknown as Array<{
    id: string; term_no: number; amount: number; billing_student_bill_id: string | null;
    billing_student_bills: { id: string; status: string | null; balance_amount: number | null; final_amount: number } | null;
  }>;
  return rows
    .map((r) => ({
      ledgerId: r.id,
      moneyId: r.billing_student_bill_id,
      termNo: r.term_no,
      amount: Number(r.billing_student_bills?.final_amount ?? r.amount ?? 0),
      moneyStatus: r.billing_student_bills?.status ?? null,
      balance: r.billing_student_bills?.balance_amount ?? null,
    }))
    .filter((t) => isTermCancellable(t));
}

export async function getLearnerVacateState(svc: Svc, learnerId: string, yearId: string): Promise<LearnerVacateState> {
  const eligible = await hasCurrentYearBill(svc, learnerId, yearId);
  const { data } = await svc
    .from('tms_transport_vacate_request')
    .select('status, reason, decision_note, created_at, cancelled_bill_count')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const req = data as
    | { status: VacateStatus; reason: string | null; decision_note: string | null; created_at: string; cancelled_bill_count: number }
    | null;
  return {
    eligible,
    request: req
      ? {
          status: req.status,
          reason: req.reason,
          decisionNote: req.decision_note,
          createdAt: req.created_at,
          cancelledBillCount: req.cancelled_bill_count,
        }
      : null,
  };
}

/** Admin queue: every request with learner name/roll, vacated-route label, and a live amount-to-cancel. */
export async function loadVacateRequests(svc: Svc): Promise<VacateRequestDTO[]> {
  const { data: reqData, error } = await svc
    .from('tms_transport_vacate_request')
    .select('id, learner_id, transport_year_id, route_id, status, reason, decision_note, cancelled_bill_count, created_at, decided_at')
    .order('created_at', { ascending: false });
  if (error || !reqData) return [];
  const reqs = reqData as Array<Pick<VacateRequestRow,
    'id' | 'learner_id' | 'transport_year_id' | 'route_id' | 'status' | 'reason' | 'decision_note' | 'cancelled_bill_count' | 'created_at' | 'decided_at'>>;
  if (reqs.length === 0) return [];

  // Learner names/rolls.
  const learnerIds = [...new Set(reqs.map((r) => r.learner_id))];
  const nameById = new Map<string, { name: string; roll: string | null }>();
  for (const c of chunk(learnerIds)) {
    const { data } = await svc.from('learners_profiles').select('id, first_name, last_name, roll_number').in('id', c);
    for (const l of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null }>) {
      nameById.set(l.id, { name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Unknown', roll: l.roll_number });
    }
  }

  // Route labels (from the vacated-route snapshot).
  const routeIds = [...new Set(reqs.map((r) => r.route_id).filter((x): x is string => !!x))];
  const routeById = new Map<string, string>();
  for (const c of chunk(routeIds)) {
    if (c.length === 0) continue;
    const { data } = await svc.from('tms_route').select('id, route_number, route_name').in('id', c);
    for (const r of (data ?? []) as Array<{ id: string; route_number: string; route_name: string }>) {
      routeById.set(r.id, `${r.route_number} · ${r.route_name}`);
    }
  }

  // Live amount-to-cancel per request (small N of requests → per-request query is fine).
  const out: VacateRequestDTO[] = [];
  for (const r of reqs) {
    const terms = await loadCancellableTerms(svc, r.learner_id, r.transport_year_id);
    const nm = nameById.get(r.learner_id);
    out.push({
      id: r.id,
      learnerId: r.learner_id,
      learnerName: nm?.name ?? 'Unknown',
      rollNumber: nm?.roll ?? null,
      routeLabel: r.route_id ? routeById.get(r.route_id) ?? null : null,
      status: r.status,
      reason: r.reason,
      decisionNote: r.decision_note,
      amountToCancel: sumAmountToCancel(terms),
      cancelledBillCount: r.cancelled_bill_count,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
    });
  }
  return out;
}

/** Reject a pending request. Returns a status token the route maps to HTTP. */
export async function rejectVacateRequest(
  svc: Svc,
  args: { id: string; approverId: string; note: string },
): Promise<'ok' | 'not_found' | 'not_pending'> {
  const { data: cur } = await svc
    .from('tms_transport_vacate_request')
    .select('status')
    .eq('id', args.id)
    .maybeSingle();
  if (!cur) return 'not_found';
  if ((cur as { status: string }).status !== 'pending') return 'not_pending';
  const { error } = await svc
    .from('tms_transport_vacate_request')
    .update({ status: 'rejected', decision_note: args.note, decided_by: args.approverId, decided_at: new Date().toISOString() })
    .eq('id', args.id)
    .eq('status', 'pending');
  return error ? 'not_found' : 'ok';
}
```

- [ ] **Step 2: Type-check the changed file**

Run: `npx tsc --noEmit 2>&1 | grep "lib/vacate/requests" || echo "clean"`
Expected: `clean` (no errors referencing this file).

- [ ] **Step 3: Commit**

```bash
git add lib/vacate/requests.ts
git commit -m "feat(vacate): service-role read/write helpers (state, queue, reject)"
```

---

### Task 7: Student API — `app/api/student/vacate-request/route.ts`

**Files:**
- Create: `app/api/student/vacate-request/route.ts`

**Interfaces:**
- Consumes: `getCurrentTransportYearId`, `resolveLearnerByProfile`, `getLearnerVacateState`, `isVacateEligible`, `notifyProfile`.
- Produces: `GET` → `{ success:true, data: LearnerVacateState }`; `POST { reason? }` → `{ success:true }` (201) or an error.

- [ ] **Step 1: Write the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyProfile } from '@/lib/notifications/notify';
import {
  getCurrentTransportYearId,
  resolveLearnerByProfile,
  getLearnerVacateState,
} from '@/lib/vacate/requests';
import { isVacateEligible } from '@/lib/vacate/types';
import { logActivity } from '@/lib/activity/log';

/**
 * Student self-service transport vacate. SELF-SCOPED: the learner is always
 * resolved from the session profile (auth.userId), never from the client.
 *   GET  -> { eligible, request } for the caller's own learner
 *   POST -> create a pending request { reason? }; notifies the transport head
 */
async function handleGet(_request: NextRequest, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();
    const yearId = await getCurrentTransportYearId(svc);
    const learner = await resolveLearnerByProfile(svc, auth.userId);
    if (!yearId || !learner) {
      return NextResponse.json({ success: true, data: { eligible: false, request: null } });
    }
    const state = await getLearnerVacateState(svc, learner.id, yearId);
    // Gate eligibility on bus_required + active lifecycle too (state.eligible is the bill check).
    const eligible = isVacateEligible({
      busRequired: learner.busRequired,
      lifecycleStatus: learner.lifecycleStatus,
      hasCurrentYearBill: state.eligible,
    });
    return NextResponse.json({ success: true, data: { ...state, eligible } });
  } catch (e) {
    console.error('student vacate GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const svc = createServiceRoleClient();

    const yearId = await getCurrentTransportYearId(svc);
    const learner = await resolveLearnerByProfile(svc, auth.userId);
    if (!yearId || !learner) {
      return NextResponse.json({ error: 'No transport account found' }, { status: 400 });
    }

    const state = await getLearnerVacateState(svc, learner.id, yearId);
    const eligible = isVacateEligible({
      busRequired: learner.busRequired,
      lifecycleStatus: learner.lifecycleStatus,
      hasCurrentYearBill: state.eligible,
    });
    if (!eligible) {
      return NextResponse.json({ error: 'You are not eligible to vacate transport.' }, { status: 400 });
    }
    if (state.request && state.request.status === 'pending') {
      return NextResponse.json({ error: 'You already have a pending vacate request.' }, { status: 409 });
    }

    const insert = await svc
      .from('tms_transport_vacate_request')
      .insert({
        learner_id: learner.id,
        profile_id: auth.userId,
        transport_year_id: yearId,
        route_id: learner.routeId,
        stop_id: learner.stopId,
        status: 'pending',
        reason: body.reason?.trim() || null,
      })
      .select('id')
      .maybeSingle();

    if (insert.error) {
      // 23505 = the partial-unique guard caught a racing duplicate.
      if ((insert.error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'You already have a pending vacate request.' }, { status: 409 });
      }
      console.error('student vacate POST insert error:', insert.error);
      return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
    }

    // Notify the transport head(s) — holders of the approve permission.
    try {
      const { data: approvers } = await svc.rpc('tms_users_with_permission', { p_permission: 'tms.vacate.manage' });
      const ids = ((approvers ?? []) as unknown[])
        .map((r) => (typeof r === 'string' ? r : (r as Record<string, string>)?.tms_users_with_permission))
        .filter((x): x is string => !!x);
      for (const pid of [...new Set(ids)]) {
        await notifyProfile(svc, {
          profileId: pid,
          actorId: auth.userId,
          title: 'New transport vacate request',
          body: 'A learner has requested to vacate the bus. Review and approve or reject it.',
          category: 'general',
          url: '/vacate-requests',
        });
      }
    } catch (e) {
      console.error('student vacate notify approvers (non-fatal):', e);
    }

    await logActivity(auth, request, {
      module: 'transport-vacate',
      action: 'submit',
      entityType: 'tms_transport_vacate_request',
      entityId: insert.data?.id ?? null,
      entityLabel: learner.id,
      description: 'Learner submitted a transport vacate request',
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    console.error('student vacate POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const POST = withAuth((request, auth) => handlePost(request, auth));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "api/student/vacate-request" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Probe the route is auth-gated (unauthenticated → 401)**

Ensure the dev server is running (`npm run dev` in another terminal), then:
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/student/vacate-request`
Expected: `401` (no `x-user-id` without passing the proxy).

- [ ] **Step 4: Commit**

```bash
git add app/api/student/vacate-request/route.ts
git commit -m "feat(vacate): student self-service vacate-request API (GET state, POST submit)"
```

---

### Task 8: Admin queue API — `app/api/admin/vacate-requests/route.ts`

**Files:**
- Create: `app/api/admin/vacate-requests/route.ts`

**Interfaces:**
- Consumes: `loadVacateRequests`, `TMS_PERMISSIONS.VACATE_VIEW`.
- Produces: `GET` → `{ success:true, data: VacateRequestDTO[] }` (403 without the view permission).

- [ ] **Step 1: Write the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadVacateRequests } from '@/lib/vacate/requests';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handleGet(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.VACATE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();
    const data = await loadVacateRequests(svc);
    return NextResponse.json({ success: true, data, count: data.length });
  } catch (e) {
    console.error('admin vacate-requests GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "api/admin/vacate-requests/route" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/vacate-requests/route.ts
git commit -m "feat(vacate): admin vacate-requests queue API (GET)"
```

---

### Task 9: Admin decision API — `app/api/admin/vacate-requests/[id]/route.ts`

**Files:**
- Create: `app/api/admin/vacate-requests/[id]/route.ts`

**Interfaces:**
- Consumes: `rejectVacateRequest`, `notifyLearner`, `TMS_PERMISSIONS.VACATE_MANAGE`, the `tms_approve_transport_vacate` RPC.
- Produces: `PATCH { action:'approve'|'reject', note? }` → `{ success:true, cancelledBillCount? }`. 403 (no manage perm), 400 (bad action / missing reject note), 404 (not found), 409 (not pending).

- [ ] **Step 1: Write the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { rejectVacateRequest } from '@/lib/vacate/requests';
import { notifyLearner } from '@/lib/notifications/notify';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route params, so pull [id] from the path:
// /api/admin/vacate-requests/<id>
function requestIdFromPath(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

async function handlePatch(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.VACATE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = requestIdFromPath(request);
    const body = (await request.json().catch(() => ({}))) as { action?: string; note?: string };
    const svc = createServiceRoleClient();

    // Resolve the learner for notify/logging (works for both actions).
    const { data: reqRow } = await svc
      .from('tms_transport_vacate_request')
      .select('learner_id, status')
      .eq('id', id)
      .maybeSingle();
    if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const learnerId = (reqRow as { learner_id: string }).learner_id;

    if (body.action === 'approve') {
      const { data, error } = await svc.rpc('tms_approve_transport_vacate', {
        p_request_id: id,
        p_approver: auth.userId,
      });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('not_pending')) return NextResponse.json({ error: 'Request is no longer pending' }, { status: 409 });
        if (msg.includes('not_found')) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        console.error('vacate approve RPC error:', error);
        return NextResponse.json({ error: 'Failed to approve' }, { status: 500 });
      }
      const count = (data as { cancelled_bill_count?: number } | null)?.cancelled_bill_count ?? 0;
      await notifyLearner(svc, {
        learnerId,
        actorId: auth.userId,
        title: 'Transport vacate approved',
        body: `Your request to leave the bus was approved. ${count} current-year fee term(s) were cancelled and your route was removed.`,
        url: '/student/fees',
      });
      await logActivity(auth, request, {
        module: 'transport-vacate',
        action: 'approve',
        entityType: 'tms_transport_vacate_request',
        entityId: id,
        entityLabel: learnerId,
        description: 'Approved transport vacate',
        metadata: { cancelled_bill_count: count },
      });
      return NextResponse.json({ success: true, cancelledBillCount: count });
    }

    if (body.action === 'reject') {
      const note = body.note?.trim();
      if (!note) return NextResponse.json({ error: 'A reason is required to reject.' }, { status: 400 });
      const result = await rejectVacateRequest(svc, { id, approverId: auth.userId, note });
      if (result === 'not_found') return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      if (result === 'not_pending') return NextResponse.json({ error: 'Request is no longer pending' }, { status: 409 });
      await notifyLearner(svc, {
        learnerId,
        actorId: auth.userId,
        title: 'Transport vacate declined',
        body: `Your request to leave the bus was declined: ${note}. You may submit a new request.`,
        url: '/student/fees',
      });
      await logActivity(auth, request, {
        module: 'transport-vacate',
        action: 'reject',
        entityType: 'tms_transport_vacate_request',
        entityId: id,
        entityLabel: learnerId,
        description: 'Rejected transport vacate',
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('admin vacate PATCH error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PATCH = withAuth((request, auth) => handlePatch(request, auth));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "api/admin/vacate-requests/\[id\]" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/admin/vacate-requests/[id]/route.ts"
git commit -m "feat(vacate): admin approve/reject decision API"
```

---

### Task 10: Admin table columns — `app/(admin)/vacate-requests/columns.tsx`

**Files:**
- Create: `app/(admin)/vacate-requests/columns.tsx`

**Interfaces:**
- Consumes: `VacateRequestDTO` from `@/lib/vacate/types`.
- Produces: `VacateStatusBadge`, `getVacateColumns(onView, onApprove, onReject, canManage): ColumnDef<VacateRequestDTO>[]`.

- [ ] **Step 1: Write the file**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, MoreHorizontal, X } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { VacateRequestDTO } from '@/lib/vacate/types';

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export function VacateStatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    withdrawn: 'bg-gray-200 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
  };
  const cls = map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status ?? 'unknown'}
    </span>
  );
}

export function getVacateColumns(
  onView: (r: VacateRequestDTO) => void,
  onApprove: (r: VacateRequestDTO) => void,
  onReject: (r: VacateRequestDTO) => void,
  canManage: boolean,
): ColumnDef<VacateRequestDTO>[] {
  return [
    {
      id: 'learner',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      accessorFn: (r) => `${r.learnerName} ${r.rollNumber ?? ''}`.trim(),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="flex min-w-0 flex-col gap-0.5 text-left"
        >
          <span className="truncate font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100">
            {row.original.learnerName}
          </span>
          {row.original.rollNumber && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.rollNumber}</span>
          )}
        </button>
      ),
    },
    {
      accessorKey: 'routeLabel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{row.original.routeLabel ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'amountToCancel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="To cancel" />,
      size: 120,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm font-medium tabular-nums text-gray-800 dark:text-gray-200">
          {row.original.status === 'approved' ? `${row.original.cancelledBillCount} term(s)` : inr(row.original.amountToCancel)}
        </span>
      ),
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => r.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => <VacateStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Requested" />,
      size: 120,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const r = row.original;
        const open = (fn: () => void) => setTimeout(fn, 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${r.learnerName}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(() => onView(r))}>
                  <Eye className="text-gray-500" /> View details
                </DropdownMenuItem>
                {canManage && r.status === 'pending' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => open(() => onApprove(r))}>
                      <Check className="text-green-600" /> Approve &amp; cancel bill
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => open(() => onReject(r))}>
                      <X className="text-red-600" /> Reject
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "vacate-requests/columns" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/vacate-requests/columns.tsx"
git commit -m "feat(vacate): admin queue table columns + status badge"
```

---

### Task 11: Admin queue page — `app/(admin)/vacate-requests/page.tsx`

**Files:**
- Create: `app/(admin)/vacate-requests/page.tsx`

**Interfaces:**
- Consumes: `getVacateColumns`, `VacateStatusBadge`, `VacateRequestDTO`, `usePermissions`, `DataTable`.
- Produces: the `/vacate-requests` page (list + stats + inline reject-with-note panel).

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle2, Clock, LogOut, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { usePermissions } from '@/hooks/use-permissions';
import { getVacateColumns, VacateStatusBadge } from './columns';
import type { VacateRequestDTO } from '@/lib/vacate/types';

async function fetchList(): Promise<VacateRequestDTO[]> {
  const res = await fetch('/api/admin/vacate-requests', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
  return (await res.json()).data as VacateRequestDTO[];
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Clock; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold leading-none text-gray-900 dark:text-gray-100">{value}</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</div>
      </div>
    </div>
  );
}

export default function VacateRequestsPage() {
  const qc = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.vacate.manage');

  const { data: list = [], isLoading, error } = useQuery({ queryKey: ['admin-vacate-requests'], queryFn: fetchList });
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const selected = openId ? list.find((r) => r.id === openId) ?? null : null;

  const decide = useMutation({
    mutationFn: async (payload: { id: string; action: 'approve' | 'reject'; note?: string }) => {
      const res = await fetch(`/api/admin/vacate-requests/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: payload.action, note: payload.note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed');
      return json as { cancelledBillCount?: number };
    },
    onSuccess: (json, payload) => {
      toast.success(
        payload.action === 'approve'
          ? `Approved — ${json.cancelledBillCount ?? 0} term(s) cancelled`
          : 'Request rejected',
      );
      setOpenId(null);
      setRejectNote('');
      qc.invalidateQueries({ queryKey: ['admin-vacate-requests'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const onApprove = (r: VacateRequestDTO) => {
    if (decide.isPending) return;
    decide.mutate({ id: r.id, action: 'approve' });
  };
  const onReject = (r: VacateRequestDTO) => {
    setOpenId(r.id);
    setRejectNote('');
  };
  const onView = (r: VacateRequestDTO) => setOpenId(r.id);

  const columns = useMemo(
    () => getVacateColumns(onView, onApprove, onReject, canManage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, decide.isPending],
  );

  const stats = useMemo(
    () => ({
      pending: list.filter((r) => r.status === 'pending').length,
      approved: list.filter((r) => r.status === 'approved').length,
      rejected: list.filter((r) => r.status === 'rejected').length,
    }),
    [list],
  );

  if (error) return <div className="p-4 text-destructive">{(error as Error).message}</div>;

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-semibold">Transport Vacate Requests</h1>
        <p className="text-sm text-muted-foreground">
          Approve to cancel the learner&apos;s current-year transport bill and clear their route, or reject with a reason.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pending" value={stats.pending} icon={Clock} accent="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} accent="bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" />
        <StatCard label="Rejected" value={stats.rejected} icon={AlertCircle} accent="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" />
      </div>

      <DataTable
        columns={columns}
        data={list}
        entityName="vacate requests"
        isLoading={isLoading}
        searchPlaceholder="Search learner, roll…"
        filters={[
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { label: 'Pending', value: 'pending' },
              { label: 'Approved', value: 'approved' },
              { label: 'Rejected', value: 'rejected' },
              { label: 'Withdrawn', value: 'withdrawn' },
            ],
          },
        ]}
      />

      {/* Inline detail / reject panel */}
      {selected && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-500/5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <LogOut className="h-4 w-4 text-gray-500" />
                <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{selected.learnerName}</h2>
                <VacateStatusBadge status={selected.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.rollNumber ? `${selected.rollNumber} · ` : ''}
                {selected.routeLabel ?? 'No route'} · To cancel: {inr(selected.amountToCancel)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              aria-label="Close"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            {selected.reason && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Learner&apos;s reason</h3>
                <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm text-gray-700 dark:text-gray-300">{selected.reason}</p>
              </div>
            )}
            {selected.decisionNote && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Decision note</h3>
                <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm text-gray-700 dark:text-gray-300">{selected.decisionNote}</p>
              </div>
            )}

            {canManage && selected.status === 'pending' && (
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reject reason (required to reject)</label>
                  <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Why is this request declined?" className="mt-1" />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => decide.mutate({ id: selected.id, action: 'reject', note: rejectNote })}
                    disabled={!rejectNote.trim() || decide.isPending}
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => decide.mutate({ id: selected.id, action: 'approve' })}
                    disabled={decide.isPending}
                  >
                    Approve &amp; cancel bill
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "vacate-requests/page" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/vacate-requests/page.tsx"
git commit -m "feat(vacate): admin queue page with approve/reject panel"
```

---

### Task 12: Student card — `components/student/vacate-transport-card.tsx` + wire into fees page

**Files:**
- Create: `components/student/vacate-transport-card.tsx`
- Modify: `app/student/fees/page.tsx`

**Interfaces:**
- Consumes: `LearnerVacateState` from `@/lib/vacate/types`; `react-hot-toast`; React Query.
- Produces: `<VacateTransportCard/>` (default export) rendered on the fees page; invalidates `['student-transport-access']` on a successful submit.

- [ ] **Step 1: Write the card**

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { LogOut, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { LearnerVacateState } from '@/lib/vacate/types';

async function fetchState(): Promise<LearnerVacateState> {
  const res = await fetch('/api/student/vacate-request', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
  return json.data as LearnerVacateState;
}

export default function VacateTransportCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['student-vacate-state'], queryFn: fetchState });
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/student/vacate-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed');
    },
    onSuccess: () => {
      toast.success('Vacate request submitted for approval');
      setConfirming(false);
      setReason('');
      qc.invalidateQueries({ queryKey: ['student-vacate-state'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (isLoading || !data) return null;

  const req = data.request;

  // Pending — waiting on the transport head.
  if (req && req.status === 'pending') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300">Vacate request pending approval</p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300/90">
              You asked to leave the bus on {new Date(req.createdAt).toLocaleDateString()}. The transport office will review it. Your fees stay as-is until it is approved.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Approved — done.
  if (req && req.status === 'approved') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-500/30 dark:bg-green-950/20">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">You&apos;ve left the bus</p>
            <p className="mt-1 text-sm text-green-700 dark:text-green-300/90">
              Your transport vacate was approved. {req.cancelledBillCount} current-year fee term(s) were cancelled and your route was removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Remaining states: no request, or a past rejected/withdrawn one. Only offer the
  // button to a currently-eligible learner; otherwise render nothing.
  if (!data.eligible) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          <LogOut className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-gray-100">Leaving the bus?</p>
          {req && req.status === 'rejected' && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Your last request was declined{req.decisionNote ? `: ${req.decisionNote}` : ''}. You can submit a new one.
            </p>
          )}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Request to vacate transport. Once the transport office approves, your remaining current-year transport fees are cancelled and your route is removed.
          </p>

          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              Request to vacate transport
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                rows={2}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => submit.mutate()}
                  disabled={submit.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm vacate request
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirming(false); setReason(''); }}
                  className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the fees page**

In `app/student/fees/page.tsx`, add the import near the top (after the lucide import):
```tsx
import VacateTransportCard from '@/components/student/vacate-transport-card';
```
Then render it directly after the header block — insert `<VacateTransportCard />` immediately BEFORE the `{/* Status banner */}` comment line:
```tsx
      </div>

      <VacateTransportCard />

      {/* Status banner */}
```
(The `</div>` above is the closing tag of the header flex row that ends at line ~90; place the card between it and the status-banner block.)

- [ ] **Step 3: Type-check both files**

Run: `npx tsc --noEmit 2>&1 | grep -E "vacate-transport-card|student/fees/page" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add components/student/vacate-transport-card.tsx app/student/fees/page.tsx
git commit -m "feat(vacate): student vacate card on the fees page"
```

---

### Task 13: Navigation entry + full verification

**Files:**
- Modify: `lib/navigation.ts`

**Interfaces:**
- Consumes: `TMS_PERMISSIONS.VACATE_VIEW`.
- Produces: a `/vacate-requests` entry in `allNavigation` (group `services`), visible to holders of `tms.vacate.view`.

- [ ] **Step 1: Add the nav entry**

In `lib/navigation.ts`, add `LogOut` to the lucide import list at the top:
```ts
  Bug,
  LogOut,
} from 'lucide-react';
```
Then add this item to `allNavigation`, immediately after the `Grievances` entry:
```ts
  { name: 'Vacate Requests', href: '/vacate-requests', icon: LogOut, permission: TMS_PERMISSIONS.VACATE_VIEW, group: 'services' },
```

- [ ] **Step 2: Type-check the whole changed set**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "vacate|navigation|activity/log|tms-permissions|student/fees" || echo "no new errors in changed files"
```
Expected: `no new errors in changed files`.

- [ ] **Step 3: Run the pure-logic tests once more**

Run: `npx vitest run lib/vacate/types.test.ts`
Expected: PASS.

- [ ] **Step 4: Route probes (dev server running)**

Run:
```bash
curl -s -o /dev/null -w "student=%{http_code}\n" http://localhost:3000/api/student/vacate-request
curl -s -o /dev/null -w "admin=%{http_code}\n"   http://localhost:3000/api/admin/vacate-requests
curl -s -o /dev/null -w "page=%{http_code}\n"    http://localhost:3000/vacate-requests
```
Expected: `student=401`, `admin=401` (both need the proxy's `x-user-id`), `page=307` (unauthenticated redirect to login).

- [ ] **Step 5: Commit**

```bash
git add lib/navigation.ts
git commit -m "feat(vacate): add Vacate Requests to the admin sidebar"
```

- [ ] **Step 6: Manual smoke test (required — cannot be done headless)**

The agent's Chrome is unauthenticated; this flow is entirely auth-gated. Hand to the user:
1. As an eligible bus learner, open `/student/fees` → the "Leaving the bus?" card shows → click **Request to vacate transport** → confirm.
2. As the transport head, open `/vacate-requests` → the row appears as **Pending** with an amount-to-cancel → click **Approve & cancel bill**.
3. Verify in Bill Management that the learner's current-year term bill(s) now show **cancelled**, the learner's route/stop is cleared, and the learner regains full-portal access on their next `/student/fees` load.

---

## Self-Review Notes

**Spec coverage** — every spec section maps to a task:
- Data model → Task 1. Permissions → Task 2 (+ constants in Task 4). Approve RPC → Task 3. Pure eligibility/term rules → Task 5. Read/write helpers → Task 6. Student API → Task 7. Admin queue API → Task 8. Decision API → Task 9. Student UI → Task 12. Admin UI → Tasks 10–11. Notifications → Tasks 7 & 9. Activity log → Task 4 (types) + Tasks 7/9 (calls). Nav → Task 13. Testing plan → Steps throughout + Task 13.

**Type consistency** — `VacateRequestDTO`, `LearnerVacateState`, `CancellableTerm`, `VacateStatus` are defined once in Task 5 and imported everywhere. `getVacateColumns(onView, onApprove, onReject, canManage)` matches its call in Task 11. The RPC name `tms_approve_transport_vacate` and its `{ cancelled_bill_count }` return match between Task 3 and Task 9. `tms_users_with_permission` uses param `p_permission` (Task 7), matching `lib/notifications/audience.ts`.

**Known deferrals (from the spec, intentionally unbuilt):** staff vacate, admin un-approve/reverse, and learner self-withdraw of a pending request (the `withdrawn` status exists in the enum but no UI triggers it in v1).
