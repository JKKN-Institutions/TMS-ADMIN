-- Once a learner's Transport Fee (the maintenance-unpaid charge) is raised, their
-- Transport Maintenance Fee is waived and adjusted to it — the rule the learners
-- were told in the 48-hour reminder ("waived off and adjusted to the Transport
-- Fee"). Until 2026-09-28 the system raised the Transport Fee ON TOP of the
-- maintenance fee, so fined learners saw and owed both.
--
-- Three parts:
--   1. Access gate: a waived learner's Term 1 reads as paid (Rs 0), so without a
--      new rule every waived learner would regain the portal while the Transport
--      Fee is still unpaid. The gate now blocks with reason
--      'transport_fee_unpaid' until it is paid, and reports maintenance_waived
--      so the learner Fees page can hide the maintenance section.
--   2. tms_waive_maintenance_for_transport_fee(): reprices the learner's unpaid
--      maintenance bills to Rs 0 (NOT a cancellation — fn_guard_bill_cancellation
--      reserves that for MyJKKN's documented cancel flow) and writes a
--      tms_fee_override pair so cron 23 cannot re-raise the terms.
--   3. AFTER INSERT trigger on tms_fee_fine, so every future maintenance-unpaid
--      fine (48h sweep or Bus Inspection — they share the key) waives too, and a
--      one-off backfill for the fines already raised.
--
-- Skipped on purpose (the function returns without touching them):
--   * bills with ANY payment already allocated (balance < final) or a receipt;
--   * bills with a payment_transactions row still 'initiated' in the last 24h
--     (a Razorpay checkout in flight would land money on a Rs 0 bill);
--   * learners whose lifecycle is 'account'/'reserved' — the paid-status change
--     can promote them via evaluate_learner_status_after_payment.
-- Undo data: tms_transport_fee_waiver_backup (one row per repriced bill).

-- ── 1. Access gate ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tms_transport_access_for_learner(p_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_bus_required boolean;
  v_year_id uuid; v_year_name text; v_terms jsonb;
  v_overdue int := 0; v_total_owed numeric := 0; v_bill_count int := 0;
  v_t1_found boolean; v_t1_status text; v_t1_due date; v_t1_balance numeric;
  v_t1_paid boolean := false; v_allowed boolean; v_reason text;
  v_waived boolean := false; v_tf_balance numeric := 0;
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

  -- Maintenance waived because a Transport Fee was raised (see header). The
  -- waived Term 1 reads as paid at Rs 0, so the Transport Fee itself must hold
  -- the gate: any live maintenance-unpaid fine whose money row is not paid.
  select exists (
    select 1 from tms_fee_override o
    where o.person_id = p_learner_id and o.transport_year_id = v_year_id
      and o.reason like 'TRANSPORT FEE RAISED%'
  ) into v_waived;

  if v_waived then
    select coalesce(sum(coalesce(sb.balance_amount, ff.fine_amount)), 0) into v_tf_balance
    from tms_fee_fine ff
    left join billing_student_bills sb on sb.id = ff.billing_student_bill_id
    where ff.person_id = p_learner_id and ff.transport_year_id = v_year_id
      and ff.status = 'generated'
      and ff.idempotency_key like 'maintenance-unpaid:%'
      and sb.status is distinct from 'paid'
      and sb.status is distinct from 'cancelled';
  end if;

  if not coalesce(v_t1_found, false) then v_allowed := false; v_reason := 'term1_not_billed';
  elsif not coalesce(v_t1_paid, false) then v_allowed := false; v_reason := 'term1_unpaid';
  elsif v_tf_balance > 0 then v_allowed := false; v_reason := 'transport_fee_unpaid';
  elsif v_overdue > 0 then v_allowed := false; v_reason := 'overdue';
  else v_allowed := true; v_reason := case when v_bill_count > 0 then 'current' else 'no_bills' end;
  end if;

  return jsonb_build_object('allowed', v_allowed, 'reason', v_reason,
    'transport_year_id', v_year_id, 'transport_year_name', v_year_name,
    'overdue_count', v_overdue, 'total_owed', v_total_owed, 'terms', v_terms,
    'term1_paid', coalesce(v_t1_paid, false), 'term1_status', v_t1_status,
    'term1_due_date', v_t1_due, 'term1_balance', coalesce(v_t1_balance, 0),
    'maintenance_waived', v_waived, 'transport_fee_balance', v_tf_balance);
end;
$function$;

-- ── 2. Waive function ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tms_transport_fee_waiver_backup (
  id bigserial PRIMARY KEY,
  person_id uuid NOT NULL,
  transport_year_id uuid NOT NULL,
  tms_fee_bill_id uuid NOT NULL,
  billing_student_bill_id uuid NOT NULL,
  term_no int,
  old_ledger_amount numeric,
  old_unit_amount numeric,
  old_total_amount numeric,
  old_final_amount numeric,
  old_balance_amount numeric,
  old_status text,
  old_due_date date,
  old_instalments jsonb,
  waived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tms_transport_fee_waiver_backup ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tms_waive_maintenance_for_transport_fee(p_person_id uuid, p_year_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lifecycle text;
  v_reason text := 'TRANSPORT FEE RAISED - maintenance fee waived and adjusted to the Transport Fee - '
                   || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  r record;
  v_n int := 0;
begin
  select lifecycle_status into v_lifecycle from learners_profiles where id = p_person_id;
  if v_lifecycle in ('account', 'reserved') then return 0; end if;

  for r in
    select fb.id as ledger_id, fb.term_no, fb.amount as ledger_amount, sb.*
    from tms_fee_bill fb
    join billing_student_bills sb on sb.id = fb.billing_student_bill_id
    where fb.person_id = p_person_id and fb.person_type = 'learner'
      and fb.transport_year_id = p_year_id and fb.status = 'generated'
      and sb.status in ('unpaid', 'overdue')
      and sb.final_amount > 0
      and sb.balance_amount >= sb.final_amount
      and sb.payment_date is null
      and not exists (select 1 from billing_receipt_items ri where ri.bill_id = sb.id)
      and not exists (
        select 1 from payment_transaction_items pti
        join payment_transactions pt on pt.id = pti.transaction_id
        where pti.bill_id = sb.id and pt.status = 'initiated'
          and pt.created_at > now() - interval '24 hours')
    for update of sb
  loop
    -- Overrides before the first reprice (same transaction), and only for a
    -- learner who really has a bill to waive: the override is also the gate's
    -- waiver marker, so writing it for an untouched learner would lock them out.
    -- Written here, cron 23 (every 2 min) cannot re-raise a waived term.
    if v_n = 0 then
      insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
      values (p_person_id, 'learner', p_year_id, 1, true, 0, v_reason),
             (p_person_id, 'learner', p_year_id, 2, false, null, v_reason)
      on conflict (person_id, transport_year_id, term_no) do update
        set billable = excluded.billable, amount = excluded.amount, reason = excluded.reason, updated_at = now();
    end if;

    insert into tms_transport_fee_waiver_backup (person_id, transport_year_id, tms_fee_bill_id,
      billing_student_bill_id, term_no, old_ledger_amount, old_unit_amount, old_total_amount,
      old_final_amount, old_balance_amount, old_status, old_due_date, old_instalments)
    values (p_person_id, p_year_id, r.ledger_id, r.id, r.term_no, r.ledger_amount, r.unit_amount,
      r.total_amount, r.final_amount, r.balance_amount, r.status, r.due_date,
      (select jsonb_agg(to_jsonb(i) order by i.sequence_no) from billing_bill_instalments i where i.bill_id = r.id));

    -- Reprice, not cancel: update_bill_balance_on_amount_change settles a Rs 0
    -- bill as paid by itself, and the instalment rows follow the amount.
    update billing_student_bills set unit_amount = 0, total_amount = 0, final_amount = 0 where id = r.id;
    update tms_fee_bill set amount = 0 where id = r.ledger_id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

REVOKE ALL ON FUNCTION public.tms_waive_maintenance_for_transport_fee(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Trigger for future Transport Fees ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.tms_fee_fine_waive_maintenance_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.person_type = 'learner' and new.status = 'generated'
     and new.idempotency_key like 'maintenance-unpaid:%' then
    begin
      perform public.tms_waive_maintenance_for_transport_fee(new.person_id, new.transport_year_id);
    exception when others then
      -- Never block raising the Transport Fee itself; the fine is the priority.
      raise warning 'waive maintenance failed for %: %', new.person_id, sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.tms_fee_fine_waive_maintenance_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tms_fee_fine_waive_maintenance ON public.tms_fee_fine;
CREATE TRIGGER trg_tms_fee_fine_waive_maintenance
  AFTER INSERT ON public.tms_fee_fine
  FOR EACH ROW EXECUTE FUNCTION public.tms_fee_fine_waive_maintenance_trg();

-- ── 4. Backfill the Transport Fees already raised ──────────────────────────
DO $$
declare r record; v_total int := 0;
begin
  for r in
    select distinct person_id, transport_year_id from tms_fee_fine
    where idempotency_key like 'maintenance-unpaid:%' and status = 'generated' and person_type = 'learner'
  loop
    v_total := v_total + public.tms_waive_maintenance_for_transport_fee(r.person_id, r.transport_year_id);
  end loop;
  raise notice 'waived % maintenance bills', v_total;
end $$;
