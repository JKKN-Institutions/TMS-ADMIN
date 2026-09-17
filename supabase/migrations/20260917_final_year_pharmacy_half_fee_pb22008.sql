-- Final-year BPHARM half fee for ONE late-billed learner: DHARANI K (PB22008).
-- Applied to the live DB on 2026-09-17; recorded here so it is auditable.
--
-- Same rule as 20260909_final_year_pharmacy_half_fee.sql: the BPHARM 2022-2026
-- batch (UGB22) closes 2026-10-31, five months into transport year 2026-2027, so
-- the annual Rs 5,500 transport fee is halved to Rs 2,750.
--
-- WHY SHE WAS MISSED. She matches every cohort condition (Pharmacy, BPHARM,
-- active, bus_required, Semester VIII terminal, batch UGB22 ends 2026-10-31) but
-- her bill was generated only on 2026-09-17 06:34 UTC by the auto-generate cron --
-- the same late-billing gap as PB22025 and PB22007.
--
-- The bill was unpaid with no receipts or payment transactions. One bill, one
-- instalment ("Term 1", 5500); trg_bbi_rescale_on_amount_change rescales it and
-- update_bill_balance_on_amount_change recomputes balance_amount.
--
-- REVERT. Delete the override row below, then set billing_student_bills
-- 193c6616-d04b-483f-8cae-7d4b332015ec final/total/unit_amount and tms_fee_bill
-- e375a5bf-c4ed-4a63-9446-6216a1a39613 amount back to 5500 (triggers restore the
-- balance and instalment). Original rows: tms_final_year_pharmacy_halffee_backup_20260917.

create table if not exists tms_final_year_pharmacy_halffee_backup_20260917 as
select now() as backed_up_at, fb.id as fb_id, fb.billing_student_bill_id as sb_id, to_jsonb(fb) as fee_bill, to_jsonb(sb) as student_bill,
       (select jsonb_agg(to_jsonb(bi)) from billing_bill_instalments bi where bi.bill_id = sb.id) as instalments
from tms_fee_bill fb join billing_student_bills sb on sb.id = fb.billing_student_bill_id
where fb.id = 'e375a5bf-c4ed-4a63-9446-6216a1a39613';

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
values ('c82fdbfd-f1a7-4403-89d1-9d6781ff372c', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true, 2750,
  'FINAL-YEAR BATCH CLOSURE - BPHARM 2022-2026 batch closes 2026-10-31, half of transport year 2026-2027, annual transport fee reduced 50% to Rs 2750 (DHARANI K, PB22008) - 2026-09-17')
on conflict (person_id, transport_year_id, term_no) do nothing;

update billing_student_bills sb
set final_amount = 2750, total_amount = 2750, unit_amount = 2750
where sb.id = '193c6616-d04b-483f-8cae-7d4b332015ec'
  and sb.status = 'unpaid' and sb.payment_date is null
  and sb.final_amount = 5500 and sb.balance_amount = sb.final_amount
  and not exists (select 1 from billing_receipt_items ri where ri.bill_id = sb.id)
  and not exists (select 1 from payment_transaction_items pti where pti.bill_id = sb.id);

update tms_fee_bill fb
set amount = 2750
where fb.id = 'e375a5bf-c4ed-4a63-9446-6216a1a39613'
  and fb.status = 'generated' and fb.paid_amount is null and fb.amount = 5500;
