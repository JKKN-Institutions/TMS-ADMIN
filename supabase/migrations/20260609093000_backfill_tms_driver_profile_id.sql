-- Deferred driver backfill (planned in 20260609090000): populate tms_driver.profile_id
-- from the authoritative chain tms_driver.staff_id -> staff.profile_id -> profiles.id.
-- tms_driver has no email; this is the canonical person link. TMS-owned table; additive.
UPDATE public.tms_driver d
SET profile_id = s.profile_id
FROM public.staff s
WHERE d.staff_id = s.id
  AND s.profile_id IS NOT NULL
  AND d.profile_id IS DISTINCT FROM s.profile_id;
