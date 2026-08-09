# Multi-Staff Route Attendance → Billing — Design

**Date:** 2026-07-24
**Module:** Boarding (in-charge attendance cron) × Fees (`generateStaffBill`, stop-wise pricing)
**Status:** Approved — implementation not started
**Depends on / extends:**
- `2026-07-20-incharge-attendance-fee-enforcement-design.md` (the strike cron)
- `2026-07-21-staff-incharge-transport-fee-enforcement-design.md` (this closes its **P6** and the stop-wise billing half of its policy)

## The two conditions (from the user, confirmed)

A route may have **many** boarding staff (in-charges). The behaviour must be:

1. **One mark covers all.** When several boarding staff share a route, if **any one** of them marks
   that route's attendance for the day, **none** of them is struck — every in-charge on the route
   keeps the transport-fee exemption for that day.
2. **Nobody marks → all billed.** If the route's attendance is **not** marked (by anyone) for the
   required number of consecutive travel days, **every** boarding staff on that bus loses the
   in-charge role **and each is issued a transport-fee bill**.

## Current state (verified against the live DB, 2026-07-24)

| Fact | Value |
|---|---|
| Routes with multiple active in-charges | **Route 24 "MECHERI"** (3 staff), **Route 18 "GANAPATHIPALAYAM"** (2 staff) |
| Total active in-charge assignments | 6 (across 3 routes) |
| Strike rows ever written (`tms_incharge_attendance_strike`) | **0** — the cron has never removed or billed anyone |
| Staff bills ever written (`tms_fee_bill` where `person_type='staff'`) | **0** |
| Active staff fee structure | "Transport Fees 2026-2027 (Staff - All Colleges)" — **`fee_mode='stop_wise'`, 455 stop rates, 0 flat terms** |
| `REMOVAL_THRESHOLD` (`lib/boarding/incharge-attendance.ts`) | **2** |
| Cron schedule (`vercel.json`) | `/api/cron/incharge-attendance` at `30 15 * * *` UTC = 21:00 IST |
| Local `main` vs `origin/main` | **13 commits ahead** (unpushed nightly auto-generation work; the generation engine now lives in `lib/fees/generate.ts`) |

Route 24's last attendance mark was **2026-07-20**; it has had booked riders and zero marks since,
so it is the live worst case for Condition 2.

## What already works — and must not regress

**Condition 1 is already correctly implemented.** `app/api/cron/incharge-attendance/route.ts:104-115`
computes `attendanceMarked` at the **route level**:

```ts
const { count } = await svc
  .from('tms_attendance')
  .select('id', { count: 'exact', head: true })
  .eq('route_id', a.route_id)
  .eq('trip_date', date);
attendanceMarked = (count ?? 0) > 0;
```

It does **not** filter on `scanned_by`. The cron then loops over **every active assignment
independently** (`for (const a of assignments)`), and each assignment on a marked route independently
sees `attendanceMarked = true` → `evaluateDay` returns `reset`. So one staffer's mark — or an admin's,
or a QR scan — clears the strike for **all** in-charges on that route. This is the desired behaviour;
**it is preserved, not changed.** Change 3 below locks it with a test so a future refactor can't
silently make the check per-person.

**The removal half of Condition 2 already works.** Because the loop is per-assignment, when a route is
unmarked on a travel day, *every* assignment on it accrues a miss, and at threshold *every* one is
revoked (`is_active=false` + `maybeRevokeBoardingRole`). No change needed there.

## The gap — the billing half of Condition 2 is broken

On removal the cron bills via `generateStaffBill(svc, { staffId, transportYearId })`
(`app/api/cron/incharge-attendance/route.ts:184-196` → `lib/fees/staff-bill.ts:65-125`). That function
resolves the active staff structure, then reads its instalment terms from **`tms_fee_structure_term`
with `.is('year_band_id', null)`** — i.e. **flat terms only**:

```ts
const { data: terms } = await svc
  .from('tms_fee_structure_term')
  .select('term_no, amount, due_date')
  .eq('fee_structure_id', match.id)
  .is('year_band_id', null)
  .order('term_no');
if (!terms?.length) return { billingStatus: 'no_structure', inserted: 0 };
```

