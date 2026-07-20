# Bus In-Charge Attendance Enforcement Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily loop that warns a bus in-charge who marked no attendance on a travel day, and after two consecutive missed travel days revokes their in-charge assignment and generates a staff transport fee bill.

**Architecture:** All decision logic lives in a **pure, I/O-free** module (`lib/boarding/incharge-attendance.ts`) that is exhaustively unit-tested; a thin cron route (`app/api/cron/incharge-attendance/route.ts`) does the I/O and calls it. Strike state persists in a new `tms_incharge_attendance_strike` table (one row per assignment) which doubles as the audit trail and the per-day idempotency guard. Staff billing reuses the row shape the fees generate route already writes to `tms_fee_bill`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role client), vitest 4, Vercel Cron.

**Design spec:** `docs/superpowers/specs/2026-07-20-incharge-attendance-fee-enforcement-design.md`

## Global Constraints

- **Dates are IST, always.** Use `istToday(now)` / `addDays` from `lib/booking/window.ts`. Never `new Date().toISOString().slice(0,10)` — that is UTC and is a known live bug on the attendance page.
- **Vercel cron expressions are UTC.** `30 15 * * *` UTC = 21:00 IST.
- **Never invent fee amounts.** Bills are generated only from an existing `tms_fee_structure` with `audience='staff'`. Zero exist today — the loop must degrade to `billing_status='no_structure'`, not guess.
- **A billing failure must never block the revoke.** Revoke first, bill second.
- **One staffer's failure must never abort the run.** Per-staffer `try/catch`.
- **Staff bills never touch `billing_student_bills`** — its `student_id` is `NOT NULL` with FK to `learners_profiles`. Staff rows live only in `tms_fee_bill` with `billing_student_bill_id: null`.
- Test command: `npm test` (= `vitest run`). Single file: `npx vitest run <path>`.
- Tests are colocated next to source as `*.test.ts` (existing convention: `lib/boarding/attendance-window.test.ts`).
- Commit after every task.

---

### Task 1: Strike table migration

Creates the persistence for streak state, the audit trail, and the idempotency guard.

**Files:**
- Create: `supabase/migrations/20260720130000_create_tms_incharge_attendance_strike.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `tms_incharge_attendance_strike` with columns `id, assignment_id, staff_email, route_id, consecutive_misses, missed_dates, last_evaluated_date, warned_at, removed_at, billing_status, created_at, updated_at`. `UNIQUE (assignment_id)` — later tasks upsert on this.

- [ ] **Step 1: Write the migration**

```sql
-- Strike ledger for the bus in-charge attendance enforcement loop.
-- One row per tms_staff_route_assignment. Doubles as (a) the audit trail of
-- exactly which dates triggered a financial action and (b) the per-day
-- idempotency guard (last_evaluated_date) so a double cron fire is a no-op.

