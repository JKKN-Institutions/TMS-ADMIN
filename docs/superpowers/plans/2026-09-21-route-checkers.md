# Route Checkers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Transport Head assigns checkers (by college email) to routes; checkers use Route Check in the staff app to see route learners/staff with paid/unpaid, booked/not-booked, not-on-route; scan MyJKKN QR or ID-card barcode; add unscannable people manually; enter headcount/unknown/notes; submit. Verify-only; linked to Bus Inspection.

**Architecture:** One migration (3 tables, SECURITY DEFINER access fn, manage permission). Pure logic in `lib/route-check/*` (tested). Shared roster assembly extracted to `lib/attendance/route-roster.ts`. Admin APIs `app/api/admin/route-checkers/**` + `app/api/admin/route-checks/**`; checker APIs `app/api/boarding/route-check/**`. Admin pages `/route-checkers`, `/route-checks`; staff-app pages `/boarding/route-check/**`. Access via proxy + `/api/boarding/access` + boarding layout checker-only mode.

**Spec:** `docs/superpowers/specs/2026-09-21-route-checkers-design.md`

## Global Constraints

- Worktree `D:\Sangeetha_V\TMS-ADMIN\.worktrees\route-checkers`, branch `feat/route-checkers` (based on local main `eca81d9`). Never commit `.env`/`.next`; `git add` by path.
- Supabase project `kvizhngldtiuufknvehv`; apply migrations with MCP `apply_migration` AND commit the `.sql`. **Execute every new SQL function once** after applying (read-only call) and confirm the EXECUTE grants (`has_function_privilege`).
- API pattern: `withAuth` + `createServiceRoleClient()` + `{ success, data }` / `{ error }`; every read's `error` checked (a failed read never renders as zero/nobody); `.in()` chunked ≤150; every mutation `await logActivity(auth, request, { module: 'route-checks', … })`.
- Emails: always `emailIlikePattern` (`lib/identity/email-match.ts`) for ilike; store `checker_email` lower-cased trimmed.
- Checks are **verify-only**: never write `tms_attendance`.
- Scanning: camera only; ID photos must pass `isFreshCapture`; the existing boarding scanner (`components/boarding/scan-dialog.tsx`) and the inspection scanners must behave exactly as before.
- Dates IST (`istToday()`); legs `'onward' | 'return'` labelled with `LEG_NAME`.
- UI: mobile-first 360–390 px, no page horizontal overflow, `dark:` variants, `react-hot-toast`, client permissions via `usePermissions().can` (never localStorage).
- Verify: `npx vitest run lib/route-check lib/inspections`, scoped `npx tsc --noEmit -p . 2>&1 | grep -E "route-check|route-checker|attendance|boarding|proxy" || echo CLEAN`. `npm run lint` is broken. No dev server unless the task says so.

---

### Task 1: Migration

**Files:** `supabase/migrations/20260921150000_route_checkers.sql`

Contents (idempotent, header comment like other migrations):
1. `tms_route_checker_assignment` (id uuid pk default gen_random_uuid(), checker_email text not null check (checker_email = lower(btrim(checker_email))), route_id uuid not null references tms_route(id) on delete cascade, is_active boolean not null default true, assigned_by uuid, notes text, assigned_at timestamptz not null default now(), created_at timestamptz default now()); partial unique index (checker_email, route_id) where is_active; index (route_id) where is_active.
2. `tms_route_check` per spec columns; `checker_id uuid not null references profiles(id)`; `route_id` fk tms_route; `vehicle_id uuid` (nullable, fk tms_vehicle on delete set null); `check_date date not null`; `leg text not null check in ('onward','return')`; `status text not null default 'draft' check in ('draft','submitted')`; counts `int` nullable; `headcount int check (headcount is null or headcount between 0 and 500)`, `unknown_count int check (unknown_count is null or unknown_count between 0 and 500)`; timestamps; `updated_at` trigger via `tms_set_updated_at()`; constraint submitted ⇒ submitted_at not null; partial unique index (checker_id, route_id, check_date, leg) where status='draft'; index (route_id, submitted_at desc) where status='submitted'.
3. `tms_route_check_person` per spec with CHECKs on every enum column; `check_id` fk cascade; CHECK: person_kind='learner' ⇒ learner_id not null; ='staff' ⇒ staff_id not null; ='manual' ⇒ manual_type not null and manual_name not null; index (check_id).
4. RLS enabled on all three; SELECT policies: `is_super_admin() or user_has_permission('tms.route_check.manage')` (checkers read through service-role APIs).
5. Function:
```sql
create or replace function public.tms_route_checker_route_ids(p_profile_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare v_email text; v_ids uuid[];
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> p_profile_id) then
    return '{}'::uuid[];
  end if;
  select lower(btrim(email)) into v_email from profiles where id = p_profile_id;
  select coalesce(array_agg(distinct a.route_id), '{}') into v_ids
  from tms_route_checker_assignment a
  where a.is_active and (
    a.checker_email = v_email
    or a.checker_email in (
      select lower(btrim(x)) from staff s,
        lateral (values (s.email), (s.institution_email)) v(x)
      where x is not null and (s.profile_id = p_profile_id
        or lower(btrim(s.email)) = v_email or lower(btrim(s.institution_email)) = v_email)
    ));
  return v_ids;
end $$;
revoke all on function public.tms_route_checker_route_ids(uuid) from public;
grant execute on function public.tms_route_checker_route_ids(uuid) to authenticated, service_role;
```
6. Permission: `update custom_roles set permissions = coalesce(permissions,'{}'::jsonb) || '{"tms.route_check.manage": true}'::jsonb, updated_at = now() where role_key = 'transport_head';`

