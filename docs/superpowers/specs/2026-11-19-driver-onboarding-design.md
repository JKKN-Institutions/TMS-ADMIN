# Driver onboarding in TMS — design

Date: 2026-11-19 · Branch: `feat/driver-onboarding` · Status: awaiting approval

## Intent

Today a driver can only exist in TMS after HR has onboarded the person in MyJKKN. TMS "Create Driver" only picks an existing MyJKKN staff member, and TMS "Edit" only touches the transport fields; name, phone, email, designation, joining date and photo are read-only.

The transport office wants to onboard a new driver, and correct a driver's details, entirely inside TMS, using the same fields MyJKKN's "new employee" form has. Anything created or changed in TMS must show in MyJKKN.

TMS and MyJKKN share one Supabase database and one `staff` table, so "shows in MyJKKN" means "TMS writes the same `staff` row MyJKKN reads". No sync job exists or is needed.

## Goals

- Create a brand-new driver from TMS with MyJKKN's onboarding fields plus the TMS transport fields, in one form.
- Edit those same fields from TMS.
- The record is a normal MyJKKN team member afterwards: staff ID issued, login profile created, visible and editable in MyJKKN.

## Non-goals

- Salary, payroll and bank details (MyJKKN "Office" tab). HR keeps doing this in MyJKKN.
- Faculty tabs (Academic, Experience, Research, Achievements, Mentoring, FAQs), tags, URL slug, profile status, display order.
- Aadhaar in MyJKKN's `staff_sensitive_identity`. The existing TMS `tms_driver.aadhar_number` field stays as it is.
- Creating the Google Workspace `@jkkn.ac.in` mailbox. TMS only records the address.
- Deleting a person from MyJKKN. TMS delete keeps removing only the `tms_driver` row.
- Bulk import of new people. The existing import (transport fields for existing drivers) is unchanged.

## Anti-goals

- A TMS-created record that MyJKKN's own form cannot open or save (missing mandatory value, bad enum, a name that fails the canonical-name CHECK).
- Touching anyone who is not a driver. Every TMS write to `staff` is limited to a row TMS just created or a row with `role_key = 'driver'`.
- Attaching a new driver record to an existing MyJKKN account (see "Existing account" below). That path could overwrite another person's role and profile.
- Test records left in the production database.

## Constraints found

`staff` (about 75 columns) is owned by MyJKKN. Facts verified against the live database on 2026-11-19:

- NOT NULL without default: `first_name`, `last_name`, `gender`, `date_of_birth`, `marital_status`, `email`, `phone`, `date_of_joining`, `designation`, `category_id`, `institution_id`.
- CHECKs: `gender` in male/female/bigender; `marital_status` in single/married/divorced/widow; `blood_group` in A+, A-, B+, B-, AB+, AB-, O+, O-, A1+, A1B; emergency-contact columns may be NULL but never blank; a biometric code requires a biometric institution.
- UNIQUE: `email`, `institution_email`, `staff_id`.
- Triggers that run on insert/update and do work for us:
  - `trg_normalize_staff_names` uppercases and canonicalises names.
  - `trg_staff_autonumber` issues `staff_id` (drivers get `NOTJMO###`); a caller can never set or change it.
  - `sync_staff_to_profiles` finds or creates the `profiles` row from `institution_email` and sets `staff.profile_id`; on later edits it copies changed name/phone/photo/designation/active/login onto the profile.
  - `trg_jkkn_auto_issue_team_member` issues the JKKN identity number.
  - `trg_staff_require_institution_email` refuses an insert with `login_enabled` true and no institution email.
  - `fn_staff_record_needs_approved_package` refuses an insert or email change when the address belongs to an open recruitment candidate with no Director-approved package.
  - `validate_staff_department_scope` refuses a department on a non-teaching category.
  - `fn_staff_profile_source_changed` attributes the edit to `updated_by`/`created_by` when there is no signed-in session, so service-role writes must stamp both.
- Guards that do NOT run for us: `fn_staff_guard_role_key` and `fn_guard_staff_identity_for_raises` return early for service-role writes ("the API routes that write with the service-role client enforce these same rules themselves"). TMS routes use the service-role client, so TMS must enforce what matters itself.
- All 30 current drivers: institution "JKKN Main Office" (`b962527f-97ce-4238-89ce-7b532d7c2bc6`), category "Driver" (`42e1232f-3a16-4399-9543-e0586357caed`, non-teaching, `allows_login` true, `included_in_hr` false), designation "Bus Driver", `employment_type` full_time, `login_enabled` true, `status` draft, no department, personal email equal to institution email, both `@jkkn.ac.in`. All 30 have a `tms_driver` row and a `user_roles` row. None has a photo, emergency contact or biometric code on `staff`.
- MyJKKN, after inserting a staff row, also writes `user_roles` (delete then insert the role as primary) through RPC `mirror_staff_role_to_user_roles`. That RPC authorises on `auth.uid()`, so the service role cannot call it.
- MyJKKN's reference implementation, read on this machine at `D:/Sangeetha_V/MyJKKN`: form `app/(routes)/staff/list/_components/staff-form.tsx`, schema `staff-form-schema.ts`, create logic `lib/services/staff/staff-service.ts` (`createStaff`), route `app/api/staff/route.ts`, synthetic emails `lib/services/staff/synthetic-email.ts`, state/district data `lib/data/locations.ts`, photo upload `lib/storage/storage-service.ts` (`uploadStaffImage`, public bucket `staff-images`, path `<staffId>/<timestamp>.<ext>`).

