# Staff Route Assignment Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text-email staff route assignment with a bus-required-staff picker linked by `staff_id`, enforce one active route per staff, and add inline reassign.

**Architecture:** TMS-owned `tms_staff_route_assignment` keyed by `staff_id` (joined to the MyJKKN-owned `staff` table in JS, not via FK). API routes use `withAuth` + service-role + `tms.drivers.assign`. UI mirrors the existing Create-Driver "search → select → form" flow.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, TypeScript, Supabase (`@supabase/supabase-js` service-role), TanStack Table, Tailwind v4, react-hot-toast, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-03-staff-route-assignment-redesign-design.md`

## Verification strategy (read first)

This repo has **no unit-test runner** (only `tsc` + a broken eslint) and ~828 pre-existing `never`-type errors elsewhere, with `typescript.ignoreBuildErrors:true`. So tasks are NOT red-green TDD. Each task verifies with:

- **Filtered type-check** (run from repo root `D:/Sangeetha_V/TMS-ADMIN`):
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "staff-route-assignments|lib/staff-route-assignments" || echo "OK: no type errors in changed files"
  ```
  Expected: `OK: no type errors in changed files`.
- **Route probes** (final task) once `npm run dev` is running on port 3000. Unauthenticated requests return **307** (redirect to login) or **401** — either confirms the route compiled and is wired. Full UI behavior must be confirmed in the user's authenticated browser.

**Commits:** stage only this module's files in each `git add` (the working tree has an unrelated `app/(admin)/passengers/learners/page.tsx` edit — never stage it). Work on the current branch `main`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260603000000_add_staff_id_to_tms_sra.sql` | Add `staff_id` column + one-active-route-per-staff unique index (USER applies) |
| `lib/staff-route-assignments/types.ts` | Shared DTOs: `AvailableStaff`, `AssignmentStaff`, `AssignmentRoute`, `AssignmentRow` |
| `app/api/admin/staff-route-assignments/available-staff/route.ts` | Search bus-required staff for the picker (+ already-assigned flag) |
| `app/api/admin/staff-route-assignments/route.ts` | GET (join staff+route), POST (by `staffId`), PATCH (reassign), DELETE (soft) |
| `app/(admin)/staff-route-assignments/columns.tsx` | Rich Staff column + Edit/Remove actions |
| `app/(admin)/staff-route-assignments/page.tsx` | List page; modern `usePermissions()` auth; wires Edit |
| `app/(admin)/staff-route-assignments/assign/page.tsx` | Staff picker + route select (rebuilt) |
| `app/(admin)/staff-route-assignments/[id]/edit/page.tsx` | Reassign page (PATCH) |

---

### Task 1: Database migration (USER applies — agent cannot run DDL)

**Files:**
- Create: `supabase/migrations/20260603000000_add_staff_id_to_tms_sra.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Add staff_id to tms_staff_route_assignment.
--
-- The module now links each assignment to a real staff record (staff.id) instead
-- of a free-text email, and enforces ONE ACTIVE route per staff. staff is a
-- MyJKKN-owned table that TMS only reads, so there is intentionally NO hard FK
-- (refs are joined in JS, same boundary the passenger module uses).
--
-- Target: shared MyJKKN Supabase project (ref: kvizhngldtiuufknvehv).
-- Additive only. Idempotent: safe to re-run. Apply via Supabase dashboard/MCP.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tms_staff_route_assignment
  add column if not exists staff_id uuid;   -- staff.id (no hard FK; MyJKKN-owned)

-- One active assignment per staff (a staff can hold only one route at a time).
-- A route may still have many staff (no route-side unique index).
create unique index if not exists uq_tms_sra_staff_active
  on public.tms_staff_route_assignment(staff_id)
  where is_active and staff_id is not null;

create index if not exists idx_tms_sra_staff_id
  on public.tms_staff_route_assignment(staff_id);
```

- [ ] **Step 2: Verify the file exists**

