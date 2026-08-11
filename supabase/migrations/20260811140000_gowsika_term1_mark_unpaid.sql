-- Mark GOWSIKA M's (ES23012) Term-1 transport bill UNPAID at its corrected Rs 500.
--
-- WHY A SECOND MIGRATION: 20260811130000 set Term 1 to Rs 500 and asked for
-- status='unpaid', balance=500, payment_date=null in the same UPDATE. Those three
-- writes did not survive, because
-- **update_bill_balance_on_amount_change is a BEFORE UPDATE trigger and it IS active**
-- (pg_trigger.tgtype = 19; the BEFORE bit is set). Its body runs whenever
-- final_amount changes:
--
--     IF NEW.final_amount IS DISTINCT FROM OLD.final_amount THEN
--       v_total_paid := sum(amount_paid) from billing_receipt_items for this bill;
--       IF v_total_paid >= NEW.final_amount THEN
--         NEW.status := 'paid'; NEW.balance_amount := 0;
--         NEW.payment_date := COALESCE(NEW.payment_date, NOW());
--
-- Rs 3,000 is receipted against this bill and the new final_amount is Rs 500, so
-- 3000 >= 500 forced status back to 'paid', balance to 0, and stamped payment_date
-- with now(). Being a BEFORE trigger, its mutation of NEW is what actually persists —
-- it wins over the values the statement supplied.
--
-- THE RULE, stated correctly for whoever writes the next one of these:
--   * Change final_amount  -> the trigger recomputes status/balance/payment_date from
--                             billing_receipt_items and OVERRIDES what you wrote.
--   * Leave final_amount alone -> the trigger's IF is false and it does nothing, so
--                             explicit status/balance writes stick.
-- Therefore a repricing that must ALSO end unpaid takes TWO statements: reprice first,
-- then correct the payment state without touching final_amount. That is this file.
--
-- SOORIYA B needed the same two-step (20260811093000 then 20260811120000) and it was
-- mistakenly attributed to the trigger being inert. It is not inert; that migration
-- simply never changed final_amount, so the trigger's guard was false.
--
-- This statement changes ONLY status, balance_amount and payment_date. final_amount
-- stays at Rs 500, so the trigger does not fire and these values persist.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: it does not touch billing_receipts or
-- billing_receipt_items. Receipt RCP-2026-003379 still allocates Rs 3,000 to this bill
-- and Rs 2,500 to the cancelled Term 2. Reversing that is MyJKKN's domain and was not
-- requested. Rs 5,500 receipted against Rs 500 of live billing -- accounts to reverse
-- and re-collect Rs 500.
--
-- KNOWN AND ACCEPTED CONSEQUENCE: this LOCKS THE LEARNER OUT of the student portal.
-- tms_student_transport_access is fail-CLOSED on a PAID Term 1 and will return
-- allowed=false, reason='term1_unpaid'. Term 1 was due 2026-07-31, so it also reads
-- as OVERDUE. Access returns when the Rs 500 is receipted.

do $$
declare
  v_learner uuid;
  v_bill    uuid;
  v_final   numeric;
  v_n       int;
begin
  select count(*) into v_n
  from public.learners_profiles
  where lower(college_email) = 'gowsikamcse2023@jkkn.ac.in';

  if v_n <> 1 then
    raise exception
      'Expected exactly 1 learner for gowsikamcse2023@jkkn.ac.in, found %', v_n;
  end if;

  select id into v_learner
  from public.learners_profiles
  where lower(college_email) = 'gowsikamcse2023@jkkn.ac.in';

  select b.id, b.final_amount into v_bill, v_final
  from public.tms_fee_bill fb
  join public.billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_id         = v_learner
    and fb.person_type       = 'learner'
    and fb.transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
    and fb.term_no           = 1
    and fb.status            = 'generated';

  if v_bill is null then
    raise exception 'No generated Term-1 transport bill found for learner %', v_learner;
  end if;

  -- Guard: only proceed from the state 20260811130000 actually left behind. If the
  -- bill is not the repriced Rs 500, something else has changed it and this file's
  -- assumptions no longer hold.
  if v_final <> 500 then
    raise exception
      'Expected Term 1 final_amount = 500, found % - refusing to touch payment state',
      v_final;
  end if;

  -- Already unpaid? Then stop -- re-running must not append the remark twice.
  perform 1 from public.billing_student_bills
   where id = v_bill and status = 'unpaid';
  if found then
    raise notice 'Term 1 for learner % is already unpaid; skipping.', v_learner;
    return;
  end if;

  -- final_amount is deliberately NOT in this SET list. Including it would re-arm
  -- update_bill_balance_on_amount_change and undo everything below.
  update public.billing_student_bills b
     set balance_amount = v_final,
         status         = 'unpaid',
         payment_date   = null,
         remarks        = concat_ws(' | ', nullif(b.remarks, ''),
                          'Marked UNPAID on 2026-08-11: the Rs 500 scholarship fee is '
                          || 'outstanding. Receipt RCP-2026-003379 still allocates '
                          || 'Rs 3,000 to this bill and Rs 2,500 to the cancelled Term 2 '
                          || '-- accounts to reverse and re-collect Rs 500.'),
         updated_at     = now()
   where b.id = v_bill;

  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Expected to update exactly 1 bill, updated % - rolled back', v_n;
  end if;

  raise notice 'GOWSIKA M Term 1 marked unpaid: Rs % outstanding.', v_final;
end $$;
