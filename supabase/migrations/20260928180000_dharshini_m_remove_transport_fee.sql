-- DHARSHINI M AUG25CA27 (dharshinim25uca). The 48h sweep raised a Rs 16,500
-- Transport Fee, and the 2026-09-28 waiver then deleted her Rs 5,000
-- maintenance bill. On the user's request (2026-09-28): remove the Transport
-- Fee and restore the Transport Maintenance Fee. These are the same steps as
-- 20260928160000_first_year_two_remove_transport_fee.sql.
-- Already applied to production; recorded here.

do $$
declare
  v_year   constant uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  v_person constant uuid := '32ce243f-bcdd-477f-8bfb-7dcce348cf76';
  v_bill   constant uuid := '888bb28e-9aba-40ae-8869-2d685054090a';
  v_fine   constant uuid := 'a26c5798-86a4-409e-8161-9d70d27200f3';
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
         'DHARSHINI M AUG25CA27 - Transport Fee removed, maintenance fee restored (user request 2026-09-28)'
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