Run:
```bash
ls -l supabase/migrations/20260603000000_add_staff_id_to_tms_sra.sql
```
Expected: the file is listed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260603000000_add_staff_id_to_tms_sra.sql
git commit -m "feat(staff-assignments): migration to add staff_id + one-route-per-staff index"
```

> **HANDOFF:** This SQL must be applied to the Supabase project by the user before the POST/PATCH write paths function. The agent cannot run DDL. Compilation and GET do not depend on it.

---

### Task 2: Shared types

**Files:**
- Create: `lib/staff-route-assignments/types.ts`

- [ ] **Step 1: Create the types file**

```ts
/**
 * Shared types for the Staff Route Assignment module.
 *
 * Keeps the API routes (app/api/admin/staff-route-assignments/*) and the UI
 * (app/(admin)/staff-route-assignments/*) in lockstep. No server-only imports
 * here, so client components can import these DTOs safely.
 */

// A bus-required staff member returned by the available-staff search; populates
// the assign picker. `alreadyAssigned` blocks re-selection (one route per staff).
export interface AvailableStaff {
  id: string; // staff.id
  name: string;
  staffId: string | null; // staff.staff_id (human-facing code)
  designation: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  alreadyAssigned: boolean;
  assignedRouteLabel: string | null; // e.g. "R12 · Erode Town" when alreadyAssigned
}

// The staff record embedded on each assignment row (joined by staff_id).
export interface AssignmentStaff {
  id: string;
  name: string;
  staffId: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
}

// The route embedded on each assignment (joined from tms_route by the API).
export interface AssignmentRoute {
  id: string;
  route_number?: string;
  route_name?: string;
  start_location?: string;
  end_location?: string;
  departure_time?: string;
  arrival_time?: string;
  status?: string;
  total_capacity?: number;
  current_passengers?: number;
}

// A row from GET /api/admin/staff-route-assignments.
export interface AssignmentRow {
  id: string;
  staff_id: string | null;
  staff_email: string;
  route_id: string;
  assigned_at: string;
  is_active: boolean;
  notes?: string | null;
  staff: AssignmentStaff | null;
  routes: AssignmentRoute | null;
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "lib/staff-route-assignments" || echo "OK: no type errors in changed files"
```
Expected: `OK: no type errors in changed files`.

- [ ] **Step 3: Commit**

```bash
git add lib/staff-route-assignments/types.ts
git commit -m "feat(staff-assignments): shared DTOs (AvailableStaff, AssignmentRow, etc.)"
```

---

### Task 3: Available-staff search API

**Files:**
- Create: `app/api/admin/staff-route-assignments/available-staff/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { AvailableStaff } from '@/lib/staff-route-assignments/types';

/**
 * Staff search for the "Assign Route to Staff" flow. Searches the MyJKKN-owned
 * `staff` table filtered to bus_required = true (same set as Passengers → Staff)
 * by name or email, so an admin can pick a staff member to assign to a route.
 * Each result is flagged with whether the staff already holds an ACTIVE route
 * assignment (one active route per staff).
 *
 * Permission: tms.drivers.assign (shared with the rest of this module).
 */
interface StaffSearchRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  designation: string | null;
  email: string | null;
  institution_email: string | null;
  phone: string | null;
  is_active: boolean | null;
}

async function requireAssign(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: 'tms.drivers.assign',
  });
  return !!data;
}

