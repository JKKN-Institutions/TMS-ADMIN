-- Auto-absent when an attendance window closes.
-- Spec: docs/superpowers/specs/2026-09-15-attendance-auto-absent-design.md
-- The pg_cron schedule is a SEPARATE migration applied after the app deploys.

-- 1. A method for rows the database writes.
alter table public.tms_attendance drop constraint tms_attendance_method_check;
alter table public.tms_attendance add constraint tms_attendance_method_check
  check (method = any (array['qr_scan'::text, 'manual'::text, 'id_card'::text, 'auto'::text]));

-- 2. Ledger: one row per (day, trip, route) the job has closed. This is what
--    stops the job re-marking a rider a person has since cleared.
create table if not exists public.tms_attendance_auto_close (
  trip_date    date        not null,
  direction    text        not null check (direction in ('onward', 'return')),
  route_id     uuid        not null references public.tms_route(id) on delete cascade,
  closed_at    timestamptz not null default now(),
  absent_count integer     not null default 0,
  primary key (trip_date, direction, route_id)
);
alter table public.tms_attendance_auto_close enable row level security;
-- No policies: service role / the SECURITY DEFINER function only.

-- 3. The job.
create or replace function public.tms_auto_close_attendance(p_now timestamptz default now())
returns table (out_direction text, out_route_id uuid, out_outcome text, out_absent_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date    date := (p_now at time zone 'Asia/Kolkata')::date;
  v_time    time := (p_now at time zone 'Asia/Kolkata')::time;
  v_dir     text;
  v_route   uuid;
  v_claimed boolean;
  v_count   integer;
begin
  -- No service: Sunday, or an all-routes calendar exception.
  if extract(isodow from v_date) = 7 then return; end if;
  if exists (select 1 from tms_service_calendar c
             where c.exception_date = v_date and c.route_id is null) then
    return;
  end if;

  -- Trips whose enforced window has ended today. enabled=false means "open all
  -- day", so such a trip never closes. Evening only when switched on.
  for v_dir in
    select aw.direction from tms_attendance_window aw
     where aw.enabled
       and (aw.direction = 'onward' or aw.is_active is true)
       and v_time >= aw.end_time
  loop
    for v_route in
      select rt.id from tms_route rt
       where not exists (select 1 from tms_attendance_auto_close l
                          where l.trip_date = v_date and l.direction = v_dir and l.route_id = rt.id)
         and not exists (select 1 from tms_service_calendar c
                          where c.exception_date = v_date and c.route_id = rt.id)
    loop
      -- No human mark on this route/trip today: the bus may not have run.
      -- Not ledgered, so a later run retries once late (offline) marks land.
      if not exists (select 1 from tms_attendance a
                      where a.route_id = v_route and a.trip_date = v_date
                        and a.direction = v_dir and a.method <> 'auto') then
        out_direction := v_dir; out_route_id := v_route;
        out_outcome := 'skipped_no_marks'; out_absent_count := 0;
        return next;
        continue;
      end if;

      -- Claim. Only the run that inserts the ledger row proceeds.
      v_claimed := null;
      insert into tms_attendance_auto_close (trip_date, direction, route_id)
      values (v_date, v_dir, v_route)
      on conflict do nothing
      returning true into v_claimed;
      if v_claimed is not true then continue; end if;

      -- Same set loadRouteAttendanceRoster shows: allocated riders UNION the
      -- day's bookings on this route. Booking stop wins. Any existing mark,
      -- on any route, wins over the auto-absent (do nothing on conflict).
      with allocated as (
        select lp.id as learner_id, lp.transport_stop_id as stop_id
          from learners_profiles lp
         where lp.transport_route_id = v_route
           and lp.bus_required
           and lp.lifecycle_status::text in ('active', 'admitted', 'account')
      ), booked as (
        select b.learner_id, b.stop_id
          from tms_booking b
         where b.route_id = v_route and b.travel_date = v_date
      ), roster as (
        select coalesce(a.learner_id, b.learner_id) as learner_id,
               coalesce(b.stop_id, a.stop_id)       as stop_id
          from allocated a
          full join booked b on b.learner_id = a.learner_id
      )
      insert into tms_attendance
        (learner_id, route_id, stop_id, trip_date, direction,
         status, method, is_walk_up, scanned_by, scanned_at)
      select ro.learner_id, v_route, ro.stop_id, v_date, v_dir,
             'absent', 'auto', false, null, p_now
        from roster ro
      on conflict (learner_id, trip_date, direction) do nothing;
      get diagnostics v_count = row_count;

      update tms_attendance_auto_close
         set absent_count = v_count
       where trip_date = v_date and direction = v_dir and route_id = v_route;

      out_direction := v_dir; out_route_id := v_route;
      out_outcome := 'closed'; out_absent_count := v_count;
      return next;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.tms_auto_close_attendance(timestamptz) from public, anon, authenticated;
grant execute on function public.tms_auto_close_attendance(timestamptz) to service_role;
