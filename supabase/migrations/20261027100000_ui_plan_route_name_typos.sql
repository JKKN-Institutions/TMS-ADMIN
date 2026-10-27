-- UI improvement plan, data clean-up (2026-10-27).
-- Text fixes only; rows are updated in place (never deleted — deleting a route
-- stop orphans or cascades the riders boarding there).
--
-- Route 39's start point is spelled KALLIPATTI while its name says KAALIPATTI;
-- only the stray spaces are fixed here until the correct spelling is confirmed.

begin;

-- Route 37: "CPLLEGE" -> "COLLEGE" (route end point and one stop name).
update tms_route
   set end_location = 'COLLEGE', updated_at = now()
 where route_number = '37' and end_location = 'CPLLEGE';

update tms_route_stop
   set stop_name = 'COLLEGE'
 where stop_name = 'CPLLEGE';

-- Route 12: "EADAPPADI (KONGANAPURM)" -> "EADAPPADI (KONGANAPURAM)".
update tms_route
   set route_name = 'EADAPPADI (KONGANAPURAM)', updated_at = now()
 where route_number = '12' and route_name = 'EADAPPADI (KONGANAPURM)';

-- Route 39: "ATHANI ( KAALIPATTI )" -> "ATHANI (KAALIPATTI)".
update tms_route
   set route_name = 'ATHANI (KAALIPATTI)', updated_at = now()
 where route_number = '39' and route_name = 'ATHANI ( KAALIPATTI )';

-- GPS device name: "Primay Bus Tracker" -> "Primary Bus Tracker".
update gps_devices
   set device_name = 'Primary Bus Tracker', updated_at = now()
 where device_name = 'Primay Bus Tracker';

commit;
