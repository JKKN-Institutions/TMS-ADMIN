-- Give the seven locked-out staff their bus in-charge access back, WITHOUT
-- touching the fee ledger.
--
-- WHY
-- ---
-- On 2026-08-14/17 the in-charge enforcement run raised 37 staff transport
-- bills at status 'staff_deferred' -- "raised, but HELD pending the month-end
-- verdict". Seven of those staff have no active route assignment, so
-- deriveInChargeGate() (lib/boarding/incharge-gate.ts) returns 'must_pay' and
-- they see the "Transport fees are due" wall instead of the willingness toggle:
--
--     if (input.allowed) return 'in_duty';            <- 1. already assigned
--     if (input.hasOutstandingBill) return 'must_pay'; <- 2. they stop here
--     if (eligible && count === 0 && hasRoute) return 'choose';
--
-- Step 2 was written to stop a billed staffer re-granting themselves the fee
-- exemption through the toggle -- that is how 26 people escaped their bills on
-- 2026-08-17/18, and it stays. But it assumed the month-end verdict would clear
-- honest staff each month, and that verdict
-- (app/api/cron/incharge-month-verdict/route.ts, 737 lines) was deleted on
-- 2026-08-27 by PR #23 along with its pg_cron schedule.
--
-- POLICY DECISION (transport office, 2026-08-28)
-- The bills STAND. They are decided by the 31 August attendance rule, not
-- written off. So this migration deliberately does NOT cancel, pay or promote a
-- single bill -- the ledger is left exactly as the enforcement run left it. It
-- unblocks the seven by the OTHER door: step 1 of the gate. An active
-- tms_staff_route_assignment makes `allowed` true, which short-circuits the
-- bill check and returns 'in_duty' -- the full boarding portal.
--
-- (An earlier migration in this series, 20260828100000, cancelled all 37 bills
-- on the opposite reading and was reverted in full by 20260828100001. The
-- ledger is unchanged from before that pair ran: 37 rows / Rs 4,88,400 at
-- 'staff_deferred', plus one unrelated pre-existing cancelled bill of Rs 8,800.)
--
-- WHAT THIS WRITES, AND WHY IT MIRRORS /api/boarding/self-assign
-- The seven are not being given anything they could not have taken themselves
-- had they been unbilled -- all seven return eligible:true, has_route:true,
-- assigned_route_count:0 from tms_staff_boarding_eligibility. So this performs
-- exactly the two writes that route performs, and nothing more:
--
--   1. INSERT tms_staff_route_assignment (source='admin', is_active=true)
--   2. grantBoardingRole() -- the 'transport_boarding' role in user_roles,
--      which is what makes the proxy /boarding gate and the client can() pass.
--      Without it the assignment exists but tms.attendance.scan is absent, so
--      getAccess() computes routeIds=[] -> allowed=false and they stay walled.
--
-- THE ROUTE IS NOT HARDCODED. It is read per-staffer from
-- tms_staff_boarding_eligibility(profile_id), the same SECURITY DEFINER RPC the
-- self-assign route uses, which resolves staff.transport_route_id and returns it
-- only when it points at an ACTIVE route. A staffer can therefore only ever
-- become in-charge of the bus they actually ride, and a route deactivated since
-- this file was written is skipped rather than assigned.
--
-- staff_email MUST be lower(profiles.email), NOT staff.email.
-- getAssignedRouteIdsForUser() (lib/boarding/identity.ts) looks the assignment
-- up by the caller's profiles.email, lowercased. Staff carry three different
-- addresses (personal / institution / profile) and for four of these seven the
-- personal staff.email differs from the profile email -- writing the wrong one
-- creates a row that looks assigned in the admin list but leaves the staffer
-- locked out, which is a failure mode this project has already been bitten by.
--
-- assigned_by is left NULL (nullable, FK ON DELETE SET NULL): this is a policy
-- action taken via migration, not by a signed-in admin, and inventing an
-- attribution would be worse than recording none. The `notes` column carries
-- the reason instead.
--
-- Idempotent: re-running inserts nothing (the NOT EXISTS guard and the active
-- (staff_email, route_id) unique index both hold).

