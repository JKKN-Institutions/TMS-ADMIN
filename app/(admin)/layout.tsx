'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { X, Bus, Search, Power } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import ErrorBoundary from '@/components/error-boundary';
import AdminHeader from '@/components/admin-header';
import BottomNav from '@/components/bottom-nav';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useAuth } from '@/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { allNavigation, GROUP_TITLES, derivePageTitle, type NavItem } from '@/lib/navigation';

// Navigation config (allNavigation, GROUP_TITLES, derivePageTitle) now lives in
// lib/navigation.ts and is shared with the mobile bottom nav (components/bottom-nav).

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, profile, loading, signOut } = useAuth();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();

  // Restore the desktop collapse preference across reloads.
  useEffect(() => {
    setCollapsed(localStorage.getItem('tms-sidebar-collapsed') === '1');
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('tms-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  };

  // The proxy protects these routes server-side. This client net only redirects
  // when there is genuinely NO authenticated user — never merely because the
  // profile is still loading (that caused a login/dashboard bounce on sign-in).
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [loading, user, router]);

  const navigation = allNavigation
    .filter((item) => isSuperAdmin || can(item.permission))
    .map((item) => ({
      ...item,
      current: pathname === item.href || pathname.startsWith(item.href + '/'),
    }));

  const groupedNavigation = navigation.reduce(
    (acc, item) => {
      (acc[item.group] ??= []).push(item);
      return acc;
    },
    {} as Record<string, typeof navigation>
  );

  const handleLogout = async () => {
    toast.success('Signing out…');
    await signOut();
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 animate-pulse bg-green-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <Bus className="h-6 w-6 text-white" />
          </div>
          <p className="text-gray-600">Loading MYJKKN TMS...</p>
        </div>
      </div>
    );
  }

  const pageTitle = derivePageTitle(pathname);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={0}>
      <div className="min-h-screen bg-gray-100">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden bg-black bg-opacity-50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className={`sidebar-modern ${sidebarOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <Bus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">MYJKKN TMS</h1>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-gray-200 sidebar-search">
            <div className="search-container">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search... (Ctrl+K)"
                className="search-input"
              />
            </div>
          </div>

          <div className="sidebar-nav">
            {permsLoading && !isSuperAdmin ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              Object.entries(groupedNavigation).map(([group, items]) => (
                <div key={group} className="sidebar-section">
                  <div className="sidebar-section-title">
                    {GROUP_TITLES[group as NavItem['group']]}
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div key={item.name}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={item.href}
                              onClick={(e) => {
                                e.preventDefault();
                                router.push(item.href);
                                setSidebarOpen(false);
                              }}
                              className={`sidebar-nav-item ${item.current ? 'active' : ''}`}
                            >
                              <item.icon className="icon" />
                              <span>{item.name}</span>
                            </a>
                          </TooltipTrigger>
                          {collapsed && (
                            <TooltipContent side="right">
                              {item.name}
                            </TooltipContent>
                          )}
                        </Tooltip>
                        {item.subItems && item.current && (
                          <div className="ml-6 mt-1 space-y-1">
                            {item.subItems.map((subItem) => (
                              <a
                                key={subItem.name}
                                href={subItem.href}
                                onClick={(e) => {
                                  e.preventDefault();
                                  router.push(subItem.href);
                                  setSidebarOpen(false);
                                }}
                                className={`sidebar-nav-item text-sm ${pathname === subItem.href ? 'active' : ''}`}
                              >
                                <subItem.icon className="icon w-4 h-4" />
                                <span>{subItem.name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="sidebar-user">
            <button
              onClick={handleLogout}
              className="btn-secondary w-full text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Sign Out"
            >
              <Power className="w-4 h-4 mr-2" />
              <span className="sidebar-label">Sign Out</span>
            </button>
          </div>
        </div>

        <div className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
          <AdminHeader
            title={pageTitle}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
          />

          <div className="content-body fade-in">{children}</div>
        </div>

        {/* Mobile-only bottom navigation (replaces the sidebar on < lg). */}
        <BottomNav />
      </div>

      <Toaster
        position="top-right"
        containerStyle={{ top: '20px', right: '20px' }}
        toastOptions={{
          duration: 4000,
          style: {
            background: 'white',
            color: '#1a1a1a',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            maxWidth: '400px',
          },
          success: {
            style: {
              background: '#f0fdf4',
              color: '#166534',
              border: '1px solid #bbf7d0',
            },
          },
          error: {
            style: {
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
            },
          },
        }}
      />
      </TooltipProvider>
    </ErrorBoundary>
  );
};

export default AdminLayout;
