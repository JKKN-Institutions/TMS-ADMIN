# Driver Onboarding in TMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a transport admin create and edit a driver's full MyJKKN employee record from the TMS drivers module, writing the shared `staff` table so the record shows in MyJKKN.

**Architecture:** Pure validation/payload functions in `lib/drivers/` (vitest-covered) feed three new server handlers that write `staff`, `tms_driver`, `user_roles` and the `staff-images` bucket with the service-role client. One shared client form renders the person sections plus the existing transport section for both create and edit.

**Tech Stack:** Next.js App Router (route handlers, client pages), Supabase JS (service-role), TanStack Query, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-driver-onboarding-design.md` — read it first; this plan argues from it.

## Global Constraints

- Work only in `D:\Sangeetha_V\TMS-ADMIN\.worktrees\driver-onboarding` on branch `feat/driver-onboarding`. Never `git stash`, never check out another branch, never push. Commit with explicit paths (`git add <paths>`), never `git add -A`.
- The Supabase project is the REAL production database shared with MyJKKN. No test person may remain in it. No DDL is needed for this feature; do not run migrations.
- Every write to `staff` uses `createServiceRoleClient()` and stamps `updated_by` (and `created_by` on insert) with `auth.userId`.
- TMS never sends `staff_id`, `profile_id`, `role_key`, `category_id`, `institution_id`, `department_id`, `login_enabled`, `status` from client input. On insert the server sets: `institution_id = b962527f-97ce-4238-89ce-7b532d7c2bc6`, `category_id = 42e1232f-3a16-4399-9543-e0586357caed`, `role_key = 'driver'`, `department_id = null`, `login_enabled = true`. `employment_type` is left to the DB default (`full_time`; all 911 staff rows hold that value, so the form has no Employment type field).
- Driver role id in `custom_roles`: `3c672362-4f74-4885-843e-50ea0e2dab29` — resolve it by `role_key = 'driver'` at request time, do not hard-code.
- Permission for every new handler: `auth.isSuperAdmin` or RPC `user_has_permission({ permission_name: 'tms.drivers.manage' })`, else 403.
- Response shape: `{ success: true, data }` or `{ error: string, field?: string }`.
- Enums: gender `male|female|bigender`; marital status `single|married|divorced|widow`; blood group `A+ A- B+ B- AB+ AB- O+ O- A1+ A1B`; relationship options `Father, Mother, Spouse, Brother, Sister, Son, Daughter, Guardian, Friend, Other`.
- Institution email suffix is exactly `@jkkn.ac.in`.
- `npm run lint` and repo-wide `tsc` are broken here. Verify with `npm test` (vitest) and a scoped typecheck: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "drivers|lib/data/locations"` must print nothing.
- UI: reuse `DriverPageHeader`, `SectionCard`, `Field` from `app/(admin)/drivers/driver-page-header.tsx`, the `.input` class and the green button styles already in `driver-form.tsx`. Every coloured tint needs a `dark:` variant. Use `min-w-0`/`truncate` so nothing overflows on mobile.
- JKKN wording in UI copy: "team member" is fine; do not introduce new terminology.

## Review Focus

1. Email typed with capitals or spaces (`" Ravi.K@JKKN.AC.IN "`) — must be trimmed and lowercased before the duplicate check and the insert, and a duplicate must be caught case-insensitively. (Task 2 tests; Task 4 duplicate check.)
2. Name-part box containing a full address or an `@` (`ravi@jkkn.ac.in` typed into the name part) — must be rejected with a field message, never saved as `ravi@jkkn.ac.in@jkkn.ac.in`. (Task 2.)
3. Whitespace-only optional values (`"   "` in emergency name, address, blood group `""`) — saved as NULL, never as blank text; the DB CHECK rejects blanks. (Task 2.)
4. Edit of a person who is `role_key='driver'` but not in the Driver category — person fields in the request body are ignored and the response says so; transport fields still save. (Task 2 `canFullEdit`; Task 5.)
5. Staff insert succeeded but `tms_driver` or `user_roles` write failed — the user sees "created, but…" and lands on the edit page; saving again completes it without a duplicate. (Task 4.)

---

### Task 0: Workspace readiness

**Files:** none committed.

