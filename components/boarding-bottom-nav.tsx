'use client';

import { usePathname, useRouter } from 'next/navigation';
import { boardingNavigation } from '@/lib/boarding/navigation';

/**
 * Mobile-only bottom navigation for the boarding-staff portal (lg:hidden).
 * Replaces the sidebar on small screens. Mirrors the student/admin bottom bars
 * but, since boarding has only five destinations, every item fits in the bar —
 * no "More" sheet needed.
 */
export default function BoardingBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-stretch justify-around">
        {boardingNavigation.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
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
      </div>
    </nav>
  );
}
