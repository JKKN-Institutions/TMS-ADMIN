/**
 * The message a bus in-charge receives when the attendance ladder removes their
 * role and raises a transport fee bill.
 *
 * Pure and separately tested because this is the ONLY explanation the staffer
 * ever gets. Removal locks them out of the boarding portal — `deriveBoardingAccess`
 * returns 'choose' once their assignment count hits zero, and the layout
 * redirects every /boarding path to the willingness toggle, a screen with no
 * notification bell. None of them have a push subscription and this app has no
 * email sender, so the text below is delivered as a banner on that one reachable
 * page. There is no follow-up channel to correct a confusing message.
 *
 * Two things it must get right, both learned from the data rather than assumed:
 *  - Attendance is scored PER ROUTE. On a route with several in-charges, each
 *    one is removed because *nobody* marked it, not because they personally
 *    failed. Saying so is the difference between a fair notice and an accusation.
 *  - These three days were replayed retroactively, so no warning went out first,
 *    even though the published rule is two warnings then removal. The message
 *    says so plainly instead of letting people conclude they missed messages.
 */

export interface RemovalBillNotice {
  routeNumber: string;
  routeName: string;
  /** Active in-charges on the route at removal time; 1 means they were alone. */
  inchargeCount: number;
  /** 'YYYY-MM-DD', ascending. */
  missedDates: string[];
  amount: number;
  /** 'YYYY-MM-DD'. */
  dueDate: string;
  stopName: string | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Parses the 'YYYY-MM-DD' parts by hand rather than via Date(). These are IST
 * calendar dates; letting the host timezone reinterpret them can shift a date
 * by one day, and the date IS the justification for the bill.
 */
function parts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function formatDate(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${p.d} ${MONTHS[p.m - 1] ?? ''} ${p.y}`.trim();
}

/** Joins with ', ' and a final ' and ' — "a, b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * "11, 12 and 13 August 2026" when the dates share a month, otherwise each one
 * in full. Repeating "August 2026" three times reads as boilerplate and makes
 * the reader skim exactly the detail they most need to check.
 */
function formatDateList(dates: string[]): string {
  const parsed = dates.map(parts);
  if (parsed.length > 1 && parsed.every((p) => p !== null)) {
    const first = parsed[0]!;
    const sameMonth = parsed.every((p) => p!.m === first.m && p!.y === first.y);
    if (sameMonth) {
      return `${joinList(parsed.map((p) => String(p!.d)))} ${MONTHS[first.m - 1]} ${first.y}`;
    }
  }
  return joinList(dates.map(formatDate));
}

/**
 * Indian digit grouping (1,00,000 — not 100,000), and paise only when they are
 * really there, so a whole-rupee bill does not read as "₹19,800.00".
 */
function formatAmount(amount: number): string {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

/** ALL-CAPS stop names read as shouting inside a sentence. */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function buildRemovalBillCopy(n: RemovalBillNotice): { title: string; body: string } {
  const route = `Route ${n.routeNumber}`;
  const amount = `₹${formatAmount(n.amount)}`;
  const dates = formatDateList(n.missedDates);
  const dayCount = n.missedDates.length;

  // Sole in-charge: there are no colleagues to share the omission with, so the
  // route-level explanation would read as a deflection.
  const routeRule =
    n.inchargeCount > 1
      ? `Attendance counts per route, not per person: the route is covered if any one of its in-charges marks it. ${route} has ${n.inchargeCount} in-charges, and none of them marked it on those days, so the role ends for every in-charge on the route.`
      : `You are the only in-charge assigned to ${route}, so no one marked it on those days.`;

  const stopClause = n.stopName ? ` — ${titleCase(n.stopName)} —` : '';

  const body = [
    `Your bus in-charge role on ${route} (${n.routeName}) has been removed, and a transport fee of ${amount} has been billed to you, due ${formatDate(n.dueDate)}.`,
    ``,
    `Why this happened`,
    `Attendance was not marked for ${route} on ${dates} — ${dayCount} consecutive travel days on which the route carried booked passengers.`,
    ``,
    routeRule,
    ``,
    `These ${dayCount} days were reviewed together after the fact, so no warning was sent to you beforehand.`,
    ``,
    `Why that means a fee`,
    `Bus in-charges travel free in exchange for marking their route each travel day. Without the role, that exemption no longer applies, so the standard fee for your boarding stop${stopClause} has been billed.`,
    ``,
    `If this looks wrong`,
    `Contact the transport office. If attendance was marked, or your boarding stop or route is recorded incorrectly, the bill can be cancelled and the role restored.`,
  ].join('\n');

  return {
    title: `Transport fee ${amount} billed — bus in-charge role removed`,
    body,
  };
}
