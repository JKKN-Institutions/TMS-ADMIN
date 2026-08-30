-- Route 12 "EADAPPADI (KONGANAPURM)" stop re-import from the 2026-08-28 sheet (24 stops).
-- Survivors are UPDATEd in place so bookings / attendance / fee + fine rates / rider
-- assignments (learners_profiles.transport_stop_id, staff.transport_stop_id) are preserved.
-- Dropped stops are retired (is_active=false, sequence_order 90+), never DELETEd:
-- tms_booking.stop_id is ON DELETE NO ACTION and the rider FKs are ON DELETE SET NULL.

BEGIN;

-- 1. Retire the 7 stops absent from the new sheet (done BEFORE renumbering).
UPDATE tms_route_stop SET is_active = false, sequence_order = 90 + sequence_order, updated_at = now()
WHERE route_id = '6f02646f-2474-416f-bc7c-ce342c4e2309'
  AND id IN (
    'a1514db0-bebe-4e27-b270-8ed8828c360f', -- GEATU KADAI
    '35042c92-8697-4b87-80d3-0c6c06ad9eec', -- RETTIPATTI
    '22bca8e5-e4b8-4ea6-8e49-26ebd20a51ef', -- A G N SCHOOL
    'c4dba807-e728-46f3-ab1e-81242d7ba5f4', -- KARUNKARADU
    '5fe2cc76-0e9f-4730-becf-2c8cc3a29af5', -- AMMAN KATTUR      (1 learner to reassign)
    '5c375a1a-bceb-4445-a4d7-096f68b7b5a6', -- CHINTHAMANI THOTTAM
    '9397f1e7-d42f-4d0f-96d7-8e4163585a50'  -- PACHAMPALAYAM     (2 staff to reassign)
  );

-- 2. Rename / retime / renumber the 22 survivors.
UPDATE tms_route_stop AS s
SET stop_name       = v.stop_name,
    stop_time       = v.stop_time::time,
    evening_time    = v.evening_time::time,
    sequence_order  = v.seq,
    is_active       = true,
    updated_at      = now()
FROM (VALUES
  ('4528ed28-90fb-418c-b3b7-8aa09e88b912','EADAPPADI',                 '07:35','18:00', 1),
  ('fdfce75a-adcb-4d99-b28f-8ce02919d743','EADAPPADI BOYS HR SCHOOL',  '07:40','17:55', 2),
  ('1ae68b53-bd60-41ac-9b89-c5156156c8d2','SAKTHI THEATER',            '07:42','17:53', 3),
  ('6bbee9b0-d768-45c8-b785-fb6f55d9124f','VELLANDI VALASU',           '07:45','17:50', 4),
  ('b24ad27a-3009-492b-9d25-6829f98ff10e','MOORIVALAVU',               '07:52','17:43', 6),
  ('6b3cbe01-3841-4c5b-8214-aceb1346909a','RANGAMPALAYAM',             '07:55','17:40', 7),
  ('f0e90756-6a81-46d1-b793-502f982dcab9','KONGANAPURAM',              '07:58','17:37', 8),
  ('55d46c5b-75c7-4799-91cf-f18f3088d91f','KONGANAPURAM SCHOOL',       '08:01','17:35', 9),
  ('c0c73030-933d-4f0f-8e33-8484a0a1efa0','KONGANAPURAM HP BUNK',      '08:03','17:33',10),
  ('fd1c8985-9ccb-41e9-bd6d-6bcc93570236','VETTUKAADU',                '08:05','17:30',11),
  ('a06c536a-9126-460d-af9c-0c8c4787d6c8','THANGAYUR',                 '08:07','17:27',12),
  ('ce9a3d09-248d-4339-a9ce-fa1c50270d08','VARATHANATTA NALLUR',       '08:10','17:26',13),
  ('607d1939-c355-4f09-adb4-3ab56689abee','ORUKKAMALAI',               '08:11','17:25',14),
  ('8fb638d1-ae64-450e-9993-88b6fcda8933','CHEMICAL PIRIVU',           '08:15','17:22',15),
  ('b6220847-92a4-42b6-85fb-c5028e44d0a0','SANKAGRI NEW BUS STAND',    '08:17','17:19',16),
  ('61bbac6b-85f7-4bdc-aa99-808141547801','V.N PALAYAM',               '08:20','17:16',17),
  ('71f0aad7-e541-40d3-bc07-582589d50778','SANKAGRI OLD BUS STAND',    '08:25','17:15',18),
  ('9215a3d6-40f1-4995-a5f5-b15291494212','ERODE PIRIVU',              '08:30','17:10',20),
  ('aac51619-9f35-4f39-a65c-8d5623a4e1bb','POST OFFICE',               '08:33','17:07',21),
  ('38417c47-211e-4607-a7b7-3b27e7150db2','I C L',                     '08:35','17:04',22),
  ('57c9c15b-07cc-42cc-84cc-a9368676886e','GOUNDANUR',                 '08:37','17:03',23),
  ('cca9ab0c-ae16-402a-80cd-53d72644a190','COLLEGE',                   '08:50','16:45',24)
) AS v(id, stop_name, stop_time, evening_time, seq)
WHERE s.id = v.id::uuid
  AND s.route_id = '6f02646f-2474-416f-bc7c-ce342c4e2309';

-- 3. Insert the 2 genuinely new stops. Both start UNPRICED in
--    tms_fee_structure_stop_rate and tms_fine_stop_rate.
INSERT INTO tms_route_stop (id, route_id, stop_name, stop_time, evening_time, sequence_order, is_major_stop, is_active)
SELECT gen_random_uuid(),'6f02646f-2474-416f-bc7c-ce342c4e2309', v.stop_name, v.stop_time::time, v.evening_time::time, v.seq, false, true
FROM (VALUES
  ('KURUMPATTI SCHOOL','07:48','17:47', 5),
  ('PACHAKADU',        '08:27','17:13',19)
) AS v(stop_name, stop_time, evening_time, seq)
WHERE NOT EXISTS (
  SELECT 1 FROM tms_route_stop x
  WHERE x.route_id = '6f02646f-2474-416f-bc7c-ce342c4e2309' AND x.stop_name = v.stop_name
);

-- 4. Route header now ends at COLLEGE 08:50 (was 08:55).
UPDATE tms_route SET arrival_time = '08:50', departure_time = '07:35', updated_at = now()
WHERE id = '6f02646f-2474-416f-bc7c-ce342c4e2309';

COMMIT;
