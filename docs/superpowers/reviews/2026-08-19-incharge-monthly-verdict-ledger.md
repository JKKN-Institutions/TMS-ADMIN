# SDD ledger — plan: docs/superpowers/plans/2026-08-18-incharge-monthly-verdict.md

Spec: docs/superpowers/specs/2026-08-18-incharge-monthly-verdict-design.md (read)
Branch: feat/incharge-monthly-verdict
Merge base: 2f59c20da3ecc12e6854a195b9339b75e8a87386

## Pre-flight conflict scan

### Cross-task pairs (shared file or interface)

| A | B | A produces | B consumes | Finding |
|---|---|---|---|---|
| T1 | T3 | `tms_incharge_probation` | `.ilike('staff_email', …).eq('status','active')` | OK |
| T1 | T8 | both tables | probation read + verdict upsert | **CONFLICT — see R1** |
| T1 | T10 | `tms_incharge_probation` | probation status read | OK |
| T1 | T11 | `tms_incharge_probation` | insert; relies on 23505 from the partial index | OK — plain insert, no `on_conflict`, so a functional index is fine |
| T1 | T13 | `tms_incharge_month_verdict` | select by month | OK |
| T2 | T3 | `loadStaffBillState` → `{hasOutstanding,outstandingAmount,billIds}` | `.hasOutstanding` | OK |
| T2 | T10 | same | `.hasOutstanding`, `.outstandingAmount` | OK |
| T2 | T13 | same | `.billIds`, `.outstandingAmount`, `.hasOutstanding` | OK |
| T5 | T8 | `serviceDays`, `evaluateMonth`, `monthWindow` | all three | OK — signatures match |
| T5 | T10 | `serviceDays`, `monthWindow` | both | OK |
| T5 | T11 | `probationWindow(acceptDate)` → `{start,end}` | both fields | OK |
| T6 | T10 | `deriveInChargeGate(InChargeGateInput)` | all 7 input fields supplied | OK |
| T6 | T12 | 5 gate values | layout union + page narrowing | OK — layout maps `in_duty`→`allowed` |
| T7 | T8 | `cancelStaffBills`, `makeStaffBillsPayable` | both | OK |
| T3 | T11 | `maySelfAssign` probation branch | pledge route inserts the assignment DIRECTLY | **CONFLICT — see R3** |
| T10 | T12 | `gate`, `outstandingAmount` in the access response | layout + page | **CONFLICT — see R5** |
| T8 | T14 | both cron routes | different files, no shared symbol | OK |
| T13 | T2 | by-person mark-paid | `loadStaffBillState` | OK |

### Per-task internal consistency

| Task | Finding |
|---|---|
| T1 | Verdict unique index is functional (`lower(staff_email)`) but T8 upserts with a column-list `onConflict` — **R1** |
| T2 | Tests match implementation; numeric-as-string case covered | OK |
| T3 | Uses raw `.ilike('staff_email', email)` — unescaped — **R2** |
| T4 | Predicate in the migration matches the Step 2 pre-count query verbatim | OK |
| T5 | 18 tests cover every exported function incl. leap year and malformed input | OK |
| T6 | 12 tests cover all 5 gate values and the ordering property | OK |
| T7 | Fake-svc shape matches the builder chain the impl uses | OK |
| T8 | `summary.skippedNoRoute` assigned before declaration; Step 4 patches it — **R4** |
| T9 | Schedule `0 16 28-31 * *` relies on the verdict upsert for idempotency — consistent with T1 once R1 lands | OK |
| T10 | Fields supplied to `deriveInChargeGate` all sourced | OK |
| T11 | Rollback deletes the probation when the assignment insert fails | OK |
| T12 | Step 3 leaves prop-passing vague; Step 4 makes it moot — **R5** |
| T13 | by-person route uses raw `.ilike('email', email)` — **R2** |
| T14 | Keeps `performRemoval`/`removalCopy` exported; their tests still pass | OK |
| T15 | Verification only; stops before `enforce` | OK |

### Rulings (made before execution)

