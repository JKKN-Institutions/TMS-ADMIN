# Transport Maintenance Fee / Transport Fee split — design

**Date:** 2026-09-12
**Scope:** transport year 2026-2027 (`tms_transport_year.is_current = true`)
**Status:** approved, ready for implementation planning

---

## 1. Problem

The recurring transport fee and the transport fine both post their money row to
the **same** billing category, `Transport Fee` (`bb5bbf2b-5777-4802-8113-8178b28c88af`).

Measured on the live database 2026-09-12:

| What | Table | Rows |
|---|---|---|
| Recurring fee, learner | `tms_fee_bill` (`generated`) | 2,788 |
| Recurring fee, learner, cancelled | `tms_fee_bill` (`cancelled`) | 3 |
| Recurring fee, staff (no money row) | `tms_fee_bill` (`staff_deferred` / `cancelled`) | 37 / 1 |
| Fine | `tms_fee_fine` | 26 (25 generated, 1 cancelled) |
| Money rows carrying `transport_year_id` | `billing_student_bills` | 2,817 |

All 2,817 money rows sit under one category. A penalty is therefore
indistinguishable from a regular charge in every category-keyed report
(`get_billing_analytics_by_category`, `get_billing_collection_split`,
`ai_rpc_fees_revenue`) and in the learner's own bill list in MyJKKN.

## 2. Goal

Two categories, used consistently for transport year 2026-2027:

| Category | Carries | Ledger |
|---|---|---|
| `Transport Maintenance Fee` | the recurring termly/annual transport charge, learners | `tms_fee_bill` |
| `Staff Transport Maintenance Fee` | the recurring charge, staff | `tms_fee_bill` |
| `Transport Fee` | fines only | `tms_fee_fine` |

No learner pays more. No amount changes. This is a re-categorisation and a
re-wording of existing money, plus a permanent change to what future generation
writes.

## 3. The trap this design exists to avoid

`lib/fines/create.ts:166` resolves its category with
`TRANSPORT_CATEGORY_NAME.student` — the *same* constant the recurring fee
generator uses at `lib/fees/generate.ts:560`.

Changing that constant value alone moves the **fine** into the maintenance
category as well, producing the exact opposite of the requirement while every
existing test still passes. The change therefore begins by decoupling the two
constants, and locks the decoupling with a regression test.

## 4. Design

### 4.1 Constants — `lib/fees/types.ts`

```ts
export const TRANSPORT_CATEGORY_NAME: Record<FeeAudience, string> = {
  student: 'Transport Maintenance Fee',
  staff:   'Staff Transport Maintenance Fee',
};

/** The FINE ledger deliberately bills under a DIFFERENT category from the
 *  recurring maintenance fee above, so a penalty and a regular charge can be
 *  told apart in reports. Do NOT collapse these back into one constant. */
export const TRANSPORT_FINE_CATEGORY_NAME = 'Transport Fee';
```

`lib/fines/create.ts` imports and uses `TRANSPORT_FINE_CATEGORY_NAME`.

**Consequence, deliberate:** `lib/fees/generate.ts:697` composes
`bill_description` out of `catName` itself:

```ts
bill_description: [catName, tyName ?? acadYearName, r.band?.label ?? null]
  .filter(Boolean).join(' - ')
```

so new bills read `Transport Maintenance Fee - 2026-2027` with no second edit
site. Fine descriptions stay `Transport Fine — <reason>`: a penalty must never
read as a regular fee, whatever category it bills to.

### 4.2 Fail loud on a missing category

All three writers currently degrade silently:

- `lib/fees/generate.ts:566` — `const categoryId = cat?.id ?? null`
- `lib/fees/staff-bill.ts:234`
- `lib/fines/create.ts:168`

Today the lookup always hits, so the `?? null` is invisible. After a rename, one
mis-seeded name would insert ~2,800 bills with **no category at all** — money
that exists but appears in no category report, with no error raised.

All three sites must fail the operation with an explicit message naming the
category they could not find. This is what makes the rename safe to repeat for
2027-2028.

### 4.3 Migration — `supabase/migrations/20260912_transport_maintenance_fee_category.sql`

One transaction, idempotent, in this order.

**Step 1 — seed the categories.** Insert `Transport Maintenance Fee` and
`Staff Transport Maintenance Fee` if absent, cloning the shape of the existing
transport rows: `kind = 'transport'`, `collection_type = 'management'`,
`frequency = 'one-time'`, `applies_to = {college}`, `is_active = true`,
`visible_to_learners = true`, and critically **`once_per_learner = false`**.

> `billing_enforce_once_per_learner` is a `BEFORE INSERT OR UPDATE` trigger whose
> early-exit applies only while `item_category_id` is unchanged. Step 3 changes
> that column, so the full duplicate check re-runs on every backfilled row. With
> `once_per_learner = true`, every learner holding both a Term-1 and a Term-2
> bill would abort the migration with `BL001`.

**Step 2 — undo table** `tms_bill_category_backfill_20260912`, capturing per
bill: `bill_id`, `old_item_category_id`, `old_bill_description`, and per TMS
ledger row: `tms_fee_bill_id`, `old_billing_category_id`.

