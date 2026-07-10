-- Staff self-service boarding in-charge selection.
-- 1) provenance column on the assignment table; 2) eligibility oracle RPC.

-- Provenance: how the assignment was made. Existing rows are all admin-made.
ALTER TABLE tms_staff_route_assignment
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin'
    CHECK (source IN ('admin','self'));

-- Eligibility oracle: is this logged-in user an active bus_required staff member,
-- and how many active route assignments do they already have? SECURITY DEFINER so
-- it can read the RLS-protected `staff` table (a user-scoped client sees nothing) --
-- same reason proxy.ts calls tms_student_transport_access / user_has_permission.
CREATE OR REPLACE FUNCTION public.tms_staff_boarding_eligibility(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email    text;
  v_eligible boolean := false;
  v_count    int := 0;
BEGIN
  SELECT lower(email) INTO v_email FROM profiles WHERE id = p_profile_id LIMIT 1;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'assigned_route_count', 0);
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

  RETURN jsonb_build_object('eligible', v_eligible, 'assigned_route_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tms_staff_boarding_eligibility(uuid)
  TO authenticated, service_role;
