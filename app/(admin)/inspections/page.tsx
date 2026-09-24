'use client';

import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { InspectorsTab } from './inspectors-tab';
import { ChecksTab, checksRange } from './checks-tab';

type Tab = 'inspectors' | 'checks';

// The tab and the Checks date range live in the URL, so opening a check report
// and coming back (browser Back or the report's Back link) lands on the same
// tab and range instead of resetting to Inspectors.
function BusInspectionContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab: Tab = sp.get('tab') === 'checks' ? 'checks' : 'inspectors';
  const range = checksRange(sp);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `/inspections?${qs}` : '/inspections', { scroll: false });
    },
    [router, sp]
  );

  return (
    <div className="min-w-0 space-y-4">
      <DetailPageHeader
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection' }]}
        title="Bus Inspection"
        subtitle="Assign inspectors to routes and review their learner checks and fines."
      />
      {/* No "Bus stickers" button: stickers are not in use (2026-09-24). The
          /inspections/stickers page and printed /i/<REG> links still work. */}
      <div className="flex flex-wrap gap-2 border-b dark:border-gray-800">
        {(['inspectors', 'checks'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setParams({ tab: t === 'inspectors' ? null : t })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-transparent text-gray-500 dark:text-gray-400'
            }`}
          >
            {t === 'inspectors' ? 'Inspectors' : 'Checks'}
          </button>
        ))}
      </div>
      {tab === 'inspectors' ? (
        <InspectorsTab />
      ) : (
        <ChecksTab from={range.from} to={range.to} onRangeChange={(r) => setParams({ tab: 'checks', ...r })} />
      )}
    </div>
  );
}

/** useSearchParams requires a Suspense boundary in the App Router. */
export default function BusInspectionPage() {
  return (
    <Suspense fallback={<div className="h-8 w-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />}>
      <BusInspectionContent />
    </Suspense>
  );
}
