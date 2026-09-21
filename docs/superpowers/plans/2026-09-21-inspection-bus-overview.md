# Inspection "Everything about this bus" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** After scanning a bus, the check screen shows tabs Bus · Stops · Riders · Staff · Checklist with full route/stop timings, learner attendance, boarding in-charge duty, driver trip, staff riders, a headcount, and a verify-only learner ID scan.

**Architecture:** One migration column, pure helpers in `lib/inspections/overview.ts` (unit-tested), a new overview API + headcount API + learner-scan API under `app/api/admin/inspections/[id]/`, and client tabs on the existing check page. Riders come from the EXISTING `/api/admin/attendance/roster`.

**Tech Stack:** Next.js App Router, Supabase, TanStack Query, html5-qrcode, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-21-inspection-bus-overview-design.md` (parent: `2026-09-21-bus-inspection-design.md`)

## Global Constraints

- Worktree `D:\Sangeetha_V\TMS-ADMIN\.worktrees\inspection-overview`, branch `feat/inspection-overview`. Never commit `.env`.
- API pattern: `withAuth` + `createServiceRoleClient()` + `requirePerm` from `lib/inspections/server.ts` + `{ success, data }` / `{ error }`.
- Read APIs: `INSPECTION_VIEW` or `INSPECTION_CONDUCT`. Mutations: `INSPECTION_CONDUCT` + draft-only + owner-or-super-admin (same as `[id]/items`).
- Legs are `'onward' | 'return'`, labelled via `LEG_NAME` from `lib/boarding/attendance-window.ts` (Morning / Evening).
- Dates: `istToday()` from `lib/booking/window.ts`.
- `.in()` filters chunked ≤150 ids.
- Learner scan is camera-only (`classifyScan(raw, 'camera')` from `lib/boarding/scan-resolve.ts`); never writes `tms_attendance`.
- Toasts: `react-hot-toast`. Permissions on client: `usePermissions().can`. Mobile-first, no horizontal overflow, `dark:` variants.
- Every mutation: `await logActivity(auth, request, { module: 'inspections', ... })`.
- Verify: `npx vitest run lib/inspections`, scoped `npx tsc --noEmit -p . 2>&1 | grep -E "inspections" || echo CLEAN`. `npm run lint` is broken.

---

### Task 1: Migration — riders leg column

**Files:** Create `supabase/migrations/20260921140000_tms_inspection_riders_leg.sql`

- [ ] **Step 1: Write**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Bus Inspection: which trip leg the riders snapshot (booked/boarded/headcount)
-- was taken for. Target: kvizhngldtiuufknvehv. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tms_inspection
  add column if not exists riders_leg text check (riders_leg in ('onward','return'));
```

- [ ] **Step 2:** Apply via Supabase MCP `apply_migration` (name `tms_inspection_riders_leg`); verify `select column_name from information_schema.columns where table_name='tms_inspection' and column_name='riders_leg';` → 1 row.
- [ ] **Step 3:** Commit `feat(inspections): riders_leg column for the headcount snapshot`.

---

### Task 2: Pure overview helpers (TDD)

**Files:** Create `lib/inspections/overview.ts`, `lib/inspections/overview.test.ts`