- [ ] Apply (MCP `apply_migration`, name `route_checkers`), re-run once via `execute_sql` (idempotent), verify: tables exist; `select public.tms_route_checker_route_ids('00000000-0000-0000-0000-000000000000')` returns `{}` (service role); `select has_function_privilege('authenticated','public.tms_route_checker_route_ids(uuid)','execute'), has_function_privilege('anon','public.tms_route_checker_route_ids(uuid)','execute')` → true,false; transport_head holds the key.
- [ ] Commit `feat(route-checks): schema, checker access function and manage permission`.

---

### Task 2: Constants, activity module, admin nav, pure logic (TDD)

**Files:** Modify `lib/constants/tms-permissions.ts` (`ROUTE_CHECK_MANAGE: 'tms.route_check.manage'`), `lib/activity/log.ts` (`'route-checks'` in `ActivityModule`), `lib/navigation.ts` (after "Bus Inspection": `{ name: 'Route Checkers', href: '/route-checkers', icon: UserSearch (lucide), permission: TMS_PERMISSIONS.ROUTE_CHECK_MANAGE, group: 'transport' }`). Create `lib/route-check/card.ts`, `lib/route-check/outcome.ts`, `lib/route-check/counts.ts` + tests.

Interfaces:
```ts
// card.ts
export type CardShape = 'jkkn_id' | 'uuid' | 'id_code' | 'unknown';
export function classifyCard(raw: string): { shape: CardShape; code: string };
//  - strip CR/LF, trim, strip leading/trailing '*' (Code 39 start/stop)
//  - jkkn_id: reuse classifyScan(raw,'camera') from lib/boarding/scan-resolve.ts (shape 'jkkn_id' → code)
//  - uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i → lower-cased
//  - id_code: uppercase; /^[A-Z0-9][A-Z0-9 .\-]{1,31}$/ after collapsing inner whitespace
//  - else unknown
// outcome.ts
export type CheckOutcome = 'ok' | 'not_on_route' | 'no_booking' | 'fee_unpaid' | 'unknown_card' | 'manual';
export function learnerCheckOutcome(i: { known: boolean; onRoute: boolean; booked: boolean; feeUnpaid: boolean }): CheckOutcome; // order unknown → not_on_route → no_booking → fee_unpaid → ok
export function staffCheckOutcome(i: { onRoute: boolean; isIncharge: boolean; hasOutstandingBill: boolean }): CheckOutcome; // !onRoute && !isIncharge → not_on_route; hasOutstandingBill && !isIncharge → fee_unpaid; else ok
// counts.ts — for the checker screen, from roster rows
export interface CheckRowLite { booked: boolean; status: 'present'|'absent'|'unmarked'; feeState: 'paid'|'unpaid'|'none'|'unknown'; notOnRoute: boolean }
export type CheckFilter = 'all' | 'unpaid' | 'without_booking' | 'not_on_route';
export function checkCounts(rows: CheckRowLite[]): { total: number; booked: number; present: number; unpaid: number; withoutBooking: number; notOnRoute: number };
export function matchesFilter(r: CheckRowLite, f: CheckFilter): boolean;
```
`notOnRoute` for a roster row = `r.other_bus?.kind === 'from'` or (not allocated and not booked here) — the caller computes it; document in counts.ts.

