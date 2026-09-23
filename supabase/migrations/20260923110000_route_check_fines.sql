-- Bus Inspection learner check: marks + automatic fines (spec 2026-09-23).
alter table public.tms_route_check_person
  add column if not exists booking_state text
    check (booking_state in ('this_route','other_route','none')),
  add column if not exists fee_fine_id uuid references public.tms_fee_fine(id) on delete set null,
  add column if not exists booking_fine_id uuid references public.tms_fee_fine(id) on delete set null,
  add column if not exists fine_note text;

alter table public.tms_route_check_person drop constraint if exists tms_route_check_person_fee_state_check;
alter table public.tms_route_check_person add constraint tms_route_check_person_fee_state_check
  check (fee_state in ('paid','unpaid','none','unknown','exempt','override'));

create index if not exists tms_route_check_person_fee_fine_idx on public.tms_route_check_person (fee_fine_id) where fee_fine_id is not null;
create index if not exists tms_route_check_person_booking_fine_idx on public.tms_route_check_person (booking_fine_id) where booking_fine_id is not null;