**Interfaces — Produces:**
```ts
export type Leg = 'onward' | 'return';
export function defaultLeg(istMinutes: number): Leg;
export type LearnerOutcome = 'ok' | 'wrong_bus' | 'not_booked' | 'fee_due' | 'unknown_card';
export function learnerOutcome(i: { known: boolean; onThisRoute: boolean; bookedToday: boolean; feesOk: boolean }): LearnerOutcome;
export interface InchargeInput { staffEmail: string; name: string; phone: string | null; profileIds: string[]; emails: string[] }
export interface MarkInput { scannedBy: string; scannedAt: string; markerEmail: string | null }
export interface InchargeDuty { staffEmail: string; name: string; phone: string | null; marks: number; firstAt: string | null; lastAt: string | null; absent: boolean; coveredBy: string | null }
export function inchargeDuty(incharges: InchargeInput[], marks: MarkInput[], absences: { staffEmail: string; coveredBy: string | null }[]): { duty: InchargeDuty[]; otherMarkers: { profileId: string; marks: number }[] };
export function headcountDelta(counted: number | null, boarded: number): { diff: number | null; label: string };
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { defaultLeg, learnerOutcome, inchargeDuty, headcountDelta } from './overview';

describe('defaultLeg', () => {
  it('morning before noon', () => { expect(defaultLeg(7 * 60)).toBe('onward'); expect(defaultLeg(11 * 60 + 59)).toBe('onward'); });
  it('evening from noon', () => { expect(defaultLeg(12 * 60)).toBe('return'); expect(defaultLeg(18 * 60)).toBe('return'); });
});

describe('learnerOutcome (first match wins)', () => {
  const base = { known: true, onThisRoute: true, bookedToday: true, feesOk: true };
  it('ok', () => expect(learnerOutcome(base)).toBe('ok'));
  it('unknown card beats everything', () => expect(learnerOutcome({ ...base, known: false, onThisRoute: false })).toBe('unknown_card'));
  it('wrong bus before not booked', () => expect(learnerOutcome({ ...base, onThisRoute: false, bookedToday: false })).toBe('wrong_bus'));
  it('not booked before fee due', () => expect(learnerOutcome({ ...base, bookedToday: false, feesOk: false })).toBe('not_booked'));
  it('fee due', () => expect(learnerOutcome({ ...base, feesOk: false })).toBe('fee_due'));
});

describe('inchargeDuty', () => {
  const incharges = [
    { staffEmail: 'a@jkkn.ac.in', name: 'Anu', phone: '9', profileIds: ['p1'], emails: ['a@jkkn.ac.in'] },
    { staffEmail: 'b@jkkn.ac.in', name: 'Bala', phone: null, profileIds: [], emails: ['b@jkkn.ac.in', 'bala@gmail.com'] },
    { staffEmail: 'c@jkkn.ac.in', name: 'Chitra', phone: null, profileIds: ['p3'], emails: ['c@jkkn.ac.in'] },
  ];
  const marks = [
    { scannedBy: 'p1', scannedAt: '2026-09-21T02:05:00Z', markerEmail: 'a@jkkn.ac.in' },
    { scannedBy: 'p1', scannedAt: '2026-09-21T02:01:00Z', markerEmail: 'a@jkkn.ac.in' },
    { scannedBy: 'p9', scannedAt: '2026-09-21T02:03:00Z', markerEmail: 'BALA@gmail.com' },
    { scannedBy: 'p7', scannedAt: '2026-09-21T02:04:00Z', markerEmail: 'x@jkkn.ac.in' },
  ];
  const r = inchargeDuty(incharges, marks, [{ staffEmail: 'C@jkkn.ac.in', coveredBy: 'Anu' }]);
  it('attributes marks by profile id and by any email, case-insensitively', () => {
    expect(r.duty[0]).toMatchObject({ name: 'Anu', marks: 2, firstAt: '2026-09-21T02:01:00Z', lastAt: '2026-09-21T02:05:00Z', absent: false });
    expect(r.duty[1]).toMatchObject({ name: 'Bala', marks: 1 });
  });
  it('flags declared absence with cover', () => expect(r.duty[2]).toMatchObject({ name: 'Chitra', marks: 0, absent: true, coveredBy: 'Anu' }));
  it('lists markers who are not assigned', () => expect(r.otherMarkers).toEqual([{ profileId: 'p7', marks: 1 }]));
});

describe('headcountDelta', () => {
  it('no count yet', () => expect(headcountDelta(null, 10)).toEqual({ diff: null, label: 'Not counted yet' }));
  it('matches', () => expect(headcountDelta(10, 10)).toEqual({ diff: 0, label: 'Matches boarded count' }));
  it('extra people', () => expect(headcountDelta(12, 10)).toEqual({ diff: 2, label: '2 more than boarded' }));
  it('missing people', () => expect(headcountDelta(9, 10)).toEqual({ diff: -1, label: '1 fewer than boarded' }));
});
```

