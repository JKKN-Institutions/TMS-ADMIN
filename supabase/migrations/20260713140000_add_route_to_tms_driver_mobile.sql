-- Add an OPTIONAL bus-route link to tms_driver_mobile.
-- route_id → tms_route(id) ON DELETE SET NULL: the route is optional, so deleting a
-- route just clears it from any phones (never blocks the delete or orphans the phone).
-- Contrast driver_staff_id which is required (ON DELETE RESTRICT).
-- Target: shared project kvizhngldtiuufknvehv. Additive. Idempotent.
alter table public.tms_driver_mobile
  add column if not exists route_id uuid references public.tms_route(id) on delete set null;

create index if not exists idx_tms_driver_mobile_route on public.tms_driver_mobile(route_id);
