# Student transport vacate — request → transport-head approval → cancel the bill

**Date:** 2026-07-17
**Status:** Design approved, ready for an implementation plan
**Base:** `feat/transport-vacate`, branched off current `main` (local `main` is 1 unpushed docs commit ahead of `origin/main`, 0 behind — the "35 commits stale" memory predates the mid-July merges; verify with `git fetch && git rev-parse --short origin/main` before merging).

## Problem

MyJKKN bus-pass service-request learners surface in TMS. When a learner **cancels the service
request** in MyJKKN they are removed from the TMS passenger view — but their **transport fee bill is
left standing**. Nobody cancels it, so the learner keeps showing an outstanding (and eventually
overdue) transport balance for a bus they no longer use, and the payment gate keeps confining them
to `/student/fees` for a debt that should not exist.

There is today **no path** for a learner to say "I'm leaving the bus" and **no controlled way** to
cancel the leftover bill. The only bill-cancellation that exists is manual DB surgery.

## What we are building

A **student-initiated vacate flow** with a single approval step:

1. An eligible learner presses **"Request to vacate transport"** on `/student/fees`.
2. That creates one `pending` request and notifies the **transport head**.
3. The transport head **approves** (or rejects with a reason) from a new admin queue.
4. On approval, one atomic database function **cancels — never deletes** the learner's not-yet-paid
   **current-transport-year** term bills (status flip on both the ledger and the money row), clears
   their route/stop assignment, and notifies the learner.

"Cancel not delete" is literal: `billing_student_bills.status` and `tms_fee_bill.status` are set to
`'cancelled'`. `'cancelled'` is already a live convention on the money table (167 rows today), so no
enum is invented and every row stays queryable/auditable.

### Locked decisions

| Question | Choice |
|---|---|
| Who initiates | **Student self-service** |
| Which bills cancel | **Current transport year only** (`is_current = true`) |
| Which terms within that year | **Only unpaid / partial / overdue terms** — fully-paid terms stay `paid` |
| On approval, besides the bill | **Also clear `transport_route_id` / `transport_stop_id`** (drop off rosters/boarding/pass) |
| Eligibility | **Active `bus_required` learner with a non-cancelled current-year bill** |
| Reject path | **Reject with a required reason; learner may re-request** |
| Approval levels | **Single level — transport head only** (v1) |

### Explicitly out of scope

- **`bus_required` is never written by TMS.** It is MyJKKN-owned and read-only here. The learner
  "leaving the bus" is expressed in TMS by clearing the route/stop and cancelling the bill; the
  master flag stays MyJKKN's job (and its removal is what triggered the leftover-bill problem in the
  first place).
- **Staff vacate.** Staff carry no money rows (all 1,914 current-year `tms_fee_bill` rows are
  `person_type='learner'`; staff are `staff_deferred` with no `billing_student_bills` row). There is
  nothing to cancel, so vacate is a learners-only feature. Staff can be added when staff fees ship.
- **Un-approve / reverse.** `approved` is terminal in v1. A future admin "reverse a vacate" (re-open
  the bill, re-assign the route) can be added later without unwinding anything here.
- **Refunds.** Cancelling a *paid* term is deliberately avoided (we skip paid terms), so no refund
  logic is needed. Money already collected is left settled.

## Decisions & rationale

| Decision | Choice | Why |
|---|---|---|
| Approval vehicle | **A dedicated module** (`tms_transport_vacate_request` + `/vacate-requests`) mirroring Grievances | The workflow is a discrete approval with an audit trail and a reject-with-reason path. Grievances (complaint, no money authority) and Enrollment (direct allocation, no approval state) both mismatch; folding a money-cancel into either is surprising and risky. |
| The cancel operation | **One `SECURITY DEFINER` RPC**, not sequential route writes | Approval mutates four tables across two ownership planes (TMS-owned ledger + request; MyJKKN-owned money row + learner). A single transaction is the only way a money-cancel cannot half-apply. It also computes *which* terms in the same transaction, closing the TOCTOU window between "which bills" and "cancel them". |
| Double-approve guard | **Row-lock + status check inside the RPC** | The boarding one-time guard's documented race was check-then-act in app code. Here the check (`status='pending'`) and the flip happen under `FOR UPDATE` in one txn, so a second concurrent approver gets a clean 409, not a double-cancel. |
| Double-submit guard | **Partial unique index** `unique(learner_id) where status='pending'` | The database itself refuses a second open request; the route's pre-check is a nicety, the index is the authority. |
| Which terms | **Skip fully-paid** (`status='paid' OR balance_amount<=0`) | Real-world semantics: a learner who paid term 1 but leaves before term 2 stops owing term 2 and keeps term 1 settled. Cancelling paid money would distort collection reporting and imply a refund we are not doing. |
| Student UI home | **`/student/fees`** | The payment gate confines unpaid transport learners to exactly this page, so the button is reachable in both states (confined-unpaid and free-roaming-paid). After approval the bill clears and the gate lifts automatically. |
| Notifying the transport head | **`tms_users_with_permission('tms.vacate.manage')` → `notifyProfile`** | The notification system targets by *permission*, not role name — there is no `transport_head` target. Resolving the approve-permission holders reuses the existing fail-closed helper and needs no new plumbing. |

