# Offline Boarding Attendance Implementation Plan

> **Revised 2026-09-11 after evening attendance merged (`54ca971`).** Evening
> attendance added a second trip (`onward` morning, `return` evening) and a
> rule, `decideMarkDirection` in `lib/boarding/trip-direction.ts`, that picks
> the trip from a clock and refuses a request naming a different trip. This
> plan now feeds that rule the TAP TIME (`now: at`), so a morning mark sent in
> the evening stays a morning mark. Consequences carried through every task:
> the phone records the trip with each queued mark and scan; each request
> names one trip; the outbox slot is per (user, day, TRIP, learner); two new
> refusal reasons exist (`wrong_trip`, `evening_off`); Task 2's migration is
> `20260911200000` because `20260911160000` is taken.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boarding staff can mark Present/Absent and scan JKKN ID cards with no network; marks are kept on the phone and sent when signal returns, and count if tapped inside the window and received the same day.

**Architecture:** The server judges each mark by the time it was TAPPED (sent by the phone, bounded by the server clock) instead of the time it arrived. The phone keeps the day's roster, window settings and access verdict in IndexedDB, puts every roster tap in an outbox, and drains the outbox in batches with per-mark results. Scans stay live-first and fall back to the outbox when offline. The service worker gains a fallback so the installed app can start with no signal.

**Tech Stack:** Next.js 16 app router, React 19, TanStack Query, Supabase (Postgres RPC `tms_mark_attendance`), IndexedDB (hand-rolled, no package), vitest (node environment), hand-written `public/sw.js`.

**Spec:** `docs/superpowers/specs/2026-09-11-offline-boarding-attendance-design.md` (read its "Revisions made while writing the implementation plan" section first).

## Global Constraints

- Branch: `feat/offline-boarding-attendance`, created from `origin/main`. Run `git fetch origin && git log --oneline origin/main -1` first and branch from that commit.
- No new npm dependency. A new package rewrites `bun.lock`, and a stale `bun.lock` has broken production builds before.
- Tests live ONLY under `lib/**/*.test.ts` (that is `vitest.config.ts`'s `include`). Environment is `node`: no `window`, no `indexedDB`, no DOM.
- Run one test file: `npx vitest run <path>`. Run all: `npx vitest run`.
- `tsc` is red on `main` (about 540 known errors, see project memory). Never gate on a clean full `tsc`. Gate on: vitest green, `npx next build` exit 0, and zero `tsc` errors in the files the task touched, checked with `npx tsc --noEmit 2>&1 | grep -E "<touched file paths>"` returning nothing.
- The trip date of a mark is the IST date of its tap time: `istToday(at)` from `lib/booking/window.ts`.
- The trip (`AttDirection` = `'onward' | 'return'` from `lib/boarding/attendance-window.ts`) of a queued mark is decided at TAP time, on the phone by `activeDirection(windows, tapTime)` and on the server by `decideMarkDirection({ windows, requested, windowExempt, now: tapTime })`. Never by arrival time.
- Every `.in()` over ids is chunked to at most 150 and its `error` is checked.
- Warning toasts are `toast(msg, { icon: '⚠️' })`. `toast.warning` does not exist in react-hot-toast and throws.
- The SQL change (Task 2) is dry-run against the live DB, then applied, BEFORE any route that sends `scanned_at` is merged.
- Commits: ask the user once, before the first commit of this branch, whether to commit as you go. If they decline, skip every "Commit" step and leave the work uncommitted.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

## File Map

| File | Status | Responsibility |
|---|---|---|
| `lib/boarding/offline/protocol.ts` | new | Wire types and constants shared by server and phone |
| `lib/boarding/tapped-at.ts` | new | Judge a tap time: `judgeTappedAt`, `partitionByTap` |
| `supabase/migrations/20260911200000_tms_mark_attendance_scanned_at.sql` | new | RPC accepts a per-mark `scanned_at` |
| `lib/boarding/mark-results.ts` | new | Map RPC outcomes and rejections to per-mark `MarkResult[]` |
| `app/api/boarding/attendance/route.ts` | modify | POST judges each mark by tap time, returns `results` |
| `app/api/boarding/scan/route.ts` | modify | POST judges by tap time, stores tap time |
| `app/api/boarding/attendance/roster/route.ts` | modify | Response gains `cards` (JKKN ID to learner) |
| `lib/boarding/offline/kv.ts` | new | Key-value store: memory, IndexedDB, and a resilient wrapper |
| `lib/boarding/offline/snapshot.ts` | new | Saved roster, window settings, access verdict |
| `lib/boarding/offline/outbox.ts` | new | Outbox entries and the problems list |
| `lib/boarding/offline/apply-pending.ts` | new | Overlay unsent marks on the roster, recount tiles |
| `lib/boarding/offline/local-scan.ts` | new | Resolve a scan against the saved roster |
| `lib/boarding/offline/sync.ts` | new | Drain the outbox, settle each server answer |
| `lib/boarding/offline/messages.ts` | new | Toast text for a sync |
| `lib/boarding/offline/transport.ts` | new | `fetch` wrappers for the two endpoints |
| `components/boarding/offline/use-offline-attendance.ts` | new | React hook tying store, sync and events together |
| `components/boarding/offline/offline-status-bar.tsx` | new | Offline / waiting / sign-in banner |
| `components/boarding/offline/offline-problems-panel.tsx` | new | "Not saved" list |
| `components/boarding/offline/use-safe-sign-out.ts` | new | Sign-out that warns about unsent marks |
| `app/boarding/attendance/page.tsx` | modify | Use the outbox, cached roster, banner, problems |
| `app/boarding/attendance/columns.tsx` | modify | "Waiting" / "Pending check" badge |
| `components/boarding/scan-dialog.tsx` | modify | Offline fallback for scans |
| `app/boarding/layout.tsx` | modify | Cached access verdict, safe sign-out |
| `public/sw.js` | modify | Offline start falls back to the last app page |

---

### Task 1: Wire protocol and the tap-time judge

**Files:**
- Create: `lib/boarding/offline/protocol.ts`
- Create: `lib/boarding/tapped-at.ts`
- Test: `lib/boarding/tapped-at.test.ts`

**Interfaces:**
- Consumes: `decideMarkDirection({ windows, requested, windowExempt, now })` from `lib/boarding/trip-direction.ts` (its failure `reason` is `'window_closed' | 'wrong_trip' | 'evening_off' | 'bad_direction'`, with an `error` string); `AttendanceWindows`, `AttDirection` from `lib/boarding/attendance-window.ts`; `istToday(now)` from `lib/booking/window.ts`.
- Produces:
  - `protocol.ts`: `TapRejectReason`, `MarkRejectReason`, `SavedOutcome`, `MarkResult`, `TAP_FUTURE_SKEW_MS`, `SYNC_BATCH_SIZE`, `SYNC_BACKOFF_MS`, `SYNC_INTERVAL_MS`, `REJECT_REASON_TEXT`, `isSavedOutcome(o)`.
  - `tapped-at.ts`: `judgeTappedAt(tappedAt, now, windows, requested, opts?) => TapVerdict` where `TapVerdict = { ok: true; tripDate: string; at: Date; direction: AttDirection } | { ok: false; reason: TapRejectReason; error?: string }`; `partitionByTap(marks, now, windows, requested, opts?) => { accepted: Array<{ mark: T; at: Date; direction: AttDirection }>; rejected: Array<{ mark: T; reason: TapRejectReason }>; tripDate: string }`.

- [ ] **Step 1: Create the protocol module**

`lib/boarding/offline/protocol.ts`:

```ts
/**
 * The wire contract between the offline outbox on the phone and the two mark
 * endpoints (POST /api/boarding/attendance, POST /api/boarding/scan).
 *
 * Types and constants only, so both the server routes and the browser bundle
 * can import it without pulling in either side's dependencies.
 */

/** Why the server refused a mark because of WHEN it was tapped, or for which trip. */
export type TapRejectReason =
  | 'invalid'
  | 'future'
  | 'stale'
  | 'outside_window'
  | 'wrong_trip'
  | 'evening_off';

/** Every reason a queued mark can be refused. */
export type MarkRejectReason =
  | TapRejectReason
  | 'not_on_route'
  | 'not_assigned'
  | 'not_your_share'
  | 'not_booked'
  | 'scan_refused';

export type SavedOutcome = 'inserted' | 'updated_own' | 'overridden' | 'noop_same_status';

/** The server's answer for ONE mark, keyed by the id the phone generated. */
export type MarkResult =
  | { clientId: string; outcome: SavedOutcome; walkUp: boolean }
  | { clientId: string; outcome: 'locked'; markedByName: string }
  | { clientId: string; outcome: 'rejected'; reason: MarkRejectReason; message?: string };

/** A phone clock may run this far ahead of the server before a tap is refused. */
export const TAP_FUTURE_SKEW_MS = 2 * 60_000;
/** Marks per POST /api/boarding/attendance request from the outbox. */
export const SYNC_BATCH_SIZE = 25;
/** Wait after the 1st, 2nd, and every later failed send. */
export const SYNC_BACKOFF_MS = [5_000, 15_000, 60_000] as const;
/** How often the outbox is drained while the phone is online. */
export const SYNC_INTERVAL_MS = 15_000;

/** Plain-words reason shown to the staffer for a refused mark. */
export const REJECT_REASON_TEXT: Record<MarkRejectReason, string> = {
  invalid: 'The phone sent an unreadable time or trip for this mark.',
  future: "The phone's clock is ahead. Check the phone's date and time settings.",
  stale: 'It reached the server after midnight, so it no longer counts.',
  outside_window: 'It was tapped outside the attendance hours.',
  wrong_trip: 'The trip hours were changed, so it no longer matches the trip it was tapped on.',
  evening_off: 'Evening attendance was switched off.',
  not_on_route: 'This student is no longer on the route.',
  not_assigned: 'You are not assigned to this route.',
  not_your_share: 'This student belongs to another in-charge.',
  not_booked: 'Not booked. Scan again with signal to add them as travelled without booking.',
  scan_refused: 'The scan was refused.',
};

export function isSavedOutcome(o: string): o is SavedOutcome {
  return o === 'inserted' || o === 'updated_own' || o === 'overridden' || o === 'noop_same_status';
}
```

- [ ] **Step 2: Write the failing tests**

`lib/boarding/tapped-at.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { judgeTappedAt, partitionByTap } from './tapped-at';
import type { AttendanceWindows } from './attendance-window';

// Morning 07:00–09:30 IST == 01:30–04:00 UTC. Evening 16:30–19:00 IST == 11:00–13:30 UTC.
const W: AttendanceWindows = {
  onward: { direction: 'onward', start: '07:00', end: '09:30', enabled: true, active: true },
  return: { direction: 'return', start: '16:30', end: '19:00', enabled: true, active: true },
};
const at = (iso: string) => new Date(iso);

describe('judgeTappedAt', () => {
  const now = at('2026-09-11T03:00:00Z'); // 08:30 IST, morning open

  it('treats a missing tap time as tapped now', () => {
    expect(judgeTappedAt(undefined, now, W, undefined)).toEqual({ ok: true, tripDate: '2026-09-11', at: now, direction: 'onward' });
    expect(judgeTappedAt('', now, W, 'onward')).toEqual({ ok: true, tripDate: '2026-09-11', at: now, direction: 'onward' });
  });

  it('refuses an unparseable time', () => {
    expect(judgeTappedAt('garbage', now, W, 'onward')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('allows up to two minutes of phone clock skew, and no more', () => {
    expect(judgeTappedAt('2026-09-11T03:01:30Z', now, W, 'onward').ok).toBe(true);
    expect(judgeTappedAt('2026-09-11T03:03:00Z', now, W, 'onward')).toEqual({ ok: false, reason: 'future' });
  });

  it('refuses a tap from an earlier IST day', () => {
    expect(judgeTappedAt('2026-09-10T03:00:00Z', now, W, 'onward')).toEqual({ ok: false, reason: 'stale' });
  });

  it('refuses a tap that arrives after IST midnight', () => {
    const afterMidnight = at('2026-09-11T18:31:00Z'); // 00:01 IST on the 12th
    expect(judgeTappedAt('2026-09-11T03:00:00Z', afterMidnight, W, 'onward')).toEqual({ ok: false, reason: 'stale' });
  });

  it('refuses a tap dated tomorrow in IST even inside the skew', () => {
    const lateNight = at('2026-09-11T18:29:00Z'); // 23:59 IST
    expect(judgeTappedAt('2026-09-11T18:30:30Z', lateNight, W, 'onward', { exemptWindow: true }))
      .toEqual({ ok: false, reason: 'future' });
  });

  it('judges the window at the TAP time, not the arrival time', () => {
    const later = at('2026-09-11T05:00:00Z'); // 10:30 IST, both windows closed
    expect(judgeTappedAt('2026-09-11T03:55:00Z', later, W, 'onward')).toEqual({
      ok: true, tripDate: '2026-09-11', at: at('2026-09-11T03:55:00Z'), direction: 'onward',
    });
    const closed = judgeTappedAt('2026-09-11T04:05:00Z', later, W, 'onward');
    expect(closed).toMatchObject({ ok: false, reason: 'outside_window' });
    expect(closed.ok === false && closed.error).toMatch(/Attendance is open/);
  });

  it('keeps a morning tap a morning mark when it arrives in the evening', () => {
    const evening = at('2026-09-11T12:00:00Z'); // 17:30 IST, evening open
    expect(judgeTappedAt('2026-09-11T03:00:00Z', evening, W, 'onward')).toMatchObject({ ok: true, direction: 'onward' });
    expect(judgeTappedAt('2026-09-11T11:30:00Z', evening, W, 'return')).toMatchObject({ ok: true, direction: 'return' });
  });

  it('refuses a tap whose named trip was not open at the tap time', () => {
    expect(judgeTappedAt('2026-09-11T03:00:00Z', at('2026-09-11T05:00:00Z'), W, 'return'))
      .toMatchObject({ ok: false, reason: 'wrong_trip' });
  });

  it('refuses an evening mark once evening attendance is switched off', () => {
    const off: AttendanceWindows = { ...W, return: { ...W.return, active: false } };
    expect(judgeTappedAt('2026-09-11T11:30:00Z', at('2026-09-11T12:00:00Z'), off, 'return', { exemptWindow: true }))
      .toMatchObject({ ok: false, reason: 'evening_off' });
  });

  it('includes the window start and excludes the window end', () => {
    const later = at('2026-09-11T06:00:00Z');
    expect(judgeTappedAt('2026-09-11T01:30:00Z', later, W, 'onward').ok).toBe(true);
    expect(judgeTappedAt('2026-09-11T04:00:00Z', later, W, 'onward')).toMatchObject({ ok: false, reason: 'outside_window' });
  });

  it('skips the window for exempt callers but keeps the day rules', () => {
    const later = at('2026-09-11T05:00:00Z');
    expect(judgeTappedAt('2026-09-11T04:05:00Z', later, W, 'onward', { exemptWindow: true }))
      .toMatchObject({ ok: true, direction: 'onward' });
    expect(judgeTappedAt('2026-09-10T03:00:00Z', later, W, 'onward', { exemptWindow: true }))
      .toEqual({ ok: false, reason: 'stale' });
  });

  it('treats a morning window without enforced hours as always open', () => {
    const open: AttendanceWindows = { ...W, onward: { ...W.onward, enabled: false } };
    expect(judgeTappedAt('2026-09-11T05:00:00Z', at('2026-09-11T06:00:00Z'), open, 'onward').ok).toBe(true);
  });

  it('refuses an unknown trip name', () => {
    expect(judgeTappedAt('2026-09-11T03:00:00Z', now, W, 'midday')).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('partitionByTap', () => {
  it('splits accepted from rejected and reports the IST trip date and trip', () => {
    const now = at('2026-09-11T03:05:00Z');
    const marks = [
      { clientId: 'a', tappedAt: '2026-09-11T03:00:00Z' },
      { clientId: 'b', tappedAt: 'garbage' },
      { clientId: 'c' },
    ];
    const out = partitionByTap(marks, now, W, 'onward');
    expect(out.tripDate).toBe('2026-09-11');
    expect(out.accepted.map((a) => [a.mark.clientId, a.direction])).toEqual([['a', 'onward'], ['c', 'onward']]);
    expect(out.accepted[0].at).toEqual(at('2026-09-11T03:00:00Z'));
    expect(out.accepted[1].at).toEqual(now);
    expect(out.rejected).toEqual([{ mark: marks[1], reason: 'invalid' }]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/tapped-at.test.ts`
Expected: FAIL, "Failed to resolve import ./tapped-at".

- [ ] **Step 4: Implement the judge**

`lib/boarding/tapped-at.ts`:

```ts
/**
 * Judge a mark by WHEN IT WAS TAPPED, not when it reached the server.
 *
 * A mark made on a bus with no signal arrives late. Judging it at arrival
 * would refuse a mark tapped at 09:20 and sent at 09:40 as "window closed",
 * file a morning mark sent at 17:30 under the evening trip, and store a mark
 * sent the next morning under the wrong day. So the phone sends its tap time
 * and the server bounds how far that claim can go:
 *
 *   - no later than TAP_FUTURE_SKEW_MS ahead of the server clock, and never
 *     on a later IST day (a phone clock running ahead);
 *   - on the same IST day as the server (arrived after midnight = stale);
 *   - the trip and its window are decided by decideMarkDirection AT THE TAP
 *     TIME -- the same rule evening attendance uses at arrival, fed a
 *     different clock.
 *
 * Consequence worth knowing: every accepted mark's trip date is today in IST,
 * so a request can never mix days.
 */
import type { AttDirection, AttendanceWindows } from './attendance-window';
import { decideMarkDirection } from './trip-direction';
import { istToday } from '@/lib/booking/window';
import { TAP_FUTURE_SKEW_MS, type TapRejectReason } from './offline/protocol';

export type TapVerdict =
  | { ok: true; tripDate: string; at: Date; direction: AttDirection }
  | { ok: false; reason: TapRejectReason; error?: string };

const FROM_DECISION = {
  window_closed: 'outside_window',
  wrong_trip: 'wrong_trip',
  evening_off: 'evening_off',
  bad_direction: 'invalid',
} as const satisfies Record<string, TapRejectReason>;

export function judgeTappedAt(
  tappedAt: string | null | undefined,
  now: Date,
  windows: AttendanceWindows,
  requested: unknown,
  opts: { exemptWindow?: boolean } = {},
): TapVerdict {
  let at: Date;
  if (tappedAt === undefined || tappedAt === null || tappedAt === '') {
    at = now;
  } else {
    const ms = Date.parse(tappedAt);
    if (Number.isNaN(ms)) return { ok: false, reason: 'invalid' };
    at = new Date(ms);
  }

  if (at.getTime() - now.getTime() > TAP_FUTURE_SKEW_MS) return { ok: false, reason: 'future' };

  const tripDate = istToday(at);
  const today = istToday(now);
  if (tripDate > today) return { ok: false, reason: 'future' };
  if (tripDate < today) return { ok: false, reason: 'stale' };

  const decided = decideMarkDirection({ windows, requested, windowExempt: !!opts.exemptWindow, now: at });
  if (!decided.ok) return { ok: false, reason: FROM_DECISION[decided.reason], error: decided.error };

  return { ok: true, tripDate, at, direction: decided.direction };
}

export function partitionByTap<T extends { tappedAt?: string | null }>(
  marks: T[],
  now: Date,
  windows: AttendanceWindows,
  requested: unknown,
  opts: { exemptWindow?: boolean } = {},
): {
  accepted: Array<{ mark: T; at: Date; direction: AttDirection }>;
  rejected: Array<{ mark: T; reason: TapRejectReason }>;
  tripDate: string;
} {
  const accepted: Array<{ mark: T; at: Date; direction: AttDirection }> = [];
  const rejected: Array<{ mark: T; reason: TapRejectReason }> = [];
  for (const mark of marks) {
    const v = judgeTappedAt(mark.tappedAt, now, windows, requested, opts);
    if (v.ok) accepted.push({ mark, at: v.at, direction: v.direction });
    else rejected.push({ mark, reason: v.reason });
  }
  return { accepted, rejected, tripDate: istToday(now) };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/tapped-at.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/boarding/offline/protocol.ts lib/boarding/tapped-at.ts lib/boarding/tapped-at.test.ts
git commit -m "feat(boarding): judge an attendance mark by when it was tapped"
```

---

### Task 2: Let `tms_mark_attendance` store the tap time

**Files:**
- Create: `supabase/migrations/20260911200000_tms_mark_attendance_scanned_at.sql`

**Interfaces:**
- Consumes: the live function `tms_mark_attendance(p_marks jsonb, p_trip_date date, p_direction text, p_actor uuid, p_method text, p_allow_override boolean)`.
- Produces: the same signature and return columns. Each element of `p_marks` may now carry `scanned_at` (ISO timestamp). Absent or empty means `now()`, exactly as before.

- [ ] **Step 1: Write the migration**

The body below is the live function (dumped 2026-09-11) with ONE change: a per-mark `v_at` replaces `v_now` in the VALUES list. Keep `#variable_conflict use_column` directly after `as $$`; without it every call fails with SQLSTATE 42702 (the 2026-08-28 incident). The function is `SECURITY INVOKER` with no `search_path` setting; `create or replace` keeps its owner and grants, so add no GRANT or REVOKE.

`supabase/migrations/20260911200000_tms_mark_attendance_scanned_at.sql`:

```sql
-- tms_mark_attendance: accept a per-mark scanned_at (the time the staffer TAPPED).
--
-- Offline boarding attendance sends marks late, when signal returns. The route
-- already validates the tap time (lib/boarding/tapped-at.ts); this lets the
-- stored scanned_at say when the learner boarded rather than when the phone
-- found signal. A mark without scanned_at behaves exactly as before: now().
--
-- Signature, return columns, security (INVOKER) and grants are unchanged.

create or replace function public.tms_mark_attendance(
  p_marks jsonb,
  p_trip_date date,
  p_direction text,
  p_actor uuid,
  p_method text,
  p_allow_override boolean
)
returns table (
  learner_id uuid,
  outcome text,
  existing_status text,
  existing_by uuid,
  existing_at timestamptz
)
language plpgsql
as $$
#variable_conflict use_column
declare
  m           jsonb;
  v_learner   uuid;
  v_now       timestamptz := now();
  v_at        timestamptz;
  v_prev      record;
  v_written   boolean;
begin
  if p_direction not in ('onward', 'return') then
    raise exception 'direction must be onward or return, got %', p_direction;
  end if;
  if p_actor is null then
    raise exception 'actor is required';
  end if;

  for m in select * from jsonb_array_elements(p_marks)
  loop
    v_learner := (m->>'learner_id')::uuid;
    v_at := coalesce(nullif(m->>'scanned_at', '')::timestamptz, v_now);

    if (m->>'status') not in ('present', 'absent') then
      raise exception 'status must be present or absent, got %', (m->>'status');
    end if;

    select a.status, a.scanned_by, a.scanned_at
      into v_prev
      from public.tms_attendance a
     where a.learner_id = v_learner
       and a.trip_date  = p_trip_date
       and a.direction  = p_direction;

    insert into public.tms_attendance as t (
      learner_id, route_id, stop_id, trip_date, direction,
      status, method, is_walk_up, scanned_by, scanned_at
    )
    values (
      v_learner,
      (m->>'route_id')::uuid,
      nullif(m->>'stop_id', '')::uuid,
      p_trip_date,
      p_direction,
      m->>'status',
      p_method,
      coalesce((m->>'is_walk_up')::boolean, false),
      p_actor,
      v_at
    )
    on conflict (learner_id, trip_date, direction) do update
    set status              = excluded.status,
        method              = excluded.method,
        is_walk_up          = case when m ? 'is_walk_up'
                                   then excluded.is_walk_up else t.is_walk_up end,
        scanned_by          = excluded.scanned_by,
        scanned_at          = excluded.scanned_at,
        previous_status     = case
                                when t.scanned_by is distinct from excluded.scanned_by
                                 and t.status     is distinct from excluded.status
                                then t.status else t.previous_status end,
        previous_scanned_by = case
                                when t.scanned_by is distinct from excluded.scanned_by
                                 and t.status     is distinct from excluded.status
                                then t.scanned_by else t.previous_scanned_by end,
        previous_scanned_at = case
                                when t.scanned_by is distinct from excluded.scanned_by
                                 and t.status     is distinct from excluded.status
                                then t.scanned_at else t.previous_scanned_at end
      where t.status is distinct from excluded.status
        and (
          t.scanned_by is null
          or t.scanned_by = p_actor
          or p_allow_override
          or coalesce((m->>'allow_override')::boolean, false)
        )
    returning true into v_written;

    learner_id      := v_learner;
    existing_status := v_prev.status;
    existing_by     := v_prev.scanned_by;
    existing_at     := v_prev.scanned_at;

    if v_written then
      outcome := case
                   when v_prev.status is null then 'inserted'
                   when v_prev.scanned_by is not distinct from p_actor then 'updated_own'
                   else 'overridden'
                 end;
    else
      outcome := case
                   when v_prev.status is not distinct from (m->>'status') then 'noop_same_status'
                   else 'locked'
                 end;
    end if;

    v_written := null;
    return next;
  end loop;
end;
$$;
```

- [ ] **Step 2: Confirm the live body still matches what the migration was built from**

Run with `mcp__supabase__execute_sql`:

```sql
select md5(prosrc) as live_md5, position('scanned_at''' in prosrc) > 0 as already_has_key
from pg_proc where proname = 'tms_mark_attendance';
```

Expected: `already_has_key = false`. If it is `true`, someone changed the function since 2026-09-11: STOP, dump `prosrc`, and rebase this migration on it before continuing.

- [ ] **Step 3: Dry-run the NEW function against the live DB, rolled back**

Run with `mcp__supabase__execute_sql` as ONE script: `begin;`, then the full `create or replace function ...;` from Step 1, then the block below, then `rollback;`. The `raise exception` aborts the transaction, so both the function replacement and the test rows vanish. The trip date `2000-01-01` touches no real day.

```sql
do $$
declare
  v_learner  uuid; v_learner2 uuid; v_route uuid; v_actor uuid;
  r1 record; r2 record; s1 timestamptz; s2 timestamptz;
begin
  select id, transport_route_id into v_learner, v_route
    from learners_profiles where transport_route_id is not null order by id limit 1;
  select id into v_learner2
    from learners_profiles where transport_route_id = v_route and id <> v_learner order by id limit 1;
  select id into v_actor from profiles order by id limit 1;

  select * into r1 from tms_mark_attendance(
    jsonb_build_array(jsonb_build_object('learner_id', v_learner, 'route_id', v_route,
      'status', 'present', 'scanned_at', '2000-01-01T02:00:00Z')),
    '2000-01-01', 'onward', v_actor, 'manual', false);
  select * into r2 from tms_mark_attendance(
    jsonb_build_array(jsonb_build_object('learner_id', v_learner2, 'route_id', v_route, 'status', 'absent')),
    '2000-01-01', 'onward', v_actor, 'manual', false);

  select scanned_at into s1 from tms_attendance where learner_id = v_learner  and trip_date = '2000-01-01';
  select scanned_at into s2 from tms_attendance where learner_id = v_learner2 and trip_date = '2000-01-01';

  raise exception 'TESTRESULT: r1=% s1=% | r2=% s2_is_now=%', r1.outcome, s1, r2.outcome, (s2 = now());
end $$;
```

Expected: an error whose text is
`TESTRESULT: r1=inserted s1=2000-01-01 02:00:00+00 | r2=inserted s2_is_now=t`.
Any other text (especially SQLSTATE 42702) means the function is broken: fix it before Step 4.

- [ ] **Step 4: Confirm the dry run left nothing behind**

```sql
select position('scanned_at''' in prosrc) > 0 as has_key,
       (select count(*) from tms_attendance where trip_date = '2000-01-01') as leftover
from pg_proc where proname = 'tms_mark_attendance';
```

Expected: `has_key = false`, `leftover = 0`.

- [ ] **Step 5: Apply the migration**

Use `mcp__supabase__apply_migration` with name `tms_mark_attendance_scanned_at` and the SQL from Step 1.

- [ ] **Step 6: Verify the applied function and its grants**

```sql
select position('scanned_at''' in p.prosrc) > 0 as has_key,
       position('#variable_conflict use_column' in p.prosrc) > 0 as has_conflict_pragma,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_exec,
       p.prosecdef as security_definer
from pg_proc p where p.proname = 'tms_mark_attendance';
```

Expected: `has_key = true`, `has_conflict_pragma = true`, `svc_exec = true`, `security_definer = false`. Then re-run Step 3's DO block ALONE (no `create`, still wrapped in `begin; ... rollback;`) and expect the same `TESTRESULT` text.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260911200000_tms_mark_attendance_scanned_at.sql
git commit -m "feat(attendance): let tms_mark_attendance store the tap time"
```

---

### Task 3: Per-mark results for a batch

**Files:**
- Create: `lib/boarding/mark-results.ts`
- Test: `lib/boarding/mark-results.test.ts`

**Interfaces:**
- Consumes: `RpcMarkOutcome` from `lib/boarding/mark-batch.ts`; `MarkResult`, `MarkRejectReason`, `isSavedOutcome` from Task 1.
- Produces: `buildMarkResults(args: { rejected: Array<{ clientId?: string; reason: MarkRejectReason }>; sent: Array<{ clientId?: string; walkUp: boolean }>; outcomes: RpcMarkOutcome[]; markerName: (profileId: string | null) => string }) => MarkResult[]`. `sent[i]` is the mark that produced `outcomes[i]` (the RPC answers in request order). Marks with no `clientId` are left out.

- [ ] **Step 1: Write the failing tests**

`lib/boarding/mark-results.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildMarkResults } from './mark-results';
import type { RpcMarkOutcome } from './mark-batch';

