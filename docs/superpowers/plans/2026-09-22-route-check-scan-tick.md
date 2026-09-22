# Route Check — Scan, Verify, Tick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An assigned route checker opens Route Check in the staff app, starts today's check for one of their routes, sees the route's learners and staff with **Paid/Unpaid** and **Booked/No booking**, scans each person's MyJKKN QR or ID-card barcode, and each successful scan puts a **✓ tick** on that person (recorded as a `tms_route_check_person` row) — then submits the check.

**Architecture:** Builds on the committed backend of `feat/route-checkers` (schema, `tms_route_checker_route_ids`, `lib/route-check/*`, `lib/attendance/route-roster.ts`). One small migration fixes the person-row CHECK (unknown cards were unstorable) and adds the one-tick-per-person unique indexes. Pure logic (entries, tick index, outcome display) lives in `lib/route-check/*` with tests; I/O in `lib/route-check/evaluate.ts` + `check-access.ts`; six checker APIs under `app/api/boarding/route-check/**`; access via `proxy.ts` (already done, uncommitted) + `/api/boarding/access` + the boarding layout's new `checker_only` mode; two staff-app pages under `app/boarding/route-check/**`; the scanner is the existing `BusScanner` extended with barcode formats and a wide frame.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role via `createServiceRoleClient`, `withAuth`), TanStack Query, `html5-qrcode` 2.3.8 (QR_CODE + CODE_39 + CODE_128), `react-hot-toast`, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-route-checkers-design.md` (sections Access, Data, Outcomes, Screens → "Staff app → Route Check"). The earlier plan `docs/superpowers/plans/2026-09-21-route-checkers.md` covers Tasks 1–5 (done) and the parts this plan defers.

**Scope of THIS plan (confirmed focus: scan → paid/unpaid + booked/not booked → tick):**
- IN: checker access (access API, layout checker-only mode, nav), my-routes + start, check view with roster/badges/ticks, QR + barcode scan → verify → tick, candidate picker for ambiguous barcodes, remove a tick while draft, submit with snapshot counts.
- OUT (next plan, already specified in the 2026-09-21 plan): admin pages `/route-checkers` + `/route-checks` (Task 6 there), manual "add person without card" entries, headcount / unknown-count / notes fields, inspection-screen link.

## Global Constraints

- Worktree `D:\Sangeetha_V\TMS-ADMIN\.worktrees\route-checkers`, branch `feat/route-checkers`. `node_modules` is a junction to main. Never commit `.env*` or `.next`; `git add` by path only.
- Supabase project `kvizhngldtiuufknvehv`. Apply migrations with MCP `apply_migration` AND commit the `.sql`. Re-run once (idempotent). Confirm with read-only SQL.
- API pattern: `withAuth` + `createServiceRoleClient()`; responses `{ success, data }` / `{ error }`; **every read's `error` is checked** — a failed read never renders as "nobody"; `.in()` chunked ≤150 (use `selectIn` from `lib/route-check/admin.ts`); every mutation `await logActivity(auth, request, { module: 'route-checks', … })`.
- Checks are **verify-only**: never write `tms_attendance`, `tms_booking`, or any fee table.
- Scans are **camera only**: the API refuses `source !== 'camera'`; photo fallback must pass `isFreshCapture`. `components/boarding/scan-dialog.tsx` and the inspection scanners must behave exactly as before (BusScanner defaults unchanged).
- Dates via `istToday()` (`lib/booking/window.ts`); legs `'onward' | 'return'` labelled with `LEG_NAME` (`lib/boarding/attendance-window.ts`).
- Fee badge = `rosterFeeBadge` state via `loadRosterFees` (bulk RPC `tms_transport_fee_status_bulk`) so the tick agrees with the list. Fee lookup is display-only and fail-soft (`unknown`), never "paid" by default.
- UI: mobile-first 360–390 px, `min-w-0`/`truncate`, no horizontal overflow, `dark:` variants, `react-hot-toast`; no `localStorage` for permissions.
- Verify commands: `npx vitest run lib/route-check lib/attendance lib/boarding` and scoped `npx tsc --noEmit -p . 2>&1 | grep -E "route-check|boarding/(layout|route-check)|boarding-bottom-nav|bus-scanner|proxy\.ts|boarding/access" || echo CLEAN`. `npm run lint` is broken — don't run it.
- Commit message trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 0: Commit the pending hunks

**Files:**
- Already modified (uncommitted): `lib/route-check/resolve.ts`, `lib/route-check/resolve.test.ts`, `proxy.ts`

- [ ] **Step 1: Verify they are green**

Run: `npx vitest run lib/route-check/resolve.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 2: Commit in two commits**

```bash
git add lib/route-check/resolve.ts lib/route-check/resolve.test.ts
git commit -m "fix(route-checks): candidates carry an active flag; wildcard-safe id_code lookup

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git add proxy.ts
git commit -m "feat(route-checks): proxy admits assigned route checkers to the boarding area

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Migration — storable unknown cards + one tick per person

**Files:**
- Create: `supabase/migrations/20260922100000_route_check_person_unknown_and_unique.sql`

**Why:** `tms_route_check_person.person_kind` only allows `learner|staff|manual`, and the kind-fields CHECK demands `learner_id` / `staff_id` / `manual_type+manual_name`. An unrecognised scan (`outcome='unknown_card'`) fits none → today it cannot be inserted. Also nothing stops the same learner being inserted twice in one check; the tick must be idempotent.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Route Check person rows: allow an 'unknown' kind (an unrecognised card is
-- still a finding worth keeping, with the code that was scanned), and make a
-- tick idempotent: one row per learner / per staff per check.
-- Target: shared MyJKKN project kvizhngldtiuufknvehv. Idempotent / safe to re-run.
-- Spec: docs/superpowers/specs/2026-09-21-route-checkers-design.md
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tms_route_check_person
  drop constraint if exists tms_route_check_person_person_kind_check;
alter table public.tms_route_check_person
  add constraint tms_route_check_person_person_kind_check
  check (person_kind in ('learner','staff','manual','unknown'));

alter table public.tms_route_check_person
  drop constraint if exists tms_route_check_person_kind_fields;
alter table public.tms_route_check_person
  add constraint tms_route_check_person_kind_fields check (
    (person_kind = 'learner' and learner_id is not null)
    or (person_kind = 'staff' and staff_id is not null)
    or (person_kind = 'manual' and manual_type is not null and manual_name is not null)
    or (person_kind = 'unknown' and scanned_code is not null and outcome = 'unknown_card')
  );

-- One tick per person per check. A re-scan hits 23505 and the API returns the
-- existing row as "already checked" instead of a second line.
create unique index if not exists uq_tms_route_check_person_learner
  on public.tms_route_check_person (check_id, learner_id) where learner_id is not null;
create unique index if not exists uq_tms_route_check_person_staff
  on public.tms_route_check_person (check_id, staff_id) where staff_id is not null;
```

- [ ] **Step 2: Apply with MCP `apply_migration`** (name `route_check_person_unknown_and_unique`), then run the same SQL once more via `execute_sql` to prove idempotency.

- [ ] **Step 3: Verify**

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.tms_route_check_person'::regclass and conname like 'tms_route_check_person_%';
select indexname from pg_indexes where tablename = 'tms_route_check_person';
```
Expected: kind check lists `'unknown'`; both `uq_tms_route_check_person_*` indexes present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922100000_route_check_person_unknown_and_unique.sql
git commit -m "feat(route-checks): storable unknown-card rows and one tick per person per check

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared types, pure entry helpers and outcome display (TDD)

**Files:**
- Create: `lib/route-check/types.ts`
- Create: `lib/route-check/entries.ts`, `lib/route-check/entries.test.ts`
- Create: `lib/route-check/outcome-meta.ts`

**Interfaces (Produces):**
```ts
// types.ts — shared by APIs and pages (no I/O, no React)
import type { CheckOutcome } from './outcome';
import type { FeeState } from '@/lib/boarding/fee-roster';
import type { OtherBus } from '@/lib/booking/roster';
import type { Candidate } from './resolve';

export type CheckLeg = 'onward' | 'return';
export type CheckStatus = 'draft' | 'submitted';
export type PersonKind = 'learner' | 'staff' | 'manual' | 'unknown';
export type EntryFeeState = FeeState | 'exempt';
export type MatchedBy = 'jkkn_id' | 'uuid' | 'roll_number' | 'register_number' | 'staff_id' | 'manual';

/** One recorded line of a check (a tick, a manual entry or an unknown card). */
export interface CheckPersonEntry {
  id: string;
  kind: PersonKind;
  learnerId: string | null;
  staffId: string | null;
  name: string | null;
  /** Roll / register number or staff code — what the checker recognises the person by. */
  code: string | null;
  outcome: CheckOutcome;
  onRoute: boolean | null;
  booked: boolean | null;
  feeState: EntryFeeState | null;
  matchedBy: MatchedBy | null;
  scannedCode: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CheckHeader {
  id: string;
  routeId: string;
  status: CheckStatus;
  checkDate: string;
  leg: CheckLeg;
  startedAt: string;
  submittedAt: string | null;
}

export interface CheckRouteInfo { id: string; routeNumber: string | null; routeName: string | null; vehicleReg: string | null }

export interface CheckLearnerRow {
  learnerId: string;
  name: string;
  roll: string | null;
  stopId: string | null;
  stopName: string;
  stopTime: string | null;
  status: 'present' | 'absent' | 'unmarked';
  booked: boolean;
  feeState: FeeState;
  feeOwed: number | null;
  notOnRoute: boolean;
  otherBus: OtherBus | null;
  /** Ticked in THIS check (a tms_route_check_person row exists). */
  checked: boolean;
  checkOutcome: CheckOutcome | null;
}

export interface CheckStaffRow {
  staffId: string;
  name: string;
  designation: string | null;
  code: string | null;
  isIncharge: boolean;
  feeState: EntryFeeState;
  feeOwed: number | null;
  checked: boolean;
  checkOutcome: CheckOutcome | null;
}

export interface CheckCounts {
  registered: number; booked: number; present: number; unpaid: number;
  withoutBooking: number; notOnRoute: number; checked: number;
}

export interface CheckView {
  check: CheckHeader;
  route: CheckRouteInfo;
  learners: CheckLearnerRow[];
  staff: CheckStaffRow[];
  counts: CheckCounts;
  entries: CheckPersonEntry[];
}

export interface MyCheckRoute {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  vehicleReg: string | null;
  today: { onward: { id: string; status: CheckStatus } | null; return: { id: string; status: CheckStatus } | null };
}

export type ScanResponse =
  | { kind: 'recorded'; entry: CheckPersonEntry; alreadyChecked: boolean; feeOwed: number | null }
  | { kind: 'candidates'; code: string; candidates: Candidate[] };
```

