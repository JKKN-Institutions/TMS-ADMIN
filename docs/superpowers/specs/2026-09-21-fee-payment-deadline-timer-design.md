# 48-hour transport fee payment timer — design

Date: 2026-09-21 · Status: approved in chat, pending plan confirmation

## Goal

An admin starts a 48-hour payment window for a transport year. Every learner
who still owes transport maintenance fees for that year sees a live countdown on
every page of the learner portal, and receives an in-app notification the moment
the window starts. At zero the timer turns into a "time is up" message.
**Nothing is locked, charged or changed automatically** — any follow-up is a
manual admin decision.

## Decisions (made with the user)

| Question | Decision |
|---|---|
| What does it count to? | An admin-started window: deadline = start + exactly 48 hours |
| What happens at zero? | Reminder only. Optional admin message shown under the timer |
| Who sees it? | Learners with an outstanding balance on a live transport bill in that year |
| Where? | One bar in the learner portal layout → appears on every learner page |
| How do learners notice? | The bar, plus one urgent in-app notification when the window starts |

## Facts this design rests on (measured 2026-09-21)

- All 2026-27 due dates (31 Jul, 31 Aug) have passed; **0** owing learners have a
  due date still ahead, and the learners who owe are already locked out and
  confined to `/student/fees`. A countdown to existing due dates would show
  nothing, which is why the deadline is admin-started.
- `tms_push_subscription` has **0** rows. Web push is built but reaches nobody.
- **450** learners owe. Only **189** are reachable by `learners_profiles.profile_id`;
  **206** more only by college/student email (the same fallback the access RPC
  `tms_student_transport_access` uses); **55** have no portal account at all.
  Targeting by `profile_id` alone would silently skip 206 learners.
- The DB runs in UTC; the existing overdue lock flips at 05:30 IST. This feature
  stores an absolute `timestamptz`, so it is unaffected. The lock timing is a
  separate, known issue and out of scope.

## Data

New table `public.tms_fee_payment_deadline`:

| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| transport_year_id | uuid not null | fk → `tms_transport_year(id)` on delete cascade |
| starts_at | timestamptz not null | default `now()` |
| ends_at | timestamptz not null | check `ends_at = starts_at + interval '48 hours'` |
| message | text null | check `char_length(message) <= 160` |
| is_active | boolean not null | default true |
| notified_count | integer not null | default 0 |
| created_by | uuid null | the admin |
| created_at | timestamptz not null | default `now()` |
| stopped_at / stopped_by | timestamptz / uuid null | set on Stop or when superseded |

- Partial unique index on `(transport_year_id) where is_active` — at most one
  active window per year, enforced by the database even under concurrent starts.
- RLS enabled, no policies: service role only, matching the other `tms_` tables.
- Expiry does NOT flip `is_active`; "expired" is derived from `ends_at` at read time.

## Admin

Location: Bill Management header, beside the transport-year selector.

- **Idle:** "Start 48-hour deadline" button. Disabled when "All years" is selected
  or the admin lacks `tms.fees.edit`.
- **Dialog:** shows the computed end time, an optional message (≤160 chars), and the
  audience: "Notifies N learners who still owe · M have no portal account".
- **Running:** live countdown, end time, and a Stop button.
- Starting while one is active supersedes it: the old row gets
  `is_active=false, stopped_at, stopped_by`, then the new row is inserted.

API `app/api/admin/fees/payment-deadline/route.ts` (withAuth + service role):

| verb | perm | does |
|---|---|---|
| GET `?yearId=` | `tms.fees.view` | active window for the year (or null) + audience counts |
| POST `{ yearId, message? }` | `tms.fees.edit` | supersede, insert, notify, log |
| DELETE `?yearId=` | `tms.fees.edit` | stop the active window, log |

Activity log: module `fees`; action `create` on start, `cancel` on stop (both
already in the closed unions — no union change).

## Learner

- `GET /api/student/transport-access` (already exempt from the payment gate and
  already shared by the dashboard and fees page under one query key) gains two
  fields: `payment_deadline: { ends_at, message } | null` and `server_now`.
  `payment_deadline` is non-null only when the learner owes (sum of term balances
  > 0) and the active window for the RPC's own `transport_year_id` (the learner's
  current transport year) has `ends_at > now() - 24h`. A window started on a
  non-current year is therefore visible to admins only.
  **The shared RPC is not modified**; the route handler adds the fields.
- `PaymentDeadlineBar` mounted in `app/student/layout.tsx` directly above
  `content-body`, so every learner page — including `/student/fees`, the only page
  a locked learner can reach — shows it.
- States: `running` amber (> 12h left), `urgent` red (≤ 12h), `expired`
  ("Time is up — pay at the transport office today") for 24h after `ends_at`,
  then `hidden`.
- Link: "View fee details" → `/student/fees`.

## Timer correctness

- The server is the clock: `offset = server_now − Date.now()` captured when the
  response arrives; remaining = `ends_at − (Date.now() + offset)`.
- Recomputed from absolute time every second — no decrementing counter, so a
  backgrounded tab is correct the moment it is shown again.
- While a window is active the access query refetches every 60s and on window
  focus, so a payment recorded at the office clears the bar.
- Display format `HH:MM:SS` (max 48:00:00); clamps at 0.

## Notification

On start, one `dispatchNotification` with targeting `{ type: 'users', user_ids }`,
priority `urgent`, url `/student/fees`, `expiresAt = ends_at`,
`idempotencyKey = 'fee-deadline:<id>'`. Audience = profile ids of owing learners
resolved via `profile_id`, then college/student email (lower-cased both sides).
Web push rides the same dispatch for any subscriber.

## Out of scope

Staff; fines; automatic locking; SMS/WhatsApp; staged 7d/3d/1d reminders; the
05:30 IST lock-timing fix.

## Testing

- Unit (vitest): state selector, `HH:MM:SS` formatting, clock-offset maths, POST
  body validation, learner-payload shaping (owes vs paid; expired window).
- DB: migration applied; constraint and partial unique index verified by
  attempting a second active insert.
- Build + `tsc` filtered to touched files (repo baseline is red).
- Manual in the user's browser (auth-gated): start → learner sees bar → stop.
