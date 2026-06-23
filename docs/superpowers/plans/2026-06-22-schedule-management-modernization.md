# Transport Schedule Management — Modernization Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the EXISTING `/schedules` admin module in place — replacing its dead per-trip code (it queries `schedules`/`booking_availability`/`bookings`/`routes`/`students`, all **missing from the DB**) with a 3-tab control surface (**Service Calendar · Booking Windows · Load & Manifest**) on the live `tms_` schema, and wire booking windows into the student calendar.

**Architecture:** Build on Plan 1 (`tms_service_calendar` + pure `lib/booking/calendar.ts` gate + student month calendar). Add a small `tms_booking_window` table for per-route-day booking open/close + deadline override, extend the *pure* gate to honor those overrides (so the student calendar reflects them automatically), add three modern admin endpoints, and rewrite `app/(admin)/schedules/page.tsx` to consume them. Keep the `/schedules` route + nav entry. Legacy `/api/admin/schedules/*` routes are left orphaned (per the "leave legacy as-is" decision) — the new endpoints get clear new names.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Supabase service-role, TanStack Query v5, react-hot-toast, Tailwind v4, vitest 4.

## Prerequisite

**Plan 1 Tasks 1–2 must be implemented first** (`docs/superpowers/plans/2026-06-22-schedule-calendar-foundation.md`): they create `tms_service_calendar` and `lib/booking/calendar.ts` (with `monthDays`, `cellStatus`, `buildMonthCells`, `loadExceptions`, `CalendarException`, `CalendarStatus`, `DayCell`). This plan modifies `lib/booking/calendar.ts` and assumes those exports exist.

## Global Constraints

- **API routes** use `withAuth(...)` + inline `requirePerm(auth, KEY)` (`true` if `auth.isSuperAdmin`, else `auth.supabase.rpc('user_has_permission', { permission_name })`) + `createServiceRoleClient()`. Responses `{ success: true, data }` or `{ error }`; guard `42P01` and return safe defaults.
- **Permissions (reuse, none added):** `TMS_PERMISSIONS.SCHEDULES_VIEW` (read) and `SCHEDULES_EDIT` (write) for the admin module; the student board keeps `BOOKINGS_SELF`. Window/calendar reads inside the student flow use the service-role client (no extra perm).
- **Dates** IST `'YYYY-MM-DD'`; reuse `lib/booking/window.ts`. Deadlines are full ISO timestamptz.
- **Verification (ESLint broken):** `npm run type-check` grepped to the changed file; `npx vitest run <file>` for pure logic; `curl` route probes expect `307`/`401` unauthenticated. Authed visuals confirmed by the user in-browser.
- **Migrations:** apply via Supabase MCP (`apply_migration`, project `kvizhngldtiuufknvehv`) AND commit the SQL under `supabase/migrations/`.
- **Git:** branch `feat/daily-bus-booking`; one commit per task; explicit paths only (never `-A`); `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

## Design decisions (captured from brainstorming)

- **Direction:** modernize the existing module on `tms_booking`; **rewire + simplify** to 3 tabs. Drop trip seats, scheduled→completed lifecycle, and auto-complete (no whole-day equivalent).
- **Two-table gate:** `tms_service_calendar` (does the day run?) + `tms_booking_window` (is booking open, until when, capped how?). **No window row ⇒ default fixed 6 PM-day-before rule.**
- **Gate precedence** (date D, route R): `service_calendar block → window.booking_enabled=false (closed) → effective deadline = window.deadline ?? cutoffFor(D) → capacity (booked ≥ window.capacity_override ?? routeCapacity = full, enforced at book time)`.

## Usage across portals (delivered by this plan + Plan 1/3)

| Portal | Role | This plan? |
|---|---|---|
| Admin | manage service calendar + booking windows; view load + manifest | **yes** (Tasks 3–6) |
| Student | month calendar respects holidays + closed windows + custom deadlines | **yes** (Task 2 gate + Task 7) |
| Driver | per-date roster + booked-stop list | Plan 3 |
| Boarding | existing roster + booked-stop list | Plan 3 |

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260622010000_create_tms_booking_window.sql` | new table |
| `lib/booking/calendar.ts` (modify) | add `WindowOverride`, window-aware `cellStatus`/`buildMonthCells`, `loadWindows` |
| `lib/booking/calendar.test.ts` (modify) | window-override cases |
| `lib/schedule-management/fields.ts` (create) | write whitelists for both admin writers |
| `app/api/admin/schedules/service-calendar/route.ts` (create) | service-calendar CRUD |
| `app/api/admin/schedules/booking-window/route.ts` (create) | booking-window CRUD |
| `app/api/admin/schedules/manifest/route.ts` (create) | booked-learner manifest per route+date |
| `app/(admin)/schedules/page.tsx` (rewrite) | 3-tab control surface |
| `app/api/student/bookings/route.ts` (modify) | feed window overrides into the board + book gate |

