-- Transport Reports: the admin portal's per-learner and roll-up reads.
--
-- WHY IN SQL. The existing bookings analytics pulls a date range into the
-- server and filters institution/department in memory, which is why it carries
-- a 366-day cap. Measured on live data, the same work in the database is
-- ~46ms for a week of every learner and ~48ms for a 30-day institution
-- roll-up, so these reports are expressed as set-based reads instead.
--
-- THREE READS, ONE SHAPE.
--   tms_report_learner_rows        one row per learner per service day
--   tms_report_route_summary       per route, over a range
--   tms_report_institution_summary per institution (or department), over a range
--
-- Rules these encode, all matching what the boarding screens already do:
--   * A service day is Mon-Sat, minus a full-fleet holiday in
--     tms_service_calendar (route_id is null). Route-specific exceptions are
--     applied per row, so one route's holiday never blanks another's.
--   * The bus a learner belongs to on a day is the one they BOOKED, else the
--     one they are allocated to. The bus they BOARDED comes from the
--     attendance row, which may differ (see lib/boarding/wrong-bus.ts).
--   * Attendance % is over BOOKED learners (owner ruling 2026-09-18): of
--     those who said they would travel, how many boarded.
--   * Fees are a snapshot of the CURRENT transport year, as of now, for every
--     report date -- tms_transport_fee_status_bulk is the same source the
--     boarding roster and the scanner use, so the three never disagree.
--
-- SECURITY: INVOKER, like the other tms_ report helpers; the API routes call
-- them with the service-role client after checking tms.reports.view. EXECUTE
-- is granted to authenticated only -- a new function inherits a PUBLIC grant,
-- so anon is revoked explicitly (see the 2026-09-11 note in
-- project-jkkn-id-card-scan).

-- ── 1. Per-learner rows ──────────────────────────────────────────────────
create or replace function public.tms_report_learner_rows(
  p_from              date,
  p_to                date,
  p_direction         text    default 'onward',
  p_route_ids         uuid[]  default null,
  p_institution_ids   uuid[]  default null,
  p_department_ids    uuid[]  default null,
  p_booked            text    default null,   -- 'yes' | 'no'
  p_attendance        text    default null,   -- 'present' | 'absent' | 'unmarked'
  p_fee               text    default null,   -- 'paid' | 'unpaid' | 'none'
  p_limit             integer default 100,
  p_offset            integer default 0
)
returns table (
  day                 date,
  learner_id          uuid,
  learner_name        text,
  roll_number         text,
  mobile              text,
  institution_name    text,
  department_name     text,
  program_name        text,
  route_number        text,
  route_name          text,
  usual_route_number  text,
  stop_name           text,
  booked              boolean,
  booked_route_number text,
  attendance          text,
  method              text,
  marked_at           timestamptz,
  marked_by_name      text,
  without_booking     boolean,
  boarded_route_number text,
  wrong_bus           boolean,
  fee_state           text,
  amount_owed         numeric,
  total_rows          bigint
)
language sql
stable
as $$
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
    select lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.student_mobile,
           lp.institution_id, lp.department_id, lp.program_id,
           lp.transport_route_id, lp.transport_stop_id
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
      dy.day,
      l.id as learner_id,
      nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), '') as learner_name,
      l.roll_number,
      l.student_mobile as mobile,
      l.institution_id, l.department_id, l.program_id,
      coalesce(b.route_id, l.transport_route_id) as expected_route_id,
      l.transport_route_id                       as allocated_route_id,
      coalesce(b.stop_id, l.transport_stop_id)   as stop_id,
      (b.learner_id is not null)                 as booked,
      case when b.route_id is distinct from l.transport_route_id then b.route_id end as booked_other_route_id,
      coalesce(a.status, 'unmarked')             as attendance,
      a.method,
      a.scanned_at                               as marked_at,
      a.scanned_by,
      coalesce(a.is_walk_up, false)              as without_booking,
      a.route_id                                 as boarded_route_id,
      case
        when not f.has_bills then 'none'
        when f.unpaid_amount > 0 then 'unpaid'
        else 'paid'
      end                                        as fee_state,
      coalesce(f.unpaid_amount, 0)               as amount_owed
    from days dy
    cross join learners l
    left join public.tms_booking b
      on b.learner_id = l.id and b.travel_date = dy.day
    left join public.tms_attendance a
      on a.learner_id = l.id and a.trip_date = dy.day and a.direction = p_direction
    left join fees f on f.learner_id = l.id
    -- A route's own service exception blanks that route only.
    where not exists (
      select 1 from public.tms_service_calendar c
       where c.exception_date = dy.day
         and c.route_id = coalesce(b.route_id, l.transport_route_id)
    )
  ),
  filtered as (
    select * from rows_ r
     -- A learner belongs to a route list when ALLOCATED to it or BOOKED on
     -- it that day -- the same union the in-charge roster shows, so the two
     -- screens never disagree about who is on a bus.
     where (p_route_ids is null or r.expected_route_id = any(p_route_ids) or r.allocated_route_id = any(p_route_ids))
       and (p_booked is null or (p_booked = 'yes') = r.booked)
       and (p_attendance is null or r.attendance = p_attendance)
       and (p_fee is null or r.fee_state = p_fee)
  )
  select
    f.day,
    f.learner_id,
    coalesce(f.learner_name, 'Learner'),
    f.roll_number,
    f.mobile,
    i.name,
    d.department_name,
    pr.program_name,
    rt.route_number,
    rt.route_name,
    ur.route_number,
    st.stop_name,
    f.booked,
    br.route_number,
    f.attendance,
    f.method,
    f.marked_at,
    mp.full_name,
    f.without_booking,
    ar.route_number,
    (f.boarded_route_id is not null and f.boarded_route_id is distinct from f.expected_route_id),
    f.fee_state,
    f.amount_owed,
    count(*) over () as total_rows
  from filtered f
  left join public.institutions i    on i.id  = f.institution_id
  left join public.departments   d   on d.id  = f.department_id
  left join public.programs      pr  on pr.id = f.program_id
  left join public.tms_route     rt  on rt.id = f.expected_route_id
  left join public.tms_route     ur  on ur.id = f.allocated_route_id
  left join public.tms_route     br  on br.id = f.booked_other_route_id
  left join public.tms_route     ar  on ar.id = f.boarded_route_id
  left join public.tms_route_stop st on st.id = f.stop_id
  left join public.profiles      mp  on mp.id = f.scanned_by
  order by f.day, rt.route_number nulls last, f.roll_number nulls last, f.learner_name
  limit greatest(coalesce(p_limit, 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.tms_report_learner_rows(
  date, date, text, uuid[], uuid[], uuid[], text, text, text, integer, integer
) from public, anon;
grant execute on function public.tms_report_learner_rows(
  date, date, text, uuid[], uuid[], uuid[], text, text, text, integer, integer
) to authenticated, service_role;

comment on function public.tms_report_learner_rows(
  date, date, text, uuid[], uuid[], uuid[], text, text, text, integer, integer
) is 'Admin Reports: one row per learner per service day with booking, attendance and (current) fee state. total_rows carries the unpaginated count.';
