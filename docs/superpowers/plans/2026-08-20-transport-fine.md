# Transport Fine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin select learners on Bill Management and raise a manual fine priced from that learner's boarding stop, as its own payable bill.

**Architecture:** Two new TMS-owned tables — `tms_fine_stop_rate` (per transport year: stop → fine amount) and `tms_fee_fine` (the fine ledger). Each fine writes a **separate** `billing_student_bills` row (MyJKKN's shared money table, category "Transport Fee") plus a `tms_fee_fine` ledger row, money-row-first with a compensating delete. Fines deliberately do **not** touch `tms_fee_bill`, which keeps the portal lockout RPC and every existing Bill Management KPI unchanged.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role client), TanStack Query + TanStack Table, Tailwind (with dark mode), vitest, xlsx.

**Spec:** `docs/superpowers/specs/2026-08-20-transport-fine-design.md` — read it before Task 1.

**Branch:** `feat/transport-fine` (already created; the spec is committed there as `4e9cc12`).

## Global Constraints

- **Modern route pattern only.** Every API route is `withAuth` + `createServiceRoleClient()` + a local `requirePerm(auth, TMS_PERMISSIONS.X)`. Never `DatabaseService`, never an unprefixed table. Responses are `{ success: true, data }` or `{ error }` with a real status code.
- **`withAuth` drops Next's route context.** Any `[id]` must be parsed from `request.nextUrl.pathname`, exactly as `app/api/admin/fees/[id]/stop-rates/route.ts` does.
- **Permissions:** reads `TMS_PERMISSIONS.FEES_VIEW` (`tms.fees.view`), writes `TMS_PERMISSIONS.FEES_EDIT` (`tms.fees.edit`). No new permission is seeded.
- **Never leave a Supabase `{ data }` unchecked.** Always destructure `{ data, error }` and fail loudly. A swallowed error on a money screen reads as "nothing to bill".
- **Chunk any `.in()` to ≤150 ids.** ~500+ UUIDs in one `.in()` returns HTTP 400 and silently empties the result.
- **Money writes are money-row-first, ledger-second, with a compensating delete** if the ledger insert fails. Copy the shape in `lib/fees/generate.ts:610-660`.
- **`npm run lint` is broken** in this repo (circular ESLint config) — do not run it. Verify with vitest + a path-scoped type check.
- **`npx tsc --noEmit` is red project-wide** (~540 chronic pre-existing errors, not gated by `next build`). Only new errors in files you touched count as regressions — grep the output for your paths.
- **Currency is always `₹` via the shared `inr()` helper**; dates render `en-IN` `dd MMM yyyy`.
- **Every UI class needs its dark variant** (`text-gray-900 dark:text-gray-100` etc.) — this app ships dark mode.
- **No stray files in the worktree.** Scratch work goes in the session scratchpad, never in the repo.
- Tests live under `lib/` (vitest `include: ['lib/**/*.test.ts', 'proxy.test.ts']`); `@/` resolves under vitest.
- Run tests with `npx vitest run lib/fines`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260820160000_tms_transport_fine.sql` | both tables + indexes + RLS |
| `lib/fines/fields.ts` | request-body whitelists/normalisers for both endpoints |
| `lib/fines/resolve.ts` | pure stop → fine-amount resolution and skip reasons |
| `lib/fines/create.ts` | the write engine: preview + create, both over one candidate loader |
| `lib/fines/list.ts` | read layer for the Fines tab (ledger ⋈ money row) |
| `lib/fines/fine-template.ts` | XLSX header adapter over `lib/fees/stop-template.ts` |
| `app/api/admin/fees/fine-rates/route.ts` | GET list / PUT bulk upsert of the fine sheet |
| `app/api/admin/fees/fine-rates/template/route.ts` | XLSX download |
| `app/api/admin/fees/fine-rates/import/route.ts` | XLSX upload (all-or-nothing) |
| `app/api/admin/fines/route.ts` | GET fines for a year / POST create |
| `app/api/admin/fines/preview/route.ts` | POST resolve-only, no writes |
| `app/api/admin/fines/[id]/cancel/route.ts` | POST waive |
| `app/(admin)/fees/fine-rates/page.tsx` | the Fine Rates screen |
| `app/(admin)/fees/fine-rates/fine-rate-columns.tsx` | its table columns |
| `app/(admin)/bill-management/fine-dialog.tsx` | Generate Fine dialog |
| `app/(admin)/bill-management/fine-columns.tsx` | Fines tab columns |
| `app/(admin)/bill-management/fines-api.ts` | client fetchers for all fine endpoints |

**Modified:**

| File | Change |
|---|---|
| `lib/activity/log.ts:11-14` | add `'cancel'` to `ActivityAction` |
| `app/(admin)/bill-management/page.tsx` | Generate Fine toolbar action, Fines tab, fines KPI |
| `app/(admin)/fees/page.tsx` | "Fine Rates" link button in the header |

`lib/fees/*` is **not** modified. The fine path reuses `lib/fees/stop-template.ts` through an adapter rather than editing it, so the existing fee tests stay untouched.

---

### Task 1: Migration — the two fine tables

**Files:**
- Create: `supabase/migrations/20260820160000_tms_transport_fine.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `public.tms_fine_stop_rate` and `public.tms_fee_fine` with the columns every later task writes.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260820160000_tms_transport_fine.sql`:

```sql
-- Manual, stop-wise transport FINES.
--
-- Two tables, and one deliberate absence: fines do NOT go into tms_fee_bill.
--   1. tms_fee_bill carries UNIQUE (fee_structure_id, person_id, term_no,
--      transport_year_id) — repeat fines for one learner in one year cannot
--      exist there without inventing fake term numbers.
--   2. tms_student_transport_access (SECURITY DEFINER, live) counts every
--      tms_fee_bill row with status='generated' and a past due_date as overdue,
--      and reads term_no=1 to decide term1_paid. A fine in that table would lock
--      learners out of the student portal and could corrupt the Term-1 gate.
-- Keeping fines in their own ledger means that RPC needs no change at all.

-- 1. The fine sheet: one amount per stop per TRANSPORT YEAR (not per fee
--    structure) — every learner has a stop regardless of which structure bills
--    them, so one sheet prices flat, tiered and stop_wise cohorts alike.
create table if not exists public.tms_fine_stop_rate (
  id                uuid primary key default gen_random_uuid(),
  transport_year_id uuid not null references public.tms_transport_year(id) on delete cascade,
  stop_id           uuid not null references public.tms_route_stop(id)     on delete cascade,
  fine_amount       numeric(12,2) not null check (fine_amount >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  constraint tms_fine_stop_rate_unique unique (transport_year_id, stop_id)
);

create index if not exists idx_tms_fine_stop_rate_year
  on public.tms_fine_stop_rate (transport_year_id);

-- 2. The fine ledger. stop_id/route_id are SNAPSHOTS: a learner who changes
--    stop later must not retroactively change what an issued fine was priced
--    from. source_bill_id is provenance only (which Bill Management row was
--    ticked) and is ON DELETE SET NULL so fee-bill cleanup can never
--    cascade-delete money history.
--
--    status holds only what TMS decides: generated | cancelled. Whether a fine
--    is PAID is owned by the money row (billing_student_bills), because
--    collection happens in MyJKKN and TMS never observes the payment event.
--    A second 'paid' flag here would be a source of truth nothing keeps in sync.
create table if not exists public.tms_fee_fine (
  id                      uuid primary key default gen_random_uuid(),
  transport_year_id       uuid not null references public.tms_transport_year(id),
  person_id               uuid not null,
  person_type             text not null default 'learner'
                            check (person_type = 'learner'),
  stop_id                 uuid references public.tms_route_stop(id) on delete set null,
  route_id                uuid references public.tms_route(id)      on delete set null,
  fine_amount             numeric(12,2) not null check (fine_amount > 0),
  due_date                date not null,
  reason                  text not null,
  source_bill_id          uuid references public.tms_fee_bill(id) on delete set null,
  billing_student_bill_id uuid references public.billing_student_bills(id) on delete cascade,
  status                  text not null default 'generated'
                            check (status in ('generated', 'cancelled')),
  idempotency_key         text not null,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  cancel_reason           text,
  constraint tms_fee_fine_idem_unique unique (idempotency_key)
);

create index if not exists idx_tms_fee_fine_year_person
  on public.tms_fee_fine (transport_year_id, person_id);
create index if not exists idx_tms_fee_fine_year_status
  on public.tms_fee_fine (transport_year_id, status);

-- RLS enabled with NO policies: deny-all for anon/authenticated, service-role
-- bypasses. Matches every sibling tms_fee_* table.
alter table public.tms_fine_stop_rate enable row level security;
alter table public.tms_fee_fine       enable row level security;

comment on table public.tms_fine_stop_rate is
  'Per-boarding-stop fine amount for one transport year. Priced independently of the fee stop rates.';
comment on table public.tms_fee_fine is
  'Manual transport fine ledger. Deliberately separate from tms_fee_bill so fines cannot affect the portal access gate or the fee reconciliation invariant.';
```

- [ ] **Step 2: Apply it to the database**

Apply via the Supabase MCP `apply_migration` tool with name `tms_transport_fine` and the SQL above (the agent has write access to the real project `kvizhngldtiuufknvehv`). If applying by CLI instead: `npx supabase db push`.

- [ ] **Step 3: Verify the tables exist with the right shape**

Run this SQL and read the output:

```sql
select table_name, count(*) as columns
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tms_fine_stop_rate', 'tms_fee_fine')
group by table_name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.tms_fee_fine'::regclass, 'public.tms_fine_stop_rate'::regclass)
order by conname;

select relname, relrowsecurity
from pg_class
where relname in ('tms_fine_stop_rate', 'tms_fee_fine');
```

Expected: `tms_fine_stop_rate` 8 columns, `tms_fee_fine` 18 columns; `tms_fee_fine_idem_unique` and `tms_fine_stop_rate_unique` present; `relrowsecurity = true` for both.

- [ ] **Step 4: Prove the fine ledger is invisible to the access gate**

Run:

```sql
select pg_get_functiondef(p.oid) like '%tms_fee_fine%' as gate_reads_fines
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tms_student_transport_access';
```

Expected: `gate_reads_fines = false`. This is the plan's headline safety property; if it is ever true, stop and re-read the spec.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820160000_tms_transport_fine.sql
git commit -m "feat(fines): add tms_fine_stop_rate and tms_fee_fine tables"
```

---

### Task 2: Field whitelists

**Files:**
- Create: `lib/fines/fields.ts`
- Test: `lib/fines/fields.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseFineRatesBody(raw: unknown): { ok: true; year: string; rates: FineRateInput[] } | { ok: false; error: string }` where `FineRateInput = { stop_id: string; fine_amount: number | null }`
  - `parseCreateFineBody(raw: unknown): { ok: true; value: CreateFineBody } | { ok: false; error: string }` where
    `CreateFineBody = { transport_year_id: string; person_ids: string[]; due_date: string; reason: string; notify: boolean; idempotency_key: string }`

- [ ] **Step 1: Write the failing test**

Create `lib/fines/fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFineRatesBody, parseCreateFineBody } from './fields';

const YEAR = '11111111-1111-1111-1111-111111111111';
const STOP = '22222222-2222-2222-2222-222222222222';
const PERSON = '33333333-3333-3333-3333-333333333333';

describe('parseFineRatesBody', () => {
  it('accepts a valid sheet and coerces numeric strings', () => {
    const out = parseFineRatesBody({ year: YEAR, rates: [{ stop_id: STOP, fine_amount: '500' }] });
    expect(out).toEqual({ ok: true, year: YEAR, rates: [{ stop_id: STOP, fine_amount: 500 }] });
  });

  it('treats a blank amount as a clear, not a zero', () => {
    const out = parseFineRatesBody({ year: YEAR, rates: [{ stop_id: STOP, fine_amount: '' }] });
    expect(out).toEqual({ ok: true, year: YEAR, rates: [{ stop_id: STOP, fine_amount: null }] });
  });

  it('rejects a negative amount', () => {
    const out = parseFineRatesBody({ year: YEAR, rates: [{ stop_id: STOP, fine_amount: -1 }] });
    expect(out.ok).toBe(false);
  });

  it('rejects a missing year', () => {
    expect(parseFineRatesBody({ rates: [] }).ok).toBe(false);
  });

  it('ignores keys that are not on the whitelist', () => {
    const out = parseFineRatesBody({
      year: YEAR,
      rates: [{ stop_id: STOP, fine_amount: 5, created_by: 'hacker' }],
    });
    expect(out).toEqual({ ok: true, year: YEAR, rates: [{ stop_id: STOP, fine_amount: 5 }] });
  });
});

describe('parseCreateFineBody', () => {
  const good = {
    transport_year_id: YEAR,
    person_ids: [PERSON],
    due_date: '2026-09-04',
    reason: 'Late payment',
    notify: true,
    idempotency_key: 'abc-123',
  };

  it('accepts a valid body', () => {
    const out = parseCreateFineBody(good);
    expect(out).toEqual({ ok: true, value: good });
  });

  it('never accepts a client-supplied amount', () => {
    const out = parseCreateFineBody({ ...good, fine_amount: 999999 });
    expect(out.ok).toBe(true);
    expect(out.ok && 'fine_amount' in out.value).toBe(false);
  });

  it('requires a non-empty reason', () => {
    expect(parseCreateFineBody({ ...good, reason: '   ' }).ok).toBe(false);
  });

  it('requires at least one person', () => {
    expect(parseCreateFineBody({ ...good, person_ids: [] }).ok).toBe(false);
  });

  it('rejects a due date that is not yyyy-mm-dd', () => {
    expect(parseCreateFineBody({ ...good, due_date: '04/09/2026' }).ok).toBe(false);
  });

  it('requires an idempotency key', () => {
    expect(parseCreateFineBody({ ...good, idempotency_key: '' }).ok).toBe(false);
  });

  it('defaults notify to false when absent', () => {
    const { notify, ...rest } = good;
    const out = parseCreateFineBody(rest);
    expect(out.ok && out.value.notify).toBe(false);
  });

  it('dedupes repeated person ids', () => {
    const out = parseCreateFineBody({ ...good, person_ids: [PERSON, PERSON] });
    expect(out.ok && out.value.person_ids).toEqual([PERSON]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fines/fields.test.ts`
Expected: FAIL — "Failed to resolve import './fields'".

- [ ] **Step 3: Write the implementation**

Create `lib/fines/fields.ts`:

```ts
// lib/fines/fields.ts
// Request-body whitelists for the fine endpoints. Mirrors lib/fees/fields.ts:
// only listed keys survive, so no client can smuggle an audit column — or, on
// the create path, an AMOUNT. Fine amounts are resolved server-side from the
// year's stop sheet and are never accepted from the caller.

export interface FineRateInput {
  stop_id: string;
  /** null means "clear this stop's fine", NOT "fine of zero". */
  fine_amount: number | null;
}

