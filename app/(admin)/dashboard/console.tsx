'use client';

// Operations-console components for the dashboard.
//
// The visual model comes from fleet/traffic control dashboards: a dense KPI
// strip, a turnout ring with the day's boarding burst underneath it, and a
// warning panel where every row carries a severity, the thing affected, and
// the recommended next step.
//
// Everything is drawn with the viz elevation tokens rather than hardcoded
// colours, so the same components render correctly in light and dark.

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, HelpCircle, Info,
  RotateCw, ShieldAlert, TrendingDown, TrendingUp, type LucideIcon,
} from 'lucide-react';
import { num, panel } from '../_viz/kit';
import type { AlertSeverity, DashboardAlert, DashboardHourBucket } from '@/lib/dashboard/types';

// ── Card shell ───────────────────────────────────────────────────────────────

/**
 * The shell every clickable card on the dashboard is built from: the panel
 * surface, the tinted icon badge, the hover wash and the affordances that make
 * it read as a link.
 *
 * KPI figures and the "Jump to" shortcuts share it so the two bands read as one
 * system rather than two components that happen to sit on the same page.
 *
 * `href` is optional throughout. A card with no destination — because the
 * viewer lacks that module's permission — renders as a plain panel: no
 * chevron, no wash, no pointer. Nothing offers a jump that would land on
 * /unauthorized.
 */
