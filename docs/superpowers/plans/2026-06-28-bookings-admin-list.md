# Bookings Admin List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead legacy `/bookings` admin page with a modern, read-only, date-scoped list over the live `tms_booking` table.

**Architecture:** A pure denormalize mapper (`lib/booking/admin-list.ts`, unit-tested) turns raw `tms_booking` rows + lookup maps into flat display rows. A modern `withAuth` + `requirePerm` GET route fetches a date-scoped slice, batches the label lookups, and returns those rows. A client page wires React Query → the shared `DataTable` engine, with date-range + route filters, stat cards, and CSV export. A nav entry exposes it. No DB migration, no mutations.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (service-role), `@tanstack/react-query`, `@tanstack/react-table` (via `components/ui/data-table.tsx`), Vitest, Tailwind v4, lucide-react.

## Global Constraints

- **Read-only.** No `POST`/`PUT`/`DELETE`, no write whitelist, no activity-log instrumentation.
- **Permission:** gate on `TMS_PERMISSIONS.BOOKINGS_VIEW` (`'tms.bookings.view'`) with the `auth.isSuperAdmin` bypass. No `custom_roles` seeding (`transport_head` already holds it).
- **`tms_booking` has a composite PK `(learner_id, travel_date)` and NO surrogate `id` and NO `status` column.** Row identity = `` `${learner_id}:${travel_date}` ``.
- **Chunk every bulk `.in(idCol, ids)` to ≤150 ids per call** and check the error (large-`.in()` gateway-limit rule).
- **Dates are `'YYYY-MM-DD'` in IST** (+05:30, no DST). Reuse `istToday()` / `addDays()` from `lib/booking/window.ts`; do not introduce a timezone library.
- **Verification:** `npx tsc --noEmit` (ESLint is broken in this repo) + Vitest for pure units + dev-server route probes. Full visual render is the user's (the agent's browser is unauthenticated).
- **Commit style:** Conventional Commits; end every commit message body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Work stays on branch `feat/bookings-admin-list`. Stage explicit paths — never `git add -A`.

---

### Task 1: Pure denormalize mapper, date-status classifier & types

**Files:**
- Create: `lib/booking/admin-list.ts`
- Test: `lib/booking/admin-list.test.ts`

**Interfaces:**
- Consumes: nothing (pure; `bookingDateStatus` takes `today` explicitly so tests are deterministic).
- Produces:
  - `interface RawBooking { learner_id: string; travel_date: string; route_id: string; stop_id: string | null; booked_at: string; booked_by: string | null }`
  - `interface LearnerRef { name: string; roll: string | null; profileId: string | null }`
  - `interface BookingRefs { learners: Map<string, LearnerRef>; routes: Map<string, string>; stops: Map<string, string> }`
  - `interface BookingListRow { key: string; learner_id: string; learner_name: string; roll_number: string | null; travel_date: string; route_id: string; route_label: string; stop_id: string | null; stop_name: string | null; booked_at: string; booked_by: string | null; booked_by_label: 'Self' | 'Admin' | '—' }`
  - `function toBookingRow(b: RawBooking, refs: BookingRefs): BookingListRow`
  - `type BookingDateStatus = 'today' | 'upcoming' | 'past'`
  - `function bookingDateStatus(travelDate: string, today: string): BookingDateStatus`

- [ ] **Step 1: Write the failing test**

