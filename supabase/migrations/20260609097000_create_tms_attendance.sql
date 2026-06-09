-- Transport boarding attendance. Written by the /boarding scanner (or manual mark);
-- a learner can read their OWN records.
create table if not exists public.tms_attendance (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners_profiles(id) on delete cascade,
  route_id   uuid references public.tms_route(id) on delete set null,
  stop_id    uuid references public.tms_route_stop(id) on delete set null,
  trip_date  date not null,
  direction  text not null default 'onward' check (direction in ('onward','return')),
  status     text not null default 'present' check (status in ('present','absent')),
  method     text not null default 'qr_scan' check (method in ('qr_scan','manual')),
  scanned_by uuid references public.profiles(id) on delete set null,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (learner_id, trip_date, direction)
);
create index if not exists idx_tms_attendance_learner on public.tms_attendance(learner_id);
create index if not exists idx_tms_attendance_trip on public.tms_attendance(route_id, trip_date);

alter table public.tms_attendance enable row level security;
create policy tms_att_learner_select on public.tms_attendance
  for select using (
    learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid())
  );
