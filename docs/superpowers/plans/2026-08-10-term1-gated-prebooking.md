# Term-1-Gated Pre-Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the learner portal to learners whose first transport-fee term is fully paid, and shrink bus pre-booking from a rolling 6 calendar days to the next *working* day.

**Architecture:** Two independent slices. The fee rule is enforced entirely inside the existing `tms_student_transport_access` SECURITY DEFINER RPC, which `proxy.ts` already consumes — so the hard gate needs no TypeScript change, only new learner-facing copy. The booking-window rule is a rewrite of the pure `bookableDates()` walk in `lib/booking/window.ts`; service-calendar off-days are *injected* as a `Set<string>` from the route edge so the module stays pure and unit-testable.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` not `middleware.ts`), TypeScript, Supabase (Postgres + PostgREST + plpgsql RPCs), vitest, TanStack Query, Tailwind v4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-term1-gated-prebooking-design.md`. Read it before Task 1.
- Current transport year in the live DB: **2026-2027**, id `6b3768f9-c9fb-48d5-a955-41949983c3b0`.
- All dates are `'YYYY-MM-DD'` strings in **IST (fixed +05:30, no DST)**. Never use a timezone library; the module uses integer math on UTC ms deliberately.
- `bookingDaysAhead` means **working days**, default **1**, clamped **1..10**.
- Horizon search cap: **21 calendar days**.
- Booking cutoff default stays **20:00 IST on the day before travel**. `cutoffHour: 24` is an existing sentinel meaning "time window disabled" — do not treat it as invalid.
- Sunday is the only hard-coded weekly holiday. **Saturday must stay bookable.**
- Supabase `.in()` filters must be chunked to **≤150 ids** and the error **must be checked** — an unchecked error silently yields an empty result on this project.
- `42P01` (missing table) must degrade to an empty result, never a 500. This idiom already exists across the codebase.
- Do **not** run repo-wide `npx tsc --noEmit`; it is chronically red on `main` and is not gated by `next build`. Scope typecheck to changed paths.
- **A concurrent session is writing this working tree** (bug-reports module, `proxy.ts`). `git add` only the exact files each task names. Never `git add -A` or `git commit -a`.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: Term-1 paid predicate + batch lookup

**Files:**
- Create: `lib/fees/term1.ts`
- Test: `lib/fees/term1.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isTerm1Paid(ledgerStatus: string | null | undefined, moneyStatus: string | null | undefined): boolean`
  - `term1PaidLearnerIds(svc: SupabaseClient, transportYearId: string): Promise<Set<string>>`
  - Task 7 (`reminders.ts`) consumes both.

- [ ] **Step 1: Write the failing test**

Create `lib/fees/term1.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isTerm1Paid } from './term1';

describe('isTerm1Paid', () => {
  it('is true only for a generated ledger row whose money row is paid', () => {
    expect(isTerm1Paid('generated', 'paid')).toBe(true);
  });

  it('is false when the money row is not fully paid', () => {
    expect(isTerm1Paid('generated', 'unpaid')).toBe(false);
    expect(isTerm1Paid('generated', 'partially_paid')).toBe(false);
    expect(isTerm1Paid('generated', 'overdue')).toBe(false);
  });

  it('is false for a cancelled (vacated) ledger row even if the money row says paid', () => {
    expect(isTerm1Paid('cancelled', 'paid')).toBe(false);
  });

  it('is false for a staff_deferred ledger row', () => {
    expect(isTerm1Paid('staff_deferred', 'paid')).toBe(false);
  });

  it('is false when either side is missing', () => {
    expect(isTerm1Paid(null, 'paid')).toBe(false);
    expect(isTerm1Paid('generated', null)).toBe(false);
    expect(isTerm1Paid(undefined, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fees/term1.test.ts`
Expected: FAIL — `Failed to resolve import "./term1"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/term1.ts`:

```ts
// lib/fees/term1.ts
// "Has this learner cleared their FIRST transport term?" — the positive
// precondition for portal access. Distinct from the pre-existing overdue rule:
// this one is fail-CLOSED (never billed = not cleared), so it must never be
// derived from the absence of an overdue row.
//
// The predicate is pure so the truth table is testable without a DB; the batch
// lookup is the only part that touches Supabase.

import type { SupabaseClient } from '@supabase/supabase-js';

// PostgREST serializes `.in()` into the request URL; ~500+ UUIDs overflow the
// Supabase gateway and return HTTP 400, which an unchecked `{ data }` turns into
// a silently EMPTY set — here that would lock every learner out. Chunk + throw.
const IN_CHUNK = 150;

/**
 * Pure: a learner's Term-1 obligation is cleared only when the ledger row is
 * live ('generated' — not cancelled by a vacate approval, not staff_deferred)
 * AND the money row in billing_student_bills is fully 'paid'. Partially paid
 * does not clear it.
 */
export function isTerm1Paid(
  ledgerStatus: string | null | undefined,
  moneyStatus: string | null | undefined,
): boolean {
  return ledgerStatus === 'generated' && moneyStatus === 'paid';
}

/**
 * Every learner whose Term 1 is cleared for the given transport year.
 * Two round trips: the ledger rows, then their money rows in chunks.
 */
export async function term1PaidLearnerIds(
  svc: SupabaseClient,
  transportYearId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!transportYearId) return out;

  const { data: ledger, error } = await svc
    .from('tms_fee_bill')
    .select('person_id, status, billing_student_bill_id')
    .eq('transport_year_id', transportYearId)
    .eq('person_type', 'learner')
    .eq('term_no', 1);
  if (error) {
    if ((error as { code?: string }).code === '42P01') return out; // table not created yet
    throw error;
  }

  type LedgerRow = { person_id: string; status: string | null; billing_student_bill_id: string | null };
  const byBillId = new Map<string, string>();
  for (const r of (ledger ?? []) as LedgerRow[]) {
    if (r.status === 'generated' && r.billing_student_bill_id) {
      byBillId.set(r.billing_student_bill_id, r.person_id);
    }
  }

  const ids = [...byBillId.keys()];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error: chunkError } = await svc
      .from('billing_student_bills')
      .select('id, status')
      .in('id', ids.slice(i, i + IN_CHUNK));
    if (chunkError) throw chunkError; // fail loud, never a quietly-empty set
    for (const b of (data ?? []) as { id: string; status: string | null }[]) {
      const personId = byBillId.get(b.id);
      if (personId && isTerm1Paid('generated', b.status)) out.add(personId);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/fees/term1.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck the new file**

Run: `npx tsc --noEmit --skipLibCheck --esModuleInterop --module esnext --moduleResolution bundler --target es2022 lib/fees/term1.ts`
Expected: no errors mentioning `lib/fees/term1.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/fees/term1.ts lib/fees/term1.test.ts
git commit -m "feat(fees): add Term-1-paid predicate and batch lookup

Fail-closed by construction: a learner clears Term 1 only when the ledger
row is live ('generated') AND the money row is fully 'paid'. Never billed,
vacated, and partially paid all read as NOT cleared.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rewrite the transport-access RPC

**Files:**
- Create: `supabase/migrations/20260810140000_term1_gated_transport_access.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks (SQL only).
- Produces: `public.tms_student_transport_access(p_profile_id uuid) returns jsonb`, whose payload gains `term1_paid` (boolean), `term1_status` (text|null), `term1_due_date` (date|null), `term1_balance` (numeric). Task 9 consumes these in the UI types.

**Background:** the current version lives at
`supabase/migrations/20260613110000_create_tms_student_transport_access_rpc.sql`. Read it first —
this migration is a `create or replace` of the same function, so the old file stays untouched on disk.

- [ ] **Step 1: Capture the "before" baseline from the live DB**

Use the `mcp__supabase__execute_sql` tool with this query and **save the output** — Step 5 compares against it:

```sql
with cur as (select id from tms_transport_year where is_current=true limit 1),
lp as (select id, profile_id, coalesce(bus_required,false) as busreq
       from learners_profiles where profile_id is not null),