---

### Task 1: `tms_booking_window` migration

**Files:** Create `supabase/migrations/20260622010000_create_tms_booking_window.sql`

**Interfaces:** Produces table `tms_booking_window(route_id, travel_date, booking_enabled, deadline, capacity_override, note, audit)`, unique `(route_id, travel_date)`.

- [ ] **Step 1: Write the SQL**

```sql
-- tms_booking_window: per-route-day admin override of the default booking rule.
-- No row for a (route, date) => the default fixed 6 PM-day-before window applies.
create table if not exists public.tms_booking_window (
  id                uuid primary key default gen_random_uuid(),
  route_id          uuid not null references public.tms_route(id) on delete cascade,
  travel_date       date not null,
  booking_enabled   boolean not null default true,
  deadline          timestamptz,            -- override default cutoff; null = default
  capacity_override integer,                -- cap below vehicle/route capacity; null = default
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  unique (route_id, travel_date)
);
create index if not exists idx_booking_window_route_date
  on public.tms_booking_window (route_id, travel_date);

drop trigger if exists trg_tms_booking_window_updated_at on public.tms_booking_window;
create trigger trg_tms_booking_window_updated_at
  before update on public.tms_booking_window
  for each row execute function public.set_updated_at();

alter table public.tms_booking_window enable row level security;
-- service-role only (admin API + student gate read); no learner-facing policy.
```

- [ ] **Step 2: Apply via MCP + verify**

Apply with `apply_migration` (name `create_tms_booking_window`). Then `execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'tms_booking_window' order by ordinal_position;
```
Expected: 11 rows incl. `booking_enabled boolean`, `deadline timestamp with time zone`, `capacity_override integer`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260622010000_create_tms_booking_window.sql
git commit -m "feat(schedules): add tms_booking_window (per-route-day booking override)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Window-aware gate (extend `lib/booking/calendar.ts`, TDD)

**Files:** Modify `lib/booking/calendar.ts`; Modify `lib/booking/calendar.test.ts`

**Interfaces:**
- Produces (added to calendar.ts):
  - `interface WindowOverride { enabled: boolean; deadline: string | null; capacityOverride: number | null }`
  - `cellStatus(date, opts: { hasBooking; exception?; window?: WindowOverride; now? })` — window-aware
  - `buildMonthCells(monthStr, opts: { bookedDates; exceptions; windows?: Map<string, WindowOverride>; now? })`
  - `loadWindows(svc, routeId: string | null, from, to): Promise<Map<string, WindowOverride>>`
  - `effectiveOpen(date, opts: { window?: WindowOverride; now? }): boolean` (shared by API book-gate)

- [ ] **Step 1: Add the window-override test cases**

Append to `lib/booking/calendar.test.ts`:
```ts
import { effectiveOpen } from './calendar';

describe('booking-window overrides', () => {
  const NOW2 = new Date('2026-06-22T03:00:00Z'); // IST today 2026-06-22 => bookable 06-23..29
  it('a disabled window closes an otherwise-open date', () => {
    expect(cellStatus('2026-06-23', { hasBooking: false, window: { enabled: false, deadline: null, capacityOverride: null }, now: NOW2 })).toBe('closed');
  });
  it('an earlier custom deadline can close a date before the default cutoff', () => {
    // default cutoff for 06-23 is 18:00 IST on 06-22; a deadline already in the past => closed
    expect(effectiveOpen('2026-06-23', { window: { enabled: true, deadline: '2026-06-22T00:00:00Z', capacityOverride: null }, now: NOW2 })).toBe(false);
  });
  it('a later custom deadline keeps a date open past the default', () => {
    expect(effectiveOpen('2026-06-23', { window: { enabled: true, deadline: '2026-06-23T18:00:00+05:30', capacityOverride: null }, now: NOW2 })).toBe(true);
  });
  it('an exception still wins over an (enabled) window', () => {
    expect(cellStatus('2026-06-23', { hasBooking: false, exception: { kind: 'holiday', note: null }, window: { enabled: true, deadline: null, capacityOverride: null }, now: NOW2 })).toBe('holiday');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/booking/calendar.test.ts`
Expected: FAIL — `effectiveOpen` is not exported / `window` arg ignored.

- [ ] **Step 3: Implement window-awareness**

