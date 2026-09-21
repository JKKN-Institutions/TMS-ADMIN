-- ─────────────────────────────────────────────────────────────────────────────
-- Bus Inspection: which trip leg the riders snapshot (booked/boarded/headcount)
-- was taken for. Target: kvizhngldtiuufknvehv. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tms_inspection
  add column if not exists riders_leg text check (riders_leg in ('onward','return'));
