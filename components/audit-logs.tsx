'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Search,
  Filter,
  Download,
  Eye,
  User,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Calendar,
  Globe,
  Smartphone,
  Monitor,
  FileText,
  Settings,
  Trash2,
  X,
  ChevronDown,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_name?: string;
  old_values?: any;
  new_values?: any;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'success' | 'failed' | 'pending';
  metadata?: any;
  created_at: string;
}

interface AuditLogFilters {
  user_id?: string;
  action?: string;
  resource_type?: string;
  severity?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  
  // Filter state
  const [filters, setFilters] = useState<AuditLogFilters>({
    search: '',
    severity: '',
    status: '',
    resource_type: '',
    date_from: '',
    date_to: ''
  });
  
  // Sort state
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Activity types for filtering
  const [activityTypes, setActivityTypes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAuditLogs();
  }, [filters, pagination.page, sortBy, sortOrder]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder,
        ...(filters.search && { search: filters.search }),
        ...(filters.severity && { severity: filters.severity }),
        ...(filters.status && { status: filters.status }),
        ...(filters.resource_type && { resource_type: filters.resource_type }),
        ...(filters.date_from && { date_from: filters.date_from }),
        ...(filters.date_to && { date_to: filters.date_to })
      });

      const response = await fetch(`/api/admin/audit-logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      
      const result = await response.json();
      setLogs(result.data || []);
      setPagination(prev => ({
        ...prev,
        total: result.pagination?.total || 0,
        totalPages: result.pagination?.totalPages || 0
      }));
      
      if (result.metadata?.activity_types) {
        setActivityTypes(result.metadata.activity_types);
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Create CSV content
      const headers = [
        'Timestamp',
        'User',
        'Action',
        'Resource',
        'Status',
        'Severity',
        'IP Address',
        'Details'
      ];
      
      const csvContent = [
        headers.join(','),
        ...logs.map(log => [
          new Date(log.created_at).toLocaleString(),
          log.user_email || 'System',
          log.action,
          `${log.resource_type}${log.resource_name ? `:${log.resource_name}` : ''}`,
          log.status,
          log.severity,
          log.ip_address || 'Unknown',
          log.metadata ? JSON.stringify(log.metadata).replace(/,/g, ';') : ''
        ].map(field => `"${field}"`).join(','))
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Audit logs exported successfully');
    } catch (error) {
      console.error('Error exporting logs:', error);
      toast.error('Failed to export audit logs');
    } finally {
      setExporting(false);
    }
  };

  const openDetailModal = (log: AuditLog) => {
    setSelectedLog(log);
    setShowDetailModal(true);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-100';
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'warning':
        return 'text-orange-600 bg-orange-100';
      case 'info':
      default:
        return 'text-blue-600 bg-blue-100';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600 bg-green-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('login') || action.includes('logout')) {
      return <User className="w-4 h-4" />;
    }
    if (action.includes('security') || action.includes('permission')) {
      return <Shield className="w-4 h-4" />;
    }
    if (action.includes('system') || action.includes('maintenance')) {
      return <Settings className="w-4 h-4" />;
    }
    if (action.includes('delete')) {
      return <Trash2 className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      severity: '',
      status: '',
      resource_type: '',
      date_from: '',
      date_to: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const uniqueResourceTypes = [...new Set(logs.map(log => log.resource_type))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Logs</h2>
          <p className="text-gray-600 mt-1">Track all system activities and user actions</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            <ChevronDown className={`w-4 h-4 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || logs.length === 0}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{exporting ? 'Exporting...' : 'Export'}</span>
          </button>
          <button
            onClick={fetchAuditLogs}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-lg border border-gray-200 p-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select
                  value={filters.severity}
                  onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Severities</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resource Type</label>
                <select
                  value={filters.resource_type}
                  onChange={(e) => setFilters(prev => ({ ...prev, resource_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Resources</option>
                  {uniqueResourceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={resetFilters}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Clear Filters
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-blue-700">Total Events</div>
              <div className="text-2xl font-bold text-blue-600">{pagination.total.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-green-700">Successful</div>
              <div className="text-2xl font-bold text-green-600">
                {logs.filter(log => log.status === 'success').length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-orange-700">Warnings</div>
              <div className="text-2xl font-bold text-orange-600">
                {logs.filter(log => log.severity === 'warning' || log.severity === 'error').length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-red-700">Critical</div>
              <div className="text-2xl font-bold text-red-600">
                {logs.filter(log => log.severity === 'critical').length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP Address
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                    <span className="mt-2 text-gray-500">Loading audit logs...</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span>{formatDate(log.created_at)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                          {log.user_email ? (
                            <span className="text-xs font-medium text-gray-600">
                              {log.user_email.charAt(0).toUpperCase()}
                            </span>
                          ) : (
                            <Settings className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                        <span className="text-gray-900">
                          {log.user_email || 'System'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center space-x-2">
                        <div className="text-gray-400">
                          {getActionIcon(log.action)}
                        </div>
                        <span className="text-gray-900">
                          {activityTypes[log.action] || log.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div>
                        <div className="font-medium">{log.resource_type}</div>
                        {log.resource_name && (
                          <div className="text-gray-500 text-xs">{log.resource_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(log.status)}`}>
                        {log.status === 'success' && <CheckCircle className="w-3 h-3 mr-1" />}
                        {log.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                        {log.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(log.severity)}`}>
                        {log.severity === 'critical' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {log.severity === 'error' && <XCircle className="w-3 h-3 mr-1" />}
                        {log.severity === 'warning' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {log.severity === 'info' && <Info className="w-3 h-3 mr-1" />}
                        {log.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Globe className="w-3 h-3" />
                        <span>{log.ip_address || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDetailModal(log)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} logs
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {showDetailModal && selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Audit Log Details</h2>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedLog(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Event Information</h3>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm font-medium text-gray-700">Timestamp:</span>
                        <div className="text-sm text-gray-900">{formatDate(selectedLog.created_at)}</div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">Action:</span>
                        <div className="text-sm text-gray-900">{activityTypes[selectedLog.action] || selectedLog.action}</div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">Resource:</span>
                        <div className="text-sm text-gray-900">
                          {selectedLog.resource_type}
                          {selectedLog.resource_name && ` - ${selectedLog.resource_name}`}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">Status:</span>
                        <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedLog.status)}`}>
                          {selectedLog.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">Severity:</span>
                        <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(selectedLog.severity)}`}>
                          {selectedLog.severity}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Session Information</h3>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm font-medium text-gray-700">User:</span>
                        <div className="text-sm text-gray-900">{selectedLog.user_email || 'System'}</div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">IP Address:</span>
                        <div className="text-sm text-gray-900">{selectedLog.ip_address || 'Unknown'}</div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">User Agent:</span>
                        <div className="text-sm text-gray-900 break-all">{selectedLog.user_agent || 'Unknown'}</div>
                      </div>
                      {selectedLog.session_id && (
                        <div>
                          <span className="text-sm font-medium text-gray-700">Session ID:</span>
                          <div className="text-sm text-gray-900 font-mono">{selectedLog.session_id}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Data Changes */}
                {(selectedLog.old_values || selectedLog.new_values) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Data Changes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {selectedLog.old_values && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Previous Values</h4>
                          <pre className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs overflow-x-auto">
                            {JSON.stringify(selectedLog.old_values, null, 2)}
                          </pre>
                        </div>
                      )}
                      {selectedLog.new_values && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">New Values</h4>
                          <pre className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs overflow-x-auto">
                            {JSON.stringify(selectedLog.new_values, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedLog.metadata && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Additional Information</h3>
                    <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="flex justify-end p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedLog(null);
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AuditLogs; 