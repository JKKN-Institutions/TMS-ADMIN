-- Reversal: enrollment is admin-only DIRECT ALLOCATION (no student self-service,
-- no request queue). The learner's allocation lives on learners_profiles
-- (transport_route_id / transport_stop_id), set directly by an admin. Drop the
-- short-lived request table (was empty — never used in production).
drop table if exists public.tms_enrollment_request cascade;
