# Boarding attendance — shared roster, owned marks

**Date:** 2026-07-29
**Status:** Design approved, ready for an implementation plan
**Base:** `feat/boarding-attendance-mark-ownership`, branched off `main` at `173cdbe`
(local `main` verified **0 ahead / 0 behind** `origin/main` at branch time — re-verify with
`git fetch && git rev-list --left-right --count origin/main...HEAD` before merging).

## Problem

A route can have **many** boarding staff. This is not an edge case — it is the norm:

| Route | Name | Active boarding staff |
|---|---|---|
| 16 | GOBI | **12** |
| 18 | GANAPATHIPALAYAM (VIA SOLAR) | 10 |
| 12 | EADAPPADI (KONGANAPURM) | 9 |
| 29 | THIRUPPUR | 8 |
| 39 | ATHANI (KAALIPATTI) | 7 |

**98 active assignments across 22 routes** — 4.5 staff per route on average
(`tms_staff_route_assignment where is_active`, measured 2026-07-29).

Attendance is **already shared** across those staff, and the sharing already works. On route 16:

| Date | Marks | Distinct staff who marked |
|---|---|---|
| 2026-07-29 | 31 | **4** (govindharaj_s, hodcs, saranya_g, sathyas) |
| 2026-07-28 | 10 | **4** (+ ranjithkumar.s) |

Four staff split a 31-student roster between them and all twelve see the combined result. That is
correct and stays. The problem is that sharing is **unattributed, unsynchronised, and unprotected**:

1. **Staff B's screen does not update when Staff A marks.** `providers/query-provider.tsx:16-18`
   sets `staleTime: 60_000` with `refetchOnWindowFocus: false`, and the roster query
   (`app/boarding/attendance/page.tsx:55-58`) adds no `refetchInterval`. On a moving bus with the
   page open for thirty minutes, Staff B never sees Staff A's marks without a manual reload — and
   re-marks students already done.

2. **Nobody can see who marked whom.** `scanned_by` is written in exactly two places
   (`api/boarding/attendance/route.ts:92`, `api/boarding/scan/route.ts:176`) and **read in zero**.
   It reaches no API response and no UI column. Neither the staff nor the transport office can tell
   that 4 of route 16's 12 staff are carrying the entire load.

3. **Two staff silently overwrite each other.** The upsert at
   `api/boarding/attendance/route.ts:100-102` is `onConflict: 'learner_id,trip_date,direction'` with
   no guard. Staff A marks a learner *present*; Staff B taps *absent* a second later; B wins, with no
   warning, no prompt, and no record that A ever marked anything.

## What we are building

Keep the shared roster. Add **ownership** to each mark.

`tms_attendance` keeps **one row per `(learner_id, trip_date, direction)`** — unchanged. What changes
is *who may write to a row that already exists*, plus the attribution and refresh that make the
sharing legible.

### Locked decisions

| Question | Choice |
|---|---|
| Shared or per-staff attendance | **Shared** — one row per learner-day, any assigned staff may create it |
| Someone else's mark | **Locked** — first mark wins; the button does not render for other staff |
| Who may override a lock | **`transport_head` + super admin only.** New `tms.attendance.override` key |
| A QR scan of a locked row | **The scan wins.** A scanned pass is physical proof of boarding |
| Marker's own mark | **Always editable by them** — correcting your own mistake stays one tap |
| Admin visibility | **Yes** — per-staff mark counts on the existing attendance analytics tab |
| Refresh mechanism | **Polling**, not Supabase realtime (see *Why polling* below) |

### Why polling, not realtime

`tms_attendance`'s only RLS policy is `tms_att_learner_select` — a **learner** may read their own
rows. Boarding staff read through the service-role API, which applies the route-assignment authority
check. A realtime subscription would bypass that API and therefore need a **new staff SELECT policy
on the table**, re-implementing the route-assignment boundary in SQL and widening direct table
access for 98 accounts.

