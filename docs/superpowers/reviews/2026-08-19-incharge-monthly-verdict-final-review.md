# Final whole-branch review — `feat/incharge-monthly-verdict`

Reviewed: `2f59c20..d7291f7` (22 commits, 27 files, +5327/-175).
Verification run: `npx vitest run` → **75 files / 821 tests passed**. No SQL run, no route invoked.

Scope of this pass: the cross-cutting view only — end-to-end journey, contradictions
between tasks, the two crons together, deferred triage, and shared assumptions the
per-task reviews structurally could not test. Per-task findings are not re-litigated.

---

## Findings

### Critical 1 — The scheme is single-use: one passed month permanently disarms every later month

`lib/fees/cancel-staff-bill.ts:21-36` — `cancelStaffBills` cancels **every** uncancelled,
unpaid current-year staff bill for that person. There is no term filter and no month
filter. Staff bills are multi-row: `generateStaffBill` inserts one row per term
(`lib/fees/staff-bill.ts`), and the by-person mark-paid route's own header says "a
stop-wise structure can raise several instalments".

So a staffer who passes August has term 1, 2 and 3 for the whole transport year
cancelled. Then, per the idempotency index
`tms_fee_bill_idem_unique (fee_structure_id, person_id, term_no, transport_year_id)` —
which does **not** include `status` — no bill can ever be raised for them again this year:

- `makeStaffBillsPayable` finds no `staff_deferred` row → 0.
- `generateStaffBill` 23505s on every term and returns `billingStatus: 'billed'` with
  `inserted: 0`.
- The round-2 invariant check (`route.ts:261-275`) correctly catches this and records
  `blocked` — role kept, no bill.

The Task 8 fix made the failure *safe*; it did not make the feature *work*. From month 2
onward the verdict is inert for everyone who passed month 1 — exactly the population you
most want it to keep holding. It also contradicts spec decision 1, "the exemption is
earned monthly, not assumed": one good month buys the rest of the year.

The ledger already recorded a live instance (`kumar.a@jkkn.ac.in`, ₹8,800, term 1,
cancelled) and read it as "the invariant fix covers him". It covers him from being
wrongly punished; it does not let him ever be billed again.

**This needs a product decision before `enforce`, not a code tweak.** Options: scope
cancellation to the term/month the verdict is for; give re-raised bills a distinct
identity (a per-month `fee_structure_id` or a `term_no` derived from the month) so the
idempotency index does not block them; or model the cancellation as a credit row rather
than mutating `status`.

### Critical 2 — The pg_cron schedule decides the month before the month has ended

`supabase/migrations/20260818120000_tms_incharge_month_verdict_cron.sql:33` schedules
`0 16 28-31 * *` — the job fires on the 28th, 29th, 30th **and** 31st of every month.
`app/api/cron/incharge-month-verdict/route.ts:51-53` always evaluates
`monthWindow(istToday())`, i.e. the **whole** calendar month, regardless of which of
those days it is running on.

On the 28th of a 31-day month, in `enforce`:

- A staffer whose route was missed once already → bill made payable, assignment
  deactivated, role revoked **on the 28th**. They cannot mark the 29th–31st, so the
  later runs only confirm it. They were punished three days early.
- A staffer clean so far → **bills cancelled on the 28th**. Bookings for the 29th–31st
  are usually already in (the booking window books the next working day), but attendance
  for those days cannot exist yet. The 31st run then re-evaluates them as failed and
  tries to re-bill — which Critical 1 makes impossible. They escape the month entirely.

The migration comment claims the `(staff_email, month)` upsert makes repeat runs
idempotent. That is true of the **audit row** only. The money and role side-effects are
not idempotent, and the audit row is *downgraded* on re-run (see Minor 13).

**Fix (small, self-contained):** in the route, refuse to `act` unless
`today === window.end`, or unless an explicit `month=` param was supplied (the deliberate
human-pressed run). Shadow recording on the 28th–30th is harmless and still useful.

### Critical 3 — `POST /api/boarding/incharge-pledge` has no server-side gate; `must_pay` is UI-only

`app/api/boarding/incharge-pledge/route.ts:37-60` checks eligibility and that a route is
allocated, then inserts the probation, the assignment and the role. It never checks for
an outstanding bill, never calls `deriveInChargeGate`, and never checks
`probationThisMonth` or `remainingServiceDays`. The entire `pledge` vs `must_pay`
decision lives in `/api/boarding/access` (a read) and in the client.

Reachable consequences:

- A staffer whose probation this month is `failed` is shown `must_pay` — but a direct
  POST to the pledge route succeeds (the partial unique index only blocks a second
  **active** probation), reassigns them and re-grants the exemption. That is the leak
  `self-assign` was hardened to close, reopened through the new door. Ruling R3
  acknowledged that the pledge route bypasses `maySelfAssign`; it did not notice that it
  bypasses the *whole* gate.
