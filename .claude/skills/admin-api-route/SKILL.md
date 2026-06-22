---
name: admin-api-route
description: >-
  Build a TMS-ADMIN modern admin API route — a Next.js route.ts that uses
  withAuth + AuthContext, createServiceRoleClient, and
  requirePerm('tms.<entity>.<action>') permission checks against tms_ tables,
  with GET/POST/PUT/DELETE handlers returning the project's { success, data,
  message } / { error } JSON shape, backed by a lib/<entity>/fields.ts write
  whitelist. Use this skill whenever creating or changing ANY admin backend
  endpoint: when the user says "add an API route", "create the
  backend/endpoint/API for <entity>", "build the CRUD route", "add
  POST/PUT/DELETE for <entity>", "make route.ts", "wire up the API", "add a
  permission check", or builds a new admin module that needs server endpoints.
  Follows the MODERN withAuth + service-role + requirePerm pattern (NOT the
  legacy DatabaseService routes), so new routes get real permission checks
  instead of repeating the project's authorization gap. Covers the collection
  route, the [id] single-resource route, the field-mapper whitelist, audit
  columns, and the 42P01 empty-table guard.
---

# TMS Admin API Route

The modern backend pattern for an admin entity. One collection route
(`app/api/admin/<entity>/route.ts`) handles list + create + update + delete; an
optional single-resource route (`app/api/admin/<entity>/[id]/route.ts`) serves
one record for deep-linkable detail/edit pages. Both read/write a `tms_` table
through a service-role client and return a consistent JSON envelope the frontend
already expects.

> **Which pattern am I in?** This app runs LEGACY (`DatabaseService` god-class,
> unprefixed tables, no permission checks) and MODERN side by side. New routes
> use the MODERN pattern below. Only match the legacy style if you're editing an
> existing legacy route and consistency demands it.

## The two-client model (read this first)

`withAuth` wraps every handler and gives it an `AuthContext`:

```ts
interface AuthContext {
  userId: string;
  userRole: string;
  isSuperAdmin: boolean;
  institutionId: string | null;
  supabase: ReturnType<typeof createServerClient>; // USER-SCOPED — RLS applies
}
```

- `auth.supabase` is **user-scoped**: row-level security is enforced. Use it when
  you want the database to constrain what this user can see.
- `createServiceRoleClient()` (imported inside the handler) **bypasses RLS
  entirely**. Admin list/create/update/delete usually need this to operate
  across institutions.

**Because the service-role client bypasses RLS, your `requirePerm()` check is the
only authorization guard on the operation.** Never skip it on a write. Leaving it
out is how this codebase accumulated ~90 routes that silently let any
authenticated user mutate anything — don't add to that pile.

---

## Step 1 — Confirm the table and permissions exist

- The `tms_<entity>` table must exist (apply the migration first — see the
  `supabase-expert` skill / Supabase MCP). The handlers tolerate a missing table
  via the `42P01` guard, but writes will fail until it's there.
- The permission strings you'll check (`tms.<entity>.create`, `.edit`,
  `.delete`, and `.view` if you gate reads) must be seeded wherever
  `user_has_permission` looks them up. If they're absent, **non-super-admins get
  403** even when they should pass — look at how an existing entity's
  `tms.vehicles.*` permissions are seeded and mirror it.

## Step 2 — Write the field mapper (`lib/<entity>/fields.ts`)

This is the **single source of truth for writable columns** — the API's write
whitelist, and the file the form skill will later read to build its inputs. It
groups columns by type, normalises a snake_case request body into a typed
payload, and only includes keys actually present so `PUT` can do partial
updates.

Full annotated template: **`references/field-mapper.md`**. The shape:

```ts
export const ENUM_FIELDS = { status: ['active', 'inactive'] } as const;
export const INT_FIELDS = ['capacity'] as const;
export const TEXT_FIELDS = ['name', 'remarks'] as const;
// ...NUM_FIELDS, DATE_FIELDS, BOOL_FIELDS, UUID_FIELDS as needed

export function buildWidgetPayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => k in body;
  for (const k of TEXT_FIELDS) if (has(k)) out[k] = (body[k] as string)?.toString().trim() || null;
  // enums lower-cased + validated against the allow-list, ints/nums parsed,
  // dates/uuids passed through or null, bools coerced — see the reference.
  return out;
}
```

Why a whitelist and not `...body`: it stops a caller from writing columns you
never intended (audit fields, foreign keys, computed columns), coerces types so
the DB doesn't reject the row, and centralises NOT-NULL defaults in one place.

