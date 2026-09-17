# Every scan records attendance; roster shows booked / not booked / fee unpaid — design

Date: 2026-09-16 · Branch: `feat/attendance-scan-tracking` (from origin/main `2588661`) · Status: awaiting approval

## Problem

Boarding staff scan a learner and nothing is recorded when the learner has **no
booking for the day**: the scan API answers `reason: 'not_booked'` and waits for
a second tap on "Add as walk-up". On a moving bus that tap is often not made, so
those learners are untracked. Unpaid fees do NOT block a scan today (fees are a
display badge only), but staff believe they do, because the not-booked panel and
the fee badge appear together.

The Attendance list also has no fee information at all, so "who boarded without
paying" cannot be answered from the screen.

Measured (live, 2026-09-16): 1,825 active riders; 889 booked today; **484 riders
overdue** (₹19,86,700 outstanding) and 471 with Term 1 unpaid; 8 riders have no
bill. A set-based fee query for the whole rider set runs in **58 ms**.

## Decisions (confirmed by the user)

1. A scan of an unbooked learner **records present immediately**, flagged
   "travelled without booking". No confirm tap, online or offline.
2. A scan of a fee-unpaid learner **records present** and shows a **red** fee
   warning. Tracking, never blocking.
3. The Attendance list gets a **fee column + fee filter + "Fee unpaid" tile**,
   alongside the existing Booked / Not booked tiles.
4. Fee state **loads with the roster** (every load and 15-second refresh).

## Design

### 1. Scan always records (`app/api/boarding/scan/route.ts`)

Delete the `!booked && !body.walkUp` early return. Unbooked becomes:

```
isWalkUp = !booked;  overCapacity = !booked && seatsRemaining <= 0
```

and the existing `tms_mark_attendance` call runs for every scan. `walkUp` in the
request body stays accepted (older clients) but no longer decides anything. The
response keeps `booked`, `walkUp`, `overCapacity`, `fees`, so the dialog can say
what happened. Over-capacity remains a warning, not a refusal (unchanged).

Unchanged on purpose: a scan only ever writes `present`; `p_allow_override` stays
true (a scan is physical proof); re-scans stay `noop_same_status`.

### 2. Scan dialog (`components/boarding/scan-dialog.tsx`)

- The `not_booked` branch and its "Add as walk-up" button are removed.
- `submitOffline` queues straight away with `walkUp: !local.booked` (its
  `!booked && !walkUp` confirm branch goes too).
- The success panel shows an amber line "Travelled without booking — recorded"
  when `walkUp`.
- When the fee badge tone is `overdue` or `due`, the badge renders as a full-width
  **red** warning ("Fees not paid · ₹x") instead of the small pill, directly under
  the learner's name.

`REJECT_REASON_TEXT.not_booked` stays in the protocol: marks queued by an older
build can still carry it.

### 3. Bulk fee status (new SQL + loader)

`tms_transport_fee_status_bulk(p_learner_ids uuid[])` returns one row per
learner: `learner_id, allowed, reason, overdue_count, total_owed, unpaid_amount,
term1_paid, has_bills`. It is the set-based twin of
`tms_transport_access_for_learner` — same bills/lines CTEs, same
"instalments if present, else the bill" rule, same `due_date < current_date`
overdue test — grouped by learner instead of one learner at a time.
`SECURITY DEFINER`, `search_path = public`, EXECUTE revoked from
public/anon/authenticated, granted to `service_role`.

Verification is a dry run comparing it against the single-learner RPC for a
sample of ≥200 real learners; any mismatch blocks the migration.

`lib/boarding/fee-roster.ts`:
- `loadRosterFees(svc, learnerIds): Promise<Map<string, RosterFee>>` (one RPC,
  chunked at 500 ids; a failed read returns an empty map = "unknown", never "paid").
- pure `rosterFeeBadge(fee): { state: 'paid'|'unpaid'|'none'|'unknown'; label; owed }`,
  unit-tested. Fails closed: unknown unless positively established.

### 4. Roster API + row shape

`RosterRow` gains `fee: { state; owed: number | null }`. The roster route loads
fees for the learners on the produced rows and attaches them; counts gain
`feeUnpaid`. Rows already cached offline carry the field automatically; a row
from an older cache has `fee: undefined`, which renders as "—".

### 5. Attendance page + columns

- A **Fee** column: red "Unpaid ₹x" / green "Paid" / grey "No bill" / grey "—",
  filterable (`paid` / `unpaid` / `none`).
- A **Fee unpaid** tile (red) added to both tile sets (grid becomes 6 columns).
- The CSV export gains "Fee status" and "Amount owed" columns.

### Error handling

A failed fee read leaves every row "—" and the tile at 0 rather than claiming
anyone has paid. The scan path is unaffected by fee failures (already
`allSettled`). Nothing in this change can prevent a mark being written.

### Testing

- vitest: `rosterFeeBadge` mapping (paid / overdue / due / no bill / unknown);
  roster row assembly with and without fee data.
- SQL: rolled-back dry run of the bulk function vs the single-learner RPC over
  ≥200 learners, plus a timing check.
- tsc filtered to touched files; `next build`.
- User browser smoke test: scan an unbooked learner (records at once), scan an
  unpaid learner (records, red warning), and check the Fee filter/tile.

### Known limits

- The learner notification "Travelled without a booking" is sent only by the
  manual mark path, not by scans; this change does not add one.
- Walk-up seats: an unbooked scan still subtracts from `seatsRemaining`, so
  over-capacity warnings may appear more often once every unbooked scan records.
