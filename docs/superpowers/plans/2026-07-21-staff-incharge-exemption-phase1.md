# Staff In-Charge Fee Exemption — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the bill generator from charging staff who serve as bus in-charge, and notify all 105 bus staff that they must volunteer by 25 July 2026 or the stop-wise transport fee applies.

**Architecture:** The exemption is a **cohort filter applied after `resolveApplicablePeople` returns**, never inside it — that function is shared with the nightly in-charge cron. The filter itself is a pure, unit-tested function; the route only supplies it with data. Before any of that, two divergent branches must be merged, because they both rewrote the live billing route.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (service-role client), vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-21-staff-incharge-transport-fee-enforcement-design.md`

**Scope note:** This plan covers **Phase 1 only** — it produces working software on its own (correct billing with the exemption, plus the deadline notification). Phase 2 (deadline column, automatic cron with circuit breaker, `REMOVAL_THRESHOLD` 2→3, late-opt-in cancellation) gets its own plan once the 25 July deadline has passed.

## Global Constraints

- **The exemption applies to any `audience='staff'` + `fee_mode='stop_wise'` structure.** No feature flag — that is the policy.
- **`lib/fees/applicability.ts` must NOT be modified.** The nightly in-charge cron shares `resolveApplicablePeople`.
- **Email casing:** `tms_staff_route_assignment` keys on `staff_email`; bills key on `staff.id`. **Every comparison must lowercase both sides.** This repo has already shipped a bug from exactly this mismatch.
- **Chunk every `.in()` to ≤150 ids and CHECK the error.** A larger call returns HTTP 400 and an unchecked `{ data }` reads as EMPTY — which here would exempt **nobody** and bill all 105 staff.
- **A missing stop rate is never billed as ₹0** — it is reported unresolved. A rate of `0` IS a real value and IS billed.
- **The three pre-existing fee structures must be unaffected in any way** — "Testing", "Transport Fees 2026-2027", "Transport Fees 2026-2027(Arts Self)". Standing user directive.
- **Do NOT price the "COLLEGE" stop.** It is a route terminus, not a boarding point. The one un-priced staff member (`ranjithkumar.s@jkkn.ac.in`) has a bad `transport_stop_id`; the fix is his record, not the rate table.
- **Verification reality:** `npm run lint` crashes (circular config) — never run it. `tsc` is chronically red (~540 pre-existing) and does not gate `next build`. Type success = `npx tsc --noEmit 2>&1 | grep <changed-file>` returns **zero lines**.
- **VITEST cannot resolve the `@/` alias.** Tests and any `lib/` source they import must use relative imports. `app/` route files may use `@/`.
- **`npm run build` is CONTESTED** — another session's dev server (PID 12328) holds port 3001 and reads `.next/`. Do not build or start a dev server.
- **Git:** explicit `git add <paths>` only, never `-A`/`-u`. Commit locally; **never push**. No history rewrites except the single deliberate rebase in Task 1.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Create:**
| File | Responsibility |
|---|---|
| `lib/fees/incharge-exemption.ts` | `filterOutInCharges` — pure cohort filter |
| `lib/fees/incharge-exemption.test.ts` | Its tests |

**Modify:**
| File | Change |
|---|---|
| `app/api/admin/fees/[id]/generate/route.ts` | Load active in-charge emails; apply the filter; report the exempt count |
| `app/(admin)/fees/[id]/page.tsx` | Show "Exempt (in-charge)" in the dry-run preview |
| `app/(admin)/fees/fee-api.ts` | Widen `GeneratePreview` with `exemptInCharge` |

---

## Task 1: Untangle the two branches

No feature code. This is a git operation, and it is the riskiest task in the plan: the conflicted file has written **1,952 real bills**.

**Files:**
- Resolve: `app/api/admin/fees/[id]/generate/route.ts` (the only overlapping file)

**Interfaces:**
- Consumes: nothing
- Produces: a single trunk carrying both features, on which every later task depends

- [ ] **Step 1: Record the pre-merge state of both branches**

```bash
git rev-list --left-right --count origin/main...feat/incharge-attendance-fee-enforcement
git rev-list --left-right --count origin/main...feat/aided-stop-wise-fees
git diff --name-only origin/main...feat/incharge-attendance-fee-enforcement
```

Expected: `0 14` and `0 29`; the file list must contain `app/api/admin/fees/[id]/generate/route.ts`.

- [ ] **Step 2: Capture both branches' test baselines**

```bash
git checkout feat/incharge-attendance-fee-enforcement && npx vitest run 2>&1 | grep -E "Test Files|Tests "
git checkout feat/aided-stop-wise-fees && npx vitest run 2>&1 | grep -E "Test Files|Tests "
```

Write both numbers down. The merged trunk must carry the **union** of both suites — if the combined
number is lower than either input, tests were lost in the merge.

- [ ] **Step 3: Merge the in-charge branch into main**

```bash
git checkout main
git merge --ff-only feat/incharge-attendance-fee-enforcement
```

Expected: fast-forward (main is at `origin/main` with no local commits of its own on this path).
If it refuses, **STOP and report** — a non-fast-forward means main has diverged and the plan's
assumption is wrong.

- [ ] **Step 4: Rebase the stop-wise branch onto the new main**

```bash
git checkout feat/aided-stop-wise-fees
git rebase main
```

This is the only history rewrite permitted anywhere in this project, and it is deliberate.

- [ ] **Step 5: Resolve the conflict in the billing route**

The conflict is in `app/api/admin/fees/[id]/generate/route.ts`. **Both sides must survive:**

- From the **in-charge branch**: the staff `else` branch delegates to `buildStaffFeeBillRow()` from `lib/fees/staff-bill.ts` (a de-duplication — the emitted row is field-identical to the inline version it replaced).
- From the **stop-wise branch**: `isStopWise`, the three-way term loading (`} else if (!isStopWise) {`), the stop schedule + rate loading, the boarding-stop lookup, `resolvePersonTerms`, `unresolvedByReason`, and the per-mode run-note branch.

These do not overlap semantically — one changes *how a staff ledger row is built*, the other changes *which terms and amounts apply*. Keep both. Do NOT discard either side wholesale.

- [ ] **Step 6: Verify the merge kept everything**

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npx tsc --noEmit 2>&1 | grep "fees/\[id\]/generate"
```

Expected: test count ≥ the higher of the two baselines from Step 2 (it should be roughly their union),
and zero tsc lines. Then confirm both features' markers survived:

```bash
grep -c "buildStaffFeeBillRow" "app/api/admin/fees/[id]/generate/route.ts"
grep -c "isStopWise" "app/api/admin/fees/[id]/generate/route.ts"
```

Expected: both ≥ 1. A zero means one feature was lost in the resolution.

- [ ] **Step 7: Verify the protected structures are still untouched**

Run via the Supabase MCP `execute_sql` tool:

```sql
select fs.name, fs.fee_mode, fs.updated_at,
       (select count(*) from tms_fee_bill fb where fb.fee_structure_id=fs.id) as ledger_rows
from tms_fee_structure fs where fs.fee_mode in ('flat','tiered') order by fs.name;
```

Expected, unchanged: Testing `2026-06-19` / 2 rows; Transport Fees 2026-2027 `2026-06-19` / 1232;
Transport Fees 2026-2027(Arts Self) `2026-06-19` / 718.

- [ ] **Step 8: Commit the resolution**

The rebase creates no commit of its own for a clean resolution; if `git status` shows a pending
rebase, finish it with `git rebase --continue`. Then verify:

```bash
git log --oneline -1
git status --porcelain
```

Expected: the branch tip is your last stop-wise commit, and the working tree carries only the
pre-existing dirt (`.claude/`, `next-env.d.ts`, `bun.lock`).

---

## Task 2: The exemption filter (pure function)

**Files:**
- Create: `lib/fees/incharge-exemption.ts`
- Test: `lib/fees/incharge-exemption.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `interface ExemptablePerson { person_id: string; email: string | null }`
  - `filterOutInCharges<T extends ExemptablePerson>(people: T[], inChargeEmails: Iterable<string>): { kept: T[]; exemptCount: number }`

- [ ] **Step 1: Write the failing tests**

Create `lib/fees/incharge-exemption.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterOutInCharges } from './incharge-exemption';

