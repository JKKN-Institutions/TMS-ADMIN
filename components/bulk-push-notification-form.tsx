'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Download,
  Users,
  MessageSquare,
  Send,
  FileText,
  CheckCircle,
  AlertTriangle,
  Info,
  Trash2,
  Eye,
  Filter,
  Calendar,
  Clock,
  Target,
  BarChart3,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import toast from 'react-hot-toast';

interface BulkNotificationTarget {
  id: string;
  name: string;
  email: string;
  type: 'student' | 'staff' | 'parent';
  route?: string;
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  error?: string;
}

interface BulkNotificationForm {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'transport' | 'payment';
  category: 'transport' | 'payment' | 'system' | 'emergency';
  scheduledFor: string;
  sendImmediately: boolean;
  actionable: boolean;
  primaryAction: {
    text: string;
    url: string;
    type: string;
  };
}

interface BulkPushNotificationFormProps {
  adminId: string;
  className?: string;
}

const BulkPushNotificationForm: React.FC<BulkPushNotificationFormProps> = ({
  adminId,
  className = ''
}) => {
  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<'csv' | 'filter' | 'all'>('filter');
  const [targets, setTargets] = useState<BulkNotificationTarget[]>([]);
  const [formData, setFormData] = useState<BulkNotificationForm>({
    title: '',
    message: '',
    type: 'info',
    category: 'system',
    scheduledFor: '',
    sendImmediately: true,
    actionable: false,
    primaryAction: {
      text: '',
      url: '',
      type: ''
    }
  });

  // Filter state
  const [filters, setFilters] = useState({
    userType: 'all' as 'all' | 'students' | 'staff' | 'parents',
    routes: [] as string[],
    activeOnly: true,
    hasSubscriptions: true
  });

  // Available routes for filtering
  const [availableRoutes, setAvailableRoutes] = useState<string[]>([]);
  
  // Sending progress
  const [sendingProgress, setSendingProgress] = useState({
    total: 0,
    sent: 0,
    failed: 0,
    inProgress: false
  });

  useEffect(() => {
    loadAvailableRoutes();
  }, []);

  const loadAvailableRoutes = async () => {
    try {
      const response = await fetch(`/api/admin/routes?adminId=${adminId}`);
      const data = await response.json();
      if (data.success) {
        setAvailableRoutes(data.routes.map((r: any) => r.route_name));
      }
    } catch (error) {
      console.error('Error loading routes:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv') {
      toast.error('Please upload a CSV file');
      return;
    }

    try {
      setLoading(true);
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const expectedHeaders = ['name', 'email', 'type'];
      const hasValidHeaders = expectedHeaders.every(header => 
        headers.some(h => h.toLowerCase().includes(header))
      );

      if (!hasValidHeaders) {
        toast.error('CSV must have columns: name, email, type');
        return;
      }

      const newTargets: BulkNotificationTarget[] = lines.slice(1)
        .filter(line => line.trim())
        .map((line, index) => {
          const values = line.split(',').map(v => v.trim());
          return {
            id: `csv-${index}`,
            name: values[0] || 'Unknown',
            email: values[1] || '',
            type: (values[2]?.toLowerCase() as 'student' | 'staff' | 'parent') || 'student',
            route: values[3] || undefined,
            status: 'pending' as const
          };
        });

      setTargets(newTargets);
      toast.success(`Loaded ${newTargets.length} targets from CSV`);
      setActiveStep(2);
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast.error('Error parsing CSV file');
    } finally {
      setLoading(false);
    }
  };

  const loadFilteredTargets = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/notifications/bulk-targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          filters
        })
      });

      const data = await response.json();
      if (data.success) {
        setTargets(data.targets.map((target: any) => ({
          ...target,
          status: 'pending' as const
        })));
        toast.success(`Found ${data.targets.length} matching users`);
        setActiveStep(2);
      } else {
        toast.error(data.error || 'Failed to load targets');
      }
    } catch (error) {
      console.error('Error loading filtered targets:', error);
      toast.error('Failed to load targets');
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/notifications/all-targets?adminId=${adminId}`);
      const data = await response.json();
      
      if (data.success) {
        setTargets(data.targets.map((target: any) => ({
          ...target,
          status: 'pending' as const
        })));
        toast.success(`Loaded ${data.targets.length} users`);
        setActiveStep(2);
      } else {
        toast.error(data.error || 'Failed to load all users');
      }
    } catch (error) {
      console.error('Error loading all users:', error);
      toast.error('Failed to load all users');
    } finally {
      setLoading(false);
    }
  };

  const removeTarget = (targetId: string) => {
    setTargets(targets.filter(t => t.id !== targetId));
  };

  const handleSendBulkNotification = async () => {
    if (!formData.title || !formData.message) {
      toast.error('Title and message are required');
      return;
    }

    if (targets.length === 0) {
      toast.error('No targets selected');
      return;
    }

    try {
      setLoading(true);
      setSendingProgress({
        total: targets.length,
        sent: 0,
        failed: 0,
        inProgress: true
      });

      const response = await fetch('/api/admin/notifications/bulk-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          notification: formData,
          targets: targets.map(t => ({ id: t.id, email: t.email, type: t.type }))
        })
      });

      const result = await response.json();

      if (result.success) {
        // Update targets with results
        const updatedTargets = targets.map(target => {
          const sendResult = result.results.find((r: any) => r.targetId === target.id);
          return {
            ...target,
            status: sendResult?.success ? 'sent' : 'failed',
            error: sendResult?.error
          };
        });
        
        setTargets(updatedTargets);
        
        const successCount = result.results.filter((r: any) => r.success).length;
        const failCount = result.results.filter((r: any) => !r.success).length;
        
        setSendingProgress({
          total: targets.length,
          sent: successCount,
          failed: failCount,
          inProgress: false
        });

        toast.success(
          `Bulk notification completed! ${successCount} sent, ${failCount} failed`
        );
        
        setActiveStep(4);
      } else {
        toast.error(result.error || 'Failed to send bulk notification');
        setSendingProgress(prev => ({ ...prev, inProgress: false }));
      }
    } catch (error) {
      console.error('Error sending bulk notification:', error);
      toast.error('Failed to send bulk notification');
      setSendingProgress(prev => ({ ...prev, inProgress: false }));
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = 'name,email,type,route\n' +
      'John Doe,john@example.com,student,Route A\n' +
      'Jane Smith,jane@example.com,staff,\n' +
      'Mike Johnson,mike@example.com,parent,Route B';
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-notification-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadResults = () => {
    if (targets.length === 0) return;
    
    const csvContent = 'name,email,type,status,error\n' +
      targets.map(t => `${t.name},${t.email},${t.type},${t.status},${t.error || ''}`).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-notification-results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getStepStatus = (step: number) => {
    if (step < activeStep) return 'completed';
    if (step === activeStep) return 'active';
    return 'pending';
  };

  const resetForm = () => {
    setActiveStep(1);
    setTargets([]);
    setFormData({
      title: '',
      message: '',
      type: 'info',
      category: 'system',
      scheduledFor: '',
      sendImmediately: true,
      actionable: false,
      primaryAction: { text: '', url: '', type: '' }
    });
    setSendingProgress({
      total: 0,
      sent: 0,
      failed: 0,
      inProgress: false
    });
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {[
          { step: 1, title: 'Select Targets', icon: Users },
          { step: 2, title: 'Compose Message', icon: MessageSquare },
          { step: 3, title: 'Review & Send', icon: Eye },
          { step: 4, title: 'Results', icon: BarChart3 }
        ].map(({ step, title, icon: Icon }) => {
          const status = getStepStatus(step);
          return (
            <div key={step} className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                status === 'completed' ? 'bg-green-500 border-green-500 text-white' :
                status === 'active' ? 'bg-blue-500 border-blue-500 text-white' :
                'bg-gray-200 border-gray-300 text-gray-500'
              }`}>
                {status === 'completed' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${
                  status === 'active' ? 'text-blue-600' : 
                  status === 'completed' ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {title}
                </p>
              </div>
              {step < 4 && (
                <div className={`w-12 h-0.5 mx-4 ${
                  status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Select Targets */}
        {activeStep === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="w-5 h-5" />
                  <span>Select Target Audience</span>
                </CardTitle>
                <CardDescription>
                  Choose how you want to select recipients for your bulk notification
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Upload Method Selection */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setUploadMethod('csv')}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      uploadMethod === 'csv' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Upload className="w-8 h-8 text-blue-600 mb-2" />
                    <h3 className="font-medium text-gray-900">Upload CSV</h3>
                    <p className="text-sm text-gray-600">Upload a CSV file with recipient details</p>
                  </button>

                  <button
                    onClick={() => setUploadMethod('filter')}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      uploadMethod === 'filter' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Filter className="w-8 h-8 text-green-600 mb-2" />
                    <h3 className="font-medium text-gray-900">Filter Users</h3>
                    <p className="text-sm text-gray-600">Select users based on criteria</p>
                  </button>

                  <button
                    onClick={() => setUploadMethod('all')}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      uploadMethod === 'all' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Target className="w-8 h-8 text-purple-600 mb-2" />
                    <h3 className="font-medium text-gray-900">All Users</h3>
                    <p className="text-sm text-gray-600">Send to all registered users</p>
                  </button>
                </div>

                {/* CSV Upload */}
                {uploadMethod === 'csv' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="csvFile">Upload CSV File</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadTemplate}
                        className="flex items-center space-x-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Template</span>
                      </Button>
                    </div>
                    <Input
                      id="csvFile"
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      disabled={loading}
                    />
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        CSV should have columns: name, email, type (student/staff/parent), route (optional)
                      </AlertDescription>
                    </Alert>
                  </div>
                )}

                {/* Filter Options */}
                {uploadMethod === 'filter' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="userType">User Type</Label>
                        <select
                          id="userType"
                          value={filters.userType}
                          onChange={(e) => setFilters({ ...filters, userType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="all">All Users</option>
                          <option value="students">Students Only</option>
                          <option value="staff">Staff Only</option>
                          <option value="parents">Parents Only</option>
                        </select>
                      </div>

                      <div>
                        <Label htmlFor="routes">Routes (Optional)</Label>
                        <select
                          id="routes"
                          multiple
                          value={filters.routes}
                          onChange={(e) => setFilters({
                            ...filters,
                            routes: Array.from(e.target.selectedOptions, option => option.value)
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {availableRoutes.map(route => (
                            <option key={route} value={route}>{route}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={filters.activeOnly}
                          onChange={(e) => setFilters({ ...filters, activeOnly: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Active users only</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={filters.hasSubscriptions}
                          onChange={(e) => setFilters({ ...filters, hasSubscriptions: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Has push subscriptions</span>
                      </label>
                    </div>

                    <Button
                      onClick={loadFilteredTargets}
                      disabled={loading}
                      className="flex items-center space-x-2"
                    >
                      {loading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <Filter className="w-4 h-4" />
                      )}
                      <span>Load Filtered Users</span>
                    </Button>
                  </div>
                )}

                {/* All Users */}
                {uploadMethod === 'all' && (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        This will load all registered users. Use with caution for large databases.
                      </AlertDescription>
                    </Alert>

                    <Button
                      onClick={loadAllUsers}
                      disabled={loading}
                      className="flex items-center space-x-2"
                    >
                      {loading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <Users className="w-4 h-4" />
                      )}
                      <span>Load All Users</span>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 2: Compose Message */}
        {activeStep === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Target Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="w-5 h-5" />
                    <span>Target Summary</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Recipients</span>
                      <Badge>{targets.length}</Badge>
                    </div>
                    
                    <div className="space-y-2">
                      {['student', 'staff', 'parent'].map(type => {
                        const count = targets.filter(t => t.type === type).length;
                        return count > 0 ? (
                          <div key={type} className="flex justify-between text-sm">
                            <span className="capitalize">{type}s</span>
                            <span>{count}</span>
                          </div>
                        ) : null;
                      })}
                    </div>

                    <div className="pt-3 border-t max-h-40 overflow-y-auto">
                      {targets.slice(0, 10).map(target => (
                        <div key={target.id} className="flex items-center justify-between py-1">
                          <span className="text-xs text-gray-600 truncate">{target.name}</span>
                          <button
                            onClick={() => removeTarget(target.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {targets.length > 10 && (
                        <div className="text-xs text-gray-500 pt-2">
                          And {targets.length - 10} more...
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Message Form */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <MessageSquare className="w-5 h-5" />
                      <span>Compose Notification</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                        rows={4}
                        maxLength={300}
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        {formData.message.length}/300 characters
                      </p>
                    </div>

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
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => setActiveStep(1)}
                      >
                        Back
                      </Button>
                      
                      <Button
                        onClick={() => setActiveStep(3)}
                        disabled={!formData.title || !formData.message}
                      >
                        Review & Send
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Review & Send */}
        {activeStep === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Eye className="w-5 h-5" />
                  <span>Review & Send</span>
                </CardTitle>
                <CardDescription>
                  Review your notification before sending to {targets.length} recipients
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Notification Preview */}
                <div className="bg-gray-900 text-white p-4 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-white">{formData.title}</h4>
                      <p className="text-gray-300 text-sm mt-1">{formData.message}</p>
                      {formData.actionable && formData.primaryAction.text && (
                        <div className="flex space-x-2 mt-3">
                          <button className="bg-blue-600 text-white px-3 py-1 rounded text-xs">
                            {formData.primaryAction.text}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-700">{targets.length}</div>
                    <div className="text-sm text-blue-600">Total Recipients</div>
                  </div>
                  
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-700">{formData.type}</div>
                    <div className="text-sm text-green-600">Notification Type</div>
                  </div>
                  
                  <div className="bg-purple-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-purple-700">{formData.category}</div>
                    <div className="text-sm text-purple-600">Category</div>
                  </div>
                  
                  <div className="bg-yellow-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-700">
                      {formData.scheduledFor ? 'Scheduled' : 'Immediate'}
                    </div>
                    <div className="text-sm text-yellow-600">Delivery</div>
                  </div>
                </div>

                {formData.scheduledFor && (
                  <Alert>
                    <Clock className="h-4 w-4" />
                    <AlertDescription>
                      This notification will be sent at {new Date(formData.scheduledFor).toLocaleString()}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setActiveStep(2)}
                  >
                    Back to Edit
                  </Button>
                  
                  <Button
                    onClick={handleSendBulkNotification}
                    disabled={loading || sendingProgress.inProgress}
                    className="flex items-center space-x-2"
                  >
                    {loading || sendingProgress.inProgress ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send to {targets.length} Recipients</span>
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 4: Results */}
        {activeStep === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5" />
                    <span>Bulk Notification Results</span>
                  </CardTitle>
                  <CardDescription>
                    Delivery status and results for your bulk notification
                  </CardDescription>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadResults}
                    className="flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Results</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetForm}
                    className="flex items-center space-x-2"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Send Another</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Results Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-green-700">{sendingProgress.sent}</div>
                    <div className="text-sm text-green-600">Successfully Sent</div>
                  </div>
                  
                  <div className="bg-red-50 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-red-700">{sendingProgress.failed}</div>
                    <div className="text-sm text-red-600">Failed</div>
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-blue-700">
                      {((sendingProgress.sent / sendingProgress.total) * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-blue-600">Success Rate</div>
                  </div>
                </div>

                {/* Detailed Results */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b">
                    <h4 className="font-medium text-gray-900">Detailed Results</h4>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {targets.map(target => (
                      <div key={target.id} className="flex items-center justify-between p-3 border-b last:border-b-0">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{target.name}</div>
                          <div className="text-xs text-gray-500">{target.email}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={
                            target.status === 'sent' ? 'bg-green-100 text-green-800' :
                            target.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }>
                            {target.status}
                          </Badge>
                          {target.error && (
                            <div className="text-xs text-red-600 max-w-xs truncate" title={target.error}>
                              {target.error}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BulkPushNotificationForm;
