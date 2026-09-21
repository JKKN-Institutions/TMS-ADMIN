'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { BusScanner } from '@/components/inspections/bus-scanner';
import { fetchDashboard, resolveSticker, startInspection, currentPosition } from '../inspection-api';

export default function ScanBusPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const { data } = useQuery({ queryKey: ['inspections', 'dashboard'], queryFn: fetchDashboard });

  async function open(vehicleId: string) {
    setBusy(true);
    try {
      const pos = await currentPosition();
      const { inspectionId, resumed } = await startInspection(vehicleId, pos);
      if (resumed) toast('Resuming the open inspection for this bus');
      router.push(`/inspections/${inspectionId}/check`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function onCode(code: string) {
    if (busy) return;
    setBusy(true);
    try { const bus = await resolveSticker(code); await open(bus.vehicleId); }
    catch (e) { toast.error((e as Error).message); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <DetailPageHeader
        crumbs={[{ label: 'Bus Inspection', href: '/inspections' }, { label: 'Scan' }]}
        backHref="/inspections" title="Scan bus sticker" subtitle="Point the camera at the QR sticker inside the bus"
      />
      <BusScanner onCode={onCode} paused={busy} />
      {busy && <p className="text-center text-sm text-gray-500">Opening inspection…</p>}
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <p className="mb-2 text-sm font-medium">Sticker missing or damaged? Pick the bus:</p>
        <div className="flex gap-2">
          <select value={manual} onChange={(e) => setManual(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
            <option value="">Select bus…</option>
            {data?.buses.map((b) => <option key={b.vehicleId} value={b.vehicleId}>{b.registration}{b.routeLabel ? ` — ${b.routeLabel}` : ''}</option>)}
          </select>
          <button disabled={!manual || busy} onClick={() => open(manual)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Inspect</button>
        </div>
      </div>
    </div>
  );
}
