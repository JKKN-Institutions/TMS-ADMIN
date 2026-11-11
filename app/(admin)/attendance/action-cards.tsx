'use client';

/**
 * "Action for tomorrow" as three coloured cards — one per problem, worst
 * first — instead of a block of sentences. Each card carries its count, the
 * buses (as links to that bus's learner list), and the action to take.
 */

import React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ScanLine, UserX, Users } from 'lucide-react';
import type { DailyRouteRow } from '@/lib/attendance/daily-report';
import type { DailyReportResponse } from '@/app/api/admin/attendance/daily/route';

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const routeLabel = (r: DailyRouteRow) => `${r.routeNumber ?? '—'} ${r.routeName ?? ''}`.trim();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Gradient header per card. 600→700 steps keep white text readable.
const TONE = {
  red: { head: 'from-red-600 to-rose-700', dot: 'bg-red-500', link: 'text-red-700 dark:text-red-300' },
  orange: { head: 'from-orange-600 to-orange-700', dot: 'bg-orange-500', link: 'text-orange-700 dark:text-orange-300' },
  violet: { head: 'from-violet-600 to-purple-700', dot: 'bg-violet-500', link: 'text-violet-700 dark:text-violet-300' },
} as const;

function ActionCard({
  tone, icon: Icon, title, rows, learners, advice, action, renderItem,
}: {
  tone: keyof typeof TONE;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rows: DailyRouteRow[];
  learners: number;
  advice: string;
  action?: { href: string; label: string };
  renderItem: (r: DailyRouteRow) => React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_-18px_rgba(15,23,42,0.35)]">
      <header className={`relative overflow-hidden bg-gradient-to-br ${t.head} px-5 py-4 text-white`}>
        <span aria-hidden="true" className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-tight">{title}</h3>
            <p className="text-xs text-white/85">
              {rows.length === 0 ? 'Nothing to do' : `${plural(learners, 'learner', 'learners')} affected`}
            </p>
          </div>
          <span className="text-3xl font-bold tabular-nums">{rows.length}</span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
          All clear on this trip.
        </div>
      ) : (
        <div className="flex flex-1 flex-col px-5 py-4">
          <p className="text-sm text-foreground">{advice}</p>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li key={r.routeId} className="rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm">
                {renderItem(r)}
              </li>
            ))}
          </ul>
          {action && (
            <Link
              href={action.href}
              className={`mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold ${t.link} hover:underline`}
            >
              {action.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

export function ActionCards({ data }: { data: DailyReportResponse }) {
  const { noIncharge, notScanned, low } = data.actions;
  const total = noIncharge.length + notScanned.length + low.length;
  const sum = (rows: DailyRouteRow[]) => rows.reduce((n, r) => n + r.roster, 0);
  const busLink = (r: DailyRouteRow) => (
    <Link
      href={`/attendance/${r.routeId}/${data.date}?direction=${data.direction}`}
      className="font-semibold text-foreground underline-offset-2 hover:underline"
    >
      {routeLabel(r)}
    </Link>
  );
  const since = (r: DailyRouteRow) => (r.lastMarked ? `last marked ${shortDate(r.lastMarked)}` : 'not marked in 5 weeks');
  const heading = data.windowOpen ? 'To check before marking closes' : 'Action for tomorrow';

  if (total === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 dark:border-green-500/30 dark:bg-green-500/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold text-foreground">{heading}</p>
          <p className="text-sm text-muted-foreground">
            {data.windowOpen ? 'Nothing to act on so far.' : 'Every bus was scanned. Nothing to act on.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <section aria-label={heading} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {plural(total, 'bus needs attention', 'buses need attention')}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <ActionCard
          tone="red"
          icon={UserX}
          title="No in-charge"
          rows={noIncharge}
          learners={sum(noIncharge)}
          advice="Nobody is assigned to scan these buses, so their learners can never be marked."
          action={{ href: '/staff-route-assignments', label: 'Assign an in-charge' }}
          renderItem={(r) => (
            <>
              {busLink(r)}
              <span className="block text-xs text-muted-foreground">
                {r.roster} learners · {since(r)}
              </span>
            </>
          )}
        />
        <ActionCard
          tone="orange"
          icon={ScanLine}
          title="Not scanned"
          rows={notScanned}
          learners={sum(notScanned)}
          advice="In-charges are assigned but did not scan. Speak to them before the next trip."
          renderItem={(r) => {
            const names = data.inchargeNames[r.routeId] ?? [];
            return (
              <>
                {busLink(r)}
                <span className="block text-xs text-muted-foreground">
                  {r.roster} learners · {since(r)}
                  {!r.hasBus && ' · no bus assigned'}
                </span>
                <span className="mt-1 flex items-start gap-1 text-xs text-foreground">
                  <Users className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">{names.length > 0 ? names.join(', ') : `${r.incharges} assigned`}</span>
                </span>
              </>
            );
          }}
        />
        <ActionCard
          tone="violet"
          icon={Users}
          title="Low scanning"
          rows={low}
          learners={sum(low)}
          advice="Too few learners were scanned, so most absences are learners nobody scanned. Ask every in-charge to scan."
          renderItem={(r) => (
            <>
              {busLink(r)}
              <span className="block text-xs text-muted-foreground">
                {r.present} of {r.roster} present · {r.markers} of {r.incharges} in-charges scanned
              </span>
            </>
          )}
        />
      </div>
    </section>
  );
}
