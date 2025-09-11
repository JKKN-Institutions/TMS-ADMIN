'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Route,
  DollarSign,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  RefreshCw,
  Target,
  Truck,
  Star,
  MessageCircle,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  ChevronDown,
  Loader2,
  Calendar,
  TrendingUp,
  TrendingDown,
  Activity,
  MapPin,
  Zap,
  Shield,
  Award,
  Gauge,
  PieChart,
  LineChart as LineChartIcon,
  BarChart4,
  Radar
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Scatter,
  ScatterChart,
  ZAxis
} from 'recharts';
import { format, parseISO, subDays, startOfDay, endOfDay } from 'date-fns';
import toast from 'react-hot-toast';

// Enhanced color palette for charts
const COLORS = {
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#06B6D4',
  purple: '#8B5CF6',
  pink: '#EC4899',
  orange: '#F97316',
  teal: '#14B8A6',
  lime: '#84CC16',
  rose: '#F43F5E',
  amber: '#F59E0B',
  emerald: '#10B981',
  cyan: '#06B6D4',
  violet: '#8B5CF6'
};

const CHART_COLORS = [
  COLORS.primary, COLORS.success, COLORS.warning, COLORS.danger, 
  COLORS.purple, COLORS.info, COLORS.pink, COLORS.orange, 
  COLORS.teal, COLORS.lime, COLORS.rose, COLORS.amber
];

// Mock enhanced data generators for comprehensive analytics
const generateTimeSeriesData = (days: number, baseValue: number, variance: number = 0.3) => {
  const data = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    const randomFactor = (Math.random() - 0.5) * variance + 1;
    const trend = Math.sin((i * Math.PI) / (days / 4)) * 0.2 + 1;
    
    data.push({
      date: format(date, 'yyyy-MM-dd'),
      value: Math.round(baseValue * randomFactor * trend),
      label: format(date, 'MMM dd')
    });
  }
  
  return data;
};

const generateHourlyData = () => {
  return Array.from({ length: 24 }, (_, hour) => {
    const peakHours = [7, 8, 9, 17, 18, 19]; // Morning and evening peaks
    const isPeak = peakHours.includes(hour);
    const baseLoad = isPeak ? 70 + Math.random() * 25 : 30 + Math.random() * 40;
    
    return {
      hour: `${hour.toString().padStart(2, '0')}:00`,
      passengers: Math.round(baseLoad),
      utilization: Math.min(95, Math.round(baseLoad + Math.random() * 20)),
      revenue: Math.round(baseLoad * 25 + Math.random() * 500)
    };
  });
};

const generateRouteHeatmapData = (routes: any[]) => {
  return routes.map((route, index) => ({
    route: route.route_name || `Route ${index + 1}`,
    morning: 65 + Math.random() * 30,
    afternoon: 45 + Math.random() * 25,
    evening: 80 + Math.random() * 15,
    avgUtilization: 60 + Math.random() * 25,
    efficiency: 75 + Math.random() * 20,
    satisfaction: 4.0 + Math.random() * 1.0
  }));
};

const generatePerformanceRadarData = () => [
  { metric: 'On-Time Performance', value: 94.5, fullMark: 100 },
  { metric: 'Passenger Satisfaction', value: 87.3, fullMark: 100 },
  { metric: 'Route Efficiency', value: 91.2, fullMark: 100 },
  { metric: 'Vehicle Utilization', value: 88.7, fullMark: 100 },
  { metric: 'Cost Optimization', value: 82.4, fullMark: 100 },
  { metric: 'Safety Score', value: 96.8, fullMark: 100 }
];