- [ ] **Step 2:** `npx vitest run lib/inspections/overview.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
/**
 * Pure helpers for the inspection "everything about this bus" view. No I/O.
 */
export type Leg = 'onward' | 'return';

/** Morning trip before 12:00 IST, evening trip from 12:00. */
export function defaultLeg(istMinutes: number): Leg {
  return istMinutes < 12 * 60 ? 'onward' : 'return';
}

export type LearnerOutcome = 'ok' | 'wrong_bus' | 'not_booked' | 'fee_due' | 'unknown_card';

/** First match wins — the order is the spec's (unknown → wrong bus → not booked → fee due). */
export function learnerOutcome(i: { known: boolean; onThisRoute: boolean; bookedToday: boolean; feesOk: boolean }): LearnerOutcome {
  if (!i.known) return 'unknown_card';
  if (!i.onThisRoute) return 'wrong_bus';
  if (!i.bookedToday) return 'not_booked';
  if (!i.feesOk) return 'fee_due';
  return 'ok';
}

export interface InchargeInput { staffEmail: string; name: string; phone: string | null; profileIds: string[]; emails: string[] }
export interface MarkInput { scannedBy: string; scannedAt: string; markerEmail: string | null }
export interface InchargeDuty {
  staffEmail: string; name: string; phone: string | null;
  marks: number; firstAt: string | null; lastAt: string | null;
  absent: boolean; coveredBy: string | null;
}

const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Who of the assigned in-charges marked this bus today. Staff have up to three
 * emails and may mark from a profile whose email differs from the assignment,
 * so a mark belongs to an in-charge when its profile id OR its marker email
 * matches any of theirs (case-insensitive). Unmatched markers are returned too.
 */
export function inchargeDuty(
  incharges: InchargeInput[],
  marks: MarkInput[],
  absences: { staffEmail: string; coveredBy: string | null }[],
) {
  const absentBy = new Map(absences.map((a) => [lc(a.staffEmail), a.coveredBy]));
  const claimed = new Set<number>();
  const duty: InchargeDuty[] = incharges.map((ic) => {
    const ids = new Set(ic.profileIds);
    const emails = new Set(ic.emails.map(lc));
    const mine: string[] = [];
    marks.forEach((m, idx) => {
      if (ids.has(m.scannedBy) || (m.markerEmail && emails.has(lc(m.markerEmail)))) {
        mine.push(m.scannedAt);
        claimed.add(idx);
      }
    });
    mine.sort();
    const key = lc(ic.staffEmail);
    return {
      staffEmail: ic.staffEmail, name: ic.name, phone: ic.phone,
      marks: mine.length, firstAt: mine[0] ?? null, lastAt: mine[mine.length - 1] ?? null,
      absent: absentBy.has(key), coveredBy: absentBy.get(key) ?? null,
    };
  });
  const other = new Map<string, number>();
  marks.forEach((m, idx) => { if (!claimed.has(idx)) other.set(m.scannedBy, (other.get(m.scannedBy) ?? 0) + 1); });
  return { duty, otherMarkers: [...other].map(([profileId, n]) => ({ profileId, marks: n })) };
}

export function headcountDelta(counted: number | null, boarded: number): { diff: number | null; label: string } {
  if (counted == null) return { diff: null, label: 'Not counted yet' };
  const diff = counted - boarded;
  if (diff === 0) return { diff, label: 'Matches boarded count' };
  return diff > 0 ? { diff, label: `${diff} more than boarded` } : { diff, label: `${-diff} fewer than boarded` };
}
```

- [ ] **Step 4:** tests PASS. **Step 5:** Commit `feat(inspections): pure helpers for the bus overview (leg, learner verdict, in-charge duty, headcount)`.

---

### Task 3: Overview API

**Files:** Create `app/api/admin/inspections/[id]/overview/route.ts`; Modify `lib/inspections/types.ts` (add `InspectionOverview`).

