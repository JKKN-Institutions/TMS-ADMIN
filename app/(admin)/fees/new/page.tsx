'use client';

import { DetailPageHeader } from '@/components/ui/detail-view';
import { FeeStructureForm } from '../fee-structure-form';

export default function NewFeePage() {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Maintenance Fee', href: '/fees' },
          { label: 'Add Structure' },
        ]}
        backHref="/fees"
        title="Add Maintenance Fee Structure"
        subtitle="Define a transport maintenance fee structure, its conditions and term split"
      />
      <FeeStructureForm mode="create" />
    </div>
  );
}