## Data model — one new table

`public.tms_transport_vacate_request`

| column | type | notes |
|---|---|---|
| `id` | uuid PK, `default gen_random_uuid()` | |
| `learner_id` | uuid NOT NULL | → `learners_profiles.id` |
| `profile_id` | uuid NULL | → `profiles.id`; denormalised so notify/inbox needs no re-lookup |
| `transport_year_id` | uuid NOT NULL | → `tms_transport_year.id`; the year snapshotted at request time |
| `route_id` | uuid NULL | → `tms_route.id`; assignment snapshot (audit; what was cleared) |
| `stop_id` | uuid NULL | → `tms_route_stop.id`; assignment snapshot |
| `status` | text NOT NULL `default 'pending'` | `check in ('pending','approved','rejected','withdrawn')` |
| `reason` | text NULL | learner's optional "why I'm leaving" |
| `decision_note` | text NULL | transport head's note — **required on reject** (enforced in the route) |
| `decided_by` | uuid NULL | → `profiles.id` |
| `decided_at` | timestamptz NULL | |
| `cancelled_bill_count` | integer NOT NULL `default 0` | audit: term bills cancelled by this approval |
| `created_at` | timestamptz NOT NULL `default now()` | |
| `updated_at` | timestamptz NOT NULL `default now()` | |

Indexes: `(learner_id)`, `(status)`, and the guard
`create unique index … on tms_transport_vacate_request (learner_id) where status = 'pending'`.

`withdrawn` is reserved for an optional learner self-cancel of a still-pending request; the v1 UI may
or may not expose it, but the enum admits it without a later migration.

## Permissions — two new keys

- `tms.vacate.view` — see the admin queue.
- `tms.vacate.manage` — approve/reject (the money authority).

A migration grants **both** to the `transport_head` role via the same additive jsonb-merge pattern as
`20260602000000_grant_tms_to_transport_head.sql`. `super_admin` bypasses via `isSuperAdmin`, exactly
like every other route. Students need **no** tms key — the student submit route is self-scoped.

Both keys are added to `lib/constants/tms-permissions.ts` (`VACATE_VIEW`, `VACATE_MANAGE`).

## The atomic approve — `tms_approve_transport_vacate`

```
public.tms_approve_transport_vacate(p_request_id uuid, p_approver uuid) returns jsonb
```

`SECURITY DEFINER`, one transaction:

1. `select … from tms_transport_vacate_request where id = p_request_id for update`.
   Not found → raise. `status <> 'pending'` → raise a distinguishable "not_pending" error (route → 409).
2. Select the learner's cancellable current-year terms:
   ```sql
   select fb.id as ledger_id, fb.billing_student_bill_id
   from tms_fee_bill fb
   join billing_student_bills bsb on bsb.id = fb.billing_student_bill_id
   where fb.person_id       = v_learner_id
     and fb.person_type     = 'learner'
     and fb.transport_year_id = v_transport_year_id
     and fb.status <> 'cancelled'
     and coalesce(lower(bsb.status), '') <> 'paid'
     and coalesce(bsb.balance_amount, bsb.final_amount) > 0
   ```
3. `update billing_student_bills set status='cancelled', … where id in (money ids)`.
4. `update tms_fee_bill set status='cancelled' where id in (ledger ids)`.
5. `update learners_profiles set transport_route_id=null, transport_stop_id=null where id=v_learner_id`.
6. `update tms_transport_vacate_request set status='approved', decided_by=p_approver,
   decided_at=now(), cancelled_bill_count=v_count, updated_at=now() where id=p_request_id`.
7. `return jsonb_build_object('ok', true, 'cancelled_bill_count', v_count)`.

The **route** is the security boundary (it calls this only after `requirePerm(tms.vacate.manage)`);
consistent with the whole service-role codebase, the RPC trusts its caller and focuses on atomicity.
`person_type='learner'` and the paid-skip predicate are the two facts verified against live data.

**Reject needs no RPC** — a single-table update in the route: `status='rejected'`,
`decision_note = <required note>`, `decided_by`, `decided_at`. Bills untouched.

