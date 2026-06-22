---
name: admin-form
description: >-
  Build a TMS-ADMIN create/edit form for an admin entity — a shared
  <entity>-form.tsx (mode='create'|'edit') with controlled inputs, per-field
  validation, toast feedback and router redirect, plus its new/page.tsx and
  [id]/edit/page.tsx wrappers and a small <entity>-api.ts fetcher. Use this skill
  whenever building or updating ANY admin add/edit screen: when the user says
  "create the form", "add a create/edit page", "build the new <entity> page",
  "make the edit form", "add an Add <entity> screen", "form to create/update
  <entity>", "in-module form", or scaffolds a module that needs add/edit pages.
  Produces the shared form component, the create + edit route wrappers (with
  breadcrumbs via DetailPageHeader and React Query loading of the edited record),
  and the client fetcher. Posts/puts to the module's /api/admin/<entity> route
  and keeps its field set aligned with lib/<entity>/fields.ts. Pairs with the
  admin-api-route skill (build the API first) and reuses the row type from
  the module's columns.tsx.
---

# TMS Admin Create/Edit Form

The in-module form pattern: **one shared component** drives both the Add and Edit
pages by branching on a `mode` prop, so create and edit never drift apart.
Three+1 files:

| File | Role |
|------|------|
| `app/(admin)/<entity>/<entity>-form.tsx` | the shared form (`mode='create'\|'edit'`) |
| `app/(admin)/<entity>/new/page.tsx` | Add page — header + `<Form mode="create" />` |
| `app/(admin)/<entity>/[id]/edit/page.tsx` | Edit page — loads the record, then `<Form mode="edit" initial=… />` |
| `app/(admin)/<entity>/<entity>-api.ts` | tiny client fetcher for the edit page (reuse if it exists) |

## Prerequisites

- The **API route exists** (`admin-api-route` skill): the form POSTs to
  `/api/admin/<entity>` and PUTs with the id in the body, and the edit page GETs
  `/api/admin/<entity>/<id>`. Build the API first.
- `lib/<entity>/fields.ts` is the **field contract** — the form's inputs should
  map onto the columns in its `EDITABLE` whitelist. If you add a field to the
  form, add it to `fields.ts` too, or the API will silently drop it.
- Reuse the row type from the module's `columns.tsx` (`WidgetRow`) for the
  fetcher and `initial` values so the form and table agree on shape.
- `DetailPageHeader` from `@/components/ui/detail-view` and `@tanstack/react-query`
  already exist in this project.

---

## Step 1 — The shared form component

Full annotated template: **`references/form-template.md`**. Build it from these
parts; the anatomy matters more than any one field.

**State & helpers.** Hold a flat `FormValues`. String-typed columns (text, enum,
int, num, date) stay **strings** in state and coerce at submit; **bool columns
are real booleans**. Initialise each field from `initial?.x ?? default`. Keep an
`errors` map and a `saving` flag. Make the `set(key, value)` helper **generic over
the value type** (`<K extends keyof FormValues>(key: K, value: FormValues[K])`) so
one helper updates both a text field and a checkbox, and clears the field's error
as the user types.

**One input recipe per column type.** `lib/<entity>/fields.ts` groups columns by
type, and `references/form-template.md` has a matching input + submit-coercion for
each: text, enum (`<select>`), int/num (`type="number"` → `Number()` or `null`),
date (`type="date"`, seeded with `String(d).split('T')[0]`, submitted as
`value || null`), and bool (green `type="checkbox"`). **Copy these from the recipe
table — don't re-derive date/number/checkbox handling per field.**

**Validation.** A `validate()` returns a boolean and fills `errors`. Validate
**create-only fields only in create mode** (e.g. an immutable identity field that
becomes read-only on edit). Show the message under the field in red; otherwise
show a gray hint.

**Submit.** `preventDefault` → `validate()` → `saving=true` → build a snake_case
payload (`.trim() || null`, mode-specific keys) → `fetch`:

```ts
const res = await fetch(
  mode === 'create' ? '/api/admin/widgets' : '/api/admin/widgets',
  {
    method: mode === 'create' ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify(mode === 'create' ? payload : { ...payload, id: widgetId }),
  }
);
const json = await res.json();
if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
toast.success(mode === 'create' ? 'Widget added' : 'Widget updated');
router.push(mode === 'create' ? '/widgets' : `/widgets/${widgetId}`);
router.refresh();
```

> The PUT sends `{ ...payload, id }` to the collection route (matching the
> `admin-api-route` PUT, which reads `body.id`). Some modules instead PUT to
> `/api/admin/<entity>/<id>` — only do that if the single-resource route
> implements PUT. Pick one and keep the form and API consistent.

