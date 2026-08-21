# In-charge attendance shares — design

**Date:** 2026-08-21
**Status:** approved, not yet implemented
**Supersedes the coverage rule in:** `2026-08-12-incharge-attendance-enforcement-design.md`, `2026-08-18-incharge-monthly-verdict-design.md`

## Problem

Attendance duty is currently scored at the level of the **route**, not the person.

`app/api/cron/incharge-attendance/route.ts` decides whether an in-charge performed their duty by counting `tms_attendance` rows filtered only by `route_id` and `trip_date`. There is no per-staff dimension. One mark by one person credits every in-charge on that route for that day. `lib/boarding/incharge-month.ts` documents this as deliberate — "first mark wins… crediting only the person who marked would fail the colleagues who opened the app second" — and the month-end verdict inherits the same rule.

The consequence the transport office actually sees: on a route with fourteen in-charges, one person marks and the other thirteen are excused. Everybody's roster shows the same undifferentiated list of every student on the bus, so no in-charge has any share they can be held to.

The requirement is that **every** in-charge must mark attendance, for a defined subset of the route's passengers that belongs to them, with a way to hand that subset over when they are absent, and an automatic fee bill for anyone who leaves their subset unmarked.

## Measured starting position (2026-08-21, production DB)

| Fact | Value |
| --- | --- |
| Active in-charge assignments | 109 across 22 routes |
| In-charges whose boarding stop lies on their assigned route | 107 / 109 |
| Heaviest concentration | route 29 — 14 in-charges, 48 students, 21 stops |
| | route 16 — 14 in-charges, 42 students, 30 stops |
| Thinnest coverage | route 24 — 1 in-charge, 67 students; route 49 — 1 in-charge, 35 students |
| Routes carrying students with **zero** in-charges | 37 (74 students), 13 (63), 10 (13) |
| Students with no `transport_stop_id` | 9 system-wide |

One measurement decided the algorithm: **route 29's fourteen in-charges share only four distinct boarding stops.** Any rule of the form "you mark the students at your own stop" leaves ten of those fourteen owning nothing.

## Decisions

| Question | Decision |
| --- | --- |
| Split rule | Contiguous bands over the **ordered student list**, balanced by count |
| Split basis | All allocated learners; recomputed on change, not on a schedule |
| Absence | Self-declared, with a nominated covering colleague |
| Billing trigger | The existing month-end verdict, scored per share |
| Uncovered routes | Left uncovered and flagged on an admin board; nobody is billed |
| Marking outside your share | Whole bus visible, only your share markable |
| Rollout | Ships dormant behind an `admin_settings` flag, default off |
| Absence nobody covers | Absentee excused; the share goes unmarked and is flagged |

### Deferred decisions

These two are recorded so they can be overturned before Phase 4 goes live. Until then the conservative default holds.

1. **The zero-miss rule is unchanged.** `evaluateMonth` requires every service day in the window to be marked. This design changes *whose* marks count, and — as a consequence — *which* days are required of each person. Per-share scoring is **not** uniformly stricter: it narrows credit to your own students, but the same move narrows your denominator to the days your own students actually travelled, and an empty duty counts as covered. Measured by dry run against production it fails FEWER people than the route rule (July 104 vs 112, August 109 vs 112) — though on a different set of people. A threshold (say 90% of duty days) is a fee-policy change and is out of scope here.
2. **Under-staffed routes are flagged, not exempted.** Route 24's single in-charge owns all 67 of its students and will fail a zero-miss month almost by construction. The coverage board surfaces this so the office can assign more in-charges; no automatic billing exemption is granted.

## Architecture

Four units, each independently testable.

### 1. The split — `lib/boarding/share-split.ts` (pure)

```
splitRouteShare({
  students: Array<{ learner_id, stop_id, stop_sequence, roll }>,
  inCharges: Array<{ assignment_id, staff_email, stop_sequence }>,
  pinned: Array<{ learner_id, assignment_id }>,
}) -> Array<{ assignment_id, learner_ids: string[] }>
```

1. Credit every `pinned` learner to its pinned owner and remove it from the pool.
2. Order the remaining students by `(stop_sequence, roll)`. Students with no stop go to a side bucket.
3. Order the in-charges by their own boarding stop's `stop_sequence`, tie-broken by `staff_email`. In-charges with no stop on the route sort last. The tie-break is what makes the whole function deterministic — the same inputs must always produce the same split, or a recompute would silently reshuffle everybody's students.
4. Cut the ordered student list into N contiguous chunks of `floor(total / N)`, with the remainder distributed one each across the earliest chunks. Hand chunk *i* to in-charge *i*.
5. Assign each stop-less student to the currently least-loaded in-charge; ties go to the earliest.

