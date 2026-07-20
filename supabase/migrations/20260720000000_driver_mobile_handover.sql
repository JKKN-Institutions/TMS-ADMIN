-- Tracking Mobiles: phone image + handover metadata (image_path, handover_by, handover_date)
alter table tms_driver_mobile
  add column if not exists image_path    text,
  add column if not exists handover_by   text,
  add column if not exists handover_date date;

comment on column tms_driver_mobile.image_path is
  'Storage path in the private tms-driver-mobile-images bucket (NOT a public url).';

-- Private bucket for phone photos; all access is via service-role endpoints, so no RLS policies.
insert into storage.buckets (id, name, public)
values ('tms-driver-mobile-images', 'tms-driver-mobile-images', false)
on conflict (id) do nothing;
