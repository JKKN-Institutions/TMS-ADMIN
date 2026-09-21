# 48-hour transport fee payment timer — design

Date: 2026-09-21 · Status: approved in chat, pending spec review

Supersedes the earlier same-day "reminder only" version of this spec (commit
7376afc). The user chose automatic Transport Fee raising over reminder-only.

## Goal

Every learner whose Term 1 Transport Maintenance Fee is unpaid gets a personal
48-hour countdown, shown on every learner portal page. If it is still unpaid
when the countdown reaches zero, a **Transport Fee** (the fine category, see
`project_transport_fee_category_split`) equal to the learner's route charge is
raised automatically, **on top of** the maintenance fee.

## Decisions (made with the user)

| Question | Decision |
|---|---|
| When does the 48h start? | At go-live (the moment an admin switches the feature on) for everyone unpaid then; for bills created later, at bill creation. `expires_at = max(enabled_at, bill.created_at) + 48h` |
| What happens to the maintenance bill at expiry? | Kept. The Transport Fee is added on top — no cancellation (`fn_cancel_student_bill` cannot be called by a cron anyway) |
| What counts as "paid"? | Term 1 cleared, by the existing `term1PaidLearnerIds()` rule (instalment 1 settled, or whole bill paid when it has no instalments) — the same rule as the portal access gate |
| Concessions? | Learners with any `tms_fee_override` row for the year are excluded (no timer, no auto-fine). Admins may still fine them manually |
| Fine amount | The route charge from `tms_fine_stop_rate` (every stop = its route's final-stop amount) |
| Fine due date | Expiry date + `fine_due_days` (default 7) |
| How often? | At most one auto-fine per learner per transport year |
| Notifications | On timer start; reminder ~6h before expiry; when the fine is raised; plus a banner on every portal page |
| Staff | Out of scope |

## Facts this design rests on (measured 2026-09-21)

- All 2026-27 learner maintenance due dates (31 Jul, 31 Aug) have passed. A
  timer anchored to bill creation or due date would fine every unpaid learner at
  launch — hence the go-live anchor.
- About **450** learners owe. Only **189** are reachable via
  `learners_profiles.profile_id`; **206** only via college/student email (the
  fallback `tms_student_transport_access` uses); **55** have no portal account.
  The existing `notifyLearner()` resolves by `profile_id` only and would
  silently skip the 206 — this feature must use the email fallback.
- Owing learners are locked out and confined to `/student/fees`.
- `tms_push_subscription` has 0 rows; in-app notifications are the real channel.
- No 48h/grace/fine automation exists in code or DB today (checked cron.job,
  public functions, and `lib/fines` callers — fines are created only by the
  admin Fines dialog via `createFines()`).

## Data

### New table `public.tms_fee_payment_notice`

One row per learner per transport year.

| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| person_id | uuid not null | `learners_profiles.id` |
| transport_year_id | uuid not null | fk → `tms_transport_year(id)` |
| source_bill_id | uuid null | the Term 1 `tms_fee_bill` row that triggered it |
| started_at | timestamptz not null | |
| expires_at | timestamptz not null | |
| reminder_sent_at | timestamptz null | set once; reminder is never re-sent |
| status | text not null | check in (`running`, `paid`, `fined`, `cancelled`) |
| fine_id | uuid null | fk → `tms_fee_fine(id)`; set when `fined` |
| created_at / updated_at | timestamptz not null | default `now()` |

- Unique `(person_id, transport_year_id)` — enforces "at most one notice, hence
  one auto-fine, per learner per year" even under overlapping sweeps.
- Index on `(status, expires_at)` for the sweep.
- RLS enabled, no policies: service role only, matching the other `tms_` fee tables.

### Setting

`admin_settings` row, `setting_type = 'fee_payment_notice'`:

```json
{ "enabled": false, "window_hours": 48, "reminder_hours_before": 6,
  "fine_due_days": 7, "enabled_at": null }
```

- Turning **on** stamps `enabled_at = now()` — this is go-live.
- Turning **off** halts the sweep entirely. Running notices are left as they are.
  Turning back **on** stamps a new `enabled_at`, and every `running` notice gets
  `expires_at = new enabled_at + window_hours` (and `reminder_sent_at` cleared),
  so no learner is fined for time that passed while the feature was paused.
- Edited in Settings → Fees; gated by `tms.settings.manage`; logged to the
  Activity Log (module `settings`, action `update`).

## The sweep

`GET /api/cron/fee-payment-notices` — the same shape as
`app/api/cron/auto-generate-bills/route.ts`:

- `Authorization: Bearer $CRON_SECRET`; path added to the proxy's exact-path
  cron allowlist.
- `?dryRun=1` computes and reports, writes nothing.
- Scheduled by pg_cron every 5 minutes via `net.http_get` using the
  `tms_app_url` vault secret (same as job `tms-auto-generate-bills`).
- Logic lives in `lib/fees/payment-notice/sweep.ts`; the route is a thin shell.

Each run, only if `enabled`, in this order:

1. **Close paid.** `paid = term1PaidLearnerIds(currentYear)`. Every `running`
   notice whose person is in `paid` → `status = 'paid'`.
2. **Open new.** Candidates = learners with a live (`status = 'generated'`)
   Term 1 `tms_fee_bill` in the current year, not in `paid`, with no
   `tms_fee_override` row for the year, with a positive `tms_fine_stop_rate` for
   their stop, and with no notice this year. Insert `running` with
   `started_at = now()`, `expires_at = max(enabled_at, bill.created_at) + window`.
   Conflict on the unique key is ignored. Notify each (see Notifications).
3. **Remind.** `running`, `reminder_sent_at is null`,
   `expires_at - now() <= reminder_hours_before` → send reminder, stamp
   `reminder_sent_at`.
4. **Fine.** `running` and `expires_at <= now()`. For each, re-check against
   the step-1 `paid` set and the override table, then call the existing
   `createFines()` with:
   - `personIds: [person_id]`, `transportYearId: currentYear`
   - `reason: 'Transport Maintenance Fee unpaid 48 hours after notice'`
   - `dueDate: expiry date (IST) + fine_due_days`
   - `idempotencyKey: 'payment-notice:<notice id>'` (per-person suffix is added
     by `createFines`)
   - `actorId: null`, `notify: true`,
     `sourceBillByPerson: { [person_id]: source_bill_id }`
   Then read the fine back by idempotency key and set `status = 'fined'`,
   `fine_id`. `created` or `duplicates` both count as success.

### Failure handling

- If `createFines` **skips** the learner (e.g. stop rate removed since the
  notice opened), the notice stays `running`, the skip is logged, and it is
  retried each sweep. A notice never becomes `fined` without a real fine row.
- One learner's error is counted and the sweep continues.
- Every chunked `.in()` uses ≤150 ids and checks `error` (gateway limit).
- The route returns `{ opened, paid, reminded, fined, skipped, errors, dryRun }`.
- Each auto-fine is written to the Activity Log as a system action, module
  `fees` (existing union member — no union change).

## Notifications

- Resolve recipients the way `tms_student_transport_access` does: `profile_id`,
  then lower-cased college/student email → `profiles.id`. Implemented as a
  batch resolver `resolveLearnerProfileIds(svc, learnerIds)` in
  `lib/notifications/`, used for all three messages below. `createFines()`'s
  own `notifyLearner()` call is switched to the same resolver so the fine
  notice also reaches the 206 email-only learners.
- Timer start: "Pay your Transport Maintenance Fee by <date, time IST> or a
  Transport Fee of ₹X will be added." — url `/student/fees`, category `fees`.
- Reminder: "About 6 hours left to pay your Transport Maintenance Fee before a
  Transport Fee of ₹X is added."
- Fine raised: the existing `createFines()` message.
- All best-effort: a notification failure never blocks a state change or a fine.

## Learner portal

### Data

`GET /api/student/transport-access` — already fetched by the learner layout,
exempt from the payment gate, shared under one query key by the layout,
dashboard and fees page — gains two fields, added in the route handler (the
shared RPC is **not** modified):

```ts
payment_notice: { status: 'running' | 'fined'; expires_at: string; amount: number } | null
server_now: string
```

- Resolves the learner the same way the RPC does, reads their notice for the
  current transport year. `paid` / `cancelled` / none → `null`.
- `amount`: the fine amount (`fined`) or route charge (`running`).

### `PaymentNoticeBar`

Mounted in `app/student/layout.tsx` directly above `content-body`, so it shows
on every learner page including `/student/fees`.

| state | when | shows |
|---|---|---|
| `running` | > 6h left | amber: "Pay your Transport Maintenance Fee within HH:MM:SS, or a Transport Fee of ₹X will be added." + **Pay now** → `/student/fees` |
| `urgent` | ≤ 6h left | same, red |
| `processing` | ≤ 0, still `running` | "Time's up — Transport Fee being added…" |
| `fined` | status `fined` | red: "A Transport Fee of ₹X has been added because the maintenance fee wasn't paid in time." + link |
| `hidden` | `null` | nothing |

`/student/fees` also renders a larger card variant of the same component (full
deadline date/time, time left, both amounts).

Tailwind v4 tinted alerts need explicit `dark:` variants; strip uses
`min-w-0` / `flex-wrap` for phone widths.

### Timer correctness

- The server is the clock: `offset = server_now − Date.now()` captured on each
  response; `remaining = expires_at − (Date.now() + offset)`.
- Recomputed from absolute time every second — no decrementing counter, so a
  backgrounded tab is correct as soon as it is shown again.
- While a notice is `running` the access query refetches every 60s and on window
  focus, so a payment clears the bar within a minute.
- Display `HH:MM:SS` (max 48:00:00), clamped at 0.
- The browser clock decides only what the bar **displays**; the sweep alone
  decides when a fine is raised, from the stored `expires_at`.

## Admin

- Settings → Fees: the switch plus `window_hours`, `reminder_hours_before`,
  `fine_due_days`. The switch shows `enabled_at` when on.
- Bill Management: a read-only "Payment notices" view — running (time left),
  paid, fined — for the selected transport year. `tms.fees.view`.
- No manual start/extend/cancel in this version.

## Out of scope

Staff; cancelling or replacing the maintenance bill; SMS/WhatsApp; locking
changes; the 05:30 IST lock-timing issue; re-noticing a learner after a fine.

## Testing

- Unit (vitest): `computeExpiry` incl. the re-enable reset; sweep step ordering
  (paid-just-before-expiry is never fined); exclusions (override, no stop rate);
  idempotent re-run creates nothing; skipped fine keeps notice `running`; bar
  state selector; `HH:MM:SS` formatting; clock-offset maths; recipient resolver
  (profile_id, email fallback, no account).
- Sweep tests use a fake Supabase client, matching `lib/fees/generate.test.ts`.
- DB: migration applied; unique key verified by a second insert.
- Live `?dryRun=1` against production before switching on — expect ~450 to open.
- Build + `tsc` filtered to touched files (repo baseline is red).
- Manual in the user's browser (auth-gated): switch on → learner sees bar →
  pay → bar clears; a test learner left unpaid is fined at expiry.
