'use client';

import React, { useState, useEffect } from 'react';
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
  Bug
} from 'lucide-react';
import { AdminUser, UserRole } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import ErrorBoundary from '@/components/error-boundary';
import { useAuth } from '@/lib/auth/auth-context';

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const { user: parentUser, isAuthenticated: parentAuth, logout: parentLogout } = useAuth();

  useEffect(() => {
    validateAndSetUser();
  }, [parentUser, parentAuth]);

  const validateAndSetUser = () => {
    // Check for parent app authentication first
    if (parentAuth && parentUser) {
      // Convert parent app user to admin user format
      const adminUser: AdminUser = {
        id: parentUser.id,
        name: parentUser.full_name,
        email: parentUser.email,
        role: 'super_admin' as UserRole, // Parent app users with access are super admins
        permissions: ['all'], // Super admin has all permissions
        avatar: parentUser.avatar_url || undefined,
        lastLogin: parentUser.last_login || new Date().toISOString()
      };
      setUser(adminUser);
      return;
    }

    // Fallback to local admin authentication
    const storedUser = localStorage.getItem('adminUser');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
      } catch (error) {
        console.error('Invalid user data in localStorage:', error);
        localStorage.removeItem('adminUser');
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
  };

  const allNavigation = [
    // Overview
    { 
      name: 'Dashboard', 
      href: '/dashboard', 
      icon: LayoutDashboard, 
      roles: ['super_admin', 'transport_admin', 'staff'],
      group: 'overview'
    },
    { 
      name: 'Analytics', 
      href: '/analytics', 
      icon: BarChart3, 
      roles: ['super_admin', 'transport_admin'],
      group: 'overview'
    },
    
    // Transport
    { 
      name: 'Passengers', 
      href: '/students', 
      icon: Users, 
      roles: ['super_admin', 'transport_admin', 'staff'],
      group: 'transport'
    },
    { 
      name: 'Drivers', 
      href: '/drivers', 
      icon: UserCheck, 
      roles: ['super_admin', 'transport_admin'],
      group: 'transport'
    },
    { 
      name: 'Vehicles', 
      href: '/vehicles', 
      icon: Car, 
      roles: ['super_admin', 'transport_admin'],
      group: 'transport'
    },
    { 
      name: 'GPS Devices', 
      href: '/gps-devices', 
      icon: Navigation, 
      roles: ['super_admin', 'transport_admin'],
      group: 'transport'
    },
    { 
      name: 'Track All', 
      href: '/track-all', 
      icon: Bus, 
      roles: ['super_admin', 'transport_admin'],
      group: 'transport'
    },
    { 
      name: 'Routes', 
      href: '/routes', 
      icon: Route, 
      roles: ['super_admin', 'transport_admin'],
      group: 'transport'
    },
    { 
      name: 'Schedules', 
      href: '/schedules', 
      icon: Calendar, 
      roles: ['super_admin', 'transport_admin'],
      group: 'transport'
    },
    { 
      name: 'Route Optimization', 
      href: '/route-optimization', 
      icon: Zap, 
      roles: ['super_admin', 'transport_admin'],
      group: 'transport'
    },
    
    // Services
    { 
      name: 'Enrollments', 
      href: '/enrollment-requests', 
      icon: FileText, 
      roles: ['super_admin', 'transport_admin'],
      group: 'services'
    },
    { 
      name: 'Grievances', 
      href: '/grievances', 
      icon: MessageCircle, 
      roles: ['super_admin', 'transport_admin', 'staff'],
      group: 'services'
    },
    { 
      name: 'My Grievances', 
      href: '/my-grievances', 
      icon: MessageCircle, 
      roles: ['staff'],
      group: 'services'
    },
    { 
      name: 'Payments', 
      href: '/payments', 
      icon: CreditCard, 
      roles: ['super_admin', 'transport_admin'],
      group: 'services'
    },
    { 
      name: 'Notifications', 
      href: '/notifications', 
      icon: Bell, 
      roles: ['super_admin', 'transport_admin'],
      group: 'services',
      subItems: [
        {
          name: 'All Notifications',
          href: '/notifications',
          icon: Bell
        },
        {
          name: 'Push Notifications',
          href: '/notifications/push',
          icon: Bell
        }
      ]
    },
    { 
      name: 'Bug Management', 
      href: '/bug-management', 
      icon: Bug, 
      roles: ['super_admin', 'transport_admin'],
      group: 'services'
    },
    
    // System
    { 
      name: 'Authorize', 
      href: '/authorize', 
      icon: Shield, 
      roles: ['super_admin'],
      group: 'system'
    },
    { 
      name: 'Settings', 
      href: '/settings', 
      icon: Settings, 
      roles: ['super_admin'],
      group: 'system'
    }
  ];

  const navigation = allNavigation
    .filter(item => user && item.roles.includes(user.role))
    .map(item => ({
      ...item,
      current: pathname === item.href || pathname.startsWith(item.href + '/')
    }));

  const groupedNavigation = navigation.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof navigation>);

  const handleLogout = () => {
    // Check if user is authenticated via parent app
    if (parentAuth && parentUser) {
      // Logout from parent app
      parentLogout(false); // false means don't redirect to parent app
    } else {
      // Local admin logout
      localStorage.removeItem('adminUser');
      toast.success('Logged out successfully');
      router.push('/login');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) {
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

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-40 lg:hidden bg-black bg-opacity-50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`sidebar-modern ${sidebarOpen ? 'open' : ''}`}>
          {/* Sidebar Header */}
          <div className="sidebar-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <Bus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">MYJKKN TMS</h1>
                  <p className="text-xs text-gray-500 capitalize">{user.role.replace('_', ' ')}</p>
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

          {/* Search */}
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

          {/* Navigation */}
          <div className="sidebar-nav">
            {Object.entries(groupedNavigation).map(([group, items]) => (
              <div key={group} className="sidebar-section">
                <div className="sidebar-section-title">
                  {group === 'overview' ? 'OVERVIEW' : 
                   group === 'transport' ? 'TRANSPORT' : 
                   group === 'services' ? 'SERVICES' : 
                   'SYSTEM'}
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
            ))}
          </div>

          {/* User Profile */}
          <div className="sidebar-user">
            <div className="user-info">
              <div className="user-avatar">
                {getInitials(user.name || 'Admin')}
              </div>
              <div className="user-details">
                <div className="user-name">{user.name}</div>
                <div className="user-role capitalize">{user.role.replace('_', ' ')}</div>
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

        {/* Main Content */}
        <div className="main-content">
          {/* Top Bar - Mobile Only */}
          <div className="top-bar lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="top-bar-title">MYJKKN TMS</div>
            <div className="top-bar-actions">
              <div className="user-avatar">
                {getInitials(user.name || 'Admin')}
              </div>
            </div>
          </div>

          {/* Page Content */}
          <div className="content-body fade-in">
            {children}
          </div>
        </div>
      </div>
      
      <Toaster
        position="top-right"
        containerStyle={{
          top: '20px',
          right: '20px',
        }}
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