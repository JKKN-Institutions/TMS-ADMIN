-- Reprice the 15 unpaid Arts Aided transport bills whose stop rate was corrected
-- by 20260821000000_correct_stop_rates_from_sheet.sql.
--
-- Each student's total is set to their stop's new annual rate, split across their
-- existing term bills in the SAME proportion they were originally issued (6 students
-- hold two half bills, 3 hold a single full bill). Any rounding residual lands on the
-- first bill so the per-student total lands exactly on the rate.
--
-- Only status='unpaid' rows with zero collection are touched; paid bills are left alone.
-- Pre-image snapshot: billing_student_bills_backup_20260821.
-- Verified: 15 bills repriced, 9 students, net -31,050; all 24 Aided students now
-- bill exactly their stop rate.
WITH changed AS (
  SELECT sr.stop_id, sr.annual_amount AS new_rate
    FROM tms_fee_structure_stop_rate sr
    JOIN tms_fee_structure_stop_rate_backup_20260821 b ON b.id = sr.id
   WHERE sr.fee_structure_id = '9f8f5153-d45a-4fbf-85f2-c399292c201b'
     AND b.annual_amount IS DISTINCT FROM sr.annual_amount
),
targets AS (
  SELECT bb.id, bb.student_id, bb.final_amount, c.new_rate,
         SUM(bb.final_amount) OVER (PARTITION BY bb.student_id) AS student_total,
         ROW_NUMBER()        OVER (PARTITION BY bb.student_id ORDER BY bb.bill_description, bb.id) AS rn
    FROM billing_student_bills bb
    JOIN learners_profiles lp ON lp.id = bb.student_id
    JOIN changed c            ON c.stop_id = lp.transport_stop_id
   WHERE bb.transport_year_id IS NOT NULL
     AND bb.institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127'
     AND bb.status = 'unpaid'
     AND bb.balance_amount = bb.final_amount   -- nothing collected yet
),
alloc AS (
  SELECT id, student_id, rn, new_rate,
         ROUND(new_rate * final_amount / student_total, 2) AS raw_new,
         SUM(ROUND(new_rate * final_amount / student_total, 2))
             OVER (PARTITION BY student_id) AS sum_new
    FROM targets
),
final AS (
  SELECT id, raw_new + CASE WHEN rn = 1 THEN (new_rate - sum_new) ELSE 0 END AS amt
    FROM alloc
)
UPDATE billing_student_bills b
   SET unit_amount    = f.amt,
       total_amount   = f.amt,
       final_amount   = f.amt,
       balance_amount = f.amt,
       remarks        = COALESCE(b.remarks || ' | ', '')
                        || 'Repriced 2026-08-21 to corrected stop rate',
       updated_at     = now()
  FROM final f
 WHERE b.id = f.id;

-- ROLLBACK:
-- UPDATE billing_student_bills b
--    SET unit_amount = o.unit_amount, total_amount = o.total_amount,
--        final_amount = o.final_amount, balance_amount = o.balance_amount,
--        remarks = o.remarks
--   FROM billing_student_bills_backup_20260821 o
--  WHERE o.id = b.id AND o.final_amount IS DISTINCT FROM b.final_amount;
