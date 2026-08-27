# Boarding Attendance — Share Scope + Mark Ownership Composition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose two ownership models that were built independently on the same code paths — `main`'s per-share allocation (whose *job* is this learner?) and PR #14's first-mark-wins (who owns this *row*?) — into one authority, without losing either.

**Supersedes the merge strategy in:** `docs/superpowers/plans/2026-07-29-boarding-attendance-mark-ownership.md` (PR #14). That plan's tasks remain valid in isolation; this one governs how they land on today's `main`.

**Architecture:** Two gates in series, not a primary and a fallback.

- **Gate A — scope.** May this actor touch this *learner* at all? Per-learner, behind `inchargeShareScoringEnabled`. Owned learner → owner + accepted covers + `tms.attendance.override` + super admin. Unowned learner → anyone assigned to the route (the fallback). A QR scan, and the row's own author, are always in scope.
- **Gate B — arbitration.** May this actor overwrite an *existing mark*? PR #14's `decideMark`, unchanged in logic, applied after Gate A passes. Ships **unconditionally** — it is independent of the shares rollout.

`tms_attendance` keeps exactly one row per `(learner_id, trip_date, direction)`. That never changes.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role writes, `withAuth` + `user_has_permission` RPC), TanStack Query, TailwindCSS, vitest.

## Measured baseline (production, 2026-08-27)

Re-measure before quoting these. PR #14's body figures were four weeks stale by the time it was reviewed.

| Fact | Value |
|---|---|
| Bus-required learners on a route | 1,594 |
| Owned by a share | 1,416 |
| **Unowned (the Gate A fallback population)** | **178 (11%)** |
| — on the 2 routes with no active in-charge | 89 |
| — on allocated routes (allocation drift) | 89 |
| Attendance rows on unowned learners | 54 |
| `tms_attendance` rows | 4,210 |
| Active route assignments | 112 |
| `inchargeShareScoringEnabled` | unset → `false` (Gate A dormant) |
| Absence rows / accepted covers / manual pins | 0 / 0 / 0 |

## Locked design decisions

1. **Owner trumps coverer.** An accepted coverer gets Gate A scope but may NOT flip the owner's existing mark. The owner MAY flip a coverer's. Cover transfers duty, not authority over data already written. Implemented as an `isLearnerOwner` input to `decideMark`.
2. **Gate B unconditional, Gate A behind the flag.** PR B below delivers attribution, polling, the audit trail and fail-closed reads without waiting on the shares rollout decision. Flipping the flag later is a pure tightening.
3. **The row's own author is always in scope.** Without this, a mid-day `recomputeRouteAllocation` (delete-then-insert, triggered by the assignment API, enrollment approve/reject, the Rebalance button and the nightly reconcile) deadlocks a marked learner: the new owner is in Gate A but is not `scanned_by`; the old owner is `scanned_by` but has left Gate A. Nobody but `transport_head` could fix it.
4. **Atomicity lands first, in its own PR.** Both gates are advisory until the write is atomic.

## Global Constraints

- **The unique key `(learner_id, trip_date, direction)` is NEVER changed.** Any task adding a staff dimension to it is wrong.
- **Authority is decided server-side.** `can_edit` on a roster row is a rendering hint. A client that ignores it and POSTs anyway must still be denied.
- **Never treat a failed Supabase read as an empty result.** `main`'s roster route currently destructures `const { data: attData } =` with no error check — a failed read renders as an empty roster inviting staff to re-mark everyone. Fixing that is in scope.
- **`.in()` filters chunk to <=150 ids.** The gateway 400s on large filters and the failure is silent.
- **Error precedence: Gate A before Gate B.** Scope failure is `403 not_your_share` naming the owner; arbitration failure is `409 locked`. Scope first — more actionable, and it leaks less.
- **Test command:** `npx vitest run <path>` for one file, `npm test` for all. `npm run lint` is broken (circular config) — do not run it. `npm run type-check` is chronically red on `main` for unrelated reasons and is **not** a gate; verify with `npx next build`.
- **Migrations** are applied with `mcp__supabase__apply_migration` against project `kvizhngldtiuufknvehv` **and** committed as `.sql` under `supabase/migrations/`.
- **Commit trailer** on every commit:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

