export interface SchedulingSettings {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;  // 0..23 IST cutoff
  bookingDaysAhead: number;      // 1..14 rolling horizon
  autoNotifyPassengers: boolean;
  autoGenerateBills: boolean;
  /** In-charge attendance enforcement. Ships in shadow — see lib/settings/scheduling.ts. */
  inchargeEnforcementMode: 'off' | 'shadow' | 'enforce';
}

export const defaultSchedulingSettings: SchedulingSettings = {
  enableBookingTimeWindow: true,
  bookingWindowEndHour: 20,  // 8 PM cutoff
  bookingDaysAhead: 6,       // ~one week ahead
  autoNotifyPassengers: true,
  autoGenerateBills: false,
  inchargeEnforcementMode: 'shadow',
};
