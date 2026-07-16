# Driver Mobile Supply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only CRUD module to manage mobile phones supplied to drivers — each phone's full details (brand, model, color, IMEI, SIM/number, procurement, specs) and which driver it is supplied to.

**Architecture:** One new `tms_driver_mobile` table (each row = one physical phone) linked to a driver via `driver_staff_id → tms_driver(staff_id)` (the same FK convention as `tms_vehicle.assigned_driver_id`). Backend follows the MODERN pattern: `withAuth` + `requirePerm('tms.driver_mobiles.*')` over a service-role client, matching RLS on the table, and `logActivity` on every mutation. UI reuses the shared `DataTable` engine + in-module list/form/detail pages, exactly like the Transport Years and GPS Devices modules. Driver display names are resolved fresh at read time from `staff` (never denormalized), so they can't drift.

**Tech Stack:** Next.js 16 (App Router) + React 19, Supabase (Postgres + RLS), TanStack Query + TanStack Table, Tailwind v4, lucide-react, Vitest.

## Global Constraints

- Modern pattern only: API routes use `withAuth` + a local `requirePerm(auth, key)` helper; NEVER `DatabaseService`. Copy verbatim from `app/api/admin/transport-years/route.ts`.
- Response shape: success = `{ success: true, data, count? , message? }`; error = `{ error: string }` with an HTTP status. Every list GET guards Postgres `42P01` (missing table) by returning `{ success: true, data: [], count: 0 }`.
- All new tables are `tms_`-prefixed, additive, idempotent (`create table if not exists`), and target the shared Supabase project `kvizhngldtiuufknvehv`. Apply DDL via the Supabase MCP (`apply_migration`) AND commit the migration file under `supabase/migrations/`.
- Permission keys referenced through the `TMS_PERMISSIONS` constant, never raw strings, in TS. RLS/SQL uses the raw string.
- Vitest imports MUST use RELATIVE paths (`./fields`), NEVER the `@/` alias — the `@/` alias is not resolved under vitest in this repo.
- Verification: `npx tsc --noEmit` filtered to changed files (the build has `ignoreBuildErrors: true` and ESLint is broken, so `tsc` + Vitest are the real gates) plus dev-server route probes. Do NOT rely on `next build`.
- Commit after each task. Never `git add -A` (parallel sessions commit to this repo) — add the exact files each step lists. Branch: `feat/driver-mobile-supply` (already created).
- Client role checks (button visibility) are cosmetic; the server (`requirePerm` + RLS) is the authority. Mirror the sibling module's client check: `['super_admin', 'transport_manager']` for manage, `'super_admin'` for delete.

---

## File Structure

**Create:**
- `supabase/migrations/20260713120000_create_tms_driver_mobile.sql` — table + trigger + RLS + permission seed.
- `lib/driver-mobiles/fields.ts` — write-whitelist + `buildDriverMobilePayload()`.
- `lib/driver-mobiles/fields.test.ts` — Vitest unit test for the payload builder.
- `app/api/admin/driver-mobiles/route.ts` — GET (list, driver names resolved) + POST + PUT + DELETE.
- `app/api/admin/driver-mobiles/[id]/route.ts` — GET one (feeds detail + edit).
- `app/(admin)/driver-mobiles/columns.tsx` — `DriverMobileRow` type + column factory + status badge.
- `app/(admin)/driver-mobiles/page.tsx` — list shell (stats + DataTable + delete dialogs).
- `app/(admin)/driver-mobiles/driver-mobile-api.ts` — client fetchers (`fetchDriverMobile`, `fetchDriverOptions`).
- `app/(admin)/driver-mobiles/driver-mobile-form.tsx` — shared create/edit form.
- `app/(admin)/driver-mobiles/new/page.tsx` — create wrapper.
- `app/(admin)/driver-mobiles/[id]/edit/page.tsx` — edit wrapper.
- `app/(admin)/driver-mobiles/[id]/page.tsx` — read-only detail.

**Modify:**
- `lib/constants/tms-permissions.ts` — add 4 `DRIVER_MOBILES_*` keys.
- `lib/activity/log.ts` — add `'driver-mobiles'` to the `ActivityModule` union.
- `app/(admin)/activity-log/columns.tsx` — add `'driver-mobiles': 'Driver Mobiles'` to `MODULE_LABEL`.
- `lib/navigation.ts` — import `Smartphone`; add the `Driver Mobiles` nav item to the `transport` group.

---

## Task 1: Migration, permission constants & permission seed

**Files:**
- Create: `supabase/migrations/20260713120000_create_tms_driver_mobile.sql`
- Modify: `lib/constants/tms-permissions.ts:85` (add keys before the closing `} as const;`)

