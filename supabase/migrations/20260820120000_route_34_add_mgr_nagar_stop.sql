-- Route 34: insert M G R NAGAR at position 22, ahead of SUGA PRIYA HOSPITAL.
--
--   21 SANAPALAYAM          08:35 / 16:54
--   22 M G R NAGAR          08:37 / 16:54   <- new
--   23 SUGA PRIYA HOSPITAL  08:41 / 16:50   (was 22)
--   24 COLLEGE              08:55 / 16:45   (was 23)
--
-- The tail is shifted DOWNWARD FIRST (highest sequence_order first), then the new
-- row is inserted. tms_route_stop has no unique index on (route_id,
-- sequence_order) — see the route-stop hazard notes — so a collision would not
-- raise, it would silently leave two stops sharing a position and the route would
-- render in an arbitrary order. Doing the shift descending keeps every
-- intermediate state collision-free regardless.
--
-- Note: 16:54 ties with SANAPALAYAM's evening time. That is what the printed
-- timetable says, and the sequence_order (not the clock) is what orders the route.

do $$
declare
  v_route_id uuid;
begin
  select id into strict v_route_id from tms_route where route_code = 'KOKKARAYAN PETTAI NO 34';

  if exists (select 1 from tms_route_stop
             where route_id = v_route_id and stop_name = 'M G R NAGAR') then
    raise notice 'M G R NAGAR already present on route 34 — nothing to do';
    return;
  end if;

  update tms_route_stop set sequence_order = 24, updated_at = now()
   where route_id = v_route_id and stop_name = 'COLLEGE' and is_active;

  update tms_route_stop set sequence_order = 23, updated_at = now()
   where route_id = v_route_id and stop_name = 'SUGA PRIYA HOSPITAL' and is_active;

  insert into tms_route_stop
    (route_id, stop_name, sequence_order, stop_time, evening_time, is_major_stop, is_active)
  values
    (v_route_id, 'M G R NAGAR', 22, '08:37', '16:54', false, true);
end $$;
