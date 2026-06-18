# Per-Year-of-Study Transport Fees (Arts Self) — Design

**Date:** 2026-06-18
**Module:** Fees Structure (`tms_fee_structure` + generation into `billing_student_bills`)
**Status:** Approved — implementation in progress

## Problem

For transport year **2026-2027**, the **JKKN College of Arts and Science (Self)** needs
year-of-study–based transport fees inside one fee structure:

- **Year 1** → amount **A**
- **Years 2 & 3** → amount **B** (same for both)

This must apply **only to Arts Self** and must **not change** any other college's existing
fee structures or already-generated bills.

## Current state (verified against live DB)

- A fee structure's only academic condition is **institution** (`institution_ids uuid[]`);
  the academic dimensions (degree/department/programme/semester/quota) were removed in
  `20260617000000_fee_structure_institution_multi.sql`. There is **no year-of-study knob**,
  and a structure carries a single `total_amount` + term split.
- Applicability (`lib/fees/applicability.ts`) bills learners where
  `bus_required = true AND lifecycle_status = 'active'`.
- Two existing structures (both 2026-2027, **9 bills generated**) target other institutions;
  **neither targets Arts Self**. Arts Self has **no** structure today.
- `learners_profiles` has **no** stored year of study. It has `admission_year_id` →
  `admission_years.year` (integer) and `semester_id` → `semesters.semester_order`.
- Arts Self: 1,643 learners; **43 bus_required**, of which **0 are `active`**
  (37 `reserved`, 5 `enquiry_submitted`, 1 `account`). 2 learners lack an admission year.

## Decisions

1. **One structure, per-year amounts** (not multiple structures). Implemented as an optional
   **tiered** mode with **year bands**.
2. **Year of study derived from admission year**: `currentYear − admission_years.year + 1`,
   where `currentYear = year(transport_year.start_date)` (2026 for 2026-2027).
3. **Scope = Arts Self only**, achieved by configuration (the structure's `institution_ids`),
   not hard-coded. Tiered mode is opt-in per structure.
4. **Who to bill** = per-structure `lifecycle_statuses` (default `['active']` everywhere;
   Arts Self = `['reserved','active']`). No global filter change → other colleges unaffected.
5. **Missing admission year** → learner is **skipped and reported** as `unresolved`
   (no semester fallback; no guessing). Re-running after backfill bills them (idempotent ledger).
6. Year picker offers years **1–6**.

## Data model

A **year band** is a per-year amount tier within one structure. Flat structures (all existing)
have `fee_mode='flat'`, no bands, terms hanging off the structure as today.

```
tms_fee_structure  fee_mode='tiered'  institution_ids={ArtsSelf}  lifecycle_statuses={reserved,active}
 ├─ year_band #1  study_years={1}    total A  split n ─▶ terms (year_band_id set)
 └─ year_band #2  study_years={2,3}  total B  split n ─▶ terms (year_band_id set)
```

### Schema changes (`20260618000000_fee_structure_year_bands.sql`)
- `tms_fee_structure`: `+ fee_mode text default 'flat'`, `+ lifecycle_statuses text[]`.
- new `tms_fee_structure_year_band(id, fee_structure_id, band_order, label, study_years int[],
  total_amount, split_count, created_at)` — RLS on, no policies.
- `tms_fee_structure_term`: `+ year_band_id uuid` (FK, on delete cascade). Drop
  `unique(fee_structure_id, term_no)`; add two **partial** unique indexes (flat vs band terms).

## Behavior

### Applicability (`lib/fees/applicability.ts`)
- statuses = `fs.lifecycle_statuses?.length ? fs.lifecycle_statuses : ['active']`; filter
  `learners_profiles.lifecycle_status IN statuses`. Staff path unchanged (`is_active`).
- For tiered student structures, also resolve each learner's derived study year and keep only
  those matching some band (so Coverage/Unbilled match what generation bills).

### Year derivation (`lib/fees/year-of-study.ts`, new)
- `deriveStudyYear(currentYear, admissionYear)`, `currentYearOf(startDate)`,
  `loadAdmissionYearMap(supabase, learnerIds)`, `bandForYear(bands, year)`.

### Generation (`app/api/admin/fees/[id]/generate/route.ts`)
- Flat: unchanged (structure terms; flat-term queries add `year_band_id IS NULL`).
- Tiered: load bands + band terms; compute `currentYear` from transport-year start_date
  (needed in **dry-run too**); per learner pick `bandForYear`; bill that band's terms.
- Dry-run preview gains per-band counts and an `unresolved` count (missing admission year /
  no matching band). Idempotency ledger unchanged.

### Write API (`route.ts`, `[id]/route.ts`, `lib/fees/fields.ts`)
- Whitelist `fee_mode`, `lifecycle_statuses`. Accept `bands[]` (study_years, total, split,
  label, terms). Validate: tiered ⇒ ≥1 band, **study_years disjoint across bands**, each band's
  terms sum to its total and count to its split. Write bands then band terms, manual rollback.
- Single GET returns `bands` (with terms) for the edit page + detail.

### UI (`fee-structure-form.tsx`, `columns.tsx`, `[id]/page.tsx`)
- Flat/tiered toggle; tiered shows a repeatable year-band editor (years multi-select 1–6,
  total, term rows, split-equally) + a `lifecycle_statuses` picker. List shows a band summary;
  detail renders each band.

## Isolation guarantee
`fee_mode` defaults flat, the band table starts empty, `lifecycle_statuses` NULL ⇒ `['active']`.
Every existing structure, term and generated bill is byte-for-byte unchanged.

## Verification
1. `tsc --noEmit` on changed files (ESLint is broken in this repo).
2. Create an Arts-Self tiered structure (Yr1 A, Yr2-3 B); **dry-run**; assert per-band +
   `unresolved` counts vs direct SQL.
3. Dry-run an existing flat structure; assert identical to pre-change behavior.

## Known follow-ups (out of scope here)
- Backfill the 2 Arts-Self learners missing `admission_year_id`.
- Staff tiering remains deferred (staff billing is phase 2, unchanged).
