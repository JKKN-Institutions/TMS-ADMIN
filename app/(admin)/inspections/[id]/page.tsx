'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import { BusCard } from '@/components/inspections/bus-card';
import { OUTCOME_META } from '@/lib/inspections/outcome-meta';
import { headcountDelta } from '@/lib/inspections/overview';
import { LEG_NAME } from '@/lib/boarding/attendance-window';
import { fmtIST } from '@/lib/inspections/format';
import { fetchInspection } from '../inspection-api';

const RESULT = {
  pass: ['PASS', 'bg-green-600'], pass_with_issues: ['PASS WITH ISSUES', 'bg-amber-500'], fail: ['FAIL', 'bg-red-600'],
} as const;
const ITEM = { pass: 'text-green-700 dark:text-green-400', fail: 'text-red-700 dark:text-red-400 font-semibold', na: 'text-gray-500 dark:text-gray-400' } as const;

export default function InspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['inspection', id], queryFn: () => fetchInspection(id) });
  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />;
  if (!data) return <p className="text-red-600 dark:text-red-400">Inspection not found. <Link href="/inspections" className="underline">Back</Link></p>;

  const failed = data.items.filter((i) => i.result === 'fail');
  const { riders, learnerChecks } = data;
  const delta = riders.leg && riders.headcount != null && riders.boarded != null ? headcountDelta(riders.headcount, riders.boarded) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <DetailPageHeader
        crumbs={[{ label: 'Bus Inspection', href: '/inspections' }, { label: data.vehicle.registration }]}
        backHref="/inspections"
        title={`Inspection — ${data.vehicle.registration}`}
        subtitle={`${data.submittedAt ? new Date(data.submittedAt).toLocaleString('en-IN') : 'Draft'} · by ${data.inspectorName ?? '—'}`}
        actions={data.result ? <span className={`rounded-lg px-3 py-1.5 text-sm font-bold text-white ${RESULT[data.result][1]}`}>{RESULT[data.result][0]}</span>
          : <Link href={`/inspections/${id}/check`} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white">Continue draft</Link>}
      />
      {isError && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <span className="min-w-0">Couldn&apos;t refresh — showing last loaded data</span>
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">Retry</button>
        </p>
      )}
      <BusCard detail={data} />
      <SectionCard title="Riders at inspection">
        {riders.leg && riders.headcount != null ? (
          <div className="space-y-1 text-sm">
            <p>
              <b>{LEG_NAME[riders.leg]}</b>: counted {riders.headcount} · boarded {riders.boarded ?? '—'} · booked {riders.booked ?? '—'}
            </p>
            {delta && (
              <p className={delta.diff === 0 ? 'text-green-700 dark:text-green-400' : 'font-medium text-amber-700 dark:text-amber-400'}>{delta.label}</p>
            )}
            {riders.headcount != null && riders.boarded == null && (
              <p className="text-gray-500 dark:text-gray-400">No route on record, so there was no boarded count to compare</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Headcount not taken</p>
            {riders.leg && (riders.boarded != null || riders.booked != null) && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {LEG_NAME[riders.leg]}: boarded {riders.boarded ?? '—'} · booked {riders.booked ?? '—'}
              </p>
            )}
          </div>
        )}
      </SectionCard>
      <SectionCard title={`Learner ID checks (${learnerChecks.length})`}>
        {learnerChecks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No ID cards were checked</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {learnerChecks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{c.name ?? 'Unknown learner'}</span>
                  {c.roll && <span className="text-gray-500 dark:text-gray-400"> · {c.roll}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_META[c.outcome].chip}`}>{OUTCOME_META[c.outcome].label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{fmtIST(c.scannedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {failed.length > 0 && (
        <SectionCard title={`Failed items (${failed.length})`}>
          <ul className="space-y-3">
            {failed.map((i) => (
              <li key={i.id}>
                <p className="font-medium text-red-700 dark:text-red-400">{i.label}{i.severity === 'critical' ? ' — critical' : ''}</p>
                {i.note && <p className="text-sm">{i.note}</p>}
                <div className="mt-1 flex gap-2">{i.photoUrls.map((u, k) => u && <a key={k} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-20 w-20 rounded object-cover" /></a>)}</div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      <SectionCard title="All checklist items">
        <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
          {data.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">{i.label}</span>
              <span className={i.result ? ITEM[i.result] : 'text-gray-400 dark:text-gray-500'}>{i.result ? i.result.toUpperCase() : '—'}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
      {data.notes && <SectionCard title="Remarks"><p className="whitespace-pre-wrap text-sm">{data.notes}</p></SectionCard>}
    </div>
  );
}
