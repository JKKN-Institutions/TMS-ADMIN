'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  TrendingDown,
  User,
  Calendar,
  MessageSquare,
  FileText,
  Target,
  BarChart3,
  RefreshCw,
  Bell,
  Filter
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

interface AssigneeDashboardProps {
  adminId: string;
  className?: string;
}

interface GrievanceData {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  expected_resolution_date?: string;
  resolved_at?: string;
  age_hours: number;
  is_overdue: boolean;
  response_time: number | null;
  student: {
    id: string;
    student_name: string;
    email: string;
    roll_number: string;
  } | null;
  route: {
    id: string;
    route_name: string;
    route_number: string;
  } | null;
  recent_activity: any[];
}

interface DashboardData {
  admin_info: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  summary: {
    total_grievances: number;
    open_grievances: number;
    in_progress_grievances: number;
    resolved_grievances: number;
    overdue_grievances: number;
    urgent_grievances: number;
    avg_response_time_hours: number;
    resolution_rate: number;
  };
  grievances: GrievanceData[];
  performance: {
    trend_data: any[];
    workload_comparison: any;
    priority_distribution: any;
    category_distribution: any;
    upcoming_deadlines: any[];
  };
  time_range: string;
  last_updated: string;
}

export default function EnhancedAssigneeDashboard({ adminId, className }: AssigneeDashboardProps) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedGrievance, setSelectedGrievance] = useState<GrievanceData | null>(null);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; action: string; grievance: GrievanceData | null }>({
    open: false,
    action: '',
    grievance: null
  });
  const [actionData, setActionData] = useState<any>({});
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const response = await fetch(`/api/admin/grievances/assignee-dashboard?adminId=${adminId}&timeRange=${timeRange}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      
      const result = await response.json();
      
      if (result.success) {
        setDashboardData(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch dashboard data');
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [adminId, timeRange]);

  const handleQuickAction = async (action: string, grievance: GrievanceData, data: any = {}) => {
    try {
      const response = await fetch('/api/admin/grievances/assignee-dashboard', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId,
          grievanceId: grievance.id,
          action,
          data
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update grievance');
      }

      const result = await response.json();
      
      if (result.success) {
        // Refresh dashboard data
        await fetchDashboardData();
        setActionDialog({ open: false, action: '', grievance: null });
        setActionData({});
      } else {
        throw new Error(result.error || 'Failed to update grievance');
      }
    } catch (err) {
      console.error('Action error:', err);
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

  const formatTimeAgo = (hours: number) => {
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <XCircle className="h-5 w-5 text-red-500 mr-2" />
          <p className="text-red-700">{error}</p>
        </div>
        <Button onClick={fetchDashboardData} className="mt-2" size="sm">
          Retry
        </Button>
      </div>
    );
  }

  if (!dashboardData) {
    return <div>No data available</div>;
  }

  const { admin_info, summary, grievances, performance } = dashboardData;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Grievances</h1>
          <p className="text-gray-600">Welcome back, {admin_info.name}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Today</SelectItem>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={fetchDashboardData}
            disabled={refreshing}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assigned</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_grievances}</div>
            <div className="text-xs text-muted-foreground">
              {summary.resolution_rate}% resolution rate
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {summary.open_grievances + summary.in_progress_grievances}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.open_grievances} open, {summary.in_progress_grievances} in progress
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.urgent_grievances}</div>
            <div className="text-xs text-muted-foreground">
              {summary.overdue_grievances} overdue
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {summary.avg_response_time_hours}h
            </div>
            <div className="text-xs text-muted-foreground">
              Response time
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workload Comparison */}
      {performance.workload_comparison && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Workload Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {performance.workload_comparison.my_total}
                </div>
                <div className="text-sm text-gray-600">My Total Cases</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {performance.workload_comparison.my_active}
                </div>
                <div className="text-sm text-gray-600">Active Cases</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {performance.workload_comparison.percentile}%
                </div>
                <div className="text-sm text-gray-600">vs Team Average</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grievances List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>My Grievances</span>
            <Badge variant="outline">{grievances.length} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {grievances.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No grievances assigned to you
              </div>
            ) : (
              grievances.map((grievance) => (
                <div
                  key={grievance.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedGrievance(grievance)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge className={`${getPriorityColor(grievance.priority)} text-white`}>
                          {grievance.priority}
                        </Badge>
                        <Badge className={`${getStatusColor(grievance.status)} text-white`}>
                          {grievance.status}
                        </Badge>
                        {grievance.is_overdue && (
                          <Badge className="bg-red-600 text-white">Overdue</Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{grievance.subject}</h3>
                      <p className="text-sm text-gray-600 mb-2">
                        {grievance.description.length > 100 
                          ? `${grievance.description.substring(0, 100)}...`
                          : grievance.description
                        }
                      </p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          {grievance.student?.student_name || 'Unknown'}
                        </span>
                        <span className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatTimeAgo(grievance.age_hours)}
                        </span>
                        {grievance.expected_resolution_date && (
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            Due: {new Date(grievance.expected_resolution_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {grievance.status === 'open' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAction('start_progress', grievance);
                          }}
                        >
                          Start
                        </Button>
                      )}
                      {grievance.status === 'in_progress' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionDialog({ open: true, action: 'resolve', grievance });
                          }}
                        >
                          Resolve
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionDialog({ open: true, action: 'add_note', grievance });
                        }}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === 'resolve' && 'Resolve Grievance'}
              {actionDialog.action === 'add_note' && 'Add Note'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {actionDialog.action === 'resolve' && (
              <div>
                <label className="block text-sm font-medium mb-2">Resolution Details</label>
                <Textarea
                  placeholder="Describe how the grievance was resolved..."
                  value={actionData.resolution || ''}
                  onChange={(e) => setActionData({ ...actionData, resolution: e.target.value })}
                  rows={4}
                />
              </div>
            )}
            {actionDialog.action === 'add_note' && (
              <div>
                <label className="block text-sm font-medium mb-2">Note</label>
                <Textarea
                  placeholder="Add a note or update..."
                  value={actionData.note || ''}
                  onChange={(e) => setActionData({ ...actionData, note: e.target.value })}
                  rows={3}
                />
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setActionDialog({ open: false, action: '', grievance: null })}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (actionDialog.grievance) {
                    handleQuickAction(actionDialog.action, actionDialog.grievance, actionData);
                  }
                }}
                disabled={
                  (actionDialog.action === 'resolve' && !actionData.resolution) ||
                  (actionDialog.action === 'add_note' && !actionData.note)
                }
              >
                {actionDialog.action === 'resolve' ? 'Resolve' : 'Add Note'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 