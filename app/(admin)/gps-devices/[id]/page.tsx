'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { fetchGpsDevice } from '../device-api';
import { useGpsRole } from '../use-gps-role';

function relHeartbeat(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff} minutes ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)} hours ago`;
  return `${Math.floor(diff / 1440)} days ago`;
}

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'GPS Devices', href: '/gps-devices' },
  { label: name },
];

export default function GpsDeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { canManage } = useGpsRole();
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

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—');

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(device.device_name)}
        backHref="/gps-devices"
        title={device.device_name}
        subtitle={device.device_model || 'GPS Device'}
        actions={
          canManage ? (
            <Link
              href={`/gps-devices/${device.id}/edit`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : null
        }
      />

      <SectionCard title="Device">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Device ID" value={<span className="font-mono">{device.device_id}</span>} />
          <Field label="Device Name" value={device.device_name} />
          <Field label="Model" value={device.device_model} />
          <Field label="Status" value={<span className="capitalize">{device.status || '—'}</span>} />
          <Field label="SIM Number" value={device.sim_number ? <span className="font-mono">{device.sim_number}</span> : null} />
          <Field label="IMEI" value={device.imei ? <span className="font-mono">{device.imei}</span> : null} />
          <Field label="Notes" value={device.notes} />
        </div>
      </SectionCard>

      <SectionCard title="Telemetry">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Battery" value={device.battery_level != null ? `${device.battery_level}%` : null} />
          <Field label="Signal" value={device.signal_strength != null ? `${device.signal_strength}%` : null} />
          <Field label="Last Heartbeat" value={relHeartbeat(device.last_heartbeat)} />
          <Field label="Created" value={fmt(device.created_at)} />
          <Field label="Updated" value={fmt(device.updated_at)} />
        </div>
      </SectionCard>
    </div>
  );
}
