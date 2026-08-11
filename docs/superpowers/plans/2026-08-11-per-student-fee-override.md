# Per-student transport fee override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let TMS bill an individual a different transport fee from their fee
structure, and use it to correct SOORIYA B (`EE24032`) to a ₹500 annual
7.5%-scholarship fee.

**Architecture:** A new `tms_fee_override` table records per-`(person, transport
year, term)` exceptions. A pure function `applyOverrides` is called once at the end
of `resolvePersonTerms`, after a fee mode has produced its terms — so flat, tiered
and stop_wise all honour overrides through one implementation and none of their
existing branches change. The generator batch-loads overrides for the transport year
and attaches them per person. A final data migration records SOORIYA's override and
corrects their two already-generated bills.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL) via
service-role client, vitest.

**Spec:** `docs/superpowers/specs/2026-08-11-per-student-fee-override-design.md`

## Global Constraints

- **New tables use the modern `tms_` pattern:** `alter table … enable row level
  security;` with **no policies** — service-role access only.
- **Never trust `update_bill_balance_on_amount_change`.** It is declared
  `AFTER UPDATE` but mutates `NEW`, so PostgreSQL discards its work and it never
  recomputes `balance_amount` or `status`. Any statement changing `final_amount`
  must write `balance_amount` and `status` explicitly.
- **Ledger and money tables move together.** `tms_fee_bill` (TMS) and
  `billing_student_bills` (MyJKKN, shared) must be updated in **one statement** so
  they cannot diverge on partial failure.
- **`Billed == Collected + Pending`** must hold for the transport year after every
  change, where Billed counts only `person_type='learner'` rows whose bill status is
  not `cancelled`.
- **Never `.in()` over a large id list.** ~500+ UUIDs returns HTTP 400 and, unchecked,
  reads as an empty result set. Overrides are loaded by `transport_year_id` only.
- **Always check the Supabase `error` field.** An unchecked failure loading overrides
  silently bills a scholarship student full price.
- **PostgreSQL `numeric` arrives as a JS string.** Wrap amounts in `Number()`.
- **Verification commands:** `npm test` (vitest) and `npm run build`. Do **not** use
  `npm run type-check` or `npm run lint` as gates — `tsc` is chronically red on main
  (~540 pre-existing errors, not gated by `next build`) and ESLint crashes on a
  circular config. Neither failure indicates a regression from this work.
- **Rupee amounts in SQL comments/strings use `Rs`,** not `₹`, to avoid encoding
  surprises in migration files. Markdown and TypeScript may use `₹`.

## Key identifiers (live database)

| Thing | Value |
|---|---|
| Learner (SOORIYA B) | `27c52c59-cf30-490c-9991-0d94353e0569` |
| Learner email | `sooriyab2024eee@jkkn.ac.in` |
| Profile id | `d6ffb143-c732-4e4e-ac2a-b9be0a86bfc5` |
| Transport year 2026-2027 | `6b3768f9-c9fb-48d5-a955-41949983c3b0` |
| Fee structure (flat) | `6b2ebf76-f06d-4f40-95fb-f8654f152f16` |

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260811090000_create_tms_fee_override.sql` | **Create.** The override table, constraints, index. |
| `lib/fees/overrides.ts` | **Create.** `TermOverride` type + the pure `applyOverrides` function. Nothing else. |
| `lib/fees/overrides.test.ts` | **Create.** Unit tests for `applyOverrides`. |
| `lib/fees/resolve-terms.ts` | **Modify.** Accept `overrides` on `ResolvePerson`; apply once per branch exit. |
| `lib/fees/resolve-terms.test.ts` | **Modify.** Add override cases across all three fee modes. Existing characterization tests must pass unchanged. |
| `app/api/admin/fees/[id]/generate/route.ts` | **Modify.** Load overrides for the year, attach per person, report an `overridden` count. |
| `supabase/migrations/20260811093000_sooriya_scholarship_fee_correction.sql` | **Create.** SOORIYA's override rows **and** the correction of their two bills, in one migration. |

**Deviation from the spec, deliberate:** the spec put SOORIYA's override rows in
Migration A alongside the DDL. This plan moves them into the final data migration
together with the bill correction. They describe one business fact — "SOORIYA owes
₹500 for the year" — and splitting them across two migrations separated by code work
would allow a half-applied state where the override exists but the bills disagree.

---

### Task 1: Create the `tms_fee_override` table

**Files:**
- Create: `supabase/migrations/20260811090000_create_tms_fee_override.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.tms_fee_override` with columns `id, person_id, person_type,
  transport_year_id, term_no, billable, amount, reason, created_at, created_by,
  updated_at, updated_by`; unique constraint on `(person_id, transport_year_id,
  term_no)`; check constraint `tms_fee_override_amount_ck`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260811090000_create_tms_fee_override.sql`:

