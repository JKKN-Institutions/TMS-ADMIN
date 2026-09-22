-- ─────────────────────────────────────────────────────────────────────────────
-- Route Checkers — identity hardening (follow-up to 20260921150000_route_checkers).
-- Target: shared MyJKKN project kvizhngldtiuufknvehv. Idempotent / safe to re-run.
-- Spec: docs/superpowers/specs/2026-09-21-route-checkers-design.md
--
-- 1. Checker identity comes from the verified login email (auth.users.email),
--    never profiles.email: authenticated users can UPDATE their own
--    profiles.email, so trusting it would let anyone claim a checker's routes.
--    No auth.users row ⇒ no login ⇒ no access.
-- 2. The staff link is by profile_id, or by email only for staff rows that are
--    not linked to any profile (never attach another person's staff row).
-- 3. checker_email may not be blank.
-- 4. search_path pinned to public, pg_temp.
-- 5. No client writes on the route-check tables (service-role APIs only).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_route_checker_route_ids(p_profile_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_email text; v_ids uuid[];
begin
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or auth.uid() <> p_profile_id) then
    return '{}'::uuid[];
  end if;

  select nullif(lower(btrim(u.email)), '') into v_email
  from auth.users u where u.id = p_profile_id;
  if v_email is null then
    return '{}'::uuid[];
  end if;

  select coalesce(array_agg(distinct a.route_id), '{}') into v_ids
  from public.tms_route_checker_assignment a
  where a.is_active and (
    a.checker_email = v_email
    or a.checker_email in (
      select lower(btrim(v.x))
      from public.staff s,
        lateral (values (s.email), (s.institution_email)) v(x)
      where v.x is not null
        and (s.profile_id = p_profile_id
             or (s.profile_id is null
                 and (lower(btrim(s.email)) = v_email
                      or lower(btrim(s.institution_email)) = v_email)))
    ));
  return v_ids;
end $$;
revoke all on function public.tms_route_checker_route_ids(uuid) from public;
revoke all on function public.tms_route_checker_route_ids(uuid) from anon;
grant execute on function public.tms_route_checker_route_ids(uuid) to authenticated, service_role;

-- checker_email may not be blank.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tms_route_checker_assignment_email_not_blank'
      and conrelid = 'public.tms_route_checker_assignment'::regclass
  ) then
    alter table public.tms_route_checker_assignment
      add constraint tms_route_checker_assignment_email_not_blank check (checker_email <> '');
  end if;
end $$;

-- No client writes: all writes go through service-role API routes.
revoke insert, update, delete, truncate
  on public.tms_route_checker_assignment, public.tms_route_check, public.tms_route_check_person
  from anon, authenticated;
