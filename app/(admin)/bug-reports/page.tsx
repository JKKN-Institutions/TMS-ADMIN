'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bug, 
  Search, 
  Filter, 
  Eye, 
  Edit3, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  User,
  Calendar,
  Tag,
  Image,
  ExternalLink,
  Download,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface BugReport {
  id: string;
  title: string;
  description: string;
  category: 'ui_ux' | 'functionality' | 'performance' | 'security' | 'data' | 'other';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'duplicate' | 'wont_fix';
  reported_by: string;
  reporter_type: 'student' | 'admin';
  reporter_email: string;
  reporter_name: string;
  browser_info: string;
  device_info: string;
  screen_resolution: string;
  page_url: string;
  user_agent: string;
  screenshot_url?: string;
  assigned_to?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

const BugReportsPage: React.FC = () => {
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Status colors and icons
  const getStatusConfig = (status: string) => {
    const configs = {
      open: { color: 'bg-red-100 text-red-800', icon: AlertTriangle, label: 'Open' },
      in_progress: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'In Progress' },
      resolved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Resolved' },
      closed: { color: 'bg-gray-100 text-gray-800', icon: XCircle, label: 'Closed' },
      duplicate: { color: 'bg-blue-100 text-blue-800', icon: XCircle, label: 'Duplicate' },
      wont_fix: { color: 'bg-purple-100 text-purple-800', icon: XCircle, label: "Won't Fix" }
    };
    return configs[status as keyof typeof configs] || configs.open;
  };

  const getPriorityConfig = (priority: string) => {
    const configs = {
      low: { color: 'bg-green-100 text-green-800', label: 'Low' },
      medium: { color: 'bg-yellow-100 text-yellow-800', label: 'Medium' },
      high: { color: 'bg-orange-100 text-orange-800', label: 'High' },
      critical: { color: 'bg-red-100 text-red-800', label: 'Critical' }
    };
    return configs[priority as keyof typeof configs] || configs.medium;
  };

  const getCategoryConfig = (category: string) => {
    const configs = {
      ui_ux: { label: 'UI/UX', color: 'bg-purple-100 text-purple-800' },
      functionality: { label: 'Functionality', color: 'bg-blue-100 text-blue-800' },
      performance: { label: 'Performance', color: 'bg-orange-100 text-orange-800' },
      security: { label: 'Security', color: 'bg-red-100 text-red-800' },
      data: { label: 'Data', color: 'bg-green-100 text-green-800' },
      other: { label: 'Other', color: 'bg-gray-100 text-gray-800' }
    };
    return configs[category as keyof typeof configs] || configs.other;
  };

  // Fetch bug reports
  const fetchBugReports = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/bug-reports');
      if (response.ok) {
        const data = await response.json();
        setBugReports(data.bugReports || []);
      } else {
        toast.error('Failed to fetch bug reports');
      }
    } catch (error) {
      console.error('Error fetching bug reports:', error);
      toast.error('Error loading bug reports');
    } finally {
      setLoading(false);
    }
  };

  // Update bug status
  const updateBugStatus = async (bugId: string, status: string, resolutionNotes?: string) => {
    try {
      const response = await fetch(`/api/admin/bug-reports/${bugId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status, 
          resolution_notes: resolutionNotes,
          resolved_at: ['resolved', 'closed'].includes(status) ? new Date().toISOString() : null
        }),
      });

      if (response.ok) {
        toast.success('Bug status updated successfully');
        fetchBugReports();
        setShowModal(false);
      } else {
        toast.error('Failed to update bug status');
      }
    } catch (error) {
      console.error('Error updating bug status:', error);
      toast.error('Error updating bug status');
    }
  };

  // Filter bug reports
  const filteredBugReports = bugReports.filter(bug => {
    const matchesSearch = bug.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bug.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bug.reporter_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || bug.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || bug.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || bug.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
  });

  useEffect(() => {
    fetchBugReports();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Bug className="h-8 w-8 text-red-600 mr-3" />
                Bug Reports Management
              </h1>
              <p className="text-gray-600 mt-2">
                Track and manage bug reports from students and administrators
              </p>
            </div>
            <button
              onClick={fetchBugReports}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search bug reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
                <option value="duplicate">Duplicate</option>
                <option value="wont_fix">Won't Fix</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Priority</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Categories</option>
                <option value="ui_ux">UI/UX</option>
                <option value="functionality">Functionality</option>
                <option value="performance">Performance</option>
                <option value="security">Security</option>
                <option value="data">Data</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Open</p>
                <p className="text-2xl font-bold text-gray-900">
                  {bugReports.filter(bug => bug.status === 'open').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">In Progress</p>
                <p className="text-2xl font-bold text-gray-900">
                  {bugReports.filter(bug => bug.status === 'in_progress').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Resolved</p>
                <p className="text-2xl font-bold text-gray-900">
                  {bugReports.filter(bug => bug.status === 'resolved').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Bug className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">{bugReports.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bug Reports Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredBugReports.length === 0 ? (
            <div className="text-center py-12">
              <Bug className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bug reports found</h3>
              <p className="text-gray-600">No bug reports match your current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bug Report
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reporter
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredBugReports.map((bug) => {
                    const statusConfig = getStatusConfig(bug.status);
                    const priorityConfig = getPriorityConfig(bug.priority);
                    const categoryConfig = getCategoryConfig(bug.category);

                    return (
                      <tr key={bug.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                              {bug.title}
                            </div>
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {bug.description}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8">
                              <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                                <User className="h-4 w-4 text-gray-600" />
                              </div>
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">
                                {bug.reporter_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {bug.reporter_type}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${categoryConfig.color}`}>
                            {categoryConfig.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${priorityConfig.color}`}>
                            {priorityConfig.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${statusConfig.color}`}>
                            <statusConfig.icon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(bug.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => {
                              setSelectedBug(bug);
                              setShowModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBug(bug);
                              setShowModal(true);
                            }}
                            className="text-green-600 hover:text-green-900"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bug Detail Modal */}
      <AnimatePresence>
        {showModal && selectedBug && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Bug Report Details</h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{selectedBug.title}</h3>
                      <p className="text-gray-700">{selectedBug.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCategoryConfig(selectedBug.category).color}`}>
                          {getCategoryConfig(selectedBug.category).label}
                        </span>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityConfig(selectedBug.priority).color}`}>
                          {getPriorityConfig(selectedBug.priority).label}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Update Status</label>
                      <div className="flex space-x-2">
                        {['open', 'in_progress', 'resolved', 'closed'].map((status) => (
                          <button
                            key={status}
                            onClick={() => updateBugStatus(selectedBug.id, status)}
                            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                              selectedBug.status === status
                                ? getStatusConfig(status).color
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {getStatusConfig(status).label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedBug.screenshot_url && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Screenshot</label>
                        <div className="border rounded-lg overflow-hidden">
                          <img
                            src={selectedBug.screenshot_url}
                            alt="Bug screenshot"
                            className="w-full h-auto"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Reporter Information</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Name</label>
                          <p className="text-sm text-gray-900">{selectedBug.reporter_name}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Email</label>
                          <p className="text-sm text-gray-900">{selectedBug.reporter_email}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Type</label>
                          <p className="text-sm text-gray-900 capitalize">{selectedBug.reporter_type}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Technical Details</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Page URL</label>
                          <a
                            href={selectedBug.page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            {selectedBug.page_url}
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Browser</label>
                          <p className="text-sm text-gray-900">{selectedBug.browser_info}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Device</label>
                          <p className="text-sm text-gray-900">{selectedBug.device_info}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Screen Resolution</label>
                          <p className="text-sm text-gray-900">{selectedBug.screen_resolution}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Created</label>
                          <p className="text-sm text-gray-900">{formatDate(selectedBug.created_at)}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Last Updated</label>
                          <p className="text-sm text-gray-900">{formatDate(selectedBug.updated_at)}</p>
                        </div>
                        {selectedBug.resolved_at && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Resolved</label>
                            <p className="text-sm text-gray-900">{formatDate(selectedBug.resolved_at)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BugReportsPage;
