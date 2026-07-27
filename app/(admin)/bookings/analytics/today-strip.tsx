'use client';

/**
 * Live marking progress for today, shown above the tabs because it is
 * operational rather than analytical — it answers "which buses still need
 * scanning right now", a question the retrospective tabs cannot reach since
 * their range ends today and their charts are about trends, not a worklist.
 */

import React from 'react';
import { CircleCheck, CircleSlash, Clock3 } from 'lucide-react';
import { card, num } from '../../_viz/kit';
import type { TodayBlock } from '@/lib/booking/analytics';

/** '2026-07-27' → '27 Jul 2026', without pulling in a date library. */
function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${d} ${month} ${y}`;
}

function Figure({
  label, value, color, Icon,
}: {
  label: string;
  value: number;
  color: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0" style={{ color }} />
      <span className="text-lg font-semibold tabular-nums text-foreground">{num(value)}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function TodayStrip({ data }: { data: TodayBlock }) {
  if (data.booked === 0) {
    return (
      <section className={`${card} p-4`}>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Today · {humanDate(data.date)}</span> — no
          bookings, so there is nothing to scan.
        </p>
      </section>
    );
  }

  // Routes with nothing left to scan are dropped: this is a worklist, and a
  // finished route is noise on it. byRoute already arrives worst-first.
  const outstanding = data.byRoute.filter((r) => r.unmarked > 0);

  return (
    <section className={`${card} p-4`} aria-labelledby="today-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id="today-heading" className="text-sm font-semibold text-foreground">
            Today · {humanDate(data.date)}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {num(data.booked)} booked · {data.markedPct.toFixed(0)}% scanned
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Figure label="present" value={data.present} color="var(--viz-good)" Icon={CircleCheck} />
          <Figure label="absent" value={data.absent} color="var(--viz-serious)" Icon={CircleSlash} />
          <Figure label="still to scan" value={data.unmarked} color="var(--viz-warning)" Icon={Clock3} />
        </div>
      </div>

      {/*
        Three stacked segments rather than a single percentage bar: unmarked is
        not the same as absent, and collapsing them would report a bus nobody has
        scanned yet as a bus where nobody turned up.
      */}
      <div
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${num(data.present)} present, ${num(data.absent)} absent, ${num(data.unmarked)} still to scan, of ${num(data.booked)} booked`}
      >
        {([
          ['var(--viz-good)', data.present],
          ['var(--viz-serious)', data.absent],
        ] as const).map(([color, value], i) =>
          value > 0 ? (
            <div key={i} style={{ background: color, width: `${(value / data.booked) * 100}%` }} />
          ) : null
        )}
      </div>

      {outstanding.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Still to scan:</span>
          {outstanding.slice(0, 8).map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-foreground"
              title={`${r.label}: ${r.unmarked} of ${r.booked} not yet scanned`}
            >
              <span className="truncate max-w-[14rem]">{r.label}</span>
              <span className="font-semibold tabular-nums">{num(r.unmarked)}</span>
            </span>
          ))}
          {outstanding.length > 8 && (
            <span className="text-xs text-muted-foreground">
              +{num(outstanding.length - 8)} more
            </span>
          )}
        </div>
      )}
    </section>
  );
}
