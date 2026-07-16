-- Fix: `tms_staff_boarding_eligibility` scanned `staff` TWICE with an identical
-- predicate (once for the `v_eligible` EXISTS check, once for the `v_route_id`
-- lookup). The whole point of resolving the route inside this RPC is a single
-- source of truth for the staff-match rule -- two copies of the same predicate
-- risk one being edited and the other left behind, silently letting `eligible`
-- and `has_route` disagree. It also costs two scans of `staff` per call on a
-- hot path: this RPC runs on every boarding-area request via proxy.ts and on
-- every login via the OAuth callback.
--
-- This migration collapses both lookups into ONE query against `staff`,
-- keeping the returned jsonb contract byte-identical to the prior version.
--
-- `eligible` deliberately does NOT require a route: proxy must still admit a
-- route-less staffer so they land on the denied screen INSIDE the boarding
-- portal, rather than being bounced to some other area's home.
--
-- Assumes at most one qualifying `staff` row per profile email (verified live
-- on 2026-07-16: no profile email currently matches more than one row with
-- bus_required=true AND is_active=true) -- the same assumption the prior
-- version already made via its `LIMIT 1` on the route lookup.

CREATE OR REPLACE FUNCTION public.tms_staff_boarding_eligibility(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email    text;
  v_eligible boolean;
  v_count    int := 0;
  v_route_id uuid;
BEGIN
  SELECT lower(email) INTO v_email FROM profiles WHERE id = p_profile_id LIMIT 1;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'assigned_route_count', 0,
                              'route_id', NULL, 'has_route', false);
  END IF;

  -- Single scan of `staff` covers both the eligibility check and the route
  -- lookup. The `staff` table is MyJKKN-owned and read-only for TMS -- this
  -- only ever reads it.
  --
  -- plpgsql's SELECT INTO assigns NULL to every target when no row matches, so
  -- a non-staff or ineligible profile leaves v_eligible NULL here, not false.
  -- The `coalesce(v_eligible, false)` below is what turns that NULL back into
  -- the documented literal `false` -- omitting it would leak `"eligible": null`
  -- to callers instead.
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

  -- Surface the route only if it still resolves to an ACTIVE route. SELECT
  -- INTO with no matching row sets the target back to NULL, which is exactly
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
$$;

GRANT EXECUTE ON FUNCTION public.tms_staff_boarding_eligibility(uuid)
  TO authenticated, service_role;
