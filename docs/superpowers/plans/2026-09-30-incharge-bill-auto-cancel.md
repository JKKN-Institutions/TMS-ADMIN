# In-charge Bill Auto-Cancel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically cancel a bus in-charge's outstanding staff transport bill once their route's attendance for a calendar month is "perfect" (route scanned every service day AND they personally marked on ≥ 75% of those days), with an Off / Preview / Auto switch.

**Architecture:** A pure, unit-tested rule module (`lib/fees/incharge-bill-review.ts`) decides PASS/FAIL from small aggregates that one SQL function (`tms_incharge_review_marks`) returns. A repo module runs a month: loads candidates, writes one review row per person, and in Auto mode calls the existing `cancelStaffBills()`, notifies the staffer and logs. pg_cron calls an exact-path cron route nightly; admins see and control it on `/staff-route-assignments/bill-review`.

**Tech Stack:** Next.js 16 route handlers, Supabase (service-role client, Postgres function, pg_cron + pg_net + vault), TanStack Query + the shared `DataTable`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-incharge-bill-auto-cancel-design.md`

## Global Constraints

- Work only in the worktree `.worktrees/incharge-bill-auto-cancel` (branch `feat/incharge-bill-auto-cancel`). Never edit the shared checkout.
- Defaults: `mode = 'off'` when the settings row is missing/unreadable; `min_personal_pct = 75`; `min_required_days = 10`.
- Settings live in `admin_settings` row `setting_type = 'incharge_bill_cancel'`, `settings_data = { mode, min_personal_pct, min_required_days }` — never in the `scheduling` row.
- "Human mark" = `tms_attendance.method` is not `'auto'` (`coalesce(method,'') <> 'auto'`).
- Route day = onward trip, `status='present'`, human mark. Personal day = any human mark by the person, any trip, any status.
- Outstanding staff bill = `person_type='staff'`, current transport year, `status in ('staff_deferred','generated')`, `paid_at is null`.
- A review row with `applied = true` is never rewritten.
- A month that has not ended (IST) is only ever evaluated in preview.
- Every `.in()` over a list of ids goes through `selectByIds` (chunks of 150, throws on error). Any read error aborts the run.
- Supabase `numeric` columns arrive as strings: always `Number(x)` before arithmetic.
- Notification category is `'payment'` (the allowed list in `lib/notifications/fields.ts` has no `'fees'`), url `/boarding/fees`.
- Permissions: read = `TMS_PERMISSIONS.FEES_VIEW` (`tms.fees.view`); change/run = `TMS_PERMISSIONS.FEES_EDIT` (`tms.fees.edit`); super admin always.
- Type-check with `node node_modules/typescript/bin/tsc --noEmit -p .` (`npx tsc` is a no-op stub here); main already has ~550 errors, so only compare errors in touched files. `npm run lint` is broken — do not use it.
- Build in the worktree with `set -a; . ../../.env; set +a; node node_modules/next/dist/bin/next build` (node_modules is a junction; create it first per Task 0).
- Every new SQL function is EXECUTED once inside a rolled-back `do $$ … raise exception 'TESTRESULT: %' … $$` block before any code depends on it.

## Review Focus

1. **The current month in Auto mode** — must be evaluated as preview only; a person must never be cancelled on a half month. Pinned by the `effectiveMode` tests in Task 1.
2. **Staff known by a different email than the assignment** (`staff.email` vs `institution_email` vs login email, mixed case, trailing spaces) — must still match. Pinned by the `staffEmails` / `matchAssignments` tests in Task 1.
3. **An assignment that started after the month ended** — must not make the person a candidate for that month. Pinned in Task 1 (`matchAssignments` month-end test).
4. **Bill amounts returned as strings** (`"12900.00"`) — totals must add, not concatenate. Pinned by the `sumAmounts` test in Task 1.
5. **Re-running a month after cancellation** — the applied row must stay untouched and the person must not be notified twice. Guarded in Task 3 (`appliedSet` skip) and verified in Task 7 Step 6.

---

### Task 0: Worktree dependencies

**Files:** none (environment only)

- [ ] **Step 1: Link node_modules into the worktree**

Run from the worktree root (quote the path — unquoted backslashes are eaten):
```bash
MSYS_NO_PATHCONV=1 cmd.exe /c 'mklink /J node_modules ..\..\node_modules'
ls node_modules/.bin/next* | head -2
```
Expected: `Junction created …` and a `next` launcher listed.

- [ ] **Step 2: Confirm the test runner works**

Run: `node node_modules/vitest/vitest.mjs run lib/fees/staff-bill-state.test.ts`
Expected: PASS.

> When the branch is finished, remove the junction with `cmd.exe /c rmdir node_modules` BEFORE any recursive delete of the worktree (see memory note on worktree junctions).

---

### Task 1: Pure rule module

**Files:**
- Create: `lib/fees/incharge-bill-review.ts`
- Test: `lib/fees/incharge-bill-review.test.ts`

**Interfaces:**
- Produces (used by Tasks 3, 5, 6):
  - `type ReviewMode = 'off' | 'preview' | 'auto'`
  - `interface ReviewConfig { mode: ReviewMode; minPersonalPct: number; minRequiredDays: number }`
  - `REVIEW_SETTING_TYPE = 'incharge_bill_cancel'`, `DEFAULT_REVIEW_CONFIG`
  - `parseReviewConfig(raw: unknown): ReviewConfig`, `toStoredReviewConfig(c: ReviewConfig): Record<string, unknown>`, `validateReviewConfig(c: { mode: unknown; minPersonalPct: unknown; minRequiredDays: unknown }): string | null`
  - `isMonth(s: string): boolean`, `monthBounds(month: string): { first: string; last: string }`, `previousMonth(todayIst: string): string`, `monthLabel(month: string): string`
  - `effectiveMode(mode: ReviewMode, forcePreview: boolean, monthComplete: boolean): 'preview' | 'auto' | null`
  - `interface ServiceDayInputs { from: string; to: string; calendarOff: Array<{ date: string; routeId: string | null }>; excused: string[]; fleetDays: string[] }`
  - `serviceDaysForRoute(inp: ServiceDayInputs, routeId: string): string[]`
  - `interface PersonAssignment { routeId: string; startDate: string }`
  - `interface Verdict { outcome: 'passed' | 'failed' | 'not_enough_days'; requiredDays: number; routeDays: number; personalDays: number; personalPct: number; missedRouteDates: string[]; reason: string }`
  - `evaluatePerson(args: { assignments: PersonAssignment[]; personalDates: ReadonlySet<string>; routeDates: ReadonlyMap<string, ReadonlySet<string>>; days: ServiceDayInputs; config: Pick<ReviewConfig, 'minPersonalPct' | 'minRequiredDays'> }): Verdict`
  - `interface ReviewMarks { route_days: Array<{ route_id: string; d: string }>; person_days: Array<{ profile_id: string; email: string | null; d: string }>; fleet_days: string[] }`
  - `indexRouteDays(m: ReviewMarks): Map<string, Set<string>>`
  - `normEmail(v: unknown): string | null`
  - `staffEmails(s: { email: string | null; institution_email: string | null }, profileEmail: string | null): Set<string>`
  - `matchAssignments(emails: ReadonlySet<string>, rows: Array<{ staff_email: string | null; route_id: string; assigned_at: string | null; created_at: string | null }>, monthLast: string): PersonAssignment[]`
  - `personalDatesFor(m: ReviewMarks, profileId: string | null, emails: ReadonlySet<string>): Set<string>`
  - `sumAmounts(rows: Array<{ amount: unknown }>): number`
  - `istDateOf(iso: string): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/fees/incharge-bill-review.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  parseReviewConfig, validateReviewConfig, toStoredReviewConfig, DEFAULT_REVIEW_CONFIG,
  isMonth, monthBounds, previousMonth, monthLabel, effectiveMode,
  serviceDaysForRoute, evaluatePerson, indexRouteDays, normEmail, staffEmails,
  matchAssignments, personalDatesFor, sumAmounts, istDateOf,
  type ServiceDayInputs, type ReviewMarks,
} from './incharge-bill-review';

describe('config', () => {
  it('fails OFF when missing or unreadable', () => {
    expect(parseReviewConfig(undefined)).toEqual(DEFAULT_REVIEW_CONFIG);
    expect(parseReviewConfig('x')).toEqual({ mode: 'off', minPersonalPct: 75, minRequiredDays: 10 });
    expect(parseReviewConfig({ mode: 'bogus' }).mode).toBe('off');
  });
  it('reads stored snake_case keys and falls back per key when out of range', () => {
    expect(parseReviewConfig({ mode: 'auto', min_personal_pct: 80, min_required_days: 12 }))
      .toEqual({ mode: 'auto', minPersonalPct: 80, minRequiredDays: 12 });
    expect(parseReviewConfig({ mode: 'preview', min_personal_pct: 150, min_required_days: 0 }))
      .toEqual({ mode: 'preview', minPersonalPct: 75, minRequiredDays: 10 });
  });
  it('round-trips through the stored shape', () => {
    const c = { mode: 'auto' as const, minPersonalPct: 70, minRequiredDays: 8 };
    expect(parseReviewConfig(toStoredReviewConfig(c))).toEqual(c);
  });
  it('validates input', () => {
    expect(validateReviewConfig({ mode: 'auto', minPersonalPct: 75, minRequiredDays: 10 })).toBeNull();
    expect(validateReviewConfig({ mode: 'on', minPersonalPct: 75, minRequiredDays: 10 })).toMatch(/mode/i);
    expect(validateReviewConfig({ mode: 'auto', minPersonalPct: 0, minRequiredDays: 10 })).toMatch(/1 and 100/);
    expect(validateReviewConfig({ mode: 'auto', minPersonalPct: 75, minRequiredDays: 27 })).toMatch(/1 and 26/);
  });
});

