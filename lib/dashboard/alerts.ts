import type { DashboardAlert } from './types';

/**
 * Raw counts the "Needs attention" panel is built from. Every field is a
 * measured number; a metric that could not be measured must be passed as null
 * rather than defaulted to 0, otherwise a broken query renders as an all-clear.
 *
 * The optional `*Numbers` / `*Registrations` fields carry the specific things
 * behind a count. A count tells an officer something is wrong; the identifiers
 * tell them where — which is what makes a row actionable rather than merely
 * alarming.
 */
export interface AlertInputs {
  overdueBills: number | null;
  staleGrievances: number | null;
  openGrievances: number | null;
  ridersWithoutStop: number | null;
  expiredVehicleDocs: number | null;
  routesWithoutDriver: number | null;
  routesWithoutBus: number | null;
  /** Routes that had bookings today but no boarding scans at all. */
  routesNobodyScanned: number | null;
  /** Route numbers behind `routesNobodyScanned`. */
  routesNobodyScannedNumbers?: string[];
  /** Route numbers behind `routesWithoutBus`. */
  routesWithoutBusNumbers?: string[];
  /** Route numbers behind `routesWithoutDriver`. */
  routesWithoutDriverNumbers?: string[];
  /** Registrations behind `expiredVehicleDocs`. */
  expiredVehicleDocsRegistrations?: string[];
}

/** The fields of AlertInputs that are actual measurements. */
type MeasuredKey =
  | 'overdueBills'
  | 'staleGrievances'
  | 'openGrievances'
  | 'ridersWithoutStop'
  | 'expiredVehicleDocs'
  | 'routesWithoutDriver'
  | 'routesWithoutBus'
  | 'routesNobodyScanned';

/**
 * Human names for each check, used when a check could not run. Typed against
 * MeasuredKey so adding a check without naming it here is a compile error
 * rather than a silently anonymous "something failed".
 */
const CHECK_NAMES: Record<MeasuredKey, string> = {
  overdueBills: 'Overdue bills',
  staleGrievances: 'Stale grievances',
  openGrievances: 'Open grievances',
  ridersWithoutStop: 'Learners without a stop',
  expiredVehicleDocs: 'Bus documents',
  routesWithoutDriver: 'Route drivers',
  routesWithoutBus: 'Route buses',
  routesNobodyScanned: 'Boarding scans today',
};

const MEASURED_KEYS = Object.keys(CHECK_NAMES) as MeasuredKey[];

/**
 * Turns raw counts into the ordered alert list.
 *
 * This replaces the old "System Health" panel, which displayed the literal
 * strings "All systems operational" / "Database performance: Excellent"
 * regardless of state. A panel that always says green teaches people to ignore
 * it, so the rule here is inverted: it is silent unless something is actually
 * wrong, and only claims all-clear when every check ran AND passed.
 *
 * Each alert is shaped like a row on the live tracking board — a state chip, a
 * plain-English `reason`, the affected `items`, and one next step — because an
 * admin reading this panel is doing the same job they do on /track-all: decide
 * which row to open and what to change.
 *
 * Zero-count checks are dropped entirely — a row reading "0 overdue bills" is
 * noise. Ordering is severity first, then count descending, so the biggest
 * fire is always the top row and the grey "could not measure" row sits last.
 */
