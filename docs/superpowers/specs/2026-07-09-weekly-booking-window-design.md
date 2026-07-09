# Weekly booking window — design

**Date:** 2026-07-09
**Status:** Approved (implementing)
**Area:** Daily bus booking (student portal + shared booking lib)

## Problem

Learners can currently book a seat up to **92 days ahead** (`MAX_BOOKING_HORIZON_DAYS = 92`
in `lib/booking/window.ts`). The transport office wants to restrict this to **one week**:
only the current service week should be bookable; everything further out must be blocked in
the calendar and rejected by the server.

## Decisions (from brainstorming)

1. **Window length** — *calendar week through Sunday*, resets weekly (not a fixed rolling
   7-day count, not a 1-day window).
2. **Weekend rule** — *next week opens on Saturday*. Because Sunday is a compulsory no-service
   holiday, a strict "this week only" rule would strand the upcoming Monday (whose cutoff is
   Sunday 20:00). So once the current week has no bookable day left (Saturday onward), the
   window rolls to next week, keeping Monday reservable across the weekend.
3. **Blocked-date UX** — keep the familiar month grid; out-of-window days keep rendering as the
   greyed, mark-free `out_of_horizon` cell (already implemented); the **Next-month arrow is
   disabled** once no bookable day remains ahead. Past-month navigation stays enabled so
   learners can still review attendance history.

## The rule

Bookable = `tomorrow … bookingWeekEnd(today)` inclusive, where `bookingWeekEnd` is the Saturday
that closes the current week, rolling to the following Saturday once today *is* Saturday.

| Today (IST) | Bookable window |
|---|---|
| Mon Jul 6  | Tue 7 → Sat 11 |
| Wed Jul 8  | Thu 9 → Sat 11 |
| Fri Jul 10 | Sat 11 only |
| Sat Jul 11 | Mon 13 → Sat 18 (rolls to next week) |
| Sun Jul 12 | Mon 13 → Sat 18 |

Sundays that fall inside the range stay in the returned list but remain non-bookable via the
existing `isSunday` gate — unchanged from today. The "8 PM the day before" cutoff is unchanged.

## Architecture

Single source of truth: `bookableDates()` in `lib/booking/window.ts`. Every booking surface —
the calendar cell logic (`cellStatus`, `effectiveOpen`), the server book/cancel gate
(`app/api/student/bookings/route.ts`), and cancellation (`isCancelable`) — reads through it, so
the client greying and the server rejection move together. The change is therefore one pure
function plus a small helper, with the rest being UI polish and tests.

### Changes

- **`lib/booking/window.ts`** — remove `MAX_BOOKING_HORIZON_DAYS`; add exported
  `bookingWeekEnd(today)`; rewrite `bookableDates()` to walk `tomorrow … bookingWeekEnd(today)`.
- **`app/student/bookings/page.tsx`** — compute `maxMonth` (month of the furthest bookable
  date) and pass to `<BookingCalendar>`; update the guidance copy to describe the weekly rule.
- **`components/booking/booking-calendar.tsx`** — add optional `maxMonth`/`minMonth` props;
  disable the Next (and, if `minMonth` given, Prev) navigation button at the boundary. Cell
  rendering unchanged.
- **`lib/booking/window.test.ts`, `lib/booking/calendar.test.ts`** — update the tests that
  hard-coded the 92-day horizon; add tests for the Saturday roll and the Sunday-shows-next-week
  behavior.

## Out of scope / consequences

- Admin summary + reminders (`/api/admin/bookings/*`) only use `bookableDates()[0]` (tomorrow) —
  unaffected.
- Legacy `global-booking-calendar.tsx` / `booking-window-status.tsx` (old schedule module) are a
  separate system — not touched.
- Admin per-date deadline overrides (`tms_booking_window`) can now only extend a date *within*
  the current week, not beyond it — consistent with "only one week available".

## Verification

- `npx vitest run lib/booking` — all booking unit tests green.
- `npx tsc --noEmit` on the changed files — no type errors.
