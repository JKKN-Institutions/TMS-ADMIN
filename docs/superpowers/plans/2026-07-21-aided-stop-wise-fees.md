# Stop-Wise Transport Fees (Arts Aided) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `fee_mode = 'stop_wise'` to the TMS fees module so JKKN College of Arts and Science (Aided) can price transport by each student's boarding stop, without altering the existing `flat` or `tiered` billing flows.

**Architecture:** Two new tables hold per-stop annual rates and a shared percentage-based instalment schedule. The bill generator's branch logic is first *extracted* into a pure, unit-tested function and pinned by characterization tests, *then* extended with the new mode — so a regression to existing billing fails a test rather than reaching a student. Rates are loaded from an `.xlsx` template generated from live `tms_route_stop` rows and matched back on `stop_id`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres, service-role client), vitest 4, xlsx 0.18, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-21-aided-stop-wise-transport-fees-design.md`

## Global Constraints

- **Scope by configuration, never hard-code.** Arts Aided is targeted via the structure's `institution_ids` array (`a33138b6-4eea-4675-941f-1071bf88b127`). No institution id may appear in application code.
- **`stop_wise` is `audience = 'student'` only.** Reject `audience = 'staff'` with `stop_wise` at the API layer.
- **Never guess an amount.** A student with no `transport_stop_id`, or whose stop has no rate row, is `unresolved` — skipped, counted, reported. Never defaulted to 0 or to any fallback.
- **No existing table's columns change.** Only an additive `CHECK` value on `tms_fee_structure.fee_mode`. `tms_fee_structure_term` and `tms_fee_structure_year_band` are untouched.
- **`lib/fees/applicability.ts` is not modified** — the staff cron also calls it.
- **`sum(terms) === annual` exactly.** Rounding remainder goes on the final term.
- **Verification reality:** `npm run lint` crashes (circular ESLint config) — **do not run it**. `npm run type-check` is chronically red (~540 pre-existing errors) and does not gate `next build` (`ignoreBuildErrors: true`). Type success is defined as: `npx tsc --noEmit 2>&1 | grep <changed-file>` returns **zero lines**. Do not treat the repo-wide red tsc as a regression.
- **VITEST: the `@/` alias does NOT resolve under vitest.** Test files and any `lib/` source they pull in must use **relative** imports (`./stop-rate`, `./types`). Route files under `app/` may use `@/` — Next resolves it. Single file: `npx vitest run <path>`.
- **Test baseline on this branch is 232 passed / 28 files.** Any task's suite run must meet or exceed it.
- **`npm run build` is CONTESTED** — another session's dev server (PID 12328) holds port 3001 and reads `.next/`. Do not run `npm run build` or start a dev server unless the controller says the conflict is resolved; use the tsc-grep gate instead.
- **Auth-gated browser verification is the HUMAN's job** — the agent's Chrome is unauthenticated. Implementers verify via vitest + tsc-grep only, and record any browser step as owed.
- **Git:** explicit `git add <exact paths>` only — **never** bare `-A` / `-u` (the worktree carries unrelated dirty `.claude/` and `next-env.d.ts`). Commit locally; **never push**. **No history rewrites** — never `--amend`, `rebase`, or `reset`.
- **API response shape:** success `{ success: true, data, message? }`, failure `{ error: string }` with an HTTP status.
- **Migrations** are applied to the live DB *and* committed as `.sql` under `supabase/migrations/`.
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Create:**
| File | Responsibility |
|---|---|
| `supabase/migrations/20260721000000_tms_fee_stop_wise.sql` | Two new tables + additive `fee_mode` CHECK value |
| `lib/fees/stop-rate.ts` | `splitAnnual`, `validateShares` — pure money maths |
| `lib/fees/stop-rate.test.ts` | Tests for the above |
| `lib/fees/resolve-terms.ts` | `resolvePersonTerms` — the pure decision function for all three modes |
| `lib/fees/resolve-terms.test.ts` | Characterization tests (flat/tiered) + stop_wise cases |
| `lib/fees/stop-template.ts` | `buildTemplateRows`, `parseImportRows` — pure sheet shaping/validation |
| `lib/fees/stop-template.test.ts` | Tests for the above |
| `app/api/admin/fees/[id]/stop-rates/route.ts` | GET list / PUT upsert stop rates |
| `app/api/admin/fees/[id]/stop-rates/template/route.ts` | GET `.xlsx` template |
| `app/api/admin/fees/[id]/stop-rates/import/route.ts` | POST filled sheet |
| `app/(admin)/fees/[id]/stop-rates-card.tsx` | Admin UI card |
| `app/api/student/transport-context/route.ts` | Self-scoped route/stop lookup for the student fees page |

**Modify:**
| File | Change |
|---|---|
| `lib/fees/types.ts` | `FeeMode` union + `FeeStructureStopRate` / `FeeStructureStopTerm` |
| `app/api/admin/fees/[id]/generate/route.ts` | Call `resolvePersonTerms`; load stop data; extend preview |
| `app/api/admin/fees/route.ts` | Accept `stop_wise`; write stop terms |
| `app/api/admin/fees/[id]/route.ts` | Return `stop_terms` + `stop_rates` |
| `app/(admin)/fees/fee-structure-form.tsx` | Mode option + share-based term editor |
| `app/(admin)/fees/[id]/page.tsx` | Render `StopRatesCard` when `fee_mode === 'stop_wise'` |
| `app/student/fees/page.tsx` | Show route / stop / annual rate |
| `proxy.ts:119-124` | Add the new student endpoint to `STUDENT_EXEMPT_WHEN_BLOCKED` |

---

## Task 1: Migration and types

**Files:**
- Create: `supabase/migrations/20260721000000_tms_fee_stop_wise.sql`
- Modify: `lib/fees/types.ts:8` and `lib/fees/types.ts:34-59`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: tables `tms_fee_structure_stop_rate`, `tms_fee_structure_stop_term`; types `FeeMode` (now includes `'stop_wise'`), `FeeStructureStopRate`, `FeeStructureStopTerm`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260721000000_tms_fee_stop_wise.sql`:

```sql
-- Stop-wise transport fees (Arts Aided).
--
-- Adds fee_mode 'stop_wise': the annual amount is chosen by the student's
-- BOARDING STOP (learners_profiles.transport_stop_id -> tms_route_stop.id),
-- then split across a shared percentage-based instalment schedule.
--
-- The rate hangs off the FEE STRUCTURE, not off tms_route_stop, because Aided
-- and Self students board the same physical stops and must be priced
-- differently. No existing table's columns change.

-- 1. Additive CHECK value. Verified constraint name/definition on 2026-07-21:
--    tms_fee_structure_fee_mode_check CHECK (fee_mode = ANY (ARRAY['flat','tiered']))
alter table public.tms_fee_structure
  drop constraint if exists tms_fee_structure_fee_mode_check;
alter table public.tms_fee_structure
  add constraint tms_fee_structure_fee_mode_check
  check (fee_mode in ('flat', 'tiered', 'stop_wise'));

-- 2. Per-stop annual rate.
--    stop_id ONLY: the route is derived via tms_route_stop.route_id, so a
--    denormalised route_id cannot drift out of sync with the stop.
create table if not exists public.tms_fee_structure_stop_rate (
  id               uuid primary key default gen_random_uuid(),
  fee_structure_id uuid not null references public.tms_fee_structure(id) on delete cascade,
  stop_id          uuid not null references public.tms_route_stop(id)    on delete cascade,
  annual_amount    numeric(12,2) not null check (annual_amount >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tms_fee_stop_rate_unique unique (fee_structure_id, stop_id)
);

create index if not exists idx_tms_fee_stop_rate_structure
  on public.tms_fee_structure_stop_rate (fee_structure_id);

-- 3. The shared instalment schedule for stop_wise structures.
--    Stores a percentage SHARE, not a rupee amount: the rupee value is unknown
--    until the student's stop is known. That is why this does not reuse
--    tms_fee_structure_term, whose `amount` column is meaningless here.
create table if not exists public.tms_fee_structure_stop_term (
  id               uuid primary key default gen_random_uuid(),
  fee_structure_id uuid not null references public.tms_fee_structure(id) on delete cascade,
  term_no          int  not null,
  term_label       text,
  due_date         date not null,
  share_percent    numeric(5,2) not null check (share_percent > 0 and share_percent <= 100),
  created_at       timestamptz not null default now(),
  constraint tms_fee_stop_term_unique unique (fee_structure_id, term_no)
);

create index if not exists idx_tms_fee_stop_term_structure
  on public.tms_fee_structure_stop_term (fee_structure_id);

comment on table public.tms_fee_structure_stop_rate is
  'Per-boarding-stop annual transport fee for a stop_wise fee structure.';
comment on table public.tms_fee_structure_stop_term is
  'Instalment schedule for a stop_wise structure. share_percent across all terms of one structure must sum to 100 (enforced in the API).';
```

- [ ] **Step 2: Apply the migration to the live DB**

Use the Supabase MCP `apply_migration` tool with name `tms_fee_stop_wise` and the SQL above.

- [ ] **Step 3: Verify the tables and the relaxed constraint exist**

Run this via the Supabase MCP `execute_sql` tool:

```sql
select
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname='tms_fee_structure_fee_mode_check') as fee_mode_check,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='tms_fee_structure_stop_rate') as rate_tbl,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='tms_fee_structure_stop_term') as term_tbl;
```

Expected: `fee_mode_check` contains `'stop_wise'`; `rate_tbl` = 1; `term_tbl` = 1.

- [ ] **Step 4: Update the shared types**

In `lib/fees/types.ts`, replace line 8:

```ts
export type FeeMode = 'flat' | 'tiered';
```

with:

```ts
// 'stop_wise' = per-boarding-stop annual amount (tms_fee_structure_stop_rate),
// split across a shared percentage schedule (tms_fee_structure_stop_term).
export type FeeMode = 'flat' | 'tiered' | 'stop_wise';
```

Then append these interfaces after `FeeStructureYearBand` (after line 32):

```ts
// A per-boarding-stop annual amount within a stop_wise fee structure.
export interface FeeStructureStopRate {
  id?: string;
  fee_structure_id?: string;
  stop_id: string;
  annual_amount: number;
  // joined by the API layer for display
  stop_name?: string | null;
  route_id?: string | null;
  route_number?: string | null;
  route_name?: string | null;
  sequence_order?: number | null;
}

