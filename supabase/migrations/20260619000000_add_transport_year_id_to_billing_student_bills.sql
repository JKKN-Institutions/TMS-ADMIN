-- Add a transport-year link to the shared bills table so transport-fee bills can be
-- aggregated transport-year-wise (mirrors the existing hostel_year_id -> hostel_years
-- pattern). Nullable + additive: other apps are unaffected; only the TMS generator
-- populates it (for Transport Fee bills).
ALTER TABLE billing_student_bills
  ADD COLUMN IF NOT EXISTS transport_year_id uuid
  REFERENCES tms_transport_year(id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_transport_year
  ON billing_student_bills (transport_year_id);
