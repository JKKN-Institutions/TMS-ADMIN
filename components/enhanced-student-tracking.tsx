'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  MessageSquare,
  User,
  Calendar,
  Star,
  TrendingUp,
  FileText,
  Send,
  RefreshCw,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Info
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

interface StudentTrackingProps {
  studentId: string;
  className?: string;
}

interface ActivityItem {
  id: string;
  type: string;
  actor: string;
  description: string;
  timestamp: string;
  is_milestone: boolean;
  details: any;
}

interface GrievanceData {
  id: string;
  category: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  expected_resolution_date?: string;
  resolved_at?: string;
  assigned_to?: string;
  route_id?: string;
  driver_name?: string;
  resolution?: string;
  assignee?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  route?: {
    id: string;
    route_name: string;
    route_number: string;
  };
  status_info: {
    current_status: string;
    age_hours: number;
    age_days: number;
    is_overdue: boolean;
    expected_resolution?: string;
    resolved_at?: string;
    response_time_hours?: number;
    next_update_expected?: string;
  };
  estimated_resolution?: {
    estimated_hours: number;
    estimated_date: string;
    confidence: 'high' | 'medium' | 'low';
  };
  activity_timeline: ActivityItem[];
  status_display: string;
}

interface TrackingData {
  student_info: {
    id: string;
    student_name: string;
    email: string;
    roll_number: string;
  };
  grievances: GrievanceData[];
  statistics: {
    total_grievances: number;
    open_grievances: number;
    in_progress_grievances: number;
    resolved_grievances: number;
    overdue_grievances: number;
    avg_resolution_time: number;
    satisfaction_rating?: number;
  };
  recent_updates: any[];
  last_updated: string;
}

