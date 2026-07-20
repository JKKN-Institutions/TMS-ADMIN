# Tracking Mobiles — phone image + handover columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a phone photo, a free-text "handover by", and a "handover date" to the Tracking Mobiles module (`/driver-mobiles`, table `tms_driver_mobile`).

**Architecture:** Three new DB columns (`image_path`, `handover_by`, `handover_date`). The image lives in a **private** Supabase Storage bucket; the DB stores only a storage path. A new driver-mobiles-scoped upload endpoint (a near-copy of the existing vehicle-documents route) handles upload + signed-URL preview. The list and detail read-APIs batch-sign paths into short-lived `image_url`s. Form, list columns, and detail page surface the three fields. All API access uses the module's existing MODERN pattern (`withAuth` + service-role + `requirePerm` + `logActivity`).

**Tech Stack:** Next.js 15/16 App Router, TypeScript, Supabase (Postgres + Storage), React Query, TanStack Table, Tailwind, Vitest.

## Global Constraints

- **Bucket:** `tms-driver-mobile-images` — **private** (`public = false`). All read/write via service-role endpoints; no storage RLS policies.
- **Shared bucket constant:** `DRIVER_MOBILE_IMAGE_BUCKET` exported from `lib/driver-mobiles/fields.ts`; import it in every route that touches the bucket (DRY — never re-type the string).
- **Image constraints:** allowed MIME `image/jpeg`, `image/png`, `image/webp`; max **5 MB**.
- **Permissions:** reuse `TMS_PERMISSIONS.DRIVER_MOBILES_{VIEW,CREATE,EDIT,DELETE}` (`tms.driver_mobiles.*`). No new permissions.
- **Activity log:** image upload logs `module: 'driver-mobiles', action: 'upload'` — both already valid in the closed unions; do NOT edit the unions.
- **`image_path` is a storage path, NOT a public URL.** Signed `image_url`s are added only in read-API responses and expire in 1 hour.
- **Verification reality (project memory):** `npm run lint` is broken (circular ESLint config) and `tsc` is chronically red (~540 pre-existing errors, NOT gated by `next build` which sets `ignoreBuildErrors: true`). Do **not** treat pre-existing tsc/eslint red as a regression. Gate on: `npm run test` (Vitest) for the pure function, and `npm run build` for the whole feature. New code must not introduce NEW type errors in the files it touches.
- **Commits:** commit steps below follow the skill's TDD rhythm. Per the user's standing rule, only actually run `git commit`/push when the user asks; otherwise leave the changes for their review.
- **Supabase DB access:** the agent may `apply_migration` against the live app DB (`kvizhngldtiuufknvehv`) and MUST also commit the `.sql` under `supabase/migrations/`.

---

### Task 1: Database migration + storage bucket

**Files:**
- Create: `supabase/migrations/20260720000000_driver_mobile_handover.sql`

**Interfaces:**
- Produces: columns `tms_driver_mobile.image_path text`, `.handover_by text`, `.handover_date date`; private storage bucket `tms-driver-mobile-images`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260720000000_driver_mobile_handover.sql`:

```sql
-- Tracking Mobiles: phone image + handover metadata (image_path, handover_by, handover_date)
alter table tms_driver_mobile
  add column if not exists image_path    text,
  add column if not exists handover_by   text,
  add column if not exists handover_date date;

comment on column tms_driver_mobile.image_path is
  'Storage path in the private tms-driver-mobile-images bucket (NOT a public url).';

