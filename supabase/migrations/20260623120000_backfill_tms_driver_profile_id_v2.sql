-- Re-run the tms_driver.profile_id backfill for any rows still missing the link.
-- The driver self-service resolver (lib/driver/identity.ts) prefers the
-- tms_driver.profile_id == auth.userId path (falling back to the staff chain); this
-- keeps profile_id populated for drivers onboarded or profile-linked after the
-- original 20260609093000 backfill.
update tms_driver d
set profile_id = s.profile_id
from staff s
where d.staff_id = s.id
  and d.profile_id is null
  and s.profile_id is not null;
