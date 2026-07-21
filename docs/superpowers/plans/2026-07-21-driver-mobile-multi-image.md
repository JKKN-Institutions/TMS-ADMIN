# Tracking Mobiles — Multiple Image Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one Tracking Mobiles record hold up to 5 handover photos instead of one, deleting files from storage when they are removed from a record.

**Architecture:** Replace the scalar `tms_driver_mobile.image_path` with an ordered `image_paths text[]` (no child table — no per-image metadata is needed). The existing single-file upload endpoint is reused once per file. Storage cleanup **reconciles on save** in the existing `PUT`/`DELETE` handlers, which already load the prior row. All list/cap/diff rules live in a pure, unit-tested module.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role + private Storage bucket), vitest 4, React Query, Tailwind v4.

**Design spec:** `docs/superpowers/specs/2026-07-21-driver-mobile-multi-image-design.md`

## Global Constraints

- **Work in the worktree** `D:/Sangeetha_V/TMS-ADMIN-wt-mobiles`, branch `feat/driver-mobile-multi-image`. Never switch branches — the main checkout at `D:/Sangeetha_V/TMS-ADMIN` belongs to another session and has uncommitted work.
- **Max images = 5**, enforced in the database (CHECK), the API (400), and the UI. The server cap is the real control.
- **VITEST has no `@/` alias.** Test files, and any `lib/` source they import, must use RELATIVE imports (`./images`, `./fields`). `app/` route files may use `@/`.
- **Signed URLs must be mapped back keyed by PATH, never by array position.** Going from 1 to N images per row is exactly where index-based mapping starts rendering one phone's photo on another phone's card.
- **Storage deletion happens only AFTER the database write succeeds.** A failed write must never destroy a file the record still references.
- **Storage deletion failure is logged, not fatal.** The row is already correct; a leaked object beats a failed save.
- **TSC gate:** `npx tsc --noEmit 2>&1 | grep <changed-file>` must return ZERO lines. The repo has ~540 pre-existing unrelated errors and `ignoreBuildErrors:true`, so a repo-wide red tsc is normal and is NOT a regression.
- **`npm run lint` is BROKEN** (circular config) — never run it.
- **Git:** explicit `git add <paths>` only, never `-A`/`-u`. Local commits only, never push. No history rewrites.
- Test command: `npm test` (= `vitest run`). Single file: `npx vitest run <path>`.
- Auth-gated browser verification is the human's job; agents verify via vitest + tsc only.

---

### Task 1: Migration — image_paths text[]

**Files:**
- Create: `supabase/migrations/20260721120000_driver_mobile_multi_image.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `tms_driver_mobile.image_paths text[] NOT NULL DEFAULT '{}'`, capped at 5; `image_path` dropped.

- [ ] **Step 1: Confirm the timestamp does not collide**

Run: `ls supabase/migrations/ | grep 20260721`
Expected: no file starting `20260721120000`. If one exists, bump to `20260721130000` and use that name throughout.

- [ ] **Step 2: Write the migration**

```sql
-- Tracking Mobiles: one phone may carry up to 5 handover photos.
-- Replaces the scalar image_path with an ordered path array. Verified before
-- writing this: the table holds 1 row and 0 rows have a non-empty image_path,
-- so the back-fill below is defensive rather than load-bearing.

alter table public.tms_driver_mobile
  add column if not exists image_paths text[] not null default '{}';

-- Preserve any existing single image as a one-element array.
update public.tms_driver_mobile
   set image_paths = array[image_path]
 where image_path is not null
   and image_path <> ''
   and coalesce(cardinality(image_paths), 0) = 0;

alter table public.tms_driver_mobile drop column if exists image_path;

-- cardinality(), NOT array_length(): array_length returns NULL for an empty
-- array, which would make the CHECK evaluate to NULL and pass for the wrong
-- reason.
alter table public.tms_driver_mobile
  drop constraint if exists tms_driver_mobile_image_paths_max;
alter table public.tms_driver_mobile
  add constraint tms_driver_mobile_image_paths_max
  check (coalesce(cardinality(image_paths), 0) <= 5);
```

- [ ] **Step 3: Apply it**

Use the Supabase MCP `apply_migration` tool, name `driver_mobile_multi_image`, with the SQL above. This targets the real project database, which is expected and authorized for this repo.

- [ ] **Step 4: Verify the live shape**

Run via the Supabase MCP `execute_sql` tool:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='tms_driver_mobile'
  and column_name in ('image_path','image_paths');
```

