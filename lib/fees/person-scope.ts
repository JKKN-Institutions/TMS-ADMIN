// lib/fees/person-scope.ts
// Restrict a resolved fee cohort to an explicitly named subset.
//
// This is an INTERSECTION, never a lookup. The cohort passed in has already
// been through applicability + the bus in-charge exemption + stop-rate
// resolution; scoping may only remove people from it. Adding anyone here would
// bypass those gates and bill an exempt or unresolvable person.
//
// Ids that match nobody are returned rather than ignored: a mistyped id would
// otherwise silently shrink the run and under-bill without any signal.

export interface ScopeablePerson {
  person_id: string;
}

export interface PersonScopeResult<T> {
  kept: T[];
  /** Distinct non-blank ids actually requested. 0 means "no scoping applied". */
  requested: number;
  matched: number;
  unknownIds: string[];
}

export function intersectPersonIds<T extends ScopeablePerson>(
  people: T[],
  personIds: string[] | null | undefined
): PersonScopeResult<T> {
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const raw of personIds ?? []) {
    const v = String(raw ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    wanted.push(v);
  }

  // No usable ids = no scoping. Bill the whole resolved cohort.
  if (wanted.length === 0) {
    return { kept: people, requested: 0, matched: people.length, unknownIds: [] };
  }

  const present = new Set(people.map((p) => p.person_id));
  const kept = people.filter((p) => seen.has(p.person_id));
  const unknownIds = wanted.filter((id) => !present.has(id));

  return { kept, requested: wanted.length, matched: kept.length, unknownIds };
}