```sql
-- Per-person exceptions to a transport fee structure's amounts.
--
-- WHY: a fee structure prices a COHORT. Individuals sometimes owe something else --
-- a scholarship, a negotiated concession. Until now TMS had no way to express that:
-- lib/fees/resolve-terms.ts derives every amount from structure config alone, and
-- learners_profiles.scholarship_type is referenced by ZERO lines of application code.
--
-- Scoped to (person, transport year, term) and deliberately NOT to fee_structure_id.
-- A person is billed by exactly one structure per transport year -- the generator
-- already treats a second one as a conflict -- so adding the structure would be
-- redundant, and would let an override silently miss if the person moved structures.

create table if not exists public.tms_fee_override (
  id                uuid primary key default gen_random_uuid(),

  -- No FK: person_id points at learners_profiles OR staff depending on
  -- person_type, exactly as tms_fee_bill.person_id does.
  person_id         uuid not null,
  person_type       text not null default 'learner'
                    check (person_type in ('learner', 'staff')),

  transport_year_id uuid not null
                    references public.tms_transport_year(id) on delete cascade,
  term_no           integer not null check (term_no > 0),

  -- false = this term is not charged at all; the generator drops it entirely.
  billable          boolean not null default true,
  -- Rupees for this ONE term. NULL exactly when billable is false.
  amount            numeric(12,2),

  -- NOT NULL on purpose: this table quietly reduces what someone owes, so every
  -- row must record why. An unexplained override is an unauditable discount.
  reason            text not null,

  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz,
  updated_by        uuid,

  constraint tms_fee_override_amount_ck check (
    (billable and amount is not null and amount >= 0)
    or (not billable and amount is null)
  ),
  constraint tms_fee_override_unique
    unique (person_id, transport_year_id, term_no)
);

-- Service-role only, matching every other tms_ table: RLS on, no policies.
alter table public.tms_fee_override enable row level security;

-- The generator loads overrides by year alone (never by a large person-id list,
-- which overflows the Supabase gateway), so this is the query it runs.
create index if not exists tms_fee_override_year_idx
  on public.tms_fee_override (transport_year_id, person_type);

comment on table public.tms_fee_override is
  'Per-person exceptions to a fee structure amount, applied by lib/fees/overrides.ts at generation time.';
```

- [ ] **Step 2: Apply the migration to the database**

Use the Supabase MCP tool `mcp__supabase__apply_migration` with name
`create_tms_fee_override` and the file's contents as the query.

- [ ] **Step 3: Verify the table exists with the right shape**

Run via `mcp__supabase__execute_sql`:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tms_fee_override'
order by ordinal_position;
```

Expected: 11 rows. `person_id`, `person_type`, `transport_year_id`, `term_no`,
`billable`, `reason` are all `NO` for `is_nullable`; `amount`, `created_by`,
`updated_at`, `updated_by` are `YES`.

- [ ] **Step 4: Verify RLS is on with no policies**

```sql
select c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = 'tms_fee_override') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'tms_fee_override';
```

Expected: `rls_enabled = true`, `policies = 0`.

- [ ] **Step 5: Verify the check constraint actually rejects bad rows**

This proves the constraint works rather than assuming it. Both inserts must fail,
and the transaction is rolled back so nothing persists.

```sql
-- Must FAIL: billable with no amount.
begin;
insert into public.tms_fee_override
  (person_id, transport_year_id, term_no, billable, amount, reason)
values
  ('27c52c59-cf30-490c-9991-0d94353e0569',
   '6b3768f9-c9fb-48d5-a955-41949983c3b0', 1, true, null, 'constraint probe');
rollback;
```

Expected: `ERROR … violates check constraint "tms_fee_override_amount_ck"`.

```sql
-- Must FAIL: non-billable but carrying an amount.
begin;
insert into public.tms_fee_override
  (person_id, transport_year_id, term_no, billable, amount, reason)
values
  ('27c52c59-cf30-490c-9991-0d94353e0569',
   '6b3768f9-c9fb-48d5-a955-41949983c3b0', 2, false, 500, 'constraint probe');
rollback;
```

Expected: the same check-constraint error.

- [ ] **Step 6: Confirm the table is still empty**

```sql
select count(*) as rows from public.tms_fee_override;
```

Expected: `0`. If it is not 0, a probe insert was committed — delete those rows
before continuing.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260811090000_create_tms_fee_override.sql
git commit -m "feat(fees): add tms_fee_override for per-person fee exceptions"
```

---

### Task 2: The pure `applyOverrides` function

**Files:**
- Create: `lib/fees/overrides.ts`
- Test: `lib/fees/overrides.test.ts`

**Interfaces:**
- Consumes: `BillableTerm` from `lib/fees/resolve-terms.ts` — `{ term_no: number;
  term_label: string | null; amount: number; due_date: string }`.
- Produces:
  - `export interface TermOverride { term_no: number; billable: boolean; amount: number | null }`
  - `export function applyOverrides(terms: BillableTerm[], overrides: TermOverride[]): BillableTerm[]`

**Expected and safe: a type-only import cycle.** `overrides.ts` imports
`BillableTerm` from `resolve-terms.ts`, and Task 3 makes `resolve-terms.ts` import
`applyOverrides` from `overrides.ts`. This is not a runtime cycle — the
`import type` is erased at compile time, leaving one direction only
(`resolve-terms` → `overrides`). Do **not** "fix" it by moving types around or by
duplicating `BillableTerm`; keeping one definition is the point.

