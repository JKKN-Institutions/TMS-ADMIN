'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Generic in-module detail/edit page header: breadcrumb + optional back button +
 * title + optional right-side actions. Styled to match the app's list pages
 * (gray-900 text, gray-200 borders, white cards). Shared across feature modules
 * (routes, drivers, …) so detail/edit pages stay visually consistent.
 */
export function DetailPageHeader({
  crumbs,
  backHref,
  title,
  subtitle,
  actions,
}: {
  crumbs: Crumb[];
  backHref?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
            {c.href ? (
              <Link href={c.href} className="transition-colors hover:text-gray-900">
                {c.label}
              </Link>
            ) : (
              <span className="font-medium text-gray-900">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              aria-label="Back"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-gray-600">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A bordered white section with a titled header. */
export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/** A read-only label/value pair for detail views. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{empty ? '—' : value}</p>
    </div>
  );
}
