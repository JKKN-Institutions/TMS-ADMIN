'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { fetchDriverMobile } from '../driver-mobile-api';
import { statusBadge } from '../columns';

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Tracking Mobiles', href: '/driver-mobiles' },
  { label: name },
];

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTs = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : '—');
const money = (n: number | null | undefined) => (n != null ? `₹ ${Number(n).toLocaleString('en-IN')}` : '—');
const or = (s: string | null | undefined) => (s && String(s).trim() ? s : '—');

export default function DriverMobileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15/16: params is a Promise
  const { data: m, isLoading, isError } = useQuery({
    queryKey: ['driver-mobile', id],
    queryFn: () => fetchDriverMobile(id),
  });

  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setCanManage(['super_admin', 'transport_manager'].includes(JSON.parse(u).role));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/driver-mobiles" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !m) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/driver-mobiles" title="Tracking mobile not found" />
        <p className="text-gray-600">
          This mobile could not be loaded.{' '}
          <Link href="/driver-mobiles" className="text-green-600 hover:underline">Back to tracking mobiles</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(`${m.brand} ${m.model}`)}
        backHref="/driver-mobiles"
        title={`${m.brand} ${m.model}`}
        subtitle="Tracking mobile"
        actions={
          canManage ? (
            <Link
              href={`/driver-mobiles/${m.id}/edit`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          ) : null
        }
      />

      <SectionCard title="Supply">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Driver" value={or(m.driver_name)} />
          <Field label="Driver phone" value={or(m.driver_phone)} />
          <Field label="Status" value={statusBadge(m.status)} />
          <Field label="Supplied date" value={fmtDate(m.supplied_date)} />
          <Field label="Bus route" value={m.route_number ? `${m.route_number}${m.route_name ? ` — ${m.route_name}` : ''}` : '—'} />
        </div>
      </SectionCard>

      <SectionCard title="Handover">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Handover by" value={or(m.handover_by)} />
          <Field label="Handover date" value={fmtDate(m.handover_date)} />
          <Field
            label="Photos"
            value={
              (() => {
                const urls = (m.image_urls ?? []).filter((u): u is string => !!u);
                if (!urls.length) return <span className="text-gray-400">No photos</span>;
                return (
                  <div className="flex flex-wrap gap-3">
                    {urls.map((url, i) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={i === 0 ? 'Cover handover photo' : `Handover photo ${i + 1}`}
                          className="h-32 w-32 rounded border border-gray-200 object-cover dark:border-gray-700"
                        />
                      </a>
                    ))}
                  </div>
                );
              })()
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Device">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Brand" value={or(m.brand)} />
          <Field label="Model" value={or(m.model)} />
          <Field label="Color" value={or(m.color)} />
          <Field label="IMEI" value={or(m.imei)} />
          <Field label="Condition" value={or(m.condition)} />
          <Field label="Storage" value={or(m.storage_capacity)} />
          <Field label="Serial number" value={or(m.serial_number)} />
          <Field label="Accessories" value={or(m.accessories)} />
        </div>
      </SectionCard>

      <SectionCard title="SIM & number">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Phone number" value={or(m.phone_number)} />
          <Field label="SIM number" value={or(m.sim_number)} />
          <Field label="Network provider" value={or(m.network_provider)} />
        </div>
      </SectionCard>

      <SectionCard title="Procurement">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Purchase date" value={fmtDate(m.purchase_date)} />
          <Field label="Purchase cost" value={money(m.purchase_cost)} />
          <Field label="Warranty expiry" value={fmtDate(m.warranty_expiry)} />
          <Field label="Supplier" value={or(m.supplier_name)} />
          <Field label="Invoice number" value={or(m.invoice_number)} />
        </div>
      </SectionCard>

      <SectionCard title="Notes & record">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Notes" value={or(m.notes)} />
          <Field label="Created" value={fmtTs(m.created_at)} />
          <Field label="Updated" value={fmtTs(m.updated_at)} />
        </div>
      </SectionCard>
    </div>
  );
}
