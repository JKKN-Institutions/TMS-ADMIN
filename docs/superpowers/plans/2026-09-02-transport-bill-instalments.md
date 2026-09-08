# Transport Bill Instalments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate one transport bill per learner per year, with the structure's terms written as `billing_bill_instalments` child rows, matching the college schedule-bill format.

**Architecture:** Fee-structure configuration is unchanged — `resolvePersonTerms()` already returns a `BillableTerm[]` for all three fee modes. A new pure function folds that array into one bill plus N instalments, and the generator writes that instead of N bills. The two portal gates that encode "term 1 is paid" as a whole-bill status move onto per-instalment settlement state. A backfill migration converts the 490 current-year learners who have no payment activity.

**Tech Stack:** Next.js 15, TypeScript, Supabase (service-role writes, plpgsql SECURITY DEFINER RPCs), vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-transport-bill-instalments-design.md`

## Global Constraints

- **All instalments of a bill MUST be written in ONE array insert.** `trg_bbi_validate_sum` is `DEFERRABLE INITIALLY DEFERRED` and requires `sum(amount) == billing_student_bills.final_amount`. Inserting instalments one at a time fails on the first row.
- **`tms_fee_bill` is ONE row per bill.** `uq_tms_fee_bill_billing_student_bill` is a unique index on `billing_student_bill_id`; two ledger rows cannot share one bill. New learner rows use `term_no = 1` and `amount` = the year total.
- **Never delete a `tms_fee_bill` row that has a linked billing row.** It aborts with Postgres `27000`. Delete the `billing_student_bills` row; the ledger row goes by FK cascade.
- **Every read path must tolerate BOTH shapes** — a bill with instalments and a bill without. The 15 part-paid learners and all pre-change bills keep the old shape until year end.
- **The gates stay fail-closed.** Never billed means not cleared. A load error must throw, never resolve to an empty set — an empty set locks out every learner.
- **Staff are out of scope.** Do not modify `lib/fees/staff-bill.ts`, `lib/fees/cancel-staff-bill.ts`, `app/api/boarding/fees/`, `app/boarding/fees/`, or the staff branch of any code.
- **Do not add `fn_list_transport_collectables` to this repo.** It is MyJKKN-owned. A `CREATE OR REPLACE` replay here raises "cannot change return type of existing function" and halts every queued migration.
- **Verification commands:** `npm run test` and `npm run build`. `npm run lint` is broken in this repo (circular config) and `tsc` is chronically red on main — neither is a regression signal.
- **Chunk every `.in()` to ≤150 ids and check the error.** 500+ UUIDs return HTTP 400, which an unchecked `{ data }` reads as an empty set.

---

### Task 1: The pure fold — terms into one bill

Turns a `BillableTerm[]` into the shape the generator writes. Pure, no database, so the money arithmetic is testable on its own.

**Files:**
- Create: `lib/fees/instalments.ts`
- Test: `lib/fees/instalments.test.ts`

**Interfaces:**
- Consumes: `BillableTerm` from `lib/fees/resolve-terms.ts` (`{ term_no, term_label, amount, due_date }`).
- Produces:
  - `foldTermsIntoBill(terms: BillableTerm[]): FoldedBill | null`
  - `interface FoldedBill { total: number; dueDate: string; instalments: FoldedInstalment[] }`
  - `interface FoldedInstalment { sequence_no: number; amount: number; due_date: string; label: string | null }`
  - `allocateWaterfall(paid: number, instalments: Array<{ amount: number }>): number[]`

- [ ] **Step 1: Write the failing test**

Create `lib/fees/instalments.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { foldTermsIntoBill, allocateWaterfall } from './instalments';

const T = (term_no: number, amount: number, due_date: string, term_label: string | null = null) =>
  ({ term_no, term_label, amount, due_date });

describe('foldTermsIntoBill', () => {
  it('sums the terms and dates the bill from the earliest one', () => {
    const f = foldTermsIntoBill([T(1, 2750, '2026-07-31'), T(2, 2750, '2026-08-31')]);
    expect(f).not.toBeNull();
    expect(f!.total).toBe(5500);
    expect(f!.dueDate).toBe('2026-07-31');
    expect(f!.instalments).toHaveLength(2);
  });

  it('orders instalments by due date, then renumbers sequence_no from 1', () => {
    // A structure may list terms out of order; the platform allocates payments
    // by (due_date, sequence_no), so the two must agree or the waterfall pays
    // the wrong instalment first.
    const f = foldTermsIntoBill([T(2, 2500, '2026-08-31', 'Term 2'), T(1, 3000, '2026-07-31', 'Term 1')]);
    expect(f!.instalments.map((i) => i.sequence_no)).toEqual([1, 2]);
    expect(f!.instalments.map((i) => i.due_date)).toEqual(['2026-07-31', '2026-08-31']);
    expect(f!.instalments.map((i) => i.label)).toEqual(['Term 1', 'Term 2']);
  });

  it('makes the instalments sum EXACTLY to the total, absorbing rounding in the last', () => {
    // trg_bbi_validate_sum rejects the whole insert otherwise.
    const f = foldTermsIntoBill([T(1, 1633.33, '2026-07-31'), T(2, 1633.33, '2026-08-31'), T(3, 1633.34, '2026-09-30')]);
    const sum = f!.instalments.reduce((s, i) => s + i.amount, 0);
    expect(sum).toBe(f!.total);
  });

  it('returns a single instalment for a one-term structure', () => {
    const f = foldTermsIntoBill([T(1, 5500, '2026-08-31', 'Term 1')]);
    expect(f!.total).toBe(5500);
    expect(f!.instalments).toEqual([
      { sequence_no: 1, amount: 5500, due_date: '2026-08-31', label: 'Term 1' },
    ]);
  });

  it('returns null for no terms, so a caller cannot write a zero bill', () => {
    expect(foldTermsIntoBill([])).toBeNull();
  });

  it('returns null when the terms total zero or less', () => {
    // billing_bill_instalments has CHECK (amount > 0) and a zero bill is not a debt.
    expect(foldTermsIntoBill([T(1, 0, '2026-07-31')])).toBeNull();
  });
});

