import type { DashboardAlert } from './types';

/**
 * Raw counts the "Attention Required" panel is built from. Every field is a
 * measured number; a metric that could not be measured must be omitted (or
 * passed as null) rather than defaulted to 0, otherwise a broken query renders
 * as an all-clear.
 */
export interface AlertInputs {
  overdueBills: number | null;
  staleGrievances: number | null;
  openGrievances: number | null;
  ridersWithoutStop: number | null;
  expiredVehicleDocs: number | null;
  routesWithoutDriver: number | null;
}

/**
 * Turns raw counts into the ordered alert list.
 *
 * This replaces the old hardcoded "System Health" panel, which displayed the
 * literal strings "All systems operational" / "Database performance: Excellent"
 * regardless of state. A panel that always says green teaches admins to ignore
 * it, so the rule here is inverted: the panel is silent unless something is
 * actually wrong, and only claims all-clear when every check ran AND passed.
 *
 * Zero-count checks are dropped entirely — an alert row reading "0 overdue
 * bills" is noise. Ordering is by severity, then by count descending, so the
 * biggest fire is always the first row.
 */
export function buildAlerts(input: AlertInputs): DashboardAlert[] {
  const candidates: Array<DashboardAlert | null> = [
    alert('overdue-bills', 'critical', input.overdueBills, (n) =>
      `${n} overdue transport ${plural(n, 'bill')}`, '/fees?status=overdue'),

    alert('expired-docs', 'critical', input.expiredVehicleDocs, (n) =>
      `${n} ${plural(n, 'vehicle')} with an expired document`, '/vehicles'),

    alert('stale-grievances', 'warning', input.staleGrievances, (n) =>
      `${n} ${plural(n, 'grievance')} untouched for over 3 days`, '/grievances?status=open'),

    alert('routes-no-driver', 'warning', input.routesWithoutDriver, (n) =>
      `${n} active ${plural(n, 'route')} with no driver assigned`, '/routes'),

    alert('riders-no-stop', 'warning', input.ridersWithoutStop, (n) =>
      `${n} bus-required ${plural(n, 'learner')} with no stop assigned`, '/passengers/learners'),

    alert('open-grievances', 'info', input.openGrievances, (n) =>
      `${n} open ${plural(n, 'grievance')}`, '/grievances?status=open'),
  ];

  const rank: Record<DashboardAlert['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return candidates
    .filter((a): a is DashboardAlert => a !== null)
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}

function alert(
  id: string,
  severity: DashboardAlert['severity'],
  count: number | null,
  label: (n: number) => string,
  href: string
): DashboardAlert | null {
  // null = not measured, 0 = measured and clean. Neither is worth a row.
  if (count === null || count <= 0) return null;
  return { id, severity, label: label(count), count, href };
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

/**
 * True only when every check actually ran and every one came back clean.
 * An unmeasured check makes this false — "we don't know" is not "all clear".
 */
export function isAllClear(input: AlertInputs): boolean {
  const values = Object.values(input);
  return values.every((v) => v !== null && v === 0);
}
