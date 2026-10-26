'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { derivePageTitle } from '@/lib/navigation';

/**
 * The one title block for admin list pages. The top header already shows the
 * breadcrumb (group › page), so this renders the single page title, a
 * plain-language description, and the page's actions on the right.
 *
 * `title` defaults to the page's sidebar name, so the heading can never drift
 * into a second name for the same page ("Vehicles" vs "Vehicles Management").
 * Write descriptions for an admin, not a developer: no column or table names.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const heading = title ?? derivePageTitle(pathname ?? '');
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{heading}</h1>
        {description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
