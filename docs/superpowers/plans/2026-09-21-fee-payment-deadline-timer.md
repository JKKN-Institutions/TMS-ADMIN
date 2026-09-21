# 48-hour Transport Fee Payment Timer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every learner with an unpaid Term 1 Transport Maintenance Fee a personal 48-hour countdown on every portal page, and automatically raise a Transport Fee (fine) when it expires unpaid.

**Architecture:** A `tms_fee_payment_notice` row per learner per transport year stores the deadline. A 5-minute pg_cron → `GET /api/cron/fee-payment-notices` sweep loads state, hands it to a **pure planner** (`planSweep`) that decides paid/cancel/open/remind/fine, then executes the plan — fines go through the existing `createFines()`. The learner portal reads the notice through the existing `/api/student/transport-access` route and renders a server-clock-corrected countdown bar from the layout.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + pg_cron + pg_net), TanStack Query v5, Tailwind v4, vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-21-fee-payment-deadline-timer-design.md`

## Global Constraints

- Work ONLY in the worktree `D:\Sangeetha_V\TMS-ADMIN\.worktrees\fee-deadline` on branch `feat/fee-payment-deadline-timer`. Never commit from the shared checkout. Never bare `git stash`.
- Every `.in()` filter uses chunks of ≤150 ids and checks `error` (gateway returns HTTP 400 on ~500+ ids, which an unchecked result turns into a silently empty set).
- New SQL functions inherit PUBLIC execute: every migration that creates a function MUST `revoke all … from public, anon, authenticated` and `grant execute … to service_role`, and the function MUST be executed once against the real DB before merging.
- New `tms_` tables: RLS enabled, no policies (service role only).
- Categories: the charge is "Transport Maintenance Fee"; fines are "Transport Fee". Never re-collapse them.
- Activity log `module`/`action` unions are CLOSED — use only existing members (`fees`, `settings`, `update`, `generate`, `notify`).
- Stored setting keys are snake_case: `enabled`, `window_hours`, `reminder_hours_before`, `fine_due_days`, `enabled_at`. Defaults: `false, 48, 6, 7, null`.
- Fine reason text, verbatim: `Transport Maintenance Fee unpaid 48 hours after notice`.
- Fine idempotency key: `payment-notice:<notice id>` (createFines appends `:<person_id>`).
- IST dates via `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })`.
- Tests: `npx vitest run <path>`. Typecheck is red on main (~540 errors) — filter `npx tsc --noEmit -p . 2>&1 | grep <touched file>`; build with `node node_modules/next/dist/bin/next build` inside the worktree.
- Tailwind tinted alerts need explicit `dark:` variants; use `min-w-0` / `flex-wrap` on phone widths.

**Spec clarification adopted by this plan:** when `computeExpiry` would yield a deadline already in the past at the moment a notice is opened (e.g. an old bill that became unpaid again), the notice gets `now + window_hours` instead — no learner is fined without first seeing the timer. This follows the spec's go-live rationale.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260921120000_tms_fee_payment_notice.sql` | table + `tms_learner_profile_ids()` |
| `supabase/migrations/20260921120100_schedule_fee_payment_notice_sweep.sql` | pg_cron job (applied only after deploy) |
| `lib/fees/payment-notice/config.ts` | setting parse/load/serialize, `computeExpiry`, IST date helpers |
| `lib/fees/payment-notice/plan.ts` | pure `planSweep()` |
| `lib/fees/payment-notice/sweep.ts` | IO: load state → plan → execute |
| `lib/fees/payment-notice/messages.ts` | notification copy |
| `lib/fees/payment-notice/learner-notice.ts` | learner-side notice lookup |
| `lib/fees/payment-notice/bar-state.ts` | pure countdown state/format/offset |
| `lib/notifications/learner-recipients.ts` | learner → profile id resolution (profile_id, then email) |
| `lib/notifications/notify.ts` | `notifyLearner` uses the resolver; empty actor → null |
| `app/api/cron/fee-payment-notices/route.ts` | cron shell |
| `app/api/admin/settings/fee-payment-notice/route.ts` | switch GET/PUT |
| `app/api/admin/fees/payment-notices/route.ts` | admin read-only list |
| `app/api/student/transport-access/route.ts` | adds `payment_notice`, `server_now` |
| `components/admin/fee-notice-settings.tsx` | Settings tab |
| `app/(admin)/bill-management/payment-notice-columns.tsx` | list columns |
| `components/student/payment-notice-bar.tsx` | strip + card |
| `proxy.ts`, `app/(admin)/settings/page.tsx`, `app/(admin)/bill-management/page.tsx`, `app/student/layout.tsx`, `app/student/fees/page.tsx`, `lib/student/use-transport-access.ts`, `lib/fees/__testing__/fake-supabase.ts` | wiring |

---

### Task 1: Database — notice table and recipient resolver

**Files:**
- Create: `supabase/migrations/20260921120000_tms_fee_payment_notice.sql`

**Interfaces:**
- Produces: table `public.tms_fee_payment_notice`; RPC `tms_learner_profile_ids(p_learner_ids uuid[]) returns table(learner_id uuid, profile_id uuid)` (service role only; `profile_id` null when unreachable).

- [ ] **Step 1: Write the migration**

```sql
-- 48-hour Transport Maintenance Fee payment notice.
-- One row per learner per transport year. The unique key is what makes
-- "at most one automatic Transport Fee per learner per year" hold even when two
-- sweeps overlap. Service role only (RLS on, no policies), like tms_fee_fine.

create table if not exists public.tms_fee_payment_notice (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references public.learners_profiles(id) on delete cascade,
  transport_year_id uuid not null references public.tms_transport_year(id) on delete cascade,
  source_bill_id    uuid references public.tms_fee_bill(id) on delete set null,
  started_at        timestamptz not null,
  expires_at        timestamptz not null,
  reminder_sent_at  timestamptz,
  status            text not null default 'running'
                    check (status in ('running', 'paid', 'fined', 'cancelled')),
  fine_id           uuid references public.tms_fee_fine(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tms_fee_payment_notice_person_year_unique unique (person_id, transport_year_id),
  constraint tms_fee_payment_notice_window check (expires_at > started_at),
  constraint tms_fee_payment_notice_fined_has_fine check (status <> 'fined' or fine_id is not null)
);

create index if not exists tms_fee_payment_notice_sweep_idx
  on public.tms_fee_payment_notice (transport_year_id, status, expires_at);

alter table public.tms_fee_payment_notice enable row level security;

-- Learner -> auth profile, the way tms_student_transport_access resolves the
-- reverse direction: the direct profile link first, then college/student email.
-- profiles.email is NOT reliably lower-cased, so both sides are lowered.
-- Measured 2026-09-21: 206 of ~450 owing learners are reachable ONLY by email.
create or replace function public.tms_learner_profile_ids(p_learner_ids uuid[])
returns table (learner_id uuid, profile_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, coalesce(l.profile_id, m.profile_id)
  from learners_profiles l
  left join lateral (
    select p.id as profile_id
    from profiles p
    where l.profile_id is null
      and p.email is not null
      and lower(p.email) in (lower(nullif(l.college_email, '')), lower(nullif(l.student_email, '')))
    order by p.id
    limit 1
  ) m on true
  where l.id = any(p_learner_ids);
$$;

revoke all on function public.tms_learner_profile_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.tms_learner_profile_ids(uuid[]) to service_role;
```

- [ ] **Step 2: Apply to the real DB**

Use the Supabase MCP `apply_migration` with name `tms_fee_payment_notice` and the SQL above.

- [ ] **Step 3: Verify the table, the unique key, and the grant**

Run via `execute_sql`:

```sql
select has_function_privilege('authenticated', 'public.tms_learner_profile_ids(uuid[])', 'execute') as auth_can,
       has_function_privilege('service_role',  'public.tms_learner_profile_ids(uuid[])', 'execute') as svc_can;
-- expect auth_can = false, svc_can = true

select count(*) filter (where profile_id is not null) as reachable,
       count(*) filter (where profile_id is null)     as unreachable
from public.tms_learner_profile_ids(
  (select array_agg(distinct person_id) from tms_fee_bill b
   join tms_transport_year y on y.id = b.transport_year_id and y.is_current
   where b.person_type = 'learner' and b.status = 'generated'));
-- expect reachable to be much larger than the profile_id-only count; record both numbers in the commit message

begin;
insert into tms_fee_payment_notice (person_id, transport_year_id, started_at, expires_at)
select lp.id, y.id, now(), now() + interval '48 hours'
from learners_profiles lp, tms_transport_year y where y.is_current limit 1;
insert into tms_fee_payment_notice (person_id, transport_year_id, started_at, expires_at)
select person_id, transport_year_id, now(), now() + interval '48 hours' from tms_fee_payment_notice limit 1;
-- expect: ERROR 23505 tms_fee_payment_notice_person_year_unique
rollback;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260921120000_tms_fee_payment_notice.sql
git commit -m "feat(fees): payment notice table and learner recipient resolver"
```

---

### Task 2: Config, expiry maths and IST dates

**Files:**
- Create: `lib/fees/payment-notice/config.ts`
- Test: `lib/fees/payment-notice/config.test.ts`

