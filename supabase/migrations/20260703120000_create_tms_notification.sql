-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Notification module — TMS-owned notification tables (Phase P0).
--
-- TMS previously rode MyJKKN's shared `notifications` table, which MyJKKN reshapes
-- on its own schedule (it has already broken TMS once). This gives TMS its OWN
-- notification plane, modeled on MyJKKN's proven split design but under our control:
--
--   tms_notification            — one row per message (content + `targeting` jsonb).
--   tms_notification_recipient  — one row per recipient (per-user read state).
--
-- Fan-out is EXPLICIT at send time (no trigger): the send path resolves the
-- audience into a set of profile ids and inserts the message row + N recipient
-- rows. The `targeting` jsonb records WHO it was sent to (broadcast/role/route/
-- users); the recipient rows are the source of truth for delivery + read state.
--
-- Also creates tms_users_with_permission(): the audience resolver needs to
-- enumerate every profile that holds a given TMS permission (e.g. admins =
-- 'tms.dashboard.view', boarding = 'tms.attendance.scan'). MyJKKN only ships a
-- per-user check (user_has_permission / get_user_merged_permissions), so this
-- wraps the reverse ("who has permission X") in ONE audited SECURITY DEFINER fn,
-- using the SAME OR-merge-over-user_roles semantics as get_user_merged_permissions.
--
-- Security model:
--   • All admin writes/reads go through the service-role client (RLS bypassed) with
--     app-layer requirePerm('tms.notifications.*').
--   • RLS therefore only guards the CONSUMER path: a user may SELECT/UPDATE only
--     their own recipient rows (also required so client-side Realtime can stream a
--     user's own new notifications), and may SELECT a message row only if it was
--     delivered to them. No INSERT/DELETE policies → fan-out is service-role only.
--
-- Target: shared MyJKKN Supabase project (ref: kvizhngldtiuufknvehv). Additive,
-- idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Message row ──────────────────────────────────────────────────────────────
create table if not exists public.tms_notification (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null,
  url             text,                         -- in-app click target, e.g. /student/grievances
  icon            text,                         -- optional lucide icon name
  category        text not null default 'general',
  priority        text not null default 'normal'
                    check (priority in ('low','normal','high','urgent')),
  targeting       jsonb not null,               -- audience selector (see lib/notifications/audience.ts)
  metadata        jsonb not null default '{}'::jsonb,
  created_by      uuid,                          -- actor profiles.id; null for pure-system sends
  recipient_count int not null default 0,        -- denormalized fan-out size (set at send time)
  expires_at      timestamptz,                   -- hidden from inboxes once past
  idempotency_key text,                          -- dedup for automated writers (unique when set)
  sent_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists uq_tms_notification_idempotency
  on public.tms_notification (idempotency_key) where idempotency_key is not null;
create index if not exists idx_tms_notification_category
  on public.tms_notification (category);
create index if not exists idx_tms_notification_created_at
  on public.tms_notification (created_at desc);

comment on table public.tms_notification is
  'TMS-owned notification message rows (content + targeting jsonb). Fans out to tms_notification_recipient.';

-- ── Per-recipient delivery / read state ──────────────────────────────────────
create table if not exists public.tms_notification_recipient (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.tms_notification(id) on delete cascade,
  user_id         uuid not null,                 -- recipient profiles.id (== auth.users.id)
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (notification_id, user_id)              -- idempotent fan-out: one row per recipient
);

create index if not exists idx_tms_notif_recipient_user_unread
  on public.tms_notification_recipient (user_id, read_at);
create index if not exists idx_tms_notif_recipient_user_created
  on public.tms_notification_recipient (user_id, created_at desc);
create index if not exists idx_tms_notif_recipient_notif
  on public.tms_notification_recipient (notification_id);

comment on table public.tms_notification_recipient is
  'Per-recipient fan-out + read state for tms_notification. read_at set when the user opens it.';

-- ── updated_at touch trigger (dedicated name to avoid clobbering shared fns) ──
create or replace function public.tms_notification_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tms_notification_updated_at on public.tms_notification;
create trigger trg_tms_notification_updated_at
  before update on public.tms_notification
  for each row execute function public.tms_notification_set_updated_at();

-- ── Reverse permission lookup: every profile that holds a TMS permission ──────
-- Mirrors get_user_merged_permissions' semantics: a role grants a permission when
-- its jsonb `permissions` map has the key set true; a user has it via ANY active
-- assigned role. Super admins hold everything.
create or replace function public.tms_users_with_permission(p_permission text)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.is_super_admin = true
  union
  select distinct ur.user_id
  from public.user_roles ur
  join public.custom_roles cr on cr.id = ur.role_id
  where coalesce(cr.is_active, true) = true
    and coalesce((cr.permissions ->> p_permission)::boolean, false) = true;
$$;

comment on function public.tms_users_with_permission(text) is
  'Returns every profiles.id that holds the given permission key (super admins + any active role granting it). Used by the TMS notification audience resolver.';

grant execute on function public.tms_users_with_permission(text) to authenticated, service_role;

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.tms_notification enable row level security;
alter table public.tms_notification_recipient enable row level security;

-- Recipients: a user sees & marks-read only their OWN delivery rows. (Also lets
-- client-side Realtime stream a user's own inserts.) No insert/delete policy →
-- fan-out is service-role only.
drop policy if exists tms_notif_recipient_select_own on public.tms_notification_recipient;
create policy tms_notif_recipient_select_own on public.tms_notification_recipient
  for select using (user_id = auth.uid());

drop policy if exists tms_notif_recipient_update_own on public.tms_notification_recipient;
create policy tms_notif_recipient_update_own on public.tms_notification_recipient
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Messages: a user can read a message that was delivered to them. Admin reads go
-- through the service-role client (RLS bypassed) with requirePerm. No write policy.
drop policy if exists tms_notif_select_recipient on public.tms_notification;
create policy tms_notif_select_recipient on public.tms_notification
  for select using (
    exists (
      select 1 from public.tms_notification_recipient r
      where r.notification_id = tms_notification.id
        and r.user_id = auth.uid()
    )
  );

-- ── Realtime: stream a user's own new notifications to the bell ───────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tms_notification_recipient'
  ) then
    execute 'alter publication supabase_realtime add table public.tms_notification_recipient';
  end if;
end $$;
