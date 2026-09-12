# Transport Maintenance Fee / Transport Fee Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bill the recurring transport charge to a new `Transport Maintenance Fee` category and leave transport fines on `Transport Fee`, for transport year 2026-2027, in both the code and the 2,817 money rows that already exist.

**Architecture:** One shared category resolver replaces three copies of a silent `?? null` lookup and throws when a category is missing. The two category names are decoupled into two constants so the fee generator and the fine writer can never drift onto the same one again. Two SQL migrations follow: one additive (seed the categories) that ships *before* the code, one that backfills existing rows *after* the code is live.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgREST + service-role client), vitest, PostgreSQL 15.

**Spec:** `docs/superpowers/specs/2026-09-12-transport-maintenance-fee-split-design.md`

## Global Constraints

- **Scope every SQL write to the current transport year.** Resolve it as `select id from tms_transport_year where is_current = true` — never hardcode a UUID.
- **The new categories must be seeded `once_per_learner = false`.** `billing_enforce_once_per_learner` is a `BEFORE INSERT OR UPDATE` trigger that re-runs its full duplicate check whenever `item_category_id` changes. With `true`, the backfill aborts with `BL001` on the first learner holding both a Term-1 and a Term-2 bill.
- **Exact category names, character for character:**
  - `Transport Maintenance Fee` (learner, recurring)
  - `Staff Transport Maintenance Fee` (staff, recurring)
  - `Transport Fee` (fines only — this row already exists, do not rename or delete it)
- **Fine bill descriptions stay `Transport Fine — <reason>`.** Only the recurring fee's description changes.
- **Never filter fee-vs-fine by `bill_description` text.** Use `exists (select 1 from tms_fee_bill fb where fb.billing_student_bill_id = b.id)`. Descriptions are user-editable; ledger membership is not.
- **Deployment order is load-bearing:** Task 5 (seed migration) → Tasks 1-4 merged and deployed → Task 6 (backfill migration). Reversing it writes bills under the wrong category.
- `npm run lint` is broken in this repo (circular ESLint config). Verify with `npx vitest run` plus a path-scoped `tsc`. A red project-wide `tsc` is pre-existing debt and is **not** a regression signal.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/fees/billing-category.ts` | **Create.** Sole place that turns a category name into an id, and the only place that decides what "missing category" means. | 1 |
| `lib/fees/billing-category.test.ts` | **Create.** Unit tests for the resolver. | 1 |
| `lib/fees/types.ts` | **Modify.** The two category-name constants. | 2 |
| `lib/fees/generate.test.ts` | **Modify.** 3 description assertions; fixture gains `billing_categories`. | 2, 3 |
| `lib/fines/create.test.ts` | **Modify.** Regression lock pinning the fine to `Transport Fee`. | 2 |
| `lib/fees/generate.ts` | **Modify.** Use the resolver; fail loud. | 3 |
| `lib/fees/staff-bill.ts` | **Modify.** Use the resolver; stop swallowing the error. | 3 |
| `lib/fines/create.ts` | **Modify.** Use the *fine* constant and the resolver. | 3 |
| `app/api/admin/fines/route.ts` | **Modify.** Surface a missing-category message instead of "Internal server error". | 3 |
| `app/(admin)/fees/fee-structure-form.tsx` | **Modify.** Helper text driven off the constant. | 4 |
| `app/(admin)/passengers/learners/[learnerId]/page.tsx` | **Modify.** Field label. | 4 |
| `supabase/migrations/20260912_seed_transport_maintenance_fee_categories.sql` | **Create.** Additive seed, safe to run against the old code. | 5 |
| `supabase/migrations/20260912_backfill_transport_maintenance_fee_category.sql` | **Create.** Undo table, backfill, assertions. | 6 |

---

### Task 1: The shared billing-category resolver

Three files currently do `const categoryId = cat?.id ?? null`. Today the lookup always hits, so the fallback is invisible. Once the name changes, one typo would insert ~2,800 bills with **no category at all** — real money that appears in no category report and raises no error. This task creates the single place that refuses to do that.

**Files:**
- Create: `lib/fees/billing-category.ts`
- Test: `lib/fees/billing-category.test.ts`

**Interfaces:**
- Consumes: `makeFakeSupabase` from `lib/fees/__testing__/fake-supabase.ts` (existing test helper; it does **not** filter rows — a test supplies the rows a query *would* have returned, keyed by table name).
- Produces:
  - `resolveBillingCategoryId(svc: SupabaseClient, categoryName: string): Promise<string>` — resolves, or throws.
  - `class MissingBillingCategoryError extends Error` with a readonly `categoryName: string`.

- [ ] **Step 1: Write the failing test**

Create `lib/fees/billing-category.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from './__testing__/fake-supabase';
import { resolveBillingCategoryId, MissingBillingCategoryError } from './billing-category';