## Step 3 — Write the collection route (`app/api/admin/<entity>/route.ts`)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildWidgetPayload } from '@/lib/widgets/fields';

// Super admins pass everything; everyone else is checked against the RPC.
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getWidgets() {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tms_widget')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      // 42P01 = table doesn't exist yet → return empty so the UI renders.
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Widgets query error:', error);
      return NextResponse.json({ error: 'Failed to fetch widgets' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [], count: data?.length ?? 0 });
  } catch (e) {
    console.error('Widgets API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postWidget(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.widgets.create'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const payload = buildWidgetPayload(body);
    if (!payload.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    // Optional uniqueness guard — return 409 instead of a 500 on the constraint.
    const { data: existing } = await supabase
      .from('tms_widget').select('id').eq('name', payload.name as string).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'A widget with this name already exists' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('tms_widget')
      .insert([{ ...payload, created_by: auth.userId, updated_by: auth.userId }])
      .select()
      .single();
    if (error) {
      console.error('Widget create error:', error);
      return NextResponse.json({ error: 'Failed to create widget' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data, message: 'Widget created successfully' });
  } catch (e) {
    console.error('Widget create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function putWidget(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.widgets.edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const id: string | undefined = body?.id || body?.widgetId;
    if (!id) return NextResponse.json({ error: 'Widget id is required' }, { status: 400 });

    const payload = buildWidgetPayload(body); // partial — only present keys
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tms_widget')
      .update({ ...payload, updated_by: auth.userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Widget update error:', error);
      return NextResponse.json({ error: 'Failed to update widget' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data, message: 'Widget updated successfully' });
  } catch (e) {
    console.error('Widget update error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function deleteWidget(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.widgets.delete'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id'); // DELETE id comes from the query string
    if (!id) return NextResponse.json({ error: 'Widget id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('tms_widget').delete().eq('id', id);
    if (error) {
      console.error('Widget delete error:', error);
      return NextResponse.json({ error: 'Failed to delete widget' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Widget deleted successfully' });
  } catch (e) {
    console.error('Widget delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getWidgets());
export const POST = withAuth((request, auth) => postWidget(request, auth));
export const PUT = withAuth((request, auth) => putWidget(request, auth));
export const DELETE = withAuth((request, auth) => deleteWidget(request, auth));
```

## Step 4 — (Optional) single-resource route for detail/edit pages

If the entity has an in-module detail or edit page, add
`app/api/admin/<entity>/[id]/route.ts` with a GET that fetches one row. The list
endpoint can't survive a deep-link or hard refresh on a detail page; this can.
See **`references/field-mapper.md`** for the full template — the essentials:

- In Next.js 15 the route params are a **Promise** — `const { id } = await params;`.
- `maybeSingle()` + treat `42P01` and a null row as `404`.
- This GET is read-only; writes still go through the permission-gated POST/PUT/
  DELETE on the collection route, so it relies on the proxy's auth gate rather
  than a `requirePerm` call.

---

## The response envelope (don't drift from it)

The frontend reads `result.success` and `result.data`, so every handler returns:

| Outcome | JSON | Status |
|---------|------|--------|
| OK (list) | `{ success: true, data: [...], count }` | 200 |
| OK (single / mutation) | `{ success: true, data, message }` | 200 |
| Validation failed | `{ error: '...' }` | 400 |
| Not permitted | `{ error: 'Forbidden' }` | 403 |
| Not found | `{ error: '...' }` | 404 |
| Conflict (duplicate) | `{ error: '...' }` | 409 |
| Server error | `{ error: 'Internal server error' }` | 500 |

Errors use the bare `{ error }` key (no `success: false`) — that's what the
existing `toast.error(result.error)` calls in pages expect.

## Gotchas

- **Skipping `requirePerm` on a write** = an unauthenticated-by-permission hole,
  because the service-role client ignores RLS. Every POST/PUT/DELETE checks first.
- **`params` is a Promise in Next 15.** `await params` in the `[id]` route, or you
  get `undefined`.
- **DELETE id is a query param** (`?id=...`), not the body — pages call
  `fetch('/api/admin/widgets?id=' + id, { method: 'DELETE' })`.
- **Always set `created_by` / `updated_by` = `auth.userId`** on insert/update; the
  `tms_` tables carry these audit columns.
- **`42P01` is "table absent"** — return empty (list) or 404 (single) so the UI
  doesn't 500 before the migration is applied.
- **Don't spread raw `body` into the DB.** Go through `buildXPayload` so only
  whitelisted, type-coerced columns are written.
