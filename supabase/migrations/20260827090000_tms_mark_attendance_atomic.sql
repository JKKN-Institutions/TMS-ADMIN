-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic attendance write.
--
-- THE BUG THIS CLOSES: every attendance write today is read-then-upsert with
-- nothing held between the two. A route can have a dozen boarding staff sharing
-- ONE roster row per (learner_id, trip_date, direction), so two of them tapping
-- the same learner within the same second both read "unmarked", both write, and
-- the second silently overwrites the first. Any ownership rule layered on top of
-- that read is advisory, not enforced.
--
-- THE PRIMITIVE: `insert ... on conflict do update ... WHERE`. Postgres evaluates
-- that WHERE under the row lock taken by the conflict, so the decision and the
-- write are one indivisible step. When the WHERE is false no row comes back, and
-- that absence IS the answer — no second reader can slip between.
--
-- WHY AN RPC AND NOT A TRIGGER: supabase-js talks to PostgREST, which offers no
-- transaction control, so a caller cannot `SET LOCAL` a marker around an
-- `.upsert()`. Any carrier for "this write is a deliberate override" has to live
-- inside a database function. A trigger remains available later as
-- defence-in-depth against direct SQL, but it cannot be the primary mechanism.
--
-- WHO MAY REPLACE WHOSE MARK. The WHERE below settles three of the four cases
-- on its own -- an orphaned row, your own row, and a same-status no-op need no
-- caller input. Only the fourth needs an answer from outside: may this actor
-- replace a COLLEAGUE'S differing mark? Two flags carry it, OR'd together:
--   p_allow_override      -- the caller's own entitlement (transport_head, a
--                            super admin, or a QR scan, which is physical proof)
--   marks[].allow_override -- a PER-LEARNER entitlement, because owning a learner
--                            outranks a coverer who marked them, and that cannot
--                            be expressed once for a whole batch.
-- Together these mirror lib/boarding/attendance-ownership.ts decideMark exactly.
-- lib/boarding/attendance-sql-parity.test.ts pins the correspondence.
--
-- Additive only: no column is dropped, and the unique
-- (learner_id, trip_date, direction) key is untouched. Attendance stays SHARED
-- across a route's staff; only the arbitration of a second write changes.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_mark_attendance(
  p_marks          jsonb,
  p_trip_date      date,
  p_direction      text,
  p_actor          uuid,
  p_method         text default 'manual',
  -- Call-level permission to replace ANOTHER staff member's differing mark.
  -- Per-mark `allow_override` in p_marks is OR'd with this: some entitlements
  -- are the caller's (transport_head, super admin, a QR scan) and some are
  -- per-learner (owning the learner outranks a coverer who marked them), and a
  -- single call-level flag cannot express the second.
  p_allow_override boolean default false
)
returns table (
  learner_id      uuid,
  outcome         text,
  -- The row AS IT WAS when this call reached it. For an 'overridden' outcome
  -- that is what got replaced; for a 'locked' outcome it is what still stands
  -- and who holds it. Named existing_* rather than previous_* precisely because
  -- those two readings differ -- the table's own previous_* columns mean only
  -- the first.
  existing_status text,
  existing_by     uuid,
  existing_at     timestamptz
)
language plpgsql
as $$
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

    -- Snapshot BEFORE the write, for reporting only. The write below does not
    -- trust this: its own WHERE re-evaluates the same facts under the row lock.
    -- A stale snapshot can therefore mislabel an outcome, but can never let a
    -- forbidden write through.
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
        -- Only the SCANNER knows about walk-ups. A manual mark carries no
        -- is_walk_up key at all, and must not silently clear the flag on a
        -- learner the scanner recorded as boarding without a booking.
        is_walk_up          = case when m ? 'is_walk_up'
                                   then excluded.is_walk_up else t.is_walk_up end,
        scanned_by          = excluded.scanned_by,
        scanned_at          = excluded.scanned_at,
        -- One level of history, and only when this write actually REPLACED
        -- someone else's differing mark. Correcting your own mark is not an
        -- override and must not consume the history slot.
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
      -- Re-asserting the status already on the row is a no-op, never a
      -- conflict: a polled roster manufactures exactly that request when two
      -- staff mark the same learner the same way seconds apart.
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
      -- No row came back. Either the status already matched, or the gate
      -- refused. Classified from the snapshot: this is a MESSAGE, not a
      -- decision, so its staleness is harmless.
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

-- ── Verification (run separately after applying) ─────────────────────────────
--   -- 1. The function exists with the expected signature:
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'tms_mark_attendance';
--
--   -- 2. service_role can execute it:
--   select has_function_privilege('service_role',
--     'public.tms_mark_attendance(jsonb,date,text,uuid,text,boolean)', 'execute');
--
--   -- 3. The shared-roster key is STILL the only unique constraint (expect 1):
--   select count(*) from pg_constraint c join pg_class t on t.oid = c.conrelid
--   where t.relname = 'tms_attendance' and c.contype = 'u';
--
--   -- 4. Concurrency proof — from TWO sessions, same learner/date/direction,
--   --    different p_actor, p_allow_override => false. Exactly one must report
--   --    a write; the other must report 'locked'. Then confirm the row's
--   --    previous_* columns name the loser, not a null.
