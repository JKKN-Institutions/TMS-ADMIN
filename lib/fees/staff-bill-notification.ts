// lib/fees/staff-bill-notification.ts
// The in-app notice a staff member receives when their transport bill is
// generated. Pure so the wording — which goes to real people about real money
// — is unit-tested rather than proof-read.

export interface StaffBillNotificationInput {
  amount: number;
  /** ISO 'YYYY-MM-DD'. */
  dueDate: string;
  stopName: string | null;
  /** Transport year display name, e.g. '2026-2027'. */
  yearName: string;
}

/** Rupees in the Indian grouping convention, no paise when the amount is whole. */
export function formatInr(amount: number): string {
  const n = Number(amount);
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-08-31' -> '31 August 2026'. Parsed by parts to stay timezone-proof. */
function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function buildStaffBillNotification(input: StaffBillNotificationInput): {
  title: string;
  body: string;
  category: string;
  url: string;
} {
  const amount = formatInr(input.amount);
  const due = formatDueDate(input.dueDate);
  const stopClause = input.stopName ? ` It is based on your boarding stop, ${input.stopName}.` : '';

  return {
    title: `Transport fee ${input.yearName} — bill generated`,
    body:
      `Your transport fee for ${input.yearName} is ${amount}, due ${due}.` +
      `${stopClause} Open Transport Fees to see the full details, and contact the transport office to pay.`,
    category: 'transport',
    url: '/boarding/fees',
  };
}
