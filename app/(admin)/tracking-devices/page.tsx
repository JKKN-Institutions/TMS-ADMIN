'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Navigation, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { GpsDevicesPanel } from '../gps-devices/gps-devices-panel';
import { DriverMobilesPanel } from '../driver-mobiles/driver-mobiles-panel';

/**
 * One home for the two ways a bus reports its position: fitted GPS devices and
 * phones supplied to drivers. Was two sidebar pages. Each tab keeps its own
 * permission; the tab is in the URL (?tab=gps|mobiles).
 */
function TrackingDevicesView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can, isSuperAdmin, isLoading } = usePermissions();
  const tabs = [
    { id: 'gps', label: 'GPS devices', icon: Navigation, allowed: isSuperAdmin || can(TMS_PERMISSIONS.TRACKING_VIEW) },
    { id: 'mobiles', label: 'Tracking mobiles', icon: Smartphone, allowed: isSuperAdmin || can(TMS_PERMISSIONS.DRIVER_MOBILES_VIEW) },
  ].filter((t) => t.allowed);
  const requested = params?.get('tab');
  const active = tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id;

  return (
    <div className="space-y-6">
      <PageHeader description="GPS devices fitted to buses and phones supplied to drivers for live tracking." />

      {!isLoading && tabs.length === 0 ? (
        <p className="text-sm text-gray-500">You don&apos;t have access to tracking devices.</p>
      ) : (
        <>
          <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={active === t.id}
                onClick={() => router.replace(`${pathname}?tab=${t.id}`)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  active === t.id
                    ? 'border-green-600 text-green-700 dark:text-green-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
          {active === 'gps' && <GpsDevicesPanel />}
          {active === 'mobiles' && <DriverMobilesPanel />}
        </>
      )}
    </div>
  );
}

export default function TrackingDevicesPage() {
  return (
    <Suspense fallback={null}>
      <TrackingDevicesView />
    </Suspense>
  );
}
