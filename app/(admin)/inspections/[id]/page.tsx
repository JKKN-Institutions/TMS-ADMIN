'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import { BusCard } from '@/components/inspections/bus-card';
import { fetchInspection } from '../inspection-api';

const RESULT = {
  pass: ['PASS', 'bg-green-600'], pass_with_issues: ['PASS WITH ISSUES', 'bg-amber-500'], fail: ['FAIL', 'bg-red-600'],
} as const;
const ITEM = { pass: 'text-green-700 dark:text-green-400', fail: 'text-red-700 dark:text-red-400 font-semibold', na: 'text-gray-500 dark:text-gray-400' } as const;

export default function InspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({ queryKey: ['inspection', id], queryFn: () => fetchInspection(id) });
  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />;
  if (isError || !data) return <p className="text-red-600 dark:text-red-400">Inspection not found. <Link href="/inspections" className="underline">Back</Link></p>;

  const failed = data.items.filter((i) => i.result === 'fail');
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
      <BusCard detail={data} />
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
