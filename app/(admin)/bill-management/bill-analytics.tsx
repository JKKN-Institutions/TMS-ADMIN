'use client';

// Bill Management → Analytics view. Lazy-loaded (recharts is heavy) from page.tsx.
// All figures come from `rows`/`summary` already fetched by the module; money math
// mirrors summarizeBills so charts reconcile with the KPI tiles above.
//
// Layout: an Overall section (whole selected year), then a "By institution &
// department" section with cascading dropdowns. All / All shows the grouped report
// tables; picking an institution (± department) re-renders the SAME section body
// scoped to that cohort — client-side row narrowing, no refetch.

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { CheckCircle2, Clock, AlertTriangle, Wallet, Users } from 'lucide-react';
import { SelectMenu } from '@/components/ui/select-menu';
import {
  VIZ_CSS, ChartCard, VizTable, StatTile, Meter, Legend, EmptyState, VizTooltip,
  gridProps, axisTick, axisLine, inr, inrCompact, num,
} from '../_viz/kit';
import { summarizeBills, type TransportBillRow, type BillSummary } from '@/lib/fees/bills';
import {
  learnerPaymentBreakdown, termBreakdown, groupByInstitution, groupByDepartment,
  UNASSIGNED_KEY, type GroupStat,
} from '@/lib/fees/bill-analytics';

// Learner buckets on the reserved good→serious status scale (icon + label, never color-alone).
const BUCKETS = [
  { key: 'fullyPaid', label: 'Fully paid', color: 'var(--viz-good)', Icon: CheckCircle2 },
  { key: 'partiallyPaid', label: 'Partially paid', color: 'var(--viz-warning)', Icon: Clock },
  { key: 'unpaid', label: 'Unpaid', color: 'var(--viz-serious)', Icon: AlertTriangle },
] as const;

const ALL = 'all'; // Radix Select forbids '' as a value, so "All" is a sentinel.
const keyOf = (id: string | null) => id ?? UNASSIGNED_KEY;