## API routes

**Student — `app/api/student/vacate-request/route.ts`**
- `GET` → `{ eligible, request }`. `eligible` = caller's learner is `bus_required` + active +
  has a non-cancelled current-year `tms_fee_bill`. `request` = the learner's latest vacate request
  (so the UI can render pending/approved/rejected). Self-scoped: learner resolved from the session
  profile (`learners_profiles.profile_id = auth profile id`), never from the client.
- `POST` `{ reason? }` → create a `pending` request for the caller's own learner. Guards: eligible;
  no existing pending (the partial-unique also enforces → map `23505` to a clean 409). Snapshots
  `transport_year_id` / `route_id` / `stop_id`. Then notify approvers.

**Admin — `app/api/admin/vacate-requests/route.ts`**
- `GET` (requires `tms.vacate.view`) → list requests in **all** statuses (the stat cards need the full
  set; the status filter is applied client-side by the table) with learner name/route and an
  amount-to-cancel preview (sum of cancellable current-year terms). Chunk any `.in()` over 150 ids
  (`lib/fees/bills.ts` gateway-limit rule).

**Admin — `app/api/admin/vacate-requests/[id]/route.ts`**
- `PATCH` (requires `tms.vacate.manage`) `{ action:'approve'|'reject', note? }`.
  `approve` → call the RPC, then `notifyLearner` + `logActivity`. `reject` → require `note`, update,
  `notifyLearner` + `logActivity`.

## UI

**Student vacate card** (`components/student/vacate-transport-card.tsx`, rendered on
`app/student/fees/page.tsx`):
- Eligible + no open request → a "Leaving the bus?" card with a **Request to vacate** button
  (optional reason textarea, confirm).
- Pending → a "Request pending transport-head approval" state (submitted date, reason).
- Approved → "Approved — your current-year transport fees were cancelled and your route removed."
- Rejected → the decision note + "You may submit a new request."

**Admin queue** (`app/(admin)/vacate-requests/`): `page.tsx` (list shell + stats),
`columns.tsx` (advanced-data-table with status badges), and an inline decision panel (like the
Grievances panel) with **Approve** / **Reject** (reject requires a note). A nav entry in the admin
sidebar (`lib/navigation.ts`, alongside `/grievances` and `/enrollment-requests`) gated by
`tms.vacate.view`.

## Data flow

### Submit
1. Learner on `/student/fees` presses **Request to vacate** → `POST /api/student/vacate-request`.
2. Route resolves the learner from the session, re-checks eligibility, snapshots year/route/stop,
   inserts the `pending` row (partial-unique catches a racing duplicate → 409).
3. `notifyProfile` fan-out to `tms_users_with_permission('tms.vacate.manage')`
   ("New transport vacate request from <learner>", url `/vacate-requests`) + `logActivity`
   (module `transport-vacate`, action `submit`). **201**.

### Approve
1. Transport head opens `/vacate-requests`, selects the row, presses **Approve** →
   `PATCH …/[id] { action:'approve' }`.
2. `requirePerm(tms.vacate.manage)` → `rpc('tms_approve_transport_vacate', { p_request_id, p_approver: auth.userId })`.
3. RPC cancels the not-paid current-year terms (both planes), clears route/stop, flips to `approved`.
4. Route `notifyLearner` ("approved — fees cancelled, route removed", url `/student/fees`) +
   `logActivity` (action `approve`, `metadata.cancelled_bill_count`). **200**.
5. The learner's next `/student/fees` load shows no outstanding current-year terms → the overdue gate
   lifts on its own.

### Reject
1. **Reject** with a required note → `PATCH …/[id] { action:'reject', note }`.
2. Update row to `rejected` + note; bills untouched; `notifyLearner` (with the reason) + `logActivity`
   (action `reject`). The learner may submit again (the old row is no longer `pending`, so the
   partial-unique permits a new one). **200**.

## Failure handling (fail-closed)

- Student `GET`/`POST` resolve the learner **server-side**; a caller with no learner profile → the
  button never renders and `POST` 400s. No `learnerId` is ever accepted from the client.
- `POST` racing itself → `23505` on the partial-unique → 409 "You already have a pending request".
- Two approvers racing → the RPC's `FOR UPDATE` + `status='pending'` check → the loser gets a
  "not_pending" error → 409; exactly one cancel happens.
- Learner removed by MyJKKN (`bus_required` flipped false) between submit and approve → the RPC still
  cancels (bills are keyed by `person_id` + year, independent of `bus_required`) and the route-clear
  is a harmless no-op. Robust by construction.
