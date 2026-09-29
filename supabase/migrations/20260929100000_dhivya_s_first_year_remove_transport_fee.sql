-- First-year learner DHIVYA S (AUG26CA23, divyas26ucc@jkkn.ac.in). The 48h
-- sweep raised a Rs 14,850 Transport Fee on 2026-09-25, and the 2026-09-28
-- waiver then deleted her maintenance bill. On the user's request (2026-09-29):
-- remove the Transport Fee and show only the Transport Maintenance Fee.
-- Same recipe as 20260928160000_first_year_two_remove_transport_fee.sql.
-- Already applied to production on 2026-09-29; recorded here. The cron then
-- re-raised her maintenance fee at Rs 500 (Term 1, due 2026-08-31), the same
-- amount as her original bill from fee structure 4716ae9e.

do $$
declare
  v_year   constant uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  v_person constant uuid := '1c1499b4-1c46-4831-a3b4-984604bf50ac';
  v_bill   constant uuid := '3779a759-186c-478b-949e-b88825599105';
  v_fine   constant uuid := '0a6fa7ad-b53c-4189-9f0c-9213c3c221aa';
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
         'First-year learner DHIVYA S (AUG26CA23) - Transport Fee removed, maintenance fee restored (user request 2026-09-29)'
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

  delete from tms_fee_override
   where person_id = v_person and transport_year_id = v_year
     and reason like 'TRANSPORT FEE RAISED%';
end $$;
