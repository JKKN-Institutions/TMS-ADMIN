-- Local index of bug reports submitted from this app's four portals.
--
-- WHY: the JKKN Bug Reporter platform's public API dropped its application-wide
-- read. Its only list endpoint (GET /api/v1/public/bug-reports/me) now REQUIRES a
-- reporter_email and returns just that one reporter's reports, and nothing
-- enumerates reporters — so the admin console can no longer ask for "all reports"
-- in one call (GET /api/v1/public/bug-reports is 405, POST-only).
--
-- Our same-origin relay (app/api/v1/public/[...path]/route.ts) is the single
-- chokepoint every submission passes through, so it records each new report here
-- as it is created. The console lists from THIS table and fetches each detail from
-- the platform using the reporter_email stored alongside it.
--
-- This is an INDEX, not a mirror: the platform stays the system of record for
-- descriptions, screenshots, console logs and message threads. We keep only what
-- a list view needs plus the join key.
--
-- Known limitation, by construction: this can only contain reports submitted
-- AFTER deployment. Backfilling history is impossible — enumerating past reports
-- is exactly the capability the platform removed.

create table if not exists public.tms_bug_report_index (
  -- The platform's own report id. Text (not uuid) because we do not control its
  -- id format and must never reject a submission over a shape mismatch.
  id text primary key,
  display_id text,
  title text not null,
  category text,
  priority text,
  -- Snapshot of status at submit time. The platform owns the live value; we
  -- refresh this row whenever an admin opens the report's detail view.
  status text not null default 'open',
  portal text not null default 'other'
    check (portal in ('admin','student','driver','boarding','other')),
  page_url text,
  -- Join key back to the platform's detail endpoint, which now requires it.
  -- Stored lowercase (see lib/bug-reports/shared.ts pickReporter).
  reporter_email text not null,
  reporter_name text,
  -- created_at mirrors the PLATFORM's timestamp so the console sorts by when the
  -- report was actually filed; indexed_at is our own write time.
  created_at timestamptz,
  indexed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tms_bri_created_at
  on public.tms_bug_report_index (created_at desc nulls last);
create index if not exists idx_tms_bri_reporter_email
  on public.tms_bug_report_index (reporter_email);
create index if not exists idx_tms_bri_status
  on public.tms_bug_report_index (status);
create index if not exists idx_tms_bri_portal
  on public.tms_bug_report_index (portal);

alter table public.tms_bug_report_index enable row level security;
-- Service-role only (the relay writes, the admin route reads). No policies =
-- no anon/authenticated access, matching the modern tms_ pattern.
