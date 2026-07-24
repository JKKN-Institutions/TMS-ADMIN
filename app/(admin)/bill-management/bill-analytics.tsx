'use client';

// Bill Management → Analytics view. Lazy-loaded (recharts is heavy) from page.tsx.
// All figures come from `rows`/`summary` already fetched by the module; money math
// mirrors summarizeBills so charts reconcile with the KPI tiles above.

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { CheckCircle2, Clock, AlertTriangle, Wallet, Users } from 'lucide-react';
import {
  VIZ_CSS, ChartCard, VizTable, StatTile, Meter, Legend, EmptyState, VizTooltip,
  gridProps, axisTick, axisLine, inr, inrCompact, num,
} from '../_viz/kit';
import type { TransportBillRow, BillSummary } from '@/lib/fees/bills';
import { learnerPaymentBreakdown, termBreakdown, groupByInstitution, groupByDepartment, type GroupStat } from '@/lib/fees/bill-analytics';

// Learner buckets on the reserved good→serious status scale (icon + label, never color-alone).
const BUCKETS = [
  { key: 'fullyPaid', label: 'Fully paid', color: 'var(--viz-good)', Icon: CheckCircle2 },
  { key: 'partiallyPaid', label: 'Partially paid', color: 'var(--viz-warning)', Icon: Clock },
  { key: 'unpaid', label: 'Unpaid', color: 'var(--viz-serious)', Icon: AlertTriangle },
] as const;

