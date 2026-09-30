-- In-charge bill auto-cancel (spec: docs/superpowers/specs/2026-09-30-incharge-bill-auto-cancel-design.md)
-- Additive only. Starts in PREVIEW: no bill changes until an admin switches to Auto.

create table if not exists public.tms_incharge_bill_review (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null,               -- staff.id (no FK, like tms_fee_bill.person_id)
  month               date not null check (extract(day from month) = 1),
  transport_year_id   uuid not null references public.tms_transport_year(id),
  route_ids           uuid[] not null default '{}',
  window_start        date not null,
  window_end          date not null,
  required_days       int not null,
  route_days          int not null,
  personal_days       int not null,
  personal_pct        numeric(5,1) not null,
  missed_route_dates  date[] not null default '{}',
  excused_dates       date[] not null default '{}',
  outcome             text not null check (outcome in ('passed','failed','not_enough_days')),
  reason              text not null,
  mode                text not null check (mode in ('preview','auto')),
  applied             boolean not null default false,
  bill_action         text not null default 'none' check (bill_action in ('none','cancelled')),
  bill_ids            uuid[] not null default '{}',
  outstanding_amount  numeric(12,2) not null default 0,
  cancelled_amount    numeric(12,2) not null default 0,
  error               text,
  decided_at          timestamptz not null default now(),
  applied_at          timestamptz,
  unique (person_id, month)
);
alter table public.tms_incharge_bill_review enable row level security; -- service role only

create table if not exists public.tms_incharge_excused_day (
  day         date primary key,
  reason      text not null check (length(trim(reason)) > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null
);
alter table public.tms_incharge_excused_day enable row level security; -- service role only

-- Small aggregates instead of ~90k attendance rows per month.
create or replace function public.tms_incharge_review_marks(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'route_days', coalesce((
      select jsonb_agg(jsonb_build_object('route_id', r.route_id, 'd', r.trip_date))
      from (select distinct route_id, trip_date from tms_attendance
            where trip_date between p_from and p_to and direction = 'onward'
              and status = 'present' and coalesce(method, '') <> 'auto' and route_id is not null) r
    ), '[]'::jsonb),
    'person_days', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', x.scanned_by, 'email', lower(trim(p.email)), 'd', x.trip_date))
      from (select distinct scanned_by, trip_date from tms_attendance
            where trip_date between p_from and p_to and coalesce(method, '') <> 'auto' and scanned_by is not null) x
      left join profiles p on p.id = x.scanned_by
    ), '[]'::jsonb),
    'fleet_days', coalesce((
      select jsonb_agg(f.d order by f.d)
      from (select distinct trip_date d from tms_attendance
            where trip_date between p_from and p_to and coalesce(method, '') <> 'auto') f
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.tms_incharge_review_marks(date, date) from public, anon, authenticated;
grant execute on function public.tms_incharge_review_marks(date, date) to service_role;

insert into public.admin_settings (setting_type, settings_data)
values ('incharge_bill_cancel', '{"mode":"preview","min_personal_pct":75,"min_required_days":10}'::jsonb)
on conflict (setting_type) do nothing;