**Interfaces:**
- Produces:
  - `interface FeeNoticeConfig { enabled: boolean; windowHours: number; reminderHoursBefore: number; fineDueDays: number; enabledAt: string | null }`
  - `DEFAULT_FEE_NOTICE_CONFIG: FeeNoticeConfig`
  - `FEE_NOTICE_SETTING_TYPE = 'fee_payment_notice'`
  - `parseFeeNoticeConfig(raw: unknown): FeeNoticeConfig`
  - `toStoredFeeNoticeConfig(cfg: FeeNoticeConfig): Record<string, unknown>`
  - `validateFeeNoticeInput(input: { windowHours: number; reminderHoursBefore: number; fineDueDays: number }): string | null`
  - `loadFeeNoticeConfig(svc: SupabaseClient): Promise<FeeNoticeConfig>`
  - `computeExpiry(enabledAt: string, billCreatedAt: string, windowHours: number): string`
  - `istDate(iso: string): string` (`YYYY-MM-DD`)
  - `addDays(date: string, days: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// lib/fees/payment-notice/config.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseFeeNoticeConfig, toStoredFeeNoticeConfig, validateFeeNoticeInput,
  computeExpiry, istDate, addDays, DEFAULT_FEE_NOTICE_CONFIG,
} from './config';

describe('parseFeeNoticeConfig', () => {
  it('defaults to off with 48/6/7 when nothing is stored', () => {
    expect(parseFeeNoticeConfig(null)).toEqual(DEFAULT_FEE_NOTICE_CONFIG);
    expect(DEFAULT_FEE_NOTICE_CONFIG).toEqual({
      enabled: false, windowHours: 48, reminderHoursBefore: 6, fineDueDays: 7, enabledAt: null,
    });
  });

  it('reads snake_case keys', () => {
    expect(parseFeeNoticeConfig({
      enabled: true, window_hours: 24, reminder_hours_before: 3, fine_due_days: 10,
      enabled_at: '2026-09-22T04:30:00.000Z',
    })).toEqual({
      enabled: true, windowHours: 24, reminderHoursBefore: 3, fineDueDays: 10,
      enabledAt: '2026-09-22T04:30:00.000Z',
    });
  });

  it('falls back per field on junk, and treats enabled without enabled_at as off', () => {
    expect(parseFeeNoticeConfig({ enabled: true, window_hours: 'x', fine_due_days: -1 })).toEqual(
      DEFAULT_FEE_NOTICE_CONFIG,
    );
  });

  it('round-trips through the stored shape', () => {
    const cfg = { enabled: true, windowHours: 48, reminderHoursBefore: 6, fineDueDays: 7, enabledAt: '2026-09-22T00:00:00.000Z' };
    expect(parseFeeNoticeConfig(toStoredFeeNoticeConfig(cfg))).toEqual(cfg);
  });
});

describe('validateFeeNoticeInput', () => {
  it('accepts the defaults', () => {
    expect(validateFeeNoticeInput({ windowHours: 48, reminderHoursBefore: 6, fineDueDays: 7 })).toBeNull();
  });
  it('rejects a reminder that is not inside the window', () => {
    expect(validateFeeNoticeInput({ windowHours: 6, reminderHoursBefore: 6, fineDueDays: 7 })).toMatch(/reminder/i);
  });
  it('rejects out-of-range values', () => {
    expect(validateFeeNoticeInput({ windowHours: 0, reminderHoursBefore: 0, fineDueDays: 7 })).toMatch(/window/i);
    expect(validateFeeNoticeInput({ windowHours: 48, reminderHoursBefore: 6, fineDueDays: 61 })).toMatch(/due/i);
  });
});

describe('computeExpiry', () => {
  it('counts from go-live for bills created before it', () => {
    expect(computeExpiry('2026-09-22T04:30:00.000Z', '2026-07-01T00:00:00.000Z', 48))
      .toBe('2026-09-24T04:30:00.000Z');
  });
  it('counts from bill creation for bills created after go-live', () => {
    expect(computeExpiry('2026-09-22T04:30:00.000Z', '2026-09-25T10:00:00.000Z', 48))
      .toBe('2026-09-27T10:00:00.000Z');
  });
});

describe('IST dates', () => {
  it('istDate uses the Asia/Kolkata calendar day', () => {
    expect(istDate('2026-09-23T19:00:00.000Z')).toBe('2026-09-24'); // 00:30 IST next day
    expect(istDate('2026-09-23T18:00:00.000Z')).toBe('2026-09-23'); // 23:30 IST
  });
  it('addDays crosses month ends', () => {
    expect(addDays('2026-09-27', 7)).toBe('2026-10-04');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/fees/payment-notice/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Implement**

```ts
// lib/fees/payment-notice/config.ts
// The 48-hour payment notice switch, stored as one admin_settings row
// (setting_type 'fee_payment_notice') in the same way the scheduling settings
// are. "Go-live" is the moment an admin turns it on: enabled_at is stamped then,
// and every notice deadline is measured from it or from a later bill.

import type { SupabaseClient } from '@supabase/supabase-js';

export const FEE_NOTICE_SETTING_TYPE = 'fee_payment_notice';

export interface FeeNoticeConfig {
  enabled: boolean;
  windowHours: number;
  reminderHoursBefore: number;
  fineDueDays: number;
  /** ISO timestamp of the most recent switch-on. Null until first enabled. */
  enabledAt: string | null;
}

export const DEFAULT_FEE_NOTICE_CONFIG: FeeNoticeConfig = {
  enabled: false,
  windowHours: 48,
  reminderHoursBefore: 6,
  fineDueDays: 7,
  enabledAt: null,
};

const HOUR_MS = 3_600_000;

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function parseFeeNoticeConfig(raw: unknown): FeeNoticeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_FEE_NOTICE_CONFIG;
  const windowHours = intIn(r.window_hours, 1, 168, d.windowHours);
  const reminder = intIn(r.reminder_hours_before, 0, windowHours - 1, Math.min(d.reminderHoursBefore, windowHours - 1));
  const enabledAt =
    typeof r.enabled_at === 'string' && !Number.isNaN(Date.parse(r.enabled_at)) ? r.enabled_at : null;
  return {
    // A switch that is "on" without a go-live instant has nothing to measure from: treat as off.
    enabled: r.enabled === true && enabledAt !== null,
    windowHours,
    reminderHoursBefore: reminder,
    fineDueDays: intIn(r.fine_due_days, 0, 60, d.fineDueDays),
    enabledAt,
  };
}

export function toStoredFeeNoticeConfig(cfg: FeeNoticeConfig): Record<string, unknown> {
  return {
    enabled: cfg.enabled,
    window_hours: cfg.windowHours,
    reminder_hours_before: cfg.reminderHoursBefore,
    fine_due_days: cfg.fineDueDays,
    enabled_at: cfg.enabledAt,
  };
}

export function validateFeeNoticeInput(input: {
  windowHours: number;
  reminderHoursBefore: number;
  fineDueDays: number;
}): string | null {
  const { windowHours, reminderHoursBefore, fineDueDays } = input;
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 168) {
    return 'Payment window must be a whole number of hours between 1 and 168';
  }
  if (!Number.isInteger(reminderHoursBefore) || reminderHoursBefore < 0 || reminderHoursBefore >= windowHours) {
    return 'Reminder must be a whole number of hours, less than the payment window';
  }
  if (!Number.isInteger(fineDueDays) || fineDueDays < 0 || fineDueDays > 60) {
    return 'Transport Fee due days must be a whole number between 0 and 60';
  }
  return null;
}

export async function loadFeeNoticeConfig(svc: SupabaseClient): Promise<FeeNoticeConfig> {
  try {
    const { data, error } = await svc
      .from('admin_settings')
      .select('settings_data')
      .eq('setting_type', FEE_NOTICE_SETTING_TYPE)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return { ...DEFAULT_FEE_NOTICE_CONFIG };
    return parseFeeNoticeConfig((data[0] as { settings_data: unknown }).settings_data);
  } catch {
    // Fail OFF: an unreadable switch must never start charging learners.
    return { ...DEFAULT_FEE_NOTICE_CONFIG };
  }
}

/** max(go-live, bill creation) + window, as an ISO timestamp. */
export function computeExpiry(enabledAt: string, billCreatedAt: string, windowHours: number): string {
  const from = Math.max(Date.parse(enabledAt), Date.parse(billCreatedAt));
  return new Date(from + windowHours * HOUR_MS).toISOString();
}

export function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/fees/payment-notice/config.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/fees/payment-notice/config.ts lib/fees/payment-notice/config.test.ts
git commit -m "feat(fees): payment notice setting, expiry maths and IST dates"
```

---

### Task 3: Reach email-only learners, and fix system-actor notifications

**Files:**
- Create: `lib/notifications/learner-recipients.ts`
- Test: `lib/notifications/learner-recipients.test.ts`
- Modify: `lib/notifications/notify.ts` (the `notifyProfile` dispatch call and the whole `notifyLearner` body)
- Test: `lib/notifications/notify.test.ts` (create if absent)

**Interfaces:**
- Consumes: RPC `tms_learner_profile_ids` (Task 1).
- Produces: `resolveLearnerProfileIds(svc: SupabaseClient, learnerIds: string[]): Promise<Map<string, string>>` — learner id → profile id, unreachable learners omitted; throws on RPC error.

Two defects fixed here:
1. `notifyLearner` resolves by `learners_profiles.profile_id` only and silently skips ~206 email-only learners.
2. `createFines()` passes `actorId ?? ''`; `notifyProfile` forwards `''` into `tms_notification.created_by` (**uuid**), the insert fails, and the error is swallowed — every system-raised "Transport fee charged" notice would silently vanish. Empty actor must become `null`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/notifications/learner-recipients.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resolveLearnerProfileIds } from './learner-recipients';

function svcWith(rpc: (...a: unknown[]) => Promise<{ data: unknown; error: unknown }>) {
  return { rpc: vi.fn(rpc) } as never;
}

describe('resolveLearnerProfileIds', () => {
  it('returns only reachable learners', async () => {
    const svc = svcWith(async () => ({
      data: [
        { learner_id: 'L1', profile_id: 'P1' },
        { learner_id: 'L2', profile_id: null },
      ],
      error: null,
    }));
    const map = await resolveLearnerProfileIds(svc, ['L1', 'L2']);
    expect([...map.entries()]).toEqual([['L1', 'P1']]);
  });

  it('chunks at 150 ids per call', async () => {
    const svc = svcWith(async () => ({ data: [], error: null }));
    const ids = Array.from({ length: 301 }, (_, i) => `L${i}`);
    await resolveLearnerProfileIds(svc, ids);
    const calls = (svc as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls;
    expect(calls.map((c) => (c[1] as { p_learner_ids: string[] }).p_learner_ids.length)).toEqual([150, 150, 1]);
  });

  it('throws on RPC error rather than returning an empty map', async () => {
    const svc = svcWith(async () => ({ data: null, error: { message: 'boom' } }));
    await expect(resolveLearnerProfileIds(svc, ['L1'])).rejects.toThrow(/boom/);
  });

  it('makes no call for an empty list', async () => {
    const svc = svcWith(async () => ({ data: [], error: null }));
    expect((await resolveLearnerProfileIds(svc, [])).size).toBe(0);
    expect((svc as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });
});
```

```ts
// lib/notifications/notify.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above plain consts; vi.hoisted makes `dispatch` exist first.
const { dispatch } = vi.hoisted(() => ({
  dispatch: vi.fn(async (..._args: unknown[]) => ({ id: 'n1', recipientCount: 1 })),
}));
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: dispatch }));

import { notifyProfile, notifyLearner } from './notify';

beforeEach(() => dispatch.mockClear());

describe('notifyProfile', () => {
  it('sends a null creator for an empty actor id (created_by is a uuid column)', async () => {
    await notifyProfile({} as never, { profileId: 'P1', actorId: '', title: 't', body: 'b' });
    expect((dispatch.mock.calls[0] as unknown[])[1]).toMatchObject({ createdBy: null });
  });
});

describe('notifyLearner', () => {
  it('reaches a learner who has only an email match', async () => {
    const svc = {
      rpc: vi.fn(async () => ({ data: [{ learner_id: 'L1', profile_id: 'P-email' }], error: null })),
    };
    await notifyLearner(svc as never, { learnerId: 'L1', actorId: '', title: 't', body: 'b' });
    expect((dispatch.mock.calls[0] as unknown[])[1]).toMatchObject({
      targeting: { type: 'users', user_ids: ['P-email'] },
    });
  });

  it('is a silent no-op for an unreachable learner', async () => {
    const svc = { rpc: vi.fn(async () => ({ data: [{ learner_id: 'L1', profile_id: null }], error: null })) };
    await notifyLearner(svc as never, { learnerId: 'L1', actorId: '', title: 't', body: 'b' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/notifications/learner-recipients.test.ts lib/notifications/notify.test.ts`
Expected: FAIL — `./learner-recipients` missing; `createdBy: ''` not null; `notifyLearner` calls `from()` which the fake lacks.

- [ ] **Step 3: Implement the resolver**

