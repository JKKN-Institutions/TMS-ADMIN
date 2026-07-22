# Automatic Transport Bill Generation — Design

**Date:** 2026-07-22
**Status:** Approved (design review in chat)
**Replaces:** the manual-only trigger for fee generation. Manual generation stays; this adds an automatic path.

## Problem

Transport bills are generated only when an admin opens a fee structure and clicks
Generate. A learner who becomes bus-required (admitted via MyJKKN, flagged
bus_required, active lifecycle) stays unbilled until someone remembers to re-run
generation. The user wants: any student onboarded into the transport population is
billed automatically per the applicable fee structure's conditions.

## Decisions (made with the user)

1. **Trigger = population membership, not route allocation.** A learner is auto-billed
   when they satisfy the same condition manual generation uses today: `bus_required`
   + matching `institution_ids` + matching `lifecycle_statuses`. Route allocation is
   irrelevant (manual generation has never required it). Mechanism: a daily sweep, not
   an event hook — it catches every onboarding path (MyJKKN admission, TMS enrollment,
   imports) with zero coupling.
2. **Scope = every `status='active'` structure whose transport year `is_current`.**
   No per-structure flag. Admins already use `status` to mean "in force"; deactivate a
   structure to stop its billing.
3. **Kill switch = one global Settings toggle, default OFF.** Enabling is a deliberate
   admin action. Rationale: 5 structures are active on the current year today,
   including one named "Testing" — default-ON would have that structure issuing real
   bills to its whole applicable population on night one.

## Architecture

### 1. Engine extraction — `lib/fees/generate.ts` (refactor, zero behavior change)

The full generation engine currently lives inside
`app/api/admin/fees/[id]/generate/route.ts` (~574 lines: flat/tiered/stop_wise term
resolution, in-charge exemption, idempotency ledger, conflict detection, run
recording, bill insertion). Extract it as:

```ts
export interface GenerateOptions {
  mode: 'dry_run' | 'generate';
  triggeredBy: string | null;   // auth.userId for manual; null for auto
  autoPolicy?: boolean;         // enables the two auto-only deviations below
}
export async function generateForStructure(
  svc: SupabaseClient,
  fs: FeeStructureRow,          // the full structure row, already loaded
  opts: GenerateOptions
): Promise<GenerateOutcome>     // the same preview/summary shapes the route returns today
```

Auth-bound pieces stay in the route: permission check (`tms.fees.generate`),
`feeIdFromPath`, `logActivity`, HTTP response shaping. `auth.userId` becomes
`opts.triggeredBy` (flows to `tms_fee_generation_run.triggered_by` and
`billing_student_bills.created_by` — both verified nullable). The run-note wording the
code pins byte-for-byte moves unchanged.

The manual route becomes a thin wrapper. Its request/response contract does not
change at all.

### 2. Cron — `app/api/cron/auto-generate-bills/route.ts` + `lib/fees/auto-generate.ts`

Mirrors the `booking-reminders` cron pattern exactly:

