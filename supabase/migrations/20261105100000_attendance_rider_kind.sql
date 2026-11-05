-- Hostel / irregular bus riders + learner monthly register (2026-11-05).
-- Spec: docs/superpowers/specs/2026-11-05-hostel-irregular-riders-register-design.md
--
-- 1. tms_attendance.rider_kind: who the rider was WHEN marked
--    (transport | hosteller | non_transport). Rule = lib/attendance/rider-kind.ts.
-- 2. tms_mark_attendance: optional per-mark key `rider_kind`; absent key keeps
--    the stored value on update, and inserts 'transport' (only the scan route
--    can record an off-roster rider, and it always sends the key).
-- 3. tms_attendance_coverage: only transport riders count toward "was this bus
--    marked" — hostellers are not on the bus list.
-- 4. tms_learner_attendance_month: one row per learner for a month.
-- 5. index on trip_date for month-wide reads.

-- ── 1. column + backfill (owner choice: old rows by CURRENT status) ──────────
alter table public.tms_attendance
  add column if not exists rider_kind text not null default 'transport';

alter table public.tms_attendance
  drop constraint if exists tms_attendance_rider_kind_check;
alter table public.tms_attendance
  add constraint tms_attendance_rider_kind_check
  check (rider_kind in ('transport', 'hosteller', 'non_transport'));

-- hostel_allocations.learner_id is profiles.id (the login account), NOT
-- learners_profiles.id — join through learners_profiles.profile_id.
update public.tms_attendance a
   set rider_kind = case
         when l.bus_required is true and l.transport_route_id is not null then 'transport'
         when exists (
           select 1 from public.hostel_allocations h
            where h.learner_id = l.profile_id and h.status::text = 'active'
         ) then 'hosteller'
         else 'non_transport'
       end
  from public.learners_profiles l
 where l.id = a.learner_id
   and not (l.bus_required is true and l.transport_route_id is not null);

create index if not exists idx_tms_attendance_trip_date
  on public.tms_attendance (trip_date);

-- ── 2. tms_mark_attendance: + rider_kind (rest byte-for-byte as live) ────────
create or replace function public.tms_mark_attendance(
  p_marks jsonb, p_trip_date date, p_direction text, p_actor uuid,
  p_method text default 'manual'::text, p_allow_override boolean default false
)
returns table(learner_id uuid, outcome text, existing_status text, existing_by uuid, existing_at timestamp with time zone)
language plpgsql
as $function$
#variable_conflict use_column
declare
  m           jsonb;
  v_learner   uuid;
  v_now       timestamptz := now();
  v_at        timestamptz;
  v_prev      record;
  v_written   boolean;
