# Daily "Needs attention" mail — runbook

Every working day at 10:00 am IST the transport heads get one mail listing what
the admin dashboard's **Needs attention** panel shows. Fixed items drop off the
next mail. No mail goes out on a Sunday, a declared holiday, or a day with
nothing to report.

Code: `lib/attention-digest/`, `app/api/cron/attention-digest/route.ts`.

## Settings (Vercel environment variables)

| Name | Value |
|------|-------|
| `SMTP_USER` | The `@jkkn.ac.in` mailbox the mail is sent from |
| `SMTP_PASS` | A Google **app password** for that mailbox (not its normal password) |
| `ATTENTION_DIGEST_RECIPIENTS` | Comma-separated addresses of the people who receive it |
| `ATTENTION_DIGEST_FROM_NAME` | Optional. Defaults to `JKKN Transport` |
| `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` | Already set; used for links and for the job's secret |

Redeploy after changing any of them.

### Getting an app password

1. Sign in to the sender mailbox at <https://myaccount.google.com>.
2. Security, then turn on **2-Step Verification** if it is off.
3. Open <https://myaccount.google.com/apppasswords>, name it `TMS`, and copy the
   16-character password into `SMTP_PASS`.

If the App passwords page is missing, the Workspace administrator has disabled
it for the domain and must allow it.

## Checking it by hand

Replace `<app>` with the deployed URL and `<secret>` with `CRON_SECRET`.

```bash
# Preview: returns the subject, HTML and text. Sends nothing, records nothing.
curl -H "Authorization: Bearer <secret>" "<app>/api/cron/attention-digest?dryRun=1"

# Test: sends today's mail to ONE address, subject prefixed [TEST].
curl -H "Authorization: Bearer <secret>" "<app>/api/cron/attention-digest?testTo=you@jkkn.ac.in"
```

## Did today's mail go?

```sql
select * from tms_attention_digest_log order by digest_date desc limit 14;
```

| outcome | meaning |
|---------|---------|
| `sent` | Mailed to the addresses in `recipients` |
| `skipped_clear` | Nothing needed attention |
| `skipped_off_day` | Sunday or declared holiday |
| `failed` | See `error` (missing setting, wrong password). The next run retries |
| `sending` | The job stopped mid-send, so the mail may or may not have gone. Blocks that day. Ask a recipient before deleting the row to retry, or a second copy may be sent |

## Turning it off and on

```sql
select cron.unschedule('tms-attention-digest');   -- off
-- on: re-run supabase/migrations/20261117100100_schedule_attention_digest.sql
```

A mistyped check URL (for example `dryRun=true`) is refused with an error; it never sends.
