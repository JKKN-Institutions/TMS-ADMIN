# Staff Transport Fee Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate one payable transport fee bill for each of 19 bus-required staff who hold no bus in-charge assignment, and notify each of them with their own amount and due date.

**Architecture:** `tms_fee_bill` becomes the authoritative payable ledger for staff, because staff structurally cannot be written into the shared `billing_student_bills` table. The existing fee generation route already resolves the staff cohort and applies the in-charge exemption; this plan adds explicit person-id scoping, flips admin-generated staff rows from a deferred record to a payable bill, and adds the staff-facing view, the admin mark-paid path, and the per-person notification.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + PostgREST), Vitest, TanStack Query, Tailwind.

## Global Constraints

- **Fee structure under work:** `Transport Fees 2026-2027 (Staff - All Colleges)` = `1cff2da9-565b-4618-9c21-68fb66c52aad`. Never hardcode this id in application code — it is operational data, used only in Task 8's manual run.
- **Due date for the single term:** `2026-08-31`.
- **Single instalment:** `term_no = 1`, `share_percent = 100.00`.
- **Cohort size:** exactly 19 staff. Expected dry-run figures: `applicable: 19`, `exemptInCharge: 109`.
- **Every `.in()` filter must be chunked to ≤150 ids and its error checked.** An unchecked gateway 400 returns `{ data: null }`, which reads as an empty set and silently exempts or drops people.
- **Tests:** `npx vitest run <path>` for one file, `npm test` for all. Tests are colocated as `<name>.test.ts`.
- **Do not trust `npm run lint`** — the ESLint config is circular and the command crashes. Verify with path-scoped `npx tsc --noEmit` and the test suite instead.
- **`npx tsc --noEmit` is already red on this repo** (~540 pre-existing errors from an untyped Supabase `Database` type; `next build` does not gate on them). Judge only whether *your* files added new errors.
- **Migrations:** `supabase/migrations/YYYYMMDDHHMMSS_<description>.sql`, applied with the Supabase `apply_migration` tool, and the `.sql` file always committed.
- **Never widen a billing cohort.** Person-id scoping is an intersection only.

---

### Task 1: Migration — make staff bills payable

`tms_fee_bill.status` currently allows only `generated | staff_deferred | error | cancelled`, and the table has no payment columns. A staff bill cannot be marked paid until both are fixed.

**Files:**
- Create: `supabase/migrations/20260804090000_tms_fee_bill_staff_payable.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `tms_fee_bill.status` accepts `'paid'`; columns `paid_at timestamptz`, `paid_amount numeric(10,2)`, `payment_reference text`, `marked_paid_by uuid` exist and are nullable.

- [ ] **Step 1: Write the migration**

```sql
-- Staff transport bills are payable inside TMS.
-- Staff can never be written to billing_student_bills (student_id is NOT NULL
-- with an FK to learners_profiles), so tms_fee_bill is the authoritative staff
-- ledger and needs a paid state plus payment capture columns.

alter table public.tms_fee_bill
  drop constraint if exists tms_fee_bill_status_check;

alter table public.tms_fee_bill
  add constraint tms_fee_bill_status_check
  check (status = any (array['generated'::text, 'staff_deferred'::text, 'paid'::text, 'error'::text, 'cancelled'::text]));

alter table public.tms_fee_bill
  add column if not exists paid_at timestamptz,
  add column if not exists paid_amount numeric(10,2),
  add column if not exists payment_reference text,
  add column if not exists marked_paid_by uuid;

comment on column public.tms_fee_bill.paid_at is 'Set when the transport office records payment. Staff bills only; learner payment lives in billing_student_bills.';
comment on column public.tms_fee_bill.payment_reference is 'Free-text receipt or transaction reference captured by the transport office.';

create index if not exists idx_tms_fee_bill_person_type_status
  on public.tms_fee_bill (person_type, status);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase `apply_migration` tool with name `tms_fee_bill_staff_payable` and the SQL above.

- [ ] **Step 3: Verify the constraint and columns exist**

Run this via the Supabase `execute_sql` tool:

```sql
select pg_get_constraintdef(oid) as def
from pg_constraint where conname = 'tms_fee_bill_status_check';

select column_name from information_schema.columns
where table_name = 'tms_fee_bill'
  and column_name in ('paid_at','paid_amount','payment_reference','marked_paid_by')
order by column_name;
```

Expected: the constraint definition contains `'paid'`, and exactly four column rows are returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260804090000_tms_fee_bill_staff_payable.sql
git commit -m "feat(fees): allow staff transport bills to be paid"
```

---

### Task 2: `buildStaffFeeBillRow` accepts a bill status

The function hardcodes `status: 'staff_deferred'`. Admin-initiated generation must write a real payable `'generated'` row, while the in-charge enforcement cron keeps writing `'staff_deferred'`. The default must stay `'staff_deferred'` so the cron and its existing tests are unaffected.

**Files:**
- Modify: `lib/fees/staff-bill.ts:17-57`
- Test: `lib/fees/staff-bill.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type StaffBillStatus = 'staff_deferred' | 'generated'`. `BuildStaffFeeBillRowInput` gains optional `status?: StaffBillStatus`. `StaffFeeBillRow.status` widens to `StaffBillStatus`. Omitting `status` yields `'staff_deferred'`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/fees/staff-bill.test.ts` inside the existing `describe('buildStaffFeeBillRow', …)` block:

