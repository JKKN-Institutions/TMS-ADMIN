-- Bill the moment a learner enters transport, instead of up to 15 minutes later.
--
-- The sweep in lib/fees/auto-generate.ts is CONVERGENT: it bills whoever is
-- bus_required and not yet billed. That design is right, but pg_cron alone
-- meant a learner who applied at 10:01 waited until 10:15.
--
-- This adds a NUDGE: a statement-level trigger on learners_profiles fires the
-- same idempotent endpoint the instant bus_required goes true. It does not
-- replace the cron, it races it -- whichever arrives first bills, and
-- tms_fee_bill_idem_unique makes the loser a no-op.
--
-- Three properties this MUST have, because MyJKKN owns learners_profiles and a
-- transport bill must never be able to break an admission:
--   1. FAIL-OPEN. Any error here is swallowed. A learner write never fails
--      because billing was unreachable.
--   2. NON-BLOCKING. net.http_get is async, and the debounce uses a TRY
--      advisory lock, never a row lock -- so no learner write can ever queue
--      behind another learner write.
--   3. COALESCED. Statement-level + a 10-second debounce means a 500-row bulk
--      import fires ONE request, not 500.

create table if not exists public.tms_auto_bill_nudge (
  id            boolean primary key default true check (id),
  last_fired_at timestamptz not null default '-infinity',
  fire_count    bigint      not null default 0,
  skip_count    bigint      not null default 0,
  last_reason   text
);
comment on table public.tms_auto_bill_nudge is
  'Single-row debounce state for the immediate auto-bill nudge. fire_count/skip_count are for observability: a runaway skip_count means the debounce window is too wide.';

insert into public.tms_auto_bill_nudge (id) values (true) on conflict (id) do nothing;

-- Fire the auto-generation endpoint, at most once per debounce window.
create or replace function public.tms_request_auto_bill_run(p_reason text)
returns void
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- TRY, never wait. If another transaction is already nudging, that run will
  -- sweep the whole cohort anyway, and the cron backstops what it misses.
  -- Crucially this takes no row lock, so learner writes never serialise here.
  if not pg_try_advisory_xact_lock(hashtext('tms_auto_bill_nudge')) then
    return;
  end if;

  update public.tms_auto_bill_nudge
     set skip_count = skip_count + 1
   where last_fired_at >= clock_timestamp() - interval '10 seconds';
  if found then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'tms_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'tms_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  update public.tms_auto_bill_nudge
     set last_fired_at = clock_timestamp(),
         fire_count    = fire_count + 1,
         last_reason   = p_reason;

  perform net.http_get(
    url     := v_url || '/api/cron/auto-generate-bills',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 120000
  );
exception when others then
  -- Deliberately silent. See property 1 above.
  return;
end;
$$;

revoke all on function public.tms_request_auto_bill_run(text) from public, anon, authenticated;

-- Statement-level so a bulk import is one request. Transition tables let us ask
-- "did anyone actually ENTER transport?" without a per-row trigger.
create or replace function public.tms_nudge_auto_bill_on_transport_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from new_rows where bus_required is true limit 1;
  else
    -- Only a FALSE/NULL -> TRUE transition counts. Editing the stop of an
    -- already-billed rider must not re-fire.
    perform 1
      from new_rows n
      join old_rows o on o.id = n.id
     where n.bus_required is true
       and o.bus_required is distinct from true
     limit 1;
  end if;

  if not found then
    return null;
  end if;

  perform public.tms_request_auto_bill_run('learner_entered_transport');
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists trg_tms_nudge_auto_bill_insert on public.learners_profiles;
create trigger trg_tms_nudge_auto_bill_insert
after insert on public.learners_profiles
referencing new table as new_rows
for each statement
execute function public.tms_nudge_auto_bill_on_transport_entry();

drop trigger if exists trg_tms_nudge_auto_bill_update on public.learners_profiles;
create trigger trg_tms_nudge_auto_bill_update
after update on public.learners_profiles
referencing new table as new_rows old table as old_rows
for each statement
execute function public.tms_nudge_auto_bill_on_transport_entry();

-- Tighten the safety net. The nudge handles the normal case in ~1 second; this
-- only has to catch a nudge lost to the debounce window or an app deploy that
-- was mid-restart. 2 minutes bounds that worst case instead of 15.
select cron.schedule(
  'tms-auto-generate-bills',
  '*/2 * * * *',
  $cron$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/auto-generate-bills',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret'))
  );
  $cron$
);
