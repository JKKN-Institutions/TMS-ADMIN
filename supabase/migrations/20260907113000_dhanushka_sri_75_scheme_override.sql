-- DHANUSHKA SRI S (ES25008, dhanushkasriscse2025@jkkn.ac.in) is a 7.5%-scheme
-- learner: the annual transport fee is a flat Rs 500, already PAID under Term 1.
-- Applied to the live DB on 2026-09-07; recorded here so it is auditable.
--
-- Complaint: "I deleted the Term 2 bill and it came back."
--
-- TWO separate causes, both real.
--
-- (1) WHY IT REGENERATES. A delete records no DECISION. lib/fees/generate.ts:407
-- reads its idempotency key from tms_fee_bill alone, and cron job 23
-- (tms-auto-generate-bills) runs EVERY 2 MINUTES, so a deleted term simply looks
-- like a term still to raise. Only a tms_fee_override durably suppresses it.
-- Proof from live data: of the 19 learners on this scheme (tms ledger 3,000 /
-- money row 500), all 9 holding an override have ZERO Term 2 bills and all 10
-- without one carry a 2,500 Term 2. A batch of these overrides was written on
-- 2026-09-01 at 08:02; the cron raised this learner's Term 2 at 08:15 -- he was
-- missed by 13 minutes.
--
-- (2) WHY THE DELETE NEVER TOOK. Deleting from tms_fee_bill is IMPOSSIBLE.
-- trg_tms_fee_bill_cleanup_linked_billing is a BEFORE DELETE trigger that
-- deletes the linked billing_student_bills row, and
-- tms_fee_bill_billing_student_bill_id_fkey is ON DELETE CASCADE -- so that
-- delete cascades straight back onto the very tuple being deleted. Postgres
-- aborts with SQLSTATE 27000, "tuple to be deleted was already modified by an
-- operation triggered by the current command". EVERY attempt fails, and a caller
-- that swallows the error leaves the bill in place reporting success. That is
-- the reported symptom, and it is not specific to this learner.
--
-- The working direction is to delete the MONEY row and let the CASCADE remove
-- the ledger row. The trigger's payment guard does not run in this direction,
-- so its checks are replicated in the WHERE clause below: this can never remove
-- a bill carrying payment activity.
--
-- Order matters: the override goes in FIRST, so that if the cron fires between
-- the two statements it already sees Term 2 as non-billable and cannot re-raise
-- what the delete is about to remove.
--
-- Revert: delete the two override rows below, then re-raise Term 2. The removed
-- bill was billing_student_bills 6e128461-ccce-4bf1-bd84-242f8dc13157
-- ("Transport Fee - 2026-2027 - Term 2", final 2500.00, balance 2500.00,
-- unpaid, due 2026-08-31) and, via cascade, tms_fee_bill
-- 60d55fc8-73bc-4989-bf58-7df32bfa2d97. Nothing had been paid against it.
--
-- Wording and shape deliberately copy the existing rows for KAVIYA G and
-- MANIMARAN P so this learner is indistinguishable from the rest of the cohort.
-- Their Term 1 tms_fee_bill.amount is likewise left at its stale 3,000 (the
-- money row is the authority and already reads 500 PAID); that drift affects
-- all 19 and is a separate cleanup, not something to fix for one person alone.

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
values
  ('ad2cb8af-5d2a-493d-9bc5-ed3089cf5d0f', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true,  500,
   '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (DHANUSHKA SRI S, ES25008) - 2026-09-07'),
  ('ad2cb8af-5d2a-493d-9bc5-ed3089cf5d0f', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 2, false, null,
   '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (DHANUSHKA SRI S, ES25008) - 2026-09-07')
on conflict do nothing;

delete from billing_student_bills b
where b.id = '6e128461-ccce-4bf1-bd84-242f8dc13157'
  and b.student_id = 'ad2cb8af-5d2a-493d-9bc5-ed3089cf5d0f'
  and b.status = 'unpaid'
  and b.payment_date is null
  and b.balance_amount = b.final_amount
  and not exists (select 1 from billing_receipt_items ri where ri.bill_id = b.id)
  and not exists (select 1 from payment_transaction_items pti where pti.bill_id = b.id);
