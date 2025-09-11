import { type ClassValue, clsx } from "clsx"

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Format date for display in chat and other components
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: dateObj.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(dateObj);
  }
}

// Date utilities to handle timezone issues consistently
export class DateUtils {
  /**
   * Get local date string in YYYY-MM-DD format without timezone conversion
   */
  static toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse date string and return local date object
   */
  static fromLocalDateString(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Get today's date in local timezone as string
   */
  static getTodayString(): string {
    return this.toLocalDateString(new Date());
  }

  /**
   * Get tomorrow's date in local timezone as string
   */
  static getTomorrowString(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.toLocalDateString(tomorrow);
  }

  /**
   * Add days to a date and return the new date
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Check if two dates are the same day (ignoring time)
   */
  static isSameDay(date1: Date, date2: Date): boolean {
    return this.toLocalDateString(date1) === this.toLocalDateString(date2);
  }

  /**
   * Format date for display
   */
  static formatDisplayDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  /**
   * Format time for display
   */
  static formatDisplayTime(timeString: string): string {
    return new Date(`1970-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Get the start of month date
   */
  static getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /**
   * Get the end of month date
   */
  static getEndOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  /**
   * Check if a date is in the past (compared to today)
   */
  static isPastDate(date: Date): boolean {
    const today = new Date();
    return date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  /**
   * Check if a date is today
   */
  static isToday(date: Date): boolean {
    const today = new Date();
    return this.isSameDay(date, today);
  }

  /**
   * Check if a date is tomorrow
   */
  static isTomorrow(date: Date): boolean {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.isSameDay(date, tomorrow);
  }
}
