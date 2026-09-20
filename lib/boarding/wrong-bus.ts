/**
 * wrong-bus — which bus a scan happened on, and whether the learner belongs on
 * it. Pure: no database, no React.
 *
 * A learner has an ALLOCATED bus (learners_profiles.transport_route_id) and,
 * on a given day, may hold a booking on a bus (tms_booking.route_id). The two
 * usually agree; about 1% of bookings name another bus. A scan says which bus
 * the learner actually boarded: the scanning staffer's bus (every boarding
 * staffer is assigned to exactly one).
 *
 *   booked here                        -> ok (a normal booked boarding)
 *   booked on another bus              -> booked_other_bus  "X, booked on bus N"
 *   no booking, allocated here         -> ok, travelled without booking
 *   no booking, allocated elsewhere    -> foreign_learner   "X, belongs to bus N"
 *
 * Every case is RECORDED present on the bus boarded (owner ruling 2026-09-17:
 * the card read is proof the learner travelled; refusing left them marked
 * absent on their own bus). The verdict only decides what the staffer is told
 * and what is stored beside the mark.
 */

export type WrongBusKind = 'booked_other_bus' | 'foreign_learner';

export interface BusDecision {
  /** The bus the scan is recorded on. */
  busRouteId: string;
  /** Null when the learner is where they should be. */
  wrongBus: { kind: WrongBusKind; routeId: string } | null;
  /** No booking on ANY bus today: the existing "travelled without booking". */
  walkUp: boolean;
  /** Stored beside the mark when the learner booked a different bus. */
  bookedRouteId: string | null;
  /** The stop to record: the learner's own stop only when it belongs to this bus. */
  stopId: string | null;
}

export type BusResolution = { ok: true; decision: BusDecision } | { ok: false; error: string };

export interface BusInput {
  /** The scanner's assigned buses; null for a super admin (no bus of their own). */
  staffRouteIds: string[] | null;
  allocatedRouteId: string | null;
  allocatedStopId: string | null;
  booking: { routeId: string; stopId: string | null } | null;
}

/** Which of the staffer's buses this scan is on. */
function pickBus(input: BusInput): string | null {
  const { staffRouteIds, allocatedRouteId, booking } = input;
  // A super admin is not on any bus: record where the learner is expected.
  if (staffRouteIds === null) return booking?.routeId ?? allocatedRouteId;
  if (booking && staffRouteIds.includes(booking.routeId)) return booking.routeId;
  if (allocatedRouteId && staffRouteIds.includes(allocatedRouteId)) return allocatedRouteId;
  // Neither matches: the learner is on the wrong bus, which is only knowable
  // when the staffer covers a single bus (true of every staffer today).
  return staffRouteIds.length === 1 ? staffRouteIds[0] : null;
}

export function decideBus(input: BusInput): BusResolution {
  // Not a bus learner at all (no allocation, no booking): refused as before.
  // "From another bus" needs another bus to be from.
  if (!input.allocatedRouteId && !input.booking) {
    return { ok: false, error: 'Learner has no allocated route' };
  }
  const bus = pickBus(input);
  if (!bus) {
    if (input.staffRouteIds && input.staffRouteIds.length === 0) {
      return { ok: false, error: 'You are not assigned to a bus, so this scan cannot be recorded.' };
    }
    if (input.staffRouteIds && input.staffRouteIds.length > 1) {
      return {
        ok: false,
        error: 'You cover more than one bus and this learner belongs to none of them. Mark them on the right bus by hand.',
      };
    }
    return { ok: false, error: 'Learner has no allocated route' };
  }

  const { booking, allocatedRouteId, allocatedStopId } = input;
  const bookedHere = booking?.routeId === bus;
  const bookedElsewhere = booking !== null && !bookedHere;

  let wrongBus: BusDecision['wrongBus'] = null;
  if (bookedElsewhere) wrongBus = { kind: 'booked_other_bus', routeId: booking.routeId };
  else if (!booking && allocatedRouteId !== bus && allocatedRouteId) {
    wrongBus = { kind: 'foreign_learner', routeId: allocatedRouteId };
  }

  const stopId = bookedHere ? booking.stopId ?? (allocatedRouteId === bus ? allocatedStopId : null)
    : allocatedRouteId === bus ? allocatedStopId
    : null;

  return {
    ok: true,
    decision: {
      busRouteId: bus,
      wrongBus,
      walkUp: booking === null,
      bookedRouteId: bookedElsewhere ? booking.routeId : null,
      stopId,
    },
  };
}
