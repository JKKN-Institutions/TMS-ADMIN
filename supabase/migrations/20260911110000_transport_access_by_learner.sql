-- Split tms_student_transport_access into a learner-keyed core plus a thin
-- account-keyed wrapper.
--
-- WHY. The boarding scan panel must show fees for any scanned learner, and it
-- identifies people by learners_profiles.id. The existing function is keyed on
-- profiles.id, but 633 of the 1,908 learners allocated to a bus have a NULL
-- profile_id, so a third of the bus would show a blank fee panel -- which on a
-- money screen reads as "nothing owed".
--
-- This is a REFACTOR, not a policy change. The wrapper keeps its name,
-- argument, return shape, SECURITY DEFINER marking and search_path, so
-- proxy.ts, /api/student/transport-access and the portal gate are untouched.
-- A parity check across all three identity paths accompanies this migration.

create or replace function public.tms_transport_access_for_learner(p_learner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_bus_required boolean;
  v_year_id uuid; v_year_name text; v_terms jsonb;
  v_overdue int := 0; v_total_owed numeric := 0; v_bill_count int := 0;
  v_t1_found boolean; v_t1_status text; v_t1_due date; v_t1_balance numeric;
  v_t1_paid boolean := false; v_allowed boolean; v_reason text;
begin
  select coalesce(bus_required, false) into v_bus_required
  from learners_profiles where id = p_learner_id;

  if p_learner_id is null or v_bus_required is null or v_bus_required = false then
    return jsonb_build_object('allowed', true, 'reason', 'no_transport_obligation',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null, 'term1_due_date', null, 'term1_balance', 0);
  end if;

  select id, name into v_year_id, v_year_name from tms_transport_year where is_current = true limit 1;

  if v_year_id is null then
    return jsonb_build_object('allowed', true, 'reason', 'no_current_transport_year',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null, 'term1_due_date', null, 'term1_balance', 0);
  end if;

  with bills as (
    -- Live on BOTH sides: 'generated' in the TMS ledger AND not cancelled on the
    -- shared billing platform. See note 2 in the header.
    select b.id, b.final_amount, b.balance_amount, b.due_date, b.status, fb.term_no
    from tms_fee_bill fb join billing_student_bills b on b.id = fb.billing_student_bill_id
    where fb.person_id = p_learner_id and fb.person_type = 'learner'
      and fb.transport_year_id = v_year_id and fb.status = 'generated'
      and b.status is distinct from 'cancelled'
  ),
  lines as (
    -- One row per visible line: an instalment where the bill has them, else the
    -- bill itself.
    select st.sequence_no::int as line_no, st.amount as amount, st.outstanding as balance,
           st.due_date as due_date, st.is_settled as paid,
           -- NOT st.is_due: billing_bill_instalment_state sets
           -- is_due := (due_date <= current_date), which marks a line overdue on
           -- the very morning it falls due, locking a converted learner out
           -- before they have had a day to pay while an un-converted learner in
           -- the same position keeps access. Match the whole-bill branch below.
           (st.due_date < current_date and not st.is_settled) as overdue,
           case when st.is_settled then 'paid'
                when st.allocated_amount > 0 then 'partially_paid' else 'unpaid' end as status
    from bills bl cross join lateral billing_bill_instalment_state(bl.id) st
    where exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
    union all
    select bl.term_no, bl.final_amount, bl.balance_amount, bl.due_date,
           (bl.status = 'paid'),
           (bl.due_date < current_date and bl.status in ('unpaid','partially_paid','overdue')),
           bl.status
    from bills bl
    where not exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
  ),
  agg as (
    select coalesce(jsonb_agg(jsonb_build_object(
        'term_no', line_no, 'amount', amount, 'balance', balance, 'due_date', due_date,
        'status', status, 'paid', paid, 'overdue', overdue
      ) order by due_date, line_no), '[]'::jsonb) as terms,
      count(*) filter (where overdue) as overdue_count,
      coalesce(sum(balance) filter (where overdue), 0) as total_owed,
      count(*) as bill_count
    from lines
  ),
  -- The first line by (due_date, line_no) is the term-1 obligation. That key is
  -- NOT unique -- two fee structures can each bill a learner a term 1 on the
  -- same due date -- and a plain limit 1 has been observed to return the PAID
  -- row, clearing the gate for a learner who still owes the other. Require every
  -- line tied at the minimum key to be settled.
  min_key as (select due_date as d, line_no as n from lines order by due_date, line_no limit 1),
  first_line as (
    select true as found,
      -- coalesce, not bare l.paid: bool_and IGNORES nulls, so a line whose paid
      -- state is unknown would drop out of the vote and let a tied settled line
      -- carry the decision alone. On an access gate, unknown must read as unpaid.
      bool_and(coalesce(l.paid, false)) as paid,
      -- Report the WORST tied line: unsettled first, then largest balance.
      (array_agg(l.status  order by coalesce(l.paid, false) asc, l.balance desc nulls last))[1] as status,
      min(l.due_date) as due_date,
      (array_agg(l.balance order by coalesce(l.paid, false) asc, l.balance desc nulls last))[1] as balance
    from lines l join min_key k
      on l.due_date is not distinct from k.d and l.line_no is not distinct from k.n
    -- Ungrouped aggregates always yield a row; without this an empty `lines`
    -- would report found = true and lose the fail-closed term1_not_billed case.
    having count(*) > 0
  )
  select a.terms, a.overdue_count, a.total_owed, a.bill_count,
         coalesce(f.found, false), f.status, f.due_date, f.balance, coalesce(f.paid, false)
    into v_terms, v_overdue, v_total_owed, v_bill_count,
         v_t1_found, v_t1_status, v_t1_due, v_t1_balance, v_t1_paid
  from agg a left join first_line f on true;

  if not coalesce(v_t1_found, false) then v_allowed := false; v_reason := 'term1_not_billed';
  elsif not coalesce(v_t1_paid, false) then v_allowed := false; v_reason := 'term1_unpaid';
  elsif v_overdue > 0 then v_allowed := false; v_reason := 'overdue';
  else v_allowed := true; v_reason := case when v_bill_count > 0 then 'current' else 'no_bills' end;
  end if;

  return jsonb_build_object('allowed', v_allowed, 'reason', v_reason,
    'transport_year_id', v_year_id, 'transport_year_name', v_year_name,
    'overdue_count', v_overdue, 'total_owed', v_total_owed, 'terms', v_terms,
    'term1_paid', coalesce(v_t1_paid, false), 'term1_status', v_t1_status,
    'term1_due_date', v_t1_due, 'term1_balance', coalesce(v_t1_balance, 0));
end;
$function$;

create or replace function public.tms_student_transport_access(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_learner_id uuid;
  v_email text;
begin
  -- Path 1: direct profile link. profile_id is NOT unique in learners_profiles:
  -- a stub row can shadow the real one, so bias toward the row carrying the
  -- obligation rather than taking an unordered limit 1.
  select id into v_learner_id
  from learners_profiles where profile_id = p_profile_id
  order by coalesce(bus_required, false) desc, (transport_route_id is not null) desc, id
  limit 1;

  -- Paths 2 and 3: fall back to the caller's email, the way the billing view
  -- does. Only reached when the profile link is absent. profiles.email is NOT
  -- reliably lower-cased, so both sides are lowered.
  if v_learner_id is null then
    select lower(email) into v_email from profiles where id = p_profile_id;
    if v_email is not null and v_email <> '' then
      select id into v_learner_id
      from learners_profiles
      where lower(nullif(college_email, '')) = v_email
         or lower(nullif(student_email, '')) = v_email
      order by coalesce(bus_required, false) desc, (transport_route_id is not null) desc, id
      limit 1;
    end if;
  end if;

  return public.tms_transport_access_for_learner(v_learner_id);
end;
$function$;

-- CREATE OR REPLACE does not preserve grants on a NEW function, and a revoked
-- EXECUTE grant on a boarding function has already caused a silent multi-week
-- lockout once. Grant both explicitly.
-- The `authenticated` grant on the core is superseded two migrations later by
-- 20260911120000_revoke_authenticated_on_transport_access_core.sql, which
-- revokes it (and a leftover PUBLIC grant): the core reads any learner's fee
-- position with no caller check, so only the service role should reach it.
grant execute on function public.tms_transport_access_for_learner(uuid) to authenticated, service_role;
grant execute on function public.tms_student_transport_access(uuid) to authenticated, service_role;
