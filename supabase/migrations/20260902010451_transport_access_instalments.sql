-- Transport portal access under the one-bill-per-year format.
--
-- Before this, "term 1 is paid" meant a bill row with term_no = 1 whose money
-- status was exactly 'paid'. A learner now has ONE bill for the year whose
-- terms are billing_bill_instalments rows, so paying instalment 1 leaves the
-- bill 'partially_paid' -- and the old rule would have locked out every learner
-- who pays by instalments.
--
-- Bills WITHOUT instalments keep the old behaviour: every bill written before
-- this change, plus the part-paid learners the backfill deliberately skips.
-- Both shapes coexist in production until year end.
--
-- The overdue clause is unchanged on purpose. trg_z_bbi_sync_due_date_after_payment
-- keeps billing_student_bills.due_date pointed at the next unsettled instalment,
-- so "due_date < today" already means "the next instalment is late".
--
-- OVERDUE IS DELIBERATELY NOT billing_bill_instalment_state.is_due. That column
-- is `(due_date <= CURRENT_DATE)` (verified against the live function body), so
-- reusing it would flag an instalment as overdue on the very morning it falls
-- due. The whole-bill branch has always used `due_date < current_date`, i.e. a
-- line is late only once its due date has PASSED. Reusing is_due would have made
-- the two shapes disagree about the due date itself: a learner converted to
-- instalments would lose the portal at 00:00 on the due date, with no chance to
-- pay that day, while an un-converted learner with the identical obligation kept
-- access until the next morning. The gate must not depend on which bill shape a
-- learner happens to have been migrated to, so both branches test strictly-past
-- due. `not st.is_settled` mirrors the whole-bill branch's status filter.
--
-- CANCELLED money rows are excluded from the bill set. A cancelled
-- billing_student_bills row keeps its final_amount but is zeroed to
-- balance_amount = 0 (verified on all four linked cancelled transport bills in
-- production: final 2500/3000, balance 0.00). billing_bill_instalment_state
-- derives paid as final_amount - coalesce(balance_amount, final_amount), so a
-- cancelled bill computes as fully paid and instalment 1 would read as SETTLED.
-- Today that is masked only because those rows also carry
-- tms_fee_bill.status = 'cancelled', which the fb.status = 'generated' filter
-- already drops -- but the shared billing platform can cancel a money row
-- without touching the TMS ledger, so the money status must be checked too.
-- This matches lib/fees/term1.ts (isTerm1Paid rejects moneyStatus 'cancelled').
--
-- Fail-closed throughout: no visible line means term1_not_billed / allowed=false.
--
-- Returned JSON keys are unchanged: allowed, reason, transport_year_id,
-- transport_year_name, overdue_count, total_owed, terms, term1_paid,
-- term1_status, term1_due_date, term1_balance; each terms[] entry keeps
-- term_no, amount, balance, due_date, status, paid, overdue.

