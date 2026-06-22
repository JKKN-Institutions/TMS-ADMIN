'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { fetchTransportYear } from '../transport-year-api';
import { statusBadge, currentBadge } from '../columns';

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Transport Years', href: '/transport-years' },
  { label: name },
];

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTs = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : '—');

export default function TransportYearDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15: params is a Promise
  // Same query key as the edit page → React Query serves it from cache on nav.
  const { data: year, isLoading, isError } = useQuery({
    queryKey: ['transport-year', id],
    queryFn: () => fetchTransportYear(id),
  });

  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setCanManage(['super_admin', 'transport_manager'].includes(JSON.parse(u).role));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/transport-years" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !year) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/transport-years" title="Transport year not found" />
        <p className="text-gray-600">
          This transport year could not be loaded.{' '}
          <Link href="/transport-years" className="text-green-600 hover:underline">
            Back to transport years
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(year.name)}
        backHref="/transport-years"
        title={year.name}
        subtitle="Transport year"
        actions={
          canManage ? (
            <Link
              href={`/transport-years/${year.id}/edit`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : null
        }
      />

      <SectionCard title="Year">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={year.name} />
          <Field label="Starts" value={fmtDate(year.start_date)} />
          <Field label="Ends" value={fmtDate(year.end_date)} />
          <Field label="Status" value={statusBadge(year.is_active)} />
          <Field label="Current" value={year.is_current ? currentBadge : 'No'} />
        </div>
      </SectionCard>

      <SectionCard title="Record">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Created" value={fmtTs(year.created_at)} />
          <Field label="Updated" value={fmtTs(year.updated_at)} />
        </div>
      </SectionCard>
    </div>
  );
}