describe('months', () => {
  it('validates, bounds and steps back', () => {
    expect(isMonth('2026-09')).toBe(true);
    expect(isMonth('2026-9')).toBe(false);
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthBounds('2028-02').last).toBe('2028-02-29');
    expect(previousMonth('2026-10-01')).toBe('2026-09');
    expect(previousMonth('2026-01-15')).toBe('2025-12');
    expect(monthLabel('2026-09')).toBe('September 2026');
  });
});

describe('effectiveMode', () => {
  it('skips when off unless preview is forced', () => {
    expect(effectiveMode('off', false, true)).toBeNull();
    expect(effectiveMode('off', true, true)).toBe('preview');
  });
  it('never applies a month that has not ended', () => {
    expect(effectiveMode('auto', false, false)).toBe('preview');
    expect(effectiveMode('auto', false, true)).toBe('auto');
    expect(effectiveMode('auto', true, true)).toBe('preview');
    expect(effectiveMode('preview', false, true)).toBe('preview');
  });
});

describe('serviceDaysForRoute', () => {
  // Mon 14 .. Sun 20 Sep 2026
  const inp: ServiceDayInputs = {
    from: '2026-09-14', to: '2026-09-20',
    calendarOff: [{ date: '2026-09-15', routeId: null }, { date: '2026-09-16', routeId: 'r2' }],
    excused: ['2026-09-17'],
    fleetDays: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-20'],
  };
  it('drops Sundays, all-route holidays, excused and fleet-dark days', () => {
    expect(serviceDaysForRoute(inp, 'r1')).toEqual(['2026-09-14', '2026-09-16', '2026-09-18']);
  });
  it('applies a route-specific holiday only to that route', () => {
    expect(serviceDaysForRoute(inp, 'r2')).toEqual(['2026-09-14', '2026-09-18']);
  });
});

// Tue 1 .. Sat 12 Sep 2026; Sunday 6 excluded → 11 service days.
const ALL = ['01', '02', '03', '04', '05', '07', '08', '09', '10', '11', '12'].map((d) => `2026-09-${d}`);
const DAYS: ServiceDayInputs = { from: '2026-09-01', to: '2026-09-12', calendarOff: [], excused: [], fleetDays: ALL };
const CFG = { minPersonalPct: 75, minRequiredDays: 10 };
const routes = (m: Record<string, string[]>) => new Map(Object.entries(m).map(([k, v]) => [k, new Set(v)]));

describe('evaluatePerson', () => {
  it('passes when the bus is marked every day and own share is met', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-08-20' }],
      personalDates: new Set(ALL.slice(0, 9)),
      routeDates: routes({ r1: ALL }),
      days: DAYS, config: CFG,
    });
    expect(v).toMatchObject({ outcome: 'passed', requiredDays: 11, routeDays: 11, personalDays: 9, personalPct: 81.8, missedRouteDates: [] });
  });
  it('fails on a single unmarked bus day and lists it', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-08-20' }],
      personalDates: new Set(ALL),
      routeDates: routes({ r1: ALL.filter((d) => d !== '2026-09-08') }),
      days: DAYS, config: CFG,
    });
    expect(v.outcome).toBe('failed');
    expect(v.routeDays).toBe(10);
    expect(v.missedRouteDates).toEqual(['2026-09-08']);
    expect(v.reason).toMatch(/not marked on 1 day/);
  });
  it('passes at exactly the personal threshold and fails just under', () => {
    const cfg = { minPersonalPct: 75, minRequiredDays: 5 };
    const eight = ALL.slice(3); // start 4 Sep → 8 required days
    const base = { assignments: [{ routeId: 'r1', startDate: '2026-09-04' }], routeDates: routes({ r1: ALL }), days: DAYS, config: cfg };
    expect(evaluatePerson({ ...base, personalDates: new Set(eight.slice(0, 6)) }).outcome).toBe('passed');
    expect(evaluatePerson({ ...base, personalDates: new Set(eight.slice(0, 5)) }).outcome).toBe('failed');
  });
  it('counts only days from the assignment start', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-09-05' }],
      personalDates: new Set(ALL), routeDates: routes({ r1: ALL }), days: DAYS, config: CFG,
    });
    expect(v.outcome).toBe('not_enough_days');
    expect(v.requiredDays).toBe(7);
    const w = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-09-05' }],
      personalDates: new Set(ALL), routeDates: routes({ r1: ALL }), days: DAYS, config: { ...CFG, minRequiredDays: 7 },
    });
    expect(w.outcome).toBe('passed');
  });
  it('requires every assigned route to be perfect', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-08-01' }, { routeId: 'r2', startDate: '2026-08-01' }],
      personalDates: new Set(ALL),
      routeDates: routes({ r1: ALL, r2: ALL.filter((d) => d !== '2026-09-02') }),
      days: DAYS, config: CFG,
    });
    expect(v.outcome).toBe('failed');
    expect(v.missedRouteDates).toEqual(['2026-09-02']);
  });
  it('ignores personal marks on non-service days', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-08-01' }],
      personalDates: new Set(['2026-09-06', ...ALL.slice(0, 8)]),
      routeDates: routes({ r1: ALL }), days: DAYS, config: CFG,
    });
    expect(v.personalDays).toBe(8);
    expect(v.outcome).toBe('failed'); // 8/11 = 72.7%
  });
});

describe('identity', () => {
  it('normalises emails', () => {
    expect(normEmail('  A@X.com ')).toBe('a@x.com');
    expect(normEmail('   ')).toBeNull();
    expect(normEmail(null)).toBeNull();
  });
  it('collects all three addresses', () => {
    expect([...staffEmails({ email: 'A@x.com ', institution_email: null }, 'a.inst@X.com')].sort())
      .toEqual(['a.inst@x.com', 'a@x.com']);
  });
  it('matches an assignment typed with any address, dated in IST, earliest start per route', () => {
    const emails = staffEmails({ email: 'a@x.com', institution_email: 'a.inst@x.com' }, null);
    const got = matchAssignments(emails, [
      { staff_email: 'A.Inst@x.com ', route_id: 'r1', assigned_at: '2026-08-31T20:00:00Z', created_at: null },
      { staff_email: 'someone@x.com', route_id: 'r9', assigned_at: '2026-08-01T00:00:00Z', created_at: null },
      { staff_email: 'a@x.com', route_id: 'r1', assigned_at: null, created_at: '2026-09-10T04:00:00Z' },
    ], '2026-09-30');
    expect(got).toEqual([{ routeId: 'r1', startDate: '2026-09-01' }]);
  });
  it('drops assignments that started after the month ended', () => {
    const emails = new Set(['a@x.com']);
    expect(matchAssignments(emails, [
      { staff_email: 'a@x.com', route_id: 'r1', assigned_at: '2026-10-02T04:00:00Z', created_at: null },
    ], '2026-09-30')).toEqual([]);
  });
  it('finds personal days by profile id or by any known email', () => {
    const m: ReviewMarks = {
      route_days: [], fleet_days: [],
      person_days: [
        { profile_id: 'p1', email: null, d: '2026-09-01' },
        { profile_id: 'p9', email: 'a@x.com', d: '2026-09-02' },
        { profile_id: 'p7', email: 'b@x.com', d: '2026-09-03' },
      ],
    };
    expect([...personalDatesFor(m, 'p1', new Set(['a@x.com']))].sort()).toEqual(['2026-09-01', '2026-09-02']);
  });
});

