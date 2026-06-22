'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Loader2, Mail, Search, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RouteOption {
  id: string;
  route_number?: string;
  route_name?: string;
  start_location?: string;
  end_location?: string;
  status?: string;
}

// Bus-required staff from the Passenger module (/api/admin/passengers/staff).
interface StaffOption {
  id: string;
  name: string;
  email: string | null;
  designation: string | null;
  staffId: string | null;
}

const crumbs = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Staff Assignments', href: '/staff-route-assignments' },
  { label: 'Assign Route' },
];

const fieldCls = 'block text-sm';
const labelCls = 'text-gray-600';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AssignRoutePage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [staffQuery, setStaffQuery] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [routeId, setRouteId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Active routes for the dropdown (sourced from tms_route via /api/admin/routes)
  // and bus-required staff from the Passenger module for the name search.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/routes');
        const json = await res.json();
        if (active && json.success) {
          setRoutes((json.data as RouteOption[]).filter((r) => r.status === 'active'));
        }
      } catch {
        if (active) toast.error('Failed to load routes');
      }
    })();
    (async () => {
      try {
        const res = await fetch('/api/admin/passengers/staff');
        const json = await res.json();
        if (active && json.success) setStaff(json.data as StaffOption[]);
      } catch {
        /* non-fatal: manual email entry still works */
      } finally {
        if (active) setStaffLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Live name search over the passenger staff list (also matches email / staff id).
  const matches = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    if (!q) return [];
    return staff
      .filter((s) =>
        [s.name, s.email ?? '', s.staffId ?? ''].some((v) => v.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [staff, staffQuery]);

  const selectedRoute = useMemo(() => routes.find((r) => r.id === routeId) ?? null, [routes, routeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = (manualMode ? staffEmail : selectedStaff?.email ?? '').trim();
    if (!email) return toast.error(manualMode ? 'Please enter a staff email' : 'Please search and select a staff member');
    if (!EMAIL_RE.test(email)) return toast.error('Please enter a valid email address');
    if (!routeId) return toast.error('Please select a route');

    setSaving(true);
    try {
      const res = await fetch('/api/admin/staff-route-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffEmail: email, routeId, notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to assign route');

      toast.success('Route assigned successfully');
      router.push('/staff-route-assignments');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign route');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs}
        backHref="/staff-route-assignments"
        title="Assign Route to Staff"
        subtitle="Assign a staff member to a route for monitoring and management"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard title="Assignment details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={`${fieldCls} md:col-span-2`}>
              <span className={labelCls}>Staff Member *</span>
              {selectedStaff && !manualMode ? (
                <div className="mt-1 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-500/20 dark:bg-green-500/10">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                    <Check className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">{selectedStaff.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {[selectedStaff.designation, selectedStaff.email].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStaff(null);
                      setStaffQuery('');
                    }}
                    className="shrink-0 text-sm font-medium text-green-600 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : !manualMode ? (
                <>
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      className="input pl-10!"
                      value={staffQuery}
                      onChange={(e) => setStaffQuery(e.target.value)}
                      placeholder="Search staff by name…"
                    />
                  </div>
                  {staffQuery.trim() && (
                    <div className="mt-2 space-y-2">
                      {!staffLoaded && <p className="text-sm text-gray-500">Loading staff…</p>}
                      {staffLoaded && matches.length === 0 && (
                        <p className="text-sm text-gray-500">
                          No bus-required staff found for &ldquo;{staffQuery.trim()}&rdquo;.
                        </p>
                      )}
                      {matches.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            if (!s.email) {
                              toast.error('This staff member has no email on file');
                              return;
                            }
                            setSelectedStaff(s);
                          }}
                          className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5 text-left transition-colors hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-500/10"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
                            {s.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">{s.name}</p>
                            <p className="truncate text-xs text-gray-500">
                              {[s.designation, s.email ?? 'No email'].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="mt-1 block text-xs text-gray-400">
                    Searches bus-required staff from the Passengers → Staff module.{' '}
                    <button type="button" className="text-green-600 hover:underline" onClick={() => setManualMode(true)}>
                      Enter email manually
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <div className="relative mt-1">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      className="input pl-10!"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="staff@jkkn.ac.in"
                    />
                  </div>
                  <span className="mt-1 block text-xs text-gray-400">
                    The email of the staff member to assign to a route.{' '}
                    <button type="button" className="text-green-600 hover:underline" onClick={() => setManualMode(false)}>
                      Search by name instead
                    </button>
                  </span>
                </>
              )}
            </div>

            <div className={`${fieldCls} md:col-span-2`}>
              <span className={labelCls}>Route *</span>
              {/* Radix dropdown instead of a native <select>: the native popup can't be
                  styled, this one gets the app's rounded corners + green hover. */}
              <DropdownMenu>
                <DropdownMenuTrigger className="mt-1 flex h-[38px] w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
                  <span className={`truncate ${selectedRoute ? 'text-gray-900' : 'text-gray-400'}`}>
                    {selectedRoute
                      ? `${selectedRoute.route_number} - ${selectedRoute.route_name}`
                      : 'Choose a route…'}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
                >
                  {routes.map((r) => (
                    <DropdownMenuItem key={r.id} onSelect={() => setRouteId(r.id)}>
                      <Check className={`${routeId === r.id ? 'opacity-100' : 'opacity-0'} text-green-600`} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">
                          {r.route_number} - {r.route_name}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {r.start_location} → {r.end_location}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {routes.length === 0 && (
                <span className="mt-1 block text-xs text-gray-400">
                  No active routes found.{' '}
                  <a href="/routes" target="_blank" className="text-green-600 hover:underline">
                    Manage routes
                  </a>
                </span>
              )}
            </div>

            <label className={`${fieldCls} md:col-span-2`}>
              <span className={labelCls}>Notes (optional)</span>
              <textarea
                className="input mt-1"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this assignment…"
              />
            </label>
          </div>
        </SectionCard>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push('/staff-route-assignments')}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {saving ? 'Assigning…' : 'Assign Route'}
          </button>
        </div>
      </form>
    </div>
  );
}
