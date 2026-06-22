# Transport Years Table (`tms_transport_year`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `tms_transport_year` table mirroring the proven `hostel_years` design (academic-year periods with a single "current" year), adapted to TMS-ADMIN's `tms_` table conventions.

**Architecture:** One idempotent SQL migration creates the table, a single-current-year enforcement trigger, an `updated_at` trigger (reusing the existing shared `update_updated_at_column()` function), and indexes. RLS is enabled with **no policies** (deny-all for anon/authenticated; service-role bypasses) — matching every other `tms_` table, where access control lives in permission-checked API routes, NOT in RLS policies like `hostel_years` uses.

**Tech Stack:** Postgres (Supabase project `kvizhngldtiuufknvehv`), applied via Supabase MCP `apply_migration`, migration file committed under `supabase/migrations/`.

---

## Reference: `hostel_years` (live DB schema this plan mirrors)

| Column        | Type        | Constraints                          |
|---------------|-------------|--------------------------------------|
| `id`          | uuid        | PK, default `gen_random_uuid()`      |
| `name`        | text        | NOT NULL, UNIQUE (e.g. `2026 - 2027`)|
| `start_date`  | date        | NOT NULL                             |
| `end_date`    | date        | NOT NULL, CHECK `end_date > start_date` |
| `is_active`   | boolean     | NOT NULL, default `true`             |
| `is_current`  | boolean     | NOT NULL, default `false`            |
| `description` | text        | nullable                             |
| `created_at`  | timestamptz | NOT NULL, default `now()`            |
| `updated_at`  | timestamptz | NOT NULL, default `now()` (trigger-touched) |

