-- Complete the OTTAMETHAI move requested during the route 34 re-import.
--
-- Route 34 dropped OTTAMETHAI and the transport office directed it to route 31.
-- That could not be actioned at the time because route 31 had no such stop; the
-- route 31 re-import (20260820140000) creates it at position 20, so the rider
-- can now follow. Cross-route move => write BOTH transport_route_id and
-- transport_stop_id, or the roster and the boarding screen disagree.

do $$
declare
  v_r31 uuid;
  v_ottamethai_31 uuid;
  n int;
begin
  select id into strict v_r31 from tms_route where route_code = 'THIRUCHENGODU NO 31';
  select id into strict v_ottamethai_31 from tms_route_stop
   where route_id = v_r31 and stop_name = 'OTTAMETHAI';

  update learners_profiles
     set transport_stop_id = v_ottamethai_31, transport_route_id = v_r31
   where roll_number = 'EM25046';
  get diagnostics n = row_count; raise notice 'ottamethai -> route 31: % learners', n;
end $$;