```ts
// lib/notifications/learner-recipients.ts
// Learner id -> auth profile id. learners_profiles.profile_id alone misses
// learners whose portal account is linked only by college/student email
// (206 of ~450 owing learners on 2026-09-21), so resolution goes through the
// tms_learner_profile_ids RPC, which tries profile_id and then both emails.

import type { SupabaseClient } from '@supabase/supabase-js';

const CHUNK = 150;

export async function resolveLearnerProfileIds(
  svc: SupabaseClient,
  learnerIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(learnerIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await svc.rpc('tms_learner_profile_ids', {
      p_learner_ids: ids.slice(i, i + CHUNK),
    });
    if (error) throw new Error(`Failed to resolve learner recipients: ${(error as { message: string }).message}`);
    for (const r of (data ?? []) as Array<{ learner_id: string; profile_id: string | null }>) {
      if (r.profile_id) out.set(r.learner_id, r.profile_id);
    }
  }
  return out;
}
```

- [ ] **Step 4: Update `lib/notifications/notify.ts`**

Add the import at the top:

```ts
import { resolveLearnerProfileIds } from '@/lib/notifications/learner-recipients';
```

In `notifyProfile`, change `createdBy: opts.actorId,` to:

```ts
      // '' (a system actor) is not a uuid; tms_notification.created_by would
      // reject it and the notification would be silently dropped.
      createdBy: opts.actorId || null,
```

Replace the body of `notifyLearner` (keep its doc comment, update its second sentence to "Resolves the learner's auth profile by profile_id, then college/student email") with:

```ts
  try {
    const profileId = (await resolveLearnerProfileIds(svc as never, [opts.learnerId])).get(opts.learnerId);
    if (!profileId) return;
    await notifyProfile(svc, {
      profileId,
      actorId: opts.actorId,
      title: opts.title,
      body: opts.body,
      category: opts.category,
      url: opts.url,
    });
  } catch (e) {
    console.error('notifyLearner (non-fatal):', e);
  }
```

- [ ] **Step 5: Run to verify they pass, plus the existing notification and fine suites**

Run: `npx vitest run lib/notifications lib/fines`
Expected: PASS. If a `lib/fines/create.test.ts` case stubs `learners_profiles` for `notifyLearner`, update that stub to answer `rpc('tms_learner_profile_ids')` instead.

- [ ] **Step 6: Commit**

```bash
git add lib/notifications/learner-recipients.ts lib/notifications/learner-recipients.test.ts lib/notifications/notify.ts lib/notifications/notify.test.ts lib/fines
git commit -m "fix(notifications): reach email-only learners and keep system-actor notices"
```

---

### Task 4: The pure sweep planner

**Files:**
- Create: `lib/fees/payment-notice/plan.ts`
- Test: `lib/fees/payment-notice/plan.test.ts`

**Interfaces:**
- Consumes: `FeeNoticeConfig`, `computeExpiry` (Task 2).
- Produces:

```ts
export interface NoticeRow {
  id: string; person_id: string; status: 'running' | 'paid' | 'fined' | 'cancelled';
  started_at: string; expires_at: string; reminder_sent_at: string | null; source_bill_id: string | null;
}
export interface UnpaidBill { person_id: string; bill_id: string; created_at: string }
export interface PlanInput {
  now: Date;
  cfg: FeeNoticeConfig & { enabledAt: string };
  paid: Set<string>;            // person ids with Term 1 cleared
  overridden: Set<string>;      // person ids with any tms_fee_override row this year
  unpaidBills: UnpaidBill[];    // one Term 1 source bill per person
  fineAmount: Map<string, number>; // person id -> route charge (>0 only)
  notices: NoticeRow[];         // every notice this year
}
export interface OpenAction { person_id: string; source_bill_id: string; started_at: string; expires_at: string; amount: number }
export interface RemindAction { notice_id: string; person_id: string; expires_at: string; amount: number }
export interface FineAction { notice_id: string; person_id: string; source_bill_id: string | null; expires_at: string }
export interface SweepPlan {
  markPaid: string[]; cancel: string[]; open: OpenAction[]; remind: RemindAction[]; fine: FineAction[];
}
export function planSweep(input: PlanInput): SweepPlan
```

- [ ] **Step 1: Write the failing test**

```ts
// lib/fees/payment-notice/plan.test.ts
import { describe, it, expect } from 'vitest';
import { planSweep, type PlanInput, type NoticeRow } from './plan';

const NOW = new Date('2026-09-23T06:00:00.000Z');
const ENABLED = '2026-09-22T04:30:00.000Z';
const cfg = { enabled: true, windowHours: 48, reminderHoursBefore: 6, fineDueDays: 7, enabledAt: ENABLED };

function input(p: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW, cfg, paid: new Set(), overridden: new Set(), unpaidBills: [],
    fineAmount: new Map([['A', 1200], ['B', 900]]), notices: [], ...p,
  };
}
function notice(p: Partial<NoticeRow>): NoticeRow {
  return {
    id: 'N', person_id: 'A', status: 'running', started_at: ENABLED,
    expires_at: '2026-09-24T04:30:00.000Z', reminder_sent_at: null, source_bill_id: 'BILL', ...p,
  };
}

describe('planSweep — opening', () => {
  it('opens a notice for an unpaid learner, measured from go-live', () => {
    const plan = planSweep(input({ unpaidBills: [{ person_id: 'A', bill_id: 'BILL', created_at: '2026-07-01T00:00:00.000Z' }] }));
    expect(plan.open).toEqual([{
      person_id: 'A', source_bill_id: 'BILL', started_at: NOW.toISOString(),
      expires_at: '2026-09-24T04:30:00.000Z', amount: 1200,
    }]);
  });

  it('never opens for paid, overridden, unpriced, or already-noticed learners', () => {
    const bills = ['A', 'B', 'C', 'D'].map((p) => ({ person_id: p, bill_id: `b${p}`, created_at: ENABLED }));
    const plan = planSweep(input({
      unpaidBills: bills,
      paid: new Set(['A']),
      overridden: new Set(['B']),
      fineAmount: new Map([['A', 1], ['B', 1], ['D', 1]]), // C unpriced
      notices: [notice({ id: 'ND', person_id: 'D', status: 'fined' })],
    }));
    expect(plan.open).toEqual([]);
  });

  it('gives a fresh full window when the computed deadline is already past', () => {
    const plan = planSweep(input({
      cfg: { ...cfg, enabledAt: '2026-09-01T00:00:00.000Z' },
      unpaidBills: [{ person_id: 'A', bill_id: 'BILL', created_at: '2026-07-01T00:00:00.000Z' }],
    }));
    expect(plan.open[0].expires_at).toBe('2026-09-25T06:00:00.000Z');
  });
});

describe('planSweep — running notices', () => {
  it('marks paid BEFORE considering a fine, even when expired', () => {
    const plan = planSweep(input({
      paid: new Set(['A']),
      notices: [notice({ expires_at: '2026-09-23T05:59:00.000Z' })],
    }));
    expect(plan.markPaid).toEqual(['N']);
    expect(plan.fine).toEqual([]);
  });

  it('cancels a running notice whose learner got an override', () => {
    const plan = planSweep(input({ overridden: new Set(['A']), notices: [notice({})] }));
    expect(plan.cancel).toEqual(['N']);
    expect(plan.fine).toEqual([]);
  });

  it('fines an expired unpaid notice', () => {
    const plan = planSweep(input({ notices: [notice({ expires_at: '2026-09-23T06:00:00.000Z' })] }));
    expect(plan.fine).toEqual([{ notice_id: 'N', person_id: 'A', source_bill_id: 'BILL', expires_at: '2026-09-23T06:00:00.000Z' }]);
    expect(plan.remind).toEqual([]);
  });

  it('reminds once inside the reminder window', () => {
    const inside = notice({ expires_at: '2026-09-23T11:00:00.000Z' });
    expect(planSweep(input({ notices: [inside] })).remind).toEqual([
      { notice_id: 'N', person_id: 'A', expires_at: '2026-09-23T11:00:00.000Z', amount: 1200 },
    ]);
    const already = notice({ expires_at: '2026-09-23T11:00:00.000Z', reminder_sent_at: '2026-09-23T05:10:00.000Z' });
    expect(planSweep(input({ notices: [already] })).remind).toEqual([]);
    const early = notice({ expires_at: '2026-09-23T13:00:00.000Z' });
    expect(planSweep(input({ notices: [early] })).remind).toEqual([]);
  });

  it('ignores notices that are no longer running', () => {
    const plan = planSweep(input({
      notices: [notice({ status: 'paid' }), notice({ id: 'N2', status: 'fined', expires_at: '2026-09-01T00:00:00.000Z' })],
    }));
    expect(plan).toEqual({ markPaid: [], cancel: [], open: [], remind: [], fine: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/fees/payment-notice/plan.test.ts`
Expected: FAIL — cannot resolve `./plan`.

- [ ] **Step 3: Implement**

```ts
// lib/fees/payment-notice/plan.ts
// Pure decision core of the payment notice sweep. The IO layer (sweep.ts)
// gathers state; this decides what happens to it. Keeping it pure is what lets
// the money-sensitive rules below be tested without a database.
//
// ORDER IS THE CONTRACT: a running notice is checked for "paid" first, then for
// "overridden", and only then for expiry. A learner who paid minutes before the
// deadline must never be fined in the same run.

import { computeExpiry, type FeeNoticeConfig } from './config';

export interface NoticeRow {
  id: string;
  person_id: string;
  status: 'running' | 'paid' | 'fined' | 'cancelled';
  started_at: string;
  expires_at: string;
  reminder_sent_at: string | null;
  source_bill_id: string | null;
}
export interface UnpaidBill { person_id: string; bill_id: string; created_at: string }
export interface PlanInput {
  now: Date;
  cfg: FeeNoticeConfig & { enabledAt: string };
  paid: Set<string>;
  overridden: Set<string>;
  unpaidBills: UnpaidBill[];
  fineAmount: Map<string, number>;
  notices: NoticeRow[];
}
export interface OpenAction { person_id: string; source_bill_id: string; started_at: string; expires_at: string; amount: number }
export interface RemindAction { notice_id: string; person_id: string; expires_at: string; amount: number }
export interface FineAction { notice_id: string; person_id: string; source_bill_id: string | null; expires_at: string }
export interface SweepPlan {
  markPaid: string[];
  cancel: string[];
  open: OpenAction[];
  remind: RemindAction[];
  fine: FineAction[];
}

const HOUR_MS = 3_600_000;

export function planSweep(input: PlanInput): SweepPlan {
  const { now, cfg, paid, overridden, unpaidBills, fineAmount, notices } = input;
  const nowMs = now.getTime();
  const plan: SweepPlan = { markPaid: [], cancel: [], open: [], remind: [], fine: [] };

  for (const n of notices) {
    if (n.status !== 'running') continue;
    if (paid.has(n.person_id)) { plan.markPaid.push(n.id); continue; }
    if (overridden.has(n.person_id)) { plan.cancel.push(n.id); continue; }
    const expMs = Date.parse(n.expires_at);
    if (expMs <= nowMs) {
      plan.fine.push({ notice_id: n.id, person_id: n.person_id, source_bill_id: n.source_bill_id, expires_at: n.expires_at });
      continue;
    }
    if (!n.reminder_sent_at && expMs - nowMs <= cfg.reminderHoursBefore * HOUR_MS) {
      plan.remind.push({
        notice_id: n.id, person_id: n.person_id, expires_at: n.expires_at,
        amount: fineAmount.get(n.person_id) ?? 0,
      });
    }
  }

  const noticed = new Set(notices.map((n) => n.person_id));
  const seen = new Set<string>();
  for (const b of unpaidBills) {
    const p = b.person_id;
    if (seen.has(p) || noticed.has(p) || paid.has(p) || overridden.has(p)) continue;
    const amount = fineAmount.get(p);
    if (!amount || amount <= 0) continue;
    seen.add(p);
    let expires = computeExpiry(cfg.enabledAt, b.created_at, cfg.windowHours);
    // Nobody is fined without first seeing the timer (spec clarification).
    if (Date.parse(expires) <= nowMs) expires = new Date(nowMs + cfg.windowHours * HOUR_MS).toISOString();
    plan.open.push({ person_id: p, source_bill_id: b.bill_id, started_at: now.toISOString(), expires_at: expires, amount });
  }

  return plan;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/fees/payment-notice/plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/payment-notice/plan.ts lib/fees/payment-notice/plan.test.ts
git commit -m "feat(fees): pure planner for the payment notice sweep"
```