**Step 3 — backfill the money rows.** Scoped by joining `tms_fee_bill`, which
excludes fines structurally rather than by filtering on description text:

```sql
where b.transport_year_id = <2026-2027>
  and exists (select 1 from tms_fee_bill fb
              where fb.billing_student_bill_id = b.id)
```

- `item_category_id` -> the maintenance category
- `bill_description` -> `regexp_replace(bill_description, '^Transport Fee', 'Transport Maintenance Fee')`

The prefix replace covers all seven observed variants in one pass:

| Current description | Rows |
|---|---|
| `Transport Fee - 2026-2027 - Term 1` | 1,485 |
| `Transport Fee - 2026-2027 - Term 2` | 916 |
| `Transport Fee - 2026-2027` | 352 |
| `Transport Fee` | 27 |
| `Transport Fee - 2025-2026 - Term 1` (stale year) | 5 |
| `Transport Fee - 2026-2027  - Term 1` (double space) | 3 |
| `Transport Fee - 2026-2027  - Term 2` (double space) | 3 |

The five stale-year rows are additionally normalised to `2026-2027`, and the six
double-space rows to a single separator, in the same statement. All are `paid`
and all are in the fee ledger — verified on the live database, not assumed.

**Step 4 — backfill the TMS ledger's own copy.** `tms_fee_bill.billing_category_id`
carries a duplicate of the category: 2,791 learner rows -> maintenance, 38 staff
rows -> staff maintenance. Leaving this stale would make the two ledgers disagree.

**Step 5 — assert, then commit.** Raise (rolling the transaction back) unless:

- zero rows joined to `tms_fee_bill` still carry the old category;
- all 26 `tms_fee_fine` money rows still carry `Transport Fee`;
- zero fee-ledger descriptions still begin with `Transport Fee`;
- `tms_fee_bill` rows carrying the old `billing_category_id` number zero.

### 4.4 Label touch-ups

- `app/(admin)/fees/fee-structure-form.tsx:386` — helper text currently hardcodes
  the category name. Drive it off `TRANSPORT_CATEGORY_NAME` so it cannot drift again.
- `app/(admin)/passengers/learners/[learnerId]/page.tsx:81` — field label
  `Transport Fee` -> `Transport Maintenance Fee`.

The student portal needs **no** change: `app/student/fees/page.tsx` renders from
`tms_transport_access_for_learner`, which reads `tms_fee_bill` joined to the
money row and never inspects the category. Fines are invisible to it today and
stay invisible.

Bill Management needs **no** structural change: it already separates the two as
distinct views (Bills / Unbilled / Analytics / Fines).

### 4.5 Tests

| File | Change |
|---|---|
| `lib/fees/generate.test.ts` | 3 description assertions (lines 328, 456, 509) become `Transport Maintenance Fee - …` |
| `lib/fines/create.test.ts` | fixture keeps `Transport Fee`; **new** assertion that fine creation resolves the fine category and NOT the maintenance category |
| `lib/fees/generate.test.ts` | **new** — generation fails loudly when the category is absent |
| `lib/fines/create.test.ts` | **new** — fine creation fails loudly when the category is absent |

## 5. Blast radius

| Area | Effect |
|---|---|
| Category revenue reports | **Rs 60,84,650 of collected money moves** from the `Transport Fee` line to `Transport Maintenance Fee` (2,204 paid bills). Intended; reversible from the undo table. |
| Receipts | Untouched — `billing_receipt_items` joins on `bill_id`. 2,205 receipted bills keep their receipts. |
| Portal access gate | Unaffected — `tms_transport_access_for_learner` joins `tms_fee_bill`, never the category. |
| Bill triggers | Safe: `update_bill_balance_on_amount_change` fires only when `final_amount` changes; `fn_guard_bill_cancellation` only on a flip to `cancelled`; the hostel-category sync filters `fee_source = 'academic'` and transport is `ad_hoc`. |
| MyJKKN | Its Transport Fees screen filters on `transport_year_id`, not category name. Unaffected. |
| Staff billing | Zero staff money rows exist (all 38 are `staff_deferred`/`cancelled`), so the staff rename costs nothing now and avoids a second backfill later. |

**Open risk:** `billing_categories` is shared with MyJKKN. The old `Transport Fee`
category stays alive — it now holds fines — so nothing breaks, but a finance user
who recognises the name by sight will see it shrink from Rs 87.8L to the fines
total. Worth an out-of-band heads-up to the billing team.

## 6. Out of scope

- Any change to amounts, due dates, instalment schedules or fee structures.
- Transport years other than 2026-2027 (only one exists).
- Making fines gate portal access (they do not today; that stays true).
- Renaming the `tms_fee_structure` rows (`Transport Fees 2026-2027 …`).

## 7. Verification

1. `npx vitest run lib/fees lib/fines` — green.
2. Path-scoped `tsc` over the touched files (project-wide `tsc` is chronically red
   and is not a gate; `npm run lint` is broken by a circular config).
3. Post-migration SQL: counts by category; the four assertions of step 5 re-run
   as a read-only query.
4. Browser smoke on `/bill-management` (Bills, Fines and Analytics views) —
   requires the user's authenticated browser; the agent Chrome session is signed out.
