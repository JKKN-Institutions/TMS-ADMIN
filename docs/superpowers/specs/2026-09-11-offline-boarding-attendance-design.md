# Offline boarding attendance — design

Date: 2026-09-11
Status: approved (sections 1–3 and the written spec), revised while planning
Scope: `/boarding/attendance` roster marking and the JKKN ID card scanner

## Revisions made while writing the implementation plan

Reading the code for the plan showed five places where this spec was wrong.
Each is corrected in place below; this list is the summary.

1. **The save function needs a small SQL change.** `tms_mark_attendance` stamps
   every mark with the database's `now()` and has no way to receive a tap
   time. It gains an optional per-mark `scanned_at`; absent means `now()`, so
   every current caller is unchanged.
2. **The service worker needs a change.** The installed app starts at `/`,
   which the server redirects to the staffer's home. A navigation's redirect
   cannot be cached, so a cold start with no signal showed `offline.html`.
   The worker now remembers the last app page it served and falls back to it.
3. **Scans stay live-first.** The scan reply carries the fee position and the
   walk-up prompt, which only the server can give. Scans therefore go to the
   server directly when online and fall back to the outbox only when offline
   or when the request fails. Roster taps still always go through the outbox.
4. **The attendance window settings are saved too.** They are fetched live;
   offline the screen would silently fall back to the 07:00–09:30 default.
5. **Typed 6-digit pass codes need signal.** They are resolved by an HMAC
   over every learner on the staffer's routes, which a phone cannot compute.

## Problem

Boarding staff mark attendance on the bus, during the onward window (default
07:00–09:30 IST). Many routes lose signal on the way. Today every tap is a live
`POST /api/boarding/attendance`; with no network the tap fails and nothing is
kept. Three further things break:

1. The server judges the window and the date **at arrival**. A mark tapped at
   09:20 offline and sent at 09:40 is refused `window_closed` (409). Sent the
   next day, it would be stored under the wrong `trip_date`.
2. `app/boarding/layout.tsx` treats a failed `/api/boarding/access` fetch as
   `denied`, so an app opened with no signal shows "No route assigned".
3. Pass QR tokens are HMAC-signed with a server-only secret
   (`lib/boarding/pass.ts`), so a phone cannot verify them offline.

## Decisions (from the user)

| Question | Decision |
|---|---|
| What works offline | Manual Present/Absent and JKKN ID card scans. Pass QR and pass codes are captured raw and verified on sync. |
| Cold start | Works offline if the staffer opened Attendance once today with signal. |
| Sync deadline | Counts if tapped inside the window and received before midnight IST the same day. |
| Conflicts | First mark to reach the server wins (unchanged `decideMark`). The loser is told on their phone. |
| Architecture | Approach A: an in-app outbox, not service-worker Background Sync. |

Background Sync was rejected: it does not exist on iOS Safari, `public/sw.js`
deliberately never intercepts non-GET requests, and a background replay has no
screen to report a conflict on.

## 1. Server: judge a mark by when it was tapped

Applies to `POST /api/boarding/attendance` and `POST /api/boarding/scan`.

**Request shape.** Each mark gains two optional fields:

```ts
interface MarkInput {
  learnerId: string;
  status: 'present' | 'absent';
  tappedAt?: string;   // ISO timestamp from the phone
  clientId?: string;   // uuid generated on the phone, echoed back
}
```

A mark without `tappedAt` is treated as tapped now, so existing clients keep
working unchanged.

**Validation, in a new pure module `lib/boarding/tapped-at.ts`:**

```ts
type TapVerdict =
  | { ok: true; tripDate: string; at: Date }
  | { ok: false; reason: 'future' | 'stale' | 'outside_window' | 'invalid' };

function judgeTappedAt(
  tappedAt: string | undefined,
  now: Date,
  window: AttendanceWindow,
): TapVerdict;
```

- `invalid` — not a parseable timestamp.
- `future` — more than 2 minutes ahead of `now` (phone clock ahead).
- `stale` — its IST date is before today's IST date (arrived after midnight).
- `outside_window` — `isDirectionOpen(window, at)` is false for the tap time.
- Otherwise `tripDate` = the IST date of the tap time.