function CardShell({
  icon: Icon, href, srLabel, className = '', children,
}: {
  icon: LucideIcon;
  href?: string;
  /** Names the destination for screen readers, e.g. "Learners". */
  srLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const body = (
    <>
      {/* Hover/focus wash, as an overlay rather than a `hover:bg-*` utility:
          the card already paints its background from a viz token, and layering
          avoids fighting that in the cascade. Opacity animates on the
          compositor, and nothing moves — a scale transform here would nudge
          the neighbouring cards. */}
      {href && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ background: 'var(--viz-inset)' }}
        />
      )}

      <span className="relative block">
        <span className="flex items-start justify-between gap-2">
          <span
            className="inline-flex rounded-lg p-1.5"
            style={{ background: 'color-mix(in oklab, var(--viz-accent) 12%, transparent)' }}
          >
            <Icon className="h-4 w-4" style={{ color: 'var(--viz-accent)' }} aria-hidden />
          </span>
          {/* Never hover-only: the chevron is visible at rest so a touch user,
              who has no hover state at all, can tell the card is a link. */}
          {href && (
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground opacity-40 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden
            />
          )}
        </span>
        {children}
      </span>
    </>
  );

  const shell = `${panel} group relative block p-4 ${className}`;

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      className={`${shell} cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {body}
      <span className="sr-only">View {srLabel}</span>
    </Link>
  );
}

// ── KPI cards ────────────────────────────────────────────────────────────────

/**
 * One KPI card: a figure that is also a doorway into the module it counts.
 * The Learners figure opens Passengers > Learners, Buses opens the fleet.
 *
 * `delta` is a measured change against the previous day WITH data, or null
 * when there was no comparable day — in which case no arrow is drawn. The
 * dashboard used to fill this from Math.random(); the whole point of the
 * rebuild is that an absent arrow is honest and an invented one is not.
 *
 * `goodDirection` exists because "up" is not universally good: more absences
 * is a worse day, so its arrow must be red when it rises.
 *
 * `subTone` colours the sub-line when it reports a PROBLEM rather than a fact
 * ("9 with an expired document"), so a warning buried in small grey type reads
 * as a warning. It is the same amber the Needs attention board uses.
 */
export function KpiCard({
  label, value, sub, subTone, delta, goodDirection = 'up', tone, icon, href,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: string;
  delta?: number | null;
  goodDirection?: 'up' | 'down';
  tone?: string;
  icon: LucideIcon;
  href?: string;
}) {
  const show = delta !== null && delta !== undefined && delta !== 0;
  const rising = (delta ?? 0) > 0;
  const isGood = goodDirection === 'up' ? rising : !rising;
  const Arrow = rising ? TrendingUp : TrendingDown;

  return (
    <CardShell icon={icon} href={href} srLabel={label} className="min-h-[7rem]">
      <span className="mt-3 block truncate text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className="mt-1 block truncate text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground"
        style={tone ? { color: tone } : undefined}
        title={value}
      >
        {value}
      </span>

      <span className="mt-2 flex h-4 items-center gap-1.5 text-xs">
        {show ? (
          <>
            {/* Icon carries direction as well as colour, so it survives
                greyscale printing and colour-blindness. */}
            <Arrow
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: isGood ? 'var(--viz-good)' : 'var(--viz-serious)' }}
              aria-hidden
            />
            <span className="truncate text-muted-foreground">
              {rising ? '+' : ''}
              {num(delta!)} vs previous day
            </span>
          </>
        ) : (
          <span
            className={`truncate ${subTone ? '' : 'text-muted-foreground'}`}
            style={subTone ? { color: subTone } : undefined}
          >
            {sub ?? ''}
          </span>
        )}
      </span>
    </CardShell>
  );
}

/**
 * The KPI band.
 *
 * Six separate cards rather than one panel of divided cells: now that every
 * figure is a link, edge-to-edge cells would put six tap targets flush against
 * each other with no gap to miss into. The 2/3/6 column steps also divide six
 * cards evenly at every breakpoint, so no card is ever left orphaned on its
 * own row.
 */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
      {children}
    </section>
  );
}

// ── Jump cards ───────────────────────────────────────────────────────────────

/**
 * One "Jump to" shortcut — Route analytics, Live tracking, Fees and the rest.
 *
 * Same shell as a KPI card, minus the figure: these were flat rows inside a
 * single panel, which made the busiest destinations on the page look like a
 * list of settings. As cards they carry the same badge, chevron and hover wash
 * as the band above, so the whole page has one idea of what "this is a link
 * into a module" looks like.
 */
export function JumpCard({
  title, desc, icon, href,
}: {
  title: string;
  desc: string;
  icon: LucideIcon;
  href: string;
}) {
  return (
    <CardShell icon={icon} href={href} srLabel={title}>
      <span className="mt-3 block truncate text-sm font-medium text-foreground">{title}</span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{desc}</span>
    </CardShell>
  );
}

/** The shortcut band. Four columns divide the eight actions evenly. */
export function JumpGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
      {children}
    </div>
  );
}

// ── Turnout ring ─────────────────────────────────────────────────────────────

/**
 * Donut showing boarded as a share of booked, with the figure in the middle.
 *
 * Drawn as an SVG arc rather than pulled from a chart library: it is one value,
 * and Recharts' PieChart would ship a whole cartesian engine to render a circle.
 *
 * The ring is capped at 100% for the *stroke* while the printed number is not —
 * walk-up riders make genuine turnouts above 100% possible, and clamping the
 * number would hide a real fact.
 */
export function TurnoutRing({
  percent, boarded, booked,
}: {
  percent: number | null;
  boarded: number;
  booked: number;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const filled = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  const offset = circumference * (1 - filled / 100);

  const colour =
    percent === null ? 'var(--viz-neutral)'
      : percent >= 85 ? 'var(--viz-good)'
      : percent >= 60 ? 'var(--viz-warning)'
      : 'var(--viz-serious)';

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="132" height="132" viewBox="0 0 132 132" role="img"
          aria-label={percent === null ? 'Turnout not measurable' : `Turnout ${percent} percent`}>
          <circle
            cx="66" cy="66" r={radius} fill="none" strokeWidth="12"
            stroke="color-mix(in oklab, var(--viz-neutral) 22%, transparent)"
          />
          <circle
            cx="66" cy="66" r={radius} fill="none" strokeWidth="12" strokeLinecap="round"
            stroke={colour}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 66 66)"
            className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {percent === null ? '—' : `${percent}%`}
          </span>
          <span className="text-[0.7rem] text-muted-foreground">turnout</span>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <Figure label="Boarded" value={boarded} colour={colour} />
        <Figure label="Booked" value={booked} colour="var(--viz-context)" />
      </div>
    </div>
  );
}

function Figure({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colour }} aria-hidden />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{num(value)}</span>
    </div>
  );
}

// ── Boarding-burst bars ──────────────────────────────────────────────────────

/**
 * Scans per hour for today.
 *
 * Only hours that contain scans are plotted. Boarding here is a two-hour
 * morning event, so a padded 06:00–21:00 axis would be ~90% empty and imply
 * the buses run all day.
 */
export function HourBars({ hours }: { hours: DashboardHourBucket[] }) {
  if (hours.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No boarding scans recorded yet today.</p>
    );
  }

  const peak = Math.max(...hours.map((h) => h.marks), 1);

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Scans by hour</p>
      <div className="flex items-end gap-2" style={{ height: 64 }}>
        {hours.map((h) => {
          const presentShare = h.marks > 0 ? (h.present / h.marks) * 100 : 0;
          return (
            <div key={h.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div
                className="flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-md transition-[height] duration-500 motion-reduce:transition-none"
                style={{
                  height: `${Math.max((h.marks / peak) * 100, 6)}%`,
                  background: 'color-mix(in oklab, var(--viz-context) 45%, transparent)',
                }}
                title={`${h.marks} scans, ${h.present} boarded`}
              >
                {/* The filled portion is the share who actually boarded, so the
                    bar shows volume and outcome in one mark. */}
                <div
                  style={{ height: `${presentShare}%`, background: 'var(--viz-accent)' }}
                />
              </div>
              <span className="text-[0.7rem] tabular-nums text-muted-foreground">
                {formatHour(h.hour)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

// ── Warning panel ────────────────────────────────────────────────────────────

const SEVERITY: Record<AlertSeverity, { icon: LucideIcon; color: string; label: string }> = {
  critical: { icon: ShieldAlert, color: 'var(--viz-critical)', label: 'Critical' },
  warning: { icon: AlertTriangle, color: 'var(--viz-warning)', label: 'Warning' },
  info: { icon: Info, color: 'var(--viz-neutral)', label: 'For information' },
  // Grey, like an unconfigured route on the tracking board: not a problem and
  // not an all-clear. It shares `--viz-neutral` with info deliberately — a
  // lower-contrast token would fail on the chip text — and is told apart by
  // its icon and its "Not measured" state chip.
  unknown: { icon: HelpCircle, color: 'var(--viz-neutral)', label: 'Not measured' },
};

/** Chip order, and the severity each chip admits. `all` is handled separately. */
const ALERT_FILTERS: { key: 'all' | AlertSeverity; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'For information' },
  { key: 'unknown', label: 'Not measured' },
];

/** Affected identifiers shown before the list is cut short. */
const ITEMS_SHOWN = 24;

/**
 * Warning board, in the same shape as the live tracking list on /track-all:
 * a status dot, the count as a bold leading identifier, a state chip, a
 * plain-English reason, and an expandable panel holding the specific things
 * affected plus the one action that fixes them.
 *
 * Adopting that shape is not decoration. An admin reading this panel is doing
 * the same job they do on the tracking board — scan for the red dot, open the
 * row, see WHICH routes are wrong, go and change them — so the panel that used
 * to end at a count now names route 12 and 31 by number.
 *
 * The green state is earned: it appears only when every check ran AND passed.
 * `unknown` here covers checks OUTSIDE this panel (a failed finance or trend
 * query); checks belonging to the panel arrive as their own grey row from
 * buildAlerts, so a failure is never silently indistinguishable from a pass.
 */
export function WarningPanel({
  alerts, unknown, onRetry,
}: {
  alerts: DashboardAlert[];
  unknown: boolean;
  /** Refetches the dashboard, for the "could not run" row. */
  onRetry?: () => void;
}) {
  const [filter, setFilter] = React.useState<'all' | AlertSeverity>('all');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Counts are taken from the full list, never the filtered one, so clicking a
  // chip always reveals exactly as many rows as the chip promised.
  const counts = React.useMemo(() => {
    const base = { all: alerts.length, critical: 0, warning: 0, info: 0, unknown: 0 };
    for (const a of alerts) base[a.severity]++;
    return base;
  }, [alerts]);

  const visible = React.useMemo(
    () => (filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter)),
    [alerts, filter]
  );

  // A filter that hides the open row would otherwise leave its detail panel
  // rendering for a row no longer in the list.
  const expandedStillVisible = expandedId ? visible.some((a) => a.id === expandedId) : true;
  React.useEffect(() => {
    if (!expandedStillVisible) setExpandedId(null);
  }, [expandedStillVisible]);

  if (alerts.length === 0) {
    return unknown ? (
      <p className="text-sm text-muted-foreground">
        Some checks could not be run, so this panel cannot confirm an all-clear.
      </p>
    ) : (
      <div className="flex items-center gap-2.5 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--viz-good)' }} aria-hidden />
        <span className="text-foreground">Nothing needs attention right now.</span>
      </div>
    );
  }

  // Only offer a chip that would actually show something. A row of zeroes is
  // the same noise as a "0 overdue bills" alert.
  const chips = ALERT_FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0);

  return (
    <div className="space-y-3">
      {chips.length > 2 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
          {chips.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className="rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={
                  active
                    ? {
                        background: 'var(--viz-accent-soft)',
                        color: 'var(--viz-accent)',
                        borderColor: 'transparent',
                        boxShadow: 'inset 0 0 0 1px var(--viz-accent)',
                      }
                    : { boxShadow: 'inset 0 0 0 1px var(--viz-panel-border)' }
                }
              >
                <span className={active ? '' : 'text-muted-foreground'}>{f.label}</span>{' '}
                <span className="tabular-nums opacity-70">{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="divide-y" style={{ borderColor: 'var(--viz-panel-border)' }}>
        {visible.map((a) => (
          <AlertRow
            key={a.id}
            alert={a}
            expanded={expandedId === a.id}
            onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
            onRetry={onRetry}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * One alert, drawn like a RouteRow on the tracking board.
 *
 * Collapsed it answers "how bad, what, and why" in a single line; opened it
 * answers "which ones exactly" and offers the single next step. The whole row
 * is a disclosure button rather than a link because the destination is now a
 * decision the admin makes AFTER seeing the affected identifiers.
 */
function AlertRow({
  alert, expanded, onToggle, onRetry,
}: {
  alert: DashboardAlert;
  expanded: boolean;
  onToggle: () => void;
  onRetry?: () => void;
}) {
  const meta = SEVERITY[alert.severity];
  const items = alert.items ?? [];
  const overflow = Math.max(0, items.length - ITEMS_SHOWN);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <meta.icon
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: meta.color }}
          aria-label={meta.label}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
              {num(alert.count)}
            </span>
            <span className="truncate text-sm text-foreground">{alert.subject}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                color: meta.color,
                background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 35%, transparent)`,
              }}
            >
              {alert.state}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {alert.reason}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="space-y-3 px-2 pb-4 pl-9">
          <p className="text-xs leading-relaxed text-muted-foreground">{alert.reason}</p>

          {items.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {alert.itemsLabel ?? 'Affected'}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {items.slice(0, ITEMS_SHOWN).map((item) => (
                  <li
                    key={item}
                    className="rounded-md px-2 py-1 text-xs tabular-nums text-foreground"
                    style={{ background: 'var(--viz-inset)' }}
                  >
                    {item}
                  </li>
                ))}
                {overflow > 0 && (
                  <li className="px-2 py-1 text-xs text-muted-foreground">
                    +{num(overflow)} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {alert.href && alert.action && (
            <Link
              href={alert.href}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-muted"
              style={{ borderColor: 'var(--viz-panel-border)' }}
            >
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {alert.action}
            </Link>
          )}

          {/* No href means there is no page that fixes this — an unmeasured
              check can only be retried. */}
          {!alert.href && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-muted"
              style={{ borderColor: 'var(--viz-panel-border)' }}
            >
              <RotateCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {alert.action ?? 'Try again'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ── Fees donut ───────────────────────────────────────────────────────────────

/**
 * Paid vs unpaid bills as a ring with the paid share in the centre, matching
 * the "Income Breakdown" pattern from the reference: donut on the left, a
 * legend of label/value rows on the right with values right-aligned.
 */
export function FeesDonut({
  paid, unpaid, outstanding, collected,
}: {
  paid: number;
  unpaid: number;
  outstanding: string;
  collected: string;
}) {
  const total = paid + unpaid;
  const share = total > 0 ? Math.round((paid / total) * 100) : null;

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = share === null ? circumference : circumference * (1 - share / 100);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0">
        <svg width="112" height="112" viewBox="0 0 112 112" role="img"
          aria-label={share === null ? 'No bills raised' : `${share} percent of bills paid`}>
          <circle cx="56" cy="56" r={radius} fill="none" strokeWidth="11"
            stroke="color-mix(in oklab, var(--viz-serious) 28%, transparent)" />
          <circle
            cx="56" cy="56" r={radius} fill="none" strokeWidth="11" strokeLinecap="round"
            stroke="var(--viz-good)"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 56 56)"
            className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {share === null ? '—' : `${share}%`}
          </span>
          <span className="text-[0.7rem] text-muted-foreground">paid</span>
        </div>
      </div>

      <dl className="min-w-0 flex-1 space-y-2 text-sm">
        <LegendRow colour="var(--viz-good)" label="Bills paid" value={num(paid)} />
        <LegendRow colour="var(--viz-serious)" label="Bills unpaid" value={num(unpaid)} />
        <LegendRow label="Outstanding" value={outstanding} />
        <LegendRow label="Collected today" value={collected} />
      </dl>
    </div>
  );
}

function LegendRow({ colour, label, value }: { colour?: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {colour ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colour }} aria-hidden />
      ) : (
        <span className="h-2.5 w-2.5 shrink-0" aria-hidden />
      )}
      <dt className="min-w-0 flex-1 truncate text-muted-foreground">{label}</dt>
      <dd className="shrink-0 font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

// ── Attention band ───────────────────────────────────────────────────────────

/**
 * One counted category in the full-width attention band.
 *
 * `change` is a measured comparison (this period vs the previous one) or null
 * when there is nothing to compare against — in which case no arrow is drawn.
 * `severe` inverts the colour: for these categories a rise is bad news, so an
 * increase in expired documents must never render as a healthy green.
 */
export function AttentionStat({
  label, value, caption, change, href, severe = true,
}: {
  label: string;
  value: number;
  caption: string;
  change?: number | null;
  href: string;
  severe?: boolean;
}) {
  const show = change !== null && change !== undefined && change !== 0;
  const rising = (change ?? 0) > 0;
  const bad = severe ? rising : !rising;
  const Arrow = rising ? TrendingUp : TrendingDown;

  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-1 cursor-pointer flex-col gap-1 rounded-xl p-4 transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold leading-none tabular-nums text-foreground">
          {num(value)}
        </span>
        {show && (
          <span
            className="flex items-center gap-0.5 text-xs tabular-nums"
            style={{ color: bad ? 'var(--viz-serious)' : 'var(--viz-good)' }}
          >
            <Arrow className="h-3 w-3 shrink-0" aria-hidden />
            {Math.abs(change!)}%
          </span>
        )}
      </span>
      <span className="truncate text-xs text-muted-foreground">{caption}</span>
    </Link>
  );
}

// ── Bus utilisation bars ─────────────────────────────────────────────────────

/**
 * Horizontal seat-utilisation bars, busiest first.
 *
 * Only routes with an assigned bus appear: a route with no vehicle has no seat
 * count, so plotting it at 0% would invent a denominator. The bar is capped for
 * drawing but the printed figure is not — measured 2026-09-04, the fullest
 * route ran at 114% of its seats, which is a real overload worth seeing.
 */
export function UtilisationBars({
  rows, limit = 6,
}: {
  rows: Array<{ id: string; routeNumber: string; routeName: string; occupancy: number; booked: number; capacity: number }>;
  limit?: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No route has an assigned bus, so there are no seats to measure against.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.slice(0, limit).map((r) => {
        const over = r.occupancy > 100;
        const colour = over
          ? 'var(--viz-critical)'
          : r.occupancy >= 70
            ? 'var(--viz-good)'
            : r.occupancy >= 50
              ? 'var(--viz-warning)'
              : 'var(--viz-serious)';
        return (
          <li key={r.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-foreground">
                <span className="font-semibold tabular-nums">{r.routeNumber}</span>{' '}
                <span className="text-muted-foreground">{r.routeName}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: colour }}>
                {r.occupancy}%
              </span>
            </div>
            <div
              className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
              style={{ background: 'color-mix(in oklab, var(--viz-neutral) 20%, transparent)' }}
              role="meter"
              aria-valuenow={r.occupancy}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Route ${r.routeNumber} seat utilisation`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.min(r.occupancy, 100)}%`, background: colour }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {num(r.booked)} of {num(r.capacity)} seats
            </p>
          </li>
        );
      })}
    </ul>
  );
}
