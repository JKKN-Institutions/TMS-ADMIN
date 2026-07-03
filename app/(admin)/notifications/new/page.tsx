'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Send, Users } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_PRIORITIES } from '@/lib/notifications/fields';
import type { NotificationRole, RouteAudience, Targeting } from '@/lib/notifications/audience';

type Mode = 'broadcast' | 'role' | 'route' | 'emails';

interface RouteOpt {
  id: string;
  route_number: string | null;
  route_name: string | null;
}

const ROLE_OPTIONS: { value: NotificationRole; label: string }[] = [
  { value: 'passenger', label: 'All passengers' },
  { value: 'driver', label: 'All drivers' },
  { value: 'boarding', label: 'All boarding staff' },
  { value: 'admin', label: 'All transport admins' },
];

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'broadcast', label: 'Everyone' },
  { value: 'role', label: 'By role' },
  { value: 'route', label: 'By route' },
  { value: 'emails', label: 'Specific people' },
];

const BODY_MAX = 5000;

const fieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white';
const cardCls = 'rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900';
const labelCls = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const eyebrowCls = 'text-[11px] font-semibold uppercase tracking-wider text-gray-400';

export default function ComposeNotificationPage() {
  const router = useRouter();
  const { can, isLoading: permsLoading } = usePermissions();
  const canSend = can(TMS_PERMISSIONS.NOTIFICATIONS_SEND);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [url, setUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const [mode, setMode] = useState<Mode>('broadcast');
  const [roles, setRoles] = useState<Set<NotificationRole>>(new Set());
  const [routeIds, setRouteIds] = useState<Set<string>>(new Set());
  const [routeInclude, setRouteInclude] = useState<Set<RouteAudience>>(new Set(['passengers']));
  const [emailText, setEmailText] = useState('');

  const [estimate, setEstimate] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: routes = [] } = useQuery({
    queryKey: ['admin-routes-for-notify'],
    queryFn: async (): Promise<RouteOpt[]> => {
      const res = await fetch('/api/admin/routes', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return [];
      return ((await res.json()).data ?? []) as RouteOpt[];
    },
    enabled: canSend,
  });

  const targeting: Targeting | null = useMemo(() => {
    if (mode === 'broadcast') return { type: 'broadcast' };
    if (mode === 'role') return roles.size ? { type: 'role', roles: [...roles] } : null;
    if (mode === 'route') {
      const include = [...routeInclude];
      return routeIds.size && include.length ? { type: 'route', route_ids: [...routeIds], include } : null;
    }
    if (mode === 'emails') {
      const emails = emailText.split(/[\s,;]+/).map((s) => s.trim()).filter((e) => e.includes('@'));
      return emails.length ? { type: 'emails', emails } : null;
    }
    return null;
  }, [mode, roles, routeIds, routeInclude, emailText]);

  // Live "will reach N people" preview (debounced).
  useEffect(() => {
    if (!targeting) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/notifications/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ targeting }),
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setEstimate(res.ok ? json.data?.count ?? 0 : null);
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [targeting]);

  const canSubmit = Boolean(title.trim() && body.trim() && targeting) && !submitting;

  const submit = async () => {
    if (!canSubmit || !targeting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          priority,
          url: url.trim() || undefined,
          expires_at: expiresAt || undefined,
          targeting,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      toast.success(json.message || 'Notification sent');
      router.push('/notifications');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = <T,>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  if (!permsLoading && !canSend) {
    return <div className="p-6 text-sm text-muted-foreground">You don&apos;t have permission to send notifications.</div>;
  }

  const recipientLabel =
    estimate == null ? 'Choose an audience' : `recipient${estimate === 1 ? '' : 's'} will receive this`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => router.push('/notifications')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back to notifications
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Compose notification</h1>
        <p className="text-sm text-muted-foreground">
          Write a message and choose who receives it across the passenger, driver, boarding and admin portals.
        </p>
      </div>

      {/* Workspace: message (left) + delivery (right, sticky) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* LEFT — message + details */}
        <div className="space-y-6">
          {/* Message: document-style compose */}
          <section className={`${cardCls} p-6`}>
            <span className={eyebrowCls}>Message</span>
            <input
              className="mt-3 w-full border-0 bg-transparent p-0 text-lg font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              maxLength={200}
            />
            <hr className="my-4 border-gray-100 dark:border-gray-800" />
            <textarea
              className="min-h-[200px] w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-200"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              maxLength={BODY_MAX}
            />
            <div className="mt-2 text-right text-xs text-gray-400 tabular-nums">
              {body.length}/{BODY_MAX}
            </div>
          </section>

          {/* Details */}
          <section className={`${cardCls} space-y-4 p-6`}>
            <span className={eyebrowCls}>Details</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Category</label>
                <select className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {NOTIFICATION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <select className={fieldCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {NOTIFICATION_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Link URL <span className="font-normal text-gray-400">(optional)</span></label>
                <input className={fieldCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/student/bookings" maxLength={500} />
              </div>
              <div>
                <label className={labelCls}>Expires <span className="font-normal text-gray-400">(optional)</span></label>
                <input type="datetime-local" className={fieldCls} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT — delivery panel (sticky) */}
        <aside className="space-y-4 self-start lg:sticky lg:top-4">
          <section className={`${cardCls} p-5`}>
            <span className={eyebrowCls}>Delivery</span>

            {/* Recipient hero */}
            <div className="mt-3 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 px-4 py-5 text-center dark:from-green-500/10 dark:to-emerald-500/[0.04]">
              <div className="flex items-center justify-center gap-2 text-3xl font-bold tabular-nums text-green-700 dark:text-green-400">
                {estimating ? <Loader2 className="h-6 w-6 animate-spin" /> : estimate == null ? '—' : estimate.toLocaleString()}
              </div>
              <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-gray-500">
                <Users className="h-3.5 w-3.5" /> {recipientLabel}
              </div>
            </div>

            {/* Audience mode — segmented control */}
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    mode === m.value
                      ? 'bg-white text-green-700 shadow-sm dark:bg-gray-900 dark:text-green-400'
                      : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Audience controls */}
            <div className="mt-4">
              {mode === 'broadcast' && (
                <p className="text-sm text-muted-foreground">Sends to every transport user across all portals.</p>
              )}

              {mode === 'role' && (
                <div className="space-y-2">
                  {ROLE_OPTIONS.map((r) => (
                    <label key={r.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                      <input type="checkbox" checked={roles.has(r.value)} onChange={() => setRoles((s) => toggle(s, r.value))} />
                      {r.label}
                    </label>
                  ))}
                </div>
              )}

              {mode === 'route' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={routeInclude.has('passengers')} onChange={() => setRouteInclude((s) => toggle(s, 'passengers'))} />
                      Passengers
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={routeInclude.has('driver')} onChange={() => setRouteInclude((s) => toggle(s, 'driver'))} />
                      Driver
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={routeInclude.has('staff')} onChange={() => setRouteInclude((s) => toggle(s, 'staff'))} />
                      Boarding staff
                    </label>
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                    {routes.length === 0 ? (
                      <p className="px-1 py-2 text-sm text-muted-foreground">No routes found.</p>
                    ) : (
                      routes.map((r) => (
                        <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                          <input type="checkbox" checked={routeIds.has(r.id)} onChange={() => setRouteIds((s) => toggle(s, r.id))} />
                          <span className="truncate text-gray-700 dark:text-gray-200">
                            {r.route_number ? `${r.route_number} · ` : ''}{r.route_name ?? r.id}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  {routeIds.size > 0 && (
                    <p className="text-xs text-gray-400">{routeIds.size} route{routeIds.size === 1 ? '' : 's'} selected</p>
                  )}
                </div>
              )}

              {mode === 'emails' && (
                <div>
                  <textarea
                    className={`${fieldCls} min-h-[96px]`}
                    value={emailText}
                    onChange={(e) => setEmailText(e.target.value)}
                    placeholder="Enter emails, separated by comma, space or newline"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">Emails must match the address on the user&apos;s account.</p>
                </div>
              )}
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/notifications')}
              className="rounded-lg px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Sending…' : estimate != null ? `Send to ${estimate.toLocaleString()}` : 'Send'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