```typescript
  it('defaults to staff_deferred when no status is given', () => {
    expect(buildStaffFeeBillRow(base).status).toBe('staff_deferred');
  });

  it('writes a payable generated row when status is given', () => {
    expect(buildStaffFeeBillRow({ ...base, status: 'generated' }).status).toBe('generated');
  });

  it('keeps billing_student_bill_id null even for a payable row', () => {
    expect(buildStaffFeeBillRow({ ...base, status: 'generated' }).billing_student_bill_id).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/staff-bill.test.ts`
Expected: FAIL — the two new status assertions fail (TypeScript will also reject the unknown `status` property).

- [ ] **Step 3: Implement the status parameter**

In `lib/fees/staff-bill.ts`, add the exported type above `StaffFeeBillRow`:

```typescript
/** Staff bills are either a coverage record (cron) or a real payable bill (admin run). */
export type StaffBillStatus = 'staff_deferred' | 'generated';
```

Change `StaffFeeBillRow.status` from `status: 'staff_deferred';` to:

```typescript
  status: StaffBillStatus;
```

Add to `BuildStaffFeeBillRowInput`:

```typescript
  /** Defaults to 'staff_deferred' so the in-charge enforcement cron is unchanged. */
  status?: StaffBillStatus;
```

In `buildStaffFeeBillRow`, change the returned `status` line to:

```typescript
    status: input.status ?? 'staff_deferred',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/staff-bill.test.ts`
Expected: PASS — all tests, including the pre-existing ones asserting `'staff_deferred'`.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/staff-bill.ts lib/fees/staff-bill.test.ts
git commit -m "feat(fees): let staff bill rows be generated as payable"
```

---

### Task 3: Pure person-id scoping helper

Restricting a run to a named subset must narrow the resolved cohort and never widen it, and must report ids that matched nobody so a typo cannot quietly under-bill. Kept pure and separate because it is the part that decides who gets charged money.

**Files:**
- Create: `lib/fees/person-scope.ts`
- Test: `lib/fees/person-scope.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```typescript
  interface ScopeablePerson { person_id: string }
  interface PersonScopeResult<T> { kept: T[]; requested: number; matched: number; unknownIds: string[] }
  function intersectPersonIds<T extends ScopeablePerson>(people: T[], personIds: string[] | null | undefined): PersonScopeResult<T>
  ```

- [ ] **Step 1: Write the failing tests**

Create `lib/fees/person-scope.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { intersectPersonIds } from './person-scope';

const PEOPLE = [{ person_id: 'a' }, { person_id: 'b' }, { person_id: 'c' }];

describe('intersectPersonIds', () => {
  it('returns everyone unchanged when no ids are requested', () => {
    const r = intersectPersonIds(PEOPLE, null);
    expect(r.kept).toEqual(PEOPLE);
    expect(r.requested).toBe(0);
    expect(r.unknownIds).toEqual([]);
  });

  it('treats an empty array as no scoping', () => {
    expect(intersectPersonIds(PEOPLE, []).kept).toEqual(PEOPLE);
  });

  it('narrows the cohort to the requested ids', () => {
    const r = intersectPersonIds(PEOPLE, ['a', 'c']);
    expect(r.kept.map((p) => p.person_id)).toEqual(['a', 'c']);
    expect(r.matched).toBe(2);
  });

  it('never widens the cohort — an id outside the cohort is not added', () => {
    const r = intersectPersonIds(PEOPLE, ['a', 'zzz']);
    expect(r.kept.map((p) => p.person_id)).toEqual(['a']);
    expect(r.kept).toHaveLength(1);
  });

  it('reports ids that matched nobody', () => {
    expect(intersectPersonIds(PEOPLE, ['a', 'zzz', 'qqq']).unknownIds).toEqual(['zzz', 'qqq']);
  });

  it('deduplicates repeated ids', () => {
    const r = intersectPersonIds(PEOPLE, ['a', 'a', 'b']);
    expect(r.kept).toHaveLength(2);
    expect(r.requested).toBe(2);
  });

  it('trims and ignores blank ids', () => {
    const r = intersectPersonIds(PEOPLE, ['  a  ', '', '   ']);
    expect(r.kept.map((p) => p.person_id)).toEqual(['a']);
    expect(r.requested).toBe(1);
  });

  it('yields an empty cohort when no requested id matches', () => {
    const r = intersectPersonIds(PEOPLE, ['zzz']);
    expect(r.kept).toEqual([]);
    expect(r.matched).toBe(0);
    expect(r.unknownIds).toEqual(['zzz']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/person-scope.test.ts`
Expected: FAIL — `Cannot find module './person-scope'`.