- [ ] **Step 1:** The worktree has no `node_modules`. Sibling worktrees link to the main checkout's. From the worktree root run `cmd //c "mklink /J node_modules D:\Sangeetha_V\TMS-ADMIN\node_modules"`. Confirm `git status --short` does not list `node_modules` (it is ignored).
- [ ] **Step 2:** Run `npm test`. Expected: the existing suite passes. Record the passing count as the baseline.

### Task 1: Constants, location data, shared types

**Files:**
- Create: `lib/drivers/onboarding-constants.ts`
- Create: `lib/data/locations.ts` (copy of `D:/Sangeetha_V/MyJKKN/lib/data/locations.ts`, unchanged except removing exports nothing in TMS uses is NOT required — copy verbatim)
- Modify: `types/index.ts` (`DriverListItem`)
- Modify: `lib/drivers/map.ts` (`STAFF_SELECT`, `StaffRow`, `mapStaffToDriver`)
- Test: `lib/drivers/map.test.ts`

**Interfaces — Produces:**

```ts
// lib/drivers/onboarding-constants.ts
export const DRIVER_INSTITUTION_ID = 'b962527f-97ce-4238-89ce-7b532d7c2bc6';
export const DRIVER_CATEGORY_ID = '42e1232f-3a16-4399-9543-e0586357caed';
export const DRIVER_ROLE_KEY = 'driver';
export const INSTITUTION_EMAIL_SUFFIX = '@jkkn.ac.in';
export const STAFF_IMAGE_BUCKET = 'staff-images';
export const GENDERS = ['male', 'female', 'bigender'] as const;
export const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widow'] as const;
export const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','A1+','A1B'] as const;
export const RELATIONSHIPS = ['Father','Mother','Spouse','Brother','Sister','Son','Daughter','Guardian','Friend','Other'] as const;

// types/index.ts — added to DriverListItem
person: DriverPerson;      // the MyJKKN staff fields the form edits
canFullEdit: boolean;      // role_key='driver' AND category_id = DRIVER_CATEGORY_ID

export interface DriverPerson {
  firstName: string; lastName: string;
  gender: string; dateOfBirth: string | null; maritalStatus: string; bloodGroup: string | null;
  phone: string; email: string; institutionEmail: string | null;
  address: string | null; state: string | null; district: string | null; pincode: string | null;
  emergencyContactName: string | null; emergencyContactRelationship: string | null; emergencyContactPhone: string | null;
  staffCode: string | null;            // staff.staff_id (the NOTJMO### code)
  dateOfJoining: string | null; designation: string;
  biometricId: string | null; biometricInstitutionId: string | null;
  isActive: boolean; photoUrl: string | null;
}
```

`StaffRow` gains the matching snake_case columns plus `category_id` and `role_key`; `STAFF_SELECT` lists them. Existing `DriverListItem` fields stay so the list page and columns keep working.

- [ ] **Step 1: Write the failing test** `lib/drivers/map.test.ts`:
  - `mapStaffToDriver` with a row in the Driver category and `role_key: 'driver'` → `canFullEdit === true`, `person.staffCode === 'NOTJMO001'`, `person.institutionEmail` passed through, `person.emergencyContactName === null` for a null column.
  - Same row with `category_id` of another category → `canFullEdit === false`.
  - Row with `role_key: 'faculty'` in the Driver category → `canFullEdit === false`.
- [ ] **Step 2:** `npx vitest run lib/drivers/map.test.ts` → FAIL (`person` undefined).
- [ ] **Step 3:** Create the constants file, copy `locations.ts`, extend the types, `STAFF_SELECT`, `StaffRow`, `mapStaffToDriver`.
- [ ] **Step 4:** Test passes; scoped typecheck prints nothing.
- [ ] **Step 5:** Commit `feat(drivers): staff person fields in the driver DTO`.

### Task 2: Person-field validation and payload builders (pure)

**Files:**
- Create: `lib/drivers/staff-fields.ts`
- Test: `lib/drivers/staff-fields.test.ts`

**Interfaces — Consumes:** constants from Task 1. **Produces:**

