# Automatic Transport Bill Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual "click Generate" treadmill (8 runs on 2026-08-11 alone) with a scheduled sweep that bills newly-onboarded learners within 15 minutes, using the institution-wise fee structure that already matches them.

**Architecture:** Extract the existing 763-line billing engine out of its route handler into `lib/fees/generate.ts` without changing its behaviour, add a thin sweep (`lib/fees/auto-generate.ts`) that runs it over structures flagged `auto_generate`, expose it as a `CRON_SECRET`-gated endpoint, and schedule that endpoint from **pg_cron + pg_net** (Vercel crons are proven dead in this project). Correctness rests on the existing `tms_fee_bill_idem_unique` constraint, which makes re-running physically unable to double-bill.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (service-role client), Vitest, pg_cron 1.6, pg_net 0.10.

**Spec:** `docs/superpowers/specs/2026-08-11-auto-bill-generation-on-onboarding-design.md`

**Branch:** `feat/auto-bill-on-onboarding` (already created, spec committed as `f06ea43`)

## Global Constraints

Every task inherits these. They come from the spec and from hard-won project rules.

- **Phase 1 must not change behaviour.** The extraction is mechanical. `skipConflicts` and `skipEmptyRun` default to `false`, which is exactly what the route does today.
- **Never change a due date.** Structure `due_date` is copied verbatim into both `billing_student_bills` and `tms_fee_bill`. TMS and MyJKKN must agree.
- **Every `.in()` filter chunks to ≤150 ids and checks its error.** A larger list overflows the Supabase gateway with HTTP 400, and an unchecked `{data: null}` reads as an empty set. This is how silent under-billing happens.
- **Fail loud on money reads.** A failed override / conflict / exemption load returns an error; it must never be treated as "none found".
- **Allowlist the exact cron path only** — `/api/cron/auto-generate-bills` in `PUBLIC_PATHS`, never the `/api/cron/` prefix. The prefix would wake `/api/cron/incharge-attendance`, which removes bus in-charges from their role and bills them.
- **`auto_generate` is the only exclusion mechanism.** No hardcoded structure-id or name blocklist.
- **Do not merge or cherry-pick `feat/auto-bill-generation` (PR #12).** It is 86 commits stale and predates per-student overrides; merging it would overcharge scholarship learners.
- **Run tests with `npm test`** (`vitest run`). Do **not** trust `npm run lint` (crashes on a circular config) or a clean `tsc` (~540 chronic pre-existing errors, not gated by `next build`).
- Reuse `istToday()` from `lib/booking/window.ts` for "today in IST". Do not write a new date helper.

---

# Phase 1 — Extraction (no behaviour change)

Mergeable on its own. Nothing in this phase makes the system generate a single extra bill.

---

### Task 1: Fake Supabase test double + engine characterization tests

The engine is money code. Before moving it, pin what it currently produces so the move is provably behaviour-preserving.

**Files:**
- Create: `lib/fees/__testing__/fake-supabase.ts`
- Create: `lib/fees/generate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `makeFakeSupabase(data, opts?) => FakeSupabase` — a chainable, awaitable Supabase test double used by Tasks 1, 3, 4, 5 and 9. Also asserts the shape of `generateBills(svc, opts)` from Task 2.

- [ ] **Step 1: Write the test double**

Create `lib/fees/__testing__/fake-supabase.ts`:

```ts
// A minimal, chainable stand-in for a Supabase client, enough to drive
// lib/fees/generate.ts in tests without a database.
//
// It deliberately does NOT implement filtering: the real filtering happens in
// SQL, so a test supplies the rows a query WOULD have returned, keyed by table.
// That keeps these tests about orchestration (who gets billed, what is
// counted) rather than re-implementing PostgREST.

export interface FakeCall {
  table: string;
  ops: Array<[string, unknown[]]>;
}

export interface FakeSupabaseOptions {
  /** Force an error for a given table, to test fail-loud paths. */
  errors?: Record<string, { message: string; code?: string }>;
  /** Force an error only on INSERT into a given table. */
  insertErrors?: Record<string, { message: string; code?: string }>;
}

export interface FakeSupabase {
  from: (table: string) => any;
  rpc: (...args: unknown[]) => Promise<{ data: unknown; error: null }>;
  /** Every query issued, in order — assert on this to prove chunking etc. */
  calls: FakeCall[];
}

const CHAINABLE = [
  'select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'gte', 'lte',
] as const;

export function makeFakeSupabase(
  data: Record<string, unknown[]>,
  opts: FakeSupabaseOptions = {}
): FakeSupabase {
  const calls: FakeCall[] = [];
  let insertSeq = 0;

  function builder(table: string) {
    const call: FakeCall = { table, ops: [] };
    calls.push(call);

    const rows = () => (data[table] ?? []) as unknown[];
    const err = () => opts.errors?.[table] ?? null;

    const b: any = {};
    for (const op of CHAINABLE) {
      b[op] = (...args: unknown[]) => {
        call.ops.push([op, args]);
        return b;
      };
    }
    b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: err() });
    b.single = async () => ({ data: rows()[0] ?? null, error: err() });

    b.insert = (payload: unknown) => {
      call.ops.push(['insert', [payload]]);
      const insErr = opts.insertErrors?.[table] ?? err();
      const id = `fake-${table}-${++insertSeq}`;
      const ins: any = {
        select: () => ins,
        single: async () => ({ data: insErr ? null : { id }, error: insErr }),
        maybeSingle: async () => ({ data: insErr ? null : { id }, error: insErr }),
      };
      // Awaitable without .select()
      ins.then = (res: any, rej: any) =>
        Promise.resolve({ data: null, error: insErr }).then(res, rej);
      return ins;
    };

    b.update = (payload: unknown) => {
      call.ops.push(['update', [payload]]);
      return b;
    };
    b.delete = () => {
      call.ops.push(['delete', []]);
      return b;
    };

    // Make the builder itself awaitable, resolving to the canned rows.
    b.then = (res: any, rej: any) =>
      Promise.resolve({ data: rows(), error: err() }).then(res, rej);

    return b;
  }

  return {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: null, error: null }),
    calls,
  };
}
```

- [ ] **Step 2: Write the failing characterization test**

Create `lib/fees/generate.test.ts`. These values are read off the current route
logic in `app/api/admin/fees/[id]/generate/route.ts` and must survive the move.

```ts
import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from './__testing__/fake-supabase';
import { generateBills } from './generate';