**R1 — Verdict unique index must be on plain columns, not `lower(staff_email)`.**
T8 upserts with `onConflict: 'staff_email,month'`. PostgREST resolves that
against a unique constraint/index on those COLUMNS; it cannot target an
expression index, so every upsert would fail at runtime and the whole month-end
job would record nothing. Decision: T1 creates the verdict index as plain
`(staff_email, month)`, and T8 writes `staff_email` lowercased so case variants
cannot split a person across two rows. The probation index stays functional —
it is never an upsert target.
*Cost if wrong:* a staffer whose assignment email changes case mid-month gets
two verdict rows; the later one wins the board. Recoverable by dedupe.

**R2 — Every `.ilike()` on an email uses `emailIlikePattern()`.**
T3 and T13 pass the raw address. `_` is a SQL LIKE wildcard and it is common in
these addresses — `kalaivani_s@jkkn.ac.in` and `sindhu_s@jkkn.ac.in` are live
in-charges. Unescaped, `kalaivani_s@…` also matches `kalaivaniXs@…`, so the fee
gate could read the wrong person's bills. T8 and T10 already escape; T3 and T13
must too.
*Cost if wrong:* none — escaping is strictly safer than not.

**R3 — Keep the probation branch in `maySelfAssign` even though the pledge
route bypasses `/api/boarding/self-assign`.**
T11 inserts the assignment directly, so the branch is not on the live path
today. It stays because it is the correct rule (an active probation IS
clearance), it is four lines, it is unit-tested, and removing it would make the
guard wrong the first time anything routes a pledged staffer through
self-assign.
*Cost if wrong:* four lines of defensive code that no integration test exercises.

**R4 — T8 declares `skippedNoRoute: 0` in the summary literal from the start.**
The plan writes the bug in Step 3 and patches it in Step 4. Folding the fix into
Step 3 removes a pointless intermediate broken state.
*Cost if wrong:* none.

**R5 — The layout does NOT hold `outstandingAmount`; the in-charge page
re-fetches `/api/boarding/access` itself.**
T12 Step 2 adds `setOutstandingAmount` to the layout, but Step 4 has the page
fetch the same endpoint for itself, so the layout state would be dead. The
layout reads only `gate`. Step 3's vague "pass it down via context or a prop"
is therefore unnecessary — drop it.
*Cost if wrong:* one extra `/api/boarding/access` call on the in-charge screen,
which is a single non-hot page.

## Task log

