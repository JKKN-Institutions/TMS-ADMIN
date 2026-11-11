'use client';

/**
 * The colourful building blocks shared by the three Attendance pages (Daily
 * Report, Learner Register, learner report): the green banner, the gradient
 * KPI tiles, the white control bar and the card that frames a table.
 */

import type { ComponentType, ReactNode } from 'react';

type Icon = ComponentType<{ className?: string }>;

// ── Banner ──────────────────────────────────────────────────────────────────

export function AttendanceBanner({
  title, description, chip,
}: {
  title: string;
  description?: ReactNode;
  /** The small glass panel on the right: what the page is currently showing. */
  chip?: { icon: Icon; label: string; value: string };
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-700 via-green-600 to-green-500 px-5 py-5 text-white shadow-[0_14px_32px_-18px_rgba(21,128,61,0.8)] sm:px-7">
      <span aria-hidden="true" className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
      <span aria-hidden="true" className="absolute -bottom-20 right-40 h-40 w-40 rounded-full bg-white/5" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-white/90">{description}</p>}
        </div>
        {chip && (
          <div className="flex items-center gap-3 rounded-xl bg-white/15 px-4 py-2.5 ring-1 ring-white/25">
            <chip.icon className="h-5 w-5" aria-hidden="true" />
            <div className="text-right">
              <p className="text-xs text-white/85">{chip.label}</p>
              <p className="text-sm font-semibold">{chip.value}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ── KPI tile ────────────────────────────────────────────────────────────────

// Solid gradients, 600→700/800 steps so white text stays readable on each.
const TILE_TONE = {
  blue: 'from-blue-600 to-indigo-700 shadow-[0_14px_28px_-16px_rgba(37,99,235,0.85)]',
  violet: 'from-violet-600 to-purple-700 shadow-[0_14px_28px_-16px_rgba(124,58,237,0.85)]',
  green: 'from-green-600 to-green-800 shadow-[0_14px_28px_-16px_rgba(22,163,74,0.85)]',
  red: 'from-rose-600 to-red-700 shadow-[0_14px_28px_-16px_rgba(225,29,72,0.85)]',
  orange: 'from-orange-600 to-orange-700 shadow-[0_14px_28px_-16px_rgba(234,88,12,0.85)]',
  teal: 'from-teal-600 to-cyan-700 shadow-[0_14px_28px_-16px_rgba(13,148,136,0.85)]',
} as const;

export type TileTone = keyof typeof TILE_TONE;

export function KpiTile({
  tone, icon: Icon, label, value, sub, title, active, onClick,
}: {
  tone: TileTone;
  icon: Icon;
  label: string;
  value: ReactNode;
  sub?: string;
  title?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span aria-hidden="true" className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <span aria-hidden="true" className="absolute -bottom-12 -left-6 h-24 w-24 rounded-full bg-white/5" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/90">{label}</p>
          <p className="mt-2 text-3xl font-bold leading-none tabular-nums sm:text-4xl">{value}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30 sm:h-12 sm:w-12">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
      </div>
      {sub && <p className="relative mt-3 truncate text-xs font-medium text-white/90">{sub}</p>}
    </>
  );
  const cls = `relative block w-full overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left text-white sm:p-5 ${TILE_TONE[tone]}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-pressed={active}
        className={`${cls} cursor-pointer transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
          active ? 'ring-4 ring-orange-300 ring-offset-2 dark:ring-offset-[#0f1115]' : ''
        }`}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}

// ── Control bar and cards ───────────────────────────────────────────────────

/** Square-ish button used inside the control bar (prev / next / Today). */
export const BAR_BUTTON =
  'inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';

const CARD =
  'rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_-18px_rgba(15,23,42,0.35)]';

/** The white strip under the tiles that holds the date / month controls. */
export function ControlBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      {children}
    </div>
  );
}

/**
 * Header-row tint and roomier rows for a DataTable inside a `.att-table`
 * card. Scoped by that class so the shared DataTable, and every other admin
 * list, keeps the standard format. Inject once per page with <style>.
 */
export const ATT_TABLE_CSS = `
.att-table thead th{background:#f0fdf4;color:#166534;font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;height:2.75rem}
.dark .att-table thead th{background:#12261a;color:#bbf7d0}
.att-table thead th button{font-size:inherit;font-weight:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit}
.att-table tbody td{padding-top:.7rem;padding-bottom:.7rem}
.att-table.att-centred th:nth-child(n+2),.att-table.att-centred td:nth-child(n+2){text-align:center}
.att-table.att-centred th:nth-child(n+2) button{margin-left:0}
`;

/** A titled card. With `table`, a DataTable inside it gets the tinted header. */
export function SectionPanel({
  title, note, table, centred, children,
}: {
  title: string;
  note?: ReactNode;
  table?: boolean;
  /** Centre every column after the first (figures tables). */
  centred?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`${CARD} space-y-4 p-4 sm:p-5 ${table ? 'att-table' : ''} ${centred ? 'att-centred' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}
