'use client';

import { DetailPageHeader } from '@/components/ui/detail-view';
import { DriverMobileForm } from '../driver-mobile-form';

export default function NewDriverMobilePage() {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Driver Mobiles', href: '/driver-mobiles' },
          { label: 'Add Mobile' },
        ]}
        backHref="/driver-mobiles"
        title="Add Driver Mobile"
        subtitle="Record a phone supplied to a driver"
      />
      <DriverMobileForm mode="create" />
    </div>
  );
}