```ts
// entries.ts — pure
export interface PersonDbRow {
  id: string; check_id: string; person_kind: PersonKind; learner_id: string | null; staff_id: string | null;
  manual_type: string | null; manual_name: string | null; matched_by: MatchedBy | null; scanned_code: string | null;
  outcome: CheckOutcome; on_route: boolean | null; booked: boolean | null; fee_state: EntryFeeState | null;
  notes: string | null; created_at: string;
}
export interface NameBook { learners: Map<string, { name: string; code: string | null }>; staff: Map<string, { name: string; code: string | null }> }
export function personEntryFromRow(row: PersonDbRow, names: NameBook): CheckPersonEntry;
/** learnerId → outcome and staffId → outcome for the ticks; later rows win (there is one per person anyway). */
export function tickIndex(entries: CheckPersonEntry[]): { learners: Map<string, CheckOutcome>; staff: Map<string, CheckOutcome> };
/** A roster row is "not on this route" when it was seen boarding a different bus today. */
export function notOnRouteOf(row: { other_bus?: { kind: 'booked' | 'boarded' | 'from' } | null }): boolean;
/** Registered = allocated to or booked on this route (everything except 'from' another bus). */
export function registeredCount(rows: { other_bus?: { kind: 'booked' | 'boarded' | 'from' } | null }[]): number;
export function entryFeeState(i: { isIncharge: boolean; hasBill: boolean; hasOutstanding: boolean }): EntryFeeState; // exempt → none → unpaid → paid
```

- [ ] **Step 1: Write the failing tests** `lib/route-check/entries.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { personEntryFromRow, tickIndex, notOnRouteOf, registeredCount, entryFeeState, type PersonDbRow } from './entries';
import type { CheckPersonEntry } from './types';

const row = (over: Partial<PersonDbRow>): PersonDbRow => ({
  id: 'p1', check_id: 'c1', person_kind: 'learner', learner_id: 'L1', staff_id: null,
  manual_type: null, manual_name: null, matched_by: 'jkkn_id', scanned_code: '123456-7',
  outcome: 'ok', on_route: true, booked: true, fee_state: 'paid', notes: null, created_at: '2026-09-22T01:00:00Z',
  ...over,
});
const names = {
  learners: new Map([['L1', { name: 'Anu', code: 'ES24031' }]]),
  staff: new Map([['S1', { name: 'Kumar', code: 'JKKN123' }]]),
};

describe('personEntryFromRow', () => {
  it('learner row takes name/code from the name book', () => {
    const e = personEntryFromRow(row({}), names);
    expect(e).toMatchObject({ id: 'p1', kind: 'learner', learnerId: 'L1', name: 'Anu', code: 'ES24031', outcome: 'ok', feeState: 'paid' });
  });
  it('staff row uses the staff book', () => {
    const e = personEntryFromRow(row({ person_kind: 'staff', learner_id: null, staff_id: 'S1', matched_by: 'staff_id' }), names);
    expect(e.name).toBe('Kumar'); expect(e.code).toBe('JKKN123'); expect(e.staffId).toBe('S1');
  });
  it('manual row uses manual_name; unknown row has no name and keeps the scanned code', () => {
    expect(personEntryFromRow(row({ person_kind: 'manual', learner_id: null, manual_type: 'outside', manual_name: 'Visitor', outcome: 'manual' }), names).name).toBe('Visitor');
    const u = personEntryFromRow(row({ person_kind: 'unknown', learner_id: null, outcome: 'unknown_card', scanned_code: 'ZZZ' }), names);
    expect(u.name).toBeNull(); expect(u.scannedCode).toBe('ZZZ');
  });
  it('a learner missing from the book still yields an entry with null name', () => {
    expect(personEntryFromRow(row({ learner_id: 'L9' }), names).name).toBeNull();
  });
});

describe('tickIndex', () => {
  const e = (over: Partial<CheckPersonEntry>): CheckPersonEntry => ({
    id: 'x', kind: 'learner', learnerId: null, staffId: null, name: null, code: null, outcome: 'ok',
    onRoute: null, booked: null, feeState: null, matchedBy: null, scannedCode: null, notes: null, createdAt: '', ...over,
  });
  it('maps learner and staff ids to their outcome; unknown/manual are skipped', () => {
    const t = tickIndex([e({ learnerId: 'L1', outcome: 'ok' }), e({ kind: 'staff', staffId: 'S1', outcome: 'fee_unpaid' }), e({ kind: 'unknown', outcome: 'unknown_card' })]);
    expect(t.learners.get('L1')).toBe('ok'); expect(t.staff.get('S1')).toBe('fee_unpaid'); expect(t.learners.size).toBe(1);
  });
});

describe('notOnRouteOf / registeredCount', () => {
  it('only a "from another bus" marker is not-on-route', () => {
    expect(notOnRouteOf({ other_bus: { kind: 'from' } })).toBe(true);
    expect(notOnRouteOf({ other_bus: { kind: 'booked' } })).toBe(false);
    expect(notOnRouteOf({})).toBe(false);
  });
  it('registered excludes "from" rows', () => {
    expect(registeredCount([{}, { other_bus: { kind: 'from' } }, { other_bus: null }])).toBe(2);
  });
});

describe('entryFeeState', () => {
  it('in-charge is exempt regardless of bills', () => {
    expect(entryFeeState({ isIncharge: true, hasBill: true, hasOutstanding: true })).toBe('exempt');
  });
  it('no bill → none; outstanding → unpaid; else paid', () => {
    expect(entryFeeState({ isIncharge: false, hasBill: false, hasOutstanding: false })).toBe('none');
    expect(entryFeeState({ isIncharge: false, hasBill: true, hasOutstanding: true })).toBe('unpaid');
    expect(entryFeeState({ isIncharge: false, hasBill: true, hasOutstanding: false })).toBe('paid');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/route-check/entries.test.ts`
Expected: FAIL — cannot resolve `./entries`

- [ ] **Step 3: Write `types.ts`** exactly as in Interfaces above (all exports, plus the imports shown).

- [ ] **Step 4: Write `entries.ts`**

```ts
/**
 * Pure helpers for Route Check person entries (ticks). No I/O.
 */
import type { CheckOutcome } from './outcome';
import type { CheckPersonEntry, EntryFeeState, MatchedBy, PersonKind } from './types';

export interface PersonDbRow {
  id: string; check_id: string; person_kind: PersonKind; learner_id: string | null; staff_id: string | null;
  manual_type: string | null; manual_name: string | null; matched_by: MatchedBy | null; scanned_code: string | null;
  outcome: CheckOutcome; on_route: boolean | null; booked: boolean | null; fee_state: EntryFeeState | null;
  notes: string | null; created_at: string;
}

export interface NameBook {
  learners: Map<string, { name: string; code: string | null }>;
  staff: Map<string, { name: string; code: string | null }>;
}

export function personEntryFromRow(row: PersonDbRow, names: NameBook): CheckPersonEntry {
  let name: string | null = null;
  let code: string | null = null;
  if (row.person_kind === 'learner' && row.learner_id) {
    const l = names.learners.get(row.learner_id);
    name = l?.name ?? null; code = l?.code ?? null;
  } else if (row.person_kind === 'staff' && row.staff_id) {
    const s = names.staff.get(row.staff_id);
    name = s?.name ?? null; code = s?.code ?? null;
  } else if (row.person_kind === 'manual') {
    name = row.manual_name;
  }
  return {
    id: row.id, kind: row.person_kind, learnerId: row.learner_id, staffId: row.staff_id, name, code,
    outcome: row.outcome, onRoute: row.on_route, booked: row.booked, feeState: row.fee_state,
    matchedBy: row.matched_by, scannedCode: row.scanned_code, notes: row.notes, createdAt: row.created_at,
  };
}

/** learnerId → outcome and staffId → outcome for the ticks; later rows win. */
export function tickIndex(entries: CheckPersonEntry[]): { learners: Map<string, CheckOutcome>; staff: Map<string, CheckOutcome> } {
  const learners = new Map<string, CheckOutcome>();
  const staff = new Map<string, CheckOutcome>();
  for (const e of entries) {
    if (e.kind === 'learner' && e.learnerId) learners.set(e.learnerId, e.outcome);
    else if (e.kind === 'staff' && e.staffId) staff.set(e.staffId, e.outcome);
  }
  return { learners, staff };
}

type HasOtherBus = { other_bus?: { kind: 'booked' | 'boarded' | 'from' } | null };

/** A roster row is "not on this route" when it was seen boarding a different bus today. */
export function notOnRouteOf(row: HasOtherBus): boolean {
  return row.other_bus?.kind === 'from';
}

/** Registered = allocated to or booked on this route: everything except rows from another bus. */
export function registeredCount(rows: HasOtherBus[]): number {
  return rows.filter((r) => !notOnRouteOf(r)).length;
}

/** Staff fee badge: an in-charge is exempt; otherwise none → unpaid → paid. */
export function entryFeeState(i: { isIncharge: boolean; hasBill: boolean; hasOutstanding: boolean }): EntryFeeState {
  if (i.isIncharge) return 'exempt';
  if (!i.hasBill) return 'none';
  return i.hasOutstanding ? 'unpaid' : 'paid';
}
```

- [ ] **Step 5: Write `outcome-meta.ts`** (display only, no camera import)

```ts
/**
 * Display metadata for Route Check outcomes — shared by the check page, the
 * scan verdict and (later) the admin report. Pure data.
 */
import type { CheckOutcome } from './outcome';

export interface CheckOutcomeMeta { label: string; icon: string; chip: string; card: string }

const GREEN = {
  chip: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  card: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200',
};
const AMBER = {
  chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  card: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
};
const RED = {
  chip: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  card: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
};
const GREY = {
  chip: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  card: 'border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
};

export const CHECK_OUTCOME_META: Record<CheckOutcome, CheckOutcomeMeta> = {
  ok:           { label: 'OK',              icon: '✅', ...GREEN },
  not_on_route: { label: 'Not on this bus', icon: '⚠️', ...AMBER },
  no_booking:   { label: 'No booking',      icon: '⚠️', ...AMBER },
  fee_unpaid:   { label: 'Fee unpaid',      icon: '⚠️', ...AMBER },
  unknown_card: { label: 'Unknown card',    icon: '❌', ...RED },
  manual:       { label: 'Added manually',  icon: '📝', ...GREY },
};
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run lib/route-check`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add lib/route-check/types.ts lib/route-check/entries.ts lib/route-check/entries.test.ts lib/route-check/outcome-meta.ts
git commit -m "feat(route-checks): shared view types, pure tick/entry helpers and outcome display meta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Server libs — check loading/authorisation and person evaluation

