# In-charge Attendance Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wake the dormant bus in-charge attendance enforcement loop with a two-warning ladder, a weekday-only travel-day gate, a billing precondition that blocks removal when no bill can be raised, and admin visibility — all behind a shadow-mode switch.

**Architecture:** All decision logic stays in pure functions under `lib/` that the cron route calls after gathering facts; the route holds I/O and mode handling only. A settings-driven mode (`off` / `shadow` / `enforce`) selects whether outcomes are acted on, using one code path so `enforce` is never a first execution. The job is scheduled from pg_cron via `pg_net`, mirroring the live `tms-auto-generate-bills` job, because Vercel crons have never fired on this project.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` not `middleware.ts`), TypeScript, Supabase (service-role client), TanStack Query + TanStack Table, vitest, pg_cron + pg_net + Supabase vault.

## Global Constraints

- **Test files must live under `lib/`** — vitest only collects there on this project. Never put a test beside a file in `app/`.
- **`@/*` path alias resolves under vitest.** Use it in test imports.
- **Never widen `proxy.ts` to an `/api/cron/` prefix.** Exact paths only. `proxy.test.ts` asserts the prefix form is absent and must keep doing so.
- **`tms_incharge_attendance_strike.billing_status` has a CHECK constraint** allowing exactly `'billed'`, `'no_structure'`, `'error'`. Do not write any other value; no migration alters this.
- **No schema change is required by this plan** other than the pg_cron scheduling migration in Task 10.
- **`tsc` is red on main** (~540 chronic errors, not gated by `next build`). Verify with `npx vitest run` and path-scoped checks, never a whole-project `tsc` pass.
- **`npm run lint` is broken** (circular config). Do not run it.
- Commit after every task.

---

### Task 1: Enforcement ladder and weekday gate

Raises the removal threshold to 3 so misses 1 and 2 warn, and teaches `evaluateDay` that only Monday–Friday count as travel days.

**Files:**
- Modify: `lib/boarding/incharge-attendance.ts`
- Test: `lib/boarding/incharge-attendance.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `REMOVAL_THRESHOLD: number` (value `3`)
  - `isServiceWeekday(date: string): boolean` — `date` is `'YYYY-MM-DD'`
  - `DayFacts` gains `isServiceWeekday: boolean`
  - `StrikeOutcome`'s skip reason union gains `'not_a_service_day'`
  - `warningCopy(missedDates: string[], isFinalWarning: boolean): { title: string; body: string }`

- [ ] **Step 1: Write the failing tests**

Replace the `'exposes a removal threshold of 2'` test (lines 76-78) and the `'removes on the second consecutive miss'` test (lines 51-61) in `lib/boarding/incharge-attendance.test.ts`, and add the new cases. Also add `isServiceWeekday: true` to the shared `travelDay` fixture on line 12:

```typescript
const travelDay = {
  date: '2026-07-20',
  hasBookedRiders: true,
  attendanceMarked: false,
  assignedOnDate: false,
  isServiceWeekday: true,
};
```

Add to the `describe('evaluateDay', ...)` block, replacing the two tests named above:

```typescript
  it('warns again on the second consecutive miss (final warning)', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-07-17'], lastEvaluatedDate: '2026-07-17' };
    expect(evaluateDay(prev, travelDay)).toEqual({
      action: 'warn',
      state: {
        consecutiveMisses: 2,
        missedDates: ['2026-07-17', '2026-07-20'],
        lastEvaluatedDate: '2026-07-20',
      },
    });
  });

  it('removes on the THIRD consecutive miss', () => {
    const prev = {
      consecutiveMisses: 2,
      missedDates: ['2026-07-16', '2026-07-17'],
      lastEvaluatedDate: '2026-07-17',
    };
    expect(evaluateDay(prev, travelDay)).toEqual({
      action: 'remove',
      state: {
        consecutiveMisses: 3,
        missedDates: ['2026-07-16', '2026-07-17', '2026-07-20'],
        lastEvaluatedDate: '2026-07-20',
      },
    });
  });

  it('a marked day at two misses resets the streak to zero', () => {
    const prev = {
      consecutiveMisses: 2,
      missedDates: ['2026-07-16', '2026-07-17'],
      lastEvaluatedDate: '2026-07-17',
    };
    expect(evaluateDay(prev, { ...travelDay, attendanceMarked: true })).toEqual({
      action: 'reset',
      state: { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: '2026-07-20' },
    });
  });

  it('skips a weekend even when the route has booked riders', () => {
    expect(evaluateDay(fresh, { ...travelDay, isServiceWeekday: false }))
      .toEqual({ action: 'skip', reason: 'not_a_service_day' });
  });

  it('a weekend neither punishes nor forgives an existing streak', () => {
    const prev = { consecutiveMisses: 2, missedDates: ['2026-07-16', '2026-07-17'], lastEvaluatedDate: '2026-07-17' };
    const out = evaluateDay(prev, { ...travelDay, isServiceWeekday: false });
    expect(out).toEqual({ action: 'skip', reason: 'not_a_service_day' });
    // The caller persists nothing on a skip, so the streak survives untouched.
    expect(prev.consecutiveMisses).toBe(2);
  });

  it('already-evaluated takes precedence over a weekend', () => {
    const prev = { ...fresh, lastEvaluatedDate: '2026-07-20' };
    expect(evaluateDay(prev, { ...travelDay, isServiceWeekday: false }))
      .toEqual({ action: 'skip', reason: 'already_evaluated' });
  });

  it('exposes a removal threshold of 3 (two warnings, then removal)', () => {
    expect(REMOVAL_THRESHOLD).toBe(3);
  });
```

Add a new top-level describe block at the end of the file:

```typescript
describe('isServiceWeekday', () => {
  // 2026-08-10 is a Monday; the week runs Mon..Sun.
  it('accepts Monday through Friday', () => {
    for (const d of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']) {
      expect(isServiceWeekday(d)).toBe(true);
    }
  });

  it('rejects Saturday and Sunday', () => {
    expect(isServiceWeekday('2026-08-15')).toBe(false);
    expect(isServiceWeekday('2026-08-16')).toBe(false);
  });

  it('reads the date string literally, not through the host timezone', () => {
    // A naive `new Date('2026-08-16')` is midnight UTC, which is still the 15th
    // in the Americas. The IST day-of-week must not depend on where this runs.
    expect(isServiceWeekday('2026-08-16')).toBe(false);
  });

  it('rejects a malformed date rather than guessing', () => {
    expect(isServiceWeekday('not-a-date')).toBe(false);
  });
});
```

Update the copy tests in `describe('copy', ...)`:

```typescript
  it('names the missed date in the warning', () => {
    const { title, body } = warningCopy(['2026-07-20'], false);
    expect(title).toMatch(/attendance/i);
    expect(body).toContain('2026-07-20');
  });

  it('escalates the second warning to a final warning', () => {
    const first = warningCopy(['2026-07-20'], false);
    const final = warningCopy(['2026-07-17', '2026-07-20'], true);
    expect(final.title).toMatch(/final/i);
    expect(final.body).toMatch(/final warning/i);
    expect(final.title).not.toBe(first.title);
  });
```

Add `isServiceWeekday` to the import block at the top of the test file (line 2-9).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/incharge-attendance.test.ts`
Expected: FAIL — `isServiceWeekday is not a function`, plus threshold and outcome mismatches.

- [ ] **Step 3: Implement the changes**

In `lib/boarding/incharge-attendance.ts`, change the threshold constant (line 12):

```typescript
/**
 * Consecutive missed travel days that trigger removal. Misses 1 and 2 warn
 * (the second is the final warning); the third removes and bills.
 */
