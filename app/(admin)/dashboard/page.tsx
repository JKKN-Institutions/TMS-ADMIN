'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  Route as RouteIcon, 
  UserCheck, 
  Car,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Shield,
  Settings,
  Calendar,
  MessageSquare,
  Eye,
  Plus,
  RefreshCw,
  Activity,
  Clock,
  DollarSign,
  AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import UniversalStatCard from '@/components/universal-stat-card';
import { createDashboardStats, safeNumber } from '@/lib/stat-utils';

interface DashboardStats {
  totalStudents: number;
  totalDrivers: number;
  totalRoutes: number;
  totalVehicles: number;
  totalBookings: number;
  confirmedBookings: number;
  pendingPayments: number;
  openGrievances: number;
  todayRevenue: number;
}

interface AdminUser {
  id: string;
  username: string;
  role: string;
  permissions: string[];
}

const DashboardPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
      fetchDashboardData();
    } else {
      router.push('/login');
    }
  }, [router]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/dashboard');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data && result.data.stats) {
        setDashboardStats(result.data.stats);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      toast.error('Failed to load dashboard data');
      // Set fallback data
      setDashboardStats({
        totalStudents: 0,
        totalDrivers: 0,
        totalRoutes: 0,
        totalVehicles: 0,
        totalBookings: 0,
        confirmedBookings: 0,
        pendingPayments: 0,
        openGrievances: 0,
        todayRevenue: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
    toast.success('Dashboard refreshed');
  };

  const getQuickActions = () => {
    if (!user) return [];

    const actions = [
      {
        title: 'System Analytics',
        desc: 'View comprehensive system metrics',
        icon: BarChart3,
        color: 'bg-gradient-to-br from-green-500 to-emerald-600',
        href: '/analytics'
      },
      {
        title: 'User Management',
        desc: 'Manage admin users and permissions',
        icon: Shield,
        color: 'bg-gradient-to-br from-red-500 to-rose-600',
        href: '/authorize'
      },
      {
        title: 'System Settings',
        desc: 'Configure system preferences',
        icon: Settings,
        color: 'bg-gradient-to-br from-gray-500 to-slate-600',
        href: '/settings'
      },
      {
        title: 'Schedule Management',
        desc: 'Manage routes and schedules',
        icon: Calendar,
        color: 'bg-gradient-to-br from-blue-500 to-indigo-600',
        href: '/schedules'
      },
      {
        title: 'Vehicle Fleet',
        desc: 'Monitor and manage vehicles',
        icon: Car,
        color: 'bg-gradient-to-br from-purple-500 to-violet-600',
        href: '/vehicles'
      },
      {
        title: 'Driver Management',
        desc: 'Manage driver assignments',
        icon: UserCheck,
        color: 'bg-gradient-to-br from-orange-500 to-amber-600',
        href: '/drivers'
      }
    ];

    return actions;
  };

  // Create standardized stats using the utility function
  const statCards = dashboardStats ? createDashboardStats({
    totalStudents: { current: dashboardStats.totalStudents },
    totalRoutes: { current: dashboardStats.totalRoutes },
    totalDrivers: { current: dashboardStats.totalDrivers },
    totalVehicles: { current: dashboardStats.totalVehicles },
    todayRevenue: { current: dashboardStats.todayRevenue },
    activeBookings: { current: dashboardStats.confirmedBookings },
    pendingGrievances: { current: dashboardStats.openGrievances }
  }) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 animate-spin rounded-full border-4 border-gray-300 border-t-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user?.username}!</h1>
          <p className="text-gray-600 mt-1">Here's what's happening with your transport management system today.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <button 
            onClick={() => router.push('/students')}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Student
          </button>
        </div>
      </div>

      {/* Enhanced Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <UniversalStatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={index === 0 ? Users : index === 1 ? RouteIcon : index === 2 ? UserCheck : Car}
            trend={stat.trend}
            color={stat.color}
            variant="enhanced"
            loading={loading}
            onClick={() => {
              const routes = ['/students', '/routes', '/drivers', '/vehicles'];
              router.push(routes[index] || '/dashboard');
            }}
            delay={index}
          />
        ))}
      </div>

      {/* Quick Actions Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Quick Actions</h2>
          <button 
            onClick={() => router.push('/analytics')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center transition-colors"
          >
            View Analytics <Eye className="w-4 h-4 ml-1" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {getQuickActions().map((action, index) => (
            <div
              key={index}
              onClick={() => router.push(action.href)}
              className="relative overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer transition-all duration-300 hover:shadow-md hover:scale-[1.02] group"
            >
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.color} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-sm text-gray-600 truncate">{action.desc}</p>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-blue-50 opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
            </div>
          ))}
        </div>
      </div>

      {/* Enhanced Dashboard Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transport Analytics */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Transport Analytics</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Today's Revenue</span>
                </div>
                <span className="text-lg font-bold text-green-900">
                  ₹{safeNumber(dashboardStats?.todayRevenue).toLocaleString()}
                </span>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Active Bookings</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {safeNumber(dashboardStats?.confirmedBookings)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Pending Payments</span>
                  <span className="text-sm font-semibold text-orange-600">
                    {safeNumber(dashboardStats?.pendingPayments)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Open Grievances</span>
                  <span className="text-sm font-semibold text-red-600">
                    {safeNumber(dashboardStats?.openGrievances)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-900">All systems operational</span>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-blue-900">Database performance: Excellent</span>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-yellow-50 rounded-lg">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-sm font-medium text-yellow-900">Scheduled maintenance due</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">New student enrollment</p>
                  <p className="text-xs text-gray-500">2 minutes ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">Route schedule updated</p>
                  <p className="text-xs text-gray-500">15 minutes ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">Payment processed</p>
                  <p className="text-xs text-gray-500">1 hour ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">Vehicle maintenance alert</p>
                  <p className="text-xs text-gray-500">3 hours ago</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage; 