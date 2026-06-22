-- Dedicated role for boarding scanners. Granted (via user_roles) to a staff when
-- they're assigned a route in the staff-route-assignments module — NOT seeded onto
-- the broad 'staff' role. Carries only the attendance scan/manage keys.
insert into public.custom_roles (id, role_key, role_name, description, permissions, module_scopes, is_active, is_system_role)
select gen_random_uuid(),
       'transport_boarding',
       'Transport Boarding Staff',
       'Scans learner boarding passes and marks transport attendance for assigned routes.',
       jsonb_build_object('tms.attendance.scan', true, 'tms.attendance.manage', true),
       '{}'::jsonb,
       true,
       false
where not exists (select 1 from public.custom_roles where role_key = 'transport_boarding');
