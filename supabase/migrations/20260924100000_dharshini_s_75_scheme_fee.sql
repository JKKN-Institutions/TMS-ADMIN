-- DHARSHINI S (dharshinis26engg@jkkn.ac.in, learner 6fa3c6bb-4526-4f26-9cc8-555c7047cbb4)
-- is a 7.5% scheme learner: transport fee is a flat Rs 500/year.
-- Her learners_profiles.scholarship_type reads 'FIRST GRADUATE', so the
-- Fee Concession tab does not list her; applied through the same RPC instead.
-- Before: one unpaid single-term bill at Rs 5,500 (no receipts, no payment attempts).
-- After:  override pair (term 1 Rs 500, term 2 not billable) + bill repriced to Rs 500.
-- APPLIED 2026-09-24 via execute_sql; before/after snapshot is in tms_fee_concession_log.

select public.tms_apply_fee_concession(
  '6fa3c6bb-4526-4f26-9cc8-555c7047cbb4'::uuid,
  '4834ff4b-3151-4525-9500-084011fcc4ce'::uuid,  -- scheme_75 rule, 2026-2027, Rs 500
  '[{"term_no":1,"billable":true,"amount":500},{"term_no":2,"billable":false,"amount":null}]'::jsonb,
  '[{"fee_bill_id":"58c359f9-9c34-4460-9aff-96464e00aa45","target":500}]'::jsonb,
  '7.5% SCHOLARSHIP - 7.5% scholarship - Rs 500 per year - (DHARSHINI S, no roll) - 2026-09-24',
  null
);