// One instalment of a stop_wise structure. Carries a SHARE, not an amount —
// the rupee value depends on the student's stop.
export interface FeeStructureStopTerm {
  id?: string;
  fee_structure_id?: string;
  term_no: number;
  term_label: string | null;
  due_date: string; // 'YYYY-MM-DD'
  share_percent: number;
}
```

Finally, extend `FeeStructureRow` — add these two lines after line 58 (`bands?: ...`):

```ts
  stop_terms?: FeeStructureStopTerm[]; // stop_wise structures only
  stop_rates?: FeeStructureStopRate[]; // stop_wise structures only
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit --skipLibCheck lib/fees/types.ts`
Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260721000000_tms_fee_stop_wise.sql lib/fees/types.ts
git commit -m "feat(fees): add stop_wise schema and types

Two new tables for per-stop annual rates and a share-based instalment
schedule. tms_fee_structure.fee_mode gains 'stop_wise' as an additive CHECK
value; no existing table's columns change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The money split

**Files:**
- Create: `lib/fees/stop-rate.ts`
- Test: `lib/fees/stop-rate.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `splitAnnual(annual: number, shares: number[]): number[]`, `validateShares(shares: number[]): string | null`

- [ ] **Step 1: Write the failing tests**

Create `lib/fees/stop-rate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitAnnual, validateShares } from './stop-rate';

describe('splitAnnual', () => {
  it('splits evenly when the maths is clean', () => {
    expect(splitAnnual(9900, [50, 50])).toEqual([4950, 4950]);
  });

  it('puts the rounding remainder on the LAST term so the total is exact', () => {
    // 9999 at 50/50 is 4999.5 each. Naive rounding gives 5000+5000 = 10000,
    // over-charging by 1 rupee — a balance nobody can ever clear.
    const terms = splitAnnual(9999, [50, 50]);
    expect(terms).toEqual([5000, 4999]);
    expect(terms.reduce((a, b) => a + b, 0)).toBe(9999);
  });

  it('handles uneven shares', () => {
    expect(splitAnnual(10000, [60, 40])).toEqual([6000, 4000]);
  });

  it('handles three-way shares that do not divide cleanly', () => {
    const terms = splitAnnual(10000, [33.33, 33.33, 33.34]);
    expect(terms).toEqual([3333, 3333, 3334]);
    expect(terms.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('returns the whole amount for a single 100% term', () => {
    expect(splitAnnual(18400, [100])).toEqual([18400]);
  });

  it('handles a zero annual amount', () => {
    expect(splitAnnual(0, [50, 50])).toEqual([0, 0]);
  });

  it('throws on an empty share list rather than silently billing nothing', () => {
    expect(() => splitAnnual(1000, [])).toThrow(/at least one term/i);
  });
});

describe('validateShares', () => {
  it('accepts shares summing to exactly 100', () => {
    expect(validateShares([50, 50])).toBeNull();
    expect(validateShares([33.33, 33.33, 33.34])).toBeNull();
  });

  it('rejects shares that do not sum to 100', () => {
    expect(validateShares([50, 40])).toMatch(/must sum to 100/i);
  });

  it('rejects an empty schedule', () => {
    expect(validateShares([])).toMatch(/at least one term/i);
  });

  it('rejects a non-positive share', () => {
    expect(validateShares([100, 0])).toMatch(/greater than 0/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/stop-rate.test.ts`
Expected: FAIL — `Failed to resolve import "./stop-rate"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/stop-rate.ts`:

```ts
// lib/fees/stop-rate.ts
// Money maths for stop_wise fee structures.
//
// A stop carries ONE annual amount. The structure carries ONE instalment
// schedule expressed as percentage shares. Splitting the annual across those
// shares must be exact: sum(terms) === annual, always.

/** Rounding tolerance for share sums — floats make 33.33*3 unreliable. */
const SHARE_EPSILON = 0.01;

/**
 * Split an annual amount across percentage shares.
 *
 * Every term but the last is rounded to whole rupees; the LAST term absorbs the
 * remainder so the terms always re-add to `annual` exactly. Distributing the
 * remainder any other way lets the billed total drift from the agreed fee —
 * invisible at generation, surfacing later as an unclearable balance.
 */
export function splitAnnual(annual: number, shares: number[]): number[] {
  if (!shares.length) {
    throw new Error('A stop_wise structure needs at least one term.');
  }
  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < shares.length - 1; i++) {
    const part = Math.round((annual * shares[i]) / 100);
    out.push(part);
    assigned += part;
  }
  out.push(annual - assigned);
  return out;
}

/** Null when the schedule is valid, else a human-readable reason. */
export function validateShares(shares: number[]): string | null {
  if (!shares.length) return 'A stop_wise structure needs at least one term.';
  if (shares.some((s) => !(s > 0))) return 'Every term share must be greater than 0.';
  const total = shares.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > SHARE_EPSILON) {
    return `Term shares must sum to 100 (currently ${total}).`;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/stop-rate.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/stop-rate.ts lib/fees/stop-rate.test.ts
git commit -m "feat(fees): splitAnnual + validateShares for stop_wise

Remainder lands on the final term so sum(terms) === annual exactly.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Extract the term-resolution decision (characterize existing behaviour)

This task adds **no new behaviour**. It lifts the generator's existing `flat`/`tiered` branch logic into a pure function and pins it with tests, so Task 4 can rewire the route with evidence that nothing changed.

**Files:**
- Create: `lib/fees/resolve-terms.ts`
- Test: `lib/fees/resolve-terms.test.ts`
- Reference (do not modify yet): `app/api/admin/fees/[id]/generate/route.ts:117-131`

**Interfaces:**
- Consumes: `FeeMode` from `lib/fees/types.ts` (Task 1)
- Produces:
  - `type BillableTerm = { term_no: number; term_label: string | null; amount: number; due_date: string }`
  - `type UnresolvedReason = 'no_matching_band' | 'no_stop' | 'no_stop_rate'`
  - `interface ResolveBand { id: string; label: string | null; study_years: number[]; terms: BillableTerm[] }`
  - `interface ResolvePerson { admission_year: number | null; transport_stop_id: string | null }`
  - `interface ResolveContext { feeMode: FeeMode; currentYear: number | null; flatTerms: BillableTerm[]; bands: ResolveBand[]; stopTerms: StopScheduleTerm[]; stopRateByStopId: Map<string, number> }`
  - `interface StopScheduleTerm { term_no: number; term_label: string | null; due_date: string; share_percent: number }`
  - `type ResolveOutcome = { ok: true; terms: BillableTerm[]; band: ResolveBand | null } | { ok: false; reason: UnresolvedReason }`
  - `resolvePersonTerms(person: ResolvePerson, ctx: ResolveContext): ResolveOutcome`

- [ ] **Step 1: Write the characterization tests**

These encode what the generator does **today** at `route.ts:122-131`. They must pass against logic copied verbatim.

Create `lib/fees/resolve-terms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolvePersonTerms,
  type BillableTerm,
  type ResolveBand,
  type ResolveContext,
  type StopScheduleTerm,
} from './resolve-terms';

const FLAT_TERMS: BillableTerm[] = [
  { term_no: 1, term_label: 'Term 1', amount: 2750, due_date: '2026-06-15' },
  { term_no: 2, term_label: 'Term 2', amount: 2750, due_date: '2026-11-15' },
];

