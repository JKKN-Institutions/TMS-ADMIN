# Form templates

Full copy-paste templates for the create/edit form trio. Adapt `widget` /
`Widget` / the field list to your entity. The form's fields should map onto the
columns in the module's `lib/<entity>/fields.ts` `EDITABLE` whitelist — that file
groups columns by type (`TEXT_FIELDS`, `ENUM_FIELDS`, `INT_FIELDS`,
`NUM_FIELDS`, `DATE_FIELDS`, `BOOL_FIELDS`), and there's a matching input recipe
for each below.

## Table of contents
- [Input recipe per column type](#recipes)
- [`<entity>-form.tsx` — the shared form](#form)
- [`<entity>-api.ts` — client fetcher](#api)
- [`new/page.tsx` — Add page](#new)
- [`[id]/edit/page.tsx` — Edit page (with loading/error)](#edit)

---

<a name="recipes"></a>
## Input recipe per column type

`FormValues` holds a flat shape. **String-typed columns stay strings in state**
(text, enum, int, num, date — coerce numbers/dates at submit); **bool columns are
real booleans**. Make the `set()` helper generic so it handles both:

```ts
const set = <K extends keyof WidgetFormValues>(key: K, value: WidgetFormValues[K]) => {
  setForm((f) => ({ ...f, [key]: value }));
  if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: '' }));
};
```

| `fields.ts` group | State type | Input | Submit value |
|---|---|---|---|
| `TEXT_FIELDS` | `string` | `<input className="input">` | `form.x.trim() || null` |
| `ENUM_FIELDS` | `string` | `<select className="input capitalize">` over the allowed values | `form.x` |
| `INT_FIELDS` / `NUM_FIELDS` | `string` | `<input type="number" className="input">` | `form.x === '' ? null : Number(form.x)` |
| `DATE_FIELDS` | `string` (`yyyy-mm-dd`) | `<input type="date" className="input">` | `form.x \|\| null` |
| `BOOL_FIELDS` | `boolean` | `<input type="checkbox">` (green) | `form.x` |

**Date** — `<input type="date">` only accepts `yyyy-mm-dd`, but the API may return
an ISO timestamp. Trim it when seeding `initial`:

```ts
const toDateInput = (d?: string | null) => (d ? String(d).split('T')[0] : '');
// in the form body:
<input type="date" value={form.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} className="input" disabled={saving} />
// at submit: effective_date: form.effectiveDate || null
```

**Boolean** — a checkbox styled to the brand green, paired with its label:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={form.isFeatured}
    onChange={(e) => set('isFeatured', e.target.checked)}
    disabled={saving}
    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
  />
  <span className="text-gray-700">Featured</span>
</label>
// at submit: is_featured: form.isFeatured   (already boolean)
// in initial: isFeatured: !!widget.is_featured   (null/undefined → false)
```

---

<a name="form"></a>
## `app/(admin)/widgets/widget-form.tsx`

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';

// Controlled inputs are strings; the one bool is a real boolean. Coerce at submit.
export interface WidgetFormValues {
  name: string;          // TEXT
  code: string;          // TEXT (immutable identifier)
  category: string;      // ENUM
  status: string;        // ENUM (edit-only)
  capacity: string;      // INT (string in state)
  effectiveDate: string; // DATE (yyyy-mm-dd)
  isFeatured: boolean;   // BOOL
  description: string;   // TEXT (textarea)
}

const CATEGORY_OPTIONS = ['standard', 'premium'];
const STATUS_OPTIONS = ['active', 'inactive', 'archived'];

type Mode = 'create' | 'edit';

// A date column may come back as an ISO timestamp; <input type="date"> needs yyyy-mm-dd.
const toDateInput = (d?: string | null) => (d ? String(d).split('T')[0] : '');

/**
 * Shared Widget form for the Add (create) and Edit (update) in-module pages.
 * `code` is editable only on create (immutable identifier); `status` is editable
 * only on edit (new widgets default server-side).
 */
export function WidgetForm({
  mode,
  widgetId,          // DB uuid — required in edit mode (the PUT target).
  initial,
}: {
  mode: Mode;
  widgetId?: string;
  initial?: Partial<WidgetFormValues>;
}) {
  const router = useRouter();
  const [form, setForm] = useState<WidgetFormValues>({
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    category: initial?.category ?? 'standard',
    status: initial?.status ?? 'active',
    capacity: initial?.capacity ?? '',
    effectiveDate: initial?.effectiveDate ?? '',
    isFeatured: initial?.isFeatured ?? false,
    description: initial?.description ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Generic setter — handles string fields and the boolean toggle alike.
  const set = <K extends keyof WidgetFormValues>(key: K, value: WidgetFormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'create') {
      if (!form.code.trim()) e.code = 'Code is required';
      else if (!/^[A-Z0-9_-]{2,30}$/i.test(form.code.trim())) e.code = 'Code must be 2-30 alphanumeric characters';
    }
    if (!form.name.trim()) e.name = 'Name is required';
    else if (form.name.trim().length < 3) e.name = 'Name must be at least 3 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        category: form.category,
        capacity: form.capacity === '' ? null : Number(form.capacity), // INT
        effective_date: form.effectiveDate || null,                     // DATE
        is_featured: form.isFeatured,                                   // BOOL
        description: form.description.trim() || null,                   // TEXT
        // create sets the immutable code; edit sets the operational status.
        ...(mode === 'create' ? { code: form.code.trim().toUpperCase() } : { status: form.status }),
      };
      const res = await fetch('/api/admin/widgets', {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(mode === 'create' ? payload : { ...payload, id: widgetId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      toast.success(mode === 'create' ? 'Widget added' : 'Widget updated');
      router.push(mode === 'create' ? '/widgets' : `/widgets/${widgetId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelHref = mode === 'create' ? '/widgets' : `/widgets/${widgetId}`;
  const fieldHint = 'mt-1 text-xs text-gray-500';
  const errText = 'mt-1 text-xs text-red-500';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Widget Information</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* TEXT (immutable on edit) */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Code {mode === 'create' ? '*' : ''}</label>
            {mode === 'create' ? (
              <>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => set('code', e.target.value)}
                  className={`input ${errors.code ? 'border-red-500' : ''}`}
                  placeholder="WIDGET-01"
                  disabled={saving}
                />
                {errors.code ? <p className={errText}>{errors.code}</p> : <p className={fieldHint}>Unique identifier (2-30 chars)</p>}
              </>
            ) : (
              <>
                <p className="flex h-[42px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 font-mono text-sm text-gray-700">
                  {form.code || '—'}
                </p>
                <p className={fieldHint}>Identifier — cannot be changed</p>
              </>
            )}
          </div>

          {/* TEXT */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={`input ${errors.name ? 'border-red-500' : ''}`}
              placeholder="Primary widget"
              disabled={saving}
            />
            {errors.name ? <p className={errText}>{errors.name}</p> : <p className={fieldHint}>Descriptive name</p>}
          </div>

          {/* ENUM */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Category</label>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className="input capitalize" disabled={saving}>
              {CATEGORY_OPTIONS.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
            <p className={fieldHint}>Widget category</p>
          </div>

          {/* ENUM (edit-only — API defaults it on create) */}
          {mode === 'edit' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className="input capitalize" disabled={saving}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
              <p className={fieldHint}>Operational status</p>
            </div>
          )}

          {/* INT */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Capacity</label>
            <input
              type="number"
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
              className="input"
              placeholder="0"
              min={0}
              disabled={saving}
            />
            <p className={fieldHint}>Whole number</p>
          </div>

          {/* DATE */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Effective date</label>
            <input
              type="date"
              value={form.effectiveDate}
              onChange={(e) => set('effectiveDate', e.target.value)}
              className="input"
              disabled={saving}
            />
            <p className={fieldHint}>Leave empty for none</p>
          </div>

          {/* BOOL */}
          <div className="flex items-center md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => set('isFeatured', e.target.checked)}
                disabled={saving}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-gray-700">Featured</span>
            </label>
            <span className="ml-3 text-xs text-gray-500">Featured widgets are highlighted</span>
          </div>
        </div>
      </div>

      {/* TEXT (textarea) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          className="input min-h-[120px]"
          rows={4}
          placeholder="Optional notes about this widget"
          disabled={saving}
        />
        <p className={fieldHint}>Optional</p>
      </div>

      <div className="flex justify-end gap-3">
        <Link href={cancelHref} className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
          Cancel
        </Link>
        <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === 'create' ? 'Add Widget' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
```

---

<a name="api"></a>
## `app/(admin)/widgets/widget-api.ts`

```ts
import type { WidgetRow } from './columns'; // reuse the row type from the table skill

export async function fetchWidget(id: string): Promise<WidgetRow> {
  const res = await fetch(`/api/admin/widgets/${id}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load widget');
  return json.data as WidgetRow;
}
```

---

<a name="new"></a>
## `app/(admin)/widgets/new/page.tsx`

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

---

<a name="edit"></a>
## `app/(admin)/widgets/[id]/edit/page.tsx`

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { fetchWidget } from '../../widget-api';
import { WidgetForm } from '../../widget-form';

const crumbs = (name: string, id?: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Widgets', href: '/widgets' },
  ...(id ? [{ label: name, href: `/widgets/${id}` }] : [{ label: name }]),
  { label: 'Edit' },
];

// ISO/timestamp → yyyy-mm-dd for <input type="date">.
const toDateInput = (d?: string | null) => (d ? String(d).split('T')[0] : '');

export default function EditWidgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: widget, isLoading, isError } = useQuery({
    queryKey: ['widget', id],
    queryFn: () => fetchWidget(id),
  });

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
        crumbs={crumbs(widget.name, widget.id)}
        backHref={`/widgets/${widget.id}`}
        title={`Edit ${widget.name}`}
        subtitle="Update widget details"
      />
      <WidgetForm
        mode="edit"
        widgetId={widget.id}
        initial={{
          name: widget.name,
          code: widget.code ?? '',
          category: widget.category ?? 'standard',
          status: widget.status ?? 'active',
          capacity: widget.capacity != null ? String(widget.capacity) : '', // number → string
          effectiveDate: toDateInput(widget.effective_date),                 // ISO → yyyy-mm-dd
          isFeatured: !!widget.is_featured,                                  // null → false
          description: widget.description ?? '',                             // null → '' for controlled inputs
        }}
      />
    </div>
  );
}
```