In `lib/booking/calendar.ts`, add the type + `effectiveOpen`, and thread `window` through `cellStatus`/`buildMonthCells`. Replace the existing `cellStatus` and `buildMonthCells` and add the new exports:

```ts
import { bookableDates, cutoffFor, dayStatus } from './window';

export interface WindowOverride {
  enabled: boolean;
  deadline: string | null;        // ISO; overrides cutoffFor(date)
  capacityOverride: number | null;
}

/** Is booking open for a date, honoring an optional window override? */
export function effectiveOpen(
  date: string,
  opts: { window?: WindowOverride; now?: Date }
): boolean {
  const now = opts.now ?? new Date();
  if (opts.window && !opts.window.enabled) return false;
  if (!bookableDates(now).includes(date)) return false;
  const deadlineMs = opts.window?.deadline
    ? new Date(opts.window.deadline).getTime()
    : cutoffFor(date).getTime();
  return now.getTime() < deadlineMs;
}

/** Status for ONE date. Exception wins; then window; then default window logic. */
export function cellStatus(
  date: string,
  opts: { hasBooking: boolean; exception?: CalendarException; window?: WindowOverride; now?: Date }
): CalendarStatus {
  if (opts.exception) return opts.exception.kind;
  const now = opts.now ?? new Date();
  if (!bookableDates(now).includes(date)) return opts.hasBooking ? 'locked' : 'out_of_horizon';
  // window-aware open/closed; falls back to the pure dayStatus when no window.
  if (opts.window) {
    const open = effectiveOpen(date, { window: opts.window, now });
    if (opts.hasBooking) return open ? 'booked' : 'locked';
    return open ? 'open' : 'closed';
  }
  const s = dayStatus(opts.hasBooking, date, now);
  return s === 'not_booked' ? 'open' : s;
}

export function buildMonthCells(
  monthStr: string,
  opts: {
    bookedDates: Set<string>;
    exceptions: Map<string, CalendarException>;
    windows?: Map<string, WindowOverride>;
    now?: Date;
  }
): DayCell[] {
  return monthDays(monthStr).map((date) => {
    const exception = opts.exceptions.get(date);
    return {
      date,
      status: cellStatus(date, {
        hasBooking: opts.bookedDates.has(date),
        exception,
        window: opts.windows?.get(date),
        now: opts.now,
      }),
      note: exception?.note ?? null,
    };
  });
}
```

