# Fee Concession Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Fee Concession" tab in Bill Management that lists Final-Year (50%) and 7.5%-scheme learners per transport year, shows whether each concession is applied, and applies it (override rows + bill correction) on click.

**Architecture:** Rules live in a new `tms_fee_concession_rule` table. A TypeScript loader computes each candidate's full terms with the generator's own `resolvePersonTerms`, derives target terms, and classifies the row. Apply calls one Postgres function per learner that writes overrides and corrects the bill atomically, re-checking bill state itself. The UI is a new view on the existing Bill Management page.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (PostgREST + plpgsql), TanStack Query/Table, vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-fee-concession-tab-design.md`

## Global Constraints

- Work only in the worktree `D:\Sangeetha_V\TMS-ADMIN\.worktrees\fee-concessions` (branch `feat/fee-concessions`). Never `git stash`; `git add` explicit paths only.
- Admin API routes: `withAuth` + `createServiceRoleClient()` + a local `requirePerm` (copy of the one in `app/api/admin/bill-management/unbilled/route.ts`). Responses: `{ success: true, data }` / `{ error }`.
- `tms_fee_bill.person_type` is `'learner'` (never `'student'`). Fee structure `audience` for learners is `'student'`.
- `.in()` lists: chunk ≤150 via `selectByIds` from `lib/supabase/chunked.ts`, and always check `error`.
- Postgres `numeric` arrives as a string: wrap in `Number()`.
- Never write `billing_student_bills.balance_amount` or `status` — triggers own them.
- Every new SQL function: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` and verify with `has_function_privilege`.
- Log every Apply/rule mutation with `logActivity` (module `fee-concessions`), awaited, after success.
- Permissions: `tms.fees.concession.view`, `tms.fees.concession.apply`, granted to `transport_head` only.
- Transport year 2026-2027 id: `6b3768f9-c9fb-48d5-a955-41949983c3b0`. Pharmacy `5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334`, BPHARM program `0d980d34-f945-4de6-8c88-ee97b2620b99`, Allied Health `9c1554e8-12a2-4b76-a9d6-8242bb05eba1`.
- Repo-wide `tsc` is red (known debt) and `npm run lint` crashes: verify with vitest, `node node_modules/next/dist/bin/next build`, and `tsc` output filtered to touched files.

**Refinements to the spec made while planning (intentional):**
1. Population = the people the generator bills (`resolveApplicablePeople` per active student structure: Bus Pass appliers, `bus_required`, default lifecycle statuses), not a separate `lifecycle_status='active'` query — the list must match who actually gets billed.
2. "Applied" compares override *values* to the target; the reason-prefix fallback is unnecessary (legacy hand-written overrides already carry the right values).
3. Instalment rescale on a multi-instalment unpaid bill is proportional (trigger behaviour); the total is exact, per-instalment split may differ from a freshly generated bill. Accepted.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260917120000_fee_concessions.sql` | tables, override column, apply function, grants, permissions, seed |
| `lib/fees/concession-math.ts` (+ `.test.ts`) | pure: rule matching, target terms, per-row target, status classification |
| `lib/fees/concession-rules.ts` (+ `.test.ts`) | pure: validate rule create/update input |
| `lib/fees/structure-context.ts` | load a structure's `ResolveContext` (extracted from `generate.ts`) |
| `lib/fees/generate.ts` | use `loadResolveContext` (no behaviour change) |
| `lib/fees/concessions.ts` (+ `.test.ts`) | DB loader for rows; apply orchestration |
| `lib/constants/tms-permissions.ts` | two new keys |
| `lib/activity/log.ts`, `app/(admin)/activity-log/columns.tsx` | module `fee-concessions`, action `apply` |
| `app/api/admin/fees/concessions/route.ts` | GET rows |
| `app/api/admin/fees/concessions/apply/route.ts` | POST apply |
| `app/api/admin/fees/concessions/rules/route.ts` | GET/POST rules |
| `app/api/admin/fees/concessions/rules/[id]/route.ts` | PUT rule |
| `app/(admin)/bill-management/concessions/concessions-api.ts` | client fetchers |
| `app/(admin)/bill-management/concessions/concession-columns.tsx` | table columns |
| `app/(admin)/bill-management/concessions/rule-dialog.tsx` | add/edit rule dialog |
| `app/(admin)/bill-management/concessions/concession-panel.tsx` | the tab body |
| `app/(admin)/bill-management/page.tsx` | new view + toggle |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260917120000_fee_concessions.sql`

**Interfaces:**
- Produces: table `tms_fee_concession_rule`, table `tms_fee_concession_log`, column `tms_fee_override.concession_rule_id`, function
  `tms_apply_fee_concession(p_person_id uuid, p_rule_id uuid, p_terms jsonb, p_target_total numeric, p_reason text, p_actor uuid) returns jsonb` (**superseded** by the Task 1 amendment below: `p_row_targets jsonb` replaces `p_target_total`)
  returning `{"actions":[{"fee_bill_id":…,"term_no":…,"action":"repriced|ledger_aligned|deleted|unchanged"}]}` (empty array = no bill).
  Errors whose message starts with `CONCESSION_REVIEW:` mean "needs accounts review".

- [ ] **Step 1: Write the migration**

```sql
-- Fee Concession tab: rules, audit log, override link, and the apply function.
-- Spec: docs/superpowers/specs/2026-09-17-fee-concession-tab-design.md

create table if not exists public.tms_fee_concession_rule (
  id uuid primary key default gen_random_uuid(),
  transport_year_id uuid not null references public.tms_transport_year(id),
  kind text not null check (kind in ('final_year', 'scheme_75')),
  institution_id uuid references public.institutions(id),
  admission_year int,
  program_id uuid references public.programs(id),
  percent numeric(5,2),
  annual_amount numeric(12,2),
  is_active boolean not null default true,
  label text not null check (length(trim(label)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  constraint tms_fee_concession_rule_final_year_chk check (
    kind <> 'final_year' or (
      institution_id is not null and admission_year is not null
      and percent is not null and percent > 0 and percent < 100
      and annual_amount is null)),
  constraint tms_fee_concession_rule_scheme_75_chk check (
    kind <> 'scheme_75' or (
      annual_amount is not null and annual_amount > 0
      and institution_id is null and admission_year is null
      and program_id is null and percent is null))
);

create unique index if not exists uq_tms_fee_concession_rule_one_scheme_75
  on public.tms_fee_concession_rule (transport_year_id)
  where kind = 'scheme_75' and is_active;

alter table public.tms_fee_concession_rule enable row level security;
-- No policies: only the service role (API) reads or writes it.

create table if not exists public.tms_fee_concession_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.tms_fee_concession_rule(id),
  person_id uuid not null,
  transport_year_id uuid not null,
  terms jsonb not null,
  target_total numeric(12,2) not null,
  before jsonb not null,
  after jsonb not null,
  actions jsonb not null,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_tms_fee_concession_log_person
  on public.tms_fee_concession_log (person_id, transport_year_id);
alter table public.tms_fee_concession_log enable row level security;

alter table public.tms_fee_override
  add column if not exists concession_rule_id uuid
  references public.tms_fee_concession_rule(id) on delete set null;

-- Snapshot of every ledger row (+ money row, instalments, receipts) for a person/year.
create or replace function public.tms_fee_concession_snapshot(p_person_id uuid, p_year_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fee_bill', to_jsonb(fb),
        'student_bill', to_jsonb(sb),
        'instalments', (select jsonb_agg(to_jsonb(bi)) from billing_bill_instalments bi where bi.bill_id = sb.id),
        'receipts', (select jsonb_agg(to_jsonb(ri)) from billing_receipt_items ri where ri.bill_id = sb.id)
      ) order by fb.term_no)
      from tms_fee_bill fb
      left join billing_student_bills sb on sb.id = fb.billing_student_bill_id
      where fb.person_id = p_person_id and fb.transport_year_id = p_year_id
    ), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.term_no)
      from tms_fee_override o
      where o.person_id = p_person_id and o.transport_year_id = p_year_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.tms_apply_fee_concession(
  p_person_id uuid,
  p_rule_id uuid,
  p_terms jsonb,
  p_target_total numeric,
  p_reason text,
  p_actor uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rule public.tms_fee_concession_rule%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_term jsonb;
  v_row record;
  v_row_count int;
  v_target numeric;
  v_paid numeric;
  v_pending boolean;
  v_action text;
begin
  select * into v_rule from public.tms_fee_concession_rule where id = p_rule_id and is_active;
  if not found then
    raise exception 'Concession rule % is missing or inactive', p_rule_id;
  end if;
  if p_target_total is null or p_target_total <= 0 then
    raise exception 'Concession target total must be positive (got %)', p_target_total;
  end if;
  if jsonb_typeof(p_terms) <> 'array' or jsonb_array_length(p_terms) = 0 then
    raise exception 'Concession terms must be a non-empty array';
  end if;

  v_before := public.tms_fee_concession_snapshot(p_person_id, v_rule.transport_year_id);

  -- 1. Overrides first: without them cron 23 re-bills the full amount.
  for v_term in select * from jsonb_array_elements(p_terms) loop
    insert into public.tms_fee_override
      (person_id, person_type, transport_year_id, term_no, billable, amount, reason, created_by, concession_rule_id)
    values
      (p_person_id, 'learner', v_rule.transport_year_id, (v_term->>'term_no')::int,
       (v_term->>'billable')::boolean, (v_term->>'amount')::numeric, p_reason, p_actor, p_rule_id)
    on conflict (person_id, transport_year_id, term_no) do update
      set billable = excluded.billable,
          amount = excluded.amount,
          reason = excluded.reason,
          concession_rule_id = excluded.concession_rule_id,
          updated_at = now(),
          updated_by = p_actor;
  end loop;

  -- 2. Correct every existing ledger row for the year.
  select count(*) into v_row_count
  from public.tms_fee_bill
  where person_id = p_person_id and transport_year_id = v_rule.transport_year_id;

  for v_row in
    select fb.id as fb_id, fb.term_no, fb.amount as fb_amount, fb.status as fb_status,
           sb.id as sb_id, sb.final_amount, sb.status as sb_status
    from public.tms_fee_bill fb
    left join public.billing_student_bills sb on sb.id = fb.billing_student_bill_id
    where fb.person_id = p_person_id and fb.transport_year_id = v_rule.transport_year_id
    order by fb.term_no
    for update of fb
  loop
    if v_row.fb_status in ('cancelled', 'error') then
      raise exception 'CONCESSION_REVIEW: term % bill is %', v_row.term_no, v_row.fb_status;
    end if;
    if v_row.sb_id is null then
      raise exception 'CONCESSION_REVIEW: term % bill has no money row', v_row.term_no;
    end if;
    if v_row.sb_status = 'cancelled' then
      raise exception 'CONCESSION_REVIEW: term % money bill is cancelled', v_row.term_no;
    end if;

    select coalesce(sum(amount_paid), 0) into v_paid
    from public.billing_receipt_items where bill_id = v_row.sb_id;
    select exists (select 1 from public.payment_transaction_items where bill_id = v_row.sb_id)
      into v_pending;

    -- One folded bill carries the whole target; legacy per-term rows carry their own term.
    if v_row_count = 1 then
      v_target := p_target_total;
    else
      select case when (t->>'billable')::boolean then (t->>'amount')::numeric else null end
        into v_target
      from jsonb_array_elements(p_terms) t
      where (t->>'term_no')::int = v_row.term_no;
      if not found then
        raise exception 'CONCESSION_REVIEW: no target given for billed term %', v_row.term_no;
      end if;
    end if;

    if v_target is null then
      if v_paid > 0 or v_pending then
        raise exception 'CONCESSION_REVIEW: term % is not charged under the concession but already has a payment', v_row.term_no;
      end if;
      -- tms_fee_bill cannot be deleted directly; the FK cascade removes it.
      delete from public.billing_student_bills where id = v_row.sb_id;
      v_action := 'deleted';
    elsif v_row.final_amount = v_target then
      if v_row.fb_amount <> v_target then
        update public.tms_fee_bill set amount = v_target where id = v_row.fb_id;
        v_action := 'ledger_aligned';
      else
        v_action := 'unchanged';
      end if;
    elsif v_paid > 0 or v_pending then
      raise exception 'CONCESSION_REVIEW: term % has Rs % paid against Rs %; concession is Rs %',
        v_row.term_no, v_paid, v_row.final_amount, v_target;
    else
      update public.billing_student_bills
        set unit_amount = v_target, total_amount = v_target, final_amount = v_target
        where id = v_row.sb_id;
      update public.tms_fee_bill set amount = v_target where id = v_row.fb_id;
      v_action := 'repriced';
    end if;

    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'fee_bill_id', v_row.fb_id, 'term_no', v_row.term_no, 'action', v_action));
  end loop;

  v_after := public.tms_fee_concession_snapshot(p_person_id, v_rule.transport_year_id);

  insert into public.tms_fee_concession_log
    (rule_id, person_id, transport_year_id, terms, target_total, before, after, actions, actor)
  values
    (p_rule_id, p_person_id, v_rule.transport_year_id, p_terms, p_target_total, v_before, v_after, v_actions, p_actor);

  return jsonb_build_object('actions', v_actions);
end;
$$;

revoke execute on function public.tms_apply_fee_concession(uuid, uuid, jsonb, numeric, text, uuid) from public, anon, authenticated;
revoke execute on function public.tms_fee_concession_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tms_apply_fee_concession(uuid, uuid, jsonb, numeric, text, uuid) to service_role;
grant execute on function public.tms_fee_concession_snapshot(uuid, uuid) to service_role;

-- Permissions: transport_head only (the only custom role with tms.fees.* today).
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
  || '{"tms.fees.concession.view": true, "tms.fees.concession.apply": true}'::jsonb,
    updated_at = now()
where role_key = 'transport_head';

-- Seed 2026-2027 rules (idempotent by label).
insert into public.tms_fee_concession_rule (transport_year_id, kind, institution_id, admission_year, program_id, percent, label)
select '6b3768f9-c9fb-48d5-a955-41949983c3b0', 'final_year', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 2022,
       '0d980d34-f945-4de6-8c88-ee97b2620b99', 50, 'Pharmacy BPHARM 2022-2026'
where not exists (select 1 from public.tms_fee_concession_rule where label = 'Pharmacy BPHARM 2022-2026');

insert into public.tms_fee_concession_rule (transport_year_id, kind, institution_id, admission_year, percent, label)
select '6b3768f9-c9fb-48d5-a955-41949983c3b0', 'final_year', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 2023,
       50, 'Allied Health Sciences 2023 intake'
where not exists (select 1 from public.tms_fee_concession_rule where label = 'Allied Health Sciences 2023 intake');

insert into public.tms_fee_concession_rule (transport_year_id, kind, annual_amount, label)
select '6b3768f9-c9fb-48d5-a955-41949983c3b0', 'scheme_75', 500, '7.5% scholarship - Rs 500 per year'
where not exists (
  select 1 from public.tms_fee_concession_rule
  where transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0' and kind = 'scheme_75' and is_active);
```

