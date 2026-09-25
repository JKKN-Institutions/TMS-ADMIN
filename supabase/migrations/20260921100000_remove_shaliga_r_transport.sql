-- Remove SHALIGA R (JKKN-COP-1410, M.Pharm Pharmaceutical Analysis, 2026-27) from
-- transport and delete her unpaid Rs 5,500 Transport Maintenance Fee Term 1 bill.
--
-- Applied to production 2026-09-21 on admin request. Scope was transport only: the
-- learner record, her paid Rs 11,000 (RCP-2026-002490) and her tuition bill stay.
-- Her graduated B.Pharm record (JKKN-COP-822) is untouched.
--
-- Order matters:
--   1. snapshot the bill into tms_activity_log;
--   2. write billable=false overrides for BOTH terms first, so cron job 23
--      (every 2 min) cannot re-raise the bill in the gap;
--   3. delete the money row (cascades to tms_fee_bill); tms_fee_bill cannot be
--      deleted directly (27000), and a delete from this side skips its payment
--      guard, so the four guards are repeated here;
--   4. clear bus_required / route / stop so she leaves the roster and the
--      auto-absent job stops marking her.
-- Attendance history (7 present, 6 absent) is kept.
-- Idempotent: the guards make a re-run a no-op.

insert into public.tms_activity_log
  (actor_role, module, action, entity_type, entity_id, entity_label, description, changes, metadata)
select 'system', 'fees', 'delete', 'billing_student_bills', b.id::text,
       'SHALIGA R (JKKN-COP-1410)',
       'Deleted unpaid Transport Maintenance Fee 2026-2027 Term 1 (Rs 5,500) and removed learner from transport (route METTUR NO 5, stop NERINJIPETTAI) on admin request',
       jsonb_build_object('before', jsonb_build_object(
         'billing_student_bill', to_jsonb(b),
         'tms_fee_bill', (select to_jsonb(f) from public.tms_fee_bill f where f.billing_student_bill_id = b.id),
         'learner_transport', (select jsonb_build_object('bus_required', l.bus_required,
                                 'transport_route_id', l.transport_route_id,
                                 'transport_stop_id', l.transport_stop_id)
                               from public.learners_profiles l where l.id = b.student_id))),
       jsonb_build_object('learner_id', b.student_id, 'manual', true)
from public.billing_student_bills b
where b.id = '23c95250-1dca-4721-8ce2-5c0286524352';

insert into public.tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
select '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', t, false, null,
       'REMOVED FROM TRANSPORT - admin request - (SHALIGA R, JKKN-COP-1410) - 2026-09-21'
from unnest(array[1, 2]) t
where not exists (
  select 1 from public.tms_fee_override o
  where o.person_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac'
    and o.transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
    and o.term_no = t);

delete from public.billing_student_bills b
where b.id = '23c95250-1dca-4721-8ce2-5c0286524352'
  and b.status = 'unpaid'
  and b.payment_date is null
  and b.balance_amount = b.final_amount
  and not exists (select 1 from public.billing_receipt_items where bill_id = b.id)
  and not exists (select 1 from public.payment_transaction_items where bill_id = b.id);

update public.learners_profiles
set bus_required = false, transport_route_id = null, transport_stop_id = null, updated_at = now()
where id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac';
