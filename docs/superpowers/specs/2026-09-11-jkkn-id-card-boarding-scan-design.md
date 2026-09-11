# JKKN ID card scanning for boarding attendance

Status: approved design, not yet implemented
Date: 2026-09-11
Module: boarding staff portal, attendance

## Problem

Boarding staff mark attendance almost entirely by hand. Measured on
2026-09-11 across the whole `tms_attendance` table:

| Method | Rows |
| --- | --- |
| `manual` | 16,790 |
| `qr_scan` | 530 |

Scanning accounts for 3% of marks. The cause is structural rather than a
user-interface problem. The only scannable credential today is the
boarding pass at `/student/pass`, and a learner sees it only if all three
of the following hold:

1. they log in to the student portal;
2. they have a `tms_booking` row for that exact travel date, because
   `/api/student/boarding-pass` returns `hasPass: false` with
   `reason: 'not_booked'` otherwise;
3. they are not locked out by the fail-closed transport fee gate in
   `tms_student_transport_access`.

The learners a staffer most needs to identify at the door are precisely
the ones whose phone will not show a pass. Meanwhile every learner already
carries a printed JKKN ID card whose QR code needs none of those three
conditions.

## What the JKKN ID card carries

Traced in the sibling repository at `D:/Sangeetha_V/MyJKKN`.

- The card QR payload is the bare permanent JKKN ID string, for example
  `348295-7`. It is not a URL, not JSON, and not signed. See
  `components/identity/jkkn-qr-dialog.tsx` and `pickQrValue` in
  `lib/id-cards/render-data.ts`.
- Format is six digits, a dash, then a Damm check digit.
- MyJKKN also offers the same QR as a downloadable PNG, so the payload
  must be treated as public.

The register is the `jkkn_identities` table, which lives in the SAME
Supabase project this app already uses. No cross-application HTTP call is
required; a direct table read resolves a card to a learner.

Relevant columns: `jkkn_id char(8)`, `person_kind text`,
`learner_profile_id uuid`, `team_member_id uuid`, `profile_id uuid`,
`retired_at timestamptz`.

## Measured coverage and data quality (2026-09-11)

| Check | Result |
| --- | --- |
| Learners with `transport_route_id` set | 1,908 |
| Of those, holding an active JKKN ID | 1,839 |
| Learners on a bus with no JKKN ID | 69 |
| Learners holding two active identities | 0 |
| Duplicate active `jkkn_id` values | 0 |
| Values not matching six digits, dash, one digit | 0 |
| Values carrying char(8) padding whitespace | 0 |
| Active `team_member` identities | 733 |

Coverage is 96.4%. The 69 uncovered learners are why the card cannot be
the only credential.

Lookup performance needs no new index: `jkkn_identities_jkkn_id_key` is
already a unique btree on `jkkn_id`.

## Decisions taken

Three forks were put to the product owner and answered.

1. **Spoofing.** A JKKN ID is a public printed number, so the
   cryptographic guarantee of the signed pass is genuinely lost. Decision:
   accept card QR codes from the CAMERA ONLY, and refuse a hand-typed
   JKKN ID. This is a meaningful guardrail rather than theatre, because
   the scan request is made by the staffer's own authenticated browser.
   A learner has no session and cannot forge the source flag; the only
   person who could is the staffer, who can already mark anyone manually.
2. **Fees pending.** Warn loudly, still write the mark. The bus has
   already stopped and the learner is already boarding, so refusing the
   mark loses the attendance record without preventing the ride.
3. **Fee lookup for learners with no login account.** Split the live
   `tms_student_transport_access` function into a learner-keyed core plus
   a thin account-keyed wrapper, rather than duplicating the money logic.

## Design

### 1. Accepted scan shapes

Resolved in this order by the new pure module:

| Shape | Example | Source allowed | Resolution |
| --- | --- | --- | --- |
| Signed boarding pass | uuid, dot, hmac | camera or typed | `verifyPass`, unchanged |
| JKKN ID | `348295-7` | camera only | `jkkn_identities` where `retired_at is null` |
| Daily six-digit code | `429173` | typed only | `matchPassCode`, unchanged |

A JKKN ID submitted from the manual box is refused with a message telling
the staffer to point the camera at the card.