Create `lib/booking/admin-list.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toBookingRow, bookingDateStatus, type BookingRefs } from './admin-list';

const refs: BookingRefs = {
  learners: new Map([
    ['L1', { name: 'Asha Rao', roll: '21CS001', profileId: 'P1' }],
    ['L2', { name: '', roll: null, profileId: null }],
  ]),
  routes: new Map([['R1', '05 · Sankari']]),
  stops: new Map([['S1', 'Main Gate']]),
};

describe('toBookingRow', () => {
  it('denormalizes a full row and marks self-booking', () => {
    const row = toBookingRow(
      { learner_id: 'L1', travel_date: '2026-07-01', route_id: 'R1', stop_id: 'S1', booked_at: '2026-06-30T10:00:00Z', booked_by: 'P1' },
      refs
    );
    expect(row.key).toBe('L1:2026-07-01');
    expect(row.learner_name).toBe('Asha Rao');
    expect(row.roll_number).toBe('21CS001');
    expect(row.route_label).toBe('05 · Sankari');
    expect(row.stop_name).toBe('Main Gate');
    expect(row.booked_by_label).toBe('Self');
  });

  it('falls back when labels are missing and flags admin/unknown booker', () => {
    const admin = toBookingRow(
      { learner_id: 'L2', travel_date: '2026-07-02', route_id: 'RX', stop_id: null, booked_at: '2026-07-01T10:00:00Z', booked_by: 'SOMEADMIN' },
      refs
    );
    expect(admin.learner_name).toBe('—');
    expect(admin.route_label).toBe('RX'); // falls back to id
    expect(admin.stop_name).toBeNull();
    expect(admin.booked_by_label).toBe('Admin');

    const none = toBookingRow(
      { learner_id: 'L2', travel_date: '2026-07-02', route_id: 'R1', stop_id: null, booked_at: '2026-07-01T10:00:00Z', booked_by: null },
      refs
    );
    expect(none.booked_by_label).toBe('—');
  });
});

describe('bookingDateStatus', () => {
  it('classifies relative to today', () => {
    expect(bookingDateStatus('2026-06-28', '2026-06-28')).toBe('today');
    expect(bookingDateStatus('2026-06-29', '2026-06-28')).toBe('upcoming');
    expect(bookingDateStatus('2026-06-27', '2026-06-28')).toBe('past');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/booking/admin-list.test.ts`
Expected: FAIL — `Failed to resolve import "./admin-list"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/booking/admin-list.ts`:

```ts
/**
 * Pure view-model for the admin Bookings list. Turns raw tms_booking rows +
 * pre-fetched label maps into flat display rows. No Supabase client, no Date —
 * fully unit-testable. tms_booking has a composite PK (learner_id, travel_date)
 * and no surrogate id, so `key` is synthesized for the table row id.
 */
export interface RawBooking {
  learner_id: string;
  travel_date: string; // 'YYYY-MM-DD'
  route_id: string;
  stop_id: string | null;
  booked_at: string; // ISO
  booked_by: string | null;
}

export interface LearnerRef {
  name: string;
  roll: string | null;
  profileId: string | null;
}

export interface BookingRefs {
  learners: Map<string, LearnerRef>;
  routes: Map<string, string>; // route_id -> label
  stops: Map<string, string>; // stop_id -> stop_name
}

export interface BookingListRow {
  key: string;
  learner_id: string;
  learner_name: string;
  roll_number: string | null;
  travel_date: string;
  route_id: string;
  route_label: string;
  stop_id: string | null;
  stop_name: string | null;
  booked_at: string;
  booked_by: string | null;
  booked_by_label: 'Self' | 'Admin' | '—';
}

export type BookingDateStatus = 'today' | 'upcoming' | 'past';

export function bookingDateStatus(travelDate: string, today: string): BookingDateStatus {
  if (travelDate === today) return 'today';
  return travelDate > today ? 'upcoming' : 'past';
}

export function toBookingRow(b: RawBooking, refs: BookingRefs): BookingListRow {
  const learner = refs.learners.get(b.learner_id);
  const booked_by_label: BookingListRow['booked_by_label'] = !b.booked_by
    ? '—'
    : learner?.profileId && b.booked_by === learner.profileId
      ? 'Self'
      : 'Admin';
  return {
    key: `${b.learner_id}:${b.travel_date}`,
    learner_id: b.learner_id,
    learner_name: learner?.name || '—',
    roll_number: learner?.roll ?? null,
    travel_date: b.travel_date,
    route_id: b.route_id,
    route_label: refs.routes.get(b.route_id) || b.route_id,
    stop_id: b.stop_id,
    stop_name: b.stop_id ? refs.stops.get(b.stop_id) ?? null : null,
    booked_at: b.booked_at,
    booked_by: b.booked_by,
    booked_by_label,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/booking/admin-list.test.ts`
