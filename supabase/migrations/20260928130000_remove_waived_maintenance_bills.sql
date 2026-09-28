-- Follow-up to 20260928120000_waive_maintenance_after_transport_fee.sql.
--
-- Repricing the waived maintenance bills to Rs 0 still left a "Transport
-- Maintenance Fee  Rs 0  PAID" row in MyJKKN's learner bill list. The user wants
-- a learner with a Transport Fee to see ONLY the Transport Fee bill, and
-- billing_student_bills has no hide flag, so the waived maintenance bills are
-- now DELETED (money row; tms_fee_bill cascades).
--
--   * Backup: tms_transport_fee_waiver_backup gains old_bill (the full money row)
--     and old_txn_items (the payment_transaction_items that cascade with it —
--     only failed/expired/stale checkout attempts; no bill had a receipt).
--   * Overrides: term 1 becomes billable=false too, so cron 23 can never
--     re-raise a Rs 0 Term 1 for a waived learner.
--   * Gate: a waived learner has no maintenance bill, which would read as
--     term1_not_billed forever. For waived learners the Transport Fee replaces
--     the Term-1 precondition: blocked while it is unpaid, allowed once paid.
--   * tms_waive_maintenance_for_transport_fee now backs up and deletes instead
--     of repricing, so the trigger does the same for every future fine.

ALTER TABLE public.tms_transport_fee_waiver_backup
  ADD COLUMN IF NOT EXISTS old_bill jsonb,
  ADD COLUMN IF NOT EXISTS old_txn_items jsonb;

