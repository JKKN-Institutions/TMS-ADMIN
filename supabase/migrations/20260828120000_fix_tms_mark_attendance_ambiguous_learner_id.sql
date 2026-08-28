-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: `column reference "learner_id" is ambiguous` (SQLSTATE 42702).
--
-- 20260827090000 declares `returns table (learner_id uuid, ...)`, which also
-- declares a PL/pgSQL OUT VARIABLE named learner_id. Inside the body,
-- `on conflict (learner_id, trip_date, direction)` could then mean either that
-- variable or the tms_attendance column, so Postgres refused to plan the
-- statement and EVERY call raised -- manual marks and QR scans alike, walk-up
-- or not. The API surfaced it as a flat "Failed to save attendance" 500.
--
-- `#variable_conflict use_column` is the documented remedy: inside SQL
-- statements an ambiguous name resolves to the COLUMN, which is what every such
-- reference here intends. Plain PL/pgSQL assignments (`learner_id := v_learner`)
-- are unaffected -- an assignment target is always the variable -- so the
-- returned rows still carry the values lib/boarding/mark-batch.ts reads.
--
-- Behaviour is otherwise IDENTICAL to 20260827090000: same signature, same
-- arbitration WHERE, same outcome vocabulary. Only name resolution changes.
--
-- WHY NOTHING CAUGHT IT, and the lesson for the next SQL primitive:
-- lib/boarding/attendance-sql-parity.test.ts mirrors this logic in TypeScript
-- rather than executing it, and the function had never been applied to any
-- database, so it had never actually run. A pure-TS parity test can prove two
-- implementations AGREE; it cannot prove either one PARSES. Applying the
-- migration and calling the function once (inside a transaction that rolls
-- back) is the check that would have caught this in seconds.
--
-- Verified by execution before this file was written, all in one rolled-back
-- transaction against live data:
--   walk-up insert          -> 'inserted', is_walk_up stored true
--   same status re-asserted -> 'noop_same_status'   (idempotent, no duplicate)
--   different actor flips   -> 'locked'             (arbitration holds)
--   own mark flipped        -> 'updated_own'
--   manual mark, no is_walk_up key -> flag PRESERVED, not cleared
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_mark_attendance(
  p_marks          jsonb,
  p_trip_date      date,
  p_direction      text,
  p_actor          uuid,
  p_method         text default 'manual',
  p_allow_override boolean default false
)
returns table (
  learner_id      uuid,
  outcome         text,
  existing_status text,
  existing_by     uuid,
  existing_at     timestamptz
)
language plpgsql
as $$
#variable_conflict use_column
declare
  m           jsonb;
  v_learner   uuid;
  v_now       timestamptz := now();
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
      status, method, is_walk_up, scanned_by, scanned_at
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
      v_now
    )
    on conflict (learner_id, trip_date, direction) do update
    set status              = excluded.status,
        method              = excluded.method,
        -- Only the SCANNER and the without-ticket path know about walk-ups. An
        -- ordinary manual mark carries no is_walk_up key at all, and must not
        -- silently clear the flag on a learner already recorded as boarding
        -- without a booking.
        is_walk_up          = case when m ? 'is_walk_up'
                                   then excluded.is_walk_up else t.is_walk_up end,
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
      -- ── The atomic gate. Evaluated under the conflict row lock. ──
      where t.status is distinct from excluded.status
        and (
          t.scanned_by is null                 -- orphaned: the marker's profile was deleted
          or t.scanned_by = p_actor            -- your own mark is always yours to correct
          or p_allow_override                  -- caller-level entitlement
          or coalesce((m->>'allow_override')::boolean, false)  -- per-learner entitlement
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

comment on function public.tms_mark_attendance(jsonb, date, text, uuid, text, boolean) is
  'Atomic attendance write for the shared boarding roster. Decides and writes in one '
  'statement per learner via on-conflict-do-update-where, so concurrent staff cannot '
  'silently overwrite each other. Returns a per-learner outcome: inserted | updated_own '
  '| overridden | noop_same_status | locked.';

-- The boarding routes call this with the service-role key. GRANTs on this shared
-- multi-app database have been observed to vanish (see the boarding-eligibility
-- incident), so this is asserted explicitly rather than left to inherit.
grant execute on function public.tms_mark_attendance(jsonb, date, text, uuid, text, boolean)
  to service_role;
