# Activity Log Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only Activity Log admin module that records every admin action (create / update / delete / import / assign / scan …) across TMS modules into a new `tms_activity_log` table and shows them in an `/activity-log` DataTable page with filters, stats, and a details dialog.

**Architecture:** App-level logging — a `logActivity()` helper called from API route handlers after each successful mutation, writing via the service-role client. (DB triggers are NOT used: every admin route mutates through the service-role client, so `auth.uid()` is NULL inside triggers and the actor would be unattributable. The actor must come from app context — `withAuth`'s `AuthContext` for modern routes, the `x-user-id` header set by proxy.ts for legacy-style routes.) The UI follows the MODERN module pattern: `withAuth` + `requirePerm` API, `columns.tsx` + `DataTable`, nav entry gated by a new `tms.activity.view` permission key.

**Tech Stack:** Next.js 16 route handlers, Supabase (service-role writes, RLS deny-all), TanStack Table via shared `DataTable`, Radix Dialog, lucide icons.

---

## Locked scope decisions

1. **New table `tms_activity_log`** — the legacy `audit_logs` table referenced by `app/api/admin/audit-logs/route.ts` does **not exist** in the live DB (route is dead code). We do not resurrect it; the legacy route and `components/audit-logs.tsx` are left untouched (optional later cleanup).
2. **v1 instruments the MODERN modules only**: drivers, vehicles, routes, staff-route-assignments, passengers, gps-devices, boarding (scan/attendance). Legacy modules (schedules, payments, notifications, settings, admin grievances) get logging when they're migrated to the modern pattern — listed as Phase 2, NOT in this plan.
3. **New permission key `tms.activity.view`**, seeded onto `transport_head` in the same migration. Super admins pass implicitly (requirePerm short-circuits).
4. **Read-only module** — no edit/delete of log entries from the UI (tamper-evident). No retention/purge job in v1.
5. **Logging never breaks the action**: `logActivity` swallows all errors. It is `await`ed (not fire-and-forget) because un-awaited promises can be killed after the response is sent on serverless.
6. **List API returns the latest 500 (max 1000) rows** with server-side module/action/date filters; search/sort/pagination are client-side in DataTable, consistent with the other modules.
7. **No unit tests** — the project has no test framework (no jest/vitest in package.json) and ESLint is broken. Verification = `npx tsc --noEmit` (filtered to changed files) + dev-server route probes (expect 401/307 unauthenticated) + final **[USER VERIFY]** in the browser.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260612010000_create_tms_activity_log.sql` | Create | Table + indexes + RLS + permission seed |
| `lib/constants/tms-permissions.ts` | Modify | Add `ACTIVITY_VIEW` key |
| `lib/activity/log.ts` | Create | `logActivity` / `logActivityFromHeaders` helpers + action/module unions |
| `app/api/admin/activity-log/route.ts` | Create | GET list with filters + stats (withAuth + requirePerm) |
| `app/api/admin/{drivers,vehicles,routes,staff-route-assignments,passengers,gps}/**` | Modify | Insert `logActivity` calls after successful mutations |
| `app/api/boarding/{scan,attendance}/route.ts` | Modify | Log scan / manual attendance actions |
| `app/(admin)/activity-log/columns.tsx` | Create | Row type + column factory (badges, time, actor, entity) |
| `app/(admin)/activity-log/activity-details-dialog.tsx` | Create | Details dialog with changes JSON |
| `app/(admin)/activity-log/page.tsx` | Create | Page shell: stats cards + DataTable + dialog wiring |
| `lib/navigation.ts` | Modify | Add Activity Log nav entry (system group) |

---

### Task 1: Migration — `tms_activity_log` table + `tms.activity.view` permission

**Files:**
- Create: `supabase/migrations/20260612010000_create_tms_activity_log.sql`

- [ ] **Step 1: Check live DB state first** (per supabase-expert skill)

Run via `mcp__supabase__execute_sql`:
```sql
select tablename from pg_tables where schemaname = 'public' and tablename = 'tms_activity_log';
```
Expected: 0 rows (table does not exist yet).

- [ ] **Step 2: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Activity Log — admin action audit trail
--
-- Records every admin mutation (create/update/delete/import/assign/scan…)
-- performed through TMS API routes. Written EXCLUSIVELY via the service-role
-- client from lib/activity/log.ts; the actor comes from app auth context
-- (withAuth) because service-role writes make auth.uid() unusable in triggers.
--
-- actor_id is a SOFT reference to profiles.id (no FK) so log rows survive
-- profile deletion. RLS is enabled with NO policies: anon/authenticated get
-- nothing, service-role bypasses — reads go through the permission-checked
-- /api/admin/activity-log route (tms.activity.view).
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_activity_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,          -- profiles.id; null = system/unattributed
  actor_email  text,
  actor_role   text,
  module       text not null, -- 'drivers' | 'vehicles' | 'routes' | ...
  action       text not null, -- 'create' | 'update' | 'delete' | ...
  entity_type  text,          -- e.g. 'tms_vehicle'
  entity_id    text,          -- stringified PK of the affected row
  entity_label text,          -- human label, e.g. registration number
  description  text,
  changes      jsonb,         -- { before: {...}, after: {...} } when available
  metadata     jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

comment on table public.tms_activity_log is
  'TMS admin action audit trail. Service-role writes only (lib/activity/log.ts); read via /api/admin/activity-log gated on tms.activity.view.';

create index if not exists idx_tms_activity_log_created_at
  on public.tms_activity_log (created_at desc);
create index if not exists idx_tms_activity_log_module
  on public.tms_activity_log (module);
create index if not exists idx_tms_activity_log_actor
  on public.tms_activity_log (actor_id);
create index if not exists idx_tms_activity_log_entity
  on public.tms_activity_log (entity_type, entity_id);

alter table public.tms_activity_log enable row level security;
-- Intentionally NO policies: deny-all for anon/authenticated; service-role bypasses.

-- New permission key gating the Activity Log module; grant to transport_head
-- (same additive-merge contract as 20260612000000).
update public.custom_roles
set
  permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.activity.view": true}'::jsonb,
  updated_at = now()
where role_key = 'transport_head';
```

- [ ] **Step 3: Apply via MCP**

`mcp__supabase__apply_migration` with name `create_tms_activity_log` and the SQL above (verbatim).

- [ ] **Step 4: Verify**

```sql
select
  (select count(*) from pg_indexes where schemaname='public' and tablename='tms_activity_log') as index_count,
  (select rowsecurity from pg_tables where schemaname='public' and tablename='tms_activity_log') as rls_enabled,
  (select permissions ? 'tms.activity.view' from public.custom_roles where role_key='transport_head') as th_has_key;
```
Expected: `index_count` = 5 (4 ours + PK), `rls_enabled` = true, `th_has_key` = true.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260612010000_create_tms_activity_log.sql
git commit -m "feat(activity-log): tms_activity_log table + tms.activity.view permission"
```

---

### Task 2: Permission constant + logger helper

**Files:**
- Modify: `lib/constants/tms-permissions.ts` (after `DRIVER_SELF_VIEW`, before `} as const;`)
- Create: `lib/activity/log.ts`

- [ ] **Step 1: Add the permission constant**

In `lib/constants/tms-permissions.ts`, after the `DRIVER_SELF_VIEW` line:

```ts
  // Admin activity log (read-only module; entries are written server-side).
  ACTIVITY_VIEW: 'tms.activity.view',
```

- [ ] **Step 2: Create `lib/activity/log.ts`**

```ts
import { type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { AuthContext } from '@/lib/api/with-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Activity logging. Call AFTER a successful mutation. Never throws — a logging
// failure must never fail the action it describes. Always `await` the call:
// fire-and-forget promises may be killed after the response on serverless.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityAction =
  | 'create' | 'update' | 'delete' | 'import' | 'assign' | 'unassign'
  | 'upload' | 'activate' | 'deactivate' | 'scan' | 'mark';

export type ActivityModule =
  | 'drivers' | 'vehicles' | 'routes' | 'gps-devices' | 'passengers'
  | 'staff-route-assignments' | 'boarding' | 'enrollment' | 'grievances'
  | 'settings';

export interface ActivityEntry {
  module: ActivityModule;
  action: ActivityAction;
  /** Table or domain noun, e.g. 'tms_vehicle'. */
  entityType?: string;
  entityId?: string | number | null;
  /** Human-readable label, e.g. registration number or route name. */
  entityLabel?: string | null;
  description?: string;
  /** Before/after snapshots when cheap to provide. */
  changes?: { before?: unknown; after?: unknown } | null;
  metadata?: Record<string, unknown> | null;
}

