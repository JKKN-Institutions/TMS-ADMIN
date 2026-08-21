-- Per-in-charge attendance shares.
--
-- Attendance coverage used to be scored per ROUTE: one mark by one person
-- credited every in-charge on that route. These two tables give each in-charge
-- a share of the bus they are personally answerable for, and a way to hand it
-- over for a day.
--
-- Both ship dormant. Nothing reads them for scoring until the
-- inchargeShareScoringEnabled setting is turned on.

create table if not exists tms_incharge_roster_allocation (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references tms_route(id) on delete cascade,
  assignment_id uuid not null references tms_staff_route_assignment(id) on delete cascade,
  staff_email   text not null,
  learner_id    uuid not null references learners_profiles(id) on delete cascade,
  -- Pinned by an admin. Survives every recompute and is excluded from the
  -- balanced pool.
  is_manual     boolean not null default false,
  allocated_at  timestamptz not null default now(),
  allocated_by  uuid,
  -- One owner per learner, enforced by the database rather than by application
  -- care. A learner belongs to exactly one route, so a UNIQUE on (route_id,
  -- learner_id) would be weaker and would let a stale row on an old route
  -- double-own a student -- i.e. double-bill against two shares.
  constraint tms_incharge_roster_allocation_learner_key unique (learner_id)
);

create index if not exists tms_incharge_roster_allocation_assignment_idx
  on tms_incharge_roster_allocation (assignment_id);
create index if not exists tms_incharge_roster_allocation_route_idx
  on tms_incharge_roster_allocation (route_id);

comment on table tms_incharge_roster_allocation is
  'Which in-charge owns which learner''s attendance. Recomputed on change, never on a schedule -- a stable share is what lets an in-charge learn who their students are.';

create table if not exists tms_incharge_absence (
  id                     uuid primary key default gen_random_uuid(),
  assignment_id          uuid not null references tms_staff_route_assignment(id) on delete cascade,
  staff_email            text not null,
  route_id               uuid not null references tms_route(id) on delete cascade,
  absence_date           date not null,
  reason                 text,
  covering_assignment_id uuid references tms_staff_route_assignment(id) on delete set null,
  cover_status           text not null default 'pending'
                         check (cover_status in ('pending', 'accepted', 'declined', 'uncovered')),
  declared_at            timestamptz not null default now(),
  responded_at           timestamptz,
  -- One declaration per person per day. A second POST updates the first.
  constraint tms_incharge_absence_day_key unique (assignment_id, absence_date)
);

create index if not exists tms_incharge_absence_date_idx
  on tms_incharge_absence (absence_date);
create index if not exists tms_incharge_absence_covering_idx
  on tms_incharge_absence (covering_assignment_id, absence_date);

comment on table tms_incharge_absence is
  'A declared absence excuses the in-charge for that date. An accepted cover moves the duty to the covering in-charge for that date only.';

-- Service-role only, matching tms_incharge_attendance_strike. Every read and
-- write goes through an API route that has already checked authority; leaving
-- RLS enabled with no policy means a stray anon client sees nothing.
alter table tms_incharge_roster_allocation enable row level security;
alter table tms_incharge_absence enable row level security;
