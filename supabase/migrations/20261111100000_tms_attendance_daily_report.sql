-- Daily attendance report for the admin Attendance page (one bus per row, one
-- chosen day): learners, present, absent, who scanned.
--
-- Same shape as tms_attendance_coverage: ONE ROW PER ROUTE with the days folded
-- into a jsonb array, so a 5-week look-back is still ~25 rows and PostgREST's
-- 1,000-row cap is out of reach. The look-back is what lets one call feed the
-- chosen day, the "last 7 days" strip and the "not marked since" streak.
--
-- Read-only. Writes nothing, creates no table, alters no column.
--
-- Day element keys (short: they repeat once per route-day):
--   d = trip_date
--   p = present                (transport riders)
--   s = absent, marked by staff
--   a = absent, written by the auto-close job (method = 'auto')
--   o = hostel / irregular riders scanned present (not on the bus list)
--   m = how many different people marked (auto job excluded)
--   f, l = first and last staff mark, 'HH24:MI' in IST
--   x = service-calendar exception applies (holiday)
--
-- Since 2026-09-21 staff only scan cards, so s is 0 and every absence is an
-- auto row: "absent" means "on a bus somebody scanned, this learner was not
-- scanned". m beside it is what tells a real absence from a thin scan.
--
-- Sundays are left out of the series (buses never run), as in the coverage
-- function. The roster rule mirrors it too: allocated bus_required learners in
-- an active lifecycle status. Keep the two in sync by hand.
create or replace function public.tms_attendance_daily_report(
  p_from      date,
  p_to        date,
  p_direction text default 'onward'
)
returns table (
  route_id     uuid,
  route_number text,
  route_name   text,
  has_bus      boolean,
  roster       int,
  incharges    int,
  days         jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as trip_date
    from generate_series(p_from, p_to, interval '1 day') d
    where extract(dow from d) <> 0
  ),
  roster as (
    select transport_route_id as route_id, count(*)::int as total
    from learners_profiles
    where bus_required and transport_route_id is not null
      and lifecycle_status in ('active', 'admitted', 'account')
    group by 1
  ),
  -- staff_email is stored lower-cased, but old rows are not guaranteed to be.
  incharge as (
    select route_id, count(distinct lower(staff_email))::int as total
    from tms_staff_route_assignment
    where is_active
    group by 1
  ),
  marks as (
    select a.route_id, a.trip_date,
           count(*) filter (where a.rider_kind = 'transport' and a.status = 'present')::int as present,
           count(*) filter (where a.rider_kind = 'transport' and a.status = 'absent' and a.method <> 'auto')::int as staff_absent,
           count(*) filter (where a.rider_kind = 'transport' and a.status = 'absent' and a.method =  'auto')::int as auto_absent,
           count(*) filter (where a.rider_kind <> 'transport' and a.status = 'present')::int as off_roster,
           count(distinct a.scanned_by) filter (where a.method <> 'auto')::int as markers,
           to_char(min(a.scanned_at) filter (where a.method <> 'auto') at time zone 'Asia/Kolkata', 'HH24:MI') as first_scan,
           to_char(max(a.scanned_at) filter (where a.method <> 'auto') at time zone 'Asia/Kolkata', 'HH24:MI') as last_scan
    from tms_attendance a
    where a.trip_date between p_from and p_to
      and a.direction = p_direction
    group by 1, 2
  )
  select r.id, r.route_number, r.route_name,
         -- EXISTS, not "vehicle_id is not null": some routes point at a vehicle
         -- that no longer exists.
         exists (select 1 from tms_vehicle v where v.id = r.vehicle_id),
         coalesce(ro.total, 0),
         coalesce(i.total, 0),
         jsonb_agg(jsonb_build_object(
           'd', d.trip_date,
           'p', coalesce(m.present, 0),
           's', coalesce(m.staff_absent, 0),
           'a', coalesce(m.auto_absent, 0),
           'o', coalesce(m.off_roster, 0),
           'm', coalesce(m.markers, 0),
           'f', m.first_scan,
           'l', m.last_scan,
           -- EXISTS, not a join: an all-routes row and a per-route row may both
           -- exist for one date, and a join would emit that day twice.
           'x', exists (
             select 1 from tms_service_calendar h
              where h.exception_date = d.trip_date
                and (h.route_id is null or h.route_id = r.id)
           )
         ) order by d.trip_date)
  from tms_route r
  cross join days d
  left join marks m     on m.route_id = r.id and m.trip_date = d.trip_date
  left join roster ro   on ro.route_id = r.id
  left join incharge i  on i.route_id = r.id
  where r.status = 'active'
  group by r.id, r.route_number, r.route_name, r.vehicle_id, ro.total, i.total
  order by r.route_number;
$$;

-- New functions inherit EXECUTE for PUBLIC; the API calls this with the
-- service role after checking tms.attendance.view.
revoke all on function public.tms_attendance_daily_report(date, date, text) from public, anon, authenticated;
grant execute on function public.tms_attendance_daily_report(date, date, text) to service_role;

comment on function public.tms_attendance_daily_report(date, date, text) is
  'Admin Attendance, Daily report: one row per active route, days folded into jsonb (present, staff/auto absent, markers, scan times, holiday).';
