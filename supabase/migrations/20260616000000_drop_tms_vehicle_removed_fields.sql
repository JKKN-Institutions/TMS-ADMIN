-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Vehicle: drop 13 unused fleet-management fields
--
-- Removes columns that the Vehicles Management module no longer exposes
-- (form, detail view, export/import). All 13 were nullable "advanced fields"
-- added in 20260608000000 and were never populated (0 non-null values across
-- all rows at drop time), so this is data-loss-free in practice. None are
-- referenced by views, constraints, or indexes.
--
-- Target: shared MyJKKN Supabase project (project ref: kvizhngldtiuufknvehv).
-- Idempotent: DROP ... IF EXISTS makes re-runs safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ownership & purchase
alter table public.tms_vehicle drop column if exists purchase_date;
alter table public.tms_vehicle drop column if exists purchase_cost;
alter table public.tms_vehicle drop column if exists vendor_name;
alter table public.tms_vehicle drop column if exists warranty_expiry;

-- Compliance & legal
alter table public.tms_vehicle drop column if exists rc_expiry_date;

-- Insurance
alter table public.tms_vehicle drop column if exists insurance_amount;

-- Driver assignment (assigned_driver_id/_name retained; only the date is dropped)
alter table public.tms_vehicle drop column if exists assignment_date;

-- Maintenance
alter table public.tms_vehicle drop column if exists current_odometer;
alter table public.tms_vehicle drop column if exists maintenance_interval_km;
alter table public.tms_vehicle drop column if exists maintenance_interval_days;
alter table public.tms_vehicle drop column if exists last_service_odometer;
alter table public.tms_vehicle drop column if exists next_service_odometer;
alter table public.tms_vehicle drop column if exists service_vendor;