Normalisation rules, copied from MyJKKN rather than imported:

- strip carriage return and newline, which both barcode wedges and camera
  decoders append;
- trim surrounding whitespace;
- accept seven bare digits by inserting the dash, so a hand-read
  `3482957` still classifies. It will then be refused for being typed,
  but it must be refused for the RIGHT reason.

The copy is deliberate. TMS-ADMIN and MyJKKN are separate deployments,
and a change in one must never silently alter who a bus door refuses.
The `mess-scan-resolver.ts` module in MyJKKN carries the same note for
the same reason.

### 2. New module: `lib/boarding/scan-resolve.ts`

Pure. No database client, no React, no Next imports, so it is directly
unit testable.

```ts
export type ScannedShape = 'pass' | 'jkkn_id' | 'pass_code' | 'unknown';
export type ScanSource = 'camera' | 'typed';

export interface ScanDecision {
  shape: ScannedShape;
  /** The cleaned value the server should look up. */
  code: string;
  /** When set, the scan is refused without any database read. */
  refusal: 'typed_jkkn_id' | 'unrecognised' | null;
}

export function classifyScan(raw: string, source: ScanSource): ScanDecision;
```

`classifyScan` performs no input or output and never decides authority.
The endpoint keeps every existing gate.

### 3. Endpoint changes: `app/api/boarding/scan/route.ts`

The request body gains one field:

```ts
{ token: string; direction?: 'onward'; walkUp?: boolean; source: 'camera' | 'typed' }
```

`source` is optional in the schema and defaults to `typed` when absent.
That default is the safe one because it can only narrow what is accepted,
and it means an older client that has not been updated degrades to
today's behaviour rather than accidentally accepting cards.

`resolveLearnerId` is extended with a JKKN ID branch placed BEFORE the
six-digit branch. It resolves through `jkkn_identities` filtered on
`retired_at is null`, and it returns the learner together with how the
match was made, so the response can tell the staffer which credential was
used.

Refusals that must be distinct and human readable:

| Situation | Message |
| --- | --- |
| Typed JKKN ID | Point the camera at the card to use a JKKN ID. |
| ID not in the register | Card not recognised. |
| Identity is retired | This card has been retired. Issue a new one. |
| Identity is a team member, not a learner | That is a staff card. Attendance is for learners. |
| Learner has no allocated route | unchanged, existing message |
| Staffer not assigned to the route | unchanged, existing message |

Every gate that exists today is retained and runs unchanged after
resolution: the `tms.attendance.scan` permission check, the route
assignment check, the 07:00 to 09:30 IST window, the booking and walk-up
flow, and the atomic write through `tms_mark_attendance` with
`p_allow_override` true.

The success response is widened to carry what the panel needs:

```ts
{
  ok: true,
  matchedBy: 'pass' | 'jkkn_id' | 'pass_code',
  learner: { name, rollNumber, photoUrl, routeLabel, stopLabel },
  booked: boolean,
  walkUp: boolean,
  overCapacity?: boolean,
  alreadyMarked?: { by, at },
  overrode?: { from, by, at },
  fees: { overdueCount: number, totalOwed: number, terms: Array<unknown> } | null
}
```

`fees` is null when the fee read fails. The panel then shows that fee
status is unavailable rather than an implied zero. Never render an
unmeasured figure as a number.

`logActivity` gains `matchedBy` in its metadata so card scans are
auditable after the fact.

### 4. Result panel: `components/boarding/scan-dialog.tsx`

One panel replaces today's two-line result.

- Identity: photo from `learners_profiles.student_photo_url`, name, roll
  number, and a small badge naming the credential used. The photo is
  shown, not gated on. It gives free visual confirmation without adding
  the extra tap the product owner declined.
- Route and stop, with a loud warning when the learner is not on the
  scanning staffer's route.
- Booking state: booked today, or not booked with the existing walk-up
  button and seat count.
- Fees: a red banner when the overdue count is above zero, naming the
  amount and the overdue terms. The mark is still written.
- Prior mark: already present and by whom, or corrected from absent.

The manual entry box keeps its six-digit behaviour and now also rejects a
typed JKKN ID on the client, so the staffer gets instant feedback rather
than a round trip. The server refusal remains the authority.

### 5. Migration A: allow a third attendance method

