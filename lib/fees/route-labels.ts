// lib/fees/route-labels.ts
// Turning a bill's route into something an operator can read and filter on.
// Pure — the stop -> route lookup itself lives in ./bills.ts with the other
// batch loaders.

export interface HasRoute {
  route_number: string | null;
  /** Optional: the fine ledger snapshots only the route NUMBER, not its name. */
  route_name?: string | null;
}

/** "32 — SANKAGIRI RS", degrading to whichever half is known. */
export function routeLabel(routeNumber: string | null, routeName: string | null): string {
  const num = (routeNumber ?? '').trim();
  const name = (routeName ?? '').trim();
  if (num && name) return `${num} — ${name}`;
  return num || name || '';
}

/**
 * Filter options for the Route dropdown. Keyed on route_number, which is what
 * the column's accessor exposes — matching on the label would break the filter
 * the moment a route is renamed.
 *
 * Route numbers are TEXT on this schema, so a plain sort puts 10 before 9.
 * Numbered routes are compared numerically and sorted ahead of lettered codes.
 */
export function routeFilterOptions(rows: HasRoute[]): Array<{ label: string; value: string }> {
  const byNumber = new Map<string, string>();
  for (const r of rows) {
    const value = (r.route_number ?? '').trim();
    // A person with no boarding stop has no route. Offering a blank option would
    // read as a real choice that silently selects "unassigned".
    if (!value || byNumber.has(value)) continue;
    byNumber.set(value, routeLabel(value, r.route_name ?? null));
  }

  return [...byNumber.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => {
      const na = Number(a.value);
      const nb = Number(b.value);
      const aNum = Number.isFinite(na);
      const bNum = Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      if (aNum !== bNum) return aNum ? -1 : 1;
      return a.value.localeCompare(b.value);
    });
}
