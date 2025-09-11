'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Bell,
  Send,
  Calendar,
  Users,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Clock,
  Target,
  MessageCircle,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';
import NotificationFormModal from '@/components/notification-form-modal';
import NotificationDetailsModal from '@/components/notification-details-modal';
import BroadcastModal from '@/components/broadcast-modal';

const NotificationCard = ({ notification, onEdit, onDelete, onView, onToggleStatus, userRole }: any) => {
  const canEdit = ['super_admin', 'operations_admin'].includes(userRole);
  const canDelete = userRole === 'super_admin';
  const canToggle = ['super_admin', 'operations_admin'].includes(userRole);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'info': return 'bg-blue-100 text-blue-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'success': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'transport': return 'bg-blue-100 text-blue-800';
      case 'payment': return 'bg-green-100 text-green-800';
      case 'system': return 'bg-purple-100 text-purple-800';
      case 'emergency': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'info': return Info;
      case 'warning': return AlertTriangle;
      case 'error': return XCircle;
      case 'success': return CheckCircle;
      default: return Bell;
    }
  };

  const TypeIcon = getTypeIcon(notification.type);

  const isExpired = notification.expires_at && new Date(notification.expires_at) < new Date();
  const isScheduled = notification.scheduled_at && new Date(notification.scheduled_at) > new Date();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-all ${
        !notification.is_active ? 'border-gray-200 opacity-60' : 
        isExpired ? 'border-red-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            notification.type === 'info' ? 'bg-blue-100' :
            notification.type === 'warning' ? 'bg-yellow-100' :
            notification.type === 'error' ? 'bg-red-100' :
            notification.type === 'success' ? 'bg-green-100' : 'bg-gray-100'
          }`}>
            <TypeIcon className={`w-6 h-6 ${
              notification.type === 'info' ? 'text-blue-600' :
              notification.type === 'warning' ? 'text-yellow-600' :
              notification.type === 'error' ? 'text-red-600' :
              notification.type === 'success' ? 'text-green-600' : 'text-gray-600'
            }`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{notification.title}</h3>
            <p className="text-sm text-gray-600">To: {notification.target_audience}</p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-1">
          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getTypeColor(notification.type)}`}>
            {notification.type}
          </span>
          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getCategoryColor(notification.category)}`}>
            {notification.category}
          </span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <p className="text-sm text-gray-700 line-clamp-3">{notification.message}</p>
        
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center space-x-2 text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>Created: {new Date(notification.created_at).toLocaleDateString()}</span>
          </div>
          {notification.scheduled_at && (
            <div className="flex items-center space-x-2 text-gray-600">
              <Clock className="w-4 h-4" />
              <span>
                {isScheduled ? 'Scheduled' : 'Sent'}: {new Date(notification.scheduled_at).toLocaleDateString()}
              </span>
            </div>
          )}
          {notification.expires_at && (
            <div className={`flex items-center space-x-2 text-sm ${isExpired ? 'text-red-600' : 'text-gray-600'}`}>
              <AlertTriangle className="w-4 h-4" />
              <span>
                {isExpired ? 'Expired' : 'Expires'}: {new Date(notification.expires_at).toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="flex items-center space-x-2 text-gray-600">
            <Target className="w-4 h-4" />
            <span className="capitalize">{notification.target_audience}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Status:</span>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              notification.is_active ? 'bg-green-500' : 'bg-gray-400'
            }`}></div>
            <span className={notification.is_active ? 'text-green-600' : 'text-gray-600'}>
              {notification.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex space-x-2">
        <button
          onClick={() => onView(notification)}
          className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1"
        >
          <Eye className="w-4 h-4" />
          <span>View Details</span>
        </button>
        {canToggle && (
          <button
            onClick={() => onToggleStatus(notification)}
            className={`px-3 py-2 border border-gray-200 rounded-lg transition-colors ${
              notification.is_active ? 'hover:bg-red-50' : 'hover:bg-green-50'
            }`}
          >
            {notification.is_active ? (
              <XCircle className="w-4 h-4 text-gray-600" />
            ) : (
              <CheckCircle className="w-4 h-4 text-gray-600" />
            )}
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => onEdit(notification)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit className="w-4 h-4 text-gray-600" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(notification)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-gray-600" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

const NotificationsPage = () => {
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');
  
  // Modal states
  const [isNotificationFormOpen, setIsNotificationFormOpen] = useState(false);
  const [isNotificationDetailsOpen, setIsNotificationDetailsOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  
  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get user data from localStorage
      const userData = localStorage.getItem('adminUser');
      if (!userData) {
        throw new Error('No admin user found');
      }
      
      const adminUser = JSON.parse(userData);
      const adminId = adminUser.id;
      
      if (!adminId) {
        throw new Error('Admin ID not found');
      }
      
      // Fetch notifications using API route
      const response = await fetch(`/api/admin/notifications?adminId=${adminId}`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch notifications');
      }
      
      // The API returns { data: { notifications: [...] } }
      const notificationsData = result.data?.notifications || [];
      console.log('Notifications data received:', notificationsData);
      setNotifications(Array.isArray(notificationsData) ? notificationsData : []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications data');
      toast.error('Failed to load notifications data');
    } finally {
      setLoading(false);
    }
  };

  // Handler functions
  const handleCreateNotification = () => {
    setFormMode('create');
    setSelectedNotification(null);
    setIsNotificationFormOpen(true);
  };

  const handleEditNotification = (notification: any) => {
    setFormMode('edit');
    setSelectedNotification(notification);
    setIsNotificationFormOpen(true);
  };

  const handleViewNotification = (notification: any) => {
    setSelectedNotification(notification);
    setIsNotificationDetailsOpen(true);
  };

  const handleDeleteNotification = (notification: any) => {
    if (confirm(`Are you sure you want to delete "${notification.title}"?`)) {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      toast.success('Notification deleted successfully');
    }
  };

  const handleToggleStatus = (notification: any) => {
    setNotifications(prev => prev.map(n => 
      n.id === notification.id 
        ? { ...n, is_active: !n.is_active, updated_at: new Date() }
        : n
    ));
    const action = notification.is_active ? 'deactivated' : 'activated';
    toast.success(`Notification ${action} successfully`);
  };

  const handleSaveNotification = (notificationData: any) => {
    if (formMode === 'create') {
      setNotifications(prev => [notificationData, ...prev]);
    } else {
      setNotifications(prev => prev.map(n => 
        n.id === notificationData.id ? notificationData : n
      ));
    }
    
    // Refresh the notifications list to get the latest data
    fetchNotifications();
  };

  const handleSendBroadcast = (broadcastData: any) => {
    // Add the new broadcast to the notifications list
    setNotifications(prev => [broadcastData, ...prev]);
    
    // Refresh the notifications list to get the latest data
    fetchNotifications();
  };

  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = notification.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         notification.message?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || notification.type === typeFilter;
    const matchesCategory = categoryFilter === 'all' || notification.category === categoryFilter;
    const matchesAudience = audienceFilter === 'all' || notification.target_audience === audienceFilter;
    
    let matchesStatus = true;
    if (statusFilter === 'active') matchesStatus = notification.is_active;
    else if (statusFilter === 'inactive') matchesStatus = !notification.is_active;
    else if (statusFilter === 'expired') {
      matchesStatus = !!(notification.expires_at && new Date(notification.expires_at) < new Date());
    } else if (statusFilter === 'scheduled') {
      matchesStatus = !!(notification.scheduled_at && new Date(notification.scheduled_at) > new Date());
    }
    
    return matchesSearch && matchesType && matchesCategory && matchesStatus && matchesAudience;
  });

  const canCreate = user && ['super_admin', 'operations_admin'].includes(user.role);
  const canManage = user && ['super_admin', 'operations_admin'].includes(user.role);

  // Dynamic Statistics
  const totalNotifications = notifications.length;
  const activeNotifications = notifications.filter(n => n.is_active).length;
  const expiredNotifications = notifications.filter(n => 
    n.expires_at && new Date(n.expires_at) < new Date()
  ).length;
  const scheduledNotifications = notifications.filter(n => 
    n.scheduled_at && new Date(n.scheduled_at) > new Date()
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchNotifications}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications Management</h1>
          <p className="text-gray-600">Send and manage system notifications</p>
        </div>
        {canCreate && (
          <div className="flex space-x-2">
            <button
              onClick={() => setIsBroadcastOpen(true)}
              className="btn-secondary flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Broadcast</span>
            </button>
            <button
              onClick={handleCreateNotification}
              className="btn-primary flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Notification</span>
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Notifications</p>
              <p className="text-xl font-bold text-gray-900">{totalNotifications}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-xl font-bold text-gray-900">{activeNotifications}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Scheduled</p>
              <p className="text-xl font-bold text-gray-900">{scheduledNotifications}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Expired</p>
              <p className="text-xl font-bold text-gray-900">{expiredNotifications}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="success">Success</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            <option value="transport">Transport</option>
            <option value="payment">Payment</option>
            <option value="system">System</option>
            <option value="emergency">Emergency</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
            <option value="scheduled">Scheduled</option>
          </select>
          <select
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Audience</option>
            <option value="students">Students</option>
            <option value="drivers">Drivers</option>
            <option value="admins">Admins</option>
            <option value="all">Everyone</option>
          </select>
        </div>
      </div>

      {/* Notifications Grid */}
      {filteredNotifications.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Notifications Yet</h3>
            <p className="text-gray-600 mb-6">
              {notifications.length === 0 
                ? "Start communicating with your users by creating notifications. You can send updates, alerts, and important announcements."
                : "No notifications match your current filters. Try adjusting your search criteria."
              }
            </p>
            {notifications.length === 0 && canCreate && (
              <div className="space-y-3">
                <button 
                  onClick={handleCreateNotification}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create First Notification
                </button>
                <p className="text-sm text-gray-500">
                  Send announcements about schedule changes, payment reminders, or system updates
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredNotifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onEdit={handleEditNotification}
              onDelete={handleDeleteNotification}
              onView={handleViewNotification}
              onToggleStatus={handleToggleStatus}
              userRole={user?.role}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <NotificationFormModal
        isOpen={isNotificationFormOpen}
        onClose={() => setIsNotificationFormOpen(false)}
        onSave={handleSaveNotification}
        notification={selectedNotification}
        mode={formMode}
      />

      <NotificationDetailsModal
        isOpen={isNotificationDetailsOpen}
        onClose={() => setIsNotificationDetailsOpen(false)}
        notification={selectedNotification}
      />

      <BroadcastModal
        isOpen={isBroadcastOpen}
        onClose={() => setIsBroadcastOpen(false)}
        onSend={handleSendBroadcast}
      />
    </div>
  );
};

export default NotificationsPage; 