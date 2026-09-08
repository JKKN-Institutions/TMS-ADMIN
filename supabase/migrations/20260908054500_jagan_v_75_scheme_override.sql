-- JAGAN V (EC23012, jaganvece2023@jkkn.ac.in) is a 7.5%-scheme learner: the
-- annual transport fee is a flat Rs 500, already PAID under Term 1 on
-- 2026-08-25. Applied to the live DB on 2026-09-08; recorded here so it is
-- auditable, and so the fix is reproducible on any other environment.
--
-- Complaint: "I deleted the Term 2 bill and it automatically came back."
--
-- Same root cause as 20260907113000_dhanushka_sri_75_scheme_override.sql, and
-- the same cohort: a delete records no DECISION. lib/fees/generate.ts reads its
-- idempotency key from tms_fee_bill alone, and cron job 23
-- (tms-auto-generate-bills) runs EVERY 2 MINUTES on a '*/2 * * * *' schedule, so
-- a deleted term simply looks like a term still to raise. Only a
-- tms_fee_override with billable = false durably suppresses it --
-- lib/fees/overrides.ts:applyOverrides iterates the resolved TERMS and skips any
-- term whose override is non-billable.
--
-- This learner was one of the 9 the earlier batch missed. He is listed by name in
-- that migration's cohort analysis as still carrying a wrong Rs 2,500 Term 2.
--
-- DIFFERENCE FROM THE DHANUSHKA CASE: no bill delete is performed here. By the
-- time this was applied the Term 2 rows were already gone from BOTH planes --
-- no tms_fee_bill row for term 2, and no orphaned billing_student_bills row
-- (checked separately, because a money row with no ledger row still renders in
-- the learner portal). The admin's delete had landed; what it lacked was the
-- override that stops the cron re-raising it. So this migration is the override
-- alone, and it is the load-bearing half.
--
-- Nor is the Term 1 amount drift present: this learner's tms_fee_bill.amount
-- already reads 500, not the cohort's stale 3,000. Nothing to reconcile.
--
-- VERIFIED after applying: cron job 23 fired twice with status 'succeeded'
-- strictly after the override was written, and Term 2 did not return. Note that
-- an absent tms_fee_generation_run row does NOT prove the cron ran, since those
-- rows are only written when something happens -- cron.job_run_details is the
-- authority. tms_student_transport_access now returns allowed = true,
-- total_owed = 0, with a single paid Rs 500 term.
--
-- Revert: delete the two override rows below. Term 2 will then be re-raised
-- automatically by the cron within two minutes, at the structure amount.

insert into tms_fee_override (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
values
  ('7dbed24a-6d8c-4ef3-950a-24fcaa293f82', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true,  500,
   '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (JAGAN V, EC23012) - 2026-09-08'),
  ('7dbed24a-6d8c-4ef3-950a-24fcaa293f82', 'learner', '6b3768f9-c9fb-48d5-a955-41949983c3b0', 2, false, null,
   '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (JAGAN V, EC23012) - 2026-09-08')
on conflict do nothing;