```ts
/** Raw camelCase form values; everything is a string except isActive. */
export interface DriverPersonInput {
  firstName: string; lastName: string; gender: string; dateOfBirth: string; maritalStatus: string; bloodGroup: string;
  phone: string; email: string;
  institutionEmailName: string;        // the part before @jkkn.ac.in (create only)
  address: string; state: string; district: string; pincode: string;
  emergencyContactName: string; emergencyContactRelationship: string; emergencyContactRelationshipOther: string; emergencyContactPhone: string;
  dateOfJoining: string; designation: string;
  biometricId: string; biometricInstitutionId: string;
  isActive: boolean;
}
export type FieldErrors = Partial<Record<keyof DriverPersonInput, string>>;

/** Snake_case staff columns TMS is allowed to write. */
export type StaffWritable = { first_name: string; last_name: string; gender: string; date_of_birth: string; marital_status: string;
  blood_group: string | null; phone: string; email: string; address: string | null; state: string; district: string; pincode: string | null;
  emergency_contact_name: string | null; emergency_contact_relationship: string | null; emergency_contact_phone: string | null;
  date_of_joining: string; designation: string; biometric_id: string | null; biometric_institution_id: string | null; is_active: boolean };

export function validatePerson(input: unknown, mode: 'create' | 'edit', today?: string): { ok: true; value: DriverPersonInput } | { ok: false; errors: FieldErrors };
export function toStaffColumns(v: DriverPersonInput): StaffWritable;                       // normalised, blanks → null
export function buildStaffInsert(v: DriverPersonInput, actorId: string): StaffWritable & { institution_email: string; institution_id: string; category_id: string; role_key: string; department_id: null; login_enabled: true; created_by: string; updated_by: string };
export function diffStaffPatch(v: DriverPersonInput, current: Record<string, unknown>): Partial<StaffWritable>;   // only columns whose normalised value differs
export function canFullEdit(row: { role_key: string | null; category_id: string | null }): boolean;
export function normalizeEmail(s: string): string;                                          // trim + lowercase
```

