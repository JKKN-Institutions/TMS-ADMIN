-- ─────────────────────────────────────────────────────────────────────────────
-- Bus Inspection module (Transport Head checking) — Phase 1 schema.
-- Target: shared MyJKKN project kvizhngldtiuufknvehv. Idempotent / safe to re-run.
-- Spec: docs/superpowers/specs/2026-09-21-bus-inspection-design.md
-- All tables are read/written by service-role API routes; RLS is enabled with
-- permission-keyed SELECT policies only (no client writes).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- 1. Checklist master ---------------------------------------------------------
create table if not exists public.tms_inspection_checklist_item (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('documents','safety','mechanical','body_interior','driver')),
  label       text not null,
  description text,
  severity    text not null default 'normal' check (severity in ('critical','normal')),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
create unique index if not exists uq_tms_inspection_checklist_label
  on public.tms_inspection_checklist_item (category, lower(label));
drop trigger if exists trg_tms_inspection_checklist_updated_at on public.tms_inspection_checklist_item;
create trigger trg_tms_inspection_checklist_updated_at before update on public.tms_inspection_checklist_item
  for each row execute function public.tms_set_updated_at();

-- 2. Inspection header --------------------------------------------------------
create table if not exists public.tms_inspection (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_id         uuid not null references public.tms_vehicle(id) on delete restrict,
  route_id           uuid,
  driver_staff_id    uuid,
  inspected_by       uuid not null references public.profiles(id),
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  status             text not null default 'draft' check (status in ('draft','submitted')),
  result             text check (result in ('pass','pass_with_issues','fail')),
  headcount_observed int  check (headcount_observed is null or headcount_observed >= 0),
  riders_booked      int,
  riders_boarded     int,
  inspector_lat      numeric,
  inspector_lng      numeric,
  bus_distance_m     int,
  location_status    text check (location_status in ('ok','unavailable','bus_no_gps')),
  grounded           boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tms_inspection_submitted_has_result
    check (status = 'draft' or (submitted_at is not null and result is not null))
);
create unique index if not exists uq_tms_inspection_one_draft_per_vehicle
  on public.tms_inspection (vehicle_id) where status = 'draft';
create index if not exists idx_tms_inspection_vehicle_submitted
  on public.tms_inspection (vehicle_id, submitted_at desc) where status = 'submitted';
drop trigger if exists trg_tms_inspection_updated_at on public.tms_inspection;
create trigger trg_tms_inspection_updated_at before update on public.tms_inspection
  for each row execute function public.tms_set_updated_at();

-- 3. Inspection lines (snapshot of checklist) ---------------------------------
create table if not exists public.tms_inspection_item (
  id                uuid primary key default gen_random_uuid(),
  inspection_id     uuid not null references public.tms_inspection(id) on delete cascade,
  checklist_item_id uuid references public.tms_inspection_checklist_item(id) on delete set null,
  category          text not null,
  label             text not null,
  severity          text not null check (severity in ('critical','normal')),
  sort_order        int  not null default 0,
  result            text check (result in ('pass','fail','na')),
  note              text,
  photo_paths       text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  updated_at        timestamptz not null default now(),
  unique (inspection_id, checklist_item_id)
);
create index if not exists idx_tms_inspection_item_inspection on public.tms_inspection_item (inspection_id);
drop trigger if exists trg_tms_inspection_item_updated_at on public.tms_inspection_item;
create trigger trg_tms_inspection_item_updated_at before update on public.tms_inspection_item
  for each row execute function public.tms_set_updated_at();

