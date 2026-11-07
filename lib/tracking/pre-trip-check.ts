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
export const PRE_TRIP_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
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

export function validatePhoto(file: { size: number; type: string } | null): string | null {
  if (!file || file.size === 0) return 'Take a photo of the odometer.';
  if (!(PRE_TRIP_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return 'The odometer photo must be a JPG, PNG or WebP image.';
  }
  if (file.size > PRE_TRIP_PHOTO_MAX_BYTES) return 'The odometer photo must be 5 MB or smaller.';
  return null;
}

/**
 * The check-before-start rule.
 *
 * - A check exists for this driver + bus today → the trip may start (second and later
 *   trips of the day do not ask again).
 * - No check today → blocked; the driver must do the check first.
 * - The check table is not there yet (code deployed before the migration is applied)
 *   → allowed, so drivers are never locked out of tracking by a deploy-order mistake.
 *   Any OTHER lookup error is not swallowed here: the caller treats it as a 500.
 */
export type PreTripLookup =
  | { kind: 'found'; checkId: string }
  | { kind: 'none' }
  | { kind: 'table_missing' };

export type PreTripGate = { allow: true; checkId: string | null } | { allow: false; reason: 'pre_trip_check_required' };

export function preTripGate(lookup: PreTripLookup): PreTripGate {
  switch (lookup.kind) {
    case 'found':
      return { allow: true, checkId: lookup.checkId };
    case 'table_missing':
      return { allow: true, checkId: null };
    case 'none':
      return { allow: false, reason: 'pre_trip_check_required' };
  }
}

/**
 * True when a Supabase/PostgREST error means "the table does not exist" — Postgres
 * 42P01, or PostgREST's schema-cache miss PGRST205.
 */
export function isMissingTableError(err: { code?: string | null } | null | undefined): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205');
}
