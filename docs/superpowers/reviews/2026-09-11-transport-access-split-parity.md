# Parity review: splitting `tms_student_transport_access`

Date: 2026-09-11
Migration: `supabase/migrations/20260911110000_transport_access_by_learner.sql`

The money logic moved, unmodified, out of `tms_student_transport_access(uuid)` and into a new
learner-keyed core `tms_transport_access_for_learner(uuid)`. The old function survives as a thin
wrapper that resolves an account to a learner and delegates. No policy changed, so no learner's
verdict may change. This file is the evidence.

## Method

Three checks, in increasing strength.

1. **Textual.** The transplanted region (from `select id, name into v_year_id ...` through the
   closing `coalesce(v_t1_balance, 0));`) was hashed on both sides. The live pre-change body, with
   `v_learner_id` textually replaced by `p_learner_id`, and the migration file's core body are both
   5,224 characters with MD5 `f5117ef456328a546cd2ffe24e23279d`. After the migration the deployed
   core reports the same length and the same MD5. The body is byte-identical apart from the one
   renamed variable, so both explanatory comment blocks (why `st.is_due` is avoided, and why every
   line tied at the minimum key must be settled) survive verbatim.
2. **Sample.** The brief's 20-profile sample, run before and after.
3. **Whole-population.** The pre-change function was rebuilt under a scratch name from the
   `pg_get_functiondef` dump and compared row by row against the new wrapper across every profile
   that the gate can plausibly be asked about, plus a no-obligation control group. The scratch
   function was dropped afterwards.

A note on check 2: a broader MD5 digest was tried first and appeared to differ. The cause was in the
check, not the function: the sampling query emitted 950 rows for 934 distinct profile ids, and the
`string_agg` ordered by profile id alone had ties, so the digest was not reproducible. Check 3
replaces it and is deterministic.

## Sample identity paths

Of the 20 sampled profiles:

| Path | Profiles |
|---|---|
| Path 1, direct `learners_profiles.profile_id` link | 10 |
| Paths 2/3, reached only by the email fallback | 10 |

The email-fallback half was NOT empty, so no widening to `student_email` was needed for the sample.
The whole-population check below exercises `student_email` separately anyway.

## Before

Query: the brief's Step 2 query, unchanged.

```json
[
 {"profile_id":"004137e1-058e-44d9-a3e1-f6be0b77c2b2","before":{"terms": [{"paid": false, "amount": 500.00, "status": "unpaid", "balance": 500.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 500.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"0192864d-1bd0-4278-bf73-8f1b2c1e5928","before":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"01b685fc-7e3e-4ea2-b79e-e6a55e2a8fcf","before":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"03b3fe77-e7a3-4a1d-9481-73774762ddef","before":{"terms": [{"paid": false, "amount": 500.00, "status": "unpaid", "balance": 500.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 500.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"03b6ea73-8d2f-44ce-b630-cd74a8f44bc2","before":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"0555404e-663b-48ce-9c36-2f6b09c1a971","before":{"terms": [{"paid": false, "amount": 5500.00, "status": "unpaid", "balance": 5500.00, "overdue": true, "term_no": 1, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 5500.00, "term1_due_date": "2026-08-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"059287ef-9f11-4a89-a75d-02dd404199c1","before":{"terms": [{"paid": false, "amount": 5500.00, "status": "unpaid", "balance": 5500.00, "overdue": true, "term_no": 1, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 5500.00, "term1_due_date": "2026-08-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"05b39249-6516-456b-844c-4442fb7028ec","before":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"063b36ff-6ac8-433b-a1a7-d5dc66e556c0","before":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-08-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"06c3ea26-44c1-4d5c-ba47-4e246b6996e3","before":{"terms": [{"paid": false, "amount": 5500.00, "status": "unpaid", "balance": 5500.00, "overdue": true, "term_no": 1, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 5500.00, "term1_due_date": "2026-08-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"11f82967-6871-4777-a984-783f766a6119","before":{"terms": [{"paid": false, "amount": 3000.00, "status": "unpaid", "balance": 3000.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}, {"paid": false, "amount": 2000.00, "status": "unpaid", "balance": 2000.00, "overdue": true, "term_no": 2, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5000.00, "term1_status": "unpaid", "overdue_count": 2, "term1_balance": 3000.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"2dfeb091-b860-4f64-90ad-888bfdc29dd9","before":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"30dffc2c-9436-4d8a-99c7-014ebd09be67","before":{"terms": [{"paid": true, "amount": 5500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 5500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"4caa5dbc-0735-45d8-be4b-83f37a89d4b3","before":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"544e83b1-3c6b-4dda-b354-e57378477f08","before":{"terms": [{"paid": false, "amount": 3000.00, "status": "unpaid", "balance": 3000.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}, {"paid": false, "amount": 2500.00, "status": "unpaid", "balance": 2500.00, "overdue": true, "term_no": 2, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 2, "term1_balance": 3000.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"5ccb1f61-4377-480b-9112-d434073738b0","before":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"7ccd7f2a-78a5-4119-b18b-d9227787c058","before":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"cac6e080-1f9f-4ae7-b92a-44df7cf52313","before":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"ecc203f1-6493-46a1-a138-b1732360ddc0","before":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"fb0686b7-3cc7-4f21-b014-d6737fddf825","before":{"terms": [{"paid": false, "amount": 3000.00, "status": "unpaid", "balance": 3000.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}, {"paid": false, "amount": 2500.00, "status": "unpaid", "balance": 2500.00, "overdue": true, "term_no": 2, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 2, "term1_balance": 3000.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}}
]
```

