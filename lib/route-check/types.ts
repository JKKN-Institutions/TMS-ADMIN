// Shared types for route checks — used by APIs and pages. No I/O, no React.
import type { CheckOutcome } from './outcome';
import type { FeeState } from '@/lib/boarding/fee-roster';
import type { OtherBus } from '@/lib/booking/roster';
import type { Candidate } from './resolve';
import type { BookingMark, FeeMark } from './marks';

export type CheckLeg = 'onward' | 'return';
export type CheckStatus = 'draft' | 'submitted';
export type PersonKind = 'learner' | 'staff' | 'manual' | 'unknown';
export type EntryFeeState = FeeState | 'exempt' | 'override';
export type MatchedBy = 'jkkn_id' | 'uuid' | 'roll_number' | 'register_number' | 'staff_id' | 'manual';

/** One recorded line of a check (a tick, a manual entry or an unknown card). */
export interface CheckPersonEntry {
  id: string;
  kind: PersonKind;
  learnerId: string | null;
  staffId: string | null;
  name: string | null;
  /** Roll / register number or staff code — what the checker recognises the person by. */
  code: string | null;
  outcome: CheckOutcome;
  onRoute: boolean | null;
  booked: boolean | null;
  feeState: EntryFeeState | null;
  matchedBy: MatchedBy | null;
  scannedCode: string | null;
  notes: string | null;
  createdAt: string;
  bookingState: BookingMark | null;
  feeFineId: string | null;
  bookingFineId: string | null;
  fineNote: string | null;
}

export interface CheckHeader {
  id: string;
  routeId: string;
  status: CheckStatus;
  checkDate: string;
  leg: CheckLeg;
  startedAt: string;
  submittedAt: string | null;
}

export interface CheckRouteInfo { id: string; routeNumber: string | null; routeName: string | null; vehicleReg: string | null }

export interface CheckLearnerRow {
  learnerId: string;
  name: string;
  roll: string | null;
  stopId: string | null;
  stopName: string;
  stopTime: string | null;
  status: 'present' | 'absent' | 'unmarked';
  booked: boolean;
  feeState: FeeState;
  feeOwed: number | null;
  notOnRoute: boolean;
  otherBus: OtherBus | null;
  /** Ticked in THIS check (a tms_route_check_person row exists). */
  checked: boolean;
  checkOutcome: CheckOutcome | null;
  feeMark: FeeMark;
  bookingMark: BookingMark;
}

export interface CheckStaffRow {
  staffId: string;
  name: string;
  designation: string | null;
  code: string | null;
  isIncharge: boolean;
  feeState: EntryFeeState;
  feeOwed: number | null;
  checked: boolean;
  checkOutcome: CheckOutcome | null;
}

export interface CheckCounts {
  registered: number; booked: number; present: number; unpaid: number;
  withoutBooking: number; notOnRoute: number; checked: number;
}

export interface CheckView {
  check: CheckHeader;
  route: CheckRouteInfo;
  learners: CheckLearnerRow[];
  staff: CheckStaffRow[];
  counts: CheckCounts;
  entries: CheckPersonEntry[];
}

export interface MyCheckRoute {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  vehicleReg: string | null;
  today: { onward: { id: string; status: CheckStatus } | null; return: { id: string; status: CheckStatus } | null };
}

export type ScanResponse =
  | { kind: 'recorded'; entry: CheckPersonEntry; alreadyChecked: boolean; feeOwed: number | null }
  | { kind: 'candidates'; code: string; candidates: Candidate[] };