-- Private bucket for phone photos; all access is via service-role endpoints, so no RLS policies.
insert into storage.buckets (id, name, public)
values ('tms-driver-mobile-images', 'tms-driver-mobile-images', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply the migration to the live DB**

Use the Supabase MCP tool `mcp__supabase__apply_migration` with:
- `name`: `driver_mobile_handover`
- `query`: the exact SQL from Step 1.

- [ ] **Step 3: Verify the columns and bucket exist**

Run `mcp__supabase__execute_sql` with:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'tms_driver_mobile'
  and column_name in ('image_path', 'handover_by', 'handover_date')
order by column_name;
select id, public from storage.buckets where id = 'tms-driver-mobile-images';
```

Expected: 3 column rows (`handover_by text`, `handover_date date`, `image_path text`) and 1 bucket row with `public = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260720000000_driver_mobile_handover.sql
git commit -m "feat(driver-mobiles): add image_path, handover_by, handover_date columns + private image bucket"
```

---

### Task 2: Shared bucket constant + write whitelist (TDD)

**Files:**
- Modify: `lib/driver-mobiles/fields.ts`
- Test: `lib/driver-mobiles/fields.test.ts`

**Interfaces:**
- Produces: `export const DRIVER_MOBILE_IMAGE_BUCKET = 'tms-driver-mobile-images'`; `buildDriverMobilePayload` now passes through `handover_by` (text), `image_path` (text), `handover_date` (date).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Append to `lib/driver-mobiles/fields.test.ts` (inside the existing `describe` block, before its closing `});`):

```ts
  it('trims handover_by text, empty → null', () => {
    expect(buildDriverMobilePayload({ handover_by: '  Ramesh K  ' }).handover_by).toBe('Ramesh K');
    expect(buildDriverMobilePayload({ handover_by: '   ' }).handover_by).toBe(null);
  });

  it('passes image_path through as trimmed text, empty → null', () => {
    expect(buildDriverMobilePayload({ image_path: '2026/abc-phone.jpg' }).image_path).toBe('2026/abc-phone.jpg');
    expect(buildDriverMobilePayload({ image_path: '' }).image_path).toBe(null);
  });

  it('passes handover_date through as a date string, empty → null', () => {
    expect(buildDriverMobilePayload({ handover_date: '2026-07-20' }).handover_date).toBe('2026-07-20');
    expect(buildDriverMobilePayload({ handover_date: '' }).handover_date).toBe(null);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- lib/driver-mobiles/fields.test.ts`
Expected: the 3 new tests FAIL (`handover_by`/`image_path`/`handover_date` are not whitelisted, so `buildDriverMobilePayload` drops them → the properties are `undefined`, not the expected value).

- [ ] **Step 3: Add the fields to the whitelist and export the bucket constant**

In `lib/driver-mobiles/fields.ts`:

Add the bucket constant at the top of the file (just below the header comment):

```ts
// Private Supabase Storage bucket holding phone photos. Shared by every route
// that uploads or signs a driver-mobile image, so the string lives in one place.
export const DRIVER_MOBILE_IMAGE_BUCKET = 'tms-driver-mobile-images';
```

Add `handover_date` to `DATE_FIELDS`:

```ts
export const DATE_FIELDS = ['supplied_date', 'purchase_date', 'warranty_expiry', 'handover_date'] as const;
```

Add `handover_by` and `image_path` to `TEXT_FIELDS`:

```ts
export const TEXT_FIELDS = [
  'brand', 'model', 'color', 'imei', 'notes',
  'sim_number', 'phone_number', 'network_provider',
  'supplier_name', 'invoice_number',
  'storage_capacity', 'serial_number', 'accessories',
  'handover_by', 'image_path',
] as const;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- lib/driver-mobiles/fields.test.ts`
Expected: all tests PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/driver-mobiles/fields.ts lib/driver-mobiles/fields.test.ts
git commit -m "feat(driver-mobiles): whitelist handover_by/handover_date/image_path + export image bucket const"
```

---

### Task 3: Image upload + signed-URL endpoint

**Files:**
- Create: `app/api/admin/driver-mobiles/image/route.ts`

**Interfaces:**
- Consumes: `DRIVER_MOBILE_IMAGE_BUCKET` (Task 2); `TMS_PERMISSIONS.DRIVER_MOBILES_{VIEW,CREATE,EDIT}`; `withAuth`, `AuthContext`, `createServiceRoleClient`, `logActivity` (existing).
- Produces:
  - `POST /api/admin/driver-mobiles/image` — multipart field `file` → `{ success: true, path: string }`.
  - `GET  /api/admin/driver-mobiles/image?path=<path>` → `{ success: true, url: string }` (1-hour signed URL).

- [ ] **Step 1: Create the route**

Create `app/api/admin/driver-mobiles/image/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { DRIVER_MOBILE_IMAGE_BUCKET } from '@/lib/driver-mobiles/fields';
import { logActivity } from '@/lib/activity/log';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function requirePerm(auth: AuthContext, ...permissions: string[]): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  for (const p of permissions) {
    const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: p });
    if (data) return true;
  }
  return false;
}

// Keep only safe filename chars; preserve the extension.
function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const ext = (dot >= 0 ? name.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return ext ? `${base || 'file'}.${ext}` : base || 'file';
}

// POST: multipart upload → returns the storage path (saved into tms_driver_mobile.image_path).
async function uploadImage(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_CREATE, TMS_PERMISSIONS.DRIVER_MOBILES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Only JPG, PNG, or WEBP images are allowed' }, { status: 400 });
    }

    // Path is NOT keyed on record id, so the same flow works for create (no id yet) and edit.
    const year = new Date().getUTCFullYear();
    const path = `${year}/${uuidv4()}-${safeName(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error('Driver mobile image upload error:', error);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'driver-mobiles',
      action: 'upload',
      entityType: 'tms_driver_mobile',
      description: `Uploaded driver mobile image: ${file.name}`,
      metadata: { path, fileName: file.name, fileType: file.type },
    });
    return NextResponse.json({ success: true, path });
  } catch (e) {
    console.error('Driver mobile image upload error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET ?path=… → short-lived signed URL for preview (private bucket).
async function getSignedUrl(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const path = new URL(request.url).searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 404 });
    }
    return NextResponse.json({ success: true, url: data.signedUrl });
  } catch (e) {
    console.error('Driver mobile image signed-url error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => uploadImage(request, auth));
export const GET = withAuth((request, auth) => getSignedUrl(request, auth));
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "app/api/admin/driver-mobiles/image/route.ts"`
Expected: no output (no NEW type errors in the new file). Pre-existing errors elsewhere are expected — ignore them.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/driver-mobiles/image/route.ts
git commit -m "feat(driver-mobiles): add private image upload + signed-url endpoint"
```

---

### Task 4: Read APIs attach signed `image_url`

**Files:**
- Modify: `app/api/admin/driver-mobiles/route.ts` (the `getDriverMobiles` list handler)
- Modify: `app/api/admin/driver-mobiles/[id]/route.ts` (the single-record GET)

**Interfaces:**
- Consumes: `DRIVER_MOBILE_IMAGE_BUCKET` (Task 2).
- Produces: every list row and the detail object gain `image_url: string | null` (signed, 1h) alongside the raw `image_path`.

- [ ] **Step 1: List handler — batch-sign image paths**

In `app/api/admin/driver-mobiles/route.ts`:

Add the import near the top (with the other `@/lib/driver-mobiles/fields` import):

```ts
import { buildDriverMobilePayload, DRIVER_MOBILE_IMAGE_BUCKET } from '@/lib/driver-mobiles/fields';
```

(Replace the existing `import { buildDriverMobilePayload } from '@/lib/driver-mobiles/fields';` line with the line above.)

In `getDriverMobiles`, widen the `list` cast to include `image_path`, then batch-sign. Replace this block:

```ts
    const list = (rows ?? []) as { driver_staff_id: string; route_id: string | null }[];
    const names = await resolveDriverNames(supabase, list.map((r) => r.driver_staff_id));
    const routes = await resolveRouteInfo(supabase, list.map((r) => r.route_id ?? '').filter(Boolean));
    const data = list.map((r) => ({
      ...r,
      driver_name: names.get(r.driver_staff_id)?.name ?? '—',
      driver_phone: names.get(r.driver_staff_id)?.phone ?? null,
      route_number: r.route_id ? routes.get(r.route_id)?.number ?? null : null,
      route_name: r.route_id ? routes.get(r.route_id)?.name ?? null : null,
    }));
```

with:

```ts
    const list = (rows ?? []) as { driver_staff_id: string; route_id: string | null; image_path: string | null }[];
    const names = await resolveDriverNames(supabase, list.map((r) => r.driver_staff_id));
    const routes = await resolveRouteInfo(supabase, list.map((r) => r.route_id ?? '').filter(Boolean));

    // Batch-sign every phone photo in one round trip (private bucket → signed urls).
    const imagePaths = [...new Set(list.map((r) => r.image_path).filter((p): p is string => !!p))];
    const signed = new Map<string, string>();
    if (imagePaths.length) {
      const { data: urls } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).createSignedUrls(imagePaths, 3600);
      for (const u of urls ?? []) {
        if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
      }
    }

    const data = list.map((r) => ({
      ...r,
      driver_name: names.get(r.driver_staff_id)?.name ?? '—',
      driver_phone: names.get(r.driver_staff_id)?.phone ?? null,
      route_number: r.route_id ? routes.get(r.route_id)?.number ?? null : null,
      route_name: r.route_id ? routes.get(r.route_id)?.name ?? null : null,
      image_url: r.image_path ? signed.get(r.image_path) ?? null : null,
    }));
```

- [ ] **Step 2: Detail handler — sign the single path**

In `app/api/admin/driver-mobiles/[id]/route.ts`:

Add the import near the top:

```ts
import { DRIVER_MOBILE_IMAGE_BUCKET } from '@/lib/driver-mobiles/fields';
```

Replace the final return line:

```ts
    return NextResponse.json({ success: true, data: { ...row, driver_name, driver_phone, route_number, route_name } });
```

with:

```ts
    let image_url: string | null = null;
    const imgPath = (row as { image_path?: string | null }).image_path;
    if (imgPath) {
      const { data: signed } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).createSignedUrl(imgPath, 3600);
      image_url = signed?.signedUrl ?? null;
    }

    return NextResponse.json({ success: true, data: { ...row, driver_name, driver_phone, route_number, route_name, image_url } });
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "driver-mobiles/(route|\[id\]/route)\.ts"`
Expected: no output (no NEW type errors in the two files).

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/driver-mobiles/route.ts app/api/admin/driver-mobiles/[id]/route.ts
git commit -m "feat(driver-mobiles): attach signed image_url in list + detail read APIs"
```

---

### Task 5: List columns — row type + Photo & Handover-by columns

**Files:**
- Modify: `app/(admin)/driver-mobiles/columns.tsx`

**Interfaces:**
- Consumes: `image_url` from the list API (Task 4).
- Produces: `DriverMobileRow` gains `image_path`, `image_url`, `handover_by`, `handover_date`; two new visible columns (`photo`, `handover_by`). The `fmtDate` helper already exists in this file.

- [ ] **Step 1: Extend the row type**

In `app/(admin)/driver-mobiles/columns.tsx`, add these fields to the `DriverMobileRow` interface (place them right after the `accessories: string | null;` line):

```ts
  image_path: string | null;
  image_url: string | null;
  handover_by: string | null;
  handover_date: string | null;
```

- [ ] **Step 2: Add the Photo column (right after the `phone` column)**

Insert this column object immediately after the `phone` column object (the one with `id: 'phone'`), before the `driver_name` column:

```tsx
    {
      id: 'photo',
      enableSorting: false,
      enableHiding: true,
      size: 64,
      header: () => <span className="text-xs font-medium text-gray-500">Photo</span>,
      cell: ({ row }) =>
        row.original.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.original.image_url}
            alt={`${row.original.brand} ${row.original.model}`}
            className="h-10 w-10 rounded-md object-cover ring-1 ring-gray-200 dark:ring-gray-700"
            loading="lazy"
          />
        ) : (
          <span className="text-sm text-gray-400">—</span>
        ),
    },
