// Date Utility Functions - Use these for consistent date handling

export function createLocalDate(dateString: string): Date {
  // Create a date object that represents the local date regardless of timezone
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

export function formatDateForDatabase(date: Date): string {
  // Format date as YYYY-MM-DD for database storage
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateForDisplay(date: Date): string {
  // Format date for display in UI
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function isSameDate(date1: Date, date2: Date): boolean {
  // Compare two dates ignoring time
  return formatDateForDatabase(date1) === formatDateForDatabase(date2);
}

export function compareDateWithSchedule(calendarDate: Date, scheduleDate: string): boolean {
  // Compare calendar date with schedule date string from database
  return formatDateForDatabase(calendarDate) === scheduleDate;
}

export function compareDateWithScheduleDate(calendarDate: Date, scheduleDate: Date): boolean {
  // Compare calendar date with schedule date object (when schedule_date is converted to Date)
  return formatDateForDatabase(calendarDate) === formatDateForDatabase(scheduleDate);
}

export function getCurrentDateString(): string {
  // Get current date as YYYY-MM-DD string
  return formatDateForDatabase(new Date());
}

export function addDays(date: Date, days: number): Date {
  // Add days to a date
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  // Add months to a date
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Enhanced cutoff time functions for booking restrictions
export interface BookingCutoffSettings {
  enableBookingTimeWindow: boolean;
  bookingWindowStartHour: number;
  bookingWindowEndHour: number;
  bookingWindowDaysBefore: number;
}

export function getDefaultCutoffSettings(): BookingCutoffSettings {
  return {
    enableBookingTimeWindow: true,
    bookingWindowStartHour: 6,   // 6 AM
    bookingWindowEndHour: 19,    // 7 PM
    bookingWindowDaysBefore: 1   // 1 day before trip
  };
}

export function isDateValidForAdminScheduling(date: Date, currentTime: Date = new Date()): { 
  valid: boolean; 
  reason?: string 
} {
  // Admin can only create schedules for future dates (not today or past)
  const dateStr = formatDateForDatabase(date);
  const todayStr = formatDateForDatabase(currentTime);
  
  if (dateStr <= todayStr) {
    return {
      valid: false,
      reason: `Cannot create schedules for ${dateStr === todayStr ? 'today' : 'past dates'}. Admin can only enable schedules for future dates to allow proper booking windows.`
    };
  }
  
  return { valid: true };
}

export function isWithinBookingCutoffTime(
  tripDate: Date, 
  currentTime: Date = new Date(),
  settings: BookingCutoffSettings = getDefaultCutoffSettings()
): { 
  allowed: boolean; 
  reason?: string;
  nextBookingWindow?: { date: string; startTime: string; endTime: string };
} {
  if (!settings.enableBookingTimeWindow) {
    return { allowed: true };
  }

  // Calculate the booking date (days before the trip)
  const bookingDate = new Date(tripDate);
  bookingDate.setDate(tripDate.getDate() - settings.bookingWindowDaysBefore);
  
  const bookingDateStr = formatDateForDatabase(bookingDate);
  const currentDateStr = formatDateForDatabase(currentTime);
  
  // Check if we're on the correct booking date
  if (currentDateStr !== bookingDateStr) {
    const nextWindow = {
      date: formatDateForDisplay(bookingDate),
      startTime: formatHour(settings.bookingWindowStartHour),
      endTime: formatHour(settings.bookingWindowEndHour)
    };
    
    const daysBefore = settings.bookingWindowDaysBefore === 1 ? 'the day before' : `${settings.bookingWindowDaysBefore} days before`;
    
    return {
      allowed: false,
      reason: `Booking for this trip is only allowed ${daysBefore} the trip date. Please book on ${nextWindow.date} between ${nextWindow.startTime} and ${nextWindow.endTime}.`,
      nextBookingWindow: nextWindow
    };
  }
  
  // Check if we're within the allowed time window
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const endTimeInMinutes = settings.bookingWindowEndHour * 60;
  
  if (currentHour < settings.bookingWindowStartHour || currentTimeInMinutes >= endTimeInMinutes) {
    return {
      allowed: false,
      reason: `Booking window is closed. Bookings are only allowed between ${formatHour(settings.bookingWindowStartHour)} and ${formatHour(settings.bookingWindowEndHour)} on the booking date.`
    };
  }
  
  return { allowed: true };
}

export function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

export function getBookingWindowInfo(
  tripDate: Date,
  settings: BookingCutoffSettings = getDefaultCutoffSettings()
): {
  bookingDate: Date;
  bookingDateStr: string;
  startTime: string;
  endTime: string;
  isPastBookingWindow: boolean;
} {
  const bookingDate = new Date(tripDate);
  bookingDate.setDate(tripDate.getDate() - settings.bookingWindowDaysBefore);
  
  const now = new Date();
  const bookingDateStr = formatDateForDatabase(bookingDate);
  const todayStr = formatDateForDatabase(now);
  
  // Check if booking window has passed
  let isPastBookingWindow = false;
  if (todayStr > bookingDateStr) {
    isPastBookingWindow = true;
  } else if (todayStr === bookingDateStr) {
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
    const endTimeInMinutes = settings.bookingWindowEndHour * 60;
    isPastBookingWindow = currentTimeInMinutes >= endTimeInMinutes;
  }
  
  return {
    bookingDate,
    bookingDateStr: formatDateForDisplay(bookingDate),
    startTime: formatHour(settings.bookingWindowStartHour),
    endTime: formatHour(settings.bookingWindowEndHour),
    isPastBookingWindow
  };
}

export function canAdminEnableScheduleForDate(date: Date, currentTime: Date = new Date()): {
  canEnable: boolean;
  reason?: string;
} {
  // Check if date is valid for admin scheduling
  const dateValidation = isDateValidForAdminScheduling(date, currentTime);
  if (!dateValidation.valid) {
    return {
      canEnable: false,
      reason: dateValidation.reason
    };
  }
  
  // Check if we're past the booking window for this trip
  const bookingInfo = getBookingWindowInfo(date);
  if (bookingInfo.isPastBookingWindow) {
    return {
      canEnable: false,
      reason: `Cannot enable schedule for ${formatDateForDisplay(date)}. The booking window (${bookingInfo.startTime} - ${bookingInfo.endTime} on ${bookingInfo.bookingDateStr}) has already passed.`
    };
  }
  
  return { canEnable: true };
}

export function getMinimumScheduleDate(currentTime: Date = new Date()): Date {
  // Return the minimum date that admin can create schedules for
  const tomorrow = addDays(currentTime, 1);
  return tomorrow;
}

export function getSchedulingRestrictionMessage(date: Date, currentTime: Date = new Date()): string | null {
  const validation = canAdminEnableScheduleForDate(date, currentTime);
  return validation.canEnable ? null : validation.reason || 'Cannot enable schedule for this date';
} 