create table if not exists public.tms_incharge_attendance_strike (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.tms_staff_route_assignment(id) on delete cascade,
  staff_email text not null,
  route_id uuid references public.tms_route(id) on delete set null,
  consecutive_misses integer not null default 0,
  missed_dates date[] not null default '{}',
  last_evaluated_date date,
  warned_at timestamptz,
  removed_at timestamptz,
  billing_status text check (billing_status in ('billed','no_structure','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id)
);

create index if not exists idx_tms_ias_staff_email
  on public.tms_incharge_attendance_strike (staff_email);
create index if not exists idx_tms_ias_last_evaluated
  on public.tms_incharge_attendance_strike (last_evaluated_date);

alter table public.tms_incharge_attendance_strike enable row level security;
-- Service-role only (the cron). No policies = no anon/authenticated access,
-- matching the modern tms_ pattern.
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool with name `create_tms_incharge_attendance_strike` and the SQL above.

- [ ] **Step 3: Verify the table exists with the right shape**

Run this via the Supabase MCP `execute_sql` tool:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='tms_incharge_attendance_strike'
order by ordinal_position;
```

Expected: 12 rows, including `missed_dates` as `ARRAY` and `last_evaluated_date` as `date`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260720130000_create_tms_incharge_attendance_strike.sql
git commit -m "feat(boarding): add tms_incharge_attendance_strike table"
```

---

### Task 2: Pure strike-decision logic

The heart of the feature and the only place with real branching risk. Zero I/O, so it is exhaustively testable.

**Files:**
- Create: `lib/boarding/incharge-attendance.ts`
- Test: `lib/boarding/incharge-attendance.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `REMOVAL_THRESHOLD: number` (= 2)
  - `type StrikeState = { consecutiveMisses: number; missedDates: string[]; lastEvaluatedDate: string | null }`
  - `type DayFacts = { date: string; hasBookedRiders: boolean; attendanceMarked: boolean; assignedOnDate: boolean }`
  - `type StrikeOutcome = { action:'skip'; reason:'already_evaluated'|'grace_day'|'no_travel_day' } | { action:'reset'|'warn'|'remove'; state: StrikeState }`
  - `evaluateDay(prev: StrikeState, facts: DayFacts): StrikeOutcome`
  - `warningCopy(missedDates: string[]): { title: string; body: string }`
  - `removalCopy(missedDates: string[], billed: boolean): { title: string; body: string }`
  - `type BillingStatus = 'billed' | 'no_structure' | 'error'`
  - `performRemoval(steps: { revoke: () => Promise<void>; bill: () => Promise<BillingStatus> }): Promise<{ revoked: boolean; billingStatus: BillingStatus }>`

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/incharge-attendance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  evaluateDay,
  warningCopy,
  removalCopy,
  performRemoval,
  REMOVAL_THRESHOLD,
  type StrikeState,
} from './incharge-attendance';

const fresh: StrikeState = { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: null };
const travelDay = { date: '2026-07-20', hasBookedRiders: true, attendanceMarked: false, assignedOnDate: false };

describe('evaluateDay', () => {
  it('skips a day already evaluated (idempotent re-fire)', () => {
    const prev = { ...fresh, lastEvaluatedDate: '2026-07-20' };
    expect(evaluateDay(prev, travelDay)).toEqual({ action: 'skip', reason: 'already_evaluated' });
  });

  it('skips the assignment grace day', () => {
    expect(evaluateDay(fresh, { ...travelDay, assignedOnDate: true }))
      .toEqual({ action: 'skip', reason: 'grace_day' });
  });

  it('skips a day with no booked riders (holiday / empty roster)', () => {
    expect(evaluateDay(fresh, { ...travelDay, hasBookedRiders: false }))
      .toEqual({ action: 'skip', reason: 'no_travel_day' });
  });

  it('already-evaluated takes precedence over the grace day', () => {
    const prev = { ...fresh, lastEvaluatedDate: '2026-07-20' };
    expect(evaluateDay(prev, { ...travelDay, assignedOnDate: true }))
      .toEqual({ action: 'skip', reason: 'already_evaluated' });
  });

  it('resets the streak when attendance was marked', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-07-18'], lastEvaluatedDate: '2026-07-18' };
    expect(evaluateDay(prev, { ...travelDay, attendanceMarked: true })).toEqual({
      action: 'reset',
      state: { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: '2026-07-20' },
    });
  });

  it('warns on the first miss', () => {
    expect(evaluateDay(fresh, travelDay)).toEqual({
      action: 'warn',
      state: { consecutiveMisses: 1, missedDates: ['2026-07-20'], lastEvaluatedDate: '2026-07-20' },
    });
  });

  it('removes on the second consecutive miss', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-07-18'], lastEvaluatedDate: '2026-07-18' };
    expect(evaluateDay(prev, travelDay)).toEqual({
      action: 'remove',
      state: {
        consecutiveMisses: 2,
        missedDates: ['2026-07-18', '2026-07-20'],
        lastEvaluatedDate: '2026-07-20',
      },
    });
  });

  it('does NOT remove when a marked day broke the streak (miss, mark, miss)', () => {
    const afterMiss = evaluateDay(fresh, travelDay);
    if (afterMiss.action !== 'warn') throw new Error('expected warn');
    const afterMark = evaluateDay(afterMiss.state, {
      date: '2026-07-21', hasBookedRiders: true, attendanceMarked: true, assignedOnDate: false,
    });
    if (afterMark.action !== 'reset') throw new Error('expected reset');
    const afterSecondMiss = evaluateDay(afterMark.state, {
      date: '2026-07-22', hasBookedRiders: true, attendanceMarked: false, assignedOnDate: false,
    });
    expect(afterSecondMiss.action).toBe('warn');
  });

  it('exposes a removal threshold of 2', () => {
    expect(REMOVAL_THRESHOLD).toBe(2);
  });
});

describe('copy', () => {
  it('names the missed date in the warning', () => {
    const { title, body } = warningCopy(['2026-07-20']);
    expect(title).toMatch(/attendance/i);
    expect(body).toContain('2026-07-20');
  });

  it('says fees apply on removal, and mentions the bill when billed', () => {
    expect(removalCopy(['2026-07-18', '2026-07-20'], true).body).toMatch(/fee/i);
    expect(removalCopy(['2026-07-18', '2026-07-20'], false).body).toMatch(/transport office/i);
  });
});

describe('performRemoval', () => {
  it('revokes BEFORE billing', async () => {
    const calls: string[] = [];
    await performRemoval({
      revoke: async () => { calls.push('revoke'); },
      bill: async () => { calls.push('bill'); return 'billed'; },
    });
    expect(calls).toEqual(['revoke', 'bill']);
  });

  it('keeps the revoke when billing THROWS', async () => {
    let revoked = false;
    const result = await performRemoval({
      revoke: async () => { revoked = true; },
      bill: async () => { throw new Error('billing exploded'); },
    });
    expect(revoked).toBe(true);
    expect(result).toEqual({ revoked: true, billingStatus: 'error' });
  });

  it('keeps the revoke when no fee structure is configured', async () => {
    const result = await performRemoval({
      revoke: async () => {},
      bill: async () => 'no_structure',
    });
    expect(result).toEqual({ revoked: true, billingStatus: 'no_structure' });
  });

  it('propagates a revoke failure (nothing was revoked, so do not report success)', async () => {
    await expect(performRemoval({
      revoke: async () => { throw new Error('revoke failed'); },
      bill: async () => 'billed',
    })).rejects.toThrow('revoke failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/boarding/incharge-attendance.test.ts`
Expected: FAIL — cannot resolve `./incharge-attendance`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/incharge-attendance.ts`:

```ts
/**
 * Pure decision logic for the bus in-charge attendance enforcement loop.
 *
 * An in-charge holds a transport fee exemption in exchange for marking their
 * route's booked riders each travel day. Miss two CONSECUTIVE travel days and
 * the assignment is revoked and a staff fee bill is generated.
 *
 * No I/O here on purpose — the cron route gathers the facts, this decides.
 */

/** Consecutive missed travel days that trigger removal. */
export const REMOVAL_THRESHOLD = 2;

export type StrikeState = {
  consecutiveMisses: number;
  missedDates: string[];
  lastEvaluatedDate: string | null;
};

export type DayFacts = {
  /** 'YYYY-MM-DD' in IST. */
  date: string;
  /** The route had at least one booked rider — i.e. it was a real travel day. */
  hasBookedRiders: boolean;
  /** At least one tms_attendance row exists for the route on this date, either leg. */
  attendanceMarked: boolean;
  /** The assignment was created on this date — one-day grace. */
  assignedOnDate: boolean;
};

export type StrikeOutcome =
  | { action: 'skip'; reason: 'already_evaluated' | 'grace_day' | 'no_travel_day' }
  | { action: 'reset'; state: StrikeState }
  | { action: 'warn'; state: StrikeState }
  | { action: 'remove'; state: StrikeState };

export function evaluateDay(prev: StrikeState, facts: DayFacts): StrikeOutcome {
  // Idempotency first: a re-fired cron must change nothing.
  if (prev.lastEvaluatedDate === facts.date) {
    return { action: 'skip', reason: 'already_evaluated' };
  }
  if (facts.assignedOnDate) return { action: 'skip', reason: 'grace_day' };
  // Holidays, Sundays and empty rosters are not travel days: no strike, and
  // deliberately no reset either (they neither punish nor forgive).
  if (!facts.hasBookedRiders) return { action: 'skip', reason: 'no_travel_day' };

  if (facts.attendanceMarked) {
    return {
      action: 'reset',
      state: { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: facts.date },
    };
  }

  const state: StrikeState = {
    consecutiveMisses: prev.consecutiveMisses + 1,
    missedDates: [...prev.missedDates, facts.date],
    lastEvaluatedDate: facts.date,
  };
  return state.consecutiveMisses >= REMOVAL_THRESHOLD
    ? { action: 'remove', state }
    : { action: 'warn', state };
}

export function warningCopy(missedDates: string[]): { title: string; body: string } {
  const last = missedDates[missedDates.length - 1] ?? '';
  return {
    title: 'Attendance not marked',
    body:
      `You did not mark attendance for your bus on ${last}. ` +
      `Mark attendance on your next travel day — if you miss ${REMOVAL_THRESHOLD} travel days in a row, ` +
      `your bus in-charge role will be removed and transport fees will apply to you.`,
  };
}

export function removalCopy(missedDates: string[], billed: boolean): { title: string; body: string } {
  return {
    title: 'Bus in-charge role removed',
    body:
      `Attendance was not marked on ${missedDates.join(' and ')}. ` +
      `Your bus in-charge role has been removed and your transport fee exemption no longer applies. ` +
      (billed
        ? 'A transport fee bill has been generated for you.'
        : 'Please contact the transport office regarding your transport fees.'),
  };
}

export type BillingStatus = 'billed' | 'no_structure' | 'error';

/**
 * Runs the removal in the ONE order that is safe: revoke first, bill second.
 *
 * Billing depends on a fee structure that may not exist and on a shared billing
 * schema we do not own, so it is the failure-prone half. If it throws, the
 * revoke must still stand — the staffer has lost the in-charge role either way
 * and the transport office can bill manually. A revoke failure, by contrast,
 * propagates: nothing happened, so the caller must not record a removal.
 *
 * Injecting the two steps keeps this orderable guarantee unit-testable without
 * stubbing a Supabase client.
 */
export async function performRemoval(steps: {
  revoke: () => Promise<void>;
  bill: () => Promise<BillingStatus>;
}): Promise<{ revoked: boolean; billingStatus: BillingStatus }> {
  await steps.revoke();
  try {
    return { revoked: true, billingStatus: await steps.bill() };
  } catch {
    return { revoked: true, billingStatus: 'error' };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/boarding/incharge-attendance.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/incharge-attendance.ts lib/boarding/incharge-attendance.test.ts
git commit -m "feat(boarding): pure strike-decision logic for in-charge attendance"
```

---

### Task 3: Staff fee bill writer

Resolves the applicable staff fee structure and writes real `tms_fee_bill` rows. Mirrors the shape at `app/api/admin/fees/[id]/generate/route.ts:322-334` exactly.

**Files:**
- Create: `lib/fees/staff-bill.ts`
- Test: `lib/fees/staff-bill.test.ts`

**Interfaces:**
- Consumes: `ApplicablePerson` / `resolveApplicablePeople` from `lib/fees/applicability.ts`; `TRANSPORT_CATEGORY_NAME` from `lib/fees/types.ts`.
- Produces:
  - `type StaffBillTerm = { term_no: number; amount: number; due_date: string }`
  - `type StaffFeeBillRow` (the exact `tms_fee_bill` insert shape)
  - `buildStaffFeeBillRow(input: BuildStaffFeeBillRowInput): StaffFeeBillRow`
  - `generateStaffBill(svc, opts): Promise<{ billingStatus: 'billed'|'no_structure'|'error'; inserted: number }>`

- [ ] **Step 1: Write the failing test**

Create `lib/fees/staff-bill.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildStaffFeeBillRow } from './staff-bill';

describe('buildStaffFeeBillRow', () => {
  const base = {
    runId: null,
    feeStructureId: 'fs-1',
    transportYearId: 'ty-1',
    staffId: 'staff-1',
    categoryId: 'cat-1',
    term: { term_no: 2, amount: 2750, due_date: '2026-08-01' },
  };

  it('produces the exact tms_fee_bill staff row shape', () => {
    expect(buildStaffFeeBillRow(base)).toEqual({
      generation_run_id: null,
      fee_structure_id: 'fs-1',
      transport_year_id: 'ty-1',
      person_id: 'staff-1',
      person_type: 'staff',
      term_no: 2,
      amount: 2750,
      due_date: '2026-08-01',
      billing_category_id: 'cat-1',
      billing_student_bill_id: null,
      status: 'staff_deferred',
    });
  });

  it('never links a shared billing_student_bills row (staff cannot exist there)', () => {
    expect(buildStaffFeeBillRow(base).billing_student_bill_id).toBeNull();
  });

  it('coerces a numeric-string amount to a number', () => {
    const row = buildStaffFeeBillRow({
      ...base,
      term: { term_no: 1, amount: '3000' as unknown as number, due_date: '2026-08-01' },
    });
    expect(row.amount).toBe(3000);
    expect(typeof row.amount).toBe('number');
  });

  it('carries the generation run id when present', () => {
    expect(buildStaffFeeBillRow({ ...base, runId: 'run-9' }).generation_run_id).toBe('run-9');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/fees/staff-bill.test.ts`
Expected: FAIL — cannot resolve `./staff-bill`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/staff-bill.ts`:

```ts
/**
 * Staff transport fee billing.
 *
 * Staff can NEVER be inserted into billing_student_bills — its student_id is
 * NOT NULL with FK fk_billing_student_bills_learner_profile -> learners_profiles(id),
 * and that table is shared with MyJKKN. A staff bill is therefore a tms_fee_bill
 * row carrying the real amount/due_date with billing_student_bill_id = null.
 *
 * Idempotency is enforced by the unique index
 * tms_fee_bill_idem_unique (fee_structure_id, person_id, term_no, transport_year_id),
 * so a re-run cannot double-bill: 23505 is treated as "already billed".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveApplicablePeople } from './applicability';
import { TRANSPORT_CATEGORY_NAME, type FeeAudience } from './types';

export type StaffBillTerm = { term_no: number; amount: number; due_date: string };

export interface StaffFeeBillRow {
  generation_run_id: string | null;
  fee_structure_id: string;
  transport_year_id: string;
  person_id: string;
  person_type: 'staff';
  term_no: number;
  amount: number;
  due_date: string;
  billing_category_id: string | null;
  billing_student_bill_id: null;
  status: 'staff_deferred';
}

export interface BuildStaffFeeBillRowInput {
  runId: string | null;
  feeStructureId: string;
  transportYearId: string;
  staffId: string;
  categoryId: string | null;
  term: StaffBillTerm;
}

/** Pure: the exact row the fees generate route writes for a staff member. */
export function buildStaffFeeBillRow(input: BuildStaffFeeBillRowInput): StaffFeeBillRow {
  return {
    generation_run_id: input.runId,
    fee_structure_id: input.feeStructureId,
    transport_year_id: input.transportYearId,
    person_id: input.staffId,
    person_type: 'staff',
    term_no: input.term.term_no,
    amount: Number(input.term.amount),
    due_date: input.term.due_date,
    billing_category_id: input.categoryId,
    billing_student_bill_id: null,
    status: 'staff_deferred',
  };
}

/**
 * Find the active staff fee structure that applies to this staffer for the
 * current transport year, and write one tms_fee_bill row per term.
 * Returns 'no_structure' (not an error) when none is configured — that is the
 * expected state until the transport office creates one.
 */
export async function generateStaffBill(
  svc: SupabaseClient,
  opts: { staffId: string; transportYearId: string },
): Promise<{ billingStatus: 'billed' | 'no_structure' | 'error'; inserted: number }> {
  try {
    const { data: structures, error: sErr } = await svc
      .from('tms_fee_structure')
      .select('id, audience, institution_ids, staff_role_keys, lifecycle_statuses')
      .eq('audience', 'staff')
      .eq('status', 'active')
      .eq('transport_year_id', opts.transportYearId);
    if (sErr) return { billingStatus: 'error', inserted: 0 };
    if (!structures?.length) return { billingStatus: 'no_structure', inserted: 0 };

    // Pick the first structure whose applicable population contains this staffer.
    let match: { id: string } | null = null;
    for (const fs of structures) {
      const people = await resolveApplicablePeople(svc, fs);
      if (people.some((p) => p.person_id === opts.staffId)) {
        match = { id: fs.id };
        break;
      }
    }
    if (!match) return { billingStatus: 'no_structure', inserted: 0 };

    const { data: terms, error: tErr } = await svc
      .from('tms_fee_structure_term')
      .select('term_no, amount, due_date')
      .eq('fee_structure_id', match.id)
      .is('year_band_id', null)
      .order('term_no');
    if (tErr) return { billingStatus: 'error', inserted: 0 };
    if (!terms?.length) return { billingStatus: 'no_structure', inserted: 0 };

    const catName = TRANSPORT_CATEGORY_NAME['staff' as FeeAudience];
    const { data: cat } = await svc
      .from('billing_categories')
      .select('id')
      .eq('category_name', catName)
      .maybeSingle();

    let inserted = 0;
    for (const term of terms as StaffBillTerm[]) {
      const row = buildStaffFeeBillRow({
        runId: null,
        feeStructureId: match.id,
        transportYearId: opts.transportYearId,
        staffId: opts.staffId,
        categoryId: cat?.id ?? null,
        term,
      });
      const { error } = await svc.from('tms_fee_bill').insert([row]);
      // 23505 = the idempotency index already covered this term. Not an error.
      if (error && error.code !== '23505') return { billingStatus: 'error', inserted };
      if (!error) inserted++;
    }
    return { billingStatus: 'billed', inserted };
  } catch {
    return { billingStatus: 'error', inserted: 0 };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/fees/staff-bill.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/staff-bill.ts lib/fees/staff-bill.test.ts
git commit -m "feat(fees): staff transport fee bill writer"
```

---

### Task 4: The cron route

The orchestrator. Thin: gather facts, call `evaluateDay`, act on the outcome, persist, report.

**Files:**
- Create: `app/api/cron/incharge-attendance/route.ts`

**Interfaces:**
- Consumes: `evaluateDay`, `warningCopy`, `removalCopy` (Task 2); `generateStaffBill` (Task 3); `istToday` from `lib/booking/window.ts`; `loadBookedRoster(svc, routeId, date)` from `lib/booking/roster.ts`; `notifyProfile(svc, {profileId, actorId, title, body, category?, url?})` from `lib/notifications/notify.ts`; `maybeRevokeBoardingRole(svc, assignmentId)` from `lib/boarding/roles.ts`; `createServiceRoleClient()` from `lib/supabase/server.ts`; `logActivityFromHeaders(request, entry)` from `lib/activity/log.ts`.
- Produces: `GET /api/cron/incharge-attendance` returning `{ success, data: { date, evaluated, skipped, warned, removed, billed, errors } }`.

- [ ] **Step 1: Write the route**

Create `app/api/cron/incharge-attendance/route.ts`:

```ts
/**
 * Daily bus in-charge attendance enforcement loop.
 *
 * Scheduled from vercel.json at "30 15 * * *" UTC = 21:00 IST, after both the
 * onward and return legs have closed. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 *
 * For each ACTIVE in-charge assignment: if the route had booked riders that day
 * and nobody marked attendance, record a strike. First strike warns; the second
 * CONSECUTIVE strike revokes the assignment and generates a staff fee bill.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { istToday } from '@/lib/booking/window';
import { loadBookedRoster } from '@/lib/booking/roster';
import { notifyProfile } from '@/lib/notifications/notify';
import { maybeRevokeBoardingRole } from '@/lib/boarding/roles';
import { logActivityFromHeaders } from '@/lib/activity/log';
import { generateStaffBill } from '@/lib/fees/staff-bill';
import {
  evaluateDay,
  warningCopy,
  removalCopy,
  performRemoval,
  type StrikeState,
  type BillingStatus,
} from '@/lib/boarding/incharge-attendance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createServiceRoleClient();
  const date = istToday();
  const summary = {
    date,
    evaluated: 0,
    skipped: 0,
    warned: 0,
    removed: 0,
    billed: 0,
    errors: 0,
    // Which staffer failed and why. A bare error COUNT is undiagnosable in a
    // job that revokes roles and writes bills — always carry the reason out.
    failures: [] as Array<{ staffEmail: string; message: string }>,
  };

  const { data: assignments, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('id, staff_email, route_id, assigned_at, assigned_by')
    .eq('is_active', true);
  if (aErr) {
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }

  const { data: currentYear } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  for (const a of assignments ?? []) {
    try {
      summary.evaluated++;

      const { data: strike } = await svc
        .from('tms_incharge_attendance_strike')
        .select('*')
        .eq('assignment_id', a.id)
        .maybeSingle();

      const prev: StrikeState = {
        consecutiveMisses: strike?.consecutive_misses ?? 0,
        missedDates: (strike?.missed_dates as string[] | null) ?? [],
        lastEvaluatedDate: strike?.last_evaluated_date ?? null,
      };

      const roster = a.route_id
        ? await loadBookedRoster(svc, a.route_id, date)
        : { counts: { booked: 0, capacity: 0 }, riders: [] };

      // Route-level coverage: ANY mark on this route today, either leg, counts.
      let attendanceMarked = false;
      if (a.route_id) {
        const { count } = await svc
          .from('tms_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('route_id', a.route_id)
          .eq('trip_date', date);
        attendanceMarked = (count ?? 0) > 0;
      }

      const outcome = evaluateDay(prev, {
        date,
        hasBookedRiders: roster.riders.length > 0,
        attendanceMarked,
        assignedOnDate: (a.assigned_at ?? '').slice(0, 10) === date,
      });

      if (outcome.action === 'skip') {
        summary.skipped++;
        continue;
      }

      // Resolve the staffer's profile once — needed for notifications.
      const { data: profile } = await svc
        .from('profiles')
        .select('id')
        .ilike('email', a.staff_email)
        .maybeSingle();
      const actorId = a.assigned_by ?? profile?.id ?? null;

      let billingStatus: BillingStatus | null = null;

      if (outcome.action === 'remove') {
        // performRemoval guarantees revoke-then-bill, and that a billing
        // failure cannot undo the revoke. See lib/boarding/incharge-attendance.ts.
        const removal = await performRemoval({
          revoke: async () => {
            await svc
              .from('tms_staff_route_assignment')
              .update({ is_active: false })
              .eq('id', a.id);
            await maybeRevokeBoardingRole(svc, a.id);
          },
          bill: async () => {
            const { data: staffRow } = await svc
              .from('staff')
              .select('id')
              .ilike('email', a.staff_email)
              .maybeSingle();
            if (!staffRow?.id || !currentYear?.id) return 'no_structure';
            const res = await generateStaffBill(svc, {
              staffId: staffRow.id,
              transportYearId: currentYear.id,
            });
            return res.billingStatus;
          },
        });

        billingStatus = removal.billingStatus;
        if (billingStatus === 'billed') summary.billed++;
        summary.removed++;
        await logActivityFromHeaders(request, {
          module: 'staff-route-assignments',
          action: 'unassign',
          entity_id: a.id,
          metadata: {
            reason: 'attendance_auto_removal',
            missed_dates: outcome.state.missedDates,
            billing_status: billingStatus,
          },
        });
      }

      // Persist the strike state (upsert on the unique assignment_id).
      await svc.from('tms_incharge_attendance_strike').upsert(
        {
          assignment_id: a.id,
          staff_email: a.staff_email,
          route_id: a.route_id,
          consecutive_misses: outcome.state.consecutiveMisses,
          missed_dates: outcome.state.missedDates,
          last_evaluated_date: outcome.state.lastEvaluatedDate,
          warned_at: outcome.action === 'warn' ? new Date().toISOString() : strike?.warned_at ?? null,
          removed_at: outcome.action === 'remove' ? new Date().toISOString() : strike?.removed_at ?? null,
          billing_status: billingStatus ?? strike?.billing_status ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'assignment_id' },
      );

      if (profile?.id && actorId) {
        if (outcome.action === 'warn') {
          const copy = warningCopy(outcome.state.missedDates);
          await notifyProfile(svc, {
            profileId: profile.id,
            actorId,
            title: copy.title,
            body: copy.body,
            url: '/boarding/attendance',
          });
          summary.warned++;
        } else if (outcome.action === 'remove') {
          const copy = removalCopy(outcome.state.missedDates, billingStatus === 'billed');
          await notifyProfile(svc, {
            profileId: profile.id,
            actorId,
            title: copy.title,
            body: copy.body,
            url: '/boarding/in-charge',
          });
        }
      }
    } catch (e) {
      // One staffer's failure must never abort the run for the others.
      summary.errors++;
      summary.failures.push({
        staffEmail: a.staff_email,
        message: e instanceof Error ? e.message : String(e),
      });
      console.error('[incharge-attendance] failed for', a.staff_email, e);
    }
  }

  return NextResponse.json({ success: true, data: summary });
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "incharge-attendance"`
Expected: no output (no errors in this file).

> The repo has ~540 pre-existing `tsc` errors unrelated to this work and `next build` does not gate on them. Only assert that **this file** is clean.

- [ ] **Step 3: Verify the auth gate rejects an unauthenticated call**

Start the dev server on port 3001 (port 3000 is a different app):

```bash
npm run dev -- -p 3001
```

Then in another shell:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/cron/incharge-attendance
```

Expected: `401`

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/incharge-attendance/route.ts
git commit -m "feat(boarding): daily in-charge attendance enforcement cron route"
```

---

### Task 5: Schedule the loop

**Files:**
- Modify: `vercel.json`
- Create: `docs/superpowers/plans/incharge-attendance-runbook.md`

**Interfaces:**
- Consumes: `GET /api/cron/incharge-attendance` (Task 4).
- Produces: a daily invocation at 21:00 IST.

- [ ] **Step 1: Add the cron entry**

Replace the contents of `vercel.json` with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["bom1"],
  "crons": [
    {
      "path": "/api/cron/incharge-attendance",
      "schedule": "30 15 * * *"
    }
  ]
}
```

> `30 15 * * *` is **UTC** — 21:00 IST. Both attendance legs have closed by then.

- [ ] **Step 2: Write the runbook**

Create `docs/superpowers/plans/incharge-attendance-runbook.md`:

```markdown
# In-Charge Attendance Loop — Runbook

## Enabling
1. Set `CRON_SECRET` in Vercel project env (Production + Preview) to a long random string.
   Vercel automatically sends it as `Authorization: Bearer $CRON_SECRET` to scheduled paths.
2. Deploy. The schedule in `vercel.json` (`30 15 * * *` UTC = 21:00 IST) activates on deploy.

## Manual invocation
    curl -H "Authorization: Bearer $CRON_SECRET" \
      https://tmsadmin.jkkn.ai/api/cron/incharge-attendance

Returns `{ success, data: { date, evaluated, skipped, warned, removed, billed, errors } }`.

## Prerequisite for billing
The loop bills only from an ACTIVE `tms_fee_structure` with `audience='staff'` for the
CURRENT transport year. Zero exist as of 2026-07-20 — until the transport office creates
one in Fees Structure, removals record `billing_status='no_structure'` and no bill is
generated. The revoke still happens.

## Inspecting state
    select staff_email, consecutive_misses, missed_dates, last_evaluated_date,
           warned_at, removed_at, billing_status
    from tms_incharge_attendance_strike order by updated_at desc;

## Undoing a wrong removal
    update tms_staff_route_assignment set is_active = true where id = '<assignment_id>';
    delete from tms_incharge_attendance_strike where assignment_id = '<assignment_id>';
Then cancel any generated bill: `update tms_fee_bill set status='cancelled' where ...`.
The staffer can also simply re-opt-in via the willingness toggle at /boarding/in-charge.
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json docs/superpowers/plans/incharge-attendance-runbook.md
git commit -m "chore(boarding): schedule in-charge attendance loop at 21:00 IST"
```

---

### Task 6: DRY the fees generate route onto the shared row builder

Removes the duplicated staff-row literal so the bulk route and the loop cannot drift apart.

**Files:**
- Modify: `app/api/admin/fees/[id]/generate/route.ts:320-337`

**Interfaces:**
- Consumes: `buildStaffFeeBillRow` (Task 3).
- Produces: no API change — the written row must be byte-identical.

- [ ] **Step 1: Add the import**

At `app/api/admin/fees/[id]/generate/route.ts`, add below the existing `lib/fees` imports (after line 8):

```ts
import { buildStaffFeeBillRow } from '@/lib/fees/staff-bill';
```

- [ ] **Step 2: Replace the staff branch**

Replace lines 320-337 (the `} else {` staff branch) with:

```ts
        } else {
          // staff: coverage-only ledger row (no billing target in v1).
          // Row shape is shared with the in-charge enforcement loop.
          const { error: ledErr } = await supabase.from('tms_fee_bill').insert([
            buildStaffFeeBillRow({
              runId,
              feeStructureId: id,
              transportYearId: fs.transport_year_id,
              staffId: p.person_id,
              categoryId,
              term: { term_no: t.term_no, amount, due_date: t.due_date },
            }),
          ]);
          if (ledErr) { errors++; continue; }
          staffDeferred++;
        }
```

- [ ] **Step 3: Verify the row shape is unchanged**

Run: `npx vitest run lib/fees/staff-bill.test.ts`
Expected: PASS — the shape test from Task 3 is what guards this refactor.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "fees/\[id\]/generate"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/fees/[id]/generate/route.ts"
git commit -m "refactor(fees): share the staff bill row builder with the enforcement loop"
```

---

### Task 7: In-portal strike warning banner

Makes the warning visible where the staffer works, not only in the 🔔 inbox.

**Files:**
- Create: `app/api/boarding/incharge-strike/route.ts`
- Modify: `app/boarding/attendance/page.tsx`

**Interfaces:**
- Consumes: `tms_incharge_attendance_strike` (Task 1).
- Produces: `GET /api/boarding/incharge-strike` → `{ success, data: { consecutiveMisses, missedDates } | null }`.

- [ ] **Step 1: Create the read endpoint**

Create `app/api/boarding/incharge-strike/route.ts`:

```ts
/** The signed-in in-charge's own current strike state, for the portal banner. */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

async function handler(_request: NextRequest, auth: AuthContext) {
  const svc = createServiceRoleClient();
  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('email')
    .eq('id', auth.userId)
    .maybeSingle();
  if (!profile?.email) return NextResponse.json({ success: true, data: null });

  const { data } = await svc
    .from('tms_incharge_attendance_strike')
    .select('consecutive_misses, missed_dates, removed_at')
    .ilike('staff_email', profile.email)
    .maybeSingle();

  if (!data || data.removed_at || (data.consecutive_misses ?? 0) < 1) {
    return NextResponse.json({ success: true, data: null });
  }
  return NextResponse.json({
    success: true,
    data: {
      consecutiveMisses: data.consecutive_misses,
      missedDates: (data.missed_dates as string[] | null) ?? [],
    },
  });
}

export const GET = withAuth(handler);
```

- [ ] **Step 2: Add the banner to the attendance page**

In `app/boarding/attendance/page.tsx`, add this query alongside the existing roster query:

```tsx
  const { data: strike } = useQuery({
    queryKey: ['incharge-strike'],
    queryFn: async () => {
      const res = await fetch('/api/boarding/incharge-strike', { credentials: 'same-origin' });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as { consecutiveMisses: number; missedDates: string[] } | null;
    },
  });
```

And render this directly above the roster table:

```tsx
      {strike && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <strong>Attendance not marked on {strike.missedDates.join(', ')}.</strong>{' '}
          Mark attendance on your next travel day — missing 2 travel days in a row removes
          your bus in-charge role and transport fees will apply.
        </div>
      )}
```

> Follow the dark-mode convention: solid colored tints need explicit `dark:` variants in this codebase.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "incharge-strike|boarding/attendance"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/incharge-strike/route.ts app/boarding/attendance/page.tsx
git commit -m "feat(boarding): in-portal strike warning banner"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all pre-existing tests plus the **19** added here (15 in Task 2, 4 in Task 3).

> Record the baseline by running `npm test` on `origin/main` **before** starting Task 1, rather
> than trusting a remembered count — the suite grows week to week. The assertion that matters is
> "baseline + 19, zero regressions", not any specific total.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds (this is the real gate — `tsc` is chronically red repo-wide and `next build` has `ignoreBuildErrors: true`).

- [ ] **Step 3: Manual smoke test against real data**

With the dev server on port 3001 and `CRON_SECRET` set in `.env.local`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/incharge-attendance
```

Expected: `{"success":true,"data":{"date":"<today IST>","evaluated":3,...}}` — 3 is the current
count of active in-charge assignments. Confirm `removed: 0` on the first run unless a staffer
genuinely has two consecutive missed travel days.

Then inspect the persisted state via Supabase MCP `execute_sql`:

```sql
select staff_email, consecutive_misses, missed_dates, last_evaluated_date, billing_status
from tms_incharge_attendance_strike order by updated_at desc;
```

- [ ] **Step 4: Verify idempotency**

Run the same curl a second time.
Expected: identical summary but with every assignment counted under `skipped` (reason
`already_evaluated`), and **no** new `tms_fee_bill` rows:

```sql
select count(*) from tms_fee_bill where person_type = 'staff';
```

- [ ] **Step 5: Commit any fixes and open the PR**

```bash
git push -u origin feat/incharge-attendance-fee-enforcement
gh pr create --title "feat(boarding): in-charge attendance enforcement loop" --body "$(cat <<'EOF'
Daily loop enforcing the bus in-charge attendance duty.

An in-charge holds a transport fee exemption in exchange for marking their
route's booked riders each travel day. This adds a Vercel cron (21:00 IST)
that warns after one missed travel day and, after two CONSECUTIVE missed
travel days, revokes the assignment and generates a staff transport fee bill.

- Decision logic is pure and unit-tested (`lib/boarding/incharge-attendance.ts`)
- Strike state + audit trail in new `tms_incharge_attendance_strike`
- Staff bills are `tms_fee_bill` rows; `billing_student_bills` is closed to
  staff by a NOT NULL FK to `learners_profiles`
- Revoke happens before billing, so a billing failure cannot block it
- Idempotent: `last_evaluated_date` guards the streak, the existing
  `tms_fee_bill_idem_unique` index guards the bill

KNOWN LIMITATION: zero staff fee structures exist today, so removals currently
record `billing_status='no_structure'` and generate no bill until the transport
office configures one.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> Requires `gh auth switch --user sangeethav-byte` to push to JKKN-Institutions/TMS-ADMIN.

---

## Notes for the implementer

- **`notifyProfile` requires a non-null `actorId`.** The route uses `a.assigned_by ?? profile?.id`. If both are null the notification is skipped rather than crashing — verify this matches `lib/notifications/notify.ts:19-35` when you get there, and adjust if the helper tolerates null.
- **`ilike` on email** is used throughout because `tms_staff_route_assignment.staff_email` casing is not normalised. This matches `getAssignedRouteIdsForUser`'s lowercasing behaviour.
- **Sundays** are a compulsory holiday (`isSunday` in `lib/booking/window.ts`) so they never carry bookings — the `hasBookedRiders` check already excludes them; no special case needed.
- **Do not** add staff amounts to Bill Management KPIs in this work — `summarizeBills` deliberately filters to `person_type === 'learner'`, and changing it would break the `Billed == Collected + Pending` reconciliation with MyJKKN. That is a separate increment.
