-- Move ARUN M S (COP008, arun.ms@jkkn.ac.in, staff f6ef8fca-26c2-48ed-a4e3-58f9fe2cc258)
-- to route 06 GURUVUREDIYUR, stop MUNIYANUR PIRIVU, on admin request 2026-09-25.
-- Before: route 11, stop ANTHIYUR BUS STAND.
--
-- APPLIED to production 2026-09-25 via execute_sql.
-- No billing side-effect: he has no staff bill, and the staff fee structure has
-- auto_generate = false, so cron job 23 raises nothing.
-- Part 1 = travel route/stop. Part 2 below = in-charge duty move.
-- Guarded on the old route/stop, so a re-run (or a later change) is a no-op.

insert into public.tms_activity_log
  (actor_role, module, action, entity_type, entity_id, entity_label, description, changes, metadata)
select 'system', 'passengers', 'update', 'staff', s.id::text,
       'ARUN M S (COP008)',
       'Moved staff transport from route 11 ANTHIYUR BUS STAND to route 06 MUNIYANUR PIRIVU on admin request',
       jsonb_build_object(
         'before', jsonb_build_object('transport_route_id', s.transport_route_id, 'transport_stop_id', s.transport_stop_id),
         'after',  jsonb_build_object('transport_route_id', '1cfec589-795d-4923-b373-b0d82c87c286', 'transport_stop_id', '67d82ef1-9a6d-4ee1-bae0-158797bacb9e')),
       jsonb_build_object('manual', true)
from public.staff s
where s.id = 'f6ef8fca-26c2-48ed-a4e3-58f9fe2cc258'
  and s.transport_route_id = '51a8eff2-de8b-4097-ae91-aec0064034a3'
  and s.transport_stop_id  = '180d6989-d2e1-4034-866f-b4f0f95931a9';

update public.staff
set transport_route_id = '1cfec589-795d-4923-b373-b0d82c87c286',
    transport_stop_id  = '67d82ef1-9a6d-4ee1-bae0-158797bacb9e',
    updated_at = now()
where id = 'f6ef8fca-26c2-48ed-a4e3-58f9fe2cc258'
  and transport_route_id = '51a8eff2-de8b-4097-ae91-aec0064034a3'
  and transport_stop_id  = '180d6989-d2e1-4034-866f-b4f0f95931a9';

-- ── Part 2 (same day, on admin request): move his IN-CHARGE duty 11 -> 06 ────
-- APPLIED 2026-09-25 via execute_sql. Old assignment a0b51b01-… ended; new
-- route 06 assignment 5845fb0e-… (source 'admin').
-- The rider shares were then rebuilt for BOTH routes by running the app's own
-- lib/boarding/allocation-repo.ts recomputeRouteAllocation (not SQL — the split
-- lives in lib/boarding/share-split.ts): route 11 = 4 in-charges / 65 allocated /
-- 0 unowned; route 06 = 6 in-charges / 63 allocated / 0 unowned (this also
-- repaired a stale route 06 split — malathim@ had owned 0 since 2026-08-28).
-- A re-run of this SQL alone is a no-op, but does NOT recompute shares.

insert into public.tms_activity_log
  (actor_role, module, action, entity_type, entity_id, entity_label, description, changes, metadata)
select 'system', 'staff-route-assignments', 'update', 'tms_staff_route_assignment', a.id::text,
       'ARUN M S (COP008)',
       'Moved in-charge duty from route 11 to route 06 GURUVUREDIYUR on admin request (follows his travel move to MUNIYANUR PIRIVU)',
       jsonb_build_object('before', to_jsonb(a)),
       jsonb_build_object('manual', true)
from public.tms_staff_route_assignment a
where a.id = 'a0b51b01-adb7-4b30-b05a-9cbada115c62' and a.is_active;

update public.tms_staff_route_assignment set is_active = false
where id = 'a0b51b01-adb7-4b30-b05a-9cbada115c62' and is_active;

insert into public.tms_staff_route_assignment (staff_email, route_id, assigned_by, notes, is_active, source)
select 'arun.ms@jkkn.ac.in', '1cfec589-795d-4923-b373-b0d82c87c286', null,
       'Moved from route 11 on admin request 2026-09-25', true, 'admin'
where not exists (select 1 from public.tms_staff_route_assignment
                  where lower(staff_email)='arun.ms@jkkn.ac.in' and route_id='1cfec589-795d-4923-b373-b0d82c87c286' and is_active);
