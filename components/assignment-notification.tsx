'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCircle, AlertTriangle, MessageSquare, Calendar } from 'lucide-react';

interface AssignmentNotification {
  id: string;
  grievanceId: string;
  grievanceSubject: string;
  priority: string;
  category: string;
  assignedAt: string;
  studentName: string;
  isRead: boolean;
}

interface AssignmentNotificationProps {
  adminId: string;
}

export default function AssignmentNotification({ adminId }: AssignmentNotificationProps) {
  const [notifications, setNotifications] = useState<AssignmentNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (adminId) {
      fetchNotifications();
    }
  }, [adminId]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/grievances/assigned?adminId=${adminId}&status=open&limit=5`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.grievances) {
          // Transform grievances into notifications
          const recentAssignments = result.data.grievances
            .filter((g: any) => {
              // Show grievances assigned in the last 24 hours
              const assignedDate = new Date(g.updated_at);
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              return assignedDate > yesterday;
            })
            .map((g: any) => ({
              id: `notif-${g.id}`,
              grievanceId: g.id,
              grievanceSubject: g.subject,
              priority: g.priority,
              category: g.category,
              assignedAt: g.updated_at,
              studentName: g.student?.student_name || 'Unknown Student',
              isRead: false
            }));
          
          setNotifications(recentAssignments);
        }
      }
    } catch (error) {
      console.error('Error fetching assignment notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const removeNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  if (!notifications.length) return null;

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      <AnimatePresence>
        {showNotifications && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40"
              onClick={() => setShowNotifications(false)}
            />
            
            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">New Assignments</h3>
                <div className="flex items-center space-x-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Notifications List */}
              <div className="max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Loading...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No new assignments</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {notifications.map((notification) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                          !notification.isRead ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => {
                          markAsRead(notification.id);
                          window.location.href = `/my-grievances`;
                        }}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <MessageSquare className="w-5 h-5 text-blue-600" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {notification.grievanceSubject}
                              </p>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(notification.priority)}`}>
                                {notification.priority}
                              </span>
                            </div>
                            
                            <p className="text-sm text-gray-600">
                              From: {notification.studentName}
                            </p>
                            
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-gray-500 capitalize">
                                {notification.category}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatTimeAgo(notification.assignedAt)}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNotification(notification.id);
                            }}
                            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                <a
                  href="/my-grievances"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  onClick={() => setShowNotifications(false)}
                >
                  View All My Grievances →
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
} 