describe('helpers', () => {
  it('indexes route days', () => {
    const idx = indexRouteDays({ route_days: [{ route_id: 'r1', d: '2026-09-01' }, { route_id: 'r1', d: '2026-09-02' }], person_days: [], fleet_days: [] });
    expect([...(idx.get('r1') ?? [])]).toEqual(['2026-09-01', '2026-09-02']);
  });
  it('sums numeric strings as numbers', () => {
    expect(sumAmounts([{ amount: '12900.00' }, { amount: 5500 }, { amount: null }])).toBe(18400);
  });
  it('converts an instant to its IST date', () => {
    expect(istDateOf('2026-08-31T20:00:00Z')).toBe('2026-09-01');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node node_modules/vitest/vitest.mjs run lib/fees/incharge-bill-review.test.ts`
Expected: FAIL — `Failed to resolve import "./incharge-bill-review"`.

- [ ] **Step 3: Implement the module**

Create `lib/fees/incharge-bill-review.ts`:
```ts
/**
 * In-charge bill auto-cancel — the RULE, with no I/O.
 *
 * A bus in-charge who owes a staff transport bill has it cancelled once one
 * calendar month is "perfect": their bus's morning trip was scanned on every
 * service day they were on duty, AND they personally marked on at least
 * minPersonalPct of those days. Spec:
 * docs/superpowers/specs/2026-09-30-incharge-bill-auto-cancel-design.md
 *
 * Kept pure so every edge (holidays nobody entered, excused outages, a start
 * mid-month, a person known by three emails) is pinned by a unit test. The
 * repo (incharge-bill-review-repo.ts) only loads inputs and applies verdicts.
 */

export type ReviewMode = 'off' | 'preview' | 'auto';

export interface ReviewConfig {
  mode: ReviewMode;
  minPersonalPct: number;
  minRequiredDays: number;
}

/** Its OWN admin_settings row — never the `scheduling` blob, whose save drops unknown keys. */
export const REVIEW_SETTING_TYPE = 'incharge_bill_cancel';

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = { mode: 'off', minPersonalPct: 75, minRequiredDays: 10 };

const MODES: readonly ReviewMode[] = ['off', 'preview', 'auto'];

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

/** Fails OFF: an unreadable switch must never start cancelling bills. */
export function parseReviewConfig(raw: unknown): ReviewConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_REVIEW_CONFIG };
  const r = raw as Record<string, unknown>;
  return {
    mode: MODES.includes(r.mode as ReviewMode) ? (r.mode as ReviewMode) : 'off',
    minPersonalPct: intIn(r.min_personal_pct, 1, 100, DEFAULT_REVIEW_CONFIG.minPersonalPct),
    minRequiredDays: intIn(r.min_required_days, 1, 26, DEFAULT_REVIEW_CONFIG.minRequiredDays),
  };
}

export function toStoredReviewConfig(c: ReviewConfig): Record<string, unknown> {
  return { mode: c.mode, min_personal_pct: c.minPersonalPct, min_required_days: c.minRequiredDays };
}

export function validateReviewConfig(c: { mode: unknown; minPersonalPct: unknown; minRequiredDays: unknown }): string | null {
  if (!MODES.includes(c.mode as ReviewMode)) return 'Mode must be off, preview or auto';
  if (intIn(c.minPersonalPct, 1, 100, -1) === -1) return 'Own-marking share must be a whole number between 1 and 100';
  if (intIn(c.minRequiredDays, 1, 26, -1) === -1) return 'Minimum days must be a whole number between 1 and 26';
  return null;
}

// ── Months (IST calendar months, as 'YYYY-MM') ──────────────────────────────

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** The month before the one containing `todayIst` (YYYY-MM-DD). */
export function previousMonth(todayIst: string): string {
  const [y, m] = todayIst.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * What a run may do. null = skip. A month that has not ended is preview-only:
 * a half month must never cancel anyone's bill.
 */
export function effectiveMode(mode: ReviewMode, forcePreview: boolean, monthComplete: boolean): 'preview' | 'auto' | null {
  if (mode === 'off' && !forcePreview) return null;
  if (mode === 'auto' && !forcePreview && monthComplete) return 'auto';
  return 'preview';
}

// ── Days ────────────────────────────────────────────────────────────────────

export interface ServiceDayInputs {
  from: string;
  to: string;
  /** tms_service_calendar rows; routeId null = every route. */
  calendarOff: Array<{ date: string; routeId: string | null }>;
  /** Admin-excused dates (tms_incharge_excused_day). */
  excused: string[];
  /** Dates with >= 1 human mark anywhere in the fleet. A day nobody marked is not a service day. */
  fleetDays: string[];
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`).getTime();
  while (d.getTime() <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
}

export function serviceDaysForRoute(inp: ServiceDayInputs, routeId: string): string[] {
  const fleet = new Set(inp.fleetDays);
  const excused = new Set(inp.excused);
  const off = new Set(inp.calendarOff.filter((c) => c.routeId === null || c.routeId === routeId).map((c) => c.date));
  return datesBetween(inp.from, inp.to).filter((d) => !isSunday(d) && fleet.has(d) && !excused.has(d) && !off.has(d));
}

// ── Verdict ─────────────────────────────────────────────────────────────────

export interface PersonAssignment {
  routeId: string;
  /** IST date the duty started. */
  startDate: string;
}

export interface Verdict {
  outcome: 'passed' | 'failed' | 'not_enough_days';
  requiredDays: number;
  routeDays: number;
  personalDays: number;
  personalPct: number;
  missedRouteDates: string[];
  reason: string;
}

export function evaluatePerson(args: {
  assignments: PersonAssignment[];
  personalDates: ReadonlySet<string>;
  routeDates: ReadonlyMap<string, ReadonlySet<string>>;
  days: ServiceDayInputs;
  config: Pick<ReviewConfig, 'minPersonalPct' | 'minRequiredDays'>;
}): Verdict {
  const required = new Set<string>();
  const missed = new Set<string>();
  for (const a of args.assignments) {
    const marked = args.routeDates.get(a.routeId);
    for (const d of serviceDaysForRoute(args.days, a.routeId)) {
      if (d < a.startDate) continue;
      required.add(d);
      if (!marked?.has(d)) missed.add(d);
    }
  }
  const n = required.size;
  const personal = [...required].filter((d) => args.personalDates.has(d)).length;
  const pct = n === 0 ? 0 : Math.round((personal * 1000) / n) / 10;
  const missedRouteDates = [...missed].sort();
  const base = { requiredDays: n, routeDays: n - missed.size, personalDays: personal, personalPct: pct, missedRouteDates };

  if (n < args.config.minRequiredDays) {
    return { ...base, outcome: 'not_enough_days', reason: `Only ${n} service days on duty this month (needs ${args.config.minRequiredDays}).` };
  }
  const shareOk = personal * 100 >= args.config.minPersonalPct * n;
  if (missed.size === 0 && shareOk) {
    return { ...base, outcome: 'passed', reason: `Bus marked on all ${n} days; own marks on ${personal} of ${n} days (${pct}%).` };
  }
  const parts: string[] = [];
  if (missed.size > 0) parts.push(`Bus not marked on ${missed.size} day(s): ${missedRouteDates.join(', ')}`);
  if (!shareOk) parts.push(`own marks on ${personal} of ${n} days (${pct}%), needs ${args.config.minPersonalPct}%`);
  return { ...base, outcome: 'failed', reason: parts.join('; ') + '.' };
}

// ── Inputs from tms_incharge_review_marks ───────────────────────────────────

export interface ReviewMarks {
  route_days: Array<{ route_id: string; d: string }>;
  person_days: Array<{ profile_id: string; email: string | null; d: string }>;
  fleet_days: string[];
}

export function indexRouteDays(m: ReviewMarks): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const r of m.route_days) {
    if (!idx.has(r.route_id)) idx.set(r.route_id, new Set());
    idx.get(r.route_id)!.add(r.d);
  }
  return idx;
}

// ── Identity: a person is known by up to three addresses ────────────────────

export function normEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  return s.length ? s : null;
}

export function staffEmails(s: { email: string | null; institution_email: string | null }, profileEmail: string | null): Set<string> {
  const out = new Set<string>();
  for (const e of [s.email, s.institution_email, profileEmail]) {
    const n = normEmail(e);
    if (n) out.add(n);
  }
  return out;
}

export function istDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Active assignments for this person that began on or before the month's last day; earliest start per route. */
export function matchAssignments(
  emails: ReadonlySet<string>,
  rows: Array<{ staff_email: string | null; route_id: string; assigned_at: string | null; created_at: string | null }>,
  monthLast: string,
): PersonAssignment[] {
  const byRoute = new Map<string, string>();
  for (const r of rows) {
    const e = normEmail(r.staff_email);
    const stamp = r.assigned_at ?? r.created_at;
    if (!e || !emails.has(e) || !stamp) continue;
    const start = istDateOf(stamp);
    if (start > monthLast) continue;
    const prev = byRoute.get(r.route_id);
    if (!prev || start < prev) byRoute.set(r.route_id, start);
  }
  return [...byRoute.entries()].map(([routeId, startDate]) => ({ routeId, startDate }));
}

export function personalDatesFor(m: ReviewMarks, profileId: string | null, emails: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const p of m.person_days) {
    const e = normEmail(p.email);
    if ((profileId && p.profile_id === profileId) || (e && emails.has(e))) out.add(p.d);
  }
  return out;
}

/** Postgres numeric arrives as a string — Number() it, or the sum concatenates. */
export function sumAmounts(rows: Array<{ amount: unknown }>): number {
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node node_modules/vitest/vitest.mjs run lib/fees/incharge-bill-review.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/fees/incharge-bill-review.ts lib/fees/incharge-bill-review.test.ts
git commit -m "feat(fees): pure rule for in-charge bill auto-cancel"
```

---

### Task 2: Database — review table, excused days, marks function, settings row

**Files:**
- Create: `supabase/migrations/20260930120000_incharge_bill_review.sql`

**Interfaces:**
- Produces: table `public.tms_incharge_bill_review` (unique `(person_id, month)`), table `public.tms_incharge_excused_day` (pk `day`), function `public.tms_incharge_review_marks(p_from date, p_to date) returns jsonb` shaped as `ReviewMarks` (Task 1), settings row `incharge_bill_cancel` = preview.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260930120000_incharge_bill_review.sql`:
```sql
-- In-charge bill auto-cancel (spec: docs/superpowers/specs/2026-09-30-incharge-bill-auto-cancel-design.md)
-- Additive only. Starts in PREVIEW: no bill changes until an admin switches to Auto.

create table if not exists public.tms_incharge_bill_review (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null,               -- staff.id (no FK, like tms_fee_bill.person_id)
  month               date not null check (extract(day from month) = 1),
  transport_year_id   uuid not null references public.tms_transport_year(id),
  route_ids           uuid[] not null default '{}',
  window_start        date not null,
  window_end          date not null,
  required_days       int not null,
  route_days          int not null,
  personal_days       int not null,
  personal_pct        numeric(5,1) not null,
  missed_route_dates  date[] not null default '{}',
  excused_dates       date[] not null default '{}',
  outcome             text not null check (outcome in ('passed','failed','not_enough_days')),
  reason              text not null,
  mode                text not null check (mode in ('preview','auto')),
  applied             boolean not null default false,
  bill_action         text not null default 'none' check (bill_action in ('none','cancelled')),
  bill_ids            uuid[] not null default '{}',
  outstanding_amount  numeric(12,2) not null default 0,
  cancelled_amount    numeric(12,2) not null default 0,
  error               text,
  decided_at          timestamptz not null default now(),
  applied_at          timestamptz,
  unique (person_id, month)
);
alter table public.tms_incharge_bill_review enable row level security; -- service role only

create table if not exists public.tms_incharge_excused_day (
  day         date primary key,
  reason      text not null check (length(trim(reason)) > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null
);
alter table public.tms_incharge_excused_day enable row level security; -- service role only

-- Small aggregates instead of ~90k attendance rows per month.
create or replace function public.tms_incharge_review_marks(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'route_days', coalesce((
      select jsonb_agg(jsonb_build_object('route_id', r.route_id, 'd', r.trip_date))
      from (select distinct route_id, trip_date from tms_attendance
            where trip_date between p_from and p_to and direction = 'onward'
              and status = 'present' and coalesce(method, '') <> 'auto' and route_id is not null) r
    ), '[]'::jsonb),
    'person_days', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', x.scanned_by, 'email', lower(trim(p.email)), 'd', x.trip_date))
      from (select distinct scanned_by, trip_date from tms_attendance
            where trip_date between p_from and p_to and coalesce(method, '') <> 'auto' and scanned_by is not null) x
      left join profiles p on p.id = x.scanned_by
    ), '[]'::jsonb),
    'fleet_days', coalesce((
      select jsonb_agg(f.d order by f.d)
      from (select distinct trip_date d from tms_attendance
            where trip_date between p_from and p_to and coalesce(method, '') <> 'auto') f
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.tms_incharge_review_marks(date, date) from public, anon, authenticated;
grant execute on function public.tms_incharge_review_marks(date, date) to service_role;

insert into public.admin_settings (setting_type, settings_data)
values ('incharge_bill_cancel', '{"mode":"preview","min_personal_pct":75,"min_required_days":10}'::jsonb)
on conflict (setting_type) do nothing;
```

- [ ] **Step 2: Rehearse the function body in a rolled-back block**

Using `mcp__supabase__execute_sql`, run the `create or replace function …` statement plus a probe inside one DO block that always raises, so nothing persists:
```sql
do $$
declare j jsonb;
begin
  execute $f$ <PASTE THE create or replace function STATEMENT FROM STEP 1, WITHOUT the trailing semicolon> $f$;
  j := public.tms_incharge_review_marks('2026-09-01', '2026-09-30');
  raise exception 'TESTRESULT: route_days=% person_days=% fleet_days=%',
    jsonb_array_length(j->'route_days'), jsonb_array_length(j->'person_days'), j->'fleet_days';
end $$;
```
Expected: error text `TESTRESULT: route_days≈450 person_days≈2000+ fleet_days=["2026-09-01", …]` with no 12/19/26 Sep (holidays / fleet-dark). Any other error = fix Step 1 and repeat.

- [ ] **Step 3: Apply the migration**

`mcp__supabase__apply_migration` with name `incharge_bill_review` and the file's SQL.

- [ ] **Step 4: Verify the live state**

```sql
select
  (select count(*) from tms_incharge_bill_review) review_rows,
  (select count(*) from tms_incharge_excused_day) excused_rows,
  (select settings_data from admin_settings where setting_type = 'incharge_bill_cancel') cfg,
  has_function_privilege('service_role', 'public.tms_incharge_review_marks(date,date)', 'EXECUTE') svc_exec,
  has_function_privilege('authenticated', 'public.tms_incharge_review_marks(date,date)', 'EXECUTE') auth_exec;
```
Expected: `0, 0, {"mode": "preview", …}, true, false`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930120000_incharge_bill_review.sql
git commit -m "feat(db): in-charge bill review table, excused days, marks aggregate"
```

---

### Task 3: Run engine (repo)

**Files:**
- Create: `lib/fees/incharge-bill-review-repo.ts`

**Interfaces:**
- Consumes: everything from Task 1; `selectByIds` (`lib/supabase/chunked.ts`); `istToday`, `addDays` (`lib/booking/window.ts`); `cancelStaffBills` (`lib/fees/cancel-staff-bill.ts`); `notifyProfile` (`lib/notifications/notify.ts`); `logSystemActivity` (`lib/activity/log.ts`); DB objects from Task 2.
- Produces (used by Tasks 4, 5):
  - `loadReviewConfig(svc: SupabaseClient): Promise<ReviewConfig>`
  - `interface RunOptions { month?: string; forcePreview?: boolean; now?: Date }`
  - `interface RunSummary { month: string; mode: ReviewMode; skipped?: 'off' | 'no_days' | 'no_current_year'; candidates: number; noAssignment: number; passed: number; failed: number; notEnoughDays: number; alreadyApplied: number; cancelledPeople: number; cancelledAmount: number; errors: Array<{ personId: string; message: string }> }`
  - `runInchargeBillReview(svc: SupabaseClient, opts?: RunOptions): Promise<RunSummary>`

- [ ] **Step 1: Implement the engine**

Create `lib/fees/incharge-bill-review-repo.ts`:
```ts
/**
 * In-charge bill auto-cancel — the RUN. Loads one month's inputs, writes one
 * review row per candidate, and in Auto mode cancels passing staff bills.
 * The rule itself is pure and lives in ./incharge-bill-review.ts.
 *
 * Failure policy: any READ error aborts the whole run (a failed read must never
 * look like "no marks"). A failure while APPLYING one person's cancel is
 * recorded on that person's row and the run continues with the others.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { selectByIds } from '@/lib/supabase/chunked';
import { istToday, addDays } from '@/lib/booking/window';
import { cancelStaffBills } from '@/lib/fees/cancel-staff-bill';
import { notifyProfile } from '@/lib/notifications/notify';
import { logSystemActivity } from '@/lib/activity/log';
import {
  REVIEW_SETTING_TYPE, DEFAULT_REVIEW_CONFIG, parseReviewConfig, isMonth, monthBounds, previousMonth,
  monthLabel, effectiveMode, evaluatePerson, indexRouteDays, staffEmails, matchAssignments,
  personalDatesFor, sumAmounts, type ReviewConfig, type ReviewMode, type ReviewMarks, type ServiceDayInputs,
} from '@/lib/fees/incharge-bill-review';

const OUTSTANDING_STATUSES = ['staff_deferred', 'generated'];

export interface RunOptions {
  month?: string;
  forcePreview?: boolean;
  now?: Date;
}

export interface RunSummary {
  month: string;
  mode: ReviewMode;
  skipped?: 'off' | 'no_days' | 'no_current_year';
  candidates: number;
  noAssignment: number;
  passed: number;
  failed: number;
  notEnoughDays: number;
  alreadyApplied: number;
  cancelledPeople: number;
  cancelledAmount: number;
  errors: Array<{ personId: string; message: string }>;
}

interface StaffRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  institution_email: string | null;
  profile_id: string | null;
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`incharge-bill-review: ${what} failed: ${error.message}`);
}

export async function loadReviewConfig(svc: SupabaseClient): Promise<ReviewConfig> {
  try {
    const { data, error } = await svc
      .from('admin_settings')
      .select('settings_data')
      .eq('setting_type', REVIEW_SETTING_TYPE)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_REVIEW_CONFIG };
    return parseReviewConfig((data as { settings_data: unknown }).settings_data);
  } catch {
    return { ...DEFAULT_REVIEW_CONFIG }; // fail OFF
  }
}

export async function runInchargeBillReview(svc: SupabaseClient, opts: RunOptions = {}): Promise<RunSummary> {
  const config = await loadReviewConfig(svc);
  const today = istToday(opts.now ?? new Date());
  const month = opts.month ?? previousMonth(today);
  if (!isMonth(month)) throw new Error(`incharge-bill-review: invalid month "${month}"`);
  const { first, last } = monthBounds(month);

  const summary: RunSummary = {
    month, mode: config.mode, candidates: 0, noAssignment: 0, passed: 0, failed: 0,
    notEnoughDays: 0, alreadyApplied: 0, cancelledPeople: 0, cancelledAmount: 0, errors: [],
  };

  const mode = effectiveMode(config.mode, !!opts.forcePreview, last < today);
  if (!mode) return { ...summary, skipped: 'off' };
  summary.mode = mode;

  const to = last < today ? last : addDays(today, -1);
  if (to < first) return { ...summary, skipped: 'no_days' };

  const { data: years, error: yErr } = await svc
    .from('tms_transport_year').select('id, name').eq('is_current', true).limit(1);
  if (yErr) fail('transport year', yErr);
  const year = (years ?? [])[0] as { id: string; name: string } | undefined;
  if (!year) return { ...summary, skipped: 'no_current_year' };

  const { data: billData, error: bErr } = await svc
    .from('tms_fee_bill')
    .select('id, person_id, amount')
    .eq('person_type', 'staff')
    .eq('transport_year_id', year.id)
    .in('status', OUTSTANDING_STATUSES)
    .is('paid_at', null);
  if (bErr) fail('outstanding bills', bErr);
  const billsByPerson = new Map<string, Array<{ id: string; amount: unknown }>>();
  for (const b of (billData ?? []) as Array<{ id: string; person_id: string; amount: unknown }>) {
    if (!billsByPerson.has(b.person_id)) billsByPerson.set(b.person_id, []);
    billsByPerson.get(b.person_id)!.push({ id: b.id, amount: b.amount });
  }
  if (billsByPerson.size === 0) return summary;

  const staff = await selectByIds<StaffRow>(
    svc, 'staff', 'id, first_name, last_name, email, institution_email, profile_id', [...billsByPerson.keys()],
  );
  const profileIds = staff.map((s) => s.profile_id).filter((v): v is string => !!v);
  const profiles = await selectByIds<{ id: string; email: string | null }>(svc, 'profiles', 'id, email', profileIds);
  const profileEmail = new Map(profiles.map((p) => [p.id, p.email]));

  const { data: asg, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('staff_email, route_id, assigned_at, created_at')
    .eq('is_active', true);
  if (aErr) fail('assignments', aErr);

  const { data: cal, error: cErr } = await svc
    .from('tms_service_calendar').select('exception_date, route_id').gte('exception_date', first).lte('exception_date', to);
  if (cErr) fail('service calendar', cErr);

  const { data: exc, error: eErr } = await svc
    .from('tms_incharge_excused_day').select('day').gte('day', first).lte('day', to);
  if (eErr) fail('excused days', eErr);

  const { data: marksRaw, error: mErr } = await svc.rpc('tms_incharge_review_marks', { p_from: first, p_to: to });
  if (mErr) fail('marks aggregate', mErr);
  const marks = marksRaw as ReviewMarks;

  const { data: appliedRows, error: apErr } = await svc
    .from('tms_incharge_bill_review').select('person_id').eq('month', first).eq('applied', true);
  if (apErr) fail('applied rows', apErr);
  const appliedSet = new Set(((appliedRows ?? []) as Array<{ person_id: string }>).map((r) => r.person_id));

  const excused = ((exc ?? []) as Array<{ day: string }>).map((e) => e.day);
  const days: ServiceDayInputs = {
    from: first,
    to,
    calendarOff: ((cal ?? []) as Array<{ exception_date: string; route_id: string | null }>)
      .map((c) => ({ date: c.exception_date, routeId: c.route_id })),
    excused,
    fleetDays: marks.fleet_days,
  };
  const routeDates = indexRouteDays(marks);
  const assignmentRows = (asg ?? []) as Array<{ staff_email: string | null; route_id: string; assigned_at: string | null; created_at: string | null }>;

  const rows: Record<string, unknown>[] = [];
  const passes: Array<{ s: StaffRow; bills: Array<{ id: string; amount: unknown }>; reason: string; emails: Set<string> }> = [];

  for (const s of staff) {
    if (appliedSet.has(s.id)) { summary.alreadyApplied++; continue; }
    summary.candidates++;
    const emails = staffEmails(s, s.profile_id ? profileEmail.get(s.profile_id) ?? null : null);
    const assignments = matchAssignments(emails, assignmentRows, last);
    if (assignments.length === 0) { summary.noAssignment++; continue; }

    const v = evaluatePerson({
      assignments,
      personalDates: personalDatesFor(marks, s.profile_id, emails),
      routeDates,
      days,
      config,
    });
    if (v.outcome === 'passed') summary.passed++;
    else if (v.outcome === 'failed') summary.failed++;
    else summary.notEnoughDays++;

    const bills = billsByPerson.get(s.id) ?? [];
    rows.push({
      person_id: s.id,
      month: first,
      transport_year_id: year.id,
      route_ids: assignments.map((a) => a.routeId),
      window_start: first,
      window_end: to,
      required_days: v.requiredDays,
      route_days: v.routeDays,
      personal_days: v.personalDays,
      personal_pct: v.personalPct,
      missed_route_dates: v.missedRouteDates,
      excused_dates: excused,
      outcome: v.outcome,
      reason: v.reason,
      mode,
      applied: false,
      bill_action: 'none',
      bill_ids: bills.map((b) => b.id),
      outstanding_amount: sumAmounts(bills),
      cancelled_amount: 0,
      error: null,
      decided_at: new Date().toISOString(),
    });
    if (v.outcome === 'passed' && mode === 'auto') passes.push({ s, bills, reason: v.reason, emails });
  }

  if (rows.length) {
    const { error: uErr } = await svc.from('tms_incharge_bill_review').upsert(rows, { onConflict: 'person_id,month' });
    if (uErr) fail('write review rows', uErr);
  }

  for (const p of passes) {
    try {
      const { cancelled } = await cancelStaffBills(svc, { personId: p.s.id, transportYearId: year.id });
      const amount = cancelled > 0 ? sumAmounts(p.bills) : 0;
      const { error: upErr } = await svc
        .from('tms_incharge_bill_review')
        .update({
          applied: true,
          applied_at: new Date().toISOString(),
          bill_action: cancelled > 0 ? 'cancelled' : 'none',
          cancelled_amount: amount,
        })
        .eq('person_id', p.s.id)
        .eq('month', first);
      if (upErr) throw new Error(upErr.message);
      if (cancelled === 0) continue;

      summary.cancelledPeople++;
      summary.cancelledAmount += amount;
      const name = [p.s.first_name, p.s.last_name].filter(Boolean).join(' ') || p.s.email || p.s.id;
      if (p.s.profile_id) {
        await notifyProfile(svc, {
          profileId: p.s.profile_id,
          actorId: '',
          title: 'Transport fee cancelled',
          body: `Your ${year.name} staff transport fee (Rs ${amount.toLocaleString('en-IN')}) has been cancelled because your bus attendance for ${monthLabel(month)} was complete. Thank you.`,
          category: 'payment',
          url: '/boarding/fees',
        });
      }
      await logSystemActivity({
        module: 'fees',
        action: 'cancel',
        entityType: 'tms_fee_bill',
        entityId: p.s.id,
        entityLabel: name,
        description: `In-charge bill auto-cancelled for ${monthLabel(month)}: ${p.reason}`,
        metadata: { month, billIds: p.bills.map((b) => b.id), amount },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push({ personId: p.s.id, message });
      await svc.from('tms_incharge_bill_review').update({ error: message }).eq('person_id', p.s.id).eq('month', first);
    }
  }

  return summary;
}
```

- [ ] **Step 2: Type-check the two new files**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -E "incharge-bill-review" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 3: Run the whole fees suite (nothing else may break)**

Run: `node node_modules/vitest/vitest.mjs run lib/fees`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/fees/incharge-bill-review-repo.ts
git commit -m "feat(fees): monthly in-charge bill review run (preview/auto)"
```

---

### Task 4: Cron route + proxy allowlist

**Files:**
- Create: `app/api/cron/incharge-bill-review/route.ts`
- Modify: `proxy.ts` (PUBLIC_PATHS, after `'/api/cron/fee-payment-notices',` ~line 26)
- Test: `proxy.test.ts`

**Interfaces:**
- Consumes: `runInchargeBillReview(svc, { month?, forcePreview? })` (Task 3).
- Produces: `GET /api/cron/incharge-bill-review[?month=YYYY-MM][&dryRun=1]` → `{ success: true, data: RunSummary }`; 401 without `Authorization: Bearer $CRON_SECRET`.

- [ ] **Step 1: Write the failing proxy test**

In `proxy.test.ts`, inside `describe('proxy cron allowlist', …)`, add after the first `it`:
```ts
  it('allowlists the in-charge bill review cron endpoint', () => {
    expect(SRC).toContain("'/api/cron/incharge-bill-review'");
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `node node_modules/vitest/vitest.mjs run proxy.test.ts`
Expected: FAIL on "allowlists the in-charge bill review cron endpoint".

- [ ] **Step 3: Add the exact path to the proxy**

In `proxy.ts`, directly after the line `'/api/cron/fee-payment-notices',` insert:
```ts
  // Monthly in-charge bill review. Cancels a staff bill only in Auto mode and
  // only for a COMPLETED month (see lib/fees/incharge-bill-review.ts).
  '/api/cron/incharge-bill-review',
```

- [ ] **Step 4: Create the cron route**

Create `app/api/cron/incharge-bill-review/route.ts`:
```ts
/**
 * Monthly in-charge bill review (auto-cancel of staff transport bills).
 *
 * Scheduled from pg_cron daily at 21:30 UTC (03:00 IST) via pg_net with
 * `Authorization: Bearer $CRON_SECRET` (migration 20260930120100). Reviews the
 * previous IST month unless `?month=YYYY-MM` is given. Idempotent: an applied
 * row is final, so repeated nights only refresh previews.
 *
 * `?dryRun=1` forces preview: rows are written, no bill is touched.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runInchargeBillReview } from '@/lib/fees/incharge-bill-review-repo';
import { isMonth } from '@/lib/fees/incharge-bill-review';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const month = request.nextUrl.searchParams.get('month') ?? undefined;
  if (month !== undefined && !isMonth(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const forcePreview = request.nextUrl.searchParams.get('dryRun') === '1';
  try {
    const summary = await runInchargeBillReview(createServiceRoleClient(), { month, forcePreview });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[incharge-bill-review] run failed', e);
    return NextResponse.json({ error: 'In-charge bill review failed' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run the proxy tests**

Run: `node node_modules/vitest/vitest.mjs run proxy.test.ts`
Expected: PASS (4 tests, including "does NOT allowlist the whole /api/cron/ prefix").

- [ ] **Step 6: Commit**

```bash
git add proxy.ts proxy.test.ts app/api/cron/incharge-bill-review/route.ts
git commit -m "feat(fees): cron endpoint for the in-charge bill review"
```

---

### Task 5: Admin API

**Files:**
- Create: `app/api/admin/incharge-bill-review/route.ts` (GET)
- Create: `app/api/admin/incharge-bill-review/settings/route.ts` (PUT)
- Create: `app/api/admin/incharge-bill-review/excused-days/route.ts` (POST, DELETE)
- Create: `app/api/admin/incharge-bill-review/run/route.ts` (POST)

**Interfaces:**
- Consumes: Task 1 (`parseReviewConfig`, `toStoredReviewConfig`, `validateReviewConfig`, `REVIEW_SETTING_TYPE`, `isMonth`, `monthBounds`, `previousMonth`), Task 3 (`loadReviewConfig`, `runInchargeBillReview`), `withAuth`, `requirePerm` (`lib/auth/require-perm.ts`), `logActivity`, `selectByIds`, `istToday`, `TMS_PERMISSIONS`.
- Produces (used by Task 6):
  - `GET /api/admin/incharge-bill-review?month=YYYY-MM` → `{ success: true, data: { month, config: ReviewConfig, excused: Array<{ day: string; reason: string }>, rows: ReviewRowDto[] } }`
  - `type ReviewRowDto = { person_id: string; name: string; staff_code: string | null; routes: string[]; required_days: number; route_days: number; personal_days: number; personal_pct: number; missed_route_dates: string[]; outcome: 'passed' | 'failed' | 'not_enough_days'; reason: string; mode: 'preview' | 'auto'; applied: boolean; bill_action: 'none' | 'cancelled'; outstanding_amount: number; cancelled_amount: number; error: string | null; decided_at: string }` (exported from the GET route file)
  - `PUT …/settings` body `{ mode, minPersonalPct, minRequiredDays }` → `{ success: true, data: ReviewConfig }`
  - `POST …/excused-days` body `{ day: 'YYYY-MM-DD', reason: string }`; `DELETE …/excused-days?day=YYYY-MM-DD` → `{ success: true }`
  - `POST …/run` body `{ month: 'YYYY-MM', preview: boolean }` → `{ success: true, data: RunSummary }`

- [ ] **Step 1: GET route**

Create `app/api/admin/incharge-bill-review/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { selectByIds } from '@/lib/supabase/chunked';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday } from '@/lib/booking/window';
import { isMonth, monthBounds, previousMonth } from '@/lib/fees/incharge-bill-review';
import { loadReviewConfig } from '@/lib/fees/incharge-bill-review-repo';

export type ReviewRowDto = {
  person_id: string;
  name: string;
  staff_code: string | null;
  routes: string[];
  required_days: number;
  route_days: number;
  personal_days: number;
  personal_pct: number;
  missed_route_dates: string[];
  outcome: 'passed' | 'failed' | 'not_enough_days';
  reason: string;
  mode: 'preview' | 'auto';
  applied: boolean;
  bill_action: 'none' | 'cancelled';
  outstanding_amount: number;
  cancelled_amount: number;
  error: string | null;
  decided_at: string;
};

export const GET = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const month = request.nextUrl.searchParams.get('month') ?? previousMonth(istToday());
  if (!isMonth(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  const { first, last } = monthBounds(month);
  const svc = createServiceRoleClient();

  try {
    const [config, reviewRes, excusedRes] = await Promise.all([
      loadReviewConfig(svc),
      svc.from('tms_incharge_bill_review').select('*').eq('month', first),
      svc.from('tms_incharge_excused_day').select('day, reason').gte('day', first).lte('day', last).order('day'),
    ]);
    if (reviewRes.error) throw reviewRes.error;
    if (excusedRes.error) throw excusedRes.error;

    const raw = (reviewRes.data ?? []) as Array<Record<string, unknown>>;
    const staff = await selectByIds<{ id: string; first_name: string | null; last_name: string | null; staff_id: string | null; email: string | null }>(
      svc, 'staff', 'id, first_name, last_name, staff_id, email', raw.map((r) => r.person_id as string),
    );
    const staffById = new Map(staff.map((s) => [s.id, s]));
    const routeIds = [...new Set(raw.flatMap((r) => (r.route_ids as string[]) ?? []))];
    const routes = await selectByIds<{ id: string; route_number: string | null }>(svc, 'tms_route', 'id, route_number', routeIds);
    const routeNo = new Map(routes.map((r) => [r.id, r.route_number ?? '?']));

    const rows: ReviewRowDto[] = raw.map((r) => {
      const s = staffById.get(r.person_id as string);
      return {
        person_id: r.person_id as string,
        name: s ? [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || '—' : '—',
        staff_code: s?.staff_id ?? null,
        routes: ((r.route_ids as string[]) ?? []).map((id) => routeNo.get(id) ?? '?'),
        required_days: Number(r.required_days),
        route_days: Number(r.route_days),
        personal_days: Number(r.personal_days),
        personal_pct: Number(r.personal_pct),
        missed_route_dates: (r.missed_route_dates as string[]) ?? [],
        outcome: r.outcome as ReviewRowDto['outcome'],
        reason: r.reason as string,
        mode: r.mode as ReviewRowDto['mode'],
        applied: r.applied === true,
        bill_action: r.bill_action as ReviewRowDto['bill_action'],
        outstanding_amount: Number(r.outstanding_amount),
        cancelled_amount: Number(r.cancelled_amount),
        error: (r.error as string | null) ?? null,
        decided_at: r.decided_at as string,
      };
    });

    return NextResponse.json({ success: true, data: { month, config, excused: excusedRes.data ?? [], rows } });
  } catch (e) {
    console.error('[incharge-bill-review] GET failed', e);
    return NextResponse.json({ error: 'Failed to load the bill review' }, { status: 500 });
  }
});
```

- [ ] **Step 2: Settings route**

Create `app/api/admin/incharge-bill-review/settings/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { REVIEW_SETTING_TYPE, toStoredReviewConfig, validateReviewConfig, type ReviewConfig } from '@/lib/fees/incharge-bill-review';
import { loadReviewConfig } from '@/lib/fees/incharge-bill-review-repo';

export const PUT = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = { mode: body.mode, minPersonalPct: body.minPersonalPct, minRequiredDays: body.minRequiredDays };
  const invalid = validateReviewConfig(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const next = input as ReviewConfig;

  const svc = createServiceRoleClient();
  const before = await loadReviewConfig(svc);
  const { error } = await svc.from('admin_settings').upsert(
    { setting_type: REVIEW_SETTING_TYPE, settings_data: toStoredReviewConfig(next), updated_at: new Date().toISOString(), updated_by: auth.userId },
    { onConflict: 'setting_type' },
  );
  if (error) return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });

  await logActivity(auth, request, {
    module: 'settings',
    action: 'update',
    entityType: 'admin_settings',
    entityId: REVIEW_SETTING_TYPE,
    entityLabel: 'In-charge bill review',
    description: `In-charge bill review mode ${before.mode} → ${next.mode}`,
    changes: { before, after: next },
  });
  return NextResponse.json({ success: true, data: next });
});
```

- [ ] **Step 3: Excused-days route**

Create `app/api/admin/incharge-bill-review/excused-days/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const POST = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { day?: unknown; reason?: unknown };
  const day = String(body.day ?? '');
  const reason = String(body.reason ?? '').trim();
  if (!ISO_DATE.test(day)) return NextResponse.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 });

  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_incharge_excused_day').upsert({ day, reason, created_by: auth.userId }, { onConflict: 'day' });
  if (error) return NextResponse.json({ error: 'Failed to save the excused day' }, { status: 500 });
  await logActivity(auth, request, {
    module: 'fees', action: 'create', entityType: 'tms_incharge_excused_day', entityId: day,
    entityLabel: day, description: `Excused ${day} from the in-charge bill review: ${reason}`,
  });
  return NextResponse.json({ success: true });
});

export const DELETE = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const day = request.nextUrl.searchParams.get('day') ?? '';
  if (!ISO_DATE.test(day)) return NextResponse.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_incharge_excused_day').delete().eq('day', day);
  if (error) return NextResponse.json({ error: 'Failed to remove the excused day' }, { status: 500 });
  await logActivity(auth, request, {
    module: 'fees', action: 'delete', entityType: 'tms_incharge_excused_day', entityId: day,
    entityLabel: day, description: `Removed excused day ${day} from the in-charge bill review`,
  });
  return NextResponse.json({ success: true });
});
```

- [ ] **Step 4: Run route**

Create `app/api/admin/incharge-bill-review/run/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { isMonth, monthLabel } from '@/lib/fees/incharge-bill-review';
import { runInchargeBillReview } from '@/lib/fees/incharge-bill-review-repo';