- [ ] **Step 2: Check the bill-status trigger and the payment table exist before applying**

Run via Supabase `execute_sql`:
```sql
select to_regclass('public.payment_transaction_items') pti,
       (select count(*) from pg_trigger where tgname in ('update_bill_balance_on_amount_change','trg_bbi_rescale_on_amount_change')) trig;
```
Expected: `pti` not null, `trig` = 2. If a trigger name differs, stop and report.

- [ ] **Step 3: Apply the migration to the live DB**

Use Supabase `apply_migration` with name `fee_concessions` and the file's contents.

- [ ] **Step 4: Verify grants, seed and permissions**

```sql
select has_function_privilege('anon', 'public.tms_apply_fee_concession(uuid,uuid,jsonb,numeric,text,uuid)', 'execute') anon_exec,
       has_function_privilege('authenticated', 'public.tms_apply_fee_concession(uuid,uuid,jsonb,numeric,text,uuid)', 'execute') auth_exec,
       has_function_privilege('service_role', 'public.tms_apply_fee_concession(uuid,uuid,jsonb,numeric,text,uuid)', 'execute') svc_exec,
       (select count(*) from tms_fee_concession_rule) rules,
       (select permissions ? 'tms.fees.concession.apply' from custom_roles where role_key='transport_head') perm;
```
Expected: `false, false, true, 3, true`.

- [ ] **Step 5: Exercise the function inside rolled-back transactions**

Run each block separately; each must end in `rollback`. Use the Pharmacy rule id (`select id from tms_fee_concession_rule where label='Pharmacy BPHARM 2022-2026'`), substituted as `:rule`.

(a) Already applied, paid — PB22042 (`6ec3d35d-8f33-492a-bfcf-fa0bc0e82fa7`) → action `unchanged`:
```sql
begin;
select tms_apply_fee_concession('6ec3d35d-8f33-492a-bfcf-fa0bc0e82fa7', ':rule',
  '[{"term_no":1,"billable":true,"amount":2750}]', 2750, 'TEST', null);
rollback;
```
Expected: `{"actions":[{"action":"unchanged",…}]}`.

(b) Paid in full — KAMALESH PB22033: find id with `select id from learners_profiles where roll_number='PB22033'`, then:
```sql
begin;
select tms_apply_fee_concession('<kamalesh id>', ':rule',
  '[{"term_no":1,"billable":true,"amount":1500},{"term_no":2,"billable":true,"amount":1250}]', 2750, 'TEST', null);
rollback;
```
Expected: error starting `CONCESSION_REVIEW:`.

(c) Unpaid full bill — find a learner with a single unpaid, receipt-free Rs 5,500 bill in the year:
```sql
select fb.person_id, sb.id sb_id from tms_fee_bill fb join billing_student_bills sb on sb.id=fb.billing_student_bill_id
where fb.transport_year_id='6b3768f9-c9fb-48d5-a955-41949983c3b0' and fb.person_type='learner' and fb.amount=5500
  and sb.status='unpaid' and not exists (select 1 from billing_receipt_items ri where ri.bill_id=sb.id)
  and not exists (select 1 from payment_transaction_items p where p.bill_id=sb.id) limit 1;
```
Then:
```sql
begin;
select tms_apply_fee_concession('<person>', ':rule', '[{"term_no":1,"billable":true,"amount":2750}]', 2750, 'TEST', null);
select final_amount, balance_amount, (select sum(amount) from billing_bill_instalments where bill_id='<sb_id>') inst
from billing_student_bills where id='<sb_id>';
rollback;
```
Expected: action `repriced`; `2750, 2750, 2750`.

(d) Invalid input: `select tms_apply_fee_concession('<person>', ':rule', '[]', 2750, 'TEST', null);` inside `begin … rollback` → error "must be a non-empty array".

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260917120000_fee_concessions.sql
git commit -m "feat(fees): concession rules, audit log and apply function"
```

#### Task 1 amendment (after review): per-row targets

`20260917120000` is already applied live, so the fix is a NEW migration. It replaces the apply function with this signature (supersedes the Interfaces line above):

`tms_apply_fee_concession(p_person_id uuid, p_rule_id uuid, p_terms jsonb, p_row_targets jsonb, p_reason text, p_actor uuid) returns jsonb`

- `p_row_targets` = `[{"fee_bill_id": uuid, "target": number|null}]`, one entry per existing `tms_fee_bill` row of the person/year (empty array when the person has no bill). `null` target = delete that row.
- Returns the same `{"actions":[…]}`; review errors keep the `CONCESSION_REVIEW:` prefix.

- [ ] **Step A1: Write `supabase/migrations/20260917130000_fee_concessions_row_targets.sql`**

```sql
-- Fee Concession apply function, v2 (review of 20260917120000):
--  * targets are given PER EXISTING LEDGER ROW (p_row_targets), because ~900
--    learners hold legacy per-term rows (3000 + 2500) under structures that are
--    now single-term — per-structure-term targets marked them all "review";
--  * "payment activity" matches the live bill-delete guard: receipts, pending
--    transaction items, status other than 'unpaid', or a payment_date;
--  * the money row is locked before it is checked;
--  * input sanity: null / duplicate terms, duplicate rows, totals that disagree.
-- Concurrency: a ledger row the caller did not see (e.g. inserted by cron 23
-- while the admin was looking at the list) has no target and raises review.
-- A row inserted after this function's loop is not covered; the overrides are
-- written first, so the next generator run bills the concession amount and the
-- tab shows the stray bill as Needs fix again.

drop function if exists public.tms_apply_fee_concession(uuid, uuid, jsonb, numeric, text, uuid);

create or replace function public.tms_apply_fee_concession(
  p_person_id uuid,
  p_rule_id uuid,
  p_terms jsonb,
  p_row_targets jsonb,
  p_reason text,
  p_actor uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rule public.tms_fee_concession_rule%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_term jsonb;
  v_row record;
  v_sb record;
  v_terms_total numeric;
  v_rows_total numeric;
  v_target numeric;
  v_paid numeric;
  v_activity boolean;
  v_action text;
begin
  select * into v_rule from public.tms_fee_concession_rule where id = p_rule_id and is_active;
  if not found then
    raise exception 'Concession rule % is missing or inactive', p_rule_id;
  end if;
  if p_terms is null or jsonb_typeof(p_terms) <> 'array' or jsonb_array_length(p_terms) = 0 then
    raise exception 'Concession terms must be a non-empty array';
  end if;
  if p_row_targets is null or jsonb_typeof(p_row_targets) <> 'array' then
    raise exception 'Concession row targets must be an array';
  end if;
  if (select count(*) <> count(distinct (t->>'term_no')::int) from jsonb_array_elements(p_terms) t) then
    raise exception 'Concession terms repeat a term number';
  end if;
  if (select count(*) <> count(distinct (t->>'fee_bill_id')::uuid) from jsonb_array_elements(p_row_targets) t) then
    raise exception 'Concession row targets repeat a bill';
  end if;

  select coalesce(sum((t->>'amount')::numeric) filter (where (t->>'billable')::boolean), 0)
    into v_terms_total
  from jsonb_array_elements(p_terms) t;
  if v_terms_total <= 0 then
    raise exception 'Concession total must be positive (got %)', v_terms_total;
  end if;
  if jsonb_array_length(p_row_targets) > 0 then
    select coalesce(sum((t->>'target')::numeric), 0) into v_rows_total
    from jsonb_array_elements(p_row_targets) t;
    if v_rows_total <> v_terms_total then
      raise exception 'Row targets (%) do not add up to the concession total (%)', v_rows_total, v_terms_total;
    end if;
  end if;

  v_before := public.tms_fee_concession_snapshot(p_person_id, v_rule.transport_year_id);

  -- 1. Overrides first: without them cron 23 re-bills the full amount.
  for v_term in select * from jsonb_array_elements(p_terms) loop
    insert into public.tms_fee_override
      (person_id, person_type, transport_year_id, term_no, billable, amount, reason, created_by, concession_rule_id)
    values
      (p_person_id, 'learner', v_rule.transport_year_id, (v_term->>'term_no')::int,
       (v_term->>'billable')::boolean, (v_term->>'amount')::numeric, p_reason, p_actor, p_rule_id)
    on conflict (person_id, transport_year_id, term_no) do update
      set billable = excluded.billable,
          amount = excluded.amount,
          reason = excluded.reason,
          concession_rule_id = excluded.concession_rule_id,
          updated_at = now(),
          updated_by = p_actor;
  end loop;

  -- 2. Every target must name a live ledger row of this person and year.
  if exists (
    select 1 from jsonb_array_elements(p_row_targets) t
    where not exists (
      select 1 from public.tms_fee_bill fb
      where fb.id = (t->>'fee_bill_id')::uuid
        and fb.person_id = p_person_id
        and fb.transport_year_id = v_rule.transport_year_id)
  ) then
    raise exception 'CONCESSION_REVIEW: bills changed since the list was loaded - refresh and try again';
  end if;

  -- 3. Correct every existing ledger row.
  for v_row in
    select fb.id as fb_id, fb.term_no, fb.amount as fb_amount, fb.status as fb_status,
           fb.billing_student_bill_id as sb_id
    from public.tms_fee_bill fb
    where fb.person_id = p_person_id and fb.transport_year_id = v_rule.transport_year_id
    order by fb.term_no
    for update
  loop
    select (t->>'target')::numeric into v_target
    from jsonb_array_elements(p_row_targets) t
    where (t->>'fee_bill_id')::uuid = v_row.fb_id;
    if not found then
      raise exception 'CONCESSION_REVIEW: term % bill appeared after the list was loaded - refresh and try again', v_row.term_no;
    end if;

    if v_row.fb_status in ('cancelled', 'error') then
      raise exception 'CONCESSION_REVIEW: term % bill is %', v_row.term_no, v_row.fb_status;
    end if;
    if v_row.sb_id is null then
      raise exception 'CONCESSION_REVIEW: term % bill has no money row', v_row.term_no;
    end if;

    -- Lock the money row before judging it, so a payment cannot slip in between.
    select sb.id, sb.final_amount, sb.status, sb.payment_date into v_sb
    from public.billing_student_bills sb
    where sb.id = v_row.sb_id
    for update;
    if not found then
      raise exception 'CONCESSION_REVIEW: term % bill has no money row', v_row.term_no;
    end if;
    if v_sb.status = 'cancelled' then
      raise exception 'CONCESSION_REVIEW: term % money bill is cancelled', v_row.term_no;
    end if;

    select coalesce(sum(amount_paid), 0) into v_paid
    from public.billing_receipt_items where bill_id = v_sb.id;
    -- Same test as the live bill-delete guard (tms_fee_bill_cleanup_linked_billing).
    v_activity := v_paid > 0
      or v_sb.status is distinct from 'unpaid'
      or v_sb.payment_date is not null
      or exists (select 1 from public.payment_transaction_items where bill_id = v_sb.id);

    if v_target is null then
      if v_activity then
        raise exception 'CONCESSION_REVIEW: term % is not charged under the concession but has payment activity', v_row.term_no;
      end if;
      -- tms_fee_bill cannot be deleted directly; the FK cascade removes it.
      delete from public.billing_student_bills where id = v_sb.id;
      v_action := 'deleted';
    elsif v_sb.final_amount = v_target then
      if v_row.fb_amount <> v_target then
        update public.tms_fee_bill set amount = v_target where id = v_row.fb_id;
        v_action := 'ledger_aligned';
      else
        v_action := 'unchanged';
      end if;
    elsif v_activity then
      raise exception 'CONCESSION_REVIEW: term % has Rs % paid on a Rs % % bill; concession is Rs %',
        v_row.term_no, v_paid, v_sb.final_amount, v_sb.status, v_target;
    else
      update public.billing_student_bills
        set unit_amount = v_target, total_amount = v_target, final_amount = v_target
        where id = v_sb.id;
      update public.tms_fee_bill set amount = v_target where id = v_row.fb_id;
      v_action := 'repriced';
    end if;

    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'fee_bill_id', v_row.fb_id, 'term_no', v_row.term_no, 'action', v_action));
  end loop;

  v_after := public.tms_fee_concession_snapshot(p_person_id, v_rule.transport_year_id);

  insert into public.tms_fee_concession_log
    (rule_id, person_id, transport_year_id, terms, target_total, before, after, actions, actor)
  values
    (p_rule_id, p_person_id, v_rule.transport_year_id,
     jsonb_build_object('terms', p_terms, 'row_targets', p_row_targets),
     v_terms_total, v_before, v_after, v_actions, p_actor);

  return jsonb_build_object('actions', v_actions);