Wrap the whole thing in `try/catch/finally`: `toast.error(err.message)` on
failure, `setSaving(false)` in `finally`.

**Mode-aware fields.** This is the point of one shared component:
- An immutable identity/hardware field (a code, a registration number) is an
  editable input on **create** and a read-only display on **edit**.
- Operational fields the API defaults (e.g. `status`) can be hidden on **create**
  and only shown on **edit**.

**Layout.** Group fields into sectioned cards and a responsive grid:

```tsx
<form onSubmit={onSubmit} className="space-y-6">
  <div className="rounded-xl border border-gray-200 bg-white p-5">
    <h3 className="mb-4 text-sm font-semibold text-gray-900">Section title</h3>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Field *</label>
        <input
          value={form.field}
          onChange={(e) => set('field', e.target.value)}
          className={`input ${errors.field ? 'border-red-500' : ''}`}
          disabled={saving}
        />
        {errors.field ? <p className="mt-1 text-xs text-red-500">{errors.field}</p>
                      : <p className="mt-1 text-xs text-gray-500">Helper text</p>}
      </div>
    </div>
  </div>

  <div className="flex justify-end gap-3">
    <Link href={cancelHref} className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">Cancel</Link>
    <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60">
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {mode === 'create' ? 'Add Widget' : 'Save Changes'}
    </button>
  </div>
</form>
```

Use the project `.input` class on every input/select/textarea, `border-red-500`
for the error state, green submit, gray Cancel. `cancelHref` is the list on
create, the detail page on edit.

## Step 2 — The Add page (`new/page.tsx`)

Thin wrapper: breadcrumb header + the form in create mode.

```tsx
'use client';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { WidgetForm } from '../widget-form';

export default function NewWidgetPage() {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Widgets', href: '/widgets' },
          { label: 'Add Widget' },
        ]}
        backHref="/widgets"
        title="Add Widget"
        subtitle="Register a new widget"
      />
      <WidgetForm mode="create" />
    </div>
  );
}
```

## Step 3 — The Edit page (`[id]/edit/page.tsx`)

Unwrap the params Promise with `use()`, load the record with React Query, handle
loading/not-found, then render the form in edit mode seeded with `initial`.

```tsx
'use client';
import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { fetchWidget } from '../../widget-api';
import { WidgetForm } from '../../widget-form';

export default function EditWidgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15: params is a Promise
  const { data: widget, isLoading, isError } = useQuery({
    queryKey: ['widget', id],
    queryFn: () => fetchWidget(id),
  });

  if (isLoading) { /* DetailPageHeader title="Loading…" + a pulse skeleton card */ }
  if (isError || !widget) { /* DetailPageHeader "not found" + a back link */ }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Widgets', href: '/widgets' },
          { label: widget.name, href: `/widgets/${widget.id}` },
          { label: 'Edit' },
        ]}
        backHref={`/widgets/${widget.id}`}
        title={`Edit ${widget.name}`}
        subtitle="Update widget details"
      />
      <WidgetForm
        mode="edit"
        widgetId={widget.id}
        initial={{ name: widget.name, status: widget.status ?? 'active' /* …map every field, null → '' */ }}
      />
    </div>
  );
}
```

## Step 4 — The client fetcher (`<entity>-api.ts`)

```ts
import type { WidgetRow } from './columns';

export async function fetchWidget(id: string): Promise<WidgetRow> {
  const res = await fetch(`/api/admin/widgets/${id}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load widget');
  return json.data as WidgetRow;
}
```

---

## Gotchas

- **`params` is a Promise** in Next 15 — `const { id } = use(params)` in the edit
  page (client component). Don't destructure it directly.
- **Map `null → ''` in `initial`.** Controlled inputs choke on `null`/`undefined`;
  coerce nullable columns to `''` (or the right default) when seeding the form.
- **Keep the form fields ⊆ `fields.ts` `EDITABLE`.** A field the API doesn't
  whitelist is silently dropped on save — the user edits it, nothing persists.
- **`router.refresh()` after `router.push`** so the list/detail re-fetches and
  shows the change (the data is client-fetched, not statically cached).
- **Convert types at submit, validate before.** Inputs are strings; the API's
  `buildXPayload` will coerce, but still send `null` for empty optionals and
  `.trim()` text so you don't store `"  "`.
- **One component, two modes** — resist making separate add/edit components. The
  divergence (read-only identity on edit, hidden defaults on create) is small and
  belongs in `mode` branches.
