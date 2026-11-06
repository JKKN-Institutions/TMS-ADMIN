'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one summary-card style for admin list pages, in the MyJKKN KPI format
 * (its maintenance stats cards): title top-left, a tinted icon chip top-right,
 * a large bold value, a small hint line, and a 2px border in the card's colour.
 * A card either filters the table it sits over (pass the props from
 * useCardFilters().card) or links somewhere (href).
 *
 * Cards should name problems an admin can act on ("License missing"), not
 * repeat the table's row count three ways.
 */

export type SummaryTone = 'neutral' | 'good' | 'warn' | 'danger' | 'info';

// MyJKKN colours each card: Total blue, Completed green, Pending yellow,
// Overdue red, other metrics purple. Coloured utilities are not remapped by
// globals.css in dark mode, hence the explicit dark: pairs.
const TONE: Record<SummaryTone, { border: string; chip: string; icon: string; fallback: LucideIcon }> = {
  neutral: {
    border: 'border-blue-200 dark:border-blue-500/30',
    chip: 'bg-blue-50 dark:bg-blue-500/15',
    icon: 'text-blue-600 dark:text-blue-400',
    fallback: BarChart3,
  },
  good: {
    border: 'border-green-200 dark:border-green-500/30',
    chip: 'bg-green-50 dark:bg-green-500/15',
    icon: 'text-green-600 dark:text-green-400',
    fallback: CheckCircle2,
  },
  warn: {
    border: 'border-yellow-200 dark:border-yellow-500/30',
    chip: 'bg-yellow-50 dark:bg-yellow-500/15',
    icon: 'text-yellow-600 dark:text-yellow-400',
    fallback: Clock,
  },
  danger: {
    border: 'border-red-200 dark:border-red-500/30',
    chip: 'bg-red-50 dark:bg-red-500/15',
    icon: 'text-red-600 dark:text-red-400',
    fallback: AlertTriangle,
  },
  info: {
    border: 'border-purple-200 dark:border-purple-500/30',
    chip: 'bg-purple-50 dark:bg-purple-500/15',
    icon: 'text-purple-600 dark:text-purple-400',
    fallback: Info,
  },
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
    // MyJKKN KPI grid: gap-4, 2 across until lg, then one row that fits 3-6 cards.
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]', className)}>
      {children}
    </div>
  );
}

export function SummaryCard({ label, value, hint, icon, tone = 'neutral', active, onClick, href, title }: SummaryCardProps) {
  const interactive = !!onClick || !!href;
  const t = TONE[tone];
  // Most pages pass no icon; the tone's own icon keeps every card's chip filled.
  const Icon = icon ?? t.fallback;
  const cls = cn(
    'flex min-w-0 flex-col rounded-xl border-2 bg-white text-left shadow-sm transition-all',
    t.border,
    active && 'ring-2 ring-green-600 ring-offset-2 dark:ring-offset-[#0f1115]',
    interactive && 'cursor-pointer hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600',
  );
  const body = (
    <>
      {/* CardHeader: flex-row, items-center, justify-between, pb-2 */}
      <span className="flex items-center justify-between gap-2 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <span className="truncate text-sm font-medium text-gray-700">{label}</span>
        <span className={cn('shrink-0 rounded-lg p-2', t.chip)}>
          <Icon className={cn('h-4 w-4', t.icon)} aria-hidden />
        </span>
      </span>
      {/* CardContent: big bold value, then the muted hint line */}
      <span className="px-4 pb-4 sm:px-5 sm:pb-5">
        <span className="block text-2xl font-bold tabular-nums leading-tight text-gray-900 sm:text-3xl">{value}</span>
        {hint && <span className="mt-2 block truncate text-xs text-gray-500">{hint}</span>}
      </span>
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
