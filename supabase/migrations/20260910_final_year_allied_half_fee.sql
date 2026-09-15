-- Final-year Allied Health Sciences learners pay half the annual transport fee
-- for 2026-2027. Applied to the live DB on 2026-09-10; recorded here so it is
-- auditable. Same rule and same shape as the Pharmacy change one day earlier
-- (20260909_final_year_pharmacy_half_fee.sql).
--
-- WHY. Transport year 2026-2027 runs 2026-06-01 to 2027-05-31. Allied's UGB23
-- batch ("2023-2026") closes 2026-11-30 -- month six, the first half of the
-- year. Those learners pay half of Rs 5,500: Rs 2,750.
--
-- WHO, AND WHY THE PHARMACY FILTER DOES NOT WORK HERE. Neither key used for
-- Pharmacy is usable at Allied:
--   * `semesters.terminal_semester` is FALSE on all 36 Allied semester rows
--     (Nursing and Dental are likewise 0). `semester_order` is 1 on every row
--     too, so there is no ordering fallback -- the year of study exists only as
--     the semester NAME text, "1 Year".."4 Year".
--   * `learners_profiles.batch_id` points at the WRONG COLLEGE. Every Allied
--     learner is attached to a batch row owned by the Engineering college (or
--     Dental). All three batches Allied actually owns -- UGB23, UGB24, UGB25 --
--     have ZERO learners attached. This is why a sweep of batch end dates for
--     Allied learners returns only 30-May dates and misses UGB23 entirely.
-- So the cohort is keyed on ADMISSION YEAR instead: `admission_years.year =
-- 2023` is the UGB23 intake. That is 65 final-year learners, 15 of them riders.
--
-- No learner is excluded. Unlike Pharmacy, none of the 15 had paid anything --
-- all 15 held a single unpaid term-1 bill of exactly Rs 5,500, and none had a
-- pre-existing override. The payment guards below are kept anyway so the
-- statements stay safe to re-run.
--
-- WHY AN OVERRIDE ROW IS MANDATORY. Cron job 23 (tms-auto-generate-bills) runs
-- every two minutes. Editing an amount records no DECISION -- only a
-- tms_fee_override makes Rs 2,750 durable if these bills are ever regenerated.
-- It is written FIRST so a cron firing mid-run already sees the reduced price.
--
-- WHY BOTH LEDGERS. tms_fee_bill is the transport ledger; billing_student_bills
-- is the money row the learner sees and pays. Repricing one and not the other
-- is the drift already recorded against the 7.5% scholarship cohort.
--
-- balance_amount and status are NOT set by hand: the BEFORE UPDATE trigger
-- update_bill_balance_on_amount_change recomputes them from actual receipts,
-- and trg_bbi_rescale_on_amount_change rescaled each bill's two
-- billing_bill_instalments tranches so they still sum to 2,750.
--
-- RESULT. Final-year Allied transport billing fell from Rs 82,500 to
-- Rs 41,250 -- a reduction of Rs 41,250 across 15 learners. Other Allied riders
-- are unchanged.
--
-- REVERT. Delete the 15 override rows whose reason starts 'FINAL-YEAR BATCH
-- CLOSURE - Allied UGB23', then restore amounts from the tables written on the
-- day: tms_final_year_allied_halffee_backup_20260910 (15 rows, both ledgers as
-- jsonb) and tms_final_year_allied_halffee_target_20260910 (fb_id, sb_id and the
-- old amounts). Setting final_amount back to 5500 re-runs the same triggers and
-- restores the balance and the instalment split on its own.
--
-- NOT DONE, deliberately. One-off for 2026-2027; nothing is automatic. Two data
-- problems were found and NOT fixed, because `learners_profiles`, `semesters`
-- and `batches` are MyJKKN-owned: Allied's terminal_semester flags are unset,
-- and Allied learners are attached to another college's batch rows. Also worth
-- flagging to whoever owns MyJKKN: 35 Allied learners still sit in a "4 Year"
-- cohort whose batch ended 2026-05-30, i.e. the year of study has not rolled
-- over. None of those 35 is a bus rider, so none is affected here.

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
select t.learner_id, 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', t.term_no, true, 2750,
       'FINAL-YEAR BATCH CLOSURE - Allied UGB23 2023-2026 batch closes 2026-11-30, half of transport year 2026-2027, annual transport fee reduced 50% to Rs 2750 ('
       || coalesce(t.first_name,'') || coalesce(' ' || t.last_name,'') || ', ' || coalesce(t.roll_number,'') || ') - 2026-09-10'
from tms_final_year_allied_halffee_target_20260910 t
on conflict (person_id, transport_year_id, term_no) do nothing;

update billing_student_bills sb
set final_amount = 2750, total_amount = 2750, unit_amount = 2750
from tms_final_year_allied_halffee_target_20260910 t
where sb.id = t.sb_id
  and sb.status = 'unpaid' and sb.payment_date is null
  and sb.final_amount = 5500 and sb.balance_amount = sb.final_amount
  and not exists (select 1 from billing_receipt_items ri where ri.bill_id = sb.id)
  and not exists (select 1 from payment_transaction_items pti where pti.bill_id = sb.id);

update tms_fee_bill fb
set amount = 2750
from tms_final_year_allied_halffee_target_20260910 t
where fb.id = t.fb_id
  and fb.status = 'generated' and fb.paid_amount is null and fb.amount = 5500;
