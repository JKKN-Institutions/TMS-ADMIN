# Bus Inspection → Learner Check with Automatic Fines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vehicle-checklist Bus Inspection with the Route Check learner flow (admin assign + history pages, green/red Fee and Booking marks), and raise automatic fixed-amount Transport Fee fines on submit under safe rules shared with the 48h timer.

**Architecture:** Route Check (`lib/route-check`, `/boarding/route-check`) is the engine and keeps its URLs and tables. New pure modules decide marks (`marks.ts`) and fine eligibility (`fine-rules.ts`); an IO module (`fines.ts`) runs at submit and calls the existing `createFines` engine, which gains `fixedAmount` + `kind`. The admin face is `/inspections` (tabs Inspectors / Checks). The old checklist code, tables, bucket and permissions are removed after the shared pieces move.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role client + `withAuth`), TanStack Query, Tailwind v4, vitest with `makeFakeSupabase`.

**Spec:** `docs/superpowers/specs/2026-09-23-bus-inspection-learner-check-design.md`

## Global Constraints

- Work only in worktree `D:\Sangeetha_V\TMS-ADMIN\.worktrees\bus-inspection-v2` on branch `feat/bus-inspection-learner-check`. Never `git stash`; never touch the main checkout.
- Every admin API: `withAuth` + service-role client + permission check; `{ success, data }` / `{ error }` JSON.
- Fine amounts are resolved **server-side** only (from the stored setting); never from a request body.
- Fine switch default **OFF**; unreadable setting = OFF. Amounts: whole rupees 1–100000; `fineDueDays` 0–60.
- Idempotency keys (stored as `<key>:<personId>` by `createFines`): `maintenance-unpaid:<transportYearId>` and `no-booking:<YYYY-MM-DD>`.
- Staff, unknown cards and manual entries are **never** fined.
- `.in()` lists chunked to ≤150 ids and every Supabase `error` checked.
- Activity-log `module`/`action` unions are closed — use existing values only (`fees/generate`, `route-checks/submit`, `route-checks/assign`, `settings/update`).
- Keep the printed sticker URL shape `/i/<NORMALISED_REG>` and `STICKER_ORIGIN` unchanged.
- Keep `public.tms_set_updated_at()` and the activity-log `'inspections'` module label.
- Dark mode: every coloured chip carries a `dark:` variant.
- Migrations: write the `.sql` file AND apply it to the live DB with `mcp__supabase__apply_migration`; re-assert function grants after.
- Test command: `npx vitest run <path>`; typecheck filter: `npx tsc --noEmit -p . 2>&1 | grep -E "<touched paths>"` (main has pre-existing tsc debt; only touched files must be clean).
- Worktree build: `set -a; . ../../.env; set +a; node node_modules/next/dist/bin/next build`.

## File map

| File | Responsibility |
|---|---|
| `lib/auth/require-perm.ts` (moved) | `requirePerm(auth, ...perms)` |
| `components/scanner/bus-scanner.tsx` (moved) | generic camera QR/barcode scanner |
| `lib/vehicles/sticker-code.ts` (+test, moved) | sticker URL helpers |
| `lib/route-check/vehicle-route.ts` | `routeForVehicle`, `vehicleByReg` |
| `lib/route-check/marks.ts` (+test) | pure `feeMark`, `bookingMark` |
| `lib/route-check/fee-facts.ts` | IO: Term-1 paid / override / bill due / running notice per learner |
| `lib/route-check/fine-config.ts` (+test) | fine switch/amounts setting |
| `lib/route-check/fine-rules.ts` (+test) | pure per-learner fine decisions + labels |
| `lib/route-check/fines.ts` (+test) | IO: raise fines for a submitted check |
| `lib/fines/create.ts` (+test) | gains `fixedAmount`, `kind` |
| `lib/fees/term1.ts` | gains optional `personIds` scope |
| `lib/fees/payment-notice/sweep.ts` (+test) | shared key |
| `app/api/admin/settings/route-check-fines/route.ts` | GET/PUT settings + dry run |
| `components/admin/route-check-fine-settings.tsx` | Settings card |
| `app/(admin)/inspections/**` (rebuilt) | Inspectors / Checks tabs, check report, stickers |
| `app/i/[reg]/page.tsx` + `app/api/boarding/route-check/by-sticker/route.ts` | sticker landing |
| `components/route-check/marks.tsx` | Fee / Booking chips |

---

### Task 1: Move the shared pieces out of the inspection folders (no behaviour change)

**Files:**
- Create: `lib/auth/require-perm.ts`, `components/scanner/bus-scanner.tsx`, `lib/vehicles/sticker-code.ts`, `lib/vehicles/sticker-code.test.ts`, `lib/route-check/vehicle-route.ts`
- Modify: `lib/route-check/access.ts:9`, `app/api/boarding/route-check/routes/route.ts:5`, `app/api/admin/route-checks/route.ts:5`, `app/api/admin/route-checks/[id]/route.ts:5`, `app/api/admin/route-checkers/route.ts:6`, `app/api/admin/route-checkers/people/route.ts:5`, `components/route-check/scan-dialog.tsx:8`, `lib/inspections/server.ts`, `app/(admin)/inspections/stickers/page.tsx:8`

**Interfaces:**
- Produces: `requirePerm(auth: AuthContext, ...permissions: string[]): Promise<boolean>` from `@/lib/auth/require-perm`; `BusScanner` from `@/components/scanner/bus-scanner`; `normalizeReg, stickerPath, stickerUrl, parseStickerScan, STICKER_ORIGIN` from `@/lib/vehicles/sticker-code`; `routeForVehicle(svc, vehicleId)` and `vehicleByReg(svc, reg)` from `@/lib/route-check/vehicle-route`.

- [ ] **Step 1: Move files with git so history follows**

```bash
git mv lib/inspections/sticker-code.ts lib/vehicles/sticker-code.ts
git mv lib/inspections/sticker-code.test.ts lib/vehicles/sticker-code.test.ts
mkdir -p components/scanner
git mv components/inspections/bus-scanner.tsx components/scanner/bus-scanner.tsx
```

- [ ] **Step 2: Create `lib/auth/require-perm.ts`**

```ts
import type { AuthContext } from '@/lib/api/with-auth';

/** True when the user holds ANY of the permissions (super admins always). */
export async function requirePerm(auth: AuthContext, ...permissions: string[]): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  for (const p of permissions) {
    const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: p });
    if (data) return true;
  }
  return false;
}
```

- [ ] **Step 3: Create `lib/route-check/vehicle-route.ts`**

```ts
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeReg } from '@/lib/vehicles/sticker-code';

type Svc = ReturnType<typeof createServiceRoleClient>;

/** A bus is on at most one active route (verified 2026-09-21); take the newest if that ever changes. */
export async function routeForVehicle(svc: Svc, vehicleId: string) {
  const { data, error } = await svc
    .from('tms_route')
    .select('id, route_number, route_name')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`routeForVehicle: ${error.message}`);
  return (data?.[0] as { id: string; route_number: string | null; route_name: string | null } | undefined) ?? null;
}

/** Vehicle whose registration normalises to the sticker's REG, or null. */
export async function vehicleByReg(svc: Svc, reg: string): Promise<{ id: string; registration_number: string } | null> {
  const want = normalizeReg(reg);
  if (!want) return null;
  const { data, error } = await svc.from('tms_vehicle').select('id, registration_number');
  if (error) throw new Error(`vehicleByReg: ${error.message}`);
  const rows = (data ?? []) as { id: string; registration_number: string | null }[];
  const hit = rows.find((v) => normalizeReg(v.registration_number ?? '') === want);
  return hit ? { id: hit.id, registration_number: hit.registration_number ?? want } : null;
}
```

- [ ] **Step 4: Repoint imports**

In each of the 6 route-check files replace `import { requirePerm } from '@/lib/inspections/server';` with `import { requirePerm } from '@/lib/auth/require-perm';`. In `components/route-check/scan-dialog.tsx:8` replace `@/components/inspections/bus-scanner` with `@/components/scanner/bus-scanner`. In `components/scanner/bus-scanner.tsx:7` replace `@/lib/inspections/sticker-code` with `@/lib/vehicles/sticker-code`. In `app/(admin)/inspections/stickers/page.tsx:8` replace `@/lib/inspections/sticker-code` with `@/lib/vehicles/sticker-code`. In `lib/inspections/server.ts` delete the `requirePerm` body and add `export { requirePerm } from '@/lib/auth/require-perm';` (the old module is deleted in Task 12; this keeps it compiling until then). Then:

Run: `grep -rn "inspections/sticker-code\|inspections/bus-scanner" app components lib`
Expected: only files under `app/(admin)/inspections/**`, `app/(admin)/i/**`, `app/api/admin/inspections/**`, `lib/inspections/**`, `components/inspections/**` (fix them to the new paths too, so the tree compiles until Task 12).

- [ ] **Step 5: Verify**

Run: `npx vitest run lib/vehicles lib/route-check`
Expected: PASS (sticker-code tests unchanged, route-check tests unchanged).
Run: `npx tsc --noEmit -p . 2>&1 | grep -E "require-perm|scanner/bus-scanner|vehicles/sticker|vehicle-route|route-check"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add -A lib/auth lib/vehicles lib/route-check components/scanner components/route-check components/inspections lib/inspections app
git commit -m "refactor(route-check): move requirePerm, BusScanner and sticker helpers out of inspections"
```

---

### Task 2: Schema — tick columns, `override` fee state

**Files:**
- Create: `supabase/migrations/20260923110000_route_check_fines.sql`

**Interfaces:**
- Produces: columns `tms_route_check_person.booking_state text` (`this_route|other_route|none`), `fee_fine_id uuid`, `booking_fine_id uuid`, `fine_note text`; `fee_state` accepts `'override'`.

- [ ] **Step 1: Write the migration**

```sql
-- Bus Inspection learner check: marks + automatic fines (spec 2026-09-23).
alter table public.tms_route_check_person
  add column if not exists booking_state text
    check (booking_state in ('this_route','other_route','none')),
  add column if not exists fee_fine_id uuid references public.tms_fee_fine(id) on delete set null,
  add column if not exists booking_fine_id uuid references public.tms_fee_fine(id) on delete set null,
  add column if not exists fine_note text;

alter table public.tms_route_check_person drop constraint if exists tms_route_check_person_fee_state_check;
alter table public.tms_route_check_person add constraint tms_route_check_person_fee_state_check
  check (fee_state in ('paid','unpaid','none','unknown','exempt','override'));

create index if not exists tms_route_check_person_fee_fine_idx on public.tms_route_check_person (fee_fine_id) where fee_fine_id is not null;
create index if not exists tms_route_check_person_booking_fine_idx on public.tms_route_check_person (booking_fine_id) where booking_fine_id is not null;
```

- [ ] **Step 2: Apply live** with `mcp__supabase__apply_migration` (name `route_check_fines`, same SQL).

- [ ] **Step 3: Verify**

