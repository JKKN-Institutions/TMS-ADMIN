-- Phase 3: learner transport-enrollment requests. TMS-owned, additive.
-- A bus-required learner with no allocation requests a route + boarding stop; an
-- admin (tms.enrollment.manage) approves -> learners_profiles allocation is set.
create table if not exists public.tms_enrollment_request (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners_profiles(id) on delete cascade,
  preferred_route_id uuid references public.tms_route(id) on delete set null,
  preferred_stop_id uuid references public.tms_route_stop(id) on delete set null,
  request_type text not null default 'new' check (request_type in ('new','change')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reason text,
  special_requirements text,
  admin_notes text,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tms_enr_req_learner on public.tms_enrollment_request(learner_id);
create index if not exists idx_tms_enr_req_status on public.tms_enrollment_request(status);
-- At most one OPEN (pending) request per learner.
create unique index if not exists uq_tms_enr_req_one_pending
  on public.tms_enrollment_request(learner_id) where status = 'pending';

-- RLS as defense-in-depth (the APIs use service-role after a permission check, but
-- this backstops any user-scoped/direct access). Learner sees/creates/cancels OWN
-- rows, mapped via learners_profiles.profile_id = auth.uid().
alter table public.tms_enrollment_request enable row level security;

create policy tms_enr_req_learner_select on public.tms_enrollment_request
  for select using (
    learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid())
  );
create policy tms_enr_req_learner_insert on public.tms_enrollment_request
  for insert with check (
    learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid())
  );
create policy tms_enr_req_learner_update on public.tms_enrollment_request
  for update using (
    learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid())
  );