```

- [ ] **Step 3: Add the Handover-by column (right after the `supplied_date` column)**

Insert this column object immediately after the `supplied_date` column object, before the `actions` column:

```tsx
    {
      id: 'handover_by',
      accessorFn: (m) => m.handover_by ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Handover by" />,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="text-sm text-gray-700 dark:text-gray-300">{row.original.handover_by || '—'}</span>
          {row.original.handover_date && (
            <span className="text-xs text-gray-500">{fmtDate(row.original.handover_date)}</span>
          )}
        </span>
      ),
    },
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "driver-mobiles/columns.tsx"`
Expected: no output (no NEW type errors). Note: `<img>` triggers the `@next/next/no-img-element` ESLint rule, which is why the inline disable comment is present; ESLint is not build-gating here regardless.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/driver-mobiles/columns.tsx"
git commit -m "feat(driver-mobiles): add Photo and Handover-by list columns"
```

---

### Task 6: Form — Handover section + upload widget

**Files:**
- Modify: `app/(admin)/driver-mobiles/driver-mobile-form.tsx`
- Modify: `app/(admin)/driver-mobiles/[id]/edit/page.tsx` (add the 3 fields to `initial`)

**Interfaces:**
- Consumes: `POST`/`GET /api/admin/driver-mobiles/image` (Task 3); the whitelisted payload keys (Task 2).
- Produces: the create/edit form now reads and writes `handover_by`, `handover_date`, `image_path`.

