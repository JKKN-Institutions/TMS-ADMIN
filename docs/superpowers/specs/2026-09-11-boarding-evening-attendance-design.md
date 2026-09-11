# Evening return-trip attendance, switched on from Settings, applied live

Status: approved design, not yet implemented
Date: 2026-09-11
Module: boarding staff portal (attendance, scanner) and admin Settings

## Problem

Boarding staff can mark attendance for the morning trip only. The evening
return leg was retired earlier: the application code refuses any direction but
`onward` in six places, and the time-window loader filters the evening row out.
The product owner now wants the evening trip back, controlled from Settings,
with a change reaching staff screens immediately.

A second, pre-existing defect sits under "immediately". The boarding attendance
page loads the scan windows once, on mount, with default React Query settings,
and never re-reads them. The server applies a change on the very next request,
but an already-open staff screen keeps showing the old times until reloaded. On
2026-09-11 the morning window was widened at 14:02 IST; any staffer whose page
was already open still saw "scanning closed" for the new hours.

## What the database already supports (measured 2026-09-11)

The retirement lived only in the application. Nothing in the schema blocks it.

- `tms_attendance` has `UNIQUE (learner_id, trip_date, direction)` and a
  direction check allowing `onward` and `return`, so a learner can hold one
  morning and one evening mark per day.
- `tms_mark_attendance(p_marks, p_trip_date, p_direction, ...)` already takes a
  direction and passes it through.
- `tms_booking` has no direction column (`learner_id, travel_date, route_id,
  stop_id, booked_at, booked_by`). One booking covers both trips of a day.
- `tms_route_stop.evening_time` exists, and `lib/booking/roster.ts` already
  resolves stop times per leg.
- The roster endpoint already accepts `?direction=return`.
- There have been ZERO `direction = 'return'` attendance rows, ever.
- `tms_attendance_window` holds both rows. Live values:

| direction | start | end | enabled |
| --- | --- | --- | --- |
| onward | 07:00 | 17:30 | true |
| return | 16:30 | 19:00 | true |

## Decisions taken with the product owner

1. **The trip is chosen automatically by the server's clock.** Inside the
   morning window a mark is a morning mark; inside the evening window, when
   evening is switched on, it is an evening mark; otherwise marking is closed.
   Staff never pick. Any direction a client sends is ignored.
2. **A Settings change reaches open staff screens instantly, by push.**

## The `enabled` trap

In `lib/boarding/attendance-window.ts`, `isDirectionOpen` returns true for any
window whose `enabled` is false: that flag means "apply the time limit", and a
disabled window is open ALL DAY. It therefore cannot double as the evening
on/off switch. Setting the evening row's `enabled` to false would open evening
marking around the clock, not switch it off.

A separate flag is required. `enabled` keeps its existing meaning unchanged.

## Design

### 1. Schema

Add `is_active boolean not null default true` to `tms_attendance_window`, then
set it to `false` on the `return` row in the same migration. The onward row
stays `true` and is never read as a switch; morning attendance is always on.

A missing `return` row means evening is off.

### 2. Time-window logic: `lib/boarding/attendance-window.ts`

- `AttDirection` widens to `'onward' | 'return'`.
- `AttendanceWindow` gains `active: boolean`.
- `AttendanceWindows` becomes `{ onward: AttendanceWindow; return: AttendanceWindow }`.
  The default return window is 16:30 to 19:00, time-limited, and INACTIVE.
- `loadAttendanceWindows` reads both rows, falling back to the defaults for
  either when absent or on error.
- `activeDirection(windows, now)` returns `'onward'` when the morning window is
  open; otherwise `'return'` when evening is active and its window is open;
  otherwise `null`. If stored data ever overlaps despite validation (a direct
  SQL edit), morning wins, so the answer is always deterministic.
- New pure `validateWindows(windows)` returns an error string or null:
  - each time-limited window needs start before end;
  - when evening is active, BOTH windows must be time-limited, because an
    always-open window overlaps everything and automatic trip choice would be
    meaningless;
  - when evening is active, the windows must not overlap, using half-open
    intervals `[start, end)`, so a morning ending at 16:30 and an evening
    starting at 16:30 is allowed.

### 3. Admin Settings

`app/api/admin/attendance-windows/route.ts` GET returns both windows including
`active`. PUT accepts `{ onward, return }`, runs `validateWindows`, writes both
rows, logs the change, and after the write commits sends the live signal in
section 6. The existing `tms.attendance.manage` permission gate is unchanged.

`components/admin/attendance-window-settings.tsx` gains an "Evening return trip"
card: an on/off switch for evening attendance, then start and end times, reusing
the existing `WindowCard`. The save shows the validation message when refused,
for example "End the morning window at or before 16:30 to switch on evening
attendance".

### 4. Marking endpoints

In `app/api/boarding/scan/route.ts` and both handlers in
`app/api/boarding/attendance/route.ts` (mark and clear), the three
`body.direction !== 'onward'` guards are removed. The trip is decided by two
pure functions in a new `lib/boarding/trip-direction.ts`, because the three
handlers need different rules:

- **Scan, and mark by ordinary staff:** the server clock decides,
  `activeDirection(windows)`. No open window refuses with 409
  `window_closed`, naming the hours of every switched-on trip. If the request
  names a DIFFERENT trip from the clock's, refuse with 409 `wrong_trip` ("It is
  the evening trip now. Reload the page to mark it."). Silently using the
  clock's trip would record an evening mark from a staffer looking at a stale
  morning roster.