Also add the DB loader at the bottom of the file (next to `loadExceptions`):
```ts
/** Load per-date booking-window overrides for a route over [from,to]. */
export async function loadWindows(
  svc: SupabaseClient,
  routeId: string | null,
  from: string,
  to: string
): Promise<Map<string, WindowOverride>> {
  const map = new Map<string, WindowOverride>();
  if (!routeId) return map;
  const { data, error } = await svc
    .from('tms_booking_window')
    .select('travel_date, booking_enabled, deadline, capacity_override')
    .eq('route_id', routeId)
    .gte('travel_date', from)
    .lte('travel_date', to);
  if (error) {
    if (isMissingTable(error)) return map;
    throw error;
  }
  type Row = { travel_date: string; booking_enabled: boolean; deadline: string | null; capacity_override: number | null };
  for (const r of (data ?? []) as Row[]) {
    map.set(r.travel_date, { enabled: r.booking_enabled, deadline: r.deadline, capacityOverride: r.capacity_override });
  }
  return map;
}
```
(`cutoffFor` is now imported; `isMissingTable` already exists in this file from Plan 1.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/booking/calendar.test.ts`
Expected: PASS (Plan 1 cases + the 4 new window cases).

- [ ] **Step 5: Type-check + commit**

Run: `npm run type-check 2>&1 | grep -E "lib/booking/calendar" || echo CLEAN` → `CLEAN`.
```bash
git add lib/booking/calendar.ts lib/booking/calendar.test.ts
git commit -m "feat(booking): window-aware calendar gate (per-date enable/deadline overrides)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Admin API — service calendar CRUD

**Files:**
- Create `lib/schedule-management/fields.ts`
- Create `app/api/admin/schedules/service-calendar/route.ts`

**Interfaces:**
- Produces `GET /api/admin/schedules/service-calendar?from=&to=` → `{ success, data: { rows: ServiceCalRow[] } }`;
  `POST` body `{ exception_date, route_id?, kind, note? }` → `{ success, data: { id } }`;
  `DELETE ?id=` → `{ success }`. All gated `SCHEDULES_VIEW`/`SCHEDULES_EDIT`.

- [ ] **Step 1: Write the field whitelist**

Create `lib/schedule-management/fields.ts`:
```ts
/** Write whitelists for the modernized Schedule Management writers. */
export interface ServiceCalendarInput {
  exception_date: string;
  route_id: string | null;
  kind: 'holiday' | 'no_service';
  note: string | null;
}
export function pickServiceCalendar(body: Record<string, unknown>): ServiceCalendarInput | { error: string } {
  const date = String(body.exception_date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'exception_date must be YYYY-MM-DD' };
  const kind = body.kind === 'no_service' ? 'no_service' : body.kind === 'holiday' ? 'holiday' : null;
  if (!kind) return { error: "kind must be 'holiday' or 'no_service'" };
  const routeId = body.route_id ? String(body.route_id) : null;
  const note = body.note == null ? null : String(body.note).slice(0, 280);
  return { exception_date: date, route_id: routeId, kind, note };
}

export interface BookingWindowInput {
  route_id: string;
  travel_date: string;
  booking_enabled: boolean;
  deadline: string | null;
  capacity_override: number | null;
  note: string | null;
}
export function pickBookingWindow(body: Record<string, unknown>): BookingWindowInput | { error: string } {
  const routeId = String(body.route_id ?? '');
  const date = String(body.travel_date ?? '');
  if (!routeId) return { error: 'route_id is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'travel_date must be YYYY-MM-DD' };
  const enabled = body.booking_enabled !== false; // default true
  const deadline = body.deadline ? String(body.deadline) : null;
  const cap = body.capacity_override == null || body.capacity_override === ''
    ? null : Number(body.capacity_override);
  if (cap != null && (!Number.isFinite(cap) || cap < 0)) return { error: 'capacity_override must be a non-negative number' };
  const note = body.note == null ? null : String(body.note).slice(0, 280);
  return { route_id: routeId, travel_date: date, booking_enabled: enabled, deadline, capacity_override: cap, note };
}
```

- [ ] **Step 2: Write the route**

Create `app/api/admin/schedules/service-calendar/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { pickServiceCalendar } from '@/lib/schedule-management/fields';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}
const missing = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

async function list(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_VIEW))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '1900-01-01';
  const to = url.searchParams.get('to') ?? '2999-12-31';
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from('tms_service_calendar')
    .select('id, exception_date, route_id, kind, note')
    .gte('exception_date', from).lte('exception_date', to)
    .order('exception_date', { ascending: true });
  if (error) {
    if (missing(error)) return NextResponse.json({ success: true, data: { rows: [] } });
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { rows: data ?? [] } });
}

async function create(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_EDIT))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const picked = pickServiceCalendar(body);
  if ('error' in picked) return NextResponse.json({ error: picked.error }, { status: 400 });
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from('tms_service_calendar')
    .insert({ ...picked, created_by: auth.userId, updated_by: auth.userId })
    .select('id').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'That date already has an exception' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { id: data.id } });
}

async function remove(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_EDIT))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_service_calendar').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const GET = withAuth((r, a) => list(r, a));
export const POST = withAuth((r, a) => create(r, a));
export const DELETE = withAuth((r, a) => remove(r, a));
```

- [ ] **Step 3: Type-check + probe + commit**

Run: `npm run type-check 2>&1 | grep -E "service-calendar|schedule-management/fields" || echo CLEAN` → `CLEAN`.
Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/admin/schedules/service-calendar"` → `307`/`401`.
```bash
git add lib/schedule-management/fields.ts app/api/admin/schedules/service-calendar/route.ts
git commit -m "feat(schedules): modern service-calendar CRUD API (withAuth + tms_)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Admin API — booking-window CRUD

**Files:** Create `app/api/admin/schedules/booking-window/route.ts`

**Interfaces:**
- Produces `GET ?route_id=&from=&to=` → `{ success, data: { rows } }`;
  `POST` body `{ route_id, travel_date, booking_enabled, deadline?, capacity_override?, note? }` → upsert on `(route_id, travel_date)` → `{ success, data: { id } }`;
  `DELETE ?id=` → `{ success }`. Gated `SCHEDULES_VIEW`/`SCHEDULES_EDIT`.

- [ ] **Step 1: Write the route**

Create `app/api/admin/schedules/booking-window/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { pickBookingWindow } from '@/lib/schedule-management/fields';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}
const missing = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