- [ ] **Step 1: Update imports**

In `app/(admin)/driver-mobiles/driver-mobile-form.tsx`, replace:

```ts
import React, { useState } from 'react';
```
with:
```ts
import React, { useEffect, useRef, useState } from 'react';
```

and replace:

```ts
import { Loader2, Save } from 'lucide-react';
```
with:
```ts
import { Loader2, Save, Upload } from 'lucide-react';
```

- [ ] **Step 2: Extend `FormValues` and `EMPTY`**

In the `FormValues` interface, add after `notes: string;`:

```ts
  handover_by: string;
  handover_date: string;
  image_path: string;
```

In the `EMPTY` object, add the three keys (append to the last line):

```ts
  handover_by: '', handover_date: '', image_path: '',
```

- [ ] **Step 3: Add upload state + handlers + edit-mode preview**

Inside the `DriverMobileForm` component, just after the existing `const [saving, setSaving] = useState(false);` line, add:

```tsx
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit mode: if the record already has an image, fetch a signed url to preview it.
  useEffect(() => {
    const path = initial?.image_path;
    if (!path) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/driver-mobiles/image?path=${encodeURIComponent(path)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const json = await res.json();
        if (!cancelled && res.ok && json.success) setImagePreview(json.url);
      } catch {
        /* preview is best-effort; ignore */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a remove
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/driver-mobiles/image', {
        method: 'POST',
        body: fd,
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
      set('image_path', json.path);
      const sres = await fetch(`/api/admin/driver-mobiles/image?path=${encodeURIComponent(json.path)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const sjson = await sres.json();
      setImagePreview(sres.ok && sjson.success ? sjson.url : null);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const onRemoveImage = () => {
    set('image_path', '');
    setImagePreview(null);
  };
```

- [ ] **Step 4: Add the three keys to the save payload**

In the `payload` object inside `onSubmit`, add after `notes: form.notes.trim() || null,`:

```ts
        handover_by: form.handover_by.trim() || null,
        handover_date: form.handover_date || null,
        image_path: form.image_path || null,
```

- [ ] **Step 5: Add the Handover section to the JSX**

Insert this block immediately after the closing `</div>` of the **Supply** section (i.e. right before the `{/* Device details */}` comment):

```tsx
      {/* Handover */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Handover</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Handover by</label>
            <input
              value={form.handover_by}
              onChange={(e) => set('handover_by', e.target.value)}
              className="input"
              placeholder="Name of person who handed over"
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Handover date</label>
            <input
              type="date"
              value={form.handover_date}
              onChange={(e) => set('handover_date', e.target.value)}
              className="input"
              disabled={saving}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">Phone image</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickImage}
              className="hidden"
            />
            {imagePreview ? (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Phone" className="h-24 w-24 rounded-lg object-cover ring-1 ring-gray-200" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving || uploadingImage}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Replace'}
                  </button>
                  <button
                    type="button"
                    onClick={onRemoveImage}
                    disabled={saving || uploadingImage}
                    className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving || uploadingImage}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadingImage ? 'Uploading…' : 'Upload image'}
              </button>
            )}
            <p className="mt-1 text-xs text-gray-500">JPG, PNG or WEBP, up to 5 MB.</p>
          </div>
        </div>
      </div>
