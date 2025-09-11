'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { 
  User, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  MessageSquare,
  Filter,
  Search,
  Eye,
  Edit,
  Calendar,
  X,
  MessageCircle,
  AlertCircle,
  Play,
  Check,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  Award,
  Zap,
  Target,
  Users,
  Star,
  BarChart3
} from 'lucide-react';
import AdminGrievanceGroupChatModal from '../../../components/admin-grievance-group-chat-modal';

// Import enhanced components
import EnhancedStatCard from '../../../components/enhanced-stat-card';
import { EnhancedButton } from '../../../components/enhanced-form-components';
import { LoadingSpinner, EmptyState } from '../../../components/enhanced-loading-states';

// Utility function to format dates
const formatDate = (dateString: string) => {
  if (!dateString) return 'Not set';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return 'Invalid date';
  }
};

interface Grievance {
  id: string;
  category: string;
  priority: string;
  subject: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  expected_resolution_date?: string;
  student: {
    id: string;
    student_name: string;
    email: string;
    roll_number: string;
  };
  route?: {
    id: string;
    route_name: string;
    route_number: string;
  };
  driver_name?: string;
  resolution?: string;
}

interface Summary {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  high_priority: number;
  urgent: number;
}

// Enhanced summary stats component
const EnhancedSummaryStats = ({ summary }: { summary: Summary }) => {
  const statsData = [
    {
      title: 'Total Assigned',
      value: summary.total,
      icon: MessageSquare,
      color: 'blue' as const
    },
    {
      title: 'Open',
      value: summary.open,
      icon: AlertCircle,
      color: 'cyan' as const
    },
    {
      title: 'In Progress',
      value: summary.in_progress,
      icon: Activity,
      color: 'yellow' as const
    },
    {
      title: 'Resolved',
      value: summary.resolved,
      icon: CheckCircle,
      color: 'green' as const
    },
    {
      title: 'High Priority',
      value: summary.high_priority,
      icon: AlertTriangle,
      color: 'red' as const
    },
    {
      title: 'Urgent',
      value: summary.urgent,
      icon: Zap,
      color: 'red' as const
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      {statsData.map((stat, index) => (
        <EnhancedStatCard
          key={index}
          title={stat.title}
          value={stat.value}
          icon={stat.icon}
          color={stat.color}
        />
      ))}
    </div>
  );
};

export default function MyGrievancesPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
    high_priority: 0,
    urgent: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    search: ''
  });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  // Get current admin ID and user info from session storage
  const [currentAdminId, setCurrentAdminId] = useState<string>('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Get admin ID and user info from session storage (same as enhanced grievances page)
    const getUserData = () => {
      // Get user info from localStorage (same as enhanced grievances page)
      const storedUser = localStorage.getItem('adminUser');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          console.log('🎯 Found stored user data:', userData);
          setUser(userData);
          return userData.id;
        } catch (error) {
          console.error('Error parsing stored user data:', error);
        }
      }
      
      // Fallback: try to get from other localStorage keys
      const stored = localStorage.getItem('adminId') || localStorage.getItem('currentAdminId');
      if (stored) {
        console.log('🔍 Found stored admin ID:', stored);
        return stored;
      }
      
      // Fallback: try URL params
      const urlParams = new URLSearchParams(window.location.search);
      const urlAdminId = urlParams.get('adminId');
      if (urlAdminId) {
        console.log('🔍 Found URL admin ID:', urlAdminId);
        return urlAdminId;
      }
      
      console.log('⚠️ No admin ID found, redirecting to login');
      window.location.href = '/login';
      return null;
    };
    
    const adminId = getUserData();
    if (adminId) {
      console.log('🎯 Setting admin ID:', adminId);
      setCurrentAdminId(adminId);
    }
  }, []);

  useEffect(() => {
    if (currentAdminId) {
      fetchAssignedGrievances();
    }
  }, [filters, page, currentAdminId]);

  const fetchAssignedGrievances = async () => {
    if (!currentAdminId) {
      console.log('❌ No admin ID available yet');
      return;
    }
    
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        adminId: currentAdminId,
        status: filters.status,
        priority: filters.priority,
        page: page.toString(),
        limit: '10'
      });

      const apiUrl = `/api/admin/grievances/assigned?${params}`;
      console.log('🌐 Making API call to:', apiUrl);
      console.log('🔍 Request params:', {
        adminId: currentAdminId,
        status: filters.status,
        priority: filters.priority,
        page: page.toString(),
        limit: '10'
      });

      const response = await fetch(apiUrl);
      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch grievances`);
      }

      const result = await response.json();
      console.log('📋 API Response:', result);
      
      if (result.success) {
        console.log('✅ Success! Processing data...');
        console.log('📊 Grievances data:', result.data.grievances);
        console.log('📈 Summary data:', result.data.summary);
        console.log('📄 Pagination data:', result.data.pagination);
        
        setGrievances(result.data.grievances);
        setSummary(result.data.summary);
        setPagination(result.data.pagination);
        
        console.log('✅ State updated successfully');
      } else {
        console.error('❌ API returned success: false', result.error);
        throw new Error(result.error || 'Failed to fetch grievances');
      }
    } catch (error) {
      console.error('💥 Error fetching grievances:', error);
      toast.error('Failed to load assigned grievances: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
      console.log('🏁 fetchAssignedGrievances completed');
    }
  };

  const handleQuickStatusUpdate = async (grievanceId: string, newStatus: string) => {
    try {
      console.log('⚡ Quick status update:', { grievanceId, newStatus });
      
      const response = await fetch('/api/admin/grievances/assigned', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grievanceId,
          adminId: currentAdminId,
          updates: { status: newStatus }
        }),
      });

      const result = await response.json();
      console.log('📡 Quick update response:', result);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${result.error || 'Failed to update status'}`);
      }
      
      if (result.success) {
        console.log('✅ Quick status updated successfully');
        toast.success(result.message || `Status updated to ${newStatus.replace('_', ' ')}`);
        
        // Refresh the grievances list
        fetchAssignedGrievances();
      } else {
        throw new Error(result.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('💥 Quick status update error:', error);
      toast.error('Failed to update status: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const updateGrievanceStatus = async (grievanceId: string, status: string, resolution?: string) => {
    try {
      const response = await fetch('/api/admin/grievances/assigned', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grievanceId,
          adminId: currentAdminId,
          updates: { status, resolution }
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Grievance updated successfully');
        fetchAssignedGrievances();
        setSelectedGrievance(null);
      } else {
        throw new Error(result.error || 'Failed to update grievance');
      }
    } catch (error) {
      console.error('Error updating grievance:', error);
      toast.error('Failed to update grievance');
    }
  };

  const addComment = async (grievanceId: string, comment: string, visibility: 'public' | 'internal' = 'internal') => {
    try {
      const response = await fetch('/api/admin/grievances/assigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grievanceId,
          adminId: currentAdminId,
          comment,
          visibility
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Comment added successfully');
        fetchAssignedGrievances();
      } else {
        throw new Error(result.error || 'Failed to add comment');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-blue-600 bg-blue-100';
      case 'in_progress': return 'text-yellow-600 bg-yellow-100';
      case 'resolved': return 'text-green-600 bg-green-100';
      case 'closed': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Chat functionality
  const [chatGrievance, setChatGrievance] = useState<Grievance | null>(null);

  const hasUnreadMessages = (grievance: Grievance) => {
    // Check if there are unread communications from students
    // This would typically check grievance.grievance_communications for unread messages
    // For now, we'll use a simple heuristic - if there are recent updates and status is not resolved
    if (!grievance.updated_at) return false;
    
    const updatedAt = new Date(grievance.updated_at);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
    
    // Show alert if updated within last 24 hours and not resolved
    return hoursSinceUpdate < 24 && grievance.status !== 'resolved' && grievance.status !== 'closed';
  };

  const handleOpenChat = (grievance: Grievance) => {
    console.log('💬 Opening chat for grievance:', grievance.id);
    setChatGrievance(grievance);
  };

  const handleCloseChat = () => {
    setChatGrievance(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner variant="default" size="xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 max-w-[1400px] mx-auto">
      {/* Enhanced Header */}
      <div className="card-enhanced">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-heading-1 gradient-text">My Assigned Grievances</h1>
            <p className="text-body-lg text-gray-600 mt-2">Manage and resolve grievances assigned to you</p>
            {currentAdminId && (
              <p className="text-body-sm text-blue-600 mt-1">
                Admin ID: {currentAdminId}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right text-body-sm text-gray-500">
              <p>Last updated</p>
              <p className="font-medium">{new Date().toLocaleTimeString()}</p>
            </div>
            <EnhancedButton
              onClick={() => {
                console.log('🔄 Manual refresh triggered');
                fetchAssignedGrievances();
              }}
              disabled={loading}
              variant="primary"
              size="md"
              icon={RefreshCw}
              loading={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </EnhancedButton>
          </div>
        </div>
      </div>

      {/* Enhanced Summary Stats */}
      <EnhancedSummaryStats summary={summary} />

      {/* Enhanced Filters */}
      <div className="card-enhanced">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <span className="text-body font-medium text-gray-700">Filters:</span>
            </div>
            
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="input-enhanced"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
              className="input-enhanced"
            >
              <option value="all">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search grievances..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input-enhanced"
            />
          </div>
        </div>
      </div>

      {/* Enhanced Grievances List */}
      <div className="card-enhanced">
        <div className="border-b border-gray-200 pb-4 mb-6">
          <h2 className="text-heading-3 text-gray-900">
            Assigned Grievances ({pagination.total})
          </h2>
        </div>

        <div className="space-y-4">
          {grievances.length === 0 ? (
            <EmptyState 
              icon={MessageSquare}
              title="No grievances found"
              description="You don't have any assigned grievances matching the current filters."
            />
          ) : (
            grievances.map((grievance) => (
              <motion.div
                key={grievance.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-enhanced hover:shadow-lg transition-all duration-300 cursor-pointer"
                onClick={() => setSelectedGrievance(grievance)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <h3 className="text-heading-5 text-gray-900">{grievance.subject}</h3>
                      <span className={`badge ${getPriorityBadgeClass(grievance.priority)}`}>
                        {grievance.priority}
                      </span>
                      <span className={`badge ${getStatusBadgeClass(grievance.status)}`}>
                        {grievance.status.replace('_', ' ')}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-6 text-body-sm text-gray-500 mb-3">
                      <span className="flex items-center">
                        <User className="w-4 h-4 mr-1" />
                        {grievance.student.student_name} ({grievance.student.roll_number})
                      </span>
                      <span className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {formatDate(grievance.created_at)}
                      </span>
                      {grievance.route && (
                        <span>Route: {grievance.route.route_name}</span>
                      )}
                    </div>
                    
                    <p className="text-body text-gray-700 line-clamp-2 mb-3">{grievance.description}</p>
                    
                    {grievance.expected_resolution_date && (
                      <div className="flex items-center text-body-sm text-orange-600">
                        <Clock className="w-4 h-4 mr-1" />
                        Expected resolution: {formatDate(grievance.expected_resolution_date)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenChat(grievance);
                      }}
                      className={`btn-outline px-3 py-1.5 text-sm ${hasUnreadMessages(grievance) ? 'animate-pulse border-red-300 bg-red-50' : ''}`}
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Chat
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedGrievance(grievance);
                      }}
                      className="btn-outline px-3 py-1.5 text-sm"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Enhanced Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <div className="text-body-sm text-gray-500">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
            </div>
            <div className="flex items-center space-x-2">
              <EnhancedButton
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                variant="outline"
                size="sm"
              >
                Previous
              </EnhancedButton>
              <span className="text-body-sm text-gray-500 px-4">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <EnhancedButton
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.totalPages}
                variant="outline"
                size="sm"
              >
                Next
              </EnhancedButton>
            </div>
          </div>
        )}
      </div>

      {/* Grievance Details Modal */}
      {selectedGrievance && (
        <GrievanceDetailsModal 
          grievance={selectedGrievance}
          currentAdminId={currentAdminId}
          onClose={() => setSelectedGrievance(null)}
          onUpdate={updateGrievanceStatus}
          onAddComment={addComment}
        />
      )}

      {/* Chat Modal */}
      {chatGrievance && (
        <AdminGrievanceGroupChatModal
          isOpen={true}
          grievance={chatGrievance}
          currentAdminId={currentAdminId}
          currentAdminName={user?.name || 'Admin'}
          onClose={handleCloseChat}
        />
      )}
    </div>
  );
}

// Enhanced utility functions
const getPriorityBadgeClass = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'badge-error';
    case 'high': return 'badge-warning';
    case 'medium': return 'badge-info';
    case 'low': return 'badge-success';
    default: return 'badge-secondary';
  }
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'open': return 'badge-info';
    case 'in_progress': return 'badge-warning';
    case 'resolved': return 'badge-success';
    case 'closed': return 'badge-secondary';
    default: return 'badge-secondary';
  }
};

// Enhanced Grievance Details Modal Component with Status Updates
interface GrievanceDetailsModalProps {
  grievance: Grievance;
  currentAdminId: string;
  onClose: () => void;
  onUpdate: (id: string, status: string, resolution?: string) => Promise<void>;
  onAddComment: (id: string, comment: string, visibility?: 'public' | 'internal') => Promise<void>;
}

function GrievanceDetailsModal({ grievance, currentAdminId, onClose, onUpdate, onAddComment }: GrievanceDetailsModalProps) {
  const [resolution, setResolution] = useState(grievance.resolution || '');
  const [comment, setComment] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'public' | 'internal'>('internal');
  const [statusUpdate, setStatusUpdate] = useState({
    status: grievance.status,
    priority: grievance.priority,
    resolution: grievance.resolution || '',
    expectedResolutionDate: grievance.expected_resolution_date ? 
      new Date(grievance.expected_resolution_date).toISOString().split('T')[0] : ''
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'update' | 'comments'>('details');

  const handleStatusUpdate = async () => {
    if (statusUpdate.status === 'resolved' && !statusUpdate.resolution.trim()) {
      toast.error('Please provide a resolution before marking as resolved');
      return;
    }

    try {
      setLoading(true);
      
      console.log('📋 Updating grievance status:', {
        grievanceId: grievance.id,
        updates: statusUpdate
      });

      const response = await fetch('/api/admin/grievances/assigned', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grievanceId: grievance.id,
          adminId: currentAdminId,
          updates: {
            status: statusUpdate.status,
            priority: statusUpdate.priority,
            resolution: statusUpdate.resolution,
            expectedResolutionDate: statusUpdate.expectedResolutionDate
          }
        }),
      });

      const result = await response.json();
      console.log('📡 Status update response:', result);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${result.error || 'Failed to update status'}`);
      }
      
      if (result.success) {
        console.log('✅ Status updated successfully');
        toast.success(result.message || 'Grievance updated successfully');
        
        // Call the parent update function for UI refresh
        await onUpdate(grievance.id, statusUpdate.status, statusUpdate.resolution);
        onClose();
      } else {
        throw new Error(result.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('💥 Status update error:', error);
      toast.error('Failed to update status: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) {
      toast.error('Please enter a comment');
      return;
    }

    try {
      setLoading(true);
      await onAddComment(grievance.id, comment, commentVisibility);
      setComment('');
      toast.success('Comment added successfully');
    } catch (error) {
      console.error('Comment error:', error);
      toast.error('Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const canResolve = grievance.status !== 'resolved' && grievance.status !== 'closed';
  const canClose = grievance.status === 'resolved';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{grievance.subject}</h2>
              <div className="flex items-center space-x-2 mt-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(grievance.status)}`}>
                  {grievance.status.replace('_', ' ')}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(grievance.priority)}`}>
                  {grievance.priority}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'details', label: 'Details', icon: Eye },
              { id: 'update', label: 'Update Status', icon: Edit },
              { id: 'comments', label: 'Add Comment', icon: MessageCircle }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Grievance Details</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-700 leading-relaxed">{grievance.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Student Information</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Name:</span> {grievance.student.student_name}</p>
                    <p><span className="font-medium">Roll Number:</span> {grievance.student.roll_number}</p>
                    <p><span className="font-medium">Email:</span> {grievance.student.email}</p>
                  </div>
                </div>

                {grievance.route && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Route Information</h4>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-medium">Route:</span> {grievance.route.route_name}</p>
                      <p><span className="font-medium">Route Number:</span> {grievance.route.route_number}</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Timeline</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <p><span className="font-medium">Created:</span> {formatDate(grievance.created_at)}</p>
                  <p><span className="font-medium">Last Updated:</span> {formatDate(grievance.updated_at)}</p>
                  {grievance.expected_resolution_date && (
                    <p><span className="font-medium">Expected Resolution:</span> {formatDate(grievance.expected_resolution_date)}</p>
                  )}
                </div>
              </div>

              {grievance.resolution && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Current Resolution</h4>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-800">{grievance.resolution}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Update Status Tab */}
          {activeTab === 'update' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Update Grievance Status</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={statusUpdate.status}
                    onChange={(e) => setStatusUpdate({ ...statusUpdate, status: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={statusUpdate.priority}
                    onChange={(e) => setStatusUpdate({ ...statusUpdate, priority: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expected Resolution Date</label>
                <input
                  type="date"
                  value={statusUpdate.expectedResolutionDate}
                  onChange={(e) => setStatusUpdate({ ...statusUpdate, expectedResolutionDate: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resolution {statusUpdate.status === 'resolved' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={statusUpdate.resolution}
                  onChange={(e) => setStatusUpdate({ ...statusUpdate, resolution: e.target.value })}
                  placeholder={statusUpdate.status === 'resolved' ? 'Please describe how this grievance was resolved...' : 'Optional: Add resolution details...'}
                  rows={4}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                {statusUpdate.status === 'resolved' && (
                  <p className="mt-1 text-sm text-gray-500">
                    Resolution details are required when marking as resolved
                  </p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-900">Notification Info</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      When you update this grievance, notifications will be automatically sent to:
                    </p>
                    <ul className="text-sm text-blue-700 mt-2 list-disc list-inside">
                      <li>The student who raised this grievance</li>
                      <li>All superadministrators</li>
                      <li>Activity will be logged for tracking</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Add Comment</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Comment Visibility</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="visibility"
                      value="internal"
                      checked={commentVisibility === 'internal'}
                      onChange={(e) => setCommentVisibility(e.target.value as 'internal')}
                      className="mr-2"
                    />
                    <span className="text-sm">Internal (Admin only)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="visibility"
                      value="public"
                      checked={commentVisibility === 'public'}
                      onChange={(e) => setCommentVisibility(e.target.value as 'public')}
                      className="mr-2"
                    />
                    <span className="text-sm">Public (Visible to student)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Comment</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add your comment here..."
                  rows={4}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              <span>Last updated: {formatDate(grievance.updated_at)}</span>
            </div>
            
            <div className="flex space-x-3">
              <EnhancedButton
                onClick={onClose}
                variant="outline"
                size="md"
              >
                Cancel
              </EnhancedButton>
              
              {activeTab === 'update' && (
                <EnhancedButton
                  onClick={handleStatusUpdate}
                  disabled={loading || (statusUpdate.status === 'resolved' && !statusUpdate.resolution.trim())}
                  variant="primary"
                  size="md"
                >
                  {loading ? (
                    <>
                      <LoadingSpinner className="w-4 h-4 mr-2" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      <span>Update Status</span>
                    </>
                  )}
                </EnhancedButton>
              )}
              
              {activeTab === 'comments' && (
                <EnhancedButton
                  onClick={handleAddComment}
                  disabled={loading || !comment.trim()}
                  variant="primary"
                  size="md"
                >
                  {loading ? (
                    <>
                      <LoadingSpinner className="w-4 h-4 mr-2" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4 mr-2" />
                      <span>Add Comment</span>
                    </>
                  )}
                </EnhancedButton>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 