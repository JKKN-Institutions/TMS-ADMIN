-- 7.5% scheme fix for KIRUBAVATHI T (EI24021), learner cecc22ff-1a4f-4962-b410-5cfe65340ec3.
--
-- She pays a flat Rs 500/year, satisfied entirely by Term 1 (money row 18708454 reads
-- 500 PAID on 2026-08-24 09:57). The every-2-minute generator raised a Rs 2,500 Term 2
-- three minutes later because no tms_fee_override suppressed it.
--
-- Order matters: write the override PAIR first so the cron cannot re-raise the term in
-- the gap, then delete the MONEY row (billing_student_bills). Deleting tms_fee_bill
-- directly always aborts with SQLSTATE 27000 - the BEFORE DELETE trigger deletes the
-- linked money row, which CASCADEs back onto the tuple being deleted. The money-side
-- delete does NOT run the trigger's payment guards, so they are replicated inline.

begin;

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
values
  ('cecc22ff-1a4f-4962-b410-5cfe65340ec3', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true,  500,
   '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (KIRUBAVATHI T, EI24021) - 2026-09-11'),
  ('cecc22ff-1a4f-4962-b410-5cfe65340ec3', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 2, false, null,
   '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (KIRUBAVATHI T, EI24021) - 2026-09-11')
on conflict (person_id, transport_year_id, term_no) do update
  set billable = excluded.billable,
      amount   = excluded.amount,
      reason   = excluded.reason,
      updated_at = now();

-- Delete the Term 2 money row; the CASCADE removes tms_fee_bill 81a1fe88.
-- The four payment guards from trg_tms_fee_bill_cleanup_linked_billing are replicated here.
delete from billing_student_bills b
where b.id = '4df63b97-e8b3-4ac0-9997-a2ea7601c932'
  and b.status = 'unpaid'
  and b.payment_date is null
  and not exists (select 1 from billing_receipt_items     r where r.bill_id = b.id)
  and not exists (select 1 from payment_transaction_items t where t.bill_id = b.id);

commit;