const out = (learner_id: string, outcome: RpcMarkOutcome['outcome'], existing_by: string | null = null): RpcMarkOutcome => ({
  learner_id, outcome, existing_status: null, existing_by, existing_at: null,
});
const names = (id: string | null) => (id === 'p-kavya' ? 'Kavya' : 'another staff member');

describe('buildMarkResults', () => {
  it('maps every saved outcome to a saved result carrying walkUp', () => {
    const r = buildMarkResults({
      rejected: [],
      sent: [
        { clientId: 'a', walkUp: false },
        { clientId: 'b', walkUp: true },
        { clientId: 'c', walkUp: false },
        { clientId: 'd', walkUp: false },
      ],
      outcomes: [out('1', 'inserted'), out('2', 'inserted'), out('3', 'updated_own'), out('4', 'noop_same_status')],
      markerName: names,
    });
    expect(r).toEqual([
      { clientId: 'a', outcome: 'inserted', walkUp: false },
      { clientId: 'b', outcome: 'inserted', walkUp: true },
      { clientId: 'c', outcome: 'updated_own', walkUp: false },
      { clientId: 'd', outcome: 'noop_same_status', walkUp: false },
    ]);
  });

  it('names the holder of a locked mark', () => {
    const r = buildMarkResults({
      rejected: [], sent: [{ clientId: 'a', walkUp: false }],
      outcomes: [out('1', 'locked', 'p-kavya')], markerName: names,
    });
    expect(r).toEqual([{ clientId: 'a', outcome: 'locked', markedByName: 'Kavya' }]);
  });

  it('passes rejections through and puts them first', () => {
    const r = buildMarkResults({
      rejected: [{ clientId: 'x', reason: 'stale' }],
      sent: [{ clientId: 'a', walkUp: false }],
      outcomes: [out('1', 'overridden')], markerName: names,
    });
    expect(r).toEqual([
      { clientId: 'x', outcome: 'rejected', reason: 'stale' },
      { clientId: 'a', outcome: 'overridden', walkUp: false },
    ]);
  });

  it('leaves out marks with no clientId (older clients)', () => {
    const r = buildMarkResults({
      rejected: [{ reason: 'invalid' }],
      sent: [{ walkUp: false }],
      outcomes: [out('1', 'inserted')], markerName: names,
    });
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/mark-results.test.ts`
Expected: FAIL, "Failed to resolve import ./mark-results".

- [ ] **Step 3: Implement**

`lib/boarding/mark-results.ts`:

```ts
/**
 * One answer per mark, keyed by the id the phone generated.
 *
 * The outbox on a boarding staffer's phone sends marks in batches and must
 * settle each one individually: remove what was saved, show what a colleague
 * holds, keep what was refused in a "Not saved" list. The route's aggregate
 * counts cannot do that, so it also returns this list.
 *
 * Pure. `sent[i]` MUST be the mark that produced `outcomes[i]` -- the RPC
 * answers one row per mark in request order.
 */
import type { RpcMarkOutcome } from './mark-batch';
import { isSavedOutcome, type MarkRejectReason, type MarkResult } from './offline/protocol';

export function buildMarkResults(args: {
  rejected: Array<{ clientId?: string; reason: MarkRejectReason }>;
  sent: Array<{ clientId?: string; walkUp: boolean }>;
  outcomes: RpcMarkOutcome[];
  markerName: (profileId: string | null) => string;
}): MarkResult[] {
  const results: MarkResult[] = [];

  for (const r of args.rejected) {
    if (r.clientId) results.push({ clientId: r.clientId, outcome: 'rejected', reason: r.reason });
  }

  args.outcomes.forEach((o, i) => {
    const mark = args.sent[i];
    if (!mark?.clientId) return;
    if (o.outcome === 'locked') {
      results.push({ clientId: mark.clientId, outcome: 'locked', markedByName: args.markerName(o.existing_by) });
    } else if (isSavedOutcome(o.outcome)) {
      results.push({ clientId: mark.clientId, outcome: o.outcome, walkUp: mark.walkUp });
    }
  });

  return results;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/mark-results.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/mark-results.ts lib/boarding/mark-results.test.ts
git commit -m "feat(boarding): report one result per mark in a batch"
```

---

### Task 4: Attendance POST judges each mark by tap time

**Files:**
- Modify: `app/api/boarding/attendance/route.ts` (the `mark` function, as of `origin/main` `54ca971`)

**Interfaces:**
- Consumes: `partitionByTap` (Task 1), `buildMarkResults` (Task 3), `MarkRejectReason` (Task 1), the RPC's per-mark `scanned_at` (Task 2); the existing `decideMarkDirection` call in the route.
- Produces: request marks accept `tappedAt?: string` and `clientId?: string`. A request carrying any `tappedAt` MUST name `direction` (`'onward' | 'return'`); every mark in it is judged for that trip at its own tap time. Every JSON response of POST that reaches the RPC stage, and the new early "nothing accepted" response, includes `results: MarkResult[]`. Old fields (`updated`, `skipped`, `locked`, `dropped`, `walkUps`) are unchanged. A request with no `tappedAt` on any mark behaves exactly as before.

- [ ] **Step 1: Add imports**

After the existing `import { istToday } from '@/lib/booking/window';` line add:

```ts
import { partitionByTap } from '@/lib/boarding/tapped-at';
import { buildMarkResults } from '@/lib/boarding/mark-results';
import type { MarkRejectReason } from '@/lib/boarding/offline/protocol';
```

- [ ] **Step 2: Extend the mark input**

Replace:

```ts
interface MarkInput { learnerId: string; status: 'present' | 'absent' }
```

with:

```ts
interface MarkInput {
  learnerId: string;
  status: 'present' | 'absent';
  /** When the staffer tapped, from the phone. Absent on older clients. */
  tappedAt?: string;
  /** Phone-generated id, echoed in `results` so the outbox can settle this mark. */
  clientId?: string;
}
```

- [ ] **Step 3: Replace the trip and window gate**

Replace this block (from the comment `// Time-window gate: manual marking follows the same window as the scanner` through `const direction: AttDirection = decided.direction;`):

```ts
    const windows = await loadAttendanceWindows(svc);
    const decided = decideMarkDirection({
      windows,
      requested: body.direction,
      windowExempt: auth.isSuperAdmin || isOverrideHolder,
    });
    if (!decided.ok) {
      return NextResponse.json({ error: decided.error, reason: decided.reason }, { status: decided.status });
    }
    const direction: AttDirection = decided.direction;
```

(together with the comment lines above it) with:

```ts
    // Which trip, and is its window open. Two contracts:
    //  - LEGACY: no mark carries tappedAt. The server clock decides the trip
    //    for the whole request at arrival, exactly as before (see
    //    lib/boarding/trip-direction.ts).
    //  - OFFLINE-AWARE: the request names its trip, and EACH mark is judged for
    //    that trip at the moment it was TAPPED. A morning mark made on a bus
    //    with no signal and sent at 17:30 is still a morning mark, and still
    //    counts. See lib/boarding/tapped-at.ts for the bounds.
    // A window-exempt caller (super admin, override holder) skips the window in
    // both contracts -- they exist to fix a mark after it closes.
    const exempt = auth.isSuperAdmin || isOverrideHolder;
    const windows = await loadAttendanceWindows(svc);
    const legacy = marks.every((m) => !m.tappedAt);
    const now = new Date();

    let direction: AttDirection;
    if (legacy) {
      const decided = decideMarkDirection({ windows, requested: body.direction, windowExempt: exempt });
      if (!decided.ok) {
        return NextResponse.json({ error: decided.error, reason: decided.reason }, { status: decided.status });
      }
      direction = decided.direction;
    } else {
      // A queued batch is one trip. Without a named trip there is no way to say
      // which trip a late mark belongs to, so refuse rather than guess.
      if (body.direction !== 'onward' && body.direction !== 'return') {
        return NextResponse.json(
          { error: 'Name the trip (onward or return) when sending tap times.', reason: 'bad_direction' },
          { status: 400 },
        );
      }
      direction = body.direction;
    }

    const tap = legacy
      ? { accepted: marks.map((mark) => ({ mark, at: now })), rejected: [] as Array<{ mark: MarkInput; reason: MarkRejectReason }>, tripDate: istToday(now) }
      : partitionByTap(marks, now, windows, direction, { exemptWindow: exempt });
    const rejected: Array<{ clientId?: string; reason: MarkRejectReason }> =
      tap.rejected.map((r) => ({ clientId: r.mark.clientId, reason: r.reason }));
    const tapAt = new Map<MarkInput, Date>(tap.accepted.map((a) => [a.mark, a.at] as const));
    const acceptedMarks = tap.accepted.map((a) => a.mark);
```

`partitionByTap` only accepts a mark whose trip at tap time IS `direction` (anything else comes back `wrong_trip`), so every accepted mark belongs to the one trip the RPC call below writes.

- [ ] **Step 4: Derive the dates from the tap**

Replace:

```ts
    const authDate = istToday();
    const today = new Date().toISOString().slice(0, 10);
```

with:

```ts
    const authDate = legacy ? istToday() : tap.tripDate;
    // Legacy requests keep storing under the UTC date (see the note above).
    // Offline-aware requests store under the IST date of the tap. Inside the
    // attendance window the two are the same calendar day.
    const today = legacy ? new Date().toISOString().slice(0, 10) : tap.tripDate;

    if (acceptedMarks.length === 0) {
      // Every mark was refused for its timing. Not an error: the outbox needs
      // the per-mark reasons to move them to its "Not saved" list.
      return NextResponse.json({
        success: true, updated: 0, skipped: 0, locked: [], dropped: marks.length, walkUps: 0,
        results: buildMarkResults({ rejected, sent: [], outcomes: [], markerName: () => '' }),
      });
    }
```

- [ ] **Step 5: Use only accepted marks from here on**

In the `if (markable)` block, change `const outside = marks.filter(` to `const outside = acceptedMarks.filter(`.

Change `const learnerIds = [...new Set(marks.map((m) => m.learnerId).filter(Boolean))];` to:

```ts
    const learnerIds = [...new Set(acceptedMarks.map((m) => m.learnerId).filter(Boolean))];
```

- [ ] **Step 6: Build rows with the tap time and a parallel `sent` list**

Replace the statement that begins `const rows = marks` and ends with its closing `}));` with:

```ts
    const isValidStatus = (m: MarkInput) => m.status === 'present' || m.status === 'absent';
    const onRoute = acceptedMarks.filter((m) => stopByLearner.has(m.learnerId) && isValidStatus(m));
    for (const m of acceptedMarks) {
      if (!onRoute.includes(m)) {
        rejected.push({ clientId: m.clientId, reason: isValidStatus(m) ? 'not_on_route' : 'invalid' });
      }
    }

    const rows = onRoute.map((m) => ({
      learner_id: m.learnerId,
      route_id: routeId,
      stop_id: stopByLearner.get(m.learnerId) ?? null,
      status: m.status,
      // "Boarded without a booking" -- a claim about RIDING, so it can only
      // be true of a PRESENT mark. See the history above for why.
      is_walk_up: m.status === 'present' && !bookedLearners.has(m.learnerId),
      // PER-LEARNER entitlement; mirrors decideMark's isLearnerOwner.
      allow_override: markable ? markable.own.has(m.learnerId) : false,
      // When the staffer tapped, so the record says when they boarded rather
      // than when the phone found signal. Needs the 20260911200000 migration.
      scanned_at: (tapAt.get(m) ?? now).toISOString(),
    }));
    // sent[i] produced outcomes[i]: the RPC answers in request order.
    const sent = onRoute.map((m, i) => ({ clientId: m.clientId, walkUp: rows[i].is_walk_up }));
```

Keep the long comments that sat above the old `is_walk_up` and `allow_override` lines if you prefer; the behaviour is identical.

- [ ] **Step 7: Answer an all-off-route batch with results for new clients**

Replace:

```ts
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid learners for this route' }, { status: 400 });
    }
```

with:

```ts
    if (rows.length === 0) {
      if (legacy) {
        return NextResponse.json({ error: 'No valid learners for this route' }, { status: 400 });
      }
      return NextResponse.json({
        success: true, updated: 0, skipped: 0, locked: [], dropped: marks.length, walkUps: 0,
        results: buildMarkResults({ rejected, sent: [], outcomes: [], markerName: () => '' }),
      });
    }
```

- [ ] **Step 8: Build the results after the RPC and return them**

Directly after the `const locked = summary.locked.map(...)` statement add:

```ts
    const results = buildMarkResults({
      rejected,
      sent,
      outcomes: (outcomes ?? []) as RpcMarkOutcome[],
      markerName: (id) => (id && lockedNames.get(id)) || 'another staff member',
    });
```

In the `all_locked` 409 response object add `results,` after `locked,`. In the final success response change:

```ts
    return NextResponse.json({
      success: true, updated: written, skipped, locked, dropped: summary.dropped,
      walkUps: notified.length,
    });
```

to:

```ts
    return NextResponse.json({
      success: true, updated: written, skipped, locked, dropped: summary.dropped,
      walkUps: notified.length, results,
    });
```

- [ ] **Step 9: Type-check the file and run the boarding tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/api/boarding/attendance/route.ts"`
Expected: no output.

Run: `npx vitest run lib/boarding`
Expected: PASS (122 existing tests plus Tasks 1 and 3).

- [ ] **Step 10: Commit**

```bash
git add app/api/boarding/attendance/route.ts
git commit -m "feat(boarding): accept late attendance marks judged by tap time"
```

---

### Task 5: Scan POST judges by tap time

**Files:**
- Modify: `app/api/boarding/scan/route.ts` (as of `origin/main` `54ca971`)

**Interfaces:**
- Consumes: `judgeTappedAt` (Task 1), RPC `scanned_at` (Task 2).
- Produces: the body accepts `tappedAt?: string` and `clientId?: string`. The trip and window are judged at the tap time (arrival time when `tappedAt` is absent, which is exactly today's behaviour). Refusals keep evening attendance's reason names for existing screens: `window_closed`, `wrong_trip`, `evening_off`, `bad_direction`; plus `stale`, `future` and `invalid` (unparseable time) for queued scans. Success and `not_booked` responses carry `clientId`.

- [ ] **Step 1: Import the judge**

Add after the `trip-direction` import line:

```ts
import { judgeTappedAt } from '@/lib/boarding/tapped-at';
```

- [ ] **Step 2: Accept the new body fields**

Change the body type to:

```ts
    const body = (await request.json().catch(() => ({}))) as {
      token?: string; direction?: string; walkUp?: boolean; source?: string;
      tappedAt?: string; clientId?: string;
    };
```

- [ ] **Step 3: Replace the trip check with the tap-time judge**

Replace this block:

```ts
    const windows = await loadAttendanceWindows(svc);
    const decided = decideMarkDirection({ windows, requested: body.direction, windowExempt: false });
    if (!decided.ok) {
      return NextResponse.json({
        ok: false,
        reason: decided.reason,
        error: decided.error,
        activeDirection: activeDirection(windows),
      }, { status: decided.status });
    }
    const direction: AttDirection = decided.direction;
```

with:

```ts
    const windows = await loadAttendanceWindows(svc);
    // Judged at the moment of the SCAN. A scan queued on a bus with no signal
    // arrives late; it counts if it was scanned inside its trip's window today.
    // With no tappedAt this is the same check as before, at arrival.
    const tap = judgeTappedAt(body.tappedAt, new Date(), windows, body.direction);
    if (!tap.ok) {
      // Keep evening attendance's reason names for the existing scan screen.
      const reason =
        tap.reason === 'outside_window' ? 'window_closed'
        : tap.reason === 'invalid' && !body.tappedAt ? 'bad_direction'
        : tap.reason;
      return NextResponse.json({
        ok: false,
        clientId: body.clientId ?? null,
        reason,
        error: tap.error ?? REJECT_REASON_TEXT[tap.reason],
        activeDirection: activeDirection(windows),
      }, { status: tap.reason === 'invalid' ? 400 : 409 });
    }
    const direction: AttDirection = tap.direction;
```

and extend the import from Task 1's protocol:

```ts
import { REJECT_REASON_TEXT } from '@/lib/boarding/offline/protocol';
```

- [ ] **Step 4: Store under the tap's date and time**

Replace `const today = istToday();` with:

```ts
    // The IST date of the scan. Identical to istToday() for a live scan.
    const today = tap.tripDate;
```

In the `svc.rpc('tms_mark_attendance', ...)` call add `scanned_at: tap.at.toISOString(),` to the single object in `p_marks` (after `is_walk_up: isWalkUp,`).

- [ ] **Step 5: Echo the clientId**

In the `not_booked` response object add `clientId: body.clientId ?? null,` after `ok: false,`. In the final success response (the `return NextResponse.json({` after `logActivity`) add `clientId: body.clientId ?? null,` as its first property.

- [ ] **Step 6: Tidy imports**

Run: `grep -n "istToday\|decideMarkDirection" app/api/boarding/scan/route.ts`
`istToday` is still used by `resolveLearnerId` (pass codes), so it stays. If `decideMarkDirection` now appears only in its import line, remove it from that import (keep any other names on that line).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/api/boarding/scan/route.ts"`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add app/api/boarding/scan/route.ts
git commit -m "feat(boarding): judge a scan by when it was scanned"
```

---

### Task 6: Roster carries the route's card numbers

**Files:**
- Modify: `app/api/boarding/attendance/roster/route.ts`

**Interfaces:**
- Produces: `data.cards: Record<string, string>` in the roster response, mapping an ACTIVE JKKN ID (`jkkn_identities.jkkn_id`, e.g. `348295-7`) to `learners_profiles.id`, for learners on the returned rows only.

- [ ] **Step 1: Build the map**

Insert immediately before `const present = rows.filter((r) => r.status === 'present').length;`:

```ts
    // Offline card scanning: the phone matches a camera-read JKKN ID against
    // this map when there is no signal. ACTIVE cards only -- a retired card
    // must never mark anyone present, offline or not. The number is printed on
    // the card itself, so sending it to the in-charge's phone discloses nothing.
    // Best-effort: on a failed read the phone just treats every card as
    // "unknown, will check when online".
    const cards: Record<string, string> = {};
    const rosterIds = [...new Set(rows.map((r) => r.learner_id))];
    for (let i = 0; i < rosterIds.length; i += 150) {
      const { data: idRows, error: idErr } = await svc
        .from('jkkn_identities')
        .select('jkkn_id, learner_profile_id')
        .in('learner_profile_id', rosterIds.slice(i, i + 150))
        .is('retired_at', null);
      if (idErr) {
        console.error('boarding roster: card map read failed (non-fatal):', idErr);
        break;
      }
      for (const r of (idRows ?? []) as Array<{ jkkn_id: string; learner_profile_id: string | null }>) {
        if (r.learner_profile_id) cards[r.jkkn_id] = r.learner_profile_id;
      }
    }
```

- [ ] **Step 2: Return it**

In the success response's `data` object add `cards,` after `rows,`.

- [ ] **Step 3: Sanity-check the data shape against the live DB**

```sql
select count(*) filter (where retired_at is null and learner_profile_id is not null) as active_learner_cards,
       count(*) filter (where jkkn_id !~ '^[0-9]{6}-[0-9]$') as odd_format
from jkkn_identities;
```

Expected: `active_learner_cards` in the thousands, `odd_format = 0`. If `odd_format > 0`, note it in the task report; `classifyScan` only recognises the `NNNNNN-N` shape.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/api/boarding/attendance/roster/route.ts"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/boarding/attendance/roster/route.ts
git commit -m "feat(boarding): send the route's card numbers with the roster"
```

---

### Task 7: Phone storage and saved snapshots

**Files:**
- Create: `lib/boarding/offline/kv.ts`
- Create: `lib/boarding/offline/snapshot.ts`
- Test: `lib/boarding/offline/kv.test.ts`
- Test: `lib/boarding/offline/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `kv.ts`: `interface Kv { get<T>(key): Promise<T | undefined>; set<T>(key, value: T): Promise<void>; del(key): Promise<void>; list<T>(prefix): Promise<Array<{ key: string; value: T }>> }`; `memoryKv(): Kv`; `idbKv(dbName?): Kv`; `resilientKv(primary: Kv, fallback: Kv): Kv`; `offlineKv(): Kv` (process-wide singleton).
  - `snapshot.ts`: `Saved<T> = { savedAt: string; value: T }`; `saveRoster<T>(kv, userId, date, roster: T, now: Date)`; `loadRoster<T>(kv, userId, date): Promise<Saved<T> | null>`; `saveWindows<T>(kv, userId, windows: T, now)`; `loadWindows<T>(kv, userId): Promise<Saved<T> | null>`; `saveAccess(kv, userId, date, gate: string, now)`; `loadAccess(kv, userId, date): Promise<string | null>`; `pruneSnapshots(kv, userId, today)`.

- [ ] **Step 1: Write the failing tests**

`lib/boarding/offline/kv.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { memoryKv, resilientKv, type Kv } from './kv';

describe('memoryKv', () => {
  it('stores, lists by prefix in key order, and deletes', async () => {
    const kv = memoryKv();
    await kv.set('a:2', { n: 2 });
    await kv.set('a:1', { n: 1 });
    await kv.set('b:1', { n: 3 });
    expect(await kv.get('a:1')).toEqual({ n: 1 });
    expect((await kv.list('a:')).map((e) => e.key)).toEqual(['a:1', 'a:2']);
    await kv.del('a:1');
    expect(await kv.get('a:1')).toBeUndefined();
  });

  it('returns copies, like IndexedDB does', async () => {
    const kv = memoryKv();
    const v = { n: 1 };
    await kv.set('k', v);
    v.n = 99;
    expect(await kv.get('k')).toEqual({ n: 1 });
  });
});

describe('resilientKv', () => {
  it('switches to the fallback for good after the primary throws', async () => {
    const boom = vi.fn(async () => { throw new Error('no indexeddb'); });
    const broken: Kv = { get: boom, set: boom, del: boom, list: boom } as unknown as Kv;
    const fallback = memoryKv();
    const kv = resilientKv(broken, fallback);
    await kv.set('k', 1);
    expect(await kv.get('k')).toBe(1);
    expect(boom).toHaveBeenCalledTimes(1);
  });
});
```

`lib/boarding/offline/snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { memoryKv } from './kv';
import {
  loadAccess, loadRoster, loadWindows, pruneSnapshots, saveAccess, saveRoster, saveWindows,
} from './snapshot';

const NOW = new Date('2026-09-11T02:12:00Z');

describe('snapshot', () => {
  it('round-trips a roster for one user and day only', async () => {
    const kv = memoryKv();
    await saveRoster(kv, 'u1', '2026-09-11', { rows: [1] }, NOW);
    expect(await loadRoster(kv, 'u1', '2026-09-11')).toEqual({ savedAt: NOW.toISOString(), value: { rows: [1] } });
    expect(await loadRoster(kv, 'u2', '2026-09-11')).toBeNull();
    expect(await loadRoster(kv, 'u1', '2026-09-10')).toBeNull();
  });

  it('round-trips window settings and the access verdict', async () => {
    const kv = memoryKv();
    await saveWindows(kv, 'u1', { onward: { start: '06:45' } }, NOW);
    await saveAccess(kv, 'u1', '2026-09-11', 'in_duty', NOW);
    expect((await loadWindows(kv, 'u1'))?.value).toEqual({ onward: { start: '06:45' } });
    expect(await loadAccess(kv, 'u1', '2026-09-11')).toBe('in_duty');
    expect(await loadAccess(kv, 'u1', '2026-09-12')).toBeNull();
  });

  it('prunes only earlier days for that user', async () => {
    const kv = memoryKv();
    await saveRoster(kv, 'u1', '2026-09-10', {}, NOW);
    await saveRoster(kv, 'u1', '2026-09-11', {}, NOW);
    await saveAccess(kv, 'u1', '2026-09-10', 'in_duty', NOW);
    await saveRoster(kv, 'u2', '2026-09-10', {}, NOW);
    await pruneSnapshots(kv, 'u1', '2026-09-11');
    expect(await loadRoster(kv, 'u1', '2026-09-10')).toBeNull();
    expect(await loadAccess(kv, 'u1', '2026-09-10')).toBeNull();
    expect(await loadRoster(kv, 'u1', '2026-09-11')).not.toBeNull();
    expect(await loadRoster(kv, 'u2', '2026-09-10')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/offline/kv.test.ts lib/boarding/offline/snapshot.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement the store**

`lib/boarding/offline/kv.ts`:

```ts
/**
 * A tiny key-value store for the boarding portal's offline data.
 *
 * Hand-rolled over IndexedDB instead of a package: a new dependency rewrites
 * bun.lock, and a stale bun.lock has broken production builds before.
 * `memoryKv` is the test double and the fallback when IndexedDB is missing
 * (some private-browsing modes): marks still queue, they just do not survive
 * a reload.
 */
export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  /** Every entry whose key starts with `prefix`, in key order. */
  list<T>(prefix: string): Promise<Array<{ key: string; value: T }>>;
}

export function memoryKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return m.has(key) ? (structuredClone(m.get(key)) as T) : undefined;
    },
    async set<T>(key: string, value: T) {
      m.set(key, structuredClone(value));
    },
    async del(key: string) {
      m.delete(key);
    },
    async list<T>(prefix: string) {
      return [...m.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((key) => ({ key, value: structuredClone(m.get(key)) as T }));
    },
  };
}

export function idbKv(dbName = 'tms-boarding'): Kv {
  const STORE = 'kv';
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));

  function run<R>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> {
    return db().then(
      (d) =>
        new Promise<R>((resolve, reject) => {
          const t = d.transaction(STORE, mode);
          const req = fn(t.objectStore(STORE));
          t.oncomplete = () => resolve(req.result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        }),
    );
  }

  return {
    get: <T,>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
    set: async <T,>(key: string, value: T) => {
      await run('readwrite', (s) => s.put(value, key));
    },
    del: async (key: string) => {
      await run('readwrite', (s) => s.delete(key));
    },
    list: <T,>(prefix: string) =>
      db().then(
        (d) =>
          new Promise<Array<{ key: string; value: T }>>((resolve, reject) => {
            const out: Array<{ key: string; value: T }> = [];
            const t = d.transaction(STORE, 'readonly');
            const req = t.objectStore(STORE).openCursor(IDBKeyRange.bound(prefix, prefix + String.fromCharCode(0xffff)));
            req.onsuccess = () => {
              const c = req.result;
              if (c) {
                out.push({ key: String(c.key), value: c.value as T });
                c.continue();
              }
            };
            t.oncomplete = () => resolve(out);
            t.onerror = () => reject(t.error);
          }),
      ),
  };
}

/** Use `primary` until it fails once, then `fallback` for the rest of the session. */
export function resilientKv(primary: Kv, fallback: Kv): Kv {
  let broken = false;
  async function use<R>(f: (k: Kv) => Promise<R>): Promise<R> {
    if (!broken) {
      try {
        return await f(primary);
      } catch (e) {
        console.warn('boarding offline store unavailable; keeping data in memory only', e);
        broken = true;
      }
    }
    return f(fallback);
  }
  return {
    get: <T,>(key: string) => use((k) => k.get<T>(key)),
    set: <T,>(key: string, value: T) => use((k) => k.set<T>(key, value)),
    del: (key: string) => use((k) => k.del(key)),
    list: <T,>(prefix: string) => use((k) => k.list<T>(prefix)),
  };
}

let shared: Kv | null = null;

/** The one store the boarding portal uses in the browser. */
export function offlineKv(): Kv {
  if (!shared) {
    shared = typeof indexedDB === 'undefined' ? memoryKv() : resilientKv(idbKv(), memoryKv());
  }
  return shared;
}
```

- [ ] **Step 4: Implement the snapshots**

`lib/boarding/offline/snapshot.ts`:

```ts
/**
 * What the boarding portal keeps on the phone so it can open with no signal:
 * today's roster (per day), the attendance window settings, and today's
 * access verdict. All keyed by user, so a shared phone never shows one
 * staffer another's list.
 */
import type { Kv } from './kv';

export interface Saved<T> {
  savedAt: string;
  value: T;
}

const rosterKey = (userId: string, date: string) => `snap:${userId}:${date}`;
const windowsKey = (userId: string) => `windows:${userId}`;
const accessKey = (userId: string, date: string) => `access:${userId}:${date}`;

export async function saveRoster<T>(kv: Kv, userId: string, date: string, roster: T, now: Date): Promise<void> {
  await kv.set<Saved<T>>(rosterKey(userId, date), { savedAt: now.toISOString(), value: roster });
}

export async function loadRoster<T>(kv: Kv, userId: string, date: string): Promise<Saved<T> | null> {
  return (await kv.get<Saved<T>>(rosterKey(userId, date))) ?? null;
}

export async function saveWindows<T>(kv: Kv, userId: string, windows: T, now: Date): Promise<void> {
  await kv.set<Saved<T>>(windowsKey(userId), { savedAt: now.toISOString(), value: windows });
}

export async function loadWindows<T>(kv: Kv, userId: string): Promise<Saved<T> | null> {
  return (await kv.get<Saved<T>>(windowsKey(userId))) ?? null;
}

export async function saveAccess(kv: Kv, userId: string, date: string, gate: string, now: Date): Promise<void> {
  await kv.set<Saved<string>>(accessKey(userId, date), { savedAt: now.toISOString(), value: gate });
}

export async function loadAccess(kv: Kv, userId: string, date: string): Promise<string | null> {
  return (await kv.get<Saved<string>>(accessKey(userId, date)))?.value ?? null;
}

/** Drop this user's saved rosters and access verdicts from before `today`. */
export async function pruneSnapshots(kv: Kv, userId: string, today: string): Promise<void> {
  for (const prefix of [`snap:${userId}:`, `access:${userId}:`]) {
    for (const { key } of await kv.list(prefix)) {
      if (key.slice(prefix.length) < today) await kv.del(key);
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/offline/kv.test.ts lib/boarding/offline/snapshot.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/boarding/offline/kv.ts lib/boarding/offline/snapshot.ts lib/boarding/offline/kv.test.ts lib/boarding/offline/snapshot.test.ts
git commit -m "feat(boarding): keep the day's roster on the phone"
```

---

### Task 8: The outbox and the "Not saved" list

**Files:**
- Create: `lib/boarding/offline/outbox.ts`
- Test: `lib/boarding/offline/outbox.test.ts`

**Interfaces:**
- Consumes: `Kv` (Task 7), `istToday` from `lib/booking/window.ts`, `AttDirection` from `lib/boarding/attendance-window.ts`, `SYNC_BACKOFF_MS` and `MarkRejectReason` (Task 1).
- Produces:
  - Types `MarkEntry`, `ScanEntry`, `OutboxEntry`, `Problem` (fields exactly as below). Both entry kinds carry `direction: AttDirection`, the trip decided at tap time by the caller.
  - `outboxKey(e)`, `enqueueMark(kv, input, now, makeId?) => Promise<MarkEntry>` (input includes `direction`), `enqueueScan(kv, input, now, makeId?) => Promise<ScanEntry>` (input includes `direction`), `listOutbox(kv, userId)`, `countPending(kv, userId)`, `removeIfSame(kv, entry)`, `deferIfSame(kv, entry, now)`, `addProblem(kv, p)`, `listProblems(kv, userId)`, `dismissProblem(kv, userId, clientId)`.
- Key rule: one outbox slot per `(user, trip date, trip, learner)`, so a later tap on the same learner for the same trip REPLACES the earlier unsent one, while the morning and evening marks of one learner are separate. A scan with no resolved learner gets its own slot.

- [ ] **Step 1: Write the failing tests**

`lib/boarding/offline/outbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { memoryKv } from './kv';
import {
  addProblem, countPending, deferIfSame, dismissProblem, enqueueMark, enqueueScan,
  listOutbox, listProblems, removeIfSame,
} from './outbox';

const NOW = new Date('2026-09-11T03:00:00Z'); // 08:30 IST
const ids = () => { let n = 0; return () => `c${++n}`; };
const mark = (
  learnerId: string,
  status: 'present' | 'absent' = 'present',
  userId = 'u1',
  direction: 'onward' | 'return' = 'onward',
) => ({ userId, learnerId, routeId: 'r1', status, name: `L-${learnerId}`, direction });
const scan = (learnerId: string | null, token: string) =>
  ({ userId: 'u1', learnerId, token, walkUp: false, name: learnerId, verified: learnerId !== null, direction: 'onward' as const });

describe('outbox', () => {
  it('stores a mark with its tap time and IST trip date', async () => {
    const kv = memoryKv();
    const e = await enqueueMark(kv, mark('l1'), NOW, ids());
    expect(e).toMatchObject({ kind: 'mark', clientId: 'c1', direction: 'onward', tappedAt: NOW.toISOString(), tripDate: '2026-09-11', attempts: 0, nextAttemptAt: 0 });
    const lateIst = new Date('2026-09-11T19:00:00Z'); // 00:30 IST on the 12th
    expect((await enqueueMark(kv, mark('l2'), lateIst, ids())).tripDate).toBe('2026-09-12');
  });

  it('keeps only the latest unsent mark per learner and day', async () => {
    const kv = memoryKv();
    const id = ids();
    await enqueueMark(kv, mark('l1', 'present'), NOW, id);
    await enqueueMark(kv, mark('l1', 'absent'), new Date(NOW.getTime() + 1000), id);
    const all = await listOutbox(kv, 'u1');
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'absent', clientId: 'c2' });
  });

  it('keeps the morning and evening marks of one learner apart', async () => {
    const kv = memoryKv();
    const id = ids();
    await enqueueMark(kv, mark('l1', 'present', 'u1', 'onward'), NOW, id);
    await enqueueMark(kv, mark('l1', 'absent', 'u1', 'return'), NOW, id);
    expect((await listOutbox(kv, 'u1')).map((e) => e.direction).sort()).toEqual(['onward', 'return']);
  });

  it('collapses a resolved scan with a mark for the same learner, but not raw scans', async () => {
    const kv = memoryKv();
    const id = ids();
    await enqueueMark(kv, mark('l1', 'absent'), NOW, id);
    await enqueueScan(kv, scan('l1', 't'), NOW, id);
    await enqueueScan(kv, scan(null, 'x'), NOW, id);
    await enqueueScan(kv, scan(null, 'y'), NOW, id);
    const all = await listOutbox(kv, 'u1');
    expect(all.map((e) => e.kind)).toEqual(['scan', 'scan', 'scan']);
    expect(await countPending(kv, 'u1')).toBe(3);
  });

  it('lists one user only, oldest tap first', async () => {
    const kv = memoryKv();
    const id = ids();
    await enqueueMark(kv, mark('l2'), new Date(NOW.getTime() + 5000), id);
    await enqueueMark(kv, mark('l1'), NOW, id);
    await enqueueMark(kv, mark('l9', 'present', 'u2'), NOW, id);
    expect((await listOutbox(kv, 'u1')).map((e) => e.learnerId)).toEqual(['l1', 'l2']);
  });

  it('never removes a newer mark that replaced the one being settled', async () => {
    const kv = memoryKv();
    const id = ids();
    const old = await enqueueMark(kv, mark('l1', 'present'), NOW, id);
    await enqueueMark(kv, mark('l1', 'absent'), NOW, id);
    await removeIfSame(kv, old);
    expect((await listOutbox(kv, 'u1'))[0]).toMatchObject({ clientId: 'c2', status: 'absent' });
  });

  it('backs off 5s, 15s, then 60s', async () => {
    const kv = memoryKv();
    let e = await enqueueMark(kv, mark('l1'), NOW, ids());
    const t = NOW.getTime();
    for (const [i, wait] of [[1, 5_000], [2, 15_000], [3, 60_000], [4, 60_000]] as const) {
      await deferIfSame(kv, e, NOW);
      e = (await listOutbox(kv, 'u1'))[0];
      expect(e.attempts).toBe(i);
      expect(e.nextAttemptAt).toBe(t + wait);
    }
  });

  it('keeps, lists and dismisses problems per user', async () => {
    const kv = memoryKv();
    const base = { userId: 'u1', learnerId: 'l1', name: 'A', reason: 'stale' as const, message: 'm', tappedAt: NOW.toISOString() };
    await addProblem(kv, { ...base, clientId: 'p1', recordedAt: '2026-09-11T03:00:00Z' });
    await addProblem(kv, { ...base, clientId: 'p2', recordedAt: '2026-09-11T03:05:00Z' });
    await addProblem(kv, { ...base, clientId: 'p3', userId: 'u2', recordedAt: '2026-09-11T03:05:00Z' });
    expect((await listProblems(kv, 'u1')).map((p) => p.clientId)).toEqual(['p2', 'p1']);
    await dismissProblem(kv, 'u1', 'p2');
    expect((await listProblems(kv, 'u1')).map((p) => p.clientId)).toEqual(['p1']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/offline/outbox.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement**

`lib/boarding/offline/outbox.ts`:

```ts
/**
 * Marks waiting on the phone to be sent, and the marks the server refused.
 *
 * ONE slot per (user, trip date, trip, learner): tapping Present then Absent
 * on the same student for the same trip while offline leaves one entry, the
 * latest. The morning and evening marks of one student are separate slots,
 * because they are separate records on the server. That keeps the outbox
 * small, and it means a batch (always one trip) never carries two marks for one
 * learner, so send order inside a batch cannot matter. A scan that resolved to
 * nobody on the saved roster gets its own slot until the server identifies it.
 *
 * Settling uses removeIfSame / deferIfSame: the slot may have been refilled by
 * a NEWER tap while the old one was in flight, and that newer tap must survive.
 */
import type { Kv } from './kv';
import type { AttDirection } from '@/lib/boarding/attendance-window';
import { istToday } from '@/lib/booking/window';
import { SYNC_BACKOFF_MS, type MarkRejectReason } from './protocol';

interface EntryBase {
  clientId: string;
  userId: string;
  tappedAt: string;
  tripDate: string;
  /** The trip this tap was for, decided by the caller at tap time. */
  direction: AttDirection;
  attempts: number;
  nextAttemptAt: number;
  name: string | null;
}

export interface MarkEntry extends EntryBase {
  kind: 'mark';
  learnerId: string;
  routeId: string;
  status: 'present' | 'absent';
}

export interface ScanEntry extends EntryBase {
  kind: 'scan';
  /** Null when the phone could not match the scan to anyone on the saved roster. */
  learnerId: string | null;
  token: string;
  walkUp: boolean;
  /** True when resolved by the saved card map; false for a pass QR not yet signature-checked. */
  verified: boolean;
}

export type OutboxEntry = MarkEntry | ScanEntry;

export interface Problem {
  clientId: string;
  userId: string;
  learnerId: string | null;
  name: string | null;
  reason: MarkRejectReason | 'locked';
  message: string;
  tappedAt: string;
  recordedAt: string;
}

const defaultId = () => globalThis.crypto.randomUUID();

export function outboxKey(e: Pick<OutboxEntry, 'userId' | 'tripDate' | 'direction' | 'learnerId' | 'clientId'>): string {
  return `outbox:${e.userId}:${e.tripDate}:${e.direction}:${e.learnerId ?? `raw-${e.clientId}`}`;
}

const problemKey = (userId: string, clientId: string) => `problem:${userId}:${clientId}`;

export async function enqueueMark(
  kv: Kv,
  input: {
    userId: string; learnerId: string; routeId: string; status: 'present' | 'absent';
    name: string | null; direction: AttDirection;
  },
  now: Date,
  makeId: () => string = defaultId,
): Promise<MarkEntry> {
  const entry: MarkEntry = {
    kind: 'mark', clientId: makeId(), userId: input.userId, learnerId: input.learnerId,
    routeId: input.routeId, status: input.status, name: input.name, direction: input.direction,
    tappedAt: now.toISOString(), tripDate: istToday(now), attempts: 0, nextAttemptAt: 0,
  };
  await kv.set(outboxKey(entry), entry);
  return entry;
}

export async function enqueueScan(
  kv: Kv,
  input: {
    userId: string; learnerId: string | null; token: string; walkUp: boolean;
    name: string | null; verified: boolean; direction: AttDirection;
  },
  now: Date,
  makeId: () => string = defaultId,
): Promise<ScanEntry> {
  const entry: ScanEntry = {
    kind: 'scan', clientId: makeId(), userId: input.userId, learnerId: input.learnerId,
    token: input.token, walkUp: input.walkUp, name: input.name, verified: input.verified,
    direction: input.direction,
    tappedAt: now.toISOString(), tripDate: istToday(now), attempts: 0, nextAttemptAt: 0,
  };
  await kv.set(outboxKey(entry), entry);
  return entry;
}

export async function listOutbox(kv: Kv, userId: string): Promise<OutboxEntry[]> {
  const rows = await kv.list<OutboxEntry>(`outbox:${userId}:`);
  return rows
    .map((r) => r.value)
    .sort((a, b) => a.tappedAt.localeCompare(b.tappedAt) || a.clientId.localeCompare(b.clientId));
}

export async function countPending(kv: Kv, userId: string): Promise<number> {
  return (await kv.list(`outbox:${userId}:`)).length;
}

export async function removeIfSame(kv: Kv, entry: OutboxEntry): Promise<void> {
  const key = outboxKey(entry);
  const current = await kv.get<OutboxEntry>(key);
  if (current?.clientId === entry.clientId) await kv.del(key);
}

export async function deferIfSame(kv: Kv, entry: OutboxEntry, now: Date): Promise<void> {
  const key = outboxKey(entry);
  const current = await kv.get<OutboxEntry>(key);
  if (!current || current.clientId !== entry.clientId) return;
  const wait = SYNC_BACKOFF_MS[Math.min(current.attempts, SYNC_BACKOFF_MS.length - 1)];
  await kv.set<OutboxEntry>(key, { ...current, attempts: current.attempts + 1, nextAttemptAt: now.getTime() + wait });
}

export async function addProblem(kv: Kv, p: Problem): Promise<void> {
  await kv.set(problemKey(p.userId, p.clientId), p);
}

export async function listProblems(kv: Kv, userId: string): Promise<Problem[]> {
  const rows = await kv.list<Problem>(`problem:${userId}:`);
  return rows.map((r) => r.value).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export async function dismissProblem(kv: Kv, userId: string, clientId: string): Promise<void> {
  await kv.del(problemKey(userId, clientId));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/offline/outbox.test.ts`
Expected: PASS, 8 tests. If `globalThis.crypto` is undefined on this Node version the tests still pass (they inject ids); check `node -e "console.log(typeof globalThis.crypto?.randomUUID)"` prints `function` for the browser path's sake anyway.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/offline/outbox.ts lib/boarding/offline/outbox.test.ts
git commit -m "feat(boarding): queue attendance marks on the phone"
```

---

### Task 9: Show unsent marks on the roster

**Files:**
- Create: `lib/boarding/offline/apply-pending.ts`
- Test: `lib/boarding/offline/apply-pending.test.ts`

**Interfaces:**
- Consumes: `RosterRow` from `lib/booking/roster.ts`; `OutboxEntry` (Task 8).
- Produces: `PendingView = { status: 'present' | 'absent'; kind: 'queued' | 'unverified' }`; `pendingByLearner(entries, date, direction) => Map<string, PendingView>` (only entries for that day AND trip); `countRoster(rows) => { counts: RosterCounts; share: RosterShare }`; `applyPending<T extends RosterView>(roster: T, pending) => T`. `RosterCounts`, `RosterShare`, `RosterView` exported. The count formulas are copied from `app/api/boarding/attendance/roster/route.ts` and must stay identical to it.

- [ ] **Step 1: Write the failing tests**

`lib/boarding/offline/apply-pending.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RosterRow } from '@/lib/booking/roster';
import type { OutboxEntry } from './outbox';
import { applyPending, countRoster, pendingByLearner } from './apply-pending';

const row = (id: string, over: Partial<RosterRow> = {}): RosterRow => ({
  learner_id: id, name: id, roll: null, route_id: 'r1', route_number: '12', stop_id: null,
  stop_name: 'S', stop_time: null, status: 'unmarked', method: null, scanned_at: null,
  booked: true, is_walk_up: false, owner_email: null, owner_name: null, is_mine: true,
  marked_by_name: null, can_edit: true, can_clear: false, lock_reason: null,
  previous_status: null, previous_by_name: null, previous_at: null, ...over,
});

const roster = (rows: RosterRow[]) => ({ date: '2026-09-11', rows, ...countRoster(rows) });

const base = { userId: 'u1', tappedAt: '2026-09-11T03:00:00Z', tripDate: '2026-09-11', direction: 'onward' as const, attempts: 0, nextAttemptAt: 0, name: null };

describe('pendingByLearner', () => {
  it('maps marks and scans for the viewed day and trip only', () => {
    const entries: OutboxEntry[] = [
      { ...base, kind: 'mark', clientId: 'a', learnerId: 'l1', routeId: 'r1', status: 'absent' },
      { ...base, kind: 'scan', clientId: 'b', learnerId: 'l2', token: 't', walkUp: false, verified: false },
      { ...base, kind: 'scan', clientId: 'c', learnerId: null, token: 'x', walkUp: false, verified: false },
      { ...base, kind: 'mark', clientId: 'd', learnerId: 'l3', routeId: 'r1', status: 'present', tripDate: '2026-09-10' },
      { ...base, kind: 'mark', clientId: 'e', learnerId: 'l4', routeId: 'r1', status: 'present', direction: 'return' },
    ];
    const p = pendingByLearner(entries, '2026-09-11', 'onward');
    expect([...p.entries()]).toEqual([
      ['l1', { status: 'absent', kind: 'queued' }],
      ['l2', { status: 'present', kind: 'unverified' }],
    ]);
  });
});

describe('applyPending', () => {
  it('returns the same roster when nothing is pending', () => {
    const r = roster([row('l1')]);
    expect(applyPending(r, new Map())).toBe(r);
  });

  it('overlays status and recounts the tiles exactly as the server does', () => {
    const r = roster([
      row('l1'),
      row('l2', { booked: false }),
      row('l3', { status: 'present' }),
      row('l4', { is_mine: false }),
    ]);
    const out = applyPending(r, new Map([
      ['l1', { status: 'absent', kind: 'queued' }],
      ['l2', { status: 'present', kind: 'queued' }],
    ]));
    expect(out.rows.find((x) => x.learner_id === 'l2')).toMatchObject({ status: 'present', is_walk_up: true });
    expect(out.counts).toEqual({
      total: 4, present: 2, absent: 1, unmarked: 1, booked: 3, withoutTicket: 1, boardedWithoutTicket: 1,
    });
    // share = is_mine && booked: l1, l3 (l2 unbooked, l4 not mine)
    expect(out.share).toEqual({ total: 2, marked: 2, remaining: 0 });
  });

  it('clears the walk-up flag when an unbooked rider is re-marked absent', () => {
    const r = roster([row('l1', { booked: false, status: 'present', is_walk_up: true })]);
    const out = applyPending(r, new Map([['l1', { status: 'absent', kind: 'queued' }]]));
    expect(out.rows[0]).toMatchObject({ status: 'absent', is_walk_up: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/offline/apply-pending.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement**

`lib/boarding/offline/apply-pending.ts`:

```ts
/**
 * Overlay marks still waiting on the phone onto the roster, so the screen
 * shows what the staffer did even before the server has it, and recount the
 * tiles so "Present 12" moves as they tap.
 *
 * The count formulas are COPIED from app/api/boarding/attendance/roster/route.ts
 * and must stay identical; the unit test pins them.
 */
import type { RosterRow } from '@/lib/booking/roster';
import type { AttDirection } from '@/lib/boarding/attendance-window';
import type { OutboxEntry } from './outbox';

export interface PendingView {
  status: 'present' | 'absent';
  /** 'unverified' = a pass QR the server has not signature-checked yet. */
  kind: 'queued' | 'unverified';
}

export interface RosterCounts {
  total: number; present: number; absent: number; unmarked: number;
  booked: number; withoutTicket: number; boardedWithoutTicket: number;
}
export interface RosterShare { total: number; marked: number; remaining: number }
export interface RosterView { rows: RosterRow[]; counts: RosterCounts; share: RosterShare }

export function pendingByLearner(
  entries: OutboxEntry[],
  date: string,
  direction: AttDirection,
): Map<string, PendingView> {
  const out = new Map<string, PendingView>();
  for (const e of entries) {
    if (e.tripDate !== date || e.direction !== direction || !e.learnerId) continue;
    out.set(
      e.learnerId,
      e.kind === 'mark'
        ? { status: e.status, kind: 'queued' }
        : { status: 'present', kind: e.verified ? 'queued' : 'unverified' },
    );
  }
  return out;
}

export function countRoster(rows: RosterRow[]): { counts: RosterCounts; share: RosterShare } {
  const present = rows.filter((r) => r.status === 'present').length;
  const absent = rows.filter((r) => r.status === 'absent').length;
  const booked = rows.filter((r) => r.booked).length;
  const boardedWithoutTicket = rows.filter((r) => r.is_walk_up).length;
  const mineRows = rows.filter((r) => r.is_mine && r.booked);
  const mineMarked = mineRows.filter((r) => r.status !== 'unmarked').length;
  return {
    counts: {
      total: rows.length, present, absent, unmarked: rows.length - present - absent,
      booked, withoutTicket: rows.length - booked, boardedWithoutTicket,
    },
    share: { total: mineRows.length, marked: mineMarked, remaining: mineRows.length - mineMarked },
  };
}

export function applyPending<T extends RosterView>(roster: T, pending: Map<string, PendingView>): T {
  if (pending.size === 0) return roster;
  const rows = roster.rows.map((r) => {
    const p = pending.get(r.learner_id);
    if (!p) return r;
    return { ...r, status: p.status, is_walk_up: p.status === 'present' && !r.booked };
  });
  return { ...roster, rows, ...countRoster(rows) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/offline/apply-pending.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/offline/apply-pending.ts lib/boarding/offline/apply-pending.test.ts
git commit -m "feat(boarding): show unsent marks on the roster"
```

---

### Task 10: Resolve a scan with no signal

**Files:**
- Create: `lib/boarding/offline/local-scan.ts`
- Test: `lib/boarding/offline/local-scan.test.ts`

**Interfaces:**
- Consumes: `classifyScan`, `ScanSource` from `lib/boarding/scan-resolve.ts`.
- Produces: `LocalScan` union and `resolveScanOffline(raw: string, source: ScanSource, roster: { rows: Array<{ learner_id: string; name: string; booked: boolean; status: string }>; cards?: Record<string, string> }) => LocalScan`.

- [ ] **Step 1: Write the failing tests**

`lib/boarding/offline/local-scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveScanOffline } from './local-scan';

const ID = '0f3b6c1e-2a4d-4e5f-8a9b-1c2d3e4f5a6b';
const roster = {
  rows: [
    { learner_id: ID, name: 'Priya', booked: true, status: 'unmarked' },
    { learner_id: 'b1', name: 'Ravi', booked: false, status: 'unmarked' },
    { learner_id: 'c1', name: 'Anu', booked: true, status: 'present' },
  ],
  cards: { '348295-7': 'b1', '111111-1': 'c1' },
};

describe('resolveScanOffline', () => {
  it('resolves a camera-read JKKN ID through the saved card map', () => {
    expect(resolveScanOffline('348295-7', 'camera', roster)).toEqual({
      kind: 'resolved', learnerId: 'b1', name: 'Ravi', booked: false, verified: true, alreadyPresent: false,
    });
  });

  it('refuses a typed JKKN ID, exactly as the server does', () => {
    expect(resolveScanOffline('348295-7', 'typed', roster)).toMatchObject({ kind: 'refused' });
  });

  it('reads the learner id out of a pass QR but marks it unverified', () => {
    const token = `${ID.toUpperCase()}.${'a'.repeat(32)}`;
    expect(resolveScanOffline(token, 'camera', roster)).toEqual({
      kind: 'resolved', learnerId: ID, name: 'Priya', booked: true, verified: false, alreadyPresent: false,
    });
  });

  it('flags a learner already present on the saved list', () => {
    expect(resolveScanOffline('111111-1', 'camera', roster)).toMatchObject({ kind: 'resolved', alreadyPresent: true });
  });

  it('queues an unknown card or pass rather than dropping it', () => {
    expect(resolveScanOffline('999999-9', 'camera', roster)).toMatchObject({ kind: 'unknown' });
    const other = `${'1'.repeat(8)}-1111-1111-1111-${'1'.repeat(12)}.${'b'.repeat(32)}`;
    expect(resolveScanOffline(other, 'camera', roster)).toMatchObject({ kind: 'unknown' });
  });

  it('refuses 6-digit codes and unrecognised input offline', () => {
    expect(resolveScanOffline('123456', 'typed', roster)).toEqual({
      kind: 'refused', message: '6-digit codes need signal. Scan the QR or the ID card instead.',
    });
    expect(resolveScanOffline('hello', 'camera', roster)).toMatchObject({ kind: 'refused' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/offline/local-scan.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement**

`lib/boarding/offline/local-scan.ts`:

```ts
/**
 * Resolve a scan against the roster saved on the phone, for when there is no
 * signal. DISPLAY AND QUEUING ONLY: the server re-resolves every queued scan
 * on sync, verifies pass signatures, and rejects retired cards. Nothing here
 * is trusted as proof.
 *
 *  - JKKN ID card: the roster ships an active-card map, so this resolves.
 *  - Pass QR: the token is `${learnerId}.${hmac}`. The id is readable; the
 *    HMAC needs a server secret, so the result is marked unverified.
 *  - 6-digit pass code: needs an HMAC per candidate learner. Refused offline.
 */
import { classifyScan, type ScanSource } from '@/lib/boarding/scan-resolve';

export type LocalScan =
  | { kind: 'refused'; message: string }
  | { kind: 'resolved'; learnerId: string; name: string; booked: boolean; verified: boolean; alreadyPresent: boolean }
  | { kind: 'unknown'; message: string };

interface SavedRoster {
  rows: Array<{ learner_id: string; name: string; booked: boolean; status: string }>;
  cards?: Record<string, string>;
}

export function resolveScanOffline(raw: string, source: ScanSource, roster: SavedRoster): LocalScan {
  const d = classifyScan(raw, source);
  if (d.refusal === 'typed_jkkn_id') return { kind: 'refused', message: 'Point the camera at the card to use a JKKN ID.' };
  if (d.shape === 'pass_code') {
    return { kind: 'refused', message: '6-digit codes need signal. Scan the QR or the ID card instead.' };
  }
  if (d.refusal === 'unrecognised') return { kind: 'refused', message: 'Not a boarding pass or a JKKN ID card.' };

  const learnerId =
    d.shape === 'jkkn_id' ? roster.cards?.[d.code] ?? null
    : d.shape === 'pass' ? d.code.split('.')[0].toLowerCase()
    : null;
  const row = learnerId ? roster.rows.find((r) => r.learner_id === learnerId) : undefined;

  if (!row) {
    return {
      kind: 'unknown',
      message: d.shape === 'jkkn_id'
        ? 'This card is not on your saved list. It will be checked when you are back online.'
        : 'This pass is not on your saved list. It will be checked when you are back online.',
    };
  }

  return {
    kind: 'resolved',
    learnerId: row.learner_id,
    name: row.name,
    booked: row.booked,
    verified: d.shape === 'jkkn_id',
    alreadyPresent: row.status === 'present',
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/offline/local-scan.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/offline/local-scan.ts lib/boarding/offline/local-scan.test.ts
git commit -m "feat(boarding): resolve a scan from the saved roster"
```

---

### Task 11: Drain the outbox

**Files:**
- Create: `lib/boarding/offline/sync.ts`
- Create: `lib/boarding/offline/messages.ts`
- Test: `lib/boarding/offline/sync.test.ts`
- Test: `lib/boarding/offline/messages.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 7, 8.
- Produces:
  - `sync.ts`: `PostResult = { status: number; json: any }`; `MarksBody`; `ScanBody`; `SyncDeps = { kv; userId; now: () => Date; postMarks(body): Promise<PostResult>; postScan(body): Promise<PostResult> }` (both post functions THROW when there is no network); `SyncOutcome = { entry: OutboxEntry; result: MarkResult }`; `SyncReport = { outcomes: SyncOutcome[]; attempted: number; deferred: number; networkDown: boolean; authRequired: boolean }`; `syncOnce(deps)`; `syncOutbox(deps)` (at most one run at a time).
  - `messages.ts`: `SyncMessage = { kind: 'success' | 'warning'; text: string }`; `syncMessages(outcomes: SyncOutcome[]) => SyncMessage[]`.

- [ ] **Step 1: Write the failing sync tests**

`lib/boarding/offline/sync.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { memoryKv } from './kv';
import { enqueueMark, enqueueScan, listOutbox, listProblems } from './outbox';
import { syncOnce, syncOutbox, type PostResult, type SyncDeps } from './sync';

const T0 = new Date('2026-09-11T03:00:00Z');
const ids = () => { let n = 0; return () => `c${++n}`; };
const ok = (json: unknown): PostResult => ({ status: 200, json });

async function setup(n = 1, routeId = 'r1') {
  const kv = memoryKv();
  const id = ids();
  for (let i = 1; i <= n; i++) {
    await enqueueMark(kv, { userId: 'u1', learnerId: `l${i}`, routeId, status: 'present', name: `N${i}`, direction: 'onward' }, T0, id);
  }
  return kv;
}

function deps(kv: SyncDeps['kv'], over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    kv, userId: 'u1', now: () => T0,
    postMarks: vi.fn(async (b) => ok({ results: b.marks.map((m: { clientId: string }) => ({ clientId: m.clientId, outcome: 'inserted', walkUp: false })) })),
    postScan: vi.fn(async (b) => ok({ ok: true, clientId: b.clientId })),
    ...over,
  };
}

describe('syncOnce', () => {
  it('removes saved marks and reports them', async () => {
    const kv = await setup(2);
    const r = await syncOnce(deps(kv));
    expect(r.outcomes.map((o) => o.result.outcome)).toEqual(['inserted', 'inserted']);
    expect(r.attempted).toBe(1);
    expect(await listOutbox(kv, 'u1')).toEqual([]);
  });

  it('moves a locked mark to problems with the holder named', async () => {
    const kv = await setup(1);
    await syncOnce(deps(kv, { postMarks: async () => ok({ results: [{ clientId: 'c1', outcome: 'locked', markedByName: 'Kavya' }] }) }));
    expect(await listOutbox(kv, 'u1')).toEqual([]);
    expect(await listProblems(kv, 'u1')).toMatchObject([{ reason: 'locked', message: 'Already marked by Kavya', name: 'N1' }]);
  });

  it('moves a rejected mark to problems with plain words', async () => {
    const kv = await setup(1);
    await syncOnce(deps(kv, { postMarks: async () => ok({ results: [{ clientId: 'c1', outcome: 'rejected', reason: 'stale' }] }) }));
    expect(await listProblems(kv, 'u1')).toMatchObject([
      { reason: 'stale', message: 'It reached the server after midnight, so it no longer counts.' },
    ]);
  });

  it('keeps and backs off on no network, then retries once due', async () => {
    const kv = await setup(1);
    const down = deps(kv, { postMarks: async () => { throw new TypeError('Failed to fetch'); } });
    const r = await syncOnce(down);
    expect(r).toMatchObject({ networkDown: true, deferred: 1 });
    expect((await listOutbox(kv, 'u1'))[0]).toMatchObject({ attempts: 1, nextAttemptAt: T0.getTime() + 5_000 });

    const early = deps(kv, { now: () => new Date(T0.getTime() + 1_000) });
    await syncOnce(early);
    expect(early.postMarks).not.toHaveBeenCalled();

    const due = deps(kv, { now: () => new Date(T0.getTime() + 6_000) });
    await syncOnce(due);
    expect(due.postMarks).toHaveBeenCalledTimes(1);
    expect(await listOutbox(kv, 'u1')).toEqual([]);
  });

  it('stops without touching anything on 401', async () => {
    const kv = await setup(1);
    const r = await syncOnce(deps(kv, { postMarks: async () => ({ status: 401, json: {} }) }));
    expect(r.authRequired).toBe(true);
    expect((await listOutbox(kv, 'u1'))[0]).toMatchObject({ attempts: 0 });
  });

  it('defers on a server error', async () => {
    const kv = await setup(1);
    const r = await syncOnce(deps(kv, { postMarks: async () => ({ status: 500, json: { error: 'x' } }) }));
    expect(r.deferred).toBe(1);
    expect((await listOutbox(kv, 'u1'))[0].attempts).toBe(1);
  });

  it('turns a whole-batch 403 into not_assigned problems', async () => {
    const kv = await setup(2);
    await syncOnce(deps(kv, { postMarks: async () => ({ status: 403, json: { error: 'You are not assigned to this route' } }) }));
    expect((await listProblems(kv, 'u1')).map((p) => p.reason)).toEqual(['not_assigned', 'not_assigned']);
    expect(await listOutbox(kv, 'u1')).toEqual([]);
  });

  it('on not_your_share refuses only the listed learners and keeps the rest', async () => {
    const kv = await setup(2);
    await syncOnce(deps(kv, {
      postMarks: async () => ({ status: 403, json: { reason: 'not_your_share', learners: [{ learner_id: 'l2', staff_email: 'x' }] } }),
    }));
    expect((await listProblems(kv, 'u1')).map((p) => p.learnerId)).toEqual(['l2']);
    expect((await listOutbox(kv, 'u1')).map((e) => e.learnerId)).toEqual(['l1']);
  });

  it('batches 25 per request and per route', async () => {
    const kv = await setup(30, 'r1');
    await enqueueMark(kv, { userId: 'u1', learnerId: 'z1', routeId: 'r2', status: 'present', name: 'Z', direction: 'onward' }, T0, () => 'z');
    const d = deps(kv);
    await syncOnce(d);
    const sizes = (d.postMarks as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].marks.length).sort((a: number, b: number) => a - b);
    expect(sizes).toEqual([1, 5, 25]);
  });

  it('sends each trip as its own batch, naming the trip', async () => {
    const kv = await setup(1);
    await enqueueMark(kv, { userId: 'u1', learnerId: 'l1', routeId: 'r1', status: 'absent', name: 'N1', direction: 'return' }, T0, () => 'eve');
    const d = deps(kv);
    await syncOnce(d);
    const trips = (d.postMarks as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].direction).sort();
    expect(trips).toEqual(['onward', 'return']);
  });

  it('defers a mark the server gave no answer for, never drops it', async () => {
    const kv = await setup(2);
    await syncOnce(deps(kv, { postMarks: async () => ok({ results: [{ clientId: 'c1', outcome: 'inserted', walkUp: false }] }) }));
    expect((await listOutbox(kv, 'u1')).map((e) => [e.learnerId, e.attempts])).toEqual([['l2', 1]]);
  });

  it('keeps a newer tap that replaced the one in flight', async () => {
    const kv = await setup(1);
    await syncOnce(deps(kv, {
      postMarks: async (b) => {
        await enqueueMark(kv, { userId: 'u1', learnerId: 'l1', routeId: 'r1', status: 'absent', name: 'N1', direction: 'onward' }, T0, () => 'newer');
        return ok({ results: [{ clientId: b.marks[0].clientId, outcome: 'inserted', walkUp: false }] });
      },
    }));
    expect(await listOutbox(kv, 'u1')).toMatchObject([{ clientId: 'newer', status: 'absent' }]);
  });

  it('settles scans: saved, not booked, refused', async () => {
    const kv = memoryKv();
    const id = ids();
    const scan = (learnerId: string) =>
      enqueueScan(kv, { userId: 'u1', learnerId, token: `t-${learnerId}`, walkUp: false, name: learnerId, verified: true, direction: 'onward' }, T0, id);
    await scan('s1'); await scan('s2'); await scan('s3');
    await syncOnce(deps(kv, {
      postScan: async (b) =>
        b.token === 't-s1' ? ok({ ok: true })
        : b.token === 't-s2' ? ok({ ok: false, reason: 'not_booked' })
        : { status: 409, json: { ok: false, error: 'This card has been retired. Issue a new one.' } },
    }));
    expect(await listOutbox(kv, 'u1')).toEqual([]);
    expect((await listProblems(kv, 'u1')).map((p) => [p.learnerId, p.reason]).sort()).toEqual([
      ['s2', 'not_booked'], ['s3', 'scan_refused'],
    ]);
  });
});

describe('syncOutbox', () => {
  it('runs at most one sync at a time', async () => {
    const kv = await setup(1);
    const d = deps(kv);
    await Promise.all([syncOutbox(d), syncOutbox(d)]);
    expect(d.postMarks).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Write the failing message tests**

`lib/boarding/offline/messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { syncMessages } from './messages';
import type { SyncOutcome } from './sync';

const entry = (name: string, status: 'present' | 'absent' = 'present') => ({
  kind: 'mark' as const, direction: 'onward' as const, clientId: name, userId: 'u', learnerId: name, routeId: 'r', status, name,
  tappedAt: '', tripDate: '', attempts: 0, nextAttemptAt: 0,
});
const o = (name: string, result: SyncOutcome['result'], status: 'present' | 'absent' = 'present'): SyncOutcome =>
  ({ entry: entry(name, status), result });

describe('syncMessages', () => {
  it('says nothing when nothing was sent', () => {
    expect(syncMessages([])).toEqual([]);
  });

  it('gives one line per mark for a few marks', () => {
    expect(syncMessages([
      o('Priya', { clientId: 'x', outcome: 'inserted', walkUp: false }, 'absent'),
      o('Ravi', { clientId: 'x', outcome: 'inserted', walkUp: true }),
      o('Anu', { clientId: 'x', outcome: 'locked', markedByName: 'Kavya' }),
    ])).toEqual([
      { kind: 'success', text: 'Marked Priya absent.' },
      { kind: 'success', text: 'Ravi recorded as travelling without a ticket. They have been notified.' },
      { kind: 'warning', text: 'Anu: not saved — already marked by Kavya.' },
    ]);
  });

  it('summarises a backlog in one line', () => {
    const many = ['a', 'b', 'c', 'd'].map((n) => o(n, { clientId: n, outcome: 'inserted', walkUp: false }));
    many.push(o('e', { clientId: 'e', outcome: 'rejected', reason: 'stale' }));
    expect(syncMessages(many)).toEqual([
      { kind: 'warning', text: 'Sent 4 saved marks. 1 not saved — see "Not saved" on this page.' },
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/offline/sync.test.ts lib/boarding/offline/messages.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 4: Implement the sync engine**

`lib/boarding/offline/sync.ts`:

```ts
/**
 * Drain the outbox: send what is due, settle every answer.
 *
 * Roster taps go in batches of SYNC_BATCH_SIZE per (route, trip date, trip); scans
 * go one by one to the scan endpoint. The outbox holds at most one entry per
 * learner and day, so order inside a batch never matters.
 *
 * The one rule that must not break: an entry leaves the outbox ONLY with a
 * verdict (saved, or moved to "Not saved"). No network, a 5xx, or a batch
 * answer that omits it all DEFER it with backoff. 401 stops everything and
 * touches nothing -- the marks wait for the same user to sign back in.
 */
import type { Kv } from './kv';
import type { AttDirection } from '@/lib/boarding/attendance-window';
import {
  addProblem, deferIfSame, listOutbox, removeIfSame,
  type MarkEntry, type OutboxEntry, type ScanEntry,
} from './outbox';
import {
  REJECT_REASON_TEXT, SYNC_BATCH_SIZE, isSavedOutcome,
  type MarkRejectReason, type MarkResult,
} from './protocol';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untrusted JSON, narrowed field by field below
export interface PostResult { status: number; json: any }

export interface MarksBody {
  routeId: string;
  direction: AttDirection;
  marks: Array<{ learnerId: string; status: 'present' | 'absent'; tappedAt: string; clientId: string }>;
}

export interface ScanBody {
  token: string;
  source: 'camera';
  walkUp: boolean;
  direction: AttDirection;
  tappedAt: string;
  clientId: string;
}

export interface SyncDeps {
  kv: Kv;
  userId: string;
  now: () => Date;
  /** Must THROW when the request gets no response (no network). */
  postMarks: (body: MarksBody) => Promise<PostResult>;
  /** Must THROW when the request gets no response (no network). */
  postScan: (body: ScanBody) => Promise<PostResult>;
}

export interface SyncOutcome { entry: OutboxEntry; result: MarkResult }

export interface SyncReport {
  outcomes: SyncOutcome[];
  /** Requests actually made. 0 means nothing was due. */
  attempted: number;
  deferred: number;
  networkDown: boolean;
  authRequired: boolean;
}

async function deferAll(d: SyncDeps, entries: OutboxEntry[], report: SyncReport): Promise<void> {
  for (const e of entries) await deferIfSame(d.kv, e, d.now());
  report.deferred += entries.length;
}

async function settle(d: SyncDeps, e: OutboxEntry, r: MarkResult, report: SyncReport): Promise<void> {
  if (!isSavedOutcome(r.outcome)) {
    await addProblem(d.kv, {
      clientId: e.clientId,
      userId: e.userId,
      learnerId: e.learnerId,
      name: e.name,
      reason: r.outcome === 'locked' ? 'locked' : r.reason,
      message: r.outcome === 'locked'
        ? `Already marked by ${r.markedByName}`
        : r.message ?? REJECT_REASON_TEXT[r.reason],
      tappedAt: e.tappedAt,
      recordedAt: d.now().toISOString(),
    });
  }
  await removeIfSame(d.kv, e);
  report.outcomes.push({ entry: e, result: r });
}

const reject = (e: OutboxEntry, reason: MarkRejectReason, message?: string): MarkResult =>
  ({ clientId: e.clientId, outcome: 'rejected', reason, ...(message ? { message } : {}) });

async function settleMarkBatch(d: SyncDeps, batch: MarkEntry[], res: PostResult, report: SyncReport): Promise<void> {
  const results: MarkResult[] = Array.isArray(res.json?.results) ? res.json.results : [];
  if (results.length > 0) {
    const byId = new Map(results.map((r) => [r.clientId, r]));
    for (const e of batch) {
      const r = byId.get(e.clientId);
      if (r) await settle(d, e, r, report);
      else await deferAll(d, [e], report);
    }
    return;
  }
  if (res.status >= 500) return deferAll(d, batch, report);

  if (res.status === 403 && res.json?.reason === 'not_your_share') {
    const taken = new Set(
      ((res.json.learners ?? []) as Array<{ learner_id: string }>).map((l) => l.learner_id),
    );
    for (const e of batch) {
      if (taken.has(e.learnerId)) await settle(d, e, reject(e, 'not_your_share'), report);
    }
    // The rest were not written. They go again next cycle, without these.
    return;
  }

  const message = typeof res.json?.error === 'string' ? res.json.error : undefined;
  const reason: MarkRejectReason =
    res.status === 403 ? 'not_assigned'
    : res.status === 409 && res.json?.reason === 'window_closed' ? 'outside_window'
    : res.status === 400 && message === 'No valid learners for this route' ? 'not_on_route'
    : 'invalid';
  for (const e of batch) await settle(d, e, reject(e, reason, message), report);
}

async function settleScan(d: SyncDeps, scan: ScanEntry, res: PostResult, report: SyncReport): Promise<void> {
  const j = res.json ?? {};
  if (j.ok) {
    return settle(d, scan, {
      clientId: scan.clientId,
      outcome: j.alreadyMarked ? 'noop_same_status' : 'inserted',
      walkUp: !!j.walkUp,
    }, report);
  }
  if (res.status >= 500) return deferAll(d, [scan], report);
  const reason: MarkRejectReason =
    j.reason === 'not_booked' ? 'not_booked'
    : j.reason === 'window_closed' ? 'outside_window'
    : j.reason === 'stale' || j.reason === 'future' || j.reason === 'invalid' ? j.reason
    : res.status === 403 ? 'not_assigned'
    : 'scan_refused';
  return settle(d, scan, reject(scan, reason, typeof j.error === 'string' ? j.error : undefined), report);
}

export async function syncOnce(d: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = { outcomes: [], attempted: 0, deferred: 0, networkDown: false, authRequired: false };
  const nowMs = d.now().getTime();
  const due = (await listOutbox(d.kv, d.userId)).filter((e) => e.nextAttemptAt <= nowMs);

  const groups = new Map<string, MarkEntry[]>();
  for (const e of due) {
    if (e.kind !== 'mark') continue;
    const k = `${e.routeId}|${e.tripDate}|${e.direction}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const batches: MarkEntry[][] = [];
  for (const g of groups.values()) {
    for (let i = 0; i < g.length; i += SYNC_BATCH_SIZE) batches.push(g.slice(i, i + SYNC_BATCH_SIZE));
  }

  for (const batch of batches) {
    let res: PostResult;
    report.attempted++;
    try {
      res = await d.postMarks({
        routeId: batch[0].routeId,
        direction: batch[0].direction,
        marks: batch.map((m) => ({ learnerId: m.learnerId, status: m.status, tappedAt: m.tappedAt, clientId: m.clientId })),
      });
    } catch {
      await deferAll(d, batch, report);
      report.networkDown = true;
      return report;
    }
    if (res.status === 401) {
      report.authRequired = true;
      return report;
    }
    await settleMarkBatch(d, batch, res, report);
  }

  for (const scan of due.filter((e): e is ScanEntry => e.kind === 'scan')) {
    let res: PostResult;
    report.attempted++;
    try {
      res = await d.postScan({
        token: scan.token, source: 'camera', walkUp: scan.walkUp, direction: scan.direction,
        tappedAt: scan.tappedAt, clientId: scan.clientId,
      });
    } catch {
      await deferAll(d, [scan], report);
      report.networkDown = true;
      return report;
    }
    if (res.status === 401) {
      report.authRequired = true;
      return report;
    }
    await settleScan(d, scan, res, report);
  }

  return report;
}

let inFlight: Promise<SyncReport> | null = null;

/** syncOnce, but a second caller while one runs gets the same run. */
export function syncOutbox(d: SyncDeps): Promise<SyncReport> {
  if (!inFlight) inFlight = syncOnce(d).finally(() => { inFlight = null; });
  return inFlight;
}
```

- [ ] **Step 5: Implement the messages**

`lib/boarding/offline/messages.ts`:

```ts
/**
 * What to tell the staffer after a sync. A handful of marks get a line each,
 * so a tap made with signal reads exactly like before offline support. A
 * backlog sent after signal returns gets ONE summary line, not thirty toasts.
 */
import { REJECT_REASON_TEXT, isSavedOutcome } from './protocol';
import type { SyncOutcome } from './sync';

export interface SyncMessage { kind: 'success' | 'warning'; text: string }

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function syncMessages(outcomes: SyncOutcome[]): SyncMessage[] {
  if (outcomes.length === 0) return [];
  const failed = outcomes.filter((o) => !isSavedOutcome(o.result.outcome));

  if (outcomes.length > 3) {
    const saved = outcomes.length - failed.length;
    return [{
      kind: failed.length > 0 ? 'warning' : 'success',
      text: `Sent ${saved} saved mark${saved === 1 ? '' : 's'}.` +
        (failed.length > 0 ? ` ${failed.length} not saved — see "Not saved" on this page.` : ''),
    }];
  }

  return outcomes.map(({ entry, result }): SyncMessage => {
    const who = entry.name ?? 'Student';
    const status = entry.kind === 'mark' ? entry.status : 'present';
    if (result.outcome === 'locked') {
      return { kind: 'warning', text: `${who}: not saved — already marked by ${result.markedByName}.` };
    }
    if (result.outcome === 'rejected') {
      return { kind: 'warning', text: `${who}: not saved — ${lowerFirst(result.message ?? REJECT_REASON_TEXT[result.reason])}` };
    }
    if (result.outcome === 'noop_same_status') return { kind: 'success', text: `${who} was already marked ${status}.` };
    if (result.outcome === 'inserted' && result.walkUp) {
      return { kind: 'success', text: `${who} recorded as travelling without a ticket. They have been notified.` };
    }
    return { kind: 'success', text: `Marked ${who} ${status}.` };
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/offline/sync.test.ts lib/boarding/offline/messages.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/boarding/offline/sync.ts lib/boarding/offline/messages.ts lib/boarding/offline/sync.test.ts lib/boarding/offline/messages.test.ts
git commit -m "feat(boarding): send queued marks when signal returns"
```

---

### Task 12: The hook, the banner and the "Not saved" panel

**Files:**
- Create: `lib/boarding/offline/transport.ts`
- Create: `components/boarding/offline/use-offline-attendance.ts`
- Create: `components/boarding/offline/offline-status-bar.tsx`
- Create: `components/boarding/offline/offline-problems-panel.tsx`

**Interfaces:**
- Consumes: Tasks 7, 8, 11.
- Produces:
  - `transport.ts`: `postMarks(body: MarksBody)`, `postScan(body: ScanBody)`.
  - `useOfflineAttendance(userId: string | null, onSynced: () => void)` returning `{ entries: OutboxEntry[]; problems: Problem[]; online: boolean; authRequired: boolean; markOffline(row: RosterRow, status, direction: AttDirection): Promise<void>; queueScan(input: QueueScanInput): Promise<void>; dismiss(clientId): Promise<void>; syncNow(): Promise<void> }`; type `OfflineAttendance`; type `QueueScanInput = { learnerId: string | null; token: string; walkUp: boolean; name: string | null; verified: boolean; direction: AttDirection }`.
  - `<OfflineStatusBar online pendingCount savedAt authRequired />`, `<OfflineProblemsPanel problems onDismiss />`.

No unit tests: vitest runs in node with no DOM. The logic these wrap is covered by Tasks 7–11; this task is verified by type-check here and the browser check in Task 17.

- [ ] **Step 1: The transport**

`lib/boarding/offline/transport.ts`:

```ts
/** The outbox's two requests. `fetch` rejects only when no response arrives. */
import type { MarksBody, PostResult, ScanBody } from './sync';

async function post(url: string, body: unknown): Promise<PostResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export const postMarks = (body: MarksBody) => post('/api/boarding/attendance', body);
export const postScan = (body: ScanBody) => post('/api/boarding/scan', body);
```

- [ ] **Step 2: The hook**

`components/boarding/offline/use-offline-attendance.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { RosterRow } from '@/lib/booking/roster';
import type { AttDirection } from '@/lib/boarding/attendance-window';
import { offlineKv } from '@/lib/boarding/offline/kv';
import {
  dismissProblem, enqueueMark, enqueueScan, listOutbox, listProblems,
  type OutboxEntry, type Problem,
} from '@/lib/boarding/offline/outbox';
import { syncOutbox } from '@/lib/boarding/offline/sync';
import { syncMessages } from '@/lib/boarding/offline/messages';
import { postMarks, postScan } from '@/lib/boarding/offline/transport';
import { SYNC_INTERVAL_MS } from '@/lib/boarding/offline/protocol';

export interface QueueScanInput {
  learnerId: string | null;
  token: string;
  walkUp: boolean;
  name: string | null;
  verified: boolean;
  /** The trip open when the scan happened, from activeDirection(windows). */
  direction: AttDirection;
}

/**
 * The attendance screen's link to the outbox. Every roster tap goes through
 * markOffline -- online or not -- so the offline path is the path exercised
 * every ordinary morning, not only when signal drops.
 */
export function useOfflineAttendance(userId: string | null, onSynced: () => void) {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [online, setOnline] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const kv = offlineKv();
    const [e, p] = await Promise.all([listOutbox(kv, userId), listProblems(kv, userId)]);
    setEntries(e);
    setProblems(p);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId || typeof navigator === 'undefined' || !navigator.onLine) return;
    try {
      const report = await syncOutbox({ kv: offlineKv(), userId, now: () => new Date(), postMarks, postScan });
      if (report.attempted > 0) setReachable(!report.networkDown);
      setAuthRequired(report.authRequired);
      for (const m of syncMessages(report.outcomes)) {
        if (m.kind === 'success') toast.success(m.text);
        else toast(m.text, { icon: '⚠️' });
      }
      if (report.outcomes.length > 0) onSyncedRef.current();
    } catch (e) {
      console.error('boarding outbox sync failed:', e);
    }
    await refresh();
  }, [userId, refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();
    void syncNow();
    const goOnline = () => { setOnline(true); void syncNow(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') void syncNow(); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [refresh, syncNow]);

  const markOffline = useCallback(async (row: RosterRow, status: 'present' | 'absent', direction: AttDirection) => {
    if (!userId) return;
    try {
      await enqueueMark(offlineKv(), {
        userId, learnerId: row.learner_id, routeId: row.route_id, status, name: row.name, direction,
      }, new Date());
    } catch (e) {
      console.error('boarding outbox write failed:', e);
      toast.error('Could not save the mark on this phone. Try again.');
      return;
    }
    await refresh();
    void syncNow();
  }, [userId, refresh, syncNow]);

  const queueScan = useCallback(async (input: QueueScanInput) => {
    if (!userId) return;
    await enqueueScan(offlineKv(), { userId, ...input }, new Date());
    await refresh();
    void syncNow();
  }, [userId, refresh, syncNow]);

  const dismiss = useCallback(async (clientId: string) => {
    if (!userId) return;
    await dismissProblem(offlineKv(), userId, clientId);
    await refresh();
  }, [userId, refresh]);

  return { entries, problems, online: online && reachable, authRequired, markOffline, queueScan, dismiss, syncNow };
}

export type OfflineAttendance = ReturnType<typeof useOfflineAttendance>;
```

- [ ] **Step 3: The banner**

`components/boarding/offline/offline-status-bar.tsx`:

```tsx
'use client';

import { CloudOff, RefreshCw, LogIn } from 'lucide-react';

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * One line that says whether marks are reaching the server. Silent when
 * everything is normal, so an ordinary online morning looks exactly as before.
 */
export function OfflineStatusBar({
  online, pendingCount, savedAt, authRequired,
}: {
  online: boolean;
  pendingCount: number;
  /** Set when the roster on screen came from the phone, not the server. */
  savedAt: string | null;
  authRequired: boolean;
}) {
  const waiting = `${pendingCount} mark${pendingCount === 1 ? '' : 's'}`;

  if (authRequired) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
        <LogIn className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Your sign-in has expired. Sign in again to send {waiting} saved on this phone.</span>
      </div>
    );
  }
  if (!online || savedAt) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {online ? 'Cannot reach the server.' : 'No signal.'} Marks are saved on this phone and send
          when signal returns.
          {pendingCount > 0 ? ` ${waiting} waiting.` : ''}
          {savedAt ? ` Showing the list saved at ${fmt(savedAt)}.` : ''}
        </span>
      </div>
    );
  }
  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span>Sending {waiting}…</span>
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 4: The "Not saved" panel**

`components/boarding/offline/offline-problems-panel.tsx`:

```tsx
'use client';

import { X } from 'lucide-react';
import type { Problem } from '@/lib/boarding/offline/outbox';

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Marks the server refused after they were queued. Kept until dismissed. */
export function OfflineProblemsPanel({
  problems, onDismiss,
}: {
  problems: Problem[];
  onDismiss: (clientId: string) => void;
}) {
  if (problems.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
      <p className="font-medium">Not saved ({problems.length})</p>
      <ul className="mt-2 space-y-1.5">
        {problems.map((p) => (
          <li key={p.clientId} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="font-medium">{p.name ?? 'Unknown card or pass'}</span>
              {' — '}
              {p.message}
              <span className="text-xs opacity-75"> (tapped {fmt(p.tappedAt)})</span>
            </span>
            <button
              type="button"
              onClick={() => onDismiss(p.clientId)}
              aria-label="Dismiss"
              title="Dismiss"
              className="shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-500/20"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs opacity-80">
        Show these to the transport office if any of them need correcting.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Type-check the new files**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/boarding/offline/transport.ts|components/boarding/offline/"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/boarding/offline/transport.ts components/boarding/offline/
git commit -m "feat(boarding): offline status banner and not-saved list"
```

---

### Task 13: Attendance screen uses the outbox and the saved roster

**Files:**
- Modify: `app/boarding/attendance/page.tsx`
- Modify: `app/boarding/attendance/columns.tsx`

**Interfaces:**
- Consumes: Tasks 7, 9, 12; `istToday` from `lib/booking/window.ts`; `useAuth` from `@/providers/auth-provider`.
- Produces: `getRosterColumns` accepts an optional `pending?: Map<string, PendingView>`.

- [ ] **Step 1: Columns show a waiting badge**

In `app/boarding/attendance/columns.tsx`:

Add `Clock` to the lucide import. Add `import type { PendingView } from '@/lib/boarding/offline/apply-pending';`.

Replace the `StatusBadge` function with:

```tsx
function StatusBadge({ status, pending }: { status: RosterRow['status']; pending?: PendingView['kind'] }) {
  const badge =
    status === 'present' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        <Check className="h-3 w-3" /> Present
      </span>
    ) : status === 'absent' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <X className="h-3 w-3" /> Absent
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        Unmarked
      </span>
    );
  if (!pending) return badge;
  // Saved on this phone, not yet on the server. "Pending check" = a pass QR
  // whose signature only the server can verify.
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {badge}
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
        title={pending === 'unverified' ? 'The pass will be checked when you are back online' : 'Saved on this phone, waiting to send'}
      >
        <Clock className="h-3 w-3" />
        {pending === 'unverified' ? 'Pending check' : 'Waiting'}
      </span>
    </span>
  );
}
```

Add to the `getRosterColumns` options type, after `hasOwners: boolean;`:

```ts
  /** Marks waiting on the phone, by learner, for the "Waiting" badge. */
  pending?: Map<string, PendingView>;
```

Change the status cell to:

```tsx
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} pending={opts.pending?.get(row.original.learner_id)?.kind} />
      ),
```

- [ ] **Step 2: Page imports and types**

In `app/boarding/attendance/page.tsx` add imports:

```ts
import { useAuth } from '@/providers/auth-provider';
import { istToday } from '@/lib/booking/window';
import { offlineKv } from '@/lib/boarding/offline/kv';
import { loadRoster, loadWindows, pruneSnapshots, saveRoster, saveWindows } from '@/lib/boarding/offline/snapshot';
import { applyPending, pendingByLearner } from '@/lib/boarding/offline/apply-pending';
import { useOfflineAttendance } from '@/components/boarding/offline/use-offline-attendance';
import { OfflineStatusBar } from '@/components/boarding/offline/offline-status-bar';
import { OfflineProblemsPanel } from '@/components/boarding/offline/offline-problems-panel';
```

Replace `const todayStr = () => new Date().toISOString().slice(0, 10);` with:

```ts
// IST, matching the date the outbox files marks under. The old UTC version
// showed yesterday between 00:00 and 05:30 IST.
const todayStr = () => istToday();
```

Extend `RosterResponse`:

```ts
interface RosterResponse {
  date: string;
  direction: AttDirection;
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number; booked: number; withoutTicket: number; boardedWithoutTicket: number };
  share: { total: number; marked: number; remaining: number };
  /** Active JKKN ID -> learner id, for offline card scans. */
  cards?: Record<string, string>;
  /** Client-only: set when this came from the phone, not the server. */
  savedAt?: string | null;
}
```

- [ ] **Step 3: Fetch with a saved fallback**

Replace `fetchRoster` and `fetchWindows` with:

```ts
const OFFLINE_NO_COPY =
  "No signal, and this day's list is not saved on this phone yet. Open Attendance once with signal first.";

async function fetchRoster(date: string, direction: AttDirection, userId: string | null): Promise<RosterResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/boarding/attendance/roster?date=${date}&direction=${direction}`, { cache: 'no-store', credentials: 'same-origin' });
  } catch {
    // fetch rejects only when no response arrived at all: no signal.
    if (userId) {
      const saved = await loadRoster<RosterResponse>(offlineKv(), userId, date).catch(() => null);
      if (saved) return { ...saved.value, savedAt: saved.savedAt };
    }
    throw new Error(OFFLINE_NO_COPY);
  }
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load roster');
  const data = json.data as RosterResponse;
  if (userId) void saveRoster(offlineKv(), userId, date, data, new Date()).catch(() => {});
  return { ...data, savedAt: null };
}

async function fetchWindows(
  userId: string | null,
): Promise<{ windows: AttendanceWindows; activeDirection: AttDirection | null }> {
  try {
    const res = await fetch('/api/boarding/attendance-window', { cache: 'no-store', credentials: 'same-origin' });
    const json = await res.json();
    if (!res.ok || !json?.success) return { windows: DEFAULT_WINDOWS, activeDirection: null };
    const windows = json.data.windows as AttendanceWindows;
    if (userId) void saveWindows(offlineKv(), userId, windows, new Date()).catch(() => {});
    return {
      windows,
      // The server's clock, not the phone's: a wrong device clock must not open the wrong tab.
      activeDirection: (json.data.activeDirection ?? null) as AttDirection | null,
    };
  } catch {
    // No signal. Admin-customised hours (and the evening switch) must not
    // silently fall back to the defaults, so use the saved copy. With no
    // server to ask, the phone's clock is the only clock there is.
    const saved = userId ? await loadWindows<AttendanceWindows>(offlineKv(), userId).catch(() => null) : null;
    const windows = saved?.value ?? DEFAULT_WINDOWS;
    return { windows, activeDirection: activeDirection(windows) };
  }
}
```

- [ ] **Step 4: Wire the hook and the overlay**

At the top of `BoardingAttendancePage`, after `const qc = useQueryClient();` add:

```ts
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const offline = useOfflineAttendance(userId, () => qc.invalidateQueries({ queryKey: ['boarding-roster'] }));

  useEffect(() => {
    if (userId) void pruneSnapshots(offlineKv(), userId, istToday()).catch(() => {});
  }, [userId]);
```

Change the windows query to `queryFn: () => fetchWindows(userId)` and add `userId` to its key: `queryKey: ['boarding-attendance-window', userId]`. Keep its existing `refetchOnWindowFocus` and `refetchInterval` options. (`useAttendanceSettingsLive` invalidates `['boarding-attendance-window']`, which still matches by prefix.)

Change the roster query's `queryFn` to `() => fetchRoster(date, direction, userId)` and its key to `['boarding-roster', date, direction, userId]`. (`invalidateQueries({ queryKey: ['boarding-roster'] })` still matches by prefix.)

Replace:

```ts
  const rows = data?.rows ?? [];
  const counts = data?.counts ?? { total: 0, present: 0, absent: 0, unmarked: 0, booked: 0, withoutTicket: 0, boardedWithoutTicket: 0 };
  const share = data?.share ?? { total: 0, marked: 0, remaining: 0 };
```

with:

```ts
  // Only the viewed trip's unsent marks: the morning and evening tabs are
  // separate records, so a waiting evening mark must not show on Morning.
  const pending = useMemo(
    () => pendingByLearner(offline.entries, date, direction),
    [offline.entries, date, direction],
  );
  const view = useMemo(() => (data ? applyPending(data, pending) : undefined), [data, pending]);
  const rows = view?.rows ?? [];
  const counts = view?.counts ?? { total: 0, present: 0, absent: 0, unmarked: 0, booked: 0, withoutTicket: 0, boardedWithoutTicket: 0 };
  const share = view?.share ?? { total: 0, marked: 0, remaining: 0 };
```

- [ ] **Step 5: Marks go to the outbox**

Replace the whole `const mark = useCallback(async (row, status) => { ... }, [direction, qc]);` block with:

```ts
  // Every tap goes to the outbox, online or not; it sends within a second
  // when there is signal, and the toasts come from the sync's answers
  // (lib/boarding/offline/messages.ts), worded as they were before.
  // `direction` is the tab being marked. Marking is only enabled on the tab
  // whose window is open (canMark), so it is also the trip open at tap time.
  const { markOffline } = offline;
  const mark = useCallback(
    (row: RosterRow, status: 'present' | 'absent') => { void markOffline(row, status, direction); },
    [markOffline, direction],
  );
```

At the start of the `undo` callback body (before `setBusyId(row.learner_id);`) add:

```ts
      if (!offline.online) {
        toast('Undo needs signal. Try again when you are back online.', { icon: '⚠️' });
        return;
      }
```

and add `offline.online` to that callback's dependency array.

Update the columns memo:

```ts
  const columns = useMemo(
    () => getRosterColumns({ canMark, busyId, onMark: mark, onUndo: undo, hasOwners, pending }),
    [canMark, busyId, mark, undo, hasOwners, pending]
  );
```

- [ ] **Step 6: Render the banner, the panel, and gate live-only actions**

Directly after the closing `</div>` of the amber help box (the `<div className="mt-3 rounded-lg border border-amber-200 ...">` block) and before the closing `</div>` of the header section, add:

```tsx
        <div className="mt-3 space-y-3">
          <OfflineStatusBar
            online={offline.online}
            pendingCount={offline.entries.length}
            savedAt={data?.savedAt ?? null}
            authRequired={offline.authRequired}
          />
          <OfflineProblemsPanel problems={offline.problems} onDismiss={(id) => void offline.dismiss(id)} />
        </div>
```

Change the "I am absent today" button to be disabled offline:

```tsx
              <button
                type="button"
                onClick={() => setAbsenceOpen(true)}
                disabled={!offline.online}
                title={offline.online ? undefined : 'Needs signal'}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                I am absent today
              </button>
```

Pass the offline wiring to the scanner:

```tsx
      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        windows={windows}
        onMarked={() => qc.invalidateQueries({ queryKey: ['boarding-roster'] })}
        offline={{ online: offline.online, roster: view, queueScan: offline.queueScan }}
      />
```

(Task 14 adds the `offline` prop to `ScanDialog`. Until then this line is a type error; do Tasks 13 and 14 before type-checking, or type-check both together in Task 14.)

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: PASS, no new failures.

- [ ] **Step 8: Commit (together with Task 14 if you deferred the type-check)**

```bash
git add app/boarding/attendance/page.tsx app/boarding/attendance/columns.tsx
git commit -m "feat(boarding): mark attendance through the outbox"
```

---

### Task 14: Scanner falls back to the outbox

**Files:**
- Modify: `components/boarding/scan-dialog.tsx`

**Interfaces:**
- Consumes: `resolveScanOffline` (Task 10), `QueueScanInput` (Task 12, which carries `direction`), `RosterRow`, `activeDirection` (already used by `submit` to pick the open trip as `current`).
- Produces: optional prop `offline?: { online: boolean; roster: { rows: RosterRow[]; cards?: Record<string, string> } | undefined; queueScan: (input: QueueScanInput) => Promise<void> }`. Without it, behaviour is unchanged.

- [ ] **Step 1: Imports, result field, prop**

Add imports:

```ts
import { resolveScanOffline } from '@/lib/boarding/offline/local-scan';
import type { QueueScanInput } from '@/components/boarding/offline/use-offline-attendance';
import type { RosterRow } from '@/lib/booking/roster';
```

Also add `type AttDirection` to the existing import from `@/lib/boarding/attendance-window` (it already imports `activeDirection`, `LEG_NAME` and `type AttendanceWindows`).

Add to the `ScanResult` type, after `error?: string;`:

```ts
  /** Saved on this phone because there was no signal; sent later. */
  offlineSaved?: boolean;
  /** Offline pass QR: the signature is checked by the server on sync. */
  unverified?: boolean;
```

Add the prop to the component's parameter destructuring and type:

```ts
export default function ScanDialog({
  open,
  onOpenChange,
  windows,
  onMarked,
  offline,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  windows: AttendanceWindows;
  onMarked: () => void;
  offline?: {
    online: boolean;
    roster: { rows: RosterRow[]; cards?: Record<string, string> } | undefined;
    queueScan: (input: QueueScanInput) => Promise<void>;
  };
}) {
```

Keep a ref so the long-lived camera callback reads the current value, next to `windowsRef`:

```ts
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
```

- [ ] **Step 2: The offline branch**

Add this function inside the component, directly above `async function submit(`:

```ts
  /**
   * No signal: resolve against the saved roster and queue. Returns true when it
   * handled the scan. Only camera reads are queued -- a typed JKKN ID is
   * refused anyway, and a typed 6-digit code needs the server.
   */
  async function submitOffline(
    token: string, source: ScanSource, walkUp: boolean, direction: AttDirection,
  ): Promise<boolean> {
    const o = offlineRef.current;
    if (!o) return false;
    const local = resolveScanOffline(token, source, o.roster ?? { rows: [] });
    if (local.kind === 'refused') {
      setResult({ ok: false, error: local.message });
      return true;
    }
    if (source !== 'camera') {
      setResult({ ok: false, error: 'Typed codes need signal. Scan the QR or the ID card instead.' });
      return true;
    }
    if (local.kind === 'resolved' && local.alreadyPresent) {
      setResult({ ok: true, alreadyMarked: { by: 'you or a colleague', at: null }, learner: { name: local.name, rollNumber: null } });
      return true;
    }
    if (local.kind === 'resolved' && !local.booked && !walkUp) {
      // Same question the server asks, answered from the saved roster. The
      // existing "Add as walk-up" button re-enters submit() with walkUp=true.
      lastTokenRef.current = token;
      lastSourceRef.current = source;
      setResult({ ok: false, reason: 'not_booked', learner: { name: local.name, rollNumber: null }, seatsRemaining: 0, offlineSaved: false });
      return true;
    }
    await o.queueScan({
      learnerId: local.kind === 'resolved' ? local.learnerId : null,
      token,
      walkUp,
      name: local.kind === 'resolved' ? local.name : null,
      verified: local.kind === 'resolved' && local.verified,
      direction,
    });
    setResult({
      ok: true,
      offlineSaved: true,
      unverified: local.kind !== 'resolved' || !local.verified,
      walkUp,
      learner: local.kind === 'resolved' ? { name: local.name, rollNumber: null } : undefined,
      error: local.kind === 'unknown' ? local.message : undefined,
    });
    setManual('');
    onMarked();
    return true;
  }
```

- [ ] **Step 3: Use it before and after the request**

In `submit`, directly after the trip check's closing `}` (the `const current = activeDirection(w); if (!current) { ... return; }` block) and before `if (busyRef.current && !walkUp) return;`, add:

```ts
    if (offlineRef.current && !offlineRef.current.online) {
      await submitOffline(token, source, walkUp, current);
      return;
    }
```

In the `catch` of `submit`, replace:

```ts
      lastReadRef.current = null;
      setResult({ ok: false, error: 'Network error' });
```

with:

```ts
      lastReadRef.current = null;
      // The request never got an answer: treat it as no signal and queue it.
      if (!(await submitOffline(token, source, walkUp, current))) {
        setResult({ ok: false, error: 'Network error' });
      }
```

- [ ] **Step 4: Say it was saved on the phone**

In the success render (`result.ok ? (`), change the heading paragraph to:

```tsx
                <p className="font-medium text-green-700 dark:text-green-300">
                  {result.offlineSaved
                    ? '✓ Saved on this phone'
                    : result.alreadyMarked ? '✓ Already marked present' : '✓ Marked present'}
                  {result.walkUp ? ' · walk-up' : ''}
                </p>
                {result.offlineSaved && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    No signal. It will be sent when you are back online
                    {result.unverified ? ', and the pass will be checked then' : ''}.
                    {result.error ? ` ${result.error}` : ''}
                  </p>
                )}
```

In the `not_booked` branch, the phone does not know the seat count offline, so hide the count and drop the "(over capacity)" wording. Replace the "Seats remaining" line and the button with:

```tsx
                {result.offlineSaved === false ? null : (
                  <p className="text-xs text-muted-foreground">Seats remaining: {result.seatsRemaining ?? 0}</p>
                )}
                <FeeBadgeView fees={result.fees} />
                <Button className="w-full" onClick={() => submit(lastTokenRef.current, lastSourceRef.current, true)}>
                  {result.offlineSaved === false || (result.seatsRemaining ?? 0) > 0
                    ? 'Add as walk-up'
                    : 'Add as walk-up (over capacity)'}
                </Button>
```

(This replaces the existing `<FeeBadgeView fees={result.fees} />` and `<Button ...>` in that branch; do not leave duplicates.)

- [ ] **Step 5: Type-check Tasks 13 and 14 together**

Run: `npx tsc --noEmit 2>&1 | grep -E "components/boarding/scan-dialog.tsx|app/boarding/attendance/(page|columns).tsx"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add components/boarding/scan-dialog.tsx
git commit -m "feat(boarding): queue scans on the phone when there is no signal"
```

---

### Task 15: Portal opens offline and warns before losing marks

**Files:**
- Create: `components/boarding/offline/use-safe-sign-out.ts`
- Modify: `app/boarding/layout.tsx`

**Interfaces:**
- Consumes: `saveAccess`, `loadAccess` (Task 7), `countPending` (Task 8), `offlineKv` (Task 7), `istToday`.
- Produces: `useSafeSignOut(signOut: () => Promise<void>, userId: string | null) => () => Promise<void>`. Layout access state gains `'offline_unknown'`.

- [ ] **Step 1: The safe sign-out hook**

`components/boarding/offline/use-safe-sign-out.ts`:

```ts
'use client';

import { useCallback } from 'react';
import { offlineKv } from '@/lib/boarding/offline/kv';
import { countPending } from '@/lib/boarding/offline/outbox';

/**
 * Sign-out that says so when marks are still on the phone. They are filed
 * under this user and are never sent as anyone else, so they wait safely for
 * this user's next sign-in -- but the staffer should know that.
 */
export function useSafeSignOut(signOut: () => Promise<void>, userId: string | null) {
  return useCallback(async () => {
    if (userId) {
      const n = await countPending(offlineKv(), userId).catch(() => 0);
      if (n > 0) {
        const ok = window.confirm(
          `${n} attendance mark${n === 1 ? ' is' : 's are'} saved on this phone and not sent yet. ` +
          'They will be sent the next time you sign in here. Sign out anyway?',
        );
        if (!ok) return;
      }
    }
    await signOut();
  }, [signOut, userId]);
}
```

- [ ] **Step 2: Layout imports**

In `app/boarding/layout.tsx` add:

```ts
import { offlineKv } from '@/lib/boarding/offline/kv';
import { loadAccess, saveAccess } from '@/lib/boarding/offline/snapshot';
import { istToday } from '@/lib/booking/window';
import { useSafeSignOut } from '@/components/boarding/offline/use-safe-sign-out';
```

- [ ] **Step 3: Use the safe sign-out everywhere in the layout**

In `ProfileMenu`, change `const { profile, signOut } = useAuth();` to:

```ts
  const { profile, signOut: rawSignOut } = useAuth();
  const signOut = useSafeSignOut(rawSignOut, profile?.id ?? null);
```

In `BoardingLayout`, change `const { user, profile, loading, signOut } = useAuth();` to:

```ts
  const { user, profile, loading, signOut: rawSignOut } = useAuth();
  const signOut = useSafeSignOut(rawSignOut, profile?.id ?? null);
```

Every existing `signOut()` call in the file now goes through the check with no further edits.

- [ ] **Step 4: Remember and reuse the access verdict**

Change the access state type to include the new state:

```ts
  const [access, setAccess] = useState<
    'checking' | 'allowed' | 'choose' | 'must_pay' | 'denied' | 'offline_unknown'
  >('checking');
```

Replace the access-check effect's `(async () => { try { ... } catch { ... } })();` body with the block below. First add `const pid = profile.id;` on the line before `let cancelled = false;`, so the async closure does not read a possibly-null `profile`.

```ts
    (async () => {
      const gateToAccess = (gate: string | undefined) =>
        gate === 'in_duty' ? 'allowed'
        : gate === 'choose' || gate === 'must_pay' || gate === 'denied' ? gate
        : 'denied';
      let res: Response;
      try {
        res = await fetch('/api/boarding/access', { cache: 'no-store', credentials: 'same-origin' });
      } catch {
        // No signal. Use today's saved verdict; never invent one. A server
        // "denied" is only ever saved, never overridden, so this cannot let
        // anyone in that the server would refuse today.
        const saved = await loadAccess(offlineKv(), pid, istToday()).catch(() => null);
        if (!cancelled) setAccess(saved ? gateToAccess(saved) : 'offline_unknown');
        return;
      }
      try {
        const json = await res.json().catch(() => ({}));
        const d = json?.data ?? {};
        if (cancelled) return;
        if (res.ok) {
          // The server owns this decision -- see deriveInChargeGate in
          // lib/boarding/incharge-gate.ts, published via /api/boarding/access.
          const gate = d.gate as 'in_duty' | 'choose' | 'must_pay' | 'denied' | undefined;
          if (gate) void saveAccess(offlineKv(), pid, istToday(), gate, new Date()).catch(() => {});
          setAccess(gateToAccess(gate));
        } else setAccess('denied');
      } catch {
        if (!cancelled) setAccess('denied');
      }
    })();
```

- [ ] **Step 5: Render the offline-unknown state**

Directly before `if (access === 'denied') {` add:

```tsx
  if (access === 'offline_unknown') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <Bus className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">No signal</h1>
          <p className="mt-1 text-sm text-gray-500">
            Open the boarding portal once with signal today. After that it works without signal
            for the rest of the day.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/boarding/layout.tsx|components/boarding/offline/use-safe-sign-out.ts"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/boarding/layout.tsx components/boarding/offline/use-safe-sign-out.ts
git commit -m "feat(boarding): open the portal with no signal and guard unsent marks"
```

---

### Task 16: The installed app can start with no signal

**Files:**
- Modify: `public/sw.js`

**Interfaces:**
- Produces: a synthetic cache entry `/__tms-last-nav` holding the path of the last app page served from the network; an offline navigation to `/` serves that page from cache. `VERSION` becomes `'v2'`.

- [ ] **Step 1: Bump the version**

Change `const VERSION = 'v1';` to `const VERSION = 'v2';`.

- [ ] **Step 2: Pass the URL to `networkFirst`**

In the fetch handler change `event.respondWith(networkFirst(request));` to `event.respondWith(networkFirst(request, url));`.

- [ ] **Step 3: Replace `networkFirst`**

```js
// The installed app starts at "/", which the server REDIRECTS to the user's
// home page. A navigation's redirect cannot be cached, so with no signal "/"
// had nothing to fall back to and showed offline.html. Remember the last app
// page actually served, and fall back to it for "/".
const LAST_NAV_KEY = '/__tms-last-nav';

function isAppPage(url) {
  return (
    url.pathname !== '/' &&
    !url.pathname.startsWith('/auth/') &&
    url.pathname !== '/offline.html' &&
    !url.pathname.startsWith('/unauthorized') &&
    !url.pathname.startsWith('/access-denied')
  );
}

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
      if (isAppPage(url)) cache.put(LAST_NAV_KEY, new Response(url.pathname + url.search));
    }
    return response;
  } catch {
    let cached = await cache.match(request);
    if (!cached && url.pathname === '/') {
      const pointer = await cache.match(LAST_NAV_KEY);
      if (pointer) cached = await cache.match(await pointer.text());
    }
    if (cached) return cached;
    const offline = await cache.match('/offline.html');
    return offline || Response.error();
  }
}
```

- [ ] **Step 4: Syntax-check the worker**

Run: `node --check public/sw.js`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js
git commit -m "feat(pwa): start the installed app from its last page when offline"
```

---

### Task 17: Verify end to end

**Files:** none new.

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS. Count should be the pre-branch total plus about 55 new tests (Tasks 1, 3, 7–11). Record the exact numbers.

- [ ] **Step 2: Type-check every touched file**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "lib/boarding/(tapped-at|mark-results)|lib/boarding/offline/|components/boarding/(offline/|scan-dialog)|app/boarding/(layout|attendance/)|app/api/boarding/(attendance|scan)/"
```

Expected: no output.

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: exit 0.

- [ ] **Step 4: Unauthenticated probes still gate**

Start the dev server (`npm run dev`), identify its port by the page `<title>` (ports have swapped between this app and MyJKKN before), then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:<port>/api/boarding/attendance -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:<port>/api/boarding/scan -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:<port>/api/boarding/attendance/roster
```

Expected: `401` for all three (use `127.0.0.1`, not `localhost`).

- [ ] **Step 5: Confirm the server still stores online marks under the same date**

After the user (or a signed-in session) makes one ordinary online mark today, run:

```sql
select trip_date, scanned_at, method from tms_attendance
where scanned_at > now() - interval '30 minutes' order by scanned_at desc limit 5;
```

Expected: `trip_date` equals today's IST date, `scanned_at` within seconds of the tap.

- [ ] **Step 6: Browser check the user must run (the agent's Chrome is not signed in)**

Hand the user these steps:

1. On a phone or in Chrome, sign in as a boarding staffer during the window and open Attendance. Wait for the list.
2. In Chrome DevTools, Network tab, choose "Offline" (on a phone, turn on airplane mode).
3. Tap P on three students and A on one. Each row shows "Waiting"; the banner says "No signal … 4 marks waiting."
4. Reload the page. The list returns from the phone with the banner "Showing the list saved at …", and the four marks still show "Waiting".
5. Scan one JKKN ID card. The scanner says "Saved on this phone."
6. Go back online. Within 15 seconds the banner clears, a summary toast appears, and the "Waiting" badges disappear.
7. In Supabase, confirm those five rows exist with `scanned_at` equal to when they were tapped, not when they synced.
8. Close the app fully, go offline, open the installed app. It opens on Attendance, not the offline page.
9. If evening attendance is switched on: mark two students during the morning window with no signal, stay offline until the evening window opens, then reconnect. Both marks must appear on the Morning tab, not the Evening one, and in Supabase with `direction = 'onward'`.

- [ ] **Step 7: Report**

Write the task report with: test counts, build result, which browser steps the user confirmed, and any step not yet run. Do not describe the feature as verified on a phone until the user confirms Step 6.