The live staff structure is **`stop_wise`**, which by design has **zero** `tms_fee_structure_term`
rows — its schedule lives in `tms_fee_structure_stop_term` (shares) and rates in
`tms_fee_structure_stop_rate`. So `generateStaffBill` hits `!terms?.length` and returns
**`'no_structure'`** → **no bill is written.**

**User-visible consequence today:** a removed staffer's `removalCopy` notification falls into its
*else* branch — "Please contact the transport office regarding your transport fees" — instead of
"A transport fee bill has been generated for you," and no ledger row exists. Condition 2 is
half-satisfied (role removed) but its billing promise is silently unmet.

## Design

Three surgical changes. **No new tables, no schema migration, no UI, no new permission.**

### Change 1 — Teach `generateStaffBill` to price stop-wise *(the core fix)*

Make `generateStaffBill` (`lib/fees/staff-bill.ts`) branch on the matched structure's `fee_mode`,
reusing the **already-shared, already-tested** pure primitive `resolvePersonTerms`
(`lib/fees/resolve-terms.ts`) — the *same* function the cohort generator in `lib/fees/generate.ts`
uses. This guarantees a removed staffer's bill equals, to the rupee, what a `Generate` run would have
charged them.

New shape (pseudocode; exact code in the implementation plan):

```
select the active staff structure that applies to this staffer (unchanged)

if fee_mode in ('flat','tiered'):
    existing flat-term path, unchanged

if fee_mode == 'stop_wise':
    stopTerms      = load tms_fee_structure_stop_term (schedule of shares)  → if empty: 'no_structure'
    stopRateByStop = load tms_fee_structure_stop_rate  (stop → annual_amount) → if empty: 'no_structure'
    stopId         = staff.transport_stop_id for this staffId
    outcome        = resolvePersonTerms(
                        { admission_year: null, transport_stop_id: stopId },
                        { feeMode: 'stop_wise', currentYear: null, flatTerms: [], bands: [],
                          stopTerms, stopRateByStopId })
    if !outcome.ok:  // reason ∈ { no_stop, no_stop_rate }
        return 'no_structure'   // NOT billed — see "Never bill ₹0" below
    for each term in outcome.terms:
        insert buildStaffFeeBillRow({ ..., term })   // 23505 → already billed, not an error
    return 'billed'
```

- **Row shape and idempotency are unchanged.** Rows are still written by `buildStaffFeeBillRow`
  (`person_type='staff'`, `status='staff_deferred'`, `billing_student_bill_id=null`), still guarded by
  the unique index `tms_fee_bill_idem_unique (fee_structure_id, person_id, term_no, transport_year_id)`.
  A re-fired cron changes nothing.
- **"Never bill a missing rate as ₹0" is preserved by construction.** `resolvePersonTerms` returns
  `{ ok:false, reason:'no_stop' | 'no_stop_rate' }` for a staffer with no boarding stop or an unpriced
  stop, and a configured rate of **0** is a real value that *is* billed (it checks `annual === undefined`,
  not falsiness). We map an unresolved outcome to a non-`billed` `billingStatus` so the strike row's
  `billing_status` stays honest and the transport office follows up — we never fabricate a ₹0 charge.
  This is the same rule that surfaced the real "COLLEGE terminus stop" data error in the 07-21 spec.
- **The `no_stop_rate` empty-schedule throw is a non-issue here:** the caller loads the schedule first
  and returns `'no_structure'` if it is empty, so `resolvePersonTerms` is only ever called with a
  non-empty `stopTerms`.

**Blast radius:** one function. The cron route calling it is unchanged; `revoke-then-bill` ordering,
the reachability guard (no `profiles` row → skip revoke+bill), and the dry-run path all stay as they
are. The cohort `Generate` route does not call `generateStaffBill` and is untouched.

### Change 2 — `REMOVAL_THRESHOLD` 2 → 3 *(approved spec P6)*

Change the single constant in `lib/boarding/incharge-attendance.ts`:

```ts
export const REMOVAL_THRESHOLD = 3; // was 2
```

Resulting behaviour: 1 miss = warn, 2 misses = warn, **3 consecutive misses = remove + bill**.
`warningCopy` and `removalCopy` already interpolate the constant, so their text updates itself.
Non-travel days (Sundays, holidays, empty rosters) still neither strike nor forgive — the streak
pauses. This also widens the safety margin before any first-ever removal can fire.