# PR A — Make the mark write atomic

Independent of everything below. Nothing in PR B or C is trustworthy without it: today's guard is read-then-`upsert` with nothing held between, so two staff tapping the same learner within a second both read "unmarked", both write, and the second silently overwrites the first — recording `previous_status: null`, so the audit trail asserts nothing was overwritten.

- [ ] **A1. Trigger migration.** `BEFORE INSERT OR UPDATE` on `tms_attendance`: when a row already exists and `NEW.scanned_by IS DISTINCT FROM OLD.scanned_by`, reject unless the write carries an explicit override marker. Carrier options: a `SET LOCAL` GUC read via `current_setting(..., true)`, or a dedicated column set by the routes on the override/scan paths. Prefer the GUC — less invasive, no schema surface.
- [ ] **A2. Collapse read-then-upsert** into one statement in both write paths (manual POST and QR scan): conditional `UPDATE ... WHERE scanned_by = :actor OR scanned_by IS NULL`, falling back to `INSERT` on zero rows affected. **Ship with A1** — the trigger fires on the existing scanner the moment it lands.
- [ ] **A3. Verify with SQL, no browser needed.** Two concurrent writes to the same `(learner_id, trip_date, direction)` with different `scanned_by`: assert exactly one lands, and that `previous_status` is non-null iff an override marker was present. Then confirm the 4,210 existing rows still update normally through the scanner path.

**Risk:** the trigger affects every future write to a table with 4,210 live rows, including `main`'s scanner as it runs today. A1 and A2 are one deploy.

---

# PR B — Rebase PR #14, Gate B only

The branch is 14 commits; `main` is 221 ahead of the merge base. Eight files conflict.

