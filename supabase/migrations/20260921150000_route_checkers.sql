-- ─────────────────────────────────────────────────────────────────────────────
-- Route Checkers — assignments, route checks, per-person check lines,
-- checker access function and the manage permission.
-- Target: shared MyJKKN project kvizhngldtiuufknvehv. Idempotent / safe to re-run.
-- Spec: docs/superpowers/specs/2026-09-21-route-checkers-design.md
-- Purely additive. All tables are read/written by service-role API routes; RLS
-- is enabled with permission-keyed SELECT policies only (no client writes).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Checker ↔ route assignments (keyed on lower-cased email) -----------------
create table if not exists public.tms_route_checker_assignment (
  id            uuid primary key default gen_random_uuid(),
  checker_email text not null check (checker_email = lower(btrim(checker_email))),
  route_id      uuid not null references public.tms_route(id) on delete cascade,
  is_active     boolean not null default true,
  assigned_by   uuid,
  notes         text,
  assigned_at   timestamptz not null default now(),
  created_at    timestamptz default now()
);
create unique index if not exists uq_tms_route_checker_assignment_active
  on public.tms_route_checker_assignment (checker_email, route_id) where is_active;
create index if not exists idx_tms_route_checker_assignment_route_active
  on public.tms_route_checker_assignment (route_id) where is_active;

-- 2. Route check header -------------------------------------------------------
create table if not exists public.tms_route_check (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid not null references public.tms_route(id),
  vehicle_id      uuid references public.tms_vehicle(id) on delete set null,
  checker_id      uuid not null references public.profiles(id),
  check_date      date not null,
  leg             text not null check (leg in ('onward','return')),
  status          text not null default 'draft' check (status in ('draft','submitted')),
  headcount       int  check (headcount is null or headcount between 0 and 500),
  unknown_count   int  check (unknown_count is null or unknown_count between 0 and 500),
  notes           text,
  -- snapshot at submit
  registered      int,
  booked          int,
  present         int,
  unpaid          int,
  without_booking int,
  not_on_route    int,
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tms_route_check_submitted_has_time
    check (status = 'draft' or submitted_at is not null)
);
create unique index if not exists uq_tms_route_check_one_draft
  on public.tms_route_check (checker_id, route_id, check_date, leg) where status = 'draft';
create index if not exists idx_tms_route_check_route_submitted
  on public.tms_route_check (route_id, submitted_at desc) where status = 'submitted';
drop trigger if exists trg_tms_route_check_updated_at on public.tms_route_check;
create trigger trg_tms_route_check_updated_at before update on public.tms_route_check
  for each row execute function public.tms_set_updated_at();

-- 3. People checked on the bus ------------------------------------------------
create table if not exists public.tms_route_check_person (
  id           uuid primary key default gen_random_uuid(),
  check_id     uuid not null references public.tms_route_check(id) on delete cascade,
  person_kind  text not null check (person_kind in ('learner','staff','manual')),
  learner_id   uuid,
  staff_id     uuid,
  manual_type  text check (manual_type in ('learner_no_card','staff_no_card','outside')),
  manual_name  text,
  matched_by   text check (matched_by in ('jkkn_id','uuid','roll_number','register_number','staff_id','manual')),
  scanned_code text,
  outcome      text not null check (outcome in ('ok','not_on_route','no_booking','fee_unpaid','unknown_card','manual')),
  on_route     boolean,
  booked       boolean,
  fee_state    text check (fee_state in ('paid','unpaid','none','unknown','exempt')),
  notes        text,
  created_at   timestamptz not null default now(),
  constraint tms_route_check_person_kind_fields check (
    (person_kind = 'learner' and learner_id is not null)
    or (person_kind = 'staff' and staff_id is not null)
    or (person_kind = 'manual' and manual_type is not null and manual_name is not null)
  )
);
create index if not exists idx_tms_route_check_person_check on public.tms_route_check_person (check_id);

-- RLS: read via permission; no client writes (service role bypasses RLS).
-- Checkers read through service-role APIs.
do $$
declare t text;
begin
  foreach t in array array['tms_route_checker_assignment','tms_route_check','tms_route_check_person'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$create policy %I on public.%I for select using (
      public.is_super_admin() or public.user_has_permission('tms.route_check.manage'))$p$, t || '_select', t);
  end loop;
end $$;

-- 4. Checker access: route ids a profile is an active checker for ------------
-- Matches the profile's email, or the matching staff row's email /
-- institution_email (case-insensitive). Callable only for yourself unless
-- service role. `is distinct from` keeps it fail-closed when no JWT role is set.
create or replace function public.tms_route_checker_route_ids(p_profile_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare v_email text; v_ids uuid[];
begin
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or auth.uid() <> p_profile_id) then
    return '{}'::uuid[];
  end if;
  select lower(btrim(email)) into v_email from profiles where id = p_profile_id;
  select coalesce(array_agg(distinct a.route_id), '{}') into v_ids
  from tms_route_checker_assignment a
  where a.is_active and (
    a.checker_email = v_email
    or a.checker_email in (
      select lower(btrim(x)) from staff s,
        lateral (values (s.email), (s.institution_email)) v(x)
      where x is not null and (s.profile_id = p_profile_id
        or lower(btrim(s.email)) = v_email or lower(btrim(s.institution_email)) = v_email)
    ));
  return v_ids;
end $$;
revoke all on function public.tms_route_checker_route_ids(uuid) from public;
revoke all on function public.tms_route_checker_route_ids(uuid) from anon;
grant execute on function public.tms_route_checker_route_ids(uuid) to authenticated, service_role;

-- 5. Permission → transport_head.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.route_check.manage": true}'::jsonb,
    updated_at = now()
where role_key = 'transport_head';
