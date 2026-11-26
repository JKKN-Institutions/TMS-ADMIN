import { describe, it, expect } from 'vitest';
import { ABSENCE_TRIP_LABEL, absenceCoversTrip, parseAbsenceTrip } from './absence-trip';

describe('parseAbsenceTrip', () => {
  it('reads the three known trips', () => {
    expect(parseAbsenceTrip('full_day')).toBe('full_day');
    expect(parseAbsenceTrip('onward')).toBe('onward');
    expect(parseAbsenceTrip('return')).toBe('return');
  });

  it('treats a missing value as the full day', () => {
    // Older clients (and an installed PWA still running the old dialog) send
    // no trip at all; they meant the whole day, which is what they got before.
    expect(parseAbsenceTrip(undefined)).toBe('full_day');
    expect(parseAbsenceTrip(null)).toBe('full_day');
    expect(parseAbsenceTrip('')).toBe('full_day');
  });

  it('refuses anything else', () => {
    // Never fall back to full day here: a typo would excuse a trip the
    // in-charge is riding.
    expect(parseAbsenceTrip('morning')).toBeNull();
    expect(parseAbsenceTrip('FULL_DAY')).toBeNull();
    expect(parseAbsenceTrip(1)).toBeNull();
  });
});

describe('absenceCoversTrip', () => {
  it('a full day covers both trips', () => {
    expect(absenceCoversTrip('full_day', 'onward')).toBe(true);
    expect(absenceCoversTrip('full_day', 'return')).toBe(true);
  });

  it('a half day covers its own trip only', () => {
    expect(absenceCoversTrip('onward', 'onward')).toBe(true);
    expect(absenceCoversTrip('onward', 'return')).toBe(false);
    expect(absenceCoversTrip('return', 'return')).toBe(true);
    expect(absenceCoversTrip('return', 'onward')).toBe(false);
  });

  it('a row with no trip is a full day', () => {
    expect(absenceCoversTrip(undefined, 'return')).toBe(true);
    expect(absenceCoversTrip(null, 'onward')).toBe(true);
  });
});

describe('ABSENCE_TRIP_LABEL', () => {
  it('uses the words staff see on the attendance tabs', () => {
    expect(ABSENCE_TRIP_LABEL).toEqual({ full_day: 'Full day', onward: 'Morning', return: 'Evening' });
  });
});
