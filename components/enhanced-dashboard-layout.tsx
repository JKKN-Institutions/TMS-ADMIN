'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RefreshCw, 
  Filter, 
  Download, 
  Calendar, 
  TrendingUp, 
  Activity,
  Bell,
  Settings,
  ChevronDown,
  Eye,
  BarChart3,
  Users,
  Car,
  Route,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from 'lucide-react';
import EnhancedStatCard from './enhanced-stat-card';
import { UserRole } from '@/types';

interface DashboardData {
  totalStudents: number;
  activeRoutes: number;
  totalDrivers: number;
  totalVehicles: number;
  todayRevenue: number;
  pendingGrievances: number;
  completedTrips: number;
  averageRating: number;
  // Add more metrics as needed
}

interface DashboardMetrics {
  stats: DashboardData;
  trends: {
    students: { value: number; trend: 'up' | 'down' | 'neutral' };
    routes: { value: number; trend: 'up' | 'down' | 'neutral' };
    drivers: { value: number; trend: 'up' | 'down' | 'neutral' };
    vehicles: { value: number; trend: 'up' | 'down' | 'neutral' };
    revenue: { value: number; trend: 'up' | 'down' | 'neutral' };
    grievances: { value: number; trend: 'up' | 'down' | 'neutral' };
  };
  recentActivities: any[];
  systemHealth: {
    overall: number;
    database: number;
    api: number;
    services: number;
  };
}

interface EnhancedDashboardLayoutProps {
  userRole: UserRole;
  userName: string;
  data: DashboardMetrics;
  loading: boolean;
  onRefresh: () => void;
  onStatsClick?: (statType: string) => void;
}

