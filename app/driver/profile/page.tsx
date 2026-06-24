'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Mail, Phone, MapPin, Route as RouteIcon } from 'lucide-react';
import { Spinner, NoticeCard, Section } from '@/components/driver/ui';

interface DriverProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  medicalCertificateExpiry: string | null;
  experienceYears: number | null;
  rating: number | null;
  totalTrips: number | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  routes: { id: string; label: string }[];
}
type Resp = { data?: DriverProfile; notFound?: boolean };

async function fetchProfile(): Promise<Resp> {
  const res = await fetch('/api/driver/profile', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load profile');
  return { data: (await res.json()).data as DriverProfile };
}

function initials(name: string): string {
  return name.split(' ').map((w) => w.charAt(0)).join('').toUpperCase().slice(0, 2);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-0.5 break-words font-medium text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default function DriverProfilePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['driver-profile'], queryFn: fetchProfile });

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load your profile"
        body="Something went wrong loading your profile. Please refresh or try again shortly."
      />
    );
  }
  if (data?.notFound || !data?.data) {
    return (
      <NoticeCard
        tone="amber"
        icon={AlertTriangle}
        title="Driver profile not found"
        body="We couldn't find a driver record linked to your account. Please contact the transport office."
      />
    );
  }

  const me = data.data;
  const name = me.name ?? 'Driver';
  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="relative isolate overflow-hidden bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 px-6 py-7 sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/20 text-xl font-bold text-white ring-2 ring-white/40 backdrop-blur">
              {initials(name)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-white sm:text-2xl">{name}</h1>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold capitalize text-white ring-1 ring-white/30 backdrop-blur">
                {me.status ?? 'driver'}
              </span>
            </div>
            <div className="ml-auto flex flex-col gap-1 text-sm text-white/90">
              {me.email && (
                <span className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{me.email}</span>
                </span>
              )}
              {me.phone && (
                <span className="inline-flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" /> <span className="tabular-nums">{me.phone}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <Section title="Driver details">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
          <Field label="License number" value={me.licenseNumber ?? '—'} />
          <Field label="License expiry" value={me.licenseExpiry ?? '—'} />
          <Field label="Medical cert. expiry" value={me.medicalCertificateExpiry ?? '—'} />
          <Field label="Experience" value={me.experienceYears != null ? `${me.experienceYears} yrs` : '—'} />
          <Field label="Rating" value={me.rating != null ? String(me.rating) : '—'} />
          <Field label="Total trips" value={me.totalTrips != null ? String(me.totalTrips) : '—'} />
          <Field label="Address" value={me.address ?? '—'} />
        </div>
      </Section>

      <Section title="Emergency contact">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" value={me.emergencyContactName ?? '—'} />
          <Field label="Phone" value={me.emergencyContactPhone ?? '—'} />
        </div>
      </Section>

      <Section icon={RouteIcon} title="Assigned route(s)" count={me.routes.length}>
        {me.routes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No routes assigned yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {me.routes.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
              >
                <MapPin className="h-3.5 w-3.5" />
                {r.label}
              </span>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