- Only fully-paid current-year terms → approval cancels **0** bills (`cancelled_bill_count = 0`) and
  just clears the route/stop. Valid: leaving the bus is allowed even when paid up.
- Notifications are best-effort (`notify*` never throw into the caller); a notify failure never rolls
  back an approval.

## Change set

**Migrations (3 — applied live via Supabase MCP, each committed under `supabase/migrations/`)**

1. `20260717120000_create_tms_transport_vacate_request.sql` — the table + three indexes (incl. the
   partial-unique) + the RLS select policy.
2. `20260717120100_seed_tms_vacate_permissions.sql` — grants `tms.vacate.view` + `tms.vacate.manage`
   via an additive jsonb merge, data-driven off parent keys (view → `tms.dashboard.view`; manage →
   `tms.settings.manage`), matching the notification / driver-mobile seed convention.
4. `20260717130000_pin_vacate_perms_to_transport_head.sql` — **supersedes the rule in (2).** The
   parent-key rule was a *proxy* for the intent, not the intent: it resolved to exactly
   `transport_head` only by coincidence, and would have silently handed bill-cancelling power to any
   role later granted `tms.settings.manage`. The authorization rule is now explicit and enforced —
   **only two identities may approve/cancel a vacate**:
   - **`super_admin`** — via the code bypass (`proxy.ts:167`, `requirePerm`'s
     `if (auth.isSuperAdmin) return true`, and `usePermissions.can()`). Super admins hold no
     `custom_role`, so they need — and must not be given — a grant.
   - **`transport_head`** — the designated approver; granted explicitly by `role_key`.

   The migration also STRIPS the vacate keys from every other role (a no-op today; self-healing
   against future drift). Verified live: exactly one role holds the keys, and the approver set is
   12 super admins + 2 `transport_head` holders. (One of those holds `transport_head` alongside a
   primary `accounts` label — the `accounts` role itself grants nothing here.)
3. `20260717120200_fn_approve_transport_vacate.sql` — the `SECURITY DEFINER` RPC above, **plus two
   things discovered during implementation**:
   - **Widening the ledger's status CHECK.** `tms_fee_bill_status_check` admitted only
     `generated`/`staff_deferred`/`error` — the RPC's flip to `'cancelled'` violated it and failed
     outright. The check is now additively widened to admit `'cancelled'`. (Found by the rolled-back
     dry-run, before any production data was touched.)
   - **A stale-year guard.** The request snapshots `transport_year_id` at submit time; across a
     year rollover, approving a still-pending request would cancel the OLD year's bills while
     leaving the new year's standing. The RPC now raises `vacate_request_stale_year` (→ 409) when the
     snapshot is no longer `is_current`, and fails closed when no year is current.

**New**

- `lib/vacate/types.ts` — DTOs, status/eligibility shapes, **and the pure logic**
  (`isTermCancellable`, `isVacateEligible`, `sumAmountToCancel`). Kept free of server imports so both
  client components and vitest can import it.
- `lib/vacate/types.test.ts` — vitest over those pure functions (import relatively; the `@/` alias
  breaks vitest).
- `lib/vacate/requests.ts` — the I/O layer (`loadVacateRequests` for admin, `getLearnerVacateState`
  for student, the reject update). Fails CLOSED on its learner/route lookups: a partial queue would
  render every row as an unidentifiable "Unknown" on the screen where money gets cancelled.
- `components/student/vacate-transport-card.tsx` — the student card (also surfaces an inline error
  state, so a failed/blocked fetch is visible rather than an absent card).
- `app/api/student/vacate-request/route.ts` — GET + POST.
- `app/api/admin/vacate-requests/route.ts` — GET.
- `app/api/admin/vacate-requests/[id]/route.ts` — PATCH.
- `app/(admin)/vacate-requests/page.tsx`, `columns.tsx`, decision panel component.
- `components/student/vacate-transport-card.tsx`.

**Edited**