function clientInfo(request: NextRequest) {
  const fwd = request.headers.get('x-forwarded-for');
  return {
    ip_address: fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip'),
    user_agent: request.headers.get('user-agent'),
  };
}

async function insertLog(
  actor: { id: string | null; email: string | null; role: string | null },
  request: NextRequest,
  entry: ActivityEntry
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('tms_activity_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      module: entry.module,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId != null ? String(entry.entityId) : null,
      entity_label: entry.entityLabel ?? null,
      description: entry.description ?? null,
      changes: entry.changes ?? null,
      metadata: entry.metadata ?? null,
      ...clientInfo(request),
    });
    if (error) console.error('[activity-log] insert failed:', error.message);
  } catch (e) {
    console.error('[activity-log] insert threw:', e);
  }
}

/** For MODERN routes wrapped in withAuth — actor from AuthContext. */
export async function logActivity(
  auth: AuthContext,
  request: NextRequest,
  entry: ActivityEntry
): Promise<void> {
  // Email isn't on AuthContext; resolve lazily and tolerate failure.
  let email: string | null = null;
  try {
    const { data } = await auth.supabase.auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    /* logged row still useful without email */
  }
  await insertLog({ id: auth.userId, email, role: auth.userRole }, request, entry);
}

/**
 * For routes NOT wrapped in withAuth (legacy-style, e.g. gps-devices): the
 * proxy (proxy.ts step 6) stamps x-user-id / x-user-role on every
 * authenticated request, so the actor is still attributable.
 */
