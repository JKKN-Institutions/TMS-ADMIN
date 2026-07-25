# Bookings & Attendance Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/bookings/analytics` page with two tabs (Bookings, Attendance) sharing one advanced filter bar, backed by a single new API endpoint over the live `tms_booking` and `tms_attendance` tables.

**Architecture:** All aggregation lives in pure, dependency-free modules under `lib/booking/` (no Supabase client, no ambient `Date`) so it is unit-testable with vitest. One `withAuth` GET endpoint fetches by date range only, resolves learner/label dimensions with chunked `.in()` calls, then filters and aggregates in memory. The UI extends the existing validated `app/(admin)/_viz/kit.tsx` design system rather than introducing a second chart aesthetic.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, recharts 2.15, @tanstack/react-query 5, Radix DropdownMenu, lucide-react, vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-25-bookings-attendance-analytics-design.md`

## Global Constraints

- **`tms_booking` live schema is 6 columns only:** `learner_id`, `travel_date`, `route_id`, `stop_id`, `booked_at`, `booked_by`. There is **no `id`** and **no `status`** column. Never `select('id')` and never filter on `status` for this table.
- **`tms_attendance` date column is `trip_date`**, not `travel_date`.
- **Chunk every `.in()` at 150 ids** and check `error` before reading `data`. An unchecked destructure turns a gateway HTTP 400 into a silent empty result.
- **Missing table (`42P01`) degrades to empty, never 500.**
- **Permission:** `TMS_PERMISSIONS.BOOKINGS_VIEW` (`tms.bookings.view`) for the whole page and endpoint.
- **Pure modules take no ambient `Date`** — any "now" is a parameter. Matches `lib/booking/window.ts`.
- **vitest only collects `lib/**/*.test.ts`** (see `vitest.config.ts`). Tests must live under `lib/`.
- **Verification is `npm test` + `npm run build`**, not `tsc` and not `npm run lint`. The repo's typecheck is chronically red on main and is not a build gate (`ignoreBuildErrors: true`); `npm run lint` crashes on a circular config.
- **Design system:** reuse `app/(admin)/_viz/kit.tsx`. Do NOT introduce new fonts or a new brand hue. One accent (`--viz-accent`) for nominal-category magnitude bars; the reserved `--viz-good`/`--viz-warning`/`--viz-serious`/`--viz-critical` scale only for status meaning; `--viz-context` for baseline series.
- **Accessibility (CRITICAL, non-negotiable):** every interactive element gets `focus-visible:ring-2`; never `outline-none` without a replacement. Every control has a `<label>` or `aria-label`. Semantic `<button>`, never `<div role="button">`. Async result counts announce via `aria-live="polite"`.
- **Interaction:** `cursor-pointer` on every clickable element; transitions 150–300ms; respect `prefers-reduced-motion`.
- **Colour is never the only indicator** — status is always paired with an icon or a text label.
- **Dark mode:** use the app's semantic tokens (`border-border`, `bg-card`, `text-foreground`, `text-muted-foreground`, `hover:bg-muted`), which already flip on `.dark`. Do not hand-roll `bg-white`/`text-gray-700` pairs.
- **No horizontal page scroll.** Wide tables scroll inside their own `overflow-x-auto` container.

---

## File Structure

The spec named a single `lib/booking/analytics.ts`. That file would own types, dimension
helpers, filters, facets, and two aggregators — too many responsibilities. It is split by
responsibility with a barrel re-export, so the spec's single import path still holds.

| File | Responsibility |
| --- | --- |
| `lib/booking/analytics-types.ts` | Row, filter and response shapes. No logic. |
| `lib/booking/analytics-dims.ts` | Pure dimension helpers: date math, lead-time buckets, weekday, booked-by, percentage. |
| `lib/booking/analytics-filters.ts` | Filter predicates + facet extraction. |
| `lib/booking/analytics-bookings.ts` | Bookings-tab aggregation. |
| `lib/booking/analytics-attendance.ts` | Booked↔boarded join, coverage, attendance aggregation. |
| `lib/booking/analytics.ts` | Barrel re-export. |
| `app/api/admin/bookings/analytics/route.ts` | Auth, fetch, wire the pure modules together. |
| `app/(admin)/bookings/analytics/controls.tsx` | Reusable UI primitives: MultiSelect, chips, tabs, callout. |
| `app/(admin)/bookings/analytics/filter-bar.tsx` | The filter bar + URL sync. |
| `app/(admin)/bookings/analytics/bookings-tab.tsx` | Tab A charts. |
| `app/(admin)/bookings/analytics/attendance-tab.tsx` | Tab B charts. |
| `app/(admin)/bookings/analytics/page.tsx` | Page shell: fetch, filters, tabs. |
| `app/(admin)/bookings/page.tsx` | **Modify** — add the Analytics link. |

---

### Task 1: Dimension helpers

**Files:**
- Create: `lib/booking/analytics-types.ts`
- Create: `lib/booking/analytics-dims.ts`
- Test: `lib/booking/analytics-dims.test.ts`

**Interfaces:**
- Consumes: `istToday` from `lib/booking/window.ts`.
- Produces: types `BookingRow`, `AttendanceRow`, `LearnerDim`, `LabelMap`, `Labels`, `AnalyticsFilters`, `EMPTY_FILTERS`, `FacetOption`, `StopFacetOption`, `Facets`, `CountRow`, `ShowRow`, `LeadBucket`, `BookingsBlock`, `AttendanceBlock`; functions `daysBetween(a,b): number`, `istDateOf(iso): string`, `leadTimeBucket(days): LeadBucket`, `leadDays(bookedAt, travelDate): number`, `weekdayOf(date): number`, `bookedByLabel(bookedBy, profileId): BookedByKind`, `pct(part, whole): number`; constants `LEAD_BUCKETS`, `WEEKDAY_LABELS`.

- [ ] **Step 1: Create the types module**

```typescript
// lib/booking/analytics-types.ts
/**
 * Shared shapes for the Bookings & Attendance analytics endpoint.
 * Types only — no logic, no imports with side effects.
 */

/** A tms_booking row. The LIVE table has no `id` and no `status` column. */
export interface BookingRow {
  learner_id: string;
  travel_date: string; // 'YYYY-MM-DD'
  route_id: string;
  stop_id: string | null;
  booked_at: string; // ISO timestamptz
  booked_by: string | null;
}

/** A tms_attendance row. The date column is `trip_date`, NOT `travel_date`. */
export interface AttendanceRow {
  learner_id: string;
  trip_date: string; // 'YYYY-MM-DD'
  route_id: string | null;
  stop_id: string | null;
  direction: 'onward' | 'return';
  status: 'present' | 'absent';
  method: 'qr_scan' | 'manual';
  is_walk_up: boolean;
}

/** The learner attributes analytics slices by. */
export interface LearnerDim {
  id: string;
  profileId: string | null;
  institutionId: string | null;
  departmentId: string | null;
  programId: string | null;
}

export type LabelMap = Map<string, string>;

export interface Labels {
  routes: LabelMap;
  stops: LabelMap;
  institutions: LabelMap;
  departments: LabelMap;
  programs: LabelMap;
}

export interface AnalyticsFilters {
  routeIds: string[];
  stopIds: string[];
  institutionIds: string[];
  departmentIds: string[];
  programIds: string[];
  bookedBy: 'self' | 'admin' | null;
  direction: 'onward' | 'return' | null;
  attStatus: 'present' | 'absent' | null;
  method: 'qr_scan' | 'manual' | null;
}

export const EMPTY_FILTERS: AnalyticsFilters = {
  routeIds: [],
  stopIds: [],
  institutionIds: [],
  departmentIds: [],
  programIds: [],
  bookedBy: null,
  direction: null,
  attStatus: null,
  method: null,
};

export interface FacetOption {
  id: string;
  label: string;
}
export interface StopFacetOption extends FacetOption {
  routeId: string | null;
}

export interface Facets {
  routes: FacetOption[];
  stops: StopFacetOption[];
  institutions: FacetOption[];
  departments: FacetOption[];
  programs: FacetOption[];
}

export interface CountRow extends FacetOption {
  count: number;
}

/** A cohort's booked/boarded/no-show triple. `rate` is the NO-SHOW percentage. */
export interface ShowRow extends FacetOption {
  booked: number;
  boarded: number;
  noShows: number;
  rate: number;
}

export type LeadBucket = 'same_day' | 'd1' | 'd2_3' | 'd4_7' | 'd8_plus';

export interface BookingsBlock {
  kpis: {
    total: number;
    learners: number;
    routes: number;
    days: number;
    avgPerDay: number;
    selfPct: number;
    peakDay: { date: string; count: number } | null;
  };
  perDay: { date: string; count: number }[];
  byRoute: CountRow[];
  leadTime: { bucket: LeadBucket; label: string; count: number }[];
  byWeekday: { weekday: number; label: string; count: number }[];
  bookedBy: { self: number; admin: number; unknown: number };
  byInstitution: CountRow[];
  byDepartment: CountRow[];
  topStops: CountRow[];
}

export interface AttendanceBlock {
  unavailable: boolean;
  coverage: {
    routesWithAttendance: number;
    routesInRange: number;
    daysWithAttendance: number;
    daysInRange: number;
  };
  kpis: {
    records: number;
    present: number;
    absent: number;
    walkUps: number;
    /** Bookings on days that have at least one attendance row — the show-up denominator. */
    bookedOnScannedDays: number;
    /** Distinct (learner, date) pairs that were booked AND marked present. */
    boarded: number;
    showUpRate: number;
    noShows: number;
  };
  perDay: { date: string; booked: number; boarded: number; noShows: number }[];
  noShowByRoute: ShowRow[];
  byDirection: { onward: number; return: number };
  byMethod: { qr_scan: number; manual: number };
  byStatus: { present: number; absent: number };
  byDepartment: ShowRow[];
}

