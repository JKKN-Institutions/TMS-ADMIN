-- Delete a Rs 9,900 transport fine raised in error for BHARATHI RAJA M (AUG24CA93).
-- The fine (2026-09-10) said the bus fee was unpaid, but the Rs 5,000 Transport
-- Maintenance Fee had been paid in cash the day before (RCP-2026-010949, 2026-09-09).
--
-- Applied to production 2026-09-18 on admin request. Deleted rather than cancelled:
-- a cancel must go through MyJKKN's fn_cancel_student_bill (reason + attachment).
-- Deleting the money row cascades to tms_fee_fine (FK ON DELETE CASCADE).
-- A snapshot of both rows is kept in tms_activity_log (entity_id = the fine id).
-- Idempotent: the guards make a re-run a no-op.

delete from public.billing_student_bills b
where b.id = '066dbaee-9459-463a-8985-d3663d068bac'
  and b.status = 'unpaid'
  and b.balance_amount = b.final_amount
  and not exists (select 1 from public.billing_receipt_items where bill_id = b.id)
  and not exists (select 1 from public.payment_transaction_items where bill_id = b.id);
