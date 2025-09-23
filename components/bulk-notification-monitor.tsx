"use client";

import React, { useState, useEffect } from 'react';
import { Card } from './modern-ui-components';
import { Bell, Users, Clock, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react';

interface BulkNotificationMonitorProps {
  notificationId: string;
  onComplete?: (results: any) => void;
}

interface NotificationStatus {
  status: 'processing' | 'completed' | 'failed';
  totalUsers: number;
  totalSubscriptions: number;
  sent: number;
  failed: number;
  progress?: {
    currentBatch: number;
    totalBatches: number;
    progress: number;
  };
  duration?: number;
  error?: string;
}

const BulkNotificationMonitor: React.FC<BulkNotificationMonitorProps> = ({
  notificationId,
  onComplete
}) => {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!notificationId) return;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/admin/notifications/status/${notificationId}`);
        const data = await response.json();
        
        if (data.success) {
          setStatus(data.status);
          
          // Stop polling if completed or failed
          if (data.status.status === 'completed' || data.status.status === 'failed') {
            setLoading(false);
            onComplete?.(data.status);
            return;
          }
        }
      } catch (error) {
        console.error('Error polling notification status:', error);
      }
    };

    // Poll every 2 seconds while processing
    const interval = setInterval(pollStatus, 2000);
    
    // Initial poll
    pollStatus();

    return () => clearInterval(interval);
  }, [notificationId, onComplete]);

  if (loading && !status) {
    return (
      <Card className="p-6">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="text-gray-600">Initializing bulk notification...</span>
        </div>
      </Card>
    );
  }

  if (!status) return null;

  const getStatusIcon = () => {
    switch (status.status) {
      case 'processing':
        return <Clock className="w-6 h-6 text-blue-600 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-6 h-6 text-red-600" />;
      default:
        return <Bell className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case 'processing':
        return 'Sending notifications...';
      case 'completed':
        return 'Bulk notification completed';
      case 'failed':
        return 'Bulk notification failed';
      default:
        return 'Unknown status';
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case 'processing':
        return 'border-blue-200 bg-blue-50';
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const progressPercentage = status.progress?.progress || 0;
  const successRate = status.totalSubscriptions > 0 
    ? Math.round((status.sent / status.totalSubscriptions) * 100) 
    : 0;

  return (
    <Card className={`p-6 border-2 ${getStatusColor()}`}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Bulk Notification Progress
              </h3>
              <p className="text-sm text-gray-600">{getStatusText()}</p>
            </div>
          </div>
          {status.status === 'processing' && (
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {progressPercentage}%
              </div>
              <div className="text-xs text-gray-500">Complete</div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {status.status === 'processing' && status.progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>
                Batch {status.progress.currentBatch} of {status.progress.totalBatches}
              </span>
              <span>{status.sent + status.failed} / {status.totalSubscriptions}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-white rounded-lg border">
            <Users className="w-5 h-5 text-gray-400 mx-auto mb-1" />
            <div className="text-lg font-semibold text-gray-900">
              {status.totalUsers.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Target Users</div>
          </div>

          <div className="text-center p-3 bg-white rounded-lg border">
            <Bell className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <div className="text-lg font-semibold text-gray-900">
              {status.totalSubscriptions.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Subscriptions</div>
          </div>

          <div className="text-center p-3 bg-white rounded-lg border">
            <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <div className="text-lg font-semibold text-green-600">
              {status.sent.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Sent</div>
          </div>

          <div className="text-center p-3 bg-white rounded-lg border">
            <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
            <div className="text-lg font-semibold text-red-600">
              {status.failed.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
        </div>

        {/* Success Rate */}
        {status.status === 'completed' && (
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-green-500" />
              <span className="font-medium text-gray-900">Success Rate</span>
            </div>
            <div className="text-xl font-bold text-green-600">
              {successRate}%
            </div>
          </div>
        )}

        {/* Duration */}
        {status.duration && (
          <div className="text-center text-sm text-gray-600">
            Completed in {Math.round(status.duration / 1000)} seconds
          </div>
        )}

        {/* Error Message */}
        {status.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-700">{status.error}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default BulkNotificationMonitor;

