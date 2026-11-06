-- DISHANTHVARSAN R (pharmacy). The 48h sweep raised a Rs 18,150 Transport Fee
-- on 2026-09-25. On the user's request (2026-10-16): remove the Transport Fee
-- and restore the Transport Maintenance Fee. Same steps as
-- 20260928180000_dharshini_m_remove_transport_fee.sql.

do $$
declare
  v_year   constant uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  v_person constant uuid := '21a30b66-4f42-4a2b-a9bc-a9e448904e67';
  v_bill   constant uuid := '929efcad-aac0-434f-9834-2ebbfab5bc27';
  v_fine   constant uuid := '115444d8-892c-4e8e-9a23-85bf5129c5e3';
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
         'DISHANTHVARSAN R - Transport Fee removed, maintenance fee restored (user request 2026-10-16)'
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
