# Design Spec: Vehicle Module — Advanced Fields

**Date:** 2026-06-08
**Status:** Approved (design) — pending implementation plan
**Module:** Vehicles Management (`app/(admin)/vehicles`, `app/api/admin/vehicles`, `public.tms_vehicle`)

---

## 1. Background & current state

The Vehicles module is a **modern** TMS module (in-module pages + dedicated API routes + a `tms_`
prefixed table, gated by `withAuth` + service-role + `tms.vehicles.*` permission checks). The legacy
modal components (`components/add-vehicle-modal.tsx`, `edit-vehicle-modal.tsx`,
`vehicle-details-modal.tsx`, `vehicle-form-modal.tsx`) are **dead code** (zero references) and are out
of scope.

**Verified against the live DB** (Supabase project `kvizhngldtiuufknvehv`, which the Supabase MCP also
targets): `public.tms_vehicle` **exists** with exactly the migration's 20 columns and currently holds
**1 row**. Related tables `tms_driver` and `tms_route` both exist (`tms_route.vehicle_id` already links
routes → vehicles).

### Existing `tms_vehicle` columns (20)
`id`, `registration_number` (unique), `model`, `capacity`, `fuel_type` (CHECK), `status` (CHECK),
`insurance_expiry`, `fitness_expiry`, `last_maintenance`, `next_maintenance`, `mileage`,
`purchase_date`, `chassis_number`, `engine_number`, `gps_device_id` (uuid loose ref, no FK),
`live_tracking_enabled`, `created_at`, `updated_at`, `created_by`, `updated_by`.

### The "7 coupled touchpoints" (why adding a field is non-trivial)
The stack is column-name-coupled end to end. Every new field must be threaded through all of:
1. **Migration** — `public.tms_vehicle` columns.
2. **`app/api/admin/vehicles/route.ts`** — `mapCreatePayload` (camelCase in), `EDITABLE` whitelist
   (snake_case), `DATE_FIELDS`.
3. **`app/(admin)/vehicles/vehicle-form.tsx`** — `VehicleFormState`, `EMPTY`, `fromVehicle`, the
   POST/PUT submit payloads, and the form inputs.
4. **`app/(admin)/vehicles/columns.tsx`** — `VehicleRow` interface (+ any new table column).
5. **`app/(admin)/vehicles/[vehicleId]/page.tsx`** — detail view `SectionCard`/`Field`s.
6. **`app/api/admin/vehicles/import/route.ts`** — `pick()` keys + validation/normalisation.
7. **`app/(admin)/vehicles/vehicle-export.ts`** — template columns + a real `exportVehicles()`.

Missing any touchpoint means the field silently fails to save / display / import.

---

