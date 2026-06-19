-- TMS becomes a derived mirror of MyJKKN's billing_student_bills:
--   * remove orphaned ledger rows (their money row was already deleted)
--   * add the previously-missing FK with ON DELETE CASCADE, so deleting a bill in
--     MyJKKN auto-removes its ledger row. Staff rows have a NULL link and are untouched.
-- The constraint lives on OUR table; MyJKKN deletes keep working and just clean the ledger.

-- 1) clear orphans (must run before adding the FK — they would violate it)
DELETE FROM tms_fee_bill
WHERE billing_student_bill_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM billing_student_bills b WHERE b.id = tms_fee_bill.billing_student_bill_id
  );

-- 2) index for the cascade lookup + joins
CREATE INDEX IF NOT EXISTS idx_tms_fee_bill_billing_student_bill
  ON tms_fee_bill (billing_student_bill_id);

-- 3) one ledger row per money row (partial so staff NULLs are allowed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tms_fee_bill_billing_student_bill
  ON tms_fee_bill (billing_student_bill_id)
  WHERE billing_student_bill_id IS NOT NULL;

-- 4) the missing link, with cascade
ALTER TABLE tms_fee_bill
  ADD CONSTRAINT tms_fee_bill_billing_student_bill_id_fkey
  FOREIGN KEY (billing_student_bill_id)
  REFERENCES billing_student_bills(id) ON DELETE CASCADE;
