-- ─────────────────────────────────────────────────────────────────────────────
-- Remove the tms.vacate.* permissions.
--
-- The Transport Vacate module was retired on 2026-08-24 and its admin page, API
-- and lib/vacate code were deleted on 2026-09-17. Nothing in the app checks
-- tms.vacate.view / tms.vacate.manage any more.
--
-- 1. Strip both keys from every custom role. On 2026-09-17, 23 roles held
--    tms.vacate.view (drift past the 20260717130000 pin) and transport_head
--    alone held tms.vacate.manage.
-- 2. Rebuild the tms_transport_vacate_request SELECT policy without the
--    permission clause. The table and its history rows are kept; they stay
--    readable by super admins and by the owning learner.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

update public.custom_roles
set permissions = (permissions - 'tms.vacate.view') - 'tms.vacate.manage',
    updated_at = now()
where permissions ?| array['tms.vacate.view', 'tms.vacate.manage'];

drop policy if exists tms_vacate_req_select on public.tms_transport_vacate_request;
create policy tms_vacate_req_select on public.tms_transport_vacate_request
  for select using (
    public.is_super_admin()
    or profile_id = auth.uid()
  );

-- ── Verification (run separately after applying) ─────────────────────────────
--   -- Expect 0
--   select count(*) from public.custom_roles
--   where permissions ?| array['tms.vacate.view', 'tms.vacate.manage'];
