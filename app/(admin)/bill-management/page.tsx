'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { Download, IndianRupee, Wallet, Clock, AlertTriangle, Users, FileX, Loader2 } from 'lucide-react';
import { SelectMenu } from '@/components/ui/select-menu';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import { getBillColumns, inr } from './columns';
import { getUnbilledColumns } from './unbilled-columns';
import { exportBills } from './bill-export';
import { fetchBills, fetchUnbilled, fetchTransportYearOptions } from './bill-management-api';
import { fetchFines, cancelFine } from './fines-api';
import { getFineColumns } from './fine-columns';
import type { FineRow } from '@/lib/fines/list';
import { summarizeBills, type TransportBillRow } from '@/lib/fees/bills';
import { FineDialog } from './fine-dialog';

type View = 'bills' | 'unbilled' | 'analytics' | 'fines';

const TYPE_FILTER: DataTableFilter = {
  columnId: 'type',
  title: 'Type',
  options: [
    { label: 'Learner', value: 'learner' },
    { label: 'Staff', value: 'staff' },
  ],
};

// recharts (~390 KB) is heavy — load the analytics view as its own lazy chunk so
// Bills/Unbilled never ship it. ssr:false: it renders client-only from cached rows.
const BillAnalytics = dynamic(() => import('./bill-analytics'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-green-600" />
    </div>
  ),
});

