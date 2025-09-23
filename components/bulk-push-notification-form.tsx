'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Send,
  Upload,
  Users,
  FileText,
  CheckCircle,
  AlertTriangle,
  Info,
  Download,
  Eye,
  Trash2,
  Plus,
  Filter
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import toast from 'react-hot-toast';

interface BulkNotificationData {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'transport' | 'payment';
  category: 'transport' | 'payment' | 'system' | 'emergency';
  targetAudience: 'all' | 'students' | 'specific_users' | 'routes' | 'csv_upload';
  specificUsers: string[];
  routes: string[];
  csvData: any[];
  scheduledFor: string;
  sendImmediately: boolean;
}

interface BulkPushNotificationFormProps {
  adminId: string;
  className?: string;
}

const BulkPushNotificationForm: React.FC<BulkPushNotificationFormProps> = ({
  adminId,
  className = ''
}) => {
  const [loading, setLoading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [availableRoutes, setAvailableRoutes] = useState<any[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    sent: number;
    failed: number;
    inProgress: boolean;
  }>({
    total: 0,
    sent: 0,
    failed: 0,
    inProgress: false
  });

  const [formData, setFormData] = useState<BulkNotificationData>({
    title: '',
    message: '',
    type: 'info',
    category: 'system',
    targetAudience: 'all',
    specificUsers: [],
    routes: [],
    csvData: [],
    scheduledFor: '',
    sendImmediately: true
  });

  useEffect(() => {
    loadAvailableRoutes();
  }, []);

  const loadAvailableRoutes = async () => {
    try {
      const response = await fetch('/api/admin/routes?active=true');
      if (response.ok) {
        const data = await response.json();
        setAvailableRoutes(data.routes || []);
      }
    } catch (error) {
      console.error('Error loading routes:', error);
    }
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      toast.error('Please upload a valid CSV file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error('File size must be less than 5MB');
      return;
    }

    setCsvFile(file);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        toast.error('CSV file is empty');
        return;
      }

      // Parse CSV (simple implementation)
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });

      setCsvData(data);
      setCsvPreview(data.slice(0, 10)); // Show first 10 rows
      setFormData(prev => ({ ...prev, csvData: data, targetAudience: 'csv_upload' }));
      
      toast.success(`Loaded ${data.length} records from CSV`);
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast.error('Failed to parse CSV file');
    }
  };

  const handleRouteToggle = (routeId: string) => {
    setSelectedRoutes(prev => {
      const newSelected = prev.includes(routeId)
        ? prev.filter(id => id !== routeId)
        : [...prev, routeId];
      
      setFormData(prevForm => ({ ...prevForm, routes: newSelected }));
      return newSelected;
    });
  };

  const handleBulkSend = async () => {
    if (!formData.title || !formData.message) {
      toast.error('Title and message are required');
      return;
    }

    if (formData.targetAudience === 'csv_upload' && csvData.length === 0) {
      toast.error('Please upload a CSV file with user data');
      return;
    }

    if (formData.targetAudience === 'routes' && selectedRoutes.length === 0) {
      toast.error('Please select at least one route');
      return;
    }

    try {
      setLoading(true);
      setBulkProgress({ total: 0, sent: 0, failed: 0, inProgress: true });

      const response = await fetch('/api/admin/notifications/bulk-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          adminId,
          csvData: formData.targetAudience === 'csv_upload' ? csvData : [],
          routes: formData.targetAudience === 'routes' ? selectedRoutes : []
        })
      });

      const result = await response.json();

      if (result.success) {
        setBulkProgress({
          total: result.summary.total,
          sent: result.summary.sent,
          failed: result.summary.failed,
          inProgress: false
        });

        toast.success(
          `Bulk notification completed! Sent to ${result.summary.sent} out of ${result.summary.total} recipients.`
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
          csvData: [],
          scheduledFor: '',
          sendImmediately: true
        });
        setCsvFile(null);
        setCsvData([]);
        setCsvPreview([]);
        setSelectedRoutes([]);
      } else {
        toast.error(result.error || 'Failed to send bulk notifications');
        setBulkProgress(prev => ({ ...prev, inProgress: false }));
      }
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      toast.error('Failed to send bulk notifications');
      setBulkProgress(prev => ({ ...prev, inProgress: false }));
    } finally {
      setLoading(false);
    }
  };

  const downloadCsvTemplate = () => {
    const csvContent = `user_id,email,name,route_id,custom_message
student-123,john@example.com,John Doe,route-1,
student-456,jane@example.com,Jane Smith,route-2,Custom message for Jane
admin-789,admin@example.com,Admin User,,Important admin notification`;

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

  const getTargetAudienceCount = () => {
    switch (formData.targetAudience) {
      case 'csv_upload':
        return csvData.length;
      case 'routes':
        return selectedRoutes.length > 0 ? `${selectedRoutes.length} routes` : 0;
      case 'all':
        return 'All users';
      case 'students':
        return 'All students';
      default:
        return 0;
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Send className="w-5 h-5" />
            <span>Bulk Push Notifications</span>
          </CardTitle>
          <CardDescription>
            Send notifications to multiple users at once using CSV upload or route selection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Notification Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bulk-title">Title</Label>
              <Input
                id="bulk-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter notification title"
                maxLength={100}
              />
            </div>
            
            <div>
              <Label htmlFor="bulk-type">Type</Label>
              <select
                id="bulk-type"
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
            <Label htmlFor="bulk-message">Message</Label>
            <Textarea
              id="bulk-message"
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

          {/* Target Audience Selection */}
          <div>
            <Label htmlFor="bulk-audience">Target Audience</Label>
            <select
              id="bulk-audience"
              value={formData.targetAudience}
              onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Users</option>
              <option value="students">All Students</option>
              <option value="routes">Specific Routes</option>
              <option value="csv_upload">CSV Upload</option>
            </select>
          </div>

          {/* Route Selection */}
          {formData.targetAudience === 'routes' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Routes</CardTitle>
                <CardDescription>
                  Choose which routes to send notifications to
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                  {availableRoutes.map((route) => (
                    <label
                      key={route.id}
                      className="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoutes.includes(route.id)}
                        onChange={() => handleRouteToggle(route.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{route.route_number}</div>
                        <div className="text-xs text-gray-500">{route.route_name}</div>
                        <div className="text-xs text-gray-400">
                          {route.start_location} → {route.end_location}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                
                {selectedRoutes.length > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-blue-800">
                        {selectedRoutes.length} route(s) selected
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* CSV Upload */}
          {formData.targetAudience === 'csv_upload' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center space-x-2">
                  <Upload className="w-5 h-5" />
                  <span>CSV Upload</span>
                </CardTitle>
                <CardDescription>
                  Upload a CSV file with user data for bulk notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvUpload}
                      className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={downloadCsvTemplate}
                    className="flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Template</span>
                  </Button>
                </div>

                {csvFile && (
                  <Alert>
                    <FileText className="h-4 w-4" />
                    <AlertDescription>
                      Loaded: {csvFile.name} ({csvData.length} records)
                    </AlertDescription>
                  </Alert>
                )}

                {/* CSV Preview */}
                {csvPreview.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">Preview (First 10 rows)</h4>
                      <Badge variant="outline">
                        {csvData.length} total records
                      </Badge>
                    </div>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {Object.keys(csvPreview[0] || {}).map((header) => (
                              <th
                                key={header}
                                className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {csvPreview.map((row, index) => (
                            <tr key={index}>
                              {Object.values(row).map((value: any, cellIndex) => (
                                <td
                                  key={cellIndex}
                                  className="px-3 py-2 whitespace-nowrap text-sm text-gray-900"
                                >
                                  {value}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Progress Tracking */}
          {bulkProgress.inProgress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sending Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: bulkProgress.total > 0 
                          ? `${((bulkProgress.sent + bulkProgress.failed) / bulkProgress.total) * 100}%`
                          : '0%'
                      }}
                    ></div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{bulkProgress.total}</div>
                      <div className="text-sm text-gray-600">Total</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{bulkProgress.sent}</div>
                      <div className="text-sm text-gray-600">Sent</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">{bulkProgress.failed}</div>
                      <div className="text-sm text-gray-600">Failed</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center space-x-2">
                <Eye className="w-5 h-5" />
                <span>Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Target Audience:</span>
                  <span className="font-medium">{formData.targetAudience.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Recipients:</span>
                  <span className="font-medium">{getTargetAudienceCount()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <Badge className="ml-2">{formData.type}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Category:</span>
                  <Badge variant="outline">{formData.category}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Send Button */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-gray-600">
              {formData.targetAudience === 'csv_upload' && csvData.length > 0 && (
                <span>Ready to send to {csvData.length} recipients</span>
              )}
              {formData.targetAudience === 'routes' && selectedRoutes.length > 0 && (
                <span>Ready to send to {selectedRoutes.length} selected routes</span>
              )}
              {(formData.targetAudience === 'all' || formData.targetAudience === 'students') && (
                <span>Ready to send to all {formData.targetAudience}</span>
              )}
            </div>
            
            <Button
              onClick={handleBulkSend}
              disabled={loading || !formData.title || !formData.message || bulkProgress.inProgress}
              className="flex items-center space-x-2"
            >
              {loading || bulkProgress.inProgress ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Bulk Notification</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkPushNotificationForm;
