-- Transport Reports, part 2: the two roll-ups.
-- Part 1 (20260918120000) holds the per-learner rows and the shared rules.
--
-- COUNTING RULES, and why each column exists separately:
--   booked          learner had a booking for that bus that day
--   boarded         booked AND marked present -- the NUMERATOR of the %
--   no_show         booked and NOT marked present (absent or never marked)
--   without_booking marked present with no booking (a walk-up)
--   boarded_total   every present mark, booked or not
--   absent_marks    rows explicitly marked absent (staff or the auto job)
--   auto_absent     of those, the ones the auto-close job wrote
-- attendance_pct = boarded / booked (owner ruling 2026-09-18: of those who
-- said they would travel, how many did). Folding walk-ups into the numerator
-- is what produced 184% for a college whose riders mostly do not book, so
-- boarded_total is reported beside it rather than inside it.
--
-- Day counts are summed over the range; FEE counts are per learner, because
-- counting them per day would multiply one unpaid learner by the number of
-- service days and read as a fleet in arrears.

drop function if exists public.tms_report_route_summary(date, date, text, uuid[], uuid[], uuid[]);
drop function if exists public.tms_report_institution_summary(date, date, text, text, uuid[], uuid[], uuid[]);

create or replace function public.tms_report_route_summary(
  p_from            date,
  p_to              date,
  p_direction       text    default 'onward',
  p_route_ids       uuid[]  default null,
  p_institution_ids uuid[]  default null,
  p_department_ids  uuid[]  default null
)
returns table (
  route_id           uuid,
  route_number       text,
  route_name         text,
  learners           bigint,
  service_days       bigint,
  booked             bigint,
  boarded            bigint,
  no_show            bigint,
  without_booking    bigint,
  boarded_total      bigint,
  absent_marks       bigint,
  unmarked           bigint,
  auto_absent        bigint,
  attendance_pct     numeric,
  fees_paid          bigint,
  fees_unpaid        bigint,
  fees_no_bill       bigint,
  amount_owed        numeric
)
language sql
stable
as $fn$
  with days as (
    select d::date as day
      from generate_series(p_from, p_to, interval '1 day') d
     where extract(isodow from d) <> 7
       and not exists (
         select 1 from public.tms_service_calendar c
          where c.exception_date = d::date and c.route_id is null
       )
  ),
  learners as (
    select lp.id, lp.transport_route_id
      from public.learners_profiles lp
     where lp.bus_required
       and lp.lifecycle_status::text in ('active', 'admitted', 'account')
       and (p_institution_ids is null or lp.institution_id = any(p_institution_ids))
       and (p_department_ids  is null or lp.department_id  = any(p_department_ids))
  ),
  fees as (
    select * from public.tms_transport_fee_status_bulk(
      (select coalesce(array_agg(id), '{}'::uuid[]) from learners)
    )
  ),
  rows_ as (
    select
      coalesce(b.route_id, l.transport_route_id) as route_id,
      dy.day,
      (b.learner_id is not null) as booked,
      coalesce(a.status, 'unmarked') as attendance,
      a.method,
      coalesce(a.is_walk_up, false) as without_booking
    from days dy
    cross join learners l
    left join public.tms_booking b
      on b.learner_id = l.id and b.travel_date = dy.day
    left join public.tms_attendance a
      on a.learner_id = l.id and a.trip_date = dy.day and a.direction = p_direction
    where not exists (
      select 1 from public.tms_service_calendar c
       where c.exception_date = dy.day
         and c.route_id = coalesce(b.route_id, l.transport_route_id)
    )
  ),
  day_agg as (
    select r.route_id,
           count(distinct r.day)                                                as service_days,
           count(*) filter (where r.booked)                                     as booked,
           count(*) filter (where r.booked and r.attendance = 'present')        as boarded,
           count(*) filter (where r.booked and r.attendance <> 'present')       as no_show,
           count(*) filter (where not r.booked and r.attendance = 'present')    as without_booking,
           count(*) filter (where r.attendance = 'present')                     as boarded_total,
           count(*) filter (where r.attendance = 'absent')                      as absent_marks,
           count(*) filter (where r.attendance = 'unmarked')                    as unmarked,
           count(*) filter (where r.method = 'auto')                            as auto_absent
      from rows_ r
     group by r.route_id
  ),
  learner_agg as (
    select l.transport_route_id as route_id,
           count(*)                                                             as learners,
           count(*) filter (where f.has_bills and f.unpaid_amount <= 0)         as fees_paid,
           count(*) filter (where f.has_bills and f.unpaid_amount >  0)         as fees_unpaid,
           count(*) filter (where not coalesce(f.has_bills, false))             as fees_no_bill,
           coalesce(sum(f.unpaid_amount) filter (where f.unpaid_amount > 0), 0) as amount_owed
      from learners l
      left join fees f on f.learner_id = l.id
     group by l.transport_route_id
  )
  select
    rt.id, rt.route_number, rt.route_name,
    coalesce(la.learners, 0),
    coalesce(da.service_days, 0),
    coalesce(da.booked, 0),
    coalesce(da.boarded, 0),
    coalesce(da.no_show, 0),
    coalesce(da.without_booking, 0),
    coalesce(da.boarded_total, 0),
    coalesce(da.absent_marks, 0),
    coalesce(da.unmarked, 0),
    coalesce(da.auto_absent, 0),
    round(100.0 * coalesce(da.boarded, 0) / nullif(da.booked, 0), 1),
    coalesce(la.fees_paid, 0),
    coalesce(la.fees_unpaid, 0),
    coalesce(la.fees_no_bill, 0),
    coalesce(la.amount_owed, 0)
  from public.tms_route rt
  left join day_agg     da on da.route_id = rt.id
  left join learner_agg la on la.route_id = rt.id
  where (p_route_ids is null or rt.id = any(p_route_ids))
    and (da.route_id is not null or la.route_id is not null)
  order by rt.route_number nulls last;
