/**
 * Driver's daily pre-trip check (Director, 7 Nov 2026) — pure rules, no I/O.
 *
 * Before the FIRST trip of the day on a bus, the driver answers six yes/no items and
 * photographs the odometer. The database row lives in tms_pre_trip_check (one per
 * driver, bus and IST day); this file decides what is valid and whether a trip may
 * start. Unit-tested in ./pre-trip-check.test.ts.
 */

export const PRE_TRIP_ITEMS = [
  { key: 'tyres_ok', label: 'Tyres' },
  { key: 'brakes_ok', label: 'Brakes' },
  { key: 'lights_ok', label: 'Lights' },
  { key: 'horn_ok', label: 'Horn' },
  { key: 'fuel_level_ok', label: 'Fuel level' },
  { key: 'first_aid_box_ok', label: 'First-aid box' },
] as const;

export type PreTripItemKey = (typeof PRE_TRIP_ITEMS)[number]['key'];
export type PreTripItems = Record<PreTripItemKey, boolean>;

export const PRE_TRIP_PHOTO_BUCKET = 'tms-pre-trip-photos';
export const PRE_TRIP_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // matches the bucket limit
/**
 * What the phone may send. Below Vercel's ~4.5 MB request-body limit, so an
 * oversize photo gets a plain message instead of a platform 413. The screen shrinks
 * the photo to a ≤1600 px JPEG first, which is normally a few hundred KB.
 */
export const PRE_TRIP_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const PRE_TRIP_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PreTripPhotoType = (typeof PRE_TRIP_PHOTO_TYPES)[number];
export const PRE_TRIP_NOTES_MAX = 1000;
const ODOMETER_MAX_KM = 10_000_000;

export interface PreTripInput {
  items: PreTripItems;
  odometerKm: number;
  notes: string | null;
}

/** 'yes'/'no' (what the form sends) or real booleans. Anything else is unanswered. */
function parseAnswer(v: unknown): boolean | null {
  if (v === true || v === 'yes' || v === 'true') return true;
  if (v === false || v === 'no' || v === 'false') return false;
  return null;
}

/**
 * Validate the form fields (not the photo — the route checks the file). Every item
 * must be answered: an untapped item is NOT a silent "yes".
 */
export function parsePreTripInput(
  raw: Record<string, unknown>
): { ok: true; value: PreTripInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const items = {} as PreTripItems;
  for (const { key, label } of PRE_TRIP_ITEMS) {
    const a = parseAnswer(raw[key]);
    if (a === null) errors.push(`Answer yes or no for ${label}.`);
    else items[key] = a;
  }

  const odoRaw = typeof raw.odometer_km === 'string' ? raw.odometer_km.trim() : raw.odometer_km;
  const odometerKm = typeof odoRaw === 'number' ? odoRaw : odoRaw === '' || odoRaw == null ? NaN : Number(odoRaw);
  if (!Number.isFinite(odometerKm) || odometerKm < 0 || odometerKm >= ODOMETER_MAX_KM) {
    errors.push('Enter the odometer reading in kilometres.');
  }

  const notesRaw = typeof raw.notes === 'string' ? raw.notes.trim() : '';
  if (notesRaw.length > PRE_TRIP_NOTES_MAX) errors.push(`Notes must be ${PRE_TRIP_NOTES_MAX} characters or fewer.`);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { items, odometerKm, notes: notesRaw || null } };
}

/** Labels of the items answered "no", in checklist order. Empty = all OK. */
export function issueLabels(items: Partial<Record<PreTripItemKey, boolean | null>>): string[] {
  return PRE_TRIP_ITEMS.filter(({ key }) => items[key] === false).map(({ label }) => label);
}

/**
 * The real image type from the file's first bytes. The type the phone reports is
 * not trusted: it can be missing, wrong (HEIC labelled image/jpeg) or forged.
 */
export function sniffImageType(head: Uint8Array): PreTripPhotoType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (
    head.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b)
  ) {
    return 'image/png';
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export const PHOTO_TOO_BIG_MESSAGE =
  'The photo is too large to send. Please take the photo again, a little further from the odometer.';

/** Check the photo by size and by its real bytes. Returns the sniffed type on success. */
export function validatePhoto(
  file: { size: number; head: Uint8Array } | null
): { ok: true; type: PreTripPhotoType } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: 'Take a photo of the odometer.' };
  if (file.size > PRE_TRIP_UPLOAD_MAX_BYTES) return { ok: false, error: PHOTO_TOO_BIG_MESSAGE };
  const type = sniffImageType(file.head);
  if (!type) return { ok: false, error: 'The odometer photo must be a JPG, PNG or WebP image.' };
  return { ok: true, type };
}

/**
 * Skip reasons (Director, 8 Nov). A skip is recorded, flagged as an issue and alerts
 * the transport head exactly like a NOT OK. "Other" needs the driver's own words.
 */
export const SKIP_REASONS = [
  { code: 'camera', label: 'Camera not working' },
  { code: 'network', label: 'No network' },
  { code: 'emergency', label: 'Emergency trip' },
  { code: 'other', label: 'Other' },
] as const;
export type SkipReasonCode = (typeof SKIP_REASONS)[number]['code'];
export const SKIP_OTHER_MAX = 300;

/** The skip reason to store, e.g. "No network" or "Other: tyre shop closed". */
export function parseSkipReason(
  code: unknown,
  otherText: unknown
): { ok: true; reason: string } | { ok: false; error: string } {
  const r = SKIP_REASONS.find((x) => x.code === code);
  if (!r) return { ok: false, error: 'Choose why you are skipping the check.' };
  if (r.code !== 'other') return { ok: true, reason: r.label };
  const text = typeof otherText === 'string' ? otherText.trim() : '';
  if (!text) return { ok: false, error: 'Type the reason for skipping the check.' };
  if (text.length > SKIP_OTHER_MAX) return { ok: false, error: `Keep the reason under ${SKIP_OTHER_MAX} characters.` };
  return { ok: true, reason: `Other: ${text}` };
}

/**
 * The reminder rule (Director, 8 Nov: a must-see reminder that NEVER blocks the trip).
 *
 * Starting a trip always succeeds. This only decides whether the driver must now see
 * the full-screen check:
 * - a check or skip exists for this driver + bus today → not due (later trips of the
 *   day do not ask again);
 * - none today → due;
 * - the check table is not deployed yet → not due (nothing to record it in).
 */
export type PreTripLookup =
  | { kind: 'found'; checkId: string }
  | { kind: 'none' }
  | { kind: 'table_missing' };

export function preTripCheckDue(lookup: PreTripLookup): boolean {
  return lookup.kind === 'none';
}

/**
 * True when a Supabase/PostgREST error means "the table does not exist" — Postgres
 * 42P01, or PostgREST's schema-cache miss PGRST205.
 */
export function isMissingTableError(err: { code?: string | null } | null | undefined): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205');
}