Rules (from the spec, MyJKKN's `staff-form-schema.ts` and `applyStaffRules`):
- `validatePerson` reads only the known keys from `input` (unknown keys such as `staff_id`, `role_key`, `profile_id` are dropped, which is the whitelist).
- firstName min 2 chars after trim; lastName min 1; gender/maritalStatus in their enums; bloodGroup empty or in enum.
- dateOfBirth `YYYY-MM-DD`, between `1900-01-01` and `today`; dateOfJoining `YYYY-MM-DD`, not after `today`.
- phone: at least 10 digits after stripping non-digits; stored as the trimmed input.
- `institutionEmailName` (mode `create` only): required; trimmed and lowercased; must match `/^[a-z0-9._-]+$/` — so an `@` or a space is an error with message `Type only the name part, without @jkkn.ac.in`. In mode `edit` it is ignored.
- email: optional; if present must be a valid address. In `buildStaffInsert`, blank email → the institution email.
- state and district required; pincode optional, digits only when present.
- Emergency contact: if any of name/relationship/phone is non-blank then name and phone are required and phone needs 10 digits; relationship `Other` requires `emergencyContactRelationshipOther`, whose text is what is stored; all-blank → three NULLs.
- Biometric: code and machine both or neither; blank code → both NULL.
- designation min 2 chars.
- `diffStaffPatch` compares normalised values and treats `null`, `undefined` and `''` in `current` as equal to `null`; a date column in `current` compares on its first 10 characters. Never emits `institution_email`.

- [ ] **Step 1: Write the failing tests** (one `it` each, exact assertions):
  - valid minimal create input → `ok: true`.
  - `firstName: 'A'` → `errors.firstName` set.
  - `gender: 'other'` → `errors.gender`.
  - `dateOfBirth: '2999-01-01'` with `today='2026-11-19'` → `errors.dateOfBirth`; `dateOfJoining: '2026-11-20'` → `errors.dateOfJoining`.
  - `phone: '98765'` → `errors.phone`; `phone: '98765 43210'` → ok.
  - `institutionEmailName: 'ravi@jkkn.ac.in'` → `errors.institutionEmailName === 'Type only the name part, without @jkkn.ac.in'`.
  - `institutionEmailName: '  Ravi.K '` → `buildStaffInsert(...).institution_email === 'ravi.k@jkkn.ac.in'`.
  - blank `email` → `buildStaffInsert(...).email === 'ravi.k@jkkn.ac.in'`; `email: ' Ravi@Gmail.com '` → `'ravi@gmail.com'`.
  - emergency name only → `errors.emergencyContactPhone`; all three `'   '` → `toStaffColumns` gives three `null`s.
  - relationship `Other` + other text `'Uncle'` → stored `'Uncle'`; `Other` with blank text → `errors.emergencyContactRelationshipOther`.
  - biometric code without machine → `errors.biometricInstitutionId`.
  - `bloodGroup: ''` → `blood_group: null`; `address: '  '` → `null`.
  - `buildStaffInsert` output has `institution_id`, `category_id`, `role_key: 'driver'`, `department_id: null`, `login_enabled: true`, `created_by` and `updated_by` = actor, and no keys `staff_id`, `profile_id`, `employment_type`, `status`.
  - `validatePerson({ ...valid, staff_id: 'X', role_key: 'super_admin', profile_id: 'p' }, 'create')` → `value` has none of those keys.
  - `diffStaffPatch` with identical values → `{}`; with only phone changed → `{ phone: '…' }`; `current.address = ''` and input address blank → no `address` key; `current.date_of_birth = '1980-05-01T00:00:00'` vs input `'1980-05-01'` → no key.
  - `canFullEdit({ role_key: 'driver', category_id: DRIVER_CATEGORY_ID })` true; other category false; `role_key: 'faculty'` false.
- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3:** Implement `lib/drivers/staff-fields.ts`.
- [ ] **Step 4:** Run → all pass.
- [ ] **Step 5:** Commit `feat(drivers): validation and payload builders for staff person fields`.

### Task 3: Database error translation and transport-only payload (pure)

**Files:**
- Create: `lib/drivers/db-errors.ts`
- Modify: `lib/drivers/map.ts` (add `buildTransportPayload`)
- Test: `lib/drivers/db-errors.test.ts`, extend `lib/drivers/map.test.ts`

**Interfaces — Produces:**

```ts
// lib/drivers/db-errors.ts
export function translateStaffDbError(err: { code?: string; message?: string; details?: string }): { status: number; error: string; field?: keyof DriverPersonInput };

// lib/drivers/map.ts
/** Only the transport columns the form owns. Never includes rating, total_trips,
 *  location_sharing_enabled, address, emergency_contact_name, emergency_contact_phone. */
export function buildTransportPayload(staffId: string, f: Record<string, unknown>): {
  staff_id: string; license_number: string | null; license_expiry: string | null; experience_years: number;
  driver_status: 'active' | 'inactive' | 'on_leave'; assigned_route_id: string | null; aadhar_number: string | null;
  medical_certificate_expiry: string | null; notes: string | null };
```

`translateStaffDbError` mapping:
- code `23505` + message containing `staff_email_key` → 409, field `email`, `This personal email is already used by another team member.`
- `23505` + `staff_institution_email_key` or `profiles_email` → 409, field `institutionEmailName`, `This institution email already belongs to someone in MyJKKN.`
- `23505` + `staff_biometric_uq` → 409, field `biometricId`, `This biometric code is already used on that machine.`
- code `P0001`, `42501`, `55000`, `23514`, or a message that begins `This person is a hire` → 422 with the database's own message as `error` (these are MyJKKN's human-written refusals).
- anything else → 500 `Failed to save the team member record.`

`buildTransportPayload`: invalid `driverStatus` falls back to `'active'`; `experienceYears` non-numeric → 0. `buildOpsPayload` stays for the pick-existing POST and the import.

- [ ] **Step 1:** Failing tests: one per mapping row above; `buildTransportPayload` output has exactly the nine keys listed (assert `Object.keys(...).sort()`), `driverStatus: 'banana'` → `'active'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → pass.
- [ ] **Step 5:** Commit `feat(drivers): staff DB error translation and transport-only payload`.

### Task 4: Create route — `POST /api/admin/drivers/onboard`

**Files:**
- Create: `app/api/admin/drivers/onboard/route.ts`
- Create: `lib/drivers/onboard.ts` (server-only orchestration, takes the service client as a parameter)

**Interfaces — Consumes:** Tasks 1–3. **Produces:**

```ts
// request body
{ person: DriverPersonInput; transport: Record<string, unknown> }
// 200
{ success: true, data: { id: string; staffCode: string | null; warning?: string } }
// 400 { error: 'Please correct the highlighted fields', fields: FieldErrors }
// 409/422/500 from translateStaffDbError, or the "existing account" refusal below

