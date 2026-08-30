-- Price the new route-49 stop BOODINAYAKKAN PATTI at Rs 13,400/year.
-- Both active 2026-2027 stop_wise structures get the rate, matching the pattern on
-- every other stop of this route (student + staff carry identical amounts).
-- Fine ledger (tms_fine_stop_rate) intentionally untouched.

INSERT INTO tms_fee_structure_stop_rate (id, fee_structure_id, stop_id, annual_amount)
SELECT gen_random_uuid(), fs.id, s.id, 13400
FROM tms_route_stop s
CROSS JOIN (VALUES
  ('9f8f5153-d45a-4fbf-85f2-c399292c201b'::uuid), -- Transport Fees 2026-2027 (Arts Aided), student
  ('1cff2da9-565b-4618-9c21-68fb66c52aad'::uuid)  -- Transport Fees 2026-2027 (Staff - All Colleges)
) AS fs(id)
WHERE s.route_id = '87217217-1cea-408b-a786-941778bf54ef'
  AND s.stop_name = 'BOODINAYAKKAN PATTI'
ON CONFLICT (fee_structure_id, stop_id)
DO UPDATE SET annual_amount = EXCLUDED.annual_amount, updated_at = now();
