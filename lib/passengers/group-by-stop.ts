// lib/passengers/group-by-stop.ts
// Group a route roster into per-stop sections for the route Passengers page.
//
// Extracted from app/(admin)/routes/[routeId]/passengers/page.tsx so it can be
// tested: the previous inline version was a RUN-LENGTH pass that only merged a
// person into the LAST group, on the assumption that the roster always arrives
// contiguous by stop. It does not, and React reported duplicate keys.

export interface StopGroupablePerson {
  stop_id: string | null;
  stop_name: string | null;
  pickup: string | null;
  evening: string | null;
}

export interface StopGroup<P extends StopGroupablePerson> {
  key: string;
  stop_name: string;
  pickup: string | null;
  evening: string | null;
  people: P[];
}

export const UNASSIGNED_STOP_KEY = 'none';
export const UNASSIGNED_STOP_LABEL = 'No stop assigned';

export function groupByStop<P extends StopGroupablePerson>(people: P[]): StopGroup<P>[] {
  // Keyed accumulation, NOT a run-length pass: the roster is sorted by stop
  // sequence and then by NAME, so everyone whose stop did not resolve shares
  // one sentinel sequence and arrives interleaved. A linear pass reopened a
  // group per run and handed React the same key twice.
  const byKey = new Map<string, StopGroup<P>>();
  for (const p of people) {
    // A de-activated or deleted stop still comes back on the person as a
    // stop_id but WITHOUT a stop_name, and renders as "No stop assigned".
    // Such rows share the single unassigned bucket, otherwise the page shows
    // one identical-looking section per dead stop id.
    const key = p.stop_id && p.stop_name ? p.stop_id : UNASSIGNED_STOP_KEY;
    const existing = byKey.get(key);
    if (existing) {
      existing.people.push(p);
      continue;
    }
    byKey.set(key, {
      key,
      stop_name: p.stop_name ?? UNASSIGNED_STOP_LABEL,
      pickup: p.pickup,
      evening: p.evening,
      people: [p],
    });
  }
  // Map preserves insertion order, so stops stay in boarding order.
  return [...byKey.values()];
}
