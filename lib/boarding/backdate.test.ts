import { describe, it, expect } from 'vitest';
import { decideTripDate, resolveFloor, FALLBACK_FLOOR_DAYS } from './backdate';

const TODAY = '2026-09-20';
const FLOOR = '2026-06-01';
const admin = { today: TODAY, floor: FLOOR, isSuperAdmin: true, isOverrideHolder: false };
const staff = { today: TODAY, floor: FLOOR, isSuperAdmin: false, isOverrideHolder: false };
const head = { today: TODAY, floor: FLOOR, isSuperAdmin: false, isOverrideHolder: true };

describe('decideTripDate', () => {
  it('an absent date is today, for everyone, and is not back-dated', () => {
    expect(decideTripDate({ ...staff })).toEqual({ ok: true, date: TODAY, isBackdated: false });
    expect(decideTripDate({ ...staff, requested: null })).toEqual({ ok: true, date: TODAY, isBackdated: false });
    expect(decideTripDate({ ...staff, requested: '' })).toEqual({ ok: true, date: TODAY, isBackdated: false });
  });

  it("today's date named explicitly is allowed for ordinary staff", () => {
    expect(decideTripDate({ ...staff, requested: TODAY })).toEqual({ ok: true, date: TODAY, isBackdated: false });
  });

  it('a past date is refused for ordinary staff', () => {
    const d = decideTripDate({ ...staff, requested: '2026-09-01' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d).toMatchObject({ status: 403, reason: 'not_permitted' });
  });

  it('a past date is allowed for a super admin and flagged back-dated', () => {
    expect(decideTripDate({ ...admin, requested: '2026-09-01' }))
      .toEqual({ ok: true, date: '2026-09-01', isBackdated: true });
  });

  it('a past date is allowed for an override holder', () => {
    expect(decideTripDate({ ...head, requested: '2026-09-01' }))
      .toEqual({ ok: true, date: '2026-09-01', isBackdated: true });
  });

  it('a future date is refused even for a super admin', () => {
    const d = decideTripDate({ ...admin, requested: '2026-09-21' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d).toMatchObject({ status: 400, reason: 'future_date' });
  });

  it('a date before the floor is refused even for a super admin', () => {
    const d = decideTripDate({ ...admin, requested: '2026-05-31' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d).toMatchObject({ status: 400, reason: 'before_floor' });
  });

  it('the floor date itself is allowed', () => {
    expect(decideTripDate({ ...admin, requested: FLOOR }))
      .toEqual({ ok: true, date: FLOOR, isBackdated: true });
  });

  it('a malformed date is refused before any authority is considered', () => {
    const d = decideTripDate({ ...admin, requested: '20-09-2026' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d).toMatchObject({ status: 400, reason: 'bad_date' });
  });
});

describe('resolveFloor', () => {
  it('uses the transport year start when there is one', () => {
    expect(resolveFloor('2026-06-01', TODAY)).toBe('2026-06-01');
  });

  it('falls back to a year before today when no transport year is current', () => {
    // A missing is_current row is a state this project has hit before. Returning
    // null here would make `date < floor` evaluate false and fail OPEN.
    expect(resolveFloor(null, TODAY)).toBe('2025-09-20');
    expect(FALLBACK_FLOOR_DAYS).toBe(365);
  });
});
