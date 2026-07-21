-- Tracking Mobiles: one phone may carry up to 5 handover photos.
-- Replaces the scalar image_path with an ordered path array. Verified before
-- writing this: the table holds 1 row and 0 rows have a non-empty image_path,
-- so the back-fill below is defensive rather than load-bearing.

alter table public.tms_driver_mobile
  add column if not exists image_paths text[] not null default '{}';

-- Preserve any existing single image as a one-element array.
update public.tms_driver_mobile
   set image_paths = array[image_path]
 where image_path is not null
   and image_path <> ''
   and coalesce(cardinality(image_paths), 0) = 0;

alter table public.tms_driver_mobile drop column if exists image_path;

-- cardinality(), NOT array_length(): array_length returns NULL for an empty
-- array, which would make the CHECK evaluate to NULL and pass for the wrong
-- reason.
alter table public.tms_driver_mobile
  drop constraint if exists tms_driver_mobile_image_paths_max;
alter table public.tms_driver_mobile
  add constraint tms_driver_mobile_image_paths_max
  check (coalesce(cardinality(image_paths), 0) <= 5);