end;
$$;

revoke execute on function public.tms_apply_fee_concession(uuid, uuid, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.tms_apply_fee_concession(uuid, uuid, jsonb, jsonb, text, uuid) to service_role;
```

- [ ] **Step A2: Apply** with `apply_migration`, name `fee_concessions_row_targets`.

- [ ] **Step A3: Verify grants and that the old signature is gone**

```sql
select has_function_privilege('anon', 'public.tms_apply_fee_concession(uuid,uuid,jsonb,jsonb,text,uuid)', 'execute') anon_exec,
       has_function_privilege('authenticated', 'public.tms_apply_fee_concession(uuid,uuid,jsonb,jsonb,text,uuid)', 'execute') auth_exec,
       has_function_privilege('service_role', 'public.tms_apply_fee_concession(uuid,uuid,jsonb,jsonb,text,uuid)', 'execute') svc_exec,
       (select count(*) from pg_proc where proname = 'tms_apply_fee_concession') versions;
```
Expected: `false, false, true, 1`.

- [ ] **Step A4: Rolled-back tests** (each a single call ending in rollback, or a `do` block that raises to roll back; afterwards `select count(*) from tms_fee_override where reason='TEST'` = 0 and `select count(*) from tms_fee_concession_log` = 0). Use the Pharmacy rule id as `:rule`.

  (a) PB22042 (`6ec3d35d-8f33-492a-bfcf-fa0bc0e82fa7`), its single fee bill id as `:fb` (`select id from tms_fee_bill where person_id='6ec3d35d-8f33-492a-bfcf-fa0bc0e82fa7' and transport_year_id='6b3768f9-c9fb-48d5-a955-41949983c3b0'`):
  `tms_apply_fee_concession('6ec3d35d-…', ':rule', '[{"term_no":1,"billable":true,"amount":2750}]', '[{"fee_bill_id":":fb","target":2750}]', 'TEST', null)` → `unchanged`.

  (b) Legacy two-row unpaid learner — find one:
```sql
select fb.person_id,
       max(fb.id::text) filter (where fb.term_no=1) fb1, max(fb.id::text) filter (where fb.term_no=2) fb2,
       max(fb.billing_student_bill_id::text) filter (where fb.term_no=1) sb1, max(fb.billing_student_bill_id::text) filter (where fb.term_no=2) sb2
from tms_fee_bill fb join billing_student_bills sb on sb.id = fb.billing_student_bill_id
where fb.transport_year_id='6b3768f9-c9fb-48d5-a955-41949983c3b0' and fb.person_type='learner'
group by fb.person_id
having count(*)=2 and bool_and(sb.status='unpaid' and sb.payment_date is null and fb.status='generated')
   and sum(fb.amount)=5500 and min(fb.term_no)=1 and max(fb.term_no)=2
   and not exists (select 1 from billing_receipt_items ri where ri.bill_id::text in (max(fb.billing_student_bill_id::text) filter (where fb.term_no=1), max(fb.billing_student_bill_id::text) filter (where fb.term_no=2)))
limit 1;
```
  (if the HAVING subquery form is rejected, drop that line and check receipts/payment_transaction_items for the two sb ids separately before using the person). Call with terms `[{"term_no":1,"billable":true,"amount":2750}]` and row targets `fb1→1500, fb2→1250` → two `repriced`; in the same transaction `select id, final_amount, balance_amount from billing_student_bills where id in (sb1, sb2)` → 1500/1500 and 1250/1250.

  (c) Same person, scheme-style: terms `[{"term_no":1,"billable":true,"amount":500}]`, row targets `fb1→500, fb2→null` (the scheme rule id as `:rule`) → `repriced` + `deleted`; in the same transaction `select count(*) from tms_fee_bill where id=fb2` = 0 and `select count(*) from billing_student_bills where id=sb2` = 0.

  (d) Same person, row targets only `fb1→2750` (fb2 missing) with terms 2750 → error `CONCESSION_REVIEW: term 2 bill appeared after …`.

  (e) Row targets `fb1→1500, fb2→1000` with terms 2750 → error "do not add up".

  (f) Terms `[{"term_no":1,…},{"term_no":1,…}]` → error "repeat a term number".

- [ ] **Step A5: Commit**

```bash
git add supabase/migrations/20260917130000_fee_concessions_row_targets.sql
git commit -m "fix(fees): apply concession per ledger row with stronger payment guard"
```

---

### Task 2: Pure concession logic

**Files:**
- Create: `lib/fees/concession-math.ts`
- Test: `lib/fees/concession-math.test.ts`

**Interfaces:**
- Consumes: `BillableTerm` from `lib/fees/resolve-terms.ts`; `TermOverride` from `lib/fees/overrides.ts`.
- Produces:
```ts
export type ConcessionKind = 'final_year' | 'scheme_75';
export type ConcessionStatus = 'applied' | 'needs_fix' | 'review' | 'unresolved';
export interface ConcessionRule {
  id: string; transport_year_id: string; kind: ConcessionKind;
  institution_id: string | null; admission_year: number | null; program_id: string | null;
  percent: number | null; annual_amount: number | null;
  is_active: boolean; label: string; created_at: string;
}
export interface RuleSubject { institution_id: string | null; admission_year: number | null; program_id: string | null; scholarship_type: string | null; }
export interface LedgerState {
  feeBillId: string; termNo: number; ledgerAmount: number; ledgerStatus: string;
  moneyBillId: string | null; moneyFinal: number | null; moneyStatus: string | null;
  paid: number; pendingPayment: boolean;
}
export const SCHEME_75_SCHOLARSHIP = '7.5% SCHOLARSHIP';
export function matchRule(rules: ConcessionRule[], kind: ConcessionKind, s: RuleSubject): ConcessionRule | null;
export function targetTerms(rule: ConcessionRule, full: BillableTerm[]): TermOverride[];
export function targetTotal(terms: TermOverride[]): number;
export function rowTargets(kind: ConcessionKind, total: number, ledger: LedgerState[]): Map<string, number | null> | null; // key = feeBillId; null value = delete the row; null result = cannot split
export function hasPaymentActivity(row: LedgerState): boolean;
export function classifyConcession(input: { kind: ConcessionKind; terms: TermOverride[]; total: number; overrides: TermOverride[]; ledger: LedgerState[] }): { status: Exclude<ConcessionStatus, 'unresolved'>; reason: string | null };
```
`LedgerState.pendingPayment` is true when the money row has any `payment_transaction_items` row OR a non-null `payment_date` (the loader folds both in).

**Amendment (ledger ruling, Task 1 review):** 919 learners hold legacy per-term ledgers (term 1 Rs 3,000 + term 2 Rs 2,500) under structures that are now single-term. Targets are therefore computed **per existing ledger row**, not per structure term:
- one row (or none): the row carries the whole target total;
- `final_year`, several rows: split the total in proportion to each row's `ledgerAmount` (rows ordered by `termNo`; each `Math.round`, the last row takes the remainder); if the ledger amounts sum to ≤ 0 → cannot split (`null`);
- `scheme_75`, several rows: the lowest-`termNo` row carries the total, every other row → `null` (delete).
"Payment activity" (blocks reprice/delete) = `paid > 0 || pendingPayment || moneyStatus !== 'unpaid'`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/fees/concession-math.test.ts
import { describe, it, expect } from 'vitest';
import {
  matchRule, targetTerms, targetTotal, rowTargets, hasPaymentActivity, classifyConcession,
  type ConcessionRule, type LedgerState,
} from './concession-math';
import type { BillableTerm } from './resolve-terms';

const rule = (p: Partial<ConcessionRule>): ConcessionRule => ({
  id: 'r1', transport_year_id: 'y', kind: 'final_year', institution_id: 'pharm',
  admission_year: 2022, program_id: null, percent: 50, annual_amount: null,
  is_active: true, label: 'x', created_at: '2026-09-17T00:00:00Z', ...p,
});
const term = (term_no: number, amount: number): BillableTerm =>
  ({ term_no, term_label: `Term ${term_no}`, amount, due_date: `2026-0${term_no + 6}-31` });
const bill = (p: Partial<LedgerState>): LedgerState => ({
  feeBillId: 'fb', termNo: 1, ledgerAmount: 5500, ledgerStatus: 'generated',
  moneyBillId: 'sb', moneyFinal: 5500, moneyStatus: 'unpaid', paid: 0, pendingPayment: false, ...p,
});
const subject = { institution_id: 'pharm', admission_year: 2022, program_id: 'bpharm', scholarship_type: null };

describe('matchRule', () => {
  it('matches institution + admission year, ignoring program when rule has none', () => {
    expect(matchRule([rule({})], 'final_year', subject)?.id).toBe('r1');
  });
  it('requires program when the rule sets one', () => {
    expect(matchRule([rule({ program_id: 'pharmd' })], 'final_year', subject)).toBeNull();
  });
  it('skips inactive rules and picks the earliest created match', () => {
    const rules = [
      rule({ id: 'late', created_at: '2026-09-18T00:00:00Z' }),
      rule({ id: 'off', is_active: false, created_at: '2026-09-01T00:00:00Z' }),
      rule({ id: 'early', created_at: '2026-09-10T00:00:00Z' }),
    ];
    expect(matchRule(rules, 'final_year', subject)?.id).toBe('early');
  });
  it('scheme_75 matches on scholarship_type only', () => {
    const r = rule({ id: 's', kind: 'scheme_75', institution_id: null, admission_year: null, percent: null, annual_amount: 500 });
    expect(matchRule([r], 'scheme_75', { ...subject, scholarship_type: '7.5% SCHOLARSHIP' })?.id).toBe('s');
    expect(matchRule([r], 'scheme_75', { ...subject, scholarship_type: 'NOT APPLICABLE' })).toBeNull();
  });
});

describe('targetTerms', () => {
  it('final_year halves every term, rounded to the rupee', () => {
    expect(targetTerms(rule({}), [term(1, 3001), term(2, 2500)])).toEqual([
      { term_no: 1, billable: true, amount: 1501 },
      { term_no: 2, billable: true, amount: 1250 },
    ]);
  });
  it('scheme_75 charges the annual amount on the first term and drops the rest', () => {
    const r = rule({ kind: 'scheme_75', percent: null, annual_amount: 500 });
    expect(targetTerms(r, [term(2, 2500), term(1, 3000)])).toEqual([
      { term_no: 1, billable: true, amount: 500 },
      { term_no: 2, billable: false, amount: null },
    ]);
  });
  it('targetTotal sums billable terms only', () => {
    expect(targetTotal([{ term_no: 1, billable: true, amount: 500 }, { term_no: 2, billable: false, amount: null }])).toBe(500);
  });
});

describe('rowTargets', () => {
  it('no rows → empty map; one row carries the whole total', () => {
    expect(rowTargets('final_year', 2750, [])).toEqual(new Map());
    expect(rowTargets('scheme_75', 500, [bill({ feeBillId: 'a' })])).toEqual(new Map([['a', 500]]));
  });
  it('final_year splits legacy rows in proportion to ledger amounts, last row takes the remainder', () => {
    const rows = [bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 2500 }), bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 3000 })];
    expect(rowTargets('final_year', 2750, rows)).toEqual(new Map([['a', 1500], ['b', 1250]]));
    expect(rowTargets('final_year', 2751, rows)).toEqual(new Map([['a', 1501], ['b', 1250]]));
  });
  it('final_year keeps the same split once already applied (proportions unchanged)', () => {
    const rows = [bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 1500 }), bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 1250 })];
    expect(rowTargets('final_year', 2750, rows)).toEqual(new Map([['a', 1500], ['b', 1250]]));
  });
  it('final_year cannot split zero-amount rows', () => {
    const rows = [bill({ feeBillId: 'a', ledgerAmount: 0 }), bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 0 })];
    expect(rowTargets('final_year', 2750, rows)).toBeNull();
  });
  it('scheme_75 keeps the lowest term and deletes the rest', () => {
    const rows = [bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 2500 }), bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 3000 })];
    expect(rowTargets('scheme_75', 500, rows)).toEqual(new Map([['a', 500], ['b', null]]));
  });
});

describe('hasPaymentActivity', () => {
  it('is true for receipts, pending payments, or any non-unpaid money status', () => {
    expect(hasPaymentActivity(bill({}))).toBe(false);
    expect(hasPaymentActivity(bill({ paid: 1 }))).toBe(true);
    expect(hasPaymentActivity(bill({ pendingPayment: true }))).toBe(true);
    expect(hasPaymentActivity(bill({ moneyStatus: 'partially_paid' }))).toBe(true);
    expect(hasPaymentActivity(bill({ moneyStatus: 'paid' }))).toBe(true);
  });
});

describe('classifyConcession', () => {
  const half = [{ term_no: 1, billable: true, amount: 2750 }];
  const fy = (overrides: typeof half, ledger: LedgerState[]) =>
    classifyConcession({ kind: 'final_year', terms: half, total: 2750, overrides, ledger });
  it('no bill and matching overrides → applied', () => {
    expect(fy(half, []).status).toBe('applied');
  });
  it('no bill and no overrides → needs_fix', () => {
    expect(fy([], []).status).toBe('needs_fix');
  });
  it('unpaid full bill → needs_fix', () => {
    expect(fy([], [bill({})]).status).toBe('needs_fix');
  });
  it('money already at target but ledger stale → needs_fix (PB22042 shape)', () => {
    expect(fy([], [bill({ moneyFinal: 2750, moneyStatus: 'paid', paid: 2750 })]).status).toBe('needs_fix');
  });
  it('fully aligned paid bill with overrides → applied', () => {
    expect(fy(half, [bill({ ledgerAmount: 2750, moneyFinal: 2750, moneyStatus: 'paid', paid: 2750 })]).status).toBe('applied');
  });
  it('paid more than the concession → review with a reason (KAMALESH shape)', () => {
    const r = fy([], [bill({ moneyStatus: 'paid', paid: 5500 })]);
    expect(r.status).toBe('review');
    expect(r.reason).toContain('5500');
  });
  it('paid status without receipts, or a pending payment, on a wrong-amount bill → review', () => {
    expect(fy([], [bill({ moneyStatus: 'paid' })]).status).toBe('review');
    expect(fy([], [bill({ pendingPayment: true })]).status).toBe('review');
  });
  it('cancelled bill or missing money row → review', () => {
    expect(fy(half, [bill({ ledgerStatus: 'cancelled' })]).status).toBe('review');
    expect(fy(half, [bill({ moneyStatus: 'cancelled' })]).status).toBe('review');
    expect(fy(half, [bill({ moneyBillId: null, moneyFinal: null, moneyStatus: null })]).status).toBe('review');
  });
  it('final_year legacy two-row unpaid ledger → needs_fix, then applied once split', () => {
    const before = [
      bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 3000, moneyFinal: 3000 }),
      bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 2500, moneyFinal: 2500 }),
    ];
    expect(fy(half, before).status).toBe('needs_fix');
    const after = [
      bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 1500, moneyFinal: 1500 }),
      bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 1250, moneyFinal: 1250 }),
    ];
    expect(fy(half, after).status).toBe('applied');
  });
  it('final_year zero-amount legacy rows → review', () => {
    const rows = [bill({ feeBillId: 'a', ledgerAmount: 0 }), bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 0 })];
    expect(fy(half, rows).status).toBe('review');
  });
  it('7.5%: unpaid legacy term-2 row → needs_fix; paid term-2 row → review', () => {
    const t = [{ term_no: 1, billable: true, amount: 500 }];
    const t1 = bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 3000, moneyFinal: 500, moneyStatus: 'paid', paid: 500 });
    const run = (ledger: LedgerState[]) =>
      classifyConcession({ kind: 'scheme_75', terms: t, total: 500, overrides: t, ledger });
    expect(run([t1, bill({ feeBillId: 'b', termNo: 2, moneyFinal: 2500, ledgerAmount: 2500 })]).status).toBe('needs_fix');
    expect(run([t1, bill({ feeBillId: 'b', termNo: 2, moneyFinal: 2500, ledgerAmount: 2500, paid: 2500, moneyStatus: 'paid' })]).status).toBe('review');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/fees/concession-math.test.ts`
Expected: FAIL — cannot resolve `./concession-math`.

- [ ] **Step 3: Implement**

```ts
// lib/fees/concession-math.ts
// Pure decisions for the Fee Concession tab: who a rule covers, what they should
// be charged, and whether their overrides + bills already say so. The apply
// function (tms_apply_fee_concession) re-checks bill state itself; this module
// only decides what the list SHOWS and which rows are selectable.

import type { BillableTerm } from './resolve-terms';
import type { TermOverride } from './overrides';

export type ConcessionKind = 'final_year' | 'scheme_75';
export type ConcessionStatus = 'applied' | 'needs_fix' | 'review' | 'unresolved';

export const SCHEME_75_SCHOLARSHIP = '7.5% SCHOLARSHIP';

export interface ConcessionRule {
  id: string;
  transport_year_id: string;
  kind: ConcessionKind;
  institution_id: string | null;
  admission_year: number | null;
  program_id: string | null;
  percent: number | null;
  annual_amount: number | null;
  is_active: boolean;
  label: string;
  created_at: string;
}

export interface RuleSubject {
  institution_id: string | null;
  admission_year: number | null;
  program_id: string | null;
  scholarship_type: string | null;
}

export interface LedgerState {
  feeBillId: string;
  termNo: number;
  ledgerAmount: number;
  ledgerStatus: string;
  moneyBillId: string | null;
  moneyFinal: number | null;
  moneyStatus: string | null;
  paid: number;
  pendingPayment: boolean;
}

export function matchRule(
  rules: ConcessionRule[],
  kind: ConcessionKind,
  s: RuleSubject
): ConcessionRule | null {
  const hits = rules
    .filter((r) => r.is_active && r.kind === kind)
    .filter((r) =>
      kind === 'scheme_75'
        ? s.scholarship_type === SCHEME_75_SCHOLARSHIP
        : r.institution_id === s.institution_id &&
          r.admission_year === s.admission_year &&
          (r.program_id === null || r.program_id === s.program_id)
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return hits[0] ?? null;
}

export function targetTerms(rule: ConcessionRule, full: BillableTerm[]): TermOverride[] {
  const ordered = [...full].sort((a, b) => a.term_no - b.term_no);
  if (rule.kind === 'scheme_75') {
    return ordered.map((t, i) =>
      i === 0
        ? { term_no: t.term_no, billable: true, amount: Number(rule.annual_amount) }
        : { term_no: t.term_no, billable: false, amount: null }
    );
  }
  const pct = Number(rule.percent);
  return ordered.map((t) => ({
    term_no: t.term_no,
    billable: true,
    amount: Math.round((Number(t.amount) * pct) / 100),
  }));
}

export function targetTotal(terms: TermOverride[]): number {
  return terms.reduce((s, t) => s + (t.billable && t.amount !== null ? t.amount : 0), 0);
}

/**
 * What each EXISTING ledger row should carry, keyed by fee bill id. Newer
 * learners have one folded bill holding the whole year; ~900 learners billed
 * before the fold still hold one row per term (3000 + 2500) under structures
 * that are now single-term, so targets follow the rows, not the structure.
 *   final_year: split in proportion to the rows' ledger amounts (last row takes
 *               the remainder) — proportions survive an apply, so it is stable.
 *   scheme_75:  the lowest term keeps the whole amount; other rows → null (delete).
 * Returns null when a split is impossible (legacy rows summing to 0).
 */
export function rowTargets(
  kind: ConcessionKind,
  total: number,
  ledger: LedgerState[]
): Map<string, number | null> | null {
  const rows = [...ledger].sort((a, b) => a.termNo - b.termNo);
  const out = new Map<string, number | null>();
  if (rows.length <= 1) {
    for (const r of rows) out.set(r.feeBillId, total);
    return out;
  }
  if (kind === 'scheme_75') {
    rows.forEach((r, i) => out.set(r.feeBillId, i === 0 ? total : null));
    return out;
  }
  const sum = rows.reduce((s, r) => s + r.ledgerAmount, 0);
  if (sum <= 0) return null;
  let assigned = 0;
  rows.forEach((r, i) => {
    const part = i === rows.length - 1 ? total - assigned : Math.round((total * r.ledgerAmount) / sum);
    assigned += part;
    out.set(r.feeBillId, part);
  });
  return out;
}

/** Any sign money has moved (or is moving) on the row's money bill. */
export function hasPaymentActivity(row: LedgerState): boolean {
  return row.paid > 0 || row.pendingPayment || row.moneyStatus !== 'unpaid';
}

function overridesMatch(target: TermOverride[], existing: TermOverride[]): boolean {
  return target.every((t) => {
    const o = existing.find((e) => e.term_no === t.term_no);
    if (!o || o.billable !== t.billable) return false;
    return t.billable ? Number(o.amount) === t.amount : true;
  });
}

export function classifyConcession(input: {
  kind: ConcessionKind;
  terms: TermOverride[];
  total: number;
  overrides: TermOverride[];
  ledger: LedgerState[];
}): { status: Exclude<ConcessionStatus, 'unresolved'>; reason: string | null } {
  const targets = rowTargets(input.kind, input.total, input.ledger);
  if (!targets) {
    return { status: 'review', reason: 'Existing term bills have no amount to split the concession across' };
  }
  let needsFix = false;
  for (const row of input.ledger) {
    if (row.ledgerStatus === 'cancelled' || row.ledgerStatus === 'error') {
      return { status: 'review', reason: `Term ${row.termNo} bill is ${row.ledgerStatus}` };
    }
    if (!row.moneyBillId || row.moneyFinal === null) {
      return { status: 'review', reason: `Term ${row.termNo} bill has no money row` };
    }
    if (row.moneyStatus === 'cancelled') {
      return { status: 'review', reason: `Term ${row.termNo} money bill is cancelled` };
    }
    const target = targets.get(row.feeBillId) ?? null;
    if (target === null) {
      if (hasPaymentActivity(row)) {
        return { status: 'review', reason: `Term ${row.termNo} is not charged under the concession but Rs ${row.paid} is already paid` };
      }
      needsFix = true;
    } else if (row.moneyFinal === target) {
      if (row.ledgerAmount !== target) needsFix = true;
    } else if (hasPaymentActivity(row)) {
      return {
        status: 'review',
        reason: `Rs ${row.paid} paid against a Rs ${row.moneyFinal} ${row.moneyStatus} bill; concession is Rs ${target} — accounts decision`,
      };
    } else {
      needsFix = true;
    }
  }
  if (needsFix || !overridesMatch(input.terms, input.overrides)) {
    return { status: 'needs_fix', reason: null };
  }
  return { status: 'applied', reason: null };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/fees/concession-math.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/concession-math.ts lib/fees/concession-math.test.ts
git commit -m "feat(fees): pure concession matching, targets and status"
```

---

### Task 3: Rule input validation

**Files:**
- Create: `lib/fees/concession-rules.ts`
- Test: `lib/fees/concession-rules.test.ts`

**Interfaces:**
- Consumes: `ConcessionKind` from Task 2.
- Produces:
```ts
export interface RuleWrite {
  kind: ConcessionKind; institution_id: string | null; admission_year: number | null;
  program_id: string | null; percent: number | null; annual_amount: number | null;
  label: string; is_active: boolean;
}
export function parseRuleInput(body: unknown): { ok: true; value: RuleWrite } | { ok: false; error: string };
```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/fees/concession-rules.test.ts
import { describe, it, expect } from 'vitest';
import { parseRuleInput } from './concession-rules';

describe('parseRuleInput', () => {
  it('accepts a final_year rule and clears annual_amount', () => {
    const r = parseRuleInput({ kind: 'final_year', institution_id: 'i', admission_year: '2022', percent: 50, label: ' Pharm ', annual_amount: 9 });
    expect(r).toEqual({ ok: true, value: {
      kind: 'final_year', institution_id: 'i', admission_year: 2022, program_id: null,
      percent: 50, annual_amount: null, label: 'Pharm', is_active: true,
    } });
  });
  it('rejects final_year without institution, year, or with percent out of range', () => {
    expect(parseRuleInput({ kind: 'final_year', admission_year: 2022, percent: 50, label: 'x' }).ok).toBe(false);
    expect(parseRuleInput({ kind: 'final_year', institution_id: 'i', percent: 50, label: 'x' }).ok).toBe(false);
    expect(parseRuleInput({ kind: 'final_year', institution_id: 'i', admission_year: 2022, percent: 100, label: 'x' }).ok).toBe(false);
  });
  it('accepts scheme_75 and clears cohort fields', () => {
    const r = parseRuleInput({ kind: 'scheme_75', annual_amount: '500', label: '7.5%', institution_id: 'i' });
    expect(r).toEqual({ ok: true, value: {
      kind: 'scheme_75', institution_id: null, admission_year: null, program_id: null,
      percent: null, annual_amount: 500, label: '7.5%', is_active: true,
    } });
  });
  it('rejects scheme_75 with a non-positive amount, unknown kinds and blank labels', () => {
    expect(parseRuleInput({ kind: 'scheme_75', annual_amount: 0, label: 'x' }).ok).toBe(false);
    expect(parseRuleInput({ kind: 'other', label: 'x' }).ok).toBe(false);
    expect(parseRuleInput({ kind: 'scheme_75', annual_amount: 500, label: '  ' }).ok).toBe(false);
  });
  it('honours is_active=false', () => {
    const r = parseRuleInput({ kind: 'scheme_75', annual_amount: 500, label: 'x', is_active: false });
    expect(r.ok && r.value.is_active).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/fees/concession-rules.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// lib/fees/concession-rules.ts
// Write whitelist + validation for tms_fee_concession_rule. Mirrors the table's
// CHECK constraints so the API returns a readable 400 instead of a 23514.

import type { ConcessionKind } from './concession-math';

export interface RuleWrite {
  kind: ConcessionKind;
  institution_id: string | null;
  admission_year: number | null;
  program_id: string | null;
  percent: number | null;
  annual_amount: number | null;
  label: string;
  is_active: boolean;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseRuleInput(
  body: unknown
): { ok: true; value: RuleWrite } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const label = str(b.label);
  if (!label) return { ok: false, error: 'Label is required.' };
  const is_active = b.is_active === undefined ? true : b.is_active === true;

  if (b.kind === 'final_year') {
    const institution_id = str(b.institution_id);
    const admission_year = num(b.admission_year);
    const percent = num(b.percent);
    if (!institution_id) return { ok: false, error: 'College is required.' };
    if (admission_year === null || !Number.isInteger(admission_year)) {
      return { ok: false, error: 'Admission year is required.' };
    }
    if (percent === null || percent <= 0 || percent >= 100) {
      return { ok: false, error: 'Percent must be between 0 and 100.' };
    }
    return { ok: true, value: {
      kind: 'final_year', institution_id, admission_year, program_id: str(b.program_id),
      percent, annual_amount: null, label, is_active,
    } };
  }

  if (b.kind === 'scheme_75') {
    const annual_amount = num(b.annual_amount);
    if (annual_amount === null || annual_amount <= 0) {
      return { ok: false, error: 'Annual amount must be greater than 0.' };
    }
    return { ok: true, value: {
      kind: 'scheme_75', institution_id: null, admission_year: null, program_id: null,
      percent: null, annual_amount, label, is_active,
    } };
  }

  return { ok: false, error: 'Unknown concession kind.' };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/fees/concession-rules.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/concession-rules.ts lib/fees/concession-rules.test.ts
git commit -m "feat(fees): validate concession rule input"
```

---

### Task 4: Extract `loadResolveContext` from the generator

**Files:**
- Create: `lib/fees/structure-context.ts`
- Modify: `lib/fees/generate.ts` (the block from `const { data: ty } = await svc.from('tms_transport_year')` through the end of the `if (isStopWise) { … stop rates … }` block, currently ~lines 106-231)

**Interfaces:**
- Consumes: `ResolveContext`, `ResolveBand`, `StopScheduleTerm`, `BillableTerm` from `lib/fees/resolve-terms.ts`; `currentYearOf` from `lib/fees/year-of-study.ts`.
- Produces:
```ts
export interface StructureContext {
  ctx: ResolveContext;          // feeMode, currentYear, flatTerms, bands, stopTerms?, stopRateByStopId?
  tyStart: string | null;
  tyName: string | null;
}
export async function loadResolveContext(
  svc: SupabaseClient,
  fs: { id: string; fee_mode: FeeMode; transport_year_id: string }
): Promise<{ ok: true; value: StructureContext } | { ok: false; status: number; error: string }>;
```

- [ ] **Step 1: Run the existing generator tests to record the baseline**

Run: `npx vitest run lib/fees`
Expected: PASS (note the count).

- [ ] **Step 2: Create `lib/fees/structure-context.ts`** by moving the existing code verbatim (same queries, same error strings), returning values instead of assigning locals:

```ts
// lib/fees/structure-context.ts
// Everything resolvePersonTerms needs for ONE fee structure: its terms / bands /
// stop schedule + rates, and the transport year's start (for year of study).
// Extracted from generate.ts so the Fee Concession tab prices people exactly as
// the generator does. Error strings are the generator's, unchanged.

import type { SupabaseClient } from '@supabase/supabase-js';
import { currentYearOf } from './year-of-study';
import type { FeeMode } from './types';
import type { BillableTerm, ResolveBand, ResolveContext, StopScheduleTerm } from './resolve-terms';

export interface StructureContext {
  ctx: ResolveContext;
  tyStart: string | null;
  tyName: string | null;
}

type Fail = { ok: false; status: number; error: string };

export async function loadResolveContext(
  svc: SupabaseClient,
  fs: { id: string; fee_mode: FeeMode; transport_year_id: string }
): Promise<{ ok: true; value: StructureContext } | Fail> {
  const id = fs.id;
  const isTiered = fs.fee_mode === 'tiered';
  const isStopWise = fs.fee_mode === 'stop_wise';

  const { data: ty } = await svc
    .from('tms_transport_year')
    .select('start_date, name')
    .eq('id', fs.transport_year_id)
    .maybeSingle();
  const tyStart: string | null = ty?.start_date ?? null;
  const tyName: string | null = (ty as { name?: string } | null)?.name ?? null;
  const currentYear = currentYearOf(tyStart);

  let flatTerms: BillableTerm[] = [];
  let bands: ResolveBand[] = [];
  // <<< paste the tiered / flat branch from generate.ts here unchanged, with
  //     `return { ok: false, status: 400, error: … }` statements kept as-is and
  //     `Term`/`Band` replaced by BillableTerm/ResolveBand >>>

  const stopTerms: StopScheduleTerm[] = [];
  const stopRateByStopId = new Map<string, number>();
  // <<< paste the `if (isStopWise) { … }` block from generate.ts here unchanged >>>

  return {
    ok: true,
    value: {
      tyStart,
      tyName,
      ctx: {
        feeMode: fs.fee_mode,
        currentYear,
        flatTerms,
        bands,
        stopTerms: isStopWise ? stopTerms : undefined,
        stopRateByStopId: isStopWise ? stopRateByStopId : undefined,
      },
    },
  };
}
```

The two `<<< paste … >>>` markers are literal move instructions, not placeholders to design: cut those exact blocks (with their comments) out of `generate.ts` and paste them here. Check `Term`/`Band` in generate.ts first (`grep -n "type Term\|type Band\|interface Band" lib/fees/generate.ts`); if `Band` has extra fields (e.g. `band_order`), type `bands` as that shape by importing/exporting it from generate.ts's types instead of `ResolveBand`, and keep `ctx.bands` assignment compatible.

- [ ] **Step 3: Replace the moved block in `generate.ts`**

```ts
    const loaded = await loadResolveContext(svc, fs);
    if (!loaded.ok) return loaded;
    const { tyStart, tyName } = loaded.value;
    const { currentYear, flatTerms, bands } = loaded.value.ctx;
    const stopTerms = loaded.value.ctx.stopTerms ?? [];
    const stopRateByStopId = loaded.value.ctx.stopRateByStopId ?? new Map<string, number>();
```
and add `import { loadResolveContext } from './structure-context';`. Keep `isTiered`/`isStopWise` declarations in generate.ts (used later). Remove imports that became unused (`currentYearOf` only if nothing else uses it).

- [ ] **Step 4: Run tests** — `npx vitest run lib/fees` → same PASS count as Step 1.

- [ ] **Step 5: Scoped typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "lib/fees/(generate|structure-context)\.ts"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/fees/structure-context.ts lib/fees/generate.ts
git commit -m "refactor(fees): extract loadResolveContext from the bill generator"
```

---

### Task 5: Concession loader and apply orchestration

**Files:**
- Create: `lib/fees/concessions.ts`
- Test: `lib/fees/concessions.test.ts`

**Interfaces:**
- Consumes: Task 2 (`matchRule`, `targetTerms`, `targetTotal`, `classifyConcession`, types), Task 4 (`loadResolveContext`), `resolveApplicablePeople` (`lib/fees/applicability.ts`), `resolvePersonTerms` (`lib/fees/resolve-terms.ts`), `selectByIds` (`lib/supabase/chunked.ts`).
- Produces:
```ts
export interface ConcessionRow {
  personId: string; rollNumber: string | null; name: string;
  institutionName: string | null; programName: string | null; admissionYear: number | null;
  ruleId: string | null; ruleLabel: string | null;
  fullTotal: number | null; targetTotal: number | null;
  billAmount: number | null; paidAmount: number; billStatus: string | null;
  status: ConcessionStatus; reason: string | null;
  terms: TermOverride[];            // target terms (empty when unresolved)
  rowTargets: Array<{ fee_bill_id: string; target: number | null }>; // per existing ledger row (empty when unresolved / no bill)
}
export interface ConcessionList {
  rows: ConcessionRow[];
  counts: Record<ConcessionStatus, number>;
  rules: ConcessionRule[];
}
export async function loadConcessionRows(svc: SupabaseClient, opts: { transportYearId: string; kind: ConcessionKind; personIds?: string[] }): Promise<ConcessionList>;
export type ApplyOutcome = 'repriced' | 'ledger_aligned' | 'override_only' | 'unchanged' | 'review' | 'skipped' | 'error';
export interface ApplyResult { personId: string; name: string; outcome: ApplyOutcome; message: string | null }
export function summariseActions(actions: Array<{ action: string }>): ApplyOutcome;
export function reviewMessage(message: string): string | null; // text after "CONCESSION_REVIEW:", else null
export async function applyConcessions(svc: SupabaseClient, opts: { transportYearId: string; kind: ConcessionKind; personIds: string[]; actorId: string; today: string }): Promise<ApplyResult[]>;
export const MAX_APPLY = 200;
```

- [ ] **Step 1: Write failing tests** (pure pieces + the RPC error mapping, using the fake client)

```ts
// lib/fees/concessions.test.ts
import { describe, it, expect } from 'vitest';
import { summariseActions, reviewMessage } from './concessions';

describe('summariseActions', () => {
  it('no bill → override_only', () => expect(summariseActions([])).toBe('override_only'));
  it('any repriced or deleted row wins', () => {
    expect(summariseActions([{ action: 'unchanged' }, { action: 'repriced' }])).toBe('repriced');
    expect(summariseActions([{ action: 'ledger_aligned' }, { action: 'deleted' }])).toBe('repriced');
  });
  it('ledger_aligned beats unchanged', () => {
    expect(summariseActions([{ action: 'unchanged' }, { action: 'ledger_aligned' }])).toBe('ledger_aligned');
    expect(summariseActions([{ action: 'unchanged' }])).toBe('unchanged');
  });
});

describe('reviewMessage', () => {
  it('extracts the review text from a CONCESSION_REVIEW error', () => {
    expect(reviewMessage('CONCESSION_REVIEW: term 1 has Rs 5500 paid')).toBe('term 1 has Rs 5500 paid');
  });
  it('returns null for other errors', () => {
    expect(reviewMessage('permission denied')).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run lib/fees/concessions.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/fees/concessions.ts
// Fee Concession tab: who qualifies, what they should pay, and applying it.
// Prices people with the generator's own resolvePersonTerms (overrides OFF) so
// the tab and the bill cron can never disagree about the full fee.

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectByIds } from '@/lib/supabase/chunked';
import { resolveApplicablePeople } from './applicability';
import { resolvePersonTerms } from './resolve-terms';
import { loadResolveContext } from './structure-context';
import type { TermOverride } from './overrides';
import type { FeeStructureRow } from './types';
import {
  classifyConcession, matchRule, rowTargets, targetTerms, targetTotal,
  SCHEME_75_SCHOLARSHIP,
  type ConcessionKind, type ConcessionRule, type ConcessionStatus, type LedgerState,
} from './concession-math';

export const MAX_APPLY = 200;

export interface ConcessionRow {
  personId: string;
  rollNumber: string | null;
  name: string;
  institutionName: string | null;
  programName: string | null;
  admissionYear: number | null;
  ruleId: string | null;
  ruleLabel: string | null;
  fullTotal: number | null;
  targetTotal: number | null;
  billAmount: number | null;
  paidAmount: number;
  billStatus: string | null;
  status: ConcessionStatus;
  reason: string | null;
  terms: TermOverride[];
  rowTargets: Array<{ fee_bill_id: string; target: number | null }>;
}

export interface ConcessionList {
  rows: ConcessionRow[];
  counts: Record<ConcessionStatus, number>;
  rules: ConcessionRule[];
}

export type ApplyOutcome =
  | 'repriced' | 'ledger_aligned' | 'override_only' | 'unchanged' | 'review' | 'skipped' | 'error';

export interface ApplyResult {
  personId: string;
  name: string;
  outcome: ApplyOutcome;
  message: string | null;
}

const REVIEW_PREFIX = 'CONCESSION_REVIEW:';

export function reviewMessage(message: string): string | null {
  return message.startsWith(REVIEW_PREFIX) ? message.slice(REVIEW_PREFIX.length).trim() : null;
}

export function summariseActions(actions: Array<{ action: string }>): ApplyOutcome {
  if (!actions.length) return 'override_only';
  if (actions.some((a) => a.action === 'repriced' || a.action === 'deleted')) return 'repriced';
  if (actions.some((a) => a.action === 'ledger_aligned')) return 'ledger_aligned';
  return 'unchanged';
}

type LearnerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  program_id: string | null;
  scholarship_type: string | null;
  transport_stop_id: string | null;
};

export async function loadConcessionRows(
  svc: SupabaseClient,
  opts: { transportYearId: string; kind: ConcessionKind; personIds?: string[] }
): Promise<ConcessionList> {
  const { transportYearId, kind } = opts;

  const { data: ruleData, error: ruleErr } = await svc
    .from('tms_fee_concession_rule')
    .select('*')
    .eq('transport_year_id', transportYearId)
    .order('created_at', { ascending: true });
  if (ruleErr) throw ruleErr;
  const rules = ((ruleData ?? []) as ConcessionRule[]).map((r) => ({
    ...r,
    percent: r.percent === null ? null : Number(r.percent),
    annual_amount: r.annual_amount === null ? null : Number(r.annual_amount),
  }));
  const kindRules = rules.filter((r) => r.kind === kind);
  const counts: Record<ConcessionStatus, number> = { applied: 0, needs_fix: 0, review: 0, unresolved: 0 };
  if (!kindRules.some((r) => r.is_active)) return { rows: [], counts, rules: kindRules };

  // Active learner structures for the year → who each one bills.
  const { data: fsData, error: fsErr } = await svc
    .from('tms_fee_structure')
    .select('*')
    .eq('transport_year_id', transportYearId)
    .eq('audience', 'student')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (fsErr) throw fsErr;
  const structures = (fsData ?? []) as FeeStructureRow[];

  const structureOf = new Map<string, FeeStructureRow>();
  const person = new Map<string, { institution_id: string | null; admission_year: number | null }>();
  for (const fs of structures) {
    for (const p of await resolveApplicablePeople(svc, fs)) {
      if (structureOf.has(p.person_id)) continue; // first structure wins
      structureOf.set(p.person_id, fs);
      person.set(p.person_id, { institution_id: p.institution_id, admission_year: p.admission_year });
    }
  }

  let ids = [...person.keys()];
  if (opts.personIds) {
    const wanted = new Set(opts.personIds);
    ids = ids.filter((id) => wanted.has(id));
  }

  const learners = await selectByIds<LearnerRow>(
    svc, 'learners_profiles',
    'id, first_name, last_name, roll_number, program_id, scholarship_type, transport_stop_id',
    ids
  );

  // Candidates = learners a rule covers.
  const candidates: Array<{ l: LearnerRow; rule: ConcessionRule }> = [];
  for (const l of learners) {
    const p = person.get(l.id)!;
    const rule = matchRule(kindRules, kind, {
      institution_id: p.institution_id,
      admission_year: p.admission_year,
      program_id: l.program_id,
      scholarship_type: l.scholarship_type,
    });
    if (rule) candidates.push({ l, rule });
  }
  if (!candidates.length) return { rows: [], counts, rules: kindRules };
  const candIds = candidates.map((c) => c.l.id);

  // Names.
  const instIds = [...new Set(candidates.map((c) => person.get(c.l.id)!.institution_id).filter(Boolean) as string[])];
  const progIds = [...new Set(candidates.map((c) => c.l.program_id).filter(Boolean) as string[])];
  const insts = await selectByIds<{ id: string; name: string }>(svc, 'institutions', 'id, name', instIds);
  const progs = await selectByIds<{ id: string; program_name: string }>(svc, 'programs', 'id, program_name', progIds);
  const instName = new Map(insts.map((i) => [i.id, i.name]));
  const progName = new Map(progs.map((p) => [p.id, p.program_name]));

  // Overrides: by year only (few rows; avoids a huge .in()).
  const { data: ovData, error: ovErr } = await svc
    .from('tms_fee_override')
    .select('person_id, term_no, billable, amount')
    .eq('transport_year_id', transportYearId);
  if (ovErr) throw ovErr;
  const overridesBy = new Map<string, TermOverride[]>();
  for (const o of (ovData ?? []) as Array<{ person_id: string; term_no: number; billable: boolean; amount: string | number | null }>) {
    const list = overridesBy.get(o.person_id) ?? [];
    list.push({ term_no: o.term_no, billable: o.billable, amount: o.amount === null ? null : Number(o.amount) });
    overridesBy.set(o.person_id, list);
  }

  // Ledger + money + receipts + pending payments.
  const fbs = await selectByIds<{
    id: string; person_id: string; term_no: number; amount: string | number; status: string; billing_student_bill_id: string | null; transport_year_id: string;
  }>(svc, 'tms_fee_bill', 'id, person_id, term_no, amount, status, billing_student_bill_id, transport_year_id', candIds, 'person_id');
  const yearFbs = fbs.filter((f) => f.transport_year_id === transportYearId);
  const sbIds = yearFbs.map((f) => f.billing_student_bill_id).filter(Boolean) as string[];
  const sbs = await selectByIds<{ id: string; final_amount: string | number; status: string; payment_date: string | null }>(
    svc, 'billing_student_bills', 'id, final_amount, status, payment_date', sbIds);
  const receipts = await selectByIds<{ bill_id: string; amount_paid: string | number }>(
    svc, 'billing_receipt_items', 'bill_id, amount_paid', sbIds, 'bill_id');
  // Only open or settled attempts count: failed/expired attempts moved no money.
  // Same rule as tms_apply_fee_concession (migration 20260917140000).
  const pti = await selectByIds<{ bill_id: string; transaction_id: string }>(
    svc, 'payment_transaction_items', 'bill_id, transaction_id', sbIds, 'bill_id');
  const txns = await selectByIds<{ id: string; status: string | null }>(
    svc, 'payment_transactions', 'id, status', [...new Set(pti.map((x) => x.transaction_id))]);
  const deadTxn = new Set(txns.filter((t) => t.status === 'failed' || t.status === 'expired').map((t) => t.id));
  const pending = pti.filter((x) => !deadTxn.has(x.transaction_id));
  const sbById = new Map(sbs.map((s) => [s.id, s]));
  const paidBy = new Map<string, number>();
  for (const r of receipts) paidBy.set(r.bill_id, (paidBy.get(r.bill_id) ?? 0) + Number(r.amount_paid));
  const pendingSet = new Set(pending.map((p) => p.bill_id));
  const ledgerBy = new Map<string, LedgerState[]>();
  for (const f of yearFbs) {
    const sb = f.billing_student_bill_id ? sbById.get(f.billing_student_bill_id) : undefined;
    const list = ledgerBy.get(f.person_id) ?? [];
    list.push({
      feeBillId: f.id,
      termNo: f.term_no,
      ledgerAmount: Number(f.amount),
      ledgerStatus: f.status,
      moneyBillId: sb?.id ?? null,
      moneyFinal: sb ? Number(sb.final_amount) : null,
      moneyStatus: sb?.status ?? null,
      paid: sb ? paidBy.get(sb.id) ?? 0 : 0,
      // A payment_date with no receipt still means money moved (mirrors the live bill-delete guard).
      pendingPayment: sb ? pendingSet.has(sb.id) || sb.payment_date !== null : false,
    });
    ledgerBy.set(f.person_id, list);
  }

  // One context per structure.
  const ctxBy = new Map<string, Awaited<ReturnType<typeof loadResolveContext>>>();
  for (const fs of new Set(candidates.map((c) => structureOf.get(c.l.id)!))) {
    ctxBy.set(fs.id, await loadResolveContext(svc, fs));
  }

  const rows: ConcessionRow[] = [];
  for (const { l, rule } of candidates) {
    const p = person.get(l.id)!;
    const fs = structureOf.get(l.id)!;
    const ledger = ledgerBy.get(l.id) ?? [];
    const money = ledger.filter((x) => x.moneyFinal !== null);
    const base: ConcessionRow = {
      personId: l.id,
      rollNumber: l.roll_number,
      name: [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
      institutionName: p.institution_id ? instName.get(p.institution_id) ?? null : null,
      programName: l.program_id ? progName.get(l.program_id) ?? null : null,
      admissionYear: p.admission_year,
      ruleId: rule.id,
      ruleLabel: rule.label,
      fullTotal: null,
      targetTotal: null,
      billAmount: money.length ? money.reduce((s, x) => s + (x.moneyFinal ?? 0), 0) : null,
      paidAmount: ledger.reduce((s, x) => s + x.paid, 0),
      billStatus: money.length === 1 ? money[0].moneyStatus : money.length ? 'multiple' : null,
      status: 'unresolved',
      reason: null,
      terms: [],
      rowTargets: [],
    };

    const loaded = ctxBy.get(fs.id)!;
    if (!loaded.ok) {
      rows.push({ ...base, reason: loaded.error });
      continue;
    }
    const outcome = resolvePersonTerms(
      { admission_year: p.admission_year, transport_stop_id: l.transport_stop_id, overrides: [] },
      loaded.value.ctx
    );
    if (!outcome.ok) {
      rows.push({ ...base, reason: outcome.reason });
      continue;
    }
    const terms = targetTerms(rule, outcome.terms);
    const total = targetTotal(terms);
    const fullTotal = outcome.terms.reduce((s, t) => s + Number(t.amount), 0);
    const c = classifyConcession({ kind, terms, total, overrides: overridesBy.get(l.id) ?? [], ledger });
    const targets = rowTargets(kind, total, ledger);
    rows.push({
      ...base, fullTotal, targetTotal: total, terms, status: c.status, reason: c.reason,
      rowTargets: targets ? [...targets].map(([fee_bill_id, target]) => ({ fee_bill_id, target })) : [],
    });
  }

  for (const r of rows) counts[r.status]++;
  rows.sort((a, b) => (a.rollNumber ?? '').localeCompare(b.rollNumber ?? ''));
  return { rows, counts, rules: kindRules };
}

const REASON_PREFIX: Record<ConcessionKind, string> = {
  final_year: 'FINAL-YEAR BATCH CLOSURE',
  scheme_75: SCHEME_75_SCHOLARSHIP,
};

export async function applyConcessions(
  svc: SupabaseClient,
  opts: { transportYearId: string; kind: ConcessionKind; personIds: string[]; actorId: string; today: string }
): Promise<ApplyResult[]> {
  const list = await loadConcessionRows(svc, {
    transportYearId: opts.transportYearId,
    kind: opts.kind,
    personIds: opts.personIds,
  });
  const byId = new Map(list.rows.map((r) => [r.personId, r]));
  const results: ApplyResult[] = [];

  for (const id of opts.personIds) {
    const row = byId.get(id);
    if (!row) {
      results.push({ personId: id, name: id, outcome: 'skipped', message: 'Not covered by any active rule' });
      continue;
    }
    if (row.status !== 'needs_fix' || !row.ruleId || row.targetTotal === null) {
      results.push({ personId: id, name: row.name, outcome: row.status === 'review' ? 'review' : 'skipped', message: row.reason ?? `Status is ${row.status}` });
      continue;
    }
    const reason = `${REASON_PREFIX[opts.kind]} - ${row.ruleLabel} - (${row.name}, ${row.rollNumber ?? 'no roll'}) - ${opts.today}`;
    const { data, error } = await svc.rpc('tms_apply_fee_concession', {
      p_person_id: id,
      p_rule_id: row.ruleId,
      p_terms: row.terms,
      p_row_targets: row.rowTargets,
      p_reason: reason,
      p_actor: opts.actorId,
    });
    if (error) {
      const review = reviewMessage(error.message ?? '');
      results.push({ personId: id, name: row.name, outcome: review ? 'review' : 'error', message: review ?? error.message });
      continue;
    }
    const actions = ((data as { actions?: Array<{ action: string }> } | null)?.actions) ?? [];
    results.push({ personId: id, name: row.name, outcome: summariseActions(actions), message: null });
  }
  return results;
}
```

Before running: confirm `selectByIds` signature — `grep -n "export async function selectByIds" -A20 lib/supabase/chunked.ts`. If its generic/argument order differs from `(supabase, table, columns, ids, idColumn)`, adapt the calls (not the helper). Confirm `FeeStructureRow` has `id`, `fee_mode`, `transport_year_id`, `audience`, `institution_ids`, `staff_role_keys`, `lifecycle_statuses`, and `tms_fee_structure` has a `created_at` column (`grep -n "created_at" supabase/migrations/20260613100000_create_tms_fee_structure.sql`); if not, order by `id`.

- [ ] **Step 4: Run tests** — `npx vitest run lib/fees` → all PASS.

- [ ] **Step 5: Scoped typecheck** — `npx tsc --noEmit -p . 2>&1 | grep "lib/fees/concession"` → no output.

(The loader is checked against live data in Task 7 Step 5 and Task 9 Step 5; vitest only includes `lib/**/*.test.ts`, so no live-DB test file is added.)

- [ ] **Step 6: Commit**

```bash
git add lib/fees/concessions.ts lib/fees/concessions.test.ts
git commit -m "feat(fees): load concession candidates and apply concessions"
```

---

### Task 6: Permission keys and activity-log types

**Files:**
- Modify: `lib/constants/tms-permissions.ts` (after `FEES_GENERATE`)
- Modify: `lib/activity/log.ts:11-20`
- Modify: `app/(admin)/activity-log/columns.tsx` (`ACTION_BADGE`, `MODULE_LABEL`)

**Interfaces:**
- Produces: `TMS_PERMISSIONS.FEES_CONCESSION_VIEW = 'tms.fees.concession.view'`, `TMS_PERMISSIONS.FEES_CONCESSION_APPLY = 'tms.fees.concession.apply'`; `ActivityModule` includes `'fee-concessions'`; `ActivityAction` includes `'apply'`.

- [ ] **Step 1: Edit permissions**

```ts
  FEES_GENERATE: 'tms.fees.generate',
  // Fee Concession tab (Bill Management): list + apply final-year / 7.5% concessions.
  FEES_CONCESSION_VIEW: 'tms.fees.concession.view',
  FEES_CONCESSION_APPLY: 'tms.fees.concession.apply',
```

- [ ] **Step 2: Edit `lib/activity/log.ts`**

```ts
export type ActivityAction =
  | 'create' | 'update' | 'delete' | 'import' | 'assign' | 'unassign'
  | 'upload' | 'activate' | 'deactivate' | 'scan' | 'mark' | 'unmark' | 'generate'
  | 'submit' | 'approve' | 'reject' | 'notify' | 'cancel' | 'apply';

export type ActivityModule =
  | 'drivers' | 'vehicles' | 'routes' | 'route-optimization' | 'gps-devices'
  | 'passengers' | 'staff-route-assignments' | 'boarding' | 'enrollment'
  | 'grievances' | 'settings' | 'transport-years' | 'fees' | 'notifications'
  | 'driver-mobiles' | 'transport-vacate' | 'fee-concessions';
```

- [ ] **Step 3: Edit activity-log labels** — add to `ACTION_BADGE`:
```ts
  apply: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
```
and to `MODULE_LABEL`:
```ts
  'fee-concessions': 'Fee Concessions',
```

- [ ] **Step 4: Run** `npx vitest run lib/activity` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/constants/tms-permissions.ts lib/activity/log.ts "app/(admin)/activity-log/columns.tsx"
git commit -m "feat(fees): concession permission keys and activity-log types"
```

---

### Task 7: API routes

**Files:**
- Create: `app/api/admin/fees/concessions/route.ts`
- Create: `app/api/admin/fees/concessions/apply/route.ts`
- Create: `app/api/admin/fees/concessions/rules/route.ts`
- Create: `app/api/admin/fees/concessions/rules/[id]/route.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6.
- Produces:
  - `GET /api/admin/fees/concessions?year=&kind=` → `{ success, data: ConcessionList }`
  - `POST /api/admin/fees/concessions/apply` body `{ year, kind, personIds }` → `{ success, data: { results: ApplyResult[] } }`
  - `GET /api/admin/fees/concessions/rules?year=&kind=` → `{ success, data: ConcessionRule[] }`
  - `POST /api/admin/fees/concessions/rules` body `{ year, ...RuleWrite }` → `{ success, data: ConcessionRule }`
  - `PUT /api/admin/fees/concessions/rules/[id]` body `RuleWrite` → `{ success, data: ConcessionRule }`

- [ ] **Step 1: List route**

```ts
// app/api/admin/fees/concessions/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadConcessionRows } from '@/lib/fees/concessions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// Concession candidates for one transport year and kind.
//   /api/admin/fees/concessions?year=<transport_year_id>&kind=final_year|scheme_75
async function getConcessions(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const year = sp.get('year');
    const kind = sp.get('kind');
    if (!year || year === 'all') {
      return NextResponse.json({ error: 'Select a transport year.' }, { status: 400 });
    }
    if (kind !== 'final_year' && kind !== 'scheme_75') {
      return NextResponse.json({ error: 'Unknown concession kind.' }, { status: 400 });
    }
    const data = await loadConcessionRows(createServiceRoleClient(), { transportYearId: year, kind });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Fee concessions API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getConcessions(request, auth));
```

- [ ] **Step 2: Apply route**

```ts
// app/api/admin/fees/concessions/apply/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { applyConcessions, MAX_APPLY } from '@/lib/fees/concessions';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function postApply(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_APPLY))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      year?: string; kind?: string; personIds?: unknown;
    };
    const kind = body.kind;
    if (!body.year || body.year === 'all') {
      return NextResponse.json({ error: 'Select a transport year.' }, { status: 400 });
    }
    if (kind !== 'final_year' && kind !== 'scheme_75') {
      return NextResponse.json({ error: 'Unknown concession kind.' }, { status: 400 });
    }
    const personIds = Array.isArray(body.personIds)
      ? [...new Set(body.personIds.filter((x): x is string => typeof x === 'string' && x.length > 0))]
      : [];
    // An empty selection must never mean "everyone".
    if (!personIds.length) {
      return NextResponse.json({ error: 'Select at least one learner.' }, { status: 400 });
    }
    if (personIds.length > MAX_APPLY) {
      return NextResponse.json({ error: `Apply at most ${MAX_APPLY} learners at a time.` }, { status: 400 });
    }

    const results = await applyConcessions(createServiceRoleClient(), {
      transportYearId: body.year,
      kind,
      personIds,
      actorId: auth.userId,
      today: new Date().toISOString().slice(0, 10),
    });

    const counts: Record<string, number> = {};
    for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    const changed = results.filter((r) => ['repriced', 'ledger_aligned', 'override_only', 'unchanged'].includes(r.outcome));
    if (changed.length) {
      await logActivity(auth, request, {
        module: 'fee-concessions',
        action: 'apply',
        entityType: 'tms_fee_override',
        entityLabel: kind === 'final_year' ? 'Final year 50%' : '7.5% scheme',
        description: `Applied ${kind === 'final_year' ? 'final-year' : '7.5% scheme'} concession to ${changed.length} learner(s)`,
        metadata: { transport_year_id: body.year, kind, counts, person_ids: changed.map((r) => r.personId) },
      });
    }
    return NextResponse.json({ success: true, data: { results } });
  } catch (e) {
    console.error('Fee concessions apply API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => postApply(request, auth));
```

- [ ] **Step 3: Rules routes**

```ts
// app/api/admin/fees/concessions/rules/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { parseRuleInput } from '@/lib/fees/concession-rules';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getRules(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const year = sp.get('year');
    if (!year) return NextResponse.json({ error: 'Select a transport year.' }, { status: 400 });
    let q = createServiceRoleClient()
      .from('tms_fee_concession_rule')
      .select('*')
      .eq('transport_year_id', year)
      .order('created_at', { ascending: true });
    const kind = sp.get('kind');
    if (kind) q = q.eq('kind', kind);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error('Concession rules API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postRule(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_APPLY))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const year = typeof body.year === 'string' ? body.year : '';
    if (!year || year === 'all') return NextResponse.json({ error: 'Select a transport year.' }, { status: 400 });
    const parsed = parseRuleInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await createServiceRoleClient()
      .from('tms_fee_concession_rule')
      .insert({ ...parsed.value, transport_year_id: year, created_by: auth.userId })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An active 7.5% rule already exists for this year — edit it instead.' }, { status: 409 });
      }
      throw error;
    }
    await logActivity(auth, request, {
      module: 'fee-concessions', action: 'create', entityType: 'tms_fee_concession_rule',
      entityId: data.id, entityLabel: data.label, description: `Added concession rule "${data.label}"`,
      changes: { after: data },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Concession rules API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRules(request, auth));
export const POST = withAuth((request, auth) => postRule(request, auth));
```

```ts
// app/api/admin/fees/concessions/rules/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { parseRuleInput } from '@/lib/fees/concession-rules';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function putRule(request: NextRequest, auth: AuthContext, id: string) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_APPLY))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const parsed = parseRuleInput(await request.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const svc = createServiceRoleClient();
    const { data: before } = await svc.from('tms_fee_concession_rule').select('*').eq('id', id).maybeSingle();
    if (!before) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    if (before.kind !== parsed.value.kind) {
      return NextResponse.json({ error: 'A rule cannot change kind.' }, { status: 400 });
    }
    const { data, error } = await svc
      .from('tms_fee_concession_rule')
      .update({ ...parsed.value, updated_at: new Date().toISOString(), updated_by: auth.userId })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An active 7.5% rule already exists for this year.' }, { status: 409 });
      }
      throw error;
    }
    await logActivity(auth, request, {
      module: 'fee-concessions',
      action: before.is_active && !data.is_active ? 'deactivate' : !before.is_active && data.is_active ? 'activate' : 'update',
      entityType: 'tms_fee_concession_rule', entityId: id, entityLabel: data.label,
      description: `Updated concession rule "${data.label}"`,
      changes: { before, after: data },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Concession rule update API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PUT = withAuth(async (request, auth) => {
  const id = request.nextUrl.pathname.split('/').pop() ?? '';
  return putRule(request, auth, id);
});
```

Before writing the `[id]` route, check how a sibling `[id]` route under `app/api/admin/fees/[id]/route.ts` obtains the id with `withAuth` (it may pass route context); copy that exact mechanism instead of the pathname split if it differs.

- [ ] **Step 4: Scoped typecheck** — `npx tsc --noEmit -p . 2>&1 | grep "app/api/admin/fees/concessions"` → no output.

- [ ] **Step 5: Build and live read-only check**

Run: `node node_modules/next/dist/bin/next build` (worktree; if `node_modules` is missing in the worktree, create the junction the repo uses: `cmd //c mklink /J node_modules D:\\Sangeetha_V\\TMS-ADMIN\\node_modules` from a `.cmd` file in the scratchpad). Expected: build succeeds and lists the four new routes.

Then verify the classification against the DB directly (the API needs an authenticated browser): run `loadConcessionRows` logic's expectations via SQL —
```sql
select o.person_id, lp.roll_number from tms_fee_override o join learners_profiles lp on lp.id=o.person_id
where o.transport_year_id='6b3768f9-c9fb-48d5-a955-41949983c3b0' and lp.roll_number in ('PB22008','PB22042','PB22057','PB22033');
```
Expected: three rows (PB22033 has none) — these become Applied / Applied / Applied / Needs review in the UI check (Task 9).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/fees/concessions
git commit -m "feat(fees): fee concession list, apply and rule APIs"
```

---

### Task 8: UI

**Files:**
- Create: `app/(admin)/bill-management/concessions/concessions-api.ts`
- Create: `app/(admin)/bill-management/concessions/concession-columns.tsx`
- Create: `app/(admin)/bill-management/concessions/rule-dialog.tsx`
- Create: `app/(admin)/bill-management/concessions/concession-panel.tsx`
- Modify: `app/(admin)/bill-management/page.tsx:20` (View), `:65-68` (all-years guard), `:184-195` (toggle), `:201` (render branch)

**Interfaces:**
- Consumes: Task 7 endpoints; `ConcessionRow`, `ConcessionList`, `ApplyResult` (type-only imports from `@/lib/fees/concessions`); `ConcessionRule`, `ConcessionKind` from `@/lib/fees/concession-math`; `DataTable`, `ConfirmDialog`, `usePermissions`, `fetchMasters`, `inr`.
- Produces: `<ConcessionPanel year={string} />`.

- [ ] **Step 1: Client API**

```ts
// app/(admin)/bill-management/concessions/concessions-api.ts
import type { ApplyResult, ConcessionList, ConcessionRow } from '@/lib/fees/concessions';
import type { ConcessionKind, ConcessionRule } from '@/lib/fees/concession-math';

export type { ApplyResult, ConcessionList, ConcessionRow, ConcessionKind, ConcessionRule };

const json = async (res: Response) => {
  const j = await res.json();
  if (!res.ok || j.success === false) throw new Error(j.error || 'Request failed');
  return j;
};

export async function fetchConcessions(year: string, kind: ConcessionKind): Promise<ConcessionList> {
  const qs = new URLSearchParams({ year, kind });
  const res = await fetch(`/api/admin/fees/concessions?${qs}`, { cache: 'no-store', credentials: 'same-origin' });
  return (await json(res)).data as ConcessionList;
}

export async function applyConcessionTo(year: string, kind: ConcessionKind, personIds: string[]): Promise<ApplyResult[]> {
  const res = await fetch('/api/admin/fees/concessions/apply', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, kind, personIds }),
  });
  return (await json(res)).data.results as ApplyResult[];
}

export interface RuleInput {
  kind: ConcessionKind;
  institution_id?: string | null;
  admission_year?: number | null;
  program_id?: string | null;
  percent?: number | null;
  annual_amount?: number | null;
  label: string;
  is_active?: boolean;
}

export async function createRule(year: string, input: RuleInput): Promise<ConcessionRule> {
  const res = await fetch('/api/admin/fees/concessions/rules', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, ...input }),
  });
  return (await json(res)).data as ConcessionRule;
}

