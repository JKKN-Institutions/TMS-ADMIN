-- GOKULAPRIYA M (gokulapriyamcse2022@jkkn.ac.in, staff c143596f-1eee-4929-bae2-b1cf5bb9a7a6,
-- LAB INSTRUCTOR, full_time, joined 2026-07-23) was bounced to
-- /unauthorized?reason=no_tms_access -- reported as "transport access restricted".
-- Applied to the live DB on 2026-09-08 as version 20260908062600.
--
-- CAUSE. public.tms_staff_boarding_eligibility requires
--   coalesce(bus_required,false) = true AND coalesce(is_active,false) = true
-- Her row had bus_required = false, so eligibility returned false. She also holds
-- none of the four area permissions, so proxy.ts denied the area gate, found no
-- 'tms.attendance.scan' and no eligibility, and redirected her to /unauthorized.
--
-- Ruled out first, in the order project_boarding_eligibility_grant_revoked prescribes:
--   (1) EXECUTE grant on tms_staff_boarding_eligibility(uuid) to `authenticated`
--       is PRESENT (proacl {postgres=X,service_role=X,authenticated=X}) -- not the
--       2026-07-31 stripped-grant recurrence.
--   (2) profiles.id == auth.users.id == 1e68f71d-8a47-4b80-bfa9-43ff4d119a20, and
--       staff.profile_id points at it -- the identity contract holds.
--   (3) staff.status = 'draft' is NOT the blocker. Measured live: all 42 active
--       staff with status='draft' AND bus_required=true evaluate eligible, as do
--       all 115 'published' ones. Only bus_required gates this.
--
-- WHY A MIGRATION AND NOT A UI ACTION. `staff` is the MyJKKN-owned directory.
-- TMS-ADMIN writes to it in exactly ONE place -- role_key:'driver' in
-- app/api/admin/drivers/route.ts:85 -- and reads it everywhere else behind
-- .eq('bus_required', true). There is no screen in this app that can set this
-- field, so the correction is recorded here to stay auditable.
--
-- ROUTE AND STOP. Set alongside the flag, not left null: all 157 active
-- bus_required staff have a transport_route_id and 156 have a transport_stop_id,
-- so a flag-only fix would make her the sole staff member absent from every
-- route roster while still holding access. The values are her OWN travel history
-- from learners_profiles c5beafe4 (roll ES22008, now graduated) -- route 11
-- ANTHIYUR, stop PARUVACHI -- verified active, and the stop verified to belong to
-- that route.
--
-- Guarded and idempotent: the WHERE clause re-checks the pre-state, so a re-run
-- after MyJKKN has changed her route is a no-op rather than an overwrite.
--
-- VERIFIED after applying: tms_staff_boarding_eligibility returns
-- {eligible: true, has_route: true, route_id: 51a8eff2..., assigned_route_count: 0}.
-- With assigned_route_count = 0 proxy.ts sends her to /boarding/in-charge, and the
-- boarding area gate then admits her via the same eligibility RPC.
--
-- Revert: update staff set bus_required = false, transport_route_id = null,
-- transport_stop_id = null where id = 'c143596f-1eee-4929-bae2-b1cf5bb9a7a6';

update staff s
set bus_required       = true,
    transport_route_id = '51a8eff2-de8b-4097-ae91-aec0064034a3',
    transport_stop_id  = 'f2672f5f-1a86-4978-8e79-7daea980f43c',
    updated_at         = now()
where s.id = 'c143596f-1eee-4929-bae2-b1cf5bb9a7a6'
  and coalesce(s.bus_required, false) = false
  and s.transport_route_id is null
  and s.transport_stop_id is null
  and coalesce(s.is_active, false) = true
  and exists (select 1 from tms_route r
              where r.id = '51a8eff2-de8b-4097-ae91-aec0064034a3' and r.status = 'active')
  and exists (select 1 from tms_route_stop st
              where st.id = 'f2672f5f-1a86-4978-8e79-7daea980f43c'
                and st.route_id = '51a8eff2-de8b-4097-ae91-aec0064034a3');
