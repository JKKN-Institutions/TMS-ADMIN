'use client';

import { use, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { DataTable } from '@/components/ui/data-table';
import { scannedCounts } from '@/lib/route-check/counts';
import { fetchCheck } from '../../inspection-api';
import { getCheckPeopleColumns, OUTCOME_LABEL } from './columns';

const LEG_LABEL: Record<'onward' | 'return', string> = { onward: 'Morning', return: 'Evening' };

function fmtDateTime(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Back to the tab (Checks, with its date range, or Start inspection) the report was opened from. */
function backHrefFrom(sp: { from?: string; to?: string; tab?: string }): string {
  if (sp.tab === 'start') return '/inspections?tab=start';
  const qs = new URLSearchParams({ tab: 'checks' });
  if (sp.from && DATE_RE.test(sp.from)) qs.set('from', sp.from);
  if (sp.to && DATE_RE.test(sp.to)) qs.set('to', sp.to);
  return `/inspections?${qs.toString()}`;
}

function CountGrid({ title, note, items }: { title: string; note: string; items: { label: string; value: number | null }[] }) {
  return (
    <section className="min-w-0 space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">{note}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{c.value ?? '—'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CheckReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; tab?: string }>;
}) {
  const { id } = use(params);
  const backHref = backHrefFrom(use(searchParams));
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['check', id], queryFn: () => fetchCheck(id) });
  const people = useMemo(() => data?.people ?? [], [data]);
  const columns = useMemo(() => getCheckPeopleColumns(), []);
  // Outcome filter lists only the outcomes this check actually recorded.
  const outcomeOptions = useMemo(() => {
    const seen = new Set(people.map((p) => p.outcome as string));
    return Object.entries(OUTCOME_LABEL)
      .filter(([value]) => seen.has(value))
      .map(([value, label]) => ({ label, value }));
  }, [people]);

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-sm text-red-600 dark:text-red-400">{(error as Error)?.message ?? 'Route check not found.'}</p>;
  }

  const submitted = data.status === 'submitted';
  const scanned = scannedCounts(data.people);
  const onBus = [
    { label: 'Scanned', value: scanned.checked },
    { label: 'Unpaid', value: scanned.unpaid },
    { label: 'No booking', value: scanned.noBooking },
    { label: 'Not on route', value: scanned.notOnRoute },
    { label: 'Unknown cards', value: scanned.unknownCards },
    { label: 'Fined by this check', value: submitted ? scanned.finesRaised : null },
  ];
  const wholeRoute = [
    { label: 'Registered', value: data.counts.registered },
    { label: 'Booked', value: data.counts.booked },
    { label: 'Present', value: data.counts.present },
    { label: 'Unpaid', value: data.counts.unpaid },
    { label: 'Without booking', value: data.counts.withoutBooking },
    { label: 'Not on route', value: data.counts.notOnRoute },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <DetailPageHeader
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection', href: backHref }, { label: 'Check' }]}
        backHref={backHref}
        title={`${data.route?.routeNumber ?? 'Route'} · ${data.checkDate}`}
        subtitle={`${LEG_LABEL[data.leg]} trip · ${data.bus?.registration ?? 'No bus'} · Inspector ${data.checker.name ?? data.checker.email ?? '—'} · ${
          submitted ? `Submitted ${fmtDateTime(data.submittedAt)}` : `Draft, started ${fmtDateTime(data.startedAt)} (not submitted)`
        }`}
      />

      <CountGrid title="On this bus" note="The people the inspector scanned." items={onBus} />
      <CountGrid
        title="Whole route"
        note={
          submitted
            ? 'Everyone registered on the route that day, saved at submit. Most may not have travelled; this is not what the inspector found.'
            : 'Saved when the check is submitted.'
        }
        items={wholeRoute}
      />

      <p className="text-xs text-gray-500 dark:text-gray-400">
        To cancel a fine, cancel the bill in MyJKKN with a supporting document.
      </p>

      <DataTable
        columns={columns}
        data={people}
        entityName="people"
        getRowId={(p) => p.id}
        searchPlaceholder="Search name or roll number..."
        emptyMessage="No people recorded on this check."
        filters={outcomeOptions.length > 1 ? [{ columnId: 'outcome', title: 'Outcome', options: outcomeOptions }] : []}
      />
    </div>
  );
}