Extras on `hostel_years`:
- `enforce_single_current_hostel_year()` — AFTER INSERT/UPDATE OF `is_current` trigger; when a row becomes current, demotes every other row.
- `update_updated_at_column()` BEFORE UPDATE trigger (shared function, already exists in this DB — reuse, don't recreate).
- Index `(is_active, start_date DESC)` for the "list active years, newest first" query.
- RLS policies keyed on `profiles.role IN ('super_admin','admin')` — **intentionally NOT copied** (see Architecture).

## Decisions

1. **Table name `tms_transport_year` (singular)** — matches every existing TMS table (`tms_driver`, `tms_vehicle`, `tms_route`, `tms_attendance`, `tms_grievance`), not `hostel_years`' plural style.
2. **RLS deny-all, no policies** — TMS convention; reads/writes go through future service-role API routes with `requirePerm` checks.
3. **No permission key seeded yet** — this plan is schema-only. When the Transport Years admin module (list/form pages + API route) is built, seed `tms.transport_year.*` keys in that migration (same additive-merge pattern as `20260612010000`).
4. **One seed row** — `2026 - 2027` (2026-06-01 → 2027-05-31, current), mirroring the live hostel year, so dependent features have a current year to resolve immediately. Idempotent via `on conflict (name) do nothing`.
5. **No `description` column** — dropped from the hostel_years design per user request (2026-06-12 confirmation).

---

### Task 1: Write the migration file

**Files:**
- Create: `supabase/migrations/20260612020000_create_tms_transport_year.sql`

- [x] **Step 1: Create the migration file with exactly this content**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Transport Year — academic-year periods for the transport module
--
-- Mirrors hostel_years (same columns minus description, single-current
-- enforcement trigger, updated_at touch trigger) but follows TMS conventions:
--   • table name tms_transport_year (singular, tms_ prefix)
--   • RLS enabled with NO policies — anon/authenticated get nothing,
--     service-role bypasses; access goes through permission-checked
--     /api/admin routes, not RLS roles like hostel_years uses.
--
-- Exactly one row may have is_current = true: the AFTER trigger demotes all
-- other rows whenever a row is inserted/updated as current.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_transport_year (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,             -- e.g. '2026 - 2027'
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default true,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tms_transport_year_name_unique unique (name),
  constraint tms_transport_year_date_order check (end_date > start_date)
);

comment on table public.tms_transport_year is
  'Transport academic years (mirrors hostel_years). Single current year enforced by trigger. Service-role access only; no RLS policies by design.';

create index if not exists idx_tms_transport_year_active
  on public.tms_transport_year (is_active, start_date desc);

-- Single-current enforcement: when a row becomes current, demote the rest.
create or replace function public.enforce_single_current_tms_transport_year()
returns trigger
language plpgsql
as $$
begin
  update public.tms_transport_year
    set is_current = false
    where id <> new.id and is_current = true;
  return new;
end;
$$;

drop trigger if exists trg_tms_transport_year_single_current on public.tms_transport_year;
create trigger trg_tms_transport_year_single_current
  after insert or update of is_current on public.tms_transport_year
  for each row when (new.is_current = true)
  execute function public.enforce_single_current_tms_transport_year();

-- updated_at touch (update_updated_at_column() already exists in this DB).
drop trigger if exists trg_tms_transport_year_updated_at on public.tms_transport_year;
create trigger trg_tms_transport_year_updated_at
  before update on public.tms_transport_year
  for each row execute function public.update_updated_at_column();

alter table public.tms_transport_year enable row level security;
-- Intentionally NO policies: deny-all for anon/authenticated; service-role bypasses.

-- Seed the current year (mirrors the live hostel_years row).
insert into public.tms_transport_year (name, start_date, end_date, is_active, is_current)
values ('2026 - 2027', '2026-06-01', '2027-05-31', true, true)
on conflict (name) do nothing;
```

### Task 2: Apply the migration to the live DB

- [x] **Step 1: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with:
- `name`: `create_tms_transport_year`
- `query`: the full SQL from Task 1

Expected: success, no errors.

### Task 3: Verify behavior with SQL probes

- [x] **Step 1: Verify table shape + seed row**

```sql
select name, start_date, end_date, is_active, is_current
from public.tms_transport_year order by start_date desc;
```
Expected: one row — `2026 - 2027 | 2026-06-01 | 2027-05-31 | true | true`.

- [x] **Step 2: Verify single-current trigger flips the old current**

```sql
insert into public.tms_transport_year (name, start_date, end_date, is_current)
values ('TEST 2027 - 2028', '2027-06-01', '2028-05-31', true);

select name, is_current from public.tms_transport_year order by start_date;
```
Expected: `2026 - 2027 → false`, `TEST 2027 - 2028 → true`.

- [x] **Step 3: Verify the date-order check constraint rejects bad ranges**

```sql
insert into public.tms_transport_year (name, start_date, end_date)
values ('TEST BAD', '2028-06-01', '2028-01-01');
```
Expected: ERROR — violates check constraint `tms_transport_year_date_order`.

- [x] **Step 4: Verify updated_at trigger, then clean up the test row and restore current**

```sql
update public.tms_transport_year set end_date = '2028-06-30'
where name = 'TEST 2027 - 2028';

select updated_at > created_at as touched from public.tms_transport_year
where name = 'TEST 2027 - 2028';
```
Expected: `touched = true`. Then:

```sql
delete from public.tms_transport_year where name = 'TEST 2027 - 2028';
update public.tms_transport_year set is_current = true where name = '2026 - 2027';

select name, is_current from public.tms_transport_year;
```
Expected: single row `2026 - 2027 | true`.

- [x] **Step 5: Verify RLS is enabled with zero policies**

```sql
select relrowsecurity from pg_class where oid = 'public.tms_transport_year'::regclass;
select count(*) from pg_policies where tablename = 'tms_transport_year';
```
Expected: `true` and `0`.

### Task 4: Commit

- [x] **Step 1: Commit the migration file (and this plan doc)**

```bash
git add supabase/migrations/20260612020000_create_tms_transport_year.sql docs/plans/2026-06-12-transport-years-table.md
git commit -m "feat(transport-year): tms_transport_year table — hostel_years-style year periods with single-current trigger"
```

---

## Out of scope (follow-ups when the module is built)

- Admin UI module (list page, create/edit form, API route) — use the `scaffold-tms-module` skill.
- Permission keys `tms.transport_year.view/create/edit/delete` + transport_head grant.
- FK references from other tables (e.g. enrollments/assignments scoped to a transport year).
