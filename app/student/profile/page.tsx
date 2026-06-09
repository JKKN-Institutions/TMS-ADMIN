'use client';

import type { ComponentType, ReactNode } from 'react';
import { Mail, GraduationCap, Hash, Bus, CircleCheck, AlertTriangle } from 'lucide-react';
import { useMe } from '@/lib/student/use-me';
import { cn } from '@/lib/utils';

const getInitials = (name: string) =>
  name.split(' ').map((w) => w.charAt(0)).join('').toUpperCase().slice(0, 2) || '?';

function cap(s: string | null): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* --------------------------------- primitives --------------------------------- */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 break-words font-medium text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function InfoCard({
  title,
  icon: Icon,
  tone,
  children,
  className,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900',
        className
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm', tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function NoticeCard({ icon: Icon, title, body }: { icon: ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{body}</p>
    </div>
  );
}

/* ----------------------------------- page ------------------------------------- */

export default function StudentProfilePage() {
  const { data, isLoading, error } = useMe();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
      </div>
    );
  }
  if (error) {
    return <NoticeCard icon={AlertTriangle} title="Couldn't load your profile" body="Something went wrong while loading your profile. Please refresh and try again." />;
  }
  if (data?.notFound || !data?.data) {
    return (
      <NoticeCard
        icon={AlertTriangle}
        title="No transport profile"
        body="No learner record is linked to your account yet. Please contact the transport office to complete your setup."
      />
    );
  }

  const me = data.data;
  const subtitle = [me.programName, me.semesterName].filter(Boolean).join(' · ');
  const statusActive = me.lifecycleStatus?.toLowerCase() === 'active';

  return (
    <div className="space-y-6">
      {/* ============================== PROFILE HEADER ============================== */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="relative isolate overflow-hidden bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 px-6 py-7 sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-emerald-300/20 blur-2xl" />

          <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/20 text-2xl font-bold text-white ring-2 ring-white/40 backdrop-blur">
              {getInitials(me.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">{me.name}</h1>
              {subtitle && <p className="mt-1 text-sm text-white/85">{subtitle}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {me.rollNumber && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/30 backdrop-blur">
                    <Hash className="h-3.5 w-3.5" />
                    {me.rollNumber}
                  </span>
                )}
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize backdrop-blur',
                    statusActive
                      ? 'bg-white/20 text-white ring-1 ring-white/40'
                      : 'bg-white/10 text-white/80 ring-1 ring-white/20'
                  )}
                >
                  <CircleCheck className="h-3.5 w-3.5" />
                  {cap(me.lifecycleStatus)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== CONTACT + ACADEMIC (side by side) ===================== */}
      <div className="grid gap-6 lg:grid-cols-2">
        <InfoCard title="Contact" icon={Mail} tone="bg-gradient-to-br from-blue-500 to-indigo-600">
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field label="Email" value={me.email ?? '—'} />
            <Field label="Mobile" value={me.mobile ?? '—'} />
            <Field label="Roll number" value={me.rollNumber ?? '—'} />
            <Field label="Register number" value={me.registerNumber ?? '—'} />
          </div>
        </InfoCard>

        <InfoCard title="Academic" icon={GraduationCap} tone="bg-gradient-to-br from-purple-500 to-violet-600">
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field label="Institution" value={me.institutionName ?? '—'} />
            <Field label="Department" value={me.departmentName ?? '—'} />
            <Field label="Programme" value={me.programName ?? '—'} />
            <Field label="Semester" value={me.semesterName ?? '—'} />
          </div>
        </InfoCard>
      </div>

      {/* ============================ TRANSPORT (full width) ============================ */}
      <InfoCard title="Transport" icon={Bus} tone="bg-gradient-to-br from-green-500 to-emerald-600">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Transport" value={me.busRequired ? 'Required' : 'Not required'} />
          <Field label="Allocation" value={me.assigned ? 'Allocated' : 'Not allocated'} />
          <Field label="Transport fee" value={me.transportFee != null ? `₹${me.transportFee}` : '—'} />
          <Field label="Route" value={me.routeLabel ?? '—'} />
          <Field label="Boarding stop" value={me.stopLabel ?? '—'} />
        </div>
      </InfoCard>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Profile details are managed by the institution and shown read-only here.
      </p>
    </div>
  );
}
