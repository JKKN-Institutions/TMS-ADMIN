-- Route 10 (EADAPPADI) was missing from tms_route entirely: the original import
-- loaded only 24 of the numbered routes, so route 10 never existed and therefore
-- never appeared in the Routes module, the booking pickers, or attendance.
--
-- NOT to be confused with the two other EADAPPADI buses already present:
--   route 40 "EADAPPADI"              (24 stops, starts NESAVALAR COLONY, arrives 08:52)
--   route 12 "EADAPPADI (KONGANAPURM)"(starts EADAPPADI)
-- Route 10 is a distinct bus: it starts one stop earlier at CHINNAMUTHUR RING
-- ROAD, arrives 08:30, and returns via KANIYALAM PATTI → SSM MILL → BHAVANI
-- PUTHU PAALAM → KPM BS, which neither of the others serves.
--
-- Operational columns follow the convention of every other imported route
-- (distance 0, total_capacity 0, fare 0) — the source timetable carries no
-- distance, seat count or fare, and inventing them would put fake numbers on a
-- money-bearing record. Set them from the real bus records when known.
--
-- Stop names and times are transcribed EXACTLY as supplied, with two documented
-- exceptions:
--   * S.No 3 HOUSING BOORD evening read "5-052 PM" → recorded as 17:52.
--   * S.No 5 had a blank name (7-41 AM) immediately above an unnumbered
--     "EADAPPDI BS" (7-42 AM); confirmed as one stop and merged, keeping 07:42.
-- The two unnumbered rows in the source (EADAPPADI BS, PALAKARANKADDU) are real
-- stops and are included, giving 36 stops.
--
-- Idempotent: re-running is a no-op once route 10 exists.

do $$
declare
  v_route_id uuid;
begin
  if exists (select 1 from tms_route where route_number = '10') then
    raise notice 'route 10 already exists — skipping';
    return;
  end if;

  insert into tms_route (
    route_number, route_name, route_code,
    start_location, end_location,
    departure_time, arrival_time,
    distance, duration, total_capacity, current_passengers, fare, status
  ) values (
    '10', 'EADAPPADI', 'EADAPPADI NO 10',
    'CHINNAMUTHUR RING ROAD', 'COLLEGE',
    '07:30', '08:30',
    0, '1h 0m', 0, 0, 0, 'active'
  )
  returning id into v_route_id;

  insert into tms_route_stop (route_id, sequence_order, stop_name, stop_time, evening_time, is_active)
  values
    (v_route_id,  1, 'CHINNAMUTHUR RING ROAD', '07:30', '18:00', true),
    (v_route_id,  2, 'NESAVALAR COLONY',       '07:36', '17:54', true),
    (v_route_id,  3, 'HOUSING BOORD',          '07:38', '17:52', true),
    (v_route_id,  4, 'KAALIYAMMAN KOVIL',      '07:40', '17:50', true),
    (v_route_id,  5, 'EADAPPADI BS',           '07:42', '17:45', true),
    (v_route_id,  6, 'METTU THERU',            '07:44', '17:44', true),
    (v_route_id,  7, 'ATC DIPO',               '07:46', '17:39', true),
    (v_route_id,  8, 'PARAKATU MEDU',          '07:47', '17:38', true),
    (v_route_id,  9, 'ALACHAMPALAYUAM',        '07:50', '17:37', true),
    (v_route_id, 10, 'RING ROAD',              '07:51', '17:35', true),
    (v_route_id, 11, 'KUMJAMPALAYAM',          '07:53', '17:33', true),
    (v_route_id, 12, 'MOOLAPATHAI',            '07:54', '17:32', true),
    (v_route_id, 13, 'BHARATHI NAGAR',         '07:55', '17:30', true),
    (v_route_id, 14, 'KULAMPATTI',             '07:58', '17:29', true),
    (v_route_id, 15, 'KULLAMPATTI GH',         '07:58', '17:28', true),
    (v_route_id, 16, 'PALAKARANKADDU',         '07:59', '17:26', true),
    (v_route_id, 17, 'CHETTIPATTI SANTHAI',    '08:00', '17:27', true),
    (v_route_id, 18, 'CHETTIPATTI',            '08:01', '17:25', true),
    (v_route_id, 19, 'CHETTIPATTI PALAM',      '08:03', '17:23', true),
    (v_route_id, 20, 'ODASAKARAI',             '08:04', '17:22', true),
    (v_route_id, 21, 'KONAKALATHANUR',         '08:05', '17:21', true),
    (v_route_id, 22, 'MYLAMPATTI',             '08:06', '17:20', true),
    (v_route_id, 23, 'THEVUR',                 '08:09', '17:17', true),
    (v_route_id, 24, 'PUTHUPALAYAM',           '08:11', '17:14', true),
    (v_route_id, 25, 'KANIYALAM PATTI',        '08:14', '17:13', true),
    (v_route_id, 26, 'ANNMAR KOVIL',           '08:15', '17:12', true),
    (v_route_id, 27, 'EARITHOTTAM',            '08:16', '17:11', true),
    (v_route_id, 28, 'PULLAGOUNDAMPATTI',      '08:17', '17:10', true),
    (v_route_id, 29, 'PUTHUR',                 '08:18', '17:09', true),
    (v_route_id, 30, 'RAMAKOODAL',             '08:19', '17:08', true),
    (v_route_id, 31, 'SEERAGAGOUNDAMPALAYAM',  '08:20', '17:05', true),
    (v_route_id, 32, 'PANJAYATHU OFFICE',      '08:21', '17:04', true),
    (v_route_id, 33, 'SSM MILL',               '08:22', '17:01', true),
    (v_route_id, 34, 'BHAVANI PUTHU PAALAM',   '08:25', '17:00', true),
    (v_route_id, 35, 'KPM BS',                 '08:27', '16:58', true),
    (v_route_id, 36, 'COLLEGE',                '08:30', '16:45', true);
end $$;
