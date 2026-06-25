-- ─────────────────────────────────────────────────────────────────────────────
-- Route Optimization audit + rollback tables (Phase 2 "Apply").
--
-- When an admin applies a consolidation, each affected tms_booking row is moved
-- (UPDATE route_id/stop_id) to a healthy route that already serves the learner's
-- boarding stop. We record one run header + one item per move, snapshotting the
-- PREVIOUS route/stop so the whole run can be undone.
--
--   tms_route_optimization        — one row per applied run (header/summary).
--   tms_route_optimization_item   — one row per moved booking (from→to snapshot).
--
-- Snapshot columns intentionally carry NO foreign keys: an item must survive even
-- if a route/stop/learner is later removed, so the run stays auditable/undoable.
--
-- Admin-only. All access is via the service-role client (RLS bypassed); RLS is
-- enabled with no public policies so nothing is reachable with the anon/auth key.
--
-- Target: shared MyJKKN Supabase project (ref: kvizhngldtiuufknvehv). Additive,
-- idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_route_optimization (
  id uuid primary key default gen_random_uuid(),
  travel_date date not null,
  threshold_percent int not null default 50,
  total_moves int not null default 0,
  routes_cancelled int not null default 0,
  estimated_savings numeric not null default 0,
  summary jsonb,
  status text not null default 'applied' check (status in ('applied','rolled_back')),
  created_at timestamptz not null default now(),
  created_by uuid,
  rolled_back_at timestamptz,
  rolled_back_by uuid
);

create index if not exists idx_tms_route_opt_date
  on public.tms_route_optimization (travel_date, created_at desc);

create table if not exists public.tms_route_optimization_item (
  id uuid primary key default gen_random_uuid(),
  optimization_id uuid not null
    references public.tms_route_optimization(id) on delete cascade,
  learner_id uuid not null,
  travel_date date not null,
  learner_label text,            -- name/roll snapshot for readable audit
  from_route_id uuid,
  from_route_label text,
  from_stop_id uuid,
  to_route_id uuid,
  to_route_label text,
  to_stop_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_tms_route_opt_item_run
  on public.tms_route_optimization_item (optimization_id);

comment on table public.tms_route_optimization is
  'Header for an applied route-optimization run (consolidation of under-used buses).';
comment on table public.tms_route_optimization_item is
  'Per-booking from→to snapshot for one optimization run; used for rollback.';

alter table public.tms_route_optimization enable row level security;
alter table public.tms_route_optimization_item enable row level security;
-- No policies: admin-only, accessed exclusively through the service-role client.
