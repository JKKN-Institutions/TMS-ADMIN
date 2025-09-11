'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Send,
  Bell,
  Users,
  UserCheck,
  Settings,
  Globe,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Zap,
  Target,
  MessageCircle,
  Mail,
  Smartphone
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (broadcastData: any) => void;
}

const BroadcastModal: React.FC<BroadcastModalProps> = ({
  isOpen,
  onClose,
  onSend
}) => {
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info',
    targetAudience: 'students',
    priority: 'normal',
    enablePushNotification: true,
    enableEmailNotification: false,
    enableSMSNotification: false,
    sendImmediately: true
  });
  
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const broadcastTypes = [
    { value: 'info', label: 'Information', icon: Info, color: 'text-blue-600 bg-blue-100' },
    { value: 'warning', label: 'Warning', icon: AlertTriangle, color: 'text-yellow-600 bg-yellow-100' },
    { value: 'error', label: 'Emergency', icon: XCircle, color: 'text-red-600 bg-red-100' },
    { value: 'success', label: 'Good News', icon: CheckCircle, color: 'text-green-600 bg-green-100' }
  ];

  const audienceOptions = [
    { value: 'students', label: 'All Students', icon: Users, description: 'Send to all registered students', count: '2,847' },
    { value: 'drivers', label: 'All Drivers', icon: UserCheck, description: 'Send to all active drivers', count: '25' },
    { value: 'admins', label: 'All Admins', icon: Settings, description: 'Send to all admin users', count: '8' },
    { value: 'all', label: 'Everyone', icon: Globe, description: 'Send to all users in the system', count: '2,880' }
  ];

  const priorityLevels = [
    { value: 'low', label: 'Low Priority', color: 'text-gray-600', description: 'Standard notification' },
    { value: 'normal', label: 'Normal Priority', color: 'text-blue-600', description: 'Regular importance' },
    { value: 'high', label: 'High Priority', color: 'text-orange-600', description: 'Important message' },
    { value: 'urgent', label: 'Urgent', color: 'text-red-600', description: 'Immediate attention required' }
  ];

  const generateBroadcastId = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `BRD${year}${month}${day}${random}`;
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
    if (!formData.enablePushNotification && !formData.enableEmailNotification && !formData.enableSMSNotification) {
      toast.error('Please select at least one delivery method');
      return false;
    }
    return true;
  };

  const handleSend = async () => {
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

      // Create notification data with correct database field names
      const notificationData = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        type: formData.type,
        category: 'system',
        target_audience: formData.targetAudience,
        is_active: true,
        scheduled_at: formData.sendImmediately ? new Date().toISOString() : null,
        expires_at: null,
        enable_push_notification: formData.enablePushNotification,
        enable_email_notification: formData.enableEmailNotification,
        enable_sms_notification: formData.enableSMSNotification,
        actionable: false,
        tags: ['broadcast', 'admin', formData.type],
        created_by: adminId
      };

      // Call API to create notification
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send broadcast');
      }

      const result = await response.json();
      
      // Call the onSend callback with the created notification
      onSend(result.data);
      
      // Show success message
      toast.success(`Broadcast sent successfully to ${selectedAudience?.label}!`);
      
      onClose();
      
      // Reset form
      setFormData({
        title: '',
        message: '',
        type: 'info',
        targetAudience: 'students',
        priority: 'normal',
        enablePushNotification: true,
        enableEmailNotification: false,
        enableSMSNotification: false,
        sendImmediately: true
      });

    } catch (error) {
      console.error('Error sending broadcast:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send broadcast');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAudience = audienceOptions.find(option => option.value === formData.targetAudience);
  const selectedType = broadcastTypes.find(type => type.value === formData.type);
  const selectedPriority = priorityLevels.find(priority => priority.value === formData.priority);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-2xl max-h-[98vh] sm:max-h-[95vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
              <Send className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Broadcast Message</h2>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Send an immediate message to multiple users</p>
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

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Basic Information */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Broadcast Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter broadcast title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm sm:text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Enter your broadcast message..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 h-24 sm:h-32 resize-none text-sm sm:text-base"
              />
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {formData.message.length}/500 characters
              </p>
            </div>

            {/* Message Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Message Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {broadcastTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({ ...prev, type: type.value }))}
                      className={`p-3 border-2 rounded-lg text-left transition-colors ${
                        formData.type === type.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${type.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-gray-900 text-sm sm:text-base">{type.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Audience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Target Audience</label>
              <div className="space-y-2">
                {audienceOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setFormData(prev => ({ ...prev, targetAudience: option.value }))}
                      className={`w-full p-3 sm:p-4 border-2 rounded-lg text-left transition-colors ${
                        formData.targetAudience === option.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <Icon className="w-5 h-5 text-purple-600 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{option.label}</p>
                            <p className="text-xs sm:text-sm text-gray-600 truncate">{option.description}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-sm font-medium text-gray-900">{option.count}</p>
                          <p className="text-xs text-gray-500">recipients</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Priority Level</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {priorityLevels.map((priority) => (
                  <button
                    key={priority.value}
                    onClick={() => setFormData(prev => ({ ...prev, priority: priority.value }))}
                    className={`p-3 border-2 rounded-lg text-left transition-colors ${
                      formData.priority === priority.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <p className={`font-medium text-sm sm:text-base ${priority.color}`}>{priority.label}</p>
                      <p className="text-xs sm:text-sm text-gray-600">{priority.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Delivery Methods */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Delivery Methods</label>
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Bell className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm sm:text-base">Push Notification</p>
                      <p className="text-xs sm:text-sm text-gray-600">Mobile app notification</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enablePushNotification}
                    onChange={(e) => setFormData(prev => ({ ...prev, enablePushNotification: e.target.checked }))}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                  />
                </div>

                <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Mail className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm sm:text-base">Email Notification</p>
                      <p className="text-xs sm:text-sm text-gray-600">Email to registered address</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableEmailNotification}
                    onChange={(e) => setFormData(prev => ({ ...prev, enableEmailNotification: e.target.checked }))}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                  />
                </div>

                <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Smartphone className="w-5 h-5 text-purple-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm sm:text-base">SMS Notification</p>
                      <p className="text-xs sm:text-sm text-gray-600">Text message to mobile</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableSMSNotification}
                    onChange={(e) => setFormData(prev => ({ ...prev, enableSMSNotification: e.target.checked }))}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <h3 className="font-medium text-gray-900 mb-3 text-sm sm:text-base">Broadcast Preview</h3>
              <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-start space-x-3">
                  {selectedType && (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedType.color} flex-shrink-0`}>
                      <selectedType.icon className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base flex-1 min-w-0">
                        {formData.title || 'Broadcast Title'}
                      </h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                        selectedPriority?.color === 'text-red-600' ? 'bg-red-100 text-red-800' :
                        selectedPriority?.color === 'text-orange-600' ? 'bg-orange-100 text-orange-800' :
                        selectedPriority?.color === 'text-blue-600' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedPriority?.label}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-700 mb-2">
                      {formData.message || 'Your broadcast message will appear here...'}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
                      <span>To: {selectedAudience?.label}</span>
                      <span>•</span>
                      <span>Recipients: {selectedAudience?.count}</span>
                      <span>•</span>
                      <span>Now</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 border-t border-gray-200 p-4 sm:p-6 bg-gray-50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-xs sm:text-sm text-gray-600">
              This will send immediately to <span className="font-medium">{selectedAudience?.count}</span> recipients
            </div>
            <div className="flex space-x-3 w-full sm:w-auto">
              <button
                onClick={onClose}
                disabled={isLoading}
                className={`flex-1 sm:flex-none px-4 py-2 border border-gray-300 rounded-lg transition-colors text-sm sm:text-base ${
                  isLoading 
                    ? 'text-gray-400 cursor-not-allowed' 
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isLoading}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2 text-sm sm:text-base ${
                  isLoading 
                    ? 'bg-gray-400 text-white cursor-not-allowed' 
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Broadcast</span>
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

export default BroadcastModal; 