# Transport Bills: Academic Year + Term + Transport Year — Design

**Date:** 2026-06-19
**Module:** Fees Structure (`tms_fee_structure` generation into shared `billing_student_bills`)
**Status:** Approved — pending implementation plan

## Goal

When transport bills are generated, each bill must reliably carry and display:

1. The learner's **academic year** — sourced from their profile, not date-derived.
2. The **term** — systematically in the bill name (already present, made non-incidental).
3. The **transport year** — stored on the money row so statistics can be run transport-year-wise.

And the TMS ledger must stay **consistent with MyJKKN**: deleting/editing a bill in MyJKKN
(the owner of `billing_student_bills`) must reflect in TMS automatically.

## Current state (verified against live DB, 2026-06-19)

- Generation (`POST /api/admin/fees/[id]/generate`, mode `generate`) inserts one
  `billing_student_bills` money row + one `tms_fee_bill` ledger row per learner × term.
- **Academic year is wrong.** `resolveAcademicYear()` date-matches the transport-year
  start against `academic_years` instead of reading the learner's profile. The only
  transport year ("2026-2027") starts **2026-05-01**, which falls *inside* the
  `academic_years` row "2025-2026" (2025-06-01 → 2026-05-31), so bills are tagged
  **2025-2026** while the learner's profile says **2026-2027**. **197 of 200** sampled
  bills mismatched; `learners_profiles.academic_year_id` is populated for **every**
  learner (0 nulls).
- **Term is already** in `bill_description` (`"… - Term 1/2/3"`), but the academic year
  only appears because it was typed into the structure name. All terms share one
  `item_category_id` ("Transport Fee", `bb5bbf2b…`), so a category-only view can't
  distinguish them.
- **No transport-year link on the money table.** `billing_student_bills` has
  `hostel_year_id → hostel_years`, `academic_year_id → academic_years`, but no
  `transport_year_id`. `tms_fee_bill` (ledger) already carries `transport_year_id`.
- **Orphaned ledger.** The previously-generated transport money rows were deleted
  externally (no in-app delete route exists). All **768 `tms_fee_bill` rows are now
  orphaned** (money row missing) → they render as "unknown" in Bill Management and,
  because generation idempotency keys off the ledger (`person_id:term_no`), they would
  cause re-generation to **skip everything**.
- **No referential link, so no sync.** `tms_fee_bill.billing_student_bill_id` has
  **no foreign key** (the other three columns do). MyJKKN owns `billing_student_bills`,
  so deleting/editing a bill there does not propagate to the ledger — the root cause of
  the orphans. Read paths today: the student gate RPC reads money state **live** (INNER
  JOIN → a deleted bill makes the term silently vanish); admin `loadTransportBills` reads
  paid/pending/status **live** but the displayed **amount/due_date from the ledger
  snapshot**, so MyJKKN edits to those don't show.

## Decisions (confirmed with user)

| Topic | Decision |
|---|---|
| Bill name format | `Transport Fee - {academic_year} - Term {n}` (category + AY + term) |
| Tiered bills | keep the year band: `Transport Fee - {academic_year} - {band} - Term {n}` |
| Academic year source | learner's `learners_profiles.academic_year_id` (per learner) |
| Existing bills | not backfilled (and now moot — transport bills were deleted) |
| Admin display | add **Academic Year** column to Bill Management table + Excel export |
| Transport year storage | **add `transport_year_id` column to `billing_student_bills`** (mirrors `hostel_year_id`); not added to the bill name (would duplicate the AY text) |
| Orphaned ledger | clear the 768 orphaned `tms_fee_bill` rows now |
| MyJKKN→TMS sync | **cascade delete**: add FK `tms_fee_bill.billing_student_bill_id → billing_student_bills(id) ON DELETE CASCADE` (deletes auto-clean the ledger); edits reflected by reading amount/due_date live (no triggers, no snapshot copy) |

## Design

### A. Source academic year from the profile — `lib/fees/applicability.ts`
- Add `academic_year_id` to the `learners_profiles` select.
- Add `academic_year_id: string | null` to `ApplicablePerson` (null for staff).

### B. Generation — `app/api/admin/fees/[id]/generate/route.ts`
- **Remove** `resolveAcademicYear()` + `acadCache` (date-derivation). Keep `tyStart` /
  `currentYear` (still needed for tiered year-of-study).
- Batch-resolve `academic_years.academic_year_name` for the distinct `academic_year_id`s
  of resolved learners → `Map<id, name>`.
- For each learner bill insert:
  - `academic_year_id = p.academic_year_id`
  - `transport_year_id = fs.transport_year_id`
  - `bill_description = "${catName} - ${ayName} - ${bandPrefix}${term_label || 'Term ' + term_no}"`
    where `catName = "Transport Fee"`, `bandPrefix` is the tiered band label (or empty for flat).
  - If a learner's `academic_year_id` is null (none today, defensive): omit the AY
    segment in the name and store `academic_year_id = null`.
