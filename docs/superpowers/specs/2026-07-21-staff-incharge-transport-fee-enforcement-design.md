# Staff Transport Fee ↔ Bus In-Charge Enforcement — Design

**Date:** 2026-07-21
**Module:** Fees (`tms_fee_structure` stop-wise) × Boarding (`tms_staff_route_assignment`, in-charge attendance loop)
**Status:** Approved — implementation not started
**Depends on:** `2026-07-21-aided-stop-wise-transport-fees-design.md` (stop-wise fee mode)

## Policy

Staff transport is free **in exchange for serving as a bus in-charge**. A staff member who does not
take the role — or who takes it and then fails to perform it — pays the stop-wise transport fee for
their boarding stop.

Two billing triggers, different in nature:

| Trigger | Nature | Where it belongs |
|---|---|---|
| Never opted in as in-charge | a **standing state**, continuously true | a cohort **filter** at bill-generation time |
| Opted in, then missed 3 consecutive travel days | an **event** at a moment in time | the existing nightly strike cron |

Modelling the first as an event would need a trigger that does not exist and would be hard to make
idempotent. As a filter it is self-correcting: someone who becomes in-charge simply leaves the cohort.

## Current state (verified against the live DB, 2026-07-21)

| | Count |
|---|---|
| Active staff needing a bus | **105** |
| Active bus in-charges (`tms_staff_route_assignment.is_active`) | **3** |
| **Bus staff who are NOT in-charge** | **102** |
| Of those, priceable from their stop | **101** |
| Existing strike rows | **0** (the loop has never run live) |
| Routes in the fleet | 24 |

Both stop-wise structures are **active** with **455 stop rates** loaded (₹4,400–₹30,250) and **0 bills
generated**. Aided students: 6 of 6 priceable.

**~80 staff will structurally always pay.** There are only 24 routes, so at most ~24 staff can hold
the role. This is understood and intended, not a data gap.

### The one un-priced staff member is a DATA ERROR, not a missing rate

`MR. RANJITHKUMAR S` (`ranjithkumar.s@jkkn.ac.in`, JKKN College of Engineering and Technology) has
`transport_stop_id` pointing at **"COLLEGE"** — sequence 30 on route 16 "GOBI", i.e. the *terminus*.
The source fee sheet listed "College" as the fee-less final row of every route because it is the
destination, not a boarding point.

**Do NOT price the COLLEGE stop to resolve this.** That would charge everyone whose record points at
the destination and would legitimise a broken value. Correct that staff member's boarding stop
instead. This is precisely what the "never bill a missing rate as ₹0" rule is for: it surfaced a real
data error rather than silently charging ₹0.

## The blocker that governs everything

**`resolveApplicablePeople` has no concept of in-charge status.** The staff cohort filters on
`bus_required`, `is_active`, institution and role only. The in-charge exemption has only ever existed
as an *outcome* of the strike loop (lose the role → get billed), never as an *entry* filter.

**Consequence: pressing "Generate" today bills all 105 staff, including the 3 exempt in-charges.**

Adding that filter is the single essential change. The cron, the reminders and the threshold change
are all automation *around* it; without it no amount of scheduling produces the right answer.

## Prerequisite — the two branches must be untangled first

| Branch | Commits ahead of `origin/main` | State |
|---|---|---|
| `feat/incharge-attendance-fee-enforcement` | 14 | unmerged; its Task 8 verification is still blocked |
| `feat/aided-stop-wise-fees` | 29 | unmerged; complete |

Neither is in `origin/main`. They share **exactly one file** — `app/api/admin/fees/[id]/generate/route.ts`,
the live billing route that has written **1,952 real bills**. Both rewrote it substantially.

**Sequence:** merge the in-charge branch to `main` → rebase the stop-wise branch onto it → resolve
that one conflict once, deliberately → only then build the integration. Nothing below is testable
until this is done, and this is the riskiest work in the effort.

## Phase 1 — must land by 25 July 2026

Today is 21 July. The deadline is **25 July 2026** (4 days). Term 1 falls due 31 July, so billing on
the 25th leaves 6 days to pay.

**P0. Untangle the branches** (above).

**P1. Exempt active in-charges from the staff stop-wise cohort.**

The exclusion runs in the generate route **after** `resolveApplicablePeople` returns — **not inside
it**. Same reasoning that governed the boarding-stop lookup: that function is shared with the nightly
in-charge cron, and changing it would put an unrelated job in this feature's blast radius.

```ts
if (isStopWise && fs.audience === 'staff') {
  // active in-charges hold a fee exemption in exchange for the duty
  const exempt = new Set(activeAssignmentEmails.map((e) => e.toLowerCase()));
  people = people.filter((p) => !exempt.has(emailById.get(p.person_id)!.toLowerCase()));
}
```

Applies to any `audience='staff'` + `fee_mode='stop_wise'` structure. **No feature flag — that is the
policy.**