Polling reuses the existing endpoint and its authority check unchanged. The codebase already uses
this exact pattern for live data: `app/boarding/live-track/page.tsx:84` (5s),
`app/driver/location/page.tsx:70` (15s). Realtime is used in exactly one place
(`hooks/use-tms-notifications.ts`) for a table whose RLS is already per-user.

## The ownership rule

One pure function in `lib/boarding/attendance-ownership.ts` is the single authority. No I/O — the
routes gather the facts, this decides. Same shape as `lib/boarding/incharge-attendance.ts`.

```ts
export type MarkDecision =
  | { action: 'write' }
  | { action: 'override'; from: 'present' | 'absent'; previousBy: string | null }
  | { action: 'noop'; reason: 'already_that_status' }
  | { action: 'deny'; reason: 'locked' };

export function decideMark(input: {
  existing: { status: 'present' | 'absent'; scannedBy: string | null } | null;
  requestedStatus: 'present' | 'absent';
  actorId: string;
  isOverrideHolder: boolean;   // tms.attendance.override
  isSuperAdmin: boolean;
  viaScan: boolean;            // a QR scan, not the manual button
}): MarkDecision;
```

Decision table — every case the function must cover, and its test list:

| # | Existing row | Requested | Actor | Result |
|---|---|---|---|---|
| 1 | none | present/absent | any assigned staff | `write` |
| 2 | mine | different status | me | `write` |
| 3 | mine | same status | me | `noop` |
| 4 | **someone else's** | **same status** | any staff | `noop` — *the stale-screen case* |
| 5 | **someone else's** | **different status** | plain staff, manual | **`deny: locked`** |
| 6 | someone else's | different status | plain staff, **via scan** | `override` |
| 7 | someone else's | different status | override holder / super admin | `override` |
| 8 | `scannedBy IS NULL` | different status | any staff | `write` — *unowned* |

**Case 4 is the one that is easy to get wrong.** It is what a stale screen produces: Staff B's roster
still says "unmarked", they tap Present, but Staff A marked Present forty seconds ago. Returning a
lock error there punishes someone who did nothing wrong and did not even see a lock icon. It must
succeed quietly.

**Case 8 exists because the column is nullable.** `scanned_by uuid references profiles(id) on delete
set null` — deleting a staff profile nulls the marker on every row they created. All 347 live rows
currently have a marker (0 nulls, verified 2026-07-29), but without this rule a future profile
deletion would freeze those rows permanently, editable by nobody.

## Schema

One additive migration. No column is dropped, no constraint changes, the unique key is untouched.

```sql
alter table public.tms_attendance
  add column if not exists previous_status     text,
  add column if not exists previous_scanned_by uuid references public.profiles(id) on delete set null,
  add column if not exists previous_scanned_at timestamptz;
```

Single-level history — exactly enough to render `(was Absent · Saranya G · 7:30 AM)` on an
overridden row. Deeper history is not stored here; the activity log already carries the full trail.

A `check (previous_status is null or previous_status in ('present','absent'))` mirrors the existing
`status` constraint.

## Permission

New key `tms.attendance.override`, added to `TMS_PERMISSIONS` in `lib/constants/tms-permissions.ts`.

The existing keys **cannot** express this. Measured 2026-07-29:

| Role | `attendance.view` | `attendance.scan` | `attendance.manage` |
|---|---|---|---|
| `transport_boarding` (the 98 staff) | ✗ | ✓ | **✓** |
| `transport_head` | ✓ | ✓ | **✓** |

Boarding staff and transport head both hold `tms.attendance.manage`, so gating an override on it
would hand the override to all 98 staff and reinstate the free-for-all.

