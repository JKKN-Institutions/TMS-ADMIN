-- Attendance coverage aggregate for the admin grid.
--
-- Returns ONE ROW PER ROUTE with the per-day counts folded into a jsonb array.
-- That shape is deliberate: PostgREST caps result sets at 1,000 rows, and a
-- row-per-route-day result would breach it at ~40 days across 25 routes. One
-- row per route is 25 rows for ANY range, so the grid needs no date cap.
--
-- Read-only. Writes nothing, creates no table, alters no column.
--
-- Day element keys are short because they repeat once per route-day:
--   d = trip_date, h = human marks, a = auto marks, x = holiday
--
-- 'human' EXCLUDES method='auto'. The auto-absent cron writes those rows, and
-- counting them as human marks would make an unstaffed route read as covered --
-- which is exactly the failure this grid exists to surface.
--
-- Sundays are excluded from the day series (buses never run; see
-- lib/booking/window.ts isSunday). Service-calendar exceptions are NOT excluded
-- from the series -- they are FLAGGED via x, so the grid can render them as
-- holiday cells rather than silently shortening the calendar.
create or replace function public.tms_attendance_coverage(
  p_from      date,
  p_to        date,
  p_direction text default 'onward'
)
returns table (
  route_id     uuid,
  route_number text,
  route_name   text,
  roster       int,
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
  -- Mirrors ACTIVE_LIFECYCLE_STATUSES (lib/passengers/types.ts) and
  -- loadRouteAttendanceRoster (lib/booking/roster.ts), so a grid cell's
  -- roster denominator equals the drill-down page's total. Keep these two
  -- in sync by hand -- there is no shared SQL source of truth for the list.
  roster as (
    select transport_route_id as route_id, count(*)::int as total
    from learners_profiles
    where bus_required and transport_route_id is not null
      and lifecycle_status in ('active', 'admitted', 'account')
    group by 1
  ),
  marks as (
    select a.route_id, a.trip_date,
           count(*) filter (where a.method <> 'auto')::int as human,
           count(*) filter (where a.method =  'auto')::int as auto
    from tms_attendance a
    where a.trip_date between p_from and p_to
      and a.direction = p_direction
    group by 1, 2
  )
  select r.id, r.route_number, r.route_name, coalesce(ro.total, 0),
         jsonb_agg(jsonb_build_object(
           'd', d.trip_date,
           'h', coalesce(m.human, 0),
           'a', coalesce(m.auto, 0),
           -- EXISTS, not a join: the unique indexes allow BOTH an all-routes
           -- row and a per-route row for the same date, and a join would then
           -- emit that route-day twice -- duplicating the day in the array and
           -- doubling its counts.
           'x', exists (
             select 1 from tms_service_calendar h
              where h.exception_date = d.trip_date
                and (h.route_id is null or h.route_id = r.id)
           )
         ) order by d.trip_date)
  from tms_route r
  cross join days d
  left join marks m  on m.route_id = r.id and m.trip_date = d.trip_date
  left join roster ro on ro.route_id = r.id
  where r.status = 'active'
  group by r.id, r.route_number, r.route_name, ro.total
  order by r.route_number;
$$;

revoke all on function public.tms_attendance_coverage(date, date, text) from public, anon, authenticated;
grant execute on function public.tms_attendance_coverage(date, date, text) to service_role;