export default function BillAnalytics({
  rows, summary, yearLabel,
}: {
  rows: TransportBillRow[];
  summary: BillSummary;
  yearLabel?: string;
}) {
  const [inst, setInst] = useState<string>(ALL);
  const [dept, setDept] = useState<string>(ALL);

  const scope = yearLabel ? `for ${yearLabel}` : 'across all years';
  const overallLearners = useMemo(() => learnerPaymentBreakdown(rows), [rows]);
  const hasData = summary.totalBilledAmount > 0 || overallLearners.totalLearners > 0;

  // All institutions/departments that actually have billed learners → dropdown options.
  const institutions = useMemo(() => groupByInstitution(rows), [rows]);
  const departments = useMemo(() => groupByDepartment(rows), [rows]);

  // Department options CASCADE: only departments within the picked institution.
  const rowsForInst = useMemo(
    () => (inst === ALL ? rows : rows.filter((r) => keyOf(r.institution_id) === inst)),
    [rows, inst]
  );
  const deptGroups = useMemo(() => groupByDepartment(rowsForInst), [rowsForInst]);

  // If the chosen department isn't offered by the newly chosen institution, clear it.
  useEffect(() => {
    if (dept !== ALL && !deptGroups.some((g) => g.key === dept)) setDept(ALL);
  }, [deptGroups, dept]);

  const filtering = inst !== ALL || dept !== ALL;
  const scopedRows = useMemo(
    () => (dept === ALL ? rowsForInst : rowsForInst.filter((r) => keyOf(r.department_id) === dept)),
    [rowsForInst, dept]
  );
  const scopedSummary = useMemo(() => summarizeBills(scopedRows), [scopedRows]);

  const instOptions = useMemo(
    () => [{ value: ALL, label: 'All institutions' }, ...institutions.map((g) => ({ value: g.key, label: g.label }))],
    [institutions]
  );
  const deptOptions = useMemo(
    () => [{ value: ALL, label: 'All departments' }, ...deptGroups.map((g) => ({ value: g.key, label: g.label }))],
    [deptGroups]
  );

  const instLabel = inst === ALL ? null : institutions.find((g) => g.key === inst)?.label ?? 'Selected';
  const deptLabel = dept === ALL ? null : deptGroups.find((g) => g.key === dept)?.label ?? 'Selected';
  const cohortLabel = [instLabel, deptLabel].filter(Boolean).join(' · ');

  if (!hasData) {
    return (
      <div className="viz-scope">
        <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />
        <EmptyState message={`No transport billing ${scope} yet.`} />
      </div>
    );
  }

  return (
    <div className="viz-scope space-y-8">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      {/* ── Overall (whole selected year) ─────────────────────────────────────── */}
      <section className="space-y-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Overall</h3>
        <AnalyticsSection rows={rows} summary={summary} scope={scope} yearLabel={yearLabel} />
      </section>

      {/* ── By institution & department (drill-down) ──────────────────────────── */}
      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              By institution &amp; department
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {filtering ? `Showing ${cohortLabel}` : 'Pick an institution or department to drill in'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="w-full sm:w-56">
              <SelectMenu value={inst} onValueChange={setInst} options={instOptions} placeholder="All institutions" ariaLabel="Filter by institution" />
            </div>
            <div className="w-full sm:w-56">
              <SelectMenu value={dept} onValueChange={setDept} options={deptOptions} placeholder="All departments" ariaLabel="Filter by department" />
            </div>
          </div>
        </div>

        {filtering ? (
          <AnalyticsSection rows={scopedRows} summary={scopedSummary} scope={`for ${cohortLabel}`} yearLabel={yearLabel} />
        ) : (
          <>
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
          </>
        )}
      </section>

      {summary.staffDeferred > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {num(summary.staffDeferred)} staff bill(s) are included in the money totals, but not in the
          learner counts and per-learner breakdowns above — staff have no degree, department or
          year of study to group by.
        </p>
      )}
    </div>
  );
}

// The reusable analytics body: three headline tiles + collection-progress and
// learner-status charts + the per-term table. Rendered once for Overall and again
// for a filtered cohort. `rows` may include staff/cancelled rows. The MONEY comes
// from `summary` (learners + staff, matching MyJKKN's Transport Fees screen); the
// per-learner aggregators below filter to active LEARNER bills, because a staff
// member has no degree/department/year to be counted under. The two answer
// different questions and are labelled as such — they are not expected to tally.
function AnalyticsSection({
  rows, summary, scope, yearLabel,
}: {
  rows: TransportBillRow[];
  summary: BillSummary;
  scope: string;
  yearLabel?: string;
}) {
  const learners = useMemo(() => learnerPaymentBreakdown(rows), [rows]);
  const terms = useMemo(() => termBreakdown(rows), [rows]);
  const paidInclPartial = learners.fullyPaid + learners.partiallyPaid;

  const billed = summary.totalBilledAmount;
  const collected = summary.collectedAmount;
  const pending = summary.pendingAmount;
  const rate = billed > 0 ? (collected / billed) * 100 : 0;

  const learnerData = BUCKETS.map((b) => ({ key: b.key, label: b.label, color: b.color, Icon: b.Icon, count: learners[b.key] }));
  const termData = terms.map((t) => ({ name: `Term ${t.term_no}`, collected: t.collected, pending: t.pending }));

  if (billed <= 0 && learners.totalLearners === 0) {
    return <EmptyState message={`No transport billing ${scope} yet.`} />;
  }

  return (
    <div className="space-y-6">
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
        {/* Collection progress (part-to-whole: collected + pending = billed) */}
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

        {/* Learner payment status (distinct learners; status scale) */}
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
          table={<VizTable head={['Status', 'Learners']} rows={learnerData.map((d) => [d.label, num(d.count)])} />}
        />
      </div>

      {/* Per-term breakdown — distinct learners split + money, counts in the table twin */}
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
