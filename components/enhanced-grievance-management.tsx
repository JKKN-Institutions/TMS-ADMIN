'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Users,
  MessageCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Target,
  Zap,
  Plus,
  Eye,
  Edit,
  UserCheck,
  Settings,
  Calendar,
  Tag,
  Car,
  MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';

// Enhanced Grievance Management Dashboard
export default function EnhancedGrievanceManagement() {
  const [grievances, setGrievances] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGrievances, setSelectedGrievances] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState({
    status: 'all',
    category: 'all',
    priority: 'all',
    urgency: 'all',
    assignedTo: 'all',
    dateFrom: '',
    dateTo: '',
    search: '',
    tags: ''
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    fetchData();
  }, [currentPage, filters]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        include_comments: 'true'
      });

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.append(key, value);
        }
      });

      const response = await fetch(`/api/admin/grievances?${params}`);
      if (!response.ok) throw new Error('Failed to fetch grievances');

      const data = await response.json();
      setGrievances(data.data);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Error fetching grievances:', error);
      toast.error('Failed to load grievances');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/admin/grievances/analytics');
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const handleBulkOperation = async (action: string, data?: any) => {
    if (selectedGrievances.length === 0) {
      toast.error('Please select grievances first');
      return;
    }

    try {
      const response = await fetch('/api/admin/grievances/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          grievance_ids: selectedGrievances,
          data
        })
      });

      if (!response.ok) throw new Error('Bulk operation failed');

      const result = await response.json();
      toast.success(`${action} completed for ${result.affected_count} grievances`);
      
      // Reset selection and refresh data
      setSelectedGrievances([]);
      setBulkMode(false);
      fetchData();
      fetchAnalytics();
    } catch (error) {
      console.error('Bulk operation error:', error);
      toast.error('Bulk operation failed');
    }
  };

  const toggleGrievanceSelection = (grievanceId: string) => {
    setSelectedGrievances(prev => 
      prev.includes(grievanceId)
        ? prev.filter(id => id !== grievanceId)
        : [...prev, grievanceId]
    );
  };

  const selectAllGrievances = () => {
    if (selectedGrievances.length === grievances.length) {
      setSelectedGrievances([]);
    } else {
      setSelectedGrievances(grievances.map((g: any) => g.id));
    }
  };

  const exportGrievances = async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.append(key, value);
        }
      });

      const response = await fetch(`/api/admin/grievances/export?${params}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grievances-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Grievances exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed');
    }
  };

  // Enhanced Grievance Card Component
  const EnhancedGrievanceCard = ({ grievance }: { grievance: any }) => {
    const hasUnreadComments = grievance.grievance_communications?.some(
      (comm: any) => !comm.read_at && comm.sender_type === 'student'
    );

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'open': return 'bg-red-100 text-red-800 border-red-200';
        case 'in_progress': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'resolved': return 'bg-green-100 text-green-800 border-green-200';
        case 'closed': return 'bg-gray-100 text-gray-800 border-gray-200';
        default: return 'bg-gray-100 text-gray-800 border-gray-200';
      }
    };

    return (
      <div className={`bg-white rounded-xl shadow-sm border-2 p-6 hover:shadow-lg transition-all duration-200 ${
        bulkMode && selectedGrievances.includes(grievance.id) 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-200'
      }`}>
        
        {/* Header with selection */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-3 flex-1">
            {bulkMode && (
              <input
                type="checkbox"
                checked={selectedGrievances.includes(grievance.id)}
                onChange={() => toggleGrievanceSelection(grievance.id)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-1"
              />
            )}
            
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {grievance.subject}
              </h3>
              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                <span>{grievance.students?.student_name}</span>
                <span>•</span>
                <span>{grievance.students?.roll_number}</span>
                <span>•</span>
                <span>{new Date(grievance.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end space-y-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(grievance.status)}`}>
              {grievance.status.replace('_', ' ').toUpperCase()}
            </span>
            <span className="text-xs text-gray-500">
              ID: {grievance.id.slice(0, 8)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3 mb-4">
          <p className="text-sm text-gray-700 line-clamp-2">
            {grievance.description}
          </p>
          
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-gray-400" />
                <span className="font-medium">
                  {grievance.category.replace('_', ' ')} - {grievance.priority}
                </span>
              </div>
              
              {grievance.urgency && (
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-orange-400" />
                  <span>Urgency: {grievance.urgency}</span>
                </div>
              )}
              
              {grievance.routes && (
                <div className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-blue-400" />
                  <span>{grievance.routes.route_name}</span>
                </div>
              )}
            </div>
            
            <div className="space-y-1">
              {grievance.driver_name && (
                <div className="flex items-center space-x-2">
                  <UserCheck className="w-4 h-4 text-green-400" />
                  <span>Driver: {grievance.driver_name}</span>
                </div>
              )}
              
              {grievance.vehicle_registration && (
                <div className="flex items-center space-x-2">
                  <Car className="w-4 h-4 text-purple-400" />
                  <span>{grievance.vehicle_registration}</span>
                </div>
              )}
              
              {grievance.admin_users && (
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>Assigned: {grievance.admin_users.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {grievance.tags && grievance.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {grievance.tags.slice(0, 3).map((tag: string, index: number) => (
                <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                  {tag}
                </span>
              ))}
              {grievance.tags.length > 3 && (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                  +{grievance.tags.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Resolution */}
        {grievance.resolution && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Resolution</span>
            </div>
            <p className="text-sm text-green-700">{grievance.resolution}</p>
            {grievance.satisfaction_rating && (
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-xs text-green-600">Rating:</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`text-sm ${
                        star <= grievance.satisfaction_rating
                          ? 'text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    >
                      ★
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!bulkMode && (
          <div className="flex items-center space-x-2">
            <button className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm hover:bg-blue-100 flex items-center justify-center space-x-1">
              <Eye className="w-4 h-4" />
              <span>View</span>
            </button>
            
            <button className={`px-3 py-2 rounded-lg text-sm relative ${
              hasUnreadComments 
                ? 'bg-red-50 text-red-700 border border-red-200' 
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}>
              <MessageCircle className="w-4 h-4" />
              {hasUnreadComments && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
              )}
            </button>

            {grievance.status === 'open' && (
              <button className="px-3 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-sm hover:bg-yellow-100">
                <UserCheck className="w-4 h-4" />
              </button>
            )}
            
            {grievance.status === 'in_progress' && (
              <button className="px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100">
                <CheckCircle className="w-4 h-4" />
              </button>
            )}
            
            <button className="px-3 py-2 bg-gray-50 text-gray-600 rounded-lg text-sm hover:bg-gray-100">
              <Edit className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Analytics Dashboard Component
  const AnalyticsDashboard = () => {
    if (!analytics) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Grievances</p>
              <p className="text-3xl font-bold text-gray-900">{analytics.overall?.total || 0}</p>
              <p className="text-sm text-gray-500 mt-1">
                {analytics.overall?.resolutionRate?.toFixed(1) || 0}% resolved
              </p>
            </div>
            <div className="p-3 rounded-full bg-blue-50">
              <BarChart3 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Open Issues</p>
              <p className="text-3xl font-bold text-red-600">{analytics.overall?.open || 0}</p>
              <p className="text-sm text-gray-500 mt-1">
                {analytics.overall?.urgent || 0} urgent
              </p>
            </div>
            <div className="p-3 rounded-full bg-red-50">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Progress</p>
              <p className="text-3xl font-bold text-yellow-600">{analytics.overall?.inProgress || 0}</p>
              <p className="text-sm text-gray-500 mt-1">
                {analytics.overall?.overdue || 0} overdue
              </p>
            </div>
            <div className="p-3 rounded-full bg-yellow-50">
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Resolved</p>
              <p className="text-3xl font-bold text-green-600">{analytics.overall?.resolved || 0}</p>
              {analytics.resolutionTime?.average && (
                <p className="text-sm text-gray-500 mt-1">
                  Avg: {Math.round(analytics.resolutionTime.average)}h
                </p>
              )}
            </div>
            <div className="p-3 rounded-full bg-green-50">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enhanced Grievance Management</h1>
          <p className="text-gray-600">Comprehensive grievance tracking and resolution system</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={() => setBulkMode(!bulkMode)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              bulkMode 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {bulkMode ? 'Exit Bulk Mode' : 'Bulk Operations'}
          </button>
          <button
            onClick={exportGrievances}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      <AnalyticsDashboard />

      {/* Bulk Operations Bar */}
      {bulkMode && selectedGrievances.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-blue-800 font-medium">
                {selectedGrievances.length} selected
              </span>
              <button
                onClick={selectAllGrievances}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                {selectedGrievances.length === grievances.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkOperation('assign', { assigned_to: 'admin-id' })}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
              >
                Assign
              </button>
              <button
                onClick={() => handleBulkOperation('update_status', { status: 'in_progress' })}
                className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
              >
                In Progress
              </button>
              <button
                onClick={() => handleBulkOperation('resolve', { resolution: 'Bulk resolved' })}
                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="complaint">Complaint</option>
              <option value="suggestion">Suggestion</option>
              <option value="compliment">Compliment</option>
              <option value="technical_issue">Technical Issue</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search grievances..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Grievances Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {grievances.map((grievance: any) => (
            <EnhancedGrievanceCard key={grievance.id} grievance={grievance} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 