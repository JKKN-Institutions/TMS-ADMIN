'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil, UserCog } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { usePermissions } from '@/hooks/use-permissions';
import { DriverPageHeader, SectionCard, Field } from '../driver-page-header';

async function fetchDriver(id: string): Promise<DriverListItem> {
  const res = await fetch(`/api/admin/drivers/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load driver');
  return json.data as DriverListItem;
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> Inactive
    </span>
  );
}

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Drivers', href: '/drivers' },
  { label: name },
];

export default function DriverViewPage({ params }: { params: Promise<{ driverId: string }> }) {
  const { driverId } = use(params);
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.drivers.manage');

  const { data: driver, isLoading, isError } = useQuery({
    queryKey: ['driver', driverId],
    queryFn: () => fetchDriver(driverId),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DriverPageHeader crumbs={crumbs('Loading…')} title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !driver) {
    return (
      <div className="space-y-6">
        <DriverPageHeader crumbs={crumbs('Not found')} title="Driver not found" />
        <p className="text-gray-600">
          This driver could not be loaded.{' '}
          <Link href="/drivers" className="text-green-600 hover:underline">Back to drivers</Link>
        </p>
      </div>
    );
  }

  const ops = driver.ops;

  return (
    <div className="space-y-6">
      <DriverPageHeader
        crumbs={crumbs(driver.name)}
        title={driver.name}
        subtitle={driver.designation || 'Driver'}
        actions={
          canManage ? (
            <Link
              href={`/drivers/${driver.id}/edit`}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : undefined
        }
      />

      {/* Profile overview */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-4">
          {driver.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={driver.avatarUrl} alt={driver.name} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-lg font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
              {driver.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">{driver.name}</h2>
              <ActiveBadge isActive={driver.isActive} />
            </div>
            <p className="break-words text-sm text-gray-500">{driver.designation || '—'}</p>
            <p className="break-words text-sm text-gray-500">{driver.email || '—'}</p>
          </div>
        </div>
      </div>

      <SectionCard title="Staff">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Email" value={driver.email} />
          <Field label="Phone" value={driver.phone} />
          <Field label="Employment Type" value={driver.employmentType ? driver.employmentType.replace(/_/g, ' ') : ''} />
          <Field label="Date of Joining" value={driver.dateOfJoining} />
          <Field label="Active" value={driver.isActive ? 'Active' : 'Inactive'} />
          <Field label="Lifecycle Status" value={driver.status} />
        </div>
      </SectionCard>

      <SectionCard
        title="Operational (TMS)"
        action={
          !ops && canManage ? (
            <Link href={`/drivers/${driver.id}/edit`} className="text-sm font-medium text-green-600 hover:underline">
              Add details
            </Link>
          ) : undefined
        }
      >
        {ops ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="License No." value={ops.licenseNumber} />
            <Field label="License Expiry" value={ops.licenseExpiry} />
            <Field label="Experience (yrs)" value={ops.experienceYears} />
            <Field label="Driver Status" value={ops.driverStatus ? ops.driverStatus.replace(/_/g, ' ') : ''} />
            <Field label="Total Trips" value={ops.totalTrips} />
            <Field label="Rating" value={ops.rating} />
            <Field
              label="Emergency Contact"
              value={ops.emergencyContactName ? `${ops.emergencyContactName} (${ops.emergencyContactPhone ?? '—'})` : ''}
            />
            <Field label="Aadhar No." value={ops.aadharNumber} />
            <Field label="Medical Cert. Expiry" value={ops.medicalCertificateExpiry} />
            <Field label="Location Sharing" value={ops.locationSharingEnabled ? 'Enabled' : 'Disabled'} />
            <Field label="Assigned Route ID" value={ops.assignedRouteId} />
            <Field label="Notes" value={ops.notes} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <UserCog className="h-4 w-4 text-gray-400" />
            No operational details recorded yet.
          </div>
        )}
      </SectionCard>
    </div>
  );
}
