-- Route 34 (KOKKARAYANPETTAI) — re-import the printed timetable: 12 stops -> 23.
--
-- IN-PLACE UPDATE, NEVER DELETE-AND-REINSERT. The 12 existing rows carry 73
-- learners, 4 staff, 422 bookings, 34 attendance rows and 22 fee-rate rows, and
-- the FK delete rules on tms_route_stop make a delete actively destructive:
--   tms_booking.stop_id                  NO ACTION -> the delete just aborts
--   learners_profiles.transport_stop_id  SET NULL  -> silently unassigns riders
--   staff.transport_stop_id              SET NULL  -> same
--   tms_fee_structure_stop_rate.stop_id  CASCADE   -> silent loss of fare rows
-- So a stop that survives is UPDATED in place (keeping its id, and with it every
-- booking, roster entry and stop rate), and a stop that the new timetable drops
-- is DEACTIVATED (is_active = false), not removed.
--
-- Matching is by route_code, not route_number — see the route 11/07 re-imports.

do $$
declare
  v_route_id uuid;
begin
  select id into strict v_route_id
  from tms_route
  where route_code = 'KOKKARAYAN PETTAI NO 34';

  -- ── 1. Retire the 5 stops the new timetable no longer serves ───────────────
  -- Pushed to sequence_order 90+ so they can never interleave with the live
  -- 1..23 in any query that forgets to filter on is_active. Their rows (and
  -- therefore their bookings, attendance and stop rates) are left intact.
  -- Riders still pointing at these need manual reassignment — see the report
  -- alongside this migration.
  update tms_route_stop s
  set is_active = false,
      sequence_order = 90 + s.sequence_order,
      updated_at = now()
  where s.route_id = v_route_id
    and s.stop_name in (
      'KOKKARAYANPETTAI PETROL BUNK',
      'OTTAMETHAI',
      'SANTHE PETTAI',
      'KONAPULIYAM MEDU',
      'M G R MEDU'
    );

  -- ── 2. Repurpose the 7 surviving stops in place ────────────────────────────
  -- JEEVA SET is the same physical stop as the timetable's JEEVA SHAKTHI
  -- (confirmed with the user), so it is RENAMED rather than retired — that keeps
  -- its 12 learners and 30 bookings attached instead of orphaning them.
  update tms_route_stop s
  set stop_name      = v.stop_name,
      sequence_order = v.seq,
      stop_time      = v.stop_time,
      evening_time   = v.evening_time,
      is_active      = true,
      updated_at     = now()
  from (values
    ('KOKKARAYANPETTAI',  1, '07:40'::time, '18:00'::time, 'KOKKARAYANPETTAI'),
    ('S P B COLONY',      7, '08:06'::time, '17:28'::time, 'S P B COLONY'),
    ('JEEVA SET',        10, '08:12'::time, '17:20'::time, 'JEEVA SHAKTHI'),
    ('PALLIPALAYAM',     12, '08:15'::time, '17:17'::time, 'PALLIPALAYAM'),
    ('AGARAHARAM',       14, '08:20'::time, '17:13'::time, 'AGARAHARAM'),
    ('CHILLAN KADU',     17, '08:25'::time, '17:08'::time, 'CHILLAN KADU'),
    ('COLLEGE',          23, '08:55'::time, '16:45'::time, 'COLLEGE')
  ) as v(old_name, seq, stop_time, evening_time, stop_name)
  where s.route_id = v_route_id
    and s.stop_name = v.old_name;

  -- ── 3. Insert the 16 stops the timetable adds ──────────────────────────────
  insert into tms_route_stop
    (route_id, stop_name, sequence_order, stop_time, evening_time, is_major_stop, is_active)
  select v_route_id, v.stop_name, v.seq, v.stop_time, v.evening_time, false, true
  from (values
    ('FOUR ROAD',            2, '07:50'::time, '17:50'::time),
    ('CHAMBER',              3, '07:52'::time, '17:48'::time),
    ('PAPAMPALAYAM',         4, '07:56'::time, '17:45'::time),
    ('ODAPALLI',             5, '08:00'::time, '17:38'::time),
    ('ANJUMETHA',            6, '08:02'::time, '17:33'::time),
    ('KOILANGADU',           8, '08:08'::time, '17:23'::time),
    ('ALAMEDU',              9, '08:10'::time, '17:22'::time),
    ('KAVERI PIRIVU',       11, '08:14'::time, '17:18'::time),
    ('SARAN HOSPITAL',      13, '08:16'::time, '17:16'::time),
    ('JALALAKSHMI THEATRE', 15, '08:21'::time, '17:12'::time),
    ('AVATHIPALAYAM',       16, '08:23'::time, '17:10'::time),
    ('RD OFFICE',           18, '08:26'::time, '17:07'::time),
    ('GANAPATHI PALAYAM',   19, '08:27'::time, '17:06'::time),
    ('RELIANCE SCHOOL',     20, '08:31'::time, '17:00'::time),
    ('SANAPALAYAM',         21, '08:35'::time, '16:54'::time),
    ('SUGA PRIYA HOSPITAL', 22, '08:41'::time, '16:50'::time)
  ) as v(stop_name, seq, stop_time, evening_time)
  -- Idempotent: re-running must not duplicate a stop. There is no unique index
  -- on (route_id, stop_name) to lean on, so guard explicitly.
  where not exists (
    select 1 from tms_route_stop x
    where x.route_id = v_route_id and x.stop_name = v.stop_name
  );

  -- ── 4. Route header: first departure / final arrival ───────────────────────
  -- Already 07:40 / 08:55, but restate so the row matches the timetable even if
  -- an earlier edit moved it.
  update tms_route
  set departure_time = '07:40', arrival_time = '08:55',
      duration = '1h 15m', updated_at = now()
  where id = v_route_id;
end $$;