export default function BillManagementPage() {
  const qc = useQueryClient();
  const [selectedYear, setSelectedYear] = useState('');
  const [view, setView] = useState<View>('bills');
  // Non-null while the Generate Fine dialog is open, holding the ticked bill rows.
  const [fineRows, setFineRows] = useState<TransportBillRow[] | null>(null);
  // Non-null while the waive panel is open, holding the fine being waived.
  const [cancelTarget, setCancelTarget] = useState<FineRow | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiving, setWaiving] = useState(false);

  const { data: years = [] } = useQuery({
    queryKey: ['transport-year-options'],
    queryFn: fetchTransportYearOptions,
  });

  // Default to the most recent year once the list loads.
  useEffect(() => {
    if (!selectedYear && years.length) setSelectedYear(years[0].id);
  }, [years, selectedYear]);

  const isAll = selectedYear === 'all';
  // Unbilled and Fines need a specific year — never stay on them for "All years".
  useEffect(() => {
    if (isAll && (view === 'unbilled' || view === 'fines')) setView('bills');
  }, [isAll, view]);

  const yearOptions = useMemo(
    () => [{ value: 'all', label: 'All years' }, ...years.map((y) => ({ value: y.id, label: y.name }))],
    [years]
  );
  const yearLabel = years.find((y) => y.id === selectedYear)?.name;

  const { data: bills, isLoading: billsLoading, isError: billsError } = useQuery({
    queryKey: ['bill-management', selectedYear],
    queryFn: () => fetchBills(selectedYear),
    enabled: !!selectedYear,
  });

  const { data: unbilled, isLoading: unbilledLoading } = useQuery({
    queryKey: ['bill-management-unbilled', selectedYear],
    queryFn: () => fetchUnbilled(selectedYear),
    enabled: !!selectedYear && !isAll && view === 'unbilled',
  });

  const { data: fines, isLoading: finesLoading } = useQuery({
    queryKey: ['fines', selectedYear],
    queryFn: () => fetchFines(selectedYear),
    enabled: !!selectedYear && !isAll && view === 'fines',
  });

  const billColumns = useMemo(() => getBillColumns(), []);
  const fineColumns = useMemo(() => getFineColumns(true, (row) => setCancelTarget(row)), []);
  const unbilledColumns = useMemo(() => getUnbilledColumns(), []);

  const rows = useMemo(() => bills?.rows ?? [], [bills]);

  // Rows surviving the table's search + Institution/Status/Type filters. null
  // until the table reports, and reset whenever the view or year changes so a
  // stale selection from the Bills tab can never colour another tab's totals.
  const [filtered, setFiltered] = useState<{ rows: TransportBillRow[]; isFiltered: boolean } | null>(null);
  useEffect(() => { setFiltered(null); }, [view, selectedYear]);

  const onFilteredRowsChange = useCallback(
    (r: TransportBillRow[], isFiltered: boolean) => setFiltered({ rows: r, isFiltered }),
    [],
  );

  const visibleRows = filtered?.rows ?? rows;
  const isFiltered = filtered?.isFiltered ?? false;

  // Recomputed from what the user can actually see, so the cards agree with the
  // table beneath them. Uses the SAME summarizeBills the server calls, so an
  // unfiltered view reproduces the server's numbers exactly rather than
  // approximating them. unbilledCount is year-level and not derivable from rows,
  // so it stays the server's — and is blanked in the UI while a filter is on.
  const summary = useMemo(
    () => (bills ? { ...summarizeBills(visibleRows), unbilledCount: bills.summary.unbilledCount } : undefined),
    [bills, visibleRows],
  );

  const billInstitutionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.institution_name) s.add(r.institution_name);
    return [...s].sort().map((n) => ({ label: n, value: n }));
  }, [rows]);

  // Derived from the loaded rows so the dropdown never offers a department that
  // has no bills in the selected year. Staff rows carry a department too, so this
  // narrows both populations.
  const billDepartmentOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.department_name) s.add(r.department_name);
    return [...s].sort().map((n) => ({ label: n, value: n }));
  }, [rows]);

  const unbilledInstitutionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of unbilled?.people ?? []) if (p.institution_name) s.add(p.institution_name);
    return [...s].sort().map((n) => ({ label: n, value: n }));
  }, [unbilled]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm text-gray-600 dark:text-gray-300">
          Transport billing across all fee structures — what&apos;s billed, collected, pending, overdue and still unbilled.
        </p>
        <div className="w-full sm:w-64">
          <SelectMenu
            value={selectedYear}
            onValueChange={setSelectedYear}
            options={yearOptions}
            placeholder="Select transport year…"
            ariaLabel="Transport year"
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Billed" value={inr(summary?.totalBilledAmount)} icon={<IndianRupee className="h-4 w-4 text-gray-400" />} loading={billsLoading} />
        <Kpi label="Collected" value={inr(summary?.collectedAmount)} icon={<Wallet className="h-4 w-4 text-green-500" />} loading={billsLoading} />
        <Kpi label="Pending" value={inr(summary?.pendingAmount)} icon={<Clock className="h-4 w-4 text-amber-500" />} loading={billsLoading} />
        <Kpi label="Overdue" value={inr(summary?.overdueAmount)} sub={`${summary?.overdueCount ?? 0} bill(s)`} icon={<AlertTriangle className="h-4 w-4 text-red-500" />} loading={billsLoading} />
        <Kpi
          label="Unbilled"
          // Unbilled counts people who have NO bill, so it cannot be narrowed by
          // filters that act on bill rows. Blanked rather than left showing a
          // year-wide number beside four filtered ones.
          value={isAll || isFiltered ? '—' : String(summary?.unbilledCount ?? 0)}
          icon={<FileX className="h-4 w-4 text-blue-500" />}
          loading={billsLoading}
          onClick={!isAll && !isFiltered ? () => setView('unbilled') : undefined}
        />
        <Kpi label="Staff deferred" value={String(summary?.staffDeferred ?? 0)} icon={<Users className="h-4 w-4 text-purple-500" />} loading={billsLoading} />
      </div>

      {/* View toggle */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
        <ToggleBtn active={view === 'bills'} onClick={() => setView('bills')}>
          Bills
        </ToggleBtn>
        <ToggleBtn active={view === 'unbilled'} onClick={() => setView('unbilled')} disabled={isAll}>
          Unbilled{!isAll && summary ? ` (${summary.unbilledCount})` : ''}
        </ToggleBtn>
        <ToggleBtn active={view === 'fines'} onClick={() => setView('fines')} disabled={isAll}>
          Fines{fines ? ` (${fines.summary.count})` : ''}
        </ToggleBtn>
        <ToggleBtn active={view === 'analytics'} onClick={() => setView('analytics')}>
          Analytics
        </ToggleBtn>
      </div>

      {/* Fine money is reported separately: it lives outside tms_fee_bill, so
          folding it into the fee tiles above would silently change them. */}
      {view === 'fines' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label="Fines raised" value={inr(fines?.summary.raised)} loading={finesLoading} />
          <Kpi label="Fines collected" value={inr(fines?.summary.collected)} loading={finesLoading} />
          <Kpi label="Fines outstanding" value={inr(fines?.summary.outstanding)} loading={finesLoading} />
        </div>
      )}

      {!selectedYear ? (
        <EmptyMsg>Select a transport year to view billing.</EmptyMsg>
      ) : view === 'fines' ? (
        <DataTable
          columns={fineColumns}
          data={fines?.rows ?? []}
          entityName="fines"
          isLoading={finesLoading}
          getRowId={(r) => r.id}
          searchPlaceholder="Search learner, code or reason..."
        />
      ) : view === 'analytics' ? (
        billsError ? (
          <EmptyMsg>Couldn&apos;t load billing data. Please try again.</EmptyMsg>
        ) : billsLoading || !summary ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : (
          <BillAnalytics rows={rows} summary={summary} yearLabel={isAll ? undefined : yearLabel} />
        )
      ) : view === 'bills' ? (
        <DataTable
          columns={billColumns}
          data={rows}
          entityName="bills"
          isLoading={billsLoading}
          getRowId={(r) => r.id}
          enableRowSelection
          onFilteredRowsChange={onFilteredRowsChange}
          searchPlaceholder="Search person, code or institution..."
          filters={[
            ...(billInstitutionOptions.length
              ? [{ columnId: 'institution', title: 'Institution', options: billInstitutionOptions }]
              : []),
            ...(billDepartmentOptions.length
              ? [{ columnId: 'department', title: 'Department', options: billDepartmentOptions }]
              : []),
            {
              columnId: 'status',
              title: 'Status',
              options: [
                { label: 'Paid', value: 'paid' },
                { label: 'Partially paid', value: 'partially_paid' },
                { label: 'Unpaid', value: 'unpaid' },
                { label: 'Overdue', value: 'overdue' },
                { label: 'Staff deferred', value: 'staff_deferred' },
                { label: 'Cancelled', value: 'cancelled' },
              ],
            },
            TYPE_FILTER,
          ]}
          toolbarActions={({ selectedRows }) => (
            <div className="flex items-center gap-2">
              {/* Fining needs a specific year: the fine sheet is per transport year. */}
              <button
                type="button"
                onClick={() => setFineRows(selectedRows)}
                disabled={selectedRows.length === 0 || isAll}
                title={isAll ? 'Select a specific transport year to fine' : undefined}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                Generate Fine{selectedRows.length ? ` (${selectedRows.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => exportBills(selectedRows.length ? selectedRows : rows, yearLabel)}
                disabled={rows.length === 0}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Download className="h-4 w-4" />
                Export{selectedRows.length ? ` (${selectedRows.length})` : ''}
              </button>
            </div>
          )}
        />
      ) : (
        <DataTable
          columns={unbilledColumns}
          data={unbilled?.people ?? []}
          entityName="people"
          isLoading={unbilledLoading}
          getRowId={(p) => p.person_id}
          searchPlaceholder="Search person, code or institution..."
          filters={[
            ...(unbilledInstitutionOptions.length
              ? [{ columnId: 'institution', title: 'Institution', options: unbilledInstitutionOptions }]
              : []),
            TYPE_FILTER,
          ]}
        />
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Waive {inr(cancelTarget.fine_amount)} fine — {cancelTarget.person_name}?
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              The bill is cancelled, not deleted. The learner stops owing it immediately.
            </p>
            <input
              type="text"
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              placeholder="Reason for waiving"
              className="mt-3 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setWaiveReason('');
                }}
                className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Keep
              </button>
              <button
                type="button"
                disabled={waiving || waiveReason.trim() === ''}
                onClick={async () => {
                  setWaiving(true);
                  try {
                    await cancelFine(cancelTarget.id, waiveReason.trim());
                    toast.success('Fine waived.');
                    setCancelTarget(null);
                    setWaiveReason('');
                    await qc.invalidateQueries({ queryKey: ['fines', selectedYear] });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Could not waive the fine');
                  } finally {
                    setWaiving(false);
                  }
                }}
                className="h-10 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Waive
              </button>
            </div>
          </div>
        </div>
      )}

      <FineDialog
        open={fineRows !== null}
        year={selectedYear}
        selectedRows={fineRows ?? []}
        onClose={() => setFineRows(null)}
        onDone={() => {
          void qc.invalidateQueries({ queryKey: ['fines', selectedYear] });
        }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  loading,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      {loading ? (
        <div className="mt-2 h-6 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      ) : (
        <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</div>
      )}
      {sub && !loading && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </>
  );
  const cls =
    'rounded-xl border border-gray-200 bg-white p-4 text-left dark:border-gray-700 dark:bg-gray-900';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-colors hover:border-green-300 hover:bg-green-50/40 dark:hover:bg-green-500/5`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function ToggleBtn({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-green-600 text-white'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyMsg({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900">
      {children}
    </div>
  );
}