Expected: PASS (2 files? no — 1 file, 3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add lib/booking/admin-list.ts lib/booking/admin-list.test.ts
git commit -m "$(cat <<'EOF'
feat(bookings): pure denormalize mapper + date-status for admin list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Modern GET API route (replace the dead one)

**Files:**
- Modify (full replace): `app/api/admin/bookings/route.ts`

**Interfaces:**
- Consumes: `toBookingRow`, `BookingListRow`, `RawBooking`, `LearnerRef`, `BookingRefs` (Task 1); `istToday`, `addDays` from `lib/booking/window.ts`; `withAuth`, `AuthContext`; `createServiceRoleClient`; `TMS_PERMISSIONS`.
- Produces: `GET /api/admin/bookings?from=&to=&route_id=` → `{ success: true, data: { from: string; to: string; rows: BookingListRow[] } }`.

- [ ] **Step 1: Replace the file**

Overwrite `app/api/admin/bookings/route.ts` entirely:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday, addDays } from '@/lib/booking/window';
import { toBookingRow, type RawBooking, type LearnerRef, type BookingRefs } from '@/lib/booking/admin-list';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Read-only admin list of tms_booking rows, scoped to a travel_date range
 * (default: today .. today+92). Denormalizes learner/route/stop labels with
 * chunked .in() lookups. Replaces the legacy handler that queried the dropped
 * `bookings` table with no auth.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const IN_CHUNK = 150;

