# In-charge Absence Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a bus in-charge declare an absence for the Morning trip, the Evening trip or the Full day.

**Architecture:** One additive `trip` column on `tms_incharge_absence`; the unique key `(assignment_id, absence_date)` is unchanged, so a second declaration replaces the first. The pure rules in `lib/boarding/share-coverage.ts` learn which trip they are being asked about, and every reader passes it.

**Tech Stack:** Next.js 16 route handlers, Supabase (Postgres), TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-incharge-absence-trip-design.md`

## Global Constraints

- Column: `trip text not null default 'full_day'`, check `trip in ('full_day', 'onward', 'return')`.
- Trip words shown to staff: `Morning`, `Evening`, `Full day`.
- A row with no `trip` value (old selects, old rows) means full day.
- Do not change the unique key `tms_incharge_absence_day_key`.
- Typecheck with `node ../../node_modules/typescript/bin/tsc --noEmit -p .` (never `npx tsc`); tests with `node ../../node_modules/vitest/vitest.mjs run <file>`.
- Apply the migration before the code deploys.

## Review Focus

- A Morning absence must not excuse the Evening trip (and the reverse) in the marking report.
- An accepted Morning cover must not grant the coverer the absentee's share on the Evening trip.
- A row selected without `trip` must behave as full day, never as "applies to nothing".
- Evening declared while evening attendance is switched off must be refused, not stored.
- An unknown `trip` value in the request must be refused, not silently stored as full day.

---

### Task 1: Trip vocabulary and coverage rules

**Files:**
- Create: `lib/boarding/absence-trip.ts`, `lib/boarding/absence-trip.test.ts`
- Modify: `lib/boarding/share-coverage.ts`, `lib/boarding/share-coverage.test.ts`

**Interfaces — Produces:**
- `type AbsenceTrip = 'full_day' | 'onward' | 'return'`
- `ABSENCE_TRIP_LABEL: Record<AbsenceTrip, string>` — `Full day`, `Morning`, `Evening`
- `parseAbsenceTrip(value: unknown): AbsenceTrip | null` — `undefined`/`null`/`''` → `'full_day'`; unknown → `null`
- `absenceCoversTrip(trip: AbsenceTrip | null | undefined, direction: AttDirection): boolean`
- `AbsenceRow.trip?: AbsenceTrip | null`
- `isExcused(assignmentId, date, absences, direction: AttDirection): boolean`
- `delegatedTo(assignmentId, date, absences, direction: AttDirection): string[]`

- [ ] Write failing tests: parse cases above; `absenceCoversTrip(undefined,'return')` true; `('onward','return')` false; `isExcused` with a `trip: 'onward'` row is true for `'onward'`, false for `'return'`; `delegatedTo` with an accepted `trip: 'return'` row returns `[]` for `'onward'`; existing cases pass `'onward'`.
- [ ] Run and see them fail.
- [ ] Implement.
- [ ] Run and see them pass. Commit.

### Task 2: Migration

**Files:** Create `supabase/migrations/20261126100000_tms_incharge_absence_trip.sql`

- [ ] `alter table ... add column if not exists trip ...` with the check constraint and a column comment.
- [ ] Apply to the database; verify all existing rows read `full_day`. Commit.

### Task 3: Readers pass the trip

**Files — Modify:**
- `lib/attendance/incharge-marking.ts` (+ test): `MarkingInputs.direction: AttDirection`; `onLeave` uses it.
- `app/api/admin/attendance/incharges/route.ts`: select `trip`, pass `direction`.
- `app/api/admin/incharge-coverage/route.ts`: select `trip`, pass `'onward'`.
- `app/api/boarding/attendance/roster/route.ts`: select `trip`, pass `direction`.
- `app/api/boarding/attendance/route.ts`: `markableLearnerIds` takes `direction`; both call sites pass it.

- [ ] Failing test in `incharge-marking.test.ts`: an `'onward'` absence gives `off` when the report direction is `onward` and `missed` when it is `return`.
- [ ] Implement; run tests; typecheck the touched files. Commit.

### Task 4: Absence API

**Files — Modify:** `app/api/boarding/absence/route.ts`, `app/api/boarding/absence/[absenceId]/respond/route.ts`

- [ ] POST: read `trip` via `parseAbsenceTrip`; `null` → 400 `Unknown trip`; `'return'` while `loadAttendanceWindows(svc).return.active` is false → 409 `Evening attendance is switched off.`; store `trip`; cover-request notification and activity log name the trip.
- [ ] GET: `decorate` returns `trip`.
- [ ] Respond: select `trip`; notification text names the trip.
- [ ] Typecheck. Commit.

### Task 5: Dialog and in-charge page

**Files — Modify:** `components/boarding/absence-dialog.tsx`, `app/boarding/attendance/page.tsx`, `app/boarding/in-charge/page.tsx`

- [ ] Dialog: new prop `eveningActive: boolean`; three-way choice (Evening hidden when false), default `full_day`, reset on open; posts `trip`; title names the trip; shows a "replaces your earlier declaration" note when GET `/api/boarding/absence` has a row for the same route and date.
- [ ] Attendance page passes `eveningActive={windows.return.active}`.
- [ ] In-charge page shows the trip in "My absences" and "Cover requests for you".
- [ ] Typecheck; full vitest run. Commit.
