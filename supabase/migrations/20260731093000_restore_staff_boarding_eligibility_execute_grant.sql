-- Restore the EXECUTE grant that the boarding-eligibility oracle needs, and
-- self-scope the function so handing it to `authenticated` leaks nothing.
--
-- SYMPTOM
-- `bus_required` staff who hold no TMS area permission were bounced at login with
-- "You do not have access to the Transport Management System. Please contact your
-- administrator." (app/auth/login/page.tsx, ?error=no_tms_access). Confirmed live
-- for sathish_somasundram@jkkn.ac.in on 2026-07-31; 31 of 131 active bus_required
-- staff were in the same position.
--
-- ROOT CAUSE
-- public.tms_staff_boarding_eligibility(uuid) is SECURITY DEFINER and is called with
-- the USER-SCOPED (`authenticated`) client from app/auth/callback/route.ts and
-- proxy.ts. Its EXECUTE grant to `authenticated` -- issued by
-- 20260716140000_staff_eligibility_single_staff_scan.sql, which WAS applied -- was no
-- longer present in production:
--
--   proacl = {postgres=X/postgres,service_role=X/postgres}     <- no `authenticated`
--
-- so the call raised SQLSTATE 42501 (permission denied for function). Something in
-- this shared multi-app database revoked it after the fact. Every call site discards
-- the RPC `error` (lib/boarding/eligibility.ts is documented fail-closed), so the
-- denial was indistinguishable from a legitimate "not eligible" and produced no log.
--
-- FIX
-- 1. Re-issue the grant.
-- 2. Self-scope the lookup: a caller with a JWT (`authenticated`) may only ask about
--    THEMSELVES. Verified first that all four call sites already pass the caller's own
--    id -- app/auth/callback/route.ts, proxy.ts, app/api/boarding/access/route.ts and
--    app/api/boarding/self-assign/route.ts -- so this changes no legitimate behaviour.
--    service_role callers have no auth.uid() and keep the explicit-argument contract.
--    Without this, any logged-in user on any of the four portals could probe an
--    arbitrary profile id for bus-staff status and for `route_id`, which the helper
--    documents as "server-side use only -- never publish this to the browser".
--
-- Body is otherwise byte-identical to 20260716140000 (single `staff` scan).

CREATE OR REPLACE FUNCTION public.tms_staff_boarding_eligibility(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email    text;
  v_eligible boolean;
  v_count    int := 0;
  v_route_id uuid;
BEGIN
  -- Self-scope. auth.uid() is NULL for service_role (and for direct SQL), which keeps
  -- the explicit-argument contract for trusted server callers; it is non-NULL for any
  -- `authenticated` caller, who is then pinned to their own profile regardless of the
  -- argument they sent.
  IF auth.uid() IS NOT NULL AND p_profile_id IS DISTINCT FROM auth.uid() THEN
    p_profile_id := auth.uid();
  END IF;

  SELECT lower(email) INTO v_email FROM profiles WHERE id = p_profile_id LIMIT 1;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'assigned_route_count', 0,
                              'route_id', NULL, 'has_route', false);
  END IF;

  -- One scan of `staff`. Matches EITHER staff email column: staff.email is the
  -- PERSONAL address and frequently diverges from profiles.email, so matching only
  -- that column silently drops eligible people.
  SELECT true, s.transport_route_id
  INTO v_eligible, v_route_id
  FROM staff s
  WHERE coalesce(s.bus_required, false) = true
    AND coalesce(s.is_active, false) = true
    AND (lower(s.email) = v_email OR lower(s.institution_email) = v_email)
  LIMIT 1;

  SELECT count(*) INTO v_count
  FROM tms_staff_route_assignment a
  WHERE a.is_active = true AND lower(a.staff_email) = v_email;

  -- Only an ACTIVE route is usable; an inactive one collapses to NULL, which is
  -- the "unusable" signal.
  IF v_route_id IS NOT NULL THEN
    SELECT r.id INTO v_route_id FROM tms_route r
    WHERE r.id = v_route_id AND r.status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'eligible', coalesce(v_eligible, false),
    'assigned_route_count', v_count,
    'route_id', v_route_id,
    'has_route', (v_route_id IS NOT NULL)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tms_staff_boarding_eligibility(uuid)
  TO authenticated, service_role;

-- Self-verifying: this migration exists BECAUSE the grant silently went missing, so
-- it must not be able to report success without it.
DO $$
BEGIN
  IF NOT has_function_privilege(
       'authenticated', 'public.tms_staff_boarding_eligibility(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'tms_staff_boarding_eligibility(uuid): EXECUTE grant to `authenticated` did not take effect';
  END IF;
  IF NOT has_function_privilege(
       'service_role', 'public.tms_staff_boarding_eligibility(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'tms_staff_boarding_eligibility(uuid): EXECUTE grant to `service_role` did not take effect';
  END IF;
END $$;
