# JKKN ID Card Boarding Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let boarding staff mark attendance by scanning a learner's printed JKKN ID card, and show booking state and pending fees on the same result panel.

**Architecture:** A new pure classifier decides what a scanned string is and whether the source is allowed to send it. The existing scan endpoint gains one resolution branch in front of every gate it already has, so permission, route assignment, the time window, the booking and walk-up flow, and the atomic write are all untouched. Fee status comes from splitting the live access function into a learner-keyed core so learners without a login account are covered.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres, vitest, html5-qrcode.

**Spec:** `docs/superpowers/specs/2026-09-11-jkkn-id-card-boarding-scan-design.md`

## Global Constraints

- Branch: `feat/boarding-jkkn-id-scan`, cut from `main`. Never branch off `feat/tms-assistant`.
- Test command is `npx vitest run <path>`. There is no lint step; `npm run lint` is broken in this repo and must not be used as a gate.
- `tsc` is red on `main` with roughly 540 pre-existing errors and is NOT a gate. Verify with vitest plus a targeted `npx tsc --noEmit` reading of only the files you touched, ignoring errors in files you did not.
- Test files live under `lib/` so vitest resolves the `@/` alias. Do not put them in a top-level `tests/` directory.
- Migrations go in `supabase/migrations/` named `YYYYMMDDHHMMSS_snake_case.sql`.
- The Supabase MCP tools apply migrations against the REAL production database. Every new or replaced function must be EXECUTED once after applying.
- Never render an unmeasured number. A failed read surfaces as null and the UI says the value is unavailable; it never falls back to 0.
- All `.in()` filters must be chunked to 150 ids or fewer, and the error must be checked. A large filter returns HTTP 400 and the failure is silent.

---

### Task 1: The pure scan classifier

**Files:**
- Create: `lib/boarding/scan-resolve.ts`
- Test: `lib/boarding/scan-resolve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `classifyScan(raw: string, source: ScanSource): ScanDecision`, plus the exported types `ScannedShape`, `ScanSource`, `ScanRefusal`, `ScanDecision`. Task 5 imports all of these.

Background the implementer needs: a boarding pass token is `<uuid>.<32 hex chars>` and is signed. A JKKN ID is six digits, a dash, then one digit, for example `348295-7`, and is printed publicly on a plastic card, so it is only trusted when it came from the camera. A pass code is six digits typed by hand. Barcode wedges and camera decoders both append a newline, and people type a JKKN ID without the dash, so both must normalise rather than fail.

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/scan-resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyScan } from './scan-resolve';

const PASS = '11111111-2222-3333-4444-555555555555.abcdef0123456789abcdef0123456789';

describe('classifyScan', () => {
  it('recognises a signed boarding pass from either source', () => {
    expect(classifyScan(PASS, 'camera')).toEqual({ shape: 'pass', code: PASS, refusal: null });
    expect(classifyScan(PASS, 'typed')).toEqual({ shape: 'pass', code: PASS, refusal: null });
  });

  it('accepts a JKKN ID from the camera', () => {
    expect(classifyScan('348295-7', 'camera')).toEqual({
      shape: 'jkkn_id', code: '348295-7', refusal: null,
    });
  });

  it('refuses a JKKN ID that was typed, and says why', () => {
    expect(classifyScan('348295-7', 'typed')).toEqual({
      shape: 'jkkn_id', code: '348295-7', refusal: 'typed_jkkn_id',
    });
  });

  it('strips the newline a barcode wedge appends', () => {
    expect(classifyScan('348295-7\r\n', 'camera').code).toBe('348295-7');
  });

  it('inserts the missing dash so seven bare digits still classify', () => {
    // It is still refused for being typed, but it must be refused for the
    // RIGHT reason: "not recognised" would send staff hunting a bad card.
    expect(classifyScan('3482957', 'typed')).toEqual({
      shape: 'jkkn_id', code: '348295-7', refusal: 'typed_jkkn_id',
    });
  });

  it('recognises a six-digit pass code', () => {
    expect(classifyScan('429173', 'typed')).toEqual({
      shape: 'pass_code', code: '429173', refusal: null,
    });
  });

  it('tolerates a pass code typed with a space', () => {
    expect(classifyScan('429 173', 'typed').code).toBe('429173');
  });

  it('refuses anything else', () => {
    expect(classifyScan('hello', 'camera')).toEqual({
      shape: 'unknown', code: 'hello', refusal: 'unrecognised',
    });
    expect(classifyScan('', 'camera').refusal).toBe('unrecognised');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/boarding/scan-resolve.test.ts`
Expected: FAIL, cannot resolve `./scan-resolve`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/scan-resolve.ts`:

```ts
/**
 * scan-resolve — decides WHAT a boarding scan string is, and whether the
 * source it arrived from is allowed to send it. Pure: no database, no React.
 *
 * The rules for normalising a JKKN ID are DELIBERATELY COPIED from MyJKKN's
 * lib/identity/scan-normalize.ts rather than imported. The two apps are
 * separate deployments, and a change over there must never silently alter who
 * a bus door refuses. MyJKKN's own mess-door resolver keeps a local copy for
 * exactly this reason.
 *
 * This module never decides authority. The endpoint keeps every gate it has:
 * the tms.attendance.scan permission, the route-assignment check, the scan
 * window, and the booking rule.
 */

export type ScannedShape = 'pass' | 'jkkn_id' | 'pass_code' | 'unknown';

