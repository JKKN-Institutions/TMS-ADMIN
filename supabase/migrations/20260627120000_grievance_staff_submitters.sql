-- Let driver & boarding staff raise their OWN transport grievances, mirroring the
-- learner self-service flow. tms_grievance was learner-only (learner_id NOT NULL ->
-- learners_profiles); staff aren't learners, so we add a polymorphic submitter:
--   submitter_profile_id (the auth user who raised it) + submitter_type.
-- Existing learner grievances are unaffected (learner_id keeps working).

-- 1. tms_grievance: make learner_id optional + add the submitter identity.
alter table public.tms_grievance alter column learner_id drop not null;

alter table public.tms_grievance
  add column if not exists submitter_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists submitter_type text not null default 'learner'
    check (submitter_type in ('learner', 'driver', 'boarding'));

-- Backfill the submitter for existing learner grievances (their auth profile id).
update public.tms_grievance g
set submitter_profile_id = lp.profile_id
from public.learners_profiles lp
where lp.id = g.learner_id and g.submitter_profile_id is null;

-- Integrity: a learner grievance keeps learner_id; a staff grievance carries a submitter.
alter table public.tms_grievance
  drop constraint if exists tms_grievance_submitter_present;
alter table public.tms_grievance
  add constraint tms_grievance_submitter_present check (
    (submitter_type = 'learner' and learner_id is not null)
    or (submitter_type in ('driver', 'boarding') and submitter_profile_id is not null)
  );

create index if not exists idx_tms_grievance_submitter on public.tms_grievance(submitter_profile_id);

-- 2. Comments: allow driver/boarding-authored messages (was learner|admin only).
alter table public.tms_grievance_comment drop constraint if exists tms_grievance_comment_author_role_check;
alter table public.tms_grievance_comment
  add constraint tms_grievance_comment_author_role_check
  check (author_role in ('learner', 'admin', 'driver', 'boarding'));

-- 3. RLS: staff may read their OWN grievances + threads (parity with the learner
--    policies; the service-role API stays the real access path).
drop policy if exists tms_grv_staff_select on public.tms_grievance;
create policy tms_grv_staff_select on public.tms_grievance
  for select using (submitter_profile_id = auth.uid());

drop policy if exists tms_grvc_staff_select on public.tms_grievance_comment;
create policy tms_grvc_staff_select on public.tms_grievance_comment
  for select using (grievance_id in (
    select g.id from public.tms_grievance g where g.submitter_profile_id = auth.uid()));

-- 4. Grant the existing submit permission to the driver + boarding roles. Additive
--    JSONB merge; user_has_permission() falls back to profiles.role = role_key, so one
--    row per role grants every holder. Reversible by removing the key.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('tms.grievances.submit', true)
where role_key in ('driver', 'transport_boarding');