Run SQL: `select column_name from information_schema.columns where table_name='tms_route_check_person' and column_name in ('booking_state','fee_fine_id','booking_fine_id','fine_note');`
Expected: 4 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260923110000_route_check_fines.sql
git commit -m "feat(route-check): tick columns for booking state and fine links (APPLIED)"
```

---

### Task 3: Fine engine — `fixedAmount` and `kind`

**Files:**
- Modify: `lib/fines/create.ts` (`CreateFinesInput`, `createFines`)
- Test: `lib/fines/create.test.ts`

**Interfaces:**
- Produces: `export type FineKind = 'maintenance_unpaid' | 'no_booking'`; `CreateFinesInput.fixedAmount?: number`; `CreateFinesInput.kind?: FineKind` (default `'maintenance_unpaid'`, which keeps today's push text).

- [ ] **Step 1: Write the failing tests** (append to `lib/fines/create.test.ts`)

```ts
describe('createFines with fixedAmount', () => {
  it('charges the fixed amount even for a learner with no stop', async () => {
    const svc = makeFakeSupabase(baseData());
    const out = await createFines(svc as never, input({ personIds: ['p2'], fixedAmount: 300 }));
    expect(out.created).toBe(1);
    expect(out.totalAmount).toBe(300);
    expect(out.skipped).toEqual([]);
    const ins = svc.calls.find((c) => c.table === 'tms_fee_fine' && c.ops.some(([op]) => op === 'insert'));
    const row = (ins!.ops.find(([op]) => op === 'insert')![1] as Array<Record<string, unknown>>)[0];
    expect(row.fine_amount).toBe(300);
    expect(row.stop_id).toBeNull();
  });

  it('refuses a non-positive fixed amount', async () => {
    const svc = makeFakeSupabase(baseData());
    await expect(createFines(svc as never, input({ fixedAmount: 0 }))).rejects.toThrow(/fixedAmount/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/fines/create.test.ts`
Expected: FAIL (`created` 0 / `no_stop` skip for p2; no throw for 0).

- [ ] **Step 3: Implement**

In `lib/fines/create.ts` add below the imports:

```ts
export type FineKind = 'maintenance_unpaid' | 'no_booking';

const PUSH_BODY: Record<FineKind, (amount: number, reason: string, due: string) => string> = {
  maintenance_unpaid: (a, r, d) =>
    `A transport fee of ₹${a.toLocaleString('en-IN')} has been added to your account because the transport maintenance fee was not paid (${r}). Due ${d}.`,
  no_booking: (a, r, d) =>
    `A transport fee of ₹${a.toLocaleString('en-IN')} has been added to your account because you travelled without booking the bus (${r}). Due ${d}.`,
};
```

Extend `CreateFinesInput`:

```ts
  /** Server-resolved flat amount (e.g. from the Bus Inspection fine setting). Skips the stop sheet. */
  fixedAmount?: number;
  /** Chooses the learner push text. Default 'maintenance_unpaid'. */
  kind?: FineKind;
```

At the top of `createFines`, replace the `const candidates = await loadCandidates(...)` statement with:

```ts
  if (input.fixedAmount !== undefined && !(Number.isInteger(input.fixedAmount) && input.fixedAmount > 0)) {
    throw new Error('createFines: fixedAmount must be a positive whole number');
  }
  const loaded = await loadCandidates(svc, {
    transportYearId: input.transportYearId,
    personIds: input.personIds,
  });
  // A fixed amount replaces the stop sheet entirely: no_stop / no_stop_rate do not apply.
  const candidates = input.fixedAmount !== undefined
    ? loaded.map((c) => ({ ...c, amount: input.fixedAmount as number, skip_reason: null }))
    : loaded;
```

Replace the `body:` line of the `notifyLearner` call with:

```ts
        body: PUSH_BODY[input.kind ?? 'maintenance_unpaid'](c.amount, input.reason, input.dueDate),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/fines`
Expected: PASS (all old tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/fines/create.ts lib/fines/create.test.ts
git commit -m "feat(fines): fixed server-resolved amount and per-kind push text"
```

---

### Task 4: Fine setting (`route_check_fines`)

**Files:**
- Create: `lib/route-check/fine-config.ts`, `lib/route-check/fine-config.test.ts`

**Interfaces:**
- Produces: `ROUTE_CHECK_FINE_SETTING_TYPE = 'route_check_fines'`; `interface RouteCheckFineConfig { enabled: boolean; unpaidAmount: number; noBookingAmount: number; fineDueDays: number; enabledAt: string | null }`; `DEFAULT_ROUTE_CHECK_FINE_CONFIG`; `parseRouteCheckFineConfig(raw: unknown)`; `toStoredRouteCheckFineConfig(cfg)`; `validateRouteCheckFineInput({unpaidAmount, noBookingAmount, fineDueDays}): string | null`; `loadRouteCheckFineConfig(svc): Promise<RouteCheckFineConfig>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import {
  parseRouteCheckFineConfig, validateRouteCheckFineInput, loadRouteCheckFineConfig, DEFAULT_ROUTE_CHECK_FINE_CONFIG,
} from './fine-config';

describe('parseRouteCheckFineConfig', () => {
  it('is OFF by default and for garbage', () => {
    expect(parseRouteCheckFineConfig(null)).toEqual(DEFAULT_ROUTE_CHECK_FINE_CONFIG);
    expect(parseRouteCheckFineConfig({ enabled: 'yes' }).enabled).toBe(false);
  });
  it('is ON only with enabled_at and both amounts', () => {
    const on = { enabled: true, enabled_at: '2026-09-23T00:00:00.000Z', unpaid_amount: 500, no_booking_amount: 200, fine_due_days: 7 };
    expect(parseRouteCheckFineConfig(on).enabled).toBe(true);
    expect(parseRouteCheckFineConfig({ ...on, enabled_at: null }).enabled).toBe(false);
    expect(parseRouteCheckFineConfig({ ...on, unpaid_amount: 0 }).enabled).toBe(false);
  });
});

describe('validateRouteCheckFineInput', () => {
  it('accepts whole rupees 1–100000 and due days 0–60', () => {
    expect(validateRouteCheckFineInput({ unpaidAmount: 500, noBookingAmount: 200, fineDueDays: 7 })).toBeNull();
    expect(validateRouteCheckFineInput({ unpaidAmount: 0, noBookingAmount: 200, fineDueDays: 7 })).toMatch(/Unpaid/);
    expect(validateRouteCheckFineInput({ unpaidAmount: 500, noBookingAmount: 12.5, fineDueDays: 7 })).toMatch(/No-booking/);
    expect(validateRouteCheckFineInput({ unpaidAmount: 500, noBookingAmount: 200, fineDueDays: 61 })).toMatch(/due days/);
  });
});

describe('loadRouteCheckFineConfig', () => {
  it('fails OFF when the row is missing', async () => {
    const svc = makeFakeSupabase({ admin_settings: [] });
    expect((await loadRouteCheckFineConfig(svc as never)).enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/route-check/fine-config.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `lib/route-check/fine-config.ts`**

```ts
// Bus Inspection automatic-fine switch + amounts: one admin_settings row
// (setting_type 'route_check_fines'), the same shape as the 48h fee notice.
// Fail OFF: an unreadable or half-configured switch never charges anyone.
import type { SupabaseClient } from '@supabase/supabase-js';

export const ROUTE_CHECK_FINE_SETTING_TYPE = 'route_check_fines';

export interface RouteCheckFineConfig {
  enabled: boolean;
  unpaidAmount: number;
  noBookingAmount: number;
  fineDueDays: number;
  enabledAt: string | null;
}

export const DEFAULT_ROUTE_CHECK_FINE_CONFIG: RouteCheckFineConfig = {
  enabled: false, unpaidAmount: 0, noBookingAmount: 0, fineDueDays: 7, enabledAt: null,
};

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function parseRouteCheckFineConfig(raw: unknown): RouteCheckFineConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const unpaidAmount = intIn(r.unpaid_amount, 1, 100000, 0);
  const noBookingAmount = intIn(r.no_booking_amount, 1, 100000, 0);
  const enabledAt = typeof r.enabled_at === 'string' && !Number.isNaN(Date.parse(r.enabled_at)) ? r.enabled_at : null;
  return {
    enabled: r.enabled === true && enabledAt !== null && unpaidAmount > 0 && noBookingAmount > 0,
    unpaidAmount, noBookingAmount,
    fineDueDays: intIn(r.fine_due_days, 0, 60, DEFAULT_ROUTE_CHECK_FINE_CONFIG.fineDueDays),
    enabledAt,
  };
}

export function toStoredRouteCheckFineConfig(cfg: RouteCheckFineConfig): Record<string, unknown> {
  return {
    enabled: cfg.enabled, unpaid_amount: cfg.unpaidAmount, no_booking_amount: cfg.noBookingAmount,
    fine_due_days: cfg.fineDueDays, enabled_at: cfg.enabledAt,
  };
}

const rupees = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100000;

export function validateRouteCheckFineInput(i: { unpaidAmount: number; noBookingAmount: number; fineDueDays: number }): string | null {
  if (!rupees(i.unpaidAmount)) return 'Unpaid-fee fine must be a whole number of rupees between 1 and 100000';
  if (!rupees(i.noBookingAmount)) return 'No-booking fine must be a whole number of rupees between 1 and 100000';
  if (!Number.isInteger(i.fineDueDays) || i.fineDueDays < 0 || i.fineDueDays > 60) return 'Fine due days must be a whole number between 0 and 60';
  return null;
}

export async function loadRouteCheckFineConfig(svc: SupabaseClient): Promise<RouteCheckFineConfig> {
  try {
    const { data, error } = await svc
      .from('admin_settings').select('settings_data')
      .eq('setting_type', ROUTE_CHECK_FINE_SETTING_TYPE)
      .order('updated_at', { ascending: false }).limit(1);
    if (error || !data || data.length === 0) return { ...DEFAULT_ROUTE_CHECK_FINE_CONFIG };
    return parseRouteCheckFineConfig((data[0] as { settings_data: unknown }).settings_data);
  } catch {
    return { ...DEFAULT_ROUTE_CHECK_FINE_CONFIG };
  }
}
```

- [ ] **Step 4: Run tests** → `npx vitest run lib/route-check/fine-config.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/route-check/fine-config.ts lib/route-check/fine-config.test.ts
git commit -m "feat(route-check): fine switch and amounts setting (fails off)"
```

---

### Task 5: Pure marks and fine rules

**Files:**
- Create: `lib/route-check/marks.ts`, `lib/route-check/marks.test.ts`, `lib/route-check/fine-rules.ts`, `lib/route-check/fine-rules.test.ts`

**Interfaces:**
- Produces (`marks.ts`): `type FeeMark = 'paid'|'override'|'unpaid'|'none'|'unknown'`; `type BookingMark = 'this_route'|'other_route'|'none'`; `feeMark(i: { known: boolean; paid: boolean; overridden: boolean; hasBill: boolean }): FeeMark`; `bookingMark(bookingRouteIds: string[], routeId: string): BookingMark`; `countableFeeState(m: FeeMark): 'paid'|'unpaid'|'none'|'unknown'`.
- Produces (`fine-rules.ts`): `type FineNote = 'fines_off'|'no_current_year'|'not_unpaid'|'override'|'fee_unknown'|'deadline_not_passed'|'within_notice_window'|'booked'|'booked_other_bus'|'not_service_day'|'already_fined'|'raised'|'error'`; `type FineDecision = { raise: true } | { raise: false; note: FineNote }`; `interface LearnerFeeFacts { mark: FeeMark; term1DueDate: string | null; runningNoticeExpiresAt: string | null }`; `decideFeeFine(f: LearnerFeeFacts, ctx: { checkDate: string; now: Date }): FineDecision`; `decideBookingFine(b: BookingMark, ctx: { serviceDay: boolean }): FineDecision`; `isServiceDay(date: string, exceptionDates: Set<string>): boolean`; `FINE_NOTE_LABEL: Record<FineNote, string>`.

- [ ] **Step 1: Write the failing tests**

`lib/route-check/marks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { feeMark, bookingMark, countableFeeState } from './marks';

describe('feeMark', () => {
  it.each([
    [{ known: false, paid: false, overridden: false, hasBill: true }, 'unknown'],
    [{ known: true, paid: false, overridden: true, hasBill: true }, 'override'],
    [{ known: true, paid: true, overridden: false, hasBill: true }, 'paid'],
    [{ known: true, paid: false, overridden: false, hasBill: false }, 'none'],
    [{ known: true, paid: false, overridden: false, hasBill: true }, 'unpaid'],
  ] as const)('%o → %s', (i, want) => expect(feeMark(i)).toBe(want));
});

describe('bookingMark', () => {
  it('this route wins, then other route, else none', () => {
    expect(bookingMark(['R1', 'R2'], 'R1')).toBe('this_route');
    expect(bookingMark(['R2'], 'R1')).toBe('other_route');
    expect(bookingMark([], 'R1')).toBe('none');
  });
});

describe('countableFeeState', () => {
  it('counts override as paid', () => expect(countableFeeState('override')).toBe('paid'));
});
```

`lib/route-check/fine-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideFeeFine, decideBookingFine, isServiceDay } from './fine-rules';

const NOW = new Date('2026-09-23T04:00:00.000Z');
const ctx = { checkDate: '2026-09-23', now: NOW };
const unpaid = { mark: 'unpaid' as const, term1DueDate: '2026-07-31', runningNoticeExpiresAt: null };

describe('decideFeeFine', () => {
  it('raises for an unpaid learner past the due date with no running notice', () =>
    expect(decideFeeFine(unpaid, ctx)).toEqual({ raise: true }));
  it.each([
    [{ ...unpaid, mark: 'paid' as const }, 'not_unpaid'],
    [{ ...unpaid, mark: 'none' as const }, 'not_unpaid'],
    [{ ...unpaid, mark: 'override' as const }, 'override'],
    [{ ...unpaid, mark: 'unknown' as const }, 'fee_unknown'],
    [{ ...unpaid, term1DueDate: null }, 'deadline_not_passed'],
    [{ ...unpaid, term1DueDate: '2026-09-23' }, 'deadline_not_passed'],
    [{ ...unpaid, runningNoticeExpiresAt: '2026-09-24T00:00:00.000Z' }, 'within_notice_window'],
  ])('%o → %s', (f, note) => expect(decideFeeFine(f, ctx)).toEqual({ raise: false, note }));
  it('an expired running notice does not protect', () =>
    expect(decideFeeFine({ ...unpaid, runningNoticeExpiresAt: '2026-09-22T00:00:00.000Z' }, ctx)).toEqual({ raise: true }));
});

describe('decideBookingFine', () => {
  it('fines only no booking on a service day', () => {
    expect(decideBookingFine('none', { serviceDay: true })).toEqual({ raise: true });
    expect(decideBookingFine('none', { serviceDay: false })).toEqual({ raise: false, note: 'not_service_day' });
    expect(decideBookingFine('this_route', { serviceDay: true })).toEqual({ raise: false, note: 'booked' });
    expect(decideBookingFine('other_route', { serviceDay: true })).toEqual({ raise: false, note: 'booked_other_bus' });
  });
});

describe('isServiceDay', () => {
  it('Sunday and exception dates are not service days', () => {
    expect(isServiceDay('2026-09-27', new Set())).toBe(false); // Sunday
    expect(isServiceDay('2026-09-23', new Set(['2026-09-23']))).toBe(false);
    expect(isServiceDay('2026-09-23', new Set())).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see them fail** → `npx vitest run lib/route-check/marks.test.ts lib/route-check/fine-rules.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/route-check/marks.ts`**

```ts
// The two marks an inspector sees per learner. Pure, no I/O.
// Fee uses the SAME Term-1 rule as the 48h timer and the portal gate
// (term1PaidLearnerIds), not the roster badge, which counts not-yet-due instalments.
export type FeeMark = 'paid' | 'override' | 'unpaid' | 'none' | 'unknown';
export type BookingMark = 'this_route' | 'other_route' | 'none';

export function feeMark(i: { known: boolean; paid: boolean; overridden: boolean; hasBill: boolean }): FeeMark {
  if (!i.known) return 'unknown';
  if (i.overridden) return 'override';
  if (i.paid) return 'paid';
  if (!i.hasBill) return 'none';
  return 'unpaid';
}

export function bookingMark(bookingRouteIds: string[], routeId: string): BookingMark {
  if (bookingRouteIds.includes(routeId)) return 'this_route';
  return bookingRouteIds.length > 0 ? 'other_route' : 'none';
}

/** Collapse to the four states the counters and filters understand. */
export function countableFeeState(m: FeeMark): 'paid' | 'unpaid' | 'none' | 'unknown' {
  return m === 'override' ? 'paid' : m;
}
```

- [ ] **Step 4: Implement `lib/route-check/fine-rules.ts`**

```ts
// When a Bus Inspection check may fine a learner. Pure, no I/O; the IO layer
// (fines.ts) gathers the facts and runs these at SUBMIT, never at scan time.
import { isSunday } from '@/lib/booking/window';
import type { BookingMark, FeeMark } from './marks';

export type FineNote =
  | 'fines_off' | 'no_current_year' | 'not_unpaid' | 'override' | 'fee_unknown'
  | 'deadline_not_passed' | 'within_notice_window' | 'booked' | 'booked_other_bus'
  | 'not_service_day' | 'already_fined' | 'raised' | 'error';

export type FineDecision = { raise: true } | { raise: false; note: FineNote };

export interface LearnerFeeFacts {
  mark: FeeMark;
  /** due_date of the learner's earliest-term tms_fee_bill row this year. */
  term1DueDate: string | null;
  /** expires_at of a RUNNING 48h payment notice, if any. */
  runningNoticeExpiresAt: string | null;
}

export function decideFeeFine(f: LearnerFeeFacts, ctx: { checkDate: string; now: Date }): FineDecision {
  if (f.mark === 'unknown') return { raise: false, note: 'fee_unknown' };
  if (f.mark === 'override') return { raise: false, note: 'override' };
  if (f.mark !== 'unpaid') return { raise: false, note: 'not_unpaid' };
  if (!f.term1DueDate || f.term1DueDate >= ctx.checkDate) return { raise: false, note: 'deadline_not_passed' };
  if (f.runningNoticeExpiresAt && Date.parse(f.runningNoticeExpiresAt) > ctx.now.getTime()) {
    return { raise: false, note: 'within_notice_window' };
  }
  return { raise: true };
}

export function decideBookingFine(b: BookingMark, ctx: { serviceDay: boolean }): FineDecision {
  if (b === 'this_route') return { raise: false, note: 'booked' };
  if (b === 'other_route') return { raise: false, note: 'booked_other_bus' };
  if (!ctx.serviceDay) return { raise: false, note: 'not_service_day' };
  return { raise: true };
}

export function isServiceDay(date: string, exceptionDates: Set<string>): boolean {
  return !isSunday(date) && !exceptionDates.has(date);
}

export const FINE_NOTE_LABEL: Record<FineNote, string> = {
  fines_off: 'Automatic fines are off',
  no_current_year: 'No current transport year',
  not_unpaid: 'Fee paid / no bill',
  override: 'Fee override',
  fee_unknown: 'Fee status could not be read',
  deadline_not_passed: 'Fee not yet due',
  within_notice_window: 'Inside the 48-hour payment window',
  booked: 'Booked this bus',
  booked_other_bus: 'Booked another bus',
  not_service_day: 'Not a service day',
  already_fined: 'Already fined',
  raised: 'Fine raised',
  error: 'Fine failed — see logs',
};
```

- [ ] **Step 5: Run tests** → `npx vitest run lib/route-check/marks.test.ts lib/route-check/fine-rules.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/route-check/marks.ts lib/route-check/marks.test.ts lib/route-check/fine-rules.ts lib/route-check/fine-rules.test.ts
git commit -m "feat(route-check): pure fee/booking marks and safe fine rules"
```

---

### Task 6: Fee facts loader + Term-1 scoping; marks on scan and in the list

**Files:**
- Modify: `lib/fees/term1.ts` (`term1PaidLearnerIds` gains `personIds?`)
- Create: `lib/route-check/fee-facts.ts`
- Modify: `lib/route-check/evaluate.ts`, `lib/route-check/types.ts`, `lib/route-check/entries.ts`, `lib/route-check/view.ts`
- Test: `lib/fees/term1.test.ts` (existing must stay green), `lib/route-check/entries.test.ts`

**Interfaces:**
- Consumes: `feeMark`, `bookingMark`, `countableFeeState`, `LearnerFeeFacts` (Task 5).
- Produces: `term1PaidLearnerIds(svc, transportYearId, personIds?: string[])`; `loadLearnerFeeFacts(svc, learnerIds: string[]): Promise<{ yearId: string | null; facts: Map<string, LearnerFeeFacts & { hasBill: boolean }> }>`; `loadBookingRoutes(svc, learnerIds, date): Promise<Map<string, string[]>>`; `LearnerEvaluation.feeMark: FeeMark`, `.bookingMark: BookingMark`; `CheckPersonEntry.bookingState: BookingMark | null`, `.feeFineId: string | null`, `.bookingFineId: string | null`, `.fineNote: string | null`; `EntryFeeState = FeeState | 'exempt' | 'override'`; `CheckLearnerRow.feeMark: FeeMark`, `.bookingMark: BookingMark`.

- [ ] **Step 1: Scope `term1PaidLearnerIds`**

In `lib/fees/term1.ts` change the signature to `(svc: SupabaseClient, transportYearId: string, personIds?: string[])` and replace the single ledger query block (the `const { data: ledger, error } = await svc.from('tms_fee_bill')...` statement and its `if (error)` guard) with:

```ts
  const ledgerRows: LedgerRow[] = [];
  const scopes = personIds ? chunkIds([...new Set(personIds)]) : [null];
  for (const ids of scopes) {
    if (ids && ids.length === 0) continue;
    let q = svc
      .from('tms_fee_bill')
      .select('person_id, status, billing_student_bill_id, term_no')
      .eq('transport_year_id', transportYearId)
      .eq('person_type', 'learner');
      // No term_no filter: a merged bill is term 1 and a legacy learner's term-1
      // row is term 1, but filtering here would silently drop a learner whose
      // ledger grain changes mid-year. Judge on the bill instead.
    if (ids) q = q.in('person_id', ids);
    const { data, error } = await q;
    if (error) {
      if ((error as { code?: string }).code === '42P01') return out; // table not created yet
      throw error;
    }
    ledgerRows.push(...((data ?? []) as LedgerRow[]));
  }
  const ledger = ledgerRows;
```

and add near the top of the file:

```ts
function chunkIds(ids: string[], size = 150): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
```

(The later `for (const r of (ledger ?? []) as LedgerRow[])` loop keeps working unchanged.)

Run: `npx vitest run lib/fees/term1.test.ts lib/fees/payment-notice` → PASS (existing callers pass two args).

- [ ] **Step 2: Create `lib/route-check/fee-facts.ts`**

```ts
// Per-learner fee facts for Bus Inspection marks and fine rules, in bulk.
// Fail-soft for display: any read error → every learner 'unknown' (never 'paid',
// never 'unpaid'), and the fine rules refuse to fine an 'unknown'.
import type { SupabaseClient } from '@supabase/supabase-js';
import { term1PaidLearnerIds } from '@/lib/fees/term1';
import { feeMark } from './marks';
import type { LearnerFeeFacts } from './fine-rules';
import { chunk } from './admin';

export type LearnerFeeFactsRow = LearnerFeeFacts & { hasBill: boolean };

export async function currentTransportYearId(svc: SupabaseClient): Promise<string | null> {
  const { data, error } = await svc.from('tms_transport_year').select('id').eq('is_current', true).limit(1);
  if (error) throw new Error(`currentTransportYearId: ${error.message}`);
  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
}

export async function loadLearnerFeeFacts(
  svc: SupabaseClient, learnerIds: string[],
): Promise<{ yearId: string | null; facts: Map<string, LearnerFeeFactsRow> }> {
  const ids = [...new Set(learnerIds.filter(Boolean))];
  const facts = new Map<string, LearnerFeeFactsRow>();
  const unknownAll = () => {
    for (const id of ids) facts.set(id, { mark: 'unknown', term1DueDate: null, runningNoticeExpiresAt: null, hasBill: false });
  };
  if (ids.length === 0) return { yearId: null, facts };
  let yearId: string | null = null;
  try {
    yearId = await currentTransportYearId(svc);
    if (!yearId) { unknownAll(); return { yearId, facts }; }
    const paid = await term1PaidLearnerIds(svc, yearId, ids);
    const overridden = new Set<string>();
    const bills = new Map<string, { term: number; due: string | null }>();
    const notices = new Map<string, string>();
    for (const part of chunk(ids)) {
      const [ovr, fb, nt] = await Promise.all([
        svc.from('tms_fee_override').select('person_id').eq('transport_year_id', yearId).in('person_id', part),
        svc.from('tms_fee_bill').select('person_id, term_no, due_date, status')
          .eq('transport_year_id', yearId).eq('person_type', 'learner').in('person_id', part),
        svc.from('tms_fee_payment_notice').select('person_id, expires_at')
          .eq('transport_year_id', yearId).eq('status', 'running').in('person_id', part),
      ]);
      if (ovr.error) throw new Error(ovr.error.message);
      if (fb.error) throw new Error(fb.error.message);
      if (nt.error) throw new Error(nt.error.message);
      for (const r of (ovr.data ?? []) as { person_id: string }[]) overridden.add(r.person_id);
      for (const r of (fb.data ?? []) as { person_id: string; term_no: number | null; due_date: string | null; status: string | null }[]) {
        if (r.status !== 'generated') continue;
        const term = r.term_no ?? Number.MAX_SAFE_INTEGER;
        const cur = bills.get(r.person_id);
        // Earliest term wins; on a tie keep the EARLIER due date (fail toward "due").
        if (!cur || term < cur.term || (term === cur.term && (r.due_date ?? '9999') < (cur.due ?? '9999'))) {
          bills.set(r.person_id, { term, due: r.due_date });
        }
      }
      for (const r of (nt.data ?? []) as { person_id: string; expires_at: string }[]) notices.set(r.person_id, r.expires_at);
    }
    for (const id of ids) {
      const bill = bills.get(id);
      facts.set(id, {
        mark: feeMark({ known: true, paid: paid.has(id), overridden: overridden.has(id), hasBill: !!bill }),
        term1DueDate: bill?.due ?? null,
        runningNoticeExpiresAt: notices.get(id) ?? null,
        hasBill: !!bill,
      });
    }
  } catch (e) {
    console.error('[route-check] fee facts failed:', e);
    facts.clear();
    unknownAll();
  }
  return { yearId, facts };
}

/** learnerId → route ids they booked on `date` (one tms_booking row per learner per day). */
export async function loadBookingRoutes(svc: SupabaseClient, learnerIds: string[], date: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const part of chunk([...new Set(learnerIds.filter(Boolean))])) {
    const { data, error } = await svc.from('tms_booking').select('learner_id, route_id').eq('travel_date', date).in('learner_id', part);
    if (error) throw new Error(`loadBookingRoutes: ${error.message}`);
    for (const r of (data ?? []) as { learner_id: string; route_id: string }[]) {
      out.set(r.learner_id, [...(out.get(r.learner_id) ?? []), r.route_id]);
    }
  }
  return out;
}
```

- [ ] **Step 3: Extend types and entry mapping**

`lib/route-check/types.ts`: add `import type { BookingMark, FeeMark } from './marks';`, change `export type EntryFeeState = FeeState | 'exempt' | 'override';`, add to `CheckPersonEntry`:

```ts
  bookingState: BookingMark | null;
  feeFineId: string | null;
  bookingFineId: string | null;
  fineNote: string | null;
```

add to `CheckLearnerRow`: `feeMark: FeeMark; bookingMark: BookingMark;`.

`lib/route-check/entries.ts`: add to `PersonDbRow` `booking_state: BookingMark | null; fee_fine_id: string | null; booking_fine_id: string | null; fine_note: string | null;` (import `BookingMark` from `./marks`) and to the object returned by `personEntryFromRow`:

```ts
    bookingState: row.booking_state ?? null, feeFineId: row.fee_fine_id ?? null,
    bookingFineId: row.booking_fine_id ?? null, fineNote: row.fine_note ?? null,
```

Add a test to `lib/route-check/entries.test.ts`:

```ts
it('maps booking state and fine links', () => {
  const e = personEntryFromRow({
    id: 'x', check_id: 'c', person_kind: 'learner', learner_id: 'L', staff_id: null, manual_type: null, manual_name: null,
    matched_by: 'jkkn_id', scanned_code: '1', outcome: 'ok', on_route: true, booked: true, fee_state: 'override',
    notes: null, created_at: '2026-09-23T00:00:00Z', booking_state: 'other_route', fee_fine_id: null, booking_fine_id: 'F', fine_note: 'raised',
  }, { learners: new Map([['L', { name: 'A', code: 'R1' }]]), staff: new Map() });
  expect(e).toMatchObject({ bookingState: 'other_route', bookingFineId: 'F', fineNote: 'raised', feeState: 'override' });
});
```

- [ ] **Step 4: Use the marks in `evaluate.ts`**

Change `PERSON_COLS` to append `, booking_state, fee_fine_id, booking_fine_id, fine_note`. Add imports `import { bookingMark, type BookingMark, type FeeMark } from './marks';` and `import { loadLearnerFeeFacts } from './fee-facts';`. Add `feeMark: FeeMark; bookingMark: BookingMark;` to `LearnerEvaluation`. In `evaluateLearner` add `loadLearnerFeeFacts(svc, [learnerId])` to the `Promise.all` (fourth element `factsRes`), and replace the lines from `const booked = bookings.length > 0;` through the `return {...}` with:

```ts
  const bMark = bookingMark(bookings.map((b) => b.route_id), routeId);
  const booked = bMark !== 'none';
  const onRoute = l.transport_route_id === routeId || bMark === 'this_route';
  const fee = fees.get(learnerId) ?? { ...UNKNOWN_FEE };
  const fMark = factsRes.facts.get(learnerId)?.mark ?? 'unknown';
  return {
    learnerId, name: staffName(l), code: l.roll_number ?? l.register_number ?? null,
    onRoute, booked, fee, feeMark: fMark, bookingMark: bMark,
    outcome: learnerCheckOutcome({ known: true, onRoute, booked, feeUnpaid: fMark === 'unpaid' }),
  };
```

In `recordEntry`'s learner insert, replace `fee_state: entry.ev.fee.state` with `fee_state: entry.ev.feeMark, booking_state: entry.ev.bookingMark`.

- [ ] **Step 5: Marks in the list (`view.ts`)**

After `const ticks = tickIndex(entries);` add:

```ts
  const learnerIds = roster.rows.map((r) => r.learner_id);
  const [{ facts }, bookingRoutes] = await Promise.all([
    loadLearnerFeeFacts(svc, learnerIds),
    loadBookingRoutes(svc, learnerIds, check.check_date),
  ]);
```

and inside the `roster.rows.map` replace `feeState: fee.state,` with:

```ts
      feeState: countableFeeState(facts.get(r.learner_id)?.mark ?? 'unknown'),
      feeMark: facts.get(r.learner_id)?.mark ?? 'unknown',
      bookingMark: bookingMark(bookingRoutes.get(r.learner_id) ?? [], check.route_id),
```

(imports: `loadLearnerFeeFacts, loadBookingRoutes` from `./fee-facts`; `bookingMark, countableFeeState` from `./marks`; `fee.owed` stays for the ₹ owed display).

- [ ] **Step 6: Verify**

Run: `npx vitest run lib/route-check lib/fees`
Expected: PASS.
Run: `npx tsc --noEmit -p . 2>&1 | grep -E "lib/route-check|lib/fees/term1|components/route-check|app/boarding/route-check|app/api/(boarding|admin)/route-check"`
Expected: no output (fix any `feeState` narrowing errors in `components/route-check/*` by widening their prop types to `EntryFeeState`).

- [ ] **Step 7: Commit**

```bash
git add lib/fees/term1.ts lib/route-check components/route-check
git commit -m "feat(route-check): Term-1 fee marks and this/other-bus booking marks on scan and list"
```

---

### Task 7: Raise fines on submit

**Files:**
- Create: `lib/route-check/fines.ts`, `lib/route-check/fines.test.ts`
- Modify: `app/api/boarding/route-check/[checkId]/submit/route.ts`, `app/boarding/route-check/route-check-api.ts` (`submitCheck` return type), `components/route-check/finish-panel.tsx`

**Interfaces:**
- Consumes: `loadRouteCheckFineConfig` (T4), `decideFeeFine`, `decideBookingFine`, `isServiceDay`, `FineNote` (T5), `loadLearnerFeeFacts`, `loadBookingRoutes` (T6), `createFines` + `FineKind` (T3), `loadExceptions` (`lib/booking/calendar.ts`), `logSystemActivity` (`lib/activity/log.ts`).
- Produces: `interface CheckFineSummary { enabled: boolean; raised: number; alreadyFined: number; skipped: Array<{ personId: string; rule: 'fee' | 'booking'; note: FineNote }>; errors: number }`; `raiseCheckFines(svc, check: { id: string; route_id: string; check_date: string }, actorId: string, deps?: Partial<FineDeps>): Promise<CheckFineSummary>`; submit response `data.fines: CheckFineSummary`.

- [ ] **Step 1: Write the failing tests** (`lib/route-check/fines.test.ts`)

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { raiseCheckFines } from './fines';

const CHECK = { id: 'C', route_id: 'R1', check_date: '2026-09-23' };
const ON = [{ settings_data: { enabled: true, enabled_at: '2026-09-22T00:00:00.000Z', unpaid_amount: 500, no_booking_amount: 200, fine_due_days: 7 } }];

function svcWith(settings: unknown[]) {
  return makeFakeSupabase({
    admin_settings: settings,
    tms_route_check_person: [
      { id: 'P1', check_id: 'C', person_kind: 'learner', learner_id: 'L1' },
      { id: 'P2', check_id: 'C', person_kind: 'staff', staff_id: 'S1' },
    ],
    tms_fee_fine: [{ id: 'F1', idempotency_key: 'maintenance-unpaid:Y:L1' }, { id: 'F2', idempotency_key: 'no-booking:2026-09-23:L1' }],
  });
}

function deps(over: Record<string, unknown> = {}) {
  return {
    now: () => new Date('2026-09-23T04:00:00.000Z'),
    loadLearnerFeeFacts: vi.fn(async () => ({
      yearId: 'Y',
      facts: new Map([['L1', { mark: 'unpaid', term1DueDate: '2026-07-31', runningNoticeExpiresAt: null, hasBill: true }]]),
    })),
    loadBookingRoutes: vi.fn(async () => new Map<string, string[]>()),
    loadExceptionDates: vi.fn(async () => new Set<string>()),
    createFines: vi.fn(async () => ({ created: 1, totalAmount: 500, skipped: [], duplicates: 0, errors: 0 })),
    logSystemActivity: vi.fn(async () => {}),
    ...over,
  };
}

describe('raiseCheckFines', () => {
  it('does nothing but stamp a note when fines are off', async () => {
    const d = deps();
    const out = await raiseCheckFines(svcWith([]) as never, CHECK, 'actor', d);
    expect(out).toMatchObject({ enabled: false, raised: 0 });
    expect(d.createFines).not.toHaveBeenCalled();
  });

  it('raises both fines for an unpaid, unbooked learner with the shared keys and fixed amounts; never staff', async () => {
    const d = deps();
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(out.raised).toBe(2);
    expect(d.createFines).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      personIds: ['L1'], idempotencyKey: 'maintenance-unpaid:Y', fixedAmount: 500, kind: 'maintenance_unpaid', dueDate: '2026-09-30', actorId: 'actor',
    }));
    expect(d.createFines).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      personIds: ['L1'], idempotencyKey: 'no-booking:2026-09-23', fixedAmount: 200, kind: 'no_booking',
    }));
    expect(d.createFines).toHaveBeenCalledTimes(2);
  });

  it('counts a duplicate key as already fined', async () => {
    const d = deps({ createFines: vi.fn(async () => ({ created: 0, totalAmount: 0, skipped: [], duplicates: 1, errors: 0 })) });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(out.alreadyFined).toBe(2);
    expect(out.raised).toBe(0);
  });

  it('does not fine a booked-other-bus learner or on a holiday', async () => {
    const d = deps({
      loadBookingRoutes: vi.fn(async () => new Map([['L1', ['R9']]])),
      loadLearnerFeeFacts: vi.fn(async () => ({ yearId: 'Y', facts: new Map([['L1', { mark: 'paid', term1DueDate: null, runningNoticeExpiresAt: null, hasBill: true }]]) })),
    });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(d.createFines).not.toHaveBeenCalled();
    expect(out.skipped).toEqual(expect.arrayContaining([
      { personId: 'L1', rule: 'booking', note: 'booked_other_bus' },
      { personId: 'L1', rule: 'fee', note: 'not_unpaid' },
    ]));
  });
});
```

- [ ] **Step 2: Run to see it fail** → `npx vitest run lib/route-check/fines.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/route-check/fines.ts`**

```ts
// Automatic Transport Fee fines for a SUBMITTED Bus Inspection check.
// Facts are re-read here (never trusted from scan time); the pure rules decide;
// createFines writes. Keys make every path idempotent:
//   maintenance-unpaid:<yearId>  (shared with the 48h payment-notice sweep → one per learner per year)
//   no-booking:<date>            (one per learner per day)
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFines, type FineKind } from '@/lib/fines/create';
import { loadExceptions } from '@/lib/booking/calendar';
import { logSystemActivity } from '@/lib/activity/log';
import { addDays } from '@/lib/booking/window';
import { loadRouteCheckFineConfig } from './fine-config';
import { loadLearnerFeeFacts, loadBookingRoutes } from './fee-facts';
import { bookingMark } from './marks';
import { decideBookingFine, decideFeeFine, isServiceDay, type FineDecision, type FineNote } from './fine-rules';

