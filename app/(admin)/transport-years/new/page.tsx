'use client';

import { DetailPageHeader } from '@/components/ui/detail-view';
import { TransportYearForm } from '../transport-year-form';

export default function NewTransportYearPage() {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Transport Years', href: '/transport-years' },
          { label: 'Add Transport Year' },
        ]}
        backHref="/transport-years"
        title="Add Transport Year"
        subtitle="Define a new academic year period for transport"
      />
      <TransportYearForm mode="create" />
    </div>
  );
}
