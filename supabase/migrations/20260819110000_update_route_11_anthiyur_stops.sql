-- Route 11 (ANTHIYUR): re-time and extend the stop list from the current printed
-- timetable (22 numbered stops + 2 unnumbered = 24), taking the route from 19
-- stops to 29.
--
-- NOTHING IS DELETED. Route 11's stops carry 210 bookings, 113 attendance rows,
-- 36 fee-rate rows, 36 learners and 6 staff, and the FKs into tms_route_stop are
-- unforgiving: tms_booking.stop_id is NO ACTION (a delete aborts),
-- tms_fee_structure_stop_rate.stop_id is CASCADE (a delete silently destroys the
-- fare rows), and learners_profiles/staff.transport_stop_id are SET NULL (a
-- delete silently unassigns real people). So every existing stop is UPDATED IN
-- PLACE, keeping its id and therefore every reference to it.
--
-- Matched by PLACE, not by row number. Six stops are renamed to the spelling on
-- the current sheet — same physical stop, same id, all bookings and fee rates
-- intact:
--   GEEVA SET          → JEEVA SET
--   ANDHIYUR BUS STAND → ANTHIYUR BUS STAND
--   ANNAMADUV          → ANNA MADUVU
--   KATTUR             → KAATUR
--   PARRUVACHI         → PARUVACHI
--   PALLPANNAI         → THIRU NAGAR (PALL PANNAI)
--   BHAVANI BUS STAND  → BHAVANI GH (STAR BAKERY)   (confirmed same place)
--
-- Five stops are NOT on the new sheet but are KEPT ACTIVE by explicit decision —
-- three of them still have riders (CHEMCULICHAMPALAYAM 7 learners / 21 bookings,
-- PALLAYAMETTUR 1 / 7, KADAIYAPATTI 1 / 1) and dropping them would strand those
-- students. They keep their existing times and are slotted into the new sequence
-- at the position their morning time implies:
--   PALLAYAMETTUR (07:55), CHEMCULICHAMPALAYAM (08:12), KADAIYAPATTI (08:28),
--   KPM BUS STAND (08:35), PPM PERIVU (08:40)
--
-- Two transcription slips in the source are corrected (confirmed):
--   S.No 6  "0IL MILL"  → OIL MILL (leading zero was a typo for the letter O)
--   S.No 13 KAATUR evening "5-39 PM" → 17:30; 17:39 sits out of order between
--           ANNA MADUVU 17:32 and MURUGAN KINARU 17:28.
--
-- Ten stops are new to the route: ANTHIYUR COLONY 2, KARATTU PALAYAM, OIL MILL,
-- UNION OFFICE, MUPPANAR SELAI, POOKADAI, MANGALAM SCHOOL, MURUGAN KINARU,
-- PAATAPPAN KOVIL, RATTAI KARADU. NOTE: each starts life with NO row in
-- tms_fee_structure_stop_rate, which makes it an unbillable hole — seed the fare
-- rates for these ten before anyone is allocated to them.
--
-- Idempotent: the UPDATEs are keyed on the pre-migration names (a second run
-- matches nothing), and the INSERTs are guarded by a NOT EXISTS on stop_name.

do $$
declare
  v_route_id uuid;
  v_stops    int;
