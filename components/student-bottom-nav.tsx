'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MoreHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { studentNavigation, type StudentNavItem } from '@/lib/student/navigation';

// Quick-access destinations for the primary bar, in priority order. The first 4
// become the bar shortcuts; everything (including these) is listed in the "More"
// sheet under "All Menus". Falls back to the first live items if a priority href
// is missing.
const PRIMARY_HREFS = [
  '/student/dashboard',
  '/student/routes',
  '/student/pass',
  '/student/attendance',
];

/**
 * Mobile-only bottom navigation for the student portal (lg:hidden). Replaces the
 * slide-in sidebar on small screens: 4 quick items + a "More" bottom sheet that
 * lists every destination in a 3-column icon grid. Mirrors the admin BottomNav
 * (components/bottom-nav.tsx) so the two shells stay visually in lock-step, but
 * is driven by the flat studentNavigation list instead of the permissioned admin
 * menu. Pages flagged `comingSoon` render disabled.
 */
export default function StudentBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const go = (href: string) => {
    router.push(href);
    setMoreOpen(false);
  };

  const byHref = new Map(studentNavigation.map((i) => [i.href, i]));

  // Build the primary 4: priority hrefs first, then fill from remaining live items.
  const primary: StudentNavItem[] = [];
  for (const href of PRIMARY_HREFS) {
    const item = byHref.get(href);
    if (item && !item.comingSoon && !primary.includes(item)) primary.push(item);
    if (primary.length === 4) break;
  }
  if (primary.length < 4) {
    for (const item of studentNavigation) {
      if (item.comingSoon || primary.includes(item)) continue;
      primary.push(item);
      if (primary.length === 4) break;
    }
  }

  // "More" is highlighted when the current page isn't one of the primary shortcuts.
  const moreActive = !primary.some((p) => isActive(p.href));

  return (
    <>
      {/* "More" bottom sheet — full menu in a 3-column icon grid. */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            key="more"
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />
            <motion.div
              className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-hidden rounded-t-3xl border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">All Menus</h2>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[calc(80vh_-_3.25rem)] overflow-y-auto px-4 py-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
                <div className="grid grid-cols-3 gap-2">
                  {studentNavigation.map((item) => {
                    const Icon = item.icon;

                    // Not-yet-built pages render as a disabled tile with a "Soon" tag.
                    if (item.comingSoon) {
                      return (
                        <div
                          key={item.href}
                          className="flex cursor-not-allowed flex-col items-center gap-1.5 rounded-xl border border-gray-200 p-3 text-center opacity-50 dark:border-gray-800"
                        >
                          <Icon className="h-5 w-5 text-gray-400" />
                          <span className="line-clamp-2 text-[11px] font-medium leading-tight text-gray-400">
                            {item.name}
                          </span>
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                            Soon
                          </span>
                        </div>
                      );
                    }

                    const active = isActive(item.href);
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => go(item.href)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                          active
                            ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-500/40 dark:bg-green-500/15 dark:text-green-300'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/60'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="line-clamp-2 text-[11px] font-medium leading-tight">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary bar — 4 shortcuts + More. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-gray-800 dark:bg-gray-900">
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

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            {moreActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-green-600" />}
            <MoreHorizontal className={`h-5 w-5 ${moreActive ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'}`} />
            <span
              className={`text-[10px] leading-none ${
                moreActive ? 'font-semibold text-green-600' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