**Files:**
- Create: `lib/route-check/check-access.ts`
- Create: `lib/route-check/evaluate.ts`

**Interfaces:**
- Consumes: `canCheckRoute(auth, svc, routeId)` (`lib/route-check/access.ts`), `learnerCheckOutcome` / `staffCheckOutcome` (`outcome.ts`), `loadRosterFees` + `UNKNOWN_FEE` + `RosterFee` (`lib/boarding/fee-roster.ts`), `staffBillStates` (`staff-fees.ts`), `entryFeeState`, `personEntryFromRow`, `PersonDbRow` (`entries.ts`), `selectIn`, `staffName`, `normEmail` (`admin.ts`).
- Produces:

```ts
// check-access.ts
export interface CheckRow { id: string; route_id: string; vehicle_id: string | null; checker_id: string; check_date: string; leg: CheckLeg; status: CheckStatus; headcount: number | null; unknown_count: number | null; notes: string | null; started_at: string; submitted_at: string | null }
export type CheckLoad = { ok: true; check: CheckRow } | { ok: false; status: 403 | 404 | 409 | 500; error: string };
/** Loads the check and authorises: read → canCheckRoute; mutate → also draft + (checker_id == user || super admin). */
export async function loadCheckForUser(auth: AuthContext, svc: Svc, checkId: string, mode: 'read' | 'mutate'): Promise<CheckLoad>;

// evaluate.ts
export interface LearnerEvaluation { learnerId: string; name: string; code: string | null; onRoute: boolean; booked: boolean; fee: RosterFee; outcome: CheckOutcome }
export interface StaffEvaluation { staffId: string; name: string; code: string | null; onRoute: boolean; isIncharge: boolean; feeState: EntryFeeState; feeOwed: number | null; outcome: CheckOutcome }
export async function evaluateLearner(svc: Svc, learnerId: string, routeId: string, date: string): Promise<LearnerEvaluation | null>; // null = no such learner
export async function evaluateStaff(svc: Svc, staffId: string, routeId: string): Promise<StaffEvaluation | null>;
/** Lower-cased emails of the route's active in-charges (tms_staff_route_assignment). Throws on read error. */
export async function inchargeEmailsForRoute(svc: Svc, routeId: string): Promise<Set<string>>;
export type NewEntry =
  | { kind: 'learner'; learnerId: string; matchedBy: MatchedBy; scannedCode: string | null; ev: LearnerEvaluation }
  | { kind: 'staff'; staffId: string; matchedBy: MatchedBy; scannedCode: string | null; ev: StaffEvaluation }
  | { kind: 'unknown'; scannedCode: string };
/** Inserts the row; a 23505 (same person already ticked in this check) returns the existing row with alreadyChecked=true. */
export async function recordEntry(svc: Svc, checkId: string, entry: NewEntry): Promise<{ row: PersonDbRow; alreadyChecked: boolean }>;
/** Loads all rows of a check as entries with names resolved (chunked). Throws on read error. */
export async function loadEntries(svc: Svc, checkId: string): Promise<CheckPersonEntry[]>;
```

- [ ] **Step 1: Write `check-access.ts`**

```ts
/**
 * Load one route check and decide what the caller may do with it.
 * Read: super admin, manage permission, or an active checker of its route.
 * Mutate: additionally the check must be a draft and belong to the caller
 * (super admin excepted) — a submitted check never gains rows.
 */
import type { AuthContext } from '@/lib/api/with-auth';
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { canCheckRoute } from './access';
import type { CheckLeg, CheckStatus } from './types';

type Svc = ReturnType<typeof createServiceRoleClient>;

export interface CheckRow {
  id: string; route_id: string; vehicle_id: string | null; checker_id: string; check_date: string; leg: CheckLeg;
  status: CheckStatus; headcount: number | null; unknown_count: number | null; notes: string | null;
  started_at: string; submitted_at: string | null;
}
export const CHECK_COLS = 'id, route_id, vehicle_id, checker_id, check_date, leg, status, headcount, unknown_count, notes, started_at, submitted_at';

export type CheckLoad = { ok: true; check: CheckRow } | { ok: false; status: 403 | 404 | 409 | 500; error: string };

export async function loadCheckForUser(auth: AuthContext, svc: Svc, checkId: string, mode: 'read' | 'mutate'): Promise<CheckLoad> {
  const { data, error } = await svc.from('tms_route_check').select(CHECK_COLS).eq('id', checkId).maybeSingle();
  if (error) {
    console.error('route-check load error:', error);
    return { ok: false, status: 500, error: 'Failed to load route check' };
  }
  if (!data) return { ok: false, status: 404, error: 'Route check not found' };
  const check = data as CheckRow;
  if (!(await canCheckRoute(auth, svc, check.route_id))) return { ok: false, status: 403, error: 'Forbidden' };
  if (mode === 'mutate') {
    if (check.status !== 'draft') return { ok: false, status: 409, error: 'This check is already submitted' };
    if (check.checker_id !== auth.userId && !auth.isSuperAdmin) {
      return { ok: false, status: 403, error: 'Only the checker who started this check can change it' };
    }
  }
  return { ok: true, check };
}
```

- [ ] **Step 2: Write `evaluate.ts`**

```ts
/**
 * Route Check evaluation: what a scanned learner / staff member's status is
 * on THIS route TODAY, and recording the resulting tick. Verify-only: reads
 * bookings, attendance-roster fees and staff bills; writes only
 * tms_route_check_person.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { loadRosterFees, UNKNOWN_FEE, type RosterFee } from '@/lib/boarding/fee-roster';
import { learnerCheckOutcome, staffCheckOutcome, type CheckOutcome } from './outcome';
import { staffBillStates } from './staff-fees';
import { entryFeeState, personEntryFromRow, type PersonDbRow } from './entries';
import { normEmail, selectIn, staffName } from './admin';
import type { CheckPersonEntry, EntryFeeState, MatchedBy } from './types';

type Svc = ReturnType<typeof createServiceRoleClient>;

export interface LearnerEvaluation {
  learnerId: string; name: string; code: string | null; onRoute: boolean; booked: boolean; fee: RosterFee; outcome: CheckOutcome;
}
export interface StaffEvaluation {
  staffId: string; name: string; code: string | null; onRoute: boolean; isIncharge: boolean;
  feeState: EntryFeeState; feeOwed: number | null; outcome: CheckOutcome;
}

const PERSON_COLS = 'id, check_id, person_kind, learner_id, staff_id, manual_type, manual_name, matched_by, scanned_code, outcome, on_route, booked, fee_state, notes, created_at';

export async function evaluateLearner(svc: Svc, learnerId: string, routeId: string, date: string): Promise<LearnerEvaluation | null> {
  const [learnerQ, bookingQ, fees] = await Promise.all([
    svc.from('learners_profiles').select('id, first_name, last_name, roll_number, register_number, transport_route_id').eq('id', learnerId).maybeSingle(),
    svc.from('tms_booking').select('route_id').eq('learner_id', learnerId).eq('travel_date', date),
    // Display-only and fail-soft: a failed fee read is 'unknown', never 'paid'.
    loadRosterFees(svc, [learnerId]),
  ]);
  if (learnerQ.error) throw new Error(`evaluateLearner: learner read failed: ${learnerQ.error.message}`);
  if (bookingQ.error) throw new Error(`evaluateLearner: booking read failed: ${bookingQ.error.message}`);
  const l = learnerQ.data as { first_name: string | null; last_name: string | null; roll_number: string | null; register_number: string | null; transport_route_id: string | null } | null;
  if (!l) return null;
  const bookings = (bookingQ.data ?? []) as { route_id: string }[];
  const booked = bookings.length > 0;
  const onRoute = l.transport_route_id === routeId || bookings.some((b) => b.route_id === routeId);
  const fee = fees.get(learnerId) ?? { ...UNKNOWN_FEE };
  return {
    learnerId,
    name: staffName(l),
    code: l.roll_number ?? l.register_number ?? null,
    onRoute, booked, fee,
    outcome: learnerCheckOutcome({ known: true, onRoute, booked, feeUnpaid: fee.state === 'unpaid' }),
  };
}

/** Lower-cased emails of the route's active in-charges. Throws on read error. */
export async function inchargeEmailsForRoute(svc: Svc, routeId: string): Promise<Set<string>> {
  const { data, error } = await svc.from('tms_staff_route_assignment').select('staff_email').eq('route_id', routeId).eq('is_active', true);
  if (error) throw new Error(`inchargeEmailsForRoute: read failed: ${error.message}`);
  return new Set(((data ?? []) as { staff_email: string | null }[]).map((r) => normEmail(r.staff_email)).filter(Boolean));
}

export async function evaluateStaff(svc: Svc, staffId: string, routeId: string): Promise<StaffEvaluation | null> {
  const { data, error } = await svc.from('staff')
    .select('id, first_name, last_name, staff_id, email, institution_email, transport_route_id').eq('id', staffId).maybeSingle();
  if (error) throw new Error(`evaluateStaff: staff read failed: ${error.message}`);
  const s = data as { first_name: string | null; last_name: string | null; staff_id: string | null; email: string | null; institution_email: string | null; transport_route_id: string | null } | null;
  if (!s) return null;
  const [incharges, bills] = await Promise.all([inchargeEmailsForRoute(svc, routeId), staffBillStates(svc, [staffId])]);
  const isIncharge = [normEmail(s.email), normEmail(s.institution_email)].some((e) => e && incharges.has(e));
  const bill = bills.get(staffId) ?? { hasOutstanding: false, outstandingAmount: 0, hasBill: false };
  const feeState = entryFeeState({ isIncharge, hasBill: bill.hasBill, hasOutstanding: bill.hasOutstanding });
  return {
    staffId, name: staffName(s), code: s.staff_id ?? null,
    onRoute: s.transport_route_id === routeId, isIncharge, feeState,
    feeOwed: bill.hasOutstanding ? bill.outstandingAmount : null,
    outcome: staffCheckOutcome({ onRoute: s.transport_route_id === routeId, isIncharge, hasOutstandingBill: bill.hasOutstanding }),
  };
}

export type NewEntry =
  | { kind: 'learner'; learnerId: string; matchedBy: MatchedBy; scannedCode: string | null; ev: LearnerEvaluation }
  | { kind: 'staff'; staffId: string; matchedBy: MatchedBy; scannedCode: string | null; ev: StaffEvaluation }
  | { kind: 'unknown'; scannedCode: string };

export async function recordEntry(svc: Svc, checkId: string, entry: NewEntry): Promise<{ row: PersonDbRow; alreadyChecked: boolean }> {
  const insert =
    entry.kind === 'learner'
      ? { check_id: checkId, person_kind: 'learner', learner_id: entry.learnerId, matched_by: entry.matchedBy, scanned_code: entry.scannedCode,
          outcome: entry.ev.outcome, on_route: entry.ev.onRoute, booked: entry.ev.booked, fee_state: entry.ev.fee.state }
      : entry.kind === 'staff'
        ? { check_id: checkId, person_kind: 'staff', staff_id: entry.staffId, matched_by: entry.matchedBy, scanned_code: entry.scannedCode,
            outcome: entry.ev.outcome, on_route: entry.ev.onRoute, booked: null, fee_state: entry.ev.feeState }
        : { check_id: checkId, person_kind: 'unknown', scanned_code: entry.scannedCode, outcome: 'unknown_card' };
  const { data, error } = await svc.from('tms_route_check_person').insert(insert).select(PERSON_COLS).single();
  if (!error) return { row: data as PersonDbRow, alreadyChecked: false };
  if (error.code !== '23505' || entry.kind === 'unknown') throw new Error(`recordEntry: insert failed: ${error.message}`);
  // Already ticked in this check — return that row rather than a second line.
  const col = entry.kind === 'learner' ? 'learner_id' : 'staff_id';
  const id = entry.kind === 'learner' ? entry.learnerId : entry.staffId;
  const { data: existing, error: exErr } = await svc.from('tms_route_check_person').select(PERSON_COLS).eq('check_id', checkId).eq(col, id).maybeSingle();
  if (exErr || !existing) throw new Error(`recordEntry: re-read after 23505 failed: ${exErr?.message ?? 'no row'}`);
  return { row: existing as PersonDbRow, alreadyChecked: true };
}

export async function loadEntries(svc: Svc, checkId: string): Promise<CheckPersonEntry[]> {
  const { data, error } = await svc.from('tms_route_check_person').select(PERSON_COLS).eq('check_id', checkId).order('created_at', { ascending: true });
  if (error) throw new Error(`loadEntries: read failed: ${error.message}`);
  const rows = (data ?? []) as PersonDbRow[];
  const [learners, staff] = await Promise.all([
    selectIn<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null; register_number: string | null }>(
      svc, 'learners_profiles', 'id, first_name, last_name, roll_number, register_number', 'id', rows.map((r) => r.learner_id ?? '')),
    selectIn<{ id: string; first_name: string | null; last_name: string | null; staff_id: string | null }>(
      svc, 'staff', 'id, first_name, last_name, staff_id', 'id', rows.map((r) => r.staff_id ?? '')),
  ]);
  const names = {
    learners: new Map(learners.map((l) => [l.id, { name: staffName(l), code: l.roll_number ?? l.register_number ?? null }])),
    staff: new Map(staff.map((s) => [s.id, { name: staffName(s), code: s.staff_id ?? null }])),
  };
  return rows.map((r) => personEntryFromRow(r, names));
}
```

