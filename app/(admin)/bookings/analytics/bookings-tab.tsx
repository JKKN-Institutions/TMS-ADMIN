'use client';

/**
 * Bookings analytics tab. Every mark follows the _viz kit conventions: ONE accent
 * hue for nominal-category magnitude bars (never a value ramp), the reserved
 * status scale only for status meaning, and a table twin behind every chart.
 */

import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CalendarCheck, Clock, Users, UserCheck } from 'lucide-react';
import {
  ChartCard, Legend, StatTile, VizTable, VizTooltip, axisLine, axisTick, gridProps, num,
} from '../../_viz/kit';
import type { BookingsBlock } from '@/lib/booking/analytics';

const CHART_TOP_N = 20;
const COHORT_TOP_N = 15;

/**
 * Horizontal magnitude bar over a CountRow[]. Four charts here are identical
 * apart from their data, so they share one renderer — the height tracks the row
 * count so a 3-row chart doesn't stretch its bars across 400px.
 */
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

/** "Top 15 of 27 departments — full list in table view", or just "8 institutions". */
const capNote = (total: number, cap: number, noun: string) =>
  total > cap
    ? `Top ${cap} of ${num(total)} ${noun} — full list in table view`
    : `${num(total)} ${noun}`;

export default function BookingsTab({ data }: { data: BookingsBlock }) {
  const k = data.kpis;

  const perDay = (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.perDay} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap="26%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={axisLine} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${num(v)} bookings`} />} />
        <Bar dataKey="count" name="Bookings" fill="var(--viz-accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );

  const routeRows = data.byRoute.slice(0, CHART_TOP_N);

  const leadTime = (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data.leadTime} margin={{ top: 16, right: 12, bottom: 4, left: 4 }} barCategoryGap="30%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="count" name="Bookings" fill="var(--viz-accent)" radius={[4, 4, 0, 0]} maxBarSize={56}>
          <LabelList dataKey="count" position="top" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  // Sunday is a compulsory weekly holiday, so its bar is a data-quality signal,
  // not demand — it is drawn in the neutral context hue to say "not expected".
  const byWeekday = (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data.byWeekday} margin={{ top: 16, right: 12, bottom: 4, left: 4 }} barCategoryGap="28%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="count" name="Bookings" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.byWeekday.map((d) => (
            <Cell key={d.weekday} fill={d.weekday === 6 ? 'var(--viz-context)' : 'var(--viz-accent)'} />
          ))}
          <LabelList dataKey="count" position="top" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const bookedByRow = [{ name: 'Bookings', ...data.bookedBy }];
  const bookedBy = (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={bookedByRow} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={80} tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="self" name="Self" stackId="b" fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} />
        <Bar dataKey="admin" name="Admin" stackId="b" fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} />
        <Bar dataKey="unknown" name="Unknown" stackId="b" fill="var(--viz-neutral)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Bookings in range" value={num(k.total)} sub={`${num(k.days)} days with bookings`} Icon={CalendarCheck} tone="text-primary" />
        <StatTile label="Distinct learners" value={num(k.learners)} sub={`across ${num(k.routes)} routes`} Icon={Users} tone="text-primary" />
        <StatTile label="Average per booked day" value={num(k.avgPerDay)} sub={k.peakDay ? `peak ${num(k.peakDay.count)} on ${k.peakDay.date}` : 'no bookings yet'} Icon={Clock} tone="text-primary" />
        {/*
          selfPct divides by ALL bookings, and booked_by is null on 560 of 2431
          rows in prod (23%) — those can be neither self nor admin. Naming the
          unattributed count keeps the headline from reading as "everything else
          was admin-entered". The metric itself is left alone: share-of-all is
          the honest denominator, it just has to admit the third bucket.
        */}
        <StatTile
          label="Self-service share"
          value={`${k.selfPct.toFixed(1)}%`}
          sub={
            data.bookedBy.unknown > 0
              ? `${num(data.bookedBy.admin)} admin · ${num(data.bookedBy.unknown)} unattributed`
              : `${num(data.bookedBy.admin)} booked by admin`
          }
          Icon={UserCheck}
          tone="text-[var(--viz-good)]"
        />
      </div>

      <ChartCard
        title="Bookings per day"
        subtitle={`${num(k.total)} bookings across ${num(k.days)} days`}
        hasData={data.perDay.length >= 2}
        emptyMessage="Not enough history in this range — totals are in the tiles above."
        chart={perDay}
        table={<VizTable head={['Date', 'Bookings']} rows={data.perDay.map((d) => [d.date, num(d.count)])} />}
        csv={{ filename: 'bookings-per-day.csv', head: ['Date', 'Bookings'], rows: data.perDay.map((d) => [d.date, d.count]) }}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Bookings by route"
          subtitle={data.byRoute.length > CHART_TOP_N ? `Top ${CHART_TOP_N} of ${num(data.byRoute.length)} routes — full list in table view` : `${num(data.byRoute.length)} routes`}
          hasData={data.byRoute.length > 0}
          chart={hbar(routeRows)}
          table={<VizTable head={['Route', 'Bookings']} rows={data.byRoute.map((r) => [r.label, num(r.count)])} />}
          csv={{ filename: 'bookings-by-route.csv', head: ['Route', 'Bookings'], rows: data.byRoute.map((r) => [r.label, r.count]) }}
        />
        <ChartCard
          title="Booking lead time"
          subtitle="How far ahead of travel a booking was made"
          hasData={k.total > 0}
          chart={leadTime}
          table={<VizTable head={['Lead time', 'Bookings']} rows={data.leadTime.map((b) => [b.label, num(b.count)])} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Bookings by day of week"
          subtitle="Sunday is a weekly holiday — a non-zero Sunday bar is a data issue"
          hasData={k.total > 0}
          legend={<Legend items={[{ label: 'Service day', color: 'var(--viz-accent)' }, { label: 'Weekly holiday', color: 'var(--viz-context)' }]} />}
          chart={byWeekday}
          table={<VizTable head={['Day', 'Bookings']} rows={data.byWeekday.map((d) => [d.label, num(d.count)])} />}
        />
        <ChartCard
          title="Who made the booking"
          subtitle="Self-service adoption vs admin-entered bookings"
          hasData={k.total > 0}
          legend={<Legend items={[{ label: 'Self', color: 'var(--viz-accent)' }, { label: 'Admin', color: 'var(--viz-context)' }, { label: 'Unknown', color: 'var(--viz-neutral)' }]} />}
          chart={bookedBy}
          table={<VizTable head={['Source', 'Bookings']} rows={[['Self', num(data.bookedBy.self)], ['Admin', num(data.bookedBy.admin)], ['Unknown', num(data.bookedBy.unknown)]]} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Bookings by department"
          subtitle={capNote(data.byDepartment.length, COHORT_TOP_N, 'departments')}
          hasData={data.byDepartment.length > 0}
          chart={hbar(data.byDepartment.slice(0, COHORT_TOP_N))}
          table={<VizTable head={['Department', 'Bookings']} rows={data.byDepartment.map((d) => [d.label, num(d.count)])} />}
          csv={{ filename: 'bookings-by-department.csv', head: ['Department', 'Bookings'], rows: data.byDepartment.map((d) => [d.label, d.count]) }}
        />
        <ChartCard
          title="Bookings by institution"
          subtitle={capNote(data.byInstitution.length, COHORT_TOP_N, 'institutions')}
          hasData={data.byInstitution.length > 0}
          chart={hbar(data.byInstitution.slice(0, COHORT_TOP_N))}
          table={<VizTable head={['Institution', 'Bookings']} rows={data.byInstitution.map((i) => [i.label, num(i.count)])} />}
          csv={{ filename: 'bookings-by-institution.csv', head: ['Institution', 'Bookings'], rows: data.byInstitution.map((i) => [i.label, i.count]) }}
        />
      </div>

      {/*
        topStops is capped to 15 SERVER-side (unlike byRoute/byDepartment/
        byInstitution, which arrive whole), so the table twin and the CSV are
        also the top 15 — there is no fuller list to fall back to. The title
        says "Top" rather than implying a complete ranking.
      */}
      <ChartCard
        title="Top boarding stops"
        subtitle="The 15 busiest stops in range — which pickup points carry demand"
        hasData={data.topStops.length > 0}
        chart={hbar(data.topStops)}
        table={<VizTable head={['Stop', 'Bookings']} rows={data.topStops.map((s) => [s.label, num(s.count)])} />}
        csv={{ filename: 'top-boarding-stops.csv', head: ['Stop', 'Bookings'], rows: data.topStops.map((s) => [s.label, s.count]) }}
      />
    </div>
  );
}
