-- UI improvement plan, data clean-up (2026-10-27, approved by the user). APPLIED to the live DB 2026-10-27.
-- Remove the test record "DRIVER TESTING" (driver@jkkn.ac.in) from TMS.
--
--   staff.id        b2a6f0b1-0b4b-43b9-a6a6-97b510080eb7
--   tms_driver.id   3b2950af-e2e2-495c-ab29-d6f13a52b2b6
--   last sign-in    2026-06-23 (unused since)
--
-- It was the driver on routes 23 (ELAMPILLAI (PALL PANNAI)) and 49
-- (JALAKANDAPURAM), which had no other driver: they now show "No driver"
-- until a real driver is assigned.
--
-- The staff row is MyJKKN-owned and referenced by ~100 tables, so it is NOT
-- deleted. Its role_key goes driver -> staff, the exact reverse of the role
-- flip TMS's own "Create Driver" makes; that takes it off the Drivers list.
-- Its login (profiles / auth) is untouched.
--
-- To undo: set role_key back to 'driver', re-create the tms_driver row via
-- Drivers -> Create Driver, and set tms_route.driver_id on routes 23 and 49.

begin;

update tms_route
   set driver_id = null, updated_at = now()
 where driver_id = 'b2a6f0b1-0b4b-43b9-a6a6-97b510080eb7';

delete from tms_driver
 where id = '3b2950af-e2e2-495c-ab29-d6f13a52b2b6';

update staff
   set role_key = 'staff', updated_at = now()
 where id = 'b2a6f0b1-0b4b-43b9-a6a6-97b510080eb7'
   and role_key = 'driver';

commit;
