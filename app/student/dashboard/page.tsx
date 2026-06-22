'use client';

import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  MapPin, CreditCard, Route as RouteIcon, QrCode, MessageCircle, Bell, AlertTriangle,
} from 'lucide-react';
import { useMe } from '@/lib/student/use-me';

const QUICK = [
  { title: 'My Route', desc: 'View your route & stops', icon: RouteIcon, color: 'bg-gradient-to-br from-blue-500 to-indigo-600', href: '/student/routes' },
  { title: 'Boarding Pass', desc: 'Show your QR pass', icon: QrCode, color: 'bg-gradient-to-br from-green-500 to-emerald-600', href: '/student/pass' },
  { title: 'Grievances', desc: 'Raise or track issues', icon: MessageCircle, color: 'bg-gradient-to-br from-orange-500 to-amber-600', href: '/student/grievances' },
  { title: 'Notifications', desc: 'Latest updates', icon: Bell, color: 'bg-gradient-to-br from-purple-500 to-violet-600', href: '/student/notifications' },
];

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1 truncate">{value}</p>
        </div>
        <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center shadow-lg ${tone}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const { data, isLoading, error } = useMe();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
      </div>
    );
  }
  if (error) {
    return <div className="text-destructive">Could not load your transport profile. Please try again.</div>;
  }

  if (data?.notFound || !data?.data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-xl dark:bg-gray-900 dark:border-gray-800">
        <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transport profile not found</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          We couldn&apos;t find a learner record linked to your account yet. Please contact the transport
          office to complete your transport setup.
        </p>
      </div>
    );
  }

  const me = data.data;
  const firstName = me.name?.split(' ')[0] ?? '';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          Welcome{firstName ? `, ${firstName}` : ''}!
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">
          Here&apos;s your transport overview.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          icon={RouteIcon}
          label="Route"
          value={me.routeLabel ?? (me.assigned ? '—' : 'Not allocated')}
          tone="bg-gradient-to-br from-blue-500 to-indigo-600"
        />
        <StatCard
          icon={MapPin}
          label="Boarding stop"
          value={me.stopLabel ?? '—'}
          tone="bg-gradient-to-br from-purple-500 to-violet-600"
        />
        <StatCard
          icon={CreditCard}
          label="Transport fee"
          value={me.transportFee != null ? `₹${me.transportFee}` : '—'}
          tone="bg-gradient-to-br from-orange-500 to-amber-600"
        />
      </div>

      {me.busRequired && !me.assigned && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 dark:bg-amber-950/30 dark:border-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            You need transport but don&apos;t have a route allocated yet. Please contact the transport
            office to be allocated a route.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {QUICK.map((a) => (
            <button
              key={a.href}
              onClick={() => router.push(a.href)}
              className="text-left relative overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer transition-all duration-300 hover:shadow-md hover:scale-[1.02] group dark:bg-gray-900 dark:border-gray-800"
            >
              <div className="flex items-center space-x-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 ${a.color}`}
                >
                  <a.icon className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{a.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{a.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
