# Attendance Scan Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every scan records attendance — including unbooked and fee-unpaid learners — and the Attendance list shows Booked / Not booked / Fee unpaid.

**Architecture:** The scan API stops asking for a confirm tap and always writes the mark. A new set-based Postgres function returns fee status for a whole bus in one call; the roster API attaches it to each row, and the page adds a fee column, filter and tile.

**Tech Stack:** Supabase Postgres (plpgsql), Next.js 16 route handlers, React + TanStack Table, vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-attendance-scan-tracking-design.md`

## Global Constraints

- Worktree `.worktrees/attendance-scan-tracking`, branch `feat/attendance-scan-tracking` (from origin/main `2588661`).
- A scan NEVER fails because of fees, and fee failures never block a mark.
- Fee logic must match `tms_transport_access_for_learner` exactly; prove it by dry run before applying.
- New SQL function: `SECURITY DEFINER`, `search_path = public`, EXECUTE revoked from `public, anon, authenticated`, granted to `service_role`.
- Fail closed on fee state: unknown unless positively established; never render "paid" from a failed read.
- Verify: vitest, tsc filtered to touched files, and `set -a; . ../../.env; set +a; node node_modules/next/dist/bin/next dev`-free build via `node node_modules/next/dist/bin/next build`.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Bulk fee status — SQL function + dry run

**Files:**
- Create: `supabase/migrations/20260916090000_tms_transport_fee_status_bulk.sql`

**Interfaces — Produces:** `public.tms_transport_fee_status_bulk(p_learner_ids uuid[]) returns table(learner_id uuid, allowed boolean, reason text, overdue_count integer, total_owed numeric, unpaid_amount numeric, term1_paid boolean, has_bills boolean)`.

- [ ] **Step 1: Write the migration**

```sql
-- Fee status for MANY learners in one call: the set-based twin of
-- tms_transport_access_for_learner (same bills/lines rules), for the boarding
-- Attendance roster, which needs ~1,800 learners at once.
create or replace function public.tms_transport_fee_status_bulk(p_learner_ids uuid[])
returns table (
  learner_id    uuid,
  allowed       boolean,
  reason        text,
  overdue_count integer,
  total_owed    numeric,
  unpaid_amount numeric,
  term1_paid    boolean,
  has_bills     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with ids as (
    select lp.id, coalesce(lp.bus_required, false) as bus_required
      from learners_profiles lp
     where lp.id = any(p_learner_ids)
  ),
  yr as (select id from tms_transport_year where is_current = true limit 1),
  bills as (
    select fb.person_id as lid, b.id, b.final_amount, b.balance_amount, b.due_date, b.status
      from tms_fee_bill fb
      join billing_student_bills b on b.id = fb.billing_student_bill_id
      join ids i on i.id = fb.person_id and i.bus_required
     where fb.person_type = 'learner'
       and fb.transport_year_id = (select id from yr)
       and fb.status = 'generated'
       and b.status is distinct from 'cancelled'
  ),
  lines as (
    -- Instalments when the bill has them …
    select bl.lid, st.sequence_no::int as line_no, st.outstanding as balance,
           st.due_date, st.is_settled as paid,
           (st.due_date < current_date and not st.is_settled) as overdue
      from bills bl
      cross join lateral billing_bill_instalment_state(bl.id) st
     where exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
    union all
    -- … else the bill itself.
    select bl.lid, 1, bl.balance_amount, bl.due_date,
           (bl.status = 'paid'),
           (bl.due_date < current_date and bl.status in ('unpaid','partially_paid','overdue'))
      from bills bl
     where not exists (select 1 from billing_bill_instalments i where i.bill_id = bl.id)
  ),
  -- Term 1 = the first line by (due_date, line_no). Every line tied at that key
  -- must be settled: the key is NOT unique and a plain limit 1 can pick the paid
  -- row of a tie, clearing the gate for someone who still owes the other.
  min_key as (
    select distinct on (lid) lid, due_date as d, line_no as n
      from lines order by lid, due_date, line_no
  ),
  term1 as (
    select l.lid, bool_and(coalesce(l.paid, false)) as paid
      from lines l
      join min_key k on k.lid = l.lid
       and l.due_date is not distinct from k.d
       and l.line_no  is not distinct from k.n
     group by l.lid
  ),
  agg as (
    select l.lid,
           count(*) filter (where l.overdue)::int as overdue_count,
           coalesce(sum(l.balance) filter (where l.overdue), 0) as total_owed,
           coalesce(sum(l.balance) filter (where not coalesce(l.paid, false)), 0) as unpaid_amount
      from lines l group by l.lid
  )
  select i.id,
         case
           when not i.bus_required then true
           when (select count(*) from yr) = 0 then true
           when a.lid is null then false                    -- billed nothing: term1_not_billed
           when not coalesce(t.paid, false) then false
           when coalesce(a.overdue_count, 0) > 0 then false
           else true
         end,
         case
           when not i.bus_required then 'no_transport_obligation'
           when (select count(*) from yr) = 0 then 'no_current_transport_year'
           when a.lid is null then 'term1_not_billed'
           when not coalesce(t.paid, false) then 'term1_unpaid'
           when coalesce(a.overdue_count, 0) > 0 then 'overdue'
           else 'current'
         end,
         coalesce(a.overdue_count, 0),
         coalesce(a.total_owed, 0),
         coalesce(a.unpaid_amount, 0),
         coalesce(t.paid, false),
         (a.lid is not null)
    from ids i
    left join agg a on a.lid = i.id
    left join term1 t on t.lid = i.id;
$$;

revoke execute on function public.tms_transport_fee_status_bulk(uuid[]) from public, anon, authenticated;
grant execute on function public.tms_transport_fee_status_bulk(uuid[]) to service_role;
```

- [ ] **Step 2: Dry run + parity against the single-learner RPC** (rolled back; do NOT apply first)

```sql
do $outer$
declare v_n int; v_mismatch int; v_ms numeric; v_t timestamptz;
begin
  execute $m$ <the whole create-or-replace function above, without the revoke/grant> $m$;
  create temp table s on commit drop as
    select id from learners_profiles
     where transport_route_id is not null and bus_required
       and lifecycle_status::text in ('active','admitted','account')
     limit 250;
  v_t := clock_timestamp();
  create temp table b on commit drop as
    select * from public.tms_transport_fee_status_bulk(array(select id from s));
  v_ms := extract(milliseconds from clock_timestamp() - v_t);
  select count(*) into v_n from b;
  select count(*) into v_mismatch
    from s
    join b on b.learner_id = s.id
    join lateral public.tms_transport_access_for_learner(s.id) r on true
   where (r->>'allowed')::boolean is distinct from b.allowed
      or coalesce((r->>'overdue_count')::int,0) is distinct from b.overdue_count
      or round(coalesce((r->>'total_owed')::numeric,0),2) is distinct from round(b.total_owed,2)
      or (r->>'reason') is distinct from b.reason;
  raise exception 'TESTRESULT: rows=% mismatches=% ms=%', v_n, v_mismatch, round(v_ms);
end $outer$;
```

Expected: `rows=250 mismatches=0`, ms comfortably under 500. **Any mismatch stops the task** — fix the SQL, re-run.

- [ ] **Step 3: Apply** via `apply_migration` (name `tms_transport_fee_status_bulk`), then verify:

```sql
select has_function_privilege('anon','public.tms_transport_fee_status_bulk(uuid[])','execute') anon_exec,
       has_function_privilege('service_role','public.tms_transport_fee_status_bulk(uuid[])','execute') svc_exec;
```
Expected `anon_exec=false`, `svc_exec=true`.

- [ ] **Step 4: Commit** `git add supabase/migrations/20260916090000_tms_transport_fee_status_bulk.sql && git commit -m "feat(fees): bulk transport fee status for the boarding roster"`

---

### Task 2: Fee loader + pure badge

**Files:**
- Create: `lib/boarding/fee-roster.ts`
- Test: `lib/boarding/fee-roster.test.ts`

**Interfaces — Produces:** `RosterFee { state: 'paid'|'unpaid'|'none'|'unknown'; owed: number | null }`, `rosterFeeBadge(row): RosterFee`, `FEE_STATE_LABEL`, `loadRosterFees(svc, ids): Promise<Map<string, RosterFee>>`.

- [ ] **Step 1: Failing test**

```ts
// lib/boarding/fee-roster.test.ts
import { describe, it, expect } from 'vitest';
import { rosterFeeBadge } from './fee-roster';

const row = (over: Partial<Parameters<typeof rosterFeeBadge>[0]> = {}) => ({
  learner_id: 'L1', allowed: true, reason: 'current', overdue_count: 0,
  total_owed: 0, unpaid_amount: 0, term1_paid: true, has_bills: true, ...over,
});

describe('rosterFeeBadge', () => {
  it('is paid when everything billed is settled', () => {
    expect(rosterFeeBadge(row())).toEqual({ state: 'paid', owed: 0 });
  });
  it('is unpaid with the amount when something is owed', () => {
    expect(rosterFeeBadge(row({ allowed: false, reason: 'overdue', overdue_count: 1, total_owed: 2500, unpaid_amount: 2500 })))
      .toEqual({ state: 'unpaid', owed: 2500 });
  });
  it('is unpaid when term 1 is unpaid even before the due date', () => {
    expect(rosterFeeBadge(row({ allowed: false, reason: 'term1_unpaid', term1_paid: false, unpaid_amount: 5000 })))
      .toEqual({ state: 'unpaid', owed: 5000 });
  });
  it('says no bill rather than unpaid when nothing is billed', () => {
    expect(rosterFeeBadge(row({ allowed: false, reason: 'term1_not_billed', term1_paid: false, has_bills: false })))
      .toEqual({ state: 'none', owed: null });
    expect(rosterFeeBadge(row({ allowed: true, reason: 'no_transport_obligation', has_bills: false })))
      .toEqual({ state: 'none', owed: null });
  });
  it('is unknown for a missing row', () => {
    expect(rosterFeeBadge(undefined)).toEqual({ state: 'unknown', owed: null });
  });
});
```

- [ ] **Step 2:** `npx vitest run lib/boarding/fee-roster.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// lib/boarding/fee-roster.ts
/**
 * Transport fee status for a whole bus, for the boarding Attendance roster.
 *
 * Display only: it never decides whether attendance is marked (see
 * lib/boarding/fee-badge.ts for the same rule at the scanner). It FAILS CLOSED —
 * a missing or failed read reads as 'unknown', never as 'paid', because on a
 * money column a wrong "paid" looks exactly like a right one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BulkFeeRow {
  learner_id: string;
  allowed: boolean;
  reason: string | null;
  overdue_count: number;
  total_owed: number;
  unpaid_amount: number;
  term1_paid: boolean;
  has_bills: boolean;
}

export type FeeState = 'paid' | 'unpaid' | 'none' | 'unknown';
export interface RosterFee { state: FeeState; owed: number | null }

export const FEE_STATE_LABEL: Record<FeeState, string> = {
  paid: 'Paid', unpaid: 'Unpaid', none: 'No bill', unknown: '—',
};

/** Ids per RPC call. The array argument has no PostgREST `.in()` limit, but a
 *  1,800-id payload is still worth splitting. */
const FEE_CHUNK = 500;

export function rosterFeeBadge(row: BulkFeeRow | undefined | null): RosterFee {
  if (!row) return { state: 'unknown', owed: null };
  if (!row.has_bills) return { state: 'none', owed: null };
  const owed = Number.isFinite(row.unpaid_amount) ? Number(row.unpaid_amount) : null;
  if (!row.term1_paid || row.overdue_count > 0 || (owed ?? 0) > 0) {
    return { state: 'unpaid', owed };
  }
  return { state: 'paid', owed: 0 };
}

export async function loadRosterFees(
  svc: SupabaseClient,
  learnerIds: string[],
): Promise<Map<string, RosterFee>> {
  const out = new Map<string, RosterFee>();
  for (let i = 0; i < learnerIds.length; i += FEE_CHUNK) {
    const chunk = learnerIds.slice(i, i + FEE_CHUNK);
    const { data, error } = await svc.rpc('tms_transport_fee_status_bulk', { p_learner_ids: chunk });
    if (error) {
      // Non-fatal by design: the roster is what staff mark from, and a fee
      // lookup must never empty it. Missing rows render as '—'.
      console.error('[boarding/fee-roster] bulk fee read failed:', error.code, error.message);
      continue;
    }
    for (const r of (data ?? []) as BulkFeeRow[]) out.set(r.learner_id, rosterFeeBadge(r));
  }
  return out;
}
```

- [ ] **Step 4:** `npx vitest run lib/boarding/fee-roster.test.ts` → PASS.
- [ ] **Step 5: Commit** `git add lib/boarding/fee-roster.ts lib/boarding/fee-roster.test.ts && git commit -m "feat(boarding): bulk fee status loader for the attendance roster"`

---

### Task 3: Roster row carries fee state

**Files:**
- Modify: `lib/booking/roster.ts` (`RosterRow`, `buildRosterRows`)
- Modify: `app/api/boarding/attendance/roster/route.ts`
- Test: `lib/booking/roster.test.ts`

- [ ] **Step 1: Failing test** — append to `lib/booking/roster.test.ts`:

```ts
  it('carries fee state through to the row, and unknown when absent', () => {
    const riders = [{ learner_id: 'a', name: 'A', roll: '1', stop_id: 's1' }];
    const stops = [{ id: 's1', name: 'Stop', time: null, order: 1 }];
    const viewer = { actorId: 'u1', isOverrideHolder: false, isSuperAdmin: false };
    const fees = new Map([['a', { state: 'unpaid' as const, owed: 2500 }]]);
    const withFee = buildRosterRows(riders, { id: 'R1', route_number: '5' }, stops, new Map(), viewer, undefined, fees);
    expect(withFee[0].fee).toEqual({ state: 'unpaid', owed: 2500 });
    const without = buildRosterRows(riders, { id: 'R1', route_number: '5' }, stops, new Map(), viewer);
    expect(without[0].fee).toEqual({ state: 'unknown', owed: null });
  });
```

- [ ] **Step 2:** `npx vitest run lib/booking/roster.test.ts` → FAIL.

- [ ] **Step 3: Implement**

In `lib/booking/roster.ts`, import the type and extend `RosterRow`:
```ts
import type { RosterFee } from '@/lib/boarding/fee-roster';
```
```ts
  /**
   * Transport fee position, for the Fee column and filter. Display only —
   * fees never gate marking or scanning. 'unknown' when the lookup failed or
   * the row came from an older offline cache.
   */
  fee: RosterFee;
```
`buildRosterRows` gains a 7th parameter `feeByLearner?: Map<string, RosterFee>` and each row sets:
```ts
      fee: feeByLearner?.get(rider.learner_id) ?? { state: 'unknown', owed: null },
```

In the roster route, after `rows` is built and before the counts:
```ts
    // Fee status for everyone on the produced rows, in ONE call per 500 ids.
    // Loaded here rather than per row: 1,800 single-learner RPCs would take
    // minutes, the set-based function takes ~60ms for the whole fleet.
    const feeByLearner = await loadRosterFees(svc, [...new Set(rows.map((r) => r.learner_id))]);
    for (const r of rows) r.fee = feeByLearner.get(r.learner_id) ?? { state: 'unknown', owed: null };
```
(import `loadRosterFees` from `@/lib/boarding/fee-roster`), and add to `counts`:
```ts
      feeUnpaid: rows.filter((r) => r.fee.state === 'unpaid').length,
```
Also add `feeUnpaid: 0` to the `empty` response's counts.

- [ ] **Step 4:** `npx vitest run lib/booking` → PASS; `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "booking/roster|attendance/roster/route"` → no output.
- [ ] **Step 5: Commit** `git add lib/booking/roster.ts lib/booking/roster.test.ts app/api/boarding/attendance/roster/route.ts && git commit -m "feat(boarding): attach transport fee state to attendance roster rows"`

---

### Task 4: Fee column, filter, tile and CSV

**Files:**
- Modify: `app/boarding/attendance/columns.tsx`
- Modify: `app/boarding/attendance/page.tsx`

- [ ] **Step 1: Column** — in `columns.tsx`, add after the `ticket` column:

```tsx
    {
      id: 'fee',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fees" />,
      accessorFn: (r) => r.fee?.state ?? 'unknown',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => <FeeBadge fee={row.original.fee} />,
    },
```
and the badge component next to `TicketBadge`:
```tsx
/**
 * The learner's transport fee position. Display only — it never gates marking
 * or scanning. 'unknown' (a failed read, or an older offline copy of the
 * roster) prints an em dash: never claim someone has paid without knowing.
 */
function FeeBadge({ fee }: { fee: RosterRow['fee'] }) {
  const state = fee?.state ?? 'unknown';
  if (state === 'paid')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        <IndianRupee className="h-3 w-3" /> Paid
      </span>
    );
  if (state === 'unpaid')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <IndianRupee className="h-3 w-3" />
        {fee?.owed ? `Unpaid ₹${new Intl.NumberFormat('en-IN').format(fee.owed)}` : 'Unpaid'}
      </span>
    );
  if (state === 'none') return <span className="text-xs text-gray-400">No bill</span>;
  return <span className="text-xs text-gray-400">—</span>;
}
```
Add `IndianRupee` to the `lucide-react` import.

- [ ] **Step 2: Page** — in `page.tsx`:
  - `RosterResponse.counts` gains `feeUnpaid: number`; both `counts` fallbacks gain `feeUnpaid: 0`.
  - filters gain:
```ts
    { columnId: 'fee', title: 'Fees', options: [{ label: 'Unpaid', value: 'unpaid' }, { label: 'Paid', value: 'paid' }, { label: 'No bill', value: 'none' }] },
