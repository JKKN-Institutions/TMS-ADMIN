-- ─────────────────────────────────────────────────────────────────────────────
-- Bus Inspection module — defence in depth on the photo storage bucket.
-- Target: shared MyJKKN project kvizhngldtiuufknvehv. Idempotent / safe to re-run.
-- The API route already validates size/type before upload; this caps the
-- bucket itself so a direct/misbehaving upload can't bypass that check.
-- ─────────────────────────────────────────────────────────────────────────────

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'tms-inspection-photos';