t1 as (select fb.person_id, fb.status as ledger, b.status as money
       from tms_fee_bill fb join cur on cur.id=fb.transport_year_id
       left join billing_student_bills b on b.id=fb.billing_student_bill_id
       where fb.person_type='learner' and fb.term_no=1)
select case when lp.busreq = false then 'no_obligation'
            when t1.ledger='generated' and t1.money='paid' then 'allowed'
            when t1.ledger='cancelled' then 'vacated'
            when t1.person_id is null then 'never_billed'
            else 'unpaid' end as bucket,
       count(*) as learners
from lp left join t1 on t1.person_id = lp.id
group by 1 order by 2 desc;
```

Expected (2026-08-10): `no_obligation` 4164, `unpaid` 809, `allowed` 313, `vacated` 2, `never_billed` 2.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260810140000_term1_gated_transport_access.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- tms_student_transport_access(profile_id) — payment gate for the learner portal.
--
-- REPLACES the fail-open rule from 20260613110000. That version blocked only on
-- an OVERDUE term, so a learner who had never been billed rode free. The rule is
-- now a POSITIVE precondition: Term 1 must exist and be fully paid.
--
-- Order (first match wins):
--   1. not a learner / not bus_required  -> allowed  no_transport_obligation
--   2. no current transport year         -> allowed  no_current_transport_year
--   3. no live Term-1 bill               -> BLOCKED  term1_not_billed
--   4. Term-1 money row not 'paid'       -> BLOCKED  term1_unpaid
--   5. any due-date-passed term unpaid   -> BLOCKED  overdue      (unchanged)
--   6. otherwise                         -> allowed  current / no_bills
--
-- Step 2 stays FAIL-OPEN on purpose: if an admin leaves is_current=false on every
-- transport year, failing closed would lock all ~1,126 transport learners out of
-- the portal at once. An admin config gap must not read as unpaid debt.
--
-- Must stay SECURITY DEFINER: proxy.ts calls this with a USER-scoped client, and
-- learners_profiles / tms_fee_bill / billing_student_bills are all RLS-deny.
-- The EXECUTE grant is re-issued below — it has been silently stripped from this
-- shared multi-app database before, and fail-closed callers hid it for weeks.
--
-- Idempotent (create or replace).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_student_transport_access(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner_id   uuid;
  v_bus_required boolean;
  v_year_id      uuid;
  v_year_name    text;
  v_terms        jsonb;
  v_overdue      int := 0;
  v_total_owed   numeric := 0;
  v_bill_count   int := 0;
  v_t1_found     boolean;
  v_t1_status    text;
  v_t1_due       date;
  v_t1_balance   numeric;
  v_t1_paid      boolean := false;
  v_allowed      boolean;
  v_reason       text;
begin
  select id, coalesce(bus_required, false)
    into v_learner_id, v_bus_required
  from learners_profiles
  where profile_id = p_profile_id
  limit 1;

  -- 1. Not a learner, or not a transport user -> no obligation.
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

  -- 2. Misconfiguration, not debt -> fail OPEN.
  if v_year_id is null then
    return jsonb_build_object(
      'allowed', true, 'reason', 'no_current_transport_year',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null,
      'term1_due_date', null, 'term1_balance', 0);
  end if;

  -- All live terms for the year (unchanged shape — the fees page renders this).
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'term_no', fb.term_no,
      'amount', b.final_amount,
      'balance', b.balance_amount,
      'due_date', b.due_date,
      'status', b.status,
      'paid', (b.status = 'paid'),
      'overdue', (b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue'))
    ) order by fb.term_no), '[]'::jsonb),
    count(*) filter (where b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue')),
    coalesce(sum(b.balance_amount) filter (where b.due_date < current_date and b.status in ('unpaid','partially_paid','overdue')), 0),
    count(*)
  into v_terms, v_overdue, v_total_owed, v_bill_count
  from tms_fee_bill fb
  join billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_id = v_learner_id
    and fb.person_type = 'learner'
    and fb.transport_year_id = v_year_id
    and fb.status = 'generated';

  -- Term 1 specifically. No unique constraint enforces one row per learner per
  -- year (verified zero duplicates on 2026-08-10, but nothing prevents them), so
  -- prefer a paid row, then the earliest due date.
  select true, b.status, b.due_date, b.balance_amount
    into v_t1_found, v_t1_status, v_t1_due, v_t1_balance
  from tms_fee_bill fb
  join billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_id = v_learner_id
    and fb.person_type = 'learner'
    and fb.transport_year_id = v_year_id
    and fb.status = 'generated'
    and fb.term_no = 1
  order by (b.status = 'paid') desc, b.due_date asc
  limit 1;

  v_t1_paid := coalesce(v_t1_status, '') = 'paid';

  if not coalesce(v_t1_found, false) then
    -- 3. Never billed, or the only Term-1 row was cancelled by a vacate approval.
    v_allowed := false;
    v_reason  := 'term1_not_billed';
  elsif not v_t1_paid then
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
    'term1_paid', v_t1_paid,
    'term1_status', v_t1_status,
    'term1_due_date', v_t1_due,
    'term1_balance', coalesce(v_t1_balance, 0)
  );
end;
$$;

grant execute on function public.tms_student_transport_access(uuid) to authenticated, service_role;
```

- [ ] **Step 3: Apply the migration**

Use `mcp__supabase__apply_migration` with name `term1_gated_transport_access` and the SQL above.

- [ ] **Step 4: Verify the EXECUTE grant survived**

Run via `mcp__supabase__execute_sql`:

```sql
select has_function_privilege('authenticated',
  'public.tms_student_transport_access(uuid)', 'EXECUTE') as authenticated_can_execute;
```

Expected: `true`. If false, re-run the `grant` statement — this is a known recurring failure on this shared database.

- [ ] **Step 5: Verify the verdict per bucket against the Step 1 baseline**

Run via `mcp__supabase__execute_sql`:

```sql
with cur as (select id from tms_transport_year where is_current=true limit 1),
lp as (select id, profile_id, coalesce(bus_required,false) as busreq
       from learners_profiles where profile_id is not null),
t1 as (select fb.person_id, fb.status as ledger, b.status as money
       from tms_fee_bill fb join cur on cur.id=fb.transport_year_id
       left join billing_student_bills b on b.id=fb.billing_student_bill_id
       where fb.person_type='learner' and fb.term_no=1),
verdict as (
  select case when lp.busreq = false then 'no_obligation'
              when t1.ledger='generated' and t1.money='paid' then 'allowed'
              when t1.ledger='cancelled' then 'vacated'
              when t1.person_id is null then 'never_billed'
              else 'unpaid' end as bucket,
         (public.tms_student_transport_access(lp.profile_id) ->> 'allowed')::boolean as allowed,
         public.tms_student_transport_access(lp.profile_id) ->> 'reason' as reason
  from lp left join t1 on t1.person_id = lp.id)
select bucket, allowed, reason, count(*) from verdict group by 1,2,3 order by 4 desc;
```

Expected exactly:

| bucket | allowed | reason | count |
|---|---|---|---|
| no_obligation | true | no_transport_obligation | 4164 |
| unpaid | false | term1_unpaid | 809 |
| allowed | true | current | 313 |
| vacated | false | term1_not_billed | 2 |
| never_billed | false | term1_not_billed | 2 |

If `allowed` bucket returns `overdue` for anyone, that learner paid Term 1 but has a later term overdue — correct behaviour, but note the count and confirm it is small.

- [ ] **Step 6: Verify the new fields are present**

Run via `mcp__supabase__execute_sql`:

```sql
select public.tms_student_transport_access(profile_id) as payload
from learners_profiles
where profile_id is not null and coalesce(bus_required,false) = true
limit 3;
```

Expected: each payload contains `term1_paid`, `term1_status`, `term1_due_date`, `term1_balance` alongside the original keys.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260810140000_term1_gated_transport_access.sql
git commit -m "feat(fees): gate portal access on a PAID first transport term

Inverts tms_student_transport_access from fail-open to fail-closed. It
blocked only on an overdue term, so a never-billed learner rode free.
Term 1 must now exist and be fully paid; the overdue rule for terms 2..N
is unchanged. 'No current transport year' stays fail-OPEN so a config gap
cannot lock out all 1,126 transport learners at once.

