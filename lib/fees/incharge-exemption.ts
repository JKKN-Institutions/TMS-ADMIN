// lib/fees/incharge-exemption.ts
// A bus in-charge holds a transport fee exemption in exchange for the duty.
// This removes them from a staff fee cohort.
//
// Kept pure and separate because the matching is the fragile part:
// tms_staff_route_assignment keys on staff_email (free-form text) while bills
// key on staff.id. A case-sensitive compare exempts NOBODY and bills every
// in-charge — so normalisation is the whole job, and it is unit-tested.
//
// A person can be KNOWN BY MORE THAN ONE ADDRESS: `staff.email` and
// `profiles.email` frequently diverge (personal vs institutional), and the
// self-assign path that turns someone into an in-charge writes
// tms_staff_route_assignment.staff_email from `profiles.email`, not
// `staff.email`. Matching only one column silently bills volunteers who used
// the other. So every address a person is known by is carried in `emails`,
// and a match on ANY of them exempts the person.

export interface ExemptablePerson {
  person_id: string;
  emails: Array<string | null>;
}

/** Lowercased + trimmed, or null when there is nothing usable to match on. */
function normalizeEmail(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim().toLowerCase();
  return v.length ? v : null;
}

/**
 * Drop anyone any of whose known emails appears in `inChargeEmails`.
 *
 * A person with no usable email is KEPT (they are billable — we must not drop
 * someone from billing just because their record is incomplete). A blank entry
 * in `inChargeEmails` matches nobody.
 *
 * `unmatchedInCharge` is the count of distinct normalised in-charge emails
 * that did not match any person in `people` — i.e. active in-charge
 * assignments that could not be exempted at all. It is the denominator that
 * lets a caller tell "3 of 3 in-charges exempted" apart from "3 of 5 exempted,
 * 2 silently billed" — `exemptCount` alone cannot distinguish those.
 */
export function filterOutInCharges<T extends ExemptablePerson>(
  people: T[],
  inChargeEmails: Iterable<string>
): { kept: T[]; exemptCount: number; unmatchedInCharge: number } {
  const exempt = new Set<string>();
  for (const raw of inChargeEmails) {
    const n = normalizeEmail(raw);
    if (n) exempt.add(n);
  }

  const matchedInCharge = new Set<string>();
  const kept: T[] = [];
  let exemptCount = 0;
  for (const person of people) {
    let matchedEmail: string | null = null;
    for (const raw of person.emails) {
      const n = normalizeEmail(raw);
      if (n && exempt.has(n)) {
        matchedEmail = n;
        break;
      }
    }
    if (matchedEmail) {
      exemptCount++;
      matchedInCharge.add(matchedEmail);
      continue;
    }
    kept.push(person);
  }

  let unmatchedInCharge = 0;
  for (const n of exempt) {
    if (!matchedInCharge.has(n)) unmatchedInCharge++;
  }

  return { kept, exemptCount, unmatchedInCharge };
}