During the onward window the UTC and IST dates agree, so `tripDate` equals
what the route stores today for any online mark.

**Route changes.**
- The existing whole-request window gate (`isDirectionOpen(windows[direction])`
  at arrival) is replaced by a **per-mark** `judgeTappedAt`. Override holders
  and super admins keep their existing exemption.
- Authorization (`authDate`) and the stored `trip_date` both use the verdict's
  `tripDate`. By construction every accepted mark's `tripDate` is today in
  IST (a stale or next-day tap is rejected), so one request never mixes
  dates and needs no mixed-date check.
- A request where NO mark carries `tappedAt` keeps the old contract exactly:
  one window check at arrival, the old 409, and the UTC `trip_date`.
- `scanned_at` passed to `tms_mark_attendance` is the tap time, so the record
  shows when the learner boarded, not when the phone found signal. This needs
  the SQL change in revision 1: each element of `p_marks` may carry
  `scanned_at`, and the function uses `coalesce(scanned_at, now())`.
- Rejected marks do not fail the batch. The response lists a per-mark outcome
  keyed by `clientId`:

```ts
type MarkResult =
  | { clientId: string; outcome: 'inserted' | 'updated_own' | 'overridden' | 'noop_same_status'; walkUp: boolean }
  | { clientId: string; outcome: 'locked'; markedByName: string }
  | { clientId: string; outcome: 'rejected'; reason: MarkRejectReason; message?: string };
// MarkRejectReason = 'invalid' | 'future' | 'stale' | 'outside_window'
//   | 'not_on_route' | 'not_assigned' | 'not_your_share' | 'not_booked' | 'scan_refused'
```

**Idempotency.** No new column. `tms_mark_attendance` already returns
`noop_same_status` for a repeat of the same status on the
`(learner_id, trip_date, direction)` key, and the student is notified only on
`inserted`. A resend after a lost response is therefore harmless.

**Scan route.** `POST /api/boarding/scan` accepts the same `tappedAt` and
`clientId`, plus the raw scanned string for a queued pass QR or pass code.
Signature verification is unchanged; a forged or retired token on sync returns
`rejected` with the existing scan error text.

## 2. Phone: storage, outbox and sync

**Storage.** `lib/boarding/offline/store.ts` — a ~60-line wrapper over
IndexedDB, no new package (a new dependency touches `bun.lock`, which has
broken production builds before). Database `tms-boarding`, keyed by
`profile.id` and IST date:

| Store | Contents |
|---|---|
| `roster` | The last roster response per `(date, direction)`, plus `savedAt` |
| `outbox` | Unsent marks: `clientId`, `learnerId`, `status`, `tappedAt`, `routeId`, `source`, `raw?`, `attempts`, `lastError?` |
| `problems` | Marks the server refused, with reason and `markedByName` |
| `access` | Today's `/api/boarding/access` verdict |

Entries for another user or an earlier date are ignored on read and pruned
on app open, except unsent outbox entries, which are kept and surfaced.

**Cold start.**
- `app/boarding/layout.tsx`: if the access fetch **throws** (no network), use
  today's saved verdict. A server response of `denied` is never overridden.
  The verdict is saved whenever the server returns one.
- The roster query in `app/boarding/attendance/page.tsx` saves each successful
  response and falls back to today's saved copy on a network failure. A banner
  reads "Offline — showing the list saved at 07:42".
- Page HTML and `/_next/static` chunks are already cached by `public/sw.js`
  (network-first navigations, stale-while-revalidate assets). The one change
  (revision 2): every successful app-page navigation records its path under a
  synthetic cache key, and an offline navigation to `/` serves that cached
  page. `VERSION` is bumped so phones pick the new worker up.
- The attendance window settings are saved with the roster and used when the
  window fetch fails (revision 4).

**Roster payload for offline scans.** The roster response gains, per learner,
the active (non-retired) JKKN ID card number from `jkkn_identities`. The phone
resolves a camera-scanned card against the saved roster. `classifyScan` in
`lib/boarding/scan-resolve.ts` runs on the phone unchanged, including its
refusal of typed card numbers.

