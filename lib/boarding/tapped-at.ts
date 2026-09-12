/**
 * Judge a mark by WHEN IT WAS TAPPED, not when it reached the server.
 *
 * A mark made on a bus with no signal arrives late. Judging it at arrival
 * would refuse a mark tapped at 09:20 and sent at 09:40 as "window closed",
 * file a morning mark sent at 17:30 under the evening trip, and store a mark
 * sent the next morning under the wrong day. So the phone sends its tap time
 * and the server bounds how far that claim can go:
 *
 *   - a tap cannot really be in the future: when it is ahead of the server
 *     clock but still the same IST day, it is CLAMPED to `now` for the
 *     window/trip decision and for the returned `at` -- every roster tap
 *     goes through this path now (online included), so a phone that is a
 *     few minutes fast must not be refused;
 *   - a tap dated a LATER IST day is a clock wrong by hours, not by drift,
 *     and is still refused as `future`;
 *   - on the same IST day as the server (arrived after midnight = stale);
 *   - the trip and its window are decided by decideMarkDirection AT THE
 *     (possibly clamped) TAP TIME -- the same rule evening attendance uses
 *     at arrival, fed a different clock.
 *
 * Consequence worth knowing: every accepted mark's trip date is today in IST,
 * so a request can never mix days.
 */
import type { AttDirection, AttendanceWindows } from './attendance-window';
import { decideMarkDirection } from './trip-direction';
import { istToday } from '@/lib/booking/window';
import type { TapRejectReason } from './offline/protocol';

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

  // A tap cannot really be in the future. If it is ahead of the server but
  // still the same IST day, treat it as tapped now (clock drift). A tap
  // dated a later IST day is a clock wrong by hours, not by drift, and is
  // refused below.
  if (at.getTime() > now.getTime() && istToday(at) === istToday(now)) at = now;

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
