export interface SchedulingSettings {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;  // 0..23 IST cutoff
  bookingDaysAhead: number;      // 1..14 rolling horizon
  /** Opt-in: also offer TODAY. Additive — never costs a bookingDaysAhead slot. */
  allowSameDayBooking: boolean;
  /** 0..23 IST deadline on the travel date ITSELF, for same-day bookings. */
  sameDayBookingCutoffHour: number;
  autoNotifyPassengers: boolean;
  autoGenerateBills: boolean;
}

export const defaultSchedulingSettings: SchedulingSettings = {
  enableBookingTimeWindow: true,
  bookingWindowEndHour: 20,  // 8 PM cutoff
  bookingDaysAhead: 6,       // ~one week ahead
  allowSameDayBooking: false,
  sameDayBookingCutoffHour: 6, // 6 AM — before the buses roll
  autoNotifyPassengers: true,
  autoGenerateBills: false,
};
