-- 7.5% scheme fix for VENKATAPREETHI N (EI23052), learner f18e3cd1-28b1-4fdf-81f5-423678731a51.
-- Applied to the live DB on 2026-09-11 08:14 UTC; recorded here so it is auditable.
--
-- She pays a flat Rs 500/year, satisfied entirely by Term 1 (money row ecf63379 reads
-- 500 PAID on 2026-08-19 07:25). The every-2-minute generator raised a Rs 2,500 Term 2
-- (money row 0c246b33, ledger 89efa3a6) at 07:30 the same day, because she had no
-- tms_fee_override at all.
--
-- Order matters: write the override PAIR first so the cron cannot re-raise the term in
-- the gap, then delete the MONEY row (billing_student_bills). Deleting tms_fee_bill
-- directly always aborts with SQLSTATE 27000 - the BEFORE DELETE trigger deletes the
-- linked money row, which CASCADEs back onto the tuple being deleted. The money-side
-- delete does NOT run the trigger's payment guards, so they are replicated inline.

begin;

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
values
  ('f18e3cd1-28b1-4fdf-81f5-423678731a51', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true,  500,
   '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (VENKATAPREETHI N, EI23052) - 2026-09-11'),
  ('f18e3cd1-28b1-4fdf-81f5-423678731a51', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 2, false, null,
   '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (VENKATAPREETHI N, EI23052) - 2026-09-11')
on conflict (person_id, transport_year_id, term_no) do update
  set billable = excluded.billable,
      amount   = excluded.amount,
      reason   = excluded.reason,
      updated_at = now();

-- Delete the Term 2 money row; the CASCADE removes tms_fee_bill 89efa3a6.
-- The four payment guards from trg_tms_fee_bill_cleanup_linked_billing are replicated here.
delete from billing_student_bills b
where b.id = '0c246b33-3371-4931-a308-8a72d04c01c4'
  and b.status = 'unpaid'
  and b.payment_date is null
  and not exists (select 1 from billing_receipt_items     r where r.bill_id = b.id)
  and not exists (select 1 from payment_transaction_items t where t.bill_id = b.id);

commit;