- [ ] **Step 3: Implement the helper**

Create `lib/fees/person-scope.ts`:

```typescript
// lib/fees/person-scope.ts
// Restrict a resolved fee cohort to an explicitly named subset.
//
// This is an INTERSECTION, never a lookup. The cohort passed in has already
// been through applicability + the bus in-charge exemption + stop-rate
// resolution; scoping may only remove people from it. Adding anyone here would
// bypass those gates and bill an exempt or unresolvable person.
//
// Ids that match nobody are returned rather than ignored: a mistyped id would
// otherwise silently shrink the run and under-bill without any signal.

export interface ScopeablePerson {
  person_id: string;
}

export interface PersonScopeResult<T> {
  kept: T[];
  /** Distinct non-blank ids actually requested. 0 means "no scoping applied". */
  requested: number;
  matched: number;
  unknownIds: string[];
}

export function intersectPersonIds<T extends ScopeablePerson>(
  people: T[],
  personIds: string[] | null | undefined
): PersonScopeResult<T> {
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const raw of personIds ?? []) {
    const v = String(raw ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    wanted.push(v);
  }

  // No usable ids = no scoping. Bill the whole resolved cohort.
  if (wanted.length === 0) {
    return { kept: people, requested: 0, matched: people.length, unknownIds: [] };
  }

  const present = new Set(people.map((p) => p.person_id));
  const kept = people.filter((p) => seen.has(p.person_id));
  const unknownIds = wanted.filter((id) => !present.has(id));

  return { kept, requested: wanted.length, matched: kept.length, unknownIds };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/person-scope.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/person-scope.ts lib/fees/person-scope.test.ts
git commit -m "feat(fees): add person-id cohort scoping helper"
```

---

### Task 4: Notification content builder

The notification must carry each staffer's own amount, stop and due date. Built as a pure function so the wording is testable without a database.

**Files:**
- Create: `lib/fees/staff-bill-notification.ts`
- Test: `lib/fees/staff-bill-notification.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```typescript
  interface StaffBillNotificationInput { amount: number; dueDate: string; stopName: string | null; yearName: string }
  function formatInr(amount: number): string
  function buildStaffBillNotification(input: StaffBillNotificationInput): { title: string; body: string; category: string; url: string }
  ```

- [ ] **Step 1: Write the failing tests**

Create `lib/fees/staff-bill-notification.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildStaffBillNotification, formatInr } from './staff-bill-notification';

const BASE = { amount: 10450, dueDate: '2026-08-31', stopName: 'SEELANAYAKKAM PATTI BYPASS', yearName: '2026-2027' };

describe('formatInr', () => {
  it('groups in the Indian lakh convention', () => {
    expect(formatInr(208550)).toBe('₹2,08,550');
  });

  it('formats a plain four-figure amount', () => {
    expect(formatInr(5500)).toBe('₹5,500');
  });

  it('drops a zero paise fraction', () => {
    expect(formatInr(10450.0)).toBe('₹10,450');
  });
});

