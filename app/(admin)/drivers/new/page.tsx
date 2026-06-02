'use client';

import { useState } from 'react';
import { Check, Loader2, Search, UserPlus } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { DriverPageHeader, SectionCard } from '../driver-page-header';
import DriverForm from '../driver-form';

interface StaffResult {
  id: string;
  name: string;
  designation: string;
  email: string;
  phone: string;
  isActive: boolean;
  alreadyDriver: boolean;
}

const CRUMBS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Drivers', href: '/drivers' },
  { label: 'Create Driver' },
];

export default function NewDriverPage() {
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.drivers.manage');

  const [q, setQ] = useState('');
  const [results, setResults] = useState<StaffResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<StaffResult | null>(null);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/drivers/staff-search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      setResults(json.success ? (json.data as StaffResult[]) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  if (!canManage) {
    return (
      <div className="space-y-6">
        <DriverPageHeader crumbs={CRUMBS} title="Create Driver" />
        <p className="text-gray-600">You don&apos;t have permission to create drivers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DriverPageHeader
        crumbs={CRUMBS}
        title="Create Driver"
        subtitle="Assign an existing staff member as a driver"
      />

      <SectionCard
        title="1. Select staff member"
        action={
          selected ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm font-medium text-green-600 hover:underline"
            >
              Change
            </button>
          ) : undefined
        }
      >
        {selected ? (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-500/20 dark:bg-green-500/10">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-white">
              <Check className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{selected.name}</p>
              <p className="truncate text-xs text-gray-500">
                {[selected.designation, selected.email].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={runSearch} className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search staff by name or email…"
                  className="input pl-10!"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={searching || q.trim().length < 2}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </form>

            <div className="mt-3 space-y-2">
              {searching && <p className="text-sm text-gray-500">Searching…</p>}
              {!searching && searched && results.length === 0 && (
                <p className="text-sm text-gray-500">No staff found for &ldquo;{q.trim()}&rdquo;.</p>
              )}
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-2.5 text-left transition-colors hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-500/10"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{s.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {[s.designation, s.email].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </div>
                  {s.alreadyDriver && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                      Already a driver
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      {selected ? (
        <DriverForm mode="create" staffId={selected.id} />
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500 dark:bg-white/5">
          <UserPlus className="h-4 w-4 text-gray-400" />
          Select a staff member above to enter their operational details.
        </div>
      )}
    </div>
  );
}
