'use client';

import { DetailPageHeader } from '@/components/ui/detail-view';
import VehicleForm from '../vehicle-form';

const crumbs = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Vehicles', href: '/vehicles' },
  { label: 'Add Vehicle' },
];

export default function NewVehiclePage() {
  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs}
        backHref="/vehicles"
        title="Add Vehicle"
        subtitle="Register a new vehicle in the transport fleet"
      />
      <VehicleForm mode="create" />
    </div>
  );
}
