'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { fetchTransportYear } from '../../transport-year-api';
import { TransportYearForm } from '../../transport-year-form';

export default function EditTransportYearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15: params is a Promise
  const { data: year, isLoading, isError } = useQuery({
    queryKey: ['transport-year', id],
    queryFn: () => fetchTransportYear(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader
          crumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Transport Years', href: '/transport-years' },
            { label: 'Edit' },
          ]}
          backHref="/transport-years"
          title="Loading…"
          subtitle="Fetching transport year"
        />
        <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !year) {
    return (
      <div className="space-y-6">
        <DetailPageHeader
          crumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Transport Years', href: '/transport-years' },
            { label: 'Not found' },
          ]}
          backHref="/transport-years"
          title="Transport year not found"
          subtitle="It may have been deleted"
        />
        <Link href="/transport-years" className="text-sm font-medium text-green-600 hover:underline">
          Back to transport years
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Transport Years', href: '/transport-years' },
          { label: year.name, href: `/transport-years/${year.id}` },
          { label: 'Edit' },
        ]}
        backHref={`/transport-years/${year.id}`}
        title={`Edit ${year.name}`}
        subtitle="Update transport year details"
      />
      <TransportYearForm
        mode="edit"
        transportYearId={year.id}
        initial={{
          name: year.name ?? '',
          start_date: year.start_date ? String(year.start_date).split('T')[0] : '',
          end_date: year.end_date ? String(year.end_date).split('T')[0] : '',
          is_active: year.is_active,
          is_current: year.is_current,
        }}
      />
    </div>
  );
}
