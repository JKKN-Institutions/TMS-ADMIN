-- Owner decision 2026-10-14: delete cancelled staff transport bills so they
-- stop listing on MyJKKN's Transport Fees page (fn_list_transport_collectables
-- joins every staff tms_fee_bill row, cancelled included, showing Rs 0.00 / 1 bill).
--
-- 25 rows, Rs 3,53,800: 24 cancelled by the in-charge bill review on 2026-10-14
-- (September, auto mode) + KUMAR A (CAS004), cancelled earlier.
-- Checked before deleting: none has billing_student_bill_id, paid_at, a
-- tms_fee_fine or a tms_fee_payment_notice pointing at it.
--
-- RISK: the deleted row was what blocked re-billing (tms_fee_bill_idem_unique).
-- If one of these staff is later no longer an in-charge, a Staff structure
-- generation run could bill them again. The backup table keeps the history.
--
-- APPLIED to the live DB 2026-10-14.

begin;

create table if not exists tms_fee_bill_cancelled_staff_backup as
  select b.*, now() as backed_up_at
    from tms_fee_bill b
   where false;

alter table tms_fee_bill_cancelled_staff_backup enable row level security;

insert into tms_fee_bill_cancelled_staff_backup
  select b.*, now()
    from tms_fee_bill b
   where b.person_type = 'staff'
     and b.status = 'cancelled'
     and b.billing_student_bill_id is null
     and b.paid_at is null
     and not exists (select 1 from tms_fee_bill_cancelled_staff_backup k where k.id = b.id);

delete from tms_fee_bill b
 where b.person_type = 'staff'
   and b.status = 'cancelled'
   and b.billing_student_bill_id is null
   and b.paid_at is null
   and exists (select 1 from tms_fee_bill_cancelled_staff_backup k where k.id = b.id);

commit;
