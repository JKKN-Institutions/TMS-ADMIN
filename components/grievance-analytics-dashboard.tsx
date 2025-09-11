'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle,
  Target,
  Calendar,
  Star,
  MessageSquare,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';

interface AnalyticsData {
  overall: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    urgent: number;
    overdue: number;
    resolutionRate: number;
  };
  statusBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, Record<string, number>>;
  priorityBreakdown: Record<string, number>;
  urgencyBreakdown: Record<string, number>;
  resolutionTime: {
    average: number;
    byPriority: Record<string, number>;
    total: number;
  };
  assignments: {
    unassigned: number;
    assigned: number;
    workloadByAdmin: Record<string, {
      name: string;
      total: number;
      open: number;
      inProgress: number;
      resolved: number;
    }>;
  };
  trends: Record<string, { created: number; resolved: number }>;
  topIssues: {
    keywords: Array<{ word: string; count: number }>;
    tags: Array<{ tag: string; count: number }>;
  };
  satisfaction: {
    average: number;
    total: number;
    distribution: Record<string, number>;
  };
}

const MetricCard = ({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon, 
  color = 'blue' 
}: {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'increase' | 'decrease' | 'neutral';
  icon: any;
  color?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="card-gradient group hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] cursor-pointer"
  >
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300 ${
            color === 'blue' ? 'bg-gradient-to-br from-blue-400 to-blue-600' :
            color === 'green' ? 'bg-gradient-to-br from-green-400 to-green-600' :
            color === 'red' ? 'bg-gradient-to-br from-red-400 to-red-600' :
            color === 'orange' ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
            'bg-gradient-to-br from-gray-400 to-gray-600'
          }`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          {change && (
            <div className={`flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${
              changeType === 'increase' ? 'bg-green-50 text-green-600' : 
              changeType === 'decrease' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'
            }`}>
              {changeType === 'increase' && <TrendingUp className="w-4 h-4 mr-1" />}
              {changeType === 'decrease' && <TrendingDown className="w-4 h-4 mr-1" />}
              <span>{change}</span>
            </div>
          )}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
            {value}
          </h3>
          <p className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
            {title}
          </p>
        </div>
      </div>
    </div>
  </motion.div>
);

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
    {children}
  </div>
);

const ProgressBar = ({ 
  label, 
  value, 
  total, 
  color = 'blue' 
}: { 
  label: string; 
  value: number; 
  total: number; 
  color?: string; 
}) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500">{value} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`bg-${color}-600 h-2 rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const DataTable = ({ 
  data, 
  columns 
}: { 
  data: Array<Record<string, any>>; 
  columns: Array<{ key: string; label: string; render?: (value: any) => React.ReactNode }>;
}) => (
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row, index) => (
          <tr key={index} className="hover:bg-gray-50">
            {columns.map((column) => (
              <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {column.render ? column.render(row[column.key]) : row[column.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function GrievanceAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    to: new Date().toISOString().split('T')[0]
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        date_from: dateRange.from,
        date_to: dateRange.to
      });
      
      const response = await fetch(`/api/admin/grievances/analytics?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  const exportData = () => {
    if (!analytics) return;
    
    const csvContent = [
      ['Metric', 'Value'],
      ['Total Grievances', analytics.overall.total],
      ['Open', analytics.overall.open],
      ['In Progress', analytics.overall.inProgress],
      ['Resolved', analytics.overall.resolved],
      ['Resolution Rate', `${analytics.overall.resolutionRate.toFixed(1)}%`],
      ['Average Resolution Time', `${analytics.resolutionTime?.average?.toFixed(1) || 0} hours`],
      ['Satisfaction Score', analytics.satisfaction?.average?.toFixed(1) || 'N/A']
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grievance_analytics_${dateRange.from}_to_${dateRange.to}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center p-12">
        <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
        <p className="text-gray-500">Unable to load analytics data</p>
      </div>
    );
  }

  const workloadData = Object.values(analytics.assignments.workloadByAdmin).map(admin => ({
    name: admin.name,
    total: admin.total,
    open: admin.open,
    inProgress: admin.inProgress,
    resolved: admin.resolved,
    efficiency: admin.total > 0 ? ((admin.resolved / admin.total) * 100).toFixed(1) : '0'
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Grievance Analytics</h1>
          <p className="text-gray-600 mt-1">Comprehensive insights and performance metrics</p>
        </div>
        
        <div className="flex items-center space-x-4 mt-4 lg:mt-0">
          {/* Date Range Selector */}
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          
          <button
            onClick={exportData}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Grievances"
          value={analytics.overall.total}
          icon={MessageSquare}
          color="blue"
        />
        <MetricCard
          title="Open & In Progress"
          value={analytics.overall.open + analytics.overall.inProgress}
          icon={Clock}
          color="orange"
        />
        <MetricCard
          title="Resolution Rate"
          value={`${analytics.overall.resolutionRate.toFixed(1)}%`}
          icon={Target}
          color="green"
        />
        <MetricCard
          title="Avg Resolution Time"
          value={`${analytics.resolutionTime?.average?.toFixed(1) || 0}h`}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Status and Priority Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Status Breakdown">
          <div className="space-y-4">
            {Object.entries(analytics.statusBreakdown).map(([status, count]) => (
              <ProgressBar
                key={status}
                label={status.replace('_', ' ').toUpperCase()}
                value={count}
                total={analytics.overall.total}
                color={
                  status === 'open' ? 'red' :
                  status === 'in_progress' ? 'yellow' :
                  status === 'resolved' ? 'green' : 'gray'
                }
              />
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Priority Distribution">
          <div className="space-y-4">
            {Object.entries(analytics.priorityBreakdown).map(([priority, count]) => (
              <ProgressBar
                key={priority}
                label={priority.toUpperCase()}
                value={count}
                total={analytics.overall.total}
                color={
                  priority === 'urgent' ? 'red' :
                  priority === 'high' ? 'orange' :
                  priority === 'medium' ? 'yellow' : 'green'
                }
              />
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="Resolution Time by Priority">
          <div className="space-y-3">
            {Object.entries(analytics.resolutionTime?.byPriority || {}).map(([priority, time]) => (
              <div key={priority} className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 capitalize">{priority}</span>
                <span className="text-sm text-gray-900">{time.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Assignment Status">
          <div className="space-y-4">
            <ProgressBar
              label="Assigned"
              value={analytics.assignments.assigned}
              total={analytics.assignments.assigned + analytics.assignments.unassigned}
              color="green"
            />
            <ProgressBar
              label="Unassigned"
              value={analytics.assignments.unassigned}
              total={analytics.assignments.assigned + analytics.assignments.unassigned}
              color="red"
            />
          </div>
        </ChartCard>

        <ChartCard title="Satisfaction Score">
          {analytics.satisfaction?.total > 0 ? (
            <div className="text-center">
              <div className="flex items-center justify-center mb-4">
                <Star className="w-8 h-8 text-yellow-400 fill-current" />
                <span className="text-3xl font-bold text-gray-900 ml-2">
                  {analytics.satisfaction.average.toFixed(1)}
                </span>
                <span className="text-gray-500 ml-1">/5.0</span>
              </div>
              <p className="text-sm text-gray-600">
                Based on {analytics.satisfaction.total} ratings
              </p>
              <div className="mt-4 space-y-2">
                {[5, 4, 3, 2, 1].map(rating => (
                  <div key={rating} className="flex items-center text-sm">
                    <span className="w-8">{rating}★</span>
                    <div className="flex-1 mx-2 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-400 h-2 rounded-full"
                        style={{
                          width: `${((analytics.satisfaction.distribution[rating] || 0) / analytics.satisfaction.total) * 100}%`
                        }}
                      />
                    </div>
                    <span className="w-8 text-right">{analytics.satisfaction.distribution[rating] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <Star className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p>No ratings yet</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Admin Workload */}
      {workloadData.length > 0 && (
        <ChartCard title="Admin Workload Distribution">
          <DataTable
            data={workloadData}
            columns={[
              { key: 'name', label: 'Admin Name' },
              { key: 'total', label: 'Total Assigned' },
              { key: 'open', label: 'Open' },
              { key: 'inProgress', label: 'In Progress' },
              { key: 'resolved', label: 'Resolved' },
              { 
                key: 'efficiency', 
                label: 'Efficiency',
                render: (value) => (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    parseFloat(value) >= 80 ? 'bg-green-100 text-green-800' :
                    parseFloat(value) >= 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {value}%
                  </span>
                )
              }
            ]}
          />
        </ChartCard>
      )}

      {/* Top Issues */}
      {analytics.topIssues && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Top Keywords">
            <div className="space-y-2">
              {analytics.topIssues.keywords.map((keyword, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-sm text-gray-700">{keyword.word}</span>
                  <span className="text-sm font-medium text-gray-900">{keyword.count}</span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Popular Tags">
            <div className="space-y-2">
              {analytics.topIssues.tags.map((tag, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-sm text-gray-700">#{tag.tag}</span>
                  <span className="text-sm font-medium text-gray-900">{tag.count}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
} 