export interface CheckFineSummary {
  enabled: boolean;
  raised: number;
  alreadyFined: number;
  skipped: Array<{ personId: string; rule: 'fee' | 'booking'; note: FineNote }>;
  errors: number;
}

export interface FineDeps {
  now: () => Date;
  loadLearnerFeeFacts: typeof loadLearnerFeeFacts;
  loadBookingRoutes: typeof loadBookingRoutes;
  loadExceptionDates: (svc: SupabaseClient, routeId: string, date: string) => Promise<Set<string>>;
  createFines: typeof createFines;
  logSystemActivity: typeof logSystemActivity;
}

const DEFAULT_DEPS: FineDeps = {
  now: () => new Date(),
  loadLearnerFeeFacts,
  loadBookingRoutes,
  loadExceptionDates: async (svc, routeId, date) => new Set((await loadExceptions(svc, routeId, date, date)).keys()),
  createFines,
  logSystemActivity,
};

export async function raiseCheckFines(
  svc: SupabaseClient,
  check: { id: string; route_id: string; check_date: string },
  actorId: string,
  deps: Partial<FineDeps> = {},
): Promise<CheckFineSummary> {
  const d: FineDeps = { ...DEFAULT_DEPS, ...deps };
  const out: CheckFineSummary = { enabled: false, raised: 0, alreadyFined: 0, skipped: [], errors: 0 };

  const { data: rows, error } = await svc.from('tms_route_check_person')
    .select('id, learner_id').eq('check_id', check.id).eq('person_kind', 'learner');
  if (error) throw new Error(`raiseCheckFines: ticks read failed: ${error.message}`);
  const ticks = (rows ?? []) as { id: string; learner_id: string }[];
  if (ticks.length === 0) return out;

  const cfg = await loadRouteCheckFineConfig(svc);
  if (!cfg.enabled) {
    await svc.from('tms_route_check_person').update({ fine_note: 'fines_off' }).eq('check_id', check.id).eq('person_kind', 'learner');
    return out;
  }
  out.enabled = true;

  const ids = ticks.map((t) => t.learner_id);
  const [{ yearId, facts }, bookings, exceptions] = await Promise.all([
    d.loadLearnerFeeFacts(svc, ids),
    d.loadBookingRoutes(svc, ids, check.check_date),
    d.loadExceptionDates(svc, check.route_id, check.check_date),
  ]);
  const serviceDay = isServiceDay(check.check_date, exceptions);
  const now = d.now();
  const dueDate = addDays(check.check_date, cfg.fineDueDays);

  for (const t of ticks) {
    const notes: string[] = [];
    const patch: Record<string, unknown> = {};
    const fee: FineDecision = yearId
      ? decideFeeFine(facts.get(t.learner_id) ?? { mark: 'unknown', term1DueDate: null, runningNoticeExpiresAt: null }, { checkDate: check.check_date, now })
      : { raise: false, note: 'no_current_year' };
    const booking: FineDecision = yearId
      ? decideBookingFine(bookingMark(bookings.get(t.learner_id) ?? [], check.route_id), { serviceDay })
      : { raise: false, note: 'no_current_year' };

    const rules: Array<{ rule: 'fee' | 'booking'; decision: FineDecision; key: string; amount: number; kind: FineKind; reason: string; col: string }> = [
      { rule: 'fee', decision: fee, key: `maintenance-unpaid:${yearId}`, amount: cfg.unpaidAmount, kind: 'maintenance_unpaid',
        reason: `Bus inspection ${check.check_date}: Transport Maintenance Fee unpaid`, col: 'fee_fine_id' },
      { rule: 'booking', decision: booking, key: `no-booking:${check.check_date}`, amount: cfg.noBookingAmount, kind: 'no_booking',
        reason: `Bus inspection ${check.check_date}: travelled without booking`, col: 'booking_fine_id' },
    ];

    for (const r of rules) {
      if (!r.decision.raise) {
        out.skipped.push({ personId: t.learner_id, rule: r.rule, note: r.decision.note });
        notes.push(`${r.rule}:${r.decision.note}`);
        continue;
      }
      try {
        const res = await d.createFines(svc, {
          transportYearId: yearId as string, personIds: [t.learner_id], dueDate, reason: r.reason,
          notify: true, idempotencyKey: r.key, actorId, fixedAmount: r.amount, kind: r.kind,
        });
        if (res.created + res.duplicates === 0) { out.errors++; notes.push(`${r.rule}:error`); continue; }
        const { data: fine } = await svc.from('tms_fee_fine').select('id').eq('idempotency_key', `${r.key}:${t.learner_id}`).maybeSingle();
        const fineId = (fine as { id: string } | null)?.id ?? null;
        if (fineId) patch[r.col] = fineId;
        if (res.created > 0) {
          out.raised++;
          notes.push(`${r.rule}:raised`);
          await d.logSystemActivity({
            module: 'fees', action: 'generate', entityType: 'tms_fee_fine', entityId: fineId ?? undefined,
            description: `Transport Fee ₹${r.amount} raised by bus inspection (${r.rule === 'fee' ? 'maintenance fee unpaid' : 'no booking'})`,
            metadata: { check_id: check.id, route_id: check.route_id, learner_id: t.learner_id, rule: r.rule, actor_id: actorId },
          });
        } else {
          out.alreadyFined++;
          notes.push(`${r.rule}:already_fined`);
        }
      } catch (e) {
        console.error('[route-check] fine failed', check.id, t.learner_id, r.rule, e);
        out.errors++;
        notes.push(`${r.rule}:error`);
      }
    }
    patch.fine_note = notes.join(' ');
    const { error: uErr } = await svc.from('tms_route_check_person').update(patch).eq('id', t.id);
    if (uErr) console.error('[route-check] fine note write failed', t.id, uErr.message);
  }
  return out;
}
```

(Check `lib/activity/log.ts` `ActivityEntry`: if `entityId` is typed `string`, pass `fineId ?? ''`. `addDays` from `lib/booking/window` takes `(dateStr, days)`.)

- [ ] **Step 4: Run tests** → `npx vitest run lib/route-check/fines.test.ts` → PASS.

- [ ] **Step 5: Wire into submit**

In `app/api/boarding/route-check/[checkId]/submit/route.ts` add `import { raiseCheckFines } from '@/lib/route-check/fines';` and after the existing `logActivity(...)` call:

```ts
    // Fines run only AFTER the guarded draft→submitted update succeeded, so a
    // double tap cannot fine twice (and the idempotency keys would dedupe anyway).
    let fines = null;
    try {
      fines = await raiseCheckFines(svc, { id, route_id: load.check.route_id, check_date: load.check.check_date }, auth.userId);
    } catch (e) {
      console.error('route-check submit: fines failed (check stays submitted):', e);
    }
    return NextResponse.json({ success: true, data: { counts: c, fines } });
