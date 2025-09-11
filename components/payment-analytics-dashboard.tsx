'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  DollarSign,
  Calendar,
  Users,
  CreditCard,
  Download,
  Filter,
  RefreshCw,
  Target,
  Award,
  Clock,
  CheckCircle,
  AlertTriangle,
  Percent
} from 'lucide-react';
import { Bar, Line, Pie, Area } from 'recharts';
import {
  BarChart,
  LineChart,
  PieChart as RechartsPieChart,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import toast from 'react-hot-toast';

interface PaymentAnalytics {
  termWiseData: {
    term: string;
    totalPayments: number;
    totalAmount: number;
    studentCount: number;
    averageAmount: number;
    color: string;
  }[];
  fullYearAdoption: {
    totalStudents: number;
    fullYearPayments: number;
    adoptionRate: number;
    totalSavings: number;
  };
  monthlyTrends: {
    month: string;
    term1: number;
    term2: number;
    term3: number;
    fullYear: number;
    totalRevenue: number;
  }[];
  paymentDistribution: {
    name: string;
    value: number;
    percentage: number;
    color: string;
  }[];
  performanceMetrics: {
    totalRevenue: number;
    totalPayments: number;
    averagePaymentValue: number;
    onTimePaymentRate: number;
    revenueGrowth: number;
    studentSatisfaction: number;
  };
}

const PaymentAnalyticsDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<PaymentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('current_year');
  const [selectedRoute, setSelectedRoute] = useState('all');
  const [routes, setRoutes] = useState<any[]>([]);

  const colorScheme = {
    term1: '#ffffff', // White for Term 1
    term2: '#3b82f6', // Blue for Term 2  
    term3: '#fbbf24', // Yellow for Term 3
    fullYear: '#10b981', // Green for Full Year
    border: '#374151'
  };

  useEffect(() => {
    fetchAnalytics();
    fetchRoutes();
  }, [selectedPeriod, selectedRoute]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // Mock comprehensive analytics data
      const mockAnalytics: PaymentAnalytics = {
        termWiseData: [
          {
            term: 'Term 1 (Jun-Sep)',
            totalPayments: 450,
            totalAmount: 900000,
            studentCount: 450,
            averageAmount: 2000,
            color: colorScheme.term1
          },
          {
            term: 'Term 2 (Oct-Jan)',
            totalPayments: 380,
            totalAmount: 760000,
            studentCount: 380,
            averageAmount: 2000,
            color: colorScheme.term2
          },
          {
            term: 'Term 3 (Feb-May)',
            totalPayments: 420,
            totalAmount: 840000,
            studentCount: 420,
            averageAmount: 2000,
            color: colorScheme.term3
          }
        ],
        fullYearAdoption: {
          totalStudents: 500,
          fullYearPayments: 125,
          adoptionRate: 25,
          totalSavings: 37500 // 5% discount on full year payments
        },
        monthlyTrends: [
          { month: 'Jun', term1: 150, term2: 0, term3: 0, fullYear: 45, totalRevenue: 570000 },
          { month: 'Jul', term1: 200, term2: 0, term3: 0, fullYear: 50, totalRevenue: 685000 },
          { month: 'Aug', term1: 100, term2: 0, term3: 0, fullYear: 30, totalRevenue: 371000 },
          { month: 'Sep', term1: 0, term2: 0, term3: 0, fullYear: 0, totalRevenue: 0 },
          { month: 'Oct', term1: 0, term2: 180, term3: 0, fullYear: 0, totalRevenue: 360000 },
          { month: 'Nov', term1: 0, term2: 200, term3: 0, fullYear: 0, totalRevenue: 400000 },
          { month: 'Dec', term1: 0, term2: 0, term3: 0, fullYear: 0, totalRevenue: 0 },
          { month: 'Jan', term1: 0, term2: 0, term3: 0, fullYear: 0, totalRevenue: 0 },
          { month: 'Feb', term1: 0, term2: 0, term3: 200, fullYear: 0, totalRevenue: 400000 },
          { month: 'Mar', term1: 0, term2: 0, term3: 220, fullYear: 0, totalRevenue: 440000 },
          { month: 'Apr', term1: 0, term2: 0, term3: 0, fullYear: 0, totalRevenue: 0 },
          { month: 'May', term1: 0, term2: 0, term3: 0, fullYear: 0, totalRevenue: 0 }
        ],
        paymentDistribution: [
          { name: 'Term 1 Individual', value: 450, percentage: 36, color: colorScheme.term1 },
          { name: 'Term 2 Individual', value: 380, percentage: 30.4, color: colorScheme.term2 },
          { name: 'Term 3 Individual', value: 420, percentage: 33.6, color: colorScheme.term3 },
          { name: 'Full Year', value: 125, percentage: 10, color: colorScheme.fullYear }
        ],
        performanceMetrics: {
          totalRevenue: 2500000,
          totalPayments: 1375,
          averagePaymentValue: 1818,
          onTimePaymentRate: 87.5,
          revenueGrowth: 15.3,
          studentSatisfaction: 4.2
        }
      };

      setAnalytics(mockAnalytics);
      toast.success('Analytics loaded successfully');
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoutes = async () => {
    try {
      // Mock route data for filtering
      setRoutes([
        { id: 'all', route_number: 'ALL', route_name: 'All Routes' },
        { id: '1', route_number: '01', route_name: 'City Center - University' },
        { id: '2', route_number: '02', route_name: 'Airport - Campus' },
        { id: '3', route_number: '03', route_name: 'Railway Station - College' }
      ]);
    } catch (error) {
      console.error('Error fetching routes:', error);
    }
  };

  const exportAnalytics = () => {
    if (!analytics) return;
    
    const data = {
      generatedAt: new Date().toISOString(),
      period: selectedPeriod,
      route: selectedRoute,
      ...analytics
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-analytics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Analytics exported successfully');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Analytics</h3>
        <p className="text-gray-600 mb-4">Unable to fetch payment analytics data</p>
        <button
          onClick={fetchAnalytics}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4 inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Analytics</h1>
          <p className="text-gray-600">3-Term Payment System Performance Dashboard</p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="current_year">Current Academic Year</option>
            <option value="last_year">Last Academic Year</option>
            <option value="last_6_months">Last 6 Months</option>
            <option value="last_3_months">Last 3 Months</option>
          </select>
          
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {routes.map(route => (
              <option key={route.id} value={route.id}>
                {route.route_number} - {route.route_name}
              </option>
            ))}
          </select>
          
          <button
            onClick={exportAnalytics}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          
          <button
            onClick={fetchAnalytics}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Key Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <DollarSign className="w-8 h-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">₹{analytics.performanceMetrics.totalRevenue.toLocaleString()}</p>
              <p className="text-sm text-green-600">+{analytics.performanceMetrics.revenueGrowth}% vs last year</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <CreditCard className="w-8 h-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Payments</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.performanceMetrics.totalPayments}</p>
              <p className="text-sm text-gray-600">₹{analytics.performanceMetrics.averagePaymentValue} avg</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <Target className="w-8 h-8 text-purple-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Full Year Adoption</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.fullYearAdoption.adoptionRate}%</p>
              <p className="text-sm text-green-600">₹{analytics.fullYearAdoption.totalSavings.toLocaleString()} saved</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">On-Time Payment Rate</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.performanceMetrics.onTimePaymentRate}%</p>
              <p className="text-sm text-blue-600">⭐ {analytics.performanceMetrics.studentSatisfaction}/5.0 satisfaction</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1: Term-wise Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Term-wise Revenue */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Term-wise Revenue Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.termWiseData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="term" />
              <YAxis />
              <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, 'Amount']} />
              <Bar dataKey="totalAmount" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Type Distribution */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Type Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPieChart>
              <Pie
                data={analytics.paymentDistribution}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percentage }) => `${name}: ${percentage}%`}
              >
                {analytics.paymentDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#374151" />
                ))}
              </Pie>
              <Tooltip />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Trends */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Payment Trends</h3>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={analytics.monthlyTrends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="term1"
              stackId="1"
              stroke={colorScheme.border}
              fill={colorScheme.term1}
              name="Term 1"
            />
            <Area
              type="monotone"
              dataKey="term2"
              stackId="1"
              stroke={colorScheme.term2}
              fill={colorScheme.term2}
              name="Term 2"
            />
            <Area
              type="monotone"
              dataKey="term3"
              stackId="1"
              stroke={colorScheme.term3}
              fill={colorScheme.term3}
              name="Term 3"
            />
            <Area
              type="monotone"
              dataKey="fullYear"
              stackId="1"
              stroke={colorScheme.fullYear}
              fill={colorScheme.fullYear}
              name="Full Year"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Full Year Adoption Analysis */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Full Year Payment Adoption Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Award className="w-10 h-10 text-green-600" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900">{analytics.fullYearAdoption.fullYearPayments}</h4>
            <p className="text-sm text-gray-600">Students chose full year</p>
            <p className="text-xs text-green-600">out of {analytics.fullYearAdoption.totalStudents} total</p>
          </div>
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Percent className="w-10 h-10 text-blue-600" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900">{analytics.fullYearAdoption.adoptionRate}%</h4>
            <p className="text-sm text-gray-600">Adoption rate</p>
            <p className="text-xs text-blue-600">Target: 30%</p>
          </div>
          <div className="text-center">
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <DollarSign className="w-10 h-10 text-purple-600" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900">₹{analytics.fullYearAdoption.totalSavings.toLocaleString()}</h4>
            <p className="text-sm text-gray-600">Student savings</p>
            <p className="text-xs text-purple-600">5% discount benefit</p>
          </div>
        </div>
      </div>

      {/* Action Items */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
          <Target className="w-5 h-5 mr-2" />
          Key Insights & Recommendations
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">🎯 Full Year Adoption</h4>
            <p className="text-sm text-blue-800">
              25% adoption rate is good but can improve. Consider marketing the 5% discount more prominently during Term 1 enrollment.
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">📈 Revenue Growth</h4>
            <p className="text-sm text-blue-800">
              15.3% revenue growth shows positive system adoption. The 3-term system is performing well compared to the old 2-semester model.
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">⏰ Payment Timing</h4>
            <p className="text-sm text-blue-800">
              87.5% on-time payment rate is excellent. The clearer term boundaries are helping students plan payments better.
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">💡 Optimization</h4>
            <p className="text-sm text-blue-800">
              Term 3 has highest adoption. Consider offering early-bird discounts for Term 1 and Term 2 to balance distribution.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentAnalyticsDashboard; 