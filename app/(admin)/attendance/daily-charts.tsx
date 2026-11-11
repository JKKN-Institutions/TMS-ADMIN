'use client';

/**
 * Charts for the Daily report. Loaded lazily (next/dynamic) by page.tsx so the
 * chart library never sits in the page's first-load JS — same as Analytics.
 *
 * Colours come from the shared viz kit's validated status scale: Present =
 * good, Absent = critical, Not marked / Low scanning = warning. Every chart has
 * a table twin (ChartCard toggle) and a legend with icons, so nothing is told by
 * colour alone.
 */

import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import {
  ChartCard, Legend, VizTable, VizTooltip, gridProps, axisTick, axisLine, num,
} from '../_viz/kit';
import type { DailyReportResponse } from '@/app/api/admin/attendance/daily/route';

const COLOR = {
  present: 'var(--viz-good)',
  absent: 'var(--viz-critical)',
  notMarked: 'var(--viz-warning)',
  accent: 'var(--viz-accent)',
} as const;

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const fmt = (v: number | null | undefined) => (v == null ? '—' : num(v));
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ── Row 1: attendance overview (line) + today's summary (donut) ───────────────

export function TrendAndSummary({
  data, date, onPickDate,
}: { data: DailyReportResponse; date: string; onPickDate: (d: string) => void }) {
  const trend = useMemo(
    () =>
      [...data.trend]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => {
          const off = d.holiday || d.nothingMarked;
          return {
            date: d.date,
            label: shortDate(d.date),
            // A holiday or a no-marks day is a gap in the line, never a false zero.
            present: off ? null : d.present,
            absent: off ? null : d.absent,
            note: d.holiday ? 'Holiday' : d.nothingMarked ? 'No marks' : null,
            buses: `${d.busesMarked}/${d.buses}`,
          };
        }),
    [data.trend],
  );
  const plotted = trend.filter((d) => d.present !== null).length;
  const selectedLabel = trend.find((d) => d.date === date)?.label;

  const overviewChart = (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart
        data={trend}
        margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
        onClick={(s: { activePayload?: { payload?: { date?: string } }[] } | null) => {
          const d = s?.activePayload?.[0]?.payload?.date;
          if (d) onPickDate(d);
        }}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} minTickGap={12} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip
          cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
          content={<VizTooltip valueFmt={fmt} />}
        />
        {selectedLabel && (
          <ReferenceLine x={selectedLabel} stroke="var(--viz-tick)" strokeDasharray="4 4" />
        )}
        <Line
          type="monotone" dataKey="present" name="Present" stroke={COLOR.present} strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)', fill: COLOR.present }}
          activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--viz-surface)' }} connectNulls={false}
        />
        <Line
          type="monotone" dataKey="absent" name="Absent" stroke={COLOR.absent} strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)', fill: COLOR.absent }}
          activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--viz-surface)' }} connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
  const overviewTable = (
    <VizTable
      head={['Day', 'Present', 'Absent', 'Buses marked']}
      rows={trend.map((d) => [d.label, d.note ?? fmt(d.present), d.note ? '—' : fmt(d.absent), d.buses])}
    />
  );

  const t = data.totals;
  const parts = [
    { key: 'present', name: 'Present', value: t.present, color: COLOR.present, Icon: CheckCircle2 },
    { key: 'absent', name: 'Absent', value: t.absent, color: COLOR.absent, Icon: XCircle },
    { key: 'notMarked', name: 'Not marked', value: t.notMarked, color: COLOR.notMarked, Icon: CircleDashed },
  ];
  const whole = parts.reduce((n, p) => n + p.value, 0);

  const donutChart = (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center lg:flex-col xl:flex-row">
      <div className="relative h-[190px] w-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={parts.filter((p) => p.value > 0)}
              dataKey="value" nameKey="name" innerRadius={62} outerRadius={90}
              startAngle={90} endAngle={-270} stroke="var(--viz-surface)" strokeWidth={2} isAnimationActive={false}
            >
              {parts.filter((p) => p.value > 0).map((p) => <Cell key={p.key} fill={p.color} />)}
            </Pie>
            <Tooltip content={<VizTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums text-foreground">{num(whole)}</span>
          <span className="text-xs text-muted-foreground">learners</span>
        </div>
      </div>
      <ul className="w-full max-w-[13rem] space-y-3">
        {parts.map((p) => (
          <li key={p.key} className="flex items-start gap-2.5">
            <p.Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.color }} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{p.name}</span>
              <span className="block text-xs tabular-nums text-muted-foreground">
                {num(p.value)} · {pct(p.value, whole)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
  const donutTable = (
    <VizTable head={['Group', 'Learners', 'Share']} rows={parts.map((p) => [p.name, num(p.value), `${pct(p.value, whole)}%`])} />
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2">
        <ChartCard
          title="Attendance overview"
          subtitle="Present and absent learners per service day · click a day to open it"
          hasData={plotted >= 2}
          emptyMessage="Not enough marked days yet to draw a trend"
          legend={
            <Legend
              items={[
                { label: 'Present', color: COLOR.present, Icon: CheckCircle2 },
                { label: 'Absent', color: COLOR.absent, Icon: XCircle },
              ]}
            />
          }
          chart={overviewChart}
          table={overviewTable}
        />
      </div>
      <div className="min-w-0">
        <ChartCard
          title="Attendance summary"
          subtitle={`${data.direction === 'return' ? 'Evening' : 'Morning'} trip · ${shortDate(data.date)}`}
          hasData={whole > 0}
          chart={donutChart}
          table={donutTable}
        />
      </div>
    </div>
  );
}

// ── Row 2: bus-wise present % + present % by day of week ─────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function BusAndWeekday({ data }: { data: DailyReportResponse }) {
  const buses = useMemo(
    () =>
      data.rows
        .filter((r) => (r.status === 'marked' || r.status === 'low') && r.presentPct !== null)
        .sort((a, b) => (a.presentPct ?? 0) - (b.presentPct ?? 0))
        .map((r) => ({
          name: `${r.routeNumber ?? '—'} ${r.routeName ?? ''}`.trim(),
          pct: r.presentPct ?? 0,
          low: r.status === 'low',
          present: r.present,
          marked: r.marked,
        })),
    [data.rows],
  );
  const skipped = data.rows.filter((r) => r.status === 'not_marked').length;

  const busChart = (
    <ResponsiveContainer width="100%" height={Math.max(220, buses.length * 28 + 24)}>
      <BarChart data={buses} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }} barCategoryGap="26%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={axisTick} axisLine={axisLine} tickLine={false} unit="%" />
        <YAxis
          type="category" dataKey="name" width={170} tick={axisTick} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => truncate(v, 24)}
        />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${v}%`} />} />
        <Bar dataKey="pct" name="Present %" radius={[0, 4, 4, 0]} maxBarSize={16}>
          {buses.map((b) => <Cell key={b.name} fill={b.low ? COLOR.notMarked : COLOR.present} />)}
          <LabelList dataKey="pct" position="right" fill="var(--viz-tick)" fontSize={11} formatter={(v: number) => `${v}%`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  const busTable = (
    <VizTable
      head={['Bus', 'Present', 'Marked', 'Present %']}
      rows={buses.map((b) => [b.name, num(b.present), num(b.marked), `${b.pct}%`])}
    />
  );

  // Present % of marked learners per weekday over the report's recent days.
  const week = useMemo(() => {
    const acc = new Map<number, { present: number; marked: number; days: number }>();
    for (const d of data.trend) {
      if (d.holiday || d.nothingMarked) continue;
      const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
      if (wd === 0) continue;
      const cur = acc.get(wd) ?? { present: 0, marked: 0, days: 0 };
      cur.present += d.present;
      cur.marked += d.present + d.absent;
      cur.days += 1;
      acc.set(wd, cur);
    }
    return WEEKDAYS.map((label, i) => {
      const v = acc.get(i + 1);
      return { label, pct: v && v.marked > 0 ? pct(v.present, v.marked) : null, days: v?.days ?? 0 };
    }).filter((w) => w.pct !== null) as { label: string; pct: number; days: number }[];
  }, [data.trend]);
  const serviceDays = week.reduce((n, w) => n + w.days, 0);

  const weekChart = (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={week} margin={{ top: 20, right: 8, bottom: 4, left: 0 }} barCategoryGap="30%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} unit="%" width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${v}%`} />} />
        <Bar dataKey="pct" name="Present %" fill={COLOR.accent} radius={[4, 4, 0, 0]} maxBarSize={36}>
          <LabelList dataKey="pct" position="top" fill="var(--viz-tick)" fontSize={11} formatter={(v: number) => `${v}%`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  const weekTable = (
    <VizTable head={['Day', 'Present %', 'Days counted']} rows={week.map((w) => [w.label, `${w.pct}%`, w.days])} />
  );

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2">
        <ChartCard
          title="Bus-wise attendance"
          subtitle={`Present % of marked learners · ${buses.length} buses scanned, lowest first${skipped ? ` · ${skipped} not marked` : ''}`}
          hasData={buses.length > 0}
          emptyMessage="No bus was scanned on this trip"
          legend={
            <Legend
              items={[
                { label: 'Marked', color: COLOR.present, Icon: CheckCircle2 },
                { label: 'Low scanning', color: COLOR.notMarked, Icon: AlertTriangle },
              ]}
            />
          }
          chart={busChart}
          table={busTable}
        />
      </div>
      <div className="min-w-0">
        <ChartCard
          title="Attendance by day of week"
          subtitle={`Present % of marked learners · last ${serviceDays} service days`}
          hasData={week.length >= 2}
          emptyMessage="Not enough marked days yet"
          chart={weekChart}
          table={weekTable}
        />
      </div>
    </div>
  );
}