export const POST = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { month?: unknown; preview?: unknown };
  const month = String(body.month ?? '');
  if (!isMonth(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  try {
    const summary = await runInchargeBillReview(createServiceRoleClient(), { month, forcePreview: body.preview !== false });
    await logActivity(auth, request, {
      module: 'fees',
      action: summary.mode === 'auto' ? 'apply' : 'generate',
      entityType: 'tms_incharge_bill_review',
      entityId: month,
      entityLabel: monthLabel(month),
      description: `In-charge bill review ${summary.mode} for ${monthLabel(month)}: ${summary.passed} pass, ${summary.failed} fail, ${summary.cancelledPeople} cancelled`,
      metadata: { ...summary },
    });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[incharge-bill-review] run failed', e);
    return NextResponse.json({ error: 'The review run failed' }, { status: 500 });
  }
});
```
Note: `preview` defaults to TRUE — a request must say `preview: false` explicitly to apply, and even then the engine applies only in Auto mode and only for a completed month.

- [ ] **Step 5: Type-check the new routes**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -E "incharge-bill-review" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/incharge-bill-review
git commit -m "feat(fees): admin API for the in-charge bill review"
```

---

### Task 6: Admin page

**Files:**
- Create: `app/(admin)/staff-route-assignments/bill-review/columns.tsx`
- Create: `app/(admin)/staff-route-assignments/bill-review/page.tsx`
- Modify: `app/(admin)/staff-route-assignments/page.tsx` (imports ~line 3-11; header buttons ~line 62-77)

