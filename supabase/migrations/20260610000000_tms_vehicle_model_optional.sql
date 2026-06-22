-- Vehicle model is optional: bulk import sheets often lack it, and it is not a
-- natural key (vehicles are identified by registration_number).
alter table public.tms_vehicle alter column model drop not null;