- [ ] **Step 3: Scoped tsc**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "route-check" || echo CLEAN`
Expected: CLEAN

- [ ] **Step 4: Commit**

```bash
git add lib/route-check/check-access.ts lib/route-check/evaluate.ts
git commit -m "feat(route-checks): check authorisation loader and learner/staff evaluation with idempotent ticks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Checker APIs — my routes + start

**Files:**
- Create: `app/api/boarding/route-check/routes/route.ts`
- Create: `app/api/boarding/route-check/start/route.ts`

**Interfaces:**
- Consumes: `checkerRouteIds`, `canCheckRoute` (`access.ts`); `requirePerm` (`lib/inspections/server.ts`); `selectIn`, `UUID_RE` (`admin.ts`); `istToday`; `MyCheckRoute` (`types.ts`); `CHECK_COLS` (`check-access.ts`).
- Produces: `GET /api/boarding/route-check/routes → { success, data: MyCheckRoute[] }`; `POST /api/boarding/route-check/start { routeId, leg } → { success, data: { checkId, resumed: boolean } }`.

- [ ] **Step 1: Write `routes/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { istToday } from '@/lib/booking/window';
import { checkerRouteIds } from '@/lib/route-check/access';
import { selectIn } from '@/lib/route-check/admin';
import type { MyCheckRoute, CheckStatus } from '@/lib/route-check/types';

type RouteRow = { id: string; route_number: string | null; route_name: string | null; vehicle_id: string | null; status: string | null };

/**
 * GET — the routes this user may check today, with today's check per leg.
 * Super admins and Route Check managers see every active route.
 */
async function myRoutes(_req: NextRequest, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();
    const manager = await requirePerm(auth, TMS_PERMISSIONS.ROUTE_CHECK_MANAGE);
    let routes: RouteRow[];
    if (manager) {
      const { data, error } = await svc.from('tms_route').select('id, route_number, route_name, vehicle_id, status').eq('status', 'active').order('route_number');
      if (error) throw new Error(`routes read failed: ${error.message}`);
      routes = (data ?? []) as RouteRow[];
    } else {
      const ids = await checkerRouteIds(svc, auth.userId);
      routes = ids.length ? await selectIn<RouteRow>(svc, 'tms_route', 'id, route_number, route_name, vehicle_id, status', 'id', ids) : [];
      routes.sort((a, b) => (a.route_number ?? '').localeCompare(b.route_number ?? '', undefined, { numeric: true }));
    }
    const vehicles = await selectIn<{ id: string; registration_number: string | null }>(
      svc, 'tms_vehicle', 'id, registration_number', 'id', routes.map((r) => r.vehicle_id ?? ''));
    const regById = new Map(vehicles.map((v) => [v.id, v.registration_number]));

    const today = istToday();
    const checks = routes.length
      ? await selectIn<{ id: string; route_id: string; leg: 'onward' | 'return'; status: CheckStatus; started_at: string }>(
          svc, 'tms_route_check', 'id, route_id, leg, status, started_at', 'route_id', routes.map((r) => r.id))
      : [];
    // Own checks only (a manager may see many checkers' routes); newest per leg wins.
    const mine = checks.filter((c) => true);
    const { data: todays, error: tErr } = mine.length
      ? await svc.from('tms_route_check').select('id, route_id, leg, status').eq('checker_id', auth.userId).eq('check_date', today).order('started_at', { ascending: false })
      : { data: [], error: null };
    if (tErr) throw new Error(`today checks read failed: ${tErr.message}`);
    const byRoute = new Map<string, MyCheckRoute['today']>();
    for (const c of (todays ?? []) as { id: string; route_id: string; leg: 'onward' | 'return'; status: CheckStatus }[]) {
      const t = byRoute.get(c.route_id) ?? { onward: null, return: null };
      if (!t[c.leg]) t[c.leg] = { id: c.id, status: c.status };
      byRoute.set(c.route_id, t);
    }
    const data: MyCheckRoute[] = routes.map((r) => ({
      routeId: r.id, routeNumber: r.route_number, routeName: r.route_name,
      vehicleReg: r.vehicle_id ? regById.get(r.vehicle_id) ?? null : null,
      today: byRoute.get(r.id) ?? { onward: null, return: null },
    }));
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check my routes error:', e);
    return NextResponse.json({ error: 'Failed to load your routes' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => myRoutes(request, auth));
```

