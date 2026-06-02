'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';

interface RouteOption {
  id: string;
  route_number?: string;
  route_name?: string;
  start_location?: string;
  end_location?: string;
  status?: string;
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
  const [staffEmail, setStaffEmail] = useState('');
  const [routeId, setRouteId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Active routes for the dropdown (sourced from tms_route via /api/admin/routes).
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
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = staffEmail.trim();
    if (!email) return toast.error('Please enter a staff email');
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
            <label className={fieldCls}>
              <span className={labelCls}>Staff Email Address *</span>
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
                The email of the staff member to assign to a route.
              </span>
            </label>

            <label className={fieldCls}>
              <span className={labelCls}>Route *</span>
              <select className="input mt-1" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">Choose a route…</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.route_number} - {r.route_name} ({r.start_location} → {r.end_location})
                  </option>
                ))}
              </select>
              {routes.length === 0 && (
                <span className="mt-1 block text-xs text-gray-400">
                  No active routes found.{' '}
                  <a href="/routes" target="_blank" className="text-green-600 hover:underline">
                    Manage routes
                  </a>
                </span>
              )}
            </label>

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
