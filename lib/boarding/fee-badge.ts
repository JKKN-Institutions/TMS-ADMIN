import type { FeeTerm, LearnerFeeStatus } from './fee-status';

/**
 * fee-badge — turns a scanned learner's fee record into the one badge a
 * boarding staffer reads at the bus door: paid, or not. Pure, so every case
 * below is pinned by a test rather than by eye.
 *
 * BUILT FROM THE TERMS, NOT THE PORTAL VERDICT. The access function's
 * `allowed` / `reason` answers "may this learner use the portal", which is a
 * different question. It still reads "current" when a Term 2 bill has been
 * raised with a later due date, so a badge keyed on it would say PAID to a
 * learner who owes Term 2. The terms say what is actually settled.
 *
 * TWO THINGS IT MUST NEVER DO, because each is a wrong answer that looks right:
 *  - call an unbilled learner "Not paid" — they owe nothing yet;
 *  - call anything "Fees paid" that it has not positively established — a
 *    failed lookup, an unfamiliar result, or a verdict that disagrees with the
 *    terms all fail closed to "unavailable".
 *
 * The badge never decides whether attendance is marked. It is display only.
 */

/** paid = green, overdue = red, due = amber (unpaid, not yet due), none/unknown = grey. */
export type FeeTone = 'paid' | 'overdue' | 'due' | 'none' | 'unknown';

export interface FeeBadge {
  tone: FeeTone;
  label: string;
  /** Amount and terms, or null when there is nothing more to say. */
  detail: string | null;
}

const UNAVAILABLE: FeeBadge = { tone: 'unknown', label: 'Fee status unavailable', detail: null };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' to '15 Dec 2026' by string, so no timezone can shift the day. */
function formatDate(iso: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/**
 * The unpaid total, or null when any unpaid balance is unknown. Summing only
 * the known ones would print a smaller debt than is really owed.
 */
function unpaidAmount(unpaid: FeeTerm[]): string | null {
  if (unpaid.some((t) => t.balance === null || !Number.isFinite(t.balance))) return null;
  const total = unpaid.reduce((s, t) => s + (t.balance as number), 0);
  return total > 0 ? `₹${INR.format(total)}` : null;
}

function termName(t: FeeTerm): string {
  return `Term ${t.termNo ?? '—'}`;
}

export function feeBadge(fees: LearnerFeeStatus | null | undefined): FeeBadge | null {
  // Absent, as from a server that predates this field: say nothing rather
  // than claim the lookup failed.
  if (fees === undefined) return null;
  if (fees === null) return UNAVAILABLE;

  if (fees.terms.length === 0) {
    if (fees.reason === 'term1_not_billed' || fees.reason === 'no_bills') {
      return { tone: 'none', label: 'No fee bill yet', detail: null };
    }
    if (fees.reason === 'no_transport_obligation') {
      return { tone: 'none', label: 'No transport fee', detail: null };
    }
    return UNAVAILABLE;
  }

  const unpaid = fees.terms.filter((t) => !t.paid);

  if (unpaid.length === 0) {
    // Everything billed is settled, and the verdict must agree before this
    // may read as paid. A blocked learner with nothing unpaid is inconsistent.
    return fees.allowed ? { tone: 'paid', label: 'Fees paid', detail: null } : UNAVAILABLE;
  }

  const amount = unpaidAmount(unpaid);
  const overdue = unpaid.some((t) => t.overdue) || fees.reason === 'term1_unpaid';

  if (overdue) {
    const terms = unpaid.map((t) => `${termName(t)}${t.overdue ? ' overdue' : ''}`).join(', ');
    return { tone: 'overdue', label: 'Not paid', detail: [amount, terms].filter(Boolean).join(' · ') };
  }

  const terms = unpaid
    .map((t) => {
      const due = formatDate(t.dueDate);
      return due ? `${termName(t)} due ${due}` : termName(t);
    })
    .join(', ');
  return { tone: 'due', label: 'Not paid', detail: [amount, terms].filter(Boolean).join(' · ') };
}
