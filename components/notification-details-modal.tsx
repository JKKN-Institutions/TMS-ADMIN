'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Eye,
  Bell,
  Users,
  Calendar,
  Clock,
  Target,
  MessageCircle,
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Send,
  Mail,
  Smartphone,
  Settings,
  UserCheck,
  Globe,
  Tag,
  ExternalLink,
  Download,
  Phone
} from 'lucide-react';

interface NotificationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notification: any;
}

const NotificationDetailsModal: React.FC<NotificationDetailsModalProps> = ({
  isOpen,
  onClose,
  notification
}) => {
  if (!isOpen || !notification) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'info': return Info;
      case 'warning': return AlertTriangle;
      case 'error': return XCircle;
      case 'success': return CheckCircle;
      default: return Bell;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'info': return 'text-blue-600 bg-blue-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      case 'success': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'transport': return 'text-blue-600 bg-blue-100';
      case 'payment': return 'text-green-600 bg-green-100';
      case 'system': return 'text-purple-600 bg-purple-100';
      case 'emergency': return 'text-red-600 bg-red-100';
      case 'academic': return 'text-indigo-600 bg-indigo-100';
      case 'general': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'text-gray-600 bg-gray-100';
      case 'normal': return 'text-blue-600 bg-blue-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'urgent': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getAudienceIcon = (audience: string) => {
    switch (audience) {
      case 'students': return Users;
      case 'drivers': return UserCheck;
      case 'admins': return Settings;
      case 'specific': return Target;
      case 'all': return Globe;
      default: return Users;
    }
  };

  const TypeIcon = getTypeIcon(notification.type);
  const AudienceIcon = getAudienceIcon(notification.targetAudience);

  const isExpired = notification.expiresAt && new Date(notification.expiresAt) < new Date();
  const isScheduled = notification.scheduledAt && new Date(notification.scheduledAt) > new Date();
  const isActive = notification.isActive;

  const getStatusInfo = () => {
    if (isExpired) return { text: 'Expired', color: 'text-red-600 bg-red-100' };
    if (isScheduled) return { text: 'Scheduled', color: 'text-yellow-600 bg-yellow-100' };
    if (isActive) return { text: 'Active', color: 'text-green-600 bg-green-100' };
    return { text: 'Inactive', color: 'text-gray-600 bg-gray-100' };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getTypeColor(notification.type)}`}>
              <TypeIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Notification Details</h2>
              <p className="text-sm text-gray-600">View complete notification information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-140px)]">
          <div className="p-6 space-y-6">
            {/* Basic Information */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <p className="text-lg font-medium text-gray-900">{notification.title}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <p className="text-gray-800 whitespace-pre-wrap">{notification.message}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${getTypeColor(notification.type)}`}>
                      <TypeIcon className="w-3 h-3 mr-1" />
                      {notification.type}
                    </span>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${getCategoryColor(notification.category)}`}>
                      {notification.category}
                    </span>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${getPriorityColor(notification.priority)}`}>
                      {notification.priority}
                    </span>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.text}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Targeting Information */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Targeting Information</h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <AudienceIcon className="w-5 h-5 text-blue-600" />
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Target Audience</label>
                    <p className="text-gray-800 capitalize">{notification.targetAudience}</p>
                  </div>
                </div>

                {notification.specificUsers && notification.specificUsers.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Specific Users</label>
                    <div className="flex flex-wrap gap-2">
                      {notification.specificUsers.slice(0, 5).map((userId: string) => (
                        <span key={userId} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          User {userId}
                        </span>
                      ))}
                      {notification.specificUsers.length > 5 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                          +{notification.specificUsers.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Scheduling Information */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Scheduling Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-green-600" />
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Created</label>
                    <p className="text-gray-800">{new Date(notification.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                {notification.scheduledAt && (
                  <div className="flex items-center space-x-3">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Scheduled</label>
                      <p className="text-gray-800">{new Date(notification.scheduledAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {notification.expiresAt && (
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className={`w-5 h-5 ${isExpired ? 'text-red-600' : 'text-yellow-600'}`} />
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Expires</label>
                      <p className={`${isExpired ? 'text-red-600' : 'text-gray-800'}`}>
                        {new Date(notification.expiresAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                {notification.updatedAt && (
                  <div className="flex items-center space-x-3">
                    <Calendar className="w-5 h-5 text-purple-600" />
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Last Updated</label>
                      <p className="text-gray-800">{new Date(notification.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Methods */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Delivery Methods</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`flex items-center space-x-3 p-3 rounded-lg ${
                  notification.enablePushNotification ? 'bg-blue-50 border border-blue-200' : 'bg-gray-100'
                }`}>
                  <Bell className={`w-5 h-5 ${notification.enablePushNotification ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="font-medium text-gray-900">Push Notification</p>
                    <p className={`text-sm ${notification.enablePushNotification ? 'text-blue-600' : 'text-gray-500'}`}>
                      {notification.enablePushNotification ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>

                <div className={`flex items-center space-x-3 p-3 rounded-lg ${
                  notification.enableEmailNotification ? 'bg-green-50 border border-green-200' : 'bg-gray-100'
                }`}>
                  <Mail className={`w-5 h-5 ${notification.enableEmailNotification ? 'text-green-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="font-medium text-gray-900">Email</p>
                    <p className={`text-sm ${notification.enableEmailNotification ? 'text-green-600' : 'text-gray-500'}`}>
                      {notification.enableEmailNotification ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>

                <div className={`flex items-center space-x-3 p-3 rounded-lg ${
                  notification.enableSMSNotification ? 'bg-purple-50 border border-purple-200' : 'bg-gray-100'
                }`}>
                  <Smartphone className={`w-5 h-5 ${notification.enableSMSNotification ? 'text-purple-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="font-medium text-gray-900">SMS</p>
                    <p className={`text-sm ${notification.enableSMSNotification ? 'text-purple-600' : 'text-gray-500'}`}>
                      {notification.enableSMSNotification ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {notification.actionable && (notification.primaryAction || notification.secondaryAction) && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
                <div className="space-y-4">
                  {notification.primaryAction && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center space-x-3 mb-2">
                        <MessageCircle className="w-5 h-5 text-blue-600" />
                        <h4 className="font-medium text-gray-900">Primary Action</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <label className="block text-gray-600">Label</label>
                          <p className="font-medium">{notification.primaryAction.label}</p>
                        </div>
                        <div>
                          <label className="block text-gray-600">Action</label>
                          <p className="font-medium capitalize">{notification.primaryAction.action}</p>
                        </div>
                        <div>
                          <label className="block text-gray-600">URL</label>
                          <p className="font-medium break-all">{notification.primaryAction.url}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {notification.secondaryAction && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center space-x-3 mb-2">
                        <MessageCircle className="w-5 h-5 text-gray-600" />
                        <h4 className="font-medium text-gray-900">Secondary Action</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <label className="block text-gray-600">Label</label>
                          <p className="font-medium">{notification.secondaryAction.label}</p>
                        </div>
                        <div>
                          <label className="block text-gray-600">Action</label>
                          <p className="font-medium capitalize">{notification.secondaryAction.action}</p>
                        </div>
                        <div>
                          <label className="block text-gray-600">URL</label>
                          <p className="font-medium break-all">{notification.secondaryAction.url}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tags */}
            {notification.tags && notification.tags.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {notification.tags.map((tag: string) => (
                    <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="block text-gray-600">Notification ID</label>
                  <p className="font-mono text-gray-900">{notification.id}</p>
                </div>
                <div>
                  <label className="block text-gray-600">Created By</label>
                  <p className="font-medium text-gray-900">{notification.createdBy || 'System'}</p>
                </div>
                {notification.deliveryCount && (
                  <div>
                    <label className="block text-gray-600">Delivery Count</label>
                    <p className="font-medium text-gray-900">{notification.deliveryCount}</p>
                  </div>
                )}
                {notification.readCount && (
                  <div>
                    <label className="block text-gray-600">Read Count</label>
                    <p className="font-medium text-gray-900">{notification.readCount}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default NotificationDetailsModal; 