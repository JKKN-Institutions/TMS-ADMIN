'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Clock,
  Users,
  MessageSquare,
  Settings,
  Eye,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Info,
  Bus,
  CreditCard,
  Calendar,
  Target,
  BarChart3,
  RotateCcw,
  Plus,
  Edit,
  Trash2,
  Copy,
  Activity,
  Terminal,
  Bell
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import toast from 'react-hot-toast';

interface NotificationTemplate {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'transport' | 'payment';
  category: 'transport' | 'payment' | 'system' | 'emergency';
  actionable: boolean;
  primaryAction?: {
    text: string;
    url: string;
    type: string;
  };
  secondaryAction?: {
    text: string;
    url: string;
    type: string;
  };
}

interface NotificationResponse {
  notification: {
    id: string;
    title: string;
    message: string;
    type: string;
    category: string;
    targetAudience: string;
    createdAt: string;
  };
  delivery: {
    totalSent: number;
    totalFailed: number;
    totalSubscriptions: number;
    deliveredAt?: string;
    results: Array<{
      userId: string;
      success: boolean;
      error?: string;
    }>;
  };
  interactions: {
    totalRead: number;
    readBy: string[];
    bookingActions: Array<{
      id: string;
      student_id: string;
      action: string;
      created_at: string;
      students: {
        student_name: string;
        email: string;
      };
    }>;
  };
}

interface AdminPushNotificationsProps {
  adminId: string;
  className?: string;
}