async function list(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_VIEW))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const routeId = url.searchParams.get('route_id');
  if (!routeId) return NextResponse.json({ error: 'route_id is required' }, { status: 400 });
  const from = url.searchParams.get('from') ?? '1900-01-01';
  const to = url.searchParams.get('to') ?? '2999-12-31';
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from('tms_booking_window')
    .select('id, route_id, travel_date, booking_enabled, deadline, capacity_override, note')
    .eq('route_id', routeId).gte('travel_date', from).lte('travel_date', to)
    .order('travel_date', { ascending: true });
  if (error) {
    if (missing(error)) return NextResponse.json({ success: true, data: { rows: [] } });
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { rows: data ?? [] } });
}

async function upsert(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_EDIT))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const picked = pickBookingWindow(body);
  if ('error' in picked) return NextResponse.json({ error: picked.error }, { status: 400 });
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from('tms_booking_window')
    .upsert({ ...picked, updated_by: auth.userId, created_by: auth.userId }, { onConflict: 'route_id,travel_date' })
    .select('id').single();
  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  return NextResponse.json({ success: true, data: { id: data.id } });
}

async function remove(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_EDIT))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_booking_window').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const GET = withAuth((r, a) => list(r, a));
export const POST = withAuth((r, a) => upsert(r, a));
export const DELETE = withAuth((r, a) => remove(r, a));
```

- [ ] **Step 2: Type-check + probe + commit**

Run: `npm run type-check 2>&1 | grep -E "booking-window" || echo CLEAN` → `CLEAN`.
Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/admin/schedules/booking-window?route_id=x"` → `307`/`401`.
```bash
git add app/api/admin/schedules/booking-window/route.ts
git commit -m "feat(schedules): modern booking-window CRUD API (per-route-day overrides)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Admin API — manifest (booked learners per route+date)

**Files:** Create `app/api/admin/schedules/manifest/route.ts`

**Interfaces:**
- Produces `GET ?route_id=&date=` → `{ success, data: { date, routeLabel, booked, capacity, learners: Array<{ id, name, roll, stop }> } }`. Gated `SCHEDULES_VIEW`.

- [ ] **Step 1: Write the route**

Create `app/api/admin/schedules/manifest/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookedCount, routeCapacity } from '@/lib/booking/repo';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function manifest(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_VIEW))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const routeId = url.searchParams.get('route_id') ?? '';
  const date = url.searchParams.get('date') ?? '';
  if (!routeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'route_id and date (YYYY-MM-DD) are required' }, { status: 400 });
  }
  const svc = createServiceRoleClient();

  const bk = await svc
    .from('tms_booking')
    .select('learner_id, stop_id')
    .eq('route_id', routeId).eq('travel_date', date).eq('status', 'booked');
  if (bk.error && (bk.error as { code?: string }).code !== '42P01') {
    return NextResponse.json({ error: 'Failed to load manifest' }, { status: 500 });
  }
  const rows = (bk.data ?? []) as { learner_id: string; stop_id: string | null }[];

  const learnerIds = [...new Set(rows.map((r) => r.learner_id))];
  const stopIds = [...new Set(rows.map((r) => r.stop_id).filter(Boolean) as string[])];

  const namesById = new Map<string, { name: string; roll: string | null }>();
  if (learnerIds.length) {
    const lr = await svc.from('learners_profiles').select('id, first_name, last_name, roll_number').in('id', learnerIds);
    for (const l of (lr.data ?? []) as { id: string; first_name: string | null; last_name: string | null; roll_number: string | null }[]) {
      namesById.set(l.id, { name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || '—', roll: l.roll_number });
    }
  }
  const stopsById = new Map<string, string>();
  if (stopIds.length) {
    const sr = await svc.from('tms_route_stop').select('id, stop_name').in('id', stopIds);
    for (const s of (sr.data ?? []) as { id: string; stop_name: string }[]) stopsById.set(s.id, s.stop_name);
  }

  const learners = rows.map((r) => ({
    id: r.learner_id,
    name: namesById.get(r.learner_id)?.name ?? '—',
    roll: namesById.get(r.learner_id)?.roll ?? null,
    stop: r.stop_id ? stopsById.get(r.stop_id) ?? null : null,
  })).sort((a, b) => a.name.localeCompare(b.name));

  const rt = await svc.from('tms_route').select('route_number, route_name').eq('id', routeId).maybeSingle();
  const routeLabel = rt.data ? `${rt.data.route_number ?? '—'} · ${rt.data.route_name ?? ''}`.trim() : routeId;

  return NextResponse.json({
    success: true,
    data: { date, routeLabel, booked: await bookedCount(svc, routeId, date), capacity: await routeCapacity(svc, routeId), learners },
  });
}

