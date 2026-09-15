-- Zero transport fee for BOOBAL A (roll 87596328, student@jkkn.ac.in),
-- learner bc69b960-5912-45de-a971-390f86c8005a, transport year 2026-2027.
--
-- Symptom: /student/fees showed "Portal access restricted - your transport fee
-- for this year has not been generated yet". tms_student_transport_access
-- returned reason 'term1_not_billed', allowed=false.
--
-- Cause: both 2026-2027 terms were cancelled on 2026-09-03 05:45 UTC (ledger
-- and money rows alike). The access gate is fail-CLOSED on a paid Term 1 and
-- only counts a ledger row with status 'generated' whose money row is not
-- cancelled, so a cancelled Term 1 reads as never billed. The gate has no
-- exemption path: a zero-fee learner must hold a LIVE Term 1 settled at Rs 0.
--
-- Fix, mirroring the 7.5% scheme pattern (money row is the authority):
--   1. Back up the four rows this touches.
--   2. Write the override PAIR so the every-2-minute generator can never
--      re-raise a charge: term 1 billable at Rs 0, term 2 not billable.
--   3. Revive the Term 1 money row at Rs 0. update_bill_balance_on_amount_change
--      sees paid (0) >= final (0) and sets status 'paid', balance 0 itself.
--   4. Revive the Term 1 ledger row as 'generated' at Rs 0.
-- Term 2 stays cancelled: it owes nothing and the gate ignores it.
--
-- Trigger safety, checked against live prosrc on 2026-09-11:
--   fn_guard_bill_cancellation only blocks a transition INTO 'cancelled'.
--   billing_enforce_once_per_learner is off for the Transport Fee category.
--   evaluate_learner_status_after_payment is a no-op for lifecycle 'active'.
--   The bill has no instalments, so the rescale trigger has nothing to do.

begin;

create table if not exists tms_zero_fee_backup_20260911 (
  source_table text        not null,
  row_id       uuid        not null,
  row_data     jsonb       not null,
  backed_up_at timestamptz not null default now()
);

insert into tms_zero_fee_backup_20260911 (source_table, row_id, row_data)
select 'billing_student_bills', b.id, to_jsonb(b) from billing_student_bills b
 where b.id in ('26f4ddf3-d678-444c-a4f2-4f3e69fcf7ef', '3d6a9baf-67b9-4d87-838b-d7496b30385f')
union all
select 'tms_fee_bill', f.id, to_jsonb(f) from tms_fee_bill f
 where f.id in ('0c4e661d-deeb-4cb0-91ea-e63e61920e70', 'cda55d6b-c35a-453f-a81a-2b07b3b2e9b9');

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
values
  ('bc69b960-5912-45de-a971-390f86c8005a', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true, 0,
   'ZERO FEE - annual transport fee waived, Term 1 settled at Rs 0 (BOOBAL A, 87596328) - 2026-09-11'),
  ('bc69b960-5912-45de-a971-390f86c8005a', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 2, false, null,
   'ZERO FEE - no Term 2 charge for a waived learner (BOOBAL A, 87596328) - 2026-09-11')
on conflict (person_id, transport_year_id, term_no) do update
  set billable   = excluded.billable,
      amount     = excluded.amount,
      reason     = excluded.reason,
      updated_at = now();

update billing_student_bills
   set unit_amount  = 0,
       total_amount = 0,
       final_amount = 0,
       status       = 'unpaid',  -- the balance trigger rewrites this to 'paid'
       remarks      = 'Transport fee waived - zero fee learner (2026-09-11)'
 where id = '26f4ddf3-d678-444c-a4f2-4f3e69fcf7ef'
   and status = 'cancelled';

update tms_fee_bill
   set status = 'generated',
       amount = 0
 where id = '0c4e661d-deeb-4cb0-91ea-e63e61920e70'
   and status = 'cancelled';

commit;
