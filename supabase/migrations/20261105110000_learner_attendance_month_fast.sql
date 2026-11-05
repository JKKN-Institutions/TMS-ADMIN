-- tms_learner_attendance_month: replace the per-learner correlated subquery
-- for both_trip_days (it rescanned the whole month once per learner and hit
-- the API's 8s statement timeout for a ~1,900-learner month) with one
-- aggregate joined in. Same signature, same columns, same results.
-- Measured on October 2026: 1,932 rows in ~340 ms.

create or replace function public.tms_learner_attendance_month(
  p_month date, p_route_id uuid default null, p_rider_kind text default null
)
returns table(
  learner_id uuid, name text, roll_number text, institution_id uuid,
  route_id uuid, rider_kind text,
  days_travelled int, onward_present int, return_present int, both_trip_days int,
  staff_absent int, auto_absent int, without_booking int, last_travel date
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with bounds as (
    select date_trunc('month', p_month)::date as d0,
           (date_trunc('month', p_month) + interval '1 month')::date as d1
  ),
  att as (
    select a.* from tms_attendance a, bounds b
     where a.trip_date >= b.d0 and a.trip_date < b.d1
  ),
  -- The bus and rider type shown for the learner: their latest PRESENT trip,
  -- else their latest row.
  latest as (
    select distinct on (r.learner_id) r.learner_id, r.route_id, r.rider_kind
      from att r
     order by r.learner_id, (r.status = 'present') desc, r.trip_date desc, r.scanned_at desc
  ),
  both_days as (
    select x.learner_id, count(*) filter (where x.present_trips = 2)::int as both_trip_days
      from (
        select r.learner_id, r.trip_date, count(*) filter (where r.status = 'present') as present_trips
          from att r group by 1, 2
      ) x
     group by 1
  ),
  totals as (
    select r.learner_id,
           count(distinct r.trip_date) filter (where r.status = 'present')::int                       as days_travelled,
           count(*) filter (where r.status = 'present' and r.direction = 'onward')::int               as onward_present,
           count(*) filter (where r.status = 'present' and r.direction = 'return')::int               as return_present,
           count(*) filter (where r.status = 'absent' and r.method <> 'auto')::int                    as staff_absent,
           count(*) filter (where r.status = 'absent' and r.method = 'auto')::int                     as auto_absent,
           count(*) filter (where r.status = 'present' and r.is_walk_up)::int                         as without_booking,
           max(r.trip_date) filter (where r.status = 'present')                                       as last_travel,
           bool_or(r.route_id = p_route_id)                                                           as on_route
      from att r group by 1
  )
  select t.learner_id,
         nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), ''),
         l.roll_number, l.institution_id,
         la.route_id, la.rider_kind,
         t.days_travelled, t.onward_present, t.return_present, bd.both_trip_days,
         t.staff_absent, t.auto_absent, t.without_booking, t.last_travel
    from totals t
    join latest la on la.learner_id = t.learner_id
    join both_days bd on bd.learner_id = t.learner_id
    left join learners_profiles l on l.id = t.learner_id
   where (p_route_id is null or t.on_route)
     and (p_rider_kind is null or la.rider_kind = p_rider_kind)
   order by 2 nulls last, 3;
$function$;

revoke all on function public.tms_learner_attendance_month(date, uuid, text) from public, anon, authenticated;
grant execute on function public.tms_learner_attendance_month(date, uuid, text) to service_role;
