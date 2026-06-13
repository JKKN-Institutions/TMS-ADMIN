'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { fetchFeeStructure } from '../../fee-api';
import { FeeStructureForm } from '../../fee-structure-form';

export default function EditFeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15: params is a Promise
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fee-structure', id],
    queryFn: () => fetchFeeStructure(id),
  });

  const crumbs = (last: string, nameHref?: string) => [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Fees', href: '/fees' },
    ...(nameHref ? [{ label: data?.name ?? '', href: nameHref }] : []),
    { label: last },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Edit')} backHref="/fees" title="Loading…" subtitle="Fetching fee structure" />
        <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/fees" title="Fee structure not found" subtitle="It may have been deleted" />
        <Link href="/fees" className="text-sm font-medium text-green-600 hover:underline">Back to fees</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs('Edit', `/fees/${data.id}`)}
        backHref={`/fees/${data.id}`}
        title={`Edit ${data.name}`}
        subtitle="Update fee structure details and terms"
      />
      <FeeStructureForm
        mode="edit"
        feeId={data.id}
        initial={{
          name: data.name ?? '',
          transport_year_id: data.transport_year_id ?? '',
          audience: data.audience,
          status: data.status,
          institution_id: data.institution_id ?? '',
          degree_id: data.degree_id ?? '',
          department_id: data.department_id ?? '',
          programme_id: data.programme_id ?? '',
          semester_id: data.semester_id ?? '',
          quota_id: data.quota_id ?? '',
          staff_role_keys: data.staff_role_keys ?? [],
          total_amount: data.total_amount != null ? String(data.total_amount) : '',
          notes: data.notes ?? '',
          terms: (data.terms ?? []).map((t) => ({
            term_label: t.term_label ?? `Term ${t.term_no}`,
            amount: String(t.amount),
            due_date: t.due_date ? String(t.due_date).split('T')[0] : '',
          })),
        }}
      />
    </div>
  );
}