export async function logActivityFromHeaders(
  request: NextRequest,
  entry: ActivityEntry
): Promise<void> {
  const id = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  let email: string | null = null;
  if (id) {
    try {
      const supabase = createServiceRoleClient();
      const { data } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', id)
        .single();
      email = data?.email ?? null;
    } catch {
      /* ignore */
    }
  }
  await insertLog({ id, email, role }, request, entry);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/(activity|constants)"`
Expected: no output (no errors in the new/changed files).

- [ ] **Step 4: Commit**

```bash
git add lib/constants/tms-permissions.ts lib/activity/log.ts
git commit -m "feat(activity-log): logActivity helpers + tms.activity.view constant"
```

---

### Task 3: List API — `app/api/admin/activity-log/route.ts`

**Files:**
- Create: `app/api/admin/activity-log/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// GET /api/admin/activity-log?module=&action=&actor=&date_from=&date_to=&limit=
// Returns the newest matching entries (default 500, max 1000) plus quick stats.
async function getActivityLog(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.activity.view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const moduleFilter = searchParams.get('module');
    const actionFilter = searchParams.get('action');
    const actorFilter = searchParams.get('actor');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10) || 500, 1000);

    const supabase = createServiceRoleClient();
    let query = supabase
      .from('tms_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (moduleFilter) query = query.eq('module', moduleFilter);
    if (actionFilter) query = query.eq('action', actionFilter);
    if (actorFilter) query = query.eq('actor_id', actorFilter);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data: logs, error } = await query;
    if (error) {
      // 42P01 = relation does not exist (migration not applied yet) — empty, not 500.
      if ((error as { code?: string }).code === '42P01') {
        return NextResponse.json({
          success: true,
          data: [],
          stats: { total: 0, today: 0, week: 0 },
        });
      }
      console.error('Activity log fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch activity log' }, { status: 500 });
    }

    // Quick stats (cheap head-count queries, unfiltered — "what happened lately").
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [{ count: total }, { count: today }, { count: week }] = await Promise.all([
      supabase.from('tms_activity_log').select('id', { count: 'exact', head: true }),
      supabase
        .from('tms_activity_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfToday.toISOString()),
      supabase
        .from('tms_activity_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
    ]);

    return NextResponse.json({
      success: true,
      data: logs ?? [],
      stats: { total: total ?? 0, today: today ?? 0, week: week ?? 0 },
    });
  } catch (e) {
    console.error('Activity log API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(getActivityLog);
```

- [ ] **Step 2: Type-check + probe**

Run: `npx tsc --noEmit 2>&1 | grep "activity-log"` — expected: no output.
With the dev server running: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/activity-log` — expected: `401` (unauthenticated; proxy/withAuth gate works).

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/activity-log/route.ts
git commit -m "feat(activity-log): GET /api/admin/activity-log with filters + stats"
```

---

### Task 4: Instrument modern mutation routes

**Files (Modify — executor MUST Read each file first, then apply the pattern):**

The uniform insertion pattern — immediately after a mutation succeeds (after the Supabase call's error check, before the success `NextResponse.json`):

```ts
import { logActivity } from '@/lib/activity/log';
// ...inside the handler, after success:
await logActivity(auth, request, {
  module: '<module>',
  action: '<action>',
  entityType: '<table>',
  entityId: <row>.id,
  entityLabel: <human label>,
  description: '<verb phrase>',
  changes: { after: <row> },           // update handlers: { before, after } if the
});                                     // handler already fetched the old row — do
                                        // NOT add an extra fetch just for logging.
```

Per-handler mapping (module / action / entityType / label source):

| File | Handler | module | action | entityType | entityLabel |
|---|---|---|---|---|---|
| `app/api/admin/drivers/route.ts` | POST | drivers | create | tms_driver | driver name/email from payload |
| `app/api/admin/drivers/[driverId]/route.ts` | PUT | drivers | update | tms_driver | driver name/email |
| `app/api/admin/drivers/[driverId]/route.ts` | DELETE | drivers | delete | tms_driver | driver name/email |
| `app/api/admin/drivers/bulk-delete/route.ts` | POST | drivers | delete | tms_driver | `metadata: { count, ids }` |
| `app/api/admin/drivers/import/route.ts` | POST | drivers | import | tms_driver | `metadata: { imported, failed }` |
| `app/api/admin/vehicles/route.ts` | POST | vehicles | create | tms_vehicle | registration_number |
| `app/api/admin/vehicles/route.ts` | PUT | vehicles | update | tms_vehicle | registration_number |
| `app/api/admin/vehicles/route.ts` | DELETE | vehicles | delete | tms_vehicle | registration_number |
| `app/api/admin/vehicles/import/route.ts` | POST | vehicles | import | tms_vehicle | `metadata: { imported, failed }` |
| `app/api/admin/vehicles/documents/route.ts` | POST | vehicles | upload | tms_vehicle | registration/doc name |
| `app/api/admin/routes/route.ts` | POST (if present) | routes | create | tms_route | route_number + route_name |
| `app/api/admin/routes/[routeId]/route.ts` | PUT | routes | update | tms_route | route_number + route_name |
| `app/api/admin/routes/[routeId]/route.ts` | DELETE | routes | delete | tms_route | route_number + route_name |
| `app/api/admin/routes/[routeId]/stops/route.ts` | POST/PUT/DELETE (as present) | routes | update | tms_route_stop | stop name |
| `app/api/admin/routes/import/route.ts` | POST | routes | import | tms_route | `metadata: { imported, failed }` |
| `app/api/admin/staff-route-assignments/route.ts` | POST | staff-route-assignments | assign | tms_staff_route_assignment | staff_email → route |
| `app/api/admin/staff-route-assignments/route.ts` | DELETE | staff-route-assignments | unassign | tms_staff_route_assignment | staff_email → route |
| `app/api/admin/passengers/learners/[learnerId]/route.ts` | PUT | passengers | update | learners_profiles | learner name |
| `app/api/admin/passengers/staff/[staffId]/route.ts` | PUT | passengers | update | staff | staff name |
| `app/api/admin/gps/devices/route.ts` | POST | gps-devices | create | gps_devices | device_name — **use `logActivityFromHeaders`** (route has no withAuth) |
| `app/api/admin/gps/devices/[id]/route.ts` | PUT/DELETE | gps-devices | update/delete | gps_devices | device_name — **`logActivityFromHeaders`** |
| `app/api/admin/gps/devices/[id]/activate/route.ts` | POST | gps-devices | activate | gps_devices | device_name — **`logActivityFromHeaders`** |
| `app/api/boarding/scan/route.ts` | POST | boarding | scan | tms_attendance | learner name/roll |
| `app/api/boarding/attendance/route.ts` | POST/PUT | boarding | mark | tms_attendance | learner name/roll |

- [ ] **Step 1: Instrument drivers module** (4 files per table above). For each handler: Read the file, add the import, insert the `await logActivity(...)` call after the success path, keeping the handler's existing variables for label/id.
- [ ] **Step 2: Run `npx tsc --noEmit 2>&1 | grep "api/admin/drivers"`** — expected: no output. Commit: `git commit -am "feat(activity-log): log driver mutations"`
- [ ] **Step 3: Instrument vehicles module** (3 files). Example for `app/api/admin/vehicles/route.ts` POST (after the insert succeeds, `newVehicle` in scope):

```ts
await logActivity(auth, request, {
  module: 'vehicles',
  action: 'create',
  entityType: 'tms_vehicle',
  entityId: newVehicle.id,
  entityLabel: newVehicle.registration_number,
  description: `Created vehicle ${newVehicle.registration_number}`,
  changes: { after: newVehicle },
});
```
- [ ] **Step 4: tsc filter on vehicles, commit** (`feat(activity-log): log vehicle mutations`)
- [ ] **Step 5: Instrument routes module** (4 files), tsc filter, commit (`feat(activity-log): log route mutations`)
- [ ] **Step 6: Instrument staff-route-assignments + passengers** (3 files), tsc filter, commit
- [ ] **Step 7: Instrument gps-devices with `logActivityFromHeaders`** (3 files — these are legacy-style, no `auth` in scope), tsc filter, commit
- [ ] **Step 8: Instrument boarding scan/attendance** (2 files — these ARE withAuth-wrapped; use `logActivity`), tsc filter, commit

**Rules for every insertion:** never wrap in try/catch (the helper already swallows); never log on the error path; never add an extra DB fetch solely to build `changes.before` — only include `before` when the handler already has the old row in scope.

---

### Task 5: UI — columns + details dialog + page

**Files:**
- Create: `app/(admin)/activity-log/columns.tsx`
- Create: `app/(admin)/activity-log/activity-details-dialog.tsx`
- Create: `app/(admin)/activity-log/page.tsx`

- [ ] **Step 1: Create `columns.tsx`**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, User } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Row shape from /api/admin/activity-log (tms_activity_log).
export interface ActivityRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  module: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  description: string | null;
  changes: { before?: unknown; after?: unknown } | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  import: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  assign: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
  unassign: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  upload: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  activate: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  deactivate: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400',
  scan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  mark: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};