```
  - both tile groups gain, before the last tile:
```tsx
              <Tile label="Fee unpaid" value={counts.feeUnpaid} tone="red" icon={<IndianRupee className="h-4 w-4" />} />
```
    and the grid class becomes `sm:grid-cols-6`; add `IndianRupee` to the icon import.
  - CSV export: header gains `'Fee status', 'Amount owed'`, and each line gains
```ts
      r.fee?.state ?? 'unknown', r.fee?.owed ?? '',
```
    placed after the `Status` / `Method` columns and before `Marked At` — keep header and row order identical.

- [ ] **Step 3: Verify** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "boarding/attendance/(page|columns)"` → no output.
- [ ] **Step 4: Commit** `git add app/boarding/attendance/columns.tsx app/boarding/attendance/page.tsx && git commit -m "feat(boarding): fee column, filter and tile on the attendance list"`

---

### Task 5: Every scan records attendance

**Files:**
- Modify: `app/api/boarding/scan/route.ts:197-222`

- [ ] **Step 1: Replace the booking gate**

```ts
    // ── Booking state: recorded, never a gate ──
    // This used to answer `not_booked` and write NOTHING until staff tapped
    // "Add as walk-up". On a moving bus that second tap is often not made, so
    // the learners who most need accounting for — the ones who boarded without
    // booking — were the ones left unmarked. A scan is physical proof the
    // learner boarded, so it now always records, flagged is_walk_up.
    //
    // Over capacity stays a WARNING on the response, never a refusal.
    const booked = await hasBookingForDate(svc, learner.id, today);
    const isWalkUp = !booked;
    const overCapacity = isWalkUp && (await seatsRemaining(svc, learner.transport_route_id, today)) <= 0;
```
(`body.walkUp` is no longer read; leave the field in the body type for older clients.)