// lib/drivers/onboard.ts
export async function findExistingAccount(svc, emails: string[]): Promise<'staff' | 'profile' | null>;
export async function ensureDriverRole(svc, profileId: string, actorId: string): Promise<void>;   // inserts user_roles(driver, is_primary) only if the profile has no user_roles row
export async function onboardDriver(svc, person: DriverPersonInput, transport: Record<string, unknown>, actorId: string): Promise<{ id: string; staffCode: string | null; warning?: string }>;
```

Behaviour, in order (spec "Behaviour on save → Create"):
1. Permission check (403). `validatePerson(body.person, 'create')` (400 with `fields`).
2. `findExistingAccount` with the normalised institution email and personal email: match `staff.email` and `staff.institution_email` with `.ilike()` on an escaped pattern (escape `%`, `_`, `\`), and `profiles.email` the same way. Any hit → 409 `{ error: 'This email already belongs to someone in MyJKKN. Use "Existing staff member" to make them a driver, or ask HR.', field: 'institutionEmailName' }`.
3. Confirm the institution row and the Driver category row exist; missing → 500 `Driver institution/category is not set up in MyJKKN.`
4. Insert `buildStaffInsert(...)`, `.select('id, staff_id, profile_id').single()`. On error → `translateStaffDbError`.
5. Upsert `tms_driver` with `{ ...buildTransportPayload(id, transport), profile_id, created_by, updated_by }`, `onConflict: 'staff_id'`.
6. `ensureDriverRole(profile_id)`.
7. `logActivity` (`module: 'drivers'`, `action: 'create'`, `entityType: 'staff'`, `entityId: id`, description `Onboarded driver <FIRST LAST> (<staff code>)`).
8. If step 5 or 6 failed: still return 200 with `warning: 'The team member record was created, but the transport details were not saved. Open Edit and save again.'` and log the error. Never delete the staff row.

- [ ] **Step 1:** Implement `lib/drivers/onboard.ts` and the route (`export const POST = withAuth(...)`).
- [ ] **Step 2: Probe without a session.** Start the dev server on a free port (`npx next dev -p 3111`; confirm the page `<title>` is the admin app), then `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3111/api/admin/drivers/onboard -H "Content-Type: application/json" -d "{}"` → `401` (or the proxy's redirect code; record which). The handler must not be reachable unauthenticated.
- [ ] **Step 3: Rolled-back proof of the insert payload.** First read `fn_next_staff_code` (`select pg_get_functiondef(oid) from pg_proc where proname='fn_next_staff_code'`). If it draws from a SEQUENCE (`nextval`), STOP and report to the user — a rollback would leave a gap in staff codes. If it is table/`max()`-based, run via Supabase `execute_sql` a single `DO $$ … $$` block that inserts one row with the exact column set `buildStaffInsert` produces (email `dryrun.tms.driver@jkkn.ac.in`), captures `staff_id` and `profile_id`, then `RAISE EXCEPTION 'DRYRUN staff_id=% profile=%'`. Expected: the error text shows a `NOTJMO###` code and a non-null profile. Then verify `select count(*) from staff where email ilike 'dryrun.tms.driver%'` and the same on `profiles` both return 0.
- [ ] **Step 4:** Scoped typecheck prints nothing. Commit `feat(drivers): onboard a new driver into the shared staff table`.

### Task 5: Edit route — `PATCH /api/admin/drivers/[driverId]`

**Files:**
- Modify: `app/api/admin/drivers/[driverId]/route.ts` (add `PATCH`; `GET` now returns the Task 1 DTO automatically)

**Interfaces — Produces:**

```ts
// request body
{ person?: DriverPersonInput; transport: Record<string, unknown> }
// 200
{ success: true, data: { id: string; personSaved: boolean; changed: string[] } }
```

