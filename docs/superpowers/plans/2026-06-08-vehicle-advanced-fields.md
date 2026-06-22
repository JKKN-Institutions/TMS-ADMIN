# Vehicle Module — Advanced Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~40 advanced fleet-management fields to the Vehicles module (across 11 form sections) plus a net-new private-bucket document upload subsystem, threaded through all 7 coupled touchpoints.

**Architecture:** Additive, nullable columns on `public.tms_vehicle` (DB nullable; "required" enforced only in the form). One unified `buildVehiclePayload()` normaliser replaces the duplicated POST/PUT bodies. Documents use a private Supabase Storage bucket accessed exclusively through service-role server routes (upload + signed-URL retrieval), keeping the module's "server holds service-role, client never touches storage" security model. Driver assignment is a loose-FK to `tms_driver(staff_id)` with a cached display name.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (`@supabase/supabase-js`, service-role) · `@tanstack/react-table` · `xlsx` · `uuid` · `react-hot-toast` · Tailwind v4.

---

## Verification model (READ FIRST)

This project has **no test runner** (no jest/vitest/playwright) and **`npm run lint` is broken** (circular ESLint config). Every "verify" step below therefore uses the project's real tooling:

- **Typecheck:** `npm run type-check` (= `tsc --noEmit`). The repo has pre-existing unrelated type noise, so when checking a single file, filter: `npx tsc --noEmit 2>&1 | grep "app/(admin)/vehicles"` (adjust path per task). A task passes when **no new errors reference the files you touched**.
- **Route probes:** the agent's browser is unauthenticated (proxy.ts gates all routes), so a logged-out probe returning **307 (redirect to login) or 401** proves the route exists and is auth-gated — it is *not* a failure. Use: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/vehicles`.
- **DB checks:** run SQL via the Supabase MCP `execute_sql` (read) / `apply_migration` (DDL). The MCP targets the same project as the app (`kvizhngldtiuufknvehv`).
- **Visual pass:** the **user** does the final authenticated browser check; note this at handoff.

Dev server: start once with `npm run dev` (port 3000) before route-probe steps. On Windows, killing a stale server needs `MSYS_NO_PATHCONV=1 taskkill //F //PID <pid>` (see env memory).

---

## Master field reference (single source of truth)

Every task threads from this table. `camelCase` = form-state / API-in key; `snake_case` = `tms_vehicle` column. **E** = already exists, **N** = new.

| snake_case (column) | camelCase | type | section | required (form) | E/N |
|---|---|---|---|---|---|
| registration_number | registrationNumber | text | Identity | yes | E |
| vehicle_type | vehicleType | enum | Identity | yes | N |
| manufacturer | manufacturer | text | Identity | yes | N |
| model | model | text | Identity | yes | E |
| model_year | modelYear | int | Identity | yes | N |
| color | color | text | Identity | no | N |
| capacity | capacity | int | Identity | yes | E |
| gross_vehicle_weight | grossVehicleWeight | num | Identity | no | N |
| fuel_type | fuelType | enum | Identity | yes | E |
| status | status | enum | Identity | yes | E |
| mileage | mileage | num | Identity | no | E |
| ownership_type | ownershipType | enum | Ownership | no | N |
| purchase_date | purchaseDate | date | Ownership | no | E |
| purchase_cost | purchaseCost | num | Ownership | no | N |
| vendor_name | vendorName | text | Ownership | no | N |
| warranty_expiry | warrantyExpiry | date | Ownership | no | N |
| rc_expiry_date | rcExpiryDate | date | Compliance | no | N |
| permit_number | permitNumber | text | Compliance | no | N |
| permit_expiry_date | permitExpiryDate | date | Compliance | no | N |
| pollution_certificate_number | pollutionCertificateNumber | text | Compliance | no | N |
| pollution_expiry_date | pollutionExpiryDate | date | Compliance | no | N |
| road_tax_expiry_date | roadTaxExpiryDate | date | Compliance | no | N |
| fitness_expiry | fitnessExpiry | date | Compliance | no | E |
| insurance_provider | insuranceProvider | text | Insurance | no | N |
| insurance_policy_number | insurancePolicyNumber | text | Insurance | no | N |
| insurance_expiry | insuranceExpiry | date | Insurance | no | E |
| insurance_amount | insuranceAmount | num | Insurance | no | N |
| assigned_driver_id | assignedDriverId | driver-picker (uuid) | Driver | no | N |
| assigned_driver_name | assignedDriverName | text (cached) | Driver | no | N |
| assignment_date | assignmentDate | date | Driver | no | N |
| gps_device_id | gpsDeviceId | gps-picker (uuid) | GPS | no | E |
| live_tracking_enabled | liveTrackingEnabled | bool | GPS | no | E |
| gps_provider | gpsProvider | text | GPS | no | N |
| sim_number | simNumber | text | GPS | no | N |
| last_maintenance | lastMaintenance | date | Maintenance | no | E |
| next_maintenance | nextMaintenance | date | Maintenance | no | E |
| current_odometer | currentOdometer | num | Maintenance | no | N |
| maintenance_interval_km | maintenanceIntervalKm | num | Maintenance | no | N |
| maintenance_interval_days | maintenanceIntervalDays | int | Maintenance | no | N |
| last_service_odometer | lastServiceOdometer | num | Maintenance | no | N |
| next_service_odometer | nextServiceOdometer | num | Maintenance | no | N |
| service_vendor | serviceVendor | text | Maintenance | no | N |
| monthly_emi | monthlyEmi | num | Financial | no | N |
| fuel_card_number | fuelCardNumber | text | Financial | no | N |
| operating_cost_per_km | operatingCostPerKm | num | Financial | no | N |
| emergency_contact_name | emergencyContactName | text | Emergency | no | N |
| emergency_contact_phone | emergencyContactPhone | text | Emergency | no | N |
| first_aid_available | firstAidAvailable | bool | Emergency | no | N |
| fire_extinguisher_expiry | fireExtinguisherExpiry | date | Emergency | no | N |
| rc_document_url | rcDocumentUrl | upload (path) | Documents | no | N |
| insurance_document_url | insuranceDocumentUrl | upload (path) | Documents | no | N |
| fitness_certificate_url | fitnessCertificateUrl | upload (path) | Documents | no | N |
| permit_document_url | permitDocumentUrl | upload (path) | Documents | no | N |
| chassis_number | chassisNumber | text | Notes | no | E |
| engine_number | engineNumber | text | Notes | no | E |
| remarks | remarks | textarea | Notes | no | N |

**Enum value sets** (DB CHECK + dropdown options):
- `vehicle_type`: `bus`, `van`, `car`, `truck`, `ambulance`, `other`
- `ownership_type`: `owned`, `leased`, `rented`
- (`fuel_type`, `status` unchanged)

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260608000000_add_tms_vehicle_advanced_fields.sql` | Create | Add all new columns + 2 CHECK constraints + driver FK |
| `supabase/migrations/20260608000100_create_tms_vehicle_documents_bucket.sql` | Create | Create the private `tms-vehicle-documents` bucket |
| `lib/vehicles/fields.ts` | Create | Shared field-category arrays + `buildVehiclePayload()` normaliser (DRY single source for API + import) |
| `app/api/admin/vehicles/documents/route.ts` | Create | `POST` upload + `GET` signed-URL retrieval (service-role) |
| `app/(admin)/vehicles/document-upload-field.tsx` | Create | Reusable upload field component (upload-on-select → store path) |
| `app/api/admin/vehicles/route.ts` | Modify | Use `buildVehiclePayload()` for POST/PUT; keep permission checks |
| `app/(admin)/vehicles/columns.tsx` | Modify | Extend `VehicleRow`; add Vehicle Type column + filter accessor |
| `app/(admin)/vehicles/vehicle-form.tsx` | Modify | Full form: state, sections, driver picker, document fields, submit |
| `app/(admin)/vehicles/[vehicleId]/page.tsx` | Modify | Detail view: new SectionCards + document view links |
| `app/api/admin/vehicles/import/route.ts` | Modify | Accept + validate new columns |
| `app/(admin)/vehicles/vehicle-export.ts` | Modify | Extend template + add `exportVehicles()` |
| `app/(admin)/vehicles/page.tsx` | Modify | Add Vehicle Type filter; wire Export button |

---

## Task 1: Schema migration — advanced columns

**Files:**
- Create: `supabase/migrations/20260608000000_add_tms_vehicle_advanced_fields.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Vehicle: advanced fleet-management fields (additive)
--
-- Adds ~40 nullable columns to public.tms_vehicle backing the Vehicles module's
-- expanded form (identity, ownership, compliance, insurance, driver assignment,
-- GPS, maintenance, financial, emergency, documents, notes). All additive and
-- nullable — zero impact on existing rows; "required" is enforced in the form,
-- not the DB. Enum columns mirror the existing fuel_type/status CHECK pattern.
--
-- Target: shared MyJKKN Supabase project (project ref: kvizhngldtiuufknvehv).
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Identity
alter table public.tms_vehicle add column if not exists vehicle_type text;
alter table public.tms_vehicle add column if not exists manufacturer text;
alter table public.tms_vehicle add column if not exists model_year integer;
alter table public.tms_vehicle add column if not exists color text;
alter table public.tms_vehicle add column if not exists gross_vehicle_weight numeric;