const AdminPushNotifications: React.FC<AdminPushNotificationsProps> = ({
  adminId,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState('send');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Record<string, NotificationTemplate[]>>({});
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info' as const,
    category: 'system' as const,
    targetAudience: 'all' as const,
    specificUsers: [] as string[],
    routes: [] as string[],
    scheduledFor: '',
    requireInteraction: false,
    actionable: false,
    primaryAction: {
      text: '',
      url: '',
      type: ''
    },
    secondaryAction: {
      text: '',
      url: '',
      type: ''
    },
    sendImmediately: true
  });

  // Response tracking state
  const [selectedNotificationId, setSelectedNotificationId] = useState<string>('');
  const [notificationResponses, setNotificationResponses] = useState<NotificationResponse | null>(null);
  const [responseLoading, setResponseLoading] = useState(false);

  // Push notification support state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    loadTemplates();
    loadRecentNotifications();
    initializePushSupport();
  }, [adminId]);

  // Initialize push notification support detection
  const initializePushSupport = async () => {
    if (typeof window !== 'undefined') {
      // Check if push notifications are supported
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setPushSupported(supported);
      
      if (supported) {
        // Check current permission
        const currentPermission = Notification.permission;
        setPermission(currentPermission);
        
        // Check if push is enabled (permission granted and service worker registered)
        if (currentPermission === 'granted') {
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setPushEnabled(!!subscription);
          } catch (error) {
            console.error('Error checking push subscription:', error);
            setPushEnabled(false);
          }
        }
      }
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch(`/api/admin/notifications/push?adminId=${adminId}&action=templates`);
      const data = await response.json();
      
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Failed to load notification templates');
    }
  };

  const loadRecentNotifications = async () => {
    try {
      const response = await fetch(`/api/admin/notifications/push?adminId=${adminId}&action=recent`);
      const data = await response.json();
      
      if (data.success) {
        setRecentNotifications(data.notifications);
      }
    } catch (error) {
      console.error('Error loading recent notifications:', error);
      toast.error('Failed to load recent notifications');
    }
  };

  const loadNotificationResponses = async (notificationId: string) => {
    try {
      setResponseLoading(true);
      const response = await fetch(
        `/api/admin/notifications/push?adminId=${adminId}&action=responses&notificationId=${notificationId}`
      );
      const data = await response.json();
      
      if (data.success) {
        setNotificationResponses(data.responses);
      } else {
        toast.error('Failed to load notification responses');
      }
    } catch (error) {
      console.error('Error loading notification responses:', error);
      toast.error('Failed to load notification responses');
    } finally {
      setResponseLoading(false);
    }
  };

  const handleTemplateSelect = (template: NotificationTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      ...formData,
      title: template.title,
      message: template.message,
      type: template.type,
      category: template.category,
      actionable: template.actionable,
      primaryAction: template.primaryAction || { text: '', url: '', type: '' },
      secondaryAction: template.secondaryAction || { text: '', url: '', type: '' }
    });
  };

  const handleSendNotification = async () => {
    if (!formData.title || !formData.message) {
      toast.error('Title and message are required');
      return;
    }

    try {
      setLoading(true);
      
      const response = await fetch('/api/admin/notifications/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          adminId
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          `Notification ${formData.sendImmediately ? 'sent' : 'scheduled'} successfully! ` +
          `Delivered to ${result.pushResult?.sent || 0} users.`
        );
        
        // Reset form
        setFormData({
          title: '',
          message: '',
          type: 'info',
          category: 'system',
          targetAudience: 'all',
          specificUsers: [],
          routes: [],
          scheduledFor: '',
          requireInteraction: false,
          actionable: false,
          primaryAction: { text: '', url: '', type: '' },
          secondaryAction: { text: '', url: '', type: '' },
          sendImmediately: true
        });
        
        setSelectedTemplate(null);
        
        // Reload recent notifications
        await loadRecentNotifications();
        
        // Switch to monitor tab to see results
        setActiveTab('monitor');
      } else {
        toast.error(result.error || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error('Failed to send notification');
    } finally {
      setLoading(false);
    }
  };

  const handleResponseCheck = async () => {
    if (!selectedNotificationId) {
      toast.error('Please select a notification to check responses');
      return;
    }

    await loadNotificationResponses(selectedNotificationId);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'transport': return <Bus className="w-4 h-4 text-blue-500" />;
      case 'payment': return <CreditCard className="w-4 h-4 text-green-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  // Helper function to handle test notifications
  const handleTestNotification = async (testType: string) => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/admin/notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          testType
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          `${testType.replace('_', ' ')} test completed! ` +
          `${result.result.sent || 0} notifications sent.`
        );
      } else {
        toast.error(result.error || `${testType} test failed`);
      }
    } catch (error) {
      console.error('Test notification error:', error);
      toast.error('Failed to run test notification');
    } finally {
      setLoading(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'transport': return 'bg-blue-100 text-blue-800';
      case 'payment': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Push Notifications</h1>
          <p className="text-gray-600 mt-2">
            Send and monitor web push notifications to students and staff
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="send" className="flex items-center space-x-2">
            <Send className="w-4 h-4" />
            <span>Send Notification</span>
          </TabsTrigger>
          <TabsTrigger value="monitor" className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4" />
            <span>Monitor & Responses</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4" />
            <span>Templates</span>
          </TabsTrigger>
          <TabsTrigger value="test" className="flex items-center space-x-2">
            <Settings className="w-4 h-4" />
            <span>Test & Debug</span>
          </TabsTrigger>
        </TabsList>

        {/* Send Notification Tab */}
        <TabsContent value="send" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Notification Form */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Send className="w-5 h-5" />
                    <span>Create Notification</span>
                  </CardTitle>
                  <CardDescription>
                    Compose and send push notifications to your target audience
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Basic Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Enter notification title"
                        maxLength={100}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="type">Type</Label>
                      <select
                        id="type"
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="info">Info</option>
                        <option value="success">Success</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                        <option value="transport">Transport</option>
                        <option value="payment">Payment</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Enter notification message"
                      rows={3}
                      maxLength={300}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      {formData.message.length}/300 characters
                    </p>
                  </div>

                  {/* Target Audience */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <select
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="system">System</option>
                        <option value="transport">Transport</option>
                        <option value="payment">Payment</option>
                        <option value="emergency">Emergency</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="targetAudience">Target Audience</Label>
                      <select
                        id="targetAudience"
                        value={formData.targetAudience}
                        onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">All Students</option>
                        <option value="students">Transport Students</option>
                        <option value="specific_users">Specific Users</option>
                      </select>
                    </div>
                  </div>

                  {/* Scheduling */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="scheduledFor">Schedule For (Optional)</Label>
                      <Input
                        id="scheduledFor"
                        type="datetime-local"
                        value={formData.scheduledFor}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          scheduledFor: e.target.value,
                          sendImmediately: !e.target.value
                        })}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </div>

                    <div className="flex items-center space-x-4 pt-6">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.requireInteraction}
                          onChange={(e) => setFormData({ ...formData, requireInteraction: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Require Interaction</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.actionable}
                          onChange={(e) => setFormData({ ...formData, actionable: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Add Actions</span>
                      </label>
                    </div>
                  </div>

                  {/* Actions */}
                  {formData.actionable && (
                    <div className="space-y-4 border-t pt-4">
                      <h4 className="font-medium text-gray-900">Notification Actions</h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="primaryActionText">Primary Action Text</Label>
                          <Input
                            id="primaryActionText"
                            value={formData.primaryAction.text}
                            onChange={(e) => setFormData({
                              ...formData,
                              primaryAction: { ...formData.primaryAction, text: e.target.value }
                            })}
                            placeholder="e.g., View Details"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="primaryActionUrl">Primary Action URL</Label>
                          <Input
                            id="primaryActionUrl"
                            value={formData.primaryAction.url}
                            onChange={(e) => setFormData({
                              ...formData,
                              primaryAction: { ...formData.primaryAction, url: e.target.value }
                            })}
                            placeholder="/dashboard/schedules"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="primaryActionType">Action Type</Label>
                          <Input
                            id="primaryActionType"
                            value={formData.primaryAction.type}
                            onChange={(e) => setFormData({
                              ...formData,
                              primaryAction: { ...formData.primaryAction, type: e.target.value }
                            })}
                            placeholder="view_details"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Send Button */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>
                        {formData.scheduledFor && !formData.sendImmediately 
                          ? `Scheduled for ${new Date(formData.scheduledFor).toLocaleString()}`
                          : 'Will send immediately'
                        }
                      </span>
                    </div>
                    
                    <Button
                      onClick={handleSendNotification}
                      disabled={loading || !formData.title || !formData.message}
                      className="flex items-center space-x-2"
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>{formData.scheduledFor && !formData.sendImmediately ? 'Schedule' : 'Send Now'}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview & Quick Templates */}
            <div className="space-y-6">
              {/* Notification Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Eye className="w-5 h-5" />
                    <span>Preview</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 text-white p-4 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                        {getTypeIcon(formData.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-white">
                          {formData.title || 'Notification Title'}
                        </h4>
                        <p className="text-gray-300 text-sm mt-1">
                          {formData.message || 'Notification message will appear here...'}
                        </p>
                        {formData.actionable && formData.primaryAction.text && (
                          <div className="flex space-x-2 mt-3">
                            <button className="bg-blue-600 text-white px-3 py-1 rounded text-xs">
                              {formData.primaryAction.text}
                            </button>
                            {formData.secondaryAction.text && (
                              <button className="bg-gray-600 text-white px-3 py-1 rounded text-xs">
                                {formData.secondaryAction.text}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Templates */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MessageSquare className="w-5 h-5" />
                    <span>Quick Templates</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(templates).map(([category, categoryTemplates]) => (
                      <div key={category}>
                        <h5 className="font-medium text-gray-700 mb-2 capitalize">{category}</h5>
                        {categoryTemplates.slice(0, 2).map((template) => (
                          <button
                            key={template.id}
                            onClick={() => handleTemplateSelect(template)}
                            className="w-full text-left p-2 rounded border hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center space-x-2">
                              {getTypeIcon(template.type)}
                              <span className="text-sm font-medium">{template.title}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {template.message}
                            </p>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Monitor & Responses Tab */}
        <TabsContent value="monitor" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Notifications */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Notifications</CardTitle>
                  <CardDescription>
                    View and monitor recently sent notifications
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadRecentNotifications}
                  className="flex items-center space-x-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>RotateCcw</span>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedNotificationId === notification.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedNotificationId(notification.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            {getTypeIcon(notification.type)}
                            <h4 className="font-medium text-sm">{notification.title}</h4>
                            <Badge className={getTypeColor(notification.type)}>
                              {notification.type}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>Target: {notification.target_audience}</span>
                            <span>{new Date(notification.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {recentNotifications.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p>No recent notifications found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Response Tracking */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5" />
                  <span>Response Tracking</span>
                </CardTitle>
                <CardDescription>
                  Check delivery status and user responses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={handleResponseCheck}
                      disabled={!selectedNotificationId || responseLoading}
                      className="flex items-center space-x-2"
                    >
                      {responseLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                      <span>Check Responses</span>
                    </Button>
                    
                    {selectedNotificationId && (
                      <Badge variant="outline">
                        Selected: {selectedNotificationId.slice(0, 8)}...
                      </Badge>
                    )}
                  </div>

                  {notificationResponses && (
                    <div className="space-y-4 border-t pt-4">
                      {/* Delivery Stats */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Delivery Statistics</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-green-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-green-700">
                              {notificationResponses.delivery.totalSent}
                            </div>
                            <div className="text-sm text-green-600">Successfully Sent</div>
                          </div>
                          
                          <div className="bg-red-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-red-700">
                              {notificationResponses.delivery.totalFailed}
                            </div>
                            <div className="text-sm text-red-600">Failed</div>
                          </div>
                          
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-blue-700">
                              {notificationResponses.interactions.totalRead}
                            </div>
                            <div className="text-sm text-blue-600">Read</div>
                          </div>
                          
                          <div className="bg-purple-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-purple-700">
                              {notificationResponses.interactions.bookingActions.length}
                            </div>
                            <div className="text-sm text-purple-600">Actions</div>
                          </div>
                        </div>
                      </div>

                      {/* User Interactions */}
                      {notificationResponses.interactions.bookingActions.length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">User Actions</h4>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {notificationResponses.interactions.bookingActions.map((action) => (
                              <div key={action.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <div>
                                  <span className="font-medium text-sm">{action.students.student_name}</span>
                                  <span className="text-xs text-gray-500 ml-2">{action.students.email}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Badge variant={action.action === 'confirm' ? 'default' : 'secondary'}>
                                    {action.action}
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {new Date(action.created_at).toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!selectedNotificationId && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Select a notification from the list to view its response data.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(templates).map(([category, categoryTemplates]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="capitalize flex items-center space-x-2">
                    {category === 'transport' && <Bus className="w-5 h-5" />}
                    {category === 'payment' && <CreditCard className="w-5 h-5" />}
                    {category === 'system' && <Settings className="w-5 h-5" />}
                    {category === 'emergency' && <AlertTriangle className="w-5 h-5" />}
                    <span>{category} Templates</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categoryTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            {getTypeIcon(template.type)}
                            <h4 className="font-medium text-sm">{template.title}</h4>
                          </div>
                          <button
                            onClick={() => handleTemplateSelect(template)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">{template.message}</p>
                        <div className="flex items-center space-x-2">
                          <Badge className={getTypeColor(template.type)}>
                            {template.type}
                          </Badge>
                          {template.actionable && (
                            <Badge variant="outline">Actionable</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Test & Debug Tab */}
        <TabsContent value="test" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Test Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="w-5 h-5" />
                  <span>Test Notifications</span>
                </CardTitle>
                <CardDescription>
                  Send test notifications to verify system functionality
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    onClick={() => handleTestNotification('basic')}
                    disabled={loading}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Bell className="w-4 h-4" />
                    <span>Basic Test</span>
                  </Button>
                  
                  <Button
                    onClick={() => handleTestNotification('interactive')}
                    disabled={loading}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Target className="w-4 h-4" />
                    <span>Interactive Test</span>
                  </Button>
                  
                  <Button
                    onClick={() => handleTestNotification('booking_reminder')}
                    disabled={loading}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Bus className="w-4 h-4" />
                    <span>Booking Reminder</span>
                  </Button>
                  
                  <Button
                    onClick={() => handleTestNotification('system_check')}
                    disabled={loading}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Eye className="w-4 h-4" />
                    <span>System Check</span>
                  </Button>
                </div>
                
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Test Instructions</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• <strong>Basic Test:</strong> Sends a simple notification</li>
                    <li>• <strong>Interactive Test:</strong> Sends notification with action buttons</li>
                    <li>• <strong>Booking Reminder:</strong> Simulates trip booking reminder</li>
                    <li>• <strong>System Check:</strong> Verifies VAPID keys and database connections</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="w-5 h-5" />
                  <span>System Status</span>
                </CardTitle>
                <CardDescription>
                  Current push notification system health
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-700">
                      {pushEnabled ? '✅' : '❌'}
                    </div>
                    <div className="text-sm text-green-600">Push Support</div>
                  </div>
                  
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-700">
                      {permission === 'granted' ? '✅' : '❌'}
                    </div>
                    <div className="text-sm text-blue-600">Permission</div>
                  </div>
                </div>
                
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {pushSupported 
                      ? 'Push notifications are supported in this browser.'
                      : 'Push notifications are not supported in this browser.'
                    }
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900">Environment Check</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>VAPID Public Key:</span>
                      <span className={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? 'text-green-600' : 'text-red-600'}>
                        {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? '✅ Set' : '❌ Missing'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Secure Context (HTTPS):</span>
                      <span className={typeof window !== 'undefined' && window.isSecureContext ? 'text-green-600' : 'text-red-600'}>
                        {typeof window !== 'undefined' && window.isSecureContext ? '✅ Yes' : '❌ No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Service Worker:</span>
                      <span className={'serviceWorker' in navigator ? 'text-green-600' : 'text-red-600'}>
                        {'serviceWorker' in navigator ? '✅ Supported' : '❌ Not Supported'}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Debug Console */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Terminal className="w-5 h-5" />
                <span>Debug Console</span>
              </CardTitle>
              <CardDescription>
                Real-time debug information and test results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
                <div className="space-y-1">
                  <div>🚀 Admin Push Notification System v1.0</div>
                  <div>📍 Environment: {process.env.NODE_ENV || 'development'}</div>
                  <div>🔧 System initialized at {new Date().toLocaleString()}</div>
                  <div>👤 Admin: {adminId}</div>
                  <div className="border-t border-gray-700 pt-2 mt-2">
                    <div>Ready for testing...</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPushNotifications;
