'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnFiltersState } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one summary-card style for admin list pages: a single compact row of
 * small cards above the table. A card either filters the table it sits over
 * (pass the props from useCardFilters().card) or links somewhere (href).
 *
 * Cards should name problems an admin can act on ("License missing"), not
 * repeat the table's row count three ways.
 */

export type SummaryTone = 'neutral' | 'good' | 'warn' | 'danger' | 'info';

const VALUE_TONE: Record<SummaryTone, string> = {
  neutral: 'text-gray-900 dark:text-gray-100',
  good: 'text-green-700 dark:text-green-400',
  warn: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  info: 'text-sky-700 dark:text-sky-400',
};

export interface SummaryCardProps {
  label: string;
  value: React.ReactNode;
  /** Short secondary line, e.g. "of 31 drivers". */
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: SummaryTone;
  /** Highlighted because its filter is applied. */
  active?: boolean;
  onClick?: () => void;
  href?: string;
  /** Tooltip text explaining what the number counts. */
  title?: string;
}

export function SummaryCards({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]', className)}>
      {children}
    </div>
  );
}

export function SummaryCard({ label, value, hint, icon: Icon, tone = 'neutral', active, onClick, href, title }: SummaryCardProps) {
  const interactive = !!onClick || !!href;
  const cls = cn(
    'flex min-w-0 flex-col rounded-xl border bg-white px-3 py-2 text-left transition-colors',
    active
      ? 'border-green-600 ring-1 ring-green-600 bg-green-50 dark:bg-green-500/10'
      : 'border-gray-200',
    interactive && !active && 'hover:border-gray-300 hover:bg-gray-50',
    interactive && 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600',
  );
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('mt-0.5 text-xl font-semibold tabular-nums leading-tight', VALUE_TONE[tone])}>{value}</span>
      {hint && <span className="truncate text-xs text-gray-500">{hint}</span>}
    </>
  );
  if (href) return <Link href={href} className={cls} title={title}>{body}</Link>;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} title={title} aria-pressed={active}>
        {body}
      </button>
    );
  }
  return <div className={cls} title={title}>{body}</div>;
}

/**
 * Column-filter state shared by a page's summary cards and its DataTable.
 * Clicking a card applies `columnId = value`; clicking it again clears it.
 *
 *   const cf = useCardFilters();
 *   <SummaryCard label="Unassigned" value={n} {...cf.card('assignment', 'unassigned')} />
 *   <DataTable columnFilters={cf.filters} onColumnFiltersChange={cf.setFilters} ... />
 */
export function useCardFilters(initial: ColumnFiltersState = []) {
  const [filters, setFilters] = React.useState<ColumnFiltersState>(initial);
  const isOn = (columnId: string, value: string) =>
    filters.some((f) => f.id === columnId && String(f.value) === value);
  const toggle = (columnId: string, value: string) =>
    setFilters((prev) => {
      const without = prev.filter((f) => f.id !== columnId);
      return isOn(columnId, value) ? without : [...without, { id: columnId, value }];
    });
  /** Clear every filter (for an "All" card). */
  const clear = () => setFilters([]);
  const card = (columnId: string, value: string) => ({
    active: isOn(columnId, value),
    onClick: () => toggle(columnId, value),
  });
  const allCard = () => ({ active: filters.length === 0, onClick: clear });
  return { filters, setFilters, isOn, toggle, clear, card, allCard };
}
