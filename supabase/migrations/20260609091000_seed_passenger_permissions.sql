-- Seed Learner/Driver self-service TMS permissions onto the shared `student` and
-- `driver` roles. user_has_permission() falls back to profiles.role = role_key, so
-- updating ONE custom_roles row per role grants every holder (4,969 students, 35
-- drivers) — no per-user backfill. Additive `||` merge of tms.* keys only; MyJKKN
-- never checks tms.* keys. Reversible by removing the keys.
--
-- Pass-based + admin-recorded v1: NO tms.bookings.create / tms.schedules.view
-- (no per-trip booking); payment is `.view` (admin records the payment).

UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'tms.passenger.self.view', true,
  'tms.passenger.payment.view', true,
  'tms.passenger.enrollment.request', true,
  'tms.grievances.submit', true,
  'tms.tracking.view', true
)
WHERE role_key = 'student';

UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'tms.driver.self.view', true,
  'tms.tracking.view', true
)
WHERE role_key = 'driver';
