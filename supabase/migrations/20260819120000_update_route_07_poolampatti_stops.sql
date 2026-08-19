-- Route 07 (POOLAMPATTI): re-time and extend the stop list from the current
-- printed timetable (30 stops), taking the route from 26 stops to 34.
--
-- NOTHING IS DELETED, for the same reason as route 11: tms_booking.stop_id is
-- NO ACTION (delete aborts), tms_fee_structure_stop_rate.stop_id is CASCADE
-- (delete silently destroys the fare rows) and learners_profiles/staff
-- .transport_stop_id are SET NULL (delete silently unassigns real people).
-- Route 07's stops carry 505 bookings, 7 staff and 45 learners. Every existing
-- stop is UPDATED IN PLACE, keeping its id and every reference to it.
--
-- Matched by PLACE, not row number. Renamed to the sheet's spelling (same stop,
-- same id, bookings and fee rates intact):
--   MINIYAKARANOOR    -> MANIYAKARANOOR       CHLUVAMPALAYAM   -> SILUVAMPALAYAM
--   ANAIPALLIKADU     -> ANANPALLIKADU        UKLIPATTI PRIVU  -> OKLIPATTI PIRIVU
--   KOOTAIYOOR        -> KOTTAIYUR            NALLAGIYOOR      -> NALANKIYUR
--   METTUPALAYAM      -> K.METTUPALAYAM 1     KAVERIPATTI -1/-2/-3 -> KAVERI PATTI 1/2/3
--   PULLAKOUNDAMPATTI -> PILLAGOUNDAMPATTI    PUDHUR           -> PUTHUR
--   BHAVANI PUDHU PALAM -> BHAVANI PUTHU PAALAM
--   ANAGAGOOR PRIVU   -> ANANGUR PIRIVU
--
-- FOUR JUDGMENT CALLS, made deliberately:
--
-- 1. The sheet lists KATTUR TWICE -- S.No 3 (07:26) and S.No 9 (07:42). They are
--    two different places 16 minutes apart, and duplicate names on one route are
--    unusable: the booking and allocation pickers show only the stop name, so a
--    rider cannot tell which one they are choosing. The EXISTING KATTUR (2
--    learners, 2 bookings, old time 07:32) becomes KATTUR 1 at the S.No 3 slot,
--    and KATTUR 2 is inserted new -- confirmed by the transport office.
--
-- 2. The sheet has THREE Velalapalayam entries (RICE MILL 08:15, SCHOOL 08:16,
--    VELALAPALAYAM 08:18) where the DB has two (VELLALAPALAYAM-1 08:18,
--    VELLALAPALAYAM-2 08:21). VELLALAPALAYAM-1 matches 08:18 exactly and is
--    renamed to VELALAPALAYAM; RICE MILL and SCHOOL are inserted new.
--    VELLALAPALAYAM-2 is not on the sheet and is KEPT ACTIVE (1 learner, 11
--    bookings) rather than guessed into one of the new names.
--
-- 3. MULAKADAI and PUTHUPATTI PRIVU are not on the sheet. MOOLAPATHAI and
--    KUTTIYAGOUNDANOOR sit near them in the running order but are NOT obviously
--    the same places, so no rename is asserted: the two new names go in as new
--    stops and the two old ones stay active (both have zero riders, so keeping
--    them costs nothing and mis-merging them would move real fee rates).
--
-- 4. POOMANIYOOR is not on the sheet but has 3 learners and 27 bookings, so it
--    is KEPT ACTIVE. Its stored morning time 08:58 is a transcription error -- it
--    sits between KONERIPATTI 07:55 and OKLIPATTI 08:00 in the running order and
--    at 08:58 would sort to the very END of the morning boarding roster. It is
--    corrected to 07:58; its evening time is left untouched.
--
-- Eight stops are new: POOLAMPATTI POLICE STATION, MOOLAPATHAI,
-- KUTTIYAGOUNDANOOR, KATTUR 2, K.METTUPALAYAM 2, VELALAPALAYAM RICE MILL,
-- VELALAPALAYAM SCHOOL, KARUNKALPALAYAM. Each starts with NO row in
-- tms_fee_structure_stop_rate -- an unbillable hole until the fares are seeded.
--
-- Idempotent: UPDATEs key on pre-migration names, INSERTs guard on NOT EXISTS.

do $$
declare
  v_route_id uuid;
  v_stops    int;
