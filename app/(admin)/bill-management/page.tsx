'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, IndianRupee, Wallet, Clock, AlertTriangle, Users, FileX } from 'lucide-react';
import { SelectMenu } from '@/components/ui/select-menu';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import { getBillColumns, inr } from './columns';
import { getUnbilledColumns } from './unbilled-columns';
import { exportBills } from './bill-export';
import { fetchBills, fetchUnbilled, fetchTransportYearOptions } from './bill-management-api';

type View = 'bills' | 'unbilled';

const TYPE_FILTER: DataTableFilter = {
  columnId: 'type',
  title: 'Type',
  options: [
    { label: 'Learner', value: 'learner' },
    { label: 'Staff', value: 'staff' },
  ],
};

export default function BillManagementPage() {
  const [selectedYear, setSelectedYear] = useState('');
  const [view, setView] = useState<View>('bills');

  const { data: years = [] } = useQuery({
    queryKey: ['transport-year-options'],
    queryFn: fetchTransportYearOptions,
  });

  // Default to the most recent year once the list loads.
  useEffect(() => {
    if (!selectedYear && years.length) setSelectedYear(years[0].id);
  }, [years, selectedYear]);

  const isAll = selectedYear === 'all';
  // Unbilled needs a specific year — never stay on it for "All years".
  useEffect(() => {
    if (isAll && view === 'unbilled') setView('bills');
  }, [isAll, view]);

  const yearOptions = useMemo(
    () => [{ value: 'all', label: 'All years' }, ...years.map((y) => ({ value: y.id, label: y.name }))],
    [years]
  );
  const yearLabel = years.find((y) => y.id === selectedYear)?.name;

  const { data: bills, isLoading: billsLoading } = useQuery({
    queryKey: ['bill-management', selectedYear],
    queryFn: () => fetchBills(selectedYear),
    enabled: !!selectedYear,
  });

  const { data: unbilled, isLoading: unbilledLoading } = useQuery({
    queryKey: ['bill-management-unbilled', selectedYear],
    queryFn: () => fetchUnbilled(selectedYear),
    enabled: !!selectedYear && !isAll && view === 'unbilled',
  });

  const billColumns = useMemo(() => getBillColumns(), []);
  const unbilledColumns = useMemo(() => getUnbilledColumns(), []);

  const summary = bills?.summary;
  const rows = useMemo(() => bills?.rows ?? [], [bills]);

  const billInstitutionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.institution_name) s.add(r.institution_name);
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
          value={isAll ? '—' : String(summary?.unbilledCount ?? 0)}
          icon={<FileX className="h-4 w-4 text-blue-500" />}
          loading={billsLoading}
          onClick={!isAll ? () => setView('unbilled') : undefined}
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
      </div>

      {!selectedYear ? (
        <EmptyMsg>Select a transport year to view billing.</EmptyMsg>
      ) : view === 'bills' ? (
        <DataTable
          columns={billColumns}
          data={rows}
          entityName="bills"
          isLoading={billsLoading}
          getRowId={(r) => r.id}
          enableRowSelection
          searchPlaceholder="Search person, code or institution..."
          filters={[
            ...(billInstitutionOptions.length
              ? [{ columnId: 'institution', title: 'Institution', options: billInstitutionOptions }]
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
              ],
            },
            TYPE_FILTER,
          ]}
          toolbarActions={({ selectedRows }) => (
            <button
              type="button"
              onClick={() => exportBills(selectedRows.length ? selectedRows : rows, yearLabel)}
              disabled={rows.length === 0}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Download className="h-4 w-4" />
              Export{selectedRows.length ? ` (${selectedRows.length})` : ''}
            </button>
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