begin
  select id into v_route_id from tms_route where route_number = '11';
  if v_route_id is null then
    raise exception 'route 11 not found';
  end if;

  -- Header: the timetable now runs 07:30 → 08:46 (was 08:52).
  update tms_route
     set arrival_time = '08:46',
         duration     = '1h 16m',
         updated_at   = now()
   where id = v_route_id;

  -- ── Existing stops: re-point in place (old_name → new name/times/sequence) ──
  update tms_route_stop s
     set stop_name       = v.new_name,
         stop_time       = v.morning::time,
         evening_time    = v.evening::time,
         sequence_order  = v.seq,
         is_active       = true,
         updated_at      = now()
    from (values
      ('PERUMAL KOVILPERIVU',  'PERUMAL KOVILPERIVU',       '07:30', '18:05',  1),
      ('ANDHIYUR COLONY',      'ANDHIYUR COLONY',           '07:35', '18:02',  2),
      ('THANGAPALAYAM',        'THANGAPALAYAM',             '07:40', '17:55',  4),
      ('GEEVA SET',            'JEEVA SET',                 '07:45', '17:49',  6),
      ('CHINNATHAMBI PALAYAM', 'CHINNATHAMBI PALAYAM',      '07:50', '17:45',  7),
      -- kept, not on the new sheet (1 learner, 7 bookings) — original times
      ('PALLAYAMETTUR',        'PALLAYAMETTUR',             '07:55', '17:45', 10),
      ('ANDHIYUR BUS STAND',   'ANTHIYUR BUS STAND',        '08:00', '17:36', 13),
      ('ANNAMADUV',            'ANNA MADUVU',               '08:04', '17:32', 15),
      ('KATTUR',               'KAATUR',                    '08:07', '17:30', 16),
      -- kept, not on the new sheet (7 learners, 21 bookings) — original times
      ('CHEMCULICHAMPALAYAM',  'CHEMCULICHAMPALAYAM',       '08:12', '17:30', 19),
      ('PARRUVACHI',           'PARUVACHI',                 '08:14', '17:22', 20),
      ('PALLPANNAI',           'THIRU NAGAR (PALL PANNAI)', '08:19', '17:16', 22),
      ('THOTTIPALAYAM',        'THOTTIPALAYAM',             '08:24', '17:11', 23),
      -- kept, not on the new sheet (1 learner, 1 booking) — original times
      ('KADAIYAPATTI',         'KADAIYAPATTI',              '08:28', '17:10', 24),
      ('BHAVANI BUS STAND',    'BHAVANI GH (STAR BAKERY)',  '08:29', '17:05', 25),
      -- kept, not on the new sheet (no riders) — original times
      ('KPM BUS STAND',        'KPM BUS STAND',             '08:35', '17:00', 26),
      ('PPM PERIVU',           'PPM PERIVU',                '08:40', '16:55', 27),
      ('SUNDARAM COLONY',      'SUNDARAM COLONY',           '08:40', '16:52', 28),
      ('COLLEGE',              'COLLEGE',                   '08:46', '16:45', 29)
    ) as v(old_name, new_name, morning, evening, seq)
   where s.route_id = v_route_id
     and s.stop_name = v.old_name;

  -- ── New stops on the sheet that the route never had ────────────────────────
  insert into tms_route_stop (route_id, sequence_order, stop_name, stop_time, evening_time, is_active)
  select v_route_id, v.seq, v.name, v.morning::time, v.evening::time, true
    from (values
      ( 3, 'ANTHIYUR COLONY 2', '07:38', '18:00'),
      ( 5, 'KARATTU PALAYAM',   '07:42', '17:50'),
      ( 8, 'OIL MILL',          '07:52', '17:43'),
      ( 9, 'UNION OFFICE',      '07:55', '17:41'),
      (11, 'MUPPANAR SELAI',    '07:57', '17:39'),
      (12, 'POOKADAI',          '07:58', '17:38'),
      (14, 'MANGALAM SCHOOL',   '08:02', '17:34'),
      (17, 'MURUGAN KINARU',    '08:09', '17:28'),
      (18, 'PAATAPPAN KOVIL',   '08:10', '17:26'),
      (21, 'RATTAI KARADU',     '08:17', '17:19')
    ) as v(seq, name, morning, evening)
   where not exists (
     select 1 from tms_route_stop x
      where x.route_id = v_route_id and x.stop_name = v.name
   );

  select count(*) into v_stops from tms_route_stop where route_id = v_route_id;
  if v_stops <> 29 then
    raise exception 'route 11 should have 29 stops after this migration, found %', v_stops;
  end if;
end $$;
