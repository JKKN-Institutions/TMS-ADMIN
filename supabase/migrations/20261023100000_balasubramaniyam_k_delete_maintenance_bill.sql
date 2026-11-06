-- BALASUBRAMANIYAM K (APG26CS02, balasubramaniyamk26pcs). Rs 500 Transport
-- Maintenance Fee (Term 1, 2026-2027, Arts Self) raised 2026-08-11 by manual
-- generate run e7f05e3c, before billing was gated on tms_billable_learner. He
-- never submitted a Bus Pass Request and bus_required = false. On the user's
-- request (2026-10-23): delete the bill.
--
-- Same shape as 20261022110000_nandhini_v_delete_maintenance_bill.sql: delete
-- from the MONEY side (cascades tms_fee_bill), replicate the payment guards,
-- no override (not billable, so auto-billing will not re-raise it).

do $$
declare
  v_person constant uuid := 'ad1b5cf4-6401-49a8-b4d0-f70ad4ab4c66';
  v_bill   constant uuid := 'fbc55515-eaf1-4f69-98a4-6d03138405d2';
  v_ledger constant uuid := '665ec771-dd08-4f02-b088-a00bf33a2a1e';
  v_n int;
begin
  if not exists (select 1 from billing_student_bills
                 where id = v_bill and student_id = v_person and status = 'unpaid'
                   and payment_date is null and balance_amount = final_amount) then
    raise exception 'Maintenance bill % is not an untouched unpaid bill', v_bill;
  end if;
  if exists (select 1 from billing_receipt_items where bill_id = v_bill)
     or exists (select 1 from payment_transaction_items where bill_id = v_bill) then
    raise exception 'Maintenance bill % has receipts or payment attempts', v_bill;
  end if;
  if exists (select 1 from tms_billable_learner where id = v_person) then
    raise exception 'Learner % is now a billable bus pass applicant', v_person;
  end if;

  insert into tms_activity_log (module, action, entity_type, entity_id, entity_label, description, metadata)
  select 'fees', 'delete', 'fee_bill', v_ledger::text, 'BALASUBRAMANIYAM K',
         'Deleted Rs 500 Transport Maintenance Fee Term 1 - no bus pass request (user request 2026-10-23)',
         jsonb_build_object('money_row', to_jsonb(b), 'ledger_row', to_jsonb(t))
    from billing_student_bills b
    left join tms_fee_bill t on t.id = v_ledger
   where b.id = v_bill;

  delete from billing_student_bills where id = v_bill;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'expected to delete 1 bill, deleted %', v_n; end if;
end $$;
