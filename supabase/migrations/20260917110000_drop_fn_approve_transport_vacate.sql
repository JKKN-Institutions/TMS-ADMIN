-- ─────────────────────────────────────────────────────────────────────────────
-- Drop the orphaned tms_approve_transport_vacate(uuid, uuid).
--
-- Created by 20260717120200. The approve path that called it was removed when
-- the Transport Vacate module was retired (2026-08-24); the admin page, API,
-- lib/vacate and tms.vacate.* permissions followed on 2026-09-17. On that date
-- nothing referenced it: no app code, no other function, no cron job, no
-- pg_depend entries. The tms_transport_vacate_request table and its history
-- rows are kept.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.tms_approve_transport_vacate(uuid, uuid);
