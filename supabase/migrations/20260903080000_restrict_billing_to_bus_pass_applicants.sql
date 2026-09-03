-- Bill ONLY learners who applied through MyJKKN's Bus Pass Request.
--
-- Until now applicability keyed purely on learners_profiles.bus_required, which
-- BOTH doors write: the Bus Pass service request AND the admission form. That
-- billed 267 learners who never actually applied for transport. Policy is now
-- "only the bus pass service request learners", so the service request itself
-- becomes the authority.
--
-- Exposed as a view rather than inlined in TypeScript for two reasons:
--   1. The requester -> learner match needs THREE identity paths (profile_id,
--      college_email, student_email) because 2096 of 7384 learners_profiles
--      rows have a NULL profile_id. That join does not survive PostgREST.
--   2. Shipping the id set to the app would mean a ~1600-UUID .in() filter,
--      which this gateway 400s on.
--
-- PERFORMANCE: the obvious shape -- one EXISTS with an OR across the three
-- identity columns -- plans as a nested loop and measured 4,929 ms. Written as
-- a UNION of three equality joins the planner can index each branch: 54 ms for
-- the same 1,567 rows. Keep the UNION. This view is read every 2 minutes by
-- the cron and again on every nudge, so that difference is not academic.

create or replace view public.tms_bus_pass_applicant
with (security_invoker = true) as
with applicants as (
  select p.id as profile_id, lower(p.email) as email
  from public.service_requests s
  join public.profiles p on p.id = s.requester_id
  -- Bus Pass Request. Matched by id: names get edited, and a rename here would
  -- fail CLOSED (nobody billed) with no error to notice.
  where s.service_type_id = '576e0f82-50e6-423f-88b0-48e76ba1760b'
    and s.status in ('fulfilled', 'closed')
)
select lp.id as learner_id
  from public.learners_profiles lp join applicants a on lp.profile_id = a.profile_id
union
select lp.id
  from public.learners_profiles lp join applicants a
    on lower(nullif(lp.college_email, '')) = a.email
union
select lp.id
  from public.learners_profiles lp join applicants a
    on lower(nullif(lp.student_email, '')) = a.email;

comment on view public.tms_bus_pass_applicant is
  'Learners who applied for transport via MyJKKN''s Bus Pass Request. Three identity paths because profile_id is NULL on ~28% of learners_profiles rows.';

-- Drop-in replacement for the learners_profiles query in
-- lib/fees/applicability.ts: same column names, same filter columns, so the
-- only code change is the table name.
create or replace view public.tms_billable_learner
with (security_invoker = true) as
select lp.id,
       lp.institution_id,
       lp.admission_year_id,
       lp.academic_year_id,
       lp.lifecycle_status,
       lp.bus_required
  from public.learners_profiles lp
 where lp.bus_required is true
   and exists (select 1 from public.tms_bus_pass_applicant a where a.learner_id = lp.id);

comment on view public.tms_billable_learner is
  'The transport billing cohort: bus_required AND a bus pass service request. Read by lib/fees/applicability.ts. Revert to querying learners_profiles directly to go back to billing both onboarding doors.';

grant select on public.tms_bus_pass_applicant to service_role;
grant select on public.tms_billable_learner  to service_role;
