-- ─────────────────────────────────────────────────────────────────────────────
-- TMS web-push subscriptions — one row per (user, device).
-- Unlike the rest of the notification module (service-role writes), this is
-- USER-OWNED data: subscribe/unsubscribe run under the user-scoped client, so the
-- table carries FULL own-row RLS (select/insert/update/delete where user_id = auth.uid()).
-- The server push-send path reads/prunes via the service-role client (RLS bypassed).
-- Additive + idempotent. Target: shared MyJKKN Supabase (ref: kvizhngldtiuufknvehv).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_push_subscription (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                 -- recipient profiles.id (== auth.users.id); soft ref
  endpoint    text not null,                 -- push service URL (unique per device)
  p256dh      text not null,                 -- client public key
  auth        text not null,                 -- client auth secret
  user_agent  text,                          -- human-readable device label
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_tms_push_sub_user on public.tms_push_subscription (user_id);

comment on table public.tms_push_subscription is
  'Web-push subscriptions (one per user+device). User-owned: full own-row RLS.';

-- updated_at touch (dedicated name; do not clobber shared fns)
create or replace function public.tms_push_subscription_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_tms_push_subscription_updated_at on public.tms_push_subscription;
create trigger trg_tms_push_subscription_updated_at
  before update on public.tms_push_subscription
  for each row execute function public.tms_push_subscription_set_updated_at();

alter table public.tms_push_subscription enable row level security;

drop policy if exists tms_push_sub_select_own on public.tms_push_subscription;
create policy tms_push_sub_select_own on public.tms_push_subscription
  for select using (user_id = auth.uid());

drop policy if exists tms_push_sub_insert_own on public.tms_push_subscription;
create policy tms_push_sub_insert_own on public.tms_push_subscription
  for insert with check (user_id = auth.uid());

drop policy if exists tms_push_sub_update_own on public.tms_push_subscription;
create policy tms_push_sub_update_own on public.tms_push_subscription
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists tms_push_sub_delete_own on public.tms_push_subscription;
create policy tms_push_sub_delete_own on public.tms_push_subscription
  for delete using (user_id = auth.uid());