-- ── Gate ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tms_transport_access_for_learner(p_learner_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  select coalesce(bus_required, false) into v_bus_required from learners_profiles where id = p_learner_id;
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
  -- Bills live on BOTH sides: 'generated' in the TMS ledger AND not cancelled on the platform.
  with bills as (
    select b.id, b.final_amount, b.balance_amount, b.due_date, b.status, fb.term_no
    from tms_fee_bill fb join billing_student_bills b on b.id = fb.billing_student_bill_id
    where fb.person_id = p_learner_id and fb.person_type = 'learner'
      and fb.transport_year_id = v_year_id and fb.status = 'generated'
      and b.status is distinct from 'cancelled'
  ),
  lines as (
    -- NOT st.is_due (off-by-one: locks out on the due morning). See migration history.
    select st.sequence_no::int as line_no, st.amount as amount, st.outstanding as balance,
           st.due_date as due_date, st.is_settled as paid,
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
  -- Term-1 key is NOT unique: require every tied line settled; unknown reads as unpaid.
  min_key as (select due_date as d, line_no as n from lines order by due_date, line_no limit 1),
  first_line as (
    select true as found,
      bool_and(coalesce(l.paid, false)) as paid,
      (array_agg(l.status  order by coalesce(l.paid, false) asc, l.balance desc nulls last))[1] as status,
      min(l.due_date) as due_date,
      (array_agg(l.balance order by coalesce(l.paid, false) asc, l.balance desc nulls last))[1] as balance
    from lines l join min_key k
      on l.due_date is not distinct from k.d and l.line_no is not distinct from k.n
    having count(*) > 0
  )
  select a.terms, a.overdue_count, a.total_owed, a.bill_count,
         coalesce(f.found, false), f.status, f.due_date, f.balance, coalesce(f.paid, false)
    into v_terms, v_overdue, v_total_owed, v_bill_count,
         v_t1_found, v_t1_status, v_t1_due, v_t1_balance, v_t1_paid
  from agg a left join first_line f on true;

  -- Maintenance waived (bills deleted) because a Transport Fee was raised: the
  -- Transport Fee replaces the Term-1 precondition.
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

    if v_tf_balance > 0 then v_allowed := false; v_reason := 'transport_fee_unpaid';
    elsif v_overdue > 0 then v_allowed := false; v_reason := 'overdue';
    else v_allowed := true; v_reason := 'current';
    end if;
  elsif not coalesce(v_t1_found, false) then v_allowed := false; v_reason := 'term1_not_billed';
  elsif not coalesce(v_t1_paid, false) then v_allowed := false; v_reason := 'term1_unpaid';
  elsif v_overdue > 0 then v_allowed := false; v_reason := 'overdue';
  else v_allowed := true; v_reason := case when v_bill_count > 0 then 'current' else 'no_bills' end;
  end if;

  return jsonb_build_object('allowed', v_allowed, 'reason', v_reason,
    'transport_year_id', v_year_id, 'transport_year_name', v_year_name,
    'overdue_count', v_overdue, 'total_owed', v_total_owed, 'terms', v_terms,
    'term1_paid', coalesce(v_t1_paid, false) or (v_waived and v_tf_balance = 0),
    'term1_status', v_t1_status,
    'term1_due_date', v_t1_due, 'term1_balance', coalesce(v_t1_balance, 0),
    'maintenance_waived', v_waived, 'transport_fee_balance', v_tf_balance);
end;
$function$;

-- ── Waive = back up + delete ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tms_waive_maintenance_for_transport_fee(p_person_id uuid, p_year_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_lifecycle text;
  v_reason text := 'TRANSPORT FEE RAISED - maintenance fee waived and adjusted to the Transport Fee - '
                   || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  r record; v_n int := 0;
begin
  select lifecycle_status into v_lifecycle from learners_profiles where id = p_person_id;
  if v_lifecycle in ('account', 'reserved') then return 0; end if;
  for r in
    select fb.id as ledger_id, fb.term_no, fb.amount as ledger_amount, sb.*
    from tms_fee_bill fb join billing_student_bills sb on sb.id = fb.billing_student_bill_id
    where fb.person_id = p_person_id and fb.person_type = 'learner'
      and fb.transport_year_id = p_year_id and fb.status = 'generated'
      and sb.status in ('unpaid', 'overdue') and sb.final_amount > 0
      and sb.balance_amount >= sb.final_amount and sb.payment_date is null
      and not exists (select 1 from billing_receipt_items ri where ri.bill_id = sb.id)
      and not exists (select 1 from payment_transaction_items pti join payment_transactions pt on pt.id = pti.transaction_id
        where pti.bill_id = sb.id and pt.status = 'initiated' and pt.created_at > now() - interval '24 hours')
    for update of sb
  loop
    -- Override = cron-23 suppression AND the gate's waiver marker: only for learners actually waived.
    if v_n = 0 then
      insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
      values (p_person_id, 'learner', p_year_id, 1, false, null, v_reason),
             (p_person_id, 'learner', p_year_id, 2, false, null, v_reason)
      on conflict (person_id, transport_year_id, term_no) do update
        set billable = excluded.billable, amount = excluded.amount, reason = excluded.reason, updated_at = now();
    end if;
    insert into tms_transport_fee_waiver_backup (person_id, transport_year_id, tms_fee_bill_id,
      billing_student_bill_id, term_no, old_ledger_amount, old_unit_amount, old_total_amount,
      old_final_amount, old_balance_amount, old_status, old_due_date, old_instalments, old_bill, old_txn_items)
    values (p_person_id, p_year_id, r.ledger_id, r.id, r.term_no, r.ledger_amount, r.unit_amount,
      r.total_amount, r.final_amount, r.balance_amount, r.status, r.due_date,
      (select jsonb_agg(to_jsonb(i) order by i.sequence_no) from billing_bill_instalments i where i.bill_id = r.id),
      (select to_jsonb(b) from billing_student_bills b where b.id = r.id),
      (select jsonb_agg(to_jsonb(pti)) from payment_transaction_items pti where pti.bill_id = r.id));
    -- Delete the MONEY row; the ledger row cascades (deleting tms_fee_bill directly fails 27000).
    delete from billing_student_bills where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;
REVOKE ALL ON FUNCTION public.tms_waive_maintenance_for_transport_fee(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Backfill: remove the Rs 0 bills waived by the previous migration ───────
UPDATE public.tms_transport_fee_waiver_backup w SET
  old_bill = to_jsonb(sb),
  old_txn_items = (select jsonb_agg(to_jsonb(pti)) from payment_transaction_items pti where pti.bill_id = sb.id)
FROM public.billing_student_bills sb
WHERE sb.id = w.billing_student_bill_id AND w.old_bill IS NULL;

UPDATE public.tms_fee_override SET billable = false, amount = null, updated_at = now()
WHERE reason LIKE 'TRANSPORT FEE RAISED%' AND term_no = 1 AND billable;

DELETE FROM public.billing_student_bills sb
USING public.tms_transport_fee_waiver_backup w
WHERE sb.id = w.billing_student_bill_id
  AND sb.final_amount = 0
  AND NOT EXISTS (SELECT 1 FROM public.billing_receipt_items ri WHERE ri.bill_id = sb.id);