- `remainingServiceDays === 0` is not checked server-side, and an empty window **passes**
  by design (`evaluateMonth`, "an empty window PASSES"). A pledge accepted on the last
  working day, or one whose remaining bookings are later cancelled, yields
  `requiredDays: 0` → `passed` → **all bills cancelled for zero days of duty** — and then
  Critical 1 makes them unbillable for the rest of the year.

**Fix:** the pledge route must re-derive `deriveInChargeGate` server-side from the same
inputs `/api/boarding/access` uses and 403 unless the gate is `pledge`. Separately,
`was_probation` verdicts with `requiredDays === 0` should not count as `passed` — leave
the probation active and take no bill action.

### Critical 4 — The cleanup migration will deactivate exactly the people who accept the pledge

`supabase/migrations/20260818110000_revoke_billed_incharge_reassignments.sql:39-53`
selects assignments that are `is_active` **and** `source = 'self'` **and**
`assigned_at >= '2026-08-15'` **and** whose person has an uncancelled, unpaid staff bill.

A pledge-created assignment matches every clause:
`incharge-pledge/route.ts:76-86` inserts `source: 'self'`, `assigned_at` defaults to now
(≥ 08-15), and **the bill is not cancelled until month end** — that is the whole point of
probation. The plan's ruling defers applying this migration until *after* the pledge
screen is live, which is precisely the window in which staff will have pledged.

Result: applying it strands the people who did the right thing. Worse than "stranded" —
their `tms_incharge_probation` row stays `active` with a dead `assignment_id`, which is
the one state the pledge route's rollback exists to prevent; the month-end job iterates
**active assignments only**, so their probation never resolves, and the stale active
probation then triggers Important 5 on the next month's run.

**Fix before applying:** add to the `leaked` CTE
`and not exists (select 1 from tms_incharge_probation p where lower(p.staff_email) = lower(a.staff_email) and p.status = 'active')`,
or bound the predicate with `and a.assigned_at < '<deploy timestamp>'`.

### Important 5 — A stale probation from an earlier month silently passes a staffer and cancels their bill

`app/api/cron/incharge-month-verdict/route.ts:163-171` selects **any** probation with
`status = 'active'`, with no month filter, and then uses its `window_start`/`window_end`
as the evaluation window — while `booked`/`marked` are fetched for the *verdict month's*
window (`routeDates`, lines 122-150).

`/api/boarding/access/route.ts:82-86` does filter, with `.gte('window_end', win.start)`.
The two files therefore disagree about what "this month's probation" means — a direct
contradiction between Task 8 and Task 10.

