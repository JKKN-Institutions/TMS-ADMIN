export interface SchedulingSettings {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;
  bookingWindowDaysBefore: number;
  autoNotifyPassengers: boolean;
  sendReminderHours: number[];
}

export const defaultSchedulingSettings: SchedulingSettings = {
  enableBookingTimeWindow: true,
  bookingWindowEndHour: 19,    // 7 PM - Strict cutoff at 7 PM
  bookingWindowDaysBefore: 1,  // Day before trip (must be enabled by admin)
  autoNotifyPassengers: true,
  sendReminderHours: [24, 2]
};

export class SchedulingConfigManager {
  private static readonly STORAGE_KEY = 'adminSchedulingSettings';

  static getSettings(): SchedulingSettings {
    if (typeof window === 'undefined') {
      return defaultSchedulingSettings;
    }

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsedSettings = JSON.parse(stored);
        // Merge with defaults to ensure all properties exist
        return { ...defaultSchedulingSettings, ...parsedSettings };
      }
    } catch (error) {
      console.error('Error loading scheduling settings:', error);
    }

    return defaultSchedulingSettings;
  }

  static saveSettings(settings: SchedulingSettings): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.error('Error saving scheduling settings:', error);
      return false;
    }
  }

  static updateSetting<K extends keyof SchedulingSettings>(
    key: K,
    value: SchedulingSettings[K]
  ): boolean {
    const currentSettings = this.getSettings();
    const updatedSettings = { ...currentSettings, [key]: value };
    return this.saveSettings(updatedSettings);
  }

  // Validation methods
  static isBookingAllowed(
    bookingDate: Date,
    departureTime: Date,
    currentTime: Date = new Date()
  ): { allowed: boolean; reason?: string } {
    const settings = this.getSettings();
    
    // Check booking time window (most restrictive check first)
    if (settings.enableBookingTimeWindow) {
      const bookingWindowCheck = this.isWithinBookingTimeWindow(bookingDate, departureTime, currentTime);
      if (!bookingWindowCheck.allowed) {
        return bookingWindowCheck;
      }
    }
    
    // Check if booking is too far in advance
    const daysDifference = Math.ceil((bookingDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference > settings.bookingAdvanceDays) {
      return {
        allowed: false,
        reason: `Bookings can only be made ${settings.bookingAdvanceDays} days in advance`
      };
    }

    // Check minimum booking notice
    const hoursDifference = (departureTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    if (hoursDifference < settings.minBookingNoticeHours) {
      return {
        allowed: false,
        reason: `Bookings require at least ${settings.minBookingNoticeHours} hours notice`
      };
    }

    // Check cutoff time
    if (hoursDifference < settings.cutoffHours) {
      return {
        allowed: false,
        reason: `Booking window closed. Cutoff time is ${settings.cutoffHours} hours before departure`
      };
    }

    // Check same-day booking policy
    const isSameDay = bookingDate.toDateString() === currentTime.toDateString();
    if (isSameDay && !settings.allowSameDayBooking) {
      return {
        allowed: false,
        reason: 'Same-day booking is not allowed'
      };
    }

    // Check weekend scheduling
    const isWeekend = bookingDate.getDay() === 0 || bookingDate.getDay() === 6;
    if (isWeekend && !settings.weekendSchedulingEnabled) {
      return {
        allowed: false,
        reason: 'Weekend scheduling is disabled'
      };
    }

    return { allowed: true };
  }

  static isWithinBookingTimeWindow(
    tripDate: Date,
    departureTime: Date,
    currentTime: Date = new Date()
  ): { allowed: boolean; reason?: string } {
    const settings = this.getSettings();
    
    if (!settings.enableBookingTimeWindow) {
      return { allowed: true };
    }

    // Calculate the expected booking date (daysBefore the trip)
    const expectedBookingDate = new Date(tripDate);
    expectedBookingDate.setDate(tripDate.getDate() - settings.bookingWindowDaysBefore);
    
    // Check if current date matches expected booking date
    const currentDateStr = currentTime.toDateString();
    const expectedDateStr = expectedBookingDate.toDateString();
    
    if (currentDateStr !== expectedDateStr) {
      const daysBefore = settings.bookingWindowDaysBefore === 1 ? 'the day before' : `${settings.bookingWindowDaysBefore} days before`;
      return {
        allowed: false,
        reason: `Booking for trips must be done ${daysBefore} the trip date between ${this.formatHour(settings.bookingWindowStartHour)} and ${this.formatHour(settings.bookingWindowEndHour)}. This trip requires admin approval to enable scheduling.`
      };
    }

    // Check if current time is within the allowed window
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const endTimeInMinutes = settings.bookingWindowEndHour * 60;
    
    if (currentHour < settings.bookingWindowStartHour || currentTimeInMinutes >= endTimeInMinutes) {
      return {
        allowed: false,
        reason: `Booking window for this trip is closed. Bookings are only allowed between ${this.formatHour(settings.bookingWindowStartHour)} and ${this.formatHour(settings.bookingWindowEndHour)} ${settings.bookingWindowDaysBefore === 1 ? 'the day before' : `${settings.bookingWindowDaysBefore} days before`} the trip.`
      };
    }

    return { allowed: true };
  }

  static formatHour(hour: number): string {
    if (hour === 0) return '12:00 AM';
    if (hour < 12) return `${hour}:00 AM`;
    if (hour === 12) return '12:00 PM';
    return `${hour - 12}:00 PM`;
  }

  static getNextBookingWindow(tripDate: Date): { date: Date; startTime: string; endTime: string } | null {
    const settings = this.getSettings();
    
    if (!settings.enableBookingTimeWindow) {
      return null;
    }

    const bookingDate = new Date(tripDate);
    bookingDate.setDate(tripDate.getDate() - settings.bookingWindowDaysBefore);
    
    return {
      date: bookingDate,
      startTime: this.formatHour(settings.bookingWindowStartHour),
      endTime: this.formatHour(settings.bookingWindowEndHour)
    };
  }

  static canCancelBooking(departureTime: Date, currentTime: Date = new Date()): boolean {
    const settings = this.getSettings();
    const hoursDifference = (departureTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    return hoursDifference >= settings.cancellationDeadlineHours;
  }

  static canRescheduleBooking(departureTime: Date, currentTime: Date = new Date()): boolean {
    const settings = this.getSettings();
    const hoursDifference = (departureTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    return hoursDifference >= settings.rescheduleDeadlineHours;
  }

  static calculatePrice(basePrice: number, bookingTime: Date, isPeakHour: boolean = false): number {
    const settings = this.getSettings();
    
    if (!settings.dynamicPricing) {
      return basePrice;
    }

    let finalPrice = basePrice;

    if (isPeakHour) {
      finalPrice *= settings.peakHourMultiplier;
    } else {
      finalPrice *= settings.offPeakDiscount;
    }

    return Math.round(finalPrice * 100) / 100; // Round to 2 decimal places
  }

  static applyStudentDiscount(price: number): number {
    const settings = this.getSettings();
    const discount = settings.studentDiscountPercent / 100;
    return Math.round(price * (1 - discount) * 100) / 100;
  }

  static shouldSendReminder(departureTime: Date, currentTime: Date = new Date()): boolean {
    const settings = this.getSettings();
    const hoursDifference = (departureTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    
    return settings.sendReminderHours.some(hours => 
      Math.abs(hoursDifference - hours) < 0.5 // Within 30 minutes of reminder time
    );
  }
}

export default SchedulingConfigManager; 