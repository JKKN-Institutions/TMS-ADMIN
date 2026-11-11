-- Admin Attendance, In-charge marking report: did each bus in-charge scan
-- their learners, day by day?
--
-- Read-only aggregate over tms_attendance. Only HUMAN marks count: rows the
-- closing job writes (method = 'auto') are nobody's work, and counting them
-- would show every in-charge as having marked.
--
--   person_days : per scanner (profiles.id) per day, for the chosen leg —
--                 how many learners they marked and their first/last scan (IST)
--   route_days  : per bus per day, for the chosen leg — how many learners
--                 anyone marked (so "someone else marked the bus" is visible)
--   fleet_days  : days with any human mark anywhere, either leg. A day nobody
--                 marked is not a service day (same rule as the in-charge
--                 bill review).
create or replace function public.tms_incharge_marking_report(p_from date, p_to date, p_direction text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'person_days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', x.scanned_by, 'email', lower(trim(p.email)), 'd', x.trip_date,
        'n', x.n, 'first', x.first_at, 'last', x.last_at))
      from (
        select scanned_by, trip_date, count(*)::int n,
               to_char(min(scanned_at) at time zone 'Asia/Kolkata', 'HH24:MI') first_at,
               to_char(max(scanned_at) at time zone 'Asia/Kolkata', 'HH24:MI') last_at
        from tms_attendance
        where trip_date between p_from and p_to and direction = p_direction
          and coalesce(method, '') <> 'auto' and scanned_by is not null
        group by scanned_by, trip_date
      ) x
      left join profiles p on p.id = x.scanned_by
    ), '[]'::jsonb),
    'route_days', coalesce((
      select jsonb_agg(jsonb_build_object('route_id', r.route_id, 'd', r.trip_date, 'n', r.n))
      from (
        select route_id, trip_date, count(*)::int n
        from tms_attendance
        where trip_date between p_from and p_to and direction = p_direction
          and coalesce(method, '') <> 'auto' and route_id is not null
        group by route_id, trip_date
      ) r
    ), '[]'::jsonb),
    'fleet_days', coalesce((
      select jsonb_agg(f.d order by f.d)
      from (
        select distinct trip_date d from tms_attendance
        where trip_date between p_from and p_to and coalesce(method, '') <> 'auto'
      ) f
    ), '[]'::jsonb)
  );
$$;

-- New functions inherit EXECUTE for PUBLIC; the API calls this with the
-- service role after checking tms.attendance.view.
revoke all on function public.tms_incharge_marking_report(date, date, text) from public, anon, authenticated;
grant execute on function public.tms_incharge_marking_report(date, date, text) to service_role;

comment on function public.tms_incharge_marking_report(date, date, text) is
  'Admin Attendance, In-charge marking report: human marks per scanner/day and per bus/day for one leg, plus fleet service days.';
