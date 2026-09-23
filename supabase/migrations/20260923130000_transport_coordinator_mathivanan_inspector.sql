-- Transport Coordinator role + Mathivanan as route-wise Bus Inspection inspector (user request 2026-09-23).
-- The role grants NO permissions: Bus Inspection access comes from the route
-- assignments (tms_route_checker_route_ids matches the confirmed login email).
-- It is an EXTRA role via user_roles; profiles.role ('accounts', shared with
-- MyJKKN) is deliberately left unchanged. Idempotent.

insert into public.custom_roles (role_key, role_name, description, permissions, is_system_role, is_privileged)
select 'transport_coordinator', 'Transport Coordinator',
       'Inspects the buses (routes) assigned to them in Bus Inspection. Access comes from the route assignment; the role itself grants no permissions.',
       '{}'::jsonb, false, false
where not exists (select 1 from public.custom_roles where role_key = 'transport_coordinator');

insert into public.user_roles (user_id, role_id, is_primary)
select '4dc4e3a2-8735-479f-b506-f60a0aa4e8da'::uuid, cr.id, false
from public.custom_roles cr
where cr.role_key = 'transport_coordinator'
  and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = '4dc4e3a2-8735-479f-b506-f60a0aa4e8da'::uuid and ur.role_id = cr.id);

insert into public.tms_route_checker_assignment (checker_email, route_id, is_active, notes)
select 'mathivanan_m@jkkn.ac.in', r.id, true, 'Transport Coordinator — all routes (2026-09-23)'
from public.tms_route r
where r.status = 'active'
  and not exists (
    select 1 from public.tms_route_checker_assignment a
    where a.checker_email = 'mathivanan_m@jkkn.ac.in' and a.route_id = r.id and a.is_active);