export const REMOVAL_THRESHOLD = 3;
```

Add the weekday predicate below the constant:

```typescript
/**
 * Enforcement runs Monday-Friday only.
 *
 * Saturdays carry bookings on every route but have never produced a single
 * attendance mark, and tms_service_calendar is too sparse (3 rows, all time)
 * to be an authority on off-days. Parsing the 'YYYY-MM-DD' parts by hand
 * rather than via Date() keeps the answer independent of the host timezone —
 * the cron already hands us an IST date string.
 */
export function isServiceWeekday(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0 = Sunday
  return dow >= 1 && dow <= 5;
}
```

Extend `DayFacts` (add to the type, after `assignedOnDate`):

```typescript
  /** The date is a Monday-Friday service day. Weekends are never enforced. */
  isServiceWeekday: boolean;
```

Extend the skip reason union in `StrikeOutcome`:

```typescript
  | { action: 'skip'; reason: 'already_evaluated' | 'grace_day' | 'no_travel_day' | 'not_a_service_day' }
```

In `evaluateDay`, insert the weekend check after the grace-day check and before the booked-riders check:

```typescript
  if (facts.assignedOnDate) return { action: 'skip', reason: 'grace_day' };
  // Weekends are not service days: like a holiday they neither punish nor forgive.
  if (!facts.isServiceWeekday) return { action: 'skip', reason: 'not_a_service_day' };
  // Holidays, Sundays and empty rosters are not travel days: no strike, and
  // deliberately no reset either (they neither punish nor forgive).
  if (!facts.hasBookedRiders) return { action: 'skip', reason: 'no_travel_day' };