## Approaches

1. **TMS writes `staff` directly through its own server routes (chosen).** Same database, service-role client, TMS repeats the MyJKKN checks that matter. Works with the existing TMS auth and the existing drivers module.
2. **TMS calls MyJKKN's `/api/staff`.** Reuses MyJKKN's rules exactly, but the two apps have separate sessions, MyJKKN's route authorises on a MyJKKN `staff.create` permission the transport office does not hold, and the role picker would not allow `driver` for them. Not workable without changing MyJKKN.
3. **Link out to, or embed, MyJKKN's form.** No duplication, but it is the dependency on MyJKKN the request exists to remove.

The user confirmed approach 1 on 2026-11-19, together with the field list and decisions below.

## What the user decided

- The TMS form carries MyJKKN's onboarding fields for a driver, plus the TMS transport fields.
- Left out: faculty tabs, and the Salary and Bank tab.
- Fixed and not shown as choices: institution = JKKN Main Office, category = Driver, role = `driver`, no department. Designation pre-filled "Bus Driver", editable.
- Biometric code optional.
- Emergency contact and address are entered once and saved on the MyJKKN record.
- "Pick existing staff" remains as a second way to create a driver.
- Delete stays as today.

## The form

One shared form for create and edit, five sections:

| Section | Fields |
|---|---|
| Personal | First name\*, Last name\*, Gender\*, Date of birth\*, Marital status\*, Blood group, Photo |
| Contact | Phone\*, Personal email, Address, State\*, District\*, PIN code |
| Emergency contact | Name, Relationship, Phone |
| Employment | Staff ID (read-only; "Generated automatically on save" on create), Institution email\*, Date of joining\*, Designation\*, Employment type, Biometric code, Biometric machine, Active |
| Transport (TMS) | Licence no., Licence expiry, Experience (yrs), Driver status, Assigned route, Aadhar no., Medical certificate expiry, Notes |

Validation follows MyJKKN:

- First name min 2 characters, last name min 1.
- Date of birth between 1900-01-01 and today; date of joining not in the future.
- Phone at least 10 digits.
- Institution email: the user types the name part, `@jkkn.ac.in` is a fixed suffix. Always required on create.
- On edit the whole record is validated, not only the changed fields, so TMS never saves a record MyJKKN's form would refuse. All 30 current drivers already have every required field filled (state and district included, checked 2026-11-19), so this blocks no routine edit. A stored state or district name that is not in the list is shown as it is and kept unless the user changes it.
- State and district required; district list depends on state; the display names are saved.
- Emergency contact: if any of the three is filled, name and phone are required and the phone needs 10 digits. Relationship options: Father, Mother, Spouse, Brother, Sister, Son, Daughter, Guardian, Friend, Other (Other reveals a text box whose text is what gets saved). Blank values are saved as NULL.
- Biometric code and machine: both or neither.

Defaults on create: gender male, marital status single, designation "Bus Driver", employment type full_time, Active on, driver status active. `login_enabled` is always saved true on create and is never changed by TMS.