Cutting the **student** list rather than the **stop** list is the load-bearing choice. Cutting stops fails on route 29 (14 in-charges, 4 staff stops) and on any route with fewer stops than in-charges. Cutting students yields contiguous, physically coherent bands — you mark the people boarding around you — while guaranteeing near-equal counts. A band boundary may fall inside a single busy stop; that is accepted and necessary.

If `students < inCharges` the tail in-charges receive empty shares. An empty share means **no duty**, and is reported on the coverage board rather than quietly excusing someone.

Expected shape: route 29 → 14 shares of 3–4; route 24 → one share of 67.

### 2. Coverage — `lib/boarding/share-coverage.ts` (pure)

```
shareDuty({ shareLearnerIds, bookedLearnerIds }) -> string[]
shareCovered({ duty, markedLearnerIds }) -> { required, marked, missing[], covered }
```

- **Duty** for a date is `share ∩ riders who booked that date`. The attendance roster lists every allocated learner including "Without ticket" ones, and `POST /api/boarding/attendance` refuses to mark those. Scoring an in-charge on students the API will not let them mark would make the rule impossible to satisfy.
- **Covered** means every learner in the duty set has a `tms_attendance` row for that date. Present and absent both count — absent is a mark.
- An empty duty set is neither credit nor blame, matching the existing `no_travel_day` outcome.
- A declared absence excuses the absentee for that date. If a colleague accepted the cover, the duty transfers to that colleague **for that date only**.

### 3. Ownership storage

```sql
create table tms_incharge_roster_allocation (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references tms_route(id) on delete cascade,
  assignment_id uuid not null references tms_staff_route_assignment(id) on delete cascade,
  staff_email   text not null,
  learner_id    uuid not null references learners_profiles(id) on delete cascade,
  is_manual     boolean not null default false,
  allocated_at  timestamptz not null default now(),
  allocated_by  uuid,
  unique (learner_id)
);
create index on tms_incharge_roster_allocation (assignment_id);
create index on tms_incharge_roster_allocation (route_id);
```

`unique (learner_id)` — not `(route_id, learner_id)` — because a learner belongs to exactly one route, and the stronger constraint makes a double-owned student representable only as a database error rather than as silent double-billing.

```sql
create table tms_incharge_absence (
  id                     uuid primary key default gen_random_uuid(),
  assignment_id          uuid not null references tms_staff_route_assignment(id) on delete cascade,
  staff_email            text not null,
  route_id               uuid not null references tms_route(id) on delete cascade,
  absence_date           date not null,
  reason                 text,
  covering_assignment_id uuid references tms_staff_route_assignment(id),
  cover_status           text not null default 'pending'
                         check (cover_status in ('pending','accepted','declined','uncovered')),
  declared_at            timestamptz not null default now(),
  responded_at           timestamptz,
  unique (assignment_id, absence_date)
);
```

### 4. Recompute

`recomputeRouteAllocation(svc, routeId, actorId)` reads the route's students, in-charges and pinned rows, calls `splitRouteShare`, and replaces the route's allocation rows in one transaction. Callers:

- `app/api/admin/staff-route-assignments/route.ts` — on create and on deactivate
- the passenger update path — when a learner's `transport_route_id` or `transport_stop_id` changes (both the old and the new route are recomputed)
- an admin **Rebalance** button on the route allocation screen
- a nightly reconcile job that repairs drift from writes that bypassed the hooks

There is deliberately **no scheduled rebalance**. A stable share is what lets an in-charge learn who their students are.

## Interface changes

### `GET /api/boarding/attendance/roster`

Each row gains `owner_email`, `owner_name`, `is_mine`, `can_mark`. The response gains share-level counts (`share_total`, `share_marked`, `share_remaining`) alongside the existing route-level counts.

### `POST /api/boarding/attendance`

Gains a share check, active only when the rollout flag is on: each learner must be in the caller's own share, or in a share delegated to them by an accepted absence for that date. A rejected learner returns the reason code `not_your_share` together with the owner's name — a bare 403 gives the in-charge nothing to act on.

Super admins bypass the share check, as they already bypass the assignment check.

### New endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/boarding/absence` | Declare absence for a date, optionally nominating a cover |
| `POST /api/boarding/absence/[id]/respond` | Accept or decline a cover request |
| `GET /api/boarding/absence` | My absences and the cover requests addressed to me |
| `GET /api/admin/routes/[routeId]/allocation` | View the split |
| `POST /api/admin/routes/[routeId]/allocation` | Rebalance, or pin a learner to an in-charge |
| `GET /api/admin/incharge-coverage` | Coverage board data |

