/**
 * Pure helpers for Route Check person entries (ticks). No I/O.
 */
import type { CheckOutcome } from './outcome';
import type { CheckPersonEntry, EntryFeeState, MatchedBy, PersonKind } from './types';
import type { BookingMark } from './marks';

export interface PersonDbRow {
  id: string; check_id: string; person_kind: PersonKind; learner_id: string | null; staff_id: string | null;
  manual_type: string | null; manual_name: string | null; matched_by: MatchedBy | null; scanned_code: string | null;
  outcome: CheckOutcome; on_route: boolean | null; booked: boolean | null; fee_state: EntryFeeState | null;
  notes: string | null; created_at: string;
  booking_state: BookingMark | null; fee_fine_id: string | null; booking_fine_id: string | null; fine_note: string | null;
}

export interface NameBook {
  learners: Map<string, { name: string; code: string | null }>;
  staff: Map<string, { name: string; code: string | null }>;
}

export function personEntryFromRow(row: PersonDbRow, names: NameBook): CheckPersonEntry {
  let name: string | null = null;
  let code: string | null = null;
  if (row.person_kind === 'learner' && row.learner_id) {
    const l = names.learners.get(row.learner_id);
    name = l?.name ?? null; code = l?.code ?? null;
  } else if (row.person_kind === 'staff' && row.staff_id) {
    const s = names.staff.get(row.staff_id);
    name = s?.name ?? null; code = s?.code ?? null;
  } else if (row.person_kind === 'manual') {
    name = row.manual_name;
  }
  return {
    id: row.id, kind: row.person_kind, learnerId: row.learner_id, staffId: row.staff_id, name, code,
    outcome: row.outcome, onRoute: row.on_route, booked: row.booked, feeState: row.fee_state,
    matchedBy: row.matched_by, scannedCode: row.scanned_code, notes: row.notes, createdAt: row.created_at,
    bookingState: row.booking_state ?? null, feeFineId: row.fee_fine_id ?? null,
    bookingFineId: row.booking_fine_id ?? null, fineNote: row.fine_note ?? null,
  };
}

/** learnerId → outcome and staffId → outcome for the ticks; later rows win. */
export function tickIndex(entries: CheckPersonEntry[]): { learners: Map<string, CheckOutcome>; staff: Map<string, CheckOutcome> } {
  const learners = new Map<string, CheckOutcome>();
  const staff = new Map<string, CheckOutcome>();
  for (const e of entries) {
    if (e.kind === 'learner' && e.learnerId) learners.set(e.learnerId, e.outcome);
    else if (e.kind === 'staff' && e.staffId) staff.set(e.staffId, e.outcome);
  }
  return { learners, staff };
}

type HasOtherBus = { other_bus?: { kind: 'booked' | 'boarded' | 'from' } | null };

/** A roster row is "not on this route" when it was seen boarding a different bus today. */
export function notOnRouteOf(row: HasOtherBus): boolean {
  return row.other_bus?.kind === 'from';
}

/** Registered = allocated to or booked on this route: everything except rows from another bus. */
export function registeredCount(rows: HasOtherBus[]): number {
  return rows.filter((r) => !notOnRouteOf(r)).length;
}

/** Staff fee badge: an in-charge is exempt; otherwise none → unpaid → paid. */
export function entryFeeState(i: { isIncharge: boolean; hasBill: boolean; hasOutstanding: boolean }): EntryFeeState {
  if (i.isIncharge) return 'exempt';
  if (!i.hasBill) return 'none';
  return i.hasOutstanding ? 'unpaid' : 'paid';
}