**Interfaces — Produces** (append to types.ts):
```ts
import type { Leg, InchargeDuty } from './overview';
export interface InspectionOverview {
  leg: Leg;
  date: string;
  route: { id: string; number: string | null; name: string | null; start: string | null; end: string | null; departure: string | null; arrival: string | null; capacity: number | null } | null;
  stops: { id: string; order: number | null; name: string; morning: string | null; evening: string | null; major: boolean }[];
  driverTrip: { status: string; startedAt: string | null; endedAt: string | null } | null;
  incharges: InchargeDuty[];
  otherMarkers: { name: string; marks: number }[];
  staffRiders: { staffId: string; name: string; designation: string | null; phone: string | null; stopName: string | null }[];
}
```

- [ ] **Step 1: Implement** — GET, perms VIEW or CONDUCT. Steps inside the handler:
  1. `leg = searchParams.get('leg') === 'return' ? 'return' : 'onward'`; `date = istToday()`; `id` from path index 3 (same `idFrom` as `[id]/route.ts`).
  2. Load `tms_inspection` (`route_id`, `vehicle_id`); 404 if missing. If `route_id` is null → return `{ leg, date, route: null, stops: [], driverTrip: null, incharges: [], otherMarkers: [], staffRiders: [] }`.
  3. In parallel (`Promise.all`), each with its `error` checked (500 on error, `console.error` with a label):
     - `tms_route` `id, route_number, route_name, start_location, end_location, departure_time, arrival_time, total_capacity` by id; capacity = the bus's `tms_vehicle.capacity` if set, else `total_capacity`.
     - `tms_route_stop` `id, stop_name, stop_time, evening_time, sequence_order, is_major_stop` where `route_id`, `is_active = true`, order `sequence_order`.
     - `tms_trip` `status, started_at, ended_at` where `route_id`, `travel_date = date`, `direction = leg`, order `started_at desc`, limit 1.
     - `tms_staff_route_assignment` `staff_email` where `route_id`, `is_active = true`.
     - `tms_incharge_absence` `staff_email, covering_assignment_id` where `route_id`, `absence_date = date`.
     - `tms_attendance` `scanned_by, scanned_at` where `route_id`, `trip_date = date`, `direction = leg`, `scanned_by not null`, `method <> 'auto'`.
     - `staff` `id, first_name, last_name, designation, phone, transport_stop_id` where `bus_required = true`, `transport_route_id = route_id`, `is_active = true`.
  4. Resolve in-charge staff: for the assignment emails (lower-cased, chunked ≤150), query `staff` `id, first_name, last_name, phone, email, institution_email, profile_id` with `.or()` on `email.ilike.<e>,institution_email.ilike.<e>` per email — simpler: two chunked queries `.in('email', emails)` and `.in('institution_email', emails)` after lower-casing both sides is NOT possible in PostgREST, so use `emailIlikePattern` from `lib/identity/email-match.ts` in a per-email loop (assignments per route are few, ≤ ~15). Build `InchargeInput` = `{ staffEmail, name, phone, profileIds: [profile_id].filter(Boolean), emails: [assignment email, staff.email, staff.institution_email].filter(Boolean) }`; unresolved staff → name = the email, phone null.
  5. Marker emails: load `profiles` `id, email, full_name` for the distinct `scanned_by` ids (chunked). Build `MarkInput[]`.
  6. Covering names: for absences with `covering_assignment_id`, load `tms_staff_route_assignment.staff_email` for those ids and map to the resolved in-charge name if present, else the email.
  7. `inchargeDuty(...)`; map `otherMarkers` profile ids → `full_name || email || 'Staff'`.
  8. Staff riders: stop names from the loaded stops map by `transport_stop_id`; name `first last`.
  9. Return `{ success: true, data: InspectionOverview }`.

- [ ] **Step 2:** scoped tsc CLEAN. **Step 3:** Commit `feat(inspections): bus overview API (route, stops, driver trip, in-charge duty, staff riders)`.

---

### Task 4: Headcount and learner-scan APIs

**Files:** Create `app/api/admin/inspections/[id]/headcount/route.ts`, `app/api/admin/inspections/[id]/learner-scan/route.ts`; Modify `app/api/admin/inspections/[id]/route.ts` + `lib/inspections/types.ts` to return the snapshot and learner checks.

