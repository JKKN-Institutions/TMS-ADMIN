-- Re-derive learners_profiles.profile_id from the AUTHORITATIVE key profiles.learner_id
-- (a 1:1 FK → learners_profiles.id). The prior email-based backfill is unreliable for
-- the transport cohort, which barely carries email; profiles.learner_id is the canonical
-- person↔identity link and is what the runtime resolves on. Additive/idempotent.
UPDATE public.learners_profiles lp
SET profile_id = p.id
FROM public.profiles p
WHERE p.learner_id = lp.id
  AND lp.profile_id IS DISTINCT FROM p.id;