Simplify before committing: delete the `checks`/`mine` block (it is not needed — today's checks are read directly by `checker_id` + `check_date`); the `todays` query must run unconditionally when `routes.length > 0`. Final shape:

```ts
    const today = istToday();
    const { data: todays, error: tErr } = await svc.from('tms_route_check').select('id, route_id, leg, status')
      .eq('checker_id', auth.userId).eq('check_date', today).order('started_at', { ascending: false });
    if (tErr) throw new Error(`today checks read failed: ${tErr.message}`);
```

- [ ] **Step 2: Write `start/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { istToday } from '@/lib/booking/window';
import { canCheckRoute } from '@/lib/route-check/access';
import { UUID_RE } from '@/lib/route-check/admin';

/**
 * POST { routeId, leg } — create or resume TODAY's draft check for this
 * checker on this route and leg. The partial unique index
 * (checker_id, route_id, check_date, leg) where status='draft' keeps it single.
 */
async function start(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as { routeId?: unknown; leg?: unknown };
    const routeId = typeof body.routeId === 'string' ? body.routeId.trim() : '';
    const leg = body.leg === 'onward' || body.leg === 'return' ? body.leg : null;
    if (!UUID_RE.test(routeId)) return NextResponse.json({ error: 'Invalid route id' }, { status: 400 });
    if (!leg) return NextResponse.json({ error: 'Pick Morning or Evening' }, { status: 400 });

    const svc = createServiceRoleClient();
    if (!(await canCheckRoute(auth, svc, routeId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: route, error: rErr } = await svc.from('tms_route').select('id, vehicle_id, status').eq('id', routeId).maybeSingle();
    if (rErr) { console.error('route-check start: route read error:', rErr); return NextResponse.json({ error: 'Failed to load route' }, { status: 500 }); }
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    if (route.status !== 'active') return NextResponse.json({ error: 'This route is not active' }, { status: 409 });

    const date = istToday();
    const findDraft = async () => {
      const { data, error } = await svc.from('tms_route_check').select('id')
        .eq('checker_id', auth.userId).eq('route_id', routeId).eq('check_date', date).eq('leg', leg).eq('status', 'draft').maybeSingle();
      if (error) throw new Error(`draft read failed: ${error.message}`);
      return (data as { id: string } | null)?.id ?? null;
    };
    const existing = await findDraft();
    if (existing) return NextResponse.json({ success: true, data: { checkId: existing, resumed: true } });

    const { data: created, error: cErr } = await svc.from('tms_route_check')
      .insert({ route_id: routeId, vehicle_id: route.vehicle_id ?? null, checker_id: auth.userId, check_date: date, leg, status: 'draft' })
      .select('id').single();
    if (cErr) {
      if (cErr.code === '23505') {
        const raced = await findDraft();
        if (raced) return NextResponse.json({ success: true, data: { checkId: raced, resumed: true } });
      }
      console.error('route-check start: insert error:', cErr);
      return NextResponse.json({ error: 'Failed to start the check' }, { status: 500 });
    }
    const checkId = (created as { id: string }).id;
    await logActivity(auth, request, {
      module: 'route-checks', action: 'create', entityType: 'tms_route_check', entityId: checkId,
      entityLabel: `${date} ${leg}`, description: `Started route check (${leg}) for route ${routeId}`,
      metadata: { routeId, leg, date },
    });
    return NextResponse.json({ success: true, data: { checkId, resumed: false } }, { status: 201 });
  } catch (e) {
    console.error('route-check start error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => start(request, auth));
```

- [ ] **Step 3: Scoped tsc** → CLEAN. Signed-out probe: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/boarding/route-check/routes` → `401` (only if a dev server is already running; otherwise skip and do it in Task 12).

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/route-check/routes/route.ts app/api/boarding/route-check/start/route.ts
git commit -m "feat(route-checks): checker APIs to list my routes and start/resume today's check

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Checker API — check view (roster + badges + ticks)

**Files:**
- Create: `app/api/boarding/route-check/[checkId]/route.ts`
- Create: `lib/route-check/view.ts`
- Modify: `lib/route-check/admin.ts` (add `staff_id` to `STAFF_COLS` / `StaffRow`)

**Interfaces:**
- Consumes: `loadCheckForUser` (`check-access.ts`), `loadRouteRosterView` (`lib/attendance/route-roster.ts`), `loadEntries`, `inchargeEmailsForRoute` (`evaluate.ts`), `staffBillStates`, `tickIndex`, `notOnRouteOf`, `registeredCount`, `entryFeeState`, `checkCounts` (`counts.ts`), `selectIn`, `staffName`, `normEmail`.
- Produces: `buildCheckView(svc, check): Promise<CheckView>` (throws on read failure; used by GET and by submit for the snapshot); `GET /api/boarding/route-check/[checkId] → { success, data: CheckView }`.

- [ ] **Step 1: Write `lib/route-check/view.ts`**

```ts
/**
 * The full Route Check screen payload: roster learners with fee/booking
 * badges and ticks, staff riders + in-charges with bill status, counts and
 * the recorded entries. Shared by the GET view and the submit snapshot so
 * both read the same numbers. Throws on any read the view cannot do without.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { loadRouteRosterView } from '@/lib/attendance/route-roster';
import { checkCounts } from './counts';
import { tickIndex, notOnRouteOf, registeredCount, entryFeeState } from './entries';
import { loadEntries, inchargeEmailsForRoute } from './evaluate';
import { staffBillStates } from './staff-fees';
import { mapLimit, normEmail, staffByEmail, staffName } from './admin';
import type { CheckRow } from './check-access';
import type { CheckView, CheckLearnerRow, CheckStaffRow } from './types';

type Svc = ReturnType<typeof createServiceRoleClient>;

type StaffRow = { id: string; first_name: string | null; last_name: string | null; designation: string | null; staff_id: string | null; email: string | null; institution_email: string | null; is_active: boolean | null };
const STAFF_COLS = 'id, first_name, last_name, designation, staff_id, email, institution_email, is_active';

export async function buildCheckView(svc: Svc, check: CheckRow): Promise<CheckView> {
  const [roster, entries, inchargeEmails, vehicleQ] = await Promise.all([
    loadRouteRosterView(svc, {
      routeId: check.route_id, date: check.check_date, direction: check.leg,
      viewer: { actorId: check.checker_id, isOverrideHolder: false, isSuperAdmin: false },
      withFees: true,
    }),
    loadEntries(svc, check.id),
    inchargeEmailsForRoute(svc, check.route_id),
    check.vehicle_id
      ? svc.from('tms_vehicle').select('registration_number').eq('id', check.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (!roster) throw new Error('buildCheckView: route not found');
  if (vehicleQ.error) throw new Error(`buildCheckView: vehicle read failed: ${vehicleQ.error.message}`);
  const ticks = tickIndex(entries);

  const learners: CheckLearnerRow[] = roster.rows.map((r) => {
    const fee = r.fee ?? { state: 'unknown' as const, owed: null };
    return {
      learnerId: r.learner_id, name: r.name, roll: r.roll, stopId: r.stop_id, stopName: r.stop_name, stopTime: r.stop_time,
      status: r.status, booked: r.booked, feeState: fee.state, feeOwed: fee.owed,
      notOnRoute: notOnRouteOf(r), otherBus: r.other_bus ?? null,
      checked: ticks.learners.has(r.learner_id), checkOutcome: ticks.learners.get(r.learner_id) ?? null,
    };
  });

  // Staff: allocated riders (staff.transport_route_id) plus the route's active
  // in-charges (≤ 4 per route → one wildcard-safe staffByEmail lookup each).
  const [ridersQ, inchargeStaff] = await Promise.all([
    svc.from('staff').select(STAFF_COLS).eq('transport_route_id', check.route_id).eq('is_active', true),
    mapLimit([...inchargeEmails], 4, (e) => staffByEmail(svc, e)),
  ]);
  if (ridersQ.error) throw new Error(`buildCheckView: staff riders read failed: ${ridersQ.error.message}`);
  const staffById = new Map<string, StaffRow>();
  for (const s of [...(ridersQ.data ?? []), ...inchargeStaff.flat().filter((s) => s.is_active)] as StaffRow[]) staffById.set(s.id, s);
  const bills = await staffBillStates(svc, [...staffById.keys()]);
  const staff: CheckStaffRow[] = [...staffById.values()].map((s) => {
    const isIncharge = [normEmail(s.email), normEmail(s.institution_email)].some((e) => e && inchargeEmails.has(e));
    const bill = bills.get(s.id) ?? { hasOutstanding: false, outstandingAmount: 0, hasBill: false };
    return {
      staffId: s.id, name: staffName(s) || '—', designation: s.designation, code: s.staff_id, isIncharge,
      feeState: entryFeeState({ isIncharge, hasBill: bill.hasBill, hasOutstanding: bill.hasOutstanding }),
      feeOwed: bill.hasOutstanding ? bill.outstandingAmount : null,
      checked: ticks.staff.has(s.id), checkOutcome: ticks.staff.get(s.id) ?? null,
    };
  }).sort((a, b) => Number(b.isIncharge) - Number(a.isIncharge) || a.name.localeCompare(b.name));

  const c = checkCounts(learners.map((l) => ({ booked: l.booked, status: l.status, feeState: l.feeState, notOnRoute: l.notOnRoute })));
  return {
    check: { id: check.id, routeId: check.route_id, status: check.status, checkDate: check.check_date, leg: check.leg, startedAt: check.started_at, submittedAt: check.submitted_at },
    route: { id: roster.route.id, routeNumber: roster.route.route_number, routeName: roster.route.route_name,
      vehicleReg: (vehicleQ.data as { registration_number: string | null } | null)?.registration_number ?? null },
    learners, staff, entries,
    counts: { registered: registeredCount(roster.rows), booked: c.booked, present: c.present, unpaid: c.unpaid,
      withoutBooking: c.withoutBooking, notOnRoute: c.notOnRoute, checked: entries.filter((e) => e.kind !== 'unknown').length },
  };
}
```

`staffByEmail` (admin.ts) currently selects `id, first_name, last_name, designation, email, institution_email, profile_id, is_active` — add `staff_id` to its `STAFF_COLS` string and `StaffRow` type (a pure widening; the assign API ignores the extra column).

- [ ] **Step 2: Write `[checkId]/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { UUID_RE } from '@/lib/route-check/admin';
import { loadCheckForUser } from '@/lib/route-check/check-access';
import { buildCheckView } from '@/lib/route-check/view';

// /api/boarding/route-check/<checkId>
export const checkIdFrom = (r: NextRequest) => new URL(r.url).pathname.split('/').filter(Boolean)[3] ?? '';

async function getView(request: NextRequest, auth: AuthContext) {
  try {
    const id = checkIdFrom(request);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, id, 'read');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const data = await buildCheckView(svc, load.check);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check view error:', e);
    return NextResponse.json({ error: 'Failed to load the check' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getView(request, auth));
```

Next.js route files may only export HTTP handlers and config — move `checkIdFrom` into `lib/route-check/check-access.ts` as `export const checkIdFromUrl = (url: string) => new URL(url).pathname.split('/').filter(Boolean)[3] ?? '';` and import it in every `[checkId]/**` route instead.

- [ ] **Step 3: Scoped tsc** → CLEAN (`RosterRow.fee: RosterFee` is filled by `loadRouteRosterView` when `withFees` — verified 2026-09-22).

- [ ] **Step 4: Commit**

```bash
git add lib/route-check/view.ts lib/route-check/check-access.ts lib/route-check/admin.ts "app/api/boarding/route-check/[checkId]/route.ts"
git commit -m "feat(route-checks): check view API with roster fee/booking badges, staff bill status and ticks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Checker APIs — scan, pick candidate, remove tick

**Files:**
- Create: `app/api/boarding/route-check/[checkId]/scan/route.ts`
- Create: `app/api/boarding/route-check/[checkId]/person/route.ts`

**Interfaces:**
- Consumes: `resolveCard` (`resolve.ts`), `evaluateLearner`, `evaluateStaff`, `recordEntry`, `loadEntries`-style name resolution via `personEntryFromRow`, `loadCheckForUser`, `checkIdFromUrl`, `logActivity`.
- Produces: `POST …/scan { code, source: 'camera' } → { success, data: ScanResponse }`; `POST …/person { personKind, id, matchedBy, scannedCode } → { success, data: ScanResponse(kind 'recorded') }`; `DELETE …/person?personId= → { success }`.

- [ ] **Step 1: Write a shared helper in `lib/route-check/evaluate.ts`** (append):

```ts
/** Evaluate + record one resolved candidate. Returns the API's 'recorded' payload. */
export async function tickCandidate(
  svc: Svc, check: { id: string; route_id: string; check_date: string },
  pick: { personKind: 'learner' | 'staff'; id: string; matchedBy: MatchedBy; scannedCode: string | null },
): Promise<{ kind: 'recorded'; entry: CheckPersonEntry; alreadyChecked: boolean; feeOwed: number | null } | null> {
  if (pick.personKind === 'learner') {
    const ev = await evaluateLearner(svc, pick.id, check.route_id, check.check_date);
    if (!ev) return null;
    const { row, alreadyChecked } = await recordEntry(svc, check.id, { kind: 'learner', learnerId: pick.id, matchedBy: pick.matchedBy, scannedCode: pick.scannedCode, ev });
    const entry = personEntryFromRow(row, { learners: new Map([[pick.id, { name: ev.name, code: ev.code }]]), staff: new Map() });
    return { kind: 'recorded', entry, alreadyChecked, feeOwed: ev.fee.owed };
  }
  const ev = await evaluateStaff(svc, pick.id, check.route_id);
  if (!ev) return null;
  const { row, alreadyChecked } = await recordEntry(svc, check.id, { kind: 'staff', staffId: pick.id, matchedBy: pick.matchedBy, scannedCode: pick.scannedCode, ev });
  const entry = personEntryFromRow(row, { learners: new Map(), staff: new Map([[pick.id, { name: ev.name, code: ev.code }]]) });
  return { kind: 'recorded', entry, alreadyChecked, feeOwed: ev.feeOwed };
}
```

- [ ] **Step 2: Write `scan/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { UUID_RE } from '@/lib/route-check/admin';
import { checkIdFromUrl, loadCheckForUser } from '@/lib/route-check/check-access';
import { resolveCard } from '@/lib/route-check/resolve';
import { recordEntry, tickCandidate } from '@/lib/route-check/evaluate';
import { personEntryFromRow } from '@/lib/route-check/entries';
import type { ScanResponse } from '@/lib/route-check/types';

/**
 * POST { code, source } — VERIFY ONLY. Resolves a QR (JKKN ID / UUID) or a
 * Code 39 barcode (roll / register / staff code) to a person, evaluates them
 * for this route today and records the tick. Several candidates → returned
 * for the checker to pick (nothing recorded). No candidate → an
 * 'unknown' row so the finding is kept. Never writes attendance.
 */
async function scan(request: NextRequest, auth: AuthContext) {
  try {
    const id = checkIdFromUrl(request.url);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { code?: unknown; source?: unknown };
    // Fail-closed: only an explicit 'camera' counts as a camera read.
    if (body.source !== 'camera') return NextResponse.json({ error: 'Point the camera at the ID card to scan it.' }, { status: 400 });
    const raw = typeof body.code === 'string' ? body.code : '';
    if (!raw.trim()) return NextResponse.json({ error: 'Nothing was scanned' }, { status: 400 });

    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, id, 'mutate');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const check = load.check;

    const resolved = await resolveCard(svc, raw, check.route_id);
    if (resolved.shape === 'unknown') return NextResponse.json({ error: 'That code is not a JKKN ID card or ID barcode' }, { status: 400 });

    let data: ScanResponse;
    if (resolved.candidates.length === 0) {
      const { row } = await recordEntry(svc, check.id, { kind: 'unknown', scannedCode: resolved.code });
      data = { kind: 'recorded', entry: personEntryFromRow(row, { learners: new Map(), staff: new Map() }), alreadyChecked: false, feeOwed: null };
    } else if (resolved.candidates.length > 1) {
      data = { kind: 'candidates', code: resolved.code, candidates: resolved.candidates };
    } else {
      const c = resolved.candidates[0];
      const t = await tickCandidate(svc, check, { personKind: c.personKind, id: c.id, matchedBy: c.matchedBy, scannedCode: resolved.code });
      if (!t) return NextResponse.json({ error: 'That person no longer exists' }, { status: 404 });
      data = t;
    }

    if (data.kind === 'recorded') {
      await logActivity(auth, request, {
        module: 'route-checks', action: 'scan', entityType: 'tms_route_check_person', entityId: data.entry.id,
        entityLabel: data.entry.name ?? resolved.code,
        description: `Route check scan ${resolved.code}${data.entry.name ? ` (${data.entry.name})` : ''}: ${data.entry.outcome}${data.alreadyChecked ? ' (already checked)' : ''}`,
        metadata: { checkId: check.id, routeId: check.route_id, shape: resolved.shape, outcome: data.entry.outcome, alreadyChecked: data.alreadyChecked, retired: resolved.retired ?? false },
      });
    }
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check scan error:', e);
    return NextResponse.json({ error: 'Could not check the card' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => scan(request, auth));
```

- [ ] **Step 3: Write `person/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { UUID_RE } from '@/lib/route-check/admin';
import { checkIdFromUrl, loadCheckForUser } from '@/lib/route-check/check-access';
import { tickCandidate } from '@/lib/route-check/evaluate';
import type { MatchedBy } from '@/lib/route-check/types';

const MATCHED: MatchedBy[] = ['jkkn_id', 'uuid', 'roll_number', 'register_number', 'staff_id'];

/** POST { personKind, id, matchedBy, scannedCode } — tick the candidate the checker picked from an ambiguous barcode. */
async function pick(request: NextRequest, auth: AuthContext) {
  try {
    const checkId = checkIdFromUrl(request.url);
    if (!UUID_RE.test(checkId)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as { personKind?: unknown; id?: unknown; matchedBy?: unknown; scannedCode?: unknown };
    const personKind = b.personKind === 'learner' || b.personKind === 'staff' ? b.personKind : null;
    const id = typeof b.id === 'string' && UUID_RE.test(b.id) ? b.id : null;
    const matchedBy = MATCHED.includes(b.matchedBy as MatchedBy) ? (b.matchedBy as MatchedBy) : null;
    const scannedCode = typeof b.scannedCode === 'string' ? b.scannedCode.slice(0, 64) : null;
    if (!personKind || !id || !matchedBy) return NextResponse.json({ error: 'Invalid candidate' }, { status: 400 });

    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, checkId, 'mutate');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const data = await tickCandidate(svc, load.check, { personKind, id, matchedBy, scannedCode });
    if (!data) return NextResponse.json({ error: 'That person no longer exists' }, { status: 404 });
    await logActivity(auth, request, {
      module: 'route-checks', action: 'scan', entityType: 'tms_route_check_person', entityId: data.entry.id,
      entityLabel: data.entry.name ?? id, description: `Route check pick ${personKind} ${data.entry.code ?? id}: ${data.entry.outcome}`,
      metadata: { checkId, personKind, id, matchedBy, scannedCode, outcome: data.entry.outcome, alreadyChecked: data.alreadyChecked, picked: true },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check pick error:', e);
    return NextResponse.json({ error: 'Could not record the person' }, { status: 500 });
  }
}

/** DELETE ?personId= — remove a tick while the check is a draft. */
async function remove(request: NextRequest, auth: AuthContext) {
  try {
    const checkId = checkIdFromUrl(request.url);
    const personId = new URL(request.url).searchParams.get('personId')?.trim() ?? '';
    if (!UUID_RE.test(checkId) || !UUID_RE.test(personId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, checkId, 'mutate');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const { data, error } = await svc.from('tms_route_check_person').delete().eq('id', personId).eq('check_id', checkId).select('id, person_kind, learner_id, staff_id, outcome');
    if (error) { console.error('route-check remove error:', error); return NextResponse.json({ error: 'Failed to remove' }, { status: 500 }); }
    if (!data?.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    const row = data[0] as { person_kind: string; learner_id: string | null; staff_id: string | null; outcome: string };
    await logActivity(auth, request, {
      module: 'route-checks', action: 'delete', entityType: 'tms_route_check_person', entityId: personId,
      entityLabel: row.learner_id ?? row.staff_id ?? personId, description: `Removed ${row.person_kind} entry (${row.outcome}) from route check`,
      metadata: { checkId, ...row },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('route-check remove error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => pick(request, auth));
export const DELETE = withAuth((request, auth) => remove(request, auth));
```

- [ ] **Step 4: Scoped tsc** → CLEAN.

- [ ] **Step 5: Commit**

```bash
git add lib/route-check/evaluate.ts "app/api/boarding/route-check/[checkId]/scan/route.ts" "app/api/boarding/route-check/[checkId]/person/route.ts"
git commit -m "feat(route-checks): scan, candidate pick and remove-tick APIs (verify-only, camera-only)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Checker API — submit

**Files:**
- Create: `app/api/boarding/route-check/[checkId]/submit/route.ts`

- [ ] **Step 1: Write it**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { UUID_RE } from '@/lib/route-check/admin';
import { checkIdFromUrl, loadCheckForUser } from '@/lib/route-check/check-access';
import { buildCheckView } from '@/lib/route-check/view';

/** POST — snapshot the counts and mark the draft submitted (guarded: 0 rows updated → 409). */
async function submit(request: NextRequest, auth: AuthContext) {
  try {
    const id = checkIdFromUrl(request.url);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, id, 'mutate');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const view = await buildCheckView(svc, load.check);
    const c = view.counts;
    const { data, error } = await svc.from('tms_route_check')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), registered: c.registered, booked: c.booked,
        present: c.present, unpaid: c.unpaid, without_booking: c.withoutBooking, not_on_route: c.notOnRoute })
      .eq('id', id).eq('status', 'draft').select('id');
    if (error) { console.error('route-check submit error:', error); return NextResponse.json({ error: 'Failed to submit' }, { status: 500 }); }
    if (!data?.length) return NextResponse.json({ error: 'This check is already submitted' }, { status: 409 });
    await logActivity(auth, request, {
      module: 'route-checks', action: 'submit', entityType: 'tms_route_check', entityId: id,
      entityLabel: `${view.route.routeNumber ?? view.route.id} ${view.check.checkDate} ${view.check.leg}`,
      description: `Submitted route check for route ${view.route.routeNumber ?? view.route.id}: ${c.checked} checked, ${c.unpaid} unpaid, ${c.withoutBooking} without booking`,
      metadata: { routeId: view.route.id, leg: view.check.leg, date: view.check.checkDate, counts: c },
    });
    return NextResponse.json({ success: true, data: { counts: c } });
  } catch (e) {
    console.error('route-check submit error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => submit(request, auth));
```

- [ ] **Step 2: Scoped tsc** → CLEAN. Commit:

```bash
git add "app/api/boarding/route-check/[checkId]/submit/route.ts"
git commit -m "feat(route-checks): submit API snapshots counts and closes the draft

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Staff-app access — access API, layout checker-only mode, nav

**Files:**
- Modify: `app/api/boarding/access/route.ts`
- Modify: `app/boarding/layout.tsx`
- Modify: `lib/boarding/navigation.ts`
- Modify: `components/boarding-bottom-nav.tsx`

**Behaviour:**
- Access API adds `checkerRouteCount` (service-role `checkerRouteIds`, fail-soft 0 with a logged error — the in-charge gate must not fail because of the checker RPC). Super-admin branch returns `checkerRouteCount: 0, superAdmin: true` (unchanged otherwise).
- Layout: new access state `'checker_only'` when `gate !== 'in_duty' && checkerRouteCount > 0`. In `checker_only`: any pathname not starting with `/boarding/route-check` → `router.replace('/boarding/route-check')`; nav items = `[ROUTE_CHECK_NAV]` only. In `allowed`: nav = `boardingNavigation` + `ROUTE_CHECK_NAV` when `checkerRouteCount > 0 || superAdmin`. Saved offline verdict stores the *client* state (`'checker_only'` included) via the existing `saveAccess`, and `gateToAccess` maps `'checker_only'` back. The `choose`/`must_pay` redirect effect and the `allowed && /boarding/in-charge` effect are untouched (they key on their own states).
- Nav: `export const ROUTE_CHECK_NAV: BoardingNavItem = { name: 'Route Check', shortName: 'Check', href: '/boarding/route-check', icon: ClipboardCheck }` (not added to `boardingNavigation` — the layout composes). Titles: `'/boarding/route-check': 'Route Check'`, and `deriveBoardingPageTitle` returns `'Route Check'` for `/boarding/route-check/...`.
- Bottom nav: accepts `items?: BoardingNavItem[]` (default `boardingNavigation`). Primary = `PRIMARY_HREFS` matches ∪ the route-check item when it is the only item; overflow = the rest; the More button renders only when overflow is non-empty.

- [ ] **Step 1: Access API** — in the non-super-admin path, after `const svc = createServiceRoleClient();`:

```ts
    // Route checkers: access comes from the assignment (verified login email), not a role.
    // Fail-soft here: a failed RPC must not turn an in-charge's gate into 'denied'.
    let checkerRouteCount = 0;
    try { checkerRouteCount = (await checkerRouteIds(svc, auth.userId)).length; }
    catch (e) { console.error('boarding access: checkerRouteIds failed:', e); }
```
Import `checkerRouteIds` from `@/lib/route-check/access`. Add `checkerRouteCount` to the success payload, to the super-admin payload (`0`), and to the catch payload (`0`).

- [ ] **Step 2: Navigation**

```ts
import { ClipboardCheck, ... } from 'lucide-react';
export const ROUTE_CHECK_NAV: BoardingNavItem = { name: 'Route Check', shortName: 'Check', href: '/boarding/route-check', icon: ClipboardCheck };
// TITLES: '/boarding/route-check': 'Route Check',
export function deriveBoardingPageTitle(pathname: string): string {
  if (pathname.startsWith('/boarding/routes/')) return 'Route Roster';
  if (pathname.startsWith('/boarding/route-check')) return 'Route Check';
  return TITLES[pathname] ?? 'Boarding';
}
```

- [ ] **Step 3: Bottom nav** — signature `export default function BoardingBottomNav({ items = boardingNavigation }: { items?: BoardingNavItem[] })`; replace `boardingNavigation` uses inside with `items`; compute:

```ts
  const byHref = new Map(items.map((i) => [i.href, i] as const));
  const primaryHrefs = items.length === 1 ? [items[0].href] : PRIMARY_HREFS;
  const primary = primaryHrefs.map((h) => byHref.get(h)).filter((i): i is BoardingNavItem => !!i);
  const overflow = items.filter((i) => !primaryHrefs.includes(i.href));
```
Wrap the More `<button>` and its sheet in `{overflow.length > 0 && (...)}`.

- [ ] **Step 4: Layout**
  - State union adds `'checker_only'`; new `const [checker, setChecker] = useState<{ count: number; superAdmin: boolean }>({ count: 0, superAdmin: false })`.
  - In the fetch effect, after parsing `d`: `const count = Number(d.checkerRouteCount) || 0; const superAdmin = d.superAdmin === true; setChecker({ count, superAdmin });` then compute `const next = gate === 'in_duty' ? 'allowed' : count > 0 ? 'checker_only' : gateToAccess(gate);` — save `next` with `saveAccess(...)` (instead of `gate`) and `setAccess(next)`. Update `gateToAccess` to also pass through `'checker_only'` and `'allowed'` (saved values are now client states): `const gateToAccess = (g) => g === 'in_duty' || g === 'allowed' ? 'allowed' : g === 'checker_only' || g === 'choose' || g === 'must_pay' || g === 'denied' ? g : 'denied';`
  - New effect: `useEffect(() => { if (access === 'checker_only' && !pathname.startsWith('/boarding/route-check')) router.replace('/boarding/route-check'); }, [access, pathname, router]);`
  - `checker_only` renders the SAME full shell as `allowed` (sidebar/header/bottom nav) — so change the final-branch condition implicitly by letting both fall through, and compute `const navItems = access === 'checker_only' ? [ROUTE_CHECK_NAV] : (checker.count > 0 || checker.superAdmin) ? [...boardingNavigation, ROUTE_CHECK_NAV] : boardingNavigation;` used by the sidebar map and passed as `<BoardingBottomNav items={navItems} />`.
  - `NotificationBell` stays for both modes (checkers may receive notices); nothing else changes.

- [ ] **Step 5: Scoped tsc** → CLEAN. Run `npx vitest run lib/boarding` → PASS (no test touches the layout, but the gate helpers must still be green).

- [ ] **Step 6: Commit**

```bash
git add app/api/boarding/access/route.ts app/boarding/layout.tsx lib/boarding/navigation.ts components/boarding-bottom-nav.tsx
git commit -m "feat(route-checks): staff-app access for assigned checkers (checker-only mode, Route Check nav)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Scanner — barcode formats and a wide frame on BusScanner

**Files:**
- Modify: `components/inspections/bus-scanner.tsx`

**Contract:** defaults are byte-for-byte the old behaviour (QR only, square box, `bus-sticker-reader` ids). New optional props:

```ts
  /** Barcode symbologies to decode; default QR only. */
  formats?: Html5QrcodeSupportedFormats[];
  /** 'square' (QR) or 'wide' (1D barcodes + QR): 85% width × min(45% height, 220px). */
  frame?: 'square' | 'wide';
  /** Unique element-id prefix when two scanners can exist on one page. */
  readerId?: string;
```

- [ ] **Step 1: Implement**
  - `READER_OPTIONS` becomes a function: `const readerOptions = (formats) => ({ formatsToSupport: formats, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });` — use it for both the live and the photo reader. (`useBarCodeDetectorIfSupported` only changes the decoder for QR too — acceptable; it is the same library path the browser exposes. If a QR-only regression is seen on the inspection scanner, gate `experimentalFeatures` on `formats.length > 1`.)
  - `scanConfig(frame)`: square = existing `qrbox`; wide = `qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.min(Math.floor(h * 0.45), 220) }), aspectRatio: 1.6`.
  - Element ids: `${readerId ?? 'bus-sticker'}-reader` / `-photo-reader`; container class `frame === 'wide' ? 'aspect-[1.6]' : 'aspect-square'`.
  - Photo-mode error text unchanged; `onRead` unchanged.

- [ ] **Step 2: Verify no behaviour change** — scoped tsc CLEAN; `grep -n "BusScanner" -r components app` shows the inspection callers pass no new props.

- [ ] **Step 3: Commit**

```bash
git add components/inspections/bus-scanner.tsx
git commit -m "feat(scanner): optional barcode formats, wide frame and reader id on BusScanner (defaults unchanged)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Client fetcher + My Routes page

**Files:**
- Create: `app/boarding/route-check/route-check-api.ts`
- Create: `app/boarding/route-check/page.tsx`

- [ ] **Step 1: Fetcher**

```ts
import type { CheckView, MyCheckRoute, ScanResponse, CheckLeg, CheckCounts } from '@/lib/route-check/types';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function fetchMyRoutes(): Promise<MyCheckRoute[]> {
  return (await json<{ data: MyCheckRoute[] }>(await fetch('/api/boarding/route-check/routes', { cache: 'no-store' }))).data;
}
export async function startCheck(routeId: string, leg: CheckLeg): Promise<{ checkId: string; resumed: boolean }> {
  return (await json<{ data: { checkId: string; resumed: boolean } }>(await post('/api/boarding/route-check/start', { routeId, leg }))).data;
}
export async function fetchCheck(checkId: string): Promise<CheckView> {
  return (await json<{ data: CheckView }>(await fetch(`/api/boarding/route-check/${checkId}`, { cache: 'no-store' }))).data;
}
/** Camera reads only — the server refuses anything else. */
export async function scanCode(checkId: string, code: string): Promise<ScanResponse> {
  return (await json<{ data: ScanResponse }>(await post(`/api/boarding/route-check/${checkId}/scan`, { code, source: 'camera' }))).data;
}
export async function pickCandidate(checkId: string, pick: { personKind: 'learner' | 'staff'; id: string; matchedBy: string; scannedCode: string | null }): Promise<ScanResponse> {
  return (await json<{ data: ScanResponse }>(await post(`/api/boarding/route-check/${checkId}/person`, pick))).data;
}
export async function removeEntry(checkId: string, personId: string): Promise<void> {
  await json(await fetch(`/api/boarding/route-check/${checkId}/person?personId=${encodeURIComponent(personId)}`, { method: 'DELETE' }));
}
export async function submitCheck(checkId: string): Promise<{ counts: CheckCounts }> {
  return (await json<{ data: { counts: CheckCounts } }>(await post(`/api/boarding/route-check/${checkId}/submit`, {}))).data;
}
```

- [ ] **Step 2: My Routes page** `app/boarding/route-check/page.tsx` (`'use client'`)
  - `useQuery({ queryKey: ['route-check', 'my-routes'], queryFn: fetchMyRoutes })`.
  - Loading skeleton; error card with Retry; empty state "No routes assigned to you for checking. Ask the Transport Head."
  - One card per route: `Route {routeNumber}` · `{routeName}` · `Bus {vehicleReg ?? '—'}`; two buttons **Morning** / **Evening** (`LEG_NAME`). Button label per `today[leg]`: null → "Start", `draft` → "Continue", `submitted` → "Submitted ✓" (still tappable → opens the read-only check). On tap: `startCheck` (unless submitted → navigate to `today[leg].id`), toast on error, `router.push(`/boarding/route-check/${checkId}`)`.
  - Mobile: cards `min-w-0`, buttons `flex-1`, `dark:` variants.

- [ ] **Step 3: Scoped tsc** → CLEAN. Commit:

```bash
git add app/boarding/route-check/route-check-api.ts app/boarding/route-check/page.tsx
git commit -m "feat(route-checks): staff-app My Routes page with Morning/Evening start

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Check page — roster with Paid/Unpaid, Booked/No booking and ✓ ticks

**Files:**
- Create: `app/boarding/route-check/[checkId]/page.tsx`
- Create: `components/route-check/learner-list.tsx`
- Create: `components/route-check/staff-list.tsx`
- Create: `components/route-check/counts-bar.tsx`
- Create: `lib/route-check/filter.ts`, `lib/route-check/filter.test.ts`

**Pure filter (TDD):**
```ts
// filter.ts
import type { CheckLearnerRow } from './types';
import { matchesFilter, type CheckFilter } from './counts';
export type ScreenFilter = CheckFilter | 'checked' | 'unchecked';
export function filterLearners(rows: CheckLearnerRow[], f: ScreenFilter): CheckLearnerRow[] {
  if (f === 'checked') return rows.filter((r) => r.checked);
  if (f === 'unchecked') return rows.filter((r) => !r.checked);
  return rows.filter((r) => matchesFilter({ booked: r.booked, status: r.status, feeState: r.feeState, notOnRoute: r.notOnRoute }, f));
}
/** Group by stop, keeping roster order (rows arrive stop-ordered). */
export function groupByStop(rows: CheckLearnerRow[]): { stopName: string; stopTime: string | null; rows: CheckLearnerRow[] }[] {
  const out: { stopName: string; stopTime: string | null; rows: CheckLearnerRow[] }[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.stopName === r.stopName) last.rows.push(r);
    else out.push({ stopName: r.stopName, stopTime: r.stopTime, rows: [r] });
  }
  return out;
}
```

- [ ] **Step 1: Write `filter.test.ts`** (rows built with a small factory; assert `checked`/`unchecked`/`unpaid`/`without_booking`/`not_on_route`/`all`; `groupByStop` keeps order and merges adjacent same-stop rows). Run → FAIL. Implement → PASS.

- [ ] **Step 2: `counts-bar.tsx`** — six small tiles (`Registered · Booked · Present · Unpaid · Without booking · Not on bus`) + a seventh `Checked ✓ n/registered`; `grid grid-cols-4 gap-2 sm:grid-cols-7`, `dark:` variants.

- [ ] **Step 3: `learner-list.tsx`** — props `{ groups, onTap?: (row) => void }`. Row layout (one line, `min-w-0`):
  - left: `✓` green circle when `checked` (title = `CHECK_OUTCOME_META[checkOutcome].label`), grey empty circle otherwise; name (truncate) · roll.
  - right chips: fee (`Paid` green / `Unpaid ₹{owed}` red / `No bill` grey / `—`), booking (`Booked` green / `No booking` amber), `From bus {otherBus.routeNumber}` amber when `notOnRoute`, `Present` tiny green dot when status present.
  - Tapping a row does nothing in this plan (manual tick from the list is OUT — a tick needs a scan).

- [ ] **Step 4: `staff-list.tsx`** — same row style; chips: `In-charge` blue when `isIncharge`, fee (`Exempt` grey for in-charge / `Paid` / `Unpaid ₹` / `No bill`), tick circle.

- [ ] **Step 5: Page** `app/boarding/route-check/[checkId]/page.tsx` (`'use client'`)
  - `useQuery({ queryKey: ['route-check', checkId], queryFn: () => fetchCheck(checkId), refetchOnWindowFocus: true })` — keep data on refetch error (TanStack keeps `data`; show a small amber note "Couldn't refresh — showing the last loaded list" when `isError && data`), full error card with Retry only when `!data`.
  - Header: `Route {routeNumber} · {routeName}` · `Bus {vehicleReg}` · `{LEG_NAME[leg]} · {checkDate}` · status pill (`Draft` / `Submitted`).
  - `<CountsBar counts />`.
  - Filter chips: `All · Unchecked · Checked · Unpaid · No booking · Not on bus · Staff` (state `ScreenFilter | 'staff'`).
  - Body: `filter === 'staff'` → `<StaffList>`; else `<LearnerList groups={groupByStop(filterLearners(view.learners, filter))} />`.
  - "Checked in this check" section (entries newest first): name/code, outcome chip (`CHECK_OUTCOME_META`), `✕` remove while draft (confirm via `window.confirm` is NOT allowed — use a two-tap pattern: first tap turns the ✕ into "Remove?" for 3 s, second tap calls `removeEntry` then invalidates `['route-check', checkId]`).
  - Sticky bottom bar (above the boarding bottom nav: `bottom-[calc(3.5rem+env(safe-area-inset-bottom))]` on `< lg`, `bottom-4` on `lg`): **Scan** (primary) · **Finish** — hidden when `status === 'submitted'` (show a green "Submitted at …" banner instead). Scan opens the dialog from Task 12; Finish is wired in Task 13.

- [ ] **Step 6: Scoped tsc** → CLEAN; `npx vitest run lib/route-check` → PASS. Commit:

```bash
git add lib/route-check/filter.ts lib/route-check/filter.test.ts components/route-check/learner-list.tsx components/route-check/staff-list.tsx components/route-check/counts-bar.tsx "app/boarding/route-check/[checkId]/page.tsx"
git commit -m "feat(route-checks): check screen with paid/unpaid, booked/no-booking badges, filters and ticks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Scan dialog with QR + barcode, verdict card and candidate picker

**Files:**
- Create: `components/route-check/scan-dialog.tsx`
- Create: `components/route-check/candidate-picker.tsx`
- Modify: `app/boarding/route-check/[checkId]/page.tsx` (wire the Scan button)

**Behaviour (mirrors `components/inspections/learner-scan-dialog.tsx`, which is the proven pattern):**
- `<BusScanner formats={[QR_CODE, CODE_39, CODE_128]} frame="wide" readerId="route-check" parse={parseCard} photoMode="fresh-only" subject="ID card" rejectMessage="That code is not a JKKN ID card or ID barcode." />` where `parseCard = (raw) => { const c = classifyCard(raw); return c.shape === 'unknown' ? null : c.code; }`.
- Synchronous `busyRef` + 4 s same-code suppression (`SAME_CARD_MS = 4000`), `genRef` bumped on close so a late reply never paints a stale verdict.
- `onCode` → `scanCode(checkId, code)`:
  - `kind: 'recorded'` → verdict card: `CHECK_OUTCOME_META[outcome]` colour, `✓ Ticked` / `Already ticked` line, name · code, `Booked today: yes/no`, `Fee: Paid / Unpaid ₹… / No bill / Exempt / —`, `On this bus / Not on this bus`; unknown card → "Card {code} is not linked to anyone". Invalidate `['route-check', checkId]` so the list's tick appears.
  - `kind: 'candidates'` → `<CandidatePicker candidates code onPick onCancel />`; pick → `pickCandidate(...)` → same verdict path.
  - error → red card + `toast.error`.
- "Scan next" button resets (`lastRef` time refreshed so the same card is still suppressed for 4 s).
- Session list "Checked this session (n)" newest first with outcome chips — same as the inspection dialog.
- The camera keeps running hidden under the verdict (as the inspection dialog does) so "Scan next" is instant.

**Candidate picker:** list rows `kind badge (Learner/Staff)` · name · code · `Route {routeNumber?}` hint (`routeId === this route` → "This bus" green chip first; `active === false` → grey "Inactive" chip); Cancel.

- [ ] **Step 1: Write `candidate-picker.tsx`** (props `{ code: string; candidates: Candidate[]; routeId: string; onPick: (c: Candidate) => void; onCancel: () => void; busy: boolean }`).
- [ ] **Step 2: Write `scan-dialog.tsx`** per the behaviour above (copy the state machine from `learner-scan-dialog.tsx`, replacing the fetcher, parser and verdict card).
- [ ] **Step 3: Wire** the page's Scan button: `const [scanOpen, setScanOpen] = useState(false)`; `<RouteCheckScanDialog checkId={checkId} routeId={view.route.id} open={scanOpen} onClose={() => setScanOpen(false)} />` (render only while `status === 'draft'`).
- [ ] **Step 4: Scoped tsc** → CLEAN. Commit:

```bash
git add components/route-check/scan-dialog.tsx components/route-check/candidate-picker.tsx "app/boarding/route-check/[checkId]/page.tsx"
git commit -m "feat(route-checks): QR + barcode scan dialog with verdict card and candidate picker

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Finish → Submit, and end-to-end verification

**Files:**
- Modify: `app/boarding/route-check/[checkId]/page.tsx`
- Create: `components/route-check/finish-panel.tsx`

- [ ] **Step 1: `finish-panel.tsx`** — a bottom sheet (`Dialog`) showing the counts summary (`Checked n of registered`, unpaid, without booking, not on bus) and two buttons: **Submit check** (primary) / **Not yet**. Submit → `submitCheck(checkId)` → toast `Check submitted` → invalidate `['route-check', checkId]` and `['route-check','my-routes']` → close. 409 → toast the server message and refetch.

- [ ] **Step 2: Wire** the Finish button to open it.

- [ ] **Step 3: Build + probes** (controller step)
  - Copy main's `.env` into the worktree for the build and delete it right after: `cp ../../.env .env && node node_modules/next/dist/bin/next build; rm -f .env` → build succeeds.
  - Start the dev server on 3001 with the env loaded (same copy/delete dance, or `env $(cat ../../.env | xargs)`), then signed-out probes:
    - `GET /api/boarding/route-check/routes` → 401
    - `POST /api/boarding/route-check/start` → 401
    - `GET /boarding/route-check` → 307 to `/auth/login?…`
  - Rolled-back SQL test of the tick uniqueness:
    ```sql
    begin;
    insert into tms_route_check (route_id, checker_id, check_date, leg) values ((select id from tms_route where status='active' limit 1), (select id from profiles limit 1), current_date, 'onward') returning id;
    -- use the returned id twice for the same learner → second insert must fail 23505
    rollback;
    ```
  - Full suite: `npx vitest run` → PASS; scoped tsc → CLEAN.

- [ ] **Step 4: Commit and update memory**

```bash
git add components/route-check/finish-panel.tsx "app/boarding/route-check/[checkId]/page.tsx"
git commit -m "feat(route-checks): finish panel submits the check with a counts snapshot

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
Update `project_route_checkers_module.md` memory: tasks done, what remains (admin pages, manual entries, headcount, inspection link), phone test owed.

- [ ] **Step 5: Handoff note for the user** — assignment can only be created through `POST /api/admin/route-checkers` until the admin page (next plan) exists; to phone-test, insert one assignment for a real staff login email via the API from the user's authenticated browser (or `execute_sql` insert with `checker_email = lower(auth.users.email)`), then open `/boarding/route-check` on the phone.

---

## Self-review

**Spec coverage (Staff app → Route Check):** my routes + today's status ✅ (T4, T10); Morning/Evening ✅ (T4, T10); counts row ✅ (T5, T11); filter chips ✅ (T11 — plus Checked/Unchecked, which the tick flow needs); learners grouped by stop with Paid/Unpaid, Booked/No booking, from-other-bus, "checked ✓" ✅ (T5, T11); Staff section with in-charges + bill status ✅ (T5, T11); Scan QR + Code 39 + Code 128, wide box, fresh photos ✅ (T9, T12); candidate picker ✅ (T12); remove entry while draft ✅ (T6, T11); Submit with snapshot ✅ (T7, T13); access via proxy/access API/layout checker-only/nav ✅ (T0, T8). **Deferred, stated up front:** Add manually, headcount/unknown/notes, admin pages, inspection link.

**Placeholder scan:** Task 4 Step 1 contains a deliberate "simplify before committing" note with the final code shown — keep the final shape. Task 5's in-charge lookup reuses `staffByEmail` (widened with `staff_id`) instead of a hand-built `.or()` filter.

**Type consistency:** `CheckPersonEntry`, `CheckView`, `ScanResponse`, `MyCheckRoute`, `MatchedBy` defined once in `types.ts` (T2) and used by T3–T7, T10–T12. `checkIdFromUrl` lives in `check-access.ts` (T5) and is imported by T6/T7. `tickCandidate` defined in T6 Step 1 and used by scan + person routes. `buildCheckView` defined in T5 and reused by T7. `ROUTE_CHECK_NAV` defined in T8 and used by the layout.