## After

Same query, re-run after the migration applied. Every field of every row is identical to the
corresponding `## Before` row: same `allowed`, same `reason`, same `terms` array, same
`overdue_count`, `total_owed`, `term1_*` values and the same transport year.

```json
[
 {"profile_id":"004137e1-058e-44d9-a3e1-f6be0b77c2b2","after":{"terms": [{"paid": false, "amount": 500.00, "status": "unpaid", "balance": 500.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 500.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"0192864d-1bd0-4278-bf73-8f1b2c1e5928","after":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"01b685fc-7e3e-4ea2-b79e-e6a55e2a8fcf","after":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"03b3fe77-e7a3-4a1d-9481-73774762ddef","after":{"terms": [{"paid": false, "amount": 500.00, "status": "unpaid", "balance": 500.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 500.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"03b6ea73-8d2f-44ce-b630-cd74a8f44bc2","after":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"0555404e-663b-48ce-9c36-2f6b09c1a971","after":{"terms": [{"paid": false, "amount": 5500.00, "status": "unpaid", "balance": 5500.00, "overdue": true, "term_no": 1, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 5500.00, "term1_due_date": "2026-08-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"059287ef-9f11-4a89-a75d-02dd404199c1","after":{"terms": [{"paid": false, "amount": 5500.00, "status": "unpaid", "balance": 5500.00, "overdue": true, "term_no": 1, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 5500.00, "term1_due_date": "2026-08-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"05b39249-6516-456b-844c-4442fb7028ec","after":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"063b36ff-6ac8-433b-a1a7-d5dc66e556c0","after":{"terms": [{"paid": true, "amount": 500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-08-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"06c3ea26-44c1-4d5c-ba47-4e246b6996e3","after":{"terms": [{"paid": false, "amount": 5500.00, "status": "unpaid", "balance": 5500.00, "overdue": true, "term_no": 1, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 1, "term1_balance": 5500.00, "term1_due_date": "2026-08-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"11f82967-6871-4777-a984-783f766a6119","after":{"terms": [{"paid": false, "amount": 3000.00, "status": "unpaid", "balance": 3000.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}, {"paid": false, "amount": 2000.00, "status": "unpaid", "balance": 2000.00, "overdue": true, "term_no": 2, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5000.00, "term1_status": "unpaid", "overdue_count": 2, "term1_balance": 3000.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"2dfeb091-b860-4f64-90ad-888bfdc29dd9","after":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"30dffc2c-9436-4d8a-99c7-014ebd09be67","after":{"terms": [{"paid": true, "amount": 5500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 5500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"4caa5dbc-0735-45d8-be4b-83f37a89d4b3","after":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"544e83b1-3c6b-4dda-b354-e57378477f08","after":{"terms": [{"paid": false, "amount": 3000.00, "status": "unpaid", "balance": 3000.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}, {"paid": false, "amount": 2500.00, "status": "unpaid", "balance": 2500.00, "overdue": true, "term_no": 2, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 2, "term1_balance": 3000.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"5ccb1f61-4377-480b-9112-d434073738b0","after":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"7ccd7f2a-78a5-4119-b18b-d9227787c058","after":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"cac6e080-1f9f-4ae7-b92a-44df7cf52313","after":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"ecc203f1-6493-46a1-a138-b1732360ddc0","after":{"terms": [{"paid": true, "amount": 3000.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 1, "due_date": "2026-07-31"}, {"paid": true, "amount": 2500.00, "status": "paid", "balance": 0.00, "overdue": false, "term_no": 2, "due_date": "2026-08-31"}], "reason": "current", "allowed": true, "term1_paid": true, "total_owed": 0, "term1_status": "paid", "overdue_count": 0, "term1_balance": 0.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}},
 {"profile_id":"fb0686b7-3cc7-4f21-b014-d6737fddf825","after":{"terms": [{"paid": false, "amount": 3000.00, "status": "unpaid", "balance": 3000.00, "overdue": true, "term_no": 1, "due_date": "2026-07-31"}, {"paid": false, "amount": 2500.00, "status": "unpaid", "balance": 2500.00, "overdue": true, "term_no": 2, "due_date": "2026-08-31"}], "reason": "term1_unpaid", "allowed": false, "term1_paid": false, "total_owed": 5500.00, "term1_status": "unpaid", "overdue_count": 2, "term1_balance": 3000.00, "term1_due_date": "2026-07-31", "transport_year_id": "6b3768f9-c9fb-48d5-a955-41949983c3b0", "transport_year_name": "2026-2027"}}
]
```

