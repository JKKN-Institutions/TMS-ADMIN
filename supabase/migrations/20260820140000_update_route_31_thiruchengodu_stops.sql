-- Route 31 (T GODU / THIMARATHAM PATTI) — re-import the printed timetable: 32 -> 23.
--
-- Same in-place discipline as the route 34 re-import (20260820100000): the 32
-- existing rows carry 85 learners, 4 staff and 635 bookings, and tms_route_stop's
-- FK delete rules make a delete destructive (tms_booking NO ACTION aborts;
-- learners_profiles / staff SET NULL silently unassign; fee stop rates CASCADE).
-- So: survivors are UPDATED in place, dropped stops are DEACTIVATED.
--
-- Two rows are RENAMED rather than dropped-and-recreated, because the timetable
-- spells them differently but they are the same physical stop — keeping the row
-- keeps its riders, bookings and stop rates attached:
--   KOTTAPLLI      -> KOOTTAPALLI     (1 learner, 1 booking)
--   SAANARPALAYAM  -> SANARPALAIYAM   (1 learner, 1 staff, 10 bookings)
--
-- Source typo normalised: KATACHANALLUR is printed "7-59 PM" but falls between
-- 7:57 AM and 8:02 AM in the sequence, so it is stored as 07:59.
--
-- OTTAMETHAI arrives here as a NEW route 31 stop (position 20). That is what
-- unblocks moving the route 34 OTTAMETHAI rider over, handled separately.
--
-- Order matters: dropped stops are pushed out of the 1..23 band FIRST, so the
-- survivors can be renumbered into it without transiently sharing a position.
-- There is no unique index on (route_id, sequence_order) — a collision would not
-- raise, it would just render the route in an arbitrary order.

do $$
declare
  v_route_id uuid;
begin
  select id into strict v_route_id from tms_route where route_code = 'THIRUCHENGODU NO 31';

  -- ── 1. Retire the 16 stops the new timetable drops ─────────────────────────
  update tms_route_stop s
  set is_active = false,
      sequence_order = 90 + s.sequence_order,
      updated_at = now()
  where s.route_id = v_route_id
    and s.stop_name in (
      'VALDAR GATE', 'POLICE COTERS', 'K S R COLLEGE', 'S P K SCHOOL',
      'PERUMAL KOVIL', 'AAYAKATTUR', 'VASANTH NAGAR', 'KAVERI RS PIRIVU',
      'BUTHAN SANTHAI', 'AGRAHARAM', 'VIJAYALAKSHMI THEATER', 'AAVANTHI PLAYAM',
      'SILLANG KAADU', 'GANAPATHIPALAYAM', 'MANIYAAR', 'MGR NAGAR'
    );

  -- ── 2. Repurpose the 16 surviving stops in place (14 kept + 2 renamed) ─────
  update tms_route_stop s
  set stop_name      = v.new_name,
      sequence_order = v.seq,
      stop_time      = v.stop_time,
      evening_time   = v.evening_time,
      is_active      = true,
      updated_at     = now()
  from (values
    ('DHIMMARATHAM PATTI',    1, '07:10'::time, '18:35'::time, 'DHIMMARATHAM PATTI'),
    ('KUMARAMANGALAM',        2, '07:20'::time, '18:30'::time, 'KUMARAMANGALAM'),
    ('MALAI SUTHI ROAD',      3, '07:25'::time, '18:25'::time, 'MALAI SUTHI ROAD'),
    ('THIRUCHENGODU',         4, '07:35'::time, '18:20'::time, 'THIRUCHENGODU'),
    ('SANTHAPETTAI',          5, '07:43'::time, '18:18'::time, 'SANTHAPETTAI'),
    ('RAJA GOWNDAMPALAYAM',   6, '07:45'::time, '18:15'::time, 'RAJA GOWNDAMPALAYAM'),
    ('KOTTAPLLI',             7, '07:48'::time, '18:12'::time, 'KOOTTAPALLI'),
    ('THOKKAVAADI',           9, '07:52'::time, '18:02'::time, 'THOKKAVAADI'),
    ('VARAPALAYAM',          10, '07:53'::time, '18:00'::time, 'VARAPALAYAM'),
    ('TAJ NAGAR',            14, '08:02'::time, '17:40'::time, 'TAJ NAGAR'),
    ('ANNAI SAKTHIYA NAGAR', 16, '08:05'::time, '17:35'::time, 'ANNAI SAKTHIYA NAGAR'),
    ('KAVERI RS',            17, '08:10'::time, '17:30'::time, 'KAVERI RS'),
    ('KANNANOOR MARIYAMMAN', 18, '08:12'::time, '17:25'::time, 'KANNANOOR MARIYAMMAN'),
    ('PETROL BUNK',          19, '08:14'::time, '17:23'::time, 'PETROL BUNK'),
    ('SAANARPALAYAM',        22, '08:35'::time, '17:00'::time, 'SANARPALAIYAM'),
    ('COLLEGE',              23, '08:55'::time, '16:45'::time, 'COLLEGE')
  ) as v(old_name, seq, stop_time, evening_time, new_name)
  where s.route_id = v_route_id and s.stop_name = v.old_name;

  -- ── 3. Insert the 7 stops the timetable adds ───────────────────────────────
  insert into tms_route_stop
    (route_id, stop_name, sequence_order, stop_time, evening_time, is_major_stop, is_active)
  select v_route_id, v.stop_name, v.seq, v.stop_time, v.evening_time, false, true
  from (values
    ('VIDYA VIKAS COLLEGE',  8, '07:50'::time, '18:10'::time),
    ('VELATHAZH KOVIL',     11, '07:55'::time, '17:55'::time),
    ('AINTHUPANAI',         12, '07:57'::time, '17:50'::time),
    ('KATACHANALLUR',       13, '07:59'::time, '17:45'::time),
    ('PALLAM',              15, '08:03'::time, '17:37'::time),
    ('OTTAMETHAI',          20, '08:20'::time, '17:20'::time),
    ('SEERAMPALAIYAM',      21, '08:30'::time, '17:10'::time)
  ) as v(stop_name, seq, stop_time, evening_time)
  where not exists (
    select 1 from tms_route_stop x
    where x.route_id = v_route_id and x.stop_name = v.stop_name
  );

  update tms_route
  set departure_time = '07:10', arrival_time = '08:55',
      duration = '1h 45m', updated_at = now()
  where id = v_route_id;
end $$;