## 2. Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope | **Add all proposed fields now** (single additive migration). |
| 2 | Driver assignment | **FK + cached name** (see §4 for the `tms_driver(staff_id)` nuance). |
| 3 | Documents | **Full upload now** — private Storage bucket + server upload route + signed-URL retrieval. |
| 4 | "Required" enforcement | **Form-level only** — DB columns stay nullable (won't break import or the 1 existing row). |

Secondary decisions made during design (recommended, accepted):
- Enum fields use **DB CHECK constraints mirrored by `SelectMenuOption` arrays**, matching the existing
  `fuel_type`/`status` pattern.
- Add `current_odometer` (not in the user's list) — odometer-based maintenance is incomplete without a
  current reading.
- Reuse existing `live_tracking_enabled` as "tracking_status" (do not add a duplicate column).
- Emergency field names follow `tms_driver`: `emergency_contact_name`, `emergency_contact_phone`.
- Document columns store the **storage path**, not a public URL (private bucket).

---

## 3. Data model — new columns on `tms_vehicle`

All new columns are **nullable** (no defaults that require backfill, except booleans). Grouped by form
section:

### Identity
- `vehicle_type` text — CHECK in (`bus`,`van`,`car`,`truck`,`ambulance`,`other`)
- `manufacturer` text
- `model_year` integer
- `color` text
- `gross_vehicle_weight` numeric

### Ownership & purchase
- `ownership_type` text — CHECK in (`owned`,`leased`,`rented`)
- `purchase_cost` numeric
- `vendor_name` text
- `warranty_expiry` date

### Compliance & legal
- `rc_expiry_date` date
- `permit_number` text
- `permit_expiry_date` date
- `pollution_certificate_number` text
- `pollution_expiry_date` date
- `road_tax_expiry_date` date

### Insurance
- `insurance_provider` text
- `insurance_policy_number` text
- `insurance_amount` numeric
- *(`insurance_expiry` already exists)*

### Driver assignment
- `assigned_driver_id` uuid — **FK → `tms_driver(staff_id)` ON DELETE SET NULL** (see §4)
- `assigned_driver_name` text (cached display name)
- `assignment_date` date

### GPS & tracking
- `gps_provider` text
- `sim_number` text
- *(keep existing `gps_device_id` + `live_tracking_enabled`)*

### Maintenance
- `current_odometer` numeric
- `maintenance_interval_km` numeric
- `maintenance_interval_days` integer
- `last_service_odometer` numeric
- `next_service_odometer` numeric
- `service_vendor` text

### Financial
- `monthly_emi` numeric
- `fuel_card_number` text
- `operating_cost_per_km` numeric
- *(`mileage` already covers average mileage)*

### Emergency
- `emergency_contact_name` text
- `emergency_contact_phone` text
- `first_aid_available` boolean not null default false
- `fire_extinguisher_expiry` date

### Documents (store storage path)
- `rc_document_url` text
- `insurance_document_url` text
- `fitness_certificate_url` text
- `permit_document_url` text

### Notes
- `remarks` text

> **Postgres note:** this brings the table to ~60 columns — well within limits. Additive + nullable →
> **zero risk to the 1 existing row**; no backfill required.

---

## 4. Driver assignment — the `staff.id` vs `tms_driver.id` nuance

Drivers originate from the MyJKKN-owned `staff` table (`role_key='driver'`); TMS owns only the
`tms_driver` operational extension. Critically, `lib/drivers/map.ts` `mapStaffToDriver` returns
**`id: staff.id`** — the entire drivers feature (list + `/api/admin/drivers/[driverId]`) is keyed on
**`staff.id`**, not `tms_driver.id`. `tms_driver` itself has **no name column**; the name comes from the
`staff` join.

**Decision:**
- `assigned_driver_id` is the **staff id**, with a real FK to **`tms_driver(staff_id)`**. The UNIQUE
  constraint required for the FK target is **confirmed present** (`tms_driver_staff_id_key`; also implied
  by the create handler's `onConflict: 'staff_id'` upsert). This honours "FK to tms_driver" while
  matching the value the picker actually provides.
- The **driver picker** is fed by `GET /api/admin/drivers`, **filtered to drivers that have an ops row**
  (`ops != null`) so every selectable driver satisfies the FK (a `tms_driver` row exists for them).
- On select, the form caches the driver's display `name` into `assigned_driver_name` and may default
  `assignment_date` to today.
- `ON DELETE SET NULL`: if the `tms_driver` ops row is removed, `assigned_driver_id` nulls out;
  `assigned_driver_name` is retained as a historical label.

---

## 5. Document upload subsystem (net-new, reusable)

There is **no existing upload code in the app** (`storage.from(`/`.upload(` → zero hits). This is built
from scratch, designed to be reusable by other modules later.

- **Bucket migration:** create a **private** Storage bucket `tms-vehicle-documents` (not public).
- **Upload route** `POST /api/admin/vehicles/documents` (`withAuth` + requires `tms.vehicles.create`
  **or** `tms.vehicles.edit`):
  - Accepts `multipart/form-data` (file + optional `docType`).
  - Validates MIME type (`application/pdf`, `image/jpeg`, `image/png`) and size (≤ 10 MB).
  - Uploads via the service-role client to `tms-vehicle-documents/{year}/{uuid}-{safeFilename}`.
  - Returns `{ success, path }`. **Path is not keyed on vehicle id**, so the same flow works for both
    *create* (no id yet) and *edit*.
- **Retrieval route** `GET /api/admin/vehicles/documents?path=…` (`withAuth`): returns a short-lived
  **signed URL** (e.g. 60 min) for view/download. Private bucket → no permanent public link.
- **UI component** `DocumentUploadField` (adapt the `nextjs16-web-development` skill template, which is
  client-only today):
  - Upload on selection → store the returned `path` string in form state (into the matching
    `*_document_url` field).
  - Show filename + a **View** link (resolves a signed URL) + **Remove**.
- The form submit sends the stored `path` strings; the API persists them as-is (whitelisted in
  `EDITABLE`/`mapCreatePayload`).

---

## 6. Form & detail layout

Reorganise `vehicle-form.tsx` and `[vehicleId]/page.tsx` into sections mirroring §3:
Identity → Ownership → Compliance → Insurance → Driver → GPS → Maintenance → Financial →
Emergency → Documents → Notes. Sections use the existing `SectionCard` and, for the form, may be
collapsible to manage length.

**Form-level required** (per Decision 4): `registration_number`, `vehicle_type`, `manufacturer`,
`model`, `model_year`, `fuel_type`, `status`, `capacity` are validated client-side (toast on miss),
matching the current `handleSubmit` validation style. DB columns remain nullable.

**Driver picker:** `SelectMenu` populated from `/api/admin/drivers` (best-effort fetch like the existing
GPS device fetch); on change, set `assigned_driver_id` + cache `assigned_driver_name`.

---

## 7. Table / list (kept lean)

`columns.tsx` + `page.tsx`:
- Add a **`Vehicle Type`** column + faceted filter (reusing the `fuel_type` filter pattern).
- Optionally add a compliance "soonest expiry" indicator reusing the `MaintenanceCell` overdue pattern.
- Do **not** surface all 40 fields in the table — the rest live on detail/edit pages.
- `VehicleRow` interface extended with the new fields actually rendered by the table; the detail page
  uses a superset type.

---

## 8. Import / export

- **Import** (`import/route.ts`): add `pick()` keys (snake_case + camelCase fallback) and
  validation/normalisation for the new fields. Dates via the existing `toDate` (handles Excel serials);
  booleans via `toBool`; enums validated against their allowed sets (fallback to `null`, not a forced
  default, since they're optional). Document URL columns accepted as plain strings if present. Keep the
  per-row upsert keyed on `registration_number`.
- **Export** (`vehicle-export.ts`): extend the template example row and add a real `exportVehicles(rows)`
  that emits all columns so export → edit → re-import round-trips.

---

## 9. Migration & rollout

- **Two migration files** under `supabase/migrations/`:
  1. `<ts>_add_tms_vehicle_advanced_fields.sql` — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` (all
     nullable), the two CHECK constraints, and the `assigned_driver_id` FK. Idempotent.
  2. `<ts>_create_tms_vehicle_documents_bucket.sql` — create the private `tms-vehicle-documents` bucket
     (idempotent insert into `storage.buckets`).
- **Apply** via `mcp__supabase__apply_migration` (the MCP targets this exact project and has applied
  `tms_driver`/`tms_route`) — **only after the implementation plan is approved**, since it's a shared
  production DB.
- No backfill needed.

---

## 10. Verification (headless constraints)

Authenticated pages can't be rendered by the agent (proxy gates all routes; agent's browser is
unauthenticated). Verification will use:
- **`tsc`** restricted to changed files (the project's `npm run lint` is known broken).
- **Route probes** (`curl`) for expected 307/401/200 on the vehicles + documents endpoints.
- **`execute_sql`** post-migration column/constraint check.
- Final visual pass performed by the user in their authenticated browser.

---

## 11. Out of scope

- Refactoring the dead legacy vehicle modals (left as-is / not deleted unless requested).
- Driver/route assignment workflow changes beyond storing the vehicle's `assigned_driver_*`.
- Generalising the upload helper into a shared package (kept under `vehicles/` but written to be
  copy-reusable).

---

## 12. Open implementation details (to resolve in the plan)

- ~~Confirm `tms_driver.staff_id` has a UNIQUE constraint/index~~ — **confirmed**
  (`tms_driver_staff_id_key`).
- Exact `SelectMenu` option label casing for `vehicle_type` / `ownership_type`.
- Whether the documents **retrieval** should be a dedicated GET route or fold into the existing
  `[vehicleId]` detail payload (lean toward the dedicated route for reuse).
- Signed-URL TTL.
