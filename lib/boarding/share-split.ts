/**
 * Pure allocation of a route's students to its in-charges.
 *
 * Every in-charge must be answerable for a share of the bus, so the route's
 * students are cut into contiguous, count-balanced bands — one per in-charge.
 *
 * The load-bearing choice is that the cut is made over the ORDERED STUDENT
 * LIST, not over the stop list. Measured on route 29 (2026-08-21): fourteen
 * in-charges share only FOUR distinct boarding stops, so handing each person
 * "the students at your own stop" would leave ten of them owning nothing. It
 * also breaks on any route with fewer stops than in-charges. Cutting students
 * keeps the bands contiguous in stop order — you mark the people boarding
 * around you — while guaranteeing the counts stay within one of each other.
 *
 * A band boundary may fall inside a single busy stop. That is accepted: an
 * even share matters more than a whole stop.
 *
 * No I/O — lib/boarding/allocation-repo.ts gathers the facts, this decides.
 */

export interface ShareStudent {
  learner_id: string;
  /** tms_route_stop.sequence_order for the student's stop; null when unset. */
  stop_sequence: number | null;
  roll: string | null;
}

export interface ShareInCharge {
  assignment_id: string;
  staff_email: string;
  /** sequence_order of the in-charge's OWN boarding stop on this route. */
  stop_sequence: number | null;
}

export interface SharePin {
  learner_id: string;
  assignment_id: string;
}

export interface Share {
  assignment_id: string;
  learner_ids: string[];
}

/**
 * Sorts last. Used for both a student with no stop and an in-charge whose own
 * stop is not on this route (2 of 109 measured).
 */
const NO_STOP = Number.MAX_SAFE_INTEGER;

const byRoll = (a: ShareStudent, b: ShareStudent) =>
  (a.roll ?? a.learner_id).localeCompare(b.roll ?? b.learner_id, undefined, { numeric: true });

export function splitRouteShare(input: {
  students: ShareStudent[];
  inCharges: ShareInCharge[];
  pinned?: SharePin[];
}): Share[] {
  // Order the in-charges by their own boarding stop, tie-broken by email.
  //
  // The tie-break is not cosmetic. Fourteen in-charges on four stops means
  // most comparisons ARE ties, and an unstable order would reshuffle every
  // student's owner on each recompute — the one thing a stable share exists
  // to prevent.
  const ordered = [...input.inCharges].sort((a, b) => {
    const sa = a.stop_sequence ?? NO_STOP;
    const sb = b.stop_sequence ?? NO_STOP;
    if (sa !== sb) return sa - sb;
    return a.staff_email.localeCompare(b.staff_email);
  });
  // No in-charge means nobody owns anyone. Three routes are in this state and
  // the coverage board, not this function, is where that becomes visible.
  if (ordered.length === 0) return [];

  const shares = new Map<string, string[]>();
  for (const ic of ordered) shares.set(ic.assignment_id, []);

  // Manual pins win over the balanced split and survive every recompute. A pin
  // naming an in-charge who has since left the route is silently dropped, and
  // the learner rejoins the pool rather than vanishing.
  const pinnedTo = new Map<string, string>();
  for (const p of input.pinned ?? []) {
    if (shares.has(p.assignment_id)) pinnedTo.set(p.learner_id, p.assignment_id);
  }

  const pool: ShareStudent[] = [];
  const stopless: ShareStudent[] = [];
  for (const s of input.students) {
    const pin = pinnedTo.get(s.learner_id);
    if (pin) {
      shares.get(pin)!.push(s.learner_id);
    } else if (s.stop_sequence === null) {
      stopless.push(s);
    } else {
      pool.push(s);
    }
  }

  pool.sort((a, b) => {
    const d = (a.stop_sequence ?? NO_STOP) - (b.stop_sequence ?? NO_STOP);
    return d !== 0 ? d : byRoll(a, b);
  });

  // Contiguous chunks: base size each, remainder spread one at a time across
  // the earliest bands so no two shares differ by more than one student.
  const n = ordered.length;
  const base = Math.floor(pool.length / n);
  const extra = pool.length % n;
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    const size = base + (i < extra ? 1 : 0);
    for (const s of pool.slice(cursor, cursor + size)) {
      shares.get(ordered[i].assignment_id)!.push(s.learner_id);
    }
    cursor += size;
  }

  // Students with no stop cannot sit in any band, so they go to whoever is
  // carrying least — 9 learners system-wide, but the rule must be defined.
  for (const s of [...stopless].sort(byRoll)) {
    let best = ordered[0].assignment_id;
    for (const ic of ordered) {
      if (shares.get(ic.assignment_id)!.length < shares.get(best)!.length) best = ic.assignment_id;
    }
    shares.get(best)!.push(s.learner_id);
  }

  return ordered.map((ic) => ({ assignment_id: ic.assignment_id, learner_ids: shares.get(ic.assignment_id)! }));
}