describe('resolveBillingCategoryId', () => {
  it('returns the id when the category exists', async () => {
    const svc = makeFakeSupabase({
      billing_categories: [{ id: 'cat-9', category_name: 'Transport Maintenance Fee' }],
    });

    await expect(
      resolveBillingCategoryId(svc as never, 'Transport Maintenance Fee')
    ).resolves.toBe('cat-9');
  });

  it('queries by the exact category name it was given', async () => {
    const svc = makeFakeSupabase({
      billing_categories: [{ id: 'cat-9', category_name: 'Transport Maintenance Fee' }],
    });

    await resolveBillingCategoryId(svc as never, 'Transport Maintenance Fee');

    const call = svc.calls.find((c) => c.table === 'billing_categories');
    const eq = call?.ops.find(([op]) => op === 'eq');
    expect(eq?.[1]).toEqual(['category_name', 'Transport Maintenance Fee']);
  });

  // The whole point of this module: a missing category must stop the write, not
  // quietly produce an uncategorised bill.
  it('throws MissingBillingCategoryError when no row matches', async () => {
    const svc = makeFakeSupabase({ billing_categories: [] });

    await expect(
      resolveBillingCategoryId(svc as never, 'Transport Maintenance Fee')
    ).rejects.toBeInstanceOf(MissingBillingCategoryError);
  });

  it('names the category in the error message so the fix is obvious', async () => {
    const svc = makeFakeSupabase({ billing_categories: [] });

    await expect(
      resolveBillingCategoryId(svc as never, 'Staff Transport Maintenance Fee')
    ).rejects.toThrow(/Staff Transport Maintenance Fee/);
  });

  // A transport-level failure is NOT "the category does not exist", but it must
  // still stop the write rather than fall through to a null id.
  it('throws and preserves the driver message when the lookup itself fails', async () => {
    const svc = makeFakeSupabase(
      { billing_categories: [] },
      { errors: { billing_categories: { message: 'connection reset' } } }
    );

    await expect(
      resolveBillingCategoryId(svc as never, 'Transport Maintenance Fee')
    ).rejects.toThrow(/connection reset/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run lib/fees/billing-category.test.ts
```

Expected: FAIL — `Failed to resolve import "./billing-category"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/billing-category.ts`:

```ts
// lib/fees/billing-category.ts
// One place that turns a billing category NAME into an id.
//
// billing_categories is shared with MyJKKN and its ids differ per database, so
// TMS resolves by name at write time. Three call sites used to do this inline
// with `cat?.id ?? null`, which meant a renamed or unseeded category would
// insert thousands of bills carrying NO category — real money invisible to
// every category-keyed report, with no error raised anywhere. A missing
// category is a configuration failure, so it throws.

import type { SupabaseClient } from '@supabase/supabase-js';

export class MissingBillingCategoryError extends Error {
  constructor(
    public readonly categoryName: string,
    cause?: string
  ) {
    super(
      `Billing category "${categoryName}" was not found` +
        (cause ? ` (${cause})` : '') +
        '. Seed it in MyJKKN billing categories before generating transport bills or fines.'
    );
    this.name = 'MissingBillingCategoryError';
  }
}

/**
 * The id of the billing category named `categoryName`.
 *
 * @throws MissingBillingCategoryError when no row matches, or when the lookup
 *         itself fails. Callers must NOT swallow this into a null id.
 */
export async function resolveBillingCategoryId(
  svc: SupabaseClient,
  categoryName: string
): Promise<string> {
  const { data, error } = await svc
    .from('billing_categories')
    .select('id')
    .eq('category_name', categoryName)
    .maybeSingle();

  if (error) throw new MissingBillingCategoryError(categoryName, error.message);

  const id = (data as { id: string } | null)?.id;
  if (!id) throw new MissingBillingCategoryError(categoryName);

  return id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run lib/fees/billing-category.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/billing-category.ts lib/fees/billing-category.test.ts
git commit -m "feat(fees): add a fail-loud billing category resolver

Three call sites resolved a billing category with `cat?.id ?? null`, so a
renamed or unseeded category would insert bills carrying no category at all.
One resolver, one error type, no silent null.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DottJ9gra5QiUkYLmhgohE"
```

---

### Task 2: Rename the constants and decouple the fine

This is the heart of the change. `lib/fines/create.ts:166` currently reads `TRANSPORT_CATEGORY_NAME.student` — **the same constant the fee generator uses**. Changing that constant's value alone would drag the fine into the maintenance category, which is the exact opposite of the requirement, and every existing test would still pass. So the fine gets its own constant, and a regression test pins it.

`lib/fees/generate.ts:697` builds `bill_description` out of the category name itself, so renaming the constant changes the learner-visible wording with no second edit site. That is why three description assertions move in this task.

**Files:**
- Modify: `lib/fees/types.ts:109-113`
- Modify: `lib/fines/create.ts:13` (import) and `:166` (usage)
- Test: `lib/fees/generate.test.ts:328, :456, :509`
- Test: `lib/fines/create.test.ts` (new test appended to the `createFines` describe block)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `TRANSPORT_CATEGORY_NAME: Record<FeeAudience, string>` — now `{ student: 'Transport Maintenance Fee', staff: 'Staff Transport Maintenance Fee' }`.
  - `TRANSPORT_FINE_CATEGORY_NAME: string` — the literal `'Transport Fee'`. Task 3 imports this into `lib/fines/create.ts`.

- [ ] **Step 1: Write the failing tests**

**(a)** In `lib/fees/generate.test.ts`, change the three description assertions. Line 328:

```ts
    expect(bills[0][0].bill_description).toBe('Transport Maintenance Fee - 2026-2027');
```

Line 456:

```ts
    expect(bills[0][0].bill_description).toBe('Transport Maintenance Fee - 2026-2027 - Year 1');
```

Line 509:

```ts
    expect(row.bill_description).toBe('Transport Maintenance Fee - 2026-2027');
```

**(b)** In `lib/fines/create.test.ts`, add the import at the top of the file, next to the existing imports:

```ts
import { TRANSPORT_CATEGORY_NAME } from '@/lib/fees/types';
```

and append this test inside the `describe('createFines', ...)` block:

```ts
  // REGRESSION LOCK. The fine writer and the recurring-fee generator used to
  // read the SAME constant. Pointing the fee at 'Transport Maintenance Fee'
  // would have silently dragged fines along with it — the exact opposite of
  // what the split is for — and no existing test would have noticed.
  it('bills a fine to the Transport Fee category, never the maintenance one', async () => {
    const svc = makeFakeSupabase(baseData());

    await createFines(svc as never, input());

    const call = svc.calls.find((c) => c.table === 'billing_categories');
    expect(call).toBeDefined();
    const eq = call!.ops.find(([op]) => op === 'eq');
    expect(eq?.[1]).toEqual(['category_name', 'Transport Fee']);
    expect((eq?.[1] as unknown[])[1]).not.toBe(TRANSPORT_CATEGORY_NAME.student);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run lib/fees/generate.test.ts lib/fines/create.test.ts
```

Expected: the three `generate.test.ts` assertions FAIL with
`expected 'Transport Fee - 2026-2027' to be 'Transport Maintenance Fee - 2026-2027'`.
The new fine test PASSES already (the constant is still `'Transport Fee'`) — that is correct and expected. It is a lock, not a driver; its job is to fail in Step 4 if Step 3 is done carelessly.

- [ ] **Step 3: Change the constants and decouple the fine**

In `lib/fees/types.ts`, replace the block at lines 109-113:

```ts
// The transport billing categories (seeded in MyJKKN's shared
// billing_categories). Resolved by NAME at write time (ids differ per DB),
// then mapped: audience 'student' -> learner category, 'staff' -> staff one.
//
// This is the RECURRING charge only. Fines bill to
// TRANSPORT_FINE_CATEGORY_NAME below.
export const TRANSPORT_CATEGORY_NAME: Record<FeeAudience, string> = {
  student: 'Transport Maintenance Fee',
  staff: 'Staff Transport Maintenance Fee',
};

// The FINE ledger (tms_fee_fine) deliberately bills under a DIFFERENT category
// from the recurring maintenance fee above, so a penalty and a regular charge
// can be told apart in every category-keyed report.
//
// Do NOT collapse these back into one constant. Until 2026-09-12 both the fee
// generator and lib/fines/create.ts read TRANSPORT_CATEGORY_NAME.student, which
// is why renaming it alone would have moved fines too.
export const TRANSPORT_FINE_CATEGORY_NAME = 'Transport Fee';
```

In `lib/fines/create.ts`, change the import on line 13:

```ts
import { TRANSPORT_FINE_CATEGORY_NAME } from '@/lib/fees/types';
```

and the lookup on line 166:

```ts
    .eq('category_name', TRANSPORT_FINE_CATEGORY_NAME)
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run lib/fees/generate.test.ts lib/fines/create.test.ts
```

Expected: PASS. If the fine regression test fails here, `lib/fines/create.ts` is still reading `TRANSPORT_CATEGORY_NAME.student` — fix that, do not weaken the test.

- [ ] **Step 5: Run the whole fees + fines suite for collateral damage**

```bash
npx vitest run lib/fees lib/fines
```

Expected: PASS. Any other assertion mentioning `'Transport Fee - '` belongs to the recurring fee and should be updated the same way; an assertion mentioning `'Transport Fine — '` must be left alone.

- [ ] **Step 6: Commit**

```bash
git add lib/fees/types.ts lib/fines/create.ts lib/fees/generate.test.ts lib/fines/create.test.ts
git commit -m "feat(fees): split the fine category from the recurring transport fee

The recurring charge now bills to 'Transport Maintenance Fee' (and staff to
'Staff Transport Maintenance Fee'); fines keep 'Transport Fee'. Both used to
read one constant, so renaming it would have moved fines too. A regression
test in lib/fines/create.test.ts now pins the fine to its own category.

generate.ts composes bill_description from the category name, so learner-facing
bills read 'Transport Maintenance Fee - 2026-2027' from this commit onward.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DottJ9gra5QiUkYLmhgohE"
```

---

### Task 3: Wire the resolver into all three writers

**Files:**
- Modify: `lib/fees/generate.ts:14` (import), `:560-566`
- Modify: `lib/fees/staff-bill.ts:16` (import), `:232-247`, `:255-257`
- Modify: `lib/fines/create.ts` (import), `:163-168`
- Modify: `app/api/admin/fines/route.ts:80-83`
- Test: `lib/fees/generate.test.ts` (fixture + one new test)

**Interfaces:**
- Consumes: `resolveBillingCategoryId`, `MissingBillingCategoryError` from Task 1; `TRANSPORT_CATEGORY_NAME`, `TRANSPORT_FINE_CATEGORY_NAME` from Task 2.
- Produces: no new exports. `generateBills` keeps returning `{ ok: false, status: 500, error: string }`; `generateStaffBill` keeps returning `{ billingStatus: 'billed' | StaffUnbillableReason, inserted: number }`; `createFines` now **throws** `MissingBillingCategoryError` instead of writing uncategorised bills.

> **Why the fixture must change first:** `flatFixture()` in `generate.test.ts` supplies no `billing_categories` rows, so the lookup returns `null` today and the tests pass anyway. The moment the resolver throws, all ten `mode: 'generate'` tests break. Adding the row to the shared fixture fixes all ten at once.

- [ ] **Step 1: Add `billing_categories` to the shared generate fixture**

In `lib/fees/generate.test.ts`, inside `flatFixture()`, add one line to the `makeFakeSupabase({...})` object, next to `tms_fee_bill: []`:

```ts
    billing_categories: [{ id: 'cat-1', category_name: 'Transport Maintenance Fee' }],
```

- [ ] **Step 2: Write the failing test for the fail-loud path**

Append to `lib/fees/generate.test.ts`, at the end of the file:

```ts
describe('generateBills — missing billing category', () => {
  it('refuses to generate rather than writing uncategorised bills', async () => {
    // Same fixture, with the category row taken away.
    const svc = flatFixture({ billing_categories: [] });

    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1',
      mode: 'generate',
      actorId: 'admin-1',
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(500);
    expect(res.error).toMatch(/Transport Maintenance Fee/);

    // and nothing was written
    const inserts = svc.calls.filter(
      (c) => c.table === 'billing_student_bills' && c.ops.some(([op]) => op === 'insert')
    );
    expect(inserts).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run lib/fees/generate.test.ts -t 'missing billing category'
```

Expected: FAIL — `expected true to be false`. Generation currently succeeds with a null category.

- [ ] **Step 4: Wire the resolver into `lib/fees/generate.ts`**

Add to the import on line 14:

```ts
import { TRANSPORT_CATEGORY_NAME, type FeeAudience } from './types';
import { resolveBillingCategoryId } from './billing-category';
```

Replace lines 560-566 (the `catName` / `cat` / `categoryId` block):

```ts
    const catName = TRANSPORT_CATEGORY_NAME[fs.audience as FeeAudience];
    // Caught locally, not left to the outer catch: that one flattens everything
    // to 'Internal server error', and an unseeded category is a configuration
    // problem the admin can actually fix — if they are told which one.
    let categoryId: string;
    try {
      categoryId = await resolveBillingCategoryId(svc, catName);
    } catch (e) {
      console.error('Fee generation error (billing category):', e);
      return {
        ok: false,
        status: 500,
        error: e instanceof Error ? e.message : 'Billing category lookup failed.',
      };
    }
```

Nothing else changes: `categoryId` is already consumed at `:689` (`item_category_id`) and `:754` (`billing_category_id`), and its type narrows from `string | null` to `string`.

- [ ] **Step 5: Run the generate suite**

```bash
npx vitest run lib/fees/generate.test.ts
```

Expected: PASS, including the new test.

- [ ] **Step 6: Wire `lib/fees/staff-bill.ts`**

Add to the imports near line 16:

```ts
import { resolveBillingCategoryId } from './billing-category';
```

Replace lines 232-237 (`const catName` through the `maybeSingle()` call):

```ts
    const catName = TRANSPORT_CATEGORY_NAME['staff' as FeeAudience];
    const categoryId = await resolveBillingCategoryId(svc, catName);
```

Then at line ~246, change `categoryId: cat?.id ?? null,` to:

```ts
        categoryId,
```

And replace the bare `catch {` at line ~255 so the failure is no longer invisible:

```ts
  } catch (e) {
    // Was a bare `catch {}`. An unseeded billing category surfaced here as a
    // generic 'error' with nothing in the logs, which is how a configuration
    // problem turns into a mystery.
    console.error('[staff-bill] generateStaffBill failed:', e);
    return { billingStatus: 'error', inserted: 0 };
  }
```

- [ ] **Step 7: Wire `lib/fines/create.ts`**

Add to the imports near line 13:

```ts
import { resolveBillingCategoryId } from '@/lib/fees/billing-category';
```

Replace lines 163-168 (the `cat` lookup and `categoryId`):

```ts
  // Throws MissingBillingCategoryError. Deliberately NOT caught here: writing a
  // batch of uncategorised fines is worse than raising 500 to the caller.
  const categoryId = await resolveBillingCategoryId(svc, TRANSPORT_FINE_CATEGORY_NAME);
```

- [ ] **Step 8: Lock the fine writer's fail-loud path with a test**

Append to the `describe('createFines', ...)` block in `lib/fines/create.test.ts`:

```ts
  it('raises rather than writing uncategorised fines when the category is missing', async () => {
    const svc = makeFakeSupabase({ ...baseData(), billing_categories: [] });

    await expect(createFines(svc as never, input())).rejects.toThrow(/Transport Fee/);

    // and no money row was inserted
    const inserts = svc.calls.filter(
      (c) => c.table === 'billing_student_bills' && c.ops.some(([op]) => op === 'insert')
    );
    expect(inserts).toHaveLength(0);
  });
```

Run it:

```bash
npx vitest run lib/fines/create.test.ts -t 'uncategorised fines'
```

Expected: PASS, because Step 7 already made `createFines` throw. If it fails with "resolves instead of rejects", Step 7 was not applied.

- [ ] **Step 9: Surface the message in the fines route**

In `app/api/admin/fines/route.ts`, add to the imports:

```ts
import { MissingBillingCategoryError } from '@/lib/fees/billing-category';
```

and replace the `catch` block at lines 80-83:

```ts
  } catch (e) {
    console.error('Fine create error:', e);
    // A missing category is a configuration problem with an obvious fix, so the
    // admin gets told which category rather than 'Internal server error'.
    if (e instanceof MissingBillingCategoryError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
```

- [ ] **Step 10: Run the full suite and a scoped typecheck**

```bash
npx vitest run lib/fees lib/fines
npx tsc --noEmit --skipLibCheck lib/fees/billing-category.ts lib/fees/types.ts
```

Expected: vitest PASS. The `tsc` invocation reports only pre-existing project-wide noise — check that no error names one of the files you touched.

- [ ] **Step 11: Commit**

```bash
git add lib/fees/generate.ts lib/fees/staff-bill.ts lib/fines/create.ts app/api/admin/fines/route.ts lib/fees/generate.test.ts
git commit -m "feat(fees): fail loud when a transport billing category is missing

All three writers resolved the category with \`cat?.id ?? null\`, so an
unseeded name would have inserted ~2,800 bills with no category and no error.
They now share the resolver and stop. staff-bill.ts no longer swallows the
failure in a bare catch, and the fines route reports which category is missing
instead of 'Internal server error'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DottJ9gra5QiUkYLmhgohE"
```

---

### Task 4: Admin label touch-ups

Two screens name the category in prose. Neither has tests; both are verified by reading the rendered page in Task 7.

**Files:**
- Modify: `app/(admin)/fees/fee-structure-form.tsx:386`
- Modify: `app/(admin)/passengers/learners/[learnerId]/page.tsx:81`

**Interfaces:**
- Consumes: `TRANSPORT_CATEGORY_NAME` from Task 2.
- Produces: nothing.

- [ ] **Step 1: Drive the fee-structure helper text off the constant**

In `app/(admin)/fees/fee-structure-form.tsx`, add to the imports:

```ts
import { TRANSPORT_CATEGORY_NAME } from '@/lib/fees/types';
```

Line 386 currently reads:

```tsx
              {isStudent ? 'Bills go under the “Transport Fee” category.' : 'Staff are recorded for coverage; real staff billing is phase 2.'}
```

Replace with:

```tsx
              {isStudent
                ? `Bills go under the “${TRANSPORT_CATEGORY_NAME.student}” category. Fines are billed separately under “Transport Fee”.`
                : 'Staff are recorded for coverage; real staff billing is phase 2.'}
```

- [ ] **Step 2: Rename the learner detail field label**

In `app/(admin)/passengers/learners/[learnerId]/page.tsx`, line 81:

```tsx
            label="Transport Maintenance Fee"
```

- [ ] **Step 3: Verify the app compiles**

```bash
npx next build --no-lint 2>&1 | tail -30
```

Expected: build completes. (`next build` has `ignoreBuildErrors: true` for TypeScript, so read the output for *module* errors — a bad import path — rather than type errors.)

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/fees/fee-structure-form.tsx" "app/(admin)/passengers/learners/[learnerId]/page.tsx"
git commit -m "feat(fees): name the maintenance category in the admin screens

Helper text is derived from TRANSPORT_CATEGORY_NAME so it cannot drift from
what the generator actually writes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DottJ9gra5QiUkYLmhgohE"
```

---

### Task 5: Seed migration — additive, ships BEFORE the code

This migration is deliberately separate from the backfill and deliberately harmless to the **currently deployed** code, which still looks up `Transport Fee`. Seeding first means that when Tasks 1-4 deploy, the categories they ask for already exist. Seeding after would make every generation run fail loud until the migration lands.

**Files:**
- Create: `supabase/migrations/20260912_seed_transport_maintenance_fee_categories.sql`

**Interfaces:**
- Consumes: the existing `Transport Fee` row, as a template for `kind` and `frequency`.
- Produces: rows `Transport Maintenance Fee` and `Staff Transport Maintenance Fee` in `billing_categories`, which Task 6 and all three writers resolve by name.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260912_seed_transport_maintenance_fee_categories.sql`:

```sql
-- Seed the two recurring-transport billing categories.
--
-- Part 1 of 2. This file is ADDITIVE and safe to apply while the old code is
-- still deployed: nothing reads these rows until the code that names them ships.
-- Part 2 (20260912_backfill_transport_maintenance_fee_category.sql) moves the
-- existing bills and must run only AFTER that code is live.
--
-- once_per_learner is left at its column default of FALSE, and that is
-- load-bearing. billing_enforce_once_per_learner is a BEFORE INSERT OR UPDATE
-- trigger whose early-exit applies only while item_category_id is unchanged;
-- the backfill changes exactly that column, so the full duplicate check re-runs
-- on every row. With TRUE, every learner holding both a Term-1 and a Term-2
-- bill would abort the backfill with SQLSTATE BL001.
--
-- kind and frequency are cloned from the existing 'Transport Fee' row rather
-- than written literally, so the billing_category_kind enum label never has to
-- be spelled here.

begin;

insert into public.billing_categories (category_name, frequency, description, kind)
select
  v.category_name,
  coalesce(t.frequency, 'one-time'),
  v.description,
  coalesce(t.kind, 'other'::public.billing_category_kind)
from (values
  ('Transport Maintenance Fee',
   'Recurring transport maintenance charge for learners. Transport fines bill separately under "Transport Fee".'),
  ('Staff Transport Maintenance Fee',
   'Recurring transport maintenance charge for staff.')
) as v(category_name, description)
left join lateral (
  select bc.frequency, bc.kind
  from public.billing_categories bc
  where bc.category_name = 'Transport Fee'
  limit 1
) t on true
where not exists (
  select 1 from public.billing_categories bc2
  where bc2.category_name = v.category_name
);

do $$
declare
  v_missing text;
begin
  select string_agg(name, ', ')
    into v_missing
  from (values ('Transport Maintenance Fee'), ('Staff Transport Maintenance Fee')) as n(name)
  where not exists (
    select 1 from public.billing_categories bc where bc.category_name = n.name
  );

  if v_missing is not null then
    raise exception 'Seed failed, categories still missing: %', v_missing;
  end if;

  -- The backfill in part 2 depends on this being false. Fail here, where the
  -- fix is one UPDATE, rather than mid-backfill with BL001.
  if exists (
    select 1 from public.billing_categories
    where category_name in ('Transport Maintenance Fee', 'Staff Transport Maintenance Fee')
      and once_per_learner is true
  ) then
    raise exception 'A new transport category has once_per_learner = true; the backfill would abort with BL001';
  end if;
end $$;

commit;
```

- [ ] **Step 2: Apply it to the live database**

Apply via the Supabase `apply_migration` tool with name `seed_transport_maintenance_fee_categories` and the SQL above.

> This is a write against the real production database. It is additive — two new rows, nothing updated or deleted.

- [ ] **Step 3: Verify the rows landed with the right shape**

Run:

```sql
select category_name, kind, frequency, collection_type,
       once_per_learner, is_active, visible_to_learners, applies_to
from billing_categories
where category_name in (
  'Transport Fee', 'Staff Transport Fee',
  'Transport Maintenance Fee', 'Staff Transport Maintenance Fee'
)
order by category_name;
```

Expected: 4 rows. Both new rows must show `kind = transport`, `collection_type = management`, `once_per_learner = false`, `is_active = true`, `applies_to = {college}`.

- [ ] **Step 4: Confirm nothing moved yet**

```sql
select bc.category_name, count(*) n
from billing_student_bills b join billing_categories bc on bc.id = b.item_category_id
where b.transport_year_id is not null
group by 1;
```

Expected: exactly one row — `Transport Fee`, 2817. The seed must not have moved any money.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260912_seed_transport_maintenance_fee_categories.sql
git commit -m "feat(fees): seed the Transport Maintenance Fee billing categories

Part 1 of 2, additive and safe against the currently deployed code. Applied to
the live database. The backfill is a separate migration that must run only
after the renaming code is live.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DottJ9gra5QiUkYLmhgohE"
```

---

### Task 6: Backfill migration — runs AFTER the code is live

**STOP.** Do not start this task until Tasks 1-5 are merged to `main` and deployed. Between the backfill and the deploy, any bill the auto-generate cron creates with the *old* code would land on `Transport Fee` — the fines category. Confirm the deploy first.

**Files:**
- Create: `supabase/migrations/20260912_backfill_transport_maintenance_fee_category.sql`

**Interfaces:**
- Consumes: the two categories seeded in Task 5.
- Produces: undo table `tms_bill_category_backfill_20260912` with columns
  `(bill_id uuid, old_item_category_id uuid, old_bill_description text, tms_fee_bill_id uuid, old_billing_category_id uuid, snapshot_at timestamptz)`.

- [ ] **Step 1: Capture the before-state**

Run and **save the output** — this is the number you reconcile against afterwards:

```sql
select bc.category_name,
       count(*) filter (where fb.id is not null) as fee_bills,
       count(*) filter (where f.id  is not null) as fine_bills,
       sum(b.final_amount) filter (where b.status = 'paid') as paid_amount
from billing_student_bills b
join billing_categories bc on bc.id = b.item_category_id
left join tms_fee_bill  fb on fb.billing_student_bill_id = b.id
left join tms_fee_fine  f  on f.billing_student_bill_id  = b.id
where b.transport_year_id is not null
group by 1;
```

Expected before: `Transport Fee` — fee_bills 2791, fine_bills 26, paid_amount 6084650.00.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260912_backfill_transport_maintenance_fee_category.sql`:

```sql
-- Move the 2026-2027 recurring transport bills onto 'Transport Maintenance Fee'
-- and leave the fines behind on 'Transport Fee'.
--
-- Part 2 of 2. Requires 20260912_seed_transport_maintenance_fee_categories.sql
-- AND the code that writes the new category name to be deployed first.
--
-- Fee and fine are separated by LEDGER MEMBERSHIP (a row in tms_fee_bill), never
-- by bill_description text: descriptions carry a human-entered fine reason and
-- can be edited, ledger membership cannot.
--
-- Undo: tms_bill_category_backfill_20260912 holds every prior value.

begin;

create table if not exists public.tms_bill_category_backfill_20260912 (
  bill_id                 uuid,
  old_item_category_id    uuid,
  old_bill_description    text,
  tms_fee_bill_id         uuid,
  old_billing_category_id uuid,
  snapshot_at             timestamptz not null default now()
);

do $$
declare
  v_year_id    uuid;
  v_old_cat    uuid;
  v_new_cat    uuid;
  v_staff_old  uuid;
  v_staff_new  uuid;
  v_bills      int;
  v_ledger     int;
  v_left       int;
  v_fines_moved int;
  v_desc       int;
  v_ledger_left int;
begin
  select id into v_year_id from public.tms_transport_year where is_current = true;
  if v_year_id is null then
    raise exception 'No current transport year (tms_transport_year.is_current); refusing to guess';
  end if;

  select id into v_old_cat   from public.billing_categories where category_name = 'Transport Fee';
  select id into v_new_cat   from public.billing_categories where category_name = 'Transport Maintenance Fee';
  select id into v_staff_old from public.billing_categories where category_name = 'Staff Transport Fee';
  select id into v_staff_new from public.billing_categories where category_name = 'Staff Transport Maintenance Fee';

  if v_new_cat is null or v_staff_new is null then
    raise exception 'Run 20260912_seed_transport_maintenance_fee_categories.sql first';
  end if;

  ---------------------------------------------------------------------------
  -- 1. Undo snapshot. Re-runnable: skips rows already captured.
  ---------------------------------------------------------------------------
  insert into public.tms_bill_category_backfill_20260912
    (bill_id, old_item_category_id, old_bill_description, tms_fee_bill_id, old_billing_category_id)
  select b.id, b.item_category_id, b.bill_description, fb.id, fb.billing_category_id
  from public.tms_fee_bill fb
  left join public.billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.transport_year_id = v_year_id
    and not exists (
      select 1 from public.tms_bill_category_backfill_20260912 u
      where u.tms_fee_bill_id = fb.id
    );

  ---------------------------------------------------------------------------
  -- 2. The money rows. Three nested replacements, in this order:
  --      a. 'Transport Fee' prefix        -> 'Transport Maintenance Fee'
  --      b. a stale '2025-2026' label     -> '2026-2027'   (5 rows)
  --      c. any ' <spaces>-<spaces> '     -> ' - '         (6 double-space rows)
  ---------------------------------------------------------------------------
  update public.billing_student_bills b
     set item_category_id = v_new_cat,
         bill_description = regexp_replace(
           regexp_replace(
             regexp_replace(b.bill_description, '^Transport Fee', 'Transport Maintenance Fee'),
             '2025-2026', '2026-2027'
           ),
           '\s+-\s+', ' - ', 'g'
         )
    from public.tms_fee_bill fb
   where fb.billing_student_bill_id = b.id
     and fb.transport_year_id = v_year_id
     and b.item_category_id = v_old_cat;
  get diagnostics v_bills = row_count;

  ---------------------------------------------------------------------------
  -- 3. The TMS ledger's own copy of the category. Leaving this stale would make
  --    the two ledgers disagree about the same bill.
  ---------------------------------------------------------------------------
  update public.tms_fee_bill fb
     set billing_category_id = case
           when fb.person_type = 'staff' then v_staff_new
           else v_new_cat
         end
   where fb.transport_year_id = v_year_id
     and fb.billing_category_id in (v_old_cat, v_staff_old);
  get diagnostics v_ledger = row_count;

  raise notice 'Backfilled % money rows and % ledger rows', v_bills, v_ledger;

  ---------------------------------------------------------------------------
  -- 4. Assert, or roll the whole thing back.
  ---------------------------------------------------------------------------
  select count(*) into v_left
  from public.tms_fee_bill fb
  join public.billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.transport_year_id = v_year_id and b.item_category_id = v_old_cat;
  if v_left > 0 then
    raise exception 'Incomplete: % fee bills still carry the old category', v_left;
  end if;

  select count(*) into v_fines_moved
  from public.tms_fee_fine f
  join public.billing_student_bills b on b.id = f.billing_student_bill_id
  where b.item_category_id is distinct from v_old_cat;
  if v_fines_moved > 0 then
    raise exception 'Wrong rows moved: % fine bills left the Transport Fee category', v_fines_moved;
  end if;

  select count(*) into v_desc
  from public.tms_fee_bill fb
  join public.billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.transport_year_id = v_year_id
    and b.bill_description like 'Transport Fee%';
  if v_desc > 0 then
    raise exception 'Incomplete: % fee bill descriptions still read "Transport Fee"', v_desc;
  end if;

  select count(*) into v_ledger_left
  from public.tms_fee_bill
  where transport_year_id = v_year_id
    and billing_category_id in (v_old_cat, v_staff_old);
  if v_ledger_left > 0 then
    raise exception 'Incomplete: % ledger rows still carry an old category', v_ledger_left;
  end if;
end $$;

commit;
```

- [ ] **Step 3: Apply it to the live database**

Apply via the Supabase `apply_migration` tool with name `backfill_transport_maintenance_fee_category` and the SQL above.

Expected: success, with a `NOTICE` reporting `2791` money rows and `2829` ledger rows. Any `raise exception` rolls the entire migration back and nothing is written — read the message, fix the cause, re-apply.

- [ ] **Step 4: Reconcile against the Step 1 numbers**

Re-run the Step 1 query.

Expected after:

| category_name | fee_bills | fine_bills | paid_amount |
|---|---|---|---|
| `Transport Maintenance Fee` | 2791 | 0 | 6084650.00 |
| `Transport Fee` | 0 | 26 | (fines only) |

The `fee_bills` total and `paid_amount` must match Step 1 exactly. A different total means rows were missed or over-matched.

- [ ] **Step 5: Verify the descriptions and the undo table**

```sql
select bill_description, count(*) n
from billing_student_bills
where transport_year_id is not null
group by 1 order by n desc;

select count(*) as undo_rows,
       count(distinct bill_id) as bills_captured
from tms_bill_category_backfill_20260912;
```

Expected: every recurring description begins `Transport Maintenance Fee`, no `2025-2026` label survives, no double-space variants survive, and fines still read `Transport Fine — …`. The undo table holds 2,829 rows covering 2,791 distinct bills (staff ledger rows have a null `bill_id`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260912_backfill_transport_maintenance_fee_category.sql
git commit -m "feat(fees): backfill 2026-2027 transport bills to the maintenance category

2,791 money rows and 2,829 ledger rows moved to 'Transport Maintenance Fee';
the 26 fine bills stay on 'Transport Fee'. Descriptions re-prefixed, with 5
stale 2025-2026 labels and 6 double-space separators normalised in the same
pass. Applied to the live database; undo values in
tms_bill_category_backfill_20260912.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DottJ9gra5QiUkYLmhgohE"
```

---

### Task 7: End-to-end verification

**Files:** none modified.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full test suite**

```bash
npx vitest run
```

Expected: PASS. Record the total count; compare it against the pre-change baseline so a silently skipped file is visible.

- [ ] **Step 2: Production build**

```bash
npx next build --no-lint 2>&1 | tail -20
```

Expected: build completes.

- [ ] **Step 3: Re-run every migration assertion as a read-only query**

```sql
with y as (select id from tms_transport_year where is_current = true)
select
  (select count(*) from tms_fee_bill fb
     join billing_student_bills b on b.id = fb.billing_student_bill_id
     join billing_categories bc on bc.id = b.item_category_id
    where bc.category_name = 'Transport Fee')                            as fee_bills_on_fine_category,
  (select count(*) from tms_fee_fine f
     join billing_student_bills b on b.id = f.billing_student_bill_id
     join billing_categories bc on bc.id = b.item_category_id
    where bc.category_name <> 'Transport Fee')                           as fines_off_fine_category,
  (select count(*) from tms_fee_bill fb
     join billing_student_bills b on b.id = fb.billing_student_bill_id
    where b.bill_description like 'Transport Fee%')                      as stale_descriptions,
  (select count(*) from tms_fee_bill fb
     join billing_categories bc on bc.id = fb.billing_category_id, y
    where fb.transport_year_id = y.id
      and bc.category_name in ('Transport Fee', 'Staff Transport Fee'))  as stale_ledger_rows;
```

Expected: `0, 0, 0, 0`.

- [ ] **Step 4: Confirm the access gate is unchanged**

The portal gate reads `tms_fee_bill`, never the category, so its answers must be identical. Spot-check one learner who was blocked and one who was not:

```sql
select p.id, tms_transport_access_for_learner(p.id) ->> 'reason' as reason
from learners_profiles p
where p.bus_required = true
order by p.id
limit 5;
```

Expected: reasons are drawn from `current`, `term1_unpaid`, `overdue`, `term1_not_billed` — the same vocabulary as before. **No** reason should be `no_bills` for a learner who holds bills.

- [ ] **Step 5: Browser smoke test — hand off to the user**

The agent's Chrome session is not authenticated against this app, so this step needs the user's browser. Ask them to check, and report what they see:

1. `/bill-management` → **Bills** view lists the 2026-2027 bills, amounts unchanged.
2. `/bill-management` → **Fines** view still lists the 25 active fines.
3. `/bill-management` → **Analytics** view renders without error.
4. `/fees/new` → the helper text under the audience selector reads *"Bills go under the "Transport Maintenance Fee" category. Fines are billed separately under "Transport Fee"."*
5. A learner detail page under `/passengers/learners/<id>` shows the field labelled **Transport Maintenance Fee**.
6. In MyJKKN, a learner's bill list shows **Transport Maintenance Fee - 2026-2027** where it used to read *Transport Fee - 2026-2027*.

- [ ] **Step 6: Tell the billing team**

The `Transport Fee` category in MyJKKN now totals only the fines (~₹1L) instead of ₹87.8L. Nothing is broken, but anyone who recognises that category by name will see it shrink. Send a one-line heads-up before they find it in a report.

---

## Rollback

If the split has to be undone, reverse it in this order:

```sql
begin;

update billing_student_bills b
   set item_category_id = u.old_item_category_id,
       bill_description = u.old_bill_description
  from tms_bill_category_backfill_20260912 u
 where u.bill_id = b.id;

update tms_fee_bill fb
   set billing_category_id = u.old_billing_category_id
  from tms_bill_category_backfill_20260912 u
 where u.tms_fee_bill_id = fb.id;

commit;
```

Then revert the code commits. The two seeded categories can stay — they carry no bills after the rollback and deleting them is unnecessary risk.
