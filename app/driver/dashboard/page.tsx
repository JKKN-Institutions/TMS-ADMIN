'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  Route as RouteIcon, Activity, Star, Bus, Users, MapPin, User, AlertTriangle, IdCard,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import type { TimetableStop } from '@/components/driver/route-timetable';
import { PageHeader, StatCard, Spinner, NoticeCard, TILE, type Tone } from '@/components/driver/ui';
import { cn } from '@/lib/utils';

interface DriverMe {
  licenseNumber: string | null;
  licenseExpiry: string | null;
  status: string | null;
  experienceYears: number | null;
  rating: number | null;
  totalTrips: number | null;
  passengerCount: number | null;
  assignedRouteId: string | null;
  routeLabel: string | null;
  stops: TimetableStop[];
}
type Resp = { data?: DriverMe; notFound?: boolean };

async function fetchMe(): Promise<Resp> {
  const res = await fetch('/api/driver/me', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load driver profile');
  return { data: (await res.json()).data as DriverMe };
}

const QUICK: { title: string; desc: string; icon: ComponentType<{ className?: string }>; tone: Tone; href: string }[] = [
  { title: 'My Routes', desc: 'Route & full timetable', icon: RouteIcon, tone: 'blue', href: '/driver/routes' },
  { title: 'Passengers', desc: 'Riders on your route', icon: Users, tone: 'green', href: '/driver/passengers' },
  { title: 'Live Location', desc: "Your bus's position", icon: MapPin, tone: 'purple', href: '/driver/location' },
  { title: 'Profile', desc: 'License & details', icon: User, tone: 'orange', href: '/driver/profile' },
];

export default function DriverDashboardPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['driver-me'], queryFn: fetchMe });

  const firstName = (profile?.full_name ?? '').split(' ')[0];

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load your dashboard"
        body="Something went wrong loading your driver profile. Please refresh or try again shortly."
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
  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome${firstName ? `, ${firstName}` : ''}!`}
        subtitle="Here's your route and driving overview."
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={RouteIcon} tone="blue" label="Assigned route" value={me.routeLabel ?? 'Not assigned'} />
        <StatCard icon={Activity} tone="green" label="Status" value={me.status ?? '—'} />
        <StatCard icon={Bus} tone="purple" label="Total trips" value={me.totalTrips != null ? String(me.totalTrips) : '—'} />
        <StatCard icon={Users} tone="orange" label="Passengers" value={me.passengerCount != null ? String(me.passengerCount) : '—'} />
      </div>

      {!me.routeLabel && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            You don&apos;t have a route assigned yet. Please contact the transport office to be assigned a route.
          </p>
        </div>
      )}

      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Quick actions</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK.map((a) => (
            <button
              key={a.href}
              onClick={() => router.push(a.href)}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-110',
                    TILE[a.tone]
                  )}
                >
                  <a.icon className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{a.title}</h3>
                  <p className="truncate text-sm text-gray-600 dark:text-gray-400">{a.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-lg', TILE.slate)}>
            <IdCard className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">License</p>
            <p className="truncate text-base font-semibold text-gray-900 dark:text-white">{me.licenseNumber ?? '—'}</p>
            {me.licenseExpiry && <p className="text-xs text-gray-500 dark:text-gray-400">Expires {me.licenseExpiry}</p>}
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-lg', TILE.blue)}>
            <Star className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Experience</p>
            <p className="truncate text-base font-semibold text-gray-900 dark:text-white">
              {me.experienceYears != null ? `${me.experienceYears} years` : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
