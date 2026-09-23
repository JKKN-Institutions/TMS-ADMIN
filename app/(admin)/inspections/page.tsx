'use client';

import { useState } from 'react';
import Link from 'next/link';
import { QrCode } from 'lucide-react';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { InspectorsTab } from './inspectors-tab';
import { ChecksTab } from './checks-tab';

type Tab = 'inspectors' | 'checks';

export default function BusInspectionPage() {
  const [tab, setTab] = useState<Tab>('inspectors');
  return (
    <div className="min-w-0 space-y-4">
      <DetailPageHeader
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection' }]}
        title="Bus Inspection"
        subtitle="Assign inspectors to routes and review their learner checks and fines."
        actions={
          <Link
            href="/inspections/stickers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <QrCode className="h-4 w-4" />
            Bus stickers
          </Link>
        }
      />
      <div className="flex flex-wrap gap-2 border-b dark:border-gray-800">
        {(['inspectors', 'checks'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-transparent text-gray-500 dark:text-gray-400'
            }`}
          >
            {t === 'inspectors' ? 'Inspectors' : 'Checks'}
          </button>
        ))}
      </div>
      {tab === 'inspectors' ? <InspectorsTab /> : <ChecksTab />}
    </div>
  );
}