async function searchStaff(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireAssign(auth))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
      return NextResponse.json({ error: 'Search query must be at least 2 characters' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const pattern = `%${q}%`;
    const { data, error } = await supabase
      .from('staff')
      .select('id, first_name, last_name, staff_id, designation, email, institution_email, phone, is_active')
      .eq('bus_required', true)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
      .order('first_name', { ascending: true })
      .limit(10);

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Staff search error:', error);
      return NextResponse.json({ error: 'Failed to search staff' }, { status: 500 });
    }

    const rows = (data ?? []) as StaffSearchRow[];
    const staffIds = rows.map((s) => s.id);

    // Which of these staff already have an active assignment, and to which route?
    const assignedRouteByStaff = new Map<string, string | null>();
    if (staffIds.length) {
      const { data: assigns } = await supabase
        .from('tms_staff_route_assignment')
        .select('staff_id, route_id')
        .eq('is_active', true)
        .in('staff_id', staffIds);

      const assignRows = (assigns ?? []) as { staff_id: string | null; route_id: string }[];
      const routeIds = [...new Set(assignRows.map((a) => a.route_id).filter(Boolean))];
      const { data: routes } = routeIds.length
        ? await supabase.from('tms_route').select('id, route_number, route_name').in('id', routeIds)
        : { data: [] as { id: string; route_number: string | null; route_name: string | null }[] };
      const routeLabelById = new Map(
        (routes ?? []).map((r) => [r.id as string, `${r.route_number ?? ''} · ${r.route_name ?? ''}`.trim()])
      );
      for (const a of assignRows) {
        if (a.staff_id) assignedRouteByStaff.set(a.staff_id, routeLabelById.get(a.route_id) ?? null);
      }
    }

    const result: AvailableStaff[] = rows.map((s) => ({
      id: s.id,
      name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || (s.email ?? 'Unknown'),
      staffId: s.staff_id,
      designation: s.designation,
      email: s.email ?? s.institution_email ?? null,
      phone: s.phone,
      isActive: s.is_active ?? false,
      alreadyAssigned: assignedRouteByStaff.has(s.id),
      assignedRouteLabel: assignedRouteByStaff.get(s.id) ?? null,
    }));

    return NextResponse.json({ success: true, data: result, count: result.length });
  } catch (e) {
    console.error('Staff search API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => searchStaff(request, auth));
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "staff-route-assignments" || echo "OK: no type errors in changed files"
```
Expected: `OK: no type errors in changed files`.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/staff-route-assignments/available-staff/route.ts
git commit -m "feat(staff-assignments): bus-required staff search endpoint for the picker"
```

---

### Task 4: Assignment API — staff join, POST by staffId, PATCH reassign

**Files:**
- Modify (full rewrite): `app/api/admin/staff-route-assignments/route.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { AssignmentStaff } from '@/lib/staff-route-assignments/types';

// Service-role client bypasses RLS, so writes are gated by an explicit
// tms.drivers.assign check here (defense-in-depth; super admins bypass).
async function requireAssign(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: 'tms.drivers.assign',
  });
  return !!data;
}

// Columns of tms_route we surface alongside each assignment (joined in JS).
const ROUTE_COLS =
  'id, route_number, route_name, start_location, end_location, departure_time, arrival_time, status, total_capacity, current_passengers';

// Columns of staff we surface alongside each assignment (joined in JS by staff_id).
const STAFF_COLS = 'id, first_name, last_name, staff_id, designation, email, institution_email, phone';

interface StaffJoinRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  designation: string | null;
  email: string | null;
  institution_email: string | null;
  phone: string | null;
}

function toAssignmentStaff(s: StaffJoinRow): AssignmentStaff {
  return {
    id: s.id,
    name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || (s.email ?? 'Unknown'),
    staffId: s.staff_id,
    designation: s.designation,
    email: s.email ?? s.institution_email ?? null,
    phone: s.phone,
  };
}

// GET: active staff↔route assignments, each with its embedded staff + tms_route.
async function getAssignments() {
  try {
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from('tms_staff_route_assignment')
      .select('*')
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (error) {
      // Table absent (42P01) → degrade to empty list until the migration is applied.
      if (error.code === '42P01') {
        return NextResponse.json({ success: true, assignments: [], count: 0 });
      }
      console.error('Assignments query error:', error);
      return NextResponse.json({ success: false, error: 'Failed to fetch assignments' }, { status: 500 });
    }

    const assignmentRows = rows ?? [];

    // Join the route for each assignment in JS (robust to PostgREST FK cache).
    const routeIds = [...new Set(assignmentRows.map((r) => r.route_id).filter(Boolean))];
    const { data: routes } = routeIds.length
      ? await supabase.from('tms_route').select(ROUTE_COLS).in('id', routeIds)
      : { data: [] as Record<string, unknown>[] };
    const routeById = new Map((routes ?? []).map((r) => [r.id as string, r]));

    // Join the staff for each assignment in JS (by staff_id).
    const staffIds = [...new Set(assignmentRows.map((r) => r.staff_id).filter(Boolean))] as string[];
    const { data: staff } = staffIds.length
      ? await supabase.from('staff').select(STAFF_COLS).in('id', staffIds)
      : { data: [] as StaffJoinRow[] };
    const staffById = new Map(
      ((staff ?? []) as StaffJoinRow[]).map((s) => [s.id, toAssignmentStaff(s)])
    );

    const assignments = assignmentRows.map((r) => ({
      ...r,
      staff: r.staff_id ? staffById.get(r.staff_id) ?? null : null,
      routes: routeById.get(r.route_id) ?? null,
    }));
    return NextResponse.json({ success: true, assignments, count: assignments.length });
  } catch (e) {
    console.error('Assignments API error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST: assign a staff member (by staff_id) to a route.
async function postAssignment(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireAssign(auth))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const staffId = String(body?.staffId ?? '').trim();
    const routeId = String(body?.routeId ?? '').trim();
    const notes = body?.notes ? String(body.notes).trim() : null;

    if (!staffId || !routeId) {
      return NextResponse.json({ success: false, error: 'Staff and route are required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Verify the staff exists and is bus-required; derive the email for display.
    const { data: staff, error: staffErr } = await supabase
      .from('staff')
      .select('id, email, institution_email, bus_required')
      .eq('id', staffId)
      .maybeSingle();
    if (staffErr && staffErr.code === '42P01') {
      return NextResponse.json({ success: false, error: 'Staff table not found' }, { status: 503 });
    }
    if (!staff) {
      return NextResponse.json({ success: false, error: 'Staff not found' }, { status: 404 });
    }
    if (!staff.bus_required) {
      return NextResponse.json({ success: false, error: 'Only bus-required staff can be assigned' }, { status: 400 });
    }
    const staffEmail = String(staff.email ?? staff.institution_email ?? '').toLowerCase().trim();

    // Verify the route exists in tms_route.
    const { data: route, error: routeErr } = await supabase
      .from('tms_route')
      .select('id, status')
      .eq('id', routeId)
      .maybeSingle();
    if (routeErr && routeErr.code === '42P01') {
      return NextResponse.json({ success: false, error: 'Routes table not found — apply the tms_route migration' }, { status: 503 });
    }
    if (!route) {
      return NextResponse.json({ success: false, error: 'Route not found' }, { status: 404 });
    }

    // One active route per staff: reject if this staff already has one.
    const { data: existing } = await supabase
      .from('tms_staff_route_assignment')
      .select('id, route_id')
      .eq('staff_id', staffId)
      .eq('is_active', true)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'This staff member is already assigned to a route', assignmentId: existing.id },
        { status: 409 }
      );
    }

    const { data: assignment, error } = await supabase
      .from('tms_staff_route_assignment')
      .insert({ staff_id: staffId, staff_email: staffEmail, route_id: routeId, assigned_by: auth.userId, notes, is_active: true })
      .select('*')
      .single();
    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ success: false, error: 'Assignments table not found — apply the migration' }, { status: 503 });
      }
      // 23505 = unique_violation (the partial unique index on staff_id).
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'This staff member is already assigned to a route' }, { status: 409 });
      }
      console.error('Assignment create error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create assignment' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Route assigned successfully', assignment }, { status: 201 });
  } catch (e) {
    console.error('Assignment create error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: reassign an existing assignment to a different route (+ notes).
async function patchAssignment(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireAssign(auth))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const assignmentId = String(body?.assignmentId ?? '').trim();
    const routeId = String(body?.routeId ?? '').trim();
    const notes = body?.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : undefined;

    if (!assignmentId || !routeId) {
      return NextResponse.json({ success: false, error: 'Assignment and route are required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: route } = await supabase.from('tms_route').select('id').eq('id', routeId).maybeSingle();
    if (!route) {
      return NextResponse.json({ success: false, error: 'Route not found' }, { status: 404 });
    }

    const update: { route_id: string; notes?: string | null } = { route_id: routeId };
    if (notes !== undefined) update.notes = notes;

    const { data: updated, error } = await supabase
      .from('tms_staff_route_assignment')
      .update(update)
      .eq('id', assignmentId)
      .eq('is_active', true)
      .select('*')
      .maybeSingle();
    if (error) {
      console.error('Assignment reassign error:', error);
      return NextResponse.json({ success: false, error: 'Failed to reassign' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Assignment updated', assignment: updated });
  } catch (e) {
    console.error('Assignment reassign error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: soft-remove an assignment (is_active=false) so the unique index frees up.
async function deleteAssignment(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireAssign(auth))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const assignmentId = new URL(request.url).searchParams.get('assignmentId');
    if (!assignmentId) {
      return NextResponse.json({ success: false, error: 'Assignment ID is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('tms_staff_route_assignment')
      .update({ is_active: false })
      .eq('id', assignmentId);
    if (error) {
      console.error('Assignment remove error:', error);
      return NextResponse.json({ success: false, error: 'Failed to remove assignment' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Assignment removed successfully' });
  } catch (e) {
    console.error('Assignment remove error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getAssignments());
export const POST = withAuth((request, auth) => postAssignment(request, auth));
export const PATCH = withAuth((request, auth) => patchAssignment(request, auth));
export const DELETE = withAuth((request, auth) => deleteAssignment(request, auth));
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "staff-route-assignments" || echo "OK: no type errors in changed files"
```
Expected: `OK: no type errors in changed files`.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/staff-route-assignments/route.ts
git commit -m "feat(staff-assignments): join staff, POST by staffId, PATCH reassign"
```

---

### Task 5: Rich Staff column, Edit action, and modern auth (columns.tsx + page.tsx together)

These two files are changed in one task because `getAssignmentColumns` gains a third `onEdit` argument and `page.tsx` is its only caller — splitting them would leave an intermediate non-compiling commit.

**Files:**
- Modify (full rewrite): `app/(admin)/staff-route-assignments/columns.tsx`
- Modify (full rewrite): `app/(admin)/staff-route-assignments/page.tsx`

- [ ] **Step 1: Replace `columns.tsx`**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Clock, MapPin, MoreHorizontal, Pencil, Route as RouteIcon, Trash2, Users } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AssignmentRow } from '@/lib/staff-route-assignments/types';

// Re-export so existing importers of `./columns` keep working.
export type { AssignmentRow } from '@/lib/staff-route-assignments/types';

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export function getAssignmentColumns(
  onRemove: (a: AssignmentRow) => void,
  onEdit: (a: AssignmentRow) => void,
  canManage: boolean
): ColumnDef<AssignmentRow>[] {
  return [
    {
      // Staff: avatar + name + (designation · staffId). accessorFn so global
      // search matches name, staff id, and email.
      id: 'staff',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
      accessorFn: (a) => `${a.staff?.name ?? ''} ${a.staff?.staffId ?? ''} ${a.staff_email}`.trim(),
      cell: ({ row }) => {
        const a = row.original;
        const name = a.staff?.name ?? a.staff_email;
        return (
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              {name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{name}</span>
              <span className="block truncate text-xs text-gray-500">
                {[a.staff?.designation, a.staff?.staffId].filter(Boolean).join(' · ') || a.staff_email}
              </span>
            </span>
          </span>
        );
      },
    },
    {
      id: 'route',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (a) => `${a.routes?.route_number ?? ''} ${a.routes?.route_name ?? ''}`.trim(),
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r) return <span className="text-gray-400">—</span>;
        return (
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/15">
              <RouteIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{r.route_name ?? '—'}</span>
              <span className="block font-mono text-xs text-gray-500">{r.route_number ?? '—'}</span>
            </span>
          </span>
        );
      },
    },
    {
      id: 'trip',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trip" />,
      accessorFn: (a) => `${a.routes?.start_location ?? ''} ${a.routes?.end_location ?? ''}`.trim(),
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r?.start_location && !r?.end_location) return <span className="text-gray-400">—</span>;
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {r?.start_location ?? '—'} → {r?.end_location ?? '—'}
          </span>
        );
      },
    },
    {
      id: 'schedule',
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Schedule" />,
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r?.departure_time && !r?.arrival_time) return <span className="text-gray-400">—</span>;
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
            <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {r?.departure_time ?? '—'} – {r?.arrival_time ?? '—'}
          </span>
        );
      },
    },
    {
      id: 'passengers',
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Passengers" />,
      size: 120,
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r) return <span className="text-gray-400">—</span>;
        return (
          <span className="flex items-center gap-1.5 tabular-nums text-sm text-gray-600 dark:text-gray-300">
            <Users className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {r.current_passengers ?? 0}/{r.total_capacity ?? 0}
          </span>
        );
      },
    },
    {
      accessorKey: 'assigned_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned" />,
      size: 120,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.assigned_at)}</span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const a = row.original;
        if (!canManage) return null;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${a.staff?.name ?? a.staff_email}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTimeout(() => onEdit(a), 0)}>
                  <Pencil /> Reassign route
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => onRemove(a), 0)}
                  className="text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 [&>svg]:text-red-500"
                >
                  <Trash2 /> Remove assignment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
```

- [ ] **Step 2: Replace `page.tsx`**

```tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, UserCheck, Route as RouteIcon, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getAssignmentColumns } from './columns';
import type { AssignmentRow } from '@/lib/staff-route-assignments/types';

const StaffRouteAssignmentsPage = () => {
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.drivers.assign');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/staff-route-assignments');
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to load assignments');
      setAssignments(data.assignments || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      toast.error('Failed to load assignments');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAssignment = async (assignment: AssignmentRow) => {
    const who = assignment.staff?.name ?? assignment.staff_email;
    if (!confirm(`Remove the assignment of ${who} from this route?`)) return;
    try {
      const response = await fetch(
        `/api/admin/staff-route-assignments?assignmentId=${assignment.id}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to remove assignment');
      toast.success('Assignment removed');
      await fetchAssignments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove assignment');
    }
  };

  const columns = useMemo(
    () =>
      getAssignmentColumns(
        handleRemoveAssignment,
        (a) => router.push(`/staff-route-assignments/${a.id}/edit`),
        canManage
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage]
  );

  // Stats
  const totalAssignments = assignments.length;
  const assignedRoutes = new Set(assignments.map((a) => a.route_id)).size;
  const staffMembers = new Set(assignments.map((a) => a.staff_id ?? a.staff_email)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Route Assignments</h1>
          <p className="text-gray-600">Assign bus-required staff to routes for monitoring and management</p>
        </div>
        {canManage && (
          <button
            onClick={() => router.push('/staff-route-assignments/assign')}
            className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" /> Assign Route
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <UniversalStatCard
          title="Total Assignments"
          value={totalAssignments}
          subtitle="Active staff ↔ route links"
          icon={UserCheck}
          color="blue"
          loading={loading}
          delay={0}
        />
        <UniversalStatCard
          title="Assigned Routes"
          value={assignedRoutes}
          subtitle="Routes with staff"
          icon={RouteIcon}
          color="green"
          loading={loading}
          delay={1}
        />
        <UniversalStatCard
          title="Staff Members"
          value={staffMembers}
          subtitle="Unique staff assigned"
          icon={Users}
          color="purple"
          loading={loading}
          delay={2}
        />
      </div>

      <DataTable
        columns={columns}
        data={assignments}
        entityName="assignments"
        isLoading={loading}
        searchPlaceholder="Search staff name, ID, route…"
        getRowId={(a) => a.id}
      />
    </div>
  );
};

export default StaffRouteAssignmentsPage;
```

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "staff-route-assignments" || echo "OK: no type errors in changed files"
```
Expected: `OK: no type errors in changed files`.

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/staff-route-assignments/columns.tsx app/(admin)/staff-route-assignments/page.tsx
git commit -m "feat(staff-assignments): rich Staff column, Reassign action, usePermissions auth"
```

---

### Task 6: Rebuild the Assign page with a staff picker

**Files:**
- Modify (full rewrite): `app/(admin)/staff-route-assignments/assign/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Search, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import type { AvailableStaff } from '@/lib/staff-route-assignments/types';

interface RouteOption {
  id: string;
  route_number?: string;
  route_name?: string;
  start_location?: string;
  end_location?: string;
  status?: string;
}

const crumbs = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Staff Assignments', href: '/staff-route-assignments' },
  { label: 'Assign Route' },
];