export default function BillAnalytics({
  rows, summary, yearLabel,
}: {
  rows: TransportBillRow[];
  summary: BillSummary;
  yearLabel?: string;
}) {
  const learners = useMemo(() => learnerPaymentBreakdown(rows), [rows]);
  const terms = useMemo(() => termBreakdown(rows), [rows]);
  const institutions = useMemo(() => groupByInstitution(rows), [rows]);
  const departments = useMemo(() => groupByDepartment(rows), [rows]);

  // "Paid" the way the module defines it for the headline: anyone who has paid
  // something (fully OR partially). The report tables below still break the two
  // apart, so no detail is lost.
  const paidInclPartial = learners.fullyPaid + learners.partiallyPaid;

  const billed = summary.totalBilledAmount;
  const collected = summary.collectedAmount;
  const pending = summary.pendingAmount;
  const rate = billed > 0 ? (collected / billed) * 100 : 0;
  const scope = yearLabel ? `for ${yearLabel}` : 'across all years';
  const hasData = billed > 0 || learners.totalLearners > 0;

  // Learner status chart rows.
  const learnerData = BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    color: b.color,
    Icon: b.Icon,
    count: learners[b.key],
  }));

  // Per-term chart rows (money, stacked collected + pending).
  const termData = terms.map((t) => ({
    name: `Term ${t.term_no}`,
    collected: t.collected,
    pending: t.pending,
  }));

  if (!hasData) {
    return (
      <div className="viz-scope">
        <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />
        <EmptyState message={`No transport billing ${scope} yet.`} />
      </div>
    );
  }

  return (
    <div className="viz-scope space-y-6">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      {/* Headline strip — deliberately NOT repeating the billed/collected/pending
          amounts already shown in the KPI cards above the toggle. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Meter label="Collection rate" rate={rate} caption={`${inrCompact(collected)} of ${inrCompact(billed)} collected`} />
        <StatTile
          label="Paid learners (incl. partial)"
          value={`${num(paidInclPartial)} / ${num(learners.totalLearners)}`}
          sub={`${num(learners.fullyPaid)} fully · ${num(learners.partiallyPaid)} partial · ${num(learners.unpaid)} unpaid`}
          Icon={Wallet}
          tone="text-[var(--viz-good)]"
        />
        <StatTile
          label="Overdue learners"
          value={num(learners.overdue)}
          sub="past a due date, still owing"
          Icon={AlertTriangle}
          tone="text-[var(--viz-critical)]"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Chart 1 — Collection progress (part-to-whole: collected + pending = billed) */}
        <ChartCard
          title="Collection progress"
          subtitle={`Collected vs pending, by amount ${scope}`}
          hasData={billed > 0}
          legend={
            <Legend items={[
              { label: 'Collected', color: 'var(--viz-good)', Icon: CheckCircle2 },
              { label: 'Pending', color: 'var(--viz-context)' },
            ]} />
          }
          chart={
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={[{ name: 'Transport fees', collected, pending }]} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} tickFormatter={inrCompact} />
                <YAxis type="category" dataKey="name" width={100} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={inr} />} />
                <Bar dataKey="collected" name="Collected" stackId="p" fill="var(--viz-good)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} />
                <Bar dataKey="pending" name="Pending" stackId="p" fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          }
          table={
            <VizTable head={['', 'Amount']} rows={[['Collected', inr(collected)], ['Pending', inr(pending)], ['Total billed', inr(billed)]]} />
          }
        />

        {/* Chart 2 — Learner payment status (distinct learners; status scale) */}
        <ChartCard
          title="Learner payment status"
          subtitle={`${num(learners.totalLearners)} billed learners${learners.overdue ? ` · ${num(learners.overdue)} overdue` : ''}`}
          hasData={learners.totalLearners > 0}
          legend={<Legend items={learnerData.map((d) => ({ label: d.label, color: d.color, Icon: d.Icon }))} />}
          chart={
            <ResponsiveContainer width="100%" height={Math.max(160, learnerData.length * 46 + 24)}>
              <BarChart data={learnerData} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap="30%">
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={110} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${num(v)} learners`} />} />
                <Bar dataKey="count" name="Learners" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {learnerData.map((d) => <Cell key={d.key} fill={d.color} />)}
                  <LabelList dataKey="count" position="right" fill="var(--viz-tick)" fontSize={11} formatter={(v: number) => num(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          }
          table={
            <VizTable
              head={['Status', 'Learners']}
              rows={learnerData.map((d) => [d.label, num(d.count)])}
            />
          }
        />
      </div>

      {/* Chart 3 — Per-term breakdown (money stacked; counts in the table twin) */}
      <ChartCard
        title="By term"
        subtitle={`Collected vs pending per term ${scope}`}
        hasData={terms.length > 0}
        emptyMessage="No term data yet."
        legend={
          <Legend items={[
            { label: 'Collected', color: 'var(--viz-good)', Icon: CheckCircle2 },
            { label: 'Pending', color: 'var(--viz-context)' },
          ]} />
        }
        chart={
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={termData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap="34%">
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={axisLine} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={inrCompact} width={56} />
              <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={inr} />} />
              <Bar dataKey="collected" name="Collected" stackId="t" fill="var(--viz-good)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={56} />
              <Bar dataKey="pending" name="Pending" stackId="t" fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={56} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        }
        table={
          <VizTable
            head={['Term', 'Learners', 'Fully paid', 'Partial', 'Unpaid', 'Collected', 'Pending']}
            rows={terms.map((t) => [
              `Term ${t.term_no}`, num(t.learners), num(t.fullyPaidLearners), num(t.partialLearners),
              num(t.unpaidLearners), inr(t.collected), inr(t.pending),
            ])}
          />
        }
        csv={{
          filename: `bill-analytics-by-term${yearLabel ? `-${yearLabel}` : ''}.csv`,
          head: ['Term', 'Learners', 'Fully paid', 'Partial', 'Unpaid', 'Collected', 'Pending'],
          rows: terms.map((t) => [t.term_no, t.learners, t.fullyPaidLearners, t.partialLearners, t.unpaidLearners, t.collected, t.pending]),
        }}
      />

      {/* Institution- and department-wise reports — distinct learners split into
          Fully paid / Partial / Unpaid, plus the money each group accounts for.
          Same rows + isActiveLearnerBill as the tiles, so they reconcile. */}
      <GroupReport
        title="By institution"
        subtitle={`Learners and collection per institution ${scope}`}
        stats={institutions}
        dimensionHead="Institution"
        csvName="bill-analytics-by-institution"
        yearLabel={yearLabel}
      />
      <GroupReport
        title="By department"
        subtitle={`Learners and collection per department ${scope}`}
        stats={departments}
        dimensionHead="Department"
        csvName="bill-analytics-by-department"
        yearLabel={yearLabel}
      />

      {summary.staffDeferred > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {num(summary.staffDeferred)} staff record(s) are deferred (tracked, not billed) and excluded from the figures above.
        </p>
      )}
    </div>
  );
}

// One grouped report (institution- or department-wise): a horizontal collected-vs-
// pending bar per group, with a table twin carrying the full learner split + CSV.
function GroupReport({
  title, subtitle, stats, dimensionHead, csvName, yearLabel,
}: {
  title: string;
  subtitle: string;
  stats: GroupStat[];
  dimensionHead: string;
  csvName: string;
  yearLabel?: string;
}) {
  const chartData = stats.map((g) => ({ name: g.label, collected: g.collected, pending: g.pending }));
  const head = [dimensionHead, 'Learners', 'Fully paid', 'Partial', 'Unpaid', 'Collected', 'Pending'];
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      hasData={stats.length > 0}
      emptyMessage="No billed learners to break down yet."
      legend={
        <Legend items={[
          { label: 'Collected', color: 'var(--viz-good)', Icon: CheckCircle2 },
          { label: 'Pending', color: 'var(--viz-context)' },
        ]} />
      }
      chart={
        <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 34 + 24)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap="28%">
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} tickFormatter={inrCompact} />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) => (v.length > 26 ? v.slice(0, 25) + '…' : v)}
            />
            <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={inr} />} />
            <Bar dataKey="collected" name="Collected" stackId="g" fill="var(--viz-good)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={22} />
            <Bar dataKey="pending" name="Pending" stackId="g" fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={22} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <VizTable
          head={head}
          rows={stats.map((g) => [
            g.label, num(g.learners), num(g.fullyPaid), num(g.partiallyPaid), num(g.unpaid), inr(g.collected), inr(g.pending),
          ])}
        />
      }
      csv={{
        filename: `${csvName}${yearLabel ? `-${yearLabel}` : ''}.csv`,
        head,
        rows: stats.map((g) => [g.label, g.learners, g.fullyPaid, g.partiallyPaid, g.unpaid, g.collected, g.pending]),
      }}
    />
  );
}