## Whole-population comparison

The pre-change function was rebuilt from the `pg_get_functiondef` dump under the scratch name
`tms_transport_access_parity_20260911(uuid)` and compared against the new wrapper for every profile
in the population below, using `old_json is distinct from new_json`.

| Measure | Value |
|---|---|
| Distinct profiles compared | 1915 |
| Profiles whose JSON differed | 0 |
| Path 1, direct profile link | 1276 |
| Path 2, `college_email` fallback | 481 |
| Path 3, `student_email` fallback | 9 |
| No-obligation control profiles | 200 |

The path counts sum to more than the distinct total because some profiles are reachable by more than
one path; the comparison deduplicates by profile id.

An ordered digest over the same population agrees on both sides:
`6451304cf23a73faba6f118f09d250b0`.

The scratch function was dropped afterwards; `pg_proc` confirms zero rows remain under that name.

## Grants

| Role | `tms_student_transport_access(uuid)` | `tms_transport_access_for_learner(uuid)` |
|---|---|---|
| `authenticated` | true | false |
| `service_role` | true | true |

Both grants held at the time this parity check ran. A later migration on this branch,
`20260911120000_revoke_authenticated_on_transport_access_core.sql`, revoked `authenticated`
(and a leftover `PUBLIC` grant) from the learner-keyed core: it reads any learner's fee position
with no caller-identity check inside it, so it is reachable only by the service role. The wrapper
`tms_student_transport_access(uuid)` is SECURITY DEFINER and keeps its own `authenticated` grant
unchanged, so the portal gate every learner depends on is unaffected. Verified live via
`has_function_privilege` on 2026-09-11: `authenticated` is `false` and `service_role` is `true` on
the core.

## Verdict

PASS. Every sampled profile returned identical JSON, in the 20-profile sample and in the
1,915-profile whole-population comparison, across all three identity paths and the no-obligation
control. The transplanted money logic is byte-identical to the pre-change body apart from the single
`v_learner_id` to `p_learner_id` rename, and both EXECUTE grants are in place.