Payload gains term1_paid / term1_status / term1_due_date / term1_balance;
every pre-existing field keeps its shape. Re-issues the EXECUTE grant,
which has been stripped from this shared database before.

Verified on the live DB: 4164 no-obligation and 313 paid still allowed,
809 already-blocked unchanged, 4 newly blocked.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Working-day booking window

**Files:**
- Modify: `lib/booking/window.ts` (whole-file rewrite of the horizon logic)
- Test: `lib/booking/window.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `WindowOpts` gains `offDates?: Set<string>`; `daysAhead` now means **working days**.
  - `bookableDates(now?: Date, opts?: WindowOpts): string[]` — **signature change**, second arg is now an options object, not a number.
  - `horizonDates(now?: Date, opts?: WindowOpts): string[]` — new; same walk without the cutoff filter, for cell labelling only.
  - `isBookingOpen`, `isCancelable`, `dayStatus` keep their signatures; `isCancelable` changes behaviour.
  - Tasks 4, 6, 7, 8 consume these.

- [ ] **Step 1: Write the failing tests**

Replace the `bookableDates`, `isBookingOpen` and `isCancelable` describe blocks in
`lib/booking/window.test.ts` with the following, and add the `horizonDates` block. Keep the
`istToday`, `addDays`, `cutoffFor`, `isSunday` and `dayStatus` blocks exactly as they are.
Add `horizonDates` to the import list at the top of the file.

```ts
// Reference dates used below (all IST):
//   2026-06-22 Mon, 06-23 Tue, 06-24 Wed, 06-25 Thu, 06-26 Fri,
//   2026-06-27 Sat, 06-28 Sun, 06-29 Mon
describe('bookableDates', () => {
  it('defaults to the SINGLE next working day', () => {
    expect(bookableDates(new Date('2026-06-22T03:00:00Z'))).toEqual(['2026-06-23']);
  });

  it('skips a Sunday to reach Monday', () => {
    // Saturday 2026-06-27, 06:00 IST -> Sunday 28th is skipped
    expect(bookableDates(new Date('2026-06-27T00:30:00Z'))).toEqual(['2026-06-29']);
  });

  it('skips a service-calendar off Saturday and lands on Monday', () => {
    // Friday 2026-06-26 morning, Saturday marked off
    const offDates = new Set(['2026-06-27']);
    expect(bookableDates(new Date('2026-06-26T03:00:00Z'), { offDates })).toEqual(['2026-06-29']);
  });

  it('returns a WORKING Saturday from Friday', () => {
    expect(bookableDates(new Date('2026-06-26T03:00:00Z'))).toEqual(['2026-06-27']);
  });

  it('advances past a day whose cutoff has already passed', () => {
    // Monday 2026-06-22 20:01 IST == 14:31 UTC. Tuesday's 20:00 cutoff has passed,
    // so the window moves to Wednesday instead of leaving a nightly dead zone.
    expect(bookableDates(new Date('2026-06-22T14:31:00Z'))).toEqual(['2026-06-24']);
  });

  it('counts WORKING days, not calendar days', () => {
    // Friday 2026-06-26, 3 working days ahead: Sat 27, (Sun 28 skipped), Mon 29, Tue 30
    expect(bookableDates(new Date('2026-06-26T03:00:00Z'), { daysAhead: 3 })).toEqual([
      '2026-06-27', '2026-06-29', '2026-06-30',
    ]);
  });

  it('returns [] when the 21-day cap is exhausted by a long holiday block', () => {
    const now = new Date('2026-06-22T03:00:00Z');
    const offDates = new Set<string>();
    for (let i = 1; i <= 21; i++) {
      offDates.add(addDays(istToday(now), i));
    }
    expect(bookableDates(now, { offDates })).toEqual([]);
  });

  it('honors a configured cutoff hour', () => {
    // 13:31 UTC == 19:01 IST; with cutoffHour 19, tomorrow has closed
    expect(bookableDates(new Date('2026-06-22T13:31:00Z'), { cutoffHour: 19 })).toEqual(['2026-06-24']);
  });
});

describe('horizonDates', () => {
  it('matches bookableDates when no cutoff has passed', () => {
    const now = new Date('2026-06-22T03:00:00Z');
    expect(horizonDates(now)).toEqual(bookableDates(now));
  });

  it('keeps a cutoff-passed day that bookableDates drops', () => {
    // Monday 20:01 IST: Tuesday is still the labelled horizon day (renders
    // 'closed'), while bookableDates has already advanced to Wednesday.
    const now = new Date('2026-06-22T14:31:00Z');
    expect(horizonDates(now)).toEqual(['2026-06-23']);
    expect(bookableDates(now)).toEqual(['2026-06-24']);
  });

  it('still skips Sundays and off days', () => {
    expect(horizonDates(new Date('2026-06-27T00:30:00Z'))).toEqual(['2026-06-29']);
  });
});

describe('isBookingOpen', () => {
  it('is open just before the default cutoff', () => {
    expect(isBookingOpen('2026-06-23', new Date('2026-06-22T14:29:00Z'))).toBe(true);
  });
  it('is closed just after the default cutoff', () => {
    expect(isBookingOpen('2026-06-23', new Date('2026-06-22T14:31:00Z'))).toBe(false);
  });
  it('rejects a date beyond the single-working-day horizon', () => {
    expect(isBookingOpen('2026-06-24', new Date('2026-06-22T03:00:00Z'))).toBe(false);
  });
  it('rejects today and past dates', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-22T06:00:00Z'))).toBe(false);
  });
  it('rejects a Sunday', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-27T00:30:00Z'))).toBe(false);
  });
  it('rejects a service-calendar off day', () => {
    expect(
      isBookingOpen('2026-06-27', new Date('2026-06-26T03:00:00Z'), { offDates: new Set(['2026-06-27']) })
    ).toBe(false);
  });
});