Tests: jkkn id / 7 digits / typed not relevant (camera only) / `*ES24031*` → id_code `ES24031` / lower-case roll → uppercased / UUID / empty & junk → unknown / 40-char string → unknown; every outcome branch incl. order; counts & each filter.

- [ ] TDD (fail → pass). Commit `feat(route-checks): permission, nav entry and pure card/outcome/count logic`.

---

### Task 3: Shared route roster

**Files:** Create `lib/attendance/route-roster.ts`; Modify `app/api/admin/attendance/roster/route.ts` to call it (behaviour byte-for-byte identical: same response shape, same errors/status codes).

```ts
export interface RouteRosterView {
  route: { id: string; route_number: string | null; route_name: string | null };
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number; auto: number };
}
export async function loadRouteRosterView(svc, opts: {
  routeId: string; date: string; direction: 'onward'|'return';
  viewer: { actorId: string; isOverrideHolder: boolean; isSuperAdmin: boolean };
  withFees?: boolean;            // true → fill row.fee via loadRosterFees (lib/boarding/fee-roster.ts), fail-soft
}): Promise<RouteRosterView | null>; // null = route not found; throws a typed error for failed reads (route/stops/attendance) so callers map to 500
```
- [ ] Move the logic, keep comments. `npx vitest run` whole suite still passes. Commit `refactor(attendance): shared route roster loader (optionally with fees)`.

---

### Task 4: Checker identity & person resolution (server libs)

**Files:** Create `lib/route-check/access.ts`, `lib/route-check/resolve.ts`, `lib/route-check/staff-fees.ts`.

```ts
// access.ts
export async function checkerRouteIds(svc, profileId: string): Promise<string[]>; // rpc tms_route_checker_route_ids via service role; throws on error
export async function canCheckRoute(auth: AuthContext, svc, routeId: string): Promise<boolean>; // super admin || manage perm || routeId ∈ checkerRouteIds
// resolve.ts
export interface Candidate { personKind: 'learner'|'staff'; id: string; name: string; code: string | null; routeId: string | null; matchedBy: 'jkkn_id'|'uuid'|'roll_number'|'register_number'|'staff_id' }
export async function resolveCard(svc, raw: string, routeId: string): Promise<{ shape: CardShape; code: string; candidates: Candidate[]; retired?: boolean }>;
//  jkkn_id → jkkn_identities (learner_profile_id, team_member_id, retired_at): learner via learners_profiles, staff via staff.id = team_member_id; 'both' → both candidates
//  uuid → learners_profiles.id, else staff.profile_id, else profiles.id→staff.profile_id
//  id_code → learners_profiles.roll_number ilike (exact, escaped) , register_number ilike, staff.staff_id ilike; limit 5 each
//  candidates sorted: routeId === this route first
// staff-fees.ts
export async function staffBillStates(svc, staffIds: string[]): Promise<Map<string, { hasOutstanding: boolean; outstandingAmount: number; hasBill: boolean }>>;
//  current tms_transport_year (is_current); tms_fee_bill person_type='staff' person_id in chunk(≤150); reuse summarizeStaffBills from lib/fees/staff-bill-state.ts; throw on read error
```
Verify every table/column with read-only SQL first (learners_profiles.register_number, staff.staff_id, tms_fee_bill columns). No unit tests for I/O libs; scoped tsc CLEAN.
- [ ] Commit `feat(route-checks): checker access, card resolution and staff bill status libs`.

---

### Task 5: Admin APIs

**Files:** `app/api/admin/route-checkers/route.ts` (GET list, POST assign, DELETE unassign), `app/api/admin/route-checkers/people/route.ts` (GET search), `app/api/admin/route-checks/route.ts` (GET history), `app/api/admin/route-checks/[id]/route.ts` (GET report).

