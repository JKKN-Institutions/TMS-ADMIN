'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bus, Power, PanelLeft, PanelLeftClose } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { driverNavigation, deriveDriverPageTitle } from '@/lib/driver/navigation';
import { Toaster } from 'react-hot-toast';
import { ThemeToggle, ProfileMenu } from '@/components/portal-user-menu';
import DriverBottomNav from '@/components/driver-bottom-nav';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const { isDriver, isSuperAdmin } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Restore the desktop collapse preference across reloads.
  useEffect(() => {
    setCollapsed(localStorage.getItem('tms-driver-sidebar-collapsed') === '1');
  }, []);

  const toggleCollapse = () =>
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('tms-driver-sidebar-collapsed', next ? '1' : '0');
      return next;
    });

  // Auth guard (the proxy already gates server-side; this is the client net).
  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!isDriver && !isSuperAdmin) router.replace('/dashboard');
  }, [loading, user, profile, isDriver, isSuperAdmin, router, pathname]);

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

  const pageTitle = deriveDriverPageTitle(pathname);

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
                <p className="text-xs text-gray-500 -mt-0.5">Driver Portal</p>
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">MENU</div>
            <div className="space-y-1">
              {driverNavigation.map((item) => {
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
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>

        <div className="content-body fade-in">{children}</div>
      </div>

      {/* Mobile-only bottom navigation (replaces the sidebar on < lg). */}
      <DriverBottomNav />

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: { background: 'white', color: '#1a1a1a', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' },
          success: { style: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' } },
          error: { style: { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' } },
        }}
      />
    </div>
  );
}
