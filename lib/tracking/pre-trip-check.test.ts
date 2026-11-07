import { describe, it, expect } from 'vitest';
import {
  issueLabels,
  isMissingTableError,
  parsePreTripInput,
  preTripCheckDue,
  parseSkipReason,
  preTripRowError,
  validatePhoto,
  sniffImageType,
  PRE_TRIP_UPLOAD_MAX_BYTES,
} from './pre-trip-check';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));
const PDF = new Uint8Array([...'%PDF-1.7'].map((c) => c.charCodeAt(0)));

const ALL_YES = {
  tyres_ok: 'yes',
  brakes_ok: 'yes',
  lights_ok: 'yes',
  horn_ok: 'yes',
  fuel_level_ok: 'yes',
  first_aid_box_ok: 'yes',
};

describe('preTripCheckDue (reminder, never a block)', () => {
  it('is due when there is no check or skip today', () => {
    expect(preTripCheckDue({ kind: 'none' })).toBe(true);
  });

  it('is not due once today\'s check or skip exists', () => {
    expect(preTripCheckDue({ kind: 'found', checkId: 'c1' })).toBe(false);
  });

  it('is not due when the check table is not deployed yet', () => {
    expect(preTripCheckDue({ kind: 'table_missing' })).toBe(false);
  });
});

describe('parseSkipReason', () => {
  it('stores the label for the fixed reasons', () => {
    expect(parseSkipReason('camera', '')).toEqual({ ok: true, reason: 'Camera not working' });
    expect(parseSkipReason('network', undefined)).toEqual({ ok: true, reason: 'No network' });
    expect(parseSkipReason('emergency', null)).toEqual({ ok: true, reason: 'Emergency trip' });
  });

  it('stores the typed words for Other', () => {
    expect(parseSkipReason('other', '  tyre shop closed ')).toEqual({ ok: true, reason: 'Other: tyre shop closed' });
  });

  it('refuses a skip with no reason', () => {
    expect(parseSkipReason(undefined, undefined).ok).toBe(false);
    expect(parseSkipReason('', '').ok).toBe(false);
    expect(parseSkipReason('because', '').ok).toBe(false);
    expect(parseSkipReason('other', '   ').ok).toBe(false);
    expect(parseSkipReason('other', 'x'.repeat(301)).ok).toBe(false);
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

describe('sniffImageType (real type from the first bytes)', () => {
  it('recognises JPEG, PNG and WebP', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(WEBP)).toBe('image/webp');
  });

  it('rejects anything else, whatever the phone claims it is', () => {
    expect(sniffImageType(PDF)).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('validatePhoto', () => {
  it('requires a photo', () => {
    expect(validatePhoto(null).ok).toBe(false);
    expect(validatePhoto({ size: 0, head: JPEG }).ok).toBe(false);
  });

  it('accepts a real image and returns its sniffed type', () => {
    expect(validatePhoto({ size: 1000, head: PNG })).toEqual({ ok: true, type: 'image/png' });
  });

  it('rejects non-images and anything over the upload limit (below Vercel\'s body limit)', () => {
    expect(validatePhoto({ size: 1000, head: PDF }).ok).toBe(false);
    const big = validatePhoto({ size: PRE_TRIP_UPLOAD_MAX_BYTES + 1, head: JPEG });
    expect(big.ok).toBe(false);
    expect(!big.ok && big.error).toMatch(/too large/);
    expect(PRE_TRIP_UPLOAD_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe('preTripRowError (server mirror of tms_pre_trip_check_done_or_skipped)', () => {
  const FULL = {
    skipped: false,
    tyres_ok: true,
    brakes_ok: false,
    lights_ok: true,
    horn_ok: true,
    fuel_level_ok: true,
    first_aid_box_ok: true,
    odometer_km: 124530,
    odometer_photo_path: 'u/2026-11-08/x.jpg',
  };

  it('accepts a full check and a skip with a reason', () => {
    expect(preTripRowError(FULL)).toBeNull();
    expect(preTripRowError({ skipped: true, skip_reason: 'No network' })).toBeNull();
  });

  it('refuses a skip whose reason is missing, empty or only spaces', () => {
    expect(preTripRowError({ skipped: true })).not.toBeNull();
    expect(preTripRowError({ skipped: true, skip_reason: null })).not.toBeNull();
    expect(preTripRowError({ skipped: true, skip_reason: '' })).not.toBeNull();
    expect(preTripRowError({ skipped: true, skip_reason: '   ' })).not.toBeNull();
    expect(preTripRowError({ skipped: true, skip_reason: '\t\n ' })).not.toBeNull();
  });

  it('refuses a reason over 500 characters', () => {
    expect(preTripRowError({ skipped: true, skip_reason: 'x'.repeat(501) })).not.toBeNull();
    expect(preTripRowError({ skipped: true, skip_reason: 'x'.repeat(500) })).toBeNull();
  });

  it('refuses a check with a missing answer, odometer or photo, or with a skip reason', () => {
    expect(preTripRowError({ ...FULL, horn_ok: null })).not.toBeNull();
    expect(preTripRowError({ ...FULL, odometer_km: null })).not.toBeNull();
    expect(preTripRowError({ ...FULL, odometer_photo_path: null })).not.toBeNull();
    expect(preTripRowError({ ...FULL, skip_reason: 'No network' })).not.toBeNull();
  });
});