begin
  if p_direction not in ('onward', 'return') then
    raise exception 'direction must be onward or return, got %', p_direction;
  end if;
  if p_actor is null then
    raise exception 'actor is required';
  end if;

  for m in select * from jsonb_array_elements(p_marks)
  loop
    v_learner := (m->>'learner_id')::uuid;
    v_at := coalesce(nullif(m->>'scanned_at', '')::timestamptz, v_now);

    if (m->>'status') not in ('present', 'absent') then
      raise exception 'status must be present or absent, got %', (m->>'status');
    end if;

    select a.status, a.scanned_by, a.scanned_at
      into v_prev
      from public.tms_attendance a
     where a.learner_id = v_learner
       and a.trip_date  = p_trip_date
       and a.direction  = p_direction;

    insert into public.tms_attendance as t (
      learner_id, route_id, stop_id, trip_date, direction,
      status, method, is_walk_up, scanned_by, scanned_at, booked_route_id, rider_kind
    )
    values (
      v_learner,
      (m->>'route_id')::uuid,
      nullif(m->>'stop_id', '')::uuid,
      p_trip_date,
      p_direction,
      m->>'status',
      p_method,
      coalesce((m->>'is_walk_up')::boolean, false),
      p_actor,
      v_at,
      nullif(m->>'booked_route_id', '')::uuid,
      coalesce(nullif(m->>'rider_kind', ''), 'transport')
    )
    on conflict (learner_id, trip_date, direction) do update
    set status              = excluded.status,
        method              = excluded.method,
        is_walk_up          = case when m ? 'is_walk_up'
                                   then excluded.is_walk_up else t.is_walk_up end,
        rider_kind          = case when m ? 'rider_kind'
                                   then excluded.rider_kind else t.rider_kind end,
        route_id            = case when coalesce((m->>'move_route')::boolean, false)
                                   then excluded.route_id else t.route_id end,
        stop_id             = case when coalesce((m->>'move_route')::boolean, false)
                                   then excluded.stop_id else t.stop_id end,
        booked_route_id     = case when m ? 'booked_route_id'
                                   then excluded.booked_route_id else t.booked_route_id end,
        scanned_by          = excluded.scanned_by,
        scanned_at          = excluded.scanned_at,
        previous_status     = case
                                when t.scanned_by is distinct from excluded.scanned_by
                                 and t.status     is distinct from excluded.status
                                then t.status else t.previous_status end,
        previous_scanned_by = case
                                when t.scanned_by is distinct from excluded.scanned_by
                                 and t.status     is distinct from excluded.status
                                then t.scanned_by else t.previous_scanned_by end,
        previous_scanned_at = case
                                when t.scanned_by is distinct from excluded.scanned_by
                                 and t.status     is distinct from excluded.status
                                then t.scanned_at else t.previous_scanned_at end
      where t.status is distinct from excluded.status
        and (
          t.scanned_by is null
          or t.scanned_by = p_actor
          or p_allow_override
          or coalesce((m->>'allow_override')::boolean, false)
        )
    returning true into v_written;

    learner_id      := v_learner;
    existing_status := v_prev.status;
    existing_by     := v_prev.scanned_by;
    existing_at     := v_prev.scanned_at;

    if v_written then
      outcome := case
                   when v_prev.status is null then 'inserted'
                   when v_prev.scanned_by is not distinct from p_actor then 'updated_own'
                   else 'overridden'
                 end;
    else
      outcome := case
                   when v_prev.status is not distinct from (m->>'status') then 'noop_same_status'
                   else 'locked'
                 end;
    end if;

    v_written := null;
    return next;
  end loop;
end;
$function$;

-- ── 3. coverage: transport riders only ──────────────────────────────────────
create or replace function public.tms_attendance_coverage(p_from date, p_to date, p_direction text default 'onward'::text)
returns table(route_id uuid, route_number text, route_name text, roster integer, days jsonb)
language sql
stable security definer
set search_path to 'public'
as $function$
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
  -- Hostel / irregular riders are not on the bus list (no denominator), so
  -- they must not count as the bus being marked either.
  marks as (
    select a.route_id, a.trip_date,
           count(*) filter (where a.method <> 'auto')::int as human,
           count(*) filter (where a.method =  'auto')::int as auto
    from tms_attendance a
    where a.trip_date between p_from and p_to
      and a.direction = p_direction
      and a.rider_kind = 'transport'
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
$function$;

-- ── 4. one row per learner for a month ──────────────────────────────────────
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
  per_day as (
    select r.learner_id, r.trip_date,
           count(*) filter (where r.status = 'present') as present_trips
      from att r group by 1, 2
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
         t.days_travelled, t.onward_present, t.return_present,
         (select count(*)::int from per_day pd where pd.learner_id = t.learner_id and pd.present_trips = 2),
         t.staff_absent, t.auto_absent, t.without_booking, t.last_travel
    from totals t
    join latest la on la.learner_id = t.learner_id
    left join learners_profiles l on l.id = t.learner_id
   where (p_route_id is null or t.on_route)
     and (p_rider_kind is null or la.rider_kind = p_rider_kind)
   order by 2 nulls last, 3;
$function$;

revoke all on function public.tms_learner_attendance_month(date, uuid, text) from public, anon, authenticated;
grant execute on function public.tms_learner_attendance_month(date, uuid, text) to service_role;