Expected: exactly ONE row — `image_paths`, `ARRAY`, `NO`, default `'{}'::text[]`. If `image_path` still appears, the drop failed — stop and report.

Then confirm the cap rejects a 6th entry:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.tms_driver_mobile'::regclass
  and conname = 'tms_driver_mobile_image_paths_max';
```

Expected: one row whose definition contains `<= 5`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260721120000_driver_mobile_multi_image.sql
git commit -m "feat(driver-mobiles): replace image_path with capped image_paths array"
```

---

### Task 2: Pure image-list helpers

All cap, dedupe and diff rules in one I/O-free module. The diff is what decides whether a real file gets destroyed, so it is unit-tested directly.

**Files:**
- Create: `lib/driver-mobiles/images.ts`
- Test: `lib/driver-mobiles/images.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `MAX_DRIVER_MOBILE_IMAGES: number` (= 5)
  - `normalizeImagePaths(value: unknown): string[]` — cleans; does NOT truncate
  - `exceedsImageCap(paths: string[]): boolean`
  - `removedPaths(before: string[], after: string[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `lib/driver-mobiles/images.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  MAX_DRIVER_MOBILE_IMAGES,
  normalizeImagePaths,
  exceedsImageCap,
  removedPaths,
} from './images';

describe('normalizeImagePaths', () => {
  it('keeps a clean list in order', () => {
    expect(normalizeImagePaths(['2026/a.jpg', '2026/b.jpg'])).toEqual(['2026/a.jpg', '2026/b.jpg']);
  });

  it('returns an empty list for non-array input', () => {
    expect(normalizeImagePaths(undefined)).toEqual([]);
    expect(normalizeImagePaths(null)).toEqual([]);
    expect(normalizeImagePaths('2026/a.jpg')).toEqual([]);
  });

  it('trims, and drops empty or whitespace-only entries', () => {
    expect(normalizeImagePaths([' 2026/a.jpg ', '', '   '])).toEqual(['2026/a.jpg']);
  });

  it('drops non-string entries', () => {
    expect(normalizeImagePaths(['2026/a.jpg', 5, null, {}, '2026/b.jpg'])).toEqual([
      '2026/a.jpg',
      '2026/b.jpg',
    ]);
  });

  it('de-duplicates while preserving first-seen order', () => {
    expect(normalizeImagePaths(['b', 'a', 'b'])).toEqual(['b', 'a']);
  });

  it('does NOT truncate past the cap — the API must reject, not silently drop', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(normalizeImagePaths(six)).toHaveLength(6);
  });
});

describe('exceedsImageCap', () => {
  it('allows exactly the maximum', () => {
    expect(exceedsImageCap(['a', 'b', 'c', 'd', 'e'])).toBe(false);
    expect(MAX_DRIVER_MOBILE_IMAGES).toBe(5);
  });

  it('flags one over the maximum', () => {
    expect(exceedsImageCap(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(true);
  });

  it('allows an empty list', () => {
    expect(exceedsImageCap([])).toBe(false);
  });
});

describe('removedPaths', () => {
  it('returns paths dropped between before and after', () => {
    expect(removedPaths(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });

  it('returns nothing when nothing was removed', () => {
    expect(removedPaths(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('returns nothing when images were only ADDED', () => {
    expect(removedPaths(['a'], ['a', 'b'])).toEqual([]);
  });

  it('returns every path when all were removed', () => {
    expect(removedPaths(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('treats a re-added path as not removed regardless of position', () => {
    expect(removedPaths(['a', 'b'], ['b', 'a'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/driver-mobiles/images.test.ts`
Expected: FAIL — cannot resolve `./images`.

- [ ] **Step 3: Write the implementation**

Create `lib/driver-mobiles/images.ts`:

```ts
/**
 * Pure list rules for Tracking Mobiles handover photos.
 *
 * No I/O: the API and the form both feed arrays through here so the cap,
 * de-duplication and removal diff behave identically on client and server.
 *
 * `removedPaths` is the function that decides which storage objects get
 * DELETED, so it is deliberately tiny and directly tested.
 */

/** A phone record may carry at most this many photos. */
export const MAX_DRIVER_MOBILE_IMAGES = 5;

/**
 * Coerce untrusted input into a clean, ordered, de-duplicated path list.
 * Deliberately does NOT truncate at the cap — the API must reject an
 * over-long list with a 400 rather than silently discarding a file the
 * user believes they uploaded.
 */
export function normalizeImagePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

export function exceedsImageCap(paths: string[]): boolean {
  return paths.length > MAX_DRIVER_MOBILE_IMAGES;
}

/**
 * Paths present before a save but absent after it — the storage objects that
 * are now unreferenced and safe to delete. Order-insensitive: re-arranging
 * the same paths removes nothing.
 */
export function removedPaths(before: string[], after: string[]): string[] {
  const keep = new Set(after);
  return before.filter((p) => p && !keep.has(p));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/driver-mobiles/images.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/driver-mobiles/images.ts lib/driver-mobiles/images.test.ts
git commit -m "feat(driver-mobiles): pure image-list cap and removal-diff helpers"
```

---

### Task 3: Field whitelist accepts image_paths

**Files:**
- Modify: `lib/driver-mobiles/fields.ts:25` (remove `image_path` from `TEXT_FIELDS`), plus new `ARRAY_FIELDS` and normalisation
- Modify: `lib/driver-mobiles/fields.test.ts:45-47` (replace the `image_path` test)

**Interfaces:**
- Consumes: `normalizeImagePaths` from `./images` (Task 2).
- Produces: `ARRAY_FIELDS = ['image_paths']`; `buildDriverMobilePayload` emits `image_paths: string[]`.

- [ ] **Step 1: Update the failing test**

In `lib/driver-mobiles/fields.test.ts`, DELETE the existing test at lines 45-47 (`passes image_path through as trimmed text, empty → null`) and add:

```ts
  it('normalises image_paths into a clean ordered array', () => {
    expect(buildDriverMobilePayload({ image_paths: ['2026/a.jpg', ' 2026/b.jpg '] }).image_paths).toEqual([
      '2026/a.jpg',
      '2026/b.jpg',
    ]);
  });

  it('coerces junk image_paths input to an empty array', () => {
    expect(buildDriverMobilePayload({ image_paths: 'not-an-array' }).image_paths).toEqual([]);
    expect(buildDriverMobilePayload({ image_paths: ['', '  '] }).image_paths).toEqual([]);
  });

  it('omits image_paths entirely when the key is absent (partial update)', () => {
    expect('image_paths' in buildDriverMobilePayload({ brand: 'Nokia' })).toBe(false);
  });

  it('no longer writes the removed image_path column', () => {
    expect('image_path' in buildDriverMobilePayload({ image_path: '2026/a.jpg' })).toBe(false);
  });
```

Also ensure the file's import line includes whatever it already imports — do not change it otherwise.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/driver-mobiles/fields.test.ts`
Expected: FAIL — `image_paths` is `undefined` and `image_path` is still written.

- [ ] **Step 3: Apply the implementation**

In `lib/driver-mobiles/fields.ts`:

Add the import at the top, below the existing comment block (RELATIVE — vitest has no `@/` alias):

```ts
import { normalizeImagePaths } from './images';
```

Replace the `TEXT_FIELDS` block (currently ending `'handover_by', 'image_path',`) with:

```ts
export const TEXT_FIELDS = [
  'brand', 'model', 'color', 'imei', 'notes',
  'sim_number', 'phone_number', 'network_provider',
  'supplier_name', 'invoice_number',
  'storage_capacity', 'serial_number', 'accessories',
  'handover_by',
] as const;

// Array-valued columns. Mirrors lib/fees/fields.ts's ARRAY_FIELDS convention.
export const ARRAY_FIELDS = ['image_paths'] as const;
```

Add `ARRAY_FIELDS` to the `EDITABLE` spread:

```ts
export const EDITABLE: readonly string[] = [
  ...Object.keys(ENUM_FIELDS), ...NUM_FIELDS, ...DATE_FIELDS, ...UUID_FIELDS, ...TEXT_FIELDS,
  ...ARRAY_FIELDS,
];
```

And inside `buildDriverMobilePayload`, directly after the `UUID_FIELDS` loop, add:

```ts
  for (const k of ARRAY_FIELDS) if (has(k)) out[k] = normalizeImagePaths(body[k]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/driver-mobiles/`
Expected: PASS — both `images.test.ts` and `fields.test.ts` green.

Run: `npx tsc --noEmit 2>&1 | grep driver-mobiles`
Expected: ZERO lines.

- [ ] **Step 5: Commit**

```bash
git add lib/driver-mobiles/fields.ts lib/driver-mobiles/fields.test.ts
git commit -m "feat(driver-mobiles): whitelist image_paths as an array field"
```

---

### Task 4: Read paths return image_urls[]

**Files:**
- Modify: `app/api/admin/driver-mobiles/route.ts:58,63,78` (list)
- Modify: `app/api/admin/driver-mobiles/[id]/route.ts:59-66` (detail)

**Interfaces:**
- Consumes: `image_paths` from Task 1.
- Produces: both routes return `image_urls: (string | null)[]` per record; the singular `image_url` is removed.

- [ ] **Step 1: Update the list route**

In `app/api/admin/driver-mobiles/route.ts`, replace line 58 with:

```ts
    const list = (rows ?? []) as { driver_staff_id: string; route_id: string | null; image_paths: string[] | null }[];
```

Replace the batch-sign block (lines 62-70) with:

```ts
    // Batch-sign every phone photo across every row in ONE round trip.
    // Keyed by PATH, never by position — with N images per row an index-based
    // map would silently render one phone's photo on another phone's card.
    const imagePaths = [...new Set(list.flatMap((r) => r.image_paths ?? []).filter(Boolean))];
    const signed = new Map<string, string>();
    if (imagePaths.length) {
      const { data: urls } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).createSignedUrls(imagePaths, 3600);
      for (const u of urls ?? []) {
        if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
      }
    }
```

Replace line 78 (`image_url: ...`) with:

```ts
      // A path that fails to sign yields null in place, so the array stays
      // aligned with image_paths instead of shifting.
      image_urls: (r.image_paths ?? []).map((p) => signed.get(p) ?? null),
```

- [ ] **Step 2: Update the detail route**

In `app/api/admin/driver-mobiles/[id]/route.ts`, replace lines 59-64 with:

```ts
    const paths = ((row as { image_paths?: string[] | null }).image_paths ?? []).filter(Boolean);
    let image_urls: (string | null)[] = [];
    if (paths.length) {
      const { data: signedList } = await supabase.storage
        .from(DRIVER_MOBILE_IMAGE_BUCKET)
        .createSignedUrls(paths, 3600);
      const byPath = new Map<string, string>();
      for (const u of signedList ?? []) {
        if (u.path && u.signedUrl) byPath.set(u.path, u.signedUrl);
      }
      image_urls = paths.map((p) => byPath.get(p) ?? null);
    }
```

And replace the response line (66) with:

```ts
    return NextResponse.json({ success: true, data: { ...row, driver_name, driver_phone, route_number, route_name, image_urls } });
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit 2>&1 | grep "api/admin/driver-mobiles"`
Expected: ZERO lines.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/driver-mobiles/route.ts "app/api/admin/driver-mobiles/[id]/route.ts"
git commit -m "feat(driver-mobiles): sign and return all phone photos per record"
```

---

### Task 5: Write paths — cap enforcement and storage reconciliation

The only task that deletes real files. `PUT` and `DELETE` already load the prior row, so no extra query is needed.

**Files:**
- Modify: `app/api/admin/driver-mobiles/route.ts` — `postDriverMobile` (~87), `putDriverMobile` (~133), `deleteDriverMobile` (~180)

**Interfaces:**
- Consumes: `exceedsImageCap`, `removedPaths` (Task 2); `DRIVER_MOBILE_IMAGE_BUCKET` (existing).
- Produces: 400 on an over-cap list; storage objects deleted after a successful `PUT`/`DELETE`.

- [ ] **Step 1: Add the imports**

At the top of `app/api/admin/driver-mobiles/route.ts`, extend the existing `lib/driver-mobiles/fields` import line to keep `DRIVER_MOBILE_IMAGE_BUCKET`, and add:

```ts
import { exceedsImageCap, removedPaths, MAX_DRIVER_MOBILE_IMAGES } from '@/lib/driver-mobiles/images';
```

- [ ] **Step 2: Reject an over-cap list in POST and PUT**

In BOTH `postDriverMobile` and `putDriverMobile`, immediately after the payload is built by `buildDriverMobilePayload` and before the database write, add:

```ts
    if (Array.isArray(payload.image_paths) && exceedsImageCap(payload.image_paths as string[])) {
      return NextResponse.json(
        { error: `At most ${MAX_DRIVER_MOBILE_IMAGES} images are allowed` },
        { status: 400 },
      );
    }
```

- [ ] **Step 3: Reconcile storage in PUT**

In `putDriverMobile`, the handler already loads `before` (around line 148). Capture its paths right after that load:

```ts
    const beforePaths = ((before as { image_paths?: string[] | null } | null)?.image_paths) ?? [];
```

Then, AFTER the update has succeeded (after the existing error check on the update, and before the success response), add:

```ts
    // Delete files only once the row is safely updated — a failed write must
    // never destroy an image the record still references. Removal is derived
    // from the diff, so cancelling a form destroys nothing.
    if ('image_paths' in payload) {
      const gone = removedPaths(beforePaths, (payload.image_paths as string[]) ?? []);
      if (gone.length) {
        const { error: rmErr } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).remove(gone);
        // Non-fatal: the row is already correct. A leaked object beats a failed save.
        if (rmErr) console.error('Driver mobile image cleanup failed:', rmErr.message, gone);
      }
    }
```

- [ ] **Step 4: Purge storage in DELETE**

In `deleteDriverMobile`, the handler already loads `existing` (around line 189). Capture its paths right after that load:

```ts
    const doomedPaths = ((existing as { image_paths?: string[] | null } | null)?.image_paths) ?? [];
```

Then, AFTER the row delete has succeeded, add:

```ts
    if (doomedPaths.length) {
      const { error: rmErr } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).remove(doomedPaths);
      if (rmErr) console.error('Driver mobile image purge failed:', rmErr.message, doomedPaths);
    }
