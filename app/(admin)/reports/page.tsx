'use client';

/**
 * Transport reports — a date range and a trip, read four ways: bus by bus,
 * by institution, by department, and learner by learner (one row per learner
 * per service day).
 *
 * The three summaries are small and load whole. The learner list is paged on
 * the SERVER (a week is ~12,000 rows), and every download is built on the
 * server too, so the Excel file holds everything the filters match rather
 * than the page on screen.
 */

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Bus, CalendarCheck, CalendarRange, ChevronLeft, ChevronRight, Download, IndianRupee, Moon, Sun,
  UserCheck, UserX, Users,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import type { GroupSummaryRow, LearnerReportRow, RouteSummaryRow } from '@/lib/reports/types';
import {
  defaultFilters, istDate, pageInfo, rangeProblem, reportUrl, rupees, shiftDays, totalsOf,
  type ReportFilters, type ReportTab,
} from '@/lib/reports/view';
import {
  ATT_TABLE_CSS, AttendanceBanner, BAR_BUTTON, ControlBar, KpiTile, SectionPanel,
} from '../attendance/attendance-ui';
import { getBusColumns, getGroupColumns, getLearnerColumns } from './columns';

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'buses', label: 'Bus-wise' },
  { id: 'institutions', label: 'Institution-wise' },
  { id: 'departments', label: 'Department-wise' },
  { id: 'learners', label: 'Learner-wise' },
];

const LEARNER_PAGE = 100;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.success) throw new Error(result?.error || 'Failed to load the report');
  return result.data as T;
}

