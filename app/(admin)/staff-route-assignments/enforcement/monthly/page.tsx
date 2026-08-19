'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getVerdictColumns, OUTCOME_LABEL, type VerdictRow } from './columns';

async function fetchVerdicts(month: string): Promise<VerdictRow[]> {
  const res = await fetch(`/api/admin/incharge-month-verdict?month=${month}`, {
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load verdicts');
  return json.data as VerdictRow[];
}

export default function MonthlyVerdictPage() {
  // Default to the current month in IST. The board is read-only, so an
  // approximate month boundary here costs nothing.
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['incharge-month-verdict', month],
    queryFn: () => fetchVerdicts(month),
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load monthly verdicts');
  }, [isError]);

  const rows = useMemo(() => data ?? [], [data]);

  const markPaid = async (row: VerdictRow) => {
    // The verdict row names the person, not the bill, so the bill ids are
    // fetched at click time rather than carried in every row of the table.
    const res = await fetch(`/api/admin/staff-bills/by-person/${encodeURIComponent(row.staff_email)}/mark-paid`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Failed to record the payment');
      return;
    }
    toast.success('Payment recorded');
    // Invalidate the DERIVED key too, or the row keeps its stale bill state.
    qc.invalidateQueries({ queryKey: ['incharge-month-verdict', month] });
    qc.invalidateQueries({ queryKey: ['incharge-strikes'] });
  };

  // Recomputed whenever `month` changes, since markPaid is re-created fresh
  // on every render and closes over the CURRENT `month` for cache invalidation
  // -- without this dep the button could invalidate a stale month's query key.
  const columns = useMemo(() => getVerdictColumns(markPaid), [month]);

  const passed = rows.filter((r) => r.outcome === 'passed').length;
  const failed = rows.filter((r) => r.outcome === 'failed').length;

  const filters = useMemo(
    () => [
      {
        columnId: 'outcome',
        title: 'Outcome',
        options: (['passed', 'failed'] as const).map((s) => ({
          label: OUTCOME_LABEL[s],
          value: s,
        })),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">Monthly attendance verdict</h1>
        <p className="text-sm text-muted-foreground">
          At month end, a route marked on every service day cancels its in-charges&rsquo;
          transport fee bills. A single missed service day makes the bill payable and
          removes the role.{' '}
          <Link href="/staff-route-assignments/enforcement" className="underline">
            Daily strikes
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="month" className="text-sm font-medium">Month</label>
        <input
          id="month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UniversalStatCard title="Passed — bill cancelled" value={passed} icon={CheckCircle2} color="green" />
        <UniversalStatCard title="Failed — bill payable" value={failed} icon={XCircle} color="red" />
      </div>

      <div className="min-w-0 overflow-x-auto">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          globalSearch
          searchPlaceholder="Search staff…"
          filters={filters}
          entityName="verdicts"
        />
      </div>
    </div>
  );
}
