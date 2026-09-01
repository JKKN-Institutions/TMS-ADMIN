-- Repair one half-created bus in-charge.
--
-- SYMPTOM
-- sampooranam.m@jkkn.ac.in signs in and lands on /unauthorized with
-- reason=no_tms_access ("no transport access"), despite holding an active
-- in-charge assignment on route 12 since 2026-08-19.
--
-- CAUSE
-- A working in-charge needs TWO writes, and they only have the first:
--   1. tms_staff_route_assignment  -- present, is_active, source='self'
--   2. the 'transport_boarding' role in user_roles -- MISSING
-- The role is what carries "tms.attendance.scan": true. Without it proxy.ts
-- denies the boarding area, and then BOTH fallback branches miss them:
--   - "can they scan?" -> no (that is the missing role)
--   - "eligible with ZERO assignments?" -> no, they have one
-- so the in-charge redirect never fires and they fall through to
-- /unauthorized?reason=no_tms_access. The active assignment is precisely what
-- disqualifies them from the rescue branch -- this half-created state lands in
-- the gap between both escape routes.
--
-- Everything usually blamed for no_tms_access was checked and is HEALTHY here:
--   - auth.users.id == profiles.id (no identity break)
--   - has_function_privilege(authenticated, tms_staff_boarding_eligibility) = true
--     (not the 42501 revoked-GRANT cause)
--   - staff.transport_route_id resolves to an active route
--   - profiles.email, staff.email and staff_email all agree exactly
-- Their only role is 'hod'.
--
-- WHY IT WENT UNNOTICED
-- grantBoardingRole() (lib/boarding/roles.ts) is best-effort by design -- it
-- swallows every error inside a try/catch and only console.errors, so that a
-- role write can never roll back an assignment. Sound choice, but it means a
-- failed grant leaves no trace: the admin list shows the staffer assigned while
-- they cannot get in. They self-assigned three times (2026-07-24, 2026-08-17,
-- 2026-08-19); the 08-19 grant is the one that did not take, and the original
-- error is not recoverable from the data.
--
-- SCOPE
-- Swept all 138 staff holding an active assignment: this is the ONLY one
-- missing the role. Isolated, not systemic -- so this repairs the row rather
-- than changing the grant path.
--
-- This grants nothing the self-assign route would not have granted itself. It
-- does NOT touch the fee ledger: their 2026-08-14 bill of Rs 10,450 stands at
-- 'staff_deferred' and is decided by the 31 August attendance rule, exactly as
-- for the seven staff in 20260828110000.
--
-- Written as a general repair (any active-assignment holder missing the role)
-- rather than a hardcoded id, so re-running is a no-op and a future recurrence
-- is caught by the same statement.

do $$
declare
  v_role uuid;
  v_fixed int;
begin
  select id into v_role from public.custom_roles where role_key = 'transport_boarding';
  if v_role is null then
    raise exception 'custom_roles.transport_boarding is missing';
  end if;

  with needs_role as (
    select distinct p.id as profile_id
    from public.tms_staff_route_assignment a
    join public.profiles p on lower(p.email) = lower(a.staff_email)
    where a.is_active
      and not exists (
        select 1 from public.user_roles ur
        where ur.user_id = p.id and ur.role_id = v_role
      )
  )
  insert into public.user_roles (user_id, role_id, is_primary, assigned_by)
  select profile_id, v_role, false, null from needs_role;

  get diagnostics v_fixed = row_count;
  raise notice 'granted transport_boarding to % half-created in-charge(s)', v_fixed;
end $$;

-- Verify (expect zero rows):
--   select lower(a.staff_email)
--     from tms_staff_route_assignment a
--     join profiles p on lower(p.email) = lower(a.staff_email)
--    where a.is_active
--      and not exists (
--        select 1 from user_roles ur join custom_roles cr on cr.id = ur.role_id
--         where ur.user_id = p.id and cr.role_key = 'transport_boarding');
--
-- ROLLBACK: delete the user_roles row for that profile + the transport_boarding
-- role id. Only do so if the staffer should not be an in-charge at all -- in
-- which case deactivate their assignment too, or this migration re-grants it.
--
-- FOLLOW-UP WORTH CONSIDERING (not done here, it is a code change not a repair):
-- an admin-side check that flags assignments whose role grant did not land, so
-- the next silent failure surfaces in the UI instead of as a locked-out staffer.
