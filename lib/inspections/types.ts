import type { InspectionResult, ItemResult, Severity } from './result';
import type { DueState } from './due';
import type { DocStatus } from './doc-status';

export interface DashboardBus {
  vehicleId: string; registration: string; model: string | null; status: string;
  routeLabel: string | null; lastSubmittedAt: string | null; lastResult: InspectionResult | null;
  lastInspectionId: string | null; draftInspectionId: string | null;
  due: { state: DueState; dueOn: string | null; daysLeft: number | null };
}
export interface DashboardData {
  intervalDays: number;
  tiles: { overdue: number; dueSoon: number; never: number; grounded: number; openIssues: number };
  buses: DashboardBus[];
}
export interface InspectionItemDTO {
  id: string; category: string; label: string; severity: Severity; sortOrder: number;
  result: ItemResult | null; note: string | null; photoPaths: string[]; photoUrls: (string | null)[];
}
export interface InspectionDetail {
  id: string; status: 'draft' | 'submitted'; result: InspectionResult | null;
  startedAt: string; submittedAt: string | null; notes: string | null;
  inspectorName: string | null; isMine: boolean;
  location: { status: string | null; distanceM: number | null };
  vehicle: { id: string; registration: string; model: string | null; capacity: number | null; status: string; docs: DocStatus[]; firstAidAvailable: boolean | null };
  route: { id: string; number: string | null; name: string | null } | null;
  driver: { staffId: string; name: string; phone: string | null } | null;
  previous: { id: string; submittedAt: string; result: InspectionResult } | null;
  items: InspectionItemDTO[];
  /** Headcount snapshot (null leg = not taken yet). */
  riders: { leg: 'onward' | 'return' | null; headcount: number | null; booked: number | null; boarded: number | null };
  /** Verify-only learner ID card checks, newest first. */
  learnerChecks: { id: string; name: string | null; roll: string | null; outcome: LearnerOutcome; scannedAt: string }[];
}

import type { Leg, InchargeDuty, LearnerOutcome } from './overview';
export interface InspectionOverview {
  leg: Leg;
  date: string;
  route: { id: string; number: string | null; name: string | null; start: string | null; end: string | null; departure: string | null; arrival: string | null; capacity: number | null } | null;
  stops: { id: string; order: number | null; name: string; morning: string | null; evening: string | null; major: boolean }[];
  driverTrip: { status: string; startedAt: string | null; endedAt: string | null } | null;
  incharges: InchargeDuty[];
  otherMarkers: { name: string; marks: number }[];
  staffRiders: { staffId: string; name: string; designation: string | null; stopName: string | null }[];
  /** Registered (allocated) to the route — learners by pickup stop, plus staff riders. */
  registered: { learners: number; staff: number; byStop: Record<string, number>; noStop: number };
}