const p = (person_id: string, email: string | null) => ({ person_id, email });

describe('filterOutInCharges', () => {
  it('removes staff who hold an active in-charge assignment', () => {
    const r = filterOutInCharges(
      [p('s1', 'a@jkkn.ac.in'), p('s2', 'b@jkkn.ac.in')],
      ['a@jkkn.ac.in']
    );
    expect(r.kept.map((x) => x.person_id)).toEqual(['s2']);
    expect(r.exemptCount).toBe(1);
  });

  it('matches regardless of email casing on EITHER side', () => {
    // tms_staff_route_assignment stores staff_email free-form; staff.email may
    // differ in case. A case-sensitive compare would exempt nobody and bill
    // every in-charge.
    const r = filterOutInCharges(
      [p('s1', 'Alice.B@JKKN.ac.in')],
      ['alice.b@jkkn.ac.in']
    );
    expect(r.kept).toEqual([]);
    expect(r.exemptCount).toBe(1);
  });

  it('tolerates surrounding whitespace in the assignment email', () => {
    const r = filterOutInCharges([p('s1', 'a@jkkn.ac.in')], ['  a@jkkn.ac.in  ']);
    expect(r.exemptCount).toBe(1);
  });

  it('keeps everyone when there are no in-charges', () => {
    const r = filterOutInCharges([p('s1', 'a@jkkn.ac.in'), p('s2', 'b@jkkn.ac.in')], []);
    expect(r.kept).toHaveLength(2);
    expect(r.exemptCount).toBe(0);
  });

  it('keeps a person with a null email rather than silently exempting them', () => {
    // A missing email must not be treated as "matches nothing special" in a way
    // that drops them; they are billable and must stay in the cohort.
    const r = filterOutInCharges([p('s1', null)], ['a@jkkn.ac.in']);
    expect(r.kept.map((x) => x.person_id)).toEqual(['s1']);
    expect(r.exemptCount).toBe(0);
  });

  it('ignores blank entries in the in-charge list', () => {
    // A blank staff_email must never match a person with a null/blank email.
    const r = filterOutInCharges([p('s1', null), p('s2', '')], ['', '   ']);
    expect(r.kept).toHaveLength(2);
    expect(r.exemptCount).toBe(0);
  });

  it('counts each exempted person once even if listed twice', () => {
    const r = filterOutInCharges([p('s1', 'a@jkkn.ac.in')], ['a@jkkn.ac.in', 'A@jkkn.ac.in']);
    expect(r.kept).toEqual([]);
    expect(r.exemptCount).toBe(1);
  });

  it('preserves the order of the kept people', () => {
    const r = filterOutInCharges(
      [p('s1', 'a@x'), p('s2', 'b@x'), p('s3', 'c@x')],
      ['b@x']
    );
    expect(r.kept.map((x) => x.person_id)).toEqual(['s1', 's3']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/fees/incharge-exemption.test.ts`
Expected: FAIL — `Failed to resolve import "./incharge-exemption"`.

- [ ] **Step 3: Write the implementation**

Create `lib/fees/incharge-exemption.ts`:

```ts
// lib/fees/incharge-exemption.ts
// A bus in-charge holds a transport fee exemption in exchange for the duty.
// This removes them from a staff fee cohort.
//
// Kept pure and separate because the matching is the fragile part:
// tms_staff_route_assignment keys on staff_email (free-form text) while bills
// key on staff.id. A case-sensitive compare exempts NOBODY and bills every
// in-charge — so normalisation is the whole job, and it is unit-tested.

export interface ExemptablePerson {
  person_id: string;
  email: string | null;
}

/** Lowercased + trimmed, or null when there is nothing usable to match on. */
function normalizeEmail(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim().toLowerCase();
  return v.length ? v : null;
}

/**
 * Drop anyone whose email appears in `inChargeEmails`.
 *
 * A person with no usable email is KEPT (they are billable — we must not drop
 * someone from billing just because their record is incomplete). A blank entry
 * in `inChargeEmails` matches nobody.
 */
export function filterOutInCharges<T extends ExemptablePerson>(
  people: T[],
  inChargeEmails: Iterable<string>
): { kept: T[]; exemptCount: number } {
  const exempt = new Set<string>();
  for (const raw of inChargeEmails) {
    const n = normalizeEmail(raw);
    if (n) exempt.add(n);
  }

  const kept: T[] = [];
  let exemptCount = 0;
  for (const person of people) {
    const n = normalizeEmail(person.email);
    if (n && exempt.has(n)) {
      exemptCount++;
      continue;
    }
    kept.push(person);
  }
  return { kept, exemptCount };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/fees/incharge-exemption.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 4: Commit**

```bash
git add lib/fees/incharge-exemption.ts lib/fees/incharge-exemption.test.ts
git commit -m "feat(fees): pure in-charge exemption filter

Bus in-charges hold a fee exemption in exchange for the duty. Matching is the
fragile part -- assignments key on free-form staff_email while bills key on
staff.id, so a case-sensitive compare would exempt nobody and bill every
in-charge. Normalisation is unit-tested on both sides.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Apply the exemption in the bill generator

**Files:**
- Modify: `app/api/admin/fees/[id]/generate/route.ts`

**Interfaces:**
- Consumes: `filterOutInCharges`, `ExemptablePerson` (Task 2)
- Produces: `preview.exemptInCharge: number` in the dry-run response

- [ ] **Step 1: Add the import**

Alongside the existing `resolve-terms` import in `app/api/admin/fees/[id]/generate/route.ts`:

```ts
import { filterOutInCharges } from '@/lib/fees/incharge-exemption';
```

- [ ] **Step 2: Capture the staff email during the existing stop lookup**

The route already fetches boarding stops for stop-wise structures, choosing the table by audience
(around line 184). **Extend that same query to also select `email`** rather than adding a second round
trip. Replace the boarding-stop block with:

```ts
    // Boarding stops for the cohort, and — for staff — their email, which the
    // in-charge exemption matches on. Fetched together in one pass rather than
    // two. Fetched here rather than inside resolveApplicablePeople because the
    // nightly in-charge cron shares that function and must not change.
    // Chunked to 150 ids: a larger .in() overflows the Supabase gateway with
    // HTTP 400, and an unchecked { data: null } would read as EMPTY — making
    // every person look stop-less AND exempting nobody.
    const stopByPerson = new Map<string, string | null>();
    const emailByPerson = new Map<string, string | null>();
    if (isStopWise) {
      const isStaff = fs.audience === 'staff';
      const stopTable = isStaff ? 'staff' : 'learners_profiles';
      const cols = isStaff ? 'id, transport_stop_id, email' : 'id, transport_stop_id';
      const ids = people.map((p) => p.person_id);
      const CHUNK_STOPS = 150;
      for (let i = 0; i < ids.length; i += CHUNK_STOPS) {
        const { data: rows, error: stopErr } = await supabase
          .from(stopTable)
          .select(cols)
          .in('id', ids.slice(i, i + CHUNK_STOPS));
        if (stopErr) {
          return NextResponse.json({ error: 'Failed to resolve boarding stops.' }, { status: 500 });
        }
        for (const r of (rows ?? []) as Array<{ id: string; transport_stop_id: string | null; email?: string | null }>) {
          stopByPerson.set(r.id, r.transport_stop_id);
          if (isStaff) emailByPerson.set(r.id, r.email ?? null);
        }
      }
    }
```

- [ ] **Step 3: Load active in-charge emails and apply the filter**

Immediately **after** the block from Step 2 and **before** the resolution loop, insert:

```ts
    // A bus in-charge holds a transport fee exemption in exchange for marking
    // their route's riders. Applied here as a cohort FILTER (a standing state),
    // not as an event — someone who takes the role simply leaves the cohort.
    let exemptInCharge = 0;
    if (isStopWise && fs.audience === 'staff') {
      const { data: assignRows, error: assignErr } = await supabase
        .from('tms_staff_route_assignment')
        .select('staff_email')
        .eq('is_active', true);
      if (assignErr) {
        // Fail loud: an unchecked failure here would exempt NOBODY and bill
        // every in-charge, which is the exact opposite of the policy.
        return NextResponse.json(
          { error: 'Failed to load bus in-charge assignments.' },
          { status: 500 }
        );
      }
      const emails = ((assignRows ?? []) as Array<{ staff_email: string | null }>)
        .map((r) => r.staff_email ?? '');
      const filtered = filterOutInCharges(
        people.map((p) => ({ ...p, email: emailByPerson.get(p.person_id) ?? null })),
        emails
      );
      exemptInCharge = filtered.exemptCount;
      people = filtered.kept;
    }
```

`people` is currently declared with `const`. Change that declaration to `let`:

```ts
    let people = await resolveApplicablePeople(supabase, fs);
```

- [ ] **Step 4: Report the exempt count in the preview**

In the `preview` object, add after `unresolvedByReason,`:

```ts
      exemptInCharge,
```

And include it in the generation-run note, alongside the existing note parts:

```ts
      if (exemptInCharge > 0) {
        noteParts.push(`${exemptInCharge} staff exempt (active bus in-charge)`);
      }
```

- [ ] **Step 5: Verify types and tests**

Run: `npx tsc --noEmit 2>&1 | grep "fees/\[id\]/generate"`
Expected: zero lines.

Run: `npx vitest run`
Expected: the merged-trunk count from Task 1 Step 6, plus Task 2's 8 tests. No test may break.

- [ ] **Step 6: Verify the cohort maths against the live DB**

Run via the Supabase MCP `execute_sql` tool — this is the number the dry run must reproduce:

```sql
select
  (select count(*) from staff where bus_required and is_active) as total_bus_staff,
  (select count(*) from tms_staff_route_assignment where is_active) as active_incharges,
  (select count(*) from staff s where s.bus_required and s.is_active
     and not exists (select 1 from tms_staff_route_assignment a
                     where a.is_active and lower(a.staff_email)=lower(s.email))) as billable;
```

Expected: `105 / 3 / 102`. The dry run in Task 5 must report `applicable 101`, `exemptInCharge 3`,
`unresolved 1` — 102 billable minus the one whose stop has no rate.

- [ ] **Step 7: Commit**

```bash
git add "app/api/admin/fees/[id]/generate/route.ts"
git commit -m "feat(fees): exempt active bus in-charges from staff transport fees

resolveApplicablePeople has no concept of in-charge status, so generating a
staff stop-wise structure billed all 105 including the 3 exempt in-charges.
The exemption is applied after it returns, not inside it -- that function is
shared with the nightly in-charge cron.

The staff email is captured during the existing boarding-stop lookup rather
than in a second round trip, and a failure loading assignments now fails loud:
silently exempting nobody would bill every in-charge.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Surface the exemption in the dry-run preview

Without this the operator sees "applicable 101" with no explanation of where the other 4 went.

**Files:**
- Modify: `app/(admin)/fees/fee-api.ts`
- Modify: `app/(admin)/fees/[id]/page.tsx`

**Interfaces:**
- Consumes: `preview.exemptInCharge` (Task 3)
- Produces: no new exports

- [ ] **Step 1: Widen the preview type**

In `app/(admin)/fees/fee-api.ts`, add to the `GeneratePreview` interface, next to `stopRateCount`:

```ts
  exemptInCharge?: number; // staff skipped because they hold an active bus in-charge role
```

- [ ] **Step 2: Render the stat**

In `app/(admin)/fees/[id]/page.tsx`, inside the stop-wise branch of the preview stats (which already
renders "Stops priced" and "Unresolved"), add a third:

```tsx
                        <Stat label="Exempt (in-charge)" value={preview.exemptInCharge ?? 0} />
```

- [ ] **Step 3: Explain the exemption below the stats**

Next to the existing unresolved-reason paragraph, add:

```tsx
{preview.feeMode === 'stop_wise' && (preview.exemptInCharge ?? 0) > 0 && (
  <p className="text-sm text-gray-600 dark:text-gray-300">
    {preview.exemptInCharge} staff are exempt because they hold an active bus in-charge role.
    They are not billed while they keep it.
  </p>
)}
```

- [ ] **Step 4: Verify types and tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "fees/\[id\]/page|fees/fee-api"`
Expected: zero lines.

Run: `npx vitest run`
Expected: unchanged from Task 3 Step 5.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/fees/fee-api.ts" "app/(admin)/fees/[id]/page.tsx"
git commit -m "feat(fees): show the in-charge exemption count in the dry run

Without it the operator sees a reduced applicable count with no explanation of
where those staff went.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Notify the 105 bus staff of the 25 July deadline

**Files:**
- Create: `app/api/admin/fees/notify-incharge-deadline/route.ts`

**Interfaces:**
- Consumes: `notifyProfile` from `lib/notifications/notify.ts` — signature: `notifyProfile(svc, { profileId, actorId, title, body, category?, url? }): Promise<void>` (never throws)
- Produces: `POST /api/admin/fees/notify-incharge-deadline` → `{ success, data: { notified, skipped } }`

**Verified facts you can rely on** (checked against the live DB on 2026-07-21):
- `staff.profile_id` is a `uuid` column and **all 105 active bus staff have it populated**, so every
  one of them is reachable. The `skipped` count should therefore equal only the existing in-charges (3).
- `logActivity`'s `entityId` is typed `?: string | number | null`, so passing `null` is valid.
- `notifyProfile` never throws — it logs and swallows — so one bad recipient cannot abort the run.

- [ ] **Step 1: Create the route**

Create `app/api/admin/fees/notify-incharge-deadline/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { notifyProfile } from '@/lib/notifications/notify';
import { logActivity } from '@/lib/activity/log';

const DEADLINE_LABEL = '25 July 2026';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * One-shot notice to every bus-using staff member: volunteer as bus in-charge
 * by the deadline, or the stop-wise transport fee applies.
 *
 * Deliberately a manual admin action, not a cron: it is sent once (plus a
 * reminder), and an accidental re-fire spams 105 real people.
 */
async function notify(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const supabase = createServiceRoleClient();

    const { data: staffRows, error: staffErr } = await supabase
      .from('staff')
      .select('id, email, profile_id')
      .eq('bus_required', true)
      .eq('is_active', true);
    if (staffErr) {
      return NextResponse.json({ error: 'Failed to load bus staff.' }, { status: 500 });
    }

    const { data: assignRows, error: assignErr } = await supabase
      .from('tms_staff_route_assignment')
      .select('staff_email')
      .eq('is_active', true);
    if (assignErr) {
      return NextResponse.json({ error: 'Failed to load in-charge assignments.' }, { status: 500 });
    }
    const already = new Set(
      ((assignRows ?? []) as Array<{ staff_email: string | null }>)
        .map((r) => String(r.staff_email ?? '').trim().toLowerCase())
        .filter(Boolean)
    );

    const title = 'Bus in-charge — action needed';
    const body =
      `Volunteer as a bus in-charge by ${DEADLINE_LABEL} to keep your transport fee exemption. ` +
      `If you have not taken the role by then, transport fees for 2026-2027 will apply, ` +
      `based on your boarding stop.`;

    let notified = 0;
    let skipped = 0;
    for (const s of (staffRows ?? []) as Array<{ id: string; email: string | null; profile_id: string | null }>) {
      const em = String(s.email ?? '').trim().toLowerCase();
      // Existing in-charges already hold the exemption — do not tell them to act.
      if (em && already.has(em)) { skipped++; continue; }
      if (!s.profile_id) { skipped++; continue; }
      await notifyProfile(supabase, {
        profileId: s.profile_id,
        actorId: auth.userId,
        title,
        body,
        category: 'general',
        url: '/boarding/in-charge',
      });
      notified++;
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fee_structure',
      entityId: null,
      entityLabel: 'Bus in-charge deadline notice',
      description: `Notified ${notified} bus staff of the ${DEADLINE_LABEL} in-charge deadline; ${skipped} skipped`,
      metadata: { notified, skipped, deadline: DEADLINE_LABEL },
    });

    return NextResponse.json({
      success: true,
      data: { notified, skipped },
      message: `Notified ${notified} staff; ${skipped} skipped (already in-charge or no login).`,
    });
  } catch (e) {
    console.error('In-charge deadline notice error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => notify(request, auth));
```

- [ ] **Step 2: Verify types and tests**

Run: `npx tsc --noEmit 2>&1 | grep "notify-incharge-deadline"`
Expected: zero lines.

Run: `npx vitest run`
Expected: unchanged from Task 4.

- [ ] **Step 3: Probe the route is auth-gated**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/admin/fees/notify-incharge-deadline
```

Expected: `307`, `401` or `500` (the auth chain rejects an unauthenticated call). A `404` means the
file is misplaced. **Do not start or restart a dev server to run this** — if port 3001 is not already
serving, skip the probe and say so.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/fees/notify-incharge-deadline/route.ts
git commit -m "feat(fees): notify bus staff of the in-charge deadline

One-shot admin action rather than a cron: it sends once, and an accidental
re-fire spams 105 real people. Existing in-charges are skipped -- they already
hold the exemption and have nothing to act on.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Full suite**

Run: `npx vitest run`
Expected: the merged-trunk baseline plus Task 2's 8 tests.

- [ ] **Protected structures untouched**

Re-run Task 1 Step 7's query. All three must still show `updated_at 2026-06-19` and ledger rows
2 / 1232 / 718.

- [ ] **Dry run — the gate before anything is billed** *(human, authenticated browser)*

Open the **Transport Fees 2026-2027 (Staff - All Colleges)** structure and press **Dry run**.

Expected: `applicable 101`, `exemptInCharge 3`, `unresolved 1`, `toGeneratePairs 202` (101 × 2 terms).

Any other split means the filter is wrong — **do not generate**. In particular `exemptInCharge 0`
means the email matching failed, and generating would bill all three in-charges.

- [ ] **Fix the one bad boarding stop** *(human)*

`ranjithkumar.s@jkkn.ac.in` has `transport_stop_id` pointing at **"COLLEGE"** (route 16 terminus).
Correct it to his real boarding stop. **Do not price the COLLEGE stop** — it is a destination, and
pricing it would charge everyone whose record points there. After the fix, re-run the dry run; it
should read `applicable 102`, `unresolved 0`.

- [ ] **Send the notification** *(human, on or before 21 July)*

`POST /api/admin/fees/notify-incharge-deadline`. Expect ~102 notified, ~3 skipped.

- [ ] **On 25 July: re-run the dry run, then Generate** *(human)*

Re-run the dry run **immediately before generating** — volunteers between the notice and the deadline
shrink the billable cohort, and a stale count would bill someone who has since taken the role.
