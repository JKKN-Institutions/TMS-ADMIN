-- Delete every remaining transport (tms_*) record for SHALIGA R (JKKN-COP-1410),
-- on admin request 2026-09-21. Follows 20260921100000 (bill deleted, bus cleared).
--
-- Removes: 13 tms_attendance rows, 1 tms_booking, 1 tms_incharge_roster_allocation
-- (in-charge akalya@jkkn.ac.in, route METTUR NO 5) and the 2 billable=false
-- tms_fee_override rows written by 20260921100000.
-- The overrides go too: the generator only bills bus_required = true
-- (lib/fees/applicability.ts), which is now false, and leaving them would make a
-- future genuine Bus Pass Request ride free.
-- learners_profiles (MyJKKN-owned) and her paid / tuition bills are NOT touched.
-- A snapshot of every deleted row is kept in tms_activity_log.
-- Idempotent: a re-run logs an empty snapshot and deletes nothing.

insert into public.tms_activity_log
  (actor_role, module, action, entity_type, entity_id, entity_label, description, changes, metadata)
values ('system', 'passengers', 'delete', 'learners_profiles', '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac',
  'SHALIGA R (JKKN-COP-1410)',
  'Deleted all transport records (attendance, booking, in-charge roster allocation, fee overrides) on admin request',
  jsonb_build_object('before', jsonb_build_object(
    'tms_attendance', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.tms_attendance a where a.learner_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac'),
    'tms_booking', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.tms_booking b where b.learner_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac'),
    'tms_incharge_roster_allocation', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.tms_incharge_roster_allocation r where r.learner_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac'),
    'tms_fee_override', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from public.tms_fee_override o where o.person_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac'))),
  jsonb_build_object('manual', true));

delete from public.tms_attendance where learner_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac';
delete from public.tms_booking where learner_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac';
delete from public.tms_incharge_roster_allocation where learner_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac';
delete from public.tms_fee_override where person_id = '64e5454c-7ecc-4f9e-b7be-234ecd3e5cac';