```

- [ ] **Step 5: Verify types and the suite**

Run: `npx tsc --noEmit 2>&1 | grep "api/admin/driver-mobiles"`
Expected: ZERO lines.

Run: `npm test`
Expected: full suite green (no test targets this route directly; the point is proving no regression).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/driver-mobiles/route.ts
git commit -m "feat(driver-mobiles): cap image count and reconcile storage on save"
```

---

### Task 6: Form — multi-file upload with thumbnail grid

**Files:**
- Modify: `app/(admin)/driver-mobiles/driver-mobile-form.tsx:37,45,79-118,166`
- Modify: `app/(admin)/driver-mobiles/[id]/edit/page.tsx:87`

**Interfaces:**
- Consumes: `MAX_DRIVER_MOBILE_IMAGES` (Task 2); `POST /api/admin/driver-mobiles/image` (existing, unchanged).
- Produces: the form submits `image_paths: string[]`.

- [ ] **Step 1: Switch the form value to an array**

In `driver-mobile-form.tsx`:

Add the import:

```ts
import { MAX_DRIVER_MOBILE_IMAGES } from '@/lib/driver-mobiles/images';
```

Change the `FormValues` field at line 37 from `image_path: string;` to:

```ts
  image_paths: string[];
```

Change the initial value at line 45 from `image_path: ''` to:

```ts
  handover_by: '', handover_date: '', image_paths: [],
```

Replace the single-preview state with a path→url map. **Line 61** currently reads:

```ts
  const [imagePreview, setImagePreview] = useState<string | null>(null);
```

Replace that one line with:

```ts
  const [imagePreviews, setImagePreviews] = useState<Record<string, string | null>>({});
```

(Leave `uploadingImage` on line 60 exactly as it is — it is still used.)

- [ ] **Step 2: Replace the preview effect**

Replace the whole `useEffect` at lines 79-87 with:

```ts
  // Edit mode: fetch a signed preview url for each existing image.
  useEffect(() => {
    const paths = initial?.image_paths ?? [];
    if (!paths.length) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        paths.map(async (p) => [p, await fetchPreviewUrl(p)] as const),
      );
      if (!cancelled) setImagePreviews(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: Replace the pick and remove handlers**

Replace `onPickImage` (lines 89-113) and `onRemoveImage` (lines 115-118) with:

```ts
  const onPickImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file after a remove
    if (!files.length) return;

    const remaining = MAX_DRIVER_MOBILE_IMAGES - form.image_paths.length;
    if (remaining <= 0) {
      toast.error(`At most ${MAX_DRIVER_MOBILE_IMAGES} images`);
      return;
    }
    const accepted = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`Only ${remaining} more image${remaining === 1 ? '' : 's'} allowed`);
    }

    setUploadingImage(true);
    try {
      for (const file of accepted) {
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
          // Append immediately so one bad file cannot discard the good ones.
          setForm((f) => ({ ...f, image_paths: [...f.image_paths, json.path] }));
          const url = await fetchPreviewUrl(json.path);
          setImagePreviews((m) => ({ ...m, [json.path]: url }));
        } catch (err) {
          toast.error(err instanceof Error ? `${file.name}: ${err.message}` : 'Upload failed');
        }
      }
      toast.success('Images uploaded');
    } finally {
      setUploadingImage(false);
    }
  };

  const onRemoveImage = (path: string) => {
    // Only drops the reference. The server deletes the file on save, so
    // cancelling this form leaves the stored image untouched.
    setForm((f) => ({ ...f, image_paths: f.image_paths.filter((p) => p !== path) }));
    setImagePreviews((m) => {
      const next = { ...m };
      delete next[path];
      return next;
    });
  };