export const GET = withAuth((r, a) => manifest(r, a));
```

- [ ] **Step 2: Type-check + probe + commit**

Run: `npm run type-check 2>&1 | grep -E "schedules/manifest" || echo CLEAN` → `CLEAN`.
Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/admin/schedules/manifest?route_id=x&date=2026-06-23"` → `307`/`401`.
```bash
git add app/api/admin/schedules/manifest/route.ts
git commit -m "feat(schedules): booked-learner manifest API (route+date)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Rewrite `/schedules` page → 3-tab control surface

**Files:** Rewrite `app/(admin)/schedules/page.tsx` (replaces the dead trip UI; keeps the route + nav entry)

**Interfaces:** Consumes Tasks 3–5 + existing `GET /api/admin/bookings/summary?date=` and `GET /api/admin/routes` (route list).

- [ ] **Step 1: Confirm the route-list endpoint**

Run: `grep -rn "from('tms_route')" app/api/admin/routes/route.ts | head -3`
Expected: the admin routes list API returns active routes with `id, route_number, route_name`. If the response shape differs, adapt the `fetchRoutes` parser in Step 2 to match (the page only needs `{ id, label }`).

- [ ] **Step 2: Write the page**

Replace the entire contents of `app/(admin)/schedules/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarDays, Ban, Users, Plus, Trash2, RefreshCw } from 'lucide-react';

type Tab = 'calendar' | 'windows' | 'manifest';
const istToday = () => new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);

