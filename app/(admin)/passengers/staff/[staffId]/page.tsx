'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { StaffPassenger } from '@/lib/passengers/types';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';

async function fetchStaff(id: string): Promise<StaffPassenger> {
  // Mirror the list page: bypass any stale cache/SW entry and always send the
  // session cookie, and never let a non-JSON/dev-compile response throw blankly.
  let res: Response;
  try {
    res = await fetch(`/api/admin/passengers/staff/${id}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (e) {
    throw new Error(`Could not reach the staff API: ${(e as Error).message}`);
  }

  let json: { success?: boolean; error?: string; data?: StaffPassenger };
  try {
    json = await res.json();
  } catch {
    throw new Error(`Staff API returned a non-JSON response (HTTP ${res.status}).`);
  }

  if (!res.ok || !json.success) {
    throw new Error(`${json.error || 'Failed to load staff'} (HTTP ${res.status})`);
  }
  return json.data as StaffPassenger;
}

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Staff', href: '/passengers/staff' },
  { label: name },
];

export default function StaffDetailPage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = use(params);
  const { data: staff, isLoading, isError } = useQuery({
    queryKey: ['passenger-staff', staffId],
    queryFn: () => fetchStaff(staffId),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/passengers/staff" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !staff) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/passengers/staff" title="Staff not found" />
        <p className="text-gray-600">
          This staff member could not be loaded.{' '}
          <Link href="/passengers/staff" className="text-green-600 hover:underline">
            Back to staff
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(staff.name)}
        backHref="/passengers/staff"
        title={staff.name}
        subtitle={staff.designation || 'Staff'}
      />

      <SectionCard title="Staff">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Staff ID" value={staff.staffId} />
          <Field label="Designation" value={staff.designation} />
          <Field label="Email" value={staff.email} />
          <Field label="Phone" value={staff.phone} />
          <Field label="Institution" value={staff.institutionName} />
          <Field label="Department" value={staff.departmentName} />
          <Field label="Active" value={staff.isActive ? 'Active' : 'Inactive'} />
          <Field label="Status" value={staff.status} />
        </div>
      </SectionCard>

      <SectionCard title="Transport">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Bus Required" value="Yes" />
          <Field label="Assigned Route" value={staff.routeLabel} />
          <Field label="Boarding Stop" value={staff.stopLabel} />
          <Field label="Assignment" value={staff.assigned ? 'Assigned' : 'Unassigned'} />
        </div>
      </SectionCard>
    </div>
  );
}