```

- [ ] **Step 6: Prevent submit while an image is uploading**

Change the submit button's `disabled` prop from `disabled={saving}` to:

```tsx
disabled={saving || uploadingImage}
```

- [ ] **Step 7: Pass the new fields into `initial` on the edit page**

In `app/(admin)/driver-mobiles/[id]/edit/page.tsx`, add these three lines to the `initial={{ … }}` object (after `notes: m.notes ?? '',`):

```ts
          handover_by: m.handover_by ?? '',
          handover_date: d(m.handover_date),
          image_path: m.image_path ?? '',
```

- [ ] **Step 8: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "driver-mobile-form.tsx|edit/page.tsx"`
Expected: no output (no NEW type errors in the two files).

- [ ] **Step 9: Commit**

```bash
git add "app/(admin)/driver-mobiles/driver-mobile-form.tsx" "app/(admin)/driver-mobiles/[id]/edit/page.tsx"
git commit -m "feat(driver-mobiles): form Handover section with image upload + handover fields"
```

---

### Task 7: Detail page — Handover SectionCard

**Files:**
- Modify: `app/(admin)/driver-mobiles/[id]/page.tsx`

**Interfaces:**
- Consumes: `image_url`, `handover_by`, `handover_date` from the detail API (Task 4) — already typed on `DriverMobileRow` (Task 5), which this page's `useQuery` returns.
- Produces: a "Handover" section on the detail view. The `fmtDate` / `or` helpers already exist in this file.

