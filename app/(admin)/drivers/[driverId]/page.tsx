'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil, UserCheck, UserCog, UserX } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { usePermissions } from '@/hooks/use-permissions';
import { STATUS_LABEL, displayStatus } from '@/lib/drivers/status-rule';
import { DriverPageHeader, SectionCard, Field } from '../driver-page-header';
import { DriverStatusBadge } from '../driver-status-badge';
import { DriverStatusDialog } from '../driver-status-dialog';

async function fetchDriver(id: string): Promise<DriverListItem> {
  const res = await fetch(`/api/admin/drivers/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load driver');
  return json.data as DriverListItem;
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
  const [statusOpen, setStatusOpen] = useState(false);

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
  const person = driver.person;
  const status = displayStatus(driver);
  const address = person.address || ops?.address || '';
  const emergencyName = person.emergencyContactName || ops?.emergencyContactName || '';
  const emergencyPhone = person.emergencyContactPhone || ops?.emergencyContactPhone || '';
  const emergency = emergencyName
    ? `${emergencyName}${person.emergencyContactRelationship ? ` (${person.emergencyContactRelationship})` : ''} · ${emergencyPhone || '—'}`
    : '';

  return (
    <div className="space-y-6">
      <DriverPageHeader
        crumbs={crumbs(driver.name)}
        title={driver.name}
        subtitle={driver.designation || 'Driver'}
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              {driver.canFullEdit && (
                <button
                  type="button"
                  onClick={() => setStatusOpen(true)}
                  className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {status === 'inactive' ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                  {status === 'inactive' ? 'Mark active' : 'Mark inactive'}
                </button>
              )}
              <Link
                href={`/drivers/${driver.id}/edit`}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </div>
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
              <DriverStatusBadge status={status} />
            </div>
            <p className="break-words text-sm text-gray-500">{driver.designation || '—'}</p>
            <p className="break-words text-sm text-gray-500">{driver.email || '—'}</p>
          </div>
        </div>
      </div>

      <SectionCard title="Staff">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Staff ID" value={person.staffCode} />
          <Field label="Email" value={driver.email} />
          <Field label="Institution email" value={person.institutionEmail} />
          <Field label="Phone" value={driver.phone} />
          <Field label="Gender" value={person.gender ? person.gender.charAt(0).toUpperCase() + person.gender.slice(1) : ''} />
          <Field label="Date of birth" value={person.dateOfBirth ? person.dateOfBirth.slice(0, 10) : ''} />
          <Field label="Marital status" value={person.maritalStatus ? person.maritalStatus.charAt(0).toUpperCase() + person.maritalStatus.slice(1) : ''} />
          <Field label="Blood group" value={person.bloodGroup} />
          <Field label="Address" value={address} />
          <Field label="State" value={person.state} />
          <Field label="District" value={person.district} />
          <Field label="PIN code" value={person.pincode} />
          <Field label="Emergency contact" value={emergency} />
          <Field label="Employment Type" value={driver.employmentType ? driver.employmentType.replace(/_/g, ' ') : ''} />
          <Field label="Date of Joining" value={driver.dateOfJoining} />
          <Field label="Status" value={STATUS_LABEL[status]} />
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
            <Field label="Total Trips" value={ops.totalTrips} />
            <Field label="Rating" value={ops.rating} />
            <Field label="Aadhar No." value={ops.aadharNumber} />
            <Field label="Medical Cert. Expiry" value={ops.medicalCertificateExpiry} />
            <Field label="Location Sharing" value={ops.locationSharingEnabled ? 'Enabled' : 'Disabled'} />
            <Field
              label="Assigned Route(s)"
              value={driver.routes.length ? driver.routes.map((r) => r.label).join(', ') : '—'}
            />
            <Field label="Notes" value={ops.notes} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <UserCog className="h-4 w-4 text-gray-400" />
            No operational details recorded yet.
          </div>
        )}
      </SectionCard>

      <DriverStatusDialog driver={statusOpen ? driver : null} open={statusOpen} onOpenChange={setStatusOpen} />
    </div>
  );
}
