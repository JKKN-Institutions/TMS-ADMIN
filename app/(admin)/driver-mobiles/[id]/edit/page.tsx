'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { fetchDriverMobile } from '../../driver-mobile-api';
import { DriverMobileForm } from '../../driver-mobile-form';

export default function EditDriverMobilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15/16: params is a Promise
  const { data: m, isLoading, isError } = useQuery({
    queryKey: ['driver-mobile', id],
    queryFn: () => fetchDriverMobile(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader
          crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tracking Mobiles', href: '/driver-mobiles' }, { label: 'Edit' }]}
          backHref="/driver-mobiles"
          title="Loading…"
          subtitle="Fetching mobile"
        />
        <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !m) {
    return (
      <div className="space-y-6">
        <DetailPageHeader
          crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tracking Mobiles', href: '/driver-mobiles' }, { label: 'Not found' }]}
          backHref="/driver-mobiles"
          title="Tracking mobile not found"
          subtitle="It may have been deleted"
        />
        <Link href="/driver-mobiles" className="text-sm font-medium text-green-600 hover:underline">Back to tracking mobiles</Link>
      </div>
    );
  }

  const d = (s?: string | null) => (s ? String(s).split('T')[0] : '');

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Tracking Mobiles', href: '/driver-mobiles' },
          { label: `${m.brand} ${m.model}`, href: `/driver-mobiles/${m.id}` },
          { label: 'Edit' },
        ]}
        backHref={`/driver-mobiles/${m.id}`}
        title={`Edit ${m.brand} ${m.model}`}
        subtitle="Update mobile details"
      />
      <DriverMobileForm
        mode="edit"
        driverMobileId={m.id}
        initial={{
          driver_staff_id: m.driver_staff_id ?? '',
          route_id: m.route_id ?? '',
          brand: m.brand ?? '',
          model: m.model ?? '',
          color: m.color ?? '',
          imei: m.imei ?? '',
          status: m.status,
          supplied_date: d(m.supplied_date),
          sim_number: m.sim_number ?? '',
          phone_number: m.phone_number ?? '',
          network_provider: m.network_provider ?? '',
          purchase_date: d(m.purchase_date),
          purchase_cost: m.purchase_cost != null ? String(m.purchase_cost) : '',
          supplier_name: m.supplier_name ?? '',
          invoice_number: m.invoice_number ?? '',
          warranty_expiry: d(m.warranty_expiry),
          condition: m.condition ?? '',
          storage_capacity: m.storage_capacity ?? '',
          serial_number: m.serial_number ?? '',
          accessories: m.accessories ?? '',
          notes: m.notes ?? '',
          handover_by: m.handover_by ?? '',
          handover_date: d(m.handover_date),
          image_path: m.image_path ?? '',
        }}
      />
    </div>
  );
}