export interface AnalyticsPayload {
  range: { from: string; to: string };
  facets: Facets;
  bookings: BookingsBlock;
  attendance: AttendanceBlock;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// lib/booking/analytics-dims.test.ts
import { describe, it, expect } from 'vitest';
import {
  daysBetween, istDateOf, leadTimeBucket, leadDays, weekdayOf, bookedByLabel, pct,
  LEAD_BUCKETS, WEEKDAY_LABELS,
} from './analytics-dims';

describe('daysBetween', () => {
  it('counts whole days forward and backward across a month boundary', () => {
    expect(daysBetween('2026-07-01', '2026-07-10')).toBe(9);
    expect(daysBetween('2026-06-28', '2026-07-01')).toBe(3);
    expect(daysBetween('2026-07-10', '2026-07-01')).toBe(-9);
    expect(daysBetween('2026-07-05', '2026-07-05')).toBe(0);
  });
});

describe('istDateOf', () => {
  it('rolls a late-evening UTC instant into the next IST day', () => {
    // 19:00 UTC on 2026-07-09 is 00:30 IST on 2026-07-10.
    expect(istDateOf('2026-07-09T19:00:00Z')).toBe('2026-07-10');
    expect(istDateOf('2026-07-09T10:00:00Z')).toBe('2026-07-09');
  });
});

describe('leadTimeBucket', () => {
  it('buckets each boundary value', () => {
    expect(leadTimeBucket(0)).toBe('same_day');
    expect(leadTimeBucket(1)).toBe('d1');
    expect(leadTimeBucket(2)).toBe('d2_3');
    expect(leadTimeBucket(3)).toBe('d2_3');
    expect(leadTimeBucket(4)).toBe('d4_7');
    expect(leadTimeBucket(7)).toBe('d4_7');
    expect(leadTimeBucket(8)).toBe('d8_plus');
  });

  it('clamps a negative lead time into same_day', () => {
    expect(leadTimeBucket(-3)).toBe('same_day');
  });

  it('exposes every bucket key exactly once, in ascending order', () => {
    expect(LEAD_BUCKETS.map((b) => b.key)).toEqual(['same_day', 'd1', 'd2_3', 'd4_7', 'd8_plus']);
  });
});

describe('leadDays', () => {
  it('measures from the IST date of booked_at to the travel date', () => {
    expect(leadDays('2026-07-08T10:00:00Z', '2026-07-10')).toBe(2);
    // 19:00 UTC 2026-07-09 is already 2026-07-10 in IST -> same day.
    expect(leadDays('2026-07-09T19:00:00Z', '2026-07-10')).toBe(0);
  });
});

describe('weekdayOf', () => {
  it('maps 0 to Monday and 6 to Sunday', () => {
    expect(weekdayOf('2026-07-20')).toBe(0); // Monday
    expect(weekdayOf('2026-07-25')).toBe(5); // Saturday
    expect(weekdayOf('2026-07-26')).toBe(6); // Sunday
    expect(WEEKDAY_LABELS[weekdayOf('2026-07-26')]).toBe('Sun');
  });
});

describe('bookedByLabel', () => {
  it('classifies self, admin and unknown', () => {
    expect(bookedByLabel('P1', 'P1')).toBe('self');
    expect(bookedByLabel('ADMIN9', 'P1')).toBe('admin');
    expect(bookedByLabel(null, 'P1')).toBe('unknown');
  });

  it('treats a booker as admin when the learner has no profile id', () => {
    expect(bookedByLabel('P1', null)).toBe('admin');
    expect(bookedByLabel('P1', undefined)).toBe('admin');
  });
});

describe('pct', () => {
  it('rounds to one decimal and returns 0 for a zero denominator', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(178, 500)).toBe(35.6);
    expect(pct(0, 0)).toBe(0);
    expect(pct(5, 0)).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/booking/analytics-dims.test.ts`
Expected: FAIL — "Failed to resolve import ./analytics-dims"

- [ ] **Step 4: Write the implementation**

```typescript
// lib/booking/analytics-dims.ts
/**
 * Pure dimension helpers for booking analytics. No Supabase, no ambient Date —
 * every instant is passed in, so every function is deterministic and testable.
 *
 * Follows lib/booking/window.ts: India has no DST, so IST is a fixed +5:30
 * offset and all date math is integer arithmetic on UTC ms.
 */
import { istToday } from './window';
import type { LeadBucket } from './analytics-types';

/** Whole days from `a` to `b` ('YYYY-MM-DD'); negative when `b` precedes `a`. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** The IST calendar date ('YYYY-MM-DD') of an ISO timestamp. */
export function istDateOf(iso: string): string {
  return istToday(new Date(iso));
}

export const LEAD_BUCKETS: readonly { key: LeadBucket; label: string }[] = [
  { key: 'same_day', label: 'Same day' },
  { key: 'd1', label: '1 day ahead' },
  { key: 'd2_3', label: '2–3 days' },
  { key: 'd4_7', label: '4–7 days' },
  { key: 'd8_plus', label: '8+ days' },
];

/**
 * Days-ahead → bucket. Negative values (booked after the travel date — not
 * constrained by the schema, so possible) clamp into `same_day`.
 */
export function leadTimeBucket(days: number): LeadBucket {
  if (days <= 0) return 'same_day';
  if (days === 1) return 'd1';
  if (days <= 3) return 'd2_3';
  if (days <= 7) return 'd4_7';
  return 'd8_plus';
}

/** How many days ahead a booking was made. */
export function leadDays(bookedAt: string, travelDate: string): number {
  return daysBetween(istDateOf(bookedAt), travelDate);
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** 0 = Monday … 6 = Sunday. Same UTC trick window.ts::isSunday uses. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export type BookedByKind = 'self' | 'admin' | 'unknown';

/** Mirrors the Self/Admin rule in lib/booking/admin-list.ts::toBookingRow. */
export function bookedByLabel(
  bookedBy: string | null,
  profileId: string | null | undefined
): BookedByKind {
  if (!bookedBy) return 'unknown';
  return profileId && bookedBy === profileId ? 'self' : 'admin';
}

/** Percentage to one decimal; 0 when the denominator is 0 (never NaN). */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/booking/analytics-dims.test.ts`
Expected: PASS — all suites green.

- [ ] **Step 6: Commit**

```bash
git add lib/booking/analytics-types.ts lib/booking/analytics-dims.ts lib/booking/analytics-dims.test.ts
git commit -m "feat(bookings): pure dimension helpers for booking analytics"
```

---

### Task 2: Filter predicates and facet extraction

**Files:**
- Create: `lib/booking/analytics-filters.ts`
- Test: `lib/booking/analytics-filters.test.ts`

**Interfaces:**
- Consumes: all types from Task 1; `bookedByLabel` from `analytics-dims`.
- Produces: `matchesLearner(l: LearnerDim | undefined, f: AnalyticsFilters): boolean`, `filterBookings(rows: BookingRow[], learners: Map<string, LearnerDim>, f: AnalyticsFilters): BookingRow[]`, `filterAttendance(rows: AttendanceRow[], learners: Map<string, LearnerDim>, f: AnalyticsFilters): AttendanceRow[]`, `buildFacets(bookings: BookingRow[], attendance: AttendanceRow[], learners: Map<string, LearnerDim>, labels: Labels): Facets`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/booking/analytics-filters.test.ts
import { describe, it, expect } from 'vitest';
import { matchesLearner, filterBookings, filterAttendance, buildFacets } from './analytics-filters';
import { EMPTY_FILTERS, type AttendanceRow, type BookingRow, type Labels, type LearnerDim } from './analytics-types';

const learners = new Map<string, LearnerDim>([
  ['L1', { id: 'L1', profileId: 'P1', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L2', { id: 'L2', profileId: 'P2', institutionId: 'I2', departmentId: 'D2', programId: 'G2' }],
]);

const labels: Labels = {
  routes: new Map([['R1', '05 · Sankari'], ['R2', '12 · Salem']]),
  stops: new Map([['S1', 'Main Gate'], ['S2', 'Ammapet']]),
  institutions: new Map([['I1', 'Engineering'], ['I2', 'Pharmacy']]),
  departments: new Map([['D1', 'CSE'], ['D2', 'Pharm.D']]),
  programs: new Map([['G1', 'B.E. CSE'], ['G2', 'Pharm.D']]),
};

const bookings: BookingRow[] = [
  { learner_id: 'L1', travel_date: '2026-07-09', route_id: 'R1', stop_id: 'S1', booked_at: '2026-07-08T04:00:00Z', booked_by: 'P1' },
  { learner_id: 'L2', travel_date: '2026-07-09', route_id: 'R2', stop_id: 'S2', booked_at: '2026-07-01T04:00:00Z', booked_by: 'ADMIN' },
  { learner_id: 'L9', travel_date: '2026-07-10', route_id: 'R1', stop_id: null, booked_at: '2026-07-09T04:00:00Z', booked_by: null },
];

const attendance: AttendanceRow[] = [
  { learner_id: 'L1', trip_date: '2026-07-09', route_id: 'R1', stop_id: 'S1', direction: 'onward', status: 'present', method: 'qr_scan', is_walk_up: false },
  { learner_id: 'L2', trip_date: '2026-07-09', route_id: 'R2', stop_id: 'S2', direction: 'return', status: 'absent', method: 'manual', is_walk_up: false },
];

describe('matchesLearner', () => {
  it('passes everything when no academic filter is active', () => {
    expect(matchesLearner(learners.get('L1'), EMPTY_FILTERS)).toBe(true);
    expect(matchesLearner(undefined, EMPTY_FILTERS)).toBe(true);
  });

  it('matches on any one academic dimension and supports multi-select', () => {
    expect(matchesLearner(learners.get('L1'), { ...EMPTY_FILTERS, departmentIds: ['D1'] })).toBe(true);
    expect(matchesLearner(learners.get('L2'), { ...EMPTY_FILTERS, departmentIds: ['D1'] })).toBe(false);
    expect(matchesLearner(learners.get('L2'), { ...EMPTY_FILTERS, departmentIds: ['D1', 'D2'] })).toBe(true);
  });

  it('requires ALL active academic dimensions to match', () => {
    const f = { ...EMPTY_FILTERS, institutionIds: ['I1'], programIds: ['G2'] };
    expect(matchesLearner(learners.get('L1'), f)).toBe(false);
  });

  it('excludes an unresolvable learner once any academic filter is active', () => {
    expect(matchesLearner(undefined, { ...EMPTY_FILTERS, institutionIds: ['I1'] })).toBe(false);
  });
});

describe('filterBookings', () => {
  it('returns every row when no filter is set', () => {
    expect(filterBookings(bookings, learners, EMPTY_FILTERS)).toHaveLength(3);
  });

  it('filters by route and by stop', () => {
    expect(filterBookings(bookings, learners, { ...EMPTY_FILTERS, routeIds: ['R1'] })).toHaveLength(2);
    expect(filterBookings(bookings, learners, { ...EMPTY_FILTERS, stopIds: ['S1'] })).toHaveLength(1);
  });

  it('drops rows with a null stop when a stop filter is active', () => {
    const out = filterBookings(bookings, learners, { ...EMPTY_FILTERS, stopIds: ['S1', 'S2'] });
    expect(out.map((b) => b.learner_id)).toEqual(['L1', 'L2']);
  });

  it('filters by booked-by, treating a null booker as neither self nor admin', () => {
    expect(filterBookings(bookings, learners, { ...EMPTY_FILTERS, bookedBy: 'self' }).map((b) => b.learner_id)).toEqual(['L1']);
    expect(filterBookings(bookings, learners, { ...EMPTY_FILTERS, bookedBy: 'admin' }).map((b) => b.learner_id)).toEqual(['L2']);
  });
});

describe('filterAttendance', () => {
  it('filters by direction, status and method independently', () => {
    expect(filterAttendance(attendance, learners, { ...EMPTY_FILTERS, direction: 'onward' })).toHaveLength(1);
    expect(filterAttendance(attendance, learners, { ...EMPTY_FILTERS, attStatus: 'absent' })).toHaveLength(1);
    expect(filterAttendance(attendance, learners, { ...EMPTY_FILTERS, method: 'qr_scan' })).toHaveLength(1);
  });

  it('applies academic filters to attendance too', () => {
    expect(filterAttendance(attendance, learners, { ...EMPTY_FILTERS, departmentIds: ['D2'] }).map((a) => a.learner_id)).toEqual(['L2']);
  });
});

describe('buildFacets', () => {
  it('lists only ids present in the data, labelled and sorted', () => {
    const f = buildFacets(bookings, attendance, learners, labels);
    expect(f.routes.map((r) => r.label)).toEqual(['05 · Sankari', '12 · Salem']);
    expect(f.departments.map((d) => d.label)).toEqual(['CSE', 'Pharm.D']);
    expect(f.stops.find((s) => s.id === 'S2')?.routeId).toBe('R2');
  });

  it('falls back to the raw id when a label is missing', () => {
    const f = buildFacets(bookings, [], learners, { ...labels, routes: new Map() });
    expect(f.routes.map((r) => r.label).sort()).toEqual(['R1', 'R2']);
  });

  it('returns empty facet lists for empty input', () => {
    const f = buildFacets([], [], learners, labels);
    expect(f).toEqual({ routes: [], stops: [], institutions: [], departments: [], programs: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/booking/analytics-filters.test.ts`
Expected: FAIL — "Failed to resolve import ./analytics-filters"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/booking/analytics-filters.ts
/**
 * Filter predicates and facet extraction. Pure — takes plain arrays and Maps.
 *
 * Every non-date filter runs here rather than in SQL: tms_booking carries no
 * academic columns, and pushing an academic filter into SQL would mean `.in()`-ing
 * hundreds of learner UUIDs, which the PostgREST gateway rejects with HTTP 400
 * above ~500 ids. Facets are also computed before filtering (see buildFacets),
 * which requires the unfiltered set to be in memory anyway.
 */
import { bookedByLabel } from './analytics-dims';
import type {
  AnalyticsFilters, AttendanceRow, BookingRow, Facets, LabelMap, Labels, LearnerDim, StopFacetOption,
} from './analytics-types';

/** An empty filter list means "no constraint"; otherwise the value must be in it. */
const inList = (list: string[], value: string | null | undefined): boolean =>
  list.length === 0 || (!!value && list.includes(value));

/**
 * Academic predicate. A learner we could not resolve (no learners_profiles row)
 * passes when no academic filter is active, and fails as soon as one is —
 * including them would silently inflate a filtered cohort.
 */
export function matchesLearner(l: LearnerDim | undefined, f: AnalyticsFilters): boolean {
  const academicActive =
    f.institutionIds.length > 0 || f.departmentIds.length > 0 || f.programIds.length > 0;
  if (!l) return !academicActive;
  return (
    inList(f.institutionIds, l.institutionId) &&
    inList(f.departmentIds, l.departmentId) &&
    inList(f.programIds, l.programId)
  );
}

export function filterBookings(
  rows: BookingRow[],
  learners: Map<string, LearnerDim>,
  f: AnalyticsFilters
): BookingRow[] {
  return rows.filter((b) => {
    if (!inList(f.routeIds, b.route_id)) return false;
    if (!inList(f.stopIds, b.stop_id)) return false;
    const l = learners.get(b.learner_id);
    if (!matchesLearner(l, f)) return false;
    if (f.bookedBy && bookedByLabel(b.booked_by, l?.profileId) !== f.bookedBy) return false;
    return true;
  });
}

export function filterAttendance(
  rows: AttendanceRow[],
  learners: Map<string, LearnerDim>,
  f: AnalyticsFilters
): AttendanceRow[] {
  return rows.filter((a) => {
    if (!inList(f.routeIds, a.route_id)) return false;
    if (!inList(f.stopIds, a.stop_id)) return false;
    if (!matchesLearner(learners.get(a.learner_id), f)) return false;
    if (f.direction && a.direction !== f.direction) return false;
    if (f.attStatus && a.status !== f.attStatus) return false;
    if (f.method && a.method !== f.method) return false;
    return true;
  });
}

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/**
 * Facet options for the filter dropdowns, drawn from the DATE-RANGE-scoped data
 * BEFORE any other filter runs — so selecting one department does not erase the
 * remaining departments from the dropdown.
 *
 * Built here rather than from /api/admin/masters, which is gated on FEES_VIEW and
 * would 403 for a bookings-only user.
 */
export function buildFacets(
  bookings: BookingRow[],
  attendance: AttendanceRow[],
  learners: Map<string, LearnerDim>,
  labels: Labels
): Facets {
  const routeIds = new Set<string>();
  const stopRoute = new Map<string, string | null>();
  const institutionIds = new Set<string>();
  const departmentIds = new Set<string>();
  const programIds = new Set<string>();

  const addLearner = (learnerId: string) => {
    const l = learners.get(learnerId);
    if (l?.institutionId) institutionIds.add(l.institutionId);
    if (l?.departmentId) departmentIds.add(l.departmentId);
    if (l?.programId) programIds.add(l.programId);
  };

  for (const b of bookings) {
    routeIds.add(b.route_id);
    if (b.stop_id) stopRoute.set(b.stop_id, b.route_id);
    addLearner(b.learner_id);
  }
  for (const a of attendance) {
    if (a.route_id) routeIds.add(a.route_id);
    if (a.stop_id && !stopRoute.has(a.stop_id)) stopRoute.set(a.stop_id, a.route_id);
    addLearner(a.learner_id);
  }

  const opts = (ids: Set<string>, m: LabelMap) =>
    [...ids].map((id) => ({ id, label: m.get(id) ?? id })).sort(byLabel);

  const stops: StopFacetOption[] = [...stopRoute.entries()]
    .map(([id, routeId]) => ({ id, label: labels.stops.get(id) ?? id, routeId }))
    .sort(byLabel);

  return {
    routes: opts(routeIds, labels.routes),
    stops,
    institutions: opts(institutionIds, labels.institutions),
    departments: opts(departmentIds, labels.departments),
    programs: opts(programIds, labels.programs),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/booking/analytics-filters.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/booking/analytics-filters.ts lib/booking/analytics-filters.test.ts
git commit -m "feat(bookings): analytics filter predicates and data-driven facets"
```

---

### Task 3: Bookings aggregation

**Files:**
- Create: `lib/booking/analytics-bookings.ts`
- Test: `lib/booking/analytics-bookings.test.ts`

**Interfaces:**
- Consumes: types from Task 1; `leadDays`, `leadTimeBucket`, `weekdayOf`, `bookedByLabel`, `pct`, `LEAD_BUCKETS`, `WEEKDAY_LABELS` from `analytics-dims`.
- Produces: `aggregateBookings(rows: BookingRow[], learners: Map<string, LearnerDim>, labels: Labels): BookingsBlock`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/booking/analytics-bookings.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateBookings } from './analytics-bookings';
import type { BookingRow, Labels, LearnerDim } from './analytics-types';

const learners = new Map<string, LearnerDim>([
  ['L1', { id: 'L1', profileId: 'P1', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L2', { id: 'L2', profileId: 'P2', institutionId: 'I1', departmentId: 'D2', programId: 'G2' }],
]);

const labels: Labels = {
  routes: new Map([['R1', '05 · Sankari'], ['R2', '12 · Salem']]),
  stops: new Map([['S1', 'Main Gate']]),
  institutions: new Map([['I1', 'Engineering']]),
  departments: new Map([['D1', 'CSE'], ['D2', 'ECE']]),
  programs: new Map(),
};

// 2026-07-20 is a Monday; 2026-07-21 a Tuesday.
const rows: BookingRow[] = [
  { learner_id: 'L1', travel_date: '2026-07-20', route_id: 'R1', stop_id: 'S1', booked_at: '2026-07-19T04:00:00Z', booked_by: 'P1' },
  { learner_id: 'L2', travel_date: '2026-07-20', route_id: 'R1', stop_id: 'S1', booked_at: '2026-07-10T04:00:00Z', booked_by: 'ADMIN' },
  { learner_id: 'L1', travel_date: '2026-07-21', route_id: 'R2', stop_id: null, booked_at: '2026-07-21T04:00:00Z', booked_by: null },
];

describe('aggregateBookings', () => {
  const out = aggregateBookings(rows, learners, labels);

  it('reports headline KPIs', () => {
    expect(out.kpis.total).toBe(3);
    expect(out.kpis.learners).toBe(2);
    expect(out.kpis.routes).toBe(2);
    expect(out.kpis.days).toBe(2);
  });

  it('divides avgPerDay by BOOKED days, not calendar days', () => {
    expect(out.kpis.avgPerDay).toBe(1.5); // 3 bookings / 2 booked days
  });

  it('picks the busiest day as the peak', () => {
    expect(out.kpis.peakDay).toEqual({ date: '2026-07-20', count: 2 });
  });

  it('orders perDay ascending by date', () => {
    expect(out.perDay).toEqual([
      { date: '2026-07-20', count: 2 },
      { date: '2026-07-21', count: 1 },
    ]);
  });

  it('ranks routes by count, labelled', () => {
    expect(out.byRoute).toEqual([
      { id: 'R1', label: '05 · Sankari', count: 2 },
      { id: 'R2', label: '12 · Salem', count: 1 },
    ]);
  });

  it('emits all five lead-time buckets even when empty', () => {
    expect(out.leadTime.map((b) => b.bucket)).toEqual(['same_day', 'd1', 'd2_3', 'd4_7', 'd8_plus']);
    expect(out.leadTime.find((b) => b.bucket === 'd1')?.count).toBe(1);
    expect(out.leadTime.find((b) => b.bucket === 'd8_plus')?.count).toBe(1);
    expect(out.leadTime.find((b) => b.bucket === 'same_day')?.count).toBe(1);
  });

  it('emits all seven weekdays, Monday first', () => {
    expect(out.byWeekday).toHaveLength(7);
    expect(out.byWeekday[0]).toEqual({ weekday: 0, label: 'Mon', count: 2 });
    expect(out.byWeekday[1]).toEqual({ weekday: 1, label: 'Tue', count: 1 });
    expect(out.byWeekday[6].count).toBe(0);
  });

  it('splits booked-by three ways', () => {
    expect(out.bookedBy).toEqual({ self: 1, admin: 1, unknown: 1 });
    expect(out.kpis.selfPct).toBe(33.3);
  });

  it('rolls up institutions and departments', () => {
    expect(out.byInstitution).toEqual([{ id: 'I1', label: 'Engineering', count: 3 }]);
    expect(out.byDepartment.map((d) => d.label)).toEqual(['CSE', 'ECE']);
  });

  it('counts stops, skipping null stop ids', () => {
    expect(out.topStops).toEqual([{ id: 'S1', label: 'Main Gate', count: 2 }]);
  });

  it('returns zeroed KPIs and empty series for empty input, never NaN', () => {
    const empty = aggregateBookings([], learners, labels);
    expect(empty.kpis.total).toBe(0);
    expect(empty.kpis.avgPerDay).toBe(0);
    expect(empty.kpis.selfPct).toBe(0);
    expect(empty.kpis.peakDay).toBeNull();
    expect(empty.perDay).toEqual([]);
    expect(empty.byRoute).toEqual([]);
    expect(empty.leadTime.every((b) => b.count === 0)).toBe(true);
    expect(empty.byWeekday.every((d) => d.count === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/booking/analytics-bookings.test.ts`
Expected: FAIL — "Failed to resolve import ./analytics-bookings"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/booking/analytics-bookings.ts
/** Bookings-tab aggregation. Pure: plain arrays and Maps in, a BookingsBlock out. */
import {
  LEAD_BUCKETS, WEEKDAY_LABELS, bookedByLabel, leadDays, leadTimeBucket, pct, weekdayOf,
} from './analytics-dims';
import type {
  BookingRow, BookingsBlock, CountRow, LabelMap, Labels, LeadBucket, LearnerDim,
} from './analytics-types';

const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

/** Map → labelled rows, ranked by count then label. `top` trims the tail. */
function countRows(m: Map<string, number>, labelMap: LabelMap, top?: number): CountRow[] {
  const out = [...m.entries()]
    .map(([id, count]) => ({ id, label: labelMap.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return top ? out.slice(0, top) : out;
}

export function aggregateBookings(
  rows: BookingRow[],
  learners: Map<string, LearnerDim>,
  labels: Labels
): BookingsBlock {
  const perDayMap = new Map<string, number>();
  const routeMap = new Map<string, number>();
  const stopMap = new Map<string, number>();
  const instMap = new Map<string, number>();
  const deptMap = new Map<string, number>();
  const leadMap = new Map<LeadBucket, number>();
  const weekMap = new Map<number, number>();
  const learnerIds = new Set<string>();
  const bookedBy = { self: 0, admin: 0, unknown: 0 };

  for (const b of rows) {
    bump(perDayMap, b.travel_date);
    bump(routeMap, b.route_id);
    if (b.stop_id) bump(stopMap, b.stop_id);
    bump(leadMap, leadTimeBucket(leadDays(b.booked_at, b.travel_date)));
    bump(weekMap, weekdayOf(b.travel_date));
    learnerIds.add(b.learner_id);

    const l = learners.get(b.learner_id);
    if (l?.institutionId) bump(instMap, l.institutionId);
    if (l?.departmentId) bump(deptMap, l.departmentId);
    bookedBy[bookedByLabel(b.booked_by, l?.profileId)] += 1;
  }

  const perDay = [...perDayMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const peakDay = perDay.reduce<{ date: string; count: number } | null>(
    (best, d) => (!best || d.count > best.count ? d : best),
    null
  );

  return {
    kpis: {
      total: rows.length,
      learners: learnerIds.size,
      routes: routeMap.size,
      days: perDay.length,
      // Divided by days that HAVE bookings — a calendar-day divisor would report a
      // misleadingly low average across weekends and holidays.
      avgPerDay: perDay.length ? Math.round((rows.length / perDay.length) * 10) / 10 : 0,
      selfPct: pct(bookedBy.self, rows.length),
      peakDay,
    },
    perDay,
    byRoute: countRows(routeMap, labels.routes),
    leadTime: LEAD_BUCKETS.map(({ key, label }) => ({
      bucket: key,
      label,
      count: leadMap.get(key) ?? 0,
    })),
    byWeekday: WEEKDAY_LABELS.map((label, i) => ({
      weekday: i,
      label,
      count: weekMap.get(i) ?? 0,
    })),
    bookedBy,
    byInstitution: countRows(instMap, labels.institutions),
    byDepartment: countRows(deptMap, labels.departments),
    topStops: countRows(stopMap, labels.stops, 15),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/booking/analytics-bookings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/booking/analytics-bookings.ts lib/booking/analytics-bookings.test.ts
git commit -m "feat(bookings): bookings-tab aggregation"
```

---

### Task 4: Attendance aggregation and the booked↔boarded join

**Files:**
- Create: `lib/booking/analytics-attendance.ts`
- Create: `lib/booking/analytics.ts` (barrel)
- Test: `lib/booking/analytics-attendance.test.ts`

**Interfaces:**
- Consumes: types from Task 1; `pct` from `analytics-dims`.
- Produces: `aggregateAttendance(bookings: BookingRow[], attendance: AttendanceRow[], learners: Map<string, LearnerDim>, labels: Labels, unavailable?: boolean): AttendanceBlock`. The barrel `lib/booking/analytics.ts` re-exports every public symbol from the four modules.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/booking/analytics-attendance.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateAttendance } from './analytics-attendance';
import type { AttendanceRow, BookingRow, Labels, LearnerDim } from './analytics-types';

const learners = new Map<string, LearnerDim>([
  ['L1', { id: 'L1', profileId: 'P1', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L2', { id: 'L2', profileId: 'P2', institutionId: 'I1', departmentId: 'D1', programId: 'G1' }],
  ['L3', { id: 'L3', profileId: 'P3', institutionId: 'I1', departmentId: 'D2', programId: 'G2' }],
]);

const labels: Labels = {
  routes: new Map([['R1', '05 · Sankari']]),
  stops: new Map(),
  institutions: new Map([['I1', 'Engineering']]),
  departments: new Map([['D1', 'CSE'], ['D2', 'ECE']]),
  programs: new Map(),
};

const bk = (learner: string, date: string, route = 'R1'): BookingRow => ({
  learner_id: learner, travel_date: date, route_id: route, stop_id: null,
  booked_at: `${date}T04:00:00Z`, booked_by: null,
});

const at = (
  learner: string, date: string, over: Partial<AttendanceRow> = {}
): AttendanceRow => ({
  learner_id: learner, trip_date: date, route_id: 'R1', stop_id: null,
  direction: 'onward', status: 'present', method: 'qr_scan', is_walk_up: false, ...over,
});

describe('aggregateAttendance', () => {
  // 2026-07-09 is scanned; 2026-07-10 has bookings but NO attendance rows.
  const bookings = [bk('L1', '2026-07-09'), bk('L2', '2026-07-09'), bk('L3', '2026-07-09'), bk('L1', '2026-07-10')];
  const attendance = [at('L1', '2026-07-09'), at('L2', '2026-07-09', { status: 'absent' })];
  const out = aggregateAttendance(bookings, attendance, learners, labels);

  it('excludes unscanned days from BOTH the numerator and the denominator', () => {
    // 3 bookings on the scanned day; the 2026-07-10 booking is ignored entirely.
    expect(out.kpis.bookedOnScannedDays).toBe(3);
  });

  it('counts a booked learner marked present as boarded', () => {
    expect(out.kpis.boarded).toBe(1);
  });

  it('does NOT count an `absent` row as boarded', () => {
    // L2 has an attendance row, but status=absent -> no-show.
    expect(out.kpis.noShows).toBe(2); // L2 (absent) + L3 (no row at all)
  });

  it('computes the show-up rate against the scanned-day denominator', () => {
    expect(out.kpis.showUpRate).toBe(33.3); // 1 / 3
  });

  it('counts raw attendance records separately from boardings', () => {
    expect(out.kpis.records).toBe(2);
    expect(out.kpis.present).toBe(1);
    expect(out.kpis.absent).toBe(1);
  });

  it('treats a learner present in EITHER direction as boarded, without double counting', () => {
    const both = [at('L1', '2026-07-09'), at('L1', '2026-07-09', { direction: 'return' })];
    const r = aggregateAttendance([bk('L1', '2026-07-09')], both, learners, labels);
    expect(r.kpis.boarded).toBe(1);
    expect(r.kpis.records).toBe(2);
    expect(r.kpis.showUpRate).toBe(100);
  });

  it('counts a present learner with no booking as a walk-up', () => {
    const r = aggregateAttendance([], [at('L9', '2026-07-09')], learners, labels);
    expect(r.kpis.walkUps).toBe(1);
    expect(r.kpis.bookedOnScannedDays).toBe(0);
    expect(r.kpis.showUpRate).toBe(0);
  });

  it('reports route and day coverage', () => {
    expect(out.coverage).toEqual({
      routesWithAttendance: 1, routesInRange: 1, daysWithAttendance: 1, daysInRange: 2,
    });
  });

  it('breaks no-shows down per day and per route', () => {
    expect(out.perDay).toEqual([{ date: '2026-07-09', booked: 3, boarded: 1, noShows: 2 }]);
    expect(out.noShowByRoute).toEqual([
      { id: 'R1', label: '05 · Sankari', booked: 3, boarded: 1, noShows: 2, rate: 66.7 },
    ]);
  });

  it('breaks no-shows down per department', () => {
    expect(out.byDepartment).toEqual([
      { id: 'D1', label: 'CSE', booked: 2, boarded: 1, noShows: 1, rate: 50 },
      { id: 'D2', label: 'ECE', booked: 1, boarded: 0, noShows: 1, rate: 100 },
    ]);
  });

  it('tallies direction, method and status', () => {
    expect(out.byDirection).toEqual({ onward: 2, return: 0 });
    expect(out.byMethod).toEqual({ qr_scan: 2, manual: 0 });
    expect(out.byStatus).toEqual({ present: 1, absent: 1 });
  });

  it('returns a zeroed, non-NaN block for empty input', () => {
    const empty = aggregateAttendance([], [], learners, labels);
    expect(empty.unavailable).toBe(false);
    expect(empty.kpis.showUpRate).toBe(0);
    expect(empty.kpis.noShows).toBe(0);
    expect(empty.perDay).toEqual([]);
    expect(empty.noShowByRoute).toEqual([]);
  });

  it('flags unavailable when the caller says the query failed', () => {
    expect(aggregateAttendance([], [], learners, labels, true).unavailable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/booking/analytics-attendance.test.ts`
Expected: FAIL — "Failed to resolve import ./analytics-attendance"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/booking/analytics-attendance.ts
/**
 * Attendance aggregation, including the booked↔boarded join.
 *
 * tms_booking and tms_attendance have no FK between them, so the join happens
 * here on (learner_id, date). One booking authorizes BOTH legs of a day, so a
 * learner marked present in EITHER direction counts as boarded exactly once.
 */
import { pct } from './analytics-dims';
import type {
  AttendanceBlock, AttendanceRow, BookingRow, LabelMap, Labels, LearnerDim, ShowRow,
} from './analytics-types';

interface Tally {
  booked: number;
  boarded: number;
}

const tallyOf = (m: Map<string, Tally>, k: string): Tally => {
  const t = m.get(k) ?? { booked: 0, boarded: 0 };
  m.set(k, t);
  return t;
};

function showRows(m: Map<string, Tally>, labelMap: LabelMap): ShowRow[] {
  return [...m.entries()]
    .map(([id, t]) => ({
      id,
      label: labelMap.get(id) ?? id,
      booked: t.booked,
      boarded: t.boarded,
      noShows: t.booked - t.boarded,
      rate: pct(t.booked - t.boarded, t.booked),
    }))
    .sort((a, b) => b.noShows - a.noShows || a.label.localeCompare(b.label));
}

export function aggregateAttendance(
  bookings: BookingRow[],
  attendance: AttendanceRow[],
  learners: Map<string, LearnerDim>,
  labels: Labels,
  unavailable = false
): AttendanceBlock {
  const key = (learner: string, date: string) => `${learner}:${date}`;

  // Days with at least one attendance row. Bookings on any other day are excluded
  // from the show-up numerator AND denominator — otherwise incomplete scanner
  // rollout would read as learners abandoning their seats.
  const scannedDays = new Set(attendance.map((a) => a.trip_date));

  // (learner, date) pairs that actually boarded — `present` in either direction.
  const boardedKeys = new Set(
    attendance.filter((a) => a.status === 'present').map((a) => key(a.learner_id, a.trip_date))
  );
  const bookingKeys = new Set(bookings.map((b) => key(b.learner_id, b.travel_date)));

  const perDayMap = new Map<string, Tally>();
  const routeMap = new Map<string, Tally>();
  const deptMap = new Map<string, Tally>();
  let bookedOnScannedDays = 0;
  let boarded = 0;

  for (const b of bookings) {
    if (!scannedDays.has(b.travel_date)) continue;
    const didBoard = boardedKeys.has(key(b.learner_id, b.travel_date));
    bookedOnScannedDays += 1;
    if (didBoard) boarded += 1;

    for (const [m, id] of [
      [perDayMap, b.travel_date],
      [routeMap, b.route_id],
      [deptMap, learners.get(b.learner_id)?.departmentId],
    ] as [Map<string, Tally>, string | null | undefined][]) {
      if (!id) continue;
      const t = tallyOf(m, id);
      t.booked += 1;
      if (didBoard) t.boarded += 1;
    }
  }

  // A boarding with no matching booking (or an explicit is_walk_up flag), counted
  // once per learner-day. Currently zero in production; surfaced so it stays visible.
  const walkUps = new Set(
    attendance
      .filter(
        (a) =>
          a.status === 'present' &&
          (a.is_walk_up || !bookingKeys.has(key(a.learner_id, a.trip_date)))
      )
      .map((a) => key(a.learner_id, a.trip_date))
  ).size;

  const count = <T extends string>(pick: (a: AttendanceRow) => T, value: T) =>
    attendance.filter((a) => pick(a) === value).length;

  return {
    unavailable,
    coverage: {
      routesWithAttendance: new Set(
        attendance.map((a) => a.route_id).filter((v): v is string => !!v)
      ).size,
      routesInRange: new Set(bookings.map((b) => b.route_id)).size,
      daysWithAttendance: scannedDays.size,
      daysInRange: new Set(bookings.map((b) => b.travel_date)).size,
    },
    kpis: {
      records: attendance.length,
      present: count((a) => a.status, 'present'),
      absent: count((a) => a.status, 'absent'),
      walkUps,
      bookedOnScannedDays,
      boarded,
      showUpRate: pct(boarded, bookedOnScannedDays),
      noShows: bookedOnScannedDays - boarded,
    },
    perDay: [...perDayMap.entries()]
      .map(([date, t]) => ({
        date,
        booked: t.booked,
        boarded: t.boarded,
        noShows: t.booked - t.boarded,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    noShowByRoute: showRows(routeMap, labels.routes),
    byDirection: {
      onward: count((a) => a.direction, 'onward'),
      return: count((a) => a.direction, 'return'),
    },
    byMethod: {
      qr_scan: count((a) => a.method, 'qr_scan'),
      manual: count((a) => a.method, 'manual'),
    },
    byStatus: {
      present: count((a) => a.status, 'present'),
      absent: count((a) => a.status, 'absent'),
    },
    byDepartment: showRows(deptMap, labels.departments).sort(
      (a, b) => a.label.localeCompare(b.label)
    ),
  };
}
```

- [ ] **Step 4: Create the barrel**

```typescript
// lib/booking/analytics.ts
/**
 * Public surface of the booking-analytics pure core. Split across four modules
 * by responsibility; import from here.
 */
export * from './analytics-types';
export * from './analytics-dims';
export * from './analytics-filters';
export * from './analytics-bookings';
export * from './analytics-attendance';
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — all four analytics suites plus the module's pre-existing suites.

- [ ] **Step 6: Commit**

```bash
git add lib/booking/analytics-attendance.ts lib/booking/analytics-attendance.test.ts lib/booking/analytics.ts
git commit -m "feat(bookings): attendance aggregation with booked-vs-boarded join"
```

---

### Task 5: API endpoint

**Files:**
- Create: `app/api/admin/bookings/analytics/route.ts`

**Interfaces:**
- Consumes: everything from `@/lib/booking/analytics`; `withAuth`/`AuthContext` from `@/lib/api/with-auth`; `createServiceRoleClient` from `@/lib/supabase/server`; `TMS_PERMISSIONS` from `@/lib/constants/tms-permissions`; `istToday`/`addDays` from `@/lib/booking/window`; `loadPassengerRefs` from `@/lib/passengers/refs`.
- Produces: `GET /api/admin/bookings/analytics` returning `{ success: true, data: AnalyticsPayload }`.

- [ ] **Step 1: Write the route**

```typescript
// app/api/admin/bookings/analytics/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday, addDays } from '@/lib/booking/window';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import {
  aggregateAttendance, aggregateBookings, buildFacets, filterAttendance, filterBookings,
  type AnalyticsFilters, type AttendanceRow, type BookingRow, type Labels, type LearnerDim,
} from '@/lib/booking/analytics';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bookings & Attendance analytics, aggregated server-side over the live
 * tms_booking / tms_attendance tables.
 *
 * The DATE RANGE is the only server-side filter. Route, stop, academic,
 * booked-by, direction, status and method all run in memory — tms_booking has no
 * academic columns, and pushing an academic filter into SQL would require
 * `.in()`-ing hundreds of learner UUIDs, which the gateway rejects with HTTP 400
 * above ~500 ids. Facets are also built from the unfiltered range set so that
 * selecting one department does not erase the others from the dropdown.
 */

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const IN_CHUNK = 150;

const list = (v: string | null): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

const oneOf = <T extends string>(v: string | null, allowed: readonly T[]): T | null =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : null;

interface LearnerRow {
  id: string;
  profile_id: string | null;
  institution_id: string | null;
  department_id: string | null;
  program_id: string | null;
}

/** Chunked .in() fetch (≤150 ids/call) — larger lists overflow the API gateway. */
async function fetchByIds<T>(
  svc: SupabaseClient,
  table: string,
  columns: string,
  ids: string[]
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await svc
      .from(table)
      .select(columns)
      .in('id', ids.slice(i, i + IN_CHUNK));
    if (error) throw error; // never let a gateway 400 masquerade as an empty result
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function getAnalytics(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const today = istToday();
    const to = isDate(params.get('to')) ? (params.get('to') as string) : today;
    const from = isDate(params.get('from')) ? (params.get('from') as string) : addDays(to, -29);

    const filters: AnalyticsFilters = {
      routeIds: list(params.get('route_id')),
      stopIds: list(params.get('stop_id')),
      institutionIds: list(params.get('institution_id')),
      departmentIds: list(params.get('department_id')),
      programIds: list(params.get('program_id')),
      bookedBy: oneOf(params.get('booked_by'), ['self', 'admin'] as const),
      direction: oneOf(params.get('direction'), ['onward', 'return'] as const),
      attStatus: oneOf(params.get('att_status'), ['present', 'absent'] as const),
      method: oneOf(params.get('method'), ['qr_scan', 'manual'] as const),
    };

    const svc = createServiceRoleClient();

    const [bookingRes, attRes] = await Promise.all([
      svc
        .from('tms_booking')
        // No `id`, no `status` — the live table has neither.
        .select('learner_id, travel_date, route_id, stop_id, booked_at, booked_by')
        .gte('travel_date', from)
        .lte('travel_date', to),
      svc
        .from('tms_attendance')
        .select('learner_id, trip_date, route_id, stop_id, direction, status, method, is_walk_up')
        .gte('trip_date', from)
        .lte('trip_date', to),
    ]);

    if (bookingRes.error && !isMissingTable(bookingRes.error)) {
      console.error('admin/bookings/analytics booking error:', bookingRes.error);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }
    const bookings = (bookingRes.data ?? []) as BookingRow[];

    // Attendance failing degrades that tab only — the Bookings tab still renders.
    const attUnavailable = !!attRes.error && !isMissingTable(attRes.error);
    if (attUnavailable) console.error('admin/bookings/analytics attendance error:', attRes.error);
    const attendance = attUnavailable ? [] : ((attRes.data ?? []) as AttendanceRow[]);

    const learnerIds = [
      ...new Set([...bookings.map((b) => b.learner_id), ...attendance.map((a) => a.learner_id)]),
    ];
    const learners = new Map<string, LearnerDim>();
    for (const l of await fetchByIds<LearnerRow>(
      svc,
      'learners_profiles',
      'id, profile_id, institution_id, department_id, program_id',
      learnerIds
    )) {
      learners.set(l.id, {
        id: l.id,
        profileId: l.profile_id,
        institutionId: l.institution_id,
        departmentId: l.department_id,
        programId: l.program_id,
      });
    }

    const refs = await loadPassengerRefs(svc, {
      institutionIds: [...learners.values()].map((l) => l.institutionId),
      departmentIds: [...learners.values()].map((l) => l.departmentId),
      programIds: [...learners.values()].map((l) => l.programId),
      routeIds: [...bookings.map((b) => b.route_id), ...attendance.map((a) => a.route_id)],
      stopIds: [...bookings.map((b) => b.stop_id), ...attendance.map((a) => a.stop_id)],
    });

    const labels: Labels = {
      // loadPassengerRefs returns routes as { routeNumber, routeName }; flatten to
      // the "12 · Salem Town" label the rest of the Bookings module already uses.
      routes: new Map(
        [...refs.routes].map(([id, r]) => [id, `${r.routeNumber ?? '—'} · ${r.routeName ?? ''}`.trim()])
      ),
      stops: refs.stops,
      institutions: refs.institutions,
      departments: refs.departments,
      programs: refs.programs,
    };

    // Facets BEFORE filtering — see the module docstring.
    const facets = buildFacets(bookings, attendance, learners, labels);

    const fBookings = filterBookings(bookings, learners, filters);
    const fAttendance = filterAttendance(attendance, learners, filters);

    return NextResponse.json({
      success: true,
      data: {
        range: { from, to },
        facets,
        bookings: aggregateBookings(fBookings, learners, labels),
        attendance: aggregateAttendance(fBookings, fAttendance, learners, labels, attUnavailable),
      },
    });
  } catch (e) {
    console.error('admin/bookings/analytics error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAnalytics(request, auth));
```

- [ ] **Step 2: Verify the route compiles**

Run: `npx tsc --noEmit --skipLibCheck app/api/admin/bookings/analytics/route.ts 2>&1 | grep "bookings/analytics" || echo "no errors in this file"`
Expected: `no errors in this file`. (Path-scoped only — the repo's global `tsc` is chronically red and is not a gate.)

- [ ] **Step 3: Probe the route unauthenticated**

Run (dev server on port 3001 — **port 3000 is a different app**):
```bash
npm run dev -- -p 3001 &
sleep 12
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/api/admin/bookings/analytics?from=2026-06-01&to=2026-07-25"
```
Expected: `307` or `401` — the auth wrapper rejects an unauthenticated request. NOT `500`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/bookings/analytics/route.ts
git commit -m "feat(bookings): analytics API endpoint"
```

---

### Task 6: Reusable UI controls

**Files:**
- Create: `app/(admin)/bookings/analytics/controls.tsx`

**Interfaces:**
- Consumes: `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuCheckboxItem`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`; `card` from `../../_viz/kit`.
- Produces: `MultiSelect`, `SingleSelect`, `FilterChips`, `TabNav`, `CoverageCallout`, and the shared `control` class constant.

Design notes carried from the `ui-ux-pro-max` "Data-Dense Dashboard" style: minimal padding, space-efficient grid, hover tooltips, smooth 150–300 ms filter transitions. Its suggested palette (`#3B82F6`) and fonts (Fira Code/Fira Sans) are **deliberately not adopted** — the app already has a validated `_viz` palette and type scale, and the skill's own *consistency* rule says not to fragment styling across pages.

- [ ] **Step 1: Write the controls module**

```tsx
// app/(admin)/bookings/analytics/controls.tsx
'use client';

/**
 * Filter and shell primitives for the Bookings analytics page.
 *
 * Everything here uses the app's SEMANTIC tokens (border-border, bg-card,
 * text-foreground, hover:bg-muted) rather than hand-rolled gray/white pairs, so
 * dark mode works without per-element `dark:` variants.
 *
 * The existing components/ui/data-table.tsx::FilterSelect is single-select and
 * hardcodes light-mode grays, so it is not reused here.
 */

import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Info, Search, X, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { card } from '../../_viz/kit';

/** Shared trigger geometry — matches the 38px controls used across the admin app. */
export const control =
  'inline-flex h-[38px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm ' +
  'font-medium text-foreground transition-colors duration-200 hover:bg-muted cursor-pointer ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1';

export interface Opt {
  id: string;
  label: string;
}

/**
 * Multi-select dropdown with an inline search box once the list is long.
 *
 * Two Radix gotchas handled here:
 *  1. `onSelect` must preventDefault or the menu closes after every toggle.
 *  2. The menu's typeahead swallows keystrokes, so the search input stops
 *     propagation of its own keydown events.
 */
export function MultiSelect({
  title, options, selected, onChange, searchThreshold = 8,
}: {
  title: string;
  options: Opt[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchThreshold?: number;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);

  const label =
    selected.length === 0
      ? `${title}: All`
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? `${title}: 1`)
        : `${title}: ${selected.length}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${control} min-w-0 max-w-56 justify-between`}
        aria-label={`Filter by ${title}`}
        disabled={options.length === 0}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-64 overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {options.length > searchThreshold && (
          <div className="sticky top-0 z-10 bg-popover p-1.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={`Search ${title.toLowerCase()}…`}
                aria-label={`Search ${title}`}
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>
        )}

        {selected.length > 0 && (
          <>
            <DropdownMenuItem onSelect={() => onChange([])} className="cursor-pointer">
              <X className="h-4 w-4" aria-hidden="true" /> Clear {title.toLowerCase()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {shown.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">No matches</p>
        ) : (
          shown.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.id}
              checked={selected.includes(o.id)}
              onSelect={(e) => {
                e.preventDefault(); // keep the menu open across multiple toggles
                toggle(o.id);
              }}
              className="cursor-pointer"
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-select dropdown for the enum filters (booked-by, direction, status, method). */
export function SingleSelect({
  title, options, value, onChange,
}: {
  title: string;
  options: Opt[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${control} min-w-0 max-w-48 justify-between`}
        aria-label={`Filter by ${title}`}
      >
        <span className="truncate">{selected ? selected.label : `${title}: All`}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuItem onSelect={() => onChange(null)} className="cursor-pointer">
          <Check className={value ? 'opacity-0' : 'opacity-100'} aria-hidden="true" /> {title}: All
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => onChange(o.id)} className="cursor-pointer">
            <Check className={value === o.id ? 'opacity-100' : 'opacity-0'} aria-hidden="true" />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface Chip {
  key: string;
  group: string;
  label: string;
  onRemove: () => void;
}

/** Active-filter chips. Renders nothing when no filter is set. */
export function FilterChips({ chips, onClearAll }: { chips: Chip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted py-1 pl-2.5 pr-1 text-xs text-foreground"
        >
          <span className="text-muted-foreground">{c.group}</span>
          <span className="truncate font-medium">{c.label}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Remove filter ${c.group} ${c.label}`}
            className="cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors duration-200 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors duration-200 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Clear all
      </button>
    </div>
  );
}

export interface TabDef {
  id: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * Accessible tab bar: real `tablist`/`tab` roles with roving tabindex and
 * left/right arrow navigation, which a plain row of buttons does not provide.
 */
export function TabNav({
  tabs, active, onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].id);
    else if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
    else return;
    e.preventDefault();
  };

  return (
    <div className="border-b border-border">
      <div role="tablist" aria-label="Analytics sections" onKeyDown={onKeyDown} className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                on
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.Icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Coverage disclosure for the Attendance tab. Attendance currently exists for a
 * small minority of routes and days; without this note the charts read as
 * fleet-wide. Tone escalates to warning below 50% route coverage. The icon plus
 * the text mean colour is never the only signal.
 */
export function CoverageCallout({
  routesWithAttendance, routesInRange, daysWithAttendance, daysInRange,
}: {
  routesWithAttendance: number;
  routesInRange: number;
  daysWithAttendance: number;
  daysInRange: number;
}) {
  const thin = routesInRange > 0 && routesWithAttendance / routesInRange < 0.5;
  const color = thin ? 'var(--viz-warning)' : 'var(--viz-good)';
  return (
    <section
      className={`${card} flex items-start gap-3 p-4`}
      style={{ borderColor: color }}
      aria-live="polite"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Attendance recorded on{' '}
        <span className="font-semibold text-foreground">
          {routesWithAttendance} of {routesInRange}
        </span>{' '}
        routes across{' '}
        <span className="font-semibold text-foreground">
          {daysWithAttendance} of {daysInRange}
        </span>{' '}
        booked days in this range.
        {thin && ' Figures below cover scanned routes and days only — they are not fleet-wide.'}
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck --jsx preserve "app/(admin)/bookings/analytics/controls.tsx" 2>&1 | grep "analytics/controls" || echo "no errors in this file"`
Expected: `no errors in this file`

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/bookings/analytics/controls.tsx"
git commit -m "feat(bookings): accessible filter and tab primitives for analytics"
```

---

### Task 7: Filter bar with URL sync

**Files:**
- Create: `app/(admin)/bookings/analytics/filter-bar.tsx`

**Interfaces:**
- Consumes: `MultiSelect`, `SingleSelect`, `FilterChips`, `control`, `type Chip` from `./controls`; `EMPTY_FILTERS`, `type AnalyticsFilters`, `type Facets` from `@/lib/booking/analytics`; `istToday`, `addDays` from `@/lib/booking/window`.
- Produces: `RANGES`, `type RangeId`, `serializeFilters(f, from, to): string`, `parseFilters(sp: URLSearchParams): { filters, from, to }`, and the `FilterBar` component with props `{ facets, filters, onFiltersChange, from, to, onRangeChange, showAttendanceFilters, resultLabel }`.

- [ ] **Step 1: Write the filter bar**

```tsx
// app/(admin)/bookings/analytics/filter-bar.tsx
'use client';

/**
 * Advanced filter bar for the Bookings analytics page. Owns the filter <-> query
 * string codec so a filtered view is bookmarkable and shareable.
 *
 * Facet options come from the API payload (only values actually present in the
 * range), NOT from /api/admin/masters, which is gated on FEES_VIEW.
 */

import React from 'react';
import { CalendarRange } from 'lucide-react';
import { MultiSelect, SingleSelect, FilterChips, control, type Chip } from './controls';
import { EMPTY_FILTERS, type AnalyticsFilters, type Facets } from '@/lib/booking/analytics';
import { addDays, istToday } from '@/lib/booking/window';

export const RANGES = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: '365d', label: 'Last 12 months', days: 365 },
] as const;

export type RangeId = (typeof RANGES)[number]['id'];

/** Default window: the last 30 days, ending today (IST). */
export function defaultRange(): { from: string; to: string } {
  const to = istToday();
  return { from: addDays(to, -29), to };
}

const MULTI_KEYS = {
  routeIds: 'route_id',
  stopIds: 'stop_id',
  institutionIds: 'institution_id',
  departmentIds: 'department_id',
  programIds: 'program_id',
} as const;

const SINGLE_KEYS = {
  bookedBy: 'booked_by',
  direction: 'direction',
  attStatus: 'att_status',
  method: 'method',
} as const;

export function serializeFilters(f: AnalyticsFilters, from: string, to: string): string {
  const sp = new URLSearchParams({ from, to });
  for (const [field, param] of Object.entries(MULTI_KEYS)) {
    const v = f[field as keyof typeof MULTI_KEYS];
    if (v.length) sp.set(param, v.join(','));
  }
  for (const [field, param] of Object.entries(SINGLE_KEYS)) {
    const v = f[field as keyof typeof SINGLE_KEYS];
    if (v) sp.set(param, v);
  }
  return sp.toString();
}

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const listOf = (v: string | null): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
const oneOf = <T extends string>(v: string | null, allowed: readonly T[]): T | null =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : null;

export function parseFilters(sp: URLSearchParams): {
  filters: AnalyticsFilters;
  from: string;
  to: string;
} {
  const d = defaultRange();
  return {
    from: isDate(sp.get('from')) ? (sp.get('from') as string) : d.from,
    to: isDate(sp.get('to')) ? (sp.get('to') as string) : d.to,
    filters: {
      routeIds: listOf(sp.get('route_id')),
      stopIds: listOf(sp.get('stop_id')),
      institutionIds: listOf(sp.get('institution_id')),
      departmentIds: listOf(sp.get('department_id')),
      programIds: listOf(sp.get('program_id')),
      bookedBy: oneOf(sp.get('booked_by'), ['self', 'admin'] as const),
      direction: oneOf(sp.get('direction'), ['onward', 'return'] as const),
      attStatus: oneOf(sp.get('att_status'), ['present', 'absent'] as const),
      method: oneOf(sp.get('method'), ['qr_scan', 'manual'] as const),
    },
  };
}

const BOOKED_BY_OPTS = [
  { id: 'self', label: 'Self-booked' },
  { id: 'admin', label: 'Booked by admin' },
];
const DIRECTION_OPTS = [
  { id: 'onward', label: 'Onward' },
  { id: 'return', label: 'Return' },
];
const STATUS_OPTS = [
  { id: 'present', label: 'Present' },
  { id: 'absent', label: 'Absent' },
];
const METHOD_OPTS = [
  { id: 'qr_scan', label: 'QR scan' },
  { id: 'manual', label: 'Manual' },
];

const dateInput =
  'h-[38px] rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function FilterBar({
  facets, filters, onFiltersChange, from, to, onRangeChange, showAttendanceFilters, resultLabel,
}: {
  facets: Facets;
  filters: AnalyticsFilters;
  onFiltersChange: (next: AnalyticsFilters) => void;
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  showAttendanceFilters: boolean;
  resultLabel: string;
}) {
  const set = <K extends keyof AnalyticsFilters>(k: K, v: AnalyticsFilters[K]) =>
    onFiltersChange({ ...filters, [k]: v });

  const applyPreset = (days: number) => {
    const end = istToday();
    onRangeChange(addDays(end, -(days - 1)), end);
  };

  // Stops narrow to the selected routes — an unfiltered 479-stop list is unusable.
  const stopOptions =
    filters.routeIds.length > 0
      ? facets.stops.filter((s) => s.routeId && filters.routeIds.includes(s.routeId))
      : facets.stops;

  const labelOf = (opts: { id: string; label: string }[], id: string) =>
    opts.find((o) => o.id === id)?.label ?? id;

  const chips: Chip[] = [
    ...filters.routeIds.map((id) => ({
      key: `route:${id}`, group: 'Route', label: labelOf(facets.routes, id),
      onRemove: () => set('routeIds', filters.routeIds.filter((v) => v !== id)),
    })),
    ...filters.stopIds.map((id) => ({
      key: `stop:${id}`, group: 'Stop', label: labelOf(facets.stops, id),
      onRemove: () => set('stopIds', filters.stopIds.filter((v) => v !== id)),
    })),
    ...filters.institutionIds.map((id) => ({
      key: `inst:${id}`, group: 'Institution', label: labelOf(facets.institutions, id),
      onRemove: () => set('institutionIds', filters.institutionIds.filter((v) => v !== id)),
    })),
    ...filters.departmentIds.map((id) => ({
      key: `dept:${id}`, group: 'Department', label: labelOf(facets.departments, id),
      onRemove: () => set('departmentIds', filters.departmentIds.filter((v) => v !== id)),
    })),
    ...filters.programIds.map((id) => ({
      key: `prog:${id}`, group: 'Program', label: labelOf(facets.programs, id),
      onRemove: () => set('programIds', filters.programIds.filter((v) => v !== id)),
    })),
    ...(filters.bookedBy
      ? [{ key: 'bookedBy', group: 'Booked by', label: labelOf(BOOKED_BY_OPTS, filters.bookedBy), onRemove: () => set('bookedBy', null) }]
      : []),
    ...(filters.direction
      ? [{ key: 'direction', group: 'Direction', label: labelOf(DIRECTION_OPTS, filters.direction), onRemove: () => set('direction', null) }]
      : []),
    ...(filters.attStatus
      ? [{ key: 'attStatus', group: 'Status', label: labelOf(STATUS_OPTS, filters.attStatus), onRemove: () => set('attStatus', null) }]
      : []),
    ...(filters.method
      ? [{ key: 'method', group: 'Method', label: labelOf(METHOD_OPTS, filters.method), onRemove: () => set('method', null) }]
      : []),
  ];

  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      aria-label="Analytics filters"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" /> Range
        </span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => applyPreset(r.days)}
              className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only sm:not-sr-only">From</span>
          <input
            type="date"
            className={dateInput}
            value={from}
            max={to}
            aria-label="Range start date"
            onChange={(e) => onRangeChange(e.target.value, to)}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only sm:not-sr-only">To</span>
          <input
            type="date"
            className={dateInput}
            value={to}
            min={from}
            aria-label="Range end date"
            onChange={(e) => onRangeChange(from, e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect title="Route" options={facets.routes} selected={filters.routeIds} onChange={(v) => set('routeIds', v)} />
        <MultiSelect title="Stop" options={stopOptions} selected={filters.stopIds} onChange={(v) => set('stopIds', v)} />
        <MultiSelect title="Institution" options={facets.institutions} selected={filters.institutionIds} onChange={(v) => set('institutionIds', v)} />
        <MultiSelect title="Department" options={facets.departments} selected={filters.departmentIds} onChange={(v) => set('departmentIds', v)} />
        <MultiSelect title="Program" options={facets.programs} selected={filters.programIds} onChange={(v) => set('programIds', v)} />
        <SingleSelect title="Booked by" options={BOOKED_BY_OPTS} value={filters.bookedBy} onChange={(v) => set('bookedBy', v as AnalyticsFilters['bookedBy'])} />
        {showAttendanceFilters && (
          <>
            <SingleSelect title="Direction" options={DIRECTION_OPTS} value={filters.direction} onChange={(v) => set('direction', v as AnalyticsFilters['direction'])} />
            <SingleSelect title="Status" options={STATUS_OPTS} value={filters.attStatus} onChange={(v) => set('attStatus', v as AnalyticsFilters['attStatus'])} />
            <SingleSelect title="Method" options={METHOD_OPTS} value={filters.method} onChange={(v) => set('method', v as AnalyticsFilters['method'])} />
          </>
        )}
      </div>

      <FilterChips chips={chips} onClearAll={() => onFiltersChange({ ...EMPTY_FILTERS })} />

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {resultLabel}
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck --jsx preserve "app/(admin)/bookings/analytics/filter-bar.tsx" 2>&1 | grep "analytics/filter-bar" || echo "no errors in this file"`
Expected: `no errors in this file`

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/bookings/analytics/filter-bar.tsx"
git commit -m "feat(bookings): analytics filter bar with URL-synced state"
```

---

### Task 8: Bookings tab

**Files:**
- Create: `app/(admin)/bookings/analytics/bookings-tab.tsx`

**Interfaces:**
- Consumes: `type BookingsBlock` from `@/lib/booking/analytics`; `StatTile`, `Meter`, `Legend`, `ChartCard`, `VizTable`, `VizTooltip`, `num`, `gridProps`, `axisTick`, `axisLine` from `../../_viz/kit`.
- Produces: `export default function BookingsTab({ data }: { data: BookingsBlock })`.

- [ ] **Step 1: Write the tab**

```tsx
// app/(admin)/bookings/analytics/bookings-tab.tsx
'use client';

/**
 * Bookings analytics tab. Every mark follows the _viz kit conventions: ONE accent
 * hue for nominal-category magnitude bars (never a value ramp), the reserved
 * status scale only for status meaning, and a table twin behind every chart.
 */

import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CalendarCheck, Clock, Users, UserCheck } from 'lucide-react';
import {
  ChartCard, Legend, StatTile, VizTable, VizTooltip, axisLine, axisTick, gridProps, num,
} from '../../_viz/kit';
import type { BookingsBlock } from '@/lib/booking/analytics';

const CHART_TOP_N = 20;

export default function BookingsTab({ data }: { data: BookingsBlock }) {
  const k = data.kpis;

  const perDay = (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.perDay} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap="26%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={axisLine} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${num(v)} bookings`} />} />
        <Bar dataKey="count" name="Bookings" fill="var(--viz-accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );

  const routeRows = data.byRoute.slice(0, CHART_TOP_N);
  const byRoute = (
    <ResponsiveContainer width="100%" height={Math.max(220, routeRows.length * 30 + 24)}>
      <BarChart data={routeRows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }} barCategoryGap="28%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="count" name="Bookings" fill="var(--viz-accent)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="count" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const leadTime = (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data.leadTime} margin={{ top: 16, right: 12, bottom: 4, left: 4 }} barCategoryGap="30%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="count" name="Bookings" fill="var(--viz-accent)" radius={[4, 4, 0, 0]} maxBarSize={56}>
          <LabelList dataKey="count" position="top" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  // Sunday is a compulsory weekly holiday, so its bar is a data-quality signal,
  // not demand — it is drawn in the neutral context hue to say "not expected".
  const byWeekday = (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data.byWeekday} margin={{ top: 16, right: 12, bottom: 4, left: 4 }} barCategoryGap="28%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="count" name="Bookings" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.byWeekday.map((d) => (
            <Cell key={d.weekday} fill={d.weekday === 6 ? 'var(--viz-context)' : 'var(--viz-accent)'} />
          ))}
          <LabelList dataKey="count" position="top" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const bookedByRow = [{ name: 'Bookings', ...data.bookedBy }];
  const bookedBy = (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={bookedByRow} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={80} tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="self" name="Self" stackId="b" fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} />
        <Bar dataKey="admin" name="Admin" stackId="b" fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} />
        <Bar dataKey="unknown" name="Unknown" stackId="b" fill="var(--viz-neutral)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const deptRows = data.byDepartment.slice(0, 15);
  const byDept = (
    <ResponsiveContainer width="100%" height={Math.max(220, deptRows.length * 30 + 24)}>
      <BarChart data={deptRows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }} barCategoryGap="28%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="count" name="Bookings" fill="var(--viz-accent)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="count" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Bookings in range" value={num(k.total)} sub={`${num(k.days)} days with bookings`} Icon={CalendarCheck} tone="text-primary" />
        <StatTile label="Distinct learners" value={num(k.learners)} sub={`across ${num(k.routes)} routes`} Icon={Users} tone="text-primary" />
        <StatTile label="Average per booked day" value={num(k.avgPerDay)} sub={k.peakDay ? `peak ${num(k.peakDay.count)} on ${k.peakDay.date}` : 'no bookings yet'} Icon={Clock} tone="text-primary" />
        <StatTile label="Self-service share" value={`${k.selfPct.toFixed(1)}%`} sub={`${num(data.bookedBy.admin)} booked by admin`} Icon={UserCheck} tone="text-[var(--viz-good)]" />
      </div>

      <ChartCard
        title="Bookings per day"
        subtitle={`${num(k.total)} bookings across ${num(k.days)} days`}
        hasData={data.perDay.length >= 2}
        emptyMessage="Not enough history in this range — totals are in the tiles above."
        chart={perDay}
        table={<VizTable head={['Date', 'Bookings']} rows={data.perDay.map((d) => [d.date, num(d.count)])} />}
        csv={{ filename: 'bookings-per-day.csv', head: ['Date', 'Bookings'], rows: data.perDay.map((d) => [d.date, d.count]) }}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Bookings by route"
          subtitle={data.byRoute.length > CHART_TOP_N ? `Top ${CHART_TOP_N} of ${num(data.byRoute.length)} routes — full list in table view` : `${num(data.byRoute.length)} routes`}
          hasData={data.byRoute.length > 0}
          chart={byRoute}
          table={<VizTable head={['Route', 'Bookings']} rows={data.byRoute.map((r) => [r.label, num(r.count)])} />}
          csv={{ filename: 'bookings-by-route.csv', head: ['Route', 'Bookings'], rows: data.byRoute.map((r) => [r.label, r.count]) }}
        />
        <ChartCard
          title="Booking lead time"
          subtitle="How far ahead of travel a booking was made"
          hasData={k.total > 0}
          chart={leadTime}
          table={<VizTable head={['Lead time', 'Bookings']} rows={data.leadTime.map((b) => [b.label, num(b.count)])} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Bookings by day of week"
          subtitle="Sunday is a weekly holiday — a non-zero Sunday bar is a data issue"
          hasData={k.total > 0}
          legend={<Legend items={[{ label: 'Service day', color: 'var(--viz-accent)' }, { label: 'Weekly holiday', color: 'var(--viz-context)' }]} />}
          chart={byWeekday}
          table={<VizTable head={['Day', 'Bookings']} rows={data.byWeekday.map((d) => [d.label, num(d.count)])} />}
        />
        <ChartCard
          title="Who made the booking"
          subtitle="Self-service adoption vs admin-entered bookings"
          hasData={k.total > 0}
          legend={<Legend items={[{ label: 'Self', color: 'var(--viz-accent)' }, { label: 'Admin', color: 'var(--viz-context)' }, { label: 'Unknown', color: 'var(--viz-neutral)' }]} />}
          chart={bookedBy}
          table={<VizTable head={['Source', 'Bookings']} rows={[['Self', num(data.bookedBy.self)], ['Admin', num(data.bookedBy.admin)], ['Unknown', num(data.bookedBy.unknown)]]} />}
        />
      </div>

      <ChartCard
        title="Bookings by department"
        subtitle={data.byDepartment.length > 15 ? `Top 15 of ${num(data.byDepartment.length)} departments — full list in table view` : `${num(data.byDepartment.length)} departments`}
        hasData={data.byDepartment.length > 0}
        chart={byDept}
        table={<VizTable head={['Department', 'Bookings']} rows={data.byDepartment.map((d) => [d.label, num(d.count)])} />}
        csv={{ filename: 'bookings-by-department.csv', head: ['Department', 'Bookings'], rows: data.byDepartment.map((d) => [d.label, d.count]) }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck --jsx preserve "app/(admin)/bookings/analytics/bookings-tab.tsx" 2>&1 | grep "analytics/bookings-tab" || echo "no errors in this file"`
Expected: `no errors in this file`

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/bookings/analytics/bookings-tab.tsx"
git commit -m "feat(bookings): bookings analytics tab"
```

---

### Task 9: Attendance tab

**Files:**
- Create: `app/(admin)/bookings/analytics/attendance-tab.tsx`

**Interfaces:**
- Consumes: `type AttendanceBlock` from `@/lib/booking/analytics`; `CoverageCallout` from `./controls`; `StatTile`, `Meter`, `Legend`, `ChartCard`, `VizTable`, `VizTooltip`, `EmptyState`, `card`, `num`, `gridProps`, `axisTick`, `axisLine` from `../../_viz/kit`.
- Produces: `export default function AttendanceTab({ data }: { data: AttendanceBlock })`.

- [ ] **Step 1: Write the tab**

```tsx
// app/(admin)/bookings/analytics/attendance-tab.tsx
'use client';

/**
 * Attendance analytics tab.
 *
 * Attendance exists for a small minority of routes and days, so this tab leads
 * with a coverage disclosure and every rate names its denominator. When the
 * attendance query fails the whole body is replaced with an error state — zeroed
 * KPIs would read as "nobody boarded", which is a different and false claim.
 */

import React from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, QrCode, ScanLine, UserX, XCircle,
} from 'lucide-react';
import {
  ChartCard, EmptyState, Legend, Meter, StatTile, VizTable, VizTooltip, axisLine, axisTick, card,
  gridProps, num,
} from '../../_viz/kit';
import { CoverageCallout } from './controls';
import type { AttendanceBlock } from '@/lib/booking/analytics';

const CHART_TOP_N = 20;

/** Small labelled figure used by the composition panel. */
function Cell({ label, value, Icon, color }: { label: string; value: string; Icon: typeof CheckCircle2; color: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color }} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export default function AttendanceTab({ data }: { data: AttendanceBlock }) {
  if (data.unavailable) {
    return (
      <section className={`${card} p-5`}>
        <EmptyState message="Attendance data is temporarily unavailable. Booking figures on the other tab are unaffected." />
      </section>
    );
  }

  const k = data.kpis;

  const perDay = (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.perDay} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap="24%" barGap={2}>
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={axisLine} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="booked" name="Booked" fill="var(--viz-context)" radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="boarded" name="Boarded" fill="var(--viz-good)" radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );

  const routeRows = data.noShowByRoute.slice(0, CHART_TOP_N);
  const noShowByRoute = (
    <ResponsiveContainer width="100%" height={Math.max(220, routeRows.length * 30 + 24)}>
      <BarChart data={routeRows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }} barCategoryGap="28%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${num(v)} no-shows`} />} />
        <Bar dataKey="noShows" name="No-shows" fill="var(--viz-serious)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="noShows" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const deptRows = data.byDepartment.slice(0, 15);
  const byDept = (
    <ResponsiveContainer width="100%" height={Math.max(220, deptRows.length * 30 + 24)}>
      <BarChart data={deptRows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }} barCategoryGap="28%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="noShows" name="No-shows" fill="var(--viz-serious)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="noShows" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const manualShare = k.records > 0 ? Math.round((data.byMethod.manual / k.records) * 100) : 0;

  return (
    <div className="space-y-6">
      <CoverageCallout {...data.coverage} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Attendance records" value={num(k.records)} sub={`${num(data.coverage.daysWithAttendance)} days scanned`} Icon={ScanLine} tone="text-primary" />
        <StatTile label="Marked present" value={num(k.present)} sub={`${num(k.walkUps)} walk-ups`} Icon={CheckCircle2} tone="text-[var(--viz-good)]" />
        <StatTile label="No-shows" value={num(k.noShows)} sub={`of ${num(k.bookedOnScannedDays)} booked on scanned days`} Icon={UserX} tone="text-[var(--viz-serious)]" />
        <Meter label="Show-up rate" rate={k.showUpRate} caption={`${num(k.boarded)} boarded of ${num(k.bookedOnScannedDays)} booked on scanned days`} />
      </div>

      <ChartCard
        title="Booked vs boarded per day"
        subtitle="Only days with at least one attendance record appear here"
        hasData={data.perDay.length > 0}
        emptyMessage="No attendance recorded in this range."
        legend={<Legend items={[{ label: 'Booked', color: 'var(--viz-context)' }, { label: 'Boarded', color: 'var(--viz-good)', Icon: CheckCircle2 }]} />}
        chart={perDay}
        table={<VizTable head={['Date', 'Booked', 'Boarded', 'No-shows']} rows={data.perDay.map((d) => [d.date, num(d.booked), num(d.boarded), num(d.noShows)])} />}
        csv={{ filename: 'booked-vs-boarded.csv', head: ['Date', 'Booked', 'Boarded', 'No-shows'], rows: data.perDay.map((d) => [d.date, d.booked, d.boarded, d.noShows]) }}
      />

      <ChartCard
        title="No-shows by route"
        subtitle={data.noShowByRoute.length > CHART_TOP_N ? `Top ${CHART_TOP_N} of ${num(data.noShowByRoute.length)} routes — seats booked but never used` : 'Seats booked but never used'}
        hasData={data.noShowByRoute.length > 0}
        emptyMessage="No attendance recorded in this range."
        chart={noShowByRoute}
        table={<VizTable head={['Route', 'Booked', 'Boarded', 'No-shows', 'No-show %']} rows={data.noShowByRoute.map((r) => [r.label, num(r.booked), num(r.boarded), num(r.noShows), `${r.rate.toFixed(1)}%`])} />}
        csv={{ filename: 'no-shows-by-route.csv', head: ['Route', 'Booked', 'Boarded', 'No-shows', 'No-show %'], rows: data.noShowByRoute.map((r) => [r.label, r.booked, r.boarded, r.noShows, r.rate]) }}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className={`${card} p-5`}>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-foreground">Record composition</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {manualShare >= 40
                ? `${manualShare}% of records were entered manually — a high manual share weakens the figures above.`
                : 'How attendance was captured and which leg it covers.'}
            </p>
          </div>
          {k.records === 0 ? (
            <EmptyState message="No attendance recorded in this range." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Cell label="Present" value={num(data.byStatus.present)} Icon={CheckCircle2} color="var(--viz-good)" />
              <Cell label="Absent" value={num(data.byStatus.absent)} Icon={XCircle} color="var(--viz-critical)" />
              <Cell label="Walk-ups" value={num(k.walkUps)} Icon={AlertTriangle} color="var(--viz-warning)" />
              <Cell label="Onward" value={num(data.byDirection.onward)} Icon={ScanLine} color="var(--viz-accent)" />
              <Cell label="Return" value={num(data.byDirection.return)} Icon={ScanLine} color="var(--viz-context)" />
              <Cell label="QR / manual" value={`${num(data.byMethod.qr_scan)} / ${num(data.byMethod.manual)}`} Icon={QrCode} color="var(--viz-neutral)" />
            </div>
          )}
        </section>

        <ChartCard
          title="No-shows by department"
          subtitle={data.byDepartment.length > 15 ? `Top 15 of ${num(data.byDepartment.length)} departments` : 'Which cohorts book without travelling'}
          hasData={data.byDepartment.length > 0}
          emptyMessage="No attendance recorded in this range."
          chart={byDept}
          table={<VizTable head={['Department', 'Booked', 'Boarded', 'No-shows', 'No-show %']} rows={data.byDepartment.map((d) => [d.label, num(d.booked), num(d.boarded), num(d.noShows), `${d.rate.toFixed(1)}%`])} />}
          csv={{ filename: 'no-shows-by-department.csv', head: ['Department', 'Booked', 'Boarded', 'No-shows', 'No-show %'], rows: data.byDepartment.map((d) => [d.label, d.booked, d.boarded, d.noShows, d.rate]) }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck --jsx preserve "app/(admin)/bookings/analytics/attendance-tab.tsx" 2>&1 | grep "analytics/attendance-tab" || echo "no errors in this file"`
Expected: `no errors in this file`

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/bookings/analytics/attendance-tab.tsx"
git commit -m "feat(bookings): attendance analytics tab with coverage disclosure"
```

---

### Task 10: Page shell and the link from the Bookings list

**Files:**
- Create: `app/(admin)/bookings/analytics/page.tsx`
- Modify: `app/(admin)/bookings/page.tsx` (header block, around lines 77–82)

**Interfaces:**
- Consumes: `FilterBar`, `parseFilters`, `serializeFilters` from `./filter-bar`; `TabNav` from `./controls`; `BookingsTab`, `AttendanceTab`; `VIZ_CSS`, `num` from `../../_viz/kit`; `type AnalyticsPayload` from `@/lib/booking/analytics`; `useQuery` from `@tanstack/react-query`.
- Produces: the default-exported page at `/bookings/analytics`.

- [ ] **Step 1: Write the page shell**

```tsx
// app/(admin)/bookings/analytics/page.tsx
'use client';

/**
 * Bookings & Attendance analytics. One filter bar scopes BOTH tabs, and its state
 * round-trips through the query string so a filtered view is shareable.
 */

import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck, Loader2, RefreshCw, ScanLine } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { VIZ_CSS, num } from '../../_viz/kit';
import { TabNav } from './controls';
import { FilterBar, parseFilters, serializeFilters } from './filter-bar';
import BookingsTab from './bookings-tab';
import AttendanceTab from './attendance-tab';
import type { AnalyticsPayload } from '@/lib/booking/analytics';

const TABS = [
  { id: 'bookings', label: 'Bookings', Icon: CalendarCheck },
  { id: 'attendance', label: 'Attendance', Icon: ScanLine },
];

async function fetchAnalytics(qs: string): Promise<AnalyticsPayload> {
  const res = await fetch(`/api/admin/bookings/analytics?${qs}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load analytics');
  return json.data as AnalyticsPayload;
}

function AnalyticsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<string>('bookings');

  const { filters, from, to } = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const qs = useMemo(() => serializeFilters(filters, from, to), [filters, from, to]);

  // Push state through the URL so back/forward and sharing both work.
  const push = useCallback(
    (nextQs: string) => router.replace(`/bookings/analytics?${nextQs}`, { scroll: false }),
    [router]
  );

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['bookings-analytics', qs],
    queryFn: () => fetchAnalytics(qs),
    staleTime: 30_000,
  });

  if (isError) {
    toast.error('Failed to load analytics');
  }

  const resultLabel = data
    ? `${num(data.bookings.kpis.total)} bookings · ${num(data.attendance.kpis.records)} attendance records · ${data.range.from} → ${data.range.to}`
    : 'Loading…';

  return (
    <div className="viz-scope space-y-6">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/bookings"
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Bookings
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Bookings &amp; Attendance Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live figures from the daily booking and boarding-attendance tables.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex cursor-pointer items-center gap-2 self-start rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <FilterBar
        facets={data?.facets ?? { routes: [], stops: [], institutions: [], departments: [], programs: [] }}
        filters={filters}
        onFiltersChange={(next) => push(serializeFilters(next, from, to))}
        from={from}
        to={to}
        onRangeChange={(f, t) => push(serializeFilters(filters, f, t))}
        showAttendanceFilters={tab === 'attendance'}
        resultLabel={resultLabel}
      />

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {isLoading || !data ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 motion-safe:animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Loading analytics…</p>
          </div>
        </div>
      ) : (
        // Hold the previous render at reduced opacity during a refetch rather than
        // flashing a skeleton — the frame stays stable while filters change.
        <div className={isFetching ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'}>
          <div role="tabpanel" id="panel-bookings" aria-labelledby="tab-bookings" hidden={tab !== 'bookings'}>
            {tab === 'bookings' && <BookingsTab data={data.bookings} />}
          </div>
          <div role="tabpanel" id="panel-attendance" aria-labelledby="tab-attendance" hidden={tab !== 'attendance'}>
            {tab === 'attendance' && <AttendanceTab data={data.attendance} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** useSearchParams requires a Suspense boundary in the App Router. */
export default function BookingsAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 motion-safe:animate-spin text-primary" aria-hidden="true" />
        </div>
      }
    >
      <AnalyticsInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Add the Analytics link to the Bookings list page**

In `app/(admin)/bookings/page.tsx`, add these two imports to the existing import block:

```tsx
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
```

(`CalendarCheck` and `Download` are already imported from `lucide-react` — add `BarChart3` to that same import rather than duplicating the statement.)

Then replace the header block (currently lines 77–82):

```tsx
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bookings</h1>
          <p className="text-gray-600 dark:text-gray-400">Daily bus bookings across all routes — read-only, over the live booking system.</p>
        </div>
      </div>
```

with:

```tsx
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bookings</h1>
          <p className="text-gray-600 dark:text-gray-400">Daily bus bookings across all routes — read-only, over the live booking system.</p>
        </div>
        <Link
          href="/bookings/analytics"
          className="inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 self-start rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" /> Analytics
        </Link>
      </div>
```

- [ ] **Step 3: Verify the whole suite still passes**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 4: Verify the production build succeeds**

Run: `npm run build`
Expected: build completes; `/bookings/analytics` and `/api/admin/bookings/analytics` appear in the route manifest.

If the build fails with `could not find bin metadata file`, the cause is a stale `bun.lock`, not this change — run `bun install` and rebuild.

- [ ] **Step 5: Probe both routes**

```bash
npm run dev -- -p 3001 &
sleep 12
curl -s -o /dev/null -w "page:%{http_code}\n" "http://localhost:3001/bookings/analytics"
curl -s -o /dev/null -w "api:%{http_code}\n" "http://localhost:3001/api/admin/bookings/analytics"
```
Expected: both `307` or `401` (auth redirect), never `500`.

Note: port 3000 hosts a different application — always use 3001 for this app and confirm the response is from TMS-ADMIN before trusting a probe.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/bookings/analytics/page.tsx" "app/(admin)/bookings/page.tsx"
git commit -m "feat(bookings): analytics page shell with tabs and list-page link"
```

---

### Task 11: Manual verification checklist

**Files:** none — verification only.

This step needs an authenticated browser session, which the agent does not have. Hand it to the user with this list.

- [ ] **Step 1: Ask the user to verify in their browser**

Navigate to `/bookings` → click **Analytics**. Confirm each:

1. Page loads with the last 30 days selected; the result line under the filters reads `N bookings · M attendance records · <from> → <to>`.
2. **Bookings tab:** four KPI tiles populate; "Bookings per day" renders a bar per day; "Bookings by route" lists routes with counts; lead-time buckets show a distribution; the weekday chart shows Sunday in the muted context colour.
3. Every chart's table toggle (top-right of each card) switches to the table twin, and the download icon produces a CSV that opens correctly in Excel.
4. **Attendance tab:** the coverage callout appears first and names real numbers; the show-up meter's caption names the scanned-day denominator; "Booked vs boarded per day" shows paired bars.
5. **Filters:** select two routes → both tabs rescope, chips appear, the URL gains `route_id=<uuid>,<uuid>`. Copy the URL into a new tab and confirm the same filtered view loads.
6. Selecting a route narrows the Stop dropdown to that route's stops.
7. Direction/Status/Method dropdowns appear only on the Attendance tab.
8. "Clear all" resets every filter and the URL.
9. **Dark mode:** toggle the app theme; filter triggers, chips, dropdown panels, the coverage callout and all charts remain legible.
10. **Responsive:** at 375px width there is no horizontal page scroll; the filter bar wraps; wide tables scroll inside their own container.
11. **Keyboard:** Tab reaches every control with a visible focus ring; left/right arrows move between the two tabs; the dropdown search box accepts typing without closing the menu.

- [ ] **Step 2: Record the outcome**

Report which checks passed and which failed, with the exact observed behaviour for any failure. Do not claim the feature is verified without this pass.

---

## Self-Review

**1. Spec coverage** — checked each spec section against a task:

| Spec section | Task |
| --- | --- |
| Placement `/bookings/analytics` + link | 10 |
| Permission `BOOKINGS_VIEW` | 5 |
| Layout: filter bar above tabs | 7, 10 |
| Filter state URL sync | 7, 10 |
| Facets from data, not `/api/admin/masters` | 2, 5 |
| Query strategy (date in SQL, rest in JS) | 2, 5 |
| Chunked `.in()` at 150 with error checks | 5 |
| API contract + all query params | 5 |
| Lead time / weekday / booked-by / boarded / no-show / show-up / coverage / walk-up definitions | 1, 3, 4 |
| Tab A: 7 blocks | 8 |
| Tab B: 6 blocks | 9 |
| `_viz` kit reuse, palette rules | 8, 9 |
| Responsiveness | 6, 7, 10, 11 |
| Error handling: 42P01, attendance degradation, empty range, toast | 5, 9, 10 |
| Testing: 8 listed cases | 1, 2, 3, 4 |
| Files table | all |

No gaps found.

**2. Placeholder scan** — no "TBD", "TODO", "similar to Task N", or prose-only code steps. Every code step contains complete, runnable content.

**3. Type consistency** — verified across tasks: `LearnerDim` is constructed in Task 5 exactly as declared in Task 1 (`profileId`/`institutionId`/`departmentId`/`programId`, camelCase, distinct from the snake_case DB columns). `Labels.routes` is a `Map<string,string>`, so Task 5 flattens `loadPassengerRefs`'s `{routeNumber, routeName}` before use. `ShowRow.rate` is the NO-SHOW percentage in both the producer (Task 4) and the consumers (Task 9). `aggregateAttendance` takes the FILTERED bookings as its first argument in both Task 4's tests and Task 5's call site. `AttendanceBlock.unavailable` is set by Task 5, defaulted by Task 4, and consumed by Task 9.

**4. One deviation from the spec, deliberate** — the spec named a single `lib/booking/analytics.ts`. It is split into four responsibility-scoped modules plus a barrel at that exact path, so the spec's import path still resolves.
