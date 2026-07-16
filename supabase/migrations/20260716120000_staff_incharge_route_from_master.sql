-- Staff bus in-charge: the route comes from the STAFF MASTER, not from the client.
--
-- Previously /api/boarding/self-assign took routeId from the request body and only
-- checked that the route was active -- never that it was the caller's own route, so
-- any eligible staffer could make themselves in-charge of any bus in the fleet.
-- Resolving the route here lets that parameter be deleted entirely.
--
-- ADDITIVE ONLY: `eligible` and `assigned_route_count` keep their exact meaning, so
-- proxy.ts / the OAuth callback / the boarding APIs all keep working mid-deploy.
--
-- `eligible` deliberately does NOT require a route: proxy must still admit a
-- route-less staffer so they land on the denied screen INSIDE the boarding portal,
-- rather than being bounced to some other area's home.

CREATE OR REPLACE FUNCTION public.tms_staff_boarding_eligibility(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email    text;
  v_eligible boolean := false;
  v_count    int := 0;
  v_route_id uuid;
BEGIN
  SELECT lower(email) INTO v_email FROM profiles WHERE id = p_profile_id LIMIT 1;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'assigned_route_count', 0,
                              'route_id', NULL, 'has_route', false);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM staff s
    WHERE coalesce(s.bus_required, false) = true
      AND coalesce(s.is_active, false) = true
      AND (lower(s.email) = v_email OR lower(s.institution_email) = v_email)
  ) INTO v_eligible;

  SELECT count(*) INTO v_count
  FROM tms_staff_route_assignment a
  WHERE a.is_active = true AND lower(a.staff_email) = v_email;

  -- The staffer's OWN route, allocated by an admin in the staff module. The `staff`
  -- table is MyJKKN-owned and read-only for TMS -- this only ever reads it.
  SELECT s.transport_route_id INTO v_route_id
  FROM staff s
  WHERE coalesce(s.bus_required, false) = true
    AND coalesce(s.is_active, false) = true
    AND (lower(s.email) = v_email OR lower(s.institution_email) = v_email)
  LIMIT 1;

  -- Surface it only if it still resolves to an ACTIVE route. SELECT INTO with no
  -- matching row sets the target to NULL, which is exactly the "unusable" signal.
  IF v_route_id IS NOT NULL THEN
    SELECT r.id INTO v_route_id FROM tms_route r
    WHERE r.id = v_route_id AND r.status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'assigned_route_count', v_count,
    'route_id', v_route_id,
    'has_route', (v_route_id IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tms_staff_boarding_eligibility(uuid)
  TO authenticated, service_role;