- Perm `ROUTE_CHECK_MANAGE` on all (super admin bypass).
- GET `/route-checkers` → `[{ id, checkerEmail, checkerName, designation, routeId, routeNumber, routeName, assignedAt, notes }]` (names: staff by email/institution_email via emailIlikePattern, else profiles.full_name).
- GET `/route-checkers/people?q=` (≥3 chars) → up to 20 `{ email, name, designation, source: 'staff'|'profile' }` searching `staff` (first_name, last_name, email, institution_email ilike `%q%` escaped, is_active) and `profiles` (email, full_name) — de-duplicated by lower email; prefer `institution_email` (college email) when present.
- POST `{ email, routeIds: string[], notes? }` → validate email format + routes exist + active; insert rows skipping ones already active (report `{ created, skipped }`); log `assign`.
- DELETE `?id=` → set `is_active=false`; log `unassign`.
- GET `/route-checks?routeId&from&to&status` → list with route number, checker name, date, leg, counts, headcount, unknown_count, person count; newest first, limit 200.
- GET `/route-checks/[id]` → check + persons (names resolved) + route/bus labels.
- [ ] scoped tsc; commit `feat(route-checks): admin APIs for checker assignment and check history`.

---

### Task 6: Admin UI

**Files:** `app/(admin)/route-checkers/page.tsx`, `app/(admin)/route-checkers/assign-dialog.tsx`, `app/(admin)/route-checks/page.tsx`, `app/(admin)/route-checks/[id]/page.tsx`, `app/(admin)/route-checkers/route-checkers-api.ts`.
- Route Checkers page: header + "Assign checker" button; table/list grouped by checker (name, email, designation, route chips each with ✕ unassign via confirm-dialog); empty state.
- Assign dialog: debounced search (300 ms) → results list → select person → multi-select routes (active routes, searchable) → notes → Assign; toast `Assigned to N routes (M already assigned)`.
- Route Checks page: filters (route, date range), list rows `date · leg · route · checker · Registered/Present/Unpaid/Not-on-route · headcount/unknown`; row → report page (DetailPageHeader + SectionCards: counts, notes, persons table with outcome chips, manual entries with notes).
- Gate each page with `can(TMS_PERMISSIONS.ROUTE_CHECK_MANAGE)` (no flash while loading).
- [ ] tsc; commit `feat(route-checks): admin pages to assign checkers and review checks`.

---

### Task 7: Staff-app access

**Files:** `proxy.ts`, `app/api/boarding/access/route.ts`, `app/boarding/layout.tsx`, `lib/boarding/navigation.ts`, `components/boarding-bottom-nav.tsx`.
- proxy boarding deny branch: if still no access, `rpc('tms_route_checker_route_ids', { p_profile_id: user.id })` with the user-scoped client; non-empty → access. Admin-area denied redirect: before the eligibility fallback, if that RPC is non-empty → home `/boarding/route-check`. Log RPC errors like the eligibility call.
- access API: add `checkerRouteCount` (service-role `checkerRouteIds`). Super admin → also `checkerRouteCount: 0` but allowed.
- layout: new state `checker_only` when server gate ≠ `in_duty` and `checkerRouteCount > 0`; in `checker_only`, any path outside `/boarding/route-check` redirects there; nav filtered to Route Check (+ existing profile/theme controls); `choose`/`must_pay` redirect logic must not fire for checker-only users. In `allowed` mode, show Route Check in nav only if `checkerRouteCount > 0` or super admin. Offline saved verdicts: store `checker_only` like other gates.
- nav: add `{ name: 'Route Check', shortName: 'Check', href: '/boarding/route-check', icon: ClipboardCheck }` + title.
- [ ] Carefully preserve all existing in-charge behaviour; tsc; commit `feat(route-checks): staff-app access for assigned checkers`.

---

### Task 8: Checker APIs

