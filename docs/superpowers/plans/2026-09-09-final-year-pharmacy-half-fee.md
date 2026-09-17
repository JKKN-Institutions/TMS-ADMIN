# Final-year Pharmacy learners: half-year transport fee

Date: 2026-09-09
Scope: one-off data change against the live database. No application code changes.

## The rule

A learner whose batch closes inside the first half of the transport year rides
for roughly half the year, so they pay half the annual transport fee.

Transport year 2026-2027 runs 2026-06-01 to 2027-05-31. The BPHARM 2022-2026
batch closes 2026-10-31, five months in. Those learners pay 50 percent.

Decisions taken on 2026-09-09:

- One-off, applied to the current transport year only. No generator rule.
- Flat 50 percent, not a month-by-month proration.
- Learners with a paid bill are excluded. Refunds are a human decision.
- Pharmacy only. Other colleges are out of scope for this change.

## The cohort

Filter, all conditions required:

- `learners_profiles.institution_id` = `5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334` (JKKN College of Pharmacy)
- `learners_profiles.program_id` = `0d980d34-f945-4de6-8c88-ee97b2620b99` (BPHARM)
- `learners_profiles.lifecycle_status` = `active`
- `learners_profiles.bus_required` = true
- joined `semesters.terminal_semester` = true (Semester VIII)
- joined `batches.end_date` = 2026-10-31 (batch 2022-2026)

This returns 25 learners. One of them, KAMALESH (PB22033), has already paid the
full Rs 5,500 across two bills and is excluded, leaving 24 to reprice.

| | Learners | Amount |
|---|---|---|
| Before | 24 | Rs 132,000 |
| After | 24 | Rs 66,000 |
| Reduction | | Rs 66,000 |

Each of the 24 holds exactly one unpaid bill: `tms_fee_bill` term 1, Rs 5,500,
status `generated`, due 2026-07-31, linked to a `billing_student_bills` row with
`final_amount` and `balance_amount` both 5,500 and status `unpaid`.

## Why an override row is mandatory, not optional

Cron job 23 (`tms-auto-generate-bills`) runs every two minutes. The generator
reads its idempotency key from `tms_fee_bill`, so a bill whose amount was merely
edited is still considered raised and will not be recreated. But if anything
later deletes or regenerates these bills, only a `tms_fee_override` row makes the
Rs 2,750 price durable. `lib/fees/overrides.ts` applies the override after the
flat fee mode produces its term, so the structure and the other 213 Pharmacy
riders are untouched.

Write the override rows before repricing, in the same transaction, matching the
pattern established for the 7.5 percent scholarship cohort.

## Both ledgers must move

`tms_fee_bill` is the transport ledger. `billing_student_bills` is the money row
and the authority for what a learner sees and pays. Repricing only one leaves
drift, which is exactly the defect recorded for the 7.5 percent cohort.

On `billing_student_bills`, set `final_amount`, `total_amount` and `unit_amount`
to 2,750. Do not set `balance_amount` or `status` by hand. The BEFORE UPDATE
trigger `update_bill_balance_on_amount_change` recomputes both from actual
receipts, which is more correct than anything written by hand and is what keeps a
partially paid bill honest.

## Steps

1. **Back up.** `create table tms_final_year_pharmacy_halffee_backup_20260909 as
   select ...` capturing, for all 25 learners, the current `tms_fee_bill` and
   `billing_student_bills` rows in full. This is the undo path.
2. **Confirm the count is 24.** Run the cohort query with the paid-bill exclusion
   and assert it returns 24 rows summing to Rs 132,000. Abort if not.
3. **Insert 24 override rows** into `tms_fee_override`: `person_type` `learner`,
   `transport_year_id` `6b3768f9-c9fb-48d5-a955-41949983c3b0`, `term_no` 1,
   `billable` true, `amount` 2750, with a reason naming the learner, the batch
   and the date. `on conflict (person_id, transport_year_id, term_no) do nothing`.
4. **Update `billing_student_bills`** for the 24 linked money rows to 2,750,
   guarded by `status = 'unpaid' and payment_date is null and balance_amount =
   final_amount` and no rows in `billing_receipt_items` or
   `payment_transaction_items`. These guards are what make the operation safe to
   re-run and impossible to apply to money that has moved.
5. **Update `tms_fee_bill.amount`** to 2,750 for the same 24, guarded by
   `status = 'generated' and paid_amount is null`.
6. **Commit the migration file** under `supabase/migrations/` with the reasoning
   and the revert instructions in the header comment, matching the house style of
   the existing override migrations.

## Verification

- The 24 learners each show one bill of Rs 2,750, unpaid, balance 2,750.
- KAMALESH (PB22033) still shows Rs 5,500 paid, balance zero, untouched.
- The other 213 Pharmacy riders still show Rs 5,500.
- Total Pharmacy transport billing for 2026-2027 drops by exactly Rs 66,000.
- Wait one cron cycle, then re-check that no term 1 bill has returned to 5,500
  and no second bill has appeared.
- Open one of the 24 learners in the admin fees screen and in the student portal
  and confirm both read Rs 2,750. The portal read needs the user's browser,
  because the agent's session is unauthenticated.

## Open items, deliberately not in this change

- **The paid learner.** KAMALESH paid Rs 5,500. If the office decides he is owed
  Rs 2,750 back, that is a refund through the billing module, not a bill edit.
- **Next year.** Nothing here is automatic. When the 2023-2028 BPHARM batch
  reaches its terminal semester, someone must remember to repeat this. The
  durable fix is a rule in the fee generator keyed on batch end date.
- **No override UI.** Every override in the database was written by hand in SQL.
  The office cannot do this without an engineer.
- **Batch data quality.** Some `batches` rows carry impossible end dates, for
  example a 2024-2030 batch ending 2026-05-30. This change avoids the problem by
  pinning the exact batch, but any future rule that trusts `end_date` broadly
  will need those rows cleaned first.