-- Ownership & purchase
alter table public.tms_vehicle add column if not exists ownership_type text;
alter table public.tms_vehicle add column if not exists purchase_cost numeric;
alter table public.tms_vehicle add column if not exists vendor_name text;
alter table public.tms_vehicle add column if not exists warranty_expiry date;

-- Compliance & legal
alter table public.tms_vehicle add column if not exists rc_expiry_date date;
alter table public.tms_vehicle add column if not exists permit_number text;
alter table public.tms_vehicle add column if not exists permit_expiry_date date;
alter table public.tms_vehicle add column if not exists pollution_certificate_number text;
alter table public.tms_vehicle add column if not exists pollution_expiry_date date;
alter table public.tms_vehicle add column if not exists road_tax_expiry_date date;

-- Insurance
alter table public.tms_vehicle add column if not exists insurance_provider text;
alter table public.tms_vehicle add column if not exists insurance_policy_number text;
alter table public.tms_vehicle add column if not exists insurance_amount numeric;

-- Driver assignment (loose FK to tms_driver(staff_id); name cached for display)
alter table public.tms_vehicle add column if not exists assigned_driver_id uuid;
alter table public.tms_vehicle add column if not exists assigned_driver_name text;
alter table public.tms_vehicle add column if not exists assignment_date date;

-- GPS & tracking (keep existing gps_device_id + live_tracking_enabled)
alter table public.tms_vehicle add column if not exists gps_provider text;
alter table public.tms_vehicle add column if not exists sim_number text;

-- Maintenance
alter table public.tms_vehicle add column if not exists current_odometer numeric;
alter table public.tms_vehicle add column if not exists maintenance_interval_km numeric;
alter table public.tms_vehicle add column if not exists maintenance_interval_days integer;
alter table public.tms_vehicle add column if not exists last_service_odometer numeric;
alter table public.tms_vehicle add column if not exists next_service_odometer numeric;
alter table public.tms_vehicle add column if not exists service_vendor text;

-- Financial
alter table public.tms_vehicle add column if not exists monthly_emi numeric;
alter table public.tms_vehicle add column if not exists fuel_card_number text;
alter table public.tms_vehicle add column if not exists operating_cost_per_km numeric;

-- Emergency
alter table public.tms_vehicle add column if not exists emergency_contact_name text;
alter table public.tms_vehicle add column if not exists emergency_contact_phone text;
alter table public.tms_vehicle add column if not exists first_aid_available boolean not null default false;
alter table public.tms_vehicle add column if not exists fire_extinguisher_expiry date;

-- Documents (store storage path, resolved to a signed URL on read)
alter table public.tms_vehicle add column if not exists rc_document_url text;
alter table public.tms_vehicle add column if not exists insurance_document_url text;
alter table public.tms_vehicle add column if not exists fitness_certificate_url text;
alter table public.tms_vehicle add column if not exists permit_document_url text;

-- Notes
alter table public.tms_vehicle add column if not exists remarks text;