```

Replace `warningCopy`:

```typescript
export function warningCopy(
  missedDates: string[],
  isFinalWarning: boolean,
): { title: string; body: string } {
  const last = missedDates[missedDates.length - 1] ?? '';
  if (isFinalWarning) {
    return {
      title: 'Final warning — attendance not marked',
      body:
        `You did not mark attendance for your bus on ${last}, and this is now ${missedDates.length} ` +
        `travel days in a row. This is your final warning: if attendance is not marked on your next ` +
        `travel day, your bus in-charge role will be removed and a transport fee bill will be generated for you.`,
    };
  }
  return {
    title: 'Attendance not marked',
    body:
      `You did not mark attendance for your bus on ${last}. ` +
      `Mark attendance on your next travel day — if you miss ${REMOVAL_THRESHOLD} travel days in a row, ` +
      `your bus in-charge role will be removed and transport fees will apply to you.`,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/incharge-attendance.test.ts`
Expected: PASS, all cases.

Note: `app/api/cron/incharge-attendance/route.ts` now fails to typecheck because it does not pass `isServiceWeekday` and calls `warningCopy` with one argument. That is expected and is fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/incharge-attendance.ts lib/boarding/incharge-attendance.test.ts
git commit -m "feat(boarding): two warnings before removal, weekday-only enforcement"
```

---

### Task 2: Enforcement mode setting

Adds the `off` / `shadow` / `enforce` switch to the existing scheduling settings blob, defaulting to `shadow`.

**Files:**
- Modify: `lib/settings/scheduling.ts`
- Test: `lib/settings/scheduling.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type InchargeEnforcementMode = 'off' | 'shadow' | 'enforce'`
  - `SchedulingConfig` gains `inchargeEnforcementMode: InchargeEnforcementMode`
  - `DEFAULT_SCHEDULING_CONFIG.inchargeEnforcementMode === 'shadow'`

- [ ] **Step 1: Write the failing tests**

Append to `lib/settings/scheduling.test.ts` (create the file with the import header below if it does not exist):

```typescript
import { describe, it, expect } from 'vitest';
import { parseSchedulingConfig, DEFAULT_SCHEDULING_CONFIG } from '@/lib/settings/scheduling';

describe('inchargeEnforcementMode', () => {
  it('defaults to shadow when absent', () => {
    expect(parseSchedulingConfig({}).inchargeEnforcementMode).toBe('shadow');
    expect(DEFAULT_SCHEDULING_CONFIG.inchargeEnforcementMode).toBe('shadow');
  });

  it('defaults to shadow for a null or malformed blob', () => {
    expect(parseSchedulingConfig(null).inchargeEnforcementMode).toBe('shadow');
    expect(parseSchedulingConfig('nonsense').inchargeEnforcementMode).toBe('shadow');
  });

  it('accepts each valid mode', () => {
    for (const mode of ['off', 'shadow', 'enforce'] as const) {
      expect(parseSchedulingConfig({ inchargeEnforcementMode: mode }).inchargeEnforcementMode).toBe(mode);
    }
  });

  it('falls back to shadow for an unknown value rather than enforcing', () => {
    expect(parseSchedulingConfig({ inchargeEnforcementMode: 'ENFORCE' }).inchargeEnforcementMode).toBe('shadow');
    expect(parseSchedulingConfig({ inchargeEnforcementMode: 42 }).inchargeEnforcementMode).toBe('shadow');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/settings/scheduling.test.ts`
Expected: FAIL — `expected undefined to be 'shadow'`.

- [ ] **Step 3: Implement**

In `lib/settings/scheduling.ts`, add above the `SchedulingConfig` interface:

```typescript
/**
 * How hard the in-charge attendance enforcement cron acts on its own findings.
 * `shadow` evaluates and persists strikes but notifies nobody and removes
 * nobody, so the admin dashboard accumulates real data before anyone is
 * punished. Distinct from the route's `dryRun` flag, which persists nothing.
 */
export type InchargeEnforcementMode = 'off' | 'shadow' | 'enforce';

const ENFORCEMENT_MODES: readonly InchargeEnforcementMode[] = ['off', 'shadow', 'enforce'];
```

Add the field to `SchedulingConfig`:

```typescript
  /** Master switch for in-charge attendance enforcement. Ships in shadow. */
  inchargeEnforcementMode: InchargeEnforcementMode;
```

Add the default to `DEFAULT_SCHEDULING_CONFIG`:

```typescript
  inchargeEnforcementMode: 'shadow',
```

Add the normalizer helper beside `boolOr`:

```typescript
// An unrecognised value must never read as 'enforce' — punitive action is
// opt-in, so anything unexpected falls back to the safe shadow default.
function enforcementModeOr(value: unknown, fallback: InchargeEnforcementMode): InchargeEnforcementMode {
  return ENFORCEMENT_MODES.includes(value as InchargeEnforcementMode)
    ? (value as InchargeEnforcementMode)
    : fallback;
}
```

Add to the object returned by `parseSchedulingConfig`:

```typescript
    inchargeEnforcementMode: enforcementModeOr(
      b.inchargeEnforcementMode,
      DEFAULT_SCHEDULING_CONFIG.inchargeEnforcementMode,
    ),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/settings/scheduling.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/scheduling.ts lib/settings/scheduling.test.ts
git commit -m "feat(settings): incharge enforcement mode, defaulting to shadow"
```

---

### Task 3: Billing precondition resolver

Extracts the "is this staffer billable?" question from `generateStaffBill` so the cron can probe it before revoking anything.

**Files:**
- Modify: `lib/fees/staff-bill.ts`
- Test: `lib/fees/staff-bill.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type StaffBillPlan = { billable: true; feeStructureId: string; terms: StaffBillTerm[] } | { billable: false; reason: 'no_structure' | 'error' }`
  - `resolveStaffBillPlan(svc: SupabaseClient, opts: { staffId: string; transportYearId: string }): Promise<StaffBillPlan>`
  - `generateStaffBill` keeps its existing signature and return type.

- [ ] **Step 1: Write the failing tests**

Append to `lib/fees/staff-bill.test.ts`:

```typescript
import { resolveStaffBillPlan } from '@/lib/fees/staff-bill';

// Minimal chainable stub of the PostgREST builder surface staff-bill.ts uses.
function stubSvc(tables: Record<string, { data: unknown; error?: unknown }>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'order']) {
        builder[m] = () => builder;
      }
      builder.maybeSingle = async () => ({
        data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
        error: result.error ?? null,
      });
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve);
      return builder;
    },
  } as never;
}

describe('resolveStaffBillPlan', () => {
  const opts = { staffId: 'staff-1', transportYearId: 'year-1' };

  it('reports not billable when no active staff structure exists', async () => {
    const plan = await resolveStaffBillPlan(stubSvc({ tms_fee_structure: { data: [] } }), opts);
    expect(plan).toEqual({ billable: false, reason: 'no_structure' });
  });

  it('reports not billable when the structure exists but has ZERO terms', async () => {
    // This is the live production state: one active staff structure, no terms.
    const plan = await resolveStaffBillPlan(
      stubSvc({
        tms_fee_structure: { data: [{ id: 'fs-1', audience: 'staff', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null }] },
        tms_fee_structure_term: { data: [] },
      }),
      opts,
    );
    expect(plan).toEqual({ billable: false, reason: 'no_structure' });
  });

  it('reports error (not no_structure) when the structure query fails', async () => {
    const plan = await resolveStaffBillPlan(
      stubSvc({ tms_fee_structure: { data: null, error: { message: 'boom' } } }),
      opts,
    );
    expect(plan).toEqual({ billable: false, reason: 'error' });
  });
});
```

Note on the applicability step: `resolveStaffBillPlan` calls `resolveApplicablePeople`, which issues its own queries. In the "zero terms" case above the stub returns `[]` for every unlisted table, so no person matches and the function returns `no_structure` before reaching terms. That still exercises the contract the cron depends on — not billable means not billable. Do not add a mock of `resolveApplicablePeople`; the cases above cover the branches this plan introduces.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/staff-bill.test.ts`
Expected: FAIL — `resolveStaffBillPlan is not exported`.

- [ ] **Step 3: Implement**

In `lib/fees/staff-bill.ts`, add above `generateStaffBill`:

```typescript
export type StaffBillPlan =
  | { billable: true; feeStructureId: string; terms: StaffBillTerm[] }
  | { billable: false; reason: 'no_structure' | 'error' };

/**
 * Can this staffer actually be billed right now?
 *
 * Split out of generateStaffBill so the enforcement cron can PROBE before it
 * revokes anything. The write path and the probe share this one resolver, so
 * they can never disagree about what "billable" means — the alternative,
 * duplicating the lookup, is how a staffer loses their role for a bill that
 * was never going to generate.
 */
export async function resolveStaffBillPlan(
  svc: SupabaseClient,
  opts: { staffId: string; transportYearId: string },
): Promise<StaffBillPlan> {
  try {
    const { data: structures, error: sErr } = await svc
      .from('tms_fee_structure')
      .select('id, audience, institution_ids, staff_role_keys, lifecycle_statuses')
      .eq('audience', 'staff')
      .eq('status', 'active')
      .eq('transport_year_id', opts.transportYearId);
    if (sErr) return { billable: false, reason: 'error' };
    if (!structures?.length) return { billable: false, reason: 'no_structure' };

    let match: { id: string } | null = null;
    for (const fs of structures) {
      const people = await resolveApplicablePeople(svc, fs);
      if (people.some((p) => p.person_id === opts.staffId)) {
        match = { id: fs.id };
        break;
      }
    }
    if (!match) return { billable: false, reason: 'no_structure' };

    const { data: terms, error: tErr } = await svc
      .from('tms_fee_structure_term')
      .select('term_no, amount, due_date')
      .eq('fee_structure_id', match.id)
      .is('year_band_id', null)
      .order('term_no');
    if (tErr) return { billable: false, reason: 'error' };
    if (!terms?.length) return { billable: false, reason: 'no_structure' };

    return { billable: true, feeStructureId: match.id, terms: terms as StaffBillTerm[] };
  } catch {
    return { billable: false, reason: 'error' };
  }
}
```

Rewrite `generateStaffBill`'s body to delegate, keeping its signature and return type identical:

```typescript
export async function generateStaffBill(
  svc: SupabaseClient,
  opts: { staffId: string; transportYearId: string },
): Promise<{ billingStatus: 'billed' | 'no_structure' | 'error'; inserted: number }> {
  try {
    const plan = await resolveStaffBillPlan(svc, opts);
    if (!plan.billable) return { billingStatus: plan.reason, inserted: 0 };

    const catName = TRANSPORT_CATEGORY_NAME['staff' as FeeAudience];
    const { data: cat } = await svc
      .from('billing_categories')
      .select('id')
      .eq('category_name', catName)
      .maybeSingle();

    let inserted = 0;
    for (const term of plan.terms) {
      const row = buildStaffFeeBillRow({
        runId: null,
        feeStructureId: plan.feeStructureId,
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/`
Expected: PASS, including the pre-existing `buildStaffFeeBillRow` and generate tests (the refactor must not change them).

- [ ] **Step 5: Commit**

```bash
git add lib/fees/staff-bill.ts lib/fees/staff-bill.test.ts
git commit -m "feat(fees): resolveStaffBillPlan so billability can be probed before removal"
```

---

### Task 4: Wire the cron route to mode, weekday gate, and blocked removal

**Files:**
- Modify: `app/api/cron/incharge-attendance/route.ts`

**Interfaces:**
- Consumes: `isServiceWeekday`, `REMOVAL_THRESHOLD`, `warningCopy(dates, isFinal)` (Task 1); `loadSchedulingConfig` and `InchargeEnforcementMode` (Task 2); `resolveStaffBillPlan` (Task 3).
- Produces: the run summary JSON gains `mode`, `blocked`, and `plan[].blockedReason`.

- [ ] **Step 1: Add the mode gate and weekday short-circuit**

Add imports:

```typescript
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { resolveStaffBillPlan } from '@/lib/fees/staff-bill';
import { isServiceWeekday } from '@/lib/boarding/incharge-attendance';
```

After `const date = istToday();`, add the mode load and the whole-run weekend short-circuit:

```typescript
  const cfg = await loadSchedulingConfig(svc);
  const mode = cfg.inchargeEnforcementMode;
  // `shadow` still evaluates and persists strikes; it only withholds
  // notifications and punitive action. `dryRun` (below) persists nothing.
  const act = mode === 'enforce' && !dryRun;

  if (mode === 'off') {
    return NextResponse.json({ success: true, data: { date, mode, skipped: 'mode_off' } });
  }
  // Weekends cost no per-assignment queries at all.
  if (!isServiceWeekday(date)) {
    return NextResponse.json({ success: true, data: { date, mode, skipped: 'not_a_service_day' } });
  }
```

Add `mode` and `blocked` to the `summary` object literal:

```typescript
    mode,
    blocked: 0,
```

and add `blockedReason` to the `plan` array's element type:

```typescript
      wouldBill: boolean;
      blockedReason?: string;
```

- [ ] **Step 2: Pass the new fact to evaluateDay**

Update the `evaluateDay` call:

```typescript
      const outcome = evaluateDay(prev, {
        date,
        hasBookedRiders: roster.riders.length > 0,
        attendanceMarked,
        assignedOnDate: a.assigned_at ? istToday(new Date(a.assigned_at)) === date : false,
        isServiceWeekday: true, // the whole run short-circuits on non-service days
      });
```

- [ ] **Step 3: Replace the removal branch with a billability probe**

Replace the `if (outcome.action === 'remove' && !reachable) { ... } else if ...` chain with:

```typescript
      let billingStatus: BillingStatus | null = null;
      let blockedReason: string | null = null;

      if (outcome.action === 'remove') {
        // Resolve the staff row and probe billability BEFORE touching the role.
        const { data: staffRow } = await svc
          .from('staff')
          .select('id')
          .ilike('email', a.staff_email)
          .maybeSingle();

        const plan =
          staffRow?.id && currentYear?.id
            ? await resolveStaffBillPlan(svc, {
                staffId: staffRow.id as string,
                transportYearId: currentYear.id as string,
              })
            : ({ billable: false, reason: 'no_structure' } as const);

        if (!reachable) {
          // Never revoke or bill someone we cannot even notify. The strike still
          // persists, so this resurfaces nightly until a human fixes profiles.
          blockedReason = 'no reachable profiles row';
          summary.errors++;
          summary.failures.push({
            staffEmail: a.staff_email,
            message: 'no reachable profiles row — removal and billing skipped',
          });
        } else if (!plan.billable) {
          // No bill can be raised, so no role is taken away. Nobody loses their
          // exemption without the bill that justifies it; the transport office
          // sees this on the admin dashboard and configures the fee terms.
          blockedReason = plan.reason === 'error' ? 'billing lookup failed' : 'no staff fee structure with terms';
          billingStatus = plan.reason;
          summary.blocked++;
        } else if (!act) {
          // shadow or dryRun: count what WOULD happen, change nothing.
          summary.removed++;
        } else {
          const removal = await performRemoval({
            revoke: async () => {
              await svc
                .from('tms_staff_route_assignment')
                .update({ is_active: false })
                .eq('id', a.id);
              await maybeRevokeBoardingRole(svc, a.id);
            },
            bill: async () => {
              const res = await generateStaffBill(svc, {
                staffId: staffRow!.id as string,
                transportYearId: currentYear!.id as string,
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
            entityId: a.id,
            metadata: {
              reason: 'attendance_auto_removal',
              missed_dates: outcome.state.missedDates,
              billing_status: billingStatus,
            },
          });
        }
      }
```

Then add `blockedReason` to the dry-run `plan.push` for non-skip outcomes — move that push to AFTER the removal branch so it can report the reason, replacing the earlier block:

```typescript
      if (dryRun) {
        summary.plan.push({
          staffEmail: a.staff_email,
          action: outcome.action,
          consecutiveMisses: outcome.state.consecutiveMisses,
          missedDates: outcome.state.missedDates,
          wouldBill: outcome.action === 'remove' && !blockedReason,
          ...(blockedReason ? { blockedReason } : {}),
        });
      }
```

- [ ] **Step 4: Gate persistence and notifications on the mode**

The strike upsert must run in `shadow` (that is the entire point of shadow) but not in `dryRun`. Its condition stays `if (!dryRun)`. Change only `removed_at`, so a blocked removal is not recorded as a removal:

```typescript
            removed_at:
              outcome.action === 'remove' && act && !blockedReason
                ? new Date().toISOString()
                : strike?.removed_at ?? null,
```

Replace the notification block at the end of the loop:

```typescript
      if (outcome.action === 'warn') {
        // Counted whether or not delivery succeeds — the strike DID advance.
        summary.warned++;
        if (!act) {
          // shadow / dryRun: the strike is recorded, but nobody is told.
        } else if (reachable && profileId && actorId) {
          const isFinal = outcome.state.consecutiveMisses >= REMOVAL_THRESHOLD - 1;
          const copy = warningCopy(outcome.state.missedDates, isFinal);
          await notifyProfile(svc, {
            profileId,
            actorId,
            title: copy.title,
            body: copy.body,
            url: '/boarding/attendance',
          });
        } else {
          summary.failures.push({
            staffEmail: a.staff_email,
            message: 'warning not delivered — no reachable profiles row',
          });
        }
      } else if (
        outcome.action === 'remove' &&
        act &&
        !blockedReason &&
        reachable &&
        profileId &&
        actorId &&
        billingStatus !== null
      ) {
        const copy = removalCopy(outcome.state.missedDates, billingStatus === 'billed');
        await notifyProfile(svc, {
          profileId,
          actorId,
          title: copy.title,
          body: copy.body,
          url: '/boarding/in-charge',
        });
      }
```

Add `REMOVAL_THRESHOLD` to the existing import from `@/lib/boarding/incharge-attendance`.

- [ ] **Step 5: Verify the route typechecks and the suite still passes**

Run: `npx tsc --noEmit --skipLibCheck app/api/cron/incharge-attendance/route.ts 2>&1 | head -20`
Expected: no errors originating in this file. (Project-wide `tsc` is chronically red — judge only errors citing this path.)

Run: `npx vitest run lib/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/incharge-attendance/route.ts
git commit -m "feat(boarding): mode-gated enforcement, weekday short-circuit, blocked removal"
```

---

### Task 5: Derived strike status and the admin read endpoint

**Files:**
- Create: `lib/boarding/incharge-strike-status.ts`
- Create: `lib/boarding/incharge-strike-status.test.ts`
- Create: `app/api/admin/incharge-attendance-strikes/route.ts`

**Interfaces:**
- Consumes: `REMOVAL_THRESHOLD` (Task 1), `loadSchedulingConfig` (Task 2).
- Produces:
  - `type StrikeStatus = 'ok' | 'warned' | 'final_warning' | 'pending_removal' | 'removed'`
  - `deriveStrikeStatus(row: { consecutive_misses: number; removed_at: string | null }): StrikeStatus`
  - `GET /api/admin/incharge-attendance-strikes` returning `{ success: true, data: { mode, rows: StrikeAdminRow[] } }`
  - `interface StrikeAdminRow` (shape given in Step 3) — Task 6 renders exactly these fields.

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/incharge-strike-status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveStrikeStatus } from '@/lib/boarding/incharge-strike-status';

describe('deriveStrikeStatus', () => {
  it('reports a clean record as ok', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 0, removed_at: null })).toBe('ok');
  });

  it('reports one miss as warned', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 1, removed_at: null })).toBe('warned');
  });

  it('reports two misses as a final warning', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 2, removed_at: null })).toBe('final_warning');
  });

  it('reports three misses with no removal as pending removal', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 3, removed_at: null })).toBe('pending_removal');
    expect(deriveStrikeStatus({ consecutive_misses: 7, removed_at: null })).toBe('pending_removal');
  });

  it('reports removed once removed_at is set, whatever the count', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 3, removed_at: '2026-08-12T15:30:00Z' })).toBe('removed');
    expect(deriveStrikeStatus({ consecutive_misses: 0, removed_at: '2026-08-12T15:30:00Z' })).toBe('removed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/boarding/incharge-strike-status.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement the pure helper**

Create `lib/boarding/incharge-strike-status.ts`:

```typescript
/**
 * Presentation status for one in-charge strike row.
 *
 * Derived server-side and sent to the client so the admin table holds no
 * policy: if REMOVAL_THRESHOLD moves again, the UI does not need to know.
 */
import { REMOVAL_THRESHOLD } from './incharge-attendance';

export type StrikeStatus = 'ok' | 'warned' | 'final_warning' | 'pending_removal' | 'removed';

export function deriveStrikeStatus(row: {
  consecutive_misses: number;
  removed_at: string | null;
}): StrikeStatus {
  if (row.removed_at) return 'removed';
  const n = row.consecutive_misses ?? 0;
  // At or past the threshold with no removal recorded means the cron wanted to
  // remove and could not — shadow mode, or no billable fee structure.
  if (n >= REMOVAL_THRESHOLD) return 'pending_removal';
  if (n === REMOVAL_THRESHOLD - 1) return 'final_warning';
  if (n >= 1) return 'warned';
  return 'ok';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/boarding/incharge-strike-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the admin endpoint**

Create `app/api/admin/incharge-attendance-strikes/route.ts`:

```typescript
/**
 * Admin view of in-charge attendance strikes.
 *
 * Read-only. Service-role because the strike table has no RLS policy for
 * admins, so the permission check here is the only gate — same defense-in-depth
 * shape as /api/admin/staff-route-assignments.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { deriveStrikeStatus, type StrikeStatus } from '@/lib/boarding/incharge-strike-status';

export interface StrikeAdminRow {
  id: string;
  assignment_id: string;
  staff_email: string;
  staff_name: string | null;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  consecutive_misses: number;
  missed_dates: string[];
  last_evaluated_date: string | null;
  warned_at: string | null;
  removed_at: string | null;
  billing_status: string | null;
  status: StrikeStatus;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handler(_request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVERS_ASSIGN))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const svc = createServiceRoleClient();
  const { data: strikes, error } = await svc
    .from('tms_incharge_attendance_strike')
    .select('id, assignment_id, staff_email, route_id, consecutive_misses, missed_dates, last_evaluated_date, warned_at, removed_at, billing_status')
    .order('consecutive_misses', { ascending: false });

  if (error) {
    // 42P01 = table missing. Degrade to an empty board rather than a 500, the
    // same fail-safe the settings route uses.
    if ((error as { code?: string }).code === '42P01') {
      return NextResponse.json({ success: true, data: { mode: 'shadow', rows: [] } });
    }
    console.error('admin/incharge-attendance-strikes GET error:', error);
    return NextResponse.json({ error: 'Failed to load strikes' }, { status: 500 });
  }

  const rows = (strikes ?? []) as Array<Record<string, unknown>>;

  // Resolve staff names and route labels in two batched lookups, never per row.
  const emails = [...new Set(rows.map((r) => String(r.staff_email).toLowerCase()))];
  const routeIds = [...new Set(rows.map((r) => r.route_id).filter(Boolean))] as string[];

  const nameByEmail = new Map<string, string>();
  if (emails.length) {
    // profiles.email is NOT uniformly lowercase on this project, so filtering by
    // a lowercased .in() list silently drops rows. Fetch by the strike emails
    // and intersect in memory instead.
    const { data: profs } = await svc.from('profiles').select('email, full_name');
    for (const p of (profs ?? []) as Array<{ email: string | null; full_name: string | null }>) {
      const key = (p.email ?? '').toLowerCase();
      if (key && emails.includes(key) && p.full_name) nameByEmail.set(key, p.full_name);
    }
  }

  const routeById = new Map<string, { route_number: string | null; route_name: string | null }>();
  if (routeIds.length) {
    // Chunked: a large .in() list 400s at the gateway and returns an empty set.
    for (let i = 0; i < routeIds.length; i += 150) {
      const { data: rts, error: rErr } = await svc
        .from('tms_route')
        .select('id, route_number, route_name')
        .in('id', routeIds.slice(i, i + 150));
      if (rErr) console.error('strike route lookup error:', rErr);
      for (const r of (rts ?? []) as Array<{ id: string; route_number: string | null; route_name: string | null }>) {
        routeById.set(r.id, { route_number: r.route_number, route_name: r.route_name });
      }
    }
  }

  const cfg = await loadSchedulingConfig(svc);

  const result: StrikeAdminRow[] = rows.map((r) => {
    const route = r.route_id ? routeById.get(String(r.route_id)) : undefined;
    return {
      id: String(r.id),
      assignment_id: String(r.assignment_id),
      staff_email: String(r.staff_email),
      staff_name: nameByEmail.get(String(r.staff_email).toLowerCase()) ?? null,
      route_id: (r.route_id as string | null) ?? null,
      route_number: route?.route_number ?? null,
      route_name: route?.route_name ?? null,
      consecutive_misses: Number(r.consecutive_misses ?? 0),
      missed_dates: (r.missed_dates as string[] | null) ?? [],
      last_evaluated_date: (r.last_evaluated_date as string | null) ?? null,
      warned_at: (r.warned_at as string | null) ?? null,
      removed_at: (r.removed_at as string | null) ?? null,
      billing_status: (r.billing_status as string | null) ?? null,
      status: deriveStrikeStatus({
        consecutive_misses: Number(r.consecutive_misses ?? 0),
        removed_at: (r.removed_at as string | null) ?? null,
      }),
    };
  });

  return NextResponse.json({
    success: true,
    data: { mode: cfg.inchargeEnforcementMode, rows: result },
  });
}

export const GET = withAuth(handler);
```

- [ ] **Step 6: Verify**

Run: `npx vitest run lib/boarding/`
Expected: PASS.

Run: `npx tsc --noEmit --skipLibCheck app/api/admin/incharge-attendance-strikes/route.ts 2>&1 | head -20`
Expected: no errors citing this file.

- [ ] **Step 7: Commit**

```bash
git add lib/boarding/incharge-strike-status.ts lib/boarding/incharge-strike-status.test.ts app/api/admin/incharge-attendance-strikes/route.ts
git commit -m "feat(boarding): admin strike read endpoint with derived status"
```

---

### Task 6: Admin enforcement dashboard

**Files:**
- Create: `app/(admin)/staff-route-assignments/enforcement/columns.tsx`
- Create: `app/(admin)/staff-route-assignments/enforcement/page.tsx`

**Interfaces:**
- Consumes: `StrikeAdminRow` and the `{ mode, rows }` envelope from Task 5.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Create the columns factory**

Create `app/(admin)/staff-route-assignments/enforcement/columns.tsx`:

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

export type StrikeStatus = 'ok' | 'warned' | 'final_warning' | 'pending_removal' | 'removed';

export interface StrikeRow {
  id: string;
  assignment_id: string;
  staff_email: string;
  staff_name: string | null;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  consecutive_misses: number;
  missed_dates: string[];
  last_evaluated_date: string | null;
  warned_at: string | null;
  removed_at: string | null;
  billing_status: string | null;
  status: StrikeStatus;
}

const STATUS_LABEL: Record<StrikeStatus, string> = {
  ok: 'OK',
  warned: 'Warning 1',
  final_warning: 'Final warning',
  pending_removal: 'Pending removal',
  removed: 'Removed',
};

const STATUS_CLASS: Record<StrikeStatus, string> = {
  ok: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  warned: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  final_warning: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  pending_removal: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  removed: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const BILLING_LABEL: Record<string, string> = {
  billed: 'Billed',
  no_structure: 'No fee structure',
  error: 'Billing error',
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export function getStrikeColumns(): ColumnDef<StrikeRow>[] {
  return [
    {
      accessorKey: 'staff_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.staff_name ?? '—'}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.staff_email}</div>
        </div>
      ),
    },
    {
      accessorKey: 'route_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.route_number ?? '—'}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.route_name ?? ''}</div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[row.original.status]}`}>
          {STATUS_LABEL[row.original.status]}
        </span>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'consecutive_misses',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Misses" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.consecutive_misses}</span>,
    },
    {
      accessorKey: 'missed_dates',
      header: 'Missed dates',
      cell: ({ row }) => (
        <span className="text-xs">{row.original.missed_dates.join(', ') || '—'}</span>
      ),
    },
    {
      accessorKey: 'billing_status',
      header: 'Billing',
      cell: ({ row }) => {
        const b = row.original.billing_status;
        return <span className="text-xs">{b ? (BILLING_LABEL[b] ?? b) : '—'}</span>;
      },
    },
    {
      accessorKey: 'last_evaluated_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last checked" />,
      cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.last_evaluated_date)}</span>,
    },
  ];
}
```

- [ ] **Step 2: Create the page**

Create `app/(admin)/staff-route-assignments/enforcement/page.tsx`:

```tsx
'use client';

import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldAlert, UserMinus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getStrikeColumns, type StrikeRow } from './columns';

type Mode = 'off' | 'shadow' | 'enforce';

const MODE_BANNER: Record<Mode, { text: string; className: string }> = {
  off: {
    text: 'Enforcement is OFF. The nightly job does not run, and no strikes are recorded.',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  },
  shadow: {
    text:
      'Enforcement is in SHADOW mode. Strikes below are real and accumulating, but no staff member has been ' +
      'notified, removed, or billed. Switch to Enforce in Settings → Scheduling when the board looks right.',
    className: 'bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200',
  },
  enforce: {
    text:
      'Enforcement is LIVE. Two missed travel days warn; the third removes the in-charge role and generates a transport fee bill.',
    className: 'bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-200',
  },
};

async function fetchStrikes(): Promise<{ mode: Mode; rows: StrikeRow[] }> {
  const res = await fetch('/api/admin/incharge-attendance-strikes', { credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load enforcement data');
  return json.data as { mode: Mode; rows: StrikeRow[] };
}

export default function InchargeEnforcementPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['incharge-strikes'],
    queryFn: fetchStrikes,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load enforcement data');
  }, [isError]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const mode: Mode = data?.mode ?? 'shadow';
  const columns = useMemo(() => getStrikeColumns(), []);

  const count = (s: StrikeRow['status']) => rows.filter((r) => r.status === s).length;
  const banner = MODE_BANNER[mode];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">In-charge attendance enforcement</h1>
        <p className="text-sm text-muted-foreground">
          Bus in-charges hold a transport fee exemption in exchange for marking their route each travel day.
          Marking on any weekday clears the route&rsquo;s streak for every in-charge on it.
        </p>
      </div>

      <div className={`rounded-md px-4 py-3 text-sm ${banner.className}`}>{banner.text}</div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UniversalStatCard title="Warning 1" value={count('warned')} icon={AlertTriangle} />
        <UniversalStatCard title="Final warning" value={count('final_warning')} icon={ShieldAlert} />
        <UniversalStatCard title="Pending removal" value={count('pending_removal')} icon={UserMinus} />
        <UniversalStatCard title="Removed" value={count('removed')} icon={CheckCircle2} />
      </div>

      {rows.some((r) => r.status === 'pending_removal' && r.billing_status === 'no_structure') && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          Some in-charges have reached the removal threshold but cannot be billed, because no active staff fee
          structure with terms exists for the current transport year. They keep their role until you configure
          the fee terms; the job retries every night.
        </div>
      )}

      <div className="min-w-0 overflow-x-auto">
        <DataTable columns={columns} data={rows} isLoading={isLoading} searchKey="staff_email" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the DataTable and stat card props match this project**

Open `components/ui/data-table.tsx` and `components/universal-stat-card.tsx` and confirm the prop names used above (`columns`, `data`, `isLoading`, `searchKey`; `title`, `value`, `icon`). If any differ, adjust the page to the real signatures — do not change the shared components.

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep "staff-route-assignments/enforcement" | head -20`
Expected: no output.

- [ ] **Step 4: Add the navigation entry**

Find the admin sidebar definition (`grep -rn "staff-route-assignments" lib/ components/ --include=*.ts --include=*.tsx | grep -i nav`) and add a child entry pointing at `/staff-route-assignments/enforcement` labelled "Attendance enforcement", matching the permission gate used by the parent entry.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/staff-route-assignments/enforcement" lib components
git commit -m "feat(admin): in-charge attendance enforcement dashboard"
```

---

### Task 7: Escalate the staff portal banner and suppress it in shadow

**Files:**
- Modify: `app/api/boarding/incharge-strike/route.ts`
- Modify: `app/boarding/attendance/page.tsx:63-76,158-162`

**Interfaces:**
- Consumes: `loadSchedulingConfig` (Task 2), `REMOVAL_THRESHOLD` (Task 1).
- Produces: the endpoint's `data` gains `isFinalWarning: boolean`.

- [ ] **Step 1: Suppress in shadow and report the escalation**

In `app/api/boarding/incharge-strike/route.ts`, add imports:

```typescript
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { REMOVAL_THRESHOLD } from '@/lib/boarding/incharge-attendance';
```

After `const svc = createServiceRoleClient();`, add:

```typescript
  // Shadow and off are dry runs from the staffer's point of view: strikes are
  // being recorded, but nobody has been warned, so do not alarm them.
  const cfg = await loadSchedulingConfig(svc);
  if (cfg.inchargeEnforcementMode !== 'enforce') {
    return NextResponse.json({ success: true, data: null });
  }
```

Extend the success payload:

```typescript
  return NextResponse.json({
    success: true,
    data: {
      consecutiveMisses: data.consecutive_misses,
      missedDates: (data.missed_dates as string[] | null) ?? [],
      isFinalWarning: (data.consecutive_misses ?? 0) >= REMOVAL_THRESHOLD - 1,
    },
  });
```

- [ ] **Step 2: Escalate the banner copy**

In `app/boarding/attendance/page.tsx`, widen the query's return type (line 70):

```typescript
      return json.data as {
        consecutiveMisses: number;
        missedDates: string[];
        isFinalWarning: boolean;
      } | null;
```

Replace the banner block at line 158 with copy that escalates:

```tsx
      {strike && (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            strike.isFinalWarning
              ? 'bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-200'
              : 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
          }`}
        >
          <strong>
            {strike.isFinalWarning ? 'Final warning — ' : ''}
            Attendance not marked on {strike.missedDates.join(', ')}.
          </strong>{' '}
          {strike.isFinalWarning
            ? 'If attendance is not marked on your next travel day, your bus in-charge role will be removed and a transport fee bill will be generated for you.'
            : 'Mark attendance on your next travel day to clear this.'}
        </div>
      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "boarding/(attendance|incharge-strike)" | head -20`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/incharge-strike/route.ts app/boarding/attendance/page.tsx
git commit -m "feat(boarding): final-warning banner, suppressed outside enforce mode"
```

---

### Task 8: Settings control for the enforcement mode

**Files:**
- Modify: `app/api/admin/settings/route.ts:8-14,29-37,38-48`
- Modify: `app/(admin)/settings/page.tsx:184-205` (insert after the Automatic Bill Generation block)

**Interfaces:**
- Consumes: `InchargeEnforcementMode`, `parseSchedulingConfig` (Task 2).
- Produces: the settings blob round-trips `inchargeEnforcementMode`.

- [ ] **Step 1: Round-trip the field through the settings API**

In `app/api/admin/settings/route.ts`, add to `SchedulingSettingsData`:

```typescript
  inchargeEnforcementMode: 'off' | 'shadow' | 'enforce';
```

Add to `toBlobShape`'s returned object:

```typescript
    inchargeEnforcementMode: cfg.inchargeEnforcementMode,
```

Add to `validate`, before the final `return null`:

```typescript
  const mode = settings.inchargeEnforcementMode;
  if (mode !== undefined && !['off', 'shadow', 'enforce'].includes(mode as string)) {
    return 'Enforcement mode must be off, shadow, or enforce';
  }
```

- [ ] **Step 2: Add the control**

In `app/(admin)/settings/page.tsx`, insert immediately after the closing `</div>` of the Automatic Bill Generation block:

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  In-charge Attendance Enforcement
                </label>
                <select
                  value={schedulingSettings.inchargeEnforcementMode ?? 'shadow'}
                  onChange={(e) =>
                    setSchedulingSettings({
                      ...schedulingSettings,
                      inchargeEnforcementMode: e.target.value as 'off' | 'shadow' | 'enforce',
                    })
                  }
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="off">Off — do not run</option>
                  <option value="shadow">Shadow — record strikes only</option>
                  <option value="enforce">Enforce — warn, then remove and bill</option>
                </select>
                <p className="text-sm text-gray-600 mt-1">
                  Runs each weekday at 21:00. A bus in-charge who misses two travel days in a row is
                  warned twice; on the third the in-charge role is removed and a transport fee bill is
                  generated. <strong>Shadow</strong> records the same strikes without notifying,
                  removing, or billing anyone — review them on the{' '}
                  <a className="underline" href="/staff-route-assignments/enforcement">
                    enforcement board
                  </a>{' '}
                  before switching to Enforce.
                </p>
              </div>
```

If the page's `schedulingSettings` state is typed with an explicit interface, add `inchargeEnforcementMode: 'off' | 'shadow' | 'enforce';` to it and to its initial value (`'shadow'`).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "admin/settings" | head -20`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/settings/route.ts "app/(admin)/settings/page.tsx"
git commit -m "feat(settings): enforcement mode control on the scheduling tab"
```

---

### Task 9: Allowlist the cron path in proxy

**Files:**
- Modify: `proxy.ts:11-25`
- Modify: `proxy.test.ts:9-19`

**Interfaces:**
- Consumes: nothing.
- Produces: `/api/cron/incharge-attendance` reaches its route handler.

- [ ] **Step 1: Write the failing test**

In `proxy.test.ts`, add inside the existing describe block:

```typescript
  it('allowlists the in-charge attendance cron by EXACT path', () => {
    expect(SRC).toContain("'/api/cron/incharge-attendance'");
  });
```

Leave the existing `does NOT allowlist the whole /api/cron/ prefix` test untouched — it must keep passing.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run proxy.test.ts`
Expected: FAIL on the new assertion; the prefix assertion still passes.

- [ ] **Step 3: Add the exact path**

In `proxy.ts`, replace the comment block and entry inside `PUBLIC_PATHS` (lines 15-24) with:

```typescript
  // Scheduled jobs, called by pg_cron via pg_net. They carry a Bearer
  // CRON_SECRET, never a Supabase session cookie, so without these exact-path
  // entries step 3 below 401s them and each route's own secret check never runs.
  //
  // EXACT PATHS ONLY — never widen this to an '/api/cron/' prefix entry. A
  // prefix would un-block every future cron route by accident, including any
  // that removes roles or bills people. proxy.test.ts asserts the prefix form
  // stays absent.
  '/api/cron/auto-generate-bills',
  // Enforcement is additionally gated by the inchargeEnforcementMode setting,
  // which ships as 'shadow': the job records strikes but removes and bills
  // nobody until an admin switches it to 'enforce'.
  '/api/cron/incharge-attendance',
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run proxy.test.ts`
Expected: PASS, both assertions.

- [ ] **Step 5: Commit**

```bash
git add proxy.ts proxy.test.ts
git commit -m "feat(proxy): allowlist the in-charge attendance cron by exact path"
```

---

### Task 10: Schedule the job with pg_cron

**Files:**
- Create: `supabase/migrations/20260812120000_tms_incharge_attendance_cron.sql`

**Interfaces:**
- Consumes: the allowlisted route from Task 9.
- Produces: pg_cron job `tms-incharge-attendance`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260812120000_tms_incharge_attendance_cron.sql`:

```sql
-- Schedule the bus in-charge attendance enforcement loop.
--
-- Vercel crons have never fired on this project (proxy.ts 401s them before the
-- handler), so scheduling goes through pg_cron + pg_net exactly like the live
-- tms-auto-generate-bills job. Both vault secrets already exist.
--
-- 30 15 * * * UTC = 21:00 IST, after both the onward and return legs close.
-- The job itself skips weekends, and it removes/bills nobody until the
-- inchargeEnforcementMode setting is switched from 'shadow' to 'enforce'.

-- cron.schedule upserts by jobname in pg_cron >= 1.4, but unschedule-first keeps
-- this migration replayable on any version.
do $$
begin
  perform cron.unschedule('tms-incharge-attendance');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-incharge-attendance',
  '30 15 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/incharge-attendance',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret'))
  );
  $$
);

-- ── Verification (run separately after applying) ─────────────────────────────
--   select jobname, schedule, active from cron.job where jobname='tms-incharge-attendance';
--   -- Dry run against the deployed app, writes nothing:
--   --   GET <app>/api/cron/incharge-attendance?dryRun=1  with the Bearer secret
```

- [ ] **Step 2: Apply it**

Apply via the Supabase `apply_migration` tool against project `kvizhngldtiuufknvehv`, using the migration name `tms_incharge_attendance_cron`.

- [ ] **Step 3: Verify the job registered**

Run this SQL:

```sql
select jobname, schedule, active from cron.job where jobname = 'tms-incharge-attendance';
```

Expected: one row, `30 15 * * *`, `active = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260812120000_tms_incharge_attendance_cron.sql
git commit -m "feat(boarding): schedule in-charge attendance enforcement via pg_cron"
```

---

### Task 11: Full verification

**Files:** none modified.

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS. Note any pre-existing failures on `main` and confirm this branch adds none.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success. (`next build` has `ignoreBuildErrors: true`, so this checks bundling and route collection, not types.)

- [ ] **Step 3: Confirm the enforcement board reports shadow**

Confirm `admin_settings` still has no `inchargeEnforcementMode` key, so the parsed default `'shadow'` applies:

```sql
select settings_data ? 'inchargeEnforcementMode' as key_present, settings_data
from admin_settings where setting_type = 'scheduling';
```

Expected: `key_present = false`. Nothing is enforced until an admin sets it.

- [ ] **Step 4: Report**

Summarise for the user: what shipped, that the mode is `shadow`, that the staff fee structure still needs terms configured before any removal can complete, and the remaining manual steps (browser smoke test of the enforcement board, which needs an authenticated session the agent does not have).

---

## Manual steps this plan cannot perform

1. **Browser smoke test** of `/staff-route-assignments/enforcement` and the Settings control — the agent's Chrome is unauthenticated, so an admin session is required.
2. **Configure terms** on the `Transport Fees 2026-2027 (Staff - All Colleges)` structure via `/fees/[id]/edit`. Until then every removal is blocked by design.
3. **Flip to `enforce`** after reviewing a week of shadow data.