`tms_attendance_method_check` currently permits only `qr_scan` and
`manual`. Card scans must be distinguishable from pass scans in every
report, so the constraint is widened to include `id_card`.

The scan endpoint then passes `p_method` as `id_card` for a JKKN ID match
and `qr_scan` for a signed pass, leaving `manual` to the marking tool.

Existing rows are untouched. Any report or type union that enumerates
methods must be extended in the same change, including
`lib/booking/analytics-attendance.ts` and the boarding roster columns.

### 6. Migration B: split the transport access function

The live `tms_student_transport_access(p_profile_id uuid)` performs two
separable jobs. Everything from the `bus_required` check onward depends
only on the resolved learner id, which makes the split mechanical.

After the migration:

- `tms_transport_access_for_learner(p_learner_id uuid) returns jsonb`
  holds the bus-required early return, the current transport year lookup,
  the bills and lines CTEs, the tied first line rule, and the final
  allowed and reason decision. Same return shape as today.
- `tms_student_transport_access(p_profile_id uuid) returns jsonb` keeps
  its three identity paths, which are the direct `profile_id` link biased
  toward the row carrying the obligation, then the lowercased
  `college_email` fallback, then `student_email`. It then delegates to
  the learner function.

Name, arguments, return shape, `SECURITY DEFINER`, and `search_path` of
the existing function are all preserved, so the portal gate, `proxy.ts`,
and `/api/student/transport-access` need no change.

Hard requirement on the author: dump the LIVE definition with
`pg_get_functiondef` and rebase onto that. Do not copy from a migration
file in the repository. A stale copy of this exact function has
previously come close to deleting a colleague's email-fallback fix.

Grants must be re-applied after `CREATE OR REPLACE`. A revoked EXECUTE
grant on a boarding function has already caused a silent multi-week
lockout once, so the plan verifies with `has_function_privilege` rather
than assuming.

### 7. Why 633 learners made this necessary

Of the 1,908 learners allocated to a bus, 633 have `profile_id` null.
Calling the account-keyed function for a scanned learner would return a
blank fee panel for one rider in three, which is worse than showing
nothing at all because a blank panel reads as nothing owed.

## Testing

Unit tests, colocated under `lib/` so vitest resolves the `@/` alias:

- `lib/boarding/scan-resolve.test.ts` covers every shape, both sources,
  the newline and whitespace stripping, seven bare digits, the typed
  JKKN ID refusal, and an unrecognised string.

Integration and database checks:

- A parity check runs `tms_student_transport_access` before and after the
  split for a sample of real learners spanning all three identity paths,
  including at least one learner reached only by the email fallback, and
  asserts identical JSON. This is what proves portal access did not
  change.
- Every new database function is EXECUTED once against the real project
  before merge. A previous attendance change parsed cleanly and still
  failed on its first real call, so a passing TypeScript parity test is
  not sufficient evidence.
- A scan of a retired identity, a team member card, and a learner with no
  route each return their own distinct message.

Browser smoke test on the boarding portal, which requires the product
owner's authenticated session because this agent's browser is not logged
in: scan a real printed card, confirm the panel, confirm the roster
refreshes, and confirm a typed JKKN ID is refused.

## Out of scope

- No new scanner library. `html5-qrcode` already ships in this app and is
  the same decoder family MyJKKN uses for these codes. A previously noted
  swap to a different package is not present in this working tree and is
  not part of this work.
- No offline queue or background sync.
- No staff attendance. A team member card is recognised only so it can be
  refused with a clear message.
- No change for the 69 learners without a JKKN ID. They keep the signed
  pass and the six-digit daily code.
- No change to the fee gate's behaviour. The split is a refactor, not a
  policy change.
- No new tables.

## Risks

| Risk | Mitigation |
| --- | --- |
| A public number becomes an attendance credential | Camera-only acceptance; method recorded as `id_card` so abuse is auditable; photo shown on every scan |
| The function split changes who the portal locks out | Identical-output parity check across all three identity paths before merge |
| Print quality defeats the camera | The six-digit code and the marking tool both remain available |
| A leaver's card still scans | Out of scope here, but noted: `lifecycle_status` is available on the learner row if a future lane wants the gate the MyJKKN mess door applies |
