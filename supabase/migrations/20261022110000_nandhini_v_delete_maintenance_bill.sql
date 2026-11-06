-- NANDHINI V (nandhiniv26engg). Rs 5,500 Transport Maintenance Fee (Term 1,
-- 2026-2027) raised 2026-09-03 from the admission-form bus_required cohort that
-- was left standing. She never submitted a Bus Pass Request, and her profile
-- now has bus_required = false with no route/stop. On the user's request
-- (2026-10-22): delete the bill.
--
-- Deleted from the MONEY side: tms_fee_bill cannot be deleted directly (27000),
-- its FK to billing_student_bills is ON DELETE CASCADE. The payment guards of
-- trg_tms_fee_bill_cleanup_linked_billing do not run from this side, so they
-- are replicated here. No override is written: she is not in
-- tms_billable_learner, so auto-billing will not re-raise it, and a later
-- genuine bus pass request should still bill her.

do $$
declare
  v_person constant uuid := 'ceb3e567-95f8-4aa3-9d5a-c2b46879ff02';
  v_bill   constant uuid := '13c31155-dca7-4b67-b74f-2af3422c7b3e';
  v_ledger constant uuid := '3f06764b-0742-4d32-b977-187721429d54';
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
  select 'fees', 'delete', 'fee_bill', v_ledger::text, 'NANDHINI V',
         'Deleted Rs 5,500 Transport Maintenance Fee Term 1 - no bus pass request (user request 2026-10-22)',
         jsonb_build_object('money_row', to_jsonb(b), 'ledger_row', to_jsonb(t))
    from billing_student_bills b
    left join tms_fee_bill t on t.id = v_ledger
   where b.id = v_bill;

  delete from billing_student_bills where id = v_bill;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'expected to delete 1 bill, deleted %', v_n; end if;
end $$;