- [ ] **B1. Rebase onto `origin/main`.** In `lib/booking/roster.ts`, the roster route and the attendance route, **take `main` wholesale and re-apply PR #14's additions on top.** Do not hand-merge hunk by hunk: `main` changed the roster's spine from `loadBookedRoster` to `loadRouteAttendanceRoster` (the whole allocated bus, not just bookings), and hunk-merging is how that gets silently reverted.
- [ ] **B2. `lib/boarding/attendance-ownership.ts`.** Add `isLearnerOwner` to `MarkInputFacts`, wired as `false` at every call site until PR C. Rewrite the `if (!existing)` comment — "deliberately unrestricted" becomes false once Gate A exists; it is now "unrestricted *within scope*". Fix the dangling reference to `lib/boarding/incharge-attendance.ts` in the file header — PR #23 deleted that file.
- [ ] **B3. `lib/booking/roster.ts`.** One merged 5th parameter carrying `main`'s `ownership?` and PR #14's viewer fields. `RosterRow` gains `marked_by_name` + `previous_*`; **drop `marked_by_id`** (the POST path already strips the raw `profiles.id`, so shipping it on the GET contradicts that). Collapse `is_mine` + `can_edit` into a single `can_edit` plus `lock_reason: 'not_my_share' | 'locked' | 'no_ticket' | 'window_closed' | null`. Two independent booleans for "can I press this button" is exactly the drift PR #14 set out to prevent.
- [ ] **B4. Roster route.** `main`'s spine (hoisted per-caller queries, chunked `.in()`, the caller-profile error check) plus PR #14's `previous_*` select, `loadMarkerNames`, the `attErr` 500, and the all-routes widening for override holders. **Chunk the `.in('learner_id', ...)` reads at 150** to match `loadMarkerNames` and `allocation-repo.ts`.
- [ ] **B5. Attendance route.** Keep `main`'s IST `authDate` / UTC `today` split **and its comment** — a subtle, correct fix. Layer in Gate B: existing-read → `decideMark` → `409 locked`. Same for `clearMarks` via `canClearMark`. Add an upper bound of today to the `date` parameter.
- [ ] **B6. `columns.tsx`.** Merge the In-charge column (`main`) with Marked-by/Locked (PR #14), rendering off `lock_reason`. Drop `role="status"` from the Locked badge — it is a live region on a 15s-polled screen.
- [ ] **B7. `page.tsx`.** Keep the 15s polling and `refetchOnWindowFocus`. Handle `409`.
- [ ] **B8. Verify.** Re-measure the vitest baseline (the 486/486 figure is stale), `npx next build`, then the six-step smoke test from the PR #14 body on route 16 inside the 7:00–9:30 window. **The smoke test requires a human browser** — the agent's Chrome is unauthenticated.
- [ ] **B9. Rewrite the PR description** with the current numbers from the baseline table above.

## What PR B keeps from #14, and what it drops

**Keep — valuable and independent of the ownership question:**

- The `previous_*` columns and migration (already applied and verified in production).
- `tms.attendance.override` and its pinning migration. Under this design it matters *more*: it is the single key unlocking both gates. Verified — exactly one role holds it, `transport_head`.
- `loadMarkerNames`, `marked_by_name`, the CSV "Marked By" column. `main`'s `owner_name` answers who *should* mark; this answers who *did*. Both are wanted.
- The QR-scan override (absent → present as physical proof). Under the composed design it is also the escape hatch that keeps scanning working when a non-owner scans.
- 15s polling + focus refetch. The most user-visible fix in the PR, and `main`'s roster still has no refetch at all.
- The scan `noop` / "already marked present by X" response, so a re-scan does not reassign credit.
- Fail-closed reads (`attErr` → 500).
- `canClearMark` on the DELETE path.
- Override-holder exemptions from the route-assignment and time-window gates — without them the correction path is unreachable.

**Drop or rework:**

- `can_edit` as PR #14 computes it → `inScope && decideMark(...) !== 'deny'` (PR C).
- PR #14's required `viewer` 5th param → merged parameter (B3).
- PR #14's roster route calling `loadBookedRoster` → `loadRouteAttendanceRoster` (B1).
- `main`'s caller-wide `null` escape hatch in `markableLearnerIds` → per-learner (PR C).
- `marked_by_id` on the roster GET.

---

# PR C — Gate A composition, behind the flag

- [ ] **C1. New pure `lib/boarding/mark-scope.ts` + tests.** Per-learner, not per-caller. Takes `(learnerId, ownerAssignmentId | null, myAssignmentId, coveredAssignmentIds, existingScannedBy, actorId, isOverrideHolder, isSuperAdmin, viaScan, flagEnabled)`. Pure keeps it unit-testable and lets the roster and the write path share one authority. **Must include the "actor is the row's `scanned_by` is always in scope" clause** (locked decision 3).
- [ ] **C2. Replace `markableLearnerIds`' caller-wide `null`** with the per-learner scope map in both POST and DELETE. Today `return ids.size > 0 ? ids : null` and `if (!myAssignmentId) return null` mean an in-charge with an empty share may mark *anyone* on the route, including learners another in-charge owns — an unowned-learner problem solved with an all-learners exemption. Gate A → Gate B, scope error first.
- [ ] **C3. Wire `isLearnerOwner`** through so the owner can override a coverer's mark but not vice versa. With 0 absences and 0 accepted covers in production this branch is untraveled — ship it with unit tests only.
- [ ] **C4. Roster `can_edit`** = `inScope && decideMark(...) !== 'deny'`, single authority, populating `lock_reason`.
- [ ] **C5. Verify with unit tests only.** The flag stays `false`, so production behaviour is unchanged and there is nothing to smoke-test until rollout is decided.

---

# Tracked separately — not in any PR above

- **2 routes, 89 bus-required learners, no active in-charge.** `getAssignedRouteIdsForUser` returns nothing for them, so they are invisible to the boarding screen entirely. Pre-existing; needs an assignment decision, not code. Do not absorb into "unowned".
- **54 existing marks on unowned learners.** Harmless under this design (they fall to the fallback path), but worth re-checking when allocation next recomputes.
- **The UI gate follow-up from PR #14:** both clients hardcode `canMark = isToday && legOpen` and never send `date`, so `transport_head`'s past-day/post-window exemption stays unreachable from the product even after PR B.
- **Pre-existing UTC/IST split on the stored `trip_date`.** `main` deliberately moved only the *authorization* date to IST and left the stored date on UTC, shared with the scanner. Between 00:00 and 05:30 IST the manual and scan paths still write different rows. Out of scope here; changing which date a mark lands on is dangerous and deserves its own change.