```

(remove the old `return NextResponse.json({ success: true, data: { counts: c } });`).

- [ ] **Step 6: Show the result in the finish panel**

In `app/boarding/route-check/route-check-api.ts` change `submitCheck`'s return type to `Promise<{ counts: CheckCounts; fines: CheckFineSummary | null }>` (import the type from `@/lib/route-check/fines`). In `components/route-check/finish-panel.tsx` replace `await submitCheck(checkId); toast.success('Check submitted');` with:

```ts
      const res = await submitCheck(checkId);
      const f = res.fines;
      if (f?.enabled) {
        toast.success(`Check submitted · ${f.raised} fine${f.raised === 1 ? '' : 's'} raised` +
          (f.alreadyFined ? ` · ${f.alreadyFined} already fined` : '') + (f.errors ? ` · ${f.errors} failed` : ''));
      } else {
        toast.success('Check submitted');
      }
```

- [ ] **Step 7: Verify + commit**

Run: `npx vitest run lib/route-check lib/fines` → PASS; tsc filter on touched paths → clean.

```bash
git add lib/route-check/fines.ts lib/route-check/fines.test.ts "app/api/boarding/route-check/[checkId]/submit/route.ts" app/boarding/route-check/route-check-api.ts components/route-check/finish-panel.tsx
git commit -m "feat(route-check): raise automatic Transport Fee fines on submit under safe rules"
```

---

### Task 8: 48h sweep uses the shared once-per-year key

**Files:**
- Modify: `lib/fees/payment-notice/sweep.ts` (fine step), `lib/fees/payment-notice/sweep.test.ts:54-70`

**Interfaces:**
- Produces: sweep fines with `idempotencyKey: \`maintenance-unpaid:${yearId}\`` and reads the fine back by `maintenance-unpaid:${yearId}:${person}`.