---

### Task 5: The sweep — load, plan, execute

**Files:**
- Create: `lib/fees/payment-notice/messages.ts`
- Create: `lib/fees/payment-notice/sweep.ts`
- Test: `lib/fees/payment-notice/sweep.test.ts`
- Modify: `lib/fees/__testing__/fake-supabase.ts` (add `upsert`, add `in` recording is already present)

**Interfaces:**
- Consumes: `loadFeeNoticeConfig`, `istDate`, `addDays` (Task 2); `planSweep` and types (Task 4); `resolveLearnerProfileIds` (Task 3); `term1PaidLearnerIds(svc, yearId): Promise<Set<string>>` from `lib/fees/term1.ts`; `createFines(svc, CreateFinesInput): Promise<CreateFinesResult>` from `lib/fines/create.ts`; `dispatchNotification` from `lib/notifications/dispatch.ts`; `logSystemActivity` from `lib/activity/log.ts`.
- Produces:

```ts
export interface SweepSummary {
  skipped?: 'disabled' | 'no_current_transport_year';
  dryRun: boolean;
  opened: number; paid: number; cancelled: number; reminded: number;
  fined: number; fineSkipped: number; errors: number;
}
export interface SweepDeps {
  term1PaidLearnerIds: typeof term1PaidLearnerIds;
  createFines: typeof createFines;
  notify: (svc: SupabaseClient, msgs: LearnerMessage[]) => Promise<void>;
  logSystemActivity: typeof logSystemActivity;
}
export function runPaymentNoticeSweep(
  svc: SupabaseClient,
  opts?: { dryRun?: boolean; now?: Date; deps?: Partial<SweepDeps> },
): Promise<SweepSummary>
// messages.ts
export interface LearnerMessage { learnerId: string; title: string; body: string; idempotencyKey: string; expiresAt?: string | null }
export const FINE_REASON = 'Transport Maintenance Fee unpaid 48 hours after notice';
export function startMessage(noticeId: string, learnerId: string, expiresAt: string, amount: number): LearnerMessage
export function reminderMessage(noticeId: string, learnerId: string, expiresAt: string, amount: number): LearnerMessage
export function formatIstDateTime(iso: string): string
```

- [ ] **Step 1: Add `upsert` to the fake client**

In `lib/fees/__testing__/fake-supabase.ts`, directly after the `b.insert = …` block, add:

```ts
    b.upsert = (payload: unknown, options?: unknown) => {
      call.ops.push(['upsert', [payload, options]]);
      const upErr = opts.insertErrors?.[table] ?? err();
      const rowsOut = (Array.isArray(payload) ? payload : [payload]).map((r, i) => ({
        id: `fake-${table}-up-${++insertSeq}-${i}`,
        ...(r as object),
      }));
      const up: any = { select: () => up };
      up.then = (res: any, rej: any) =>
        Promise.resolve({ data: upErr ? null : rowsOut, error: upErr }).then(res, rej);
      return up;
    };
```

- [ ] **Step 2: Write messages.ts**

```ts
// lib/fees/payment-notice/messages.ts
export const FINE_REASON = 'Transport Maintenance Fee unpaid 48 hours after notice';

export interface LearnerMessage {
  learnerId: string;
  title: string;
  body: string;
  idempotencyKey: string;
  expiresAt?: string | null;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function formatIstDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function startMessage(noticeId: string, learnerId: string, expiresAt: string, amount: number): LearnerMessage {
  return {
    learnerId,
    title: 'Pay your Transport Maintenance Fee within 48 hours',
    body: `Pay your Transport Maintenance Fee by ${formatIstDateTime(expiresAt)} or a Transport Fee of ${inr(amount)} will be added.`,
    idempotencyKey: `payment-notice-start:${noticeId}`,
    expiresAt,
  };
}

export function reminderMessage(noticeId: string, learnerId: string, expiresAt: string, amount: number): LearnerMessage {
  return {
    learnerId,
    title: 'Last few hours to pay your Transport Maintenance Fee',
    body: `Pay by ${formatIstDateTime(expiresAt)} to avoid a Transport Fee of ${inr(amount)}.`,
    idempotencyKey: `payment-notice-remind:${noticeId}`,
    expiresAt,
  };
}
```

- [ ] **Step 3: Write the failing sweep test**

```ts
// lib/fees/payment-notice/sweep.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { runPaymentNoticeSweep } from './sweep';

const NOW = new Date('2026-09-23T06:00:00.000Z');
const SETTINGS = [{
  settings_data: { enabled: true, window_hours: 48, reminder_hours_before: 6, fine_due_days: 7, enabled_at: '2026-09-22T04:30:00.000Z' },
}];

function deps(over: Record<string, unknown> = {}) {
  return {
    term1PaidLearnerIds: vi.fn(async () => new Set<string>()),
    createFines: vi.fn(async () => ({ created: 1, totalAmount: 1200, skipped: [], duplicates: 0, errors: 0 })),
    notify: vi.fn(async () => {}),
    logSystemActivity: vi.fn(async () => {}),
    ...over,
  };
}

function base(extra: Record<string, unknown[]> = {}) {
  return makeFakeSupabase({
    admin_settings: SETTINGS,
    tms_transport_year: [{ id: 'Y' }],
    tms_fee_bill: [],
    tms_fee_override: [],
    tms_fee_payment_notice: [],
    learners_profiles: [{ id: 'A', transport_stop_id: 'S1' }],
    tms_fine_stop_rate: [{ stop_id: 'S1', fine_amount: 1200 }],
    tms_fee_fine: [{ id: 'F1' }],
    ...extra,
  });
}

describe('runPaymentNoticeSweep', () => {
  it('does nothing when the switch is off', async () => {
    const svc = makeFakeSupabase({ admin_settings: [] });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.skipped).toBe('disabled');
    expect(d.createFines).not.toHaveBeenCalled();
  });

  it('opens a notice and notifies the learner', async () => {
    const svc = base({ tms_fee_bill: [{ id: 'BILL', person_id: 'A', term_no: 1, created_at: '2026-07-01T00:00:00.000Z', status: 'generated' }] });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.opened).toBe(1);
    const up = svc.calls.find((c) => c.table === 'tms_fee_payment_notice' && c.ops.some(([op]) => op === 'upsert'));
    expect(up).toBeTruthy();
    expect(d.notify).toHaveBeenCalledTimes(1);
  });

  it('fines an expired notice through createFines with the notice idempotency key', async () => {
    const svc = base({
      tms_fee_payment_notice: [{
        id: 'N', person_id: 'A', status: 'running', started_at: '2026-09-21T06:00:00.000Z',
        expires_at: '2026-09-23T05:00:00.000Z', reminder_sent_at: '2026-09-23T00:00:00.000Z', source_bill_id: 'BILL',
      }],
    });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.fined).toBe(1);
    expect(d.createFines).toHaveBeenCalledWith(svc, expect.objectContaining({
      transportYearId: 'Y', personIds: ['A'], idempotencyKey: 'payment-notice:N', actorId: null, notify: true,
      reason: 'Transport Maintenance Fee unpaid 48 hours after notice', dueDate: '2026-09-30',
      sourceBillByPerson: { A: 'BILL' },
    }));
    expect(d.logSystemActivity).toHaveBeenCalledWith(expect.objectContaining({ module: 'fees', action: 'generate' }));
  });

  it('keeps the notice running when createFines skips the learner', async () => {
    const svc = base({
      tms_fee_payment_notice: [{
        id: 'N', person_id: 'A', status: 'running', started_at: '2026-09-21T06:00:00.000Z',
        expires_at: '2026-09-23T05:00:00.000Z', reminder_sent_at: null, source_bill_id: 'BILL',
      }],
    });
    const d = deps({
      createFines: vi.fn(async () => ({ created: 0, totalAmount: 0, skipped: [{ person_id: 'A', person_name: 'x', reason: 'no_rate' }], duplicates: 0, errors: 0 })),
    });
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.fined).toBe(0);
    expect(out.fineSkipped).toBe(1);
    const fineUpdate = svc.calls.find((c) =>
      c.table === 'tms_fee_payment_notice' &&
      c.ops.some(([op, args]) => op === 'update' && (args[0] as { status?: string }).status === 'fined'));
    expect(fineUpdate).toBeUndefined();
  });

  it('dry run writes nothing and calls nothing', async () => {
    const svc = base({ tms_fee_bill: [{ id: 'BILL', person_id: 'A', term_no: 1, created_at: '2026-07-01T00:00:00.000Z', status: 'generated' }] });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d, dryRun: true });
    expect(out.opened).toBe(1);
    expect(d.notify).not.toHaveBeenCalled();
    expect(svc.calls.some((c) => c.ops.some(([op]) => op === 'upsert' || op === 'update' || op === 'insert'))).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run lib/fees/payment-notice/sweep.test.ts`
Expected: FAIL — cannot resolve `./sweep`.

- [ ] **Step 5: Implement sweep.ts**