export async function updateRule(id: string, input: RuleInput): Promise<ConcessionRule> {
  const res = await fetch(`/api/admin/fees/concessions/rules/${id}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await json(res)).data as ConcessionRule;
}
```

- [ ] **Step 2: Columns**

```tsx
// app/(admin)/bill-management/concessions/concession-columns.tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { inr } from '../columns';
import type { ConcessionRow } from './concessions-api';

export const STATUS_LABEL: Record<ConcessionRow['status'], string> = {
  needs_fix: 'Needs fix',
  applied: 'Applied',
  review: 'Needs review',
  unresolved: 'Unresolved',
};

const STATUS_CLS: Record<ConcessionRow['status'], string> = {
  needs_fix: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  applied: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  review: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  unresolved: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400',
};

const money = (n: number | null) => (n === null ? '—' : inr(n));

export function getConcessionColumns(): ColumnDef<ConcessionRow>[] {
  return [
    {
      accessorKey: 'rollNumber',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll no" />,
      cell: ({ row }) => <span className="text-sm text-gray-600 dark:text-gray-300">{row.original.rollNumber || '—'}</span>,
      size: 110,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.name}</span>,
    },
    {
      id: 'institution',
      accessorFn: (r) => r.institutionName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      header: ({ column }) => <DataTableColumnHeader column={column} title="College" />,
      cell: ({ row }) => (
        <div className="min-w-0 text-sm text-gray-600 dark:text-gray-300">
          <div className="truncate">{row.original.institutionName || '—'}</div>
          <div className="truncate text-xs text-gray-400">
            {[row.original.programName, row.original.admissionYear].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      id: 'fullTotal',
      accessorFn: (r) => r.fullTotal ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Full fee" />,
      cell: ({ row }) => <span className="text-sm tabular-nums">{money(row.original.fullTotal)}</span>,
      size: 100,
    },
    {
      id: 'targetTotal',
      accessorFn: (r) => r.targetTotal ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Concession fee" />,
      cell: ({ row }) => <span className="text-sm font-medium tabular-nums">{money(row.original.targetTotal)}</span>,
      size: 120,
    },
    {
      id: 'billAmount',
      accessorFn: (r) => r.billAmount ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Current bill" />,
      cell: ({ row }) => (
        <div className="text-sm tabular-nums">
          <div>{row.original.billAmount === null ? 'Not billed' : inr(row.original.billAmount)}</div>
          {row.original.billStatus && <div className="text-xs capitalize text-gray-400">{row.original.billStatus.replace('_', ' ')}</div>}
        </div>
      ),
      size: 110,
    },
    {
      accessorKey: 'paidAmount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Paid" />,
      cell: ({ row }) => <span className="text-sm tabular-nums">{inr(row.original.paidAmount)}</span>,
      size: 90,
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLS[row.original.status]}`}>
            {STATUS_LABEL[row.original.status]}
          </span>
          {row.original.reason && (
            <div className="mt-0.5 max-w-[16rem] text-xs text-gray-500 dark:text-gray-400">{row.original.reason}</div>
          )}
        </div>
      ),
    },
  ];
}
```

Check `inr` accepts a `number` (see `app/(admin)/bill-management/columns.tsx`); it is already called with possibly-undefined values on the page, so a number is fine.

- [ ] **Step 3: Row selection limited to `needs_fix`**

Check `components/ui/data-table.tsx` for how `enableRowSelection` is passed to `useReactTable` (`grep -n "enableRowSelection" components/ui/data-table.tsx`). If it is passed as a boolean only, add an optional prop without changing existing callers:

```ts
  /** Per-row selectability; defaults to every row when enableRowSelection is on. */
  canSelectRow?: (row: TData) => boolean;