- [ ] **Step 1: Update the test first**

In the "fines an expired notice…" test change `idempotencyKey: 'payment-notice:N'` to `idempotencyKey: 'maintenance-unpaid:Y'`, and add a test:

```ts
  it('closes the notice against an existing inspection fine (duplicate key)', async () => {
    const svc = base({
      tms_fee_payment_notice: [{
        id: 'N', person_id: 'A', status: 'running', started_at: '2026-09-21T06:00:00.000Z',
        expires_at: '2026-09-23T05:00:00.000Z', reminder_sent_at: '2026-09-23T00:00:00.000Z', source_bill_id: 'BILL',
      }],
      tms_fee_fine: [{ id: 'F-INSPECTION', idempotency_key: 'maintenance-unpaid:Y:A' }],
    });
    const d = deps({ createFines: vi.fn(async () => ({ created: 0, totalAmount: 0, skipped: [], duplicates: 1, errors: 0 })) });
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.fined).toBe(1);
    const upd = svc.calls.find((c) => c.table === 'tms_fee_payment_notice' && c.ops.some(([op, v]) => op === 'update' && (v as { fine_id?: string }).fine_id === 'F-INSPECTION'));
    expect(upd).toBeTruthy();
  });
```

- [ ] **Step 2: Run to see it fail** → `npx vitest run lib/fees/payment-notice/sweep.test.ts` → FAIL (old key).