Create page: two choices at the top, "New driver" (default, the form above) and "Existing staff member" (today's search-and-pick flow, unchanged).

Edit page: the same form, pre-filled, replacing today's read-only "Staff" card.

Detail page: shows the added fields (gender, date of birth, marital status, blood group, address, state, district, PIN, emergency contact, staff ID, institution email).

## Behaviour on save

**Create**, in order, inside one server route guarded by `tms.drivers.manage`:

1. Validate and whitelist the input (pure function, unit-tested).
2. Refuse if the personal or institution email already exists on a `staff` row or a `profiles` row, comparing case-insensitively and trimmed ("Existing account"). The message tells the user to use "Existing staff member" or ask HR.
3. Insert the `staff` row with the fixed values (`institution_id`, `category_id`, `role_key = 'driver'`, `department_id = null`), `created_by` and `updated_by` = the signed-in user. `staff_id` and `profile_id` are never sent.
4. Upsert the `tms_driver` row (`onConflict staff_id`) with the transport fields and the `profile_id` the trigger assigned.
5. Give the new profile the `driver` role in `user_roles` (primary), as MyJKKN does. This is safe only because step 2 guarantees the profile is new.
6. Write the activity log entry and return the new id; the client goes to the driver's detail page.

If step 3 fails on a database rule, show the database's own message (for example the recruitment-package refusal or a duplicate email) against the form rather than a generic error. If step 4 or 5 fails after the staff row exists, do not delete the staff row: report that the person was created and what is incomplete, and send the user to the edit page, where saving again completes it (both steps are idempotent).

**Photo.** On create the record is saved first and the photo uploaded second, so the file lands under the real staff id. Upload goes through a TMS server route to the public `staff-images` bucket using MyJKKN's path pattern, then `staff.profile_picture` is set to the public URL. Replacing a photo removes the old file.

**Edit**, guarded by `tms.drivers.manage`:

- The MyJKKN fields are editable only when the row has `role_key = 'driver'` AND `category_id` = the Driver category. A person from another category who was made a driver through "Existing staff member" (a teacher, an office employee) keeps today's behaviour: a read-only staff card and editable transport fields only. The server enforces this, not just the page.
- Send only the fields that changed, stamp `updated_by`. Unchanged fields are left alone so MyJKKN's profile-verification claims are reopened only for what actually changed.
- Transport fields upsert `tms_driver` as today.

## Calls made by the designer (not decided by the user — check these)

1. **Permission.** `tms.drivers.manage` is enough to create and edit the MyJKKN record; no MyJKKN `staff.create` permission is required. This is what "onboard drivers from TMS" implies, but it does mean a transport admin can create a MyJKKN team member.
2. **Institution email is read-only on edit.** It is the login identity; changing it relinks the record to a different account, and the database guards for that do not run for TMS. Changing it stays an HR action in MyJKKN. Every other listed field is editable. Staff ID, institution, category and role are never editable in TMS.
3. **Personal email is optional.** When left blank it is saved equal to the institution email, which is how all 30 existing drivers are stored.
3a. **No "Login user" switch in TMS.** Every driver needs to sign in to the driver app and all 30 are login-enabled, so new drivers are always created login-enabled with a real institution email. View-only records (MyJKKN's synthetic `@nolog.jkkn.local` addresses) are not created or converted from TMS; that remains an HR action in MyJKKN.
3b. **Full edit only for Driver-category people** (see Edit above). This keeps the anti-goal "touching anyone who is not a driver" true even though "Existing staff member" can still pick any staff member.
4. **Existing account is refused, not linked** (step 2 above).
5. **Emergency contact and address have one home, the `staff` row.** The form reads the `staff` value and, when it is empty, pre-fills from the old `tms_driver` copy so nothing typed earlier is lost. The form stops writing the `tms_driver` copies; the columns and their data stay, and the bulk import keeps writing them.
6. **Rating, total trips and location-sharing** are removed from the form. They are system values (trip counts, live GPS state), not onboarding data. Their stored values are preserved on save.
7. **Fixed ids live in one constants file** with the institution and category ids above, verified at request time: if either row is missing the route fails with a clear message rather than inserting a bad reference.
8. **State/district data** is copied from MyJKKN's `lib/data/locations.ts` so saved names match MyJKKN's exactly.
9. **Verification never leaves a test person in production.** The insert payload is proven with a transaction that is rolled back; a real create happens only when the user onboards a real driver.

## Left to the builder

- Route layout and request shapes (for example a new create route beside the existing pick-existing `POST`, and a `PUT`/`PATCH` on `[driverId]`), following the project's `admin-api-route` and `admin-form` patterns and a `lib/drivers/` field whitelist.
- Employment type options: use the distinct values present in `staff.employment_type`.
- Photo size and type limits: match MyJKKN's `uploadStaffImage`.
- Whether `driver` passes `fn_staff_role_key_is_privileged` (expected: not privileged); confirm before relying on it.
- Component split, loading and error states, mobile layout, dark mode, in the style of the existing driver pages.
- Updating export columns for the new fields if it is cheap; otherwise leave the export as is.

## Verification

- Unit tests (vitest) for the validation and payload-building functions: required fields, enum values, email suffix rule, emergency-contact all-or-nothing, blank to NULL, fixed values always applied, `staff_id`/`profile_id`/`role_key` from the client ignored, changed-fields diff on edit.
- A rolled-back transaction against the real database that inserts a representative payload and confirms the triggers issue a staff ID and a profile.
- Scoped typecheck on the touched files (`npm run lint` and repo-wide `tsc` are known-broken here).
- Route probes for 401/403/400 paths.
- The signed-in pages cannot be seen by the agent; the user does the final visual check on create, edit and detail, and confirms the new driver appears in MyJKKN.
