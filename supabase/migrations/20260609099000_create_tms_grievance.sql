-- Transport-specific grievances (distinct from the institutional grievance_tickets
-- ICC/ragging system, and from the broken legacy `grievances` admin module).
create table if not exists public.tms_grievance (
  id uuid primary key default gen_random_uuid(),
  learner_id  uuid not null references public.learners_profiles(id) on delete cascade,
  route_id    uuid references public.tms_route(id) on delete set null,
  category text not null default 'other'
    check (category in ('bus_delay','driver_behaviour','vehicle_condition','route_issue','safety','payment','other')),
  subject text not null,
  description text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status   text not null default 'open'   check (status in ('open','in_progress','resolved','closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution  text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tms_grievance_learner on public.tms_grievance(learner_id);
create index if not exists idx_tms_grievance_status on public.tms_grievance(status);

create table if not exists public.tms_grievance_comment (
  id uuid primary key default gen_random_uuid(),
  grievance_id uuid not null references public.tms_grievance(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_role text not null default 'learner' check (author_role in ('learner','admin')),
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_tms_grv_comment_grievance on public.tms_grievance_comment(grievance_id);

alter table public.tms_grievance enable row level security;
alter table public.tms_grievance_comment enable row level security;

create policy tms_grv_learner_select on public.tms_grievance
  for select using (learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid()));
create policy tms_grv_learner_insert on public.tms_grievance
  for insert with check (learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid()));

create policy tms_grvc_learner_select on public.tms_grievance_comment
  for select using (grievance_id in (
    select g.id from public.tms_grievance g
    join public.learners_profiles lp on lp.id = g.learner_id where lp.profile_id = auth.uid()));
create policy tms_grvc_learner_insert on public.tms_grievance_comment
  for insert with check (grievance_id in (
    select g.id from public.tms_grievance g
    join public.learners_profiles lp on lp.id = g.learner_id where lp.profile_id = auth.uid()));
