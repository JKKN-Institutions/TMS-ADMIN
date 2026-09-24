'use client';

import { use } from 'react';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { RouteCheckScreen } from '@/components/route-check/check-screen';

/** An inspection run from the admin panel: the staff app's check screen inside the admin layout. */
export default function AdminRunCheckPage({ params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = use(params);
  return (
    <div className="min-w-0 space-y-4">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Bus Inspection', href: '/inspections?tab=start' },
          { label: 'Inspection' },
        ]}
        backHref="/inspections?tab=start"
        title="Inspection"
        subtitle="Scan each rider's ID card, then Finish to submit."
      />
      <RouteCheckScreen checkId={checkId} embedded />
    </div>
  );
}
