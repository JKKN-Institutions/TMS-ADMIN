'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Route,
  Users,
  Car,
  Calendar,
  CreditCard,
  Bell,
  MessageCircle,
  BarChart3,
  Settings,
  Menu,
  X,
  Bus,
  UserCheck,
  Shield,
  FileText,
  Search,
  Power,
  Navigation,
  Zap,
  Bug,
  ClipboardCheck,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import ErrorBoundary from '@/components/error-boundary';
import { useAuth } from '@/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
  group: 'overview' | 'transport' | 'services' | 'system';
  subItems?: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
}

const allNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: TMS_PERMISSIONS.DASHBOARD_VIEW, group: 'overview' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, permission: TMS_PERMISSIONS.REPORTS_VIEW, group: 'overview' },
  { name: 'Passengers', href: '/students', icon: Users, permission: TMS_PERMISSIONS.ENROLLMENT_VIEW, group: 'transport' },
  { name: 'Drivers', href: '/drivers', icon: UserCheck, permission: TMS_PERMISSIONS.DRIVERS_VIEW, group: 'transport' },
  { name: 'Vehicles', href: '/vehicles', icon: Car, permission: TMS_PERMISSIONS.VEHICLES_VIEW, group: 'transport' },
  { name: 'GPS Devices', href: '/gps-devices', icon: Navigation, permission: TMS_PERMISSIONS.TRACKING_VIEW, group: 'transport' },
  { name: 'Track All', href: '/track-all', icon: Bus, permission: TMS_PERMISSIONS.TRACKING_VIEW, group: 'transport' },
  { name: 'Routes', href: '/routes', icon: Route, permission: TMS_PERMISSIONS.ROUTES_VIEW, group: 'transport' },
  { name: 'Schedules', href: '/schedules', icon: Calendar, permission: TMS_PERMISSIONS.SCHEDULES_VIEW, group: 'transport' },
  { name: 'Route Optimization', href: '/route-optimization', icon: Zap, permission: TMS_PERMISSIONS.ROUTES_EDIT, group: 'transport' },
  { name: 'Staff Assignments', href: '/staff-route-assignments', icon: ClipboardCheck, permission: TMS_PERMISSIONS.DRIVERS_ASSIGN, group: 'transport' },
  { name: 'Enrollments', href: '/enrollment-requests', icon: FileText, permission: TMS_PERMISSIONS.ENROLLMENT_MANAGE, group: 'services' },
  { name: 'Grievances', href: '/grievances', icon: MessageCircle, permission: TMS_PERMISSIONS.GRIEVANCES_MANAGE, group: 'services' },
  { name: 'My Grievances', href: '/my-grievances', icon: MessageCircle, permission: TMS_PERMISSIONS.GRIEVANCES_SUBMIT, group: 'services' },
  { name: 'Payments', href: '/payments', icon: CreditCard, permission: TMS_PERMISSIONS.BOOKINGS_VIEW_ALL, group: 'services' },
  {
    name: 'Notifications',
    href: '/notifications',
    icon: Bell,
    permission: TMS_PERMISSIONS.SETTINGS_VIEW,
    group: 'services',
    subItems: [
      { name: 'All Notifications', href: '/notifications', icon: Bell },
      { name: 'Push Notifications', href: '/notifications/push', icon: Bell },
    ],
  },
  { name: 'Bug Management', href: '/bug-management', icon: Bug, permission: TMS_PERMISSIONS.SETTINGS_MANAGE, group: 'services' },
  { name: 'Authorize', href: '/authorize', icon: Shield, permission: TMS_PERMISSIONS.SETTINGS_MANAGE, group: 'system' },
  { name: 'Settings', href: '/settings', icon: Settings, permission: TMS_PERMISSIONS.SETTINGS_MANAGE, group: 'system' },
];

const GROUP_TITLES: Record<NavItem['group'], string> = {
  overview: 'OVERVIEW',
  transport: 'TRANSPORT',
  services: 'SERVICES',
  system: 'SYSTEM',
};

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, profile, loading, signOut } = useAuth();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();

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

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);

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

  const displayName = profile.full_name || profile.email || 'User';
  const displayRole = (profile.role || '').replace(/_/g, ' ');

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden bg-black bg-opacity-50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className={`sidebar-modern ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <Bus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">MYJKKN TMS</h1>
                  <p className="text-xs text-gray-500 capitalize">{displayRole}</p>
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

          <div className="p-4 border-b border-gray-200">
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
            <div className="user-info">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="user-avatar object-cover"
                />
              ) : (
                <div className="user-avatar">{getInitials(displayName)}</div>
              )}
              <div className="user-details">
                <div className="user-name">{displayName}</div>
                <div className="user-role capitalize">{displayRole}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="btn-secondary w-full text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Power className="w-4 h-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>

        <div className="main-content">
          <div className="top-bar lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="top-bar-title">MYJKKN TMS</div>
            <div className="top-bar-actions">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="user-avatar object-cover"
                />
              ) : (
                <div className="user-avatar">{getInitials(displayName)}</div>
              )}
            </div>
          </div>

          <div className="content-body fade-in">{children}</div>
        </div>
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
    </ErrorBoundary>
  );
};

export default AdminLayout;
