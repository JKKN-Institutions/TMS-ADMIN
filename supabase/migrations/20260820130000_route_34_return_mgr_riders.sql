-- Correct the destination of the former M G R MEDU riders.
--
-- 20260820110000 moved them to route 31's MGR NAGAR, because at that moment that
-- was the only MGR NAGAR in the catalogue. Route 34 has since gained its OWN
-- M G R NAGAR at position 22 (20260820120000), occupying the slot M G R MEDU used
-- to hold — so route 34 is where they belong, and route 31 was only ever meant
-- for the OTTAMETHAI rider.
--
-- Scoped by (stop = route 31 MGR NAGAR) AND (route = 31) so this touches ONLY the
-- people the earlier migration moved. Anyone who genuinely belongs to route 31's
-- MGR NAGAR from before that migration would also match, so this is deliberately
-- narrowed further to the six known refs — a stop-wide update here would sweep up
-- riders this task never touched.

do $$
declare
  v_r34 uuid;
  v_mgr_nagar_34 uuid;
  n int;
begin
  select id into strict v_r34 from tms_route where route_code = 'KOKKARAYAN PETTAI NO 34';
  select id into strict v_mgr_nagar_34 from tms_route_stop
   where route_id = v_r34 and stop_name = 'M G R NAGAR';

  update learners_profiles
     set transport_stop_id = v_mgr_nagar_34, transport_route_id = v_r34
   where roll_number in ('AUG26CY05', 'AUG26CS17', 'AUG24AI14');
  get diagnostics n = row_count; raise notice 'returned to route 34: % learners', n;

  update staff
     set transport_stop_id = v_mgr_nagar_34, transport_route_id = v_r34
   where staff_id in ('CAS122', 'CAS088', 'NTO554');
  get diagnostics n = row_count; raise notice 'returned to route 34: % staff', n;
end $$;
