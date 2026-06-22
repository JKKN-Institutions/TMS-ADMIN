'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bus, Power, PanelLeft, PanelLeftClose, Sun, Moon, Monitor, LogOut, Check, Bell,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { useTheme, type Theme } from '@/components/theme-provider';
import { studentNavigation, deriveStudentPageTitle } from '@/lib/student/navigation';
import StudentBottomNav from '@/components/student-bottom-nav';

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

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const { isStudent, isSuperAdmin } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem('tms-student-sidebar-collapsed') === '1');
  }, []);

  const toggleCollapse = () =>
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('tms-student-sidebar-collapsed', next ? '1' : '0');
      return next;
    });

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!isStudent && !isSuperAdmin) router.replace('/dashboard');
  }, [loading, user, profile, isStudent, isSuperAdmin, router, pathname]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 animate-pulse bg-green-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <Bus className="h-6 w-6 text-white" />
          </div>
          <p className="text-gray-600">Loading JKKN Transport…</p>
        </div>
      </div>
    );
  }

  const pageTitle = deriveStudentPageTitle(pathname);

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      <div className={`sidebar-modern ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Bus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">JKKN Transport</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">MENU</div>
            <div className="space-y-1">
              {studentNavigation.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                if (item.comingSoon) {
                  return (
                    <span key={item.href} className="sidebar-nav-item opacity-50 cursor-not-allowed">
                      <Icon className="icon" />
                      <span>{item.name}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">soon</span>
                    </span>
                  );
                }
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
            <a
              href="/student/notifications"
              onClick={(e) => {
                e.preventDefault();
                router.push('/student/notifications');
              }}
              title="Notifications"
              className="p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
            >
              <Bell className="w-5 h-5" />
            </a>
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>

        <div className="content-body fade-in">{children}</div>
      </div>

      {/* Mobile-only bottom navigation (replaces the slide-in drawer on < lg). */}
      <StudentBottomNav />
    </div>
  );
}