- [ ] **Step 2: Verify** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "boarding/scan/route"` → no output. Confirm by reading the file that `reason: 'not_booked'` no longer appears in it.
- [ ] **Step 3: Commit** `git add app/api/boarding/scan/route.ts && git commit -m "feat(boarding): record attendance on every scan, booked or not"`

---

### Task 6: Scan dialog — no confirm tap, louder fee warning

**Files:**
- Modify: `components/boarding/scan-dialog.tsx`

- [ ] **Step 1: Offline path** — delete the `local.kind === 'resolved' && !local.booked && !walkUp` branch in `submitOffline`, and queue with the roster's booking state:
```ts
    await o.queueScan({
      learnerId: local.kind === 'resolved' ? local.learnerId : null,
      token,
      // An unbooked rider is a walk-up: the same rule the server now applies.
      walkUp: walkUp || (local.kind === 'resolved' && !local.booked),
      name: local.kind === 'resolved' ? local.name : null,
      verified: local.kind === 'resolved' && local.verified,
      direction,
    });
```
and set `walkUp: walkUp || (local.kind === 'resolved' && !local.booked)` in the `setResult` that follows.

- [ ] **Step 2: Result panel** — delete the whole `result.reason === 'not_booked'` branch (the amber panel and its "Add as walk-up" button), leaving `result.ok ? (…) : (<p className="text-red-700 …">✗ {result.error}</p>)`. In the OK panel, replace the `· walk-up` suffix with an explicit line under the learner block:
```tsx
                {result.walkUp && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Travelled without booking — recorded.
                  </p>
                )}