**Interfaces:**
- Produces: table `public.tms_driver_mobile` with columns listed below; permission keys `tms.driver_mobiles.{view,create,edit,delete}`; TS constants `TMS_PERMISSIONS.DRIVER_MOBILES_{VIEW,CREATE,EDIT,DELETE}`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260713120000_create_tms_driver_mobile.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- tms_driver_mobile: mobile phones supplied to drivers.
-- Each row = one physical phone, linked to a driver via driver_staff_id, which
-- FKs to tms_driver(staff_id) — the SAME convention as tms_vehicle.assigned_driver_id
-- (staff_id is UNIQUE on tms_driver). Only staff with a tms_driver ops row are
-- assignable. Driver display names are resolved at read time from `staff`
-- (not denormalized here) so they never go stale.
--
-- Target: shared MyJKKN project (ref: kvizhngldtiuufknvehv). Additive. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Shared updated_at trigger fn (already created by the GPS migration; re-assert
-- so this migration is self-contained and safe to run in isolation).
create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.tms_driver_mobile (
  id uuid primary key default gen_random_uuid(),
  driver_staff_id uuid not null references public.tms_driver(staff_id) on delete restrict,

  -- Core device details
  brand text not null,
  model text not null,
  color text,
  imei text,
  status text not null default 'assigned'
    check (status in ('assigned','returned','damaged','lost')),
  supplied_date date,
  notes text,

  -- SIM & number
  sim_number text,
  phone_number text,
  network_provider text,

  -- Procurement
  purchase_date date,
  purchase_cost numeric(12,2),
  supplier_name text,
  invoice_number text,
  warranty_expiry date,

  -- Physical & specs
  condition text check (condition in ('new','used','refurbished')),
  storage_capacity text,
  serial_number text,
  accessories text,

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create index if not exists idx_tms_driver_mobile_driver on public.tms_driver_mobile(driver_staff_id);
create index if not exists idx_tms_driver_mobile_status on public.tms_driver_mobile(status);
-- One physical device (IMEI) can't be entered twice. Partial: many rows may have null IMEI.
create unique index if not exists uq_tms_driver_mobile_imei
  on public.tms_driver_mobile(imei) where imei is not null;

drop trigger if exists trg_tms_driver_mobile_updated_at on public.tms_driver_mobile;
create trigger trg_tms_driver_mobile_updated_at
  before update on public.tms_driver_mobile
  for each row execute function public.tms_set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Admin routes use the service-role key (bypasses RLS). These policies gate any
-- direct anon/authenticated PostgREST access, keyed on the new permission keys.
alter table public.tms_driver_mobile enable row level security;

drop policy if exists tms_driver_mobile_select on public.tms_driver_mobile;
create policy tms_driver_mobile_select on public.tms_driver_mobile
  for select using (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.view')
  );

drop policy if exists tms_driver_mobile_insert on public.tms_driver_mobile;
create policy tms_driver_mobile_insert on public.tms_driver_mobile
  for insert with check (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.create')
  );

drop policy if exists tms_driver_mobile_update on public.tms_driver_mobile;
create policy tms_driver_mobile_update on public.tms_driver_mobile
  for update using (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.edit')
  ) with check (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.edit')
  );

drop policy if exists tms_driver_mobile_delete on public.tms_driver_mobile;
create policy tms_driver_mobile_delete on public.tms_driver_mobile
  for delete using (
    public.is_super_admin() or public.user_has_permission('tms.driver_mobiles.delete')
  );

-- ── Seed permission keys into the custom_roles catalog (data-driven) ─────────
-- VIEW → every role that can enter the admin dashboard (holds tms.dashboard.view).
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || '{"tms.driver_mobiles.view": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.dashboard.view')::boolean, false) = true;

-- CREATE + EDIT + DELETE → every role that can manage drivers (holds tms.drivers.manage).
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.driver_mobiles.create": true, "tms.driver_mobiles.edit": true, "tms.driver_mobiles.delete": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.drivers.manage')::boolean, false) = true;

-- ── Verification (run separately after applying) ─────────────────────────────
--   select role_key,
--          permissions ? 'tms.driver_mobiles.view'   as can_view,
--          permissions ? 'tms.driver_mobiles.create' as can_create
--   from public.custom_roles
--   where permissions ? 'tms.driver_mobiles.view'
--   order by role_key;
```

- [ ] **Step 2: Add the permission constants**

In `lib/constants/tms-permissions.ts`, add before the closing `} as const;` (after the `NOTIFICATIONS_MANAGE` line):

```ts
  // Driver mobile supply — physical phones supplied to drivers.
  DRIVER_MOBILES_VIEW: 'tms.driver_mobiles.view',
  DRIVER_MOBILES_CREATE: 'tms.driver_mobiles.create',
  DRIVER_MOBILES_EDIT: 'tms.driver_mobiles.edit',
  DRIVER_MOBILES_DELETE: 'tms.driver_mobiles.delete',
```

- [ ] **Step 3: Apply the migration to the live DB**

Use the Supabase MCP tool `apply_migration` with name `create_tms_driver_mobile` and the SQL from Step 1. (Per project norm, the MCP targets the real app DB.)

- [ ] **Step 4: Verify the table and seed**

Use the Supabase MCP `execute_sql` with:

```sql
select count(*) as role_count
from public.custom_roles
where permissions ? 'tms.driver_mobiles.view';
```

Expected: `role_count` ≥ 1. Then confirm the table exists:

```sql
select column_name from information_schema.columns
where table_name = 'tms_driver_mobile' order by ordinal_position;
```

Expected: the full column list from Step 1.

- [ ] **Step 5: Typecheck the constants file**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep tms-permissions || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260713120000_create_tms_driver_mobile.sql lib/constants/tms-permissions.ts
git commit -m "feat(driver-mobiles): tms_driver_mobile table, RLS & permission keys"
```

---

## Task 2: Field mapper + unit test (TDD)

**Files:**
- Create: `lib/driver-mobiles/fields.ts`
- Test: `lib/driver-mobiles/fields.test.ts`

**Interfaces:**
- Produces: `buildDriverMobilePayload(body: Record<string, unknown>): Record<string, unknown>` and `EDITABLE: readonly string[]`. Consumed by Task 3's route.

- [ ] **Step 1: Write the failing test**

Create `lib/driver-mobiles/fields.test.ts` (RELATIVE import — the `@/` alias is not resolved under vitest):

```ts
import { describe, it, expect } from 'vitest';
import { buildDriverMobilePayload } from './fields';

describe('buildDriverMobilePayload', () => {
  it('trims text and drops unknown keys', () => {
    const out = buildDriverMobilePayload({ brand: '  Samsung  ', hacker: 'x' });
    expect(out.brand).toBe('Samsung');
    expect('hacker' in out).toBe(false);
  });

  it('clamps status to the allowed enum, else null', () => {
    expect(buildDriverMobilePayload({ status: 'DAMAGED' }).status).toBe('damaged');
    expect(buildDriverMobilePayload({ status: 'bogus' }).status).toBe(null);
  });

  it('defaults status to "assigned" on create when the key is present but empty', () => {
    expect(buildDriverMobilePayload({ status: '' }).status).toBe('assigned');
  });

  it('coerces purchase_cost to a number, invalid → null', () => {
    expect(buildDriverMobilePayload({ purchase_cost: '12999.50' }).purchase_cost).toBe(12999.5);
    expect(buildDriverMobilePayload({ purchase_cost: 'abc' }).purchase_cost).toBe(null);
  });

  it('is a partial builder: only present keys are included', () => {
    const out = buildDriverMobilePayload({ color: 'Black' });
    expect(Object.keys(out)).toEqual(['color']);
  });

  it('passes driver_staff_id through as a uuid string, empty → null', () => {
    expect(buildDriverMobilePayload({ driver_staff_id: 'abc-123' }).driver_staff_id).toBe('abc-123');
    expect(buildDriverMobilePayload({ driver_staff_id: '' }).driver_staff_id).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/driver-mobiles/fields.test.ts`
Expected: FAIL — "Failed to resolve import './fields'" (file does not exist yet).