Behaviour:
- `authFromRequest(request)` → 401 if null; permission check → 403.
- Load the staff row (`*`) by id with `role_key = 'driver'`; none → 404.
- If `canFullEdit(row)` and `body.person` is present: `validatePerson(body.person, 'edit')` (400 with `fields`), then `diffStaffPatch(value, row)`. If the patch has an `email` key, run `findExistingAccount` for that email excluding this staff id and this profile id → 409 on a hit. If the patch is non-empty, `update({ ...patch, updated_by: auth.userId }).eq('id', id).eq('role_key', 'driver')`; errors → `translateStaffDbError`.
- If `canFullEdit(row)` is false, `body.person` is ignored and `personSaved` is `false`.
- Upsert `tms_driver` with `{ ...buildTransportPayload(id, body.transport), profile_id: row.profile_id, updated_by }`, `onConflict: 'staff_id'`.
- If the row has a `profile_id`, call `ensureDriverRole` (completes a create that warned).
- `logActivity` (`action: 'update'`, description lists the changed column names).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Probe unauthenticated `PATCH` → same code as Task 4 Step 2.
- [ ] **Step 3:** Scoped typecheck prints nothing. Commit `feat(drivers): edit a driver's staff record from TMS`.

### Task 6: Photo route — `POST /api/admin/drivers/[driverId]/photo`

**Files:**
- Create: `app/api/admin/drivers/[driverId]/photo/route.ts`