const getStatsConfig = (userRole: UserRole, data: DashboardMetrics) => {
  const baseStats = [
    {
      id: 'students',
      title: 'Total Students',
      value: data.stats.totalStudents.toLocaleString(),
      icon: Users,
      color: 'blue' as const,
      subtitle: 'Active enrollments',
      change: data.trends.students,
      roles: ['super_admin', 'data_entry', 'finance_admin', 'operations_admin']
    },
    {
      id: 'routes',
      title: 'Active Routes',
      value: data.stats.activeRoutes.toString(),
      icon: Route,
      color: 'green' as const,
      subtitle: 'Currently running',
      change: data.trends.routes,
      roles: ['super_admin', 'transport_manager']
    },
    {
      id: 'drivers',
      title: 'Total Drivers',
      value: data.stats.totalDrivers.toString(),
      icon: Users,
      color: 'purple' as const,
      subtitle: 'Available staff',
      change: data.trends.drivers,
      roles: ['super_admin', 'transport_manager']
    },
    {
      id: 'vehicles',
      title: 'Fleet Size',
      value: data.stats.totalVehicles.toString(),
      icon: Car,
      color: 'indigo' as const,
      subtitle: 'Active vehicles',
      change: data.trends.vehicles,
      roles: ['super_admin', 'transport_manager']
    },
    {
      id: 'revenue',
      title: 'Today Revenue',
      value: `₹${data.stats.todayRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'cyan' as const,
      subtitle: 'Daily earnings',
      change: data.trends.revenue,
      roles: ['super_admin', 'finance_admin']
    },
    {
      id: 'grievances',
      title: 'Pending Issues',
      value: data.stats.pendingGrievances.toString(),
      icon: AlertTriangle,
      color: 'red' as const,
      subtitle: 'Needs attention',
      change: data.trends.grievances,
      roles: ['super_admin', 'operations_admin']
    }
  ];

  return baseStats.filter(stat => stat.roles.includes(userRole));
};

const getRoleWelcomeMessage = (userRole: UserRole, userName: string) => {
  const messages = {
    super_admin: `Welcome back, ${userName}! You have complete system oversight.`,
    transport_manager: `Hello ${userName}! Manage your fleet and routes efficiently.`,
    finance_admin: `Hi ${userName}! Track payments and financial metrics.`,
    operations_admin: `Welcome ${userName}! Handle bookings and student services.`,
    data_entry: `Hello ${userName}! Manage student data and enrollments.`
  };
  return messages[userRole] || `Welcome back, ${userName}!`;
};

const SystemHealthIndicator = ({ health }: { health: { overall: number; database: number; api: number; services: number } }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
  >
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-green-100 rounded-lg">
          <Activity className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">System Health</h3>
          <p className="text-sm text-gray-500">All systems operational</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        <span className="text-sm text-green-600 font-medium">Online</span>
      </div>
    </div>
    
    <div className="grid grid-cols-2 gap-4">
      {[
        { name: 'Database', value: health.database },
        { name: 'API', value: health.api },
        { name: 'Services', value: health.services },
        { name: 'Overall', value: health.overall }
      ].map((item) => (
        <div key={item.name} className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{item.name}</span>
          <div className="flex items-center space-x-2">
            <div className="w-12 bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  item.value > 90 ? 'bg-green-500' : 
                  item.value > 70 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${item.value}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{item.value}%</span>
          </div>
        </div>
      ))}
    </div>
  </motion.div>
);

const QuickActionCard = ({ icon: Icon, title, description, onClick, color }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
  color: string;
}) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
    className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 hover:shadow-xl transition-all duration-300 text-left w-full"
  >
    <div className="flex items-center space-x-3">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <ArrowUpRight className="w-4 h-4 text-gray-400" />
    </div>
  </motion.button>
);

export default function EnhancedDashboardLayout({
  userRole,
  userName,
  data,
  loading,
  onRefresh,
  onStatsClick
}: EnhancedDashboardLayoutProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState('7d');
  const stats = getStatsConfig(userRole, data);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const quickActions = [
    { icon: Users, title: 'Add Student', description: 'Register new student', onClick: () => {}, color: 'bg-blue-500' },
    { icon: Route, title: 'Create Route', description: 'Set up new route', onClick: () => {}, color: 'bg-green-500' },
    { icon: Car, title: 'Add Vehicle', description: 'Register new vehicle', onClick: () => {}, color: 'bg-purple-500' },
    { icon: Bell, title: 'Send Notice', description: 'Broadcast message', onClick: () => {}, color: 'bg-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="container-xl space-y-8 py-8">
        {/* Enhanced Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-700 to-purple-700 rounded-3xl p-8 text-white shadow-2xl"
        >
          {/* Background decorations */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20"></div>
          <div className="absolute -top-4 -right-4 w-32 h-32 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-white/10 rounded-full blur-lg"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                    <BarChart3 className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold">
                      {userRole.replace('_', ' ').toUpperCase()} Dashboard
                    </h1>
                    <p className="text-blue-100 text-lg">
                      {getRoleWelcomeMessage(userRole, userName)}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-blue-100">Time Range:</label>
                  <select
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                    className="bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white text-sm backdrop-blur-sm"
                  >
                    <option value="1d">Today</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days</option>
                    <option value="90d">90 Days</option>
                  </select>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center space-x-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl backdrop-blur-sm transition-all duration-200"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  <span className="text-sm font-medium">Refresh</span>
                </motion.button>
              </div>
            </div>
            
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <div className="flex items-center space-x-3">
                  <Activity className="w-5 h-5 text-blue-200" />
                  <div>
                    <p className="text-sm text-blue-100">System Status</p>
                    <p className="text-lg font-semibold">
                      {data.systemHealth.overall > 95 ? 'Excellent' : 
                       data.systemHealth.overall > 85 ? 'Good' : 'Needs Attention'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <div className="flex items-center space-x-3">
                  <Users className="w-5 h-5 text-blue-200" />
                  <div>
                    <p className="text-sm text-blue-100">Active Users</p>
                    <p className="text-lg font-semibold">
                      {Math.floor(data.stats.totalStudents * 0.3)}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <div className="flex items-center space-x-3">
                  <Target className="w-5 h-5 text-blue-200" />
                  <div>
                    <p className="text-sm text-blue-100">Efficiency</p>
                    <p className="text-lg font-semibold">
                      {Math.floor(data.systemHealth.overall)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Enhanced Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <EnhancedStatCard
              key={stat.id}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              subtitle={stat.subtitle}
              change={{
                value: stat.change.value,
                trend: stat.change.trend,
                timeframe: timeRange === '1d' ? 'yesterday' : `last ${timeRange}`
              }}
              loading={loading}
              onClick={() => onStatsClick?.(stat.id)}
              delay={index}
            />
          ))}
        </div>

        {/* Quick Actions & System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Quick Actions</h2>
                    <p className="text-gray-600">Frequently used features</p>
                  </div>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-sm font-medium">More</span>
                </motion.button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {quickActions.map((action, index) => (
                  <QuickActionCard
                    key={action.title}
                    icon={action.icon}
                    title={action.title}
                    description={action.description}
                    onClick={action.onClick}
                    color={action.color}
                  />
                ))}
              </div>
            </motion.div>
          </div>

          {/* System Health */}
          <SystemHealthIndicator health={data.systemHealth} />
        </div>
      </div>
    </div>
  );
} 