- [ ] **Step 3: Implement the field mapper**

Create `lib/driver-mobiles/fields.ts`:

```ts
// lib/driver-mobiles/fields.ts
// Single source of truth for tms_driver_mobile writable fields + payload
// normalisation. Used by the driver-mobiles API so create/update share one path.

export const ENUM_FIELDS: Record<string, readonly string[]> = {
  status: ['assigned', 'returned', 'damaged', 'lost'],
  condition: ['new', 'used', 'refurbished'],
};

export const NUM_FIELDS = ['purchase_cost'] as const;

export const DATE_FIELDS = ['supplied_date', 'purchase_date', 'warranty_expiry'] as const;

export const UUID_FIELDS = ['driver_staff_id'] as const;

export const TEXT_FIELDS = [
  'brand', 'model', 'color', 'imei', 'notes',
  'sim_number', 'phone_number', 'network_provider',
  'supplier_name', 'invoice_number',
  'storage_capacity', 'serial_number', 'accessories',
] as const;

// Every column the API will write (whitelist).
export const EDITABLE: readonly string[] = [
  ...Object.keys(ENUM_FIELDS), ...NUM_FIELDS, ...DATE_FIELDS, ...UUID_FIELDS, ...TEXT_FIELDS,
];

// Normalise a snake_case request body into a typed tms_driver_mobile payload.
// Only keys present in the body are included (so PUT can do partial updates).
export function buildDriverMobilePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => k in body;

  for (const k of TEXT_FIELDS) if (has(k)) out[k] = (body[k] as string)?.toString().trim() || null;
  for (const k of Object.keys(ENUM_FIELDS)) {
    if (!has(k)) continue;
    const v = (body[k] as string)?.toString().trim().toLowerCase();
    out[k] = v && ENUM_FIELDS[k].includes(v) ? v : null;
  }
  for (const k of NUM_FIELDS) {
    if (!has(k)) continue;
    const n = parseFloat(String(body[k]));
    out[k] = Number.isFinite(n) ? n : null;
  }
  for (const k of DATE_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of UUID_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;

  // status defaults to 'assigned' on create rather than null (matches DB default).
  if (has('status') && out.status == null) out.status = 'assigned';

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/driver-mobiles/fields.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add lib/driver-mobiles/fields.ts lib/driver-mobiles/fields.test.ts
git commit -m "feat(driver-mobiles): field whitelist + payload builder with tests"
```

---

## Task 3: API routes (collection + single)

**Files:**
- Create: `app/api/admin/driver-mobiles/route.ts`
- Create: `app/api/admin/driver-mobiles/[id]/route.ts`

**Interfaces:**
- Consumes: `buildDriverMobilePayload` (Task 2); `TMS_PERMISSIONS.DRIVER_MOBILES_*` (Task 1); `withAuth`, `AuthContext`, `createServiceRoleClient`, `logActivity`.
- Produces: `GET /api/admin/driver-mobiles` → `{ success, data: DriverMobileApiRow[], count }` where each row is the DB row plus `driver_name: string` and `driver_phone: string | null`. `GET /api/admin/driver-mobiles/:id` → `{ success, data: DriverMobileApiRow }`. POST/PUT/DELETE mutate.

- [ ] **Step 1: Write the collection route**

Create `app/api/admin/driver-mobiles/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { buildDriverMobilePayload } from '@/lib/driver-mobiles/fields';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// Resolve driver display name + phone for a set of staff ids (drivers originate
// from the MyJKKN `staff` table; tms_driver_mobile stores only driver_staff_id).
async function resolveDriverNames(
  supabase: ReturnType<typeof createServiceRoleClient>,
  staffIds: string[]
): Promise<Map<string, { name: string; phone: string | null }>> {
  const map = new Map<string, { name: string; phone: string | null }>();
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data } = await supabase.from('staff').select('id, first_name, last_name, phone').in('id', ids);
  for (const s of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; phone: string | null }[]) {
    const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
    map.set(s.id, { name: name || '—', phone: s.phone ?? null });
  }
  return map;
}

async function getDriverMobiles() {
  try {
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from('tms_driver_mobile')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Driver mobiles query error:', error);
      return NextResponse.json({ error: 'Failed to fetch driver mobiles' }, { status: 500 });
    }
    const list = (rows ?? []) as { driver_staff_id: string }[];
    const names = await resolveDriverNames(supabase, list.map((r) => r.driver_staff_id));
    const data = list.map((r) => ({
      ...r,
      driver_name: names.get(r.driver_staff_id)?.name ?? '—',
      driver_phone: names.get(r.driver_staff_id)?.phone ?? null,
    }));
    return NextResponse.json({ success: true, data, count: data.length });
  } catch (e) {
    console.error('Driver mobiles API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postDriverMobile(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_CREATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const payload = buildDriverMobilePayload(body);
    if (!payload.driver_staff_id) {
      return NextResponse.json({ error: 'A driver must be selected' }, { status: 400 });
    }
    if (!payload.brand || !payload.model) {
      return NextResponse.json({ error: 'Brand and model are required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tms_driver_mobile')
      .insert([{ ...payload, created_by: auth.userId, updated_by: auth.userId }])
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A mobile with this IMEI already exists' }, { status: 409 });
      }
      if (error.code === '23503') {
        return NextResponse.json({ error: 'Selected driver is not a valid onboarded driver' }, { status: 400 });
      }
      console.error('Driver mobile create error:', error);
      return NextResponse.json({ error: 'Failed to create driver mobile' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'driver-mobiles',
      action: 'create',
      entityType: 'tms_driver_mobile',
      entityId: data.id,
      entityLabel: `${data.brand} ${data.model}`,
      description: `Supplied ${data.brand} ${data.model} to a driver`,
      changes: { after: data },
    });
    return NextResponse.json({ success: true, data, message: 'Driver mobile created successfully' });
  } catch (e) {
    console.error('Driver mobile create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function putDriverMobile(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const id: string | undefined = body?.id || body?.driverMobileId;
    if (!id) return NextResponse.json({ error: 'Driver mobile id is required' }, { status: 400 });

    const payload = buildDriverMobilePayload(body); // partial — only present keys
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: before } = await supabase.from('tms_driver_mobile').select('*').eq('id', id).maybeSingle();
    if (!before) return NextResponse.json({ error: 'Driver mobile not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('tms_driver_mobile')
      .update({ ...payload, updated_by: auth.userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A mobile with this IMEI already exists' }, { status: 409 });
      }
      console.error('Driver mobile update error:', error);
      return NextResponse.json({ error: 'Failed to update driver mobile' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'driver-mobiles',
      action: 'update',
      entityType: 'tms_driver_mobile',
      entityId: data.id,
      entityLabel: `${data.brand} ${data.model}`,
      description: `Updated ${data.brand} ${data.model}`,
      changes: { before, after: data },
    });
    return NextResponse.json({ success: true, data, message: 'Driver mobile updated successfully' });
  } catch (e) {
    console.error('Driver mobile update error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function deleteDriverMobile(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_DELETE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Driver mobile id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase.from('tms_driver_mobile').select('*').eq('id', id).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Driver mobile not found' }, { status: 404 });

    const { error } = await supabase.from('tms_driver_mobile').delete().eq('id', id);
    if (error) {
      console.error('Driver mobile delete error:', error);
      return NextResponse.json({ error: 'Failed to delete driver mobile' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'driver-mobiles',
      action: 'delete',
      entityType: 'tms_driver_mobile',
      entityId: id,
      entityLabel: `${existing.brand} ${existing.model}`,
      description: `Deleted ${existing.brand} ${existing.model}`,
      changes: { before: existing },
    });
    return NextResponse.json({ success: true, message: 'Driver mobile deleted successfully' });
  } catch (e) {
    console.error('Driver mobile delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getDriverMobiles());
export const POST = withAuth((request, auth) => postDriverMobile(request, auth));
export const PUT = withAuth((request, auth) => putDriverMobile(request, auth));
export const DELETE = withAuth((request, auth) => deleteDriverMobile(request, auth));
```