**Files:** `app/api/boarding/route-check/routes/route.ts` (GET my routes), `app/api/boarding/route-check/start/route.ts` (POST), `app/api/boarding/route-check/[checkId]/route.ts` (GET view, PUT finish fields), `[checkId]/scan/route.ts` (POST), `[checkId]/person/route.ts` (POST add, DELETE remove), `[checkId]/submit/route.ts` (POST).
- Auth: `canCheckRoute` for the check's route; mutations only while `draft` and by the check's `checker_id` (super admin excepted).
- GET routes → `[{ routeId, routeNumber, routeName, vehicleReg, todayChecks: { onward?: { id, status }, return?: {…} } }]`.
- POST start `{ routeId, leg }` → create or resume today's draft (unique index; 23505 → reselect); stores vehicle_id from `tms_route.vehicle_id`.
- GET view `?` → `{ check, route, leg, date, roster: rows (via loadRouteRosterView withFees) mapped to lite rows { learnerId, name, roll, stopName, stopOrder, status, booked, feeState, feeLabel, notOnRoute, otherBus }, counts: checkCounts + registered (allocated count, same filter as roster), staff: { incharges (reuse overview in-charge logic from app/api/admin/inspections/[id]/overview — extract a shared helper if needed), riders: [{ staffId, name, designation, stopName, fee: 'paid'|'unpaid'|'none'|'exempt', amount }] }, persons: recorded entries }`.
- POST scan `{ code, source }` → camera-only (typed → 400); `resolveCard`; 0 candidates → record `unknown_card` person (scanned_code) and return it; 1 candidate → evaluate + record; >1 → return `{ candidates }` without recording.
- POST person `{ pick: { personKind, id, matchedBy, scannedCode } }` → evaluate + record; or `{ manual: { type, name, notes } }` → record `manual`. DELETE `?personId=` removes an entry (draft only).
- Evaluation: learner — onRoute (allocated here or booked here today), booked (booking today any route), feeUnpaid via `loadRosterFees` single id → `rosterFeeBadge`; staff — onRoute (`transport_route_id` = route), isIncharge (active `tms_staff_route_assignment` for route by staff emails), bill via `staffBillStates`.
- PUT `{ headcount, unknownCount, notes }` (explicit keys; ints 0..500 or null).
- POST submit → snapshot counts (registered, booked, present, unpaid, without_booking, not_on_route) from the current roster view, `status='submitted'` guarded `.eq('status','draft').select('id')` (0 rows → 409); log `submit`.
- Every mutation logs activity (`scan`, `create`, `delete`, `update`, `submit`).
- [ ] tsc; commit `feat(route-checks): checker APIs (routes, start, view, scan, manual entries, finish, submit)`.

---

### Task 9: Checker UI

**Files:** `app/boarding/route-check/page.tsx`, `app/boarding/route-check/[checkId]/page.tsx`, `components/route-check/{check-scanner,candidate-picker,manual-entry-dialog,finish-panel,learner-list,staff-list}.tsx`, `app/boarding/route-check/route-check-api.ts`.
- My routes: cards per route (number, name, bus) with Morning / Evening buttons → start/resume → navigate to the check. Status badge if already submitted today.
- Check screen: header (route, bus, date, leg), counts row (Registered · Booked · Present · Unpaid · Without booking · Not on route), filter chips (All · Unpaid · Without booking · Not on route · Staff), learners grouped by stop with chips (status, Paid/Unpaid ₹, Booked/No booking, from other bus, "checked ✓" if scanned in this check), Staff section, "Checked in this check" list (scans + manual entries with outcome chips; remove ✕ while draft).
- Sticky bottom bar: **Scan** · **Add manually** · **Finish**. Scanner: new `check-scanner.tsx` (html5-qrcode) with formats `[QR_CODE, CODE_39, CODE_128]`, wide box (`qrbox: w => ({ width: w*0.85, height: min(0.45 h, 220) })`, aspectRatio 1.6), `useBarCodeDetectorIfSupported: true`, same camera fallback chain + error helpers as `components/inspections/bus-scanner.tsx`, photo fallback with `isFreshCapture`, synchronous busy ref + 4 s same-code suppression, continuous scanning with result card (outcome colour + name + roll/staff code + fee + booking) and "Scan next".
- Candidate picker when the API returns several candidates (this route's first; shows kind learner/staff, code, route).
- Manual entry dialog: type radio (Learner without card / Staff without card / Outside person), name (required), notes.
- Finish panel: headcount, unknown count (prefilled with outside-person entries count), notes → Save; Submit (confirm) → success screen.
- Refetch policy like the inspection check page (keep data on refetch error with a small note).
- [ ] tsc; commit `feat(route-checks): staff-app Route Check screens with QR + barcode scanning`.

---

### Task 10: Inspection link + verification

**Files:** `app/api/admin/inspections/route.ts` (add `lastRouteCheck: { id, submittedAt, checkerName } | null` per bus via its active route), `lib/inspections/types.ts`, `app/(admin)/inspections/page.tsx` (show "Route check: <date>" line linking to `/route-checks/<id>`), `app/(admin)/inspections/[id]/page.tsx` (section "Recent route checks" — last 5 for the route, links).
- [ ] tsc + `npx vitest run` all; commit `feat(inspections): show latest route checks on the bus inspection screens`.
- [ ] Controller: build (copy `.env`, delete after), signed-out probes of new APIs → 401, `/boarding/route-check` → 307, rolled-back SQL test of the access function with a real staff email, then final review and handoff.
