'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bug, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  BarChart3,
  PieChart,
  Calendar
} from 'lucide-react';
import { motion } from 'framer-motion';

interface BugStatistics {
  totalBugs: number;
  openBugs: number;
  inProgressBugs: number;
  resolvedBugs: number;
  closedBugs: number;
  criticalBugs: number;
  highPriorityBugs: number;
  averageResolutionTime: number;
  bugsThisWeek: number;
  bugsThisMonth: number;
  categoryBreakdown: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  priorityBreakdown: Array<{
    priority: string;
    count: number;
    percentage: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    bugs: number;
    resolved: number;
  }>;
}

const BugStatisticsComponent: React.FC = () => {
  const [statistics, setStatistics] = useState<BugStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  useEffect(() => {
    fetchStatistics();
  }, [timeRange]);

  const fetchStatistics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/bug-reports/statistics?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setStatistics(data.statistics);
      }
    } catch (error) {
      console.error('Error fetching bug statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
        <Bug className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No statistics available</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    const colors = {
      open: 'text-red-600 bg-red-100',
      in_progress: 'text-yellow-600 bg-yellow-100',
      resolved: 'text-green-600 bg-green-100',
      closed: 'text-gray-600 bg-gray-100',
      critical: 'text-red-600 bg-red-100',
      high: 'text-orange-600 bg-orange-100'
    };
    return colors[status as keyof typeof colors] || 'text-gray-600 bg-gray-100';
  };

  const resolutionRate = statistics.totalBugs > 0 
    ? ((statistics.resolvedBugs + statistics.closedBugs) / statistics.totalBugs * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Bug Report Statistics</h2>
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bug className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Bugs</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.totalBugs}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Open Issues</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.openBugs}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Resolution Rate</p>
              <p className="text-2xl font-bold text-gray-900">{resolutionRate}%</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Avg. Resolution</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.averageResolutionTime}h</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center mb-4">
            <BarChart3 className="h-5 w-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Status Breakdown</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Open</span>
              <div className="flex items-center">
                <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                  <div 
                    className="bg-red-500 h-2 rounded-full" 
                    style={{ width: `${(statistics.openBugs / statistics.totalBugs) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">{statistics.openBugs}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">In Progress</span>
              <div className="flex items-center">
                <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full" 
                    style={{ width: `${(statistics.inProgressBugs / statistics.totalBugs) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">{statistics.inProgressBugs}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Resolved</span>
              <div className="flex items-center">
                <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${(statistics.resolvedBugs / statistics.totalBugs) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">{statistics.resolvedBugs}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Closed</span>
              <div className="flex items-center">
                <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                  <div 
                    className="bg-gray-500 h-2 rounded-full" 
                    style={{ width: `${(statistics.closedBugs / statistics.totalBugs) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">{statistics.closedBugs}</span>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center mb-4">
            <PieChart className="h-5 w-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Category Distribution</h3>
          </div>
          
          <div className="space-y-3">
            {statistics.categoryBreakdown.map((category, index) => (
              <div key={category.category} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 capitalize">
                  {category.category.replace('_', ' ')}
                </span>
                <div className="flex items-center">
                  <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                    <div 
                      className={`h-2 rounded-full`}
                      style={{ 
                        width: `${category.percentage}%`,
                        backgroundColor: `hsl(${index * 60}deg, 70%, 50%)`
                      }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{category.count}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Priority Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <div className="flex items-center mb-4">
          <TrendingUp className="h-5 w-5 text-gray-500 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Priority Analysis</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {statistics.priorityBreakdown.map((priority) => (
            <div key={priority.priority} className="text-center">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(priority.priority)}`}>
                {priority.priority.charAt(0).toUpperCase() + priority.priority.slice(1)}
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-gray-900">{priority.count}</div>
                <div className="text-sm text-gray-500">{priority.percentage.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{statistics.bugsThisWeek}</div>
            <div className="text-sm text-gray-500">Bugs This Week</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{statistics.bugsThisMonth}</div>
            <div className="text-sm text-gray-500">Bugs This Month</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {statistics.criticalBugs + statistics.highPriorityBugs}
            </div>
            <div className="text-sm text-gray-500">High Priority Issues</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default BugStatisticsComponent;