- [ ] **Step 2: Write the single-record route**

Create `app/api/admin/driver-mobiles/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET one driver mobile (full row + resolved driver name/phone) by id. Backs the
 * in-module view/edit pages so they survive deep-link / hard refresh. Auth is
 * enforced by proxy.ts; writes go through the permission-gated POST/PUT/DELETE.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // Next 15/16: params is a Promise
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Driver mobile id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: row, error } = await supabase
      .from('tms_driver_mobile')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Driver mobile not found' }, { status: 404 });
      console.error('Driver mobile detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch driver mobile' }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: 'Driver mobile not found' }, { status: 404 });

    let driver_name = '—';
    let driver_phone: string | null = null;
    if ((row as { driver_staff_id?: string }).driver_staff_id) {
      const { data: s } = await supabase
        .from('staff')
        .select('first_name, last_name, phone')
        .eq('id', (row as { driver_staff_id: string }).driver_staff_id)
        .maybeSingle();
      if (s) {
        driver_name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '—';
        driver_phone = s.phone ?? null;
      }
    }

    return NextResponse.json({ success: true, data: { ...row, driver_name, driver_phone } });
  } catch (e) {
    console.error('Driver mobile detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck the new routes**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep driver-mobiles || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Probe the endpoint on the dev server**

Start the dev server if not running (`npm run dev`), then:

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/driver-mobiles`
Expected: `401` (unauthenticated — proxy blocks the API with JSON 401). This confirms the route is wired and the proxy gate is active. (A `200` empty list only appears for an authenticated admin; auth can't be exercised headless.)

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/driver-mobiles/route.ts app/api/admin/driver-mobiles/[id]/route.ts
git commit -m "feat(driver-mobiles): admin API routes (CRUD + single) with permission checks"
```

---

## Task 4: Columns + list page

**Files:**
- Create: `app/(admin)/driver-mobiles/columns.tsx`
- Create: `app/(admin)/driver-mobiles/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/driver-mobiles` (Task 3); shared `DataTable`, `ConfirmDialog`, `UniversalStatCard`, `DataTableColumnHeader`, `Checkbox`, dropdown-menu.
- Produces: `DriverMobileRow` interface + `getDriverMobileColumns(...)` + `statusBadge(status)` (imported by the detail page in Task 6).

- [ ] **Step 1: Write the columns file**

Create `app/(admin)/driver-mobiles/columns.tsx`:

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Row type — exactly what /api/admin/driver-mobiles returns (DB row + resolved driver).
export interface DriverMobileRow {
  id: string;
  driver_staff_id: string;
  driver_name: string;
  driver_phone: string | null;
  brand: string;
  model: string;
  color: string | null;
  imei: string | null;
  status: 'assigned' | 'returned' | 'damaged' | 'lost';
  supplied_date: string | null;
  notes: string | null;
  sim_number: string | null;
  phone_number: string | null;
  network_provider: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  supplier_name: string | null;
  invoice_number: string | null;
  warranty_expiry: string | null;
  condition: 'new' | 'used' | 'refurbished' | null;
  storage_capacity: string | null;
  serial_number: string | null;
  accessories: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_CLASS: Record<DriverMobileRow['status'], string> = {
  assigned: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  returned: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  damaged: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  lost: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

export const statusBadge = (status: DriverMobileRow['status']) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_CLASS[status] ?? STATUS_CLASS.returned}`}>
    {status}
  </span>
);

