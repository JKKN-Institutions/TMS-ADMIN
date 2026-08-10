-- ─────────────────────────────────────────────────────────────────────────────
-- tms_student_transport_access(profile_id) — payment gate for the learner portal.
--
-- REPLACES the fail-open rule from 20260613110000. That version blocked only on
-- an OVERDUE term, so a learner who had never been billed rode free. The rule is
-- now a POSITIVE precondition: Term 1 must exist and be fully paid.
--
-- Order (first match wins):
--   1. not a learner / not bus_required  -> allowed  no_transport_obligation
--   2. no current transport year         -> allowed  no_current_transport_year
--   3. no live Term-1 bill               -> BLOCKED  term1_not_billed
--   4. Term-1 money row not 'paid'       -> BLOCKED  term1_unpaid
--   5. any due-date-passed term unpaid   -> BLOCKED  overdue      (unchanged)
--   6. otherwise                         -> allowed  current / no_bills
--
-- Step 2 stays FAIL-OPEN on purpose: if an admin leaves is_current=false on every
-- transport year, failing closed would lock all ~1,126 transport learners out of
-- the portal at once. An admin config gap must not read as unpaid debt.
--
-- Must stay SECURITY DEFINER: proxy.ts calls this with a USER-scoped client, and
-- learners_profiles / tms_fee_bill / billing_student_bills are all RLS-deny.
-- The EXECUTE grant is re-issued below — it has been silently stripped from this
-- shared multi-app database before, and fail-closed callers hid it for weeks.
--
-- Idempotent (create or replace).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_student_transport_access(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner_id   uuid;
  v_bus_required boolean;
  v_year_id      uuid;
  v_year_name    text;
  v_terms        jsonb;
  v_overdue      int := 0;
  v_total_owed   numeric := 0;
  v_bill_count   int := 0;
  v_t1_found     boolean;
  v_t1_status    text;
  v_t1_due       date;
  v_t1_balance   numeric;
  v_t1_paid      boolean := false;
  v_allowed      boolean;
  v_reason       text;
begin
  -- profile_id is NOT unique in learners_profiles. Three profiles carry a stub
  -- row ('approved' / 'enquiry_submitted', no roll number, no route) alongside
  -- their real 'active' row, and for one of them the stub has bus_required=false
  -- while the real row has true. The previous UNORDERED `limit 1` therefore
  -- picked arbitrarily and could return 'no_transport_obligation' for a learner
  -- who genuinely owes — a silent gate bypass that was harmless while the rule
  -- was fail-open, and is not harmless now. Bias the pick toward the row that
  -- actually carries a transport obligation, with id as a stable tiebreaker.
  select id, coalesce(bus_required, false)
    into v_learner_id, v_bus_required
  from learners_profiles
  where profile_id = p_profile_id
  order by coalesce(bus_required, false) desc,
           (transport_route_id is not null) desc,
           id
  limit 1;

  -- 1. Not a learner, or not a transport user -> no obligation.
  if v_learner_id is null or v_bus_required = false then
    return jsonb_build_object(
      'allowed', true, 'reason', 'no_transport_obligation',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null,
      'term1_due_date', null, 'term1_balance', 0);
  end if;

  select id, name into v_year_id, v_year_name
  from tms_transport_year
  where is_current = true
  limit 1;

  -- 2. Misconfiguration, not debt -> fail OPEN.
  if v_year_id is null then
    return jsonb_build_object(
      'allowed', true, 'reason', 'no_current_transport_year',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null,
      'term1_due_date', null, 'term1_balance', 0);
  end if;

  -- All live terms for the year (unchanged shape — the fees page renders this).
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'term_no', fb.term_no,
      'amount', b.final_amount,
      'balance', b.balance_amount,
      'due_date', b.due_date,
      'status', b.status,
      'paid', (b.status = 'paid'),
      'overdue', (b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue'))
    ) order by fb.term_no), '[]'::jsonb),
    count(*) filter (where b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue')),
    coalesce(sum(b.balance_amount) filter (where b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue')), 0),
    count(*)
  into v_terms, v_overdue, v_total_owed, v_bill_count
  from tms_fee_bill fb
  join billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_id = v_learner_id
    and fb.person_type = 'learner'
    and fb.transport_year_id = v_year_id
    and fb.status = 'generated';

  -- Term 1 specifically. No unique constraint enforces one row per learner per
  -- year (verified zero duplicates on 2026-08-10, but nothing prevents them), so
  -- prefer a paid row, then the earliest due date.
  select true, b.status, b.due_date, b.balance_amount
    into v_t1_found, v_t1_status, v_t1_due, v_t1_balance
  from tms_fee_bill fb
  join billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_id = v_learner_id
    and fb.person_type = 'learner'
    and fb.transport_year_id = v_year_id
    and fb.status = 'generated'
    and fb.term_no = 1
  order by (b.status = 'paid') desc, b.due_date asc
  limit 1;

  v_t1_paid := coalesce(v_t1_status, '') = 'paid';

  if not coalesce(v_t1_found, false) then
    -- 3. Never billed, or the only Term-1 row was cancelled by a vacate approval.
    v_allowed := false;
    v_reason  := 'term1_not_billed';
  elsif not v_t1_paid then
    v_allowed := false;
    v_reason  := 'term1_unpaid';
  elsif v_overdue > 0 then
    v_allowed := false;
    v_reason  := 'overdue';
  else
    v_allowed := true;
    v_reason  := case when v_bill_count > 0 then 'current' else 'no_bills' end;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'transport_year_id', v_year_id,
    'transport_year_name', v_year_name,
    'overdue_count', v_overdue,
    'total_owed', v_total_owed,
    'terms', v_terms,
    'term1_paid', v_t1_paid,
    'term1_status', v_t1_status,
    'term1_due_date', v_t1_due,
    'term1_balance', coalesce(v_t1_balance, 0)
  );
end;
$$;

grant execute on function public.tms_student_transport_access(uuid) to authenticated, service_role;
