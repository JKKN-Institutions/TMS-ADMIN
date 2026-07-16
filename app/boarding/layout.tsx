'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bus, Power, PanelLeft, PanelLeftClose, Sun, Moon, Monitor, LogOut, Check,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useTheme, type Theme } from '@/components/theme-provider';
import { boardingNavigation, deriveBoardingPageTitle } from '@/lib/boarding/navigation';
import { deriveBoardingAccess } from '@/lib/boarding/access-state';
import BoardingBottomNav from '@/components/boarding-bottom-nav';
import NotificationBell from '@/components/notifications/notification-bell';
import { BugReporterWrapper } from '@/components/bug-reporter/bug-reporter-wrapper';

const getInitials = (name: string) =>
  name.split(' ').map((w) => w.charAt(0)).join('').toUpperCase().slice(0, 2);

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

function ProfileMenu() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  if (!profile) return null;

  const displayName = profile.full_name || profile.email || 'User';
  const displayRole = (profile.role || '').replace(/_/g, ' ');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-1 hover:bg-green-50 transition-colors dark:hover:bg-green-950/40"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
          {getInitials(displayName)}
        </div>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                {getInitials(displayName)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate dark:text-white">{displayName}</div>
                <div className="text-xs text-gray-500 capitalize truncate dark:text-gray-400">{displayRole}</div>
                {profile.email && (
                  <div className="text-xs text-gray-400 truncate dark:text-gray-500">{profile.email}</div>
                )}
              </div>
            </div>
            <div className="p-2">
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Theme
              </div>
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {label}
                  </span>
                  {theme === value && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 p-2 dark:border-gray-800">
              <button
                type="button"
                onClick={() => signOut()}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function BoardingLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Portal access requires an ACTUAL route assignment, not just the permission.
  // Authoritative check is server-side (/api/boarding/access). Super admins pass.
  const [access, setAccess] = useState<'checking' | 'allowed' | 'choose' | 'denied'>('checking');

  useEffect(() => {
    setCollapsed(localStorage.getItem('tms-boarding-sidebar-collapsed') === '1');
  }, []);

  const toggleCollapse = () =>
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('tms-boarding-sidebar-collapsed', next ? '1' : '0');
      return next;
    });

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, profile, router, pathname]);

  // Confirm the staffer is assigned to a route before opening the portal.
  useEffect(() => {
    if (loading || !user || !profile) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/boarding/access', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json().catch(() => ({}));
        const d = json?.data ?? {};
        if (cancelled) return;
        if (res.ok) {
          setAccess(deriveBoardingAccess({
            allowed: !!d.allowed,
            eligible: !!d.eligible,
            assignedRouteCount: d.assignedRouteCount ?? 0,
            hasRoute: !!d.hasRoute,
          }));
        } else setAccess('denied');
      } catch {
        if (!cancelled) setAccess('denied');
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user, profile]);

  // Keep an undecided-but-eligible staffer on the in-charge toggle.
  useEffect(() => {
    if (access === 'choose' && pathname !== '/boarding/in-charge') {
      router.replace('/boarding/in-charge');
    }
  }, [access, pathname, router]);

  // An already-assigned staffer must never be re-offered the toggle: the hard nav
  // after confirming pushes a history entry, so pressing Back lands them back on
  // /boarding/in-charge with a freshly-mounted willing=false. Tapping Confirm there
  // takes the "declined" branch and tells them fees apply — false, since they ARE
  // the in-charge and the assignment already exists (declining stores nothing, so
  // nothing is corrupted, but the screen would lie about their fee status).
  useEffect(() => {
    if (access === 'allowed' && pathname === '/boarding/in-charge') {
      router.replace('/boarding/attendance');
    }
  }, [access, pathname, router]);

  if (loading || !profile || access === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 animate-pulse bg-green-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <Bus className="h-6 w-6 text-white" />
          </div>
          <p className="text-gray-600">Loading JKKN Boarding…</p>
        </div>
      </div>
    );
  }

  if (access === 'choose') {
    return (
      <BugReporterWrapper>
        {/* .app-header is position:fixed, so this shell must reserve its height the
            same way .main-content does — otherwise the page renders UNDER the header.
            flex-col is what gives .content-body's `flex: 1` something to fill, which
            in turn lets the picker centre in the leftover space instead of hugging
            the top. */}
        <div className="flex min-h-screen flex-col bg-gray-50 pt-[calc(4rem+var(--pwa-banner-h,0px))] dark:bg-gray-950">
          <header className="app-header">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-green-600 rounded-lg flex items-center justify-center">
                <Bus className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">JKKN Boarding</h1>
            </div>
            <button
              onClick={() => signOut()}
              className="p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </header>
          <div className="content-body fade-in flex flex-1 items-center justify-center">{children}</div>
        </div>
      </BugReporterWrapper>
    );
  }

  if (access === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Bus className="h-6 w-6 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">No route assigned</h1>
          <p className="mt-1 text-sm text-gray-500">
            You&apos;re not assigned to any route, so the boarding portal isn&apos;t available.
            Ask an admin to assign you to a route.
          </p>
          <button
            onClick={() => signOut()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const pageTitle = deriveBoardingPageTitle(pathname);

  return (
    <BugReporterWrapper>
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      {/* Sidebar (desktop; hidden < lg, where the bottom nav takes over) */}
      <div className={`sidebar-modern ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Bus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">JKKN Boarding</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">BOARDING</div>
            <div className="space-y-1">
              {boardingNavigation.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(item.href);
                    }}
                    className={`sidebar-nav-item ${active ? 'active' : ''}`}
                  >
                    <Icon className="icon" />
                    <span>{item.name}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <div className="sidebar-user">
          <button
            onClick={() => signOut()}
            className="btn-secondary w-full text-red-600 hover:text-red-700 hover:bg-red-50"
            title="Sign Out"
          >
            <Power className="w-4 h-4 mr-2" />
            <span className="sidebar-label">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main column */}
      <div className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="app-header">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 hidden lg:flex dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
            >
              {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
            <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate dark:text-white">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationBell viewAllHref="/boarding/notifications" />
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>

        <div className="content-body fade-in">{children}</div>
      </div>

      {/* Mobile-only bottom navigation (replaces the sidebar < lg). */}
      <BoardingBottomNav />
    </div>
    </BugReporterWrapper>
  );
}