$fn$;

revoke execute on function public.tms_report_route_summary(date, date, text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.tms_report_route_summary(date, date, text, uuid[], uuid[], uuid[]) to authenticated, service_role;

comment on function public.tms_report_route_summary(date, date, text, uuid[], uuid[], uuid[]) is
  'Admin Reports: per-route roll-up over a date range. boarded = booked AND present; attendance_pct = boarded / booked; walk-ups are reported separately.';

create or replace function public.tms_report_institution_summary(
  p_from            date,
  p_to              date,
  p_direction       text    default 'onward',
  p_group           text    default 'institution',
  p_route_ids       uuid[]  default null,
  p_institution_ids uuid[]  default null,
  p_department_ids  uuid[]  default null
)
returns table (
  group_id          uuid,
  group_name        text,
  parent_name       text,
  learners          bigint,
  booked            bigint,
  boarded           bigint,
  no_show           bigint,
  without_booking   bigint,
  boarded_total     bigint,
  absent_marks      bigint,
  unmarked          bigint,
  attendance_pct    numeric,
  fees_paid         bigint,
  fees_unpaid       bigint,
  fees_no_bill      bigint,
  amount_owed       numeric
)
language sql
stable
as $fn$
  with days as (
    select d::date as day
      from generate_series(p_from, p_to, interval '1 day') d
     where extract(isodow from d) <> 7
       and not exists (
         select 1 from public.tms_service_calendar c
          where c.exception_date = d::date and c.route_id is null
       )
  ),
  learners as (
    select lp.id, lp.transport_route_id, lp.institution_id,
           case when p_group = 'department' then lp.department_id else lp.institution_id end as group_id
      from public.learners_profiles lp
     where lp.bus_required
       and lp.lifecycle_status::text in ('active', 'admitted', 'account')
       and (p_institution_ids is null or lp.institution_id = any(p_institution_ids))
       and (p_department_ids  is null or lp.department_id  = any(p_department_ids))
       and (p_route_ids is null or lp.transport_route_id = any(p_route_ids))
  ),
  fees as (
    select * from public.tms_transport_fee_status_bulk(
      (select coalesce(array_agg(id), '{}'::uuid[]) from learners)
    )
  ),
  rows_ as (
    select
      l.group_id,
      (b.learner_id is not null) as booked,
      coalesce(a.status, 'unmarked') as attendance
    from days dy
    cross join learners l
    left join public.tms_booking b
      on b.learner_id = l.id and b.travel_date = dy.day
    left join public.tms_attendance a
      on a.learner_id = l.id and a.trip_date = dy.day and a.direction = p_direction
    where not exists (
      select 1 from public.tms_service_calendar c
       where c.exception_date = dy.day
         and c.route_id = coalesce(b.route_id, l.transport_route_id)
    )
  ),
  day_agg as (
    select r.group_id,
           count(*) filter (where r.booked)                                  as booked,
           count(*) filter (where r.booked and r.attendance = 'present')     as boarded,
           count(*) filter (where r.booked and r.attendance <> 'present')    as no_show,
           count(*) filter (where not r.booked and r.attendance = 'present') as without_booking,
           count(*) filter (where r.attendance = 'present')                  as boarded_total,
           count(*) filter (where r.attendance = 'absent')                   as absent_marks,
           count(*) filter (where r.attendance = 'unmarked')                 as unmarked
      from rows_ r
     group by r.group_id
  ),
  learner_agg as (
    select l.group_id,
           (array_agg(l.institution_id))[1] as institution_id,  -- min() has no uuid form
           count(*)                                                             as learners,
           count(*) filter (where f.has_bills and f.unpaid_amount <= 0)         as fees_paid,
           count(*) filter (where f.has_bills and f.unpaid_amount >  0)         as fees_unpaid,
           count(*) filter (where not coalesce(f.has_bills, false))             as fees_no_bill,
           coalesce(sum(f.unpaid_amount) filter (where f.unpaid_amount > 0), 0) as amount_owed
      from learners l
      left join fees f on f.learner_id = l.id
     group by l.group_id
  )
  select
    la.group_id,
    coalesce(case when p_group = 'department' then d.department_name else i.name end, 'Not set'),
    case when p_group = 'department' then pi.name end,
    la.learners,
    coalesce(da.booked, 0),
    coalesce(da.boarded, 0),
    coalesce(da.no_show, 0),
    coalesce(da.without_booking, 0),
    coalesce(da.boarded_total, 0),
    coalesce(da.absent_marks, 0),
    coalesce(da.unmarked, 0),
    round(100.0 * coalesce(da.boarded, 0) / nullif(da.booked, 0), 1),
    la.fees_paid, la.fees_unpaid, la.fees_no_bill, la.amount_owed
  from learner_agg la
  left join day_agg da             on da.group_id = la.group_id
  left join public.institutions i  on i.id  = la.group_id and p_group = 'institution'
  left join public.departments  d  on d.id  = la.group_id and p_group = 'department'
  left join public.institutions pi on pi.id = la.institution_id
  order by la.learners desc;
$fn$;

revoke execute on function public.tms_report_institution_summary(date, date, text, text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.tms_report_institution_summary(date, date, text, text, uuid[], uuid[], uuid[]) to authenticated, service_role;

comment on function public.tms_report_institution_summary(date, date, text, text, uuid[], uuid[], uuid[]) is
  'Admin Reports: per-institution or per-department roll-up over a date range. boarded = booked AND present; attendance_pct = boarded / booked.';
