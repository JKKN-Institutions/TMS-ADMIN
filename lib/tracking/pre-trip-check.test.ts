import { describe, it, expect } from 'vitest';
import {
  issueLabels,
  isMissingTableError,
  parsePreTripInput,
  preTripGate,
  validatePhoto,
  PRE_TRIP_PHOTO_MAX_BYTES,
} from './pre-trip-check';

const ALL_YES = {
  tyres_ok: 'yes',
  brakes_ok: 'yes',
  lights_ok: 'yes',
  horn_ok: 'yes',
  fuel_level_ok: 'yes',
  first_aid_box_ok: 'yes',
};

describe('preTripGate (check before start)', () => {
  it('blocks the first trip of the day when no check exists', () => {
    expect(preTripGate({ kind: 'none' })).toEqual({ allow: false, reason: 'pre_trip_check_required' });
  });

  it('allows a trip once today\'s check exists, and passes its id on for linking', () => {
    expect(preTripGate({ kind: 'found', checkId: 'c1' })).toEqual({ allow: true, checkId: 'c1' });
  });

  it('allows the trip when the check table is not deployed yet (never locks drivers out)', () => {
    expect(preTripGate({ kind: 'table_missing' })).toEqual({ allow: true, checkId: null });
  });
});

describe('isMissingTableError', () => {
  it('recognises Postgres and PostgREST "no such table" codes', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205' })).toBe(true);
  });

  it('does not treat other errors as a missing table', () => {
    expect(isMissingTableError({ code: '57014' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe('parsePreTripInput', () => {
  it('accepts six answers and an odometer reading', () => {
    const r = parsePreTripInput({ ...ALL_YES, brakes_ok: 'no', odometer_km: ' 123456.5 ', notes: ' squeal ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.items.brakes_ok).toBe(false);
      expect(r.value.items.tyres_ok).toBe(true);
      expect(r.value.odometerKm).toBe(123456.5);
      expect(r.value.notes).toBe('squeal');
    }
  });

  it('rejects an unanswered item instead of treating it as yes', () => {
    const { horn_ok: _skip, ...rest } = ALL_YES;
    void _skip;
    const r = parsePreTripInput({ ...rest, odometer_km: '100' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain('Answer yes or no for Horn.');
  });

  it('rejects a missing or negative odometer reading', () => {
    expect(parsePreTripInput({ ...ALL_YES, odometer_km: '' }).ok).toBe(false);
    expect(parsePreTripInput({ ...ALL_YES, odometer_km: '-5' }).ok).toBe(false);
    expect(parsePreTripInput({ ...ALL_YES, odometer_km: 'abc' }).ok).toBe(false);
  });

  it('stores empty notes as null', () => {
    const r = parsePreTripInput({ ...ALL_YES, odometer_km: '0', notes: '   ' });
    expect(r.ok && r.value.notes).toBe(null);
  });
});

describe('issueLabels', () => {
  it('lists the "no" answers in checklist order', () => {
    expect(issueLabels({ tyres_ok: true, brakes_ok: false, lights_ok: true, horn_ok: true, fuel_level_ok: false, first_aid_box_ok: true }))
      .toEqual(['Brakes', 'Fuel level']);
  });

  it('is empty when everything is OK', () => {
    expect(issueLabels({ tyres_ok: true, brakes_ok: true })).toEqual([]);
  });
});

describe('validatePhoto', () => {
  it('requires a photo', () => {
    expect(validatePhoto(null)).not.toBeNull();
    expect(validatePhoto({ size: 0, type: 'image/jpeg' })).not.toBeNull();
  });

  it('accepts a normal JPG and rejects other types or oversize files', () => {
    expect(validatePhoto({ size: 1000, type: 'image/jpeg' })).toBeNull();
    expect(validatePhoto({ size: 1000, type: 'application/pdf' })).not.toBeNull();
    expect(validatePhoto({ size: PRE_TRIP_PHOTO_MAX_BYTES + 1, type: 'image/jpeg' })).not.toBeNull();
  });
});
