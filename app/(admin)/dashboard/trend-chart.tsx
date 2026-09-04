'use client';

// 7-day bookings vs. actual boardings.
//
// Rendered through the shared ChartCard so it inherits the chart/table toggle,
// the CSV export and the empty state every other chart in the app already has —
// and so it can never diverge from the Analytics pages' palette.

import React from 'react';
import {
  Area, AreaChart, CartesianGrid, Legend as RcLegend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ChartCard, Legend, VizTable, VizTooltip, axisLine, axisTick, gridProps, num,
} from '../_viz/kit';
import { shortDayLabel, percentOf } from '@/lib/dashboard/format';
import type { DashboardTrendPoint } from '@/lib/dashboard/types';

export function TrendChart({ trend }: { trend: DashboardTrendPoint[] }) {
  const rows = trend.map((p) => ({
    ...p,
    label: shortDayLabel(p.date),
  }));

  // A fortnight of all-zero rows is not "data" — it means booking or attendance
  // capture is not running, and an empty state says that far more clearly than
  // a flat line pinned to the axis.
  const hasData = rows.some((r) => r.bookings > 0 || r.present > 0);

  return (
    <ChartCard
      title="Demand, last 14 days"
      subtitle="Seats booked against learners actually boarded"
      hasData={hasData}
      emptyMessage="No bookings or boardings recorded in the last 14 days"
      legend={
        <Legend
          items={[
            { label: 'Booked', color: 'var(--viz-context)' },
            { label: 'Boarded', color: 'var(--viz-accent)' },
          ]}
        />
      }
      csv={{
        filename: 'dashboard-last-14-days.csv',
        head: ['Date', 'Booked', 'Boarded', 'Boarding rate %'],
        rows: rows.map((r) => [r.date, r.bookings, r.present, percentOf(r.present, r.bookings) ?? '']),
      }}
      chart={
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="dashBooked" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-context)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--viz-context)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="dashBoarded" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--viz-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} />
            <YAxis tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} width={48} />
            <Tooltip cursor={{ stroke: 'var(--viz-grid)' }} content={<VizTooltip />} />
            <RcLegend wrapperStyle={{ display: 'none' }} />
            {/* Booked is drawn first so the smaller "boarded" area sits on top
                and stays readable — boardings can never exceed bookings by
                much, and stacking would hide the gap that matters. */}
            <Area
              type="monotone"
              dataKey="bookings"
              name="Booked"
              stroke="var(--viz-context)"
              strokeWidth={2}
              fill="url(#dashBooked)"
            />
            <Area
              type="monotone"
              dataKey="present"
              name="Boarded"
              stroke="var(--viz-accent)"
              strokeWidth={2}
              fill="url(#dashBoarded)"
            />
          </AreaChart>
        </ResponsiveContainer>
      }
      table={
        <VizTable
          head={['Date', 'Booked', 'Boarded', 'Boarding rate']}
          rows={rows.map((r) => {
            const rate = percentOf(r.present, r.bookings);
            return [r.date, num(r.bookings), num(r.present), rate === null ? '—' : `${rate}%`];
          })}
        />
      }
    />
  );
}