export function buildAlerts(input: AlertInputs): DashboardAlert[] {
  const unmeasured = MEASURED_KEYS.filter((k) => input[k] === null);

  const candidates: Array<DashboardAlert | null> = [
    alert({
      id: 'routes-nobody-scanned',
      severity: 'critical',
      state: 'Nobody scanned',
      count: input.routesNobodyScanned,
      subject: (n) => `${plural(n, 'route')} booked but nobody scanned`,
      reason:
        'Riders booked seats on these routes today, but not one boarding was scanned, so who actually travelled is unknown.',
      items: input.routesNobodyScannedNumbers,
      itemsLabel: 'Routes',
      action: 'Check the in-charge is marking boardings',
      href: '/routes/analytics',
    }),

    alert({
      id: 'overdue-bills',
      severity: 'critical',
      state: 'Payment overdue',
      count: input.overdueBills,
      subject: (n) => `overdue transport ${plural(n, 'bill')}`,
      reason:
        'The due date has passed and the bill is still unpaid. An overdue term locks the learner out of the portal.',
      action: 'Send a payment reminder',
      href: '/fees',
    }),

    alert({
      id: 'expired-docs',
      severity: 'critical',
      state: 'Document expired',
      count: input.expiredVehicleDocs,
      subject: (n) => `${plural(n, 'bus')} with an expired document`,
      reason:
        'Insurance, fitness, permit or pollution certificate is past its expiry date, so the bus is not road-legal.',
      items: input.expiredVehicleDocsRegistrations,
      itemsLabel: 'Buses',
      action: 'Renew before the bus runs again',
      href: '/vehicles',
    }),

    alert({
      id: 'routes-no-bus',
      severity: 'warning',
      state: 'No bus',
      count: input.routesWithoutBus,
      subject: (n) => `active ${plural(n, 'route')} with no bus assigned`,
      reason:
        'The route is active but resolves to no vehicle, so it has no seats and nobody can be allocated to it.',
      items: input.routesWithoutBusNumbers,
      itemsLabel: 'Routes',
      action: 'Assign a vehicle from the fleet',
      href: '/routes',
    }),

    alert({
      id: 'stale-grievances',
      severity: 'warning',
      state: 'Untouched 3 days+',
      count: input.staleGrievances,
      subject: (n) => `${plural(n, 'grievance')} untouched for over 3 days`,
      reason:
        'These complaints are still open and nobody has moved them for more than three days.',
      action: 'Assign an owner',
      href: '/grievances?status=open',
    }),

    alert({
      id: 'routes-no-driver',
      severity: 'warning',
      state: 'No driver',
      count: input.routesWithoutDriver,
      subject: (n) => `active ${plural(n, 'route')} with no driver assigned`,
      reason:
        'Nobody can start the trip or share the bus location on these routes until a driver is attached.',
      items: input.routesWithoutDriverNumbers,
      itemsLabel: 'Routes',
      action: 'Assign a driver',
      href: '/routes',
    }),

    alert({
      id: 'riders-no-stop',
      severity: 'warning',
      state: 'No boarding stop',
      count: input.ridersWithoutStop,
      subject: (n) => `bus-required ${plural(n, 'learner')} with no stop`,
      reason:
        'These learners need transport but have no boarding stop, and the portal will not let them book a seat without one.',
      action: 'Set a boarding stop so they can book',
      href: '/passengers/learners',
    }),

    alert({
      id: 'open-grievances',
      severity: 'info',
      state: 'Open',
      count: input.openGrievances,
      subject: (n) => `open ${plural(n, 'grievance')}`,
      reason: 'Complaints still open or in progress. None of them is stale yet.',
      href: '/grievances?status=open',
    }),

    // Last, and deliberately not silent: a check that failed is not a check
    // that passed. The tracking board keeps its grey "not set up" routes in the
    // list for the same reason.
    alert({
      id: 'checks-unmeasured',
      severity: 'unknown',
      state: 'Not measured',
      count: unmeasured.length,
      subject: (n) => `${plural(n, 'check')} could not run`,
      reason:
        'These figures are missing, not zero, so this panel cannot confirm an all-clear.',
      items: unmeasured.map((k) => CHECK_NAMES[k]),
      itemsLabel: 'Checks',
      action: 'Reload the dashboard',
    }),
  ];

  const rank: Record<DashboardAlert['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2,
    unknown: 3,
  };

  return candidates
    .filter((a): a is DashboardAlert => a !== null)
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}

function alert(spec: {
  id: string;
  severity: DashboardAlert['severity'];
  state: string;
  count: number | null;
  subject: (n: number) => string;
  reason: string;
  items?: string[];
  itemsLabel?: string;
  action?: string;
  href?: string;
}): DashboardAlert | null {
  // null = not measured, 0 = measured and clean. Neither deserves a row.
  if (spec.count === null || spec.count <= 0) return null;
  const subject = spec.subject(spec.count);
  return {
    id: spec.id,
    severity: spec.severity,
    label: `${spec.count} ${subject}`,
    subject,
    count: spec.count,
    state: spec.state,
    reason: spec.reason,
    items: spec.items && spec.items.length > 0 ? spec.items : undefined,
    itemsLabel: spec.itemsLabel,
    action: spec.action,
    href: spec.href,
  };
}

function plural(n: number, word: string): string {
  if (n === 1) return word;
  return word === 'bus' ? 'buses' : `${word}s`;
}

/**
 * True only when every check actually ran and every one came back clean.
 * An unmeasured check makes this false — "we don't know" is not "all clear".
 */
export function isAllClear(input: AlertInputs): boolean {
  return MEASURED_KEYS.every((k) => input[k] === 0);
}
