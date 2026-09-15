-- 7.5% scheme fix for the six remaining learners with a wrongly-raised Term 2.
-- Applied to the live DB on 2026-09-11 08:16 UTC; recorded here so it is auditable.
--
-- Each pays a flat Rs 500/year, satisfied entirely by Term 1 (all six Term 1 money
-- rows read 500 PAID with a receipt). None had any tms_fee_override, so the
-- every-2-minute generator raised a Rs 2,500 Term 2 for each. None had paid anything
-- against Term 2 (unpaid, no payment_date, no receipt, no payment transaction).
--
-- Keyed on learner_id, NOT roll number: roll EE25010 is shared by DIVYASRI B and an
-- unrelated learner (MOHAMMED ABBAS A, no bills).
--
-- Order matters: override PAIR first so the cron cannot re-raise the term in the gap,
-- then delete the MONEY row (billing_student_bills); the CASCADE removes tms_fee_bill.
-- Deleting tms_fee_bill directly always aborts with SQLSTATE 27000. The money-side
-- delete does NOT run the trigger's payment guards, so they are replicated inline.
--
-- REVERT. Full original rows (both ledgers, jsonb) are in
-- tms_75_scheme_term2_backup_20260911. Delete the term-2 billable=false overrides for
-- these six learners and the cron re-raises Term 2 on its next run.

create table if not exists tms_75_scheme_term2_backup_20260911 as
select now() backed_up_at, t.learner_id, t.nm, t.roll, fb.id fb_id, sb.id sb_id, to_jsonb(fb) fee_bill, to_jsonb(sb) student_bill
from (values
  ('9f4c88a0-dcb9-4a42-a0c3-4afb47d18a68'::uuid,'AKSHAYAA D','ES24002','8088d1be-8ef9-49e9-83f6-a7a152f3c980'::uuid),
  ('adda627f-a5f6-4616-9035-5560696787e7','DIVYASRI B','EE25010','f38b8bf9-e6cd-4363-b775-7021c7b12bf8'),
  ('01ef7a42-9c3d-4214-9b18-96070d19fd57','JAYABHARATH M','EM25017','60b0f6d9-f889-41c0-b79f-106f6a91ffcb'),
  ('8ba732a4-fb18-4d2f-a933-63dead7b5870','MANOSREE C','EI25023','143b8e6d-63f3-41a5-89d2-cec81c4b7bce'),
  ('5f15375d-a698-4233-9da0-a73579ec458e','MONISHA S','EM25034','d5b86cff-71af-4dd6-b582-476fc9f2e36e'),
  ('2a07c3e4-2e3e-4d7c-8f6f-506dc6395215','MOOVENTHAR K','EE23004','a29bee1e-8086-4391-9577-b1cca03bf619')
) t(learner_id, nm, roll, sb_id)
join billing_student_bills sb on sb.id = t.sb_id
join tms_fee_bill fb on fb.billing_student_bill_id = sb.id and fb.person_id = t.learner_id and fb.term_no = 2;

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
select b.learner_id, 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', x.term_no, x.billable, x.amount,
       case x.term_no when 1 then '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 ('
                      else '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (' end || b.nm || ', ' || b.roll || ') - 2026-09-11'
from tms_75_scheme_term2_backup_20260911 b
cross join (values (1, true, 500::numeric), (2, false, null::numeric)) x(term_no, billable, amount)
on conflict (person_id, transport_year_id, term_no) do update
  set billable = excluded.billable, amount = excluded.amount, reason = excluded.reason, updated_at = now();

delete from billing_student_bills sb
using tms_75_scheme_term2_backup_20260911 b
where sb.id = b.sb_id
  and sb.status = 'unpaid' and sb.payment_date is null
  and not exists (select 1 from billing_receipt_items r where r.bill_id = sb.id)
  and not exists (select 1 from payment_transaction_items t where t.bill_id = sb.id);
