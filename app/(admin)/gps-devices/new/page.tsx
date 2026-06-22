'use client';

import { DetailPageHeader } from '@/components/ui/detail-view';
import { GpsDeviceForm } from '../device-form';

export default function NewGpsDevicePage() {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'GPS Devices', href: '/gps-devices' },
          { label: 'Add Device' },
        ]}
        backHref="/gps-devices"
        title="Add GPS Device"
        subtitle="Register a new GPS tracking device"
      />
      <GpsDeviceForm mode="create" />
    </div>
  );
}