describe('allocateWaterfall', () => {
  it('fills instalments oldest-first', () => {
    expect(allocateWaterfall(2750, [{ amount: 2750 }, { amount: 2750 }])).toEqual([2750, 0]);
  });

  it('splits a payment that lands mid-instalment', () => {
    expect(allocateWaterfall(4000, [{ amount: 2750 }, { amount: 2750 }])).toEqual([2750, 1250]);
  });

  it('never allocates more than an instalment is worth', () => {
    expect(allocateWaterfall(99999, [{ amount: 2750 }, { amount: 2750 }])).toEqual([2750, 2750]);
  });

  it('treats a negative or absent paid amount as zero', () => {
    expect(allocateWaterfall(-5, [{ amount: 100 }])).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- lib/fees/instalments.test.ts`
Expected: FAIL — `Failed to resolve import "./instalments"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/instalments.ts`:

```ts
// lib/fees/instalments.ts
// Folding a fee structure's terms into ONE bill plus its instalment schedule.
//
// The shared billing platform holds a year's payment timeline as child rows of a
// single bill (billing_bill_instalments), not as separate bills. Two platform
// rules drive everything here:
//
//   1. trg_bbi_validate_sum requires sum(instalment.amount) == bill.final_amount
//      EXACTLY, so the last instalment absorbs rounding.
//   2. Payments are allocated by (due_date, sequence_no) — see
//      billing_bill_instalment_state — so sequence_no must follow due date, or
//      a payment settles the wrong instalment.
//
// Pure by design: no client, no clock. The generator supplies the terms.

import type { BillableTerm } from './resolve-terms';

export interface FoldedInstalment {
  sequence_no: number;
  amount: number;
  due_date: string;
  label: string | null;
}

export interface FoldedBill {
  /** The year total — billing_student_bills.final_amount. */
  total: number;
  /** The first instalment's date. The platform advances this as instalments settle. */
  dueDate: string;
  instalments: FoldedInstalment[];
}

/** Round to paise. Money arithmetic in JS floats drifts otherwise. */
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Fold a person's resolved terms into one bill.
 *
 * Returns null when there is nothing billable — no terms, or a total of zero or
 * less. A null result must never be written: `billing_bill_instalments` has
 * CHECK (amount > 0), and a zero bill is not a debt.
 */
export function foldTermsIntoBill(terms: BillableTerm[]): FoldedBill | null {
  if (!terms.length) return null;

  // Sort by due date so sequence_no and the platform's allocation order agree.
  // term_no breaks ties, keeping two same-day terms in their configured order.
  const ordered = [...terms].sort(
    (a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.term_no - b.term_no)
  );

  const total = money(ordered.reduce((s, t) => s + Number(t.amount), 0));
  if (total <= 0) return null;

  let allocated = 0;
  const instalments = ordered.map((t, i) => {
    // The last instalment takes the remainder, so the sum is exact by
    // construction rather than by luck of rounding.
    const amount = i === ordered.length - 1 ? money(total - allocated) : money(Number(t.amount));
    allocated = money(allocated + amount);
    return {
      sequence_no: i + 1,
      amount,
      due_date: t.due_date,
      label: t.term_label,
    };
  });

  return { total, dueDate: ordered[0].due_date, instalments };
}

/**
 * How a bill's single paid amount lands across its instalments: oldest first,
 * never more than an instalment is worth. Mirrors the database function
 * billing_bill_instalment_state so the UI and the gate agree with the platform.
 *
 * Callers must pass instalments already in (due_date, sequence_no) order.
 */
export function allocateWaterfall(
  paid: number,
  instalments: Array<{ amount: number }>
): number[] {
  let left = Math.max(0, Number(paid) || 0);
  return instalments.map((i) => {
    const take = money(Math.min(left, Number(i.amount) || 0));
    left = money(left - take);
    return take;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- lib/fees/instalments.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/instalments.ts lib/fees/instalments.test.ts
git commit -m "feat(fees): fold a structure's terms into one bill with instalments"
```

---

### Task 2: Generator writes one bill plus instalments

The write path. This is where the bill grain actually changes.

**Files:**
- Modify: `lib/fees/generate.ts` (the `for (const r of resolved)` loop at ~line 598, the `billedKey` construction at ~line 406, and the two `toGenerate`/`projectedBornOverdue` counters at ~lines 448 and 471)
- Test: `lib/fees/generate.test.ts` (add a new describe block; do not alter existing assertions)

**Interfaces:**
- Consumes: `foldTermsIntoBill` from Task 1.
- Produces: no new exports. `GenerateOutcome` keeps its current keys; `learnerBilled` now counts **bills**, not term-rows.

- [ ] **Step 1: Write the failing test**

Append to `lib/fees/generate.test.ts`:

```ts
describe('generateBills — learner bills are one bill with instalments', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T06:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function inserts(svc: ReturnType<typeof makeFakeSupabase>, table: string) {
    return svc.calls
      .filter((c) => c.table === table)
      .flatMap((c) => c.ops.filter(([op]) => op === 'insert').map(([, args]) => args[0]));
  }

  it('writes ONE billing_student_bills row per learner for a two-term structure', async () => {
    const svc = flatFixture();
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1',
      mode: 'generate',
      actorId: 'admin-1',
    });
    expect(res.ok).toBe(true);

    const bills = inserts(svc, 'billing_student_bills') as Array<Record<string, unknown>[]>;
    // Two learners in the fixture, two terms each -> 2 bills, not 4.
    expect(bills).toHaveLength(2);
    expect(bills[0][0].final_amount).toBe(5500);
    expect(bills[0][0].balance_amount).toBe(5500);
    expect(bills[0][0].due_date).toBe('2026-07-31');
  });

  it('writes every instalment of a bill in ONE array insert', async () => {
    // trg_bbi_validate_sum is deferrable: one row at a time fails the sum check.
    const svc = flatFixture();
    await generateBills(svc as never, { feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1' });

    const batches = inserts(svc, 'billing_bill_instalments') as Array<Record<string, unknown>[]>;
    expect(batches).toHaveLength(2); // one batch per learner
    expect(batches[0]).toHaveLength(2); // both instalments in that batch
    expect(batches[0].map((i) => i.sequence_no)).toEqual([1, 2]);
    expect(batches[0].map((i) => i.amount)).toEqual([3000, 2500]);
    expect(batches[0].map((i) => i.due_date)).toEqual(['2026-07-31', '2026-08-31']);
  });

  it('writes ONE tms_fee_bill row carrying the YEAR total, at term_no 1', async () => {
    // uq_tms_fee_bill_billing_student_bill forbids two ledger rows per bill.
    const svc = flatFixture();
    await generateBills(svc as never, { feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1' });

    const ledger = inserts(svc, 'tms_fee_bill') as Array<Record<string, unknown>[]>;
    expect(ledger).toHaveLength(2);
    expect(ledger[0][0].term_no).toBe(1);
    expect(ledger[0][0].amount).toBe(5500);
    expect(ledger[0][0].due_date).toBe('2026-07-31');
  });

  it('names the bill with the transport year and no term suffix', async () => {
    // The year must survive: term_number is NULL on transport bills and
    // transport_year_id is unreliable there, so this text is the only record.
    const svc = flatFixture();
    await generateBills(svc as never, { feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1' });
    const bills = inserts(svc, 'billing_student_bills') as Array<Record<string, unknown>[]>;
    expect(bills[0][0].bill_description).toBe('Transport Fee - 2026-2027');
  });

  it('deletes the bill when the instalment insert fails, leaving no orphan', async () => {
    const failing = makeFakeSupabase(
      {
        tms_fee_structure: [{
          id: 'fs1', name: 'Transport Fees Test', status: 'active', audience: 'student',
          fee_mode: 'flat', transport_year_id: 'ty1', institution_ids: null,
          staff_role_keys: null, lifecycle_statuses: null,
        }],
        tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
        tms_fee_structure_term: [
          { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
          { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31', year_band_id: null },
        ],
        learners_profiles: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
        admission_years: [],
        tms_fee_override: [],
        tms_fee_bill: [],
      },
      { insertErrors: { billing_bill_instalments: { message: 'sum mismatch' } } }
    );

    const res = await generateBills(failing as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.data as Record<string, unknown>).errors).toBe(1);
    expect((res.data as Record<string, unknown>).learnerBilled).toBe(0);
    // The money row must have been compensated away.
    const deletes = failing.calls.filter(
      (c) => c.table === 'billing_student_bills' && c.ops.some(([op]) => op === 'delete')
    );
    expect(deletes).toHaveLength(1);
  });

  it('skips a learner who already has ANY ledger row for the structure and year', async () => {
    // Idempotency is person-level now: a legacy learner with term 1 AND term 2
    // rows must not be re-billed as a single merged bill.
    const svc = flatFixture({ tms_fee_bill: [{ person_id: 'L1', term_no: 1 }, { person_id: 'L1', term_no: 2 }] });
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.data as Record<string, unknown>).learnerBilled).toBe(1); // only L2
    expect((res.data as Record<string, unknown>).skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- lib/fees/generate.test.ts`
Expected: the new block FAILS (2 bills expected, 4 written; no `billing_bill_instalments` inserts). Existing characterization tests in the file must still PASS except the dry-run pair counters — note any that fail, they are addressed in Step 3.

- [ ] **Step 3: Write the implementation**

In `lib/fees/generate.ts`:

**3a.** Add the import beside the other `lib/fees` imports at the top of the file:

```ts
import { foldTermsIntoBill } from './instalments';
```

**3b-pre.** The transport year name must appear in `bill_description`. Today the description carries the ACADEMIC year, which is often NULL — and `billing_student_bills.term_number` is NULL and `transport_year_id` is unreliable on transport bills, so the description text is the only dependable carrier of which year a bill belongs to. Dropping the term suffix without adding the year would leave some bills with no year at all.

At `lib/fees/generate.ts:112-116`, extend the existing query to fetch the name too:

```ts
      .from('tms_transport_year')
      .select('start_date, name')
      .eq('id', fs.transport_year_id)
      .maybeSingle();
    const tyStart: string | null = ty?.start_date ?? null;
    // Carried into bill_description: term_number is NULL on transport bills and
    // transport_year_id is unreliable there, so the description text is the only
    // dependable record of which year a bill belongs to.
    const tyName: string | null = (ty as { name?: string } | null)?.name ?? null;
    const currentYear = currentYearOf(tyStart);
```

**3b.** Replace the `billedKey` construction (~line 406) so learners are keyed by person and staff stay keyed by term:

```ts
    // Learners now get ONE bill per structure+year, so their idempotency key is
    // the person alone — a legacy learner with separate term-1 and term-2 rows
    // must not be re-billed as a merged bill. Staff keep the per-term grain.
    const billedKey = new Set(
      (existing ?? []).map((r) => `${r.person_id}:${r.term_no}`)
    );
    const billedPersons = new Set((existing ?? []).map((r) => r.person_id as string));
    const alreadyBilledPerson = (personId: string, personType: string, termNo: number) =>
      personType === 'learner' ? billedPersons.has(personId) : billedKey.has(`${personId}:${termNo}`);
```

**3c.** Replace the `toGenerate` / `alreadyBilled` counting loop (~line 448):

```ts
    let toGenerate = 0;
    let alreadyBilled = 0;
    for (const r of resolved) {
      if (r.person.person_type === 'learner') {
        // One bill per learner, regardless of how many terms it holds.
        if (billedPersons.has(r.person.person_id)) alreadyBilled++;
        else if (foldTermsIntoBill(r.terms)) toGenerate++;
      } else {
        for (const t of r.terms) {
          if (billedKey.has(`${r.person.person_id}:${t.term_no}`)) alreadyBilled++;
          else toGenerate++;
        }
      }
    }
```

**3d.** Replace the `projectedBornOverdue` reducer (~line 471). A learner's bill is born overdue when its FIRST instalment is already past due:

```ts
    const today = istToday();
    const projectedBornOverdue = resolved.reduce((n, r) => {
      if (r.person.person_type === 'learner') {
        if (billedPersons.has(r.person.person_id)) return n;
        const folded = foldTermsIntoBill(r.terms);
        return n + (folded && folded.dueDate < today ? 1 : 0);
      }
      return (
        n +
        countBornOverdue(
          r.terms.filter((t) => !billedKey.has(`${r.person.person_id}:${t.term_no}`)),
          today
        )
      );
    }, 0);
```

**3e.** Replace the whole learner branch inside the `for (const r of resolved)` write loop (~lines 598-693). The staff `else` branch is unchanged; only the learner half and the loop shape change:

```ts
    for (const r of resolved) {
      const p = r.person;
      const bandPrefix = r.band?.label ? `${r.band.label} - ` : '';
      const acadYearId = p.person_type === 'learner' ? p.academic_year_id : null;
      const acadYearName = acadYearId ? acadYearNameById.get(acadYearId) ?? null : null;
      const ayPart = acadYearName ? `${acadYearName} - ` : '';

      if (p.person_type === 'learner') {
        if (billedPersons.has(p.person_id)) { skipped++; continue; }

        // One bill for the whole year; the terms become its instalments.
        const folded = foldTermsIntoBill(r.terms);
        if (!folded) { skipped++; continue; }

        const { data: bill, error: billErr } = await svc
          .from('billing_student_bills')
          .insert([{
            student_id: p.person_id,
            institution_id: p.institution_id,
            item_category_id: categoryId,
            fee_source: 'ad_hoc',
            // No term suffix: the schedule lives in billing_bill_instalments now.
            // The transport year is named explicitly so the description keeps
            // carrying the year even when academic_year_id is NULL.
            bill_description: `${catName} - ${tyName ?? ayPart.replace(/ - $/, '')} ${bandPrefix}`
              .replace(/\s+/g, ' ')
              .replace(/[\s-]+$/, '')
              .trim(),
            due_date: folded.dueDate,
            quantity: 1,
            unit_amount: folded.total,
            total_amount: folded.total,
            tax_amount: 0,
            final_amount: folded.total,
            balance_amount: folded.total,
            status: 'unpaid',
            academic_year_id: acadYearId,
            transport_year_id: fs.transport_year_id,
            created_by: opts.actorId,
          }])
          .select('id')
          .single();
        if (billErr || !bill) { errors++; continue; }

        // EVERY instalment in ONE insert: trg_bbi_validate_sum is deferrable and
        // requires the tranches to total final_amount, so a row-at-a-time insert
        // fails on the first row.
        const { error: instErr } = await svc
          .from('billing_bill_instalments')
          .insert(folded.instalments.map((i) => ({
            bill_id: bill.id,
            sequence_no: i.sequence_no,
            amount: i.amount,
            due_date: i.due_date,
            label: i.label,
          })));
        if (instErr) {
          // The money row is committed and now has no schedule. Leaving it would
          // charge the learner the year total with a single due date — worse than
          // not billing them. Compensate.
          const { error: cleanupErr } = await svc
            .from('billing_student_bills').delete().eq('id', bill.id);
          if (cleanupErr) {
            console.error(
              '[fees] ORPHANED BILL: instalment insert failed and cleanup failed',
              { billId: bill.id, personId: p.person_id, instErr, cleanupErr }
            );
          }
          errors++;
          continue;
        }

        // ONE ledger row: uq_tms_fee_bill_billing_student_bill forbids a second.
        const { error: ledErr } = await svc.from('tms_fee_bill').insert([{
          generation_run_id: runId,
          fee_structure_id: id,
          transport_year_id: fs.transport_year_id,
          person_id: p.person_id,
          person_type: 'learner',
          term_no: 1,
          amount: folded.total,
          due_date: folded.dueDate,
          billing_category_id: categoryId,
          billing_student_bill_id: bill.id,
          status: 'generated',
        }]);
        if (ledErr) {
          // Deleting the money row cascades the instalments away with it.
          const { error: cleanupErr } = await svc
            .from('billing_student_bills').delete().eq('id', bill.id);
          if (cleanupErr) {
            console.error(
              '[fees] ORPHANED BILL: ledger insert failed and cleanup failed',
              { billId: bill.id, personId: p.person_id, ledErr, cleanupErr }
            );
          }
          errors++;
          continue;
        }
        learnerBilled++;
        billedPersons.add(p.person_id); // a re-resolved duplicate must not double-bill
        if (folded.dueDate < today) bornOverdue++;
        continue;
      }

      // staff: unchanged — per-term ledger rows, no money row.
      for (const t of r.terms) {
        if (billedKey.has(`${p.person_id}:${t.term_no}`)) { skipped++; continue; }
        const amount = Number(t.amount);
        const { error: ledErr } = await svc.from('tms_fee_bill').insert([
          buildStaffFeeBillRow({
            runId,
            feeStructureId: id,
            transportYearId: fs.transport_year_id,
            staffId: p.person_id,
            categoryId,
            term: { term_no: t.term_no, amount, due_date: t.due_date },
            status: 'generated',
          }),
        ]);
        if (ledErr) { errors++; continue; }
        staffDeferred++;
        if (t.due_date < today) bornOverdue++;
        billedStaff.push({ staffId: p.person_id, amount, dueDate: t.due_date });
      }
    }
```

**3f.** If any pre-existing dry-run characterization test now fails on `toGeneratePairs` or `alreadyBilledPairs`, update **only** those numeric expectations and add a comment naming this change as the cause. Do not weaken an assertion to make it pass.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- lib/fees/`
Expected: PASS. The new block passes and every other fees test is green.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/generate.ts lib/fees/generate.test.ts
git commit -m "feat(fees): generate one learner bill per year with instalments"
```

---

### Task 3: The Term-1 booking gate reads instalment state

`isTerm1Paid()` currently requires the whole bill to be `paid`. Under one merged bill, a learner who pays instalment 1 sits at `partially_paid` and would be blocked.

**Files:**
- Modify: `lib/fees/term1.ts`
- Test: `lib/fees/term1.test.ts`

**Interfaces:**
- Consumes: `allocateWaterfall` from Task 1.
- Produces: `isTerm1Paid(ledgerStatus, moneyStatus, instalments?)` — third parameter optional; `term1PaidLearnerIds(svc, transportYearId)` keeps its existing signature and `Set<string>` return.

- [ ] **Step 1: Write the failing test**

Append to `lib/fees/term1.test.ts`:

```ts
describe('isTerm1Paid — instalment bills', () => {
  it('clears term 1 when instalment 1 is settled, even though the bill is only partially paid', () => {
    // The whole point: a learner paying by instalments must not be locked out.
    expect(
      isTerm1Paid('generated', 'partially_paid', {
        paid: 2750,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(true);
  });

  it('does NOT clear term 1 when instalment 1 is only part-paid', () => {
    expect(
      isTerm1Paid('generated', 'partially_paid', {
        paid: 1000,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(false);
  });

  it('clears term 1 when the whole instalment bill is paid', () => {
    expect(
      isTerm1Paid('generated', 'paid', {
        paid: 5500,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(true);
  });

  it('falls back to the whole-bill rule when the bill has no instalments', () => {
    // Every pre-change bill, and the 15 part-paid learners we do not convert.
    expect(isTerm1Paid('generated', 'paid', { paid: 3000, instalments: [] })).toBe(true);
    expect(isTerm1Paid('generated', 'partially_paid', { paid: 1, instalments: [] })).toBe(false);
    expect(isTerm1Paid('generated', 'paid')).toBe(true);
  });

  it('stays fail-closed for a cancelled ledger row regardless of instalments', () => {
    expect(
      isTerm1Paid('cancelled', 'paid', { paid: 5500, instalments: [{ amount: 2750 }, { amount: 2750 }] })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- lib/fees/term1.test.ts`
Expected: FAIL — the first case returns `false` because `moneyStatus !== 'paid'`.

- [ ] **Step 3: Write the implementation**

Replace `isTerm1Paid` in `lib/fees/term1.ts` and extend the loader. Keep the existing file header comment; add the import:

```ts
import { allocateWaterfall } from './instalments';

/** A bill's instalment schedule plus how much has been paid against the bill. */
export interface Term1Instalments {
  paid: number;
  /** In (due_date, sequence_no) order — the platform's allocation order. */
  instalments: Array<{ amount: number }>;
}

/**
 * Pure: a learner's first transport obligation is cleared only when the ledger
 * row is live ('generated' — not cancelled by a vacate approval, not
 * staff_deferred) AND the first instalment is settled.
 *
 * A bill WITH instalments is judged on instalment 1 alone, so paying by
 * instalments does not lock the learner out. A bill WITHOUT instalments — every
 * bill written before this change — keeps the old whole-bill rule. Both shapes
 * exist in production until year end.
 */
export function isTerm1Paid(
  ledgerStatus: string | null | undefined,
  moneyStatus: string | null | undefined,
  schedule?: Term1Instalments,
): boolean {
  if (ledgerStatus !== 'generated') return false;
  const lines = schedule?.instalments ?? [];
  if (!lines.length) return moneyStatus === 'paid';
  const allocated = allocateWaterfall(schedule?.paid ?? 0, lines);
  return allocated[0] >= lines[0].amount;
}
```

Then extend `term1PaidLearnerIds` to load the schedules. Replace the money-row loop:

```ts
  const ids = [...byBillId.keys()];

  // Instalment schedules for the same bills, in the platform's allocation order.
  // Chunked and error-checked for the same reason as the bills below: a quietly
  // empty set here would lock out every instalment-paying learner.
  const schedules = new Map<string, Array<{ amount: number }>>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error: instError } = await svc
      .from('billing_bill_instalments')
      .select('bill_id, amount, due_date, sequence_no')
      .in('bill_id', ids.slice(i, i + IN_CHUNK))
      .order('due_date', { ascending: true })
      .order('sequence_no', { ascending: true });
    if (instError) {
      // 42P01 only: the table genuinely may not exist on an old branch DB.
      if ((instError as { code?: string }).code !== '42P01') throw instError;
      break;
    }
    for (const row of (data ?? []) as Array<{ bill_id: string; amount: number | string }>) {
      const list = schedules.get(row.bill_id) ?? [];
      list.push({ amount: Number(row.amount) });
      schedules.set(row.bill_id, list);
    }
  }

  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error: chunkError } = await svc
      .from('billing_student_bills')
      .select('id, status, final_amount, balance_amount')
      .in('id', ids.slice(i, i + IN_CHUNK));
    if (chunkError) throw chunkError; // fail loud, never a quietly-empty set
    type MoneyRow = {
      id: string; status: string | null;
      final_amount: number | string | null; balance_amount: number | string | null;
    };
    for (const b of (data ?? []) as MoneyRow[]) {
      const personId = byBillId.get(b.id);
      if (!personId) continue;
      const lines = schedules.get(b.id) ?? [];
      const paid = Math.max(0, Number(b.final_amount ?? 0) - Number(b.balance_amount ?? b.final_amount ?? 0));
      if (isTerm1Paid('generated', b.status, { paid, instalments: lines })) out.add(personId);
    }
  }
  return out;
```

Also remove `.eq('term_no', 1)` from the ledger query in that function — a merged learner bill is `term_no = 1`, but the filter would have to survive both shapes and the person-level lookup no longer needs it. Replace that line with a comment:

```ts
    // No term_no filter: a merged bill is term 1 and a legacy learner's term-1
    // row is term 1, but filtering here would silently drop a learner whose
    // ledger grain changes mid-year. Judge on the bill instead.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- lib/fees/term1.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/term1.ts lib/fees/term1.test.ts
git commit -m "feat(fees): clear the term-1 gate on instalment 1, not the whole bill"
```

---

### Task 4: Rewrite the portal access RPC

`tms_student_transport_access` is the SECURITY DEFINER function the proxy calls on every `/student/*` request. It has the same whole-bill assumption as Task 3, with the same consequence.

**Files:**
- Create: `supabase/migrations/20260902<HHMMSS>_transport_access_instalments.sql` (use the real UTC time when creating it)

**Interfaces:**
- Consumes: nothing from earlier tasks (plpgsql).
- Produces: `tms_student_transport_access(p_profile_id uuid) returns jsonb` with **unchanged keys** — `allowed, reason, transport_year_id, transport_year_name, overdue_count, total_owed, terms, term1_paid, term1_status, term1_due_date, term1_balance`. `terms[]` entries keep `term_no, amount, balance, due_date, status, paid, overdue`.

- [ ] **Step 1: Prove the new function body runs, before committing it**

A parity test proves agreement, not that plpgsql parses. This project has shipped a dead SQL function before (`42702`, ambiguous column). Run the whole body once inside a rollback block.

Use the `mcp__supabase__execute_sql` tool with a `DO $$ ... RAISE EXCEPTION ... $$` block that creates the function, calls it against a real learner id, appends the result to a report string, and raises to roll back. Expected: the error message contains the returned JSON, not a syntax or ambiguity error.

Pick the learner with:

```sql
select lp.profile_id from learners_profiles lp
join tms_fee_bill fb on fb.person_id = lp.id and fb.person_type='learner'
where lp.profile_id is not null limit 1;
```

- [ ] **Step 2: Write the migration**

Create the migration file containing:

```sql
-- Transport portal access under the one-bill-per-year format.
--
-- Before this, "term 1 is paid" meant a bill row with term_no = 1 whose money
-- status was exactly 'paid'. A learner now has ONE bill for the year whose
-- terms are billing_bill_instalments rows, so paying instalment 1 leaves the
-- bill 'partially_paid' — and the old rule would have locked out every learner
-- who pays by instalments.
--
-- Bills WITHOUT instalments keep the old behaviour: every bill written before
-- this change, plus the part-paid learners the backfill deliberately skips.
--
-- The overdue clause is unchanged on purpose. trg_z_bbi_sync_due_date_after_payment
-- keeps billing_student_bills.due_date pointed at the next unsettled instalment,
-- so "due_date < today" already means "the next instalment is late".

create or replace function public.tms_student_transport_access(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_learner_id   uuid;
  v_bus_required boolean;
  v_year_id      uuid;
  v_year_name    text;
  v_terms        jsonb;
  v_overdue      int := 0;
  v_total_owed   numeric := 0;
  v_bill_count   int := 0;
  v_t1_found     boolean := false;
  v_t1_status    text;
  v_t1_due       date;
  v_t1_balance   numeric;
  v_t1_paid      boolean := false;
  v_allowed      boolean;
  v_reason       text;
begin
  -- profile_id is NOT unique in learners_profiles: a stub row can shadow the
  -- real one. Bias toward the row carrying the obligation.
  select id, coalesce(bus_required, false)
    into v_learner_id, v_bus_required
  from learners_profiles
  where profile_id = p_profile_id
  order by coalesce(bus_required, false) desc,
           (transport_route_id is not null) desc,
           id
  limit 1;

  if v_learner_id is null or v_bus_required = false then
    return jsonb_build_object(
      'allowed', true, 'reason', 'no_transport_obligation',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null,
      'term1_due_date', null, 'term1_balance', 0);
  end if;

  select id, name into v_year_id, v_year_name
  from tms_transport_year
  where is_current = true
  limit 1;

  if v_year_id is null then
    return jsonb_build_object(
      'allowed', true, 'reason', 'no_current_transport_year',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null,
      'term1_due_date', null, 'term1_balance', 0);
  end if;

  -- The learner's live transport bills for the current year.
  with bills as (
    select b.id, b.final_amount, b.balance_amount, b.due_date, b.status, fb.term_no
    from tms_fee_bill fb
    join billing_student_bills b on b.id = fb.billing_student_bill_id
    where fb.person_id = v_learner_id
      and fb.person_type = 'learner'
      and fb.transport_year_id = v_year_id
      and fb.status = 'generated'
  ),
  -- One row per visible line: an instalment where the bill has them, else the
  -- bill itself. Both shapes coexist until year end.
  lines as (
    select st.sequence_no::int          as line_no,
           st.amount                    as amount,
           st.outstanding               as balance,
           st.due_date                  as due_date,
           st.is_settled                as paid,
           (st.is_due and not st.is_settled) as overdue,
           case when st.is_settled then 'paid'
                when st.allocated_amount > 0 then 'partially_paid'
                else 'unpaid' end       as status
    from bills bl
    cross join lateral billing_bill_instalment_state(bl.id) st
    where exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
    union all
    select bl.term_no,
           bl.final_amount,
           bl.balance_amount,
           bl.due_date,
           (bl.status = 'paid'),
           (bl.due_date < current_date and bl.status in ('unpaid','partially_paid','overdue')),
           bl.status
    from bills bl
    where not exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'term_no', line_no,
      'amount', amount,
      'balance', balance,
      'due_date', due_date,
      'status', status,
      'paid', paid,
      'overdue', overdue
    ) order by due_date, line_no), '[]'::jsonb),
    count(*) filter (where overdue),
    coalesce(sum(balance) filter (where overdue), 0),
    count(*)
  into v_terms, v_overdue, v_total_owed, v_bill_count
  from lines;

  -- The FIRST line by due date is the term-1 obligation, whichever shape it has.
  select true, status, due_date, balance, paid
    into v_t1_found, v_t1_status, v_t1_due, v_t1_balance, v_t1_paid
  from (
    with bills as (
      select b.id, b.final_amount, b.balance_amount, b.due_date, b.status, fb.term_no
      from tms_fee_bill fb
      join billing_student_bills b on b.id = fb.billing_student_bill_id
      where fb.person_id = v_learner_id
        and fb.person_type = 'learner'
        and fb.transport_year_id = v_year_id
        and fb.status = 'generated'
    )
    select st.due_date, st.sequence_no::int as line_no, st.outstanding as balance,
           st.is_settled as paid,
           case when st.is_settled then 'paid'
                when st.allocated_amount > 0 then 'partially_paid'
                else 'unpaid' end as status
    from bills bl
    cross join lateral billing_bill_instalment_state(bl.id) st
    where exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
    union all
    select bl.due_date, bl.term_no, bl.balance_amount, (bl.status = 'paid'), bl.status
    from bills bl
    where not exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
  ) first_line
  order by due_date, line_no
  limit 1;

  if not coalesce(v_t1_found, false) then
    v_allowed := false;
    v_reason  := 'term1_not_billed';
  elsif not coalesce(v_t1_paid, false) then
    v_allowed := false;
    v_reason  := 'term1_unpaid';
  elsif v_overdue > 0 then
    v_allowed := false;
    v_reason  := 'overdue';
  else
    v_allowed := true;
    v_reason  := case when v_bill_count > 0 then 'current' else 'no_bills' end;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'transport_year_id', v_year_id,
    'transport_year_name', v_year_name,
    'overdue_count', v_overdue,
    'total_owed', v_total_owed,
    'terms', v_terms,
    'term1_paid', coalesce(v_t1_paid, false),
    'term1_status', v_t1_status,
    'term1_due_date', v_t1_due,
    'term1_balance', coalesce(v_t1_balance, 0)
  );
end;
$function$;
```

- [ ] **Step 3: Apply the migration and verify against live data**

Apply with `mcp__supabase__apply_migration`, then run:

```sql
-- A learner whose bill has no instalments: the answer must be unchanged.
select tms_student_transport_access(profile_id) from learners_profiles
where profile_id is not null and bus_required limit 1;
```

Expected: valid JSON with all eleven keys, no error. Spot-check that a learner known to be blocked is still blocked and one known to be current is still current.

- [ ] **Step 4: Confirm nothing regressed for the un-converted population**

```sql
select count(*) filter (where (tms_student_transport_access(lp.profile_id)->>'allowed')::boolean) as allowed,
       count(*) as checked
from learners_profiles lp
where lp.profile_id is not null and lp.bus_required limit 200;
```

Expected: an `allowed` count consistent with the ~879 blocked learners recorded in project memory. Record the number in the commit message.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(fees): judge portal access on instalment state, not whole-bill status"
```

---

### Task 5: Bill Management reads the new shape

`loadTransportBills` returns one row per ledger row, which is now one row per learner. `termBreakdown` groups by `term_no`, which collapses to a single bucket unless it reads instalments.

**Files:**
- Modify: `lib/fees/bills.ts` (the `TransportBillRow` interface at line 15, and `loadTransportBills`)
- Modify: `lib/fees/bill-analytics.ts` (`termBreakdown`, ~line 85)
- Modify: `app/(admin)/bill-management/columns.tsx`, `app/(admin)/bill-management/bill-export.ts`
- Test: `lib/fees/bill-analytics.test.ts`

**Interfaces:**
- Consumes: `allocateWaterfall` from Task 1.
- Produces: `TransportBillRow` gains `instalments: BillInstalment[]` where `interface BillInstalment { sequence_no: number; amount: number; due_date: string; label: string | null }`. Empty array for staff rows and for bills with no schedule. `termBreakdown` keeps its `TermStat[]` return type and `term_no` field.

- [ ] **Step 1: Write the failing test**

Append to `lib/fees/bill-analytics.test.ts`:

```ts
describe('termBreakdown — instalment bills', () => {
  const row = (over: Partial<TransportBillRow> = {}): TransportBillRow => ({
    id: 'fb1', person_id: 'L1', person_type: 'learner', person_name: 'A', code: null,
    institution_id: 'i1', institution_name: 'I', department_id: null, department_name: null,
    route_id: null, route_number: null, route_name: null,
    structure_id: 'fs1', structure_name: 'S', transport_year_id: 'ty1', year_name: null,
    academic_year_id: null, academic_year_name: null,
    term_no: 1, amount: 5500, due_date: '2026-07-31',
    paid_amount: 0, pending_amount: 5500, status: 'unpaid',
    payment_date: null, billing_student_bill_id: 'b1',
    instalments: [],
    ...over,
  });

  it('splits one instalment bill across its instalment numbers', () => {
    const out = termBreakdown([
      row({
        instalments: [
          { sequence_no: 1, amount: 2750, due_date: '2026-07-31', label: 'Term 1' },
          { sequence_no: 2, amount: 2750, due_date: '2026-08-31', label: 'Term 2' },
        ],
      }),
    ]);
    expect(out.map((t) => t.term_no)).toEqual([1, 2]);
    expect(out.map((t) => t.billed)).toEqual([2750, 2750]);
  });

  it('allocates a part payment to the earliest instalment first', () => {
    const out = termBreakdown([
      row({
        paid_amount: 2750, pending_amount: 2750, status: 'partially_paid',
        instalments: [
          { sequence_no: 1, amount: 2750, due_date: '2026-07-31', label: null },
          { sequence_no: 2, amount: 2750, due_date: '2026-08-31', label: null },
        ],
      }),
    ]);
    expect(out[0].collected).toBe(2750);
    expect(out[0].pending).toBe(0);
    expect(out[1].collected).toBe(0);
    expect(out[1].pending).toBe(2750);
  });

  it('still buckets a legacy bill with no instalments by its own term_no', () => {
    const out = termBreakdown([
      row({ term_no: 2, amount: 2500, pending_amount: 2500, instalments: [] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].term_no).toBe(2);
    expect(out[0].billed).toBe(2500);
  });

  it('counts a learner once per instalment number, not once per bill', () => {
    const out = termBreakdown([
      row({
        instalments: [
          { sequence_no: 1, amount: 2750, due_date: '2026-07-31', label: null },
          { sequence_no: 2, amount: 2750, due_date: '2026-08-31', label: null },
        ],
      }),
    ]);
    expect(out[0].learners).toBe(1);
    expect(out[1].learners).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- lib/fees/bill-analytics.test.ts`
Expected: FAIL — `instalments` is not a property of `TransportBillRow`, and the first case yields one bucket instead of two.

- [ ] **Step 3: Write the implementation**

**3a.** In `lib/fees/bills.ts`, add the type and the field:

```ts
/** One tranche of a bill's payment schedule, in due-date order. */
export interface BillInstalment {
  sequence_no: number;
  amount: number;
  due_date: string;
  label: string | null;
}
```

and inside `TransportBillRow`, after `billing_student_bill_id`:

```ts
  /**
   * The bill's instalment schedule, earliest first. EMPTY for staff rows (they
   * have no money row) and for every bill written before the one-bill format.
   * Consumers must handle both shapes.
   */
  instalments: BillInstalment[];
```

**3b.** In `loadTransportBills`, load the schedules alongside the money rows and attach them. Add a loader beside `loadBillMap`:

```ts
// Instalment schedules keyed by billing_student_bill_id, in the platform's
// allocation order (due_date, sequence_no). Chunked like every other .in().
async function loadInstalmentMap(
  supabase: SupabaseClient,
  billIds: string[]
): Promise<Map<string, BillInstalment[]>> {
  const map = new Map<string, BillInstalment[]>();
  if (!billIds.length) return map;
  const data = await selectByIds<{
    bill_id: string; sequence_no: number; amount: number | string;
    due_date: string; label: string | null;
  }>(supabase, 'billing_bill_instalments', 'bill_id, sequence_no, amount, due_date, label', billIds, 'bill_id');
  for (const r of data) {
    const list = map.get(r.bill_id) ?? [];
    list.push({
      sequence_no: Number(r.sequence_no),
      amount: Number(r.amount),
      due_date: r.due_date,
      label: r.label,
    });
    map.set(r.bill_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.sequence_no - b.sequence_no));
  }
  return map;
}
```

`selectByIds` already takes a fifth `idColumn` parameter (`lib/fees/bills.ts:159-176`, defaulting to `'id'`), so `'bill_id'` above works as written — do not add a second chunking loop.

Call it in the same `Promise.all` batch as `loadBillMap`, and set `instalments: instalmentMap.get(r.billing_student_bill_id ?? '') ?? []` when building each row.

**3c.** In `lib/fees/bill-analytics.ts`, replace the body of `termBreakdown`'s accumulation loop. Add the import `import { allocateWaterfall } from './instalments';` and change the `for` loop:

```ts
  for (const r of activeLearnerRows(rows)) {
    // A bill with instalments contributes one entry per instalment, with the
    // bill's paid amount waterfall-allocated across them exactly as the platform
    // does. A bill without instalments is a legacy per-term bill and stands as
    // its own single entry.
    const lines = r.instalments.length
      ? (() => {
          const alloc = allocateWaterfall(r.paid_amount, r.instalments);
          return r.instalments.map((i, idx) => ({
            term_no: i.sequence_no,
            billed: i.amount,
            collected: alloc[idx],
            pending: i.amount - alloc[idx],
          }));
        })()
      : [{ term_no: r.term_no, billed: r.amount, collected: r.paid_amount, pending: r.pending_amount }];

    for (const line of lines) {
      const t =
        byTerm.get(line.term_no) ??
        { billed: 0, collected: 0, pending: 0, paidBills: 0, pendingBills: 0, byLearner: new Map<string, { paid: number; pending: number }>() };
      t.billed += line.billed;
      t.collected += line.collected;
      t.pending += line.pending;
      if (line.pending > 0) t.pendingBills++;
      else t.paidBills++;
      const l = t.byLearner.get(r.person_id) ?? { paid: 0, pending: 0 };
      l.paid += line.collected;
      l.pending += line.pending;
      t.byLearner.set(r.person_id, l);
      byTerm.set(line.term_no, t);
    }
  }
```

**3d.** In `app/(admin)/bill-management/columns.tsx` and `bill-export.ts`, change the Term cell/column to render `row.instalments.length ? \`${row.instalments.length} instalments\` : \`Term ${row.term_no}\``. Keep the column id and header text stable so saved filters do not break.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- lib/fees/`
Expected: PASS. `bills.test.ts` fixtures may need `instalments: []` added — that is expected and correct.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/bills.ts lib/fees/bill-analytics.ts lib/fees/bill-analytics.test.ts app/\(admin\)/bill-management/
git commit -m "feat(fees): report bill management per instalment, not per term bill"
```

---

### Task 6: Backfill the 490 unpaid current-year learners

Converts learners with **no payment activity**. Settled and part-paid learners are left alone by design.

**Files:**
- Create: `supabase/migrations/20260902<HHMMSS>_backfill_transport_bill_instalments.sql`

**Interfaces:**
- Consumes: nothing (pure SQL).
- Produces: no new objects. Data only.

- [ ] **Step 1: Record the before-state**

Run and save the output — the post-check compares against it:

```sql
select
  count(distinct fb.person_id) learners,
  count(*) bills,
  sum(b.final_amount) billed,
  sum(b.final_amount - coalesce(b.balance_amount, b.final_amount)) collected,
  sum(coalesce(b.balance_amount, b.final_amount)) pending
from tms_fee_bill fb
join billing_student_bills b on b.id = fb.billing_student_bill_id
where fb.person_type='learner' and fb.status='generated' and b.status <> 'cancelled'
  and fb.transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0';
```

- [ ] **Step 2: Verify the target cohort has zero payment activity**

```sql
with cohort as (
  select fb.person_id
  from tms_fee_bill fb join billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_type='learner' and fb.status='generated'
    and fb.transport_year_id='6b3768f9-c9fb-48d5-a955-41949983c3b0'
    and b.bill_description like '%2026-2027%'
  group by fb.person_id
  having count(*) filter (where b.status <> 'unpaid') = 0
)
select count(*) as learners_targeted,
       (select count(*) from billing_receipt_items ri
          join tms_fee_bill fb2 on fb2.billing_student_bill_id = ri.bill_id
          where fb2.person_id in (select person_id from cohort)) as receipt_items,
       (select count(*) from payment_transaction_items pti
          join tms_fee_bill fb3 on fb3.billing_student_bill_id = pti.bill_id
          where fb3.person_id in (select person_id from cohort)) as txn_items
from cohort;
```

Expected: `learners_targeted` ≈ 490, `receipt_items` = 0, `txn_items` = 0. **If either count is non-zero, stop and report** — do not proceed.

- [ ] **Step 3: Write the migration**

```sql
-- Backfill: convert 2026-2027 transport learners with NO payment activity from
-- one-bill-per-term to one bill with instalments.
--
-- Deliberately NOT converted: learners with any paid or partially-paid bill.
-- Merging those would mean re-pointing receipt allocations, which is the
-- riskiest possible operation on a money table for no operational gain — they
-- age out at year end.
--
-- Order matters. bbi_rescale_on_bill_amount_change fires on final_amount, so the
-- keeper bill's amount is raised BEFORE its instalments exist; and the surplus
-- bill is deleted via billing_student_bills, never tms_fee_bill (that path
-- aborts with 27000 — a BEFORE DELETE trigger deletes the parent and the FK
-- cascade returns to the row being deleted). Deleting the money row removes its
-- ledger row by cascade.

do $$
declare
  v_year uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  v_learner record;
  v_keeper uuid;
  v_keeper_ledger uuid;
  v_total numeric;
  v_converted int := 0;
  v_receipts int;
begin
  -- Refuse to run if ANY targeted bill has payment activity.
  select count(*) into v_receipts
  from billing_receipt_items ri
  join tms_fee_bill fb on fb.billing_student_bill_id = ri.bill_id
  join billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_type='learner' and fb.transport_year_id = v_year and b.status = 'unpaid';
  if v_receipts > 0 then
    raise exception 'Aborting: % receipt items found against bills marked unpaid.', v_receipts;
  end if;

  for v_learner in
    select fb.person_id
    from tms_fee_bill fb
    join billing_student_bills b on b.id = fb.billing_student_bill_id
    where fb.person_type = 'learner'
      and fb.status = 'generated'
      and fb.transport_year_id = v_year
      and b.bill_description like '%2026-2027%'
    group by fb.person_id
    having count(*) filter (where b.status <> 'unpaid') = 0
       -- Only bills that do not already have a schedule.
       and count(*) filter (
             where exists (select 1 from billing_bill_instalments i where i.bill_id = b.id)
           ) = 0
  loop
    -- The keeper is the earliest-due bill; its ledger row survives.
    select b.id, fb.id, sum(b2.final_amount) over ()
      into v_keeper, v_keeper_ledger, v_total
    from tms_fee_bill fb
    join billing_student_bills b on b.id = fb.billing_student_bill_id
    join billing_student_bills b2 on b2.id = b.id
    where fb.person_id = v_learner.person_id
      and fb.person_type = 'learner'
      and fb.status = 'generated'
      and fb.transport_year_id = v_year
    order by b.due_date, b.created_at
    limit 1;

    -- The learner's true year total across all their term bills.
    select sum(b.final_amount) into v_total
    from tms_fee_bill fb
    join billing_student_bills b on b.id = fb.billing_student_bill_id
    where fb.person_id = v_learner.person_id
      and fb.person_type = 'learner'
      and fb.status = 'generated'
      and fb.transport_year_id = v_year;

    -- Stage the schedule from the bills BEFORE any of them are deleted.
    create temporary table if not exists _bf_lines
      (seq int, amount numeric, due_date date, label text) on commit drop;
    delete from _bf_lines;
    insert into _bf_lines (seq, amount, due_date, label)
    select row_number() over (order by b.due_date, b.created_at),
           b.final_amount, b.due_date,
           nullif(split_part(b.bill_description, ' - ', 3), '')
    from tms_fee_bill fb
    join billing_student_bills b on b.id = fb.billing_student_bill_id
    where fb.person_id = v_learner.person_id
      and fb.person_type = 'learner'
      and fb.status = 'generated'
      and fb.transport_year_id = v_year;

    -- Drop the surplus bills. The FK cascade takes their ledger rows with them.
    delete from billing_student_bills b
    using tms_fee_bill fb
    where fb.billing_student_bill_id = b.id
      and fb.person_id = v_learner.person_id
      and fb.person_type = 'learner'
      and fb.transport_year_id = v_year
      and b.id <> v_keeper
      and b.status = 'unpaid';

    -- Raise the keeper to the year total, and strip the term suffix.
    update billing_student_bills
       set unit_amount = v_total, total_amount = v_total,
           final_amount = v_total, balance_amount = v_total,
           bill_description = regexp_replace(bill_description, ' - Term [IVX0-9]+$', ''),
           due_date = (select min(due_date) from _bf_lines)
     where id = v_keeper;

    update tms_fee_bill
       set term_no = 1, amount = v_total,
           due_date = (select min(due_date) from _bf_lines)
     where id = v_keeper_ledger;

    -- All instalments in ONE statement: trg_bbi_validate_sum is deferrable and
    -- checks the sum against final_amount.
    insert into billing_bill_instalments (bill_id, sequence_no, amount, due_date, label)
    select v_keeper, seq, amount, due_date, label from _bf_lines order by seq;

    v_converted := v_converted + 1;
  end loop;

  raise notice 'Converted % learners to instalment bills.', v_converted;
end $$;
```

- [ ] **Step 4: Dry-run the migration body in a rollback block first**

Copy the `do $$ … $$` body into `mcp__supabase__execute_sql` with `raise exception 'DRY RUN: converted %', v_converted;` replacing the final `raise notice`. Expected: the error message reports ~490 converted and nothing is committed. **If it errors on anything else, fix the migration before applying.**

- [ ] **Step 5: Apply and verify**

Apply with `mcp__supabase__apply_migration`, then re-run the Step 1 query. Expected: `billed`, `collected` and `pending` are **identical to the rupee**; `bills` drops by ~228; `learners` is unchanged. Then:

```sql
-- Every converted bill's instalments must total its bill exactly.
select count(*) as mismatched
from billing_student_bills b
join (select bill_id, sum(amount) s from billing_bill_instalments group by 1) i on i.bill_id = b.id
where round(i.s,2) <> round(b.final_amount,2);
```

Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "fix(fees): backfill unpaid 2026-2027 transport bills to the instalment format"
```

---

### Task 7: Whole-system verification

**Files:**
- Modify: only whatever the build reveals as broken.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS. Record the total count; project memory's last recorded figures were 187 fees tests and 746 lib tests.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: success. This is the real gate — `next build` has `ignoreBuildErrors: true` for `tsc`, so a type error will not stop it, but an import or syntax error will.

- [ ] **Step 3: Fix compile fallout in the term_no consumers**

Check each of these still compiles and means what it says. `lib/vacate/requests.ts` and `lib/vacate/types.ts` belong to a retired module — check for breakage, change nothing else:

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/fees|lib/vacate|bill-management|student/fees" | head -30
```

Only fix errors introduced by this work. The repo has ~540 chronic pre-existing errors; do not chase them.

- [ ] **Step 4: Verify the gate end-to-end on live data**

```sql
-- A converted learner: instalment 1 unpaid, so still blocked; the terms array
-- must now show the instalments.
select tms_student_transport_access(lp.profile_id)
from learners_profiles lp
join tms_fee_bill fb on fb.person_id = lp.id and fb.person_type='learner'
join billing_bill_instalments i on i.bill_id = fb.billing_student_bill_id
where lp.profile_id is not null limit 1;
```

Expected: `terms` holds one entry per instalment; `term1_paid` is false; `reason` is `term1_unpaid`.

- [ ] **Step 5: Commit and report**

```bash
git add -A
git commit -m "chore(fees): verification fixes for the instalment bill format"
```

Then report to the user: tests passed, build passed, the live reconciliation figures before and after the backfill, and the two things that still owe a human check — the auth-gated browser smoke test of `/bill-management` and `/student/fees` (the agent's Chrome is unauthenticated), and MyJKKN's `/billing/transport` collection flow against a merged bill.
