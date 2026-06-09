'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { fetchGpsDevice } from '../../device-api';
import { GpsDeviceForm } from '../../device-form';

const crumbs = (name: string, id?: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'GPS Devices', href: '/gps-devices' },
  ...(id ? [{ label: name, href: `/gps-devices/${id}` }] : [{ label: name }]),
  { label: 'Edit' },
];

export default function EditGpsDevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: device, isLoading, isError } = useQuery({
    queryKey: ['gps-device', id],
    queryFn: () => fetchGpsDevice(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/gps-devices" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !device) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/gps-devices" title="GPS device not found" />
        <p className="text-gray-600">
          This GPS device could not be loaded.{' '}
          <Link href="/gps-devices" className="text-green-600 hover:underline">
            Back to GPS devices
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(device.device_name, device.id)}
        backHref={`/gps-devices/${device.id}`}
        title={`Edit ${device.device_name}`}
        subtitle="Update GPS device details"
      />
      <GpsDeviceForm
        mode="edit"
        deviceId={device.id}
        initial={{
          device_id: device.device_id,
          device_name: device.device_name,
          device_model: device.device_model ?? '',
          sim_number: device.sim_number ?? '',
          imei: device.imei ?? '',
          status: device.status ?? 'inactive',
          notes: device.notes ?? '',
        }}
      />
    </div>
  );
}
