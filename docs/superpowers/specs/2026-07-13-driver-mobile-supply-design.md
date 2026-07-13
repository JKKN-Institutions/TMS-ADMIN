# Driver Mobile Supply — Design Spec

**Date:** 2026-07-13
**Branch:** `feat/driver-mobile-supply`
**Status:** Approved (design), pending implementation plan

## 1. Purpose

Give the transport office a place to record and manage the **mobile phones supplied to
drivers** — each physical phone's full details (brand, model, color, IMEI, SIM/number,
procurement, specs) and which driver it is currently supplied to. Admin-only.

## 2. Scope

### In scope
- A new admin CRUD module `Driver Mobiles` (list, create, edit, detail).
- One new table `tms_driver_mobile` (each row = one physical phone assigned to a driver).
- Dedicated permission keys, RLS, activity-log audit, sidebar nav entry.

### Out of scope (deferred, not built now)
- Driver-portal self-view (a driver seeing their own supplied phone).
- Assignment/return **history** table (audit trail of every reassignment over time).
- Bulk import/export (Excel/CSV).
- Photo/attachment upload for the device.

## 3. Approach

Follow the app's **modern** module pattern (the same vertical slice as Vehicles /
GPS Devices), NOT the legacy `DatabaseService` path:

- Standalone `tms_`-prefixed table.
- API via `withAuth` + `requirePerm('tms.driver_mobiles.*')` over a service-role client.
- Matching **RLS** policies on the table (defense in depth for direct PostgREST access).
- UI via the shared `DataTable` engine + a `columns.tsx` factory + in-module pages.
- Every mutation logged via `logActivity` under a new `driver-mobiles` activity module.

Rationale: this is the pattern the newest modules use and the one `scaffold-tms-module`
automates, so the build maps onto a known, repeatable sequence with real permission
enforcement (avoids the "authorization gap" affecting older service-role routes).

## 4. Data model

### Table `tms_driver_mobile`

| Group | Columns |
|---|---|
| Identity/link | `id` uuid pk; `driver_id` uuid **NOT NULL** FK → `tms_driver(id)` |
| Core details | `brand` text; `model` text; `color` text; `imei` text; `status` text; `supplied_date` date; `notes` text |
| SIM & number | `sim_number` text; `phone_number` text; `network_provider` text |
| Procurement | `purchase_date` date; `purchase_cost` numeric(12,2); `supplier_name` text; `invoice_number` text; `warranty_expiry` date |
| Physical & specs | `condition` text; `storage_capacity` text; `serial_number` text; `accessories` text |
| Audit | `created_at` timestamptz default now(); `updated_at` timestamptz (trigger `tms_set_updated_at`); `created_by` uuid; `updated_by` uuid |

### Enumerations (CHECK constraints)
- `status IN ('assigned','returned','damaged','lost')`, default `'assigned'`.
- `condition IN ('new','used','refurbished')`, nullable.

### Constraints & indexes
- FK `driver_id → tms_driver(id) ON DELETE RESTRICT` — a driver holding a phone cannot be
  hard-deleted until the phone is reassigned or marked returned. Protects asset records.
- Partial unique index on `imei WHERE imei IS NOT NULL` — blocks entering the same physical
  device twice.
- Index on `driver_id`; index on `status`.

### Driver name resolution
`tms_driver` links to `staff` via `staff_id`; `staff` owns the name. The list/detail resolve
the driver's display name by joining `tms_driver → staff` (embed or a mapped fetch, matching
how other admin routes resolve staff names). The module stores only `driver_id` (FK) — no
free-text driver name, so names never drift.

## 5. Permissions

New keys, added to `lib/constants/tms-permissions.ts` (`TMS_PERMISSIONS`), seeded in the
migration and granted to **super admin** + **transport head** by default:

- `tms.driver_mobiles.view`
- `tms.driver_mobiles.create`
- `tms.driver_mobiles.edit`
- `tms.driver_mobiles.delete`