create or replace function public.tms_student_transport_access(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_learner_id   uuid;
  v_bus_required boolean;
  v_year_id      uuid;
  v_year_name    text;
  v_terms        jsonb;
  v_overdue      int := 0;
  v_total_owed   numeric := 0;
  v_bill_count   int := 0;
  v_t1_found     boolean := false;
  v_t1_status    text;
  v_t1_due       date;
  v_t1_balance   numeric;
  v_t1_paid      boolean := false;
  v_allowed      boolean;
  v_reason       text;
begin
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

  with bills as (
    -- The learner's live transport bills for the current year. A row must be
    -- live on BOTH sides: 'generated' in the TMS ledger and not cancelled on
    -- the shared billing platform.
    select b.id, b.final_amount, b.balance_amount, b.due_date, b.status, fb.term_no
    from tms_fee_bill fb
    join billing_student_bills b on b.id = fb.billing_student_bill_id
    where fb.person_id = v_learner_id
      and fb.person_type = 'learner'
      and fb.transport_year_id = v_year_id
      and fb.status = 'generated'
      and b.status is distinct from 'cancelled'
  ),
  lines as (
    -- One row per visible line: an instalment where the bill has them, else the
    -- bill itself.
    select st.sequence_no::int                  as line_no,
           st.amount                            as amount,
           st.outstanding                       as balance,
           st.due_date                          as due_date,
           st.is_settled                        as paid,
           -- NOT st.is_due: billing_bill_instalment_state sets
           -- is_due := (due_date <= current_date), which would mark a line
           -- overdue on the very morning it falls due -- locking a converted
           -- learner out of the portal before they have had a day to pay,
           -- while an un-converted learner in the same position keeps access.
           -- Use the same strictly-past-due test as the whole-bill branch below.
           (st.due_date < current_date and not st.is_settled) as overdue,
           case when st.is_settled then 'paid'
                when st.allocated_amount > 0 then 'partially_paid'
                else 'unpaid' end               as status
    from bills bl
    cross join lateral billing_bill_instalment_state(bl.id) st
    where exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
    union all
    select bl.term_no,
           bl.final_amount,
           bl.balance_amount,
           bl.due_date,
           (bl.status = 'paid'),
           (bl.due_date < current_date and bl.status in ('unpaid','partially_paid','overdue')),
           bl.status
    from bills bl
    where not exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
  ),
  agg as (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'term_no', line_no,
        'amount', amount,
        'balance', balance,
        'due_date', due_date,
        'status', status,
        'paid', paid,
        'overdue', overdue
      ) order by due_date, line_no), '[]'::jsonb) as terms,
      count(*) filter (where overdue)                       as overdue_count,
      coalesce(sum(balance) filter (where overdue), 0)      as total_owed,
      count(*)                                              as bill_count
    from lines
  ),
  -- The FIRST line by (due_date, line_no) is the term-1 obligation, whichever
  -- shape it has. That key is NOT unique: two fee structures can each bill a
  -- learner a term 1 on the same due date (tms_fee_bill_idem_unique only rules
  -- out a same-structure duplicate). A plain `limit 1` then picks an arbitrary
  -- row, and the planner has been observed to return the PAID one -- clearing
  -- the gate for a learner who still owes the other. Aggregate over every line
  -- tied at the minimum key and require them ALL to be settled: fail-closed,
  -- matching term1PaidLearnerIds in lib/fees/term1.ts, which likewise demands
  -- every row tied at the lowest term_no clear rather than any one of them.
  min_key as (
    select due_date as d, line_no as n
    from lines
    order by due_date, line_no
    limit 1
  ),
  first_line as (
    select
      true                                                as found,
      bool_and(l.paid)                                    as paid,
      -- Report the WORST tied line: unsettled first, then largest balance.
      (array_agg(l.status  order by l.paid asc, l.balance desc nulls last))[1] as status,
      min(l.due_date)                                     as due_date,
      (array_agg(l.balance order by l.paid asc, l.balance desc nulls last))[1] as balance
    from lines l
    join min_key k
      on l.due_date is not distinct from k.d
     and l.line_no  is not distinct from k.n
    -- Ungrouped aggregates always yield a row; without this, an empty `lines`
    -- would report found = true and lose the fail-closed term1_not_billed case.
    having count(*) > 0
  )
  select a.terms, a.overdue_count, a.total_owed, a.bill_count,
         coalesce(f.found, false), f.status, f.due_date, f.balance,
         coalesce(f.paid, false)
    into v_terms, v_overdue, v_total_owed, v_bill_count,
         v_t1_found, v_t1_status, v_t1_due, v_t1_balance, v_t1_paid
  from agg a
  left join first_line f on true;

  if not coalesce(v_t1_found, false) then
    v_allowed := false;
    v_reason  := 'term1_not_billed';
  elsif not coalesce(v_t1_paid, false) then
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
    'term1_paid', coalesce(v_t1_paid, false),
    'term1_status', v_t1_status,
    'term1_due_date', v_t1_due,
    'term1_balance', coalesce(v_t1_balance, 0)
  );
end;
$function$;
