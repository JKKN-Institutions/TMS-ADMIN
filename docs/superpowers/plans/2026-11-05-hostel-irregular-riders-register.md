# Hostel / Irregular Riders + Learner Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save bus scans of hostel / non-transport learners with a stored rider type, and give admins and learners a month-by-month attendance view.

**Architecture:** One additive DB migration (column + RPC key + summary function + coverage filter). One pure rule (`classifyRider`) and one relaxed rule (`decideBus`). Scan route stores `rider_kind`; rosters and screens read it. Register = SQL aggregate (one row per learner) behind an admin API.

**Tech Stack:** Next.js 16 route handlers, Supabase Postgres (plpgsql/sql), TanStack Query/Table, vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-hostel-irregular-riders-register-design.md`

## Global Constraints
- rider_kind values exactly: `transport`, `hosteller`, `non_transport`; labels `Transport`, `Hostel`, `Irregular`.
- Voice phrases exactly: `<Name>, hostel` and `<Name>, no transport` (name via `spokenName`).
- Every new SQL function: SECURITY DEFINER, `set search_path = public`, EXECUTE revoked from public/anon/authenticated, granted to service_role.
- `create or replace tms_mark_attendance` must keep `#variable_conflict use_column` and the parameter DEFAULTS; dry-run in a `do $$ … raise exception 'TESTRESULT' $$` block before applying.
- Migration applied BEFORE any code that sends `rider_kind` is pushed.
- Days present = count of DISTINCT trip_date with status present. Auto marks are `method='auto'`.

## Review Focus
- Re-scan of an already-present hosteller → `noop_same_status`, rider_kind unchanged (Task 2 dry run).
- Manual Absent toggle on a scanned hosteller keeps rider_kind (Task 2 dry run: mark without key preserves).
- Super admin scanning a no-bus learner → still refused `no_route` (Task 3 test).
- Month with no rows → register shows empty state, not an error (Task 6 API handles empty array).
- Learner with both trips on one day counts 1 day, 2 trips (Task 1 `summarizeMonth` test).

---

### Task 1: Pure rules — rider kind + month summary
**Files:** Create `lib/attendance/rider-kind.ts`, `lib/attendance/rider-kind.test.ts`, `lib/attendance/month-summary.ts`, `lib/attendance/month-summary.test.ts`
**Produces:**
- `type RiderKind = 'transport' | 'hosteller' | 'non_transport'`; `RIDER_KIND_LABEL: Record<RiderKind,string>`; `classifyRider({ busRequired: boolean|null, allocatedRouteId: string|null, inHostel: boolean }): RiderKind`; `parseRiderKind(v: unknown): RiderKind | null`.
- `summarizeMonth(rows: {tripDate:string; direction:string; status:string; method:string|null}[]): { daysPresent:number; onwardPresent:number; returnPresent:number; bothTripDays:number; staffAbsent:number; autoAbsent:number }` and `monthDays(month:'YYYY-MM'): string[]`.
- [ ] Tests: transport needs busRequired AND route; hosteller beats non_transport; both trips same day → daysPresent 1, bothTripDays 1; auto absent counted apart; monthDays('2026-02') length 28.
- [ ] Implement, run `node node_modules/vitest/vitest.mjs run lib/attendance`, commit.

### Task 2: Migration `20261105100000_attendance_rider_kind.sql`
**Files:** Create `supabase/migrations/20261105100000_attendance_rider_kind.sql`
- `tms_attendance.rider_kind text check (rider_kind in (...))` nullable; backfill by the spec rule using current state.
- `tms_mark_attendance`: insert `nullif(m->>'rider_kind','')`; on conflict `rider_kind = case when m ? 'rider_kind' then excluded.rider_kind else t.rider_kind end`.
- `tms_attendance_coverage`: marks CTE adds `and coalesce(a.rider_kind,'transport') = 'transport'`.
- `tms_learner_attendance_month(p_month date, p_route_id uuid default null, p_rider_kind text default null)` returns `(learner_id, name, roll_number, institution_id, route_id, rider_kind, days_travelled, onward_present, return_present, both_trip_days, staff_absent, auto_absent, without_booking, last_travel)`; route/rider = most recent present row (else most recent row).
- index `tms_attendance (trip_date)`.
- [ ] Dry run (rolled back): insert hosteller present → rider_kind stored; manual absent without key → preserved; re-scan same status → noop. Month fn returns rows for 2026-10.
- [ ] Apply via apply_migration; verify grants + backfill counts; commit.