- Staff rows are unchanged (coverage-only ledger row, no money row).

### C. Schema — new migration `supabase/migrations/20260619000000_add_transport_year_id_to_billing_student_bills.sql`
```sql
ALTER TABLE billing_student_bills
  ADD COLUMN IF NOT EXISTS transport_year_id uuid
  REFERENCES tms_transport_year(id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_transport_year
  ON billing_student_bills (transport_year_id);
```
- Nullable, additive, backward-compatible (other apps unaffected). Populated only for
  transport bills by the generator. Apply via Supabase MCP **and** commit the file.

### D. Admin display — `lib/fees/bills.ts`, `bill-management/columns.tsx`, `bill-export.ts`
- `loadTransportBills`: add `academic_year_id` to the `billing_student_bills` select
  (already fetched into `billMap`), batch-resolve `academic_years.academic_year_name`.
- `TransportBillRow`: add `academic_year_id` + `academic_year_name`.
- `columns.tsx`: add an "Academic Year" column (`academic_year_name || '—'`; staff `—`).
- `bill-export.ts`: add an "Academic year" column to the `.xlsx`.
- Transport year is already shown (`year_name` from the ledger) — no change there.

### E. One-time data cleanup (prerequisite for F)
```sql
DELETE FROM tms_fee_bill
WHERE billing_student_bill_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM billing_student_bills b WHERE b.id = tms_fee_bill.billing_student_bill_id);
-- expected: 768 rows. Must run BEFORE adding the FK in F (orphans violate it).
```

### F. MyJKKN→TMS auto-sync — migration `supabase/migrations/20260619000100_tms_fee_bill_cascade_link.sql`
Make TMS a derived mirror of the MyJKKN money table: DB-enforced cascade for deletes +
live reads for edits. No triggers on the shared table; the constraint lives on our table.
```sql
-- 1) index for the cascade lookup + general joins
CREATE INDEX IF NOT EXISTS idx_tms_fee_bill_billing_student_bill
  ON tms_fee_bill (billing_student_bill_id);

-- 2) one ledger row per money row (hygiene; partial so staff nulls are allowed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tms_fee_bill_billing_student_bill
  ON tms_fee_bill (billing_student_bill_id)
  WHERE billing_student_bill_id IS NOT NULL;

-- 3) the missing link, with cascade (run AFTER the E cleanup)
ALTER TABLE tms_fee_bill
  ADD CONSTRAINT tms_fee_bill_billing_student_bill_id_fkey
  FOREIGN KEY (billing_student_bill_id)
  REFERENCES billing_student_bills(id) ON DELETE CASCADE;
```
- Deleting a bill in MyJKKN now auto-removes its ledger row (learner rows only — staff
  rows have a null link and are untouched). Generation still works: it inserts the money
  row first, then the ledger row referencing it.
- **Edit sync (read change in `lib/fees/bills.ts`):** for learner rows, display
  `amount`/`due_date` from the live `billing_student_bills` row (via `billMap`) instead of
  the ledger snapshot; fall back to the ledger value for staff (no money row). The student
  RPC already reads live — and with cascade, deleted rows vanish from both sides
  consistently (no more silent INNER-JOIN ghost terms).

## Out of scope
- Backfilling old bills (none exist). `applies_year_of_study` column. The fee-structure
  *coverage* table (single structure/transport-year — academic year isn't a per-bill axis).
  A dedicated stats dashboard (the new column makes those queries possible; building a UI
  is separate). Syncing MyJKKN-side *inserts* (transport bills are only created by TMS
  generation; cascade + live-read cover the delete/edit cases the user manages).

## Risks / verification
- **Auth limits** (project memory): authed pages can't be fully rendered headlessly.
  Verify via `tsc` on changed files + a **dry-run → real generate** against an active
  test structure, then SQL checks: new bills' `academic_year_id` == learner profile AY,
  `transport_year_id` populated, `bill_description` reads `Transport Fee - 2026-2027 - Term n`.
- **Shared table:** the `billing_student_bills` change is additive only (nullable column +
  index); no existing column or row is altered. The cascade FK lives on **our** table
  (`tms_fee_bill`), so MyJKKN deletes keep working and just clean the ledger.
- **No data loss:** generation only inserts; the only deletion is the 768 orphaned ledger rows.
- **Sync checks:** after the FK, delete one `billing_student_bills` row and confirm its
  `tms_fee_bill` row auto-disappears; edit a bill's `final_amount` and confirm Bill
  Management's Amount reflects it (live read).
