'use client';

// Colourful building blocks for the admin dashboard (2026-11 refresh).
//
// The same figures and links as KpiCard / JumpCard / AttentionStat in
// console.tsx, drawn in the colourful format the Attendance and Analytics pages
// use: a green banner, solid gradient tiles with white text, tinted attention
// tiles and coloured icon chips. Colour only tells the cards apart; a status is
// still carried by words and arrows, never by the tile colour alone.

import React from 'react';
import Link from 'next/link';
import { ChevronRight, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { num, panel } from '../_viz/kit';

export type Tone = 'green' | 'blue' | 'violet' | 'orange' | 'red' | 'teal';

// 600 -> 700/800 steps keep white text readable on every tone.
const TILE: Record<Tone, string> = {
  green: 'from-green-600 to-green-800 shadow-[0_14px_28px_-16px_rgba(22,163,74,0.85)]',
  blue: 'from-blue-600 to-indigo-700 shadow-[0_14px_28px_-16px_rgba(37,99,235,0.85)]',
  violet: 'from-violet-600 to-purple-700 shadow-[0_14px_28px_-16px_rgba(124,58,237,0.85)]',
  orange: 'from-orange-600 to-orange-700 shadow-[0_14px_28px_-16px_rgba(234,88,12,0.85)]',
  red: 'from-rose-600 to-red-700 shadow-[0_14px_28px_-16px_rgba(225,29,72,0.85)]',
  teal: 'from-teal-600 to-cyan-700 shadow-[0_14px_28px_-16px_rgba(13,148,136,0.85)]',
};

/** Solid icon chip, for cards that stay white. */
export const CHIP: Record<Tone, string> = {
  green: 'bg-green-600 text-white',
  blue: 'bg-blue-600 text-white',
  violet: 'bg-violet-600 text-white',
  orange: 'bg-orange-500 text-white',
  red: 'bg-rose-600 text-white',
  teal: 'bg-teal-600 text-white',
};

const TINT: Record<Tone, string> = {
  green: 'bg-green-50 ring-green-200 hover:bg-green-100/70',
  blue: 'bg-blue-50 ring-blue-200 hover:bg-blue-100/70',
  violet: 'bg-violet-50 ring-violet-200 hover:bg-violet-100/70',
  orange: 'bg-orange-50 ring-orange-200 hover:bg-orange-100/70',
  red: 'bg-rose-50 ring-rose-200 hover:bg-rose-100/70',
  teal: 'bg-teal-50 ring-teal-200 hover:bg-teal-100/70',
};

const TINT_TEXT: Record<Tone, string> = {
  green: 'text-green-800',
  blue: 'text-blue-800',
  violet: 'text-violet-800',
  orange: 'text-orange-800',
  red: 'text-rose-800',
  teal: 'text-teal-800',
};

// ── Banner ──────────────────────────────────────────────────────────────────

export function DashboardBanner({
  title, subtitle, date, children,
}: {
  title: string;
  subtitle: string;
  date: string;
  /** Buttons on the right (Refresh, Route analytics). */
  children?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-700 via-green-600 to-green-500 px-5 py-5 text-white shadow-[0_14px_32px_-18px_rgba(21,128,61,0.8)] sm:px-7">
      <span aria-hidden="true" className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
      <span aria-hidden="true" className="absolute -bottom-20 right-48 h-40 w-40 rounded-full bg-white/5" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/85">{date}</p>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-white/90">{subtitle}</p>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}

/** White button for use on the green banner. */
export const BANNER_BUTTON =
  'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-xl bg-[#fff] px-3.5 py-2 text-sm font-semibold text-green-700 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)] transition-colors duration-200 hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60';

/** Glass button for use on the green banner. */
export const BANNER_GHOST =
  'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors duration-200 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60';

// ── KPI tile ────────────────────────────────────────────────────────────────

/**
 * A KPI as a solid gradient tile that links into its module. `warn` puts the
 * sub-line in a white badge with amber text when it reports a problem
 * ("12 with an expired document"), so a warning still reads as one on colour.
 */
export function ColorKpi({
  tone, label, value, sub, warn, delta, deltaLabel = 'vs previous day', icon: Icon, href, title,
}: {
  tone: Tone;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  delta?: number | null;
  deltaLabel?: string;
  icon: LucideIcon;
  href?: string;
  title?: string;
}) {
  const showDelta = delta !== null && delta !== undefined && delta !== 0;
  const rising = (delta ?? 0) > 0;
  const Arrow = rising ? TrendingUp : TrendingDown;

  const body = (
    <>
      <span aria-hidden="true" className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <span aria-hidden="true" className="absolute -bottom-12 -left-6 h-24 w-24 rounded-full bg-white/5" />
      <span className="relative flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[0.7rem] font-semibold uppercase leading-tight tracking-wider text-white/90">{label}</span>
          <span className="mt-2 block truncate text-2xl font-bold leading-none tabular-nums sm:text-3xl" title={value}>
            {value}
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30 sm:h-10 sm:w-10">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
        </span>
      </span>
      <span className="relative mt-3 flex min-h-5 items-center gap-1.5 pr-4 text-xs font-medium text-white/95">
        {showDelta ? (
          <>
            <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {rising ? '+' : ''}
              {num(delta!)} {deltaLabel}
            </span>
          </>
        ) : warn ? (
          <span className="rounded-xl bg-[#fff] px-2 py-0.5 font-semibold leading-snug text-amber-700">{sub}</span>
        ) : (
          <span className="leading-snug">{sub ?? ''}</span>
        )}
      </span>
      {href && <ChevronRight aria-hidden className="absolute bottom-3 right-3 h-4 w-4 text-white/70" />}
    </>
  );

  const cls = `relative block min-h-[7.5rem] overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white ${TILE[tone]}`;
  if (!href) {
    return (
      <div className={cls} title={title}>
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      title={title}
      className={`${cls} transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 motion-reduce:hover:translate-y-0`}
    >
      {body}
      <span className="sr-only">View {label}</span>
    </Link>
  );
}

// ── Attention tile ──────────────────────────────────────────────────────────

/** A counted attention category as a tinted tile with a solid icon chip. */
export function ColorAttentionStat({
  tone, icon: Icon, label, value, caption, change, href,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  value: number;
  caption: string;
  change?: number | null;
  href: string;
}) {
  const show = change !== null && change !== undefined && change !== 0;
  const rising = (change ?? 0) > 0;
  const Arrow = rising ? TrendingUp : TrendingDown;
  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-1 items-start gap-3 rounded-xl p-4 ring-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${TINT[tone]}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${CHIP[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-xs font-semibold uppercase tracking-wide ${TINT_TEXT[tone]}`}>{label}</span>
        <span className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold leading-none tabular-nums text-gray-900">{num(value)}</span>
          {show && (
            // A rise in any of these categories is bad news: up is red, down is green.
            <span
              className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${rising ? 'text-red-700' : 'text-green-700'}`}
            >
              <Arrow className="h-3 w-3 shrink-0" aria-hidden />
              {Math.abs(change!)}%
            </span>
          )}
        </span>
        <span className="mt-1 block truncate text-xs text-gray-600">{caption}</span>
      </span>
    </Link>
  );
}

// ── Jump card ───────────────────────────────────────────────────────────────

/** A "Jump to" shortcut with a solid coloured icon chip. */
export function ColorJumpCard({
  tone, title, desc, icon: Icon, href,
}: {
  tone: Tone;
  title: string;
  desc: string;
  icon: LucideIcon;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`${panel} group flex items-center gap-3 p-4 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${CHIP[tone]} shadow-[0_6px_14px_-6px_rgba(15,23,42,0.45)]`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{desc}</span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

// ── Section header with colour ──────────────────────────────────────────────

/** Title row for a white section: coloured icon chip + title + subtitle. */
export function SectionTitle({
  tone, icon: Icon, title, subtitle, action,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${CHIP[tone]}`}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