**Interfaces:**
- Consumes: Task 5 endpoints and `ReviewRowDto`; Task 1 `previousMonth`, `monthLabel`, `ReviewConfig`, `ReviewMode`; `DataTable` (`components/ui/data-table.tsx`); `UniversalStatCard`; `usePermissions` (`hooks/use-permissions.ts`, returns `{ can, isSuperAdmin }`); `istToday`.

- [ ] **Step 1: Columns**

Create `app/(admin)/staff-route-assignments/bill-review/columns.tsx`:
```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ReviewRowDto } from '@/app/api/admin/incharge-bill-review/route';

const OUTCOME_STYLE: Record<ReviewRowDto['outcome'], string> = {
  passed: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  not_enough_days: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
};
const OUTCOME_LABEL: Record<ReviewRowDto['outcome'], string> = {
  passed: 'Pass', failed: 'Fail', not_enough_days: 'Not enough days',
};
const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN')}`;
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });

export function getReviewColumns(): ColumnDef<ReviewRowDto>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Staff',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          {row.original.staff_code && <div className="text-xs text-gray-500">{row.original.staff_code}</div>}
        </div>
      ),
    },
    { id: 'routes', header: 'Route', accessorFn: (r) => r.routes.join(', ') },
    {
      id: 'route',
      header: 'Bus marked',
      accessorFn: (r) => r.route_days,
      cell: ({ row }) => `${row.original.route_days} / ${row.original.required_days}`,
    },
    {
      id: 'own',
      header: 'Own marks',
      accessorFn: (r) => r.personal_pct,
      cell: ({ row }) => `${row.original.personal_days} / ${row.original.required_days} (${row.original.personal_pct}%)`,
    },
    {
      id: 'missed',
      header: 'Missed bus days',
      accessorFn: (r) => r.missed_route_dates.join(' '),
      cell: ({ row }) => row.original.missed_route_dates.map(shortDate).join(', ') || '—',
    },
    {
      accessorKey: 'outcome',
      header: 'Result',
      filterFn: (row, id, value) => !value || row.getValue(id) === value,
      cell: ({ row }) => (
        <span title={row.original.reason} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[row.original.outcome]}`}>
          {OUTCOME_LABEL[row.original.outcome]}
        </span>
      ),
    },
    {
      id: 'bill',
      header: 'Bill',
      accessorFn: (r) => r.outstanding_amount,
      cell: ({ row }) => {
        const r = row.original;
        if (r.applied && r.bill_action === 'cancelled') return <span className="text-green-700 dark:text-green-400">Cancelled {rupees(r.cancelled_amount)}</span>;
        if (r.error) return <span className="text-red-600" title={r.error}>Error</span>;
        return rupees(r.outstanding_amount);
      },
    },
  ];
}
```

- [ ] **Step 2: Page**

Create `app/(admin)/staff-route-assignments/bill-review/page.tsx`:
```tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, IndianRupee, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday } from '@/lib/booking/window';
import { previousMonth, monthLabel, type ReviewConfig, type ReviewMode } from '@/lib/fees/incharge-bill-review';
import type { ReviewRowDto } from '@/app/api/admin/incharge-bill-review/route';
import { getReviewColumns } from './columns';

type ReviewData = { month: string; config: ReviewConfig; excused: Array<{ day: string; reason: string }>; rows: ReviewRowDto[] };

async function fetchReview(month: string): Promise<ReviewData> {
  const res = await fetch(`/api/admin/incharge-bill-review?month=${month}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load');
  return json.data as ReviewData;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

/** The current month and the five before it, newest first. */
function monthOptions(): string[] {
  const out: string[] = [istToday().slice(0, 7)];
  let cursor = istToday();
  for (let i = 0; i < 5; i++) {
    const m = previousMonth(cursor);
    out.push(m);
    cursor = `${m}-15`;
  }
  return out;
}

const MODE_TEXT: Record<ReviewMode, string> = {
  off: 'Off — nothing runs.',
  preview: 'Preview — shows who would pass; no bill changes.',
  auto: 'Auto — passing staff have their bill cancelled after each month ends.',
};

export default function InchargeBillReviewPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can(TMS_PERMISSIONS.FEES_EDIT);
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[1]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ReviewConfig | null>(null);
  const [excDay, setExcDay] = useState('');
  const [excReason, setExcReason] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['incharge-bill-review', month], queryFn: () => fetchReview(month) });
  const config = draft ?? data?.config ?? null;
  const rows = data?.rows ?? [];
  const columns = useMemo(() => getReviewColumns(), []);
  const refresh = () => qc.invalidateQueries({ queryKey: ['incharge-bill-review'] });

  const stats = useMemo(() => ({
    passed: rows.filter((r) => r.outcome === 'passed').length,
    failed: rows.filter((r) => r.outcome === 'failed').length,
    notEnough: rows.filter((r) => r.outcome === 'not_enough_days').length,
    cancelled: rows.reduce((s, r) => s + (r.applied ? r.cancelled_amount : 0), 0),
  }), [rows]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">In-charge bill review</h1>
          <p className="text-gray-600 dark:text-gray-400">
            A bus in-charge&apos;s staff transport bill is cancelled when, for a full month, their bus was scanned every service day and they marked on at least {data?.config.minPersonalPct ?? 75}% of those days.
          </p>
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-[38px] shrink-0 rounded-lg border px-3 text-sm dark:bg-gray-900">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <UniversalStatCard title="Pass" value={stats.passed} icon={CheckCircle2} color="green" loading={isLoading} />
        <UniversalStatCard title="Fail" value={stats.failed} icon={XCircle} color="red" loading={isLoading} />
        <UniversalStatCard title="Not enough days" value={stats.notEnough} icon={Clock} color="yellow" loading={isLoading} />
        <UniversalStatCard title="Cancelled" value={`Rs ${stats.cancelled.toLocaleString('en-IN')}`} icon={IndianRupee} color="teal" loading={isLoading} />
      </div>

      {canEdit && config && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border p-4 dark:border-gray-700">
            <h2 className="mb-3 font-semibold">Mode</h2>
            <div className="space-y-2">
              {(['off', 'preview', 'auto'] as ReviewMode[]).map((m) => (
                <label key={m} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="mode" checked={config.mode === m} onChange={() => setDraft({ ...config, mode: m })} className="mt-1" />
                  <span>{MODE_TEXT[m]}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">Own marks %
                <input type="number" min={1} max={100} value={config.minPersonalPct} onChange={(e) => setDraft({ ...config, minPersonalPct: Number(e.target.value) })} className="w-20 rounded border px-2 py-1 dark:bg-gray-900" />
              </label>
              <label className="flex items-center gap-2">Min days
                <input type="number" min={1} max={26} value={config.minRequiredDays} onChange={(e) => setDraft({ ...config, minRequiredDays: Number(e.target.value) })} className="w-20 rounded border px-2 py-1 dark:bg-gray-900" />
              </label>
            </div>
            <button
              disabled={busy || !draft}
              onClick={() => act(async () => { await send('/api/admin/incharge-bill-review/settings', 'PUT', config); setDraft(null); }, 'Settings saved')}
              className="mt-3 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >Save</button>
          </section>

          <section className="rounded-xl border p-4 dark:border-gray-700">
            <h2 className="mb-1 font-semibold">Excused days</h2>
            <p className="mb-3 text-xs text-gray-500">Days that do not count at all (for example a system outage). Holidays in the service calendar and days nobody in the fleet marked are skipped automatically.</p>
            <ul className="mb-3 space-y-1 text-sm">
              {(data?.excused ?? []).map((e) => (
                <li key={e.day} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{e.day} — {e.reason}</span>
                  <button disabled={busy} onClick={() => act(() => send(`/api/admin/incharge-bill-review/excused-days?day=${e.day}`, 'DELETE'), 'Removed')} className="shrink-0 text-xs text-red-600">Remove</button>
                </li>
              ))}
              {(data?.excused ?? []).length === 0 && <li className="text-gray-500">None this month.</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <input type="date" value={excDay} onChange={(e) => setExcDay(e.target.value)} className="rounded border px-2 py-1 text-sm dark:bg-gray-900" />
              <input placeholder="Reason" value={excReason} onChange={(e) => setExcReason(e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1 text-sm dark:bg-gray-900" />
              <button
                disabled={busy || !excDay || !excReason.trim()}
                onClick={() => act(async () => { await send('/api/admin/incharge-bill-review/excused-days', 'POST', { day: excDay, reason: excReason }); setExcDay(''); setExcReason(''); }, 'Excused day added')}
                className="rounded-lg border border-green-600 px-3 py-1 text-sm text-green-700 disabled:opacity-50 dark:text-green-400"
              >Add</button>
            </div>
          </section>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => act(() => send('/api/admin/incharge-bill-review/run', 'POST', { month, preview: true }), 'Preview updated')}
            className="inline-flex items-center gap-2 rounded-lg border border-green-600 px-3 py-2 text-sm font-medium text-green-700 disabled:opacity-50 dark:text-green-400">
            <Play className="h-4 w-4" /> Run preview for {monthLabel(month)}
          </button>
          {data?.config.mode === 'auto' && (
            <button disabled={busy} onClick={() => act(() => send('/api/admin/incharge-bill-review/run', 'POST', { month, preview: false }), 'Review applied')}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Apply now (cancels passing bills)
            </button>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        entityName="staff"
        searchPlaceholder="Search staff or route…"
        getRowId={(r) => r.person_id}
        filters={[{ columnId: 'outcome', title: 'Result', options: [
          { label: 'Pass', value: 'passed' }, { label: 'Fail', value: 'failed' }, { label: 'Not enough days', value: 'not_enough_days' },
        ] }]}
      />
    </div>
  );
}
```

The `filters` literal matches `DataTableFilter` in `components/ui/data-table.tsx:18` (`{ columnId, title, options: { label, value }[] }`), verified 2026-09-30.

- [ ] **Step 3: Link from Staff Route Assignments**

In `app/(admin)/staff-route-assignments/page.tsx`:
1. Add imports next to the existing ones:
```tsx
import { Receipt } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
```
2. After `const canManage = …;` add:
```tsx
  const { can } = usePermissions();
  const canSeeBillReview = can(TMS_PERMISSIONS.FEES_VIEW);
```
3. Replace the header's `{canManage && (` wrapper opening `<div className="flex shrink-0 flex-wrap gap-2">` block so the new button renders for `canSeeBillReview` even when `canManage` is false:
```tsx
        {(canManage || canSeeBillReview) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {canSeeBillReview && (
              <button
                onClick={() => router.push('/staff-route-assignments/bill-review')}
                className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Receipt className="h-4 w-4" /> Bill review
              </button>
            )}
            {canManage && (
              <>
                {/* existing Bulk Assign button, unchanged */}
                {/* existing Assign Route button, unchanged */}
              </>
            )}
          </div>
        )}
```
(Move the two existing `<button>` elements, unchanged, inside the `<>…</>` fragment in place of the two comments.)

- [ ] **Step 4: Type-check the page files**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -E "bill-review|staff-route-assignments/page" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 5: Build**

Run: `set -a; . ../../.env; set +a; node node_modules/next/dist/bin/next build 2>&1 | tail -25`
Expected: build succeeds; `/staff-route-assignments/bill-review` and `/api/cron/incharge-bill-review` appear in the route list.

- [ ] **Step 6: Full test suite**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: PASS (all files).

- [ ] **Step 7: Commit**

```bash
git add "app/(admin)/staff-route-assignments"
git commit -m "feat(fees): In-charge bill review admin page"
```

---

### Task 7: Schedule, deploy and first live preview

**Files:**
- Create: `supabase/migrations/20260930120100_schedule_incharge_bill_review.sql`

- [ ] **Step 1: Write the schedule migration (do NOT apply yet)**

```sql
-- Apply only AFTER the app is deployed, or the job 404s nightly.
-- Same pg_cron + pg_net + vault mechanism as tms-fee-payment-notices.
-- 21:30 UTC = 03:00 IST. Reviews the previous month; idempotent.

do $$
begin
  perform cron.unschedule('tms-incharge-bill-review');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-incharge-bill-review',
  '30 21 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/incharge-bill-review',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verify: select jobname, schedule, active from cron.job where jobname = 'tms-incharge-bill-review';
-- Off switch: select cron.unschedule('tms-incharge-bill-review');
```

Commit:
```bash
git add supabase/migrations/20260930120100_schedule_incharge_bill_review.sql
git commit -m "chore(db): schedule the in-charge bill review nightly (apply after deploy)"
```

- [ ] **Step 2: Whole-branch review, then ask the owner before pushing**

Run the final review (per the chosen execution method). Then STOP and ask the owner to approve pushing to `main` (pushing deploys to production). Before pushing: `git fetch origin && git log --oneline origin/main..HEAD` and `git merge-base --is-ancestor origin/main HEAD` (rebase on origin/main if false). Push with `gh auth switch --user sangeethav-byte` then `git push origin HEAD:main`. Wait for the Vercel deploy to succeed.

- [ ] **Step 3: Apply the schedule and excuse 23 Sep**

`mcp__supabase__apply_migration` name `schedule_incharge_bill_review` with the Step 1 SQL. Then:
```sql
insert into tms_incharge_excused_day (day, reason) values ('2026-09-23', 'Fleet-wide scanning outage')
on conflict (day) do nothing;
select jobname, schedule, active from cron.job where jobname = 'tms-incharge-bill-review';
```
Expected: one active job `30 21 * * *`.

- [ ] **Step 4: Trigger a preview for September from the database**

```sql
select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
         || '/api/cron/incharge-bill-review?month=2026-09&dryRun=1',
  headers := jsonb_build_object('Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
  timeout_milliseconds := 120000) as request_id;
```
Then (after ~10 s) read the response: `select status_code, content from net._http_response where id = <request_id>;`
Expected: `200`, `"mode":"preview"`, `candidates` ≈ 37, `passed` ≈ 20.

- [ ] **Step 5: Check the preview against the hand count and that no bill moved**

```sql
select outcome, count(*), sum(outstanding_amount) from tms_incharge_bill_review where month = '2026-09-01' group by 1;
select count(*) filter (where status = 'staff_deferred') deferred, count(*) filter (where status = 'cancelled') cancelled
from tms_fee_bill where person_type = 'staff';
```
Expected: ≈ 20 passed / ≈ 11 failed / ≈ 6 not-enough-or-failed; bills still `37` deferred and `1` cancelled. Explain every difference from the 2026-09-30 hand count in the owner report (names + reason column).

- [ ] **Step 6: Idempotency check**

Repeat Step 4; confirm the same counts and `select count(*) from tms_incharge_bill_review where month='2026-09-01'` unchanged (upsert, not duplicate).

- [ ] **Step 7: Hand over**

Report to the owner: the September preview table (name, route, bus days, own %, result), how to switch Mode → Auto on `/staff-route-assignments/bill-review`, that Auto will cancel September passes on the next 03:00 IST run (or immediately via "Apply now"), and the owed browser check of the page (agent Chrome is unauthenticated). Remove the node_modules junction: `cmd.exe /c rmdir node_modules`.
