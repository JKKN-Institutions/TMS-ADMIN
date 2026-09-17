-- Wrong bus: record a boarding on the bus the learner actually got on.
--
-- A learner can sit on two bus lists: the route they are allocated to, and the
-- route they booked today. The attendance row belongs to ONE route, and until
-- now a later mark never changed it -- the upsert left route_id/stop_id as the
-- first writer set them (often the auto-absent job, on the BOOKED route). A
-- scan on the other bus then marked the learner present on a bus list nobody
-- on that bus was looking at.
--
-- 1. tms_attendance.booked_route_id: the bus the learner had booked when it is
--    NOT the bus they boarded. Null for every ordinary mark.
-- 2. tms_mark_attendance accepts two optional per-mark keys:
--      move_route       true -> an update also moves route_id/stop_id to the
--                       values in this mark (the bus actually boarded);
--      booked_route_id  stored as sent (null clears it) when present.
--    A mark without these keys behaves exactly as before. The ownership gate
--    (the WHERE on the conflict update) is untouched, so a mark that is not
--    allowed to write still moves nothing.
--
-- Signature, return columns, security (INVOKER) and grants are unchanged;
-- `create or replace` keeps the existing EXECUTE grants.

alter table public.tms_attendance
  add column if not exists booked_route_id uuid
    references public.tms_route(id) on delete set null;

comment on column public.tms_attendance.booked_route_id is
  'The route the learner had booked for this trip when it differs from route_id (the bus boarded). Null otherwise.';

create or replace function public.tms_mark_attendance(
  p_marks jsonb,
  p_trip_date date,
  p_direction text,
  p_actor uuid,
  p_method text default 'manual',
  p_allow_override boolean default false
)
returns table (
  learner_id uuid,
  outcome text,
  existing_status text,
  existing_by uuid,
  existing_at timestamptz
)
language plpgsql
as $$
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
      status, method, is_walk_up, scanned_by, scanned_at, booked_route_id
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
      nullif(m->>'booked_route_id', '')::uuid
    )
    on conflict (learner_id, trip_date, direction) do update
    set status              = excluded.status,
        method              = excluded.method,
        is_walk_up          = case when m ? 'is_walk_up'
                                   then excluded.is_walk_up else t.is_walk_up end,
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
$$;
