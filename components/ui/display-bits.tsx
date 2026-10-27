'use client';

import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ageInDays, daysUntil, expiryState, formatAge, formatDate, isActiveTicket, isOverdueTicket, isPlaceholderPhone,
  type ExpiryState,
} from '@/lib/format/display';

const EXPIRY_CLS: Record<ExpiryState, string> = {
  missing: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300',
  expired: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  soon: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  ok: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
};

/** A date with an expired / due-soon / valid badge. `missingLabel` shows when there is no date. */
export function ExpiryBadge({ date, missingLabel = 'Not on file' }: { date: string | null | undefined; missingLabel?: string }) {
  const state = expiryState(date);
  let text: string;
  if (state === 'missing' || !date) text = missingLabel;
  else if (state === 'expired') text = `Expired ${formatDate(date)}`;
  else if (state === 'soon') text = `${daysUntil(date)}d left · ${formatDate(date)}`;
  else text = formatDate(date);
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', EXPIRY_CLS[state])}>
      {text}
    </span>
  );
}

/** Tap-to-call phone number; flags known placeholder numbers instead of offering a call. */
export function PhoneLink({ phone }: { phone: string | null | undefined }) {
  if (!phone) return <span className="text-gray-400">—</span>;
  if (isPlaceholderPhone(phone)) {
    return (
      <span className="inline-flex items-center gap-1.5" title="Placeholder number — the real number is not on file">
        <span className="text-gray-400 line-through">{phone}</span>
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          Placeholder
        </span>
      </span>
    );
  }
  return (
    <a href={`tel:${phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-gray-700 hover:text-green-700 hover:underline dark:text-gray-300">
      <Phone className="h-3.5 w-3.5 text-gray-400" />
      {phone}
    </a>
  );
}

/** How long a ticket has been waiting, red with "Overdue" once past its window. */
export function AgeBadge({ status, priority, createdAt }: { status: string; priority?: string | null; createdAt: string }) {
  const days = ageInDays(createdAt);
  if (!isActiveTicket(status)) return <span className="text-sm text-gray-500">{formatAge(days)}</span>;
  if (isOverdueTicket({ status, priority, createdAt })) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-sm font-medium text-red-600 dark:text-red-400">{formatAge(days)}</span>
        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:bg-red-500/15 dark:text-red-400">
          Overdue
        </span>
      </span>
    );
  }
  return <span className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{formatAge(days)}</span>;
}