| File | Change |
|---|---|
| `lib/constants/tms-permissions.ts` | add `VACATE_VIEW`, `VACATE_MANAGE` |
| `lib/activity/log.ts` | extend the `ActivityModule` + `ActivityAction` unions (they are CLOSED unions — the API routes won't compile without this) |
| `app/student/fees/page.tsx` | render `<VacateTransportCard/>` |
| `lib/navigation.ts` | add the `/vacate-requests` admin-sidebar entry gated by `tms.vacate.view` |
| `app/(admin)/activity-log/columns.tsx` | register the `transport-vacate` module + `submit`/`approve`/`reject` actions |
| `proxy.ts` | exempt `/api/student/vacate-request` from the fee gate (see the note below — this was originally, and wrongly, declared unnecessary) |
| `lib/fees/bills.ts` + `app/(admin)/bill-management/{columns,page}.tsx` | **discovered gap:** `BillStatus` had no `'cancelled'`, and `loadTransportBills` has no status filter — so a cancelled bill rendered as **"overdue"** and inflated the overdue KPIs. Added a `'cancelled'` branch (`pending = 0`), the badge required by the exhaustive `Record<BillStatus,…>`, and a filter option. |
| `app/student/layout.tsx` | **discovered gap:** the student portal mounted no `<Toaster/>` (admin + driver both do), so the card's `toast.error` was invisible — a failed submit looked like a dead button. Mounted one, matching the driver portal. |

**`proxy.ts` — CHANGED (this section originally said "unchanged on purpose"; that was WRONG).**
The original reasoning — *"the gate lifts on its own once the bill is cancelled — no gate change
needed"* — considered only the POST-approval state and missed that the **request path itself sits
behind the gate**. `STUDENT_EXEMPT_WHEN_BLOCKED` did not include `/api/student/vacate-request`, so a
fee-gated learner (the exact population this feature exists for) loaded `/student/fees`, the card's
fetch 402'd, and the card rendered nothing — silently. Caught by the final whole-branch review, not
by any per-task review, because no task owned `proxy.ts`. It was invisible in testing (0 learners
overdue today) and scheduled to break for ~910 learners on 2026-09-01. **Fix:**
`/api/student/vacate-request` is now in `STUDENT_EXEMPT_WHEN_BLOCKED`; safe because the route is
self-scoped (learner from the session, never client input) and still area-gated by
`tms.passenger.self.view` — only the *fee* gate is bypassed.

**Unchanged on purpose:** `learners_profiles` / `staff` / `billing_student_bills` schemas (we only
write allowed columns) and the generate route (this is its inverse, kept separate — note its
`billedKey` has no status filter, so a cancelled ledger row still occupies its `person:term` slot
and re-running the same structure will NOT resurrect a cancelled bill).

## Testing

- **vitest** on `lib/vacate/types.ts` pure functions: eligibility (bus_required×active×has-bill
  truth table), cancellable-term selection (paid skipped, partial/overdue/unpaid included,
  already-cancelled excluded), and the amount-to-cancel preview sum.
- **tsc filtered to changed files** — the repo carries pre-existing `never` errors and
  `next.config` ignores build errors, so an unfiltered run proves nothing. (ESLint is broken.)
- **Live RPC dry-run via Supabase MCP** in a transaction that is rolled back (or against a throwaway
  request row): confirm `tms_approve_transport_vacate` cancels exactly the not-paid current-year
  terms on both planes, clears the route/stop, and returns the count — against the real schema.
- **curl probes:** `/vacate-requests` → 307 unauthenticated; the API routes → 401/403 without a
  session/permission.
- **User smoke test (required — cannot be done headless; the agent's Chrome is unauthenticated).**
  An eligible learner opens `/student/fees` → sees the card → requests vacate. The transport head sees
  the row in `/vacate-requests` → approves. Verify: the learner's current-year bill shows `cancelled`
  in Bill Management, the route/stop are cleared, and the learner regains full-portal access.

## Follow-ups (not this feature)

- **Confirmation before Approve (TOP follow-up).** Approve is irreversible by design (`approved` is
  terminal; un-approve is out of scope) yet fires from a single click on both the row menu and the
  panel — a misclick permanently cancels a learner's bills. A shared `ConfirmDialog` already exists in
  this codebase, so this is cheap. Deliberately NOT done here because it wasn't in the approved
  design; raised for the owner's decision.
- **Non-blocking nits found by review:** `totalBilledAmount` in `lib/fees/bills.ts` still counts
  cancelled bills (pending/overdue correctly exclude them) — confirm whether that's the intended
  historical "billed" figure; `entityLabel` passes a raw learner UUID into the activity log's
  human-readable label; the admin queue's amount preview uses a LEFT-join while the RPC uses an
  INNER-join, so a ledger row with no money row could overstate the preview (0 such rows exist
  today); `loadVacateRequests` resolves terms serially per row; `tms_transport_year` has no partial
  unique index on `is_current` (the submit path fails closed first via `.maybeSingle()`).
- **Staff vacate** — arrives with staff transport fees; the learners-only RPC filter (`person_type
  = 'learner'`) is the seam.
- **Admin "reverse a vacate"** — re-open the bill + re-assign; deliberately deferred while `approved`
  is terminal.
- **Learner self-withdraw of a pending request** — the `withdrawn` status already exists in the enum;
  wire a button if it turns out to matter.
