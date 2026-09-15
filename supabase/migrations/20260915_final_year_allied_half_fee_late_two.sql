-- Final-year Allied Health Sciences half fee for TWO late-billed learners:
--   KANMANI S.S. (23RT05, BSC (RT))   learner 92a404c0-599a-4687-b671-8bb6e7823855
--   JANANI V     (23AECT04, BSC (AECT)) learner e7052db2-6cb0-48c9-95de-efbc00865af1
-- Applied to the live DB on 2026-09-15; recorded here so it is auditable.
--
-- Same rule as 20260910_final_year_allied_half_fee.sql: Allied's UGB23 batch
-- ("2023-2026") closes 2026-11-30, the first half of transport year 2026-2027, so
-- the annual Rs 5,500 transport fee is halved to Rs 2,750.
--
-- WHO. Keyed exactly as on 09-10 (admission year, not terminal_semester or batch_id,
-- which are unusable at Allied): institution 9c1554e8 (JKKN College of Allied Health
-- Sciences), admission_years.year = 2023, semester "3 Year", 4-year BSc program,
-- active, bus_required. All 15 learners repriced on 09-10 share that profile, and
-- both programs (RT, AECT) are already in that set.
--
-- WHY THEY WERE MISSED. Both profiles were edited on 2026-09-15 ~10:50 UTC and the
-- auto-generate cron billed them at 10:52 / 10:54 UTC -- five days after the 09-10
-- one-off froze its target set. The cohort sweep run before this change ("Allied +
-- admission 2023 + active + bus_required + bill in year 6b3768f9 + no override")
-- returned exactly these two and nobody else.
--
-- Each held one unpaid bill (single instalment, 5500) with no receipts and no payment
-- transactions. trg_bbi_rescale_on_amount_change rescales the instalment to 2750 and
-- update_bill_balance_on_amount_change recomputes balance_amount/status.
--
-- REVERT. Delete the two term-1 override rows whose reason ends '- 2026-09-15' for
-- these learners, then restore amounts from tms_final_year_allied_halffee_backup_20260915
-- (both ledgers + instalments as jsonb): billing_student_bills final/total/unit_amount
-- and tms_fee_bill amount back to 5500. The triggers restore balance and instalment.

begin;

create table if not exists tms_final_year_allied_halffee_backup_20260915 as
select now() backed_up_at, lp.id learner_id, lp.first_name, lp.last_name, lp.roll_number,
       fb.id fb_id, sb.id sb_id, to_jsonb(fb) fee_bill, to_jsonb(sb) student_bill,
       (select jsonb_agg(to_jsonb(i)) from billing_bill_instalments i where i.bill_id = sb.id) instalments
from tms_fee_bill fb
join billing_student_bills sb on sb.id = fb.billing_student_bill_id
join learners_profiles lp on lp.id = fb.person_id
where fb.id in ('024fb8d5-8c4a-4655-b60d-693acd18835e', '40b204ef-d175-4439-8975-69a7c7f91148');

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
select b.learner_id, 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true, 2750,
       'FINAL-YEAR BATCH CLOSURE - Allied UGB23 2023-2026 batch closes 2026-11-30, half of transport year 2026-2027, annual transport fee reduced 50% to Rs 2750 ('
       || coalesce(b.first_name,'') || coalesce(' ' || b.last_name,'') || ', ' || coalesce(b.roll_number,'') || ') - 2026-09-15'
from tms_final_year_allied_halffee_backup_20260915 b
on conflict (person_id, transport_year_id, term_no) do nothing;

do $$
declare n int;
begin
  select count(*) into n from tms_final_year_allied_halffee_backup_20260915;
  if n <> 2 then raise exception 'backup has % rows, expected 2 - aborting', n; end if;

  update billing_student_bills sb
     set final_amount = 2750, total_amount = 2750, unit_amount = 2750
    from tms_final_year_allied_halffee_backup_20260915 b
   where sb.id = b.sb_id
     and sb.status = 'unpaid' and sb.payment_date is null
     and sb.final_amount = 5500 and sb.balance_amount = sb.final_amount
     and not exists (select 1 from billing_receipt_items ri where ri.bill_id = sb.id)
     and not exists (select 1 from payment_transaction_items pti where pti.bill_id = sb.id);
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'money rows updated %, expected 2 - aborting', n; end if;

  update tms_fee_bill fb
     set amount = 2750
    from tms_final_year_allied_halffee_backup_20260915 b
   where fb.id = b.fb_id
     and fb.status = 'generated' and fb.paid_amount is null and fb.amount = 5500;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'ledger rows updated %, expected 2 - aborting', n; end if;
end $$;

commit;