The seed migration mirrors `20260717130000_pin_vacate_perms_to_transport_head.sql` exactly: grant to
`transport_head`, then **strip the key from every other role**, so the rule is enforced rather than
incidental. Super admins bypass in code (`requirePerm`'s `if (auth.isSuperAdmin) return true`) and
hold no `custom_role`, so they must not be granted it.

## Surfaces

### 1. Roster read — `GET /api/boarding/attendance/roster`

- Select `scanned_by, previous_status, previous_scanned_by, previous_scanned_at` alongside the
  existing columns.
- Resolve marker display names in **one batched `profiles` lookup** over the distinct
  `scanned_by ∪ previous_scanned_by` ids. A handful of staff per route sits far below the ~150-UUID
  `.in()` ceiling, but the query **must still check `error`** — an unchecked `{ data }` on a failed
  `.in()` silently yields an empty map and every row would render as unattributed.
- Compute `can_edit` **on the server** from `decideMark`, using `auth.userId` and one
  `requirePerm(auth, ATTENDANCE_OVERRIDE)` call. The client must not decide authority.

`RosterRow` (`lib/booking/roster.ts:131`) gains:

```ts
marked_by_id: string | null;
marked_by_name: string | null;
can_edit: boolean;
previous_status: 'present' | 'absent' | null;
previous_by_name: string | null;
previous_at: string | null;
```

Safe to extend: `RosterRow` and `buildRosterRows` are consumed **only** by the boarding attendance
page, its columns file, this route, and `roster.test.ts`. (The sibling export `loadBookedRoster` *is*
shared with the in-charge cron — do not touch its signature.)

### 2. Roster UI — `app/boarding/attendance/page.tsx` + `columns.tsx`

- The **Marked** column shows `by Saranya G` beneath the existing time + method icon.
- The **Action** column: unchanged button when `can_edit`; a 🔒 badge otherwise, titled
  *"Marked Present by Saranya G at 7:42 AM. Only they or the transport office can change it."*
  When `!canMark` (wrong day or closed window) nothing renders, as today.
- An overridden row shows a muted second line: `was Absent · Saranya G · 7:30 AM`.
- Query options on the roster query only:
  `refetchInterval: canMark ? 15_000 : false` and `refetchOnWindowFocus: true`.
  Polling a historical date is pointless load, so it is gated on the same `canMark` that gates
  marking. Window-focus refetch matters because staff switch phone apps constantly.
- The CSV export gains a **Marked By** column.

### 3. Manual mark — `POST` / `DELETE /api/boarding/attendance`

`POST` reads existing rows for the submitted learner set **before** upserting, runs `decideMark` per
learner, and partitions the batch:

- `write` / `override` → upserted. `override` additionally fills the three `previous_*` columns.
- `noop` → not written, reported back as already-marked.
- `deny` → not written, reported back as locked.

Response becomes `{ success: true, updated, skipped, locked: [{ learnerId, markedBy, markedAt,
status }] }`. A single-item mark that is denied returns **409** with `reason: 'locked'` so the client
can toast the marker's name and refetch. Bulk marks return 200 with a partial result — one locked
learner must not fail the other nineteen.

`DELETE` (`clearMarks`) gets the same ownership gate. It is currently **unreachable from the UI** —
no client calls it (row-level Undo was removed in PR #9) — but it remains an exposed endpoint that
today lets any assigned staff delete any mark on the route.

Both handlers log overrides to the activity log with `metadata.reason = 'override'` and the previous
marker's id.

### 4. Scanner — `POST /api/boarding/scan`

After resolving the learner and passing the existing window + route-assignment gates:

- **No row** → insert `present`, as today.
- **Row already `present`** → write nothing; return `ok` with `alreadyMarked: { by, at }`.
  First-marker attribution is preserved — a re-scan must not reassign credit.
- **Row is `absent`** → write `present`, fill `previous_*`, log the override, and return `ok` with
  `overrode: { from: 'absent', by, at }` so the scan dialog can say
  *"Priya was marked absent by Saranya G — corrected to present."*

This is the deliberate asymmetry: the scan can only fix `absent → present`. It cannot flip a present
learner to absent, because a scan is evidence of boarding and nothing else.

### 5. Admin reporting — `attendance-tab.tsx` + `lib/booking/analytics-attendance.ts`

`AttendanceBlock` (`lib/booking/analytics-types.ts:122`) gains:

```ts
markedByStaff: { id: string; label: string; marks: number; present: number; absent: number }[];
staffWithNoMarks: number;
assignedStaffTotal: number;
```

- Computed from **`attendanceForComposition`** — the full-filter-depth population, consistent with
  the existing `byStatus` / `byDirection` / `byMethod` blocks. Not from `attendanceForJoin`, which is
  deliberately un-narrowed for the booked↔boarded join.
- `AttendanceRow` gains `scanned_by: string | null`; `Labels` gains `staff: LabelMap`.
- `staffWithNoMarks` counts active `tms_staff_route_assignment` rows on the in-scope routes whose
  staff has no mark in the range. The assignment↔profile join **must** use
  `lower(profiles.email) = lower(staff_email)` — the same match `getAssignedRouteIdsForUser` uses.
  Staff carry three distinct email addresses and `staff_email` is a raw string; matching the wrong
  one silently reports a working staffer as having marked nothing.
- UI: a table under the existing attendance charts — staff, marks, present, absent, sorted by marks
  descending — with a caption reading *"8 of 12 assigned staff marked nothing in this range."*

## Error handling

- A failed marker-name lookup degrades to `marked_by_name: null` (renders as *"by —"*), never a 500.
  The roster must always render; that is the existing defensive contract on this route.
- A `deny` is a **409**, not a 403. 403 means "you may not use this endpoint"; the staffer may — this
  specific row is taken. The distinction matters for the client's toast copy.
- The lock is enforced **server-side only**. `can_edit` on the row is a rendering hint; a client that
  ignores it and POSTs anyway is still denied.
- Partial batch failure never rolls back the successful marks.

## Testing

| What | How |
|---|---|
| `decideMark` — all 8 cases in the table above | `lib/boarding/attendance-ownership.test.ts` (vitest, pure, no stubs) |
| `buildRosterRows` carries the new fields | extend `lib/booking/roster.test.ts` |
| `markedByStaff` / `staffWithNoMarks` aggregation | extend `lib/booking/analytics-attendance.test.ts` |
| Migrations apply cleanly | `mcp__supabase__apply_migration`, then re-query the permission grid |
| Compiles | `next build` (ESLint is broken; `tsc` is chronically red and not a gate — see memory) |
| Live marking, locking, scan override | **Requires the user's authenticated browser.** The agent's Chrome is unauthenticated and cannot reach `/boarding/*` |

## Risks and non-goals

**This locks out staff who are used to marking freely.** Route 16's 8 non-marking staff can no longer
touch the 31 rows their 4 colleagues created. That is the intent, but it is a live behaviour change
for 98 people across 22 routes, landing without a migration window.

**A wrong mark has no self-service correction path** once the marker leaves the bus. The QR escape
hatch only fixes `absent → present`. Everything else routes through transport head or a super admin.
This is the accepted cost of first-mark-wins.

**The in-charge enforcement cron is unaffected and stays route-scoped.** `DayFacts.attendanceMarked`
in `lib/boarding/incharge-attendance.ts:26` means "any mark on this route today", so all 12 of route
16's staff still have their strike reset when any one of them marks. That remains correct under this
design — the lock governs *who may edit a mark*, not *who is credited with the route being covered*.
(The cron is in any case dormant in production; both Vercel crons have never run.)

**Not in scope:**
- Per-staff attendance sheets (explicitly rejected — the roster stays shared).
- Splitting a route's roster between staff by stop (no staff→stop assignment concept exists; the
  assignment table is staff→route only).
- Supabase realtime on `tms_attendance`.
- Fixing the known UTC/IST `todayStr()` drift on the attendance page
  (`app/boarding/attendance/page.tsx:13` uses UTC while the booking domain uses `istToday()`; they
  disagree 00:00–05:30 IST). Pre-existing, unrelated, and touching it would widen the blast radius of
  a behaviour change already affecting 98 users.