export function getDriverMobileColumns(
  onView: (m: DriverMobileRow) => void,
  onEdit: (m: DriverMobileRow) => void,
  onDelete: (m: DriverMobileRow) => void,
  canManage: boolean,
  canDelete: boolean
): ColumnDef<DriverMobileRow>[] {
  const selectColumn: ColumnDef<DriverMobileRow> = {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    size: 40,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v)} aria-label="Select row" />
    ),
  };

  return [
    ...(canManage ? [selectColumn] : []),
    {
      id: 'phone',
      accessorFn: (m) => `${m.brand} ${m.model}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="flex flex-col text-left"
        >
          <span className="font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100">
            {row.original.brand} {row.original.model}
          </span>
          <span className="text-xs text-gray-500">{row.original.color ?? '—'}</span>
        </button>
      ),
    },
    {
      accessorKey: 'driver_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Driver" />,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.original.driver_name}</span>
          {row.original.driver_phone && <span className="text-xs text-gray-500">{row.original.driver_phone}</span>}
        </span>
      ),
    },
    {
      accessorKey: 'phone_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">{row.original.phone_number ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'imei',
      header: ({ column }) => <DataTableColumnHeader column={column} title="IMEI" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{row.original.imei ?? '—'}</span>
      ),
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (m) => m.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => statusBadge(row.original.status),
      size: 120,
    },
    {
      accessorKey: 'supplied_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplied" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.supplied_date)}</span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const m = row.original;
        const open = (fn: (m: DriverMobileRow) => void) => setTimeout(() => fn(m), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${m.brand} ${m.model}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(onView)}>
                  <Eye className="text-gray-500" /> View
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => open(onEdit)}>
                    <Pencil className="text-gray-500" /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => open(onDelete)}
                      className="text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 [&>svg]:text-red-500"
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
```

- [ ] **Step 2: Write the list page**

Create `app/(admin)/driver-mobiles/page.tsx`:

```tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Smartphone, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import UniversalStatCard from '@/components/universal-stat-card';
import { getDriverMobileColumns, type DriverMobileRow } from './columns';

async function fetchMobiles(): Promise<DriverMobileRow[]> {
  const res = await fetch('/api/admin/driver-mobiles');
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to fetch driver mobiles');
  return (result.data || []) as DriverMobileRow[];
}

export default function DriverMobilesPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ role?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DriverMobileRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<{ rows: DriverMobileRow[]; reset: () => void } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setUser(JSON.parse(u));
  }, []);

  const { data: mobiles = [], isLoading: loading, isError, refetch } = useQuery({
    queryKey: ['driver-mobiles'],
    queryFn: fetchMobiles,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load driver mobiles');
  }, [isError]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/driver-mobiles?id=${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to delete');
      toast.success(`Deleted ${deleteTarget.brand} ${deleteTarget.model}`);
      setDeleteTarget(null);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete driver mobile');
    } finally {
      setDeleting(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (!bulkTarget) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        bulkTarget.rows.map((r) =>
          fetch(`/api/admin/driver-mobiles?id=${r.id}`, { method: 'DELETE', credentials: 'same-origin' }).then(
            async (res) => {
              const j = await res.json().catch(() => ({}));
              if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
            }
          )
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = bulkTarget.rows.length - failed;
      if (failed === 0) toast.success(`Deleted ${ok} mobile(s)`);
      else toast.error(`Deleted ${ok}, failed ${failed}`);
      bulkTarget.reset();
      setBulkTarget(null);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleView = (m: DriverMobileRow) => router.push(`/driver-mobiles/${m.id}`);
  const handleEdit = (m: DriverMobileRow) => router.push(`/driver-mobiles/${m.id}/edit`);
  const handleDelete = (m: DriverMobileRow) => setDeleteTarget(m);

  const userRole = user?.role ?? '';
  const canManage = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';

  const columns = useMemo(
    () => getDriverMobileColumns(handleView, handleEdit, handleDelete, canManage, canDelete),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canDelete]
  );

  const total = mobiles.length;
  const assigned = mobiles.filter((m) => m.status === 'assigned').length;
  const returned = mobiles.filter((m) => m.status === 'returned').length;
  const issues = mobiles.filter((m) => m.status === 'damaged' || m.status === 'lost').length;
  const stats = [
    { title: 'Total Mobiles', value: total, subtitle: 'All supplied phones', icon: Smartphone, color: 'blue' as const },
    { title: 'Assigned', value: assigned, subtitle: 'Currently with drivers', icon: CheckCircle, color: 'green' as const },
    { title: 'Returned', value: returned, subtitle: 'Handed back', icon: Smartphone, color: 'purple' as const },
    { title: 'Damaged / Lost', value: issues, subtitle: 'Needs attention', icon: AlertTriangle, color: 'orange' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver Mobiles</h1>
          <p className="text-gray-600">Manage mobile phones supplied to drivers</p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => router.push('/driver-mobiles/new')}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Add Mobile
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <UniversalStatCard
            key={s.title}
            title={s.title}
            value={s.value}
            subtitle={s.subtitle}
            icon={s.icon}
            color={s.color}
            variant="default"
            loading={loading}
            delay={i}
          />
        ))}
      </div>

      <DataTable
        columns={columns}
        data={mobiles}
        entityName="driver mobiles"
        isLoading={loading}
        searchPlaceholder="Search brand, model, IMEI, driver..."
        enableRowSelection={canManage}
        getRowId={(m) => m.id}
        filters={[
          { columnId: 'status', title: 'Status', options: [
            { label: 'Assigned', value: 'assigned' },
            { label: 'Returned', value: 'returned' },
            { label: 'Damaged', value: 'damaged' },
            { label: 'Lost', value: 'lost' },
          ]},
        ]}
        toolbarActions={({ selectedRows, resetSelection }) =>
          canDelete && selectedRows.length > 0 ? (
            <button
              type="button"
              onClick={() => setBulkTarget({ rows: selectedRows, reset: resetSelection })}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.length})
            </button>
          ) : null
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete driver mobile?"
        description={
          deleteTarget
            ? `This permanently deletes "${deleteTarget.brand} ${deleteTarget.model}". This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        loading={deleting}
        danger
      />

      <ConfirmDialog
        open={!!bulkTarget}
        onOpenChange={(open) => { if (!open) setBulkTarget(null); }}
        title={`Delete ${bulkTarget?.rows.length ?? 0} mobile(s)?`}
        description="This permanently deletes the selected driver mobiles. This action cannot be undone."
        confirmLabel="Delete Selected"
        onConfirm={confirmBulkDelete}
        loading={bulkDeleting}
        danger
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "driver-mobiles" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/driver-mobiles/columns.tsx" "app/(admin)/driver-mobiles/page.tsx"
git commit -m "feat(driver-mobiles): list page + data-table columns"
```

---

## Task 5: API fetcher + form + create/edit wrappers

**Files:**
- Create: `app/(admin)/driver-mobiles/driver-mobile-api.ts`
- Create: `app/(admin)/driver-mobiles/driver-mobile-form.tsx`
- Create: `app/(admin)/driver-mobiles/new/page.tsx`
- Create: `app/(admin)/driver-mobiles/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `DriverMobileRow` (Task 4); `POST/PUT /api/admin/driver-mobiles` and `GET /api/admin/driver-mobiles/:id` (Task 3); `GET /api/admin/drivers` for the picker; shared `DetailPageHeader`.
- Produces: `fetchDriverMobile(id): Promise<DriverMobileRow>`, `fetchDriverOptions(): Promise<DriverOption[]>`, `DriverMobileForm` component.

- [ ] **Step 1: Write the client fetchers**

Create `app/(admin)/driver-mobiles/driver-mobile-api.ts`:

```ts
import type { DriverMobileRow } from './columns';

export async function fetchDriverMobile(id: string): Promise<DriverMobileRow> {
  const res = await fetch(`/api/admin/driver-mobiles/${id}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load driver mobile');
  return json.data as DriverMobileRow;
}

export interface DriverOption {
  id: string;   // staff id — matches tms_driver.staff_id (the FK target)
  name: string;
  phone: string | null;
}

// Drivers come from /api/admin/drivers (mapped from `staff`). Only those WITH a
// tms_driver ops row (`ops != null`) can be assigned — the mobile FK targets
// tms_driver(staff_id), so a staffer without an ops row would fail the FK.
export async function fetchDriverOptions(): Promise<DriverOption[]> {
  const res = await fetch('/api/admin/drivers', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load drivers');
  return (json.data as { id: string; name: string; phone: string | null; ops: unknown }[])
    .filter((d) => d.ops != null)
    .map((d) => ({ id: d.id, name: d.name, phone: d.phone ?? null }));
}
```

- [ ] **Step 2: Write the shared form**

Create `app/(admin)/driver-mobiles/driver-mobile-form.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchDriverOptions } from './driver-mobile-api';

// Field set mirrors lib/driver-mobiles/fields.ts EDITABLE — a field added here
// must be whitelisted there too, or the API silently drops it on save.
interface FormValues {
  driver_staff_id: string;
  brand: string;
  model: string;
  color: string;
  imei: string;
  status: 'assigned' | 'returned' | 'damaged' | 'lost';
  supplied_date: string;
  sim_number: string;
  phone_number: string;
  network_provider: string;
  purchase_date: string;
  purchase_cost: string;
  supplier_name: string;
  invoice_number: string;
  warranty_expiry: string;
  condition: '' | 'new' | 'used' | 'refurbished';
  storage_capacity: string;
  serial_number: string;
  accessories: string;
  notes: string;
}

const EMPTY: FormValues = {
  driver_staff_id: '', brand: '', model: '', color: '', imei: '', status: 'assigned',
  supplied_date: '', sim_number: '', phone_number: '', network_provider: '',
  purchase_date: '', purchase_cost: '', supplier_name: '', invoice_number: '', warranty_expiry: '',
  condition: '', storage_capacity: '', serial_number: '', accessories: '', notes: '',
};

interface DriverMobileFormProps {
  mode: 'create' | 'edit';
  driverMobileId?: string;
  initial?: Partial<FormValues>;
}

export function DriverMobileForm({ mode, driverMobileId, initial }: DriverMobileFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const { data: drivers = [] } = useQuery({ queryKey: ['driver-options'], queryFn: fetchDriverOptions });

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!form.driver_staff_id) next.driver_staff_id = 'Select a driver';
    if (!form.brand.trim()) next.brand = 'Brand is required';
    if (!form.model.trim()) next.model = 'Model is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        driver_staff_id: form.driver_staff_id,
        brand: form.brand.trim(),
        model: form.model.trim(),
        color: form.color.trim() || null,
        imei: form.imei.trim() || null,
        status: form.status,
        supplied_date: form.supplied_date || null,
        sim_number: form.sim_number.trim() || null,
        phone_number: form.phone_number.trim() || null,
        network_provider: form.network_provider.trim() || null,
        purchase_date: form.purchase_date || null,
        purchase_cost: form.purchase_cost || null,
        supplier_name: form.supplier_name.trim() || null,
        invoice_number: form.invoice_number.trim() || null,
        warranty_expiry: form.warranty_expiry || null,
        condition: form.condition || null,
        storage_capacity: form.storage_capacity.trim() || null,
        serial_number: form.serial_number.trim() || null,
        accessories: form.accessories.trim() || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch('/api/admin/driver-mobiles', {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(mode === 'create' ? payload : { ...payload, id: driverMobileId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      toast.success(mode === 'create' ? 'Driver mobile added' : 'Driver mobile updated');
      router.push(mode === 'create' ? '/driver-mobiles' : `/driver-mobiles/${driverMobileId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelHref = mode === 'create' ? '/driver-mobiles' : `/driver-mobiles/${driverMobileId}`;
  const err = (k: keyof FormValues) => errors[k];

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Supply */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Supply</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Driver *</label>
            <select
              value={form.driver_staff_id}
              onChange={(e) => set('driver_staff_id', e.target.value)}
              className={`input ${err('driver_staff_id') ? 'border-red-500' : ''}`}
              disabled={saving}
            >
              <option value="">Select a driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.phone ? ` — ${d.phone}` : ''}</option>
              ))}
            </select>
            {err('driver_staff_id') && <p className="mt-1 text-xs text-red-500">{err('driver_staff_id')}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value as FormValues['status'])} className="input" disabled={saving}>
              <option value="assigned">Assigned</option>
              <option value="returned">Returned</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Supplied date</label>
            <input type="date" value={form.supplied_date} onChange={(e) => set('supplied_date', e.target.value)} className="input" disabled={saving} />
          </div>
        </div>
      </div>

      {/* Device details */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Device details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Brand *</label>
            <input value={form.brand} onChange={(e) => set('brand', e.target.value)} className={`input ${err('brand') ? 'border-red-500' : ''}`} placeholder="Samsung" disabled={saving} />
            {err('brand') && <p className="mt-1 text-xs text-red-500">{err('brand')}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Model *</label>
            <input value={form.model} onChange={(e) => set('model', e.target.value)} className={`input ${err('model') ? 'border-red-500' : ''}`} placeholder="Galaxy A15" disabled={saving} />
            {err('model') && <p className="mt-1 text-xs text-red-500">{err('model')}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Color</label>
            <input value={form.color} onChange={(e) => set('color', e.target.value)} className="input" placeholder="Black" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">IMEI</label>
            <input value={form.imei} onChange={(e) => set('imei', e.target.value)} className="input" placeholder="15-digit IMEI" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Condition</label>
            <select value={form.condition} onChange={(e) => set('condition', e.target.value as FormValues['condition'])} className="input" disabled={saving}>
              <option value="">—</option>
              <option value="new">New</option>
              <option value="used">Used</option>
              <option value="refurbished">Refurbished</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Storage</label>
            <input value={form.storage_capacity} onChange={(e) => set('storage_capacity', e.target.value)} className="input" placeholder="128GB" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Serial number</label>
            <input value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Accessories</label>
            <input value={form.accessories} onChange={(e) => set('accessories', e.target.value)} className="input" placeholder="Charger, case" disabled={saving} />
          </div>
        </div>
      </div>

      {/* SIM & number */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">SIM &amp; number</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Phone number</label>
            <input value={form.phone_number} onChange={(e) => set('phone_number', e.target.value)} className="input" placeholder="+91…" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">SIM number</label>
            <input value={form.sim_number} onChange={(e) => set('sim_number', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Network provider</label>
            <input value={form.network_provider} onChange={(e) => set('network_provider', e.target.value)} className="input" placeholder="Airtel / Jio / BSNL" disabled={saving} />
          </div>
        </div>
      </div>

      {/* Procurement */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Procurement</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Purchase date</label>
            <input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Purchase cost</label>
            <input type="number" step="0.01" min="0" value={form.purchase_cost} onChange={(e) => set('purchase_cost', e.target.value)} className="input" placeholder="12999" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Warranty expiry</label>
            <input type="date" value={form.warranty_expiry} onChange={(e) => set('warranty_expiry', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Supplier</label>
            <input value={form.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} className="input" disabled={saving} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Invoice number</label>
            <input value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} className="input" disabled={saving} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Notes</h3>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="input min-h-[80px]" placeholder="Any extra details…" disabled={saving} />
      </div>

      <div className="flex justify-end gap-3">
        <Link href={cancelHref} className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
          Cancel
        </Link>
        <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === 'create' ? 'Add Mobile' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Write the create wrapper**

Create `app/(admin)/driver-mobiles/new/page.tsx`:

```tsx
'use client';

import { DetailPageHeader } from '@/components/ui/detail-view';
import { DriverMobileForm } from '../driver-mobile-form';

export default function NewDriverMobilePage() {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Driver Mobiles', href: '/driver-mobiles' },
          { label: 'Add Mobile' },
        ]}
        backHref="/driver-mobiles"
        title="Add Driver Mobile"
        subtitle="Record a phone supplied to a driver"
      />
      <DriverMobileForm mode="create" />
    </div>
  );
}
```

- [ ] **Step 4: Write the edit wrapper**

Create `app/(admin)/driver-mobiles/[id]/edit/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { fetchDriverMobile } from '../../driver-mobile-api';
import { DriverMobileForm } from '../../driver-mobile-form';

export default function EditDriverMobilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15/16: params is a Promise
  const { data: m, isLoading, isError } = useQuery({
    queryKey: ['driver-mobile', id],
    queryFn: () => fetchDriverMobile(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader
          crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Driver Mobiles', href: '/driver-mobiles' }, { label: 'Edit' }]}
          backHref="/driver-mobiles"
          title="Loading…"
          subtitle="Fetching mobile"
        />
        <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !m) {
    return (
      <div className="space-y-6">
        <DetailPageHeader
          crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Driver Mobiles', href: '/driver-mobiles' }, { label: 'Not found' }]}
          backHref="/driver-mobiles"
          title="Driver mobile not found"
          subtitle="It may have been deleted"
        />
        <Link href="/driver-mobiles" className="text-sm font-medium text-green-600 hover:underline">Back to driver mobiles</Link>
      </div>
    );
  }

  const d = (s?: string | null) => (s ? String(s).split('T')[0] : '');

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Driver Mobiles', href: '/driver-mobiles' },
          { label: `${m.brand} ${m.model}`, href: `/driver-mobiles/${m.id}` },
          { label: 'Edit' },
        ]}
        backHref={`/driver-mobiles/${m.id}`}
        title={`Edit ${m.brand} ${m.model}`}
        subtitle="Update mobile details"
      />
      <DriverMobileForm
        mode="edit"
        driverMobileId={m.id}
        initial={{
          driver_staff_id: m.driver_staff_id ?? '',
          brand: m.brand ?? '',
          model: m.model ?? '',
          color: m.color ?? '',
          imei: m.imei ?? '',
          status: m.status,
          supplied_date: d(m.supplied_date),
          sim_number: m.sim_number ?? '',
          phone_number: m.phone_number ?? '',
          network_provider: m.network_provider ?? '',
          purchase_date: d(m.purchase_date),
          purchase_cost: m.purchase_cost != null ? String(m.purchase_cost) : '',
          supplier_name: m.supplier_name ?? '',
          invoice_number: m.invoice_number ?? '',
          warranty_expiry: d(m.warranty_expiry),
          condition: m.condition ?? '',
          storage_capacity: m.storage_capacity ?? '',
          serial_number: m.serial_number ?? '',
          accessories: m.accessories ?? '',
          notes: m.notes ?? '',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "driver-mobiles" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/driver-mobiles/driver-mobile-api.ts" "app/(admin)/driver-mobiles/driver-mobile-form.tsx" "app/(admin)/driver-mobiles/new/page.tsx" "app/(admin)/driver-mobiles/[id]/edit/page.tsx"
git commit -m "feat(driver-mobiles): create/edit form + driver picker + fetchers"
```

---

## Task 6: Detail page

**Files:**
- Create: `app/(admin)/driver-mobiles/[id]/page.tsx`

**Interfaces:**
- Consumes: `fetchDriverMobile` (Task 5); `statusBadge` (Task 4); shared `DetailPageHeader`, `SectionCard`, `Field`.

- [ ] **Step 1: Write the detail page**

Create `app/(admin)/driver-mobiles/[id]/page.tsx`:

```tsx
'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { fetchDriverMobile } from '../driver-mobile-api';
import { statusBadge } from '../columns';

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Driver Mobiles', href: '/driver-mobiles' },
  { label: name },
];

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTs = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : '—');
const money = (n: number | null | undefined) => (n != null ? `₹ ${Number(n).toLocaleString('en-IN')}` : '—');
const or = (s: string | null | undefined) => (s && String(s).trim() ? s : '—');

export default function DriverMobileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15/16: params is a Promise
  const { data: m, isLoading, isError } = useQuery({
    queryKey: ['driver-mobile', id],
    queryFn: () => fetchDriverMobile(id),
  });

  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setCanManage(['super_admin', 'transport_manager'].includes(JSON.parse(u).role));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/driver-mobiles" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !m) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/driver-mobiles" title="Driver mobile not found" />
        <p className="text-gray-600">
          This mobile could not be loaded.{' '}
          <Link href="/driver-mobiles" className="text-green-600 hover:underline">Back to driver mobiles</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(`${m.brand} ${m.model}`)}
        backHref="/driver-mobiles"
        title={`${m.brand} ${m.model}`}
        subtitle="Driver mobile"
        actions={
          canManage ? (
            <Link
              href={`/driver-mobiles/${m.id}/edit`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : null
        }
      />

      <SectionCard title="Supply">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Driver" value={or(m.driver_name)} />
          <Field label="Driver phone" value={or(m.driver_phone)} />
          <Field label="Status" value={statusBadge(m.status)} />
          <Field label="Supplied date" value={fmtDate(m.supplied_date)} />
        </div>
      </SectionCard>

      <SectionCard title="Device">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Brand" value={or(m.brand)} />
          <Field label="Model" value={or(m.model)} />
          <Field label="Color" value={or(m.color)} />
          <Field label="IMEI" value={or(m.imei)} />
          <Field label="Condition" value={or(m.condition)} />
          <Field label="Storage" value={or(m.storage_capacity)} />
          <Field label="Serial number" value={or(m.serial_number)} />
          <Field label="Accessories" value={or(m.accessories)} />
        </div>
      </SectionCard>

      <SectionCard title="SIM & number">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Phone number" value={or(m.phone_number)} />
          <Field label="SIM number" value={or(m.sim_number)} />
          <Field label="Network provider" value={or(m.network_provider)} />
        </div>
      </SectionCard>

      <SectionCard title="Procurement">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Purchase date" value={fmtDate(m.purchase_date)} />
          <Field label="Purchase cost" value={money(m.purchase_cost)} />
          <Field label="Warranty expiry" value={fmtDate(m.warranty_expiry)} />
          <Field label="Supplier" value={or(m.supplier_name)} />
          <Field label="Invoice number" value={or(m.invoice_number)} />
        </div>
      </SectionCard>

      <SectionCard title="Notes & record">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Notes" value={or(m.notes)} />
          <Field label="Created" value={fmtTs(m.created_at)} />
          <Field label="Updated" value={fmtTs(m.updated_at)} />
        </div>
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "driver-mobiles" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/driver-mobiles/[id]/page.tsx"
git commit -m "feat(driver-mobiles): read-only detail page"
```

---

## Task 7: Wire nav + activity-log module

**Files:**
- Modify: `lib/activity/log.ts:18` (the `ActivityModule` union)
- Modify: `app/(admin)/activity-log/columns.tsx:63` (the `MODULE_LABEL` map)
- Modify: `lib/navigation.ts` (icon import + nav item)

**Interfaces:**
- Consumes: `TMS_PERMISSIONS.DRIVER_MOBILES_VIEW` (Task 1). Makes the module reachable and its audit entries labelled.

- [ ] **Step 1: Extend the ActivityModule union**

In `lib/activity/log.ts`, change the `ActivityModule` type (line ~15-18) to add `'driver-mobiles'`:

```ts
export type ActivityModule =
  | 'drivers' | 'vehicles' | 'routes' | 'route-optimization' | 'gps-devices'
  | 'passengers' | 'staff-route-assignments' | 'boarding' | 'enrollment'
  | 'grievances' | 'settings' | 'transport-years' | 'fees' | 'notifications'
  | 'driver-mobiles';
```

- [ ] **Step 2: Add the activity-log module label**

In `app/(admin)/activity-log/columns.tsx`, add to the `MODULE_LABEL` object (after the `'notifications': 'Notifications',` line):

```ts
  'driver-mobiles': 'Driver Mobiles',
```

- [ ] **Step 3: Add the nav item**

In `lib/navigation.ts`, add `Smartphone` to the lucide-react import block (line 1-24), e.g. after `Navigation,`:

```ts
  Smartphone,
```

Then add this nav item to the `allNavigation` array, immediately after the `GPS Devices` line (line 55):

```ts
  { name: 'Driver Mobiles', href: '/driver-mobiles', icon: Smartphone, permission: TMS_PERMISSIONS.DRIVER_MOBILES_VIEW, group: 'transport' },
```

- [ ] **Step 4: Typecheck the changed files**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "navigation|activity" || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Probe the page route on the dev server**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/driver-mobiles`
Expected: `307` (redirect to `/auth/login` — the page exists and the proxy redirects unauthenticated page requests). A `404` would mean the route didn't compile.

- [ ] **Step 6: Commit**

```bash
git add lib/activity/log.ts "app/(admin)/activity-log/columns.tsx" lib/navigation.ts
git commit -m "feat(driver-mobiles): sidebar nav entry + activity-log module"
```

---

## Final verification (after all tasks)

- [ ] Run the full unit suite: `npx vitest run lib/driver-mobiles/fields.test.ts` → PASS.
- [ ] Typecheck the whole module: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "driver-mobiles" || echo "clean"` → `clean`.
- [ ] Manual smoke test (needs the user's authenticated browser — agent Chrome is unauthenticated): as an admin, open **Driver Mobiles** in the sidebar → **Add Mobile** → pick a driver, fill brand/model → Save → confirm it appears in the list → open detail → Edit → change status to `returned` → Save → confirm the badge updates → Delete → confirm removal → check **Activity Log** shows the create/update/delete entries under the "Driver Mobiles" module.

## Spec coverage self-check

- Table `tms_driver_mobile` + all 4 field groups + audit → Task 1 ✅
- `assigned/returned/damaged/lost` status, driver required → Task 1 (CHECK + NOT NULL FK) ✅
- Dedicated permissions `tms.driver_mobiles.{view,create,edit,delete}` seeded + granted → Task 1 ✅
- `withAuth` + `requirePerm` API (list/create/edit/delete + single) → Task 3 ✅
- Field whitelist / `buildDriverMobilePayload` + tests → Task 2 ✅
- List (DataTable), form (create/edit), detail pages → Tasks 4, 5, 6 ✅
- Sidebar nav under TRANSPORT + activity-log audit → Task 7 ✅
- Out of scope (no driver-portal, no history table, no import/export, no photos) → not built ✅
- Refinement vs spec: FK is `driver_staff_id → tms_driver(staff_id)` (matches `tms_vehicle` convention; the drivers picker returns staff ids), and driver names are resolved fresh at read time rather than stored — documented in Task 1 & Task 3.