-- 4. Issues (used from Phase 2) -----------------------------------------------
create table if not exists public.tms_inspection_issue (
  id                     uuid primary key default gen_random_uuid(),
  inspection_id          uuid not null references public.tms_inspection(id) on delete cascade,
  inspection_item_id     uuid references public.tms_inspection_item(id) on delete set null,
  vehicle_id             uuid not null references public.tms_vehicle(id) on delete restrict,
  title                  text not null,
  severity               text not null check (severity in ('critical','normal')),
  status                 text not null default 'open' check (status in ('open','resolved','verified')),
  due_date               date,
  resolution_note        text,
  resolution_photo_paths text[] not null default '{}' check (cardinality(resolution_photo_paths) <= 3),
  resolved_by            uuid, resolved_at timestamptz,
  verified_by            uuid, verified_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_tms_inspection_issue_vehicle_status on public.tms_inspection_issue (vehicle_id, status);
drop trigger if exists trg_tms_inspection_issue_updated_at on public.tms_inspection_issue;
create trigger trg_tms_inspection_issue_updated_at before update on public.tms_inspection_issue
  for each row execute function public.tms_set_updated_at();

-- 5. Learner spot-checks (used from Phase 3) ----------------------------------
create table if not exists public.tms_inspection_learner_check (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.tms_inspection(id) on delete cascade,
  learner_id    uuid,
  jkkn_id       text,
  outcome       text not null check (outcome in ('ok','wrong_bus','not_booked','fee_due','unknown_card')),
  on_this_route boolean, booked_today boolean, boarded_today boolean, fees_ok boolean,
  scanned_at    timestamptz not null default now()
);
create index if not exists idx_tms_inspection_learner_check_inspection on public.tms_inspection_learner_check (inspection_id);

-- RLS: read via permission; no client writes (service role bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array['tms_inspection_checklist_item','tms_inspection','tms_inspection_item',
                           'tms_inspection_issue','tms_inspection_learner_check'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$create policy %I on public.%I for select using (
      public.is_super_admin() or public.user_has_permission('tms.inspection.view')
      or public.user_has_permission('tms.inspection.conduct'))$p$, t || '_select', t);
  end loop;
end $$;

-- Private photo bucket.
insert into storage.buckets (id, name, public)
values ('tms-inspection-photos', 'tms-inspection-photos', false)
on conflict (id) do nothing;

-- Permissions → transport_head only.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
  || '{"tms.inspection.view": true, "tms.inspection.conduct": true, "tms.inspection.manage": true}'::jsonb,
    updated_at = now()
where role_key = 'transport_head';

-- Interval setting (keep an existing value).
insert into public.admin_settings (setting_type, settings_data, updated_at)
values ('inspection', '{"interval_days": 30}'::jsonb, now())
on conflict (setting_type) do nothing;

-- Seed checklist (idempotent on category+label).
insert into public.tms_inspection_checklist_item (category, label, severity, sort_order) values
  ('documents','RC book copy in bus','critical',10),
  ('documents','Insurance certificate in bus','critical',20),
  ('documents','Fitness certificate (FC) in bus','critical',30),
  ('documents','Permit in bus','critical',40),
  ('documents','PUC certificate in bus','normal',50),
  ('safety','Brakes working (service + parking)','critical',110),
  ('safety','Fire extinguisher present and not expired','critical',120),
  ('safety','First-aid kit stocked','critical',130),
  ('safety','Emergency exit opens and is unobstructed','critical',140),
  ('safety','Speed governor fitted and working','critical',150),
  ('safety','Horn working','normal',160),
  ('safety','Headlights, indicators and brake lights working','critical',170),
  ('mechanical','Tyres in good condition (tread, no cuts)','critical',210),
  ('mechanical','Spare tyre and jack available','normal',220),
  ('mechanical','Wipers working','normal',230),
  ('mechanical','Mirrors intact and adjusted','normal',240),
  ('mechanical','No oil / fuel / coolant leaks','critical',250),
  ('body_interior','Seats fixed and undamaged','normal',310),
  ('body_interior','Windows and glass intact','normal',320),
  ('body_interior','Floor and steps safe (no holes / loose plates)','normal',330),
  ('body_interior','Bus clean inside','normal',340),
  ('body_interior','Route board / bus number displayed','normal',350),
  ('driver','Driver carrying valid licence','critical',410),
  ('driver','Driver in uniform','normal',420),
  ('driver','Driver fit to drive (no alcohol / fatigue signs)','critical',430)
on conflict (category, (lower(label))) do nothing;