describe('isCancelable', () => {
  it('mirrors the cutoff for the next working day', () => {
    expect(isCancelable('2026-06-23', new Date('2026-06-22T14:29:00Z'))).toBe(true);
    expect(isCancelable('2026-06-23', new Date('2026-06-22T14:31:00Z'))).toBe(false);
  });

  it('still allows cancelling a Sunday booking before its cutoff', () => {
    expect(isCancelable('2026-06-28', new Date('2026-06-27T00:30:00Z'))).toBe(true);
  });

  // Regression: shrinking the horizon to one working day must NOT strand the
  // forward bookings learners already hold (seats exist through 2026-10-08).
  it('allows cancelling a booking far OUTSIDE the booking horizon', () => {
    const now = new Date('2026-06-22T03:00:00Z');
    expect(isBookingOpen('2026-07-15', now)).toBe(false); // not bookable
    expect(isCancelable('2026-07-15', now)).toBe(true);   // but still releasable
  });

  it('rejects a past date and today', () => {
    expect(isCancelable('2026-06-21', new Date('2026-06-22T03:00:00Z'))).toBe(false);
    expect(isCancelable('2026-06-22', new Date('2026-06-22T03:00:00Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/booking/window.test.ts`
Expected: FAIL — `horizonDates is not exported`, plus assertion failures on `bookableDates` (it still returns 6 calendar days).

- [ ] **Step 3: Rewrite the horizon logic**

Edit `lib/booking/window.ts` in this order. Leave `istToday`, `addDays`, `cutoffFor`, `isSunday`
and `dayStatus` untouched — and leave `isSunday` where it is (line 56).

1. Replace lines 7-8 (the two default constants) with the three constants below.
2. Replace the `WindowOpts` interface (lines 13-16) with the version below.
3. **Delete** `bookableDates` (lines 45-50) entirely — it moves below `isSunday`.
4. **Delete** `withinBookingWindow` (lines 62-65) entirely — the walk subsumes it.
5. In the gap left at lines 62-78 (between `isSunday` and `dayStatus`), insert `walkForward`,
   `bookableDates`, `horizonDates`, `isBookingOpen` and `isCancelable` from the block below,
   in that order.

Placing the walk *after* `isSunday` keeps the reading order sane; JS function-declaration
hoisting would allow either, but do not rely on it.

```ts
const DEFAULT_CUTOFF_HOUR_IST = 20; // 20:00 IST on the prior day
const DEFAULT_DAYS_AHEAD = 1;       // WORKING days (admin-configurable 1..10)
const MAX_LOOKAHEAD_DAYS = 21;      // search cap so a long holiday block can't loop

/** Optional per-call configuration threaded from admin settings at the route edge. */
export interface WindowOpts {
  cutoffHour?: number;      // 0..23 IST (24 = daily time window disabled); default 20
  daysAhead?: number;       // 1..10 WORKING days; default 1
  /**
   * Service-calendar holiday / no_service dates. Injected by the caller rather
   * than read here so this module stays pure and unit-testable — the DB access
   * lives at the route edge in loadExceptions().
   */
  offDates?: Set<string>;
}

/**
 * The walk shared by horizonDates() and bookableDates(). Starts at tomorrow and
 * collects the first `daysAhead` dates that are service days, optionally also
 * requiring the cutoff to still be open.
 */
function walkForward(now: Date, opts: WindowOpts, requireOpen: boolean): string[] {
  const want = opts.daysAhead ?? DEFAULT_DAYS_AHEAD;
  const cutoffHour = opts.cutoffHour ?? DEFAULT_CUTOFF_HOUR_IST;
  const today = istToday(now);
  const out: string[] = [];
  for (let i = 1; i <= MAX_LOOKAHEAD_DAYS && out.length < want; i++) {
    const date = addDays(today, i);
    if (isSunday(date)) continue;              // compulsory weekly holiday
    if (opts.offDates?.has(date)) continue;    // admin holiday / no-service day
    if (requireOpen && now.getTime() >= cutoffFor(date, cutoffHour).getTime()) continue;
    out.push(date);
  }
  return out;
}

/**
 * The dates a learner can actually book right now: the next `daysAhead` WORKING
 * days whose cutoff has not yet passed.
 *
 * Skipping already-closed days is what removes the nightly dead zone. With the
 * default daysAhead of 1, a learner at 20:01 would otherwise face an empty
 * calendar until midnight — tomorrow has closed and nothing else is in range.
 * Instead the window advances to the next still-open working day.
 *
 * Returns fewer dates (possibly none) rather than throwing when the 21-day cap
 * is exhausted — a long holiday block is a valid state.
 */
export function bookableDates(now: Date = new Date(), opts: WindowOpts = {}): string[] {
  return walkForward(now, opts, true);
}

/**
 * The same walk WITHOUT the cutoff filter. Used only for calendar cell labelling
 * so a day whose cutoff has just passed still reads 'closed' rather than greying
 * out as 'out_of_horizon'. Never use this to authorize a booking.
 */
export function horizonDates(now: Date = new Date(), opts: WindowOpts = {}): string[] {
  return walkForward(now, opts, false);
}

/**
 * Bookable = present in the current window. Sunday, service-calendar off days and
 * the cutoff are all already applied by the walk, so there is nothing to re-check.
 */
export function isBookingOpen(travelDate: string, now: Date = new Date(), opts: WindowOpts = {}): boolean {
  return bookableDates(now, opts).includes(travelDate);
}

/**
 * Cancellation is deliberately NOT tied to the booking horizon. Shrinking that
 * horizon to a single working day would otherwise strand every pre-existing
 * forward booking — learners hold seats weeks out — with no way to release the
 * seat. A booking is cancellable while its travel date is still in the future
 * AND its cutoff has not passed.
 *
 * Sunday is not gated here: a pre-existing Sunday booking must stay cancellable.
 */
export function isCancelable(travelDate: string, now: Date = new Date(), opts: WindowOpts = {}): boolean {
  if (travelDate <= istToday(now)) return false;
  return now.getTime() < cutoffFor(travelDate, opts.cutoffHour ?? DEFAULT_CUTOFF_HOUR_IST).getTime();
}
```

Also update the file's top doc comment (lines 1-5) to describe the working-day walk instead of the
rolling calendar horizon.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/booking/window.test.ts`
Expected: PASS — all blocks green, including the untouched `istToday` / `addDays` / `cutoffFor` / `isSunday` / `dayStatus` tests.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/window.ts lib/booking/window.test.ts
git commit -m "feat(booking): horizon becomes the next WORKING day

bookableDates() now walks forward from tomorrow and returns the first
daysAhead dates that are not Sunday, not a service-calendar off day, and
whose cutoff has not passed. daysAhead means WORKING days and defaults to
1, so a travel day is booked on the previous working day. Saturday stays
bookable; off Saturdays keep coming from the service calendar.

Skipping cutoff-passed days removes a nightly dead zone: at 20:01 with a
1-day horizon the learner would otherwise see an empty calendar until
midnight. horizonDates() keeps the unfiltered walk for cell labelling.

isCancelable() no longer consults the horizon — a booking is releasable
while its date is future and its cutoff is open — so the tighter window
cannot strand the forward bookings learners already hold.

BREAKING: bookableDates(now, daysAhead) is now bookableDates(now, opts).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Thread off-days through the calendar view model

**Files:**
- Modify: `lib/booking/calendar.ts:39-106`
- Test: `lib/booking/calendar.test.ts`

**Interfaces:**
- Consumes: `bookableDates`, `horizonDates`, `WindowOpts.offDates` from Task 3.
- Produces: `effectiveOpen`, `cellStatus` and `buildMonthCells` all accept an extra `offDates?: Set<string>` option. Task 6 passes it.

- [ ] **Step 1: Update the two existing assertions that encode the OLD horizon**

`lib/booking/calendar.test.ts` was written against the rolling 6-calendar-day horizon. Two
assertions now describe behaviour that is deliberately gone — with `daysAhead` defaulting to 1
working day, only `2026-06-23` is in range from Monday `2026-06-22`. Make these exact edits
**before** adding new tests, or Step 4 will fail on the old expectations rather than the new code.

- Lines 4-5: replace the header comment with:
  ```ts
  // Frozen clock: now + 5:30 IST => IST today = 2026-06-22 (Monday). With the
  // default 1-working-day horizon, the only bookable date is Tuesday 06-23.
  ```
- Line 29: rename the test to `'the single working day ahead is open; everything beyond is out_of_horizon'`
- Line 30: replace the comment with `// NOW is Monday 2026-06-22; the horizon is exactly 06-23 (Tue)`
- Line 31: change to
  ```ts
    expect(cellStatus('2026-06-26', { hasBooking: false, now: NOW })).toBe('out_of_horizon'); // Fri, beyond the 1-day horizon
  ```
- Line 47: a booked date beyond the horizon now reads `locked`, not `booked`:
  ```ts
    expect(by('2026-06-24').status).toBe('locked'); // booked, but past the 1-day horizon
  ```
- Line 55: replace the trailing comment with `// IST today 2026-06-22 (Mon) => bookable 06-23 only`
- Line 72: replace the comment with `// 2026-06-28 is a Sunday — never bookable, whatever the horizon`

- [ ] **Step 2: Write the failing tests**

Append to `lib/booking/calendar.test.ts`:

```ts
describe('offDates threading', () => {
  it('effectiveOpen rejects a service-calendar off day', () => {
    const now = new Date('2026-06-26T03:00:00Z'); // Friday
    expect(effectiveOpen('2026-06-27', { now })).toBe(true); // working Saturday
    expect(effectiveOpen('2026-06-27', { now, offDates: new Set(['2026-06-27']) })).toBe(false);
  });

  it('effectiveOpen opens the Monday once Saturday is marked off', () => {
    const now = new Date('2026-06-26T03:00:00Z');
    expect(effectiveOpen('2026-06-29', { now, offDates: new Set(['2026-06-27']) })).toBe(true);
  });

  it('cellStatus labels a cutoff-passed horizon day "closed", not "out_of_horizon"', () => {
    // Monday 20:01 IST: Tuesday closed, Wednesday now open
    const now = new Date('2026-06-22T14:31:00Z');
    expect(cellStatus('2026-06-23', { hasBooking: false, now })).toBe('closed');
    expect(cellStatus('2026-06-24', { hasBooking: false, now })).toBe('open');
  });

  it('cellStatus marks a far-future day out_of_horizon, and locked if booked', () => {
    const now = new Date('2026-06-22T03:00:00Z');
    expect(cellStatus('2026-07-15', { hasBooking: false, now })).toBe('out_of_horizon');
    expect(cellStatus('2026-07-15', { hasBooking: true, now })).toBe('locked');
  });

  it('buildMonthCells forwards offDates to the gate', () => {
    const cells = buildMonthCells('2026-06', {
      bookedDates: new Set<string>(),
      exceptions: new Map(),
      offDates: new Set(['2026-06-27']),
      now: new Date('2026-06-26T03:00:00Z'),
    });
    const sat = cells.find((c) => c.date === '2026-06-27');
    const mon = cells.find((c) => c.date === '2026-06-29');
    expect(sat?.status).toBe('out_of_horizon');
    expect(mon?.status).toBe('open');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/booking/calendar.test.ts`
Expected: FAIL — `offDates` is not a known property, plus assertion failures.

- [ ] **Step 4: Update `lib/booking/calendar.ts`**

Change the import on line 7 to include `horizonDates`:

```ts
import { bookableDates, cutoffFor, horizonDates, isSunday } from './window';
```

(`dayStatus` is no longer needed here — `cellStatus` computes the four states directly.)

Replace `effectiveOpen` (lines 39-52) with:

```ts
/**
 * Is booking open for a date, honoring an optional per-date window override plus
 * the injected config? The horizon walk already applies Sunday, the service
 * calendar and the standard cutoff.
 *
 * KNOWN GAP (pre-existing, out of scope): a per-date `deadline` set LATER than
 * the standard cutoff cannot rescue a date the walk has already dropped. The
 * override can only tighten the window, not widen it.
 */
export function effectiveOpen(
  date: string,
  opts: { window?: WindowOverride; now?: Date; cutoffHour?: number; daysAhead?: number; offDates?: Set<string> }
): boolean {
  const now = opts.now ?? new Date();
  if (opts.window && !opts.window.enabled) return false;
  const inWindow = bookableDates(now, {
    cutoffHour: opts.cutoffHour,
    daysAhead: opts.daysAhead,
    offDates: opts.offDates,
  }).includes(date);
  if (!inWindow) return false;
  if (opts.window?.deadline) return now.getTime() < new Date(opts.window.deadline).getTime();
  return true;
}
```

Replace `cellStatus` (lines 54-77) with:

```ts
/** Status for ONE date. A service-calendar exception wins over everything. */
export function cellStatus(
  date: string,
  opts: {
    hasBooking: boolean;
    exception?: CalendarException;
    window?: WindowOverride;
    now?: Date;
    cutoffHour?: number;
    daysAhead?: number;
    offDates?: Set<string>;
  }
): CalendarStatus {
  if (opts.exception) return opts.exception.kind; // 'holiday' | 'no_service'
  if (isSunday(date)) return opts.hasBooking ? 'locked' : 'weekly_off';

  const now = opts.now ?? new Date();
  const walkOpts = { cutoffHour: opts.cutoffHour, daysAhead: opts.daysAhead, offDates: opts.offDates };

  if (effectiveOpen(date, { window: opts.window, now, ...walkOpts })) {
    return opts.hasBooking ? 'booked' : 'open';
  }
  // Inside the labelled horizon but not open => the cutoff passed (or an admin
  // disabled the date). Distinct from a day that was never in range at all.
  if (horizonDates(now, walkOpts).includes(date)) {
    return opts.hasBooking ? 'locked' : 'closed';
  }
  return opts.hasBooking ? 'locked' : 'out_of_horizon';
}
```

In `buildMonthCells` (lines 79-106), add `offDates?: Set<string>;` to the `opts` type and pass
`offDates: opts.offDates,` into the `cellStatus` call alongside the existing `cutoffHour` /
`daysAhead` arguments.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/booking/calendar.test.ts`
Expected: PASS. The `effectiveOpen with injected config` block (lines 87-99) needs no edit — it
already pins `daysAhead: 1`, and 1 *working* day from Monday 2026-06-22 is still Tuesday 06-23.

- [ ] **Step 6: Run the whole booking suite**

Run: `npx vitest run lib/booking`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/booking/calendar.ts lib/booking/calendar.test.ts
git commit -m "feat(booking): thread service-calendar off days into the cell gate

effectiveOpen / cellStatus / buildMonthCells accept offDates so the month
grid greys the same days the server rejects. cellStatus now distinguishes
a cutoff-passed horizon day ('closed') from one that was never in range
('out_of_horizon') via horizonDates, which the single-working-day window
would otherwise have collapsed into one grey state.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Redefine `bookingDaysAhead` as working days

**Files:**
- Modify: `lib/settings/scheduling.ts:11-16,29-52`
- Test: `lib/settings/scheduling.test.ts:25-30,32-37,39-71,85-92`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEFAULT_SCHEDULING_CONFIG.daysAhead === 1`; `parseSchedulingConfig` clamps `bookingDaysAhead` to 1..10. `toWindowOpts` is unchanged.

- [ ] **Step 1: Update the failing tests**

In `lib/settings/scheduling.test.ts` make these exact edits:

- Line 25: rename the test to `'clamps cutoffHour to 0..23 and daysAhead to 1..10'`
- Line 28: `expect(parseSchedulingConfig({ bookingDaysAhead: 99 }).daysAhead).toBe(10);`
- Line 35: `expect(cfg.daysAhead).toBe(1);`
- Line 46: `expect(cfg.daysAhead).toBe(1);`
- Line 58: `expect(cfg.daysAhead).toBe(1);`
- Line 70: `expect(cfg.daysAhead).toBe(1);`
- Line 44: change the comment to `// null for bookingDaysAhead → daysAhead falls back to 1`
- Line 56: change the comment to `// Array for bookingDaysAhead → daysAhead falls back to 1`
- Line 68: change the comment to `// -Infinity for bookingDaysAhead → daysAhead falls back to 1`
- Line 86: `for (const daysAhead of [1, 5, 10]) {`

Then add this test at the end of the `parseSchedulingConfig` describe block:

```ts
  it('accepts the top of the working-day range', () => {
    expect(parseSchedulingConfig({ bookingDaysAhead: 10 }).daysAhead).toBe(10);
    expect(parseSchedulingConfig({ bookingDaysAhead: 11 }).daysAhead).toBe(10);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/settings/scheduling.test.ts`
Expected: FAIL — `expected 6 to be 1` and `expected 14 to be 10`.

- [ ] **Step 3: Update `lib/settings/scheduling.ts`**

Change line 6 of the `SchedulingConfig` interface comment and the default:

```ts
export interface SchedulingConfig {
  enableBookingTimeWindow: boolean;
  cutoffHour: number;         // 0..23 IST (from stored bookingWindowEndHour)
  daysAhead: number;          // 1..10 WORKING days (from stored bookingDaysAhead)
  autoNotifyPassengers: boolean;
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  enableBookingTimeWindow: true,
  cutoffHour: 20,
  daysAhead: 1,
  autoNotifyPassengers: true,
};
```

In `parseSchedulingConfig`, change the `daysAhead` clamp from `clampInt(b.bookingDaysAhead, 1, 14, ...)` to:

```ts
    daysAhead: clampInt(b.bookingDaysAhead, 1, 10, DEFAULT_SCHEDULING_CONFIG.daysAhead),
```

Update the `toWindowOpts` doc comment so "The horizon / Sunday / service-calendar gates are
unaffected: daysAhead is always passed through unchanged" reads "…daysAhead — now a count of
WORKING days — is always passed through unchanged".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/settings/scheduling.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/scheduling.ts lib/settings/scheduling.test.ts
git commit -m "feat(settings): bookingDaysAhead now counts WORKING days, default 1

Rather than deleting the admin lever, its unit changes: non-service days
no longer consume horizon budget. Default drops 6 -> 1 so booking opens
one working day ahead; the range tightens 1..14 -> 1..10.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Wire off-days into the student booking route

**Files:**
- Modify: `app/api/student/bookings/route.ts:7,10,32-38,104-123,139-154,179-199,243-254`

**Interfaces:**
- Consumes: `bookableDates`, `horizonDates`, `isCancelable` (Task 3); `buildMonthCells`, `effectiveOpen`, `loadExceptions` with `offDates` (Task 4); `toWindowOpts` (Task 5).
- Produces: the GET month payload gains `nextBookableDate: string | null`; the GET board payload gains the same. Task 9 renders it.

- [ ] **Step 1: Add the shared horizon-exception loader to `getBoard`**

Change the import on line 7 to add `istToday`:

```ts
import { addDays, bookableDates, cutoffFor, dayStatus, isCancelable, isSunday, istToday } from '@/lib/booking/window';
```

In `getBoard`, immediately after `const winOpts = toWindowOpts(cfg);` (line 36), replace the
existing `const dates = bookableDates(new Date(), cfg.daysAhead);` with:

```ts
    // The walk needs to know which days are NOT service days before it can pick
    // the next WORKING day, so load the service calendar across the whole 21-day
    // search cap — not just the month being viewed.
    const today = istToday();
    const horizonExceptions = await loadExceptions(
      svc, learner.transport_route_id ?? null, addDays(today, 1), addDays(today, 21)
    );
    const offDates = new Set(horizonExceptions.keys());
    const dates = bookableDates(new Date(), { ...winOpts, offDates });
```

- [ ] **Step 2: Pass `offDates` into the month grid and expose the next bookable day**

In the `monthParam` branch, the month's own `exceptions` map is still loaded and still supplies
each cell's `exception` / `note`. Extend the `buildMonthCells` call (line 104) to forward the
horizon off-days, and add the new field to the response:

```ts
      const cells = buildMonthCells(monthParam, {
        bookedDates,
        exceptions,
        windows,
        cutoffHour: winOpts.cutoffHour,
        daysAhead: winOpts.daysAhead,
        offDates,
      }).map((c) => ({
        ...c,
        cutoff: c.status === 'open' || c.status === 'booked'
          ? (windows.get(c.date)?.deadline ?? cutoffFor(c.date, winOpts.cutoffHour).toISOString())
          : null,
        attendance: attendance.get(c.date),
      }));

      return NextResponse.json({
        success: true,
        data: {
          routeLabel,
          stopLabel,
          assigned: !!learner.transport_route_id,
          month: monthParam,
          cells,
          maxBookableDate: dates[dates.length - 1] ?? null,
          nextBookableDate: dates[0] ?? null,
        },
      });
```

- [ ] **Step 3: Pass `offDates` into the non-month board and expose the same field**

Replace the `days` mapping and return (lines 139-154) with:

```ts
    const days = dates.map((date) => ({
      date,
      status: dayStatus(booked.has(date), date, new Date(), { ...winOpts, offDates }),
      cutoff: cutoffFor(date, winOpts.cutoffHour).toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        routeLabel,
        stopLabel,
        assigned: !!learner.transport_route_id,
        days,
        maxBookableDate: dates[dates.length - 1] ?? null,
        nextBookableDate: dates[0] ?? null,
      },
    });
```

- [ ] **Step 4: Reorder the book-path gates and inject `offDates`**

In `mutate`, inside the `action === 'book'` branch (lines 187-199), replace the block from the
`isSunday` check through the `blocking` check with:

```ts
      if (isSunday(travelDate)) {
        return NextResponse.json({ error: 'Sunday is a weekly holiday — buses do not run that day' }, { status: 409 });
      }

      // Load the service calendar across the walk's 21-day cap. The horizon now
      // SKIPS holidays, so a holiday date is simply absent from bookableDates —
      // this check must run BEFORE effectiveOpen or the specific "that date is a
      // holiday" message would be masked by the generic "booking is closed".
      const today = istToday();
      const horizonExceptions = await loadExceptions(
        svc, learner.transport_route_id, addDays(today, 1), addDays(today, 21)
      );
      if (horizonExceptions.has(travelDate)) {
        return NextResponse.json({ error: 'That date is a holiday / no-service day' }, { status: 409 });
      }
      const offDates = new Set(horizonExceptions.keys());

      const winMap = await loadWindows(svc, learner.transport_route_id, travelDate, travelDate);
      const openOpts = { window: winMap.get(travelDate), ...winOpts, offDates };
      if (!effectiveOpen(travelDate, openOpts)) {
        return NextResponse.json({ error: 'Booking is closed for that date' }, { status: 409 });
      }
```

Delete the now-duplicated `const blocking = await loadExceptions(...)` lines and their `if` block
that followed `effectiveOpen`.

- [ ] **Step 5: Update the cancel-path comment**

Replace the comment block above the `isCancelable` call (lines 243-251) with:

```ts
    // cancel — isCancelable() deliberately does NOT consult the booking horizon.
    // With a single-working-day window, a horizon-scoped rule would strand every
    // pre-existing forward booking with no way to release the seat. A booking is
    // cancellable while its travel date is future and its cutoff is still open.
    // Sunday is not gated: a pre-existing Sunday booking must stay cancellable.
```

The call itself, `if (!isCancelable(travelDate, new Date(), winOpts))`, is unchanged — cancellation
does not need `offDates`.

- [ ] **Step 6: Typecheck the route**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/api/student/bookings|lib/booking" || echo "no errors in changed paths"`
Expected: `no errors in changed paths`. (Whole-repo errors elsewhere are pre-existing — see Global Constraints.)

- [ ] **Step 7: Verify the route compiles and answers**

Run: `npm run build 2>&1 | tail -25`
Expected: build succeeds; no error mentioning `app/api/student/bookings`.

Then, with the dev server running, probe the unauthenticated response:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/student/bookings`
Expected: `401`. (Use `127.0.0.1`, not `localhost` — `localhost` false-negatives on this machine. Confirm the port belongs to TMS-ADMIN by checking the page `<title>` first; the port mapping is not stable.)

- [ ] **Step 8: Commit**

```bash
git add app/api/student/bookings/route.ts
git commit -m "feat(booking): feed the service calendar into the working-day walk

The horizon must know which days are non-service before it can pick the
next WORKING day, so both the board and the book path load exceptions
across the walk's full 21-day cap rather than just the viewed month.

The holiday check moves BEFORE effectiveOpen: the walk now skips holidays
outright, so the generic 'booking is closed' would otherwise mask the
specific 'that date is a holiday' message.

Adds nextBookableDate to both payloads so the UI can say which single day
is open, or that none is.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Fix reminder targeting and date

**Files:**
- Modify: `lib/booking/reminders.ts:1-5,30-52,56-93`
- Test: `lib/booking/reminders.test.ts` (create)

**Interfaces:**
- Consumes: `term1PaidLearnerIds` (Task 1); `bookableDates`, `addDays`, `istToday` (Task 3); `loadExceptions` (existing).
- Produces: `ReminderSummary.date` becomes `string | null`. No later task consumes it.

**Why:** the cron hardcodes `bookableDates()[0]` as "tomorrow" — on a Friday whose Saturday is
marked off it nags learners to book a non-service day. It also targets every `bus_required`
learner with a route, **809 of whom cannot book** because Term 1 is unpaid.

- [ ] **Step 1: Write the failing test**

Create `lib/booking/reminders.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reminderTargets } from './reminders';

describe('reminderTargets', () => {
  const learners = [
    { id: 'L1', profile_id: 'P1' },
    { id: 'L2', profile_id: 'P2' },
    { id: 'L3', profile_id: 'P3' },
    { id: 'L4', profile_id: null },
  ];

  it('drops learners who already booked, were already notified, or have no profile', () => {
    expect(
      reminderTargets(learners, new Set(['L1']), new Set(['P2']), null)
    ).toEqual(['P3']);
  });

  it('keeps only Term-1-paid learners when the paid set is known', () => {
    expect(
      reminderTargets(learners, new Set(), new Set(), new Set(['L1', 'L3']))
    ).toEqual(['P1', 'P3']);
  });

  it('falls OPEN and reminds everyone when the paid set is unknown', () => {
    // Mirrors the RPC: no current transport year means no Term-1 obligation to
    // evaluate, so nobody is filtered out on fee grounds.
    expect(
      reminderTargets(learners, new Set(), new Set(), null)
    ).toEqual(['P1', 'P2', 'P3']);
  });

  it('returns nothing when every learner is filtered out', () => {
    expect(
      reminderTargets(learners, new Set(['L1', 'L2', 'L3']), new Set(), null)
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/booking/reminders.test.ts`
Expected: FAIL — `reminderTargets is not exported`.

- [ ] **Step 3: Update `lib/booking/reminders.ts`**

Change the imports at the top of the file to:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, bookableDates, cutoffFor, istToday } from './window';
import { loadExceptions } from './calendar';
import { loadSchedulingConfig } from '../settings/scheduling';
import { term1PaidLearnerIds } from '../fees/term1';
import { dispatchNotification } from '../notifications/dispatch';
import { reminderCopy } from './reminder-copy';
```

Change `ReminderSummary.date` to `string | null` and document it:

```ts
export interface ReminderSummary {
  /** The travel date reminded for — null when no working day is open. */
  date: string | null;
  reminded: number;
  candidates: number;
  /** Non-null when the run intentionally did nothing (e.g. reminders disabled). */
  skipped: string | null;
  dryRun: boolean;
}
```

Add the pure targeting helper just above `sendBookingReminders`:

```ts
/**
 * Pure: who should receive the nudge. Extracted so the filter chain is testable
 * without a Supabase client.
 *
 * `term1Paid` of null means "unknown" — there is no current transport year, so
 * there is no Term-1 obligation to evaluate and nobody is filtered on fee
 * grounds. That mirrors the fail-open branch in tms_student_transport_access;
 * the two must not disagree, or the cron would nag learners the gate blocks.
 */
export function reminderTargets(
  learners: LearnerRow[],
  bookedLearnerIds: Set<string>,
  notifiedProfileIds: Set<string>,
  term1Paid: Set<string> | null,
): string[] {
  return learners
    .filter((l) => !bookedLearnerIds.has(l.id))
    .filter((l) => !!l.profile_id && !notifiedProfileIds.has(l.profile_id))
    .filter((l) => term1Paid === null || term1Paid.has(l.id))
    .map((l) => l.profile_id as string);
}
```

Export the row type so the test can build fixtures — change `interface LearnerRow` to
`export interface LearnerRow`.

Inside `sendBookingReminders`, replace the date computation (the `const date = bookableDates()[0];`
line and the `base` object below it) with:

```ts
  const dryRun = opts.dryRun === true;
  const cfg = await loadSchedulingConfig(svc);

  // The reminder run is route-agnostic (one date for the whole cohort), so it
  // reads ALL-ROUTES exceptions only. A holiday declared for a single route does
  // not shift the date; those learners still get the nudge and are blocked at
  // booking time by the per-route check in the route handler.
  const today = istToday();
  const exceptions = await loadExceptions(svc, null, addDays(today, 1), addDays(today, 21));
  const cutoffHour = cfg.enableBookingTimeWindow ? cfg.cutoffHour : 24;
  const date = bookableDates(new Date(), {
    cutoffHour,
    daysAhead: 1,
    offDates: new Set(exceptions.keys()),
  })[0] ?? null;

  const base: ReminderSummary = { date, reminded: 0, candidates: 0, skipped: null, dryRun };

  if (!cfg.autoNotifyPassengers) {
    return { ...base, skipped: 'autoNotifyPassengers is off' };
  }
  if (!date) {
    return { ...base, skipped: 'no working day is open within the next 21 days' };
  }
```

Delete the old `effectiveCutoff` const and its `if` block, and replace the cutoff guard with:

```ts
  // The EFFECTIVE cutoff, not the raw stored hour: when the daily time window is
  // disabled there is no deadline today, so the copy must not announce one.
  const effectiveCutoff = cfg.enableBookingTimeWindow ? cfg.cutoffHour : null;

  // bookableDates() already excludes a date whose cutoff has passed, so this is
  // now a belt-and-braces guard rather than the primary check.
  if (effectiveCutoff !== null && Date.now() >= cutoffFor(date, effectiveCutoff).getTime()) {
    return { ...base, skipped: `cutoff ${effectiveCutoff}:00 IST already passed for ${date}` };
  }
```

Replace the targeting block (from `const targetProfiles = all` back up through the
`notifiedProfiles` construction is unchanged) with:

```ts
  // Only learners who can actually book. 809 of the bus_required cohort are
  // blocked on an unpaid Term 1 and must not be nagged to book.
  const { data: yearRow } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  const yearId = (yearRow as { id: string } | null)?.id ?? null;
  const term1Paid = yearId ? await term1PaidLearnerIds(svc, yearId) : null;

  const targetProfiles = reminderTargets(all, bookedIds, notifiedProfiles, term1Paid);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/booking/reminders.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Run the whole booking + fees suite**

Run: `npx vitest run lib/booking lib/fees lib/settings`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/booking/reminders.ts lib/booking/reminders.test.ts
git commit -m "fix(booking): remind only learners who can actually book, on a real service day

Two defects under the working-day window. The run hardcoded
bookableDates()[0] as 'tomorrow', so on a Friday whose Saturday is marked
off it nagged learners to book a non-service day; it now uses the same
walk. And it targeted every bus_required learner with a route -- 809 of
whom are blocked on an unpaid Term 1 -- so targeting now intersects with
the Term-1-paid set, falling open when there is no current transport year
to mirror the RPC.

Extracts reminderTargets() as a pure, tested filter chain.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Admin booking summary defaults to the next working day

**Files:**
- Modify: `app/api/admin/bookings/summary/route.ts:5,25-28`

**Interfaces:**
- Consumes: `bookableDates`, `addDays`, `istToday` (Task 3); `loadExceptions` (existing); `loadSchedulingConfig`, `toWindowOpts` (Task 5).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Update the imports**

Replace line 5 of `app/api/admin/bookings/summary/route.ts` with these three lines:

```ts
import { addDays, bookableDates, istToday } from '@/lib/booking/window';
import { loadExceptions } from '@/lib/booking/calendar';
import { loadSchedulingConfig, toWindowOpts } from '@/lib/settings/scheduling';
```

- [ ] **Step 2: Reorder `svc` above the date default, then compute the next working day**

`const svc = createServiceRoleClient();` currently sits on line 28, *below* the date default on
line 26 — but the new default needs `svc` to read the service calendar. Replace lines 25-28
(`const qp = …` through `const svc = …`, inclusive, including the blank line between them) with:

```ts
    const qp = new URL(request.url).searchParams.get('date') ?? '';
    const svc = createServiceRoleClient();

    // Default to the next WORKING day, not blind tomorrow — otherwise the admin
    // summary reports on a Sunday or an admin-declared holiday, for which no
    // learner could have booked. routeId null = ALL-ROUTES exceptions only, which
    // is right for a fleet-wide summary. Falls back to tomorrow if the 21-day walk
    // finds no service day at all, so the response always carries a date.
    let date = qp;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const today = istToday();
      const [exceptions, cfg] = await Promise.all([
        loadExceptions(svc, null, addDays(today, 1), addDays(today, 21)),
        loadSchedulingConfig(svc),
      ]);
      date =
        bookableDates(new Date(), {
          ...toWindowOpts(cfg),
          daysAhead: 1,
          offDates: new Set(exceptions.keys()),
        })[0] ?? addDays(today, 1);
    }
```

Note the `const date` → `let date` change, and that `svc` now precedes its first use.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/api/admin/bookings/summary" || echo "no errors in changed path"`
Expected: `no errors in changed path`.

- [ ] **Step 4: Verify the route still builds**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/bookings/summary/route.ts
git commit -m "fix(booking): admin summary defaults to the next working day

Blind 'tomorrow' reported on Sundays and admin-declared holidays, for
which no learner could have booked. Falls back to tomorrow only if the
21-day walk finds no service day at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Learner and admin copy

**Files:**
- Modify: `lib/student/use-transport-access.ts:21-29`
- Modify: `app/student/fees/page.tsx:16-23,107-135`
- Modify: `app/student/bookings/page.tsx:11,13-20,81-86,144-154`
- Modify: `app/(admin)/settings/page.tsx:165-180,195`

**Interfaces:**
- Consumes: `term1_paid` / `term1_status` / `term1_due_date` / `term1_balance` (Task 2); `nextBookableDate` (Task 6).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Extend the shared access type**

In `lib/student/use-transport-access.ts`, add the four fields to `TransportAccess`:

```ts
export interface TransportAccess {
  allowed: boolean;
  reason: string;
  transport_year_id?: string | null;
  transport_year_name?: string | null;
  overdue_count: number;
  total_owed: number;
  terms: TransportTerm[];
  /** True when the learner's FIRST term is fully paid — the precondition for portal access. */
  term1_paid: boolean;
  /** The Term-1 money-row status, or null when Term 1 was never billed. */
  term1_status: string | null;
  term1_due_date: string | null;
  term1_balance: number;
}
```

- [ ] **Step 2: Explain the two new reasons on the fees page**

In `app/student/fees/page.tsx`, add the same four fields to the local `Access` interface
(lines 16-23):

```ts
interface Access {
  allowed: boolean;
  reason: string;
  transport_year_name?: string | null;
  overdue_count: number;
  total_owed: number;
  terms: Term[];
  term1_paid: boolean;
  term1_status: string | null;
  term1_due_date: string | null;
  term1_balance: number;
}
```

Replace the `!data.allowed` branch of the status banner (lines 108-120) with:

```ts
      {!data.allowed ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">Portal access restricted</p>
              {data.reason === 'term1_unpaid' ? (
                <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">
                  Your <strong>first term</strong> transport fee of <strong>{inr(data.term1_balance)}</strong>
                  {data.term1_due_date ? <> (due {fmtDate(data.term1_due_date)})</> : null} is not fully paid.
                  Clear it at the transport office to unlock bus booking and the rest of the portal.
                </p>
              ) : data.reason === 'term1_not_billed' ? (
                // Distinct from term1_unpaid on purpose: paying cannot fix this,
                // so the learner must be told to contact the office instead.
                <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">
                  Your transport fee for this year has not been generated yet, so bus booking is
                  locked. Please contact the transport office — there is nothing to pay until they
                  raise your bill.
                </p>
              ) : (
                <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">
                  You have <strong>{data.overdue_count}</strong> overdue transport term{data.overdue_count === 1 ? '' : 's'} totalling{' '}
                  <strong>{inr(data.total_owed)}</strong>. Please clear the overdue amount at the transport office to restore access to the rest of the portal.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : data.reason === 'current' ? (
```

- [ ] **Step 3: Replace the stale booking-page hints**

In `app/student/bookings/page.tsx`, add `nextBookableDate` to the `MonthResp` interface:

```ts
interface MonthResp {
  routeLabel: string | null;
  stopLabel: string | null;
  assigned: boolean;
  month: string;
  cells: DayCell[];
  maxBookableDate?: string;
  nextBookableDate?: string | null;
}
```

Replace the three `<Hint>` elements (lines 145-153) with:

```ts
            <Hint icon={<CalendarRange className="h-4 w-4 text-blue-500" />}>
              {data?.nextBookableDate ? (
                <>Booking is open for <span className="font-medium text-foreground">{formatLong(data.nextBookableDate)}</span> — the next travel day.</>
              ) : (
                <>You can book <span className="font-medium text-foreground">one working day at a time</span> — each day opens on the previous working day.</>
              )}
            </Hint>
            <Hint icon={<Clock className="h-4 w-4 text-blue-500" />}>
              Booking closes at <span className="font-medium text-foreground">8 PM the day before</span> travel.
            </Hint>
            <Hint icon={<CalendarOff className="h-4 w-4 text-slate-400" />}>
              <span className="font-medium text-foreground">Sundays and declared holidays</span> have no bus service — the next open day skips over them.
            </Hint>
```

Then, immediately after the `<header>` block (after line 121), add the no-open-day banner:

```tsx
      {data && data.nextBookableDate === null && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <CalendarOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            No travel day is open for booking right now. This happens over a long holiday block —
            the next working day will open automatically.
          </p>
        </div>
      )}
```

The `maxMonth` fallback on line 84 calls `bookableDates()` with no arguments, which still compiles
under the new signature and degrades to "no off days known". The server's `maxBookableDate` wins
whenever it is present, so leave it as is.

- [ ] **Step 4: Relabel the admin setting**

In `app/(admin)/settings/page.tsx`, replace the label, `max`, and helper text of the
`bookingDaysAhead` field (lines 165-180):

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Booking window (working days ahead)
                </label>
                <input
                  type="number"
                  value={schedulingSettings.bookingDaysAhead}
                  onChange={(e) => setSchedulingSettings({ ...schedulingSettings, bookingDaysAhead: parseInt(e.target.value) })}
                  min="1"
                  max="10"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-600 mt-1">
                  How many <strong>working</strong> days ahead learners can book. Sundays and dates
                  marked as holidays in the service calendar are skipped over, not counted. Set to 1
                  so each travel day opens on the previous working day.
                </p>
              </div>
```

Replace the summary bullet on line 195 with:

```tsx
                    <li>• Booking opens for the next {schedulingSettings.bookingDaysAhead} working day(s); Sundays and service-calendar holidays are skipped</li>
```

- [ ] **Step 5: Typecheck the changed pages**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/student/(fees|bookings)/page|app/\(admin\)/settings/page|lib/student/use-transport-access" || echo "no errors in changed paths"`
Expected: `no errors in changed paths`.

- [ ] **Step 6: Build**

Run: `npm run build 2>&1 | tail -25`
Expected: build succeeds.

- [ ] **Step 7: Run the full unit suite**

Run: `npx vitest run lib/booking lib/fees lib/settings`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/student/use-transport-access.ts app/student/fees/page.tsx app/student/bookings/page.tsx "app/(admin)/settings/page.tsx"
git commit -m "feat(student): explain the Term-1 gate and the working-day window

term1_not_billed gets its own message: paying cannot fix it, so the
learner is told to contact the office rather than shown an amount.

Replaces the booking hints, which have claimed 'this week's days, up to
Saturday -- next week opens on Saturday' since the rolling horizon
superseded that rule on 2026-07-20, and adds a banner for the case where
a long holiday block leaves no open day.

Relabels the admin field to working days ahead (max 10).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

Run after Task 9. These are checks, not code changes.

- [ ] **Full unit suite**

Run: `npx vitest run lib/booking lib/fees lib/settings`
Expected: all green.

- [ ] **Production build**

Run: `npm run build`
Expected: succeeds. Note `next.config` sets `ignoreBuildErrors: true`, so the build passing does
not prove typecheck cleanliness — the path-scoped `tsc` greps in each task are what cover that.

- [ ] **RPC verdict spot-check on the live DB**

Re-run the Task 2 Step 5 query. Expected: identical bucket counts.

- [ ] **Reminder dry run**

With the dev server running and `CRON_SECRET` set locally:

Run: `curl -s -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:3000/api/cron/booking-reminders?dryRun=1"`
Expected: JSON where `data.date` is the next working day (never a Sunday, never a date present in
`tms_service_calendar`) and `data.candidates` is far below the ~1,042 it would have been — it
should be bounded by the 313 Term-1-paid learners minus those who already booked.

- [ ] **Hand off the authenticated browser smoke test to the user**

The agent's Chrome is unauthenticated, so these must be run by the user in their own browser:

1. Sign in as a **Term-1-paid** learner → `/student/bookings` shows **exactly one** bookable day,
   and it is the next working day. Booking it succeeds; cancelling it succeeds.
2. Sign in as a **Term-1-unpaid** learner → every `/student/*` page redirects to `/student/fees`,
   which shows the "first term transport fee … is not fully paid" message.
3. As an admin, mark the upcoming Saturday as a holiday in the service calendar, then reload the
   learner booking page on the Friday → the open day should be **Monday**, not Saturday.
