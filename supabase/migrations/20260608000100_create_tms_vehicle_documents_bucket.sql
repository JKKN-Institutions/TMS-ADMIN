-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Vehicle: private documents bucket (RC / insurance / fitness / permit).
-- Private (public=false). Accessed only via service-role server routes
-- (app/api/admin/vehicles/documents) which return short-lived signed URLs.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('tms-vehicle-documents', 'tms-vehicle-documents', false)
on conflict (id) do nothing;
