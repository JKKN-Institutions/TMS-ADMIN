-- ─────────────────────────────────────────────────────────────────────────────
-- Route Checkers — match assignments on the verified login email only
-- (follow-up to 20260921150000_route_checkers / 20260921151000_..._identity_hardening).
-- Target: shared MyJKKN project kvizhngldtiuufknvehv. Idempotent / safe to re-run.
-- Spec: docs/superpowers/specs/2026-09-21-route-checkers-design.md
--
-- The previous version also trusted every email on the caller's own staff row.
-- Some roles can UPDATE staff.email / institution_email (own records /
-- own institution), so a case-variant of a checker's email there inherited that
-- checker's routes. Now the ONLY identity is the confirmed auth.users.email;
-- no staff lookup at all. Email aliases are resolved when an assignment is
-- written (admin API), not here.
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
  from auth.users u
  where u.id = p_profile_id and u.email_confirmed_at is not null;
  if v_email is null then
    return '{}'::uuid[];
  end if;

  select coalesce(array_agg(distinct a.route_id), '{}') into v_ids
  from public.tms_route_checker_assignment a
  where a.is_active and a.checker_email = v_email;
  return v_ids;
end $$;
revoke all on function public.tms_route_checker_route_ids(uuid) from public;
revoke all on function public.tms_route_checker_route_ids(uuid) from anon;
grant execute on function public.tms_route_checker_route_ids(uuid) to authenticated, service_role;