- [ ] **Step 3: Implement** — in `sweep.ts` fine loop replace `const key = \`payment-notice:${f.notice_id}\`;` with:

```ts
      // Shared with Bus Inspection fines (lib/route-check/fines.ts): the unique
      // idempotency key makes a second maintenance-unpaid fine for the same
      // learner and year impossible, whichever path fires first.
      const key = `maintenance-unpaid:${yearId}`;
```

(The existing read-back `.eq('idempotency_key', \`${key}:${f.person_id}\`)` now finds either path's fine.)

- [ ] **Step 4: Run tests** → `npx vitest run lib/fees/payment-notice` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/payment-notice/sweep.ts lib/fees/payment-notice/sweep.test.ts
git commit -m "feat(fees): payment-notice fines share the maintenance-unpaid key with bus inspection"
```

---

### Task 9: Settings — "Bus Inspection Fines" card, API and dry run

**Files:**
- Create: `app/api/admin/settings/route-check-fines/route.ts`, `components/admin/route-check-fine-settings.tsx`
- Modify: `app/(admin)/settings/page.tsx:73,83,378-379`

**Interfaces:**
- Consumes: T4 config API, `term1PaidLearnerIds`, `currentTransportYearId` (T6).
- Produces: `GET /api/admin/settings/route-check-fines` → `{ success, data: { config, dryRun: { unpaidPastDue: number; alreadyFinedThisYear: number } } }`; `PUT` body `{ enabled, unpaidAmount, noBookingAmount, fineDueDays }`.

- [ ] **Step 1: API route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { requirePerm } from '@/lib/auth/require-perm';
import { term1PaidLearnerIds } from '@/lib/fees/term1';
import { currentTransportYearId } from '@/lib/route-check/fee-facts';
import { istToday } from '@/lib/booking/window';
import {
  ROUTE_CHECK_FINE_SETTING_TYPE, loadRouteCheckFineConfig, toStoredRouteCheckFineConfig, validateRouteCheckFineInput,
  type RouteCheckFineConfig,
} from '@/lib/route-check/fine-config';

type Svc = ReturnType<typeof createServiceRoleClient>;

/** Learners the unpaid rule could fine today (not Term-1 paid, bill past due, no override), and how many are already fined this year. */
async function dryRun(svc: Svc) {
  const yearId = await currentTransportYearId(svc);
  if (!yearId) return { unpaidPastDue: 0, alreadyFinedThisYear: 0 };
  const today = istToday();
  const [paid, bills, ovr, fined] = await Promise.all([
    term1PaidLearnerIds(svc, yearId),
    svc.from('tms_fee_bill').select('person_id, due_date, status').eq('transport_year_id', yearId).eq('person_type', 'learner').eq('status', 'generated'),
    svc.from('tms_fee_override').select('person_id').eq('transport_year_id', yearId),
    svc.from('tms_fee_fine').select('person_id').eq('transport_year_id', yearId).eq('status', 'generated').like('idempotency_key', 'maintenance-unpaid:%'),
  ]);
  if (bills.error || ovr.error || fined.error) throw new Error('dry run read failed');
  const overridden = new Set((ovr.data ?? []).map((r) => (r as { person_id: string }).person_id));
  const eligible = new Set<string>();
  for (const b of (bills.data ?? []) as { person_id: string; due_date: string | null }[]) {
    if (!paid.has(b.person_id) && !overridden.has(b.person_id) && b.due_date && b.due_date < today) eligible.add(b.person_id);
  }
  return { unpaidPastDue: eligible.size, alreadyFinedThisYear: new Set((fined.data ?? []).map((r) => (r as { person_id: string }).person_id)).size };
}

async function getConfig(auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_VIEW))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const svc = createServiceRoleClient();
  try {
    return NextResponse.json({ success: true, data: { config: await loadRouteCheckFineConfig(svc), dryRun: await dryRun(svc) } });
  } catch (e) {
    console.error('route-check-fines GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function saveConfig(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_MANAGE))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    const input = { unpaidAmount: Number(body.unpaidAmount), noBookingAmount: Number(body.noBookingAmount), fineDueDays: Number(body.fineDueDays) };
    const invalid = validateRouteCheckFineInput(input);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const svc = createServiceRoleClient();
    const before = await loadRouteCheckFineConfig(svc);
    const nowIso = new Date().toISOString();
    const turningOn = body.enabled && !before.enabled;
    const next: RouteCheckFineConfig = { enabled: body.enabled, ...input, enabledAt: turningOn ? nowIso : before.enabledAt ?? (body.enabled ? nowIso : null) };
    const { error } = await svc.from('admin_settings').upsert(
      { setting_type: ROUTE_CHECK_FINE_SETTING_TYPE, settings_data: toStoredRouteCheckFineConfig(next), updated_at: nowIso, updated_by: auth.userId },
      { onConflict: 'setting_type' },
    );
    if (error) { console.error('route-check-fines save failed:', error.message); return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 }); }
    await logActivity(auth, request, {
      module: 'settings', action: 'update', entityType: 'admin_settings', entityId: ROUTE_CHECK_FINE_SETTING_TYPE,
      entityLabel: 'Bus inspection automatic fines',
      description: `${turningOn ? 'Turned ON' : 'Updated'} bus inspection fines (unpaid ₹${next.unpaidAmount}, no booking ₹${next.noBookingAmount}, enabled: ${next.enabled})`,
      changes: { before, after: next },
    });
    return NextResponse.json({ success: true, data: { config: next } });
  } catch (e) {
    console.error('route-check-fines PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_request, auth) => getConfig(auth));
export const PUT = withAuth((request, auth) => saveConfig(request, auth));
```

- [ ] **Step 2: Settings card** — create `components/admin/route-check-fine-settings.tsx` by copying the structure of `components/admin/fee-notice-settings.tsx` (same imports, `useQuery` key `['route-check-fines-settings']`, same Save button + toast pattern) with these fields and copy:
  - Switch "Raise fines automatically when an inspector submits a check" (`enabled`).
  - Number input "Unpaid maintenance fee fine (₹)" (`unpaidAmount`, min 1, max 100000, step 1).
  - Number input "Travelled without booking fine (₹)" (`noBookingAmount`).
  - Number input "Fine due after (days)" (`fineDueDays`, 0–60).
  - Read-only panel: "If a check ran today: **{dryRun.unpaidPastDue}** unpaid learners are past their due date; **{dryRun.alreadyFinedThisYear}** already have a maintenance fine this year (they will not be fined again)."
  - Help text list: "Fines are raised only on submit · Staff are never fined · A learner who booked another bus is not fined · Fee fines at most once per learner per year (shared with the 48-hour notice) · No-booking fines at most once per learner per day · Nothing is fined on Sundays or holidays."
  - `PUT /api/admin/settings/route-check-fines` on Save; on success `queryClient.invalidateQueries({ queryKey: ['route-check-fines-settings'] })`.
  - Chips/panels use `dark:` variants.

- [ ] **Step 3: Mount it** — in `app/(admin)/settings/page.tsx`: add `import { RouteCheckFineSettings } from '@/components/admin/route-check-fine-settings';`, add `'inspection-fines'` to `validTabs` (line 73), add `{ id: 'inspection-fines', name: 'Inspection Fines', icon: ShieldAlert },` after the fee-notice tab (line 83; import `ShieldAlert` from `lucide-react`), and `case 'inspection-fines': return <RouteCheckFineSettings />;` after the fee-notice case.

- [ ] **Step 4: Verify + commit**

Run: tsc filter `route-check-fines|route-check-fine-settings|settings/page` → clean.

```bash
git add app/api/admin/settings/route-check-fines components/admin/route-check-fine-settings.tsx "app/(admin)/settings/page.tsx"
git commit -m "feat(settings): Inspection Fines card with switch, amounts and dry-run count"
```

---

### Task 10: Admin "Bus Inspection" pages (Inspectors / Checks / report / stickers)

**Files:**
- Delete then recreate: `app/(admin)/inspections/page.tsx`, `app/(admin)/inspections/inspection-api.ts`
- Create: `app/(admin)/inspections/inspectors-tab.tsx`, `app/(admin)/inspections/assign-dialog.tsx`, `app/(admin)/inspections/checks-tab.tsx`, `app/(admin)/inspections/checks/[id]/page.tsx`, `app/(admin)/route-checkers/page.tsx`, `components/route-check/marks.tsx`
- Modify: `app/(admin)/inspections/stickers/page.tsx` (drop `fetchDashboard`; list buses from `/api/admin/vehicles`), `lib/navigation.ts:60-61`, `app/api/admin/route-checks/[id]/route.ts` (add fine fields to `people[]`)

**Interfaces:**
- Consumes: existing `GET/POST/DELETE /api/admin/route-checkers`, `GET /api/admin/route-checkers/people?q=`, `GET /api/admin/route-checks`, `GET /api/admin/route-checks/[id]`, `POST /api/admin/fines/[id]/cancel`; `FINE_NOTE_LABEL` (T5).
- Produces: `FeeMarkChip({ mark })`, `BookingMarkChip({ mark })` from `@/components/route-check/marks`.

- [ ] **Step 1: Mark chips** (`components/route-check/marks.tsx`)

```tsx
import type { BookingMark, FeeMark } from '@/lib/route-check/marks';

const base = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold';
const GREEN = `${base} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`;
const RED = `${base} bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300`;
const AMBER = `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`;
const GREY = `${base} bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300`;

export function FeeMarkChip({ mark, size = 'sm' }: { mark: FeeMark | 'exempt' | null; size?: 'sm' | 'lg' }) {
  const big = size === 'lg' ? ' px-3 py-1 text-sm' : '';
  switch (mark) {
    case 'paid': return <span className={GREEN + big}>✓ Fee paid</span>;
    case 'override': return <span className={GREEN + big}>✓ Fee override</span>;
    case 'exempt': return <span className={GREEN + big}>✓ In-charge</span>;
    case 'unpaid': return <span className={RED + big}>✗ Fee unpaid</span>;
    case 'none': return <span className={GREY + big}>No bill</span>;
    default: return <span className={GREY + big}>Fee ?</span>;
  }
}

export function BookingMarkChip({ mark, size = 'sm' }: { mark: BookingMark | null; size?: 'sm' | 'lg' }) {
  const big = size === 'lg' ? ' px-3 py-1 text-sm' : '';
  switch (mark) {
    case 'this_route': return <span className={GREEN + big}>✓ Booked</span>;
    case 'other_route': return <span className={AMBER + big}>Booked other bus</span>;
    case 'none': return <span className={RED + big}>✗ No booking</span>;
    default: return null;
  }
}
```

- [ ] **Step 2: Client API** (`app/(admin)/inspections/inspection-api.ts`, replaces the old file)

```ts
async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return (body as { data: T }).data;
}

export interface InspectorRow { id: string; checkerEmail: string; loginEmail: string | null; unverifiedLogin: boolean; checkerName: string | null; designation: string | null; routeId: string; routeNumber: string | null; routeName: string | null; assignedAt: string; notes: string | null }
export interface PersonHit { source: string; name: string; designation: string | null; collegeEmail: string | null; email: string | null; staffId: string | null; profileId: string | null; hasLogin: boolean; loginEmail: string | null }

export const fetchInspectors = () => fetch('/api/admin/route-checkers').then((r) => json<InspectorRow[]>(r));
export const searchPeople = (q: string) => fetch(`/api/admin/route-checkers/people?q=${encodeURIComponent(q)}`).then((r) => json<PersonHit[]>(r));
export const assignInspector = (body: { email?: string | null; staffId?: string | null; profileId?: string | null; routeIds: string[]; notes?: string }) =>
  fetch('/api/admin/route-checkers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<{ created: string[]; skipped: string[] }>(r));
export const unassignInspector = (id: string) => fetch(`/api/admin/route-checkers?id=${id}`, { method: 'DELETE' }).then((r) => json<unknown>(r));
export const fetchChecks = (p: { from: string; to: string; routeId?: string }) =>
  fetch(`/api/admin/route-checks?from=${p.from}&to=${p.to}${p.routeId ? `&routeId=${p.routeId}` : ''}`).then((r) => json<Array<Record<string, unknown>>>(r));
export const fetchCheck = (id: string) => fetch(`/api/admin/route-checks/${id}`).then((r) => json<Record<string, unknown>>(r));
export const waiveFine = (fineId: string, reason: string) =>
  fetch(`/api/admin/fines/${fineId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).then((r) => json<unknown>(r));
```

Before writing it, read the real response shapes of `app/api/admin/route-checkers/route.ts` GET (`data` array vs `{data, count}`) and `app/api/admin/fines/[id]/cancel/route.ts` (method + body field) and match them exactly; adjust the `json<T>` unwrap if a route returns `data` at a different key.

- [ ] **Step 3: Page shell** (`app/(admin)/inspections/page.tsx`)

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { QrCode } from 'lucide-react';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { InspectorsTab } from './inspectors-tab';
import { ChecksTab } from './checks-tab';

type Tab = 'inspectors' | 'checks';

export default function BusInspectionPage() {
  const [tab, setTab] = useState<Tab>('inspectors');
  return (
    <div className="min-w-0 space-y-4">
      <DetailPageHeader title="Bus Inspection" description="Assign inspectors to routes and review their learner checks and fines."
        actions={<Link href="/inspections/stickers" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm dark:border-gray-700"><QrCode className="h-4 w-4" />Bus stickers</Link>} />
      <div className="flex gap-2 border-b dark:border-gray-800">
        {(['inspectors', 'checks'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-transparent text-gray-500 dark:text-gray-400'}`}>
            {t === 'inspectors' ? 'Inspectors' : 'Checks'}
          </button>
        ))}
      </div>
      {tab === 'inspectors' ? <InspectorsTab /> : <ChecksTab />}
    </div>
  );
}
```

(Check `DetailPageHeader`'s actual props in `components/ui/detail-view.tsx` and use its real prop names for title/description/actions.)

- [ ] **Step 4: Inspectors tab + Assign dialog**

`inspectors-tab.tsx`: `useQuery(['inspectors'], fetchInspectors)`; a responsive table (`overflow-x-auto`, `min-w-0`) with columns Inspector (name + designation), Login (loginEmail, or amber chip "No login yet" when `unverifiedLogin`), Route (`routeNumber · routeName`), Assigned (date), Notes, and an Unassign button calling `unassignInspector` then `invalidateQueries(['inspectors'])` with toast. An "Assign inspector" button opens `AssignDialog`. Empty state: "No inspectors assigned yet."

`assign-dialog.tsx`: shadcn `Dialog`; a search input (≥3 chars, 300 ms debounce) calling `searchPeople`; results list (name, designation, collegeEmail, "no login" hint); the selected person; a multi-select route checklist loaded with `useQuery(['routes-active'], () => fetch('/api/admin/routes?status=active').then(...))` (read `app/api/admin/routes/route.ts` for the real query params/response and use them); notes textarea (≤500). Submit calls `assignInspector({ staffId, profileId, email: loginEmail ?? collegeEmail, routeIds, notes })`, toasts `Assigned to N route(s)` (+ skipped count), invalidates `['inspectors']`, closes. Disable Submit until a person and ≥1 route are chosen.

- [ ] **Step 5: Checks tab + report**

`checks-tab.tsx`: date range (default last 7 days, `istToday()`), `useQuery(['checks', from, to], ...)`; table: Date, Bus (route number + reg), Trip (Morning/Evening from `leg`), Inspector, Status, Checked, Unpaid, Without booking, Fines raised (count of people with `feeFineId`/`bookingFineId`, from the list API if present — else show on the report only); row click → `/inspections/checks/${id}`.

`checks/[id]/page.tsx`: `useQuery(['check', id], () => fetchCheck(id))`; header (bus, date, trip, inspector, submitted time), counts row, and a list of people: name + code, `<FeeMarkChip mark={feeState} />`, `<BookingMarkChip mark={bookingState} />`, outcome label, fine chips "Fee fine" / "Booking fine" when `feeFineId` / `bookingFineId`, `FINE_NOTE_LABEL` text for the note parts, and a **Waive** button per fine (visible when `usePermissions().hasPermission(TMS_PERMISSIONS.FEES_EDIT)`), which prompts for a reason in a small Dialog (not `window.prompt`) and calls `waiveFine`, then invalidates `['check', id]`.

Extend `app/api/admin/route-checks/[id]/route.ts` `people[]` mapping to include `bookingState`, `feeFineId`, `bookingFineId`, `fineNote` (the entry type from Task 6 already carries them if it uses `personEntryFromRow`; otherwise add the four columns to its select).

- [ ] **Step 6: Redirect + nav**

`app/(admin)/route-checkers/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
export default function RouteCheckersRedirect() { redirect('/inspections'); }
```

`lib/navigation.ts`: replace lines 60-61 with one entry
`{ name: 'Bus Inspection', href: '/inspections', icon: ShieldCheck, permission: TMS_PERMISSIONS.ROUTE_CHECK_MANAGE, group: 'transport' },`
and remove the now-unused `UserSearch` import. Run `npx vitest run lib/navigation.test.ts` → PASS (update any assertion that listed Route Checkers).

- [ ] **Step 7: Stickers page** — replace `fetchDashboard` with `useQuery(['vehicles-for-stickers'], () => fetch('/api/admin/vehicles').then(...))` (read the vehicles route for its response shape) and keep the printing layout/`stickerUrl(STICKER_ORIGIN, reg)` exactly. Gate with `TMS_PERMISSIONS.ROUTE_CHECK_MANAGE` instead of `INSPECTION_MANAGE`.

- [ ] **Step 8: Verify + commit**

Run: tsc filter `app/\(admin\)/inspections|route-checkers|components/route-check|lib/navigation` → clean; `npx vitest run lib/navigation.test.ts` → PASS.

```bash
git add "app/(admin)/inspections" "app/(admin)/route-checkers" components/route-check/marks.tsx lib/navigation.ts "app/api/admin/route-checks/[id]/route.ts"
git commit -m "feat(inspections): Bus Inspection admin — inspectors, checks, report with waive; route-checkers redirect"
```

---

### Task 11: Staff app — "Bus Inspection" name, two marks, sticker entry

**Files:**
- Modify: `lib/boarding/navigation.ts` (`ROUTE_CHECK_NAV`, `TITLES`), `components/route-check/learner-list.tsx`, `components/route-check/scan-dialog.tsx` (`VerdictCard`), `app/boarding/route-check/page.tsx`, `lib/auth/areas.ts`, `lib/auth/areas.test.ts` (if present)
- Create: `app/api/boarding/route-check/by-sticker/route.ts`, `app/i/[reg]/page.tsx`
- Delete: `app/(admin)/i/[reg]/page.tsx`

**Interfaces:**
- Consumes: `FeeMarkChip`, `BookingMarkChip` (T10), `vehicleByReg`, `routeForVehicle` (T1), `canCheckRoute` (`lib/route-check/access.ts`).
- Produces: `GET /api/boarding/route-check/by-sticker?reg=` → `{ success, data: { routeId, routeNumber, vehicleReg } }` | 403 `{ error: 'You are not assigned to this bus' }` | 404.

- [ ] **Step 1: Rename** — `ROUTE_CHECK_NAV` → `{ name: 'Bus Inspection', shortName: 'Inspect', href: '/boarding/route-check', icon: ClipboardCheck }`; `TITLES['/boarding/route-check'] = 'Bus Inspection'`. Update any heading text "Route Check" in `app/boarding/route-check/**` to "Bus Inspection" (`grep -rn "Route Check" app/boarding components/route-check`).

- [ ] **Step 2: Two marks in the list** — in `learner-list.tsx` delete `FeeChip`, import the chips, and in `LearnerRow` replace the booked/no-booking ternary and `<FeeChip row={row} />` with:

```tsx
        <BookingMarkChip mark={row.bookingMark} />
        <FeeMarkChip mark={row.feeMark} />
        {row.feeMark === 'unpaid' && row.feeOwed != null && (
          <span className="shrink-0 text-xs text-red-700 dark:text-red-300">₹{row.feeOwed}</span>
        )}
```

- [ ] **Step 3: Two big marks on scan** — in `scan-dialog.tsx` `VerdictCard`, replace the line that renders `Booked today: … · ` and the fee text with:

```tsx
          {entry.kind === 'learner' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <FeeMarkChip mark={entry.feeState === 'exempt' ? 'exempt' : (entry.feeState as FeeMark | null)} size="lg" />
              <BookingMarkChip mark={entry.bookingState} size="lg" />
            </div>
          )}
          {entry.kind === 'staff' && <div className="mt-2"><FeeMarkChip mark={entry.feeState === 'exempt' ? 'exempt' : (entry.feeState as FeeMark | null)} size="lg" /></div>}
```

(import `FeeMark` type from `@/lib/route-check/marks`; keep the owed-amount line for unpaid; remove the now-unused `FEE_LABEL`/`yn` helpers if nothing else uses them).

- [ ] **Step 4: Sticker API** (`app/api/boarding/route-check/by-sticker/route.ts`)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { vehicleByReg, routeForVehicle } from '@/lib/route-check/vehicle-route';
import { canCheckRoute } from '@/lib/route-check/access';

async function bySticker(request: NextRequest, auth: AuthContext) {
  try {
    const reg = new URL(request.url).searchParams.get('reg') ?? '';
    const svc = createServiceRoleClient();
    const vehicle = await vehicleByReg(svc, reg);
    if (!vehicle) return NextResponse.json({ error: 'This sticker does not match any bus' }, { status: 404 });
    const route = await routeForVehicle(svc, vehicle.id);
    if (!route) return NextResponse.json({ error: `Bus ${vehicle.registration_number} is not on an active route` }, { status: 404 });
    if (!(await canCheckRoute(auth, svc, route.id))) return NextResponse.json({ error: 'You are not assigned to this bus' }, { status: 403 });
    return NextResponse.json({ success: true, data: { routeId: route.id, routeNumber: route.route_number, vehicleReg: vehicle.registration_number } });
  } catch (e) {
    console.error('route-check by-sticker error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => bySticker(request, auth));
```

- [ ] **Step 5: Sticker landing** — `git rm "app/(admin)/i/[reg]/page.tsx"`; create `app/i/[reg]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { normalizeReg } from '@/lib/vehicles/sticker-code';

// Printed stickers open https://tms.jkkn.ai/i/<REG>. Hand off to the staff-app
// Bus Inspection list, which resolves the bus and offers Morning / Evening.
export default async function StickerLanding({ params }: { params: Promise<{ reg: string }> }) {
  const { reg } = await params;
  redirect(`/boarding/route-check?reg=${encodeURIComponent(normalizeReg(decodeURIComponentSafe(reg)))}`);
}

function decodeURIComponentSafe(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}
```

In `lib/auth/areas.ts` `resolveArea` add before the final return:

```ts
  // Printed bus stickers (/i/<REG>) belong to the staff app: inspectors are
  // admitted there by their assignment, not by an admin permission.
  if (pathname.startsWith('/i/')) return 'boarding';
```

Add a unit test (to `lib/auth/areas.test.ts`, create it if missing): `expect(resolveArea('/i/TN28AB1234')).toBe('boarding')`.

Then confirm the Transport Head can still open a sticker: run SQL `select permissions ? 'tms.attendance.scan' from custom_roles where role_key='transport_head';`. If `false`, add to `proxy.ts`'s boarding-area deny branch (next to the route-checker admit at ~line 233) an admit for users holding `tms.route_check.manage` when `pathname.startsWith('/i/') || pathname.startsWith('/boarding/route-check') || pathname.startsWith('/api/boarding/route-check')`, with a `proxy.test.ts` case for it.

- [ ] **Step 6: Handle `?reg=` on the list page** — in `app/boarding/route-check/page.tsx` read `useSearchParams().get('reg')`; when present, `useQuery(['by-sticker', reg], () => fetch(\`/api/boarding/route-check/by-sticker?reg=${reg}\`).then(...))`; on success render a top card "Bus {vehicleReg} · Route {routeNumber}" with two buttons **Morning** / **Evening** that call the existing `startCheck(routeId, 'onward' | 'return')` and `router.push(\`/boarding/route-check/${checkId}\`)`; on 403/404 render the error in a red card above the normal route list. Add a **Scan bus sticker** button beside the list header that opens `BusScanner` (default `parse` = sticker parser) and on a hit does `router.replace(\`/boarding/route-check?reg=${reg}\`)`. Wrap the component in `<Suspense>` (required for `useSearchParams`).

- [ ] **Step 7: Verify + commit**

Run: `npx vitest run lib/auth lib/route-check lib/boarding` → PASS; tsc filter `app/i/|by-sticker|boarding/route-check|components/route-check|lib/auth/areas|lib/boarding/navigation` → clean. Also check `proxy.test.ts`: `npx vitest run proxy.test.ts` → PASS.

```bash
git add lib/boarding/navigation.ts components/route-check app/boarding/route-check app/api/boarding/route-check/by-sticker app/i lib/auth "app/(admin)/i"
git commit -m "feat(inspections): staff-app Bus Inspection with fee/booking marks and sticker entry"
```

---

### Task 12: Remove the vehicle-checklist inspection (code + DB)

**Files:**
- Delete: `app/(admin)/inspections/scan/`, `app/(admin)/inspections/[id]/`, `app/api/admin/inspections/`, `lib/inspections/`, `components/inspections/`, `docs/superpowers/plans/2026-09-21-bus-inspection-phase1.md` (keep the old spec as history, add a "Superseded by 2026-09-23" line at its top)
- Modify: `lib/constants/tms-permissions.ts:114-119` (remove `INSPECTION_*`)
- Create: `supabase/migrations/20260923120000_drop_vehicle_checklist_inspection.sql`

- [ ] **Step 1: Delete code**

```bash
git rm -r "app/(admin)/inspections/scan" "app/(admin)/inspections/[id]" app/api/admin/inspections lib/inspections components/inspections docs/superpowers/plans/2026-09-21-bus-inspection-phase1.md
grep -rn "lib/inspections\|components/inspections\|api/admin/inspections\|INSPECTION_VIEW\|INSPECTION_CONDUCT\|INSPECTION_MANAGE" app components lib proxy.ts
```
Expected after removing the constants: no output. (Keep the `'inspections'` activity-log module member and its label.)

- [ ] **Step 2: Teardown migration**

```sql
-- Vehicle-checklist Bus Inspection removed (spec 2026-09-23). Backup first.
create table if not exists public.tms_inspection_backup_20260923 (
  source text not null, row_data jsonb not null, backed_up_at timestamptz not null default now()
);
insert into public.tms_inspection_backup_20260923 (source, row_data)
  select 'tms_inspection', to_jsonb(i) from public.tms_inspection i
  union all select 'tms_inspection_item', to_jsonb(it) from public.tms_inspection_item it
  union all select 'tms_inspection_learner_check', to_jsonb(lc) from public.tms_inspection_learner_check lc
  union all select 'tms_inspection_issue', to_jsonb(s) from public.tms_inspection_issue s;
revoke all on public.tms_inspection_backup_20260923 from anon, authenticated;

drop table if exists public.tms_inspection_learner_check, public.tms_inspection_issue,
  public.tms_inspection_item, public.tms_inspection, public.tms_inspection_checklist_item cascade;

delete from storage.objects where bucket_id = 'tms-inspection-photos';
delete from storage.buckets where id = 'tms-inspection-photos';

update public.custom_roles
  set permissions = permissions - 'tms.inspection.view' - 'tms.inspection.conduct' - 'tms.inspection.manage'
  where permissions ?| array['tms.inspection.view','tms.inspection.conduct','tms.inspection.manage'];

delete from public.admin_settings where setting_type = 'inspection';
-- NOTE: public.tms_set_updated_at() is shared by 10+ tables — never drop it here.
```

Before applying, run: `select count(*) from storage.objects where bucket_id='tms-inspection-photos';` (expect 0) and `select count(*) from tms_inspection;` (expect 1). If Supabase refuses the direct `storage.objects` delete, remove those two storage lines from the SQL and delete the empty bucket from the dashboard/Storage API instead; note it in the commit message.

- [ ] **Step 3: Apply live** (`mcp__supabase__apply_migration`, name `drop_vehicle_checklist_inspection`), then verify:

```sql
select count(*) from information_schema.tables where table_name like 'tms_inspection%' and table_name <> 'tms_inspection_backup_20260923'; -- 0
select count(*) from tms_inspection_backup_20260923; -- ≥ 26 (1 inspection + 25 items)
select count(*) from custom_roles where permissions ? 'tms.inspection.view'; -- 0
select has_function_privilege('authenticated', 'public.tms_route_checker_route_ids(uuid)', 'EXECUTE'); -- true
```

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run` (full) → PASS; tsc filter `inspections|route-check|tms-permissions|navigation` → clean.

```bash
git add -A lib/constants/tms-permissions.ts supabase/migrations/20260923120000_drop_vehicle_checklist_inspection.sql docs "app/(admin)/inspections" app/api/admin lib components
git commit -m "chore(inspections): remove vehicle checklist inspection code, tables, bucket and permissions (backup kept, APPLIED)"
```

---

### Task 13: Verification and handoff

- [ ] **Step 1: Full test + build**

```bash
npx vitest run
set -a; . ../../.env; set +a; node node_modules/next/dist/bin/next build
```
Expected: all tests pass; build succeeds; route list contains `/inspections`, `/inspections/checks/[id]`, `/inspections/stickers`, `/route-checkers`, `/i/[reg]`, `/api/boarding/route-check/by-sticker`, `/api/admin/settings/route-check-fines`, and NOT `/api/admin/inspections/*`.

- [ ] **Step 2: Live dry-run SQL** (compare with the Settings card number)

```sql
with y as (select id from tms_transport_year where is_current limit 1)
select count(distinct b.person_id) as unpaid_past_due_bills
from tms_fee_bill b, y
where b.transport_year_id = y.id and b.person_type='learner' and b.status='generated'
  and b.due_date < (now() at time zone 'Asia/Kolkata')::date
  and not exists (select 1 from tms_fee_override o where o.person_id=b.person_id and o.transport_year_id=y.id);
```
(This is an upper bound — it does not subtract Term-1-paid learners; the card's number must be ≤ this.)

- [ ] **Step 3: Remove the worktree `.env` copy if one was made; confirm `git status` clean.**

- [ ] **Step 4: Report to the user** — commits on the branch, test/build evidence, the dry-run count, and the owed steps: user browser/phone test (assign an inspector → staff app → scan → submit with fines OFF → check report), then push approval (`git push origin HEAD:main` after `git fetch` + `git log origin/main..HEAD`), then the user turns on Settings → Inspection Fines.