```
- [ ] **Step 3: Red fee warning** — in `FeeBadgeView`, when the badge tone is `overdue` or `due`, render the full-width warning instead of the pill:
```tsx
  const unpaid = badge.tone === 'overdue' || badge.tone === 'due';
  if (unpaid) {
    return (
      <div className="rounded-md border-2 border-red-500 bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/40 dark:text-red-200">
        <p className="text-sm font-semibold">✗ Fees not paid</p>
        {badge.detail && <p className="mt-0.5 break-words text-xs">{badge.detail}</p>}
      </div>
    );
  }
```
keeping the existing pill for the other tones.

- [ ] **Step 4:** Remove the now-unused `seatsRemaining` / `not_booked` members from `ScanResult` only if tsc reports them unused; `reason` keeps `'window_closed'`.
- [ ] **Step 5: Verify** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "scan-dialog"` → no output; `npx vitest run lib/boarding` → PASS.
- [ ] **Step 6: Commit** `git add components/boarding/scan-dialog.tsx && git commit -m "feat(boarding): scan records unbooked riders without a confirm tap"`

---

### Task 7: Verify and ship

- [ ] `npx vitest run` → all green (report the count).
- [ ] `set -a; . ../../.env; set +a; node node_modules/next/dist/bin/next build` → exit 0.
- [ ] Live sanity: `select count(*) from tms_transport_fee_status_bulk(array(select id from learners_profiles where bus_required and transport_route_id is not null limit 5));` → 5 rows.
- [ ] **Ask the user**, then `git fetch origin && git log --oneline origin/main..HEAD && git merge-base --is-ancestor origin/main HEAD` (rebase if false) and `git push origin HEAD:main`.
- [ ] User browser smoke test: scan an unbooked learner → "Marked present · Travelled without booking — recorded", no second tap; scan an unpaid learner → recorded, red "Fees not paid" panel; the list shows the Fee column, the Fees filter and the Fee unpaid tile; and the CSV export carries both fee columns.