```ts
// lib/fees/payment-notice/sweep.ts
// The scheduled 48-hour payment notice sweep. Loads state, asks planSweep()
// what to do, and does it. Every fine goes through createFines() so the
// money-row-first write order, the compensating delete, and the 23505
// idempotency no-op are reused, never re-implemented.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadFeeNoticeConfig, istDate, addDays } from './config';
import { planSweep, type NoticeRow, type UnpaidBill } from './plan';
import { FINE_REASON, startMessage, reminderMessage, type LearnerMessage } from './messages';
import { term1PaidLearnerIds } from '@/lib/fees/term1';
import { createFines } from '@/lib/fines/create';
import { logSystemActivity } from '@/lib/activity/log';
import { resolveLearnerProfileIds } from '@/lib/notifications/learner-recipients';
import { dispatchNotification } from '@/lib/notifications/dispatch';

const CHUNK = 150;

export interface SweepSummary {
  skipped?: 'disabled' | 'no_current_transport_year';
  dryRun: boolean;
  opened: number;
  paid: number;
  cancelled: number;
  reminded: number;
  fined: number;
  fineSkipped: number;
  errors: number;
}

export interface SweepDeps {
  term1PaidLearnerIds: typeof term1PaidLearnerIds;
  createFines: typeof createFines;
  notify: (svc: SupabaseClient, msgs: LearnerMessage[]) => Promise<void>;
  logSystemActivity: typeof logSystemActivity;
}

/** Best-effort: one dispatch per learner; failures are logged, never thrown. */
async function notifyLearners(svc: SupabaseClient, msgs: LearnerMessage[]): Promise<void> {
  if (!msgs.length) return;
  let profiles: Map<string, string>;
  try {
    profiles = await resolveLearnerProfileIds(svc, msgs.map((m) => m.learnerId));
  } catch (e) {
    console.error('[payment-notice] recipient resolution failed', e);
    return;
  }
  for (const m of msgs) {
    const profileId = profiles.get(m.learnerId);
    if (!profileId) continue;
    try {
      await dispatchNotification(svc as never, {
        title: m.title,
        body: m.body,
        category: 'fees',
        priority: 'urgent',
        url: '/student/fees',
        createdBy: null,
        expiresAt: m.expiresAt ?? null,
        idempotencyKey: m.idempotencyKey,
        targeting: { type: 'users', user_ids: [profileId] },
      });
    } catch (e) {
      console.error('[payment-notice] notify failed', m.idempotencyKey, e);
    }
  }
}

const DEFAULT_DEPS: SweepDeps = { term1PaidLearnerIds, createFines, notify: notifyLearners, logSystemActivity };

const empty = (dryRun: boolean): SweepSummary => ({
  dryRun, opened: 0, paid: 0, cancelled: 0, reminded: 0, fined: 0, fineSkipped: 0, errors: 0,
});

async function loadUnpaidBills(svc: SupabaseClient, yearId: string, paid: Set<string>): Promise<UnpaidBill[]> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .select('id, person_id, term_no, created_at, status')
    .eq('transport_year_id', yearId)
    .eq('person_type', 'learner')
    .eq('status', 'generated');
  if (error) throw new Error(`Failed to load bills: ${error.message}`);
  // One source bill per person: the lowest term_no, earliest created.
  const best = new Map<string, { id: string; term_no: number; created_at: string }>();
  for (const r of (data ?? []) as Array<{ id: string; person_id: string; term_no: number | null; created_at: string }>) {
    if (paid.has(r.person_id)) continue;
    const t = r.term_no ?? Number.MAX_SAFE_INTEGER;
    const cur = best.get(r.person_id);
    if (!cur || t < cur.term_no || (t === cur.term_no && r.created_at < cur.created_at)) {
      best.set(r.person_id, { id: r.id, term_no: t, created_at: r.created_at });
    }
  }
  return [...best.entries()].map(([person_id, b]) => ({ person_id, bill_id: b.id, created_at: b.created_at }));
}

async function loadFineAmounts(svc: SupabaseClient, yearId: string, personIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!personIds.length) return out;
  const { data: rates, error: rateErr } = await svc
    .from('tms_fine_stop_rate')
    .select('stop_id, fine_amount')
    .eq('transport_year_id', yearId);
  if (rateErr) throw new Error(`Failed to load fine rates: ${rateErr.message}`);
  const byStop = new Map(
    ((rates ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [r.stop_id, Number(r.fine_amount)]),
  );
  for (let i = 0; i < personIds.length; i += CHUNK) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select('id, transport_stop_id')
      .in('id', personIds.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to load learner stops: ${error.message}`);
    for (const l of (data ?? []) as Array<{ id: string; transport_stop_id: string | null }>) {
      const amt = l.transport_stop_id ? byStop.get(l.transport_stop_id) : undefined;
      if (amt && amt > 0) out.set(l.id, amt);
    }
  }
  return out;
}

async function updateStatus(svc: SupabaseClient, ids: string[], status: 'paid' | 'cancelled', nowIso: string) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await svc
      .from('tms_fee_payment_notice')
      .update({ status, updated_at: nowIso })
      .in('id', ids.slice(i, i + CHUNK))
      .eq('status', 'running');
    if (error) throw new Error(`Failed to mark notices ${status}: ${error.message}`);
  }
}