- [ ] **Step 1: Write the failing tests**

Create `lib/fees/overrides.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyOverrides, type TermOverride } from './overrides';
import type { BillableTerm } from './resolve-terms';

const TERMS: BillableTerm[] = [
  { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31' },
  { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31' },
];

describe('applyOverrides', () => {
  it('returns the SAME array when there are no overrides', () => {
    // Reference equality matters: resolvePersonTerms' flat branch returns
    // ctx.flatTerms directly, and its characterization test asserts on that
    // exact array. Copying here would not break it, but allocating per person
    // across ~1,100 learners is pure waste.
    const out = applyOverrides(TERMS, []);
    expect(out).toBe(TERMS);
  });

  it('replaces the amount of a billable overridden term', () => {
    const out = applyOverrides(TERMS, [{ term_no: 1, billable: true, amount: 500 }]);
    expect(out).toEqual([
      { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-07-31' },
      { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31' },
    ]);
  });

  it('keeps the term label and due date when replacing an amount', () => {
    const out = applyOverrides(TERMS, [{ term_no: 2, billable: true, amount: 1 }]);
    expect(out[1].term_label).toBe('Term 2');
    expect(out[1].due_date).toBe('2026-08-31');
  });

  it('drops a term marked not billable', () => {
    const out = applyOverrides(TERMS, [{ term_no: 2, billable: false, amount: null }]);
    expect(out).toEqual([
      { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31' },
    ]);
  });

  it('applies SOORIYA\'s rule: Term 1 becomes 500 and Term 2 disappears', () => {
    const overrides: TermOverride[] = [
      { term_no: 1, billable: true, amount: 500 },
      { term_no: 2, billable: false, amount: null },
    ];
    const out = applyOverrides(TERMS, overrides);
    expect(out).toEqual([
      { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-07-31' },
    ]);
    expect(out.reduce((s, t) => s + t.amount, 0)).toBe(500);
  });

  it('may drop every term — billing nothing is a legal outcome', () => {
    const out = applyOverrides(TERMS, [
      { term_no: 1, billable: false, amount: null },
      { term_no: 2, billable: false, amount: null },
    ]);
    expect(out).toEqual([]);
  });

  it('ignores an override for a term the structure does not have', () => {
    // A term cannot be invented: there is no due date to give it.
    const out = applyOverrides(TERMS, [{ term_no: 7, billable: true, amount: 999 }]);
    expect(out).toEqual(TERMS);
  });

  it('falls back to the structure amount if billable but amount is null', () => {
    // The DB check constraint makes this unreachable, but if it ever happens the
    // safe direction is to over-bill visibly, never to silently bill zero.
    const out = applyOverrides(TERMS, [{ term_no: 1, billable: true, amount: null }]);
    expect(out[0].amount).toBe(3000);
  });

  it('bills a genuine zero override rather than treating it as missing', () => {
    const out = applyOverrides(TERMS, [{ term_no: 1, billable: true, amount: 0 }]);
    expect(out[0].amount).toBe(0);
  });

  it('does not mutate its inputs', () => {
    const terms: BillableTerm[] = [
      { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31' },
    ];
    const snapshot = JSON.parse(JSON.stringify(terms));
    applyOverrides(terms, [{ term_no: 1, billable: true, amount: 500 }]);
    expect(terms).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/overrides.test.ts`

Expected: FAIL — `Failed to resolve import "./overrides"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/overrides.ts`:

```ts
// lib/fees/overrides.ts
// Per-person exceptions to a fee structure's amounts.
//
// A fee structure prices a COHORT. Some individuals owe something else -- a
// scholarship, a negotiated concession. tms_fee_override records that exception
// per (person, transport year, term); this module applies it.
//
// Applied AFTER a fee mode has produced its terms, never inside a mode branch, so
// flat / tiered / stop_wise all honour overrides through this one implementation
// and none of their existing logic changes.

import type { BillableTerm } from './resolve-terms';

export interface TermOverride {
  term_no: number;
  /** false = this term is not charged at all and is dropped from the bill run. */
  billable: boolean;
  /** Rupees for this one term. NULL exactly when `billable` is false. */
  amount: number | null;
}

/**
 * Apply per-person overrides to the terms a fee structure produced.
 *
 * Iterating `terms` (not `overrides`) is what makes an override for a term the
 * structure does not have a no-op: a term cannot be invented, because there is no
 * due date to give it.
 *
 * Never mutates its arguments. Returns `terms` itself when there is nothing to do.
 */
export function applyOverrides(
  terms: BillableTerm[],
  overrides: TermOverride[]
): BillableTerm[] {
  if (!overrides.length) return terms;

  const byTerm = new Map<number, TermOverride>();
  for (const o of overrides) byTerm.set(o.term_no, o);

  const out: BillableTerm[] = [];
  for (const t of terms) {
    const o = byTerm.get(t.term_no);
    if (!o) {
      out.push(t);
      continue;
    }
    if (!o.billable) continue; // term dropped entirely
    if (o.amount === null) {
      // Unreachable while the DB check constraint holds. If it is ever reached,
      // keep the structure amount: over-billing is visible and correctable,
      // whereas billing 0 silently loses the fee.
      out.push(t);
      continue;
    }
    out.push({ ...t, amount: o.amount });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/overrides.test.ts`

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/overrides.ts lib/fees/overrides.test.ts
git commit -m "feat(fees): add applyOverrides for per-person term exceptions"
```

---

### Task 3: Wire overrides into `resolvePersonTerms`

**Files:**
- Modify: `lib/fees/resolve-terms.ts` (interface `ResolvePerson` ~line 37; function body ~lines 66-109)
- Modify: `lib/fees/resolve-terms.test.ts` (append a new describe block)

**Interfaces:**
- Consumes: `applyOverrides`, `TermOverride` from `lib/fees/overrides.ts`.
- Produces: `ResolvePerson` gains an optional `overrides?: TermOverride[]`.
  `resolvePersonTerms(person, ctx)` keeps its exact signature and return type.

- [ ] **Step 1: Write the failing tests**

Append to `lib/fees/resolve-terms.test.ts`:

```ts
// ── NEW: per-person overrides ───────────────────────────────────────────────
describe('resolvePersonTerms — per-person overrides', () => {
  it('flat: replaces one amount and drops another', () => {
    const r = resolvePersonTerms(
      {
        admission_year: 2024,
        transport_stop_id: null,
        overrides: [
          { term_no: 1, billable: true, amount: 500 },
          { term_no: 2, billable: false, amount: null },
        ],
      },
      ctx()
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-06-15' },
      ]);
    }
  });

  it('flat: leaves the structure terms untouched for everyone else', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: null, overrides: [] },
      ctx()
    );
    expect(r).toEqual({ ok: true, terms: FLAT_TERMS, band: null });
  });

  it('flat: an override does NOT leak into the shared structure terms', () => {
    // FLAT_TERMS is a module-level array reused by every person in a run. If
    // applyOverrides mutated it, the next learner would inherit this discount.
    resolvePersonTerms(
      {
        admission_year: 2024,
        transport_stop_id: null,
        overrides: [{ term_no: 1, billable: true, amount: 1 }],
      },
      ctx()
    );
    expect(FLAT_TERMS[0].amount).toBe(2750);
  });

  it('tiered: overrides apply on top of the matched band', () => {
    const r = resolvePersonTerms(
      {
        admission_year: 2024, // => year 3 => band-2 (2500 + 2500)
        transport_stop_id: null,
        overrides: [{ term_no: 2, billable: false, amount: null }],
      },
      ctx({ feeMode: 'tiered' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.band?.id).toBe('band-2');
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 2500, due_date: '2026-06-15' },
      ]);
    }
  });

  it('stop_wise: an override beats the stop rate split', () => {
    const r = resolvePersonTerms(
      {
        admission_year: 2024,
        transport_stop_id: 'stop-kachu-palli',
        overrides: [{ term_no: 1, billable: true, amount: 500 }],
      },
      ctx({
        feeMode: 'stop_wise',
        stopRateByStopId: new Map<string, number>([['stop-kachu-palli', 9900]]),
      })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-06-15' },
        { term_no: 2, term_label: 'Term 2', amount: 4950, due_date: '2026-11-15' },
      ]);
    }
  });

  it('an override never rescues an UNRESOLVED person', () => {
    // No matching band means we do not know which terms exist at all. An override
    // supplies an amount, not a schedule -- it must not manufacture a bill.
    const r = resolvePersonTerms(
      {
        admission_year: null,
        transport_stop_id: null,
        overrides: [{ term_no: 1, billable: true, amount: 500 }],
      },
      ctx({ feeMode: 'tiered' })
    );
    expect(r).toEqual({ ok: false, reason: 'no_matching_band' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/resolve-terms.test.ts`

Expected: FAIL — TypeScript rejects the unknown property `overrides` on
`ResolvePerson`, and the amount assertions do not match.

- [ ] **Step 3: Add the import and extend `ResolvePerson`**

In `lib/fees/resolve-terms.ts`, add to the imports at the top (after the
`./stop-rate` import):

```ts
import { applyOverrides, type TermOverride } from './overrides';
```

Replace the `ResolvePerson` interface:

```ts
export interface ResolvePerson {
  admission_year: number | null;
  transport_stop_id: string | null;
  /**
   * Per-person exceptions to the structure's amounts. Omitted or empty means
   * this person is billed exactly what their structure says.
   */
  overrides?: TermOverride[];
}
```

- [ ] **Step 4: Apply overrides at each successful exit**

Replace the whole body of `resolvePersonTerms` with:

```ts
export function resolvePersonTerms(
  person: ResolvePerson,
  ctx: ResolveContext
): ResolveOutcome {
  // Applied at each SUCCESSFUL exit, never inside a mode's own logic: the three
  // branches below are pinned by characterization tests and must not drift.
  // Unresolved people are returned untouched -- an override supplies an amount,
  // not a schedule, so it must never manufacture a bill for someone whose terms
  // could not be determined.
  const overrides = person.overrides ?? [];

  if (ctx.feeMode === 'tiered') {
    const year = deriveStudyYear(ctx.currentYear, person.admission_year);
    const band = bandForYear(ctx.bands, year);
    if (!band) return { ok: false, reason: 'no_matching_band' };
    return { ok: true, terms: applyOverrides(band.terms, overrides), band };
  }

  if (ctx.feeMode === 'stop_wise') {
    const schedule = ctx.stopTerms ?? [];
    if (!schedule.length) {
      // The caller must load the schedule before resolving anyone. Throwing
      // beats returning "unresolved": a missing schedule is a bug affecting
      // EVERY student, not a data gap affecting one, and it must not be
      // reported as if some students merely lacked a stop.
      throw new Error('resolvePersonTerms: stop_wise requires a non-empty stopTerms schedule.');
    }
    if (!person.transport_stop_id) return { ok: false, reason: 'no_stop' };

    const annual = ctx.stopRateByStopId?.get(person.transport_stop_id);
    // `undefined` means no rate row exists — unresolved. A rate of 0 is a real
    // configured value (a free stop) and IS billed, so check for undefined
    // explicitly rather than relying on falsiness.
    if (annual === undefined) return { ok: false, reason: 'no_stop_rate' };

    const amounts = splitAnnual(annual, schedule.map((t) => t.share_percent));
    return {
      ok: true,
      band: null,
      terms: applyOverrides(
        schedule.map((t, i) => ({
          term_no: t.term_no,
          term_label: t.term_label,
          amount: amounts[i],
          due_date: t.due_date,
        })),
        overrides
      ),
    };
  }

  // 'flat' — everyone matched gets the structure terms verbatim.
  return { ok: true, terms: applyOverrides(ctx.flatTerms, overrides), band: null };
}
```

- [ ] **Step 5: Run the full fees test suite**

Run: `npx vitest run lib/fees/`

Expected: PASS. Critically, **every pre-existing test in `resolve-terms.test.ts`
must pass unchanged** — that is the proof a person with no override is billed
exactly as before.

- [ ] **Step 6: Run the whole suite for regressions**

Run: `npm test`

Expected: PASS. Note the pass/fail count so Task 4 can be compared against it.

- [ ] **Step 7: Commit**

```bash
git add lib/fees/resolve-terms.ts lib/fees/resolve-terms.test.ts
git commit -m "feat(fees): honour per-person overrides in all three fee modes"
```

---

### Task 4: Load overrides in the bill generator

**Files:**
- Modify: `app/api/admin/fees/[id]/generate/route.ts` (imports ~line 17; insert a load block after ~line 302; resolve loop ~lines 306-334; preview object ~lines 396-417; generate response ~lines 700-709)

**Interfaces:**
- Consumes: `TermOverride` from `lib/fees/overrides.ts`; `resolvePersonTerms` (unchanged signature).
- Produces: dry-run `preview.overridden` (number) and generate response
  `data.overridden` (number) — the count of resolved people who had at least one
  override applied.

- [ ] **Step 1: Add the import**

In `app/api/admin/fees/[id]/generate/route.ts`, after the
`import { intersectPersonIds } from '@/lib/fees/person-scope';` line:

```ts
import type { TermOverride } from '@/lib/fees/overrides';
```

- [ ] **Step 2: Load the overrides for this transport year**

Insert immediately after the scope-intersection block (currently ending with
`people = scope.kept;`) and **before** the comment
`// Resolve each person to the terms that apply to them.`:

```ts
    // Per-person fee exceptions for this transport year (scholarships, concessions).
    // Filtered by YEAR ONLY, never by person id: overrides are exceptional and few,
    // so one small query replaces an .in() over ~1,000 UUIDs — which overflows the
    // Supabase gateway (HTTP 400) and, unchecked, reads as "no overrides exist".
    const { data: overrideRows, error: overrideErr } = await supabase
      .from('tms_fee_override')
      .select('person_id, term_no, billable, amount')
      .eq('transport_year_id', fs.transport_year_id);
    if (overrideErr) {
      // Fail loud. Treating this as "no overrides" would bill a scholarship
      // student the FULL amount — a silent overcharge is the worst outcome here,
      // and it would be invisible in both the dry run and the generated bills.
      console.error('Fee generation: failed to load fee overrides', overrideErr);
      return NextResponse.json(
        { error: 'Failed to load per-person fee overrides.' },
        { status: 500 }
      );
    }
    const overridesByPerson = new Map<string, TermOverride[]>();
    for (const row of (overrideRows ?? []) as Array<{
      person_id: string;
      term_no: number;
      billable: boolean;
      amount: number | string | null;
    }>) {
      const list = overridesByPerson.get(row.person_id) ?? [];
      // Postgres `numeric` arrives as a STRING over PostgREST. Left unconverted it
      // would flow into billing_student_bills.final_amount as text and into
      // arithmetic as a concatenation.
      list.push({
        term_no: row.term_no,
        billable: row.billable,
        amount: row.amount === null ? null : Number(row.amount),
      });
      overridesByPerson.set(row.person_id, list);
    }
```

- [ ] **Step 3: Attach overrides in the resolve loop and count them**

Replace the resolve loop (from `const resolved: Resolved[] = [];` down to the
closing brace of the `for (const person of people)` loop) with:

```ts
    const resolved: Resolved[] = [];
    let unresolved = 0;
    let overridden = 0;
    const unresolvedByReason: Record<UnresolvedReason, number> = {
      no_matching_band: 0,
      no_stop: 0,
      no_stop_rate: 0,
    };
    for (const person of people) {
      const personOverrides = overridesByPerson.get(person.person_id) ?? [];
      const outcome = resolvePersonTerms(
        {
          admission_year: person.admission_year,
          transport_stop_id: isStopWise ? stopByPerson.get(person.person_id) ?? null : null,
          overrides: personOverrides,
        },
        {
          feeMode: fs.fee_mode,
          currentYear,
          flatTerms,
          bands,
          stopTerms: isStopWise ? stopTerms : undefined,
          stopRateByStopId: isStopWise ? stopRateByStopId : undefined,
        }
      );
      if (!outcome.ok) {
        unresolved++;
        unresolvedByReason[outcome.reason]++;
        continue;
      }
      // Counted only for people who actually resolved — an override on an
      // unresolved person changes nothing and must not be reported as applied.
      if (personOverrides.length) overridden++;
      resolved.push({ person, terms: outcome.terms, band: outcome.band as Band | null });
    }
```

- [ ] **Step 4: Report the count in the dry-run preview**

In the `preview` object, add a line immediately after `unresolvedByReason,`:

```ts
      overridden, // people billed a per-person override instead of structure config
```

- [ ] **Step 5: Report the count in the generate response and activity log**

In the `logActivity` call near the end of the POST handler, add `overridden` to the
`metadata` object so it reads:

```ts
      metadata: { runId, learnerBilled, staffDeferred, skipped, unresolved, overridden, errors, feeMode: fs.fee_mode, notified },
```

And in the final `NextResponse.json` success payload, add `overridden` to `data`:

```ts
      data: { mode: 'generate', runId, applicable: resolved.length, learnerBilled, staffDeferred, skipped, unresolved, overridden, errors, notified },
```

- [ ] **Step 6: Run the test suite**

Run: `npm test`

Expected: PASS, with the same counts as Task 3 Step 6. This route has no unit test;
the suite is checking that nothing else broke.

- [ ] **Step 7: Verify the route still compiles**

Run: `npm run build`

Expected: build completes. Do **not** run `npm run type-check` as a gate — `tsc` is
red on main for ~540 unrelated pre-existing errors and is not wired into the build.
If the build fails, the failure is from this change and must be fixed.

- [ ] **Step 8: Commit**

```bash
git add "app/api/admin/fees/[id]/generate/route.ts"
git commit -m "feat(fees): apply per-person overrides during bill generation"
```

---

### Task 5: Record SOORIYA's override and correct their bills

**Files:**
- Create: `supabase/migrations/20260811093000_sooriya_scholarship_fee_correction.sql`

**Interfaces:**
- Consumes: table `public.tms_fee_override` (Task 1).
- Produces: no code interface. Two override rows, one repriced bill, one cancelled bill.

**This is the only task that touches money.** Run the before-state capture first and
keep the output — it is the only record of what the numbers were.

- [ ] **Step 1: Capture the before state**

Run all three via `mcp__supabase__execute_sql` and **save the output**:

```sql
-- (a) The two bills
select fb.term_no, fb.amount as ledger_amount, fb.status as ledger_status,
       b.final_amount, b.balance_amount, b.status as bill_status
from tms_fee_bill fb
join billing_student_bills b on b.id = fb.billing_student_bill_id
where fb.person_id = '27c52c59-cf30-490c-9991-0d94353e0569'
order by fb.term_no;
```

Expected: term 1 → 3000 / generated / 3000 / 0 / paid; term 2 → 2500 / generated /
2500 / 0 / paid.

```sql
-- (b) Transport-year totals
select count(*) as bills,
       sum(b.final_amount) as billed,
       sum(b.final_amount - b.balance_amount) as collected,
       sum(b.balance_amount) as pending
from tms_fee_bill fb
join billing_student_bills b on b.id = fb.billing_student_bill_id
where fb.person_type = 'learner'
  and fb.transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
  and coalesce(b.status, '') <> 'cancelled';
```

Expected: `2272 | 6130150.00 | 1890500.00 | 4239650.00`.

```sql
-- (c) Portal access
select tms_student_transport_access('d6ffb143-c732-4e4e-ac2a-b9be0a86bfc5') as access;
```

Expected: `allowed = true`, `reason = 'current'`, `term1_paid = true`, `terms` has
**2** entries.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260811093000_sooriya_scholarship_fee_correction.sql`:

```sql
-- 7.5% scholarship correction for SOORIYA B (EE24032, sooriyab2024eee@jkkn.ac.in).
--
-- WHAT: their annual transport fee is Rs 500, not the standard Rs 5,500. They were
-- billed the standard amount (T1 Rs 3,000 + T2 Rs 2,500) and PAID it in full, in
-- cash, on 2026-07-31 (receipt RCP-2026-003412).
--
-- Two things happen here, in one migration because they state one fact:
--   1. Record the rule in tms_fee_override so any future generation bills Rs 500.
--   2. Correct the two existing bills: T1 -> Rs 500, T2 -> cancelled.
--
-- CONSEQUENCE, accepted by explicit decision on 2026-08-11: Rs 5,500 of cash is
-- receipted against Rs 500 of billing. The Rs 5,000 excess is refundable and is
-- recorded in billing_student_bills.remarks for the accounts team. TMS has no
-- refund mechanism and does not attempt one.
--
-- DEPARTURE FROM AN EXISTING RULE: tms_approve_transport_vacate deliberately
-- refuses to cancel a PAID bill (it filters bsb.status <> 'paid' and balance > 0).
-- Cancelling a paid Term 2 here is a knowing exception for this one student, which
-- is why the reason is written into three places: the override row, the bill
-- remarks, and this comment.
--
-- balance_amount and status are written EXPLICITLY below.
-- update_bill_balance_on_amount_change looks like it would maintain them, but it
-- is declared AFTER UPDATE while its body mutates NEW -- PostgreSQL discards an
-- AFTER row trigger's return value, so the function is a no-op.

do $$
declare
  v_learner   uuid;
  v_year      uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0'; -- TY 2026-2027
  v_n         int;
  v_t1_money  int;
  v_t1_ledger int;
  v_t2_money  int;
  v_t2_ledger int;
begin
  -- Resolve by email, not by a hardcoded uuid, so this fails loudly rather than
  -- silently doing nothing if run against a database where the learner is absent.
  select count(*), min(id) into v_n, v_learner
  from public.learners_profiles
  where lower(college_email) = 'sooriyab2024eee@jkkn.ac.in';

  if v_n <> 1 then
    raise exception
      'Expected exactly 1 learner for sooriyab2024eee@jkkn.ac.in, found %', v_n;
  end if;

  -- 1. The durable rule. ON CONFLICT DO NOTHING so re-running is harmless.
  insert into public.tms_fee_override
    (person_id, person_type, transport_year_id, term_no, billable, amount, reason)
  values
    (v_learner, 'learner', v_year, 1, true, 500.00,
     '7.5% SCHOLARSHIP - annual transport fee fixed at Rs 500 (approved 2026-08-11)'),
    (v_learner, 'learner', v_year, 2, false, null,
     '7.5% SCHOLARSHIP - annual fee fully covered by Term 1 (approved 2026-08-11)')
  on conflict (person_id, transport_year_id, term_no) do nothing;

  -- Already corrected? Then stop: the UPDATE below filters on status='generated',
  -- so a second run would match nothing for T2 and trip the assertion.
  select count(*) into v_n
  from public.tms_fee_bill
  where person_id = v_learner
    and transport_year_id = v_year
    and term_no >= 2
    and status = 'cancelled';

  if v_n > 0 then
    raise notice 'Bill correction already applied for learner %; skipping.', v_learner;
    return;
  end if;

  -- 2. Correct both bills in ONE statement, so the TMS ledger and the shared
  -- MyJKKN money table cannot diverge if part of it fails.
  with tgt as (
    select fb.id as ledger_id, fb.billing_student_bill_id as bill_id, fb.term_no
    from public.tms_fee_bill fb
    where fb.person_id         = v_learner
      and fb.person_type       = 'learner'
      and fb.transport_year_id = v_year
      and fb.status            = 'generated'
  ),
  money_t1 as (
    update public.billing_student_bills b
       set unit_amount    = 500,
           total_amount   = 500,
           final_amount   = 500,
           balance_amount = 0,        -- explicit: the balance trigger is a no-op
           status         = 'paid',   -- explicit, same reason
           remarks        = concat_ws(' | ', nullif(b.remarks, ''),
                            '7.5% scholarship: annual transport fee revised to Rs 500 '
                            || 'on 2026-08-11. Rs 5,000 of receipt RCP-2026-003412 is '
                            || 'excess and refundable.'),
           updated_at     = now()
      from tgt
     where tgt.bill_id = b.id and tgt.term_no = 1
    returning b.id
  ),
  ledger_t1 as (
    update public.tms_fee_bill fb
       set amount = 500
      from tgt
     where tgt.ledger_id = fb.id and tgt.term_no = 1
    returning fb.id
  ),
  -- term_no >= 2, not = 2: if the structure ever gains a Term 3 this must not
  -- leave a stray billable term behind.
  money_t2 as (
    update public.billing_student_bills b
       set status     = 'cancelled',
           remarks    = concat_ws(' | ', nullif(b.remarks, ''),
                        '7.5% scholarship: term cancelled on 2026-08-11, annual fee '
                        || 'fully covered by Term 1.'),
           updated_at = now()
      from tgt
     where tgt.bill_id = b.id and tgt.term_no >= 2
    returning b.id
  ),
  ledger_t2 as (
    update public.tms_fee_bill fb
       set status = 'cancelled'
      from tgt
     where tgt.ledger_id = fb.id and tgt.term_no >= 2
    returning fb.id
  )
  select (select count(*) from money_t1),
         (select count(*) from ledger_t1),
         (select count(*) from money_t2),
         (select count(*) from ledger_t2)
    into v_t1_money, v_t1_ledger, v_t2_money, v_t2_ledger;

  if v_t1_money <> 1 or v_t1_ledger <> 1 or v_t2_money <> 1 or v_t2_ledger <> 1 then
    raise exception
      'Unexpected row counts (t1_money=%, t1_ledger=%, t2_money=%, t2_ledger=%) - rolled back',
      v_t1_money, v_t1_ledger, v_t2_money, v_t2_ledger;
  end if;

  raise notice 'SOORIYA B fee correction applied: T1 -> Rs 500, T2 cancelled.';
end $$;
```

- [ ] **Step 3: Apply the migration**

Use `mcp__supabase__apply_migration` with name
`sooriya_scholarship_fee_correction` and the file's contents as the query.

Expected: success. If it raises `Unexpected row counts …`, the whole `DO` block
rolled back and nothing changed — stop and re-read the before state rather than
editing and retrying blindly.

- [ ] **Step 4: Verify the override rows landed**

```sql
select term_no, billable, amount, reason
from tms_fee_override
where person_id = '27c52c59-cf30-490c-9991-0d94353e0569'
order by term_no;
```

Expected: 2 rows — `1 | true | 500.00 | …`, `2 | false | NULL | …`.

- [ ] **Step 5: Verify the bills**

Re-run query (a) from Step 1.

Expected: term 1 → `500 / generated / 500 / 0 / paid`; term 2 → `2500 / cancelled /
2500 / 0 / cancelled`. The Term-2 *amounts* are intentionally left alone — the row is
voided by status, exactly as the vacate RPC voids bills.

- [ ] **Step 6: Verify the transport-year totals and the reconciliation invariant**

Re-run query (b) from Step 1.

Expected: `2271 | 6125150.00 | 1885500.00 | 4239650.00`.

Then assert the invariant explicitly:

```sql
select sum(b.final_amount) - sum(b.final_amount - b.balance_amount) - sum(b.balance_amount)
       as must_be_zero
from tms_fee_bill fb
join billing_student_bills b on b.id = fb.billing_student_bill_id
where fb.person_type = 'learner'
  and fb.transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
  and coalesce(b.status, '') <> 'cancelled';
```

Expected: `0.00`. Anything else means Billed no longer equals Collected + Pending and
Bill Management has drifted from MyJKKN — investigate before going further.

- [ ] **Step 7: Verify the student portal and the Term-1 gate**

Re-run query (c) from Step 1.

Expected: `allowed = true`, `reason = 'current'`, `term1_paid = true`,
`term1_status = 'paid'`, `overdue_count = 0`, and `terms` now contains **1** entry
(`term_no 1`, `amount 500`, `status 'paid'`). Term 2 disappears because the RPC joins
on `fb.status = 'generated'`.

If `allowed` is `false`, this change has locked a paying student out of the portal —
revert by setting the T1 bill back to 3000 and the T2 rows back to `generated`/`paid`.

- [ ] **Step 8: Confirm the cash record was not touched**

```sql
select r.receipt_number, r.payment_mode, r.payment_amount, sum(ri.amount_paid) as allocated
from billing_receipts r
join billing_receipt_items ri on ri.receipt_id = r.id
where r.receipt_number = 'RCP-2026-003412'
group by 1, 2, 3;
```

Expected: `RCP-2026-003412 | cash | 5500.00 | 5500.00` — unchanged. This work must
never alter a receipt.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260811093000_sooriya_scholarship_fee_correction.sql
git commit -m "fix(fees): apply Rs 500 7.5% scholarship fee for SOORIYA B (EE24032)"
```

---

## Post-implementation

Tell the requester, in plain terms:

- SOORIYA B's transport liability is now ₹500 for the year (Term 1 only).
- **₹5,000 of the ₹5,500 cash they paid is excess and refundable.** TMS cannot
  refund it; accounts must. The reason is recorded on both bills in `remarks`.
- Bill Management's Billed and Collected each drop ₹5,000 for TY 2026-2027; Pending
  is unchanged and the reconciliation invariant still holds.
- The remaining 7.5% cohort — 42 active bus-required learners, 38 with an unpaid
  Term 1 totalling ₹1,14,000 — was **not** touched. Now that `tms_fee_override`
  exists, correcting them is a data task, not a build task.
- There is still no admin screen for overrides (deferred by decision); new ones are
  added by migration until a second case justifies the UI.

## Owed verification not covered by this plan

The generate route is auth-gated and cannot be exercised headlessly. Before the next
real generation run, an authenticated admin should open a **dry run** on
`Transport Fees 2026-2027` and confirm the preview reports `overridden: 0` — SOORIYA
is already billed, so no one should be re-priced. That is the only end-to-end proof
that Task 4's query and grouping work against the live table.