### Change 3 — Lock Condition 1 with a test *(guardrail, no runtime change)*

Add unit coverage asserting the route-level semantics explicitly, so the "any one marks → all covered"
contract can't be refactored away unnoticed:

- Given a route with N active assignments and `attendanceMarked = true`, **every** assignment's
  `evaluateDay` returns `reset` (consecutive misses → 0).
- Given a travel day (booked riders) with `attendanceMarked = false`, **every** assignment accrues a
  miss, and the Nth consecutive miss returns `remove`.

`evaluateDay` is already pure (`lib/boarding/incharge-attendance.ts`), so this is table-driven and
needs no DB or Supabase stub.

## Non-goals (explicit)

- **Making staff bills payable.** They remain ledger-only (`staff_deferred`,
  `billing_student_bill_id = null`). `billing_student_bills.student_id` has a NOT NULL FK to
  `learners_profiles` that structurally rejects staff ids; collection stays offline. The two
  `PHASE 2 SEAM (staff fees)` no-ops (`proxy.ts`, `self-assign/route.ts`) stay inert.
- **Spec P7 — late opt-in cancels bills.** A staffer who becomes an active in-charge again should have
  their current-year unpaid staff bills flipped to `cancelled` (transport-vacate RPC pattern). This is
  adjacent but **not** part of the two conditions above. Deferred to a follow-up. *(User-confirmed.)*
- **Changing `resolveApplicablePeople`** (`lib/fees/applicability.ts`) — shared with this very cron.
- **Per-person attendance crediting.** Condition 1 is explicitly route-level; we are not attributing
  "who marked" for exemption purposes.
- **Auto-assigning in-charges** to routes that have none.

## Risks & edge cases

- **First-ever real removals will fire once this ships.** Route 24 (3 staff) and Route 18 (2 staff)
  have unmarked travel days accruing now. With threshold 3 and a nightly cadence, the earliest any
  removal can fire is three consecutive marked-absent travel days after the strike ledger starts
  populating — inspect via `?dryRun=1` **before** the first armed run.
- **Email/id join hazard (inherited).** Assignments key on `staff_email`; bills key on `staff.id`. The
  cron already resolves `staffId` from `staff` by `ilike(email)` before calling `generateStaffBill`, so
  this fix does not add a new join — but any lookup it introduces must lowercase both sides.
- **A staffer with a bad/missing boarding stop is not billed** (returns non-`billed`). That is correct
  (never a ₹0 charge) but means the transport office must reconcile them manually; the strike row's
  `billing_status` and the `removalCopy` "contact the office" branch make this visible.
- **`no_structure` overloading.** Both "no active staff structure" and "staffer has no priced stop"
  currently map to `billingStatus='no_structure'`. Acceptable for v1 (both mean "not billed, follow up
  manually"); a finer-grained status is a possible later refinement, not required here.

## Verification

`npm run lint` crashes (circular config) and full `tsc` is chronically red without gating
`next build`; neither is a regression gate.

1. `npx vitest run` — new tests: (a) `generateStaffBill` stop-wise branch prices a staffer at their
   stop's annual rate split across the share schedule; (b) a staffer with no stop / unpriced stop
   returns a non-`billed` status and writes **zero** rows; (c) the Condition-1 lock (reset-all /
   miss-all); (d) `REMOVAL_THRESHOLD === 3` reflected in `evaluateDay` (2 misses = warn, 3 = remove).
   Existing `resolve-terms` characterization tests must stay green (flat/tiered unchanged).
2. Path-scoped `npx tsc --noEmit` filtered to the changed files → zero lines.
3. **`GET /api/cron/incharge-attendance?dryRun=1`** (with `CRON_SECRET`) → the `plan[]` shows Route 24
   and Route 18 staff as `warn`/`remove` with `wouldBill: true`; writes nothing.
4. Post-fix targeted check on the live/staging DB: for a would-be-removed staffer, confirm the
   computed bill total equals their `tms_fee_structure_stop_rate.annual_amount` for their
   `transport_stop_id`, split by the `tms_fee_structure_stop_term` shares — i.e. identical to what
   `Generate` would produce.
