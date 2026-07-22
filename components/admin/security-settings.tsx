'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Loader2, ShieldCheck, Users } from 'lucide-react';
import type { SystemInfo } from '@/lib/settings/system-info';

/**
 * Security tab. This app does not own authentication — sessions, 2FA,
 * password policy and IP allow-listing all belong to the parent MyJKKN
 * identity provider — so there is nothing to configure here, and nothing to
 * measure about logins (this app has no login table at all). The previous
 * tab's Session Timeout / Max Login Attempts / Password Expiry / 2FA / IP
 * Restriction switches were never enforced by anything, and its
 * "Security Score 94/100" and "12 failed logins" were both fabricated.
 *
 * What IS real and measurable: the admin activity log. This renders the
 * same signals GET /api/admin/system-info exposes for the System tab's
 * activity block, focused on who has been acting and from where.
 */
export function SecuritySettings() {
  const [data, setData] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/system-info', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load system info');
        setData(json.data as SystemInfo);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Security</h3>
        <p className="mt-1 text-sm text-gray-600">Real signals from the admin activity log — nothing fabricated.</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Authentication — sessions, two-factor authentication, password policy and IP allow-listing — is
          managed by the parent <strong>MyJKKN identity provider</strong>, not this app. There is nothing
          to configure here; this app also has no login records to report on, so no failed-login count or
          security score is shown.
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading activity signals…
        </div>
      )}

      {!loading && (loadError || !data) && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Could not load activity data. Reload the page to try again.
        </div>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Distinct admin actors (7d)" value={data.security.distinctActors7d} icon={<Users className="h-4 w-4" />} />
            <StatCard label="Distinct IP addresses (7d)" value={data.security.distinctIps7d} icon={<ShieldCheck className="h-4 w-4" />} />
            <StatCard label="Admin actions (24h)" value={data.activity.last24h} icon={<Users className="h-4 w-4" />} />
            <StatCard label="Admin actions (7d)" value={data.activity.last7d} icon={<Users className="h-4 w-4" />} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h4 className="text-sm font-medium text-gray-900">Recent admin actions</h4>
              <Link
                href="/activity-log"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View full log
              </Link>
            </div>
            {data.security.recent.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-gray-500">No admin activity in the last 7 days.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      <th className="px-5 py-2">Actor</th>
                      <th className="px-5 py-2">Module / action</th>
                      <th className="px-5 py-2">IP address</th>
                      <th className="px-5 py-2">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.security.recent.map((entry, i) => (
                      <tr key={i}>
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-gray-900">{entry.actorEmail ?? 'Unknown'}</div>
                          {entry.actorRole && <div className="text-xs text-gray-500">{entry.actorRole}</div>}
                        </td>
                        <td className="px-5 py-2.5 text-gray-700">
                          <div>{[entry.module, entry.action].filter(Boolean).join(' · ') || '—'}</div>
                          {entry.description && (
                            <div className="max-w-md truncate text-xs text-gray-500" title={entry.description}>
                              {entry.description}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-gray-700">{entry.ipAddress ?? '—'}</td>
                        <td className="px-5 py-2.5 text-gray-500">
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
