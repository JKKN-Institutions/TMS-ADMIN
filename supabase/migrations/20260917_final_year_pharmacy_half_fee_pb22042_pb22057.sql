-- Final-year BPHARM half fee for TWO late-billed learners:
--   KISHORE NAGARAJ   (PB22042, learners_profiles.id 6ec3d35d-8f33-492a-bfcf-fa0bc0e82fa7)
--   MUQSITH AHMED S   (PB22057, learners_profiles.id b10fa9b4-76aa-43c8-915a-f6dfb8f38978)
-- Applied to the live DB on 2026-09-17; recorded here so it is auditable.
--
-- Same rule as 20260909_final_year_pharmacy_half_fee.sql (BPHARM 2022-2026 batch
-- UGB22 closes 2026-10-31 -> annual Rs 5,500 transport fee halved to Rs 2,750).
-- Both qualify (Pharmacy, BPHARM, active, bus_required, Semester VIII terminal)
-- and were auto-billed on 2026-09-16 after the one-off run.
--
-- DIFFERENT FROM PB22007/PB22008. Their billing_student_bills rows were ALREADY
-- Rs 2,750 and PAID on 2026-09-16 (one receipt each, amount_paid 2750). Only the
-- tms_fee_bill mirror still said 5500 and no tms_fee_override existed. So this
-- migration does NOT touch the paid student bills: it writes the override (the
-- durable lever against cron job 23) and aligns tms_fee_bill.amount to 2750,
-- matching how the paid rows of the 09-09 cohort look.
--
-- REVERT. Delete the two override rows below and set tms_fee_bill.amount back to
-- 5500 for 35c3ba40-2c1d-46b9-b59c-81fb8e6c3d23 and
-- affe0567-98cc-4300-af0b-5895e4690fbd. Original rows:
-- tms_final_year_pharmacy_halffee_backup_20260917b.

create table if not exists tms_final_year_pharmacy_halffee_backup_20260917b as
select now() as backed_up_at, fb.id as fb_id, fb.billing_student_bill_id as sb_id, to_jsonb(fb) as fee_bill, to_jsonb(sb) as student_bill,
       (select jsonb_agg(to_jsonb(bi)) from billing_bill_instalments bi where bi.bill_id = sb.id) as instalments
from tms_fee_bill fb join billing_student_bills sb on sb.id = fb.billing_student_bill_id
where fb.id in ('35c3ba40-2c1d-46b9-b59c-81fb8e6c3d23', 'affe0567-98cc-4300-af0b-5895e4690fbd');

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
values
  ('6ec3d35d-8f33-492a-bfcf-fa0bc0e82fa7', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true, 2750,
   'FINAL-YEAR BATCH CLOSURE - BPHARM 2022-2026 batch closes 2026-10-31, half of transport year 2026-2027, annual transport fee reduced 50% to Rs 2750 (KISHORE NAGARAJ, PB22042) - 2026-09-17'),
  ('b10fa9b4-76aa-43c8-915a-f6dfb8f38978', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true, 2750,
   'FINAL-YEAR BATCH CLOSURE - BPHARM 2022-2026 batch closes 2026-10-31, half of transport year 2026-2027, annual transport fee reduced 50% to Rs 2750 (MUQSITH AHMED S, PB22057) - 2026-09-17')
on conflict (person_id, transport_year_id, term_no) do nothing;

update tms_fee_bill fb
set amount = 2750
where fb.id in ('35c3ba40-2c1d-46b9-b59c-81fb8e6c3d23', 'affe0567-98cc-4300-af0b-5895e4690fbd')
  and fb.amount = 5500
  and exists (select 1 from billing_student_bills sb
              where sb.id = fb.billing_student_bill_id and sb.final_amount = 2750);
