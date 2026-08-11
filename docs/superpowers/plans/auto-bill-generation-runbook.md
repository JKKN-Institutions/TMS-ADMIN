# Automatic transport bill generation — runbook

**Status as of 2026-08-11: BUILT, NOT LIVE.** Nothing bills automatically.
Branch `feat/auto-bill-on-onboarding` (13 commits, `4c38a80..abfaff2`) is unmerged
and unpushed.

- Spec: `docs/superpowers/specs/2026-08-11-auto-bill-generation-on-onboarding-design.md`
- Plan: `docs/superpowers/plans/2026-08-11-auto-bill-generation-on-onboarding.md`
- Production app: `https://tms.jkkn.ai`
- Database: `kvizhngldtiuufknvehv`

## What it does

Every 15 minutes, a pg_cron job calls `/api/cron/auto-generate-bills`, which runs
the existing bill-generation engine over each fee structure flagged
`auto_generate = true` in the current transport year, billing anyone applicable
and not yet billed.

It replaces a manual treadmill: 30 hand-clicked generation runs in the 21 days to
2026-08-11, eight on one day, one of which billed 1 student while skipping 855.

**It is convergent, not event-driven.** A student becomes billable when
`learners_profiles.bus_required` flips true — and that column is written by
MyJKKN, a different application on the same database. TMS-ADMIN never writes it,
so there is no event to hook. The sweep instead re-derives who should be billed.
A missed run costs latency, never correctness.

## Why it cannot double-bill

`tms_fee_bill_idem_unique (fee_structure_id, person_id, term_no, transport_year_id)`
is a database constraint. Two concurrent runs physically cannot bill the same
person for the same term twice. Everything else below is defence in depth.

## The five safety rails

| # | Rail | Where |
|---|---|---|
| 1 | Idempotency constraint | `tms_fee_bill_idem_unique` (database) |
| 2 | Global kill switch `autoGenerateBills`, default **off** | Settings → Scheduling |
| 3 | Per-structure `auto_generate` flag | Fees → edit structure → Automation |
| 4 | Conflict skip — never bills someone another structure already billed | `lib/fees/auto-generate.ts` (`skipConflicts: true`) |
| 5 | Fail-loud override loading — a failed read errors rather than billing full price | `lib/fees/generate.ts` |

---

# Go-live sequence

**Do these in order.** Steps 1–2 are prerequisites the original plan did not
account for: the endpoint does not exist in production until the branch ships.

## Step 1 — Merge and deploy

Until this is done, `https://tms.jkkn.ai/api/cron/auto-generate-bills` returns 401
from the proxy because neither the route nor its allowlist entry is deployed.

Verify after deploying — this must still be 401, but now from the *route*:

```bash
curl -si "https://tms.jkkn.ai/api/cron/auto-generate-bills" | head -1
```

## Step 2 — Create `CRON_SECRET`

Generate a value, then set it in **both** places or the endpoint will reject the
cron:

1. Vercel → TMS-ADMIN → Settings → Environment Variables → add `CRON_SECRET`
   (Production). **Redeploy afterwards** — env changes do not apply to a running
   deployment.
2. The database vault:

```sql
select vault.create_secret('<the CRON_SECRET value>', 'tms_cron_secret',
                           'Bearer token for TMS-ADMIN /api/cron endpoints');
select vault.create_secret('https://tms.jkkn.ai', 'tms_app_url',
                           'TMS-ADMIN deployed base URL');
```

## Step 3 — Prove the path with the switch still OFF

This is the safety gate. It exercises pg_cron → pg_net → proxy → route → sweep
while the master switch is off, so it writes nothing.

```sql
select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
         || '/api/cron/auto-generate-bills?dryRun=1',
  headers := jsonb_build_object(
    'Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret'))
);
```

Wait a few seconds, then:

```sql
select status_code, content::text
from net._http_response order by created desc limit 1;
```

| Result | Meaning |
|---|---|
| `200` + body containing `"skipped":"disabled"` | **Correct.** Whole path works, nothing written. Proceed. |
| `401` | Secret mismatch between Vercel and vault, or the redeploy was skipped |
| `404` | Step 1 not complete — the endpoint is not deployed |

## Step 4 — Turn the switch on, dry-run again

Settings → Scheduling → tick **Automatic Bill Generation** → Save.

Re-run the Step 3 call. `skipped` should now be absent and `structures` should
list three entries. Cross-check the projected total against reality:

```sql
with cur as (select id from tms_transport_year where is_current limit 1),
cohort as (
  select lp.id from learners_profiles lp
  where lp.bus_required is true and lp.lifecycle_status = 'active'
)
select count(*) as unbilled
from cohort c
where not exists (
  select 1 from tms_fee_bill fb, cur
  where fb.person_id = c.id and fb.transport_year_id = cur.id
);
```

The dry run's total `billed` should be roughly `unbilled × terms per structure`.
**If it wants to bill far more than that, stop and investigate — do not schedule.**