function flatFixture(overrides: Record<string, unknown[]> = {}) {
  return makeFakeSupabase({
    tms_fee_structure: [{
      id: 'fs1',
      name: 'Transport Fees Test',
      status: 'active',
      audience: 'student',
      fee_mode: 'flat',
      transport_year_id: 'ty1',
      institution_ids: null,
      staff_role_keys: null,
      lifecycle_statuses: null,
    }],
    tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
    tms_fee_structure_term: [
      { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
      { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31', year_band_id: null },
    ],
    learners_profiles: [
      { id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null },
      { id: 'L2', institution_id: 'i1', admission_year_id: null, academic_year_id: null },
    ],
    admission_years: [],
    tms_fee_override: [],
    tms_fee_bill: [],
    ...overrides,
  });
}

describe('generateBills — flat dry run (characterization)', () => {
  it('previews every applicable learner against every term', async () => {
    const svc = flatFixture();
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1',
      mode: 'dry_run',
      actorId: 'admin-1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.data as Record<string, unknown>;

    expect(p.mode).toBe('dry_run');
    expect(p.audience).toBe('student');
    expect(p.feeMode).toBe('flat');
    expect(p.applicable).toBe(2);
    expect(p.learnerCount).toBe(2);
    expect(p.staffCount).toBe(0);
    expect(p.unresolved).toBe(0);
    expect(p.overridden).toBe(0);
    expect(p.termsPerPerson).toBe(2);
    expect(p.totalPerPerson).toBe(5500);
    expect(p.toGeneratePairs).toBe(4);      // 2 learners x 2 terms
    expect(p.alreadyBilledPairs).toBe(0);
    expect(p.conflictCount).toBe(0);
    expect(p.staffDeferred).toBe(false);
  });

  it('counts already-billed pairs instead of re-billing them', async () => {
    const svc = flatFixture({
      tms_fee_bill: [{ person_id: 'L1', term_no: 1 }],
    });
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1',
      mode: 'dry_run',
      actorId: 'admin-1',
    });
    if (!res.ok) throw new Error('expected ok');
    const p = res.data as Record<string, unknown>;
    expect(p.alreadyBilledPairs).toBe(1);
    expect(p.toGeneratePairs).toBe(3);
  });

  it('rejects a structure that is not active', async () => {
    const svc = makeFakeSupabase({
      tms_fee_structure: [{ id: 'fs1', status: 'draft', audience: 'student', fee_mode: 'flat', transport_year_id: 'ty1' }],
    });
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: 'admin-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.error).toContain('Activate the fee structure');
  });

  it('404s an unknown structure', async () => {
    const svc = makeFakeSupabase({ tms_fee_structure: [] });
    const res = await generateBills(svc as never, {
      feeStructureId: 'nope', mode: 'dry_run', actorId: 'admin-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('fails loud when overrides cannot be loaded — never bills full price', async () => {
    const svc = makeFakeSupabase(
      {
        tms_fee_structure: [{
          id: 'fs1', name: 'T', status: 'active', audience: 'student', fee_mode: 'flat',
          transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
        }],
        tms_transport_year: [{ start_date: '2026-06-01' }],
        tms_fee_structure_term: [
          { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
        ],
        learners_profiles: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
        admission_years: [],
        tms_fee_bill: [],
      },
      { errors: { tms_fee_override: { message: 'gateway timeout' } } }
    );
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: 'admin-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(500);
    expect(res.error).toContain('override');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- lib/fees/generate.test.ts`
Expected: FAIL — `Failed to resolve import "./generate"`. The module does not exist yet; Task 2 creates it.

- [ ] **Step 4: Commit**

```bash
git add lib/fees/__testing__/fake-supabase.ts lib/fees/generate.test.ts
git commit -m "test(fees): characterize the bill generation engine before extraction"
```

---

### Task 2: Extract the engine into `lib/fees/generate.ts`

A mechanical move. Read the substitution rules carefully and change **nothing else**.

**Files:**
- Create: `lib/fees/generate.ts`
- Modify: `app/api/admin/fees/[id]/generate/route.ts` (replace almost the whole file)
- Test: `lib/fees/generate.test.ts` (from Task 1, must now pass)

**Interfaces:**
- Consumes: `makeFakeSupabase` (Task 1).
- Produces:
  - `generateBills(svc: SupabaseClient, opts: GenerateOptions): Promise<GenerateResult>`
  - `interface GenerateOptions { feeStructureId: string; mode: 'dry_run' | 'generate'; personIds?: string[] | null; actorId: string | null; skipConflicts?: boolean; skipEmptyRun?: boolean }`
  - `type GenerateResult = { ok: false; status: number; error: string } | { ok: true; data: GeneratePreview | GenerateOutcome }`
  - `interface GenerateOutcome { mode: 'generate'; runId: string | null; applicable: number; learnerBilled: number; staffDeferred: number; skipped: number; unresolved: number; overridden: number; errors: number; notified: number; feeMode: string; structureName: string }`

  Tasks 4, 5 and 9 all depend on these exact names.

- [ ] **Step 1: Create the engine file**

Create `lib/fees/generate.ts` with this header, then move the body of the
`generate()` function from the route into it.

```ts
// lib/fees/generate.ts
// The transport bill generation engine.
//
// Extracted VERBATIM from app/api/admin/fees/[id]/generate/route.ts so it can
// be driven by something other than an HTTP request — specifically the
// scheduled sweep in lib/fees/auto-generate.ts. The route is now a thin wrapper
// that does permission checking, activity logging and HTTP shaping.
//
// Behaviour is unchanged from the manual path: skipConflicts and skipEmptyRun
// both default to false, which is what the route always did.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveApplicablePeople, type ApplicablePerson } from './applicability';
import { TRANSPORT_CATEGORY_NAME, type FeeAudience } from './types';
import { currentYearOf } from './year-of-study';
import {
  resolvePersonTerms,
  UNRESOLVED_LABEL,
  type StopScheduleTerm,
  type UnresolvedReason,
} from './resolve-terms';
import { buildStaffFeeBillRow } from './staff-bill';
import { filterOutInCharges } from './incharge-exemption';
import { intersectPersonIds } from './person-scope';
import type { TermOverride } from './overrides';
import { buildStaffBillNotification } from './staff-bill-notification';
import { notifyProfile } from '@/lib/notifications/notify';

export interface GenerateOptions {
  feeStructureId: string;
  mode: 'dry_run' | 'generate';
  /** Explicit subset; intersected AFTER applicability so it can only narrow. */
  personIds?: string[] | null;
  /** null marks an automated run (tms_fee_generation_run.triggered_by). */
  actorId: string | null;
  /** Auto-only: skip people already billed by ANOTHER structure this year. */
  skipConflicts?: boolean;
  /** Auto-only: write no generation-run row when nothing would be billed. */
  skipEmptyRun?: boolean;
}

export interface GenerateOutcome {
  mode: 'generate';
  runId: string | null;
  applicable: number;
  learnerBilled: number;
  staffDeferred: number;
  skipped: number;
  unresolved: number;
  overridden: number;
  errors: number;
  notified: number;
  feeMode: string;
  structureName: string;
}

export type GeneratePreview = Record<string, unknown>;

export type GenerateResult =
  | { ok: false; status: number; error: string }
  | { ok: true; data: GeneratePreview | GenerateOutcome };

interface Term { term_no: number; term_label: string | null; amount: number; due_date: string }
interface Band {
  id: string;
  band_order: number;
  label: string | null;
  study_years: number[];
  total_amount: number;
  split_count: number;
  terms: Term[];
}
interface Resolved { person: ApplicablePerson; terms: Term[]; band: Band | null }

export async function generateBills(
  svc: SupabaseClient,
  opts: GenerateOptions
): Promise<GenerateResult> {
  // ... body moved from the route (see substitution rules below) ...
}
```

- [ ] **Step 2: Move the body using these substitutions — and no others**

Copy the body of `generate()` from `app/api/admin/fees/[id]/generate/route.ts`
(currently lines 55–755, i.e. everything after the permission check and before
the final `catch`) into `generateBills`, applying exactly these replacements:

| In the route | In the engine |
|---|---|
| `const id = feeIdFromPath(request); if (!id) return …400` | `const id = opts.feeStructureId;` (the route validates it) |
| `const body = await request.json()…` + `mode` derivation | `const mode = opts.mode;` |
| the `Array.isArray(body?.personIds) && length === 0` guard | **delete** — stays in the route |
| `const requestedPersonIds = …body.personIds…` | `const requestedPersonIds = opts.personIds ?? null;` |
| `const supabase = createServiceRoleClient();` | **delete** — use the `svc` parameter |
| every other `supabase.` | `svc.` |
| `auth.userId` (3 sites: run insert, bill `created_by`, `notifyProfile` actorId) | `opts.actorId` |
| `return NextResponse.json({ error: X }, { status: N });` | `return { ok: false, status: N, error: X };` |
| `return NextResponse.json({ success: true, data: preview });` | `return { ok: true, data: preview };` |
| the final `return NextResponse.json({ success:true, data:{…}, message:… })` | `return { ok: true, data: { mode: 'generate', runId, applicable: resolved.length, learnerBilled, staffDeferred, skipped, unresolved, overridden, errors, notified, feeMode: fs.fee_mode, structureName: fs.name } };` |
| the `await logActivity(auth, request, {…})` block | **delete** — stays in the route |
| the outer `try { … } catch (e) { … 500 }` | keep, returning `{ ok: false, status: 500, error: 'Internal server error' }` |

Leave every comment in place. They document real bugs (gateway chunking,
fail-loud override loading, the in-charge email divergence) and must not be lost.

- [ ] **Step 3: Run the characterization tests**

Run: `npm test -- lib/fees/generate.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 4: Rewrite the route as a thin wrapper**

Replace `app/api/admin/fees/[id]/generate/route.ts` entirely with:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { generateBills, type GenerateOutcome } from '@/lib/fees/generate';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route context, so pull the [id] from the path:
// /api/admin/fees/<id>/generate
function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

async function generate(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_GENERATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const mode: 'dry_run' | 'generate' = body?.mode === 'generate' ? 'generate' : 'dry_run';

    // An EXPLICIT empty array is rejected outright: intersectPersonIds reads "no
    // usable ids" as "no scoping applied" (by design, for the absent-field case),
    // so a selection UI that serialises "nothing selected" as [] would otherwise
    // silently bill the ENTIRE cohort instead of nobody. An absent personIds
    // field keeps meaning "bill everyone".
    if (Array.isArray(body?.personIds) && body.personIds.length === 0) {
      return NextResponse.json(
        { error: 'personIds was provided but empty. Omit personIds to bill everyone, or include at least one id.' },
        { status: 400 }
      );
    }
    const personIds: string[] | null = Array.isArray(body?.personIds)
      ? (body.personIds as unknown[]).map((v) => String(v))
      : null;

    const result = await generateBills(createServiceRoleClient(), {
      feeStructureId: id,
      mode,
      personIds,
      actorId: auth.userId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (mode === 'dry_run') {
      return NextResponse.json({ success: true, data: result.data });
    }

    const out = result.data as GenerateOutcome;
    await logActivity(auth, request, {
      module: 'fees',
      action: 'generate',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: out.structureName,
      description: `Generated transport bills for ${out.structureName}: ${out.learnerBilled} learner bill(s), ${out.staffDeferred} staff deferred, ${out.skipped} skipped, ${out.unresolved} unresolved`,
      metadata: {
        runId: out.runId,
        learnerBilled: out.learnerBilled,
        staffDeferred: out.staffDeferred,
        skipped: out.skipped,
        unresolved: out.unresolved,
        overridden: out.overridden,
        errors: out.errors,
        feeMode: out.feeMode,
        notified: out.notified,
      },
    });

    return NextResponse.json({
      success: true,
      data: out,
      message: `Generated ${out.learnerBilled} learner bill(s); ${out.staffDeferred} staff bill(s); ${out.notified} staff notified; ${out.skipped} already billed (skipped)${out.unresolved ? `; ${out.unresolved} unresolved` : ''}.`,
    });
  } catch (e) {
    console.error('Fee generation error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => generate(request, auth));
```

- [ ] **Step 5: Verify the whole suite still passes and the app builds**

Run: `npm test`
Expected: PASS — including `resolve-terms`, `overrides`, `staff-bill`, `bills`, `bill-analytics`, `person-scope`, `incharge-exemption`, `stop-rate`, all untouched.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/fees/generate|api/admin/fees" || echo "no new errors in changed files"`
Expected: `no new errors in changed files`. (A repo-wide `tsc` is red for ~540 unrelated pre-existing reasons — only the changed paths matter.)

- [ ] **Step 6: Commit**

```bash
git add lib/fees/generate.ts app/api/admin/fees/[id]/generate/route.ts
git commit -m "refactor(fees): extract bill generation engine into lib/fees/generate.ts

Pure mechanical move, pinned by lib/fees/generate.test.ts. The route keeps
permission checking, activity logging and HTTP shaping; everything else moves
so the scheduled sweep can call the same engine."
```

---

### Task 3: Close the orphaned-bill race

The engine inserts the money row then the ledger row. If the ledger insert fails, the money row is orphaned — MyJKKN shows a bill TMS does not know about, breaking `Billed == Collected + Pending`. Zero orphans exist today only because humans click one at a time.

**Files:**
- Modify: `lib/fees/generate.ts` (the learner branch of the generate loop)
- Test: `lib/fees/generate.test.ts`

**Interfaces:**
- Consumes: `generateBills` (Task 2), `makeFakeSupabase` with `insertErrors` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `lib/fees/generate.test.ts`:

```ts
describe('generateBills — orphan compensation', () => {
  it('deletes the money bill when the ledger insert fails', async () => {
    const svc = makeFakeSupabase(
      {
        tms_fee_structure: [{
          id: 'fs1', name: 'T', status: 'active', audience: 'student', fee_mode: 'flat',
          transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
        }],
        tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
        tms_fee_structure_term: [
          { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
        ],
        learners_profiles: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
        admission_years: [],
        tms_fee_override: [],
        tms_fee_bill: [],
        billing_categories: [{ id: 'cat1' }],
        academic_years: [],
      },
      { insertErrors: { tms_fee_bill: { message: 'duplicate key', code: '23505' } } }
    );

    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const out = res.data as { errors: number; learnerBilled: number };
    expect(out.learnerBilled).toBe(0);
    expect(out.errors).toBe(1);

    // The compensating delete must have been issued against the money table.
    const deletes = svc.calls.filter(
      (c) => c.table === 'billing_student_bills' && c.ops.some(([op]) => op === 'delete')
    );
    expect(deletes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- lib/fees/generate.test.ts -t "orphan"`
Expected: FAIL — `expected [] to have a length of 1`. No delete is issued today.

- [ ] **Step 3: Implement the compensating delete**

In `lib/fees/generate.ts`, inside the learner branch, replace:

```ts
          if (ledErr) { errors++; continue; }
          learnerBilled++;
```

with:

```ts
          if (ledErr) {
            // The money row is already committed. Leaving it would orphan a real
            // bill: MyJKKN would show a charge that tms_fee_bill knows nothing
            // about, breaking the Billed == Collected + Pending reconciliation.
            // Compensate by removing it. If the delete ALSO fails there is
            // nothing further we can do from here, so log loudly — this is the
            // only trace an operator will get.
            const { error: cleanupErr } = await svc
              .from('billing_student_bills')
              .delete()
              .eq('id', bill.id);
            if (cleanupErr) {
              console.error(
                '[fees] ORPHANED BILL: ledger insert failed and cleanup failed',
                { billId: bill.id, personId: p.person_id, termNo: t.term_no, ledErr, cleanupErr }
              );
            }
            errors++;
            continue;
          }
          learnerBilled++;
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/fees/generate.test.ts`
Expected: PASS, all tests including the new orphan test.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/generate.ts lib/fees/generate.test.ts
git commit -m "fix(fees): delete the money bill when its ledger row fails to insert

Prevents an orphaned billing_student_bills row breaking the
Billed == Collected + Pending reconciliation between TMS and MyJKKN."
```

---

# Phase 2 — Automation (inert until the toggle is on)

---

### Task 4: Count bills that are born overdue

Term 1 fell due 2026-07-31; every Term-1 bill created since is overdue on arrival and locks the learner out of the student portal. Due dates stay verbatim — but the count must be visible.

**Files:**
- Create: `lib/fees/born-overdue.ts`
- Create: `lib/fees/born-overdue.test.ts`
- Modify: `lib/fees/generate.ts`
- Modify: `lib/fees/generate.test.ts`

**Interfaces:**
- Consumes: `istToday` from `@/lib/booking/window`.
- Produces: `countBornOverdue(terms: Array<{ due_date: string }>, today: string): number`. `GenerateOutcome` and the dry-run preview both gain `bornOverdue: number`.

- [ ] **Step 1: Write the failing test**

Create `lib/fees/born-overdue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countBornOverdue } from './born-overdue';

describe('countBornOverdue', () => {
  const today = '2026-08-11';

  it('counts a term whose due date has passed', () => {
    expect(countBornOverdue([{ due_date: '2026-07-31' }], today)).toBe(1);
  });

  it('does not count a term due in the future', () => {
    expect(countBornOverdue([{ due_date: '2026-08-31' }], today)).toBe(0);
  });

  it('does not count a term due today — the learner still has the day', () => {
    expect(countBornOverdue([{ due_date: today }], today)).toBe(0);
  });

  it('counts each overdue term separately', () => {
    expect(countBornOverdue(
      [{ due_date: '2026-07-31' }, { due_date: '2026-06-30' }, { due_date: '2026-09-30' }],
      today
    )).toBe(2);
  });

  it('is zero for an empty term list', () => {
    expect(countBornOverdue([], today)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- lib/fees/born-overdue.test.ts`
Expected: FAIL — `Failed to resolve import "./born-overdue"`.

- [ ] **Step 3: Implement**

Create `lib/fees/born-overdue.ts`:

```ts
// lib/fees/born-overdue.ts
// A bill is "born overdue" when it is created with a due date that has already
// passed. This happens whenever a learner is onboarded after a term fell due —
// and because tms_student_transport_access is fail-closed on a paid Term 1, such
// a learner is locked out of the student portal the moment they are billed.
//
// The remedy is NOT to move the due date (TMS and MyJKKN must agree on it), but
// to make the count visible so an operator can see it happening.

/**
 * How many of these terms are already past due on `today`?
 * Both dates are ISO `YYYY-MM-DD`, which compares correctly as a string.
 * A term due TODAY is not overdue — the learner still has the day to pay.
 */
export function countBornOverdue(
  terms: Array<{ due_date: string }>,
  today: string
): number {
  return terms.reduce((n, t) => (t.due_date < today ? n + 1 : n), 0);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- lib/fees/born-overdue.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into the engine**

In `lib/fees/generate.ts`:

Add to the imports:

```ts
import { countBornOverdue } from './born-overdue';
import { istToday } from '@/lib/booking/window';
```

Add `bornOverdue: number;` to the `GenerateOutcome` interface.

Immediately before the `const preview = {` literal, add:

```ts
    // Bills that would be (or were) created already past due. Due dates are
    // copied verbatim from the structure — this is a report, not a correction.
    const today = istToday();
    const projectedBornOverdue = resolved.reduce(
      (n, r) =>
        n +
        countBornOverdue(
          r.terms.filter((t) => !billedKey.has(`${r.person.person_id}:${t.term_no}`)),
          today
        ),
      0
    );
```

Add `bornOverdue: projectedBornOverdue,` to the `preview` object literal.

In the generate loop, declare `let bornOverdue = 0;` alongside `let learnerBilled = 0;`, and increment it immediately after each successful insert — in **both** the learner branch (after `learnerBilled++`) and the staff branch (after `staffDeferred++`):

```ts
          if (t.due_date < today) bornOverdue++;
```

Add `bornOverdue,` to the returned `GenerateOutcome` object.

Finally, in the run-notes block, add before the `await svc.from('tms_fee_generation_run').update(...)`:

```ts
      if (bornOverdue > 0) {
        noteParts.push(`${bornOverdue} bill(s) created already overdue`);
      }
```

- [ ] **Step 6: Update the characterization test for the new field**

In `lib/fees/generate.test.ts`, add to the first test (`previews every applicable learner against every term`):

```ts
    // Term 1 (2026-07-31) is past; Term 2 (2026-08-31) is not. 2 learners.
    expect(p.bornOverdue).toBe(2);
```

Note: this assertion is time-dependent and holds while today is between
2026-08-01 and 2026-08-31. If it ever fails on a later date, pin the clock with
`vi.setSystemTime(new Date('2026-08-11T06:00:00Z'))` in a `beforeEach` rather
than weakening the assertion.

- [ ] **Step 7: Run the tests**

Run: `npm test -- lib/fees/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/fees/born-overdue.ts lib/fees/born-overdue.test.ts lib/fees/generate.ts lib/fees/generate.test.ts
git commit -m "feat(fees): count and report bills created already overdue"
```

---

### Task 5: Auto-only policies — skipConflicts and skipEmptyRun

**Files:**
- Modify: `lib/fees/generate.ts`
- Modify: `lib/fees/generate.test.ts`

**Interfaces:**
- Consumes: `generateBills` (Task 2).
- Produces: `GenerateOutcome` gains `conflictsSkipped: number`. Both options still default to `false`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/fees/generate.test.ts`:

```ts
describe('generateBills — auto-only policies', () => {
  function conflictFixture() {
    return makeFakeSupabase({
      tms_fee_structure: [{
        id: 'fs1', name: 'T', status: 'active', audience: 'student', fee_mode: 'flat',
        transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
      }],
      tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
      tms_fee_structure_term: [
        { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
      ],
      learners_profiles: [
        { id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null },
        { id: 'L2', institution_id: 'i1', admission_year_id: null, academic_year_id: null },
      ],
      admission_years: [],
      tms_fee_override: [],
      // Both the ledger read and the conflict read hit this table. Returning a
      // row for L1 with a DIFFERENT structure id makes L1 a cross-structure
      // conflict while leaving them unbilled by fs1.
      tms_fee_bill: [{ person_id: 'L1', term_no: 99 }],
      billing_categories: [{ id: 'cat1' }],
      academic_years: [],
    });
  }

  it('reports conflicts but still bills them when skipConflicts is off (current manual behaviour)', async () => {
    const res = await generateBills(conflictFixture() as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: 'admin-1',
    });
    if (!res.ok) throw new Error('expected ok');
    const p = res.data as Record<string, unknown>;
    expect(p.conflictCount).toBe(1);
    expect(p.applicable).toBe(2);       // L1 is NOT removed
  });

  it('removes conflicted people from the cohort when skipConflicts is on', async () => {
    const res = await generateBills(conflictFixture() as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: null, skipConflicts: true,
    });
    if (!res.ok) throw new Error('expected ok');
    const p = res.data as Record<string, unknown>;
    expect(p.conflictsSkipped).toBe(1);
    expect(p.applicable).toBe(1);       // only L2 remains
  });

  it('writes no generation-run row when there is nothing to bill and skipEmptyRun is on', async () => {
    const svc = makeFakeSupabase({
      tms_fee_structure: [{
        id: 'fs1', name: 'T', status: 'active', audience: 'student', fee_mode: 'flat',
        transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
      }],
      tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
      tms_fee_structure_term: [
        { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
      ],
      learners_profiles: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
      admission_years: [],
      tms_fee_override: [],
      tms_fee_bill: [{ person_id: 'L1', term_no: 1 }],   // already billed
      billing_categories: [{ id: 'cat1' }],
      academic_years: [],
    });

    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: null, skipEmptyRun: true,
    });
    if (!res.ok) throw new Error('expected ok');
    const out = res.data as { runId: string | null; learnerBilled: number };
    expect(out.learnerBilled).toBe(0);
    expect(out.runId).toBeNull();

    const runInserts = svc.calls.filter(
      (c) => c.table === 'tms_fee_generation_run' && c.ops.some(([op]) => op === 'insert')
    );
    expect(runInserts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- lib/fees/generate.test.ts -t "auto-only"`
Expected: FAIL — `conflictsSkipped` is undefined and a run row is inserted.

- [ ] **Step 3: Implement skipConflicts**

In `lib/fees/generate.ts`, the conflict block currently ends with
`conflictCount = conflicted.size;`. Replace that line with:

```ts
      conflictCount = conflicted.size;

      // Auto-only: a person already billed by ANOTHER structure this year is
      // removed from the cohort rather than billed a second time. The manual
      // path deliberately keeps them — an operator can see the conflict count
      // in the dry run and decide. An unattended run has no such judgement, and
      // double-charging is the worse failure.
      if (opts.skipConflicts && conflicted.size) {
        conflictsSkipped = conflicted.size;
        for (let i = resolved.length - 1; i >= 0; i--) {
          if (conflicted.has(resolved[i].person.person_id)) resolved.splice(i, 1);
        }
      }
```

Declare `let conflictsSkipped = 0;` next to `let conflictCount = 0;`. Add
`conflictsSkipped,` to both the `preview` literal and the `GenerateOutcome`
return, and `conflictsSkipped: number;` to the `GenerateOutcome` interface.

Because `resolved` is now mutated, move the `const resolvedIds = resolved.map(...)`
line so it stays **before** the conflict query (it already is), and recompute the
per-term counters **after** the splice — the `toGenerate` / `alreadyBilled` loop
and `learnerCount` / `staffCount` already run after this block, so no further
change is needed. Verify by reading the file top-to-bottom before moving on.

- [ ] **Step 4: Implement skipEmptyRun**

Immediately before the `const { data: run } = await svc.from('tms_fee_generation_run').insert(...)`
call, insert:

```ts
    // Auto-only: at a 15-minute cadence across 3 structures an unconditional run
    // row would add ~288 empty rows per day, burying the runs that actually did
    // something. Nothing to bill means nothing to record.
    if (opts.skipEmptyRun && toGenerate === 0) {
      return {
        ok: true,
        data: {
          mode: 'generate',
          runId: null,
          applicable: resolved.length,
          learnerBilled: 0,
          staffDeferred: 0,
          skipped: alreadyBilled,
          unresolved,
          overridden,
          errors: 0,
          notified: 0,
          bornOverdue: 0,
          conflictsSkipped,
          feeMode: fs.fee_mode,
          structureName: fs.name,
        } satisfies GenerateOutcome,
      };
    }
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- lib/fees/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/fees/generate.ts lib/fees/generate.test.ts
git commit -m "feat(fees): add skipConflicts and skipEmptyRun options for unattended runs"
```

---

### Task 6: System actor for the activity log

Automated runs need a visible home. `tms_fee_generation_run` is write-only (no UI reads it), but the Activity Log page already renders `module: 'fees', action: 'generate'`.

**Files:**
- Modify: `lib/activity/log.ts`
- Create: `lib/activity/log.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `logSystemActivity(entry: ActivityEntry): Promise<void>` — used by Task 9.

- [ ] **Step 1: Refactor `insertLog` to make the request optional**

In `lib/activity/log.ts`, change `clientInfo` and `insertLog`:

```ts
function clientInfo(request: NextRequest | null) {
  if (!request) return { ip_address: null, user_agent: null };
  const fwd = request.headers.get('x-forwarded-for');
  return {
    ip_address: fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip'),
    user_agent: request.headers.get('user-agent'),
  };
}

async function insertLog(
  actor: { id: string | null; email: string | null; role: string | null },
  request: NextRequest | null,
  entry: ActivityEntry
): Promise<void> {
```

The body is unchanged — `clientInfo(request)` now handles `null`.

- [ ] **Step 2: Add the system-actor variant**

Append to `lib/activity/log.ts`:

```ts
/**
 * For SCHEDULED work with no human actor and no inbound request — e.g. the
 * automatic bill generation sweep. tms_activity_log.actor_id is nullable, and a
 * null actor is what distinguishes an automated entry from a hand-clicked one.
 * There is no request, so ip_address / user_agent are null.
 */
export async function logSystemActivity(entry: ActivityEntry): Promise<void> {
  await insertLog({ id: null, email: null, role: 'system' }, null, entry);
}
```

- [ ] **Step 3: Write the test**

Create `lib/activity/log.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: () => ({ insert }) }),
}));

import { logSystemActivity } from './log';

describe('logSystemActivity', () => {
  beforeEach(() => insert.mockClear());

  it('writes a null actor with a system role and no client info', async () => {
    await logSystemActivity({
      module: 'fees',
      action: 'generate',
      entityType: 'tms_fee_structure',
      entityId: 'fs1',
      entityLabel: 'Transport Fees 2026-2027',
      description: 'Automatic run billed 3 learner(s)',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.actor_id).toBeNull();
    expect(row.actor_role).toBe('system');
    expect(row.ip_address).toBeNull();
    expect(row.user_agent).toBeNull();
    expect(row.module).toBe('fees');
    expect(row.action).toBe('generate');
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/activity/log.test.ts`
Expected: PASS.

Then confirm nothing that already logs has broken:

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/activity/log.ts lib/activity/log.test.ts
git commit -m "feat(activity): add logSystemActivity for scheduled work with no human actor"
```

---

### Task 7: `autoGenerateBills` setting

The global kill switch. Four files must agree on the key, or the toggle saves and silently does nothing.

**Files:**
- Modify: `lib/settings/scheduling.ts`
- Modify: `lib/settings/scheduling.test.ts`
- Modify: `lib/scheduling-config.ts`
- Modify: `app/api/admin/settings/route.ts`
- Modify: `app/(admin)/settings/page.tsx`

**Interfaces:**
- Produces: `SchedulingConfig.autoGenerateBills: boolean` (default `false`), readable via the existing `loadSchedulingConfig(svc)`. Task 9 consumes it.

- [ ] **Step 1: Write the failing test**

Append to `lib/settings/scheduling.test.ts`:

```ts
describe('autoGenerateBills', () => {
  it('defaults to false when the key is absent — automation is opt-in', () => {
    // This is the LIVE blob shape as of 2026-08-11; the key is not in it.
    const cfg = parseSchedulingConfig({
      bookingDaysAhead: 1,
      autoNotifyPassengers: true,
      bookingWindowEndHour: 19,
      enableBookingTimeWindow: true,
    });
    expect(cfg.autoGenerateBills).toBe(false);
  });

  it('reads a stored true', () => {
    expect(parseSchedulingConfig({ autoGenerateBills: true }).autoGenerateBills).toBe(true);
  });

  it('ignores a non-boolean and falls back to false', () => {
    expect(parseSchedulingConfig({ autoGenerateBills: 'yes' }).autoGenerateBills).toBe(false);
  });

  it('defaults to false for a malformed blob', () => {
    expect(parseSchedulingConfig(null).autoGenerateBills).toBe(false);
  });
});
```

Ensure `parseSchedulingConfig` is imported at the top of that file (it already is).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/settings/scheduling.test.ts`
Expected: FAIL — `expected undefined to be false`.

- [ ] **Step 3: Implement in the server config**

In `lib/settings/scheduling.ts`:

Add to `SchedulingConfig`:

```ts
  /** Master switch for the automatic bill generation sweep. Opt-in. */
  autoGenerateBills: boolean;
```

Add to `DEFAULT_SCHEDULING_CONFIG`:

```ts
  autoGenerateBills: false,
```

Add to the object returned by `parseSchedulingConfig`:

```ts
    autoGenerateBills: boolOr(b.autoGenerateBills, DEFAULT_SCHEDULING_CONFIG.autoGenerateBills),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/settings/scheduling.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the key through the client config and API**

In `lib/scheduling-config.ts`, add `autoGenerateBills: boolean;` to
`SchedulingSettings` and `autoGenerateBills: false,` to
`defaultSchedulingSettings`.

In `app/api/admin/settings/route.ts`, add `autoGenerateBills: boolean;` to the
local settings interface (near `bookingDaysAhead: number;`) and
`autoGenerateBills: cfg.autoGenerateBills,` to the object returned by
`toBlobShape`.

- [ ] **Step 6: Add the Settings toggle**

In `app/(admin)/settings/page.tsx`, inside the scheduling tab's
`<div className="grid grid-cols-1 md:grid-cols-2 gap-6">`, add a new cell
following the existing checkbox pattern exactly:

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Automatic Bill Generation
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="autoGenerateBills"
                    checked={schedulingSettings.autoGenerateBills}
                    onChange={(e) => setSchedulingSettings({ ...schedulingSettings, autoGenerateBills: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="autoGenerateBills" className="ml-2 text-sm text-gray-600">
                    Bill newly-onboarded learners automatically
                  </label>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Runs every 15 minutes for fee structures marked &ldquo;Auto-generate&rdquo;.
                  Bills use each structure&rsquo;s configured due dates, so a learner
                  onboarded after a term fell due is billed as overdue.
                </p>
              </div>
```

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit 2>&1 | grep -E "settings|scheduling-config" || echo "no new errors in changed files"`
Expected: `no new errors in changed files`.

- [ ] **Step 8: Commit**

```bash
git add lib/settings/scheduling.ts lib/settings/scheduling.test.ts lib/scheduling-config.ts app/api/admin/settings/route.ts "app/(admin)/settings/page.tsx"
git commit -m "feat(settings): add the autoGenerateBills master switch (default off)"
```

---

### Task 8: Make `auto_generate` writable from the fees form

The column exists in the live database, but `lib/fees/fields.ts` has no boolean whitelist, so nothing in the app can set it.

**Files:**
- Modify: `lib/fees/fields.ts`
- Create: `lib/fees/fields.test.ts`
- Modify: `app/(admin)/fees/fee-structure-form.tsx` (interface line 32, state line 138, payload line 262, JSX line 396)
- Modify: `app/(admin)/fees/[id]/edit/page.tsx` (initial object, line 63)

**Interfaces:**
- Produces: `BOOL_FIELDS = ['auto_generate']`, included in `EDITABLE` and handled by `buildFeeStructurePayload`.

- [ ] **Step 1: Write the failing test**

Create `lib/fees/fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFeeStructurePayload, EDITABLE } from './fields';

describe('buildFeeStructurePayload — auto_generate', () => {
  it('lists auto_generate as writable', () => {
    expect(EDITABLE).toContain('auto_generate');
  });

  it('passes a true through', () => {
    expect(buildFeeStructurePayload({ auto_generate: true }).auto_generate).toBe(true);
  });

  it('passes a false through rather than dropping it', () => {
    // Dropping false would make the toggle impossible to turn OFF.
    const out = buildFeeStructurePayload({ auto_generate: false });
    expect('auto_generate' in out).toBe(true);
    expect(out.auto_generate).toBe(false);
  });

  it('omits the key entirely when absent, so PUT stays partial', () => {
    expect('auto_generate' in buildFeeStructurePayload({ name: 'x' })).toBe(false);
  });

  it('coerces a non-boolean to false rather than writing garbage', () => {
    expect(buildFeeStructurePayload({ auto_generate: 'yes' }).auto_generate).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/fees/fields.test.ts`
Expected: FAIL — `EDITABLE` does not contain `auto_generate`.

- [ ] **Step 3: Implement**

In `lib/fees/fields.ts`, after `ARRAY_FIELDS`:

```ts
// Boolean flags. Written explicitly (not via truthiness) so that `false` is
// persisted rather than dropped — otherwise the toggle could never be cleared.
export const BOOL_FIELDS = ['auto_generate'] as const;
```

Add `...BOOL_FIELDS,` to the `EDITABLE` spread, and inside
`buildFeeStructurePayload`, before `return out;`:

```ts
  for (const k of BOOL_FIELDS) if (has(k)) out[k] = body[k] === true;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/fees/fields.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the flag to the form's types, state and payload**

Four edits in `app/(admin)/fees/fee-structure-form.tsx`, each anchored on an
existing line.

**5a.** In the `FeeFormInitial` interface, after `notes: string;` (line 32):

```ts
  auto_generate?: boolean;
```

**5b.** In the `useState` initialiser, after `notes: initial?.notes ?? '',` (line 138):

```ts
    auto_generate: initial?.auto_generate ?? false,
```

**5c.** In the `base` payload object, after `notes: form.notes.trim() || null,` (line 262):

```ts
        auto_generate: form.auto_generate,
```

**5d.** In `app/(admin)/fees/[id]/edit/page.tsx`, inside the `initial={{ … }}`
object, after `notes: data.notes ?? '',` (line 63):

```tsx
          auto_generate: data.auto_generate ?? false,
```

Without 5d the checkbox silently resets to unticked every time an existing
structure is opened for editing, and saving would turn automation back off.

- [ ] **Step 6: Add the checkbox to the form UI**

In `app/(admin)/fees/fee-structure-form.tsx`, insert a new grid cell
immediately after the Status `</div>` (line 396) and before the `</div>` that
closes the grid (line 397):

```tsx
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Automation</label>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="auto_generate"
                checked={form.auto_generate}
                onChange={(e) => set('auto_generate', e.target.checked)}
                disabled={saving}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="auto_generate" className="ml-2 text-sm text-gray-600">
                Auto-generate bills for this structure
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              When the global Scheduling setting is on, people matching this structure are
              billed automatically every 15 minutes. The manual Generate button ignores this flag.
            </p>
          </div>
```

Note `set('auto_generate', …)` uses the form's existing `set` helper, the same
one the Status menu uses on line 390 — do not call `setForm` directly here.

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit 2>&1 | grep -E "fee-structure-form|fees/\[id\]/edit" || echo "no new errors in changed files"`
Expected: `no new errors in changed files`.

- [ ] **Step 8: Commit**

```bash
git add lib/fees/fields.ts lib/fees/fields.test.ts "app/(admin)/fees/fee-structure-form.tsx" "app/(admin)/fees/[id]/edit/page.tsx"
git commit -m "feat(fees): make the per-structure auto_generate flag writable"
```

---

### Task 9: The sweep

**Files:**
- Create: `lib/fees/auto-generate.ts`
- Create: `lib/fees/auto-generate.test.ts`

**Interfaces:**
- Consumes: `generateBills` + `GenerateOutcome` (Tasks 2–5), `loadSchedulingConfig` (Task 7), `logSystemActivity` (Task 6).
- Produces: `autoGenerateBills(svc, opts?): Promise<AutoRunSummary>` — used by Task 10.

- [ ] **Step 1: Write the failing test**

Create `lib/fees/auto-generate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateBills = vi.fn();
vi.mock('./generate', () => ({ generateBills: (...a: unknown[]) => generateBills(...a) }));

const loadSchedulingConfig = vi.fn();
vi.mock('@/lib/settings/scheduling', () => ({
  loadSchedulingConfig: (...a: unknown[]) => loadSchedulingConfig(...a),
}));

const logSystemActivity = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/activity/log', () => ({
  logSystemActivity: (...a: unknown[]) => logSystemActivity(...a),
}));

import { makeFakeSupabase } from './__testing__/fake-supabase';
import { autoGenerateBills } from './auto-generate';

function outcome(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      mode: 'generate', runId: 'run1', applicable: 5, learnerBilled: 2, staffDeferred: 0,
      skipped: 8, unresolved: 0, overridden: 0, errors: 0, notified: 0,
      bornOverdue: 1, conflictsSkipped: 0, feeMode: 'flat', structureName: 'S',
      ...over,
    },
  };
}

const STRUCTURES = [
  { id: 'fs1', name: 'Transport Fees 2026-2027' },
  { id: 'fs2', name: 'Transport Fees 2026-2027(Arts Self)' },
];

function fixture(structures = STRUCTURES) {
  return makeFakeSupabase({
    tms_transport_year: [{ id: 'ty1' }],
    tms_fee_structure: structures,
  });
}

beforeEach(() => {
  generateBills.mockReset().mockResolvedValue(outcome());
  loadSchedulingConfig.mockReset().mockResolvedValue({ autoGenerateBills: true });
  logSystemActivity.mockClear();
});

describe('autoGenerateBills', () => {
  it('does nothing when the master switch is off', async () => {
    loadSchedulingConfig.mockResolvedValue({ autoGenerateBills: false });
    const res = await autoGenerateBills(fixture() as never);
    expect(res.skipped).toBe('disabled');
    expect(generateBills).not.toHaveBeenCalled();
    expect(logSystemActivity).not.toHaveBeenCalled();
  });

  it('does nothing when no transport year is current', async () => {
    const svc = makeFakeSupabase({ tms_transport_year: [], tms_fee_structure: STRUCTURES });
    const res = await autoGenerateBills(svc as never);
    expect(res.skipped).toBe('no_current_transport_year');
    expect(generateBills).not.toHaveBeenCalled();
  });

  it('filters to active + auto_generate + the current year', async () => {
    const svc = fixture();
    await autoGenerateBills(svc as never);
    const q = svc.calls.find((c) => c.table === 'tms_fee_structure');
    const eqs = q!.ops.filter(([op]) => op === 'eq').map(([, args]) => args);
    expect(eqs).toContainEqual(['status', 'active']);
    expect(eqs).toContainEqual(['auto_generate', true]);
    expect(eqs).toContainEqual(['transport_year_id', 'ty1']);
  });

  it('runs every qualifying structure with the auto-only policies', async () => {
    await autoGenerateBills(fixture() as never);
    expect(generateBills).toHaveBeenCalledTimes(2);
    const opts = generateBills.mock.calls[0][1];
    expect(opts).toMatchObject({
      feeStructureId: 'fs1',
      mode: 'generate',
      actorId: null,
      skipConflicts: true,
      skipEmptyRun: true,
    });
  });

  it('aggregates billed and born-overdue totals across structures', async () => {
    generateBills
      .mockResolvedValueOnce(outcome({ learnerBilled: 2, bornOverdue: 1 }))
      .mockResolvedValueOnce(outcome({ learnerBilled: 3, bornOverdue: 3 }));
    const res = await autoGenerateBills(fixture() as never);
    expect(res.totalBilled).toBe(5);
    expect(res.totalBornOverdue).toBe(4);
    expect(res.structures).toHaveLength(2);
  });

  it('keeps going when one structure fails, and records its error', async () => {
    generateBills
      .mockResolvedValueOnce({ ok: false, status: 500, error: 'stop rates missing' })
      .mockResolvedValueOnce(outcome({ learnerBilled: 3 }));
    const res = await autoGenerateBills(fixture() as never);
    expect(res.structures[0].error).toBe('stop rates missing');
    expect(res.structures[0].billed).toBe(0);
    expect(res.totalBilled).toBe(3);
  });

  it('survives a thrown error from one structure', async () => {
    generateBills
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(outcome({ learnerBilled: 1 }));
    const res = await autoGenerateBills(fixture() as never);
    expect(res.structures[0].error).toContain('boom');
    expect(res.totalBilled).toBe(1);
  });

  it('logs activity only when something was actually billed', async () => {
    generateBills.mockResolvedValue(outcome({ learnerBilled: 0, runId: null }));
    await autoGenerateBills(fixture() as never);
    expect(logSystemActivity).not.toHaveBeenCalled();
  });

  it('logs one activity entry per structure that billed', async () => {
    generateBills
      .mockResolvedValueOnce(outcome({ learnerBilled: 2 }))
      .mockResolvedValueOnce(outcome({ learnerBilled: 0, runId: null }));
    await autoGenerateBills(fixture() as never);
    expect(logSystemActivity).toHaveBeenCalledTimes(1);
    expect(logSystemActivity.mock.calls[0][0]).toMatchObject({
      module: 'fees',
      action: 'generate',
      entityId: 'fs1',
    });
  });

  it('writes nothing in dryRun mode', async () => {
    await autoGenerateBills(fixture() as never, { dryRun: true });
    expect(generateBills.mock.calls[0][1].mode).toBe('dry_run');
    expect(logSystemActivity).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/fees/auto-generate.test.ts`
Expected: FAIL — `Failed to resolve import "./auto-generate"`.

- [ ] **Step 3: Implement**

Create `lib/fees/auto-generate.ts`:

```ts
// lib/fees/auto-generate.ts
// The scheduled sweep that removes the manual "click Generate" treadmill.
//
// It is CONVERGENT, not event-driven: learners_profiles.bus_required is flipped
// by MyJKKN, not by this application, so there is no event to hook. Instead this
// re-runs the idempotent engine and bills whoever is applicable and not yet
// billed. A missed run costs latency, never correctness — tms_fee_bill_idem_unique
// makes double-billing impossible at the database level.

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateBills, type GenerateOutcome } from './generate';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { logSystemActivity } from '@/lib/activity/log';

export interface AutoStructureResult {
  id: string;
  name: string;
  billed: number;
  skipped: number;
  unresolved: number;
  conflictsSkipped: number;
  bornOverdue: number;
  errors: number;
  error?: string;
}

export interface AutoRunSummary {
  skipped?: 'disabled' | 'no_current_transport_year';
  dryRun: boolean;
  structures: AutoStructureResult[];
  totalBilled: number;
  totalBornOverdue: number;
}

const EMPTY = (dryRun: boolean): AutoRunSummary => ({
  dryRun, structures: [], totalBilled: 0, totalBornOverdue: 0,
});

export async function autoGenerateBills(
  svc: SupabaseClient,
  opts: { dryRun?: boolean } = {}
): Promise<AutoRunSummary> {
  const dryRun = opts.dryRun === true;

  // Rail 2: the master switch. Absent from the stored blob means false, so
  // automation stays off until someone deliberately turns it on.
  const cfg = await loadSchedulingConfig(svc);
  if (!cfg.autoGenerateBills) {
    return { ...EMPTY(dryRun), skipped: 'disabled' };
  }

  // Bills belong to a transport year. If no year is current there is nothing
  // sensible to bill INTO, and guessing would attach money to the wrong year.
  const { data: ty } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .limit(1);
  const yearId = (ty as Array<{ id: string }> | null)?.[0]?.id ?? null;
  if (!yearId) {
    return { ...EMPTY(dryRun), skipped: 'no_current_transport_year' };
  }

  // Rail 3: per-structure opt-in. This flag is the ONLY exclusion mechanism —
  // no hardcoded id or name blocklist, because ids change when a structure is
  // recreated and names change when they are edited.
  const { data: rows, error } = await svc
    .from('tms_fee_structure')
    .select('id, name')
    .eq('status', 'active')
    .eq('auto_generate', true)
    .eq('transport_year_id', yearId);
  if (error) {
    console.error('[auto-generate] failed to load fee structures', error);
    return EMPTY(dryRun);
  }

  const structures = (rows ?? []) as Array<{ id: string; name: string }>;
  const results: AutoStructureResult[] = [];

  for (const s of structures) {
    // One structure's failure must not stop the others: they are different
    // institutions, and an unpriced stop in one is no reason to stop billing
    // another.
    try {
      const res = await generateBills(svc, {
        feeStructureId: s.id,
        mode: dryRun ? 'dry_run' : 'generate',
        actorId: null,          // marks the run automated
        skipConflicts: true,    // never double-charge unattended
        skipEmptyRun: true,     // no run row when nothing was billed
      });

      if (!res.ok) {
        results.push({
          id: s.id, name: s.name, billed: 0, skipped: 0, unresolved: 0,
          conflictsSkipped: 0, bornOverdue: 0, errors: 0, error: res.error,
        });
        continue;
      }

      if (dryRun) {
        const p = res.data as Record<string, number>;
        results.push({
          id: s.id, name: s.name,
          billed: p.toGeneratePairs ?? 0,
          skipped: p.alreadyBilledPairs ?? 0,
          unresolved: p.unresolved ?? 0,
          conflictsSkipped: p.conflictsSkipped ?? 0,
          bornOverdue: p.bornOverdue ?? 0,
          errors: 0,
        });
        continue;
      }

      const out = res.data as GenerateOutcome;
      results.push({
        id: s.id, name: s.name,
        billed: out.learnerBilled + out.staffDeferred,
        skipped: out.skipped,
        unresolved: out.unresolved,
        conflictsSkipped: out.conflictsSkipped,
        bornOverdue: out.bornOverdue,
        errors: out.errors,
      });

      // Visible in the existing Activity Log page. Only when something actually
      // happened — at 96 runs a day, logging every no-op would bury real events.
      if (out.learnerBilled + out.staffDeferred > 0) {
        await logSystemActivity({
          module: 'fees',
          action: 'generate',
          entityType: 'tms_fee_structure',
          entityId: s.id,
          entityLabel: s.name,
          description:
            `Automatic run billed ${out.learnerBilled} learner bill(s), ` +
            `${out.staffDeferred} staff bill(s)` +
            (out.bornOverdue ? `; ${out.bornOverdue} created already overdue` : '') +
            (out.conflictsSkipped ? `; ${out.conflictsSkipped} skipped (billed by another structure)` : ''),
          metadata: {
            runId: out.runId,
            automated: true,
            learnerBilled: out.learnerBilled,
            staffDeferred: out.staffDeferred,
            skipped: out.skipped,
            unresolved: out.unresolved,
            bornOverdue: out.bornOverdue,
            conflictsSkipped: out.conflictsSkipped,
            errors: out.errors,
            feeMode: out.feeMode,
          },
        });
      }
    } catch (e) {
      results.push({
        id: s.id, name: s.name, billed: 0, skipped: 0, unresolved: 0,
        conflictsSkipped: 0, bornOverdue: 0, errors: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    dryRun,
    structures: results,
    totalBilled: results.reduce((n, r) => n + r.billed, 0),
    totalBornOverdue: results.reduce((n, r) => n + r.bornOverdue, 0),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/fees/auto-generate.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/auto-generate.ts lib/fees/auto-generate.test.ts
git commit -m "feat(fees): add the scheduled auto-generation sweep"
```

---

### Task 10: Cron endpoint + proxy allowlist

**Files:**
- Create: `app/api/cron/auto-generate-bills/route.ts`
- Modify: `proxy.ts`
- Create: `proxy.test.ts`

**Interfaces:**
- Consumes: `autoGenerateBills` (Task 9).
- Produces: `GET /api/cron/auto-generate-bills` — Bearer `CRON_SECRET`, optional `?dryRun=1`.

- [ ] **Step 1: Write the endpoint**

Create `app/api/cron/auto-generate-bills/route.ts`, mirroring
`app/api/cron/booking-reminders/route.ts`:

```ts
/**
 * Automatic transport bill generation.
 *
 * Scheduled from pg_cron every 15 minutes (see the Phase 3 migration), which
 * calls this endpoint via pg_net with `Authorization: Bearer $CRON_SECRET`.
 *
 * NOT scheduled from vercel.json: no Vercel cron in this project has ever run,
 * because proxy.ts 401s /api/cron/* before the route is reached. This endpoint
 * is allowlisted there by EXACT PATH, and still uses GET so it stays portable
 * to a Vercel cron if that infrastructure is ever repaired.
 *
 * Safe to call repeatedly: generation is idempotent via tms_fee_bill_idem_unique.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { autoGenerateBills } from '@/lib/fees/auto-generate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Dry run: report what would be billed, write nothing. Auth is still required —
  // this is not a public preview.
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const summary = await autoGenerateBills(createServiceRoleClient(), { dryRun });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[auto-generate-bills] run failed', e);
    return NextResponse.json({ error: 'Auto generation run failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the failing proxy test**

Create `proxy.test.ts` at the repo root:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./proxy.ts', import.meta.url), 'utf8');

describe('proxy cron allowlist', () => {
  it('allowlists the auto-generate cron endpoint', () => {
    // Without this the request is 401'd at the edge and the route's own
    // CRON_SECRET check never runs — which is exactly why the two existing
    // Vercel crons have never fired.
    expect(SRC).toContain("'/api/cron/auto-generate-bills'");
  });

  it('does NOT allowlist the whole /api/cron/ prefix', () => {
    // A prefix allowlist would also un-block /api/cron/incharge-attendance,
    // which removes bus in-charges from their role and bills them. Waking that
    // job must be a deliberate, separate decision.
    expect(SRC).not.toContain("'/api/cron/'");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- proxy.test.ts`
Expected: FAIL on the first assertion.

- [ ] **Step 4: Add the exact-path allowlist**

In `proxy.ts`, extend `PUBLIC_PATHS` (the exact-match `Set`, **not**
`PUBLIC_PATH_PREFIXES`):

```ts
const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/callback',
  '/unauthorized',
  '/access-denied',
  // Scheduled bill generation, called by pg_cron via pg_net. It carries a Bearer
  // CRON_SECRET, never a Supabase session cookie, so without this exact-path
  // entry step 3 below 401s it and the route's own secret check never runs.
  //
  // EXACT PATH ONLY — do not widen this to a '/api/cron/' prefix. That would
  // also un-block /api/cron/incharge-attendance, which after two consecutive
  // missed travel days removes bus in-charges from their role and bills them.
  // Those jobs have never run; waking them is a separate decision.
  '/api/cron/auto-generate-bills',
]);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- proxy.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verify the endpoint is reachable and fails closed**

Start the dev server (`npm run dev`), then:

```bash
curl -si "http://127.0.0.1:3000/api/cron/auto-generate-bills" | head -1
```
Expected: `HTTP/1.1 401 Unauthorized` — reaching the route (not the proxy) and
correctly refusing without a secret.

Use `127.0.0.1`, not `localhost` — `curl localhost` false-negatives on this
machine. Confirm which port serves TMS-ADMIN by checking the page `<title>`; the
port↔app mapping with the sibling MyJKKN app is not stable.

- [ ] **Step 7: Run the whole suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add app/api/cron/auto-generate-bills/route.ts proxy.ts proxy.test.ts
git commit -m "feat(fees): add the auto-generate cron endpoint and allowlist its exact path"
```

---

# Phase 3 — Go live

Everything above is inert. This phase turns it on.

---

### Task 11: Migration — structure flags

**Files:**
- Create: `supabase/migrations/20260811120000_auto_generate_flags.sql`

**Interfaces:**
- Consumes: the `tms_fee_structure.auto_generate` column (already live).
- Produces: no code interfaces.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260811120000_auto_generate_flags.sql`:

```sql
-- Automatic bill generation: per-structure opt-in flags.
--
-- The auto_generate column already exists on the live database (migration
-- 20260724000000, applied from the abandoned PR #12 branch). This migration only
-- sets the flags, and records the intent in version control so that "Testing and
-- Staff must never auto-bill" is an asserted fact rather than a convention.
--
-- Idempotent: re-running changes nothing.

-- Arts Aided (stop_wise, ~12 learners) joins the two structures already flagged.
update tms_fee_structure
   set auto_generate = true
 where name = 'Transport Fees 2026-2027 (Arts Aided)'
   and status = 'active';

-- Testing is an experiment sandbox; it must never bill anyone automatically.
update tms_fee_structure
   set auto_generate = false
 where name = 'Testing';

-- Staff has NEVER been generated (0 ledger rows). Enabling it would create ~26
-- bills and fire ~26 notifications in one unattended run. It must be generated
-- by hand once, deliberately, before automation is even considered.
update tms_fee_structure
   set auto_generate = false
 where audience = 'staff';
```

- [ ] **Step 2: Apply it**

Apply via the Supabase MCP `apply_migration` tool (this project's agent can
write to the real application database `kvizhngldtiuufknvehv`), then verify:

```sql
select name, audience, fee_mode, status, auto_generate
from tms_fee_structure order by auto_generate desc, name;
```

Expected: `auto_generate = true` for exactly three rows — `Transport Fees
2026-2027`, `Transport Fees 2026-2027(Arts Self)`, `Transport Fees 2026-2027
(Arts Aided)`. False for `Testing` and the staff structure.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260811120000_auto_generate_flags.sql
git commit -m "feat(fees): flag Arts Aided for auto-generation; pin Testing and Staff off"
```

---

### Task 12: Schedule, verify, and enable

The only irreversible-feeling step, and it is a single boolean.

**Files:**
- Create: `docs/superpowers/plans/auto-bill-generation-runbook.md`

- [ ] **Step 1: Store the secrets in Vault**

These cannot be committed. Run against the live database, substituting the real
values:

```sql
select vault.create_secret('<the CRON_SECRET value>', 'tms_cron_secret',
                           'Bearer token for TMS-ADMIN /api/cron endpoints');
select vault.create_secret('https://<tms-admin-domain>', 'tms_app_url',
                           'TMS-ADMIN deployed base URL');
```

Set the **same** `CRON_SECRET` value in the Vercel project environment
(Production), then redeploy so the running instance picks it up.

- [ ] **Step 2: Verify end-to-end with a dry run, before scheduling anything**

```sql
select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
         || '/api/cron/auto-generate-bills?dryRun=1',
  headers := jsonb_build_object(
    'Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret'))
);
```

Wait a few seconds, then read the response:

```sql
select status_code, content::text
from net._http_response order by created desc limit 1;
```

Expected: `status_code = 200`, and a body whose `skipped` is `"disabled"` —
because the master switch is still off. **This proves the whole path works
(pg_net → proxy → route → secret check → sweep) while still writing nothing.**

If `status_code` is 401, the secret does not match between Vault and Vercel.
If it is 404, the deployment does not yet include Task 10.

- [ ] **Step 3: Turn the master switch on and dry-run again**

In the admin UI: Settings → Scheduling → tick **Automatic Bill Generation** → Save.

Re-run the `?dryRun=1` call from Step 2. Expected: `skipped` is now absent and
`structures` lists three entries. Cross-check the `billed` figures against the
live unbilled count:

```sql
with cur as (select id from tms_transport_year where is_current limit 1),
cohort as (
  select lp.id from learners_profiles lp
  where lp.bus_required is true and lp.lifecycle_status = 'active'
)
select count(*) as unbilled
from cohort c
where not exists (
  select 1 from tms_fee_bill fb, cur
  where fb.person_id = c.id and fb.transport_year_id = cur.id
);
```

The dry run's total `billed` should equal `unbilled × terms per structure`.
**If the dry run wants to bill far more than this, stop and investigate — do not
schedule.**

- [ ] **Step 4: Schedule it**

```sql
select cron.schedule(
  'tms-auto-generate-bills',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/auto-generate-bills',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret'))
  );
  $$
);
```

- [ ] **Step 5: Verify the first live runs**

After ~20 minutes:

```sql
-- The job is firing
select jobid, status, start_time, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'tms-auto-generate-bills')
order by start_time desc limit 5;

-- The endpoint is answering 200
select status_code, created from net._http_response order by created desc limit 5;

-- Automated generation runs (triggered_by IS NULL distinguishes them)
select r.triggered_at, f.name, r.learner_billed_count, r.notes
from tms_fee_generation_run r join tms_fee_structure f on f.id = r.fee_structure_id
where r.triggered_by is null order by r.triggered_at desc limit 10;

-- The reconciliation invariant still holds: Billed == Collected + Pending
select
  sum(b.final_amount) filter (where b.status <> 'cancelled')                  as billed,
  sum(b.final_amount - b.balance_amount) filter (where b.status <> 'cancelled') as collected,
  sum(b.balance_amount) filter (where b.status <> 'cancelled')                as pending
from billing_student_bills b
where b.transport_year_id = (select id from tms_transport_year where is_current limit 1);

-- No orphans were created
select count(*) as orphans
from billing_student_bills b
where b.transport_year_id is not null
  and not exists (select 1 from tms_fee_bill fb where fb.billing_student_bill_id = b.id);
```

Expected: job status `succeeded`, HTTP 200, `billed = collected + pending`
exactly, `orphans = 0`. Confirm the Activity Log page shows the automated
entries.

- [ ] **Step 6: Write the runbook**

Create `docs/superpowers/plans/auto-bill-generation-runbook.md` covering: how to
pause (Settings toggle off, or `select cron.unschedule('tms-auto-generate-bills')`),
how to exclude one structure (clear its Auto-generate checkbox), the four
verification queries from Step 5, and the known behaviour that a learner
onboarded after a term's due date is billed as overdue and portal-blocked until
they pay.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/auto-bill-generation-runbook.md
git commit -m "docs(fees): runbook for the automatic bill generation sweep"
```

---

## Rollback

| Situation | Action | Effect |
|---|---|---|
| Billing the wrong people | Settings → untick Automatic Bill Generation | Sweep returns `skipped: 'disabled'` on the next tick |
| Need it fully stopped | `select cron.unschedule('tms-auto-generate-bills');` | No further calls at all |
| One structure misbehaving | Clear its Auto-generate checkbox | Dropped from the sweep, others continue |
| Bad bills created | Existing Transport Vacate flow cancels bills (never deletes) | Cancelled rows are excluded from all money KPIs |

Bills already generated are **not** rolled back by any switch above — generation
is INSERT-only. Use the existing cancellation path.

## Self-review notes

Checked against the spec:

- Convergent design, no event hook — Task 9 (`auto-generate.ts` header comment).
- Institution-wise matching reused unchanged — Tasks 2/9 (`resolveApplicablePeople` untouched).
- pg_cron + pg_net rather than Vercel — Tasks 10, 12.
- Rail 1 idempotency — pre-existing constraint, asserted in Task 12 Step 5.
- Rail 2 master switch — Task 7.
- Rail 3 per-structure flag — Tasks 8, 11.
- Rail 4 conflict skip — Task 5.
- Rail 5 fail-loud overrides — preserved by Task 2, pinned by a Task 1 test.
- Auto-only policies 1–4 — Tasks 4, 5, 9.
- Due dates verbatim + born-overdue reported — Task 4.
- Orphan race closed — Task 3.
- `logSystemActivity` visibility — Tasks 6, 9.
- Exact-path allowlist — Task 10, with a test forbidding the prefix form.
- Testing and Staff excluded — Task 11.
- Phasing 1/2/3 independently mergeable — task ordering above.
