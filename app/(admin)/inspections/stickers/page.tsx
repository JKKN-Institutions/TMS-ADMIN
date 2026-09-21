'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { stickerUrl, normalizeReg } from '@/lib/inspections/sticker-code';
import { fetchDashboard } from '../inspection-api';

export default function InspectionStickersPage() {
  const { data } = useQuery({ queryKey: ['inspections', 'dashboard'], queryFn: fetchDashboard });
  const [origin, setOrigin] = useState('');
  const [only, setOnly] = useState<string>('all');
  useEffect(() => setOrigin(window.location.origin), []);

  const buses = (data?.buses ?? []).filter((b) => only === 'all' || b.vehicleId === only);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <DetailPageHeader
          crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection', href: '/inspections' }, { label: 'Stickers' }]}
          backHref="/inspections"
          title="Bus QR stickers"
          subtitle="Stick one inside each bus near the door. Scanning opens that bus's inspection."
          actions={<>
            <select value={only} onChange={(e) => setOnly(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="all">All buses</option>
              {data?.buses.map((b) => <option key={b.vehicleId} value={b.vehicleId}>{b.registration}</option>)}
            </select>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              <Printer className="h-4 w-4" /> Print
            </button>
          </>}
        />
      </div>
      {origin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
          {buses.map((b) => (
            <div key={b.vehicleId} className="flex break-inside-avoid flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-400 bg-white p-5 text-black">
              <p className="text-xs font-semibold uppercase tracking-wide">JKKN Transport · Bus Inspection</p>
              <QRCodeSVG value={stickerUrl(origin, b.registration)} size={180} level="M" marginSize={2} />
              <p className="text-2xl font-extrabold tracking-wider">{normalizeReg(b.registration)}</p>
              <p className="text-xs">{b.routeLabel ?? ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
