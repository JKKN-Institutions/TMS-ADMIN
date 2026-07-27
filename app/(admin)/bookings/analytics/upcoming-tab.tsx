'use client';

/**
 * Forward demand over the booking horizon. Deliberately carries no attendance
 * or show-up figures: none can exist for a date that has not happened, and a
 * 0% show-up rate on future trips would read as catastrophe rather than as
 * "not yet". The forward question is capacity, not compliance.
 */

import React from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CalendarClock, TriangleAlert, Users } from 'lucide-react';
import {
  ChartCard, EmptyState, StatTile, VizTable, VizTooltip, axisLine, axisTick, card, gridProps, num,
} from '../../_viz/kit';
import type { UpcomingBlock } from '@/lib/booking/analytics';

const TOP_N = 15;

function hbar(rows: { label: string; count: number }[]) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 30 + 24)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }} barCategoryGap="28%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="count" name="Bookings" fill="var(--viz-accent)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="count" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function UpcomingTab({ data }: { data: UpcomingBlock }) {
  const k = data.kpis;

  const perDay = (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.perDay} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap="26%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={axisLine} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${num(v)} booked`} />} />
        <Bar dataKey="count" name="Booked" fill="var(--viz-accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Booked ahead"
          value={num(k.total)}
          sub={`${data.from} → ${data.to}`}
          Icon={CalendarClock}
          tone="text-primary"
        />
        <StatTile
          label="Learners travelling"
          value={num(k.learners)}
          sub={`across ${num(k.routes)} routes`}
          Icon={Users}
          tone="text-primary"
        />
        <StatTile
          label="Busiest day ahead"
          value={k.peakDay ? num(k.peakDay.count) : '—'}
          sub={k.peakDay ? k.peakDay.date : 'nothing booked yet'}
          Icon={CalendarClock}
          tone="text-primary"
        />
        <StatTile
          label="Routes over capacity"
          value={num(k.routesOverCapacity)}
          sub={
            k.routesWithoutCapacity > 0
              ? `${num(k.routesWithoutCapacity)} routes have no seat count on record`
              : 'on their busiest day ahead'
          }
          Icon={TriangleAlert}
          tone={k.routesOverCapacity > 0 ? 'text-[var(--viz-serious)]' : 'text-[var(--viz-good)]'}
        />
      </div>

      {data.overCapacity.length > 0 && (
        <section className={`${card} p-5`} style={{ borderColor: 'var(--viz-serious)' }}>
          <div className="flex items-start gap-3">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: 'var(--viz-serious)' }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-foreground">
                {num(data.overCapacity.length)} route-day
                {data.overCapacity.length === 1 ? '' : 's'} booked beyond the vehicle&apos;s seats
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Worst overflow first. Seats come from the vehicle assigned to the route.
              </p>
              <div className="mt-3 overflow-x-auto">
                <VizTable
                  head={['Route', 'Date', 'Booked', 'Seats', 'Over by']}
                  rows={data.overCapacity.map((o) => [
                    o.label, o.date, num(o.booked), num(o.capacity), num(o.booked - o.capacity),
                  ])}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <ChartCard
        title="Bookings per upcoming day"
        subtitle={`${num(k.total)} bookings across ${num(k.days)} travel days`}
        hasData={data.perDay.length >= 2}
        emptyMessage="Not enough of the horizon is booked yet — totals are in the tiles above."
        chart={perDay}
        table={<VizTable head={['Date', 'Booked']} rows={data.perDay.map((d) => [d.date, num(d.count)])} />}
        csv={{ filename: 'upcoming-per-day.csv', head: ['Date', 'Booked'], rows: data.perDay.map((d) => [d.date, d.count]) }}
      />

      <ChartCard
        title="Load vs seats by route"
        subtitle="Utilisation is the route's BUSIEST single day ahead against its vehicle's seats — a range total would overstate a bus that never carries everyone at once"
        hasData={data.byRoute.length > 0}
        chart={hbar(data.byRoute.slice(0, TOP_N))}
        table={
          <VizTable
            head={['Route', 'Booked ahead', 'Busiest day', 'On that day', 'Seats', 'Peak load']}
            rows={data.byRoute.map((r) => [
              r.label,
              num(r.count),
              r.peakDay?.date ?? '—',
              r.peakDay ? num(r.peakDay.count) : '—',
              // An unknown capacity must never render as 0 — tms_route.total_capacity
              // is dead data and 6 of 24 routes have no vehicle seat count at all.
              r.capacity === null ? 'unknown' : num(r.capacity),
              r.peakUtilization === null ? '—' : `${r.peakUtilization.toFixed(0)}%`,
            ])}
          />
        }
        csv={{
          filename: 'upcoming-load-by-route.csv',
          head: ['Route', 'Booked ahead', 'Busiest day', 'On that day', 'Seats', 'Peak load %'],
          rows: data.byRoute.map((r) => [
            r.label, r.count, r.peakDay?.date ?? '', r.peakDay?.count ?? '',
            r.capacity ?? '', r.peakUtilization ?? '',
          ]),
        }}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Upcoming demand by department"
          subtitle={
            data.byDepartment.length > TOP_N
              ? `Top ${TOP_N} of ${num(data.byDepartment.length)} departments — full list in table view`
              : `${num(data.byDepartment.length)} departments`
          }
          hasData={data.byDepartment.length > 0}
          chart={hbar(data.byDepartment.slice(0, TOP_N))}
          table={<VizTable head={['Department', 'Booked ahead']} rows={data.byDepartment.map((d) => [d.label, num(d.count)])} />}
          csv={{ filename: 'upcoming-by-department.csv', head: ['Department', 'Booked ahead'], rows: data.byDepartment.map((d) => [d.label, d.count]) }}
        />
        <ChartCard
          title="Busiest boarding stops ahead"
          subtitle={`The ${num(data.topStops.length)} busiest pickup points in the horizon`}
          hasData={data.topStops.length > 0}
          chart={hbar(data.topStops)}
          table={<VizTable head={['Stop', 'Booked ahead']} rows={data.topStops.map((s) => [s.label, num(s.count)])} />}
          csv={{ filename: 'upcoming-top-stops.csv', head: ['Stop', 'Booked ahead'], rows: data.topStops.map((s) => [s.label, s.count]) }}
        />
      </div>

      {k.total === 0 && <EmptyState message="No bookings in the upcoming horizon." />}
    </div>
  );
}
