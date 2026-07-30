'use client';

/**
 * Attendance analytics tab.
 *
 * Attendance exists for a small minority of routes and days, so this tab leads
 * with a coverage disclosure and every rate names its denominator. When the
 * attendance query fails the whole body is replaced with an error state — zeroed
 * KPIs would read as "nobody boarded", which is a different and false claim.
 */

import React from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, QrCode, ScanLine, UserX, Users, XCircle,
} from 'lucide-react';
import {
  ChartCard, EmptyState, Legend, Meter, StatTile, VizTable, VizTooltip, axisLine, axisTick, card,
  gridProps, num,
} from '../../_viz/kit';
import { CoverageCallout } from './controls';
import type { AttendanceBlock } from '@/lib/booking/analytics';

const CHART_TOP_N = 20;

/** Small labelled figure used by the composition panel. */
function Cell({ label, value, Icon, color }: { label: string; value: string; Icon: typeof CheckCircle2; color: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color }} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export default function AttendanceTab({ data }: { data: AttendanceBlock }) {
  if (data.unavailable) {
    return (
      <section className={`${card} p-5`}>
        <EmptyState message="Attendance data is temporarily unavailable. Booking figures on the other tab are unaffected." />
      </section>
    );
  }

  const k = data.kpis;

  const perDay = (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.perDay} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap="24%" barGap={2}>
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="date" tick={axisTick} axisLine={axisLine} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="booked" name="Booked" fill="var(--viz-context)" radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="boarded" name="Boarded" fill="var(--viz-good)" radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );

  const routeRows = data.noShowByRoute.slice(0, CHART_TOP_N);
  const noShowByRoute = (
    <ResponsiveContainer width="100%" height={Math.max(220, routeRows.length * 30 + 24)}>
      <BarChart data={routeRows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }} barCategoryGap="28%">
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
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${num(v)} no-shows`} />} />
        <Bar dataKey="noShows" name="No-shows" fill="var(--viz-serious)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="noShows" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const deptRows = data.byDepartment.slice(0, 15);
  const byDept = (
    <ResponsiveContainer width="100%" height={Math.max(220, deptRows.length * 30 + 24)}>
      <BarChart data={deptRows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }} barCategoryGap="28%">
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
        <Bar dataKey="noShows" name="No-shows" fill="var(--viz-serious)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="noShows" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  // From kpis, NOT byMethod/records — those are both method-filtered, so they
  // move together and `?method=qr_scan` would report 0% and retract the warning.
  const manualShare = Math.round(k.manualSharePct);

  return (
    <div className="space-y-6">
      <CoverageCallout {...data.coverage} />

      {/*
        This caveat sits WITH the figures it qualifies, not in the composition
        panel it used to headline. Two reasons. It is measured over the join
        population, while that panel's body counts the composition one — under
        ?direction=return (prod has 181 onward, 0 return) the panel rendered
        "no records" beneath a subtitle claiming 49% of records were manual.
        And gating it on records > 0, the obvious fix, would have hidden a
        warning that still applies to the show-up rate — suppressing a true
        warning is the failure mode this whole module keeps guarding against.
      */}
      {manualShare >= 40 && (
        <p className="text-xs text-muted-foreground" role="note">
          <span className="font-medium text-foreground">{manualShare}% of attendance was entered manually</span>{' '}
          rather than scanned — boarding figures below are only as reliable as that manual entry.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Attendance records" value={num(k.records)} sub={`${num(data.coverage.daysWithAttendance)} days scanned`} Icon={ScanLine} tone="text-primary" />
        {/*
          `present` is method/status-filtered but `walkUps` is not, so pairing
          them read as "0 present · 2 walk-ups" under ?att_status=absent — a
          walk-up is by definition someone who boarded. Each figure now sits
          with a sub drawn from its OWN population; walk-ups moved to the Meter,
          which is already the join-population tile.
        */}
        <StatTile label="Marked present" value={num(k.present)} sub={`of ${num(k.records)} records`} Icon={CheckCircle2} tone="text-[var(--viz-good)]" />
        <StatTile label="No-shows" value={num(k.noShows)} sub={`of ${num(k.bookedOnScannedDays)} booked on scanned days`} Icon={UserX} tone="text-[var(--viz-serious)]" />
        <Meter
          label="Show-up rate"
          rate={k.showUpRate}
          caption={`${num(k.boarded)} boarded of ${num(k.bookedOnScannedDays)} booked on scanned days${k.walkUps > 0 ? ` · ${num(k.walkUps)} walk-ups` : ''}`}
        />
      </div>

      <ChartCard
        title="Booked vs boarded per day"
        subtitle="Only days with at least one attendance record appear here"
        hasData={data.perDay.length > 0}
        emptyMessage="No attendance recorded in this range."
        legend={<Legend items={[{ label: 'Booked', color: 'var(--viz-context)' }, { label: 'Boarded', color: 'var(--viz-good)', Icon: CheckCircle2 }]} />}
        chart={perDay}
        table={<VizTable head={['Date', 'Booked', 'Boarded', 'No-shows']} rows={data.perDay.map((d) => [d.date, num(d.booked), num(d.boarded), num(d.noShows)])} />}
        csv={{ filename: 'booked-vs-boarded.csv', head: ['Date', 'Booked', 'Boarded', 'No-shows'], rows: data.perDay.map((d) => [d.date, d.booked, d.boarded, d.noShows]) }}
      />

      <ChartCard
        title="No-shows by route"
        subtitle={data.noShowByRoute.length > CHART_TOP_N ? `Top ${CHART_TOP_N} of ${num(data.noShowByRoute.length)} routes — seats booked but never used` : 'Seats booked but never used'}
        hasData={data.noShowByRoute.length > 0}
        emptyMessage="No attendance recorded in this range."
        chart={noShowByRoute}
        table={<VizTable head={['Route', 'Booked', 'Boarded', 'No-shows', 'No-show %']} rows={data.noShowByRoute.map((r) => [r.label, num(r.booked), num(r.boarded), num(r.noShows), `${r.rate.toFixed(1)}%`])} />}
        csv={{ filename: 'no-shows-by-route.csv', head: ['Route', 'Booked', 'Boarded', 'No-shows', 'No-show %'], rows: data.noShowByRoute.map((r) => [r.label, r.booked, r.boarded, r.noShows, r.rate]) }}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className={`${card} p-5`}>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-foreground">Record composition</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How attendance was captured and which leg it covers.
            </p>
          </div>
          {k.records === 0 ? (
            <EmptyState message="No attendance recorded in this range." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Cell label="Present" value={num(data.byStatus.present)} Icon={CheckCircle2} color="var(--viz-good)" />
              <Cell label="Absent" value={num(data.byStatus.absent)} Icon={XCircle} color="var(--viz-critical)" />
              <Cell label="Walk-ups" value={num(k.walkUps)} Icon={AlertTriangle} color="var(--viz-warning)" />
              <Cell label="Onward" value={num(data.byDirection.onward)} Icon={ScanLine} color="var(--viz-accent)" />
              <Cell label="Return" value={num(data.byDirection.return)} Icon={ScanLine} color="var(--viz-context)" />
              <Cell label="QR / manual" value={`${num(data.byMethod.qr_scan)} / ${num(data.byMethod.manual)}`} Icon={QrCode} color="var(--viz-neutral)" />
            </div>
          )}
        </section>

        <ChartCard
          title="No-shows by department"
          subtitle={data.byDepartment.length > 15 ? `Top 15 of ${num(data.byDepartment.length)} departments` : 'Which cohorts book without travelling'}
          hasData={data.byDepartment.length > 0}
          emptyMessage="No attendance recorded in this range."
          chart={byDept}
          table={<VizTable head={['Department', 'Booked', 'Boarded', 'No-shows', 'No-show %']} rows={data.byDepartment.map((d) => [d.label, num(d.booked), num(d.boarded), num(d.noShows), `${d.rate.toFixed(1)}%`])} />}
          csv={{ filename: 'no-shows-by-department.csv', head: ['Department', 'Booked', 'Boarded', 'No-shows', 'No-show %'], rows: data.byDepartment.map((d) => [d.label, d.booked, d.boarded, d.noShows, d.rate]) }}
        />
      </div>

      <section className={`${card} p-5`}>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Who marked attendance
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.assignedStaffTotal > 0
              ? `${num(data.assignedStaffTotal - data.staffWithNoMarks)} of ${num(data.assignedStaffTotal)} assigned in-charges marked at least once in this range.`
              : 'Marks in this range, by the staff member who recorded them.'}
          </p>
        </div>
        {data.markedByStaff.length === 0 ? (
          <EmptyState message="No attendance recorded in this range." />
        ) : (
          <>
            <VizTable
              head={['Staff', 'Marks', 'Present', 'Absent']}
              rows={data.markedByStaff.map((s) => [s.label, num(s.marks), num(s.present), num(s.absent)])}
            />
            {/* Routes carry 4-12 in-charges each, so silence from most of them is
                the finding — state it rather than leaving it to be inferred from
                a short table. */}
            {data.staffWithNoMarks > 0 && (
              <p className="mt-3 text-xs text-muted-foreground" role="note">
                <span className="font-medium text-foreground">
                  {num(data.staffWithNoMarks)} of {num(data.assignedStaffTotal)} assigned in-charges
                </span>{' '}
                marked nothing in this range.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
