-- ALREADY APPLIED to production 2026-09-28 (via execute_sql); recorded here.
-- Admin request: learners who have PAID their Transport Maintenance Fee must not
-- carry a Transport Fee. Removed 12 unpaid Transport Fee bills (Rs 2,10,350):
-- 25MRS03, AUG24CA52, AUG25CS18, AUG26BC04, EE25052, EI23007, EI23021, EM25008,
-- PB23068, PB24077, PB25003, PB25042.
-- NOT removed: AUG25FD09 (KEERTHI M) - Rs 500 of her Rs 9,600 Transport Fee is
-- already paid against a receipt; deleting would erase a real payment.
-- Method: delete the money row (tms_fee_fine cascades). Guards: bill unpaid,
-- no receipt, no payment attempt, every maintenance bill of the year paid.
-- AUG26BC04's 48h notice pointed at its fine (FK) -> set status 'paid', fine_id null.
-- Backup: tms_transport_fee_removed_backup (fine, bill, notice jsonb); one
-- tms_activity_log row per fee (module fees, action delete).

create table if not exists public.tms_transport_fee_removed_backup (
  id bigserial primary key, fine jsonb not null, bill jsonb, notice jsonb, removed_reason text,
  removed_at timestamptz not null default now());
alter table public.tms_transport_fee_removed_backup enable row level security;

create temp table tgt on commit drop as
  select f.*, lp.roll_number, coalesce(lp.first_name,'')||' '||coalesce(lp.last_name,'') nm
  from tms_fee_fine f
  join learners_profiles lp on lp.id=f.person_id
  join billing_student_bills sb on sb.id=f.billing_student_bill_id
  where f.status='generated' and f.person_type='learner'
    and lp.roll_number in ('EM25008','EI23021','AUG24CA52','PB24077','PB23068','PB25003','PB25042','EI23007','AUG25CS18','25MRS03','EE25052','AUG26BC04')
    and sb.status='unpaid' and sb.balance_amount=sb.final_amount and sb.payment_date is null
    and not exists (select 1 from billing_receipt_items ri where ri.bill_id=sb.id)
    and not exists (select 1 from payment_transaction_items pti where pti.bill_id=sb.id)
    and exists (select 1 from tms_fee_bill fb join billing_student_bills m on m.id=fb.billing_student_bill_id
                where fb.person_id=f.person_id and fb.transport_year_id=f.transport_year_id and fb.status='generated' and m.status='paid')
    and not exists (select 1 from tms_fee_bill fb join billing_student_bills m on m.id=fb.billing_student_bill_id
                where fb.person_id=f.person_id and fb.transport_year_id=f.transport_year_id and fb.status='generated' and m.status not in ('paid','cancelled'));

insert into tms_transport_fee_removed_backup (fine, bill, notice, removed_reason)
select to_jsonb(t) - 'roll_number' - 'nm',
       (select to_jsonb(sb) from billing_student_bills sb where sb.id=t.billing_student_bill_id),
       (select to_jsonb(n) from tms_fee_payment_notice n where n.fine_id=t.id),
       'Transport Maintenance Fee already paid - Transport Fee removed on admin request 2026-09-28'
from tgt t;

insert into tms_activity_log (module, action, entity_type, entity_id, entity_label, description, metadata, actor_role)
select 'fees','delete','tms_fee_fine', t.id::text, t.roll_number||' '||t.nm,
  'Removed Transport Fee Rs '||t.fine_amount||' - learner already paid the Transport Maintenance Fee',
  jsonb_build_object('fine', to_jsonb(t) - 'roll_number' - 'nm', 'billing_student_bill_id', t.billing_student_bill_id, 'requested', 'admin via Claude Code 2026-09-28'),
  'system'
from tgt t;

update tms_fee_payment_notice set status='paid', fine_id=null, updated_at=now() where fine_id in (select id from tgt);

delete from billing_student_bills where id in (select billing_student_bill_id from tgt);
