# Boarding Attendance — unified page + scanner-in-modal

**Date:** 2026-07-11
**Branch:** `feat/staff-boarding-incharge`
**Status:** Design approved; ready for implementation plan.

## Problem

The boarding-staff portal currently splits attendance across two places:

- **`/boarding/attendance`** — a `TodaysBookings` tap-to-mark **checklist** (booked students grouped route → stop) stacked above a separate "Records" history `DataTable`. Each unmarked rider deep-links *away* to the scanner.
- **`/boarding/scan`** — a standalone module: camera (html5-qrcode) + 6-digit manual code + Onward/Return toggle + walk-up flow.

Staff want a single table-driven attendance screen: today's booked students in a table, today's attendance analytics on top, and a scan button on the table — with the standalone scan module folded in and removed.

## Goals

1. One **Attendance** page: analytics tiles (**Marked / Unmarked / Total bookings**) on top → a **Scan** button + booked-students **DataTable**.
2. Fold the scanner into a **modal** opened from the Scan button; **delete the standalone `/boarding/scan` page**.
3. Per-row **Mark present** for manual marks (no camera, no navigation).
4. Repoint every reference off `/boarding/scan`.

Non-goals: changing the attendance/booking schema; changing admin attendance-window config; reconciling the parallel QR-library swap (see Risks).

## Decisions (confirmed)

| Topic | Decision |
|---|---|
| **Direction** | **Active-leg toggle.** Auto-seed Onward/Return from the server's `activeDirection` (time-window), with a manual toggle. Tiles, row status, boarding time, and marking all follow the selected leg. |
| **Day scope** | **Date picker, today default.** One unified table; past days are read-only review; Scan + Mark actions enabled only when `date === today`. |
| **Walk-ups** | **Booked only.** Table lists booked students; `Marked + Unmarked = Total bookings` stays exact. Walk-ups are still recorded by the scanner, just not listed. |
| **Manual mark vs window** | The **Scan** modal respects the open leg (server-enforced in `POST /scan`). The row **[Mark]** button is a deliberate staff override — allowed for today regardless of window (matches `POST /attendance`, which never enforced the window). |
| **Bottom nav** | Removing Scan frees a primary slot; promote **My Route** into it (primary = Dashboard, My Route, Passengers, Attendance + More). |

## Data model (unchanged, for reference)

- `tms_booking(learner_id, route_id, stop_id, travel_date)` — no status, no direction.
- `tms_attendance(learner_id, route_id, stop_id, trip_date, direction, status, method, is_walk_up, scanned_by, scanned_at)` — upsert key `(learner_id, trip_date, direction)` → **attendance is per leg**.
- `tms_route_stop(..., stop_time, evening_time, sequence_order)` — `stop_time` = onward/morning, `evening_time` = return/evening (per-leg boarding time).
- `tms_attendance_window(direction, start_time, end_time, enabled)` — configurable scan windows.

## Architecture

### New endpoint — `GET /api/boarding/attendance/roster?date=&direction=`

- **Perm:** `tms.attendance.scan` (viewing). Route-scoped via `getAssignedRouteIdsForUser` (super-admin with no assignment → all routes), identical authority boundary to `bookings-today`.
- **Params:** `date` (default `istToday()`, `YYYY-MM-DD` validated); `direction` (`onward`|`return`, default `onward`).
- **Response:**
  ```ts
  {
    date: string;
    direction: 'onward' | 'return';
    rows: RosterRow[];
    counts: { total: number; marked: number; unmarked: number };
  }
  interface RosterRow {
    learner_id: string;
    name: string;
    roll: string | null;
    route_id: string;
    route_number: string | null;
    stop_id: string | null;
    stop_name: string;
    stop_time: string | null;   // leg-appropriate: stop_time (onward) | evening_time (return)
    status: 'present' | 'unmarked';
    method: string | null;      // 'qr_scan' | 'manual' when present
    scanned_at: string | null;
  }
  ```
- **Build:** for each assigned route, `loadBookedRoster(svc, routeId, date)` → booked riders + counts; read that route's stops from `tms_route_stop` selecting **both** `stop_time` + `evening_time`, and set each `OrderedStop.time` to the **leg-appropriate** value (`stop_time` for onward, `evening_time` for return) *before* calling the pure helper — so leg-time resolution stays in the endpoint and the helper keeps the existing `OrderedStop` shape. Read `tms_attendance` for `trip_date=date, direction=<param>, route_id in scope` → `Map<learner_id, {status, method, scanned_at}>`. Flatten to `RosterRow[]` via the pure helper (below). `counts` are derived **from the produced rows** so the invariant always holds: `total = rows.length`, `marked = rows where status==='present'`, `unmarked = total - marked`. 42P01-safe (missing table → empty).

### New pure helper — in `lib/booking/roster.ts` (alongside `groupRosterByStop`)

Also exports the `RosterRow` type consumed by the endpoint, `columns.tsx`, and the page.

```ts
buildRosterRows(
  riders: RosterRider[],              // from loadBookedRoster (learner_id, name, roll, stop_id)
  route: { id: string; route_number: string | null },
  orderedStops: OrderedStop[],        // existing shape; .time already leg-resolved by the caller
  attendanceByLearner: Map<string, { status: string; method: string | null; scanned_at: string | null }>,
): RosterRow[]
```
Pure, unit-tested (mirrors `groupRosterByStop`): joins each rider to its stop (name + already-leg-resolved `time`), sets `status: 'present'` when `attendanceByLearner` has a present row for the learner else `'unmarked'` (attendance is pre-filtered to the leg by the caller, so the helper needs no `direction` param), carries `method`/`scanned_at`, and sorts by stop order then roll/name (unset-stop riders trail). No DB access.