/** Fetches the server-built Excel file and hands it to the browser to save. */
async function download(url: string) {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) {
    const result = await res.json().catch(() => null);
    throw new Error(result?.error || 'Download failed');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'transport-report.xlsx';
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

const niceDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function ReportsPage() {
  const today = istDate();
  const [filters, setFilters] = useState<ReportFilters>(() => defaultFilters(today));
  const [tab, setTab] = useState<ReportTab>('buses');
  const [offset, setOffset] = useState(0);
  const [downloading, setDownloading] = useState(false);

  // Any filter change sends the learner list back to its first page.
  const update = (patch: Partial<ReportFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
  };

  const problem = rangeProblem(filters.from, filters.to);
  const ready = !problem;
  const { from, to, direction, routeId } = filters;

  // Every bus for the range, whichever bus is picked: it feeds the bus
  // dropdown as well as the table, so the dropdown never shrinks to one entry.
  const buses = useQuery({
    queryKey: ['reports', 'buses', from, to, direction],
    queryFn: () => getJson<{ rows: RouteSummaryRow[] }>(reportUrl('buses', filters, { allBuses: true })),
    enabled: ready,
  });

  const groupTab = tab === 'institutions' || tab === 'departments';
  const groups = useQuery({
    queryKey: ['reports', tab, from, to, direction, routeId],
    queryFn: () => getJson<{ rows: GroupSummaryRow[] }>(reportUrl(tab, filters)),
    enabled: ready && groupTab,
  });

  const learners = useQuery({
    queryKey: ['reports', 'learners', filters, offset],
    queryFn: () =>
      getJson<{ rows: LearnerReportRow[]; total: number }>(
        reportUrl('learners', filters, { limit: LEARNER_PAGE, offset }),
      ),
    enabled: ready && tab === 'learners',
    // Keep the old page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  // Memoised: an inline `?? []` is a new array each render (see DataTable).
  const allBuses = useMemo(() => buses.data?.rows ?? [], [buses.data]);
  const busRows = useMemo(
    () => (routeId ? allBuses.filter((r) => r.route_id === routeId) : allBuses),
    [allBuses, routeId],
  );
  const groupRows = useMemo(() => groups.data?.rows ?? [], [groups.data]);
  const learnerRows = useMemo(() => learners.data?.rows ?? [], [learners.data]);

  const busOptions = useMemo(
    () =>
      [...allBuses].sort((a, b) =>
        (a.route_number ?? '').localeCompare(b.route_number ?? '', undefined, { numeric: true }),
      ),
    [allBuses],
  );

  const busColumns = useMemo(() => getBusColumns(), []);
  const groupColumns = useMemo(
    () => getGroupColumns(tab === 'departments' ? 'department' : 'institution'),
    [tab],
  );
  const learnerColumns = useMemo(() => getLearnerColumns(), []);

  const t = buses.data ? totalsOf(busRows) : null;
  const dash = !t ? '—' : undefined;
  const tripName = direction === 'return' ? 'Evening' : 'Morning';
  const rangeText = from === to ? niceDate(from) : `${niceDate(from)} to ${niceDate(to)}`;
  const picked = routeId ? allBuses.find((r) => r.route_id === routeId) : null;
  const scope = picked ? `bus ${picked.route_number ?? ''}`.trim() : 'all buses';

  const pager = pageInfo(learners.data?.total ?? 0, LEARNER_PAGE, offset);

  const active = tab === 'buses' ? buses : groupTab ? groups : learners;
  const nothingToDownload =
    !ready || active.isError ||
    (tab === 'buses' ? busRows.length === 0 : groupTab ? groupRows.length === 0 : (learners.data?.total ?? 0) === 0);

  const onDownload = async () => {
    setDownloading(true);
    try {
      await download(reportUrl(tab, filters, { format: 'xlsx' }));
      toast.success('Report downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const setRange = (f: string, tt: string) => update({ from: f, to: tt });

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: ATT_TABLE_CSS }} />

      <AttendanceBanner
        title="Transport reports"
        description="Bookings, boarding and fees for any range of days: by bus, by institution, by department, or learner by learner. Attendance % is learners who booked and boarded, out of those who booked."
        chip={{ icon: direction === 'return' ? Moon : Sun, label: `${tripName} trip`, value: rangeText }}
      />

      {/* KPI tiles: totals of the buses shown */}
      {ready && !buses.isError && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <KpiTile tone="blue" icon={Users} label="Learners" value={dash ?? t!.learners.toLocaleString('en-IN')}
            sub={t ? `on ${t.buses} ${t.buses === 1 ? 'bus' : 'buses'}` : undefined} />
          <KpiTile tone="violet" icon={CalendarCheck} label="Bookings" value={dash ?? t!.booked.toLocaleString('en-IN')}
            sub="seats booked in the range" />
          <KpiTile tone="green" icon={UserCheck} label="Boarded" value={dash ?? t!.boarded.toLocaleString('en-IN')}
            sub={t ? (t.attendancePct === null ? 'nothing was booked' : `${t.attendancePct}% of bookings`) : undefined}
            title="Booked and boarded. Learners who boarded without a booking are counted separately." />
          <KpiTile tone="red" icon={UserX} label="No show" value={dash ?? t!.noShow.toLocaleString('en-IN')}
            sub="booked but did not board" />
          <KpiTile tone="orange" icon={Bus} label="Without booking" value={dash ?? t!.withoutBooking.toLocaleString('en-IN')}
            sub="boarded with no booking" />
          <KpiTile tone="teal" icon={IndianRupee} label="Amount owed" value={dash ?? rupees(t!.amountOwed)}
            sub={t ? `${t.feesUnpaid} ${t.feesUnpaid === 1 ? 'learner' : 'learners'} unpaid, as of today` : undefined}
            title="Fee position today, not on the days in the range." />
        </div>
      )}

      {/* Range, trip, bus */}
      <ControlBar>
        <CalendarRange className="ml-1 hidden h-5 w-5 text-green-600 sm:block" aria-hidden="true" />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          From
          <input type="date" value={from} max={today} className="input block" aria-label="From date"
            onChange={(e) => e.target.value && update({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          To
          <input type="date" value={to} max={today} className="input block" aria-label="To date"
            onChange={(e) => e.target.value && update({ to: e.target.value })} />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={`${BAR_BUTTON} px-3 text-sm font-medium`} onClick={() => setRange(today, today)}>
            Today
          </button>
          <button type="button" className={`${BAR_BUTTON} px-3 text-sm font-medium`} onClick={() => setRange(shiftDays(today, -6), today)}>
            7 days
          </button>
          <button type="button" className={`${BAR_BUTTON} px-3 text-sm font-medium`} onClick={() => setRange(`${today.slice(0, 8)}01`, today)}>
            This month
          </button>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Trip">
          {(['onward', 'return'] as const).map((d) => {
            const on = direction === d;
            const Icon = d === 'return' ? Moon : Sun;
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => update({ direction: d })}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on ? 'bg-green-600 text-white shadow-[0_2px_6px_-2px_rgba(22,163,74,0.6)]' : 'text-gray-600 hover:text-gray-900'
                }`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {d === 'return' ? 'Evening' : 'Morning'}
              </button>
            );
          })}
        </div>
        <select className="input block max-w-[16rem]" aria-label="Bus" value={routeId ?? ''}
          onChange={(e) => update({ routeId: e.target.value || null })}>
          <option value="">All buses</option>
          {busOptions.map((r) => (
            <option key={r.route_id} value={r.route_id}>
              {`${r.route_number ?? '—'} ${r.route_name ?? ''}`.trim()}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <button type="button" onClick={onDownload} disabled={downloading || nothingToDownload}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="Downloads everything the filters match, not only the rows on screen">
            <Download className="h-4 w-4" aria-hidden="true" />
            {downloading ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </ControlBar>

      {problem && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">{problem}</p>
      )}

      {/* Which report */}
      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Report views">
        {TABS.map((x) => {
          const on = tab === x.id;
          return (
            <button key={x.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => setTab(x.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                on ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {x.label}
            </button>
          );
        })}
      </nav>

      {/* An error must not fall through to zeros: "0 boarded" is a different and false claim. */}
      {ready && active.isError && (
        <p className="rounded-xl border border-border p-6 text-sm text-foreground">
          Could not load this report{active.error instanceof Error ? `: ${active.error.message}` : ''}. Figures are
          not shown rather than shown as zero.
        </p>
      )}

      {ready && tab === 'buses' && !buses.isError && (
        <SectionPanel title="Bus-wise report" note={`${rangeText} · ${tripName} trip · ${scope}`} table centred>
          <DataTable columns={busColumns} data={busRows} getRowId={(r) => r.route_id} entityName="buses"
            isLoading={buses.isLoading} pageSize={25} searchPlaceholder="Search bus…"
            emptyMessage="No buses to show for this range." />
        </SectionPanel>
      )}

      {ready && groupTab && !groups.isError && (
        <SectionPanel
          title={tab === 'departments' ? 'Department-wise report' : 'Institution-wise report'}
          note={`${rangeText} · ${tripName} trip · ${scope}`} table centred
        >
          <DataTable columns={groupColumns} data={groupRows}
            getRowId={(r, i) => `${r.group_id ?? 'none'}-${i}`}
            entityName={tab === 'departments' ? 'departments' : 'institutions'}
            isLoading={groups.isLoading} pageSize={25}
            searchPlaceholder={tab === 'departments' ? 'Search department…' : 'Search institution…'}
            emptyMessage="Nothing to show for this range." />
        </SectionPanel>
      )}

      {ready && tab === 'learners' && !learners.isError && (
        <SectionPanel
          title="Learner-wise report"
          note={`${rangeText} · ${tripName} trip · ${scope} · one row per learner per day`}
          table
        >
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label="Booked" value={filters.booked} onChange={(v) => update({ booked: v })}
              options={[['yes', 'Booked'], ['no', 'Not booked']]} />
            <FilterSelect label="Attendance" value={filters.attendance} onChange={(v) => update({ attendance: v })}
              options={[['present', 'Boarded'], ['absent', 'Absent'], ['unmarked', 'Not marked']]} />
            <FilterSelect label="Fee" value={filters.fee} onChange={(v) => update({ fee: v })}
              options={[['paid', 'Paid'], ['unpaid', 'Unpaid'], ['none', 'No bill yet']]} />
            {(filters.booked || filters.attendance || filters.fee) && (
              <button type="button" className="text-sm font-medium text-green-700 hover:underline dark:text-green-400"
                onClick={() => update({ booked: null, attendance: null, fee: null })}>
                Clear filters
              </button>
            )}
          </div>

          <DataTable columns={learnerColumns} data={learnerRows}
            getRowId={(r) => `${r.learner_id}-${r.day}`} entityName="rows on this page"
            isLoading={learners.isLoading} pageSize={LEARNER_PAGE} globalSearch={false}
            initialColumnVisibility={{ department: false, stop: false }}
            emptyMessage="No learners match these filters." />

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {learners.data
                ? `Rows ${pager.first.toLocaleString('en-IN')} to ${pager.last.toLocaleString('en-IN')} of ${learners.data.total.toLocaleString('en-IN')}`
                : 'Loading…'}
              {learners.isFetching && learners.data ? ' · loading…' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className={`${BAR_BUTTON} gap-1 px-3 text-sm font-medium`} disabled={!pager.hasPrev}
                onClick={() => setOffset(Math.max(0, offset - LEARNER_PAGE))}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
              </button>
              <span className="tabular-nums text-foreground">Page {pager.page} of {pager.pages}</span>
              <button type="button" className={`${BAR_BUTTON} gap-1 px-3 text-sm font-medium`} disabled={!pager.hasNext}
                onClick={() => setOffset(offset + LEARNER_PAGE)}>
                Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </SectionPanel>
      )}
    </div>
  );
}

function FilterSelect<T extends string>({
  label, value, onChange, options,
}: {
  label: string;
  value: T | null;
  onChange: (v: T | null) => void;
  options: [T, string][];
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {label}
      <select className="input block" value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as T | null)}>
        <option value="">All</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </label>
  );
}
