'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { boardingNavigation, type BoardingNavItem } from '@/lib/boarding/navigation';

/**
 * Mobile-only bottom navigation for the boarding-staff portal (lg:hidden).
 * Replaces the sidebar on small screens. Shows four primary destinations
 * (Dashboard, Passengers, Scan, Attendance) plus a three-dot "More" menu that
 * holds the rest (My Route, Live Location, Grievances, Notifications), so the bar
 * stays legible instead of cramming every item. The desktop sidebar still lists
 * everything from `boardingNavigation`.
 */
const PRIMARY_HREFS = [
  '/boarding/dashboard',
  '/boarding/passengers',
  '/boarding/scan',
  '/boarding/attendance',
];

export default function BoardingBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const byHref = new Map(boardingNavigation.map((i) => [i.href, i] as const));
  const primary = PRIMARY_HREFS.map((h) => byHref.get(h)).filter((i): i is BoardingNavItem => !!i);
  const overflow = boardingNavigation.filter((i) => !PRIMARY_HREFS.includes(i.href));
  const moreActive = overflow.some((i) => isActive(i.href));

  const go = (href: string) => {
    setMoreOpen(false);
    router.push(href);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-gray-800 dark:bg-gray-900">
      {/* "More" sheet + tap-outside backdrop */}
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-30 cursor-default bg-black/20"
          />
          <div className="absolute bottom-full right-2 z-40 mb-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
            <ul className="py-1">
              {overflow.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => go(item.href)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm ${
                        active
                          ? 'bg-green-50 font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-300'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/60'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className={`h-5 w-5 ${active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
                      {item.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <div className="flex items-stretch justify-around">
        {primary.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => go(item.href)}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
              aria-current={active ? 'page' : undefined}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-green-600" />}
              <Icon className={`h-5 w-5 ${active ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'}`} />
              <span
                className={`max-w-full truncate text-[10px] leading-none ${
                  active ? 'font-semibold text-green-600' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {item.shortName ?? item.name}
              </span>
            </button>
          );
        })}

        {/* More — reveals the overflow destinations */}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-current={moreActive && !moreOpen ? 'page' : undefined}
        >
          {moreActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-green-600" />}
          <MoreHorizontal
            className={`h-5 w-5 ${moreActive || moreOpen ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'}`}
          />
          <span
            className={`max-w-full truncate text-[10px] leading-none ${
              moreActive || moreOpen ? 'font-semibold text-green-600' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            More
          </span>
        </button>
      </div>
    </nav>
  );
}