export default function EnhancedStudentTracking({ studentId, className }: StudentTrackingProps) {
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGrievance, setSelectedGrievance] = useState<GrievanceData | null>(null);
  const [communicationDialog, setCommunicationDialog] = useState(false);
  const [communicationType, setCommunicationType] = useState('feedback');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrackingData = async () => {
    try {
      setRefreshing(true);
      const response = await fetch(`/api/student/grievances/tracking?studentId=${studentId}&includeHistory=true`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tracking data');
      }
      
      const result = await response.json();
      
      if (result.success) {
        setTrackingData(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch tracking data');
      }
    } catch (err) {
      console.error('Tracking fetch error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrackingData();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchTrackingData, 30000);
    return () => clearInterval(interval);
  }, [studentId]);

  const handleCommunication = async () => {
    if (!selectedGrievance || !message.trim()) return;

    try {
      const response = await fetch('/api/student/grievances/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId,
          grievanceId: selectedGrievance.id,
          type: communicationType,
          message: message.trim(),
          rating: rating
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send communication');
      }

      const result = await response.json();
      
      if (result.success) {
        // Refresh tracking data
        await fetchTrackingData();
        setCommunicationDialog(false);
        setMessage('');
        setRating(null);
      } else {
        throw new Error(result.error || 'Failed to send communication');
      }
    } catch (err) {
      console.error('Communication error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500';
      case 'in_progress': return 'bg-purple-500';
      case 'resolved': return 'bg-green-500';
      case 'closed': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusProgress = (status: string) => {
    switch (status) {
      case 'open': return 25;
      case 'in_progress': return 75;
      case 'resolved': return 100;
      case 'closed': return 100;
      default: return 0;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const days = Math.floor(diffHours / 24);
    return `${days}d ago`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'grievance_created': return <FileText className="h-4 w-4 text-blue-500" />;
      case 'grievance_assigned': return <User className="h-4 w-4 text-purple-500" />;
      case 'grievance_status_changed': return <RefreshCw className="h-4 w-4 text-orange-500" />;
      case 'grievance_resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'comment_added': return <MessageSquare className="h-4 w-4 text-blue-500" />;
      default: return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading your grievances...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
          <p className="text-red-700">{error}</p>
        </div>
        <Button onClick={fetchTrackingData} className="mt-2" size="sm">
          Retry
        </Button>
      </div>
    );
  }

  if (!trackingData) {
    return <div>No data available</div>;
  }

  const { student_info, grievances, statistics } = trackingData;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Grievances</h1>
          <p className="text-gray-600">Track your submitted grievances and their progress</p>
        </div>
        <Button
          onClick={fetchTrackingData}
          disabled={refreshing}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submitted</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.total_grievances}</div>
            <div className="text-xs text-muted-foreground">
              All time submissions
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {statistics.open_grievances + statistics.in_progress_grievances}
            </div>
            <div className="text-xs text-muted-foreground">
              {statistics.open_grievances} pending, {statistics.in_progress_grievances} active
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{statistics.resolved_grievances}</div>
            <div className="text-xs text-muted-foreground">
              Successfully resolved
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Resolution</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {statistics.avg_resolution_time}h
            </div>
            <div className="text-xs text-muted-foreground">
              Average response time
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grievances List */}
      <div className="space-y-4">
        {grievances.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No grievances found</h3>
              <p className="text-gray-500">You haven't submitted any grievances yet.</p>
            </CardContent>
          </Card>
        ) : (
          grievances.map((grievance) => (
            <Card key={grievance.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge className={`${getPriorityColor(grievance.priority)} text-white`}>
                        {grievance.priority}
                      </Badge>
                      <Badge className={`${getStatusColor(grievance.status)} text-white`}>
                        {grievance.status_display}
                      </Badge>
                      {grievance.status_info.is_overdue && (
                        <Badge className="bg-red-600 text-white">Overdue</Badge>
                      )}
                    </div>
                    <CardTitle className="text-lg">{grievance.subject}</CardTitle>
                    <p className="text-gray-600 mt-1">{grievance.description}</p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedGrievance(grievance)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    {grievance.status === 'resolved' && !grievance.resolution && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedGrievance(grievance);
                          setCommunicationType('satisfaction_rating');
                          setCommunicationDialog(true);
                        }}
                      >
                        <Star className="h-4 w-4 mr-1" />
                        Rate
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress</span>
                    <span>{getStatusProgress(grievance.status)}%</span>
                  </div>
                  <Progress value={getStatusProgress(grievance.status)} className="h-2" />
                </div>

                {/* Key Information */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Category:</span>
                    <p className="font-medium">{grievance.category}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Age:</span>
                    <p className="font-medium">{grievance.status_info.age_days} days</p>
                  </div>
                  {grievance.assignee && (
                    <div>
                      <span className="text-gray-500">Assigned to:</span>
                      <p className="font-medium">{grievance.assignee.name}</p>
                    </div>
                  )}
                  {grievance.status_info.expected_resolution && (
                    <div>
                      <span className="text-gray-500">Expected resolution:</span>
                      <p className="font-medium">
                        {new Date(grievance.status_info.expected_resolution).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Estimated Resolution */}
                {grievance.estimated_resolution && grievance.status !== 'resolved' && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 text-blue-500 mr-2" />
                      <span className="text-sm font-medium text-blue-900">
                        Estimated resolution: {grievance.estimated_resolution.estimated_hours} hours
                      </span>
                      <Badge 
                        variant="outline" 
                        className="ml-2 text-blue-600 border-blue-300"
                      >
                        {grievance.estimated_resolution.confidence} confidence
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Resolution */}
                {grievance.status === 'resolved' && grievance.resolution && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <div className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                      <div>
                        <span className="text-sm font-medium text-green-900">Resolution:</span>
                        <p className="text-sm text-green-800 mt-1">{grievance.resolution}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="mt-4 flex space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedGrievance(grievance);
                      setCommunicationType('update_request');
                      setCommunicationDialog(true);
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Request Update
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedGrievance(grievance);
                      setCommunicationType('additional_info');
                      setCommunicationDialog(true);
                    }}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Add Info
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Grievance Details Dialog */}
      {selectedGrievance && (
        <Dialog open={!!selectedGrievance} onOpenChange={() => setSelectedGrievance(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedGrievance.subject}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Status and Progress */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <Badge className={`${getStatusColor(selectedGrievance.status)} text-white`}>
                    {selectedGrievance.status_display}
                  </Badge>
                  <Badge className={`${getPriorityColor(selectedGrievance.priority)} text-white`}>
                    {selectedGrievance.priority}
                  </Badge>
                </div>
                <Progress value={getStatusProgress(selectedGrievance.status)} className="h-3" />
              </div>

              {/* Description */}
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-gray-700">{selectedGrievance.description}</p>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Details</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Category:</span>
                      <span className="ml-2 font-medium">{selectedGrievance.category}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Created:</span>
                      <span className="ml-2 font-medium">
                        {new Date(selectedGrievance.created_at).toLocaleString()}
                      </span>
                    </div>
                    {selectedGrievance.route && (
                      <div>
                        <span className="text-gray-500">Route:</span>
                        <span className="ml-2 font-medium">
                          {selectedGrievance.route.route_name} ({selectedGrievance.route.route_number})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {selectedGrievance.assignee && (
                  <div>
                    <h3 className="font-semibold mb-2">Assigned To</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-500">Name:</span>
                        <span className="ml-2 font-medium">{selectedGrievance.assignee.name}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Role:</span>
                        <span className="ml-2 font-medium">{selectedGrievance.assignee.role}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Activity Timeline */}
              {selectedGrievance.activity_timeline.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Activity Timeline</h3>
                  <div className="space-y-3">
                    {selectedGrievance.activity_timeline.map((activity) => (
                      <div key={activity.id} className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{activity.description}</p>
                            <span className="text-xs text-gray-500">
                              {formatTimeAgo(activity.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">by {activity.actor}</p>
                          {activity.is_milestone && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              Milestone
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2">
                <Button
                  onClick={() => {
                    setCommunicationType('feedback');
                    setCommunicationDialog(true);
                  }}
                >
                  <MessageSquare className="h-4 w-4 mr-1" />
                  Send Message
                </Button>
                {selectedGrievance.status === 'resolved' && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCommunicationType('satisfaction_rating');
                      setCommunicationDialog(true);
                    }}
                  >
                    <Star className="h-4 w-4 mr-1" />
                    Rate Resolution
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Communication Dialog */}
      <Dialog open={communicationDialog} onOpenChange={setCommunicationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {communicationType === 'feedback' && 'Send Feedback'}
              {communicationType === 'update_request' && 'Request Update'}
              {communicationType === 'additional_info' && 'Provide Additional Information'}
              {communicationType === 'satisfaction_rating' && 'Rate Resolution'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {communicationType === 'satisfaction_rating' && (
              <div>
                <label className="block text-sm font-medium mb-2">Rating</label>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`text-2xl ${
                        rating && star <= rating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium mb-2">
                {communicationType === 'satisfaction_rating' ? 'Comments (optional)' : 'Message'}
              </label>
              <Textarea
                placeholder={
                  communicationType === 'feedback' ? 'Share your feedback...' :
                  communicationType === 'update_request' ? 'What update would you like?' :
                  communicationType === 'additional_info' ? 'Provide additional details...' :
                  'Any additional comments about the resolution...'
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCommunicationDialog(false);
                  setMessage('');
                  setRating(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCommunication}
                disabled={
                  (communicationType === 'satisfaction_rating' && !rating) ||
                  (communicationType !== 'satisfaction_rating' && !message.trim())
                }
              >
                <Send className="h-4 w-4 mr-1" />
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 