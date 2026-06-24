'use client';

// Shared header widgets for the self-service portals (driver, and reusable by the
// student portal later). These are role-agnostic — they read the signed-in profile
// + theme only — so any portal shell can drop them into its `app-header` right cluster.
// Extracted from the student/admin layouts to avoid a third inline copy.

import React, { useState } from 'react';
import { Sun, Moon, Monitor, LogOut, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/providers/auth-provider';
import { useTheme, type Theme } from '@/components/theme-provider';

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Light/dark quick-toggle. Flips to the opposite of the resolved theme. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

/** Avatar button → dropdown with the user's identity, a theme picker, and sign-out. */
export function ProfileMenu() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (!profile) return null;

  const displayName = profile.full_name || profile.email || 'User';
  const displayRole = (profile.role || '').replace(/_/g, ' ');

  const handleLogout = async () => {
    setOpen(false);
    toast.success('Signing out…');
    await signOut();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-green-50 transition-colors dark:hover:bg-green-950/40"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
            {getInitials(displayName)}
          </div>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                  {getInitials(displayName)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate dark:text-white">
                  {displayName}
                </div>
                <div className="text-xs text-gray-500 capitalize truncate dark:text-gray-400">
                  {displayRole}
                </div>
                {profile.email && (
                  <div className="text-xs text-gray-400 truncate dark:text-gray-500">
                    {profile.email}
                  </div>
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
                  role="menuitemradio"
                  aria-checked={theme === value}
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
                role="menuitem"
                onClick={handleLogout}
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