- [ ] **Step 1: Add the Handover SectionCard**

In `app/(admin)/driver-mobiles/[id]/page.tsx`, insert this block immediately after the closing `</SectionCard>` of the **Supply** section (before `<SectionCard title="Device">`):

```tsx
      <SectionCard title="Handover">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Handover by" value={or(m.handover_by)} />
          <Field label="Handover date" value={fmtDate(m.handover_date)} />
          <Field
            label="Phone image"
            value={
              m.image_url ? (
                <a href={m.image_url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.image_url}
                    alt={`${m.brand} ${m.model}`}
                    className="h-24 w-24 rounded-lg object-cover ring-1 ring-gray-200 transition hover:opacity-90"
                  />
                </a>
              ) : (
                '—'
              )
            }
          />
        </div>
      </SectionCard>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "driver-mobiles/\[id\]/page.tsx"`
Expected: no output (no NEW type errors).

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/driver-mobiles/[id]/page.tsx"
git commit -m "feat(driver-mobiles): show Handover section (by/date/image) on detail page"
```

---

### Task 8: Full-feature build + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the unit tests**

Run: `npm run test -- lib/driver-mobiles/fields.test.ts`
Expected: PASS.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds. (It does not gate on tsc/eslint, but must not fail to compile the new/changed modules.)

- [ ] **Step 3: Manual smoke test (user's authenticated browser)**

The agent's browser is unauthenticated (project memory), so ask the user to verify in their session:
1. `/driver-mobiles` → open **Add Mobile** → fill Driver + Brand + Model, set **Handover by** + **Handover date**, click **Upload image**, pick a JPG/PNG → thumbnail preview appears → **Add Mobile**.
2. Back on the list: the new row shows the **Photo** thumbnail and **Handover by** (with the date beneath it).
3. Open the row (detail): the **Handover** section shows by/date and the image; clicking the image opens the full-size signed URL in a new tab.
4. **Edit** the row: the existing photo previews on load; **Replace** swaps it, **Remove** clears it; Save persists.
5. Negative: try uploading a >5 MB file or a non-image (e.g. a PDF renamed) → a toast error, no save.

---

## Self-Review

**Spec coverage:**
- Migration + private bucket → Task 1. ✅
- `image_path`/`handover_by`/`handover_date` whitelist → Task 2. ✅
- Upload endpoint (POST + GET signed url, 5 MB, jpeg/png/webp, driver-mobiles perms, upload activity) → Task 3. ✅
- List + detail attach signed `image_url` (batch `createSignedUrls`) → Task 4. ✅
- Form Handover section + upload-on-select widget + edit `initial` mapping → Task 6. ✅
- List Photo + Handover-by columns → Task 5. ✅
- Detail Handover SectionCard → Task 7. ✅
- Permissions reused, no union edits → Tasks 3 (perms) + 3 (activity). ✅
- Verification (vitest + build + manual smoke) → Tasks 2, 8. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `DRIVER_MOBILE_IMAGE_BUCKET` (Task 2) is imported unchanged in Tasks 3 & 4. `image_url`/`image_path`/`handover_by`/`handover_date` are produced by the APIs in Task 4, typed on `DriverMobileRow` in Task 5, and consumed by the detail page in Task 7 and the form (`image_path`) in Task 6. `buildDriverMobilePayload` keys match the form payload keys. `fmtDate`/`or` reused where they already exist. ✅
