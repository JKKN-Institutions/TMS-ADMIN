-- Link transport records to Supabase auth identities (profiles.id == auth.users.id).
-- Additive + idempotent: new nullable columns, indexes, and a role-scoped learner
-- backfill. No existing column or row is altered. Reversible via DROP COLUMN.
--
-- Driver backfill is intentionally DEFERRED to the driver-shell phase: tms_driver
-- has no email column (it links via staff_id -> staff -> profiles); the column is
-- added here and backfilled later through the staff join.

ALTER TABLE public.tms_driver
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_tms_driver_profile_id ON public.tms_driver(profile_id);

ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_profile_id ON public.learners_profiles(profile_id);

-- Backfill learners by institutional email (college_email preferred, then student_email),
-- restricted to student-role profiles to avoid cross-role mismatches.
UPDATE public.learners_profiles lp
SET profile_id = p.id
FROM public.profiles p
WHERE lp.profile_id IS NULL
  AND p.role = 'student'
  AND lower(p.email) IN (lower(lp.college_email), lower(lp.student_email));
