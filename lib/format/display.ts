// Display-only helpers shared by admin list pages. They never change stored
// data — names stay as MyJKKN holds them; we only render them more readably.

/** "KATHIRVEL N" -> "Kathirvel N". Keeps short all-caps initials ("M N") as-is. */
export function titleCase(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .split(/(\s+|\.|-)/)
    .map((part) => (part.length > 1 ? part.charAt(0).toUpperCase() + part.slice(1) : part.toUpperCase()))
    .join('');
}

/** Numbers entered as stand-ins when the real one wasn't known. */
const PLACEHOLDER_PHONES = new Set(['9898989898', '9999999999', '0000000000', '1234567890']);

export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return PLACEHOLDER_PHONES.has(phone.replace(/\D/g, '').slice(-10));
}

export type ExpiryState = 'missing' | 'expired' | 'soon' | 'ok';

/** Days counted as "expiring soon" — matches the dashboard's 60-day window. */
export const EXPIRY_SOON_DAYS = 60;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Classify a YYYY-MM-DD expiry date against today. */
export function expiryState(date: string | null | undefined, soonDays = EXPIRY_SOON_DAYS): ExpiryState {
  if (!date) return 'missing';
  const t = new Date(`${date.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(t)) return 'missing';
  const today = startOfToday();
  if (t < today) return 'expired';
  if (t <= today + soonDays * 86_400_000) return 'soon';
  return 'ok';
}

/** Whole days from today to the date (negative when past). */
export function daysUntil(date: string): number {
  const t = new Date(`${date.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((t - startOfToday()) / 86_400_000);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Ticket age (grievances, bug reports) ────────────────────────────────────

/** Statuses that still need someone to act. */
export const ACTIVE_TICKET_STATUSES = ['open', 'in_progress'] as const;

export const isActiveTicket = (status: string | null | undefined) =>
  (ACTIVE_TICKET_STATUSES as readonly string[]).includes(status ?? '');

/** Whole days since the item was raised. */
export function ageInDays(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
}

/**
 * Overdue = still open/in progress past its response window: 3 days for
 * high/critical priority, 7 days for everything else (agreed 2026-10-26).
 */
export function isOverdueTicket(t: { status: string; priority?: string | null; createdAt: string }): boolean {
  if (!isActiveTicket(t.status)) return false;
  const limit = t.priority === 'high' || t.priority === 'critical' ? 3 : 7;
  return ageInDays(t.createdAt) > limit;
}

/** "Today", "1 day", "12 days". */
export function formatAge(days: number): string {
  return days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
}