**HAZARD:** `tms_staff_route_assignment` keys on **`staff_email`**; bills key on **`staff.id`**. Every
join between them must lowercase both sides. This repo has already shipped a bug from exactly this
mismatch (the bug-reporter integration). The email lookup must also be chunked to ≤150 ids per
`.in()` — a larger call returns HTTP 400 and an unchecked `{ data }` reads as empty, which here would
exempt **nobody** and bill all 105.

Dry-run must then report: **101 billable, 3 exempt, 1 unresolved**.

**P2. Notify the 105 bus staff.** One send via the existing `tms_notification` audience resolver:
*"Volunteer as bus in-charge by 25 July 2026, or transport fees apply for 2026-2027."* Plus one
reminder on 24 July. The 14/7-day reminders originally proposed do not fit a 4-day window.

**P3. On 25 July: dry run → review the actual names → Generate.** A human reviews the first run, which
is the one that charges 101 people for the first time.

## Phase 2 — after the deadline, no time pressure

**P4.** `staff_opt_in_deadline date` on `tms_fee_structure` (nullable, additive; meaningful only for
`audience='staff'` + `fee_mode='stop_wise'`). Full automation requires the deadline to become real
data — a cron has no judgement and needs a date to compare against.

**P5. The automatic billing cron.** Daily; when `today >= staff_opt_in_deadline` and the structure is
`active`, bills the non-in-charge cohort. Four safety mechanisms, because it charges ~102 people with
nobody watching:

| Mechanism | Why |
|---|---|
| `?dryRun=1` | Mirrors the existing in-charge cron; lets the run be inspected before arming |
| **Circuit breaker: refuse and alert above 120 people** | Cohort is 105. A run that suddenly bills 500 has a bug, not a busy day |
| Fail-loud per staff member | The in-charge cron's review established that an infrastructure error must never *manufacture* a charge — fail that person, continue |
| Idempotency via `tms_fee_bill_idem_unique` | A re-fired cron changes nothing |

**P6. `REMOVAL_THRESHOLD` 2 → 3** in `lib/boarding/incharge-attendance.ts`.

Current behaviour vs required:

| Consecutive missed travel days | Today | Required |
|---|---|---|
| 1 | warn | warn |
| 2 | **remove + bill** | warn |
| 3 | — | **remove + bill** |

One constant. `warningCopy` already interpolates it, so the message text updates itself. Non-travel
days (holidays, empty rosters) neither strike nor forgive — the streak pauses. On removal the bill
comes from the **stop-wise** structure (their boarding stop), not a flat amount.

**P7. Late opt-in cancels bills.** When a staff member becomes an active in-charge, their current-year
unpaid/partial staff bills flip to `cancelled` (never deleted), reusing the proven transport-vacate
RPC pattern. Paid bills are left alone.

## Non-goals

- Making staff bills *payable*. They remain ledger-only (`staff_deferred`,
  `billing_student_bill_id = null`); `billing_student_bills.student_id` has a NOT NULL FK to
  `learners_profiles` that rejects staff ids.
- Changing `lib/fees/applicability.ts` — the nightly in-charge cron shares it.
- Any change to the three pre-existing fee structures ("Testing", "Transport Fees 2026-2027",
  "Transport Fees 2026-2027(Arts Self)"). Standing user directive.
- Auto-assigning in-charges to the 21 routes that currently have none.

## Risks

- **Branch merge is the biggest risk in this effort.** The conflicted file writes real money and both
  branches rewrote it. Resolve it with the whole diff in view, and re-run both features' test suites
  plus a dry-run comparison afterwards.
- **102 people billed at once.** Phase 1 keeps a human in the loop for exactly this reason. Phase 2's
  circuit breaker is the standing guard once automation takes over.
- **Only 3 in-charges for 24 routes.** The notification may produce a wave of volunteers, shrinking
  the billable cohort between the dry run and the generate. Re-run the dry run immediately before
  generating.
- **Recorded dissent:** full automation (P5) was chosen over a human-gated alternative. The concern —
  that ~102 real charges are issued with no review — is mitigated by the four mechanisms above but
  not eliminated.

## Verification

`npm run lint` crashes (circular config) and `tsc` is chronically red without gating `next build`.
Neither is a regression gate.

1. `npx vitest run` — the merged trunk must carry BOTH features' suites (stop-wise 277 + the
   in-charge branch's tests). Record the combined number before and after the merge.
2. Path-scoped `npx tsc --noEmit | grep <changed file>` → zero lines.
3. Unit-test the exemption filter as a pure function: in-charge excluded, non-in-charge kept, casing
   mismatch still matched, empty assignment list exempts nobody.
4. **Dry run before any generate**, expecting 101 / 3 / 1. Any other split means the filter is wrong.
5. Post-generate: every billed staff member's total equals their stop's annual rate, and the 3
   in-charges have **zero** bills.
