# Student Portal Payment Gate — Design & Implementation Plan

**Date:** 2026-06-13
**Status:** Awaiting approval
**Depends on:** the Fees Structure module (`tms_fee_bill` ledger, commit `51e4d53`)

---

## 1. Goal

Gate the learner portal (`/student/*`) by transport-fee payment status. A learner who is **behind** on their current transport year's term bills is confined to a **My Transport Fees** page (+ Grievances + Sign out) until they clear the overdue amount. A learner who is current (or has no bills yet) gets full portal access.

## 2. Confirmed decisions

1. **Gating rule = "not behind".** Block iff, for the **current transport year**, the learner has ≥1 term whose `due_date` has passed and is not fully paid. Terms not yet due never block.
2. **While blocked, reachable:** `/student/fees` (the fees page), `/student/grievances`, Sign out, and `/api/student/transport-access`. Everything else redirects to `/student/fees`.
3. **No bill = allowed.** No generated bill (or bills with nothing overdue yet) → full access.
4. **Enforcement = `proxy.ts`** (hard server gate) + the `/student/fees` page UI.

## 3. Gating logic (exact)

For the learner resolved by `profile_id` = session user id:
- Not a learner row, or `bus_required = false` → **allowed** (`no_transport_obligation`).
- No `is_current` transport year → **allowed** (`no_current_transport_year`).
- Else load their `tms_fee_bill` rows (`person_type='learner'`, `status='generated'`, current year) joined to `billing_student_bills`:
  - **overdue term** = `due_date < current_date AND status IN ('unpaid','partially_paid','overdue')` (excludes `paid`, `cancelled`, `superseded`).
  - **allowed = (overdue term count == 0)**.

Status source: `billing_student_bills.status`, updated when **MyJKKN billing records a receipt** (no online self-pay in v1 — the fees page tells the learner to pay at the office / contact admin). Evaluated by `due_date` directly so it doesn't depend on the `mark_overdue_bills()` cron having run.

## 4. Components

### 4.1 RPC `tms_student_transport_access(p_profile_id uuid) → jsonb` (SECURITY DEFINER)
Single source of truth (must be `SECURITY DEFINER` — proxy's user-scoped client can't read the RLS-deny tables). Returns:
```json
{ "allowed": true,
  "reason": "current|no_bills|no_transport_obligation|no_current_transport_year|overdue",
  "transport_year_id": "…", "transport_year_name": "2026 - 2027",
  "overdue_count": 0, "total_owed": 0,
  "terms": [ { "term_no": 1, "amount": 3000, "due_date": "2026-07-31",
               "status": "unpaid", "paid": false, "overdue": true } ] }
```
`grant execute … to authenticated`. Migration: `…_create_tms_student_transport_access_rpc.sql`.

### 4.2 `proxy.ts` — step 5b (after the area gate)
```
if (!is_super_admin && area === 'student'):
  exempt = pathname in {/student/fees, /student/grievances, /api/student/transport-access} (or sub-paths)
  if not exempt:
    access = rpc('tms_student_transport_access', { p_profile_id: profile.id })
    if access.allowed === false:
      isApi  → 402 { error: 'Transport fees overdue', reason: 'fees_overdue' }
      page   → redirect /student/fees
```
(Lift `const area = resolveArea(pathname)` so steps 5 and 5b share it.)

### 4.3 `/api/student/transport-access` (withAuth)
Calls the RPC with `auth.userId`; returns `{ success: true, data: <jsonb> }`. Consumed by the fees page (and the optional layout banner).

### 4.4 `/student/fees` page (`app/student/fees/page.tsx`, client)
"My Transport Fees": transport year, a term table (term · amount · due date · status badge paid/unpaid/overdue), totals (billed / paid / owed). If `allowed === false`, a prominent red banner: "Portal access is restricted until your overdue transport fees are cleared. Please pay at the transport office." Refresh button. If allowed, a normal status view (+ link back to dashboard). Renders inside the existing `StudentLayout`.

### 4.5 Student nav + layout
- `lib/student/navigation.ts`: add `{ name: 'Transport Fees', href: '/student/fees', icon: Receipt }`.
- `app/student/layout.tsx` (optional polish): fetch access once; if blocked, show a thin red "Fees overdue — view details" banner linking to `/student/fees`. (Proxy is the actual wall; this is just signposting so nav clicks that bounce make sense.)

## 5. Out of scope / preserved

- No online payment (v1 view-only, matches `tms.passenger.payment.view`). Payment is recorded in MyJKKN billing.
- No new permission key (gate layers on the existing `tms.passenger.self.view`).
- Staff portal/gating — N/A (staff aren't billed in v1).
- Grace period — none (a term blocks the day after its `due_date`). Easily tunable later (`<` → `<=`, or subtract N days).

## 6. Build order

1. Migration: create the RPC (apply + commit).
2. `/api/student/transport-access` route.
3. `proxy.ts` step 5b.
4. `/student/fees` page.
5. Student nav entry (+ optional layout banner).
6. Verify: `tsc`; RPC unit-check via SQL against a blocked vs current learner (using a temporary `tms_fee_bill` + overdue `billing_student_bills` row in a rolled-back transaction); proxy redirect probe.

## 7. Edge cases handled

| Case | Result |
|---|---|
| Not a learner / not bus_required | allowed |
| No current transport year | allowed |
| No bills generated | allowed |
| Bills exist, none past due | allowed |
| A past-due term unpaid/partially-paid | **blocked** → `/student/fees` |
| Term due *today* | not yet blocking (blocks next day) |
| Cancelled / superseded bill | not counted as owed |
| Super admin | bypasses (existing proxy behavior) |
