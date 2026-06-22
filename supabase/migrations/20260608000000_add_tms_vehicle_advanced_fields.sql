-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Vehicle: advanced fleet-management fields (additive)
--
-- Adds ~40 nullable columns to public.tms_vehicle backing the Vehicles module's
-- expanded form (identity, ownership, compliance, insurance, driver assignment,
-- GPS, maintenance, financial, emergency, documents, notes). All additive and
-- nullable — zero impact on existing rows; "required" is enforced in the form,
-- not the DB. Enum columns mirror the existing fuel_type/status CHECK pattern.
--
-- Target: shared MyJKKN Supabase project (project ref: kvizhngldtiuufknvehv).
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Identity
alter table public.tms_vehicle add column if not exists vehicle_type text;
alter table public.tms_vehicle add column if not exists manufacturer text;
alter table public.tms_vehicle add column if not exists model_year integer;
alter table public.tms_vehicle add column if not exists color text;
alter table public.tms_vehicle add column if not exists gross_vehicle_weight numeric;

-- Ownership & purchase
alter table public.tms_vehicle add column if not exists ownership_type text;
alter table public.tms_vehicle add column if not exists purchase_cost numeric;
alter table public.tms_vehicle add column if not exists vendor_name text;
alter table public.tms_vehicle add column if not exists warranty_expiry date;

-- Compliance & legal
alter table public.tms_vehicle add column if not exists rc_expiry_date date;
alter table public.tms_vehicle add column if not exists permit_number text;
alter table public.tms_vehicle add column if not exists permit_expiry_date date;
alter table public.tms_vehicle add column if not exists pollution_certificate_number text;
alter table public.tms_vehicle add column if not exists pollution_expiry_date date;
alter table public.tms_vehicle add column if not exists road_tax_expiry_date date;

-- Insurance
alter table public.tms_vehicle add column if not exists insurance_provider text;
alter table public.tms_vehicle add column if not exists insurance_policy_number text;
alter table public.tms_vehicle add column if not exists insurance_amount numeric;

-- Driver assignment (loose FK to tms_driver(staff_id); name cached for display)
alter table public.tms_vehicle add column if not exists assigned_driver_id uuid;
alter table public.tms_vehicle add column if not exists assigned_driver_name text;
alter table public.tms_vehicle add column if not exists assignment_date date;

-- GPS & tracking (keep existing gps_device_id + live_tracking_enabled)
alter table public.tms_vehicle add column if not exists gps_provider text;
alter table public.tms_vehicle add column if not exists sim_number text;

-- Maintenance
alter table public.tms_vehicle add column if not exists current_odometer numeric;
alter table public.tms_vehicle add column if not exists maintenance_interval_km numeric;
alter table public.tms_vehicle add column if not exists maintenance_interval_days integer;
alter table public.tms_vehicle add column if not exists last_service_odometer numeric;
alter table public.tms_vehicle add column if not exists next_service_odometer numeric;
alter table public.tms_vehicle add column if not exists service_vendor text;

-- Financial
alter table public.tms_vehicle add column if not exists monthly_emi numeric;
alter table public.tms_vehicle add column if not exists fuel_card_number text;
alter table public.tms_vehicle add column if not exists operating_cost_per_km numeric;

-- Emergency
alter table public.tms_vehicle add column if not exists emergency_contact_name text;
alter table public.tms_vehicle add column if not exists emergency_contact_phone text;
alter table public.tms_vehicle add column if not exists first_aid_available boolean not null default false;
alter table public.tms_vehicle add column if not exists fire_extinguisher_expiry date;

-- Documents (store storage path, resolved to a signed URL on read)
alter table public.tms_vehicle add column if not exists rc_document_url text;
alter table public.tms_vehicle add column if not exists insurance_document_url text;
alter table public.tms_vehicle add column if not exists fitness_certificate_url text;
alter table public.tms_vehicle add column if not exists permit_document_url text;

-- Notes
alter table public.tms_vehicle add column if not exists remarks text;

-- Enum CHECK constraints (drop-then-add so re-runs don't error)
alter table public.tms_vehicle drop constraint if exists tms_vehicle_vehicle_type_check;
alter table public.tms_vehicle add constraint tms_vehicle_vehicle_type_check
  check (vehicle_type is null or vehicle_type in ('bus','van','car','truck','ambulance','other'));

alter table public.tms_vehicle drop constraint if exists tms_vehicle_ownership_type_check;
alter table public.tms_vehicle add constraint tms_vehicle_ownership_type_check
  check (ownership_type is null or ownership_type in ('owned','leased','rented'));

-- Driver FK → tms_driver(staff_id) (UNIQUE: tms_driver_staff_id_key). SET NULL on
-- driver removal; assigned_driver_name is retained as a historical label.
alter table public.tms_vehicle drop constraint if exists tms_vehicle_assigned_driver_fk;
alter table public.tms_vehicle add constraint tms_vehicle_assigned_driver_fk
  foreign key (assigned_driver_id) references public.tms_driver(staff_id) on delete set null;

create index if not exists idx_tms_vehicle_vehicle_type on public.tms_vehicle(vehicle_type);
create index if not exists idx_tms_vehicle_assigned_driver_id on public.tms_vehicle(assigned_driver_id);