export async function runPaymentNoticeSweep(
  svc: SupabaseClient,
  opts: { dryRun?: boolean; now?: Date; deps?: Partial<SweepDeps> } = {},
): Promise<SweepSummary> {
  const dryRun = opts.dryRun === true;
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const d: SweepDeps = { ...DEFAULT_DEPS, ...opts.deps };
  const out = empty(dryRun);

  const cfg = await loadFeeNoticeConfig(svc);
  if (!cfg.enabled || !cfg.enabledAt) return { ...out, skipped: 'disabled' };

  const { data: ty } = await svc.from('tms_transport_year').select('id').eq('is_current', true).limit(1);
  const yearId = (ty as Array<{ id: string }> | null)?.[0]?.id ?? null;
  if (!yearId) return { ...out, skipped: 'no_current_transport_year' };

  const paid = await d.term1PaidLearnerIds(svc, yearId);
  const unpaidBills = await loadUnpaidBills(svc, yearId, paid);

  const { data: ovr, error: ovrErr } = await svc
    .from('tms_fee_override')
    .select('person_id')
    .eq('transport_year_id', yearId);
  if (ovrErr) throw new Error(`Failed to load overrides: ${ovrErr.message}`);
  const overridden = new Set(((ovr ?? []) as Array<{ person_id: string }>).map((r) => r.person_id));

  const { data: nrows, error: nErr } = await svc
    .from('tms_fee_payment_notice')
    .select('id, person_id, status, started_at, expires_at, reminder_sent_at, source_bill_id')
    .eq('transport_year_id', yearId);
  if (nErr) throw new Error(`Failed to load notices: ${nErr.message}`);
  const notices = (nrows ?? []) as NoticeRow[];

  const people = [...new Set([
    ...unpaidBills.map((b) => b.person_id),
    ...notices.filter((n) => n.status === 'running').map((n) => n.person_id),
  ])];
  const fineAmount = await loadFineAmounts(svc, yearId, people);

  const plan = planSweep({
    now, cfg: { ...cfg, enabledAt: cfg.enabledAt }, paid, overridden, unpaidBills, fineAmount, notices,
  });

  out.paid = plan.markPaid.length;
  out.cancelled = plan.cancel.length;
  out.opened = plan.open.length;
  out.reminded = plan.remind.length;
  if (dryRun) {
    out.fined = plan.fine.length;
    return out;
  }

  // 1. paid / cancelled
  await updateStatus(svc, plan.markPaid, 'paid', nowIso);
  await updateStatus(svc, plan.cancel, 'cancelled', nowIso);

  // 2. open (ignoreDuplicates: an overlapping run that already opened one is a no-op)
  const opened: Array<{ id: string; person_id: string; expires_at: string }> = [];
  for (let i = 0; i < plan.open.length; i += CHUNK) {
    const batch = plan.open.slice(i, i + CHUNK).map((o) => ({
      person_id: o.person_id, transport_year_id: yearId, source_bill_id: o.source_bill_id,
      started_at: o.started_at, expires_at: o.expires_at, status: 'running',
    }));
    const { data, error } = await svc
      .from('tms_fee_payment_notice')
      .upsert(batch, { onConflict: 'person_id,transport_year_id', ignoreDuplicates: true })
      .select('id, person_id, expires_at');
    if (error) { console.error('[payment-notice] open failed', error.message); out.errors += batch.length; continue; }
    opened.push(...((data ?? []) as typeof opened));
  }
  out.opened = opened.length;
  if (opened.length) {
    await d.notify(svc, opened.map((n) =>
      startMessage(n.id, n.person_id, n.expires_at, fineAmount.get(n.person_id) ?? 0)));
  }

  // 3. remind — stamp first so a crash after sending can't cause a resend storm;
  // the dispatch idempotency key covers the reverse case.
  for (const r of plan.remind) {
    const { error } = await svc
      .from('tms_fee_payment_notice')
      .update({ reminder_sent_at: nowIso, updated_at: nowIso })
      .eq('id', r.notice_id)
      .is('reminder_sent_at', null);
    if (error) { out.errors++; continue; }
  }
  if (plan.remind.length) {
    await d.notify(svc, plan.remind.map((r) => reminderMessage(r.notice_id, r.person_id, r.expires_at, r.amount)));
  }

  // 4. fine
  for (const f of plan.fine) {
    try {
      const key = `payment-notice:${f.notice_id}`;
      const res = await d.createFines(svc, {
        transportYearId: yearId,
        personIds: [f.person_id],
        dueDate: addDays(istDate(f.expires_at), cfg.fineDueDays),
        reason: FINE_REASON,
        notify: true,
        idempotencyKey: key,
        actorId: null,
        sourceBillByPerson: f.source_bill_id ? { [f.person_id]: f.source_bill_id } : undefined,
      });
      if (res.created + res.duplicates === 0) {
        if (res.skipped.length) {
          out.fineSkipped++;
          console.warn('[payment-notice] fine skipped; notice stays running', f.notice_id, res.skipped[0]?.reason);
        } else {
          out.errors++;
        }
        continue;
      }
      const { data: fine, error: fErr } = await svc
        .from('tms_fee_fine')
        .select('id')
        .eq('idempotency_key', `${key}:${f.person_id}`)
        .maybeSingle();
      const fineId = (fine as { id: string } | null)?.id;
      if (fErr || !fineId) { out.errors++; continue; }
      const { error: uErr } = await svc
        .from('tms_fee_payment_notice')
        .update({ status: 'fined', fine_id: fineId, updated_at: nowIso })
        .eq('id', f.notice_id)
        .eq('status', 'running');
      if (uErr) { out.errors++; continue; }
      out.fined++;
      await d.logSystemActivity({
        module: 'fees',
        action: 'generate',
        entityType: 'tms_fee_fine',
        entityId: fineId,
        description: `Transport Fee raised automatically: maintenance fee unpaid 48 hours after notice`,
        metadata: { notice_id: f.notice_id, person_id: f.person_id, expires_at: f.expires_at },
      });
    } catch (e) {
      console.error('[payment-notice] fine failed', f.notice_id, e);
      out.errors++;
    }
  }

  return out;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run lib/fees/payment-notice lib/fees/generate.test.ts`
Expected: PASS (the fake-client `upsert` addition must not break `generate.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add lib/fees/payment-notice lib/fees/__testing__/fake-supabase.ts
git commit -m "feat(fees): payment notice sweep raises Transport Fee through createFines"
```

---

### Task 6: Cron route, proxy allowlist, and the schedule migration

**Files:**
- Create: `app/api/cron/fee-payment-notices/route.ts`
- Modify: `proxy.ts` (the exact-path cron allowlist, next to `'/api/cron/auto-generate-bills',` at ~line 25)
- Create: `supabase/migrations/20260921120100_schedule_fee_payment_notice_sweep.sql` (**NOT applied in this task**)

**Interfaces:**
- Consumes: `runPaymentNoticeSweep` (Task 5).
- Produces: `GET /api/cron/fee-payment-notices[?dryRun=1]` → `{ success: true, data: SweepSummary }` or 401/500.

- [ ] **Step 1: Write the route**

```ts
/**
 * 48-hour Transport Maintenance Fee payment notice sweep.
 *
 * Scheduled from pg_cron every 5 minutes via pg_net with
 * `Authorization: Bearer $CRON_SECRET` (migration
 * 20260921120100_schedule_fee_payment_notice_sweep.sql). proxy.ts allowlists
 * this EXACT path. Safe to call repeatedly: notices are unique per learner and
 * year, and fines are idempotent on `payment-notice:<notice id>`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runPaymentNoticeSweep } from '@/lib/fees/payment-notice/sweep';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  try {
    const summary = await runPaymentNoticeSweep(createServiceRoleClient(), { dryRun });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[fee-payment-notices] run failed', e);
    return NextResponse.json({ error: 'Payment notice sweep failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Allowlist the exact path in `proxy.ts`**

Directly below the line `'/api/cron/auto-generate-bills',` add:

```ts
  '/api/cron/fee-payment-notices',
```

- [ ] **Step 3: Write (do not apply) the schedule migration**

```sql
-- ⚠ NOT YET APPLIED. Apply only after the branch is deployed, otherwise the job
-- 404s every 5 minutes. Applying it does NOT start charging: the sweep is a
-- no-op until an admin turns the switch on in Settings → Fee Notice.
--
-- Same pg_cron + pg_net mechanism as tms-auto-generate-bills (Vercel crons have
-- never fired on this project). Every 5 minutes, so a Transport Fee lands at
-- most ~5 minutes after a learner's 48 hours end.

do $$
begin
  perform cron.unschedule('tms-fee-payment-notices');
exception when others then
  null; -- job did not exist
end $$;

select cron.schedule(
  'tms-fee-payment-notices',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/fee-payment-notices',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verification (run separately after applying):
--   select jobname, schedule, active from cron.job where jobname = 'tms-fee-payment-notices';
```

- [ ] **Step 4: Probe the route locally**

Start the dev server in the worktree, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/cron/fee-payment-notices
# expect 401 (reaches the route; proxy did not 401 it for a missing session — the body is {"error":"Unauthorized"})
curl -s -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:3000/api/cron/fee-payment-notices?dryRun=1"
# expect {"success":true,"data":{"skipped":"disabled",...}} while the switch is off
```

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/fee-payment-notices/route.ts proxy.ts supabase/migrations/20260921120100_schedule_fee_payment_notice_sweep.sql
git commit -m "feat(fees): cron route for the payment notice sweep"
```

---

### Task 7: The admin switch — API and Settings tab

**Files:**
- Create: `app/api/admin/settings/fee-payment-notice/route.ts`
- Create: `components/admin/fee-notice-settings.tsx`
- Modify: `app/(admin)/settings/page.tsx` (import, `tabs` array ~line 77, `switch (activeTab)` ~line 368)

**Interfaces:**
- Consumes: `FeeNoticeConfig`, `loadFeeNoticeConfig`, `toStoredFeeNoticeConfig`, `validateFeeNoticeInput`, `FEE_NOTICE_SETTING_TYPE` (Task 2).
- Produces: `GET /api/admin/settings/fee-payment-notice` → `{ success, data: { config: FeeNoticeConfig } }` (`tms.settings.view`); `PUT` body `{ enabled, windowHours, reminderHoursBefore, fineDueDays }` → same shape (`tms.settings.manage`).

Behaviour on PUT:
- off → on: `enabledAt = now`; every `running` notice gets `expires_at = now + windowHours`, `reminder_sent_at = null` (no one is fined for time that passed while paused).
- on → on: settings saved, `enabledAt` unchanged, running notices untouched.
- → off: `enabled = false`, `enabledAt` kept (ignored while off).

- [ ] **Step 1: Write the API route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import {
  FEE_NOTICE_SETTING_TYPE, loadFeeNoticeConfig, toStoredFeeNoticeConfig, validateFeeNoticeInput,
  type FeeNoticeConfig,
} from '@/lib/fees/payment-notice/config';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getConfig(auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const config = await loadFeeNoticeConfig(createServiceRoleClient());
  return NextResponse.json({ success: true, data: { config } });
}

async function saveConfig(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    }
    const input = {
      windowHours: Number(body.windowHours),
      reminderHoursBefore: Number(body.reminderHoursBefore),
      fineDueDays: Number(body.fineDueDays),
    };
    const invalid = validateFeeNoticeInput(input);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const svc = createServiceRoleClient();
    const before = await loadFeeNoticeConfig(svc);
    const nowIso = new Date().toISOString();
    const turningOn = body.enabled && !before.enabled;
    const next: FeeNoticeConfig = {
      enabled: body.enabled,
      ...input,
      enabledAt: turningOn ? nowIso : before.enabledAt,
    };

    const { error } = await svc.from('admin_settings').upsert(
      {
        setting_type: FEE_NOTICE_SETTING_TYPE,
        settings_data: toStoredFeeNoticeConfig(next),
        updated_at: nowIso,
        updated_by: auth.userId,
      },
      { onConflict: 'setting_type' },
    );
    if (error) {
      console.error('fee-payment-notice settings save failed:', error.message);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    let restarted = 0;
    if (turningOn) {
      const { data: rows, error: rErr } = await svc
        .from('tms_fee_payment_notice')
        .update({
          expires_at: new Date(Date.parse(nowIso) + next.windowHours * 3_600_000).toISOString(),
          reminder_sent_at: null,
          updated_at: nowIso,
        })
        .eq('status', 'running')
        .select('id');
      if (rErr) console.error('fee-payment-notice restart failed:', rErr.message);
      restarted = (rows ?? []).length;
    }

    await logActivity(auth, request, {
      module: 'settings',
      action: 'update',
      entityType: 'admin_settings',
      entityId: FEE_NOTICE_SETTING_TYPE,
      entityLabel: '48-hour fee payment notice',
      description: turningOn
        ? `Turned the 48-hour fee payment notice ON (${restarted} running notices restarted)`
        : `Updated the 48-hour fee payment notice (enabled: ${next.enabled})`,
      changes: { before, after: next },
    });

    return NextResponse.json({ success: true, data: { config: next } });
  } catch (e) {
    console.error('fee-payment-notice settings error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_request, auth) => getConfig(auth));
export const PUT = withAuth((request, auth) => saveConfig(request as NextRequest, auth));
```

- [ ] **Step 2: Write the Settings tab component**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Timer, Save, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { FeeNoticeConfig } from '@/lib/fees/payment-notice/config';
import { validateFeeNoticeInput } from '@/lib/fees/payment-notice/config';

/**
 * The on/off switch for the 48-hour Transport Maintenance Fee payment notice.
 * Turning it ON is go-live: every unpaid learner gets 48 hours from that
 * moment, after which a Transport Fee is raised automatically.
 */
export function FeeNoticeSettings() {
  const [cfg, setCfg] = useState<FeeNoticeConfig | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/settings/fee-payment-notice', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (res.ok && json?.success) setCfg(json.data.config as FeeNoticeConfig);
        else setLoadFailed(true);
      } catch {
        setLoadFailed(true);
      }
    })();
  }, []);

  if (loadFailed) {
    return <p className="p-6 text-sm text-red-600 dark:text-red-400">Could not load the fee notice settings. Reload to try again.</p>;
  }
  if (!cfg) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-green-600" /></div>;
  }

  const save = async (enabled: boolean) => {
    const invalid = validateFeeNoticeInput(cfg);
    if (invalid) { toast.error(invalid); return; }
    if (enabled && !cfg.enabled && !window.confirm(
      `Turn on now? Every learner with an unpaid Term 1 Transport Maintenance Fee gets ${cfg.windowHours} hours from now, then a Transport Fee is added automatically.`,
    )) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/fee-payment-notice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ enabled, windowHours: cfg.windowHours, reminderHoursBefore: cfg.reminderHoursBefore, fineDueDays: cfg.fineDueDays }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Save failed');
      setCfg(json.data.config as FeeNoticeConfig);
      toast.success(enabled ? 'Fee payment notice is ON' : 'Fee payment notice saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const num = (key: 'windowHours' | 'reminderHoursBefore' | 'fineDueDays') => (
    <input
      type="number"
      min={0}
      value={cfg[key]}
      onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
      className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
    />
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-3">
        <Timer className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">48-hour fee payment notice</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Learners with an unpaid Term 1 Transport Maintenance Fee see a countdown. If it runs out, a Transport Fee
            (their route charge) is added automatically. Learners with a concession or override are never included.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.enabled
          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
          {cfg.enabled ? 'ON' : 'OFF'}
        </span>
        {cfg.enabled && cfg.enabledAt && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            since {new Date(cfg.enabledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm"><span className="block text-gray-700 dark:text-gray-300">Payment window (hours)</span>{num('windowHours')}</label>
        <label className="space-y-1 text-sm"><span className="block text-gray-700 dark:text-gray-300">Reminder (hours before end)</span>{num('reminderHoursBefore')}</label>
        <label className="space-y-1 text-sm"><span className="block text-gray-700 dark:text-gray-300">Transport Fee due after (days)</span>{num('fineDueDays')}</label>
      </div>

      {!cfg.enabled && (
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Turning this on starts the countdown for every unpaid learner immediately.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {cfg.enabled ? (
          <>
            <button type="button" disabled={saving} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
            <button type="button" disabled={saving} onClick={() => save(false)} className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300">
              Turn off
            </button>
          </>
        ) : (
          <button type="button" disabled={saving} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Timer className="h-4 w-4" />} Turn on
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab in `app/(admin)/settings/page.tsx`**

Add the import beside the `AttendanceWindowSettings` import:

```ts
import { FeeNoticeSettings } from '@/components/admin/fee-notice-settings';
```

Add `Timer` to the existing `lucide-react` import. In the `tabs` array, after the `attendance` entry, add:

```ts
    { id: 'fee-notice', name: 'Fee Notice', icon: Timer },
```

In `switch (activeTab)`, after `case 'attendance':`, add:

```ts
      case 'fee-notice':
        return <FeeNoticeSettings />;
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "fee-notice-settings|fee-payment-notice|settings/page"`
Expected: no output. Then in your browser (auth-gated): Settings → Fee Notice loads showing OFF with 48 / 6 / 7. **Do not press Turn on yet** (the go-live is Task 10).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/settings/fee-payment-notice/route.ts components/admin/fee-notice-settings.tsx "app/(admin)/settings/page.tsx"
git commit -m "feat(settings): Fee Notice tab switches the 48-hour payment notice"
```

---

### Task 8: Admin "Payment notices" view in Bill Management

**Files:**
- Create: `app/api/admin/fees/payment-notices/route.ts`
- Create: `app/(admin)/bill-management/payment-notice-columns.tsx`
- Modify: `app/(admin)/bill-management/page.tsx` (`View` union line 25; the fines-isAll reset line 73; a new `useQuery`; a `ToggleBtn` after the Transport Fee toggle ~line 199; a render branch before `view === 'fines' ?` ~line 227)

**Interfaces:**
- Produces: `GET /api/admin/fees/payment-notices?year=<id>` (`tms.fees.view`) → `{ success, data: { rows: PaymentNoticeRow[] } }`

```ts
export interface PaymentNoticeRow {
  id: string; person_id: string; person_name: string; roll_number: string | null;
  status: 'running' | 'paid' | 'fined' | 'cancelled';
  started_at: string; expires_at: string; reminder_sent_at: string | null; fine_id: string | null;
}
```

- [ ] **Step 1: Write the API route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

export interface PaymentNoticeRow {
  id: string;
  person_id: string;
  person_name: string;
  roll_number: string | null;
  status: 'running' | 'paid' | 'fined' | 'cancelled';
  started_at: string;
  expires_at: string;
  reminder_sent_at: string | null;
  fine_id: string | null;
}

const CHUNK = 150;

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

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
    const { data, error } = await svc
      .from('tms_fee_payment_notice')
      .select('id, person_id, status, started_at, expires_at, reminder_sent_at, fine_id')
      .eq('transport_year_id', year)
      .order('expires_at', { ascending: true });
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ success: true, data: { rows: [] } });
      console.error('payment-notices list failed:', error.message);
      return NextResponse.json({ error: 'Failed to load payment notices' }, { status: 500 });
    }
    const notices = (data ?? []) as Array<Omit<PaymentNoticeRow, 'person_name' | 'roll_number'>>;
    const ids = [...new Set(notices.map((n) => n.person_id))];
    const names = new Map<string, { name: string; roll: string | null }>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: lp, error: lErr } = await svc
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number')
        .in('id', ids.slice(i, i + CHUNK));
      if (lErr) {
        console.error('payment-notices learner lookup failed:', lErr.message);
        return NextResponse.json({ error: 'Failed to load payment notices' }, { status: 500 });
      }
      for (const l of (lp ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null }>) {
        names.set(l.id, { name: [l.first_name, l.last_name].filter(Boolean).join(' ').trim(), roll: l.roll_number });
      }
    }
    const rows: PaymentNoticeRow[] = notices.map((n) => ({
      ...n,
      person_name: names.get(n.person_id)?.name || '—',
      roll_number: names.get(n.person_id)?.roll ?? null,
    }));
    return NextResponse.json({ success: true, data: { rows } });
  } catch (e) {
    console.error('payment-notices error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => list(request as NextRequest, auth));
```

- [ ] **Step 2: Write the columns**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { PaymentNoticeRow } from '@/app/api/admin/fees/payment-notices/route';

const STATUS_STYLE: Record<PaymentNoticeRow['status'], string> = {
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  fined: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function paymentNoticeColumns(): ColumnDef<PaymentNoticeRow>[] {
  return [
    { accessorKey: 'person_name', header: 'Learner' },
    { accessorKey: 'roll_number', header: 'Roll no.', cell: ({ row }) => row.original.roll_number ?? '—' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[row.original.status]}`}>
          {row.original.status}
        </span>
      ),
    },
    { accessorKey: 'started_at', header: 'Started', cell: ({ row }) => ist(row.original.started_at) },
    { accessorKey: 'expires_at', header: 'Deadline', cell: ({ row }) => ist(row.original.expires_at) },
    {
      id: 'left',
      header: 'Time left',
      cell: ({ row }) => (row.original.status === 'running' ? timeLeft(row.original.expires_at) : '—'),
    },
    { id: 'reminded', header: 'Reminded', cell: ({ row }) => (row.original.reminder_sent_at ? 'Yes' : 'No') },
  ];
}
```

- [ ] **Step 3: Wire it into `app/(admin)/bill-management/page.tsx`**

1. Change the `View` union (line 25) to:

```ts
type View = 'bills' | 'unbilled' | 'analytics' | 'fines' | 'concessions' | 'notices';
```

2. In the effect at line 73 add `view === 'notices'` to the reset condition:

```ts
    if (isAll && (view === 'unbilled' || view === 'fines' || view === 'concessions' || view === 'notices')) setView('bills');
```

3. Add imports:

```ts
import { paymentNoticeColumns } from './payment-notice-columns';
import type { PaymentNoticeRow } from '@/app/api/admin/fees/payment-notices/route';
```

4. After the `fines` `useQuery` (line ~94-98) add:

```ts
  const { data: notices, isLoading: noticesLoading } = useQuery({
    queryKey: ['payment-notices', selectedYear],
    queryFn: async (): Promise<PaymentNoticeRow[]> => {
      const res = await fetch(`/api/admin/fees/payment-notices?year=${encodeURIComponent(selectedYear)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load payment notices');
      return json.data.rows as PaymentNoticeRow[];
    },
    enabled: !!selectedYear && !isAll && view === 'notices',
    refetchInterval: view === 'notices' ? 60_000 : false,
  });
  const noticeColumns = useMemo(() => paymentNoticeColumns(), []);
```

5. After the Transport Fee `ToggleBtn` (the one closing at ~line 201) add:

```tsx
        <ToggleBtn active={view === 'notices'} onClick={() => setView('notices')} disabled={isAll}>
          Payment notices{notices ? ` (${notices.filter((n) => n.status === 'running').length} running)` : ''}
        </ToggleBtn>
```

6. In the render chain, immediately before `) : view === 'fines' ? (`, insert:

```tsx
      ) : view === 'notices' ? (
        <DataTable columns={noticeColumns} data={notices ?? []} isLoading={noticesLoading} />
```

(Match the `DataTable` props used by the fines branch directly below it; if that branch passes a `searchKey`/`filters` prop that is required, pass `searchKey="person_name"` here.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "bill-management|payment-notices"`
Expected: no output. In your browser: Bill Management → pick the current year → "Payment notices" shows an empty table (no notices exist yet).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/fees/payment-notices/route.ts "app/(admin)/bill-management/payment-notice-columns.tsx" "app/(admin)/bill-management/page.tsx"
git commit -m "feat(bill-management): read-only Payment notices view"
```

---

### Task 9: Learner countdown — data, bar, layout and fees page

**Files:**
- Create: `lib/fees/payment-notice/bar-state.ts`
- Test: `lib/fees/payment-notice/bar-state.test.ts`
- Create: `lib/fees/payment-notice/learner-notice.ts`
- Modify: `app/api/student/transport-access/route.ts`
- Modify: `lib/student/use-transport-access.ts`
- Create: `components/student/payment-notice-bar.tsx`
- Modify: `app/student/layout.tsx` (line 250), `app/student/fees/page.tsx` (line 143)

**Interfaces:**
- Consumes: `loadFeeNoticeConfig` (Task 2); table from Task 1.
- Produces:

```ts
// bar-state.ts
export interface PaymentNoticePayload { status: 'running' | 'fined'; expires_at: string; amount: number; urgent_hours: number }
export type BarState = 'hidden' | 'running' | 'urgent' | 'processing' | 'fined';
export function barState(notice: PaymentNoticePayload | null | undefined, remainingMs: number): BarState
export function remainingMs(expiresAt: string, clientNowMs: number, offsetMs: number): number
export function clockOffset(serverNowIso: string, clientNowMs: number): number
export function formatRemaining(ms: number): string // 'HH:MM:SS', clamped at 0
// learner-notice.ts
export function loadLearnerNotice(svc: SupabaseClient, opts: { profileId: string; email: string | null; transportYearId: string }): Promise<PaymentNoticePayload | null>
// TransportAccess gains: payment_notice?: PaymentNoticePayload | null; server_now?: string
```

- [ ] **Step 1: Write the failing test**

```ts
// lib/fees/payment-notice/bar-state.test.ts
import { describe, it, expect } from 'vitest';
import { barState, remainingMs, clockOffset, formatRemaining } from './bar-state';

const running = { status: 'running' as const, expires_at: '2026-09-24T04:30:00.000Z', amount: 1200, urgent_hours: 6 };

describe('barState', () => {
  it('is hidden with no notice', () => expect(barState(null, 1)).toBe('hidden'));
  it('is running with more than the urgent window left', () => expect(barState(running, 7 * 3_600_000)).toBe('running'));
  it('is urgent inside the urgent window', () => expect(barState(running, 6 * 3_600_000)).toBe('urgent'));
  it('is processing at zero while still running', () => expect(barState(running, 0)).toBe('processing'));
  it('is fined once fined, regardless of time', () =>
    expect(barState({ ...running, status: 'fined' }, 9e9)).toBe('fined'));
});

describe('clock maths', () => {
  it('corrects a client clock that runs 5 minutes fast', () => {
    const client = Date.parse('2026-09-23T06:05:00.000Z');
    const offset = clockOffset('2026-09-23T06:00:00.000Z', client);
    expect(offset).toBe(-300_000);
    expect(remainingMs('2026-09-23T07:00:00.000Z', client, offset)).toBe(3_600_000);
  });
});

describe('formatRemaining', () => {
  it('formats HH:MM:SS up to 48 hours', () => {
    expect(formatRemaining(48 * 3_600_000)).toBe('48:00:00');
    expect(formatRemaining(41 * 3_600_000 + 12 * 60_000 + 8_000)).toBe('41:12:08');
  });
  it('clamps negatives to zero', () => expect(formatRemaining(-5)).toBe('00:00:00'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/fees/payment-notice/bar-state.test.ts`
Expected: FAIL — cannot resolve `./bar-state`.

- [ ] **Step 3: Implement bar-state.ts**

```ts
// lib/fees/payment-notice/bar-state.ts
// Pure display logic for the learner countdown. The browser clock decides only
// what the bar SHOWS; the sweep alone decides when a fine is raised.

export interface PaymentNoticePayload {
  status: 'running' | 'fined';
  expires_at: string;
  amount: number;
  urgent_hours: number;
}

export type BarState = 'hidden' | 'running' | 'urgent' | 'processing' | 'fined';

export function barState(notice: PaymentNoticePayload | null | undefined, remaining: number): BarState {
  if (!notice) return 'hidden';
  if (notice.status === 'fined') return 'fined';
  if (remaining <= 0) return 'processing';
  return remaining <= notice.urgent_hours * 3_600_000 ? 'urgent' : 'running';
}

/** server_now − client now, captured when the response arrives. */
export function clockOffset(serverNowIso: string, clientNowMs: number): number {
  return Date.parse(serverNowIso) - clientNowMs;
}

export function remainingMs(expiresAt: string, clientNowMs: number, offsetMs: number): number {
  return Date.parse(expiresAt) - (clientNowMs + offsetMs);
}

export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/fees/payment-notice/bar-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Write learner-notice.ts**

```ts
// lib/fees/payment-notice/learner-notice.ts
// The signed-in learner's current notice. Resolves learner rows the way
// tms_student_transport_access does — profile_id first, then college/student
// email — because 206 of ~450 owing learners are linked only by email.

import type { SupabaseClient } from '@supabase/supabase-js';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { loadFeeNoticeConfig } from './config';
import type { PaymentNoticePayload } from './bar-state';

export async function loadLearnerNotice(
  svc: SupabaseClient,
  opts: { profileId: string; email: string | null; transportYearId: string },
): Promise<PaymentNoticePayload | null> {
  let { data: learners } = await svc.from('learners_profiles').select('id, transport_stop_id').eq('profile_id', opts.profileId);
  if ((!learners || learners.length === 0) && opts.email) {
    const pat = emailIlikePattern(opts.email);
    ({ data: learners } = await svc
      .from('learners_profiles')
      .select('id, transport_stop_id')
      .or(`college_email.ilike.${pat},student_email.ilike.${pat}`));
  }
  const rows = (learners ?? []) as Array<{ id: string; transport_stop_id: string | null }>;
  if (!rows.length) return null;

  const { data: notices, error } = await svc
    .from('tms_fee_payment_notice')
    .select('person_id, status, expires_at, fine_id')
    .eq('transport_year_id', opts.transportYearId)
    .in('person_id', rows.map((r) => r.id))
    .in('status', ['running', 'fined']);
  if (error || !notices || notices.length === 0) return null;
  // Prefer a running notice (it needs action) over a fined one.
  const n = ((notices as Array<{ person_id: string; status: 'running' | 'fined'; expires_at: string; fine_id: string | null }>)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'running' ? -1 : 1)))[0];

  const cfg = await loadFeeNoticeConfig(svc);
  let amount = 0;
  if (n.status === 'fined' && n.fine_id) {
    const { data: f } = await svc.from('tms_fee_fine').select('fine_amount').eq('id', n.fine_id).maybeSingle();
    amount = Number((f as { fine_amount: number } | null)?.fine_amount ?? 0);
  } else {
    const stopId = rows.find((r) => r.id === n.person_id)?.transport_stop_id;
    if (stopId) {
      const { data: rate } = await svc
        .from('tms_fine_stop_rate')
        .select('fine_amount')
        .eq('transport_year_id', opts.transportYearId)
        .eq('stop_id', stopId)
        .maybeSingle();
      amount = Number((rate as { fine_amount: number } | null)?.fine_amount ?? 0);
    }
  }
  return { status: n.status, expires_at: n.expires_at, amount, urgent_hours: cfg.reminderHoursBefore };
}
```

Note: a `fined` notice is shown for 7 days after `expires_at`, then hidden — add this line before `const cfg = …`:

```ts
  if (n.status === 'fined' && Date.parse(n.expires_at) < Date.now() - 7 * 86_400_000) return null;
```

- [ ] **Step 6: Extend `app/api/student/transport-access/route.ts`**

Replace the success return `return NextResponse.json({ success: true, data });` with:

```ts
    // Additive fields for the 48-hour payment countdown. Read failures must
    // never break the access check itself, so they degrade to "no notice".
    let payment_notice = null;
    const yearId = (data as { transport_year_id?: string | null } | null)?.transport_year_id ?? null;
    if (yearId) {
      try {
        payment_notice = await loadLearnerNotice(createServiceRoleClient(), {
          profileId: auth.userId,
          email: auth.email,
          transportYearId: yearId,
        });
      } catch (e) {
        console.error('transport-access payment notice read failed (non-fatal):', e);
      }
    }
    return NextResponse.json({
      success: true,
      data: { ...(data as object), payment_notice, server_now: new Date().toISOString() },
    });
```

Add the imports:

```ts
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadLearnerNotice } from '@/lib/fees/payment-notice/learner-notice';
```

- [ ] **Step 7: Extend `lib/student/use-transport-access.ts`**

Add to the imports:

```ts
import type { PaymentNoticePayload } from '@/lib/fees/payment-notice/bar-state';
```

Add two fields at the end of `interface TransportAccess`:

```ts
  /** The learner's 48-hour payment notice, when one is running or has fined. */
  payment_notice?: PaymentNoticePayload | null;
  /** Server clock at response time, to correct the countdown for a wrong device clock. */
  server_now?: string;
```

Replace `useTransportAccess` with:

```ts
export function useTransportAccess() {
  return useQuery({
    queryKey: ['student-transport-access'],
    queryFn: fetchTransportAccess,
    refetchOnWindowFocus: true,
    // Poll only while a countdown is running, so a payment clears the bar within a minute.
    refetchInterval: (q) => (q.state.data?.payment_notice?.status === 'running' ? 60_000 : false),
  });
}
```

- [ ] **Step 8: Write the bar component**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Timer, AlertTriangle } from 'lucide-react';
import { useTransportAccess } from '@/lib/student/use-transport-access';
import { barState, clockOffset, formatRemaining, remainingMs } from '@/lib/fees/payment-notice/bar-state';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * The learner's 48-hour payment countdown. `strip` sits in the portal layout
 * above every page; `card` is the larger version on /student/fees. Both read
 * the same cached query, so they can never disagree.
 */
export function PaymentNoticeBar({ variant = 'strip' }: { variant?: 'strip' | 'card' }) {
  const { data, dataUpdatedAt } = useTransportAccess();
  const notice = data?.payment_notice ?? null;
  // Offset is captured per response; dataUpdatedAt changes on every refetch.
  const offset = useMemo(
    () => (data?.server_now ? clockOffset(data.server_now, dataUpdatedAt || Date.now()) : 0),
    [data?.server_now, dataUpdatedAt],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (notice?.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [notice?.status]);

  const left = notice ? remainingMs(notice.expires_at, now, offset) : 0;
  const state = barState(notice, left);
  if (state === 'hidden' || !notice) return null;

  const red = state === 'urgent' || state === 'processing' || state === 'fined';
  const tone = red
    ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200'
    : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200';
  const Icon = state === 'fined' ? AlertTriangle : Timer;

  const message =
    state === 'fined'
      ? `A Transport Fee of ${inr(notice.amount)} has been added because the maintenance fee wasn't paid in time.`
      : state === 'processing'
        ? "Time's up — Transport Fee being added…"
        : null;

  const deadline = new Date(notice.expires_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (variant === 'card') {
    return (
      <div className={`rounded-xl border p-4 ${tone}`}>
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 space-y-1">
            {message ? (
              <p className="font-medium">{message}</p>
            ) : (
              <>
                <p className="text-sm">Pay your Transport Maintenance Fee by <strong>{deadline}</strong></p>
                <p className="font-mono text-3xl font-bold tabular-nums">{formatRemaining(left)}</p>
                <p className="text-sm">If it is not paid in time, a Transport Fee of {inr(notice.amount)} will be added.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`border-b px-4 py-2 text-sm ${tone}`}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1">
        <Icon className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">
          {message ?? (
            <>
              Pay your Transport Maintenance Fee within{' '}
              <span className="font-mono font-semibold tabular-nums">{formatRemaining(left)}</span>, or a Transport Fee of{' '}
              {inr(notice.amount)} will be added.
            </>
          )}
        </p>
        <Link href="/student/fees" className="shrink-0 rounded-md bg-white/70 px-2.5 py-1 font-medium underline-offset-2 hover:underline dark:bg-black/20">
          {state === 'fined' ? 'View fees' : 'Pay now'}
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Mount it**

In `app/student/layout.tsx`, add `import { PaymentNoticeBar } from '@/components/student/payment-notice-bar';` and change line 250 from:

```tsx
        <div className="content-body fade-in">{children}</div>
```

to:

```tsx
        <PaymentNoticeBar />
        <div className="content-body fade-in">{children}</div>
```

In `app/student/fees/page.tsx`, add the same import and insert as the first child of the root `<div className="mx-auto max-w-3xl space-y-5 p-4">` (line 143):

```tsx
      <PaymentNoticeBar variant="card" />
```

- [ ] **Step 10: Verify**

Run: `npx vitest run lib/fees/payment-notice && npx tsc --noEmit -p . 2>&1 | grep -E "payment-notice|transport-access|student/layout|student/fees"`
Expected: tests PASS; no tsc lines.

Seed one running notice for a test learner you can log in as (replace `<learner id>`), check the bar, then delete it:

```sql
insert into tms_fee_payment_notice (person_id, transport_year_id, started_at, expires_at)
select '<learner id>', id, now(), now() + interval '48 hours' from tms_transport_year where is_current;
-- in your browser as that learner: amber strip on every page, card on /student/fees, ticking
update tms_fee_payment_notice set expires_at = now() + interval '2 hours' where person_id = '<learner id>';
-- after ≤60s: strip turns red
delete from tms_fee_payment_notice where person_id = '<learner id>';
-- after ≤60s: strip disappears
```

- [ ] **Step 11: Commit**

```bash
git add lib/fees/payment-notice/bar-state.ts lib/fees/payment-notice/bar-state.test.ts lib/fees/payment-notice/learner-notice.ts app/api/student/transport-access/route.ts lib/student/use-transport-access.ts components/student/payment-notice-bar.tsx app/student/layout.tsx app/student/fees/page.tsx
git commit -m "feat(student): 48-hour payment countdown on every portal page"
```

---

### Task 10: Full verification, deploy, and go-live

**Files:** none new.

- [ ] **Step 1: Whole test suite and build**

Run: `npx vitest run` then `node node_modules/next/dist/bin/next build`
Expected: vitest all PASS (report any pre-existing failures separately, with output); build succeeds.

- [ ] **Step 2: Production dry run numbers, straight from SQL (before deploy)**

```sql
-- learners the sweep would open a notice for on go-live (approximation of step 2 of the sweep)
select count(distinct b.person_id)
from tms_fee_bill b
join tms_transport_year y on y.id = b.transport_year_id and y.is_current
join learners_profiles lp on lp.id = b.person_id
join tms_fine_stop_rate r on r.transport_year_id = y.id and r.stop_id = lp.transport_stop_id and r.fine_amount > 0
where b.person_type = 'learner' and b.status = 'generated'
  and not exists (select 1 from tms_fee_override o where o.person_id = b.person_id and o.transport_year_id = y.id);
-- this still includes paid learners; the exact figure comes from the ?dryRun=1 call in Step 4
```

- [ ] **Step 3: Review, push, deploy** — follow `superpowers:finishing-a-development-branch`. Before pushing: `git fetch && git log origin/main..HEAD && git log HEAD..origin/main`; push with `git push origin HEAD:main` only after the user approves merging.

- [ ] **Step 4: After deploy — schedule, then dry run in production**

Apply `supabase/migrations/20260921120100_schedule_fee_payment_notice_sweep.sql` via `apply_migration`, then:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://<tms_app_url>/api/cron/fee-payment-notices?dryRun=1"
```

Expected while OFF: `skipped: "disabled"`. Temporarily reading the would-be numbers requires the switch ON, so instead run the Step 2 SQL minus `term1PaidLearnerIds` — confirm the order of magnitude is ~450, not ~1,900. If it is ~1,900, STOP: the paid filter is wrong.

- [ ] **Step 5: Go-live (user's decision, user's browser)**

The user presses **Settings → Fee Notice → Turn on**. Within 5 minutes:

```sql
select status, count(*) from tms_fee_payment_notice n
join tms_transport_year y on y.id = n.transport_year_id and y.is_current group by status;
-- expect ~450 running
select count(*) from tms_notification where idempotency_key like 'payment-notice-start:%';
-- expect ≈ reachable learners (~395 of ~450)
```

- [ ] **Step 6: Update memory** — mark the feature merged/live in `project_fee_payment_48h_timer.md` with the go-live timestamp and the measured counts.
