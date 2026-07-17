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