describe('buildStaffBillNotification', () => {
  it('names the transport year in the title', () => {
    expect(buildStaffBillNotification(BASE).title).toBe('Transport fee 2026-2027 — bill generated');
  });

  it('states the amount and the due date in the body', () => {
    const { body } = buildStaffBillNotification(BASE);
    expect(body).toContain('₹10,450');
    expect(body).toContain('31 August 2026');
  });

  it('names the boarding stop the amount was derived from', () => {
    expect(buildStaffBillNotification(BASE).body).toContain('SEELANAYAKKAM PATTI BYPASS');
  });

  it('omits the stop clause when the stop is unknown', () => {
    const { body } = buildStaffBillNotification({ ...BASE, stopName: null });
    expect(body).toContain('₹10,450');
    expect(body).not.toContain('boarding stop');
  });

  it('links to the staff fees page under the transport category', () => {
    const n = buildStaffBillNotification(BASE);
    expect(n.url).toBe('/boarding/fees');
    expect(n.category).toBe('transport');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/staff-bill-notification.test.ts`
Expected: FAIL — `Cannot find module './staff-bill-notification'`.

- [ ] **Step 3: Implement the builder**

Create `lib/fees/staff-bill-notification.ts`:

```typescript
// lib/fees/staff-bill-notification.ts
// The in-app notice a staff member receives when their transport bill is
// generated. Pure so the wording — which goes to real people about real money
// — is unit-tested rather than proof-read.

export interface StaffBillNotificationInput {
  amount: number;
  /** ISO 'YYYY-MM-DD'. */
  dueDate: string;
  stopName: string | null;
  /** Transport year display name, e.g. '2026-2027'. */
  yearName: string;
}

/** Rupees in the Indian grouping convention, no paise when the amount is whole. */
export function formatInr(amount: number): string {
  const n = Number(amount);
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-08-31' -> '31 August 2026'. Parsed by parts to stay timezone-proof. */
function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function buildStaffBillNotification(input: StaffBillNotificationInput): {
  title: string;
  body: string;
  category: string;
  url: string;
} {
  const amount = formatInr(input.amount);
  const due = formatDueDate(input.dueDate);
  const stopClause = input.stopName ? ` It is based on your boarding stop, ${input.stopName}.` : '';

  return {
    title: `Transport fee ${input.yearName} — bill generated`,
    body:
      `Your transport fee for ${input.yearName} is ${amount}, due ${due}.` +
      `${stopClause} Open Transport Fees to see the full details, and contact the transport office to pay.`,
    category: 'transport',
    url: '/boarding/fees',
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/staff-bill-notification.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/staff-bill-notification.ts lib/fees/staff-bill-notification.test.ts
git commit -m "feat(fees): add staff bill notification content builder"
```

---

### Task 5: Wire scoping, payable status and notifications into the generate route

This is the task that changes what a generation run actually does. Three changes to one file: accept `personIds`, write staff rows as `'generated'`, and notify each staffer whose bill was inserted by this run.

**Files:**
- Modify: `app/api/admin/fees/[id]/generate/route.ts`

**Interfaces:**
- Consumes: `intersectPersonIds` (Task 3), `buildStaffFeeBillRow` with `status` (Task 2), `buildStaffBillNotification` (Task 4), `notifyProfile` from `lib/notifications/notify.ts:19`.
- Produces: `POST` body accepts optional `personIds: string[]`. Preview response gains `scopeRequested`, `scopeMatched`, `scopeUnknown`. Generate response gains `notified`.

- [ ] **Step 1: Add the imports**

At the top of `app/api/admin/fees/[id]/generate/route.ts`, alongside the existing imports:

```typescript
import { intersectPersonIds } from '@/lib/fees/person-scope';
import { buildStaffBillNotification } from '@/lib/fees/staff-bill-notification';
import { notifyProfile } from '@/lib/notifications/notify';
```

- [ ] **Step 2: Parse `personIds` from the request body**

Find this line (around line 55):

```typescript
    const mode: 'dry_run' | 'generate' = body?.mode === 'generate' ? 'generate' : 'dry_run';
```

Add immediately after it:

```typescript
    // Optional explicit subset. Applied as an INTERSECTION after applicability
    // and the in-charge exemption, so it can only narrow the cohort.
    const requestedPersonIds: string[] | null = Array.isArray(body?.personIds)
      ? (body.personIds as unknown[]).map((v) => String(v))
      : null;
```

- [ ] **Step 3: Apply the intersection after the in-charge exemption**

Find the end of the in-charge exemption block (around line 277):

```typescript
      people = filtered.kept;
    }
```

Add immediately after that closing brace:

```typescript
    // Explicit subset, applied LAST so applicability, the in-charge exemption and
    // (below) stop-rate resolution all still gate who can be billed.
    const scope = intersectPersonIds(people, requestedPersonIds);
    people = scope.kept;
```

- [ ] **Step 4: Surface the scope in the preview**

Find the `preview` object (around line 371) and add these three fields after `unmatchedInCharge`:

```typescript
      scopeRequested: scope.requested,
      scopeMatched: scope.matched,
      scopeUnknown: scope.unknownIds,
```

- [ ] **Step 5: Declare the notification accumulator**

Find the counters declared before the insert loop (around line 448):

```typescript
    let learnerBilled = 0;
    let staffDeferred = 0;
```

Add above them:

```typescript
    // Staff whose bill was actually inserted by this run — the notification list.
    const billedStaff: Array<{ staffId: string; amount: number; dueDate: string }> = [];
```

- [ ] **Step 6: Write staff rows as payable and record who to notify**

Find the staff branch of the insert loop (around line 503):

```typescript
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

Replace that whole `else` block with:

```typescript
        } else {
          // staff: a real payable bill. tms_fee_bill is the authoritative staff
          // ledger — staff can never be written to billing_student_bills, whose
          // student_id is NOT NULL with an FK to learners_profiles. The
          // in-charge enforcement cron still writes 'staff_deferred' via the
          // parameter default.
          const { error: ledErr } = await supabase.from('tms_fee_bill').insert([
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
          // Notify only for rows THIS run inserted, so a re-run — which inserts
          // nothing thanks to tms_fee_bill_idem_unique — notifies nobody.
          billedStaff.push({ staffId: p.person_id, amount, dueDate: t.due_date });
        }
```

- [ ] **Step 7: Send the notifications after the insert loop**

Find the end of the insert loop, immediately before `if (runId) {` (around line 522). Insert this block there:

```typescript
    // ── Notify each staff member whose bill this run created ────────────────
    // Best-effort: a notification failure must never undo a generated bill, so
    // failures are counted and reported, never thrown. Every .in() is chunked to
    // <=150 and error-checked — an unchecked gateway 400 reads as an empty set,
    // which would silently notify nobody while reporting success.
    let notified = 0;
    if (billedStaff.length) {
      const { data: tyRow } = await supabase
        .from('tms_transport_year')
        .select('name')
        .eq('id', fs.transport_year_id)
        .maybeSingle();
      const yearName = (tyRow as { name?: string } | null)?.name ?? 'this year';

      const staffIds = billedStaff.map((b) => b.staffId);
      const profileIdByStaff = new Map<string, string | null>();
      const stopIdByStaff = new Map<string, string | null>();
      const CHUNK_NOTIFY = 150;
      let lookupFailed = false;
      for (let i = 0; i < staffIds.length; i += CHUNK_NOTIFY) {
        const { data: rows, error: sErr } = await supabase
          .from('staff')
          .select('id, profile_id, transport_stop_id')
          .in('id', staffIds.slice(i, i + CHUNK_NOTIFY));
        if (sErr) { lookupFailed = true; break; }
        for (const r of (rows ?? []) as Array<{ id: string; profile_id: string | null; transport_stop_id: string | null }>) {
          profileIdByStaff.set(r.id, r.profile_id);
          stopIdByStaff.set(r.id, r.transport_stop_id);
        }
      }

      const stopNameById = new Map<string, string>();
      const stopIds = [...new Set([...stopIdByStaff.values()].filter((v): v is string => !!v))];
      for (let i = 0; i < stopIds.length && !lookupFailed; i += CHUNK_NOTIFY) {
        const { data: rows, error: stErr } = await supabase
          .from('tms_route_stop')
          .select('id, stop_name')
          .in('id', stopIds.slice(i, i + CHUNK_NOTIFY));
        if (stErr) break; // stop name is cosmetic — degrade to no stop clause
        for (const r of (rows ?? []) as Array<{ id: string; stop_name: string | null }>) {
          if (r.stop_name) stopNameById.set(r.id, r.stop_name);
        }
      }

      if (!lookupFailed) {
        for (const b of billedStaff) {
          const profileId = profileIdByStaff.get(b.staffId);
          if (!profileId) continue; // no login identity — nothing to notify
          const stopId = stopIdByStaff.get(b.staffId);
          const note = buildStaffBillNotification({
            amount: b.amount,
            dueDate: b.dueDate,
            stopName: stopId ? stopNameById.get(stopId) ?? null : null,
            yearName,
          });
          await notifyProfile(supabase, {
            profileId,
            actorId: auth.userId,
            title: note.title,
            body: note.body,
            category: note.category,
            url: note.url,
          });
          notified++;
        }
      }
    }
```

- [ ] **Step 8: Report the notification count in the response**

Find the final success response (around line 563) and change its `data` and `message`:

```typescript
    return NextResponse.json({
      success: true,
      data: { mode: 'generate', runId, applicable: resolved.length, learnerBilled, staffDeferred, skipped, unresolved, errors, notified },
      message: `Generated ${learnerBilled} learner bill(s); ${staffDeferred} staff bill(s); ${notified} staff notified; ${skipped} already billed (skipped)${unresolved ? `; ${unresolved} unresolved` : ''}.`,
    });
```

- [ ] **Step 9: Typecheck the changed file**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "fees/\[id\]/generate"`
Expected: no output. (The repo-wide typecheck is already red for unrelated reasons — only your file matters.)

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: PASS — no regression in the existing fees tests.

- [ ] **Step 11: Commit**

```bash
git add app/api/admin/fees/[id]/generate/route.ts
git commit -m "feat(fees): scope generation to named staff, bill them payably, notify each"
```

---

### Task 6: Staff-facing transport fee view

A staff member must be able to see the bill the notification tells them about. The route resolves the caller's own staff record from their auth profile and never accepts a person id from the client.

**Files:**
- Create: `app/api/boarding/fees/route.ts`
- Create: `app/boarding/fees/page.tsx`

**Interfaces:**
- Consumes: `withAuth`/`AuthContext` from `lib/api/with-auth`, `formatInr` from Task 4.
- Produces: `GET /api/boarding/fees` → `{ success: true, data: { bills: Array<{ id, amount, dueDate, termNo, status, stopName, yearName }>, totalDue: number } }`.

- [ ] **Step 1: Write the API route**

Create `app/api/boarding/fees/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * The caller's OWN transport fee bills.
 *
 * Staff bills live in tms_fee_bill (staff can never be written to
 * billing_student_bills — its student_id is NOT NULL with an FK to
 * learners_profiles). The staff record is resolved from the authenticated
 * profile id; no person id is ever accepted from the client.
 */
async function getMyFees(auth: AuthContext) {
  try {
    const supabase = createServiceRoleClient();

    const { data: staffRow, error: staffErr } = await supabase
      .from('staff')
      .select('id, transport_stop_id')
      .eq('profile_id', auth.userId)
      .maybeSingle();
    if (staffErr) {
      return NextResponse.json({ error: 'Failed to load your staff record.' }, { status: 500 });
    }
    if (!staffRow) {
      return NextResponse.json({ success: true, data: { bills: [], totalDue: 0 } });
    }

    const staff = staffRow as { id: string; transport_stop_id: string | null };
    const { data: billRows, error: billErr } = await supabase
      .from('tms_fee_bill')
      .select('id, amount, due_date, term_no, status, transport_year_id')
      .eq('person_id', staff.id)
      .eq('person_type', 'staff')
      .in('status', ['generated', 'paid'])
      .order('term_no', { ascending: true });
    if (billErr) {
      return NextResponse.json({ error: 'Failed to load your transport fees.' }, { status: 500 });
    }

    const bills = (billRows ?? []) as Array<{
      id: string; amount: number; due_date: string; term_no: number;
      status: string; transport_year_id: string;
    }>;

    // Stop name and year name are display-only; a failure degrades to null
    // rather than hiding the bill the person needs to see.
    let stopName: string | null = null;
    if (staff.transport_stop_id) {
      const { data: stop } = await supabase
        .from('tms_route_stop')
        .select('stop_name')
        .eq('id', staff.transport_stop_id)
        .maybeSingle();
      stopName = (stop as { stop_name?: string } | null)?.stop_name ?? null;
    }

    const yearNameById = new Map<string, string>();
    const yearIds = [...new Set(bills.map((b) => b.transport_year_id))];
    if (yearIds.length) {
      const { data: years } = await supabase
        .from('tms_transport_year')
        .select('id, name')
        .in('id', yearIds);
      for (const y of (years ?? []) as Array<{ id: string; name: string }>) {
        yearNameById.set(y.id, y.name);
      }
    }

    const totalDue = bills
      .filter((b) => b.status === 'generated')
      .reduce((s, b) => s + Number(b.amount), 0);

    return NextResponse.json({
      success: true,
      data: {
        bills: bills.map((b) => ({
          id: b.id,
          amount: Number(b.amount),
          dueDate: b.due_date,
          termNo: b.term_no,
          status: b.status,
          stopName,
          yearName: yearNameById.get(b.transport_year_id) ?? null,
        })),
        totalDue,
      },
    });
  } catch (e) {
    console.error('staff fees API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getMyFees(auth));
```

- [ ] **Step 2: Write the staff-facing page**

Create `app/boarding/fees/page.tsx`:

```tsx
'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, IndianRupee, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatInr } from '@/lib/fees/staff-bill-notification';

interface StaffBill {
  id: string;
  amount: number;
  dueDate: string;
  termNo: number;
  status: string;
  stopName: string | null;
  yearName: string | null;
}

async function fetchMyFees(): Promise<{ bills: StaffBill[]; totalDue: number }> {
  const res = await fetch('/api/boarding/fees');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load your transport fees');
  return json.data;
}

export default function StaffFeesPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['staff-fees'], queryFn: fetchMyFees });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your transport fees…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>We could not load your transport fees. Please try again, or contact the transport office.</span>
        </div>
      </div>
    );
  }

  const bills = data?.bills ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transport Fees</h1>
        <p className="text-gray-600">Your transport fee for the current year.</p>
      </div>

      {bills.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          You have no transport fee bills.
        </div>
      ) : (
        <>
          {(data?.totalDue ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="text-sm text-amber-800 dark:text-amber-200">Amount due</p>
              <p className="flex items-center text-2xl font-bold text-amber-900 dark:text-amber-100">
                <IndianRupee className="mr-1 h-5 w-5" />
                {formatInr(data?.totalDue ?? 0).replace('₹', '')}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {bills.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {b.yearName ? `Transport fee ${b.yearName}` : 'Transport fee'}
                  </p>
                  <p className="truncate text-sm text-gray-500">
                    Due {b.dueDate}
                    {b.stopName ? ` · ${b.stopName}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-gray-900">{formatInr(b.amount)}</p>
                  {b.status === 'paid' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-amber-600">Unpaid</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-500">
            To pay, contact the transport office. This page updates once your payment is recorded.
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck the new files**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "boarding/fees"`
Expected: no output.

- [ ] **Step 4: Verify the route is auth-gated**

Run: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/boarding/fees` with the dev server running.
Expected: `401` (unauthenticated API requests are rejected by `proxy.ts` before routing). Use `127.0.0.1`, not `localhost` — `localhost` false-negatives on this machine.

- [ ] **Step 5: Commit**

```bash
git add app/api/boarding/fees/route.ts app/boarding/fees/page.tsx
git commit -m "feat(boarding): add staff transport fee view"
```

---

### Task 7: Admin staff-bill list and mark-paid

The transport office needs to see who was billed and record payment.

**Files:**
- Create: `app/api/admin/fees/[id]/staff-bills/route.ts`
- Create: `app/api/admin/fees/[id]/staff-bills/mark-paid/route.ts`

**Interfaces:**
- Consumes: `TMS_PERMISSIONS.FEES_VIEW` and `TMS_PERMISSIONS.FEES_EDIT` from `lib/constants/tms-permissions.ts:74-78`, `logActivity` from `lib/activity/log`.
- Produces: `GET /api/admin/fees/[id]/staff-bills` → `{ success, data: Array<{ id, staffId, name, staffCode, amount, dueDate, status, paidAt, paymentReference }> }`. `POST …/mark-paid` with `{ billId, paidAmount, paymentReference }` → `{ success, message }`.

- [ ] **Step 1: Write the list route**

Create `app/api/admin/fees/[id]/staff-bills/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route context, so pull [id] from the path:
// /api/admin/fees/<id>/staff-bills
function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

async function listStaffBills(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: billRows, error } = await supabase
      .from('tms_fee_bill')
      .select('id, person_id, amount, due_date, status, paid_at, payment_reference')
      .eq('fee_structure_id', id)
      .eq('person_type', 'staff')
      .order('created_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: 'Failed to load staff bills' }, { status: 500 });
    }

    const bills = (billRows ?? []) as Array<{
      id: string; person_id: string; amount: number; due_date: string;
      status: string; paid_at: string | null; payment_reference: string | null;
    }>;

    // Resolve names. Chunked to <=150 and error-checked: an unchecked gateway
    // 400 returns null, which would blank every name with no signal.
    const staffIds = [...new Set(bills.map((b) => b.person_id))];
    const staffById = new Map<string, { name: string; code: string | null }>();
    const CHUNK = 150;
    for (let i = 0; i < staffIds.length; i += CHUNK) {
      const { data: rows, error: sErr } = await supabase
        .from('staff')
        .select('id, first_name, last_name, staff_id')
        .in('id', staffIds.slice(i, i + CHUNK));
      if (sErr) {
        return NextResponse.json({ error: 'Failed to resolve staff names' }, { status: 500 });
      }
      for (const r of (rows ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null; staff_id: string | null;
      }>) {
        staffById.set(r.id, {
          name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown',
          code: r.staff_id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: bills.map((b) => ({
        id: b.id,
        staffId: b.person_id,
        name: staffById.get(b.person_id)?.name ?? 'Unknown',
        staffCode: staffById.get(b.person_id)?.code ?? null,
        amount: Number(b.amount),
        dueDate: b.due_date,
        status: b.status,
        paidAt: b.paid_at,
        paymentReference: b.payment_reference,
      })),
    });
  } catch (e) {
    console.error('staff bills list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => listStaffBills(request, auth));
```

- [ ] **Step 2: Write the mark-paid route**

Create `app/api/admin/fees/[id]/staff-bills/mark-paid/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Record an offline payment against one staff transport bill. */
async function markPaid(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const billId = String(body?.billId ?? '').trim();
    const paymentReference = body?.paymentReference ? String(body.paymentReference).trim() : null;
    if (!billId) {
      return NextResponse.json({ error: 'billId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: bill, error: readErr } = await supabase
      .from('tms_fee_bill')
      .select('id, person_id, person_type, amount, status')
      .eq('id', billId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: 'Failed to load the bill' }, { status: 500 });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    const row = bill as { id: string; person_id: string; person_type: string; amount: number; status: string };
    // Learner payment is owned by MyJKKN's billing_student_bills — this endpoint
    // must never write a learner bill's paid state.
    if (row.person_type !== 'staff') {
      return NextResponse.json({ error: 'Only staff bills can be marked paid here.' }, { status: 400 });
    }
    if (row.status === 'paid') {
      return NextResponse.json({ error: 'This bill is already marked paid.' }, { status: 409 });
    }
    if (row.status !== 'generated') {
      return NextResponse.json({ error: `A bill with status "${row.status}" cannot be marked paid.` }, { status: 400 });
    }

    const paidAmount = body?.paidAmount != null ? Number(body.paidAmount) : Number(row.amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return NextResponse.json({ error: 'paidAmount must be a positive number' }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from('tms_fee_bill')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: paidAmount,
        payment_reference: paymentReference,
        marked_paid_by: auth.userId,
      })
      .eq('id', billId)
      .eq('status', 'generated'); // guard against a concurrent double-mark
    if (updErr) {
      return NextResponse.json({ error: 'Failed to record the payment' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fee_bill',
      entityId: billId,
      entityLabel: row.person_id,
      description: `Recorded staff transport fee payment of ${paidAmount}`,
      metadata: { billId, paidAmount, paymentReference, staffId: row.person_id },
    });

    return NextResponse.json({ success: true, message: 'Payment recorded' });
  } catch (e) {
    console.error('mark paid error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => markPaid(request, auth));
```

- [ ] **Step 3: Typecheck the new files**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "staff-bills"`
Expected: no output.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/fees/[id]/staff-bills
git commit -m "feat(fees): add admin staff-bill list and mark-paid"
```

---

### Task 8: Operational run — reschedule, dry-run, generate

This task writes real money rows for 19 real people and sends them notifications. It is deliberately last, and the dry-run gate is not optional.

**Files:**
- No source files. This is an operator sequence run against the live database.

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: 19 `tms_fee_bill` rows at `status='generated'`, and 19 notifications.

- [ ] **Step 1: Capture the 19 person ids**

Run via the Supabase `execute_sql` tool:

```sql
with onboard as (
  select s.id, s.staff_id,
         lower(trim(s.email)) pe, lower(trim(s.institution_email)) ie, lower(trim(p.email)) pfe
  from staff s left join profiles p on p.id = s.profile_id
  where s.bus_required and s.is_active
),
act as (select lower(trim(staff_email)) em from tms_staff_route_assignment where is_active)
select json_agg(o.id) as person_ids from onboard o
where not exists (select 1 from act a where a.em in (o.pe, o.ie, o.pfe))
  and coalesce(o.staff_id,'') not like 'JICATE%';
```

Expected: a JSON array of exactly 19 uuids. **If the count is not 19, stop** — someone volunteered or left since the spec was written, and the operator must re-confirm the list before any money is billed.

- [ ] **Step 2: Change the instalment schedule to one term at 100%**

`PUT /api/admin/fees/1cff2da9-565b-4618-9c21-68fb66c52aad` through the admin fees edit UI, setting the stop-wise schedule to a single instalment:

- `term_no: 1`, `term_label: 'Term 1'`, `share_percent: 100.00`, `due_date: '2026-08-31'`

Then verify:

```sql
select term_no, term_label, due_date, share_percent
from tms_fee_structure_stop_term
where fee_structure_id = '1cff2da9-565b-4618-9c21-68fb66c52aad' order by term_no;
```

Expected: exactly one row — `1 | Term 1 | 2026-08-31 | 100.00`.

- [ ] **Step 3: Dry run**

```bash
curl -s -X POST http://127.0.0.1:3000/api/admin/fees/1cff2da9-565b-4618-9c21-68fb66c52aad/generate \
  -H 'Content-Type: application/json' \
  -b "$ADMIN_COOKIE" \
  -d '{"mode":"dry_run","personIds":[ ...the 19 ids from Step 1... ]}'
```

Expected in the response:
- `applicable: 19`
- `toGeneratePairs: 19`
- `exemptInCharge: 109`
- `scopeRequested: 19`, `scopeMatched: 19`, `scopeUnknown: []`
- `unresolved: 0`
- `conflictCount: 0`

**Abort on any mismatch.** A low `exemptInCharge` means the in-charge email matching regressed and exempt staff are about to be billed. A non-empty `scopeUnknown` means an id matched nobody.

- [ ] **Step 4: Generate**

Re-run the exact same request with `"mode":"generate"`.

Expected: `staffDeferred: 19` (the count field name is unchanged; the rows are `status='generated'`), `notified: 19`, `errors: 0`.

- [ ] **Step 5: Verify the ledger and the notifications**

```sql
select status, count(*), sum(amount) as total
from tms_fee_bill
where fee_structure_id = '1cff2da9-565b-4618-9c21-68fb66c52aad' and person_type = 'staff'
group by status;

select n.title, count(r.id) as recipients
from tms_notification n
left join tms_notification_recipient r on r.notification_id = n.id
where n.title like 'Transport fee%'
group by n.title;
```

Expected: 19 rows at `generated` totalling `208550.00`, and 19 notification recipients.

- [ ] **Step 6: Verify idempotency**

Re-run the Step 4 generate request unchanged.

Expected: `staffDeferred: 0`, `notified: 0`, `skipped: 19`. The unique index `tms_fee_bill_idem_unique` blocks the inserts, and because notifications are keyed off rows actually inserted, nobody is notified twice.

- [ ] **Step 7: Confirm no portal lockout**

```sql
select count(*) from tms_fee_bill
where person_type = 'staff' and status = 'generated' and due_date < current_date;
```

The staff fee gate in `proxy.ts:239-242` is an inert comment, so overdue staff bills must NOT restrict portal access. Confirm with the operator that a billed staff member can still reach the boarding portal.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1 · Instalment schedule 2×50% → 1×100% | Task 8, Step 2 |
| 2 · Migration: payable staff bills | Task 1 |
| 3 · Person-id scoping | Tasks 3, 5 |
| 4 · Staff rows written as payable | Tasks 2, 5 |
| 5 · Staff-facing bill view | Task 6 |
| 6 · Admin list + mark paid | Task 7 |
| 7 · Notification | Tasks 4, 5 |
| Dry-run mandatory before generate | Task 8, Step 3 |
| `.in()` chunked ≤150 and error-checked | Tasks 5, 7 |
| Notification failures non-fatal | Task 5, Step 7 |
| Idempotent re-run notifies nobody | Task 8, Step 6 |
| No portal lockout | Task 8, Step 7 |

**Type consistency:** `StaffBillStatus` (Task 2) is consumed in Task 5 Step 5. `intersectPersonIds` returns `{ kept, requested, matched, unknownIds }` (Task 3) and is destructured as `scope.kept` / `scope.requested` / `scope.matched` / `scope.unknownIds` in Task 5 Steps 3–4. `buildStaffBillNotification` returns `{ title, body, category, url }` (Task 4) and all four are read in Task 5 Step 7. `formatInr` (Task 4) is imported by Task 6's page.

**Non-goals confirmed absent:** no payment gateway, no `billing_student_bills` writes for staff, no `proxy.ts` gate implementation, no changes to the in-charge enforcement cron beyond the backwards-compatible status default.