```
and in the table options:
```ts
    enableRowSelection: enableRowSelection
      ? (canSelectRow ? (row) => canSelectRow(row.original) : true)
      : false,
```
Then confirm the checkbox cell renders `disabled={!row.getCanSelect()}` and the header "select all" uses `table.getIsAllPageRowsSelected()` / `toggleAllPageRowsSelected` (TanStack skips non-selectable rows). If the checkbox cell does not pass `disabled`, add `disabled={!row.getCanSelect()}`.

- [ ] **Step 4: Rule dialog**

```tsx
// app/(admin)/bill-management/concessions/rule-dialog.tsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectMenu } from '@/components/ui/select-menu';
import { fetchMasters } from '../../fees/fee-api';
import { createRule, updateRule, type ConcessionKind, type ConcessionRule } from './concessions-api';

const inputCls =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

export function RuleDialog({
  open, year, kind, rule, onClose, onSaved,
}: {
  open: boolean;
  year: string;
  kind: ConcessionKind;
  rule: ConcessionRule | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const [institutionId, setInstitutionId] = useState('');
  const [programId, setProgramId] = useState('');
  const [admissionYear, setAdmissionYear] = useState('');
  const [percent, setPercent] = useState('50');
  const [annualAmount, setAnnualAmount] = useState('500');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInstitutionId(rule?.institution_id ?? '');
    setProgramId(rule?.program_id ?? '');
    setAdmissionYear(rule?.admission_year ? String(rule.admission_year) : '');
    setPercent(rule?.percent != null ? String(rule.percent) : '50');
    setAnnualAmount(rule?.annual_amount != null ? String(rule.annual_amount) : '500');
    setLabel(rule?.label ?? '');
  }, [open, rule]);

  const { data: institutions = [] } = useQuery({
    queryKey: ['masters', 'institutions'],
    queryFn: () => fetchMasters('institutions'),
    enabled: open && kind === 'final_year',
  });
  const { data: programmes = [] } = useQuery({
    queryKey: ['masters', 'programmes', institutionId],
    queryFn: () => fetchMasters('programmes', { institution_id: institutionId }),
    enabled: open && kind === 'final_year' && !!institutionId,
  });

  async function save() {
    setSaving(true);
    try {
      const input = kind === 'final_year'
        ? {
            kind, label,
            institution_id: institutionId || null,
            program_id: programId || null,
            admission_year: admissionYear ? Number(admissionYear) : null,
            percent: percent ? Number(percent) : null,
            is_active: rule?.is_active ?? true,
          }
        : { kind, label, annual_amount: annualAmount ? Number(annualAmount) : null, is_active: rule?.is_active ?? true };
      if (rule) await updateRule(rule.id, input);
      else await createRule(year, input);
      toast.success(rule ? 'Rule updated.' : 'Rule added.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the rule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {rule ? 'Edit' : 'Add'} {kind === 'final_year' ? 'final-year cohort rule' : '7.5% scheme amount'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-300">Label</span>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === 'final_year' ? 'Pharmacy BPHARM 2022-2026' : '7.5% scholarship - Rs 500 per year'} />
          </label>
          {kind === 'final_year' ? (
            <>
              <div className="text-sm">
                <span className="text-gray-600 dark:text-gray-300">College</span>
                <SelectMenu
                  value={institutionId}
                  onValueChange={(v) => { setInstitutionId(v); setProgramId(''); }}
                  options={institutions.map((i) => ({ value: i.id, label: i.name }))}
                  placeholder="Select college…"
                  ariaLabel="College"
                />
              </div>
              <div className="text-sm">
                <span className="text-gray-600 dark:text-gray-300">Program (optional)</span>
                <SelectMenu
                  value={programId}
                  onValueChange={setProgramId}
                  options={[{ value: '', label: 'All programs' }, ...programmes.map((p) => ({ value: p.id, label: p.name }))]}
                  placeholder="All programs"
                  ariaLabel="Program"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Admission year</span>
                  <input className={inputCls} inputMode="numeric" value={admissionYear}
                    onChange={(e) => setAdmissionYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2022" />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Pay (%)</span>
                  <input className={inputCls} inputMode="decimal" value={percent}
                    onChange={(e) => setPercent(e.target.value)} />
                </label>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Learners admitted in this year at this college pay this percentage of their normal transport fee.
              </p>
            </>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Annual amount (Rs), charged in Term 1</span>
              <input className={inputCls} inputMode="decimal" value={annualAmount}
                onChange={(e) => setAnnualAmount(e.target.value)} />
            </label>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving || !label.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Check `SelectMenu`'s props (`grep -n "export function SelectMenu" -A20 components/ui/select-menu.tsx`) and `MasterOption` fields (`id`, `name`) in `app/(admin)/fees/fee-api.ts`; if an empty-string option value is not allowed by `SelectMenu`, use `'__all'` and map it back to `''`.

- [ ] **Step 5: Panel**

```tsx
// app/(admin)/bill-management/concessions/concession-panel.tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { inr } from '../columns';
import { getConcessionColumns, STATUS_LABEL } from './concession-columns';
import { RuleDialog } from './rule-dialog';
import {
  applyConcessionTo, fetchConcessions, updateRule,
  type ConcessionKind, type ConcessionRow, type ConcessionRule,
} from './concessions-api';

const KIND_LABEL: Record<ConcessionKind, string> = {
  final_year: 'Final Year 50%',
  scheme_75: '7.5% Scheme',
};

export function ConcessionPanel({ year }: { year: string }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canApply = can(TMS_PERMISSIONS.FEES_CONCESSION_APPLY);
  const [kind, setKind] = useState<ConcessionKind>('final_year');
  const [confirmRows, setConfirmRows] = useState<ConcessionRow[] | null>(null);
  const [resetSel, setResetSel] = useState<(() => void) | null>(null);
  const [applying, setApplying] = useState(false);
  const [ruleDialog, setRuleDialog] = useState<{ rule: ConcessionRule | null } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fee-concessions', year, kind],
    queryFn: () => fetchConcessions(year, kind),
    enabled: !!year,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo(() => getConcessionColumns(), []);
  const institutionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.institutionName) s.add(r.institutionName);
    return [...s].sort().map((n) => ({ label: n, value: n }));
  }, [rows]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['fee-concessions', year] });
    void qc.invalidateQueries({ queryKey: ['bill-management', year] });
    void qc.invalidateQueries({ queryKey: ['bill-management-unbilled', year] });
  };

  async function apply() {
    if (!confirmRows) return;
    setApplying(true);
    try {
      const results = await applyConcessionTo(year, kind, confirmRows.map((r) => r.personId));
      const done = results.filter((r) => ['repriced', 'ledger_aligned', 'override_only', 'unchanged'].includes(r.outcome)).length;
      const review = results.filter((r) => r.outcome === 'review');
      const failed = results.filter((r) => r.outcome === 'error');
      if (done) toast.success(`Concession applied to ${done} learner(s).`);
      if (review.length) toast(`${review.length} need accounts review: ${review.map((r) => r.name).join(', ')}`, { icon: '⚠️' });
      if (failed.length) toast.error(`${failed.length} failed: ${failed.map((r) => `${r.name} (${r.message})`).join('; ')}`);
      setConfirmRows(null);
      resetSel?.();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not apply the concession');
    } finally {
      setApplying(false);
    }
  }

  const reduction = (confirmRows ?? []).reduce(
    (s, r) => s + Math.max(0, (r.billAmount ?? r.fullTotal ?? 0) - (r.targetTotal ?? 0)), 0);
  const scheme = kind === 'scheme_75' ? data?.rules.find((r) => r.is_active) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
        {(Object.keys(KIND_LABEL) as ConcessionKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              kind === k ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['needs_fix', 'applied', 'review', 'unresolved'] as const).map((s) => (
          <div key={s} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="text-xs text-gray-500 dark:text-gray-400">{STATUS_LABEL[s]}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isLoading ? '…' : data?.counts[s] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {kind === 'final_year' ? 'Final-year cohort rules' : '7.5% scheme amount'}
          </h3>
          {canApply && (kind === 'final_year' || !scheme) && (
            <button type="button" onClick={() => setRuleDialog({ rule: null })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              <Plus className="h-4 w-4" /> {kind === 'final_year' ? 'Add cohort rule' : 'Set amount'}
            </button>
          )}
        </div>
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {(data?.rules ?? []).length === 0 && (
            <li className="py-2 text-sm text-gray-500 dark:text-gray-400">No rules for this year yet.</li>
          )}
          {(data?.rules ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <span className={`font-medium ${r.is_active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 line-through'}`}>{r.label}</span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">
                  {r.kind === 'final_year' ? `admission ${r.admission_year} · pays ${r.percent}%` : `${inr(r.annual_amount ?? 0)} per year`}
                </span>
              </div>
              {canApply && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRuleDialog({ rule: r })}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button type="button"
                    onClick={async () => {
                      try {
                        await updateRule(r.id, { ...r, is_active: !r.is_active });
                        refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Could not update the rule');
                      }
                    }}
                    className="text-xs font-medium text-gray-600 hover:underline dark:text-gray-300">
                    {r.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isError ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900">
          Couldn&apos;t load concessions. Please try again.
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          entityName="learners"
          isLoading={isLoading}
          getRowId={(r) => r.personId}
          enableRowSelection={canApply}
          canSelectRow={(r) => r.status === 'needs_fix'}
          searchPlaceholder="Search name or roll number..."
          filters={[
            {
              columnId: 'status',
              title: 'Status',
              options: (['needs_fix', 'applied', 'review', 'unresolved'] as const).map((s) => ({ label: STATUS_LABEL[s], value: s })),
            },
            ...(institutionOptions.length ? [{ columnId: 'institution', title: 'College', options: institutionOptions }] : []),
          ]}
          toolbarActions={({ selectedRows, resetSelection }) =>
            canApply ? (
              <button type="button"
                disabled={selectedRows.length === 0}
                onClick={() => { setConfirmRows(selectedRows); setResetSel(() => resetSelection); }}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                Apply concession{selectedRows.length ? ` (${selectedRows.length})` : ''}
              </button>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={confirmRows !== null}
        onOpenChange={(o) => { if (!o) setConfirmRows(null); }}
        title={`Apply ${KIND_LABEL[kind]} to ${confirmRows?.length ?? 0} learner(s)?`}
        description={
          <>
            Fee exceptions are saved and unpaid bills are corrected. Total reduction: {inr(reduction)}.
            Learners who have already paid a different amount are skipped for accounts review.
          </>
        }
        confirmLabel="Apply"
        loading={applying}
        onConfirm={apply}
      />

      <RuleDialog
        open={ruleDialog !== null}
        year={year}
        kind={kind}
        rule={ruleDialog?.rule ?? null}
        onClose={() => setRuleDialog(null)}
        onSaved={refresh}
      />
    </div>
  );
}
```

`updateRule(r.id, { ...r, is_active })` passes extra fields (id, created_at…); `parseRuleInput` ignores them. Keep it.

- [ ] **Step 6: Wire into the page**

In `app/(admin)/bill-management/page.tsx`:
```ts
import { ConcessionPanel } from './concessions/concession-panel';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

type View = 'bills' | 'unbilled' | 'analytics' | 'fines' | 'concessions';
```
Inside the component, after `const qc = useQueryClient();`:
```ts
  const { can } = usePermissions();
  const canSeeConcessions = can(TMS_PERMISSIONS.FEES_CONCESSION_VIEW);
```
Change the all-years guard:
```ts
    if (isAll && (view === 'unbilled' || view === 'fines' || view === 'concessions')) setView('bills');
```
Add after the Analytics toggle:
```tsx
        {canSeeConcessions && (
          <ToggleBtn active={view === 'concessions'} onClick={() => setView('concessions')} disabled={isAll}>
            Fee Concession
          </ToggleBtn>
        )}
```
Make the toggle container wrap on phones: change its class to `inline-flex flex-wrap rounded-lg …`.
Add the render branch right after `{!selectedYear ? ( … )`:
```tsx
      ) : view === 'concessions' ? (
        <ConcessionPanel year={selectedYear} />
```

- [ ] **Step 7: Scoped typecheck and build**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "bill-management|components/ui/data-table"` → no output.
Run: `node node_modules/next/dist/bin/next build` → success.

- [ ] **Step 8: Commit**

```bash
git add "app/(admin)/bill-management" components/ui/data-table.tsx
git commit -m "feat(fees): Fee Concession tab in Bill Management"
```

---

### Task 9: Verification and hand-off

- [ ] **Step 1: Full test run** — `npx vitest run` → PASS (report any pre-existing failures separately, with output).
- [ ] **Step 2: Re-confirm DB grants** (Task 1 Step 4 query) → unchanged.
- [ ] **Step 3: Branch check** — `git fetch && git log --oneline origin/main..HEAD && git log --oneline HEAD..origin/main`. Report both lists.
- [ ] **Step 4: Ask the user** before pushing (`git push origin HEAD:main` or a PR — their choice).
- [ ] **Step 5: User smoke test (authenticated browser, after deploy)**:
  1. Bill Management → select 2026-2027 → **Fee Concession**.
  2. Final Year 50%: two rules listed; PB22008, PB22042, PB22057 show **Applied**; PB22033 (KAMALESH) shows **Needs review** with a reason.
  3. 7.5% Scheme: Rs 500 rule shown; statuses load without error.
  4. If a **Needs fix** row exists, select it → Apply → toast → row becomes **Applied**; Bills tab shows the new amount; Activity Log shows a "Fee Concessions / Apply" entry.
- [ ] **Step 6: Update memory** — `project_final_year_batch_closure_half_fee.md` and `project_transport_fee_75_scheme_cohort.md`: the UI now exists (tab location, rule table, function name); one-off SQL is no longer the route.
