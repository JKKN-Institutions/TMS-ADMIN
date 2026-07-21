// lib/fees/incharge-exemption.ts
// A bus in-charge holds a transport fee exemption in exchange for the duty.
// This removes them from a staff fee cohort.
//
// Kept pure and separate because the matching is the fragile part:
// tms_staff_route_assignment keys on staff_email (free-form text) while bills
// key on staff.id. A case-sensitive compare exempts NOBODY and bills every
// in-charge — so normalisation is the whole job, and it is unit-tested.

export interface ExemptablePerson {
  person_id: string;
  email: string | null;
}

/** Lowercased + trimmed, or null when there is nothing usable to match on. */
function normalizeEmail(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim().toLowerCase();
  return v.length ? v : null;
}

/**
 * Drop anyone whose email appears in `inChargeEmails`.
 *
 * A person with no usable email is KEPT (they are billable — we must not drop
 * someone from billing just because their record is incomplete). A blank entry
 * in `inChargeEmails` matches nobody.
 */
export function filterOutInCharges<T extends ExemptablePerson>(
  people: T[],
  inChargeEmails: Iterable<string>
): { kept: T[]; exemptCount: number } {
  const exempt = new Set<string>();
  for (const raw of inChargeEmails) {
    const n = normalizeEmail(raw);
    if (n) exempt.add(n);
  }

  const kept: T[] = [];
  let exemptCount = 0;
  for (const person of people) {
    const n = normalizeEmail(person.email);
    if (n && exempt.has(n)) {
      exemptCount++;
      continue;
    }
    kept.push(person);
  }
  return { kept, exemptCount };
}