If a probation is left `active` across a month boundary (job not run, mode `off`, an
explicit `month=` replay, or Critical 4's stranding), September's run evaluates the
August window against September's data → zero overlapping service days → `passed` →
bills cancelled for nothing.

**Fix:** `.gte('window_end', window.start).lte('window_start', window.end)` in the cron,
matching the access route.

### Important 6 — The shadow/dry-run preview overstates cancellations, on the pass path

`route.ts:199-204` — in shadow/dryRun, a passed staffer previews as
`billAction: 'cancelled'` whenever `staffId && currentYear.id`, with no check that a bill
actually exists. The real path (lines 190-198) only sets `'cancelled'` when
`res.cancelled > 0`. Per the spec's own measurements only 38 of ~108 in-charges have a
bill row at all.

The fail path was fixed for exactly this class of defect in Task 8's Minor ("a preview
that overstates is not a cosmetic defect in this context"); the pass path kept the bug,
and its comment claims otherwise. The Monthly board then renders
"Passed — bill cancelled: N" for a run that would cancel a fraction of N. This is the
evidence an admin reads before flipping to `enforce` on a ₹13 lakh decision.

**Fix:** in the preview branch call `loadStaffBillState` and preview `'cancelled'` only
when `hasOutstanding`; otherwise `'none'`.

### Important 7 — Two mark-paid routes with contradictory semantics; the new one half-settles the bill

New: `app/api/admin/staff-bills/by-person/[email]/mark-paid/route.ts:69-79` writes only
`paid_at` and `marked_paid_by`.
Existing: `app/api/admin/fees/[id]/staff-bills/mark-paid/route.ts:53-63` writes
`status: 'paid'`, `paid_at`, `paid_amount`, `payment_reference`, `marked_paid_by`.

The spec named all four columns for this action. Consequences of the divergence:

- The bill keeps `status = 'generated'` after payment, so the **older route will mark the
  same bill paid a second time** — its guard is `status === 'generated'`, not
  `paid_at is null` — overwriting `paid_at`/`marked_paid_by` and stamping a `paid_amount`
  that may differ from what was collected.
- `paid_amount` stays `null`, so any collections/revenue rollup summing `paid_amount`
  under-reports staff transport collections (cf. the recent "count staff bills in
  transport billing totals" work).
- `loadStaffBillState` treats any non-cancelled, unpaid row as outstanding, so the new
  route will also stamp `paid_at` on **`staff_deferred`** held bills — which the older
  route explicitly refuses ("A bill with status ... cannot be marked paid").

Also note, for the user's explicit acknowledgement rather than as a defect: recording
money is now possible with `tms.drivers.assign`, whereas the pre-existing money path
requires `tms.fees.edit`. The spec sanctioned this ("matching the existing board"), but
it widens who can write payment state.

### Important 8 — The Monthly board is unreachable: nothing links to it

`app/(admin)/staff-route-assignments/enforcement/monthly/page.tsx` exists and builds, but
a repo-wide grep for `enforcement/monthly` finds hits only in `.next/` build artifacts —
no sidebar entry, and the existing `enforcement/page.tsx` was not touched (it is not in
the diff). The spec asked for "a new **Monthly tab**". The monthly page links *back* to
the daily board, but not the other way.

Rollout step 2 — "review a full run on the admin board" before flipping to `enforce` —
requires an admin to type the URL. Add the tab/link on the existing enforcement page.

Related, smaller: the spec's step 2 says review a `dryRun=1` run on the board, but
`dryRun` writes nothing and the board reads only recorded rows, so a dry run is invisible
in the UI. The shadow-mode path substitutes correctly; the spec text is now stale.

### Important 9 — A staffer with two active assignments is evaluated twice, and the two verdicts fight

The month-end loop iterates **assignment rows** (`route.ts:152`) while the verdict upserts
on `(staff_email, month)`. `tms_staff_route_assignment` only forbids duplicate active
`(staff_email, route_id)` pairs, so an admin can put one person on two routes.

- Pass on route A and fail on route B → both bill actions execute in assignment order
  (cancel then generate, or generate then cancel), and whichever iterates last owns the
  single audit row. The money outcome is decided by row order.
- On a fail, only `a.id` is deactivated; `maybeRevokeBoardingRole` then finds the *other*
  active assignment and keeps the role. The person is billed and still in-charge.
- `summary.passed` / `failed` / `evaluated` count assignments, not people, so the board's
  stat cards over-count.

**Fix:** group by `staff_email`, evaluate the person once across the union of their
routes, and deactivate all of their assignments on a fail.

### Important 10 — The month-end job never writes the strike table, so the daily board goes permanently stale

`app/api/cron/incharge-attendance/route.ts:245-249` carries forward
`strike?.removed_at` and `strike?.billing_status` with the comment "carry forward whatever
the month-end verdict … already wrote". The month-end verdict writes **neither** — it
touches `tms_incharge_month_verdict`, `tms_fee_bill`, `tms_staff_route_assignment` and
`user_roles`, and never `tms_incharge_attendance_strike`.

So after the demotion in Task 14, `removed_at` and `billing_status` are dead columns that
nobody ever sets again. The existing enforcement board will show "nobody removed, nothing
billed" indefinitely, while the Monthly board shows removals and payable bills. Two admin
screens telling different stories about the same people is how the 2026-08-14 run's
confusion started.

**Fix:** either have the verdict route stamp `removed_at`/`billing_status` on the strike
row when it revokes, or drop those columns from the daily board and point it at the
verdict table. Cheap either way; do not leave the comment claiming a writer that does not
exist.

Positive note on the same axis: on the question the brief raised — *can both crons act on
the same person for the same days?* — **no.** The daily job's only remaining effects are
the strike upsert and a warning notification (`act` feeds `notify` only, lines 91-101),
and the `remove` branch merely increments a counter. The month-end job does not read strike
data at all; it recomputes from `tms_booking`/`tms_attendance`. The double-punishment path
is genuinely closed.

### Minor 11 — The fee gate fails open on read and closed on write; the UI offers what the API refuses

`app/api/boarding/access/route.ts:66-76` discards the error on the `tms_transport_year`
lookup, and treats both "no current year" and "unresolved staff id" as "no outstanding
bill" → `hasOutstandingBill = false` → gate `choose`, i.e. the willingness toggle.
`app/api/boarding/self-assign/route.ts:70-89` fails **closed** on those same two
conditions with `no_current_year` / `staff_unresolved`.

Not a leak — the write side holds — but a billed staffer in that configuration is shown a
toggle that 409s the moment they press it. Mirror the two distinct reasons into the read
path so the screen explains itself.

### Minor 12 — The verdict route logs no activity

Spec: "Every mutation is instrumented through `lib/activity/log.ts`." The month-end route
cancels bills, promotes bills, deactivates assignments and revokes roles with no activity
row. The pledge, self-assign and mark-paid routes all do log. The cron has no
`AuthContext`, which is presumably the reason, and `tms_incharge_month_verdict` is a
reasonable audit substitute — but the deviation should be recorded deliberately rather
than left as an omission.

### Minor 13 — A re-run in `enforce` downgrades the audit row

Second run in the same month: the passed staffer's bills are already cancelled →
`cancelStaffBills` returns 0 → `billAction = 'none'` → the upsert overwrites the
`'cancelled'` audit with `'none'`. On the fail side the same thing turns `'generated'`
into `blocked`/`'none'`, and the board's **Mark bill paid** button (keyed on
`bill_action === 'generated'`, `columns.tsx:100`) disappears. With the 28–31 schedule of
Critical 2 this happens on every ordinary month. Preserve a non-`none` `bill_action` on
re-upsert, or derive the board's action from live bill state.

### Minor 14 — `lib/boarding/access-state.ts` is dead code with live tests

Zero live call sites since Task 12 removed the layout import; only its own test file
references it. **Recommendation: delete both the module and its test.** It is now a second,
independently-tested statement of "which boarding screen do you get" that does not know
about bills. Keeping it is not neutral — the next person to need that logic will find a
tested-looking helper and reintroduce the fee-blind gate. `deriveInChargeGate` is the
authority; `incharge-gate.ts`'s header already documents the relationship, and that
comment should be updated when the module goes.

---

## Deferred items — must fix before merge / can wait

| Item (from the ledger) | Verdict |
| --- | --- |
| Task 4 minor — migration verification block said "expect 26" | **Already fixed** in `d7291f7`; the block now tells the operator to re-run the pre-count. Closed. |
| Task 12 minor — a 409 "already accepted" leaves the user on the pledge screen | **Can wait.** Cosmetic, and the 409 is a genuinely rare double-submit. It is also a two-line fix (treat 409 as success and `window.location.assign('/boarding/attendance')`) — worth folding into the Critical 3 pass since you are in that file anyway. |
| Task 12 minor — `lib/boarding/access-state.ts` dead with live tests | **Can wait to merge, but decide now.** See Minor 14 — recommend deleting module + test in this branch rather than carrying an untethered second gate. |
| Task 13 important — "Mark bill paid" stays visible after a successful payment | **Can wait.** The route fails closed (`hasOutstanding` re-checked, 409 "Nothing outstanding"), so there is no double-payment through *this* route. But it stops being purely cosmetic in combination with Important 7: the bill is left `status='generated'`, so the *other* mark-paid route will re-settle it. Fix Important 7 and this stays cosmetic. |
| Deferred application of the cleanup migration (`20260818110000`) | **Must fix the predicate before it is applied** — see Critical 4. Do not apply as written after the pledge screen is live. |
| Deferred application of the cron schedule (`20260818120000`) | **Must fix Critical 2 before applying.** As written, applying it post-deploy schedules a job that decides the month on the 28th. |

---

## Overall verdict on merge readiness

The engineering is of a high standard — the pure-logic split is real, the fail-loud
discipline on every query is consistent, the comments explain *why* rather than *what*,
the suite is green at 821 tests, and the hardest single question in the brief (can the two
crons punish the same person twice?) is answered cleanly: they cannot. What the per-task
reviews could not see is that the feature's **repeatability** was never established. Three
of the four Criticals are seams between tasks that each side got right in isolation:
`cancelStaffBills` cancels a whole year because nothing told it a month was at stake
(Critical 1); the schedule fires four times because nothing told it the route evaluates a
full month (Critical 2); the pledge route skips the gate because the gate was built as a
read-path concern (Critical 3); and the cleanup migration's predicate was written before
the pledge existed to collide with it (Critical 4). None of them fire today — the branch
is unpushed, both migrations are unapplied, and `shadow` holds — and it is worth stating
plainly that deploying the code alone is *safe*: currently-assigned billed staff short-
circuit to `in_duty`, so nobody is newly locked out until the cleanup migration lands.

My recommendation: **do not merge as-is.** Criticals 2, 3 and 4 plus Importants 5 and 6 are
small, contained, and each is a few lines in a file you already know — fix them in this
branch. Critical 1 is a product decision about what "cancelled" should mean across terms
and months, and it should be answered before anyone flips `enforce`, though it can be
tracked separately from the merge if the migrations stay unapplied. Importants 7–10 are
merge-blocking only in the sense that shipping them means shipping two mark-paid
semantics, an unreachable board, an order-dependent verdict for dual-route staff, and two
admin screens that disagree — all of which are cheaper to fix now than to explain to the
transport office later.
