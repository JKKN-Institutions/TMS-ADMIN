-- BOOPALAN S (boopalans26engg@jkkn.ac.in, no roll) is a 7.5% scheme learner.
-- The 48h sweep raised a Rs 15,600 Transport Fee on 2026-09-25, and the
-- 2026-09-28 waiver then deleted his Rs 5,500 maintenance bill. On the user's
-- request (2026-09-28): remove the Transport Fee and bill only the 7.5%
-- scheme maintenance fee of Rs 500.
--
-- 1. Back up the fine, its money row and the notice into
--    tms_transport_fee_removed_backup.
-- 2. Unlink the notice (fine_id is a NO ACTION FK) and set it to cancelled.
--    Override learners are skipped by the sweep, so no new countdown starts.
-- 3. Delete the unpaid money row. tms_fee_fine cascades.
-- 4. Rewrite the override pair from "TRANSPORT FEE RAISED" (waived) to the
--    scheme_75 pair: Term 1 = Rs 500, Term 2 not billable. The
--    auto-generate-bills cron then raises one Rs 500 maintenance bill.
-- Already applied to production; recorded here.

do $$
declare
  v_person constant uuid := '01f20b96-5b46-4aeb-8f37-d24e30130214';
  v_year   constant uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  v_bill   constant uuid := 'ea07fe98-5a9d-4e24-96d2-44135572200c';
  v_fine   constant uuid := '0d4295b0-afd7-4a03-9076-6f96e3e79efd';
  v_rule   constant uuid := '4834ff4b-3151-4525-9500-084011fcc4ce';
  v_n int;
begin
  -- Guards: the Transport Fee must still be unpaid with no money against it.
  if not exists (select 1 from billing_student_bills
                 where id = v_bill and student_id = v_person and status = 'unpaid'
                   and balance_amount = final_amount) then
    raise exception 'Transport Fee bill % is not an untouched unpaid bill', v_bill;
  end if;
  if exists (select 1 from billing_receipt_items where bill_id = v_bill)
     or exists (select 1 from payment_transaction_items where bill_id = v_bill) then
    raise exception 'Transport Fee bill % has receipts or payment attempts', v_bill;
  end if;

  insert into tms_transport_fee_removed_backup (fine, bill, notice, removed_reason)
  select to_jsonb(f), to_jsonb(b), to_jsonb(n),
         '7.5% scheme learner BOOPALAN S - Transport Fee removed, maintenance fee billed at Rs 500 (user request 2026-09-28)'
  from tms_fee_fine f
  join billing_student_bills b on b.id = f.billing_student_bill_id
  left join tms_fee_payment_notice n on n.fine_id = f.id
  where f.id = v_fine;

  update tms_fee_payment_notice
     set fine_id = null, status = 'cancelled', updated_at = now()
   where fine_id = v_fine;

  delete from billing_student_bills where id = v_bill;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'expected to delete 1 bill, deleted %', v_n; end if;

  update tms_fee_override
     set billable = true, amount = 500, concession_rule_id = v_rule, updated_at = now(),
         reason = '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (BOOPALAN S, boopalans26engg) - 2026-09-28'
   where person_id = v_person and transport_year_id = v_year and term_no = 1;
  update tms_fee_override
     set billable = false, amount = null, concession_rule_id = v_rule, updated_at = now(),
         reason = '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (BOOPALAN S, boopalans26engg) - 2026-09-28'
   where person_id = v_person and transport_year_id = v_year and term_no = 2;
end $$;