## Step 5 — Schedule it

```sql
select cron.schedule(
  'tms-auto-generate-bills',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tms_app_url')
           || '/api/cron/auto-generate-bills',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tms_cron_secret'))
  );
  $$
);
```

## Step 6 — Verify the first live runs (after ~20 minutes)

```sql
-- The job is firing
select jobid, status, start_time, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'tms-auto-generate-bills')
order by start_time desc limit 5;

-- The endpoint is answering
select status_code, created from net._http_response order by created desc limit 5;

-- Automated runs (triggered_by IS NULL distinguishes them from hand-clicked ones)
select r.triggered_at, f.name, r.learner_billed_count, r.notes
from tms_fee_generation_run r join tms_fee_structure f on f.id = r.fee_structure_id
where r.triggered_by is null and r.triggered_at > now() - interval '1 day'
order by r.triggered_at desc;

-- RECONCILIATION INVARIANT: Billed == Collected + Pending
select
  sum(b.final_amount) filter (where b.status <> 'cancelled')                    as billed,
  sum(b.final_amount - b.balance_amount) filter (where b.status <> 'cancelled') as collected,
  sum(b.balance_amount) filter (where b.status <> 'cancelled')                  as pending
from billing_student_bills b
where b.transport_year_id = (select id from tms_transport_year where is_current limit 1);

-- No orphaned money rows
select count(*) as orphans
from billing_student_bills b
where b.transport_year_id is not null
  and not exists (select 1 from tms_fee_bill fb where fb.billing_student_bill_id = b.id);
```

Expected: job `succeeded`, HTTP 200, `billed = collected + pending` exactly,
`orphans = 0`. Automated runs also appear in the **Activity Log** page
(module Fees, action Generate, no actor).

---

# Operating it

## Pause

| Need | Action | Effect |
|---|---|---|
| Stop billing now | Settings → untick **Automatic Bill Generation** | Next tick returns `skipped: 'disabled'`, writes nothing |
| Stop the job entirely | `select cron.unschedule('tms-auto-generate-bills');` | No further calls at all |
| Exclude one structure | Fees → edit → untick **Auto-generate bills** | Dropped from the sweep; others continue |

## Rollback

Bills already created are **not** undone by any switch above — generation is
INSERT-only. Use the existing Transport Vacate flow, which **cancels** bills
rather than deleting them. Cancelled rows are excluded from every money KPI by
`isActiveLearnerBill` in `lib/fees/bills.ts`.

## Which structures auto-bill

| Structure | Mode | `auto_generate` |
|---|---|---|
| Transport Fees 2026-2027 | flat | **true** |
| Transport Fees 2026-2027 (Arts Self) | tiered | **true** |
| Transport Fees 2026-2027 (Arts Aided) | stop_wise | **true** |
| Testing | flat | false — sandbox, must stay off |
| Transport Fees (Staff - All Colleges) | stop_wise | false — never generated; first run would create ~26 bills and fire ~26 notifications at once |

The flag is the **only** exclusion mechanism. There is deliberately no hardcoded
id or name blocklist, because ids change when a structure is recreated and names
change when they are edited — a hardcoded guard would rot silently.

---

# Known behaviours (not bugs)

## Bills can be born overdue

Term 1 was due 2026-07-31. A student onboarded after that date is billed a Term 1
that is **already overdue**, and the fail-closed Term-1 access gate locks them out
of the student portal until they pay.

This is deliberate: due dates are copied verbatim from the structure because TMS
and MyJKKN reconcile on them, and automation must not invent a second due date for
the same term. Instead every such bill is counted and surfaced — look for
`bornOverdue` in the endpoint response and `"N bill(s) created already overdue"` in
the generation-run notes and activity log.

**If this is not what you want, move the term's due date forward *before* enabling
automation** — not after, or you will have two populations with different dates for
the same term.

## Empty runs write nothing

`skipEmptyRun` means no `tms_fee_generation_run` row when there was nothing to
bill. At 96 runs/day across 3 structures, recording every no-op would add ~288
empty rows daily and bury the runs that mattered. Absence of a run row is normal.

## Activity is logged only when something was billed

Same reasoning. A quiet Activity Log means a quiet cohort, not a broken job — use
`cron.job_run_details` (above) to confirm the job itself is firing.

---

# Related known issues

**The other two crons are still dormant.** `/api/cron/incharge-attendance` and
`/api/cron/booking-reminders` have never executed. Root cause: `proxy.ts` 401s
`/api/cron/*` at the edge before the route's own secret check runs. This work
allowlisted **only** the exact path `/api/cron/auto-generate-bills` — deliberately
not the `/api/cron/` prefix, because a prefix would also wake the in-charge
enforcement job, which removes bus in-charges from their role and bills them after
two consecutive missed travel days (98 in-charges across 22 routes). Repairing
those two is a separate, deliberate decision. `proxy.test.ts` asserts the prefix
form stays absent.
