# TMS Fees Structure & Bill Generation Module — Design & Implementation Plan

**Date:** 2026-06-13
**Status:** Awaiting approval
**Replaces:** the removed legacy `/payments` module (commit `e570783`)

---

## 1. Goal

A **Fees Configuration** module in TMS-ADMIN where an admin defines transport **fee structures** keyed on a set of conditions, optionally **splits** a fee into N terms (each with its own amount + due date), and then **manually triggers** bill generation. Generated learner bills are written into the **existing MyJKKN billing system** (`billing_student_bills`) under a transport billing category, so they surface in the MyJKKN billing module / student portal. A **coverage view** answers "for transport year X, which passengers are billed vs not."

This mirrors MyJKKN's proven **admission fee-structure → bill-generation** pattern, adding the one piece admission lacks: a **per-term installment layer with custom due dates**.

## 2. Confirmed product decisions

1. **Learners-only v1.** Real bills are generated only for learners (written to `billing_student_bills` → `learners_profiles`). Fee structures may *target* staff for planning/coverage, but staff bill-generation is **phase 2** (staff are not billable in MyJKKN's billing tables today — `billing_student_bills.student_id → learners_profiles` only).
2. **Two billing categories.** Keep existing `Transport Fee` (`bb5bbf2b-5777-4802-8113-8178b28c88af`) for learners; create a new `Staff Transport Fee` category. Structure maps student-audience → learner category, staff-audience → staff category.
3. **Custom amount + due date per term.** Admin enters each term's amount and due date; validation enforces `sum(term amounts) == total_amount` and `count(terms) == split_count`.

## 3. Key constraints established by investigation

- **Write target:** `billing_student_bills` (the charge/demand table), NOT `billing_invoices` (auto-minted by trigger after full payment). Required-for-insert: `student_id`, `institution_id`, `due_date`, `unit_amount`, `total_amount`, `final_amount`; set `item_category_id` (transport category), `fee_source='ad_hoc'`, `balance_amount=final_amount`, `status='unpaid'`, `academic_year_id` (best-effort), `created_by`. RLS on → **service-role** writes.
- **Multiple bills per person/year allowed** for transport (dedup indexes only fire when `hostel_year_id IS NOT NULL`) → the 3-term split = 3 inserts, fine.
- **No `transport_year` column on bills.** Coverage must be tracked in a **TMS-side ledger** (`tms_fee_bill`), not by querying `billing_student_bills`.
- **`academic_years` are per-institution + overlapping** → map a transport year to a bill's `academic_year_id` per the person's institution (best-effort; column is nullable).
- **Applicability:** learners carry all dims (`institution_id, degree_id, department_id, program_id, semester_id, quota_id`, `bus_required`, `lifecycle_status='active'`); staff carry only `institution_id, department_id, role_key, bus_required, is_active` (no academic dims). A condition that constrains academic dims can only match learners.
- **Modern TMS module pattern** (exemplar: `transport-years`): `tms_`-prefixed table, RLS-enabled-no-policies, audit cols, `withAuth` + `requirePerm('tms.<entity>.<action>')` + service-role API routes, field whitelist, DataTable list, shared form, detail page, nav entry, `logActivity`.

## 4. Data model (new TMS-owned tables)

All tables: `tms_` prefix, `id uuid pk default gen_random_uuid()`, `created_at/updated_at timestamptz default now()`, `created_by/updated_by uuid` (no FK), RLS enabled with no policies, `update_updated_at_column()` touch trigger.

### 4.1 `tms_fee_structure` — the condition/parent row
| Column | Type | Notes |
|---|---|---|
| `name` | text NOT NULL | display label |
| `transport_year_id` | uuid NOT NULL → `tms_transport_year` | the year dimension |
| `audience` | text NOT NULL CHECK in ('student','staff') | drives population table + billing category |
| `institution_id` | uuid NULL → institutions | NULL = any |
| `degree_id` | uuid NULL → degrees | NULL = any (learner-only dim) |
| `department_id` | uuid NULL → departments | NULL = any |
| `programme_id` | uuid NULL → programs | NULL = any (learner-only dim) |
| `semester_id` | uuid NULL → semesters | NULL = any (learner-only dim) |
| `quota_id` | uuid NULL → quotas | NULL = any (learner-only dim) |
| `staff_role_keys` | text[] NULL | for audience='staff'; NULL = all staff roles ("custom roles") |
| `total_amount` | numeric NOT NULL CHECK ≥ 0 | overall fee |
| `split_count` | int NOT NULL DEFAULT 1 CHECK ≥ 1 | number of terms |
| `status` | text NOT NULL DEFAULT 'draft' CHECK in ('draft','active','archived') | |
| `notes` | text NULL | |

*(Community dimension intentionally omitted — not in the requirement; YAGNI. Easy to add later as a junction like admission's.)*

### 4.2 `tms_fee_structure_term` — the installment layer (net-new vs admission)
| Column | Type | Notes |
|---|---|---|
| `fee_structure_id` | uuid NOT NULL → tms_fee_structure ON DELETE CASCADE | |
| `term_no` | int NOT NULL | 1..N |
| `term_label` | text NULL | default 'Term {n}' |
| `amount` | numeric NOT NULL CHECK ≥ 0 | custom per-term amount |
| `due_date` | date NOT NULL | custom per-term due date |
| | | UNIQUE(`fee_structure_id`, `term_no`) |

App + DB validation: `sum(amount)=parent.total_amount`, `count=split_count`.

### 4.3 `tms_fee_generation_run` — generation batch header (audit)
`fee_structure_id`, `transport_year_id`, `triggered_by uuid`, `triggered_at`, `mode text ('dry_run'|'generate')`, `status text ('completed'|'partial'|'failed')`, `applicable_count int`, `learner_billed_count int`, `staff_deferred_count int`, `skipped_count int`, `notes text`.

### 4.4 `tms_fee_bill` — per-person-per-term ledger (coverage source + idempotency + traceability)
| Column | Type | Notes |
|---|---|---|
| `generation_run_id` | uuid → tms_fee_generation_run | |
| `fee_structure_id` | uuid → tms_fee_structure | |
| `transport_year_id` | uuid → tms_transport_year | |
| `person_id` | uuid NOT NULL | learners_profiles.id (v1) / staff.id (phase 2) |
| `person_type` | text NOT NULL CHECK in ('learner','staff') | |
| `term_no` | int NOT NULL | |
| `amount` | numeric NOT NULL | |
| `due_date` | date NOT NULL | |
| `billing_category_id` | uuid | transport category used |
| `billing_student_bill_id` | uuid NULL → billing_student_bills | the real MyJKKN bill (NULL for staff/dry-run) |
| `status` | text CHECK in ('generated','staff_deferred','error') | |
| | | UNIQUE(`fee_structure_id`,`person_id`,`term_no`,`transport_year_id`) — idempotency |

**Why a ledger + billing_student_bills:** `billing_student_bills` is learner-only, shared, and has no transport-year column. The ledger gives transport-year coverage, idempotency (re-run skips already-billed), staff "deferred" rows for coverage, and a link to the real bill.

## 5. Bill generation flow (manual, idempotent, dry-run first)

For a fee structure with `status='active'`:
1. **Resolve population** (service-role SQL, `:param IS NULL OR col=:param` idiom): learners (`bus_required AND lifecycle_status='active'`) matching the set dims; if `audience='staff'`, staff (`bus_required AND is_active`) matching institution/department + `staff_role_keys`.
2. **Dry-run preview** (no writes): applicable count, already-billed (in `tms_fee_bill` for this structure+year), new, total ₹, per-term breakdown, and a **warning** listing anyone already billed by *another* active structure for the same transport year.
3. **Generate** (on confirm), skipping anyone already in `tms_fee_bill` for `(structure, person, term, year)`:
   - **Learner:** insert N `billing_student_bills` rows (one per term) — term amount + due_date, `item_category_id` = learner transport category, `institution_id` = person's institution, `academic_year_id` = best-effort (academic_years row for that institution whose range contains the transport-year start, else NULL), `fee_source='ad_hoc'`, `status='unpaid'`, `bill_description = "{name} {year} - Term {n}/{N}"`, `created_by`. Insert matching `tms_fee_bill` rows linking `billing_student_bill_id`, status `'generated'`.
   - **Staff (v1):** insert `tms_fee_bill` rows with `status='staff_deferred'`, `billing_student_bill_id=NULL` (coverage only; no real bill).
4. Write `tms_fee_generation_run` summary; `logActivity({module:'fees', action:'generate', ...})`.

**Atomicity:** generation runs inside a Postgres RPC `tms_generate_transport_bills(p_fee_structure_id uuid, p_mode text)` (SECURITY DEFINER, mirrors admission's `admission_account_transition_with_bills`) so the multi-table inserts are transactional + idempotent. The Next.js route handles auth/permission/logging and calls the RPC.

## 6. UI / pages (modern TMS pattern)

- **`/fees`** list (DataTable): name, transport year, audience, condition summary, total, split, status, applicable count. Filters: transport year, status, audience. Nav entry in `lib/navigation.ts` (group `transport`, gated `TMS_PERMISSIONS.FEES_VIEW`).
- **`/fees/new`, `/fees/[id]/edit`** shared `fee-structure-form.tsx`:
  - *Basics:* name, transport year (select), audience, status.
  - *Conditions:* cascading institution→degree→department→programme, semester, quota (each "Any"); for staff audience, role multi-select. 
  - *Fee & terms:* total amount, split count → N term rows (label, amount, due date) with live `sum==total` validation.
- **`/fees/[id]`** detail: structure summary + terms table + **Generate panel** (dry-run preview → Generate) + coverage snapshot.
- **`/fees/[id]/coverage`** (or detail tab): applicable population vs `tms_fee_bill` → billed / unbilled / staff-deferred, filterable; CSV export.

## 7. API routes (modern: withAuth + requirePerm + service-role + 42P01 guard + {success,data} + logActivity)

- `app/api/admin/fees/route.ts` (GET list, POST, PUT, DELETE) + `[id]/route.ts` (GET one). Term rows written transactionally with the parent (via RPC `tms_upsert_fee_structure`).
- `app/api/admin/fees/[id]/generate/route.ts` (POST `{mode:'dry_run'|'generate'}` → calls `tms_generate_transport_bills`).
- `app/api/admin/fees/[id]/coverage/route.ts` (GET).
- `app/api/admin/masters/route.ts` (GET `?type=institutions|degrees|departments|programmes|semesters|quotas|staff-roles` → `{id,name}[]`, service-role, for the form dropdowns — no reusable master fetcher exists today).
- `lib/fees/fields.ts` write whitelist; `lib/fees/applicability.ts` (the population query, also reusable by coverage).

## 8. Permissions

Add to `TMS_PERMISSIONS`: `tms.fees.view`, `tms.fees.create`, `tms.fees.edit`, `tms.fees.delete`, `tms.fees.generate`. Seed into `transport_head` (and super-admin bypasses) via an additive jsonb-merge migration.

## 9. Activity logging

`lib/activity/log.ts`: add `'fees'` to `ActivityModule`, `'generate'` to `ActivityAction`. `activity-log/columns.tsx`: add `MODULE_LABEL['fees']='Fees'` and an `ACTION_BADGE['generate']` color. Log create/update/delete/generate.

## 10. Migrations (committed under `supabase/migrations/`)

1. `..._create_tms_fee_structure.sql` — the 4 tables + RLS-no-policies + audit cols + touch triggers + idempotency unique index + term-sum validation trigger.
2. `..._seed_staff_transport_billing_category.sql` — `INSERT ... ON CONFLICT DO NOTHING` a `Staff Transport Fee` row into **shared** `billing_categories` (kind='transport'). ⚠️ touches a MyJKKN-shared table (additive, low-risk).
3. `..._create_tms_fee_rpcs.sql` — `tms_upsert_fee_structure`, `tms_resolve_fee_applicability`, `tms_generate_transport_bills`.
4. `..._seed_tms_fees_permissions.sql` — grant `tms.fees.*` to `transport_head`.

## 11. Phasing

- **Phase 1 (this build):** config CRUD + conditions + custom terms; learner applicability + dry-run + idempotent manual generation into `billing_student_bills`; TMS ledger; coverage dashboard; staff recorded as `staff_deferred`. Manual trigger only.
- **Phase 2 (later):** real staff billing (pending a staff-billing-path decision), auto/scheduled generation, change-events/re-billing pipeline (mirror admission's `fee_change_events`).

## 12. Implementation task order (consumers-last, compiles at each step)

1. Migration #1 (tables) → migration #2 (staff category) → migration #4 (permissions).
2. `lib/fees/{fields,applicability,types}.ts` + `TMS_PERMISSIONS` keys.
3. Migration #3 (RPCs) — resolver + generator + upsert.
4. `app/api/admin/masters/route.ts`.
5. `app/api/admin/fees/route.ts` + `[id]/route.ts` (CRUD).
6. `app/api/admin/fees/[id]/generate` + `coverage` routes.
7. `columns.tsx` + `/fees/page.tsx` (list).
8. `fee-structure-form.tsx` + `new` + `[id]/edit` + `fee-api.ts`.
9. `[id]/page.tsx` detail + generate panel + coverage view.
10. Nav entry + activity-log maps.
11. Verify: `tsc` on changed files, route probes, dry-run generate against the 3 live bus_required learners.

## 13. Open risk to acknowledge

Migration #2 inserts a row into MyJKKN's **shared** `billing_categories`. It's additive (`ON CONFLICT DO NOTHING`) and low-risk, but it is a cross-app data change — flagged for visibility.