/** Where the string came from. A camera read implies physical possession. */
export type ScanSource = 'camera' | 'typed';

export type ScanRefusal = 'typed_jkkn_id' | 'unrecognised';

export interface ScanDecision {
  shape: ScannedShape;
  /** The cleaned value the server should look up. */
  code: string;
  /** When set, the scan is refused before any database read. */
  refusal: ScanRefusal | null;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PASS_RE = new RegExp(`^${UUID}\\.[0-9a-f]{32}$`, 'i');
const JKKN_ID_RE = /^[0-9]{6}-[0-9]$/;

export function classifyScan(raw: string, source: ScanSource): ScanDecision {
  const code = (raw ?? '').replace(/[\r\n]/g, '').trim();

  if (PASS_RE.test(code)) return { shape: 'pass', code, refusal: null };

  const compact = code.replace(/[\s-]/g, '');

  // Seven bare digits is a JKKN ID with the dash dropped. Classify it as one
  // so a typed card number is refused as "typed", not as "unrecognised".
  let jkknId: string | null = null;
  if (/^[0-9]{7}$/.test(compact)) jkknId = `${compact.slice(0, 6)}-${compact.slice(6)}`;
  else if (JKKN_ID_RE.test(code)) jkknId = code;

  if (jkknId !== null) {
    return {
      shape: 'jkkn_id',
      code: jkknId,
      // A JKKN ID is printed publicly and downloadable as a PNG from MyJKKN,
      // so it is only trusted as evidence of physical possession.
      refusal: source === 'typed' ? 'typed_jkkn_id' : null,
    };
  }

  if (/^[0-9]{6}$/.test(compact)) return { shape: 'pass_code', code: compact, refusal: null };

  return { shape: 'unknown', code, refusal: 'unrecognised' };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/boarding/scan-resolve.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/scan-resolve.ts lib/boarding/scan-resolve.test.ts
git commit -m "feat(boarding): classify a scan, and refuse a typed card number"
```

---

### Task 2: Allow a third attendance method

**Files:**
- Create: `supabase/migrations/20260911100000_attendance_method_id_card.sql`
- Modify: `lib/booking/analytics-types.ts:25`, `lib/booking/analytics-types.ts:61`, `lib/booking/analytics-types.ts:219`
- Modify: `lib/booking/analytics-attendance.ts:376`
- Modify: `app/(admin)/bookings/analytics/filter-bar.tsx:84`, `app/(admin)/bookings/analytics/filter-bar.tsx:102`
- Modify: `app/api/admin/bookings/analytics/route.ts:185`
- Modify: `app/(admin)/bookings/analytics/attendance-tab.tsx:291`
- Test: `lib/booking/analytics-attendance.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the string literal `'id_card'` is valid for `tms_attendance.method` and for the `AttendanceRow['method']` union. Task 5 writes it.

Why this task exists: `tms_attendance_method_check` currently permits only `qr_scan` and `manual`. Without widening it, every card scan fails the insert. Reusing `qr_scan` was rejected because card marks would then be indistinguishable from signed-pass marks in every report. `tms_mark_attendance` passes `p_method` straight through and hardcodes no list, so the table constraint is the only database change needed.

- [ ] **Step 1: Write the failing test**

Add to `lib/booking/analytics-attendance.test.ts`, inside the existing top-level `describe('aggregateAttendance', ...)`. The file already defines the helpers `at(learner, date, over)` and `agg(bookings, attendance, over)`; use them rather than calling `aggregateAttendance` directly:

```ts
  it('counts id_card marks separately from qr_scan and manual', () => {
    const cardOut = agg(
      [bk('L1', '2026-07-09'), bk('L2', '2026-07-09'), bk('L3', '2026-07-09')],
      [
        at('L1', '2026-07-09', { method: 'id_card' }),
        at('L2', '2026-07-09', { method: 'id_card' }),
        at('L3', '2026-07-09', { method: 'qr_scan' }),
      ],
    );
    expect(cardOut.byMethod).toEqual({ qr_scan: 1, manual: 0, id_card: 2 });
  });
```

Two existing assertions in this same file will now fail because they spell out the whole `byMethod` object and it has gained a key. Both must gain `id_card: 0`:

- `lib/booking/analytics-attendance.test.ts:136` — currently `expect(out.byMethod).toEqual({ qr_scan: 2, manual: 0 });`
- `lib/booking/analytics-attendance.test.ts:333` — currently `expect(filtered.byMethod).toEqual({ qr_scan: 1, manual: 0 });`

Those two are the complete list; a repository-wide search for `byMethod` in tests returns only them.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/booking/analytics-attendance.test.ts`
Expected: FAIL. A TypeScript error that `'id_card'` is not assignable to the method union, or an assertion failure because `byMethod` has no `id_card` key.

- [ ] **Step 3: Apply the migration**

Create `supabase/migrations/20260911100000_attendance_method_id_card.sql`:

```sql
-- Boarding staff can now mark attendance by scanning a learner's printed JKKN
-- ID card. That mark must stay distinguishable from a signed boarding-pass
-- scan: the card carries a PUBLIC number (jkkn_identities.jkkn_id, printed on
-- plastic and downloadable as a PNG from MyJKKN), whereas the pass is an HMAC
-- nobody can forge. Folding both into 'qr_scan' would erase that difference
-- from every report and make later abuse unauditable.
--
-- Existing rows are untouched. tms_mark_attendance passes p_method straight
-- through and hardcodes no list, so this constraint is the only change needed.

alter table public.tms_attendance
  drop constraint if exists tms_attendance_method_check;

alter table public.tms_attendance
  add constraint tms_attendance_method_check
  check (method = any (array['qr_scan'::text, 'manual'::text, 'id_card'::text]));
```

Apply it with the Supabase `apply_migration` tool, using the file name without the `.sql` extension as the migration name. Then confirm it took:

```sql
select pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
where c.relname = 'tms_attendance' and con.conname = 'tms_attendance_method_check';
```

Expected: the definition now lists all three values.

- [ ] **Step 4: Widen the TypeScript unions**

In `lib/booking/analytics-types.ts`, change the two method unions and the count shape:

```ts
  // AttendanceRow
  method: 'qr_scan' | 'manual' | 'id_card';

  // AnalyticsFilters
  method: 'qr_scan' | 'manual' | 'id_card' | null;

  // the computed totals
  byMethod: { qr_scan: number; manual: number; id_card: number };
```

In `lib/booking/analytics-attendance.ts`, add the third counter next to the two existing ones:

```ts
      qr_scan: count(attendanceForComposition, (a) => a.method, 'qr_scan'),
      manual: count(attendanceForComposition, (a) => a.method, 'manual'),
      id_card: count(attendanceForComposition, (a) => a.method, 'id_card'),
```

In `app/(admin)/bookings/analytics/filter-bar.tsx`, widen the accepted values and add the option:

```ts
      method: oneOf(sp.get('method'), ['qr_scan', 'manual', 'id_card'] as const),
```

```ts
  { id: 'qr_scan', label: 'QR scan' },
  { id: 'id_card', label: 'ID card' },
```

In `app/api/admin/bookings/analytics/route.ts`, widen the same list:

```ts
      method: oneOf(params.get('method'), ['qr_scan', 'manual', 'id_card'] as const),
```

In `app/(admin)/bookings/analytics/attendance-tab.tsx`, the cell currently reads `QR / manual`. Replace it so the third figure is visible rather than silently dropped:

```tsx
              <Cell label="QR / card / manual" value={`${num(data.byMethod.qr_scan)} / ${num(data.byMethod.id_card)} / ${num(data.byMethod.manual)}`} Icon={QrCode} color="var(--viz-neutral)" />
```

- [ ] **Step 5: Run the full booking test suite to verify nothing regressed**

Run: `npx vitest run lib/booking`
Expected: PASS, including the new case. Any other test asserting the exact shape of `byMethod` will now fail because it lacks `id_card`; update those assertions to include `id_card: 0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260911100000_attendance_method_id_card.sql lib/booking app/\(admin\)/bookings/analytics app/api/admin/bookings/analytics
git commit -m "feat(attendance): record an ID-card mark as its own method"
```

---

### Task 3: Split the transport access function

**Files:**
- Create: `supabase/migrations/20260911110000_transport_access_by_learner.sql`
- Create: `docs/superpowers/reviews/2026-09-11-transport-access-split-parity.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `tms_transport_access_for_learner(p_learner_id uuid) returns jsonb`, returning exactly the same JSON shape as `tms_student_transport_access`, with the keys `allowed`, `reason`, `transport_year_id`, `transport_year_name`, `overdue_count`, `total_owed`, `terms`, `term1_paid`, `term1_status`, `term1_due_date`, `term1_balance`. Task 4 calls it.

Why this task exists: the scan panel must show fees for any scanned learner. The existing function is keyed on a login account, and 633 of the 1,908 learners allocated to a bus have no linked account, so a third of the bus would show a blank fee panel that reads as nothing owed. Duplicating the money logic was rejected because it has been patched several times and two copies would drift.

**Read this before writing a line of SQL.** A stale copy of this exact function has previously come close to deleting a colleague's email-fallback fix. Do not copy the body from any file in this repository.

- [ ] **Step 1: Dump the live definition**

Run this through the Supabase `execute_sql` tool and keep the output as the ONLY source for the body you are about to split:

```sql
select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tms_student_transport_access';
```

The result is long. Read all of it before proceeding.

- [ ] **Step 2: Capture the before-state for the parity check**

Pick a sample spanning all three identity paths the function supports. Run:

```sql
-- Path 1: a learner reached by the direct profile link.
-- Path 2 or 3: a learner reached ONLY by the email fallback.
-- Plus a learner with no bus obligation at all.
with sample as (
  (select lp.profile_id from learners_profiles lp
     where lp.profile_id is not null and lp.transport_route_id is not null
     order by lp.id limit 10)
  union
  (select p.id from profiles p
     join learners_profiles lp on lower(lp.college_email) = lower(p.email)
     where lp.profile_id is null and lp.transport_route_id is not null
     order by p.id limit 10)
)
select profile_id, tms_student_transport_access(profile_id) as before
from sample s(profile_id)
order by profile_id;
```

Save the output verbatim into `docs/superpowers/reviews/2026-09-11-transport-access-split-parity.md` under a heading `## Before`. If the email-fallback half of the sample returns zero rows, widen it to `student_email` as well and say so in the file; the parity check is worthless if it never exercises that path.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911110000_transport_access_by_learner.sql` with this structure. The body marked below is transplanted from the Step 1 dump, unmodified apart from the noted substitutions.

```sql
-- Split tms_student_transport_access into a learner-keyed core plus a thin
-- account-keyed wrapper.
--
-- WHY. The boarding scan panel must show fees for any scanned learner, and it
-- identifies people by learners_profiles.id. The existing function is keyed on
-- profiles.id, but 633 of the 1,908 learners allocated to a bus have a NULL
-- profile_id, so a third of the bus would show a blank fee panel -- which on a
-- money screen reads as "nothing owed".
--
-- This is a REFACTOR, not a policy change. The wrapper keeps its name,
-- argument, return shape, SECURITY DEFINER marking and search_path, so
-- proxy.ts, /api/student/transport-access and the portal gate are untouched.
-- A parity check across all three identity paths accompanies this migration.

create or replace function public.tms_transport_access_for_learner(p_learner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_bus_required boolean;
  -- Copy every other variable declared in the Step 1 dump EXCEPT v_learner_id
  -- and v_email, which belong to the identity resolution that stays in the
  -- wrapper below. Everything else, including v_allowed and v_reason, is used
  -- by the transplanted body and must be declared here.
begin
  select coalesce(bus_required, false) into v_bus_required
  from learners_profiles where id = p_learner_id;

  if p_learner_id is null or v_bus_required is null or v_bus_required = false then
    return jsonb_build_object('allowed', true, 'reason', 'no_transport_obligation',
      'terms', '[]'::jsonb, 'overdue_count', 0, 'total_owed', 0,
      'term1_paid', true, 'term1_status', null, 'term1_due_date', null, 'term1_balance', 0);
  end if;

  -- >>> TRANSPLANT VERBATIM FROM THE STEP 1 DUMP <<<
  -- Everything from `select id, name into v_year_id, v_year_name from
  -- tms_transport_year ...` through the final `return jsonb_build_object(...)`,
  -- with exactly one textual substitution: `v_learner_id` becomes
  -- `p_learner_id`. Change nothing else. Do not reformat, do not "improve" the
  -- comments, and do not drop the two comment blocks explaining why st.is_due
  -- is avoided and why the tied first line must all be settled -- both record
  -- bugs that were fixed the hard way.
end;
$function$;

create or replace function public.tms_student_transport_access(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_learner_id uuid;
  v_email text;
begin
  -- Path 1: direct profile link. profile_id is NOT unique in learners_profiles:
  -- a stub row can shadow the real one, so bias toward the row carrying the
  -- obligation rather than taking an unordered limit 1.
  select id into v_learner_id
  from learners_profiles where profile_id = p_profile_id
  order by coalesce(bus_required, false) desc, (transport_route_id is not null) desc, id
  limit 1;

  -- Paths 2 and 3: fall back to the caller's email, the way the billing view
  -- does. Only reached when the profile link is absent. profiles.email is NOT
  -- reliably lower-cased, so both sides are lowered.
  if v_learner_id is null then
    select lower(email) into v_email from profiles where id = p_profile_id;
    if v_email is not null and v_email <> '' then
      select id into v_learner_id
      from learners_profiles
      where lower(nullif(college_email, '')) = v_email
         or lower(nullif(student_email, '')) = v_email
      order by coalesce(bus_required, false) desc, (transport_route_id is not null) desc, id
      limit 1;
    end if;
  end if;

  return public.tms_transport_access_for_learner(v_learner_id);
end;
$function$;

-- CREATE OR REPLACE does not preserve grants on a NEW function, and a revoked
-- EXECUTE grant on a boarding function has already caused a silent multi-week
-- lockout once. Grant both explicitly.
grant execute on function public.tms_transport_access_for_learner(uuid) to authenticated, service_role;
grant execute on function public.tms_student_transport_access(uuid) to authenticated, service_role;
```

Note the behaviour of the null learner: `tms_transport_access_for_learner(null)` returns the no-obligation object, which is exactly what the original returned when no learner resolved. That equivalence is what the parity check proves.

- [ ] **Step 4: Apply the migration and execute both functions once**

Apply with the Supabase `apply_migration` tool. Then run, and confirm neither errors:

```sql
select public.tms_transport_access_for_learner(
  (select id from learners_profiles where transport_route_id is not null order by id limit 1)
);
select public.tms_student_transport_access(
  (select profile_id from learners_profiles where profile_id is not null and transport_route_id is not null order by id limit 1)
);
select public.tms_transport_access_for_learner(null);
```

A plan that stops at "the migration applied" is not finished. A previous attendance change parsed cleanly and still failed on its first real call.

- [ ] **Step 5: Confirm the grants survived**

```sql
select has_function_privilege('authenticated', 'public.tms_student_transport_access(uuid)', 'execute') as gate_ok,
       has_function_privilege('authenticated', 'public.tms_transport_access_for_learner(uuid)', 'execute') as core_ok;
```

Expected: both true. If either is false, the portal gate is broken right now; fix it before doing anything else.

- [ ] **Step 6: Run the parity check**

Re-run the Step 2 query exactly, and compare each row's JSON to the saved `## Before` block. Append the output to the review file under `## After`, then add a `## Verdict` line stating whether every sampled profile returned identical JSON.

Any difference at all fails this task. Revert the migration and re-read the Step 1 dump rather than adjusting the sample.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260911110000_transport_access_by_learner.sql docs/superpowers/reviews/2026-09-11-transport-access-split-parity.md
git commit -m "refactor(fees): key transport access on the learner, not the account"
```

---

### Task 4: Read a learner's fee status, fail-soft

**Files:**
- Create: `lib/boarding/fee-status.ts`

**Interfaces:**
- Consumes: `tms_transport_access_for_learner(p_learner_id uuid)` from Task 3.
- Produces: `loadLearnerFeeStatus(svc: SupabaseClient, learnerId: string): Promise<LearnerFeeStatus | null>` and the exported interface `LearnerFeeStatus`. Task 5 calls it; Task 6 renders it.

The contract this file exists to enforce: a failed read returns null, never a zeroed object. On a money panel a zero reads as "nothing owed", which would tell a staffer the opposite of the truth.

- [ ] **Step 1: Write the implementation**

Create `lib/boarding/fee-status.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

/** One visible fee line: an instalment where the bill has them, else the bill. */
export interface FeeTerm {
  termNo: number | null;
  amount: number | null;
  balance: number | null;
  dueDate: string | null;
  status: string | null;
  paid: boolean;
  overdue: boolean;
}

export interface LearnerFeeStatus {
  /** False when the learner is behind. Mirrors the portal gate's decision. */
  allowed: boolean;
  reason: string | null;
  overdueCount: number;
  totalOwed: number;
  terms: FeeTerm[];
}

/**
 * The scanned learner's transport fee position, straight from the same
 * function the portal gate uses (tms_transport_access_for_learner, the
 * learner-keyed core of tms_student_transport_access). Going through the
 * function rather than re-querying the bills is what keeps the scan panel and
 * the portal from ever disagreeing about who owes what.
 *
 * FAIL-SOFT, AND NULL RATHER THAN ZERO. A failed read returns null so the
 * caller can say "fee status unavailable". Returning a zeroed object would
 * render as "nothing owed" on a money panel, which is the one wrong answer
 * that looks exactly like a right one.
 */
export async function loadLearnerFeeStatus(
  svc: SupabaseClient,
  learnerId: string,
): Promise<LearnerFeeStatus | null> {
  const { data, error } = await svc.rpc('tms_transport_access_for_learner', {
    p_learner_id: learnerId,
  });
  if (error) {
    console.error('[boarding/fee-status] lookup failed for %s: %s %s', learnerId, error.code, error.message);
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const row = data as {
    allowed?: boolean;
    reason?: string | null;
    overdue_count?: number;
    total_owed?: number | string;
    terms?: unknown;
  };

  const rawTerms = Array.isArray(row.terms) ? row.terms : [];
  const terms: FeeTerm[] = rawTerms.map((t) => {
    const term = (t ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    return {
      termNo: num(term.term_no),
      amount: num(term.amount),
      balance: num(term.balance),
      dueDate: (term.due_date as string | null) ?? null,
      status: (term.status as string | null) ?? null,
      paid: term.paid === true,
      overdue: term.overdue === true,
    };
  });

  return {
    allowed: row.allowed === true,
    reason: row.reason ?? null,
    overdueCount: Number(row.overdue_count ?? 0),
    totalOwed: Number(row.total_owed ?? 0),
    terms,
  };
}
```

- [ ] **Step 2: Verify it compiles against the files you touched**

Run: `npx tsc --noEmit 2>&1 | grep "lib/boarding/fee-status"`
Expected: no output. Ignore errors reported for any other file; this repo has roughly 540 pre-existing ones.

- [ ] **Step 3: Execute it once against a real learner**

Using the Supabase `execute_sql` tool, confirm the shape the TypeScript expects is actually what comes back:

```sql
select public.tms_transport_access_for_learner(id) as payload
from learners_profiles
where transport_route_id is not null and profile_id is null
order by id limit 3;
```

Expected: three objects carrying `allowed`, `reason`, `overdue_count`, `total_owed` and a `terms` array. Learners with `profile_id is null` are chosen deliberately, since those 633 are the whole reason this task exists.

- [ ] **Step 4: Commit**

```bash
git add lib/boarding/fee-status.ts
git commit -m "feat(boarding): read a scanned learner's fee position, null on failure"
```

---

### Task 5: Accept a card in the scan endpoint

**Files:**
- Modify: `app/api/boarding/scan/route.ts`

**Interfaces:**
- Consumes: `classifyScan`, `ScanSource` from Task 1; `'id_card'` as a valid method from Task 2; `loadLearnerFeeStatus`, `LearnerFeeStatus` from Task 4.
- Produces: the widened POST response documented at the end of this task. Task 6 renders it.

Read the existing file end to end first. Every gate in it stays, in the same order: the `tms.attendance.scan` permission check, the onward-only direction guard, the scan window, the learner lookup, the route-assignment check, the booking and walk-up flow, and the `tms_mark_attendance` call with `p_allow_override: true`. This task adds a resolution branch in front of them and enriches the response after them. It changes no gate.

- [ ] **Step 1: Widen the request body and thread the source through**

At the top of `scan`, after the existing body parse, read the source:

```ts
    const body = (await request.json().catch(() => ({}))) as {
      token?: string; direction?: string; walkUp?: boolean; source?: string;
    };
    // Optional, defaulting to 'typed'. That default can only NARROW what is
    // accepted, so an older client that has not been updated degrades to
    // today's behaviour rather than silently starting to accept cards.
    const source: ScanSource = body.source === 'camera' ? 'camera' : 'typed';
```

Import at the top of the file:

```ts
import { classifyScan, type ScanSource } from '@/lib/boarding/scan-resolve';
import { loadLearnerFeeStatus } from '@/lib/boarding/fee-status';
```

- [ ] **Step 2: Add the JKKN ID branch to resolveLearnerId**

Change the signature so it reports how the match was made, and add the card branch. Replace the existing `resolveLearnerId` with:

```ts
type MatchedBy = 'pass' | 'jkkn_id' | 'pass_code';
type Resolved = { learnerId: string; matchedBy: MatchedBy } | { error: string; status: number };

/**
 * Resolve the learner behind a scan input. Three shapes are accepted:
 *  - the signed QR / long token, whose identity is embedded and verified;
 *  - a JKKN ID from a printed card, resolved through the identity register,
 *    accepted ONLY from the camera because the number is public;
 *  - a typed 6-digit daily code, reverse-looked-up among the learners this
 *    staff may scan, so the candidate set is already authority-scoped.
 */
async function resolveLearnerId(
  raw: string,
  source: ScanSource,
  auth: AuthContext,
  svc: ReturnType<typeof createServiceRoleClient>
): Promise<Resolved> {
  // verifyPass stays the authority on the signed token: it checks the HMAC,
  // which the shape classifier deliberately does not.
  const verified = verifyPass(raw);
  if (verified) return { learnerId: verified, matchedBy: 'pass' };

  const decision = classifyScan(raw, source);

  if (decision.shape === 'jkkn_id') {
    if (decision.refusal === 'typed_jkkn_id') {
      return { error: 'Point the camera at the card to use a JKKN ID.', status: 400 };
    }
    const { data, error } = await svc
      .from('jkkn_identities')
      .select('learner_profile_id, person_kind, retired_at')
      .eq('jkkn_id', decision.code)
      .maybeSingle();
    if (error) {
      console.error('boarding scan jkkn id lookup error:', error);
      return { error: 'Could not read the identity register', status: 500 };
    }
    const row = data as { learner_profile_id: string | null; person_kind: string | null; retired_at: string | null } | null;
    if (!row) return { error: 'Card not recognised.', status: 404 };
    // Retired numbers are kept forever so they are never reissued, but a
    // retired card must never mark anyone present.
    if (row.retired_at) return { error: 'This card has been retired. Issue a new one.', status: 409 };
    if (!row.learner_profile_id) {
      return { error: 'That is a staff card. Attendance is for learners.', status: 409 };
    }
    return { learnerId: row.learner_profile_id, matchedBy: 'jkkn_id' };
  }

  if (decision.shape === 'pass_code') {
    let query = svc.from('learners_profiles').select('id').not('transport_route_id', 'is', null);
    if (!auth.isSuperAdmin) {
      const routeIds = await getAssignedRouteIdsForUser(auth);
      if (routeIds.length === 0) {
        return { error: 'You are not assigned to any route', status: 403 };
      }
      query = query.in('transport_route_id', routeIds);
    }
    const { data, error } = await query;
    if (error) {
      console.error('boarding scan code lookup error:', error);
      return { error: 'Could not resolve pass code', status: 500 };
    }
    const candidateIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    const matches = matchPassCode(decision.code, candidateIds, istToday());
    if (matches.length === 1) return { learnerId: matches[0], matchedBy: 'pass_code' };
    if (matches.length > 1) {
      return { error: 'Code matches multiple learners — please scan the QR code', status: 409 };
    }
    return { error: 'Code not recognised', status: 400 };
  }

  return { error: 'Invalid or unrecognised pass', status: 400 };
}
```

Update the single call site to pass the source and keep the match:

```ts
    const resolved = await resolveLearnerId(String(body.token ?? ''), source, auth, svc);
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }
    const learnerId = resolved.learnerId;
    const matchedBy = resolved.matchedBy;
```

Note the route-scoping asymmetry, which is intentional. The six-digit branch searches only the staffer's routes because the code carries no identity and could otherwise collide across the whole institution. The card branch looks up globally because the number is unique and unambiguous; a learner on someone else's route is then refused a few lines later by the existing route-assignment check, which produces a far clearer message than "not recognised".

- [ ] **Step 3: Widen the learner select to carry the panel fields**

Change the existing learner query and its interface so the response can name the route, the stop and the photo:

```ts
interface LearnerLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  student_photo_url: string | null;
  transport_route_id: string | null;
  transport_stop_id: string | null;
}
```

```ts
    const { data } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, student_photo_url, transport_route_id, transport_stop_id')
      .eq('id', learnerId)
      .maybeSingle();
```

- [ ] **Step 4: Record the method, and load the labels and fees**

Change the `p_method` argument on the `tms_mark_attendance` call so a card mark is distinguishable:

```ts
      p_method: matchedBy === 'jkkn_id' ? 'id_card' : 'qr_scan',
```

After the write succeeds and before `logActivity`, gather what the panel shows. All three reads are display-only and must not fail the scan:

```ts
    // Display-only. The mark is already written; a failed label read must not
    // turn a successful scan into an error the staffer will retry.
    const [routeRes, stopRes, fees] = await Promise.all([
      svc.from('tms_route').select('route_number, route_name')
        .eq('id', learner.transport_route_id).maybeSingle(),
      learner.transport_stop_id
        ? svc.from('tms_route_stop').select('stop_name').eq('id', learner.transport_stop_id).maybeSingle()
        : Promise.resolve({ data: null }),
      loadLearnerFeeStatus(svc, learner.id),
    ]);
    const route = routeRes.data as { route_number: string | null; route_name: string | null } | null;
    const routeLabel = route
      ? [route.route_number, route.route_name].filter(Boolean).join(' — ') || null
      : null;
    const stopLabel = (stopRes.data as { stop_name?: string } | null)?.stop_name ?? null;
```

Both `route_number` and `route_name` exist on `tms_route`, confirmed 2026-09-11, so the query above needs no adjustment.

Add the match to the activity metadata so card scans are auditable later:

```ts
        matchedBy,
```

- [ ] **Step 5: Widen the success response**

Replace the final `NextResponse.json` in the success path with:

```ts
    return NextResponse.json({
      ok: true,
      matchedBy,
      learner: {
        name,
        rollNumber: learner.roll_number,
        photoUrl: learner.student_photo_url,
        routeLabel,
        stopLabel,
      },
      direction,
      booked,
      walkUp: isWalkUp,
      overCapacity: overCapacity || undefined,
      alreadyPresent: alreadyPresent || undefined,
      // null, never a zeroed object: on a money panel a 0 reads as
      // "nothing owed", which is the one wrong answer that looks right.
      fees,
    });
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "app/api/boarding/scan"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/api/boarding/scan/route.ts
git commit -m "feat(boarding): mark attendance from a scanned JKKN ID card"
```

---

### Task 6: The scan result panel

**Files:**
- Modify: `components/boarding/scan-dialog.tsx`

**Interfaces:**
- Consumes: the widened POST response from Task 5, and `classifyScan` from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Widen the client result type**

Replace the `ScanResult` type with:

```ts
type FeeTerm = {
  termNo: number | null;
  amount: number | null;
  balance: number | null;
  dueDate: string | null;
  status: string | null;
  paid: boolean;
  overdue: boolean;
};

type ScanResult = {
  ok: boolean;
  matchedBy?: 'pass' | 'jkkn_id' | 'pass_code';
  learner?: {
    name: string;
    rollNumber: string | null;
    photoUrl?: string | null;
    routeLabel?: string | null;
    stopLabel?: string | null;
  };
  direction?: string;
  booked?: boolean;
  walkUp?: boolean;
  reason?: 'not_booked' | 'window_closed';
  seatsRemaining?: number;
  overCapacity?: boolean;
  alreadyMarked?: { by: string; at: string | null };
  overrode?: { from: 'present' | 'absent'; by: string; at: string | null };
  /** null means the fee read failed. Render that as unavailable, never as 0. */
  fees?: {
    allowed: boolean;
    reason: string | null;
    overdueCount: number;
    totalOwed: number;
    terms: FeeTerm[];
  } | null;
  error?: string;
};
```

- [ ] **Step 2: Send the source, and refuse a typed card number early**

Change `submit` so it takes and forwards the source, and short-circuits a typed JKKN ID without a round trip:

```ts
  async function submit(token: string, source: ScanSource, walkUp = false) {
    if (!token) return;
    // Instant feedback beats a round trip. The SERVER refusal is still the
    // authority; this only spares the staffer the wait.
    const decision = classifyScan(token, source);
    if (decision.refusal === 'typed_jkkn_id') {
      setResult({ ok: false, error: 'Point the camera at the card to use a JKKN ID.' });
      return;
    }
```

Then include the source in the request body:

```ts
        body: JSON.stringify({ token, direction: 'onward', walkUp, source }),
```

Import at the top:

```ts
import { classifyScan, type ScanSource } from '@/lib/boarding/scan-resolve';
```

Update the three call sites:

```ts
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (decoded) => submit(decoded, 'camera'), () => {});
```

```tsx
            <Button onClick={() => submit(manual, 'typed')} disabled={!manual || !legOpen}>
```

```tsx
                <Button className="w-full" onClick={() => submit(lastTokenRef.current, lastSourceRef.current, true)}>
```

Add a ref alongside `lastTokenRef` so the walk-up retry resends the original source rather than downgrading a camera scan to typed, which would make the retry refuse a card it had just accepted:

```ts
  const lastSourceRef = useRef<ScanSource>('camera');
```

Set it in `submit` next to `lastTokenRef.current = token;`:

```ts
    lastSourceRef.current = source;
```

- [ ] **Step 3: Replace the success panel**

Replace the `result.ok` branch of the result box with:

```tsx
              <div className="space-y-2">
                <p className="font-medium text-green-700 dark:text-green-300">
                  {result.alreadyMarked ? '✓ Already marked present' : '✓ Marked present'}
                  {result.walkUp ? ' · walk-up' : ''}
                </p>

                <div className="flex items-start gap-3">
                  {result.learner?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote learner photo, next/image adds nothing here
                    <img
                      src={result.learner.photoUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-md border object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{result.learner?.name}</p>
                    {result.learner?.rollNumber && (
                      <p className="truncate text-xs text-muted-foreground">{result.learner.rollNumber}</p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {result.learner?.routeLabel ?? 'Route —'} · Stop: {result.learner?.stopLabel ?? '—'}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {result.matchedBy === 'jkkn_id'
                        ? 'JKKN ID card'
                        : result.matchedBy === 'pass_code'
                          ? 'Pass code'
                          : 'Boarding pass'}
                      {result.booked === false ? ' · not booked today' : ''}
                    </p>
                  </div>
                </div>

                {result.fees === null ? (
                  <p className="rounded-md border border-muted px-2 py-1 text-xs text-muted-foreground">
                    Fee status unavailable.
                  </p>
                ) : result.fees && result.fees.overdueCount > 0 ? (
                  <div className="rounded-md border border-red-400 bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
                    <p className="font-medium">
                      ⚠ Fees pending · ₹{result.fees.totalOwed.toLocaleString('en-IN')} overdue
                    </p>
                    <p className="mt-0.5">
                      {result.fees.terms
                        .filter((t) => t.overdue)
                        .map((t) => `Term ${t.termNo ?? '—'}`)
                        .join(', ')}
                    </p>
                  </div>
                ) : null}

                {/* A dozen in-charges can share this route. Naming who marked
                    first stops the second scanner wondering if the scan failed. */}
                {result.alreadyMarked && (
                  <p className="text-xs text-muted-foreground">
                    Marked by {result.alreadyMarked.by}
                    {result.alreadyMarked.at
                      ? ` at ${new Date(result.alreadyMarked.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                    . Nothing changed.
                  </p>
                )}
                {result.overrode && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    ⚠ Was marked {result.overrode.from} by {result.overrode.by} — corrected to present.
                  </p>
                )}
                {result.overCapacity && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">⚠ Bus over capacity — boarded as overflow.</p>
                )}
              </div>
```

The fee banner deliberately does NOT block the mark. That was decided in the spec: the bus has already stopped and the learner is already boarding, so refusing the mark loses the attendance record without preventing the ride.

- [ ] **Step 4: Update the manual-entry hint**

Change the manual box label so staff know the card is camera-only:

```tsx
          <p className="text-xs text-muted-foreground">
            Or enter the 6-digit code. A JKKN ID must be scanned with the camera.
          </p>
```

- [ ] **Step 5: Verify it compiles and the suite still passes**

Run: `npx tsc --noEmit 2>&1 | grep "components/boarding/scan-dialog"`
Expected: no output.

Run: `npx vitest run lib/boarding`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/boarding/scan-dialog.tsx
git commit -m "feat(boarding): show identity, booking and fees on a scan"
```

---

### Task 7: Full verification

**Files:**
- Create: `docs/superpowers/reviews/2026-09-11-jkkn-id-scan-verification.md`

**Interfaces:**
- Consumes: every earlier task.
- Produces: the evidence record. Nothing depends on it.

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS. Record the exact totals. If anything fails, fix it here rather than reporting the feature complete.

- [ ] **Step 2: Confirm the build is green**

Run: `npm run build`
Expected: a successful build. Note that `next build` does not gate on TypeScript errors in this repo, so a green build is necessary but not sufficient; the per-file `tsc` greps in Tasks 4, 5 and 6 carry that weight.

If the build dies with "could not find bin metadata file", the cause is a stale `bun.lock` rather than anything in this change. Run `bun install` and build again.

- [ ] **Step 3: Confirm the database state**

Through the Supabase `execute_sql` tool:

```sql
select pg_get_constraintdef(con.oid) as method_check
from pg_constraint con join pg_class c on c.oid = con.conrelid
where c.relname = 'tms_attendance' and con.conname = 'tms_attendance_method_check';

select has_function_privilege('authenticated', 'public.tms_student_transport_access(uuid)', 'execute') as gate_ok,
       has_function_privilege('authenticated', 'public.tms_transport_access_for_learner(uuid)', 'execute') as core_ok;
```

Expected: three methods listed, both grants true.

- [ ] **Step 4: Write the verification record**

Create `docs/superpowers/reviews/2026-09-11-jkkn-id-scan-verification.md` containing the vitest totals, the build result, the two SQL outputs above, and a link to the parity review from Task 3. State plainly what was NOT verified, which is the browser smoke test in Step 5.

- [ ] **Step 5: Hand the browser smoke test to the product owner**

This agent's Chrome session is not authenticated against the boarding portal, so these cannot be run here. Write them into the verification record as an explicit open item and ask the product owner to run them on a phone during a real morning window, which is 07:00 to 09:30 IST:

1. Scan a real printed JKKN ID card. The panel names the learner, shows the photo, the route and stop, and the credential badge reads "JKKN ID card".
2. Scan a card for a learner with pending fees. The red banner appears AND the learner is still marked present.
3. Scan a card for a learner with no booking today. The walk-up button appears and works.
4. Type a JKKN ID into the manual box. It is refused with the camera message.
5. Type a valid six-digit pass code. It still works exactly as before.
6. Scan the same card twice. The second scan says already marked and names the first marker.
7. Confirm the roster refreshes behind the dialog after each successful scan.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/reviews/2026-09-11-jkkn-id-scan-verification.md
git commit -m "docs(boarding): record verification for JKKN ID card scanning"
```

---

## Notes for whoever executes this

- Tasks 1, 2 and 3 are independent of each other and can run in parallel. Task 4 needs Task 3. Task 5 needs Tasks 1, 2 and 4. Task 6 needs Tasks 1 and 5. Task 7 needs everything.
- Task 3 is the only one that can break something users rely on today, because it replaces a function that gates portal access for every learner. Its parity check is not optional paperwork; it is the evidence that nobody got locked out.
- The 69 learners with no JKKN ID are not a bug to fix here. They keep the signed pass and the six-digit code, which is why neither path is being removed.
