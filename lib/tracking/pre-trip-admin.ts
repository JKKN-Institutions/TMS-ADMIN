/**
 * Transport-head view of the drivers' daily pre-trip checks — pure helpers, no I/O.
 * Used by GET /api/admin/pre-trip-checks and the /pre-trip-checks page; unit-tested
 * in ./pre-trip-admin.test.ts.
 */
import { PRE_TRIP_ITEMS, issueLabels, type PreTripItemKey } from './pre-trip-check';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date 'YYYY-MM-DD', else the fallback (today in IST). */
export function parseCheckDate(raw: string | null | undefined, fallback: string): string {
  if (!raw || !DATE_RE.test(raw)) return fallback;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw ? raw : fallback;
}

export interface AdminCheckRow {
  id: string;
  checkDate: string;
  createdAt: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  busRegistration: string | null;
  skipped: boolean;
  skipReason: string | null;
  items: Record<PreTripItemKey, boolean | null>;
  odometerKm: number | null;
  hasPhoto: boolean;
  anyIssue: boolean;
  notes: string | null;
  tripId: string | null;
}

export type CheckBadge =
  | { kind: 'skipped'; label: string }
  | { kind: 'issue'; label: string }
  | { kind: 'ok'; label: string };

/** The badge on a row: "skipped: <reason>", "issue: Brakes, Horn", or "all OK". */
export function checkBadge(row: Pick<AdminCheckRow, 'skipped' | 'skipReason' | 'items'>): CheckBadge {
  if (row.skipped) return { kind: 'skipped', label: `skipped: ${row.skipReason ?? 'no reason given'}` };
  const bad = issueLabels(row.items);
  if (bad.length > 0) return { kind: 'issue', label: `issue: ${bad.join(', ')}` };
  return { kind: 'ok', label: 'all OK' };
}

/** "Issues and skips only": anything flagged by the database's any_issue. */
export function filterChecks(rows: AdminCheckRow[], issuesOnly: boolean): AdminCheckRow[] {
  return issuesOnly ? rows.filter((r) => r.anyIssue) : rows;
}

/** Shape a database row (plus looked-up names) for the page. */
export function toAdminRow(
  r: {
    id: string;
    check_date: string;
    created_at: string;
    driver_id: string;
    vehicle_id: string;
    trip_id: string | null;
    skipped: boolean;
    skip_reason: string | null;
    odometer_km: number | string | null;
    odometer_photo_path: string | null;
    any_issue: boolean;
    notes: string | null;
  } & Partial<Record<PreTripItemKey, boolean | null>>,
  names: { driverName: string | null; busRegistration: string | null }
): AdminCheckRow {
  const items = {} as Record<PreTripItemKey, boolean | null>;
  for (const { key } of PRE_TRIP_ITEMS) items[key] = r[key] ?? null;
  return {
    id: r.id,
    checkDate: r.check_date,
    createdAt: r.created_at,
    driverId: r.driver_id,
    driverName: names.driverName || 'Unknown driver',
    vehicleId: r.vehicle_id,
    busRegistration: names.busRegistration,
    skipped: r.skipped,
    skipReason: r.skip_reason,
    items,
    odometerKm: r.odometer_km == null ? null : Number(r.odometer_km),
    hasPhoto: !!r.odometer_photo_path,
    anyIssue: r.any_issue,
    notes: r.notes,
    tripId: r.trip_id,
  };
}

/** Short-lived on purpose: the link is minted per tap and never stored. */
export const PHOTO_URL_TTL_SECONDS = 120;
