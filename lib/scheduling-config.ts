export interface SchedulingSettings {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;  // 0..23 IST cutoff
  bookingDaysAhead: number;      // 1..14 rolling horizon
  autoNotifyPassengers: boolean;
}

export const defaultSchedulingSettings: SchedulingSettings = {
  enableBookingTimeWindow: true,
  bookingWindowEndHour: 20,  // 8 PM cutoff
  bookingDaysAhead: 6,       // ~one week ahead
  autoNotifyPassengers: true,
};