/** Chunked .in() fetch (≤150 ids/call) — overflows the API gateway otherwise. */
async function fetchByIds<T>(svc: SupabaseClient, table: string, columns: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await svc.from(table).select(columns).in('id', slice);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function list(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const url = new URL(request.url);
    const today = istToday();
    const from = isDate(url.searchParams.get('from')) ? (url.searchParams.get('from') as string) : today;
    const to = isDate(url.searchParams.get('to')) ? (url.searchParams.get('to') as string) : addDays(today, 92);
    const routeId = url.searchParams.get('route_id');

    const svc = createServiceRoleClient();
    let q = svc
      .from('tms_booking')
      .select('learner_id, travel_date, route_id, stop_id, booked_at, booked_by')
      .gte('travel_date', from)
      .lte('travel_date', to)
      .order('travel_date', { ascending: true })
      .order('booked_at', { ascending: true });
    if (routeId) q = q.eq('route_id', routeId);

    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ success: true, data: { from, to, rows: [] } });
      console.error('admin/bookings list error:', error);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }
    const bookings = (data ?? []) as RawBooking[];

    const learnerIds = [...new Set(bookings.map((b) => b.learner_id))];
    const routeIds = [...new Set(bookings.map((b) => b.route_id))];
    const stopIds = [...new Set(bookings.map((b) => b.stop_id).filter((v): v is string => !!v))];

    const learners = new Map<string, LearnerRef>();
    for (const l of await fetchByIds<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null; profile_id: string | null }>(
      svc, 'learners_profiles', 'id, first_name, last_name, roll_number, profile_id', learnerIds
    )) {
      learners.set(l.id, { name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim(), roll: l.roll_number, profileId: l.profile_id });
    }
    const routes = new Map<string, string>();
    for (const r of await fetchByIds<{ id: string; route_number: string | null; route_name: string | null }>(
      svc, 'tms_route', 'id, route_number, route_name', routeIds
    )) {
      routes.set(r.id, `${r.route_number ?? '—'} · ${r.route_name ?? ''}`.trim());
    }
    const stops = new Map<string, string>();
    for (const s of await fetchByIds<{ id: string; stop_name: string }>(svc, 'tms_route_stop', 'id, stop_name', stopIds)) {
      stops.set(s.id, s.stop_name);
    }

    const refs: BookingRefs = { learners, routes, stops };
    const rows = bookings.map((b) => toBookingRow(b, refs));
    return NextResponse.json({ success: true, data: { from, to, rows } });
  } catch (e) {
    console.error('admin/bookings list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => list(request, auth));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/api/admin/bookings/route|lib/booking/admin-list" || echo "clean"`
Expected: `clean` (no errors referencing these files).

- [ ] **Step 3: Probe the route on the dev server**

Ensure the dev server is running (`npm run dev`), then:
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/bookings`
Expected: `307` or `401` (unauthenticated redirect/deny via proxy — proves the route is wired and gated, not 404/500).

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/bookings/route.ts
git commit -m "$(cat <<'EOF'
feat(bookings): modern withAuth GET over tms_booking (replaces dead route)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: DataTable columns factory

**Files:**
- Create: `app/(admin)/bookings/columns.tsx`

**Interfaces:**
- Consumes: `BookingListRow`, `bookingDateStatus`, `BookingDateStatus` (Task 1); `istToday` from `lib/booking/window.ts`; `DataTableColumnHeader` from `@/components/ui/data-table-column-header`; `ColumnDef` from `@tanstack/react-table`.
- Produces: `function getBookingColumns(today: string): ColumnDef<BookingListRow>[]` and a column with `id: 'dateStatus'` whose `accessorFn` returns the `BookingDateStatus` string (so the page can offer a Today/Upcoming/Past filter).

- [ ] **Step 1: Create the columns file**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { bookingDateStatus, type BookingListRow, type BookingDateStatus } from '@/lib/booking/admin-list';

const BADGE: Record<BookingDateStatus, { cls: string; label: string }> = {
  today: { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', label: 'Today' },
  upcoming: { cls: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', label: 'Upcoming' },
  past: { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', label: 'Past' },
};

function DateStatusBadge({ status }: { status: BookingDateStatus }) {
  const b = BADGE[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span>;
}

const fmtDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export function getBookingColumns(today: string): ColumnDef<BookingListRow>[] {
  return [
    {
      accessorKey: 'travel_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Travel Date" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{row.original.travel_date}</span>
          <DateStatusBadge status={bookingDateStatus(row.original.travel_date, today)} />
        </div>
      ),
    },
    {
      id: 'dateStatus',
      accessorFn: (b) => bookingDateStatus(b.travel_date, today),
      filterFn: (r, id, value) => (r.getValue(id) as string) === value,
      enableHiding: true,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <DateStatusBadge status={bookingDateStatus(row.original.travel_date, today)} />,
    },
    {
      accessorKey: 'learner_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900 dark:text-gray-100">{row.original.learner_name}</p>
          {row.original.roll_number ? <p className="truncate text-xs text-gray-500">{row.original.roll_number}</p> : null}
        </div>
      ),
    },
    {
      accessorKey: 'route_label',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => <span className="text-gray-700 dark:text-gray-300">{row.original.route_label}</span>,
    },
    {
      accessorKey: 'stop_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      cell: ({ row }) => row.original.stop_name ?? <span className="text-gray-400">—</span>,
    },
    {
      accessorKey: 'booked_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booked At" />,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-400">{fmtDateTime(row.original.booked_at)}</span>,
    },
    {
      accessorKey: 'booked_by_label',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booked By" />,
      filterFn: (r, id, value) => (r.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-400">{row.original.booked_by_label}</span>,
    },
  ];
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/\(admin\)/bookings/columns" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/bookings/columns.tsx"
git commit -m "$(cat <<'EOF'
feat(bookings): DataTable columns with Today/Upcoming/Past badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: CSV export helper

**Files:**
- Create: `app/(admin)/bookings/bookings-export.ts`
- Test: `app/(admin)/bookings/bookings-export.test.ts`

**Interfaces:**
- Consumes: `BookingListRow` (Task 1).
- Produces: `function toBookingsCsv(rows: BookingListRow[]): string` (pure) and `function downloadBookingsCsv(rows: BookingListRow[]): void` (browser Blob download).

- [ ] **Step 1: Write the failing test**

Create `app/(admin)/bookings/bookings-export.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toBookingsCsv } from './bookings-export';
import type { BookingListRow } from '@/lib/booking/admin-list';

const row: BookingListRow = {
  key: 'L1:2026-07-01', learner_id: 'L1', learner_name: 'Rao, Asha', roll_number: '21CS001',
  travel_date: '2026-07-01', route_id: 'R1', route_label: '05 · Sankari', stop_id: 'S1',
  stop_name: 'Main Gate', booked_at: '2026-06-30T10:00:00Z', booked_by: 'P1', booked_by_label: 'Self',
};

describe('toBookingsCsv', () => {
  it('emits a header + one row, quoting fields with commas', () => {
    const csv = toBookingsCsv([row]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Travel Date,Learner,Roll,Route,Stop,Booked At,Booked By');
    // Learner contains a comma => must be quoted
    expect(lines[1]).toContain('"Rao, Asha"');
    expect(lines[1]).toContain('21CS001');
    expect(lines[1]).toContain('05 · Sankari');
  });

  it('returns just the header for no rows', () => {
    expect(toBookingsCsv([]).split('\n')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(admin)/bookings/bookings-export.test.ts"`
Expected: FAIL — cannot resolve `./bookings-export`.

- [ ] **Step 3: Write minimal implementation**

Create `app/(admin)/bookings/bookings-export.ts`:

```ts
import type { BookingListRow } from '@/lib/booking/admin-list';

const HEADERS = ['Travel Date', 'Learner', 'Roll', 'Route', 'Stop', 'Booked At', 'Booked By'] as const;

function csvCell(value: string): string {
  // Quote if the cell contains a comma, quote, or newline; double interior quotes.
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toBookingsCsv(rows: BookingListRow[]): string {
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      r.travel_date,
      r.learner_name,
      r.roll_number ?? '',
      r.route_label,
      r.stop_name ?? '',
      r.booked_at,
      r.booked_by_label,
    ].map((c) => csvCell(String(c))).join(','));
  }
  return lines.join('\n');
}

export function downloadBookingsCsv(rows: BookingListRow[]): void {
  const blob = new Blob([toBookingsCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookings_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(admin)/bookings/bookings-export.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/bookings/bookings-export.ts" "app/(admin)/bookings/bookings-export.test.ts"
git commit -m "$(cat <<'EOF'
feat(bookings): CSV export helper for the admin list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The page (replace the legacy shell)

**Files:**
- Modify (full replace): `app/(admin)/bookings/page.tsx`

**Interfaces:**
- Consumes: `getBookingColumns` (Task 3); `downloadBookingsCsv` (Task 4); `BookingListRow`, `BookingDateStatus` (Task 1); `istToday`, `addDays` from `lib/booking/window.ts`; `DataTable` from `@/components/ui/data-table`; `useQuery` from `@tanstack/react-query`.
- Produces: the default-exported `BookingsPage` route component.

- [ ] **Step 1: Replace the file**

Overwrite `app/(admin)/bookings/page.tsx` entirely:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Download } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { istToday, addDays } from '@/lib/booking/window';
import { getBookingColumns } from './columns';
import { downloadBookingsCsv } from './bookings-export';
import type { BookingListRow } from '@/lib/booking/admin-list';

interface RouteOpt { id: string; label: string }
interface BoardResp { from: string; to: string; rows: BookingListRow[] }

async function fetchRoutes(): Promise<RouteOpt[]> {
  const res = await fetch('/api/admin/routes', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return [];
  const json = await res.json();
  const arr = (json.data ?? json.routes ?? []) as Array<Record<string, unknown>>;
  return arr.map((r) => ({
    id: String(r.id),
    label: `${(r.route_number ?? r.routeNumber ?? '—') as string} · ${(r.route_name ?? r.routeName ?? '') as string}`.trim(),
  }));
}

async function fetchBookings(from: string, to: string, routeId: string): Promise<BoardResp> {
  const qs = new URLSearchParams({ from, to });
  if (routeId) qs.set('route_id', routeId);
  const res = await fetch(`/api/admin/bookings?${qs.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load bookings');
  return json.data as BoardResp;
}

const input = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800';
const outlineBtn = 'inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50';

export default function BookingsPage() {
  const today = istToday();
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(addDays(today, 92));
  const [routeId, setRouteId] = useState('');

  const { data: routes = [] } = useQuery({ queryKey: ['admin-routes'], queryFn: fetchRoutes });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-bookings', from, to, routeId],
    queryFn: () => fetchBookings(from, to, routeId),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo(() => getBookingColumns(today), [today]);

  const stats = useMemo(() => {
    const learners = new Set(rows.map((r) => r.learner_id));
    const routeSet = new Set(rows.map((r) => r.route_id));
    const todayCount = rows.filter((r) => r.travel_date === today).length;
    return [
      { label: 'Bookings (in range)', value: rows.length },
      { label: 'Distinct Learners', value: learners.size },
      { label: 'Routes', value: routeSet.size },
      { label: "Today's Bookings", value: todayCount },
    ];
  }, [rows, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bookings</h1>
          <p className="text-gray-600 dark:text-gray-400">Daily bus bookings across all routes — read-only, over the live booking system.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <label className="text-sm">From<input type="date" className={`mt-1 block ${input}`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">To<input type="date" className={`mt-1 block ${input}`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm">Route
          <select className={`mt-1 block ${input}`} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">All routes</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {isError ? (
        <div className="py-16 text-center">
          <CalendarCheck className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="text-gray-600 dark:text-gray-400">Failed to load bookings. Please retry.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          entityName="bookings"
          isLoading={isLoading}
          getRowId={(r) => r.key}
          searchPlaceholder="Search learner, roll, route..."
          filters={[
            { columnId: 'dateStatus', title: 'When', options: [
              { label: 'Today', value: 'today' }, { label: 'Upcoming', value: 'upcoming' }, { label: 'Past', value: 'past' },
            ] },
            { columnId: 'booked_by_label', title: 'Booked By', options: [
              { label: 'Self', value: 'Self' }, { label: 'Admin', value: 'Admin' },
            ] },
          ]}
          toolbarActions={() => (
            <button type="button" className={outlineBtn} onClick={() => downloadBookingsCsv(rows)} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/\(admin\)/bookings/page" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/bookings/page.tsx"
git commit -m "$(cat <<'EOF'
feat(bookings): modern read-only list page (filters, stats, CSV export)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Navigation entry

**Files:**
- Modify: `lib/navigation.ts` (imports block + `allNavigation` array, after the `Schedules` item at `:57`)

**Interfaces:**
- Consumes: `TMS_PERMISSIONS.BOOKINGS_VIEW`; a lucide icon `CalendarCheck`.
- Produces: a new `NavItem` in the `transport` group at `/bookings`.

- [ ] **Step 1: Add the icon import**

In `lib/navigation.ts`, add `CalendarCheck` to the lucide-react import block (alongside `Calendar`):

```ts
  Calendar,
  CalendarCheck,
```

- [ ] **Step 2: Add the nav item**

Immediately after the `Schedules` entry, insert:

```ts
  { name: 'Bookings', href: '/bookings', icon: CalendarCheck, permission: TMS_PERMISSIONS.BOOKINGS_VIEW, group: 'transport' },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/navigation" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add lib/navigation.ts
git commit -m "$(cat <<'EOF'
feat(bookings): add Bookings nav item (transport, BOOKINGS_VIEW)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite for the new pure units**

Run: `npx vitest run lib/booking/admin-list.test.ts "app/(admin)/bookings/bookings-export.test.ts"`
Expected: all tests PASS.

- [ ] **Step 2: Type-check the whole touched set**

Run: `npx tsc --noEmit 2>&1 | grep -E "bookings|admin-list|navigation" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Probe the API once more**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/admin/bookings?from=2026-06-01&to=2026-09-30"`
Expected: `307`/`401` (gated). Not `404`/`500`.

- [ ] **Step 4: Hand off for authenticated visual check**

Ask the user to open `/bookings` in their authenticated browser and confirm: the list renders rows, the date-range/route filters refetch, the Today/Upcoming/Past badges are correct, stats update, and CSV export downloads. (The agent's browser is unauthenticated, so this step is the user's.)

---

## Self-Review

**Spec coverage:**
- §4 API route → Task 2. ✅
- §4 `lib/booking/admin-list.ts` mapper + test → Task 1. ✅
- §5 query params / defaults / chunked `.in()` / 42P01 guard / response shape → Task 2. ✅
- §6 columns + Today/Upcoming/Past badge → Task 3. ✅
- §6 page (filters, stats, DataTable, states) → Task 5. ✅
- §6 CSV export → Task 4 (+ wired in Task 5). ✅
- §4 nav entry → Task 6. ✅
- §7 permissions (no migration) → honored in Task 2 gate + Task 6 `permission`. ✅
- §8 testing/verification → Tasks 1/4 (vitest), 2/3/5/6 (tsc), 2/7 (probe), 7 (handoff). ✅
- §2 non-goals (no mutations/detail page/migration/activity-log) → respected; no task adds them. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command states expected output.

**Type consistency:** `BookingListRow` / `RawBooking` / `LearnerRef` / `BookingRefs` defined in Task 1 and consumed verbatim in Tasks 2–5. `getBookingColumns(today)` (Task 3) matches its call in Task 5. `bookingDateStatus(date, today)` signature consistent across Tasks 1, 3. `downloadBookingsCsv(rows)` (Task 4) matches its call in Task 5. Column ids `dateStatus` / `booked_by_label` used as filter `columnId`s in Task 5 exist in Task 3. The Task 4 test header literal `Travel Date,Learner,Roll,Route,Stop,Booked At,Booked By` matches `HEADERS.join(',')`. ✅