begin
  select id into v_route_id from tms_route where route_number = '07';
  if v_route_id is null then
    raise exception 'route 07 not found';
  end if;

  update tms_route
     set departure_time = '07:20',
         arrival_time   = '08:55',
         duration       = '1h 35m',
         updated_at     = now()
   where id = v_route_id;

  update tms_route_stop s
     set stop_name      = v.new_name,
         stop_time      = v.morning::time,
         evening_time   = v.evening::time,
         sequence_order = v.seq,
         is_active      = true,
         updated_at     = now()
    from (values
      ('PILLUKURICHI',        'PILLUKURICHI',            '07:20', '18:35',  1),
      ('MINIYAKARANOOR',      'MANIYAKARANOOR',          '07:25', '18:28',  2),
      ('KATTUR',              'KATTUR 1',                '07:26', '18:27',  3),
      ('POOLAMPATTI',         'POOLAMPATTI',             '07:30', '18:22',  4),
      ('ANAIPALLIKADU',       'ANANPALLIKADU',           '07:38', '18:12',  8),
      -- kept, not on the sheet (no riders) -- original times
      ('MULAKADAI',           'MULAKADAI',               '07:40', '18:00',  9),
      ('CHLUVAMPALAYAM',      'SILUVAMPALAYAM',          '07:47', '18:05', 11),
      -- kept, not on the sheet (no riders) -- original times
      ('PUTHUPATTI PRIVU',    'PUTHUPATTI PRIVU',        '07:47', '17:45', 12),
      ('KONERIPATTI',         'KONERIPATTI',             '07:52', '18:00', 13),
      -- kept, not on the sheet (3 learners, 27 bookings); 08:58 morning corrected
      ('POOMANIYOOR',         'POOMANIYOOR',             '07:58', '17:30', 14),
      ('UKLIPATTI PRIVU',     'OKLIPATTI PIRIVU',        '07:58', '17:54', 15),
      ('KOOTAIYOOR',          'KOTTAIYUR',               '08:00', '17:52', 16),
      ('NALLAGIYOOR',         'NALANKIYUR',              '08:02', '17:50', 17),
      ('METTUPALAYAM',        'K.METTUPALAYAM 1',        '08:06', '17:46', 18),
      ('KAVERIPATTI -1',      'KAVERI PATTI 1',          '08:10', '17:40', 20),
      ('KAVERIPATTI -2',      'KAVERI PATTI 2',          '08:12', '17:38', 21),
      ('KAVERIPATTI-3',       'KAVERI PATTI 3',          '08:13', '17:37', 22),
      ('VELLALAPALAYAM-1',    'VELALAPALAYAM',           '08:18', '17:30', 25),
      -- kept, not on the sheet (1 learner, 11 bookings) -- original times
      ('VELLALAPALAYAM-2',    'VELLALAPALAYAM-2',        '08:21', '17:10', 27),
      ('PULLAKOUNDAMPATTI',   'PILLAGOUNDAMPATTI',       '08:23', '17:21', 28),
      ('PUDHUR',              'PUTHUR',                  '08:27', '17:16', 29),
      ('PULIYAMPATTI',        'PULIYAMPATTI',            '08:30', '17:12', 30),
      ('BHAVANI PUDHU PALAM', 'BHAVANI PUTHU PAALAM',    '08:35', '17:00', 31),
      ('ANAGAGOOR PRIVU',     'ANANGUR PIRIVU',          '08:40', '16:59', 32),
      ('RAJAM THEATER',       'RAJAM THEATER',           '08:43', '16:55', 33),
      ('COLLEGE',             'COLLEGE',                 '08:55', '16:45', 34)
    ) as v(old_name, new_name, morning, evening, seq)
   where s.route_id = v_route_id
     and s.stop_name = v.old_name;

  insert into tms_route_stop (route_id, sequence_order, stop_name, stop_time, evening_time, is_active)
  select v_route_id, v.seq, v.name, v.morning::time, v.evening::time, true
    from (values
      ( 5, 'POOLAMPATTI POLICE STATION', '07:31', '18:21'),
      ( 6, 'MOOLAPATHAI',                '07:35', '18:16'),
      ( 7, 'KUTTIYAGOUNDANOOR',          '07:37', '18:14'),
      (10, 'KATTUR 2',                   '07:42', '18:09'),
      (19, 'K.METTUPALAYAM 2',           '08:07', '17:44'),
      (23, 'VELALAPALAYAM RICE MILL',    '08:15', '17:34'),
      (24, 'VELALAPALAYAM SCHOOL',       '08:16', '17:32'),
      (26, 'KARUNKALPALAYAM',            '08:19', '17:28')
    ) as v(seq, name, morning, evening)
   where not exists (
     select 1 from tms_route_stop x
      where x.route_id = v_route_id and x.stop_name = v.name
   );

  select count(*) into v_stops from tms_route_stop where route_id = v_route_id;
  if v_stops <> 34 then
    raise exception 'route 07 should have 34 stops after this migration, found %', v_stops;
  end if;
end $$;
