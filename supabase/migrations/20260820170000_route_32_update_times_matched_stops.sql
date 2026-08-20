-- Route 32 SANKAGIRI RS (MODAMANGALAM) — printed timetable 2026-08-20.
--
-- Applies the new morning/evening times to the TWELVE stops that appear on both
-- the printed sheet and the current route. Stop membership, sequence order,
-- renames and deletions are deliberately NOT touched here: 9 existing stops are
-- absent from the printed sheet and 6 of them carry riders/staff, and several
-- may be renames of the 7 new printed names rather than genuine removals.
-- Resolving that wrongly would either strand passengers or duplicate stops.
--
-- Deleting a route stop is unsafe on this schema anyway: bookings RESTRICT the
-- delete and fee rates CASCADE away silently. Any removal must repurpose the row
-- in place instead.
update public.tms_route_stop as rs
   set stop_time = v.morning::time,
       evening_time = v.evening::time
  from (values
    ('84d9b689-e255-4cd1-86d2-f451b8873034', '07:35', '18:15'),  -- SANKAGIRI RS
    ('733ef726-2828-4463-8cd5-b194ec28e42e', '07:40', '18:10'),  -- NAARAPPAN SAAVADI
    ('f2a7346d-c13f-48de-b981-5d0f7e18bad9', '07:45', '18:05'),  -- MERUR (printed "MORUR")
    ('bf6c0ae8-f409-4580-91e4-a1fcf9c8ac82', '07:50', '18:00'),  -- VEENGIPALAYAM
    ('9e653d0f-b166-4ff5-9448-bc5e1d9f0245', '07:57', '17:55'),  -- THANEERPANTHAL PALAYAM
    ('7e4941df-9ed4-4b7c-b3c7-4ef4ba55a443', '08:05', '17:50'),  -- MOODAMANGALAM
    ('773e6355-df00-4098-adfd-b2024b8a7fc5', '08:15', '17:45'),  -- VAALRAJA PALAYAM
    ('04f76714-5de0-4db3-a3f1-bb8a43c905ee', '08:40', '17:10'),  -- MEETTUKADAI
    ('786f8d8b-37b5-4bc9-8d71-e48c97d9e9f0', '08:47', '16:58'),  -- KALLAN KATTU VALAVU
    ('04375be1-8645-4f5f-aa63-3ac44a5d20a1', '08:52', '16:53'),  -- VINAGAR KOVIL
    ('a493bd06-8ddd-499d-be95-e49719441818', '08:55', '16:50'),  -- KOOTTAI MEDU
    ('4aa0b32d-b8f2-4051-815e-6499d74a0532', '09:00', '16:45')   -- COLLEGE
  ) as v(stop_id, morning, evening)
 where rs.id = v.stop_id::uuid
   and rs.route_id = '3fbf49ab-67eb-4d92-9688-8d87ee39cc5e';