Behaviour (pattern: `app/api/admin/driver-mobiles/image/route.ts`; storage rule: MyJKKN `uploadStaffImage`):
- Auth + permission as Task 5; staff row must exist with `role_key='driver'` and `canFullEdit` true, else 403 `This person's photo is managed in MyJKKN.`
- Multipart field `file`; allowed types `image/jpeg`, `image/png`, `image/gif`; max 5 MB (MyJKKN's limits) → 400 with a plain message otherwise.
- List and remove existing objects under `<staffId>/` in bucket `staff-images`, upload to `<staffId>/<Date.now()>.<ext>` with `cacheControl: '3600'`, get the public URL, `update({ profile_picture: url, updated_by })` on the staff row.
- Returns `{ success: true, data: { url } }`. `logActivity` `action: 'update'`, description `Updated driver photo`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Probe unauthenticated → blocked. Scoped typecheck prints nothing.
- [ ] **Step 3:** Commit `feat(drivers): upload a driver photo to the shared staff-images bucket`.

### Task 7: Shared form — person sections + transport section

**Files:**
- Create: `app/(admin)/drivers/driver-person-fields.tsx` (the four person `SectionCard`s; controlled by props)
- Modify: `app/(admin)/drivers/driver-form.tsx`

**Interfaces — Produces:**

```tsx
// driver-person-fields.tsx
export function emptyPerson(): DriverPersonInput;                 // defaults: gender 'male', maritalStatus 'single', designation 'Bus Driver', isActive true
export function personFromDriver(d: DriverListItem): DriverPersonInput;   // emergency/address fall back to d.ops copies when the staff value is empty
export default function DriverPersonFields(props: { mode: 'create' | 'edit'; value: DriverPersonInput; errors: FieldErrors; staffCode: string | null; institutionEmail: string | null; onChange: (k: keyof DriverPersonInput, v: string | boolean) => void; photo: { currentUrl: string | null; file: File | null; onPick: (f: File | null) => void } }): JSX.Element;

// driver-form.tsx — new props
{ mode: 'create-new' | 'create-existing' | 'edit'; staffId?: string; driver?: DriverListItem }
```

Decisions:
- Sections and field order exactly as the spec's form table. Required fields carry a red `*`.
- Institution email on create: text input for the name part with a fixed `@jkkn.ac.in` suffix shown inside the same control; on edit a read-only `Field` with the note `Login identity — changed in MyJKKN only.`
- Staff ID: read-only; on create the text `Generated automatically on save`.
- State and District are `<select>`s from `lib/data/locations.ts`; District is disabled until a State is chosen and cleared when State changes. If the stored state/district name is not in the list, add it as an extra option so it is shown and preserved.
- Relationship `<select>` with the ten options; `Other` reveals a text input.
- Biometric machine `<select>`: `Not enrolled` + institutions from the existing institutions endpoint if the app has one (`grep -rn "from('institutions')" app/api`); if none exists, show only the driver institution (JKKN Main Office) as the single machine option.
- Photo: file input with a round preview; the file is held in state and uploaded after the record save (see below).
- Transport section: remove Rating, Total Trips and "Location sharing enabled"; remove Address and the two Emergency Contact inputs (they now live in the person sections). Keep Licence no., Licence expiry, Experience, Driver status, Assigned route, Aadhar no., Medical cert. expiry, Notes.
- Submit:
  - `create-new` → `POST /api/admin/drivers/onboard` `{ person, transport }`; then if a photo file is chosen `POST /api/admin/drivers/<id>/photo`; a photo failure is a toast (`Driver created, but the photo was not uploaded`) and does not block. If `data.warning` is present, toast it and go to `/drivers/<id>/edit`; otherwise toast `Driver created — Staff ID <code>` and go to `/drivers/<id>`.
  - `create-existing` → unchanged `POST /api/admin/drivers` with `{ staffId, fields }` (transport fields only; no person sections rendered).
  - `edit` → `PATCH /api/admin/drivers/<id>` `{ person?, transport }` (`person` only when `driver.canFullEdit`), then the photo upload if a file was chosen.
  - A 400 with `fields` sets inline errors under the inputs and scrolls to the first; a response with `field` sets that one inline; other errors toast.
  - On success invalidate `['drivers']` and `['driver', id]`.
- Client-side, run `validatePerson` before submitting so errors show without a round trip.

- [ ] **Step 1:** Build `driver-person-fields.tsx`.
- [ ] **Step 2:** Rework `driver-form.tsx` to the new props and submit logic.
- [ ] **Step 3:** Scoped typecheck prints nothing (callers are fixed in Task 8; if they error here, do Task 8 Step 1–2 before committing).
- [ ] **Step 4:** Commit together with Task 8.

### Task 8: Pages — create, edit, detail

**Files:**
- Modify: `app/(admin)/drivers/new/page.tsx`
- Modify: `app/(admin)/drivers/[driverId]/edit/page.tsx`
- Modify: `app/(admin)/drivers/[driverId]/page.tsx`

Decisions:
- **Create page:** a two-button segmented choice at the top — `New driver` (default) and `Existing staff member`. `New driver` renders `<DriverForm mode="create-new" />`. `Existing staff member` renders today's search-and-pick block unchanged, then `<DriverForm mode="create-existing" staffId={selected.id} />`. Subtitle: `Onboard a new driver, or make an existing team member a driver`.
- **Edit page:** if `driver.canFullEdit` render `<DriverForm mode="edit" driver={driver} />` with subtitle `Update the team member record and transport details`. Otherwise keep the read-only "Staff (read-only)" card with its existing note and render the form with transport sections only.
- **Detail page:** "Staff" card gains Staff ID, Institution email, Gender, Date of birth, Marital status, Blood group, Address, State, District, PIN code, Emergency contact (`Name (Relationship) · Phone`). The "Operational (TMS)" card drops the Emergency Contact field (shown once, above) and keeps the rest.

- [ ] **Step 1:** Update the three pages.
- [ ] **Step 2:** Scoped typecheck prints nothing; `npm test` passes with the baseline count plus the new tests.
- [ ] **Step 3:** With the dev server running, request `/drivers/new` unauthenticated and confirm it redirects to sign-in (the pages compile). Note for the hand-off: the agent cannot see signed-in pages.
- [ ] **Step 4:** Commit Tasks 7 and 8: `feat(drivers): onboarding form for create and edit, fuller detail page`.

### Task 9: Final verification and hand-off

- [ ] **Step 1:** `npm test` — all green. Scoped typecheck prints nothing. `git status --short` shows nothing untracked or modified outside committed work.
- [ ] **Step 2:** Confirm zero residue in production: `select count(*) from staff where email ilike 'dryrun.tms.driver%'` = 0; driver count still 30 (`select count(*) from staff where role_key='driver'`).
- [ ] **Step 3:** Use superpowers:requesting-code-review for a whole-branch review against the spec; fix what it finds.
- [ ] **Step 4:** Report to the user: what was built, what was verified and how, and the checks only they can do signed-in — open Create Driver, Edit and the detail page; onboard the first real driver; confirm the person appears in MyJKKN's staff list with the same fields. Do not merge or push without the user's say-so.
