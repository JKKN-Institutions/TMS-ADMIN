# In-charge absence: Morning / Evening / Full day

Source: bug report BUG-1157 (`aeaf1122`), raised 2026-11-25 from `/boarding/attendance`.
Approved by the user on 2026-11-26.

## Intent

A bus in-charge who rides one trip but not the other can only declare the
whole day absent today. Evening attendance is live (about 8,400 evening marks
a week), so the half-day case happens daily. The declaration should say which
trip it is for.

## Goals

- "I am absent today" offers Morning, Evening or Full day.
- A half-day absence excuses only that trip. The other trip is still expected.
- A cover request, when accepted, applies to that trip only.
- The 201 existing declarations keep meaning Full day.

## Non-goals

- Different cover colleagues for morning and evening on the same day.
- Any change to learner attendance (the Morning / Evening tabs already exist).
- Request 2 of the same report (unclear; waiting on the reporter).

## Anti-goals

- A half-day absence must never excuse the trip that was not declared.
- No change to the table's unique key on a live table.

## Approaches

1. **One declaration per person per day, with a `trip` field** (chosen).
   One additive column with a default; the key `(assignment_id, absence_date)`
   stays. Declaring again for the same day replaces the earlier choice.
2. One row per trip, Full day = two rows. Allows a different cover per trip,
   but changes the unique key and the accept / decline flow. Rejected: none of
   the 106 cover requests made so far has ever been answered.

## Design

- **Database:** `tms_incharge_absence.trip text not null default 'full_day'`,
  check `trip in ('full_day', 'onward', 'return')`. Same vocabulary as
  `tms_attendance.direction`.
- **Rules (`lib/boarding/share-coverage.ts`):** `isExcused` and `delegatedTo`
  take the trip being asked about. A row applies when its `trip` is
  `full_day` or equals that trip. A row with no `trip` is treated as full day.
- **API (`/api/boarding/absence`):** POST accepts `trip` (default `full_day`),
  rejects unknown values, and rejects `return` while evening attendance is
  switched off. GET returns `trip`. Notifications name the trip.
- **Dialog:** three-way choice, default Full day. Evening is hidden when
  evening attendance is off. If a declaration already exists for that route
  and day, the dialog says so and that saving replaces it.
- **Readers:** the In-charge Marking report passes its selected trip; the
  coverage board is morning-only and passes `onward`; the roster and mark
  routes pass the trip being viewed or marked.
- **In-charge page:** "My absences" and "Cover requests" show the trip.

## Rollout

The migration is additive, so it is applied before the code deploys. Old code
ignores the new column.

## Left to the builder

Wording, and the exact shape of the three-way control.