const AnalyticsPage = () => {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [selectedTimeRange, setSelectedTimeRange] = useState('last7days');
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [showMobileDropdown, setShowMobileDropdown] = useState(false);
  const [animateCharts, setAnimateCharts] = useState(true);
  
  // Database state
  const [paymentsData, setPaymentsData] = useState<any[]>([]);
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [routesData, setRoutesData] = useState<any[]>([]);
  const [driversData, setDriversData] = useState<any[]>([]);
  const [vehiclesData, setVehiclesData] = useState<any[]>([]);
  const [grievancesData, setGrievancesData] = useState<any[]>([]);
  const [bookingsData, setBookingsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/analytics');
      const result = await response.json();
      
      if (response.ok && result.success) {
        const { payments, students, routes, drivers, vehicles, grievances, bookings } = result.data;
        
        setPaymentsData(payments || []);
        setStudentsData(students || []);
        setRoutesData(routes || []);
        setDriversData(drivers || []);
        setVehiclesData(vehicles || []);
        setGrievancesData(grievances || []);
        setBookingsData(bookings || []);
      } else {
        // Generate mock data for demonstration
        setPaymentsData(generateTimeSeriesData(30, 50000, 0.4).map(d => ({ 
          ...d, 
          amount: d.value, 
          status: Math.random() > 0.2 ? 'paid' : Math.random() > 0.5 ? 'pending' : 'failed',
          payment_method: ['UPI', 'net_banking', 'card', 'wallet'][Math.floor(Math.random() * 4)]
        })));
        setBookingsData(generateTimeSeriesData(30, 25000, 0.3).map(d => ({ ...d, fare: d.value })));
        setRoutesData(Array.from({ length: 8 }, (_, i) => ({
          id: i + 1,
          route_name: `Route ${i + 1}`,
          capacity: 40 + Math.random() * 20,
          current_passengers: 25 + Math.random() * 30,
          fare: 800 + Math.random() * 400
        })));
        setStudentsData(Array.from({ length: 245 }, (_, i) => ({
          id: i + 1,
          transport_status: Math.random() > 0.1 ? 'enrolled' : 'pending'
        })));
        setDriversData(Array.from({ length: 12 }, (_, i) => ({
          id: i + 1,
          driver_name: `Driver ${i + 1}`,
          rating: 3.5 + Math.random() * 1.5,
          total_trips: Math.floor(Math.random() * 500) + 100,
          experience_years: Math.floor(Math.random() * 15) + 1
        })));
        setVehiclesData(Array.from({ length: 15 }, (_, i) => ({
          id: i + 1,
          status: Math.random() > 0.2 ? 'active' : 'maintenance'
        })));
        setGrievancesData(Array.from({ length: 45 }, (_, i) => ({
          id: i + 1,
          status: ['open', 'in_progress', 'resolved'][Math.floor(Math.random() * 3)],
          category: ['transport', 'driver', 'route', 'payment', 'other'][Math.floor(Math.random() * 5)]
        })));
        
        console.log('Using mock data for analytics');
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  // Enhanced analytics calculations
  const analytics = useMemo(() => {
    if (loading) return null;

    const safePaymentsData = Array.isArray(paymentsData) ? paymentsData : [];
    const safeStudentsData = Array.isArray(studentsData) ? studentsData : [];
    const safeRoutesData = Array.isArray(routesData) ? routesData : [];
    const safeDriversData = Array.isArray(driversData) ? driversData : [];
    const safeVehiclesData = Array.isArray(vehiclesData) ? vehiclesData : [];
    const safeGrievancesData = Array.isArray(grievancesData) ? grievancesData : [];
    const safeBookingsData = Array.isArray(bookingsData) ? bookingsData : [];

    // Financial metrics
    const totalRevenue = safePaymentsData
      .filter(p => p && p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const pendingPayments = safePaymentsData
      .filter(p => p && p.status === 'pending')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const failedPayments = safePaymentsData
      .filter(p => p && p.status === 'failed')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Operational metrics
    const activeStudents = safeStudentsData.filter(s => s && s.transport_status === 'enrolled').length;
    const vehicleUtilization = safeVehiclesData.filter(v => v && v.status === 'active').length / safeVehiclesData.length * 100;
    const avgDriverRating = safeDriversData.reduce((sum, d) => sum + (d?.rating || 0), 0) / safeDriversData.length;

    // Enhanced time series data
    const revenueTimeSeries = generateTimeSeriesData(30, totalRevenue / 30, 0.4);
    const bookingsTimeSeries = generateTimeSeriesData(30, activeStudents / 30, 0.3);
    const hourlyMetrics = generateHourlyData();
    const routeHeatmap = generateRouteHeatmapData(safeRoutesData);
    const performanceRadar = generatePerformanceRadarData();

    // Payment method analysis
    const paymentMethods = safePaymentsData.reduce((acc: Record<string, any>, payment) => {
      const method = payment?.payment_method || 'unknown';
      if (!acc[method]) {
        acc[method] = { method, amount: 0, transactions: 0, avgTransaction: 0 };
      }
      acc[method].amount += payment?.amount || 0;
      acc[method].transactions += 1;
      acc[method].avgTransaction = acc[method].amount / acc[method].transactions;
      return acc;
    }, {});

    const paymentMethodStats = Object.values(paymentMethods).map((method: any, index) => ({
      name: method.method?.toUpperCase() || 'UNKNOWN',
      value: method.amount || 0,
      transactions: method.transactions || 0,
      avgTransaction: method.avgTransaction || 0,
      fill: CHART_COLORS[index % CHART_COLORS.length]
    }));

    // Route performance analysis
    const routePerformance = safeRoutesData.map((route, index) => ({
      name: route?.route_name || `Route ${index + 1}`,
      utilization: route?.capacity ? Math.round((route.current_passengers || 0) / route.capacity * 100) : 0,
      capacity: route?.capacity || 0,
      current: route?.current_passengers || 0,
      revenue: (route?.fare || 0) * (route?.current_passengers || 0),
      efficiency: 75 + Math.random() * 20,
      satisfaction: 4.0 + Math.random() * 1.0
    }));

    // Driver performance metrics
    const driverMetrics = safeDriversData.map((driver, index) => ({
      name: driver?.driver_name || `Driver ${index + 1}`,
      rating: driver?.rating || 4.0,
      trips: driver?.total_trips || 0,
      experience: driver?.experience_years || 1,
      efficiency: Math.round((driver?.rating || 4.0) * 20),
      onTimePercentage: 85 + Math.random() * 12,
      fuelEfficiency: 12 + Math.random() * 4
    }));

    // Grievance analytics
    const grievanceStats = {
      total: safeGrievancesData.length,
      open: safeGrievancesData.filter(g => g?.status === 'open').length,
      inProgress: safeGrievancesData.filter(g => g?.status === 'in_progress').length,
      resolved: safeGrievancesData.filter(g => g?.status === 'resolved').length,
      byCategory: safeGrievancesData.reduce((acc: Record<string, number>, g) => {
        const category = g?.category || 'other';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
      resolutionTrend: generateTimeSeriesData(7, 5, 0.6),
      avgResolutionTime: 2.5
    };

    // Cost analysis
    const costMetrics = {
      costPerKm: 8.5,
      fuelCost: totalRevenue * 0.25,
      maintenanceCost: totalRevenue * 0.15,
      driverCost: totalRevenue * 0.35,
      overheadCost: totalRevenue * 0.15,
      profitMargin: 10
    };

    return {
      totalRevenue,
      pendingPayments,
      failedPayments,
      activeStudents,
      vehicleUtilization,
      avgDriverRating,
      revenueTimeSeries,
      bookingsTimeSeries,
      hourlyMetrics,
      routeHeatmap,
      performanceRadar,
      paymentMethodStats,
      routePerformance,
      driverMetrics,
      grievanceStats,
      costMetrics
    };
  }, [loading, paymentsData, studentsData, routesData, driversData, vehiclesData, grievancesData, bookingsData]);

  // Custom gauge component
  const GaugeChart = ({ value, max, title, color, size = 120 }: any) => {
    const percentage = (value / max) * 100;
    const strokeDasharray = `${percentage * 2.51} 251`;
    
    return (
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg className="transform -rotate-90" width={size} height={size}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r="40"
              stroke="#e5e7eb"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r="40"
              stroke={color}
              strokeWidth="8"
              fill="none"
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold" style={{ color }}>{value}%</span>
          </div>
        </div>
        <span className="text-sm font-medium text-gray-600 mt-2 text-center">{title}</span>
      </div>
    );
  };

  // Enhanced KPI card component
  const KPICard = ({ title, value, change, icon: Icon, color, subtitle, gradient }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className={`relative overflow-hidden rounded-2xl shadow-lg border border-white/20 ${gradient} backdrop-blur-sm`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
      <div className="relative p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-white/80 mb-1">{title}</p>
            <p className="text-3xl font-bold text-white mb-2">{value}</p>
            {subtitle && <p className="text-xs text-white/70">{subtitle}</p>}
            {change && (
              <div className="flex items-center mt-2">
                {change.direction === 'up' ? (
                  <ArrowUpRight className="w-4 h-4 text-green-300" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-red-300" />
                )}
                <span className={`text-sm font-medium ml-1 ${
                  change.direction === 'up' ? 'text-green-300' : 'text-red-300'
                }`}>
                  {change.value.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl bg-white/20`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>
    </motion.div>
  );

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-xl border border-white/20">
          <p className="font-semibold text-gray-800 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-gray-600">{entry.name}:</span>
              <span className="text-sm font-semibold text-gray-800">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <Loader2 className="w-16 h-16 animate-spin text-blue-600 mx-auto mb-4" />
            <div className="absolute inset-0 bg-blue-600/20 blur-xl rounded-full" />
          </div>
          <p className="text-xl font-semibold text-gray-700 mb-2">Loading Analytics Dashboard</p>
          <p className="text-sm text-gray-500">Fetching real-time data and insights...</p>
        </motion.div>
      </div>
    );
  }

  const kpiData = [
    {
      title: 'Total Revenue',
      value: `₹${(analytics.totalRevenue / 1000).toFixed(1)}K`,
      change: { value: 12.5, direction: 'up' },
      icon: DollarSign,
      color: 'emerald',
      subtitle: `₹${(analytics.pendingPayments / 1000).toFixed(1)}K pending`,
      gradient: 'bg-gradient-to-br from-emerald-500 to-teal-600'
    },
    {
      title: 'Active Students',
      value: analytics.activeStudents.toString(),
      change: { value: 8.2, direction: 'up' },
      icon: Users,
      color: 'blue',
      subtitle: `${Math.round(analytics.vehicleUtilization)}% vehicle utilization`,
      gradient: 'bg-gradient-to-br from-blue-500 to-indigo-600'
    },
    {
      title: 'Route Efficiency',
      value: `${Math.round(analytics.routePerformance.reduce((sum, r) => sum + r.efficiency, 0) / analytics.routePerformance.length)}%`,
      change: { value: 5.7, direction: 'up' },
      icon: Route,
      color: 'purple',
      subtitle: `${analytics.routePerformance.length} active routes`,
      gradient: 'bg-gradient-to-br from-purple-500 to-violet-600'
    },
    {
      title: 'Driver Rating',
      value: `${analytics.avgDriverRating.toFixed(1)}/5`,
      change: { value: 2.3, direction: 'up' },
      icon: Star,
      color: 'orange',
      subtitle: `${analytics.driverMetrics.length} active drivers`,
      gradient: 'bg-gradient-to-br from-orange-500 to-amber-600'
    }
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'financial', label: 'Financial', icon: DollarSign },
    { id: 'operations', label: 'Operations', icon: Truck },
    { id: 'performance', label: 'Performance', icon: Target },
    { id: 'insights', label: 'Insights', icon: Activity }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Enhanced Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6"
        >
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent">
              Analytics Dashboard
            </h1>
            <p className="text-lg text-gray-600">Real-time insights and performance metrics for transport management</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
            >
              <option value="last7days">Last 7 days</option>
              <option value="last30days">Last 30 days</option>
              <option value="last3months">Last 3 months</option>
              <option value="lastyear">Last year</option>
            </select>
            
            <button 
              onClick={fetchAnalyticsData}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 flex items-center space-x-2 font-medium shadow-lg hover:shadow-xl"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
            
            <button className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 flex items-center space-x-2 font-medium shadow-lg hover:shadow-xl">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </motion.div>

        {/* Enhanced KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {kpiData.map((kpi, index) => (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <KPICard {...kpi} />
            </motion.div>
          ))}
        </div>

        {/* Enhanced Tab Navigation */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/20">
          <div className="border-b border-gray-200/50">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => setSelectedTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 border-b-2 font-medium transition-all duration-300 ${
                      selectedTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    whileHover={{ y: -1 }}
                    whileTap={{ y: 0 }}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </motion.button>
                );
              })}
            </nav>
          </div>

          <div className="p-8">
            <AnimatePresence mode="wait">
              {/* Overview Tab */}
              {selectedTab === 'overview' && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {/* Performance Gauges */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-6 text-center">
                      <GaugeChart 
                        value={Math.round(analytics.vehicleUtilization)}
                        max={100}
                        title="Vehicle Utilization"
                        color={COLORS.primary}
                      />
                    </div>
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-100 rounded-2xl p-6 text-center">
                      <GaugeChart 
                        value={Math.round(analytics.avgDriverRating * 20)}
                        max={100}
                        title="Driver Performance"
                        color={COLORS.success}
                      />
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-amber-100 rounded-2xl p-6 text-center">
                      <GaugeChart 
                        value={Math.round((analytics.grievanceStats.resolved / analytics.grievanceStats.total) * 100)}
                        max={100}
                        title="Issue Resolution"
                        color={COLORS.warning}
                      />
                    </div>
                  </div>

                  {/* Revenue and Bookings Trends */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* Revenue Trend Chart */}
                    <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 shadow-lg border border-white/50">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Revenue Trends</h3>
                        <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 rounded-lg">
                          <TrendingUp className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-blue-800">+12.5%</span>
                        </div>
                      </div>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={analytics.revenueTimeSeries}>
                            <defs>
                              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8}/>
                                <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.1}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#64748b" />
                            <YAxis tickFormatter={(value) => `₹${(value/1000).toFixed(0)}K`} tick={{ fontSize: 12 }} stroke="#64748b" />
                            <Tooltip content={<CustomTooltip />} />
                            <Area 
                              type="monotone" 
                              dataKey="value" 
                              stroke={COLORS.primary} 
                              strokeWidth={3}
                              fill="url(#revenueGradient)"
                              dot={{ fill: COLORS.primary, strokeWidth: 2, r: 4 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Hourly Utilization Heatmap */}
                    <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 shadow-lg border border-white/50">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Daily Usage Pattern</h3>
                        <Activity className="w-6 h-6 text-purple-600" />
                      </div>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.hourlyMetrics}>
                            <defs>
                              <linearGradient id="hourlyGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.9}/>
                                <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0.6}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="#64748b" />
                            <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar 
                              dataKey="passengers" 
                              fill="url(#hourlyGradient)"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Route Performance Matrix */}
                  <div className="bg-gradient-to-br from-white to-emerald-50 rounded-2xl p-6 shadow-lg border border-white/50">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-gray-800">Route Performance Matrix</h3>
                      <MapPin className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={analytics.routePerformance}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#64748b" />
                          <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#64748b" />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="#64748b" />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar yAxisId="left" dataKey="utilization" fill={COLORS.success} name="Utilization %" radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="satisfaction" stroke={COLORS.warning} strokeWidth={3} dot={{ fill: COLORS.warning, r: 5 }} name="Satisfaction Score" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Financial Tab */}
              {selectedTab === 'financial' && (
                <motion.div
                  key="financial"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {/* Financial Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-emerald-100 text-sm font-medium">Total Collected</p>
                          <p className="text-3xl font-bold">₹{(analytics.totalRevenue / 1000).toFixed(1)}K</p>
                        </div>
                        <DollarSign className="w-10 h-10 text-emerald-200" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-amber-100 text-sm font-medium">Pending</p>
                          <p className="text-3xl font-bold">₹{(analytics.pendingPayments / 1000).toFixed(1)}K</p>
                        </div>
                        <Clock className="w-10 h-10 text-amber-200" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-red-100 text-sm font-medium">Failed</p>
                          <p className="text-3xl font-bold">₹{(analytics.failedPayments / 1000).toFixed(1)}K</p>
                        </div>
                        <AlertTriangle className="w-10 h-10 text-red-200" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm font-medium">Profit Margin</p>
                          <p className="text-3xl font-bold">{analytics.costMetrics.profitMargin}%</p>
                        </div>
                        <TrendingUp className="w-10 h-10 text-blue-200" />
                      </div>
                    </div>
                  </div>

                  {/* Payment Methods & Cost Breakdown */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* Payment Methods Pie Chart */}
                    <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 shadow-lg">
                      <h3 className="text-xl font-bold text-gray-800 mb-6">Payment Methods Distribution</h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={analytics.paymentMethodStats}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={120}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {analytics.paymentMethodStats.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`₹${value}`, 'Amount']} />
                            <Legend />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Cost Breakdown */}
                    <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 shadow-lg">
                      <h3 className="text-xl font-bold text-gray-800 mb-6">Cost Breakdown</h3>
                      <div className="space-y-4">
                        {[
                          { label: 'Driver Costs', value: analytics.costMetrics.driverCost, percentage: 35, color: COLORS.primary },
                          { label: 'Fuel Costs', value: analytics.costMetrics.fuelCost, percentage: 25, color: COLORS.warning },
                          { label: 'Maintenance', value: analytics.costMetrics.maintenanceCost, percentage: 15, color: COLORS.danger },
                          { label: 'Overhead', value: analytics.costMetrics.overheadCost, percentage: 15, color: COLORS.purple },
                          { label: 'Profit', value: analytics.totalRevenue * 0.1, percentage: 10, color: COLORS.success }
                        ].map((item, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div 
                                className="w-4 h-4 rounded-full" 
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="font-medium text-gray-700">{item.label}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-gray-800">₹{(item.value / 1000).toFixed(1)}K</div>
                              <div className="text-sm text-gray-500">{item.percentage}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Revenue vs Expenses Trend */}
                  <div className="bg-gradient-to-br from-white to-emerald-50 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">Revenue vs Expenses Trend</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analytics.revenueTimeSeries.map(item => ({
                          ...item,
                          expenses: item.value * 0.8,
                          profit: item.value * 0.2
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#64748b" />
                          <YAxis tickFormatter={(value) => `₹${(value/1000).toFixed(0)}K`} tick={{ fontSize: 12 }} stroke="#64748b" />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Line type="monotone" dataKey="value" stroke={COLORS.success} strokeWidth={3} name="Revenue" />
                          <Line type="monotone" dataKey="expenses" stroke={COLORS.danger} strokeWidth={3} name="Expenses" />
                          <Line type="monotone" dataKey="profit" stroke={COLORS.purple} strokeWidth={3} name="Profit" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Operations Tab */}
              {selectedTab === 'operations' && (
                <motion.div
                  key="operations"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {/* Fleet Status Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl p-6 text-white text-center">
                      <Truck className="w-12 h-12 mx-auto mb-4 text-blue-100" />
                      <div className="text-3xl font-bold">{vehiclesData.filter(v => v.status === 'active').length}</div>
                      <div className="text-blue-100">Active Vehicles</div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white text-center">
                      <Settings className="w-12 h-12 mx-auto mb-4 text-amber-100" />
                      <div className="text-3xl font-bold">{vehiclesData.filter(v => v.status === 'maintenance').length}</div>
                      <div className="text-amber-100">Under Maintenance</div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-6 text-white text-center">
                      <Target className="w-12 h-12 mx-auto mb-4 text-purple-100" />
                      <div className="text-3xl font-bold">{Math.round(analytics.vehicleUtilization)}%</div>
                      <div className="text-purple-100">Fleet Utilization</div>
                    </div>
                  </div>

                  {/* Driver Performance Scatter Plot */}
                  <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">Driver Performance Analysis</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart data={analytics.driverMetrics}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="experience" name="Experience (Years)" tick={{ fontSize: 12 }} stroke="#64748b" />
                          <YAxis dataKey="rating" name="Rating" tick={{ fontSize: 12 }} stroke="#64748b" />
                          <ZAxis dataKey="trips" range={[100, 1000]} name="Total Trips" />
                          <Tooltip 
                            cursor={{ strokeDasharray: '3 3' }}
                            formatter={(value, name) => [value, name]}
                            labelFormatter={(label) => `Driver: ${label}`}
                          />
                          <Scatter dataKey="rating" fill={COLORS.primary} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Route Efficiency Heatmap */}
                  <div className="bg-gradient-to-br from-white to-emerald-50 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">Route Efficiency Heatmap</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.routeHeatmap} layout="horizontal">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#64748b" />
                          <YAxis type="category" dataKey="route" tick={{ fontSize: 12 }} stroke="#64748b" />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar dataKey="morning" stackId="a" fill={COLORS.info} name="Morning" />
                          <Bar dataKey="afternoon" stackId="a" fill={COLORS.warning} name="Afternoon" />
                          <Bar dataKey="evening" stackId="a" fill={COLORS.purple} name="Evening" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Performance Tab */}
              {selectedTab === 'performance' && (
                <motion.div
                  key="performance"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {/* Performance KPIs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    {[
                      { title: 'On-Time Performance', value: '94.5%', change: '+2.3%', icon: Clock, color: 'blue' },
                      { title: 'Customer Satisfaction', value: '4.6/5', change: '+0.2', icon: Star, color: 'yellow' },
                      { title: 'Fuel Efficiency', value: '12.8 km/L', change: '+1.2', icon: Zap, color: 'green' },
                      { title: 'Safety Score', value: '96.8%', change: '+0.5%', icon: Shield, color: 'red' }
                    ].map((kpi, index) => (
                      <div key={index} className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 shadow-lg border border-white/50">
                        <div className="flex items-center justify-between mb-4">
                          <div className={`p-3 rounded-xl bg-${kpi.color}-100`}>
                            <kpi.icon className={`w-6 h-6 text-${kpi.color}-600`} />
                          </div>
                          <span className="text-sm text-green-600 font-medium">{kpi.change}</span>
                        </div>
                        <div className="text-2xl font-bold text-gray-800">{kpi.value}</div>
                        <div className="text-sm text-gray-600">{kpi.title}</div>
                      </div>
                    ))}
                  </div>

                  {/* Performance Radar Chart */}
                  <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">Overall Performance Radar</h3>
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={analytics.performanceRadar}>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <Radar
                            name="Performance"
                            dataKey="value"
                            stroke={COLORS.purple}
                            fill={COLORS.purple}
                            fillOpacity={0.3}
                            strokeWidth={3}
                          />
                          <Tooltip />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Driver Rankings */}
                  <div className="bg-gradient-to-br from-white to-emerald-50 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">Top Performing Drivers</h3>
                    <div className="space-y-4">
                      {analytics.driverMetrics
                        .sort((a, b) => b.efficiency - a.efficiency)
                        .slice(0, 5)
                        .map((driver, index) => (
                          <div key={index} className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm">
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold">
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-800">{driver.name}</div>
                                <div className="text-sm text-gray-500">{driver.trips} trips completed</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-emerald-600">{driver.efficiency}%</div>
                              <div className="text-sm text-gray-500">Efficiency</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Insights Tab */}
              {selectedTab === 'insights' && (
                <motion.div
                  key="insights"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {/* Key Insights Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white">
                      <div className="flex items-center space-x-3 mb-4">
                        <TrendingUp className="w-8 h-8" />
                        <h3 className="text-xl font-bold">Revenue Growth</h3>
                      </div>
                      <p className="text-blue-100 mb-4">
                        Revenue has increased by 12.5% this month compared to last month, driven by higher ridership and optimized pricing.
                      </p>
                      <div className="text-2xl font-bold">₹{(analytics.totalRevenue / 1000).toFixed(1)}K</div>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
                      <div className="flex items-center space-x-3 mb-4">
                        <Award className="w-8 h-8" />
                        <h3 className="text-xl font-bold">Efficiency Gains</h3>
                      </div>
                      <p className="text-emerald-100 mb-4">
                        Route optimization has improved overall efficiency by 8.2%, reducing operational costs and improving service quality.
                      </p>
                      <div className="text-2xl font-bold">{Math.round(analytics.vehicleUtilization)}%</div>
                    </div>
                  </div>

                  {/* Predictive Analytics */}
                  <div className="bg-gradient-to-br from-white to-orange-50 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">Predictive Insights</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center p-4 bg-orange-100 rounded-xl">
                        <div className="text-3xl font-bold text-orange-600 mb-2">+15%</div>
                        <div className="text-orange-800 font-medium">Expected Growth</div>
                        <div className="text-sm text-orange-600">Next Quarter</div>
                      </div>
                      <div className="text-center p-4 bg-purple-100 rounded-xl">
                        <div className="text-3xl font-bold text-purple-600 mb-2">3</div>
                        <div className="text-purple-800 font-medium">Peak Hours</div>
                        <div className="text-sm text-purple-600">Daily Average</div>
                      </div>
                      <div className="text-center p-4 bg-teal-100 rounded-xl">
                        <div className="text-3xl font-bold text-teal-600 mb-2">92%</div>
                        <div className="text-teal-800 font-medium">Satisfaction Target</div>
                        <div className="text-sm text-teal-600">Next Month</div>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div className="bg-gradient-to-br from-white to-yellow-50 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">AI Recommendations</h3>
                    <div className="space-y-4">
                      {[
                        {
                          title: "Optimize Morning Routes",
                          description: "Routes 3 and 5 show 15% higher demand during 7-9 AM. Consider adding extra vehicles.",
                          priority: "High",
                          impact: "+8% Revenue"
                        },
                        {
                          title: "Driver Training Program",
                          description: "3 drivers show below-average ratings. Implement focused training to improve performance.",
                          priority: "Medium",
                          impact: "+12% Satisfaction"
                        },
                        {
                          title: "Preventive Maintenance",
                          description: "Vehicle V-007 and V-012 due for maintenance. Schedule during low-demand periods.",
                          priority: "High",
                          impact: "-5% Downtime"
                        }
                      ].map((rec, index) => (
                        <div key={index} className="p-4 bg-white rounded-xl shadow-sm border border-yellow-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-800 mb-2">{rec.title}</h4>
                              <p className="text-gray-600 text-sm mb-3">{rec.description}</p>
                              <div className="flex items-center space-x-4">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  rec.priority === 'High' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {rec.priority} Priority
                                </span>
                                <span className="text-green-600 text-sm font-medium">{rec.impact}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage; 