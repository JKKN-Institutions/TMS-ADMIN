'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ListChecks, ShieldAlert } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import StrikesPanel from './strikes-panel';
import CoveragePanel from './coverage-panel';

type TabId = 'strikes' | 'coverage';

/**
 * In-charge attendance enforcement.
 *
 * Two tabs over the same subject: Strikes is the running tally the nightly job
 * writes, Coverage is the as-of-a-date view of routes whose attendance has no
 * owner. Coverage used to be its own /incharge-coverage page; it moved here
 * because a strike is only fair once you can see whether anyone actually held
 * that share, and /incharge-coverage now redirects to this tab.
 *
 * The tab lives in `?tab=` so the two boards are linkable and survive a reload,
 * matching the Settings page pattern rather than the unused Radix tabs.tsx.
 */
export default function InchargeEnforcementPage() {
  const { can, isSuperAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabId>('strikes');

  // Coverage reads /api/admin/incharge-coverage, which requires ATTENDANCE_VIEW
  // — a DIFFERENT key from the DRIVERS_ASSIGN that opens this page. Hiding the
  // tab keeps a reachable-but-403 tab off the screen for people who hold one key
  // and not the other; the API stays the real gate.
  const canSeeCoverage = isSuperAdmin || can(TMS_PERMISSIONS.ATTENDANCE_VIEW);

  const tabs = useMemo(
    () =>
      [
        { id: 'strikes' as const, name: 'Strikes', icon: ShieldAlert, show: true },
        { id: 'coverage' as const, name: 'Coverage', icon: ListChecks, show: canSeeCoverage },
      ].filter((t) => t.show),
    [canSeeCoverage],
  );

  // Deep links: ?tab=coverage. Also the landing spot for the /incharge-coverage
  // redirect, so an old bookmark opens on the board it used to point at.
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam === 'coverage' || tabParam === 'strikes') setActiveTab(tabParam);
  }, []);

  // Permissions resolve after mount, so a ?tab=coverage deep link from someone
  // without ATTENDANCE_VIEW would otherwise leave a tab selected that no longer
  // has a button. Fall back rather than render an empty board.
  useEffect(() => {
    if (activeTab === 'coverage' && !canSeeCoverage) setActiveTab('strikes');
  }, [activeTab, canSeeCoverage]);

  const selectTab = (id: TabId) => {
    setActiveTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState(null, '', url.toString());
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">In-charge attendance enforcement</h1>
        <p className="text-sm text-muted-foreground">
          Bus in-charges hold a transport fee exemption in exchange for marking their route each travel
          day. Marking on any weekday clears the route&rsquo;s streak for every in-charge on it.{' '}
          <Link href="/staff-route-assignments/enforcement/monthly" className="underline">
            Monthly verdict board
          </Link>
        </p>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-2 overflow-x-auto" aria-label="Enforcement boards">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'strikes' ? <StrikesPanel /> : <CoveragePanel />}
    </div>
  );
}
