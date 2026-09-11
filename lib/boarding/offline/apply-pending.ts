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
