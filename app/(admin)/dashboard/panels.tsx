'use client';

// Dashboard panels. Every one of these replaces a block of hardcoded markup:
// the old page shipped a static "System Health" list, four frozen "2 minutes
// ago" activity rows, and a Transport Analytics card whose revenue figure was
// the literal 0 returned by the API.
//
// All styling goes through the shared viz kit's semantic tokens (bg-card,
// text-foreground, border-border) rather than hardcoded bg-white/text-gray-900,
// so dark mode works by construction instead of needing a `dark:` variant on
// every element.

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Info, ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { card, num } from '../_viz/kit';
import { relativeTime } from '@/lib/dashboard/format';
import type { DashboardActivityItem, DashboardAlert, AlertSeverity } from '@/lib/dashboard/types';

// ── Section shell ────────────────────────────────────────────────────────────

export function Panel({
  title, icon: Icon, action, children,
}: {
  title: string;
  icon: LucideIcon;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section className={`${card} flex flex-col overflow-hidden`}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

// ── Attention Required ───────────────────────────────────────────────────────

const SEVERITY: Record<AlertSeverity, { icon: LucideIcon; color: string; label: string }> = {
  critical: { icon: ShieldAlert, color: 'var(--viz-critical)', label: 'Critical' },
  warning: { icon: AlertTriangle, color: 'var(--viz-warning)', label: 'Warning' },
  info: { icon: Info, color: 'var(--viz-neutral)', label: 'For information' },
};

/**
 * Replaces the old "System Health" card, which rendered the fixed strings
 * "All systems operational" / "Database performance: Excellent" no matter what
 * the system was doing. Here the green state is earned: it only appears when
 * every check ran and came back clean, and each row links to the screen where
 * the admin can actually clear it.
 */
export function AlertsPanel({ alerts, unknown }: { alerts: DashboardAlert[]; unknown: boolean }) {
  if (alerts.length === 0) {
    return unknown ? (
      <p className="text-sm text-muted-foreground">
        Some checks could not be run, so this panel cannot confirm an all-clear.
      </p>
    ) : (
      <div className="flex items-center gap-2.5 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--viz-good)' }} />
        <span className="text-foreground">Nothing needs attention right now.</span>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {alerts.map((a) => {
        const meta = SEVERITY[a.severity];
        return (
          <li key={a.id}>
            <Link
              href={a.href}
              className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted"
            >
              <meta.icon
                className="h-4 w-4 shrink-0"
                style={{ color: meta.color }}
                aria-label={meta.label}
              />
              <span className="min-w-0 flex-1 text-sm text-foreground">{a.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ── Recent activity ──────────────────────────────────────────────────────────

const ACTION_TONE: Record<string, string> = {
  delete: 'var(--viz-critical)',
  reject: 'var(--viz-critical)',
  create: 'var(--viz-good)',
  approve: 'var(--viz-good)',
  generate: 'var(--viz-good)',
  update: 'var(--viz-accent)',
};

/**
 * Live audit feed, sourced from tms_activity_log via the dashboard API.
 *
 * An empty list is ambiguous on purpose-free grounds, so the two causes are
 * separated: `canView === false` means the viewer lacks tms.activity.view and
 * gets an explanatory line, not a misleading "no activity yet".
 */
export function ActivityPanel({
  items, canView,
}: {
  items: DashboardActivityItem[];
  canView: boolean;
}) {
  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to view the activity log.
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No recorded activity yet.</p>;
  }

  return (
    <ul className="space-y-3.5">
      {items.map((item) => {
        // entity_label is the readable noun (a registration number, a route
        // name); description is the fuller sentence. Either may be null, in
        // which case the "action · module" prefix stands alone.
        const headline = item.entityLabel || item.description || '';
        return (
          <li key={item.id} className="flex items-start gap-3">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: ACTION_TONE[item.action] ?? 'var(--viz-neutral)' }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                <span className="capitalize">{item.action}</span>
                {' · '}
                <span className="text-muted-foreground">{item.module}</span>
                {headline ? <> — {headline}</> : null}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {item.actorEmail ?? 'system'} · {relativeTime(item.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Key/value rows used by the finance panel ─────────────────────────────────

export function Row({
  label, value, href, tone,
}: {
  label: string;
  value: string;
  href?: string;
  tone?: string;
}) {
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className="text-sm font-semibold tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </span>
    </>
  );

  if (!href) {
    return <div className="flex items-center justify-between gap-3 py-1.5">{body}</div>;
  }
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
    >
      {body}
    </Link>
  );
}

/** Small count with an Indian-grouped value, used inside the Today panel. */
export function MiniStat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{num(value)}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
