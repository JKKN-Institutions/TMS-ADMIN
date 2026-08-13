'use client';

import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldAlert, UserMinus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getStrikeColumns, STATUS_LABEL, type StrikeRow, type StrikeStatus } from './columns';

type Mode = 'off' | 'shadow' | 'enforce';

const MODE_BANNER: Record<Mode, { text: string; className: string }> = {
  off: {
    text: 'Enforcement is OFF. The nightly job does not run, and no strikes are recorded.',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  },
  shadow: {
    text:
      'Enforcement is in SHADOW mode. The strikes below are real and accumulating, but no staff member has been ' +
      'notified, removed, or billed. Switch to Enforce in Settings → Scheduling once this board looks right.',
    className: 'bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200',
  },
  enforce: {
    text:
      'Enforcement is LIVE. Two missed travel days warn; the third removes the in-charge role and generates a transport fee bill.',
    className: 'bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-200',
  },
};

async function fetchStrikes(): Promise<{ mode: Mode; rows: StrikeRow[] }> {
  const res = await fetch('/api/admin/incharge-attendance-strikes', { credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load enforcement data');
  return json.data as { mode: Mode; rows: StrikeRow[] };
}

export default function InchargeEnforcementPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['incharge-strikes'],
    queryFn: fetchStrikes,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load enforcement data');
  }, [isError]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const mode: Mode = data?.mode ?? 'shadow';
  const columns = useMemo(() => getStrikeColumns(), []);

  const count = (s: StrikeStatus) => rows.filter((r) => r.status === s).length;
  const banner = MODE_BANNER[mode];

  const filters = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Status',
        options: (Object.keys(STATUS_LABEL) as StrikeStatus[]).map((s) => ({
          label: STATUS_LABEL[s],
          value: s,
        })),
      },
    ],
    [],
  );

  const unbillable = rows.some(
    (r) => r.status === 'pending_removal' && r.billing_status === 'no_structure',
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">In-charge attendance enforcement</h1>
        <p className="text-sm text-muted-foreground">
          Bus in-charges hold a transport fee exemption in exchange for marking their route each travel
          day. Marking on any weekday clears the route&rsquo;s streak for every in-charge on it.
        </p>
      </div>

      <div className={`rounded-md px-4 py-3 text-sm ${banner.className}`}>{banner.text}</div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UniversalStatCard title="Warning 1" value={count('warned')} icon={AlertTriangle} color="yellow" />
        <UniversalStatCard title="Final warning" value={count('final_warning')} icon={ShieldAlert} color="orange" />
        <UniversalStatCard title="Pending removal" value={count('pending_removal')} icon={UserMinus} color="red" />
        <UniversalStatCard title="Removed" value={count('removed')} icon={CheckCircle2} color="purple" />
      </div>

      {unbillable && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          Some in-charges have reached the removal threshold but cannot be billed, because no active staff
          fee structure with terms exists for the current transport year. They keep their role until you
          configure the fee terms; the job retries every night.
        </div>
      )}

      <div className="min-w-0 overflow-x-auto">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          globalSearch
          searchPlaceholder="Search staff or route…"
          filters={filters}
          entityName="in-charges"
        />
      </div>
    </div>
  );
}
