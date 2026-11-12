/**
 * Grouping bus markers that would overlap on screen.
 *
 * Works on SCREEN pixels, not map distance: whether two markers collide depends on the
 * zoom. Buses parked side by side at the college are 10 m apart and overlap at every
 * zoom, so a group must also be able to open as a list rather than only by zooming.
 *
 * Deliberately not a map plugin: the bus markers glide between positions every frame,
 * which the usual clustering plugin does not follow. This is a pure function the map
 * calls whenever positions or the zoom change. n is the fleet (tens of buses), so the
 * simple greedy pass is far cheaper than one animation frame.
 */

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

export interface Cluster {
  /** Member ids, sorted — so the same set of buses always yields the same key. */
  ids: string[];
  /** Stable identity for the group, for reusing its marker between updates. */
  key: string;
  /** Centre of the members, in the same pixel space as the input. */
  x: number;
  y: number;
}

/**
 * Greedy grouping: walk the points in a stable order; each point joins the first
 * group whose centre is within `radius`, otherwise it starts a new one.
 *
 * Points are sorted by id first, so the result does not depend on the order the
 * caller happened to list the buses in — otherwise groups would reshuffle on every
 * poll and their markers would flicker.
 */
export function clusterPoints(points: ReadonlyArray<ScreenPoint>, radius: number): Cluster[] {
  const sorted = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const r2 = radius * radius;
  const groups: Array<{ ids: string[]; sx: number; sy: number }> = [];

  for (const p of sorted) {
    let home: (typeof groups)[number] | null = null;
    for (const g of groups) {
      const cx = g.sx / g.ids.length;
      const cy = g.sy / g.ids.length;
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (dx * dx + dy * dy <= r2) {
        home = g;
        break;
      }
    }
    if (home) {
      home.ids.push(p.id);
      home.sx += p.x;
      home.sy += p.y;
    } else {
      groups.push({ ids: [p.id], sx: p.x, sy: p.y });
    }
  }

  return groups.map((g) => ({
    ids: g.ids,
    key: g.ids.join('|'),
    x: g.sx / g.ids.length,
    y: g.sy / g.ids.length,
  }));
}
