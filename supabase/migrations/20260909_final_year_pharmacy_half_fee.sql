-- Final-year BPHARM learners pay half the annual transport fee for 2026-2027.
-- Applied to the live DB on 2026-09-09; recorded here so it is auditable.
--
-- WHY. Transport year 2026-2027 runs 2026-06-01 to 2027-05-31. The BPHARM
-- 2022-2026 batch closes 2026-10-31 -- five months in. Those learners ride for
-- roughly half the year, so they pay half of the Rs 5,500 annual fee: Rs 2,750.
--
-- WHO. The cohort is pinned by six conditions, all of them stored facts, none
-- derived: institution = JKKN College of Pharmacy, program = BPHARM,
-- lifecycle_status = 'active', bus_required, the joined semester has
-- terminal_semester = true (Semester VIII), and the joined batch ends
-- 2026-10-31. That is 25 learners. It is also the ONLY cohort in the whole
-- group that is both in a terminal semester and closes inside the first half of
-- the transport year.
--
-- KAMALESH (PB22033) is EXCLUDED. He had already paid the full Rs 5,500 across
-- two bills. Reducing a settled bill is a refund, not a discount, and is an
-- accounts decision. The payment guards below are what enforce that exclusion
-- mechanically rather than by memory. 24 learners were repriced.
--
-- WHY AN OVERRIDE ROW IS MANDATORY. Cron job 23 (tms-auto-generate-bills) runs
-- every two minutes. Editing an amount records no DECISION -- only a
-- tms_fee_override makes Rs 2,750 durable if these bills are ever regenerated.
-- lib/fees/overrides.ts applies it AFTER the flat fee mode produces its term,
-- so the fee structure and the other 213 Pharmacy riders are untouched. The
-- override is written FIRST for the same reason: if the cron fires between
-- statements it already sees the reduced price.
--
-- WHY BOTH LEDGERS. tms_fee_bill is the transport ledger; billing_student_bills
-- is the money row the learner actually sees and pays. Repricing only one is the
-- exact drift already recorded against the 7.5% scholarship cohort.
--
-- balance_amount and status are deliberately NOT set by hand. The BEFORE UPDATE
-- trigger update_bill_balance_on_amount_change recomputes both from actual
-- receipts. Likewise billing_bill_instalments: trg_bbi_rescale_on_amount_change
-- rescaled each bill's two tranches from 3000/2500 to 1500/1250, preserving the
-- sum invariant. Neither is touched here.
--
-- RESULT. Final-year Pharmacy transport billing fell from Rs 137,500 to
-- Rs 71,500. The reduction is Rs 66,000 (24 x Rs 2,750). Non-final-year Pharmacy
-- billing is unchanged at Rs 1,171,500 across 213 riders.
--
-- REVERT. Delete the 24 override rows whose reason starts 'FINAL-YEAR BATCH
-- CLOSURE', then restore amounts from the two tables written on the day:
--   tms_final_year_pharmacy_halffee_backup_20260909 (26 rows, both ledgers as
--     jsonb, for all 25 learners including the paid one)
--   tms_final_year_pharmacy_halffee_target_20260909 (the 24 rows actually
--     repriced, with fb_id, sb_id and the old amounts)
-- Setting final_amount back to 5500 re-runs the same triggers and restores the
-- balance and the instalment split on its own.
--
-- NOT DONE, deliberately. This is a one-off for 2026-2027. Nothing here is
-- automatic: when the BPHARM 2023-2028 batch reaches Semester VIII someone must
-- repeat it by hand. The durable fix is a rule in the fee generator keyed on
-- batches.end_date, which also needs the bad batch rows cleaned first (a batch
-- labelled 2024-2030 carries end_date 2026-05-30). There is still no admin UI
-- for overrides; every row in tms_fee_override was written by hand in SQL.

-- Statements below reproduce what was applied. tms_final_year_pharmacy_halffee_-
-- target_20260909 was materialised first, from the cohort filter plus the
-- payment guards, and asserted to hold exactly 24 rows totalling Rs 132,000
-- before anything was written.

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
select t.learner_id, 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', t.term_no, true, 2750,
       'FINAL-YEAR BATCH CLOSURE - BPHARM 2022-2026 batch closes 2026-10-31, half of transport year 2026-2027, annual transport fee reduced 50% to Rs 2750 ('
       || coalesce(t.first_name,'') || coalesce(' ' || t.last_name,'') || ', ' || coalesce(t.roll_number,'') || ') - 2026-09-09'
from tms_final_year_pharmacy_halffee_target_20260909 t
on conflict (person_id, transport_year_id, term_no) do nothing;

update billing_student_bills sb
set final_amount = 2750, total_amount = 2750, unit_amount = 2750
from tms_final_year_pharmacy_halffee_target_20260909 t
where sb.id = t.sb_id
  and sb.status = 'unpaid' and sb.payment_date is null
  and sb.final_amount = 5500 and sb.balance_amount = sb.final_amount
  and not exists (select 1 from billing_receipt_items ri where ri.bill_id = sb.id)
  and not exists (select 1 from payment_transaction_items pti where pti.bill_id = sb.id);

update tms_fee_bill fb
set amount = 2750
from tms_final_year_pharmacy_halffee_target_20260909 t
where fb.id = t.fb_id
  and fb.status = 'generated' and fb.paid_amount is null and fb.amount = 5500;