- `vercel.json` cron entry: `"30 21 * * *"` UTC = **03:00 IST daily** (quiet hours;
  after any day's data entry).
- GET route guarded by `Authorization: Bearer $CRON_SECRET`; `export const dynamic =
  'force-dynamic'`.
- `?dryRun=1` runs the engine in `dry_run` mode per structure and reports what WOULD
  generate — auth still required.
- Core logic in `lib/fees/auto-generate.ts` → `runAutoGeneration(svc, { dryRun })`:
  1. `loadFeesConfig(svc)` → toggle off ⇒ `{ skipped: 'autoGenerateBills is off' }`,
     touch nothing. **Exception: `dryRun` bypasses the toggle** — a dry run writes
     nothing, and the whole point of previewing is to see what WOULD happen before
     enabling; requiring the toggle first would invert the safe rollout order
     (preview → enable), forcing enable → 03:00 IST live run → preview.
  2. Resolve the `is_current` transport year. None ⇒ `{ skipped: 'no current
     transport year' }` (same fail-safe posture as the payment gate).
  3. Load `tms_fee_structure` where `status='active'` and `transport_year_id` = that
     year.
  4. For each, call `generateForStructure(svc, fs, { mode, triggeredBy: null,
     autoPolicy: true })`. A structure whose run throws is caught, reported in the
     summary, and does not abort the others.
  5. Return `{ year, structures: [{ id, name, learnerBilled, staffDeferred, skipped,
     conflictSkipped, unresolved, errors, runId | null }] }`.

### 3. Auto-only policy deviations (`autoPolicy: true`)

- **Conflict skip.** Manual generation surfaces cross-structure conflicts in dry-run
  and lets the human decide; it never blocks. Auto has no human: any person already
  holding a `tms_fee_bill` row for the same transport year under a DIFFERENT
  structure is **skipped** and counted as `conflictSkipped`. This prevents the
  currently-live overlap (e.g. "Testing" vs "Transport Fees 2026-2027") from
  double-billing anyone on night one. Manual generation is unchanged and can still
  bill them deliberately.
- **No empty runs.** When `toGeneratePairs === 0`, auto returns before inserting a
  `tms_fee_generation_run` row. Manual keeps inserting a run every time (its current
  behavior); without this, 5 structures × nightly = ~150 no-op rows a month drowning
  the run history.

Runs created by auto have `triggered_by NULL` — the convention that distinguishes
them from manual runs (which always carry a user id). Note: no admin UI currently
displays generation runs; `tms_fee_generation_run` is a backend audit ledger, so
NULL-means-auto is a data convention, not a rendering concern.

### 4. Settings toggle — `autoGenerateBills`, default OFF

*(Amended after code inspection: `autoNotifyPassengers` — the "stored the same way"
model — actually lives INSIDE the `setting_type='scheduling'` blob, and the whole
settings pipeline (GET/POST route, `toBlobShape`, both tab UIs) round-trips that one
blob. A separate `setting_type='fees'` would need a second pipeline for one boolean.)*

- `autoGenerateBills: boolean` becomes a fifth field of the existing scheduling blob.
  Added to: `SchedulingConfig` + `DEFAULT_SCHEDULING_CONFIG` (false) +
  `parseSchedulingConfig` in `lib/settings/scheduling.ts`; the blob-shape
  `SchedulingSettings` + `defaultSchedulingSettings` in `lib/scheduling-config.ts`;
  `SchedulingSettingsData` + `toBlobShape` in `app/api/admin/settings/route.ts`; and
  the `SchedulingBlob` interface in `components/admin/notifications-settings.tsx`.
  **Every carrier of the blob must round-trip the field** — a writer that drops it
  would silently turn auto-billing off on an unrelated save (fail-safe direction,
  but still a bug). Vitest on the parser (existing `lib/settings/scheduling.test.ts`).
- The cron reads it via the existing `loadSchedulingConfig(svc)` — no new loader.
- Settings UI: a toggle card on the **Scheduling tab** (which owns the blob form and
  its save button), NOT the Notifications tab — bill generation is not a
  notification. Helper text warns that every ACTIVE current-year structure will
  generate and to deactivate test structures first.
- Persistence goes through the existing `/api/admin/settings` POST; no new API
  surface.

## Out of scope (explicit)

- No learner notification on auto-billed rows (manual doesn't notify either; the
  student fees page + payment gate surface the bill). Easy follow-up.
- Staff structures keep producing `staff_deferred` coverage rows only — no real staff
  bills (unchanged Phase-2 gap).
- No per-structure auto flag; no event hooks in enrollment/route-optimization paths.
- No change to manual generate/dry-run behavior or response shapes.

## Failure modes & safety

| Risk | Mitigation |
|---|---|
| Test/abandoned structure bills real people | Toggle default OFF + warning text; conflict skip; deactivating a structure stops it |
| Double billing across overlapping structures | Auto conflict-skip (deviation 1) |
| Re-run duplicates | Existing idempotency: `billedKey` + unique(fee_structure_id, person_id, term_no, transport_year_id) |
| Partial failure mid-run | Engine already counts `errors` and marks the run `partial`; per-structure try/catch keeps one bad structure from aborting the sweep |
| No current transport year | Sweep reports skipped, generates nothing |
| Cron fires without secret | 401 before any work |
| Refactor drifts manual behavior | Extraction is mechanical (move + parameterize `auth.userId`); manual route contract unchanged; full suite + a dry-run comparison against pre-refactor counts |

## Verification plan

1. Vitest: `parseSchedulingConfig` (autoGenerateBills cases) (defaults, malformed blobs, explicit true/false).
2. Full suite + `npm run build` green after the extraction, before the cron lands.
3. Manual dry-run per structure returns identical counts before/after the refactor
   (compare against SQL replication).
4. Cron `?dryRun=1` (works regardless of the toggle) ⇒ per-structure counts match
   the manual dry-runs, minus conflict-skipped people (verified in SQL). A LIVE cron
   call with the toggle OFF ⇒ skipped, zero writes.
5. Real generation is NOT triggered as part of verification — the toggle ships OFF
   and stays OFF until the admin flips it.