### Task 1
- BASE f341173, HEAD e123d26, commit `e123d26 feat(incharge): add probation and month-verdict tables`
- Implementer status: DONE_WITH_CONCERNS — concern was that the brief said "expect 14 columns" for the verdict table but the actual (and the brief's own DDL) is 15. Controller checked: the implementer is right, the brief's arithmetic was wrong. Not a defect.
- Controller verified live indexes directly: verdict = UNIQUE btree (staff_email, month) [R1 applied]; probation = UNIQUE btree (lower(staff_email)) WHERE status='active'.
- Ruling: reviewer `t1-review` went unresponsive for ~9 min on a 3.3 KB diff after a status probe. Replaced with a fresh reviewer rather than blocking the plan. Cost if wrong: one duplicate review seat.
- Review (t1-review-b): SPEC ✅, QUALITY approved, no findings.
- Task 1: complete (commits f341173..e123d26, review clean)
- Ruling: agent completion notifications do not surface in this session; adopting a file-based protocol — implementers write reports, reviewers write `task-N-verdict.md`, controller polls the filesystem. Cost if wrong: none, only extra polling.
- Ruling: batching Tasks 2,5,6,7 into ONE implementer dispatch. All four are the same shape (pure lib module + colocated vitest file), touch disjoint files, and their briefs contain complete code — transcription plus test runs, not judgment. Reviewed as one diff. Cost if wrong: a single fix loop covers four modules instead of one, slightly coarser attribution.
- ADJUDICATION (reviewers disagreed): `t1-review` reported Important "missing -- Verification block"; `t1-review-b` dismissed it claiming no other migration has one. Controller checked: `grep -l Verification supabase/migrations/*.sql` = **9 files**, including 20260812120000_tms_incharge_attendance_cron.sql. t1-review is CORRECT, t1-review-b reasoned from a false premise. Finding stands -> fix round 1.
- Ruling: Task 1's completion line above is RETRACTED pending the fix round. A reviewer's factual claim is evidence to verify, not a verdict to accept.
- Task 2/5/6/7 batch: implementer `t2567-purelibs` DIED with "API Error: The response stopped arriving" (twice), mid-Task-2. Partial `lib/fees/staff-bill-state.test.ts` (53 lines, incomplete) discarded — nothing was committed.
- Ruling: abandon the 4-task batch; dispatch ONE task per implementer from here. The batch was a wall-clock optimisation and it cost more than it saved by dying ~13 min in with nothing committed. Cost if wrong: more dispatch overhead, which is the cheaper failure.
- Task 1: fix round 1/5 (1 addressed, 0 open — Verification block added; commits e123d26..4c79d40)
- Task 1: complete (commits f341173..4c79d40, review clean)
- Task 2: implementer DONE, 7/7 tests pass, commit 0a2329f. Awaiting review.
- Task 2: review SPEC ✅, QUALITY approved, no findings.
- Task 2: complete (commits 4c79d40..0a2329f, review clean)
- Task 5: implementer DONE, commit a1946dc. 17 tests pass (brief said 18 — controller confirms 5+5+4+3=17, brief arithmetic wrong again, no defect). incharge-attendance.test.ts re-run 30/30, so isServiceWeekday's module was not disturbed.
- Task 5: review SPEC ✅, QUALITY approved, no findings. Reviewer independently confirmed incharge-attendance.ts untouched and the whole date chain is UTC/string-safe.
- Task 5: complete (commits 0a2329f..a1946dc, review clean)
- Task 6: implementer `t6-gate` DIED ("API Error: The response stopped arriving"), nothing written to disk. Third agent death this session (t2567-purelibs, t5-monthrules recovered after a probe, t6-gate did not).
- Ruling: this session's subagent API is flaky on longer runs. Mitigation adopted, not escalation — re-dispatch fresh on death, and send a wake probe ~60-90s after each dispatch, which has reliably pulled stalled agents into producing output. Do NOT implement in the controller: review independence and context hygiene are the point of this skill, and a dead agent is a retry, not a reason to bypass the gate. Cost if wrong: extra wall-clock per task.
- Task 6: retry implementer `t6-gate-b` DONE, commit cda9591, 12/12 tests (count verified, brief correct this time). Wake probe ~75s after dispatch worked.
- Task 6: review SPEC ✅, QUALITY approved, no findings. Reviewer confirmed the bill-before-toggle ordering is pinned by two tests and access-state.ts untouched.
- Task 6: complete (commits a1946dc..cda9591, review clean)
- Ruling: Task 7's Step 5 full-suite `npx vitest run` downgraded to OPTIONAL. The implementer stalled ~9 min at that point; the step only gathered a baseline test count, is not a correctness gate, and the final whole-branch review runs the suite anyway. Cost if wrong: no mid-plan suite baseline, so a regression introduced by tasks 8-14 surfaces at final review rather than immediately.
- Task 7: implementer `t7-cancelbills` died repeatedly (API errors) but its commit 538e28d LANDED complete. Controller verified directly: both files present (128 insertions), 5/5 tests pass on re-run, `throw new Error` on both query paths, `.is('paid_at', null)` on both, `.neq('status','cancelled')` on cancel and `.eq('status','staff_deferred')` on promote. Status file never written by the agent; verification stands in its place.
- Note: the suite runs in <1s, so the earlier "full-suite hang" theory was wrong — the agent was simply dying. The optional-Step-5 ruling stands but was not the cause.
- Task 7: review SPEC ❌ / QUALITY Important — `cancelStaffBills` is missing `.neq('status','cancelled')` from its filter chain (brief specified it; implementation dropped it). Controller VERIFIED by reading lib/fees/cancel-staff-bill.ts:25-32 — the line is genuinely absent. Reviewer also correctly noted the brief's own fake-builder tests CANNOT detect this class of bug, so the fix must add an assertion too. -> fix round 1.
- Task 3: implementer DONE, commit be3141b, 4/4 tests, R2 escaping correction applied. Awaiting review.
- Task 7: fix round 1/5 — `.neq('status','cancelled')` restored AND a test assertion added; implementer verified the assertion fails without the fix (1 failed/4 passed) then passes with it (5/5). Commit 4c74b4c. Awaiting scoped re-review.
- Task 3: review SPEC ✅; QUALITY one Important — the fee gate FAILS OPEN on two conditions my brief mandated: `if (currentYear?.id)` (no year marked is_current => gate skipped entirely) and `if (staffId)` (resolveStaffId returns null on a transient DB error too, not only genuine non-resolution).
- Ruling (plan-mandated finding, spec is the authority): FIX IT — make both conditions fail CLOSED with DISTINCT messages. Rationale: (a) this task's only purpose is closing a leak, and a gate that disables itself when a config row is missing is not a gate; (b) this project has already been burned by exactly this pattern — see project_transport_fees_current_year_gate.md, the access RPC fail-opens the same way; (c) the enforcement post-mortem's lesson that distinct causes must produce distinct reason codes applies directly. Verified safe to fail closed TODAY: tms_transport_year has exactly 1 row and it IS is_current, so nobody is locked out by the change.
  Cost if wrong: if the office ever unsets is_current, staff can no longer self-assign as in-charge and get an explicit error telling them to contact the office — instead of silently receiving a fee exemption they have not earned. That is the failure I want.
- Task 7: re-review — both findings ADDRESSED, no new breakage.
- Task 7: complete (commits cda9591..4c74b4c, review clean after 1 fix round)
- Task 3: fix round 1/5 — fail-closed on both conditions, distinct 409 reasons (`no_current_year`, `staff_unresolved`), 4/4 tests, `next build` green. Commit c669309. Awaiting scoped re-review.
- RULING (sequencing defect the plan did not anticipate): Task 4 will WRITE AND COMMIT the cleanup migration but MUST NOT APPLY it to production yet. Applying it now deactivates 26 real staff whose only route back — the pledge screen and /api/boarding/incharge-pledge — does not exist until Tasks 11/12. That would strand them AND stop attendance being marked on their routes. The urgency that put cleanup in Phase 1 was to stop the leak; Task 3 (commit be3141b + c669309) already stopped it, so nothing is gained by applying today. Application moves to Task 15's verification stage, after the pledge screen ships.
  Cost if wrong: the 26 keep an unearned fee exemption for the remainder of this build (hours), during which they cannot acquire a new one and their bills remain intact and uncancelled.
- Task 3: re-review — finding ADDRESSED, reasons distinct, no new breakage.
- Task 3: complete (commits 538e28d..c669309, review clean after 1 fix round)
- Task 4: DONE, commit 2ce8206, migration committed and NOT applied per ruling.
- **CORRECTION to the earlier sequencing ruling's premise.** I wrote "the leak is already closed by Task 3". That is true only IN THE BRANCH. Task 3's guard is committed locally and NOT DEPLOYED, so the hole is still open in production. Task 4's implementer measured the population at **28, not 26**; controller confirmed independently — 28 leaked assignments, all `source='self'`, all since 2026-08-15, most recent **2026-08-18 09:21 UTC, i.e. DURING this build session**. Two more staff walked through the leak while we were fixing it.
  The ruling's ACTION is unchanged and still correct: do not apply the cleanup yet. Applying it now would not stop the leak (the guard is not deployed, so they would simply re-self-assign) and would strand them without a pledge screen. What changes is urgency: DEPLOYING this branch is now the time-critical step, not applying the migration. Must be surfaced to the user.
- Migration predicate uses `assigned_at >= '2026-08-15'`, not a hardcoded 26, so it correctly catches all 28 (and any further arrivals) when applied.
- Task 4: review SPEC ✅, QUALITY approved. Controller separately verified the reversibility hazard: the UPDATE is `where a.id in (select id from ..._backup_20260818)`, i.e. update scope == backup scope, so no row can be deactivated that was not first captured. Fully reversible.
- Task 4: minor (deferred): the migration's Verification comment block still says `-- expect 26`; the real population is 28. Must be corrected before the migration is applied, or a genuine discrepancy could be masked by a stale expectation. Fix during the Task 15 application stage.
- Task 4: complete (commits c669309..2ce8206, review clean, 1 deferred minor)
- Task 8: implementer DONE, commit 5011c64. proxy.test.ts 3/3, `next build` green with the route listed, R1 + R4 both applied. Awaiting review.
- RULING: Task 9 (pg_cron schedule) will also be WRITTEN AND COMMITTED BUT NOT APPLIED, same reasoning as Task 4. Scheduling a nightly job to GET /api/cron/incharge-month-verdict against the DEPLOYED app — which does not have that route yet — would only produce nightly 404s. Apply after this branch is deployed. Cost if wrong: no month-end job runs until someone applies the migration post-deploy; since the month-end verdict is the deliberate manual-first step anyway (see the spec's rollout rails), this costs nothing.
- Task 9: DONE, commit a85ab3b, committed NOT applied per ruling.
- Task 8: review SPEC ✅; QUALITY 1 Critical + 1 Important + 1 Minor. ALL THREE ARE PLAN DEFECTS (mine), not implementer deviations — the implementer transcribed the brief faithfully.
  * CRITICAL (controller VERIFIED): `generateStaffBill` never passes a status, so `buildStaffFeeBillRow` defaults to `'staff_deferred'` (lib/fees/staff-bill.ts:61). The fail path therefore creates a NON-payable bill while its own comment claims "both paths end in a payable bill" — walking straight back into the documented live blocker where mark-paid requires 'generated'. Second half: the route DISCARDS generateStaffBill's return, so an unbillable staffer (no_stop / no_structure / no_stop_rate / error) still loses their role and portal access, is told to pay, has no payable bill, and is counted in summary.billed. The EXISTING daily cron deliberately probes billability BEFORE revoking, commented "nobody loses their fee exemption without the bill that justifies it" — my month-end route dropped that guarantee.
  * IMPORTANT: the `tms_transport_year` lookup discards its `error`. On a query failure in enforce mode, `currentYear` is undefined, every staffer silently no-ops, and the run returns success:true with a clean-looking summary and nothing in errors/failures. Same fail-loud principle the brief applied to booking/attendance but did not extend here.
  * MINOR: shadow/dryRun `billAction` preview does not mirror the real gating, so the admin preview can OVERSTATE what an enforce run would do.
- RULING: fix all three, including the Minor. Normally a Minor would be deferred, but the spec's rollout rails make the shadow preview the evidence the user reads before flipping to `enforce` on a ~Rs 13 lakh decision. A preview that overstates is not a cosmetic defect in that context. Cost if wrong: one extra fix round on an otherwise-passing task.
- Task 8: fix round 1/5 — all three findings addressed, commit 9bbbb37. proxy.test.ts 3/3, next build green. Awaiting scoped re-review.
- Task 10: implementer `t10-access` DIED (API error) with only imports written (12 insertions). Partial reverted with `git checkout --`; nothing committed. Re-dispatching.
- Task 8 re-review: `t8-rereview` produced no file after two probes. Re-dispatching fresh.
- Task 10: retry implementer `t10-access-b` DONE, commit e374876. next build green, 18 tests pass across incharge-gate + access-state, all THREE return paths carry gate/outstandingAmount/probationThisMonth. Awaiting review.
- Task 8 re-review: second attempt (`t8-rereview-b`) also produced nothing. Third attempt dispatching on haiku with a minimal prompt.
- Task 10: review SPEC ✅, QUALITY approved, no findings. Fail-closed confirmed (loadStaffBillState's throw reaches the outer catch -> gate:'denied'), emailIlikePattern used, remainingServiceDays scoped to the staffer's own route.
- Task 10: complete (commits 9bbbb37..e374876, review clean)
- Task 8: re-review (3rd reviewer attempt, first to produce output) — Findings 2 and 3 ADDRESSED, **Finding 1 (Critical) NOT ADDRESSED**. Subtle residual hole, controller VERIFIED both premises:
  * `generateStaffBill` returns `billingStatus:'billed'` even when EVERY term insert hit 23505 and `inserted === 0` (lib/fees/staff-bill.ts — conflicts are deliberately treated as success).
  * The idempotency constraint is `tms_fee_bill_idem_unique (fee_structure_id, person_id, term_no, transport_year_id)` — **status is NOT a column in it** (supabase/migrations/20260613100000_create_tms_fee_structure.sql:105).
  Therefore: staffer PASSES an early month (bill -> 'cancelled'), FAILS a later month same term/year -> insert 23505s against the cancelled row -> generateStaffBill says 'billed' -> makeStaffBillsPayable promotes nothing (only touches 'staff_deferred') -> role revoked with no payable bill. -> fix round 2/5.
- Ruling: fix by asserting the INVARIANT rather than patching the case — after generate/promote, re-check via loadStaffBillState that an outstanding (uncancelled, unpaid) bill actually exists, and revoke only then. Covers this variant and any future one. Cost if wrong: one extra read per failing staffer per month-end run.
- Task 11: implementer DONE, commit 415ac3d. next build green with /api/boarding/incharge-pledge listed; probation->assignment->role ordering and the rollback intact; 23505 -> 409. Awaiting review.
- Task 11: review SPEC ✅, QUALITY approved (2 informational notes). Reviewer independently verified the 23505 rollback distinction is CORRECT (a staffer already assigned keeps their probation), the route is never client-supplied, and the window arithmetic is host-timezone-safe.
- Task 11: complete (commits e374876..415ac3d, review clean)
- Task 8: fix round 2/5 — commit c6ce73d. Invariant now asserted: after promote-or-generate the enforce path re-reads loadStaffBillState and requires hasOutstanding===true before deactivating or revoking. proxy.test.ts 3/3, next build green. Awaiting scoped re-review.
- Task 8: re-review round 2 — Critical ADDRESSED, blocked reason distinct, preview mirrors the blocked outcome, no new breakage.
- Task 8: complete (commits 2ce8206..c6ce73d, review clean after 2 fix rounds)
- FOR FINAL REVIEW: Task 12 reports it removed the now-unused `deriveBoardingAccess` import from app/boarding/layout.tsx. If that was its only call site, `lib/boarding/access-state.ts` is now dead code carrying live tests. The final whole-branch review should decide: delete it, or keep it as the documented non-fee access derivation. Do NOT delete it mid-plan — Task 6's gate deliberately did not replace it, and its tests are still green.
- Task 12: implementer DONE, commit d03bab5. next build green, 18 tests pass, R5 applied, 'choose' flow unchanged. Awaiting review.
- Task 12: review SPEC ✅, QUALITY approved. 'choose' flow confirmed byte-for-byte unchanged; hard nav used; no redirect loop; [Not OK] writes nothing server-side; amount degrades gracefully when zero.
- Task 12: minor (deferred): a 409 "already accepted" on the pledge POST leaves the user on the pledge screen instead of carrying them forward to /boarding/attendance, even though 409 means they ARE committed. Candidate follow-up, not required by the brief.
- Task 12: minor (deferred): `deriveBoardingAccess` in lib/boarding/access-state.ts now has ZERO live call sites (grep-verified) while its tests still pass — dead module with live tests. Decision deferred to the final branch review.
- Task 12: complete (commits c6ce73d..d03bab5, review clean, 2 deferred minors)
- Task 13: implementer DONE, commit 919b1f6, 4 files/364 insertions. next build green with all four routes listed, R2 escaping applied, existing enforcement board untouched. Awaiting review.
- Task 13: review SPEC ✅, QUALITY approved. Permission gating on both routes, R2 escaping applied, payment scoped to the resolved person's own current-year billIds with `.is('paid_at', null)`. Implementer caught a PLAN BUG: my brief's `ctx.params` code would have left `email` undefined on every call (withAuth forwards only `request`) — it parsed the path instead, matching vacate-requests/[id]/route.ts. Would have been Critical had it shipped as written.
- Task 13: Important finding RULED as deferred (plan-mandated, so mine to rule on): the "Mark bill paid" button stays visible after a successful payment, because VerdictRow.bill_action is a historical audit snapshot from tms_incharge_month_verdict, not derived live from tms_fee_bill.paid_at. Cache invalidation works mechanically but the refetched row is identical. A second click yields an accurate "Nothing outstanding for this staff member" error — the route fails closed, so there is no double-payment or overwrite risk. Fixing properly means exposing paid state through the verdict read route and hiding/disabling the action, which is real scope for a cosmetic gain. DEFERRED to the final review's triage. Cost if wrong: an admin clicks twice and sees a correct but unhelpful error.
- Task 13: complete (commits d03bab5..919b1f6, review clean, 1 deferred important)
- Task 14: implementer DONE, commit 4f978d2 (+30/-141). 43 tests on the pure modules pass, FULL SUITE 75 files / 821 tests PASS, next build green. No consumer of the dropped summary fields exists (board reads the strike TABLE, not this route's JSON). Awaiting review.

### Task 15 — partial verification (deployment-blocked)
Controller ran the checkable, read-only parts. Live state at end of build:
- tms_incharge_month_verdict: 0 rows | tms_incharge_probation: 0 rows -> our code has NOT run anywhere. Correct.
- cron.job 'tms-incharge-month-verdict': NOT scheduled. Correct (migration deliberately unapplied).
- tms_staff_route_assignment_backup_20260818: DOES NOT EXIST -> cleanup migration genuinely unapplied. Correct.
- Staff bills: 37 staff_deferred, 0 generated, 0 paid, **1 cancelled**.
- The 1 cancelled bill is Mr. A. Kumar (kumar.a@jkkn.ac.in), Rs 8,800, term 1, raised by the 2026-08-14 enforcement run. NOT cancelled by us (nothing deployed, no cron scheduled) and NOT a vacate request (0 decided today) — ordinary admin activity on a live system.
  **This is a live instance of the exact state behind Task 8's Critical bug**: a cancelled bill for a term that the idempotency index will 23505 against. If Kumar fails a future month, un-fixed code would revoke his role for a bill that cannot be made payable. The round-2 invariant fix (verify hasOutstanding before revoking) covers him.
- Active assignments now 108 (was 102 at session start) — the system is live and the leak plus normal self-assignment continue.
- Steps 2 and 4 of Task 15 (the dry run and the blast-radius report) CANNOT be done: they require the route to exist on the DEPLOYED app, and this branch is unpushed. They become post-deploy steps for the user.
- Task 14: review SPEC ✅; QUALITY Important — three inline comments still described revoke/bill behaviour the route no longer has, one ACTIVELY MISLEADING (claimed `quiet=1` "revokes and bills", which would mislead an operator deciding whether a replay bills people).
- Task 14: fix round 1/5 — commit d7291f7. All three comments rewritten, `wouldBill` dropped (always false, carried no information), and the carried-over deferred minor fixed too: the cleanup migration's verification block no longer hardcodes "expect 26" and instead tells the operator to re-run the pre-count immediately before applying. next build green.
- Task 14: re-review — all 4 fixes ADDRESSED, wouldBill removal clean, no new breakage.
- Task 14: complete (commits 919b1f6..d7291f7, review clean after 1 fix round)
- ALL 14 IMPLEMENTATION TASKS COMPLETE. Task 15 is verification-only and is deployment-blocked (see the Task 15 partial section above).

## Final whole-branch review (opus) — 4 Critical, 6 Important, 4 Minor
Full report: .superpowers/sdd/2026-08-18-incharge-monthly-verdict/final-review.md
Verified 75 files / 821 tests passing. Verdict: DO NOT MERGE AS-IS.

Three of four Criticals are SEAMS between tasks that each side got right in isolation —
exactly what per-task review cannot see:
- C1 SINGLE-USE SCHEME: cancelStaffBills has no term/month filter, so one passed month
  cancels the WHOLE YEAR's terms; the idempotency index (no `status` column) then blocks
  re-billing forever. Task 8's fix made the failure SAFE, not the feature WORKING.
  Contradicts spec decision 1 ("earned monthly, not assumed"). **PRODUCT DECISION — surfaced to user.**
- C2 SCHEDULE DECIDES EARLY: cron fires 28-31 but the route always evaluates the WHOLE
  month, so in enforce it settles the month on the 28th. Money/role effects are not idempotent.
- C3 PLEDGE ROUTE HAS NO SERVER GATE: /api/boarding/incharge-pledge never checks the bill,
  the gate, probationThisMonth or remainingServiceDays — must_pay is UI-only. A direct POST
  reopens the leak self-assign was hardened to close. Ruling R3 saw the bypass of
  maySelfAssign but NOT that it bypasses the whole gate. My R3 was too narrow.
- C4 CLEANUP MIGRATION EATS PLEDGERS: its predicate (is_active + source='self' +
  assigned_at>=08-15 + outstanding bill) matches EXACTLY a pledge-created assignment,
  because the bill is not cancelled until month end. My deferral ruling put application
  precisely in the window where pledges exist. Needs a `not exists (active probation)` clause.

Importants 5-10: stale cross-month probation passes people; shadow preview overstates
cancellations on the PASS path (fail path was fixed, pass path kept the bug); two mark-paid
routes with contradictory semantics (new one leaves status='generated' so the OLD route can
re-settle it, and paid_amount stays null); Monthly board unreachable (nothing links to it);
dual-assignment staff evaluated twice with order-dependent money; month-end job never writes
the strike table so the daily board goes permanently stale.
Minors 11-14: read path fails open where write path fails closed; no activity logging in the
verdict route; re-run downgrades the audit row; access-state.ts recommended for deletion.

CONFIRMED GOOD by the reviewer: the two crons genuinely cannot double-punish; fail-loud
discipline is consistent; 821 tests green; deploying the CODE alone is safe (assigned billed
staff short-circuit to in_duty) — the danger is only in APPLYING the migrations.

## Post-final-review decisions
- USER DECISION on C1: cancel ONLY the current term, keep later terms billable ("each month judged on its own, scheme stays armed all year").
- MEASURED CONSTRAINT the option did not anticipate: the live staff fee structure
  (1cff2da9, stop_wise, active) produces exactly ONE term — all 38 staff bills are
  `term_no = 1`, due 2026-08-31, and the flat-term table holds 0 rows. So "keep the rest"
  has nothing to keep: with today's configuration, cancelling term 1 still clears the year.
- RULING: implement the user's choice faithfully — scope cancellation to the term(s)
  belonging to the verdict month rather than the whole year — which makes the CODE
  month-aware and monthly-capable. With a single annual term the observable behaviour stays
  once-per-year until the transport office configures per-month terms; that is then a
  CONFIGURATION change, not a code change. Chosen over synthesising a per-month `term_no`
  because that would require modifying `lib/fees/staff-bill.ts`, which the shared fees
  module and the daily generation path both depend on.
  Cost if wrong: the scheme remains effectively annual until fee terms are reconfigured;
  the user must be told this plainly rather than believing month 2 is armed.
- RULING: the final-review fix wave is split into TWO file-disjoint sequential dispatches
  rather than the skill's single dispatch. Rationale: this session's subagent API has killed
  roughly half of all long-running dispatches, and a single 14-finding wave would very likely
  die with nothing committed. The skill's intent — avoid per-finding context rebuilding — is
  preserved by two coarse waves. Wave A = cron + migrations + cancel-staff-bill; Wave B =
  routes + UI + dead code. No file overlap, run sequentially.
- Fix wave A: DONE, commits b72a08c, de3b2d6, e79296f. All 10 findings addressed. vitest 75 files/824 tests PASS, next build green. Migrations still unapplied.
- Fix wave B: DONE, commits 99be1df, 8083b0b, 70162d9, 705119b, 4a67e16. All 5 findings addressed. vitest 74 files/818 tests PASS (-1 file/-6 tests = exactly the deleted access-state.test.ts), next build green.
- Scoped re-review of the whole fix wave (d7291f7..4a67e16) dispatched on opus.
