-- Fine rate for the new route-49 stop BOODINAYAKKAN PATTI, 2026-2027.
-- Matches the route convention: fine = full annual fee (Rs 13,400).
-- tms_fine_stop_rate is a ledger separate from tms_fee_structure_stop_rate by design.

INSERT INTO tms_fine_stop_rate (id, transport_year_id, stop_id, fine_amount)
SELECT gen_random_uuid(), y.id, s.id, 13400
FROM tms_route_stop s
JOIN tms_transport_year y ON y.is_current = true
WHERE s.route_id = '87217217-1cea-408b-a786-941778bf54ef'
  AND s.stop_name = 'BOODINAYAKKAN PATTI'
ON CONFLICT (transport_year_id, stop_id)
DO UPDATE SET fine_amount = EXCLUDED.fine_amount, updated_at = now();