```

- [ ] **Step 4: Replace the upload widget markup**

The current widget spans roughly **lines 262-303**: a `<input type="file">` at line 268 with
`onChange={onPickImage}` at line 270, then a `{imagePreview ? (...) : (...)}` block starting at
line 273 that renders one 24×24 `<img>` (line 276) with "Replace" (284) and remove (288) buttons.
Replace that whole widget — input and conditional preview block together — with:

```tsx
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Phone photos</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onPickImages}
            disabled={uploadingImage || form.image_paths.length >= MAX_DRIVER_MOBILE_IMAGES}
            className="block w-full text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {form.image_paths.length} of {MAX_DRIVER_MOBILE_IMAGES} used · JPG, PNG or WEBP, up to 5MB each.
            The first image is used as the cover.
          </p>

          {form.image_paths.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {form.image_paths.map((path, i) => (
                <div key={path} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreviews[path] ?? ''}
                    alt={i === 0 ? 'Cover handover photo' : `Handover photo ${i + 1}`}
                    className="h-24 w-24 rounded border border-gray-200 object-cover dark:border-gray-700"
                  />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveImage(path)}
                    aria-label="Remove image"
                    className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs text-white hover:bg-red-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 5: Submit the array**

Change the payload line 166 from `image_path: form.image_path || null,` to:

```ts
        image_paths: form.image_paths,
```

- [ ] **Step 6: Feed the edit page**

In `app/(admin)/driver-mobiles/[id]/edit/page.tsx`, change line 87 from `image_path: m.image_path ?? '',` to:

```ts
          image_paths: m.image_paths ?? [],
```

- [ ] **Step 7: Verify types**

Run: `npx tsc --noEmit 2>&1 | grep -E "driver-mobile-form|driver-mobiles/\[id\]/edit"`
Expected: ZERO lines.

- [ ] **Step 8: Commit**

```bash
git add "app/(admin)/driver-mobiles/driver-mobile-form.tsx" "app/(admin)/driver-mobiles/[id]/edit/page.tsx"
git commit -m "feat(driver-mobiles): multi-file photo upload with thumbnail grid"
```

---

### Task 7: List column and detail gallery

**Files:**
- Modify: `app/(admin)/driver-mobiles/columns.tsx:40` and its Photo cell
- Modify: `app/(admin)/driver-mobiles/[id]/page.tsx` (Handover card image)

**Interfaces:**
- Consumes: `image_urls: (string | null)[]` (Task 4).
- Produces: cover thumbnail + `+N` badge in the list; a gallery on the detail page.

- [ ] **Step 1: Update the row type**

In `columns.tsx`, lines 40-41 currently read:

```ts
  image_path: string | null;
  image_url: string | null;
```

Replace BOTH lines with:

```ts
  image_paths: string[] | null;
  image_urls: (string | null)[] | null;
```

- [ ] **Step 2: Update the Photo cell**

The Photo column's header is at line 112; its `cell` begins at line 113 and currently renders
`row.original.image_url ? (<img src={row.original.image_url} … />) : …`. Replace that `cell`
property with:

```tsx
      cell: ({ row }) => {
        const urls = (row.original.image_urls ?? []).filter((u): u is string => !!u);
        if (!urls.length) return <span className="text-gray-400">—</span>;
        return (
          <div className="flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urls[0]}
              alt="Handover phone photo"
              className="h-9 w-9 rounded border border-gray-200 object-cover dark:border-gray-700"
            />
            {urls.length > 1 && (
              <span className="rounded bg-gray-100 px-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                +{urls.length - 1}
              </span>
            )}
          </div>
        );
      },
```

- [ ] **Step 3: Update the detail gallery**

In `app/(admin)/driver-mobiles/[id]/page.tsx`, the "Handover" `SectionCard` starts at line 86. Its
image render begins around line 93 as `m.image_url ? (<a href={m.image_url} target="_blank"
rel="noopener noreferrer"><img src={m.image_url} … /></a>) : …`.

**Keep the click-to-open-full-size `<a>` wrapper** — it is existing behaviour and still useful with
a gallery. Replace that conditional render with:

```tsx
        {(() => {
          const urls = (m.image_urls ?? []).filter((u): u is string => !!u);
          if (!urls.length) return <span className="text-gray-400">No photos</span>;
          return (
            <div className="flex flex-wrap gap-3">
              {urls.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={i === 0 ? 'Cover handover photo' : `Handover photo ${i + 1}`}
                    className="h-32 w-32 rounded border border-gray-200 object-cover dark:border-gray-700"
                  />
                </a>
              ))}
            </div>
          );
        })()}
```

> Note the accessor is `m`, not `data` — that is the variable this page already uses for the record.

Also update the detail page's local record type so `image_urls: (string | null)[] | null` replaces
`image_url` (and drop `image_path` if it is declared there).

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit 2>&1 | grep "driver-mobiles"`
Expected: ZERO lines.

- [ ] **Step 5: Confirm no `image_path` or `image_url` references survive**

Run: `grep -rn "image_path\b\|image_url\b" --include=*.ts --include=*.tsx app lib`
Expected: no matches other than `image_paths` / `image_urls`. Any leftover singular reference is a bug — fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/driver-mobiles/columns.tsx" "app/(admin)/driver-mobiles/[id]/page.tsx"
git commit -m "feat(driver-mobiles): cover thumbnail with count badge and detail gallery"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: baseline + 14 new tests from Task 2, plus the reworked `fields.test.ts` cases. Record the baseline by running `npm test` on `origin/main` BEFORE starting Task 1 rather than trusting a remembered number.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds. This is the real gate — `tsc` is chronically red repo-wide and `next build` has `ignoreBuildErrors: true`.

> If the build fails on a Turbopack panic caused by this worktree's `node_modules`, retry with `npm run build -- --webpack`. That is a known environment artifact in worktrees, not a code fault.

- [ ] **Step 3: Confirm the database matches the code**

Via the Supabase MCP `execute_sql` tool:

```sql
select image_paths, cardinality(image_paths) as n
from tms_driver_mobile;
```

Expected: every row returns an array (never NULL), `n` ≤ 5.

- [ ] **Step 4: Hand over for the human smoke test**

Auth-gated UI cannot be verified headlessly. Report to the user that they should, on `/driver-mobiles`:
1. Create a phone, upload 3 photos, save, and confirm the list shows a cover plus `+2`.
2. Edit it, remove one photo, save, and confirm the detail gallery shows 2.
3. Confirm the 6th upload is refused.
4. Edit, remove a photo, then **cancel** — and confirm the photo is still present afterwards (this is the reconcile-on-save guarantee).

- [ ] **Step 5: Push and open the PR (only if the user asks)**

```bash
git push -u origin feat/driver-mobile-multi-image
gh pr create --title "feat(driver-mobiles): multiple handover photos per phone" --body "$(cat <<'EOF'
Tracking Mobiles now holds up to 5 handover photos per phone.

- `image_path` replaced by an ordered `image_paths text[]`, capped at 5 in the
  database, the API and the UI
- storage deletion reconciles on SAVE (`removed = old - new`), so cancelling a
  form never destroys a referenced file
- signed URLs are mapped back keyed by path, never by position

KNOWN LIMITATION: a file uploaded and then abandoned without saving is still
orphaned; a bucket sweep is out of scope.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> Requires `gh auth switch --user sangeethav-byte` to push to JKKN-Institutions/TMS-ADMIN.

---

## Notes for the implementer

- The upload endpoint `app/api/admin/driver-mobiles/image/route.ts` needs **no changes** — it already uploads one file and returns a path not keyed to the record id. Only its line-29 comment mentions `image_path`; updating that comment is optional tidying.
- `fetchPreviewUrl` in the form is deliberately non-throwing so a preview failure cannot mask a successful upload. Preserve that.
- `<img>` is used rather than `next/image` because these are short-lived signed URLs. Keep it, and keep the eslint-disable comments.
- Solid coloured tints need explicit `dark:` variants in this codebase (Tailwind v4 retrofit) — every snippet above already includes them.