export default function AssignRoutePage() {
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.drivers.assign');

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AvailableStaff[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<AvailableStaff | null>(null);
  const [routeId, setRouteId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Active routes for the dropdown (sourced from tms_route via /api/admin/routes).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/routes');
        const json = await res.json();
        if (active && json.success) {
          setRoutes((json.data as RouteOption[]).filter((r) => r.status === 'active'));
        }
      } catch {
        if (active) toast.error('Failed to load routes');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await fetch(
        `/api/admin/staff-route-assignments/available-staff?q=${encodeURIComponent(q.trim())}`
      );
      const json = await res.json();
      setResults(json.success ? (json.data as AvailableStaff[]) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return toast.error('Please select a staff member');
    if (!routeId) return toast.error('Please select a route');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/staff-route-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: selected.id, routeId, notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to assign route');
      toast.success('Route assigned successfully');
      router.push('/staff-route-assignments');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign route');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs} backHref="/staff-route-assignments" title="Assign Route to Staff" />
        <p className="text-gray-600">You don&apos;t have permission to assign routes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs}
        backHref="/staff-route-assignments"
        title="Assign Route to Staff"
        subtitle="Select a bus-required staff member and assign them to a route"
      />

      <SectionCard
        title="1. Select staff member"
        action={
          selected ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm font-medium text-green-600 hover:underline"
            >
              Change
            </button>
          ) : undefined
        }
      >
        {selected ? (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-500/20 dark:bg-green-500/10">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-white">
              <Check className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{selected.name}</p>
              <p className="truncate text-xs text-gray-500">
                {[selected.designation, selected.staffId, selected.email].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={runSearch} className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search bus-required staff by name or email…"
                  className="input pl-10!"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={searching || q.trim().length < 2}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </form>

            <div className="mt-3 space-y-2">
              {searching && <p className="text-sm text-gray-500">Searching…</p>}
              {!searching && searched && results.length === 0 && (
                <p className="text-sm text-gray-500">No bus-required staff found for &ldquo;{q.trim()}&rdquo;.</p>
              )}
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={s.alreadyAssigned}
                  onClick={() => !s.alreadyAssigned && setSelected(s)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-2.5 text-left transition-colors enabled:hover:border-green-300 enabled:hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60 dark:enabled:hover:bg-green-500/10"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{s.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {[s.designation, s.staffId, s.email].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </div>
                  {s.alreadyAssigned && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                      Already assigned{s.assignedRouteLabel ? ` · ${s.assignedRouteLabel}` : ''}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      {selected ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <SectionCard title="2. Assign to route">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="text-gray-600">Route *</span>
                <select className="input mt-1" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                  <option value="">Choose a route…</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.route_number} - {r.route_name} ({r.start_location} → {r.end_location})
                    </option>
                  ))}
                </select>
                {routes.length === 0 && (
                  <span className="mt-1 block text-xs text-gray-400">
                    No active routes found.{' '}
                    <a href="/routes" target="_blank" className="text-green-600 hover:underline">
                      Manage routes
                    </a>
                  </span>
                )}
              </label>

              <label className="block text-sm md:col-span-2">
                <span className="text-gray-600">Notes (optional)</span>
                <textarea
                  className="input mt-1"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this assignment…"
                />
              </label>
            </div>
          </SectionCard>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => router.push('/staff-route-assignments')}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {saving ? 'Assigning…' : 'Assign Route'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500 dark:bg-white/5">
          <UserPlus className="h-4 w-4 text-gray-400" />
          Select a staff member above to choose their route.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "staff-route-assignments" || echo "OK: no type errors in changed files"
```
Expected: `OK: no type errors in changed files`.

- [ ] **Step 3: Commit**

```bash
git add app/(admin)/staff-route-assignments/assign/page.tsx
git commit -m "feat(staff-assignments): rebuild assign page with bus-required staff picker"
```

---

### Task 7: Reassign (edit) page

**Files:**
- Create: `app/(admin)/staff-route-assignments/[id]/edit/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import type { AssignmentRow } from '@/lib/staff-route-assignments/types';

interface RouteOption {
  id: string;
  route_number?: string;
  route_name?: string;
  start_location?: string;
  end_location?: string;
  status?: string;
}

export default function EditAssignmentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = (params?.id as string) ?? '';
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.drivers.assign');

  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [routeId, setRouteId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [aRes, rRes] = await Promise.all([
          fetch('/api/admin/staff-route-assignments'),
          fetch('/api/admin/routes'),
        ]);
        const aJson = await aRes.json();
        const rJson = await rRes.json();
        if (!active) return;

        const found =
          (aJson.assignments as AssignmentRow[] | undefined)?.find((x) => x.id === id) ?? null;
        setAssignment(found);
        if (found) {
          setRouteId(found.route_id);
          setNotes(found.notes ?? '');
        }

        if (rJson.success) {
          const activeRoutes = (rJson.data as RouteOption[]).filter((r) => r.status === 'active');
          // Ensure the current route stays selectable even if it is no longer active.
          if (found?.routes && !activeRoutes.some((r) => r.id === found.route_id)) {
            activeRoutes.unshift({
              id: found.routes.id,
              route_number: found.routes.route_number,
              route_name: found.routes.route_name,
              start_location: found.routes.start_location,
              end_location: found.routes.end_location,
              status: found.routes.status,
            });
          }
          setRoutes(activeRoutes);
        }
      } catch {
        if (active) toast.error('Failed to load assignment');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const crumbs = useMemo(
    () => [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Staff Assignments', href: '/staff-route-assignments' },
      { label: 'Reassign' },
    ],
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId) return toast.error('Please select a route');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/staff-route-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: id, routeId, notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to reassign');
      toast.success('Assignment updated');
      router.push('/staff-route-assignments');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reassign');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs} backHref="/staff-route-assignments" title="Reassign" />
        <p className="text-gray-600">You don&apos;t have permission to manage assignments.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs}
        backHref="/staff-route-assignments"
        title="Reassign Staff Route"
        subtitle="Move this staff member to a different route"
      />

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !assignment ? (
        <p className="text-gray-600">Assignment not found.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <SectionCard title="Staff member">
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:bg-white/5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
                {(assignment.staff?.name ?? assignment.staff_email).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">
                  {assignment.staff?.name ?? assignment.staff_email}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {[assignment.staff?.designation, assignment.staff?.email ?? assignment.staff_email]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Route">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="text-gray-600">Route *</span>
                <select className="input mt-1" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                  <option value="">Choose a route…</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.route_number} - {r.route_name} ({r.start_location} → {r.end_location})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm md:col-span-2">
                <span className="text-gray-600">Notes (optional)</span>
                <textarea
                  className="input mt-1"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this assignment…"
                />
              </label>
            </div>
          </SectionCard>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => router.push('/staff-route-assignments')}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "staff-route-assignments" || echo "OK: no type errors in changed files"
```
Expected: `OK: no type errors in changed files`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/staff-route-assignments/[id]/edit/page.tsx"
git commit -m "feat(staff-assignments): inline reassign (edit) page via PATCH"
```

---

### Task 8: Final verification + migration handoff

**Files:** none (verification only)

- [ ] **Step 1: Full filtered type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "staff-route-assignments|lib/staff-route-assignments" || echo "OK: no type errors in changed files"
```
Expected: `OK: no type errors in changed files`.

- [ ] **Step 2: Ensure dev server is running**

Run (in a separate terminal if not already running):
```bash
npm run dev
```
Expected: Next.js dev server on `http://localhost:3000`.

- [ ] **Step 3: Probe the routes (unauthenticated → 307/401 is success)**

Run:
```bash
for p in \
  "/staff-route-assignments" \
  "/staff-route-assignments/assign" \
  "/api/admin/staff-route-assignments" \
  "/api/admin/staff-route-assignments/available-staff?q=ab" ; do \
  printf "%s -> " "$p"; \
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000$p"; \
done
```
Expected: each prints `200`, `307`, or `401` (NOT `404` and NOT `500`). A `404` means a route file is misplaced; a `500` means a compile/runtime error to investigate.

- [ ] **Step 4: Confirm no unrelated files were staged across the work**

Run:
```bash
git status --porcelain
```
Expected: the only unstaged/modified entry is `app/(admin)/passengers/learners/page.tsx` (the pre-existing unrelated change). Everything from this plan is already committed.

- [ ] **Step 5: HANDOFF — tell the user to apply the migration**

Report to the user:
> The code is committed. To activate the write path (assign/reassign), apply
> `supabase/migrations/20260603000000_add_staff_id_to_tms_sra.sql` to the Supabase
> project (dashboard SQL editor or MCP). Until then, GET works and degrades safely,
> but POST/PATCH need the `staff_id` column. Then verify end-to-end in your
> authenticated browser: search a bus-required staff → select → assign → see the
> row with the staff's name → Reassign route → Remove.

---

## Spec coverage (self-review)

| Spec change | Task |
|-------------|------|
| Migration `staff_id` + one-route-per-staff index | Task 1 |
| Shared DTOs | Task 2 |
| `available-staff` search (bus-required + already-assigned flag) | Task 3 |
| GET joins staff; POST by `staffId`; PATCH reassign; DELETE soft | Task 4 |
| Rich Staff column + Edit action | Task 5 |
| List page modern `usePermissions()` auth | Task 5 |
| Assign page staff picker | Task 6 |
| Reassign (edit) page | Task 7 |
| Permission reuse `tms.drivers.assign`; runtime probes | Tasks 3–4, 8 |