interface RouteOpt { id: string; label: string }
async function fetchRoutes(): Promise<RouteOpt[]> {
  const res = await fetch('/api/admin/routes', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return [];
  const json = await res.json();
  const arr = (json.data ?? json.routes ?? json ?? []) as Array<Record<string, unknown>>;
  return arr.map((r) => ({
    id: String(r.id),
    label: `${(r.route_number ?? r.routeNumber ?? '—') as string} · ${(r.route_name ?? r.routeName ?? '') as string}`.trim(),
  }));
}

export default function SchedulesPage() {
  const [tab, setTab] = useState<Tab>('calendar');
  const { data: routes = [] } = useQuery({ queryKey: ['admin-routes'], queryFn: fetchRoutes });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transport Schedule Management</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Service calendar, booking windows, and daily load — over the live booking system.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        <TabButton active={tab === 'calendar'} onClick={() => setTab('calendar')} icon={<CalendarDays className="h-4 w-4" />} label="Service Calendar" />
        <TabButton active={tab === 'windows'} onClick={() => setTab('windows')} icon={<Ban className="h-4 w-4" />} label="Booking Windows" />
        <TabButton active={tab === 'manifest'} onClick={() => setTab('manifest')} icon={<Users className="h-4 w-4" />} label="Load & Manifest" />
      </div>

      {tab === 'calendar' && <ServiceCalendarTab />}
      {tab === 'windows' && <BookingWindowsTab routes={routes} />}
      {tab === 'manifest' && <ManifestTab routes={routes} />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
      {icon}{label}
    </button>
  );
}

const card = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900';
const input = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800';

/* ---- Tab 1: Service Calendar ---- */
interface ServiceCalRow { id: string; exception_date: string; route_id: string | null; kind: 'holiday' | 'no_service'; note: string | null }
function ServiceCalendarTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['svc-cal'],
    queryFn: async () => {
      const res = await fetch('/api/admin/schedules/service-calendar', { cache: 'no-store', credentials: 'same-origin' });
      return ((await res.json()).data?.rows ?? []) as ServiceCalRow[];
    },
  });
  const [date, setDate] = useState(istToday());
  const [kind, setKind] = useState<'holiday' | 'no_service'>('holiday');
  const [note, setNote] = useState('');

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/schedules/service-calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ exception_date: date, kind, note: note || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
    },
    onSuccess: () => { toast.success('Saved'); setNote(''); qc.invalidateQueries({ queryKey: ['svc-cal'] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/schedules/service-calendar?id=${id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['svc-cal'] }); },
  });

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">Date<input type="date" className={`mt-1 block ${input}`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">Type
          <select className={`mt-1 block ${input}`} value={kind} onChange={(e) => setKind(e.target.value as 'holiday' | 'no_service')}>
            <option value="holiday">Holiday (all routes)</option>
            <option value="no_service">No service</option>
          </select>
        </label>
        <label className="flex-1 text-sm">Note<input className={`mt-1 block w-full ${input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pongal" /></label>
        <button type="button" disabled={add.isPending} onClick={() => add.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      <div className={card}>
        {(data ?? []).length === 0 ? <p className="text-sm text-gray-500">No exceptions.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {(data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span><strong>{r.exception_date}</strong> · {r.kind === 'holiday' ? 'Holiday' : 'No service'}{r.note ? ` — ${r.note}` : ''}{r.route_id ? ' (route-specific)' : ' (all routes)'}</span>
                <button type="button" onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---- Tab 2: Booking Windows ---- */
interface WindowRow { id: string; travel_date: string; booking_enabled: boolean; deadline: string | null; capacity_override: number | null; note: string | null }
function BookingWindowsTab({ routes }: { routes: RouteOpt[] }) {
  const qc = useQueryClient();
  const [routeId, setRouteId] = useState('');
  const [date, setDate] = useState(istToday());
  const [enabled, setEnabled] = useState(true);
  const [deadline, setDeadline] = useState('');
  const [cap, setCap] = useState('');

  const { data } = useQuery({
    queryKey: ['windows', routeId],
    queryFn: async () => {
      if (!routeId) return [] as WindowRow[];
      const res = await fetch(`/api/admin/schedules/booking-window?route_id=${routeId}`, { cache: 'no-store', credentials: 'same-origin' });
      return ((await res.json()).data?.rows ?? []) as WindowRow[];
    },
    enabled: !!routeId,
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/schedules/booking-window', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ route_id: routeId, travel_date: date, booking_enabled: enabled, deadline: deadline ? new Date(deadline).toISOString() : null, capacity_override: cap || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
    },
    onSuccess: () => { toast.success('Window saved'); qc.invalidateQueries({ queryKey: ['windows', routeId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { await fetch(`/api/admin/schedules/booking-window?id=${id}`, { method: 'DELETE', credentials: 'same-origin' }); },
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['windows', routeId] }); },
  });

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">Route
          <select className={`mt-1 block ${input}`} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Select route…</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="text-sm">Date<input type="date" className={`mt-1 block ${input}`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Booking enabled</label>
        <label className="text-sm">Deadline<input type="datetime-local" className={`mt-1 block ${input}`} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        <label className="text-sm">Cap<input type="number" min={0} className={`mt-1 block w-24 ${input}`} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="auto" /></label>
        <button type="button" disabled={!routeId || save.isPending} onClick={() => save.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">Save window</button>
      </div>
      {routeId && (
        <div className={card}>
          {(data ?? []).length === 0 ? <p className="text-sm text-gray-500">No overrides for this route — the default 6 PM-day-before rule applies.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {(data ?? []).map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                  <span><strong>{w.travel_date}</strong> · {w.booking_enabled ? 'Open' : 'Closed'}{w.deadline ? ` · deadline ${new Date(w.deadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : ''}{w.capacity_override != null ? ` · cap ${w.capacity_override}` : ''}</span>
                  <button type="button" onClick={() => del.mutate(w.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Tab 3: Load & Manifest ---- */
interface SummaryRoute { id: string; label: string; booked: number; capacity: number }
interface Manifest { routeLabel: string; booked: number; capacity: number; learners: Array<{ id: string; name: string; roll: string | null; stop: string | null }> }
function ManifestTab({ routes }: { routes: RouteOpt[] }) {
  const [date, setDate] = useState(istToday());
  const [openRoute, setOpenRoute] = useState<string | null>(null);

  const { data: summary, refetch, isFetching } = useQuery({
    queryKey: ['load', date],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bookings/summary?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
      return ((await res.json()).data?.routes ?? []) as SummaryRoute[];
    },
  });
  const { data: manifest } = useQuery({
    queryKey: ['manifest', openRoute, date],
    queryFn: async () => {
      const res = await fetch(`/api/admin/schedules/manifest?route_id=${openRoute}&date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
      return (await res.json()).data as Manifest;
    },
    enabled: !!openRoute,
  });

  return (
    <div className="space-y-4">
      <div className={`${card} flex items-end gap-3`}>
        <label className="text-sm">Date<input type="date" className={`mt-1 block ${input}`} value={date} onChange={(e) => { setDate(e.target.value); setOpenRoute(null); }} /></label>
        <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
          {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </button>
      </div>
      <div className={card}>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {(summary ?? []).map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpenRoute(openRoute === r.id ? null : r.id)} className="flex w-full items-center justify-between py-2 text-left text-sm">
                <span className="font-medium">{r.label}</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">{r.booked}/{r.capacity} booked</span>
              </button>
              {openRoute === r.id && manifest && (
                <div className="pb-3 pl-2 text-sm">
                  {manifest.learners.length === 0 ? <p className="text-gray-500">No bookings.</p> : (
                    <ol className="list-decimal space-y-0.5 pl-5">
                      {manifest.learners.map((l) => <li key={l.id}>{l.name}{l.roll ? ` (${l.roll})` : ''}{l.stop ? ` — ${l.stop}` : ''}</li>)}
                    </ol>
                  )}
                </div>
              )}
            </li>
          ))}
          {(summary ?? []).length === 0 && <li className="py-2 text-sm text-gray-500">No active routes.</li>}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check 2>&1 | grep -E "\\(admin\\)/schedules/page" || echo CLEAN`
Expected: `CLEAN`. (The old trip-component imports are gone, so any leftover references would surface here.)

- [ ] **Step 4: Probe + user visual check**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/schedules` → `307`/`401`.
Then the user (logged in, with `tms.schedules.view`) confirms: three tabs render; adding a holiday appears in the list; saving a booking window for a route+date lists it; Load tab shows per-route booked/capacity for a date and expands to the booked-learner manifest.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/schedules/page.tsx"
git commit -m "feat(schedules): rewrite Schedule Management as 3-tab control surface on tms_

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wire booking windows into the student calendar

**Files:** Modify `app/api/student/bookings/route.ts` (month board + book gate honor `tms_booking_window`)

**Interfaces:** Consumes `loadWindows`, `effectiveOpen`, `buildMonthCells` from `@/lib/booking/calendar` (Task 2).

- [ ] **Step 1: Feed windows into the month board**

In `app/api/student/bookings/route.ts`, extend the calendar import (added in Plan 1 Task 4) to also import the window helpers:
```ts
import { buildMonthCells, loadExceptions, loadWindows, effectiveOpen, type CalendarException, type WindowOverride } from '@/lib/booking/calendar';
```
In the `?month=` branch (Plan 1 Task 4), after `exceptions` is loaded, also load windows and pass them in:
```ts
      const windows: Map<string, WindowOverride> = await loadWindows(
        svc2, learner.transport_route_id ?? null, from, to
      );
      const cells = buildMonthCells(monthParam, { bookedDates, exceptions, windows }).map((c) => ({
        ...c,
        cutoff: c.status === 'open' || c.status === 'booked'
          ? (windows.get(c.date)?.deadline ?? cutoffFor(c.date).toISOString())
          : null,
      }));
```

- [ ] **Step 2: Honor the window in the book gate**

In `mutate`, inside `if (action === 'book')`, replace the existing `if (!isBookingOpen(travelDate)) {...}` guard with a window-aware check (load the single-date window first):
```ts
      const winMap = await loadWindows(svc, learner.transport_route_id, travelDate, travelDate);
      if (!effectiveOpen(travelDate, { window: winMap.get(travelDate) })) {
        return NextResponse.json({ error: 'Booking is closed for that date' }, { status: 409 });
      }
```
Keep the existing service-calendar block check (Plan 1 Task 4 Step 3) immediately after.

- [ ] **Step 3: Type-check + probe + commit**

Run: `npm run type-check 2>&1 | grep -E "api/student/bookings" || echo CLEAN` → `CLEAN`.
Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/student/bookings?month=2026-06"` → `307`/`401`.
User check: set a route's date to `booking_enabled=false` in the admin Booking Windows tab → that date shows **closed** on the student calendar and a direct book attempt returns 409.
```bash
git add app/api/student/bookings/route.ts
git commit -m "feat(booking): student calendar + book gate honor tms_booking_window

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Coverage:** booking_window table → T1; window-aware gate → T2; admin 3 tabs → T6 backed by service-calendar (T3) / booking-window (T4) / manifest (T5) + existing summary; student integration → T7. Driver/boarding rosters + booked-stop surfacing = **Plan 3** (separate). Legacy `/api/admin/schedules/*` left orphaned per decision.
- **Placeholders:** none — every code step is complete. T6 Step 1 verifies the route-list endpoint shape before relying on it.
- **Type consistency:** `WindowOverride` defined in T2, consumed in T7; `pickServiceCalendar`/`pickBookingWindow` defined in T3, the booking-window route (T4) imports `pickBookingWindow`; the page (T6) consumes the exact response shapes the APIs return (`data.rows`, `data.routes`, `data.learners`).
- **Prerequisite restated:** Plan 1 Tasks 1–2 first (table + `lib/booking/calendar.ts` base). T2 modifies that file; T7 extends Plan 1 Task 4's `?month=` branch.

## Deferred to Plan 3 (driver + boarding)

1. `GET /api/driver/roster?date=` + driver roster page (booked passengers + booked-stop list via `bookedStopsForRouteDate` from Plan 1 Task 3).
2. Boarding roster: surface the booked-stop list.
3. Optional cleanup: delete the 14 orphaned legacy `/api/admin/schedules/*` routes + dead trip components once the new page is confirmed.