const BANDS: ResolveBand[] = [
  {
    id: 'band-1',
    label: 'First year',
    study_years: [1],
    terms: [{ term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-06-15' }],
  },
  {
    id: 'band-2',
    label: 'Years 2-3',
    study_years: [2, 3],
    terms: [
      { term_no: 1, term_label: 'Term 1', amount: 2500, due_date: '2026-06-15' },
      { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-11-15' },
    ],
  },
];

const STOP_TERMS: StopScheduleTerm[] = [
  { term_no: 1, term_label: 'Term 1', due_date: '2026-06-15', share_percent: 50 },
  { term_no: 2, term_label: 'Term 2', due_date: '2026-11-15', share_percent: 50 },
];

function ctx(over: Partial<ResolveContext> = {}): ResolveContext {
  return {
    feeMode: 'flat',
    currentYear: 2026,
    flatTerms: FLAT_TERMS,
    bands: BANDS,
    stopTerms: STOP_TERMS,
    stopRateByStopId: new Map<string, number>(),
    ...over,
  };
}

// ── CHARACTERIZATION: flat ──────────────────────────────────────────────────
describe('resolvePersonTerms — flat (existing behaviour)', () => {
  it('gives every person the structure terms verbatim', () => {
    const r = resolvePersonTerms({ admission_year: 2024, transport_stop_id: null }, ctx());
    expect(r).toEqual({ ok: true, terms: FLAT_TERMS, band: null });
  });

  it('ignores a missing admission year — flat never tiers', () => {
    const r = resolvePersonTerms({ admission_year: null, transport_stop_id: null }, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.terms).toEqual(FLAT_TERMS);
  });
});

// ── CHARACTERIZATION: tiered ────────────────────────────────────────────────
describe('resolvePersonTerms — tiered (existing behaviour)', () => {
  it('picks the band matching the derived year of study', () => {
    // admitted 2024, transport year 2026 => year 3 => band-2
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.band?.id).toBe('band-2');
      expect(r.terms).toHaveLength(2);
    }
  });

  it('picks the first-year band for a current-year admission', () => {
    const r = resolvePersonTerms(
      { admission_year: 2026, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.band?.id).toBe('band-1');
  });

  it('is UNRESOLVED when the admission year is missing (never guessed)', () => {
    const r = resolvePersonTerms(
      { admission_year: null, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r).toEqual({ ok: false, reason: 'no_matching_band' });
  });

  it('is UNRESOLVED when the derived year matches no band', () => {
    // admitted 2020 => year 7 => no band
    const r = resolvePersonTerms(
      { admission_year: 2020, transport_stop_id: null },
      ctx({ feeMode: 'tiered' })
    );
    expect(r).toEqual({ ok: false, reason: 'no_matching_band' });
  });

  it('is UNRESOLVED when the transport year start is unknown', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: null },
      ctx({ feeMode: 'tiered', currentYear: null })
    );
    expect(r).toEqual({ ok: false, reason: 'no_matching_band' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/resolve-terms.test.ts`
Expected: FAIL — `Failed to resolve import "./resolve-terms"`.

- [ ] **Step 3: Write the implementation (flat + tiered only, copied verbatim)**

Create `lib/fees/resolve-terms.ts`. The `flat` and `tiered` branches reproduce `route.ts:122-131` exactly; `stop_wise` is added in Task 5.

```ts
// lib/fees/resolve-terms.ts
// The single decision point for "which terms and amounts apply to this person?"
//
// Extracted from app/api/admin/fees/[id]/generate/route.ts so all three fee
// modes can be unit-tested without a database. The flat and tiered branches are
// the original logic verbatim and are pinned by characterization tests — the
// generator's behaviour for existing structures must not drift.
//
// An unresolvable person is NEVER given a guessed amount. They are reported.

import { deriveStudyYear, bandForYear } from './year-of-study';
import type { FeeMode } from './types';

export interface BillableTerm {
  term_no: number;
  term_label: string | null;
  amount: number;
  due_date: string;
}

export interface ResolveBand {
  id: string;
  label: string | null;
  study_years: number[];
  terms: BillableTerm[];
}

/** One instalment of a stop_wise schedule: a share, not an amount. */
export interface StopScheduleTerm {
  term_no: number;
  term_label: string | null;
  due_date: string;
  share_percent: number;
}

export interface ResolvePerson {
  admission_year: number | null;
  transport_stop_id: string | null;
}

export interface ResolveContext {
  feeMode: FeeMode;
  currentYear: number | null;
  flatTerms: BillableTerm[];
  bands: ResolveBand[];
  // Only read when feeMode === 'stop_wise'. Optional so the flat/tiered call
  // sites need not pass empty placeholders they would never use.
  stopTerms?: StopScheduleTerm[];
  stopRateByStopId?: Map<string, number>;
}

export type UnresolvedReason = 'no_matching_band' | 'no_stop' | 'no_stop_rate';

export type ResolveOutcome =
  | { ok: true; terms: BillableTerm[]; band: ResolveBand | null }
  | { ok: false; reason: UnresolvedReason };

/** Human-readable text for a generation-run note / dry-run report. */
export const UNRESOLVED_LABEL: Record<UnresolvedReason, string> = {
  no_matching_band: 'no admission year / no matching band',
  no_stop: 'no boarding stop assigned',
  no_stop_rate: 'no fee configured for their boarding stop',
};

export function resolvePersonTerms(
  person: ResolvePerson,
  ctx: ResolveContext
): ResolveOutcome {
  if (ctx.feeMode === 'tiered') {
    const year = deriveStudyYear(ctx.currentYear, person.admission_year);
    const band = bandForYear(ctx.bands, year);
    if (!band) return { ok: false, reason: 'no_matching_band' };
    return { ok: true, terms: band.terms, band };
  }

  // 'flat' — everyone matched gets the structure terms verbatim.
  return { ok: true, terms: ctx.flatTerms, band: null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/resolve-terms.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/resolve-terms.ts lib/fees/resolve-terms.test.ts
git commit -m "refactor(fees): extract resolvePersonTerms with characterization tests

Lifts the generator's flat/tiered branch logic into a pure function, pinned by
tests written against current behaviour. No behaviour change; the route still
uses its inline copy until the next commit.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Rewire the generator to the extracted function

Still no new behaviour. This is the risky edit, isolated so it can be reviewed and reverted alone.

**Files:**
- Modify: `app/api/admin/fees/[id]/generate/route.ts:8` (imports), `:117-131` (resolution loop)

**Interfaces:**
- Consumes: `resolvePersonTerms`, `ResolveBand`, `BillableTerm` from Task 3
- Produces: unchanged route behaviour for `flat` and `tiered`

- [ ] **Step 1: Update the imports**

In `app/api/admin/fees/[id]/generate/route.ts`, replace line 8:

```ts
import { currentYearOf, deriveStudyYear, bandForYear } from '@/lib/fees/year-of-study';
```

with:

```ts
import { currentYearOf } from '@/lib/fees/year-of-study';
import { resolvePersonTerms } from '@/lib/fees/resolve-terms';
```

`deriveStudyYear` and `bandForYear` move out of this file entirely — they are now called only from
inside `resolvePersonTerms`. Removing them from the import is part of the rewire, not an oversight.

- [ ] **Step 2: Replace the resolution loop**

Replace lines 117-131 (the block beginning `// Resolve each person to the terms...` and ending with the closing `}` of the `for` loop) with:

```ts
    // Resolve each person to the terms that apply to them. Unresolvable people
    // are skipped + reported, never guessed. See lib/fees/resolve-terms.ts.
    const resolved: Resolved[] = [];
    let unresolved = 0;
    for (const person of people) {
      const outcome = resolvePersonTerms(
        { admission_year: person.admission_year, transport_stop_id: null },
        { feeMode: fs.fee_mode, currentYear, flatTerms, bands }
      );
      if (!outcome.ok) { unresolved++; continue; }
      resolved.push({ person, terms: outcome.terms, band: outcome.band as Band | null });
    }
```

`stopTerms` / `stopRateByStopId` are deliberately **not** passed here. This task is
behaviour-preserving and handles `flat` / `tiered` only; Task 6 adds the stop-wise data. They are
optional on `ResolveContext` precisely so this call site needs no placeholder.

- [ ] **Step 3: Verify the whole fee test suite still passes**

Run: `npx vitest run lib/fees/`
Expected: PASS — all existing `bills.test.ts` and `staff-bill.test.ts` tests plus the new ones.

- [ ] **Step 4: Verify the route compiles**

Run: `npm run build`
Expected: `Compiled successfully`. (Ignore any pre-existing warnings.)

- [ ] **Step 5: Prove no behaviour change — WITHOUT touching any existing structure**

> **USER DIRECTIVE (2026-07-21):** Arts Self, and the other pre-existing fee structures, are OUT OF
> SCOPE. Do **not** open, dry-run, or generate for them. The original browser dry-run gate is
> cancelled and replaced by the two read-only checks below.

(a) The `flat` and `tiered` paths are pinned by the Task 3 characterization tests, which assert full
rupee values — not just counts. Confirm they pass:

Run: `npx vitest run lib/fees/resolve-terms.test.ts`
Expected: PASS — 7 tests.

(b) Confirm no existing structure's data was altered, via a read-only query (Supabase MCP
`execute_sql`):

```sql
select fs.name, fs.fee_mode, fs.status, fs.updated_at,
       (select count(*) from tms_fee_structure_year_band b where b.fee_structure_id=fs.id) as bands,
       (select count(*) from tms_fee_bill fb where fb.fee_structure_id=fs.id) as ledger_rows,
       (select count(*) from tms_fee_structure_stop_rate r where r.fee_structure_id=fs.id) as stop_rates,
       (select count(*) from tms_fee_structure_stop_term t where t.fee_structure_id=fs.id) as stop_terms
from tms_fee_structure fs order by fs.name;
```

Expected, unchanged from the pre-task baseline:

| name | fee_mode | updated_at | bands | ledger_rows | stop_rates | stop_terms |
|---|---|---|---|---|---|---|
| Testing | flat | 2026-06-19 06:50:59 | 0 | 2 | 0 | 0 |
| Transport Fees 2026-2027 | flat | 2026-06-19 06:48:43 | 0 | 1232 | 0 | 0 |
| Transport Fees 2026-2027(Arts Self) | tiered | 2026-06-19 06:47:46 | 2 | 718 | 0 | 0 |

Any change to `updated_at`, `bands`, or `ledger_rows` means something wrote to an existing
structure — **stop and revert**.

- [ ] **Step 6: Commit**

```bash
git add "app/api/admin/fees/[id]/generate/route.ts"
git commit -m "refactor(fees): generator calls resolvePersonTerms

Behaviour-preserving: flat and tiered dry-run counts verified unchanged
against the two live structures.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add the stop_wise branch to the pure function

**Files:**
- Modify: `lib/fees/resolve-terms.ts` (add the `stop_wise` branch)
- Test: `lib/fees/resolve-terms.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `splitAnnual` from Task 2; `ResolveContext` from Task 3
- Produces: `resolvePersonTerms` handling `feeMode === 'stop_wise'`

- [ ] **Step 1: Write the failing tests**

Append to `lib/fees/resolve-terms.test.ts`:

```ts
// ── NEW: stop_wise ──────────────────────────────────────────────────────────
describe('resolvePersonTerms — stop_wise', () => {
  const rates = new Map<string, number>([
    ['stop-kachu-palli', 9900],
    ['stop-pillukurichi', 18400],
  ]);

  it('splits the stop annual amount across the shared schedule', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-kachu-palli' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.terms).toEqual([
        { term_no: 1, term_label: 'Term 1', amount: 4950, due_date: '2026-06-15' },
        { term_no: 2, term_label: 'Term 2', amount: 4950, due_date: '2026-11-15' },
      ]);
      expect(r.band).toBeNull();
    }
  });

  it('prices a different stop differently', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-pillukurichi' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.terms.reduce((s, t) => s + t.amount, 0)).toBe(18400);
  });

  it('ignores year of study entirely', () => {
    const a = resolvePersonTerms(
      { admission_year: 2020, transport_stop_id: 'stop-kachu-palli' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    const b = resolvePersonTerms(
      { admission_year: null, transport_stop_id: 'stop-kachu-palli' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(a).toEqual(b);
  });

  it('is UNRESOLVED when the student has no boarding stop', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: null },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(r).toEqual({ ok: false, reason: 'no_stop' });
  });

  it('is UNRESOLVED when the stop has no configured rate — never billed as 0', () => {
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-with-no-rate' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: rates })
    );
    expect(r).toEqual({ ok: false, reason: 'no_stop_rate' });
  });

  it('bills a genuine zero rate rather than calling it unresolved', () => {
    const free = new Map<string, number>([['stop-free', 0]]);
    const r = resolvePersonTerms(
      { admission_year: 2024, transport_stop_id: 'stop-free' },
      ctx({ feeMode: 'stop_wise', stopRateByStopId: free })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.terms.map((t) => t.amount)).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/resolve-terms.test.ts`
Expected: FAIL — the stop_wise cases fall through to the flat branch and return `FLAT_TERMS`.

- [ ] **Step 3: Add the branch**

In `lib/fees/resolve-terms.ts`, add the import at the top (after the `year-of-study` import):

```ts
import { splitAnnual } from './stop-rate';
```

Then insert this block inside `resolvePersonTerms`, **before** the final `// 'flat'` return:

```ts
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
      terms: schedule.map((t, i) => ({
        term_no: t.term_no,
        term_label: t.term_label,
        amount: amounts[i],
        due_date: t.due_date,
      })),
    };
  }
```

Add a test for that guard to the `stop_wise` describe block:

```ts
  it('throws when the schedule is missing — a bug affecting everyone, not a per-student gap', () => {
    expect(() =>
      resolvePersonTerms(
        { admission_year: 2024, transport_stop_id: 'stop-kachu-palli' },
        ctx({ feeMode: 'stop_wise', stopRateByStopId: rates, stopTerms: [] })
      )
    ).toThrow(/non-empty stopTerms/i);
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/resolve-terms.test.ts`
Expected: PASS — 14 tests. The flat/tiered characterization tests must still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/resolve-terms.ts lib/fees/resolve-terms.test.ts
git commit -m "feat(fees): stop_wise branch in resolvePersonTerms

Amount comes from the student's boarding stop, split across the shared
schedule. A missing rate is unresolved; a configured rate of 0 is billed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Load stop data in the generator and report unresolved reasons

**Files:**
- Modify: `app/api/admin/fees/[id]/generate/route.ts` — term loading (`:69-113`), resolution loop, preview (`:193-212`), run notes (`:341-353`)

**Interfaces:**
- Consumes: `resolvePersonTerms`, `UNRESOLVED_LABEL`, `StopScheduleTerm` (Tasks 3, 5)
- Produces: dry-run preview containing `unresolvedByReason`

- [ ] **Step 1: Import the label map**

Update the import added in Task 4 to:

```ts
import {
  resolvePersonTerms,
  UNRESOLVED_LABEL,
  type StopScheduleTerm,
  type UnresolvedReason,
} from '@/lib/fees/resolve-terms';
```

- [ ] **Step 2: Add the mode flag**

After line 56 (`const isTiered = fs.fee_mode === 'tiered';`) add:

```ts
    const isStopWise = fs.fee_mode === 'stop_wise';
    if (isStopWise && fs.audience !== 'student') {
      return NextResponse.json(
        { error: 'Stop-wise fee structures apply to students only.' },
        { status: 400 }
      );
    }
```

- [ ] **Step 3: Load the stop schedule and rates**

Immediately **before** the line `const people = await resolveApplicablePeople(supabase, fs);`, insert:

```ts
    // stop_wise: the shared share-based schedule + every configured stop rate.
    const stopTerms: StopScheduleTerm[] = [];
    const stopRateByStopId = new Map<string, number>();
    if (isStopWise) {
      const { data: stRows, error: stErr } = await supabase
        .from('tms_fee_structure_stop_term')
        .select('term_no, term_label, due_date, share_percent')
        .eq('fee_structure_id', id)
        .order('term_no', { ascending: true });
      if (stErr) {
        return NextResponse.json({ error: 'Failed to load the instalment schedule.' }, { status: 500 });
      }
      for (const t of (stRows ?? []) as Array<{
        term_no: number; term_label: string | null; due_date: string; share_percent: number;
      }>) {
        stopTerms.push({
          term_no: t.term_no,
          term_label: t.term_label,
          due_date: t.due_date,
          share_percent: Number(t.share_percent),
        });
      }
      if (stopTerms.length === 0) {
        return NextResponse.json(
          { error: 'This stop-wise fee structure has no instalment terms defined.' },
          { status: 400 }
        );
      }

      const { data: rateRows, error: rateErr } = await supabase
        .from('tms_fee_structure_stop_rate')
        .select('stop_id, annual_amount')
        .eq('fee_structure_id', id);
      if (rateErr) {
        return NextResponse.json({ error: 'Failed to load stop rates.' }, { status: 500 });
      }
      for (const r of (rateRows ?? []) as Array<{ stop_id: string; annual_amount: number }>) {
        stopRateByStopId.set(r.stop_id, Number(r.annual_amount));
      }
      if (stopRateByStopId.size === 0) {
        return NextResponse.json(
          { error: 'This stop-wise fee structure has no stop rates. Upload the rate sheet first.' },
          { status: 400 }
        );
      }
    }
```

- [ ] **Step 4: Fetch each learner's boarding stop**

Immediately **after** `const people = await resolveApplicablePeople(supabase, fs);`, insert:

```ts
    // Boarding stops for the cohort. Fetched here rather than inside
    // resolveApplicablePeople because the staff cron shares that function and
    // must not change. Chunked to 150 ids: a larger .in() overflows the
    // Supabase gateway with HTTP 400, and an unchecked { data: null } would
    // silently make every learner look stop-less.
    const stopByPerson = new Map<string, string | null>();
    if (isStopWise) {
      const ids = people.map((p) => p.person_id);
      const CHUNK_STOPS = 150;
      for (let i = 0; i < ids.length; i += CHUNK_STOPS) {
        const { data: lp, error: lpErr } = await supabase
          .from('learners_profiles')
          .select('id, transport_stop_id')
          .in('id', ids.slice(i, i + CHUNK_STOPS));
        if (lpErr) {
          return NextResponse.json({ error: 'Failed to resolve boarding stops.' }, { status: 500 });
        }
        for (const r of (lp ?? []) as Array<{ id: string; transport_stop_id: string | null }>) {
          stopByPerson.set(r.id, r.transport_stop_id);
        }
      }
    }
```

- [ ] **Step 5: Feed the real stop data into the resolution loop**

Replace the loop body written in Task 4 so it passes the loaded data instead of empty placeholders. Replace the whole `const resolved: Resolved[] = [] ... }` block with:

```ts
    const resolved: Resolved[] = [];
    let unresolved = 0;
    const unresolvedByReason: Record<UnresolvedReason, number> = {
      no_matching_band: 0,
      no_stop: 0,
      no_stop_rate: 0,
    };
    for (const person of people) {
      const outcome = resolvePersonTerms(
        {
          admission_year: person.admission_year,
          transport_stop_id: stopByPerson.get(person.person_id) ?? null,
        },
        { feeMode: fs.fee_mode, currentYear, flatTerms, bands, stopTerms, stopRateByStopId }
      );
      if (!outcome.ok) {
        unresolved++;
        unresolvedByReason[outcome.reason]++;
        continue;
      }
      resolved.push({ person, terms: outcome.terms, band: outcome.band as Band | null });
    }
```

Note: Task 4 deliberately passed no stop data, so there are no placeholder declarations to remove — this step only widens the context object and the person object with the real values loaded in Steps 3 and 4.

- [ ] **Step 6: Surface the reasons in the preview**

In the `preview` object (around line 193), add these two properties after `unresolved,`:

```ts
      unresolvedByReason,
      stopRateCount: isStopWise ? stopRateByStopId.size : null,
```

- [ ] **Step 7: Report reasons in the run note**

Replace the `noteParts` block (around line 344):

```ts
      if (unresolved > 0) noteParts.push(`${unresolved} learner(s) unresolved (no admission year / no matching band)`);
```

with:

```ts
      for (const [reason, count] of Object.entries(unresolvedByReason)) {
        if (count > 0) {
          noteParts.push(`${count} learner(s) unresolved — ${UNRESOLVED_LABEL[reason as UnresolvedReason]}`);
        }
      }
```

- [ ] **Step 8: Verify tests and build**

Run: `npx vitest run lib/fees/`
Expected: PASS.

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 9: Re-verify the existing structures are unchanged**

Repeat Task 4 Step 5's dry-runs on the flat and tiered structures. `applicable`, `unresolved`, `toGeneratePairs` and `alreadyBilledPairs` must still match the recorded values, and `unresolvedByReason.no_matching_band` must equal `unresolved` for the tiered one.

- [ ] **Step 10: Commit**

```bash
git add "app/api/admin/fees/[id]/generate/route.ts"
git commit -m "feat(fees): generate stop_wise bills with per-reason unresolved reporting

Loads the share schedule and stop rates, resolves each learner's boarding stop
via a chunked query, and reports unresolved learners split by reason. Refuses
to generate when the schedule or rates are missing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Stop-rate API and structure read

**Files:**
- Create: `app/api/admin/fees/[id]/stop-rates/route.ts`
- Modify: `app/api/admin/fees/[id]/route.ts` (return `stop_terms` + `stop_rates`)

**Interfaces:**
- Consumes: `FeeStructureStopRate`, `FeeStructureStopTerm` (Task 1)
- Produces: `GET /api/admin/fees/[id]/stop-rates` → `{ success, data: { rates: FeeStructureStopRate[] } }`; `PUT` same path with body `{ rates: Array<{ stop_id: string; annual_amount: number }> }`

- [ ] **Step 1: Create the stop-rates route**

Create `app/api/admin/fees/[id]/stop-rates/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route context, so pull the [id] from the path:
// /api/admin/fees/<id>/stop-rates
function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  tms_route: { route_number: string; route_name: string } | null;
}

/**
 * Every stop on every route, left-joined to this structure's configured rate.
 * Returns the full stop list (not just configured ones) so the admin UI can
 * show which stops still need a rate.
 */
async function list(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, route_id, tms_route(route_number, route_name)')
      .order('sequence_order', { ascending: true });
    if (stopErr) {
      return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });
    }

    const { data: rates, error: rateErr } = await supabase
      .from('tms_fee_structure_stop_rate')
      .select('stop_id, annual_amount')
      .eq('fee_structure_id', id);
    if (rateErr) {
      return NextResponse.json({ error: 'Failed to load stop rates' }, { status: 500 });
    }
    const rateBy = new Map<string, number>(
      ((rates ?? []) as Array<{ stop_id: string; annual_amount: number }>).map((r) => [
        r.stop_id,
        Number(r.annual_amount),
      ])
    );

    const rows = ((stops ?? []) as unknown as StopRow[]).map((s) => ({
      stop_id: s.id,
      stop_name: s.stop_name,
      sequence_order: s.sequence_order,
      route_id: s.route_id,
      route_number: s.tms_route?.route_number ?? null,
      route_name: s.tms_route?.route_name ?? null,
      annual_amount: rateBy.has(s.id) ? (rateBy.get(s.id) as number) : null,
    }));
    rows.sort(
      (a, b) =>
        String(a.route_number ?? '').localeCompare(String(b.route_number ?? '')) ||
        a.sequence_order - b.sequence_order
    );

    return NextResponse.json({ success: true, data: { rates: rows } });
  } catch (e) {
    console.error('Stop rates list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Upsert a batch of stop rates. A null/absent amount DELETES that stop's rate. */
async function upsert(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const input = Array.isArray(body?.rates) ? body.rates : null;
    if (!input) return NextResponse.json({ error: 'rates[] is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase
      .from('tms_fee_structure')
      .select('id, fee_mode')
      .eq('id', id)
      .maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.fee_mode !== 'stop_wise') {
      return NextResponse.json(
        { error: 'Stop rates apply only to stop-wise fee structures.' },
        { status: 400 }
      );
    }

    const toUpsert: Array<{ fee_structure_id: string; stop_id: string; annual_amount: number }> = [];
    const toDelete: string[] = [];
    for (const r of input as Array<{ stop_id?: string; annual_amount?: unknown }>) {
      if (!r?.stop_id) continue;
      if (r.annual_amount === null || r.annual_amount === undefined || r.annual_amount === '') {
        toDelete.push(r.stop_id);
        continue;
      }
      const amount = Number(r.annual_amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json(
          { error: `Invalid amount for stop ${r.stop_id}` },
          { status: 400 }
        );
      }
      toUpsert.push({ fee_structure_id: id, stop_id: r.stop_id, annual_amount: amount });
    }

    if (toDelete.length) {
      const { error } = await supabase
        .from('tms_fee_structure_stop_rate')
        .delete()
        .eq('fee_structure_id', id)
        .in('stop_id', toDelete);
      if (error) return NextResponse.json({ error: 'Failed to clear stop rates' }, { status: 500 });
    }
    if (toUpsert.length) {
      const { error } = await supabase
        .from('tms_fee_structure_stop_rate')
        .upsert(toUpsert, { onConflict: 'fee_structure_id,stop_id' });
      if (error) return NextResponse.json({ error: 'Failed to save stop rates' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { saved: toUpsert.length, cleared: toDelete.length },
      message: `Saved ${toUpsert.length} stop rate(s).`,
    });
  } catch (e) {
    console.error('Stop rates upsert error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => list(request, auth));
export const PUT = withAuth((request, auth) => upsert(request, auth));
```

- [ ] **Step 2: Return stop data from the structure GET**

In `app/api/admin/fees/[id]/route.ts`, after the block that loads `bands`, add:

```ts
  let stopTerms: unknown[] = [];
  let stopRates: unknown[] = [];
  if (data.fee_mode === 'stop_wise') {
    const [{ data: st }, { data: sr }] = await Promise.all([
      supabase
        .from('tms_fee_structure_stop_term')
        .select('id, term_no, term_label, due_date, share_percent')
        .eq('fee_structure_id', data.id)
        .order('term_no', { ascending: true }),
      supabase
        .from('tms_fee_structure_stop_rate')
        .select('id, stop_id, annual_amount')
        .eq('fee_structure_id', data.id),
    ]);
    stopTerms = st ?? [];
    stopRates = sr ?? [];
  }
```

Then add `stop_terms: stopTerms, stop_rates: stopRates,` to the returned `data` object.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Probe the endpoint**

With `npm run dev -- -p 3001` running and no session cookie:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/admin/fees/6b2ebf76-f06d-4f40-95fb-f8654f152f16/stop-rates
```

Expected: `307` or `401` — proof the route exists and is auth-gated. A `404` means the file is in the wrong place.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/fees/[id]/stop-rates/route.ts" "app/api/admin/fees/[id]/route.ts"
git commit -m "feat(fees): stop-rate CRUD API

GET returns every route stop left-joined to its configured rate so the UI can
show gaps. PUT upserts a batch; a null amount clears that stop's rate.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Template export and sheet parsing

**Files:**
- Create: `lib/fees/stop-template.ts`
- Test: `lib/fees/stop-template.test.ts`
- Create: `app/api/admin/fees/[id]/stop-rates/template/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `interface TemplateStop { stop_id: string; stop_name: string; sequence_order: number; route_number: string | null; route_name: string | null }`
  - `interface ParsedRate { stop_id: string; annual_amount: number }`
  - `interface ParseError { row: number; message: string }`
  - `buildTemplateRows(stops: TemplateStop[], existing: Map<string, number>): Record<string, string | number>[]`
  - `parseImportRows(rows: Record<string, unknown>[], known: Map<string, TemplateStop>): { rates: ParsedRate[]; errors: ParseError[] }`
  - `TEMPLATE_HEADERS: string[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/fees/stop-template.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildTemplateRows,
  parseImportRows,
  TEMPLATE_HEADERS,
  type TemplateStop,
} from './stop-template';

const STOPS: TemplateStop[] = [
  { stop_id: 's1', stop_name: 'KACHU PALLI', sequence_order: 3, route_number: '37', route_name: 'THULASAMPATTI' },
  { stop_id: 's2', stop_name: 'METTUPALAYAM', sequence_order: 4, route_number: '37', route_name: 'THULASAMPATTI' },
];
const known = new Map(STOPS.map((s) => [s.stop_id, s]));

describe('buildTemplateRows', () => {
  it('emits one row per stop with a blank amount when unconfigured', () => {
    const rows = buildTemplateRows(STOPS, new Map());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      route_number: '37',
      route_name: 'THULASAMPATTI',
      sequence_order: 3,
      stop_name: 'KACHU PALLI',
      stop_id: 's1',
      annual_amount: '',
    });
  });

  it('pre-fills amounts that are already configured', () => {
    const rows = buildTemplateRows(STOPS, new Map([['s1', 9900]]));
    expect(rows[0].annual_amount).toBe(9900);
    expect(rows[1].annual_amount).toBe('');
  });

  it('exposes headers matching the row keys', () => {
    const rows = buildTemplateRows(STOPS, new Map());
    expect(Object.keys(rows[0])).toEqual(TEMPLATE_HEADERS);
  });
});

describe('parseImportRows', () => {
  it('accepts a well-formed row', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: 9900 }],
      known
    );
    expect(errors).toEqual([]);
    expect(rates).toEqual([{ stop_id: 's1', annual_amount: 9900 }]);
  });

  it('skips a blank amount without erroring — partial fills are allowed', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: '' }],
      known
    );
    expect(errors).toEqual([]);
    expect(rates).toEqual([]);
  });

  it('rejects an unknown stop_id', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 'nope', route_number: '37', stop_name: 'X', annual_amount: 100 }],
      known
    );
    expect(rates).toEqual([]);
    expect(errors[0].message).toMatch(/unknown stop_id/i);
    expect(errors[0].row).toBe(2); // header is row 1
  });

  it('rejects a row whose stop_name no longer matches the stop_id', () => {
    // The tripwire: rows reordered or a column pasted over.
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'METTUPALAYAM', annual_amount: 100 }],
      known
    );
    expect(rates).toEqual([]);
    expect(errors[0].message).toMatch(/does not match/i);
  });

  it('rejects a row whose route_number no longer matches', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '13', stop_name: 'KACHU PALLI', annual_amount: 100 }],
      known
    );
    expect(rates).toEqual([]);
    expect(errors[0].message).toMatch(/does not match/i);
  });

  it('rejects a non-numeric amount', () => {
    const { errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: 'nine thousand' }],
      known
    );
    expect(errors[0].message).toMatch(/not a number/i);
  });

  it('rejects a negative amount', () => {
    const { errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: -5 }],
      known
    );
    expect(errors[0].message).toMatch(/cannot be negative/i);
  });

  it('rejects a duplicate stop_id rather than silently taking the last', () => {
    const { errors } = parseImportRows(
      [
        { stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: 100 },
        { stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: 200 },
      ],
      known
    );
    expect(errors[0].message).toMatch(/duplicate/i);
  });

  it('collects every bad row rather than stopping at the first', () => {
    const { errors } = parseImportRows(
      [
        { stop_id: 'nope', route_number: '37', stop_name: 'X', annual_amount: 1 },
        { stop_id: 's2', route_number: '37', stop_name: 'METTUPALAYAM', annual_amount: -1 },
      ],
      known
    );
    expect(errors).toHaveLength(2);
  });

  it('tolerates numeric strings and comma-formatted amounts from Excel', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: '9,900' }],
      known
    );
    expect(errors).toEqual([]);
    expect(rates).toEqual([{ stop_id: 's1', annual_amount: 9900 }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/stop-template.test.ts`
Expected: FAIL — `Failed to resolve import "./stop-template"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/stop-template.ts`:

```ts
// lib/fees/stop-template.ts
// Shaping and validation for the stop-rate sheet.
//
// The template is generated FROM live tms_route_stop rows, so the college fills
// in amounts against stops that provably exist. Matching back is on stop_id —
// exact, never fuzzy. The visible route_number / stop_name columns exist so a
// human can read the sheet, and act as a TRIPWIRE: if rows get reordered or a
// column is pasted over, the names stop agreeing with the id and the row is
// rejected instead of quietly pricing the wrong stop.

export interface TemplateStop {
  stop_id: string;
  stop_name: string;
  sequence_order: number;
  route_number: string | null;
  route_name: string | null;
}

export interface ParsedRate {
  stop_id: string;
  annual_amount: number;
}

export interface ParseError {
  row: number; // 1-based sheet row, header included
  message: string;
}

export const TEMPLATE_HEADERS = [
  'route_number',
  'route_name',
  'sequence_order',
  'stop_name',
  'stop_id',
  'annual_amount',
] as const;

/** One row per stop, pre-filled with any already-configured amount. */
export function buildTemplateRows(
  stops: TemplateStop[],
  existing: Map<string, number>
): Record<string, string | number>[] {
  return stops.map((s) => ({
    route_number: s.route_number ?? '',
    route_name: s.route_name ?? '',
    sequence_order: s.sequence_order,
    stop_name: s.stop_name,
    stop_id: s.stop_id,
    annual_amount: existing.has(s.stop_id) ? (existing.get(s.stop_id) as number) : '',
  }));
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

/**
 * Validate a parsed sheet. Collects EVERY bad row so the operator can fix the
 * sheet in one pass; the caller writes nothing when `errors` is non-empty.
 */
export function parseImportRows(
  rows: Record<string, unknown>[],
  known: Map<string, TemplateStop>
): { rates: ParsedRate[]; errors: ParseError[] } {
  const rates: ParsedRate[] = [];
  const errors: ParseError[] = [];
  const seen = new Set<string>();

  rows.forEach((raw, i) => {
    const rowNo = i + 2; // sheet row: +1 for 0-index, +1 for the header row
    const stopId = String(raw.stop_id ?? '').trim();
    if (!stopId) {
      errors.push({ row: rowNo, message: 'Missing stop_id.' });
      return;
    }
    const stop = known.get(stopId);
    if (!stop) {
      errors.push({ row: rowNo, message: `Unknown stop_id "${stopId}" — not a current route stop.` });
      return;
    }
    if (seen.has(stopId)) {
      errors.push({ row: rowNo, message: `Duplicate row for stop "${stop.stop_name}".` });
      return;
    }
    seen.add(stopId);

    if (norm(raw.stop_name) !== norm(stop.stop_name)) {
      errors.push({
        row: rowNo,
        message: `stop_name "${String(raw.stop_name ?? '')}" does not match stop_id (expected "${stop.stop_name}"). Were rows reordered?`,
      });
      return;
    }
    if (norm(raw.route_number) !== norm(stop.route_number)) {
      errors.push({
        row: rowNo,
        message: `route_number "${String(raw.route_number ?? '')}" does not match stop_id (expected "${stop.route_number ?? ''}").`,
      });
      return;
    }

    const rawAmount = raw.annual_amount;
    if (rawAmount === null || rawAmount === undefined || String(rawAmount).trim() === '') {
      return; // blank = not yet priced; allowed
    }
    const amount = Number(String(rawAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(amount)) {
      errors.push({ row: rowNo, message: `Amount "${String(rawAmount)}" is not a number.` });
      return;
    }
    if (amount < 0) {
      errors.push({ row: rowNo, message: 'Amount cannot be negative.' });
      return;
    }
    rates.push({ stop_id: stopId, annual_amount: amount });
  });

  return { rates, errors };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/stop-template.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Create the template download route**

Create `app/api/admin/fees/[id]/stop-rates/template/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { buildTemplateRows, TEMPLATE_HEADERS, type TemplateStop } from '@/lib/fees/stop-template';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  tms_route: { route_number: string; route_name: string } | null;
}

async function template(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, tms_route(route_number, route_name)')
      .order('sequence_order', { ascending: true });
    if (stopErr) {
      return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });
    }

    const { data: rates } = await supabase
      .from('tms_fee_structure_stop_rate')
      .select('stop_id, annual_amount')
      .eq('fee_structure_id', id);
    const existing = new Map<string, number>(
      ((rates ?? []) as Array<{ stop_id: string; annual_amount: number }>).map((r) => [
        r.stop_id,
        Number(r.annual_amount),
      ])
    );

    const list: TemplateStop[] = ((stops ?? []) as unknown as StopRow[]).map((s) => ({
      stop_id: s.id,
      stop_name: s.stop_name,
      sequence_order: s.sequence_order,
      route_number: s.tms_route?.route_number ?? null,
      route_name: s.tms_route?.route_name ?? null,
    }));
    list.sort(
      (a, b) =>
        String(a.route_number ?? '').localeCompare(String(b.route_number ?? '')) ||
        a.sequence_order - b.sequence_order
    );

    const rows = buildTemplateRows(list, existing);
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...TEMPLATE_HEADERS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stop Rates');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="stop-rates-template.xlsx"`,
      },
    });
  } catch (e) {
    console.error('Stop rate template error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => template(request, auth));
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add lib/fees/stop-template.ts lib/fees/stop-template.test.ts "app/api/admin/fees/[id]/stop-rates/template/route.ts"
git commit -m "feat(fees): stop-rate template export and sheet validation

Template is generated from live tms_route_stop rows. Import matching is on
stop_id; the visible name columns act as a tripwire against reordered rows.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Sheet import endpoint

**Files:**
- Create: `app/api/admin/fees/[id]/stop-rates/import/route.ts`

**Interfaces:**
- Consumes: `parseImportRows`, `TemplateStop` (Task 8)
- Produces: `POST /api/admin/fees/[id]/stop-rates/import` (multipart, field `file`) → `{ success, data: { imported, errors: ParseError[] } }` or `{ error, data: { errors } }` with 400

- [ ] **Step 1: Create the import route**

Create `app/api/admin/fees/[id]/stop-rates/import/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseImportRows, type TemplateStop } from '@/lib/fees/stop-template';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  tms_route: { route_number: string; route_name: string } | null;
}

async function importSheet(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A .xlsx file is required (field "file").' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase
      .from('tms_fee_structure')
      .select('id, name, fee_mode')
      .eq('id', id)
      .maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.fee_mode !== 'stop_wise') {
      return NextResponse.json(
        { error: 'Stop rates apply only to stop-wise fee structures.' },
        { status: 400 }
      );
    }

    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: 'The workbook has no sheets.' }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, tms_route(route_number, route_name)');
    if (stopErr) {
      return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });
    }
    const known = new Map<string, TemplateStop>(
      ((stops ?? []) as unknown as StopRow[]).map((s) => [
        s.id,
        {
          stop_id: s.id,
          stop_name: s.stop_name,
          sequence_order: s.sequence_order,
          route_number: s.tms_route?.route_number ?? null,
          route_name: s.tms_route?.route_name ?? null,
        },
      ])
    );

    const { rates, errors } = parseImportRows(rows, known);

    // All-or-nothing: a sheet with any bad row writes NOTHING, so the operator
    // never ends up with a half-applied price list they cannot reason about.
    if (errors.length) {
      return NextResponse.json(
        { error: `${errors.length} row(s) rejected. Nothing was imported.`, data: { errors } },
        { status: 400 }
      );
    }
    if (!rates.length) {
      return NextResponse.json({ error: 'The sheet contained no amounts.' }, { status: 400 });
    }

    const { error: upErr } = await supabase.from('tms_fee_structure_stop_rate').upsert(
      rates.map((r) => ({ fee_structure_id: id, stop_id: r.stop_id, annual_amount: r.annual_amount })),
      { onConflict: 'fee_structure_id,stop_id' }
    );
    if (upErr) return NextResponse.json({ error: 'Failed to save stop rates' }, { status: 500 });

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: fs.name,
      description: `Imported ${rates.length} stop rate(s) for ${fs.name}`,
      metadata: { imported: rates.length },
    });

    return NextResponse.json({
      success: true,
      data: { imported: rates.length, errors: [] },
      message: `Imported ${rates.length} stop rate(s).`,
    });
  } catch (e) {
    console.error('Stop rate import error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => importSheet(request, auth));
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Verify `logActivity` accepts this module/action pair**

The activity module/action unions are CLOSED — an unlisted pair fails to compile. Confirm `'fees'` and `'update'` are both present:

Run: `npx tsc --noEmit --skipLibCheck "app/api/admin/fees/[id]/stop-rates/import/route.ts"`
Expected: no error mentioning `module` or `action`. If there is one, add the missing member to the union in `lib/activity/log.ts`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/fees/[id]/stop-rates/import/route.ts"
git commit -m "feat(fees): stop-rate sheet import

All-or-nothing: any rejected row aborts the whole import so a half-applied
price list can never exist.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Fee structure form — the stop_wise mode

**Files:**
- Modify: `app/(admin)/fees/fee-structure-form.tsx`
- Modify: `app/api/admin/fees/route.ts` (accept the mode, write stop terms)

**Interfaces:**
- Consumes: `validateShares` (Task 2); `FeeStructureStopTerm` (Task 1)
- Produces: POST/PUT `/api/admin/fees` accepting `fee_mode: 'stop_wise'` with body `stop_terms: Array<{ term_no, term_label, due_date, share_percent }>`

- [ ] **Step 1: Accept and persist stop terms in the API**

In `app/api/admin/fees/route.ts`, add this helper next to the existing `buildTermRows` / `writeBands` helpers:

```ts
import { validateShares } from '@/lib/fees/stop-rate';

/**
 * Replace a stop_wise structure's instalment schedule. Shares must sum to 100 —
 * a schedule that sums to anything else would silently over- or under-bill
 * every student on every stop.
 */
async function writeStopTerms(
  supabase: ReturnType<typeof createServiceRoleClient>,
  feeStructureId: string,
  terms: Array<{ term_no?: number; term_label?: string; due_date: string; share_percent: number }>
): Promise<string | null> {
  const shares = terms.map((t) => Number(t.share_percent));
  const invalid = validateShares(shares);
  if (invalid) return invalid;
  if (terms.some((t) => !t.due_date)) return 'Every term needs a due date.';

  await supabase.from('tms_fee_structure_stop_term').delete().eq('fee_structure_id', feeStructureId);
  const { error } = await supabase.from('tms_fee_structure_stop_term').insert(
    terms.map((t, i) => ({
      fee_structure_id: feeStructureId,
      term_no: t.term_no ?? i + 1,
      term_label: t.term_label?.toString().trim() || `Term ${i + 1}`,
      due_date: t.due_date,
      share_percent: Number(t.share_percent),
    }))
  );
  return error ? 'Failed to save the instalment schedule.' : null;
}
```

In the **POST** handler, immediately after the `writeBands` call at line 198 (which uses `parent.id`), add:

```ts
      if (body.fee_mode === 'stop_wise') {
        if (body.audience !== 'student') {
          await supabase.from('tms_fee_structure').delete().eq('id', parent.id);
          return NextResponse.json(
            { error: 'Stop-wise fee structures apply to students only.' },
            { status: 400 }
          );
        }
        const stopTerms = Array.isArray(body?.stop_terms) ? body.stop_terms : [];
        if (!stopTerms.length) {
          await supabase.from('tms_fee_structure').delete().eq('id', parent.id);
          return NextResponse.json({ error: 'Add at least one instalment term.' }, { status: 400 });
        }
        const stopErr = await writeStopTerms(supabase, parent.id, stopTerms);
        if (stopErr) {
          // Same rollback the band path uses — never leave a structure that has
          // no usable schedule, because generation would 400 with no way back.
          await supabase.from('tms_fee_structure').delete().eq('id', parent.id);
          return NextResponse.json({ error: stopErr }, { status: 400 });
        }
      }
```

In the **PUT** handler, immediately after the `writeBands` call at line 298 (which uses the local `id`), add:

```ts
      if (body.fee_mode === 'stop_wise') {
        if (body.audience !== 'student') {
          return NextResponse.json(
            { error: 'Stop-wise fee structures apply to students only.' },
            { status: 400 }
          );
        }
        const stopTerms = Array.isArray(body?.stop_terms) ? body.stop_terms : [];
        if (!stopTerms.length) {
          return NextResponse.json({ error: 'Add at least one instalment term.' }, { status: 400 });
        }
        const stopErr = await writeStopTerms(supabase, id, stopTerms);
        if (stopErr) return NextResponse.json({ error: stopErr }, { status: 400 });
      }
```

- [ ] **Step 2: Add the mode to the form**

In `app/(admin)/fees/fee-structure-form.tsx`, find the `fee_mode` selector and add a third option:

```tsx
<option value="stop_wise">Stop-wise (amount depends on boarding stop)</option>
```

Add state for the schedule alongside the existing term/band state:

```tsx
const [stopTerms, setStopTerms] = useState<
  Array<{ term_no: number; term_label: string; due_date: string; share_percent: number }>
>(initial?.stop_terms?.map((t, i) => ({
  term_no: t.term_no ?? i + 1,
  term_label: t.term_label ?? `Term ${i + 1}`,
  due_date: t.due_date,
  share_percent: Number(t.share_percent),
})) ?? [
  { term_no: 1, term_label: 'Term 1', due_date: '', share_percent: 50 },
  { term_no: 2, term_label: 'Term 2', due_date: '', share_percent: 50 },
]);
```

Render this section when `feeMode === 'stop_wise'` (in place of the year-bands section):

```tsx
{feeMode === 'stop_wise' && (
  <div className="space-y-3">
    <p className="text-sm text-muted-foreground">
      Each boarding stop carries its own annual amount, set on the structure&apos;s
      detail page after saving. These terms decide the due dates and what share of
      that annual amount falls in each instalment.
    </p>
    {stopTerms.map((t, i) => (
      <div key={i} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="text-xs">Label</label>
          <input
            className="input"
            value={t.term_label}
            onChange={(e) => {
              const next = [...stopTerms];
              next[i] = { ...next[i], term_label: e.target.value };
              setStopTerms(next);
            }}
          />
        </div>
        <div className="shrink-0">
          <label className="text-xs">Due date</label>
          <input
            type="date"
            className="input"
            value={t.due_date}
            onChange={(e) => {
              const next = [...stopTerms];
              next[i] = { ...next[i], due_date: e.target.value };
              setStopTerms(next);
            }}
          />
        </div>
        <div className="w-28 shrink-0">
          <label className="text-xs">Share %</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={t.share_percent}
            onChange={(e) => {
              const next = [...stopTerms];
              next[i] = { ...next[i], share_percent: Number(e.target.value) };
              setStopTerms(next);
            }}
          />
        </div>
        <button
          type="button"
          className="text-sm text-red-600 shrink-0"
          onClick={() => setStopTerms(stopTerms.filter((_, j) => j !== i))}
        >
          Remove
        </button>
      </div>
    ))}
    <button
      type="button"
      className="text-sm underline"
      onClick={() =>
        setStopTerms([
          ...stopTerms,
          {
            term_no: stopTerms.length + 1,
            term_label: `Term ${stopTerms.length + 1}`,
            due_date: '',
            share_percent: 0,
          },
        ])
      }
    >
      Add term
    </button>
    <p
      className={
        Math.abs(stopTerms.reduce((s, t) => s + Number(t.share_percent || 0), 0) - 100) > 0.01
          ? 'text-sm font-medium text-red-600'
          : 'text-sm text-muted-foreground'
      }
    >
      Shares total {stopTerms.reduce((s, t) => s + Number(t.share_percent || 0), 0)}% (must be 100%)
    </p>
  </div>
)}
```

In the submit handler, include `stop_terms: feeMode === 'stop_wise' ? stopTerms : undefined` in the request body, and block submission when the shares do not total 100:

```tsx
if (feeMode === 'stop_wise') {
  const total = stopTerms.reduce((s, t) => s + Number(t.share_percent || 0), 0);
  if (Math.abs(total - 100) > 0.01) {
    toast.error(`Term shares must total 100% (currently ${total}%).`);
    return;
  }
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Create a real structure end to end**

With `npm run dev -- -p 3001` running and signed in as an admin:

1. Go to `/fees/new`.
2. Name: `Transport Fees 2026-2027 (Arts Aided)`; audience **Student**; mode **Stop-wise**.
3. Institution: **JKKN College of Arts and Science (Aided)**.
4. Terms: `Term 1` due `2026-06-15` share `50`; `Term 2` due `2026-11-15` share `50`.
5. Save.

Expected: saves without error. Then confirm the schedule persisted:

```sql
select term_no, term_label, due_date, share_percent
from tms_fee_structure_stop_term
where fee_structure_id = (select id from tms_fee_structure where name like '%Arts Aided%')
order by term_no;
```

Expected: 2 rows summing to 100.

Also confirm the shares guard fires: edit the structure, set Term 2's share to `40`, and try to save. Expected: blocked with "Term shares must total 100%".

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/fees/fee-structure-form.tsx" app/api/admin/fees/route.ts
git commit -m "feat(fees): stop_wise mode in the fee structure form

Terms carry a percentage share instead of a rupee amount; shares are blocked
from saving unless they total 100.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Stop rates card on the structure detail page

**Files:**
- Create: `app/(admin)/fees/[id]/stop-rates-card.tsx`
- Modify: `app/(admin)/fees/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET`/`PUT /api/admin/fees/[id]/stop-rates` (Task 7); template + import routes (Tasks 8, 9)
- Produces: `<StopRatesCard feeId={string} />`

- [ ] **Step 1: Create the card**

Create `app/(admin)/fees/[id]/stop-rates-card.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface StopRateRow {
  stop_id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  annual_amount: number | null;
}

async function fetchStopRates(feeId: string): Promise<StopRateRow[]> {
  const res = await fetch(`/api/admin/fees/${feeId}/stop-rates`);
  if (!res.ok) throw new Error('Failed to load stop rates');
  const json = await res.json();
  return json.data.rates as StopRateRow[];
}

export function StopRatesCard({ feeId }: { feeId: string }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fee-stop-rates', feeId],
    queryFn: () => fetchStopRates(feeId),
  });

  const priced = rows.filter((r) => r.annual_amount !== null);

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/fees/${feeId}/stop-rates/import`, {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        const errs: Array<{ row: number; message: string }> = json?.data?.errors ?? [];
        toast.error(json.error ?? 'Import failed');
        // Surface the first few offending rows — the operator needs the row
        // numbers to fix the sheet, and a bare "import failed" is unactionable.
        errs.slice(0, 5).forEach((e) => toast.error(`Row ${e.row}: ${e.message}`));
        return;
      }
      toast.success(json.message ?? 'Imported');
      // Invalidate the DERIVED key too: the structure detail query embeds
      // stop_rates, so refreshing only this list leaves the page stale.
      await qc.invalidateQueries({ queryKey: ['fee-stop-rates', feeId] });
      await qc.invalidateQueries({ queryKey: ['fee-structure', feeId] });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading stop rates…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/admin/fees/${feeId}/stop-rates/template`}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Download template
        </a>
        <label className="cursor-pointer rounded border px-3 py-1.5 text-sm">
          {uploading ? 'Uploading…' : 'Upload filled sheet'}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.target.value = '';
            }}
          />
        </label>
        <span className="text-sm text-muted-foreground">
          {priced.length} of {rows.length} stops priced
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3">Route</th>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Stop</th>
              <th className="py-2 pr-3 text-right">Annual (₹)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stop_id} className="border-b last:border-0">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {r.route_number} — {r.route_name}
                </td>
                <td className="py-1.5 pr-3">{r.sequence_order}</td>
                <td className="py-1.5 pr-3">{r.stop_name}</td>
                <td className="py-1.5 pr-3 text-right">
                  {r.annual_amount === null ? (
                    <span className="text-amber-600 dark:text-amber-400">needs rate</span>
                  ) : (
                    r.annual_amount.toLocaleString('en-IN')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it on the detail page**

In `app/(admin)/fees/[id]/page.tsx`, add the import:

```tsx
import { StopRatesCard } from './stop-rates-card';
```

Then, next to the existing "Year bands" SectionCard, add:

```tsx
{data.fee_mode === 'stop_wise' && (
  <SectionCard title="Stop rates">
    <StopRatesCard feeId={data.id} />
  </SectionCard>
)}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Exercise the round trip**

With the dev server on port 3001 and signed in:

1. Open the Arts Aided structure created in Task 10.
2. Click **Download template** — confirm the `.xlsx` opens with 479 stop rows and a blank `annual_amount` column.
3. Fill amounts for the 4 stops Aided students use — `KANDA KULA MANIKKAM` (route 13), `KUPPANOOR` (route 24), `KACHU PALLI` and `METTUPALAYAM` (route 37) — then save and upload it.
4. Expected: toast "Imported 4 stop rate(s)"; the table shows those 4 priced and the rest "needs rate".
5. Now edit the sheet to break the tripwire: change one row's `stop_name` while leaving its `stop_id`, and re-upload. Expected: rejected with a row number and "does not match" — and **nothing** imported.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/fees/[id]/stop-rates-card.tsx" "app/(admin)/fees/[id]/page.tsx"
git commit -m "feat(fees): stop rates card with template download and sheet upload

Shows every stop with its rate or a 'needs rate' marker, and surfaces per-row
import errors with sheet row numbers.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Student portal — show the stop behind the fee

`/student/fees` today reads only `/api/student/transport-access`, a thin wrapper around the
`tms_student_transport_access` RPC — **the payment-gate authority**. Do not widen that RPC or its
route; a mistake there is an access-control bug. Add a separate, self-scoped endpoint instead.

**Files:**
- Create: `app/api/student/transport-context/route.ts`
- Modify: `proxy.ts:119-124` (exemption list)
- Modify: `app/student/fees/page.tsx`

**Interfaces:**
- Consumes: `learners_profiles.transport_stop_id`
- Produces: `GET /api/student/transport-context` → `{ success, data: { route_label: string | null, stop_name: string | null } }`

- [ ] **Step 1: Create the endpoint**

Create `app/api/student/transport-context/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface StopJoin {
  stop_name: string;
  tms_route: { route_number: string; route_name: string } | null;
}

/**
 * The signed-in learner's boarding stop and route, for display on /student/fees.
 * Self-scoped: the learner comes from the SESSION, never from client input.
 */
async function context(_request: Request, auth: AuthContext) {
  try {
    const supabase = createServiceRoleClient();

    const { data: learner } = await supabase
      .from('learners_profiles')
      .select('id, transport_stop_id')
      .eq('profile_id', auth.userId)
      .maybeSingle();

    const stopId = (learner as { transport_stop_id: string | null } | null)?.transport_stop_id;
    if (!stopId) {
      return NextResponse.json({ success: true, data: { route_label: null, stop_name: null } });
    }

    const { data: stop } = await supabase
      .from('tms_route_stop')
      .select('stop_name, tms_route(route_number, route_name)')
      .eq('id', stopId)
      .maybeSingle();

    const r = stop as unknown as StopJoin | null;
    return NextResponse.json({
      success: true,
      data: {
        stop_name: r?.stop_name ?? null,
        route_label: r?.tms_route ? `${r.tms_route.route_number} — ${r.tms_route.route_name}` : null,
      },
    });
  } catch (e) {
    console.error('Transport context error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => context(request, auth));
```

- [ ] **Step 2: Exempt it from the fee gate**

**This step is load-bearing and easy to miss.** `proxy.ts` blocks fee-overdue learners from every
`/api/student/*` route not on the exemption list, returning 402. A learner viewing `/student/fees`
is very often exactly that learner — so without this the banner silently vanishes for the students
who most need it. This precise bug shipped once before with `/api/student/vacate-request`.

In `proxy.ts`, extend the list at lines 119-124:

```ts
  const STUDENT_EXEMPT_WHEN_BLOCKED = [
    '/student/fees',
    '/student/grievances',
    '/api/student/transport-access',
    '/api/student/vacate-request',
    '/api/student/transport-context',
  ];
```

Safe because the route is self-scoped (learner resolved from the session, never client input) and
still area-gated by the `student` area permission — only the *fee* gate is bypassed.

- [ ] **Step 3: Render the banner**

In `app/student/fees/page.tsx`, add the query alongside the existing `transport-access` fetch:

```tsx
const { data: transport } = useQuery({
  queryKey: ['student-transport-context'],
  queryFn: async () => {
    const res = await fetch('/api/student/transport-context', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) return { route_label: null, stop_name: null };
    return (await res.json()).data as { route_label: string | null; stop_name: string | null };
  },
});
```

Then, above the existing bill list, add:

```tsx
{transport?.stop_name && (
  <div className="mb-4 rounded-lg border bg-muted/40 p-4 dark:bg-muted/20">
    <p className="text-sm text-muted-foreground">Your transport fee is based on your boarding stop</p>
    <p className="mt-1 font-medium">
      {transport.stop_name}
      {transport.route_label ? ` · Route ${transport.route_label}` : ''}
    </p>
  </div>
)}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 5: Probe the endpoint and its exemption**

With `npm run dev -- -p 3001` running and no session cookie:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/student/transport-context
```

Expected: `307` or `401` — the route exists and is auth-gated. `404` means the file is misplaced.

Then confirm the exemption is wired:

```bash
grep -n "transport-context" proxy.ts
```

Expected: one hit inside `STUDENT_EXEMPT_WHEN_BLOCKED`.

- [ ] **Step 6: Verify as a real student**

This flow is auth-gated and cannot be checked headlessly — the agent's browser has no session. Ask
the user to sign in as one of the 6 Aided bus students and open `/student/fees`.

Expected: the banner names their stop and route, and the bills below match the split of that stop's
annual rate. **Ask them to check with a learner who has an overdue bill too** — that is the case the
`proxy.ts` exemption exists for, and the only way to prove it works.

- [ ] **Step 7: Commit**

```bash
git add app/api/student/transport-context/route.ts proxy.ts app/student/fees/page.tsx
git commit -m "feat(fees): show boarding stop behind a student's transport fee

Adds a self-scoped transport-context endpoint rather than widening the
payment-gate RPC, and exempts it from the fee gate so overdue learners can
still see why they are being charged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Full test suite**

Run: `npm test`
Expected: PASS, including the flat/tiered characterization tests.

- [ ] **Build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **No regression to existing structures — read-only check, no dry-runs**

> **USER DIRECTIVE:** do NOT dry-run or generate for Arts Self or the flat structures.

Re-run the read-only query from Task 4 Step 5. Every existing structure's `updated_at`, `bands`,
`ledger_rows` must be unchanged, and `stop_rates` / `stop_terms` must still be **0** for all three —
proving the new tables never touched them.

- [ ] **End-to-end on the real cohort**

1. Confirm all 4 Aided stops are priced.
2. Activate the Arts Aided structure.
3. **Dry run.** Expected: `applicable: 6`, `unresolved: 0`, `toGeneratePairs: 12` (6 students × 2 terms). If `unresolvedByReason.no_stop_rate > 0`, a student sits at an unpriced stop — fix the sheet, do not generate.
4. **Generate.** Expected: `learnerBilled: 12`.
5. Verify the money is correct and each student's total equals their stop's annual rate:

```sql
select lp.first_name, s.stop_name, r.annual_amount as expected,
       sum(b.amount) as billed, count(*) as terms
from tms_fee_bill b
join learners_profiles lp on lp.id = b.person_id
join tms_route_stop s on s.id = lp.transport_stop_id
join tms_fee_structure_stop_rate r
  on r.stop_id = lp.transport_stop_id and r.fee_structure_id = b.fee_structure_id
where b.fee_structure_id = (select id from tms_fee_structure where name like '%Arts Aided%')
group by 1, 2, 3
order by 1;
```

Expected: `billed = expected` for every row, `terms = 2`. Any mismatch means the split is wrong — stop and fix before this reaches students.

6. Re-run **Generate**. Expected: `learnerBilled: 0`, `skipped: 12` — idempotency holds.