- [ ] **Step 1: Headcount (PUT)** body `{ leg: 'onward'|'return', counted: number|null }`. Conduct + draft + owner-or-super-admin (copy the guard from `[id]/items/route.ts`). Validate `counted` is null or an integer 0..500. Server computes for `istToday()` + leg on the inspection's `route_id`: `riders_booked` = count of `tms_booking` (route, travel_date); `riders_boarded` = count of `tms_attendance` (route, trip_date, direction=leg, status='present'). Update `headcount_observed, riders_booked, riders_boarded, riders_leg`. `logActivity` action `'update'`, description `Headcount on <REG>: counted X, boarded Y`. Return `{ success, data: { counted, booked, boarded } }`.
- [ ] **Step 2: Learner scan (POST)** body `{ code: string }`. Conduct + draft + owner-or-super-admin. Flow:
  1. `classifyScan(code, 'camera')`; if `shape !== 'jkkn_id'` or refusal → 400 `{ error: 'That is not a JKKN ID card' }`.
  2. `jkkn_identities` by `jkkn_id` (select `learner_profile_id, retired_at`); unknown/retired/no learner → `known = false`.
  3. If known: in parallel — `learners_profiles` `id, first_name, last_name, roll_number, transport_route_id`; `tms_booking` `route_id` for the learner on `istToday()`; `tms_attendance` present on the inspection route today (any leg); `loadLearnerFeeStatus(svc, learnerId)` wrapped so failure → fees unknown.
  4. `onThisRoute` = today's booking route === inspection route, or (no booking and `transport_route_id` === inspection route). `bookedToday` = booking exists (any route). `feesOk` = `feeBadge(fees)?.tone !== 'overdue'` (unknown counts as ok — never block on a failed lookup).
  5. `outcome = learnerOutcome(...)`; insert `tms_inspection_learner_check` (`inspection_id, learner_id, jkkn_id, outcome, on_this_route, booked_today, boarded_today, fees_ok`).
  6. `logActivity` action `'scan'`, entity `tms_inspection_learner_check`. Return `{ success, data: { outcome, name, roll, onThisRoute, bookedToday, boardedToday, feesOk, feeLabel } }`.
- [ ] **Step 3: Detail API** — in `[id]/route.ts` also load `tms_inspection_learner_check` (order `scanned_at desc`, resolve learner names chunked) and return `riders: { leg, headcount, booked, boarded }` and `learnerChecks: { id, name, roll, outcome, scannedAt }[]` on `InspectionDetail` (extend the type).
- [ ] **Step 4:** scoped tsc CLEAN. **Step 5:** Commit `feat(inspections): headcount snapshot and verify-only learner ID scan APIs`.

---

### Task 5: Check screen tabs — Bus, Stops, Staff

**Files:** Create `components/inspections/leg-switch.tsx`, `components/inspections/stops-tab.tsx`, `components/inspections/staff-tab.tsx`; Modify `app/(admin)/inspections/inspection-api.ts` (add `fetchOverview(id, leg)`), `components/inspections/bus-card.tsx` (accept optional `overview` and show route start→end, departure/arrival, driver trip line), `app/(admin)/inspections/[id]/check/page.tsx`.