export interface CreateFineBody {
  transport_year_id: string;
  person_ids: string[];
  due_date: string; // yyyy-mm-dd
  reason: string;
  notify: boolean;
  idempotency_key: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFineRatesBody(
  raw: unknown
): { ok: true; year: string; rates: FineRateInput[] } | { ok: false; error: string } {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(body.year)) return { ok: false, error: 'A transport year is required.' };
  if (!Array.isArray(body.rates)) return { ok: false, error: 'rates[] is required.' };

  const rates: FineRateInput[] = [];
  for (const r of body.rates as Array<Record<string, unknown>>) {
    if (!r || !isNonEmptyString(r.stop_id)) return { ok: false, error: 'Every rate row needs a stop_id.' };
    const raw = r.fine_amount;
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      rates.push({ stop_id: r.stop_id, fine_amount: null });
      continue;
    }
    const amount = Number(String(raw).replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: `Invalid fine amount for stop ${r.stop_id}.` };
    }
    rates.push({ stop_id: r.stop_id, fine_amount: amount });
  }
  return { ok: true, year: body.year, rates };
}

export function parseCreateFineBody(raw: unknown): Parsed<CreateFineBody> {
  const body = (raw ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(body.transport_year_id)) {
    return { ok: false, error: 'A transport year is required.' };
  }
  if (!Array.isArray(body.person_ids) || body.person_ids.length === 0) {
    return { ok: false, error: 'Select at least one learner to fine.' };
  }
  const person_ids = [...new Set(body.person_ids.filter(isNonEmptyString))];
  if (person_ids.length === 0) return { ok: false, error: 'Select at least one learner to fine.' };

  if (!isNonEmptyString(body.due_date) || !DATE_RE.test(body.due_date)) {
    return { ok: false, error: 'A due date (yyyy-mm-dd) is required.' };
  }
  if (!isNonEmptyString(body.reason)) {
    return { ok: false, error: 'A reason is required — it appears on the learner’s bill.' };
  }
  if (!isNonEmptyString(body.idempotency_key)) {
    return { ok: false, error: 'idempotency_key is required.' };
  }

  return {
    ok: true,
    value: {
      transport_year_id: body.transport_year_id,
      person_ids,
      due_date: body.due_date,
      reason: body.reason.trim(),
      notify: body.notify === true,
      idempotency_key: body.idempotency_key,
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/fines/fields.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fines/fields.ts lib/fines/fields.test.ts
git commit -m "feat(fines): request-body whitelists for fine endpoints"
```

---

### Task 3: Fine rate sheet API (GET + PUT)

**Files:**
- Create: `app/api/admin/fees/fine-rates/route.ts`

**Interfaces:**
- Consumes: `parseFineRatesBody` from Task 2.
- Produces: `GET /api/admin/fees/fine-rates?year=<id>` → `{ success, data: { rates: FineRateRow[] } }` where
  `FineRateRow = { stop_id, stop_name, sequence_order, route_id, route_number, route_name, fine_amount: number | null }`;
  `PUT /api/admin/fees/fine-rates` → `{ success, data: { saved, cleared } }`.

- [ ] **Step 1: Write the route**

Create `app/api/admin/fees/fine-rates/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseFineRatesBody } from '@/lib/fines/fields';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  tms_route: { route_number: string; route_name: string } | null;
}

/** Every stop on every route, left-joined to this year's configured fine. */
async function list(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const year = new URL(request.url).searchParams.get('year');
    if (!year) return NextResponse.json({ error: 'A transport year is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, route_id, tms_route(route_number, route_name)')
      .order('sequence_order', { ascending: true });
    if (stopErr) return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });

    const { data: rates, error: rateErr } = await supabase
      .from('tms_fine_stop_rate')
      .select('stop_id, fine_amount')
      .eq('transport_year_id', year);
    // Fail loudly: a swallowed error here renders every stop as "not set" and
    // invites an operator to overwrite a good fine sheet with blanks.
    if (rateErr) return NextResponse.json({ error: 'Failed to load fine rates' }, { status: 500 });

    const fineBy = new Map<string, number>(
      ((rates ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [
        r.stop_id,
        Number(r.fine_amount),
      ])
    );

    const rows = ((stops ?? []) as unknown as StopRow[]).map((s) => ({
      stop_id: s.id,
      stop_name: s.stop_name,
      sequence_order: s.sequence_order,
      route_id: s.route_id,
      route_number: s.tms_route?.route_number ?? null,
      route_name: s.tms_route?.route_name ?? null,
      fine_amount: fineBy.has(s.id) ? (fineBy.get(s.id) as number) : null,
    }));
    rows.sort(
      (a, b) =>
        String(a.route_number ?? '').localeCompare(String(b.route_number ?? '')) ||
        a.sequence_order - b.sequence_order
    );

    return NextResponse.json({ success: true, data: { rates: rows } });
  } catch (e) {
    console.error('Fine rates list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Bulk upsert. A null/blank amount DELETES that stop's fine for the year. */
async function upsert(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const parsed = parseFineRatesBody(await request.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    const toUpsert = parsed.rates
      .filter((r) => r.fine_amount !== null)
      .map((r) => ({
        transport_year_id: parsed.year,
        stop_id: r.stop_id,
        fine_amount: r.fine_amount as number,
        updated_at: now,
        updated_by: auth.userId,
      }));
    const toDelete = parsed.rates.filter((r) => r.fine_amount === null).map((r) => r.stop_id);

    // Upsert first, delete second. Without a transaction, delete-then-upsert can
    // permanently lose the whole fine sheet if the upsert then fails; this order
    // can only leave stale rows, which a retry clears.
    if (toUpsert.length) {
      const { error } = await supabase
        .from('tms_fine_stop_rate')
        .upsert(toUpsert, { onConflict: 'transport_year_id,stop_id' });
      if (error) {
        console.error('Fine rate upsert failed:', error.message);
        return NextResponse.json({ error: 'Failed to save fine rates' }, { status: 500 });
      }
    }
    if (toDelete.length) {
      // Chunked: ~500 stop ids in one .in() returns HTTP 400 from the gateway.
      for (let i = 0; i < toDelete.length; i += 150) {
        const { error } = await supabase
          .from('tms_fine_stop_rate')
          .delete()
          .eq('transport_year_id', parsed.year)
          .in('stop_id', toDelete.slice(i, i + 150));
        if (error) {
          console.error('Fine rate clear failed:', error.message);
          return NextResponse.json({ error: 'Failed to clear fine rates' }, { status: 500 });
        }
      }
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fine_stop_rate',
      entityId: parsed.year,
      description: `Updated fine rates: ${toUpsert.length} saved, ${toDelete.length} cleared`,
      metadata: { saved: toUpsert.length, cleared: toDelete.length },
    });

    return NextResponse.json({
      success: true,
      data: { saved: toUpsert.length, cleared: toDelete.length },
      message: `Saved ${toUpsert.length} fine rate(s).`,
    });
  } catch (e) {
    console.error('Fine rates upsert error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => list(request, auth));
export const PUT = withAuth((request, auth) => upsert(request, auth));
```

- [ ] **Step 2: Type-check the new file**

Run: `npx tsc --noEmit 2>&1 | grep "fine-rates" || echo "no new errors"`
Expected: `no new errors`. (Project-wide `tsc` is chronically red; only your paths matter.)

- [ ] **Step 3: Probe the route against the dev server**

Start the app if it is not running (`npm run dev`), identify the right port by its `<title>` (ports are not stable between this app and its sibling), then:

Run: `curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:<port>/api/admin/fees/fine-rates?year=x"`
Expected: `307` or `401` — the agent's browser is unauthenticated, so an auth redirect is the correct proof that the route exists and is gated. A `404` means the file is in the wrong place.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/fees/fine-rates/route.ts
git commit -m "feat(fines): fine rate sheet API"
```

---

### Task 4: Fine sheet XLSX template + import

**Files:**
- Create: `lib/fines/fine-template.ts`
- Create: `app/api/admin/fees/fine-rates/template/route.ts`
- Create: `app/api/admin/fees/fine-rates/import/route.ts`
- Test: `lib/fines/fine-template.test.ts`

**Interfaces:**
- Consumes: `buildTemplateRows`, `parseImportRows`, `type TemplateStop`, `type ParseError` from `@/lib/fees/stop-template`.
- Produces:
  - `FINE_TEMPLATE_HEADERS: readonly string[]`
  - `buildFineTemplateRows(stops: TemplateStop[], existing: Map<string, number>): Record<string, string | number>[]`
  - `parseFineImportRows(rows, known): { rates: Array<{ stop_id: string; fine_amount: number }>; clears: string[]; errors: ParseError[] }`

- [ ] **Step 1: Write the failing test**

Create `lib/fines/fine-template.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  FINE_TEMPLATE_HEADERS,
  buildFineTemplateRows,
  parseFineImportRows,
} from './fine-template';
import type { TemplateStop } from '@/lib/fees/stop-template';

const stop: TemplateStop = {
  stop_id: 'stop-1',
  stop_name: 'EADAPPADI',
  sequence_order: 3,
  route_number: '10',
  route_name: 'EADAPPADI - COLLEGE',
};
const known = new Map<string, TemplateStop>([[stop.stop_id, stop]]);

describe('buildFineTemplateRows', () => {
  it('uses a fine_amount column, not annual_amount', () => {
    expect(FINE_TEMPLATE_HEADERS).toContain('fine_amount');
    expect(FINE_TEMPLATE_HEADERS).not.toContain('annual_amount');
  });

  it('pre-fills the existing fine and leaves unpriced stops blank', () => {
    const [priced] = buildFineTemplateRows([stop], new Map([['stop-1', 500]]));
    expect(priced.fine_amount).toBe(500);
    const [blank] = buildFineTemplateRows([stop], new Map());
    expect(blank.fine_amount).toBe('');
  });
});

describe('parseFineImportRows', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    route_number: '10',
    route_name: 'EADAPPADI - COLLEGE',
    sequence_order: 3,
    stop_name: 'EADAPPADI',
    stop_id: 'stop-1',
    fine_amount: 500,
    ...over,
  });

  it('parses a good row into a fine_amount rate', () => {
    const out = parseFineImportRows([row()], known);
    expect(out.errors).toEqual([]);
    expect(out.rates).toEqual([{ stop_id: 'stop-1', fine_amount: 500 }]);
  });

  it('treats a blank amount as a clear', () => {
    const out = parseFineImportRows([row({ fine_amount: '' })], known);
    expect(out.clears).toEqual(['stop-1']);
    expect(out.rates).toEqual([]);
  });

  it('rejects a row whose stop_name no longer matches its stop_id', () => {
    const out = parseFineImportRows([row({ stop_name: 'SOMEWHERE ELSE' })], known);
    expect(out.errors).toHaveLength(1);
    expect(out.rates).toEqual([]);
  });

  it('rejects a non-numeric amount', () => {
    const out = parseFineImportRows([row({ fine_amount: 'five hundred' })], known);
    expect(out.errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fines/fine-template.test.ts`
Expected: FAIL — cannot resolve `./fine-template`.

- [ ] **Step 3: Write the adapter**

Create `lib/fines/fine-template.ts`:

```ts
// lib/fines/fine-template.ts
// The fine sheet is shaped exactly like the fee stop-rate sheet — same stop
// identity, same reorder tripwire, same blank-means-clear rule — differing only
// in the amount column's NAME. Rather than fork ~100 lines of validated parsing
// (and its tests), this adapts the header on the way in and out.

import {
  buildTemplateRows,
  parseImportRows,
  TEMPLATE_HEADERS,
  type TemplateStop,
  type ParseError,
} from '@/lib/fees/stop-template';

export const FINE_TEMPLATE_HEADERS = TEMPLATE_HEADERS.map((h) =>
  h === 'annual_amount' ? 'fine_amount' : h
) as readonly string[];

export interface ParsedFineRate {
  stop_id: string;
  fine_amount: number;
}

export function buildFineTemplateRows(
  stops: TemplateStop[],
  existing: Map<string, number>
): Record<string, string | number>[] {
  return buildTemplateRows(stops, existing).map(({ annual_amount, ...rest }) => ({
    ...rest,
    fine_amount: annual_amount,
  }));
}

export function parseFineImportRows(
  rows: Record<string, unknown>[],
  known: Map<string, TemplateStop>
): { rates: ParsedFineRate[]; clears: string[]; errors: ParseError[] } {
  // Rename fine_amount -> annual_amount so the proven parser sees the shape it
  // expects; everything else (stop identity, name/route tripwires, duplicate
  // detection, blank-is-clear) is reused untouched.
  const renamed = rows.map(({ fine_amount, ...rest }) => ({ ...rest, annual_amount: fine_amount }));
  const out = parseImportRows(renamed, known);
  return {
    rates: out.rates.map((r) => ({ stop_id: r.stop_id, fine_amount: r.annual_amount })),
    clears: out.clears,
    errors: out.errors,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/fines/fine-template.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the template download route**

Create `app/api/admin/fees/fine-rates/template/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { buildFineTemplateRows, FINE_TEMPLATE_HEADERS } from '@/lib/fines/fine-template';
import type { TemplateStop } from '@/lib/fees/stop-template';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  tms_route: { route_number: string; route_name: string } | null;
}

async function template(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const year = new URL(request.url).searchParams.get('year');
    if (!year) return NextResponse.json({ error: 'A transport year is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, tms_route(route_number, route_name)')
      .order('sequence_order', { ascending: true });
    if (stopErr) return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });

    const { data: rates, error: rateErr } = await supabase
      .from('tms_fine_stop_rate')
      .select('stop_id, fine_amount')
      .eq('transport_year_id', year);
    if (rateErr) {
      return NextResponse.json({ error: 'Failed to load existing fine rates' }, { status: 500 });
    }
    const existing = new Map<string, number>(
      ((rates ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [
        r.stop_id,
        Number(r.fine_amount),
      ])
    );

    const list: TemplateStop[] = ((stops ?? []) as unknown as StopRow[]).map((s) => ({
      stop_id: s.id,
      stop_name: s.stop_name,
      sequence_order: s.sequence_order,
      route_number: s.tms_route?.route_number ?? null,
      route_name: s.tms_route?.route_name ?? null,
    }));
    list.sort(
      (a, b) =>
        String(a.route_number ?? '').localeCompare(String(b.route_number ?? '')) ||
        a.sequence_order - b.sequence_order
    );

    const ws = XLSX.utils.json_to_sheet(buildFineTemplateRows(list, existing), {
      header: [...FINE_TEMPLATE_HEADERS],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fine Rates');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="fine-rates-template.xlsx"',
      },
    });
  } catch (e) {
    console.error('Fine rate template error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => template(request, auth));
```

- [ ] **Step 6: Write the import route**

Create `app/api/admin/fees/fine-rates/import/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseFineImportRows } from '@/lib/fines/fine-template';
import type { TemplateStop } from '@/lib/fees/stop-template';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface StopRow {
  id: string;
  stop_name: string;
  sequence_order: number;
  tms_route: { route_number: string; route_name: string } | null;
}

async function importSheet(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await request.formData();
    const year = String(form.get('year') ?? '');
    if (!year) return NextResponse.json({ error: 'A transport year is required' }, { status: 400 });

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A .xlsx file is required (field "file").' }, { status: 400 });
    }
    // This endpoint reads the whole file into memory, so an unbounded upload is a
    // memory-exhaustion risk even from an authenticated admin picking the wrong file.
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File is too large. The fine sheet should be well under 5 MB.' },
        { status: 400 }
      );
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Upload the .xlsx sheet downloaded from the template button.' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const { data: stops, error: stopErr } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order, tms_route(route_number, route_name)');
    if (stopErr) return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });

    const known = new Map<string, TemplateStop>(
      ((stops ?? []) as unknown as StopRow[]).map((s) => [
        s.id,
        {
          stop_id: s.id,
          stop_name: s.stop_name,
          sequence_order: s.sequence_order,
          route_number: s.tms_route?.route_number ?? null,
          route_name: s.tms_route?.route_name ?? null,
        },
      ])
    );

    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: 'The workbook has no sheets.' }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    const { rates, clears, errors } = parseFineImportRows(rows, known);
    if (errors.length) {
      // All-or-nothing: nothing is written when any row is bad, so the operator
      // fixes the sheet once instead of chasing a half-applied import.
      return NextResponse.json(
        { error: `${errors.length} row(s) rejected — nothing was saved.`, data: { errors } },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    if (rates.length) {
      const { error } = await supabase.from('tms_fine_stop_rate').upsert(
        rates.map((r) => ({
          transport_year_id: year,
          stop_id: r.stop_id,
          fine_amount: r.fine_amount,
          updated_at: now,
          updated_by: auth.userId,
        })),
        { onConflict: 'transport_year_id,stop_id' }
      );
      if (error) return NextResponse.json({ error: 'Failed to save fine rates' }, { status: 500 });
    }
    for (let i = 0; i < clears.length; i += 150) {
      const { error } = await supabase
        .from('tms_fine_stop_rate')
        .delete()
        .eq('transport_year_id', year)
        .in('stop_id', clears.slice(i, i + 150));
      if (error) return NextResponse.json({ error: 'Failed to clear fine rates' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'import',
      entityType: 'tms_fine_stop_rate',
      entityId: year,
      description: `Imported fine rates: ${rates.length} saved, ${clears.length} cleared`,
      metadata: { saved: rates.length, cleared: clears.length },
    });

    return NextResponse.json({
      success: true,
      data: { saved: rates.length, cleared: clears.length },
      message: `Imported ${rates.length} fine rate(s).`,
    });
  } catch (e) {
    console.error('Fine rate import error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => importSheet(request, auth));
```

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "fine-template|fine-rates" || echo "no new errors"`
Expected: `no new errors`.

```bash
git add lib/fines/fine-template.ts lib/fines/fine-template.test.ts app/api/admin/fees/fine-rates/template/route.ts app/api/admin/fees/fine-rates/import/route.ts
git commit -m "feat(fines): fine sheet XLSX template and import"
```

---

### Task 5: Fine Rates screen

**Files:**
- Create: `app/(admin)/fees/fine-rates/page.tsx`
- Create: `app/(admin)/fees/fine-rates/fine-rate-columns.tsx`
- Modify: `app/(admin)/fees/page.tsx` (add a "Fine Rates" link in the header)

**Interfaces:**
- Consumes: `GET/PUT /api/admin/fees/fine-rates`, `GET /api/admin/fees/fine-rates/template`, `POST /api/admin/fees/fine-rates/import`; `fetchTransportYearOptions` from `app/(admin)/fees/fee-api.ts`.
- Produces: `FineRateRow` type exported from `fine-rate-columns.tsx`, reused by Task 9's dialog for stop labels.

- [ ] **Step 1: Write the columns**

Create `app/(admin)/fees/fine-rates/fine-rate-columns.tsx`:

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { inr } from '@/app/(admin)/fees/columns';

export interface FineRateRow {
  stop_id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  fine_amount: number | null;
}

export function getFineRateColumns(
  canManage: boolean,
  onChange: (stopId: string, value: string) => void,
  draft: Record<string, string>
): ColumnDef<FineRateRow>[] {
  return [
    {
      accessorKey: 'route_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="text-gray-900 dark:text-gray-100">
          {row.original.route_number ?? '—'}
          {row.original.route_name ? (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{row.original.route_name}</span>
          ) : null}
        </span>
      ),
    },
    {
      accessorKey: 'stop_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.stop_name}</span>
      ),
    },
    {
      id: 'fine_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fine" />,
      cell: ({ row }) => {
        const r = row.original;
        const value = draft[r.stop_id] ?? (r.fine_amount === null ? '' : String(r.fine_amount));
        if (!canManage) {
          return (
            <span className={r.fine_amount === null ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}>
              {r.fine_amount === null ? 'not set' : inr(r.fine_amount)}
            </span>
          );
        }
        return (
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(r.stop_id, e.target.value)}
            placeholder="not set"
            aria-label={`Fine amount for ${r.stop_name}`}
            className="h-9 w-32 rounded-lg border border-gray-300 px-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        );
      },
    },
  ];
}
```

- [ ] **Step 2: Write the page**

Create `app/(admin)/fees/fine-rates/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, Loader2, UploadCloud } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SelectMenu } from '@/components/ui/select-menu';
import { fetchTransportYearOptions } from '../fee-api';
import { getFineRateColumns, type FineRateRow } from './fine-rate-columns';

async function fetchFineRates(year: string): Promise<FineRateRow[]> {
  const res = await fetch(`/api/admin/fees/fine-rates?year=${encodeURIComponent(year)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'Failed to load fine rates');
  return json.data.rates as FineRateRow[];
}

export default function FineRatesPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }> | null>(null);

  const { data: years = [] } = useQuery({
    queryKey: ['transport-year-options'],
    queryFn: fetchTransportYearOptions,
  });
  if (!year && years.length) setYear(years[0].id);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fine-rates', year],
    queryFn: () => fetchFineRates(year),
    enabled: !!year,
  });

  const onChange = (stopId: string, value: string) =>
    setDraft((d) => ({ ...d, [stopId]: value }));

  const columns = useMemo(() => getFineRateColumns(true, onChange, draft), [draft]);
  const priced = rows.filter((r) => r.fine_amount !== null).length;
  const dirtyCount = Object.keys(draft).length;

  async function save() {
    setSaving(true);
    try {
      const rates = Object.entries(draft).map(([stop_id, v]) => ({
        stop_id,
        fine_amount: v.trim() === '' ? null : Number(v),
      }));
      const res = await fetch('/api/admin/fees/fine-rates', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, rates }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || 'Save failed');
      toast.success(json.message ?? 'Fine rates saved');
      setDraft({});
      // Invalidate the DERIVED key too: a stale list here would show the old
      // amount and read as "my edit didn't save".
      await qc.invalidateQueries({ queryKey: ['fine-rates', year] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(file: File) {
    setUploading(true);
    setImportErrors(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('year', year);
      const res = await fetch('/api/admin/fees/fine-rates/import', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setImportErrors(json?.data?.errors ?? []);
        throw new Error(json.error || 'Import failed');
      }
      toast.success(json.message ?? 'Imported');
      setDraft({});
      await qc.invalidateQueries({ queryKey: ['fine-rates', year] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm text-gray-600 dark:text-gray-300">
          The fine amount charged per boarding stop. Applies to every learner on that stop, whichever
          fee structure bills them. {priced} of {rows.length} stop(s) priced.
        </p>
        <div className="w-full sm:w-64">
          <SelectMenu
            value={year}
            onValueChange={(v) => { setYear(v); setDraft({}); }}
            options={years.map((y) => ({ value: y.id, label: y.name }))}
            placeholder="Select transport year…"
            ariaLabel="Transport year"
          />
        </div>
      </div>

      {importErrors?.length ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-500/10">
          <p className="font-medium text-red-800 dark:text-red-300">
            Nothing was saved — fix these rows and re-upload:
          </p>
          <ul className="mt-2 list-disc pl-5 text-red-700 dark:text-red-300">
            {importErrors.slice(0, 20).map((e) => (
              <li key={e.row}>Row {e.row}: {e.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        entityName="stops"
        isLoading={isLoading}
        getRowId={(r) => r.stop_id}
        searchPlaceholder="Search route or stop..."
        toolbarActions={() => (
          <div className="flex items-center gap-2">
            <a
              href={`/api/admin/fees/fine-rates/template?year=${encodeURIComponent(year)}`}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Download className="h-4 w-4" />
              Template
            </a>
            <label className="inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Upload
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
              />
            </label>
            <button
              type="button"
              onClick={save}
              disabled={saving || dirtyCount === 0}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save{dirtyCount ? ` (${dirtyCount})` : ''}
            </button>
          </div>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 3: Link it from the Fees page**

In `app/(admin)/fees/page.tsx`, add a link to `/fees/fine-rates` in the page header area (next to the existing header controls), using the same button classes as the export button on that page:

```tsx
<Link
  href="/fees/fine-rates"
  className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
>
  Fine Rates
</Link>
```

Add `import Link from 'next/link';` if it is not already imported. Do **not** add a sidebar entry — `lib/navigation.ts` stays unchanged.

- [ ] **Step 4: Verify in the browser**

Start the dev server, confirm which port serves TMS-ADMIN by its `<title>`, sign in as an admin, open `/fees/fine-rates`. Check: the year selector defaults to the newest year, ~479 stops list, typing an amount enables Save with a count, Save shows a success toast and the value survives a page reload (this catches the stale-cache class of bug — `router.refresh()` alone does not bust the TanStack cache).

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/fees/fine-rates" "app/(admin)/fees/page.tsx"
git commit -m "feat(fines): fine rate sheet screen"
```

---

### Task 6: The resolver

**Files:**
- Create: `lib/fines/resolve.ts`
- Test: `lib/fines/resolve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type FineSkipReason = 'no_stop' | 'no_stop_rate'`
  - `FINE_SKIP_LABEL: Record<FineSkipReason, string>`
  - `resolveFine(learner: { transport_stop_id: string | null }, rateByStop: Map<string, number>): { ok: true; amount: number; stop_id: string } | { ok: false; reason: FineSkipReason }`

- [ ] **Step 1: Write the failing test**

Create `lib/fines/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveFine, FINE_SKIP_LABEL } from './resolve';

describe('resolveFine', () => {
  const rates = new Map<string, number>([['stop-a', 500]]);

  it('prices a learner from their own stop', () => {
    expect(resolveFine({ transport_stop_id: 'stop-a' }, rates)).toEqual({
      ok: true,
      amount: 500,
      stop_id: 'stop-a',
    });
  });

  it('skips a learner with no stop', () => {
    expect(resolveFine({ transport_stop_id: null }, rates)).toEqual({ ok: false, reason: 'no_stop' });
  });

  it('skips a stop that has no fine configured — never defaults to zero', () => {
    expect(resolveFine({ transport_stop_id: 'stop-b' }, rates)).toEqual({
      ok: false,
      reason: 'no_stop_rate',
    });
  });

  it('skips a stop priced at zero rather than raising a ₹0 fine', () => {
    expect(resolveFine({ transport_stop_id: 'stop-z' }, new Map([['stop-z', 0]]))).toEqual({
      ok: false,
      reason: 'no_stop_rate',
    });
  });

  it('has a human label for every skip reason', () => {
    expect(FINE_SKIP_LABEL.no_stop).toBeTruthy();
    expect(FINE_SKIP_LABEL.no_stop_rate).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fines/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`.

- [ ] **Step 3: Write the implementation**

Create `lib/fines/resolve.ts`:

```ts
// lib/fines/resolve.ts
// Pure money maths for a manual fine: a learner's boarding stop chooses the
// amount. Unresolvable learners are SKIPPED and reported, never guessed and
// never silently priced at zero — the reason codes mirror
// lib/fees/resolve-terms.ts so the same words reach the operator.

export type FineSkipReason = 'no_stop' | 'no_stop_rate';

export const FINE_SKIP_LABEL: Record<FineSkipReason, string> = {
  no_stop: 'No boarding stop on record',
  no_stop_rate: 'No fine configured for this stop',
};

export type FineResolution =
  | { ok: true; amount: number; stop_id: string }
  | { ok: false; reason: FineSkipReason };

export function resolveFine(
  learner: { transport_stop_id: string | null },
  rateByStop: Map<string, number>
): FineResolution {
  const stopId = learner.transport_stop_id;
  if (!stopId) return { ok: false, reason: 'no_stop' };

  const amount = rateByStop.get(stopId);
  // A configured 0 is treated as "not priced": a ₹0 bill is noise on the
  // learner's statement and cannot be collected, so it is never raised.
  if (amount === undefined || !(amount > 0)) return { ok: false, reason: 'no_stop_rate' };

  return { ok: true, amount, stop_id: stopId };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/fines/resolve.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fines/resolve.ts lib/fines/resolve.test.ts
git commit -m "feat(fines): stop-wise fine resolver"
```

---

### Task 7: The create engine

**Files:**
- Create: `lib/fines/create.ts`
- Test: `lib/fines/create.test.ts`

**Interfaces:**
- Consumes: `resolveFine`, `FineSkipReason` (Task 6); `makeFakeSupabase` from `@/lib/fees/__testing__/fake-supabase` (tests only); `notifyLearner` from `@/lib/notifications/notify`; `TRANSPORT_CATEGORY_NAME` from `@/lib/fees/types`.
- Produces:
  - `interface FineCandidate { person_id: string; person_name: string; code: string | null; institution_id: string | null; stop_id: string | null; stop_name: string | null; route_id: string | null; route_number: string | null; academic_year_id: string | null; amount: number | null; skip_reason: FineSkipReason | null }`
  - `previewFines(svc, { transportYearId, personIds }): Promise<{ candidates: FineCandidate[]; totalAmount: number }>`
  - `createFines(svc, input: CreateFinesInput): Promise<CreateFinesResult>`
  - `interface CreateFinesInput { transportYearId: string; personIds: string[]; dueDate: string; reason: string; notify: boolean; idempotencyKey: string; actorId: string | null; sourceBillByPerson?: Record<string, string> }`
  - `interface CreateFinesResult { created: number; totalAmount: number; skipped: Array<{ person_id: string; person_name: string; reason: FineSkipReason }>; duplicates: number; errors: number }`

- [ ] **Step 1: Write the failing test**

Create `lib/fines/create.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { previewFines, createFines } from './create';

const YEAR = 'year-1';

const baseData = () => ({
  learners_profiles: [
    {
      id: 'p1',
      first_name: 'YOKESH',
      last_name: 'K',
      roll_number: 'EI23054',
      institution_id: 'inst-1',
      transport_stop_id: 'stop-a',
      academic_year_id: 'ay-1',
    },
    {
      id: 'p2',
      first_name: 'NOSTOP',
      last_name: 'X',
      roll_number: 'X01',
      institution_id: 'inst-1',
      transport_stop_id: null,
      academic_year_id: 'ay-1',
    },
  ],
  tms_fine_stop_rate: [{ stop_id: 'stop-a', fine_amount: 500 }],
  tms_route_stop: [{ id: 'stop-a', stop_name: 'EADAPPADI', route_id: 'r1' }],
  tms_route: [{ id: 'r1', route_number: '10' }],
  billing_categories: [{ id: 'cat-1', category_name: 'Transport Fee' }],
  billing_student_bills: [],
  tms_fee_fine: [],
});

const input = (over = {}) => ({
  transportYearId: YEAR,
  personIds: ['p1', 'p2'],
  dueDate: '2026-09-04',
  reason: 'Late payment',
  notify: false,
  idempotencyKey: 'req-1',
  actorId: 'admin-1',
  ...over,
});

describe('previewFines', () => {
  it('prices resolvable learners and reports the rest with a reason', async () => {
    const svc = makeFakeSupabase(baseData());
    const out = await previewFines(svc as never, { transportYearId: YEAR, personIds: ['p1', 'p2'] });

    const p1 = out.candidates.find((c) => c.person_id === 'p1');
    const p2 = out.candidates.find((c) => c.person_id === 'p2');
    expect(p1?.amount).toBe(500);
    expect(p1?.stop_name).toBe('EADAPPADI');
    expect(p2?.amount).toBeNull();
    expect(p2?.skip_reason).toBe('no_stop');
    expect(out.totalAmount).toBe(500);
  });

  it('writes nothing', async () => {
    const svc = makeFakeSupabase(baseData());
    await previewFines(svc as never, { transportYearId: YEAR, personIds: ['p1'] });
    expect(svc.calls.some((c) => c.ops.some(([op]) => op === 'insert'))).toBe(false);
  });
});

describe('createFines', () => {
  it('writes the money row and the ledger row, and skips the unresolvable learner', async () => {
    const svc = makeFakeSupabase(baseData());
    const out = await createFines(svc as never, input());

    expect(out.created).toBe(1);
    expect(out.totalAmount).toBe(500);
    expect(out.skipped).toEqual([{ person_id: 'p2', person_name: 'NOSTOP X', reason: 'no_stop' }]);

    const inserts = svc.calls.filter((c) => c.ops.some(([op]) => op === 'insert'));
    expect(inserts.map((c) => c.table)).toEqual(['billing_student_bills', 'tms_fee_fine']);
  });

  it('never raises a fine without its ledger row — the money row is deleted on ledger failure', async () => {
    const svc = makeFakeSupabase(baseData(), {
      insertErrors: { tms_fee_fine: { message: 'ledger down' } },
    });
    const out = await createFines(svc as never, input({ personIds: ['p1'] }));

    expect(out.created).toBe(0);
    expect(out.errors).toBe(1);
    expect(
      svc.calls.some((c) => c.table === 'billing_student_bills' && c.ops.some(([op]) => op === 'delete'))
    ).toBe(true);
  });

  it('counts a duplicate idempotency key as a duplicate, never as created', async () => {
    const svc = makeFakeSupabase(baseData(), {
      insertErrors: { tms_fee_fine: { message: 'duplicate key', code: '23505' } },
    });
    const out = await createFines(svc as never, input({ personIds: ['p1'] }));

    expect(out.created).toBe(0);
    expect(out.duplicates).toBe(1);
    expect(out.errors).toBe(0);
  });

  it('fails loudly when the fine sheet cannot be read, rather than fining nobody quietly', async () => {
    const svc = makeFakeSupabase(baseData(), {
      errors: { tms_fine_stop_rate: { message: 'boom' } },
    });
    await expect(createFines(svc as never, input())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fines/create.test.ts`
Expected: FAIL — cannot resolve `./create`.

- [ ] **Step 3: Write the implementation**

Create `lib/fines/create.ts`:

```ts
// lib/fines/create.ts
// The fine write engine. Preview and create share ONE candidate loader, so what
// the confirm dialog shows is what gets written — a second resolution path is a
// second place for the amount to be wrong.
//
// Money order matters: billing_student_bills FIRST, tms_fee_fine second, with a
// compensating delete if the ledger insert fails. The reverse order can leave a
// bill MyJKKN charges for that TMS knows nothing about (the orphan race already
// fixed in lib/fees/generate.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFine, type FineSkipReason } from './resolve';
import { TRANSPORT_CATEGORY_NAME } from '@/lib/fees/types';
import { notifyLearner } from '@/lib/notifications/notify';

type Svc = SupabaseClient;

const CHUNK = 150; // ~500+ ids in one .in() returns HTTP 400 from the gateway

export interface FineCandidate {
  person_id: string;
  person_name: string;
  code: string | null;
  institution_id: string | null;
  stop_id: string | null;
  stop_name: string | null;
  route_id: string | null;
  route_number: string | null;
  academic_year_id: string | null;
  amount: number | null;
  skip_reason: FineSkipReason | null;
}

export interface CreateFinesInput {
  transportYearId: string;
  personIds: string[];
  dueDate: string;
  reason: string;
  notify: boolean;
  idempotencyKey: string;
  actorId: string | null;
  /** person_id -> the tms_fee_bill row that was ticked, for provenance. */
  sourceBillByPerson?: Record<string, string>;
}

export interface CreateFinesResult {
  created: number;
  totalAmount: number;
  skipped: Array<{ person_id: string; person_name: string; reason: FineSkipReason }>;
  duplicates: number;
  errors: number;
}

interface LearnerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  institution_id: string | null;
  transport_stop_id: string | null;
  academic_year_id: string | null;
}

const fullName = (l: LearnerRow) => [l.first_name, l.last_name].filter(Boolean).join(' ').trim();

async function loadCandidates(
  svc: Svc,
  opts: { transportYearId: string; personIds: string[] }
): Promise<FineCandidate[]> {
  const learners: LearnerRow[] = [];
  for (let i = 0; i < opts.personIds.length; i += CHUNK) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, institution_id, transport_stop_id, academic_year_id')
      .in('id', opts.personIds.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to load learners: ${error.message}`);
    learners.push(...((data ?? []) as LearnerRow[]));
  }

  const { data: rates, error: rateErr } = await svc
    .from('tms_fine_stop_rate')
    .select('stop_id, fine_amount')
    .eq('transport_year_id', opts.transportYearId);
  // Hard-fail rather than treating a load failure as "no rates": that would
  // report every learner as unfinable and read as a configuration problem.
  if (rateErr) throw new Error(`Failed to load fine rates: ${rateErr.message}`);
  const rateByStop = new Map<string, number>(
    ((rates ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [
      r.stop_id,
      Number(r.fine_amount),
    ])
  );

  const stopIds = [...new Set(learners.map((l) => l.transport_stop_id).filter(Boolean))] as string[];
  const stopById = new Map<string, { stop_name: string; route_id: string | null }>();
  const routeNumberById = new Map<string, string | null>();
  if (stopIds.length) {
    for (let i = 0; i < stopIds.length; i += CHUNK) {
      const { data, error } = await svc
        .from('tms_route_stop')
        .select('id, stop_name, route_id')
        .in('id', stopIds.slice(i, i + CHUNK));
      if (error) throw new Error(`Failed to load stops: ${error.message}`);
      for (const s of (data ?? []) as Array<{ id: string; stop_name: string; route_id: string | null }>) {
        stopById.set(s.id, { stop_name: s.stop_name, route_id: s.route_id });
      }
    }
    const routeIds = [...new Set([...stopById.values()].map((s) => s.route_id).filter(Boolean))] as string[];
    for (let i = 0; i < routeIds.length; i += CHUNK) {
      const { data, error } = await svc
        .from('tms_route')
        .select('id, route_number')
        .in('id', routeIds.slice(i, i + CHUNK));
      if (error) throw new Error(`Failed to load routes: ${error.message}`);
      for (const r of (data ?? []) as Array<{ id: string; route_number: string | null }>) {
        routeNumberById.set(r.id, r.route_number);
      }
    }
  }

  return learners.map((l) => {
    const res = resolveFine({ transport_stop_id: l.transport_stop_id }, rateByStop);
    const stop = l.transport_stop_id ? stopById.get(l.transport_stop_id) : undefined;
    return {
      person_id: l.id,
      person_name: fullName(l),
      code: l.roll_number,
      institution_id: l.institution_id,
      stop_id: l.transport_stop_id,
      stop_name: stop?.stop_name ?? null,
      route_id: stop?.route_id ?? null,
      route_number: stop?.route_id ? routeNumberById.get(stop.route_id) ?? null : null,
      academic_year_id: l.academic_year_id,
      amount: res.ok ? res.amount : null,
      skip_reason: res.ok ? null : res.reason,
    };
  });
}

export async function previewFines(
  svc: Svc,
  opts: { transportYearId: string; personIds: string[] }
): Promise<{ candidates: FineCandidate[]; totalAmount: number }> {
  const candidates = await loadCandidates(svc, opts);
  const totalAmount = candidates.reduce((s, c) => s + (c.amount ?? 0), 0);
  return { candidates, totalAmount };
}

export async function createFines(svc: Svc, input: CreateFinesInput): Promise<CreateFinesResult> {
  const candidates = await loadCandidates(svc, {
    transportYearId: input.transportYearId,
    personIds: input.personIds,
  });

  const { data: cat } = await svc
    .from('billing_categories')
    .select('id')
    .eq('category_name', TRANSPORT_CATEGORY_NAME.student)
    .maybeSingle();
  const categoryId = (cat as { id: string } | null)?.id ?? null;

  const result: CreateFinesResult = {
    created: 0,
    totalAmount: 0,
    skipped: [],
    duplicates: 0,
    errors: 0,
  };

  for (const c of candidates) {
    if (c.amount === null) {
      result.skipped.push({
        person_id: c.person_id,
        person_name: c.person_name,
        reason: c.skip_reason as FineSkipReason,
      });
      continue;
    }

    const { data: bill, error: billErr } = await svc
      .from('billing_student_bills')
      .insert([{
        student_id: c.person_id,
        institution_id: c.institution_id,
        item_category_id: categoryId,
        fee_source: 'ad_hoc',
        bill_description: `Transport Fine — ${input.reason}`,
        due_date: input.dueDate,
        quantity: 1,
        unit_amount: c.amount,
        total_amount: c.amount,
        tax_amount: 0,
        final_amount: c.amount,
        balance_amount: c.amount,
        status: 'unpaid',
        academic_year_id: c.academic_year_id,
        transport_year_id: input.transportYearId,
        created_by: input.actorId,
      }])
      .select('id')
      .single();
    if (billErr || !bill) {
      console.error('[fines] money row insert failed:', billErr?.message);
      result.errors++;
      continue;
    }

    const { error: ledErr } = await svc.from('tms_fee_fine').insert([{
      transport_year_id: input.transportYearId,
      person_id: c.person_id,
      person_type: 'learner',
      stop_id: c.stop_id,
      route_id: c.route_id,
      fine_amount: c.amount,
      due_date: input.dueDate,
      reason: input.reason,
      source_bill_id: input.sourceBillByPerson?.[c.person_id] ?? null,
      billing_student_bill_id: (bill as { id: string }).id,
      status: 'generated',
      // Per-person key: one dialog submission fines many people, and a retry of
      // that submission must be a no-op for each of them individually.
      idempotency_key: `${input.idempotencyKey}:${c.person_id}`,
      created_by: input.actorId,
    }]);

    if (ledErr) {
      // Compensate: without this the learner is charged for a fine TMS has no
      // record of, and no screen here can ever cancel it.
      const { error: cleanupErr } = await svc
        .from('billing_student_bills')
        .delete()
        .eq('id', (bill as { id: string }).id);
      if (cleanupErr) {
        console.error(
          '[fines] ORPHANED BILL: ledger insert failed and cleanup failed',
          { bill_id: (bill as { id: string }).id, person_id: c.person_id }
        );
      }
      // 23505 is the idempotency key: this exact fine already exists, which is a
      // successful no-op, NOT an error and NOT a new fine.
      if ((ledErr as { code?: string }).code === '23505') result.duplicates++;
      else result.errors++;
      continue;
    }

    result.created++;
    result.totalAmount += c.amount;

    if (input.notify) {
      // Best-effort by contract — notifyLearner never throws, so a notification
      // failure cannot undo a fine that is already money.
      await notifyLearner(svc as never, {
        learnerId: c.person_id,
        actorId: input.actorId ?? '',
        title: 'Transport fine raised',
        body: `A transport fine of ₹${c.amount.toLocaleString('en-IN')} has been added to your account (${input.reason}). Due ${input.dueDate}.`,
        category: 'fees',
        url: '/student/fees',
      });
    }
  }

  return result;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/fines/create.test.ts`
Expected: PASS, 6 tests.

If the fake client does not support `insertErrors` with a `code`, read `lib/fees/__testing__/fake-supabase.ts` and extend it minimally to pass the code through — that harness is shared, so keep the change additive and re-run the full suite (`npx vitest run`) to prove the fee tests still pass.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS — all pre-existing tests plus the new ones. Report the totals.

- [ ] **Step 6: Commit**

```bash
git add lib/fines/create.ts lib/fines/create.test.ts
git commit -m "feat(fines): preview and create engine with compensated writes"
```

---

### Task 8: Fine preview + create APIs

**Files:**
- Create: `app/api/admin/fines/preview/route.ts`
- Create: `app/api/admin/fines/route.ts` (POST only in this task; GET is added in Task 10)
- Modify: `lib/activity/log.ts:11-14`

**Interfaces:**
- Consumes: `parseCreateFineBody` (Task 2), `previewFines` / `createFines` (Task 7).
- Produces:
  - `POST /api/admin/fines/preview` → `{ success, data: { candidates: FineCandidate[], totalAmount } }`
  - `POST /api/admin/fines` → `{ success, data: CreateFinesResult, message }`

- [ ] **Step 1: Extend the activity action union**

In `lib/activity/log.ts`, change lines 11-14 to include `'cancel'`:

```ts
export type ActivityAction =
  | 'create' | 'update' | 'delete' | 'import' | 'assign' | 'unassign'
  | 'upload' | 'activate' | 'deactivate' | 'scan' | 'mark' | 'unmark' | 'generate'
  | 'submit' | 'approve' | 'reject' | 'notify' | 'cancel';
```

The union is closed by design — Task 11's cancel route will not compile without this.

- [ ] **Step 2: Write the preview route**

Create `app/api/admin/fines/preview/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { previewFines } from '@/lib/fines/create';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Resolve-only: what WOULD be fined, and who would be skipped and why. */
async function preview(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      transport_year_id?: string;
      person_ids?: string[];
    };
    if (!body.transport_year_id) {
      return NextResponse.json({ error: 'A transport year is required' }, { status: 400 });
    }
    const personIds = [...new Set((body.person_ids ?? []).filter(Boolean))];
    if (!personIds.length) {
      return NextResponse.json({ error: 'Select at least one learner' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const data = await previewFines(svc, {
      transportYearId: body.transport_year_id,
      personIds,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Fine preview error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => preview(request, auth));
```

- [ ] **Step 3: Write the create route**

Create `app/api/admin/fines/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { parseCreateFineBody } from '@/lib/fines/fields';
import { createFines } from '@/lib/fines/create';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function create(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const raw = await request.json().catch(() => ({}));
    const parsed = parseCreateFineBody(raw);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const sourceBillByPerson =
      ((raw as Record<string, unknown>).source_bill_by_person as Record<string, string>) ?? undefined;

    const svc = createServiceRoleClient();
    const result = await createFines(svc, {
      transportYearId: parsed.value.transport_year_id,
      personIds: parsed.value.person_ids,
      dueDate: parsed.value.due_date,
      reason: parsed.value.reason,
      notify: parsed.value.notify,
      idempotencyKey: parsed.value.idempotency_key,
      actorId: auth.userId,
      sourceBillByPerson,
    });

    await logActivity(auth, request, {
      module: 'fees',
      action: 'create',
      entityType: 'tms_fee_fine',
      entityId: parsed.value.idempotency_key,
      description: `Raised ${result.created} fine(s) totalling ₹${result.totalAmount.toLocaleString('en-IN')} — ${parsed.value.reason}`,
      metadata: {
        created: result.created,
        skipped: result.skipped.length,
        duplicates: result.duplicates,
        errors: result.errors,
        total_amount: result.totalAmount,
        due_date: parsed.value.due_date,
      },
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Raised ${result.created} fine(s) totalling ₹${result.totalAmount.toLocaleString('en-IN')}.`,
    });
  } catch (e) {
    console.error('Fine create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => create(request, auth));
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/api/admin/fines|lib/fines|lib/activity" || echo "no new errors"`
Expected: `no new errors`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/fines lib/activity/log.ts
git commit -m "feat(fines): preview and create APIs"
```

---

### Task 9: Generate Fine dialog on Bill Management

**Files:**
- Create: `app/(admin)/bill-management/fines-api.ts`
- Create: `app/(admin)/bill-management/fine-dialog.tsx`
- Modify: `app/(admin)/bill-management/page.tsx` (toolbar action)

**Interfaces:**
- Consumes: `POST /api/admin/fines/preview`, `POST /api/admin/fines`; `TransportBillRow` from `@/lib/fees/bills`.
- Produces: `<FineDialog open selectedRows year onClose onDone />`; client fetchers `previewFines`, `createFines`, `fetchFines`, `cancelFine` (the last two are used by Tasks 10–11).

- [ ] **Step 1: Write the client fetchers**

Create `app/(admin)/bill-management/fines-api.ts`:

```ts
import type { FineCandidate, CreateFinesResult } from '@/lib/fines/create';

const json = async (res: Response) => {
  const j = await res.json();
  if (!res.ok || j.success === false) throw new Error(j.error || 'Request failed');
  return j;
};

export type { FineCandidate, CreateFinesResult };

export async function previewFines(
  year: string,
  personIds: string[]
): Promise<{ candidates: FineCandidate[]; totalAmount: number }> {
  const res = await fetch('/api/admin/fines/preview', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transport_year_id: year, person_ids: personIds }),
  });
  return (await json(res)).data;
}

export async function createFines(body: {
  year: string;
  personIds: string[];
  dueDate: string;
  reason: string;
  notify: boolean;
  idempotencyKey: string;
  sourceBillByPerson: Record<string, string>;
}): Promise<CreateFinesResult> {
  const res = await fetch('/api/admin/fines', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transport_year_id: body.year,
      person_ids: body.personIds,
      due_date: body.dueDate,
      reason: body.reason,
      notify: body.notify,
      idempotency_key: body.idempotencyKey,
      source_bill_by_person: body.sourceBillByPerson,
    }),
  });
  return (await json(res)).data;
}
```

- [ ] **Step 2: Write the dialog**

Create `app/(admin)/bill-management/fine-dialog.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { FINE_SKIP_LABEL } from '@/lib/fines/resolve';
import type { TransportBillRow } from '@/lib/fees/bills';
import { inr } from './columns';
import { previewFines, createFines } from './fines-api';

/** Default due date: 15 days out. A fine dated in the past is born overdue. */
function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

export function FineDialog({
  open,
  year,
  selectedRows,
  onClose,
  onDone,
}: {
  open: boolean;
  year: string;
  selectedRows: TransportBillRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // One key per opening of the dialog: a retried submission is a no-op, while a
  // deliberate second fine (new dialog) gets a new key and is allowed.
  const idempotencyKey = useRef<string>('');
  useEffect(() => {
    if (open) idempotencyKey.current = crypto.randomUUID();
  }, [open]);

  // Selection is over BILL rows: ticking Term 1 and Term 2 of one learner must
  // produce ONE fine. Staff rows cannot be fined (no learners_profiles row).
  const { personIds, staffCount, sourceBillByPerson } = useMemo(() => {
    const byPerson = new Map<string, string>();
    let staff = 0;
    for (const r of selectedRows) {
      if (r.person_type === 'staff') { staff++; continue; }
      if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, r.id);
    }
    return {
      personIds: [...byPerson.keys()],
      staffCount: staff,
      sourceBillByPerson: Object.fromEntries(byPerson),
    };
  }, [selectedRows]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fine-preview', year, personIds.join(',')],
    queryFn: () => previewFines(year, personIds),
    enabled: open && personIds.length > 0,
  });

  const finable = (data?.candidates ?? []).filter((c) => c.amount !== null);

  if (!open) return null;

  async function submit() {
    setSubmitting(true);
    try {
      const result = await createFines({
        year,
        personIds,
        dueDate,
        reason: reason.trim(),
        notify,
        idempotencyKey: idempotencyKey.current,
        sourceBillByPerson,
      });
      toast.success(`Raised ${result.created} fine(s) totalling ${inr(result.totalAmount)}.`);
      if (result.duplicates) toast(`${result.duplicates} already raised — skipped.`);
      if (result.errors) toast.error(`${result.errors} fine(s) failed. Check the Fines tab.`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not raise the fines');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Generate fine</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          The amount comes from each learner&apos;s boarding stop in this year&apos;s fine sheet. It is
          raised as a separate bill and does not affect their transport access.
        </p>

        {staffCount > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {staffCount} staff row(s) skipped — fines apply to learners only.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">Reason</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Late payment — August"
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify each learner in the app
        </label>

        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-green-600" />
            </div>
          ) : isError ? (
            <p className="p-3 text-sm text-red-600 dark:text-red-400">Couldn&apos;t price the selection.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Learner</th>
                  <th className="px-3 py-2">Stop</th>
                  <th className="px-3 py-2 text-right">Fine</th>
                </tr>
              </thead>
              <tbody>
                {(data?.candidates ?? []).map((c) => (
                  <tr key={c.person_id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                      {c.person_name}
                      {c.code ? <span className="ml-1 text-xs text-gray-500">{c.code}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{c.stop_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {c.amount === null ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          {FINE_SKIP_LABEL[c.skip_reason!]}
                        </span>
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-gray-100">{inr(c.amount)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {finable.length} learner(s) · total{' '}
            <span className="font-semibold">{inr(data?.totalAmount ?? 0)}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || finable.length === 0 || reason.trim() === ''}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Raise {finable.length} fine(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the page**

In `app/(admin)/bill-management/page.tsx`:

1. Add imports: `import { FineDialog } from './fine-dialog';`
2. Add state next to the other `useState` calls:

```tsx
const [fineRows, setFineRows] = useState<TransportBillRow[] | null>(null);
```

3. In the Bills `<DataTable>`'s existing `toolbarActions` (currently returning only the Export button), wrap both buttons in a fragment and add:

```tsx
<button
  type="button"
  onClick={() => setFineRows(selectedRows)}
  disabled={selectedRows.length === 0 || isAll}
  title={isAll ? 'Select a specific transport year to fine' : undefined}
  className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
>
  Generate Fine{selectedRows.length ? ` (${selectedRows.length})` : ''}
</button>
```

4. Render the dialog just before the closing `</div>` of the page:

```tsx
<FineDialog
  open={fineRows !== null}
  year={selectedYear}
  selectedRows={fineRows ?? []}
  onClose={() => setFineRows(null)}
  onDone={() => { void qc.invalidateQueries({ queryKey: ['fines', selectedYear] }); }}
/>
```

Add `const qc = useQueryClient();` (importing `useQueryClient` from `@tanstack/react-query`) if the page does not already have one.

- [ ] **Step 4: Verify in the browser**

Sign in, open Bill Management, pick a specific year, tick two bills **of the same learner** plus one other learner. Click Generate Fine. Confirm: the preview lists **two** learners, not three rows; the total matches the sum shown; a learner whose stop has no fine shows the skip label instead of an amount; the Raise button stays disabled until a reason is typed.

Do **not** submit yet against real learners — the live smoke test happens in Task 12 with a ₹1 rate on a test learner.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/bill-management/fines-api.ts" "app/(admin)/bill-management/fine-dialog.tsx" "app/(admin)/bill-management/page.tsx"
git commit -m "feat(fines): Generate Fine dialog on Bill Management"
```

---

### Task 10: Fines tab

**Files:**
- Create: `lib/fines/list.ts`
- Test: `lib/fines/list.test.ts`
- Create: `app/(admin)/bill-management/fine-columns.tsx`
- Modify: `app/api/admin/fines/route.ts` (add GET)
- Modify: `app/(admin)/bill-management/page.tsx` (Fines tab + KPI)
- Modify: `app/(admin)/bill-management/fines-api.ts` (add `fetchFines`)

**Interfaces:**
- Consumes: `tms_fee_fine` ⋈ `billing_student_bills`.
- Produces:
  - `interface FineRow { id, person_id, person_name, code, stop_name, route_number, fine_amount, due_date, reason, ledger_status: 'generated' | 'cancelled', money_status: 'paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'unknown', display_status, paid_amount, created_at, created_by_email }`
  - `loadFines(svc, { transportYearId }): Promise<{ rows: FineRow[]; summary: { raised: number; collected: number; outstanding: number; count: number } }>`
  - `deriveFineStatus(ledgerStatus, money, today): FineRow['display_status']` (pure, tested)

- [ ] **Step 1: Write the failing test**

Create `lib/fines/list.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveFineStatus } from './list';

const TODAY = '2026-08-20';

describe('deriveFineStatus', () => {
  it('reports a cancelled fine as cancelled whatever the money row says', () => {
    expect(
      deriveFineStatus('cancelled', { status: 'unpaid', balance_amount: 500, due_date: '2026-01-01' }, TODAY)
    ).toBe('cancelled');
  });

  it('reports paid from the money row', () => {
    expect(
      deriveFineStatus('generated', { status: 'paid', balance_amount: 0, due_date: '2026-01-01' }, TODAY)
    ).toBe('paid');
  });

  it('reports overdue when unpaid and past due', () => {
    expect(
      deriveFineStatus('generated', { status: 'unpaid', balance_amount: 500, due_date: '2026-08-19' }, TODAY)
    ).toBe('overdue');
  });

  it('reports unpaid when the due date has not passed', () => {
    expect(
      deriveFineStatus('generated', { status: 'unpaid', balance_amount: 500, due_date: '2026-09-04' }, TODAY)
    ).toBe('unpaid');
  });

  it('reports unknown when the money row is missing', () => {
    expect(deriveFineStatus('generated', null, TODAY)).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fines/list.test.ts`
Expected: FAIL — cannot resolve `./list`.

- [ ] **Step 3: Write the read layer**

Create `lib/fines/list.ts`:

```ts
// lib/fines/list.ts
// Read layer for the Fines tab. The ledger owns generated/cancelled; the MONEY
// row owns paid/unpaid — collection happens in MyJKKN, which TMS never observes.
// This is the only place those two are combined, so no screen can invent a third
// answer.

import type { SupabaseClient } from '@supabase/supabase-js';

export type FineDisplayStatus =
  | 'paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'cancelled' | 'unknown';

export interface MoneyRow {
  status: string | null;
  balance_amount: number | null;
  due_date: string | null;
}

export function deriveFineStatus(
  ledgerStatus: 'generated' | 'cancelled',
  money: MoneyRow | null,
  today: string
): FineDisplayStatus {
  if (ledgerStatus === 'cancelled') return 'cancelled';
  if (!money) return 'unknown';
  const s = (money.status ?? '').toLowerCase();
  if (s === 'paid') return 'paid';
  if (s === 'cancelled') return 'cancelled';
  const unpaidish = s === 'unpaid' || s === 'partially_paid' || s === 'overdue';
  if (unpaidish && money.due_date && money.due_date < today) return 'overdue';
  if (s === 'partially_paid') return 'partially_paid';
  if (unpaidish) return 'unpaid';
  return 'unknown';
}

export interface FineRow {
  id: string;
  person_id: string;
  person_name: string;
  code: string | null;
  stop_name: string | null;
  route_number: string | null;
  fine_amount: number;
  due_date: string;
  reason: string;
  display_status: FineDisplayStatus;
  paid_amount: number;
  created_at: string;
}

export interface FineSummary {
  raised: number;
  collected: number;
  outstanding: number;
  count: number;
}

interface LedgerRow {
  id: string;
  person_id: string;
  stop_id: string | null;
  route_id: string | null;
  fine_amount: number;
  due_date: string;
  reason: string;
  status: 'generated' | 'cancelled';
  created_at: string;
  billing_student_bill_id: string | null;
}

const CHUNK = 150;

export async function loadFines(
  svc: SupabaseClient,
  opts: { transportYearId: string }
): Promise<{ rows: FineRow[]; summary: FineSummary }> {
  const { data: ledger, error } = await svc
    .from('tms_fee_fine')
    .select('id, person_id, stop_id, route_id, fine_amount, due_date, reason, status, created_at, billing_student_bill_id')
    .eq('transport_year_id', opts.transportYearId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load fines: ${error.message}`);
  const fines = (ledger ?? []) as LedgerRow[];
  if (!fines.length) {
    return { rows: [], summary: { raised: 0, collected: 0, outstanding: 0, count: 0 } };
  }

  const byId = async <T extends { id: string }>(
    table: string,
    columns: string,
    ids: string[]
  ): Promise<Map<string, T>> => {
    const out = new Map<string, T>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error: err } = await svc.from(table).select(columns).in('id', ids.slice(i, i + CHUNK));
      if (err) throw new Error(`Failed to load ${table}: ${err.message}`);
      for (const r of (data ?? []) as unknown as T[]) out.set(r.id, r);
    }
    return out;
  };

  const learners = await byId<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null }>(
    'learners_profiles',
    'id, first_name, last_name, roll_number',
    [...new Set(fines.map((f) => f.person_id))]
  );
  const stops = await byId<{ id: string; stop_name: string }>(
    'tms_route_stop',
    'id, stop_name',
    [...new Set(fines.map((f) => f.stop_id).filter(Boolean))] as string[]
  );
  const routes = await byId<{ id: string; route_number: string | null }>(
    'tms_route',
    'id, route_number',
    [...new Set(fines.map((f) => f.route_id).filter(Boolean))] as string[]
  );
  const bills = await byId<{ id: string; status: string | null; balance_amount: number | null; final_amount: number | null; due_date: string | null }>(
    'billing_student_bills',
    'id, status, balance_amount, final_amount, due_date',
    [...new Set(fines.map((f) => f.billing_student_bill_id).filter(Boolean))] as string[]
  );

  const today = new Date().toISOString().slice(0, 10);
  const summary: FineSummary = { raised: 0, collected: 0, outstanding: 0, count: 0 };

  const rows: FineRow[] = fines.map((f) => {
    const l = learners.get(f.person_id);
    const money = f.billing_student_bill_id ? bills.get(f.billing_student_bill_id) ?? null : null;
    const display_status = deriveFineStatus(f.status, money, today);
    const amount = Number(f.fine_amount);
    const balance = Number(money?.balance_amount ?? amount);
    const paid_amount = display_status === 'cancelled' ? 0 : Math.max(0, amount - balance);

    if (display_status !== 'cancelled') {
      summary.raised += amount;
      summary.collected += paid_amount;
      summary.outstanding += Math.max(0, amount - paid_amount);
      summary.count += 1;
    }

    return {
      id: f.id,
      person_id: f.person_id,
      person_name: [l?.first_name, l?.last_name].filter(Boolean).join(' ').trim() || '—',
      code: l?.roll_number ?? null,
      stop_name: f.stop_id ? stops.get(f.stop_id)?.stop_name ?? null : null,
      route_number: f.route_id ? routes.get(f.route_id)?.route_number ?? null : null,
      fine_amount: amount,
      due_date: f.due_date,
      reason: f.reason,
      display_status,
      paid_amount,
      created_at: f.created_at,
    };
  });

  return { rows, summary };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/fines/list.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the GET handler**

In `app/api/admin/fines/route.ts`, add above the exports:

```ts
import { loadFines } from '@/lib/fines/list';

async function list(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const year = new URL(request.url).searchParams.get('year');
    if (!year || year === 'all') {
      return NextResponse.json({ error: 'Select a specific transport year' }, { status: 400 });
    }
    const svc = createServiceRoleClient();
    const { rows, summary } = await loadFines(svc, { transportYearId: year });
    return NextResponse.json({ success: true, data: { rows, summary }, count: rows.length });
  } catch (e) {
    console.error('Fine list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

and export it: `export const GET = withAuth((request, auth) => list(request, auth));`

- [ ] **Step 6: Add the client fetcher**

Append to `app/(admin)/bill-management/fines-api.ts`:

```ts
import type { FineRow, FineSummary } from '@/lib/fines/list';

export type { FineRow, FineSummary };

export async function fetchFines(year: string): Promise<{ rows: FineRow[]; summary: FineSummary }> {
  const res = await fetch(`/api/admin/fines?year=${encodeURIComponent(year)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return (await json(res)).data;
}
```

- [ ] **Step 7: Write the columns**

Create `app/(admin)/bill-management/fine-columns.tsx`:

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { FineRow, FineDisplayStatus } from '@/lib/fines/list';
import { inr } from './columns';

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_STYLE: Record<FineDisplayStatus, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  partially_paid: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400',
  unpaid: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  cancelled: 'bg-slate-100 text-slate-600 line-through dark:bg-slate-500/15 dark:text-slate-400',
  unknown: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
};

export function getFineColumns(
  canManage: boolean,
  onCancel: (row: FineRow) => void
): ColumnDef<FineRow>[] {
  return [
    {
      accessorKey: 'person_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {row.original.person_name}
          {row.original.code ? (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{row.original.code}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'stop',
      header: 'Stop',
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">
          {row.original.route_number ? `${row.original.route_number} · ` : ''}
          {row.original.stop_name ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'fine_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => <span className="text-gray-900 dark:text-gray-100">{inr(row.original.fine_amount)}</span>,
    },
    {
      accessorKey: 'due_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{fmtDate(row.original.due_date)}</span>,
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.reason}</span>,
    },
    {
      id: 'status',
      accessorFn: (r) => r.display_status,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
            STATUS_STYLE[row.original.display_status]
          }`}
        >
          {row.original.display_status.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) =>
        canManage && row.original.display_status !== 'cancelled' && row.original.display_status !== 'paid' ? (
          <button
            type="button"
            onClick={() => onCancel(row.original)}
            className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Waive
          </button>
        ) : null,
    },
  ];
}
```

- [ ] **Step 8: Add the tab to the page**

In `app/(admin)/bill-management/page.tsx`:

1. Widen the view type: `type View = 'bills' | 'unbilled' | 'analytics' | 'fines';`
2. Add the query:

```tsx
const { data: fines, isLoading: finesLoading } = useQuery({
  queryKey: ['fines', selectedYear],
  queryFn: () => fetchFines(selectedYear),
  enabled: !!selectedYear && !isAll && view === 'fines',
});
```

3. Add a toggle button beside the existing three:

```tsx
<ToggleBtn active={view === 'fines'} onClick={() => setView('fines')} disabled={isAll}>
  Fines{fines ? ` (${fines.summary.count})` : ''}
</ToggleBtn>
```

4. Render the table when `view === 'fines'`:

```tsx
<DataTable
  columns={fineColumns}
  data={fines?.rows ?? []}
  entityName="fines"
  isLoading={finesLoading}
  getRowId={(r) => r.id}
  searchPlaceholder="Search learner, code or reason..."
/>
```

with `const fineColumns = useMemo(() => getFineColumns(true, (row) => setCancelTarget(row)), []);` and `const [cancelTarget, setCancelTarget] = useState<FineRow | null>(null);` (the handler is implemented in Task 11 — for now `setCancelTarget` may be defined and unused by any dialog).

5. Add a KPI tile, shown only on the Fines tab so it never sits beside the fee tiles and gets mistaken for one:

```tsx
{view === 'fines' && (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
    <Kpi label="Fines raised" value={inr(fines?.summary.raised)} loading={finesLoading} />
    <Kpi label="Fines collected" value={inr(fines?.summary.collected)} loading={finesLoading} />
    <Kpi label="Fines outstanding" value={inr(fines?.summary.outstanding)} loading={finesLoading} />
  </div>
)}
```

- [ ] **Step 9: Verify the fee KPIs did not move**

Open Bill Management on a real year and write down Billed / Collected / Pending / Overdue. They must be **identical** to what the same screen showed before this branch (fines live outside `tms_fee_bill`, so this is a check that nothing leaked). If any number moved, stop — that is a spec violation.

- [ ] **Step 10: Commit**

```bash
git add lib/fines/list.ts lib/fines/list.test.ts "app/(admin)/bill-management" app/api/admin/fines/route.ts
git commit -m "feat(fines): Fines tab with ledger-plus-money-row status"
```

---

### Task 11: Waive a fine

**Files:**
- Create: `app/api/admin/fines/[id]/cancel/route.ts`
- Modify: `app/(admin)/bill-management/fines-api.ts` (add `cancelFine`)
- Modify: `app/(admin)/bill-management/page.tsx` (waive prompt wired to `cancelTarget`)

**Interfaces:**
- Consumes: `ActivityAction 'cancel'` (Task 8), `cancelTarget` state (Task 10).
- Produces: `POST /api/admin/fines/<id>/cancel` with body `{ reason: string }` → `{ success, data: { id } }`; client `cancelFine(id, reason)`.

- [ ] **Step 1: Write the route**

Create `app/api/admin/fines/[id]/cancel/route.ts`:

```ts
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

// withAuth drops Next's route context: /api/admin/fines/<id>/cancel
function fineIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fines');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

async function cancel(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = fineIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fine id is required' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = (body.reason ?? '').trim();
    if (!reason) return NextResponse.json({ error: 'A waiver reason is required.' }, { status: 400 });

    const svc = createServiceRoleClient();

    const { data: fine, error: loadErr } = await svc
      .from('tms_fee_fine')
      .select('id, status, fine_amount, person_id, billing_student_bill_id')
      .eq('id', id)
      .maybeSingle();
    if (loadErr) return NextResponse.json({ error: 'Failed to load the fine' }, { status: 500 });
    if (!fine) return NextResponse.json({ error: 'Fine not found' }, { status: 404 });
    const row = fine as {
      id: string; status: string; fine_amount: number; person_id: string;
      billing_student_bill_id: string | null;
    };
    if (row.status === 'cancelled') {
      return NextResponse.json({ success: true, data: { id }, message: 'Already waived.' });
    }

    // Money row FIRST: if this succeeds and the ledger update then fails, the
    // learner is not charged and the ledger still says 'generated' — a visible,
    // retryable inconsistency. The reverse order would show 'cancelled' in TMS
    // while MyJKKN still collects.
    if (row.billing_student_bill_id) {
      const { error: billErr } = await svc
        .from('billing_student_bills')
        .update({ status: 'cancelled', balance_amount: 0, updated_at: new Date().toISOString() })
        .eq('id', row.billing_student_bill_id);
      if (billErr) {
        console.error('[fines] money row cancel failed:', billErr.message);
        return NextResponse.json({ error: 'Failed to cancel the bill' }, { status: 500 });
      }
    }

    const { error: fineErr } = await svc
      .from('tms_fee_fine')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: auth.userId,
        cancel_reason: reason,
      })
      .eq('id', id);
    if (fineErr) {
      console.error('[fines] ledger cancel failed AFTER the bill was cancelled:', fineErr.message);
      return NextResponse.json(
        { error: 'The bill was cancelled but the fine record was not updated. Retry the waive.' },
        { status: 500 }
      );
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'cancel',
      entityType: 'tms_fee_fine',
      entityId: id,
      description: `Waived a fine of ₹${Number(row.fine_amount).toLocaleString('en-IN')} — ${reason}`,
      metadata: { person_id: row.person_id, amount: Number(row.fine_amount), reason },
    });

    return NextResponse.json({ success: true, data: { id }, message: 'Fine waived.' });
  } catch (e) {
    console.error('Fine cancel error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => cancel(request, auth));
```

- [ ] **Step 2: Add the client fetcher**

Append to `app/(admin)/bill-management/fines-api.ts`:

```ts
export async function cancelFine(id: string, reason: string): Promise<void> {
  const res = await fetch(`/api/admin/fines/${id}/cancel`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  await json(res);
}
```

- [ ] **Step 3: Wire the waive UI**

In `app/(admin)/bill-management/page.tsx`, add a small inline waive panel rendered when `cancelTarget` is set (do **not** use `window.confirm` — a browser modal blocks the automation session and cannot carry a reason):

```tsx
{cancelTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Waive {inr(cancelTarget.fine_amount)} fine — {cancelTarget.person_name}?
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        The bill is cancelled, not deleted. The learner stops owing it immediately.
      </p>
      <input
        type="text"
        value={waiveReason}
        onChange={(e) => setWaiveReason(e.target.value)}
        placeholder="Reason for waiving"
        className="mt-3 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setCancelTarget(null); setWaiveReason(''); }}
          className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
        >
          Keep
        </button>
        <button
          type="button"
          disabled={waiveReason.trim() === ''}
          onClick={async () => {
            try {
              await cancelFine(cancelTarget.id, waiveReason.trim());
              toast.success('Fine waived.');
              setCancelTarget(null);
              setWaiveReason('');
              await qc.invalidateQueries({ queryKey: ['fines', selectedYear] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not waive the fine');
            }
          }}
          className="h-10 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Waive
        </button>
      </div>
    </div>
  </div>
)}
```

Add `const [waiveReason, setWaiveReason] = useState('');`, and import `toast` from `react-hot-toast` and `cancelFine` from `./fines-api` if not already imported.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "fines|bill-management" || echo "no new errors"`
Expected: `no new errors`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/fines "app/(admin)/bill-management"
git commit -m "feat(fines): waive a fine without deleting it"
```

---

### Task 12: Full verification and live smoke test

**Files:** none created; this task proves the feature.

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS. Record the pass count and compare with the count before this branch — it must be strictly higher, with zero new failures.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds. (`next build` has `ignoreBuildErrors: true` for type errors, so a green build proves the routes and pages compile and bundle — not that types are clean. That is why Step 3 exists.)

If the build dies with "could not find bin metadata file", the cause is a stale `bun.lock`, not your code — run `bun install` and rebuild.

- [ ] **Step 3: Path-scoped type check**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/fines|app/api/admin/fines|fine-rates|fine-dialog|fine-columns" || echo "no errors in fine code"`
Expected: `no errors in fine code`. Project-wide `tsc` stays red for unrelated pre-existing reasons; do not try to fix those here.

- [ ] **Step 4: Live smoke test — raise one ₹1 fine**

1. On `/fees/fine-rates`, set a **₹1** fine on exactly one stop that a known test learner boards at. Save.
2. Capture the gate's answer for that learner **before** fining:

```sql
select tms_student_transport_access('<the learner profile_id>');
```

3. On Bill Management, tick that learner's bill, Generate Fine, reason "smoke test", due date default, notify off. Confirm.
4. Verify the two rows exist and agree:

```sql
select f.id, f.fine_amount, f.status, f.due_date,
       b.final_amount, b.balance_amount, b.status as bill_status, b.bill_description
from tms_fee_fine f
left join billing_student_bills b on b.id = f.billing_student_bill_id
where f.reason = 'smoke test';
```

Expected: one row, `fine_amount = 1`, `final_amount = 1`, `bill_status = 'unpaid'`, description `Transport Fine — smoke test`.

5. Re-run the gate query from step 2. **The JSON must be byte-identical.** If it changed, the fine leaked into the access path — stop and report.
6. Confirm the fine shows on MyJKKN's transport screen for that learner and adds ₹1 to their outstanding.
7. Waive it from the Fines tab with reason "smoke test cleanup", then re-run the query in step 4: `f.status = 'cancelled'` and `bill_status = 'cancelled'`, `balance_amount = 0`.
8. Remove the ₹1 test rate from the fine sheet (blank the cell, Save).

- [ ] **Step 5: Confirm no stray files**

Run: `git status --porcelain`
Expected: clean, or only files you intend to commit. This repo's owner commits broadly — a stray scratch file will be committed by accident.

- [ ] **Step 6: Final commit and hand-off**

```bash
git log --oneline origin/main..HEAD
```

Report the real commit count to the user (never a remembered one — it changes hourly), and ask whether to push and open a PR. Do not push without being asked.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `tms_fine_stop_rate` / `tms_fee_fine` schema | 1 |
| The money row (category, fee_source, description, order-of-writes) | 7 |
| Amount resolution + skip reasons | 6 |
| API table (8 endpoints) | 3, 4, 8, 10, 11 |
| Fine Rates screen | 5 |
| Generate Fine toolbar action + dedupe + staff drop | 9 |
| Fines tab + waive | 10, 11 |
| Notifications | 7 (inside `createFines`) |
| Activity log union extension | 8 |
| Testing (resolver, engine, whitelist, smoke) | 2, 4, 6, 7, 10, 12 |
| Invariants 1–5 | 1 (step 4), 10 (step 9), 12 (step 4) |

No spec requirement is unassigned. `lib/fines/fields.test.ts` covers the whitelist requirement the spec assigns to `lib/fines/fields.ts`.

**Type consistency:** `FineCandidate`, `CreateFinesResult`, `FineSkipReason`, `FINE_SKIP_LABEL`, `FineRow`, `FineSummary`, `FineDisplayStatus`, `FineRateRow` are each defined in exactly one task and imported by name thereafter. The dialog (Task 9) consumes `FINE_SKIP_LABEL` from Task 6 and `FineCandidate` from Task 7; the Fines tab (Task 10) consumes `FineRow` from its own `lib/fines/list.ts`; Task 11's UI consumes `cancelTarget: FineRow | null` declared in Task 10.

**Known ordering note:** Task 10 introduces `cancelTarget` state whose consumer ships in Task 11. That is deliberate — Task 10 is independently reviewable and shippable (a read-only tab), and Task 11 only adds the panel. An executor stopping after Task 10 has a working, waive-less Fines tab.
