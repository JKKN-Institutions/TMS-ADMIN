-- NISANTH S (nisanths26mcse). The 48h sweep raised a Rs 18,400 Transport Fee
-- on 2026-09-25, but he never submitted a Bus Pass Request (not in
-- tms_billable_learner); his maintenance bill came from the 2026-09-03
-- admission-form cohort that was left standing. On the user's request
-- (2026-10-22): delete the Transport Fee. Same steps as
-- 20261016100000_dishanthvarsan_r_remove_transport_fee.sql EXCEPT the
-- 'TRANSPORT FEE RAISED' override pair is KEPT, so the maintenance fee stays
-- at Rs 0 (a non-applicant should owe nothing for transport).

do $$
declare
  v_person constant uuid := '110bf2d0-45fc-404f-af5d-7e071a66f879';
  v_bill   constant uuid := 'c12caf2c-d375-4f42-8e70-397c0b56d513';
  v_fine   constant uuid := '34376f22-393e-4285-a9a4-2cc9d1c5a438';
  v_n int;
begin
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
         'NISANTH S - Transport Fee removed, no bus pass request (user request 2026-10-22)'
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
end $$;
