-- Route 32 SANKAGIRI RS (MODAMANGALAM) — printed timetable 2026-08-20, part 2.
--
-- 1. Adds the 7 stops that appear on the printed sheet but exist nowhere in the
--    system. Verified absent across ALL routes before inserting, so these are
--    genuine new stops, not duplicates of a differently-spelled row.
-- 2. Renumbers the 19 printed stops into the printed running order.
-- 3. PARKS the 9 stops that are absent from the printed sheet at sequence 901+,
--    leaving them active and fully assigned. They are NOT deleted and NOT
--    deactivated: six of them still carry 6 learners and 2 staff between them,
--    and retiring a stop out from under a rider strands them. Parking keeps the
--    timetable readable while the removal decision is still open.
--    (Route 34 already uses this high-sequence convention for off-timetable stops.)
--
-- The positional evidence says these really are additions + removals rather than
-- renames: every dropped stop sits in the EARLY half of the route where the
-- printed sheet introduces no new names, and the new names cluster in the LATE
-- half where nothing is dropped. A rename pairing would line up; these do not.
--
-- KNOWN HOLE left by this migration: the 7 new stops have NO fee rate on either
-- stop_wise structure, so any learner assigned to one resolves `no_stop_rate`
-- and is silently skipped by bill generation. Price them before assigning anyone.

-- 1. New stops.
insert into public.tms_route_stop (route_id, stop_name, sequence_order, stop_time, evening_time)
values
  ('3fbf49ab-67eb-4d92-9688-8d87ee39cc5e', 'NAGISETTIPATTI',      1,  '07:30', '18:30'),
  ('3fbf49ab-67eb-4d92-9688-8d87ee39cc5e', 'CHETTIYAR KADAI',     9,  '08:20', '17:40'),
  ('3fbf49ab-67eb-4d92-9688-8d87ee39cc5e', 'VEPPADAI',            10, '08:28', '17:30'),
  ('3fbf49ab-67eb-4d92-9688-8d87ee39cc5e', 'ELANTHAKUTTAI PIRIVU',11, '08:32', '17:20'),
  ('3fbf49ab-67eb-4d92-9688-8d87ee39cc5e', 'RENGANUR',            12, '08:36', '17:15'),
  ('3fbf49ab-67eb-4d92-9688-8d87ee39cc5e', 'VAYKKALMEDU',         14, '08:45', '17:00'),
  ('3fbf49ab-67eb-4d92-9688-8d87ee39cc5e', 'ALAMPALAM',           17, '08:53', '16:52');

-- 2. Printed running order for the stops that are on the sheet.
update public.tms_route_stop as rs
   set sequence_order = v.seq, updated_at = now()
  from (values
    ('84d9b689-e255-4cd1-86d2-f451b8873034', 2),   -- SANKAGIRI RS
    ('733ef726-2828-4463-8cd5-b194ec28e42e', 3),   -- NAARAPPAN SAAVADI
    ('f2a7346d-c13f-48de-b981-5d0f7e18bad9', 4),   -- MERUR / MORUR
    ('bf6c0ae8-f409-4580-91e4-a1fcf9c8ac82', 5),   -- VEENGIPALAYAM
    ('9e653d0f-b166-4ff5-9448-bc5e1d9f0245', 6),   -- THANEERPANTHAL PALAYAM
    ('7e4941df-9ed4-4b7c-b3c7-4ef4ba55a443', 7),   -- MOODAMANGALAM
    ('773e6355-df00-4098-adfd-b2024b8a7fc5', 8),   -- VAALRAJA PALAYAM
    ('04f76714-5de0-4db3-a3f1-bb8a43c905ee', 13),  -- MEETTUKADAI
    ('786f8d8b-37b5-4bc9-8d71-e48c97d9e9f0', 15),  -- KALLAN KATTU VALAVU
    ('04375be1-8645-4f5f-aa63-3ac44a5d20a1', 16),  -- VINAGAR KOVIL
    ('a493bd06-8ddd-499d-be95-e49719441818', 18),  -- KOOTTAI MEDU
    ('4aa0b32d-b8f2-4051-815e-6499d74a0532', 19)   -- COLLEGE
  ) as v(stop_id, seq)
 where rs.id = v.stop_id::uuid
   and rs.route_id = '3fbf49ab-67eb-4d92-9688-8d87ee39cc5e';

-- 3. Park the off-timetable stops. Still active, still assigned, nothing lost.
update public.tms_route_stop as rs
   set sequence_order = v.seq, updated_at = now()
  from (values
    ('82a6b7da-12fb-45f3-8d58-9a2cb02411c8', 901), -- PULLI PALAYAM      (0 riders)
    ('6536f36a-1d90-4131-b4e0-2cd9cf495af9', 902), -- PAALMADAI          (1 learner)
    ('b2d3006e-fda6-4248-a298-e4789dc3eaa6', 903), -- MAYELEARI PATTI    (2 learners, 1 staff)
    ('0cd18c67-0123-4b5d-890a-e5029da9021c', 904), -- KAATTAM PALAYAM    (0 riders)
    ('6775fa16-690b-4898-9f58-87656c389ecc', 905), -- MANDAPAM 1 STOP    (0 riders)
    ('16435a89-ab70-45b6-826a-6d84ccfa8885', 906), -- MANDAPAM 2 STOP    (0 riders)
    ('684bf0ad-f04b-4301-9070-cafeda2aaa54', 907), -- VAANI SCHOOL       (1 learner)
    ('52bb04b4-579b-4c40-a267-f68a694e2ca8', 908), -- FON COLLEGE        (1 learner)
    ('0c0dd548-f286-4086-8f4f-3b24638dc48f', 909)  -- KAVADIYAN KADU     (1 learner, 1 staff)
  ) as v(stop_id, seq)
 where rs.id = v.stop_id::uuid
   and rs.route_id = '3fbf49ab-67eb-4d92-9688-8d87ee39cc5e';
