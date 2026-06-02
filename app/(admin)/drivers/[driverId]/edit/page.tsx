'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { DriverListItem } from '@/types';
import { usePermissions } from '@/hooks/use-permissions';
import { DriverPageHeader, SectionCard, Field } from '../../driver-page-header';
import DriverForm from '../../driver-form';

async function fetchDriver(id: string): Promise<DriverListItem> {
  const res = await fetch(`/api/admin/drivers/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load driver');
  return json.data as DriverListItem;
}

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Drivers', href: '/drivers' },
  { label: name, href: undefined as string | undefined },
  { label: 'Edit' },
];

export default function DriverEditPage({ params }: { params: Promise<{ driverId: string }> }) {
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
        <DriverPageHeader crumbs={crumbs('Loading…')} title="Edit Driver" />
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

  // crumbs middle entry should link to the view page.
  const editCrumbs = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Drivers', href: '/drivers' },
    { label: driver.name, href: `/drivers/${driver.id}` },
    { label: 'Edit' },
  ];

  if (!canManage) {
    return (
      <div className="space-y-6">
        <DriverPageHeader crumbs={editCrumbs} backHref={`/drivers/${driver.id}`} title={`Edit Driver — ${driver.name}`} />
        <p className="text-gray-600">You don&apos;t have permission to edit drivers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DriverPageHeader
        crumbs={editCrumbs}
        backHref={`/drivers/${driver.id}`}
        title={`Edit Driver — ${driver.name}`}
        subtitle="Update TMS operational details"
      />

      <SectionCard title="Staff (read-only)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={driver.name} />
          <Field label="Email" value={driver.email} />
          <Field label="Phone" value={driver.phone} />
          <Field label="Designation" value={driver.designation} />
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Identity fields are owned by MyJKKN staff records and are not editable here.
        </p>
      </SectionCard>

      <DriverForm mode="edit" staffId={driver.id} initialOps={driver.ops} />
    </div>
  );
}