### UI

- `/boarding/attendance` — defaults to a **My share** filter over the full-bus roster; tiles become My share / Marked / Remaining; an Owner column names whoever owns each other row; Present/Absent are disabled with an explanatory tooltip outside your share; an **I am absent today** action opens the absence dialog.
- `/boarding/in-charge` — a panel for your declared absences and any cover requests waiting on you.
- Admin **Coverage** board — routes with unowned students, in-charges holding empty shares, and today's unmarked shares grouped by owner.

## Scoring changes

`app/api/cron/incharge-attendance/route.ts` replaces its route-level `tms_attendance` count with per-assignment duty coverage, and skips any date the staffer declared absent.

`app/api/cron/incharge-month-verdict/route.ts` keeps its role as the **sole authority over money and roles**. Only its coverage input changes:

- service days for a staffer = dates on which their duty set was non-empty, minus excused absences
- marked days = dates on which their duty was fully covered
- a failing verdict follows the existing `generateStaffBill` path, unchanged

No new billing path is introduced. That is the point: the daily loop warns, the verdict decides, and nobody is punished twice for the same missed day.

## Rollout

A single `admin_settings` flag, `inchargeShareScoringEnabled`, read through `loadSchedulingConfig`, **default false**. While false, both crons apply the current route-level rule and the mark API keeps today's behaviour. The tables, the split, the share-scoped roster and the absence flow all ship and can be inspected with no billing consequence.

**Blast radius.** The month verdict's file header records that under the current zero-miss rule a live run bills all 102 in-charges roughly ₹13 lakh. Per-share scoring does **not** widen that: measured by dry run against production it fails *fewer* people (July 104 vs 112 under the route rule, August 109 vs 112), because narrowing credit to your own students also narrows your denominator to the days those students travelled, and `shareCovered` treats an empty duty as covered. The safety argument is unchanged, and is not built on the direction of that number: two independent flags must both be on before any money moves, and the first live run must be a human pressing a button. "Fewer in aggregate" is not "nobody new" — per-share moves individuals in both directions, so the *set* of people billed changes even where the count falls.

## Error handling

- A failed query must never read as "nobody marked" — the existing cron already throws per staffer rather than defaulting to a miss, and the per-share query inherits that rule. Billing someone for an infrastructure failure is the worst available outcome.
- `.in()` filters over learner ids are chunked to 150, following `lib/booking/roster.ts`. A route's share is far below that, but the coverage board queries across all 22 routes at once.
- Staff identity is resolved through `resolveStaffId` (`lib/identity/staff-lookup.ts`), never a hand-rolled email match: only 75 of the 109 assignments resolve via `staff.email`, while 108 resolve via `institution_email`.
- A missing allocation row for a learner is a coverage gap, not an error: the learner is unowned, appears on the coverage board, and is nobody's duty.

## Testing

Pure functions carry the logic, so the tests are pure too. Vitest files live under `lib/` (the project's `@/*` alias resolves there).

`lib/boarding/share-split.test.ts`

- route 29's shape: 14 in-charges over 4 distinct staff stops → 14 non-empty shares
- fewer stops than in-charges
- fewer students than in-charges → trailing empty shares, no crash
- stop-less students land with the least-loaded in-charge
- pinned learners survive a recompute and are excluded from the balanced pool
- determinism: identical inputs in a shuffled order produce an identical split

`lib/boarding/share-coverage.test.ts`

- duty is the intersection with the day's bookings, not the whole share
- absent counts as marked
- empty duty is neither credit nor blame
- an accepted cover moves the duty for exactly one date
- a declined or unanswered cover leaves the absentee excused and the share unmarked

Verification beyond unit tests is `npm run build` plus a browser smoke test on `/boarding/attendance`. Per this project's history, localhost API probes prove nothing (the proxy 401s before routing), and `tsc` is chronically red on main for unrelated reasons.

## Build order

| Phase | Contents | Behaviour change |
| --- | --- | --- |
| 1 | Migration, `share-split` + tests, `recomputeRouteAllocation`, recompute hooks, one-off backfill | none — dormant |
| 2 | Share-scoped roster fields, mark-authority check | flag-gated |
| 3 | Absence declaration, cover accept/decline, portal panels | additive |
| 4 | Per-share scoring in both crons, admin coverage board | flag-gated |