const MODULE_LABEL: Record<string, string> = {
  'drivers': 'Drivers',
  'vehicles': 'Vehicles',
  'routes': 'Routes',
  'gps-devices': 'GPS Devices',
  'passengers': 'Passengers',
  'staff-route-assignments': 'Staff Assignments',
  'boarding': 'Boarding',
  'enrollment': 'Enrollment',
  'grievances': 'Grievances',
  'settings': 'Settings',
};

const fmtTime = (d: string) =>
  new Date(d).toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export function getActivityColumns(
  onView: (row: ActivityRow) => void
): ColumnDef<ActivityRow>[] {
  return [
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />,
      size: 140,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-600 dark:text-gray-300">
          {fmtTime(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: 'actor_email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Actor" />,
      cell: ({ row }) => (
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/15">
            <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {row.original.actor_email ?? 'System'}
            </span>
            <span className="block text-xs text-gray-500">{row.original.actor_role ?? '—'}</span>
          </span>
        </span>
      ),
    },
    {
      accessorKey: 'module',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Module" />,
      size: 140,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      cell: ({ row }) => (
        <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-500/15 dark:text-gray-300">
          {MODULE_LABEL[row.original.module] ?? row.original.module}
        </span>
      ),
    },
    {
      accessorKey: 'action',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      size: 110,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      cell: ({ row }) => (
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
            ACTION_BADGE[row.original.action] ?? ACTION_BADGE.deactivate
          }`}
        >
          {row.original.action}
        </span>
      ),
    },
    {
      id: 'entity',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Entity" />,
      accessorFn: (r) => `${r.entity_label ?? ''} ${r.entity_type ?? ''}`.trim(),
      cell: ({ row }) => {
        const r = row.original;
        if (!r.entity_label && !r.entity_type) return <span className="text-gray-400">—</span>;
        return (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {r.entity_label ?? '—'}
            </span>
            <span className="block font-mono text-xs text-gray-500">{r.entity_type ?? ''}</span>
          </span>
        );
      },
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-[320px] truncate text-sm text-gray-600 dark:text-gray-300">
          {row.original.description ?? '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                aria-label="Activity entry actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuLabel>Action</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => onView(row.original), 0)}>
                <Eye /> View details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}
```

- [ ] **Step 2: Create `activity-details-dialog.tsx`**

```tsx
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ActivityRow } from './columns';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{value ?? '—'}</dd>
    </div>
  );
}

export function ActivityDetailsDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: ActivityRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {entry.action} · {entry.module.replace(/-/g, ' ')}
          </DialogTitle>
          <DialogDescription>{entry.description ?? 'Activity entry details'}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-4">
          <Field label="Time" value={new Date(entry.created_at).toLocaleString()} />
          <Field label="Actor" value={entry.actor_email ?? 'System'} />
          <Field label="Role" value={entry.actor_role} />
          <Field label="IP Address" value={entry.ip_address} />
          <Field label="Entity" value={entry.entity_label} />
          <Field
            label="Entity Ref"
            value={
              entry.entity_type ? (
                <span className="font-mono text-xs">
                  {entry.entity_type}
                  {entry.entity_id ? ` · ${entry.entity_id}` : ''}
                </span>
              ) : null
            }
          />
        </dl>

        {entry.changes && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Changes</h4>
            <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
              {JSON.stringify(entry.changes, null, 2)}
            </pre>
          </div>
        )}

        {entry.metadata && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Metadata</h4>
            <pre className="max-h-40 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create `page.tsx`**

```tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, History, ListChecks } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getActivityColumns, type ActivityRow } from './columns';
import { ActivityDetailsDialog } from './activity-details-dialog';

const MODULE_OPTIONS = [
  { label: 'Drivers', value: 'drivers' },
  { label: 'Vehicles', value: 'vehicles' },
  { label: 'Routes', value: 'routes' },
  { label: 'GPS Devices', value: 'gps-devices' },
  { label: 'Passengers', value: 'passengers' },
  { label: 'Staff Assignments', value: 'staff-route-assignments' },
  { label: 'Boarding', value: 'boarding' },
];

const ACTION_OPTIONS = [
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
  { label: 'Import', value: 'import' },
  { label: 'Assign', value: 'assign' },
  { label: 'Unassign', value: 'unassign' },
  { label: 'Upload', value: 'upload' },
  { label: 'Scan', value: 'scan' },
  { label: 'Mark', value: 'mark' },
];

const ActivityLogPage = () => {
  const [entries, setEntries] = useState<ActivityRow[]>([]);
  const [stats, setStats] = useState({ total: 0, today: 0, week: 0 });
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<ActivityRow | null>(null);

  useEffect(() => {
    const fetchLog = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/admin/activity-log');
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to load activity log');
        setEntries(data.data || []);
        setStats(data.stats || { total: 0, today: 0, week: 0 });
      } catch (error) {
        console.error('Error fetching activity log:', error);
        toast.error('Failed to load activity log');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLog();
  }, []);

  const columns = useMemo(() => getActivityColumns(setViewing), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="text-gray-600">Audit trail of admin actions across all TMS modules</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <UniversalStatCard
          title="Today"
          value={stats.today}
          subtitle="Actions since midnight"
          icon={Activity}
          color="green"
          loading={loading}
          delay={0}
        />
        <UniversalStatCard
          title="Last 7 Days"
          value={stats.week}
          subtitle="Actions this week"
          icon={CalendarClock}
          color="blue"
          loading={loading}
          delay={1}
        />
        <UniversalStatCard
          title="All Time"
          value={stats.total}
          subtitle="Total recorded actions"
          icon={ListChecks}
          color="purple"
          loading={loading}
          delay={2}
        />
      </div>

      <DataTable
        columns={columns}
        data={entries}
        entityName="entries"
        isLoading={loading}
        pageSize={20}
        searchPlaceholder="Search actor, entity, description…"
        filters={[
          { columnId: 'module', title: 'Module', options: MODULE_OPTIONS },
          { columnId: 'action', title: 'Action', options: ACTION_OPTIONS },
        ]}
        getRowId={(e) => e.id}
      />

      <ActivityDetailsDialog
        entry={viewing}
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
      />
    </div>
  );
};

export default ActivityLogPage;
```

Note for executor: check `components/universal-stat-card.tsx` prop names before use (mirrors staff-route-assignments usage above, which is the canonical example). Check `components/ui/dialog.tsx` exports `Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle` (used the same way elsewhere, e.g. assignment-delete-dialog).

- [ ] **Step 4: Type-check + probe**

Run: `npx tsc --noEmit 2>&1 | grep "activity-log"` — expected: no output.
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/activity-log` — expected: `307` (redirect to login when unauthenticated).

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/activity-log"
git commit -m "feat(activity-log): /activity-log page with DataTable, filters, details dialog"
```

---

### Task 6: Navigation entry

**Files:**
- Modify: `lib/navigation.ts`

- [ ] **Step 1: Add the nav item**

Add `History` to the lucide-react import list at the top, then insert before the Settings entry:

```ts
  { name: 'Activity Log', href: '/activity-log', icon: History, permission: TMS_PERMISSIONS.ACTIVITY_VIEW, group: 'system' },
```

- [ ] **Step 2: Type-check, commit**

Run: `npx tsc --noEmit 2>&1 | grep "navigation"` — expected: no output.

```bash
git add lib/navigation.ts
git commit -m "feat(activity-log): sidebar + bottom-nav entry (system group)"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Full type-check** — `npx tsc --noEmit` (compare error count to pre-existing baseline; no NEW errors in changed files).
- [ ] **Step 2: Smoke-write a log row** via MCP to confirm the UI renders data:

```sql
insert into public.tms_activity_log (actor_email, actor_role, module, action, entity_type, entity_label, description)
values ('aiahs@jkkn.ac.in', 'super_admin', 'vehicles', 'create', 'tms_vehicle', 'TEST-0001', 'Smoke test entry — safe to delete');
```
- [ ] **Step 3: [USER VERIFY]** (agent's browser is unauthenticated — needs your login): open `/activity-log` → see the smoke entry + stats; perform a real action (e.g. edit a vehicle) → entry appears; check module/action filters, details dialog, dark mode, and that the nav item shows for Transport Head but the page 403s for roles without `tms.activity.view`.
- [ ] **Step 4: Delete the smoke row**:

```sql
delete from public.tms_activity_log where entity_label = 'TEST-0001';
```

---

## Phase 2 (explicitly OUT of this plan)

- Instrument legacy modules (schedules, payments, notifications, settings, admin grievances) as each migrates to the modern withAuth pattern — `logActivityFromHeaders` works there in the meantime if needed sooner.
- Retention/purge job (pg_cron) once volume warrants it.
- CSV export of the filtered log (the dead `components/audit-logs.tsx` has a reference implementation).
- Delete the dead legacy `app/api/admin/audit-logs/route.ts` + `components/audit-logs.tsx`.