Contracts:
- `fetchOverview(id: string, leg: Leg): Promise<InspectionOverview>` → GET `/api/admin/inspections/${id}/overview?leg=${leg}`.
- `<LegSwitch value={leg} onChange={setLeg} />` — two-button segmented control "Morning" / "Evening" (`LEG_NAME`).
- `<StopsTab stops={overview.stops} leg={leg} riderCounts={Map<stopId,{booked:number;boarded:number}>} />` — ordered list: `order. name — time` where time = morning or evening per leg (show the other leg's time small/grey), major stops bold with a badge, rider counts per stop when provided. Empty state "No stops recorded for this route".
- `<StaffTab overview={overview} />` — section "Boarding in-charge" (per InchargeDuty: name, tap-to-call phone, `✅ Marked N learners, 07:34–07:52` in IST `hh:mm`, or `⚠️ Not marked yet`, or `Declared absent · covered by X`; empty: "No in-charge assigned to this route"), "Also marked this bus" (otherMarkers), "Staff who ride this bus" (name, designation, stop; footnote "Staff boarding is not recorded in TMS").
- Bus card driver-trip line: `Trip started 07:32 · ended 08:41` / `Trip in progress since 07:32` / `No trip started in the driver app today`.
- Check page: tab bar `Bus · Stops · Riders · Staff · Checklist` (sticky under the header, horizontally scrollable if narrow — `overflow-x-auto`, no page overflow); `leg` state defaulting to `defaultLeg(istMinutesOfDay())`; `useQuery(['inspection', id, 'overview', leg], ...)`; Riders tab placeholder text "Loading riders…" until Task 6. The checklist (existing) lives in the Checklist tab; the submit bar stays visible on every tab.

- [ ] **Step 1:** Implement. **Step 2:** scoped tsc CLEAN. **Step 3:** Commit `feat(inspections): Bus/Stops/Staff tabs with morning-evening switch`.

---

### Task 6: Riders tab — roster, headcount, learner scan

**Files:** Create `components/inspections/riders-tab.tsx`, `components/inspections/learner-scan-dialog.tsx`; Modify `components/inspections/bus-scanner.tsx` (optional `parse` prop), `inspection-api.ts` (add `fetchRoster`, `saveHeadcount`, `scanLearner`), check page (render RidersTab, feed stop rider counts to StopsTab).

Contracts:
- `fetchRoster(routeId, date, leg)` → GET `/api/admin/attendance/roster?routeId=&date=&direction=` → `{ rows: RosterRow[]; counts: { total, present, absent, unmarked, auto } }` (import `RosterRow` type from `lib/booking/roster`). Query key `['inspection', id, 'roster', leg]`. If the route is null, show "This bus has no active route".
- `BusScanner` gets `parse?: (raw: string) => string | null` (default `parseStickerScan`) and `rejectMessage?: string` — so the same camera component reads JKKN IDs with `(raw) => { const c = classifyScan(raw, 'camera'); return c.shape === 'jkkn_id' && !c.refusal ? c.code : null; }`.
- `<LearnerScanDialog inspectionId open onClose />` — dialog with BusScanner (JKKN parse); on code → `scanLearner(id, code)`; shows a verdict card: ✅ OK (green) / ⚠️ Wrong bus / Not booked today / Fee due (amber) / ❌ Unknown card (red) with name + roll + booked/boarded/fee line; "Scan next" resumes; uses the same synchronous busy-ref guard pattern as the scan page; list of this session's checks below.
- `<RidersTab ... />`: counts row (Booked · Present · Absent · Not marked · Capacity from overview), headcount box (number input + Save → `saveHeadcount(id, leg, counted)`; shows `headcountDelta(counted, present)`), "Scan learner ID" button (conduct + draft + isMine), then rows grouped by `stop_name` in stop order: name, roll, status chip (present green / absent red / not marked grey), `marked by <marked_by_name> · hh:mm`, badges walk-up / other bus / not booked. Read-only — no marking buttons.
- StopsTab rider counts: from roster rows grouped by `stop_id` → `{ booked: rows with booked, boarded: present }`.

- [ ] **Step 1:** Implement. **Step 2:** scoped tsc CLEAN; `npx vitest run lib/inspections` still PASS. **Step 3:** Commit `feat(inspections): riders tab with attendance roster, headcount and verify-only learner scan`.

---

### Task 7: Report shows riders snapshot and learner checks

**Files:** Modify `app/(admin)/inspections/[id]/page.tsx`.

- [ ] Add a SectionCard "Riders at inspection" (`<Leg name>: counted X · boarded Y · booked Z` + `headcountDelta` label, or "Headcount not taken") and "Learner ID checks (N)" list (name, roll, outcome chip, time). Commit `feat(inspections): report shows headcount snapshot and learner checks`.

---

### Task 8: Verification (controller)

- [ ] `npx vitest run` all pass; `next build` (copy `.env` from main, delete after) exit 0; signed-out probes of the 3 new APIs → 401.
- [ ] Rolled-back SQL check of the headcount counts for one route/date.
- [ ] User phone test: scan a bus → Bus / Stops / Riders / Staff tabs → headcount → scan a learner ID → checklist → submit → report shows snapshot.
