# Field mapper + single-resource route templates

Two templates referenced from SKILL.md. Adapt the field groups to your table's
real columns.

## Table of contents
- [`lib/<entity>/fields.ts` — the write whitelist](#fields)
- [`app/api/admin/<entity>/[id]/route.ts` — single record](#single)

---

<a name="fields"></a>
## `lib/<entity>/fields.ts`

The single source of truth for the columns the API may write. Group every
writable column by its type, build the `EDITABLE` whitelist from those groups,
and normalise the request body in `buildWidgetPayload`. **Only keys present in
the body are emitted**, so the same function powers a full create and a partial
`PUT`. The form skill (Skill 2) imports these same groups to render inputs, so
keep this file authoritative.

```ts
// lib/widgets/fields.ts
// Single source of truth for tms_widget writable fields + payload normalisation.
// Used by the widgets API (route.ts) so create/update share one code path, and
// by the create/edit form so the UI and the API agree on the field set.

// enum columns: value must be one of the allowed strings (else null).
export const ENUM_FIELDS: Record<string, readonly string[]> = {
  status: ['active', 'inactive', 'archived'],
  category: ['standard', 'premium'],
};

export const INT_FIELDS = ['capacity', 'sort_order'] as const;      // parseInt
export const NUM_FIELDS = ['price', 'weight'] as const;             // parseFloat
export const DATE_FIELDS = ['effective_date', 'expiry_date'] as const; // 'YYYY-MM-DD' or null
export const BOOL_FIELDS = ['is_featured'] as const;                // coerced to boolean
export const UUID_FIELDS = ['owner_id'] as const;                   // string or null
export const TEXT_FIELDS = ['name', 'code', 'description', 'remarks'] as const; // trimmed or null

// Every column the API will write (whitelist). Audit columns (created_by,
// updated_by) and the primary key are set by the route, NOT listed here.
export const EDITABLE: readonly string[] = [
  ...Object.keys(ENUM_FIELDS), ...INT_FIELDS, ...NUM_FIELDS, ...DATE_FIELDS,
  ...BOOL_FIELDS, ...UUID_FIELDS, ...TEXT_FIELDS,
];

// Normalise a snake_case request body into a typed tms_widget payload.
// Only keys present in the body are included (so PUT can do partial updates).
export function buildWidgetPayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => k in body;

  for (const k of TEXT_FIELDS) if (has(k)) out[k] = (body[k] as string)?.toString().trim() || null;
  for (const k of Object.keys(ENUM_FIELDS)) {
    if (!has(k)) continue;
    const v = (body[k] as string)?.toString().trim().toLowerCase();
    out[k] = v && ENUM_FIELDS[k].includes(v) ? v : null;
  }
  for (const k of INT_FIELDS) {
    if (!has(k)) continue;
    const n = parseInt(String(body[k]), 10);
    out[k] = Number.isFinite(n) ? n : null;
  }
  for (const k of NUM_FIELDS) {
    if (!has(k)) continue;
    const n = parseFloat(String(body[k]));
    out[k] = Number.isFinite(n) ? n : null;
  }
  for (const k of DATE_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of UUID_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of BOOL_FIELDS) if (has(k)) out[k] = !!body[k];

  // Give NOT-NULL columns a valid default on create rather than null.
  if (has('status') && out.status == null) out.status = 'active';
  if (has('capacity') && out.capacity == null) out.capacity = 0;

  return out;
}
```

### Rules
- **Audit + PK columns are never in `EDITABLE`.** The route sets `created_by`/
  `updated_by` from `auth.userId`; the DB sets `id`/`created_at`. Listing them
  here would let a caller overwrite them.
- **Enums are validated, not trusted.** An unknown enum value becomes `null` (or
  a default) instead of reaching the DB and causing a 500.
- **NOT-NULL columns get a default** in the tail of the function so create
  doesn't fail when the form omits them.
- Keep the groups in sync with the migration. When you add a column, add it to a
  group here and it automatically flows into create, update, and (via Skill 2)
  the form.

---

<a name="single"></a>
## `app/api/admin/<entity>/[id]/route.ts`

Serves one record so a detail/edit page survives a deep-link or hard refresh.
Read-only; writes go through the collection route's permission-gated handlers.

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET one widget (full tms_widget row) by id. Backs the in-module widget
 * view/edit pages so they survive deep-link / hard refresh (the list endpoint
 * can't). Auth is enforced by proxy.ts; writes still go through the
 * permission-gated POST/PUT/DELETE on /api/admin/widgets.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // Next 15: params is a Promise
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Widget id is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: widget, error } = await supabase
      .from('tms_widget')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
      }
      console.error('Widget detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch widget' }, { status: 500 });
    }
    if (!widget) {
      return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: widget });
  } catch (e) {
    console.error('Widget detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

> The dynamic segment folder name (`[id]`, `[widgetId]`, `[vehicleId]`) just has
> to match the key you destructure from `params`. Existing modules use the
> entity-specific name (`[vehicleId]`); either is fine as long as they agree.
