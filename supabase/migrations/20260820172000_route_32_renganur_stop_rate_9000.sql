-- RENGANUR (route 32 SANKAGIRI RS, sequence 12) was added from the printed
-- timetable with no fee, which would make any learner placed there unbillable
-- (`no_stop_rate` → silently skipped by generation). Prices it at ₹9,000.
--
-- Written to BOTH stop_wise sheets: the Aided and Staff rate sheets are
-- maintained as identical price lists, and a stop priced on only one of them
-- leaves the other audience unbillable at that stop — which, for staff, also
-- blocks in-charge removal billing with a misleading reason code.
insert into public.tms_fee_structure_stop_rate (fee_structure_id, stop_id, annual_amount)
values
  ('9f8f5153-d45a-4fbf-85f2-c399292c201b', '0e63c86c-2adb-4f94-921f-37d431c2d582', 9000),  -- Arts Aided
  ('1cff2da9-565b-4618-9c21-68fb66c52aad', '0e63c86c-2adb-4f94-921f-37d431c2d582', 9000)   -- Staff (All Colleges)
on conflict (fee_structure_id, stop_id) do update
  set annual_amount = excluded.annual_amount,
      updated_at = now();
