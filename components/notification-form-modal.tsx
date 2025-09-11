'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Plus,
  Edit,
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
  Eye,
  UserCheck,
  UserX,
  Settings
} from 'lucide-react';
import toast from 'react-hot-toast';
import { studentsData, driversData } from '@/data/admin-data';

interface NotificationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (notificationData: any) => void;
  notification?: any;
  mode: 'create' | 'edit';
}

const NotificationFormModal: React.FC<NotificationFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  notification,
  mode
}) => {
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info',
    category: 'transport',
    targetAudience: 'students',
    specificUsers: [] as string[],
    priority: 'normal',
    isScheduled: false,
    scheduledAt: '',
    scheduledTime: '',
    expiresAt: '',
    expiresTime: '',
    hasExpiry: false,
    enablePushNotification: true,
    enableEmailNotification: true,
    enableSMSNotification: false,
    actionable: false,
    primaryAction: {
      label: '',
      action: '',
      url: ''
    },
    secondaryAction: {
      label: '',
      action: '',
      url: ''
    },
    tags: [] as string[],
    newTag: ''
  });

  const [activeTab, setActiveTab] = useState('basic');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Generate notification ID function
  const generateNotificationId = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `NOT${year}${month}${day}${random}`;
  };

  useEffect(() => {
    if (notification && mode === 'edit') {
      setFormData({
        title: notification.title || '',
        message: notification.message || '',
        type: notification.type || 'info',
        category: notification.category || 'transport',
        targetAudience: notification.targetAudience || 'students',
        specificUsers: notification.specificUsers || [],
        priority: notification.priority || 'normal',
        isScheduled: !!notification.scheduledAt,
        scheduledAt: notification.scheduledAt ? new Date(notification.scheduledAt).toISOString().split('T')[0] : '',
        scheduledTime: notification.scheduledAt ? new Date(notification.scheduledAt).toTimeString().slice(0, 5) : '',
        expiresAt: notification.expiresAt ? new Date(notification.expiresAt).toISOString().split('T')[0] : '',
        expiresTime: notification.expiresAt ? new Date(notification.expiresAt).toTimeString().slice(0, 5) : '',
        hasExpiry: !!notification.expiresAt,
        enablePushNotification: notification.enablePushNotification ?? true,
        enableEmailNotification: notification.enableEmailNotification ?? true,
        enableSMSNotification: notification.enableSMSNotification ?? false,
        actionable: notification.actionable || false,
        primaryAction: notification.primaryAction || { label: '', action: '', url: '' },
        secondaryAction: notification.secondaryAction || { label: '', action: '', url: '' },
        tags: notification.tags || [],
        newTag: ''
      });
      setSelectedUsers(notification.specificUsers || []);
    }
  }, [notification, mode]);

  if (!isOpen) return null;

  const notificationTypes = [
    { value: 'info', label: 'Information', icon: Info, color: 'text-blue-600' },
    { value: 'warning', label: 'Warning', icon: AlertTriangle, color: 'text-yellow-600' },
    { value: 'error', label: 'Error', icon: XCircle, color: 'text-red-600' },
    { value: 'success', label: 'Success', icon: CheckCircle, color: 'text-green-600' }
  ];

  const notificationCategories = [
    { value: 'transport', label: 'Transport', description: 'Route, schedule, and vehicle updates' },
    { value: 'payment', label: 'Payment', description: 'Fee, payment, and billing notifications' },
    { value: 'system', label: 'System', description: 'System maintenance and updates' },
    { value: 'emergency', label: 'Emergency', description: 'Urgent alerts and announcements' },
    { value: 'academic', label: 'Academic', description: 'Academic and institutional updates' },
    { value: 'general', label: 'General', description: 'General announcements and news' }
  ];

  const audienceOptions = [
    { value: 'students', label: 'All Students', icon: Users },
    { value: 'drivers', label: 'All Drivers', icon: UserCheck },
    { value: 'admins', label: 'All Admins', icon: Settings },
    { value: 'specific', label: 'Specific Users', icon: Target },
    { value: 'all', label: 'Everyone', icon: Bell }
  ];

  const priorityLevels = [
    { value: 'low', label: 'Low Priority', color: 'text-gray-600' },
    { value: 'normal', label: 'Normal Priority', color: 'text-blue-600' },
    { value: 'high', label: 'High Priority', color: 'text-orange-600' },
    { value: 'urgent', label: 'Urgent', color: 'text-red-600' }
  ];

  const availableUsers = formData.targetAudience === 'students' ? studentsData : 
                        formData.targetAudience === 'drivers' ? driversData : 
                        [...studentsData, ...driversData];

  const filteredUsers = availableUsers.filter(user => {
    const name = 'studentName' in user ? user.studentName : user.name;
    const email = user.email || '';
    const searchTerm = userSearch.toLowerCase();
    return name.toLowerCase().includes(searchTerm) || email.toLowerCase().includes(searchTerm);
  });

  const handleUserToggle = (userId: string) => {
    const updatedUsers = selectedUsers.includes(userId)
      ? selectedUsers.filter(id => id !== userId)
      : [...selectedUsers, userId];
    
    setSelectedUsers(updatedUsers);
    setFormData(prev => ({ ...prev, specificUsers: updatedUsers }));
  };

  const addTag = () => {
    if (formData.newTag.trim() && !formData.tags.includes(formData.newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, prev.newTag.trim()],
        newTag: ''
      }));
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return false;
    }
    if (!formData.message.trim()) {
      toast.error('Message is required');
      return false;
    }
    if (formData.targetAudience === 'specific' && selectedUsers.length === 0) {
      toast.error('Please select at least one user for specific targeting');
      return false;
    }
    if (formData.isScheduled && !formData.scheduledAt) {
      toast.error('Please select a scheduled date');
      return false;
    }
    if (formData.hasExpiry && !formData.expiresAt) {
      toast.error('Please select an expiry date');
      return false;
    }
    if (formData.actionable) {
      if (!formData.primaryAction.label.trim() || !formData.primaryAction.action.trim()) {
        toast.error('Primary action label and action are required for actionable notifications');
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    
    try {
      // Get admin user from localStorage
      const adminUser = localStorage.getItem('adminUser');
      const adminId = adminUser ? JSON.parse(adminUser).id : null;

      if (!adminId) {
        toast.error('Admin user not found. Please login again.');
        return;
      }

      const scheduledDateTime = formData.isScheduled && formData.scheduledAt ? 
        new Date(`${formData.scheduledAt}T${formData.scheduledTime || '09:00'}`) : null;

      const expiryDateTime = formData.hasExpiry && formData.expiresAt ? 
        new Date(`${formData.expiresAt}T${formData.expiresTime || '23:59'}`) : null;

      // Create notification data with correct database field names
      const notificationData = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        type: formData.type,
        category: formData.category,
        target_audience: formData.targetAudience,
        specific_users: formData.targetAudience === 'specific' ? selectedUsers : [],
        is_active: true,
        scheduled_at: scheduledDateTime ? scheduledDateTime.toISOString() : null,
        expires_at: expiryDateTime ? expiryDateTime.toISOString() : null,
        enable_push_notification: formData.enablePushNotification,
        enable_email_notification: formData.enableEmailNotification,
        enable_sms_notification: formData.enableSMSNotification,
        actionable: formData.actionable,
        primary_action: formData.actionable ? formData.primaryAction : null,
        secondary_action: formData.actionable && formData.secondaryAction.label ? formData.secondaryAction : null,
        tags: formData.tags,
        created_by: adminId
      };

      let result;
      
      if (mode === 'edit' && notification?.id) {
        // Update existing notification
        const response = await fetch(`/api/admin/notifications/${notification.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update notification');
        }

        result = await response.json();
        toast.success('Notification updated successfully!');
      } else {
        // Create new notification
        const response = await fetch('/api/admin/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create notification');
        }

        result = await response.json();
        toast.success('Notification created successfully!');
      }

                    // Call the onSave callback with the created/updated notification
       onSave(result.data);
       
       onClose();
     
       // Reset form
       setFormData({
         title: '',
         message: '',
         type: 'info',
         category: 'transport',
         targetAudience: 'students',
         specificUsers: [],
         priority: 'normal',
         isScheduled: false,
         scheduledAt: '',
         scheduledTime: '',
         expiresAt: '',
         expiresTime: '',
         hasExpiry: false,
         enablePushNotification: true,
         enableEmailNotification: true,
         enableSMSNotification: false,
         actionable: false,
         primaryAction: { label: '', action: '', url: '' },
         secondaryAction: { label: '', action: '', url: '' },
         tags: [],
         newTag: ''
       });
       setSelectedUsers([]);
       setActiveTab('basic');

     } catch (error) {
       console.error('Error saving notification:', error);
       toast.error(error instanceof Error ? error.message : 'Failed to save notification');
     } finally {
       setIsLoading(false);
     }
  };

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: Bell },
    { id: 'targeting', label: 'Targeting', icon: Target },
    { id: 'scheduling', label: 'Scheduling', icon: Calendar },
    { id: 'delivery', label: 'Delivery', icon: Send },
    { id: 'actions', label: 'Actions', icon: MessageCircle }
  ];

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
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              {mode === 'create' ? <Plus className="w-6 h-6 text-white" /> : <Edit className="w-6 h-6 text-white" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {mode === 'create' ? 'Create Notification' : 'Edit Notification'}
              </h2>
              <p className="text-sm text-gray-600">
                {mode === 'create' ? 'Send a new notification to users' : 'Update notification details'}
              </p>
            </div>
          </div>
                      <button
              onClick={onClose}
              disabled={isLoading}
              className={`p-2 rounded-lg transition-colors ${
                isLoading 
                  ? 'text-gray-300 cursor-not-allowed' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 p-4 bg-gray-50 border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-200px)]">
          <div className="p-6">
            {/* Basic Info Tab */}
            {activeTab === 'basic' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter notification title"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {notificationTypes.map((type) => {
                        const Icon = type.icon;
                        return (
                          <button
                            key={type.value}
                            onClick={() => setFormData(prev => ({ ...prev, type: type.value }))}
                            className={`p-3 border-2 rounded-lg text-left transition-colors ${
                              formData.type === type.value
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <Icon className={`w-4 h-4 ${type.color}`} />
                              <span className="font-medium text-gray-900">{type.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {notificationCategories.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {priorityLevels.map((priority) => (
                        <option key={priority.value} value={priority.value}>
                          {priority.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                    <textarea
                      value={formData.message}
                      onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="Enter your notification message..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
                    />
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="ml-1 text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={formData.newTag}
                      onChange={(e) => setFormData(prev => ({ ...prev, newTag: e.target.value }))}
                      placeholder="Add a tag"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyPress={(e) => e.key === 'Enter' && addTag()}
                    />
                    <button
                      onClick={addTag}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Targeting Tab */}
            {activeTab === 'targeting' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Target Audience</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {audienceOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setFormData(prev => ({ ...prev, targetAudience: option.value }))}
                          className={`p-3 border-2 rounded-lg text-left transition-colors ${
                            formData.targetAudience === option.value
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <Icon className="w-5 h-5 text-blue-600" />
                            <span className="font-medium text-gray-900">{option.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {formData.targetAudience === 'specific' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Select Users</label>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="mb-4">
                        <input
                          type="text"
                          placeholder="Search users..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {filteredUsers.map((user) => {
                          const name = 'studentName' in user ? user.studentName : user.name;
                          const isSelected = selectedUsers.includes(user.id);
                          return (
                            <div
                              key={user.id}
                              onClick={() => handleUserToggle(user.id)}
                              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-gray-900">{name}</p>
                                  <p className="text-sm text-gray-600">{user.email}</p>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 ${
                                  isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                                }`}>
                                  {isSelected && <CheckCircle className="w-3 h-3 text-white m-0.5" />}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 text-sm text-gray-600">
                        {selectedUsers.length} user(s) selected
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Scheduling Tab */}
            {activeTab === 'scheduling' && (
              <div className="space-y-6">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="isScheduled"
                    checked={formData.isScheduled}
                    onChange={(e) => setFormData(prev => ({ ...prev, isScheduled: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isScheduled" className="text-sm font-medium text-gray-700">
                    Schedule this notification for later
                  </label>
                </div>

                {formData.isScheduled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Schedule Date</label>
                      <input
                        type="date"
                        value={formData.scheduledAt}
                        onChange={(e) => setFormData(prev => ({ ...prev, scheduledAt: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Schedule Time</label>
                      <input
                        type="time"
                        value={formData.scheduledTime}
                        onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="hasExpiry"
                    checked={formData.hasExpiry}
                    onChange={(e) => setFormData(prev => ({ ...prev, hasExpiry: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="hasExpiry" className="text-sm font-medium text-gray-700">
                    Set expiry date for this notification
                  </label>
                </div>

                {formData.hasExpiry && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Date</label>
                      <input
                        type="date"
                        value={formData.expiresAt}
                        onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Time</label>
                      <input
                        type="time"
                        value={formData.expiresTime}
                        onChange={(e) => setFormData(prev => ({ ...prev, expiresTime: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Delivery Tab */}
            {activeTab === 'delivery' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Delivery Methods</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Bell className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="font-medium text-gray-900">Push Notification</p>
                          <p className="text-sm text-gray-600">Send as mobile push notification</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.enablePushNotification}
                        onChange={(e) => setFormData(prev => ({ ...prev, enablePushNotification: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <MessageCircle className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium text-gray-900">Email Notification</p>
                          <p className="text-sm text-gray-600">Send as email to registered email address</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.enableEmailNotification}
                        onChange={(e) => setFormData(prev => ({ ...prev, enableEmailNotification: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Send className="w-5 h-5 text-purple-600" />
                        <div>
                          <p className="font-medium text-gray-900">SMS Notification</p>
                          <p className="text-sm text-gray-600">Send as text message to mobile number</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.enableSMSNotification}
                        onChange={(e) => setFormData(prev => ({ ...prev, enableSMSNotification: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions Tab */}
            {activeTab === 'actions' && (
              <div className="space-y-6">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="actionable"
                    checked={formData.actionable}
                    onChange={(e) => setFormData(prev => ({ ...prev, actionable: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="actionable" className="text-sm font-medium text-gray-700">
                    Make this notification actionable with buttons
                  </label>
                </div>

                {formData.actionable && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Primary Action</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Button Label</label>
                          <input
                            type="text"
                            value={formData.primaryAction.label}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              primaryAction: { ...prev.primaryAction, label: e.target.value }
                            }))}
                            placeholder="e.g., View Details"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Action Type</label>
                          <select
                            value={formData.primaryAction.action}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              primaryAction: { ...prev.primaryAction, action: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select action</option>
                            <option value="navigate">Navigate to Page</option>
                            <option value="external">Open External Link</option>
                            <option value="download">Download File</option>
                            <option value="contact">Contact Support</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Action URL</label>
                          <input
                            type="text"
                            value={formData.primaryAction.url}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              primaryAction: { ...prev.primaryAction, url: e.target.value }
                            }))}
                            placeholder="https://example.com or /internal-route"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Secondary Action (Optional)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Button Label</label>
                          <input
                            type="text"
                            value={formData.secondaryAction.label}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              secondaryAction: { ...prev.secondaryAction, label: e.target.value }
                            }))}
                            placeholder="e.g., Dismiss"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Action Type</label>
                          <select
                            value={formData.secondaryAction.action}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              secondaryAction: { ...prev.secondaryAction, action: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select action</option>
                            <option value="dismiss">Dismiss</option>
                            <option value="navigate">Navigate to Page</option>
                            <option value="external">Open External Link</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Action URL</label>
                          <input
                            type="text"
                            value={formData.secondaryAction.url}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              secondaryAction: { ...prev.secondaryAction, url: e.target.value }
                            }))}
                            placeholder="https://example.com or /internal-route"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between">
                      <button
            onClick={onClose}
            disabled={isLoading}
            className={`px-4 py-2 border border-gray-300 rounded-lg transition-colors ${
              isLoading 
                ? 'text-gray-400 cursor-not-allowed' 
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            Cancel
          </button>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  // Save as draft functionality
                  toast.success('Notification saved as draft');
                }}
                disabled={isLoading}
                className={`px-4 py-2 border border-gray-300 rounded-lg transition-colors ${
                  isLoading 
                    ? 'text-gray-400 cursor-not-allowed' 
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Save as Draft
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className={`px-6 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                  isLoading 
                    ? 'bg-gray-400 text-white cursor-not-allowed' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{mode === 'create' ? 'Create & Send' : 'Update & Send'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default NotificationFormModal; 