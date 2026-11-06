-- NAVEEN RAJ K V AUG24CS36 (naveenrajkv24ucs). The 48h sweep raised a
-- Rs 14,300 Transport Fee, and the 2026-09-28 waiver then deleted his Rs 5,000
-- maintenance bill. On the user's request (2026-09-28): remove the Transport
-- Fee and restore the Transport Maintenance Fee. These are the same steps as
-- 20260928160000_first_year_two_remove_transport_fee.sql.
-- Already applied to production; recorded here.

do $$
declare
  v_year   constant uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  v_person constant uuid := '8a1e3161-bdb0-4251-813c-87d993a7cd2f';
  v_bill   constant uuid := '9a4cc3a2-8b91-408f-8da2-3dea80e70b3c';
  v_fine   constant uuid := '4125a625-bc68-4c6c-8d7c-ac5f5a4258bd';
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
         'NAVEEN RAJ K V AUG24CS36 - Transport Fee removed, maintenance fee restored (user request 2026-09-28)'
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