-- Enum CHECK constraints (drop-then-add so re-runs don't error)
alter table public.tms_vehicle drop constraint if exists tms_vehicle_vehicle_type_check;
alter table public.tms_vehicle add constraint tms_vehicle_vehicle_type_check
  check (vehicle_type is null or vehicle_type in ('bus','van','car','truck','ambulance','other'));

alter table public.tms_vehicle drop constraint if exists tms_vehicle_ownership_type_check;
alter table public.tms_vehicle add constraint tms_vehicle_ownership_type_check
  check (ownership_type is null or ownership_type in ('owned','leased','rented'));

-- Driver FK → tms_driver(staff_id) (UNIQUE: tms_driver_staff_id_key). SET NULL on
-- driver removal; assigned_driver_name is retained as a historical label.
alter table public.tms_vehicle drop constraint if exists tms_vehicle_assigned_driver_fk;
alter table public.tms_vehicle add constraint tms_vehicle_assigned_driver_fk
  foreign key (assigned_driver_id) references public.tms_driver(staff_id) on delete set null;

create index if not exists idx_tms_vehicle_vehicle_type on public.tms_vehicle(vehicle_type);
create index if not exists idx_tms_vehicle_assigned_driver_id on public.tms_vehicle(assigned_driver_id);
```

- [ ] **Step 2: Apply the migration via MCP**

Use the Supabase MCP tool `apply_migration` with `name: "add_tms_vehicle_advanced_fields"` and the SQL above as `query`. (The migration file is also committed to the repo for history.)

- [ ] **Step 3: Verify the columns + constraints exist**

Run via MCP `execute_sql`:
```sql
select count(*) as new_cols from information_schema.columns
where table_schema='public' and table_name='tms_vehicle'
  and column_name in ('vehicle_type','ownership_type','assigned_driver_id','remarks',
                      'current_odometer','rc_document_url','first_aid_available');
select conname from pg_constraint
where conrelid='public.tms_vehicle'::regclass and conname like 'tms_vehicle_%check'
   or conname='tms_vehicle_assigned_driver_fk';
```
Expected: `new_cols = 7`; constraint list includes `tms_vehicle_vehicle_type_check`, `tms_vehicle_ownership_type_check`, `tms_vehicle_assigned_driver_fk`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260608000000_add_tms_vehicle_advanced_fields.sql
git commit -m "feat(vehicles): migration — advanced tms_vehicle fields + driver FK"
```

---

## Task 2: Schema migration — documents storage bucket

**Files:**
- Create: `supabase/migrations/20260608000100_create_tms_vehicle_documents_bucket.sql`

> **Why no storage RLS policies:** all bucket access goes through service-role server routes (Task 3); clients never call storage directly. Service-role bypasses RLS, so object-level policies are unnecessary and would only add attack surface. This matches the module's existing security model (server holds the service-role key).

- [ ] **Step 1: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- TMS Vehicle: private documents bucket (RC / insurance / fitness / permit).
-- Private (public=false). Accessed only via service-role server routes
-- (app/api/admin/vehicles/documents) which return short-lived signed URLs.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('tms-vehicle-documents', 'tms-vehicle-documents', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply via MCP**

Use `apply_migration` with `name: "create_tms_vehicle_documents_bucket"` and the SQL above.

- [ ] **Step 3: Verify the bucket exists**

Run via MCP `execute_sql`:
```sql
select id, public from storage.buckets where id='tms-vehicle-documents';
```
Expected: one row, `public = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260608000100_create_tms_vehicle_documents_bucket.sql
git commit -m "feat(vehicles): migration — private tms-vehicle-documents bucket"
```

---

## Task 3: Document upload + retrieval API route

**Files:**
- Create: `app/api/admin/vehicles/documents/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'tms-vehicle-documents';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);

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

// POST: multipart upload → returns the storage path (stored in the *_document_url column).
async function uploadDocument(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.vehicles.create', 'tms.vehicles.edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File must be 10MB or smaller' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Only PDF, JPG, or PNG files are allowed' }, { status: 400 });
    }

    // Path is NOT keyed on vehicle id, so the same flow works for create (no id yet) and edit.
    const year = new Date().getUTCFullYear();
    const path = `${year}/${uuidv4()}-${safeName(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error('Vehicle document upload error:', error);
      return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
    }
    return NextResponse.json({ success: true, path });
  } catch (e) {
    console.error('Vehicle document upload error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET ?path=… → short-lived signed URL for view/download (private bucket).
async function getSignedUrl(request: NextRequest) {
  try {
    const path = new URL(request.url).searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 404 });
    }
    return NextResponse.json({ success: true, url: data.signedUrl });
  } catch (e) {
    console.error('Vehicle document signed-url error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => uploadDocument(request, auth));
export const GET = withAuth((request) => getSignedUrl(request));
```

> **Note:** `withAuth`'s callback signature is `(request, auth)`. The GET handler ignores `auth` (retrieval is allowed for any authenticated TMS user; proxy.ts already gates the route). Confirm against `lib/api/with-auth.ts` while implementing.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "vehicles/documents"`
Expected: no output (no errors in the new file).

- [ ] **Step 3: Probe the route (dev server running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/vehicles/documents?path=x`
Expected: `307` or `401` (route exists, auth-gated). A `404` would mean the file/route is misplaced.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/vehicles/documents/route.ts
git commit -m "feat(vehicles): document upload + signed-url API (service-role, private bucket)"
```

---

## Task 4: DocumentUploadField component

**Files:**
- Create: `app/(admin)/vehicles/document-upload-field.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload, X, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

// Uploads on selection to /api/admin/vehicles/documents and reports the stored
// storage PATH back to the form (value/onChange). Viewing resolves a signed URL.
export function DocumentUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string; // storage path ('' when none)
  onChange: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/vehicles/documents', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
      onChange(json.path as string);
      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleView = async () => {
    if (!value) return;
    try {
      const res = await fetch(`/api/admin/vehicles/documents?path=${encodeURIComponent(value)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not open document');
      window.open(json.url as string, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open document');
    }
  };

  const fileName = value ? value.split('/').pop() : '';

  return (
    <div className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        {value ? (
          <>
            <button
              type="button"
              onClick={handleView}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="truncate max-w-[10rem]">{fileName}</span>
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-500"
              aria-label={`Remove ${label}`}
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-green-400 hover:text-green-600 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? 'Uploading…' : 'Upload (PDF/JPG/PNG)'}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={handleSelect}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "document-upload-field"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/(admin)/vehicles/document-upload-field.tsx
git commit -m "feat(vehicles): DocumentUploadField (upload-on-select, signed-url view)"
```

---

## Task 5: Shared field normaliser + API route rewrite

**Files:**
- Create: `lib/vehicles/fields.ts`
- Modify: `app/api/admin/vehicles/route.ts`

> **Contract change:** POST now accepts **snake_case** (same as PUT). The vehicle form is the only caller and is updated in Task 7. This collapses the previously-duplicated `mapCreatePayload`/`mapEditPayload` into one normaliser.

- [ ] **Step 1: Create the shared field module**

```typescript
// lib/vehicles/fields.ts
// Single source of truth for tms_vehicle writable fields + payload normalisation.
// Used by the vehicles API (route.ts) so create/update share one code path.

export const ENUM_FIELDS: Record<string, readonly string[]> = {
  vehicle_type: ['bus', 'van', 'car', 'truck', 'ambulance', 'other'],
  ownership_type: ['owned', 'leased', 'rented'],
  fuel_type: ['diesel', 'petrol', 'electric', 'cng'],
  status: ['active', 'maintenance', 'retired'],
};

export const INT_FIELDS = ['capacity', 'model_year', 'maintenance_interval_days'] as const;

export const NUM_FIELDS = [
  'mileage', 'gross_vehicle_weight', 'purchase_cost', 'insurance_amount', 'current_odometer',
  'maintenance_interval_km', 'last_service_odometer', 'next_service_odometer', 'monthly_emi',
  'operating_cost_per_km',
] as const;

export const DATE_FIELDS = [
  'purchase_date', 'warranty_expiry', 'rc_expiry_date', 'permit_expiry_date',
  'pollution_expiry_date', 'road_tax_expiry_date', 'fitness_expiry', 'insurance_expiry',
  'assignment_date', 'last_maintenance', 'next_maintenance', 'fire_extinguisher_expiry',
] as const;

export const BOOL_FIELDS = ['live_tracking_enabled', 'first_aid_available'] as const;

export const UUID_FIELDS = ['gps_device_id', 'assigned_driver_id'] as const;

export const TEXT_FIELDS = [
  'registration_number', 'manufacturer', 'model', 'color', 'vendor_name', 'permit_number',
  'pollution_certificate_number', 'insurance_provider', 'insurance_policy_number',
  'assigned_driver_name', 'gps_provider', 'sim_number', 'service_vendor', 'fuel_card_number',
  'emergency_contact_name', 'emergency_contact_phone', 'chassis_number', 'engine_number',
  'remarks', 'rc_document_url', 'insurance_document_url', 'fitness_certificate_url',
  'permit_document_url',
] as const;

// Every column the API will write (whitelist).
export const EDITABLE: readonly string[] = [
  ...Object.keys(ENUM_FIELDS), ...INT_FIELDS, ...NUM_FIELDS, ...DATE_FIELDS,
  ...BOOL_FIELDS, ...UUID_FIELDS, ...TEXT_FIELDS,
];

// Normalise a snake_case request body into a typed tms_vehicle payload.
// Only keys present in the body are included (so PUT can do partial updates).
export function buildVehiclePayload(body: Record<string, unknown>): Record<string, unknown> {
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

  // status / fuel_type default to a valid value on create rather than null.
  if (has('status') && out.status == null) out.status = 'active';
  if (has('fuel_type') && out.fuel_type == null) out.fuel_type = 'diesel';
  // capacity defaults to 0 (matches NOT NULL default) rather than null.
  if (has('capacity') && out.capacity == null) out.capacity = 0;
  // mileage column is NOT NULL default 0.
  if (has('mileage') && out.mileage == null) out.mileage = 0;

  return out;
}
```

- [ ] **Step 2: Rewrite `route.ts` to use the normaliser**

Replace the existing `mapCreatePayload`, `EDITABLE`, `DATE_FIELDS`, and `mapEditPayload` definitions (top of `app/api/admin/vehicles/route.ts`, lines ~13–51) with an import and thin wrappers. The full new file:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildVehiclePayload } from '@/lib/vehicles/fields';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getVehicles() {
  try {
    const supabase = createServiceRoleClient();
    const { data: vehicles, error } = await supabase
      .from('tms_vehicle')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Vehicles query error:', error);
      return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: vehicles ?? [], count: vehicles?.length ?? 0 });
  } catch (e) {
    console.error('Vehicles API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postVehicle(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.vehicles.create'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const payload = buildVehiclePayload(body);
    if (!payload.registration_number || !payload.model || !payload.capacity) {
      return NextResponse.json({ error: 'Registration number, model, and capacity are required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from('tms_vehicle')
      .select('id')
      .eq('registration_number', payload.registration_number as string)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'A vehicle with this registration number already exists' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('tms_vehicle')
      .insert([{ ...payload, created_by: auth.userId, updated_by: auth.userId }])
      .select()
      .single();
    if (error) {
      console.error('Vehicle create error:', error);
      return NextResponse.json({ error: 'Failed to create vehicle' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data, message: 'Vehicle created successfully' });
  } catch (e) {
    console.error('Vehicle create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function putVehicle(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.vehicles.edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const id: string | undefined = body?.id || body?.vehicleId;
    if (!id) return NextResponse.json({ error: 'Vehicle id is required' }, { status: 400 });

    const payload = buildVehiclePayload(body);
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tms_vehicle')
      .update({ ...payload, updated_by: auth.userId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Vehicle update error:', error);
      return NextResponse.json({ error: 'Failed to update vehicle' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data, message: 'Vehicle updated successfully' });
  } catch (e) {
    console.error('Vehicle update error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function deleteVehicle(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.vehicles.delete'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Vehicle id is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('tms_vehicle').delete().eq('id', id);
    if (error) {
      console.error('Vehicle delete error:', error);
      return NextResponse.json({ error: 'Failed to delete vehicle' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Vehicle deleted successfully' });
  } catch (e) {
    console.error('Vehicle delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getVehicles());
export const POST = withAuth((request, auth) => postVehicle(request, auth));
export const PUT = withAuth((request, auth) => putVehicle(request, auth));
export const DELETE = withAuth((request, auth) => deleteVehicle(request, auth));
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/vehicles/fields|api/admin/vehicles/route"`
Expected: no output.

- [ ] **Step 4: Probe (dev server running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/vehicles`
Expected: `307` or `401`.

- [ ] **Step 5: Commit**

```bash
git add lib/vehicles/fields.ts app/api/admin/vehicles/route.ts
git commit -m "refactor(vehicles): unified buildVehiclePayload normaliser for create/update"
```

---

## Task 6: Extend VehicleRow type + add Vehicle Type column

**Files:**
- Modify: `app/(admin)/vehicles/columns.tsx`

- [ ] **Step 1: Replace the `VehicleRow` interface** (lines ~17–31) with the full field set

```typescript
// Shape of a vehicle row coming from /api/admin/vehicles (tms_vehicle).
export interface VehicleRow {
  id: string;
  registration_number: string;
  model: string;
  capacity?: number;
  fuel_type?: string;
  status?: string;
  mileage?: number | string;
  insurance_expiry?: string | null;
  fitness_expiry?: string | null;
  last_maintenance?: string | null;
  next_maintenance?: string | null;
  gps_device_id?: string | null;
  live_tracking_enabled?: boolean;
  // Identity
  vehicle_type?: string | null;
  manufacturer?: string | null;
  model_year?: number | null;
  color?: string | null;
  gross_vehicle_weight?: number | string | null;
  // Ownership
  ownership_type?: string | null;
  purchase_date?: string | null;
  purchase_cost?: number | string | null;
  vendor_name?: string | null;
  warranty_expiry?: string | null;
  // Compliance
  rc_expiry_date?: string | null;
  permit_number?: string | null;
  permit_expiry_date?: string | null;
  pollution_certificate_number?: string | null;
  pollution_expiry_date?: string | null;
  road_tax_expiry_date?: string | null;
  // Insurance
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
  insurance_amount?: number | string | null;
  // Driver
  assigned_driver_id?: string | null;
  assigned_driver_name?: string | null;
  assignment_date?: string | null;
  // GPS
  gps_provider?: string | null;
  sim_number?: string | null;
  // Maintenance
  current_odometer?: number | string | null;
  maintenance_interval_km?: number | string | null;
  maintenance_interval_days?: number | null;
  last_service_odometer?: number | string | null;
  next_service_odometer?: number | string | null;
  service_vendor?: string | null;
  // Financial
  monthly_emi?: number | string | null;
  fuel_card_number?: string | null;
  operating_cost_per_km?: number | string | null;
  // Emergency
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  first_aid_available?: boolean | null;
  fire_extinguisher_expiry?: string | null;
  // Documents (storage paths)
  rc_document_url?: string | null;
  insurance_document_url?: string | null;
  fitness_certificate_url?: string | null;
  permit_document_url?: string | null;
  // Notes
  chassis_number?: string | null;
  engine_number?: string | null;
  remarks?: string | null;
}
```

- [ ] **Step 2: Add a Vehicle Type column** to the array returned by `getVehicleColumns`, immediately after the `model` column (before `capacity`):

```typescript
    {
      id: 'vehicle_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      accessorFn: (v) => v.vehicle_type ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => (
        <span className="capitalize text-gray-700 dark:text-gray-300">
          {row.original.vehicle_type || '—'}
        </span>
      ),
    },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "vehicles/columns"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/vehicles/columns.tsx
git commit -m "feat(vehicles): extend VehicleRow type + Vehicle Type column/filter"
```

---

## Task 7: Rewrite the vehicle form

**Files:**
- Modify: `app/(admin)/vehicles/vehicle-form.tsx`

This is the largest task. The form: (a) holds all fields in snake_case-mirroring camelCase state, (b) renders 11 sections, (c) fetches drivers for the picker (filtered to `ops != null`), (d) uses `DocumentUploadField`, (e) submits **snake_case** for both create and edit.

- [ ] **Step 1: Replace the whole file**

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { SectionCard } from '@/components/ui/detail-view';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';
import { DocumentUploadField } from './document-upload-field';
import type { VehicleRow } from './columns';

interface GpsDevice { id: string; device_name?: string; device_id?: string; status?: string }
interface DriverItem { id: string; name: string; ops: unknown | null }

// Form state mirrors tms_vehicle columns (camelCase). Strings for inputs.
interface VehicleFormState {
  registrationNumber: string; vehicleType: string; manufacturer: string; model: string;
  modelYear: string; color: string; capacity: string; grossVehicleWeight: string;
  fuelType: string; status: string; mileage: string;
  ownershipType: string; purchaseDate: string; purchaseCost: string; vendorName: string; warrantyExpiry: string;
  rcExpiryDate: string; permitNumber: string; permitExpiryDate: string;
  pollutionCertificateNumber: string; pollutionExpiryDate: string; roadTaxExpiryDate: string; fitnessExpiry: string;
  insuranceProvider: string; insurancePolicyNumber: string; insuranceExpiry: string; insuranceAmount: string;
  assignedDriverId: string; assignedDriverName: string; assignmentDate: string;
  gpsDeviceId: string; liveTrackingEnabled: boolean; gpsProvider: string; simNumber: string;
  lastMaintenance: string; nextMaintenance: string; currentOdometer: string;
  maintenanceIntervalKm: string; maintenanceIntervalDays: string;
  lastServiceOdometer: string; nextServiceOdometer: string; serviceVendor: string;
  monthlyEmi: string; fuelCardNumber: string; operatingCostPerKm: string;
  emergencyContactName: string; emergencyContactPhone: string; firstAidAvailable: boolean; fireExtinguisherExpiry: string;
  rcDocumentUrl: string; insuranceDocumentUrl: string; fitnessCertificateUrl: string; permitDocumentUrl: string;
  chassisNumber: string; engineNumber: string; remarks: string;
}

const EMPTY: VehicleFormState = {
  registrationNumber: '', vehicleType: '', manufacturer: '', model: '', modelYear: '', color: '',
  capacity: '', grossVehicleWeight: '', fuelType: 'diesel', status: 'active', mileage: '',
  ownershipType: '', purchaseDate: '', purchaseCost: '', vendorName: '', warrantyExpiry: '',
  rcExpiryDate: '', permitNumber: '', permitExpiryDate: '', pollutionCertificateNumber: '',
  pollutionExpiryDate: '', roadTaxExpiryDate: '', fitnessExpiry: '',
  insuranceProvider: '', insurancePolicyNumber: '', insuranceExpiry: '', insuranceAmount: '',
  assignedDriverId: '', assignedDriverName: '', assignmentDate: '',
  gpsDeviceId: '', liveTrackingEnabled: false, gpsProvider: '', simNumber: '',
  lastMaintenance: '', nextMaintenance: '', currentOdometer: '', maintenanceIntervalKm: '',
  maintenanceIntervalDays: '', lastServiceOdometer: '', nextServiceOdometer: '', serviceVendor: '',
  monthlyEmi: '', fuelCardNumber: '', operatingCostPerKm: '',
  emergencyContactName: '', emergencyContactPhone: '', firstAidAvailable: false, fireExtinguisherExpiry: '',
  rcDocumentUrl: '', insuranceDocumentUrl: '', fitnessCertificateUrl: '', permitDocumentUrl: '',
  chassisNumber: '', engineNumber: '', remarks: '',
};

const toDateInput = (d?: string | null) => (d ? String(d).split('T')[0] : '');
const s = (v: unknown) => (v == null ? '' : String(v));

function fromVehicle(v: VehicleRow): VehicleFormState {
  return {
    registrationNumber: v.registration_number ?? '', vehicleType: v.vehicle_type ?? '',
    manufacturer: v.manufacturer ?? '', model: v.model ?? '', modelYear: s(v.model_year),
    color: v.color ?? '', capacity: s(v.capacity), grossVehicleWeight: s(v.gross_vehicle_weight),
    fuelType: v.fuel_type ?? 'diesel', status: v.status ?? 'active', mileage: s(v.mileage),
    ownershipType: v.ownership_type ?? '', purchaseDate: toDateInput(v.purchase_date),
    purchaseCost: s(v.purchase_cost), vendorName: v.vendor_name ?? '', warrantyExpiry: toDateInput(v.warranty_expiry),
    rcExpiryDate: toDateInput(v.rc_expiry_date), permitNumber: v.permit_number ?? '',
    permitExpiryDate: toDateInput(v.permit_expiry_date), pollutionCertificateNumber: v.pollution_certificate_number ?? '',
    pollutionExpiryDate: toDateInput(v.pollution_expiry_date), roadTaxExpiryDate: toDateInput(v.road_tax_expiry_date),
    fitnessExpiry: toDateInput(v.fitness_expiry),
    insuranceProvider: v.insurance_provider ?? '', insurancePolicyNumber: v.insurance_policy_number ?? '',
    insuranceExpiry: toDateInput(v.insurance_expiry), insuranceAmount: s(v.insurance_amount),
    assignedDriverId: v.assigned_driver_id ?? '', assignedDriverName: v.assigned_driver_name ?? '',
    assignmentDate: toDateInput(v.assignment_date),
    gpsDeviceId: v.gps_device_id ?? '', liveTrackingEnabled: !!v.live_tracking_enabled,
    gpsProvider: v.gps_provider ?? '', simNumber: v.sim_number ?? '',
    lastMaintenance: toDateInput(v.last_maintenance), nextMaintenance: toDateInput(v.next_maintenance),
    currentOdometer: s(v.current_odometer), maintenanceIntervalKm: s(v.maintenance_interval_km),
    maintenanceIntervalDays: s(v.maintenance_interval_days), lastServiceOdometer: s(v.last_service_odometer),
    nextServiceOdometer: s(v.next_service_odometer), serviceVendor: v.service_vendor ?? '',
    monthlyEmi: s(v.monthly_emi), fuelCardNumber: v.fuel_card_number ?? '', operatingCostPerKm: s(v.operating_cost_per_km),
    emergencyContactName: v.emergency_contact_name ?? '', emergencyContactPhone: v.emergency_contact_phone ?? '',
    firstAidAvailable: !!v.first_aid_available, fireExtinguisherExpiry: toDateInput(v.fire_extinguisher_expiry),
    rcDocumentUrl: v.rc_document_url ?? '', insuranceDocumentUrl: v.insurance_document_url ?? '',
    fitnessCertificateUrl: v.fitness_certificate_url ?? '', permitDocumentUrl: v.permit_document_url ?? '',
    chassisNumber: v.chassis_number ?? '', engineNumber: v.engine_number ?? '', remarks: v.remarks ?? '',
  };
}

// camelCase form state → snake_case API payload (sent for BOTH create and edit).
function toPayload(f: VehicleFormState): Record<string, unknown> {
  return {
    registration_number: f.registrationNumber.trim(), vehicle_type: f.vehicleType || null,
    manufacturer: f.manufacturer.trim() || null, model: f.model.trim(),
    model_year: f.modelYear || null, color: f.color.trim() || null,
    capacity: f.capacity, gross_vehicle_weight: f.grossVehicleWeight || null,
    fuel_type: f.fuelType, status: f.status, mileage: f.mileage || 0,
    ownership_type: f.ownershipType || null, purchase_date: f.purchaseDate || null,
    purchase_cost: f.purchaseCost || null, vendor_name: f.vendorName.trim() || null,
    warranty_expiry: f.warrantyExpiry || null,
    rc_expiry_date: f.rcExpiryDate || null, permit_number: f.permitNumber.trim() || null,
    permit_expiry_date: f.permitExpiryDate || null,
    pollution_certificate_number: f.pollutionCertificateNumber.trim() || null,
    pollution_expiry_date: f.pollutionExpiryDate || null, road_tax_expiry_date: f.roadTaxExpiryDate || null,
    fitness_expiry: f.fitnessExpiry || null,
    insurance_provider: f.insuranceProvider.trim() || null,
    insurance_policy_number: f.insurancePolicyNumber.trim() || null,
    insurance_expiry: f.insuranceExpiry || null, insurance_amount: f.insuranceAmount || null,
    assigned_driver_id: f.assignedDriverId || null, assigned_driver_name: f.assignedDriverName || null,
    assignment_date: f.assignmentDate || null,
    gps_device_id: f.gpsDeviceId || null, live_tracking_enabled: f.liveTrackingEnabled,
    gps_provider: f.gpsProvider.trim() || null, sim_number: f.simNumber.trim() || null,
    last_maintenance: f.lastMaintenance || null, next_maintenance: f.nextMaintenance || null,
    current_odometer: f.currentOdometer || null, maintenance_interval_km: f.maintenanceIntervalKm || null,
    maintenance_interval_days: f.maintenanceIntervalDays || null,
    last_service_odometer: f.lastServiceOdometer || null, next_service_odometer: f.nextServiceOdometer || null,
    service_vendor: f.serviceVendor.trim() || null,
    monthly_emi: f.monthlyEmi || null, fuel_card_number: f.fuelCardNumber.trim() || null,
    operating_cost_per_km: f.operatingCostPerKm || null,
    emergency_contact_name: f.emergencyContactName.trim() || null,
    emergency_contact_phone: f.emergencyContactPhone.trim() || null,
    first_aid_available: f.firstAidAvailable, fire_extinguisher_expiry: f.fireExtinguisherExpiry || null,
    rc_document_url: f.rcDocumentUrl || null, insurance_document_url: f.insuranceDocumentUrl || null,
    fitness_certificate_url: f.fitnessCertificateUrl || null, permit_document_url: f.permitDocumentUrl || null,
    chassis_number: f.chassisNumber.trim() || null, engine_number: f.engineNumber.trim() || null,
    remarks: f.remarks.trim() || null,
  };
}

const fieldCls = 'block text-sm';
const labelCls = 'text-gray-600';

const FUEL_OPTIONS: SelectMenuOption[] = [
  { value: 'diesel', label: 'Diesel' }, { value: 'petrol', label: 'Petrol' },
  { value: 'electric', label: 'Electric' }, { value: 'cng', label: 'CNG' },
];
const STATUS_OPTIONS: SelectMenuOption[] = [
  { value: 'active', label: 'Active' }, { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];
const VEHICLE_TYPE_OPTIONS: SelectMenuOption[] = [
  { value: 'bus', label: 'Bus' }, { value: 'van', label: 'Van' }, { value: 'car', label: 'Car' },
  { value: 'truck', label: 'Truck' }, { value: 'ambulance', label: 'Ambulance' }, { value: 'other', label: 'Other' },
];
const OWNERSHIP_OPTIONS: SelectMenuOption[] = [
  { value: 'owned', label: 'Owned' }, { value: 'leased', label: 'Leased' }, { value: 'rented', label: 'Rented' },
];

export default function VehicleForm({
  mode, vehicleId, initial,
}: { mode: 'create' | 'edit'; vehicleId?: string; initial?: VehicleRow }) {
  const router = useRouter();
  const [form, setForm] = useState<VehicleFormState>(initial ? fromVehicle(initial) : EMPTY);
  const [gpsDevices, setGpsDevices] = useState<GpsDevice[]>([]);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof VehicleFormState>(k: K, v: VehicleFormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // GPS devices (best-effort).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/gps/devices');
        const json = await res.json();
        if (active && json.success) setGpsDevices((json.data as GpsDevice[]).filter((d) => d.status === 'active'));
      } catch { /* non-fatal */ }
    })();
    return () => { active = false; };
  }, []);

  // Drivers for the picker — only those with a tms_driver ops row (FK-safe).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/drivers');
        const json = await res.json();
        if (active && json.success) setDrivers((json.data as DriverItem[]).filter((d) => d.ops != null));
      } catch { /* non-fatal */ }
    })();
    return () => { active = false; };
  }, []);

  const cancelHref = mode === 'edit' && vehicleId ? `/vehicles/${vehicleId}` : '/vehicles';

  const gpsOptions: SelectMenuOption[] = [
    { value: '', label: 'No GPS Device' },
    ...gpsDevices.map((d) => ({ value: d.id, label: `${d.device_name || 'Device'}${d.device_id ? ` (${d.device_id})` : ''}` })),
  ];
  const driverOptions: SelectMenuOption[] = [
    { value: '', label: 'No driver assigned' },
    ...drivers.map((d) => ({ value: d.id, label: d.name })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.registrationNumber.trim()) return toast.error('Registration number is required');
    if (!form.vehicleType) return toast.error('Vehicle type is required');
    if (!form.manufacturer.trim()) return toast.error('Manufacturer is required');
    if (!form.model.trim()) return toast.error('Model is required');
    if (!form.modelYear) return toast.error('Model year is required');
    if (!form.capacity || parseInt(form.capacity) <= 0) return toast.error('Capacity must be greater than 0');

    setSaving(true);
    try {
      const payload = toPayload(form);
      const res =
        mode === 'create'
          ? await fetch('/api/admin/vehicles', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            })
          : await fetch('/api/admin/vehicles', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: vehicleId, ...payload }),
            });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed to ${mode} vehicle`);
      toast.success(mode === 'create' ? 'Vehicle created' : 'Vehicle updated');
      const id = mode === 'edit' ? vehicleId : json.data?.id;
      router.push(id ? `/vehicles/${id}` : '/vehicles');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${mode} vehicle`);
    } finally {
      setSaving(false);
    }
  };

  // Small input helpers (kept local; the form is the only consumer).
  const Text = (k: keyof VehicleFormState, label: string, placeholder = '') => (
    <label className={fieldCls}>
      <span className={labelCls}>{label}</span>
      <input className="input mt-1" value={form[k] as string} placeholder={placeholder}
        onChange={(e) => set(k, e.target.value as VehicleFormState[typeof k])} />
    </label>
  );
  const Num = (k: keyof VehicleFormState, label: string, step = '1', placeholder = '') => (
    <label className={fieldCls}>
      <span className={labelCls}>{label}</span>
      <input type="number" step={step} min="0" className="input mt-1" value={form[k] as string} placeholder={placeholder}
        onChange={(e) => set(k, e.target.value as VehicleFormState[typeof k])} />
    </label>
  );
  const DateF = (k: keyof VehicleFormState, label: string) => (
    <label className={fieldCls}>
      <span className={labelCls}>{label}</span>
      <input type="date" className="input mt-1" value={form[k] as string}
        onChange={(e) => set(k, e.target.value as VehicleFormState[typeof k])} />
    </label>
  );
  const grid = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionCard title="Identity">
        <div className={grid}>
          {Text('registrationNumber', 'Registration Number *', 'TN01AB1234')}
          <div className={fieldCls}>
            <span className={labelCls}>Vehicle Type *</span>
            <SelectMenu className="mt-1" ariaLabel="Vehicle type" value={form.vehicleType}
              onValueChange={(v) => set('vehicleType', v)} options={VEHICLE_TYPE_OPTIONS} />
          </div>
          {Text('manufacturer', 'Manufacturer *', 'Tata')}
          {Text('model', 'Model *', 'Starbus')}
          {Num('modelYear', 'Model Year *', '1', '2022')}
          {Text('color', 'Color', 'White')}
          {Num('capacity', 'Capacity (passengers) *', '1', '40')}
          {Num('grossVehicleWeight', 'Gross Vehicle Weight (kg)', '0.01', '16200')}
          <div className={fieldCls}>
            <span className={labelCls}>Fuel Type</span>
            <SelectMenu className="mt-1" ariaLabel="Fuel type" value={form.fuelType}
              onValueChange={(v) => set('fuelType', v)} options={FUEL_OPTIONS} />
          </div>
          <div className={fieldCls}>
            <span className={labelCls}>Status</span>
            <SelectMenu className="mt-1" ariaLabel="Vehicle status" value={form.status}
              onValueChange={(v) => set('status', v)} options={STATUS_OPTIONS} />
          </div>
          {Num('mileage', 'Mileage (km/l)', '0.1', '12.5')}
        </div>
      </SectionCard>

      <SectionCard title="Ownership & purchase">
        <div className={grid}>
          <div className={fieldCls}>
            <span className={labelCls}>Ownership Type</span>
            <SelectMenu className="mt-1" ariaLabel="Ownership type" value={form.ownershipType}
              onValueChange={(v) => set('ownershipType', v)} options={[{ value: '', label: '—' }, ...OWNERSHIP_OPTIONS]} />
          </div>
          {DateF('purchaseDate', 'Purchase Date')}
          {Num('purchaseCost', 'Purchase Cost', '0.01')}
          {Text('vendorName', 'Vendor Name')}
          {DateF('warrantyExpiry', 'Warranty Expiry')}
        </div>
      </SectionCard>

      <SectionCard title="Compliance & legal">
        <div className={grid}>
          {DateF('rcExpiryDate', 'RC Expiry')}
          {Text('permitNumber', 'Permit Number')}
          {DateF('permitExpiryDate', 'Permit Expiry')}
          {Text('pollutionCertificateNumber', 'Pollution Cert. Number')}
          {DateF('pollutionExpiryDate', 'Pollution Expiry')}
          {DateF('roadTaxExpiryDate', 'Road Tax Expiry')}
          {DateF('fitnessExpiry', 'Fitness Certificate Expiry')}
        </div>
      </SectionCard>

      <SectionCard title="Insurance">
        <div className={grid}>
          {Text('insuranceProvider', 'Insurance Provider')}
          {Text('insurancePolicyNumber', 'Policy Number')}
          {DateF('insuranceExpiry', 'Insurance Expiry')}
          {Num('insuranceAmount', 'Insured Amount', '0.01')}
        </div>
      </SectionCard>

      <SectionCard title="Driver assignment">
        <div className={grid}>
          <div className={fieldCls}>
            <span className={labelCls}>Assigned Driver</span>
            <SelectMenu className="mt-1" ariaLabel="Assigned driver" value={form.assignedDriverId}
              options={driverOptions}
              onValueChange={(id) => {
                const name = drivers.find((d) => d.id === id)?.name ?? '';
                setForm((p) => ({ ...p, assignedDriverId: id, assignedDriverName: name }));
              }} />
            {drivers.length === 0 && (
              <span className="mt-1 block text-xs text-gray-400">No onboarded drivers found.</span>
            )}
          </div>
          {DateF('assignmentDate', 'Assignment Date')}
        </div>
      </SectionCard>

      <SectionCard title="GPS & tracking">
        <div className={grid}>
          <div className={fieldCls}>
            <span className={labelCls}>GPS Device</span>
            <SelectMenu className="mt-1" ariaLabel="GPS device" value={form.gpsDeviceId} options={gpsOptions}
              onValueChange={(id) => setForm((p) => ({ ...p, gpsDeviceId: id, liveTrackingEnabled: id ? p.liveTrackingEnabled : false }))} />
          </div>
          {Text('gpsProvider', 'GPS Provider')}
          {Text('simNumber', 'SIM Number')}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.liveTrackingEnabled} disabled={!form.gpsDeviceId}
              onChange={(e) => set('liveTrackingEnabled', e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
            <span className={form.gpsDeviceId ? 'text-gray-700' : 'text-gray-400'}>Enable live tracking</span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Maintenance">
        <div className={grid}>
          {DateF('lastMaintenance', 'Last Maintenance')}
          {DateF('nextMaintenance', 'Next Maintenance')}
          {Num('currentOdometer', 'Current Odometer (km)', '0.01')}
          {Num('maintenanceIntervalKm', 'Service Interval (km)', '0.01')}
          {Num('maintenanceIntervalDays', 'Service Interval (days)', '1')}
          {Num('lastServiceOdometer', 'Last Service Odometer (km)', '0.01')}
          {Num('nextServiceOdometer', 'Next Service Odometer (km)', '0.01')}
          {Text('serviceVendor', 'Service Vendor')}
        </div>
      </SectionCard>

      <SectionCard title="Financial">
        <div className={grid}>
          {Num('monthlyEmi', 'Monthly EMI', '0.01')}
          {Text('fuelCardNumber', 'Fuel Card Number')}
          {Num('operatingCostPerKm', 'Operating Cost / km', '0.01')}
        </div>
      </SectionCard>

      <SectionCard title="Emergency">
        <div className={grid}>
          {Text('emergencyContactName', 'Emergency Contact Name')}
          {Text('emergencyContactPhone', 'Emergency Contact Phone')}
          {DateF('fireExtinguisherExpiry', 'Fire Extinguisher Expiry')}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.firstAidAvailable}
              onChange={(e) => set('firstAidAvailable', e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
            <span className="text-gray-700">First-aid kit available</span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Documents">
        <div className={grid}>
          <DocumentUploadField label="RC Document" value={form.rcDocumentUrl} onChange={(p) => set('rcDocumentUrl', p)} />
          <DocumentUploadField label="Insurance Document" value={form.insuranceDocumentUrl} onChange={(p) => set('insuranceDocumentUrl', p)} />
          <DocumentUploadField label="Fitness Certificate" value={form.fitnessCertificateUrl} onChange={(p) => set('fitnessCertificateUrl', p)} />
          <DocumentUploadField label="Permit Document" value={form.permitDocumentUrl} onChange={(p) => set('permitDocumentUrl', p)} />
        </div>
      </SectionCard>

      <SectionCard title="Identifiers & notes">
        <div className={grid}>
          {Text('chassisNumber', 'Chassis Number', 'MA3FKA1BHGM123456')}
          {Text('engineNumber', 'Engine Number', '497TCIC123456')}
        </div>
        <label className="mt-4 block text-sm">
          <span className={labelCls}>Remarks</span>
          <textarea className="input mt-1 min-h-[80px]" value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)} />
        </label>
      </SectionCard>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => router.push(cancelHref)} disabled={saving}>Cancel</button>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : mode === 'create' ? 'Create Vehicle' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
```

> **Note on the `Text`/`Num`/`DateF` helpers:** they are defined inside the component so they close over `form`/`set`. Because they return elements built fresh each render and the underlying `<input>` keeps a stable position in the tree, React preserves focus correctly. If during implementation you observe focus loss while typing, hoist them to module-level components taking `value`/`onChange` props (see `.input` cascade note in CLAUDE.md memory for the `input` class).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "vehicle-form"`
Expected: no output.

- [ ] **Step 3: Probe create/edit pages (dev server running)**

Run: `for p in /vehicles/new; do curl -s -o /dev/null -w "$p %{http_code}\n" http://localhost:3000$p; done`
Expected: `307` or `401`.

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/vehicles/vehicle-form.tsx
git commit -m "feat(vehicles): full advanced-fields form (11 sections, driver picker, uploads)"
```

---

## Task 8: Detail view — new sections

**Files:**
- Modify: `app/(admin)/vehicles/[vehicleId]/page.tsx`

- [ ] **Step 1: Replace the `VehicleDetail` interface** (lines ~9–15) — it can now reuse the full `VehicleRow`:

```typescript
type VehicleDetail = VehicleRow & {
  created_at?: string;
  updated_at?: string;
};
```

- [ ] **Step 2: Add a document-link helper** below `fmtDate` (after line ~17):

```typescript
function DocLink({ label, path }: { label: string; path?: string | null }) {
  const open = async () => {
    if (!path) return;
    try {
      const res = await fetch(`/api/admin/vehicles/documents?path=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (res.ok && json.success) window.open(json.url as string, '_blank', 'noopener');
    } catch { /* ignore */ }
  };
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      {path ? (
        <button type="button" onClick={open} className="text-sm text-green-700 hover:underline">View document</button>
      ) : (
        <div className="text-sm text-gray-400">—</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace the body `SectionCard`s** (the "Vehicle information" / "Maintenance & compliance" / "Additional details" blocks, lines ~118–146) with the expanded set:

```tsx
      <SectionCard title="Identity">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Registration No." value={vehicle.registration_number} />
          <Field label="Type" value={vehicle.vehicle_type ? vehicle.vehicle_type : ''} />
          <Field label="Manufacturer" value={vehicle.manufacturer} />
          <Field label="Model" value={vehicle.model} />
          <Field label="Model Year" value={vehicle.model_year != null ? String(vehicle.model_year) : ''} />
          <Field label="Color" value={vehicle.color} />
          <Field label="Capacity" value={vehicle.capacity != null ? `${vehicle.capacity} passengers` : ''} />
          <Field label="Gross Vehicle Weight" value={vehicle.gross_vehicle_weight ? `${vehicle.gross_vehicle_weight} kg` : ''} />
          <Field label="Fuel Type" value={vehicle.fuel_type ? vehicle.fuel_type.toUpperCase() : ''} />
          <Field label="Mileage" value={vehicle.mileage && Number(vehicle.mileage) > 0 ? `${vehicle.mileage} km/l` : ''} />
          <Field label="Status" value={<StatusBadge status={vehicle.status} />} />
        </div>
      </SectionCard>

      <SectionCard title="Ownership & purchase">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Ownership" value={vehicle.ownership_type} />
          <Field label="Purchase Date" value={fmtDate(vehicle.purchase_date)} />
          <Field label="Purchase Cost" value={vehicle.purchase_cost} />
          <Field label="Vendor" value={vehicle.vendor_name} />
          <Field label="Warranty Expiry" value={fmtDate(vehicle.warranty_expiry)} />
        </div>
      </SectionCard>

      <SectionCard title="Compliance & legal">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="RC Expiry" value={fmtDate(vehicle.rc_expiry_date)} />
          <Field label="Permit Number" value={vehicle.permit_number} />
          <Field label="Permit Expiry" value={fmtDate(vehicle.permit_expiry_date)} />
          <Field label="Pollution Cert. No." value={vehicle.pollution_certificate_number} />
          <Field label="Pollution Expiry" value={fmtDate(vehicle.pollution_expiry_date)} />
          <Field label="Road Tax Expiry" value={fmtDate(vehicle.road_tax_expiry_date)} />
          <Field label="Fitness Expiry" value={fmtDate(vehicle.fitness_expiry)} />
        </div>
      </SectionCard>

      <SectionCard title="Insurance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Provider" value={vehicle.insurance_provider} />
          <Field label="Policy Number" value={vehicle.insurance_policy_number} />
          <Field label="Insurance Expiry" value={fmtDate(vehicle.insurance_expiry)} />
          <Field label="Insured Amount" value={vehicle.insurance_amount} />
        </div>
      </SectionCard>

      <SectionCard title="Driver assignment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Assigned Driver" value={vehicle.assigned_driver_name} />
          <Field label="Assignment Date" value={fmtDate(vehicle.assignment_date)} />
        </div>
      </SectionCard>

      <SectionCard title="GPS & tracking">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="GPS Device" value={vehicle.gps_device_id} />
          <Field label="GPS Provider" value={vehicle.gps_provider} />
          <Field label="SIM Number" value={vehicle.sim_number} />
          <Field label="Live Tracking" value={vehicle.live_tracking_enabled ? 'Enabled' : 'Disabled'} />
        </div>
      </SectionCard>

      <SectionCard title="Maintenance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Last Maintenance" value={fmtDate(vehicle.last_maintenance)} />
          <Field label="Next Maintenance" value={fmtDate(vehicle.next_maintenance)} />
          <Field label="Current Odometer" value={vehicle.current_odometer} />
          <Field label="Service Interval (km)" value={vehicle.maintenance_interval_km} />
          <Field label="Service Interval (days)" value={vehicle.maintenance_interval_days != null ? String(vehicle.maintenance_interval_days) : ''} />
          <Field label="Last Service Odometer" value={vehicle.last_service_odometer} />
          <Field label="Next Service Odometer" value={vehicle.next_service_odometer} />
          <Field label="Service Vendor" value={vehicle.service_vendor} />
        </div>
      </SectionCard>

      <SectionCard title="Financial">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Monthly EMI" value={vehicle.monthly_emi} />
          <Field label="Fuel Card Number" value={vehicle.fuel_card_number} />
          <Field label="Operating Cost / km" value={vehicle.operating_cost_per_km} />
        </div>
      </SectionCard>

      <SectionCard title="Emergency">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Contact Name" value={vehicle.emergency_contact_name} />
          <Field label="Contact Phone" value={vehicle.emergency_contact_phone} />
          <Field label="First-aid Kit" value={vehicle.first_aid_available ? 'Available' : 'No'} />
          <Field label="Fire Extinguisher Expiry" value={fmtDate(vehicle.fire_extinguisher_expiry)} />
        </div>
      </SectionCard>

      <SectionCard title="Documents">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DocLink label="RC Document" path={vehicle.rc_document_url} />
          <DocLink label="Insurance Document" path={vehicle.insurance_document_url} />
          <DocLink label="Fitness Certificate" path={vehicle.fitness_certificate_url} />
          <DocLink label="Permit Document" path={vehicle.permit_document_url} />
        </div>
      </SectionCard>

      <SectionCard title="Identifiers & notes">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Chassis Number" value={vehicle.chassis_number} />
          <Field label="Engine Number" value={vehicle.engine_number} />
        </div>
        {vehicle.remarks && <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{vehicle.remarks}</p>}
      </SectionCard>
```

> Keep the existing "Record" (created/updated) SectionCard below these. Ensure the `import type { VehicleRow }` line stays.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "vehicles/\[vehicleId\]/page"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/vehicles/[vehicleId]/page.tsx"
git commit -m "feat(vehicles): detail view — advanced field sections + document links"
```

---

## Task 9: Import — accept new columns

**Files:**
- Modify: `app/api/admin/vehicles/import/route.ts`

- [ ] **Step 1: Extend the `valid.push({ … payload })` block** inside `importVehicles` (the object built after the capacity check, lines ~95–116). Replace the existing `payload` object with this expanded version (keeps the existing required-field checks above it unchanged):

```typescript
      valid.push({
        idx: i,
        reg,
        payload: {
          registration_number: reg,
          model,
          capacity,
          vehicle_type: enumOrNull(pick(r, 'vehicle_type', 'vehicleType'), ['bus','van','car','truck','ambulance','other']),
          manufacturer: str(pick(r, 'manufacturer')) || null,
          model_year: intOrNull(pick(r, 'model_year', 'modelYear')),
          color: str(pick(r, 'color')) || null,
          gross_vehicle_weight: numOrNull(pick(r, 'gross_vehicle_weight', 'grossVehicleWeight')),
          fuel_type: FUEL_TYPES.includes(fuel) ? fuel : 'diesel',
          status: STATUSES.includes(status) ? status : 'active',
          mileage: mileage != null && mileage !== '' ? parseFloat(String(mileage)) || 0 : 0,
          ownership_type: enumOrNull(pick(r, 'ownership_type', 'ownershipType'), ['owned','leased','rented']),
          purchase_date: toDate(pick(r, 'purchase_date', 'purchaseDate')),
          purchase_cost: numOrNull(pick(r, 'purchase_cost', 'purchaseCost')),
          vendor_name: str(pick(r, 'vendor_name', 'vendorName')) || null,
          warranty_expiry: toDate(pick(r, 'warranty_expiry', 'warrantyExpiry')),
          rc_expiry_date: toDate(pick(r, 'rc_expiry_date', 'rcExpiryDate')),
          permit_number: str(pick(r, 'permit_number', 'permitNumber')) || null,
          permit_expiry_date: toDate(pick(r, 'permit_expiry_date', 'permitExpiryDate')),
          pollution_certificate_number: str(pick(r, 'pollution_certificate_number', 'pollutionCertificateNumber')) || null,
          pollution_expiry_date: toDate(pick(r, 'pollution_expiry_date', 'pollutionExpiryDate')),
          road_tax_expiry_date: toDate(pick(r, 'road_tax_expiry_date', 'roadTaxExpiryDate')),
          fitness_expiry: toDate(pick(r, 'fitness_expiry', 'fitnessExpiry')),
          insurance_provider: str(pick(r, 'insurance_provider', 'insuranceProvider')) || null,
          insurance_policy_number: str(pick(r, 'insurance_policy_number', 'insurancePolicyNumber')) || null,
          insurance_expiry: toDate(pick(r, 'insurance_expiry', 'insuranceExpiry')),
          insurance_amount: numOrNull(pick(r, 'insurance_amount', 'insuranceAmount')),
          assignment_date: toDate(pick(r, 'assignment_date', 'assignmentDate')),
          gps_device_id: str(pick(r, 'gps_device_id', 'gpsDeviceId')) || null,
          live_tracking_enabled: toBool(pick(r, 'live_tracking_enabled', 'liveTrackingEnabled')),
          gps_provider: str(pick(r, 'gps_provider', 'gpsProvider')) || null,
          sim_number: str(pick(r, 'sim_number', 'simNumber')) || null,
          last_maintenance: toDate(pick(r, 'last_maintenance', 'lastMaintenance')),
          next_maintenance: toDate(pick(r, 'next_maintenance', 'nextMaintenance')),
          current_odometer: numOrNull(pick(r, 'current_odometer', 'currentOdometer')),
          maintenance_interval_km: numOrNull(pick(r, 'maintenance_interval_km', 'maintenanceIntervalKm')),
          maintenance_interval_days: intOrNull(pick(r, 'maintenance_interval_days', 'maintenanceIntervalDays')),
          last_service_odometer: numOrNull(pick(r, 'last_service_odometer', 'lastServiceOdometer')),
          next_service_odometer: numOrNull(pick(r, 'next_service_odometer', 'nextServiceOdometer')),
          service_vendor: str(pick(r, 'service_vendor', 'serviceVendor')) || null,
          monthly_emi: numOrNull(pick(r, 'monthly_emi', 'monthlyEmi')),
          fuel_card_number: str(pick(r, 'fuel_card_number', 'fuelCardNumber')) || null,
          operating_cost_per_km: numOrNull(pick(r, 'operating_cost_per_km', 'operatingCostPerKm')),
          emergency_contact_name: str(pick(r, 'emergency_contact_name', 'emergencyContactName')) || null,
          emergency_contact_phone: str(pick(r, 'emergency_contact_phone', 'emergencyContactPhone')) || null,
          first_aid_available: toBool(pick(r, 'first_aid_available', 'firstAidAvailable')),
          fire_extinguisher_expiry: toDate(pick(r, 'fire_extinguisher_expiry', 'fireExtinguisherExpiry')),
          chassis_number: str(pick(r, 'chassis_number', 'chassisNumber')) || null,
          engine_number: str(pick(r, 'engine_number', 'engineNumber')) || null,
          remarks: str(pick(r, 'remarks')) || null,
          updated_by: auth.userId,
        },
      });
```

> **Note:** `assigned_driver_id` / `assigned_driver_name` and document URLs are intentionally **omitted from import** — driver assignment must resolve a real staff id (the FK would reject arbitrary text) and documents are uploaded via the UI. Importers manage those in the form.

- [ ] **Step 2: Add the three helper functions** near the top of the file (after `toDate`, ~line 50):

```typescript
function intOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function enumOrNull(v: unknown, allowed: string[]): string | null {
  const x = str(v).toLowerCase();
  return x && allowed.includes(x) ? x : null;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "vehicles/import"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/vehicles/import/route.ts
git commit -m "feat(vehicles): import accepts advanced columns (enum/int/num/date coercion)"
```

---

## Task 10: Export — full template + exportVehicles()

**Files:**
- Modify: `app/(admin)/vehicles/vehicle-export.ts`
- Modify: `app/(admin)/vehicles/page.tsx` (wire an Export button)

- [ ] **Step 1: Replace `vehicle-export.ts`** with the extended template + a real export

```typescript
import * as XLSX from 'xlsx';
import type { VehicleRow } from './columns';

// Import/export helpers for the Vehicles module. Template columns match the
// import endpoint's accepted keys so export → edit in Excel → re-import round-trips.

function today() {
  return new Date().toISOString().split('T')[0];
}

// Columns emitted by export AND understood by the import endpoint (snake_case).
// Excludes assigned_driver_* and *_document_url (managed in the form, not import).
const EXPORT_COLUMNS: (keyof VehicleRow)[] = [
  'registration_number', 'vehicle_type', 'manufacturer', 'model', 'model_year', 'color',
  'capacity', 'gross_vehicle_weight', 'fuel_type', 'status', 'mileage',
  'ownership_type', 'purchase_date', 'purchase_cost', 'vendor_name', 'warranty_expiry',
  'rc_expiry_date', 'permit_number', 'permit_expiry_date', 'pollution_certificate_number',
  'pollution_expiry_date', 'road_tax_expiry_date', 'fitness_expiry',
  'insurance_provider', 'insurance_policy_number', 'insurance_expiry', 'insurance_amount',
  'assignment_date', 'gps_device_id', 'live_tracking_enabled', 'gps_provider', 'sim_number',
  'last_maintenance', 'next_maintenance', 'current_odometer', 'maintenance_interval_km',
  'maintenance_interval_days', 'last_service_odometer', 'next_service_odometer', 'service_vendor',
  'monthly_emi', 'fuel_card_number', 'operating_cost_per_km',
  'emergency_contact_name', 'emergency_contact_phone', 'first_aid_available', 'fire_extinguisher_expiry',
  'chassis_number', 'engine_number', 'remarks',
];

export function downloadVehicleTemplate() {
  const example: Record<string, unknown> = {
    registration_number: 'TN01AB1234', vehicle_type: 'bus', manufacturer: 'Tata', model: 'Starbus',
    model_year: 2022, color: 'White', capacity: 40, gross_vehicle_weight: 16200,
    fuel_type: 'diesel', status: 'active', mileage: 12.5,
    ownership_type: 'owned', purchase_date: '2022-06-01', purchase_cost: 3500000, vendor_name: 'ABC Motors',
    warranty_expiry: '2027-06-01', rc_expiry_date: '2037-06-01', permit_number: 'PMT123',
    permit_expiry_date: '2027-03-31', pollution_certificate_number: 'PUC123', pollution_expiry_date: '2026-12-31',
    road_tax_expiry_date: '2027-06-01', fitness_expiry: '2027-03-31',
    insurance_provider: 'United India', insurance_policy_number: 'POL123', insurance_expiry: '2027-03-31',
    insurance_amount: 500000, assignment_date: '', gps_device_id: '', live_tracking_enabled: false,
    gps_provider: 'Mercyda', sim_number: '9000000000', last_maintenance: '2026-01-15',
    next_maintenance: '2026-07-15', current_odometer: 45000, maintenance_interval_km: 10000,
    maintenance_interval_days: 180, last_service_odometer: 40000, next_service_odometer: 50000,
    service_vendor: 'ABC Service', monthly_emi: 0, fuel_card_number: '', operating_cost_per_km: 18.5,
    emergency_contact_name: 'Control Room', emergency_contact_phone: '9000000001', first_aid_available: true,
    fire_extinguisher_expiry: '2027-01-01', chassis_number: 'MA3FKA1BHGM123456', engine_number: '497TCIC123456',
    remarks: 'Spare bus',
  };
  const ws = XLSX.utils.json_to_sheet([example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');
  XLSX.writeFile(wb, `vehicles-import-template-${today()}.xlsx`);
}

// Export the current fleet to Excel using the same columns as the template.
export function exportVehicles(rows: VehicleRow[]) {
  const data = rows.map((v) => {
    const o: Record<string, unknown> = {};
    for (const c of EXPORT_COLUMNS) o[c] = v[c] ?? '';
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: EXPORT_COLUMNS as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');
  XLSX.writeFile(wb, `vehicles-export-${today()}.xlsx`);
}
```

- [ ] **Step 2: Wire an Export button** in `app/(admin)/vehicles/page.tsx`. Add the import near the top:

```typescript
import { Download } from 'lucide-react';
import { exportVehicles } from './vehicle-export';
```

Then inside the `canManage` action group (next to the Import button, ~line 134), add:

```tsx
            <button
              onClick={() => exportVehicles(vehicles)}
              disabled={vehicles.length === 0}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Export
            </button>
```

- [ ] **Step 3: Add a Vehicle Type filter** to the `DataTable` `filters` array in `page.tsx` (after the `fuel_type` filter, ~line 202):

```tsx
          {
            columnId: 'vehicle_type',
            title: 'Type',
            options: [
              { label: 'Bus', value: 'bus' }, { label: 'Van', value: 'van' },
              { label: 'Car', value: 'car' }, { label: 'Truck', value: 'truck' },
              { label: 'Ambulance', value: 'ambulance' }, { label: 'Other', value: 'other' },
            ],
          },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "vehicle-export|vehicles/page"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/(admin)/vehicles/vehicle-export.ts "app/(admin)/vehicles/page.tsx"
git commit -m "feat(vehicles): full export + template + Vehicle Type list filter"
```

---

## Task 11: Full verification & handoff

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck — confirm no new errors in touched files**

Run: `npm run type-check 2>&1 | grep -E "vehicles|lib/vehicles" || echo "OK: no vehicle-module type errors"`
Expected: `OK: no vehicle-module type errors`.

- [ ] **Step 2: Route probes (dev server running)**

Run:
```bash
for p in /api/admin/vehicles "/api/admin/vehicles/documents?path=x" /vehicles /vehicles/new; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$p")"
done
```
Expected: each `307` or `401` (never `404`/`500`).

- [ ] **Step 3: DB sanity — confirm a write round-trips through the new columns**

Use MCP `execute_sql` to confirm the schema is queryable with the new columns and the FK is enforced:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='tms_vehicle' and column_name='assigned_driver_id';
-- FK negative check (should ERROR with a FK violation, proving integrity):
-- insert into public.tms_vehicle (registration_number, model, assigned_driver_id)
--   values ('ZZ-FK-TEST', 'x', gen_random_uuid());
```
Expected: the column exists; the commented insert (if you choose to run it) fails with a foreign-key violation — then `delete from public.tms_vehicle where registration_number='ZZ-FK-TEST';` to clean up if it somehow inserted.

- [ ] **Step 4: User visual pass (handoff)**

Hand off to the user for the authenticated browser check (agent's browser can't auth):
- Create a vehicle filling every section; upload one PDF to RC Document; save.
- Open detail → all sections render; "View document" opens the PDF in a new tab.
- Edit → values pre-fill; change driver; save.
- Export → re-import the file → row updates (not duplicated).

- [ ] **Step 5: Final commit (if any doc tweaks)**

```bash
git add -A && git commit -m "chore(vehicles): advanced fields — verification notes" || echo "nothing to commit"
```

---

## Self-review notes (author)

- **Spec coverage:** every §3 group → Task 1 columns + Task 7 form + Task 8 detail; documents (§5) → Tasks 2/3/4 + form/detail wiring; driver FK (§4) → Task 1 FK + Task 7 picker; import/export (§8) → Tasks 9/10; migrations/verification (§9/§10) → Tasks 1/2/11. No uncovered requirement.
- **Type consistency:** `VehicleRow` (Task 6) is the single row type reused by the form (Task 7), detail (Task 8), and export (Task 10). `buildVehiclePayload` (Task 5) consumes the same snake_case keys the form emits (Task 7) — verified key-by-key against the master table.
- **Known risk to watch:** the inline `Text/Num/DateF` render helpers in Task 7 (focus retention) — mitigation documented in the task note (hoist to module-level components if focus loss appears).
- **Contract change:** POST now snake_case (Task 5) — only caller is the form, updated in the same plan (Task 7).
