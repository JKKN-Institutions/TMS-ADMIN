# In-Charge Attendance Loop — Runbook

## Enabling
1. Set `CRON_SECRET` in Vercel project env (Production + Preview) to a long random string.
   Vercel automatically sends it as `Authorization: Bearer $CRON_SECRET` to scheduled paths.
2. Deploy. The schedule in `vercel.json` (`30 15 * * *` UTC = 21:00 IST) activates on deploy.

## Manual invocation
    curl -H "Authorization: Bearer $CRON_SECRET" \
      https://tmsadmin.jkkn.ai/api/cron/incharge-attendance

Returns `{ success, data: { date, evaluated, skipped, warned, removed, billed, errors } }`.

## Prerequisite for billing
The loop bills only from an ACTIVE `tms_fee_structure` with `audience='staff'` for the
CURRENT transport year. Zero exist as of 2026-07-20 — until the transport office creates
one in Fees Structure, removals record `billing_status='no_structure'` and no bill is
generated. The revoke still happens.

## Inspecting state
    select staff_email, consecutive_misses, missed_dates, last_evaluated_date,
           warned_at, removed_at, billing_status
    from tms_incharge_attendance_strike order by updated_at desc;

## Undoing a wrong removal
    update tms_staff_route_assignment set is_active = true where id = '<assignment_id>';
    delete from tms_incharge_attendance_strike where assignment_id = '<assignment_id>';
Then cancel any generated bill: `update tms_fee_bill set status='cancelled' where ...`.
The staffer can also simply re-opt-in via the willingness toggle at /boarding/in-charge.
