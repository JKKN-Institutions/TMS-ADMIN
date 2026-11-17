# Daily "Needs attention" mail to the transport heads — design

Approved in conversation on 2026-11-17.

## Intent

The admin dashboard already shows a "Needs attention" list. The transport heads
do not open the dashboard every day, so problems sit unseen. Mail them the list
once every working morning. An item that has been fixed must stop appearing, and
when nothing is left no mail is sent.

## Decided by the user

- Recipients: Surendhar M (`surendhar.m@jkkn.ac.in`) and Sekar
  (`sekar.s@jkkn.ac.in`).
- Sent at 10:00 IST, skipping Sundays and declared all-routes holidays.
- Repeats every working day while items remain (172 overdue bills today, so it
  will go daily for now). No mail on a day with nothing to report.

## Still open

- The sender mailbox. Needs an `@jkkn.ac.in` Google account with an app
  password, set in Vercel as `SMTP_USER` / `SMTP_PASS`. This blocks the first
  real send only, not the build.

## Goals

- Mail content is the dashboard's own alert list, from the same code, so the two
  can never disagree.
- At most one mail per IST day, even if the job is retried.
- A check that could not run is not "all clear": the mail still goes and names
  the check.
- Previewable and test-sendable to one address before the heads receive anything.

## Non-goals

- No settings screen for recipients or time (env vars and the cron schedule).
- No per-recipient preferences, unsubscribe, or "only what changed" mail.
- No fix for the booking-reminder cron, which looks rejected at the proxy.
- No change to what the dashboard shows.

## Anti-goals

- A silent failure. A broken query, missing credentials or SMTP error must be
  recorded in the log table and returned by the endpoint, never swallowed.
- Mailing the heads before the user has seen and approved a test mail.

## Approaches

Sending:

1. **Gmail SMTP through nodemailer (chosen).** The college is on Google
   Workspace; mail comes from a real `@jkkn.ac.in` address; free; one dependency.
2. Resend or a similar API. Needs DNS records on `jkkn.ac.in` before it can mail
   anyone but the account owner. Slower to start for no gain at 2 mails a day.
3. The shared `email_notifications` table. Ruled out: nothing drains it, about
   17,000 rows have been pending since May 2026.

Scheduling:

1. **pg_cron + pg_net calling `/api/cron/attention-digest` (chosen).** Same
   mechanism as the four TMS jobs that are verifiably running; exact time.
2. Vercel cron. The one existing Vercel job has never produced a row, so this
   path is not trusted here.

## Design (builder's calls unless marked above)

- `lib/dashboard/attention.ts` — `loadAttentionInputs(supabase, today)` returns
  `AlertInputs` plus the names of failed checks. The dashboard route calls it
  instead of its inline queries. Pure move; dashboard output unchanged.
- `lib/attention-digest/render.ts` — pure: alerts in, `{ subject, html, text }`
  out. Critical and warning rows plus the grey "could not run" row. The blue
  "open grievances" info row is left out of the mail (it duplicates the stale
  row whenever all open grievances are stale, as today). Links are absolute,
  built from `NEXT_PUBLIC_APP_URL`.
- `lib/attention-digest/mailer.ts` — nodemailer over `smtp.gmail.com:465`,
  credentials from env.
- `lib/attention-digest/run.ts` — decides and acts: skip on Sunday/holiday, skip
  if already sent today, skip if nothing to report, otherwise send and log.
- `tms_attention_digest_log` — one row per IST date (unique), with outcome,
  recipients, alert count and error. The unique date is the double-send guard.
- `app/api/cron/attention-digest/route.ts` — Bearer `CRON_SECRET`; `?dryRun=1`
  returns the rendered mail without sending or logging; `?testTo=<address>`
  sends only to that address and does not consume the day's send.
- `proxy.ts` — add the exact path to `PUBLIC_PATHS`.
- Env: `SMTP_USER`, `SMTP_PASS`, `ATTENTION_DIGEST_RECIPIENTS` (comma list),
  optional `ATTENTION_DIGEST_FROM_NAME`.
- Migration for the pg_cron job (`30 4 * * *` UTC = 10:00 IST) is committed but
  applied only after deploy and after the user approves a test mail.

## Left to the builder

Mail styling (inline CSS, table layout that survives Gmail), exact copy, and
test structure.