### Page — `app/boarding/attendance/page.tsx` (rewritten)

State: `date` (default today), `direction` (seeded from `GET /api/boarding/attendance-window`'s `activeDirection`; fallback `onward`), `scanOpen` (modal).
Data: React Query `['boarding-roster', date, direction]` → the new endpoint. `['boarding-attendance-window']` for the toggle's open/closed hints.
Renders, top-to-bottom:
1. Header (`Attendance`) + **Onward/Return toggle** (closed-leg hint like the scan page).
2. **Analytics tiles** — Marked / Unmarked / Total bookings (from `counts`), + the **Day** date picker (`max=today`).
3. `<DataTable>` with the roster columns; **Scan** button in `toolbarActions` (always visible when `date===today`); keep the "Export Selected" CSV action.
4. `<ScanDialog>` (mounted when `scanOpen`).
Marking a row or a successful scan → `queryClient.invalidateQueries(['boarding-roster'])` so tiles + table refresh.

### Columns — `app/boarding/attendance/columns.tsx` (rewritten)

`select`, **Learner**, **Roll No.**, **Route** (filterable), **Stop** (`stop_name` + `· HH:MM`), **Status** (`Present` green / `Unmarked` gray badge; filterable), **Marked** (method icon + `scanned_at` time, `—` when unmarked), **Action** (`[Mark present]` for `unmarked` rows; rendered only when `date===today`; disabled while its request is in flight). `getRosterColumns({ onMark, canMark })`.
Filters: Route, Status (Present/Unmarked).

### Scanner modal — `components/boarding/scan-dialog.tsx` (new)

Extracts the existing `scan/page.tsx` scanner **logic verbatim** onto `this branch's html5-qrcode`: camera start/stop, `submit()` → `POST /api/boarding/scan`, 6-digit manual entry, walk-up "not booked" flow + over-capacity warning, result card. Direction comes from the page's selected leg (passed as a prop) + the window state (open/closed banner reused). Props: `{ direction, windows, onClose, onMarked }`. `onMarked` fires after a successful scan so the page invalidates the roster query. No preselect/deep-link params (that flow is replaced by row `[Mark]`).

## Removals & repoints

**Delete:**
- `app/boarding/scan/page.tsx`
- `components/boarding/todays-bookings.tsx`
- `app/api/boarding/bookings-today/route.ts` (dead once `TodaysBookings` is gone — sole consumer)

**Keep:** `POST /api/boarding/scan`, `POST /api/boarding/attendance`, `GET /api/boarding/attendance-window`, `lib/booking/roster.ts` (extended).

**Repoint `/boarding/scan` → `/boarding/attendance` (10 refs):**
| File | Change |
|---|---|
| `proxy.ts:188` | `if (canScan) home = '/boarding/attendance'` |
| `app/auth/callback/route.ts:125` | same |
| `app/boarding/select-route/page.tsx:75,101` | `window.location.assign` / `router.replace` → `/boarding/attendance` |
| `app/boarding/routes/page.tsx:107` | link → `/boarding/attendance` |
| `app/boarding/routes/[routeId]/page.tsx:160` | link → `/boarding/attendance` (label "Attendance & Scan") |
| `app/boarding/dashboard/page.tsx:69,116` | quick-action card → `/boarding/attendance` (retitle "Attendance & Scan") |
| `lib/boarding/navigation.ts:17,28` | remove the `Scan` nav item + its TITLES entry |
| `components/boarding-bottom-nav.tsx:16-21` | `PRIMARY_HREFS`: replace `/boarding/scan` with `/boarding/routes`; update doc comment |

## Edge cases

- **No bookings** → tiles all 0, table "No results."
- **Past date** → read-only: no Mark buttons, Scan button hidden. (Table + tiles still render historical booked+attendance.)
- **Closed leg today** → Scan modal shows the existing closed banner + disabled camera; row `[Mark]` still allowed (override).
- **Walk-ups** → excluded from the table; still recorded by `POST /scan`; excluded from `counts` (booked-only math holds).
- **Multiple assigned routes** → rows span all; Route filter available.
- **Large booked lists** → `loadBookedRoster` already chunks `.in()`; the attendance read chunks the same way if learner id lists exceed ~150.

## Testing

- **Unit (vitest):** `buildRosterRows` — leg-appropriate time, present/unmarked mapping, sort order, unset-stop bucket, empty input. Keep `roster.test.ts`, `attendance-window.test.ts`.
- **Route probes:** unauthenticated `GET /api/boarding/attendance/roster` → 401; wrong route filter → 403 (mirrors existing routes).
- **tsc** on changed files (project has ~pre-existing errors elsewhere; verify no *new* ones).
- **Manual (user, logged-in browser — auth gate blocks headless):** load Attendance; toggle legs; mark a row; open Scan modal, scan/enter a code, confirm the row flips to Present and tiles update; switch to a past date and confirm read-only; confirm all repointed entry points land on Attendance.

## Risks

- **Merge conflict with `feat/boarding-scan-faster-qr`.** That unmerged branch (separate worktree) rewrote `app/boarding/scan/page.tsx` to swap html5-qrcode → `@yudiel/react-qr-scanner`. This design deletes that file and reuses html5-qrcode inside `ScanDialog`. Build on **this** branch as-is; when the two branches meet, port the scanner-library swap into `ScanDialog` (small, localized). Flagged, not blocking.
- **Landing redirect.** `proxy.ts` + `auth/callback` currently send scan-capable staff to `/boarding/scan`; the repoint to `/boarding/attendance` is load-bearing — a missed one would 404 the post-login landing. Covered in the repoint table; verify both in the manual smoke test.