RLS policies on `tms_driver_mobile`:
- SELECT: `is_super_admin() OR user_has_permission('tms.driver_mobiles.view')`
- INSERT/UPDATE/DELETE: gated by the corresponding create/edit/delete keys (or a single
  write key — decided in the plan; mirror the closest existing module).

## 6. API

Modern routes, service-role client, `requirePerm`-gated, `{ success, data }` / `{ error }`
response shape, `42P01` empty-table guard, `logActivity` on every mutation.

- `app/api/admin/driver-mobiles/route.ts`
  - `GET` — list all, with driver names resolved.
  - `POST` — create (`requirePerm('tms.driver_mobiles.create')`).
  - `PUT` — update by id (`...edit`).
  - `DELETE` — delete by id query param (`...delete`).
- `app/api/admin/driver-mobiles/[id]/route.ts`
  - `GET` — single record (feeds detail + edit pages).
- `lib/driver-mobiles/fields.ts` — write-whitelist + `buildDriverMobilePayload()` (single
  normalize path for create/update, like `lib/vehicles/fields.ts`).

Driver picker source: reuse the existing drivers list endpoint (`/api/admin/drivers`) so
only real, onboarded `tms_driver` records are selectable.

## 7. UI (admin pages)

- `app/(admin)/driver-mobiles/page.tsx` — list shell: stat tiles
  (total / assigned / returned / damaged+lost) + `<DataTable>`.
- `app/(admin)/driver-mobiles/columns.tsx` — columns: **Phone** (brand + model),
  **Driver**, **Phone number**, **IMEI**, **Status** (colored badge), **Supplied date**,
  actions menu (View / Edit / Delete). Sort + filter + global search + pagination.
- `app/(admin)/driver-mobiles/new/page.tsx` and `[id]/edit/page.tsx` — wrappers around a
  shared `driver-mobile-form.tsx` (fields grouped into the 4 sections; driver dropdown).
- `app/(admin)/driver-mobiles/driver-mobile-api.ts` — client fetcher + React Query key.
- `app/(admin)/driver-mobiles/[id]/page.tsx` — read-only detail (SectionCards per group)
  with a permission-gated Edit button.

## 8. Cross-cutting wiring

- **Nav:** add `Driver Mobiles` to `lib/navigation.ts` — group `transport` (beside Drivers /
  Vehicles / GPS Devices), gated by `tms.driver_mobiles.view`, icon `Smartphone`.
- **Activity log:** register a `driver-mobiles` module + create/update/delete actions in the
  `activity-log/columns.tsx` module/action maps.

## 9. Testing & verification

- Vitest unit test for `buildDriverMobilePayload()` — type coercion (numeric/date), whitelist
  enforcement (ignores unknown keys), partial-update behavior (only present keys included),
  enum clamping (`status`/`condition`).
- Manual `tsc --noEmit` filtered to changed files (project build gate `ignoreBuildErrors` is
  on; ESLint is broken — so tsc + tests are the real gate).
- Dev-server route probes on the new endpoints (auth redirect / 200 shape).

## 10. Migration

New migration `supabase/migrations/2026071x000000_create_tms_driver_mobile.sql`:
- `create table tms_driver_mobile` (+ CHECKs, FK, indexes, partial-unique IMEI).
- `tms_set_updated_at` trigger (function already exists).
- Enable RLS + policies.
- Seed the 4 permission keys and grant to super admin + transport head (mirror existing
  `seed_*_permissions` migrations).
- Applied to shared Supabase project `kvizhngldtiuufknvehv` via MCP; file committed under
  `supabase/migrations/`.

## 11. Open decisions for the plan
- Single write RLS key vs. per-action RLS keys (mirror closest module).
- Whether `purchase_cost` is shown in the list or detail-only.
- Exact `Smartphone` icon import name from `lucide-react`.
