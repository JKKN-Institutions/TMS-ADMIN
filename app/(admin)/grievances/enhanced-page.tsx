'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Eye,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Users,
  Route as RouteIcon,
  Star,
  ThumbsUp,
  MessageSquare,
  Filter,
  Download,
  UserCheck,
  Calendar,
  Settings,
  X,
  Loader2,
  BarChart3,
  TrendingUp,
  Target,
  Zap,
  FileText,
  Tag,
  Send,
  Car,
  Archive,
  UserX,
  List
} from 'lucide-react';
import toast from 'react-hot-toast';

// Modal component imports
import GrievanceDetailsModal from '@/components/grievance-details-modal';
import AssignGrievanceModal from '@/components/assign-grievance-modal';
import ResolveGrievanceModal from '@/components/resolve-grievance-modal';
import GrievanceUpdateModal from '@/components/grievance-update-modal';
import AdminGrievanceGroupChatModal from '@/components/admin-grievance-group-chat-modal';
import BulkAssignGrievancesModal from '@/components/bulk-assign-grievances-modal';

// Enhanced Grievance Card Component
const EnhancedGrievanceCard = ({ 
  grievance, 
  onAssign, 
  onResolve, 
  onView, 
  onUpdate,
  onComment,
  userRole, 
  selectionMode = false, 
  isSelected = false, 
  onToggleSelection 
}: any) => {
  const canAssign = ['super_admin', 'operations_admin'].includes(userRole);
  const canResolve = ['super_admin', 'operations_admin'].includes(userRole);
  const canUpdate = ['super_admin', 'operations_admin'].includes(userRole);

  console.log('🔧 Card Debug:', {
    grievanceId: grievance.id,
    grievanceStatus: grievance.status,
    userRole: userRole,
    canAssign: canAssign,
    assignButtonVisible: grievance.status === 'open' && canAssign
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800 border-red-200';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'resolved': return 'bg-green-100 text-green-800 border-green-200';
      case 'closed': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'escalated': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusDisplay = (status: string, grievance: any) => {
    // Check if we have stored display status or internal notes that indicate the real status
    const internalNotes = grievance.internal_notes?.toLowerCase() || '';
    
    // If status is in_progress, check notes to determine the actual display status
    if (status === 'in_progress') {
      if (internalNotes.includes('pending approval') || internalNotes.includes('pending_approval')) {
        return 'PENDING APPROVAL';
      }
      if (internalNotes.includes('on hold') || internalNotes.includes('on_hold')) {
        return 'ON HOLD';
      }
      if (internalNotes.includes('under review') || internalNotes.includes('under_review')) {
        return 'UNDER REVIEW';
      }
      return 'IN PROGRESS';
    }
    
    // For other statuses, return standard display
    return status.replace('_', ' ').toUpperCase();
  };

  const getStatusColorForDisplay = (status: string, grievance: any) => {
    const internalNotes = grievance.internal_notes?.toLowerCase() || '';
    
    if (status === 'in_progress') {
      if (internalNotes.includes('pending approval')) {
        return 'bg-blue-100 text-blue-800 border-blue-200';
      }
      if (internalNotes.includes('on hold')) {
        return 'bg-gray-100 text-gray-600 border-gray-200';
      }
      if (internalNotes.includes('under review')) {
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      }
    }
    
    return getStatusColor(status);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'complaint': return AlertTriangle;
      case 'suggestion': return MessageSquare;
      case 'compliment': return ThumbsUp;
      case 'technical_issue': return Settings;
      default: return MessageCircle;
    }
  };

  const CategoryIcon = getCategoryIcon(grievance.category);
  const hasUnreadComments = grievance.grievance_communications?.some(
    (comm: any) => !comm.read_at && comm.sender_type === 'student'
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl shadow-sm border-2 p-6 hover:shadow-lg transition-all duration-200 min-h-[400px] flex flex-col ${
        selectionMode && isSelected 
          ? 'border-indigo-500 bg-indigo-50 shadow-lg' 
          : 'border-gray-200'
      } ${hasUnreadComments ? 'ring-2 ring-blue-200' : ''}`}
    >
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            {selectionMode && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelection(grievance.id)}
                className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 flex-shrink-0 mt-1"
              />
            )}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              grievance.category === 'complaint' ? 'bg-red-100' :
              grievance.category === 'suggestion' ? 'bg-blue-100' :
              grievance.category === 'compliment' ? 'bg-green-100' :
              grievance.category === 'technical_issue' ? 'bg-purple-100' : 'bg-gray-100'
            }`}>
              <CategoryIcon className={`w-6 h-6 ${
                grievance.category === 'complaint' ? 'text-red-600' :
                grievance.category === 'suggestion' ? 'text-blue-600' :
                grievance.category === 'compliment' ? 'text-green-600' :
                grievance.category === 'technical_issue' ? 'text-purple-600' : 'text-gray-600'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 leading-tight mb-2 break-words">{grievance.subject}</h3>
              <div className="flex items-center space-x-2">
                <p className="text-sm text-gray-600 truncate">{grievance.students?.student_name}</p>
                <span className="text-gray-400 flex-shrink-0">•</span>
                <p className="text-sm text-gray-600 truncate">{grievance.students?.roll_number}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Status badges in separate row for better spacing */}
        <div className="flex flex-wrap gap-2 justify-end">
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColorForDisplay(grievance.status, grievance)}`}>
            {getStatusDisplay(grievance.status, grievance)}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(grievance.priority)}`}>
            {grievance.priority.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Tags */}
      {grievance.tags && grievance.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {grievance.tags.slice(0, 3).map((tag: string, index: number) => (
            <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
              <Tag className="w-3 h-3 mr-1" />
              {tag}
            </span>
          ))}
          {grievance.tags.length > 3 && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
              +{grievance.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center space-x-2">
          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
            grievance.category === 'complaint' ? 'bg-red-100 text-red-800' :
            grievance.category === 'suggestion' ? 'bg-blue-100 text-blue-800' :
            grievance.category === 'compliment' ? 'bg-green-100 text-green-800' :
            grievance.category === 'technical_issue' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
          }`}>
            {grievance.category.replace('_', ' ').toUpperCase()}
          </span>
          {grievance.grievance_type && (
            <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {grievance.grievance_type.replace('_', ' ').toUpperCase()}
            </span>
          )}
        </div>
        
        <p className="text-sm text-gray-700 leading-relaxed break-words overflow-hidden" style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical'
        }}>{grievance.description}</p>
        
        {/* Metadata */}
        <div className="space-y-2 text-sm">
          {grievance.routes && (
            <div className="flex items-center space-x-2 text-gray-600">
              <RouteIcon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{grievance.routes.route_name} ({grievance.routes.route_number})</span>
            </div>
          )}
          {grievance.driver_name && (
            <div className="flex items-center space-x-2 text-gray-600">
              <UserCheck className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Driver: {grievance.driver_name}</span>
            </div>
          )}
          {grievance.vehicle_registration && (
            <div className="flex items-center space-x-2 text-gray-600">
              <Car className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Vehicle: {grievance.vehicle_registration}</span>
            </div>
          )}
          <div className="flex items-center space-x-2 text-gray-600">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Created: {new Date(grievance.created_at).toLocaleDateString()}</span>
          </div>
          {grievance.admin_users && (
            <div className="flex items-center space-x-2 text-blue-600">
              <User className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Assigned to: {grievance.admin_users.name}</span>
            </div>
          )}
          {grievance.estimated_resolution_time && (
            <div className="flex items-center space-x-2 text-orange-600">
              <Target className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">SLA: {grievance.estimated_resolution_time}</span>
            </div>
          )}
        </div>
      </div>

      {/* Resolution */}
      {grievance.resolution && (
        <div className="border-t border-gray-100 pt-4 mb-4">
          <div className="bg-green-50 rounded-lg p-3 border border-green-200">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Resolution</span>
              {grievance.resolution_category && (
                <span className="text-xs text-green-600">({grievance.resolution_category})</span>
              )}
            </div>
            <p className="text-sm text-green-700">{grievance.resolution}</p>
            {grievance.satisfaction_rating && (
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-xs text-green-600">Student Rating:</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= grievance.satisfaction_rating
                          ? 'text-yellow-400 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {!selectionMode && (
        <div className="mt-auto pt-4 border-t border-gray-100">
          <div className="flex gap-2">
            <button
              onClick={() => onView(grievance)}
              className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1 min-w-0"
            >
              <Eye className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Details</span>
            </button>
            
            <button
              onClick={() => onComment(grievance)}
              className={`px-3 py-2 border rounded-lg transition-colors relative flex-shrink-0 ${
                hasUnreadComments 
                  ? 'border-blue-300 bg-blue-50 text-blue-700' 
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
              title="Comments"
            >
              <MessageCircle className="w-4 h-4" />
              {hasUnreadComments && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
              )}
            </button>

            {grievance.status === 'open' && canAssign && (
              <button
                onClick={() => onAssign(grievance)}
                className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-yellow-50 transition-colors flex-shrink-0"
                title="Assign"
              >
                <User className="w-4 h-4 text-gray-600" />
              </button>
            )}
            
            {['open', 'in_progress', 'resolved'].includes(grievance.status) && canUpdate && (
              <div className="relative">
                <button
                  onClick={() => onUpdate(grievance)}
                  className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
                  title="Update Status & Details"
                >
                  <Edit className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            )}
            
            {grievance.status === 'in_progress' && canResolve && (
              <button
                onClick={() => onResolve(grievance)}
                className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-green-50 transition-colors flex-shrink-0"
                title="Resolve"
              >
                <CheckCircle className="w-4 h-4 text-gray-600" />
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Analytics Dashboard Component
const AnalyticsDashboard = ({ analytics }: { analytics: any }) => {
  if (!analytics) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* Overall Stats */}
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
            <MessageSquare className="h-8 w-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Open Grievances */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Open</p>
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

      {/* In Progress */}
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

      {/* Resolved */}
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

// Enhanced Filters Component
const EnhancedFilters = ({ filters, onFilterChange, onReset }: any) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        <button
          onClick={onReset}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Reset All
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
          <select
            value={filters.category}
            onChange={(e) => onFilterChange('category', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            <option value="complaint">Complaint</option>
            <option value="suggestion">Suggestion</option>
            <option value="compliment">Compliment</option>
            <option value="technical_issue">Technical Issue</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
          <select
            value={filters.priority}
            onChange={(e) => onFilterChange('priority', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Urgency Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Urgency</label>
          <select
            value={filters.urgency}
            onChange={(e) => onFilterChange('urgency', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Urgency</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Assigned To Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
          <select
            value={filters.assignedTo}
            onChange={(e) => onFilterChange('assignedTo', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            <option value="me">Assigned to Me</option>
            {/* Add dynamic assignees here */}
          </select>
        </div>
      </div>
    </div>
  );
};

export default function EnhancedGrievancesPage() {
  const [user, setUser] = useState<any>(null);
  const [grievances, setGrievances] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGrievances, setSelectedGrievances] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  
  // Enhanced filtering states
  const [activeTab, setActiveTab] = useState('new'); // new, in_progress, resolved, closed, all
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    priority: 'all',
    dateRange: 'all',
    assignee: 'all'
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0
  });

  // Modal states
  const [modals, setModals] = useState({
    details: { isOpen: false, grievance: null },
    assign: { isOpen: false, grievance: null },
    resolve: { isOpen: false, grievance: null },
    update: { isOpen: false, grievance: null },
    communication: { isOpen: false, grievance: null },
    groupChat: { isOpen: false, grievance: null },
    bulkAssign: { isOpen: false, grievances: [] as any[] }
  });

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      const parsedUser = JSON.parse(userData);
      // Ensure admin users have proper role permissions
      if (!parsedUser.role || parsedUser.role === 'admin') {
        parsedUser.role = 'operations_admin';
      }
      console.log('👤 User data loaded:', parsedUser);
      setUser(parsedUser);
    } else {
      console.log('❌ No user data found in localStorage');
    }
    fetchData();
  }, [activeTab, filters, pagination.page]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Get user info
      const storedUser = localStorage.getItem('adminUser');
      if (!storedUser) {
        window.location.href = '/login';
        return;
      }
      
      const userData = JSON.parse(storedUser);
      setUser(userData);

      // Build query parameters based on role and tab
      const queryParams = new URLSearchParams();
      
      // Status-based filtering based on active tab
      switch (activeTab) {
        case 'new':
          queryParams.append('status', 'open');
          break;
        case 'in_progress':
          queryParams.append('status', 'in_progress');
          break;
        case 'resolved':
          queryParams.append('status', 'resolved');
          break;
        case 'closed':
          queryParams.append('status', 'closed');
          break;
        case 'unassigned':
          // Only for super admin - show unassigned grievances
          if (userData.role === 'super_admin') {
            queryParams.append('unassigned', 'true');
          }
          break;
        // 'all' shows everything (respecting role restrictions)
      }
      
      // Role-based filtering - but not for unassigned tab
      if (userData.role !== 'super_admin' && activeTab !== 'unassigned') {
        // Non-super admins see only assigned grievances
        queryParams.append('assigned_to', userData.id);
      }

      // Add other filters
      if (filters.search) queryParams.append('search', filters.search);
      if (filters.category !== 'all') queryParams.append('category', filters.category);
      if (filters.priority !== 'all') queryParams.append('priority', filters.priority);
      if (filters.dateRange !== 'all') queryParams.append('date_range', filters.dateRange);

      // Fetch grievances with role-based filtering
      console.log('🔍 Fetching grievances with params:', queryParams.toString());
      console.log('🔍 User data:', userData);
      console.log('🔍 Active tab:', activeTab);
      
      const response = await fetch(`/api/admin/grievances?${queryParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch grievances');
      
      const data = await response.json();
      console.log('📊 Received grievances:', data.grievances?.length || 0);
      console.log('📊 Sample grievance:', data.grievances?.[0]);
      
      setGrievances(data.grievances || []);

      // Fetch analytics (role-based)
      const analyticsResponse = await fetch(`/api/admin/grievances/analytics?${queryParams.toString()}`);
      if (analyticsResponse.ok) {
        const analyticsData = await analyticsResponse.json();
        setAnalytics(analyticsData);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load grievances');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      category: 'all',
      priority: 'all',
      dateRange: 'all',
      assignee: 'all'
    });
  };

  // Tab configuration based on user role
  const getTabsForRole = (userRole: string) => {
    const commonTabs = [
      { id: 'new', label: 'New', icon: AlertTriangle, color: 'text-red-600' },
      { id: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-yellow-600' },
      { id: 'resolved', label: 'Resolved', icon: CheckCircle, color: 'text-green-600' },
      { id: 'closed', label: 'Closed', icon: Archive, color: 'text-gray-600' }
    ];

    if (userRole === 'super_admin') {
      return [
        { id: 'unassigned', label: 'Unassigned', icon: UserX, color: 'text-orange-600' },
        ...commonTabs,
        { id: 'all', label: 'All', icon: List, color: 'text-blue-600' }
      ];
    }

    return [
      ...commonTabs,
      { id: 'all', label: 'My All', icon: User, color: 'text-blue-600' }
    ];
  };

  // Get count for each tab
  const getTabCount = (tabId: string) => {
    if (!analytics) return 0;
    
    switch (tabId) {
      case 'new':
        return analytics.overall?.open || 0;
      case 'in_progress':
        return analytics.overall?.inProgress || 0;
      case 'resolved':
        return analytics.overall?.resolved || 0;
      case 'closed':
        return analytics.overall?.closed || 0;
      case 'unassigned':
        return analytics.overall?.unassigned || 0;
      case 'all':
        return analytics.overall?.total || 0;
      default:
        return 0;
    }
  };

  // Modal handlers
  const openModal = (type: string, grievance: any = null) => {
    setModals(prev => ({
      ...prev,
      [type]: { isOpen: true, grievance }
    }));
  };

  const closeModal = (type: string) => {
    if (type === 'bulkAssign') {
      setModals(prev => ({
        ...prev,
        bulkAssign: { isOpen: false, grievances: [] }
      }));
    } else {
      setModals(prev => ({
        ...prev,
        [type]: { isOpen: false, grievance: null }
      }));
    }
  };

  // CRUD operations
  const handleViewGrievance = (grievance: any) => {
    openModal('details', grievance);
  };

  const handleCommentGrievance = (grievance: any) => {
    openModal('groupChat', grievance);
  };

  const handleAssignGrievance = (grievance: any) => {
    console.log('🎯 Assignment button clicked for grievance:', grievance.id);
    openModal('assign', grievance);
  };

  const handleUpdateGrievance = (grievance: any) => {
    openModal('update', grievance);
  };

  const handleResolveGrievance = (grievance: any) => {
    openModal('resolve', grievance);
  };

  // Selection handlers
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedGrievances([]);
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
      setSelectedGrievances(grievances.map(g => g.id));
    }
  };

  const handleBulkAssign = () => {
    if (selectedGrievances.length === 0) {
      toast.error('Please select grievances to assign');
      return;
    }
    const selectedGrievanceObjects = grievances.filter(g => selectedGrievances.includes(g.id));
    setModals(prev => ({
      ...prev,
      bulkAssign: { isOpen: true, grievances: selectedGrievanceObjects }
    }));
  };

  const handleExport = () => {
    const csvContent = [
      ['ID', 'Subject', 'Category', 'Type', 'Priority', 'Urgency', 'Status', 'Student', 'Created', 'Assigned To', 'Resolution'],
      ...grievances.map(grievance => [
        grievance.id,
        grievance.subject,
        grievance.category,
        grievance.grievance_type || '',
        grievance.priority,
        grievance.urgency || '',
        grievance.status,
        grievance.students?.student_name || '',
        new Date(grievance.created_at).toLocaleDateString(),
        grievance.admin_users?.name || '',
        grievance.resolution || ''
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grievances_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Grievances exported successfully!');
  };

  const canManage = user && ['super_admin', 'operations_admin'].includes(user.role);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Loading grievances...</p>
          <p className="text-gray-500 text-sm">Please wait while we fetch the latest data</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-gray-600 mb-4">Please log in to access this page.</p>
          <a href="/login" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  const tabs = getTabsForRole(user.role);

  return (
    <div className="p-6 space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Enhanced Grievance Management</h1>
          <p className="text-gray-600 mt-1">Comprehensive grievance tracking and resolution system</p>
          {/* Debug info */}
          <div className="mt-2 text-sm text-gray-500">
            Logged in as: {user?.name} ({user?.role}) - ID: {user?.id}
          </div>
        </div>
        
        <div className="flex items-center space-x-3 mt-4 lg:mt-0">
          {selectionMode && (
            <div className="flex items-center space-x-2 bg-indigo-50 px-4 py-2 rounded-lg">
              <span className="text-sm text-indigo-700 font-medium">
                {selectedGrievances.length} selected
              </span>
              <button
                onClick={selectAllGrievances}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                {selectedGrievances.length === grievances.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          
          <button
            onClick={handleExport}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          
          <button
            onClick={toggleSelectionMode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              selectionMode 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                : 'border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{selectionMode ? 'Exit Bulk Mode' : 'Bulk Actions'}</span>
          </button>
          
          {selectionMode && selectedGrievances.length > 0 && (
            <button
              onClick={handleBulkAssign}
              className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              <UserCheck className="w-4 h-4" />
              <span>Bulk Assign ({selectedGrievances.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Analytics Dashboard */}
      <AnalyticsDashboard analytics={analytics} />

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search grievances by subject, description, student name, or roll number..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Enhanced Filters */}
      <EnhancedFilters 
        filters={filters} 
        onFilterChange={handleFilterChange}
        onReset={resetFilters}
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${tab.color}`} />
            <span>{tab.label}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
              {getTabCount(tab.id)}
            </span>
          </button>
        ))}
      </div>

      {/* Grievances Grid */}
      {grievances.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            <AnimatePresence>
              {grievances.map((grievance) => (
                <EnhancedGrievanceCard
                  key={grievance.id}
                  grievance={grievance}
                  onAssign={handleAssignGrievance}
                  onResolve={handleResolveGrievance}
                  onView={handleViewGrievance}
                  onUpdate={handleUpdateGrievance}
                  onComment={handleCommentGrievance}
                  userRole={user?.role}
                  selectionMode={selectionMode}
                  isSelected={selectedGrievances.includes(grievance.id)}
                  onToggleSelection={toggleGrievanceSelection}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-700">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page === pagination.totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
          <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900 mb-2">No grievances found</h3>
          <p className="text-gray-500 mb-6">
            {Object.values(filters).some(f => f !== 'all' && f !== '')
              ? 'Try adjusting your filters to see more results'
              : 'No grievances have been submitted yet'}
          </p>
          {Object.values(filters).some(f => f !== 'all' && f !== '') && (
            <button
              onClick={resetFilters}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      <GrievanceDetailsModal
        isOpen={modals.details.isOpen}
        onClose={() => closeModal('details')}
        grievance={modals.details.grievance}
        currentUser={user}
      />

      <AssignGrievanceModal
        isOpen={modals.assign.isOpen}
        onClose={() => closeModal('assign')}
        onAssign={async (grievanceId: string, assignmentData: any) => {
          console.log('🔄 Starting grievance assignment process');
          console.log('📋 Grievance ID:', grievanceId);
          console.log('📄 Assignment Data:', assignmentData);
          
          try {
            const response = await fetch(`/api/admin/grievances/${grievanceId}/assign`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(assignmentData)
            });

            console.log('📡 API Response Status:', response.status);
            console.log('📡 API Response OK:', response.ok);

            if (!response.ok) {
              const errorData = await response.json();
              console.error('❌ API Error Response:', errorData);
              throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ Assignment Success Response:', result);
            
            await fetchData(); // Refresh data
            closeModal('assign');
            toast.success('Grievance assigned successfully!');
          } catch (error) {
            console.error('❌ Assignment Error:', error);
            toast.error('Failed to assign grievance');
          }
        }}
        grievance={modals.assign.grievance}
      />

      <ResolveGrievanceModal
        isOpen={modals.resolve.isOpen}
        onClose={() => closeModal('resolve')}
        onResolve={async (grievanceId: string, resolutionData: any) => {
          try {
            const response = await fetch(`/api/admin/grievances/${grievanceId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status: 'resolved',
                resolution: resolutionData.resolution,
                resolved_at: new Date().toISOString(),
                ...resolutionData
              })
            });

            if (!response.ok) throw new Error('Failed to resolve grievance');
            
            await fetchData(); // Refresh data
            closeModal('resolve');
            toast.success('Grievance resolved successfully!');
          } catch (error) {
            console.error('Error resolving grievance:', error);
            toast.error('Failed to resolve grievance');
          }
        }}
        grievance={modals.resolve.grievance}
      />

      <GrievanceUpdateModal
        isOpen={modals.update.isOpen}
        onClose={() => closeModal('update')}
        onUpdate={async (grievanceId: string, updateData: any) => {
          try {
            const response = await fetch(`/api/admin/grievances/${grievanceId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updateData)
            });

            if (!response.ok) throw new Error('Failed to update grievance');
            
            closeModal('update');
            toast.success('Grievance updated successfully!');
            
            // Force refresh the page to show updated data
            setTimeout(() => {
              window.location.reload();
            }, 500);
            
          } catch (error) {
            console.error('Error updating grievance:', error);
            toast.error('Failed to update grievance');
          }
        }}
        grievance={modals.update.grievance}
      />

      <AdminGrievanceGroupChatModal
        isOpen={modals.groupChat.isOpen}
        onClose={() => closeModal('groupChat')}
        grievance={modals.groupChat.grievance}
        currentAdminId={user?.id || ''}
        currentAdminName={user?.name || 'Admin'}
      />

      <BulkAssignGrievancesModal
        isOpen={modals.bulkAssign.isOpen}
        onClose={() => {
          closeModal('bulkAssign');
          setSelectedGrievances([]);
          setSelectionMode(false);
        }}
        onBulkAssign={async (grievanceIds: string[], assignmentData: any) => {
          try {
            // Handle bulk assignment through API
            const response = await fetch('/api/admin/grievances/bulk-assign', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                grievanceIds: grievanceIds,
                assignmentData: assignmentData
              })
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
              await fetchData(); // Refresh data
              toast.success(result.message || `${grievanceIds.length} grievances assigned successfully!`);
            } else {
              throw new Error(result.error || 'Failed to assign grievances');
            }
          } catch (error) {
            console.error('Error in bulk assignment:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to assign grievances');
          }
          
          closeModal('bulkAssign');
          setSelectedGrievances([]);
          setSelectionMode(false);
        }}
        selectedGrievances={modals.bulkAssign.grievances}
      />
    </div>
  );
} 