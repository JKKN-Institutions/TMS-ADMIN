# Tracking Mobiles — Multiple Image Upload — Design

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/driver-mobile-multi-image` (worktree `D:/Sangeetha_V/TMS-ADMIN-wt-mobiles`, off `origin/main` `7edcc68`)

## Problem

The Tracking Mobiles module (`/driver-mobiles`, table `tms_driver_mobile`) gained a **single**
handover photo in increment 3 — `image_path text`, a private bucket, and short-lived signed URLs.
One photo is not enough to document a handover: staff need the front, back, IMEI label, box, and any
existing damage.

**Required:** let one phone record hold up to **5** images.

## Decisions (confirmed with the user)

| Question | Decision |
|---|---|
| Max images per phone | **5**, enforced client *and* server side |
| Per-image labels/captions | **No** — an ordered list of paths, no child table |
| Cover image / reordering | **First upload is the cover**; no drag-to-reorder |
| File removed from a record | **Deleted from storage** |

## Verified current state

Checked against the live database and the `origin/main` tree on 2026-07-21.

- **No data to migrate.** `tms_driver_mobile` holds **1 row** and **0** rows have a non-empty
  `image_path`. The column can be reshaped without back-fill risk.
- **The upload endpoint is already multi-ready.** `POST /api/admin/driver-mobiles/image`
  (`app/api/admin/driver-mobiles/image/route.ts`) takes one `file`, validates ≤5MB and
  jpeg/png/webp, writes to `{year}/{uuid}-{safeName}`, and returns `{path}`. The path is
  deliberately **not** keyed to the record id, so upload-before-save works on the create form.
  Multiple images = call it once per file and keep the returned paths.
- **`ARRAY_FIELDS` already exists as a pattern** in `lib/fees/fields.ts:13,33` — the whitelist
  mechanism for array columns is established and should be mirrored, not reinvented.
- **Every `image_path` touchpoint** (8 files):
  - `lib/driver-mobiles/fields.ts:25` (in `TEXT_FIELDS`)
  - `lib/driver-mobiles/fields.test.ts:45-47`
  - `app/api/admin/driver-mobiles/route.ts:58,63,78` (list read + batch sign)
  - `app/api/admin/driver-mobiles/[id]/route.ts:60` (detail read)
  - `app/api/admin/driver-mobiles/image/route.ts:29` (comment only)
  - `app/(admin)/driver-mobiles/columns.tsx:40` (row type)
  - `app/(admin)/driver-mobiles/driver-mobile-form.tsx:37,45,81,105,116,166`
  - `app/(admin)/driver-mobiles/[id]/edit/page.tsx:87`

## Design

### Schema

Replace the scalar with an array on `tms_driver_mobile`:

```sql
alter table public.tms_driver_mobile
  add column if not exists image_paths text[] not null default '{}';

-- Back-fill (defensive; 0 rows qualify today) then drop the scalar.
update public.tms_driver_mobile
   set image_paths = array[image_path]
 where image_path is not null and image_path <> '';

alter table public.tms_driver_mobile drop column if exists image_path;

alter table public.tms_driver_mobile
  add constraint tms_driver_mobile_image_paths_max
  check (coalesce(cardinality(image_paths), 0) <= 5);
```

> `cardinality()` not `array_length()` — the latter returns NULL for an empty array, which would
> make the CHECK evaluate to NULL and silently pass for reasons unrelated to the cap.

A hard replace (rather than keeping both columns) avoids a dual source of truth where a later
reader has to decide which column wins.

### Write path

`lib/driver-mobiles/fields.ts`: drop `image_path` from `TEXT_FIELDS`; add a new `ARRAY_FIELDS`
containing `image_paths`, mirroring `lib/fees/fields.ts`. Normalisation: coerce to an array,
keep only non-empty strings, trim, and reject more than 5 entries. The server cap is the real
control — a client-side limit is a convenience, not a guarantee.

### Deletion — reconcile on save, not on click

The naive approach (click ✕ → immediately `DELETE` the file) is wrong: if the user then **cancels
the form**, the saved record still references a file that has already been destroyed, producing a
permanently broken image from an action the user explicitly abandoned.

Instead the server reconciles:

- **On `PUT`** — read the row's existing `image_paths`, compute `removed = old − new`, update the
  row, and only then delete the removed objects from storage.
- **On record `DELETE`** — delete every object in `image_paths` after the row is deleted.

Storage deletion always happens **after** the database write succeeds, so a failed update never
destroys a file the record still points at.

**Accepted limitation:** a user who uploads and then abandons the form *without saving* still
orphans that object. Closing that needs a sweep job over the bucket, which is out of scope here.
This is a pre-existing gap in the module, not one introduced by this change.

### Read path

Both read routes must batch-sign **all** paths across **all** rows in a single `createSignedUrls`
call and map results back **keyed by path**, returning `image_urls: string[]` per row (order
matching `image_paths`).

The existing singular `image_url` field is **removed**, not kept alongside — same reasoning as the
column: two fields meaning "the photo" invites a later reader to pick the wrong one. Consumers
(`columns.tsx`, the detail page) move to `image_urls[0]` for the cover. The API is admin-internal
with no external clients, so there is nothing to deprecate gracefully.

> This is the sharpest correctness risk in the change. The module's history already records a
> photo/row mis-assignment hazard; moving from one image per row to N is precisely where an
> index-based mapping starts silently rendering one phone's photo on another phone's card. Key by
> path, never by position in the signed-URL result.

A path that fails to sign yields `null` for that slot rather than shifting the array.

### UI

- **Form** (`driver-mobile-form.tsx`) — `<input type="file" multiple>`; each selected file uploads
  immediately via the existing endpoint; a thumbnail grid renders the uploaded images with a remove
  control on each; the input is disabled once 5 are present and the remaining allowance is shown.
- **List** (`columns.tsx`) — the Photo column renders the first image with a `+N` badge when more
  exist.
- **Detail** (`[id]/page.tsx`) — the Handover card becomes a gallery of all images.

### Error handling

- Upload failures surface per-file; one failed file must not discard the successfully uploaded ones.
- Preview/signed-URL failure must not mask a successful upload (the existing form already uses a
  non-throwing `fetchPreviewUrl` helper for this reason — preserve that behaviour).
- Storage deletion failure during reconciliation is logged, not fatal: the row is already correct,
  and a leaked object is strictly better than a failed save.
- Exceeding the cap returns a 400 from the API even if the UI allowed it.

### Testing

- `lib/driver-mobiles/fields.test.ts` — extend for `image_paths`: accepts a valid list, strips empty
  strings, rejects non-string entries, rejects >5, and treats a missing value as `[]`.
- Extract the gallery add/remove/cap rules into a small pure helper so they are unit-tested directly
  rather than only through the form.
- A unit test for the `removed = old − new` set difference, since that computation is what decides
  whether a real file gets destroyed.

## Out of scope

- Reordering or choosing a cover image beyond "first is cover".
- Per-image captions or metadata.
- A storage sweep for objects orphaned by abandon-before-save.
- The module's pre-existing follow-ups: drivers `DELETE` 500 on unmapped `23503`, the form's missing
  `queryClient.invalidateQueries`, and the detail `<img alt>` wording.
