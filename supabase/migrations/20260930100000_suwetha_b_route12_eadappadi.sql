-- Move SUWETHA B (NOTJMO106, suwetha@jkkn.ac.in, staff 7c2d8b64-9fcd-40a0-b5e6-7cf191ab0464)
-- to route 12 EADAPPADI (KONGANAPURM), stop EADAPPADI, on admin request 2026-09-30.
-- Before: route 13 ATTAYAMPATTI (ARIYAANOUR), stop ATTAYAMPATTI.
--
-- APPLIED to production 2026-09-30 via execute_sql.
-- No billing side-effect: she has no non-cancelled bill.
-- Part 1 = travel route/stop. Part 2 below = in-charge duty move (same day).
-- Guarded on the old route/stop, so a re-run (or a later change) is a no-op.

insert into public.tms_activity_log
  (actor_role, module, action, entity_type, entity_id, entity_label, description, changes, metadata)
select 'system', 'passengers', 'update', 'staff', s.id::text,
       'SUWETHA B (NOTJMO106)',
       'Moved staff transport from route 13 ATTAYAMPATTI to route 12 EADAPPADI on admin request',
       jsonb_build_object(
         'before', jsonb_build_object('transport_route_id', s.transport_route_id, 'transport_stop_id', s.transport_stop_id),
         'after',  jsonb_build_object('transport_route_id', '6f02646f-2474-416f-bc7c-ce342c4e2309', 'transport_stop_id', '4528ed28-90fb-418c-b3b7-8aa09e88b912')),
       jsonb_build_object('manual', true)
from public.staff s
where s.id = '7c2d8b64-9fcd-40a0-b5e6-7cf191ab0464'
  and s.transport_route_id = 'a26d7017-7004-479e-95d7-63cde4e0a078'
  and s.transport_stop_id  = 'f2f595f3-6274-434c-ae6a-93817cb8dab1';

update public.staff
set transport_route_id = '6f02646f-2474-416f-bc7c-ce342c4e2309',
    transport_stop_id  = '4528ed28-90fb-418c-b3b7-8aa09e88b912',
    updated_at = now()
where id = '7c2d8b64-9fcd-40a0-b5e6-7cf191ab0464'
  and transport_route_id = 'a26d7017-7004-479e-95d7-63cde4e0a078'
  and transport_stop_id  = 'f2f595f3-6274-434c-ae6a-93817cb8dab1';

-- ── Part 2 (same day, on admin request): move her IN-CHARGE duty 13 -> 12 ────
-- APPLIED 2026-09-30 via execute_sql. Old self-picked assignment d7e83eeb-… ended;
-- new route 12 assignment 1f218a4d-… (source 'admin').
-- Rider shares then rebuilt for BOTH routes via the app's own
-- lib/boarding/allocation-repo.ts recomputeRouteAllocation (not SQL):
-- route 13 = 5 in-charges / 87 allocated / 0 unowned;
-- route 12 = 18 in-charges / 90 allocated / 0 unowned (she owns 5).
-- A re-run of this SQL alone is a no-op, but does NOT recompute shares.

insert into public.tms_activity_log
  (actor_role, module, action, entity_type, entity_id, entity_label, description, changes, metadata)
select 'system', 'staff-route-assignments', 'update', 'tms_staff_route_assignment', a.id::text,
       'SUWETHA B (NOTJMO106)',
       'Moved in-charge duty from route 13 to route 12 EADAPPADI on admin request (follows her travel move to EADAPPADI)',
       jsonb_build_object('before', to_jsonb(a)),
       jsonb_build_object('manual', true)
from public.tms_staff_route_assignment a
where a.id = 'd7e83eeb-b4db-4c37-a01e-1ae8f6a52311' and a.is_active;

update public.tms_staff_route_assignment set is_active = false
where id = 'd7e83eeb-b4db-4c37-a01e-1ae8f6a52311' and is_active;

insert into public.tms_staff_route_assignment (staff_email, route_id, assigned_by, notes, is_active, source)
select 'suwetha@jkkn.ac.in', '6f02646f-2474-416f-bc7c-ce342c4e2309', null,
       'Moved from route 13 on admin request 2026-09-30', true, 'admin'
where not exists (select 1 from public.tms_staff_route_assignment
                  where lower(staff_email)='suwetha@jkkn.ac.in' and route_id='6f02646f-2474-416f-bc7c-ce342c4e2309' and is_active);