**Marking — one path, online or offline.** Every roster tap writes to the
outbox first, then applies an optimistic update to the roster cache. The
row shows a "waiting to send" clock icon; the header shows "3 marks waiting".
Online, the outbox drains within a second, so nothing looks different.

**Scanning — live first (revision 3).** Online, a scan posts to the server as
today. Offline, or when that request fails, the scan is resolved on the phone
and queued:

- JKKN ID card: resolved through the saved card map, marked with the name.
- Pass QR: the learner id inside the token is matched to the saved roster;
  the row shows "pending check" until the server verifies the signature.
- Not booked on the saved roster: the phone offers "Add as walk-up" itself,
  from the roster's `booked` flag, before queuing.
- A scan that matches no one on the saved roster: queued raw, shown as
  "unknown card, will check when online".
- Typed 6-digit pass code: refused offline with "6-digit codes need signal"
  (revision 5).

**Sync — `lib/boarding/offline/sync.ts`.**
- Triggers: `online` event, window focus, app open, and every 15 s while online.
- One sync at a time (a module-level lock), marks sent in `tappedAt` order,
  batched by `(routeId, tripDate)`, up to 25 per request.
- Outcomes:

| Server outcome | Phone action |
|---|---|
| `inserted`, `updated_own`, `noop_same_status` | Remove from outbox |
| `locked` | Remove; add to problems; row shows "Not saved — already marked by {name}" |
| `rejected` | Remove; add to problems with the reason |
| Network error or 5xx | Keep; retry with backoff 5 s, 15 s, 60 s, then every 60 s |
| 401 | Keep; stop syncing and prompt sign-in |

- After a successful batch the roster query is invalidated, as today.

**Problems list.** A panel on the attendance screen lists refused marks in
plain words ("Arrived after midnight", "Tapped outside the window", "Already
marked by Kavya"). A transport head can act on them through the existing
override path; this design does not add a new correction screen.

**Sign-out.** If the outbox is not empty, sign-out asks for confirmation:
"3 attendance marks are saved on this phone and not sent yet. They will be
sent the next time you sign in here." The outbox already syncs every 15 s
while online, so unsent marks at sign-out mean the phone is offline and a
"Send now" button could not work. Signing out keeps the entries under the
old `profile.id`, so they are never sent as the next user on a shared phone.

**Undo and "I am absent today" need signal.** Both stay live-only and show
"Needs signal" when offline, rather than failing with a network error.

## 3. Testing and rollout

**Unit tests (vitest, under `lib/`):**
- `judgeTappedAt`: every verdict, the 2-minute skew edge, the midnight IST
  edge, a tap exactly at window open and close, missing `tappedAt`.
- Sync outcome handling: each server outcome moves the entry to the right
  place; ordering by `tappedAt`; a Present then Absent pair lands in order;
  backoff schedule; the lock prevents two concurrent syncs.
- Store scoping: another user's or another day's entries are not read.
- Offline card resolution: active card resolves, retired card refused, typed
  card refused, unknown card queued.

**Route tests:** per-mark results for a mixed batch (one inserted, one locked,
one stale), and a legacy request with no `tappedAt` behaving exactly as today.

**Live verification before merge (the lesson from the 2026-08-28 incident):**
`tms_mark_attendance` changes (revision 1), so the new version is executed
against the live DB inside a self-rolling-back
`do $$ … raise exception 'TESTRESULT: %' … $$` block before it is applied, and
applied before any route that sends `scanned_at` merges.

**Browser check:** Chrome DevTools "Offline" on the attendance screen: open
with signal, go offline, mark 5 learners, reload, confirm the roster and the
5 queued marks survive, go online, confirm they send and the icons clear.
The agent's Chrome is not signed in, so the final check on a real phone on a
real route needs the user.

**Rollout.** Server change first. It is backward compatible, so it can ship
alone and be watched for a day. The phone change ships second.

## Out of scope

- Service-worker Background Sync.
- A new transport-head correction screen for refused marks.
- The return direction (attendance is onward-only).
- Fixing the UTC `today` used by the QR scanner outside the window hours.
