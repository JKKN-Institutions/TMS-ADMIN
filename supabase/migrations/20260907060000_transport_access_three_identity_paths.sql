-- tms_student_transport_access(profile_id) — resolve the learner by the SAME
-- three identity paths billing already uses.
--
-- BUG: the function resolved the learner with `where profile_id = p_profile_id`
-- ONLY. But `learners_profiles.profile_id` is NULL on ~30% of rows, which is
-- exactly why the billing side (tms_bus_pass_applicant / tms_billable_learner,
-- migration 20260903080000) matches on THREE paths: profile_id, college_email
-- and student_email. The write path could therefore bill a learner the read
-- path could not recognise.
--
-- Symptom: /student/fees printed "No transport fees are currently assigned to
-- your account" for a learner holding a real unpaid bill (bharathr26engg@
-- jkkn.ac.in — billed 5,500 on 2026-09-04, profile_id NULL, matched by
-- college_email). Measured blast radius on 2026-09-07: 535 billed bus-required
-- learners unresolvable, 442 of them with a working login, and 319 holding an
-- UNPAID/overdue bill.
--
-- The second failure is worse than the missing display. `no_transport_obligation`
-- returns allowed = TRUE, and this RPC is the Term-1 payment gate authority, so
-- those 319 learners kept full portal + booking access while owing money. The
-- gate was failing OPEN. Fixing resolution closes it.
--
-- Non-regression by construction: the profile_id lookup runs FIRST and unchanged
-- (same ORDER BY tie-break). The email fallback is only consulted when that
-- returns nothing, so the 1,260 learners who already resolved are untouched.
--
-- profile_id is NOT unique in learners_profiles and neither is an email, so both
-- lookups keep the "bias toward the row carrying the obligation" ordering: a stub
-- row must never shadow the row that actually owes.

create or replace function public.tms_student_transport_access(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_learner_id   uuid;
  v_bus_required boolean;
  v_email        text;
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
  -- Path 1: direct profile link. Unchanged from the previous definition.
  -- profile_id is NOT unique in learners_profiles: a stub row can shadow the
  -- real one. An unordered `limit 1` could return 'no_transport_obligation' for
  -- a learner who genuinely owes. Bias toward the row carrying the obligation.
  select id, coalesce(bus_required, false)
    into v_learner_id, v_bus_required
  from learners_profiles
  where profile_id = p_profile_id
  order by coalesce(bus_required, false) desc,
           (transport_route_id is not null) desc,
           id
  limit 1;

  -- Paths 2 and 3: fall back to the caller's email, the way the billing view
  -- does. Only reached when the profile link is absent, so this cannot change
  -- the answer for anyone who already resolved. profiles.email is NOT reliably
  -- lower-cased, so both sides are lowered.
  if v_learner_id is null then
    select lower(email) into v_email from profiles where id = p_profile_id;

    if v_email is not null and v_email <> '' then
      select id, coalesce(bus_required, false)
        into v_learner_id, v_bus_required
      from learners_profiles
      where lower(nullif(college_email, '')) = v_email
         or lower(nullif(student_email, '')) = v_email
      order by coalesce(bus_required, false) desc,
               (transport_route_id is not null) desc,
               id
      limit 1;
    end if;
  end if;

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

  if v_year_id is null then
    return jsonb_build_object(
      'allowed', true, 'reason', 'no_current_transport_year',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null,
      'term1_due_date', null, 'term1_balance', 0);
  end if;

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
$function$;

-- EXECUTE has been silently revoked on a TMS function before (see the boarding
-- eligibility incident); re-assert it rather than trusting CREATE OR REPLACE.
grant execute on function public.tms_student_transport_access(uuid) to authenticated, service_role;
