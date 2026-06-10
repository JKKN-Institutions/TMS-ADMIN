---
name: admin-detail-page
description: >-
  Build a TMS-ADMIN read-only detail/view page for an admin entity — the
  [id]/page.tsx that loads one record with React Query and renders it as titled
  SectionCards of label/value Fields, with breadcrumbs and a permission-gated
  Edit button via DetailPageHeader. Use this skill whenever building or updating
  ANY admin record/profile/detail view: when the user says "create the detail
  page", "add a view page", "show the full <entity>", "build the <entity> profile
  page", "make the [id] page", "read-only view of a record", "page you land on
  when you click a row", or scaffolds a module that needs a per-record page.
  Produces app/(admin)/<entity>/[id]/page.tsx using the shared DetailPageHeader /
  SectionCard / Field components, the loading + not-found states, and the same
  <entity>-api.ts fetcher + React Query key the edit page uses. Pairs with
  advanced-data-table (the row's name/View links here), admin-form (the Edit
  button links to the edit form), and admin-api-route (the [id] GET it reads).
---

# TMS Admin Detail / View Page

The read-only page you land on when you click a row's name or its "View" action.
It loads one record and lays it out as titled sections of label/value pairs, with
an Edit button for users who can manage the entity. One file:
`app/(admin)/<entity>/[id]/page.tsx`.

## Prerequisites

- The **single-resource GET exists** (`admin-api-route` skill):
  `/api/admin/<entity>/<id>` returns `{ success, data }`.
- A **client fetcher** `app/(admin)/<entity>/<entity>-api.ts` exporting
  `fetch<Entity>(id)`. This is the *same file the edit page uses* — if the
  `admin-form` skill already made it, reuse it; otherwise create it (see that
  skill's template).
- Shared building blocks already exist in `@/components/ui/detail-view`:
  - `DetailPageHeader` — `{ crumbs, backHref, title, subtitle?, actions? }`
  - `SectionCard` — `{ title, action?, children }` (bordered white card)
  - `Field` — `{ label, value }` (renders `—` automatically when value is empty)
- `@tanstack/react-query` is set up.

## The shared building blocks

- **`DetailPageHeader`** renders the breadcrumb trail, an optional back arrow, the
  title/subtitle, and a right-aligned `actions` slot. Put the Edit button there.
- **`SectionCard`** is a titled white card; group related fields into one. Its
  `action` slot can hold a section-level button.
- **`Field`** is a label-over-value pair. **It already shows `—` for
  null/undefined/empty** — so just pass the raw value; don't pre-format empties.
  Wrap the *value* (not the label) when you need special rendering: `font-mono`
  for codes/IDs, `capitalize` for enums, a date formatter for timestamps, a badge
  component for statuses.

## The page

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { fetchWidget } from '../widget-api';

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Widgets', href: '/widgets' },
  { label: name },
];

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : '—');

export default function WidgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15: params is a Promise
  // Same query key as the edit page → React Query serves it from cache on nav.
  const { data: widget, isLoading, isError } = useQuery({
    queryKey: ['widget', id],
    queryFn: () => fetchWidget(id),
  });

  // Permission to show the Edit button — see "Role gating" below.
  const canManage = true; // replace with the module's real check

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/widgets" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !widget) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/widgets" title="Widget not found" />
        <p className="text-gray-600">
          This widget could not be loaded.{' '}
          <Link href="/widgets" className="text-green-600 hover:underline">Back to widgets</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(widget.name)}
        backHref="/widgets"
        title={widget.name}
        subtitle={widget.code || 'Widget'}
        actions={
          canManage ? (
            <Link
              href={`/widgets/${widget.id}/edit`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : null
        }
      />

      <SectionCard title="Widget">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Code" value={<span className="font-mono">{widget.code}</span>} />
          <Field label="Name" value={widget.name} />
          <Field label="Category" value={<span className="capitalize">{widget.category || '—'}</span>} />
          <Field label="Status" value={<span className="capitalize">{widget.status || '—'}</span>} />
          <Field label="Description" value={widget.description} />
        </div>
      </SectionCard>

      <SectionCard title="Record">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Created" value={fmt(widget.created_at)} />
          <Field label="Updated" value={fmt(widget.updated_at)} />
        </div>
      </SectionCard>
    </div>
  );
}
```

## Layout conventions

- Group fields into a few `SectionCard`s by theme (identity, operational,
  audit/timestamps) rather than one giant list — it mirrors how the form is
  sectioned and reads far better than 30 fields in a row.
- Inside a card, use `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` so
  fields flow responsively.
- Reuse the module's badge components (from `columns.tsx`) for statuses so the
  detail page and the table show the same chip.

## Role gating

The Edit button should only show for users who can manage the entity. Two
patterns exist in this app — match the module:

- **A module role hook** (e.g. `useGpsRole()` → `{ canManage }`) — preferred when
  the module already has one.
- **`adminUser` from localStorage** — the legacy/list-page approach:
  ```ts
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setCanManage(['super_admin', 'transport_manager'].includes(JSON.parse(u).role));
  }, []);
  ```

## Gotchas

- **`params` is a Promise** in Next 15 — `const { id } = use(params)`.
- **Don't pre-format empty values** — `Field` renders `—` for null/undefined/''.
  Passing `value={x || '—'}` is redundant; passing `value={x}` is enough.
- **Share the React Query key with the edit page** (`['widget', id]`). Same key =
  the record is already in cache when the user clicks Edit, so no refetch flash.
- **The fetcher may need more columns than the table row type.** `columns.tsx`'s
  row type is the list shape; if the detail page shows columns the list omits,
  widen that type (or use a fuller detail type) so `widget.x` type-checks.
- **Keep it read-only.** Mutations belong in the form/API; this page only reads.
