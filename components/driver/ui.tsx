import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared driver-portal UI primitives, mirroring the student portal's design language
 * (gradient icon tiles, soft-bordered cards, uppercase micro-labels). Kept in one
 * place so every driver page renders the same visual system.
 */

/** Gradient icon-tile tones. */
export const TILE = {
  blue: 'bg-gradient-to-br from-blue-500 to-indigo-600',
  green: 'bg-gradient-to-br from-green-500 to-emerald-600',
  orange: 'bg-gradient-to-br from-orange-500 to-amber-600',
  purple: 'bg-gradient-to-br from-purple-500 to-violet-600',
  rose: 'bg-gradient-to-br from-rose-500 to-pink-600',
  slate: 'bg-gradient-to-br from-slate-500 to-slate-700',
} as const;
export type Tone = keyof typeof TILE;

type IconType = ComponentType<{ className?: string }>;

/** Page title + optional subtitle. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}

/** Centered loading spinner. */
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
    </div>
  );
}

/** Large dashboard metric card: label + bold value, gradient icon tile on the right. */
export function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'blue',
}: {
  icon: IconType;
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 truncate text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-lg', TILE[tone])}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

/** Compact metric for a stat strip (gradient tile + uppercase label + value). */
export function Stat({
  icon: Icon,
  label,
  value,
  tone = 'blue',
}: {
  icon: IconType;
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="bg-white p-4 dark:bg-gray-900 sm:p-5">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm', TILE[tone])}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {label}
          </p>
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

/** Row card: round gradient icon + label + value (+ optional sub line). */
export function DetailTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'blue',
}: {
  icon: IconType;
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-lg', TILE[tone])}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {label}
        </p>
        <p className="truncate text-base font-semibold text-gray-900 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

/** Titled card section with an accent icon + optional count + optional right action. */
export function Section({
  icon: Icon,
  title,
  count,
  action,
  children,
}: {
  icon?: IconType;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-green-600 dark:text-green-400" />}
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {count != null && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

/** Small uppercase pill. */
export function Tag({ children, tone = 'gray' }: { children: ReactNode; tone?: 'green' | 'indigo' | 'gray' | 'amber' | 'solid' }) {
  const tones: Record<string, string> = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    solid: 'bg-green-600 text-white',
  };
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}

/** Full-card empty / error state with a colored icon tile. */
export function NoticeCard({
  tone = 'amber',
  icon: Icon,
  title,
  body,
}: {
  tone?: 'amber' | 'red' | 'gray';
  icon: IconType;
  title: string;
  body: string;
}) {
  const tones: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    gray: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{body}</p>
    </div>
  );
}