do $$
declare
  r record;
  v_elig jsonb;
  v_route uuid;
  v_email text;
  v_role uuid;
  v_inserted int := 0;
  v_skipped int := 0;
begin
  select id into v_role from public.custom_roles where role_key = 'transport_boarding';
  if v_role is null then
    raise exception 'custom_roles.transport_boarding is missing -- the assignment '
                    'would grant no scan permission and the staff would stay locked out';
  end if;

  for r in
    select p.id as profile_id, lower(trim(p.email)) as email
    from public.profiles p
    where p.id in (
      '1a3b4dc4-0590-4330-a711-4337062d3941', -- FACULTY A            Rs 20,000
      'c1a68e90-8bf3-4f7a-9777-416924ad11a8', -- BUVANESWARI G        Rs 20,000
      '8df9b920-5fa5-4c70-b5bb-33cddb352962', -- SARANYA M            Rs 12,900
      '6c02a093-42f9-4ac2-9f02-913554f42a0c', -- BANUMATHI R          Rs 12,100
      '2c1cf1e4-c097-4883-b90f-7586a3b3a905', -- AKILA M              Rs  7,150
      'cf7e4bd7-4981-4b73-afd9-092f6148476c', -- MANIMEGALAI R        Rs  4,400
      '620d8de6-86f7-403a-8414-bb1844fd89cc'  -- LATHA N              Rs  4,400
    )
  loop
    -- Same authority the self-assign route uses: eligibility AND the route.
    -- The RPC returns jsonb (eligible, route_id, has_route, assigned_route_count).
    v_elig := public.tms_staff_boarding_eligibility(r.profile_id);
    if coalesce((v_elig->>'eligible')::boolean, false)
       and coalesce((v_elig->>'has_route')::boolean, false) then
      v_route := (v_elig->>'route_id')::uuid;
    else
      v_route := null;
    end if;

    if v_route is null then
      raise notice 'SKIP % -- not eligible or no active route', r.email;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_email := r.email;

    if exists (
      select 1 from public.tms_staff_route_assignment
      where lower(staff_email) = v_email and is_active
    ) then
      raise notice 'SKIP % -- already has an active assignment', v_email;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.tms_staff_route_assignment
      (staff_email, route_id, assigned_by, source, is_active, notes)
    values
      (v_email, v_route, null, 'admin', true,
       'Restored 2026-08-28: bus in-charge access reinstated by the transport '
       'office while the 2026-08-14 held bill stands. The bill is decided by the '
       '31 August attendance rule, not by this assignment.');

    -- Mirrors grantBoardingRole(): without this the assignment grants no
    -- tms.attendance.scan and the boarding gate still computes allowed=false.
    insert into public.user_roles (user_id, role_id, is_primary, assigned_by)
    select r.profile_id, v_role, false, null
    where not exists (
      select 1 from public.user_roles
      where user_id = r.profile_id and role_id = v_role
    );

    raise notice 'ASSIGNED % -> route %', v_email, v_route;
    v_inserted := v_inserted + 1;
  end loop;

  raise notice 'in-charge access restored: % assigned, % skipped', v_inserted, v_skipped;
end $$;

-- Verify (all seven should now report gate 'in_duty'):
--   select lower(p.email) as email, a.route_id, a.is_active, a.source
--     from profiles p
--     join tms_staff_route_assignment a on lower(a.staff_email) = lower(p.email)
--    where p.id in ( ...the seven ids above... ) and a.is_active;
--
-- And the ledger must be UNCHANGED by this migration:
--   select status, count(*), sum(amount) from tms_fee_bill
--    where person_type = 'staff'
--      and transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
--    group by status;
--   -> staff_deferred 37 / Rs 4,88,400 and cancelled 1 / Rs 8,800.
--
-- ROLLBACK:
--   update tms_staff_route_assignment set is_active = false
--    where source = 'admin' and notes like 'Restored 2026-08-28:%';
--   (and, if the role should also go, delete the matching user_roles rows --
--   but only for staff with no other active assignment, per
--   maybeRevokeBoardingRole().)