- **Mark by a window-exempt caller** (super admin, or holder of
  `tms.attendance.override`): these callers exist to correct marks outside the
  windows, where the clock gives no answer. They name the trip they are
  correcting. `onward` is always allowed; `return` only while evening is
  switched on. With no trip named, fall back to the clock, then to `onward`.
- **Clear (undo):** there is no time window on undo, and it removes a specific
  existing mark, so the request names the trip. The clock must NOT decide:
  an undo at 17:00 would otherwise delete the evening mark when the staffer
  meant the morning one. `return` is allowed only while evening is switched on;
  with no trip named, `onward`, which keeps older clients working.

An unrecognised trip value refuses with 400.

Every other gate is unchanged and runs in the same order: permission, identity
resolution, learner lookup, allocated route, route assignment, booking and
walk-up, and the atomic write. The write now passes the computed direction.

The evening leg uses the same rules as the morning: the same daily booking, the
same walk-up flow, the same fee badge, the same first-mark-wins ownership.

`app/api/boarding/attendance-window/route.ts` (the staff-facing GET) returns
both windows and the server-computed `activeDirection`.

### 5. Boarding attendance page and scanner

`app/boarding/attendance/page.tsx` gains Morning and Evening tabs. The Evening
tab appears only when evening is active. The default tab is the server's
`activeDirection`, else Morning. The roster request passes the selected tab as
`direction`. Marking controls are enabled only on the tab whose window is open
now; other tabs are view-only.

`components/boarding/scan-dialog.tsx` names the trip it is marking, from the
server's active direction, and runs the camera only while some leg is open. Its
closed banner lists the hours of every active trip.

### 6. Instant push of a Settings change

The mechanism mirrors live bus tracking (`lib/tracking/broadcast.ts`,
`hooks/use-live-bus.ts`, policy `tms_bus_realtime_receive`).

- **Topic:** a private channel, `tms_attendance_settings`.
- **Send:** new `lib/boarding/attendance-broadcast.ts` exports
  `publishAttendanceSettingsChanged()`. It posts one message to the Realtime HTTP
  broadcast endpoint with the service-role key, event `changed`, and an EMPTY
  payload. It returns a boolean and never throws: the settings write has already
  committed, so a failed signal may only delay a screen, never corrupt anything.
- **Receive rule:** a new RLS policy on `realtime.messages` lets a user receive
  on exactly `tms_attendance_settings` when `user_has_permission('tms.attendance.scan')`.
  It is a new, separate policy; the bus policy is not edited.
- **Listen:** new `hooks/use-attendance-settings-live.ts` subscribes on the
  boarding attendance page and, on `changed`, invalidates the
  `['boarding-attendance-window']` query so the page re-reads through the
  existing permission-checked endpoint.

The signal carries no data on purpose. What a staffer may see is decided in one
place, the GET endpoint, never by the channel.

Fallbacks, because phones drop live connections when backgrounded: the windows
query also re-reads on tab focus and every two minutes.

## Channel name, and what must be verified live

The settings listener subscribes to the BARE topic `tms_attendance_settings`,
the exact name the server sends to. The live-bus hook appends
`#${instanceId}` only because several consumers on one page share a topic on
the singleton client; the settings listener has one subscriber per page and
needs no suffix. Sending to `X` and listening on `X` is the standard path.

Before merge, a subscriber on the bare topic must be seen to receive a broadcast
sent the way the settings save sends it.

As a report-only diagnostic, the same check also tests whether a channel named
`X#suffix` receives a message sent to `X`. The bus receive policy parses a
route id out of the topic with `split_part(topic, ':', 2)::uuid`, which a
`#suffix` would break. If the suffix blocks delivery, live bus tracking may be
quietly running on its polling fallback. That is REPORTED, not fixed, here.

## State at deploy

Evening ships switched OFF. The live morning window currently ends at 17:30 and
overlaps the stored evening start of 16:30, so switching evening on will be
refused until the morning window is ended at or before the evening start.

## Testing

Pure unit tests, under `lib/` so vitest resolves the `@/` alias:
- `activeDirection`: morning open; evening open and active; evening open but
  inactive gives null; both closed gives null; overlapping stored data gives
  morning.
- `validateWindows`: overlap refused; touching windows allowed; evening active
  with an always-open window refused; evening inactive ignores the evening
  times; start after end refused.
- The loader's fallbacks when either row is missing.

Database: execute the migration's effect once; confirm `is_active` is false on
the return row; confirm the new receive policy exists and does not alter the
bus policy.

Browser, by the product owner on a phone, since this agent's browser is not
logged in: switch evening on in Settings with a staff screen already open and
watch it change without reloading; scan inside the evening window and see an
evening mark; scan outside both windows and be refused.

## Out of scope

- Any change to bookings; one daily booking already covers both trips.
- Any change to fee rules or the fee badge.
- Staff (non-learner) attendance.
- Saving the fee status with attendance.
- Fixing live bus tracking if the channel-name check implicates it.
- Changing the live morning window; that is the product owner's setting.

## Risks

| Risk | Mitigation |
| --- | --- |
| Evening marks recorded as morning, or the reverse | Server clock decides; overlapping windows refused; deterministic tie rule |
| The `enabled` flag misread as the on/off switch | Separate `is_active` column; `enabled` meaning untouched and documented |
| The push reaches a staffer who may not scan | Receive policy requires `tms.attendance.scan`; the signal carries no data |
| The push silently fails | Screens also re-read on focus and every two minutes; the server enforces times regardless |
| Re-enabling breaks morning marking | Morning path keeps every gate; only the direction source changes; full suite plus the existing attendance tests |
