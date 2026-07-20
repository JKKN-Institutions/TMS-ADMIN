# Tracking Mobiles — phone image + handover columns

**Date:** 2026-07-20
**Module:** Tracking Mobiles (`/driver-mobiles`, table `tms_driver_mobile`, perms `tms.driver_mobiles.*`, activity key `driver-mobiles`)
**Status:** Design approved — pending implementation plan

## Goal

Add three fields to the Tracking Mobiles module so a supplied phone records **who handed it over, when, and a photo of the device**:

| DB column       | Type   | Source        | Shown in list? |
| --------------- | ------ | ------------- | -------------- |
| `image_path`    | `text` | file upload   | yes (thumbnail) |
| `handover_by`   | `text` | free text     | yes            |
| `handover_date` | `date` | date input    | as subtext under handover-by |

The **two** columns the user asked to see in the table are **Photo** and **Handover by**; `handover_date` rides along as muted subtext in the list plus its own field on the form and detail page, to keep the list uncluttered.

## Non-goals (YAGNI)

- No `handover_to` — the receiver is already the row's `driver_staff_id`.
- No staff-FK for `handover_by` — decided to be free text (the person may not be a system staff user).
- No multiple images — one photo per phone.
- No public bucket / public URLs — private bucket + signed URLs only.

## Design

### 1. Database migration

File: `supabase/migrations/20260720000000_driver_mobile_handover.sql`

```sql
alter table tms_driver_mobile
  add column if not exists image_path    text,   -- storage path, NOT a public url
  add column if not exists handover_by   text,
  add column if not exists handover_date date;

insert into storage.buckets (id, name, public)
values ('tms-driver-mobile-images', 'tms-driver-mobile-images', false)
on conflict (id) do nothing;
```

Private bucket; every read/write goes through service-role endpoints, so no storage RLS policies are required (identical model to `tms-vehicle-documents`). Migration is applied to the live DB (`kvizhngldtiuufknvehv`) **and** committed under `supabase/migrations/`.

### 2. Image upload endpoint (new)

File: `app/api/admin/driver-mobiles/image/route.ts` — a driver-mobiles-scoped near-copy of `app/api/admin/vehicles/documents/route.ts`.

- **Bucket:** `tms-driver-mobile-images`
- **Constraints:** allowed `image/jpeg`, `image/png`, `image/webp`; max **5 MB**.
- **POST** (multipart, field `file`): gated on `tms.driver_mobiles.create` OR `tms.driver_mobiles.edit`. Uploads to `{year}/{uuid}-{safeName}` (path not keyed on record id, so it works for both create and edit). Returns `{ success: true, path }`. Logs activity `module:'driver-mobiles', action:'upload'` (both already valid in the closed unions).
- **GET** `?path=…`: gated on `tms.driver_mobiles.view`. Returns `{ success: true, url }` — a 1-hour signed URL. (Primarily for the form's live preview.)

### 3. Write whitelist — `lib/driver-mobiles/fields.ts`

- Add `handover_by`, `image_path` to `TEXT_FIELDS`.
- Add `handover_date` to `DATE_FIELDS`.

No other change to the create/update API — everything already funnels through `buildDriverMobilePayload`, which trims text and null-coerces empty strings/dates.

### 4. Read APIs attach a signed `image_url`

- **List** (`app/api/admin/driver-mobiles/route.ts`): after fetching rows, collect all non-null `image_path`s and batch-sign them in **one** `supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)` call; map `image_url` onto each row (mirrors the existing driver-name / route resolution). Rows without an image get `image_url: null`.
- **Detail** (`app/api/admin/driver-mobiles/[id]/route.ts`): sign the single `image_path` (if present) and add `image_url` to the returned object.

Signed URLs expire in 1h; both endpoints are `cache: 'no-store'` and refetched per view, so expiry is a non-issue.

### 5. Form — `app/(admin)/driver-mobiles/driver-mobile-form.tsx`

Add a new **"Handover"** section card containing:

- **Handover by** — text input → `handover_by`
- **Handover date** — `type="date"` input → `handover_date`
- **Phone image** — file input that uploads on select:
  1. On file choose → POST to `/api/admin/driver-mobiles/image` → receive `path`.
  2. Store `path` in `form.image_path`; fetch a signed URL (GET `?path=`) to render a thumbnail preview.
  3. **Replace** (choose another file) / **Remove** (clear `image_path` back to `''`).
  4. Uploading state disables submit; upload errors surface via `toast.error`.

`FormValues`, `EMPTY`, and the save `payload` all gain `handover_by`, `handover_date`, `image_path`. In **edit** mode, an existing `image_path` (passed via `initial`) renders its preview on mount.

### 6. List columns — `app/(admin)/driver-mobiles/columns.tsx`

Extend `DriverMobileRow` with `image_path`, `image_url` (signed, may be null), `handover_by`, `handover_date`, then add two columns:

- **Photo** — `image_url` → a small (~40px) rounded thumbnail; `—` when null. Not sortable.
- **Handover by** — `handover_by` text with `handover_date` (formatted) as muted subtext; `—` when empty.

### 7. Detail page — `app/(admin)/driver-mobiles/[id]/page.tsx`

Add a **"Handover"** `SectionCard`:

- **Handover by** (`or(m.handover_by)`)
- **Handover date** (`fmtDate(m.handover_date)`)
- **Phone image** — the thumbnail from `m.image_url`, click to open the full signed URL in a new tab; `—` when absent.

### 8. Permissions & audit

- Reuses existing `tms.driver_mobiles.{view,create,edit,delete}` — no new permissions seeded.
- Image uploads audit-log as `module:'driver-mobiles', action:'upload'`. Both already exist in the closed activity-log unions (the vehicle-documents route already uses `action:'upload'`), so no union edits.

## Files touched

| File | Change |
| ---- | ------ |
| `supabase/migrations/20260720000000_driver_mobile_handover.sql` | new — 3 columns + bucket |
| `app/api/admin/driver-mobiles/image/route.ts` | new — upload + signed-url |
| `lib/driver-mobiles/fields.ts` | +2 TEXT_FIELDS, +1 DATE_FIELD |
| `app/api/admin/driver-mobiles/route.ts` | batch-sign `image_url` in list |
| `app/api/admin/driver-mobiles/[id]/route.ts` | sign `image_url` in detail |
| `app/(admin)/driver-mobiles/driver-mobile-form.tsx` | Handover section + upload widget |
| `app/(admin)/driver-mobiles/columns.tsx` | row type + Photo & Handover-by columns |
| `app/(admin)/driver-mobiles/[id]/page.tsx` | Handover SectionCard |

## Verification

Per project memory, `npm run lint` and `tsc` are unreliable here (ESLint circular config; ~540 chronic tsc errors not gated by build). Verify with:

- `npx tsc --noEmit` scoped to the touched files (new code must not add errors), then `npm run build`.
- Manual smoke test in the user's authenticated browser: create a mobile with a photo + handover fields → confirm thumbnail in list, preview on detail, values persist through edit; verify a >5 MB / non-image upload is rejected.