### Task 3: decideBus records no-bus learners
**Files:** Modify `lib/boarding/wrong-bus.ts`, test `lib/boarding/wrong-bus.test.ts`
- No allocation + no booking + single staff bus → ok on that bus, `walkUp: true`, `wrongBus: null`, `stopId: null`. Super admin (staffRouteIds null) / 0 / >1 buses → existing errors (`'Learner has no allocated route'` for super admin).
- [ ] Tests first, implement, run, commit.

### Task 4: Scan route + voice + scan panel
**Files:** Modify `app/api/boarding/scan/route.ts`, `lib/boarding/announce.ts` (+test), `components/boarding/scan-dialog.tsx`
- Learner select adds `bus_required, profile_id`; hostel lookup `hostel_allocations` by profile_id, status active (fail-soft → false); `rider_kind: classifyRider(...)` in the mark; reply `riderKind`.
- `scanAnnouncement` gains `riderKind?: RiderKind|null`: after alreadyMarked/offlineSaved, `hosteller` → `X, hostel`, `non_transport` → `X, no transport`.
- Dialog: pass riderKind to announcement; show a Hostel/Irregular chip in the result panel (panel format otherwise unchanged).
- [ ] announce tests, implement, commit.

### Task 5: Roster badges
**Files:** Modify `lib/booking/roster.ts` (RosterAttendance + RosterRow `rider_kind: RiderKind|null`), `app/api/boarding/attendance/roster/route.ts`, `lib/attendance/route-roster.ts` (select column), `app/boarding/attendance/columns.tsx`, `app/(admin)/attendance/[routeId]/[date]/columns.tsx`
- Badge shown when rider_kind is hosteller/non_transport. Existing roster tests updated for new field.
- [ ] Tests, implement, commit.

### Task 6: Admin Learner register
**Files:** Create `app/api/admin/attendance/learners/route.ts`, `app/(admin)/attendance/learners/page.tsx`, `app/(admin)/attendance/learners/columns.tsx`; modify `app/(admin)/attendance/page.tsx` (link/tab), `lib/navigation.ts` alias.
- GET `?month=YYYY-MM&routeId=&rider=` (perm `tms.attendance.view`) → RPC, refs for route/institution names; `{success,data:{month,rows,summary:{learners,hostellers,irregular,trips}}}`.
- Page: month input, rider filter, SummaryCards, DataTable (default page size), ExportMenu; name links to `/passengers/learners/<id>?month=YYYY-MM`.
- [ ] Implement, build check, commit.

### Task 7: Learner detail section — days present, rider tag, calendar
**Files:** Modify `app/api/admin/passengers/learners/[learnerId]/attendance/route.ts` (add riderKind, isWalkUp), `attendance-section.tsx`, `app/student/attendance/columns.tsx` (optional Rider column via AttendanceRow.riderKind?)
- Cards use `summarizeMonth`; "Days present" card; month calendar grid (Mon–Sun, M/E dots) when a month is selected; `?month=` preselects.
- [ ] Implement, commit.

### Task 8: Student portal month view
**Files:** Modify `app/api/student/attendance/route.ts` (`?month=` → that month, else last 60), `app/student/attendance/page.tsx` (month picker + days present card).
- [ ] Implement, commit.

### Task 9: Verify
- [ ] Full vitest; `node node_modules/next/dist/bin/next build`; scoped tsc diff on touched files vs main; owner phone test checklist in final message.
