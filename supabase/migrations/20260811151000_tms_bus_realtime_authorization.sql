-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime Authorization for live bus positions.
--
-- Live fixes are broadcast to two topics:
--   tms_bus:<routeId>  — that route's riders, in-charges, driver, and tracking staff
--   tms_fleet          — holders of tms.tracking.view
--
-- Subscription is authorized by RLS on realtime.messages. This is what makes
-- "a student cannot watch another bus" a database guarantee rather than a frontend
-- convention: editing the topic string in devtools yields no rows.
--
-- Modelled on induction_poll_realtime_receive, which already exists on this table in
-- this shared database. Our policy is PREFIX-SCOPED to tms_bus:/tms_fleet, so it is
-- purely additive and cannot widen access for any other app's topics.
--
-- ⚠ WHY NOT tms.tracking.view: it is NOT a staff permission. Measured on this
-- database, it is granted to the `student` role — 6,281 users — as well as `driver`
-- (34) and `transport_head` (2). Using it for "may see every bus" would have handed
-- the whole fleet to every student. An API route can lean on proxy.ts area gating to
-- cover that; an RLS policy has no such second gate, so it needs a permission that
-- genuinely means "fleet operator". Hence tms.tracking.fleet.view below, seeded to
-- the roles that hold tms.dashboard.view (transport_head only, plus super admins who
-- bypass permission checks entirely).
-- ─────────────────────────────────────────────────────────────────────────────

-- Data-driven and idempotent, matching 20260703121000_seed_tms_notification_permissions.sql.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.tracking.fleet.view": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.dashboard.view')::boolean, false) = true;

create or replace function public.tms_can_view_route_live(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_route_id is not null
    and (
      -- Fleet operators: any route. NOT tms.tracking.view — see the header.
      public.user_has_permission('tms.tracking.fleet.view')

      -- The learner allocated to this route.
      or exists (
        select 1
        from public.learners_profiles lp
        where lp.id = public.get_my_learner_id()
          and lp.transport_route_id = p_route_id
      )

      -- A boarding in-charge assigned to this route. staff_email is stored
      -- lower-cased but profiles.email is NOT uniformly lower-cased, so the join
      -- must lower() the profile side or real in-charges silently fail to match.
      or exists (
        select 1
        from public.tms_staff_route_assignment sra
        join public.profiles p on lower(p.email) = sra.staff_email
        where p.id = auth.uid()
          and sra.route_id = p_route_id
          and sra.is_active = true
      )

      -- The route's driver, via either linkage column. Both are populated in
      -- production by two different admin screens, so both must be honoured.
      or exists (
        select 1
        from public.tms_driver d
        left join public.staff s on s.id = d.staff_id
        where (d.profile_id = auth.uid() or s.profile_id = auth.uid())
          and (
            d.active_route_id = p_route_id
            or d.assigned_route_id = p_route_id
            or exists (
              select 1 from public.tms_route r
              where r.id = p_route_id and r.driver_id = d.staff_id
            )
          )
      )
    );
$$;

comment on function public.tms_can_view_route_live(uuid) is
  'True when the calling user may receive live positions for this route. Used by the tms_bus_realtime_receive RLS policy on realtime.messages.';

revoke all on function public.tms_can_view_route_live(uuid) from public;
grant execute on function public.tms_can_view_route_live(uuid) to authenticated;

-- Targeted drop: never touch another app's policy on this shared table.
drop policy if exists tms_bus_realtime_receive on realtime.messages;
create policy tms_bus_realtime_receive on realtime.messages
  for select
  to authenticated
  using (
    (
      topic like 'tms_bus:%'
      and public.tms_can_view_route_live(
            nullif(split_part(topic, ':', 2), '')::uuid
          )
    )
    or (
      topic = 'tms_fleet'
      and public.user_has_permission('tms.tracking.fleet.view')
    )
  );

-- ── Verification (run separately after applying) ─────────────────────────────
--   select policyname from pg_policies
--     where schemaname='realtime' and tablename='messages' order by policyname;
--   -- expect BOTH induction_poll_realtime_receive AND tms_bus_realtime_receive
